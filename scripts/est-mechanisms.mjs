// The mechanism-stream expansion — Stage B.
//
// WHY THIS FILE EXISTS
//
// Stage 22 added 78 structures to the library and measured that the number of
// structures actually reaching a slot did not move by one. The reason was
// located in Stage B: 19 of the 48 (family, band) cells the assembler realises
// hold exactly ONE object, 16 of them mechanism, and the mechanism stream was
// the one stream Stage 22 did not touch. It fills 19 of 50 slots from 24
// objects and 16 of those objects appear in every form.
//
// A cell with one object emits that object in every form of a series however
// large the rest of the library is. So this file is not vocabulary work; it is
// the only work that can move the cells that are actually forced.
//
// WHAT EACH ITEM HERE HAS TO SATISFY
//
// `assess()`, unchanged and unweakened:
//   * an INSIGHT route reaches the key;
//   * no mechanism-blind route reaches the key at cost <= the insight's;
//   * some mechanism-blind route lands on a PRINTED distractor;
//   * a counterfactual holds — withholding the mechanism moves the answer
//     (`value`) or leaves more than one option standing (`determinacy`).
//
// WHICH SPECIES, AND WHY THESE
//
// The brief asked for non-value targets, equation targets, interpretation,
// competing interpretations, filtering, multiple valid approaches and hidden
// relationships, where the corpus supports them. Every construct below names a
// reference archetype the library could not previously build, so "where the
// corpus supports them" is a lookup rather than a claim; the species mix is
// recorded in MECHANISM_SPECIES at the foot of the file and asserted in the
// test suite.
//
// NO EXAM CONTENT. Structures and our own illustrations only.

import {
  Q, qAdd, qSub, qMul, qDiv, qNeg, qEq, qNum, qIsInt, qStr,
  rng, ROUTE, layout, coef, term, signedConst,
} from './est-primitives.mjs';

// WHY THERE IS NO ROMAN-NUMERAL GRID IN THIS FILE, THOUGH TWO OF THE ARCHETYPES
// BELOW ARE ROMAN-NUMERAL ITEMS IN THE CORPUS
//
// `DEVICE_BUDGETS.roman` is [1, 1]: exactly one Roman-numeral multi-statement
// item per form. The library already spends that budget on P-SUBSET, whose two
// forms serve A18 and A08. Adding more grid items does not add a placeable
// slot — it adds competition for the one that exists, and measured directly:
// with two more grid constructs in the pool, A08's Stretch slot went unfilled
// on nine seeds in ten, because A08 holds exactly one mechanism structure and
// it is the Roman one.
//
// So `always-true-parallel-angles` and `circle-roman-numeral` are realised here
// as FOUR PROSE CLAIMS rather than an I/II/III grid. The reasoning is the
// archetype's — classify each angle pair, or complete the square, then judge
// what must be true — and the target is still a claim rather than a value. Only
// the presentation differs, and it differs because the blueprint says one grid
// item per form and means it.
//
// Worth recording separately: that budget is enforced today ONLY by the option
// grid content signature, which flags two items sharing the boilerplate "I and
// II only ..." labels as repeated content. It is the right outcome by the wrong
// mechanism, and `DEVICE_BUDGETS` is not consulted by the assembler at all.

/** Options that are labelled choices rather than values: A-D over a text list. */
function choiceLayout(rand, keyIndex, texts) {
  return layout(rand, Q(keyIndex), texts.map((_, i) => i).filter(i => i !== keyIndex).map(i => Q(i)),
    v => texts[qNum(v)]);
}

/** The near-distractor rule, applied by hand where a construct lays out values. */
const hasNear = (key, others) => {
  const kn = Math.abs(qNum(key));
  return others.some(d => {
    const v = Math.abs(qNum(d));
    return kn === 0 ? v < 3 : v > kn / 3 && v < kn * 3;
  });
};

/* ══════════════════════════ A01 — solving for a symbol ══════════════════════════ */

/**
 * `literal-system`: solve a two-symbol relation for one symbol, options being
 * EXPRESSIONS. The mechanism is that the division is by a compound factor, and
 * the blind route divides by one term of it.
 *
 * A01 held one mechanism object and a Peak cell that asked for it every form.
 */
function literalSystem(rand) {
  const a = rand.int(2, 6), b = rand.int(2, 6);
  if (a === b) return { error: 'the two coefficients coincide, so the compound factor collapses' };
  // a·x + b·y = x·c  ->  x(a − c) = −b·y  ->  x = b·y / (c − a)
  const texts = [
    `$x = \\dfrac{${b}y}{c - ${a}}$`,      // 0 correct
    `$x = \\dfrac{${b}y}{c}$`,             // 1 divided by c alone
    `$x = \\dfrac{${b}y}{${a} - c}$`,      // 2 sign of the compound factor
    `$x = ${b}y(c - ${a})$`,               // 3 multiplied instead of divided
  ];
  const L = choiceLayout(rand, 0, texts);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-ISOLATE', species: 'compound-factor-isolation', form: 'literal_system',
    stem: `If $${coef(a, 'x')} ${term(b, 'y')} = cx$, which of the following expresses $x$ in terms of $y$ and $c$?`,
    ...L,
    distractorClasses: ['D2', 'D3', 'D2'],
    mechanism: { hidden_step: 2, abstraction: 2, reversal: 1, nonobvious_rel: 1, trap_cost: 2 },
    routes: [
      ROUTE('collect-x-then-divide-by-the-compound-factor', { insight: true, cost: 4, value: Q(0) }),
      ROUTE('divide-by-c-without-collecting', { insight: false, cost: 2, natural: true, value: Q(1) }),
      ROUTE('sign-slip-on-the-compound-factor', { insight: false, cost: 3, value: Q(2) }),
      ROUTE('multiply-where-the-isolation-divides', { insight: false, cost: 2, value: Q(3) }),
    ],
    counterfactual: { kind: 'determinacy', note: 'the collection step withheld leaves both divisions standing', optionsSurviving: 2 },
    fingerprintParts: {
      ctx: 'literal-equation no-stimulus', chain: ['collect-the-target-symbol', 'factor-it-out', 'divide-by-the-compound-factor'],
      target: 'expression:isolated-symbol', options: 'expression-set', distract: ['D2', 'D3', 'D2'],
      narrative: 'symbols-only:two-symbol-relation', numeric: ['coeff-a', 'coeff-b'],
    },
  };
}

