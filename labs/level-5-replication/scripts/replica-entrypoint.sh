#!/bin/bash
# Replica: on first start, clone the primary with pg_basebackup -R (which writes standby.signal and
# primary_conninfo), then run as a hot standby that streams and replays the primary's WAL.
set -e
DATA=/var/lib/postgresql/data
if [ ! -s "$DATA/PG_VERSION" ]; then
  echo "replica: cloning the primary with pg_basebackup..."
  mkdir -p "$DATA"; chown postgres:postgres "$DATA"; chmod 700 "$DATA"
  until gosu postgres pg_isready -h primary -U replicator -d postgres -q; do sleep 1; done
  gosu postgres env PGPASSWORD=replpass \
    pg_basebackup -h primary -U replicator -D "$DATA" -R -X stream --checkpoint=fast --progress
  echo "replica: clone finished, starting as a standby"
fi
exec docker-entrypoint.sh postgres -c hot_standby=on
