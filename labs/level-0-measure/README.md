# Level 0 lab: Measure, don't guess

A small FastAPI + Postgres service with four endpoints that behave differently under load.
Follow the step-by-step instructions in the course (Level 0 → Lab tab). This file is the quick reference.

## Pick a port first

The API is published on port 8000 of your machine by default. If something else already uses it
(check with `lsof -i :8000` on macOS/Linux or `netstat -ano | findstr :8000` on Windows), pick another.
Every command below uses the `API_PORT` variable, so you only change it in one place:

```bash
export API_PORT=8000          # or 8001, 18000... Docker Compose reads this too
```

Opened a new terminal? Run the `export` again. To make it permanent, also put `API_PORT=...` in `.env`.

## Start

```bash
docker compose up -d --build
curl -s localhost:$API_PORT/health        # {"status":"ok","db":true}
```

## Endpoints

| Endpoint | What it does | What it teaches |
|---|---|---|
| `/fast` | Returns immediately | The floor: framework and network overhead |
| `/db` | One indexed lookup in a 10k-row table | A typical, healthy endpoint |
| `/tail` | Usually 1–5 ms, 2% of requests 0.5–1 s | Percentiles and the long tail (Lesson 0.3) |
| `/work` | 20 ms of CPU per request | Saturation and the knee of the curve (Lesson 0.4) |

Every response carries a `Server-Timing: app;dur=…` header with the time spent inside FastAPI.

## Load tests with k6

Both scripts print a readable report at the end (histogram, percentiles, per-load-level bar chart).
The live line k6 shows while running only tracks progress; read the report when it finishes.

```bash
# Linux (k6 shares the host network):
docker run --rm -i --network host -e TARGET=http://localhost:$API_PORT/tail grafana/k6 run - < k6/steady.js
docker run --rm -i --network host -e TARGET=http://localhost:$API_PORT/work grafana/k6 run - < k6/ramp.js

# Docker Desktop (Mac/Windows): --network host does not reach your laptop, use host.docker.internal
docker run --rm -i -e TARGET=http://host.docker.internal:$API_PORT/tail grafana/k6 run - < k6/steady.js
docker run --rm -i -e TARGET=http://host.docker.internal:$API_PORT/work grafana/k6 run - < k6/ramp.js
```

Options (add `-e NAME=value`): steady takes `RATE` (default 30) and `DURATION` (30s);
ramp takes `START` (10), `END` (150) and `RAMP` seconds (120).

## Change the number of workers

```bash
cp .env.example .env     # set WORKERS=4 (and API_PORT if you changed it)
docker compose up -d api
docker stats             # watch CPU while the ramp test runs
```

## Clean up

```bash
docker compose down -v
```