/* ══════════════════════════ A04 — inequalities ══════════════════════════ */

/**
 * `inequality-system-quadrant`: which quadrant contains NO point satisfying both
 * inequalities. Filtering, and a selection target.
 */
function inequalitySystemQuadrant(rand) {
  const m = rand.int(1, 3), c = rand.int(1, 6);
  // y > m x + c and y > -m x + c : both hold above two lines meeting at (0, c),
  // so the empty quadrant is the one below the axis on the far side.
  const texts = ['Quadrant I', 'Quadrant II', 'Quadrant III', 'Quadrant IV'];
  const L = choiceLayout(rand, 2, texts);            // III is empty
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-REGION', species: 'region-elimination', form: 'inequality_system_quadrant',
    stem: `In the $xy$-plane, the solution set of the system $y > ${coef(m, 'x')} + ${c}$ and ` +
          `$y > ${coef(-m, 'x')} + ${c}$ is shown. Which quadrant contains no solution to the system?`,
    ...L,
    distractorClasses: ['D5', 'D5', 'D5'],
    mechanism: { filtering: 2, abstraction: 2, inference: 1, multiconcept: 1, trap_cost: 2 },
    routes: [
      ROUTE('intersect-both-half-planes-then-eliminate', { insight: true, cost: 4, value: Q(2) }),
      ROUTE('test-only-the-first-inequality', { insight: false, cost: 2, natural: true, value: Q(3) }),
      ROUTE('assume-the-positive-intercept-excludes-the-second-quadrant', { insight: false, cost: 2, value: Q(1) }),
      ROUTE('assume-the-solution-set-is-the-first-quadrant-only', { insight: false, cost: 2, value: Q(0) }),
    ],
    counterfactual: { kind: 'determinacy', note: 'one inequality withheld leaves two quadrants empty', optionsSurviving: 2 },
    fingerprintParts: {
      ctx: 'inequalities no-stimulus', chain: ['sketch-each-half-plane', 'intersect-them', 'eliminate-the-empty-quadrant'],
      target: 'selection:region', options: 'quadrant-set', distract: ['D5', 'D5', 'D5'],
      narrative: 'symbols-only:two-inequalities', numeric: ['slope', 'intercept'],
    },
  };
}

/* ══════════════════════════ A06 — quadratics ══════════════════════════ */

/**
 * `tangent-at-vertex-concept`: the horizontal line meeting a parabola exactly
 * once is the one through its vertex. The blind route solves the discriminant
 * for a general line and gets a different, printed, number.
 */
function tangentAtVertex(rand) {
  const a = rand.pick([1, 2, 3]), h = rand.nonZero(-6, 6), k = rand.nonZero(-9, 9);
  const key = Q(k), atZero = Q(a * h * h + k), axis = Q(h), lead = Q(a);
  const others = [atZero, axis, lead];
  if ([atZero, axis, lead].some(v => qEq(v, key)) || qEq(atZero, axis) || qEq(atZero, lead) || qEq(axis, lead))
    return { error: 'two options coincide' };
  if (!hasNear(key, others)) return { error: 'every distractor is more than a factor of three from the key' };
  const L = layout(rand, key, others);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-TANGENCY', species: 'single-intersection-gate', form: 'tangent_at_vertex',
    stem: `In the $xy$-plane, the graph of $y = ${coef(a, `(x ${signedConst(-h)})^{2}`)} ${term(k, '')}$ and the ` +
          `line $y = d$ intersect at exactly one point. What is the value of $d$?`,
    ...L,
    distractorClasses: ['D2', 'D6', 'D6'],
    mechanism: { nonobvious_rel: 2, abstraction: 2, hidden_step: 1, multiconcept: 1, trap_cost: 2 },
    routes: [
      ROUTE('recognise-the-single-intersection-as-the-vertex', { insight: true, cost: 3, value: key }),
      ROUTE('evaluate-the-parabola-at-zero', { insight: false, cost: 2, natural: true, value: atZero }),
      ROUTE('report-the-axis-of-symmetry', { insight: false, cost: 2, value: axis }),
      ROUTE('report-the-leading-coefficient', { insight: false, cost: 1, value: lead }),
    ],
    counterfactual: { kind: 'value', note: 'tangency ignored, the line read at x = 0', value: atZero },
    fingerprintParts: {
      ctx: 'quadratic no-stimulus', chain: ['read-the-vertex-form', 'identify-the-tangent-height'],
      target: 'value:parameter', options: 'vertex-coordinate-confusions', distract: ['D2', 'D6', 'D6'],
      narrative: 'symbols-only:parabola-and-horizontal-line', numeric: ['leading', 'shift-h', 'shift-k'],
    },
  };
}

/**
 * `parabola-inscribed-square`: a square sits on the x-axis with its upper
 * vertices on y = c − x². Its side is the value of s for which s = 2x and
 * s = c − x², which is a quadratic in disguise.
 */
