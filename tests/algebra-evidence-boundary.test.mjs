// Verdict Pilot P5 — the evidence boundary, with real mathematics behind it.
//
// This is the scenario the whole pilot has been building toward:
//
//     THREE MODELS AGREE THE ANSWER IS 9
//     A DETERMINISTIC VERIFIER PROVES 3(9) + 7 = 34, NOT 22
//
// Until now that conflict was representable with a stub. Here one side is an
// actual exact-arithmetic result, and the requirement is unchanged: BOTH pieces
// of evidence survive, and NEITHER wins.
//
// P5 does not get to declare the models wrong because it did some real
// mathematics, and the models do not get to outvote it because there are three
// of them. A verifier can be checking a misread equation; three models can share
// one misconception. Deciding between them needs sufficiency, routing and
// authority that no phase has yet, and inventing it here would make every later
// phase inherit a decision nobody wrote down.
//
// So: no VERIFIED, no winner, no confidence, no vote. Evidence only.
//
// The submissions here are hand-built rather than taken from the P3 fixture:
// that fixture's UNANIMOUS-WRONG-1 is an absolute-value inequality, which this
// pilot genuinely does not support, and pairing it with an unrelated equation
// would be dressing up a stub as a real check.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('algebra-evidence-boundary');

const P5 = '/home/user/Si-Math-Ai/supabase/functions/_shared/algebra-verifier.core.ts';
const P4S = '/home/user/Si-Math-Ai/supabase/functions/_shared/verdict-state.core.ts';
const P2 = '/home/user/Si-Math-Ai/supabase/functions/_shared/evidence-builder.core.ts';
const P1 = '/home/user/Si-Math-Ai/supabase/functions/_shared/evidence.core.ts';

const { createAlgebraVerifier, SUPPORTED_INTERPRETATION_TYPE } = await import(P5);
const { createVerdictEnvelope, VERDICT_STATES } = await import(P4S);
const { buildEvidence } = await import(P2);
const { normalizeSolverOutput } = await import(P1);

const V = createAlgebraVerifier();
const EQUATION = '3x + 7 = 22';          // the unique solution is 5
const SUBJECT = {
  item_id: 'ALG-BOUNDARY-1',
  question_text: 'Solve 3x + 7 = 22 for x.',
  choices: null,
  interpretation: { type: SUPPORTED_INTERPRETATION_TYPE, equation: EQUATION, variable: 'x' },
  interpretation_version: 'alg-i1',
};

// Three independent models, all publishing the same wrong answer.
const SAID_NINE = ['engine_alpha', 'engine_beta', 'engine_gamma'].map((id) => ({
  engine_id: id,
  output: normalizeSolverOutput({
    provider: 'p', model: 'm',
    text: `I moved the 7 across and divided.\n\nFinal Answer: 9`,
  }, { question_text: SUBJECT.question_text, choices: null }),
}));

const check = (candidate) => V.verify({
  subject: SUBJECT, candidate, candidate_source: 'model_agreement', policy_version: 'p1',
});

