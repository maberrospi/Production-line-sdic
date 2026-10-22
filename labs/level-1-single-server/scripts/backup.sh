#!/usr/bin/env bash
# Nightly logical backup: pg_dump (custom format) -> local file -> off-site copy -> heartbeat.
#
#   bash scripts/backup.sh
#
# Cron on the VM (03:15 every night):
#   15 3 * * * cd /srv/app && bash scripts/backup.sh >> /var/log/app-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="backups/${POSTGRES_DB}-${STAMP}.dump"
mkdir -p backups

echo "[backup] dumping ${POSTGRES_DB} -> ${FILE}"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=6 > "$FILE"

# A dump smaller than 1 KB means something went wrong (empty DB, auth error written to the file...).
SIZE=$(wc -c < "$FILE")
if [ "$SIZE" -lt 1024 ]; then
  echo "[backup] dump is suspiciously small ($SIZE bytes), aborting" >&2
  exit 1
fi

REMOTE="${BACKUP_REMOTE:-./offsite}"
echo "[backup] copying to ${REMOTE}"
case "$REMOTE" in
  gs://*) gcloud storage cp "$FILE" "$REMOTE/" ;;
  s3://*) aws s3 cp "$FILE" "$REMOTE/" ;;
  *)      mkdir -p "$REMOTE" && cp "$FILE" "$REMOTE/" ;;
esac

# Keep 7 local copies; retention of the off-site copies belongs to a bucket lifecycle rule.
ls -1t backups/*.dump | tail -n +8 | xargs -r rm -f

if [ -n "${HEARTBEAT_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$HEARTBEAT_URL" > /dev/null && echo "[backup] heartbeat sent"
fi
echo "[backup] done: $FILE ($SIZE bytes)"
