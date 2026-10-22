"""Part D: the shipping service consumes order events and ships each order.

  python shipping.py                                  idempotent consumer (group "shipping")
  python shipping.py --group naive --no-dedupe        trusting consumer: ships whatever it is given
  --crash-after 250 --commit-every 100                die after 250 events; offsets committed every 100

Events that cannot be processed (a negative amount) are retried 3 times, then sent to the dead-letter
topic outbox.event.order.DLQ with the error and source offset in headers.
The consumer stops after 10 seconds with nothing new. After a crash, a restarted consumer may wait up to
45 s for partitions: the dead member keeps them until its session times out.
"""
import argparse
import json
import os
import time

import psycopg
from confluent_kafka import Consumer, KafkaError, Producer

ap = argparse.ArgumentParser()
ap.add_argument("--group", default="shipping")
ap.add_argument("--no-dedupe", action="store_true")
ap.add_argument("--crash-after", type=int, default=0)
ap.add_argument("--commit-every", type=int, default=1)
a = ap.parse_args()

TOPIC, DLQ = "outbox.event.order", "outbox.event.order.DLQ"
BOOT = os.environ.get("KAFKA_BOOTSTRAP", "kafka:9092")
db = psycopg.connect(os.environ["DATABASE_URL"])
consumer = Consumer({"bootstrap.servers": BOOT, "enable.metrics.push": False, "group.id": a.group, "client.id": f"shipping-{a.group}",
                     "auto.offset.reset": "earliest", "enable.auto.commit": False})
dlq = Producer({"bootstrap.servers": BOOT, "enable.metrics.push": False, "acks": "all", "enable.idempotence": True})
stats = {"shipped": 0, "duplicate": 0, "dead-lettered": 0}


def ship(event: dict) -> str:
    if event["amount_cents"] <= 0:
        raise ValueError(f"invalid amount {event['amount_cents']}")
    with db.transaction():
        if not a.no_dedupe:
            # Claim the event ID in the same transaction as the shipment: both commit, or neither.
            seen = db.execute("INSERT INTO processed_events (event_id) VALUES (%s) ON CONFLICT DO NOTHING RETURNING event_id",
                              (event["event_id"],)).fetchone() is None
            if seen:
                return "duplicate"
        db.execute("INSERT INTO shipments (order_id) VALUES (%s)", (event["order_id"],))
    return "shipped"


assigned = False


def on_assign(c, parts):
    global assigned, last_msg
    assigned, last_msg = True, time.time()     # the idle timer starts once we own partitions
    print(f"assigned partitions {sorted(p.partition for p in parts)}", flush=True)


consumer.subscribe([TOPIC], on_assign=on_assign)
since_commit, n, last_msg, started = 0, 0, time.time(), time.time()
last_committed_at = 0
try:
    while True:
        msg = consumer.poll(1.0)
        if msg is None:
            if assigned and time.time() - last_msg > 10:
                break
            if not assigned and time.time() - started > 90:
                print("no partitions after 90 s: is another member of this group still alive?")
                break
            continue
        if msg.error():
            if msg.error().code() != KafkaError._PARTITION_EOF:
                print(f"error: {msg.error()}")
            continue
        last_msg = time.time()
        event = json.loads(msg.value())
        for attempt in range(1, 4):
            try:
                stats[ship(event)] += 1
                break
            except ValueError as err:
                if attempt == 3:
                    dlq.produce(DLQ, key=msg.key(), value=msg.value(),
                                headers=[("error", str(err)), ("source-offset", f"{msg.partition()}:{msg.offset()}")])
                    dlq.flush(10)
                    stats["dead-lettered"] += 1
                    print(f"dead-lettered order {event['order_id'][:8]} after 3 tries: {err}")
        n += 1
        since_commit += 1
        if since_commit >= a.commit_every:
            consumer.commit(asynchronous=False)
            since_commit, last_committed_at = 0, n
        if a.crash_after and n == a.crash_after:
            print(f"crashing after {n} events; offsets were last committed at event {last_committed_at}", flush=True)
            os._exit(1)          # no commit, no goodbye to the group: like kill -9
except KeyboardInterrupt:
    pass
consumer.commit(asynchronous=False) if since_commit else None
consumer.close()
print(f"this run: {stats}")
total, orders = db.execute("SELECT count(*), count(DISTINCT order_id) FROM shipments").fetchone()
dup = total - orders
print(f"shipments table: {total} shipments for {orders} orders" + (f"  <- {dup} DUPLICATE shipments" if dup else ""))
