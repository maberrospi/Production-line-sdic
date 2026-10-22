# Level 5 lab: Primary, replica, failover, point-in-time recovery

Two official `postgres:16` containers: a primary that archives its write-ahead log (WAL) and a
streaming replica cloned from it with `pg_basebackup`. A third server (profile `pitr`) is restored
to a point in time from a base backup plus the archive. Follow the steps in the course
(Level 5 → Lab tab); this file is the reference.

```
primary ──streaming WAL──▶ replica (hot standby, read-only)
   │
   └── archive_command ──▶ wal-archive volume ──▶ restore (profile pitr): base backup + WAL replay
```

No ports are published. `./pg.sh primary`, `./pg.sh replica` and `./pg.sh restore` run psql inside
each container (add `-c "SQL"` for a single command).

## Files

| Path | What |
|---|---|
| `compose.yaml` | primary, replica, restore (profile `pitr`) and their volumes |
| `scripts/primary-entrypoint.sh` | WAL archiving, `wal_keep_size`, replication settings |
| `scripts/replica-entrypoint.sh` | First start: `pg_basebackup -R`; then a hot standby |
| `scripts/restore-entrypoint.sh` | Copies `/backups/base`, writes `recovery.signal` and the recovery settings |
| `sql/01-init.sql`, `sql/02-hba.sh` | The `replicator` role, the `events` table, and the pg_hba line for replication |
| `pg.sh` | psql helper |

## Useful commands

```bash
./pg.sh primary -c "SELECT application_name, state, sync_state, replay_lag FROM pg_stat_replication;"
./pg.sh primary -c "SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) FROM pg_stat_replication;"
./pg.sh primary -c "SELECT archived_count, last_archived_wal, failed_count FROM pg_stat_archiver;"
docker compose exec primary ls /wal-archive | tail
docker compose logs -f replica
```

## Doing a step again

- **Point-in-time recovery twice:** the base backup goes to `/backups/base` and the restore server
  keeps its own volume. To repeat step 5, remove both first:
  `docker compose --profile pitr rm -sf restore && docker volume rm level-5-replication_restore-data`
  and `docker compose exec primary rm -r /backups/base`.
- **Start over completely:** `docker compose --profile pitr down -v`.

## How the reference output was produced

Every step was run for real with Postgres 16 servers configured exactly as these scripts configure
them (outside Docker, so `docker compose pause` was played by stopping the replica's processes).
The output in the course is from that run: 30 MB behind while paused, the synchronous-commit
warning, 201,005 rows recovered, and two independent primaries after failover.
