#!/bin/bash
# Primary: archive every finished WAL file into /wal-archive, keep extra WAL for lagging replicas.
set -e
mkdir -p /wal-archive /backups
chown postgres:postgres /wal-archive /backups
exec docker-entrypoint.sh postgres \
  -c wal_level=replica \
  -c max_wal_senders=10 \
  -c wal_keep_size=512MB \
  -c archive_mode=on \
  -c archive_command='test ! -f /wal-archive/%f && cp %p /wal-archive/%f' \
  -c archive_timeout=60
