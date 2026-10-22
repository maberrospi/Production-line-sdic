"""Step 5: a single-shard lookup vs a scatter-gather 'top 10 users by points' across every shard.

--slow-shard N makes shard N take an extra 300 ms on 10% of its queries (a sick disk, a GC pause...).
"""
import argparse
import random
import statistics
import time
from concurrent.futures import ThreadPoolExecutor

import psycopg

from router import Ring, dsn

ap = argparse.ArgumentParser()
ap.add_argument("--shards", type=int, default=4)
ap.add_argument("--slow-shard", type=int, default=None)
ap.add_argument("--runs", type=int, default=200)
a = ap.parse_args()

ring = Ring(a.shards)
conns = {s: psycopg.connect(dsn(s), autocommit=True) for s in range(a.shards)}
rnd = random.Random(1)
pool = ThreadPoolExecutor(max_workers=a.shards)


def query(shard, sql, params=()):
    if shard == a.slow_shard and rnd.random() < 0.1:
        conns[shard].execute("SELECT pg_sleep(0.3)")
    return conns[shard].execute(sql, params).fetchall()


def p95(xs):
    return sorted(xs)[int(0.95 * len(xs))]


single, scatter = [], []
for _ in range(a.runs):
    uid = rnd.randint(1, 100_000)
    t = time.perf_counter()
    query(ring.shard_for(uid), "SELECT id, name, points FROM users WHERE id = %s", (uid,))
    single.append((time.perf_counter() - t) * 1000)

    t = time.perf_counter()
    parts = pool.map(lambda s: query(s, "SELECT id, points FROM users ORDER BY points DESC LIMIT 10"), range(a.shards))
    top10 = sorted((row for part in parts for row in part), key=lambda r: -r[1])[:10]   # merge
    scatter.append((time.perf_counter() - t) * 1000)

if a.slow_shard is not None:
    print(f"with shard {a.slow_shard} sometimes slow:")
print(f"single-shard lookup (1 of {a.shards} shards):  median {statistics.median(single):6.1f} ms   p95 {p95(single):6.1f} ms")
print(f"scatter-gather top 10 ({a.shards} shards):     median {statistics.median(scatter):6.1f} ms   p95 {p95(scatter):6.1f} ms")
print(f"top user overall: id {top10[0][0]} with {top10[0][1]:,} points")
