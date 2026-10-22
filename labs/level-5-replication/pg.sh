#!/usr/bin/env bash
# psql inside one of the lab's containers:  ./pg.sh primary -c "SELECT 1"   ./pg.sh replica   ./pg.sh restore
cd "$(dirname "$0")"
svc="${1:?usage: ./pg.sh primary|replica|restore [psql arguments]}"; shift
if [ -t 0 ] && [ -t 1 ]; then TTY=""; else TTY="-T"; fi
exec docker compose exec $TTY -u postgres "$svc" psql -d lab "$@"
