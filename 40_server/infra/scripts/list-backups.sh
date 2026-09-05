#!/usr/bin/env bash
# List DB dump files on the OCI host (and which ones were already fetched).
#
# Usage on OCI:
#   bash ~/personal-app/40_server/infra/scripts/list-backups.sh
#   bash ~/personal-app/40_server/infra/scripts/list-backups.sh prod
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET="${1:-}"
BASE="$REPO_ROOT/30_data/backups"

list_one() {
  local dir="$1"
  local name
  name="$(basename "$dir")"
  echo "==> $name ($dir)"
  if [[ ! -d "$dir" ]]; then
    echo "    (empty — no directory yet)"
    return
  fi
  local found=0
  # Newest first
  while IFS= read -r f; do
    found=1
    local mark=""
    if [[ -f "${f}.downloaded" ]]; then
      mark=" [downloaded $(cat "${f}.downloaded" 2>/dev/null | head -1)]"
    fi
    ls -lh "$f" | awk -v m="$mark" '{print "    "$5"  "$6" "$7" "$8"  "$9 m}'
  done < <(find "$dir" -maxdepth 1 -type f -name 'myfamilyhub-*.dump' | sort -r)
  if [[ "$found" -eq 0 ]]; then
    echo "    (no dumps)"
  fi
}

if [[ -n "$TARGET" ]]; then
  list_one "$BASE/$TARGET"
else
  list_one "$BASE/prod"
  list_one "$BASE/dig"
fi
