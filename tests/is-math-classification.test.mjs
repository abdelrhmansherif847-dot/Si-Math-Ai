// ai-tutor v93 — is_math must mean "a math PROBLEM was worked", not "this is
// Zero's domain" (supabase/functions/ai-tutor/index.ts).
//
// Regression target, reported 2026-07-31 and confirmed in production data going
// back to 2026-06-01: informational questions about the exam ("امتحان ال DSAT
// كام سوال", "how many questions in EST math") came back is_math=true, so the
// client rendered the full solution workflow — Difficulty, Concepts Detected,
// Old Dragon Advice, "Did this explanation help?" — for a turn where nothing was
// solved. Worse, is_math also gates taxonomy resolution and weakness/mastery
// recording, so those turns were being stored as Algebra practice.
//
// Two different questions were being answered by one flag:
//   • "is this inside Zero's math domain?"      → scope
//   • "did the student work a math problem?"    → is_math
// scope="math" deliberately includes exam-format questions about the math
// sections, and the prompt's bridge rule then forced is_math=true for all of
// them. That conflation is what this suite pins.
//
// Everything below executes the REAL shipped source: the helpers and the
// resolution expressions are sliced out of index.ts and run verbatim, so a
// paraphrase cannot drift from what deploys.
import { suite } from './_assert.mjs';
import { read, slice, importTS } from './_source.mjs';

const t   = suite('is-math-classification');
const SRC = read('supabase/functions/ai-tutor/index.ts');

// ── Pull the real helpers and the real resolution expressions ───────────────
const scopeTs = slice(SRC, 'type ScopeLabel', '// Derive a concise tutor FINAL-answer', 'scope helpers');
const mathTs  = slice(SRC, 'function isMathTopic', '// ── cleanDifficulty', 'isMathTopic');
const diffTs  = slice(SRC, 'function cleanDifficulty', '// ── normalizeRules', 'cleanDifficulty');

// The is_math decision lives inside the handler, so it is sliced and wrapped in
// a function rather than reimplemented. If the markers ever drift, `slice`
// throws instead of letting this suite pass on an empty body.
const decisionRaw = slice(SRC, '    const gptIsMath =',
  '\n    let rules = normalizeRules', 'is_math decision');
if (!/const isMath = /.test(decisionRaw)) {
  throw new Error('is_math decision slice did not capture the final assignment — markers drifted');
}
const difficultyRaw = slice(SRC, '    const finalDifficulty =',
  '\n    // ── Post-process hint', 'finalDifficulty');

const harness = `
${scopeTs}
${mathTs}
${diffTs}

function resolveIsMath(o) {
  const parsed = o.parsed, imageData = o.imageData, resolvedRef = o.resolvedRef;
  const finalTopic = o.finalTopic || '', finalSubtopic = o.finalSubtopic || '';
  const scopeDecision = o.scopeDecision;
${decisionRaw}
  return isMath;
}

function resolveDifficulty(o) {
  const parsed = o.parsed, isMath = o.isMath;
${difficultyRaw}
  return finalDifficulty;
}

// Mirrors the record-shaping branch at index.ts:3994 — the gate that keeps a
// non-math turn out of the taxonomy, mastery and weakness pipelines.
function recordTopicFor(isMath, finalTopic) {
  return isMath ? finalTopic : 'General';
}
`;

const { resolveIsMath, resolveDifficulty, recordTopicFor, resolveScope, cleanDifficulty } =
  await importTS(harness, ['resolveIsMath', 'resolveDifficulty', 'recordTopicFor',
                           'resolveScope', 'cleanDifficulty', 'isMathTopic', 'parseScopeLabel']);

// Drive scope through the real resolver rather than hand-building the object,
// so the image/ref fail-open path is exercised as it is in production.
const scopeFor = (raw, opts = { hasImage: false, hasRef: false }) => resolveScope(raw, opts);
const decide = (o) => resolveIsMath({
  parsed: o.parsed ?? {},
  imageData: o.imageData ?? null,
  resolvedRef: o.resolvedRef ?? null,
  finalTopic: o.finalTopic ?? '',
  finalSubtopic: o.finalSubtopic ?? '',
  scopeDecision: scopeFor(o.scope, { hasImage: !!o.imageData, hasRef: !!o.resolvedRef }),
});

// ───────────────────────────────────────────────────────────────────────────
t.section('The reported bug: informational exam questions are not solved problems');

// Per the v93 prompt these stay scope="math" (Zero answers them) but carry
// is_math=false (nothing was worked). The server must honour that and not
// resurrect is_math via the keyword fallback.
for (const q of [
  '"How many questions are in the DSAT Math section?"',
  '"امتحان ال DSAT كام سوال"',
  '"how many qrustion in est 1 math"',
  '"امتحان est 1 math كام دقيقه"',
])
  t.is(q, decide({ scope: 'math', parsed: { is_math: false } }), false);

t.is('no difficulty badge can render for such a turn',
  resolveDifficulty({ isMath: false, parsed: { difficulty: 'Medium' } }), '');
t.is('and it is recorded as General, so it never enters taxonomy/mastery/weakness',
  recordTopicFor(false, 'Algebra'), 'General');

// ───────────────────────────────────────────────────────────────────────────
t.section('Defence in depth: scope="coaching" forces is_math=false whatever the model says');

