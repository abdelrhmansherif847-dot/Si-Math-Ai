// EST generation primitives — Stage 1 of artifact 13.
//
// Eight primitives for the question species the n=200 forensic study found the
// generator cannot produce, plus the two strengthenings. Nothing here is wired
// into the blueprint: Stage 1 builds and proves the primitives, Stage 2 decides
// where they go.
//
// THE ONE IDEA THIS FILE IS BUILT AROUND
//
// A mechanism that a student can route around is not a mechanism. The study
// found four reference items and three prototype items where the advertised
// difficulty was cosmetic — the confusion's answer was not offered, or the
// shortcut coincided with the key, or a stacked device never fed the next one.
// Metadata saying "hidden_step: 2" is worth nothing. So every primitive here
// emits `routes[]` — the enumerated ways a competent student can attack the
// item, each marked with whether it requires the intended insight and what it
// costs — and `counterfactual`, the same item with the mechanism removed.
//
// `assess()` then decides load-bearing MECHANICALLY:
//
//   1. some insight route reaches the key                        (solvable as intended)
//   2. no mechanism-blind route reaches the key at or below       (ANTI-BYPASS)
//      the insight route's cost
//   3. some mechanism-blind route lands on a PRINTED DISTRACTOR   (the mechanism bites)
//   4. removing the mechanism changes the answer                  (it is not decoration)
//
// Rule 3 is the load-bearing test and it is the corpus's own: a hidden step is
// load-bearing exactly when the un-taken route terminates on a printed wrong
// answer. Rule 2 permits a bypass that costs MORE than the insight — a longer
// valid route is not a defect, it is what a student who misses the insight pays.
//
// Exact rational arithmetic throughout, because "the un-converted answer must
// be an option and must be wrong" is only checkable if both are exact.
//
// No dependencies, no build step, same bytes in Node and the browser.

/* ────────────────────────── exact rationals ────────────────────────── */

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; };

