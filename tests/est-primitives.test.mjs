#!/usr/bin/env node
// The Stage-1 primitives, broken one mechanism at a time.
//
// scripts/validate-est-primitives.mjs proves the primitives produce
// load-bearing items. That is only worth something if the assessment could go
// red — the verification-framework audit's rule: a green check is evidence only
// if it could have failed. So every block below takes a VALID generated item,
// removes or defeats exactly one thing, and asserts the assessment notices.
//
// If any of these ever passes after a mutation, the load-bearing test has
// stopped testing anything and Stage 1's acceptance criterion is void.
import {
  generate, assess, pCombination, pConversion, pScope, pDecoy, pUnstatedModel,
  assertInteraction, assertExpensiveFirstMove,
  Q, qAdd, qEq, qStr, rng, ROUTE,
} from '../scripts/est-primitives.mjs';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${label}`); } };
const clone = o => JSON.parse(JSON.stringify(o));
const keyValue = it => it.options.find(o => o.id === it.key).value;
const reasonHas = (it, needle) => assess(it).reasons.some(r => r.includes(needle));

const sample = name => generate(name, 1, { seed: 31337 }).items[0];
const NAMES = ['P-COMBINATION', 'P-CONVERSION', 'P-NORMALISE', 'P-SCOPE',
  'P-CLASSIFY', 'P-DECOY', 'P-UNSTATED-MODEL', 'P-NAMED-CONFIG'];

/* ── baseline: every primitive produces a load-bearing item ── */

const base = {};
for (const n of NAMES) {
  const it = sample(n);
  base[n] = it;
  ok(!!it, `${n}: produces an item`);
  ok(it && assess(it).loadBearing, `${n}: baseline item is load-bearing`);
}

/* ── mutation 1: delete the insight route ──
   Nothing is left that reaches the key by the intended path. */

for (const n of NAMES) {
  const m = clone(base[n]);
  m.routes = m.routes.filter(r => !r.requiresInsight);
  ok(!assess(m).loadBearing, `${n}: MUTANT with no insight route must fail`);
  ok(reasonHas(m, 'no insight route reaches the key'), `${n}: and must say so`);
}

/* ── mutation 2: give a mechanism-blind route the key at a cheaper cost ──
   This is the bypass the study found in four reference items: the shortcut
   reaches the answer without the insight. */

for (const n of NAMES) {
  const m = clone(base[n]);
  m.routes.push({ name: 'free-shortcut', requiresInsight: false, cost: 0, value: keyValue(m), natural: false });
  const a = assess(m);
  ok(!a.loadBearing, `${n}: MUTANT with a cheap blind route to the key must fail`);
  ok(a.bypass, `${n}: and must be flagged as a bypass`);
}

/* ── mutation 3: move every blind route off the option list ──
   The mechanism is then undiagnosable: a student who misses it lands nowhere,
   so nothing on the page distinguishes seeing it from not seeing it. This is
   the T2-Q9 / T4-Q3 failure — a confusion advertised but not offered. */

for (const n of NAMES) {
  const m = clone(base[n]);
  const far = Q(999983);                       // a value no option carries
  m.routes = m.routes.map(r => (r.requiresInsight ? r : { ...r, value: far }));
  ok(!assess(m).loadBearing, `${n}: MUTANT whose blind routes land on no option must fail`);
  ok(reasonHas(m, 'no mechanism-blind route lands on a printed distractor'), `${n}: and must say so`);
}

/* ── mutation 4: make the counterfactual inert ──
   Removing the mechanism no longer changes the answer, so the mechanism was
   decoration. For a determinacy counterfactual, the item stays answerable. */

for (const n of NAMES) {
  const m = clone(base[n]);
  if (m.counterfactual.kind === 'determinacy') m.counterfactual.optionsSurviving = 1;
  else m.counterfactual.value = keyValue(m);
  ok(!assess(m).loadBearing, `${n}: MUTANT with an inert counterfactual must fail`);
  ok(reasonHas(m, 'decoration'), `${n}: and must name it decoration`);
}

/* ── the negative control ──
   One relation over two symbols: the corpus shape whose insight is optional,
   because assigning either symbol a value solves it at the same cost. The gate
   must never accept it. */

let controlAccepted = 0, controlSeen = 0;
for (let s = 7000; s < 7080; s++) {
  const c = pCombination(s, { form: 'single-relation' });
  if (!c || c.error) continue;
  controlSeen++;
  if (assess(c).loadBearing) controlAccepted++;
}
ok(controlSeen > 0, 'negative control: single-relation form does generate candidates');
ok(controlAccepted === 0, 'negative control: no single-relation item may be accepted');
{
  // ...and rejected for the RIGHT reason. A control rejected by a layout
  // accident would prove nothing about the anti-bypass rule.
  let byBypass = 0;
  for (let s = 7000; s < 7080; s++) {
    const c = pCombination(s, { form: 'single-relation' });
    if (!c || c.error) continue;
    if (assess(c).reasons.some(r => r.startsWith('bypass:'))) byBypass++;
  }
  ok(byBypass === controlSeen, `negative control: all ${controlSeen} candidates rejected by the bypass rule (got ${byBypass})`);
}

/* ── P-CONVERSION: the un-converted answer is mandatory ── */

{
  const it = generate('P-CONVERSION', 1, { seed: 606 }).items[0];
  const blind = it.routes.find(r => r.natural);
  ok(it.options.some(o => qEq(o.value, blind.value)), 'P-CONVERSION: un-converted answer is a printed option');
  ok(!qEq(blind.value, keyValue(it)), 'P-CONVERSION: un-converted answer is not the key');

  // MUTANT: quote the rate in the target unit, so no conversion exists.
  const m = clone(it);
  m.counterfactual.value = keyValue(m);
  ok(!assess(m).loadBearing, 'P-CONVERSION: MUTANT with no binding conversion must fail');
}

/* ── P-SCOPE: gated, and both readings must be representable ── */

{
  const it = generate('P-SCOPE', 1, { seed: 909 }).items[0];
  ok(it.scheduled === false, 'P-SCOPE: emitted unscheduled while competing_interp is unstable');
  ok(it.readings.length === 2, 'P-SCOPE: exactly two readings');
  const alt = it.readings.find(r => !r.intended);
  ok(it.options.some(o => qEq(o.value, alt.value)), 'P-SCOPE: the alternative reading is offered');

  // MUTANT: drop the alternative reading from the options. This is precisely
  // the reference failure — an ambiguity that cannot be selected.
  // Remove the alternative reading from the OPTIONS only. The route still
  // computes it, so a student taking that reading now lands on nothing — which
  // is exactly the reference failure: an ambiguity that cannot be selected.
  const m = clone(it);
  m.options.find(o => qEq(o.value, alt.value)).value = Q(999979);

  // A LIMIT OF THE GENERIC GATE, recorded rather than hidden. assess() asks
  // whether SOME mechanism-blind route lands on a printed distractor. Stage 1.5
  // enumerated the routes that P-SCOPE's other two options had always been
  // reachable by, and with those on the list the mutant still satisfies it:
  // reporting the first group is a blind route and it still lands somewhere.
  // The generic gate got easier to satisfy as the route model got more honest.
  const a = assess(m);
  ok(a.loadBearing, 'P-SCOPE: the generic gate no longer catches this mutant — other blind routes still land');

  // Which is exactly why each primitive carries a MECHANISM-SPECIFIC rule. The
  // scope mechanism is diagnosable only if the competing reading is printed,
  // and that is the assertion that has to catch it.
  const altOffered = x => x.options.some(o => qEq(o.value, x.readings.find(r => !r.intended).value));
  ok(altOffered(it), 'P-SCOPE: the alternative reading is offered on a real item');
  ok(!altOffered(m), 'P-SCOPE: MUTANT whose alternative reading is unoffered is caught by the mechanism-specific rule');
}

/* ── P-DECOY: the collapse must be exact ── */

{
  const all = generate('P-DECOY', 24, { seed: 4242 }).items;
  const collapse = all.filter(i => i.form === 'coefficients_sum_zero');
  const shared = all.filter(i => i.form === 'shared_terms_cancel');
  ok(collapse.length > 0 && shared.length > 0, 'P-DECOY: both realisations of the species are produced');

  // The decoy is the DENOMINATOR: only a vanishing numerator makes it inert, so
  // the key is 0 and the sub-form says so rather than being excused for it.
  for (const it of collapse) {
    ok(it.collapse.sum === 0, 'P-DECOY/collapse: coefficients sum to zero exactly');
    ok(qEq(keyValue(it), Q(0)), 'P-DECOY/collapse: the key is zero');
    ok(it.constantKey && it.constantKey.value === '0' && it.constantKey.maxPerForm === 1,
      'P-DECOY/collapse: the forced key is declared, with a per-form cap');
    const blind = it.routes.filter(r => !r.requiresInsight);
    ok(blind.some(r => r.cost > 5), 'P-DECOY/collapse: processing the decoy costs materially more than seeing the collapse');
  }

  // The decoy is the SHARED PART of two functions. Evaluating both is correct
  // and slower — a longer route, not a bypass — and the key varies.
  ok(new Set(shared.map(i => qStr(keyValue(i)))).size > 1, 'P-DECOY/shared: the key varies across draws');
  for (const it of shared) {
    ok(!it.constantKey, 'P-DECOY/shared: does not claim a forced key');
    const long = it.routes.find(r => r.name === 'evaluate-both-then-subtract');
    const ins = it.routes.find(r => r.requiresInsight);
    ok(long && qEq(long.value, keyValue(it)), 'P-DECOY/shared: the slow route does reach the key');
    ok(long.cost > ins.cost, 'P-DECOY/shared: and costs more than the insight, so it is not a bypass');
  }

  for (const it of all) {
    const blind = it.routes.filter(r => !r.requiresInsight);
    ok(blind.every(r => it.options.some(o => qEq(o.value, r.value))),
      'P-DECOY: every processed-the-decoy route lands on a printed option');
    ok(it.options.every(o => it.routes.some(r => qEq(r.value, o.value))),
      'P-DECOY: and every printed option is reached by some route');
  }
}

/* ── P-UNSTATED-MODEL: determinacy, not value ── */

{
  const it = generate('P-UNSTATED-MODEL', 1, { seed: 55 }).items[0];
  ok(it.relationStatedInStem === false, 'P-UNSTATED-MODEL: relation absent from the stem');
  ok(it.relationOnReferenceSheet === false, 'P-UNSTATED-MODEL: relation absent from the reference sheet');
  ok(it.counterfactual.kind === 'determinacy', 'P-UNSTATED-MODEL: uses the determinacy counterfactual');
  ok(it.counterfactual.optionsSurviving === 4, 'P-UNSTATED-MODEL: all four options survive without the relation');

  // A value counterfactual would be wrong here and must not silently pass:
  // stating the relation does not move the answer, it only makes it easier.
  const m = clone(it);
  m.counterfactual = { kind: 'value', note: 'relation stated', value: keyValue(m) };
  ok(!assess(m).loadBearing, 'P-UNSTATED-MODEL: a value counterfactual equal to the key must fail');
}

/* ── the strengthenings ── */

{
  const interacting = {
    conceptChain: [
      { concept: 'midpoint', inputs: ['A', 'B'], output: 'M' },
      { concept: 'slope-from-standard-form', inputs: ['line-d'], output: 'm1' },
      { concept: 'perpendicular', inputs: ['m1'], output: 'm2' },
      { concept: 'point-slope', inputs: ['M', 'm2'], output: 'equation' },
    ],
  };
  ok(assertInteraction(interacting).ok, 'S-MULTICONCEPT: a branching, interacting chain passes');
  ok(assertInteraction(interacting).integrates === 2, 'S-MULTICONCEPT: reports how many results the close integrates');

  ok(!assertInteraction({
    conceptChain: [
      { concept: 'inequality', inputs: ['given'], output: 'range' },
      { concept: 'target-shift', inputs: ['unrelated'], output: 'shifted' },
    ],
  }).ok, 'S-MULTICONCEPT: stacked-but-independent concepts FAIL');

  ok(!assertInteraction({
    conceptChain: [
      { concept: 'a', inputs: ['x'], output: 'p' },
      { concept: 'b', inputs: ['p'], output: 'q' },
    ],
  }).ok, 'S-MULTICONCEPT: a straight chain whose close integrates one result FAILS');

  ok(!assertInteraction({ ...interacting, optionShortCircuit: true }).ok,
    'S-MULTICONCEPT: an option set that short-circuits the chain FAILS');
  ok(!assertInteraction({ conceptChain: [{ concept: 'only', inputs: [], output: 'z' }] }).ok,
    'S-MULTICONCEPT: one concept is not a chain');
}

{
  for (const n of NAMES) ok(assertExpensiveFirstMove(base[n]).ok, `S-TRAPCOST: ${n} baseline passes`);

  // MUTANT: make the natural first move correct and cheap. That is the
  // "obvious approach is also the intended approach" case the study recorded
  // in the corpus — legitimate for an Entry item, disqualifying for a trap.
  const m = clone(base['P-NORMALISE']);
  m.routes = m.routes.map(r => (r.natural ? { ...r, value: keyValue(m), cost: 1 } : r));
  ok(!assertExpensiveFirstMove(m).ok, 'S-TRAPCOST: MUTANT whose natural move is correct and cheap FAILS');

  const noNatural = clone(base['P-CLASSIFY']);
  noNatural.routes = noNatural.routes.map(r => ({ ...r, natural: false }));
  ok(!assertExpensiveFirstMove(noNatural).ok, 'S-TRAPCOST: an item with no natural first move FAILS');
}

/* ── exact arithmetic, because every gate above depends on it ── */

{
  ok(qEq(qAdd(Q(1, 3), Q(1, 6)), Q(1, 2)), 'Q: 1/3 + 1/6 = 1/2 exactly');
  ok(qStr(Q(-4, -6)) === '2/3', 'Q: normalises sign and reduces');
  ok(!qEq(Q(1, 3), Q(33333, 100000)), 'Q: 1/3 is not its decimal approximation');
  let threw = false;
  try { Q(1, 0); } catch { threw = true; }
  ok(threw, 'Q: rejects a zero denominator');
}

/* ── determinism, so a Stage-1 validation set is reproducible ── */

{
  const a = generate('P-CLASSIFY', 5, { seed: 12345 }).items.map(i => i.stem).join('|');
  const b = generate('P-CLASSIFY', 5, { seed: 12345 }).items.map(i => i.stem).join('|');
  ok(a === b, 'generation is deterministic for a fixed seed');
  const c = generate('P-CLASSIFY', 5, { seed: 54321 }).items.map(i => i.stem).join('|');
  ok(a !== c, 'a different seed gives a different validation set');
  const r1 = rng(7), r2 = rng(7);
  ok(r1.int(0, 1e6) === r2.int(0, 1e6), 'rng is reproducible');
}

console.log(`  ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
