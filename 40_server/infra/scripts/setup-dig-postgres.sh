#!/usr/bin/env bash
# Switch dig API from MEMORY_AUTH to Postgres (Passkeys survive restart).
# Run on OCI as ubuntu from repo root: bash 40_server/infra/scripts/setup-dig-postgres.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVER_DIR="$REPO_ROOT/40_server"
ENV_FILE="$SERVER_DIR/.env"
COMPOSE_FILE="$SERVER_DIR/docker-compose.dig.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Install Docker then re-run." >&2
  exit 1
fi

cd "$SERVER_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp .env.example .env
  # Generate a random JWT if still default
  if grep -q 'JWT_SECRET=dev-secret-change-me' .env; then
    SECRET="$(openssl rand -hex 24)"
    sed -i "s/JWT_SECRET=dev-secret-change-me/JWT_SECRET=${SECRET}/" .env
  fi
  echo "Created $ENV_FILE — review passwords if needed."
fi

# Ensure DATABASE_URL points at local dig postgres
if ! grep -q '^DATABASE_URL=' .env; then
  echo 'DATABASE_URL=postgresql://myfamilyhub:change_me_dig@127.0.0.1:5432/myfamilyhub?schema=public' >> .env
fi

echo "==> Starting Postgres"
sudo docker compose -f "$COMPOSE_FILE" --env-file .env up -d

echo "==> Waiting for Postgres"
for i in $(seq 1 30); do
  if sudo docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U myfamilyhub -d myfamilyhub >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Prisma migrate"
set -a
# shellcheck disable=SC1091
source .env
set +a
npx prisma migrate deploy

echo "==> Writing systemd unit (no MEMORY_AUTH)"
# NOTE: systemd EnvironmentFile= overrides Environment= for the same key.
# Keep PORT only in the unit (3002), not in .env — otherwise .env PORT=3001 wins.
if grep -q '^PORT=' "$ENV_FILE"; then
  sed -i '/^PORT=/d' "$ENV_FILE"
fi

sudo tee /etc/systemd/system/myfamilyhub-dev-api.service >/dev/null <<EOF
[Unit]
Description=すみっチョぐらし DEV API (Postgres)
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=${SERVER_DIR}
EnvironmentFile=${ENV_FILE}
Environment=PORT=3002
Environment=WEBAUTHN_RP_ID=sumicchogurashi-dev.duckdns.org
Environment=WEBAUTHN_ORIGIN=https://sumicchogurashi-dev.duckdns.org
Environment=WEBAUTHN_RP_NAME=すみっチョぐらし
Environment=DATA_FILE=${REPO_ROOT}/30_data/tasks-dev.json
Environment=DOCUMENT_SCAN_DIR=${REPO_ROOT}/30_data/document-scans
# MEMORY_AUTH intentionally unset — use Prisma/Postgres
ExecStart=/usr/bin/node ${SERVER_DIR}/dist/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "==> Rebuild API & restart"
cd "$REPO_ROOT"
npm run build --workspace @personal-app/server
sudo systemctl daemon-reload
sudo systemctl enable --now myfamilyhub-dev-api
sudo systemctl restart myfamilyhub-dev-api
sudo systemctl status myfamilyhub-dev-api --no-pager

echo ""
echo "Done. Passkey data will persist across API restarts."
echo "DB was empty after migrate — register again once with Passkey (bootstrap)."
curl -s "http://127.0.0.1:3002/api/health" || true
echo
