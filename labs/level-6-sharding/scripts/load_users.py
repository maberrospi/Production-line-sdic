"""Step 2: load 100,000 users onto 3 shards with modulo or ring placement, and report the balance."""
import argparse
import random

import psycopg

from router import Ring, dsn, mod_shard

ap = argparse.ArgumentParser()
ap.add_argument("--strategy", choices=["mod", "ring"], required=True)
ap.add_argument("--shards", type=int, default=3)
ap.add_argument("--users", type=int, default=100_000)
args = ap.parse_args()

ring = Ring(args.shards)
place = (lambda k: mod_shard(k, args.shards)) if args.strategy == "mod" else ring.shard_for
rnd = random.Random(7)
rows = {s: [] for s in range(args.shards)}
for uid in range(1, args.users + 1):
    rows[place(uid)].append((uid, f"user-{uid}", rnd.randint(0, 1_000_000)))

for s, batch in rows.items():
    with psycopg.connect(dsn(s)) as conn:
        conn.execute("TRUNCATE users")
        with conn.cursor().copy("COPY users (id, name, points) FROM STDIN") as cp:   # bulk load
            for r in batch:
                cp.write_row(r)

counts = [len(rows[s]) for s in range(args.shards)]
avg = sum(counts) / len(counts)
cols = "   ".join(f"shard {s}: {c:,}" for s, c in enumerate(counts))
print(f"{args.strategy + ':':6} {cols}   most loaded / average = {max(counts) / avg:.3f}")
