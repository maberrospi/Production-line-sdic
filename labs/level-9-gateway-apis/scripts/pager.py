"""Step 6: read 20 pages of 50 newest-first orders while a writer inserts ~50 orders per second."""
import argparse
import collections
import os
import threading
import time

import httpx
import psycopg

ap = argparse.ArgumentParser()
ap.add_argument("--version", choices=["v1", "v2"], required=True)
a = ap.parse_args()
G = os.environ.get("GATEWAY", "http://gateway")
stop = threading.Event()
inserted = 0


def writer():
    global inserted
    with psycopg.connect(os.environ.get("DATABASE_URL", "postgresql://lab:lab@db:5432/lab"), autocommit=True) as db:
        while not stop.is_set():
            db.execute("INSERT INTO orders (customer, amount_cents) VALUES ('new-customer', 999)")
            inserted += 1
            time.sleep(0.02)


threading.Thread(target=writer, daemon=True).start()
time.sleep(0.2)
start_count = inserted
c = httpx.Client(headers={"X-Api-Key": "key-bob"}, timeout=10)
seen, offset, cursor = [], 0, None
for page in range(20):
    if a.version == "v1":
        body = c.get(f"{G}/v1/orders", params={"offset": offset, "limit": 50}).json()
        rows = body["orders"]
        offset = body["next_offset"]
    else:
        params = {"limit": 50, **({"cursor": cursor} if cursor else {})}
        body = c.get(f"{G}/v2/orders", params=params).json()
        rows, cursor = body["data"], body["next_cursor"]
    seen += [r["id"] for r in rows]
    time.sleep(0.1)                      # the user reads the page, then scrolls
stop.set()
dups = sum(n - 1 for n in collections.Counter(seen).values() if n > 1)
print(f"{a.version}: read {len(seen)} rows over 20 pages while {inserted - start_count} new orders arrived")
print(f"  duplicates (same order shown twice): {dups}")
print(f"  distinct orders seen: {len(set(seen))}  (the first {len(seen)} rows of the list, minus repeats)")
