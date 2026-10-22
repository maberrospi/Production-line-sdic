# Level 8 lab: A Postgres job queue, Kafka, and an outbox that never loses events

Part A: a job queue in Postgres (naive, `FOR UPDATE`, `FOR UPDATE SKIP LOCKED`).
Part B: one Kafka broker (KRaft mode): keys and partitions, a consumer group, lag and replay.
Part C: an orders service that publishes events by dual write, or through an outbox read by Debezium.
Part D: an idempotent shipping consumer with a dead-letter topic.

Follow the steps in the course (Level 8 → Lab tab); this file is the reference.

```
tools ──▶ db (Postgres, wal_level=logical) ◀── orders (FastAPI) ──dual write──▶ kafka
                │ outbox table                                                    ▲
                └──── logical replication slot ──▶ connect (Debezium) ────────────┘
                                                     outbox.event.order ──▶ shipping.py ──▶ DLQ topic
```

No ports are published. Memory: about 4 GB free for Kafka, Kafka Connect and Postgres together.

## Helpers

| Command | What it does |
|---|---|
| `./psql.sh -c "SQL"` | psql in the database container |
| `./kafka.sh <tool>.sh <args>` | Kafka's own CLI tools in the broker, already pointed at it (`--bootstrap-server` is added for you) |
| `docker compose run --rm tools python <script> <args>` | The Python scripts in `scripts/` |

## Scripts

| Script | Step | What |
|---|---|---|
| `jobs.py enqueue --jobs N [--poison K]` / `jobs.py work --mode naive\|lock\|skip --workers 4 [--crash-after N]` | 1–2 | The job queue |
| `produce.py --count N [--show]` | 3–5 | Keyed messages to `orders` (Java-compatible murmur2 partitioner) |
| `consume.py --group G --name X [--quiet]` | 4–5 | One consumer-group member; `--quiet` stops 10 s after its last message |
| `place_orders.py --mode dual\|outbox --count N [--poison K]` | 6–8 | Places orders, then checks every saved order reached Kafka |
| `register.py` | 7 | Registers `connect/outbox-connector.json` with Kafka Connect |
| `shipping.py [--group G] [--no-dedupe] [--crash-after N] [--commit-every N]` | 8 | The consumer: dedupe, retries, DLQ |

## Useful commands

```bash
./kafka.sh kafka-topics.sh --describe --topic orders
./kafka.sh kafka-consumer-groups.sh --describe --group billing
./kafka.sh kafka-consumer-groups.sh --group billing --topic orders --reset-offsets --to-earliest --dry-run
./kafka.sh kafka-console-consumer.sh --topic outbox.event.order --from-beginning --max-messages 3 --formatter-property print.key=true
docker compose exec connect curl -s localhost:8083/connectors/orders-outbox/status
./psql.sh -c "SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) FROM pg_replication_slots"
```

## How the reference output was produced

- **Part A** ran for real against Postgres 16.
- **Parts B–D:** real Kafka and Kafka Connect could not run where this lab was built, so the Python
  clients (confluent-kafka 2.6.1, the same as the `tools` image) were run against `kfake`, a
  Kafka-protocol test broker from the franz-go project. The orders service and shipping consumer
  ran for real against Postgres; for step 7 a stand-in relay published outbox rows the way
  Debezium's outbox event router does (key = `aggregateid`, value = `payload`, header `id`).
  Partition numbers match real Kafka (same hash); offsets, lag and replay counts match the steps.
- **Not run here:** the Debezium connector itself (`connect/outbox-connector.json`) and Kafka's CLI
  tools. Their configuration follows the Debezium 3.x and Kafka 4.x documentation; if the connector
  is not RUNNING, `docker compose logs connect` explains why.

## Clean up

```bash
docker compose --profile tools down -v      # also removes the replication slot with the database
```
