#!/bin/sh
# Control the payments service from inside its container.
#   ./payments.sh stats | errors 0.1 | errors 0 | reset
exec docker compose exec payments python admin.py "$@"