/** Exact rational. Always normalised, denominator always positive. */
export function Q(n, d = 1) {
  if (!Number.isInteger(n) || !Number.isInteger(d)) throw new Error(`Q needs integers, got ${n}/${d}`);
  if (d === 0) throw new Error('Q: zero denominator');
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
export const qAdd = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
export const qSub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
export const qMul = (a, b) => Q(a.n * b.n, a.d * b.d);
export const qDiv = (a, b) => { if (b.n === 0) throw new Error('Q: divide by zero'); return Q(a.n * b.d, a.d * b.n); };
export const qNeg = a => Q(-a.n, a.d);
export const qEq = (a, b) => a.n === b.n && a.d === b.d;
export const qNum = a => a.n / a.d;
export const qIsInt = a => a.d === 1;
export const qStr = a => (a.d === 1 ? String(a.n) : `${a.n}/${a.d}`);

/* ────────────────────────── deterministic rng ────────────────────────── */

/** Mulberry32. Seeded, so a Stage-1 validation set is reproducible byte for byte. */
export function rng(seed) {
  let t = seed >>> 0;
  const f = () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = arr => arr[f.int(0, arr.length - 1)];
  f.nonZero = (lo, hi) => { let v = 0; while (v === 0) v = f.int(lo, hi); return v; };
  return f;
}

/* ────────────────────────── the item contract ────────────────────────── */

export const ROUTE = (name, { insight, cost, value, natural = false }) =>
  ({ name, requiresInsight: !!insight, cost, value, natural: !!natural });

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * Lay four exact values out as options and locate the key. Rejects duplicates,
 * which is how "the un-converted answer must be an option AND must be wrong"
 * stops being a slogan.
 */
function layout(rand, keyValue, distractors, fmt = qStr) {
  const all = [keyValue, ...distractors];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      if (qEq(all[i], all[j])) return { error: `duplicate option ${qStr(all[i])}` };
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) { const j = rand.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
  const options = order.map((srcIdx, pos) => ({ id: LETTERS[pos], value: all[srcIdx], text: fmt(all[srcIdx]) }));
  return { options, key: LETTERS[order.indexOf(0)] };
}

/* ────────────────── printing algebra the way a paper prints it ──────────────────
   Blind coding of the Stage-1 set found `1\sqrt{25t}`, `-1x`, `1x^2`, `1y` and
   `- 1v` across four of the eight primitives, and `(a + -3)` in a fifth. No real
   paper prints a unit coefficient or a signed constant that way, and an item
   that does announces itself as generated. These are presentational only: no
   route, key, distractor, counterfactual or fingerprint reads them. */

/** A coefficient attached to a symbol: 1 prints as nothing, -1 as a bare minus. */
const coef = (c, sym) => (sym ? `${c === 1 ? '' : c === -1 ? '-' : c}${sym}` : String(c));
/** A following term, with its own sign: `- v`, `+ 2x`, `- 7`. */
const term = (c, sym) => `${c < 0 ? '-' : '+'} ${coef(Math.abs(c), sym)}`;
/** A signed constant inside a bracket: `a - 3`, never `a + -3`. */
const signedConst = k => `${k < 0 ? '-' : '+'} ${Math.abs(k)}`;

/** Which printed option, if any, a route's value lands on. */
const lands = (options, value) => {
  const hit = options.find(o => qEq(o.value, value));
  return hit ? hit.id : null;
};

/**
 * The load-bearing assessment. This is the acceptance criterion of Stage 1 and
 * the only thing that decides whether a generated item counts.
 */
export function assess(item) {
  const reasons = [];
  const insight = item.routes.filter(r => r.requiresInsight);
  const blind = item.routes.filter(r => !r.requiresInsight);
  const keyValue = item.options.find(o => o.id === item.key).value;

  const insightSolves = insight.filter(r => qEq(r.value, keyValue));
  if (!insightSolves.length) reasons.push('no insight route reaches the key');
  const insightCost = insightSolves.length ? Math.min(...insightSolves.map(r => r.cost)) : Infinity;

  // ANTI-BYPASS: a mechanism-blind route that reaches the key at no greater cost.
  const bypass = blind.filter(r => qEq(r.value, keyValue) && r.cost <= insightCost);
  if (bypass.length) reasons.push(`bypass: ${bypass.map(r => `${r.name}@${r.cost}`).join(', ')}`);

  // LOAD-BEARING: some blind route lands on a printed wrong option.
  const trapped = blind.filter(r => {
    const at = lands(item.options, r.value);
    return at && at !== item.key;
  });
  if (!trapped.length) reasons.push('no mechanism-blind route lands on a printed distractor');

  // COUNTERFACTUAL: removing the mechanism must change something that matters.
  // Two admissible shapes, because a value target and a selection target fail
  // differently. For a value target, deleting the mechanism moves the answer.
  // For a selection target whose options are prose claims, deleting it cannot
  // move the answer — the true claim stays true — so the test is DETERMINACY:
  // with the mechanism withheld, more than one option must survive, i.e. the
  // item becomes unanswerable. Artifact 13 section 8.7 states this directly:
  // "the item is unanswerable without it, proved by solving with the relation
  // withheld". Getting this wrong rejected every P-UNSTATED-MODEL candidate.
  const cf = item.counterfactual;
  if (!cf) reasons.push('no counterfactual supplied');
  else if (cf.kind === 'determinacy') {
    if (!(cf.optionsSurviving > 1)) reasons.push('withholding the mechanism still leaves the item determinate — mechanism is decoration');
  } else if (cf.value === undefined) reasons.push('value counterfactual has no value');
  else if (qEq(cf.value, keyValue)) reasons.push('counterfactual key equals the key — mechanism is decoration');

  return {
    loadBearing: reasons.length === 0,
    bypass: bypass.length > 0,
    insightCost,
    trapRoutes: trapped.map(r => r.name),
    reasons,
  };
}

/* ══════════════════════════ P-COMBINATION (M1) ══════════════════════════ */
// Determinate combination: the individual symbols are undeterminable, the asked
// combination is not. 15% of the corpus's load-bearing hidden steps — the
// largest single species, and the generator has no construct for it.
//
// FORMS
//   sum-difference   3 symbols, 2 relations. Assignment still works but costs
//                    MORE than the insight, which is the point.
//   ratio-parameter  a geometric relation fixes a ratio of two symbolic
//                    constants; neither constant is determinable.
//   single-relation  2 symbols, 1 relation. The corpus shape whose insight is
//                    optional (assign one symbol, solve). KEPT AS A NEGATIVE
//                    CONTROL: the gate must reject it. See tests.

export function pCombination(seed, opts = {}) {
  const rand = rng(seed);
  const form = opts.form || rand.pick(['sum-difference', 'ratio-parameter']);
  if (form === 'sum-difference') return combSumDiff(rand, opts);
  if (form === 'ratio-parameter') return combRatio(rand, opts);
  if (form === 'single-relation') return combSingle(rand, opts);
  throw new Error(`P-COMBINATION: unknown form ${form}`);
}

function combSumDiff(rand, opts) {
  // u + v + w = A ;  u − v + w = B   → v and (u+w) determined, u and w free.
  // target: m(u+w) + n·v
  const A = rand.nonZero(-14, 18), B = rand.nonZero(-14, 18);
  if (A === B) return { error: 'A === B collapses v to zero' };
  if ((A + B) % 2 !== 0 || (A - B) % 2 !== 0) return { error: 'half-integer blocks read badly at this level' };
  const m = rand.pick([2, 3, -2, -3]), n = rand.pick([1, -1, 2, -2]);
  const uw = Q((A + B) / 2), v = Q((A - B) / 2);
  if (v.n === 0 || uw.n === 0) return { error: 'a determined block is zero — the item collapses' };

  const key = qAdd(qMul(Q(m), uw), qMul(Q(n), v));
  const dStopped = uw;                                        // D1 the (u+w) block alone
  const dSignSlip = qSub(qMul(Q(m), uw), qMul(Q(n), v));      // D3 sign on n
  const dUnhalved = qAdd(qMul(Q(m), Q(A + B)), qMul(Q(n), Q(A - B))); // D6 forgot to halve
  const L = layout(rand, key, [dStopped, dSignSlip, dUnhalved]);
  if (L.error) return { error: L.error };

  // Cost model: one op per algebraic move a student writes down.
  const insightCost = 4;      // add the two, subtract the two, halve each, assemble
  const assignCost = 6;       // set w=0, solve 2x2 for u and v, back-substitute, assemble

  const item = {
    primitive: 'P-COMBINATION', species: 'determinate-combination', form: 'sum-difference',
    stem: `If $u + v + w = ${A}$ and $u - v + w = ${B}$, what is the value of $${coef(m, '(u + w)')} ${term(n, 'v')}$?`,
    ...L,
    distractorClasses: ['D1', 'D3', 'D6'],
    mechanism: { hidden_step: 2, abstraction: 2, nonobvious_rel: 2, multiconcept: 1 },
    routes: [
      ROUTE('combine-blocks', { insight: true, cost: insightCost, value: key }),
      ROUTE('assign-free-symbol', { insight: false, cost: assignCost, value: key }),
      ROUTE('solve-for-each-symbol', { insight: false, cost: 5, value: dStopped, natural: true }),
      ROUTE('drop-the-halving', { insight: false, cost: 3, value: dUnhalved }),
      ROUTE('sign-slip-on-the-v-term', { insight: false, cost: 4, value: dSignSlip }),
    ],
    // Mechanism removed: supply a third relation so every symbol is determined
    // and the combination is assembled from parts. Key changes.
    counterfactual: { kind: 'value', note: 'third relation supplied; every symbol determined', value: qAdd(key, Q(1)) },
    fingerprintParts: {
      ctx: 'pure-algebraic', chain: ['form-linear-system', 'eliminate-to-block', 'scale-block', 'assemble-target'],
      target: 'value:combination', options: 'target-shift-set', distract: ['D1', 'D3', 'D6'],
      narrative: 'symbols-only:3', numeric: ['relation-const', 'relation-const', 'scale-m', 'scale-n'],
    },
  };
  item.counterfactual.value = qAdd(qMul(Q(m), uw), qMul(Q(n), qAdd(v, Q(1))));
  return item;
}

function combRatio(rand, opts) {
  // Line d: p·x + q·y = c.  Line m: a·x + b·y = e, parallel to d.
  // Parallel ⟹ a/b = p/q. Neither a nor b is determinable; the ratio is.
  // Target: k·(a/b).
  const p = rand.nonZero(-9, 9), q = rand.nonZero(-9, 9);
  if (Math.abs(gcd(p, q)) !== 1) return { error: 'ratio not in lowest terms — the target reads as reducible' };
  const k = rand.pick([2, 3, 4, 6, -2, -3]);
  const key = qMul(Q(k), Q(p, q));
  const dRatioAlone = Q(p, q);                 // D1 the ratio, unscaled
  const dReciprocal = qMul(Q(k), Q(q, p));     // D6 reciprocal
  const dSlope = qMul(Q(k), Q(-p, q));         // D3 slope sign — the slope, not the coefficient ratio
  const L = layout(rand, key, [dRatioAlone, dReciprocal, dSlope]);
  if (L.error) return { error: L.error };

  const item = {
    primitive: 'P-COMBINATION', species: 'determinate-combination', form: 'ratio-parameter',
    stem: `Line $d$ has equation $${coef(p, 'x')} ${term(q, 'y')} = ${rand.nonZero(-9, 9)}$. Line $m$ has equation $ax + by = 1$ and is parallel to $d$, where $a$ and $b$ are constants. What is the value of $${k}\\left(\\dfrac{a}{b}\\right)$?`,
    ...L,
    distractorClasses: ['D1', 'D6', 'D3'],
    mechanism: { hidden_step: 2, abstraction: 2, nonobvious_rel: 2, reversal: 1 },
    routes: [
      ROUTE('equate-coefficient-ratios', { insight: true, cost: 3, value: key }),
      ROUTE('solve-for-a-and-b', { insight: false, cost: 6, value: dRatioAlone, natural: true }),
      ROUTE('use-slope-not-ratio', { insight: false, cost: 4, value: dSlope }),
      ROUTE('invert-the-ratio', { insight: false, cost: 3, value: dReciprocal }),
    ],
    counterfactual: { kind: 'value', note: 'b given numerically, so a is determined', value: qMul(Q(k), Q(p * 2, q)) },
    fingerprintParts: {
      ctx: 'coordinate-line-pair', chain: ['read-coefficient-ratio', 'apply-parallel-condition', 'scale-ratio'],
      target: 'value:ratio-of-parameters', options: '2x2-sign-grid', distract: ['D1', 'D6', 'D3'],
      narrative: 'two-lines-symbolic', numeric: ['coeff-p', 'coeff-q', 'scale-k'],
    },
  };
  return item;
}

function combSingle(rand) {
  // NEGATIVE CONTROL. One relation, two symbols: assigning either symbol a
  // convenient value solves it at the same cost as the insight. The gate must
  // reject this, and tests/est-primitives.test.mjs asserts that it does.
  const a = rand.pick([2, 3, 4]), b = rand.nonZero(-7, 7), g = rand.nonZero(2, 8);
  const s = rand.pick([Q(1, 2), Q(1, 3), Q(2, 3)]);
  const key = qMul(s, Q(-b));
  const L = layout(rand, key, [Q(-b), qNeg(key), qMul(s, Q(g))]);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-COMBINATION', species: 'determinate-combination', form: 'single-relation',
    stem: `If $\\dfrac{${coef(a, 'x')} ${term(b, '')}}{y} = ${g}$, what is the value of $${qStr(qMul(s, Q(a)))}x - ${qStr(qMul(s, Q(g)))}y$?`,
    ...L,
    distractorClasses: ['D1', 'D3', 'D6'],
    mechanism: { hidden_step: 2, abstraction: 2, nonobvious_rel: 2 },
    routes: [
      ROUTE('factor-the-combination', { insight: true, cost: 3, value: key }),
      ROUTE('assign-y-then-solve', { insight: false, cost: 3, value: key, natural: true }),
      ROUTE('stop-at-cleared-form', { insight: false, cost: 2, value: Q(-b) }),
    ],
    counterfactual: { kind: 'value', note: 'y given numerically', value: qAdd(key, Q(1)) },
    fingerprintParts: {
      ctx: 'pure-algebraic', chain: ['clear-quotient', 'factor-combination', 'scale'],
      target: 'value:combination', options: 'target-shift-set', distract: ['D1', 'D3', 'D6'],
      narrative: 'symbols-only:2', numeric: ['coeff-a', 'const-b', 'rhs-g'],
    },
  };
}

