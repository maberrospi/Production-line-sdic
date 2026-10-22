#!/usr/bin/env bash
# psql inside the database container:   ./psql.sh -c "SELECT count(*) FROM jobs"
cd "$(dirname "$0")"
if [ -t 0 ] && [ -t 1 ]; then TTY=""; else TTY="-T"; fi
exec docker compose exec $TTY db psql -U postgres -d shop "$@"
