// The Core stream — Stage 3.5.
//
// WHY IT EXISTS
//
// Stage 3.5 corrected the Entry/Core boundary: Core now requires a FULL-COST
// trap (`trap === 2`), which is the sharpest drift-immune separator the 200-item
// reference corpus offers (Entry 16%, Core 60%, +0.44). The correction was
// measured before it was made and it immediately measured a hole:
//
//   the generator's Core capacity, under the corrected rule, is ZERO.
//
//   mechanism pool, 6813 candidates, joint trap x biting x core:
//     t0 b2 c1   516      t1 b1 c1  1013      t1 b2 c1  1030
//     t1 b3 c2   338      t1 b4 c4  1119
//     t2 b3 c2  1594      t2 b4 c2   577      t2 b5 c3   626
//
//   Every trap-2 item has three or more mechanisms biting and two or more from
//   the reasoning core. Every item with two or fewer biting has trap <= 1.
//
// Trap level and mechanism density are entangled in the primitives. The corpus
// does not share that entanglement: 29 of its 48 Core-band items are graded
// trap_cost 2 with NO mechanism biting at all — the modal Core signature is
// `opacity 2, coreMild 1, biting 0, core 0, trap 2`, 23% of the band.
//
// So there is a class of authentic EST item the generator cannot make. Not
// routine — a routine item's wrong route is a slip. Not mechanism-bearing —
// there is nothing to discover. The middle: ROUTINE MATHEMATICS WHOSE MOST
// NATURAL FIRST MOVE IS A COMPLETE RIVAL METHOD.
//
// WHAT A RIVAL IS, AND WHY IT IS NOT A COST CLAIM
//
// Read off the reference's own trap-2 Core items: the direct-variation answer
// where the relation is inverse (T3 Q40 D=37), the mean where the sum is wanted
// (T3 Q49, T4 Q19), the negative root's absolute value (T4 Q33 A=5), the
// two-year total that is not the tallest bar (T4 Q14). In every one the student
// answers a DIFFERENT QUESTION CORRECTLY and pays the full price for it.
//
// That is a structural property, so it is checked structurally, and both halves
// of the check are DERIVED rather than declared:
//
//   * `solution` is the ordered step list of the correct method. Its last value
//     must be the key. `steps` is its length. Its non-final values are the
//     item's intermediates.
//   * `rival` is the ordered step list of the wrong method. Its last value must
//     be a printed option other than the key, and must NOT be an intermediate
//     of `solution` — a route that stops at an intermediate is a truncation, a
//     slip, and grades trap 1 like any other slip.
//   * Route COSTS are the lengths of those two lists. No cost is asserted
//     anywhere in this file, so no cost can be inflated to buy a trap grade.
//     To claim a full-cost trap you must write down a wrong method at least as
//     long as the right one that lands on a printed option — which is what a
//     full-cost trap IS.
//
// The rivalry test is necessary, not sufficient, and the cost condition is what
// makes the pair sufficient: "add the two legs instead of using Pythagoras"
// lands off the solution path but takes one step against the key's two, so it
// grades 1. Both conditions, or the trap is a slip.
//
// WHERE THIS SITS RELATIVE TO THE OTHER TWO STREAMS
//
//   routine    no insight, wrong routes are slips        -> Entry
//   CORE       no insight, one wrong route is a rival    -> Core
//   mechanism  an insight route, load-bearing mechanism  -> Stretch / Peak
//
// assess() is not applied here and is not weakened, for exactly the reason
// est-routine.mjs gives: a Core item has no insight route, so the Stage-1
// contract is not the contract it can meet. assessCore() below is stricter than
// assessRoutine() in the two places that matter — it demands the solution path
// and it demands the rival — and identical everywhere else.

import {
  Q, qAdd, qSub, qMul, qDiv, qNeg, qEq, qNum, qIsInt, qStr,
  rng, ROUTE, layout, coef, term, signedConst, trapLevel, intermediatesOf, stepsOf,
} from './est-primitives.mjs';

const REASONING_CORE = ['hidden_step', 'inference', 'multiconcept', 'nonobvious_rel'];

/* ────────────────────────── the Core contract ────────────────────────── */

/**
 * What a Core-stream item must satisfy.
 *
 * Not a weakened assess(): a different contract for a different class. Every
 * clause below is a rejection reason, and the mutation suite injects a defect
 * against each one.
 */
export function assessCore(item) {
  const reasons = [];
  if (!item || item.error) return { ok: false, reasons: [item?.error || 'no item'] };
  const keyOpt = item.options.find(o => o.id === item.key);
  if (!keyOpt) return { ok: false, reasons: ['no key'] };
  const keyValue = keyOpt.value;

  // 1. Nothing to discover. A Core item that claimed an insight route would be
  //    a mechanism item dodging assess().
  if (item.routes.some(r => r.requiresInsight)) reasons.push('a Core-stream item must not claim an insight route');

  // 2. The solution path exists, is ordered, and terminates on the key.
  const inter = intermediatesOf(item);
  if (!Array.isArray(item.solution) || item.solution.length < 2)
    reasons.push('no solution path of at least two steps');
  else if (!inter) reasons.push('the solution path does not terminate on the key');

  // 3. The rival exists, is at least as long, and lands on a printed wrong answer.
  const rival = item.rival;
  if (!Array.isArray(rival) || rival.length < 2) reasons.push('no rival method of at least two steps');
  else if (inter) {
    if (rival.length < item.solution.length)
      reasons.push(`the rival is ${rival.length} steps against the solution's ${item.solution.length} — that is a slip, not a rival method`);
    const rv = rival[rival.length - 1].value;
    const hit = item.options.find(o => qEq(o.value, rv));
    if (!hit) reasons.push('the rival does not land on a printed option');
    else if (hit.id === item.key) reasons.push('the rival lands on the key');
    if (inter.some(v => qEq(v, rv)))
      reasons.push('the rival stops at an intermediate of the solution — that is a truncation, not a rival method');
  }

  // 4. Every printed option is reached by an enumerated route (check-10a).
  const unrouted = item.options.filter(o => !item.routes.some(r => qEq(r.value, o.value)));
  if (unrouted.length) reasons.push(`option(s) ${unrouted.map(o => o.text).join(', ')} are reached by no route`);

  // 5. Magnitude alone must not identify the key.
  const kn = Math.abs(qNum(keyValue));
  const near = item.options.some(o => {
    if (o.id === item.key) return false;
    const v = Math.abs(qNum(o.value));
    return kn === 0 ? v < 3 : v > kn / 3 && v < kn * 3;
  });
  if (!near) reasons.push('every distractor is more than a factor of three from the key');

  // 6. The profile is Core, not Stretch. A Core item with a reasoning-core
  //    mechanism at full strength is a Stretch item that has mislabelled itself.
  const m = item.mechanism || {};
  const biting = Object.entries(m).filter(([, v]) => v >= 2).map(([k]) => k);
  const core = biting.filter(k => REASONING_CORE.includes(k));
  if (biting.length > 2) reasons.push(`${biting.length} mechanisms bite — that is a Stretch item`);
  if (core.length) reasons.push(`bites the reasoning-core mechanism ${core[0]} — that is a Stretch item`);
  if (!Object.values(m).some(v => v >= 1)) reasons.push('no mechanism is in play at all');

  // 7. The trap actually grades 2. Everything above is the reasoning; this is
  //    the result, and it is read from the same trapLevel() the assembler uses.
  const t = trapLevel(item);
  if (t.level !== 2) reasons.push(`trap grades ${t.level}, not 2: ${t.reason}`);

  return { ok: reasons.length === 0, reasons };
}

/* ────────────────────────── shared construction ────────────────────────── */

/**
 * Build a Core item from its two paths and its remaining distractors.
 *
 * Route costs are the path lengths. `slips` are the ordinary wrong routes that
 * fill the other two option slots; each declares its own cost and none of them
 * can earn the trap grade, because the grade is decided by rivalry.
 */
const OK = (rand, solution, rival, slips, meta, fmt = qStr) => {
  const key = solution[solution.length - 1].value;
  const rv = rival[rival.length - 1].value;
  const vals = [key, rv, ...slips.map(s => s.value)];
  for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++)
    if (qEq(vals[i], vals[j])) return { error: `duplicate option ${qStr(vals[i])}` };
  const L = layout(rand, key, [rv, ...slips.map(s => s.value)], fmt);
  if (L.error) return { error: L.error };
  return {
    stream: 'core',
    ...L,
    solution,
    rival,
    // The correct method is natural, and so is the rival — that is the whole
    // point of the class: both moves are ones a real student makes, and the
    // wrong one costs as much as the right one.
    routes: [
      ROUTE(meta.method, { insight: false, cost: solution.length, value: key, natural: true }),
      ROUTE(meta.rivalName, { insight: false, cost: rival.length, value: rv, natural: true }),
      ...slips.map(s => ROUTE(s.name, { insight: false, cost: s.cost ?? 1, value: s.value, natural: false })),
    ],
    ...meta,
  };
};

/** A step in a path: a label a reader could check, and the exact value it produces. */
const S = (label, value) => ({ label, value });

/* ────────────────────────── the constructs ────────────────────────── */
//
// Thirteen constructs across thirteen families. Each is modelled on a specific
// reference item whose trap the corpus graded 2, named in the comment.

