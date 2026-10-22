"""Level 9: the orders service.

GET /v1/orders?offset=&limit=     old shape: {"orders": [{"id", "amount" (dollars)}]}, offset pagination,
                                  with Deprecation, Sunset and Link headers
GET /v2/orders?cursor=&limit=     new shape: {"data": [{"id", "amount_cents", ...}], "next_cursor"}
GET /limited/fixed, /limited/bucket   20 requests per 10 s, as Redis Lua scripts (step 4)
"""
import base64
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime

import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, Request, Response
from psycopg_pool import AsyncConnectionPool

pool = AsyncConnectionPool(os.environ["DATABASE_URL"], min_size=2, max_size=10, open=False)
rds = aioredis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379/0"))
MAX_LIMIT = 100


@asynccontextmanager
async def lifespan(app: FastAPI):
    await pool.open(wait=True, timeout=60)
    yield
    await pool.close()


app = FastAPI(lifespan=lifespan)
COLS = "id, customer, amount_cents, created_at"


@app.get("/v1/orders")
async def orders_v1(response: Response, offset: int = 0, limit: int = 50):
    limit = max(1, min(limit, MAX_LIMIT))
    async with pool.connection() as conn:
        cur = await conn.execute(f"SELECT {COLS} FROM orders ORDER BY created_at DESC, id DESC OFFSET %s LIMIT %s",
                                 (offset, limit))
        rows = await cur.fetchall()
    # v1 still works, but announces its retirement (RFC 9745 Deprecation, RFC 8594 Sunset)
    response.headers["Deprecation"] = "@1767225600"                   # 2026-01-01T00:00:00Z
    response.headers["Sunset"] = "Fri, 01 Jan 2027 00:00:00 GMT"
    response.headers["Link"] = '</v2/orders>; rel="successor-version"'
    return {"orders": [{"id": r[0], "customer": r[1], "amount": r[2] / 100} for r in rows],
            "next_offset": offset + len(rows)}


def encode_cursor(created_at: datetime, oid: int) -> str:
    return base64.urlsafe_b64encode(json.dumps([created_at.isoformat(), oid]).encode()).decode()


def decode_cursor(cursor: str):
    try:
        ts, oid = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        return datetime.fromisoformat(ts), int(oid)
    except Exception:
        raise HTTPException(400, "bad cursor")


@app.get("/v2/orders")
async def orders_v2(cursor: str | None = None, limit: int = 50):
    limit = max(1, min(limit, MAX_LIMIT))
    async with pool.connection() as conn:
        if cursor:
            ts, oid = decode_cursor(cursor)
            # Keyset: start right after the last row the client saw. The index jumps straight there.
            cur = await conn.execute(f"SELECT {COLS} FROM orders WHERE (created_at, id) < (%s, %s) "
                                     "ORDER BY created_at DESC, id DESC LIMIT %s", (ts, oid, limit))
        else:
            cur = await conn.execute(f"SELECT {COLS} FROM orders ORDER BY created_at DESC, id DESC LIMIT %s", (limit,))
        rows = await cur.fetchall()
    nxt = encode_cursor(rows[-1][3], rows[-1][0]) if len(rows) == limit else None
    return {"data": [{"id": r[0], "customer": r[1], "amount_cents": r[2], "created_at": r[3].isoformat()} for r in rows],
            "next_cursor": nxt}


# --- rate limiters (step 4). Both run atomically inside Redis and use Redis's clock (TIME). ---
FIXED = """
local now = tonumber(redis.call('TIME')[1])
local window = math.floor(now / tonumber(ARGV[2]))
local key = KEYS[1] .. ':' .. window
local n = redis.call('INCR', key)
if n == 1 then redis.call('EXPIRE', key, tonumber(ARGV[2])) end
local limit = tonumber(ARGV[1])
local retry = (window + 1) * tonumber(ARGV[2]) - now
if n > limit then return {0, 0, retry} end
return {1, limit - n, 0}
"""
BUCKET = """
local t = redis.call('TIME')
local now = tonumber(t[1]) + tonumber(t[2]) / 1000000
local capacity, rate = tonumber(ARGV[1]), tonumber(ARGV[2])
local state = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(state[1]) or capacity
local ts = tonumber(state[2]) or now
tokens = math.min(capacity, tokens + (now - ts) * rate)       -- refill for the time that passed
local allowed = 0
if tokens >= 1 then tokens = tokens - 1; allowed = 1 end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', KEYS[1], math.ceil(capacity / rate) * 2)
local retry = 0
if allowed == 0 then retry = math.ceil((1 - tokens) / rate) end
return {allowed, math.floor(tokens), retry}
"""
fixed_script = rds.register_script(FIXED)
bucket_script = rds.register_script(BUCKET)


@app.get("/limited/{algo}")
async def limited(algo: str, request: Request, response: Response):
    client = request.headers.get("x-client") or request.query_params.get("client", "anon")
    if algo == "fixed":
        allowed, remaining, retry = await fixed_script(keys=[f"rl:fixed:{client}"], args=[20, 10])
    elif algo == "bucket":
        allowed, remaining, retry = await bucket_script(keys=[f"rl:bucket:{client}"], args=[20, 2])
    else:
        raise HTTPException(404, "algo must be fixed or bucket")
    if not allowed:
        raise HTTPException(429, "rate limited", headers={"Retry-After": str(int(retry)), "X-RateLimit-Remaining": "0"})
    response.headers["X-RateLimit-Remaining"] = str(int(remaining))
    return {"ok": True}


@app.post("/admin/reset-limits")
async def reset_limits():
    for k in [k async for k in rds.scan_iter("rl:*")]:
        await rds.delete(k)
    return {"reset": True}
