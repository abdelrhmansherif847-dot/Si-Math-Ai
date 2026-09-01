#!/usr/bin/env node
// The composition layer, broken one obligation at a time.
//
// Composition is where a gate is easiest to fool: two mechanisms that each bite
// alone can produce an item in which one is decoration, and the item still
// looks rich from the outside. So every test below takes a VALID composed item
// and removes exactly one thing, then asserts the layer notices.
import {
  compose, assessComposed, composeClassifyNormalise, COMPOSABLE, composableIds,
  counterfactualsOf, checkCounterfactual,
} from '../scripts/est-compose.mjs';
import { Q, qEq, qStr, assess, assertInteraction, ROUTE, trapLevel } from '../scripts/est-primitives.mjs';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${label}`); } };
const clone = it => JSON.parse(JSON.stringify(it));
const keyValue = it => it.options.find(o => o.id === it.key).value;

/* ── a valid interacting pair is ACCEPTED ── */

const good = (() => { for (let s = 6000; s < 6200; s++) { const it = composeClassifyNormalise(s); if (!it.error) return it; } })();
ok(!!good, 'C2 produces a composed item at all');
ok(good.composedOf.length === 2, 'it carries exactly two mechanisms');
ok(assessComposed(good).ok, 'VALID INTERACTING PAIR: accepted');
ok(assertInteraction(good).ok, 'and its concept chain interacts');
ok(assertInteraction(good).integrates >= 2, 'the closing step integrates at least two earlier results');
ok(counterfactualsOf(good).length === 2, 'one counterfactual per mechanism, not one for the item');

// The mathematics, checked independently of the machinery.
{
  const grid = good.errorGrid;
  const vals = [keyValue(good), grid.a, grid.b, grid.ab];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++)
    ok(!qEq(vals[i], vals[j]), `error-grid cells ${i} and ${j} are distinct`);
  ok(vals.every(v => good.options.some(o => qEq(o.value, v))), 'all four grid cells are printed');
}

/* ── a NON-INTERACTING pair is REJECTED ── */
// C5 is the shape: two independent preconditions on different parts of the
// item, so the closing step integrates one earlier result rather than two.

{
  const stacked = clone(good);
  stacked.conceptChain = [
    { concept: 'convert-units', inputs: ['given'], output: 'converted' },
    { concept: 'locate-configuration', inputs: ['names'], output: 'roles' },
    { concept: 'apply-ratio', inputs: ['converted'], output: 'length' },
  ];
  const v = assessComposed(stacked);
  ok(!v.ok, 'NON-INTERACTING PAIR: rejected');
  ok(v.reasons.some(r => /stacked, not composed/.test(r)), 'and the reason names it as stacking');
  ok(COMPOSABLE.find(c => c.id === 'C5').disallowed, 'the C5 pattern is recorded as disallowed rather than quietly absent');
  ok(!composableIds().includes('C5'), 'and it is not offered as an available pattern');
}

/* ── a BYPASS route is REJECTED ── */

{
  const bypassed = clone(good);
  const kv = keyValue(bypassed);
  bypassed.routes.push(ROUTE('guess-the-parameter-and-divide', { insight: false, cost: 1, value: kv }));
  const v = assessComposed(bypassed);
  ok(!v.ok, 'BYPASS: a cheap mechanism-blind route to the key is rejected');
  ok(v.reasons.some(r => /bypass/.test(r)), 'and the reason says bypass');
}
{
  // A LONGER blind route to the key is not a bypass — that distinction is the
  // whole point of costing routes rather than counting them.
  const longer = clone(good);
  const insight = longer.routes.find(r => r.requiresInsight);
  longer.routes.push(ROUTE('long-division-throughout', { insight: false, cost: insight.cost + 6, value: keyValue(longer) }));
  ok(assessComposed(longer).ok, 'a longer valid route is NOT a bypass');
}

/* ── an INERT mechanism is REJECTED ── */

{
  const inert = clone(good);
  inert.counterfactuals[0].value = keyValue(inert);   // withholding it changes nothing
  const v = assessComposed(inert);
  ok(!v.ok, 'INERT MECHANISM: rejected');
  ok(v.reasons.some(r => /decoration/.test(r)), 'and the reason says the mechanism is decoration');
  ok(v.reasons.some(r => /P-CLASSIFY/.test(r)), 'and it names WHICH mechanism is inert');
}
{
  // Load-bearing does not compose: one mechanism proven is not both proven.
  const half = clone(good);
  half.counterfactuals = [half.counterfactuals[0]];
  const v = assessComposed(half);
  ok(!v.ok, 'one counterfactual for two mechanisms: rejected');
  ok(v.reasons.some(r => /no counterfactual for P-NORMALISE/.test(r)), 'and it names the unproven mechanism');
}

/* ── a MALFORMED counterfactual is REJECTED ── */

{
  for (const [bad, label] of [
    [{ mechanism: 'P-CLASSIFY', kind: 'value' }, 'a value counterfactual with no value'],
    [{ mechanism: 'P-CLASSIFY', kind: 'determinacy', optionsSurviving: 1 }, 'a determinacy counterfactual that leaves the item determinate'],
    [{ mechanism: 'P-CLASSIFY', kind: 'vibes', value: Q(7) }, 'an unknown counterfactual kind'],
    [{ kind: 'value', value: Q(7) }, 'a counterfactual naming no mechanism'],
  ]) {
    const m = clone(good);
    m.counterfactuals[0] = bad;
    ok(!assessComposed(m).ok, `MALFORMED COUNTERFACTUAL: ${label} is rejected`);
  }
  ok(!checkCounterfactual(null, Q(1)).ok, 'a missing counterfactual is rejected');
  ok(checkCounterfactual({ mechanism: 'x', kind: 'value', value: Q(2) }, Q(1)).ok, 'a well-formed one is accepted');
}

/* ── the error grid must be complete and printed ── */

{
  const holed = clone(good);
  delete holed.errorGrid.ab;
  ok(!assessComposed(holed).ok, 'an incomplete error grid is rejected');

  const unprinted = clone(good);
  unprinted.options.find(o => qEq(o.value, unprinted.errorGrid.b)).value = Q(999983);
  const v = assessComposed(unprinted);
  ok(!v.ok, 'an error-grid cell that is not printed is rejected');
  ok(v.reasons.some(r => /not printed|printed distractor/.test(r)), 'and the reason says so');
}

/* ── depth and representation coherence ── */

{
  const deep = clone(good);
  deep.composedOf = ['A', 'B', 'C'];
  ok(!assessComposed(deep).ok, 'depth three is rejected — a four-option grid cannot print seven distractors');

  const noisy = clone(good);
  noisy.representationSwitches = 2;
  ok(!assessComposed(noisy).ok, 'more than one representation switch is rejected');
}

/* ── the composed item is a real question, and its trap is graded ── */

{
  const t = trapLevel(good);
  ok([0, 1, 2].includes(t.level), 'the composed item carries a graded trap level');
  ok(assess(good).loadBearing, 'and it passes the ordinary load-bearing gate unchanged');
  ok(new Set([6000, 6001, 6002].map(s => { const i = composeClassifyNormalise(s); return i.error ? 'e' : qStr(keyValue(i)); })).size > 1,
    'and successive draws do not repeat one key');
}

console.log(`  ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
