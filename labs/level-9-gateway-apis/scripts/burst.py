"""Step 3: send --count requests as one client, all at once or at --rate per second."""
import argparse
import collections
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

ap = argparse.ArgumentParser()
ap.add_argument("--key", default="key-alice")
ap.add_argument("--count", type=int, default=50)
ap.add_argument("--rate", type=float, default=0, help="requests per second; 0 = all at once")
a = ap.parse_args()
G = os.environ.get("GATEWAY", "http://gateway")
client = httpx.Client(headers={"X-Api-Key": a.key}, timeout=10, limits=httpx.Limits(max_connections=60))
codes = collections.Counter()
lock = threading.Lock()


def one(_):
    status = client.get(f"{G}/users/1").status_code
    with lock:
        codes[status] += 1


t = time.perf_counter()
if a.rate:
    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = []
        for i in range(a.count):
            futures.append(ex.submit(one, i))
            time.sleep(1 / a.rate)
        [f.result() for f in futures]
else:
    with ThreadPoolExecutor(max_workers=50) as ex:
        list(ex.map(one, range(a.count)))
summary = ", ".join(f"{c} x{n}" for c, n in sorted(codes.items()))
print(f"{a.count} requests as {a.key} in {time.perf_counter() - t:.1f}s: {summary}")
