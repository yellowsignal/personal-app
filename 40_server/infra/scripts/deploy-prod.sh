#!/usr/bin/env bash
# Full prod deploy on the OCI host — promote dig-verified builds to real domain.
#
# Usage (from anywhere on the server):
#   bash ~/personal-app/40_server/infra/scripts/deploy-prod.sh
#
# Options:
#   --frontend-only   skip migrate / server build / API restart
#   --skip-pull       do not git pull (use current checkout)
#
# Expects:
#   - .env.prod + myfamilyhub-api systemd (setup-prod-postgres.sh)
#   - nginx prod /api/ → 127.0.0.1:3001
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVER_DIR="$REPO_ROOT/40_server"
ENV_FILE="$SERVER_DIR/.env.prod"
# Live OCI nginx (sites-enabled/myfamilyhub) serves this root — not /var/www/myfamily.
DEST="/var/www/myfamilyhub"
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

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — run setup-prod-postgres.sh first." >&2
  exit 1
fi

cd "$REPO_ROOT"

if [[ "$SKIP_PULL" -eq 0 ]]; then
  echo "==> git fetch / checkout / reset --hard origin/$BRANCH"
  git fetch origin
  git checkout "$BRANCH"
  # Same as deploy-dig.sh: avoid deploying a stuck local main.
  git reset --hard "origin/$BRANCH"
fi

HEAD_SHA="$(git rev-parse --short HEAD)"
ORIGIN_SHA="$(git rev-parse --short "origin/$BRANCH" 2>/dev/null || true)"
echo "==> HEAD: $(git log -1 --oneline)"
if [[ "$SKIP_PULL" -eq 0 && -n "$ORIGIN_SHA" && "$HEAD_SHA" != "$ORIGIN_SHA" ]]; then
  echo "ERROR: HEAD ($HEAD_SHA) != origin/$BRANCH ($ORIGIN_SHA). Refusing to deploy stale tree." >&2
  echo "Fix: git fetch origin && git reset --hard origin/$BRANCH" >&2
  exit 1
fi

echo "==> npm install"
if [[ -f "$REPO_ROOT/package-lock.json" ]]; then
  npm ci
else
  npm install
fi

if [[ "$FRONTEND_ONLY" -eq 0 ]]; then
  echo "==> prisma migrate deploy (prod DATABASE_URL)"
  set -a
  # shellcheck disable=SC1091
  source "$ENV_FILE"
  set +a
  cd "$SERVER_DIR"
  npx prisma migrate deploy
  cd "$REPO_ROOT"
  mkdir -p "$REPO_ROOT/30_data/prod/photos"
fi

echo "==> build client"
npm run build --workspace @personal-app/client

echo "==> rsync static → $DEST"
sudo mkdir -p "$DEST"
sudo rsync -a --delete "$REPO_ROOT/20_client/dist/" "$DEST/"
JS_ASSET="$(basename "$(ls -1 "$DEST"/assets/index-*.js 2>/dev/null | head -1)")"
echo "==> static entry JS: ${JS_ASSET:-unknown}"

if [[ "$FRONTEND_ONLY" -eq 0 ]]; then
  echo "==> build server"
  npm run build --workspace @personal-app/server
  GIT_COMMIT="$(git rev-parse --short HEAD)"
  echo "==> ensure systemd TZ=UTC + GIT_COMMIT=${GIT_COMMIT}"
  sudo mkdir -p /etc/systemd/system/myfamilyhub-api.service.d
  sudo tee /etc/systemd/system/myfamilyhub-api.service.d/override.conf >/dev/null <<EOF
[Service]
Environment=TZ=UTC
Environment=GIT_COMMIT=${GIT_COMMIT}
EOF
  sudo systemctl daemon-reload
  echo "==> restart myfamilyhub-api"
  sudo systemctl restart myfamilyhub-api
  sleep 1
  HEALTH="$(curl -sS http://127.0.0.1:3001/api/health || true)"
  echo "$HEALTH"
  LIVE_COMMIT="$(printf '%s' "$HEALTH" | sed -n 's/.*"gitCommit":"\([^"]*\)".*/\1/p')"
  if [[ -n "$LIVE_COMMIT" && "$LIVE_COMMIT" != "$GIT_COMMIT" ]]; then
    echo "ERROR: API gitCommit=$LIVE_COMMIT but HEAD=$GIT_COMMIT — restart may have failed." >&2
    exit 1
  fi
fi

echo "Done. https://sumicchogurashi.duckdns.org (HEAD $HEAD_SHA)"