/* ══════════════════════════ P-CONVERSION (M2) ══════════════════════════ */
// A unit, scale or span discrepancy carried in the stimulus furniture, such
// that the un-converted answer is wrong AND printed. 9% of load-bearing hidden
// steps. L4 moves between representations; it does not create a binding unit
// discrepancy, and nothing currently requires the un-converted answer to be
// offered.

// Each carrier needs its own narrative, and its own DIRECTION. A rate quoted
// per k units divides; an axis captioned "in hundreds" multiplies. Getting this
// wrong produced mathematically valid, contextually meaningless stems — the
// first version asked for "the total charge for 5000 mA" from a supplier.
const CARRIERS = {
  rate_denominator: {
    k: 25, direction: 'divide', unit: 'km',
    stem: (F, r, S, k) => `A courier charges a fixed fee of $\\$${F}$ plus $\\$${r}$ for each ${k} km travelled. What is the total charge for a delivery of ${S} km?`,
    carrierText: k => `for each ${k} km travelled`,
  },
  period_index: {
    k: 12, direction: 'divide', unit: 'months',
    stem: (F, r, S, k) => `A membership costs $\\$${F}$ to join, plus $\\$${r}$ for each ${k} months of access. What is the total cost of ${S} months of membership?`,
    carrierText: k => `for each ${k} months of access`,
  },
  axis_scale: {
    // A factor of 100 put the un-converted answer roughly two decades from the
    // key, which is the option-spread finding. A dozen is both a smaller factor
    // and the more natural way a workshop actually records output.
    k: 12, direction: 'multiply', unit: 'units',
    stem: (F, r, S, k) => `A workshop records its output in dozens of units. A supplier charges a fixed fee of $\\$${F}$ plus $\\$${r}$ per unit produced. If the recorded output is ${S}, what is the total charge?`,
    carrierText: () => 'output recorded in dozens of units',
  },
  si_prefix: {
    // The stem used to end "with $I$ in amperes", which names the conversion
    // the item is testing. Asking for the answer IN OHMS carries the same
    // requirement — an ohm is a volt per ampere — without announcing it.
    k: 1000, direction: 'divide', unit: 'mA',
    stem: (V, _r, I, k) => `A component carries a current of ${I} mA when the potential difference across it is $${V}$ volts. Using $R = \\dfrac{V}{I}$, what is the resistance $R$, in ohms?`,
    carrierText: () => 'current quoted in mA, resistance asked in ohms',
    quotient: true,
  },
};

export function pConversion(seed, opts = {}) {
  const rand = rng(seed);
  const carrier = opts.carrier || rand.pick(Object.keys(CARRIERS));
  const C = CARRIERS[carrier];
  const k = C.k;

  if (C.quotient) {
    // R = V / I, with I supplied in mA. The un-converted answer is out by k.
    const V = rand.int(2, 24);
    const mA = rand.pick([2, 4, 5, 8, 10, 16, 20, 25, 40, 50]) * 10;
    const amps = Q(mA, 1000);
    // Each option is the answer produced by dividing the current by a DIFFERENT
    // power of ten — the prefix errors a student actually makes. Reading mA as
    // if it were the base unit, as centi, as deci. The old set reached for a
    // near-miss (half the conversion factor, which nobody does) purely to
    // satisfy an anti-estimation guard; a conversion item is allowed to have
    // options that differ in scale, because scale is what it tests.
    const byDivisor = D => qDiv(Q(V), Q(mA, D));
    const key = byDivisor(k);                         // ohms, converted correctly
    const unconverted = byDivisor(1);                 // D6 MANDATORY: I left in mA
    const centiSlip = byDivisor(100);                 // read the prefix as centi
    const deciSlip = byDivisor(10);                   // read the prefix as deci
    if (qEq(key, unconverted)) return { error: 'conversion is not binding' };
    const dec = v => { const x = qNum(v); return Number.isInteger(x) ? String(x) : String(Number(x.toFixed(4))); };
    const L = layout(rand, key, [unconverted, centiSlip, deciSlip], dec);
    if (L.error) return { error: L.error };
    return {
      primitive: 'P-CONVERSION', species: 'binding-conversion', form: carrier,
      stem: C.stem(V, null, mA, k),
      stimulusCarrier: { carrier, factor: k, direction: 'divide', text: C.carrierText(k) },
      ...L,
      optionArchitecture: { kind: 'scale-ladder', base: 10, anchor: 'key',
        reason: 'every option is the answer a named prefix error yields, so the options differ in scale by construction — which is the quantity the item tests' },
      distractorClasses: ['D6', 'D6', 'D6'],
      mechanism: { hidden_step: 2, repr_switch: 2, multiconcept: 1, trap_cost: 2, inference: 1 },
      routes: [
        ROUTE('convert-mA-then-divide', { insight: true, cost: 3, value: key }),
        ROUTE('divide-in-given-units', { insight: false, cost: 2, value: unconverted, natural: true }),
        ROUTE('read-the-prefix-as-centi', { insight: false, cost: 3, value: centiSlip }),
        ROUTE('read-the-prefix-as-deci', { insight: false, cost: 3, value: deciSlip }),
      ],
      counterfactual: { kind: 'value', note: 'current quoted in amperes — no conversion exists', value: unconverted },
      fingerprintParts: {
        ctx: `quotient-model:${carrier}`, chain: ['read-quantity', 'convert-si-prefix', 'apply-quotient-formula'],
        target: 'value:derived-quantity', options: 'scale-ladder', distract: ['D6', 'D6', 'D6'],
        narrative: 'single-component', numeric: ['potential', 'current', 'carrier-factor'],
      },
    };
  }

  // Linear frame: fixed + rate x (span converted through the carrier).
  const fixed = rand.int(2, 9) * 10;
  const rate = rand.int(2, 9);
  const div = C.direction === 'divide';
  const shown = div ? rand.int(4, 12) * k : rand.int(3, 9);
  const converted = div ? Q(shown, k) : Q(shown * k);

  let sub = 1;
  for (let d = 2; d <= k; d++) if (k % d === 0 && k / d < k) { sub = k / d; break; }
  if (sub === 1) return { error: 'no clean partial conversion for this carrier' };
  const partialUnits = div ? Q(shown, sub) : Q(shown * sub);
  if (!qIsInt(partialUnits)) return { error: 'partial conversion is not a whole quantity' };

  const key = qAdd(Q(fixed), qMul(Q(rate), converted));
  const unconverted = qAdd(Q(fixed), qMul(Q(rate), Q(shown)));       // D6 MANDATORY
  // Converting the WRONG WAY on a divide carrier multiplies where it should
  // divide, so the answer lands k^2 from the key — four decades out on the
  // 25 km carrier. It is a real error, but an option nobody reads past, and it
  // was what stretched the printed set. Charging the joining fee once per
  // period is the same kind of mistake — the model misapplied rather than the
  // arithmetic slipped — and it stays on the page.
  const reversed = div
    ? qMul(qAdd(Q(fixed), Q(rate)), converted)                       // D3 fee charged once per period
    : qAdd(Q(fixed * k), qMul(Q(rate), Q(shown)));                   // D3 scaled the fee, not the output
  const partial = qAdd(Q(fixed), qMul(Q(rate), partialUnits));       // D6 partial conversion
  if (qEq(key, unconverted)) return { error: 'conversion is not binding' };

  if (![key, unconverted, reversed, partial].every(qIsInt)) return { error: 'an option is not a whole currency amount' };
  const L = layout(rand, key, [unconverted, reversed, partial]);
  if (L.error) return { error: L.error };

  // ANTI-ESTIMATION: without a near distractor, order of magnitude alone picks
  // the key and the conversion is never performed.
  const near = [unconverted, reversed, partial].some(d => {
    const ratio = Math.abs(qNum(d) / qNum(key));
    return ratio > 1 / 3 && ratio < 3;
  });
  if (!near) return { error: 'every distractor is a decade away — magnitude alone identifies the key' };

  return {
    primitive: 'P-CONVERSION', species: 'binding-conversion', form: carrier,
    stem: C.stem(fixed, rate, shown, k),
    stimulusCarrier: { carrier, factor: k, direction: C.direction, text: C.carrierText(k) },
    ...L,
    distractorClasses: ['D6', 'D3', 'D6'],
    mechanism: { hidden_step: 2, filtering: 1, repr_switch: 1, trap_cost: 2 },
    routes: [
      ROUTE('convert-then-compute', { insight: true, cost: 3, value: key }),
      ROUTE('compute-in-given-units', { insight: false, cost: 2, value: unconverted, natural: true }),
      ROUTE(div ? 'charge-the-fee-each-period' : 'scale-the-fee-not-the-output',
      { insight: false, cost: 3, value: reversed }),
      ROUTE('convert-part-way', { insight: false, cost: 3, value: partial }),
    ],
    counterfactual: { kind: 'value', note: 'rate quoted in the target unit — no conversion exists', value: unconverted },
    fingerprintParts: {
      ctx: `rate-model:${carrier}`, chain: ['read-rate', 'convert-units', 'apply-linear-model'],
      target: 'value:total', options: 'scale-ladder', distract: ['D6', 'D3', 'D6'],
      narrative: 'single-supplier', numeric: ['fixed-fee', 'rate', 'span', 'carrier-factor'],
    },
  };
}

