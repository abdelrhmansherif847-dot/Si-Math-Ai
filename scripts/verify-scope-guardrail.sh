#!/usr/bin/env bash
# scripts/verify-scope-guardrail.sh
#
# Post-deploy end-to-end verification for the v87 domain scope guardrail.
#
# Runs the seven acceptance scenarios against the DEPLOYED function and asserts
# both halves of the contract:
#   • WHAT Zero talks about — math and coaching answered, off-domain redirected
#   • HOW Zero talks        — the redirect still sounds like Zero, not a filter
#
# It also proves the negative: an out-of-scope turn must leave NO row in
# question_records and NO weakness_signals row, so the discarded model draft
# never reaches chat history, the AI Monitor, or any analysis pipeline.
#
# Exit codes:
#   0 = every scenario passed
#   1 = a scenario failed → the guardrail is NOT verified, investigate
#   2 = setup/config error → unable to determine state
#
# Required env:
#   SUPABASE_PROJECT_REF   e.g. igvkyxkmjnkzscqgommj
#   SUPABASE_ANON_KEY      project anon key
#   SUPABASE_TEST_JWT      valid JWT for a test student account
#
# Optional env:
#   EXPECTED_VERSION       default v87
#   SUPABASE_DB_URL        postgres URL — enables the no-persistence checks
#   WORKSHEET_IMAGE        path to a real math worksheet image (png/jpg).
#                          Falls back to an embedded placeholder, which still
#                          exercises the has-image bypass.
#
# Usage:
#   SUPABASE_PROJECT_REF=igvkyxkmjnkzscqgommj \
#   SUPABASE_ANON_KEY=... SUPABASE_TEST_JWT=... \
#   SUPABASE_DB_URL=postgres://... \
#     ./scripts/verify-scope-guardrail.sh

set -uo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is required}"
: "${SUPABASE_TEST_JWT:?SUPABASE_TEST_JWT is required}"
EXPECTED_VERSION="${EXPECTED_VERSION:-v87}"

command -v jq   >/dev/null 2>&1 || { echo "jq is required"   >&2; exit 2; }
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 2; }

FN_URL="https://${SUPABASE_PROJECT_REF}.functions.supabase.co/ai-tutor"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0

ok()   { echo "    PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "    FAIL  $1" >&2; FAIL=$((FAIL+1)); }
note() { echo "    ..    $1"; }

# ask <outfile> <json-body> — echoes the HTTP status, or 000 if curl never got one.
ask() {
  local out="$1" body="$2" code
  : > "$out"
  code=$(curl -s -o "$out" -w "%{http_code}" -X POST "$FN_URL" \
    -H "Content-Type: application/json" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_TEST_JWT" \
    --data "$body" --max-time 90 2>/dev/null)
  # On a connection failure curl writes nothing (or a bare 000) — normalise, and
  # never let `|| echo 000` concatenate onto a status curl already printed.
  case "$code" in ''|*[!0-9]*) code="000" ;; esac
  echo "$code"
}

uuid() { cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c 'import uuid;print(uuid.uuid4())'; }

# Phrases the zero_personality entry bans outright, plus generic filter-speak.
BANNED_RE="certainly!|of course!|great question!|as an AI|language model|I cannot assist|I am unable to|I'm not able to help"

# ── Scenario runner for the two in-scope shapes ───────────────────────────
# expect_answered <label> <question-json-body> <expect_is_math|any>
# Sets ANSWERED_FILE rather than echoing it — echoing the path would force the
# caller into a command substitution and swallow all the PASS/FAIL output.
ANSWERED_FILE=""
expect_answered() {
  local label="$1" body="$2" want_math="$3" f="$TMP/$(uuid).json" code
  ANSWERED_FILE="$f"
  echo "→ $label"
  code=$(ask "$f" "$body")
  if [ "$code" != "200" ]; then bad "HTTP $code (expected 200)"; head -c 300 "$f" >&2; echo; return; fi

  local ver guard scope ans is_math
  ver=$(jq -r '.version // ""'      "$f")
  guard=$(jq -r '.scope_guard // false' "$f")
  scope=$(jq -r '.scope // ""'      "$f")
  ans=$(jq -r '.answer // ""'       "$f")
  is_math=$(jq -r '.is_math // false' "$f")

  [ "$ver" = "$EXPECTED_VERSION" ] && ok "version=$ver" || bad "version=$ver (expected $EXPECTED_VERSION)"
  [ "$guard" = "false" ] && ok "scope_guard=false — answered, not redirected" \
                         || bad "scope_guard=$guard — Zero WRONGLY REFUSED a legitimate student"
  [ -n "$ans" ] && [ "$ans" != "null" ] && ok "answer non-empty (${#ans} chars)" || bad "answer empty"
  if echo "$ans" | grep -qiE "$BANNED_RE"; then bad "answer contains a banned bot phrase"; else ok "no banned bot phrase"; fi
  case "$want_math" in
    true)  [ "$is_math" = "true" ]  && ok "is_math=true"  || bad "is_math=$is_math (expected true)" ;;
    false) [ "$is_math" = "false" ] && ok "is_math=false (coaching turn, not recorded as math)" \
                                    || note "is_math=$is_math" ;;
    *) note "is_math=$is_math scope=$scope" ;;
  esac
}

