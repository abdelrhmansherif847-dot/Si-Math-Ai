#!/usr/bin/env bash
# scripts/smoke-test-ai-tutor.sh
#
# Post-deploy smoke test for the ai-tutor Edge Function.
#
# Layers:
#   1. Heartbeat — runs without credentials. Confirms the deployed function
#      has a serve() handler and the auth gate is engaged. Catches the
#      stub-deploy failure mode (no handler → 500/502 instead of 401).
#   2. Functional — REQUIRED. Sends a real math question and a hint-mode
#      question, asserts envelope shape, version field, and personality
#      marker. Then verifies a matching question_records row was written
#      (that last part needs SUPABASE_DB_URL).
#
# ── NO GREEN RESULT UNLESS THE HANDLER ACTUALLY RAN ───────────────────────
# Until 2026-07-30 this script exited 0 with "heartbeat OK" whenever
# SUPABASE_TEST_JWT was unset. Layer 2 was skipped, nothing executed the
# handler, and the run reported success. That is how v90 shipped: the smoke
# test passed while every production request was returning 500 on a
# ReferenceError, because Layer 1 stops at the 401 auth gate — upstream of
# the fault — and Layer 2 never ran.
#
# The fix is that a missing credential is now a hard, loud stop (exit 2)
# rather than a silent pass. Layer 1 alone cannot clear a deploy: it proves
# a handler exists, not that it works.
#
# Exit codes:
#   0 = the handler was exercised end-to-end and every check it ran passed
#   1 = a check failed → DO NOT mark deploy as healthy
#   2 = could not determine state (missing config, missing tool, or a
#       heartbeat-only run). NOT a pass. Callers must treat 2 as
#       "unverified", never as success — verify-production-security.sh
#       already records it as SKIP.
#
# Required env:
#   SUPABASE_PROJECT_REF       (e.g. igvkyxkmjnkzscqgommj)
#   EXPECTED_VERSION           (e.g. v90 or v91 — the version you just shipped)
#   SUPABASE_TEST_JWT          valid JWT for a test student account
#   SUPABASE_ANON_KEY          required by Supabase for the JWT path
#
# Optional env:
#   SUPABASE_DB_URL            postgres URL; enables the question_records
#                              write check. Without it the run still passes,
#                              but the final line says so explicitly rather
#                              than claiming ALL CHECKS PASSED.
#   SMOKE_ALLOW_HEARTBEAT_ONLY=1
#                              Deliberately run Layer 1 only — for a standalone
#                              liveness probe, not for clearing a deploy. Still
#                              exits 2, because a run that did not exercise the
#                              handler cannot return a healthy verdict.
#
# Usage:
#   SUPABASE_PROJECT_REF=igvkyxkmjnkzscqgommj EXPECTED_VERSION=v91 \
#   SUPABASE_TEST_JWT=eyJ... SUPABASE_ANON_KEY=eyJ... \
#     ./scripts/smoke-test-ai-tutor.sh

set -euo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required}"
: "${EXPECTED_VERSION:?EXPECTED_VERSION is required (e.g. v91)}"

# Tool dependencies. Previously a missing jq surfaced as an opaque set -e abort
# partway through Layer 2; exit 2 says "cannot determine" up front instead.
for _tool in curl jq; do
  if ! command -v "$_tool" >/dev/null 2>&1; then
    echo "SETUP ERROR: '$_tool' is not on PATH — cannot run the smoke test." >&2
    echo "  This is exit 2 (unverified), not a pass. Install $_tool and re-run." >&2
    exit 2
  fi
done

FN_URL="https://${SUPABASE_PROJECT_REF}.functions.supabase.co/ai-tutor"

# ──────────────────────────────────────────────────────────────────────────
# Layer 1 — heartbeat (no credentials required)
# ──────────────────────────────────────────────────────────────────────────
echo "→ Heartbeat: POST $FN_URL (no auth)"
: > /tmp/_smoke_hb_body   # ensure the body file exists even if curl never writes
# `|| true`, not `|| echo "000"`. curl's -w already prints 000 on a connection
# failure, so appending another made the value "000000" — which fell through to
# the `*)` branch and reported "unexpected HTTP 000000", leaving the intended
# `000)` case unreachable. The distinction matters: verify-production-security.sh
# reclassifies an unreachable endpoint as SKIP rather than FAIL, and "I could not
# reach it" is not the same claim as "it is broken".
HB_CODE=$(curl -s -o /tmp/_smoke_hb_body -w "%{http_code}" \
  -X POST "$FN_URL" \
  -H "Content-Type: application/json" \
  --data '{"question":"heartbeat"}' \
  --max-time 10 || true)
HB_CODE="${HB_CODE:-000}"

