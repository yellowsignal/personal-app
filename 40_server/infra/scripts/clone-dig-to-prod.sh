#!/usr/bin/env bash
# One-time: copy dig Postgres + file stores into prod.
# Prerequisites:
#   - dig Postgres running (docker-compose.dig.yml, :5432)
#   - setup-prod-postgres.sh already ran (prod Postgres :5433, .env.prod exists)
#
# Usage on OCI:
#   bash ~/personal-app/40_server/infra/scripts/clone-dig-to-prod.sh
#
# Important:
#   - Passkeys were registered for the dig domain → family must re-register on prod
#     (or use invite bootstrap) even though user rows are copied.
#   - If dig JWT_SECRET encrypted subscription passwords, copy that secret into
#     .env.prod JWT_SECRET (or CREDENTIALS_ENCRYPTION_KEY) before relying on reveal.
#   - Stops prod API briefly during restore.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVER_DIR="$REPO_ROOT/40_server"
DIG_COMPOSE="$SERVER_DIR/docker-compose.dig.yml"
PROD_COMPOSE="$SERVER_DIR/docker-compose.prod.yml"
DIG_ENV="$SERVER_DIR/.env"
PROD_ENV="$SERVER_DIR/.env.prod"
PROD_DATA="$REPO_ROOT/30_data/prod"
DUMP_PATH="/tmp/myfamilyhub-dig-$(date +%Y%m%d%H%M%S).dump"

if [[ ! -f "$PROD_ENV" ]]; then
  echo "Missing $PROD_ENV — run setup-prod-postgres.sh first." >&2
  exit 1
fi

cd "$SERVER_DIR"

echo "==> Stopping prod API (if running)"
sudo systemctl stop myfamilyhub-api 2>/dev/null || true

echo "==> Dump dig DB → $DUMP_PATH"
sudo docker compose -f "$DIG_COMPOSE" exec -T postgres \
  pg_dump -U myfamilyhub -d myfamilyhub -Fc -f /tmp/dig.dump
# Copy dump out of container
DIG_CID="$(sudo docker compose -f "$DIG_COMPOSE" ps -q postgres)"
sudo docker cp "$DIG_CID:/tmp/dig.dump" "$DUMP_PATH"
sudo docker compose -f "$DIG_COMPOSE" exec -T postgres rm -f /tmp/dig.dump

echo "==> Restore into prod DB (drop+create public objects via --clean)"
PROD_CID="$(sudo docker compose -f "$PROD_COMPOSE" --env-file "$PROD_ENV" ps -q postgres)"
sudo docker cp "$DUMP_PATH" "$PROD_CID:/tmp/prod.dump"
# Terminate connections then restore
sudo docker compose -f "$PROD_COMPOSE" --env-file "$PROD_ENV" exec -T postgres \
  psql -U myfamilyhub -d myfamilyhub -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='myfamilyhub' AND pid <> pg_backend_pid();" \
  >/dev/null || true
sudo docker compose -f "$PROD_COMPOSE" --env-file "$PROD_ENV" exec -T postgres \
  pg_restore -U myfamilyhub -d myfamilyhub --clean --if-exists --no-owner --no-acl /tmp/prod.dump
sudo docker compose -f "$PROD_COMPOSE" --env-file "$PROD_ENV" exec -T postgres rm -f /tmp/prod.dump
sudo rm -f "$DUMP_PATH"

echo "==> Copy file stores dig → prod"
mkdir -p "$PROD_DATA/photos" "$PROD_DATA/document-scans" "$PROD_DATA/icloud-covers"
if [[ -d "$REPO_ROOT/30_data/photos" ]]; then
  rsync -a "$REPO_ROOT/30_data/photos/" "$PROD_DATA/photos/"
fi
if [[ -d "$REPO_ROOT/30_data/document-scans" ]]; then
  rsync -a "$REPO_ROOT/30_data/document-scans/" "$PROD_DATA/document-scans/"
fi
if [[ -d "$REPO_ROOT/30_data/icloud-covers" ]]; then
  rsync -a "$REPO_ROOT/30_data/icloud-covers/" "$PROD_DATA/icloud-covers/"
fi
if [[ -f "$REPO_ROOT/30_data/vapid.json" ]]; then
  cp -a "$REPO_ROOT/30_data/vapid.json" "$PROD_DATA/vapid.json"
  echo "    copied vapid.json (keep dig push subscriptions working on prod until users re-subscribe)"
fi
if [[ -f "$REPO_ROOT/30_data/tasks-dev.json" ]]; then
  cp -a "$REPO_ROOT/30_data/tasks-dev.json" "$PROD_DATA/tasks.json"
elif [[ -f "$REPO_ROOT/30_data/tasks.json" ]]; then
  cp -a "$REPO_ROOT/30_data/tasks.json" "$PROD_DATA/tasks.json"
fi

echo "==> Align encryption secrets (optional hint)"
if [[ -f "$DIG_ENV" ]] && grep -q '^JWT_SECRET=' "$DIG_ENV"; then
  echo "    Tip: if subscription passwords were encrypted with dig JWT_SECRET,"
  echo "    set the same JWT_SECRET (or CREDENTIALS_ENCRYPTION_KEY) in .env.prod."
fi

echo "==> Restart prod API"
cd "$REPO_ROOT"
npm run build --workspace @personal-app/server
sudo systemctl start myfamilyhub-api
sleep 1
curl -sS http://127.0.0.1:3001/api/health || true
echo
echo "Done. Prod DB is a snapshot of dig."
echo "Passkeys: users must register again on https://sumicchogurashi.duckdns.org (RP ID differs)."
