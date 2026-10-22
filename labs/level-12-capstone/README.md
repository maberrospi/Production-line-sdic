# Level 12 capstone: a URL shortener you design, load, break and document

Follow the steps in the course (Level 12 → Lab tab); this file is the reference.

```
client ─▶ gateway (nginx, 127.0.0.1:8090) ─▶ app × 2 (FastAPI) ─┬─▶ Redis: cache + "clicks" stream
                                                                 └─▶ Postgres: links, clicks
                          worker ─ reads the stream ─▶ Postgres
```

Only the gateway is published, on `127.0.0.1:${APP_PORT:-8090}`. Load tests and scripts run on the
Compose network: k6 calls `http://gateway`; the scripts call the app replicas directly at
`http://app:8000` (Docker's DNS returns both) for internal jobs such as seeding.

## Files

| Path | What |
|---|---|
| `app/main.py` | Create (`POST /api/links`), redirect (`GET /{code}`), details, and `/internal/…` endpoints |
| `app/worker.py` | Consumer group on the `clicks` stream; stores clicks, then acknowledges |
| `db/01-schema.sql` | `links` and `clicks` |
| `gateway/nginx.conf` | Rate limit on creation, `/internal/` blocked, JSON access log |
| `k6/redirects.js` | Redirect load, 80% of clicks on 20 links; `-e RATE=… -e DURATION=…` |
| `scripts/seed.py`, `stats.py`, `abuse.py`, `collisions.py` | Run with `docker compose run --rm tools python <script>` |
| `docs/DESIGN-template.md` | The design document you write in step 8 |
| `docs/DESIGN-example.md` | A worked design for this system, with this lab's measured numbers |

## Useful commands

```bash
docker compose run --rm tools python stats.py           # counters from both replicas + database totals
docker compose run --rm k6 run /k6/redirects.js          # 300 redirects/s for 30 s
docker compose logs -f worker                            # stored clicks, stream length, pending
docker compose exec redis redis-cli XINFO GROUPS clicks
docker compose exec db psql -U short -d short -c "SELECT code, count(*) FROM clicks GROUP BY 1 ORDER BY 2 DESC LIMIT 5"
docker compose logs gateway | tail -n 3                  # JSON access log
```

After anything recreates the app containers (`docker compose up -d app`), run
`docker compose restart gateway`: nginx resolves `app` once at startup, and new containers may
have new addresses.

## How the reference output was produced

Every component ran for real from these files, outside Docker: Postgres 16 with `db/01-schema.sql`,
Redis with the same options as `compose.yaml`, two uvicorn replicas of `app/main.py` and the worker
with the pinned packages, nginx with `gateway/nginx.conf` (only listen address and log paths
changed), and k6 v2.3.0 with `k6/redirects.js`. The hostnames `app` (two addresses), `db`, `redis`
and `gateway` were mapped in `/etc/hosts`, so both replicas reported the same instance name; in
Docker each shows its container ID. The machine had 2 CPU cores shared by everything, including k6.

## Clean up

```bash
docker compose --profile tools down -v
```
