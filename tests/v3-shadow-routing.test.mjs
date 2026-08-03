// ai-tutor v97 — the V3 shadow pipeline runs only on turns that contain a
// problem to solve (supabase/functions/_shared/verification.core.ts,
// supabase/functions/ai-tutor/index.ts).
//
// REGRESSION TARGET, reported 2026-08-03 from the Question Inspector and
// confirmed against production `question_records`: non-math turns were entering
// `l3-shadow-v3` and writing shadow rows.
//
//   • 3f52f205 · "okk good" · topic=Algebra subtopic=Exponents · is_math=true
//     A bare acknowledgement one turn after "whats 22 root 0". The classifier
//     sees the conversation history and carried the previous topic forward, so
//     Zero re-answered the earlier problem and the shadow was handed the phrase
//     "okk good". Both solvers returned an empty answer — verification_meta
//     recorded solver_answers ["Final Answer:", "Final Answer:"] — and the row
//     landed at verification_confidence 0.200 with judge_verdict=inconclusive.
//
//   • 6f019c9d · "Give me a similar SAT/ACT question on this topic"
//     is_math=true, and correctly so: a problem WAS worked. But the problem was
//     in Zero's OUTPUT. The solvers were handed the request sentence and
//     returned "x = 2 or x = 3" and "20".
//
// Two different questions were again being answered by one flag:
//   • "did the student work a math problem this turn?"  → is_math
//   • "does THIS TEXT state a problem I can solve?"     → the shadow's input
// The first is a model-authored label about the turn; the second is a fact
// about the bytes handed to Solver A, Solver B and the Judge. Routing on the
// first is what this suite pins shut.
//
// Everything below executes the REAL shipped source — the module is imported,
// so Deno loads the same bytes the same way, and the call-site guard is read
// out of index.ts rather than described.
import { suite } from './_assert.mjs';
import { read, REPO } from './_source.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const t = suite('v3-shadow-routing');

const IDX = read('supabase/functions/ai-tutor/index.ts');

// The module reads Deno.env at import time (OPENAI_KEY, DECISION_LOG_ENABLED),
// so give it a stub before loading — same pattern as verification-v0.
globalThis.Deno = { env: { get: () => undefined } };
const { isShadowEligibleInput } = await import(
  pathToFileURL(resolve(REPO, 'supabase/functions/_shared/verification.core.ts')).href);

const eligible = (text, hasImage = false) => isShadowEligibleInput(text, hasImage).eligible;
const reason   = (text, hasImage = false) => isShadowEligibleInput(text, hasImage).reason;

// ───────────────────────────────────────────────────────────────────────────
t.section('The reported bug — the exact production inputs must not route in');

t.is('"okk good" (row 3f52f205) is rejected', eligible('okk good'), false);
t.is('  …because it carries no mathematical content', reason('okk good'), 'no_math_content');
t.is('"Give me a similar SAT/ACT question on this topic" (row 6f019c9d) is rejected',
  eligible('Give me a similar SAT/ACT question on this topic'), false);
t.is('  …because the problem lives in Zero’s answer, not in the request',
  reason('Give me a similar SAT/ACT question on this topic'), 'generation_request');

// "SAT/ACT" contains a slash. If "/" were treated as a division operator this
// row would route straight back in, so pin that it does not.
t.is('a slash inside "SAT/ACT" is not a division operator',
  eligible('Which topics show up on the SAT/ACT'), false);

// ───────────────────────────────────────────────────────────────────────────
t.section('Non-math turns never enter the pipeline');

for (const q of [
  'hi zero', 'Hiiii', 'Hiiii zeroooo hru', 'hi zero hru', 'How are u',
  'Hey zero', 'ok', 'okk good', 'okay thanks', 'thanks a lot', 'yes',
  'I love math', 'Math is amazing', 'Math is the best', 'Mathhhhhhh',
  'I love mathhhh', 'Let’s gooo', 'Start',
  'ازيك يا زيرو', 'عامل ايه', 'شكرا ليك', 'تمام كده', 'حلو كده',
])
  t.is(`rejected: ${JSON.stringify(q)}`, eligible(q), false);

t.is('an empty input is rejected', eligible(''), false);
t.is('  …with its own reason, distinct from "nothing mathematical"',
  reason('   '), 'empty_input');

// ───────────────────────────────────────────────────────────────────────────
t.section('Math questions always enter the pipeline');

for (const q of [
  '1+1', 'whats 1+1', 'hi zero hru whats 1+1', 'whats 22 root 0',
  'Solve 3x+7=22', '2x+100=1200,find x=?', 'If 6x = 252, what is x?',
  'What is 2+3?', 'Evaluate the limit to nine decimal places.',
  'simplify (x^2-9)/(x-3)', 'find the area of a circle with radius 5',
  'what is the slope of the line through (1,2) and (3,8)',
  'the probability of drawing two red cards',
  'Solve for \\(x\\): \\(3x - 45 = 225\\)',
  'حل المعادلة ٢س + ٥ = ١١', 'احسب مساحة المثلث', 'أوجد قيمة س',
  'بسط المقدار', 'ايه احتمال ظهور الصورة',
])
  t.is(`accepted: ${JSON.stringify(q)}`, eligible(q), true);

