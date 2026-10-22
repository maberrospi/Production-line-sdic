# Level 10 lab: break a dependency, contain it, alert on an SLO, ship a canary and read a trace

`checkout` calls `payments` through Toxiproxy, a TCP proxy that adds latency or breaks connections
on command. Each checkout picks how it calls payments with the `X-Policy` header, so you can
compare policies under the same fault. Prometheus scrapes metrics and evaluates SLO alerts; Jaeger
collects traces. Follow the steps in the course (Level 10 → Lab tab); this file is the reference.

```
tools (load.py) ──▶ gateway (nginx, canary split; step 7 only) ──▶ checkout-v1 / checkout-v2
                                                                        │ X-Policy: none|timeout|retry|backoff|breaker
                                                                        ▼
                                                     toxiproxy :9000 ──▶ payments
prometheus ◀── scrapes /metrics/ on checkout and payments         jaeger ◀── OTLP spans from both
```

Published ports, on 127.0.0.1 only: Prometheus `http://localhost:9090` (set `PROM_PORT` to change)
and Jaeger `http://localhost:16686` (set `JAEGER_PORT`). Everything else stays on the Compose network.

## Helpers

| Command | What it does |
|---|---|
| `./load.sh --policy P --rate R --duration S [--every N] [--target URL]` | Load generator in the tools container (open model: a new checkout every 1/R s) |
| `./toxi.sh <args>` | Toxiproxy's CLI inside the toxiproxy container, e.g. `./toxi.sh toxic add -t latency -a latency=2000 -n slow payments` |
| `./payments.sh stats \| errors 0.1 \| errors 0 \| reset` | Inspect payments or make it answer 500 to a share of charges |

On Windows without a POSIX shell: `docker compose run --rm tools python load.py …`,
`docker compose exec toxiproxy /toxiproxy-cli …` and `docker compose exec payments python admin.py …`.

## The policies (`checkout/main.py`, function `pay`)

| X-Policy | Timeout | Retries | Extra |
|---|---|---|---|
| `none` | none (waits forever) | 0 | what many clients do by default (httpx's default is 5 s; `requests` has none) |
| `timeout` | 300 ms | 0 | |
| `retry` | 300 ms | 3, immediately | |
| `backoff` | 300 ms | up to 3 | exponential backoff with full jitter (base 50 ms, cap 1 s); retry budget: retries ≤ 10% of requests in the last 10 s |
| `breaker` | 300 ms | 0 | circuit breaker: opens after 5 failures in a row, trial call after 5 s |

FastAPI runs `def` endpoints in AnyIO's worker-thread pool, which allows 40 threads by default.
That limit is what step 2 exhausts.

## Metrics (checkout)

| Metric | Golden signal |
|---|---|
| `checkout_requests_total{version,policy,code}` | traffic, errors |
| `checkout_request_duration_seconds` (histogram) | latency, including time waiting for a thread |
| `checkout_inflight_requests`, `checkout_threads_busy` | saturation |
| `checkout_payment_calls_total{result}` | calls to payments: ok, error, timeout, connection, skipped (breaker open) |
| `checkout_breaker_open` | 1 while the breaker is open or half-open |

Recording rules and alerts are in `prometheus/rules.yml`: SLO 99.9% of checkouts not 5xx, with the
SRE Workbook's multiwindow burn-rate alerts **scaled 10× shorter** for the lab (1 h → 6 m,
5 m → 30 s, 6 h → 36 m, 30 m → 3 m). There is no Alertmanager: alerts show on Prometheus's Alerts page.

## Useful queries (Prometheus → Query)

```
checkout_threads_busy
checkout_inflight_requests
histogram_quantile(0.95, sum by (le) (rate(checkout_request_duration_seconds_bucket[30s])))
sum by (result) (rate(checkout_payment_calls_total[30s]))
checkout:burn_rate:30s
sum by (version) (rate(checkout_requests_total{code=~"5.."}[1m])) / sum by (version) (rate(checkout_requests_total[1m]))
```

## How the reference output was produced

Every service ran for real outside Docker, from these files: checkout and payments with the pinned
Python packages, Toxiproxy 2.12.0, Prometheus 3.15.0 (with `prometheus/` as its config folder),
Jaeger 2.22.0 and nginx (the gateway template with the variables filled in). Hostnames such as
`checkout-v1` were mapped to loopback addresses so the configs ran unchanged. Numbers vary a little
from run to run and machine to machine; the shapes do not.

## Clean up

```bash
docker compose --profile canary --profile tools down -v      # -v also drops Prometheus's stored data
```
