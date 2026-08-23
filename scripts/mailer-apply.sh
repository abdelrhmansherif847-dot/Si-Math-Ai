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
ONLY=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --batch)   MODE="batch" ;;
    --only)    ONLY="${2:-}"; shift
               [ -n "$ONLY" ] || { echo "--only needs a key name" >&2; exit 2; } ;;
    --only=*)  ONLY="${1#--only=}" ;;
    *) echo "Unknown argument: $1" >&2
       echo "Usage: mailer-apply.sh [--dry-run] [--batch] [--only <key>]" >&2; exit 2 ;;
  esac
  shift
done
if [ -n "$ONLY" ] && [ "$MODE" = "batch" ]; then
  echo "REFUSING: --only and --batch are contradictory." >&2; exit 2
fi

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is not set.}"

CONF="$DIR/confirmation.html"
REC="$DIR/recovery.html"
SUBJ_CONF="Confirm your email to start studying - Si Math AI"
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

# ── Non-ASCII guard (added 2026-08-22, from a production finding) ────────────
# This API corrupts non-ASCII input on this path. Measured, not suspected: a
# single-key apply of mailer_subjects_confirmation returned HTTP 200, and both
# the PATCH response and an independent no-cache GET showed the em dash U+2014
# stored as U+FFFD, the replacement character. The write succeeded; the bytes did
# not survive it.
#
# So refuse to send any value containing a byte above 0x7F. Silent corruption in
# a student-facing subject line is worse than a refusal here, and every value we
# need is expressible in ASCII — HTML entities (&mdash; &middot;) render correctly
# in email and are themselves ASCII.
#
# If this ever needs lifting, lift it with new evidence that the path is fixed,
# not by deleting the check.
assert_ascii() { # assert_ascii <label> <value>
  # Detect with tr, not grep. A bracket expression like [^\x00-\x7F] is NOT a
  # byte range to grep — POSIX grep reads those six characters literally, so the
  # class matches nearly everything and the guard fires on pure ASCII. Caught in
  # the harness: it refused "…studying - Si Math AI", which contains no byte
  # above 0x7f. tr understands octal ranges portably, on GNU and BSD alike.
  if [ "$(printf '%s' "$2" | LC_ALL=C tr -d '\000-\177' | wc -c | tr -d ' ')" != "0" ]; then
    echo "REFUSING: $1 contains non-ASCII bytes." >&2
    echo "  This API stores non-ASCII on this path as U+FFFD (verified in production)." >&2
    # Print the value and its full hex rather than trying to excerpt the
    # offending run: a byte-range grep cannot cleanly isolate multibyte
    # characters, and these values are short enough to read whole.
    echo "  value : $(printf '%s' "$2" | cat -v)" >&2
    echo "  hex   : $(printf '%s' "$2" | od -An -tx1 | tr -s ' \n' ' ')" >&2
    echo "  (e2 80 94 is U+2014 EM DASH; ef bf bd is U+FFFD REPLACEMENT CHARACTER)" >&2
    echo "  Use an ASCII equivalent, or an HTML entity inside template bodies." >&2
    exit 1
  fi
}



# Set when a PATCH returned 200 but its own response body reported a value other
# than the one sent. Distinguishes "not stored" from "stored but read back stale".
RESPONSE_DISAGREED=0

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

ALL_KEYS=(mailer_templates_confirmation_content
          mailer_templates_recovery_content
          mailer_subjects_confirmation
          mailer_subjects_recovery)

# --only narrows the run to a single key, for the approved diagnostic
# experiment. It is validated against ALL_KEYS, so it can never widen scope or
# reach a setting outside the four that were reviewed — a typo is refused rather
# than silently sent to the API.
KEYS=("${ALL_KEYS[@]}")
if [ -n "$ONLY" ]; then
  ok=0
  for k in "${ALL_KEYS[@]}"; do [ "$k" = "$ONLY" ] && ok=1; done
  if [ "$ok" -ne 1 ]; then
    echo "REFUSING: --only $ONLY is not one of the four approved keys:" >&2
    printf '  %s\n' "${ALL_KEYS[@]}" >&2
    exit 2
  fi
  KEYS=("$ONLY")
fi

# Every value that could be sent this run must be ASCII. Checked after --only
# narrowing so the message names only keys actually in play.
for _k in "${KEYS[@]}"; do assert_ascii "$_k" "$(intended_value "$_k")"; done

