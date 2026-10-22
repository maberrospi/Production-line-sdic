"""shortener: create short links, redirect, count clicks. The reference design for the capstone.

POST /api/links            {"url": "https://…"}  ->  201 {"code", "short_url"}
GET  /{code}               302 to the URL. Cache-aside in Redis; a click event goes to a Redis stream.
GET  /api/links/{code}     the link and its click count (counted by the worker, asynchronously)
GET  /internal/codes?n=    codes for load tests (the gateway does not route /internal/)
GET  /internal/stats       this instance's counters;  POST /internal/stats/reset

Redis is an optimisation, never a dependency: if it is down, redirects read Postgres and click
events are dropped (and counted). Availability of redirects beats completeness of analytics.
"""
import os
import secrets
import socket
import string
import time
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import RedirectResponse
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel
from redis.exceptions import RedisError

ALPHABET = string.ascii_letters + string.digits          # base62
CODE_LEN = int(os.environ.get("CODE_LEN", "7"))           # 62^7 = 3.5 trillion codes
BASE_URL = os.environ.get("BASE_URL", "http://localhost:8090")
CACHE_TTL = int(os.environ.get("CACHE_TTL", "3600"))
NOT_FOUND_TTL = 60                                        # remember misses briefly, so scans of random codes stay off the database
MAX_TRIES = 5
NAME = socket.gethostname()

pool = AsyncConnectionPool(os.environ["DATABASE_URL"], min_size=2, max_size=10, open=False)
# Short timeouts: a slow Redis must cost milliseconds, not seconds, on every redirect.
rds = aioredis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379/0"), decode_responses=True,
                        socket_timeout=0.2, socket_connect_timeout=0.2)
STATS: dict = {}


def reset_stats():
    STATS.update(instance=NAME, redirects=0, cache_hits=0, cache_misses=0, db_reads=0, redis_errors=0,
                 clicks_dropped=0, links_created=0, code_collisions=0, since=round(time.time()))


reset_stats()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await pool.open(wait=True, timeout=30)
    yield
    await pool.close()


app = FastAPI(lifespan=lifespan)


class NewLink(BaseModel):
    url: str


def valid_destination(url: str) -> bool:
    """Only absolute http(s) URLs with a host, not too long, and not pointing back at us (loops)."""
    if len(url) > 2048:
        return False
    parts = urlsplit(url)
    return parts.scheme in ("http", "https") and bool(parts.hostname) and not url.startswith(BASE_URL)


@app.post("/api/links", status_code=201)
async def create(link: NewLink):
    if not valid_destination(link.url):
        raise HTTPException(422, "url must be an absolute http(s) URL of at most 2048 characters")
    async with pool.connection() as conn:
        for _ in range(MAX_TRIES):
            code = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LEN))
            # The unique primary key is the collision check: no read-then-write race.
            cur = await conn.execute("INSERT INTO links (code, url) VALUES (%s, %s) ON CONFLICT (code) DO NOTHING RETURNING code",
                                     (code, link.url))
            if await cur.fetchone():
                STATS["links_created"] += 1
                return {"code": code, "short_url": f"{BASE_URL}/{code}"}
            STATS["code_collisions"] += 1
    raise HTTPException(503, f"no free code after {MAX_TRIES} tries: the code space is too full")


async def lookup(code: str) -> str | None:
    """Cache-aside: Redis first; on a miss, Postgres, then remember the answer (including 'no such code')."""
    try:
        cached = await rds.get(f"link:{code}")
        if cached is not None:
            STATS["cache_hits"] += 1
            return cached or None                      # "" means "known not to exist"
        STATS["cache_misses"] += 1
    except RedisError:
        STATS["redis_errors"] += 1
        cached = None
    STATS["db_reads"] += 1
    async with pool.connection() as conn:
        row = await (await conn.execute("SELECT url FROM links WHERE code = %s", (code,))).fetchone()
    url = row[0] if row else None
    try:
        await rds.set(f"link:{code}", url or "", ex=CACHE_TTL if url else NOT_FOUND_TTL)
    except RedisError:
        STATS["redis_errors"] += 1
    return url


@app.get("/{code}")
async def redirect(code: str):
    if len(code) != CODE_LEN or any(c not in ALPHABET for c in code):
        raise HTTPException(404, "no such link")
    url = await lookup(code)
    if url is None:
        raise HTTPException(404, "no such link")
    STATS["redirects"] += 1
    try:
        # One small append; the worker counts it later. Capped so a stalled worker cannot fill Redis.
        await rds.xadd("clicks", {"code": code, "at": f"{time.time():.3f}"}, maxlen=1_000_000, approximate=True)
    except RedisError:
        STATS["clicks_dropped"] += 1
    # 302, not 301: browsers cache a 301, so later clicks would never reach us (RFC 9110).
    return RedirectResponse(url, status_code=302, headers={"Cache-Control": "no-store"})


@app.get("/api/links/{code}")
async def details(code: str):
    async with pool.connection() as conn:
        row = await (await conn.execute(
            "SELECT l.url, l.created_at, (SELECT count(*) FROM clicks c WHERE c.code = l.code) FROM links l WHERE l.code = %s",
            (code,))).fetchone()
    if not row:
        raise HTTPException(404, "no such link")
    return {"code": code, "url": row[0], "created_at": row[1].isoformat(timespec="seconds"), "clicks_counted": row[2]}


@app.get("/internal/codes")
async def codes(n: int = 1000):
    async with pool.connection() as conn:
        rows = await (await conn.execute("SELECT code FROM links ORDER BY created_at, code LIMIT %s", (n,))).fetchall()
    return [r[0] for r in rows]


@app.get("/internal/stats")
async def stats():
    return STATS


@app.post("/internal/stats/reset")
async def stats_reset(response: Response):
    reset_stats()
    return STATS


@app.get("/internal/health")
async def health():
    return {"ok": True}
