# Design: short links (reference solution)

Course capstone · status: reference. Numbers marked *measured* come from this lab's runs on a 2-core
machine with every service on it; yours will differ, and that is the point of measuring.

## 1. Problem and requirements

- Create a short link for a long URL; anyone with the short link is redirected to the long URL.
- See how many times a link was clicked.
- Out of scope for v1: custom aliases, user accounts, editing links, per-country analytics.
- Non-functional:
  - Redirect availability SLO 99.95% per 30 days; redirect latency p99 under 50 ms at the edge.
  - Creation may be less available (99.9%); a link, once created, must never be lost (durability).
  - Click counts may lag by up to a minute and may undercount during an incident; redirects may not fail because analytics did.

## 2. Estimates

Assumptions: 10 million new links per month; each link is clicked 100 times over its life; peak is 10× average.

| Quantity | Arithmetic | Result |
|---|---|---|
| Creations | 10,000,000 / (30 × 86,400 s) | about 4 per second (peak 40) |
| Redirects | 100 × 10 M = 1 billion per month → / 2,592,000 s | about 390 per second (peak about 3,900) |
| Read : write | 1 billion : 10 million | 100 : 1 |
| Link storage | 200 bytes (code, URL, timestamps, index) × 120 M links per year × 5 years | about 120 GB |
| Raw click storage | 12 billion clicks per year × about 60 bytes | about 0.7 TB per year: the largest item by far |
| Cache (hot set) | 20% of a month's links get 80% of clicks: 2 M × about 150 bytes | about 300 MB: one Redis node |
| Code space | 62^7 = 3.5 × 10^12 codes vs 600 M links after 5 years | 0.017% full: about 1 retry per 6,000 creations |

## 3. API

| Method and path | Request | Response | Notes |
|---|---|---|---|
| `POST /api/links` | `{"url": "https://…"}` | `201 {"code", "short_url"}`; 422 invalid URL; 429 too many | 10 per minute per IP at the gateway |
| `GET /{code}` | | `302 Location: …`, `Cache-Control: no-store`; 404 unknown | Hot path: read-only, cached |
| `GET /api/links/{code}` | | `{"url", "created_at", "clicks_counted"}` | Counts lag the stream by seconds |

302 rather than 301: browsers cache a 301 (RFC 9110), so later clicks would never reach us, and we could not count or disable the link.

## 4. Data model

- `links(code text PRIMARY KEY, url text, created_at timestamptz)`: the primary key makes collision detection atomic (`INSERT … ON CONFLICT DO NOTHING`).
- `clicks(event_id text PRIMARY KEY, code text, at timestamptz)`, index on `code`: one row per click, keyed by the stream ID so replays are ignored. At production volume this table would be partitioned by month and rolled up into daily counts (see 8).

## 5. Architecture

```
client ─▶ gateway (nginx: rate limit, /internal/ blocked, JSON logs)
             └─▶ app × 2 (FastAPI, stateless) ─┬─▶ Redis: cache "link:<code>" (TTL 1 h; misses 60 s)
                                               │          stream "clicks" (append-only, capped)
                                               └─▶ Postgres: links (source of truth), clicks
worker (consumer group "counter") ─ reads "clicks" ─▶ inserts into Postgres ─▶ XACK
```

- **Gateway**: the only public entry point; per-IP limit on creation; hides internal endpoints; retries a GET on the other replica if one fails.
- **App**: stateless, so it scales by adding replicas. Redis calls time out after 200 ms and every Redis failure falls back to Postgres.
- **Redis**: cache-aside for redirects (Level 3) and a stream for click events (Level 8). `volatile-lru` eviction: only keys with a TTL (the cache) can be evicted, never the stream. Append-only file on, so queued clicks survive a restart.
- **Worker**: at-least-once processing (commit, then acknowledge), made idempotent by the primary key; claims events a crashed worker left unacknowledged.

## 6. Key decisions and alternatives

