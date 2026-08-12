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
BRANCH="cursor/continue-latest-mockup-69de"
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

if [[ "$FRONTEND_ONLY" -eq 0 ]]; then
  echo "==> prisma migrate deploy"
  cd "$REPO_ROOT/40_server"
  npx prisma migrate deploy
  cd "$REPO_ROOT"
fi

echo "==> build client"
npm run build --workspace @personal-app/client

echo "==> rsync static → $DEST"
sudo mkdir -p "$DEST"
sudo rsync -a --delete "$REPO_ROOT/20_client/dist/" "$DEST/"

if [[ "$FRONTEND_ONLY" -eq 0 ]]; then
  echo "==> build server"
  npm run build --workspace @personal-app/server
  echo "==> restart myfamilyhub-dev-api"
  sudo systemctl restart myfamilyhub-dev-api
  sleep 1
  curl -sS http://127.0.0.1:3002/api/health || true
  echo
fi

echo "Done. https://sumicchogurashi-dev.duckdns.org"
