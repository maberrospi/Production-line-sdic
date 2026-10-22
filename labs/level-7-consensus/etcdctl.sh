#!/usr/bin/env bash
# etcdctl against the whole cluster (all three members), from a helper container on the lab network.
#   ./etcdctl.sh endpoint status -w table      ./etcdctl.sh put key value      ./etcdctl.sh watch key
cd "$(dirname "$0")"
if [ -t 0 ] && [ -t 1 ]; then TTY=""; else TTY="-T"; fi
exec docker compose run --rm $TTY cli "$@"
