# Level 9 lab: Build a gateway, break a rate limiter, and page through a million rows

An nginx API gateway (API keys, per-client rate limits, timeouts, request IDs, routing) in front of
two FastAPI services, with Redis for shared rate limiters and Postgres holding 1,000,000 orders.
Follow the steps in the course (Level 9 → Lab tab); this file is the reference.

```
tools ──▶ gateway (nginx) ──/users/*──────▶ users
                          └─/v1|v2/orders─▶ orders ──▶ db (1,000,000 orders)
                                                   └─▶ redis (rate limiters)
```

No ports are published. Scripts run in the `tools` container and call `http://gateway` like an
outside client. API keys: `key-alice` and `key-bob`.

## Files

| Path | What |
|---|---|
| `gateway/nginx.conf` | The whole gateway, ~50 lines: auth map, `limit_req`, JSON access log, routes |
| `users/main.py` | `/users/{id}`, `/users/slow?ms=` (no auth code: only the gateway can reach it) |
| `orders/main.py` | `/v1/orders` (offset, deprecated), `/v2/orders` (cursor), `/limited/fixed`, `/limited/bucket` |
| `sql/01-orders.sql` | Seeds 1,000,000 orders and the `(created_at DESC, id DESC)` index |
| `scripts/` | `hello.py`, `slow.py`, `burst.py`, `ratelimit.py`, `pagecost.py`, `pager.py`, `client_v1.py` |

## Useful commands

```bash
docker compose run --rm tools python burst.py --key key-alice --count 50
docker compose logs gateway | tail -n 5                     # one JSON line per request
docker compose exec db psql -U lab -d lab -c "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders ORDER BY created_at DESC, id DESC OFFSET 499950 LIMIT 50"
docker compose exec redis redis-cli --scan --pattern 'rl:*'
```

## How the reference output was produced

Everything was run for real (outside Docker, same configuration): nginx 1.24 with this gateway
config, both services, Redis 7 and Postgres 16 with the same seed. Step 3: 21 of 50 accepted in a
burst, 120 of 150 at 15/s. Step 4: fixed window 40 accepted across the boundary, token bucket 23.
Step 5: rows read and buffers are exact; timings depend on your hardware.

## Clean up

```bash
docker compose --profile tools down -v
```
