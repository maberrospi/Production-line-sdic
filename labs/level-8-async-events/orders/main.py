"""Part C: the orders service. POST /orders?mode=dual|outbox&run=<id>  {"customer": "...", "amount_cents": 1000}

dual:   commit the order, then publish an event to the 'orders.dual' topic. Two writes, two systems.
outbox: insert the order AND an outbox row in one transaction. Debezium publishes the outbox row.

CRASH_RATE (default 0.1) of requests "die" right after the database commit, before anything else
happens: the moment a deploy restart, an out-of-memory kill or a broker timeout would hit.
"""
import json
import os
import random
import uuid
from contextlib import asynccontextmanager

from confluent_kafka import Producer
from fastapi import FastAPI, HTTPException
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

CRASH_RATE = float(os.environ.get("CRASH_RATE", "0.1"))
pool = ConnectionPool(os.environ["DATABASE_URL"], min_size=2, max_size=10, open=False)
producer = Producer({"bootstrap.servers": os.environ.get("KAFKA_BOOTSTRAP", "kafka:9092"), "enable.metrics.push": False,
                     "acks": "all", "enable.idempotence": True})


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open(wait=True, timeout=30)
    yield
    producer.flush(10)
    pool.close()


app = FastAPI(lifespan=lifespan)


class Order(BaseModel):
    customer: str
    amount_cents: int        # deliberately not validated: poison events must reach the consumer (step 8)


def crash_point():
    if random.random() < CRASH_RATE:
        raise HTTPException(500, "crashed after commit")


@app.post("/orders")
def place_order(order: Order, mode: str = "outbox", run: str = "manual"):
    order_id, event_id = str(uuid.uuid4()), str(uuid.uuid4())
    event = {"customer": order.customer, "event_id": event_id, "order_id": order_id, "amount_cents": order.amount_cents}
    if mode == "dual":
        with pool.connection() as conn:                       # write 1: the database
            conn.execute("INSERT INTO orders (id, customer, amount_cents, mode, run_id) VALUES (%s, %s, %s, 'dual', %s)",
                         (order_id, order.customer, order.amount_cents, run))
        crash_point()                                         # ...a crash here loses the event
        producer.produce("orders.dual", key=order_id, value=json.dumps(event))   # write 2: Kafka
        if producer.flush(10):
            raise HTTPException(503, "event not delivered")
        return {"order_id": order_id, "mode": mode}
    if mode == "outbox":
        with pool.connection() as conn, conn.transaction():   # ONE transaction: order + outbox row
            conn.execute("INSERT INTO orders (id, customer, amount_cents, mode, run_id) VALUES (%s, %s, %s, 'outbox', %s)",
                         (order_id, order.customer, order.amount_cents, run))
            conn.execute("INSERT INTO outbox (id, aggregatetype, aggregateid, type, payload) VALUES (%s, 'order', %s, 'OrderPlaced', %s)",
                         (event_id, order_id, Jsonb(event)))
        crash_point()                                         # a crash here loses nothing
        return {"order_id": order_id, "mode": mode}
    raise HTTPException(400, "mode must be dual or outbox")


@app.get("/health")
def health():
    return {"status": "ok"}
