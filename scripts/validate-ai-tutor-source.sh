#!/usr/bin/env bash
# scripts/validate-ai-tutor-source.sh
#
# Thin wrapper around scripts/validate-ai-tutor-source.mjs.
#
# The checks moved to Node so the gate runs on Windows as well as Linux. This
# was the only part of tests/run-all.mjs that required `bash`, and on Windows
# `bash` is either absent from PATH or resolves to WSL's bash.exe, which cannot
# open the Windows path it is handed. The result was a validator that failed
# closed but silently — spawnSync returned status null with no stdout or
# stderr, so the runner reported a bare FAIL with no reason, for a cause
# unrelated to the file being guarded.
#
# This wrapper is kept because DEPLOY.md and the pre-deploy checklist reference
# this path. It delegates rather than duplicating, so the two entry points
# cannot drift.
#
# Usage:
#   ./scripts/validate-ai-tutor-source.sh [path/to/index.ts]

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required (the checks live in validate-ai-tutor-source.mjs)" >&2
  exit 1
fi

exec node "$HERE/validate-ai-tutor-source.mjs" "$@"