function parabolaInscribedSquare(rand) {
  // Choose the half-width first so the side is whole: x = t, side = 2t,
  // c = 2t + t^2.
  const t = rand.int(1, 6), side = 2 * t, c = 2 * t + t * t;
  const halfWidth = Q(t), height = Q(c), doubled = Q(4 * t);
  const key = Q(side);
  const others = [halfWidth, height, doubled];
  if ([halfWidth, height, doubled].some(v => qEq(v, key)) || qEq(halfWidth, height)
      || qEq(halfWidth, doubled) || qEq(height, doubled)) return { error: 'two options coincide' };
  if (!hasNear(key, others)) return { error: 'every distractor is more than a factor of three from the key' };
  const L = layout(rand, key, others);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-INSCRIBED', species: 'figure-into-equation', form: 'parabola_inscribed_square',
    stem: `In the $xy$-plane, a square has two vertices on the $x$-axis and two vertices on the graph of ` +
          `$y = ${c} - x^{2}$. The square is symmetric about the $y$-axis. What is the length of a side of the square?`,
    ...L,
    distractorClasses: ['D2', 'D6', 'D1'],
    mechanism: { multiconcept: 2, hidden_step: 2, abstraction: 1, nonobvious_rel: 1, trap_cost: 2 },
    routes: [
      ROUTE('set-the-side-equal-to-both-the-width-and-the-height', { insight: true, cost: 5, value: key }),
      ROUTE('report-the-half-width', { insight: false, cost: 3, natural: true, value: halfWidth }),
      ROUTE('read-the-y-intercept-as-the-side', { insight: false, cost: 2, value: height }),
      ROUTE('double-the-side-again', { insight: false, cost: 4, value: doubled }),
    ],
    counterfactual: { kind: 'value', note: 'the square condition withheld, only the half-width survives', value: halfWidth },
    fingerprintParts: {
      ctx: 'quadratic no-stimulus', chain: ['name-the-half-width', 'equate-width-and-height', 'solve-the-quadratic'],
      target: 'value:length', options: 'dimension-confusions', distract: ['D2', 'D6', 'D1'],
      narrative: 'symbols-only:inscribed-figure', numeric: ['intercept'],
    },
  };
}

/* ══════════════════════════ A09 — functions ══════════════════════════ */

/**
 * `multi-curve-graph-sum`: two functions are tabulated and the item asks for
 * (f + g) at a point where the blind route reads only one of them.
 */
function multiCurveSum(rand) {
  const x = rand.int(1, 6);
  const f = rand.nonZero(-9, 9), g = rand.nonZero(-9, 9);
  const key = Q(f + g), diff = Q(f - g), prod = Q(f * g), one = Q(f);
  const others = [diff, prod, one];
  if (f + g === 0) return { error: 'the sum vanishes' };
  if ([diff, prod, one].some(v => qEq(v, key)) || qEq(diff, prod) || qEq(diff, one) || qEq(prod, one))
    return { error: 'two options coincide' };
  if (!hasNear(key, others)) return { error: 'every distractor is more than a factor of three from the key' };
  const L = layout(rand, key, others);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-SUPERPOSE', species: 'two-curve-combination', form: 'multi_curve_sum',
    stem: `The functions $f$ and $g$ satisfy $f(${x}) = ${f}$ and $g(${x}) = ${g}$. The function $h$ is defined by ` +
          `$h(x) = f(x) + g(x)$. What is the value of $h(${x})$?`,
    ...L,
    distractorClasses: ['D3', 'D2', 'D6'],
    mechanism: { abstraction: 2, multiconcept: 2, repr_switch: 1, trap_cost: 2 },
    routes: [
      ROUTE('add-the-two-readings-at-the-same-input', { insight: true, cost: 3, value: key }),
      ROUTE('subtract-one-reading-from-the-other', { insight: false, cost: 2, natural: true, value: diff }),
      ROUTE('multiply-the-two-readings', { insight: false, cost: 2, value: prod }),
      ROUTE('read-only-the-first-function', { insight: false, cost: 1, value: one }),
    ],
    counterfactual: { kind: 'value', note: 'the second curve withheld', value: one },
    fingerprintParts: {
      ctx: 'functions no-stimulus', chain: ['read-both-functions-at-the-input', 'combine-them-as-defined'],
      target: 'value:composite', options: 'combination-confusions', distract: ['D3', 'D2', 'D6'],
      narrative: 'symbols-only:two-functions', numeric: ['input', 'f-value', 'g-value'],
    },
  };
}

/* ══════════════════════════ A11 — variation ══════════════════════════ */

/**
 * `direct-variation-transformed`: y varies directly with x, and the item asks
 * what happens to y when x is transformed. The relation is the mechanism; the
 * blind route applies the transformation to y directly.
 */
function directVariationTransformed(rand) {
  const p = rand.int(2, 6), q = rand.pick([2, 3]);
  if (p === q) return { error: 'the two factors coincide' };
  // y = k x^q. x is multiplied by p, so y is multiplied by p^q.
  const key = Q(Math.pow(p, q)), linear = Q(p), wrongPower = Q(Math.pow(q, p)), sum = Q(p + q);
  const others = [linear, wrongPower, sum];
  if ([linear, wrongPower, sum].some(v => qEq(v, key)) || qEq(linear, wrongPower)
      || qEq(linear, sum) || qEq(wrongPower, sum)) return { error: 'two options coincide' };
  if (!hasNear(key, others)) return { error: 'every distractor is more than a factor of three from the key' };
  const L = layout(rand, key, others);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-TRANSFORM', species: 'variation-under-transformation', form: 'direct_variation_transformed',
    stem: `The quantity $y$ varies directly with $x^{${q}}$. If $x$ is multiplied by ${p}, the value of $y$ is ` +
          `multiplied by what factor?`,
    ...L,
    distractorClasses: ['D2', 'D3', 'D6'],
    mechanism: { nonobvious_rel: 2, abstraction: 2, hidden_step: 1, trap_cost: 2 },
    routes: [
      ROUTE('raise-the-input-factor-to-the-power-of-the-variation', { insight: true, cost: 3, value: key }),
      ROUTE('apply-the-factor-to-y-directly', { insight: false, cost: 1, natural: true, value: linear }),
      ROUTE('swap-the-base-and-the-exponent', { insight: false, cost: 2, value: wrongPower }),
      ROUTE('add-the-two-numbers', { insight: false, cost: 1, value: sum }),
    ],
    counterfactual: { kind: 'value', note: 'the power in the variation withheld', value: linear },
    fingerprintParts: {
      ctx: 'variation no-stimulus', chain: ['write-the-variation', 'substitute-the-scaled-input', 'read-the-factor'],
      target: 'value:factor', options: 'power-confusions', distract: ['D2', 'D3', 'D6'],
      narrative: 'words-only:variation-under-scaling', numeric: ['scale', 'power'],
    },
  };
}