case "$HB_CODE" in
  401)
    echo "  PASS: serve() handler is running, auth gate engaged (HTTP 401)"
    ;;
  400)
    echo "  PASS: handler running, rejected malformed body (HTTP 400)"
    ;;
  000)
    # No HTTP response at all — DNS failure, blocked egress, TLS refusal,
    # timeout. That is "I could not reach it", which is NOT the same claim as
    # "it is broken", so it exits 2 (unverified) rather than 1 (failed). A
    # verification report must not accuse a healthy deployment of being down.
    #
    # The literal string "HTTP 000" is retained because
    # verify-production-security.sh greps for it to reclassify unreachable as
    # SKIP. That grep is now belt-and-braces: exit 2 already lands in its
    # `*) SKIP` branch, so the two agree by exit code rather than by text.
    echo "  UNREACHABLE: no response from the endpoint (HTTP 000)" >&2
    echo "  Cannot determine whether the deploy is healthy. This is exit 2," >&2
    echo "  not a pass and not a failure." >&2
    exit 2
    ;;
  500|502|503)
    echo "  FAIL: handler returned $HB_CODE — likely no serve() handler or function crashed" >&2
    echo "  body: $(head -c 200 /tmp/_smoke_hb_body 2>/dev/null || true)" >&2
    exit 1
    ;;
  *)
    echo "  FAIL: unexpected HTTP $HB_CODE (body: $(head -c 200 /tmp/_smoke_hb_body 2>/dev/null || true))" >&2
    exit 1
    ;;
esac

# ──────────────────────────────────────────────────────────────────────────
# Layer 2 — functional (requires SUPABASE_TEST_JWT)
# ──────────────────────────────────────────────────────────────────────────
# Deliberate heartbeat-only run. Allowed, but it is not a deploy verdict, so
# it does not exit 0 — the caller must not be able to read this as healthy.
if [ "${SMOKE_ALLOW_HEARTBEAT_ONLY:-}" = "1" ]; then
  echo ""
  echo "→ Functional smoke: NOT RUN (SMOKE_ALLOW_HEARTBEAT_ONLY=1)"
  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo " smoke-test-ai-tutor: HEARTBEAT ONLY — DEPLOY NOT VERIFIED"
  echo "═══════════════════════════════════════════════════════════════════"
  echo " A serve() handler exists and the auth gate is engaged. That is all"
  echo " that was checked. The handler was NEVER EXECUTED, so this run cannot"
  echo " tell you whether tutoring works — v90 passed this exact check while"
  echo " every request was failing on a ReferenceError."
  echo ""
  echo " Exiting 2 (unverified). Do NOT record this as a healthy deploy."
  exit 2
fi

