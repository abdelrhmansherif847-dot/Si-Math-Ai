#!/usr/bin/env bash
# scripts/pin-cdn-sri.sh
#
# SEC-07 — pin every third-party CDN script to an exact version and attach a
# Subresource Integrity hash.
#
# WHY THIS EXISTS AS A SCRIPT RATHER THAN A COMMITTED DIFF
# --------------------------------------------------------
# The correct `integrity` value is a hash of the exact bytes jsdelivr serves.
# It cannot be guessed, derived, or written from memory: a wrong hash makes the
# browser refuse the script, which would take every page down at once. The
# session that produced this hardening pass had cdn.jsdelivr.net blocked by
# egress policy, so it could not compute the real hashes — and shipping
# invented ones would have been strictly worse than shipping nothing.
#
# Run this from a machine that can reach cdn.jsdelivr.net. It fetches each
# pinned asset, computes the SHA-384 digest, and rewrites the HTML in place.
#
# WHAT IT FIXES
# -------------
# Today the pages load:
#
#   https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
#
# `@2` is a floating major-version range: jsdelivr resolves it to whatever the
# latest 2.x is at request time. Every page that holds a student's session —
# including admin.html, which holds an owner session — executes whatever code
# that URL returns, with no integrity check. A compromised release, a hijacked
# npm account, or a CDN cache-poisoning incident becomes immediate script
# execution in an authenticated context. Pinning removes the moving target;
# SRI removes the trust in the CDN.
#
# THE TRADE-OFF, STATED PLAINLY
# -----------------------------
# Pinning means patches — including security patches to supabase-js — stop
# arriving automatically. That is the intended trade: an unreviewed automatic
# update to code running in an authenticated page is the larger risk. Re-run
# this script deliberately to move the pin, and treat it as a dependency
# update: read the changelog, bump PIN_SUPABASE_JS, re-run, smoke-test.
#
# Usage:
#   ./scripts/pin-cdn-sri.sh            # rewrite the HTML in place
#   ./scripts/pin-cdn-sri.sh --check    # verify only; non-zero if drifted
#
set -euo pipefail

# ── Pinned versions ────────────────────────────────────────────────────────
# Bump deliberately. KaTeX is already pinned at 0.16.11 in the pages; it is
# restated here so one file is the single source of truth for CDN versions.
PIN_SUPABASE_JS="${PIN_SUPABASE_JS:-2.58.0}"
PIN_KATEX="${PIN_KATEX:-0.16.11}"

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

command -v curl    >/dev/null || { echo "FAIL: curl not found"    >&2; exit 1; }
command -v openssl >/dev/null || { echo "FAIL: openssl not found" >&2; exit 1; }

# sha384 digest, base64 — the format SRI expects.
sri_for() {
  local url="$1" tmp
  tmp="$(mktemp)"
  if ! curl -sSfL --max-time 60 "$url" -o "$tmp"; then
    echo "FAIL: could not fetch $url" >&2
    echo "      If this host is blocked by egress policy, run the script from" >&2
    echo "      a network that can reach cdn.jsdelivr.net." >&2
    rm -f "$tmp"; exit 1
  fi
  # A CDN error page would hash cleanly and pin garbage — refuse tiny bodies.
  local size; size=$(wc -c < "$tmp")
  if [ "$size" -lt 1000 ]; then
    echo "FAIL: $url returned only $size bytes — refusing to pin that" >&2
    rm -f "$tmp"; exit 1
  fi
  printf 'sha384-%s' "$(openssl dgst -sha384 -binary < "$tmp" | openssl base64 -A)"
  rm -f "$tmp"
}

SUPA_URL="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${PIN_SUPABASE_JS}/dist/umd/supabase.min.js"
KATEX_JS="https://cdn.jsdelivr.net/npm/katex@${PIN_KATEX}/dist/katex.min.js"
KATEX_AR="https://cdn.jsdelivr.net/npm/katex@${PIN_KATEX}/dist/contrib/auto-render.min.js"
KATEX_CSS="https://cdn.jsdelivr.net/npm/katex@${PIN_KATEX}/dist/katex.min.css"

