# Level 3 lab: Cache it, then break it

A FastAPI product catalogue whose product query takes 100 ms on purpose, Redis as a cache
(capped at 8 MB), and nginx in front acting as a small CDN edge. Follow the steps in the course
(Level 3 → Lab tab); this file is the reference.

```
you ──EDGE_PORT──▶ edge (nginx, caches /catalog and /me/*) ──▶ api ──▶ redis (cache)
                                                                   └──▶ db (Postgres, 10,000 products)
```

## Ports

Only the edge publishes a port: `EDGE_PORT` (default 8080). Change it in `.env` if it is taken and
export it in each terminal:

```bash
cp .env.example .env
export EDGE_PORT=8080
```

## Endpoints

| Endpoint | What it does | Step |
|---|---|---|
| `GET /products/{id}` | Straight from Postgres: 100 ms every time | 1 |
| `GET /cached/products/{id}` | Cache-aside through Redis (`X-Cache: HIT/MISS`) | 2 |
| `PUT /products/{id}?invalidate=true\|false` | Change a price, optionally deleting the cache entry | 3 |
| `GET /hot` | A 200 ms "report" cached for 5 s; `STAMPEDE_PROTECTION=lock` adds soft expiry + lock | 4 |
| `GET /catalog` | `Cache-Control: public, max-age=10`, cached by the edge | 5 |
| `GET /me/cart` | `Cache-Control: private, no-store`, never cached | 5 |
| `GET /limited` | Fixed-window rate limit in Redis: 5 requests per 10 s | 7 |
| `GET /stats`, `POST /stats/reset` | Database queries, hits, misses, recomputes, origin hits | all |

## Settings (in `.env`)

| Variable | Default | Meaning |
|---|---|---|
| `CACHE_TTL` | 60 | Seconds a cached product lives in Redis |
| `STAMPEDE_PROTECTION` | none | `none` or `lock` for `/hot` |

After changing `.env`: `docker compose up -d api`.

## Load tests

```bash
# Linux
docker run --rm -i --network host -e BASE=http://localhost:$EDGE_PORT/products grafana/k6 run - < k6/products.js
docker run --rm -i --network host -e TARGET=http://localhost:$EDGE_PORT/hot -e RATE=200 -e DURATION=30s grafana/k6 run - < k6/steady.js
# Docker Desktop (Mac/Windows): use host.docker.internal instead of localhost, and drop --network host
```

## Useful commands

```bash
curl -s localhost:$EDGE_PORT/stats; echo
docker compose exec redis redis-cli INFO stats | grep -E 'keyspace_(hits|misses)|evicted_keys'
docker compose exec redis redis-cli --scan --pattern 'product:*' | head
docker compose exec api python fill_redis.py 50000
docker compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru   # undo step 6
```

## How the reference numbers were produced

Postgres 16, Redis 7, nginx and k6 were run for real with this code (outside Docker, same settings).
Step 1: p50 103 ms. Step 2: p50 1.2 ms, hit ratio 0.72, then 0.80 on a second run. Step 4: 212
recomputes and p99 307 ms without protection; 6 recomputes and p99 3.6 ms with the lock. Step 5:
2 origin hits for 3,000 requests. Step 6: about 18,000 keys evicted at the 8 MB cap.

## Clean up

```bash
docker compose down
```
