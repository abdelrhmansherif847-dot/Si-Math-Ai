// Vocabulary expansion — the series-capacity pass.
//
// WHY VOLUME, AND WHY THIS SHAPE
//
// The series measurement is unambiguous: 25 forms drawn from 90 objects share
// 81% of their objects pairwise, against a corpus that shares about 2%. Fixing
// the assembler's allocation helped reachability — 37 unreachable constructs
// fell to 28 and both equation-targeted constructs started emitting — and moved
// the overlap by three points. Vocabulary is the binding constraint and nothing
// else is close.
//
// WHAT COUNTS AS A NEW OBJECT HERE
//
// Every entry below changes the DECISION the student makes, not the numbers
// they make it with. `sum-of-roots` and `product-of-roots` are two objects
// because the relation invoked is different; `sum-of-roots` with a different
// quadratic is one object twice. That rule is the whole discipline of this file
// and it is why the table is organised by ASK rather than by family: the ask IS
// the object.
//
// Every object name below is a reference archetype from artifact 2 §3, so each
// addition is measurable coverage of the corpus vocabulary rather than an
// invention. The 128 the library still could not build after the coverage
// revision are the list this is drawn from.
//
// CONTRACT
//
// These are routine-stream items and are checked by assessRoutine(): exactly one
// route reaches the key, every printed option is reached by an enumerated error
// route, a distractor sits within a factor of three of the key, at most one
// mechanism bites and never a reasoning-core one. Nothing here weakens any
// existing gate; the module only adds constructs.

import {
  Q, qAdd, qSub, qMul, qDiv, qNeg, qEq, qNum, qIsInt, qStr,
  rng, ROUTE, layout, coef, term, signedConst,
} from './est-primitives.mjs';

/** Routine-stream item builder. The first `wrongs` entry is the natural slip. */
const OK = (rand, key, wrongs, meta, fmt = qStr) => {
  const vals = [key, ...wrongs.map(w => w.value)];
  for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++)
    if (qEq(vals[i], vals[j])) return { error: `duplicate option ${qStr(vals[i])}` };
  const L = layout(rand, key, wrongs.map(w => w.value), fmt);
  if (L.error) return { error: L.error };
  return {
    stream: 'routine', ...L,
    routes: [ROUTE(meta.method || 'direct', { insight: false, cost: meta.cost ?? 2, value: key, natural: true }),
      ...wrongs.map((w, i) => ROUTE(w.name, { insight: false, cost: w.cost ?? 2, value: w.value, natural: i === 0 }))],
    ...meta,
  };
};

const FP = (ctx, chain, target, options, distract, narrative, numeric) =>
  ({ ctx, chain, target, options, distract, narrative, numeric });

/* ════════════ A06 — quadratics & parabolas (reference has 15 objects) ════════════ */

export const A06_ASKS = {
  'product-of-roots': (rand) => {
    const p = rand.nonZero(-9, 9), q = rand.nonZero(-9, 9);
    if (p === q || p * q === p + q) return { error: 'the sum and product coincide' };
    const b = -(p + q), c = p * q;
    return OK(rand, Q(c), [
      { name: 'reported-the-sum-of-the-roots', value: Q(p + q), cost: 2 },
      { name: 'negated-the-product', value: Q(-c), cost: 1 },
      { name: 'read-the-linear-coefficient', value: Q(b), cost: 1 },
    ], { family: 'A06', construct: 'product-of-roots', object: 'product-of-roots',
      stem: `The equation $x^2 ${term(b, 'x')} ${term(c, '')} = 0$ has two solutions. What is their product?`,
      mechanism: { abstraction: 1, nonobvious_rel: 1 },
      fingerprintParts: FP('quadratic no-stimulus', ['relate-coefficients-to-roots', 'read-the-product'],
        'value:product-of-roots', 'coefficient-confusions', ['D2', 'D3', 'D1'], 'symbols-only:quadratic', ['coeff-b', 'const-c']) });
  },

  'axis-of-symmetry-parameter': (rand) => {
    const a = rand.pick([1, 2, 3]), h = rand.nonZero(-6, 6);
    const b = -2 * a * h, k = rand.nonZero(-9, 9);
    return OK(rand, Q(h), [
      { name: 'forgot-the-leading-coefficient', value: Q(-b), cost: 1 },
      { name: 'negated-the-axis', value: Q(-h), cost: 2 },
      { name: 'reported-the-constant-term', value: Q(k), cost: 1 },
    ], { family: 'A06', construct: 'axis-of-symmetry', object: 'axis-of-symmetry-parameter',
      stem: `The graph of $y = ${coef(a, 'x^2')} ${term(b, 'x')} ${term(k, '')}$ is a parabola. ` +
            `What is the $x$-coordinate of its axis of symmetry?`,
      mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('quadratic no-stimulus', ['apply-the-axis-formula'], 'value:axis',
        'formula-slips', ['D3', 'D3', 'D1'], 'symbols-only:parabola', ['coeff-a', 'coeff-b', 'const']) });
  },

  'roots-ordered-select': (rand) => {
    const p = rand.int(-9, -2), q = rand.int(2, 9);
    if (Math.abs(p) === q) return { error: 'symmetric roots remove the ordering' };
    const b = -(p + q), c = p * q;
    return OK(rand, Q(q - p), [
      { name: 'added-the-roots', value: Q(p + q), cost: 2 },
      { name: 'subtracted-the-other-way', value: Q(p - q), cost: 2 },
      { name: 'reported-the-product', value: Q(c), cost: 2 },
    ], { family: 'A06', construct: 'root-difference', object: 'roots-ordered-select',
      stem: `The equation $x^2 ${term(b, 'x')} ${term(c, '')} = 0$ has solutions $r$ and $s$, where $r > s$. ` +
            `What is the value of $r - s$?`,
      mechanism: { abstraction: 1, filtering: 1 },
      fingerprintParts: FP('quadratic no-stimulus', ['factor', 'order-the-roots', 'subtract'], 'value:root-difference',
        'ordering-slips', ['D2', 'D3', 'D2'], 'symbols-only:quadratic-ordered', ['coeff-b', 'const-c']) });
  },

  'quadratic-range': (rand) => {
    const a = rand.pick([1, 2]), h = rand.nonZero(-5, 5), k = rand.nonZero(-9, 9);
    return OK(rand, Q(k), [
      { name: 'reported-the-vertex-abscissa', value: Q(h), cost: 1 },
      { name: 'negated-the-minimum', value: Q(-k), cost: 2 },
      { name: 'reported-the-value-at-zero', value: Q(a * h * h + k), cost: 2 },
    ], { family: 'A06', construct: 'range-lower-bound', object: 'quadratic-range',
      stem: `The function $f$ is defined by $f(x) = ${coef(a, `(x ${signedConst(-h)})^2`)} ${term(k, '')}$. ` +
            `What is the least value in the range of $f$?`,
      mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('quadratic no-stimulus', ['read-the-vertex-form', 'name-the-range-bound'], 'value:range-bound',
        'vertex-confusions', ['D2', 'D3', 'D2'], 'symbols-only:vertex-form', ['scale', 'shift-h', 'shift-k']) });
  },

  'line-parabola-intersection': (rand) => {
    const r = rand.nonZero(-5, 5), s2 = rand.nonZero(-5, 5);
    if (r === s2) return { error: 'a tangent line removes the second point' };
    // y = x^2 meets y = (r+s)x - rs at x = r and x = s
    const m = r + s2, c = -r * s2;
    return OK(rand, Q(r + s2), [
      { name: 'reported-the-product-of-the-abscissae', value: Q(r * s2), cost: 2 },
      { name: 'reported-one-abscissa', value: Q(r), cost: 2 },
      { name: 'read-the-constant-term', value: Q(c), cost: 1 },
    ], { family: 'A06', construct: 'intersection-abscissa-sum', object: 'line-parabola-intersection',
      stem: `In the $xy$-plane, the graph of $y = x^2$ intersects the line $y = ${coef(m, 'x')} ${term(c, '')}$ ` +
            `at two points. What is the sum of the $x$-coordinates of those points?`,
      mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('quadratic no-stimulus', ['set-the-two-equal', 'read-the-coefficient-sum'], 'value:abscissa-sum',
        'intersection-slips', ['D2', 'D2', 'D1'], 'curve-and-line', ['slope', 'intercept']) });
  },

  'parameters-from-roots': (rand) => {
    const p = rand.nonZero(-7, 7), q = rand.nonZero(-7, 7);
    if (p === q) return { error: 'a repeated root removes the decision' };
    const b = -(p + q), c = p * q;
    return OK(rand, Q(b + c), [
      { name: 'used-the-sum-with-the-wrong-sign', value: Q(-b + c), cost: 2 },
      { name: 'negated-the-product', value: Q(b - c), cost: 2 },
      { name: 'reported-the-sum-of-the-roots', value: Q(p + q), cost: 1 },
    ], { family: 'A06', construct: 'parameters-from-roots', object: 'parameters-from-roots',
      stem: `The equation $x^2 + bx + c = 0$ has solutions $${p}$ and $${q}$, where $b$ and $c$ are constants. ` +
            `What is the value of $b + c$?`,
      mechanism: { abstraction: 1, reversal: 1 },
      fingerprintParts: FP('quadratic no-stimulus', ['build-the-coefficients-from-the-roots', 'combine-them'],
        'value:parameter-sum', 'sign-confusions', ['D3', 'D3', 'D2'], 'symbols-only:roots-given', ['root-p', 'root-q']) });
  },
};

/* ════════════ A10 — exponents, radicals & complex (11 objects) ════════════ */