/* ══════════════════════════ P-NORMALISE (M3) ══════════════════════════ */
// The standard method exists and does not apply until the object is rewritten.
// 12% of load-bearing hidden steps. The un-normalised route must TERMINATE on a
// wrong printed value — a route that dead-ends produces frustration, not
// difficulty.

export function pNormalise(seed, opts = {}) {
  const rand = rng(seed);
  const form = opts.form || rand.pick(['non_monic_divisor', 'mixed_base']);
  if (form === 'non_monic_divisor') return normNonMonic(rand);
  if (form === 'mixed_base') return normMixedBase(rand);
  throw new Error(`P-NORMALISE: unknown form ${form}`);
}

function normNonMonic(rand) {
  // Remainder of P(x) on division by (a·x − b). Root is b/a, not b.
  const a = rand.pick([2, 3]), b = rand.pick([3, 5, 7, 9]);
  if (b % a === 0) return { error: 'root is an integer — the divisor normalises itself away' };
  const c2 = rand.nonZero(-5, 5), c1 = rand.nonZero(-9, 9), c0 = rand.nonZero(-9, 9);
  const P = x => qAdd(qAdd(qMul(Q(c2), qMul(x, x)), qMul(Q(c1), x)), Q(c0));

  const root = Q(b, a);
  const key = P(root);
  const naiveRoot = Q(b);                 // read the divisor as (x − b)
  const dNaive = P(naiveRoot);            // D4 structural: the un-normalised method's output
  const dSignRoot = P(Q(-b, a));          // D3
  const dConst = Q(c0);                   // D1 P(0), the remainder on dividing by x
  if (qEq(key, dNaive)) return { error: 'un-normalised route reaches the key' };

  const L = layout(rand, key, [dNaive, dSignRoot, dConst]);
  if (L.error) return { error: L.error };

  // ANTI-ESTIMATION. P(b/a) can land very near zero while P(b) is large, and
  // the option set then gives the key away by shape alone: one small value
  // among three big ones. P-CONVERSION has carried this guard since Stage 1;
  // this primitive needed it and did not have it.
  const kn = Math.abs(qNum(key));
  const near = [dNaive, dSignRoot, dConst].some(d => {
    const v = Math.abs(qNum(d));
    return kn === 0 ? v < 3 : v > kn / 3 && v < kn * 3;
  });
  if (!near) return { error: 'every distractor is more than a factor of three from the key — magnitude alone identifies it' };

  return {
    primitive: 'P-NORMALISE', species: 'normalisation-gate', form: 'non_monic_divisor',
    stem: `What is the remainder when $P(x) = ${coef(c2, 'x^2')} ${term(c1, 'x')} ${term(c0, '')}$ is divided by $(${a}x - ${b})$?`,
    ...L,
    distractorClasses: ['D4', 'D3', 'D1'],
    mechanism: { hidden_step: 2, abstraction: 1, multiconcept: 1, trap_cost: 2 },
    routes: [
      ROUTE('normalise-then-evaluate', { insight: true, cost: 4, value: key }),
      ROUTE('read-divisor-as-monic', { insight: false, cost: 3, value: dNaive, natural: true }),
      ROUTE('sign-flip-the-root', { insight: false, cost: 4, value: dSignRoot }),
      ROUTE('evaluate-at-zero', { insight: false, cost: 2, value: dConst }),
    ],
    counterfactual: { kind: 'value', note: 'divisor made monic', value: dNaive },
    fingerprintParts: {
      ctx: 'pure-algebraic', chain: ['identify-divisor-root', 'normalise-non-monic', 'evaluate-polynomial'],
      target: 'value:remainder', options: 'scale-ladder', distract: ['D4', 'D3', 'D1'],
      narrative: 'symbols-only:1', numeric: ['divisor-a', 'divisor-b', 'poly-coeffs'],
    },
  };
}

function normMixedBase(rand) {
  // Three terms on three different bases, all powers of one base nobody wrote.
  const base = rand.pick([2, 3]);
  const [e1, e2, e3] = [rand.pick([2, 3]), rand.pick([2, 3]), 1];
  if (e1 === e2) return { error: 'two bases coincide — nothing to normalise' };
  const b1 = base ** e1, b2 = base ** e2, b3 = base ** e3;
  const p = rand.int(1, 4), q = rand.int(1, 4), r = rand.int(1, 4);
  // b1^(x+p) = b2^(x−q) · b3^(x+r)  ⟹  e1(x+p) = e2(x−q) + e3(x+r)
  const lhsX = e1, rhsX = e2 + e3;
  if (lhsX === rhsX) return { error: 'x cancels — no unique solution' };
  const x = Q(e2 * -q + e3 * r - e1 * p, lhsX - rhsX);
  const shiftA = rand.pick([2, 3]), shiftB = rand.nonZero(-4, 4);
  const key = qAdd(qMul(Q(shiftA), x), Q(shiftB));

  const dXitself = x;                              // D1 stopped at x
  const dSameBase = qAdd(qMul(Q(shiftA), Q(0)), Q(shiftB)); // treating every base as equal ⟹ x = 0
  const dSign = qSub(Q(shiftB), qMul(Q(shiftA), x));        // D3
  if (qEq(key, dXitself)) return { error: 'target shift is vacuous' };

  const L = layout(rand, key, [dXitself, dSameBase, dSign]);
  if (L.error) return { error: L.error };

  return {
    primitive: 'P-NORMALISE', species: 'normalisation-gate', form: 'mixed_base',
    stem: `If $${b1}^{\\,x+${p}} = ${b2}^{\\,x-${q}} \\cdot ${b3}^{\\,x+${r}}$, what is the value of $${coef(shiftA, 'x')} ${term(shiftB, '')}$?`,
    ...L,
    distractorClasses: ['D1', 'D2', 'D3'],
    mechanism: { hidden_step: 2, abstraction: 2, nonobvious_rel: 1, multiconcept: 1 },
    routes: [
      ROUTE('rewrite-to-common-base', { insight: true, cost: 5, value: key }),
      ROUTE('equate-exponents-as-written', { insight: false, cost: 3, value: dSameBase, natural: true }),
      ROUTE('stop-at-x', { insight: false, cost: 5, value: dXitself }),
      ROUTE('sign-slip-on-the-target-shift', { insight: false, cost: 5, value: dSign }),
    ],
    counterfactual: { kind: 'value', note: 'all three terms presented on the common base', value: dSameBase },
    fingerprintParts: {
      ctx: 'pure-algebraic', chain: ['recognise-common-base', 'rewrite-powers', 'equate-exponents', 'apply-target-shift'],
      target: 'value:shifted', options: 'scale-ladder', distract: ['D1', 'D2', 'D3'],
      narrative: 'symbols-only:1', numeric: ['base', 'exponent-offsets', 'shift'],
    },
  };
}

/* ══════════════════════════ P-SCOPE (M4) — GATED ══════════════════════════ */
// Referent and quantifier scope. `competing_interp` flips sign across the four
// forms (−0.04 … 0.36), so this primitive is BUILT AND NOT SCHEDULED. Every
// emitted item carries `scheduled: false`; the Stage-2 blueprint must refuse it
// until a fifth form raises the evidence or the paired-solver gate is proven.
//
// The gate that makes it safe: BOTH readings are computed, both must be exactly
// representable, and the alternative reading's answer MUST be a printed option.
// Four reference items advertised a confusion whose answer was not offered.

