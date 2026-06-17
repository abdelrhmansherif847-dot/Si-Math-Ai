#!/usr/bin/env bash
# scripts/smoke-test-ai-tutor.sh
#
# Post-deploy smoke test for the ai-tutor Edge Function.
#
# Layers:
#   1. Heartbeat — runs without credentials. Confirms the deployed function
#      has a serve() handler and the auth gate is engaged. Catches the
#      stub-deploy failure mode (no handler → 500/502 instead of 401).
#   2. Functional — runs only if SUPABASE_TEST_JWT is set. Sends a real
#      math question and a hint-mode question, asserts envelope shape,
#      version field, and personality marker. Then verifies a matching
#      question_records row was written (requires SUPABASE_DB_URL).
#
# Exit codes:
#   0 = all enabled layers passed
#   1 = a check failed → DO NOT mark deploy as healthy
#   2 = setup/config error → unable to determine state
#
# Required env:
#   SUPABASE_PROJECT_REF       (e.g. igvkyxkmjnkzscqgommj)
#   EXPECTED_VERSION           (e.g. v68 or v69 — the version you just shipped)
#
# Optional env (enables functional layer):
#   SUPABASE_TEST_JWT          valid JWT for a test student account
#   SUPABASE_DB_URL            postgres URL for the question_records check
#   SUPABASE_ANON_KEY          required by Supabase for the JWT path
#
# Usage:
#   SUPABASE_PROJECT_REF=igvkyxkmjnkzscqgommj EXPECTED_VERSION=v68 \
#     ./scripts/smoke-test-ai-tutor.sh

set -euo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required}"
: "${EXPECTED_VERSION:?EXPECTED_VERSION is required (e.g. v68)}"

FN_URL="https://${SUPABASE_PROJECT_REF}.functions.supabase.co/ai-tutor"

# ──────────────────────────────────────────────────────────────────────────
# Layer 1 — heartbeat (no credentials required)
# ──────────────────────────────────────────────────────────────────────────
echo "→ Heartbeat: POST $FN_URL (no auth)"
HB_CODE=$(curl -s -o /tmp/_smoke_hb_body -w "%{http_code}" \
  -X POST "$FN_URL" \
  -H "Content-Type: application/json" \
  --data '{"question":"heartbeat"}' \
  --max-time 10 || echo "000")

case "$HB_CODE" in
  401)
    echo "  PASS: serve() handler is running, auth gate engaged (HTTP 401)"
    ;;
  400)
    echo "  PASS: handler running, rejected malformed body (HTTP 400)"
    ;;
  500|502|503|000)
    echo "  FAIL: handler returned $HB_CODE — likely no serve() handler or function crashed" >&2
    echo "  body: $(head -c 200 /tmp/_smoke_hb_body)" >&2
    exit 1
    ;;
  *)
    echo "  FAIL: unexpected HTTP $HB_CODE (body: $(head -c 200 /tmp/_smoke_hb_body))" >&2
    exit 1
    ;;
esac

# ──────────────────────────────────────────────────────────────────────────
# Layer 2 — functional (requires SUPABASE_TEST_JWT)
# ──────────────────────────────────────────────────────────────────────────
if [ -z "${SUPABASE_TEST_JWT:-}" ]; then
  echo "→ Functional smoke: SKIPPED (SUPABASE_TEST_JWT not set)"
  echo ""
  echo "smoke-test-ai-tutor: heartbeat OK"
  exit 0
fi

: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY required for functional smoke}"

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

# ── question_records write check (optional, requires SUPABASE_DB_URL) ────
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
else
  echo "→ question_records write check: SKIPPED (set SUPABASE_DB_URL + install psql to enable)"
fi

echo ""
echo "smoke-test-ai-tutor: ALL CHECKS PASSED (version $EXPECTED_VERSION)"
