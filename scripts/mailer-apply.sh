#!/usr/bin/env bash
# Apply the two APPROVED Supabase Auth email templates, and nothing else.
#
#   export SUPABASE_ACCESS_TOKEN=...
#   bash scripts/mailer-backup.sh     # must run first
#   bash scripts/mailer-apply.sh
#
# Approved 2026-08-22. Source of truth for the content is the two files in
# docs/engineering/email-templates/ — this script reads them rather than
# embedding copies, so what ships is what was reviewed.
#
# Scope, deliberately narrow: four keys. Two templates, two subjects. It touches
# no DNS, no auth flow, no provider, no user data, and no other mailer setting.
set -euo pipefail

PROJECT_REF="${PROJECT_REF:-igvkyxkmjnkzscqgommj}"
BACKUP="${BACKUP:-mailer-config-backup.json}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs/engineering/email-templates"

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is not set.}"

if [ ! -s "$BACKUP" ]; then
  echo "REFUSING: no backup at $BACKUP. Run scripts/mailer-backup.sh first." >&2
  exit 1
fi
if [ "$(jq -r 'has("mailer_templates_confirmation_content")' <"$BACKUP")" != "true" ]; then
  echo "REFUSING: $BACKUP does not contain the confirmation template — it cannot restore." >&2
  exit 1
fi

CONF="$DIR/confirmation.html"
REC="$DIR/recovery.html"
for f in "$CONF" "$REC"; do
  [ -s "$f" ] || { echo "REFUSING: missing or empty $f" >&2; exit 1; }
done

# Guard the one property that makes this change reversible and testable: the
# authentication mechanism must be untouched. If a future edit ever swapped
# ConfirmationURL for TokenHash, this script must not be the thing that ships it.
for f in "$CONF" "$REC"; do
  n=$(grep -c '{{ \.ConfirmationURL }}' "$f" || true)
  [ "$n" = "2" ] || { echo "REFUSING: $f has $n ConfirmationURL occurrences, expected 2." >&2; exit 1; }
  if grep -q 'TokenHash\|verifyOtp\|confirm\.html' "$f"; then
    echo "REFUSING: $f references a different auth flow. Not approved." >&2; exit 1
  fi
done

echo "Applying approved templates to project $PROJECT_REF ..."
payload=$(jq -n \
  --arg c "$(cat "$CONF")" \
  --arg r "$(cat "$REC")" \
  '{mailer_templates_confirmation_content: $c,
    mailer_templates_recovery_content:     $r,
    mailer_subjects_confirmation: "Confirm your email to start studying — Si Math AI",
    mailer_subjects_recovery:     "Reset your Si Math AI password"}')

http=$(curl -sS -o /tmp/mailer-apply.json -w '%{http_code}' \
  -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$payload")

if [ "$http" != "200" ]; then
  echo "FAILED: Management API returned HTTP $http" >&2
  jq -r '.message // .error // "no message"' </tmp/mailer-apply.json >&2 2>/dev/null || true
  rm -f /tmp/mailer-apply.json
  echo "Nothing was changed. Your backup at $BACKUP is untouched." >&2
  exit 1
fi
rm -f /tmp/mailer-apply.json

echo "Applied. Reading the config back to confirm it took ..."
curl -sS -X GET "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" >/tmp/mailer-after.json

fail=0
verify() { # verify <label> <live-value> <expected-value>
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; else echo "  FAIL  $1"; fail=1; fi
}
verify "confirmation template matches the approved file" \
  "$(jq -r '.mailer_templates_confirmation_content' </tmp/mailer-after.json)" "$(cat "$CONF")"
verify "recovery template matches the approved file" \
  "$(jq -r '.mailer_templates_recovery_content' </tmp/mailer-after.json)" "$(cat "$REC")"
verify "confirmation subject" \
  "$(jq -r '.mailer_subjects_confirmation' </tmp/mailer-after.json)" \
  "Confirm your email to start studying — Si Math AI"
verify "recovery subject" \
  "$(jq -r '.mailer_subjects_recovery' </tmp/mailer-after.json)" \
  "Reset your Si Math AI password"
rm -f /tmp/mailer-after.json

if [ "$fail" -ne 0 ]; then
  echo >&2
  echo "The live config does not match what was sent. Roll back:" >&2
  echo "  bash scripts/mailer-restore.sh" >&2
  exit 1
fi

echo
echo "Live config matches the approved templates. Next: the delivery tests in"
echo "docs/engineering/phase1-email-fix-runbook.md §4."
