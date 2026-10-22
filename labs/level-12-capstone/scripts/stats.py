"""Counters from every app replica, plus what the database has stored.

  python stats.py            python stats.py --reset
"""
import argparse

import psycopg

from common import all_stats, reset_stats
import os

ap = argparse.ArgumentParser()
ap.add_argument("--reset", action="store_true")
a = ap.parse_args()
if a.reset:
    reset_stats()
    print("counters reset on every replica")
    raise SystemExit

rows = all_stats()
keys = ["redirects", "cache_hits", "cache_misses", "db_reads", "redis_errors", "clicks_dropped", "links_created", "code_collisions"]
print(f"{'':16}" + "".join(f"{r['instance'][:12]:>14}" for r in rows) + f"{'total':>14}")
for k in keys:
    vals = [r[k] for r in rows]
    print(f"{k:16}" + "".join(f"{v:>14,}" for v in vals) + f"{sum(vals):>14,}")
hits, misses = sum(r["cache_hits"] for r in rows), sum(r["cache_misses"] for r in rows)
if hits + misses:
    print(f"cache hit ratio {hits / (hits + misses):.1%}")
with psycopg.connect(os.environ["DATABASE_URL"]) as db:
    links, clicks = db.execute("SELECT (SELECT count(*) FROM links), (SELECT count(*) FROM clicks)").fetchone()
print(f"database: {links:,} links, {clicks:,} clicks counted")
