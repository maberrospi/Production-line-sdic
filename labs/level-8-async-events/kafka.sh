#!/usr/bin/env bash
# Kafka's own command-line tools, run inside the broker container, already pointed at the broker:
#   ./kafka.sh kafka-topics.sh --describe --topic orders
#   ./kafka.sh kafka-consumer-groups.sh --describe --group billing
cd "$(dirname "$0")"
tool="${1:?usage: ./kafka.sh <kafka tool>.sh [arguments]}"; shift
if [ -t 0 ] && [ -t 1 ]; then TTY=""; else TTY="-T"; fi
exec docker compose exec $TTY kafka "/opt/kafka/bin/$tool" --bootstrap-server localhost:9092 "$@"
