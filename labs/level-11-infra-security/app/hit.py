"""Call a URL from inside the cluster and count which pod answered. Standard library only.

  python hit.py http://api/ --count 30                          who answers, through the Service
  python hit.py "http://api/work?ms=50" --seconds 120 --concurrency 6   load for the autoscaler
"""
import argparse
import collections
import json
import threading
import time
import urllib.error
import urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("url")
ap.add_argument("--count", type=int, default=0)
ap.add_argument("--seconds", type=float, default=0)
ap.add_argument("--concurrency", type=int, default=1)
a = ap.parse_args()
seen, lock = collections.Counter(), threading.Lock()
stop_at = time.time() + a.seconds if a.seconds else None
remaining = [a.count or 10]


def one():
    try:
        with urllib.request.urlopen(a.url, timeout=5) as r:
            body = json.load(r)
            key = f"{body.get('pod', '?')} (version {body['version']})" if "version" in body else body.get("pod", "?")
    except (urllib.error.URLError, OSError) as e:
        key = f"error: {e}"
    with lock:
        seen[key] += 1


def worker():
    while True:
        if stop_at:
            if time.time() >= stop_at:
                return
        else:
            with lock:
                if remaining[0] <= 0:
                    return
                remaining[0] -= 1
        one()


t = time.time()
threads = [threading.Thread(target=worker) for _ in range(a.concurrency)]
[th.start() for th in threads]
[th.join() for th in threads]
total = sum(seen.values())
print(f"{total} requests in {time.time() - t:.1f} s")
for key, n in sorted(seen.items()):
    print(f"  {n:5}  {key}")
