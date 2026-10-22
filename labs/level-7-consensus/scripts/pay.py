"""Step 7: buy --orders things through the unreliable payments API, with or without idempotency keys.

  python pay.py --orders 200 --retries 0     never retry (at-most-once)
  python pay.py --orders 200                 retry up to 3 times, no key (at-least-once)
  python pay.py --orders 200 --keys          retry with one key per order (effectively once)
  python pay.py --misuse                     the same key with two different bodies
"""
import argparse
import os
import random
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import httpx

URL = os.environ.get("PAYMENTS_URL", "http://payments:8000")
ap = argparse.ArgumentParser()
ap.add_argument("--orders", type=int, default=200)
ap.add_argument("--retries", type=int, default=3)
ap.add_argument("--keys", action="store_true")
ap.add_argument("--misuse", action="store_true")
a = ap.parse_args()

client = httpx.Client(base_url=URL, timeout=1.0)   # the client gives up after 1 second

if a.misuse:
    key = str(uuid.uuid4())
    body = {"order_id": "order-misuse", "amount_cents": 1000}
    first = httpx.post(f"{URL}/charges", json=body, headers={"Idempotency-Key": key}, timeout=5)
    again = httpx.post(f"{URL}/charges", json=body, headers={"Idempotency-Key": key}, timeout=5)
    other = httpx.post(f"{URL}/charges", json={**body, "amount_cents": 99999}, headers={"Idempotency-Key": key}, timeout=5)
    print(f"first request:                {first.status_code} {first.json()}")
    print(f"same key, same body:          {again.status_code} {again.json()}  Idempotent-Replayed={again.headers.get('idempotent-replayed')}")
    print(f"same key, different amount:   {other.status_code} {other.json()['detail']}")
    raise SystemExit

client.post("/admin/reset")
rnd = random.Random()
attempts = retries = succeeded = replayed = 0
lock = threading.Lock()


def buy(i: int):
    global attempts, retries, succeeded, replayed
    body = {"order_id": f"order-{i}", "amount_cents": rnd.randint(500, 6000)}
    headers = {"Idempotency-Key": str(uuid.uuid4())} if a.keys else {}   # ONE key per order, reused on retries
    for attempt in range(a.retries + 1):
        with lock:
            attempts += 1
            retries += attempt > 0
        try:
            r = client.post("/charges", json=body, headers=headers)
            if r.status_code == 200:
                with lock:
                    succeeded += 1
                    replayed += r.headers.get("idempotent-replayed") == "true"
                return
        except httpx.TimeoutException:
            pass      # did the charge happen? the client cannot know


with ThreadPoolExecutor(max_workers=20) as ex:
    list(ex.map(buy, range(a.orders)))

s = client.get("/admin/stats").json()
mode = "WITH idempotency keys" if a.keys else "no idempotency keys" + (", --retries 0" if a.retries == 0 else "")
print(f"mode: {mode}")
print(f"  HTTP attempts sent (incl. retries): {attempts}   retries: {retries}")
print(f"  client saw success for:             {succeeded} orders" + (f"   replayed responses: {replayed}" if a.keys else ""))
print(f"  charges in the database:            {s['charges']}" + (f"            <- {s['charges'] - succeeded} charged, told \"failed\"" if a.retries == 0 and s['charges'] > succeeded else ""))
print(f"  orders charged more than once:      {s['orders_charged_more_than_once']}")
if s["overcharged_cents"]:
    print(f"  money overcharged:                  ${s['overcharged_cents'] / 100:,.2f}")
