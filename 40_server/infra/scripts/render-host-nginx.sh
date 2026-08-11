#!/usr/bin/env bash
# Render host nginx configs for prod + dev from templates.
# Usage: ./render-host-nginx.sh http|https
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE="${1:-http}" # http | https

if [[ ! -f "$INFRA_DIR/.env" ]]; then
  echo "Missing $INFRA_DIR/.env — copy .env.example first." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
source "$INFRA_DIR/.env"
set +a

: "${DOMAIN:?DOMAIN must be set in .env}"
: "${DEV_DOMAIN:?DEV_DOMAIN must be set in .env}"

OUT_DIR="$INFRA_DIR/nginx/host/rendered"
mkdir -p "$OUT_DIR"

render() {
  local template="$1"
  local out="$2"
  local safe_domain safe_dev
  safe_domain="$(printf '%s' "$DOMAIN" | sed -e 's/[&|\\]/\\&/g')"
  safe_dev="$(printf '%s' "$DEV_DOMAIN" | sed -e 's/[&|\\]/\\&/g')"
  sed -e "s|\${DOMAIN}|${safe_domain}|g" -e "s|\${DEV_DOMAIN}|${safe_dev}|g" "$template" > "$out"
  echo "Rendered $out"
}

render "$INFRA_DIR/nginx/host/prod.${MODE}.conf.template" "$OUT_DIR/prod.conf"
render "$INFRA_DIR/nginx/host/dev.${MODE}.conf.template" "$OUT_DIR/dev.conf"

echo ""
echo "Next (on the OCI host as root):"
echo "  sudo cp $OUT_DIR/prod.conf /etc/nginx/sites-available/myfamily.conf"
echo "  sudo cp $OUT_DIR/dev.conf  /etc/nginx/sites-available/myfamily-dev.conf"
echo "  sudo ln -sf /etc/nginx/sites-available/myfamily.conf /etc/nginx/sites-enabled/"
echo "  sudo ln -sf /etc/nginx/sites-available/myfamily-dev.conf /etc/nginx/sites-enabled/"
echo "  sudo nginx -t && sudo systemctl reload nginx"
