#!/usr/bin/env bash
# Create prod Postgres (:5433) + systemd unit for prod API (:3001).
# Run on OCI as ubuntu:
#   bash ~/personal-app/40_server/infra/scripts/setup-prod-postgres.sh
#
# Does NOT copy dig data — run clone-dig-to-prod.sh after this for a one-time seed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVER_DIR="$REPO_ROOT/40_server"
ENV_FILE="$SERVER_DIR/.env.prod"
COMPOSE_FILE="$SERVER_DIR/docker-compose.prod.yml"
PROD_DATA="$REPO_ROOT/30_data/prod"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Install Docker then re-run." >&2
  exit 1
fi

cd "$SERVER_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp .env.prod.example .env.prod
  if grep -q 'JWT_SECRET=change-me-prod-jwt' .env.prod; then
    SECRET="$(openssl rand -hex 24)"
    sed -i "s/JWT_SECRET=change-me-prod-jwt/JWT_SECRET=${SECRET}/" .env.prod
  fi
  if grep -q 'POSTGRES_PASSWORD=change_me_prod' .env.prod; then
    PG_PASS="$(openssl rand -hex 16)"
    sed -i "s/POSTGRES_PASSWORD=change_me_prod/POSTGRES_PASSWORD=${PG_PASS}/" .env.prod
    sed -i "s|:change_me_prod@|:${PG_PASS}@|" .env.prod
  fi
  echo "Created $ENV_FILE — review secrets before going live."
fi

# shellcheck disable=SC1091
set -a
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL missing in $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$PROD_DATA/photos" "$PROD_DATA/document-scans" "$PROD_DATA/icloud-covers"

echo "==> Starting prod Postgres (127.0.0.1:5433)"
sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo "==> Waiting for Postgres"
for i in $(seq 1 40); do
  if sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    pg_isready -U myfamilyhub -d myfamilyhub >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Prisma migrate deploy (prod)"
export DATABASE_URL
npx prisma migrate deploy

echo "==> Writing systemd unit myfamilyhub-api (PORT=3001)"
if grep -q '^PORT=' "$ENV_FILE"; then
  sed -i '/^PORT=/d' "$ENV_FILE"
fi

sudo tee /etc/systemd/system/myfamilyhub-api.service >/dev/null <<EOF
[Unit]
Description=すみっチョぐらし PROD API (Postgres)
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=${SERVER_DIR}
EnvironmentFile=${ENV_FILE}
Environment=PORT=3001
Environment=TZ=UTC
Environment=WEBAUTHN_RP_ID=sumicchogurashi.duckdns.org
Environment=WEBAUTHN_ORIGIN=https://sumicchogurashi.duckdns.org
Environment=WEBAUTHN_RP_NAME=すみっチョぐらし
Environment=PUBLIC_APP_ORIGIN=https://sumicchogurashi.duckdns.org
Environment=DATA_FILE=${PROD_DATA}/tasks.json
Environment=DOCUMENT_SCAN_DIR=${PROD_DATA}/document-scans
Environment=PHOTO_DIR=${PROD_DATA}/photos
Environment=ICLOUD_COVER_DIR=${PROD_DATA}/icloud-covers
# Prefer prod VAPID file if present (clone-dig-to-prod copies dig keys once)
Environment=VAPID_FILE=${PROD_DATA}/vapid.json
ExecStart=/usr/bin/node ${SERVER_DIR}/dist/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "==> Rebuild API & enable unit (DB may still be empty until clone)"
cd "$REPO_ROOT"
npm run build --workspace @personal-app/server
sudo systemctl daemon-reload
sudo systemctl enable myfamilyhub-api
# Do not start until nginx /api is enabled and (optional) clone is done — start anyway for health
sudo systemctl restart myfamilyhub-api || true
sleep 1
curl -sS http://127.0.0.1:3001/api/health || true
echo
echo "Next:"
echo "  1) bash $REPO_ROOT/40_server/infra/scripts/clone-dig-to-prod.sh"
echo "  2) Enable prod nginx /api/ → 3001 (see 10_docs/prod_dev_이중배포.md)"
echo "  3) bash $REPO_ROOT/40_server/infra/scripts/deploy-prod.sh"
