// The routine-item stream — Stage 2.5.
//
// WHY IT EXISTS
//
// 53% of the 200 coded reference items have an ENTRY profile: at most one
// mechanism biting, and none of them a reasoning-core mechanism. 71% are
// Entry-or-Core. The eight Stage-1 primitives produce NONE of those, because
// every one of them was built to make a mechanism bite. The Stage-2 dry run
// filled 10 of 50 slots for exactly that reason.
//
// ROUTINE IS NOT LOW-QUALITY, AND IT IS NOT TRIVIAL
//
// A routine item is one whose mathematics is direct — a standard technique
// applied to a standard object — and it still has to be a real EST question.
// Every construct below:
//
//   * computes its key in exact rational arithmetic;
//   * enumerates an error route for EVERY printed option, so no distractor is
//     arbitrary (the Stage-1.5 check-10a rule, applied here too);
//   * keeps a distractor within a factor of three of the key, so magnitude
//     alone never picks the answer;
//   * may carry a natural, cheap trap — a real slip that lands on a printed
//     option — and is never made harder than its mathematics warrants.
//
// WHY `assess()` IS NOT APPLIED HERE, AND IS NOT WEAKENED
//
// assess() requires an INSIGHT route and a mechanism-blind route that lands on
// a printed distractor. A routine item has no insight route: there is no
// mechanism to be blind to. Running assess() on one would be a category error,
// and relaxing assess() so it passed would destroy the Stage-1 acceptance
// criterion for the items it does govern.
//
// So routine items are a DIFFERENT CLASS with their own contract, checked by
// assessRoutine() below, and the blueprint records which stream each slot drew
// from. assess() is untouched and still governs every mechanism item.

import {
  Q, qAdd, qSub, qMul, qDiv, qNeg, qEq, qNum, qIsInt, qStr,
  rng, ROUTE, layout, coef, term, signedConst,
} from './est-primitives.mjs';
import { fingerprintItem, detectClone } from './est-fingerprint.mjs';
import { CORE_READERS, assessCore } from './est-core-stream.mjs';
import { itemSteps } from './est-form-gates.mjs';

/* ────────────────────────── the routine contract ────────────────────────── */

/**
 * What a routine item must satisfy. Not a weaker assess() — a different one,
 * for a class of item assess() was never written to judge.
 */
export function assessRoutine(item) {
  const reasons = [];
  if (!item || item.error) return { ok: false, reasons: [item?.error || 'no item'] };
  const keyValue = item.options.find(o => o.id === item.key)?.value;
  if (keyValue === undefined) return { ok: false, reasons: ['no key'] };

  // 1. Exactly one route reaches the key, and it is the direct method.
  const solves = item.routes.filter(r => qEq(r.value, keyValue));
  if (!solves.length) reasons.push('no route reaches the key');
  if (item.routes.some(r => r.requiresInsight)) reasons.push('a routine item must not claim an insight route');

  // 2. Every printed option is reached by an enumerated error route.
  const unrouted = item.options.filter(o => !item.routes.some(r => qEq(r.value, o.value)));
  if (unrouted.length) reasons.push(`option(s) ${unrouted.map(o => o.text).join(', ')} are reached by no route`);

  // 3. Magnitude alone must not identify the key.
  const kn = Math.abs(qNum(keyValue));
  const near = item.options.some(o => {
    if (o.id === item.key) return false;
    const v = Math.abs(qNum(o.value));
    return kn === 0 ? v < 3 : v > kn / 3 && v < kn * 3;
  });
  if (!near) reasons.push('every distractor is more than a factor of three from the key');

  // 4. The profile must actually be Entry-or-Core: at most one mechanism
  //    biting, and never a reasoning-core one. A routine item that scored
  //    higher would not be routine, and the whole point is the low end.
  const m = item.mechanism || {};
  const biting = Object.entries(m).filter(([, v]) => v >= 2).map(([k]) => k);
  const core = biting.filter(k => ['hidden_step', 'inference', 'multiconcept', 'nonobvious_rel'].includes(k));
  if (biting.length > 1) reasons.push(`${biting.length} mechanisms bite — that is not a routine item`);
  if (core.length) reasons.push(`bites the reasoning-core mechanism ${core[0]} — that is not a routine item`);

  return { ok: reasons.length === 0, reasons };
}

/* ────────────────────────── shared construction ────────────────────────── */

const OK = (rand, key, wrongs, meta, fmt = qStr) => {
  const vals = [key, ...wrongs.map(w => w.value)];
  for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++)
    if (qEq(vals[i], vals[j])) return { error: `duplicate option ${qStr(vals[i])}` };
  const L = layout(rand, key, wrongs.map(w => w.value), fmt);
  if (L.error) return { error: L.error };
  return {
    stream: 'routine',
    ...L,
    // The correct method is the natural move, and so is the CLASSIC SLIP —
    // reporting y instead of x, adding the two bars, subtracting from 90.
    // Marking only the correct route natural graded every routine item trap 0,
    // which locked the whole stream out of Core (Core requires trap >= 1) and
    // misdescribed the items: a routine question with a classic error in its
    // option set does carry a cheap, natural trap. The first `wrongs` entry is
    // that error in every construct below.
    routes: [ROUTE(meta.method, { insight: false, cost: meta.cost ?? 2, value: key, natural: true }),
             ...wrongs.map((w, i) => ROUTE(w.name, { insight: false, cost: w.cost ?? 2, value: w.value, natural: i === 0 }))],
    ...meta,
  };
};

/* ────────────────────────── the constructs, one per family ────────────────────────── */
//
// Each is the most ordinary question its family asks. They are deliberately
// plain: an authentic EST form is mostly plain, and pretending otherwise is
// what produced a 10/50 dry run.

