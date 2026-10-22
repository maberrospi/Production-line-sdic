"""Fill Redis with N throwaway keys to watch eviction (step 6).

    docker compose exec api python fill_redis.py 50000
"""
import os
import sys

import redis

n = int(sys.argv[1]) if len(sys.argv) > 1 else 50000
r = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379/0"))
value = b"x" * 150
wrote, errors, first = 0, 0, None
pipe = r.pipeline(transaction=False)
for start in range(0, n, 500):
    for i in range(start, min(n, start + 500)):
        pipe.set(f"fill:{i}", value)
    for result in pipe.execute(raise_on_error=False):
        if isinstance(result, Exception):
            errors += 1
            first = first or str(result)
        else:
            wrote += 1
print(f"wrote {wrote} keys, errors: {errors}" + (f" (first: {first})" if first else ""))
