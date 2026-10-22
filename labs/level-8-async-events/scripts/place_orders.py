"""Part C: place orders through the orders service, then check every saved order reached Kafka.

  python place_orders.py --mode dual --count 500
  python place_orders.py --mode outbox --count 500 [--poison 3]
"""
import argparse
import json
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import httpx
import psycopg
from confluent_kafka import Consumer, TopicPartition

ap = argparse.ArgumentParser()
ap.add_argument("--mode", choices=["dual", "outbox"], required=True)
ap.add_argument("--count", type=int, default=500)
ap.add_argument("--poison", type=int, default=0, help="this many orders get an invalid (negative) amount")
a = ap.parse_args()

URL = os.environ.get("ORDERS_URL", "http://orders:8000")
TOPIC = "orders.dual" if a.mode == "dual" else "outbox.event.order"
run = uuid.uuid4().hex[:8]
poison_at = {int(a.count * (k + 1) / (a.poison + 1)) for k in range(a.poison)}


def place(i):
    body = {"customer": f"customer-{i % 6}", "amount_cents": -100 if i in poison_at else 1000 + 7 * i}
    return httpx.post(f"{URL}/orders", params={"mode": a.mode, "run": run}, json=body, timeout=15).status_code


with ThreadPoolExecutor(max_workers=10) as ex:
    codes = list(ex.map(place, range(a.count)))
crashed = sum(c == 500 for c in codes)

with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    saved = {str(r[0]) for r in conn.execute("SELECT id FROM orders WHERE run_id = %s", (run,)).fetchall()}


def published_order_ids():
    """Read the whole topic from the beginning and collect order IDs (no consumer group involved)."""
    c = Consumer({"bootstrap.servers": os.environ.get("KAFKA_BOOTSTRAP", "kafka:9092"), "enable.metrics.push": False, "group.id": f"check-{run}",
                  "enable.auto.commit": False})
    meta = c.list_topics(TOPIC, timeout=10).topics.get(TOPIC)
    if meta is None or meta.error is not None:
        c.close()
        return set()
    parts = [TopicPartition(TOPIC, p, 0) for p in meta.partitions]
    ends = {p.partition: c.get_watermark_offsets(p, timeout=10)[1] for p in parts}
    c.assign(parts)
    ids, todo = set(), {p for p, end in ends.items() if end > 0}
    while todo:
        msg = c.poll(2.0)
        if msg is None:
            break
        if msg.error():
            continue
        ids.add(json.loads(msg.value())["order_id"])
        if msg.offset() + 1 >= ends[msg.partition()]:
            todo.discard(msg.partition())
    c.close()
    return ids


# Debezium publishes asynchronously: give it a few seconds to catch up.
deadline = time.time() + (30 if a.mode == "outbox" else 3)
while True:
    heard = saved & published_order_ids()
    if len(heard) >= len(saved) or time.time() > deadline:
        break
    time.sleep(2)

print(f"mode: {a.mode}")
print(f"  requests: {a.count}   'crashed' after commit: {crashed}")
print(f"  orders saved in Postgres:  {len(saved)}")
print(f"  events in '{TOPIC}': {len(heard)}")
print(f"  orders nobody else heard about: {len(saved) - len(heard)}")
