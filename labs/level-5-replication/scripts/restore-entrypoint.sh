#!/bin/bash
# Point-in-time recovery: start from the base backup in /backups/base, replay archived WAL from
# /wal-archive with restore_command, and stop just before RESTORE_TARGET. Then become a normal
# read-write server on a new timeline (recovery_target_action = promote).
set -e
DATA=/var/lib/postgresql/data
if [ -z "$RESTORE_TARGET" ]; then
  echo "restore: set RESTORE_TARGET, e.g.  RESTORE_TARGET='2026-10-13 13:28:46+00' docker compose --profile pitr up -d restore" >&2
  exit 1
fi
if [ ! -s "$DATA/PG_VERSION" ]; then
  [ -s /backups/base/PG_VERSION ] || { echo "restore: no base backup in /backups/base (step 5, first command)" >&2; exit 1; }
  echo "restore: copying the base backup"
  mkdir -p "$DATA"; cp -a /backups/base/. "$DATA/"
  chown -R postgres:postgres "$DATA"; chmod 700 "$DATA"
  rm -f "$DATA/standby.signal"
  touch "$DATA/recovery.signal"
  cat >> "$DATA/postgresql.auto.conf" <<CONF
restore_command = 'cp /wal-archive/%f %p'
recovery_target_time = '$RESTORE_TARGET'
recovery_target_action = 'promote'
CONF
fi
exec docker-entrypoint.sh postgres
