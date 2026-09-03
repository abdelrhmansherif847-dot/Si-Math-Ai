// Non-value-targeted primitives — Primitive Coverage Revision.
//
// WHY THESE EXIST, MEASURED
//
// 29% of the 200 reference items ask for something other than a value:
// selection 16%, expression 8%, equation 4%, interpretation 2%. The generator
// library asked for a value in 89% of its 87 constructs and had:
//
//   * ZERO interpretation-targeted constructs, against 3 in the corpus;
//   * ZERO equation-targeted constructs, against 7;
//   * ONE expression-targeted construct, against 17;
//   * ZERO Roman-numeral subset constructs, against 3 — and the blueprint
//     REQUIRES exactly one per form (`SPECIAL_FORMS.roman: [1, 1]`), so that
//     requirement had never once been meetable.
//
// That is the whole of the 90%-value finding in artifact 19 §12 D9, and it is
// not a matter of phrasing: the corpus asks different KINDS of question, and a
// generator that can only ask "what is the value of" is recognisable for that
// reason alone.
//
// WHAT MAKES THESE DIFFERENT OBJECTS RATHER THAN RESKINS
//
// Every construct here changes the decision point, and most change the
// mathematical object too. "What does 1200 represent in C = 45n + 1200" is not
// "solve for n" in prose: nothing is computed, the four options are readings of
// one constant, and the work is deciding which reading the model supports.
// Reference items T1 Q5, T1 Q29 and T4 Q9 are exactly that, and code between
// RLx 4 and RLx 11 — non-value does not mean easy, and it does not mean hard.
//
// COUNTERFACTUALS ARE DETERMINACY, NOT VALUE
//
// For a prose-claim or subset target, deleting the mechanism cannot move the
// answer — a true claim stays true. Artifact 13 §8.7 states the test that
// applies instead: the item must be UNANSWERABLE with the relation withheld,
// proved by counting the options that survive. Every construct here that offers
// claims declares `kind: 'determinacy'`; the ones with a computable answer
// declare a value counterfactual like any other primitive.

import {
  Q, qAdd, qSub, qMul, qDiv, qNeg, qEq, qNum, qIsInt, qStr,
  rng, ROUTE, layout, coef, term, signedConst,
} from './est-primitives.mjs';

/* ══════════════════ P-INTERPRET — the answer is a reading ══════════════════ */

export function pInterpret(seed, opts = {}) {
  const rand = typeof seed === 'function' ? seed : rng(seed);
  // `claim_from_display` is DELIBERATELY NOT OFFERED. It was written first, and
  // then a claim READER over a shared bar chart was added so that a set slot
  // could stop being value-locked. The two are the same question: they share
  // context, chain, target, option kind, distractor family and narrative, and
  // the anti-clone check refused the second wherever the first was placed —
  // which cost a slot on every seed. The reader is the more useful of the two
  // because it can fill a set slot, so it is the one kept. The function stays
  // below as the record of a construct that did not earn a place, and the rule
  // it illustrates: a new sub-form counts as coverage only when it is not
  // already in the library under another name.
  const form = opts.form || rand.pick(['parameter_meaning', 'axes_comprehension']);
  if (form === 'parameter_meaning') return parameterMeaning(rand);
  if (form === 'axes_comprehension') return axesComprehension(rand);
  return claimFromDisplay(rand);
}

/**
 * T1 Q5 and T4 Q9: four readings of one constant, zero computation.
 *
 * The mechanism is `competing_interp` and it is genuinely load-bearing: the
 * distractors are the OTHER parameter's meaning, the meaning of the same
 * parameter in the wrong units, and the value the model gives at a named input.
 * Each is a reading a student defends.
 */