const CONSTRUCTS = {

  // T3 Q40: "D=37 is the DIRECT-VARIATION answer" — inverse read as direct.
  A11: (rand) => {
    const x0 = rand.pick([3, 4, 5, 6]);
    const x1 = rand.pick([6, 8, 9, 10, 12]);
    if (x1 === x0 || x1 >= 3 * x0) return { error: 'the two inputs are too far apart to keep the options comparable' };
    if ((x1 * x1) % x0 !== 0) return { error: 'the direct-variation rival is not a whole number' };
    const t = rand.int(1, 6);
    const k = x0 * x1 * t, y0 = x1 * t;
    const key = Q(x0 * t);
    const direct = Q(x1 * x1 * t / x0);
    if (qEq(key, direct)) return { error: 'the two readings agree' };
    return OK(rand,
      [S('k = x0 y0', Q(k)), S('y = k / x1', key)],
      [S('m = y0 / x0', Q(y0, x0)), S('y = m x1', direct)],
      [{ name: 'reported-the-given-y-unchanged', value: Q(y0), cost: 1 },
       { name: 'reported-the-constant-of-variation', value: Q(k), cost: 1 }],
      {
        family: 'A11', construct: 'inverse-variation',
        method: 'find-the-constant-then-divide', rivalName: 'direct-variation-instead',
        stem: `The quantity $y$ varies inversely as $x$. When $x = ${x0}$, $y = ${y0}$. What is the value of $y$ when $x = ${x1}$?`,
        mechanism: { abstraction: 1, nonobvious_rel: 1, multiconcept: 1 },
        fingerprintParts: { ctx: 'variation no-stimulus', chain: ['constant-of-variation', 'evaluate-at-new-input'],
          target: 'value:y', options: 'variation-rivals', distract: ['D2', 'D3', 'D2'],
          narrative: 'two-quantities-related', numeric: ['x0', 'y0', 'x1'] },
      });
  },

  // T3 Q49 / T4 Q19: mean-to-sum. The rival averages the mean with the newcomer.
  A14: (rand) => {
    const n = rand.pick([5, 6, 8, 9]);
    const m = rand.int(8, 30);
    const v = rand.int(2, 60);
    if (v === m) return { error: 'the new value equals the mean, so nothing moves' };
    const total = n * m;
    const key = Q(total + v, n + 1);
    const rival = Q(m + v, 2);
    if (qEq(key, rival)) return { error: 'the rival coincides with the key' };
    return OK(rand,
      [S('total = n x mean', Q(total)), S('new mean = (total + v) / (n + 1)', key)],
      [S('sum the two figures', Q(m + v)), S('halve them', rival)],
      [{ name: 'divided-by-n-not-n-plus-one', value: Q(total + v, n), cost: 2 },
       { name: 'reported-the-new-total', value: Q(total + v), cost: 1 }],
      {
        family: 'A14', construct: 'mean-after-one-more',
        method: 'recover-the-total-then-re-average', rivalName: 'average-the-mean-with-the-new-value',
        stem: `The mean of ${n} numbers is ${m}. A further number, ${v}, is included. What is the mean of all ${n + 1} numbers?`,
        mechanism: { abstraction: 1, filtering: 1, multiconcept: 1 },
        fingerprintParts: { ctx: 'summary-statistic no-stimulus', chain: ['mean-to-total', 'total-to-mean'],
          target: 'value:mean', options: 'mean-rivals', distract: ['D2', 'D2', 'D3'],
          narrative: 'set-of-numbers-extended', numeric: ['count', 'mean', 'added'] },
      });
  },

  // T2 Q24: "26 is the y-intercept, -7 the slope" — the other intercept, in full.
  A05: (rand) => {
    const a = rand.pick([2, 3, 4, 5, 6]), b = rand.nonZero(-6, 6);
    const c = a * b * rand.nonZero(-4, 4);
    if (c === 0) return { error: 'the line passes through the origin, so both intercepts are 0' };
    const key = Q(c, a), rival = Q(c, b);
    if (qEq(key, rival)) return { error: 'the two intercepts coincide' };
    return OK(rand,
      [S('set y = 0', Q(c)), S('divide by the x-coefficient', key)],
      [S('set x = 0', Q(c)), S('divide by the y-coefficient', rival)],
      [{ name: 'read-the-x-coefficient-as-the-answer', value: Q(a), cost: 1 },
       { name: 'negated-the-intercept', value: qNeg(key), cost: 2 }],
      {
        family: 'A05', construct: 'x-intercept-of-a-line',
        method: 'set-y-to-zero-and-solve', rivalName: 'found-the-y-intercept-instead',
        stem: `In the $xy$-plane, line $\\ell$ has equation $${coef(a, 'x')} ${term(b, 'y')} = ${c}$. What is the $x$-coordinate of the point where $\\ell$ crosses the $x$-axis?`,
        mechanism: { abstraction: 1, repr_switch: 1, hidden_step: 1 },
        fingerprintParts: { ctx: 'coordinate-line no-stimulus', chain: ['substitute-zero', 'solve-one-step'],
          target: 'value:x-intercept', options: 'intercept-rivals', distract: ['D2', 'D3', 'D1'],
          narrative: 'symbols-only:line', numeric: ['coeff-x', 'coeff-y', 'const'] },
      });
  },

  // T4 Q14 shape: a rival aggregation that is itself a complete, correct sum of
  // the wrong thing. Here: averaging two rates instead of adding them.
  A12: (rand) => {
    const ra = rand.pick([3, 4, 5, 6]), rb = rand.pick([2, 5, 7, 9, 10]);
    if (ra === rb) return { error: 'equal rates make the rival identical' };
    const jobs = (ra + rb) * rand.int(3, 9);
    const key = Q(jobs, ra + rb);
    const rival = Q(2 * jobs, ra + rb);   // averaging the rates halves the combined rate
    return OK(rand,
      [S('combined rate = ra + rb', Q(ra + rb)), S('time = jobs / combined rate', key)],
      [S('average rate = (ra + rb) / 2', Q(ra + rb, 2)), S('time = jobs / average rate', rival)],
      [{ name: 'used-the-faster-machine-alone', value: Q(jobs, Math.max(ra, rb)), cost: 1 },
       { name: 'used-the-slower-machine-alone', value: Q(jobs, Math.min(ra, rb)), cost: 1 }],
      {
        family: 'A12', construct: 'combined-rate',
        method: 'add-the-rates', rivalName: 'averaged-the-rates',
        stem: `Machine A fills ${ra} crates per hour and machine B fills ${rb} crates per hour. ` +
              `Working at the same time, how many hours do the two machines take to fill ${jobs} crates?`,
        mechanism: { abstraction: 1, multiconcept: 1, filtering: 1 },
        fingerprintParts: { ctx: 'work-rate no-stimulus', chain: ['combine-rates', 'divide-total-by-rate'],
          target: 'value:time', options: 'rate-rivals', distract: ['D2', 'D3', 'D3'],
          narrative: 'two-machines-one-task', numeric: ['rate-a', 'rate-b', 'total'] },
      });
  },

  // T4 Q3 made LIVE: the corpus advertises compound-vs-simple and then omits the
  // simple-interest answer. Here it is printed, and it is the rival.
  A11b: (rand) => {
    const p = rand.pick([4000, 5000, 6000, 8000, 10000]);
    const r = rand.pick([5, 10, 20, 25]);
    const key = qMul(qMul(Q(p), Q(100 + r, 100)), Q(100 + r, 100));
    const rival = qMul(Q(p), Q(100 + 2 * r, 100));
    if (!qIsInt(key) || !qIsInt(rival)) return { error: 'the amounts are not whole currency units' };
    return OK(rand,
      [S('after one year', qMul(Q(p), Q(100 + r, 100))), S('after two years', key)],
      [S('total simple interest = 2 x r%', Q(2 * r * p, 100)), S('principal plus that interest', rival)],
      [{ name: 'reported-the-interest-not-the-balance', value: qSub(key, Q(p)), cost: 2 },
       { name: 'compounded-once-only', value: qMul(Q(p), Q(100 + r, 100)), cost: 1 }],
      {
        family: 'A11', construct: 'compound-two-years',
        method: 'multiply-by-the-growth-factor-twice', rivalName: 'used-simple-interest',
        stem: `An account of $\\$${p}$ earns ${r}\\% interest per year, compounded annually. ` +
              `What is the balance, in dollars, after 2 years?`,
        mechanism: { abstraction: 1, multiconcept: 1, hidden_step: 1 },
        fingerprintParts: { ctx: 'growth no-stimulus', chain: ['apply-growth-factor', 'apply-growth-factor'],
          target: 'value:balance', options: 'growth-rivals', distract: ['D2', 'D2', 'D2'],
          narrative: 'account-over-years', numeric: ['principal', 'rate'] },
      });
  },

  // The rival is a complete, correct probability — of the wrong experiment.
  A15: (rand) => {
    const r = rand.int(3, 7), b = rand.int(2, 6);
    const n = r + b;
    const key = qMul(Q(r, n), Q(r - 1, n - 1));
    const rival = qMul(Q(r, n), Q(r, n));
    if (qEq(key, rival)) return { error: 'the two experiments agree' };
    return OK(rand,
      [S('first draw', Q(r, n)), S('times the second draw without replacement', key)],
      [S('first draw', Q(r, n)), S('times the same probability again', rival)],
      [{ name: 'added-the-two-draws', value: qAdd(Q(r, n), Q(r - 1, n - 1)), cost: 2 },
       { name: 'reported-the-first-draw-alone', value: Q(r, n), cost: 1 }],
      {
        family: 'A15', construct: 'two-draws-no-replacement',
        method: 'multiply-the-conditional-probabilities', rivalName: 'assumed-replacement',
        stem: `A box contains ${r} red counters and ${b} blue counters. Two counters are taken at random, one after the other, ` +
              `and the first is not put back. What is the probability that both are red?`,
        mechanism: { abstraction: 1, multiconcept: 1, filtering: 1 },
        fingerprintParts: { ctx: 'probability no-stimulus', chain: ['first-draw', 'conditional-second-draw'],
          target: 'value:probability', options: 'probability-rivals', distract: ['D2', 'D3', 'D3'],
          narrative: 'counters-drawn-in-order', numeric: ['red', 'blue'] },
      });
  },

  // The remainder theorem at the wrong sign: a full, correct evaluation of P(-a).
  A07: (rand) => {
    const a = rand.pick([2, 3, 4]);
    const c2 = rand.nonZero(-5, 5), c1 = rand.nonZero(-9, 9), c0 = rand.nonZero(-9, 9);
    const at = t => t ** 3 + c2 * t * t + c1 * t + c0;
    const key = Q(at(a)), rival = Q(at(-a));
    if (qEq(key, rival)) return { error: 'the polynomial is even about this divisor' };
    return OK(rand,
      [S('cube and square the root', Q(a ** 3 + c2 * a * a)), S('add the remaining terms', key)],
      [S('cube and square the negated root', Q(-(a ** 3) + c2 * a * a)), S('add the remaining terms', rival)],
      [{ name: 'dropped-the-constant-term', value: Q(at(a) - c0), cost: 2 },
       { name: 'evaluated-the-divisor-instead', value: Q(a), cost: 1 }],
      {
        family: 'A07', construct: 'remainder-theorem',
        method: 'evaluate-at-the-root-of-the-divisor', rivalName: 'evaluated-at-the-negated-root',
        stem: `The polynomial $P(x) = x^3 ${term(c2, 'x^2')} ${term(c1, 'x')} ${term(c0, '')}$ is divided by $x ${signedConst(-a)}$. ` +
              `What is the remainder?`,
        mechanism: { abstraction: 1, hidden_step: 1, nonobvious_rel: 1 },
        fingerprintParts: { ctx: 'polynomial no-stimulus', chain: ['identify-the-root', 'evaluate-the-polynomial'],
          target: 'value:remainder', options: 'sign-rivals', distract: ['D2', 'D2', 'D3'],
          narrative: 'symbols-only:cubic', numeric: ['coeffs', 'divisor'] },
      });
  },

  // Semi-perimeter read as perimeter: a complete, correct area of a wrong rectangle.
  A17: (rand) => {
    const l = rand.int(6, 18), w = rand.int(3, 14);
    if (l === w) return { error: 'a square makes the rival degenerate' };
    const p = 2 * (l + w);
    const key = Q(l * w), rival = Q(l * (p - l));
    return OK(rand,
      [S('width = (P - 2L) / 2', Q(w)), S('area = L x width', key)],
      [S('width = P - L', Q(p - l)), S('area = L x that width', rival)],
      [{ name: 'reported-the-width-alone', value: Q(w), cost: 1 },
       { name: 'halved-the-perimeter-and-stopped', value: Q(l + w), cost: 1 }],
      {
        family: 'A17', construct: 'area-from-perimeter',
        method: 'recover-the-width-then-multiply', rivalName: 'read-the-perimeter-as-a-semi-perimeter',
        stem: `A rectangle has perimeter ${p} and one side of length ${l}. What is its area?`,
        mechanism: { abstraction: 1, hidden_step: 1, repr_switch: 1 },
        fingerprintParts: { ctx: 'plane-figure no-stimulus', chain: ['recover-missing-side', 'area-of-rectangle'],
          target: 'value:area', options: 'perimeter-rivals', distract: ['D2', 'D3', 'D3'],
          narrative: 'rectangle-given-perimeter', numeric: ['perimeter', 'side'] },
      });
  },

  // Successive percentages summed instead of applied: the rival is arithmetic
  // a student can defend, carried to the end.
  A12b: (rand) => {
    const base = rand.pick([200, 250, 400, 500, 800]);
    const up = rand.pick([10, 20, 25]), down = rand.pick([10, 20, 25]);
    if (up === down && up === 20) return { error: 'this pair is over-used in the corpus' };
    const key = qMul(qMul(Q(base), Q(100 + up, 100)), Q(100 - down, 100));
    const rival = qMul(Q(base), Q(100 + up - down, 100));
    if (qEq(key, rival)) return { error: 'the two readings agree' };
    if (!qIsInt(key) || !qIsInt(rival)) return { error: 'the prices are not whole currency units' };
    return OK(rand,
      [S('after the rise', qMul(Q(base), Q(100 + up, 100))), S('after the fall', key)],
      [S('net percentage change', Q(up - down)), S('apply it once to the original', rival)],
      [{ name: 'applied-the-fall-first-to-the-wrong-base', value: qMul(Q(base), Q(100 - down, 100)), cost: 1 },
       { name: 'reported-the-price-after-the-rise-only', value: qMul(Q(base), Q(100 + up, 100)), cost: 1 }],
      {
        family: 'A12', construct: 'successive-percentages',
        method: 'apply-each-change-in-turn', rivalName: 'summed-the-percentages',
        stem: `The price of an item is $\\$${base}$. It rises by ${up}\\% and the new price then falls by ${down}\\%. ` +
              `What is the final price, in dollars?`,
        mechanism: { abstraction: 1, filtering: 1, hidden_step: 1 },
        fingerprintParts: { ctx: 'percentage-change no-stimulus', chain: ['apply-first-change', 'apply-second-change'],
          target: 'value:price', options: 'percentage-rivals', distract: ['D2', 'D2', 'D2'],
          narrative: 'price-changed-twice', numeric: ['base', 'rise', 'fall'] },
      });
  },

  // An exterior angle read as an interior one: two correct angle sums, one of
  // the wrong triangle.
  A16: (rand) => {
    const A = rand.int(25, 70), C = rand.int(35, 80);
    const ext = 180 - C;
    const key = 180 - A - C, rival = 180 - A - ext;
    if (key <= 0 || rival <= 0 || key === rival) return { error: 'the configuration is degenerate' };
    if (key === A || key === C) return { error: 'the triangle is isosceles, which hides the misreading' };
    return OK(rand,
      [S('interior angle at C', Q(C)), S('angle sum of the triangle', Q(key))],
      [S('take the exterior angle as interior', Q(ext)), S('angle sum with that value', Q(rival))],
      [{ name: 'reported-the-exterior-angle', value: Q(ext), cost: 1 },
       { name: 'subtracted-from-90-instead', value: Q(90 - A), cost: 1 }],
      {
        family: 'A16', construct: 'exterior-angle-of-a-triangle',
        method: 'convert-the-exterior-angle-then-use-the-sum', rivalName: 'used-the-exterior-angle-as-interior',
        stem: `In triangle $ABC$, angle $A$ measures $${A}^{\\circ}$ and the exterior angle at $C$ measures $${ext}^{\\circ}$. ` +
              `What is the measure, in degrees, of angle $B$?`,
        mechanism: { abstraction: 1, repr_switch: 1, inference: 1 },
        fingerprintParts: { ctx: 'triangle no-stimulus', chain: ['exterior-to-interior', 'angle-sum'],
          target: 'value:angle', options: 'angle-rivals', distract: ['D2', 'D3', 'D3'],
          narrative: 'named-triangle-two-angles', numeric: ['angle-a', 'exterior-c'] },
      });
  },

  // A proportion inverted on one side: the same three operations, in the wrong
  // arrangement, carried to a printed answer.
  A08: (rand) => {
    const d = rand.pick([3, 4, 5, 6]), n = rand.int(2, 9) * d;
    const s = rand.int(2, 9), t = rand.int(2, 12);
    const key = qSub(Q(n * s, d), Q(t));
    const rival = qSub(Q(d * s, n), Q(t));
    if (qEq(key, rival)) return { error: 'the inversion changes nothing' };
    if (!qIsInt(key)) return { error: 'the answer is not a whole number' };
    return OK(rand,
      [S('cross-multiply', Q(n * s, d)), S('subtract the offset', key)],
      [S('cross-multiply the inverted ratio', Q(d * s, n)), S('subtract the offset', rival)],
      [{ name: 'stopped-before-the-offset', value: Q(n * s, d), cost: 1 },
       { name: 'added-the-offset-instead', value: qAdd(Q(n * s, d), Q(t)), cost: 2 }],
      {
        family: 'A08', construct: 'proportion-with-an-offset',
        method: 'cross-multiply-then-adjust', rivalName: 'inverted-one-ratio',
        stem: `If $\\dfrac{x + ${t}}{${s}} = \\dfrac{${n}}{${d}}$, what is the value of $x$?`,
        mechanism: { abstraction: 1, hidden_step: 1, filtering: 1 },
        fingerprintParts: { ctx: 'proportion no-stimulus', chain: ['cross-multiply', 'isolate-the-variable'],
          target: 'value:x', options: 'proportion-rivals', distract: ['D2', 'D3', 'D2'],
          narrative: 'symbols-only:proportion', numeric: ['numerator', 'denominator', 'offset'] },
      });
  },

  // Composition in the wrong order: both evaluations are complete and correct.
  A09: (rand) => {
    const a = rand.int(2, 5), b = rand.nonZero(-8, 8), c = rand.nonZero(-9, 9);
    const x = rand.nonZero(-4, 4);
    const f = t => a * t + b, g = t => t * t + c;
    const key = Q(f(g(x))), rival = Q(g(f(x)));
    if (qEq(key, rival)) return { error: 'the two orders agree' };
    return OK(rand,
      [S('inner value g(x)', Q(g(x))), S('outer value f of that', key)],
      [S('inner value f(x)', Q(f(x))), S('outer value g of that', rival)],
      [{ name: 'multiplied-the-two-outputs', value: Q(f(x) * g(x)), cost: 2 },
       { name: 'reported-the-inner-value', value: Q(g(x)), cost: 1 }],
      {
        family: 'A09', construct: 'composition-order',
        method: 'evaluate-inside-out', rivalName: 'composed-in-the-other-order',
        stem: `The functions $f$ and $g$ are defined by $f(x) = ${coef(a, 'x')} ${term(b, '')}$ and $g(x) = x^2 ${term(c, '')}$. ` +
              `What is the value of $f(g(${x}))$?`,
        mechanism: { abstraction: 1, repr_switch: 1, multiconcept: 1 },
        fingerprintParts: { ctx: 'functions no-stimulus', chain: ['evaluate-inner', 'evaluate-outer'],
          target: 'value:composite', options: 'order-rivals', distract: ['D2', 'D3', 'D2'],
          narrative: 'symbols-only:two-functions', numeric: ['coeff-f', 'const-f', 'const-g', 'input'] },
      });
  },

  // "Consecutive odd" read as "consecutive": the same three-step setup, solved
  // correctly, for the wrong family of integers.
  A18: (rand) => {
    const k = rand.int(3, 25);          // smallest odd is 2k-1
    const small = 2 * k - 1;
    const total = 3 * small + 6;
    const key = Q(small);
    if ((total - 3) % 3 !== 0) return { error: 'the rival reading has no integer solution' };
    const rival = Q((total - 3) / 3);
    if (qEq(key, rival)) return { error: 'the two readings agree' };
    return OK(rand,
      [S('3n + 6 = total', Q(total - 6)), S('divide by 3', key)],
      [S('3n + 3 = total', Q(total - 3)), S('divide by 3', rival)],
      [{ name: 'reported-the-middle-integer', value: Q(small + 2), cost: 2 },
       { name: 'reported-the-largest', value: Q(small + 4), cost: 2 }],
      {
        family: 'A18', construct: 'consecutive-odd-integers',
        method: 'set-up-with-a-gap-of-two', rivalName: 'set-up-with-a-gap-of-one',
        stem: `The sum of three consecutive odd integers is ${total}. What is the least of the three integers?`,
        mechanism: { abstraction: 1, filtering: 1, inference: 1 },
        fingerprintParts: { ctx: 'integer-properties no-stimulus', chain: ['set-up-the-three-terms', 'solve-the-linear-equation'],
          target: 'value:integer', options: 'spacing-rivals', distract: ['D2', 'D2', 'D2'],
          narrative: 'three-integers-summed', numeric: ['total'] },
      });
  },

  // A rival that reports the solved variable where the question asked for a
  // multiple of it. The reference codes this target shift at full cost when the
  // shifted value is itself the endpoint of a complete solution (T4 Q27, T3 Q26).
  A01: (rand) => {
    const a = rand.int(4, 9), b = rand.int(1, 3), p = rand.nonZero(-12, 12), q = rand.nonZero(-12, 12);
    const d = a - b, mult = rand.pick([2, 3]);
    if (d <= 1 || p === q) return { error: 'the two sides do not separate' };
    const rhs = q - p;
    if (rhs % d !== 0) return { error: 'the solution is not a whole number' };
    const x = rhs / d;
    if (x === 0) return { error: 'a zero solution hides the target shift' };
    const key = Q(mult * x), rival = Q(x);
    return OK(rand,
      [S('collect the variable terms', Q(d)), S('divide, then take the multiple asked for', key)],
      [S('collect the variable terms', Q(d)), S('divide and report the variable', rival)],
      [{ name: 'divided-the-wrong-side', value: Q(rhs), cost: 1 },
       { name: 'negated-the-solution', value: Q(-mult * x), cost: 2 }],
      {
        family: 'A01', construct: 'multiple-of-the-solution',
        method: 'solve-then-scale', rivalName: 'reported-the-variable-itself',
        stem: `If $${coef(a, 'x')} ${term(p, '')} = ${coef(b, 'x')} ${term(q, '')}$, what is the value of $${mult}x$?`,
        mechanism: { abstraction: 1, hidden_step: 1, filtering: 1 },
        fingerprintParts: { ctx: 'pure-algebraic no-stimulus', chain: ['collect-like-terms', 'scale-the-solution'],
          target: 'value:multiple', options: 'target-shift-rivals', distract: ['D2', 'D3', 'D2'],
          narrative: 'symbols-only:1', numeric: ['coeff-left', 'coeff-right', 'consts', 'multiplier'] },
      });
  },

  // "after the first n" — the rival charges from the start, which is a complete
  // and internally consistent model of a different tariff.
  A02: (rand) => {
    const flat = rand.int(2, 9), per = rand.int(2, 6), free = rand.int(2, 5);
    const d = free + rand.int(3, 9);
    const key = Q(flat + per * (d - free)), rival = Q(flat + per * d);
    return OK(rand,
      [S('chargeable distance', Q(d - free)), S('flat fee plus the rate on that distance', key)],
      [S('total distance', Q(d)), S('flat fee plus the rate on all of it', rival)],
      [{ name: 'omitted-the-flat-fee', value: Q(per * (d - free)), cost: 1 },
       { name: 'charged-the-free-portion-only', value: Q(flat + per * free), cost: 2 }],
      {
        family: 'A02', construct: 'tariff-after-a-free-allowance',
        method: 'subtract-the-allowance-then-charge', rivalName: 'charged-from-the-start',
        stem: `A cab charges a fixed $\\$${flat}$ plus $\\$${per}$ for each kilometre travelled beyond the first ${free} kilometres. ` +
              `What is the total charge, in dollars, for a journey of ${d} kilometres?`,
        mechanism: { abstraction: 1, filtering: 1, inference: 1 },
        fingerprintParts: { ctx: 'linear-cost no-stimulus', chain: ['identify-the-chargeable-part', 'apply-the-tariff'],
          target: 'value:charge', options: 'allowance-rivals', distract: ['D2', 'D3', 'D2'],
          narrative: 'single-entity-fee-rate', numeric: ['flat', 'rate', 'allowance', 'distance'] },
      });
  },

  // T2 Q36: "A is EXACTLY the excluded strict endpoint." The rival does every
  // step of the work and then applies the wrong rounding rule to the boundary.
  A04: (rand) => {
    const have = rand.int(40, 78), need = rand.int(80, 96), each = rand.pick([3, 4, 6, 7]);
    const gap = need - have;
    if (gap % each === 0) return { error: 'the boundary is exact, so no rounding decision is made' };
    const key = Q(Math.ceil(gap / each)), rival = Q(Math.floor(gap / each));
    return OK(rand,
      [S('points still needed', Q(gap)), S('divide by the value of one task', Q(gap, each)), S('round up to a whole task', key)],
      [S('points still needed', Q(gap)), S('divide by the value of one task', Q(gap, each)), S('round down to a whole task', rival)],
      [{ name: 'reported-the-points-not-the-tasks', value: Q(gap), cost: 1 },
       { name: 'divided-the-target-instead-of-the-gap', value: Q(Math.ceil(need / each)), cost: 2 }],
      {
        family: 'A04', construct: 'least-whole-number-to-clear-a-threshold',
        method: 'divide-the-gap-then-round-up', rivalName: 'rounded-down-at-the-boundary',
        stem: `A student has ${have} points and needs at least ${need} points. Each completed task is worth ${each} points. ` +
              `What is the least number of tasks the student must complete?`,
        mechanism: { abstraction: 1, filtering: 1, hidden_step: 1 },
        fingerprintParts: { ctx: 'threshold no-stimulus', chain: ['find-the-shortfall', 'divide-and-round'],
          target: 'value:count', options: 'boundary-rivals', distract: ['D2', 'D1', 'D2'],
          narrative: 'target-to-reach', numeric: ['have', 'need', 'per-task'] },
      });
  },

  // T4 Q33: "A=5 is the absolute value of the NEGATIVE root — a precise trap."
  A06: (rand) => {
    const r1 = rand.int(2, 9), r2 = -rand.int(2, 9);
    if (r1 === -r2) return { error: 'symmetric roots hide the misreading' };
    const b = -(r1 + r2), c = r1 * r2;
    const key = Q(r1), rival = Q(-r2);
    if (qEq(key, rival)) return { error: 'the two readings agree' };
    return OK(rand,
      [S('factor the quadratic', Q(c)), S('take the positive solution', key)],
      [S('factor the quadratic', Q(c)), S('take the magnitude of the negative solution', rival)],
      [{ name: 'reported-the-negative-solution', value: Q(r2), cost: 2 },
       { name: 'reported-the-sum-of-the-solutions', value: Q(r1 + r2), cost: 2 }],
      {
        family: 'A06', construct: 'positive-root-of-a-quadratic',
        method: 'factor-and-select-the-positive-root', rivalName: 'took-the-magnitude-of-the-negative-root',
        stem: `The equation $x^2 ${term(b, 'x')} ${term(c, '')} = 0$ has two solutions. What is the positive solution?`,
        mechanism: { abstraction: 1, filtering: 1, hidden_step: 1 },
        fingerprintParts: { ctx: 'quadratic no-stimulus', chain: ['factor', 'select-by-sign'],
          target: 'value:root', options: 'root-rivals', distract: ['D2', 'D2', 'D2'],
          narrative: 'symbols-only:quadratic', numeric: ['coeff-b', 'const-c'] },
      });
  },

  // Counting under the wrong rule: both counts are complete and correct.
  A15b: (rand) => {
    const n = rand.int(4, 7), k = rand.pick([2, 3]);
    if (k >= n) return { error: 'the code is longer than the alphabet' };
    let ordered = 1; for (let i = 0; i < k; i++) ordered *= (n - i);
    const key = Q(ordered), rival = Q(n ** k);
    if (qEq(key, rival)) return { error: 'the two rules agree' };
    return OK(rand,
      [S('choices for the first two places', Q(n * (n - 1))), S('multiply through the remaining places', key)],
      [S('choices for the first two places if repeats were allowed', Q(n * n)), S('multiply through the remaining places', rival)],
      [{ name: 'divided-out-the-order', value: Q(ordered, k === 2 ? 2 : 6), cost: 2 },
       { name: 'multiplied-the-two-counts', value: Q(n * k), cost: 1 }],
      {
        family: 'A15', construct: 'codes-without-repetition',
        method: 'multiply-the-shrinking-choices', rivalName: 'allowed-repetition',
        stem: `A code is formed by writing ${k} of the ${n} letters A to ${String.fromCharCode(64 + n)} in a row, ` +
              `and no letter may be used more than once. How many different codes are possible?`,
        mechanism: { abstraction: 1, multiconcept: 1, inference: 1 },
        fingerprintParts: { ctx: 'counting no-stimulus', chain: ['count-the-first-places', 'complete-the-product'],
          target: 'value:count', options: 'counting-rule-rivals', distract: ['D2', 'D2', 'D3'],
          narrative: 'codes-from-letters', numeric: ['alphabet', 'length'] },
      });
  },

  // ── non-value targets ──────────────────────────────────────────────────────
  //
  // Every reference form asks at least four DIFFERENT kinds of thing, and only
  // 64-76% of its items ask for a value. The first thirteen Core constructs all
  // asked for a value, which took the whole form to 88% and tripped the
  // authenticity gate. These three ask for an object instead.
  //
  // Their option values are INDICES, as the routine expression constructs
  // already do: the four printed options are expressions or claims, so there is
  // no arithmetic value to compare. Path intermediates use indices at 100+ so
  // they can never collide with a printed option — an intermediate is never
  // printed, and the rivalry test only asks whether the rival's value is among
  // them.

  A03: (rand) => {                                   // equivalent expression
    const a = rand.int(2, 6), b = rand.nonZero(-9, 9), c = rand.int(2, 6), d = rand.nonZero(-9, 9);
    const ac = a * c, ad = a * d, bc = b * c, bd = b * d;
    const mid = ad + bc;
    if (mid === 0 || bd === 0 || a + c === ac) return { error: 'a vanishing or coinciding term hides the rival' };
    const texts = [
      `${coef(ac, 'x^2')} ${term(mid, 'x')} ${term(bd, '')}`,
      `${coef(ac, 'x^2')} ${term(bd, '')}`,
      `${coef(ac, 'x^2')} ${term(mid, 'x')} ${term(-bd, '')}`,
      `${coef(a + c, 'x^2')} ${term(mid, 'x')} ${term(bd, '')}`,
    ];
    if (new Set(texts).size !== 4) return { error: 'two options print identically' };
    return OK(rand,
      [S('multiply the outer and inner terms', Q(100)), S('collect and write the trinomial', Q(0))],
      [S('multiply the first terms and the last terms', Q(101)), S('write those two products as the answer', Q(1))],
      [{ name: 'sign-slip-on-the-constant', value: Q(2), cost: 2 },
       { name: 'added-the-leading-coefficients', value: Q(3), cost: 1 }],
      {
        family: 'A03', construct: 'equivalent-quadratic-expression',
        method: 'expand-fully-then-collect', rivalName: 'multiplied-firsts-and-lasts-only',
        stem: `Which of the following is equivalent to $(${coef(a, 'x')} ${term(b, '')})(${coef(c, 'x')} ${term(d, '')})$?`,
        mechanism: { abstraction: 1, filtering: 1, hidden_step: 1 },
        fingerprintParts: { ctx: 'polynomial no-stimulus', chain: ['expand-the-product', 'collect-like-terms'],
          target: 'selection:expression', options: 'expression-set', distract: ['D2', 'D2', 'D3'],
          narrative: 'symbols-only:product', numeric: ['coeff-a', 'const-b', 'coeff-c', 'const-d'] },
      }, v => texts[qNum(v)]);
  },

  A05b: (rand) => {                                  // which point lies on the line
    const a = rand.int(2, 6), b = rand.nonZero(-6, 6);
    const x1 = rand.nonZero(-6, 6), y1 = rand.nonZero(-6, 6);
    const c = a * x1 + b * y1;
    // The rival satisfies the line with the coordinates SWAPPED — a complete,
    // correct substitution into the equation the student thinks they read.
    const swapOK = (a * y1 + b * x1) === c;
    if (swapOK || x1 === y1) return { error: 'the swapped point also lies on the line' };
    const texts = [`(${x1}, ${y1})`, `(${y1}, ${x1})`, `(${-x1}, ${y1})`, `(${x1}, ${-y1})`];
    if (new Set(texts).size !== 4) return { error: 'two options print identically' };
    if (a * (-x1) + b * y1 === c || a * x1 + b * (-y1) === c) return { error: 'a sign-slip point also lies on the line' };
    return OK(rand,
      [S('substitute a candidate into the equation', Q(100)), S('keep the pair that satisfies it', Q(0))],
      [S('substitute with the coordinates read in the other order', Q(101)), S('keep the pair that satisfies that', Q(1))],
      [{ name: 'sign-slip-on-the-abscissa', value: Q(2), cost: 2 },
       { name: 'sign-slip-on-the-ordinate', value: Q(3), cost: 2 }],
      {
        family: 'A05', construct: 'point-on-a-line',
        method: 'substitute-and-verify', rivalName: 'read-the-pair-in-the-other-order',
        stem: `In the $xy$-plane, line $\\ell$ has equation $${coef(a, 'x')} ${term(b, 'y')} = ${c}$. ` +
              `Which of the following points lies on $\\ell$?`,
        mechanism: { abstraction: 1, repr_switch: 1, filtering: 1 },
        fingerprintParts: { ctx: 'coordinate-line no-stimulus', chain: ['substitute-a-candidate', 'verify-the-equality'],
          target: 'selection:point', options: 'point-set', distract: ['D2', 'D3', 'D3'],
          narrative: 'symbols-only:line-and-points', numeric: ['coeff-x', 'coeff-y', 'const'] },
      }, v => texts[qNum(v)]);
  },

  A18b: (rand) => {                                  // which statement must be true
    const k = rand.pick([3, 4, 5, 6]);
    const texts = [
      `$n$ is divisible by ${k}`,
      `$n$ is divisible by ${k * k * k}`,
      `$n$ is odd`,
      `$n$ is divisible by ${k + 1}`,
    ];
    return OK(rand,
      [S('write n as a multiple of the square', Q(100)), S('conclude the weaker divisibility', Q(0))],
      [S('write n as a multiple of the square', Q(101)), S('multiply the divisor in once more', Q(1))],
      [{ name: 'assumed-parity', value: Q(2), cost: 1 },
       { name: 'shifted-the-divisor', value: Q(3), cost: 1 }],
      {
        family: 'A18', construct: 'divisibility-consequence',
        method: 'weaken-the-given-divisibility', rivalName: 'strengthened-it-instead',
        stem: `The positive integer $n$ is divisible by $${k * k}$. Which of the following must be true?`,
        mechanism: { abstraction: 1, inference: 1, filtering: 1 },
        fingerprintParts: { ctx: 'integer-properties no-stimulus', chain: ['read-the-given-divisibility', 'deduce-what-follows'],
          target: 'selection:claim', options: 'prose-claims', distract: ['D2', 'D5', 'D5'],
          narrative: 'one-integer-constrained', numeric: ['divisor'] },
      }, v => texts[qNum(v)]);
  },

  /* ══════════════════════════════════════════════════════════════════════
     SERIES-CAPACITY EXPANSION
     ══════════════════════════════════════════════════════════════════════

     Measured, not guessed. Over twelve assembled forms the Core stream fills
     12.4 of 50 slots from 17 objects and 8 of those 17 appear in EVERY form;
     the mechanism stream fills 19.2 from 22 objects with 16 in every form. The
     routine stream, after 62 new asks, holds 55 objects at 3.4 forms each. So
     the series-reuse the generator still has is almost entirely Core and
     mechanism, and adding routine vocabulary cannot touch it: routine is 16 of
     50 slots and its objects were already spread.

     Blueprint core-slot demand against the supply this pass started with:
     A13 wanted 6 and had 0 constructs of its own (only readers), A09 wanted 3
     and had 1, A07/A08/A14 wanted 2 each and had 1, A10 wanted 1 and had none.
     Every construct below closes one of those, and every one of them names a
     reference archetype the library previously could not build.               */

  // The parabola's symmetry, asked as "which other input gives this output".
  // The rival solves f(a) = 0 — a different question, answered correctly.
  A09b: (rand) => {
    const h = rand.int(2, 7), d = rand.int(1, 3);
    const x0 = h + d, key = h - d, zero = 2 * h;         // the given input, the answer, f's other zero
    if (2 * h <= 3 * d) return { error: 'the axis is not near the key' };
    if (key === 0 || [zero, x0, h].some(v => v === key) || zero === x0 || zero === h || x0 === h)
      return { error: 'two options coincide' };
    return OK(rand,
      [S('the axis of symmetry is x = h', Q(h)), S('reflect the given input across it', Q(key))],
      [S('set f(a) = 0', Q(0)), S('take the non-zero root', Q(zero))],
      [{ name: 'reported-the-given-input', value: Q(x0), cost: 1 },
       { name: 'reported-the-axis-of-symmetry', value: Q(h), cost: 1 }],
      { family: 'A09', construct: 'other-input-with-the-same-output',
        method: 'reflect-across-the-axis-of-symmetry', rivalName: 'solved-for-a-zero-instead',
        stem: `The function $f$ is defined by $f(x) = x^{2} ${term(-2 * h, 'x')}$. If $f(a) = f(${x0})$ and $a \\neq ${x0}$, ` +
              `what is the value of $a$?`,
        mechanism: { abstraction: 1, nonobvious_rel: 1, reversal: 1 },
        fingerprintParts: { ctx: 'quadratic no-stimulus', chain: ['locate-the-axis', 'reflect-the-input'],
          target: 'value:input', options: 'symmetry-rivals', distract: ['D2', 'D6', 'D3'],
          narrative: 'symbols-only:equal-outputs', numeric: ['axis', 'given-input'] } });
  },

  // How many real solutions, where the rival counts the non-zero ones.
  A07b: (rand) => {
    // Three shapes, not one. A single shape gave this construct nine possible
    // instances, and with A07 holding two Core slots the anti-clone rule left a
    // seed in sixteen with nothing placeable. The shapes differ in what gets
    // lost when you divide through — a root, or a repeated root's multiplicity
    // — so they are three instances of one object, not three objects.
    const k = rand.pick([1, 4, 9, 16, 25, 36, 49, 64, 81]);
    const r = Math.round(Math.sqrt(k));
    const a = rand.nonZero(-9, 9);
    const shape = rand.pick(['cubic', 'quartic', 'repeated']);
    const spec = {
      cubic: { key: 3, rival: 2, slips: [1, 0], divisor: 'x',
        stem: `How many distinct real solutions does the equation $x^{3} = ${k}x$ have?`,
        left: 'factor out x', right: 'divide both sides by x' },
      quartic: { key: 3, rival: 2, slips: [4, 1], divisor: 'x squared',
        stem: `How many distinct real solutions does the equation $x^{4} = ${k}x^{2}$ have?`,
        left: 'factor out x squared', right: 'divide both sides by x squared' },
      repeated: { key: 2, rival: 1, slips: [3, 0], divisor: 'x squared',
        stem: `How many distinct real solutions does the equation $x^{3} ${term(a, 'x^{2}')} = 0$ have?`,
        left: 'factor out x squared', right: 'divide both sides by x squared' },
    }[shape];
    if (shape !== 'repeated' && r * r !== k) return { error: 'the roots are not printable' };
    return OK(rand,
      [S(spec.left, Q(0)), S('count every distinct root of the factored form', Q(spec.key))],
      [S(spec.right, Q(1)), S('count the roots that remain', Q(spec.rival))],
      [{ name: 'counted-roots-with-multiplicity', value: Q(spec.slips[0]), cost: 1 },
       { name: 'lost-every-root-but-one', value: Q(spec.slips[1]), cost: 1 }],
      { family: 'A07', construct: 'count-real-solutions-of-a-cubic',
        method: 'factor-then-count-all-roots', rivalName: `divided-through-by-${spec.divisor.replace(' ', '-')}-first`,
        stem: spec.stem,
        mechanism: { abstraction: 1, filtering: 1, hidden_step: 1 },
        fingerprintParts: { ctx: 'polynomials no-stimulus', chain: ['factor-the-polynomial', 'count-the-distinct-roots'],
          target: 'value:count', options: 'lost-root-rivals', distract: ['D3', 'D6', 'D6'],
          narrative: `symbols-only:${shape}-equation`, numeric: ['coefficient'] } });
  },

  // The inverse of a shifted reciprocal, against evaluating it forwards.
  A08b: (rand) => {
    const h = rand.int(2, 7), c = rand.int(2, 6), y = c + rand.int(1, 4);
    const key = qAdd(Q(h), Q(1, y - c));                 // solve y = 1/(x-h) + c
    const fwd = qAdd(Q(1, y - h), Q(c));                 // f(y): a different question
    if (y === h) return { error: 'the forward evaluation is undefined' };
    if (qEq(key, fwd) || qEq(key, Q(1, y)) || qEq(fwd, Q(1, y)) || qEq(key, Q(h)) || qEq(fwd, Q(h)))
      return { error: 'two options coincide' };
    return OK(rand,
      [S('subtract the outer constant', Q(y - c)), S('invert and add the shift', key)],
      [S('substitute the given number into f', Q(1, y - h)), S('add the outer constant', fwd)],
      [{ name: 'took-the-reciprocal-of-the-input', value: Q(1, y), cost: 1 },
       { name: 'reported-the-shift', value: Q(h), cost: 1 }],
      { family: 'A08', construct: 'inverse-of-a-shifted-reciprocal',
        method: 'undo-each-operation-in-turn', rivalName: 'evaluated-the-function-forwards',
        stem: `The function $f$ is defined by $f(x) = \\dfrac{1}{x - ${h}} + ${c}$. What is the value of $f^{-1}(${y})$?`,
        mechanism: { abstraction: 1, reversal: 1, repr_switch: 1 },
        fingerprintParts: { ctx: 'rational-function no-stimulus', chain: ['peel-the-outer-constant', 'invert-the-reciprocal'],
          target: 'value:inverse', options: 'direction-rivals', distract: ['D2', 'D3', 'D6'],
          narrative: 'symbols-only:shifted-reciprocal', numeric: ['shift', 'constant', 'output'] } });
  },

  // The real part of a square, against the modulus squared.
  A10: (rand) => {
    // a >= 2b keeps the modulus-squared rival inside the factor-of-three window
    // without rejection: (a^2 + b^2) < 3(a^2 - b^2) whenever a > b * sqrt(2).
    const b = rand.int(1, 3), a = rand.int(2 * b, 7);
    const key = a * a - b * b, mod = a * a + b * b, im = 2 * a * b;
    if (key === 0 || [mod, im, a * a].some(v => v === key) || mod === im || mod === a * a || im === a * a)
      return { error: 'two options coincide' };
    return OK(rand,
      [S('expand the square', Q(a * a)), S('replace i^2 with -1 and collect the real terms', Q(key))],
      [S('square each component', Q(b * b)), S('add them as if i^2 were +1', Q(mod))],
      [{ name: 'reported-the-imaginary-part', value: Q(im), cost: 1 },
       { name: 'squared-only-the-real-component', value: Q(a * a), cost: 1 }],
      { family: 'A10', construct: 'real-part-of-a-square',
        method: 'expand-then-apply-i-squared', rivalName: 'added-the-squares-instead',
        stem: `In the complex number system, $i^{2} = -1$. What is the real part of $(${a} + ${b}i)^{2}$?`,
        mechanism: { abstraction: 1, repr_switch: 1, hidden_step: 1 },
        fingerprintParts: { ctx: 'complex-numbers no-stimulus', chain: ['expand-the-binomial-square', 'apply-i-squared'],
          target: 'value:real-part', options: 'sign-of-i-squared-rivals', distract: ['D3', 'D2', 'D2'],
          narrative: 'symbols-only:complex-square', numeric: ['real', 'imaginary'] } });
  },

  // Undoing two years of growth, against applying the same percent downward.
  A11c: (rand) => {
    const p = rand.pick([20, 25, 50]), base = rand.int(2, 9);
    const up = (100 + p) / 100, down = (100 - p) / 100;
    const key = base * 10000, final = key * up * up;
    const rival = final * down * down, oneYear = key * up;
    if (!Number.isInteger(final) || !Number.isInteger(rival)) return { error: 'a price is not a whole number' };
    const flat = final - Math.round(final * 2 * p / 100);
    if (!Number.isInteger(final * 2 * p / 100)) return { error: 'the flat-percent slip is not whole' };
    if ([rival, oneYear, flat].some(v => v === key) || rival === oneYear || rival === flat || oneYear === flat)
      return { error: 'two options coincide' };
    return OK(rand,
      [S('divide by the growth factor', Q(oneYear)), S('divide by it again', Q(key))],
      [S('reduce the final value by the same percent', Q(final * down)), S('reduce it again', Q(rival))],
      [{ name: 'undid-only-one-year', value: Q(oneYear), cost: 1 },
       { name: 'subtracted-twice-the-percent-of-the-final-value', value: Q(flat), cost: 2 }],
      { family: 'A11', construct: 'reverse-two-years-of-growth',
        method: 'divide-by-the-growth-factor-twice', rivalName: 'applied-the-same-percent-downward',
        stem: `An investment grows by ${p}% each year. After two years it is worth $${final}. ` +
              `What was it worth at the start?`,
        mechanism: { abstraction: 1, reversal: 1, multiconcept: 1 },
        fingerprintParts: { ctx: 'growth no-stimulus', chain: ['identify-the-growth-factor', 'divide-it-out-twice'],
          target: 'value:initial', options: 'direction-rivals', distract: ['D2', 'D3', 'D3'],
          narrative: 'words-only:two-year-growth', numeric: ['percent', 'final-value'] } });
  },

  // A rise and a fall of the same percent, which do NOT cancel.
  A12c: (rand) => {
    const p = rand.pick([10, 20, 25, 50]), key = rand.int(2, 9) * 100;
    const up = key * (100 + p) / 100, final = up * (100 - p) / 100;
    // Undoing the fall correctly lands on the mid-point price — those are the
    // same number, which made two options identical on 46 of 60 seeds. The
    // second slip adds the percent back instead of dividing it out.
    const fallFirst = key * (100 - p) / 100;             // whole because the key is a multiple of 100
    if (!Number.isInteger(final)) return { error: 'the final price is not whole' };
    if ([final, up, fallFirst].some(v => v === key) || final === up || final === fallFirst || up === fallFirst)
      return { error: 'two options coincide' };
    return OK(rand,
      [S('undo the fall', Q(up)), S('undo the rise', Q(key))],
      [S('note the two percents are equal', Q(p)), S('conclude they cancel, so the price is unchanged', Q(final))],
      [{ name: 'undid-only-the-fall', value: Q(up), cost: 1 },
       { name: 'applied-the-fall-to-the-original-price', value: Q(fallFirst), cost: 2 }],
      { family: 'A12', construct: 'rise-then-fall-does-not-cancel',
        method: 'undo-each-change-in-turn', rivalName: 'assumed-the-two-percents-cancel',
        stem: `The price of an item rose by ${p}% and then fell by ${p}%. It is now $${final}. ` +
              `What was the price, in dollars, before the rise?`,
        mechanism: { abstraction: 1, nonobvious_rel: 1, reversal: 1 },
        fingerprintParts: { ctx: 'percent no-stimulus', chain: ['undo-the-second-change', 'undo-the-first'],
          target: 'value:original', options: 'cancellation-rivals', distract: ['D2', 'D3', 'D2'],
          narrative: 'words-only:two-price-changes', numeric: ['percent', 'final-price'] } });
  },

  // The slope of a line of best fit, against the reciprocal slope.
  A14b: (rand) => {
    const x1 = rand.int(1, 5), dx = rand.int(2, 6), m = rand.int(2, 6);
    const y1 = rand.int(2, 15), x2 = x1 + dx, y2 = y1 + m * dx;
    const inv = Q(dx, m * dx), dy = m * dx;
    if (qEq(inv, Q(m)) || dy === m || qEq(Q(y1, x1), Q(m)) || qEq(Q(y1, x1), inv) || Q(y1, x1).n === dy * Q(y1, x1).d)
      return { error: 'two options coincide' };
    return OK(rand,
      [S('find the change in y', Q(dy)), S('divide by the change in x', Q(m))],
      [S('find the change in x', Q(dx)), S('divide by the change in y', inv)],
      [{ name: 'reported-the-total-rise', value: Q(dy), cost: 1 },
       { name: 'used-the-first-point-as-a-ratio', value: Q(y1, x1), cost: 2 }],
      { family: 'A14', construct: 'slope-of-a-line-of-best-fit',
        method: 'rise-over-run', rivalName: 'run-over-rise',
        stem: `A line of best fit passes through the points $(${x1}, ${y1})$ and $(${x2}, ${y2})$. What is its slope?`,
        mechanism: { abstraction: 1, repr_switch: 1, multiconcept: 1 },
        fingerprintParts: { ctx: 'statistics no-stimulus', chain: ['difference-the-coordinates', 'form-the-ratio'],
          target: 'value:slope', options: 'ratio-orientation-rivals', distract: ['D2', 'D1', 'D2'],
          narrative: 'symbols-only:two-points', numeric: ['x1', 'y1', 'run', 'slope'] } });
  },

  // A trigonometric ratio in disguise: the rival forms a different ratio, correctly.
  A16b: (rand) => {
    const [o, a, h] = rand.pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15]]);
    const key = Q(a, h), tan = Q(o, a), given = Q(o, h), sec = Q(h, a);
    if ([tan, given, sec].some(v => qEq(v, key)) || qEq(tan, given) || qEq(tan, sec) || qEq(given, sec))
      return { error: 'two ratios coincide' };
    return OK(rand,
      [S('find the third side', Q(a)), S('form adjacent over hypotenuse', key)],
      [S('find the third side', Q(a)), S('form opposite over adjacent', tan)],
      [{ name: 'repeated-the-given-ratio', value: given, cost: 1 },
       { name: 'inverted-the-cosine', value: sec, cost: 2 }],
      { family: 'A16', construct: 'cosine-from-a-given-sine',
        method: 'complete-the-triangle-then-take-cosine', rivalName: 'formed-the-tangent-instead',
        stem: `In a right triangle, the measure of angle $A$ is acute and $\\sin A = \\dfrac{${o}}{${h}}$. ` +
              `What is the value of $\\cos A$?`,
        mechanism: { abstraction: 1, repr_switch: 1, multiconcept: 1 },
        fingerprintParts: { ctx: 'trigonometry no-stimulus', chain: ['find-the-missing-side', 'form-the-named-ratio'],
          target: 'value:ratio', options: 'which-ratio-rivals', distract: ['D2', 'D6', 'D3'],
          narrative: 'words-only:right-triangle', numeric: ['opposite', 'hypotenuse'] } });
  },

  // Circumference in terms of pi, against area in terms of pi.
  A17b: (rand) => {
    const r = rand.pick([3, 5, 6, 7]), h = rand.int(-6, 6), k = rand.int(-6, 6);
    // The doubled-diameter slip is twice the key, so a near distractor is
    // guaranteed; the earlier guard tested the AREA for nearness and threw away
    // every radius above five for a distractor that never had to be close.
    const key = 2 * r, area = r * r;
    if ([area, r, 4 * r].some(v => v === key) || area === r || area === 4 * r) return { error: 'two options coincide' };
    return OK(rand,
      [S('read the radius off the two points', Q(r)), S('apply C = 2 pi r', Q(key))],
      [S('read the radius off the two points', Q(r)), S('apply A = pi r squared', Q(area))],
      [{ name: 'reported-the-radius', value: Q(r), cost: 1 },
       { name: 'doubled-the-diameter', value: Q(4 * r), cost: 2 }],
      { family: 'A17', construct: 'circumference-from-two-points',
        method: 'radius-then-circumference', rivalName: 'computed-the-area-instead',
        stem: `In the $xy$-plane, a circle has centre $(${h}, ${k})$ and passes through $(${h + r}, ${k})$. ` +
              `The circumference of the circle is $n\\pi$. What is the value of $n$?`,
        mechanism: { abstraction: 1, repr_switch: 1, multiconcept: 1 },
        fingerprintParts: { ctx: 'coordinate-geometry no-stimulus', chain: ['measure-the-radius', 'apply-the-circumference-formula'],
          target: 'value:coefficient', options: 'formula-rivals', distract: ['D2', 'D6', 'D3'],
          narrative: 'symbols-only:centre-and-point', numeric: ['centre-x', 'centre-y', 'radius'] } });
  },

  // Two draws WITH replacement, against two draws without.
  A15c: (rand) => {
    const red = rand.int(2, 5), blue = rand.int(3, 7), n = red + blue;
    const key = Q(red * red, n * n), without = Q(red * (red - 1), n * (n - 1));
    const one = Q(red, n), both = Q(2 * red, n);
    if (red < 2) return { error: 'a second draw without replacement is impossible' };
    if ([without, one, both].some(v => qEq(v, key)) || qEq(without, one) || qEq(without, both) || qEq(one, both))
      return { error: 'two options coincide' };
    return OK(rand,
      [S('probability of a red on one draw', one), S('square it, because the bag is restored', key)],
      [S('probability of a red on one draw', one), S('multiply by the reduced second draw', without)],
      [{ name: 'reported-a-single-draw', value: one, cost: 1 },
       { name: 'added-the-two-draws', value: both, cost: 1 }],
      { family: 'A15', construct: 'two-draws-with-replacement',
        method: 'square-the-single-draw-probability', rivalName: 'computed-it-without-replacement',
        stem: `A bag contains ${red} red marbles and ${blue} blue marbles. A marble is drawn at random, its colour is ` +
              `recorded, and it is returned to the bag; then a second marble is drawn. What is the probability that ` +
              `both marbles are red?`,
        mechanism: { abstraction: 1, filtering: 1, multiconcept: 1 },
        fingerprintParts: { ctx: 'probability no-stimulus', chain: ['single-draw-probability', 'combine-two-independent-draws'],
          target: 'value:probability', options: 'replacement-rivals', distract: ['D2', 'D6', 'D3'],
          narrative: 'words-only:two-draws', numeric: ['red', 'blue'] } });
  },

  // Two points of a linear function, extrapolated the wrong way by the rival.
  A05c: (rand) => {
    const m = rand.nonZero(-6, 6), b = rand.nonZero(-9, 9);
    const x1 = rand.int(1, 4), x2 = x1 + rand.int(2, 5);
    const y1 = m * x1 + b, y2 = m * x2 + b;
    const wrongWay = y1 + m * x1;                        // f(2 x1): a different question
    if ([wrongWay, m, -b].some(v => v === b) || wrongWay === m || wrongWay === -b || m === -b)
      return { error: 'two options coincide' };
    return OK(rand,
      [S('find the constant difference per unit', Q(m)), S('step back from the first point to x = 0', Q(b))],
      [S('find the constant difference per unit', Q(m)), S('step the same distance forward instead', Q(wrongWay))],
      [{ name: 'reported-the-rate-of-change', value: Q(m), cost: 1 },
       { name: 'stepped-back-with-the-wrong-sign', value: Q(-b), cost: 1 }],
      { family: 'A05', construct: 'intercept-from-two-table-rows',
        method: 'rate-then-step-back-to-zero', rivalName: 'stepped-forward-instead-of-back',
        stem: `A linear function $f$ satisfies $f(${x1}) = ${y1}$ and $f(${x2}) = ${y2}$. What is the value of $f(0)$?`,
        mechanism: { abstraction: 1, repr_switch: 1, reversal: 1 },
        fingerprintParts: { ctx: 'lines no-stimulus', chain: ['find-the-rate', 'extrapolate-to-the-intercept'],
          target: 'value:intercept', options: 'direction-rivals', distract: ['D3', 'D6', 'D6'],
          narrative: 'symbols-only:two-function-values', numeric: ['x1', 'x2', 'slope', 'intercept'] } });
  },

  // A01 and A16 each held one Core object against a Core slot the blueprint asks
  // for every form, so that object appeared in all twelve measured forms. Two
  // more structures, from the same measured list.

  // Solve, then answer a DIFFERENT expression. The rival applies the target
  // expression to the number the question printed, which is arithmetic done
  // correctly on the wrong quantity.
  A01c: (rand) => {
    const m = rand.int(2, 5), k = rand.int(2, 9), n = rand.int(2, 9);
    const total = m * n + k;
    const tm = rand.int(2, 4), tk = rand.int(2, 9);
    const key = tm * n - tk, rival = tm * total - tk;
    const bare = tm * n;
    if (key <= 0 || [rival, n, bare].some(v => v === key) || rival === n || rival === bare || n === bare)
      return { error: 'two options coincide' };
    if (Math.abs(n) <= Math.abs(key) / 3 || Math.abs(n) >= Math.abs(key) * 3)
      return { error: 'no distractor is near the key' };
    return OK(rand,
      [S('undo the addition', Q(m * n)), S('divide by the multiplier', Q(n)), S('evaluate the asked expression', Q(key))],
      [S('take the stated total', Q(total)), S(`multiply it by ${tm}`, Q(tm * total)), S('subtract the offset', Q(rival))],
      [{ name: 'reported-the-number-itself', value: Q(n), cost: 2 },
       { name: 'forgot-the-subtraction-in-the-target', value: Q(bare), cost: 2 }],
      { family: 'A01', construct: 'solve-then-evaluate-a-different-expression',
        method: 'solve-for-the-number-then-substitute', rivalName: 'applied-the-target-to-the-printed-total',
        stem: `${m} times a number, increased by ${k}, is ${total}. What is ${tm} times the number, decreased by ${tk}?`,
        mechanism: { abstraction: 1, repr_switch: 1, hidden_step: 1 },
        fingerprintParts: { ctx: 'linear no-stimulus', chain: ['translate-the-sentence', 'solve', 'evaluate-the-target'],
          target: 'value:expression', options: 'which-quantity-rivals', distract: ['D2', 'D6', 'D3'],
          narrative: 'words-only:two-expressions', numeric: ['multiplier', 'offset', 'total', 'target-m', 'target-k'] } });
  },

  // A midline-style similar triangle. The rival forms AD/DB — a real ratio in
  // the figure, and the wrong one.
  A16c: (rand) => {
    const ad = rand.int(2, 8), db = rand.int(2, 8), t = rand.int(2, 5);
    if (ad === db) return { error: 'the two segments are equal, so the ratios coincide' };
    const ab = ad + db, bc = ab * t;
    const key = ad * t, rival = Q(bc * ad, db), wrongPart = Q(bc * db, ab);
    if (qEq(rival, Q(key)) || qEq(rival, Q(bc)) || qEq(rival, wrongPart) || qEq(rival, Q(ab))
        || [bc, qNum(wrongPart), ab].some(v => v === key) || bc === qNum(wrongPart))
      return { error: 'two options coincide' };
    if (qNum(rival) <= key / 3 || qNum(rival) >= key * 3) return { error: 'the wrong-ratio rival is not a near miss' };
    return OK(rand,
      [S('find the whole side', Q(ab)), S('form the ratio of the part to the whole', Q(ad, ab)), S('scale the parallel side', Q(key))],
      [S('read the two parts', Q(ad)), S('form the ratio of one part to the other', Q(ad, db)), S('scale the parallel side', rival)],
      [{ name: 'reported-the-given-parallel-side', value: Q(bc), cost: 1 },
       { name: 'scaled-by-the-other-part', value: wrongPart, cost: 2 }],
      { family: 'A16', construct: 'parallel-cut-similar-triangles',
        method: 'part-over-whole-then-scale', rivalName: 'used-part-over-part',
        stem: `In triangle $ABC$, point $D$ lies on $\\overline{AB}$ and point $E$ lies on $\\overline{AC}$, and ` +
              `$\\overline{DE}$ is parallel to $\\overline{BC}$. If $AD = ${ad}$, $DB = ${db}$ and $BC = ${bc}$, ` +
              `what is the length of $\\overline{DE}$?`,
        mechanism: { abstraction: 1, nonobvious_rel: 1, multiconcept: 1 },
        fingerprintParts: { ctx: 'geometry no-stimulus', chain: ['identify-the-similar-triangles', 'form-the-correct-ratio', 'scale'],
          target: 'value:length', options: 'which-ratio-rivals', distract: ['D2', 'D6', 'D3'],
          narrative: 'words-only:parallel-cut-triangle', numeric: ['ad', 'db', 'bc'] } });
  },

  // A06 held ONE Core construct against a Core slot the blueprint always asks
  // for, and one seed in twelve had nothing left that fit. A second structure
  // is the fix; loosening the slot rules would not have been.
  //
  // The intersection of a parabola and a line, where the rival reads the
  // parabola's own roots — the right relation applied to the wrong equation.
  A06b: (rand) => {
    const b = rand.nonZero(-7, 7), c = rand.nonZero(-9, 9);
    const m = rand.nonZero(-7, 7), d = rand.nonZero(-9, 9);
    const key = m - b, ownRoots = -b, prod = c - d;
    if (key === 0 || m === 2 * b) return { error: 'the two root sums coincide' };
    if ([ownRoots, prod, m].some(v => v === key) || ownRoots === prod || ownRoots === m || prod === m)
      return { error: 'two options coincide' };
    if (Math.abs(ownRoots) <= Math.abs(key) / 3 || Math.abs(ownRoots) >= Math.abs(key) * 3)
      return { error: 'the rival reading is not a near miss' };
    return OK(rand,
      [S('set the two expressions equal and collect', Q(b - m)), S('the sum of the roots is minus that coefficient', Q(key))],
      [S('look at the parabola on its own', Q(b)), S('the sum of ITS roots is minus b', Q(ownRoots))],
      [{ name: 'reported-the-product-of-the-intersection-abscissae', value: Q(prod), cost: 2 },
       { name: 'reported-the-slope-of-the-line', value: Q(m), cost: 1 }],
      { family: 'A06', construct: 'sum-of-intersection-abscissae',
        method: 'equate-then-use-the-root-sum', rivalName: 'used-the-parabolas-own-roots',
        stem: `In the $xy$-plane, the graph of $y = x^{2} ${term(b, 'x')} ${term(c, '')}$ intersects the line ` +
              `$y = ${coef(m, 'x')} ${term(d, '')}$ at two points, whose $x$-coordinates are $p$ and $q$. ` +
              `What is the value of $p + q$?`,
        mechanism: { abstraction: 1, nonobvious_rel: 1, hidden_step: 1 },
        fingerprintParts: { ctx: 'quadratic no-stimulus', chain: ['equate-the-two-curves', 'apply-the-root-sum-relation'],
          target: 'value:root-sum', options: 'which-equation-rivals', distract: ['D2', 'D3', 'D6'],
          narrative: 'symbols-only:parabola-and-line', numeric: ['coeff-b', 'const-c', 'slope-m', 'intercept-d'] } });
  },

  // The parameter that makes a system inconsistent, against matching constants.
  A03b: (rand) => {
    // The constants are put in a ratio ONE away from the coefficient ratio, so
    // the rival answer is a near miss by construction. Sampling them freely put
    // it outside the factor-of-three window, or on top of another option, on
    // more than half of all seeds.
    const c1 = rand.int(2, 5), c2 = rand.int(2, 4);
    const t = c2 + rand.pick([-1, 1]);
    if (t < 2) return { error: 'the constant ratio would be degenerate' };
    const r2 = rand.int(2, 8), r1 = t * r2;
    const key = c1 * c2;                                 // k / c1 = c2 / 1
    const consts = Q(c1 * t);                            // matching the constant ratio instead
    if (qEq(consts, Q(key)) || qEq(consts, Q(c1)) || qEq(consts, Q(c2)) || key === c1 || key === c2 || c1 === c2)
      return { error: 'two options coincide' };
    return OK(rand,
      [S('write the ratio the coefficients must share', Q(c2)), S('solve for the parameter', Q(key))],
      [S('write the ratio of the constants', Q(r1, r2)), S('solve as if that were the condition', consts)],
      [{ name: 'matched-the-x-coefficients', value: Q(c1), cost: 1 },
       { name: 'matched-the-y-coefficients', value: Q(c2), cost: 1 }],
      { family: 'A03', construct: 'parameter-for-no-solution',
        method: 'match-the-coefficient-ratios', rivalName: 'matched-the-constant-ratio-instead',
        stem: `The system of equations $kx + ${coef(c2, 'y')} = ${r1}$ and $${coef(c1, 'x')} + y = ${r2}$ has no solution. ` +
              `What is the value of $k$?`,
        mechanism: { abstraction: 1, nonobvious_rel: 1, hidden_step: 1 },
        fingerprintParts: { ctx: 'systems no-stimulus', chain: ['compare-the-coefficient-ratios', 'solve-for-the-parameter'],
          target: 'value:parameter', options: 'which-ratio-rivals', distract: ['D2', 'D6', 'D6'],
          narrative: 'symbols-only:parametric-system', numeric: ['coeff-c1', 'coeff-c2', 'rhs-1', 'rhs-2'] } });
  },
};

