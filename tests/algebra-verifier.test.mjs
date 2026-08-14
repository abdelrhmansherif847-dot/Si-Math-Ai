// Verdict Pilot P5 — the first REAL deterministic mathematics in the pilot.
//
// P1–P4 built contracts. P5 performs one narrow piece of actual verification:
// substituting a rational candidate into a linear equation in one variable and
// comparing both sides in exact arithmetic.
//
// AND IT IS STILL ONLY EVIDENCE. A `verified` here means one deterministic check
// succeeded. It is not a verdict, not truth, and not authority over the models.
//
// WHAT "NARROW" MEANS, PRECISELY
// ──────────────────────────────
// The problem arrives STRUCTURED, through P4's subject.interpretation. P5 never
// reads question_text for mathematics: deciding what a question means is a
// different problem, it is the one this product actually gets wrong, and giving
// a verifier a guess to check would launder that guess into a deterministic
// result.
//
// Supported: one `=`, the grammar { + - * / ( ) digits . single-letter vars },
// implicit multiplication, exactly one variable matching the declared one,
// degree <= 1, variable never in a denominator, candidate a rational.
// EVERYTHING ELSE IS EXPLICITLY UNSUPPORTED WITH A REASON — never contradicted
// merely because the pilot cannot handle it, and never quietly verified.
//
// THE DEGENERATE CASES, AND WHY THEY ARE INCONCLUSIVE
// ───────────────────────────────────────────────────
// After normalization the equation is A·x = B.
//
//   A != 0   well posed. verified / contradicted are decisive.
//   A = 0, B = 0   an identity: 2x+3 = 2x+3. Substitution succeeds for EVERY
//                  value, so success proves nothing about this candidate.
//   A = 0, B != 0  no solution: 2x+3 = 2x+5. Substitution fails for every value,
//                  so `contradicted` would blame the candidate for what is
//                  almost certainly a misread or OCR-damaged equation.
//
// Both degenerate cases are inconclusive, with the fact in the evidence. Never a
// decisive result the mathematics does not support.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('algebra-verifier');

const P5 = '/home/user/Si-Math-Ai/supabase/functions/_shared/algebra-verifier.core.ts';
const P4 = '/home/user/Si-Math-Ai/supabase/functions/_shared/deterministic-verifier.core.ts';
const { createAlgebraVerifier, ALGEBRA_VERIFIER_IDENTITY, SUPPORTED_INTERPRETATION_TYPE, ALGEBRA_REASONS } = await import(P5);
const { VERIFIER_OUTCOMES } = await import(P4);

const SRC = read('supabase/functions/_shared/algebra-verifier.core.ts');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|[^:\\])\/\/.*$/, '$1')).join('\n');

const V = createAlgebraVerifier();
const ask = (equation, candidate, over) => V.verify({
  subject: {
    item_id: (over && over.item_id) ?? 'ALG-1',
    question_text: (over && over.question_text) ?? 'Solve for x.',
    choices: (over && over.choices) ?? null,
    // `'variable' in over` rather than `?? 'x'`: the suite needs to express "no
    // variable was declared" so the inference path can be tested, and a nullish
    // default would silently fill it back in.
    interpretation: (over && 'interpretation' in over)
      ? over.interpretation
      : { type: SUPPORTED_INTERPRETATION_TYPE, equation, variable: (over && 'variable' in over) ? over.variable : 'x' },
    interpretation_version: (over && over.interpretation_version) ?? 'alg-i1',
  },
  candidate,
  candidate_source: (over && over.candidate_source) ?? 'engine_alpha',
  policy_version: 'p1',
});

