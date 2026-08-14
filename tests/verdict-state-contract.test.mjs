// Verdict Pilot P4 — the verdict state contract.
//
// This suite proves a negative and one positive.
//
// THE NEGATIVE: no code in P4 decides which verdict an item gets. Not from
// engine count, not from agreement, not from a verifier's outcome, not from
// anything. The envelope constructor is a pure recorder whose `state` is always
// null, and the setter that CAN carry a state refuses to invent one — it demands
// that a later phase name both the state and who assigned it.
//
// THE POSITIVE: all six states are representable today, so a later phase can
// express VERIFIED, HIGH_CONFIDENCE, LOW_CONFIDENCE, AMBIGUOUS,
// INSUFFICIENT_INFORMATION and ITEM_DISPUTED without redesigning the data model.
//
// THE CASE THE WHOLE CONTRACT EXISTS FOR
// ──────────────────────────────────────
// A deterministic verifier contradicts a candidate that every model agreed on.
// UNANIMOUS-WRONG-1 is exactly that shape: three engines publish "D) 9" and the
// verifier says 9 is wrong. P4 must record BOTH sides with neither marked the
// winner. A majority vote would promote 9 to truth; a verifier-always-wins rule
// would promote the verifier. Both are decisions, and P4 makes neither — it
// records a dispute and leaves it open, with `resolution: null`.
//
// COUNT-AGNOSTIC, inherited from P2/P3 and re-proven here at N = 0,1,2,3,4,5.
// The engine count is provenance — who observed what — and is never allowed to
// become confidence, sufficiency, quality or truth.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('verdict-state-contract');

const P4S = '/home/user/Si-Math-Ai/supabase/functions/_shared/verdict-state.core.ts';
const P4V = '/home/user/Si-Math-Ai/supabase/functions/_shared/deterministic-verifier.core.ts';
const P2 = '/home/user/Si-Math-Ai/supabase/functions/_shared/evidence-builder.core.ts';
const P1 = '/home/user/Si-Math-Ai/supabase/functions/_shared/evidence.core.ts';

const { VERDICT_STATES, isVerdictState, createVerdictEnvelope, withVerdictState } = await import(P4S);
const { createTableVerifier } = await import(P4V);
const { buildEvidence } = await import(P2);
const { normalizeSolverOutput } = await import(P1);

const SRC = read('supabase/functions/_shared/verdict-state.core.ts');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|[^:\\])\/\/.*$/, '$1')).join('\n');

const FIX = JSON.parse(read('tests/fixtures/phase3-pilot-engines.json'));
const item = (id) => FIX.items.find((i) => i.id === id);
const subs = (id, only) => {
  const it = item(id);
  return (only ?? Object.keys(it.engines)).map((eid) => ({
    engine_id: eid,
    output: normalizeSolverOutput(it.engines[eid], { question_text: it.question_text, choices: it.choices }),
  }));
};
const evidenceFor = (id, only) => buildEvidence(subs(id, only), { choices: item(id).choices });

const IDENT = { verifier_id: 'table-stub', version: 'v1', method: 'fixture_table_lookup' };
const V = createTableVerifier(IDENT, [
  { item_id: 'UNANIMOUS-WRONG-1', candidate: '9', outcome: 'contradicted', evidence: { enumerated: 7, expected: '7' } },
  { item_id: 'Q79', candidate: '7', outcome: 'verified', evidence: { enumerated: 7 } },
], { supported_items: ['UNANIMOUS-WRONG-1', 'Q79'] });

const verifyOn = async (item_id, candidate) => V.verify({
  subject: {
    item_id, question_text: item(item_id).question_text, choices: item(item_id).choices,
    interpretation: null, interpretation_version: null,
  },
  candidate, candidate_source: 'model_agreement', policy_version: 'p1',
});

// ───────────────────────────────────────────────────────────────────────────
t.section('W1. All six states are representable');
{
  t.is('the vocabulary is exactly the six required states', VERDICT_STATES,
    ['VERIFIED', 'HIGH_CONFIDENCE', 'LOW_CONFIDENCE', 'AMBIGUOUS', 'INSUFFICIENT_INFORMATION', 'ITEM_DISPUTED']);
  for (const s of VERDICT_STATES) t.ok(`recognized: ${s}`, isVerdictState(s));
  t.ok('and nothing else is', !isVerdictState('PROBABLY_RIGHT') && !isVerdictState('verified') && !isVerdictState(null));

  // Representable means a later phase can carry each one through the existing
  // shape — no field added, no model redesigned.
  const base = createVerdictEnvelope({ model_evidence: evidenceFor('Q79'), verifier_results: [], policy_version: 'p1' });
  for (const s of VERDICT_STATES) {
    const e = withVerdictState(base, s, { assigned_by: 'later-phase-resolver', basis: 'out_of_scope_for_p4' });
    t.is(`carried without redesign: ${s}`, e.state, s);
    t.is('  and the original envelope is untouched', base.state, null);
    t.is('  with the same key set', Object.keys(e).sort().join(','), Object.keys(base).sort().join(','));
  }
}