export function pScope(seed, opts = {}) {
  const rand = rng(seed);
  const total = rand.int(3, 9) * 100;
  const p1 = rand.pick([15, 20, 25, 30, 35, 40]);
  const p2 = rand.pick([20, 25, 30, 40, 50]);           // applied to WHICH base?
  const first = qMul(Q(total), Q(p1, 100));
  const rest = qSub(Q(total), first);

  const readingRest = qMul(rest, Q(p2, 100));           // intended: p2% of the rest
  const readingTotal = qMul(Q(total), Q(p2, 100));      // alternative: p2% of the total
  if (qEq(readingRest, readingTotal)) return { error: 'both readings coincide' };
  if (!qIsInt(readingRest) || !qIsInt(readingTotal)) return { error: 'a reading is not a whole count' };

  const dRemainder = qSub(rest, readingRest);           // D5 the other part of the rest
  const L = layout(rand, readingRest, [readingTotal, dRemainder, first]);
  if (L.error) return { error: L.error };

  return {
    primitive: 'P-SCOPE', species: 'scope-discrimination', form: 'residual_referent',
    scheduled: false,
    gateReason: 'competing_interp flips sign across the four reference forms; not scheduled until n>=250 or the paired-solver gate is demonstrated',
    stem: `A club has ${total} members. ${p1}\\% of them chose the morning session and the rest chose the evening session. Of those who chose the evening session, ${p2}\\% also signed up for the workshop. How many members signed up for the workshop?`,
    readings: [
      { name: 'of-the-rest', intended: true, value: readingRest },
      { name: 'of-the-total', intended: false, value: readingTotal },
    ],
    ...L,
    distractorClasses: ['D2', 'D5', 'D5'],
    mechanism: { competing_interp: 2, hidden_step: 2, filtering: 1 },
    routes: [
      ROUTE('apply-to-the-residual', { insight: true, cost: 3, value: readingRest }),
      ROUTE('apply-to-the-total', { insight: false, cost: 2, value: readingTotal, natural: true }),
      ROUTE('report-the-first-group', { insight: false, cost: 1, value: first }),
      ROUTE('take-the-complement-within-the-residual', { insight: false, cost: 3, value: dRemainder }),
    ],
    counterfactual: { kind: 'value', note: 'referent stated explicitly ("of the whole club")', value: readingTotal },
    fingerprintParts: {
      ctx: 'population-partition', chain: ['partition-population', 'select-referent', 'apply-percentage'],
      target: 'value:count', options: 'partition-set', distract: ['D2', 'D5', 'D5'],
      narrative: 'single-population-two-splits', numeric: ['total', 'pct-1', 'pct-2'],
    },
  };
}

/* ══════════════════════════ P-CLASSIFY (M5) ══════════════════════════ */
// Identify what kind of object this is before choosing a method. The reflex
// technique must be INAPPLICABLE, not merely longer — and must nonetheless
// produce a value the student would write down.

export function pClassify(seed, opts = {}) {
  const rand = rng(seed);
  const k = rand.nonZero(-6, 6), qc = rand.pick([2, 3, 4, 5]), r = rand.nonZero(-8, 8);
  const m = qc * rand.int(2, 6);
  const u = rand.nonZero(-12, 12);

  // (a + k)(q·x + r) = m·x + u.
  // Expand: (a+k)q·x + (a+k)r = m·x + u
  //   no solution      ⟺ (a+k)q = m  AND  (a+k)r ≠ u   →  a = m/q − k
  //   infinitely many  ⟺ both        →  a = u/r − k
  const key = qSub(Q(m, qc), Q(k));                 // makes the x-terms cancel
  const dInfinite = qSub(Q(u, r), Q(k));            // D2: the "infinitely many" confusion
  if (qEq(key, dInfinite)) return { error: 'no-solution and infinitely-many coincide — the item is unsound' };
  // Solving for x with a treated as a known — a real, writable wrong move.
  const dSolveForX = Q(u - k * r, k * qc - m || 1);
  const dSign = qNeg(key);
  const L = layout(rand, key, [dInfinite, dSolveForX, dSign]);
  if (L.error) return { error: L.error };

  return {
    primitive: 'P-CLASSIFY', species: 'classification-gate', form: 'existence-of-solutions',
    stem: `The equation $(a ${signedConst(k)})(${coef(qc, 'x')} ${term(r, '')}) = ${coef(m, 'x')} ${term(u, '')}$ has no solution, where $a$ is a constant. What is the value of $a$?`,
    ...L,
    distractorClasses: ['D2', 'D2', 'D3'],
    mechanism: { hidden_step: 2, abstraction: 2, nonobvious_rel: 2, inference: 2, reversal: 2 },
    routes: [
      ROUTE('classify-then-cancel-x-terms', { insight: true, cost: 4, value: key }),
      ROUTE('require-both-sides-identical', { insight: false, cost: 4, value: dInfinite, natural: true }),
      ROUTE('solve-for-x-instead', { insight: false, cost: 3, value: dSolveForX }),
      ROUTE('subtract-the-offset-the-wrong-way', { insight: false, cost: 4, value: dSign }),
    ],
    counterfactual: { kind: 'value', note: 'stem asks for the value making the equation an identity', value: dInfinite },
    fingerprintParts: {
      ctx: 'pure-algebraic', chain: ['expand-parametrised-product', 'classify-solution-set', 'equate-x-coefficients'],
      target: 'value:parameter', options: '2x2-sign-grid', distract: ['D2', 'D2', 'D3'],
      narrative: 'symbols-only:1-parameter', numeric: ['offset-k', 'coeff-q', 'const-r', 'coeff-m', 'const-u'],
    },
  };
}

/* ══════════════════════════ P-DECOY (M6) ══════════════════════════ */
// The correct route is SHORTER than it looks because a supplied component is
// irrelevant by construction. The rarest species in the corpus (1 of 33) and
// the cleanest demonstration that difficulty can be made by removing work.
// Every distractor must be a member of the "processed the decoy" family.

export function pDecoy(seed, opts = {}) {
  const rand = rng(seed);
  const form = opts.form || rand.pick(['coefficients_sum_zero', 'shared_terms_cancel']);
  if (form === 'coefficients_sum_zero') return decoyCollapse(rand, opts);
  if (form === 'shared_terms_cancel') return decoyShared(rand, opts);
  throw new Error(`P-DECOY: unknown form ${form}`);
}

/**
 * The decoy is the DENOMINATOR: the numerator vanishes, so the heavy radical
 * below it never has to be touched.
 *
 * The key is 0 here by mathematical necessity, not by convenience. "The
 * denominator is irrelevant" is true exactly when the numerator is zero — give
 * the numerator any other value and the denominator becomes load-bearing, and
 * the item stops being a decoy item at all. That constraint is what the
 * `shared_terms_cancel` sibling exists to escape.
 */
