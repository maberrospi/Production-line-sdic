"""Level 3 lab: a product catalogue with a slow database and a Redis cache.

GET  /products/{id}          straight from Postgres (100 ms of deliberate database work)
GET  /cached/products/{id}   cache-aside through Redis (step 2)
PUT  /products/{id}          change a price; ?invalidate=true also deletes the cache entry (step 3)
GET  /hot                    an "expensive report" (200 ms), cached for 5 s (step 4)
GET  /catalog                public, cacheable by the edge for 10 s (step 5)
GET  /me/cart                personal: private, no-store (step 5)
GET  /limited                fixed-window rate limit in Redis: 5 requests per 10 s (step 7)
GET  /stats, POST /stats/reset

Runs as ONE uvicorn worker with async endpoints, so the counters in STATS are exact.
"""
import asyncio
import json
import os
import time
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, Request, Response
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel

CACHE_TTL = int(os.environ.get("CACHE_TTL", "60"))
PROTECTION = os.environ.get("STAMPEDE_PROTECTION", "none")
HOT_TTL = 5            # seconds the hot report counts as fresh
HOT_HARD_TTL = 60      # with protection: how long a stale copy may still be served

pool = AsyncConnectionPool(os.environ["DATABASE_URL"], min_size=2, max_size=20, open=False)
rds = aioredis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379/0"), decode_responses=True)

STATS = {}


def reset_stats():
    STATS.update(db_queries=0, cache_hits=0, cache_misses=0, hot_recomputes=0, hot_stale_served=0,
                 catalog_origin_hits=0, since=time.time())


reset_stats()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await pool.open(wait=True, timeout=30)
    yield
    await pool.close()


app = FastAPI(lifespan=lifespan)


async def load_product(pid: int) -> dict:
    """The slow path: one query that takes ~100 ms (pg_sleep stands in for an expensive join)."""
    STATS["db_queries"] += 1
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT id, name, price_cents FROM products, pg_sleep(0.1) WHERE id = %s", (pid,))
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "no such product")
    return {"id": row[0], "name": row[1], "price_cents": row[2]}


@app.get("/products/{pid}")
async def product(pid: int, response: Response):
    t = time.perf_counter()
    p = await load_product(pid)
    response.headers["X-DB-ms"] = f"{(time.perf_counter() - t) * 1000:.0f}"
    return p


async def cached_product(pid: int) -> tuple[dict, bool]:
    """Cache-aside: look in Redis; on a miss, load from the database and store with a TTL."""
    key = f"product:{pid}"
    hit = await rds.get(key)
    if hit is not None:
        STATS["cache_hits"] += 1
        return json.loads(hit), True
    STATS["cache_misses"] += 1
    value = await load_product(pid)
    await rds.set(key, json.dumps(value), ex=CACHE_TTL)
    return value, False


@app.get("/cached/products/{pid}")
async def product_cached(pid: int, response: Response):
    t = time.perf_counter()
    value, hit = await cached_product(pid)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    response.headers["X-DB-ms"] = "0" if hit else f"{(time.perf_counter() - t) * 1000:.0f}"
    return value


class PriceChange(BaseModel):
    price_cents: int


@app.put("/products/{pid}")
async def update_product(pid: int, body: PriceChange, invalidate: bool = True):
    async with pool.connection() as conn:
        cur = await conn.execute("UPDATE products SET price_cents = %s WHERE id = %s", (body.price_cents, pid))
        if cur.rowcount == 0:
            raise HTTPException(404, "no such product")
    if invalidate:
        # Delete, don't set: the next read loads the committed value. Writing the new value into the
        # cache here races with a concurrent reader that may store an older value after us (Lesson 3.3).
        await rds.delete(f"product:{pid}")
    return {"id": pid, "price_cents": body.price_cents, "cache_invalidated": invalidate}


