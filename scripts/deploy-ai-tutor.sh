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
echo "▶ Step 3/3 — smoke test (expected version: $EXPECTED_VERSION)"
SUPABASE_PROJECT_REF="$SUPABASE_PROJECT_REF" \
EXPECTED_VERSION="$EXPECTED_VERSION" \
  ./scripts/smoke-test-ai-tutor.sh
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo " ai-tutor deploy: SUCCESS ($EXPECTED_VERSION)"
echo "═══════════════════════════════════════════════════════════════"