// ───────────────────────────────────────────────────────────────────────────
t.section('W2. The envelope never assigns a state — that is the point');
{
  const e = createVerdictEnvelope({ model_evidence: evidenceFor('Q79'), verifier_results: [], policy_version: 'p1' });
  t.is('state is null', e.state, null);
  t.is('nobody assigned it', e.state_assigned_by, null);
  t.is('and there is no basis, because there is no state', e.state_basis, null);
  t.ok('the reason is explicit rather than implied',
    /not_implemented|out_of_scope|p4/i.test(String(e.unassigned_reason)), String(e.unassigned_reason));

  // The strongest form of "no selection": unanimous agreement, no verifier,
  // nothing to dispute — the single most tempting input to auto-resolve.
  const u = createVerdictEnvelope({ model_evidence: evidenceFor('UNANIMOUS-WRONG-1'), verifier_results: [], policy_version: 'p1' });
  t.is('three engines agreeing produce no verdict', u.state, null);
  t.is('and no dispute either', u.disputes, []);
  t.ok('the agreement itself is still preserved',
    u.model_evidence.some((r) => r.type === 'RAW_ANSWER_AGREEMENT'), JSON.stringify(u.model_evidence.map((r) => r.type)));

  // A verifier saying `verified` is also not a verdict. One check succeeding is
  // not the item being decided.
  const v = createVerdictEnvelope({
    model_evidence: evidenceFor('Q79'), verifier_results: [await verifyOn('Q79', '7')], policy_version: 'p1',
  });
  t.is('a successful verifier check still yields no verdict', v.state, null);
  t.is('and its outcome is preserved as evidence', v.verifier_results[0].outcome, 'verified');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('W3. Verifier contradicts unanimous models — both sides survive, neither wins');
{
  const contradiction = await verifyOn('UNANIMOUS-WRONG-1', '9');
  t.is('the verifier contradicted the candidate', contradiction.outcome, 'contradicted');

  const e = createVerdictEnvelope({
    model_evidence: evidenceFor('UNANIMOUS-WRONG-1'),
    verifier_results: [contradiction],
    policy_version: 'p1',
  });

  t.is('exactly one dispute is recorded', e.disputes.length, 1);
  const d = e.disputes[0];
  t.is('named for what it is', d.kind, 'VERIFIER_CONTRADICTS_MODEL_ANSWER');
  t.is('about a specific candidate', d.candidate, '9');

  t.is('the verifier side is present', d.verifier_side.length, 1);
  t.is('  with its identity', d.verifier_side[0].verifier_id, 'table-stub');
  t.is('  its version', d.verifier_side[0].version, 'v1');
  t.is('  its method', d.verifier_side[0].method, 'fixture_table_lookup');
  t.is('  its outcome', d.verifier_side[0].outcome, 'contradicted');
  t.is('  and its deterministic evidence', d.verifier_side[0].evidence, { enumerated: 7, expected: '7' });

  t.ok('the model side is present', d.model_side.length >= 1, JSON.stringify(d.model_side));
  const engines = [...new Set(d.model_side.flatMap((m) => m.engines))].sort();
  t.is('  naming every engine that said it', engines, ['engine_alpha', 'engine_beta', 'engine_gamma']);
  t.is('  and the value they said', d.model_side[0].value, '9');

  t.is('the dispute is unresolved', d.resolution, null);
  t.is('and nobody resolved it', d.resolved_by, null);
  t.is('the envelope still holds no verdict', e.state, null);

  // Neither side is privileged anywhere in the structure.
  const json = JSON.stringify(e);
  t.ok('no winner is named', !/winner|wins|prevail|authoritative|override|trump/i.test(json), json.slice(0, 200));
  t.ok('no side is marked correct', !/is_correct|correct_answer|"truth"/i.test(json), json.slice(0, 200));
  t.ok('and the raw model evidence is still there in full',
    e.model_evidence.length === evidenceFor('UNANIMOUS-WRONG-1').length, String(e.model_evidence.length));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('W4. A dispute needs an explicit contradiction — it is never inferred');
{
  // The verifier verified 7 on Q79 while engine_delta published only a letter.
  // "Verified X therefore not-Y" is an inference P4 must not make: X and Y may
  // be different renderings of the same value, and deciding that is a later
  // stage's job.
  const e = createVerdictEnvelope({
    model_evidence: evidenceFor('Q79'), verifier_results: [await verifyOn('Q79', '7')], policy_version: 'p1',
  });
  t.is('a `verified` outcome creates no dispute', e.disputes, []);

  const inconclusive = await verifyOn('Q79', '8');   // supported item, no table entry
  t.is('and neither does an inconclusive one',
    createVerdictEnvelope({ model_evidence: evidenceFor('Q79'), verifier_results: [inconclusive], policy_version: 'p1' }).disputes, []);

  // A contradiction of something no model said is recorded as a verifier result,
  // but there is no dispute: nobody is on the other side.
  const V2 = createTableVerifier(IDENT, [
    { item_id: 'Q79', candidate: '42', outcome: 'contradicted', evidence: { enumerated: 7 } },
  ], { supported_items: ['Q79'] });
  const orphan = await V2.verify({
    subject: { item_id: 'Q79', question_text: item('Q79').question_text, choices: item('Q79').choices, interpretation: null, interpretation_version: null },
    candidate: '42', candidate_source: 'hypothesis', policy_version: 'p1',
  });
  const e2 = createVerdictEnvelope({ model_evidence: evidenceFor('Q79'), verifier_results: [orphan], policy_version: 'p1' });
  t.is('contradicting a candidate no model offered is not a dispute', e2.disputes, []);
  t.is('but the verifier result is still preserved', e2.verifier_results.length, 1);
}

// ───────────────────────────────────────────────────────────────────────────
t.section('W5. No verdict-selection, no voting, no confidence — in the source');
{
  t.ok('no majority or voting logic', !/majority|vote|voting|consensus|quorum|tally/i.test(CODE), CODE.slice(0, 300));
  t.ok('no confidence scoring', !/confidence_?score|calculate|probability|likelihood|weight/i.test(CODE), CODE.slice(0, 300));
  t.ok('no winner selection', !/winner|select_?best|pick_?answer|resolve\(/i.test(CODE), CODE.slice(0, 300));
  t.ok('no threshold constants', !/threshold|>=\s*0\.\d|0\.\d+/.test(CODE), CODE.slice(0, 300));
  t.ok('no routing, escalation or cost policy', !/escalat|routing|route\(|budget|latency|\bcost\b/i.test(CODE), CODE.slice(0, 300));
  t.ok('no ranking', !/leaderboard|best_?model|accuracy|benchmark/i.test(CODE), CODE.slice(0, 300));
  t.ok('no provider names', !/openai|anthropic|gemini|kimi|claude|gpt-|deepseek/i.test(CODE), CODE.slice(0, 300));

  // withVerdictState carries a state; it never chooses one. It refuses an
  // unnamed assigner, so "who decided this" can never be lost.
  const base = createVerdictEnvelope({ model_evidence: [], verifier_results: [], policy_version: 'p1' });
  const nameless = withVerdictState(base, 'VERIFIED', { assigned_by: '', basis: 'x' });
  t.is('an unnamed assigner cannot set a state', nameless.state, null);
  t.ok('and says why', /assigner/i.test(String(nameless.unassigned_reason)), String(nameless.unassigned_reason));
  const bogus = withVerdictState(base, 'PROBABLY_RIGHT', { assigned_by: 'r', basis: 'x' });
  t.is('an unrecognized state cannot be set', bogus.state, null);
  t.ok('and says why', /state/i.test(String(bogus.unassigned_reason)), String(bogus.unassigned_reason));
  const ok = withVerdictState(base, 'ITEM_DISPUTED', { assigned_by: 'later-phase-resolver', basis: 'documented_elsewhere' });
  t.is('a named assigner can', ok.state, 'ITEM_DISPUTED');
  t.is('  and is recorded', ok.state_assigned_by, 'later-phase-resolver');
  t.is('  with the basis it gave', ok.state_basis, 'documented_elsewhere');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('W6. Count-agnostic — N = 0,1,2,3,4,5 and the count means nothing');
{
  const cases = [
    ['N=0', []],
    ['N=1', evidenceFor('NOANSWER-1')],
    ['N=2', evidenceFor('PROSE-1')],
    ['N=3', evidenceFor('UNANIMOUS-WRONG-1')],
    ['N=4', evidenceFor('Q79')],
    ['N=5', evidenceFor('SWEEP-1')],
  ];
  for (const [label, ev] of cases) {
    const e = createVerdictEnvelope({ model_evidence: ev, verifier_results: [], policy_version: 'p1' });
    t.is(`${label}: no verdict`, e.state, null);
    t.is(`${label}: no dispute without a contradiction`, e.disputes, []);
    t.is(`${label}: the same key set as every other N`, Object.keys(e).sort().join(','),
      ['disputes', 'model_evidence', 'policy_version', 'state', 'state_assigned_by', 'state_basis', 'unassigned_reason', 'verifier_results'].join(','));
  }
  const json = JSON.stringify(cases.map(([, ev]) => createVerdictEnvelope({ model_evidence: ev, verifier_results: [], policy_version: 'p1' })));
  // Word-bounded on purpose: P2's honest basis string `normalized_string_equality`
  // contains "quality", and `insufficient_information` is a legitimate verifier
  // outcome. A scan that flagged either would be a false alarm reported as a
  // safety property.
  t.ok('no count, sufficiency or confidence field appears at any N',
    !/engine_count|n_engines|sufficiency|confidence|strength|\bquality\b|\bscore\b/i.test(json), json.slice(0, 200));
  t.ok('and the source has no expected-count constant',
    !/length\s*[><]=?\s*3|expected_?count|MIN_ENGINES|required_?engines/i.test(CODE), CODE.slice(0, 300));

  // N=1 is an observation, not agreement — and a verifier contradicting a lone
  // engine is still a dispute, because the contract is about sides, not counts.
  const solo = subs('UNANIMOUS-WRONG-1', ['engine_alpha']);
  const e1 = createVerdictEnvelope({
    model_evidence: buildEvidence(solo, { choices: item('UNANIMOUS-WRONG-1').choices }),
    verifier_results: [await verifyOn('UNANIMOUS-WRONG-1', '9')], policy_version: 'p1',
  });
  t.is('N=1 against a verifier is still one dispute', e1.disputes.length, 1);
  t.is('  naming the single engine', e1.disputes[0].model_side.flatMap((m) => m.engines), ['engine_alpha']);
  t.is('  and it is no more resolved than the unanimous case', e1.disputes[0].resolution, null);
}

// ───────────────────────────────────────────────────────────────────────────
t.section('W7. Deterministic and permutation-invariant');
{
  const ev = evidenceFor('UNANIMOUS-WRONG-1');
  const vr = [await verifyOn('UNANIMOUS-WRONG-1', '9')];
  const a = JSON.stringify(createVerdictEnvelope({ model_evidence: ev, verifier_results: vr, policy_version: 'p1' }));
  const b = JSON.stringify(createVerdictEnvelope({ model_evidence: ev, verifier_results: vr, policy_version: 'p1' }));
  t.is('two constructions agree byte for byte', a, b);

  const reversed = subs('UNANIMOUS-WRONG-1').reverse();
  const c = JSON.stringify(createVerdictEnvelope({
    model_evidence: buildEvidence(reversed, { choices: item('UNANIMOUS-WRONG-1').choices }),
    verifier_results: vr, policy_version: 'p1',
  }));
  t.is('reversing submission order changes nothing', a, c);

  // Two verifiers contradicting the same candidate sort deterministically, so
  // no verifier becomes implicitly authoritative by being passed first.
  const V2 = createTableVerifier({ verifier_id: 'aaa-stub', version: 'v9', method: 'other' },
    [{ item_id: 'UNANIMOUS-WRONG-1', candidate: '9', outcome: 'contradicted', evidence: { by: 'aaa' } }],
    { supported_items: ['UNANIMOUS-WRONG-1'] });
  const other = await V2.verify({
    subject: { item_id: 'UNANIMOUS-WRONG-1', question_text: item('UNANIMOUS-WRONG-1').question_text, choices: item('UNANIMOUS-WRONG-1').choices, interpretation: null, interpretation_version: null },
    candidate: '9', candidate_source: 'model_agreement', policy_version: 'p1',
  });
  const fwd = createVerdictEnvelope({ model_evidence: ev, verifier_results: [vr[0], other], policy_version: 'p1' });
  const rev = createVerdictEnvelope({ model_evidence: ev, verifier_results: [other, vr[0]], policy_version: 'p1' });
  t.is('verifier order does not change the disputes', JSON.stringify(fwd.disputes), JSON.stringify(rev.disputes));
  t.is('both verifiers appear on the verifier side', fwd.disputes[0].verifier_side.length, 2);
  t.is('  sorted by identity, not by arrival', fwd.disputes[0].verifier_side.map((v) => v.verifier_id), ['aaa-stub', 'table-stub']);

  t.ok('no clock', !/Date\.now|new Date|performance\.now/.test(CODE), CODE.slice(0, 200));
  t.ok('no randomness', !/Math\.random|randomUUID/.test(CODE), CODE.slice(0, 200));
  t.ok('no I/O', !/fetch\(|Deno\.(?:readFile|writeFile|run|Command)|process\.env|Deno\.env/.test(CODE), CODE.slice(0, 200));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('W8. Totality and input hygiene');
{
  let threw = null;
  const outs = [];
  for (const bad of [undefined, null, {}, { model_evidence: null, verifier_results: null }, { model_evidence: 'x', verifier_results: 7 }]) {
    try { outs.push(createVerdictEnvelope(bad)); } catch (e) { threw = String(e); break; }
  }
  t.is('nothing throws', threw, null);
  t.is('every malformed input still yields an envelope', outs.length, 5);
  t.ok('all of them stateless', outs.every((e) => e.state === null));
  t.ok('and none invents a dispute', outs.every((e) => Array.isArray(e.disputes) && e.disputes.length === 0));

  // The envelope does not alias its inputs — a later phase mutating what it
  // passed in cannot retroactively edit recorded evidence.
  const ev = evidenceFor('Q79');
  const e = createVerdictEnvelope({ model_evidence: ev, verifier_results: [], policy_version: 'p1' });
  const before = JSON.stringify(e.model_evidence);
  ev.push({ type: 'ENGINE_OBSERVATION', engines: ['ghost'], fields: [], observed: null, basis: 'injected' });
  t.is('mutating the caller array does not change the envelope', JSON.stringify(e.model_evidence), before);
}

// ───────────────────────────────────────────────────────────────────────────
t.section('W9. Layering — offline, and the dependency runs one way only');
{
  const INDEX = read('supabase/functions/ai-tutor/index.ts');
  const VC = read('supabase/functions/_shared/verification.core.ts');
  const TC = read('supabase/functions/_shared/telemetry.core.ts');
  t.ok('index.ts does not import the verdict contract', !/verdict-state/.test(INDEX));
  t.ok('verification.core.ts does not either', !/verdict-state/.test(VC));
  t.ok('telemetry.core.ts does not either', !/verdict-state/.test(TC));

  const imports = CODE.match(/^\s*import\s[^\n]*/gm) ?? [];
  t.ok('every import targets the pilot',
    imports.every((l) => /evidence-builder\.core\.ts|deterministic-verifier\.core\.ts/.test(l)), imports.join('\n'));
  t.ok('the cache-key module is not imported here', !/verification-cache-key/.test(CODE), CODE.slice(0, 200));
  t.ok('and verification.core.ts never is', !/verification\.core/.test(CODE), CODE.slice(0, 200));

  // The one-way edge that makes "a verifier cannot assign a verdict" structural.
  // Scanned with comments stripped: that module's header names this file in
  // prose to explain the boundary, and a raw scan would read the explanation of
  // the rule as a violation of it.
  const VERIFIER = read('supabase/functions/_shared/deterministic-verifier.core.ts')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/(^|[^:\\])\/\/.*$/, '$1')).join('\n');
  t.ok('the verifier module does not reference the verdict vocabulary in code', !/verdict-state/.test(VERIFIER));
  t.ok('  and has no import statement at all', (VERIFIER.match(/^\s*import\s[^\n]*/gm) ?? []).length === 0);
  t.ok('  (anti-vacuity: the stripped verifier source is still real code)',
    VERIFIER.length > 2000 && /export function buildVerificationResult/.test(VERIFIER), String(VERIFIER.length));

  t.ok('the scanned source is substantial', CODE.length > 1500, String(CODE.length));
  t.ok('and still contains the code under test',
    /export function createVerdictEnvelope/.test(CODE) && /export function withVerdictState/.test(CODE));
}

t.done();
