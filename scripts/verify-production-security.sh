#!/usr/bin/env bash
# scripts/verify-production-security.sh
#
# Complete production security verification suite.
#
# Run this AFTER the three release blockers are done:
#   1. SEC-04 migration applied
#   2. ai-tutor v89 deployed (DEPLOY.md §4, Path B — CLI, multi-file bundle)
#   3. ALLOWED_ORIGINS configured
#
# It runs every layer end to end and prints one verdict. Nothing here writes
# anything: it is safe against production at any time.
#
#   Layer 1  repo         test suites + validators (offline)
#   Layer 2  supply chain CDN pins re-verified against the npm registry
#   Layer 3  database     SEC-01 / SEC-04 / AUTHZ-01 privileges and policies
#   Layer 4  headers      live CSP + security headers (SEC-03)
#   Layer 5  CORS         live origin enforcement (SEC-03/SEC-11)
#   Layer 6  edge fn      deployed version + auth gate + smoke test
#
# A layer that cannot run is reported as SKIPPED and makes the overall result
# INCONCLUSIVE. It is never silently counted as a pass — an unverifiable
# control is not a verified one.
#
# Usage:
#   PROD_ORIGIN="https://simathai.com" \
#   SUPABASE_PROJECT_REF="igvkyxkmjnkzscqgommj" \
#   EXPECTED_VERSION="v89" \
#   SUPABASE_DB_URL="postgresql://..." \
#   SUPABASE_TEST_JWT="eyJ..." \
#   SUPABASE_ANON_KEY="sb_publishable_..." \
#     ./scripts/verify-production-security.sh
#
# Exit codes:
#   0 = every runnable layer passed and nothing was skipped
#   1 = at least one layer FAILED           → do not release
#   2 = layers skipped, none failed         → INCONCLUSIVE, do not release
#
set -uo pipefail

cd "$(dirname "$0")/.."

PROD_ORIGIN="${PROD_ORIGIN:-}"
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-igvkyxkmjnkzscqgommj}"
EXPECTED_VERSION="${EXPECTED_VERSION:-v89}"
SUPABASE_DB_URL="${SUPABASE_DB_URL:-}"
SUPABASE_TEST_JWT="${SUPABASE_TEST_JWT:-}"

RESULTS=()
n_pass=0; n_fail=0; n_skip=0

record() { # status label detail
  RESULTS+=("$1|$2|${3:-}")
  case "$1" in
    PASS) n_pass=$((n_pass+1)) ;;
    FAIL) n_fail=$((n_fail+1)) ;;
    SKIP) n_skip=$((n_skip+1)) ;;
  esac
}

banner() {
  echo
  echo "════════════════════════════════════════════════════════════════"
  echo "  $1"
  echo "════════════════════════════════════════════════════════════════"
}

echo "Si Math AI — production security verification"
echo "target project : ${SUPABASE_PROJECT_REF}"
echo "target origin  : ${PROD_ORIGIN:-(unset)}"
echo "expected ai-tutor version : ${EXPECTED_VERSION}"
echo "started        : $(date -u '+%Y-%m-%d %H:%M:%SZ')"

# ── Layer 1 — repository ───────────────────────────────────────────────────
banner "Layer 1/6 — repository test suites and validators"
if node tests/run-all.mjs; then
  record PASS "repo suites + validators"
else
  record FAIL "repo suites + validators" "node tests/run-all.mjs exited non-zero"
fi

# ── Layer 2 — supply chain ─────────────────────────────────────────────────
banner "Layer 2/6 — CDN pins and SRI hashes (SEC-07)"
if ./scripts/pin-cdn-sri.sh --check; then
  record PASS "CDN pins + SRI verified against npm registry"
else
  rc=$?
  if [ "$rc" -eq 1 ]; then
    record FAIL "CDN pins + SRI" "a committed hash is stale, missing, or floating"
  else
    record SKIP "CDN pins + SRI" "registry unreachable"
  fi
fi

# ── Layer 3 — database ─────────────────────────────────────────────────────
banner "Layer 3/6 — database privileges and policies (SEC-01 / SEC-04)"
if [ -z "$SUPABASE_DB_URL" ]; then
  record SKIP "database controls" "SUPABASE_DB_URL not set"
  echo "SKIPPED — set SUPABASE_DB_URL, or paste scripts/verify-security-sql.sql"
  echo "into the Supabase Dashboard SQL Editor. Every row must read PASS."
elif ! command -v psql >/dev/null 2>&1; then
  record SKIP "database controls" "psql not installed"
  echo "SKIPPED — psql not found. Paste scripts/verify-security-sql.sql into the"
  echo "Supabase Dashboard SQL Editor instead. Every row must read PASS."
