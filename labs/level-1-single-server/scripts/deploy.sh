#!/usr/bin/env bash
# Deploy an API image tag with migrations, a health check and automatic rollback.
#
#   bash scripts/deploy.sh <tag>
#
# The tag is the git SHA CI built (or v1, v2... in the lab). The script:
#   1. pulls the image (if it lives in a registry)
#   2. makes sure Postgres is up, then runs migrations with the NEW image
#   3. recreates only the api container
#   4. waits for it to report healthy; if it does not, redeploys the previous tag
#   5. records the live tag in .env (API_TAG) and .deploy/history
set -euo pipefail
cd "$(dirname "$0")/.."

NEW_TAG="${1:?usage: deploy.sh <tag>}"
[ -f .env ] || { echo "Missing .env (copy .env.example)" >&2; exit 1; }
mkdir -p .deploy

PREV_TAG="$(grep -E '^API_TAG=' .env | cut -d= -f2- || true)"
API_IMAGE="$(grep -E '^API_IMAGE=' .env | cut -d= -f2- || echo app-api)"

set_tag() {
  if grep -qE '^API_TAG=' .env; then
    sed -i.bak -E "s/^API_TAG=.*/API_TAG=$1/" .env && rm -f .env.bak
  else
    echo "API_TAG=$1" >> .env
  fi
  export API_TAG="$1"
}

log() { echo "[deploy $(date +%H:%M:%S)] $*"; }

# 1. Get the image. Local images (no registry prefix) are already there.
if [[ "$API_IMAGE" == */* ]]; then
  log "pulling $API_IMAGE:$NEW_TAG"
  API_TAG="$NEW_TAG" docker compose pull api
fi

# 2. Database up, then migrations with the new image. Migrations must be backward compatible:
#    if this deploy rolls back, the previous code must still work against the new schema.
docker compose up -d --wait db
log "running migrations with $NEW_TAG"
API_TAG="$NEW_TAG" docker compose run --rm --no-deps api python migrate.py

# 3. Swap only the api container.
log "starting api $NEW_TAG (previous: ${PREV_TAG:-none})"
set_tag "$NEW_TAG"
docker compose up -d --no-deps api

# 4. Health check decides.
if bash scripts/wait-healthy.sh api 60; then
  docker compose up -d nginx   # no-op if already running; starts it on first deploy
  echo "$(date -u +%FT%TZ) $NEW_TAG ok" >> .deploy/history
  log "deployed $NEW_TAG"
else
  echo "$(date -u +%FT%TZ) $NEW_TAG failed" >> .deploy/history
  if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$NEW_TAG" ]; then
    log "Health check failed, rolling back to $PREV_TAG" >&2
    set_tag "$PREV_TAG"
    docker compose up -d --no-deps api
    bash scripts/wait-healthy.sh api 60 || log "previous version is unhealthy too: investigate now" >&2
  else
    log "Health check failed and there is no previous tag to roll back to" >&2
  fi
  docker compose logs --tail 30 api >&2 || true
  exit 1
fi
