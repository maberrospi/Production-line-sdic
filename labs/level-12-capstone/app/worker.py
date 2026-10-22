"""Click counter: reads click events from the Redis stream "clicks" and stores them in Postgres.

A consumer group remembers what was delivered; each batch is written in one transaction and only
then acknowledged (XACK). If the worker dies in between, the events stay pending and are claimed
again on restart. Rows are keyed by the stream ID, so a replayed event is ignored: at-least-once
delivery, made idempotent by the primary key.
"""
import os
import socket
import time

import psycopg
import redis

STREAM, GROUP = "clicks", "counter"
CONSUMER = socket.gethostname()
r = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379/0"), decode_responses=True)
db = psycopg.connect(os.environ["DATABASE_URL"], autocommit=False)

while True:
    try:
        r.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
        break
    except redis.exceptions.ResponseError as e:
        if "BUSYGROUP" in str(e):
            break                                       # the group already exists
        raise
    except redis.exceptions.ConnectionError:
        print("waiting for redis…", flush=True)
        time.sleep(2)


def store(entries) -> int:
    if not entries:
        return 0
    with db.cursor() as cur:
        cur.executemany("INSERT INTO clicks (event_id, code, at) VALUES (%s, %s, to_timestamp(%s)) ON CONFLICT DO NOTHING",
                        [(eid, f["code"], float(f["at"])) for eid, f in entries])
    db.commit()                                          # first make it durable…
    r.xack(STREAM, GROUP, *[eid for eid, _ in entries])  # …then tell Redis it is done
    return len(entries)


# On start, take over events another consumer received but never acknowledged (it crashed).
claimed = r.xautoclaim(STREAM, GROUP, CONSUMER, min_idle_time=10_000, start_id="0-0", count=10_000)[1]
if claimed:
    print(f"claimed {store(claimed)} unacknowledged events from a previous worker", flush=True)

stored, last = 0, time.time()
while True:
    try:
        resp = r.xreadgroup(GROUP, CONSUMER, {STREAM: ">"}, count=1000, block=1000)
        for _, entries in resp or []:
            stored += store(entries)
    except redis.exceptions.ConnectionError:
        time.sleep(1)
        continue
    if time.time() - last >= 5:
        info = r.xinfo_groups(STREAM)[0]
        print(f"stored {stored} clicks in the last {time.time() - last:.0f} s; "
              f"stream length {r.xlen(STREAM)}, waiting to be read {info.get('lag')}, pending ack {info['pending']}", flush=True)
        stored, last = 0, time.time()