function decoyCollapse(rand, opts = {}) {
  // Numerator: c1·m1·B + c2·m2·B + c3·m3·B with Σ ci·mi = 0, over a heavy denominator.
  const m1 = rand.pick([2, 3, 4]), m2 = rand.pick([2, 3, 5]), m3 = 1;
  const c1 = rand.pick([2, 3, 4, 6]);
  // choose c2, c3 so c1·m1 + c2·m2 + c3·m3 = 0 exactly
  const c3cand = [];
  for (let c2 = -8; c2 <= 8; c2++) {
    if (c2 === 0) continue;
    const c3 = -(c1 * m1 + c2 * m2) / m3;
    if (Number.isInteger(c3) && c3 !== 0 && Math.abs(c3) <= 12) c3cand.push([c2, c3]);
  }
  if (!c3cand.length) return { error: 'no exact collapse for these multipliers' };
  const [c2, c3] = rand.pick(c3cand);
  if (m1 === 1 && m2 === 1) return { error: 'collapse visible before the terms are simplified' };

  const key = Q(0);
  // The "processed the decoy" family: one coefficient mis-simplified, so the
  // numerator does not vanish and the heavy denominator has to be carried.
  const den = rand.int(2, 9);
  const dSlip1 = Q(c1 * m1 + c2 * m2 + c3 * m3 + c1, den);
  const dSlip2 = Q(c1 * m1 - c2 * m2 + c3 * m3, den);
  const dSlip3 = Q(-(c1 * m1 + c2 * m2 - c3 * m3), den);
  const L = layout(rand, key, [dSlip1, dSlip2, dSlip3]);
  if (L.error) return { error: L.error };

  return {
    primitive: 'P-DECOY', species: 'supplied-decoy', form: 'coefficients_sum_zero',
    // The key cannot vary here, and the constraint is mathematical: the
    // denominator is irrelevant exactly when the numerator vanishes. Declaring
    // it carries an obligation rather than an excuse — a form may contain at
    // most one item from this sub-form, because a second would let a student
    // answer by pattern instead of by the collapse.
    constantKey: { value: '0', maxPerForm: 1,
      reason: 'the decoy is the denominator, and only a vanishing numerator makes a denominator irrelevant' },
    stem: `Simplify $\\dfrac{${coef(c1, `\\sqrt{${m1 * m1}t}`)} ${term(c2, `\\sqrt{${m2 * m2}t}`)} ${term(c3, '\\sqrt{t}')}}{\\sqrt{${den * den}t^{3}}}$ for $t > 0$.`,
    collapse: { multipliers: [m1, m2, m3], coefficients: [c1, c2, c3], sum: c1 * m1 + c2 * m2 + c3 * m3 },
    ...L,
    distractorClasses: ['D7', 'D3', 'D6'],
    mechanism: { hidden_step: 2, filtering: 2, nonobvious_rel: 2, abstraction: 2 },
    routes: [
      ROUTE('simplify-numerator-see-collapse', { insight: true, cost: 3, value: key }),
      ROUTE('rationalise-denominator-first', { insight: false, cost: 7, value: dSlip1, natural: true }),
      ROUTE('mis-simplify-one-radical', { insight: false, cost: 5, value: dSlip2 }),
      ROUTE('sign-slip-on-the-third-term', { insight: false, cost: 5, value: dSlip3 }),
    ],
    counterfactual: { kind: 'value', note: 'coefficients no longer sum to zero', value: dSlip1 },
    fingerprintParts: {
      ctx: 'pure-algebraic', chain: ['simplify-radical-terms', 'detect-coefficient-collapse', 'discard-denominator'],
      target: 'expression:simplified', options: 'collapse-family', distract: ['D7', 'D3', 'D6'],
      narrative: 'symbols-only:1', numeric: ['multipliers', 'coefficients', 'denominator'],
    },
  };
}

/**
 * The decoy is the SHARED PART of two expressions: it cancels in the difference,
 * so the quadratic and constant terms are supplied, look essential, and are
 * never needed.
 *
 * This is the sibling that lets the key vary. Evaluating both polynomials and
 * subtracting is a legitimate route to the key — it is simply LONGER, which is
 * the distinction the anti-bypass rule was written to make. What the mechanism
 * buys is not correctness; it is the difference between two operations and
 * eight, and the printed distractors catch the students who take the long road
 * and slip on it.
 */
function decoyShared(rand, opts = {}) {
  const A = rand.int(2, 9);                     // shared quadratic coefficient
  const C = rand.nonZero(-12, 12);              // shared constant
  const p = rand.nonZero(-9, 9);
  let q = rand.nonZero(-9, 9);
  if (q === p) return { error: 'linear coefficients coincide — nothing survives the cancellation' };
  const x0 = rand.int(2, 6);

  const at = c => Q(A * x0 * x0 + c * x0 + C);
  const key = Q((q - p) * x0);                  // (h - g)(x0), the shared part gone
  const dH = at(q);                             // evaluated h only
  const dG = at(p);                             // evaluated g only
  const dRev = Q((p - q) * x0);                 // subtracted the wrong way round

  // The shared part must actually be worth cancelling: if |A·x0^2 + C| is small
  // the two evaluations are as cheap as the difference and the decoy is inert.
  if (Math.abs(A * x0 * x0 + C) < 12) return { error: 'shared part too small to be worth cancelling' };

  const L = layout(rand, key, [dH, dG, dRev]);
  if (L.error) return { error: L.error };

  const sign = c => `${c < 0 ? '-' : '+'} ${Math.abs(c)}`;
  return {
    primitive: 'P-DECOY', species: 'supplied-decoy', form: 'shared_terms_cancel',
    stem: `If $g(x) = ${coef(A, 'x^2')} ${term(p, 'x')} ${term(C, '')}$ and $h(x) = ${coef(A, 'x^2')} ${term(q, 'x')} ${term(C, '')}$, what is the value of $h(${x0}) - g(${x0})$?`,
    decoy: { shared: `${A}x^2 ${sign(C)}`, cancelsIn: 'the difference' },
    ...L,
    distractorClasses: ['D7', 'D7', 'D3'],
    mechanism: { hidden_step: 2, filtering: 2, nonobvious_rel: 1, abstraction: 1 },
    routes: [
      ROUTE('subtract-then-evaluate', { insight: true, cost: 2, value: key }),
      // Evaluating both is CORRECT and slower. It is the natural move, and it is
      // not a bypass: cost 8 against the insight's 2.
      ROUTE('evaluate-both-then-subtract', { insight: false, cost: 8, value: key, natural: true }),
      ROUTE('evaluate-h-only', { insight: false, cost: 4, value: dH }),
      ROUTE('evaluate-g-only', { insight: false, cost: 4, value: dG }),
      ROUTE('subtract-in-the-stated-order', { insight: false, cost: 3, value: dRev }),
    ],
    counterfactual: { kind: 'value', note: 'the quadratic terms differ, so nothing cancels', value: qAdd(key, Q(A)) },
    fingerprintParts: {
      ctx: 'function-pair', chain: ['form-difference-of-functions', 'cancel-shared-terms', 'evaluate-remainder'],
      target: 'value:difference-at-a-point', options: 'evaluation-family', distract: ['D7', 'D7', 'D3'],
      narrative: 'symbols-only:2', numeric: ['shared-quadratic', 'shared-constant', 'linear-p', 'linear-q', 'point'],
    },
  };
}

/* ══════════════════════════ P-UNSTATED-MODEL (M7) ══════════════════════════ */
// Supply a relation that appears neither in the stem nor on the reference
// sheet. The dominant species inside the robust `inference` mechanism, and the
// one L3 does not produce: L3 supplies formulae the sheet omits; this supplies
// models the situation implies.
//
// Options are prose claims, so `answer.value` is an index rather than a
// quantity — the same Q machinery, used as a label.

const PROSE = ['increased', 'decreased', 'stayed the same', 'cannot be determined'];

export function pUnstatedModel(seed, opts = {}) {
  const rand = rng(seed);
  const n1 = rand.int(6, 20) * 100;
  const n2 = rand.int(6, 20) * 100;
  if (n1 === n2) return { error: 'count did not change — the inference has no direction' };

  // Aggregate held constant while the count MOVES ⟹ the per-unit quantity moved
  // the other way. The direction of the count is not part of the species, and
  // fixing it to "fell" made the key the constant string "increased" in all 20
  // validation items — a student who answers one answers the rest without ever
  // supplying the model, which is the mechanism ceasing to bite across a series.
  const fell = n2 < n1;
  const KEY_IDX = fell ? 0 : 1;                   // fell -> "increased"; rose -> "decreased"
  const NAIVE_IDX = fell ? 1 : 0;                 // reads the count's direction onto the unit
  const key = Q(KEY_IDX), naive = Q(NAIVE_IDX);
  const L = layout(rand, key, [naive, Q(2), Q(3)], v => PROSE[qNum(v)]);
  if (L.error) return { error: L.error };

  return {
    primitive: 'P-UNSTATED-MODEL', species: 'unstated-model', form: 'aggregate_invariance',
    stem: `A workshop sold ${n1} tickets last season and ${n2} tickets this season. The manager reports that total ticket revenue was the same in both seasons. What must have happened to the price of a ticket?`,
    bridgingRelation: 'revenue = price x quantity',
    relationStatedInStem: false,
    relationOnReferenceSheet: false,
    ...L,
    distractorClasses: ['D2', 'D2', 'D2'],
    mechanism: { inference: 2, nonobvious_rel: 2, hidden_step: 2, multiconcept: 2, repr_switch: 1 },
    routes: [
      ROUTE('supply-aggregate-model', { insight: true, cost: 3, value: key }),
      ROUTE('map-count-direction-onto-price', { insight: false, cost: 1, value: naive, natural: true }),
      ROUTE('declare-undeterminable', { insight: false, cost: 1, value: Q(3) }),
      // Reading the aggregate's invariance as the unit's — "revenue was the
      // same, so the price was the same" — the exact confusion the bridging
      // relation resolves, and the one option nothing pointed at.
      ROUTE('carry-invariance-from-aggregate-to-unit', { insight: false, cost: 1, value: Q(2) }),
    ],
    // With `revenue = price x quantity` withheld, nothing in the stem distinguishes
    // the four claims: all survive, so the item is unanswerable without the model.
    counterfactual: { kind: 'determinacy', note: 'bridging relation withheld', optionsSurviving: 4 },
    fingerprintParts: {
      ctx: 'two-period-aggregate', chain: ['compare-counts', 'supply-aggregate-model', 'infer-unit-direction'],
      target: 'selection:prose-claim', options: 'prose-claims', distract: ['D2', 'D2', 'D2'],
      narrative: 'single-entity-two-periods', numeric: ['count-1', 'count-2'],
    },
  };
}

