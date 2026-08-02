// Regression suite for Truth System v2 Phase V0 — the observation surface.
//
// Like every other suite here, this executes the REAL shipped source: the V0
// block is sliced out of supabase/functions/ai-tutor/index.ts and imported, so
// a change to the deployed bytes is what passes or fails.
//
// Covers the four approved V0 tasks:
//   • V0-T01  answer-blind judging — the pre-commitment sees no candidate,
//             and the derived verdict is the v2 §9.1 MODEL_OPINION assorter
//   • V0-T06  the decision row carries no student identifier and no free text
//   • V0-T10  policy identity exists and is distinct from the pipeline version
//   • V0-T13  forced-exploration selection, and its default of 1.0
//
// The single most important assertion in this file is "default off": with no
// env change, deploying V0 must leave L3 Shadow byte-identical.
import { suite } from './_assert.mjs';
import { read, slice, importTS } from './_source.mjs';

const t = suite('verification-v0');

const SRC = read('supabase/functions/ai-tutor/index.ts');

// One contiguous slice: the answer-equivalence helpers (blindVerdictFrom needs
// answersEquivalent) followed by the V0 block.
const V0_BLOCK = slice(
  SRC,
  '// Normalize a final-answer string for equality comparison.',
  '// Harden tutor-answer extraction',
  'ai-tutor V0 observation surface',
);

const EXPORTS = [
  'POLICY_VERSION', 'PLAN_ID', 'DEFAULT_EXPLORATION_FRACTION',
  'explorationFraction', 'isForcedExploration', 'judgeAnswerBlindEnabled',
  'blindVerdictFrom', 'runJudgePrecommit', 'buildDecisionRow',
  'DECISION_LOG_ENABLED', 'answersEquivalent', 'JUDGE_PRECOMMIT_SYSTEM_PROMPT',
];

/**
 * Import the real V0 block with a stubbed Deno env and stubbed telemetry.
 * A fresh module per call, so module-scope env reads (DECISION_LOG_ENABLED)
 * are re-evaluated against the env under test.
 */
function load(env = {}) {
  const prelude = `
declare const globalThis: any;
(globalThis as any).Deno = { env: { get: (k: string) => (${JSON.stringify(env)} as any)[k] } };
type ModelCallRow = any;
const OPENAI_KEY = 'test-key';
function recordModelCall(sink: any, args: any): void { if (sink) sink.push(args); }
`;
  return importTS(prelude + V0_BLOCK, EXPORTS);
}

// ── V0-T10: policy identity ─────────────────────────────────────────────────
t.section('V0-T10 — policy identity');
{
  const m = await load();
  t.ok('POLICY_VERSION is a non-empty string', typeof m.POLICY_VERSION === 'string' && m.POLICY_VERSION.length > 0);
  t.ok('PLAN_ID is a non-empty string', typeof m.PLAN_ID === 'string' && m.PLAN_ID.length > 0);
  // The two version axes must not be the same constant. If a future edit points
  // policy_version at L3_PIPELINE_VERSION, a prompt tweak silently reads as a
  // policy change and the propensity log stops being interpretable.
  t.ok('POLICY_VERSION is distinct from PLAN_ID', m.POLICY_VERSION !== m.PLAN_ID);
  t.is('PLAN_ID names the current straight-line pipeline', m.PLAN_ID, 'l3-linear-v1');
}

