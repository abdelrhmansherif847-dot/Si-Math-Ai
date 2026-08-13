// Upstream tutor-model failure — the student must be told, not coached.
//
// Session 393c2193 on 2026-08-13: three turns in 17 seconds, each one a
// worksheet reference (Q2, Q11, "SOLVE Q11"). All three recorded
//
//     tutor_main  429  rate_limit_exceeded  prompt_tokens=0  completion_tokens=0
//     "Rate limit reached for gpt-4o … tokens per min (TPM): Limit 30000"
//
// prompt_tokens=0 means OpenAI rejected the request at the gateway: the model
// never saw a single token of the question. The solvers, on the same records,
// ran fine on 25,663 tokens — so the content reached the backend. Only the
// tutor call died.
//
// What the student saw was not an error. It was:
//
//     "Think about step one: what do you know, and what are you trying to find?"
//
// printed twice — once as Zero's answer, once inside "Old Dragon Advice".
//
// Two defects produced that, and this suite pins both:
//
//   D1  the fetch had no retry, so one transient 429 was terminal.
//   D2  the degraded-answer guard read
//           tutorAnswerText = (hint && hint.trim()) ? hint : safeNoAnswerMessage(lang)
//       but `hint` had already been floored to fallbackHint() a few lines above,
//       so it was never empty on a math turn and safeNoAnswerMessage — which
//       says exactly the right thing, "I couldn't generate a full answer this
//       time. Please resend your question" — was unreachable. hint_mode was
//       FALSE on all three records; the hint-mode branch never ran. The guard
//       did this on its own.
//
// The record also shows hint == ai_response, which is the proof that Old Dragon
// Advice was not a second generation: one value reached two response fields.
import { suite } from './_assert.mjs';
import { read, slice, importTS } from './_source.mjs';

const t = suite('tutor-upstream-failure');
const SRC = read('supabase/functions/ai-tutor/index.ts');

// terminalTutorText calls safeNoAnswerMessage, which is declared further down
// the file. Hoisting covers that in production; the slice has to carry both.
const fns = slice(SRC,
  '// ── Upstream failure handling (transient retry + honest degradation) ──────',
  '// ── Fallback hint dictionary',
  'upstream failure helpers');
const safeMsg = slice(SRC, 'function safeNoAnswerMessage(lang: string): string {',
  '\n}\n', 'safeNoAnswerMessage') + '\n}\n';
const { isTransientUpstream, retryDelayMs, terminalTutorText, callTutorModel } =
  await importTS(fns + '\n' + safeMsg,
    ['isTransientUpstream', 'retryDelayMs', 'terminalTutorText', 'callTutorModel']);

const EN_SAFE = "I couldn't generate a full answer this time. Please resend your question and I'll take another look.";
const GENERIC_HINT = 'Think about step one: what do you know, and what are you trying to find?';

// ───────────────────────────────────────────────────────────────────────────
t.section('A. 429 before any tokens — the student is told, not coached');
{
  t.is('the model never ran, so the answer is the honest failure message',
    terminalTutorText('', GENERIC_HINT, true, 'en'), EN_SAFE);
  t.ok('the synthetic hint is NOT presented as the tutor answer',
    terminalTutorText('', GENERIC_HINT, true, 'en') !== GENERIC_HINT);
  t.is('Arabic keeps its own safe message, not the English one',
    terminalTutorText('', GENERIC_HINT, true, 'ar').slice(0, 5), 'معلش،');
}

t.section('B. The model answered — nothing about that path changes');
{
  t.is('a real answer is returned untouched',
    terminalTutorText('x = 5', 'a real model hint', false, 'en'), 'x = 5');
  t.is('a real answer survives even when the upstream later looks unavailable',
    terminalTutorText('x = 5', '', true, 'en'), 'x = 5');
  t.is('model answered but extraction was empty — the old hint floor still applies',
    terminalTutorText('', 'a real model hint', false, 'en'), 'a real model hint');
  t.is('model answered, no hint either — the pre-existing last resort still applies',
    terminalTutorText('', '', false, 'en'), EN_SAFE);
}

t.section('C. Hint Mode OFF + upstream failure — no synthetic hint as the answer');
{
  // hint_mode was false on all three production records. terminalTutorText does
  // not take hintMode at all: the failure path cannot depend on it.
  t.is('a hint the student never asked for is not the answer',
    terminalTutorText('', GENERIC_HINT, true, 'en'), EN_SAFE);
}

t.section('D. Hint Mode ON — the contract holds while the model works');
{
  t.is('hint-mode answer produced by the model is returned as-is',
    terminalTutorText('Try isolating x first.', 'Try isolating x first.', false, 'en'),
    'Try isolating x first.');
  t.is('but an upstream failure is still reported honestly, hint mode or not',
    terminalTutorText('', GENERIC_HINT, true, 'en'), EN_SAFE);
}

// ───────────────────────────────────────────────────────────────────────────
t.section('E1. Which upstream statuses are transient');
{
  for (const s of [429, 500, 502, 503, 504]) t.ok(`${s} is transient`, isTransientUpstream(s));
  for (const s of [400, 401, 403, 404, 413, 422]) {
    t.ok(`${s} is NOT transient — a bad request retried is still a bad request`,
      !isTransientUpstream(s));
  }
  t.ok('200 is not a retry candidate', !isTransientUpstream(200));
}

