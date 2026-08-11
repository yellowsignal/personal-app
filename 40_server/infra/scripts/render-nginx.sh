#!/usr/bin/env bash
# Render nginx conf.d/app.conf from a template using DOMAIN in .env
# Uses sed (no gettext/envsubst dependency).
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

if [[ -z "${DOMAIN:-}" ]]; then
  echo "DOMAIN is not set in .env" >&2
  exit 1
fi

TEMPLATE="$INFRA_DIR/nginx/templates/app.${MODE}.conf.template"
OUT="$INFRA_DIR/nginx/conf.d/app.conf"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "Template not found: $TEMPLATE" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
# Replace ${DOMAIN} only. Escape sed replacement specials in DOMAIN.
SAFE_DOMAIN="$(printf '%s' "$DOMAIN" | sed -e 's/[&|\\]/\\&/g')"
sed "s|\${DOMAIN}|${SAFE_DOMAIN}|g" "$TEMPLATE" > "$OUT"
echo "Rendered $OUT (mode=$MODE, domain=$DOMAIN)"
