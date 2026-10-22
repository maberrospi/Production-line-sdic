"""Part B: one member of a consumer group. Run several copies with the same --group.

  python consume.py --group billing --name A            print every message, run until Ctrl-C
  python consume.py --group billing --name A --quiet    print progress, stop after 10 s with nothing new
"""
import argparse
import json
import os
import signal
import time

from confluent_kafka import Consumer, KafkaError

ap = argparse.ArgumentParser()
ap.add_argument("--group", required=True)
ap.add_argument("--name", required=True)
ap.add_argument("--topic", default="orders")
ap.add_argument("--quiet", action="store_true")
a = ap.parse_args()
tag = f"[{a.name}]"

consumer = Consumer({
    "bootstrap.servers": os.environ.get("KAFKA_BOOTSTRAP", "kafka:9092"), "enable.metrics.push": False,
    "group.id": a.group,
    "client.id": f"consumer-{a.name}",
    "auto.offset.reset": "earliest",      # a brand-new group starts at the beginning of the topic
    "enable.auto.commit": False,          # we commit ourselves, after processing (at-least-once)
    "partition.assignment.strategy": "range",
})


def on_assign(c, parts):
    ps = sorted(p.partition for p in parts)
    print(f"{tag} assigned partitions {ps if ps else 'none (idle)'}", flush=True)


def on_revoke(c, parts):
    ps = sorted(p.partition for p in parts)
    if ps:
        print(f"{tag} rebalance: giving up {ps}", flush=True)


def stop(*_):
    raise KeyboardInterrupt          # docker stop (SIGTERM) leaves the group cleanly, like Ctrl-C


signal.signal(signal.SIGTERM, stop)
consumer.subscribe([a.topic], on_assign=on_assign, on_revoke=on_revoke)
processed, last_msg, last_report = 0, time.time(), time.time()
try:
    while True:
        msg = consumer.poll(1.0)
        if msg is None:
            if a.quiet and processed and time.time() - last_msg > 10:
                break
            continue
        if msg.error():
            if msg.error().code() != KafkaError._PARTITION_EOF:
                print(f"{tag} error: {msg.error()}")
            continue
        value = json.loads(msg.value())
        if not a.quiet:
            print(f"{tag} p{msg.partition()} offset {msg.offset():5d}  {msg.key().decode()}  seq {value['seq']}", flush=True)
        consumer.commit(message=msg, asynchronous=False)   # one commit per message: simple, and slow
        processed += 1
        last_msg = time.time()
        if a.quiet and time.time() - last_report > 2:
            print(f"{tag} processed {processed:,} so far", flush=True)
            last_report = time.time()
except KeyboardInterrupt:
    pass
finally:
    consumer.close()                      # leave the group now, instead of waiting for a session timeout
    print(f"{tag} stopped after {processed:,} messages")
