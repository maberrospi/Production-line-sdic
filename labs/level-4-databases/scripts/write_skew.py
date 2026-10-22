"""Step 7: two doctors on call; the rule is that at least one must stay on call.

Alice and Bob each check the rule ("2 on call, so I can leave") and go off call at the same moment.
  --level "repeatable read"   both commit: the rule is broken (write skew)
  --level serializable        one transaction is aborted and retried, and the rule holds
"""
import argparse
import os
import threading

import psycopg
from psycopg import errors

DSN = os.environ.get("DATABASE_URL", "postgresql://lab:lab@db:5432/lab")
ap = argparse.ArgumentParser()
ap.add_argument("--level", required=True, choices=["read committed", "repeatable read", "serializable"])
level = ap.parse_args().level

with psycopg.connect(DSN, autocommit=True) as c:
    c.execute("UPDATE doctors SET on_call = true")

print(f"isolation level: {level}")
read_done = threading.Barrier(2)
alice_committed = threading.Event()
out_lock = threading.Lock()


def say(msg):
    with out_lock:
        print("  " + msg, flush=True)


def shift(name, first_try=True):
    with psycopg.connect(DSN, autocommit=True, prepare_threshold=None) as conn:
        try:
            conn.execute(f"BEGIN ISOLATION LEVEL {level.upper()}")
            (n,) = conn.execute("SELECT count(*) FROM doctors WHERE on_call").fetchone()
            say(f"{name}: sees {n} doctors on call")
            if first_try:
                read_done.wait()          # both have read before either writes: the race window
            if n >= 2:
                conn.execute("UPDATE doctors SET on_call = false WHERE name = %s", (name,))
                say(f"{name}: goes off call")
            else:
                say(f"{name}: stays on call")
            if name == "Bob" and first_try:
                alice_committed.wait()     # make the order deterministic: Alice commits first
            conn.execute("COMMIT")
            say(f"{name}: COMMIT ok")
        except errors.SerializationFailure as e:
            conn.execute("ROLLBACK")
            say(f"{name}: ERROR {str(e).splitlines()[0]}")
            say(f"{name}: retrying the whole transaction")
            shift(name, first_try=False)
        finally:
            if name == "Alice":
                alice_committed.set()


ta = threading.Thread(target=shift, args=("Alice",))
tb = threading.Thread(target=shift, args=("Bob",))
ta.start(); tb.start(); ta.join(); tb.join()

with psycopg.connect(DSN) as c:
    names = [r[0] for r in c.execute("SELECT name FROM doctors WHERE on_call ORDER BY name").fetchall()]
print(f"doctors on call afterwards: {len(names)} {names}  ->  {'rule held' if names else 'RULE BROKEN'}")
