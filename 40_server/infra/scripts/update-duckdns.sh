#!/usr/bin/env bash
# Update DuckDNS A records for prod + optional dev subdomain.
# DuckDNS: create TWO subdomains (nested dev.foo.duckdns.org is not supported).
# Example: sumicchogurashi + sumicchogurashi-dev
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

update_one() {
  local name="$1"
  local url="https://www.duckdns.org/update?domains=${name}&token=${DUCKDNS_TOKEN}&ip=${IP}"
  local result
  result="$(curl -fsS "$url")"
  echo "DuckDNS update (${name}.duckdns.org -> ${IP}): ${result}"
  if [[ "$result" != "OK" ]]; then
    exit 1
  fi
}

update_one "$DUCKDNS_SUBDOMAIN"

if [[ -n "${DUCKDNS_DEV_SUBDOMAIN:-}" ]]; then
  update_one "$DUCKDNS_DEV_SUBDOMAIN"
fi
