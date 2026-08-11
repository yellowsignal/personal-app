#!/usr/bin/env bash
# Point DuckDNS temporary subdomain at this host's public IP (or an explicit IP).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$INFRA_DIR/.env" ]]; then
  echo "Missing $INFRA_DIR/.env — copy .env.example first." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
source "$INFRA_DIR/.env"
set +a

: "${DUCKDNS_TOKEN:?DUCKDNS_TOKEN must be set in .env}"
: "${DUCKDNS_SUBDOMAIN:?DUCKDNS_SUBDOMAIN must be set in .env}"

IP="${1:-}"
if [[ -z "$IP" ]]; then
  IP="$(curl -4 -fsS https://ifconfig.me || curl -4 -fsS https://api.ipify.org)"
fi

URL="https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=${IP}"
RESULT="$(curl -fsS "$URL")"
echo "DuckDNS update (${DUCKDNS_SUBDOMAIN}.duckdns.org -> ${IP}): ${RESULT}"

if [[ "$RESULT" != "OK" ]]; then
  exit 1
fi