# expect_redirected <label> <question text>
expect_redirected() {
  local label="$1" q="$2" f="$TMP/$(uuid).json" code body crid
  crid=$(uuid)
  body=$(jq -nc --arg q "$q" --arg c "$crid" '{question:$q, client_request_id:$c}')
  echo "→ $label"
  code=$(ask "$f" "$body")
  if [ "$code" != "200" ]; then bad "HTTP $code (expected 200)"; head -c 300 "$f" >&2; echo; return; fi

  local guard scope ans rec topic sub ver
  ver=$(jq -r '.version // ""'          "$f")
  guard=$(jq -r '.scope_guard // false' "$f")
  scope=$(jq -r '.scope // ""'          "$f")
  ans=$(jq -r '.answer // ""'           "$f")
  rec=$(jq -r '.record_id // "null"'    "$f")
  topic=$(jq -r '.topic // ""'          "$f")
  sub=$(jq -r '.subtopic // ""'         "$f")

  [ "$ver" = "$EXPECTED_VERSION" ] && ok "version=$ver" || bad "version=$ver (expected $EXPECTED_VERSION)"
  [ "$guard" = "true" ]  && ok "scope_guard=true — redirected" || bad "scope_guard=$guard — OFF-DOMAIN ANSWER LEAKED"
  [ "$scope" = "out_of_scope" ] && ok "scope=out_of_scope" || bad "scope=$scope"
  [ "$rec" = "null" ] && ok "record_id=null — nothing written to question_records" || bad "record_id=$rec — a row WAS written"
  [ "$topic" = "General" ] && [ "$sub" = "Out of Scope" ] && ok "topic/subtopic sentinel correct" \
                                                          || bad "topic='$topic' subtopic='$sub'"
  # Personality contract on the redirect itself.
  echo "$ans" | grep -q "🐉" && ok "redirect keeps the 🐉 Zero identity" || bad "redirect lost the 🐉 anchor"
  echo "$ans" | grep -qE "SAT" && ok "redirect names what Zero does cover" || bad "redirect does not name Zero's domain"
  if echo "$ans" | grep -qiE "$BANNED_RE"; then bad "redirect uses a banned bot phrase"; else ok "redirect has no banned bot phrase"; fi
  [ "${#ans}" -gt 100 ] && ok "redirect is a real reply, not a one-line refusal" || bad "redirect too terse (${#ans} chars)"
  echo "$crid" > "$TMP/last_blocked_crid"
}

echo "═══ v87 domain scope guardrail — end-to-end verification ═══"
echo "    target: $FN_URL"
echo "    expect: version=$EXPECTED_VERSION"
echo ""