function parameterMeaning(rand) {
  const rate = rand.pick([12, 15, 18, 24, 35, 45]);
  const fixed = rand.pick([200, 250, 400, 600, 1200]);
  const unit = rand.pick(['machine', 'crate', 'panel', 'session']);
  const at = rand.int(4, 9);
  // Options are objects (prose), so their VALUES are indices; nothing arithmetic
  // is compared, and the index is never printed.
  const texts = [
    `the cost of each additional ${unit}`,                       // key: the rate
    `the cost when no ${unit}s are produced`,                    // the intercept — the other parameter
    `the total cost of ${at} ${unit}s`,                          // the model evaluated somewhere
    `the number of ${unit}s that can be produced for $\\$${fixed}$`,  // the inverse reading
  ];
  const L = layout(rand, Q(0), [Q(1), Q(2), Q(3)], v => texts[qNum(v)]);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-INTERPRET', species: 'parameter-reading', form: 'parameter_meaning',
    stem: `The total cost $C$, in dollars, of producing $n$ ${unit}s is given by $C = ${rate}n + ${fixed}$. ` +
          `In this model, what is the meaning of the number $${rate}$?`,
    ...L,
    distractorClasses: ['D2', 'D2', 'D5'],
    // Coded as the corpus codes its own analogue, T1 Q5 (RLx 12, Core band):
    // abstraction and competing_interp bite, filtering / repr_switch / inference
    // are present and mild, and NOTHING from the reasoning core bites. Coding it
    // heavier put it in Peak, where the corpus does not put this item.
    mechanism: { abstraction: 2, competing_interp: 2, filtering: 1, repr_switch: 1, inference: 1 },
    routes: [
      ROUTE('map-each-coefficient-to-its-role', { insight: true, cost: 2, value: Q(0) }),
      ROUTE('read-the-other-coefficient', { insight: false, cost: 1, value: Q(1), natural: true }),
      ROUTE('evaluate-the-model-somewhere', { insight: false, cost: 2, value: Q(2) }),
      ROUTE('invert-the-relationship', { insight: false, cost: 2, value: Q(3) }),
    ],
    // With the model's structure withheld — which symbol is the input and which
    // the output — all four readings survive. Nothing is computed, so there is
    // no value to move.
    counterfactual: { kind: 'determinacy', note: 'the roles of n and C withheld', optionsSurviving: 4 },
    fingerprintParts: {
      ctx: 'linear-model-in-words', chain: ['identify-the-varying-term', 'name-its-role'],
      target: 'interpretation:parameter', options: 'prose-claims', distract: ['D2', 'D2', 'D5'],
      narrative: 'cost-model-two-parameters', numeric: ['rate', 'fixed'],
    },
    object: 'parameter-interpret-rate',
  };
}

/**
 * T4 Q15 and T4 Q16: four claims about a display, one supported.
 *
 * The display is generated with the claims, because a claim is only checkable
 * against the numbers it is about. The mechanism is `filtering` — three claims
 * are each true of SOME part of the data and false of the whole.
 */
