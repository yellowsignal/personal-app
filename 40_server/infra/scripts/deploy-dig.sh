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
  echo "==> git fetch / checkout / reset --hard origin/$BRANCH"
  git fetch origin
  git checkout "$BRANCH"
  # Deploy host must match GitHub exactly — plain `pull` can leave an old HEAD
  # if the local branch was stuck or diverged (seen: dig built 662306a while main was d532cc1).
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
JS_ASSET="$(basename "$(ls -1 "$DEST"/assets/index-*.js 2>/dev/null | head -1)")"
echo "==> static entry JS: ${JS_ASSET:-unknown}"

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
Environment=FAMILY_ACTIVITY_NOTIFY_ACTOR=1
EOF
  sudo systemctl daemon-reload
  echo "==> restart myfamilyhub-dev-api"
  sudo systemctl restart myfamilyhub-dev-api
  sleep 1
  HEALTH="$(curl -sS http://127.0.0.1:3002/api/health || true)"
  echo "$HEALTH"
  LIVE_COMMIT="$(printf '%s' "$HEALTH" | sed -n 's/.*"gitCommit":"\([^"]*\)".*/\1/p')"
  if [[ -n "$LIVE_COMMIT" && "$LIVE_COMMIT" != "$GIT_COMMIT" ]]; then
    echo "ERROR: API gitCommit=$LIVE_COMMIT but HEAD=$GIT_COMMIT — restart may have failed." >&2
    exit 1
  fi
fi

echo "Done. https://sumicchogurashi-dev.duckdns.org (HEAD $HEAD_SHA)"
