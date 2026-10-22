#!/usr/bin/env bash
# Prove the latest backup can be restored: load it into a throwaway Postgres container
# and compare row counts per table with production.
#
#   bash scripts/restore-test.sh [path/to/file.dump]
#
# Schedule it weekly. A backup that has never been restored is a hope, not a backup.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

DUMP="${1:-$(ls -1t backups/*.dump 2>/dev/null | head -n1)}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "No dump found. Run scripts/backup.sh first." >&2; exit 1; }

NAME="restore-test-$$"
cleanup() { docker rm -f "$NAME" > /dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[restore-test] starting scratch Postgres"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=scratch -e POSTGRES_DB=restore postgres:16 > /dev/null
for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -h 127.0.0.1 -U postgres -d restore > /dev/null 2>&1 && break
  sleep 1
done

echo "[restore-test] restoring $DUMP"
START=$(date +%s)
docker exec -i "$NAME" pg_restore -U postgres -d restore --no-owner --exit-on-error < "$DUMP"
echo "[restore-test] restore took $(( $(date +%s) - START ))s"

TABLES=$(docker exec "$NAME" psql -U postgres -d restore -At -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")

status=0
for t in $TABLES; do
  restored=$(docker exec "$NAME" psql -U postgres -d restore -At -c "SELECT count(*) FROM \"$t\"")
  live=$(docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(*) FROM \"$t\"")
  mark="ok"
  # Production may have gained rows since the dump; fewer rows in production would be odd.
  if [ "$restored" -gt "$live" ]; then mark="MISMATCH"; status=1; fi
  printf "  %-24s restored=%-8s live=%-8s %s\n" "$t" "$restored" "$live" "$mark"
done

if [ "$status" -eq 0 ] && [ -n "$TABLES" ]; then
  echo "RESTORE OK"
else
  echo "RESTORE FAILED" >&2
  exit 1
fi
