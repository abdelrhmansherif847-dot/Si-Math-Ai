#!/usr/bin/env node
// scripts/validate-ai-tutor-source.mjs
//
// Pre-deploy validator for supabase/functions/ai-tutor/index.ts.
//
// Exits 0 if the source is structurally well-formed and contains every
// required pillar of the live function. Exits 1 with a specific reason if
// anything is missing — DO NOT DEPLOY when this exits non-zero.
//
// Catches the exact failure mode that produced the 2026-06-17 stub incidents:
// a source file with no `serve()` handler being shipped.
//
// WHY THIS IS NODE AND NOT BASH
// -----------------------------
// This was a bash script, and it was the ONLY member of tests/run-all.mjs that
// shelled out to `bash`. Every other check is pure Node, which is the stated
// design of the suite: "CI needs no test framework — just node".
//
// On Windows that single dependency broke the gate outright. `bash` is either
// absent from PATH, or resolves to WSL's C:\Windows\System32\bash.exe, which
// is handed a Windows path it cannot open. spawnSync then returns status null
// with stdout AND stderr undefined, so the runner printed a bare
// "FAIL validate-ai-tutor-source" with no reason — a gate that fails closed
// but silently, and for a reason unrelated to the file it is guarding.
//
// That mattered more once scripts/windows/deploy-production.ps1 started using
// this suite as a deploy gate: a Windows operator could not get a green run,
// and the obvious workaround would have been to skip the validator — losing
// the stub-deploy guard entirely.
//
// The checks below are a faithful port. scripts/validate-ai-tutor-source.sh is
// now a thin wrapper around this file, so the documented bash entry point in
// DEPLOY.md keeps working with no risk of the two implementations drifting.
//
// Usage:
//   node scripts/validate-ai-tutor-source.mjs [path/to/index.ts]
import { statSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(REPO, 'supabase/functions/ai-tutor/index.ts');

const fail = (msg) => { console.error(`FAIL: ${msg}`); return true; };

if (!existsSync(SRC)) {
  console.error(`FAIL: source file does not exist: ${SRC}`);
  process.exit(1);
}

// Bytes, not characters. The file contains Arabic and box-drawing characters,
// so a UTF-16 length would understate the real size the CDN and the Deno
// bundler see. This matches `wc -c`.
const SIZE = statSync(SRC).size;
const raw = readFileSync(SRC, 'utf8');
// Matches `wc -l`: a count of newline characters.
const LINES = (raw.match(/\n/g) || []).length;

// Hard checks — every one of these must pass.
const CHECKS = [
  // The handler — primary regression guard for the stub-deploy incidents
  /serve\(async \(req\)/,

  // Function header sentinel — proves it's the real source, not a placeholder
  /^\/\/ ai-tutor Edge Function v/m,
  /AI_TUTOR_VERSION = /,

  // Required helper functions (proves no truncation in the helpers block)
  /function detectFranco/,
  /function fallbackHint/,
  /function fallbackRules/,
  /function isMathTopic/,
  /function normalizeRules/,
  /function get_zero_personality/,
  /function search_zero_knowledge/,

  // Required business logic blocks
  /from\('question_records'\).insert/,
  /from\('chat_sessions'\)/,
  /from\('profiles'\)/,
  /response_format/,
  /Access-Control-Allow-Origin/,
];

let FAILED = false;

for (const re of CHECKS) {
  if (!re.test(raw)) FAILED = fail(`missing required pattern: ${re.source}`) || FAILED;
}

// Size sanity. v68 is ~54 KB; v67 was ~50 KB. A real source must be at least
// 40 KB. The 2026-06-17 stub was ~1 KB.
if (SIZE < 40_000) {
  FAILED = fail(`source file is suspiciously small: ${SIZE} bytes (expected >= 40000)`) || FAILED;
}

// Upper bound is a sanity check — the function should never balloon past 210 KB.
// Bumped from 150 KB -> 170 KB after v82 (d343553) grew to 154,774 bytes with
// the empty-answer guard and Example B equivalence helpers.
// Bumped from 170 KB -> 190 KB after v87 grew to ~176 KB with the domain scope
// guardrail (DOMAIN SCOPE prompt section, resolveScope/scopeRedirectMessage
// helpers, and the hint-mode scope block).
// Bumped from 190 KB -> 210 KB after v88 grew to ~194 KB with the security
// admission-control layer (CORS allow-list, rate limiter, request/field bounds,
// session-ownership check, safe error envelope).
// Bumped from 210 KB -> 240 KB after v90 grew to ~223 KB with AI model-call
// telemetry (AI Economics Phase 3): the recordModelCall/flushModelCalls block
// and instrumentation at all eight OpenAI call sites. v89 had already reached
// 206 KB, leaving only 4 KB of headroom under the old bound.
// Bumped from 240 KB -> 260 KB after v92 (failure telemetry) left only 599 bytes
// of headroom and v93 crossed it: the is_math/scope classification fix adds two
// prompt rules and the coaching guard, ~2.2 KB. The bound is a "did something go
// badly wrong" sanity check, not a budget — but it had become tight enough that
// an ordinary prompt edit tripped it, which trains people to raise it reflexively
// instead of reading it. 260 KB restores real headroom.
//
// Bumped from 260 KB -> 280 KB for Truth System v2 Phase V0, which grew the file
// from 256,899 to ~273,000 bytes: the V0 observation surface (policy identity,
// forced-exploration recording, the answer-blind pre-commitment, the decision-row
// builder) plus its wiring in runL3ShadowPipeline.
//
// READ THIS BEFORE RAISING IT A SIXTH TIME. That this bound has now moved five
// times is the finding, not the fix. Every raise has been for a real feature and
// every raise has been correct in isolation, which is exactly how a 4,900-line
// single file with a restricted deploy path is arrived at — and this function has
// already caused two production outages by shipping incomplete (DEPLOY.md §4).
//
// The structural answer is already scoped and is the next phase of work:
// V1-T16 moves the L3 pipeline into supabase/functions/_shared/verification.core.js,
// following the taxonomy.core.js single-source pattern that is already in
// production. After that extraction this number should go DOWN, and a raise that
// is not preceded by an extraction should be challenged in review.
//
// SIXTH RAISE, 280 KB -> 300 KB. The paragraph above asked for this to be
// challenged, so here is the challenge and its answer, on the record.
//
// V1-T16 DID happen: _shared/verification.core.ts is 59,591 bytes and holds the
// L3 pipeline, and the deploy is a four-file bundle (DEPLOY.md §4). The number
// went down, and then index.ts grew back to 279,739 bytes anyway — past where it
// sat before the extraction. So the extraction was real and it did not hold. That
// is the finding this comment predicted, arriving one phase later than expected.
//
// This raise is NOT preceded by a further extraction, and it is being taken
// knowingly for that reason: the worksheet selector adds ~1 KB server-side, and
// 261 bytes of headroom is not a budget, it is a tripwire that any ordinary edit
// trips. Raising it now buys room for the approved feature; it does not answer
// the growth.
//
// What would actually answer it, in rough order of value:
//   • the prompt blocks (system prompt, curriculum/tone/lang anchors, the DOMAIN
//     SCOPE and hint-mode sections) are static text and the largest single
//     contributor — a _shared/prompts.core.ts would move tens of KB and is the
//     same single-source pattern already proven twice;
//   • reference resolution + worksheet scoping is now a self-contained unit with
//     pure helpers and its own suite, so it extracts cleanly;
//   • the fallback dictionaries (fallbackHint, fallbackRules) are pure data.
//
// A SEVENTH raise should not be granted without one of those landing first.
if (SIZE > 300_000) {
  FAILED = fail(`source file is suspiciously large: ${SIZE} bytes (expected <= 300000)`) || FAILED;
}

// Placeholder / TODO / FIXME markers that should never reach production.
if (/^\/\/ (Placeholder|PLACEHOLDER|TODO: deploy|FIXME: deploy)/m.test(raw)) {
  FAILED = fail('source contains placeholder/TODO marker — looks like a draft, not a deploy candidate') || FAILED;
}

if (FAILED) {
  console.error('');
  console.error(`validate-ai-tutor-source: FAILED (${SIZE} bytes, ${LINES} lines)`);
  process.exit(1);
}

const VERSION = (raw.match(/AI_TUTOR_VERSION = '([^']+)'/) || [, ''])[1];
console.log(`validate-ai-tutor-source: PASS (${SIZE} bytes, ${LINES} lines, version=${VERSION})`);
process.exit(0);
