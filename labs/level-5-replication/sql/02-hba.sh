#!/bin/bash
# Allow replication connections (pg_basebackup, streaming) for the replicator role.
# "all" in pg_hba.conf does not cover replication, so it needs its own line.
echo "host replication replicator all scram-sha-256" >> "$PGDATA/pg_hba.conf"
