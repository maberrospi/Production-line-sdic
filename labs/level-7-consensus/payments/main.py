"""Level 7: a payments API on an unreliable network.

POST /charges  {"order_id": "...", "amount_cents": 1999}   optional header: Idempotency-Key
LOSS_RATE (default 0.2) of responses arrive late: the charge has committed, but the reply takes
1.5 s, longer than the client's 1 s timeout. The client cannot tell that from a failure.
"""
import asyncio
import hashlib
import json
import os
import random
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Response
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel, Field

LOSS_RATE = float(os.environ.get("LOSS_RATE", "0.2"))
pool = AsyncConnectionPool(os.environ["DATABASE_URL"], min_size=2, max_size=20, open=False)

SCHEMA = """
CREATE TABLE IF NOT EXISTS charges (
    id            bigserial PRIMARY KEY,
    order_id      text NOT NULL,
    amount_cents  integer NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key           text PRIMARY KEY,
    request_hash  text NOT NULL,
    response      jsonb,
    created_at    timestamptz NOT NULL DEFAULT now()
);
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    await pool.open(wait=True, timeout=30)
    async with pool.connection() as conn:
        await conn.execute(SCHEMA)
    yield
    await pool.close()


app = FastAPI(lifespan=lifespan)


class Charge(BaseModel):
    order_id: str = Field(min_length=1, max_length=64)
    amount_cents: int = Field(gt=0)


async def unreliable_network():
    if random.random() < LOSS_RATE:
        await asyncio.sleep(1.5)       # the work is done; only the reply is late


@app.post("/charges")
async def create_charge(body: Charge, response: Response, idempotency_key: str | None = Header(default=None)):
    if idempotency_key is None:
        # No key: every request, including a retry of the same purchase, creates a new charge.
        async with pool.connection() as conn:
            cur = await conn.execute("INSERT INTO charges (order_id, amount_cents) VALUES (%s, %s) RETURNING id",
                                     (body.order_id, body.amount_cents))
            (charge_id,) = await cur.fetchone()
        await unreliable_network()
        return {"charge_id": charge_id, "order_id": body.order_id, "amount_cents": body.amount_cents}

    # With a key: claim it, charge, and store the response in ONE transaction.
    request_hash = hashlib.sha256(json.dumps(body.model_dump(), sort_keys=True).encode()).hexdigest()
    async with pool.connection() as conn:
        async with conn.transaction():
            cur = await conn.execute(
                "INSERT INTO idempotency_keys (key, request_hash) VALUES (%s, %s) "
                "ON CONFLICT (key) DO NOTHING RETURNING key", (idempotency_key, request_hash))
            claimed = await cur.fetchone()
            if claimed is None:
                # Seen before (if another request holds it, the INSERT above waited for it to commit).
                cur = await conn.execute("SELECT request_hash, response FROM idempotency_keys WHERE key = %s",
                                         (idempotency_key,))
                stored_hash, stored = await cur.fetchone()
                if stored_hash != request_hash:
                    raise HTTPException(422, "Idempotency-Key reused with a different request body")
                response.headers["Idempotent-Replayed"] = "true"
                result = stored
            else:
                cur = await conn.execute("INSERT INTO charges (order_id, amount_cents) VALUES (%s, %s) RETURNING id",
                                         (body.order_id, body.amount_cents))
                (charge_id,) = await cur.fetchone()
                result = {"charge_id": charge_id, "order_id": body.order_id, "amount_cents": body.amount_cents}
                await conn.execute("UPDATE idempotency_keys SET response = %s WHERE key = %s",
                                   (Jsonb(result), idempotency_key))
    await unreliable_network()
    return result


@app.post("/admin/reset")
async def reset():
    async with pool.connection() as conn:
        await conn.execute("TRUNCATE charges, idempotency_keys RESTART IDENTITY")
    return {"reset": True}


@app.get("/admin/stats")
async def stats():
    async with pool.connection() as conn:
        cur = await conn.execute("""
            SELECT count(*),
                   count(*) FILTER (WHERE n > 1),
                   coalesce(sum((n - 1) * amount), 0)
            FROM (SELECT order_id, count(*) AS n, min(amount_cents) AS amount FROM charges GROUP BY order_id) s""")
        orders, dup_orders, over = await cur.fetchone()
        cur = await conn.execute("SELECT count(*) FROM charges")
        (charges,) = await cur.fetchone()
    return {"charges": charges, "orders_charged": orders, "orders_charged_more_than_once": dup_orders,
            "overcharged_cents": over}


@app.get("/health")
async def health():
    return {"status": "ok"}
