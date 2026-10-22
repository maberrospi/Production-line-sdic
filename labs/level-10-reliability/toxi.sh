#!/bin/sh
# Toxiproxy's command-line tool, run inside the toxiproxy container (which has no shell).
#   ./toxi.sh list
#   ./toxi.sh toxic add -t latency -a latency=2000 -n slow payments
#   ./toxi.sh toxic remove -n slow payments
exec docker compose exec toxiproxy /toxiproxy-cli "$@"