/* ────────────────────────── registry ────────────────────────── */

export const CORE_CONSTRUCTS = CONSTRUCTS;

/** Which assembler family each construct serves. Keyed by construct id. */
export const CORE_SERVES = {
  A11: 'A11', A14: 'A14', A05: 'A05', A12: 'A12', A11b: 'A11',
  A15: 'A15', A07: 'A07', A17: 'A17', A12b: 'A12', A16: 'A16',
  A08: 'A08', A09: 'A09', A18: 'A18',
  // Added once the assembler measured which families were forcing Entry: with
  // no Core construct, a family holding three slots and one mechanism structure
  // has to put two of them in Entry whatever the plan says.
  A01: 'A01', A02: 'A02', A04: 'A04', A06: 'A06', A15b: 'A15',
  // Non-value targets, added when the authenticity gate measured 88% of a
  // form asking for a value against the reference's 64-76%.
  A03: 'A03', A05b: 'A05', A18b: 'A18',
  // Series-capacity expansion. Placed where the blueprint's core-slot demand
  // exceeded the stream's supply, which was measured rather than assumed.
  A09b: 'A09', A07b: 'A07', A08b: 'A08', A10: 'A10', A11c: 'A11',
  A12c: 'A12', A14b: 'A14', A16b: 'A16', A17b: 'A17', A15c: 'A15',
  A05c: 'A05', A03b: 'A03', A06b: 'A06', A01c: 'A01', A16c: 'A16',
};