| Decision | Options | Choice and trade-off |
|---|---|---|
| Codes | counter + base62; hash of URL; random + unique index; Snowflake | Random 7-character base62: unguessable, no coordination; costs a rare retry |
| Redirect status | 301; 302/307 | 302: every click reaches us (analytics, takedowns) at the cost of no browser caching |
| Click counting | UPDATE a counter per click; stream + async worker | Stream: the redirect path never writes to Postgres; counts lag by seconds |
| Cache placement | none; Redis; CDN | Redis now; a CDN would cache redirects at the edge but hide clicks (needs edge logs instead) |
| Store for clicks | Postgres rows; a column store; logs to object storage | Postgres rows for v1, because volume is modest; rollups and partitions before it grows |

## 7. Failure modes (*measured* where noted)

| What fails | What users see | Detection | Mitigation |
|---|---|---|---|
| One app replica | Nothing: the gateway retried on the other replica; 0 of 6,001 redirects failed (*measured*) | instance health, 5xx ratio | 2+ replicas; orchestrator restarts it |
| Redis down | Redirects still work, p95 3.3 → 6.7 ms (*measured*); clicks during the outage are lost (6,000 of 6,000 dropped) | redis_errors, clicks_dropped | Fail open to Postgres; alert on clicks_dropped; Redis replica + Sentinel, or a managed Redis |
| Worker down | Counts stop rising; nothing is lost; the stream grows | consumer-group lag, oldest pending age | Restart: 6,001 queued clicks stored within 5 s (*measured*); alert if lag > 1 minute |
| Postgres down | New links fail; redirects of cached links still work; uncached ones fail | 5xx on create, db errors | Replica + automated failover (Level 5); PITR backups |
| Abuse (spam links) | Creation returns 429 after 6 requests in a burst (*measured*) | 429 rate, links per IP | Rate limit, URL validation, malware-list checks, takedown process |
| Viral link | Its cache entry absorbs the load | top-N codes by clicks | Cache; for extreme cases, a CDN or in-process cache |

## 8. Scaling plan

- **10× (4,000 redirects/s at peak)**: *measured*, two replicas on one 2-core machine started queueing near 1,000 per second (p95 102 ms), so add app replicas (CPU-bound) behind a load balancer; Redis and Postgres are far from their limits because 90-99% of redirects are cache hits.
- **100×**: shard or partition `clicks` by time and replace raw rows with per-minute rollups; put redirects behind a CDN with edge logging; read replicas for `GET /api/links`; consider a key-value store (or sharded Postgres by code, Level 6) for links.
- Code length: 7 characters lasts for trillions of links; nothing to change.

## 9. Operations

- SLIs: share of redirects answered 302/404 (not 5xx) within 50 ms; creation success rate. Burn-rate alerts as in Level 10.
- Saturation: app CPU, Redis memory, consumer-group lag, Postgres connections (PgBouncer, Level 4).
- Deploy: rolling, one replica at a time, readiness = `/internal/health`; canary new versions on a share of redirects.
- Backups: Postgres base backups + WAL archive; restore tested monthly (Level 5). The `links` table is the only data that matters.

## 10. Security and abuse

- Only absolute http(s) URLs of at most 2,048 characters; no links back to ourselves (loops).
- Rate limit creation per IP (and per API key when accounts exist); check destinations against a malware/phishing list (for example Google Safe Browsing) before activation.
- Codes are random, so links cannot be enumerated, but anyone who has a link can follow it: never treat short links as private.
- Internal endpoints are unreachable from the gateway; the database and Redis are on the private network only.
- Clicks store no IP addresses in v1 (privacy by default); if analytics needs them, store a truncated or hashed form with a retention limit.

## 11. Open questions

- Do links expire? If so, when, and do expired codes become reusable (risky: old links would point somewhere new)?
- How are takedown requests handled, and how fast must a disabled link stop working (cache TTL)?
