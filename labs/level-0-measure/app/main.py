"""Level 0 lab service: endpoints with different latency profiles.

/fast   no I/O at all
/db     one indexed Postgres lookup
/tail   usually fast, ~2% of requests take 0.5-1.0 s (a long tail)
/work   ~20 ms of pure CPU per request (to find the saturation point)
"""
import hashlib
import os
import random
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from psycopg_pool import ConnectionPool

DATABASE_URL = os.environ["DATABASE_URL"]
pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=10, open=False)


def seed() -> None:
    """Create and fill the items table once. Safe with several workers starting together."""
    with pool.connection() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(42)")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS items (id serial PRIMARY KEY, name text NOT NULL, price_cents int NOT NULL)"
        )
        (count,) = conn.execute("SELECT count(*) FROM items").fetchone()
        if count == 0:
            conn.execute(
                "INSERT INTO items (name, price_cents) "
                "SELECT 'item-' || g, (random() * 10000)::int FROM generate_series(1, 10000) g"
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open(wait=True, timeout=30)
    seed()
    yield
    pool.close()


app = FastAPI(lifespan=lifespan)


@app.middleware("http")
async def server_timing(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000
    response.headers["Server-Timing"] = f"app;dur={ms:.1f}"
    return response


@app.get("/health")
def health():
    try:
        with pool.connection(timeout=2) as conn:
            conn.execute("SELECT 1")
        return {"status": "ok", "db": True}
    except Exception:
        return {"status": "degraded", "db": False}


@app.get("/fast")
def fast():
    return {"ok": True}


@app.get("/db")
def by_id():
    item_id = random.randint(1, 10000)
    with pool.connection() as conn:
        row = conn.execute("SELECT id, name, price_cents FROM items WHERE id = %s", (item_id,)).fetchone()
    return {"id": row[0], "name": row[1], "price_cents": row[2]}


@app.get("/tail")
def tail():
    if random.random() < 0.02:
        time.sleep(random.uniform(0.5, 1.0))  # a lock wait, a cold cache, a GC pause...
    else:
        time.sleep(random.uniform(0.001, 0.005))
    return {"ok": True}


@app.get("/work")
def work():
    # Burn ~20 ms of CPU *time* for this thread. Sync endpoints run in a thread pool, but
    # Python's global interpreter lock (GIL) lets only one thread run Python code at a time,
    # so one worker process can finish at most ~1 / 0.020 = 50 of these per second.
    deadline = time.thread_time() + 0.020
    h = b"seed"
    while time.thread_time() < deadline:
        h = hashlib.sha256(h).digest()
    return {"digest": h.hex()[:16]}