/** Generate one Core item for a construct id, or an error. */
export function coreItem(id, seed) {
  const fn = CONSTRUCTS[id];
  if (!fn) return { error: `no Core construct ${id}` };
  let it;
  try { it = fn(rng(seed)); } catch (e) { return { error: `threw: ${e.message}` }; }
  if (!it || it.error) return { error: it?.error || 'construct produced nothing' };
  it.primitive = `C-${id}`;
  it.species = 'core';
  it.form = it.construct;
  it.seed = seed;
  it.steps = stepsOf(it);
  const v = assessCore(it);
  if (!v.ok) return { error: v.reasons.join('; ') };
  return it;
}

/** Generate `count` accepted Core items for a construct id. */
export function generateCore(id, count, { seed = 1, maxTries = 600 } = {}) {
  const items = [], rejected = [];
  let s = seed, tries = 0;
  while (items.length < count && tries < maxTries) {
    const it = coreItem(id, s++);
    tries++;
    if (it.error) { rejected.push(it.error); continue; }
    items.push(it);
  }
  return { items, tries, rejected };
}

/* ────────────────────────── Core readers of a shared display ────────────────────────── */
//
// WHY THESE EXIST SEPARATELY FROM THE CONSTRUCTS ABOVE
//
// Ten of the fifty slots in the blueprint belong to four SHARED-STIMULUS SETS,
// and eight of those ten are family A13. A set is assembled as a unit from a
// pool of READERS of one generated display, so a construct that makes its own
// display cannot fill a set slot. With only routine readers available, every
// one of those ten slots was forced to Entry — and with A13 taking eight of
// them, the whole form's Entry floor was 15 against a plan of 13.
//
// The corpus does not agree that a chart question is an easy question. T4 Q14
// is Core: the publisher lists all four two-year totals and the tallest single
// bar is not the largest two-year total. T3 Q24 is Core: the whole item is that
// "2011 is 0". T4 Q11 is Core: a conversion chained with a percentage. What
// those share is the Core-stream shape — a rival reading of the same display,
// carried out correctly, landing on a printed option.
//
// So these are Core-stream items that happen to read a shared display. They
// declare the same solution/rival paths, they are checked by assessCore(), and
// est-routine.mjs merges them into the reader pool so a set can draw from both.

