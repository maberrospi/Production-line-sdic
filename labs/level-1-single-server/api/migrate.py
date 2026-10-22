"""Minimal migration runner: applies migrations/*.sql in name order, once each.

In a real project you would use Alembic; this shows what any migration tool does underneath:
a tracking table, a lock so two deploys cannot migrate at once, and one transaction per file.
"""
import os
import pathlib
import sys

import psycopg

DIR = pathlib.Path(__file__).parent / "migrations"


def main() -> int:
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(7001)")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        done = {r[0] for r in conn.execute("SELECT name FROM schema_migrations").fetchall()}
        pending = [p for p in sorted(DIR.glob("*.sql")) if p.name not in done]
        if not pending:
            print("migrate: nothing to do")
        for path in pending:
            print(f"migrate: applying {path.name}")
            with conn.transaction():
                conn.execute(path.read_text())
                conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))
        conn.execute("SELECT pg_advisory_unlock(7001)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
