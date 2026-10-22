"""Step 3: how many users would move when going from --from shards to --to shards?"""
import argparse

from router import Ring, mod_shard

ap = argparse.ArgumentParser()
ap.add_argument("--from", dest="old", type=int, default=3)
ap.add_argument("--to", dest="new", type=int, default=4)
ap.add_argument("--users", type=int, default=100_000)
a = ap.parse_args()

old_ring, new_ring = Ring(a.old), Ring(a.new)
mod_moves = sum(mod_shard(u, a.old) != mod_shard(u, a.new) for u in range(1, a.users + 1))
ring_moves = sum(old_ring.shard_for(u) != new_ring.shard_for(u) for u in range(1, a.users + 1))
print(f" mod: {mod_moves:,} of {a.users:,} users move ({mod_moves / a.users:.0%})")
print(f"ring: {ring_moves:,} of {a.users:,} users move ({ring_moves / a.users:.0%})")
print(f"ideal: {1 - a.old / a.new:.0%} (only the new shard's fair share)")