else
  SQL_OUT="$(psql "$SUPABASE_DB_URL" -X -q -f scripts/verify-security-sql.sql 2>&1)"
  echo "$SQL_OUT"
  if printf '%s' "$SQL_OUT" | grep -qE '^\s*FAIL'; then
    record FAIL "database controls" "$(printf '%s' "$SQL_OUT" | grep -cE '^\s*FAIL') check(s) failed"
  elif printf '%s' "$SQL_OUT" | grep -qE '^\s*PASS'; then
    record PASS "database controls (SEC-01, SEC-04, AUTHZ-01, RLS baseline)"
  else
    record SKIP "database controls" "query produced no verdict rows"
  fi
fi

# ── Layer 4 — security headers ─────────────────────────────────────────────
banner "Layer 4/6 — live security headers and CSP (SEC-03)"
if [ -z "$PROD_ORIGIN" ]; then
  record SKIP "security headers" "PROD_ORIGIN not set"
  echo "SKIPPED — set PROD_ORIGIN."
else
  PROD_ORIGIN="$PROD_ORIGIN" ./scripts/verify-security-headers.sh
  case $? in
    0) record PASS "security headers + CSP" ;;
    1) record FAIL "security headers + CSP" "a required header is missing or wrong" ;;
    *) record SKIP "security headers + CSP" "site unreachable" ;;
  esac
fi

# ── Layer 5 — CORS ─────────────────────────────────────────────────────────
banner "Layer 5/6 — live CORS origin enforcement (SEC-03 / SEC-11)"
PROD_ORIGIN="$PROD_ORIGIN" TEST_JWT="$SUPABASE_TEST_JWT" \
  PROJECT_REF="$SUPABASE_PROJECT_REF" ./scripts/verify-cors.sh
case $? in
  0) record PASS "CORS origin enforcement" ;;
  1) record FAIL "CORS origin enforcement" "an endpoint is readable from an unauthorised origin" ;;
  *) record SKIP "CORS origin enforcement" "endpoints unreachable or partial run" ;;
esac

# ── Layer 6 — Edge Function ────────────────────────────────────────────────
banner "Layer 6/6 — ai-tutor deployed version and smoke test"
SMOKE_OUT="$(SUPABASE_PROJECT_REF="$SUPABASE_PROJECT_REF" EXPECTED_VERSION="$EXPECTED_VERSION" \
  SUPABASE_TEST_JWT="$SUPABASE_TEST_JWT" ./scripts/smoke-test-ai-tutor.sh 2>&1)"
SMOKE_RC=$?
echo "$SMOKE_OUT"

# curl reports HTTP 000 when the connection never completed — DNS failure,
# blocked egress, TLS refusal. The smoke test treats that as a failed check,
# which is right for a deploy gate but wrong here: "I could not reach it" and
# "it is broken" are different claims, and a verification report must not
# conflate them. Reclassify unreachable as SKIP so the run reads INCONCLUSIVE
# rather than accusing a healthy deployment of being down.
if printf '%s' "$SMOKE_OUT" | grep -qE 'HTTP 000|Could not resolve|Connection refused|cannot open'; then
  record SKIP "ai-tutor smoke test" "endpoint unreachable from this host"
else
  case $SMOKE_RC in
    0) record PASS "ai-tutor ${EXPECTED_VERSION} deployed and healthy" ;;
    1) record FAIL "ai-tutor smoke test" "deployed function failed a check" ;;
    *) record SKIP "ai-tutor smoke test" "setup/config incomplete" ;;
  esac
fi

# ── Verdict ────────────────────────────────────────────────────────────────
banner "VERDICT"
printf '%-6s  %-52s  %s\n' "STATUS" "LAYER" "DETAIL"
printf '%-6s  %-52s  %s\n' "------" "----------------------------------------------------" "------"
for r in "${RESULTS[@]}"; do
  IFS='|' read -r st lb dt <<< "$r"
  printf '%-6s  %-52s  %s\n' "$st" "$lb" "$dt"
done

echo
echo "PASS ${n_pass}   FAIL ${n_fail}   SKIP ${n_skip}"
echo "finished : $(date -u '+%Y-%m-%d %H:%M:%SZ')"
echo

if [ "$n_fail" -gt 0 ]; then
  echo "RESULT: FAILED — do not release. Resolve every FAIL above and re-run."
  exit 1
fi
if [ "$n_skip" -gt 0 ]; then
  echo "RESULT: INCONCLUSIVE — ${n_skip} layer(s) could not be verified."
  echo "An unverified control is not a verified one. Supply the missing"
  echo "configuration and re-run before releasing."
  exit 2
fi
echo "RESULT: PASSED — every layer verified against production."