function claimFromDisplay(rand) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu'];
  const v = [rand.int(10, 25), rand.int(26, 40), rand.int(10, 25), rand.int(26, 45)];
  if (v[1] === v[3] || v[0] === v[2]) return { error: 'a tie makes two claims equally true' };
  const total = v.reduce((a, b) => a + b, 0);
  const hi = v.indexOf(Math.max(...v)), lo = v.indexOf(Math.min(...v));
  if (hi === 3 && lo === 0) return { error: 'a monotone series makes the trend claim true as well' };
  const half = total / 2;
  const firstTwo = v[0] + v[1];
  if (firstTwo === half) return { error: 'the halves are equal, so the split claim is undecidable' };
  const texts = [
    `More items were sold on ${days[hi]} than on any other day`,          // key: true of the whole
    `Sales increased on each successive day`,                            // true of a RUN, not the whole
    `More than half of the items were sold in the first two days`,       // true only if firstTwo > half
    `The fewest items were sold on ${days[(lo + 1) % 4]}`,                // the wrong argmin
  ];
  if (firstTwo > half) return { error: 'the split claim is also true — two options survive' };
  const L = layout(rand, Q(0), [Q(1), Q(2), Q(3)], val => texts[qNum(val)]);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-INTERPRET', species: 'claim-evaluation', form: 'claim_from_display',
    stimulus: { kind: 'bar-chart', title: 'Items sold', categories: days, values: v, sharable: false },
    stem: `The bar chart shows the number of items sold on four days. Which of the following statements is supported by the data?`,
    ...L,
    distractorClasses: ['D5', 'D5', 'D5'],
    // T4 Q15 (RLx 17): filtering, competing_interp, repr_switch and inference
    // all bite; hidden_step and multiconcept are mild.
    mechanism: { filtering: 2, competing_interp: 2, inference: 2, repr_switch: 2, hidden_step: 1, multiconcept: 1 },
    routes: [
      ROUTE('test-each-claim-against-the-whole-display', { insight: true, cost: 4, value: Q(0) }),
      ROUTE('accept-a-claim-true-of-part-of-the-data', { insight: false, cost: 2, value: Q(1), natural: true }),
      ROUTE('estimate-the-halves-by-eye', { insight: false, cost: 2, value: Q(2) }),
      ROUTE('read-the-wrong-extreme', { insight: false, cost: 1, value: Q(3) }),
    ],
    counterfactual: { kind: 'determinacy', note: 'the bar values withheld', optionsSurviving: 4 },
    fingerprintParts: {
      ctx: 'stimulus:bar-chart claim-set', chain: ['test-each-claim', 'reject-the-partly-true'],
      target: 'selection:claim', options: 'prose-claims', distract: ['D5', 'D5', 'D5'],
      narrative: 'four-category-display', numeric: ['bar-values'],
    },
    object: 'qualitative-claim-eval',
  };
}

/**
 * T1 Q29: zero computation, reads the AXES against four claims.
 *
 * Distinct from claim_from_display in decision point: there the claims are
 * about the values, here they are about what the axes mean. The reference opens
 * a four-item block with one.
 */
function axesComprehension(rand) {
  const quantity = rand.pick(['distance travelled', 'volume remaining', 'temperature', 'charge stored']);
  const unit = { 'distance travelled': 'kilometres', 'volume remaining': 'litres', temperature: 'degrees', 'charge stored': 'percent' }[quantity];
  const start = rand.int(40, 90), end = rand.int(5, 30);
  const mins = rand.pick([20, 30, 40, 60]);
  if (start <= end) return { error: 'the series does not decrease' };
  const texts = [
    `the ${quantity} fell by ${start - end} ${unit} over ${mins} minutes`,   // key
    `the ${quantity} fell by ${start - end} ${unit} each minute`,            // rate read as total
    `the ${quantity} fell to ${start - end} ${unit}`,                        // change read as level
    `the ${quantity} rose by ${start - end} ${unit} over ${mins} minutes`,   // direction reversed
  ];
  const L = layout(rand, Q(0), [Q(1), Q(2), Q(3)], v => texts[qNum(v)]);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-INTERPRET', species: 'claim-evaluation', form: 'axes_comprehension',
    stimulus: { kind: 'line-graph', title: `${quantity} over time`,
      xLabel: 'time (minutes)', yLabel: `${quantity} (${unit})`,
      points: [[0, start], [mins, end]], sharable: false },
    stem: `The graph shows the ${quantity}, in ${unit}, against time in minutes. Which of the following describes what the graph shows?`,
    ...L,
    distractorClasses: ['D2', 'D2', 'D3'],
    // T1 Q29 (RLx 6, ENTRY): "zero computation. Reads the axes against four
    // claims." One mechanism bites — filtering — and the rest are mild. An
    // Entry-band item that does not ask for a value is exactly what the library
    // had none of.
    mechanism: { filtering: 2, competing_interp: 1, repr_switch: 1, inference: 1 },
    routes: [
      ROUTE('read-both-axes-then-the-endpoints', { insight: true, cost: 3, value: Q(0) }),
      ROUTE('read-the-change-as-a-rate', { insight: false, cost: 2, value: Q(1), natural: true }),
      ROUTE('read-the-change-as-a-level', { insight: false, cost: 2, value: Q(2) }),
      ROUTE('lose-the-direction', { insight: false, cost: 1, value: Q(3) }),
    ],
    counterfactual: { kind: 'determinacy', note: 'the axis labels withheld', optionsSurviving: 4 },
    fingerprintParts: {
      ctx: 'stimulus:line-graph axes-claims', chain: ['read-the-axis-units', 'read-the-endpoints', 'name-the-change'],
      target: 'selection:claim', options: 'prose-claims', distract: ['D2', 'D2', 'D3'],
      narrative: 'one-quantity-over-time', numeric: ['start', 'end', 'span'],
    },
    object: 'graph-comprehension-axes',
  };
}