// The platform axiom every other gate already runs on: an upload is a problem.
// Text on an image turn is routinely empty or a bare "help" / "حل", and the
// solvers see the image directly, so the text must carry no routing weight.
t.section('An image is always eligible, whatever the text says');
for (const q of ['', 'help', 'help me', 'حل', '?', 'hi zero', 'okk good'])
  t.is(`accepted with an image: ${JSON.stringify(q)}`, eligible(q, true), true);
t.is('  …and says so', reason('okk good', true), 'image');

// ───────────────────────────────────────────────────────────────────────────
t.section('An equation outranks generation phrasing — the gate cannot eat a real problem');

// The asymmetry that matters. A false reject costs one shadow sample; a false
// accept poisons the corpus. But a real problem must never be dropped, so a
// relation symbol wins over every other rule.
t.is('"another question: 2x+5=11" still runs', eligible('another question: 2x+5=11'), true);
t.is('  …routed on its equation, not on its phrasing',
  reason('another question: 2x+5=11'), 'equation');
t.is('"give me the answer to 4y = 20" still runs', eligible('give me the answer to 4y = 20'), true);
t.is('a LaTeX body inside a request still runs',
  eligible('give me another question like \\(x^2 = 49\\)'), true);

t.section('…but a bare request to GENERATE a question does not');
for (const q of [
  'give me another question', 'send me a similar problem', 'quiz me',
  'can you generate more practice questions', 'one more question please',
  'show me a sample problem', 'هاتلي سؤال تاني', 'عايز مسألة تانية',
])
  t.is(`rejected: ${JSON.stringify(q)}`, eligible(q), false);

// ───────────────────────────────────────────────────────────────────────────
t.section('Franco-Arabic digits are letters, not numbers');

// Egyptian students write Arabic in Latin script with digits standing in for
// letters: 3=ع, 7=ح, 2=ء. A naive digit test routes every Franco greeting into
// the pipeline. Both of these are real production rows.
for (const q of [
  'Ya zerooooo 3amel ehhh', 'Yala nbda2 2wel 7aga',
  '3amel eh ya zero', '7amdollah kwayes', 'ezayak ya 3am',
])
  t.is(`rejected: ${JSON.stringify(q)}`, eligible(q), false);

t.is('a whole Franco sentence of "digits" is rejected',
  eligible('la2 3ayzk enta t7el w tdeni el answer 3la tol'), false);

// …while a real number in the same Franco sentence still counts, and a digit
// beside a variable, a label or a unit is never mistaken for Franco.
t.is('a loose numeral among Franco words still routes in',
  eligible('7ell di: 12 + 30'), true);
for (const q of ['2x', '5cm', 'x2 + 1', '3y = 12', '2x2', '3rd term', '1200'])
  t.is(`accepted: ${JSON.stringify(q)}`, eligible(q), true);

// ───────────────────────────────────────────────────────────────────────────
t.section('Replayed against 500 production turns — the cases that replay caught');

// An earlier form of the Franco rule required a token to START with its digits.
// It read every worksheet reference as a Franco word and dropped 25 real math
// turns in the replay. Nothing about the hand-written cases above would have
// caught that, so the corpus findings are pinned here in their own right.
for (const q of ['Q17', 'q36', 'Q5', 'q4', 'Q25'])
  t.is(`a worksheet reference still routes in: ${JSON.stringify(q)}`, eligible(q), true);

// Meta-commands about how Zero should behave. Every one of these carried
// is_math=true and wrote an l3-shadow-v3 row; none contains a problem.
for (const q of [
  'Speak English only', 'Speak English', 'Can u speak english', 'Explain English',
  'كلمني عربي مش فرانكو', 'تحدث العربيه فقط معي فقط', 'اشرحه عربي',
  'dont exblain with franco but with english',
  'no its one quetsion and four option', 'why this time', 'Again',
])
  t.is(`rejected: ${JSON.stringify(q)}`, eligible(q), false);

// Hint-mode turns append a fixed instruction to the student's message. The
// suffix must not become the math signal that routes a chat turn in.
const HINT = '\n\n[Hint mode: please give me only a hint — do not reveal the full solution or steps]';
t.is('a conversational hint-mode turn is still rejected', eligible('ماشي' + HINT), false);
t.is('a hint-mode turn carrying a real problem still runs',
  eligible('حل 2x + 5 = 11' + HINT), true);

// ───────────────────────────────────────────────────────────────────────────
t.section('Word-boundary traps');

