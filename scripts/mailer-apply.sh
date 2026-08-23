#!/usr/bin/env bash
# Apply the two APPROVED Supabase Auth email templates, and nothing else.
#
#   export SUPABASE_ACCESS_TOKEN=...
#   bash scripts/mailer-backup.sh           # must run first
#   bash scripts/mailer-apply.sh --dry-run  # read-only: what WOULD change
#   bash scripts/mailer-apply.sh            # apply, one key at a time, verified
#
# Approved 2026-08-22. Content lives in docs/engineering/email-templates/ — this
# script reads those files rather than embedding copies, so what ships is what
# was reviewed.
#
# SCOPE — exactly four keys, unchanged from the reviewed version:
#   mailer_templates_confirmation_content
#   mailer_templates_recovery_content
#   mailer_subjects_confirmation
#   mailer_subjects_recovery
# No DNS, no auth flow, no ConfirmationURL change, no Apple config, no users,
# no other auth setting.
#
# ── WHY THIS SCRIPT WAS REWRITTEN (2026-08-22) ───────────────────────────────
# The first version sent all four keys in ONE PATCH, received HTTP 200, then
# failed read-back on three of the four — and had already deleted the response
# body, so there was nothing left to diagnose. Production was rolled back
# cleanly, but the cause is still unknown. Three things changed, all aimed at
# making the next attempt conclusive instead of repeating a blind PATCH:
#
#   1. --dry-run compares live against intended using a GET only. Zero writes.
#   2. Keys are applied ONE AT A TIME and verified individually, so a partial
#      acceptance is attributable to a specific key rather than to a 4-key blob.
#   3. Every response body is preserved (token-redacted), and a failed
#      verification prints byte-level diagnostics — including whether the live
#      value still equals the PRE-APPLY backup, which is what distinguishes
#      "the API ignored this key" from "the API rewrote it".
set -euo pipefail

PROJECT_REF="${PROJECT_REF:-igvkyxkmjnkzscqgommj}"
BACKUP="${BACKUP:-mailer-config-backup.json}"
API="${API:-https://api.supabase.com}"
DIAG_DIR="${DIAG_DIR:-mailer-diagnostics}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs/engineering/email-templates"

DRY_RUN=0
MODE="sequential"
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --batch)   MODE="batch" ;;
    *) echo "Unknown argument: $arg" >&2
       echo "Usage: mailer-apply.sh [--dry-run] [--batch]" >&2; exit 2 ;;
  esac
done

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is not set.}"

CONF="$DIR/confirmation.html"
REC="$DIR/recovery.html"
SUBJ_CONF="Confirm your email to start studying — Si Math AI"
SUBJ_REC="Reset your Si Math AI password"

# ── Preconditions (protections carried over unchanged) ───────────────────────
if [ "$DRY_RUN" -eq 0 ]; then
  if [ ! -s "$BACKUP" ]; then
    echo "REFUSING: no backup at $BACKUP. Run scripts/mailer-backup.sh first." >&2
    exit 1
  fi
  if [ "$(jq -r 'has("mailer_templates_confirmation_content")' <"$BACKUP")" != "true" ]; then
    echo "REFUSING: $BACKUP does not contain the confirmation template — it cannot restore." >&2
    exit 1
  fi
fi
for f in "$CONF" "$REC"; do
  [ -s "$f" ] || { echo "REFUSING: missing or empty $f" >&2; exit 1; }
  n=$(grep -c '{{ \.ConfirmationURL }}' "$f" || true)
  [ "$n" = "2" ] || { echo "REFUSING: $f has $n ConfirmationURL occurrences, expected 2." >&2; exit 1; }
  if grep -q 'TokenHash\|verifyOtp\|confirm\.html' "$f"; then
    echo "REFUSING: $f references a different auth flow. Not approved." >&2
    exit 1
  fi
done

mkdir -p "$DIAG_DIR"

sha() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -c1-16
  else shasum -a 256 | cut -c1-16; fi
}

