#!/usr/bin/env bash
# psql inside the database container. Extra arguments are passed through, e.g.
#   ./psql.sh -c "SELECT 1"            ./psql.sh -f /sql/seed.sql
#   ./psql.sh -h pgbouncer -p 6432 -d pgbouncer -c "SHOW POOLS;"
cd "$(dirname "$0")"
if [ -t 0 ] && [ -t 1 ]; then TTY=""; else TTY="-T"; fi
exec docker compose exec $TTY -e PGPASSWORD=lab db psql -U lab -d lab "$@"
