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
  // v98 added a second server-side demotion to this expression, which reads the
  // student's raw message and logs when it fires. Both are supplied here so the
  // REAL expression runs — a stub for either would let the suite pass on code
  // that never executes.
  const question = o.question || '';
  const user = { id: '00000000-0000-0000-0000-000000000000' };
  const console = { log() {} };
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

const { resolveIsMath, resolveDifficulty, recordTopicFor, resolveScope, cleanDifficulty,
        isConversationalOnly } =
  await importTS(harness, ['resolveIsMath', 'resolveDifficulty', 'recordTopicFor',
                           'resolveScope', 'cleanDifficulty', 'isMathTopic', 'parseScopeLabel',
                           'isConversationalOnly']);

// Drive scope through the real resolver rather than hand-building the object,
// so the image/ref fail-open path is exercised as it is in production.
const scopeFor = (raw, opts = { hasImage: false, hasRef: false }) => resolveScope(raw, opts);
const decide = (o) => resolveIsMath({
  parsed: o.parsed ?? {},
  imageData: o.imageData ?? null,
  resolvedRef: o.resolvedRef ?? null,
  finalTopic: o.finalTopic ?? '',
  finalSubtopic: o.finalSubtopic ?? '',
  // Defaults to a message no vocabulary check can claim, so every pre-v98 case
  // below keeps testing exactly what it tested before.
  question: o.question ?? 'solve this equation',
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

// ═══════════════════════════════════════════════════════════════════════════
// v98 — the SECOND way a turn arrives is_math=true having worked no problem
// ═══════════════════════════════════════════════════════════════════════════
// Reported 2026-08-03. The classifier reads the turn with a window of the
// conversation in view, so a bare acknowledgement inherits the previous
// question's identity. Production row 3f52f205: "okk good", one turn after
// "whats 22 root 0", stored as topic=Algebra, subtopic=Exponents,
// difficulty=Easy, is_math=true, with two rules attached — and Zero re-solved
// the previous problem in the answer.
//
// This is the same invariant the suite above pins ("is_math means a math PROBLEM
// was worked"), reached by a different route, so it belongs in the same file.
// It matters more than the v93 case did: is_math gates taxonomy resolution here,
// and the response's topic/subtopic then drive MasteryEngine.onQuestion and the
// weakness signals in chat.html — so one "شكرا" is recorded as practice on a
// subtopic the student never demonstrated.

t.section('v98 — pure acknowledgements are demoted whatever the model claims');

for (const q of [
  'ok', 'okk good', 'okay thanks', 'thanks', 'thank you', 'thank you zero',
  'got it', 'i understand', 'makes sense', 'yes', 'perfect', 'nice',
  'تمام', 'تمام كده', 'شكرا', 'شكراً', 'ماشي', 'كويس', 'حلو', 'حلو اوي',
  'جامد انا فهمت', 'فهمت', 'برافو', 'الله يبارك فيك', 'تسلم يا زيرو',
  'tamam', 'mashi', 'shokran', 'kwayes', 'tamam ya zero',
])
  t.is(`demoted: ${JSON.stringify(q)}`,
    decide({ scope: 'math', parsed: { is_math: true }, question: q,
             finalTopic: 'Algebra', finalSubtopic: 'Exponents' }), false);

// Elongation is how these are actually typed.
for (const q of ['okkkk', 'تماااام', 'shokraaan', 'حلوووو', 'thankssss'])
  t.is(`elongation still demoted: ${JSON.stringify(q)}`,
    decide({ scope: 'math', parsed: { is_math: true }, question: q }), false);

t.section('v98 — and the demotion is what keeps the data clean');

// The whole point. is_math gates the taxonomy branch, and topic/subtopic drive
// mastery and weakness on the client.
t.is('"okk good" is recorded as General, never as Algebra practice',
  recordTopicFor(decide({ scope: 'math', parsed: { is_math: true }, question: 'okk good',
                          finalTopic: 'Algebra' }), 'Algebra'), 'General');
t.is('and carries no difficulty, so no badge and no tier',
  resolveDifficulty({ isMath: decide({ scope: 'math', parsed: { is_math: true },
                                       question: 'okk good' }),
                      parsed: { difficulty: 'Easy' } }), '');

t.section('v98 — REAL MATH IS UNTOUCHED (the no-regression bar)');

// A single unrecognised token is enough to leave the model's label alone. These
// are the cases that must never be demoted.
for (const q of [
  'solve 3x+7=22', '1+1', 'whats 1+1', 'hi zero hru whats 1+1', 'Find x', 'Q17',
  'whats 22 root 0', 'ok now solve 2x=4', 'thanks, now what is the slope',
  'good, but why did you divide by 3', 'حل ده', 'حل المعادلة', 'تمام بس حل دي',
  'ok 5cm', 'يا زيرو حل السوال', 'اشرحلي trignomtry',
])
  t.is(`NOT demoted: ${JSON.stringify(q)}`,
    decide({ scope: 'math', parsed: { is_math: true }, question: q }), true);

// The two axioms every other gate in this function runs on. An upload and a
// resolved worksheet reference are problems, whatever the text says.
t.is('an image turn is never demoted, even when the text is a bare "ok"',
  decide({ scope: 'math', parsed: { is_math: true }, question: 'ok',
           imageData: 'data:image/png;base64,AAA' }), true);
t.is('a worksheet-reference turn is never demoted either',
  decide({ scope: 'math', parsed: { is_math: true }, question: 'تمام',
           resolvedRef: { id: 'q7' } }), true);

// A turn the model already called non-math must not become math. The guard only
// ever demotes.
t.is('the guard only demotes — it never promotes',
  decide({ scope: 'math', parsed: { is_math: false }, question: 'ok' }), false);

t.section('v98 — the predicate itself');

t.is('empty input', isConversationalOnly(''), false);
t.is('null input', isConversationalOnly(null), false);
t.is('a long message is never conversational-only',
  isConversationalOnly('ok '.repeat(40)), false);
t.is('a seven-word thank-you is still conversational',
  isConversationalOnly('تمام كده يا زيرو شكرا جدا اوي'), true);
t.is('but past the token cap nothing is conversational-only',
  isConversationalOnly('ok ok ok ok ok ok ok ok ok'), false);

// Hint mode appends a fixed instruction to the student's text. It is the
// CLIENT's sentence, not the student's, and leaving it in handed every hint-mode
// acknowledgement a dozen unrecognised tokens — which is why "ماشي" in hint mode
// kept its Algebra label in production.
const HINT = '\n\n[Hint mode: please give me only a hint — do not reveal the full solution or steps]';
t.is('the hint-mode suffix is stripped before classifying',
  isConversationalOnly('ماشي' + HINT), true);
t.is('and a real problem in hint mode is still math',
  isConversationalOnly('حل 2x + 5 = 11' + HINT), false);

// Confusion is NOT an acknowledgement. These carry a weakness signal and are
// routed to the repeat path by detectReExplain — demoting them would erase a
// real learning signal.
for (const q of ['مش فاهم', 'I don\'t understand', 'still confused', 'مش عارف', 'explain again'])
  t.is(`confusion is not an acknowledgement: ${JSON.stringify(q)}`,
    isConversationalOnly(q), false);

// ───────────────────────────────────────────────────────────────────────────
t.section('v98 — adversarial pass: what an attack on the vocabulary found');

// Everything in this section is a defect the adversarial sweep produced before
// deployment, not a case invented afterwards to match the code.

// FOUND: two false positives on single-character messages. "a" was in the
// vocabulary for "thanks a lot" and "k" for "ok", so both demoted — but alone
// they are a multiple-choice answer and a variable. Demoting those erases the
// student's answer to a question Zero asked.
for (const q of ['a', 'b', 'c', 'd', 'e', 'k', 'x', 'y', 'n'])
  t.is(`a bare single letter is never demoted: ${JSON.stringify(q)}`,
    isConversationalOnly(q), false);
t.is('…but it is still conversational in company', isConversationalOnly('thanks a lot'), true);

// FOUND: "zero" is in the vocabulary as the tutor's NAME, so a bare "zero"
// demoted — while read as a number it is exactly how a student would answer
// "whats 22 root 0", which is a real question from this corpus.
t.is('"zero" alone is not demoted — it is also the number',
  isConversationalOnly('zero'), false);
t.is('"thanks zero" is, because the vocative is unambiguous in company',
  isConversationalOnly('thanks zero'), true);
t.is('"ya zero" likewise', isConversationalOnly('ya zero'), true);

// FOUND: "إيوه" and "آه" missed their vocabulary entries over an alef form.
for (const q of ['إيوه', 'آه', 'أوك', 'أنا فهمت'])
  t.is(`alef forms are folded: ${JSON.stringify(q)}`, isConversationalOnly(q), true);

// …but ى is deliberately NOT folded to ي. Folding would turn "قوى" (powers)
// into "قوي" ("very") and demote a student asking about exponents.
t.is('"قوي" ("very") is conversational', isConversationalOnly('حلو قوي'), true);
t.is('"قوى" (powers) is NOT — ى must not fold to ي', isConversationalOnly('قوى'), false);

// FOUND: missing vocabulary. Cheap failures — the label simply stood — but each
// one is a turn that kept a math topic it had not earned.
for (const q of ['thanx', 'good job', 'well done', 'شكرا جدا', '7elw', '3azeem',
                 'mersi', 'Shokraaaaan', 'okaaaaaay', 'thankssss'])
  t.is(`now demoted: ${JSON.stringify(q)}`, isConversationalOnly(q), true);

// The negation veto. Every one of these already failed the all-tokens check,
// because no negation word is in the vocabulary — the veto exists so that a
// future edit adding one as "harmless filler" cannot silently start deleting
// weakness signals. "فاهم", "واضح", "understand", "clear", "ok", "تمام" and
// "كويس" ARE all in the vocabulary; their negations are re-explanation requests.
for (const q of ['not ok', 'not clear', 'not good', 'مش تمام', 'مش كويس',
                 'مش واضح', 'مش فاهم', 'mesh tamam', 'msh fahem', 'la2',
                 "i don't understand", 'i dont understand', 'no'])
  t.is(`negated acknowledgement is never demoted: ${JSON.stringify(q)}`,
    isConversationalOnly(q), false);

// FOUND by a THIRD sweep, written from scratch to test generalisation rather
// than recall: seven more vocabulary gaps, and a token cap set one word too low.
// The same sweep produced ZERO false positives, which is the result that
// mattered — the expensive direction held on cases the code had never seen.
for (const q of ['ايوه صح', 'صح', 'ماشي يا معلم', 'الله ينور', 'اوكيه',
                 'تسلم ايدك', 'تمام كده يا زيرو شكرا جدا اوي',
                 'ok cool thanks bro', 'نعم فهمت', 'ok well done zero'])
  t.is(`generalisation gap, now closed: ${JSON.stringify(q)}`,
    isConversationalOnly(q), true);

// …and the math from that sweep, which must keep surviving.
for (const q of ['ok so the answer is 5', 'the answer is zero', 'zero is the answer',
                 '3andi so2al', 'عندي سؤال', 'الاجابه صح ولا غلط', 'is my answer right',
                 'sa7 wala la2', 'ok but why', 'اه بس ليه', 'ok explain step 2',
                 'تمام بس اشرح تاني', 'ok 5', 'tamam 12', 'حلو ٣', 'اشرح', 'كمل', 'تاني'])
  t.is(`still math after the third sweep: ${JSON.stringify(q)}`,
    isConversationalOnly(q), false);

// The hint-mode suffix is the CLIENT's sentence. Read the literal string out of
// chat.html so that editing the client's wording fails here rather than silently
// handing every hint-mode acknowledgement a dozen unrecognised tokens again.
const CHAT = read('chat.html');
const suffixLiteral = /'(\\n\\n\[Hint mode:[^']*)'/.exec(CHAT);
t.ok('chat.html still appends a [Hint mode: …] suffix', !!suffixLiteral);
if (suffixLiteral) {
  const realSuffix = suffixLiteral[1].replace(/\\n/g, '\n');
  t.is('the server strips the suffix chat.html actually sends',
    isConversationalOnly('تمام' + realSuffix), true);
  t.is('and a real problem carrying it is still math',
    isConversationalOnly('3x=9' + realSuffix), false);
}

t.section('v98 — the wiring, not just the predicate');

t.ok('the demotion is applied to the real isMath expression',
  /const isMath = \(scopeDecision\.scope === 'coaching' \|\| conversationalOnly\)/.test(SRC));
t.ok('and is skipped entirely on image / worksheet-reference turns',
  /const conversationalOnly = \(imageData \|\| resolvedRef\)\n\s+\? false\n\s+: isConversationalOnly\(question\);/
    .test(SRC));
t.ok('a demotion is logged, so the guard is observable in production',
  /\[ai-tutor\] conversational-turn-demoted/.test(SRC));
t.ok('the NORMAL prompt tells the model the history is context, not the turn',
  /The conversation above is CONTEXT for how you reply — it is not the turn you are classifying/
    .test(SRC));
t.ok('the NORMAL prompt forbids re-solving on an acknowledgement',
  /do NOT re-solve or re-explain the previous question/.test(SRC));
t.ok('the HINT prompt no longer assumes is_math=true unconditionally',
  /## is_math — set it per turn, do not assume true/.test(SRC));

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