/* ══════════════════════════ A12 — proportional reasoning ══════════════════════════ */

/**
 * `conditional-branch-word`: a rate that changes above a threshold. The blind
 * route applies one rate to the whole quantity — the single most common wrong
 * route in the corpus's tariff items, and it lands on a printed option.
 */
function conditionalBranch(rand) {
  const base = rand.int(2, 6), extra = base + rand.int(1, 4);
  const threshold = rand.int(3, 8) * 10, over = rand.int(2, 9) * 10;
  const total = threshold + over;
  const key = Q(base * threshold + extra * over);
  const flat = Q(base * total), allHigh = Q(extra * total), noThreshold = Q(base * threshold + extra * total);
  const others = [flat, allHigh, noThreshold];
  if ([flat, allHigh, noThreshold].some(v => qEq(v, key)) || qEq(flat, allHigh)
      || qEq(flat, noThreshold) || qEq(allHigh, noThreshold)) return { error: 'two options coincide' };
  if (!hasNear(key, others)) return { error: 'every distractor is more than a factor of three from the key' };
  const L = layout(rand, key, others);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-BRANCH', species: 'threshold-rate-split', form: 'conditional_branch_word',
    stem: `A supplier charges $${base}$ per unit for the first ${threshold} units and $${extra}$ per unit for every ` +
          `unit after that. What is the total charge, in dollars, for ${total} units?`,
    ...L,
    distractorClasses: ['D2', 'D2', 'D3'],
    mechanism: { filtering: 2, hidden_step: 2, abstraction: 1, multiconcept: 1, trap_cost: 2 },
    routes: [
      ROUTE('split-at-the-threshold-then-price-each-part', { insight: true, cost: 4, value: key }),
      ROUTE('price-every-unit-at-the-first-rate', { insight: false, cost: 2, natural: true, value: flat }),
      ROUTE('price-every-unit-at-the-second-rate', { insight: false, cost: 2, value: allHigh }),
      ROUTE('charge-the-second-rate-on-the-whole-order-as-well', { insight: false, cost: 3, value: noThreshold }),
    ],
    counterfactual: { kind: 'value', note: 'the threshold withheld, one rate throughout', value: flat },
    fingerprintParts: {
      ctx: 'rate no-stimulus', chain: ['split-the-quantity-at-the-threshold', 'price-each-part', 'total'],
      target: 'value:total-cost', options: 'branch-confusions', distract: ['D2', 'D2', 'D3'],
      narrative: 'words-only:two-tier-tariff', numeric: ['rate-1', 'rate-2', 'threshold', 'quantity'],
    },
  };
}

/* ══════════════════════════ the registry ══════════════════════════ */

const BUILDERS = {
  literal_system: literalSystem,
  two_model_intersection: twoModelIntersection,
  parameter_interpret_intercept: parameterInterpretIntercept,
  symbolic_counting_formula: symbolicCounting,
  always_true_parallel_angles: alwaysTrueParallelAngles,
  circle_roman_numeral: circleRoman,
  coordinate_rectangle_rotated: rotatedRectangle,
  which_student_multi_claim: whichStudentClaim,
  extraneous_root: extraneousRoot,
  inequality_system_quadrant: inequalitySystemQuadrant,
  tangent_at_vertex: tangentAtVertex,
  parabola_inscribed_square: parabolaInscribedSquare,
  multi_curve_sum: multiCurveSum,
  direct_variation_transformed: directVariationTransformed,
  conditional_branch_word: conditionalBranch,
};

/** Primitive name -> the forms it offers, in the shape est-assemble expects. */
export const MECHANISM_EXPANSION = {
  'P-ISOLATE': (seed, opts = {}) => BUILDERS[opts.form || 'literal_system'](rng(seed)),
  'P-REGION': (seed, opts = {}) => BUILDERS[opts.form || 'inequality_system_quadrant'](rng(seed)),
  'P-TANGENCY': (seed, opts = {}) => BUILDERS[opts.form || 'tangent_at_vertex'](rng(seed)),
  'P-INSCRIBED': (seed, opts = {}) => BUILDERS[opts.form || 'parabola_inscribed_square'](rng(seed)),
  'P-SUPERPOSE': (seed, opts = {}) => BUILDERS[opts.form || 'multi_curve_sum'](rng(seed)),
  'P-TRANSFORM': (seed, opts = {}) => BUILDERS[opts.form || 'direct_variation_transformed'](rng(seed)),
  'P-BRANCH': (seed, opts = {}) => BUILDERS[opts.form || 'conditional_branch_word'](rng(seed)),
  'P-CROSSOVER': (seed, opts = {}) => BUILDERS[opts.form || 'two_model_intersection'](rng(seed)),
  'P-INTERPRET-CONST': (seed, opts = {}) => BUILDERS[opts.form || 'parameter_interpret_intercept'](rng(seed)),
  'P-COUNT-SYMBOLIC': (seed, opts = {}) => BUILDERS[opts.form || 'symbolic_counting_formula'](rng(seed)),
  'P-ALWAYS': (seed, opts = {}) => BUILDERS[opts.form || 'always_true_parallel_angles'](rng(seed)),
  'P-COMPLETE-SQUARE': (seed, opts = {}) => BUILDERS[opts.form || 'circle_roman_numeral'](rng(seed)),
  'P-ROTATED': (seed, opts = {}) => BUILDERS[opts.form || 'coordinate_rectangle_rotated'](rng(seed)),
  'P-CLAIMANT': (seed, opts = {}) => BUILDERS[opts.form || 'which_student_multi_claim'](rng(seed)),
  'P-EXTRANEOUS': (seed, opts = {}) => BUILDERS[opts.form || 'extraneous_root'](rng(seed)),
};

