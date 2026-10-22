"""Part A: a job queue in Postgres, claimed three ways.

  python jobs.py enqueue --jobs 1000 [--poison 2]
  python jobs.py work --mode naive|lock|skip --workers 4 [--crash-after 100]

Each job "sends an email" (10 ms of work) and records it in job_runs, so duplicates can be counted.
Compare the three queries in claim().
"""
import argparse
import os
import threading
import time

import psycopg

DSN = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@db:5432/shop")
MAX_ATTEMPTS = 3

ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest="cmd", required=True)
e = sub.add_parser("enqueue")
e.add_argument("--jobs", type=int, default=1000)
e.add_argument("--poison", type=int, default=0, help="this many jobs always fail")
w = sub.add_parser("work")
w.add_argument("--mode", choices=["naive", "lock", "skip"], required=True)
w.add_argument("--workers", type=int, default=4)
w.add_argument("--crash-after", type=int, default=0, help="worker 0 dies in the middle of its Nth job")
args = ap.parse_args()


def enqueue():
    with psycopg.connect(DSN) as conn:
        conn.execute("TRUNCATE jobs, job_runs RESTART IDENTITY")
        poison = {int(args.jobs * (k + 1) / (args.poison + 1)) + 1 for k in range(args.poison)}
        with conn.cursor().copy("COPY jobs (payload) FROM STDIN") as cp:
            for i in range(1, args.jobs + 1):
                cp.write_row(("poison" if i in poison else f"email to customer {i}",))
    print(f"enqueued {args.jobs:,} jobs" + (f" ({args.poison} of them poison: {sorted(poison)})" if poison else ""))


def claim(conn):
    """Return (job_id, payload) or None. The three modes differ only here."""
    if args.mode == "naive":
        # Read the oldest queued job. Nothing stops the other workers reading the same row.
        return conn.execute("SELECT id, payload FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1").fetchone()
    if args.mode == "lock":
        # FOR UPDATE: lock the row; other workers wait for the lock, then find it no longer queued.
        return conn.execute("SELECT id, payload FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1 FOR UPDATE").fetchone()
    # FOR UPDATE SKIP LOCKED: take the first queued row nobody has locked. No waiting, no duplicates.
    return conn.execute(
        "SELECT id, payload FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED").fetchone()


def send_email(payload: str):
    time.sleep(0.010)                       # pretend to talk to an email provider
    if payload == "poison":
        raise ValueError("malformed address")


dead = []
lock = threading.Lock()


class Crash(Exception):
    pass


crashed = set()


def worker(n: int):
    try:
        run_worker(n)
    except Exception:
        if n not in crashed:
            raise
        # The "process" is gone. Postgres sees the connection drop and rolls its transaction back.


def run_worker(n: int):
    conn = psycopg.connect(DSN, prepare_threshold=None)
    done = 0
    while True:
        with conn.transaction():
            job = claim(conn)
            if job is None:
                (left,) = conn.execute("SELECT count(*) FROM jobs WHERE status = 'queued'").fetchone()
                if left == 0:
                    break
                continue                    # another worker holds the remaining jobs; look again
            job_id, payload = job
            done += 1
            try:
                with conn.transaction():    # a savepoint: a failure is recorded while we still hold the row
                    send_email(payload)
                    conn.execute("INSERT INTO job_runs (job_id, worker) VALUES (%s, %s)", (job_id, n))
                    if n == 0 and args.crash_after and done == args.crash_after:
                        print(f"worker 0: crashing in the middle of job {job_id}", flush=True)
                        crashed.add(n)
                        conn.pgconn.finish()   # drop the connection mid-transaction, like kill -9
                        raise Crash()
                    conn.execute("UPDATE jobs SET status = 'done', updated_at = now() WHERE id = %s", (job_id,))
            except Crash:
                raise
            except ValueError as err:
                (attempts,) = conn.execute(
                    "UPDATE jobs SET attempts = attempts + 1, last_error = %s, updated_at = now(), "
                    "status = CASE WHEN attempts + 1 >= %s THEN 'dead' ELSE 'queued' END "
                    "WHERE id = %s RETURNING attempts", (str(err), MAX_ATTEMPTS, job_id)).fetchone()
                if attempts >= MAX_ATTEMPTS:
                    with lock:
                        dead.append((job_id, attempts, str(err)))
    conn.close()


def work():
    t = time.perf_counter()
    threads = [threading.Thread(target=worker, args=(n,)) for n in range(args.workers)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    elapsed = time.perf_counter() - t
    with psycopg.connect(DSN) as conn:
        counts = dict(conn.execute("SELECT status, count(*) FROM jobs GROUP BY status").fetchall())
        total = sum(counts.values())
        emails, distinct = conn.execute("SELECT count(*), count(DISTINCT job_id) FROM job_runs").fetchone()
    print(f"mode={args.mode} workers={args.workers}: {total:,} jobs finished in {elapsed:.1f}s ({total / elapsed:.0f} jobs/s)")
    if args.crash_after or counts.get("dead"):
        print(f"jobs: {total:,}   done: {counts.get('done', 0):,}   queued: {counts.get('queued', 0)}   dead: {counts.get('dead', 0)}")
    print(f"emails sent: {emails:,}   duplicate emails: {emails - distinct:,}")
    for job_id, attempts, err in sorted(dead):
        print(f"  dead-lettered job {job_id} after {attempts} attempts: {err}")


enqueue() if args.cmd == "enqueue" else work()