// ───────────────────────────────────────────────────────────────────────────
t.section('A1. A correct candidate is verified, with the exact check recorded');
{
  const r = await ask('3x + 7 = 22', '5');
  t.is('supported', r.support, 'supported');
  t.is('verified', r.outcome, 'verified');
  t.is('no excuse needed', r.reason, null);

  t.is('both sides evaluated exactly, and they match',
    r.evidence.substitution, { lhs: '22', rhs: '22', equal: true });
  t.is('the equation was reduced to A·x = B exactly',
    r.evidence.linear_form, { coefficient: '3', constant: '15', unique_solution: '5' });
  t.is('the normalized candidate is recorded', r.evidence.candidate_normalized, '5');
  t.is('as an exact rational, not a float', r.evidence.candidate_exact, { n: '5', d: '1' });
  t.is('and the check performed is named',
    r.evidence.check, 'substituted_candidate_into_both_sides_and_compared_exact_rationals');
  t.is('with the equation it was performed on', r.evidence.equation_canonical, '3x + 7 = 22');
  t.is('and the variable it solved for', r.evidence.variable, 'x');
  t.is('and the interpretation version it trusted', r.evidence.interpretation_version, 'alg-i1');

  t.ok('nothing in the evidence is a float',
    !/\d\.\d/.test(JSON.stringify(r.evidence).replace(/"[^"]*equation_canonical[^"]*"/, '')),
    JSON.stringify(r.evidence));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('A2. A wrong candidate is contradicted, and the arithmetic is shown');
{
  const r = await ask('3x + 7 = 22', '4');
  t.is('contradicted', r.outcome, 'contradicted');
  t.is('the sides genuinely differ', r.evidence.substitution, { lhs: '19', rhs: '22', equal: false });
  t.is('and the equation still has its unique solution recorded',
    r.evidence.linear_form.unique_solution, '5');
  t.is('support was never in doubt', r.support, 'supported');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('A3. "5", "x = 5" and "5 = x" are one candidate');
{
  const plain = await ask('3x + 7 = 22', '5');
  const assigned = await ask('3x + 7 = 22', 'x = 5');
  const reversed = await ask('3x + 7 = 22', '5 = x');
  for (const [label, r] of [['x = 5', assigned], ['5 = x', reversed]]) {
    t.is(`${label} is verified`, r.outcome, 'verified');
    t.is(`${label} normalizes to the same value`, r.evidence.candidate_normalized, '5');
    t.is(`${label} produces identical evidence`, JSON.stringify(r.evidence), JSON.stringify(plain.evidence));
  }
  t.is('but the candidate as GIVEN is preserved verbatim', assigned.candidate, 'x = 5');

  const mismatch = await ask('3x + 7 = 22', 'y = 5');
  t.is('a different variable is not silently accepted', mismatch.support, 'unsupported');
  t.is('  and says so', mismatch.reason, 'candidate_variable_mismatch');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('A4. Whitespace is presentation, not mathematics');
{
  const tight = await ask('3x+7=22', '5');
  const loose = await ask('   3 x   +   7   =   22   ', '  5  ');
  t.is('both verify', `${tight.outcome}/${loose.outcome}`, 'verified/verified');
  t.is('and reach the same numbers',
    JSON.stringify(loose.evidence.substitution), JSON.stringify(tight.evidence.substitution));
  t.is('the canonical equation collapses the spacing', loose.evidence.equation_canonical, '3 x + 7 = 22');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('B. Mathematics the pilot genuinely does');
{
  const neg = await ask('2x + 10 = 4', '-3');
  t.is('a negative solution verifies', neg.outcome, 'verified');
  t.is('  with exact values', neg.evidence.substitution, { lhs: '4', rhs: '4', equal: true });

  const half = await ask('2x = 5', '2.5');
  t.is('a decimal candidate verifies', half.outcome, 'verified');
  t.is('  held exactly as a fraction, never as 2.5', half.evidence.candidate_exact, { n: '5', d: '2' });
  const frac = await ask('2x = 5', '5/2');
  t.is('and 5/2 is the same candidate', frac.evidence.candidate_normalized, half.evidence.candidate_normalized);
  t.is('  reaching identical evidence', JSON.stringify(frac.evidence), JSON.stringify(half.evidence));

  // Exactness must be PINNED, not merely relative. Every assertion above
  // compares two results that would move together if the renderer started
  // emitting floats — so 2.5 could quietly replace 5/2 in the record and the
  // suite would stay green. These pin all three places a rational is rendered.
  t.is('2.5 is recorded as the fraction 5/2, never as 2.5', half.evidence.candidate_normalized, '5/2');
  const thirds = await ask('3x = 5', '5/3');
  t.is('a fractional solution is rendered exactly', thirds.evidence.linear_form.unique_solution, '5/3');
  t.is('  as is the candidate', thirds.evidence.candidate_normalized, '5/3');
  const partial = await ask('3x = 1', '1/2');
  t.is('and a fractional substitution value too',
    partial.evidence.substitution, { lhs: '3/2', rhs: '1', equal: false });
  for (const [label, r] of [['5/2', half], ['5/3', thirds], ['3/2', partial]]) {
    t.ok(`no decimal point appears anywhere in the ${label} evidence`,
      !/\d\.\d/.test(JSON.stringify(r.evidence)), JSON.stringify(r.evidence));
  }

  const paren = await ask('2(x + 3) = 4x - 2', '4');
  t.is('parentheses and implicit multiplication verify', paren.outcome, 'verified');
  t.is('  reduced correctly', paren.evidence.linear_form, { coefficient: '-2', constant: '-8', unique_solution: '4' });
  t.is('and a wrong candidate on the same equation is contradicted',
    (await ask('2(x + 3) = 4x - 2', '3')).outcome, 'contradicted');

  const div = await ask('x/2 + 1 = 4', '6');
  t.is('division by a constant verifies', div.outcome, 'verified');

  const rhsVar = await ask('22 = 3x + 7', '5');
  t.is('the variable may sit on either side', rhsVar.outcome, 'verified');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('B. Degenerate equations are inconclusive, never decisive');
{
  const identity = await ask('2x + 3 = 2x + 3', '5');
  t.is('an identity does not verify a candidate', identity.outcome, 'inconclusive');
  t.is('  and says why', identity.reason, 'equation_is_an_identity');
  t.is('  recording that every value satisfies it', identity.evidence.linear_form,
    { coefficient: '0', constant: '0', unique_solution: null });
  t.ok('  the substitution itself is still reported',
    identity.evidence.substitution.equal === true, JSON.stringify(identity.evidence.substitution));

  const none = await ask('2x + 3 = 2x + 5', '5');
  t.is('an unsatisfiable equation does not contradict the candidate', none.outcome, 'inconclusive');
  t.is('  and says why', none.reason, 'equation_has_no_solution');
  t.is('  recording that no value satisfies it', none.evidence.linear_form,
    { coefficient: '0', constant: '2', unique_solution: null });
}

// ───────────────────────────────────────────────────────────────────────────
t.section('B. Everything outside the subset is explicitly unsupported');
{
  const cases = [
    ['quadratic via ^',            'x^2 = 4',        '2', 'unsupported_operator'],
    ['quadratic via x*x',          'x*x = 4',        '2', 'nonlinear_not_supported'],
    ['quadratic via x(x+1)',       'x(x + 1) = 6',   '2', 'nonlinear_not_supported'],
    ['two variables',              'x + y = 5',      '2', 'multiple_variables'],
    ['an inequality',              '3x + 7 < 22',    '5', 'unsupported_relation'],
    ['no equals sign',             '3x + 7',         '5', 'missing_equals'],
    ['two equals signs',           '1 = 2 = 3',      '1', 'multiple_equals'],
    ['a malformed equation',       '3x + = 22',      '5', 'parse_error'],
    ['an empty side',              '= 22',           '5', 'parse_error'],
    ['the variable in a denominator', '3/x = 1',     '3', 'variable_in_denominator'],
    ['division by zero',           'x/0 = 1',        '1', 'division_by_zero_in_equation'],
    ['no variable at all',         '2 + 2 = 4',      '4', 'no_variable_in_equation'],
    ['the declared variable absent', '3x + 7 = 22',  '5', 'designated_variable_absent'],
    ['a candidate that is not a value', '3x + 7 = 22', 'x + 1', 'unsupported_candidate_form'],
    ['a choice letter as candidate', '3x + 7 = 22',  'C',  'unsupported_candidate_form'],
  ];
  for (const [label, equation, candidate, reason] of cases) {
    const over = label === 'the declared variable absent' ? { variable: 'y' } : undefined;
    const r = await ask(equation, candidate, over);
    t.is(`${label}: unsupported`, r.support, 'unsupported');
    t.is(`${label}: outcome not_attempted`, r.outcome, 'not_attempted');
    t.is(`${label}: reason ${reason}`, r.reason, reason);
    t.is(`${label}: no evidence invented`, r.evidence, null);
  }

  t.ok('every reason the module can emit is declared',
    Array.isArray(ALGEBRA_REASONS) && ALGEBRA_REASONS.length > 10, String(ALGEBRA_REASONS && ALGEBRA_REASONS.length));
  for (const [, equation, candidate, reason] of cases) {
    t.ok(`declared: ${reason}`, ALGEBRA_REASONS.includes(reason), reason);
    void equation; void candidate;
  }
}

// ───────────────────────────────────────────────────────────────────────────
t.section('D. The result conforms to the P4 contract');
{
  const r = await ask('3x + 7 = 22', '5');
  t.is('the P4 result shape, unchanged', Object.keys(r).sort(),
    ['candidate', 'candidate_source', 'evidence', 'method', 'outcome', 'policy_version',
      'reason', 'subject', 'support', 'verifier'].sort());
  t.ok('the outcome is from the P4 vocabulary', VERIFIER_OUTCOMES.includes(r.outcome), r.outcome);

  t.is('verifier identity', r.verifier.verifier_id, 'algebra-linear-substitution');
  t.is('verifier version', r.verifier.version, 'v1');
  t.is('declared method', r.verifier.method, 'exact_rational_substitution');
  t.is('and the method actually used', r.method, 'exact_rational_substitution');
  t.is('the exported identity matches what it reports',
    JSON.stringify(V.identity), JSON.stringify(ALGEBRA_VERIFIER_IDENTITY));

  t.is('the candidate checked', r.candidate, '5');
  t.is('where it came from', r.candidate_source, 'engine_alpha');
  t.is('the policy in force', r.policy_version, 'p1');
  t.is('the item', r.subject.item_id, 'ALG-1');
  t.is('and that a structured interpretation was present', r.subject.interpretation_present, true);
  t.is('with its version', r.subject.interpretation_version, 'alg-i1');

  // Provenance survives the paths where no mathematics happened.
  const un = await ask('x^2 = 4', '2');
  t.is('identity preserved when unsupported', un.verifier.version, 'v1');
  t.is('method preserved when unsupported', un.method, 'exact_rational_substitution');
  t.is('candidate preserved when unsupported', un.candidate, '2');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('D. Insufficient information is explicit, and is not a failure of the candidate');
{
  const noCandidate = await ask('3x + 7 = 22', null);
  t.is('no candidate', noCandidate.outcome, 'insufficient_information');
  t.ok('  says so', /candidate/.test(String(noCandidate.reason)), String(noCandidate.reason));

  const noEquation = await ask(null, '5', { interpretation: { type: SUPPORTED_INTERPRETATION_TYPE, variable: 'x' } });
  t.is('no equation', noEquation.outcome, 'insufficient_information');
  t.is('  says so', noEquation.reason, 'no_equation_supplied');

  const noInterp = await ask(null, '5', { interpretation: null });
  t.is('no structured problem is UNSUPPORTED, not a math failure', noInterp.support, 'unsupported');
  t.is('  says so', noInterp.reason, 'no_structured_algebra_interpretation');

  const wrongType = await ask(null, '5', { interpretation: { type: 'geometry_angle_chase', equation: '3x = 6' } });
  t.is('an interpretation type it does not handle is unsupported', wrongType.support, 'unsupported');
  t.is('  says so', wrongType.reason, 'unsupported_interpretation_type');

  // The variable may be inferred when exactly one appears, but never guessed
  // when the equation is ambiguous.
  const inferred = await ask('3n + 7 = 22', '5', { variable: null });
  t.is('a single variable is inferred', inferred.outcome, 'verified');
  t.is('  and recorded', inferred.evidence.variable, 'n');
  const ambiguous = await ask('a + b = 5', '2', { variable: null });
  t.is('two variables are never guessed between', ambiguous.reason, 'multiple_variables');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('D. Nothing outside the subset can become verified');
{
  const outside = [
    ['x^2 = 4', '2'], ['x*x = 4', '2'], ['x + y = 5', '2'], ['3x + 7 < 22', '5'],
    ['3x + 7', '5'], ['1 = 2 = 3', '1'], ['3x + = 22', '5'], ['3/x = 1', '3'],
    ['2 + 2 = 4', '4'], ['3x + 7 = 22', 'C'], ['2x + 3 = 2x + 3', '5'], ['2x + 3 = 2x + 5', '5'],
    ['sqrt(x) = 2', '4'], ['log(x) = 2', '100'], ['|x| = 3', '3'],
  ];
  for (const [eq, cand] of outside) {
    const r = await ask(eq, cand);
    t.ok(`${eq} is never verified`, r.outcome !== 'verified', `${r.outcome}/${r.reason}`);
    t.ok(`${eq} is never contradicted merely for being unsupported`,
      r.outcome !== 'contradicted', `${r.outcome}/${r.reason}`);
    t.ok(`${eq} always states a reason`,
      typeof r.reason === 'string' && r.reason.length > 0, String(r.reason));
  }
}

// ───────────────────────────────────────────────────────────────────────────
t.section('F. Deterministic, stateless, and blind to the models');
{
  const a = JSON.stringify(await ask('3x + 7 = 22', '5'));
  const b = JSON.stringify(await ask('3x + 7 = 22', '5'));
  t.is('two runs are byte-identical', a, b);
  const fresh = JSON.stringify(await createAlgebraVerifier().verify({
    subject: { item_id: 'ALG-1', question_text: 'Solve for x.', choices: null,
      interpretation: { type: SUPPORTED_INTERPRETATION_TYPE, equation: '3x + 7 = 22', variable: 'x' },
      interpretation_version: 'alg-i1' },
    candidate: '5', candidate_source: 'engine_alpha', policy_version: 'p1',
  }));
  t.is('a freshly constructed verifier agrees', a, fresh);

  // Stateless: checking a wrong candidate first cannot change the next answer.
  await ask('3x + 7 = 22', '4');
  await ask('9x = 81', '9');
  t.is('order of prior checks changes nothing', JSON.stringify(await ask('3x + 7 = 22', '5')), a);

  // There is no model input at all, so model ordering cannot reach the result.
  const withModels = await V.verify({
    subject: { item_id: 'ALG-1', question_text: 'Solve for x.', choices: null,
      interpretation: { type: SUPPORTED_INTERPRETATION_TYPE, equation: '3x + 7 = 22', variable: 'x' },
      interpretation_version: 'alg-i1' },
    candidate: '5', candidate_source: 'engine_alpha', policy_version: 'p1',
    peer_outputs: [{ engine: 'a', answer: '9' }, { engine: 'b', answer: '9' }],
    engine_count: 3, submission_order: ['b', 'a'],
  });
  t.is('peer outputs and counts are not read', JSON.stringify(withModels), a);
  t.ok('the module names no model input', !/peer|engine_?count|submission|agreement|majority/i.test(CODE), CODE.slice(0, 200));

  t.ok('no clock', !/Date\.now|new Date|performance\.now/.test(CODE), CODE.slice(0, 200));
  t.ok('no randomness', !/Math\.random|randomUUID/.test(CODE), CODE.slice(0, 200));
  t.ok('no floating point arithmetic on values', !/parseFloat|Number\.parseFloat|Math\.round/.test(CODE), CODE.slice(0, 200));

  // The mathematics must not read the prose. A different question_text with the
  // same interpretation is the same verification.
  const otherProse = await ask('3x + 7 = 22', '5', { question_text: 'Completely different wording entirely.' });
  t.is('question_text does not reach the mathematics',
    JSON.stringify(otherProse.evidence), JSON.stringify((await ask('3x + 7 = 22', '5')).evidence));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('F. Total, and offline');
{
  let threw = null;
  const outs = [];
  for (const bad of [null, undefined, {}, { subject: null, candidate: null }, { subject: { interpretation: 7 }, candidate: {} }]) {
    try { outs.push(await V.verify(bad)); } catch (e) { threw = String(e); break; }
  }
  t.is('nothing throws', threw, null);
  t.is('every malformed request yields a result', outs.length, 5);
  t.ok('and none is verified', outs.every((o) => o.outcome !== 'verified'), JSON.stringify(outs.map((o) => o.outcome)));

  const INDEX = read('supabase/functions/ai-tutor/index.ts');
  const VC = read('supabase/functions/_shared/verification.core.ts');
  const TC = read('supabase/functions/_shared/telemetry.core.ts');
  t.ok('index.ts does not import the algebra verifier', !/algebra-verifier/.test(INDEX));
  t.ok('verification.core.ts does not either', !/algebra-verifier/.test(VC));
  t.ok('telemetry.core.ts does not either', !/algebra-verifier/.test(TC));
  // Specifiers, not raw lines: a multi-line `import type { … } from '…'` is
  // invisible to a line-anchored scan, which would let an import slip past a
  // check that reports green. Match through to the module string instead.
  const imports = [...CODE.matchAll(/^[ \t]*import\b[\s\S]*?from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  t.is('it imports exactly the P4 contract, twice — types and functions',
    imports, ['./deterministic-verifier.core.ts', './deterministic-verifier.core.ts']);
  t.ok('and never the verdict vocabulary', !/verdict-state|\bVERIFIED\b|HIGH_CONFIDENCE/.test(CODE), CODE.slice(0, 200));

  t.ok('the scanned source is substantial', CODE.length > 3000, String(CODE.length));
  t.ok('and still contains the code under test',
    /export function createAlgebraVerifier/.test(CODE) && /ALGEBRA_VERIFIER_IDENTITY/.test(CODE));
}

t.done();