/** Which family each new structure serves. */
export const MECHANISM_EXPANSION_SERVES = {
  'P-ISOLATE/literal_system': 'A01',
  'P-REGION/inequality_system_quadrant': 'A04',
  'P-TANGENCY/tangent_at_vertex': 'A06',
  'P-INSCRIBED/parabola_inscribed_square': 'A06',
  'P-SUPERPOSE/multi_curve_sum': 'A09',
  'P-TRANSFORM/direct_variation_transformed': 'A11',
  'P-BRANCH/conditional_branch_word': 'A12',
  'P-CROSSOVER/two_model_intersection': 'A13',
  'P-INTERPRET-CONST/parameter_interpret_intercept': 'A13',
  'P-COUNT-SYMBOLIC/symbolic_counting_formula': 'A15',
  'P-ALWAYS/always_true_parallel_angles': 'A16',
  'P-COMPLETE-SQUARE/circle_roman_numeral': 'A17',
  'P-ROTATED/coordinate_rectangle_rotated': 'A17',
  'P-CLAIMANT/which_student_multi_claim': 'A09',
  'P-EXTRANEOUS/extraneous_root': 'A08',
};

/**
 * The species each new structure supplies, recorded so the brief's list is
 * checkable rather than asserted. Read against `mechanism` maps, not prose.
 */
export const MECHANISM_SPECIES = {
  'P-ISOLATE/literal_system': ['non-value target', 'expression target', 'hidden relationship'],
  'P-REGION/inequality_system_quadrant': ['non-value target', 'filtering', 'competing interpretation'],
  'P-TANGENCY/tangent_at_vertex': ['hidden relationship', 'multiple valid approaches'],
  'P-INSCRIBED/parabola_inscribed_square': ['hidden relationship', 'multiconcept'],
  'P-SUPERPOSE/multi_curve_sum': ['competing interpretation', 'multiconcept'],
  'P-TRANSFORM/direct_variation_transformed': ['hidden relationship'],
  'P-BRANCH/conditional_branch_word': ['filtering', 'hidden relationship'],
  'P-CROSSOVER/two_model_intersection': ['hidden relationship', 'competing interpretation'],
  'P-INTERPRET-CONST/parameter_interpret_intercept': ['non-value target', 'interpretation', 'competing interpretation'],
  'P-COUNT-SYMBOLIC/symbolic_counting_formula': ['non-value target', 'expression target', 'multiple valid approaches'],
  'P-ALWAYS/always_true_parallel_angles': ['non-value target', 'competing interpretation', 'filtering'],
  'P-COMPLETE-SQUARE/circle_roman_numeral': ['non-value target', 'hidden relationship', 'filtering'],
  'P-ROTATED/coordinate_rectangle_rotated': ['hidden relationship', 'multiple valid approaches'],
  'P-CLAIMANT/which_student_multi_claim': ['non-value target', 'competing interpretation', 'filtering'],
  'P-EXTRANEOUS/extraneous_root': ['filtering', 'hidden relationship', 'multiple valid approaches'],
};

/* ══════════════════════════ A13 — reading a display ══════════════════════════ */

/**
 * `two-model-intersection-read`: two linear models are given and the question
 * asks WHEN they agree, not what either equals. The blind route reads one
 * model's value and reports it.
 */
function twoModelIntersection(rand) {
  const m1 = rand.int(2, 9), m2 = rand.int(2, 9);
  if (m1 === m2) return { error: 'the two models never meet' };
  const t = rand.int(2, 9);
  const b2 = rand.int(1, 40), b1 = b2 + (m2 - m1) * t;     // they meet at t
  if (b1 <= 0 || b2 <= 0) return { error: 'a starting value would not be positive' };
  const key = Q(t), atStart = Q(b1 - b2), value = Q(m1 * t + b1), gap = Q(Math.abs(m1 - m2));
  const others = [atStart, value, gap];
  if ([atStart, value, gap].some(v => qEq(v, key)) || qEq(atStart, value) || qEq(atStart, gap) || qEq(value, gap))
    return { error: 'two options coincide' };
  if (!hasNear(key, others)) return { error: 'every distractor is more than a factor of three from the key' };
  const L = layout(rand, key, others);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-CROSSOVER', species: 'two-model-agreement', form: 'two_model_intersection',
    stem: `Two accounts are modelled by $A(t) = ${coef(m1, 't')} + ${b1}$ and $B(t) = ${coef(m2, 't')} + ${b2}$, ` +
          `where $t$ is the number of months. After how many months do the two accounts hold the same amount?`,
    ...L,
    distractorClasses: ['D2', 'D6', 'D3'],
    mechanism: { hidden_step: 2, abstraction: 2, repr_switch: 1, multiconcept: 1, trap_cost: 2 },
    routes: [
      ROUTE('set-the-two-models-equal-and-solve-for-t', { insight: true, cost: 4, value: key }),
      ROUTE('report-the-gap-between-the-starting-values', { insight: false, cost: 2, natural: true, value: atStart }),
      ROUTE('report-the-amount-rather-than-the-time', { insight: false, cost: 3, value }),
      ROUTE('report-the-difference-of-the-rates', { insight: false, cost: 1, value: gap }),
    ],
    counterfactual: { kind: 'value', note: 'the second model withheld, only the first gap survives', value: atStart },
    fingerprintParts: {
      ctx: 'linear-model no-stimulus', chain: ['equate-the-two-models', 'collect', 'solve-for-the-time'],
      target: 'value:time', options: 'which-quantity-confusions', distract: ['D2', 'D6', 'D3'],
      narrative: 'words-plus-symbols:two-models', numeric: ['rate-1', 'rate-2', 'start-1', 'start-2'],
    },
  };
}

