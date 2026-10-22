"""Step 7: generate IDs on every shard at once, with no coordination between workers.

Snowflake layout (Twitter, 2010): 41 bits of milliseconds since an epoch | 10 bits worker | 12 bits sequence.
"""
import argparse
import datetime
import threading
import time

import psycopg

from router import dsn

EPOCH_MS = 1288834974657   # Twitter's Snowflake epoch (2010-11-04)

ap = argparse.ArgumentParser()
ap.add_argument("--workers", type=int, default=4)
ap.add_argument("--per-worker", type=int, default=5000)
a = ap.parse_args()


class Snowflake:
    def __init__(self, worker_id: int):
        assert 0 <= worker_id < 1024
        self.worker, self.last_ms, self.seq = worker_id, -1, 0

    def next_id(self) -> int:
        ms = int(time.time() * 1000)
        if ms < self.last_ms:
            raise RuntimeError("clock moved backwards: refusing to generate IDs")
        if ms == self.last_ms:
            self.seq = (self.seq + 1) & 0xFFF
            if self.seq == 0:                    # 4,096 IDs in one millisecond: wait for the next
                while ms <= self.last_ms:
                    ms = int(time.time() * 1000)
        else:
            self.seq = 0
        self.last_ms = ms
        return ((ms - EPOCH_MS) << 22) | (self.worker << 12) | self.seq


def decode(i: int) -> str:
    ms = (i >> 22) + EPOCH_MS
    t = datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc)
    return f"time {t:%H:%M:%S} UTC, worker {(i >> 12) & 0x3FF}, sequence {i & 0xFFF}"


results = {}


def worker(w: int):
    gen = Snowflake(w)
    ids = [gen.next_id() for _ in range(a.per_worker)]
    with psycopg.connect(dsn(w)) as conn:
        conn.execute("TRUNCATE id_test RESTART IDENTITY")
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO id_test (snowflake) VALUES (%s)", [(i,) for i in ids])
        local = [r[0] for r in conn.execute("SELECT local_id FROM id_test ORDER BY local_id").fetchall()]
    results[w] = (ids, local)


threads = [threading.Thread(target=worker, args=(w,)) for w in range(a.workers)]
for t in threads:
    t.start()
for t in threads:
    t.join()

snow = [i for ids, _ in results.values() for i in ids]
local = [i for _, loc in results.values() for i in loc]
print(f"{len(snow):,} IDs from {a.workers} workers")
print(f"  snowflake IDs unique:            {len(set(snow)) == len(snow)}  ({len(set(snow)):,} distinct)")
print(f"  per-shard auto-increment unique: {len(set(local)) == len(local)} ({len(set(local)):,} distinct)")
print(f"  each worker's IDs increase over time: {all(ids == sorted(ids) for ids, _ in results.values())}")
print(f"  decode {results[0][0][0]}: {decode(results[0][0][0])}")
