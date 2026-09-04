#!/usr/bin/env bash
# Install / refresh daily cron for DB backups (prod by default; dig optional).
#
# Usage on OCI:
#   bash ~/personal-app/40_server/infra/scripts/install-backup-cron.sh
#   INCLUDE_DIG=1 bash ~/personal-app/40_server/infra/scripts/install-backup-cron.sh
#
# Default schedule: 03:15 JST-ish wall clock on the server (TZ=Asia/Tokyo if set in crontab).
# Override: CRON_SCHEDULE="30 2 * * *" bash .../install-backup-cron.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/40_server/infra/scripts/backup-db.sh"
LOG_DIR="$REPO_ROOT/30_data/backups/logs"
CRON_SCHEDULE="${CRON_SCHEDULE:-15 3 * * *}"
INCLUDE_DIG="${INCLUDE_DIG:-0}"
MARKER_BEGIN="# BEGIN myfamilyhub-db-backup"
MARKER_END="# END myfamilyhub-db-backup"

mkdir -p "$LOG_DIR"
chmod 700 "$REPO_ROOT/30_data/backups" 2>/dev/null || true
chmod 700 "$LOG_DIR" 2>/dev/null || true

if [[ ! -x "$SCRIPT" ]]; then
  chmod +x "$SCRIPT"
fi

# Smoke once so cron failures are not the first dump attempt
echo "==> Smoke backup (prod)"
bash "$SCRIPT" prod

LINES=()
LINES+=("$MARKER_BEGIN")
LINES+=("SHELL=/bin/bash")
LINES+=("TZ=Asia/Tokyo")
LINES+=("${CRON_SCHEDULE} ${SCRIPT} prod >>${LOG_DIR}/prod.log 2>&1")
if [[ "$INCLUDE_DIG" == "1" ]]; then
  # dig a few minutes later
  LINES+=("20 3 * * * ${SCRIPT} dig >>${LOG_DIR}/dig.log 2>&1")
fi
LINES+=("$MARKER_END")

BLOCK="$(printf '%s\n' "${LINES[@]}")"

EXISTING="$(crontab -l 2>/dev/null || true)"
# Strip previous managed block
FILTERED="$(printf '%s\n' "$EXISTING" | awk -v b="$MARKER_BEGIN" -v e="$MARKER_END" '
  $0 == b {skip=1; next}
  $0 == e {skip=0; next}
  !skip {print}
')"

{
  printf '%s\n' "$FILTERED"
  # Ensure blank line before block if crontab was non-empty
  if [[ -n "${FILTERED// }" ]]; then
    printf '\n'
  fi
  printf '%s\n' "$BLOCK"
} | crontab -

echo "==> Installed crontab:"
crontab -l | sed -n "/$MARKER_BEGIN/,/$MARKER_END/p"
echo
echo "Logs: $LOG_DIR"
echo "Dumps: $REPO_ROOT/30_data/backups/{prod,dig}/"
echo "Done."