// ── V0-T13: forced exploration ──────────────────────────────────────────────
t.section('V0-T13 — forced exploration');
{
  const m = await load();
  t.is('default fraction is 1.0 (today: no early exit exists)', m.DEFAULT_EXPLORATION_FRACTION, 1);
  t.is('unset env → default', m.explorationFraction(), 1);

  const half = await load({ VERIFICATION_EXPLORATION_FRACTION: '0.05' });
  t.is('env is read', half.explorationFraction(), 0.05);

  const junk = await load({ VERIFICATION_EXPLORATION_FRACTION: 'not-a-number' });
  t.is('junk config falls back to today’s behaviour, never to 0', junk.explorationFraction(), 1);

  const over = await load({ VERIFICATION_EXPLORATION_FRACTION: '5' });
  t.is('clamped above at 1', over.explorationFraction(), 1);
  const under = await load({ VERIFICATION_EXPLORATION_FRACTION: '-2' });
  t.is('clamped below at 0', under.explorationFraction(), 0);

  // At fraction 1.0 every draw in [0,1) must select, because that is exactly
  // what the pipeline does today. If this ever returns false, V0 has silently
  // changed behaviour.
  t.ok('fraction 1.0 selects every draw', [0, 0.5, 0.999999].every(d => m.isForcedExploration(1, d)));
  t.ok('fraction 0 selects nothing', [0, 0.5, 0.999999].every(d => !m.isForcedExploration(0, d)));
  t.ok('fraction 0.05 selects a draw below it', m.isForcedExploration(0.05, 0.04));
  t.ok('fraction 0.05 rejects a draw above it', !m.isForcedExploration(0.05, 0.06));
}

// ── V0-T01: answer-blindness ────────────────────────────────────────────────
t.section('V0-T01 — the flag is OFF by default');
{
  const m = await load();
  t.is('JUDGE_ANSWER_BLIND unset → disabled', m.judgeAnswerBlindEnabled(), false);
  const off = await load({ JUDGE_ANSWER_BLIND: 'false' });
  t.is('explicit false → disabled', off.judgeAnswerBlindEnabled(), false);
  const junk = await load({ JUDGE_ANSWER_BLIND: 'yes' });
  t.is('anything but the literal "true" → disabled', junk.judgeAnswerBlindEnabled(), false);
  const on = await load({ JUDGE_ANSWER_BLIND: 'true' });
  t.is('explicit true → enabled', on.judgeAnswerBlindEnabled(), true);
}

t.section('V0-T01 — the derived verdict is the v2 §9.1 assorter');
{
  const m = await load();
  const v = (a, b) => m.blindVerdictFrom(a, b);

  t.is('exact match → agrees, assorter 1', v('42', '42'), { verdict: 'agrees', assorter: 1 });
  t.is('mismatch → disagrees, assorter 0', v('42', '43'), { verdict: 'disagrees', assorter: 0 });

  // Equivalence, not string identity — the pre-commitment and the tutor answer
  // are produced by different prompts and will differ in form constantly.
  t.is('9/4 vs 2.25 → agrees', v('9/4', '2.25'), { verdict: 'agrees', assorter: 1 });
  t.is('marker prefix stripped → agrees', v('Final Answer: 7', '7'), { verdict: 'agrees', assorter: 1 });

  // An abstention is 1/2, not 0. Scoring a failed or empty pre-commitment as a
  // disagreement would count a broken API call as evidence against the answer.
  t.is('empty pre-commitment → abstained, assorter 0.5', v('', '42'), { verdict: 'abstained', assorter: 0.5 });
  t.is('empty candidate → abstained, assorter 0.5', v('42', ''), { verdict: 'abstained', assorter: 0.5 });
  t.is('both empty → abstained', v('', ''), { verdict: 'abstained', assorter: 0.5 });
  t.is('whitespace counts as empty', v('   ', '42'), { verdict: 'abstained', assorter: 0.5 });
  t.is('null-ish input does not throw', v(null, undefined), { verdict: 'abstained', assorter: 0.5 });

  t.ok('assorter is always in [0,1]',
    [v('1', '1'), v('1', '2'), v('', '')].every(r => r.assorter >= 0 && r.assorter <= 1));
}