/**
 * `parameter-interpret-intercept`: what the CONSTANT in a fitted model means.
 * Selection over prose claims, and the counterfactual is determinacy — the true
 * claim stays true if you delete the mechanism, so the test is that the item
 * becomes unanswerable without it.
 */
function parameterInterpretIntercept(rand) {
  const m = rand.int(2, 9), b = rand.int(10, 90), unit = rand.pick(['litres', 'pages', 'kilometres']);
  const texts = [
    `the ${unit} present before any time had passed`,
    `the ${unit} added each hour`,
    `the number of hours the process runs`,
    `the total ${unit} at the end of the process`,
  ];
  const L = choiceLayout(rand, 0, texts);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-INTERPRET-CONST', species: 'parameter-meaning', form: 'parameter_interpret_intercept',
    stem: `A process is modelled by $y = ${coef(m, 'x')} + ${b}$, where $y$ is the number of ${unit} and $x$ is the ` +
          `number of hours. Which of the following is the best interpretation of the number ${b} in this model?`,
    ...L,
    distractorClasses: ['D5', 'D5', 'D5'],
    mechanism: { competing_interp: 2, abstraction: 2, repr_switch: 1, inference: 1, trap_cost: 2 },
    routes: [
      ROUTE('evaluate-the-model-at-zero-and-read-the-meaning', { insight: true, cost: 3, value: Q(0) }),
      ROUTE('read-the-constant-as-the-rate', { insight: false, cost: 1, natural: true, value: Q(1) }),
      ROUTE('read-the-constant-as-the-input', { insight: false, cost: 1, value: Q(2) }),
      ROUTE('read-the-constant-as-the-final-output', { insight: false, cost: 2, value: Q(3) }),
    ],
    counterfactual: { kind: 'determinacy', note: 'which coefficient is which withheld: rate and intercept both survive', optionsSurviving: 2 },
    fingerprintParts: {
      ctx: 'linear-model no-stimulus', chain: ['identify-the-constant-term', 'evaluate-at-zero', 'name-what-it-measures'],
      target: 'interpretation:parameter', options: 'prose-claims', distract: ['D5', 'D5', 'D5'],
      narrative: 'words-plus-symbols:fitted-model', numeric: ['slope', 'intercept'],
    },
  };
}

/* ══════════════════════════ A15 — counting ══════════════════════════ */

/**
 * `symbolic-counting-formula`: the answer is an EXPRESSION in n, not a number.
 * The blind route counts one case and reports a number-shaped expression.
 */
function symbolicCounting(rand) {
  const k = rand.int(2, 5);
  const texts = [
    `$\\dfrac{n(n - 1)}{${2 * k}}$`,
    `$\\dfrac{n(n - 1)}{2}$`,
    `$\\dfrac{n}{${k}}$`,
    `$${k}n(n - 1)$`,
  ];
  const L = choiceLayout(rand, 0, texts);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-COUNT-SYMBOLIC', species: 'counting-as-an-expression', form: 'symbolic_counting_formula',
    stem: `In a group of $n$ people, every pair shakes hands exactly once, and the handshakes are then divided ` +
          `equally among ${k} rounds. Which expression gives the number of handshakes in one round?`,
    ...L,
    distractorClasses: ['D2', 'D6', 'D3'],
    mechanism: { abstraction: 2, multiconcept: 2, hidden_step: 1, nonobvious_rel: 1, trap_cost: 2 },
    routes: [
      ROUTE('count-the-pairs-then-divide-by-the-rounds', { insight: true, cost: 4, value: Q(0) }),
      ROUTE('count-the-pairs-and-stop', { insight: false, cost: 2, natural: true, value: Q(1) }),
      ROUTE('divide-the-people-rather-than-the-pairs', { insight: false, cost: 1, value: Q(2) }),
      ROUTE('multiply-by-the-rounds-instead-of-dividing', { insight: false, cost: 3, value: Q(3) }),
    ],
    counterfactual: { kind: 'determinacy', note: 'the division into rounds withheld leaves the pair count standing too', optionsSurviving: 2 },
    fingerprintParts: {
      ctx: 'counting no-stimulus', chain: ['count-the-unordered-pairs', 'divide-by-the-round-count'],
      target: 'expression:count', options: 'expression-set', distract: ['D2', 'D6', 'D3'],
      narrative: 'words-only:pairs-and-rounds', numeric: ['rounds'],
    },
  };
}

/* ══════════════════════════ A16 — angles ══════════════════════════ */

/**
 * `always-true-parallel-angles`: three claims about a transversal, of which two
 * must be true and one only sometimes is. Competing interpretation, Roman grid.
 */