/* ══════════════════ P-SUBSET — three statements, which hold ══════════════════ */

/**
 * The blueprint has required exactly one Roman-numeral item per form since
 * artifact 6 (`SPECIAL_FORMS.roman: [1, 1]`) and the generator could not make
 * one. The corpus has three (T3 Q7, T4 Q8, T4 Q41) and their note on T3 Q7 is
 * the design constraint: "option set leaks: I appears in 3 of 4 options so I is
 * probably true; real work collapses to statement II". So the option set here
 * is built so that **each statement appears in exactly two of the four
 * options** — no statement can be inferred from the grid.
 */
export function pSubset(seed, opts = {}) {
  const rand = typeof seed === 'function' ? seed : rng(seed);
  const form = opts.form || rand.pick(['roman_properties', 'roman_conditions']);
  return form === 'roman_properties' ? romanProperties(rand) : romanConditions(rand);
}

/** A balanced I/II/III grid: each statement in exactly two options. */
const ROMAN_GRID = [
  { label: 'I and II only', has: [1, 1, 0] },
  { label: 'I and III only', has: [1, 0, 1] },
  { label: 'II and III only', has: [0, 1, 1] },
  { label: 'I, II and III', has: [1, 1, 1] },
];

function romanLayout(rand, truth, statements) {
  // The key is the option whose membership matches the truth vector exactly.
  const idx = ROMAN_GRID.findIndex(g => g.has.every((h, i) => !!h === !!truth[i]));
  if (idx < 0) return { error: 'the truth pattern is not one the four printed options offer' };
  const L = layout(rand, Q(idx), [0, 1, 2, 3].filter(i => i !== idx).map(i => Q(i)),
    v => ROMAN_GRID[qNum(v)].label);
  if (L.error) return L;
  return { ...L, statements };
}

