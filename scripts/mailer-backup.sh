#!/usr/bin/env bash
# Back up the live Supabase Auth mailer configuration, then prove the backup can
# restore it. Run this BEFORE scripts/mailer-apply.sh — that script refuses to
# run without a verified backup, because the Supabase dashboard keeps no history
# and an unbacked template change is not reversible.
#
#   export SUPABASE_ACCESS_TOKEN=...   # https://supabase.com/dashboard/account/tokens
#   bash scripts/mailer-backup.sh
#
# Writes ./mailer-config-backup.json (gitignored — it is account configuration,
# not source). Keep it until the rollout is confirmed good.
set -euo pipefail

PROJECT_REF="${PROJECT_REF:-igvkyxkmjnkzscqgommj}"
OUT="${OUT:-mailer-config-backup.json}"

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is not set. Create one at https://supabase.com/dashboard/account/tokens}"

if [ -e "$OUT" ]; then
  echo "REFUSING: $OUT already exists." >&2
  echo "Overwriting it would destroy the only copy of the pre-change templates." >&2
  echo "Move it aside first if you really mean to take a new backup." >&2
  exit 1
fi

echo "Reading live auth config for project $PROJECT_REF ..."
http=$(curl -sS -o /tmp/mailer-raw.json -w '%{http_code}' \
  -X GET "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")

if [ "$http" != "200" ]; then
  echo "FAILED: Management API returned HTTP $http" >&2
  # The body can echo the request; show only the message field, never the token.
  jq -r '.message // .error // "no message"' </tmp/mailer-raw.json >&2 2>/dev/null || true
  rm -f /tmp/mailer-raw.json
  exit 1
fi

# Keep every mailer_* key, not just the two being changed: restoring a partial
# snapshot would silently reset whatever was not captured.
jq 'to_entries | map(select(.key | startswith("mailer_"))) | from_entries' \
  </tmp/mailer-raw.json >"$OUT"
rm -f /tmp/mailer-raw.json

echo "Wrote $OUT"
echo
echo "── Verifying the backup is readable and sufficient to restore ──"

fail=0
check() { # check <label> <jq-filter-returning-boolean>
  if [ "$(jq -r "$2" <"$OUT")" = "true" ]; then
    echo "  PASS  $1"
  else
    echo "  FAIL  $1"; fail=1
  fi
}

check "file is valid JSON and an object"        'type == "object"'
check "captured at least 5 mailer_* keys"       '(keys | length) >= 5'
check "confirmation template captured"          'has("mailer_templates_confirmation_content")'
check "confirmation subject captured"           'has("mailer_subjects_confirmation")'
check "recovery template captured"              'has("mailer_templates_recovery_content")'
check "recovery subject captured"               'has("mailer_subjects_recovery")'
# A null would restore as "unset", not as the previous value — that is a silent
# data loss on restore, so treat it as a failed backup rather than a warning.
check "no captured value is null"               '[.[] | select(. == null)] | length == 0'

echo
echo "Keys captured:"
jq -r 'keys[] | "  " + .' <"$OUT"

if [ "$fail" -ne 0 ]; then
  echo >&2
  echo "BACKUP IS NOT SUFFICIENT — do not apply anything. Investigate above." >&2
  exit 1
fi

echo
echo "Backup verified. Current confirmation template, exactly as live:"
echo "────────────────────────────────────────────────────────────────"
jq -r '.mailer_templates_confirmation_content' <"$OUT"
echo "────────────────────────────────────────────────────────────────"
echo
echo "Safe to run: bash scripts/mailer-apply.sh"
