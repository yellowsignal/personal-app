#!/usr/bin/env bash
# Full dig (dev) deploy on the OCI host — one command from Termius.
#
# Usage (from anywhere on the server):
#   bash ~/personal-app/40_server/infra/scripts/deploy-dig.sh
#
# Options:
#   --frontend-only   skip migrate / server build / API restart
#   --skip-pull       do not git pull (use current checkout)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DEST="/var/www/myfamilyhub-dev"
BRANCH="main"
FRONTEND_ONLY=0
SKIP_PULL=0

for arg in "$@"; do
  case "$arg" in
    --frontend-only) FRONTEND_ONLY=1 ;;
    --skip-pull) SKIP_PULL=1 ;;
    -h|--help)
      echo "Usage: $0 [--frontend-only] [--skip-pull]"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

cd "$REPO_ROOT"

if [[ "$SKIP_PULL" -eq 0 ]]; then
  echo "==> git fetch / checkout / pull ($BRANCH)"
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
fi

echo "==> HEAD: $(git log -1 --oneline)"

echo "==> npm install (client deps: jspdf, pdf-lib, tesseract.js, …)"
if [[ -f "$REPO_ROOT/package-lock.json" ]]; then
  npm ci
else
  npm install
fi

if [[ "$FRONTEND_ONLY" -eq 0 ]]; then
  echo "==> prisma migrate deploy"
  cd "$REPO_ROOT/40_server"
  npx prisma migrate deploy
  cd "$REPO_ROOT"
  mkdir -p "$REPO_ROOT/30_data/photos"
fi

echo "==> build client"
npm run build --workspace @personal-app/client

echo "==> rsync static → $DEST"
sudo mkdir -p "$DEST"
sudo rsync -a --delete "$REPO_ROOT/20_client/dist/" "$DEST/"

if [[ "$FRONTEND_ONLY" -eq 0 ]]; then
  echo "==> build server"
  npm run build --workspace @personal-app/server
  GIT_COMMIT="$(git rev-parse --short HEAD)"
  echo "==> ensure systemd TZ=UTC + GIT_COMMIT=${GIT_COMMIT}"
  sudo mkdir -p /etc/systemd/system/myfamilyhub-dev-api.service.d
  sudo tee /etc/systemd/system/myfamilyhub-dev-api.service.d/override.conf >/dev/null <<EOF
[Service]
Environment=TZ=UTC
Environment=GIT_COMMIT=${GIT_COMMIT}
EOF
  sudo systemctl daemon-reload
  echo "==> restart myfamilyhub-dev-api"
  sudo systemctl restart myfamilyhub-dev-api
  sleep 1
  curl -sS http://127.0.0.1:3002/api/health || true
  echo
fi

echo "Done. https://sumicchogurashi-dev.duckdns.org"
