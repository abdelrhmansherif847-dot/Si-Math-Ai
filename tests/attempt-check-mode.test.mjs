// Attempt-check mode — the server half of the Confidence redesign.
//
// Confidence stops being a number the student never chose and becomes a
// deliberate statement of intent:
//
//   OFF (default)  "I need help solving this."      -> teach, as today
//   ON             "I already tried. Check my work." -> check the attempt,
//                                                      plus a 1-5 self-rating
//
// Two things this suite exists to pin, because both are easy to get wrong:
//
//  1. THE FIELD IS STUDENT SELF-CONFIDENCE, NOT ZERO'S CONFIDENCE. Nothing here
//     may start treating it as a measure of the answer's correctness.
//
//  2. ABSENT MUST MEAN ABSENT. Today `body.confidence` defaults to 3 when it is
//     not a finite number, which is why 81.7% of `confidence_before` in
//     production is the literal value 3 — a self-assessment the student never
//     gave. OFF must record null, not a fabricated 3.
//
// The inert property (A0) is what allows this to deploy BEFORE the client that
// uses it, exactly as the worksheet selector did: with no `attempt_check` in the
// body, the message array must be identical to today's.
import { suite } from './_assert.mjs';
import { read, slice, importTS } from './_source.mjs';

const t = suite('attempt-check-mode');
const SRC = read('supabase/functions/ai-tutor/index.ts');

const fns = slice(SRC,
  '// ── Attempt-check mode ───────────────────────────────────────────────────',
  '// ── end attempt-check mode',
  'attempt-check helpers');
const { parseConfidence, isAttemptCheck, attemptCheckAnchor } =
  await importTS(fns, ['parseConfidence', 'isAttemptCheck', 'attemptCheckAnchor']);

// ───────────────────────────────────────────────────────────────────────────
t.section('A1. Absent or unusable confidence records NOTHING, never a fabricated 3');
{
  for (const raw of [undefined, null, '', 'not a number', NaN, Infinity, -Infinity, {}, [], true]) {
    t.is(`${JSON.stringify(raw) ?? String(raw)} -> null`, parseConfidence(raw), null);
  }
  t.ok('and null is a legal value for the column it lands in',
    true, 'question_records.confidence_before is nullable — verified against the live schema');
}

t.section('A2. A real self-rating is preserved, clamped to 1..5 as before');
{
  t.is('1 stays 1', parseConfidence(1), 1);
  t.is('3 stays 3', parseConfidence(3), 3);
  t.is('5 stays 5', parseConfidence(5), 5);
  t.is('0 clamps up to 1', parseConfidence(0), 1);
  t.is('9 clamps down to 5', parseConfidence(9), 5);
  t.is('-4 clamps up to 1', parseConfidence(-4), 1);
  t.is('3.4 rounds to 3', parseConfidence(3.4), 3);
  t.is('3.6 rounds to 4', parseConfidence(3.6), 4);
}

t.section('A3. attempt_check is strictly boolean true — nothing truthy sneaks in');
{
  t.is('true -> on', isAttemptCheck(true), true);
  for (const raw of [false, undefined, null, 0, 1, 'true', 'on', 'yes', {}, [], 'false']) {
    t.is(`${JSON.stringify(raw) ?? String(raw)} -> off`, isAttemptCheck(raw), false);
  }
}

t.section('A4. The anchor tells Zero to CHECK the attempt, not to teach from scratch');
{
  const a = attemptCheckAnchor(4);
  t.ok('it is a non-empty string', typeof a === 'string' && a.length > 40, String(a));
  t.ok('it names the student\'s own attempt', /attempt|already (tried|solved)|their work/i.test(a), a);
  t.ok('it asks for a verdict on that work', /check|verify|correct|right or wrong|where.*went wrong/i.test(a), a);
  t.ok('it does not silently withhold the explanation',
    /explain|why|reasoning|show/i.test(a), a);
}

t.section('A5. The anchor carries the SELF-rating, labelled as the student\'s own');
{
  const a2 = attemptCheckAnchor(2);
  t.ok('the number reaches the model at all', /\b2\b/.test(a2), a2);
  t.ok('it is attributed to the STUDENT, not to Zero',
    /student'?s? (own )?(self[- ])?confidence|the student (is|feels)|self-assessment/i.test(a2), a2);
  t.ok('it is never described as confidence in the ANSWER',
    !/confidence in (the|your|its) answer|answer confidence|how correct/i.test(a2), a2);

  // No rating given while ON is legitimate — the student toggled on and sent.
  const aNull = attemptCheckAnchor(null);
  t.ok('a missing rating still yields a usable anchor',
    typeof aNull === 'string' && aNull.length > 40, String(aNull));
  t.ok('and it does not invent a number',
    !/[1-5]\s*\/\s*5/.test(aNull), aNull);
}

t.section('A6. WIRING — the anchor is additive and only present when ON');
{
  const asm = slice(SRC, 'const openaiMessages = [', '];', 'message assembly');

  t.ok('the anchor is spread in conditionally, like toneAnchor',
    /\.\.\.\(attemptAnchor \? \[\{ role: 'system', content: attemptAnchor \}\] : \[\]\)/.test(asm), asm);
  t.ok('it sits before the user turn so the instruction is in force when it is read',
    asm.indexOf('attemptAnchor') < asm.indexOf("role: 'user'"), asm);
  t.ok('the existing system prompt entry is untouched',
    /\{ role: 'system', content: systemPrompt \}/.test(asm), asm);
  t.ok('the existing language anchor is untouched',
    /\{ role: 'system', content: langAnchor \}/.test(asm), asm);

  // The handler must build it from the parsed flag, not from a raw body field.
  const handler = slice(SRC, 'const attemptCheck', '\n    const openaiMessages', 'handler wiring');
  t.ok('attemptCheck comes from the strict parser',
    /isAttemptCheck\(body\.attempt_check\)/.test(SRC), 'isAttemptCheck(body.attempt_check) not found');
  t.ok('confidence comes from the null-preserving parser',
    /parseConfidence\(body\.confidence\)/.test(SRC), 'parseConfidence(body.confidence) not found');
  t.ok('the anchor is null unless attempt-check is on',
    /attemptAnchor\s*=\s*attemptCheck\s*\?/.test(SRC), 'attemptAnchor is not gated on attemptCheck');
}

t.section('A7. INERT WITHOUT THE CLIENT — the property that lets this deploy first');
{
  // Between this deploy and the client PR, every browser sends no attempt_check
  // at all. That window is only safe if the flag is inert when absent.
  t.is('absent attempt_check is off', isAttemptCheck(undefined), false);
  t.ok('no anchor is built when it is off',
    /attemptAnchor\s*=\s*attemptCheck\s*\?[^:]+:\s*null/.test(SRC), 'off must yield null, not a string');

  // And the one thing that DOES change for today's client: nothing, because the
  // current client always sends a finite number.
  t.is('the value the current client sends is unchanged', parseConfidence(3), 3);
  t.is('as is every other value it can send',
    [1, 2, 3, 4, 5].map(parseConfidence), [1, 2, 3, 4, 5]);
}

t.section('A8. The stored column still receives the self-rating, unrenamed');
{
  t.ok('confidence_before is still written from the parsed value',
    /confidence_before:\s*confidence\b/.test(SRC), 'confidence_before write changed shape');
  t.ok('and nothing writes it from a verification/judge value',
    !/confidence_before:\s*(verification|judge|solver|agreement)/i.test(SRC),
    'confidence_before must remain STUDENT self-confidence');
}

t.done();
