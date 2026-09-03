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