const READER_OK = (rand, solution, rival, slips, meta, fmt = qStr) => OK(rand, solution, rival, slips, meta, fmt);

export const CORE_READERS = {
  'bar-chart': {
    // T4 Q14: the largest two-day total is not the two tallest bars.
    A13: [{ name: 'core-bar-consecutive-pair', read: (rand, st) => {
      const v = st.values;
      const pairs = [0, 1, 2].map(i => v[i] + v[i + 1]);
      const best = Math.max(...pairs);
      if (pairs.filter(p => p === best).length > 1) return { error: 'two consecutive pairs tie' };
      const sorted = [...v].sort((a, b) => b - a);
      const topTwo = sorted[0] + sorted[1];
      if (topTwo === best) return { error: 'the two tallest bars are already consecutive' };
      return READER_OK(rand,
        [S('total each consecutive pair', Q(pairs[0])), S('take the largest of the three', Q(best))],
        [S('take the tallest bar', Q(sorted[0])), S('add the next tallest', Q(topTwo))],
        [{ name: 'read-the-tallest-bar-alone', value: Q(sorted[0]), cost: 1 },
         { name: 'totalled-all-four-days', value: Q(v.reduce((a, b) => a + b, 0)), cost: 1 }],
        { family: 'A13', construct: 'largest-consecutive-pair', stimulus: st,
          method: 'total-each-adjacent-pair', rivalName: 'added-the-two-tallest-bars',
          stem: `The bar chart shows the number of items sold on four days. What is the greatest number of items sold over any two consecutive days?`,
          mechanism: { repr_switch: 1, filtering: 1, hidden_step: 1 },
          fingerprintParts: { ctx: 'stimulus:bar-chart shared', chain: ['total-adjacent-pairs', 'maximise-over-pairs'],
            target: 'value:pair-total', options: 'aggregation-rivals', distract: ['D2', 'D1', 'D1'],
            narrative: 'four-category-display', numeric: ['bar-values'] } });
    } },

    // "A is what percent of B" — the rival answers "B is what percent of A",
    // correctly. Six of the blueprint's twenty-eight Core slots are A13 and the
    // stream had no A13 construct of its own, only this reader pool.
    { name: 'core-bar-percent-of-another', read: (rand, st) => {
      const v = st.values, i = rand.int(0, v.length - 1);
      let j = rand.int(0, v.length - 1);
      if (i === j) j = (j + 1) % v.length;
      const a = v[i], b = v[j];
      if (a === b) return { error: 'the two bars are equal' };
      const key = Q(a * 100, b), rival = Q(b * 100, a);
      const total = v.reduce((x, y) => x + y, 0);
      const ofTotal = Q(a * 100, total), diff = Q(Math.abs(a - b));
      if ([rival, ofTotal, diff].some(x => qEq(x, key)) || qEq(rival, ofTotal) || qEq(rival, diff) || qEq(ofTotal, diff))
        return { error: 'two options coincide' };
      if (qNum(rival) <= qNum(key) / 3 || qNum(rival) >= qNum(key) * 3)
        return { error: 'the reversed reading is not a near miss' };
      return READER_OK(rand,
        [S('read both bars', Q(a)), S('divide the first by the second as a percent', key)],
        [S('read both bars', Q(b)), S('divide the second by the first as a percent', rival)],
        [{ name: 'used-the-grand-total-as-the-base', value: ofTotal, cost: 2 },
         { name: 'reported-the-raw-difference', value: diff, cost: 1 }],
        { family: 'A13', construct: 'one-bar-as-a-percent-of-another', stimulus: st,
          method: 'divide-the-named-bar-by-the-reference-bar', rivalName: 'divided-in-the-other-direction',
          stem: `The bar chart shows the number of items sold on ${v.length} days. The number sold on ` +
                `${st.categories[i]} is what percent of the number sold on ${st.categories[j]}?`,
          mechanism: { repr_switch: 1, filtering: 1, inference: 1 },
          fingerprintParts: { ctx: 'stimulus:bar-chart shared', chain: ['read-two-bars', 'form-the-percent-in-the-stated-direction'],
            target: 'value:percent', options: 'base-rivals', distract: ['D2', 'D3', 'D6'],
            narrative: 'four-category-display', numeric: ['bar-values'] } });
    } },

    // A percent decrease, where the rival divides by the new value — the single
    // most common wrong base in the corpus's own percent items.
    { name: 'core-bar-percent-decrease', read: (rand, st) => {
      const v = st.values, first = v[0], last = v[v.length - 1];
      if (last >= first) return { error: 'the series does not fall' };
      const drop = first - last;
      const key = Q(drop * 100, first), rival = Q(drop * 100, last);
      if (qEq(key, rival) || qEq(Q(drop), key) || qEq(Q(drop), rival) || qEq(Q(last * 100, first), key)
          || qEq(Q(last * 100, first), rival) || qEq(Q(last * 100, first), Q(drop)))
        return { error: 'two options coincide' };
      if (qNum(rival) <= qNum(key) / 3 || qNum(rival) >= qNum(key) * 3)
        return { error: 'the wrong-base reading is not a near miss' };
      return READER_OK(rand,
        [S('find the fall', Q(drop)), S('divide by the starting value', key)],
        [S('find the fall', Q(drop)), S('divide by the finishing value', rival)],
        [{ name: 'reported-the-raw-fall', value: Q(drop), cost: 1 },
         { name: 'reported-the-finishing-value-as-a-percent-of-the-start', value: Q(last * 100, first), cost: 2 }],
        { family: 'A13', construct: 'percent-decrease-across-a-series', stimulus: st,
          method: 'divide-the-fall-by-the-original', rivalName: 'divided-the-fall-by-the-final-value',
          stem: `The bar chart shows the number of items sold on ${v.length} days. By what percent did the number sold ` +
                `fall from ${st.categories[0]} to ${st.categories[v.length - 1]}?`,
          mechanism: { repr_switch: 1, filtering: 1, hidden_step: 1 },
          fingerprintParts: { ctx: 'stimulus:bar-chart shared', chain: ['difference-the-endpoints', 'divide-by-the-original'],
            target: 'value:percent', options: 'base-rivals', distract: ['D6', 'D2', 'D3'],
            narrative: 'four-category-display', numeric: ['bar-values'] } });
    } }],
  },

  table: {
    // T3 Q24: the denominator is the item. Three listed regions, four depots.
    A13: [{ name: 'core-table-share-out', read: (rand, st) => {
      const total = st.rows.reduce((a, r) => a + r[1], 0);
      const depots = st.rows.length + 1;
      const key = Q(total, depots), rival = Q(total, st.rows.length);
      if (!qIsInt(key)) return { error: 'the share is not a whole number' };
      return READER_OK(rand,
        [S('total the regions', Q(total)), S('divide by the number of depots', key)],
        [S('total the regions', Q(total)), S('divide by the number of regions', rival)],
        [{ name: 'reported-the-total', value: Q(total), cost: 1 },
         { name: 'read-the-largest-region-only', value: Q(Math.max(...st.rows.map(r => r[1]))), cost: 1 }],
        { family: 'A13', construct: 'share-a-table-total', stimulus: st,
          method: 'total-then-divide-by-the-depots', rivalName: 'divided-by-the-number-of-rows',
          stem: `The table shows deliveries by region. All of the deliveries are to be shared equally among ${depots} depots. ` +
                `How many deliveries does each depot receive?`,
          mechanism: { repr_switch: 1, filtering: 1, inference: 1 },
          fingerprintParts: { ctx: 'stimulus:table shared', chain: ['total-the-rows', 'divide-by-a-stated-count'],
            target: 'value:share', options: 'denominator-rivals', distract: ['D2', 'D1', 'D1'],
            narrative: 'three-row-table', numeric: ['row-values', 'depots'] } });
    } },

    // The table is printed in hundreds and the question is asked in units. The
    // rival totals every row — the right arithmetic on the wrong selection.
    { name: 'core-table-scaled-pair', read: (rand, st) => {
      const rows = st.rows;
      if (rows.length < 3) return { error: 'the table has too few rows to leave one out' };
      const i = rand.int(0, rows.length - 1);
      const j = (i + 1) % rows.length;
      const pair = rows[i][1] + rows[j][1];
      const total = rows.reduce((a, r) => a + r[1], 0);
      if (pair === total) return { error: 'the two named rows are the whole table' };
      if ([total, pair * 100, total * 100].some(x => x === pair) || total * 100 === pair * 100)
        return { error: 'two options coincide' };
      if (total * 100 >= pair * 300) return { error: 'the whole-table rival is not a near miss' };
      return READER_OK(rand,
        [S('add the two named rows', Q(pair)), S('convert from hundreds to units', Q(pair * 100))],
        [S('add every row', Q(total)), S('convert from hundreds to units', Q(total * 100))],
        [{ name: 'forgot-the-scale', value: Q(pair), cost: 1 },
         { name: 'totalled-every-row-and-forgot-the-scale', value: Q(total), cost: 2 }],
        { family: 'A13', construct: 'scaled-table-selected-rows', stimulus: st,
          method: 'select-the-named-rows-then-apply-the-scale', rivalName: 'totalled-every-row',
          stem: `The table shows deliveries by region, in hundreds. How many deliveries were made in the ` +
                `${rows[i][0]} and ${rows[j][0]} regions combined?`,
          mechanism: { repr_switch: 1, filtering: 1, multiconcept: 1 },
          fingerprintParts: { ctx: 'stimulus:table shared', chain: ['select-the-named-rows', 'apply-the-printed-scale'],
            target: 'value:count', options: 'selection-and-scale-rivals', distract: ['D2', 'D3', 'D2'],
            narrative: 'three-row-table', numeric: ['row-values'] } });
    } }],
  },

  'data-list': {
    // The mean where the median is the natural summary, and the reverse.
    A14: [{ name: 'core-list-mean-vs-median', read: (rand, st) => {
      const v = st.values, n = v.length;
      const sum = v.reduce((a, b) => a + b, 0);
      if (sum % n !== 0) return { error: 'the mean is not a whole number' };
      const key = Q(sum / n), median = Q(v[(n - 1) / 2]);
      if (qEq(key, median)) return { error: 'the mean and the median coincide' };
      return READER_OK(rand,
        [S('total the values', Q(sum)), S('divide by how many there are', key)],
        [S('order the values', Q(v[0])), S('take the middle one', median)],
        [{ name: 'divided-by-one-fewer', value: Q(sum, n - 1), cost: 2 },
         { name: 'reported-the-range', value: Q(Math.max(...v) - Math.min(...v)), cost: 1 }],
        { family: 'A14', construct: 'mean-against-median', stimulus: st,
          method: 'total-then-divide', rivalName: 'reported-the-median',
          stem: `The list shows the recorded values. What is the mean of the values?`,
          mechanism: { repr_switch: 1, filtering: 1, multiconcept: 1 },
          fingerprintParts: { ctx: 'stimulus:data-list shared', chain: ['total-the-list', 'divide-by-the-count'],
            target: 'value:mean', options: 'summary-rivals', distract: ['D2', 'D2', 'D1'],
            narrative: 'five-value-list', numeric: ['list-values'] } });
    } }],

    // How many beat the average — with the median as the rival centre.
    A13: [{ name: 'core-list-count-above-mean', read: (rand, st) => {
      const v = st.values, n = v.length;
      const sum = v.reduce((a, b) => a + b, 0);
      // The answer is a COUNT, so the mean itself is never printed and need not
      // be a whole number.
      const mean = sum / n, median = v[(n - 1) / 2];
      if (mean === median) return { error: 'the mean and the median coincide' };
      const key = v.filter(x => x > mean).length, rival = v.filter(x => x > median).length;
      if (key === rival) return { error: 'the two centres separate the list identically' };
      if (key === 0 || key === n) return { error: 'the mean separates nothing' };
      return READER_OK(rand,
        [S('find the mean', Q(sum, n)), S('count the values above it', Q(key))],
        [S('find the median', Q(median)), S('count the values above it', Q(rival))],
        [{ name: 'counted-at-or-above-the-mean', value: Q(v.filter(x => x >= mean).length), cost: 2 },
         { name: 'counted-below-instead', value: Q(n - key), cost: 1 }],
        { family: 'A13', construct: 'count-above-the-mean', stimulus: st,
          method: 'compute-the-mean-then-count', rivalName: 'counted-above-the-median',
          stem: `The list shows the recorded values. How many of the values are greater than the mean of the values?`,
          mechanism: { repr_switch: 1, filtering: 1, hidden_step: 1 },
          fingerprintParts: { ctx: 'stimulus:data-list shared', chain: ['compute-the-centre', 'count-against-it'],
            target: 'value:count', options: 'centre-rivals', distract: ['D6', 'D5', 'D2'],
            narrative: 'five-value-list', numeric: ['list-values'] } });
    } }],
  },
};