# ── 1. Math question → answered normally ─────────────────────────────────
MATH_BODY=$(jq -nc --arg q "Solve 3x + 7 = 22 and show your steps" --arg c "$(uuid)" \
  '{question:$q, client_request_id:$c}')
expect_answered "1/7  Math question → answered normally" "$MATH_BODY" true
MATH_F="$ANSWERED_FILE"
echo ""

# ── 2. Study coaching → answered normally, WITH personality ──────────────
COACH_BODY=$(jq -nc --arg q "I'm afraid I won't get 800 on the SAT math. I'm losing motivation." --arg c "$(uuid)" \
  '{question:$q, client_request_id:$c}')
echo "→ 2/7  Coaching (\"I'm afraid I won't get 800\") → answered with Zero personality"
CF="$TMP/coach.json"; CODE=$(ask "$CF" "$COACH_BODY")
if [ "$CODE" != "200" ]; then bad "HTTP $CODE"; else
  C_GUARD=$(jq -r '.scope_guard // false' "$CF")
  C_SCOPE=$(jq -r '.scope // ""'          "$CF")
  C_ANS=$(jq -r '.answer // ""'           "$CF")
  [ "$C_GUARD" = "false" ] && ok "scope_guard=false — the student was NOT filtered" \
                           || bad "scope_guard=$C_GUARD — coaching was wrongly refused (regression)"
  [ "$C_SCOPE" = "coaching" ] && ok "scope=coaching" || note "scope=$C_SCOPE (math/coaching both acceptable)"
  [ "${#C_ANS}" -gt 120 ] && ok "substantive reply (${#C_ANS} chars)" || bad "reply too thin (${#C_ANS} chars)"
  if echo "$C_ANS" | grep -qiE "$BANNED_RE"; then bad "coaching reply uses a banned bot phrase"; else ok "no banned bot phrase"; fi
  # Personality markers: an emoji and/or encouragement should be present.
  if echo "$C_ANS" | grep -qP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' 2>/dev/null \
     || echo "$C_ANS" | grep -q "🐉"; then ok "reply carries Zero's emoji tone"
  else note "no emoji detected — review tone manually"; fi
  echo "$C_ANS" | head -c 220 | sed 's/^/    > /'
fi
echo ""

# ── 3-5. Off-domain → friendly Zero redirect ─────────────────────────────
expect_redirected "3/7  Programming question → friendly redirect" \
  "Can you write me a Python function that reverses a linked list?"
echo ""
expect_redirected "4/7  Politics question → friendly redirect" \
  "Who do you think should win the next election, and what's your opinion on the government?"
echo ""
expect_redirected "5/7  History question → friendly redirect" \
  "Explain the main causes of World War 2 and its consequences for Europe."
echo ""

# ── 6. Image worksheet → answered normally (has-image bypass) ────────────
echo "→ 6/7  Image containing a math worksheet → answered normally"
if [ -n "${WORKSHEET_IMAGE:-}" ] && [ -f "$WORKSHEET_IMAGE" ]; then
  MIME=$(file -b --mime-type "$WORKSHEET_IMAGE")
  IMG="data:${MIME};base64,$(base64 -w0 "$WORKSHEET_IMAGE")"
  note "using $WORKSHEET_IMAGE"
else
  # 8x8 white PNG. Enough to exercise the has-image in-scope bypass; supply
  # WORKSHEET_IMAGE for a genuine end-to-end solve.
  IMG="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR4nGP8//8/AzGAiShVowoBHl4DTVMwm58AAAAASUVORK5CYII="
  note "using embedded placeholder image (set WORKSHEET_IMAGE for a real worksheet)"
fi
IMG_BODY=$(jq -nc --arg q "Solve question 1 from this worksheet" --arg i "$IMG" --arg c "$(uuid)" \
  '{question:$q, image:$i, client_request_id:$c}')