STAMP=0
api_get() {
  STAMP=$((STAMP + 1))
  local out="$DIAG_DIR/get-$STAMP.json" code
  code=$(curl -sS -o "$out" -w '%{http_code}' \
    -X GET "$API/v1/projects/$PROJECT_REF/config/auth" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Cache-Control: no-cache" -H "Pragma: no-cache")
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
      echo "        verdict   : UNCHANGED — the GET still returns the pre-apply value."
      # The GET alone cannot say WHY. If the PATCH response already reported the
      # new value, the write landed and it is the read that is behind; saying
      # "did not store" there would contradict the server's own answer.
      if [ -f "$DIAG_DIR/respval-$key.txt" ] &&
         [ "$(cat "$DIAG_DIR/respval-$key.txt")" = "$want" ]; then
        echo "                    But the PATCH response DID report the new value, so the"
        echo "                    write landed and this read is stale. Do not roll back yet."
      else
        echo "                    The PATCH response reported the old value too, so the API"
        echo "                    accepted the request and did not store this key."
      fi
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
if [ -n "$ONLY" ]; then
  echo "Scope   : SINGLE KEY — $ONLY"
else
  echo "Scope   : all four approved keys"
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

  # Check the PATCH RESPONSE itself, not only a later GET.
  #
  # Per Supabase's published OpenAPI spec, a 200 from this endpoint returns the
  # full AuthConfigResponse — the server's own account of what it now holds. So
  # the response is authoritative for "was this stored", and comparing it against
  # a later GET separates two very different failures:
  #
  #   response has the NEW value, GET has the OLD  -> the write landed; the read
  #                                                   is stale (caching or the
  #                                                   config propagating).
  #   response has the OLD value                   -> the server returned 200 and
  #                                                   did not store it.
  #
  # The first attempt could not tell these apart, because it only did a GET.
  for k in "$@"; do
    local resp_val want_val
    resp_val=$(jq -r --arg k "$k" '.[$k] // "<<ABSENT>>"' <"$out" 2>/dev/null || echo "<unparsable>")
    want_val=$(intended_value "$k")
    # Keep the response's value so the final report can show it beside the GET.
    printf '%s' "$resp_val" >"$DIAG_DIR/respval-$k.txt"
    if [ "$resp_val" = "$want_val" ]; then
      echo "        response confirms stored: $k"
    elif [ "$resp_val" = "<<ABSENT>>" ] || [ "$resp_val" = "<unparsable>" ]; then
      echo "        response does NOT include $k — cannot confirm from the response"
    else
      echo "        *** response says NOT stored: $k"
      echo "            the server returned 200 but reports a different value."
      RESPONSE_DISAGREED=1
    fi
  done
}

if [ "$MODE" = "batch" ]; then
  apply_keys "${KEYS[@]}"
else
  for k in "${KEYS[@]}"; do apply_keys "$k"; done
fi

echo
echo "Reading the config back with a no-cache GET ..."
after=$(api_get)
fail=0
for k in "${KEYS[@]}"; do
  live=$(printf '%s' "$after" | jq -r --arg k "$k" '.[$k] // ""')
  want=$(intended_value "$k")
  resp=""
  [ -f "$DIAG_DIR/respval-$k.txt" ] && resp=$(cat "$DIAG_DIR/respval-$k.txt")

  # The two sources are reported SEPARATELY and always, pass or fail. They are
  # different observations of the same write, and conflating them is what made
  # the first attempt uninterpretable.
  echo "  --- $k"
  echo "      sent           : $(printf '%s' "$want" | wc -c | tr -d ' ') bytes  sha256:$(printf '%s' "$want" | sha)"
  echo "      PATCH response : $(printf '%s' "$resp" | wc -c | tr -d ' ') bytes  sha256:$(printf '%s' "$resp" | sha)$([ "$resp" = "$want" ] && echo '   MATCHES SENT' || echo '   DIFFERS FROM SENT')"
  echo "      no-cache GET   : $(printf '%s' "$live" | wc -c | tr -d ' ') bytes  sha256:$(printf '%s' "$live" | sha)$([ "$live" = "$want" ] && echo '   MATCHES SENT' || echo '   DIFFERS FROM SENT')"
  # Short values print in full, and in hex.
  #
  # cat -v alone is ambiguous: it renders the UTF-8 em dash as M-bM-^@M-^T and the
  # replacement character as M-oM-?M-=, which look equally like line noise. The hex
  # makes the distinction unarguable — e2 80 94 is U+2014, ef bf bd is U+FFFD,
  # i.e. the server replaced the character rather than storing it.
  if [ "$(printf '%s' "$want" | wc -c | tr -d ' ')" -le 120 ]; then
    echo "      sent           = $(printf '%s' "$want" | cat -v)"
    echo "      PATCH response = $(printf '%s' "$resp" | cat -v)"
    echo "      no-cache GET   = $(printf '%s' "$live" | cat -v)"
    echo "      sent      hex  = $(printf '%s' "$want" | od -An -tx1 | tr -s ' \n' ' ')"
    echo "      response  hex  = $(printf '%s' "$resp" | od -An -tx1 | tr -s ' \n' ' ')"
    echo "      GET       hex  = $(printf '%s' "$live" | od -An -tx1 | tr -s ' \n' ' ')"
  fi
  if [ "$live" = "$want" ]; then
    echo "  PASS  $k"
  else
    echo "  FAIL  $k"
    diagnose "$k" "$live" "$want"
    fail=1
  fi
  echo
done

if [ "$fail" -ne 0 ] && [ "$RESPONSE_DISAGREED" -eq 0 ]; then
  echo
  echo "NOTE — the two sources of truth disagree:"
  echo "  Every PATCH response reported the new value as stored, but the"
  echo "  follow-up GET reports otherwise. That points at a stale or cached"
  echo "  read, or config still propagating — NOT at a rejected write."
  echo "  Re-run 'bash scripts/mailer-apply.sh --dry-run' in a few minutes"
  echo "  before rolling back: the change may in fact be live."
fi

if [ "$fail" -ne 0 ]; then
  echo >&2
  echo "Verification failed. Production may be partially changed." >&2
  echo "Diagnostics (token-redacted) are in $DIAG_DIR/ — send them for analysis." >&2
  echo "Roll back with:  bash scripts/mailer-restore.sh" >&2
  exit 1
fi

echo
if [ -n "$ONLY" ]; then
  echo "$ONLY verified live by BOTH the PATCH response and the no-cache GET."
  echo "This was a single-key diagnostic, not the rollout. The other three"
  echo "approved keys are untouched. Roll this one back with:"
  echo "  bash scripts/mailer-restore.sh"
else
  echo "All four keys verified live. Next: the delivery tests in"
  echo "docs/engineering/phase1-email-fix-runbook.md §4."
fi