/** T4 Q41's shape: "undefined" versus "zero", asked over three statements. */
function romanProperties(rand) {
  const k = rand.pick([2, 3, 5, 6]);
  const n = k * k * rand.int(2, 6);
  // I  n is divisible by k        TRUE
  // II n is divisible by k^2      TRUE only when the multiplier is not coprime… built TRUE
  // III n is a perfect square     FALSE for a non-square multiplier
  const mult = n / (k * k);
  const isSquare = Number.isInteger(Math.sqrt(mult));
  if (isSquare) return { error: 'the multiplier is a square, so statement III is also true' };
  const truth = [1, 1, 0];
  const statements = [`$n$ is divisible by $${k}$`, `$n$ is divisible by $${k * k}$`, `$n$ is a perfect square`];
  const L = romanLayout(rand, truth, statements);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-SUBSET', species: 'multi-statement-subset', form: 'roman_properties',
    stem: `The positive integer $n$ satisfies $n = ${k * k}m$, where $m$ is a positive integer that is not a perfect square. ` +
          `Which of the following must be true?\n\n` +
          statements.map((s, i) => `${['I', 'II', 'III'][i]}. ${s}`).join('\n'),
    ...L,
    distractorClasses: ['D2', 'D2', 'D2'],
    // T4 Q41 (RLx 13): competing_interp bites — "the entire item is 'undefined'
    // versus '0'" — and seven mechanisms are mildly in play. That profile is
    // exactly the shape the Stage-3.5 signatures could not place, and the Core
    // route added for it is what makes this item placeable.
    mechanism: { competing_interp: 2, abstraction: 1, hidden_step: 1, filtering: 1,
      nonobvious_rel: 1, multiconcept: 1, inference: 1 },
    routes: [
      ROUTE('test-each-statement-against-the-given-form', { insight: true, cost: 4, value: Q(qNum(L.options.find(o => o.id === L.key).value)) }),
      ROUTE('assume-the-square-factor-makes-n-square', { insight: false, cost: 2, natural: true,
        value: Q(ROMAN_GRID.findIndex(g => g.has.join('') === '111')) }),
      ROUTE('miss-the-stronger-divisibility', { insight: false, cost: 2,
        value: Q(ROMAN_GRID.findIndex(g => g.has.join('') === '101')) }),
      ROUTE('drop-the-weaker-divisibility', { insight: false, cost: 2,
        value: Q(ROMAN_GRID.findIndex(g => g.has.join('') === '011')) }),
    ],
    counterfactual: { kind: 'determinacy', note: 'the "not a perfect square" condition withheld', optionsSurviving: 2 },
    fingerprintParts: {
      ctx: 'integer-properties subset-grid', chain: ['test-statement-i', 'test-statement-ii', 'test-statement-iii'],
      target: 'selection:roman-subset', options: 'roman-subsets', distract: ['D2', 'D2', 'D2'],
      narrative: 'one-integer-in-factored-form', numeric: ['square-factor', 'multiplier'],
    },
    object: 'roman-numeral-properties',
  };
}

/** T3 Q7's shape over a rational expression: where it is zero, undefined, negative. */
function romanConditions(rand) {
  const a = rand.nonZero(-8, 8), b = rand.nonZero(-8, 8);
  if (a === b) return { error: 'the factors coincide and the expression simplifies' };
  // f(x) = (x - a) / (x - b)
  // I   f is undefined at x = b        TRUE
  // II  f is zero at x = a             TRUE
  // III f is zero at x = b             FALSE
  const truth = [1, 1, 0];
  const statements = [
    `$f$ is undefined at $x = ${b}$`,
    `$f(${a}) = 0$`,
    `$f(${b}) = 0$`,
  ];
  const L = romanLayout(rand, truth, statements);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-SUBSET', species: 'multi-statement-subset', form: 'roman_conditions',
    stem: `The function $f$ is defined by $f(x) = \\dfrac{x ${signedConst(-a)}}{x ${signedConst(-b)}}$. ` +
          `Which of the following must be true?\n\n` +
          statements.map((s, i) => `${['I', 'II', 'III'][i]}. ${s}`).join('\n'),
    ...L,
    distractorClasses: ['D2', 'D2', 'D2'],
    // T3 Q7 (RLx 18, Peak): four mechanisms bite over three statements.
    mechanism: { filtering: 2, multiconcept: 2, repr_switch: 2, competing_interp: 1,
      abstraction: 1, hidden_step: 1, inference: 1, reversal: 1 },
    routes: [
      ROUTE('separate-zero-from-undefined', { insight: true, cost: 4, value: Q(qNum(L.options.find(o => o.id === L.key).value)) }),
      ROUTE('treat-undefined-as-zero', { insight: false, cost: 2, natural: true,
        value: Q(ROMAN_GRID.findIndex(g => g.has.join('') === '111')) }),
      ROUTE('read-the-denominator-root-as-the-zero', { insight: false, cost: 2,
        value: Q(ROMAN_GRID.findIndex(g => g.has.join('') === '101')) }),
      ROUTE('lose-the-undefined-point', { insight: false, cost: 2,
        value: Q(ROMAN_GRID.findIndex(g => g.has.join('') === '011')) }),
    ],
    counterfactual: { kind: 'determinacy', note: 'the distinction between zero and undefined withheld', optionsSurviving: 3 },
    fingerprintParts: {
      ctx: 'rational-function subset-grid', chain: ['locate-the-zero', 'locate-the-pole', 'test-each-statement'],
      target: 'selection:roman-subset', options: 'roman-subsets', distract: ['D2', 'D2', 'D2'],
      narrative: 'symbols-only:one-rational', numeric: ['numerator-root', 'denominator-root'],
    },
    object: 'roman-numeral-sign-reasoning',
  };
}