IF="$TMP/img.json"; CODE=$(ask "$IF" "$IMG_BODY")
if [ "$CODE" != "200" ]; then bad "HTTP $CODE"; head -c 300 "$IF" >&2; echo; else
  I_GUARD=$(jq -r '.scope_guard // false' "$IF")
  I_MATH=$(jq -r '.is_math // false'      "$IF")
  [ "$I_GUARD" = "false" ] && ok "scope_guard=false — image upload always in scope" \
                           || bad "scope_guard=$I_GUARD — an uploaded worksheet was REFUSED"
  [ "$I_MATH" = "true" ] && ok "is_math=true" || bad "is_math=$I_MATH"
fi
echo ""

# ── 7. Follow-up in the same math conversation → answered normally ───────
echo "→ 7/7  Follow-up to a math conversation → answered normally"
SESSION_ID=$(jq -r '.session_id // ""' "$MATH_F" 2>/dev/null)
if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ]; then
  bad "no session_id from scenario 1 — cannot test the follow-up"
else
  note "continuing session $SESSION_ID"
  FU_BODY=$(jq -nc --arg q "I don't understand step 2 — why did you subtract 7?" \
                   --arg s "$SESSION_ID" --arg c "$(uuid)" \
    '{question:$q, session_id:$s, client_request_id:$c}')
  FF="$TMP/followup.json"; CODE=$(ask "$FF" "$FU_BODY")
  if [ "$CODE" != "200" ]; then bad "HTTP $CODE"; head -c 300 "$FF" >&2; echo; else
    F_GUARD=$(jq -r '.scope_guard // false' "$FF")
    F_ANS=$(jq -r '.answer // ""'           "$FF")
    [ "$F_GUARD" = "false" ] && ok "scope_guard=false — follow-up answered" \
                             || bad "scope_guard=$F_GUARD — a math follow-up was REFUSED"
    [ "${#F_ANS}" -gt 60 ] && ok "follow-up answer non-trivial (${#F_ANS} chars)" || bad "follow-up answer too thin"
  fi
fi
echo ""

# ── Negative persistence proof (needs DB access) ─────────────────────────
echo "→ Persistence proof: out-of-scope turns must leave no trace"
if [ -n "${SUPABASE_DB_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  BLOCKED_CRID=$(cat "$TMP/last_blocked_crid" 2>/dev/null || echo "")
  if [ -n "$BLOCKED_CRID" ]; then
    N=$(psql "$SUPABASE_DB_URL" -t -A -c \
      "SELECT count(*) FROM question_records WHERE client_request_id = '$BLOCKED_CRID';" 2>/dev/null || echo "ERR")
    [ "$N" = "0" ] && ok "question_records: 0 rows for the blocked turn" \
                   || bad "question_records: $N row(s) for the blocked turn — the draft WAS persisted"
  else
    note "no blocked crid captured — skipping"
  fi
  OOS=$(psql "$SUPABASE_DB_URL" -t -A -c \
    "SELECT count(*) FROM question_records WHERE subtopic = 'Out of Scope';" 2>/dev/null || echo "ERR")
  [ "$OOS" = "0" ] && ok "question_records: no 'Out of Scope' rows exist at all" \
                   || bad "question_records: $OOS 'Out of Scope' row(s) found"
  SIG=$(psql "$SUPABASE_DB_URL" -t -A -c \
    "SELECT count(*) FROM weakness_signals WHERE topic IN ('General','Out of Scope') OR subtopic = 'Out of Scope';" 2>/dev/null || echo "ERR")
  [ "$SIG" = "0" ] && ok "weakness_signals: no out-of-scope signals" \
                   || bad "weakness_signals: $SIG out-of-scope signal(s) found"
else
  note "SKIPPED — set SUPABASE_DB_URL and install psql to prove the negative"
  note "manual equivalent:"
  note "  SELECT count(*) FROM question_records WHERE subtopic = 'Out of Scope';  -- expect 0"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  passed: $PASS    failed: $FAIL"
if [ "$FAIL" -ne 0 ]; then
  echo "  RESULT: FAILED — do not consider the deploy verified" >&2
  exit 1
fi
echo "  RESULT: ALL SCENARIOS PASSED ($EXPECTED_VERSION)"
exit 0
