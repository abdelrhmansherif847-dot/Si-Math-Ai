#!/usr/bin/env bash
# Roll back the auth email settings to exactly what was live before the change,
# from the snapshot scripts/mailer-backup.sh took.
#
#   export SUPABASE_ACCESS_TOKEN=...
#   bash scripts/mailer-restore.sh
#
# Restores EVERY mailer_* key captured in the backup, not just the four that were
# changed — a partial restore would leave the config in a state that never
# actually existed.
#
# ── WHY THIS NOW ASKS BEFORE RUNNING ─────────────────────────────────────────
# The rollout it was written to undo has since SUCCEEDED. Production carries the
# four approved values, verified against both the PATCH response and an
# independent no-cache GET. Running this script today would silently revert all
# of them to Supabase's stock defaults, undoing work that took several diagnostic
# cycles to land — and the earlier sections of the runbook still say "roll back
# with mailer-restore.sh", so a future session could reasonably reach for it.
#
# The ability to restore is deliberately NOT removed. It is gated. When a new
# rollout begins, set ROLLOUT_FINAL=0 in a reviewed commit and this script goes
# back to running unprompted — the same idiom as SiAuthApple.ENABLED.
set -euo pipefail

# 1 = production holds a verified rollout; require explicit confirmation.
# 0 = a rollout is in progress; restore is the normal safety net, no prompt.
ROLLOUT_FINAL=1

PROJECT_REF="${PROJECT_REF:-igvkyxkmjnkzscqgommj}"
BACKUP="${BACKUP:-mailer-config-backup.json}"
API="${API:-https://api.supabase.com}"
CONFIRM_PHRASE="REVERT VERIFIED ROLLOUT"

ACK=0
for arg in "$@"; do
  case "$arg" in
    --revert-verified-rollout) ACK=1 ;;
    *) echo "Unknown argument: $arg" >&2
       echo "Usage: mailer-restore.sh [--revert-verified-rollout]" >&2; exit 2 ;;
  esac
done

if [ "$ROLLOUT_FINAL" = "1" ]; then
  cat >&2 <<'BANNER'
────────────────────────────────────────────────────────────────────────────
  STOP. Production currently holds the VERIFIED final mailer configuration.

    mailer_subjects_confirmation           applied and verified
    mailer_subjects_recovery               applied and verified
    mailer_templates_confirmation_content  applied and verified (CRLF stored)
    mailer_templates_recovery_content      applied and verified (CRLF stored)

  This script reverts ALL of them to the pre-rollout snapshot — Supabase's
  stock default templates and subjects. That is almost certainly not what you
  want. See docs/engineering/phase1-email-fix-runbook.md.
────────────────────────────────────────────────────────────────────────────
BANNER
  if [ "$ACK" -ne 1 ]; then
    echo "REFUSING: pass --revert-verified-rollout if you truly intend this." >&2
    exit 1
  fi
  # A flag alone is too easy to paste from an old runbook line, so also require
  # the phrase to be typed (or set deliberately for automation).
  if [ -n "${MAILER_ROLLBACK_CONFIRM:-}" ]; then
    given="$MAILER_ROLLBACK_CONFIRM"
  elif [ -t 0 ]; then
    printf 'Type exactly "%s" to proceed: ' "$CONFIRM_PHRASE" >&2
    IFS= read -r given
  else
    echo "REFUSING: no terminal to confirm on. Set" >&2
    echo "  MAILER_ROLLBACK_CONFIRM='$CONFIRM_PHRASE'" >&2
    echo "only if you are certain." >&2
    exit 1
  fi
  if [ "$given" != "$CONFIRM_PHRASE" ]; then
    echo "REFUSING: confirmation phrase did not match. Nothing was changed." >&2
    exit 1
  fi
  echo "Confirmed. Proceeding with rollback." >&2
fi

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is not set.}"
[ -s "$BACKUP" ] || { echo "REFUSING: no backup at $BACKUP — nothing to restore from." >&2; exit 1; }
[ "$(jq -r 'type' <"$BACKUP")" = "object" ] || { echo "REFUSING: $BACKUP is not a JSON object." >&2; exit 1; }

echo "Restoring $(jq -r 'keys | length' <"$BACKUP") mailer_* keys to project $PROJECT_REF ..."
http=$(curl -sS -o /tmp/mailer-restore.json -w '%{http_code}' \
  -X PATCH "$API/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary @"$BACKUP")

if [ "$http" != "200" ]; then
  echo "FAILED: Management API returned HTTP $http" >&2
  jq -r '.message // .error // "no message"' </tmp/mailer-restore.json >&2 2>/dev/null || true
  rm -f /tmp/mailer-restore.json
  exit 1
fi
rm -f /tmp/mailer-restore.json

# Verify EVERY captured key, not just the confirmation template.
#
# The old check compared only mailer_templates_confirmation_content. During the
# first failed rollout that template had never changed, so the check passed
# whether or not the restore had written anything — a green check that could not
# have gone red (docs/roadmap/verification-framework-audit.md). It proved nothing.
curl -sS -X GET "$API/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Cache-Control: no-cache" -H "Pragma: no-cache" >/tmp/mailer-check.json

fail=0
checked=0
while IFS= read -r k; do
  checked=$((checked + 1))
  want=$(jq -r --arg k "$k" '.[$k] // ""' <"$BACKUP")
  live=$(jq -r --arg k "$k" '.[$k] // ""' </tmp/mailer-check.json)
  # Supabase canonicalises template line endings to CRLF, so compare with CR
  # stripped — otherwise a correct restore reports as failed. See the runbook.
  if [ "$(printf '%s' "$want" | tr -d '\r')" = "$(printf '%s' "$live" | tr -d '\r')" ]; then
    echo "  PASS  $k"
  else
    echo "  FAIL  $k — live differs from the backup" >&2
    fail=1
  fi
done < <(jq -r 'keys[]' <"$BACKUP")
rm -f /tmp/mailer-check.json

if [ "$checked" -eq 0 ]; then
  echo "FAILED: the backup contained no keys to verify." >&2
  exit 1
fi
if [ "$fail" -ne 0 ]; then
  echo "Rollback did NOT fully succeed. Investigate before retrying." >&2
  exit 1
fi
echo "Rollback complete — all $checked captured keys verified against the backup."
