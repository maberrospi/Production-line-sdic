"""Step 5: the same report built two ways.

N+1:  one query for 200 customers, then one query per customer for their order totals.
JOIN: one query that does it all.
"""
import os
import sys
import time

import psycopg

DSN = os.environ.get("DATABASE_URL", "postgresql://lab:lab@db:5432/lab")

with psycopg.connect(DSN, prepare_threshold=None) as conn:
    if not conn.execute("SELECT 1 FROM pg_indexes WHERE tablename = 'orders' AND indexdef LIKE '%(customer_id)%'").fetchone():
        sys.exit("No index on orders(customer_id) yet: do step 2 first, otherwise every per-customer query is a full scan.")

    # Warm up both paths once so caching does not favour the second run.
    conn.execute("SELECT count(*) FROM orders WHERE customer_id BETWEEN 1 AND 200").fetchone()

    t = time.perf_counter()
    queries = 1
    customers = conn.execute("SELECT id, name FROM customers ORDER BY id LIMIT 200").fetchall()
    report_a = []
    for cid, name in customers:
        n, total = conn.execute(
            "SELECT count(*), coalesce(sum(total_cents), 0) FROM orders WHERE customer_id = %s", (cid,)).fetchone()
        queries += 1
        report_a.append((cid, name, n, total))
    t_a = time.perf_counter() - t

    t = time.perf_counter()
    report_b = conn.execute("""
        SELECT c.id, c.name, count(o.id), coalesce(sum(o.total_cents), 0)
        FROM (SELECT id, name FROM customers ORDER BY id LIMIT 200) AS c
        LEFT JOIN orders o ON o.customer_id = c.id
        GROUP BY c.id, c.name
        ORDER BY c.id""").fetchall()
    t_b = time.perf_counter() - t

print(f"N+1:  {queries:4d} queries   {t_a * 1000:7.1f} ms")
print(f"JOIN:    1 query    {t_b * 1000:7.1f} ms")
print(f"same results: {report_a == [tuple(r) for r in report_b]}   speed-up: {t_a / t_b:.0f}x")
