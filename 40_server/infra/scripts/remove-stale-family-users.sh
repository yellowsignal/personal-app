#!/usr/bin/env bash
# Remove dig-era family users left after Passkey re-signup on prod/dig.
# Dashboard chips / settings member count come from users.family_id — stale
# rows make it look like 4 people when only 2 real accounts remain.
#
# Always reassigns leftover owned rows to a same-name kept user (or --map)
# before DELETE, so shared assets/subscriptions are not cascade-dropped.
#
# Usage on OCI:
#   # 1) Inspect
#   bash ~/personal-app/40_server/infra/scripts/remove-stale-family-users.sh --env prod --list
#
#   # 2) Keep only the new Passkey users (example: 3 and 4), delete the rest in that family
#   bash ~/personal-app/40_server/infra/scripts/remove-stale-family-users.sh --env prod --keep 3,4 --apply
#
#   # Or delete explicit ids (still reassigns by name into --keep / remaining family)
#   bash ~/personal-app/40_server/infra/scripts/remove-stale-family-users.sh --env prod --delete 1,2 --keep 3,4 --apply
#
#   # Optional name map when dig name ≠ new name: oldId:newId,oldId:newId
#   bash ... --map 1:3,2:4 --delete 1,2 --keep 3,4 --apply
#
# Without --apply the script only prints the plan (dry-run).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVER_DIR="$REPO_ROOT/40_server"
ENV="prod"
KEEP_CSV=""
DELETE_CSV=""
MAP_CSV=""
APPLY=0
LIST_ONLY=0

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="${2:-}"; shift 2 ;;
    --keep) KEEP_CSV="${2:-}"; shift 2 ;;
    --delete) DELETE_CSV="${2:-}"; shift 2 ;;
    --map) MAP_CSV="${2:-}"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --list) LIST_ONLY=1; shift ;;
    -h|--help) usage ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      ;;
  esac
done

case "$ENV" in
  prod)
    COMPOSE_PROJECT="myfamilyhub-prod"
    COMPOSE_FILE="docker-compose.prod.yml"
    ENV_FILE="$SERVER_DIR/.env.prod"
    ;;
  dig|dev)
    COMPOSE_PROJECT="myfamilyhub-dig"
    COMPOSE_FILE="docker-compose.dig.yml"
    ENV_FILE="$SERVER_DIR/.env"
    ;;
  *)
    echo "ENV must be prod or dig (got: $ENV)" >&2
    exit 1
    ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

psql_q() {
  sudo docker compose -p "$COMPOSE_PROJECT" -f "$SERVER_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" \
    exec -T postgres psql -U myfamilyhub -d myfamilyhub "$@"
}

echo "==> env=$ENV project=$COMPOSE_PROJECT"
echo "==> users"
psql_q -c "SELECT id, name, role, family_id, left(email, 40) AS email FROM users ORDER BY id;"

echo "==> ownership counts"
psql_q -c "
SELECT u.id, u.name,
  (SELECT count(*) FROM assets a WHERE a.user_id = u.id) AS assets,
  (SELECT count(*) FROM subscriptions s WHERE s.user_id = u.id) AS subs,
  (SELECT count(*) FROM documents d WHERE d.user_id = u.id) AS docs,
  (SELECT count(*) FROM calendar_events c WHERE c.user_id = u.id) AS events,
  (SELECT count(*) FROM checklists k WHERE k.user_id = u.id) AS lists,
  (SELECT count(*) FROM photos p WHERE p.user_id = u.id) AS photos,
  (SELECT count(*) FROM passkey_credentials pk WHERE pk.user_id = u.id) AS passkeys
FROM users u
ORDER BY u.id;
"

if [[ "$LIST_ONLY" -eq 1 ]]; then
  echo "List only. Re-run with --keep <ids> --apply to delete stale users."
  exit 0
fi

if [[ -z "$KEEP_CSV" ]]; then
  echo "Need --keep id,id (users to retain). Use --list first." >&2
  exit 1
fi

# Validate keep ids exist
KEEP_OK="$(psql_q -Atc "SELECT string_agg(id::text, ',' ORDER BY id) FROM users WHERE id IN (${KEEP_CSV});")"
KEEP_OK="$(echo "$KEEP_OK" | tr -d '[:space:]')"
if [[ -z "$KEEP_OK" ]]; then
  echo "None of --keep ids exist: $KEEP_CSV" >&2
  exit 1
fi

FAMILY_IDS="$(psql_q -Atc "SELECT string_agg(DISTINCT family_id::text, ',') FROM users WHERE id IN (${KEEP_CSV}) AND family_id IS NOT NULL;")"
FAMILY_IDS="$(echo "$FAMILY_IDS" | tr -d '[:space:]')"
if [[ -z "$FAMILY_IDS" ]]; then
  echo "Keep users have no family_id — nothing to clean." >&2
  exit 1
fi

if [[ -n "$DELETE_CSV" ]]; then
  STALE_CSV="$DELETE_CSV"
else
  STALE_CSV="$(psql_q -Atc "
    SELECT string_agg(id::text, ',' ORDER BY id)
    FROM users
    WHERE family_id IN (${FAMILY_IDS})
      AND id NOT IN (${KEEP_CSV});
  ")"
  STALE_CSV="$(echo "$STALE_CSV" | tr -d '[:space:]')"
fi

if [[ -z "$STALE_CSV" ]]; then
  echo "No stale users to remove. Done."
  exit 0
fi

echo "==> plan: keep [$KEEP_CSV]  delete [$STALE_CSV]  families [$FAMILY_IDS]"

OVERLAP="$(psql_q -Atc "
  SELECT string_agg(id::text, ',' ORDER BY id)
  FROM users
  WHERE id IN (${STALE_CSV}) AND id IN (${KEEP_CSV});