// JS \b is defined over ASCII word characters, so a naive Arabic test for "حل"
// also fires inside "مرحلة" — every Arabic greeting would route in. Requiring a
// hard boundary instead misses "المساحة", where the term is glued to the
// definite article. Both directions have to hold at once.
t.is('"حل" does not match inside "مرحلة"', eligible('انا في مرحلة صعبة'), false);
t.is('"حل" does not match inside "حلو" — ubiquitous small talk',
  eligible('حلو اوي كده'), false);
t.is('"مساحة" matches through the definite article', eligible('عايز افهم المساحة'), true);
t.is('"حل" matches with an attached pronoun', eligible('ممكن حلها'), true);
t.is('"معادلة" matches through the definite article', eligible('ازاي احل المعادلة'), true);
// The bare topic word is small talk, not a problem statement.
t.is('"math" alone is not a math problem', eligible('math is my life'), false);
t.is('"log in" is not a logarithm', eligible('i cannot log in'), false);
t.is('"what do you mean" is not a mean', eligible('what do you mean'), false);
t.is('"find my report" is not a math imperative', eligible('where do i find my report'), false);

// ───────────────────────────────────────────────────────────────────────────
t.section('The gate is total and never throws');

for (const bad of [null, undefined, '', '   ', '\n\n'])
  t.is(`${JSON.stringify(bad)} → not eligible, no throw`, eligible(bad), false);
t.is('null with an image is still eligible', eligible(null, true), true);
t.ok('every decision carries a reason',
  [null, '', 'okk good', '1+1', 'give me a question'].every(
    (q) => typeof isShadowEligibleInput(q, false).reason === 'string'));

// ───────────────────────────────────────────────────────────────────────────
t.section('The wiring in index.ts — the gate is not decorative');

// A predicate nothing calls proves nothing. These assertions read the shipped
// call site, so deleting the guard fails here even though the module above
// still passes.
const calls = IDX.split('runL3ShadowPipeline(').length - 1;
t.is('index.ts invokes the pipeline from exactly one place', calls, 1);
t.ok('and imports the routing gate from the same module as the pipeline',
  /import \{[^}]*runL3ShadowPipeline[^}]*isShadowEligibleInput[^}]*\} from '\.\.\/_shared\/verification\.core\.ts'/
    .test(IDX));

const at = IDX.indexOf('runL3ShadowPipeline(', IDX.indexOf('const pipelineTask'));
const preamble = IDX.slice(Math.max(0, at - 1200), at);
t.ok('the call sits behind shadowRouting.eligible',
  /if \(shadowGateOpen && shadowRouting\.eligible\) \{/.test(preamble));
t.ok('the decision is computed from the pipeline’s own inputs, not the raw phrase',
  /const shadowRouting\s+= isShadowEligibleInput\(shadowQuestionText, !!shadowImageData\)/.test(IDX));
t.ok('is_math and a persisted record are still required',
  /const shadowGateOpen = verificationEnabled && verificationShadowOnly && isMath && !!recordId;/
    .test(IDX));
t.ok('a skip is logged with its reason',
  /\[ai-tutor\] l3-shadow-skipped/.test(IDX) && /reason: shadowRouting\.reason/.test(IDX));

// The old unguarded gate must be gone, not merely bypassed.
t.ok('the pre-v97 gate no longer exists',
  !/if \(verificationEnabled && verificationShadowOnly && isMath && recordId\)/.test(IDX));

// ───────────────────────────────────────────────────────────────────────────
t.section('Blast radius — nothing outside the shadow router moved');

// The routing gate must stay a ROUTER: it decides which turns enter L3 Shadow
// and changes nothing else. is_math drives taxonomy, mastery, weakness,
// difficulty and the client's solution workflow, and it is resolved upstream —
// the shadow gate only reads it.
//
// v98 then narrowed is_math itself, deliberately and in its own change, so that
// an acknowledgement stops inheriting the previous turn's topic. That expression
// and its blast radius are pinned in is-math-classification.test.mjs, which owns
// the "is_math means a math PROBLEM was worked" contract. What matters here is
// only that the shadow gate consumes it rather than redefining it.
t.ok('is_math is resolved upstream — scope + the classifier + the v98 demotion',
  /const isMath = \(scopeDecision\.scope === 'coaching' \|\| conversationalOnly\)/.test(IDX));
t.is('the shadow gate consumes is_math, it does not redefine it',
  IDX.split('const isMath = ').length - 1, 1);
t.ok('the taxonomy gate still keys off is_math', /if \(!isMath\) \{\n      safeInsertTopic/.test(IDX));
t.ok('the difficulty detector still keys off is_math', /if \(detectorOn && isMath\) \{/.test(IDX));
t.ok('detector v2 still keys off is_math',
  /if \(detectorV2On && isMath && recordId && v1IsDefaultMedium && OPENAI_KEY\)/.test(IDX));

t.ok('version banner and AI_TUTOR_VERSION agree',
  /^\/\/ ai-tutor Edge Function (v\d+)/m.exec(IDX)[1] ===
  /AI_TUTOR_VERSION = '([^']+)'/.exec(IDX)[1]);

t.done();