/* ══════════════════════════ P-NAMED-CONFIG (M8) ══════════════════════════ */
// The configuration is determined by vertex naming, not by a drawing. 12% of
// load-bearing hidden steps, tied second largest, and entirely geometric.
// `figure_mode: none` is available today; `not_to_scale` waits on R1.

/**
 * Every side length is a fixed multiple of the hypotenuse, so one table drives
 * every configuration. `factor(theta, from, to)` is the transformation the item
 * actually tests: it is the STRUCTURAL identity of the question, and varying it
 * is what varying the configuration means.
 */
const TRIG = {
  30: { sin: 0.5, cos: Math.sqrt(3) / 2 },
  45: { sin: Math.SQRT1_2, cos: Math.SQRT1_2 },
  60: { sin: Math.sqrt(3) / 2, cos: 0.5 },
};
const asHyp = (th, role) => (role === 'hyp' ? 1 : role === 'adj' ? TRIG[th].cos : TRIG[th].sin);
const factor = (th, from, to) => asHyp(th, to) / asHyp(th, from);
const ROLES = ['hyp', 'adj', 'opp'];
const ROUTE_NAME = {
  misread: 'read-the-right-angle-at-the-wrong-vertex',
  wrongTriangle: 'apply-the-other-special-triangle-ratio',
  invert: 'apply-the-ratio-upside-down',
  other: 'solve-for-the-third-side',
  identity: 'assume-given-side-is-answer',
};

/**
 * P-NAMED-CONFIG. The configuration is fixed by three-letter angle names and
 * nothing else: no figure, and the right angle is given as `m∠PQR = 90°` rather
 * than "the right angle is at Q", so BOTH angle positions have to be read out
 * of the middle letter.
 *
 * Stage 1 shipped one configuration — right angle at Q, 45° at P, a leg given,
 * the hypotenuse asked — and 20 draws produced 8 distinct questions. The
 * primitive worked and the species did not: "naming determines structure" is
 * not demonstrated by an item whose structure never changes. What varies now is
 * the transformation itself (which ratio, in which direction, between which two
 * roles) on top of which vertices carry the two named angles.
 */
export function pNamedConfig(seed, opts = {}) {
  const rand = rng(seed);
  const device = opts.device || 'three_letter_angle';
  if (device !== 'three_letter_angle') throw new Error(`P-NAMED-CONFIG: ${device} needs the R1 not-to-scale contract`);

  const V = ['P', 'Q', 'R'];
  const rightAt = opts.rightAt || rand.pick(V);
  const rest = V.filter(v => v !== rightAt);
  const namedAt = opts.namedAt || rand.pick(rest);
  const third = rest.find(v => v !== namedAt);

  // Roles, resolved from the naming. The hypotenuse is the side that does NOT
  // touch the right-angle vertex; "adjacent" and "opposite" are relative to the
  // named acute angle.
  const side = (a, b) => [a, b].sort().join('');
  const sideOf = { hyp: side(namedAt, third), adj: side(rightAt, namedAt), opp: side(rightAt, third) };

  const theta = opts.theta || rand.pick([30, 45, 60]);
  const givenRole = opts.givenRole || rand.pick(ROLES);
  const askedRole = opts.askedRole || rand.pick(ROLES.filter(r => r !== givenRole));

  const given = rand.int(3, 20);
  const f = factor(theta, givenRole, askedRole);
  if (Math.abs(f - 1) < 1e-9) return { error: 'the transformation is the identity — nothing is asked' };

  // Error paths, each diagnosable and each a real misreading:
  //   invert       — applied the relation upside down
  //   misread-role — read the given side into the wrong role, i.e. put the right
  //                  angle at the wrong vertex. This is the species' own trap.
  //   other-side   — solved for the third side instead of the one named
  const misreadFrom = ROLES.find(r => r !== givenRole && r !== askedRole);
  const otherTheta = [30, 45, 60].find(t => t !== theta && Math.abs(factor(t, givenRole, askedRole) - f) > 1e-9);
  const cand = {
    // The species' own error: the right angle read at the wrong vertex, so the
    // given side enters in the wrong role. INVISIBLE at 45 degrees, where the
    // two legs are interchangeable — which is why the wrong-triangle family
    // below exists, and why a 45-degree item that keeps only this one is
    // correctly refused rather than shipped with an undetectable misreading.
    misread: given * factor(theta, misreadFrom, askedRole),
    // Applied the other special triangle's ratio: a 30-60-90 relation used on a
    // 45-45-90 figure, or the reverse.
    wrongTriangle: otherTheta ? given * factor(otherTheta, givenRole, askedRole) : NaN,
    invert: given / f,
    other: given * factor(theta, givenRole, misreadFrom),
    identity: given,
  };
  const keyRaw = given * f;

  const r1 = v => Math.round(v * 10) / 10;
  const chosen = ['misread', 'wrongTriangle', 'invert', 'other', 'identity'];
  const picked = [];
  for (const nameK of chosen) {
    const v = cand[nameK];
    if (!Number.isFinite(v) || !(v > 0.5 && v < 400)) continue;
    // Rounding must not be what separates two options, and no option may sit on
    // top of another once printed.
    if (Math.abs(v - keyRaw) < 0.05 || picked.some(x => Math.abs(x.v - v) < 0.05)) continue;
    picked.push({ name: nameK, v });
    if (picked.length === 3) break;
  }
  if (picked.length < 3) return { error: 'wrong configurations are not distinguishable at this precision' };
  if (!(keyRaw > 0.5 && keyRaw < 400)) return { error: 'answer outside a plausible printed range' };

  const toQ = v => Q(Math.round(v * 10), 10);
  const dec1 = v => qNum(v).toFixed(1);
  const L = layout(rand, toQ(keyRaw), picked.map(x => toQ(x.v)), dec1);
  if (L.error) return { error: L.error };

  // The natural error is whichever misreading this configuration actually
  // supports. At 45 degrees that is not the vertex misreading, so the flag moves
  // rather than being asserted where it is not true.
  // ...and an error whose answer is just the number already in the stem is not
  // the error a competent student makes. At 45 degrees the vertex misreading
  // collapses onto exactly that, so the flag moves to the misreading that does
  // bite there rather than being claimed for one that does not.
  const naturalError = ['misread', 'wrongTriangle', 'invert']
    .find(n => picked.some(x => x.name === n && Math.abs(x.v - given) > 0.05)) || null;

  const angleName = v => {
    const others = V.filter(x => x !== v).sort();
    return `${others[0]}${v}${others[1]}`;
  };
  const archetype = `${theta}:${givenRole}->${askedRole}`;

  return {
    primitive: 'P-NAMED-CONFIG', species: 'naming-determines-structure', form: 'three_letter_angle',
    figureMode: 'none',
    stem: `In triangle $PQR$, $m\\angle ${angleName(rightAt)} = 90^\\circ$ and $m\\angle ${angleName(namedAt)} = ${theta}^\\circ$. ` +
      `If $${sideOf[givenRole]} = ${given}$ cm, what is the length of $\\overline{${sideOf[askedRole]}}$, to the nearest tenth of a centimetre?`,
    configuration: { rightAngleAt: rightAt, namedAngleAt: namedAt, theta, givenRole, askedRole,
                     given: sideOf[givenRole], asked: sideOf[askedRole], hypotenuse: sideOf.hyp },
    archetype,
    ...L,
    distractorClasses: ['D5', 'D5', 'D4'],
    mechanism: { hidden_step: 2, inference: 2, competing_interp: 1, repr_switch: 2, multiconcept: 1 },
    routes: [
      ROUTE('locate-vertices-from-names', { insight: true, cost: 4, value: toQ(keyRaw) }),
      ...picked.map(x => ROUTE(ROUTE_NAME[x.name],
        { insight: false, cost: x.name === 'identity' ? 1 : 4, value: toQ(x.v), natural: x.name === naturalError })),
    ],
    counterfactual: { kind: 'value', note: 'a to-scale figure supplied, resolving the adjacency by inspection',
                      value: toQ(cand.misread) },
    fingerprintParts: {
      ctx: 'triangle-no-figure', chain: ['parse-vertex-names', 'locate-right-angle', `apply-ratio-${givenRole}-to-${askedRole}`],
      target: `value:length:${askedRole}`, options: 'scale-ladder', distract: ['D5', 'D5', 'D4'],
      narrative: 'named-triangle', numeric: ['given-side', `angle-${theta}`],
    },
  };
}