echo "Resolving integrity hashes…"
SUPA_SRI="$(sri_for "$SUPA_URL")";      echo "  supabase-js@${PIN_SUPABASE_JS}  $SUPA_SRI"
KATEX_JS_SRI="$(sri_for "$KATEX_JS")";  echo "  katex.min.js                    $KATEX_JS_SRI"
KATEX_AR_SRI="$(sri_for "$KATEX_AR")";  echo "  auto-render.min.js              $KATEX_AR_SRI"
KATEX_CSS_SRI="$(sri_for "$KATEX_CSS")";echo "  katex.min.css                   $KATEX_CSS_SRI"

if [ "$CHECK_ONLY" -eq 1 ]; then
  drift=0
  for f in ./*.html; do
    grep -q 'supabase-js@2["/]' "$f" 2>/dev/null && { echo "DRIFT: $f still loads a floating @2 range"; drift=1; }
    if grep -q 'cdn\.jsdelivr\.net' "$f" 2>/dev/null && ! grep -q 'integrity=' "$f" 2>/dev/null; then
      echo "DRIFT: $f loads from jsdelivr with no integrity attribute"; drift=1
    fi
  done
  [ "$drift" -eq 0 ] && echo "pin-cdn-sri: PASS — all CDN refs pinned with SRI"
  exit "$drift"
fi

echo
echo "Rewriting HTML…"
python3 - "$PIN_SUPABASE_JS" "$SUPA_SRI" "$PIN_KATEX" \
          "$KATEX_JS_SRI" "$KATEX_AR_SRI" "$KATEX_CSS_SRI" <<'PY'
import glob, re, sys

supa_ver, supa_sri, katex_ver, kjs_sri, kar_sri, kcss_sri = sys.argv[1:7]

SUPA = (f'<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@{supa_ver}'
        f'/dist/umd/supabase.min.js" integrity="{supa_sri}" '
        f'crossorigin="anonymous" referrerpolicy="no-referrer"></script>')

def katex(path, sri, css=False):
    url = f'https://cdn.jsdelivr.net/npm/katex@{katex_ver}/dist/{path}'
    if css:
        return (f'<link rel="stylesheet" href="{url}" integrity="{sri}" '
                f'crossorigin="anonymous" referrerpolicy="no-referrer">')
    return (f'<script src="{url}" integrity="{sri}" '
            f'crossorigin="anonymous" referrerpolicy="no-referrer"></script>')

# Any <script> whose src is a supabase-js jsdelivr URL, pinned or not.
SUPA_TAG = re.compile(
    r'<script\b[^>]*\bsrc="https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js@[^"]*"[^>]*>\s*</script>')
KJS_TAG = re.compile(
    r'<script\b[^>]*\bsrc="https://cdn\.jsdelivr\.net/npm/katex@[^"]*/dist/katex\.min\.js"[^>]*>\s*</script>')
KAR_TAG = re.compile(
    r'<script\b[^>]*\bsrc="https://cdn\.jsdelivr\.net/npm/katex@[^"]*/dist/contrib/auto-render\.min\.js"[^>]*>\s*</script>')
KCSS_TAG = re.compile(
    r'<link\b[^>]*\bhref="https://cdn\.jsdelivr\.net/npm/katex@[^"]*/dist/katex\.min\.css"[^>]*>')

total = 0
for f in sorted(glob.glob('*.html')):
    src = open(f, encoding='utf-8').read()
    out = src
    out, a = SUPA_TAG.subn(SUPA, out)
    out, b = KJS_TAG.subn(katex('katex.min.js', kjs_sri), out)
    out, c = KAR_TAG.subn(katex('contrib/auto-render.min.js', kar_sri), out)
    out, d = KCSS_TAG.subn(katex('katex.min.css', kcss_sri, css=True), out)
    n = a + b + c + d
    if n and out != src:
        open(f, 'w', encoding='utf-8').write(out)
        print(f'  {f}: {n} tag(s) pinned')
        total += n

print(f'\n{total} CDN reference(s) pinned with SRI.')
if total:
    print('NOTE: an ESM "+esm" import may remain — SRI does not apply to module')
    print('      imports. Grep for "+esm" and convert it to the UMD build.')
PY

echo
echo "Done. Now:"
echo "  1. Load each page and confirm no CSP/SRI console errors."
echo "  2. Sign in, send a chat message, render a KaTeX formula."
echo "  3. Commit only after that smoke test passes."
