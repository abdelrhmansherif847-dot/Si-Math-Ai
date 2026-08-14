// Verdict Pilot P3 — correlated-error metrics.
//
// The preliminary sheet showed several questions where every model disagreed
// with the key together. That pattern is the reason multi-model architecture is
// not automatically more reliable: correlated errors are exactly what a majority
// vote promotes to truth. These metrics exist to MEASURE that overlap.
//
// THE TWO RULES THAT KEEP THE METRICS HONEST
// ──────────────────────────────────────────
//   AGREEMENT IS NOT CORRECTNESS. Engines agreeing tells you they agree. It
//   tells you nothing about whether they are right, so agreement metrics never
//   produce an error count.
//
//   AN ERROR REQUIRES AN INDEPENDENT REFERENCE. "Wrong" is undefined without a
//   separately verified answer. Items with no reference contribute to agreement
//   statistics and are EXCLUDED from every error statistic — not treated as
//   correct, not treated as incorrect, just not counted.
//
// UNDEFINED IS REPORTED, NOT INVENTED. A correlation with no paired items, or
// with a degenerate margin (one engine never wrong in the sample), is null with
// a stated reason. Returning 0 there would read as "uncorrelated", which is a
// claim the data does not support.
//
// The reference answers below are TEST INPUTS supplied to exercise the metric
// mechanism — a stand-in for a future independent verifier. They are not an
// answer key, they are not in the fixture, and no benchmark score (94/106,
// 96/106) is encoded anywhere. Where a reference value happens to be checkable
// by hand it is noted for the reader only.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('correlated-error-metrics');

const P3 = '/home/user/Si-Math-Ai/supabase/functions/_shared/disagreement.core.ts';
const { pairwiseAgreement, pairwiseErrorCorrelation, sharedErrorPatterns } = await import(P3);
const SRC = read('supabase/functions/_shared/disagreement.core.ts');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|[^:\\])\/\/.*$/, '$1')).join('\n');

// Items: engine -> stated raw answer. `reference` present only where an
// independent verifier has supplied one.
const ITEMS = [
  // All three wrong together, against a reference that was independently
  // established. (|n-1|<4 gives -3<n<5, i.e. 7 integers — checkable by hand.)
  { item_id: 'i1', reference: '7',  answers: { a: '9', b: '9', c: '9' } },
  { item_id: 'i2', reference: '12', answers: { a: '12', b: '12', c: '12' } },
  { item_id: 'i3', reference: '5',  answers: { a: '5', b: '4', c: '5' } },
  { item_id: 'i4', reference: '3',  answers: { a: '2', b: '2', c: '3' } },
  // No reference: agreement is still measurable, error is not.
  { item_id: 'i5', answers: { a: '8', b: '8', c: '1' } },
];
const pick = (arr, ea, eb) => arr.find((p) => p.engines[0] === ea && p.engines[1] === eb);

// ───────────────────────────────────────────────────────────────────────────
t.section('C1. Pairwise agreement needs no reference at all');
{
  const pa = pairwiseAgreement(ITEMS);
  t.is('three engines -> three pairs', pa.length, 3);
  t.is('pairs are sorted and canonical', pa.map((p) => p.engines.join('-')), ['a-b', 'a-c', 'b-c']);

  const ab = pick(pa, 'a', 'b');
  // a vs b: i1 same, i2 same, i3 differ, i4 same, i5 same -> 4/5
  t.is('a-b comparable items', ab.comparable, 5);
  t.is('a-b agreed', ab.agreed, 4);
  t.is('a-b disagreed', ab.disagreed, 1);
  t.is('agreement rate is reported', ab.agreement_rate, 0.8);

  t.ok('no error vocabulary appears in agreement metrics',
    !/wrong|error|correct/i.test(JSON.stringify(pa)), JSON.stringify(pa).slice(0, 200));
}

t.section('C2. Error metrics use ONLY items with an independent reference');
{
  const pe = pairwiseErrorCorrelation(ITEMS);
  const ab = pick(pe, 'a', 'b');
  t.is('i5 (no reference) is excluded from n', ab.n, 4);
  t.is('and the exclusion is reported', ab.excluded_no_reference, 1);

  // a wrong on i1,i3(no: a=5 correct),i4 -> a wrong on i1, i4 ; b wrong on i1, i3, i4
  t.is('both wrong together', ab.both_wrong, 2);      // i1, i4
  t.is('only a wrong', ab.a_only_wrong, 0);
  t.is('only b wrong', ab.b_only_wrong, 1);           // i3
  t.is('both right', ab.both_right, 1);               // i2
}

