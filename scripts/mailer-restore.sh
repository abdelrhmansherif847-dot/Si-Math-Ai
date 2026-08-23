#!/usr/bin/env bash
# Roll back the email templates to exactly what was live before the change, from
# the snapshot scripts/mailer-backup.sh took.
#
#   export SUPABASE_ACCESS_TOKEN=...
#   bash scripts/mailer-restore.sh
#
# Restores EVERY mailer_* key captured in the backup, not just the four that were
# changed — a partial restore would leave the config in a state that never
# actually existed.
set -euo pipefail

PROJECT_REF="${PROJECT_REF:-igvkyxkmjnkzscqgommj}"
BACKUP="${BACKUP:-mailer-config-backup.json}"
API="${API:-https://api.supabase.com}"

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is not set.}"
[ -s "$BACKUP" ] || { echo "REFUSING: no backup at $BACKUP — nothing to restore from." >&2; exit 1; }
[ "$(jq -r 'type' <"$BACKUP")" = "object" ] || { echo "REFUSING: $BACKUP is not a JSON object." >&2; exit 1; }

echo "Restoring $(jq -r 'keys | length' <"$BACKUP") mailer_* keys to project $PROJECT_REF ..."
http=$(curl -sS -o /tmp/mailer-restore.json -w '%{http_code}' \
  -X PATCH "$API/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @"$BACKUP")

if [ "$http" != "200" ]; then
  echo "FAILED: Management API returned HTTP $http" >&2
  jq -r '.message // .error // "no message"' </tmp/mailer-restore.json >&2 2>/dev/null || true
  rm -f /tmp/mailer-restore.json
  exit 1
fi
rm -f /tmp/mailer-restore.json

curl -sS -X GET "$API/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" >/tmp/mailer-check.json
if [ "$(jq -r '.mailer_templates_confirmation_content' </tmp/mailer-check.json)" \
   = "$(jq -r '.mailer_templates_confirmation_content' <"$BACKUP")" ]; then
  echo "  PASS  live confirmation template matches the backup"
else
  echo "  FAIL  live confirmation template still differs from the backup" >&2
  rm -f /tmp/mailer-check.json; exit 1
fi
rm -f /tmp/mailer-check.json
echo "Rollback complete."
