"""Step 6: 100,000 likes; 30% are for one celebrity (user 42). Each like increments a counter row on
the shard that owns the counter's key.

--mode plain           one counter row for the celebrity: likes:42
--mode salted --salt N N sub-counters likes:42#0 ... likes:42#N-1, picked at random per like
"""
import argparse
import collections
import random

import psycopg

from router import Ring, dsn

ap = argparse.ArgumentParser()
ap.add_argument("--mode", choices=["plain", "salted"], required=True)
ap.add_argument("--salt", type=int, default=8)
ap.add_argument("--shards", type=int, default=4)
ap.add_argument("--likes", type=int, default=100_000)
a = ap.parse_args()

ring = Ring(a.shards)
rnd = random.Random(3)
per_key = collections.Counter()
for _ in range(a.likes):
    if rnd.random() < 0.3:
        key = f"likes:42#{rnd.randrange(a.salt)}" if a.mode == "salted" else "likes:42"
    else:
        key = f"likes:{rnd.randint(1, 100_000)}"
    per_key[key] += 1

writes = collections.Counter()
by_shard = collections.defaultdict(list)
for key, n in per_key.items():
    s = ring.shard_for(key)
    writes[s] += n
    by_shard[s].append((key, n))

for s, rows in by_shard.items():           # apply the increments, batched per shard
    with psycopg.connect(dsn(s)) as conn:
        conn.execute("TRUNCATE counters")
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO counters (key, n) VALUES (%s, %s) "
                            "ON CONFLICT (key) DO UPDATE SET n = counters.n + EXCLUDED.n", rows)

# Reading the celebrity's total: one key, or every sub-key on every shard that holds one
sub_keys = ["likes:42"] if a.mode == "plain" else [f"likes:42#{i}" for i in range(a.salt)]
shards_read = {ring.shard_for(k) for k in sub_keys}
total = 0
for s in shards_read:
    with psycopg.connect(dsn(s)) as conn:
        total += conn.execute("SELECT coalesce(sum(n), 0) FROM counters WHERE key = ANY(%s)", (sub_keys,)).fetchone()[0]

label = "plain" if a.mode == "plain" else f"salt {a.salt:2d}"
cols = "   ".join(f"shard {s} {writes[s] / a.likes:5.1%}" for s in range(a.shards))
print(f"{label:<10}  {cols}   read {len(sub_keys)} key{'s' if len(sub_keys) > 1 else ''} on {len(shards_read)} shard{'s' if len(shards_read) > 1 else ''} = {total:,}")
