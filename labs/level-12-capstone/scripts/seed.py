"""Create links directly on the app (an internal job, so the gateway's rate limit does not apply).

  python seed.py --count 10000
"""
import argparse
import asyncio
import time

import httpx

from common import APP, all_stats

ap = argparse.ArgumentParser()
ap.add_argument("--count", type=int, default=10000)
a = ap.parse_args()


async def main():
    codes, failed = [], 0
    sem = asyncio.Semaphore(50)
    async with httpx.AsyncClient(timeout=10) as c:
        async def one(i):
            nonlocal failed
            async with sem:
                r = await c.post(f"{APP}/api/links", json={"url": f"https://example.com/articles/{i}?utm_source=lab"})
                if r.status_code == 201:
                    codes.append(r.json()["code"])
                else:
                    failed += 1
        t = time.perf_counter()
        await asyncio.gather(*(one(i) for i in range(a.count)))
    print(f"created {len(codes):,} links in {time.perf_counter() - t:.1f} s ({failed} failed), for example {codes[0]}")
    s = all_stats()
    print(f"code collisions retried: {sum(x['code_collisions'] for x in s)}")


asyncio.run(main())
