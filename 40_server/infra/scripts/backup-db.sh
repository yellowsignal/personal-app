#!/usr/bin/env bash
# Daily Postgres dump for dig or prod. Keeps only recent files on the server.
#
# Usage on OCI:
#   bash ~/personal-app/40_server/infra/scripts/backup-db.sh            # prod (default)
#   bash ~/personal-app/40_server/infra/scripts/backup-db.sh dig
#   RETENTION_DAYS=14 bash ~/personal-app/40_server/infra/scripts/backup-db.sh prod
#
# Output:
#   ~/personal-app/30_data/backups/{prod|dig}/myfamilyhub-YYYYMMDD-HHMMSS.dump
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVER_DIR="$REPO_ROOT/40_server"
TARGET="${1:-prod}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"

case "$TARGET" in
  prod)
    COMPOSE_FILE="$SERVER_DIR/docker-compose.prod.yml"
    PROJECT="myfamilyhub-prod"
    ENV_FILE="$SERVER_DIR/.env.prod"
    COMPOSE_ENV=(--env-file "$ENV_FILE")
    ;;
  dig)
    COMPOSE_FILE="$SERVER_DIR/docker-compose.dig.yml"
    PROJECT="myfamilyhub-dig"
    ENV_FILE=""
    COMPOSE_ENV=()
    ;;
  *)
    echo "Usage: $0 [prod|dig]" >&2
    exit 1
    ;;
esac

BACKUP_DIR="$REPO_ROOT/30_data/backups/$TARGET"
mkdir -p "$BACKUP_DIR"
# Restrict listing of dump files (contain family data)
chmod 700 "$REPO_ROOT/30_data/backups" 2>/dev/null || true
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

OUT_HOST="$BACKUP_DIR/myfamilyhub-${STAMP}.dump"
TMP_IN_CONTAINER="/tmp/myfamilyhub-${TARGET}-${STAMP}.dump"

cd "$SERVER_DIR"

if [[ "$TARGET" == "prod" && ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

CID="$(sudo docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "${COMPOSE_ENV[@]}" ps -q postgres)"
if [[ -z "$CID" ]]; then
  echo "Postgres container for $TARGET is not running." >&2
  exit 1
fi

echo "==> Dump $TARGET → $OUT_HOST"
sudo docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "${COMPOSE_ENV[@]}" exec -T postgres \
  pg_dump -U myfamilyhub -d myfamilyhub -Fc -f "$TMP_IN_CONTAINER"
sudo docker cp "$CID:$TMP_IN_CONTAINER" "$OUT_HOST"
sudo docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "${COMPOSE_ENV[@]}" exec -T postgres \
  rm -f "$TMP_IN_CONTAINER"
chmod 600 "$OUT_HOST"

BYTES="$(wc -c < "$OUT_HOST" | tr -d ' ')"
if [[ "$BYTES" -lt 1000 ]]; then
  echo "ERROR: dump looks empty ($BYTES bytes): $OUT_HOST" >&2
  exit 1
fi
echo "    size: ${BYTES} bytes"

echo "==> Prune dumps older than ${RETENTION_DAYS} days in $BACKUP_DIR"
find "$BACKUP_DIR" -type f -name 'myfamilyhub-*.dump' -mtime "+${RETENTION_DAYS}" -print -delete || true

# Also remove empty .downloaded markers older than retention
find "$BACKUP_DIR" -type f -name 'myfamilyhub-*.dump.downloaded' -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

echo "Done. Latest: $OUT_HOST"
ls -lh "$BACKUP_DIR" | tail -n 20