/* ══════════════════ P-SELECT-OBJECT — the options are objects ══════════════════ */

/**
 * Six reference items print objects rather than values and the publisher's own
 * method is OPTION TESTING — "the publisher solves all four systems",
 * "substitutes all four points", "solves by elimination over the four graphs".
 * That is a genuinely different decision point: the work is deciding which
 * candidate survives, not producing a number.
 */
export function pSelectObject(seed, opts = {}) {
  const rand = typeof seed === 'function' ? seed : rng(seed);
  const form = opts.form || rand.pick(['which_equation', 'which_system']);
  return form === 'which_equation' ? whichEquation(rand) : whichSystem(rand);
}

/** T2 Q5: "which equation represents the line perpendicular to … through …". */
function whichEquation(rand) {
  const p = rand.pick([2, 3, 4, 5]);                 // the perpendicular slope, an integer
  const sign = rand.pick([1, -1]);
  const perp = sign * p;
  const x0 = rand.nonZero(-6, 6), y0 = rand.nonZero(-9, 9);
  const cPerp = y0 - perp * x0;
  // the given line's slope is the negative reciprocal of perp — printed in
  // standard form so no fraction appears anywhere.
  const A = sign, B = p;                             // Ax + By = C has slope -A/B = -sign/p
  const C = rand.nonZero(-20, 20);
  const mGiven = -A / B;
  if (Math.abs(-1 / mGiven - perp) > 1e-9) return { error: 'the perpendicular slope is not the one intended' };
  const cParallelish = y0 - Math.round(mGiven * x0);
  const texts = [
    `y = ${coef(perp, 'x')} ${term(cPerp, '')}`,
    `y = ${coef(-perp, 'x')} ${term(cPerp, '')}`,
    `y = ${coef(perp, 'x')} ${term(-cPerp, '')}`,
    `y = ${coef(perp, 'x')} ${term(cParallelish, '')}`,
  ];
  if (new Set(texts).size !== 4) return { error: 'two options print identically' };
  const L = layout(rand, Q(0), [Q(1), Q(2), Q(3)], v => texts[qNum(v)]);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-SELECT-OBJECT', species: 'object-selection', form: 'which_equation',
    stem: `In the $xy$-plane, line $k$ has equation $${coef(A, 'x')} ${term(B, 'y')} = ${C}$. ` +
          `Which of the following is an equation of the line perpendicular to $k$ that passes through $(${x0}, ${y0})$?`,
    ...L,
    distractorClasses: ['D2', 'D2', 'D2'],
    // T2 Q5 (RLx 8, ENTRY): "perpendicular slope through a given point".
    // multiconcept and repr_switch mild, distractor_close 2, trap_cost 2 — the
    // corpus does NOT code this as a hard item, and coding it as one would have
    // put an ordinary question in Peak.
    mechanism: { multiconcept: 1, repr_switch: 1, hidden_step: 1, abstraction: 1 },
    routes: [
      ROUTE('negative-reciprocal-then-substitute-the-point', { insight: true, cost: 3, value: Q(0) }),
      // Full-cost trap: keeping the given slope is a complete, correct fit
      // through the point, and costs what the right method costs.
      ROUTE('use-the-given-slope-unchanged', { insight: false, cost: 3, value: Q(3), natural: true }),
      ROUTE('negate-without-inverting', { insight: false, cost: 3, value: Q(1) }),
      ROUTE('sign-slip-on-the-intercept', { insight: false, cost: 4, value: Q(2) }),
    ],
    // Without the perpendicular relation the slope is unknown, so the key moves
    // to the option carrying the GIVEN slope.
    counterfactual: { kind: 'value', note: 'the perpendicular relation withheld', value: Q(3) },
    fingerprintParts: {
      ctx: 'coordinate-line object-options', chain: ['convert-standard-to-slope', 'take-the-negative-reciprocal', 'fit-through-the-point'],
      target: 'equation:line', options: 'equation-set', distract: ['D2', 'D2', 'D2'],
      narrative: 'symbols-only:line-and-point', numeric: ['coeffs', 'point'],
    },
    object: 'perpendicular-parameters-composite',
  };
}

