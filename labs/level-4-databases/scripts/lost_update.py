"""Step 6: 20 threads each sell 50 items from a stock of 1,000. The stock should end at 0.

  --mode read-modify-write   SELECT the stock, compute in Python, UPDATE with the result (the bug)
  --mode atomic              UPDATE items SET stock = stock - 1 (the database does the arithmetic)
  --mode for-update          SELECT ... FOR UPDATE locks the row until COMMIT
  --mode repeatable-read     the buggy code, but at REPEATABLE READ: conflicts abort and are retried
"""
import argparse
import os
import threading
import time

import psycopg
from psycopg import errors

DSN = os.environ.get("DATABASE_URL", "postgresql://lab:lab@db:5432/lab")
THREADS, SALES = 20, 50

ap = argparse.ArgumentParser()
ap.add_argument("--mode", required=True, choices=["read-modify-write", "atomic", "for-update", "repeatable-read"])
mode = ap.parse_args().mode

with psycopg.connect(DSN, autocommit=True) as c:
    c.execute("UPDATE items SET stock = 1000 WHERE id = 1")

retries = 0
lock = threading.Lock()


def sell_one(conn):
    if mode == "atomic":
        with conn.transaction():
            conn.execute("UPDATE items SET stock = stock - 1 WHERE id = 1")
    elif mode == "for-update":
        with conn.transaction():
            (stock,) = conn.execute("SELECT stock FROM items WHERE id = 1 FOR UPDATE").fetchone()
            conn.execute("UPDATE items SET stock = %s WHERE id = 1", (stock - 1,))
    else:  # read-modify-write, at READ COMMITTED or REPEATABLE READ
        with conn.transaction():
            (stock,) = conn.execute("SELECT stock FROM items WHERE id = 1").fetchone()
            time.sleep(0.0005)   # the "business logic" between read and write
            conn.execute("UPDATE items SET stock = %s WHERE id = 1", (stock - 1,))


def worker():
    global retries
    with psycopg.connect(DSN, autocommit=True, prepare_threshold=None) as conn:
        if mode == "repeatable-read":
            conn.isolation_level = psycopg.IsolationLevel.REPEATABLE_READ
        for _ in range(SALES):
            while True:
                try:
                    sell_one(conn)
                    break
                except errors.SerializationFailure:
                    with lock:
                        retries += 1   # "could not serialize access due to concurrent update": try again


t = time.perf_counter()
threads = [threading.Thread(target=worker) for _ in range(THREADS)]
for th in threads:
    th.start()
for th in threads:
    th.join()
elapsed = time.perf_counter() - t

with psycopg.connect(DSN) as c:
    (final,) = c.execute("SELECT stock FROM items WHERE id = 1").fetchone()
print(f"{mode:<18}  final stock = {final:4d}   lost updates: {final:4d}   retries: {retries:6d}   {elapsed:.1f} s")