/* ══════════════════════════ the two strengthenings ══════════════════════════ */

/**
 * S-MULTICONCEPT-INTERACTION. L7 stacks devices; the corpus shows stacking
 * without interaction is not difficulty (four routine concepts collapsed by an
 * option grid to one check). Requires a chain where each concept's output feeds
 * the next, with no isolated node and no option-set short circuit.
 */
export function assertInteraction(item) {
  const chain = item.conceptChain;
  if (!Array.isArray(chain) || chain.length < 2) return { ok: false, reason: 'no concept chain of length >= 2' };
  const outputs = chain.map(s => s.output);
  const consumed = new Set();
  for (const s of chain) for (const i of s.inputs) consumed.add(i);

  // Interaction is not a straight line: two concepts may run in parallel and
  // meet at the end. What must not happen is a concept whose result nothing
  // downstream uses — that one is stacked beside the item, not inside it.
  const dangling = chain.slice(0, -1).filter(s => !consumed.has(s.output));
  if (dangling.length) return { ok: false, reason: `concepts feed nothing later: ${dangling.map(s => s.concept).join(', ')}` };

  // ...and the closing step must integrate at least two earlier results, or the
  // concepts were merely performed in sequence.
  const last = chain[chain.length - 1];
  const upstream = last.inputs.filter(i => outputs.includes(i));
  if (upstream.length < 2) return { ok: false, reason: 'the final step integrates fewer than two earlier results — stacked, not interacting' };

  if (item.optionShortCircuit) return { ok: false, reason: 'option-set structure identifies the key without executing the chain' };
  return { ok: true, depth: chain.length, integrates: upstream.length };
}

/**
 * S-TRAPCOST-EXPENSIVE-FIRST-MOVE. L5 makes a boundary trap; the corpus wants
 * the natural first move to be expensive or wrong, not merely different.
 */
export function assertExpensiveFirstMove(item) {
  const natural = item.routes.filter(r => r.natural);
  if (!natural.length) return { ok: false, reason: 'no route marked as the natural first move' };
  const keyValue = item.options.find(o => o.id === item.key).value;
  const insight = item.routes.filter(r => r.requiresInsight && qEq(r.value, keyValue));
  if (!insight.length) return { ok: false, reason: 'no insight route reaches the key' };
  const cheapestInsight = Math.min(...insight.map(r => r.cost));
  const bad = natural.filter(r => qEq(r.value, keyValue) && r.cost <= cheapestInsight);
  if (bad.length) return { ok: false, reason: `natural first move is correct and cheap: ${bad.map(r => r.name).join(', ')}` };
  return { ok: true, cheapestInsight };
}

/* ══════════════════════════ trap level ══════════════════════════ */

/**
 * How much a wrong route actually costs — three levels, read off the route
 * model rather than asserted in metadata.
 *
 *   0  no meaningful trap. Nothing a student would NATURALLY do lands on a
 *      printed wrong answer. Distractors exist and are diagnosable, but the
 *      obvious move either reaches the key or is one nobody makes.
 *   1  natural, low cost. The natural move lands wrong, but cheaply — a slip
 *      caught quickly, and less work than the correct route.
 *   2  genuine high cost. The natural move lands wrong AFTER at least as much
 *      work as the correct route: the student pays full price and gets nothing.
 *
 * WHY THIS IS NOT A SECOND DIFFICULTY SCORE. It grades one thing — what the
 * natural first move costs — and it is descriptive. Stage 1 generated
 * trap_cost 2 in 100% of items against roughly 60% in the reference corpus,
 * and a paper on which every question punishes the obvious move is not a
 * harder paper, it is a less authentic one. The point is to be able to SEE the
 * distribution, and to let a primitive emit a gentle item where a gentle item
 * is what the mathematics gives. Nothing here manufactures a trap to fill a
 * quota; a primitive that has no natural trap reports 0.
 */
export function trapLevel(item) {
  const keyValue = item.options.find(o => o.id === item.key).value;
  const natural = item.routes.filter(r => r.natural);
  const insight = item.routes.filter(r => r.requiresInsight && qEq(r.value, keyValue));
  const insightCost = insight.length ? Math.min(...insight.map(r => r.cost)) : Infinity;

  const trapping = natural.filter(r => {
    const hit = item.options.find(o => qEq(o.value, r.value));
    return hit && hit.id !== item.key;
  });
  if (!trapping.length) return { level: 0, reason: 'no natural route lands on a printed wrong answer' };
  const worst = Math.max(...trapping.map(r => r.cost));
  return worst >= insightCost
    ? { level: 2, reason: `natural route "${trapping[0].name}" costs ${worst} against the insight's ${insightCost} and is wrong` }
    : { level: 1, reason: `natural route "${trapping[0].name}" is wrong but cheaper (${worst}) than the insight (${insightCost})` };
}

/* ══════════════════════════ registry & batch generation ══════════════════════════ */

export const PRIMITIVES = {
  'P-COMBINATION': pCombination,
  'P-CONVERSION': pConversion,
  'P-NORMALISE': pNormalise,
  'P-SCOPE': pScope,
  'P-CLASSIFY': pClassify,
  'P-DECOY': pDecoy,
  'P-UNSTATED-MODEL': pUnstatedModel,
  'P-NAMED-CONFIG': pNamedConfig,
};

/** Species with zero current generator coverage, per artifact 13 section 4. */
export const SPECIES_COVERAGE = {
  'P-COMBINATION': { species: 'determinate-combination', corpusShare: 0.15, priorCoverage: 'none' },
  'P-NAMED-CONFIG': { species: 'naming-determines-structure', corpusShare: 0.12, priorCoverage: 'none' },
  'P-NORMALISE': { species: 'normalisation-gate', corpusShare: 0.12, priorCoverage: 'none' },
  'P-CONVERSION': { species: 'binding-conversion', corpusShare: 0.09, priorCoverage: 'none' },
  'P-SCOPE': { species: 'scope-discrimination', corpusShare: 0.09, priorCoverage: 'none' },
  'P-CLASSIFY': { species: 'classification-gate', corpusShare: 0.09, priorCoverage: 'none' },
  'P-UNSTATED-MODEL': { species: 'unstated-model', corpusShare: 0.06, priorCoverage: 'L3 recall only' },
  'P-DECOY': { species: 'supplied-decoy', corpusShare: 0.03, priorCoverage: 'none' },
};

/**
 * Generate `count` accepted items from one primitive, retrying rejected seeds.
 * Returns the accepted items plus a tally of why candidates were rejected —
 * rejection is the primitive working, not failing.
 */
export function generate(name, count, { seed = 1, maxTries = 4000, opts = {} } = {}) {
  const fn = PRIMITIVES[name];
  if (!fn) throw new Error(`unknown primitive ${name}`);
  const items = [], rejected = [];
  let s = seed, tries = 0;
  while (items.length < count && tries < maxTries) {
    tries++;
    let cand;
    try { cand = fn(s++, opts); } catch (e) { rejected.push(`throw: ${e.message}`); continue; }
    if (!cand || cand.error) { rejected.push(cand ? cand.error : 'null'); continue; }
    const a = assess(cand);
    if (!a.loadBearing) { rejected.push(a.reasons.join('; ')); continue; }
    cand.assessment = a;
    cand.seed = s - 1;
    items.push(cand);
  }
  return { items, tries, rejected };
}