const CONSTRUCTS = {

  A01: (rand) => {                                   // linear equations & solving
    const a = rand.int(2, 9), x = rand.nonZero(-9, 9), b = rand.nonZero(-20, 20);
    const c = a * x + b;
    return OK(rand, Q(x), [
      { name: 'added-instead-of-subtracting', value: Q(c + b, a), cost: 2 },
      { name: 'forgot-to-divide', value: Q(c - b), cost: 1 },
      { name: 'divided-the-constant-too', value: qDiv(Q(c - b), Q(a * a)), cost: 2 },
    ], {
      family: 'A01', construct: 'solve-linear',
      stem: `If $${coef(a, 'x')} ${term(b, '')} = ${c}$, what is the value of $x$?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'pure-algebraic no-stimulus', chain: ['isolate-variable'], target: 'value:x',
        options: 'arithmetic-slips', distract: ['D3', 'D1', 'D3'], narrative: 'symbols-only:1', numeric: ['coeff', 'const', 'rhs'] },
    });
  },

  A02: (rand) => {                                   // modelling: build the expression
    const fee = rand.int(2, 9) * 5, per = rand.int(2, 9), n = 'n';
    const key = `${fee} + ${per}n`;
    const opts = [key, `${per} + ${fee}n`, `${fee + per}n`, `${fee}n + ${per}`];
    const vals = opts.map((_, i) => Q(i));
    return OK(rand, vals[0], [
      { name: 'swapped-fee-and-rate', value: vals[1], cost: 1 },
      { name: 'combined-fee-into-the-rate', value: vals[2], cost: 1 },
      { name: 'attached-the-variable-to-the-fee', value: vals[3], cost: 1 },
    ], {
      family: 'A02', construct: 'build-linear-model',
      stem: `A workshop charges a booking fee of $\\$${fee}$ plus $\\$${per}$ for each hour booked. ` +
            `Which expression gives the total charge, in dollars, for $${n}$ hours?`,
      mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: { ctx: 'linear-cost no-stimulus', chain: ['identify-fixed-and-variable'], target: 'selection:expression',
        options: 'expression-set', distract: ['D3', 'D2', 'D3'], narrative: 'single-entity-fee-rate', numeric: ['fee', 'rate'] },
    }, v => opts[qNum(v)]);
  },

  A03: (rand) => {                                   // systems of equations
    const x = rand.nonZero(-6, 6), y = rand.nonZero(-6, 6);
    const a = rand.int(1, 5), b = rand.nonZero(-5, 5), c = rand.int(1, 5), d = rand.nonZero(-5, 5);
    if (a * d - b * c === 0) return { error: 'the system is degenerate' };
    return OK(rand, Q(x), [
      { name: 'reported-y-instead', value: Q(y), cost: 2 },
      { name: 'sign-slip-in-elimination', value: Q(-x), cost: 3 },
      { name: 'reported-the-sum', value: Q(x + y), cost: 2 },
    ], {
      family: 'A03', construct: 'solve-2x2-system',
      stem: `If $${coef(a, 'x')} ${term(b, 'y')} = ${a * x + b * y}$ and $${coef(c, 'x')} ${term(d, 'y')} = ${c * x + d * y}$, what is the value of $x$?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'pure-algebraic no-stimulus', chain: ['eliminate-one-variable'], target: 'value:x',
        options: 'system-slips', distract: ['D1', 'D3', 'D1'], narrative: 'symbols-only:2', numeric: ['coeffs', 'rhs'] },
    });
  },

  A04: (rand) => {                                   // inequalities
    const a = rand.int(2, 8), b = rand.nonZero(-15, 15), c = rand.int(3, 40);
    const bound = Q(c - b, a);
    if (!qIsInt(bound)) return { error: 'the boundary is not a whole number' };
    return OK(rand, bound, [
      { name: 'added-instead-of-subtracting', value: Q(c + b, a), cost: 2 },
      { name: 'forgot-to-divide', value: Q(c - b), cost: 1 },
      { name: 'sign-flip', value: qNeg(bound), cost: 2 },
    ], {
      family: 'A04', construct: 'inequality-boundary',
      stem: `What is the greatest integer $x$ for which $${coef(a, 'x')} ${term(b, '')} \\le ${c}$?`,
      mechanism: { abstraction: 1, filtering: 1 },
      // The fingerprint flagged this against A01's solve-linear, and on the parts
      // as first written it was right to: identical ctx, options, distractors
      // and narrative. What actually differs is the TARGET — a greatest integer
      // under an inclusive constraint, not a solution — and the axes now say so
      // rather than leaving it to the chain alone to carry.
      fingerprintParts: { ctx: 'pure-algebraic inequality no-stimulus',
        chain: ['isolate-then-bound', 'floor-to-integer'], target: 'value:greatest-integer-under-constraint',
        options: 'boundary-slips', distract: ['D6', 'D1', 'D3'],
        narrative: 'symbols-only:1 inclusive-bound', numeric: ['coeff', 'const', 'bound'] },
    });
  },

  A05: (rand) => {                                   // lines in the plane
    const x1 = rand.nonZero(-8, 8), y1 = rand.nonZero(-8, 8);
    const dx = rand.nonZero(-6, 6), dy = rand.nonZero(-9, 9);
    const slope = Q(dy, dx);
    return OK(rand, slope, [
      { name: 'inverted-the-slope', value: Q(dx, dy), cost: 2 },
      { name: 'sign-slip-in-the-difference', value: qNeg(slope), cost: 2 },
      // "rise only" — always defined, unlike anything built over a coordinate
      // SUM, which divides by zero whenever the two x-values are opposites.
      { name: 'reported-the-rise-only', value: Q(dy), cost: 1 },
    ], {
      family: 'A05', construct: 'slope-from-two-points',
      stem: `A line passes through $(${x1}, ${y1})$ and $(${x1 + dx}, ${y1 + dy})$. What is its slope?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'coordinate-plane no-stimulus', chain: ['difference-quotient'], target: 'value:slope',
        options: 'ratio-slips', distract: ['D3', 'D3', 'D6'], narrative: 'two-points', numeric: ['point-1', 'point-2'] },
    });
  },

  A06: (rand) => {                                   // quadratics & parabolas
    const r1 = rand.nonZero(-7, 7); let r2 = rand.nonZero(-7, 7);
    if (r1 === r2) return { error: 'a repeated root reads as a different question' };
    const b = -(r1 + r2), c = r1 * r2;
    return OK(rand, Q(r1 + r2), [
      { name: 'read-the-sum-off-the-b-term', value: Q(b), cost: 1 },
      { name: 'reported-the-product', value: Q(c), cost: 1 },
      { name: 'sign-slip-on-one-root', value: Q(r1 - r2), cost: 2 },
    ], {
      family: 'A06', construct: 'sum-of-roots',
      stem: `The equation $x^2 ${term(b, 'x')} ${term(c, '')} = 0$ has two solutions. What is their sum?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'pure-algebraic no-stimulus', chain: ['factor-quadratic'], target: 'value:sum-of-roots',
        options: 'coefficient-confusions', distract: ['D1', 'D1', 'D3'], narrative: 'symbols-only:1', numeric: ['b', 'c'] },
    });
  },

  A07: (rand) => {                                   // polynomials & factoring
    const a = rand.nonZero(-6, 6), b = rand.nonZero(-6, 6);
    const x0 = rand.int(2, 6);
    const key = Q((x0 + a) * (x0 + b));
    return OK(rand, key, [
      { name: 'added-the-factors', value: Q(2 * x0 + a + b), cost: 1 },
      { name: 'sign-slip-on-one-factor', value: Q((x0 + a) * (x0 - b)), cost: 2 },
      { name: 'squared-the-first-factor', value: Q((x0 + a) * (x0 + a)), cost: 2 },
    ], {
      family: 'A07', construct: 'evaluate-factored-form',
      stem: `If $P(x) = (x ${signedConst(a)})(x ${signedConst(b)})$, what is the value of $P(${x0})$?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'pure-algebraic no-stimulus', chain: ['substitute-into-factors'], target: 'value:evaluation',
        options: 'product-slips', distract: ['D1', 'D3', 'D3'], narrative: 'symbols-only:1', numeric: ['factor-a', 'factor-b', 'point'] },
    });
  },

  A08: (rand) => {                                   // rational expressions & functions
    const a = rand.nonZero(-8, 8), b = rand.nonZero(-8, 8);
    if (a === b) return { error: 'the factor cancels the excluded value away' };
    return OK(rand, Q(-b), [
      { name: 'used-the-numerator-root', value: Q(-a), cost: 1 },
      { name: 'sign-slip', value: Q(b), cost: 1 },
      { name: 'read-the-numerator-with-a-sign-slip', value: Q(a), cost: 1 },
    ], {
      family: 'A08', construct: 'excluded-value',
      stem: `For what value of $x$ is $\\dfrac{x ${signedConst(a)}}{x ${signedConst(b)}}$ undefined?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'rational-expression no-stimulus', chain: ['set-denominator-zero'], target: 'value:excluded',
        options: 'root-confusions', distract: ['D1', 'D3', 'D3'], narrative: 'symbols-only:1', numeric: ['num-const', 'den-const'] },
    });
  },

  A09: (rand) => {                                   // functions: composition & evaluation
    const a = rand.int(2, 6), b = rand.nonZero(-9, 9), c = rand.int(2, 5), x0 = rand.int(1, 5);
    const inner = c * x0;
    return OK(rand, Q(a * inner + b), [
      { name: 'composed-the-other-way-round', value: Q(c * (a * x0 + b)), cost: 3 },
      { name: 'evaluated-f-at-x-not-at-g', value: Q(a * x0 + b), cost: 2 },
      { name: 'multiplied-the-outputs', value: Q((a * x0 + b) * inner), cost: 3 },
    ], {
      family: 'A09', construct: 'evaluate-composition',
      stem: `If $f(x) = ${coef(a, 'x')} ${term(b, '')}$ and $g(x) = ${coef(c, 'x')}$, what is the value of $f(g(${x0}))$?`,
      mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: { ctx: 'function-pair no-stimulus', chain: ['evaluate-inner-then-outer'], target: 'value:composition',
        options: 'composition-order', distract: ['D2', 'D1', 'D3'], narrative: 'symbols-only:2', numeric: ['f-coeff', 'f-const', 'g-coeff', 'point'] },
    });
  },

  A10: (rand) => {                                   // exponents, radicals & complex
    const b = rand.pick([2, 3, 5]), p = rand.int(4, 9), q = rand.int(1, 3);
    return OK(rand, Q(p - q), [
      { name: 'added-the-exponents', value: Q(p + q), cost: 1 },
      { name: 'divided-the-exponents', value: Q(p, q), cost: 1 },
      { name: 'subtracted-the-wrong-way', value: Q(q - p), cost: 1 },
    ], {
      family: 'A10', construct: 'exponent-quotient',
      stem: `If $\\dfrac{${b}^{${p}}}{${b}^{${q}}} = ${b}^{k}$, what is the value of $k$?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'pure-algebraic no-stimulus', chain: ['apply-quotient-law'], target: 'value:exponent',
        options: 'exponent-law-slips', distract: ['D3', 'D3', 'D3'], narrative: 'symbols-only:1', numeric: ['base', 'exp-p', 'exp-q'] },
    });
  },

  A11: (rand) => {                                   // growth & variation
    const start = rand.int(2, 9) * 100, factor = rand.pick([2, 3]), periods = rand.int(2, 4);
    return OK(rand, Q(start * factor ** periods), [
      { name: 'multiplied-instead-of-compounding', value: Q(start * factor * periods), cost: 2 },
      { name: 'used-one-period-too-few', value: Q(start * factor ** (periods - 1)), cost: 2 },
      { name: 'used-one-period-too-many', value: Q(start * factor ** (periods + 1)), cost: 2 },
    ], {
      family: 'A11', construct: 'compound-growth',
      stem: `A culture starts with ${start} cells and the number of cells multiplies by ${factor} every hour. ` +
            `How many cells are there after ${periods} hours?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'exponential-growth no-stimulus', chain: ['apply-growth-factor-repeatedly'], target: 'value:count',
        options: 'growth-confusions', distract: ['D2', 'D6', 'D2'], narrative: 'single-population', numeric: ['start', 'factor', 'periods'] },
    });
  },

  A12: (rand) => {                                   // proportional reasoning: rate & cost
    const units = rand.int(3, 9), cost = units * rand.int(2, 9), want = rand.int(2, 9) * units;
    return OK(rand, Q(cost * want / units), [
      { name: 'multiplied-by-the-unit-count', value: Q(cost * units), cost: 2 },
      { name: 'used-the-total-not-the-rate', value: Q(cost + want), cost: 1 },
      { name: 'inverted-the-rate', value: Q(units * want, cost), cost: 2 },
    ], {
      family: 'A12', construct: 'unit-rate-scale-up',
      stem: `${units} identical parts cost $\\$${cost}$. At the same rate, what is the cost of ${want} parts?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'unit-rate no-stimulus', chain: ['find-unit-rate', 'scale'], target: 'value:cost',
        options: 'rate-slips', distract: ['D2', 'D1', 'D6'], narrative: 'single-good', numeric: ['units', 'cost', 'wanted'] },
    });
  },

  A12b: (rand) => {                                  // percentages: share of a population
    const total = rand.int(2, 9) * 100, pct = rand.pick([10, 15, 20, 25, 30, 40]);
    const key = Q(total * pct, 100);
    if (!qIsInt(key)) return { error: 'the share is not a whole count' };
    return OK(rand, key, [
      { name: 'took-the-complement', value: qSub(Q(total), key), cost: 2 },
      { name: 'read-the-percentage-as-a-count', value: Q(pct), cost: 1 },
      { name: 'moved-the-decimal-one-place', value: qDiv(key, Q(10)), cost: 1 },
    ], {
      family: 'A12b', construct: 'percentage-of-total',
      stem: `A school has ${total} students, and ${pct}\\% of them take art. How many students take art?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'population-share no-stimulus', chain: ['apply-percentage'], target: 'value:count',
        options: 'percentage-slips', distract: ['D5', 'D6', 'D6'], narrative: 'single-population', numeric: ['total', 'pct'] },
    });
  },

  A18: (rand) => {                                   // number properties & logic
    const n = rand.int(3, 9), k = rand.int(2, 6);
    // Terms are n, 2n, 3n, ...; the (k+1)th is (k+1)n. The two off-by-one slips
    // sit either side of it, and the third reads the index as an addend.
    const key = Q(n * (k + 1));
    return OK(rand, key, [
      { name: 'off-by-one-low', value: Q(n * k), cost: 1 },
      { name: 'off-by-one-high', value: Q(n * (k + 2)), cost: 1 },
      { name: 'added-the-index-instead-of-multiplying', value: Q(n + k + 1), cost: 1 },
    ], {
      family: 'A18', construct: 'arithmetic-sequence-total',
      stem: `A sequence begins at ${n} and increases by ${n} each term. What is the value of the ${k + 1}th term?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'sequence no-stimulus', chain: ['index-arithmetic-sequence'], target: 'value:term',
        options: 'off-by-one', distract: ['D1', 'D6', 'D3'], narrative: 'single-sequence', numeric: ['start', 'index'] },
    });
  },
};

/* ────────────────────────── stimulus-bearing routine constructs ────────────────────────── */
//
// The three DAP families read a display. They are the only routine constructs
// that emit a stimulus, and they are why the blueprint's shared-stimulus sets
// were unfillable before Stage 2.5.

const STIMULUS_CONSTRUCTS = {

  A13: (rand) => {                                   // data: read a display
    const cats = ['Mon', 'Tue', 'Wed', 'Thu'];
    const vals = cats.map(() => rand.int(2, 9) * 5);
    const i = rand.int(0, 3), j = (i + 1 + rand.int(0, 2)) % 4;
    if (vals[i] === vals[j]) return { error: 'the two bars are equal — nothing to compare' };
    const key = Q(Math.abs(vals[i] - vals[j]));
    return OK(rand, key, [
      { name: 'added-the-two-bars', value: Q(vals[i] + vals[j]), cost: 1 },
      { name: 'read-one-bar-only', value: Q(Math.max(vals[i], vals[j])), cost: 1 },
      { name: 'used-the-wrong-pair', value: Q(Math.abs(vals[i] - vals[(j + 1) % 4])), cost: 2 },
    ], {
      family: 'A13', construct: 'read-bar-difference',
      stimulus: { kind: 'bar-chart', title: 'Items sold', categories: cats, values: vals, sharable: true },
      stem: `The bar chart shows the number of items sold on four days. How many more items were sold on ${cats[Math.max(i, j) === i ? i : j]} than on ${cats[Math.max(i, j) === i ? j : i]}?`,
      mechanism: { repr_switch: 2 },
      fingerprintParts: { ctx: 'stimulus:bar-chart shared', chain: ['read-two-bars', 'difference'], target: 'value:difference',
        options: 'display-slips', distract: ['D3', 'D1', 'D5'], narrative: 'four-category-display', numeric: ['bar-values'] },
    });
  },

  A14: (rand) => {                                   // statistics: summarise a data set
    const n = 5;
    const data = Array.from({ length: n }, () => rand.int(1, 20)).sort((a, b) => a - b);
    const sum = data.reduce((a, b) => a + b, 0);
    if (sum % n !== 0) return { error: 'the mean is not a whole number at this level' };
    return OK(rand, Q(sum / n), [
      { name: 'reported-the-median', value: Q(data[2]), cost: 1 },
      { name: 'reported-the-range', value: Q(data[n - 1] - data[0]), cost: 1 },
      { name: 'divided-by-one-fewer', value: Q(sum, n - 1), cost: 2 },
    ], {
      family: 'A14', construct: 'mean-of-a-list',
      stimulus: { kind: 'data-list', title: 'Recorded values', values: data, sharable: true },
      stem: `The list shows five recorded values. What is their mean?`,
      mechanism: { repr_switch: 1 },
      fingerprintParts: { ctx: 'stimulus:data-list shared', chain: ['sum-then-divide'], target: 'value:mean',
        options: 'summary-statistic-confusions', distract: ['D1', 'D1', 'D6'], narrative: 'five-value-list', numeric: ['values'] },
    });
  },

  A15: (rand) => {                                   // probability & counting
    const a = rand.int(2, 9), b = rand.int(2, 9), c = rand.int(2, 9);
    const total = a + b + c;
    return OK(rand, Q(a, total), [
      { name: 'used-the-wrong-category', value: Q(b, total), cost: 1 },
      { name: 'divided-by-the-other-categories', value: Q(a, b + c), cost: 2 },
      { name: 'took-the-complement', value: Q(b + c, total), cost: 2 },
    ], {
      family: 'A15', construct: 'single-category-probability',
      stimulus: { kind: 'table', title: 'Counts by colour', rows: [['Red', a], ['Blue', b], ['Green', c]], sharable: true },
      stem: `The table shows the number of counters of each colour in a bag. If one counter is chosen at random, what is the probability that it is red?`,
      mechanism: { repr_switch: 1, filtering: 1 },
      fingerprintParts: { ctx: 'stimulus:table shared', chain: ['read-counts', 'form-ratio'], target: 'value:probability',
        options: 'ratio-referent-slips', distract: ['D5', 'D6', 'D5'], narrative: 'three-category-table', numeric: ['counts'] },
    });
  },

  A16: (rand) => {                                   // geometry: angles & triangles
    const a = rand.int(25, 80), b = rand.int(25, 80);
    if (a + b >= 175) return { error: 'the two given angles leave no third angle' };
    return OK(rand, Q(180 - a - b), [
      { name: 'subtracted-from-90', value: Q(90 - a), cost: 1 },
      { name: 'added-the-two-given', value: Q(a + b), cost: 1 },
      { name: 'subtracted-only-one', value: Q(180 - a), cost: 1 },
    ], {
      family: 'A16', construct: 'triangle-angle-sum',
      stem: `In a triangle, two of the angles measure $${a}^\\circ$ and $${b}^\\circ$. What is the measure of the third angle?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'triangle-no-figure', chain: ['angle-sum-180'], target: 'value:angle',
        options: 'angle-slips', distract: ['D3', 'D1', 'D6'], narrative: 'named-triangle', numeric: ['angle-a', 'angle-b'] },
    });
  },

  A17: (rand) => {                                   // geometry: circles, area & solids
    const r = rand.int(2, 12);
    return OK(rand, Q(2 * r), [
      { name: 'reported-the-radius', value: Q(r), cost: 1 },
      { name: 'reported-the-area-coefficient', value: Q(r * r), cost: 1 },
      { name: 'reported-the-circumference-coefficient', value: Q(4 * r), cost: 2 },
    ], {
      family: 'A17', construct: 'circle-diameter-from-area',
      stem: `A circle has area $${r * r}\\pi$ square centimetres. What is its diameter, in centimetres?`,
      mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: { ctx: 'circle-no-figure', chain: ['area-to-radius', 'radius-to-diameter'], target: 'value:length',
        options: 'radius-diameter-confusions', distract: ['D1', 'D1', 'D3'], narrative: 'single-circle', numeric: ['area-coeff'] },
    });
  },
};