t.section('V0-T01 — the pre-commitment payload carries no candidate');
{
  const m = await load();
  const origFetch = globalThis.fetch;

  // Sentinels shaped like the material runJudge sends: the tutor's explanation,
  // the tutor's final answer, and both solver answers. None may appear.
  const QUESTION = 'If 6x = 252, what is the value of x?';
  const CANDIDATES = ['ZEROS_EXPLANATION_SENTINEL', 'TUTOR_FINAL_SENTINEL',
                      'SOLVER_A_SENTINEL', 'SOLVER_B_SENTINEL'];

  let captured = null;
  globalThis.fetch = async (_url, init) => {
    captured = JSON.parse(init.body);
    return { ok: true, status: 200,
             json: async () => ({ choices: [{ message: { content: 'Final Answer: 42' } }] }) };
  };

  const sink = [];
  const r = await m.runJudgePrecommit(QUESTION, null, sink);

  t.is('the final answer is parsed off the marker line', r.answer, '42');
  t.ok('the question reaches the model', JSON.stringify(captured).includes('6x = 252'));

  const body = JSON.stringify(captured);
  t.ok('no candidate sentinel appears in the request body',
    CANDIDATES.every(c => !body.includes(c)));

  // The structural guard. runJudgePrecommit takes (questionText, imageData,
  // sink) and nothing else, so there is no candidate in scope to leak. If a
  // fourth parameter is ever added, this fails before the sentinel check can.
  t.is('arity is exactly (questionText, imageData, sink)', m.runJudgePrecommit.length, 3);

  // Exactly two messages: the system prompt and the question. Any candidate
  // material added later would have to arrive as a third message or inside one
  // of these two, and both are asserted.
  t.is('exactly two messages are sent', captured.messages.length, 2);
  t.is('message 0 is the system prompt', captured.messages[0].role, 'system');
  t.is('message 1 is the user question', captured.messages[1].content, QUESTION);

  // runJudge labels its candidate material with these words. Their absence from
  // the system prompt is what stops a copy-paste from runJudge landing here.
  const sys = captured.messages[0].content.toLowerCase();
  t.ok('the system prompt never mentions a tutor, a candidate or a solver',
    !/tutor|candidate|solver|proposed answer/.test(sys));

  t.is('the call is recorded as judge/precommit', sink.length && sink[0].stage, 'precommit');
  t.is('the call is attributed to the judge service', sink.length && sink[0].service_code, 'judge');

  globalThis.fetch = origFetch;
}

t.section('V0-T01 — the pre-commitment fails safe');
{
  const m = await load();
  const origFetch = globalThis.fetch;

  globalThis.fetch = async () => { throw new Error('network down'); };
  const sink = [];
  const r = await m.runJudgePrecommit('anything', null, sink);
  t.is('a thrown fetch yields an empty answer, not a throw', r, { answer: '', raw: '' });
  t.ok('the failed call is still recorded as spend', sink.length === 1);

  // Empty answer must route to abstention, never to disagreement.
  t.is('an empty answer scores as an abstention',
    m.blindVerdictFrom(r.answer, '42'), { verdict: 'abstained', assorter: 0.5 });

  globalThis.fetch = async (_url, init) => {
    const b = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '42' } }] }),
             _b: b };
  };
  const bare = await m.runJudgePrecommit('q', null, []);
  t.is('a bare answer with no marker still parses', bare.answer, '42');

  globalThis.fetch = origFetch;
}

t.section('V0-T01 — image questions still send the image');
{
  const m = await load();
  const origFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (_url, init) => {
    captured = JSON.parse(init.body);
    return { ok: true, status: 200,
             json: async () => ({ choices: [{ message: { content: 'Final Answer: 5' } }] }) };
  };
  await m.runJudgePrecommit('q', 'data:image/png;base64,AAAA', []);
  const content = captured.messages[1].content;
  t.ok('the user message is multipart', Array.isArray(content));
  t.ok('an image part is present', content.some(p => p.type === 'image_url'));
  t.is('still exactly two messages', captured.messages.length, 2);
  globalThis.fetch = origFetch;
}

// ── V0-T06: the decision row ────────────────────────────────────────────────
t.section('V0-T06 — the decision row shape');