/** T3 Q29's shape: four systems printed, one has the stated solution set. */
function whichSystem(rand) {
  const a = rand.int(2, 5), b = rand.nonZero(-5, 5);
  const k = rand.pick([2, 3]);
  // The key: a system with NO solution — same slope, different intercept.
  const c1 = rand.nonZero(-12, 12);
  const c2 = c1 + rand.nonZero(1, 6);
  // Each option prints two equations, so each carries its own math delimiters —
  // the first version emitted `2x + 5y = 6$ and $6x + 15y = 30`, with the
  // dollars in the wrong places and the whole option rendering as broken markup.
  const sys = (p, q, r, t) => `$${coef(p, 'x')} ${term(q, 'y')} = ${r}$ and $${coef(p * k, 'x')} ${term(q * k, 'y')} = ${t}$`;
  const texts = [
    sys(a, b, c1, c2 * k),                                                                 // key: parallel, no solution
    sys(a, b, c1, c1 * k),                                                                 // same line: infinitely many
    `$${coef(a, 'x')} ${term(b, 'y')} = ${c1}$ and $${coef(b, 'x')} ${term(a, 'y')} = ${c2}$`,   // different slopes
    `$${coef(a, 'x')} ${term(b, 'y')} = ${c1}$ and $${coef(a, 'x')} ${term(-b, 'y')} = ${c2}$`,  // different slopes
  ];
  if (new Set(texts).size !== 4) return { error: 'two options print identically' };
  if (a === b || a === -b) return { error: 'the swapped-coefficient option has the same slope' };
  const L = layout(rand, Q(0), [Q(1), Q(2), Q(3)], v => texts[qNum(v)]);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-SELECT-OBJECT', species: 'object-selection', form: 'which_system',
    stem: `Which of the following systems of equations has no solution?`,
    ...L,
    distractorClasses: ['D2', 'D5', 'D5'],
    // T3 Q29 (RLx 15, Stretch): filtering and inference bite; the rest mild.
    mechanism: { filtering: 2, inference: 2, abstraction: 1, hidden_step: 1,
      multiconcept: 1, repr_switch: 1, reversal: 1 },
    routes: [
      ROUTE('compare-slopes-then-intercepts', { insight: true, cost: 4, value: Q(0) }),
      ROUTE('stop-at-proportional-coefficients', { insight: false, cost: 2, value: Q(1), natural: true }),
      ROUTE('read-swapped-coefficients-as-proportional', { insight: false, cost: 2, value: Q(2) }),
      ROUTE('read-a-sign-change-as-proportional', { insight: false, cost: 2, value: Q(3) }),
    ],
    // With the intercept comparison withheld, the parallel and the coincident
    // systems are indistinguishable and both survive.
    counterfactual: { kind: 'determinacy', note: 'the intercept comparison withheld', optionsSurviving: 2 },
    fingerprintParts: {
      ctx: 'linear-system object-options', chain: ['compare-the-coefficient-ratios', 'compare-the-constants'],
      target: 'selection:system', options: 'object-valued', distract: ['D2', 'D5', 'D5'],
      narrative: 'four-candidate-systems', numeric: ['coeffs', 'constants', 'scale'],
    },
    object: 'infinite-solutions-identify',
  };
}

export const INTERPRET_PRIMITIVES = {
  'P-INTERPRET': pInterpret,
  'P-SUBSET': pSubset,
  'P-SELECT-OBJECT': pSelectObject,
};