async def compute_report() -> dict:
    STATS["hot_recomputes"] += 1
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT count(*), avg(price_cents)::int FROM products, pg_sleep(0.2)")
        n, avg = await cur.fetchone()
    return {"products": n, "avg_price_cents": avg, "computed_at": time.time()}


@app.get("/hot")
async def hot(response: Response):
    if PROTECTION != "lock":
        # Plain cache-aside: when the entry expires, every request that arrives before it is
        # rebuilt misses too, and recomputes. That is the stampede.
        cached = await rds.get("hot:report")
        if cached:
            response.headers["X-Cache"] = "HIT"
            return json.loads(cached)
        value = await compute_report()
        await rds.set("hot:report", json.dumps(value), ex=HOT_TTL)
        response.headers["X-Cache"] = "MISS"
        return value

    # Soft and hard expiry: the stored copy carries its own "fresh until" time and lives in Redis
    # much longer. After the soft expiry, ONE request takes a lock and recomputes; the others keep
    # getting the stale copy until the new one lands (stale-while-revalidate).
    cached = await rds.get("hot:report")
    if cached:
        entry = json.loads(cached)
        if time.time() < entry["fresh_until"]:
            response.headers["X-Cache"] = "HIT"
            return entry["value"]
        if not await rds.set("hot:lock", "1", nx=True, px=5000):
            STATS["hot_stale_served"] += 1
            response.headers["X-Cache"] = "STALE"
            return entry["value"]
    else:
        # Nothing at all (first request): one request builds it, the others wait briefly.
        if not await rds.set("hot:lock", "1", nx=True, px=5000):
            for _ in range(50):
                await asyncio.sleep(0.02)
                cached = await rds.get("hot:report")
                if cached:
                    response.headers["X-Cache"] = "HIT"
                    return json.loads(cached)["value"]
    try:
        value = await compute_report()
        entry = {"value": value, "fresh_until": time.time() + HOT_TTL}
        await rds.set("hot:report", json.dumps(entry), ex=HOT_HARD_TTL)
    finally:
        await rds.delete("hot:lock")
    response.headers["X-Cache"] = "MISS"
    return value


@app.api_route("/catalog", methods=["GET", "HEAD"])
async def catalog(response: Response):
    STATS["catalog_origin_hits"] += 1
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT id, name, price_cents FROM products ORDER BY id LIMIT 20")
        rows = await cur.fetchall()
    # Anyone may cache this for 10 seconds: browsers, CDNs, our nginx edge.
    response.headers["Cache-Control"] = "public, max-age=10"
    return [{"id": r[0], "name": r[1], "price_cents": r[2]} for r in rows]


@app.api_route("/me/cart", methods=["GET", "HEAD"])
async def my_cart(response: Response):
    # Personal data: no shared cache may store it, and the browser should not keep it either.
    response.headers["Cache-Control"] = "private, no-store"
    return {"user": "alice", "items": [{"id": 42, "qty": 1}]}


@app.get("/limited")
async def limited(request: Request):
    # Fixed-window limiter: one counter per client per 10-second window, shared by every replica.
    client = request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")
    window = int(time.time() // 10)
    key = f"rl:{client}:{window}"
    count = await rds.incr(key)
    if count == 1:
        await rds.expire(key, 10)
    if count > 5:
        raise HTTPException(429, "too many requests: 5 per 10 seconds", headers={"Retry-After": str(10 - int(time.time()) % 10)})
    return {"ok": True, "used": count, "limit": 5}


@app.get("/stats")
async def stats():
    lookups = STATS["cache_hits"] + STATS["cache_misses"]
    return {**{k: v for k, v in STATS.items() if k != "since"},
            "hit_ratio": round(STATS["cache_hits"] / lookups, 2) if lookups else None,
            "seconds": round(time.time() - STATS["since"], 1),
            "stampede_protection": PROTECTION, "cache_ttl": CACHE_TTL}


@app.post("/stats/reset")
async def stats_reset():
    reset_stats()
    return {"reset": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
