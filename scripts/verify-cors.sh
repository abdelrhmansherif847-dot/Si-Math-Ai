#!/usr/bin/env bash
# scripts/verify-cors.sh
#
# SEC-03/SEC-11 — verify that no deployed Edge Function is reachable from an
# unauthorised origin.
#
# Static review proves what the source does. This proves what production does,
# which is the only claim that matters after a deploy: it probes each live
# function with an allowed origin, a hostile origin, and a lookalike origin,
# and checks the actual `Access-Control-Allow-Origin` header that comes back.
#
# A PASS means a browser on an attacker's page cannot read this endpoint's
# responses using a visiting student's session.
#
# Usage:
#   PROD_ORIGIN="https://simathai.com" \
#   TEST_JWT="eyJ..." \
#   ./scripts/verify-cors.sh
#
#   TEST_JWT is optional. Without it the script still validates CORS headers
#   (which are emitted before authentication), but cannot confirm 2xx paths.
#
set -uo pipefail

PROJECT_REF="${PROJECT_REF:-igvkyxkmjnkzscqgommj}"
BASE="${BASE:-https://${PROJECT_REF}.supabase.co/functions/v1}"
PROD_ORIGIN="${PROD_ORIGIN:-}"
TEST_JWT="${TEST_JWT:-}"

# Every function reachable at /functions/v1/<name>. Add new deployments here —
# an endpoint absent from this list is an endpoint nobody is verifying.
FUNCTIONS=("ai-tutor" "admin-actions")

HOSTILE="https://evil.example"
# Suffix confusion: a naive `endsWith` or substring allow-list accepts this.
if [ -n "$PROD_ORIGIN" ]; then
  LOOKALIKE="${PROD_ORIGIN}.evil.example"
else
  LOOKALIKE="https://simathai.com.evil.example"
fi

if [ -z "$PROD_ORIGIN" ]; then
  echo "WARN: PROD_ORIGIN unset — skipping the positive (allowed-origin) checks."
  echo "      Set it to assert that legitimate traffic still works."
  echo
fi

pass=0; fail=0; skip=0
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1"; echo "        $2"; fail=$((fail+1)); }
skipm(){ echo "  SKIP  $1"; skip=$((skip+1)); }

# Echo the ACAO header returned for a given origin, or the empty string.
acao_for() {
  local url="$1" origin="$2" method="${3:-POST}"
  local args=(-s -o /dev/null -D - -X "$method" --max-time 25
              -H "Origin: ${origin}" -H "Content-Type: application/json")
  [ -n "$TEST_JWT" ] && args+=(-H "Authorization: Bearer ${TEST_JWT}")
  [ "$method" = "POST" ] && args+=(-d '{"question":"1+1"}')
  curl "${args[@]}" "$url" 2>/dev/null \
    | tr -d '\r' | grep -i '^access-control-allow-origin:' \
    | head -1 | cut -d' ' -f2- | tr -d ' '
}

http_status_for() {
  local url="$1" origin="$2"
  local args=(-s -o /dev/null -w '%{http_code}' -X POST --max-time 25
              -H "Origin: ${origin}" -H "Content-Type: application/json")
  [ -n "$TEST_JWT" ] && args+=(-H "Authorization: Bearer ${TEST_JWT}")
  args+=(-d '{"question":"1+1"}')
  curl "${args[@]}" "$url" 2>/dev/null
}

echo "CORS verification — ${BASE}"
echo