t.section('C3. Correlation is computed only when the data supports it');
{
  const pe = pairwiseErrorCorrelation(ITEMS);
  const ab = pick(pe, 'a', 'b');
  t.ok('phi is a number here', typeof ab.phi === 'number', JSON.stringify(ab));
  t.is('and no undefined reason is given', ab.undefined_reason, null);
  t.ok('phi is in range', ab.phi >= -1 && ab.phi <= 1, String(ab.phi));
}

t.section('C4. UNDEFINED IS REPORTED, NEVER INVENTED');
{
  // No references at all -> no error data, correlation undefined.
  const noRef = pairwiseErrorCorrelation([
    { item_id: 'x1', answers: { a: '1', b: '2' } },
    { item_id: 'x2', answers: { a: '3', b: '3' } },
  ]);
  t.is('n is zero', noRef[0].n, 0);
  t.is('phi is null, not 0', noRef[0].phi, null);
  t.ok('with a stated reason', /no_paired|no_reference/.test(noRef[0].undefined_reason ?? ''),
    String(noRef[0].undefined_reason));

  // Degenerate margin: neither engine is ever wrong -> variance zero.
  const allRight = pairwiseErrorCorrelation([
    { item_id: 'y1', reference: '1', answers: { a: '1', b: '1' } },
    { item_id: 'y2', reference: '2', answers: { a: '2', b: '2' } },
  ]);
  t.is('n counts the paired items', allRight[0].n, 2);
  t.is('phi is null under zero variance', allRight[0].phi, null);
  t.ok('and says why', /variance|degenerate/.test(allRight[0].undefined_reason ?? ''),
    String(allRight[0].undefined_reason));

  // A single paired item cannot support a correlation.
  const one = pairwiseErrorCorrelation([{ item_id: 'z1', reference: '1', answers: { a: '2', b: '1' } }]);
  t.is('n = 1', one[0].n, 1);
  t.is('phi is null', one[0].phi, null);
  t.ok('reason names the sample size', /sample|n_too_small|no_paired/.test(one[0].undefined_reason ?? ''),
    String(one[0].undefined_reason));
}

t.section('C5. Shared-error and unanimous-wrong patterns');
{
  const sp = sharedErrorPatterns(ITEMS);
  t.is('sample: items seen', sp.sample_total, 5);
  t.is('sample: items with a reference', sp.sample_with_reference, 4);
  t.is('unanimous-wrong items', sp.unanimous_wrong.map((u) => u.item_id), ['i1']);
  t.is('  and the answer they shared', sp.unanimous_wrong[0].answer, '9');
  t.is('  naming every engine involved', sp.unanimous_wrong[0].engines, ['a', 'b', 'c']);

  const shared = sp.shared_wrong.map((s) => `${s.item_id}:${s.answer}:${s.engines.join('')}`);
  t.ok('i4 shows a and b sharing a wrong answer', shared.includes('i4:2:ab'), JSON.stringify(shared));
  t.ok('i5 contributes nothing — no reference',
    !JSON.stringify(sp).includes('i5'), JSON.stringify(sp).slice(0, 300));
}

t.section('C5b. Unanimous-wrong is COUNT-AGNOSTIC — two engines is unanimous too');
{
  // Kills a hard-coded "three models": with two engines that both miss the
  // reference on the same value, every engine that answered was wrong, which is
  // unanimity at N=2. Assuming 3 here would silently ignore the cheap two-engine
  // path the future router is built around.
  const two = sharedErrorPatterns([{ item_id: 'u2', reference: '7', answers: { a: '9', b: '9' } }]);
  t.is('N=2 unanimous-wrong is detected', two.unanimous_wrong.map((u) => u.item_id), ['u2']);
  t.is('  naming both engines', two.unanimous_wrong[0].engines, ['a', 'b']);

  const five = sharedErrorPatterns([
    { item_id: 'u5', reference: '7', answers: { a: '9', b: '9', c: '9', d: '9', e: '9' } }]);
  t.is('N=5 unanimous-wrong is detected too', five.unanimous_wrong.length, 1);
  t.is('  naming all five', five.unanimous_wrong[0].engines.length, 5);

  // One engine alone is not "unanimous" — there is no one to be unanimous with.
  const one = sharedErrorPatterns([{ item_id: 'u1', reference: '7', answers: { a: '9' } }]);
  t.is('N=1 is never unanimous', one.unanimous_wrong, []);
  t.is('and not a shared error either', one.shared_wrong, []);
}

