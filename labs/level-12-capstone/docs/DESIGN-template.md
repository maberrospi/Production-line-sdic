# Design: <system name>

Author · date · status (draft / reviewed / accepted)

## 1. Problem and requirements
- What users do (the 3-5 core use cases):
- Out of scope:
- Non-functional requirements, with numbers: availability (SLO), latency (p95/p99), durability, consistency needs

## 2. Estimates (show the arithmetic)
- Traffic: requests per second, average and peak; read/write ratio
- Storage: per record × records per year × years kept
- Bandwidth and cache size (the hot set)

## 3. API
| Method and path | Request | Response | Notes (auth, rate limit, idempotency) |
|---|---|---|---|

## 4. Data model
Tables or collections, keys, indexes, and which queries each index serves.

## 5. Architecture
A diagram (boxes and arrows), then one paragraph per component: what it does and why it is there.

## 6. Key decisions and alternatives
For each: the options considered, the choice, and the trade-off accepted.

## 7. Failure modes
| What fails | What users see | Detection (metric / alert) | Mitigation |
|---|---|---|---|

## 8. Scaling plan
What breaks first as traffic grows 10× and 100×, and what you would change.

## 9. Operations
SLIs and alerts, dashboards, deploy and rollback, backups and restore tests, runbook links.

## 10. Security and abuse
Authentication, authorization, input validation, rate limits, secrets, data retention and privacy.

## 11. Open questions