for fn in "${FUNCTIONS[@]}"; do
  url="${BASE}/${fn}"
  echo "── ${fn}"

  # Reachability. A function that does not exist is not a CORS finding.
  code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS --max-time 25 "$url" 2>/dev/null)
  if [ "$code" = "000" ]; then
    skipm "${fn}: unreachable from here (network/egress) — cannot verify"
    echo; continue
  fi

  # 1. Wildcard is never acceptable on an authenticated endpoint.
  for probe_origin in "$HOSTILE" "${PROD_ORIGIN:-$HOSTILE}"; do
    a=$(acao_for "$url" "$probe_origin")
    if [ "$a" = "*" ]; then
      bad "${fn}: returns wildcard ACAO for ${probe_origin}" \
          "Any site can read this endpoint's responses. Set ALLOWED_ORIGINS (ai-tutor) or fix the function's CORS."
      break
    fi
  done
  a_hostile=$(acao_for "$url" "$HOSTILE")
  [ "$a_hostile" = "*" ] || ok "${fn}: no wildcard ACAO"

  # 2. A hostile origin must not be echoed back.
  if [ -z "$a_hostile" ]; then
    ok "${fn}: hostile origin receives no ACAO header"
  elif [ "$a_hostile" = "$HOSTILE" ]; then
    bad "${fn}: echoes the hostile origin ($a_hostile)" \
        "The function reflects Origin without checking it. This is equivalent to a wildcard, but worse — it also works with credentials."
  else
    ok "${fn}: hostile origin not echoed (got '${a_hostile}')"
  fi

  # 3. Suffix-confusion lookalike must be rejected.
  a_look=$(acao_for "$url" "$LOOKALIKE")
  if [ -z "$a_look" ] || [ "$a_look" != "$LOOKALIKE" ]; then
    ok "${fn}: lookalike origin rejected"
  else
    bad "${fn}: accepts lookalike origin ($LOOKALIKE)" \
        "Allow-list is matching by suffix/substring instead of exact equality."
  fi

  # 4. Positive path — legitimate origin must still work.
  if [ -n "$PROD_ORIGIN" ]; then
    a_prod=$(acao_for "$url" "$PROD_ORIGIN")
    if [ "$a_prod" = "$PROD_ORIGIN" ]; then
      ok "${fn}: production origin echoed correctly"
    elif [ -z "$a_prod" ]; then
      bad "${fn}: production origin gets NO ACAO header" \
          "Legitimate browser traffic from ${PROD_ORIGIN} will be blocked. Add it to ALLOWED_ORIGINS."
    else
      bad "${fn}: production origin echoed as '${a_prod}'" "Expected exactly ${PROD_ORIGIN}"
    fi

    if [ -n "$TEST_JWT" ]; then
      s_prod=$(http_status_for "$url" "$PROD_ORIGIN")
      s_evil=$(http_status_for "$url" "$HOSTILE")
      [ "$s_prod" = "200" ] && ok "${fn}: authenticated request from production origin → 200" \
                            || skipm "${fn}: production origin → HTTP ${s_prod} (check the JWT / payload shape)"
      [ "$s_evil" = "403" ] && ok "${fn}: hostile origin rejected with 403" \
                            || skipm "${fn}: hostile origin → HTTP ${s_evil} (403 expected once enforcement is on)"
    else
      skipm "${fn}: status-code checks need TEST_JWT"
    fi
  else
    skipm "${fn}: positive-path checks need PROD_ORIGIN"
  fi
  echo
done

echo "────────────────────────────────────────"
echo "PASS ${pass}   FAIL ${fail}   SKIP ${skip}"
if [ "$fail" -gt 0 ]; then
  echo
  echo "CORS verification FAILED — do not consider the platform origin-hardened."
  exit 1
fi
if [ "$pass" -eq 0 ]; then
  echo
  echo "INCONCLUSIVE — nothing was actually verified (every check was skipped)."
  echo "This is NOT a pass. Rerun from a network that can reach ${BASE}."
  exit 2
fi
if [ "$skip" -gt 0 ]; then
  echo
  echo "PARTIAL — ${pass} check(s) passed, ${skip} skipped."
  echo "Rerun with PROD_ORIGIN and TEST_JWT set for full coverage."
  exit 0
fi
echo
echo "CORS verification passed — no endpoint is readable from an unauthorised origin."
