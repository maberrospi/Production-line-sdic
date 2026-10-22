# Level 4 lab: Make Postgres fast and correct

Postgres 16 with `pg_stat_statements`, PgBouncer, and a `tools` container for Python scripts.
Follow the steps in the course (Level 4 → Lab tab); this file is the reference.

No ports are published. You reach Postgres through `docker compose exec`, as you would on a
server, so nothing here clashes with a Postgres already running on your machine.

## Start

```bash
cd level-4-databases
docker compose up -d --build
./psql.sh -f /sql/seed.sql        # 100k customers, 2M orders; ~20-60 s
```

## Files

| Path | What |
|---|---|
| `compose.yaml` | db (Postgres 16), pgbouncer, tools (profile `tools`, started by `docker compose run`) |
| `psql.sh` | psql inside the db container; extra arguments are passed through |
| `sql/seed.sql` | Creates and fills `customers`, `orders`, `items`, `doctors`; safe to rerun |
| `scripts/n_plus_one.py` | Step 5: 201 queries vs 1 |
| `scripts/lost_update.py` | Step 6: `--mode read-modify-write \| atomic \| for-update \| repeatable-read` |
| `scripts/write_skew.py` | Step 7: `--level "repeatable read" \| serializable` |
| `scripts/connections.py` | Step 8: `--dsn ... --clients N` |
| `pgbouncer/` | PgBouncer image (Alpine package) and config: transaction pooling, 20 server connections |

## Useful commands

```bash
./psql.sh                                              # interactive psql
./psql.sh -c "EXPLAIN (ANALYZE, BUFFERS) SELECT ..."
./psql.sh -c "SELECT round(total_exec_time) AS ms, calls, left(query, 70) FROM pg_stat_statements ORDER BY 1 DESC LIMIT 10;"
./psql.sh -c "\di+"                                    # indexes and their sizes
docker compose run --rm tools python lost_update.py --mode atomic
./psql.sh -h pgbouncer -p 6432 -d pgbouncer -c "SHOW POOLS;"
```

To start the index experiments again from a clean table, rerun the seed.

## How the reference numbers were produced

The seed, every query and every script were run for real against Postgres 16 and PgBouncer 1.22
(outside Docker, same settings). Step 2: 84 ms → 0.33 ms. Step 3: 780 pages (10 ms) vs 11 pages
(0.44 ms). Step 6: 926 updates lost with read-modify-write, 0 with the three fixes, about 10,700
retries at Repeatable Read. Step 8: 100 of 150 direct clients connected; all 500 through PgBouncer
in about 16 s.

## Clean up

```bash
docker compose down -v      # -v also deletes the database volume
```
