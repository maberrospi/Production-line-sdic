#!/bin/sh
# The load generator, in the tools container:  ./load.sh --policy none --rate 40 --duration 30
exec docker compose run --rm tools python load.py "$@"