// ───────────────────────────────────────────────────────────────────────────
t.section('E24. Unanimous models and a deterministic contradiction coexist');
{
  const modelEvidence = buildEvidence(SAID_NINE, { choices: null });
  const agreement = modelEvidence.find((r) => r.type === 'RAW_ANSWER_AGREEMENT');
  t.ok('the models genuinely agree', !!agreement, JSON.stringify(modelEvidence.map((r) => r.type)));
  t.is('  on 9', agreement.observed, '9');
  t.is('  all three of them', agreement.engines, ['engine_alpha', 'engine_beta', 'engine_gamma']);

  const verdict = await check('9');
  t.is('the verifier contradicts them', verdict.outcome, 'contradicted');
  t.is('  with real arithmetic, not an assertion',
    verdict.evidence.substitution, { lhs: '34', rhs: '22', equal: false });
  t.is('  and the solution it did find', verdict.evidence.linear_form.unique_solution, '5');

  const envelope = createVerdictEnvelope({
    model_evidence: modelEvidence, verifier_results: [verdict], policy_version: 'p1',
  });

  t.is('one dispute is recorded', envelope.disputes.length, 1);
  const d = envelope.disputes[0];
  t.is('about the candidate they agreed on', d.candidate, '9');
  t.is('the verifier side is present', d.verifier_side.length, 1);
  t.is('  named', d.verifier_side[0].verifier_id, 'algebra-linear-substitution');
  t.is('  versioned', d.verifier_side[0].version, 'v1');
  t.is('  with its method', d.verifier_side[0].method, 'exact_rational_substitution');
  t.is('  and its mathematics carried through intact',
    d.verifier_side[0].evidence.substitution, { lhs: '34', rhs: '22', equal: false });

  const engines = [...new Set(d.model_side.flatMap((m) => m.engines))].sort();
  t.is('the model side names all three', engines, ['engine_alpha', 'engine_beta', 'engine_gamma']);
  t.is('  and the value they said', d.model_side[0].value, '9');
  t.ok('the models’ own evidence is preserved in full',
    envelope.model_evidence.length === modelEvidence.length, String(envelope.model_evidence.length));
  t.ok('and the verifier result is preserved in full',
    JSON.stringify(envelope.verifier_results[0]) === JSON.stringify(verdict));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('E25/E26/E27. Neither side wins, no state, no confidence');
{
  const envelope = createVerdictEnvelope({
    model_evidence: buildEvidence(SAID_NINE, { choices: null }),
    verifier_results: [await check('9')], policy_version: 'p1',
  });
  const json = JSON.stringify(envelope);

  t.is('the dispute is unresolved', envelope.disputes[0].resolution, null);
  t.is('and nobody resolved it', envelope.disputes[0].resolved_by, null);
  t.ok('no winner is named anywhere',
    !/winner|wins|prevail|authoritative|override|trump|defeat/i.test(json), json.slice(0, 200));
  t.ok('the verifier is not marked as truth',
    !/is_correct|correct_answer|"truth"|ground_truth/i.test(json), json.slice(0, 200));

  t.is('no verdict state is assigned', envelope.state, null);
  t.is('  by anyone', envelope.state_assigned_by, null);
  t.ok('  and none of the six states appears',
    !VERDICT_STATES.some((s) => json.includes(s)), VERDICT_STATES.join(','));

  t.ok('no confidence is calculated',
    !/confidence|probability|likelihood|certainty|"weight"/i.test(json), json.slice(0, 200));
  t.ok('no vote is counted',
    !/majority|vote|voting|consensus|quorum|tally/i.test(json), json.slice(0, 200));
  t.ok('and no engine count becomes a signal',
    !/engine_count|n_engines|sufficiency|\bscore\b/i.test(json), json.slice(0, 200));

  // A deterministic success is equally not a verdict.
  const right = createVerdictEnvelope({
    model_evidence: buildEvidence(SAID_NINE, { choices: null }),
    verifier_results: [await check('5')], policy_version: 'p1',
  });
  t.is('proving 5 is the unique solution assigns no verdict', right.state, null);
  t.is('  and the verifier result is still just evidence', right.verifier_results[0].outcome, 'verified');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('E. The dispute is observed, never inferred — even with a proof in hand');
{
  // The verifier proved x = 5 is the unique solution while the models said 9.
  // P4 still records NO dispute, because the verifier never contradicted 9 — it
  // was only asked about 5. That is deliberate: "verified X therefore Y is
  // wrong" is an inference, and X and Y can be two renderings of one answer.
  // The consequence for a future router is concrete and worth stating: TO SEE
  // THE CONFLICT IT MUST ASK THE VERIFIER ABOUT THE MODELS' CANDIDATE, not only
  // about its own.
  const onlyFive = createVerdictEnvelope({
    model_evidence: buildEvidence(SAID_NINE, { choices: null }),
    verifier_results: [await check('5')], policy_version: 'p1',
  });
  t.is('no dispute is inferred from a proof about a different candidate', onlyFive.disputes, []);
  t.is('but the proof itself is preserved', onlyFive.verifier_results[0].evidence.linear_form.unique_solution, '5');

  // Asking about both is what surfaces it, and that is a router decision.
  const both = createVerdictEnvelope({
    model_evidence: buildEvidence(SAID_NINE, { choices: null }),
    verifier_results: [await check('5'), await check('9')], policy_version: 'p1',
  });
  t.is('asking about the models’ candidate surfaces the dispute', both.disputes.length, 1);
  t.is('  and both verifier results are kept', both.verifier_results.length, 2);
}

// ───────────────────────────────────────────────────────────────────────────
t.section('E. Model ordering cannot reach the mathematics or the envelope');
{
  const fwd = createVerdictEnvelope({
    model_evidence: buildEvidence(SAID_NINE, { choices: null }),
    verifier_results: [await check('9')], policy_version: 'p1',
  });
  const rev = createVerdictEnvelope({
    model_evidence: buildEvidence(SAID_NINE.slice().reverse(), { choices: null }),
    verifier_results: [await check('9')], policy_version: 'p1',
  });
  t.is('reversing the submissions changes nothing', JSON.stringify(fwd), JSON.stringify(rev));

  // N is not a parameter of the mathematics. One model or five, 3(9)+7 is 34.
  const one = buildEvidence(SAID_NINE.slice(0, 1), { choices: null });
  const solo = createVerdictEnvelope({ model_evidence: one, verifier_results: [await check('9')], policy_version: 'p1' });
  t.is('N=1 still produces a dispute', solo.disputes.length, 1);
  t.is('  with the same arithmetic',
    JSON.stringify(solo.disputes[0].verifier_side), JSON.stringify(fwd.disputes[0].verifier_side));
  t.is('  and it is no more resolved than the unanimous case', solo.disputes[0].resolution, null);

  const none = createVerdictEnvelope({ model_evidence: [], verifier_results: [await check('9')], policy_version: 'p1' });
  t.is('N=0 records the verifier result', none.verifier_results.length, 1);
  t.is('  and no dispute, because nobody claimed 9', none.disputes, []);
  t.is('  and still no verdict', none.state, null);
}

// ───────────────────────────────────────────────────────────────────────────
t.section('E. Offline — the boundary is not reachable from production');
{
  const INDEX = read('supabase/functions/ai-tutor/index.ts');
  const VC = read('supabase/functions/_shared/verification.core.ts');
  const TC = read('supabase/functions/_shared/telemetry.core.ts');
  for (const [label, src] of [['index.ts', INDEX], ['verification.core.ts', VC], ['telemetry.core.ts', TC]]) {
    t.ok(`${label} imports no pilot module`,
      !/algebra-verifier|deterministic-verifier|verdict-state|verification-cache-key|evidence(-builder)?\.core|disagreement\.core/.test(src));
  }
}

t.done();