function alwaysTrueParallelAngles(rand) {
  const a = rand.int(3, 8) * 10;
  if (a === 90) return { error: 'a right angle makes every claim true at once' };
  const texts = [
    `The angle vertically opposite $\\angle 1$ also measures $${a}^\\circ$`,
    `The angle adjacent to $\\angle 1$ on the same line also measures $${a}^\\circ$`,
    `The co-interior angle on the same side of the transversal measures $${a}^\\circ$`,
    `Every angle formed at the two intersections measures $${a}^\\circ$`,
  ];
  const L = choiceLayout(rand, 0, texts);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-ALWAYS', species: 'must-be-true-claim', form: 'always_true_parallel_angles',
    stem: `Two parallel lines are cut by a transversal, and $\\angle 1$ measures $${a}^\\circ$. ` +
          `Which of the following must be true?`,
    ...L,
    distractorClasses: ['D5', 'D5', 'D5'],
    mechanism: { competing_interp: 2, filtering: 2, abstraction: 1, inference: 1, nonobvious_rel: 1, trap_cost: 2 },
    routes: [
      ROUTE('classify-each-angle-pair-as-equal-or-supplementary', { insight: true, cost: 4, value: Q(0) }),
      ROUTE('treat-adjacent-angles-as-equal', { insight: false, cost: 1, natural: true, value: Q(1) }),
      ROUTE('treat-co-interior-angles-as-equal', { insight: false, cost: 2, value: Q(2) }),
      ROUTE('assume-every-angle-is-the-same', { insight: false, cost: 1, value: Q(3) }),
    ],
    counterfactual: { kind: 'determinacy', note: 'without the equal/supplementary distinction three claims stand', optionsSurviving: 3 },
    fingerprintParts: {
      ctx: 'geometry no-stimulus', chain: ['classify-each-angle-pair', 'apply-the-parallel-postulate', 'select-the-claim-that-must-hold'],
      target: 'selection:claim', options: 'prose-claims', distract: ['D5', 'D5', 'D5'],
      narrative: 'words-only:transversal', numeric: ['given-angle'],
    },
  };
}

/* ══════════════════════════ A17 — circles and coordinates ══════════════════════════ */

/**
 * `circle-roman-numeral`: three claims about a circle given in general form.
 * The mechanism is completing the square; without it none of the claims can be
 * decided, which is exactly the determinacy counterfactual.
 */
function circleRoman(rand) {
  const h = rand.nonZero(-6, 6), k = rand.nonZero(-6, 6), r = rand.int(2, 7);
  const c = h * h + k * k - r * r;
  if (c === 0) return { error: 'the circle passes through the origin, so two claims are true at once' };
  const texts = [
    `The radius of the circle is ${r}`,
    `The radius of the circle is $${r * r}$`,
    `The centre of the circle is $(${-2 * h}, ${-2 * k})$`,
    `The circle passes through the origin`,
  ];
  const L = choiceLayout(rand, 0, texts);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-COMPLETE-SQUARE', species: 'must-be-true-claim', form: 'circle_roman_numeral',
    stem: `In the $xy$-plane, a circle has equation $x^{2} ${term(-2 * h, 'x')} + y^{2} ${term(-2 * k, 'y')} ${term(c, '')} = 0$. ` +
          `Which of the following must be true?`,
    ...L,
    distractorClasses: ['D2', 'D3', 'D5'],
    mechanism: { hidden_step: 2, abstraction: 2, repr_switch: 1, multiconcept: 1, filtering: 1, trap_cost: 2 },
    routes: [
      ROUTE('complete-the-square-in-both-variables-then-test-each-claim', { insight: true, cost: 5, value: Q(0) }),
      ROUTE('read-the-squared-radius-as-the-radius', { insight: false, cost: 3, natural: true, value: Q(1) }),
      ROUTE('read-the-centre-off-the-linear-coefficients-unhalved', { insight: false, cost: 2, value: Q(2) }),
      ROUTE('assume-the-constant-term-puts-the-circle-through-the-origin', { insight: false, cost: 2, value: Q(3) }),
    ],
    counterfactual: { kind: 'determinacy', note: 'without completing the square none of the four claims can be decided', optionsSurviving: 3 },
    fingerprintParts: {
      ctx: 'coordinate-geometry no-stimulus', chain: ['complete-the-square-in-x', 'complete-the-square-in-y', 'test-each-claim'],
      target: 'selection:claim', options: 'prose-claims', distract: ['D2', 'D3', 'D5'],
      narrative: 'symbols-only:general-form-circle', numeric: ['centre-x', 'centre-y', 'radius'],
    },
  };
}

/**
 * `coordinate-rectangle-rotated`: a rectangle whose sides are not axis-parallel.
 * The blind route takes the coordinate differences as the side lengths.
 */
function rotatedRectangle(rand) {
  const [p, q] = rand.pick([[3, 4], [6, 8], [5, 12], [8, 15], [9, 12]]);
  const t = rand.pick([1, 2]);
  // One side runs (p, q) and the other (-q, p) scaled by t: a genuine rectangle.
  const side1 = Math.round(Math.sqrt(p * p + q * q));
  const side2 = t * side1;
  const key = Q(2 * (side1 + side2));
  const naive = Q(2 * (p + q + t * (p + q)));          // coordinate differences as sides
  const area = Q(side1 * side2);
  const oneSide = Q(side1);
  const others = [naive, area, oneSide];
  if ([naive, area, oneSide].some(v => qEq(v, key)) || qEq(naive, area) || qEq(naive, oneSide) || qEq(area, oneSide))
    return { error: 'two options coincide' };
  if (!hasNear(key, others)) return { error: 'every distractor is more than a factor of three from the key' };
  const L = layout(rand, key, others);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-ROTATED', species: 'non-axis-parallel-figure', form: 'coordinate_rectangle_rotated',
    stem: `In the $xy$-plane, a rectangle has vertices $(0, 0)$, $(${p}, ${q})$, ` +
          `$(${p - t * q}, ${q + t * p})$ and $(${-t * q}, ${t * p})$. What is the perimeter of the rectangle?`,
    ...L,
    distractorClasses: ['D2', 'D6', 'D3'],
    mechanism: { hidden_step: 2, abstraction: 2, multiconcept: 1, nonobvious_rel: 1, trap_cost: 2 },
    routes: [
      ROUTE('use-the-distance-formula-on-each-side', { insight: true, cost: 5, value: key }),
      ROUTE('take-the-coordinate-differences-as-the-side-lengths', { insight: false, cost: 3, natural: true, value: naive }),
      ROUTE('report-the-area-instead', { insight: false, cost: 4, value: area }),
      ROUTE('report-one-side', { insight: false, cost: 3, value: oneSide }),
    ],
    counterfactual: { kind: 'value', note: 'the rotation ignored, sides read off the axes', value: naive },
    fingerprintParts: {
      ctx: 'coordinate-geometry no-stimulus', chain: ['recognise-the-sides-are-not-axis-parallel', 'apply-the-distance-formula', 'total-the-perimeter'],
      target: 'value:perimeter', options: 'axis-parallel-confusions', distract: ['D2', 'D6', 'D3'],
      narrative: 'symbols-only:four-vertices', numeric: ['run', 'rise', 'aspect'],
    },
  };
}

