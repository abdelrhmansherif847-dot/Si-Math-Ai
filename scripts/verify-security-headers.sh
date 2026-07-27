#!/usr/bin/env bash
# scripts/verify-security-headers.sh
#
# SEC-03 — verify the deployed site actually serves the security headers and
# CSP configured in vercel.json.
#
# vercel.json being correct in git proves nothing about production: a header
# rule can be shadowed by another rule, dropped by a proxy or CDN in front of
# Vercel, or simply not deployed yet. This reads what a browser actually
# receives.
#
# Usage:
#   PROD_ORIGIN="https://simathai.com" ./scripts/verify-security-headers.sh
#
# Exit codes:
#   0 = every required header present and correctly valued
#   1 = a required header is missing or wrong  → release blocker
#   2 = target unreachable → INCONCLUSIVE, not a pass
#
set -uo pipefail

PROD_ORIGIN="${PROD_ORIGIN:-}"
if [ -z "$PROD_ORIGIN" ]; then
  echo "FAIL: PROD_ORIGIN is required (e.g. https://simathai.com)" >&2
  exit 2
fi
PROD_ORIGIN="${PROD_ORIGIN%/}"

# Pages worth checking individually: the CSP applies to /(.*) so any path
# should carry it, but admin.html holds an owner session and login.html is the
# credential entry point — if a rule is shadowed anywhere, it matters most here.
PATHS=("/" "/login.html" "/chat.html" "/admin.html")

pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; [ -n "${2:-}" ] && echo "        $2"; fail=$((fail+1)); }

fetch_headers() {
  curl -sS -o /dev/null -D - --max-time 25 -A 'si-math-ai-security-verify' "$1" 2>/dev/null | tr -d '\r'
}

hdr() { printf '%s\n' "$1" | grep -i "^$2:" | head -1 | cut -d: -f2- | sed 's/^ *//'; }

echo "Security header verification — ${PROD_ORIGIN}"
echo

reachable=0
for path in "${PATHS[@]}"; do
  url="${PROD_ORIGIN}${path}"
  H="$(fetch_headers "$url")"
  if [ -z "$H" ]; then
    echo "── ${path}"
    echo "  SKIP  unreachable"
    echo
    continue
  fi
  reachable=1
  status=$(printf '%s\n' "$H" | head -1)
  echo "── ${path}   (${status})"

  # ── CSP ──────────────────────────────────────────────────────────────────
  csp="$(hdr "$H" 'content-security-policy')"
  if [ -z "$csp" ]; then
    bad "${path}: no Content-Security-Policy" "The single most important header is absent."
  else
    ok "${path}: CSP present"
    case "$csp" in
      *"'unsafe-eval'"*) bad "${path}: CSP allows 'unsafe-eval'" "The codebase contains no eval(); this should never be needed." ;;
      *) ok "${path}: CSP forbids 'unsafe-eval'" ;;
    esac
    case "$csp" in
      *"object-src 'none'"*)      ok "${path}: object-src none" ;;
      *) bad "${path}: object-src is not 'none'" ;;
    esac
    case "$csp" in
      *"frame-ancestors 'none'"*) ok "${path}: frame-ancestors none" ;;
      *) bad "${path}: frame-ancestors is not 'none'" "Page is framable — clickjacking." ;;
    esac
    case "$csp" in
      *"base-uri 'self'"*)        ok "${path}: base-uri self" ;;
      *) bad "${path}: base-uri is not 'self'" ;;
    esac
    case "$csp" in
      *"form-action 'self'"*)     ok "${path}: form-action self" ;;
      *) bad "${path}: form-action is not 'self'" ;;
    esac
    # default-src must not be a blanket wildcard.
    case "$csp" in
      *"default-src *"*) bad "${path}: default-src is a wildcard" ;;
      *) ok "${path}: default-src is not a wildcard" ;;
    esac
  fi

  # ── Transport + framing + sniffing ───────────────────────────────────────
  hsts="$(hdr "$H" 'strict-transport-security')"
  if [ -z "$hsts" ]; then
    bad "${path}: no Strict-Transport-Security"
  else
    age=$(printf '%s' "$hsts" | grep -oE 'max-age=[0-9]+' | cut -d= -f2)
    if [ -n "$age" ] && [ "$age" -ge 31536000 ]; then
      ok "${path}: HSTS max-age ${age}"
    else
      bad "${path}: HSTS max-age too short (${age:-unset})" "Want >= 31536000 (1 year)."
    fi
  fi

  [ "$(hdr "$H" 'x-content-type-options')" = "nosniff" ] \
    && ok "${path}: X-Content-Type-Options nosniff" \
    || bad "${path}: X-Content-Type-Options is not nosniff"

  xfo="$(hdr "$H" 'x-frame-options')"
  case "$xfo" in
    DENY|deny|SAMEORIGIN|sameorigin) ok "${path}: X-Frame-Options ${xfo}" ;;
    *) bad "${path}: X-Frame-Options missing or weak (${xfo:-unset})" ;;
  esac

  [ -n "$(hdr "$H" 'referrer-policy')" ] \
    && ok "${path}: Referrer-Policy set" \
    || bad "${path}: no Referrer-Policy"

  [ -n "$(hdr "$H" 'permissions-policy')" ] \
    && ok "${path}: Permissions-Policy set" \
    || bad "${path}: no Permissions-Policy"

  [ -n "$(hdr "$H" 'cross-origin-opener-policy')" ] \
    && ok "${path}: COOP set" \
    || bad "${path}: no Cross-Origin-Opener-Policy"

  # ── Information disclosure ───────────────────────────────────────────────
  srv="$(hdr "$H" 'server')"
  pby="$(hdr "$H" 'x-powered-by')"
  [ -z "$pby" ] && ok "${path}: no X-Powered-By" \
                || bad "${path}: leaks X-Powered-By (${pby})" "Discloses stack detail for no benefit."
  [ -n "$srv" ] && echo "  ..    Server: ${srv}"

  echo
done

echo "────────────────────────────────────────"
echo "PASS ${pass}   FAIL ${fail}"

if [ "$reachable" -eq 0 ]; then
  echo
  echo "INCONCLUSIVE — no path was reachable. This is NOT a pass."
  exit 2
fi
if [ "$fail" -gt 0 ]; then
  echo
  echo "Security header verification FAILED."
  exit 1
fi
echo
echo "All required security headers present and correctly valued."