export const A10_ASKS = {
  'exponent-law-substitution': (rand) => {
    const a = rand.int(2, 6), k = rand.int(2, 5);
    return OK(rand, Q(a * k), [
      { name: 'added-instead-of-multiplying', value: Q(a + k), cost: 1 },
      { name: 'used-the-base-as-the-exponent', value: Q(k), cost: 1 },
      { name: 'squared-the-exponent', value: Q(a * a), cost: 2 },
    ], { family: 'A10', construct: 'power-of-a-power', object: 'exponent-law-substitution',
      stem: `If $x^{${a}} = t$ for $x > 0$, then $t^{${k}} = x^{n}$. What is the value of $n$?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: FP('exponents no-stimulus', ['substitute-the-power', 'apply-the-power-law'], 'value:exponent',
        'exponent-law-slips', ['D3', 'D1', 'D3'], 'symbols-only:substituted-power', ['exp-a', 'exp-k']) });
  },

  'radical-index-simplify': (rand) => {
    // Pick the ANSWER and derive the printed exponent from it. Picking the
    // exponent first and testing divisibility threw away 23 of 60 seeds for a
    // reason that has nothing to do with the ask.
    const idx = rand.pick([2, 3]), m = rand.int(2, 5), n = idx * m;
    if (m * (idx - 1) === idx) return { error: 'the answer coincides with the subtract-the-index slip' };
    return OK(rand, Q(m), [
      { name: 'multiplied-by-the-index', value: Q(n * idx), cost: 1 },
      { name: 'subtracted-the-index', value: Q(n - idx), cost: 1 },
      { name: 'reported-the-exponent-unchanged', value: Q(n), cost: 1 },
    ], { family: 'A10', construct: 'radical-index', object: 'radical-index-simplify',
      stem: `For $x > 0$, $\\sqrt[${idx}]{x^{${n}}} = x^{m}$. What is the value of $m$?`,
      cost: 2, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('radicals no-stimulus', ['convert-the-radical-to-a-power', 'divide-by-the-index'],
        'value:exponent', 'index-slips', ['D3', 'D3', 'D1'], 'symbols-only:one-radical', ['index', 'exponent']) });
  },

  'radicals-sign-constrained': (rand) => {
    const k = rand.int(2, 9);
    return OK(rand, Q(k), [
      { name: 'took-the-negative-root', value: Q(-k), cost: 1 },
      { name: 'squared-instead-of-rooting', value: Q(k * k * k * k), cost: 2 },
      { name: 'halved-the-square', value: Q(k * k, 2), cost: 2 },
    ], { family: 'A10', construct: 'sign-constrained-root', object: 'radicals-sign-constrained',
      stem: `If $x^2 = ${k * k}$ and $x > 0$, what is the value of $x$?`,
      cost: 2, mechanism: { abstraction: 1, filtering: 1 },
      fingerprintParts: FP('radicals no-stimulus', ['take-the-root', 'apply-the-sign-constraint'], 'value:root',
        'sign-slips', ['D3', 'D3', 'D2'], 'symbols-only:constrained-square', ['square']) });
  },

  'substitute-into-radical': (rand) => {
    // The first version's "rooted the coefficient too" distractor was
    // sqrt(a^2 x), which IS a sqrt(x) — the key. It collided on every seed and
    // the ask yielded 0/60. The honest slip is pulling the coefficient INSIDE
    // the radical without squaring it: sqrt(a x) = sqrt(a) sqrt(x), which is a
    // different number and only prints as one when a is a perfect square.
    const a = rand.pick([4, 9, 16]), ra = Math.round(Math.sqrt(a));
    const p = rand.int(2, 5), x = p * p;
    const lim = Math.min(9, Math.floor((a * p) / 2));    // keeps a distractor near the key
    const b = rand.nonZero(-lim, lim);
    const key = a * p + b;
    if (ra * p + b === a * p || a * p === a * x + b) return { error: 'two options coincide' };
    return OK(rand, Q(key), [
      { name: 'dropped-the-added-constant', value: Q(a * p), cost: 1 },
      { name: 'pulled-the-coefficient-inside-the-radical', value: Q(ra * p + b), cost: 2 },
      { name: 'substituted-without-rooting', value: Q(a * x + b), cost: 1 },
    ], { family: 'A10', construct: 'evaluate-radical-expression', object: 'substitute-into-radical',
      stem: `What is the value of $${coef(a, `\\sqrt{x}`)} ${term(b, '')}$ when $x = ${x}$?`,
      mechanism: { abstraction: 1 },
      fingerprintParts: FP('radicals no-stimulus', ['evaluate-the-radical', 'apply-the-coefficient'], 'value:evaluation',
        'radical-slips', ['D1', 'D3', 'D3'], 'symbols-only:coefficient-radical', ['coeff', 'radicand', 'offset']) });
  },

  'exponent-radical-equation': (rand) => {
    const k = rand.pick([2, 3, 4, 5]), c = rand.int(1, 9);
    const key = k * k - c;
    if (key <= 0) return { error: 'the radicand would be negative' };
    return OK(rand, Q(key), [
      { name: 'added-the-constant-instead', value: Q(k * k + c), cost: 2 },
      { name: 'forgot-to-square', value: Q(k - c), cost: 1 },
      { name: 'doubled-instead-of-squaring', value: Q(2 * k - c), cost: 2 },
    ], { family: 'A10', construct: 'solve-a-radical-equation', object: 'exponent-radical-equation',
      stem: `If $\\sqrt{x + ${c}} = ${k}$, what is the value of $x$?`,
      cost: 2, mechanism: { abstraction: 1, reversal: 1 },
      fingerprintParts: FP('radicals no-stimulus', ['square-both-sides', 'isolate-the-variable'], 'value:x',
        'radical-equation-slips', ['D3', 'D1', 'D3'], 'symbols-only:one-radical-equation', ['offset', 'value']) });
  },
};

/* ════════════ A08 — rational expressions & functions (9 objects) ════════════ */

export const A08_ASKS = {
  'asymptote-count': (rand) => {
    const r = rand.nonZero(-7, 7), s2 = rand.nonZero(-7, 7);
    if (r === s2) return { error: 'a repeated factor changes the count' };
    return OK(rand, Q(2), [
      { name: 'counted-only-the-horizontal', value: Q(1), cost: 1 },
      { name: 'counted-the-numerator-root-too', value: Q(3), cost: 2 },
      { name: 'counted-none', value: Q(0), cost: 1 },
    ], { family: 'A08', construct: 'count-vertical-asymptotes', object: 'asymptote-count',
      stem: `The function $f$ is defined by $f(x) = \\dfrac{x + 1}{(x ${signedConst(-r)})(x ${signedConst(-s2)})}$. ` +
            `How many vertical asymptotes does the graph of $f$ have?`,
      mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('rational-function no-stimulus', ['find-the-denominator-roots', 'count-them'], 'value:count',
        'asymptote-confusions', ['D1', 'D6', 'D1'], 'symbols-only:factored-denominator', ['root-r', 'root-s']) });
  },

  'inverse-vs-reciprocal': (rand) => {
    // Sampling the OUTPUT and hoping (y - b)/a lands on an integer threw away
    // 43 of 60 seeds. Sample the input and print the output it produces.
    const a = rand.int(2, 6), b = rand.nonZero(-9, 9);
    const x0 = rand.pick([-5, -4, -3, -2, 2, 3, 4, 5]);
    const y = a * x0 + b;
    if (y === 0) return { error: 'a zero output has no reciprocal to confuse it with' };
    if (Math.abs(b) >= 2 * a * Math.abs(x0)) return { error: 'the forgot-the-constant slip is not near the key' };
    if (x0 === a * y + b) return { error: 'the forward evaluation returns the input' };
    const key = Q(x0);
    return OK(rand, Q(qNum(key)), [
      { name: 'took-the-reciprocal-of-the-output', value: Q(1, y), cost: 1 },
      { name: 'evaluated-forwards-instead', value: Q(a * y + b), cost: 2 },
      { name: 'forgot-to-subtract-the-constant', value: Q(y, a), cost: 2 },
    ], { family: 'A08', construct: 'inverse-not-reciprocal', object: 'inverse-vs-reciprocal',
      stem: `The function $f$ is defined by $f(x) = ${coef(a, 'x')} ${term(b, '')}$. What is the value of $f^{-1}(${y})$?`,
      mechanism: { abstraction: 1, reversal: 1 },
      fingerprintParts: FP('functions no-stimulus', ['invert-the-rule', 'evaluate-the-inverse'], 'value:inverse',
        'inverse-reciprocal-confusions', ['D2', 'D2', 'D3'], 'symbols-only:one-linear', ['coeff', 'const', 'output']) });
  },

  'complex-fraction-simplify': (rand) => {
    // Two defects in the first version. `Q(qNum(key) * 1000) && key` THREW
    // whenever the key was not an integer — the acceptance count that reported
    // 2/60 was catching an exception, not a rejection. And every distractor was
    // at least four times the key, so the near-distractor rule failed by
    // construction. Adjacent c and d put the forgot-to-invert slip a factor of
    // (d/c)^2 <= 2.25 away, which is a real near miss.
    const c = rand.int(2, 6), d = c + rand.pick([-1, 1]);
    if (d < 2) return { error: 'the second denominator would be a unit' };
    const a = rand.int(2, 7), b = rand.int(2, 7);
    if (a === b) return { error: 'a shared value collapses the fraction' };
    if (a * d === b * c || a * c === b * d) return { error: 'two options coincide' };
    return OK(rand, Q(a * d, b * c), [
      { name: 'multiplied-straight-across', value: Q(a * c, b * d), cost: 2 },
      { name: 'inverted-the-numerator-instead', value: Q(b * d, a * c), cost: 2 },
      { name: 'inverted-both-fractions', value: Q(b * c, a * d), cost: 2 },
    ], { family: 'A08', construct: 'divide-two-fractions', object: 'complex-fraction-simplify',
      stem: `What is the value of $\\dfrac{\\;\\dfrac{${a}}{${b}}\\;}{\\;\\dfrac{${c}}{${d}}\\;}$?`,
      cost: 3, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('rational-expression no-stimulus', ['read-the-bar-as-division', 'invert-the-divisor', 'multiply'],
        'value:quotient', 'complex-fraction-slips', ['D2', 'D3', 'D3'], 'symbols-only:nested-fraction',
        ['num-a', 'den-b', 'num-c', 'den-d']) });
  },

  'range-of-rational': (rand) => {
    const k = rand.nonZero(-8, 8), h = rand.nonZero(-8, 8);
    return OK(rand, Q(k), [
      { name: 'reported-the-excluded-input', value: Q(h), cost: 1 },
      { name: 'negated-the-excluded-output', value: Q(-k), cost: 2 },
      { name: 'reported-zero', value: Q(0), cost: 1 },
    ], { family: 'A08', construct: 'excluded-output', object: 'range-of-rational',
      stem: `The function $f$ is defined by $f(x) = ${coef(k, '')} + \\dfrac{1}{x ${signedConst(-h)}}$ for $x \\neq ${h}$. ` +
            `Which value does $f(x)$ never take?`,
      mechanism: { abstraction: 1, nonobvious_rel: 1 },
      fingerprintParts: FP('rational-function no-stimulus', ['identify-the-shifted-asymptote', 'name-the-excluded-output'],
        'value:excluded-output', 'domain-range-confusions', ['D2', 'D3', 'D5'], 'symbols-only:shifted-reciprocal', ['shift-k', 'shift-h']) });
  },

  'rational-equation-composite': (rand) => {
    const a = rand.int(2, 6), b = rand.int(2, 9), c = rand.int(2, 6);
    const key = Q(b * c - a * c, 1);
    if (qNum(key) === 0) return { error: 'the solution is zero' };
    return OK(rand, Q(qNum(key)), [
      { name: 'forgot-to-clear-the-denominator', value: Q(b - a), cost: 1 },
      { name: 'multiplied-only-one-side', value: Q(b * c - a), cost: 2 },
      { name: 'sign-slip-on-the-transfer', value: Q(a * c - b * c), cost: 2 },
    ], { family: 'A08', construct: 'clear-a-denominator', object: 'rational-equation-composite',
      stem: `If $\\dfrac{x}{${c}} + ${a} = ${b}$, what is the value of $x$?`,
      cost: 3, mechanism: { abstraction: 1 },
      fingerprintParts: FP('rational-equation no-stimulus', ['clear-the-denominator', 'isolate-the-variable'], 'value:x',
        'denominator-slips', ['D1', 'D3', 'D3'], 'symbols-only:one-fraction-equation', ['denominator', 'offset', 'rhs']) });
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   BATCH 2 — the wide pass.
   ══════════════════════════════════════════════════════════════════════════

   Batch 1 was three families deep. That is the wrong shape for a series
   problem: the measured deficit is spread across sixteen families, and a
   library that is deep in A06 and empty in A11 forces reuse in A11 on every
   single form no matter how many quadratics it can build.

   Every ask below is a named reference archetype the library could not build,
   taken from the per-family miss list rather than from imagination. They are
   deliberately ORDINARY — an authentic form is mostly ordinary, and the
   mechanism stream already supplies the hard end.

   One boundary is worth stating because it cost measurable coverage: asks
   whose OPTIONS are expressions, graphs or Roman-numeral sets cannot be built
   here at all. `layout()` lays out exact rational VALUES, so `literal-system`,
   `inequality-from-graph`, `graph-roman-numeral`, `which-student-multi-claim`,
   `absvalue-graph-identify` and `vertical-line-roman` are not deferred by
   choice — the option layer cannot express them. They are counted as
   unbuildable in the coverage table, not as missing effort.                */

const gcd = (x, y) => (y ? gcd(y, Math.abs(x % y)) : Math.abs(x));

/* ─────────────── A01 — linear equations & solving ─────────────── */

export const A01_ASKS = {
  'chained-substitution': (rand) => {
    const m = rand.int(2, 6), k = rand.nonZero(-8, 8), c = rand.nonZero(-8, 8);
    const key = m * (c + k);
    if (key === 0 || m * c + k === key || c + k === key || m * c === key) return { error: 'two options coincide' };
    if (Math.abs(m * c) <= Math.abs(key) / 3 || Math.abs(m * c) >= Math.abs(key) * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(key), [
      { name: 'substituted-before-adding', value: Q(m * c + k), cost: 2 },
      { name: 'stopped-at-the-middle-variable', value: Q(c + k), cost: 1 },
      { name: 'dropped-the-offset', value: Q(m * c), cost: 2 },
    ], { family: 'A01', construct: 'chained-substitution', object: 'chained-substitution',
      stem: `If $a = ${coef(m, 'b')}$, $b = c ${term(k, '')}$, and $c = ${c}$, what is the value of $a$?`,
      cost: 3, mechanism: { abstraction: 1 },
      fingerprintParts: FP('linear no-stimulus', ['substitute-c-into-b', 'substitute-b-into-a'], 'value:a',
        'order-of-substitution-slips', ['D3', 'D2', 'D1'], 'symbols-only:three-relations', ['mult-m', 'offset-k', 'seed-c']) });
  },

  'fraction-equation-solve': (rand) => {
    const a = rand.pick([2, 3, 4, 5]), b = rand.pick([3, 4, 5, 6, 7]), t = rand.int(1, 4);
    if (gcd(a, b) !== 1) return { error: 'the denominators are not coprime' };
    const key = t * a * b, c = t * (a + b);
    return OK(rand, Q(key), [
      { name: 'added-the-denominators', value: Q(c * (a + b)), cost: 2 },
      { name: 'cleared-only-the-first-denominator', value: Q(c * a), cost: 2 },
      { name: 'cleared-only-the-second-denominator', value: Q(c * b), cost: 2 },
    ], { family: 'A01', construct: 'fraction-equation', object: 'fraction-equation-solve',
      stem: `If $\\dfrac{x}{${a}} + \\dfrac{x}{${b}} = ${c}$, what is the value of $x$?`,
      cost: 3, mechanism: { abstraction: 1 },
      fingerprintParts: FP('linear no-stimulus', ['find-the-common-denominator', 'combine', 'solve'], 'value:x',
        'denominator-slips', ['D3', 'D2', 'D2'], 'symbols-only:two-fraction-terms', ['den-a', 'den-b', 'rhs']) });
  },

  'linear-composite': (rand) => {
    const a = rand.int(2, 7), x = rand.nonZero(-7, 7), b = rand.nonZero(-9, 9);
    const m = rand.int(2, 5), k = rand.nonZero(-9, 9);
    const key = m * x + k;
    if (key === 0 || m * x === key || x === key || m * x + b === key) return { error: 'two options coincide' };
    if (Math.abs(m * x) <= Math.abs(key) / 3 || Math.abs(m * x) >= Math.abs(key) * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(key), [
      { name: 'dropped-the-new-constant', value: Q(m * x), cost: 2 },
      { name: 'reported-the-variable', value: Q(x), cost: 1 },
      { name: 'reused-the-original-constant', value: Q(m * x + b), cost: 2 },
    ], { family: 'A01', construct: 'solve-then-substitute', object: 'linear-composite',
      stem: `If $${coef(a, 'x')} ${term(b, '')} = ${a * x + b}$, what is the value of $${coef(m, 'x')} ${term(k, '')}$?`,
      cost: 3, mechanism: { abstraction: 1 },
      fingerprintParts: FP('linear no-stimulus', ['solve-for-x', 'substitute-into-the-target'], 'value:expression',
        'target-confusions', ['D2', 'D1', 'D3'], 'symbols-only:solve-then-evaluate', ['coeff-a', 'const-b', 'target-m', 'target-k']) });
  },

  'linear-verbal-substitution': (rand) => {
    // The offset is a MULTIPLE of the multiplier, so the "subtracted where the
    // inverse adds" slip lands on a whole number instead of being rejected.
    const m = rand.int(2, 5), n = rand.int(4, 9);
    const j = rand.int(1, Math.max(1, Math.floor((n - 1) / 3)));
    const k = m * j, r = m * (n - j);
    if (r <= 0 || n + j * (m - 1) === m * n) return { error: 'two options coincide' };
    return OK(rand, Q(n), [
      { name: 'subtracted-where-the-inverse-adds', value: Q(n - 2 * j), cost: 2 },
      { name: 'divided-before-undoing-the-subtraction', value: Q(n + j * (m - 1)), cost: 2 },
      { name: 'forgot-to-undo-the-multiplication', value: Q(m * n), cost: 1 },
    ], { family: 'A01', construct: 'translate-then-solve', object: 'linear-verbal-substitution',
      stem: `${k} less than ${m} times a number is ${r}. What is the number?`,
      cost: 2, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('linear no-stimulus', ['translate-the-sentence', 'invert-the-operations'], 'value:number',
        'inverse-operation-slips', ['D3', 'D3', 'D1'], 'words-only:one-sentence', ['multiplier', 'offset', 'result']) });
  },
};

/* ─────────────── A02 — modelling: build the expression ─────────────── */

export const A02_ASKS = {
  'model-build-absvalue': (rand) => {
    const c = rand.int(4, 20), d = rand.int(2, 9);
    if (d >= c) return { error: 'the lower endpoint would not be positive' };
    return OK(rand, Q(c + d), [
      { name: 'reported-the-least-value-instead', value: Q(c - d), cost: 1 },
      { name: 'reported-the-tolerance', value: Q(d), cost: 1 },
      { name: 'reported-the-centre', value: Q(c), cost: 1 },
    ], { family: 'A02', construct: 'absolute-value-model', object: 'model-build-absvalue',
      stem: `A machine fills bottles so that the number of millilitres $x$ satisfies $|x - ${c}| \\le ${d}$. ` +
            `What is the greatest number of millilitres a bottle can contain?`,
      cost: 2, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('absolute-value no-stimulus', ['unpack-the-absolute-value', 'take-the-upper-endpoint'],
        'value:upper-bound', 'endpoint-confusions', ['D3', 'D6', 'D2'], 'words-plus-symbols:tolerance', ['centre', 'tolerance']) });
  },
};

/* ─────────────── A03 — systems of equations ─────────────── */

export const A03_ASKS = {
  'two-price-system-money': (rand) => {
    const child = rand.int(4, 14), gap = rand.int(2, 9), adult = child + gap;
    const na = rand.int(2, 4), nc = rand.int(2, 5);
    const total = na * adult + nc * child;
    // The larger price is the near distractor, so the gap must stay under twice
    // the smaller price. The even split is an exact rational, not a rejection.
    if (gap >= 2 * child) return { error: 'the two prices are too far apart to distract' };
    if (qEq(Q(total, na + nc), Q(child)) || gap === child || gap === adult) return { error: 'two options coincide' };
    return OK(rand, Q(child), [
      { name: 'solved-for-the-larger-price', value: Q(adult), cost: 2 },
      { name: 'split-the-total-evenly', value: Q(total, na + nc), cost: 2 },
      { name: 'used-the-gap-as-the-price', value: Q(gap), cost: 1 },
    ], { family: 'A03', construct: 'two-price-system', object: 'two-price-system-money',
      stem: `${na} adult tickets and ${nc} child tickets cost $${total}. An adult ticket costs $${gap} more than a child ticket. ` +
            `What is the cost, in dollars, of a child ticket?`,
      cost: 3, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('systems no-stimulus', ['express-one-price-in-terms-of-the-other', 'substitute', 'solve'],
        'value:price', 'which-unknown-slips', ['D5', 'D2', 'D6'], 'words-only:two-purchases', ['count-a', 'count-c', 'total', 'gap']) });
  },

  'two-purchase-system-third-bundle': (rand) => {
    const p = rand.int(2, 9), n = rand.int(2, 9);
    if (p === n) return { error: 'the two prices coincide, so the bundles are not independent' };
    const t1 = 2 * p + 3 * n, t2 = 3 * p + 2 * n, key = p + n;
    if (t1 === t2) return { error: 'the two purchases are the same total' };
    if (Math.abs(t1 - t2) === key || (t1 + t2) / 2 === key) return { error: 'two options coincide' };
    return OK(rand, Q(key), [
      { name: 'added-without-dividing', value: Q(t1 + t2), cost: 1 },
      { name: 'divided-by-two-instead-of-five', value: Q(t1 + t2, 2), cost: 2 },
      { name: 'took-the-difference', value: Q(Math.abs(t1 - t2)), cost: 2 },
    ], { family: 'A03', construct: 'third-bundle', object: 'two-purchase-system-third-bundle',
      stem: `Two pens and three notebooks cost $${t1}. Three pens and two notebooks cost $${t2}. ` +
            `What is the cost, in dollars, of one pen and one notebook?`,
      cost: 3, mechanism: { abstraction: 1, nonobvious_rel: 1 },
      fingerprintParts: FP('systems no-stimulus', ['add-the-two-equations', 'divide-by-the-common-factor'],
        'value:bundle', 'combination-slips', ['D1', 'D2', 'D3'], 'words-only:two-purchases', ['total-1', 'total-2']) });
  },
};

/* ─────────────── A04 — inequalities ─────────────── */

export const A04_ASKS = {
  'compound-inequality-point-test': (rand) => {
    // Both endpoints land exactly ON a listed integer's image. That is what
    // makes the two endpoint slips differ from the key by exactly one — sampling
    // the bounds and hoping made the three counts coincide on 44 of 60 seeds,
    // and it also made the item's whole point (strict vs inclusive) invisible.
    const a = rand.int(2, 4), b = rand.nonZero(-6, 6);
    const xs = [-3, -2, -1, 0, 1, 2, 3, 4];
    const iLo = rand.int(0, 2), iHi = rand.int(5, 7);
    const lo = a * xs[iLo] + b, hi = a * xs[iHi] + b;
    const sat = xs.filter(x => a * x + b > lo && a * x + b <= hi).length;
    const withBoth = sat + 1, strict = sat - 1;
    if (sat < 3 || sat > 6) return { error: 'the count is at an extreme of the printed list' };
    if (xs.length === withBoth || xs.length === strict || xs.length === sat)
      return { error: 'the whole-list slip coincides with a count' };
    return OK(rand, Q(sat), [
      { name: 'included-the-open-endpoint', value: Q(withBoth), cost: 2 },
      { name: 'excluded-the-closed-endpoint', value: Q(strict), cost: 2 },
      { name: 'counted-the-whole-list', value: Q(xs.length), cost: 1 },
    ], { family: 'A04', construct: 'point-test-count', object: 'compound-inequality-point-test',
      stem: `For how many of the integers $-3, -2, -1, 0, 1, 2, 3, 4$ is $${lo} < ${coef(a, 'x')} ${term(b, '')} \\le ${hi}$?`,
      cost: 3, mechanism: { filtering: 1, abstraction: 1 },
      fingerprintParts: FP('inequalities no-stimulus', ['test-each-candidate', 'apply-both-endpoints', 'count'],
        'value:count', 'endpoint-slips', ['D3', 'D3', 'D6'], 'symbols-only:compound-inequality', ['coeff', 'const', 'low', 'high']) });
  },

  'quadratic-inequality-numberline': (rand) => {
    const k = rand.int(3, 8), key = 2 * k - 1;
    return OK(rand, Q(key), [
      { name: 'included-the-endpoints', value: Q(2 * k + 1), cost: 1 },
      { name: 'forgot-zero', value: Q(2 * k - 2), cost: 2 },
      { name: 'counted-only-the-positive-solutions', value: Q(k - 1), cost: 2 },
    ], { family: 'A04', construct: 'quadratic-inequality-count', object: 'quadratic-inequality-numberline',
      stem: `For how many integer values of $x$ is $x^2 < ${k * k}$?`,
      cost: 3, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('inequalities no-stimulus', ['take-the-square-root', 'read-the-open-interval', 'count-integers'],
        'value:count', 'interval-slips', ['D3', 'D3', 'D6'], 'symbols-only:quadratic-inequality', ['bound']) });
  },

  'inequality-intersection-unique': (rand) => {
    const n = rand.int(2, 7), a = rand.int(2, 5), b = rand.int(2, 5);
    const loNum = a * n - 1, hiNum = b * n + 1;              // a*x > a*n-1 and b*x < b*n+1 pin x = n
    if (n - 1 === n || loNum === n || hiNum === n) return { error: 'a printed number coincides with the answer' };
    if (n + 1 >= 3 * n) return { error: 'no distractor is near the key' };
    return OK(rand, Q(n), [
      { name: 'took-the-integer-below-the-lower-bound', value: Q(n - 1), cost: 1 },
      { name: 'took-the-integer-above-the-upper-bound', value: Q(n + 1), cost: 2 },
      { name: 'read-a-printed-constant', value: Q(loNum), cost: 1 },
    ], { family: 'A04', construct: 'unique-integer-solution', object: 'inequality-intersection-unique',
      stem: `What is the only integer $x$ for which both $${coef(a, 'x')} > ${loNum}$ and $${coef(b, 'x')} < ${hiNum}$?`,
      cost: 3, mechanism: { filtering: 1, abstraction: 1 },
      fingerprintParts: FP('inequalities no-stimulus', ['solve-each-inequality', 'intersect-the-intervals', 'name-the-integer'],
        'value:integer', 'off-by-one-slips', ['D3', 'D3', 'D6'], 'symbols-only:two-inequalities', ['coeff-a', 'coeff-b', 'bound-lo', 'bound-hi']) });
  },
};

/* ─────────────── A05 — lines in the plane ─────────────── */

export const A05_ASKS = {
  'parallel-slope-standard-form': (rand) => {
    const a = rand.int(2, 9), b = rand.int(2, 9), c = rand.nonZero(-9, 9) * 2;
    if (gcd(a, b) !== 1 || a === b) return { error: 'the coefficients share a factor or coincide' };
    return OK(rand, Q(-a, b), [
      { name: 'dropped-the-sign', value: Q(a, b), cost: 1 },
      { name: 'inverted-the-slope', value: Q(-b, a), cost: 2 },
      { name: 'took-the-perpendicular-slope', value: Q(b, a), cost: 2 },
    ], { family: 'A05', construct: 'slope-from-standard-form', object: 'parallel-slope-standard-form',
      stem: `Line $\\ell$ is parallel to the line $${coef(a, 'x')} ${term(b, 'y')} = ${c}$. What is the slope of line $\\ell$?`,
      cost: 2, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('lines no-stimulus', ['rearrange-to-slope-intercept', 'read-the-slope'], 'value:slope',
        'slope-sign-and-reciprocal-slips', ['D3', 'D2', 'D2'], 'symbols-only:standard-form', ['coeff-a', 'coeff-b']) });
  },

  'perpendicular-through-midpoint': (rand) => {
    const x1 = rand.int(-6, 6), y1 = rand.int(-6, 6);
    const dx = rand.nonZero(-6, 6), dy = rand.nonZero(-6, 6);
    if (Math.abs(dx) === Math.abs(dy)) return { error: 'the slope and its reciprocal coincide in size' };
    if (gcd(dx, dy) !== 1) return { error: 'the run and rise share a factor' };
    return OK(rand, Q(-dx, dy), [
      { name: 'reported-the-segment-slope', value: Q(dy, dx), cost: 1 },
      { name: 'negated-the-segment-slope', value: Q(-dy, dx), cost: 2 },
      { name: 'inverted-without-negating', value: Q(dx, dy), cost: 2 },
    ], { family: 'A05', construct: 'perpendicular-bisector-slope', object: 'perpendicular-through-midpoint',
      stem: `In the $xy$-plane, a line passes through the midpoint of the segment joining $(${x1}, ${y1})$ and ` +
            `$(${x1 + dx}, ${y1 + dy})$ and is perpendicular to that segment. What is the slope of the line?`,
      cost: 3, mechanism: { abstraction: 1, nonobvious_rel: 1 },
      fingerprintParts: FP('lines no-stimulus', ['find-the-segment-slope', 'take-the-negative-reciprocal'], 'value:slope',
        'reciprocal-and-sign-slips', ['D3', 'D3', 'D2'], 'symbols-only:two-points', ['x1', 'y1', 'run', 'rise']) });
  },

  'table-linear-missing': (rand) => {
    const x0 = rand.int(1, 4), step = rand.int(2, 5), m = rand.nonZero(-6, 6), b = rand.int(-9, 9);
    const xs = [x0, x0 + step, x0 + 2 * step, x0 + 3 * step];
    const ys = xs.map(x => m * x + b);
    const rows = xs.map((x, i) => [String(x), i === 3 ? '?' : String(ys[i])]);
    const key = ys[3];
    if (key === 0 || ys[2] + m === key || ys[2] + step === key || m * xs[3] === key) return { error: 'two options coincide' };
    if (Math.abs(ys[2]) <= Math.abs(key) / 3 || Math.abs(ys[2]) >= Math.abs(key) * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(key), [
      { name: 'added-one-step-of-x-instead-of-y', value: Q(ys[2] + step), cost: 2 },
      { name: 'repeated-the-previous-value', value: Q(ys[2]), cost: 1 },
      { name: 'dropped-the-intercept', value: Q(m * xs[3]), cost: 2 },
    ], { family: 'A05', construct: 'complete-a-linear-table', object: 'table-linear-missing',
      stimulus: { kind: 'table', title: 'Values of a linear function', rows, sharable: false },
      stem: `The table shows values of a linear function. What is the missing value?`,
      cost: 3, mechanism: { repr_switch: 1, abstraction: 1 },
      fingerprintParts: FP('stimulus:table private', ['find-the-constant-difference', 'extend-the-pattern'], 'value:missing-cell',
        'step-confusions', ['D3', 'D1', 'D2'], 'four-row-table', ['x-start', 'x-step', 'slope', 'intercept']) });
  },
};

/* ─────────────── A06 — quadratics & parabolas (batch 2) ─────────────── */

export const A06_ASKS_2 = {
  'vertex-paraphrased': (rand) => {
    const a = rand.int(2, 5), h = rand.nonZero(-7, 7), k = rand.nonZero(-9, 9);
    if (Math.abs(h) === Math.abs(k)) return { error: 'the vertex coordinates coincide in size' };
    if (a === k || -k === k) return { error: 'two options coincide' };
    return OK(rand, Q(k), [
      { name: 'reported-the-input-that-achieves-it', value: Q(h), cost: 1 },
      { name: 'negated-the-minimum', value: Q(-k), cost: 2 },
      { name: 'reported-the-leading-coefficient', value: Q(a), cost: 1 },
    ], { family: 'A06', construct: 'least-value-of-a-parabola', object: 'vertex-paraphrased',
      stem: `The function $f$ is defined by $f(x) = ${coef(a, `(x ${signedConst(-h)})^{2}`)} ${term(k, '')}$. ` +
            `What is the least value of $f(x)$?`,
      cost: 2, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('quadratic no-stimulus', ['read-the-vertex-form', 'report-the-output-coordinate'],
        'value:minimum', 'coordinate-confusions', ['D6', 'D3', 'D6'], 'symbols-only:vertex-form', ['leading', 'shift-h', 'shift-k']) });
  },

  'quadratic-through-three-points': (rand) => {
    const a = rand.nonZero(-4, 4), b = rand.nonZero(-6, 6), c = rand.nonZero(-9, 9);
    const y1 = a + b + c, y2 = a - b + c;
    if (y1 === y2) return { error: 'the two symmetric points coincide' };
    if (Q(y1 + y2, 2).d !== 1) return { error: 'the averaging slip is not a whole number' };
    const s1 = (y1 + y2) / 2, s2 = (y1 - y2) / 2, s3 = y1 + y2 - 2 * c;
    if (s1 === a || s2 === a || s3 === a || s1 === s2 || s1 === s3 || s2 === s3) return { error: 'two options coincide' };
    if (Math.abs(s3) <= Math.abs(a) / 3 || Math.abs(s3) >= Math.abs(a) * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(a), [
      { name: 'halved-nothing-and-averaged-the-outputs', value: Q(s1), cost: 2 },
      { name: 'computed-the-linear-coefficient-instead', value: Q(s2), cost: 2 },
      { name: 'forgot-to-halve', value: Q(s3), cost: 1 },
    ], { family: 'A06', construct: 'fit-a-parabola-to-three-points', object: 'quadratic-through-three-points',
      stem: `The graph of $y = ax^2 + bx + c$ passes through $(0, ${c})$, $(1, ${y1})$ and $(-1, ${y2})$. ` +
            `What is the value of $a$?`,
      cost: 4, mechanism: { abstraction: 1, nonobvious_rel: 1 },
      fingerprintParts: FP('quadratic no-stimulus', ['substitute-each-point', 'add-the-symmetric-pair', 'solve-for-a'],
        'value:coefficient', 'which-coefficient-slips', ['D2', 'D2', 'D1'], 'symbols-only:three-points', ['c', 'y-at-1', 'y-at-minus-1']) });
  },
};

/* ─────────────── A07 — polynomials & factoring ─────────────── */

export const A07_ASKS = {
  'coefficient-matching-identity': (rand) => {
    const m = rand.int(2, 4), a = rand.nonZero(-7, 7), b = rand.nonZero(-7, 7);
    const lin = m * b + a, con = a * b;
    // The sign-slipped sum is the near distractor and always is. The
    // subtracted-instead-of-added slip is more than three times the key
    // whenever a and b are close in size, which was 35 of 60 seeds.
    if (a === b || a + b === 0 || con === a + b || lin === a + b || con === lin
        || con === -(a + b) || lin === -(a + b)) return { error: 'two options coincide' };
    return OK(rand, Q(a + b), [
      { name: 'reported-the-product-instead-of-the-sum', value: Q(con), cost: 1 },
      { name: 'read-the-linear-coefficient', value: Q(lin), cost: 2 },
      { name: 'read-the-factors-with-the-opposite-signs', value: Q(-(a + b)), cost: 2 },
    ], { family: 'A07', construct: 'match-coefficients', object: 'coefficient-matching-identity',
      stem: `For all values of $x$, $(${coef(m, 'x')} ${term(a, '')})(x ${term(b, '')}) = ${coef(m, 'x^{2}')} ${term(lin, 'x')} ${term(con, '')}$. ` +
            `What is the value of $a + b$ if the factors are $${coef(m, 'x')} + a$ and $x + b$?`,
      cost: 3, mechanism: { abstraction: 1, nonobvious_rel: 1 },
      fingerprintParts: FP('polynomials no-stimulus', ['expand-the-product', 'match-like-coefficients'], 'value:parameter-sum',
        'sum-vs-product-slips', ['D1', 'D2', 'D3'], 'symbols-only:identity', ['lead-m', 'const-a', 'const-b']) });
  },

  'cubic-factors-sum-roots': (rand) => {
    const p = rand.nonZero(-8, 8), q = rand.nonZero(-8, 8);
    if (p === q || p + q === 0) return { error: 'the roots coincide or the sum vanishes' };
    if (p * q === p + q || p - q === p + q) return { error: 'two options coincide' };
    return OK(rand, Q(p + q), [
      { name: 'multiplied-the-roots-instead', value: Q(p * q), cost: 1 },
      { name: 'subtracted-the-roots', value: Q(p - q), cost: 2 },
      { name: 'negated-the-sum', value: Q(-(p + q)), cost: 2 },
    ], { family: 'A07', construct: 'sum-of-roots-of-a-factored-cubic', object: 'cubic-factors-sum-roots',
      stem: `The equation $x(x ${signedConst(-p)})(x ${signedConst(-q)}) = 0$ has three solutions. What is their sum?`,
      cost: 2, mechanism: { abstraction: 1 },
      fingerprintParts: FP('polynomials no-stimulus', ['read-the-roots-off-the-factors', 'add-them'], 'value:root-sum',
        'sum-vs-product-slips', ['D1', 'D3', 'D3'], 'symbols-only:factored-cubic', ['root-p', 'root-q']) });
  },

  'divisibility-remainder-parameter': (rand) => {
    // Pick the parameter and PRINT the remainder it produces. Solving for k and
    // testing whether it happened to be an integer threw away 36 of 60 seeds.
    const c = rand.int(2, 9), t = rand.pick([2, 3]), k = rand.nonZero(-9, 9);
    const r = t * t * t + k * t + c;
    const s1 = r - c, s2 = k + (2 * t * t), s3 = r - t * t * t - c;
    if ([s1, s2, s3].some(v => v === k) || s1 === s2 || s1 === s3 || s2 === s3)
      return { error: 'two options coincide' };
    if (Math.abs(s3) <= Math.abs(k) / 3 || Math.abs(s3) >= Math.abs(k) * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(k), [
      { name: 'forgot-the-cubic-term', value: Q(s1), cost: 2 },
      { name: 'sign-slip-on-the-cubic-term', value: Q(s2), cost: 2 },
      { name: 'forgot-to-divide-by-the-root', value: Q(s3), cost: 1 },
    ], { family: 'A07', construct: 'remainder-theorem-parameter', object: 'divisibility-remainder-parameter',
      stem: `When the polynomial $x^{3} ${term(k, 'x')} ${term(c, '')}$ is divided by $(x - ${t})$, the remainder is ${r}. ` +
            `What is the value of $k$?`,
      cost: 4, mechanism: { abstraction: 1, nonobvious_rel: 1 },
      fingerprintParts: FP('polynomials no-stimulus', ['apply-the-remainder-theorem', 'solve-for-the-parameter'],
        'value:parameter', 'term-omission-slips', ['D3', 'D3', 'D3'], 'symbols-only:cubic-with-parameter', ['const-c', 'divisor-root', 'remainder']) });
  },

  'biquadratic-product-roots': (rand) => {
    const p = rand.int(2, 4), q = rand.int(2, 4);
    if (p === q) return { error: 'the two squares coincide' };
    const sum = p * p + q * q, prod = p * p * q * q;
    if (prod === sum || prod === p * q || sum === p * q) return { error: 'two options coincide' };
    return OK(rand, Q(prod), [
      { name: 'read-the-linear-coefficient', value: Q(sum), cost: 1 },
      { name: 'multiplied-only-the-positive-roots', value: Q(p * q), cost: 2 },
      { name: 'negated-the-product', value: Q(-prod), cost: 2 },
    ], { family: 'A07', construct: 'product-of-roots-of-a-biquadratic', object: 'biquadratic-product-roots',
      stem: `The equation $x^{4} - ${sum}x^{2} + ${prod} = 0$ has four solutions. What is their product?`,
      cost: 3, mechanism: { abstraction: 1, nonobvious_rel: 1 },
      fingerprintParts: FP('polynomials no-stimulus', ['substitute-u-for-x-squared', 'find-the-four-roots', 'multiply-them'],
        'value:root-product', 'coefficient-confusions', ['D2', 'D3', 'D3'], 'symbols-only:biquadratic', ['sum-of-squares', 'product-of-squares']) });
  },
};

/* ─────────────── A09 — functions: composition & evaluation ─────────────── */

export const A09_ASKS = {
  'function-eval': (rand) => {
    const a = rand.int(2, 5), b = rand.nonZero(-6, 6), c = rand.nonZero(-9, 9);
    const x = rand.pick([-4, -3, -2, 2, 3, 4]);
    const key = a * x * x + b * x + c;
    const s1 = -a * x * x + b * x + c, s2 = a * x * x + c, s3 = a * (-x) * (-x) + b * (-x) + c;
    if (key === 0 || s1 === key || s2 === key || s3 === key || s1 === s2 || s1 === s3 || s2 === s3)
      return { error: 'two options coincide' };
    if (Math.abs(s2) <= Math.abs(key) / 3 || Math.abs(s2) >= Math.abs(key) * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(key), [
      { name: 'lost-the-sign-on-the-square', value: Q(s1), cost: 2 },
      { name: 'dropped-the-linear-term', value: Q(s2), cost: 1 },
      { name: 'evaluated-at-the-opposite-input', value: Q(s3), cost: 2 },
    ], { family: 'A09', construct: 'evaluate-a-quadratic-function', object: 'function-eval',
      stem: `The function $f$ is defined by $f(x) = ${coef(a, 'x^{2}')} ${term(b, 'x')} ${term(c, '')}$. What is the value of $f(${x})$?`,
      cost: 2, mechanism: { abstraction: 1 },
      fingerprintParts: FP('functions no-stimulus', ['substitute-the-input', 'evaluate'], 'value:output',
        'substitution-slips', ['D3', 'D1', 'D3'], 'symbols-only:one-quadratic', ['coeff-a', 'coeff-b', 'const-c', 'input']) });
  },

  'symbolic-composition': (rand) => {
    const a = rand.int(2, 5), b = rand.nonZero(-7, 7), c = rand.nonZero(-7, 7), x = rand.nonZero(-6, 6);
    const key = a * (x + c) + b, s1 = a * x + b + c, s2 = a * x + b, s3 = x + c;
    if (key === 0 || [s1, s2, s3].some(v => v === key) || s1 === s2 || s1 === s3 || s2 === s3)
      return { error: 'two options coincide' };
    if (Math.abs(s1) <= Math.abs(key) / 3 || Math.abs(s1) >= Math.abs(key) * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(key), [
      { name: 'applied-the-functions-in-the-wrong-order', value: Q(s1), cost: 2 },
      { name: 'evaluated-only-the-outer-function', value: Q(s2), cost: 1 },
      { name: 'stopped-at-the-inner-function', value: Q(s3), cost: 1 },
    ], { family: 'A09', construct: 'compose-two-functions', object: 'symbolic-composition',
      stem: `The functions $f$ and $g$ are defined by $f(x) = ${coef(a, 'x')} ${term(b, '')}$ and $g(x) = x ${term(c, '')}$. ` +
            `What is the value of $f(g(${x}))$?`,
      cost: 3, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('functions no-stimulus', ['evaluate-the-inner-function', 'feed-it-to-the-outer-function'],
        'value:composite', 'order-of-composition-slips', ['D3', 'D2', 'D1'], 'symbols-only:two-functions', ['coeff-a', 'const-b', 'shift-c', 'input']) });
  },

  'table-from-function-value': (rand) => {
    const m = rand.nonZero(-5, 5), b = rand.nonZero(-9, 9);
    // Consecutive inputs. Scattered ones put the "read the adjacent row" slip
    // more than a factor of three from the key on 24 of 60 seeds, which is the
    // one distractor that has to be close for the item to test reading at all.
    const x0 = rand.int(2, 6), xs = [x0, x0 + 1, x0 + 2, x0 + 3];
    const ys = xs.map(x => m * x + b);
    if (new Set(ys).size !== 4) return { error: 'two rows share an output' };
    const i = rand.int(0, 3), target = ys[i];
    const s1 = xs[(i + 1) % 4], s2 = ys[(i + 1) % 4];
    if ([s1, s2, target].some(v => v === xs[i]) || s1 === s2 || s2 === target)
      return { error: 'two options coincide' };
    return OK(rand, Q(xs[i]), [
      { name: 'read-the-adjacent-row', value: Q(s1), cost: 1 },
      { name: 'read-the-output-column-instead', value: Q(s2), cost: 2 },
      { name: 'reported-the-given-value', value: Q(target), cost: 1 },
    ], { family: 'A09', construct: 'reverse-read-a-function-table', object: 'table-from-function-value',
      stimulus: { kind: 'table', title: 'Values of $f$', rows: xs.map((x, j) => [String(x), String(ys[j])]), sharable: false },
      stem: `The table shows several values of the function $f$. For which value of $x$ is $f(x) = ${target}$?`,
      cost: 2, mechanism: { repr_switch: 1, filtering: 1 },
      fingerprintParts: FP('stimulus:table private', ['scan-the-output-column', 'read-back-the-input'], 'value:input',
        'column-confusions', ['D5', 'D5', 'D6'], 'four-row-function-table', ['inputs', 'outputs', 'target']) });
  },
};

/* ─────────────── A10 — exponents, radicals & complex (batch 2) ─────────────── */

export const A10_ASKS_2 = {
  'exponent-equation-composite': (rand) => {
    const p = rand.int(1, 6), q = rand.int(1, 6), key = p + 2 * q;
    if (p === q) return { error: 'the two offsets coincide' };
    const s1 = p - q, s2 = 2 * q - p, s3 = p + q;
    if ([s1, s2, s3].some(v => v === key) || s1 === s2 || s1 === s3 || s2 === s3) return { error: 'two options coincide' };
    if (Math.abs(s3) <= Math.abs(key) / 3 || Math.abs(s3) >= Math.abs(key) * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(key), [
      { name: 'ignored-the-base-change', value: Q(s3), cost: 2 },
      { name: 'subtracted-the-offsets', value: Q(s1), cost: 2 },
      { name: 'sign-slip-when-collecting', value: Q(s2), cost: 2 },
    ], { family: 'A10', construct: 'equate-exponents-across-bases', object: 'exponent-equation-composite',
      stem: `If $2^{x + ${p}} = 4^{x - ${q}}$, what is the value of $x$?`,
      cost: 3, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('exponents no-stimulus', ['rewrite-both-sides-on-one-base', 'equate-exponents', 'solve'],
        'value:x', 'base-change-slips', ['D3', 'D3', 'D3'], 'symbols-only:two-bases', ['offset-p', 'offset-q']) });
  },

  'radical-equation-parameter': (rand) => {
    const x = rand.int(4, 12), d = rand.int(1, 3), m = x - d;
    if (m <= 1) return { error: 'the right-hand side is too small' };
    const k = m * m - x;
    if (k <= 0) return { error: 'the parameter would not be positive' };
    const s1 = m * m + x, s2 = m - x, s3 = x - m;
    if ([s1, s2, s3].some(v => v === k) || s1 === s2 || s1 === s3 || s2 === s3) return { error: 'two options coincide' };
    if (Math.abs(s1) <= k / 3 || s1 >= k * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(k), [
      { name: 'added-x-instead-of-subtracting-it', value: Q(s1), cost: 2 },
      { name: 'forgot-to-square', value: Q(s2), cost: 1 },
      { name: 'reversed-the-subtraction', value: Q(s3), cost: 2 },
    ], { family: 'A10', construct: 'radical-equation-with-a-parameter', object: 'radical-equation-parameter',
      stem: `The equation $\\sqrt{x + k} = x - ${d}$ has $x = ${x}$ as a solution. What is the value of $k$?`,
      cost: 3, mechanism: { abstraction: 1, reversal: 1 },
      fingerprintParts: FP('radicals no-stimulus', ['substitute-the-known-solution', 'square-both-sides', 'solve-for-k'],
        'value:parameter', 'squaring-slips', ['D3', 'D1', 'D3'], 'symbols-only:radical-with-parameter', ['offset-d', 'solution-x']) });
  },
};

/* ─────────────── A11 — growth & variation ─────────────── */

export const A11_ASKS = {
  'direct-variation-square': (rand) => {
    const a = rand.int(2, 5), kk = rand.int(2, 6), b = 2 * a;
    const y1 = kk * a * a, key = kk * b * b;
    const s1 = y1 * (b / a), s2 = y1 + (b * b - a * a), s3 = y1;
    if ([s1, s2, s3].some(v => v === key) || s1 === s2 || s1 === s3 || s2 === s3) return { error: 'two options coincide' };
    if (s1 <= key / 3 || s1 >= key * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(key), [
      { name: 'varied-linearly-instead', value: Q(s1), cost: 2 },
      { name: 'added-the-change-in-x-squared', value: Q(s2), cost: 2 },
      { name: 'reported-the-given-output', value: Q(s3), cost: 1 },
    ], { family: 'A11', construct: 'direct-variation-with-a-square', object: 'direct-variation-square',
      stem: `The quantity $y$ varies directly with $x^{2}$. When $x = ${a}$, $y = ${y1}$. What is the value of $y$ when $x = ${b}$?`,
      cost: 3, mechanism: { abstraction: 1, nonobvious_rel: 1 },
      fingerprintParts: FP('variation no-stimulus', ['find-the-constant-of-variation', 'apply-it-to-the-new-input'],
        'value:output', 'linear-vs-square-slips', ['D3', 'D3', 'D6'], 'words-plus-symbols:variation', ['x-old', 'y-old', 'x-new']) });
  },

  'linear-extrapolation-daycount': (rand) => {
    const rate = rand.int(2, 9) * 5, days = rand.int(3, 9), extra = rand.int(1, 6);
    const left = rate * extra, start = rate * (days + extra);
    const s1 = extra, s2 = days + extra, s3 = days + 1;
    if ([s1, s2, s3].some(v => v === days) || s1 === s2 || s1 === s3 || s2 === s3) return { error: 'two options coincide' };
    if (s2 <= days / 3 || s2 >= days * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(days), [
      { name: 'divided-the-remaining-amount-by-the-rate', value: Q(s1), cost: 2 },
      { name: 'divided-the-starting-amount-by-the-rate', value: Q(s2), cost: 2 },
      { name: 'counted-one-day-too-many', value: Q(s3), cost: 1 },
    ], { family: 'A11', construct: 'solve-for-the-day-count', object: 'linear-extrapolation-daycount',
      stem: `A tank holds ${start} litres and loses ${rate} litres each day. After how many days does it hold ${left} litres?`,
      cost: 3, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('linear-model no-stimulus', ['build-the-linear-model', 'solve-for-the-time'], 'value:days',
        'which-quantity-slips', ['D3', 'D3', 'D3'], 'words-only:depletion', ['start', 'rate', 'remaining']) });
  },

  'exponential-growth-offbyone': (rand) => {
    // The factor is 2, not 3: at 3 the off-by-one distractor sits exactly three
    // times the key, which is the one ratio the near-distractor rule excludes.
    const p0 = rand.int(2, 9) * 50, r = 2, n = rand.int(3, 5);
    const key = p0 * Math.pow(r, n - 1);
    const s1 = p0 * Math.pow(r, n), s2 = p0 * Math.pow(r, n - 2), s3 = p0 * (1 + (n - 1) * (r - 1)) * 3;
    if ([s1, s2, s3].some(v => v === key) || s1 === s2 || s1 === s3 || s2 === s3) return { error: 'two options coincide' };
    if (s1 <= key / 3 || s1 >= key * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(key), [
      { name: 'counted-the-first-year-as-a-growth-step', value: Q(s1), cost: 2 },
      { name: 'counted-one-growth-step-too-few', value: Q(s2), cost: 2 },
      { name: 'grew-linearly-instead', value: Q(s3), cost: 2 },
    ], { family: 'A11', construct: 'exponential-growth-step-count', object: 'exponential-growth-offbyone',
      stem: `A population is multiplied by ${r} each year. In year 1 the population was ${p0}. ` +
            `What is the population in year ${n}?`,
      cost: 3, mechanism: { abstraction: 1, filtering: 1 },
      fingerprintParts: FP('growth no-stimulus', ['count-the-growth-steps', 'apply-the-factor'], 'value:population',
        'off-by-one-slips', ['D3', 'D3', 'D3'], 'words-only:annual-growth', ['initial', 'factor', 'year']) });
  },
};

/* ─────────────── A12 — percentages & proportional reasoning ─────────────── */

export const A12_ASKS = {
  'reverse-percentage': (rand) => {
    const pct = rand.pick([10, 20, 25, 40, 50]);
    const unit = 100 / gcd(pct, 100);                      // makes the printed price whole
    const orig = unit * rand.int(2, 12);
    const now = orig * (100 + pct) / 100;
    // Applying the percent in the wrong direction rarely lands on a whole
    // number, and that is the point of the distractor, not a reason to reject
    // the seed: it is an exact rational like every other option here.
    const s1 = Q(now * (100 - pct), 100), s2 = Q(now + pct), s3 = Q(now - pct);
    if ([s1, s2, s3].some(v => qEq(v, Q(orig))) || qEq(s1, s2) || qEq(s1, s3) || qEq(s2, s3))
      return { error: 'two options coincide' };
    return OK(rand, Q(orig), [
      { name: 'decreased-the-new-price-by-the-same-percent', value: s1, cost: 2 },
      { name: 'added-the-percent-as-an-amount', value: s2, cost: 1 },
      { name: 'subtracted-the-percent-as-an-amount', value: s3, cost: 1 },
    ], { family: 'A12', construct: 'undo-a-percent-increase', object: 'reverse-percentage',
      stem: `After a ${pct}% increase, the price of an item is $${now}. What was the price, in dollars, before the increase?`,
      cost: 3, mechanism: { abstraction: 1, reversal: 1 },
      fingerprintParts: FP('percent no-stimulus', ['identify-the-base', 'divide-by-the-growth-factor'], 'value:original',
        'base-confusions', ['D3', 'D3', 'D3'], 'words-only:price-change', ['percent', 'new-price']) });
  },

  'percent-change-base': (rand) => {
    // Both percentages are exact rationals. Requiring both to be whole rejected
    // 50 of 60 seeds; a wrong-base answer of 100/6 percent is a perfectly good
    // distractor and the reference prints non-integer percentages too.
    const from = rand.int(2, 12) * 10, to = from + rand.int(1, 6) * 10;
    const up = Q((to - from) * 100, from), down = Q((to - from) * 100, to), s3 = Q(to * 100, from);
    if ([down, s3, Q(to - from)].some(v => qEq(v, up)) || qEq(down, s3) || qEq(down, Q(to - from)) || qEq(s3, Q(to - from)))
      return { error: 'two options coincide' };
    return OK(rand, up, [
      { name: 'used-the-new-value-as-the-base', value: down, cost: 2 },
      { name: 'reported-the-raw-change', value: Q(to - from), cost: 1 },
      { name: 'reported-the-ratio-rather-than-the-change', value: s3, cost: 2 },
    ], { family: 'A12', construct: 'percent-change-with-the-right-base', object: 'percent-change-base',
      stem: `A quantity increases from ${from} to ${to}. By what percent does it increase?`,
      cost: 3, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('percent no-stimulus', ['find-the-change', 'divide-by-the-original'], 'value:percent',
        'base-confusions', ['D3', 'D6', 'D2'], 'words-only:two-values', ['from', 'to']) });
  },

  'ratio-three-part-largest': (rand) => {
    const r = [rand.int(1, 4), rand.int(2, 5), rand.int(5, 8)];
    const sum = r[0] + r[1] + r[2], unit = rand.int(3, 12), total = sum * unit;
    const key = r[2] * unit;
    const s1 = r[1] * unit, s2 = Q(total, 3), s3 = r[0] * unit;
    if ([s1, s3].some(v => v === key) || qEq(s2, Q(key)) || s1 === s3 || qEq(s2, Q(s1)) || qEq(s2, Q(s3)))
      return { error: 'two options coincide' };
    if (qNum(s2) <= key / 3 || qNum(s2) >= key * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(key), [
      { name: 'split-the-total-evenly', value: s2, cost: 2 },
      { name: 'reported-the-middle-part', value: Q(s1), cost: 1 },
      { name: 'reported-the-smallest-part', value: Q(s3), cost: 2 },
    ], { family: 'A12', construct: 'three-part-ratio', object: 'ratio-three-part-largest',
      stem: `A sum of $${total} is divided among three people in the ratio ${r[0]} : ${r[1]} : ${r[2]}. ` +
            `How many dollars does the person with the largest share receive?`,
      cost: 3, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('ratio no-stimulus', ['total-the-ratio-parts', 'find-one-part', 'scale-the-largest'],
        'value:share', 'which-part-slips', ['D2', 'D5', 'D5'], 'words-only:three-way-split', ['ratio', 'total']) });
  },

  'fixed-plus-variable-compare': (rand) => {
    // Choose the crossover, then the two plans that meet there.
    const key = rand.int(3, 12), dv = rand.int(2, 4), vA = rand.int(2, 5), vB = vA + dv;
    const fA = rand.int(2, 12) * 5 + key * dv, fB = fA - key * dv;
    const s1 = key * dv, s2 = key + dv, s3 = key - 1;
    if (fB <= 0 || [s1, s2, s3].some(v => v === key) || s1 === s2 || s1 === s3 || s2 === s3)
      return { error: 'two options coincide' };
    return OK(rand, Q(key), [
      { name: 'used-the-difference-in-fixed-costs-alone', value: Q(s1), cost: 1 },
      { name: 'added-the-rate-difference-instead-of-dividing', value: Q(s2), cost: 2 },
      { name: 'counted-one-unit-too-few', value: Q(s3), cost: 2 },
    ], { family: 'A12', construct: 'crossover-of-two-linear-costs', object: 'fixed-plus-variable-compare',
      stem: `Plan A costs $${fA} plus $${vA} per unit. Plan B costs $${fB} plus $${vB} per unit. ` +
            `For how many units do the two plans cost the same?`,
      cost: 3, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('linear-model no-stimulus', ['set-the-two-costs-equal', 'solve-for-the-count'], 'value:units',
        'which-difference-slips', ['D6', 'D3', 'D3'], 'words-only:two-plans', ['fixed-a', 'rate-a', 'fixed-b', 'rate-b']) });
  },
};

/* ─────────────── A13 — data: read a display ─────────────── */

const REGIONS3 = ['North', 'South', 'East'];

export const A13_ASKS = {
  'rate-of-change-two-rows': (rand) => {
    // The time step is 2, not a sampled 2-6: the "per row rather than per unit"
    // slip is the key times the step, and only a step of 2 keeps it inside the
    // factor-of-three window that makes it a real near miss.
    const x0 = rand.int(1, 5), dx = 2, m = rand.int(2, 9), b = rand.int(1, 20);
    const xs = [x0, x0 + dx, x0 + 2 * dx];
    const ys = xs.map(x => m * x + b);
    const s1 = m * dx, s2 = ys[2] - ys[0], s3 = ys[0];
    if ([s1, s2, s3].some(v => v === m) || s1 === s2 || s1 === s3 || s2 === s3)
      return { error: 'two options coincide' };
    return OK(rand, Q(m), [
      { name: 'reported-the-change-per-row-rather-than-per-unit', value: Q(s1), cost: 2 },
      { name: 'reported-the-total-change', value: Q(s2), cost: 1 },
      { name: 'read-a-single-cell', value: Q(s3), cost: 1 },
    ], { family: 'A13', construct: 'rate-of-change-from-a-table', object: 'rate-of-change-two-rows',
      stimulus: { kind: 'table', title: 'Recorded totals', rows: xs.map((x, i) => [String(x), String(ys[i])]), sharable: true },
      stem: `The table shows a recorded total at three times. What is the average rate of change between the first and last rows?`,
      cost: 3, mechanism: { repr_switch: 1, abstraction: 1 },
      fingerprintParts: FP('stimulus:table shared', ['read-two-rows', 'divide-the-changes'], 'value:rate',
        'rate-vs-total-slips', ['D1', 'D3', 'D5'], 'three-row-table', ['times', 'totals']) });
  },

  'weighted-mean-frequency': (rand) => {
    const vals = [1, 2, 3, 4];
    const f = vals.map(() => rand.int(1, 6));
    const n = f.reduce((a, b) => a + b, 0), sum = vals.reduce((a, v, i) => a + v * f[i], 0);
    // A weighted mean is a rational. Demanding a whole one rejected 60 of 60.
    const key = Q(sum, n), s1 = Q(5, 2), s2 = Q(n, 4), s3 = Q(vals[f.indexOf(Math.max(...f))]);
    if ([s1, s2, s3].some(v => qEq(v, key)) || qEq(s1, s2) || qEq(s1, s3) || qEq(s2, s3))
      return { error: 'two options coincide' };
    if (qNum(s1) <= qNum(key) / 3 || qNum(s1) >= qNum(key) * 3) return { error: 'no distractor is near the key' };
    return OK(rand, key, [
      { name: 'averaged-the-values-ignoring-the-frequencies', value: s1, cost: 2 },
      { name: 'averaged-the-frequencies-instead', value: s2, cost: 2 },
      { name: 'reported-the-most-frequent-value', value: s3, cost: 1 },
    ], { family: 'A13', construct: 'mean-from-a-frequency-table', object: 'weighted-mean-frequency',
      stimulus: { kind: 'table', title: 'Value and frequency', rows: vals.map((v, i) => [String(v), String(f[i])]), sharable: true },
      stem: `The table shows how often each value was recorded. What is the mean of the recorded values?`,
      cost: 4, mechanism: { repr_switch: 1, abstraction: 1 },
      fingerprintParts: FP('stimulus:table shared', ['weight-each-value', 'total', 'divide-by-the-count'], 'value:mean',
        'weighting-slips', ['D2', 'D2', 'D6'], 'value-frequency-table', ['frequencies']) });
  },

  'whole-sum-then-percent': (rand) => {
    // The bar heights are built FROM the percentages, so the answer is a whole
    // percent by construction. Sampling heights and testing divisibility
    // rejected 51 of 60 seeds and biased the survivors toward round totals.
    const p1 = rand.int(2, 6) * 5, p2 = rand.int(2, 6) * 5, p3 = 100 - p1 - p2;
    if (p3 < 15 || p1 === p2 || p2 === p3 || p1 === p3) return { error: 'the shares are degenerate' };
    const u = rand.int(1, 5), pcts = [p1, p2, p3], v = pcts.map(x => x * u);
    const t = 100 * u, i = rand.int(0, 2), key = pcts[i];
    const s1 = v[i], s2 = Q(key * 100, 100 - key), s3 = 100 - key;
    if ([s1, s3].some(x => x === key) || qEq(s2, Q(key)) || s1 === s3 || qEq(s2, Q(s1)) || qEq(s2, Q(s3)))
      return { error: 'two options coincide' };
    return OK(rand, Q(key), [
      { name: 'used-the-other-categories-as-the-base', value: s2, cost: 2 },
      { name: 'reported-the-complement', value: Q(s3), cost: 2 },
      { name: 'reported-the-raw-count', value: Q(s1), cost: 1 },
    ], { family: 'A13', construct: 'total-then-percent-of-a-category', object: 'whole-sum-then-percent',
      stimulus: { kind: 'bar-chart', title: 'Deliveries by region', categories: REGIONS3, values: v, sharable: true },
      stem: `The bar chart shows deliveries in three regions. What percent of all deliveries were made in the ${REGIONS3[i]} region?`,
      cost: 4, mechanism: { repr_switch: 1, abstraction: 1 },
      fingerprintParts: FP('stimulus:bar-chart shared', ['total-every-bar', 'divide-the-named-bar', 'convert-to-percent'],
        'value:percent', 'base-confusions', ['D3', 'D3', 'D6'], 'three-category-display', ['bar-values']) });
  },
};

/* ─────────────── A14 — statistics ─────────────── */

export const A14_ASKS = {
  'interquartile-range': (rand) => {
    const base = rand.int(2, 9);
    const d = [base, base + rand.int(1, 3), base + rand.int(4, 6), base + rand.int(7, 9),
               base + rand.int(10, 12), base + rand.int(13, 15), base + rand.int(16, 18), base + rand.int(19, 21)];
    if (new Set(d).size !== 8) return { error: 'a repeated value blurs the quartiles' };
    // A quartile of an eight-value list is a half-integer. Rejecting the odd
    // ones threw away 48 of 60 seeds and quietly biased the surviving lists.
    const key = Q(d[5] + d[6] - d[1] - d[2], 2), s1 = Q(d[7] - d[0]);
    const s2 = Q(d[3] + d[4], 2), s3 = Q(d[5] + d[6], 2);
    if ([s1, s2, s3].some(v => qEq(v, key)) || qEq(s1, s2) || qEq(s1, s3) || qEq(s2, s3))
      return { error: 'two options coincide' };
    if (qNum(s1) <= qNum(key) / 3 || qNum(s1) >= qNum(key) * 3) return { error: 'no distractor is near the key' };
    return OK(rand, key, [
      { name: 'reported-the-full-range', value: s1, cost: 1 },
      { name: 'reported-the-median', value: s2, cost: 2 },
      { name: 'reported-the-upper-quartile', value: s3, cost: 2 },
    ], { family: 'A14', construct: 'interquartile-range', object: 'interquartile-range',
      stimulus: { kind: 'data-list', title: 'Recorded values', values: d, sharable: true },
      stem: `The list shows eight recorded values in increasing order. What is the interquartile range?`,
      cost: 4, mechanism: { repr_switch: 1, abstraction: 1 },
      fingerprintParts: FP('stimulus:data-list shared', ['split-the-list-in-half', 'find-each-quartile', 'subtract'],
        'value:iqr', 'spread-statistic-confusions', ['D6', 'D6', 'D6'], 'eight-value-list', ['values']) });
  },

  'residual-actual-vs-predicted': (rand) => {
    const m = rand.int(2, 6), b = rand.nonZero(-9, 9), x = rand.int(2, 9);
    const pred = m * x + b, res = rand.nonZero(-8, 8), act = pred + res;
    const s1 = -res, s2 = pred, s3 = act;
    if ([s1, s2, s3].some(v => v === res) || s1 === s2 || s1 === s3 || s2 === s3) return { error: 'two options coincide' };
    return OK(rand, Q(res), [
      { name: 'subtracted-in-the-wrong-order', value: Q(s1), cost: 1 },
      { name: 'reported-the-predicted-value', value: Q(s2), cost: 2 },
      { name: 'reported-the-actual-value', value: Q(s3), cost: 2 },
    ], { family: 'A14', construct: 'residual-from-a-model', object: 'residual-actual-vs-predicted',
      stem: `A line of best fit is given by $y = ${coef(m, 'x')} ${term(b, '')}$. At $x = ${x}$ the actual value of $y$ is ${act}. ` +
            `What is the residual at $x = ${x}$?`,
      cost: 2, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('statistics no-stimulus', ['evaluate-the-model', 'subtract-from-the-actual'], 'value:residual',
        'order-of-subtraction-slips', ['D3', 'D6', 'D6'], 'symbols-only:best-fit-line', ['slope', 'intercept', 'input', 'actual']) });
  },
};

/* ─────────────── A15 — probability & counting ─────────────── */

export const A15_ASKS = {
  'expected-value': (rand) => {
    const d = rand.pick([2, 4, 5]), hi = rand.int(4, 12), lo = rand.int(1, 3);
    const key = Q(hi + (d - 1) * lo, d);
    const s1 = Q(hi + lo, 2), s2 = Q(hi), s3 = Q(lo);
    if ([s1, s2, s3].some(v => qEq(v, key)) || qEq(s1, s2) || qEq(s1, s3) || qEq(s2, s3)) return { error: 'two options coincide' };
    if (qNum(s1) <= qNum(key) / 3 || qNum(s1) >= qNum(key) * 3) return { error: 'no distractor is near the key' };
    return OK(rand, key, [
      { name: 'averaged-the-two-payouts', value: s1, cost: 2 },
      { name: 'reported-the-larger-payout', value: s2, cost: 1 },
      { name: 'reported-the-smaller-payout', value: s3, cost: 1 },
    ], { family: 'A15', construct: 'expected-value', object: 'expected-value',
      stem: `A game pays $${hi} with probability $\\dfrac{1}{${d}}$ and $${lo} otherwise. What is the expected payout, in dollars?`,
      cost: 3, mechanism: { abstraction: 1, nonobvious_rel: 1 },
      fingerprintParts: FP('probability no-stimulus', ['weight-each-payout-by-its-probability', 'total'], 'value:expectation',
        'unweighted-average-slips', ['D2', 'D6', 'D6'], 'words-plus-symbols:two-outcome-game', ['payout-high', 'payout-low', 'denominator']) });
  },

  'probability-number-property': (rand) => {
    const n = rand.pick([20, 24, 30, 36, 40]);
    const k = rand.pick([3, 4, 5, 6].filter(x => n % x === 0));
    const hits = n / k;
    // The off-by-one count is the near distractor and always is; the earlier
    // guard tested the COMPLEMENT for nearness and rejected 30 of 60 seeds for
    // a distractor that never had to be close.
    const key = Q(hits, n), s1 = Q(hits + 1, n), s2 = Q(1, k + 1), s3 = Q(n - hits, n);
    if ([s1, s2, s3].some(v => qEq(v, key)) || qEq(s1, s2) || qEq(s1, s3) || qEq(s2, s3)) return { error: 'two options coincide' };
    return OK(rand, key, [
      { name: 'counted-one-multiple-too-many', value: s1, cost: 2 },
      { name: 'used-the-wrong-divisor', value: s2, cost: 2 },
      { name: 'reported-the-complement', value: s3, cost: 1 },
    ], { family: 'A15', construct: 'probability-of-a-number-property', object: 'probability-number-property',
      stem: `An integer is selected at random from 1 to ${n}, inclusive. What is the probability that it is a multiple of ${k}?`,
      cost: 3, mechanism: { abstraction: 1, filtering: 1 },
      fingerprintParts: FP('probability no-stimulus', ['count-the-favourable-integers', 'divide-by-the-total'],
        'value:probability', 'counting-slips', ['D3', 'D3', 'D6'], 'words-only:integer-range', ['range', 'divisor']) });
  },

  'constrained-enumeration': (rand) => {
    const s = rand.int(4, 12);
    const key = [...Array(90).keys()].map(i => i + 10)
      .filter(v => Math.floor(v / 10) + (v % 10) === s).length;
    // For a digit sum below ten the count IS the digit sum, so "reported the
    // digit sum" was the key on every such seed. The third slip counts each
    // digit pair in both orders instead.
    const s1 = key + 1, s2 = key - 1, s3 = 2 * key;
    if (key < 3 || [s1, s2, s3].some(v => v === key) || s1 === s2 || s1 === s3 || s2 === s3) return { error: 'two options coincide' };
    return OK(rand, Q(key), [
      { name: 'counted-a-leading-zero-as-a-two-digit-number', value: Q(s1), cost: 2 },
      { name: 'missed-the-largest-case', value: Q(s2), cost: 2 },
      { name: 'counted-each-digit-pair-in-both-orders', value: Q(s3), cost: 1 },
    ], { family: 'A15', construct: 'enumerate-under-a-constraint', object: 'constrained-enumeration',
      stem: `How many two-digit positive integers have digits that sum to ${s}?`,
      cost: 4, mechanism: { filtering: 1, abstraction: 1 },
      fingerprintParts: FP('counting no-stimulus', ['enumerate-the-digit-pairs', 'discard-the-invalid-leading-digit', 'count'],
        'value:count', 'boundary-case-slips', ['D3', 'D3', 'D6'], 'words-only:digit-constraint', ['digit-sum']) });
  },
};

/* ─────────────── A16 — geometry: angles & triangles ─────────────── */

export const A16_ASKS = {
  'angle-chase-parallel': (rand) => {
    const a = rand.int(4, 13) * 10;
    if (a === 90) return { error: 'a right angle makes every option coincide' };
    const key = 180 - a, s1 = a, s2 = 90 - a, s3 = 360 - a;
    if ([s1, s2, s3].some(v => v === key) || s1 === s2 || s1 === s3 || s2 === s3) return { error: 'two options coincide' };
    if (s1 <= key / 3 || s1 >= key * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(key), [
      { name: 'reported-the-corresponding-angle', value: Q(s1), cost: 1 },
      { name: 'used-the-complement', value: Q(s2), cost: 2 },
      { name: 'used-a-full-turn', value: Q(s3), cost: 2 },
    ], { family: 'A16', construct: 'co-interior-angle', object: 'angle-chase-parallel',
      stem: `Two parallel lines are cut by a transversal. One of the angles formed measures ${a}$^\\circ$. ` +
            `What is the measure, in degrees, of the co-interior angle on the same side of the transversal?`,
      cost: 2, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('geometry no-stimulus', ['identify-the-angle-pair', 'apply-the-supplementary-relation'],
        'value:angle', 'angle-pair-confusions', ['D3', 'D3', 'D3'], 'words-only:parallel-lines', ['given-angle']) });
  },

  'angle-chase-two-variables': (rand) => {
    // The ratio parts are chosen so their total divides 180; sampling them and
    // testing divisibility afterwards rejected 28 of 60 seeds.
    // The ratio total divides 180, the largest part is strictly largest, and the
    // middle part is within a factor of three of it — that middle angle is the
    // near distractor, and picking the parts freely lost it on 17 of 60 seeds.
    const sum = rand.pick([4, 6, 9, 10, 12, 15, 18, 20]);
    const loMid = Math.ceil(sum / 4), hiMid = Math.floor((sum - 2) / 2);
    if (loMid > hiMid) return { error: 'no middle part keeps the largest angle in range' };
    const mid = rand.int(loMid, hiMid);
    const r = [1, mid, sum - 1 - mid];
    const u = 180 / sum, key = r[2] * u, s1 = r[1] * u, s2 = r[0] * u, s3 = 180;
    if ([s1, s2, s3].some(v => v === key) || s1 === s2 || s1 === s3 || s2 === s3) return { error: 'two options coincide' };
    if (s1 <= key / 3 || s1 >= key * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(key), [
      { name: 'reported-the-middle-angle', value: Q(s1), cost: 1 },
      { name: 'reported-the-smallest-angle', value: Q(s2), cost: 2 },
      { name: 'reported-the-angle-sum', value: Q(s3), cost: 1 },
    ], { family: 'A16', construct: 'angles-in-a-given-ratio', object: 'angle-chase-two-variables',
      stem: `The three angles of a triangle measure $x^\\circ$, $${coef(r[1], 'x')}^\\circ$ and $${coef(r[2], 'x')}^\\circ$. ` +
            `What is the measure, in degrees, of the largest angle?`,
      cost: 3, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('geometry no-stimulus', ['sum-the-multiples-of-x', 'solve-for-x', 'scale-the-largest'],
        'value:angle', 'which-angle-slips', ['D5', 'D5', 'D6'], 'symbols-only:triangle-ratio', ['ratio']) });
  },

  'similar-right-triangles-altitudes': (rand) => {
    const [a, b, c] = rand.pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17]]);
    // ab/c is a whole number for none of the Pythagorean triples a paper uses,
    // which is why the integer version yielded 0/60. It is an exact rational.
    const key = Q(a * b, c), s1 = Q(c, 2), s2 = Q(a + b, 2), s3 = Q(a * b, 2);
    if ([s1, s2, s3].some(v => qEq(v, key)) || qEq(s1, s2) || qEq(s1, s3) || qEq(s2, s3))
      return { error: 'two options coincide' };
    if (qNum(s1) <= qNum(key) / 3 || qNum(s1) >= qNum(key) * 3) return { error: 'no distractor is near the key' };
    return OK(rand, key, [
      { name: 'halved-the-hypotenuse', value: s1, cost: 2 },
      { name: 'averaged-the-legs', value: s2, cost: 2 },
      { name: 'reported-the-area', value: s3, cost: 1 },
    ], { family: 'A16', construct: 'altitude-to-the-hypotenuse', object: 'similar-right-triangles-altitudes',
      stem: `A right triangle has legs of length ${a} and ${b} and hypotenuse of length ${c}. ` +
            `What is the length of the altitude drawn to the hypotenuse?`,
      cost: 4, mechanism: { abstraction: 1, nonobvious_rel: 1 },
      fingerprintParts: FP('geometry no-stimulus', ['compute-the-area-two-ways', 'solve-for-the-altitude'], 'value:length',
        'wrong-formula-slips', ['D3', 'D3', 'D6'], 'words-only:right-triangle', ['leg-a', 'leg-b', 'hypotenuse']) });
  },
};

/* ─────────────── A17 — geometry: circles, area & volume ─────────────── */

export const A17_ASKS = {
  'square-from-diagonal': (rand) => {
    const d = rand.int(2, 12) * 2, key = d * d / 2;
    const s1 = d * d, s2 = Math.round(d * d / 4), s3 = 2 * d;
    if (!Number.isInteger(d * d / 4) || [s1, s2, s3].some(v => v === key) || s1 === s2 || s1 === s3 || s2 === s3)
      return { error: 'two options coincide' };
    if (s1 <= key / 3 || s1 >= key * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(key), [
      { name: 'squared-the-diagonal', value: Q(s1), cost: 1 },
      { name: 'used-half-the-diagonal-as-the-side', value: Q(s2), cost: 2 },
      { name: 'reported-the-perimeter-of-the-diagonal-square', value: Q(s3), cost: 2 },
    ], { family: 'A17', construct: 'area-of-a-square-from-its-diagonal', object: 'square-from-diagonal',
      stem: `A square has a diagonal of length ${d}. What is the area of the square?`,
      cost: 3, mechanism: { abstraction: 1, nonobvious_rel: 1 },
      fingerprintParts: FP('geometry no-stimulus', ['relate-the-diagonal-to-the-side', 'square-the-side'], 'value:area',
        'diagonal-vs-side-slips', ['D1', 'D3', 'D6'], 'words-only:square', ['diagonal']) });
  },

  'cone-slant-vs-height': (rand) => {
    const [r, h, l] = rand.pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17]]);
    const s1 = l - r, s2 = l, s3 = r;
    if ([s1, s2, s3].some(v => v === h) || s1 === s2 || s1 === s3 || s2 === s3) return { error: 'two options coincide' };
    if (s1 <= h / 3 || s1 >= h * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(h), [
      { name: 'subtracted-the-radius-from-the-slant', value: Q(s1), cost: 1 },
      { name: 'reported-the-slant-height', value: Q(s2), cost: 2 },
      { name: 'reported-the-radius', value: Q(s3), cost: 2 },
    ], { family: 'A17', construct: 'cone-height-from-slant', object: 'cone-slant-vs-height',
      stem: `A right circular cone has a base radius of ${r} and a slant height of ${l}. What is the height of the cone?`,
      cost: 3, mechanism: { abstraction: 1, repr_switch: 1 },
      fingerprintParts: FP('geometry no-stimulus', ['identify-the-right-triangle', 'apply-the-pythagorean-relation'],
        'value:length', 'slant-vs-height-slips', ['D3', 'D6', 'D6'], 'words-only:cone', ['radius', 'slant']) });
  },

  'parallelogram-centre-midpoint': (rand) => {
    const a = rand.int(2, 9), b = rand.nonZero(-8, 8), c = rand.int(2, 9);
    const key = a + b;
    if (key === 0 || [a - b, b, a].some(v => v === key) || a - b === b || a - b === a) return { error: 'two options coincide' };
    if (Math.abs(a) <= Math.abs(key) / 3 || Math.abs(a) >= Math.abs(key) * 3) return { error: 'no distractor is near the key' };
    return OK(rand, Q(key), [
      { name: 'subtracted-the-two-coordinates', value: Q(a - b), cost: 2 },
      { name: 'reported-the-third-vertex-coordinate', value: Q(b), cost: 1 },
      { name: 'reported-the-second-vertex-coordinate', value: Q(a), cost: 1 },
    ], { family: 'A17', construct: 'fourth-vertex-of-a-parallelogram', object: 'parallelogram-centre-midpoint',
      stem: `Three vertices of a parallelogram are $(0, 0)$, $(${a}, 0)$ and $(${b}, ${c})$. ` +
            `What is the $x$-coordinate of the fourth vertex, the one opposite $(0, 0)$?`,
      cost: 3, mechanism: { abstraction: 1, nonobvious_rel: 1 },
      fingerprintParts: FP('coordinate-geometry no-stimulus', ['match-the-diagonal-midpoints', 'solve-for-the-missing-vertex'],
        'value:coordinate', 'vertex-confusions', ['D3', 'D5', 'D5'], 'symbols-only:three-vertices', ['x-b', 'x-c', 'y-c']) });
  },
};

/* ─────────────── A18 — number properties & logic ─────────────── */

export const A18_ASKS = {
  'absolute-value-nested-count': (rand) => {
    const c = rand.int(2, 9), o = rand.int(2, 6), i = rand.int(1, o - 1);
    if (i >= o || i === 0) return { error: 'the inner offset must be smaller than the outer' };
    const key = 4, s1 = 2, s2 = 3, s3 = 1;                  // four solutions when 0 < i < o
    return OK(rand, Q(key), [
      { name: 'unpacked-only-the-outer-absolute-value', value: Q(s1), cost: 2 },
      { name: 'lost-one-branch-to-a-sign-slip', value: Q(s2), cost: 2 },
      { name: 'solved-as-if-there-were-no-absolute-values', value: Q(s3), cost: 1 },
    ], { family: 'A18', construct: 'count-solutions-of-a-nested-absolute-value', object: 'absolute-value-nested-count',
      stem: `How many values of $x$ satisfy $\\bigl| |x - ${c}| - ${o} \\bigr| = ${i}$?`,
      cost: 4, mechanism: { abstraction: 1, filtering: 1 },
      fingerprintParts: FP('absolute-value no-stimulus', ['unpack-the-outer-absolute-value', 'unpack-each-inner-branch', 'count'],
        'value:count', 'branch-count-slips', ['D3', 'D3', 'D6'], 'symbols-only:nested-absolute-value', ['centre', 'outer', 'inner']) });
  },
};

/** The asks grouped the way the assembler draws them: by blueprint family. */
export const VOCAB_BY_FAMILY = {
  A01: Object.values(A01_ASKS),
  A02: Object.values(A02_ASKS),
  A03: Object.values(A03_ASKS),
  A04: Object.values(A04_ASKS),
  A05: Object.values(A05_ASKS),
  A06: [...Object.values(A06_ASKS), ...Object.values(A06_ASKS_2)],
  A07: Object.values(A07_ASKS),
  A08: Object.values(A08_ASKS),
  A09: Object.values(A09_ASKS),
  A10: [...Object.values(A10_ASKS), ...Object.values(A10_ASKS_2)],
  A11: Object.values(A11_ASKS),
  A12: Object.values(A12_ASKS),
  A13: Object.values(A13_ASKS),
  A14: Object.values(A14_ASKS),
  A15: Object.values(A15_ASKS),
  A16: Object.values(A16_ASKS),
  A17: Object.values(A17_ASKS),
  A18: Object.values(A18_ASKS),
};

export const VOCAB_ASKS = {
  ...A06_ASKS, ...A10_ASKS, ...A08_ASKS,
  ...A01_ASKS, ...A02_ASKS, ...A03_ASKS, ...A04_ASKS, ...A05_ASKS, ...A06_ASKS_2,
  ...A07_ASKS, ...A09_ASKS, ...A10_ASKS_2, ...A11_ASKS, ...A12_ASKS, ...A13_ASKS,
  ...A14_ASKS, ...A15_ASKS, ...A16_ASKS, ...A17_ASKS, ...A18_ASKS,
};

// A merged object silently overwriting an earlier one is the defect that has
// already happened twice in this project — six non-value variants overwrote
// five live entries, and `fraction-grind` overwrote an exponent object. The
// spread above cannot be trusted to be disjoint just because it looks it.
{
  const groups = { A06_ASKS, A10_ASKS, A08_ASKS, A01_ASKS, A02_ASKS, A03_ASKS, A04_ASKS, A05_ASKS,
    A06_ASKS_2, A07_ASKS, A09_ASKS, A10_ASKS_2, A11_ASKS, A12_ASKS, A13_ASKS, A14_ASKS, A15_ASKS,
    A16_ASKS, A17_ASKS, A18_ASKS };
  const total = Object.values(groups).reduce((n, g) => n + Object.keys(g).length, 0);
  if (total !== Object.keys(VOCAB_ASKS).length)
    throw new Error(`VOCAB_ASKS lost ${total - Object.keys(VOCAB_ASKS).length} ask(s) to a duplicate key`);
  // The family grouping is what the assembler actually draws from. If it and
  // the flat map ever disagree, the asks in the gap are library capability that
  // no slot can reach — the exact failure section 4 of the series analysis is
  // about, and it would otherwise be invisible.
  const grouped = Object.values(VOCAB_BY_FAMILY).reduce((n, g) => n + g.length, 0);
  if (grouped !== total) throw new Error(`VOCAB_BY_FAMILY holds ${grouped} asks, VOCAB_ASKS ${total}`);
}
