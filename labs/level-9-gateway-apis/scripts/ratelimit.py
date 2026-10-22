"""Step 4: fixed window vs token bucket at a window boundary.

Both allow 20 requests per 10 s on average. Sends 20 requests just before a 10-second boundary,
20 just after, then 20 more 5 seconds later. Calls the orders service directly, so the
gateway's own limit does not interfere.
"""
import os
import time

import httpx

O = os.environ.get("ORDERS", "http://orders:8000")
c = httpx.Client(timeout=5)
c.post(f"{O}/admin/reset-limits")


def batch(algo, n=20):
    return sum(c.get(f"{O}/limited/{algo}", params={"client": "tester"}).status_code == 200 for _ in range(n))


results = {}
for algo in ("fixed", "bucket"):
    while time.time() % 10 < 8.5 or time.time() % 10 > 8.6:   # wait until 1.5 s before a boundary
        time.sleep(0.01)
    t = time.perf_counter()
    before = batch(algo)
    while time.time() % 10 > 1:                               # cross the boundary
        time.sleep(0.01)
    after = batch(algo)
    elapsed = time.perf_counter() - t
    time.sleep(5)
    later = batch(algo)
    results[algo] = (before, after, elapsed, later)

for name, algo in ((" fixed", "fixed"), ("bucket", "bucket")):
    b, af, el, la = results[algo]
    print(f"{name}: before boundary {b:2d}/20   just after {af:2d}/20   => {b + af} accepted in {el:.1f}s   |   5 s later {la:2d}/20")