")"
OVERLAP="$(echo "$OVERLAP" | tr -d '[:space:]')"
if [[ -n "$OVERLAP" ]]; then
  echo "keep and delete overlap: $OVERLAP" >&2
  exit 1
fi

# Build temp map table SQL: explicit --map plus same-name fallback
MAP_VALUES=""
if [[ -n "$MAP_CSV" ]]; then
  IFS=',' read -ra PAIRS <<<"$MAP_CSV"
  for pair in "${PAIRS[@]}"; do
    old="${pair%%:*}"
    new="${pair##*:}"
    [[ "$old" =~ ^[0-9]+$ && "$new" =~ ^[0-9]+$ ]] || { echo "bad --map entry: $pair" >&2; exit 1; }
    if [[ -n "$MAP_VALUES" ]]; then MAP_VALUES+=","; fi
    MAP_VALUES+="(${old},${new})"
  done
fi

SQL_PLAN="$(cat <<SQL
BEGIN;

CREATE TEMP TABLE keep_users AS
  SELECT id, name, family_id, role FROM users WHERE id IN (${KEEP_CSV});

CREATE TEMP TABLE stale_users AS
  SELECT id, name, family_id, role FROM users WHERE id IN (${STALE_CSV});

-- Refuse deleting someone outside the keep users' families
DO \$\$
BEGIN
  IF EXISTS (
    SELECT 1 FROM stale_users s
    WHERE s.family_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM keep_users k WHERE k.family_id IS NOT NULL AND k.family_id = s.family_id
       )
  ) THEN
    RAISE EXCEPTION 'refusing to delete user outside keep family set';
  END IF;
END \$\$;

CREATE TEMP TABLE remap (old_id int PRIMARY KEY, new_id int NOT NULL);

SQL
)"

if [[ -n "$MAP_VALUES" ]]; then
  SQL_PLAN+="
INSERT INTO remap (old_id, new_id) VALUES ${MAP_VALUES}
ON CONFLICT (old_id) DO UPDATE SET new_id = EXCLUDED.new_id;
"
fi

SQL_PLAN+="$(cat <<'SQL'

-- Same display name within family → keep user
INSERT INTO remap (old_id, new_id)
SELECT s.id, k.id
FROM stale_users s
JOIN keep_users k
  ON k.family_id = s.family_id
 AND k.name = s.name
ON CONFLICT (old_id) DO NOTHING;

-- Unmapped stale users with remaining owned rows: block
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(s.id::text || '(' || s.name || ')', ', ')
  INTO missing
  FROM stale_users s
  WHERE NOT EXISTS (SELECT 1 FROM remap r WHERE r.old_id = s.id)
    AND (
      EXISTS (SELECT 1 FROM assets a WHERE a.user_id = s.id)
      OR EXISTS (SELECT 1 FROM subscriptions x WHERE x.user_id = s.id)
      OR EXISTS (SELECT 1 FROM documents d WHERE d.user_id = s.id)
      OR EXISTS (SELECT 1 FROM calendar_events c WHERE c.user_id = s.id)
      OR EXISTS (SELECT 1 FROM checklists c WHERE c.user_id = s.id)
      OR EXISTS (SELECT 1 FROM photos p WHERE p.user_id = s.id)
      OR EXISTS (SELECT 1 FROM recurring_deposits r WHERE r.user_id = s.id)
      OR EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = s.id)
    );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'stale users still own rows but have no remap target: % (pass --map old:new)', missing;
  END IF;
END $$;

SELECT 'remap' AS kind, old_id, new_id FROM remap ORDER BY old_id;

UPDATE assets SET user_id = r.new_id FROM remap r WHERE assets.user_id = r.old_id;
UPDATE subscriptions SET user_id = r.new_id FROM remap r WHERE subscriptions.user_id = r.old_id;
UPDATE documents SET user_id = r.new_id FROM remap r WHERE documents.user_id = r.old_id;
UPDATE calendar_events SET user_id = r.new_id FROM remap r WHERE calendar_events.user_id = r.old_id;
UPDATE checklists SET user_id = r.new_id FROM remap r WHERE checklists.user_id = r.old_id;
UPDATE photos SET user_id = r.new_id FROM remap r WHERE photos.user_id = r.old_id;
UPDATE recurring_deposits SET user_id = r.new_id FROM remap r WHERE recurring_deposits.user_id = r.old_id;
UPDATE transactions SET user_id = r.new_id FROM remap r WHERE transactions.user_id = r.old_id;

-- Ensure an OWNER remains among keep users
UPDATE users SET role = 'OWNER'
WHERE id = (
  SELECT id FROM keep_users ORDER BY CASE WHEN role = 'OWNER' THEN 0 ELSE 1 END, id LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM keep_users WHERE role = 'OWNER');

SELECT 'will_delete' AS kind, id, name, role FROM stale_users ORDER BY id;
SELECT 'will_keep' AS kind, id, name, role FROM keep_users ORDER BY id;

SQL
)"

if [[ "$APPLY" -eq 1 ]]; then
  SQL_PLAN+="
DELETE FROM users WHERE id IN (SELECT id FROM stale_users);
COMMIT;
SELECT id, name, role, family_id FROM users WHERE family_id IN (${FAMILY_IDS}) ORDER BY id;
"
  echo "==> APPLY delete"
else
  SQL_PLAN+="
ROLLBACK;
"
  echo "==> DRY-RUN (no changes). Add --apply to execute."
fi

psql_q -v ON_ERROR_STOP=1 <<< "$SQL_PLAN"

echo "Done. Pull-to-refresh the app — member chips should match kept users only."
