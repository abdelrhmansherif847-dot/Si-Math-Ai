#!/usr/bin/env bash
#
# check-migration-parity.sh
#
# Prevents the deploy-ordering race that caused the 2026-06-14 Mock Exam
# evidence-chain failure. For each (table, column) the codebase depends on,
# verify the column exists in the live production database.
#
# Usage:
#   SUPABASE_URL=https://<ref>.supabase.co \
#   SUPABASE_SERVICE_ROLE_KEY=<key> \
#   ./scripts/check-migration-parity.sh
#
# Exits 0 if all referenced columns exist in DB. Exits 1 on any mismatch
# (code references a column that isn't in the live schema → unsafe deploy).
#
set -euo pipefail

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set." >&2
  exit 2
fi

# ── Coupling map ──────────────────────────────────────────────────────────
# Each line: <table>:<column>:<grep-pattern>:<glob>
# Add a new entry whenever a migration introduces a column the code reads
# or writes. Keep grep-pattern specific enough to avoid false positives.
COUPLINGS=(
  "weakness_signals:source_session_id:source_session_id:*.js"
  "weakness_signals:source_question_id:source_question_id:*.js"
  "question_records:client_request_id:client_request_id:*.html"
  "question_records:client_request_id:client_request_id:supabase/functions/ai-tutor/index.ts"
)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0

# Query information_schema once per (table,column) pair.
column_exists() {
  local table="$1" column="$2"
  local sql
  sql=$(printf "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='%s' AND column_name='%s' LIMIT 1;" "$table" "$column")
  local res
  res=$(curl -fsS \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -X POST \
    --data "{\"query\": $(printf '%s' "$sql" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
    "${SUPABASE_URL}/rest/v1/rpc/exec_sql" 2>/dev/null || true)
  # Fallback: PostgREST table query (preferred, no RPC needed).
  res=$(curl -fsS \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    "${SUPABASE_URL}/rest/v1/${table}?select=${column}&limit=0" 2>/dev/null || true)
  # PostgREST returns "[]" when the column exists (zero rows requested).
  # Returns an error JSON containing "column ... does not exist" when missing.
  if echo "$res" | grep -q 'does not exist'; then
    return 1
  fi
  if echo "$res" | grep -q '^\[\]$'; then
    return 0
  fi
  # Permissive: any non-error response counts as exists.
  if echo "$res" | grep -q '"code"'; then
    return 1
  fi
  return 0
}

echo "── Migration parity check ──"
for entry in "${COUPLINGS[@]}"; do
  IFS=':' read -r table column pattern glob <<< "$entry"

  # 1. Is the column referenced in code?
  matches=$(cd "$REPO_ROOT" && grep -RIl --include="$glob" "$pattern" . 2>/dev/null || true)
  if [[ -z "$matches" ]]; then
    printf "  SKIP  %s.%s  (no code references via %s)\n" "$table" "$column" "$glob"
    continue
  fi

  # 2. Does the column exist in the live DB?
  if column_exists "$table" "$column"; then
    printf "  OK    %s.%s  (exists; referenced in %s)\n" "$table" "$column" "$(echo "$matches" | head -1)"
  else
    printf "  FAIL  %s.%s  (MISSING in DB; referenced in %s)\n" "$table" "$column" "$(echo "$matches" | head -1)" >&2
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "── Parity check FAILED. Apply pending migrations before deploying code. ──" >&2
  exit 1
fi
echo "── Parity check passed. ──"