t.section('C6. Agreement is never treated as correctness');
{
  // i5: a and b agree on "8" with no reference. That must never become "right".
  const sp = sharedErrorPatterns([{ item_id: 'q', answers: { a: '8', b: '8' } }]);
  t.is('no reference -> nothing measured as error', sp.sample_with_reference, 0);
  t.is('no unanimous-wrong claim', sp.unanimous_wrong, []);
  t.is('no shared-wrong claim', sp.shared_wrong, []);

  const pa = pairwiseAgreement([{ item_id: 'q', answers: { a: '8', b: '8' } }]);
  t.is('but the agreement IS recorded', pick(pa, 'a', 'b').agreed, 1);
  t.ok('and carries no correctness claim',
    !/correct|right|verified/i.test(JSON.stringify(pa)), JSON.stringify(pa));
}

t.section('C7. Engines that did not answer are excluded, not counted as wrong');
{
  const items = [
    { item_id: 'm1', reference: '5', answers: { a: '5', b: null } },
    { item_id: 'm2', reference: '5', answers: { a: '4', b: '4' } },
  ];
  const ab = pick(pairwiseErrorCorrelation(items), 'a', 'b');
  t.is('only the item where both answered counts', ab.n, 1);
  t.is('and the abstention is reported', ab.excluded_no_answer, 1);

  const pa = pick(pairwiseAgreement(items), 'a', 'b');
  t.is('agreement also skips the unanswered item', pa.comparable, 1);
}

t.section('C8. N-agnostic: 0, 1, 2 and 5 engines all behave');
{
  t.is('no items -> no pairs', pairwiseAgreement([]), []);
  t.is('no items -> no correlations', pairwiseErrorCorrelation([]), []);
  t.is('single engine -> no pairs', pairwiseAgreement([{ item_id: 's', answers: { a: '1' } }]), []);

  const five = [{ item_id: 'f1', reference: '1', answers: { a: '1', b: '1', c: '2', d: '2', e: '1' } }];
  t.is('five engines -> ten pairs', pairwiseAgreement(five).length, 10);
  t.is('and ten correlations', pairwiseErrorCorrelation(five).length, 10);

  let threw = false;
  try { pairwiseAgreement(null); pairwiseErrorCorrelation(null); sharedErrorPatterns(null); }
  catch (e) { threw = true; }
  t.ok('null input does not throw', !threw);
}

t.section('C9. Deterministic and permutation-invariant');
{
  const a = JSON.stringify(pairwiseAgreement(ITEMS));
  t.is('agreement is stable', JSON.stringify(pairwiseAgreement(ITEMS)), a);
  t.is('item order does not matter',
    JSON.stringify(pairwiseAgreement([...ITEMS].reverse())), a);

  const e = JSON.stringify(pairwiseErrorCorrelation(ITEMS));
  t.is('correlation is stable', JSON.stringify(pairwiseErrorCorrelation(ITEMS)), e);
  t.is('and item-order invariant', JSON.stringify(pairwiseErrorCorrelation([...ITEMS].reverse())), e);

  // Engine key order within an item must not matter either.
  const flipped = ITEMS.map((it) => ({
    ...it,
    answers: Object.fromEntries(Object.entries(it.answers).reverse()),
  }));
  t.is('engine key order does not matter', JSON.stringify(pairwiseAgreement(flipped)), a);
}

t.section('C10. No benchmark score, no ranking, no verdict');
{
  t.ok('no hard-coded benchmark figures', !/\b(94|96|106)\b/.test(CODE), CODE.slice(0, 300));
  t.ok('no model names', !/chatgpt|claude|gemini|kimi|opus|openai|anthropic/i.test(CODE), CODE.slice(0, 300));
  // Targets MODEL ranking specifically. A bare /rank/ would also match an
  // ordinary sort helper, which is not what this guard is about.
  t.ok('no model-ranking vocabulary',
    !/(rank|score|rate)_?(model|engine|provider)|(model|engine|provider)_?(rank|score)|leaderboard|best_?(model|engine)|accuracy\s*[:=]/i.test(CODE),
    CODE.slice(0, 300));
  const json = JSON.stringify({ pa: pairwiseAgreement(ITEMS), pe: pairwiseErrorCorrelation(ITEMS) });
  t.ok('metrics carry no verdict', !/VERIFIED|winner|is_true/i.test(json), json.slice(0, 200));
}

t.done();
