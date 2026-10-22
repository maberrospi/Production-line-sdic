"""Step 7: an old mobile app, written against v1: expects "orders" and "amount" in dollars."""
import argparse
import os

import httpx

ap = argparse.ArgumentParser()
ap.add_argument("--path", default="/v1/orders")
a = ap.parse_args()
G = os.environ.get("GATEWAY", "http://gateway")
r = httpx.get(G + a.path, params={"limit": 3}, headers={"X-Api-Key": "key-alice"}, timeout=10)
for h in ("Deprecation", "Sunset", "Link"):
    if h in r.headers:
        print(f"  {h}: {r.headers[h]}")
try:
    for order in r.json()["orders"]:
        print(f"  order {order['id']}: ${order['amount']:.2f}")
    print("app works")
except KeyError as e:
    print(f"app crashed: KeyError {e}")
