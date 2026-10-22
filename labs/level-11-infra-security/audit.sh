#!/bin/sh
# pip-audit in a container, with this folder mounted at /work:
#   ./audit.sh -r audit/requirements-2024.txt
#   ./audit.sh -r app/requirements.txt
docker build -q -t lab-pip-audit audit >/dev/null && exec docker run --rm -v "$PWD:/work:ro" lab-pip-audit "$@"
