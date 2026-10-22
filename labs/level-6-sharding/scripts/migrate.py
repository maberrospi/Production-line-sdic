"""Step 4: move users to their owner on the bigger ring: copy a batch, verify it arrived, then delete.

There is no transaction spanning two databases, so the order matters: a crash after copying leaves
harmless duplicates (rerunning skips rows already copied); deleting first could lose users.
"""
import argparse
import time

import psycopg

from router import Ring, dsn

ap = argparse.ArgumentParser()
ap.add_argument("--from", dest="old", type=int, default=3)
ap.add_argument("--to", dest="new", type=int, default=4)
ap.add_argument("--batch", type=int, default=2000)
a = ap.parse_args()

ring = Ring(a.new)
conns = {s: psycopg.connect(dsn(s), autocommit=True) for s in range(a.new)}
t, total_moved = time.perf_counter(), 0

for src in range(a.old):
    ids = [r[0] for r in conns[src].execute("SELECT id FROM users ORDER BY id").fetchall()]
    moving = {}
    for uid in ids:
        dst = ring.shard_for(uid)
        if dst != src:
            moving.setdefault(dst, []).append(uid)
    for dst, uids in moving.items():
        for i in range(0, len(uids), a.batch):
            batch = uids[i:i + a.batch]
            rows = conns[src].execute("SELECT id, name, points FROM users WHERE id = ANY(%s)", (batch,)).fetchall()
            with conns[dst].cursor() as cur:                                     # 1. copy
                cur.executemany("INSERT INTO users (id, name, points) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING", rows)
            (arrived,) = conns[dst].execute("SELECT count(*) FROM users WHERE id = ANY(%s)", (batch,)).fetchone()
            if arrived != len(batch):                                            # 2. verify
                raise SystemExit(f"only {arrived} of {len(batch)} rows reached shard {dst}; nothing deleted")
            conns[src].execute("DELETE FROM users WHERE id = ANY(%s)", (batch,))  # 3. delete
        print(f"  shard {src} -> shard {dst}: moved {len(uids):,} users")
        total_moved += len(uids)

grand = 0
for s in range(a.new):
    ids = [r[0] for r in conns[s].execute("SELECT id FROM users").fetchall()]
    misplaced = sum(ring.shard_for(u) != s for u in ids)
    grand += len(ids)
    print(f"  shard {s}: {len(ids):,} users, misplaced: {misplaced}")
print(f"moved {total_moved:,} users in {time.perf_counter() - t:.1f} s; total now {grand:,}")