const BASE = {
  decisionUid: '11111111-1111-4111-8111-111111111111',
  decidedAt: '2026-08-02T00:00:00.000Z',
  pipelineVersion: 'l3-shadow-v3',
  questionRecordId: '22222222-2222-4222-8222-222222222222',
  requestId: '33333333-3333-4333-8333-333333333333',
  clientRequestId: null,
  lessonId: 'ALG_006',
  difficultyBin: 'medium',
  forcedExploration: true,
  explorationFraction: 1,
  judgeAnswerBlind: false,
  legacyJudgeVerdict: 'agrees',
  solverAgreement: 1,
  pipelineLatencyMs: 4200,
};

const EXPECTED_KEYS = [
  'decision_uid', 'decided_at', 'question_record_id', 'request_id',
  'client_request_id', 'pipeline_version', 'policy_version', 'plan_id',
  'lesson_id', 'difficulty_bin', 'forced_exploration', 'exploration_fraction',
  'judge_answer_blind', 'blind_verdict', 'blind_assorter',
  'legacy_judge_verdict', 'solver_agreement', 'pipeline_latency_ms',
];

{
  const m = await load();
  const row = m.buildDecisionRow(BASE);

  t.is('the key set is exactly the migration’s column set',
    Object.keys(row).sort(), [...EXPECTED_KEYS].sort());

  t.is('policy identity is stamped from the constants, not the caller',
    [row.policy_version, row.plan_id], [m.POLICY_VERSION, m.PLAN_ID]);
  t.is('the pipeline version comes from the caller', row.pipeline_version, 'l3-shadow-v3');
  t.is('the segment keys are carried', [row.lesson_id, row.difficulty_bin], ['ALG_006', 'medium']);
  t.is('the exploration fraction in force is recorded', row.exploration_fraction, 1);
  t.is('forced_exploration is recorded', row.forced_exploration, true);
}

t.section('V0-T06 — the compliance boundary (v2 §11, §23)');
{
  const m = await load();
  // Populate every optional field, so nothing hides behind a null.
  const row = m.buildDecisionRow({
    ...BASE, judgeAnswerBlind: true, blindVerdict: 'agrees', blindAssorter: 1,
    clientRequestId: '44444444-4444-4444-8444-444444444444',
  });

  // This table is retained permanently. An identifier here is not a schema
  // change, it is a change to what the platform keeps about a child.
  const FORBIDDEN = [
    'user_id', 'session_id', 'email', 'image', 'question', 'question_text',
    'answer', 'ai_response', 'zero_answer', 'explanation', 'reasoning',
    'solver_answers', 'solver_reasonings', 'judge_reasoning', 'raw_output',
    'verification_meta', 'name', 'ip',
  ];
  const keys = Object.keys(row);
  const leaked = FORBIDDEN.filter(f => keys.some(k => k === f || k.endsWith(`_${f}`)));
  t.is('no identifier or free-text column is present', leaked, []);

  // Belt and braces: no value in the row is long enough to be prose. Every
  // legitimate field is a uuid, a short enum, a number, a boolean or a date.
  const longValues = Object.entries(row)
    .filter(([, v]) => typeof v === 'string' && v.length > 64)
    .map(([k]) => k);
  t.is('no value is long enough to be free text', longValues, []);

  t.ok('every value is a scalar, a date string or null',
    Object.values(row).every(v =>
      v === null || ['string', 'number', 'boolean'].includes(typeof v)));
}

t.section('V0-T06 — blind fields honour the table’s coherence constraint');
{
  const m = await load();
  // The migration CHECKs that a blind verdict cannot exist on a run where the
  // blind judge did not fire. The builder must not be able to violate it, even
  // when a caller passes stale values.
  const row = m.buildDecisionRow({
    ...BASE, judgeAnswerBlind: false, blindVerdict: 'agrees', blindAssorter: 1,
  });
  t.is('blind_verdict is nulled when the blind judge did not run', row.blind_verdict, null);
  t.is('blind_assorter is nulled when the blind judge did not run', row.blind_assorter, null);

  const on = m.buildDecisionRow({
    ...BASE, judgeAnswerBlind: true, blindVerdict: 'disagrees', blindAssorter: 0,
  });
  t.is('blind_verdict is kept when the blind judge ran', on.blind_verdict, 'disagrees');
  t.is('blind_assorter 0 survives (not coerced to null)', on.blind_assorter, 0);

  const missing = m.buildDecisionRow({ ...BASE, judgeAnswerBlind: true });
  t.is('blind judge on but no verdict → null, not undefined', missing.blind_verdict, null);
}

