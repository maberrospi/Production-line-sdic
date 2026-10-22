"""Part B: produce keyed messages to the 'orders' topic.

Six customers take turns: customer-1, customer-2, ... customer-6, customer-1, ...
The key decides the partition: murmur2(key) mod partitions, exactly like Kafka's Java client.

  python produce.py --count 30 --show       print where every message landed
  python produce.py --count 10000
"""
import argparse
import collections
import json
import os

from confluent_kafka import Producer

ap = argparse.ArgumentParser()
ap.add_argument("--count", type=int, default=30)
ap.add_argument("--topic", default="orders")
ap.add_argument("--show", action="store_true")
a = ap.parse_args()

producer = Producer({
    "bootstrap.servers": os.environ.get("KAFKA_BOOTSTRAP", "kafka:9092"), "enable.metrics.push": False,
    "acks": "all",                    # a write counts only once the broker has stored it
    "enable.idempotence": True,       # the broker drops duplicates caused by the producer's own retries
    "partitioner": "murmur2_random",  # the Java client's hash, so partitions match every other Kafka client
    "linger.ms": 5,
})
where = collections.defaultdict(set)
counts = collections.Counter()
delivered = []


def report(err, msg):
    if err:
        print(f"  delivery failed: {err}")
        return
    key = msg.key().decode()
    where[key].add(msg.partition())
    counts[key] += 1
    delivered.append((json.loads(msg.value())["seq"], key, msg.partition(), msg.offset()))


for seq in range(a.count):
    key = f"customer-{seq % 6 + 1}"
    producer.produce(a.topic, key=key, value=json.dumps({"seq": seq, "customer": key}), on_delivery=report)
    producer.poll(0)
producer.flush(30)

if a.show:
    for seq, key, p, off in sorted(delivered):
        print(f"  seq {seq:3d}  {key}  -> partition {p}, offset {off}")
    for key in sorted(where, key=lambda k: int(k.split("-")[1])):
        print(f"  {key}  -> partition(s) {sorted(where[key])}  ({counts[key]} messages)")
print(f"produced {len(delivered):,} messages to '{a.topic}'")
