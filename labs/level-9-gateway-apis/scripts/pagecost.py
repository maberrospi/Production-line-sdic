"""Step 5: what deep pages cost with OFFSET, and with a keyset (cursor), measured with EXPLAIN."""
import json
import os

import psycopg

LIMIT = 50
ORDER = "ORDER BY created_at DESC, id DESC"
conn = psycopg.connect(os.environ.get("DATABASE_URL", "postgresql://lab:lab@db:5432/lab"))


def explain(sql, params=()):
    plan = conn.execute("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql, params).fetchone()[0][0]
    node = plan["Plan"]
    while node.get("Plans"):           # the scan node under Limit
        node = node["Plans"][0]
    buffers = node.get("Shared Hit Blocks", 0) + node.get("Shared Read Blocks", 0)
    return plan["Execution Time"], node["Actual Rows"], buffers


print("   page    offset | OFFSET ms rows read  buffers | KEYSET ms rows read  buffers")
for page in (1, 10, 100, 1000, 10000):
    offset = (page - 1) * LIMIT
    for _ in range(2):                 # run twice: the second, warm run is the one we keep
        o = explain(f"SELECT * FROM orders {ORDER} OFFSET %s LIMIT %s", (offset, LIMIT))
    if offset:
        ts, oid = conn.execute(f"SELECT created_at, id FROM orders {ORDER} OFFSET %s LIMIT 1", (offset - 1,)).fetchone()
        for _ in range(2):
            k = explain(f"SELECT * FROM orders WHERE (created_at, id) < (%s, %s) {ORDER} LIMIT %s", (ts, oid, LIMIT))
    else:
        k = o
    print(f"{page:7,} {offset:9,} | {o[0]:9.2f} {o[1]:9,} {o[2]:8,} | {k[0]:9.2f} {k[1]:9,} {k[2]:8,}")
