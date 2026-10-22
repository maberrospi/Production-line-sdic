"""Step 8: open many connections at once; each runs a 0.5 s query, then disconnects.

  python connections.py --dsn postgresql://lab:lab@db:5432/lab --clients 150          (direct)
  python connections.py --dsn postgresql://lab:lab@pgbouncer:6432/lab --clients 500   (pooled)
"""
import argparse
import collections
import re
import threading
import time

import psycopg

ap = argparse.ArgumentParser()
ap.add_argument("--dsn", required=True)
ap.add_argument("--clients", type=int, default=150)
args = ap.parse_args()

ok, errs = 0, collections.Counter()
lock = threading.Lock()
start = threading.Barrier(args.clients)


def client():
    global ok
    start.wait()
    try:
        with psycopg.connect(args.dsn, connect_timeout=30, prepare_threshold=None) as conn:
            conn.execute("SELECT pg_sleep(0.5)")
        with lock:
            ok += 1
    except psycopg.Error as e:
        m = re.search(r"FATAL:\s+(.*)", str(e))
        with lock:
            errs[("FATAL: " + m.group(1).strip()) if m else str(e).strip().splitlines()[-1]] += 1


t = time.perf_counter()
threads = [threading.Thread(target=client) for _ in range(args.clients)]
for th in threads:
    th.start()
for th in threads:
    th.join()
target = re.sub(r"^.*@", "", args.dsn)
print(f"{args.clients} clients -> {target}")
print(f"  succeeded: {ok}   failed: {sum(errs.values())}   took {time.perf_counter() - t:.1f} s")
for msg, n in errs.most_common():
    print(f"  {n} x {msg}")
