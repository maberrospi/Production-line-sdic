# Level 6 lab: Shard it yourself

Three plain `postgres:16` servers act as shards (a fourth joins with the `grow` profile), and a
`tools` container runs a small Python shard router and the experiments. Follow the steps in the
course (Level 6 → Lab tab); this file is the reference.

```
tools (router.py) ──▶ shard0   shard1   shard2   [shard3, profile grow]
                      each: the same schema, a different slice of the users
```

No ports are published; every script runs in the `tools` container on the lab's network.

## Start

```bash
cd level-6-sharding
docker compose up -d
docker compose build tools
docker compose run --rm tools python router.py
```

## Scripts (in `scripts/`)

| Script | Step | What |
|---|---|---|
| `router.py` | 1 | BLAKE2 hash, modulo placement, a ring with 64 virtual nodes per shard |
| `load_users.py --strategy mod\|ring` | 2 | Loads 100,000 users with `COPY`, reports the balance |
| `plan.py --from 3 --to 4` | 3 | How many users would move, per strategy |
| `migrate.py --from 3 --to 4` | 4 | Copy, verify, delete; then checks every row is on its owner |
| `scatter.py --shards 4 [--slow-shard N]` | 5 | Single-shard lookups vs scatter-gather top 10 |
| `hotkey.py --mode plain\|salted --salt N` | 6 | 100,000 likes, 30% for one celebrity |
| `ids.py --workers 4 --per-worker 5000` | 7 | Snowflake IDs vs per-shard auto-increment |

Run any of them with `docker compose run --rm tools python <script> [options]`.

## Useful commands

```bash
for n in 0 1 2 3; do docker compose exec shard$n psql -U postgres -d app -Atc "SELECT 'shard$n', count(*) FROM users"; done
docker compose exec shard0 psql -U postgres -d app        # look around one shard
```

## How the reference output was produced

Every script was run for real against four Postgres 16 servers (outside Docker, same schema);
the output in the course is from that run.

## Clean up

```bash
docker compose --profile grow down -v
```