# Never let the token reach a file or the terminal, even if the API echoes the
# request back inside an error body.
redact() { sed "s|${SUPABASE_ACCESS_TOKEN}|<REDACTED>|g"; }

intended_value() {
  case "$1" in
    mailer_templates_confirmation_content) cat "$CONF" ;;
    mailer_templates_recovery_content)     cat "$REC" ;;
    mailer_subjects_confirmation)          printf '%s' "$SUBJ_CONF" ;;
    mailer_subjects_recovery)              printf '%s' "$SUBJ_REC" ;;
    *) echo "internal error: unknown key $1" >&2; exit 3 ;;
  esac
}

KEYS=(mailer_templates_confirmation_content
      mailer_templates_recovery_content
      mailer_subjects_confirmation
      mailer_subjects_recovery)

STAMP=0
api_get() {
  STAMP=$((STAMP + 1))
  local out="$DIAG_DIR/get-$STAMP.json" code
  code=$(curl -sS -o "$out" -w '%{http_code}' \
    -X GET "$API/v1/projects/$PROJECT_REF/config/auth" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")
  redact <"$out" >"$out.tmp" && mv "$out.tmp" "$out"
  if [ "$code" != "200" ]; then
    echo "FAILED: GET returned HTTP $code" >&2
    jq -r '.message // .error // "no message"' <"$out" 2>/dev/null | sed 's/^/        /' >&2 || true
    exit 1
  fi
  cat "$out"
}

# Byte-level report for one field. Prints nothing sensitive.
diagnose() { # diagnose <key> <live-value> <intended-value>
  local key="$1" live="$2" want="$3" lb wb lh wh old off start
  lb=$(printf '%s' "$live" | wc -c | tr -d ' ')
  wb=$(printf '%s' "$want" | wc -c | tr -d ' ')
  lh=$(printf '%s' "$live" | sha)
  wh=$(printf '%s' "$want" | sha)
  echo "        intended  : ${wb} bytes  sha256:${wh}"
  echo "        live      : ${lb} bytes  sha256:${lh}"

  # The single most useful discriminator: is the live value still what was there
  # BEFORE the apply? If so, the API returned 200 and ignored the key. If it is
  # neither the old nor the intended value, the API rewrote it.
  if [ -s "$BACKUP" ]; then
    old=$(jq -r --arg k "$key" '.[$k] // ""' <"$BACKUP")
    if [ "$live" = "$old" ]; then
      echo "        verdict   : UNCHANGED — still byte-identical to the pre-apply backup."
      echo "                    The API accepted the request but did not store this key."
    elif [ "$live" = "$want" ]; then
      echo "        verdict   : matches intended"
    else
      echo "        verdict   : TRANSFORMED — differs from BOTH the pre-apply value"
      echo "                    and the intended value. The API rewrote it."
    fi
  fi

  if [ -z "$live" ]; then
    echo "        note      : live value is EMPTY or absent from the response."
    return
  fi

  # First differing byte with context, so truncation or a stray escape is visible.
  #
  # cmp reports the offset as "differ: char N" on GNU and BSD alike — NOT "byte
  # N", which an earlier version of this function matched on, so it silently
  # never found an offset and reported every mismatch as a prefix. Accept both
  # words. The offset cmp gives is 1-based.
  off=$(cmp <(printf '%s' "$want") <(printf '%s' "$live") 2>/dev/null |
        sed -n 's/.*differ: \(char\|byte\) \([0-9]*\).*/\2/p' || true)
  if [ -n "${off:-}" ]; then
    start=$(( off > 21 ? off - 21 : 0 ))
    echo "        first diff: byte $off (1-based)"
    echo "        intended ~ $(printf '%s' "$want" | dd bs=1 skip=$start count=48 2>/dev/null | cat -v)"
    echo "        live     ~ $(printf '%s' "$live" | dd bs=1 skip=$start count=48 2>/dev/null | cat -v)"
  elif [ "$lb" -ne "$wb" ]; then
    echo "        first diff: none in the common prefix — one value is a prefix of the"
    echo "                    other, i.e. truncated or appended, not altered in place."
  else
    echo "        first diff: cmp found none and the lengths match, yet the strings"
    echo "                    compared unequal. Investigate the diagnostics files."
  fi
}

echo "Project : $PROJECT_REF"
if [ "$DRY_RUN" -eq 1 ]; then
  echo "Mode    : DRY RUN — no writes"
else
  echo "Mode    : apply ($MODE)"
fi
echo "Diags   : $DIAG_DIR/"
echo

# ── Dry run: compare only, write nothing ─────────────────────────────────────
if [ "$DRY_RUN" -eq 1 ]; then
  now=$(api_get)
  differs=0
  for k in "${KEYS[@]}"; do
    live=$(printf '%s' "$now" | jq -r --arg k "$k" '.[$k] // ""')
    want=$(intended_value "$k")
    if [ "$live" = "$want" ]; then
      echo "  ALREADY SET   $k"
    else
      echo "  WOULD CHANGE  $k"
      diagnose "$k" "$live" "$want"
      differs=1
    fi
    echo
  done
  if [ "$differs" -eq 0 ]; then
    echo "Nothing to do — the live config already matches the approved templates."
  fi
  echo "Dry run complete. NOTHING was written."
  exit 0
fi

# ── Apply ────────────────────────────────────────────────────────────────────
apply_keys() { # apply_keys <key>...
  local payload out code label
  label=$(printf '%s ' "$@")
  if [ "$#" -eq 1 ]; then
    payload=$(jq -n --arg k "$1" --arg v "$(intended_value "$1")" '{($k): $v}')
  else
    payload=$(jq -n \
      --arg a "$(intended_value mailer_templates_confirmation_content)" \
      --arg b "$(intended_value mailer_templates_recovery_content)" \
      --arg c "$SUBJ_CONF" --arg d "$SUBJ_REC" \
      '{mailer_templates_confirmation_content: $a,
        mailer_templates_recovery_content:     $b,
        mailer_subjects_confirmation:          $c,
        mailer_subjects_recovery:              $d}')
  fi
  out="$DIAG_DIR/patch-$1.json"
  code=$(curl -sS -o "$out" -w '%{http_code}' \
    -X PATCH "$API/v1/projects/$PROJECT_REF/config/auth" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json; charset=utf-8" \
    -d "$payload")
  # Preserve the body, token-redacted. Its absence is what made the first
  # failure undiagnosable.
  redact <"$out" >"$out.tmp" && mv "$out.tmp" "$out"
  echo "  PATCH ${label}-> HTTP $code   (body saved: $out)"
  if [ "$code" != "200" ]; then
    jq -r '.message // .error // "no message"' <"$out" 2>/dev/null | sed 's/^/        /' || true
    echo "        Stopping. Backup at $BACKUP is untouched." >&2
    exit 1
  fi
}

if [ "$MODE" = "batch" ]; then
  apply_keys "${KEYS[@]}"
else
  for k in "${KEYS[@]}"; do apply_keys "$k"; done
fi

echo
echo "Reading the config back to verify ..."
after=$(api_get)
fail=0
for k in "${KEYS[@]}"; do
  live=$(printf '%s' "$after" | jq -r --arg k "$k" '.[$k] // ""')
  want=$(intended_value "$k")
  if [ "$live" = "$want" ]; then
    echo "  PASS  $k"
  else
    echo "  FAIL  $k"
    diagnose "$k" "$live" "$want"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo >&2
  echo "Verification failed. Production may be partially changed." >&2
  echo "Diagnostics (token-redacted) are in $DIAG_DIR/ — send them for analysis." >&2
  echo "Roll back with:  bash scripts/mailer-restore.sh" >&2
  exit 1
fi

echo
echo "All four keys verified live. Next: the delivery tests in"
echo "docs/engineering/phase1-email-fix-runbook.md §4."
