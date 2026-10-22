#!/usr/bin/env bash
# Wait until a compose service's container reports "healthy".
#   bash scripts/wait-healthy.sh <service> [timeout-seconds]
# Exits 0 when healthy, 1 when unhealthy, exited or timed out.
set -uo pipefail
cd "$(dirname "$0")/.."

SERVICE="${1:?service name}"
TIMEOUT="${2:-60}"
deadline=$(( $(date +%s) + TIMEOUT ))

while [ "$(date +%s)" -lt "$deadline" ]; do
  cid="$(docker compose ps -q "$SERVICE" 2>/dev/null | head -n1)"
  if [ -n "$cid" ]; then
    read -r run health restarts < <(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.RestartCount}}' "$cid" 2>/dev/null || echo "missing missing 0")
    if [ "${restarts:-0}" -ge 2 ]; then
      echo "$SERVICE is crash-looping ($restarts restarts)" >&2; exit 1
    fi
    case "$health" in
      healthy)   echo "$SERVICE is healthy"; exit 0 ;;
      unhealthy) echo "$SERVICE is unhealthy" >&2; exit 1 ;;
    esac
    if [ "$run" = "exited" ] || [ "$run" = "dead" ]; then
      echo "$SERVICE container $run" >&2; exit 1
    fi
  fi
  sleep 2
done
echo "$SERVICE not healthy after ${TIMEOUT}s" >&2
exit 1