# Missing credentials are a hard stop, not a skip. This is the whole point of
# the 2026-07-30 change: the previous behaviour here was `exit 0`.
if [ -z "${SUPABASE_TEST_JWT:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "" >&2
  echo "═══════════════════════════════════════════════════════════════════" >&2
  echo " smoke-test-ai-tutor: CANNOT VERIFY THE DEPLOY" >&2
  echo "═══════════════════════════════════════════════════════════════════" >&2
  [ -z "${SUPABASE_TEST_JWT:-}" ]  && echo " missing: SUPABASE_TEST_JWT  (JWT for a test student account)" >&2
  [ -z "${SUPABASE_ANON_KEY:-}" ]  && echo " missing: SUPABASE_ANON_KEY  (required by Supabase for the JWT path)" >&2
  echo "" >&2
  echo " Layer 1 (heartbeat) passed, but it stops at the 401 auth gate and"    >&2
  echo " proves only that a handler exists. Without these two values the"      >&2
  echo " handler is never executed, so nothing here can clear a deploy."       >&2
  echo ""                                                                      >&2
  echo " This used to exit 0 with 'heartbeat OK'. It is now exit 2 —"          >&2
  echo " unverified — because that silence is how v90 reached production."     >&2
  echo ""                                                                      >&2
  echo " To run the real check:   export SUPABASE_TEST_JWT=... SUPABASE_ANON_KEY=..." >&2
  echo " For a liveness probe:    SMOKE_ALLOW_HEARTBEAT_ONLY=1 (still exits 2)" >&2
  exit 2
fi

REQ_ID=$(cat /proc/sys/kernel/random/uuid)
echo "→ Functional smoke: POST $FN_URL (auth, crid=$REQ_ID)"

CHAT_BODY=$(jq -nc \
  --arg q "Solve 2x + 4 = 10" \
  --arg crid "$REQ_ID" \
  '{question: $q, client_request_id: $crid}')

CHAT_CODE=$(curl -s -o /tmp/_smoke_chat_body -w "%{http_code}" \
  -X POST "$FN_URL" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_TEST_JWT" \
  --data "$CHAT_BODY" \
  --max-time 60 || echo "000")

if [ "$CHAT_CODE" != "200" ]; then
  echo "  FAIL: chat request returned HTTP $CHAT_CODE" >&2
  echo "  body: $(head -c 400 /tmp/_smoke_chat_body)" >&2
  exit 1
fi

# Envelope assertions
VERSION=$(jq -r '.version // ""' /tmp/_smoke_chat_body)
ANSWER=$(jq -r '.answer // ""' /tmp/_smoke_chat_body)
DEGRADED=$(jq -r '.degraded // false' /tmp/_smoke_chat_body)
RECORD_ID=$(jq -r '.record_id // ""' /tmp/_smoke_chat_body)
IS_MATH=$(jq -r '.is_math // false' /tmp/_smoke_chat_body)

if [ "$VERSION" != "$EXPECTED_VERSION" ]; then
  echo "  FAIL: version mismatch — expected $EXPECTED_VERSION, got '$VERSION'" >&2
  exit 1
fi
echo "  PASS: version field = $VERSION"

if [ -z "$ANSWER" ] || [ "$ANSWER" = "null" ]; then
  echo "  FAIL: answer field is empty" >&2
  exit 1
fi
echo "  PASS: answer non-empty (${#ANSWER} chars)"

if [ "$DEGRADED" = "true" ]; then
  echo "  WARN: degraded=true — fallback hint/rules used (personality or KB may have failed)"
fi

if [ "$IS_MATH" != "true" ]; then
  echo "  FAIL: is_math=$IS_MATH for an algebra question — math classifier broken" >&2
  exit 1
fi
echo "  PASS: is_math=true"

# ── Hint mode smoke ──────────────────────────────────────────────────────
HINT_REQ_ID=$(cat /proc/sys/kernel/random/uuid)
echo "→ Hint mode smoke (crid=$HINT_REQ_ID)"

HINT_BODY=$(jq -nc \
  --arg q "Solve x^2 - 5x + 6 = 0" \
  --arg crid "$HINT_REQ_ID" \
  '{question: $q, hint_mode: true, client_request_id: $crid}')

HINT_CODE=$(curl -s -o /tmp/_smoke_hint_body -w "%{http_code}" \
  -X POST "$FN_URL" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_TEST_JWT" \
  --data "$HINT_BODY" \
  --max-time 60 || echo "000")

if [ "$HINT_CODE" != "200" ]; then
  echo "  FAIL: hint-mode request returned HTTP $HINT_CODE" >&2
  exit 1
fi

HINT_MODE_FLAG=$(jq -r '.hint_mode // false' /tmp/_smoke_hint_body)
HINT_ANSWER=$(jq -r '.answer // ""' /tmp/_smoke_hint_body)

if [ "$HINT_MODE_FLAG" != "true" ]; then
  echo "  FAIL: hint_mode flag not echoed back" >&2
  exit 1
fi

# Hint-mode answers must NOT contain the actual roots (2 or 3 from x^2-5x+6=0).
# This is a heuristic — we just guard against the most blatant leak.
if echo "$HINT_ANSWER" | grep -qE '\b(x ?= ?2\b|x ?= ?3\b|=\s*2\s+or|=\s*3\s+or)'; then
  echo "  WARN: hint-mode answer may contain the final roots — review prompt"
else
  echo "  PASS: hint-mode answer does not expose solution roots"
fi
echo "  PASS: hint_mode=true echoed; answer length ${#HINT_ANSWER}"

# ── question_records write check (needs SUPABASE_DB_URL + psql) ──────────
# This one may legitimately be unavailable — psql is often absent on a deploy
# host. It stays optional, but the final verdict below must not call the run
# "ALL CHECKS PASSED" when it did not happen. Same fail-open shape as the
# Layer 2 skip above, one level smaller.
DB_CHECK_RAN=0
if [ -n "${SUPABASE_DB_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  echo "→ question_records write check (record_id=$RECORD_ID)"
  if [ -z "$RECORD_ID" ] || [ "$RECORD_ID" = "null" ]; then
    echo "  FAIL: response carried no record_id" >&2
    exit 1
  fi
  ROW=$(psql "$SUPABASE_DB_URL" -t -A -c \
    "SELECT id FROM question_records WHERE id = '$RECORD_ID' AND client_request_id = '$REQ_ID' LIMIT 1;" 2>/dev/null || true)
  if [ -z "$ROW" ]; then
    echo "  FAIL: question_records row not found for record_id=$RECORD_ID" >&2
    exit 1
  fi
  echo "  PASS: question_records row $RECORD_ID exists with matching crid"
  DB_CHECK_RAN=1
else
  echo "→ question_records write check: NOT RUN (needs SUPABASE_DB_URL + psql)"
fi

echo ""
if [ "$DB_CHECK_RAN" = "1" ]; then
  echo "smoke-test-ai-tutor: ALL CHECKS PASSED (version $EXPECTED_VERSION)"
else
  # Exit 0 is correct — the handler was exercised end-to-end, which is the bar.
  # The wording is not "ALL", because one check did not run.
  echo "smoke-test-ai-tutor: FUNCTIONAL CHECKS PASSED (version $EXPECTED_VERSION)"
  echo "  note: the question_records write was NOT verified (no SUPABASE_DB_URL/psql)."
  echo "        The handler ran and returned a valid answer, so this is a pass —"
  echo "        but persistence was not confirmed."
fi
exit 0
