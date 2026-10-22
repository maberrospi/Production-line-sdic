# Level 2 lab: Three replicas behind HAProxy

HAProxy (a widely used open-source load balancer) in front of three FastAPI replicas, with Redis
for shared sessions. Follow the steps in the course (Level 2 → Lab tab); this file is the reference.

```
you ──LB_PORT──▶ haproxy ──▶ api (3 replicas, found through Docker DNS) ──▶ redis
     STATS_PORT─▶ haproxy stats page
```

## Ports

Only HAProxy publishes ports: `LB_PORT` (default 8080) for traffic and `STATS_PORT` (default 8404)
for its dashboard. Change them in `.env` if they are taken, and export the ones you use in each terminal:

```bash
cp .env.example .env
export LB_PORT=8080 STATS_PORT=8404
```

## Files

| Path | What |
|---|---|
| `compose.yaml` | haproxy, api (3 replicas), api-slow (profile `slow`), redis |
| `haproxy/haproxy.cfg` | Health checks, retries, DNS-based server discovery, stats page |
| `api/main.py` | `/`, `/health`, `/work` (20 ms CPU), `/login`, `/me` |
| `k6/steady.js`, `k6/ramp.js` | Load tests with readable reports (as in Level 0, plus a failed-requests line) |

## Settings (in `.env`)

| Variable | Values | Used in |
|---|---|---|
| `SESSION_STORE` | `memory`, `redis` | steps 3–4 |
| `BALANCE` | `roundrobin`, `leastconn`, `random` | step 6 |

After changing `.env`, `docker compose up -d` recreates only the services whose settings changed.

## Useful commands

```bash
docker compose ps                                   # replicas and their state
curl -s "localhost:$STATS_PORT/;csv" | awk -F, '$1=="api" {print $2, $18, "total", $8, "redispatched", $17}'
docker compose up -d --scale api=5                  # more replicas; HAProxy finds them within ~10 s
docker compose --profile slow up -d                 # add the slow replica
docker compose logs -f haproxy                      # one line per request, with the server that answered

# k6 (Linux):
docker run --rm -i --network host -e TARGET=http://localhost:$LB_PORT/work grafana/k6 run - < k6/steady.js
# k6 (Docker Desktop on Mac/Windows):
docker run --rm -i -e TARGET=http://host.docker.internal:$LB_PORT/work grafana/k6 run - < k6/steady.js
```

`steady.js` accepts `-e RATE=60 -e DURATION=40s`; `ramp.js` accepts `-e START=10 -e END=300 -e RAMP=120`.

## How the reference numbers were produced

The API, Redis, HAProxy and k6 were run for real, with HAProxy pointed at fixed addresses instead of
Docker DNS. Step 5: 0 failed requests and about 110 redispatched while a replica was stopped under
60 req/s. Step 6 at 60 req/s: round robin sent the slow replica 450 of 1,800 requests (average 64 ms),
least connections 143 of 1,801 (average 39 ms); the p95 stayed near 180 ms in both. Step 7 depends on
Docker's DNS and was checked with `haproxy -c` only.

## Clean up

```bash
docker compose --profile slow down
```