t.is('model contradicts itself (scope=coaching + is_math=true) — guard wins',
  decide({ scope: 'coaching', parsed: { is_math: true } }), false);
t.is('"I am scared about my SAT score" mislabelled topic=Algebra (real 2026-06-01 row)',
  decide({ scope: 'coaching', parsed: {}, finalTopic: 'Algebra', finalSubtopic: 'Linear Equations' }), false);
t.is('"أنا باقي كام يوم وأقدر اعمل إيه فيهم" (real 2026-06-11 row)',
  decide({ scope: 'coaching', parsed: { is_math: true }, finalTopic: 'exam strategy' }), false);
t.is('a coaching turn is therefore recorded as General, not as practice',
  recordTopicFor(decide({ scope: 'coaching', parsed: { is_math: true } }), 'Algebra'), 'General');

// ───────────────────────────────────────────────────────────────────────────
t.section('Genuine math-solving is UNCHANGED — the no-regression bar');

t.is('a solved problem (scope=math, is_math=true)',
  decide({ scope: 'math', parsed: { is_math: true } }), true);
t.is('image upload — forced true before the model label is read',
  decide({ scope: 'math', parsed: { is_math: false }, imageData: 'data:image/png;base64,AAA' }), true);
t.is('image upload the model mislabelled scope=coaching — guard must NOT fire',
  decide({ scope: 'coaching', parsed: { is_math: true }, imageData: 'data:image/png;base64,AAA' }), true);
t.is('worksheet ref the model mislabelled scope=coaching — guard must NOT fire',
  decide({ scope: 'coaching', parsed: { is_math: true }, resolvedRef: { id: 'q7' } }), true);

// Fail-open must survive: a missing or junk scope resolves to 'math', so the new
// guard can never introduce a refusal path that did not exist before.
for (const bad of [undefined, null, '', '   ', 'banana', 42, {}, [], true])
  t.is(`junk scope ${JSON.stringify(bad)} still allows a math turn`,
    decide({ scope: bad, parsed: { is_math: true } }), true);

t.is('keyword fallback still applies when the model omits is_math entirely',
  decide({ scope: 'math', parsed: {}, finalTopic: 'Geometry', finalSubtopic: 'Circles' }), true);
t.is('a real math turn keeps its difficulty',
  resolveDifficulty({ isMath: true, parsed: { difficulty: 'Hard' } }), 'Hard');

// ───────────────────────────────────────────────────────────────────────────
t.section('difficulty: the literal string "null" must never reach the client');

// chat.html:1914 tests `r.difficulty` for truthiness, and "null" is truthy, so
// an unsanitised value renders `Difficulty: null` to a student.
for (const bad of ['null', 'NULL', ' null ', 'Null', 'undefined', 'UNDEFINED'])
  t.is(`cleanDifficulty(${JSON.stringify(bad)}) is absent`, cleanDifficulty(bad), '');
for (const [raw, want] of [['Easy','Easy'], ['Medium','Medium'], ['Hard','Hard'],
                           [' Hard ','Hard'], ['', ''], [null, ''], [undefined, '']])
  t.is(`cleanDifficulty(${JSON.stringify(raw)})`, cleanDifficulty(raw), want);

t.is('"nullify" is a normal value, not the sentinel', cleanDifficulty('nullify'), 'nullify');

// The idempotent-replay response returns a STORED difficulty, so rows already
// carrying "null" would replay the badge. Pin the wiring, not just the helper.
t.ok('the idempotency-replay path sanitises the stored difficulty',
  /difficulty:\s+cleanDifficulty\(existing\.difficulty\)/.test(SRC));
t.ok('and no longer passes the stored value through untouched',
  !/difficulty:\s+existing\.difficulty \|\| ''/.test(SRC));
t.is('a math turn whose model said "null" falls back to the existing default',
  resolveDifficulty({ isMath: true, parsed: { difficulty: 'null' } }), 'Medium');
t.is('a non-math turn stays empty regardless',
  resolveDifficulty({ isMath: false, parsed: { difficulty: 'null' } }), '');

// ───────────────────────────────────────────────────────────────────────────
t.section('The prompt rules the fix depends on are present in the shipped source');

// The server guard covers scope="coaching". Nothing in code can decide that an
// exam-format question is informational rather than solvable — only the
// classifier can, and it does that from these two rules. If a future prompt edit
// drops them the bug returns silently, so pin them here.
t.ok('is_math=false rule for questions ABOUT the exam',
  /is_math = false: questions ABOUT the exam rather than math to work on/.test(SRC));
t.ok('bridge rule no longer equates scope="math" with is_math=true',
  /scope="math" turns are is_math=true ONLY when a problem is being solved/.test(SRC));
t.ok('bridge rule still forces coaching and out_of_scope to false',
  /scope="coaching" and scope="out_of_scope" turns are ALWAYS is_math=false/.test(SRC));
t.ok('the old unconditional bridge rule is gone',
  !/scope="math" turns are is_math=true;/.test(SRC));
t.ok('DOMAIN SCOPE still routes math-section exam-format questions to scope="math"',
  /Exam-format questions about the MATH sections/.test(SRC));

t.ok('version banner and AI_TUTOR_VERSION agree',
  /^\/\/ ai-tutor Edge Function (v\d+)/m.exec(SRC)[1] ===
  /AI_TUTOR_VERSION = '([^']+)'/.exec(SRC)[1]);

t.done();
