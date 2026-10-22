#!/usr/bin/env bash
# Local development only: create a self-signed certificate where nginx expects Let's Encrypt's.
# On a real VM with a domain, use certbot instead (see README).
set -euo pipefail
cd "$(dirname "$0")/.."
DOMAIN="$(grep -E '^DOMAIN=' .env 2>/dev/null | cut -d= -f2- || true)"
DOMAIN="${DOMAIN:-localhost}"
DIR="certs/live/${DOMAIN}"
mkdir -p "$DIR" certbot-www
openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
  -subj "/CN=${DOMAIN}" -addext "subjectAltName=DNS:${DOMAIN}" \
  -keyout "$DIR/privkey.pem" -out "$DIR/fullchain.pem"
echo "Self-signed certificate for ${DOMAIN} written to ${DIR}"
