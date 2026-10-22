# Level 7 lab: Raft in a real cluster, and payments that survive retries

Part one: three etcd members form a Raft cluster (etcd is the consensus store behind Kubernetes and
Patroni). Part two: a payments API whose responses are sometimes late, and a client that retries
with and without idempotency keys. Follow the steps in the course (Level 7 → Lab tab); this file is
the reference.

No ports are published. Everything runs on a Docker network with a fixed name, `lab7`, so
`docker network disconnect lab7 …` works in step 4.

## Helpers

| Command | What it does |
|---|---|
| `./etcdctl.sh <args>` | etcdctl against all three members, from a helper container (`cli`) |
| `./member.sh etcd3 <args>` | etcdctl inside one member, talking only to that member |
| `docker compose run --rm tools python pay.py …` | The payments client (step 7) |

On Windows without a POSIX shell: `docker compose run --rm cli <args>` and
`docker compose exec etcd3 /usr/local/bin/etcdctl --endpoints=127.0.0.1:2379 <args>`.

Note: etcdctl refuses to run if both the `ETCDCTL_ENDPOINTS` variable and an `--endpoints` flag
are set. The helpers never combine them; if you write your own commands, use one or the other.

## Files

| Path | What |
|---|---|
| `compose.yaml` | etcd1–3 (etcd v3.5.21), cli and tools (profile `tools`), db and payments |
| `payments/main.py` | `POST /charges` with an optional `Idempotency-Key`; 20% of replies arrive late |
| `scripts/pay.py` | `--orders N`, `--retries N`, `--keys`, `--misuse` |

## Useful commands

```bash
./etcdctl.sh endpoint status -w table          # leader, term, index for every member
./etcdctl.sh endpoint health
docker compose logs etcd1 etcd2 etcd3 | grep -E 'became leader|lost leader|pre-candidate'
docker compose exec db psql -U pay -d pay -c "SELECT order_id, count(*) FROM charges GROUP BY 1 HAVING count(*) > 1 LIMIT 5;"
```

## How the reference output was produced

etcd v3.5.21 (the same release as the image) was run as a three-member cluster outside Docker:
member list and status, watch, killing the leader (new leader and first successful write about
1.1–1.6 s later), a graceful leadership transfer (0.1 s), losing the majority, leases and
`etcdctl elect` were all run for real. The partition in step 4 needs Docker networking, so it
could not be re-run when these files were rebuilt; its expected behaviour (linearizable reads and
writes time out, serializable reads answer) is etcd's documented behaviour. The payments API and client were run for real against
Postgres 16; the numbers vary from run to run because the 20% is random.

## Clean up

```bash
docker compose --profile tools down -v
```
