"""Send checkouts at a fixed rate and report what users would see.

  python load.py --policy none --rate 40 --duration 30
  python load.py --policy breaker --every 2              print a line every 2 s
  python load.py --target http://gateway --duration 120  through the canary gateway (step 7)

This is an open model, like k6's constant-arrival-rate: a new checkout starts every 1/rate seconds
whether or not earlier ones have finished, the way real users keep arriving during an outage.
Alongside, /fast (which never calls payments) is probed once a second.
"""
import argparse
import asyncio
import collections
import os
import random
import time
import uuid

import httpx

ap = argparse.ArgumentParser()
ap.add_argument("--policy", default="none", help="none | timeout | retry | backoff | breaker")
ap.add_argument("--rate", type=float, default=40, help="checkouts per second")
ap.add_argument("--duration", type=float, default=30, help="seconds of sending")
ap.add_argument("--target", default=os.environ.get("CHECKOUT", "http://checkout-v1:8000"))
ap.add_argument("--every", type=float, default=5, help="seconds between progress lines (0 = none)")
ap.add_argument("--no-reset", action="store_true", help="keep payments' counters from earlier runs")
a = ap.parse_args()

PAYMENTS = os.environ.get("PAYMENTS_DIRECT", "http://payments:8000")   # straight to payments, not via Toxiproxy
COUNTRIES = ["US", "GB", "DE", "FR", "ES", "IT", "NL", "IE", "PT", "PL"]
done = []          # (finished_at, seconds, outcome, version)
probes = []        # seconds per /fast call
sent = 0


def ms(s):
    return f"{s * 1000:,.0f} ms" if s < 10 else f"{s:,.1f} s"


def pct(values, p):
    if not values:
        return 0.0
    v = sorted(values)
    return v[min(len(v) - 1, int(p / 100 * len(v)))]


async def payments_stats(c):
    try:
        return (await c.get(f"{PAYMENTS}/stats", timeout=3)).json()
    except httpx.HTTPError:
        return None


async def one(c):
    body = {"order_id": str(uuid.uuid4()), "amount_cents": random.randint(500, 20000), "country": random.choice(COUNTRIES)}
    t = time.perf_counter()
    try:
        r = await c.post(f"{a.target}/checkout", json=body, headers={"X-Policy": a.policy})
        if r.status_code == 200:
            outcome = "ok"
        else:
            try:
                j = r.json()
            except ValueError:
                j = {}
            reason = j.get("reason") or j.get("error", "")
            outcome = f"{r.status_code} {reason}".strip()
        version = r.headers.get("x-version", "?")
    except httpx.TimeoutException:
        outcome, version = "no answer within 60 s (client gave up)", "?"
    except httpx.HTTPError as e:
        outcome, version = f"connection failed: {type(e).__name__}", "?"
    done.append((time.perf_counter(), time.perf_counter() - t, outcome, version))


async def probe(c, stop):
    while not stop.is_set():
        t = time.perf_counter()
        try:
            await c.get(f"{a.target}/fast")
            probes.append(time.perf_counter() - t)
        except httpx.HTTPError:
            probes.append(60.0)
        await asyncio.sleep(max(0.0, 1 - (time.perf_counter() - t)))


async def ticker(c, start, stop):
    last_i, last_calls = 0, 0
    print(f"{'time':>6}  {'answered':>8}  {'ok':>5}  {'failed':>6}  {'waiting':>7}  {'p50':>8}  {'p95':>8}  payments calls")
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=a.every)
        except asyncio.TimeoutError:
            pass
        chunk, last_i = done[last_i:], len(done)
        lat = [d[1] for d in chunk]
        ok = sum(1 for d in chunk if d[2] == "ok")
        st = await payments_stats(c)
        calls = st["calls"] if st else 0
        print(f"{time.perf_counter() - start:5.0f}s  {len(chunk):8,}  {ok:5,}  {len(chunk) - ok:6,}  {sent - len(done):7,}  "
              f"{ms(pct(lat, 50)) if lat else '-':>8}  {ms(pct(lat, 95)) if lat else '-':>8}  +{calls - last_calls:,}", flush=True)
        last_calls = calls


async def main():
    global sent
    limits = httpx.Limits(max_connections=3000, max_keepalive_connections=300)
    async with httpx.AsyncClient(timeout=60, limits=limits) as c:
        if not a.no_reset:
            try:
                await c.post(f"{PAYMENTS}/admin/reset", timeout=3)
            except httpx.HTTPError:
                print("(could not reset payments' counters)")
        total = int(a.rate * a.duration)
        print(f"policy={a.policy}  target={a.target}  {a.rate:g} checkouts/s for {a.duration:g} s ({total:,} checkouts)")
        start, stop = time.perf_counter(), asyncio.Event()
        side = [asyncio.create_task(probe(c, stop))]
        if a.every:
            side.append(asyncio.create_task(ticker(c, start, stop)))
        tasks = []
        for i in range(total):
            delay = start + i / a.rate - time.perf_counter()
            if delay > 0:
                await asyncio.sleep(delay)
            tasks.append(asyncio.create_task(one(c)))
            sent += 1
        await asyncio.gather(*tasks)
        elapsed = time.perf_counter() - start
        stop.set()
        await asyncio.gather(*side)
        st = await payments_stats(c)

    lat = [d[1] for d in done]
    outcomes = collections.Counter(d[2] for d in done)
    ok = outcomes.pop("ok", 0)
    print(f"\nSummary ({elapsed:.0f} s until the last answer)")
    print(f"  checkouts sent            {len(done):,}")
    print(f"  succeeded                 {ok:,}  ({ok / len(done):.1%})")
    print(f"  failed                    {len(done) - ok:,}")
    for outcome, n in outcomes.most_common():
        print(f"      {n:>7,}  {outcome}")
    print(f"  latency p50 / p95 / max   {ms(pct(lat, 50))} / {ms(pct(lat, 95))} / {ms(max(lat))}")
    if probes:
        print(f"  /fast (calls nothing)     {len(probes)} probes, p50 {ms(pct(probes, 50))}, max {ms(max(probes))}")
    versions = collections.defaultdict(lambda: [0, 0])
    for d in done:
        versions[d[3]][0] += 1
        versions[d[3]][1] += d[2] != "ok"
    for v, (n, bad) in sorted(versions.items()):
        print(f"  answered by {v:<13} {n:,} checkouts, {bad:,} failed ({bad / n:.1%})")
    if st:
        print(f"  payments received         {st['calls']:,} calls for {st['distinct_orders']:,} orders "
              f"({st['calls'] / len(done):.2f} calls per checkout)")


asyncio.run(main())
