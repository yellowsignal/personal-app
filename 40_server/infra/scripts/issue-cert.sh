#!/usr/bin/env bash
# Issue (or renew once) a Let's Encrypt certificate via webroot, then switch nginx to HTTPS.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$INFRA_DIR/.env" ]]; then
  echo "Missing $INFRA_DIR/.env" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
source "$INFRA_DIR/.env"
set +a

: "${DOMAIN:?DOMAIN must be set in .env}"
: "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL must be set in .env}"

echo "==> Checking DNS for ${DOMAIN}"
RESOLVED="$(dig +short "$DOMAIN" A | tail -n1 || true)"
if [[ -z "$RESOLVED" ]]; then
  echo "DNS A record for ${DOMAIN} is empty. Run update-duckdns.sh first." >&2
  exit 1
fi
echo "Resolved ${DOMAIN} -> ${RESOLVED}"

echo "==> Requesting certificate (webroot)"
cd "$INFRA_DIR"
sudo docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$LETSENCRYPT_EMAIL" \
  --agree-tos \
  --no-eff-email \
  --non-interactive

echo "==> Switching nginx to HTTPS mode"
bash "$SCRIPT_DIR/render-nginx.sh" https
sudo docker compose exec nginx nginx -s reload

echo
echo "HTTPS enabled for https://${DOMAIN}"
curl -fsSI "https://${DOMAIN}" | head -n 10 || true
