"""A tiny shard router: a stable hash, modulo placement, and a consistent-hashing ring."""
import bisect
import hashlib
import os

VNODES = 64   # points on the ring per shard


def stable_hash(key) -> int:
    # Python's hash() changes every time Python starts; a shard function must never change.
    return int.from_bytes(hashlib.blake2b(str(key).encode(), digest_size=8).digest(), "big")


def mod_shard(key, n_shards: int) -> int:
    return stable_hash(key) % n_shards


class Ring:
    def __init__(self, n_shards: int, vnodes: int = VNODES):
        points = sorted((stable_hash(f"shard-{s}-vnode-{v}"), s) for s in range(n_shards) for v in range(vnodes))
        self.hashes = [h for h, _ in points]
        self.shards = [s for _, s in points]

    def shard_for(self, key) -> int:
        # The first ring point clockwise from the key's hash owns the key (wrapping at the end).
        i = bisect.bisect_right(self.hashes, stable_hash(key)) % len(self.hashes)
        return self.shards[i]


def dsn(shard: int) -> str:
    return os.environ.get("SHARD_DSN", "postgresql://postgres:postgres@shard{n}:5432/app").format(n=shard)


if __name__ == "__main__":
    ring = Ring(3)
    for user in (1, 2, 3, 42, 1000):
        print(f"user {user:5d} -> shard {ring.shard_for(user)}   (modulo would say shard {mod_shard(user, 3)})")
