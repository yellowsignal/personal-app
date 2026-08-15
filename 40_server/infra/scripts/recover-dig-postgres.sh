#!/usr/bin/env bash
# Recover dig Postgres after prod compose accidentally replaced the shared
# `40_server` project postgres service. Mounts the dig Docker volume read-only
# check, then brings dig + prod back as separate projects.
#
# Usage on OCI:
#   bash ~/personal-app/40_server/infra/scripts/recover-dig-postgres.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVER_DIR="$REPO_ROOT/40_server"
DIG_VOL="${DIG_VOLUME_NAME:-40_server_myfamilyhub_pg_dig}"
PROD_VOL="${PROD_VOLUME_NAME:-40_server_myfamilyhub_pg_prod}"

cd "$SERVER_DIR"

echo "==> Docker volumes"
sudo docker volume ls | grep -E 'myfamilyhub_pg|VOLUME' || true

if ! sudo docker volume inspect "$DIG_VOL" >/dev/null 2>&1; then
  echo "Dig volume $DIG_VOL not found. Listing all volumes:" >&2
  sudo docker volume ls
  exit 1
fi

echo "==> Peek dig volume row counts (temporary container)"
sudo docker rm -f myfamilyhub-pg-dig-recover 2>/dev/null || true
sudo docker run -d --name myfamilyhub-pg-dig-recover \
  -e POSTGRES_USER=myfamilyhub \
  -e POSTGRES_PASSWORD=peek \
  -e POSTGRES_DB=myfamilyhub \
  -v "${DIG_VOL}:/var/lib/postgresql/data" \
  postgres:16-alpine >/dev/null

for i in $(seq 1 40); do
  if sudo docker exec myfamilyhub-pg-dig-recover pg_isready -U myfamilyhub -d myfamilyhub >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

sudo docker exec myfamilyhub-pg-dig-recover \
  psql -U myfamilyhub -d myfamilyhub -c \
  "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM families) AS families, (SELECT count(*) FROM assets) AS assets, (SELECT count(*) FROM subscriptions) AS subs, (SELECT count(*) FROM checklist_items) AS checks, (SELECT count(*) FROM calendar_events) AS events, (SELECT count(*) FROM photos) AS photos, (SELECT count(*) FROM documents) AS docs, (SELECT count(*) FROM passkey_credentials) AS passkeys;"

echo "==> Stop peek container (volume untouched)"
sudo docker rm -f myfamilyhub-pg-dig-recover >/dev/null

echo ""
echo "If counts look like your real dig data, continue with:"
echo "  cd ~/personal-app/40_server"
echo "  # stop the mistaken shared project container if still running"
echo "  sudo docker compose -p 40_server -f docker-compose.prod.yml --env-file .env.prod down || true"
echo "  sudo docker compose -p 40_server -f docker-compose.dig.yml down || true"
echo "  # start BOTH stacks with distinct project names (compose files now pin volumes)"
echo "  sudo docker compose -p myfamilyhub-dig -f docker-compose.dig.yml up -d"
echo "  sudo docker compose -p myfamilyhub-prod -f docker-compose.prod.yml --env-file .env.prod up -d"
echo "  sudo systemctl restart myfamilyhub-dev-api myfamilyhub-api"
echo "  bash ~/personal-app/40_server/infra/scripts/clone-dig-to-prod.sh"