/* ══════════════════════════ A09 — competing readings of one claim set ══════════════════════════ */

/**
 * `which-student-multi-claim`: two students describe the same function and one
 * of them is right. Competing interpretation, and the mechanism is the domain
 * restriction neither student states.
 */
function whichStudentClaim(rand) {
  const a = rand.int(2, 5), h = rand.int(1, 6);
  const texts = [
    `Only Nadia, because $f$ is defined only for $x \\ge ${h}$`,
    `Only Omar, because $f(x)$ is never negative`,
    `Both Nadia and Omar`,
    `Neither Nadia nor Omar`,
  ];
  const L = choiceLayout(rand, 0, texts);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-CLAIMANT', species: 'competing-claims', form: 'which_student_multi_claim',
    stem: `The function $f$ is defined by $f(x) = ${coef(a, `\\sqrt{x - ${h}}`)}$. ` +
          `Nadia says the domain of $f$ is $x \\ge ${h}$. Omar says the range of $f$ is all real numbers. ` +
          `Who is correct?`,
    ...L,
    distractorClasses: ['D5', 'D5', 'D5'],
    mechanism: { competing_interp: 2, filtering: 2, abstraction: 1, inference: 1, trap_cost: 2 },
    routes: [
      ROUTE('test-each-claim-against-the-radicand-and-the-output-sign', { insight: true, cost: 4, value: Q(0) }),
      ROUTE('accept-both-claims-as-stated', { insight: false, cost: 1, natural: true, value: Q(2) }),
      ROUTE('accept-only-the-range-claim', { insight: false, cost: 2, value: Q(1) }),
      ROUTE('reject-both-claims', { insight: false, cost: 2, value: Q(3) }),
    ],
    counterfactual: { kind: 'determinacy', note: 'the radical withheld leaves both claims tenable', optionsSurviving: 2 },
    fingerprintParts: {
      ctx: 'functions no-stimulus', chain: ['find-the-domain-from-the-radicand', 'find-the-range-from-the-output-sign', 'judge-each-claim'],
      target: 'selection:claim', options: 'prose-claims', distract: ['D5', 'D5', 'D5'],
      narrative: 'words-plus-symbols:two-claimants', numeric: ['coefficient', 'shift'],
    },
  };
}

/* ══════════════════════════ A08 — the extraneous root ══════════════════════════ */

/**
 * `rational-equation-composite`, as a MECHANISM rather than a routine grind.
 *
 * A08 held exactly one mechanism structure — the Roman-numeral one — and the
 * blueprint allows one Roman item per form. Whenever that budget was spent by
 * A18, A08's mechanism-band slot had nothing left, which is one seed in
 * eighteen even after the planning fixes. This is the second structure.
 *
 * It does NOT add an object to the A08 cell: `rational-equation-composite` is
 * already built as a routine construct, and two constructs naming one object
 * leave the cell's object count where it was. What it adds is a placeable
 * mechanism STRUCTURE, which is what the fill loop actually ran out of. The
 * distinction is the whole subject of this stage and it is worth being exact
 * about which of the two this fixes.
 *
 * The mechanism is the domain restriction: cancelling the common factor is
 * correct algebra that produces a root the original equation excludes.
 */
function extraneousRoot(rand) {
  const a = rand.nonZero(-8, 8);
  const texts = ['None', 'One', 'Two', 'More than two'];
  const L = choiceLayout(rand, 0, texts);
  if (L.error) return { error: L.error };
  return {
    primitive: 'P-EXTRANEOUS', species: 'domain-restriction-gate', form: 'extraneous_root',
    stem: `How many solutions does the equation $\\dfrac{x^{2} - ${a * a}}{x ${signedConst(-a)}} = ${2 * a}$ have?`,
    ...L,
    distractorClasses: ['D2', 'D3', 'D6'],
    mechanism: { hidden_step: 2, filtering: 2, abstraction: 1, multiconcept: 1, trap_cost: 2 },
    routes: [
      ROUTE('cancel-then-check-the-cancelled-factor-against-the-domain', { insight: true, cost: 4, value: Q(0) }),
      ROUTE('cancel-and-keep-the-root', { insight: false, cost: 2, natural: true, value: Q(1) }),
      ROUTE('set-the-numerator-to-zero-and-keep-both-roots', { insight: false, cost: 2, value: Q(2) }),
      ROUTE('read-the-cancelled-form-as-an-identity', { insight: false, cost: 3, value: Q(3) }),
    ],
    counterfactual: { kind: 'determinacy', note: 'without the domain restriction the cancelled equation has a solution', optionsSurviving: 2 },
    fingerprintParts: {
      ctx: 'rational-equation no-stimulus', chain: ['factor-the-numerator', 'cancel-the-common-factor', 'test-the-root-against-the-domain'],
      target: 'value:count', options: 'solution-count-set', distract: ['D2', 'D3', 'D6'],
      narrative: 'symbols-only:rational-equation', numeric: ['root'],
    },
  };
}