/* ────────────────────────── further variants per family ──────────────────────────
   The Stage-2.5 dry run measured the real bottleneck: anti-clone permits one
   item per STRUCTURE, and the slot table asks for up to eight items from one
   family. With one construct per family the ceiling was 34 structures against
   50 slots. Everything below closes a named part of that 21-item shortfall, and
   nothing below exists for any other reason. */

const VARIANTS = {
  /* ── LONG BUT ROUTINE, added at Stage 3.5 ─────────────────────────────────
     The step-independence gate measured a Spearman r(steps, band) of +0.89
     against a reference range of +0.13 to +0.47: the generator's bands were
     almost perfectly predictable from operation count. The cause was not that
     its hard items are long — it is that its EASY items are short. Reference
     Entry items average 3.24 operations at the T3/T4 coding standard; the
     generator's averaged 1.3.

     The corpus is explicit that long-and-easy is a real EST shape and not a
     contradiction: T1 Q24 is a "fraction grind, no insight required", T3 Q16 is
     "7 arithmetic operations, zero reasoning", T3 Q4 is "4 operations, zero
     discovery". These three constructs are that shape. They are pure execution
     — nothing is discovered, nothing is disguised — and they are long. */

  A10: [(rand) => {                                 // fraction grind
    // Proper fractions only, drawn as such rather than drawn and rejected. A
    // real paper does not print 3/3, and a unit-valued term collapses a step
    // the item exists to ask for.
    const b = rand.pick([3, 4, 6]), d = rand.pick([2, 3, 4, 6]), f = rand.pick([2, 3, 5]);
    if (b === d) return { error: 'a common denominator removes the work' };
    const a = rand.int(1, b - 1), c = rand.int(1, d - 1), e = rand.int(1, f - 1);
    // ...and in lowest terms. 2/4 is not something a paper prints either.
    const gcd = (x, y) => (y ? gcd(y, x % y) : x);
    if (gcd(a, b) !== 1 || gcd(c, d) !== 1 || gcd(e, f) !== 1) return { error: 'a fraction is not in lowest terms' };
    const sum = qAdd(Q(a, b), Q(c, d));
    const key = qDiv(sum, Q(e, f));
    if (qEq(key, Q(0))) return { error: 'the quotient is zero' };
    const wrong1 = qMul(sum, Q(e, f));               // multiplied instead of inverting
    const wrong2 = qDiv(Q(a + c, b + d), Q(e, f));   // added numerators and denominators
    const wrong3 = sum;                              // stopped after the addition
    return OK(rand, key, [
      { name: 'multiplied-instead-of-inverting', value: wrong1, cost: 3 },
      { name: 'added-numerators-and-denominators', value: wrong2, cost: 3 },
      { name: 'stopped-after-the-addition', value: wrong3, cost: 2 },
    ], { family: 'A10', construct: 'fraction-grind',
      stem: `What is the value of $\\left(\\dfrac{${a}}{${b}} + \\dfrac{${c}}{${d}}\\right) \\div \\dfrac{${e}}{${f}}$?`,
      cost: 4,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'pure-arithmetic no-stimulus',
        chain: ['common-denominator', 'add-the-fractions', 'invert-the-divisor', 'multiply-and-simplify'],
        target: 'value:quotient', options: 'fraction-slips', distract: ['D3', 'D3', 'D1'],
        narrative: 'symbols-only:fractions', numeric: ['num-a', 'den-b', 'num-c', 'den-d', 'divisor'] } });
  }],

  A07: [(rand) => {                                 // expand two products and collect
    const a = rand.int(2, 5), b = rand.nonZero(-6, 6), c = rand.int(2, 5), d = rand.nonZero(-6, 6);
    const e = rand.int(1, 4), f = rand.nonZero(-6, 6), g = rand.int(1, 4), h = rand.nonZero(-6, 6);
    const q2 = a * c - e * g, q1 = a * d + b * c - (e * h + f * g), q0 = b * d - f * h;
    if (q2 === 0 || q1 === 0 || q0 === 0) return { error: 'a vanishing term removes a step' };
    // A zero coefficient anywhere in the OPTION SET prints as "+ 0", which no
    // paper does and which announces the option as generated.
    if (a * c + e * g === 0 || a * d + b * c + e * h + f * g === 0 || b * d + f * h === 0
        || a * d + b * c - e * h - f * g === 0) return { error: 'a distractor would print a zero term' };
    const texts = [
      `${coef(q2, 'x^2')} ${term(q1, 'x')} ${term(q0, '')}`,
      `${coef(a * c + e * g, 'x^2')} ${term(a * d + b * c + e * h + f * g, 'x')} ${term(b * d + f * h, '')}`,
      `${coef(q2, 'x^2')} ${term(a * d + b * c - e * h - f * g, 'x')} ${term(b * d + f * h, '')}`,
      `${coef(q2, 'x^2')} ${term(q1, 'x')} ${term(-q0, '')}`,
    ];
    if (new Set(texts).size !== 4) return { error: 'two options print identically' };
    return OK(rand, Q(0), [
      { name: 'added-the-two-products-instead-of-subtracting', value: Q(1), cost: 4 },
      { name: 'distributed-the-minus-over-the-first-term-only', value: Q(2), cost: 4 },
      { name: 'sign-slip-on-the-constant', value: Q(3), cost: 3 },
    ], { family: 'A07', construct: 'expand-and-collect',
      stem: `Which of the following is equivalent to ` +
            `$(${coef(a, 'x')} ${term(b, '')})(${coef(c, 'x')} ${term(d, '')}) - (${coef(e, 'x')} ${term(f, '')})(${coef(g, 'x')} ${term(h, '')})$?`,
      cost: 4,
      mechanism: { abstraction: 1, filtering: 1 },
      fingerprintParts: { ctx: 'polynomial no-stimulus',
        chain: ['expand-the-first-product', 'expand-the-second-product', 'distribute-the-subtraction', 'collect-like-terms'],
        target: 'selection:expression', options: 'expression-set', distract: ['D3', 'D2', 'D3'],
        narrative: 'symbols-only:difference-of-products', numeric: ['coeffs-first', 'coeffs-second'] } },
      v => texts[qNum(v)]);
  }],

  A12: [(rand) => {                                 // chained unit conversion
    const litresPerCubic = 1000;
    const cubic = rand.int(2, 9);
    const rate = rand.pick([200, 250, 400, 500]);
    const total = cubic * litresPerCubic;
    if (total % rate !== 0) return { error: 'the time is not a whole number of minutes' };
    const key = Q(total / rate);
    return OK(rand, key, [
      { name: 'rounded-the-volume-up-a-cubic-metre', value: Q((cubic + 1) * litresPerCubic, rate), cost: 3 },
      { name: 'used-a-hundred-litres-per-cubic-metre', value: Q(cubic * 100, rate), cost: 3 },
      { name: 'divided-the-rate-by-the-volume-in-cubic-metres', value: Q(rate, cubic), cost: 2 },
    ], { family: 'A12', construct: 'chained-unit-conversion',
      stem: `A tank holds $${cubic}$ cubic metres of water, and $1$ cubic metre is $${litresPerCubic}$ litres. ` +
            `A pump removes ${rate} litres each minute. How many minutes does the pump take to empty the full tank?`,
      cost: 3,
      mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: { ctx: 'unit-conversion no-stimulus',
        chain: ['convert-cubic-metres-to-litres', 'divide-by-the-rate', 'read-off-the-minutes'],
        target: 'value:time', options: 'conversion-slips', distract: ['D4', 'D3', 'D3'],
        narrative: 'tank-emptied-by-a-pump', numeric: ['volume', 'litres-per-cubic', 'rate'] } });
  }],

  A01: [(rand) => {                                  // rearrange a formula
    const a = rand.int(2, 9), b = rand.int(2, 9), c = rand.int(2, 9) * a * b;
    return OK(rand, Q(c, a * b), [
      { name: 'divided-by-one-factor-only', value: Q(c, a), cost: 1 },
      { name: 'multiplied-instead-of-dividing', value: Q(c * a), cost: 1 },
      { name: 'subtracted-the-coefficients', value: Q(c - a * b), cost: 1 },
    ], { family: 'A01', construct: 'solve-product-coefficient',
      stem: `If $${a}(${b}x) = ${c}$, what is the value of $x$?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'pure-algebraic no-stimulus', chain: ['unwrap-nested-coefficients'], target: 'value:x',
        options: 'factor-slips', distract: ['D3', 'D3', 'D1'], narrative: 'symbols-only:1', numeric: ['outer', 'inner', 'rhs'] } });
  }],

  A02: [(rand) => {                                  // translate a comparison
    const k = rand.int(2, 6), m = rand.int(3, 12);
    const opts = [`${k}n - ${m}`, `${k}n + ${m}`, `${m} - ${k}n`, `${k}(n - ${m})`];
    return OK(rand, Q(0), [
      { name: 'read-less-than-as-addition', value: Q(1), cost: 1 },
      { name: 'reversed-the-subtraction', value: Q(2), cost: 1 },
      { name: 'distributed-over-the-wrong-term', value: Q(3), cost: 1 },
    ], { family: 'A02', construct: 'translate-comparison',
      stem: `A number is ${m} less than ${k} times $n$. Which expression represents that number?`,
      mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: { ctx: 'verbal-translation no-stimulus', chain: ['translate-comparison'], target: 'selection:expression',
        options: 'expression-set', distract: ['D3', 'D3', 'D2'], narrative: 'single-quantity-comparison', numeric: ['multiplier', 'offset'] } },
      v => opts[qNum(v)]);
  }],

  A04: [(rand) => {                                  // compound inequality
    const lo = rand.int(2, 9), w = rand.int(3, 9), a = rand.int(2, 5);
    return OK(rand, Q(w + 1), [
      { name: 'counted-only-the-interior', value: Q(w - 1), cost: 2 },
      { name: 'counted-one-endpoint-only', value: Q(w), cost: 1 },
      { name: 'used-the-width-times-the-coefficient', value: Q(w * a), cost: 2 },
    ], { family: 'A04', construct: 'count-integer-solutions',
      stem: `How many integers $x$ satisfy $${lo} \\le x \\le ${lo + w}$?`,
      mechanism: { abstraction: 1, filtering: 1 },
      fingerprintParts: { ctx: 'pure-algebraic no-stimulus', chain: ['count-inclusive-range'], target: 'value:count',
        options: 'off-by-one', distract: ['D6', 'D6', 'D3'], narrative: 'symbols-only:1', numeric: ['low', 'width'] } });
  },
  (rand) => {                                        // inequality from a budget
    const fee = rand.int(2, 9) * 5, per = rand.int(2, 9), budget = fee + per * rand.int(4, 15);
    const key = Q(Math.floor((budget - fee) / per));
    return OK(rand, key, [
      { name: 'ignored-the-fee', value: Q(Math.floor(budget / per)), cost: 1 },
      { name: 'divided-the-fee-too', value: Q(Math.floor(budget / (per + fee))), cost: 2 },
      { name: 'subtracted-instead-of-dividing', value: Q(budget - fee - per), cost: 1 },
    ], { family: 'A04', construct: 'budget-inequality',
      stem: `A club charges a $\\$${fee}$ joining fee plus $\\$${per}$ per session. With $\\$${budget}$ to spend, what is the greatest number of sessions a member can attend?`,
      mechanism: { abstraction: 1, filtering: 1 },
      fingerprintParts: { ctx: 'budget-constraint no-stimulus', chain: ['subtract-fixed', 'divide-and-floor'], target: 'value:count',
        options: 'budget-slips', distract: ['D1', 'D2', 'D3'], narrative: 'single-entity-fee-rate', numeric: ['fee', 'rate', 'budget'] } });
  }],

  A05: [(rand) => {                                  // y-intercept from slope and a point
    const m = rand.nonZero(-5, 5), x0 = rand.nonZero(-7, 7), b = rand.nonZero(-12, 12);
    return OK(rand, Q(b), [
      { name: 'added-instead-of-subtracting', value: Q(b + 2 * m * x0), cost: 2 },
      { name: 'used-the-x-coordinate', value: Q(x0), cost: 1 },
      { name: 'used-the-y-coordinate', value: Q(m * x0 + b), cost: 1 },
    ], { family: 'A05', construct: 'intercept-from-point-and-slope',
      stem: `A line with slope $${m}$ passes through $(${x0}, ${m * x0 + b})$. What is its $y$-intercept?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'coordinate-plane no-stimulus', chain: ['substitute-into-point-slope'], target: 'value:intercept',
        options: 'coordinate-confusions', distract: ['D3', 'D1', 'D1'], narrative: 'point-and-slope', numeric: ['slope', 'point'] } });
  }],

  A06: [(rand) => {                                  // vertex of a parabola
    const h = rand.nonZero(-6, 6), k = rand.nonZero(-9, 9), a = rand.pick([1, 2, -1, -2]);
    return OK(rand, Q(h), [
      { name: 'sign-slip-on-the-vertex', value: Q(-h), cost: 1 },
      { name: 'reported-the-y-coordinate', value: Q(k), cost: 1 },
      { name: 'reported-the-leading-coefficient', value: Q(a * h), cost: 2 },
    ], { family: 'A06', construct: 'vertex-x-from-vertex-form',
      stem: `The graph of $y = ${coef(a, `(x ${signedConst(-h)})^2`)} ${term(k, '')}$ is a parabola. What is the $x$-coordinate of its vertex?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'parabola no-stimulus', chain: ['read-vertex-form'], target: 'value:vertex-x',
        options: 'vertex-confusions', distract: ['D3', 'D1', 'D3'], narrative: 'single-parabola', numeric: ['a', 'h', 'k'] } });
  },
  (rand) => {                                        // number of real solutions
    const a = rand.int(1, 3), b = rand.int(4, 9), c = rand.int(1, 4);
    const disc = b * b - 4 * a * c;
    if (disc <= 0) return { error: 'the discriminant is not positive at this level' };
    return OK(rand, Q(disc), [
      { name: 'omitted-the-4ac-factor-of-4', value: Q(b * b - a * c), cost: 1 },
      { name: 'added-instead-of-subtracting', value: Q(b * b + 4 * a * c), cost: 1 },
      { name: 'squared-the-wrong-coefficient', value: Q(a * a - 4 * b * c), cost: 2 },
    ], { family: 'A06', construct: 'discriminant',
      stem: `For the equation $${coef(a, 'x^2')} + ${b}x + ${c} = 0$, what is the value of $b^2 - 4ac$?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'pure-algebraic no-stimulus', chain: ['evaluate-discriminant'], target: 'value:discriminant',
        options: 'formula-slips', distract: ['D3', 'D3', 'D3'], narrative: 'symbols-only:1', numeric: ['a', 'b', 'c'] } });
  }],

  A08: [(rand) => {                                  // simplify a rational expression
    const a = rand.int(2, 9), b = rand.int(2, 9);
    if (a === b) return { error: 'the two factors coincide' };
    const x0 = rand.int(2, 6);
    if (x0 === b) return { error: 'the evaluation point is the excluded value' };
    return OK(rand, Q(x0 + a), [
      { name: 'kept-the-cancelled-factor', value: Q((x0 + a) * (x0 - b)), cost: 2 },
      { name: 'evaluated-the-denominator', value: Q(x0 - b), cost: 1 },
      { name: 'sign-slip-on-the-surviving-factor', value: Q(x0 - a), cost: 1 },
    ], { family: 'A08', construct: 'simplify-then-evaluate',
      stem: `For $x \\ne ${b}$, the expression $\\dfrac{(x ${signedConst(a)})(x ${signedConst(-b)})}{x ${signedConst(-b)}}$ simplifies. What is its value at $x = ${x0}$?`,
      mechanism: { abstraction: 1, filtering: 1 },
      fingerprintParts: { ctx: 'rational-expression no-stimulus', chain: ['cancel-common-factor', 'evaluate'], target: 'value:evaluation',
        options: 'cancellation-slips', distract: ['D7', 'D1', 'D3'], narrative: 'symbols-only:1', numeric: ['num-const', 'shared-const', 'point'] } });
  }],

  A09: [(rand) => {                                  // read an inverse value
    const a = rand.int(2, 6), b = rand.nonZero(-9, 9), y = rand.int(2, 9) * a + b;
    return OK(rand, Q(y - b, a), [
      { name: 'applied-f-instead-of-its-inverse', value: Q(a * y + b), cost: 1 },
      { name: 'added-the-constant', value: Q(y + b, a), cost: 1 },
      { name: 'forgot-to-divide', value: Q(y - b), cost: 1 },
    ], { family: 'A09', construct: 'inverse-value',
      stem: `If $f(x) = ${coef(a, 'x')} ${term(b, '')}$, for what value of $x$ does $f(x) = ${y}$?`,
      mechanism: { abstraction: 1, reversal: 1 },
      fingerprintParts: { ctx: 'single-function no-stimulus', chain: ['invert-linear-function'], target: 'value:preimage',
        options: 'inverse-slips', distract: ['D2', 'D3', 'D1'], narrative: 'symbols-only:1', numeric: ['coeff', 'const', 'output'] } });
  }],

  A14: [(rand) => {                                  // weighted total from a mean
    const n = rand.int(4, 9), mean = rand.int(3, 15);
    return OK(rand, Q(n * mean), [
      { name: 'reported-the-mean-again', value: Q(mean), cost: 1 },
      { name: 'used-one-fewer-value', value: Q((n - 1) * mean), cost: 1 },
      { name: 'divided-instead-of-multiplying', value: Q(mean, n), cost: 1 },
    ], { family: 'A14', construct: 'total-from-mean',
      stem: `The mean of ${n} numbers is ${mean}. What is their sum?`,
      mechanism: { abstraction: 1, reversal: 1 },
      fingerprintParts: { ctx: 'summary-statistic no-stimulus', chain: ['invert-the-mean'], target: 'value:sum',
        options: 'mean-inversion-slips', distract: ['D1', 'D6', 'D6'], narrative: 'single-list-summary', numeric: ['count', 'mean'] } });
  }],

  A09_second: [(rand) => {                                  // read a function from a table of values
    const a = rand.int(2, 6), b = rand.nonZero(-9, 9), x1 = rand.int(1, 4);
    return OK(rand, Q(a), [
      { name: 'reported-the-constant', value: Q(b), cost: 1 },
      { name: 'reported-a-single-output', value: Q(a * x1 + b), cost: 1 },
      { name: 'used-the-first-output-as-the-rate', value: Q(a + b), cost: 1 },
    ], { family: 'A09', construct: 'rate-of-change-from-values',
      stem: `A linear function $f$ satisfies $f(${x1}) = ${a * x1 + b}$ and $f(${x1 + 1}) = ${a * (x1 + 1) + b}$. ` +
            `By how much does $f(x)$ increase when $x$ increases by 1?`,
      mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: { ctx: 'single-function no-stimulus', chain: ['difference-of-outputs'], target: 'value:rate',
        options: 'output-vs-rate', distract: ['D1', 'D1', 'D3'], narrative: 'two-evaluations', numeric: ['slope', 'intercept', 'point'] } });
  }],

  A17: [(rand) => {                                  // volume of a rectangular solid
    const l = rand.int(2, 9), w = rand.int(2, 9), h = rand.int(2, 9);
    return OK(rand, Q(l * w * h), [
      { name: 'computed-the-surface-area', value: Q(2 * (l * w + w * h + l * h)), cost: 3 },
      { name: 'added-the-dimensions', value: Q(l + w + h), cost: 1 },
      { name: 'used-two-dimensions-only', value: Q(l * w), cost: 1 },
    ], { family: 'A17', construct: 'rectangular-solid-volume',
      stem: `A rectangular box measures ${l} cm by ${w} cm by ${h} cm. What is its volume, in cubic centimetres?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: { ctx: 'solid-no-figure', chain: ['multiply-three-dimensions'], target: 'value:volume',
        options: 'measure-confusions', distract: ['D2', 'D1', 'D1'], narrative: 'single-solid', numeric: ['length', 'width', 'height'] } });
  }],
};

/* ── display variants. A13 asks for EIGHT items from one family, which is the
   single largest part of the shortfall: eight slots against one construct. A
   real form's eight data items are eight different readings of a display, and
   these are those readings. ── */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu'];
const bars = rand => DAYS.map(() => rand.int(2, 9) * 5);

const DISPLAY_VARIANTS = {
  A13: [
    (rand) => { const v = bars(rand); const t = v.reduce((a, b) => a + b, 0);
      return OK(rand, Q(t), [
        { name: 'omitted-one-bar', value: Q(t - v[0]), cost: 1 },
        { name: 'averaged-instead-of-totalling', value: Q(t, 4), cost: 1 },
        { name: 'doubled-the-largest', value: Q(t + Math.max(...v)), cost: 2 },
      ], { family: 'A13', construct: 'read-bar-total',
        stimulus: { kind: 'bar-chart', title: 'Items sold', categories: DAYS, values: v, sharable: true },
        stem: `The bar chart shows the number of items sold on four days. What was the total number sold over the four days?`,
        mechanism: { repr_switch: 2 },
        fingerprintParts: { ctx: 'stimulus:bar-chart shared', chain: ['read-all-bars', 'total'], target: 'value:total',
          options: 'aggregation-slips', distract: ['D1', 'D2', 'D3'], narrative: 'four-category-display', numeric: ['bar-values'] } }); },

    (rand) => { const v = bars(rand); const mx = Math.max(...v), mn = Math.min(...v);
      if (mx === mn) return { error: 'every bar is equal' };
      return OK(rand, Q(DAYS[v.indexOf(mx)] === undefined ? 0 : v.indexOf(mx)), [
        { name: 'read-the-shortest-bar', value: Q(v.indexOf(mn)), cost: 1 },
        { name: 'read-the-second-tallest', value: Q(v.indexOf([...v].sort((a, b) => b - a)[1])), cost: 2 },
        { name: 'read-the-last-category', value: Q(3), cost: 1 },
      ], { family: 'A13', construct: 'read-bar-argmax',
        stimulus: { kind: 'bar-chart', title: 'Items sold', categories: DAYS, values: v, sharable: true },
        stem: `The bar chart shows the number of items sold on four days. On which day were the most items sold?`,
        mechanism: { repr_switch: 2 },
        fingerprintParts: { ctx: 'stimulus:bar-chart shared', chain: ['compare-all-bars'], target: 'selection:category',
          options: 'category-set', distract: ['D5', 'D5', 'D5'], narrative: 'four-category-display', numeric: ['bar-values'] } },
        val => DAYS[qNum(val)]); },

    (rand) => { const start = rand.int(2, 9) * 10, step = rand.int(2, 9) * 5, n = rand.int(3, 5);
      return OK(rand, Q(step), [
        { name: 'read-the-total-change', value: Q(step * (n - 1)), cost: 1 },
        { name: 'read-the-starting-value', value: Q(start), cost: 1 },
        { name: 'divided-by-the-number-of-points', value: Q(step * (n - 1), n), cost: 2 },
      ], { family: 'A13', construct: 'read-line-graph-rate',
        stimulus: { kind: 'line-graph', title: 'Readings by hour', start, step, points: n, sharable: true },
        stem: `The line graph shows a reading taken each hour for ${n} hours. By how much does the reading increase each hour?`,
        mechanism: { repr_switch: 2 },
        fingerprintParts: { ctx: 'stimulus:line-graph shared', chain: ['read-two-points', 'per-unit-rate'], target: 'value:rate',
          options: 'rate-vs-total', distract: ['D1', 'D1', 'D6'], narrative: 'time-series-display', numeric: ['start', 'step', 'points'] } }); },

    (rand) => { const rows = ['North', 'South', 'East'].map(r => [r, rand.int(2, 9) * 4]);
      const t = rows.reduce((a, r) => a + r[1], 0), i = rand.int(0, 2);
      return OK(rand, Q(rows[i][1]), [
        { name: 'read-the-adjacent-row', value: Q(rows[(i + 1) % 3][1]), cost: 1 },
        { name: 'read-the-total', value: Q(t), cost: 1 },
        { name: 'read-the-complement', value: Q(t - rows[i][1]), cost: 2 },
      ], { family: 'A13', construct: 'read-table-cell',
        stimulus: { kind: 'table', title: 'Deliveries by region', rows, sharable: true },
        stem: `The table shows deliveries by region. How many deliveries were made in the ${rows[i][0]} region?`,
        mechanism: { repr_switch: 2 },
        fingerprintParts: { ctx: 'stimulus:table shared', chain: ['locate-row', 'read-value'], target: 'value:cell',
          options: 'row-confusions', distract: ['D5', 'D1', 'D5'], narrative: 'three-region-table', numeric: ['row-values'] } }); },

    (rand) => { const a = rand.int(2, 9) * 3, b = rand.int(2, 9) * 3;
      if (a === b) return { error: 'the two rows are equal' };
      return OK(rand, Q(a, b), [
        { name: 'inverted-the-ratio', value: Q(b, a), cost: 1 },
        { name: 'used-the-difference', value: Q(Math.abs(a - b)), cost: 1 },
        { name: 'used-the-total-as-the-referent', value: Q(a, a + b), cost: 2 },
      ], { family: 'A13', construct: 'read-table-ratio',
        stimulus: { kind: 'table', title: 'Counts by shift', rows: [['Day', a], ['Night', b]], sharable: true },
        stem: `The table shows counts for two shifts. What is the ratio of the day count to the night count?`,
        mechanism: { repr_switch: 2 },
        fingerprintParts: { ctx: 'stimulus:table shared', chain: ['read-two-rows', 'form-ratio'], target: 'value:ratio',
          options: 'ratio-referent-slips', distract: ['D6', 'D3', 'D5'], narrative: 'two-shift-table', numeric: ['row-values'] } }); },

    (rand) => { const t = rand.int(2, 9) * 20, pct = rand.pick([10, 20, 25, 40]);
      const key = Q(t * pct, 100);
      if (!qIsInt(key)) return { error: 'the slice is not a whole count' };
      return OK(rand, key, [
        { name: 'read-the-percentage-as-a-count', value: Q(pct), cost: 1 },
        { name: 'took-the-complement', value: qSub(Q(t), key), cost: 2 },
        { name: 'used-the-total', value: Q(t), cost: 1 },
      ], { family: 'A13', construct: 'read-pie-slice',
        stimulus: { kind: 'pie-chart', title: 'Share of responses', total: t, slicePct: pct, sharable: true },
        stem: `The pie chart shows how ${t} responses were divided. How many responses fall in the ${pct}\% slice?`,
        mechanism: { repr_switch: 2 },
        fingerprintParts: { ctx: 'stimulus:pie-chart shared', chain: ['read-slice-share', 'apply-to-total'], target: 'value:count',
          options: 'share-slips', distract: ['D6', 'D5', 'D1'], narrative: 'single-pie-display', numeric: ['total', 'slice-pct'] } }); },

    (rand) => { const bins = [rand.int(2, 8), rand.int(2, 8), rand.int(2, 8), rand.int(2, 8)];
      const t = bins.reduce((a, b) => a + b, 0), cut = 2;
      const key = Q(bins[2] + bins[3]);
      return OK(rand, key, [
        { name: 'counted-the-wrong-side', value: Q(bins[0] + bins[1]), cost: 1 },
        { name: 'counted-one-bin-only', value: Q(bins[2]), cost: 1 },
        { name: 'counted-every-bin', value: Q(t), cost: 1 },
      ], { family: 'A13', construct: 'read-histogram-tail',
        stimulus: { kind: 'histogram', title: 'Scores by band', bins, binWidth: 10, sharable: true },
        stem: `The histogram shows scores grouped into four bands of equal width. How many scores fall in the top two bands?`,
        mechanism: { repr_switch: 2, filtering: 1 },
        fingerprintParts: { ctx: 'stimulus:histogram shared', chain: ['select-bins', 'total'], target: 'value:count',
          options: 'bin-selection-slips', distract: ['D5', 'D1', 'D1'], narrative: 'four-bin-display', numeric: ['bin-counts'] } }); },
  ],

  A14: [
    (rand) => { const d = Array.from({ length: 5 }, () => rand.int(1, 20)).sort((a, b) => a - b);
      if (new Set(d).size < 5) return { error: 'repeated values make the median ambiguous to read' };
      return OK(rand, Q(d[2]), [
        { name: 'reported-the-mean', value: Q(d.reduce((a, b) => a + b, 0), 5), cost: 2 },
        { name: 'reported-the-middle-of-the-range', value: Q(d[0] + d[4], 2), cost: 2 },
        { name: 'reported-the-third-value-unsorted', value: Q(d[1]), cost: 1 },
      ], { family: 'A14', construct: 'median-of-a-list',
        stimulus: { kind: 'data-list', title: 'Recorded values', values: d, sharable: true },
        stem: `The list shows five recorded values. What is their median?`,
        mechanism: { repr_switch: 1 },
        fingerprintParts: { ctx: 'stimulus:data-list shared', chain: ['order-then-select-middle'], target: 'value:median',
          options: 'summary-statistic-confusions', distract: ['D1', 'D3', 'D6'], narrative: 'five-value-list', numeric: ['values'] } }); },

    (rand) => { const d = Array.from({ length: 5 }, () => rand.int(1, 20)).sort((a, b) => a - b);
      if (d[4] === d[0]) return { error: 'the range is zero' };
      return OK(rand, Q(d[4] - d[0]), [
        { name: 'reported-the-largest', value: Q(d[4]), cost: 1 },
        { name: 'reported-the-sum-of-the-extremes', value: Q(d[4] + d[0]), cost: 1 },
        { name: 'reported-the-interquartile-span', value: Q(d[3] - d[1]), cost: 2 },
      ], { family: 'A14', construct: 'range-of-a-list',
        stimulus: { kind: 'data-list', title: 'Recorded values', values: d, sharable: true },
        stem: `The list shows five recorded values. What is their range?`,
        mechanism: { repr_switch: 1 },
        fingerprintParts: { ctx: 'stimulus:data-list shared', chain: ['identify-extremes', 'difference'], target: 'value:range',
          options: 'extreme-confusions', distract: ['D1', 'D3', 'D5'], narrative: 'five-value-list', numeric: ['values'] } }); },
  ],

  A15: [
    (rand) => { const a = rand.int(2, 9), b = rand.int(2, 9), c = rand.int(2, 9), d = rand.int(2, 9);
      const rowT = a + b;
      return OK(rand, Q(a, rowT), [
        { name: 'divided-by-the-grand-total', value: Q(a, a + b + c + d), cost: 2 },
        { name: 'used-the-column-total', value: Q(a, a + c), cost: 2 },
        { name: 'used-the-other-cell-in-the-row', value: Q(b, rowT), cost: 1 },
      ], { family: 'A15', construct: 'conditional-from-two-way-table',
        stimulus: { kind: 'two-way-table', title: 'Responses by group', cells: [[a, b], [c, d]], sharable: true },
        stem: `The table shows responses by group. Among the members of the first group, what fraction answered yes?`,
        mechanism: { repr_switch: 1, filtering: 2 },
        fingerprintParts: { ctx: 'stimulus:two-way-table shared', chain: ['select-row', 'form-conditional-ratio'], target: 'value:probability',
          options: 'referent-slips', distract: ['D5', 'D5', 'D5'], narrative: 'two-by-two-table', numeric: ['cells'] } }); },

    (rand) => { const n = rand.int(3, 6), k = rand.int(2, 3);
      const perm = Array.from({ length: k }, (_, i) => n - i).reduce((a, b) => a * b, 1);
      const comb = perm / Array.from({ length: k }, (_, i) => i + 1).reduce((a, b) => a * b, 1);
      if (!Number.isInteger(comb) || comb === perm) return { error: 'the two counts coincide' };
      return OK(rand, Q(comb), [
        { name: 'counted-ordered-selections', value: Q(perm), cost: 2 },
        { name: 'multiplied-the-two-numbers', value: Q(n * k), cost: 1 },
        { name: 'used-n-choose-one', value: Q(n), cost: 1 },
      ], { family: 'A15', construct: 'unordered-selection-count',
        stem: `In how many ways can ${k} items be chosen from ${n} distinct items, if the order of choice does not matter?`,
        mechanism: { abstraction: 1 },
        fingerprintParts: { ctx: 'counting no-stimulus', chain: ['choose-unordered'], target: 'value:count',
          options: 'ordered-vs-unordered', distract: ['D2', 'D3', 'D1'], narrative: 'single-selection', numeric: ['n', 'k'] } }); },
  ],
};

// A duplicate object key silently overwrites the earlier one, and it did: a
// second `A09:` entry replaced the first, leaving that family one structure
// short of its three slots. Merged explicitly instead.
VARIANTS.A09.push(...VARIANTS.A09_second); delete VARIANTS.A09_second;

for (const [fam, list] of Object.entries(DISPLAY_VARIANTS)) (VARIANTS[fam] ||= []).push(...list);

/**
 * Every construct available for a family — the base one plus its variants.
 * Anti-clone permits one item per STRUCTURE, so the number of constructs a
 * family has IS the number of slots it can fill. That is the measurement the
 * Stage-2.5 bottleneck table reports, and it is why the variants exist.
 */
const BASE = { ...CONSTRUCTS, ...STIMULUS_CONSTRUCTS };
/* ────────────────────────── shared-stimulus reading ──────────────────────────
   A declared stimulus SET is several questions about ONE display. Constructs
   that each build their own display cannot form a set, and the assembler
   measured that directly: four A13 slots went unfilled because slots 7 and 8
   needed a second and third question about slot 6's chart and every construct
   insisted on its own.

   So a display is generated once, by kind, and the readers below take it as an
   argument. A set needs as many readers of that kind as it has slots. ── */

export const STIMULUS_KINDS = {
  'bar-chart': rand => ({ kind: 'bar-chart', title: 'Items sold', categories: DAYS, values: bars(rand), sharable: true }),
  'data-list': rand => {
    const values = Array.from({ length: 5 }, () => rand.int(1, 20)).sort((a, b) => a - b);
    return { kind: 'data-list', title: 'Recorded values', values, sharable: true };
  },
  'table': rand => ({ kind: 'table', title: 'Deliveries by region',
    rows: ['North', 'South', 'East'].map(r => [r, rand.int(2, 9) * 4]), sharable: true }),
};

/** Readers, by display kind then family. Each takes the SHARED display. */
export const READERS = {
  'bar-chart': {
    A13: [
      { name: 'bar-difference', read: (rand, st) => {
        const v = st.values, i = rand.int(0, 3), j = (i + 1 + rand.int(0, 2)) % 4;
        if (v[i] === v[j]) return { error: 'the two bars are equal' };
        const [hi, lo] = v[i] > v[j] ? [i, j] : [j, i];
        return OK(rand, Q(v[hi] - v[lo]), [
          { name: 'added-the-two-bars', value: Q(v[i] + v[j]), cost: 1 },
          { name: 'read-one-bar-only', value: Q(v[hi]), cost: 1 },
          { name: 'used-the-wrong-pair', value: Q(Math.abs(v[hi] - v[(lo + 1) % 4])), cost: 2 },
        ], { family: 'A13', construct: 'read-bar-difference', stimulus: st,
          stem: `The bar chart shows the number of items sold on four days. How many more items were sold on ${DAYS[hi]} than on ${DAYS[lo]}?`,
          mechanism: { repr_switch: 2, filtering: 1 },
          fingerprintParts: { ctx: 'stimulus:bar-chart shared', chain: ['read-two-bars', 'difference'], target: 'value:difference',
            options: 'display-slips', distract: ['D3', 'D1', 'D5'], narrative: 'four-category-display', numeric: ['bar-values'] } }); } },

      { name: 'bar-total', read: (rand, st) => {
        const v = st.values, t = v.reduce((a, b) => a + b, 0);
        return OK(rand, Q(t), [
          { name: 'omitted-one-bar', value: Q(t - v[0]), cost: 1 },
          { name: 'averaged-instead-of-totalling', value: Q(t, 4), cost: 1 },
          { name: 'doubled-the-largest', value: Q(t + Math.max(...v)), cost: 2 },
        ], { family: 'A13', construct: 'read-bar-total', stimulus: st,
          stem: `The bar chart shows the number of items sold on four days. What was the total number sold over the four days?`,
          mechanism: { repr_switch: 2, abstraction: 1 },
          fingerprintParts: { ctx: 'stimulus:bar-chart shared', chain: ['read-all-bars', 'total'], target: 'value:total',
            options: 'aggregation-slips', distract: ['D1', 'D2', 'D3'], narrative: 'four-category-display', numeric: ['bar-values'] } }); } },

      { name: 'bar-argmax', read: (rand, st) => {
        const v = st.values, mx = Math.max(...v), mn = Math.min(...v);
        if (mx === mn || v.filter(x => x === mx).length > 1) return { error: 'the tallest bar is not unique' };
        const second = [...v].sort((a, b) => b - a)[1];
        return OK(rand, Q(v.indexOf(mx)), [
          { name: 'read-the-shortest-bar', value: Q(v.indexOf(mn)), cost: 1 },
          { name: 'read-the-second-tallest', value: Q(v.indexOf(second)), cost: 2 },
          { name: 'read-the-last-category', value: Q(3), cost: 1 },
        ], { family: 'A13', construct: 'read-bar-argmax', stimulus: st,
          stem: `The bar chart shows the number of items sold on four days. On which day were the most items sold?`,
          mechanism: { repr_switch: 2 },
          fingerprintParts: { ctx: 'stimulus:bar-chart shared', chain: ['compare-all-bars'], target: 'selection:category',
            options: 'category-set', distract: ['D5', 'D5', 'D5'], narrative: 'four-category-display', numeric: ['bar-values'] } },
          val => DAYS[qNum(val)]); } },

      // A LONG routine reading. The reference's chart blocks are not uniformly
      // one-step: T4 Q11 "chains the hundreds conversion with a percentage" and
      // T3 Q16 is "7 arithmetic operations, zero reasoning". Every reader here
      // was one or two operations, which left the generated Entry band spanning
      // 1 to 2 steps while the reference's spans 1 to 7 — so band membership
      // became predictable from length alone.
      { name: 'bar-percent-change', read: (rand, st) => {
        const v = st.values, i = 0, j = 3;
        if (v[i] === v[j] || v[i] === 0) return { error: 'the two bars do not change' };
        const pct = Q((v[j] - v[i]) * 100, v[i]);
        if (!qIsInt(pct)) return { error: 'the percentage is not a whole number' };
        return OK(rand, pct, [
          { name: 'divided-by-the-later-value', value: Q((v[j] - v[i]) * 100, v[j]), cost: 3 },
          { name: 'reported-the-ratio-as-a-percentage', value: Q(v[j] * 100, v[i]), cost: 2 },
          { name: 'reported-the-raw-difference', value: Q(v[j] - v[i]), cost: 1 },
        ], { family: 'A13', construct: 'read-bar-percent-change', stimulus: st,
          cost: 3,
          stem: `The bar chart shows the number of items sold on four days. By what percentage did the number sold change from ${DAYS[i]} to ${DAYS[j]}?`,
          mechanism: { repr_switch: 2, abstraction: 1 },
          fingerprintParts: { ctx: 'stimulus:bar-chart shared',
            chain: ['read-two-bars', 'find-the-difference', 'divide-by-the-base-and-convert'],
            target: 'value:percent-change', options: 'percentage-slips', distract: ['D2', 'D3', 'D1'],
            narrative: 'four-category-display', numeric: ['bar-values'] } }); } },

      { name: 'bar-above-threshold', read: (rand, st) => {
        const v = st.values, cut = Math.min(...v) + 5;
        const above = v.filter(x => x > cut).length;
        if (!above || above === 4) return { error: 'the threshold separates nothing' };
        return OK(rand, Q(above), [
          { name: 'counted-at-or-above', value: Q(v.filter(x => x >= cut).length + 1), cost: 1 },
          { name: 'counted-below-instead', value: Q(4 - above), cost: 1 },
          { name: 'summed-the-qualifying-bars', value: Q(v.filter(x => x > cut).reduce((a, b) => a + b, 0)), cost: 2 },
        ], { family: 'A13', construct: 'read-bar-count-above', stimulus: st,
          stem: `The bar chart shows the number of items sold on four days. On how many of the days were more than ${cut} items sold?`,
          mechanism: { repr_switch: 2, filtering: 1 },
          fingerprintParts: { ctx: 'stimulus:bar-chart shared', chain: ['apply-threshold', 'count-categories'], target: 'value:count',
            options: 'threshold-slips', distract: ['D6', 'D5', 'D2'], narrative: 'four-category-display', numeric: ['bar-values', 'threshold'] } }); } },
    ],
    A14: [
      { name: 'bar-mean', read: (rand, st) => {
        const v = st.values, t = v.reduce((a, b) => a + b, 0);
        if (t % v.length !== 0) return { error: 'the mean is not a whole number at this level' };
        return OK(rand, Q(t / v.length), [
          { name: 'reported-the-total', value: Q(t), cost: 1 },
          { name: 'divided-by-one-fewer', value: Q(t, v.length - 1), cost: 2 },
          { name: 'reported-the-midrange', value: Q(Math.max(...v) + Math.min(...v), 2), cost: 2 },
        ], { family: 'A14', construct: 'mean-of-a-chart', stimulus: st,
          stem: `The bar chart shows the number of items sold on four days. What is the mean number sold per day?`,
          mechanism: { repr_switch: 1, abstraction: 1 },
          fingerprintParts: { ctx: 'stimulus:bar-chart shared', chain: ['total-then-divide'], target: 'value:mean',
            options: 'summary-statistic-confusions', distract: ['D1', 'D6', 'D3'], narrative: 'four-category-display', numeric: ['bar-values'] } }); } },
    ],
  },

  'data-list': {
    A13: [
      { name: 'list-count-above', read: (rand, st) => {
        const v = st.values, cut = v[2];
        const above = v.filter(x => x > cut).length;
        if (!above) return { error: 'no value lies above the middle one' };
        return OK(rand, Q(above), [
          { name: 'counted-at-or-above', value: Q(above + 1), cost: 1 },
          { name: 'counted-the-other-side', value: Q(v.filter(x => x < cut).length), cost: 1 },
          { name: 'counted-every-value', value: Q(v.length), cost: 1 },
        ], { family: 'A13', construct: 'read-list-count-above', stimulus: st,
          stem: `The list shows five recorded values. How many of them are greater than ${cut}?`,
          mechanism: { repr_switch: 2, filtering: 1 },
          fingerprintParts: { ctx: 'stimulus:data-list shared', chain: ['apply-threshold', 'count'], target: 'value:count',
            options: 'boundary-slips', distract: ['D6', 'D5', 'D1'], narrative: 'five-value-list', numeric: ['values'] } }); } },
      { name: 'list-spread-of-extremes', read: (rand, st) => {
        const v = st.values;
        if (v[4] === v[0]) return { error: 'the extremes coincide' };
        return OK(rand, Q(v[4] + v[0]), [
          { name: 'took-the-difference-instead', value: Q(v[4] - v[0]), cost: 1 },
          { name: 'summed-the-two-middle-values', value: Q(v[1] + v[3]), cost: 1 },
          { name: 'doubled-the-largest', value: Q(2 * v[4]), cost: 1 },
        ], { family: 'A13', construct: 'read-list-extremes-sum', stimulus: st,
          stem: `The list shows five recorded values. What is the sum of the greatest and the least of them?`,
          mechanism: { repr_switch: 2 },
          fingerprintParts: { ctx: 'stimulus:data-list shared', chain: ['identify-extremes', 'sum'], target: 'value:sum',
            options: 'extreme-confusions', distract: ['D3', 'D5', 'D1'], narrative: 'five-value-list', numeric: ['values'] } }); } },

      { name: 'list-second-largest', read: (rand, st) => {
        const v = st.values;
        if (new Set(v).size < 5) return { error: 'repeated values make the ordering ambiguous' };
        return OK(rand, Q(v[3]), [
          { name: 'reported-the-largest', value: Q(v[4]), cost: 1 },
          { name: 'reported-the-second-smallest', value: Q(v[1]), cost: 1 },
          { name: 'reported-the-middle-value', value: Q(v[2]), cost: 1 },
        ], { family: 'A13', construct: 'read-list-second-largest', stimulus: st,
          stem: `The list shows five recorded values. What is the second greatest of them?`,
          mechanism: { repr_switch: 2 },
          fingerprintParts: { ctx: 'stimulus:data-list shared', chain: ['order-then-select-rank'], target: 'value:rank',
            options: 'rank-confusions', distract: ['D1', 'D5', 'D1'], narrative: 'five-value-list', numeric: ['values'] } }); } },
    ],
    A14: [
      { name: 'list-mean', read: (rand, st) => {
        const v = st.values, sum = v.reduce((a, b) => a + b, 0);
        if (sum % v.length !== 0) return { error: 'the mean is not a whole number at this level' };
        return OK(rand, Q(sum / v.length), [
          { name: 'reported-the-median', value: Q(v[2]), cost: 1 },
          { name: 'reported-the-range', value: Q(v[4] - v[0]), cost: 1 },
          { name: 'divided-by-one-fewer', value: Q(sum, v.length - 1), cost: 2 },
        ], { family: 'A14', construct: 'mean-of-a-list', stimulus: st,
          stem: `The list shows five recorded values. What is their mean?`,
          mechanism: { repr_switch: 1, abstraction: 1 },
          fingerprintParts: { ctx: 'stimulus:data-list shared', chain: ['sum-then-divide'], target: 'value:mean',
            options: 'summary-statistic-confusions', distract: ['D1', 'D1', 'D6'], narrative: 'five-value-list', numeric: ['values'] } }); } },

      { name: 'list-median', read: (rand, st) => {
        const v = st.values;
        if (new Set(v).size < 5) return { error: 'repeated values make the median ambiguous to read' };
        return OK(rand, Q(v[2]), [
          { name: 'reported-the-mean', value: Q(v.reduce((a, b) => a + b, 0), 5), cost: 2 },
          { name: 'reported-the-midrange', value: Q(v[0] + v[4], 2), cost: 2 },
          { name: 'reported-the-second-value', value: Q(v[1]), cost: 1 },
        ], { family: 'A14', construct: 'median-of-a-list', stimulus: st,
          stem: `The list shows five recorded values. What is their median?`,
          mechanism: { repr_switch: 1 },
          fingerprintParts: { ctx: 'stimulus:data-list shared', chain: ['order-then-select-middle'], target: 'value:median',
            options: 'summary-statistic-confusions', distract: ['D1', 'D3', 'D6'], narrative: 'five-value-list', numeric: ['values'] } }); } },

      { name: 'list-range', read: (rand, st) => {
        const v = st.values;
        if (v[4] === v[0]) return { error: 'the range is zero' };
        return OK(rand, Q(v[4] - v[0]), [
          { name: 'reported-the-largest', value: Q(v[4]), cost: 1 },
          { name: 'reported-the-sum-of-the-extremes', value: Q(v[4] + v[0]), cost: 1 },
          { name: 'reported-the-interquartile-span', value: Q(v[3] - v[1]), cost: 2 },
        ], { family: 'A14', construct: 'range-of-a-list', stimulus: st,
          stem: `The list shows five recorded values. What is their range?`,
          mechanism: { repr_switch: 1 },
          fingerprintParts: { ctx: 'stimulus:data-list shared', chain: ['identify-extremes', 'difference'], target: 'value:range',
            options: 'extreme-confusions', distract: ['D1', 'D3', 'D5'], narrative: 'five-value-list', numeric: ['values'] } }); } },
    ],
  },

  'table': {
    A13: [
      { name: 'table-cell', read: (rand, st) => {
        const rows = st.rows, i = rand.int(0, rows.length - 1);
        const t = rows.reduce((a, r) => a + r[1], 0);
        return OK(rand, Q(rows[i][1]), [
          { name: 'read-the-adjacent-row', value: Q(rows[(i + 1) % rows.length][1]), cost: 1 },
          { name: 'read-the-total', value: Q(t), cost: 1 },
          { name: 'read-the-complement', value: Q(t - rows[i][1]), cost: 2 },
        ], { family: 'A13', construct: 'read-table-cell', stimulus: st,
          stem: `The table shows deliveries by region. How many deliveries were made in the ${rows[i][0]} region?`,
          mechanism: { repr_switch: 2 },
          fingerprintParts: { ctx: 'stimulus:table shared', chain: ['locate-row', 'read-value'], target: 'value:cell',
            options: 'row-confusions', distract: ['D5', 'D1', 'D5'], narrative: 'three-region-table', numeric: ['row-values'] } }); } },

      { name: 'table-ratio', read: (rand, st) => {
        const [a, b] = [st.rows[0][1], st.rows[1][1]];
        if (a === b) return { error: 'the two rows are equal' };
        return OK(rand, Q(a, b), [
          { name: 'inverted-the-ratio', value: Q(b, a), cost: 1 },
          { name: 'used-the-difference', value: Q(Math.abs(a - b)), cost: 1 },
          { name: 'used-the-total-as-the-referent', value: Q(a, a + b), cost: 2 },
        ], { family: 'A13', construct: 'read-table-ratio', stimulus: st,
          stem: `The table shows deliveries by region. What is the ratio of ${st.rows[0][0]} deliveries to ${st.rows[1][0]} deliveries?`,
          mechanism: { repr_switch: 2, abstraction: 1 },
          fingerprintParts: { ctx: 'stimulus:table shared', chain: ['read-two-rows', 'form-ratio'], target: 'value:ratio',
            options: 'ratio-referent-slips', distract: ['D6', 'D3', 'D5'], narrative: 'three-region-table', numeric: ['row-values'] } }); } },

      { name: 'table-total', read: (rand, st) => {
        const rows = st.rows, t = rows.reduce((a, r) => a + r[1], 0);
        return OK(rand, Q(t), [
          { name: 'omitted-one-row', value: Q(t - rows[0][1]), cost: 1 },
          { name: 'averaged-the-rows', value: Q(t, rows.length), cost: 1 },
          { name: 'read-the-largest-row-only', value: Q(Math.max(...rows.map(r => r[1]))), cost: 1 },
        ], { family: 'A13', construct: 'read-table-total', stimulus: st,
          stem: `The table shows deliveries by region. How many deliveries were made in total?`,
          mechanism: { repr_switch: 2, abstraction: 1 },
          fingerprintParts: { ctx: 'stimulus:table shared', chain: ['read-all-rows', 'total'], target: 'value:total',
            options: 'aggregation-slips', distract: ['D1', 'D2', 'D1'], narrative: 'three-region-table', numeric: ['row-values'] } }); } },
    ],
    A14: [
      { name: 'table-mean', read: (rand, st) => {
        const rows = st.rows, t = rows.reduce((a, r) => a + r[1], 0);
        if (t % rows.length !== 0) return { error: 'the mean is not a whole number at this level' };
        return OK(rand, Q(t / rows.length), [
          { name: 'reported-the-total', value: Q(t), cost: 1 },
          { name: 'divided-by-one-fewer', value: Q(t, rows.length - 1), cost: 2 },
          { name: 'reported-the-largest-row', value: Q(Math.max(...rows.map(r => r[1]))), cost: 1 },
        ], { family: 'A14', construct: 'mean-of-a-table', stimulus: st,
          stem: `The table shows deliveries by region. What is the mean number of deliveries per region?`,
          mechanism: { repr_switch: 1, abstraction: 1 },
          fingerprintParts: { ctx: 'stimulus:table shared', chain: ['total-then-divide'], target: 'value:mean',
            options: 'summary-statistic-confusions', distract: ['D1', 'D6', 'D1'], narrative: 'three-region-table', numeric: ['row-values'] } }); } },
    ],
    A15: [
      { name: 'table-probability', read: (rand, st) => {
        const rows = st.rows, t = rows.reduce((a, r) => a + r[1], 0), i = rand.int(0, rows.length - 1);
        return OK(rand, Q(rows[i][1], t), [
          { name: 'used-the-wrong-row', value: Q(rows[(i + 1) % rows.length][1], t), cost: 1 },
          { name: 'divided-by-the-other-rows', value: Q(rows[i][1], t - rows[i][1]), cost: 2 },
          { name: 'took-the-complement', value: Q(t - rows[i][1], t), cost: 2 },
        ], { family: 'A15', construct: 'table-single-category-probability', stimulus: st,
          stem: `The table shows deliveries by region. If one delivery is chosen at random, what is the probability that it was made in the ${rows[i][0]} region?`,
          mechanism: { repr_switch: 1, filtering: 2 },
          fingerprintParts: { ctx: 'stimulus:table shared', chain: ['read-counts', 'form-ratio'], target: 'value:probability',
            options: 'ratio-referent-slips', distract: ['D5', 'D6', 'D5'], narrative: 'three-region-table', numeric: ['row-values'] } }); } },
    ],
  },
};

/** Build one shared display and the items that read it. */
/**
 * Every reader of one display kind, routine and Core together.
 *
 * The two pools are kept separate at the source — a Core reader declares a
 * solution path and a rival and is checked by assessCore(), a routine reader
 * declares neither and is checked by assessRoutine() — and merged only here,
 * where a set has to be able to draw from both. Which contract an item is held
 * to follows the reader it came from, never the pool it was drawn from.
 */
export function readersFor(kind) {
  const out = {};
  for (const [fam, list] of Object.entries(READERS[kind] || {})) out[fam] = [...list];
  for (const [fam, list] of Object.entries(CORE_READERS[kind] || {}))
    (out[fam] ||= []).push(...list.map(r => ({ ...r, core: true })));
  return out;
}

/**
 * Build one shared-display set.
 *
 * `coreFirst` is how many of the set's slots should try the CORE readers before
 * the routine ones. It is not a quota and nothing fails if it cannot be met: a
 * set with no Core reader for its families simply builds from routine readers,
 * as it did before Stage 3.5. It exists because the reader list is searched in
 * order and the routine readers come first, so without it a set of three
 * questions about one chart is three Entry questions — which is what the P1
 * prototype did with all ten of its set slots, and is not what the reference
 * does with a chart block (T3 Q45, T4 Q11 and T4 Q14 are all Core).
 */
export function stimulusSet(kind, familiesWanted, seed, exclude = new Set(), { coreFirst = 0, priorFps = [] } = {}) {
  const gen = STIMULUS_KINDS[kind];
  if (!gen) return { error: `unknown stimulus kind ${kind}` };
  const readersByFam = readersFor(kind);
  for (let attempt = 0; attempt < 40; attempt++) {
    const rand = rng(seed + attempt * 997);
    const stim = gen(rand);
    const items = [];
    // A reader used by an EARLIER set is a structural repeat across the form,
    // so it is excluded here rather than caught later as a clone collision.
    const usedReader = new Set(exclude);
    let ok = true;
    let coreLeft = coreFirst;
    // A shared display carries AT MOST ONE pure-lookup reading. T1 Q31 — "read
    // ONE bar", the easiest item on the paper — is singular in its four-item
    // block, and P1 printed three low-information readings of one five-number
    // list (artifact 18, defect D9).
    let lowInfoLeft = 1;
    // AND no two readings of one display may take the same number of steps.
    //
    // A reference chart block asks at different depths — T1's four-item block
    // runs a single bar read, a scan, a comparison and a computation. Every
    // generated block asked at one depth, because the reader list is searched
    // in order and the first match wins, which left the whole Entry band
    // spanning one to two operations while the reference's spans one to seven.
    const usedDepth = new Set();
    for (const fam of familiesWanted) {
      const avail = (readersByFam[fam] || []).filter(r => !usedReader.has(r.name));
      const list = coreLeft > 0
        ? [...avail.filter(r => r.core), ...avail.filter(r => !r.core)]
        : avail;
      // Distinct reading depths are a PREFERENCE, not a requirement. Enforced
      // hard it starved the sets — three of fifty slots went unfilled because
      // no unused depth was left for the third question about one chart.
      let made = null;
      for (const allowRepeatDepth of [false, true]) {
      if (made) break;
      for (const r of list) {
        const it = r.read(rng(seed + attempt * 997 + items.length * 31 + 7), stim);
        if (!it || it.error) continue;
        // ANTI-CLONE INSIDE THE SET. Summing the extremes of a list and
        // subtracting them are the same reading of the same display, and a set
        // that contained both would ask one question twice. Caught here rather
        // than later, because by then the set is already assembled.
        it.seed = seed + attempt;
        // ANTI-CLONE ACROSS SETS, not only inside one. Reader NAMES were
        // excluded across sets from Stage 2.5, which stops the same reading
        // twice but not two different readings that are the same question:
        // "the greatest two-day total" and "the total over four days" share
        // five of seven fingerprint axes and collided on four of five seeds.
        const fp = fingerprintItem({ ...it, primitive: `${r.core ? 'C' : 'R'}-${fam}` });
        if (detectClone(fp, [...priorFps, ...items.map(x => fingerprintItem(x))], 'sibling').clone) continue;
        const depth = (it.fingerprintParts?.chain || []).length || 1;
        if (usedDepth.has(depth) && !allowRepeatDepth) continue;
        const low = depth <= 1;
        if (low && lowInfoLeft <= 0) continue;
        if (low) lowInfoLeft--;
        usedDepth.add(depth);
        it.__core = !!r.core;
        if (r.core) coreLeft--;
        made = it; usedReader.add(r.name); break;
      }
      }
      if (!made) { ok = false; break; }
      const isCore = !!made.__core;
      delete made.__core;
      made.primitive = isCore ? `C-${fam}` : `R-${fam}`;
      made.species = isCore ? 'core' : 'routine';
      made.form = made.construct;
      made.stream = isCore ? 'core' : 'routine';
      made.subForm = `${isCore ? 'C' : 'R'}-${fam}/${made.construct}`;
      made.seed = seed + attempt;
      const v = isCore ? assessCore(made) : assessRoutine(made);
      if (!v.ok) { ok = false; break; }
      items.push(made);
    }
    if (ok && items.length === familiesWanted.length)
      return { kind, stimulus: stim, items, readers: [...usedReader].filter(n => !exclude.has(n)) };
  }
  return { error: `could not build a ${kind} set for ${familiesWanted.join('+')}` };
}

/** Which display kinds can serve a given multiset of families. */
export function kindsFor(families, exclude = new Set()) {
  return Object.keys(READERS).filter(kind => {
    const pool = readersFor(kind);
    const need = {};
    for (const f of families) need[f] = (need[f] || 0) + 1;
    return Object.entries(need).every(([f, n]) =>
      (pool[f] || []).filter(r => !exclude.has(r.name)).length >= n);
  });
}

export const ROUTINE_CONSTRUCTS = Object.fromEntries(
  Object.keys(BASE).map(f => [f, [BASE[f], ...(VARIANTS[f] || [])]]));
export const ROUTINE_FAMILIES = Object.keys(ROUTINE_CONSTRUCTS);
export const EMITS_STIMULUS = new Set(['A13', 'A14', 'A15']);

/** How many distinct constructs each family offers. */
export const CONSTRUCT_COUNTS = Object.fromEntries(
  Object.entries(ROUTINE_CONSTRUCTS).map(([f, list]) => [f, list.length]));

/** Generate one routine item for a family, or an error. `variant` picks the construct. */
export function routineItem(family, seed, variant = 0) {
  const list = ROUTINE_CONSTRUCTS[family];
  if (!list) return { error: `no routine construct for family ${family}` };
  const fn = list[variant % list.length];
  let it;
  // A construct that throws is a rejected candidate, not a crashed assembler.
  try { it = fn(rng(seed)); } catch (e) { return { error: `threw: ${e.message}` }; }
  if (!it || it.error) return { error: it?.error || 'construct produced nothing' };
  it.primitive = `R-${family}`;
  it.species = 'routine';
  it.form = it.construct;
  it.seed = seed;
  const v = assessRoutine(it);
  if (!v.ok) return { error: v.reasons.join('; ') };
  return it;
}

/** Generate `count` distinct routine items for a family. */
export function generateRoutine(family, count, { seed = 1, maxTries = 600 } = {}) {
  const items = [], rejected = [];
  const nv = (ROUTINE_CONSTRUCTS[family] || [null]).length;
  let s = seed, tries = 0;
  // Draw round-robin across the variants so a family's structures are used
  // evenly rather than exhausting the first one.
  while (items.length < count && tries < maxTries) {
    const it = routineItem(family, s++, tries % nv);
    tries++;
    if (it.error) { rejected.push(it.error); continue; }
    items.push(it);
  }
  return { items, tries, rejected };
}