t.section('V0-T06 — the decision log kill switch');
{
  const on = await load();
  t.is('unset → enabled', on.DECISION_LOG_ENABLED, true);
  const off = await load({ VERIFICATION_DECISION_LOG_ENABLED: 'false' });
  t.is('explicit false → disabled', off.DECISION_LOG_ENABLED, false);
  const other = await load({ VERIFICATION_DECISION_LOG_ENABLED: 'true' });
  t.is('explicit true → enabled', other.DECISION_LOG_ENABLED, true);
}

// ── The invariant that matters most ─────────────────────────────────────────
t.section('L3 Shadow is untouched');
{
  // The legacy quality score is a live contract: ai-monitor.html renders it.
  // V0 must not have altered its formula. Asserted against the shipped bytes.
  const formula = SRC.includes('0.40 * solver_agreement + 0.30 * reasoningCompleteness + 0.30 * judge.confidence');
  t.ok('verification_quality_score’s formula is unchanged', formula);

  // The legacy judge still receives the tutor answer — V0 adds a second judge,
  // it does not convert the existing one.
  t.ok('runJudge still takes zeroAnswer', /async function runJudge\(\s*\n?\s*questionText: string, zeroAnswer: string/.test(SRC));

  // The pre-commitment must be sequenced after the legacy judge, so the legacy
  // verdict is produced from exactly the inputs and ordering it always was.
  const judgeCall = SRC.indexOf('const judge = await runJudge(solveText');
  const precommitCall = SRC.indexOf('precommit = await runJudgePrecommit(');
  t.ok('the pre-commitment runs after the legacy judge', judgeCall > 0 && precommitCall > judgeCall);

  // The decision row is written after the question_records update, so a throw
  // in the new code cannot cost L3 Shadow its telemetry.
  const qrUpdate = SRC.indexOf(".from('question_records')\n    .update({");
  const decisionWrite = SRC.indexOf(".from('verification_decisions')");
  t.ok('the decision row is written after the question_records update',
    qrUpdate > 0 && decisionWrite > qrUpdate);

  // Every V0 addition to verification_meta must be new. A renamed or removed
  // key breaks ai-monitor.html, which reads this object's internal shape.
  // Keys are matched inside the object literal itself, and both spellings count
  // — several are ES6 shorthand (`low_quality_solver,`) rather than `key: value`.
  const META = slice(SRC, 'const verificationMeta = {', '\n  };', 'verificationMeta literal');
  const metaKeys = new Set(
    META.split('\n')
      .map(l => (l.trim().match(/^([a-z_0-9]+)\s*[:,]/) || [])[1])
      .filter(Boolean),
  );
  const META_KEYS_BEFORE = [
    'pipeline_version', 'ocr_ambiguity_flags', 'ocr_rerun_count', 'solver_answers',
    'solver_reasonings', 'solver_model', 'solver_temperatures', 'judge_model',
    'judge_reasoning', 'verification_quality_score', 'verification_reason',
    'zero_answer_hash', 'pipeline_latency_ms', 'expert_trigger', 'low_quality_solver',
  ];
  t.is('no pre-existing verification_meta key was renamed or removed',
    META_KEYS_BEFORE.filter(k => !metaKeys.has(k)), []);

  // And the V0 keys really are present, so "additive" is verified in both
  // directions rather than asserted.
  t.is('the V0 keys were added to verification_meta',
    ['policy_version', 'plan_id', 'forced_exploration', 'exploration_fraction',
     'judge_answer_blind'].filter(k => !metaKeys.has(k)), []);
}

t.done();
