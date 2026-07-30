#!/usr/bin/env bash
# scripts/deploy-ai-tutor.sh
#
# Single approved deploy path for the ai-tutor Edge Function.
#
# Pipeline:
#   1. validate-ai-tutor-source.sh against the file on disk.
#      Refuses to proceed if the source is a stub, truncated, or missing
#      its serve() handler. This is the gate that would have prevented
#      both 2026-06-17 incidents.
#   2. supabase functions deploy ai-tutor --project-ref ...
#      Uses the CLI, which uploads the file via filesystem (no inline
#      content path, no risk of the caller passing a placeholder string).
#   3. smoke-test-ai-tutor.sh against the deployed endpoint.
#      Heartbeat + functional smoke (if creds present). Fails the deploy
#      if the live function does not behave as expected.
#
# Required env:
#   SUPABASE_PROJECT_REF        target project (e.g. igvkyxkmjnkzscqgommj)
#   SUPABASE_ACCESS_TOKEN       PAT for the CLI deploy step
#
# Optional env (enables functional smoke):
#   SUPABASE_TEST_JWT           test student JWT
#   SUPABASE_ANON_KEY           project anon key
#   SUPABASE_DB_URL             postgres URL for question_records check
#
# Usage:
#   SUPABASE_PROJECT_REF=igvkyxkmjnkzscqgommj \
#   SUPABASE_ACCESS_TOKEN=sbp_xxx \
#     ./scripts/deploy-ai-tutor.sh

set -euo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required}"
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"

# ── Smoke-test credentials are required BEFORE the deploy, not after ───────
# Step 3 runs the functional smoke test, which needs these. Checking them here
# rather than letting step 3 fail means a missing credential stops the run
# while production is still untouched, instead of leaving a deployed function
# nobody has verified.
#
# v90 shipped because the smoke test's Layer 2 was skipped for want of
# SUPABASE_TEST_JWT and the script still exited 0. Layer 1 stops at the 401
# auth gate, upstream of the fault, so it passed while every request 500'd.
: "${SUPABASE_TEST_JWT:?SUPABASE_TEST_JWT is required — step 3 must execute the handler, not just heartbeat it. Set it, or deploy manually and accept that the deploy is unverified.}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is required for the functional smoke test (Supabase needs it on the JWT path).}"

SRC="supabase/functions/ai-tutor/index.ts"

echo "═══════════════════════════════════════════════════════════════"
echo " ai-tutor deploy pipeline"
echo "═══════════════════════════════════════════════════════════════"
echo " source: $SRC"
echo " project: $SUPABASE_PROJECT_REF"
echo ""

# ── Step 1: pre-deploy source validation ────────────────────────────────
echo "▶ Step 1/3 — validate source"
./scripts/validate-ai-tutor-source.sh "$SRC"
EXPECTED_VERSION=$(grep -oE "AI_TUTOR_VERSION = '[^']+'" "$SRC" | head -1 | sed "s/.*'\\([^']*\\)'/\\1/")
echo ""

# ── Step 2: deploy via CLI (filesystem upload — no inline content) ──────
echo "▶ Step 2/3 — deploy via supabase CLI"
if ! command -v supabase >/dev/null 2>&1; then
  if command -v npx >/dev/null 2>&1; then
    SUPA="npx supabase"
  else
    echo "FAIL: neither supabase nor npx is on PATH" >&2
    exit 1
  fi
else
  SUPA="supabase"
fi

$SUPA functions deploy ai-tutor --project-ref "$SUPABASE_PROJECT_REF"
echo ""

# ── Step 3: post-deploy smoke test ──────────────────────────────────────
# The credentials are checked at the TOP of this script, before the deploy, so
# a missing JWT stops the run before anything ships rather than leaving a
# deployed-but-unverified function behind. They are forwarded explicitly here
# rather than relied on by inheritance: this step previously passed only
# PROJECT_REF and EXPECTED_VERSION, so Layer 2 ran or skipped depending on
# whether the operator happened to have the JWT exported — and when it
# skipped, the smoke test still exited 0.
echo "▶ Step 3/3 — smoke test (expected version: $EXPECTED_VERSION)"
SUPABASE_PROJECT_REF="$SUPABASE_PROJECT_REF" \
EXPECTED_VERSION="$EXPECTED_VERSION" \
SUPABASE_TEST_JWT="$SUPABASE_TEST_JWT" \
SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
${SUPABASE_DB_URL:+SUPABASE_DB_URL="$SUPABASE_DB_URL"} \
  ./scripts/smoke-test-ai-tutor.sh
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo " ai-tutor deploy: SUCCESS ($EXPECTED_VERSION)"
echo "═══════════════════════════════════════════════════════════════"
