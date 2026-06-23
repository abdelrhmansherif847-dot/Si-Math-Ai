#!/usr/bin/env bash
# scripts/validate-ai-tutor-source.sh
#
# Pre-deploy validator for supabase/functions/ai-tutor/index.ts.
#
# Exits 0 if the source file is structurally well-formed and contains every
# required pillar of the live function. Exits 1 with a specific reason if
# anything is missing — DO NOT DEPLOY when this exits non-zero.
#
# Catches the exact failure mode that produced the 2026-06-17 stub
# incidents: a source file with no `serve()` handler being shipped.
#
# Usage:
#   ./scripts/validate-ai-tutor-source.sh [path/to/index.ts]
#
# Default path: supabase/functions/ai-tutor/index.ts

set -euo pipefail

SRC="${1:-supabase/functions/ai-tutor/index.ts}"

if [ ! -f "$SRC" ]; then
  echo "FAIL: source file does not exist: $SRC" >&2
  exit 1
fi

SIZE=$(wc -c < "$SRC")
LINES=$(wc -l < "$SRC")

# Hard checks — every one of these must pass.
declare -a CHECKS=(
  # The handler — primary regression guard for the stub-deploy incidents
  'serve\(async \(req\)'

  # Function header sentinel — proves it's the real source, not a placeholder
  '^// ai-tutor Edge Function v'
  'AI_TUTOR_VERSION = '

  # Required helper functions (proves no truncation in the helpers block)
  'function detectFranco'
  'function fallbackHint'
  'function fallbackRules'
  'function isMathTopic'
  'function normalizeRules'
  'function get_zero_personality'
  'function search_zero_knowledge'

  # Required business logic blocks
  "from\\('question_records'\\).insert"
  "from\\('chat_sessions'\\)"
  "from\\('profiles'\\)"
  'response_format'
  'Access-Control-Allow-Origin'
)

FAILED=0
for pattern in "${CHECKS[@]}"; do
  if ! grep -qE "$pattern" "$SRC"; then
    echo "FAIL: missing required pattern: $pattern" >&2
    FAILED=1
  fi
done

# Size sanity. v68 is ~54 KB; v67 was ~50 KB. A real source must be at least
# 40 KB. The 2026-06-17 stub was ~1 KB.
if [ "$SIZE" -lt 40000 ]; then
  echo "FAIL: source file is suspiciously small: $SIZE bytes (expected >= 40000)" >&2
  FAILED=1
fi

# Upper bound is a sanity check — the function should never balloon past 170 KB.
# Bumped from 150 KB → 170 KB after v82 (d343553) grew to 154,774 bytes with
# the empty-answer guard and Example B equivalence helpers.
if [ "$SIZE" -gt 170000 ]; then
  echo "FAIL: source file is suspiciously large: $SIZE bytes (expected <= 170000)" >&2
  FAILED=1
fi

# Placeholder / TODO / FIXME markers that should never reach production.
if grep -qE '^// (Placeholder|PLACEHOLDER|TODO: deploy|FIXME: deploy)' "$SRC"; then
  echo "FAIL: source contains placeholder/TODO marker — looks like a draft, not a deploy candidate" >&2
  FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
  echo ""
  echo "validate-ai-tutor-source: FAILED ($SIZE bytes, $LINES lines)"
  exit 1
fi

VERSION=$(grep -oE "AI_TUTOR_VERSION = '[^']+'" "$SRC" | head -1 | sed "s/.*'\\([^']*\\)'/\\1/")
echo "validate-ai-tutor-source: PASS ($SIZE bytes, $LINES lines, version=$VERSION)"
exit 0
