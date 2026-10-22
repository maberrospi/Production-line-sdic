"""Step 7: fill a tiny code space and watch random codes collide.

Run with the app restarted on CODE_LEN=2 (62^2 = 3,844 possible codes).
  python collisions.py --count 3000
"""
import argparse
import math

import httpx

from common import APP, all_stats, reset_stats

ap = argparse.ArgumentParser()
ap.add_argument("--count", type=int, default=3000)
a = ap.parse_args()
space = 62 ** 2
reset_stats()
created = failed = 0
print(f"code space: {space:,} codes")
print(f"{'links':>6}  {'full':>5}  {'retries so far':>14}  {'failed (5 tries)':>16}")
with httpx.Client(timeout=10) as c:
    for i in range(1, a.count + 1):
        r = c.post(f"{APP}/api/links", json={"url": f"https://example.com/{i}"})
        created += r.status_code == 201
        failed += r.status_code == 503
        if i % 500 == 0:
            retries = sum(s["code_collisions"] for s in all_stats())
            print(f"{i:>6}  {created / space:>5.0%}  {retries:>14,}  {failed:>16,}")
n = 10_000_000
print(f"\nbirthday estimate for 7-character codes: after {n:,} links, P(at least one collision so far) "
      f"= {1 - math.exp(-n * (n - 1) / (2 * 62 ** 7)):.1%}; P(the next insert collides) = {n / 62 ** 7:.6%}")