t.section('E2. Retry-After is honoured and bounded');
{
  t.is('numeric seconds are converted to ms', retryDelayMs('1'), 1000);
  t.is('a long Retry-After is clamped, never slept in full', retryDelayMs('120'), 2000);
  t.is('absent header falls back to a short fixed delay', retryDelayMs(null), 400);
  t.is('garbage header does not produce NaN', retryDelayMs('soon'), 400);
  // Date.parse('-5') is a VALID date in 2001, so a malformed negative used to
  // fall through to the date branch and clamp to 0 — an instant 429 retry.
  t.is('negative is not allowed to invert into a zero delay', retryDelayMs('-5'), 400);
  t.ok('the delay is always bounded', [null, '0', '1', '999999', 'x']
    .every(h => retryDelayMs(h) >= 0 && retryDelayMs(h) <= 2000));
}

t.section('E3. The retry itself — bounded, observable, transient-only');
{
  const mk = (status, body = {}, headers = {}) => ({
    res: { ok: status >= 200 && status < 300, status,
           headers: { get: (n) => headers[n.toLowerCase()] ?? null } },
    json: body,
  });
  const OK = mk(200, { choices: [{ message: { content: '{"answer":"x = 5"}' } }] });
  const RL = mk(429, { error: { code: 'rate_limit_exceeded', message: 'TPM' } }, { 'retry-after': '1' });
  const BAD = mk(400, { error: { code: 'invalid_request_error' } });

  {
    const slept = [];
    const seq = [RL, OK];
    const r = await callTutorModel(async () => seq.shift(), async (ms) => { slept.push(ms); });
    t.is('a transient 429 is retried exactly once', r.attempts.length, 2);
    t.is('the retry succeeded and its answer is the one returned', r.res.status, 200);
    t.is('Retry-After was respected', slept, [1000]);
    t.ok('the FIRST failure is still recorded, not overwritten',
      r.attempts[0].res.status === 429 && r.attempts[1].res.status === 200);
  }
  {
    const slept = [];
    const seq = [RL, RL];
    const r = await callTutorModel(async () => seq.shift(), async (ms) => { slept.push(ms); });
    t.is('retry failure does not retry again — bounded at one', r.attempts.length, 2);
    t.is('the final status is still the failure', r.res.status, 429);
    t.is('only one sleep happened', slept.length, 1);
  }
  {
    const slept = [];
    let calls = 0;
    const r = await callTutorModel(async () => { calls++; return BAD; }, async (ms) => { slept.push(ms); });
    t.is('a non-transient 400 is NOT retried', calls, 1);
    t.is('and nothing was slept', slept.length, 0);
    t.is('one attempt recorded', r.attempts.length, 1);
  }
  {
    let calls = 0;
    const r = await callTutorModel(async () => { calls++; return OK; }, async () => {});
    t.is('a successful first call makes exactly one request', calls, 1);
    t.is('and records exactly one attempt', r.attempts.length, 1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Wiring. The helpers above are only correct if the handler actually uses them.
t.section('F. The handler is wired to the helpers');
{
  t.ok('the tutor call goes through callTutorModel', /callTutorModel\s*\(/.test(SRC));
  t.ok('the terminal guard goes through terminalTutorText', /terminalTutorText\s*\(/.test(SRC));

  const guard = slice(SRC, 'const tutorExtract     = extractTutorAnswer(parsed);',
                           '// ── Persist', 'terminal guard');
  t.ok('the guard no longer floors the answer to hint directly',
    !/\(hint && hint\.trim\(\)\)\s*\?\s*hint\s*:/.test(guard), guard.slice(0, 400));

  // Both fallbackHint call sites must be gated on the model having run.
  const hintBlock = slice(SRC, '// ── Post-process hint ──', 'const tutorExtract', 'hint block');
  const sites = hintBlock.split('fallbackHint(').length - 1;
  t.is('both fallbackHint call sites are still present', sites, 2);

  // Assert the SPECIFIC conditionals, not merely that the token appears
  // somewhere in the block. A mutation that ungated only the first site left a
  // loose /modelUnavailable/ match green — and that mutation is the one that
  // matters most: the answer would still be honest, but `hint` would be the
  // fabricated string, and the client renders `hint` as Old Dragon Advice. The
  // student would get "I couldn't answer" above a confident fake hint.
  t.ok('the hint FLOOR is gated on the model having produced content',
    /if \(isMath && hint\.length === 0 && !modelUnavailable\)/.test(hintBlock), hintBlock);
  t.ok('the hint-mode answer fill is gated too',
    /if \(hintMode && !modelUnavailable/.test(hintBlock), hintBlock);
  t.ok('no fallbackHint call is left ungated on the failure path',
    hintBlock.split('\n').filter(l => l.includes('fallbackHint('))
      .every((_, i, arr) => arr.length === 2), hintBlock);

  t.ok('telemetry records every attempt, so the first failure stays diagnosable',
    /attempt:/.test(SRC), '');
}

t.done();
