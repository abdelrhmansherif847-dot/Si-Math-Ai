// The mathematical-object layer — Primitive Coverage Revision.
//
// WHY A LAYER ABOVE THE FINGERPRINT
//
// The seven-axis fingerprint compares STRUCTURE and the content detector
// compares SURFACE. Neither can see that a form asks the remainder theorem
// three times. ESTM2-2026-P2 did exactly that (artifact 19, defect D4): a
// non-monic divisor from P-NORMALISE, a composed classification-then-remainder,
// and a routine evaluation — three sub-forms, three fingerprints, three option
// grids, one MATHEMATICAL OBJECT. Defects D2, D3, D4, D6 and D7 are all that
// same shape.
//
// The reference says what the standard is, and it is not a matter of taste.
// Artifact 2 §3 names the archetype of every one of the 200 coded items:
// 189 distinct objects in 200 items, and artifact 1 §9 measured the per-form
// consequence — 49, 49, 50 and 50 distinct archetypes in 50 items. A real form
// asks each object ONCE. The corpus repeats the remainder theorem across three
// of four forms and never twice inside one.
//
// WHAT COUNTS AS A DIFFERENT OBJECT
//
// A construct earns a new object id only when it changes the mathematical
// object, the reasoning route, the representation, or the decision point.
// Renamed variables, different constants, reordered options, an equivalent
// algebraic form and a recoloured display are the SAME object and share an id.
// That is why `compound-growth` and `compound-two-years` share
// `compound-interest-forward`, and why the three remainder items share
// `remainder-theorem` — they fingerprint apart and they teach the same thing.
//
// This file therefore does two things:
//
//   1. carries the reference vocabulary, so coverage can be MEASURED rather
//      than asserted — how many of the 189 objects the generator can produce,
//      per family;
//   2. maps every generator construct to the object it produces, so a form can
//      be held to the corpus's own one-per-form standard.
//
// No exam content is here. These are archetype NAMES from a document already in
// this repository, and the generator-side ids are our own.

/** The reference object vocabulary, extracted from artifact 2 §3. */
export const REFERENCE_OBJECTS = {
  A01: { name: 'Linear equations & solving', items: 11, objects: [
    'chained-substitution', 'fraction-equation-solve', 'linear-composite', 'linear-solve',
    'linear-verbal-substitution', 'literal-system', 'multi-step-linear-distribute',
    'no-solution-parameter', 'scale-equation-composite', 'translate-composite-target' ] },
  A02: { name: 'Modelling: build the expression', items: 7, objects: [
    'literal-formula-rearrange', 'model-build-absvalue', 'model-build-equation',
    'proportion-rearrange' ] },
  A03: { name: 'Systems of equations', items: 7, objects: [
    'infinite-solutions-identify', 'parametric-system-symbolic', 'system-composite-product',
    'system-composite-target', 'system-one-coordinate', 'two-price-system-money',
    'two-purchase-system-third-bundle' ] },
  A04: { name: 'Inequalities', items: 11, objects: [
    'absvalue-interval-max', 'compound-ineq-composite-integer',
    'compound-inequality-point-test', 'inequality-from-graph',
    'inequality-intersection-unique', 'inequality-smallest-integer',
    'inequality-system-quadrant', 'inequality-translate-test',
    'quadratic-inequality-numberline' ] },
  A05: { name: 'Lines in the plane', items: 12, objects: [
    'collinear-points', 'line-two-points-xintercept', 'linear-table-two-unknowns',
    'parallel-parameters-composite', 'parallel-slope-standard-form',
    'param-from-point-then-slope', 'perpendicular-parameters-composite',
    'perpendicular-through-midpoint', 'slope-nonstandard-form', 'table-linear-missing' ] },
  A06: { name: 'Quadratics & parabolas', items: 16, objects: [
    'absvalue-select-positive-root', 'axis-of-symmetry-parameter', 'curve-line-select-root',
    'line-parabola-intersection', 'parabola-inscribed-square', 'parameters-from-roots',
    'product-of-roots', 'quadratic-range', 'quadratic-through-three-points',
    'roots-ordered-select', 'sum-of-roots', 'tangent-at-vertex-concept', 'vertex-abscissa',
    'vertex-form-complete-square', 'vertex-paraphrased' ] },
  A07: { name: 'Polynomials & factoring', items: 10, objects: [
    'biquadratic-product-roots', 'coefficient-matching-identity', 'cubic-factors-sum-roots',
    'cubic-real-solution-count', 'divisibility-remainder-parameter', 'factor-polynomial',
    'remainder-theorem', 'remainder-theorem-composite', 'targeted-coefficient-extract' ] },
  A08: { name: 'Rational expressions & functions', items: 9, objects: [
    'asymptote-count', 'complex-fraction-simplify', 'inverse-function-rational',
    'inverse-value-evaluate', 'inverse-vs-reciprocal', 'range-of-rational',
    'rational-equation-composite', 'rational-expression-simplify', 'rational-undefined' ] },
  A09: { name: 'Functions: composition & evaluation', items: 11, objects: [
    'absvalue-graph-identify', 'composite-eval-difference', 'composition-evaluate',
    'function-eval', 'function-of-function-eval', 'graph-roman-numeral',
    'multi-curve-graph-sum', 'multi-valued-can-be', 'symbolic-composition',
    'table-from-function-value', 'which-student-multi-claim' ] },
  A10: { name: 'Exponents, radicals & complex numbers', items: 11, objects: [
    'complex-number-composite', 'exponent-common-base', 'exponent-equation-composite',
    'exponent-law-substitution', 'exponent-laws-simplify', 'exponent-radical-equation',
    'radical-equation-parameter', 'radical-index-simplify', 'radical-simplify-cancels-zero',
    'radicals-sign-constrained', 'substitute-into-radical' ] },
  A11: { name: 'Growth & variation', items: 7, objects: [
    'compound-interest-forward', 'compound-interest-reverse', 'direct-variation-square',
    'direct-variation-transformed', 'exponential-growth-offbyone',
    'inverse-variation-composite', 'linear-extrapolation-daycount' ] },
  A12: { name: 'Percentages & proportional reasoning', items: 13, objects: [
    'backwards-fraction-chain', 'budget-integer-floor', 'composed-percentage-chain',
    'conditional-branch-word', 'fixed-overhead-integer-floor', 'fixed-plus-rate-total',
    'fixed-plus-variable-compare', 'percent-change-base', 'percent-increase-simple',
    'percent-with-wrong-flip', 'ratio-three-part-largest', 'reverse-percentage',
    'two-condition-rate-word' ] },
  A13: { name: 'Data: read a display', items: 30, objects: [
    'aggregate-over-groups', 'bar-compare-single', 'bar-multi-condition-scan',
    'bar-percent-to-other-category', 'bar-read-single', 'causal-inference-no-calc',
    'event-anchored-series-scan', 'graph-comprehension-axes', 'graph-read-multi-step-rate',
    'grouped-bar-aggregate', 'mean-of-subset-ordering-trap', 'ordinal-row-reference-percent',
    'parameter-interpret', 'parameter-interpret-constant', 'parameter-interpret-intercept',
    'parameter-interpret-rate', 'percent-change-direction-base', 'percent-decrease-two-series',
    'physics-graph-unit-conversion', 'pie-percent-to-count-diff', 'pie-ratio-on-remainder',
    'qualitative-claim-eval', 'rate-of-change-two-rows', 'read-then-percent-scaled',
    'scaled-axis-read', 'two-model-intersection-read', 'two-way-table-denominator',
    'weighted-mean-frequency', 'whole-sum-then-percent' ] },
  A14: { name: 'Statistics: summarise a data set', items: 12, objects: [
    'best-fit-slope-read', 'cumulative-frequency-mode', 'interquartile-range',
    'line-graph-mean', 'mean-from-table', 'mean-to-target', 'mean-with-added-element',
    'measure-of-centre-compare', 'residual-actual-vs-predicted', 'scatter-column-sum-range',
    'scatter-trend-plausibility', 'stem-and-leaf-median' ] },
  A15: { name: 'Probability & counting', items: 9, objects: [
    'constrained-enumeration', 'counting-perm-vs-comb', 'expected-value',
    'prob-complement-no-replacement', 'prob-inclusion-exclusion-half',
    'prob-replacement-order-grid', 'probability-number-property', 'probability-squared-target',
    'symbolic-counting-formula' ] },
  A16: { name: 'Geometry: angles & triangles', items: 9, objects: [
    'always-true-parallel-angles', 'angle-chase-algebraic', 'angle-chase-parallel',
    'angle-chase-two-variables', 'similar-right-triangles-altitudes',
    'similar-triangles-parallel-composite', 'special-triangle-45', 'trig-costumed-algebra',
    'trig-ratio-composite-figure' ] },
  A17: { name: 'Geometry: circles, area & solids', items: 9, objects: [
    'circle-centre-point-diameter', 'circle-circumference-from-grid', 'circle-inside-boundary',
    'circle-roman-numeral', 'cone-slant-vs-height', 'coordinate-rectangle-rotated',
    'parallelogram-centre-midpoint', 'prism-volume-ratio-dimension', 'square-from-diagonal' ] },
  A18: { name: 'Number properties & logic', items: 6, objects: [
    'absolute-value-nested-count', 'consecutive-integers-sum', 'roman-numeral-properties',
    'roman-numeral-sign-reasoning', 'sum-product-then-half-greater', 'vertical-line-roman' ] },
};
/**
 * Which reference object each generator construct produces.
 *
 * Keyed by `stream:construct`, which is how the assembler names a structure.
 * A value of `null` means the construct produces something the reference
 * vocabulary does not name — it is not a defect, but it is not coverage of the
 * corpus either, and it is counted separately.
 *
 * SHARED IDS ARE THE POINT. Three constructs map to `remainder-theorem` and two
 * to `compound-interest-forward`. They fingerprint apart, they print different
 * numbers and different option grids, and a student meets the same mathematics.
 * That is what the per-form rule below is for.
 */
export const CONSTRUCT_OBJECT = {
  // A01 — linear equations & solving
  'routine:solve-linear': 'linear-solve',
  'routine:solve-product-coefficient': 'multi-step-linear-distribute',
  'core:multiple-of-the-solution': 'scale-equation-composite',
  'mechanism:existence-of-solutions': 'no-solution-parameter',
  // A02 — modelling
  'routine:build-linear-model': 'model-build-equation',
  'routine:translate-comparison': 'model-build-equation',
  'core:tariff-after-a-free-allowance': 'fixed-plus-rate-total',
  // A03 — systems
  'routine:solve-2x2-system': 'system-one-coordinate',
  'mechanism:sum-difference': 'system-composite-target',
  'core:equivalent-quadratic-expression': 'targeted-coefficient-extract',
  'composed:axis_scale|sum-difference': 'system-composite-product',
  // A04 — inequalities
  'routine:budget-inequality': 'budget-integer-floor',
  'routine:count-integer-solutions': 'compound-ineq-composite-integer',
  'routine:inequality-boundary': 'inequality-smallest-integer',
  'mechanism:inequality-direction': 'inequality-translate-test',
  'core:least-whole-number-to-clear-a-threshold': 'fixed-overhead-integer-floor',
  // A05 — lines
  'routine:slope-from-two-points': 'slope-nonstandard-form',
  'routine:intercept-from-point-and-slope': 'param-from-point-then-slope',
  'mechanism:ratio-parameter': 'parallel-parameters-composite',
  'core:x-intercept-of-a-line': 'line-two-points-xintercept',
  'core:point-on-a-line': 'collinear-points',
  // A06 — quadratics
  'routine:discriminant': null,
  'routine:sum-of-roots': 'sum-of-roots',
  'routine:vertex-x-from-vertex-form': 'vertex-abscissa',
  'mechanism:vertex_form': 'vertex-form-complete-square',
  'core:positive-root-of-a-quadratic': 'absvalue-select-positive-root',
  // A07 — polynomials
  'routine:evaluate-factored-form': 'factor-polynomial',
  'mechanism:non_monic_divisor': 'remainder-theorem',
  'core:remainder-theorem': 'remainder-theorem',
  'composed:existence-of-solutions|non_monic_divisor': 'remainder-theorem-composite',
  // A08 — rational
  'routine:excluded-value': 'rational-undefined',
  'routine:simplify-then-evaluate': 'rational-expression-simplify',
  'core:proportion-with-an-offset': 'proportion-rearrange',
  // A09 — functions
  'routine:evaluate-composition': 'composition-evaluate',
  'routine:inverse-value': 'inverse-value-evaluate',
  'routine:rate-of-change-from-values': null,
  'mechanism:shared_terms_cancel': 'composite-eval-difference',
  'core:composition-order': 'function-of-function-eval',
  // A10 — exponents & radicals
  'routine:exponent-quotient': 'exponent-laws-simplify',
  'routine:claim-about-a-chart': 'causal-inference-no-calc',
  'routine:claim-about-a-list': 'scatter-trend-plausibility',
  'routine:median-of-a-chart': 'cumulative-frequency-mode',
  'routine:median-of-a-table': 'measure-of-centre-compare',
  'routine:fraction-grind': null,
  'mechanism:mixed_base': 'exponent-common-base',
  'mechanism:coefficients_sum_zero': 'radical-simplify-cancels-zero',
  // A11 — growth & variation
  'routine:compound-growth': 'compound-interest-forward',
  'core:compound-two-years': 'compound-interest-forward',
  'core:inverse-variation': 'inverse-variation-composite',
  // A12 — percentages & proportional reasoning
  'routine:percentage-of-total': 'percent-increase-simple',
  'routine:unit-rate-scale-up': null,
  'routine:chained-unit-conversion': null,
  'core:combined-rate': 'two-condition-rate-word',
  'core:successive-percentages': 'composed-percentage-chain',
  'mechanism:rate_denominator': null,
  'mechanism:period_index': null,
  'mechanism:axis_scale': null,
  'mechanism:si_prefix': null,
  'mechanism:residual_referent': 'backwards-fraction-chain',
  // A13 — data displays
  'routine:read-bar-argmax': 'bar-compare-single',
  'routine:read-bar-difference': 'bar-compare-single',
  'routine:read-bar-total': 'aggregate-over-groups',
  'routine:read-bar-percent-change': 'percent-change-direction-base',
  'routine:read-histogram-tail': 'bar-multi-condition-scan',
  'routine:read-line-graph-rate': 'graph-read-multi-step-rate',
  'routine:read-pie-slice': 'pie-percent-to-count-diff',
  'routine:read-table-cell': 'bar-read-single',
  'routine:read-table-ratio': 'ordinal-row-reference-percent',
  'core:largest-consecutive-pair': 'grouped-bar-aggregate',
  'core:share-a-table-total': 'two-way-table-denominator',
  'core:count-above-the-mean': 'mean-of-subset-ordering-trap',
  // A14 — statistics
  'routine:mean-of-a-list': 'line-graph-mean',
  'routine:median-of-a-list': 'stem-and-leaf-median',
  'routine:range-of-a-list': 'scatter-column-sum-range',
  'routine:total-from-mean': 'mean-to-target',
  'core:mean-after-one-more': 'mean-with-added-element',
  'core:mean-against-median': 'measure-of-centre-compare',
  'mechanism:partition_mean': 'mean-from-table',
  // A15 — probability & counting
  'routine:single-category-probability': null,
  'routine:unordered-selection-count': 'counting-perm-vs-comb',
  'routine:conditional-from-two-way-table': 'prob-replacement-order-grid',
  'core:two-draws-no-replacement': 'prob-complement-no-replacement',
  'core:codes-without-repetition': 'counting-perm-vs-comb',
  'mechanism:inclusion_exclusion': 'prob-inclusion-exclusion-half',
  // A16 — angles & triangles
  'routine:triangle-angle-sum': null,
  'mechanism:three_letter_angle': 'special-triangle-45',
  'core:exterior-angle-of-a-triangle': 'angle-chase-algebraic',
  // A17 — circles, area & solids
  'routine:circle-diameter-from-area': 'circle-centre-point-diameter',
  'routine:rectangular-solid-volume': 'prism-volume-ratio-dimension',
  'core:area-from-perimeter': null,
  'composed:three_letter_angle|aggregate_invariance': 'trig-ratio-composite-figure',
  // ── Primitive Coverage Revision: the non-value objects ──
  'mechanism:parameter_meaning': 'parameter-interpret-rate',
  'mechanism:claim_from_display': 'qualitative-claim-eval',
  'mechanism:axes_comprehension': 'graph-comprehension-axes',
  'mechanism:roman_properties': 'roman-numeral-properties',
  'mechanism:roman_conditions': 'roman-numeral-sign-reasoning',
  'mechanism:which_equation': 'perpendicular-parameters-composite',
  'mechanism:which_system': 'infinite-solutions-identify',
  'routine:equivalent-exponent-expression': 'exponent-laws-simplify',
  'routine:equivalent-rational-expression': 'rational-expression-simplify',
  'routine:rearrange-literal-formula': 'literal-formula-rearrange',
  'routine:absolute-value-interval': 'absvalue-interval-max',
  'routine:point-inside-a-circle': 'circle-inside-boundary',
  'routine:equation-from-its-roots': 'parameters-from-roots',
  // Stage 3.5's long-but-routine constructs, and the readers added with them
  'routine:claim-about-a-chart': 'causal-inference-no-calc',
  'routine:claim-about-a-list': 'scatter-trend-plausibility',
  'routine:median-of-a-chart': 'cumulative-frequency-mode',
  'routine:median-of-a-table': 'measure-of-centre-compare',
  'routine:fraction-grind': null,
  'routine:expand-and-collect': 'targeted-coefficient-extract',
  'routine:chained-unit-conversion': null,

  // A18 — number properties & logic
  'routine:arithmetic-sequence-total': null,
  'mechanism:aggregate_invariance': 'sum-product-then-half-greater',
  'core:consecutive-odd-integers': 'consecutive-integers-sum',
  'core:divisibility-consequence': 'roman-numeral-properties',

  // ══ Series-capacity library expansion (scripts/est-vocabulary.mjs) ══
  //
  // Every entry below is a reference archetype the library previously could not
  // build. They are registered here rather than derived from the module because
  // a derived map would have to invoke 62 builders at import time; the pairing
  // is held honest instead by tests/est-vocabulary.test.mjs, which builds every
  // ask and asserts its (construct, object) pair appears here exactly once.

  // ── Mechanism-stream expansion (scripts/est-mechanisms.mjs), Stage B ──
  // Placed where the family x band matrix measured exactly one object against
  // standing demand. Each names a reference archetype the library could not
  // build; none is a second name for something it already had.
  'mechanism:literal_system': 'literal-system',
  'mechanism:inequality_system_quadrant': 'inequality-system-quadrant',
  'mechanism:tangent_at_vertex': 'tangent-at-vertex-concept',
  'mechanism:parabola_inscribed_square': 'parabola-inscribed-square',
  'mechanism:multi_curve_sum': 'multi-curve-graph-sum',
  'mechanism:direct_variation_transformed': 'direct-variation-transformed',
  'mechanism:conditional_branch_word': 'conditional-branch-word',
  'mechanism:two_model_intersection': 'two-model-intersection-read',
  'mechanism:parameter_interpret_intercept': 'parameter-interpret-intercept',
  'mechanism:symbolic_counting_formula': 'symbolic-counting-formula',
  'mechanism:always_true_parallel_angles': 'always-true-parallel-angles',
  'mechanism:circle_roman_numeral': 'circle-roman-numeral',
  'mechanism:coordinate_rectangle_rotated': 'coordinate-rectangle-rotated',
  'mechanism:which_student_multi_claim': 'which-student-multi-claim',
  // A second STRUCTURE for A08, not a second object: the archetype is already
  // built as a routine construct. See the note in est-mechanisms.mjs.
  'mechanism:extraneous_root': 'rational-equation-composite',

  // ── Core-stream expansion (scripts/est-core-stream.mjs) ──
  // Placed where blueprint core-slot demand exceeded the stream's supply.
  'core:other-input-with-the-same-output': 'multi-valued-can-be',
  'core:count-real-solutions-of-a-cubic': 'cubic-real-solution-count',
  'core:inverse-of-a-shifted-reciprocal': 'inverse-function-rational',
  'core:real-part-of-a-square': 'complex-number-composite',
  'core:reverse-two-years-of-growth': 'compound-interest-reverse',
  'core:rise-then-fall-does-not-cancel': 'percent-with-wrong-flip',
  'core:slope-of-a-line-of-best-fit': 'best-fit-slope-read',
  'core:cosine-from-a-given-sine': 'trig-costumed-algebra',
  'core:circumference-from-two-points': 'circle-circumference-from-grid',
  'core:two-draws-with-replacement': 'probability-squared-target',
  'core:intercept-from-two-table-rows': 'linear-table-two-unknowns',
  'core:parameter-for-no-solution': 'parametric-system-symbolic',
  'core:sum-of-intersection-abscissae': 'curve-line-select-root',
  'core:solve-then-evaluate-a-different-expression': 'translate-composite-target',
  'core:parallel-cut-similar-triangles': 'similar-triangles-parallel-composite',
  'core:one-bar-as-a-percent-of-another': 'bar-percent-to-other-category',
  'core:percent-decrease-across-a-series': 'percent-decrease-two-series',
  'core:scaled-table-selected-rows': 'scaled-axis-read',
  // A01
  'routine:chained-substitution': 'chained-substitution',
  'routine:fraction-equation': 'fraction-equation-solve',
  'routine:solve-then-substitute': 'linear-composite',
  'routine:translate-then-solve': 'linear-verbal-substitution',
  // A02
  'routine:absolute-value-model': 'model-build-absvalue',
  // A03
  'routine:two-price-system': 'two-price-system-money',
  'routine:third-bundle': 'two-purchase-system-third-bundle',
  // A04
  'routine:point-test-count': 'compound-inequality-point-test',
  'routine:quadratic-inequality-count': 'quadratic-inequality-numberline',
  'routine:unique-integer-solution': 'inequality-intersection-unique',
  // A05
  'routine:slope-from-standard-form': 'parallel-slope-standard-form',
  'routine:perpendicular-bisector-slope': 'perpendicular-through-midpoint',
  'routine:complete-a-linear-table': 'table-linear-missing',
  // A06
  'routine:product-of-roots': 'product-of-roots',
  'routine:axis-of-symmetry': 'axis-of-symmetry-parameter',
  'routine:root-difference': 'roots-ordered-select',
  'routine:range-lower-bound': 'quadratic-range',
  'routine:intersection-abscissa-sum': 'line-parabola-intersection',
  'routine:parameters-from-roots': 'parameters-from-roots',
  'routine:least-value-of-a-parabola': 'vertex-paraphrased',
  'routine:fit-a-parabola-to-three-points': 'quadratic-through-three-points',
  // A07
  'routine:match-coefficients': 'coefficient-matching-identity',
  'routine:sum-of-roots-of-a-factored-cubic': 'cubic-factors-sum-roots',
  'routine:remainder-theorem-parameter': 'divisibility-remainder-parameter',
  'routine:product-of-roots-of-a-biquadratic': 'biquadratic-product-roots',
  // A08
  'routine:count-vertical-asymptotes': 'asymptote-count',
  'routine:inverse-not-reciprocal': 'inverse-vs-reciprocal',
  'routine:divide-two-fractions': 'complex-fraction-simplify',
  'routine:excluded-output': 'range-of-rational',
  'routine:clear-a-denominator': 'rational-equation-composite',
  // A09
  'routine:evaluate-a-quadratic-function': 'function-eval',
  'routine:compose-two-functions': 'symbolic-composition',
  'routine:reverse-read-a-function-table': 'table-from-function-value',
  // A10
  'routine:power-of-a-power': 'exponent-law-substitution',
  'routine:radical-index': 'radical-index-simplify',
  'routine:sign-constrained-root': 'radicals-sign-constrained',
  'routine:evaluate-radical-expression': 'substitute-into-radical',
  'routine:solve-a-radical-equation': 'exponent-radical-equation',
  'routine:equate-exponents-across-bases': 'exponent-equation-composite',
  'routine:radical-equation-with-a-parameter': 'radical-equation-parameter',
  // A11
  'routine:direct-variation-with-a-square': 'direct-variation-square',
  'routine:solve-for-the-day-count': 'linear-extrapolation-daycount',
  'routine:exponential-growth-step-count': 'exponential-growth-offbyone',
  // A12
  'routine:undo-a-percent-increase': 'reverse-percentage',
  'routine:percent-change-with-the-right-base': 'percent-change-base',
  'routine:three-part-ratio': 'ratio-three-part-largest',
  'routine:crossover-of-two-linear-costs': 'fixed-plus-variable-compare',
  // A13
  'routine:rate-of-change-from-a-table': 'rate-of-change-two-rows',
  'routine:mean-from-a-frequency-table': 'weighted-mean-frequency',
  'routine:total-then-percent-of-a-category': 'whole-sum-then-percent',
  // A14
  'routine:interquartile-range': 'interquartile-range',
  'routine:residual-from-a-model': 'residual-actual-vs-predicted',
  // A15
  'routine:expected-value': 'expected-value',
  'routine:probability-of-a-number-property': 'probability-number-property',
  'routine:enumerate-under-a-constraint': 'constrained-enumeration',
  // A16
  'routine:co-interior-angle': 'angle-chase-parallel',
  'routine:angles-in-a-given-ratio': 'angle-chase-two-variables',
  'routine:altitude-to-the-hypotenuse': 'similar-right-triangles-altitudes',
  // A17
  'routine:area-of-a-square-from-its-diagonal': 'square-from-diagonal',
  'routine:cone-height-from-slant': 'cone-slant-vs-height',
  'routine:fourth-vertex-of-a-parallelogram': 'parallelogram-centre-midpoint',
  // A18
  'routine:count-solutions-of-a-nested-absolute-value': 'absolute-value-nested-count',
};

/** The object an assembled item produces. */
export function objectOf(item) {
  const key = `${item.stream}:${item.construct || item.form || item.species}`;
  const mapped = CONSTRUCT_OBJECT[key];
  // An unmapped construct is its own object, so a missing annotation can never
  // silently license a repeat.
  return mapped === undefined ? `unmapped:${key}` : (mapped || `own:${key}`);
}

/**
 * Coverage of the reference vocabulary, per family.
 *
 * `covered` counts DISTINCT reference objects the generator can produce.
 * `ownOnly` counts constructs producing something the vocabulary does not name.
 */
export function coverage(constructKeysByFamily) {
  const out = {};
  // Every reference object, whatever family owns it. A generator construct can
  // legitimately be filed under a different family from the one the corpus puts
  // its object in — the Roman-numeral item about a rational function is served
  // from A08 while the corpus names the object under A18 — so coverage is
  // counted globally as well as per family, and the global figure is the one to
  // quote.
  const everyObject = new Set(Object.values(REFERENCE_OBJECTS).flatMap(f => f.objects));
  const producible = new Set(Object.values(constructKeysByFamily).flat()
    .map(k => CONSTRUCT_OBJECT[k]).filter(o => o && everyObject.has(o)));
  out.TOTAL = { refObjects: everyObject.size, covered: producible.size,
    deficit: everyObject.size - producible.size,
    missing: [...everyObject].filter(o => !producible.has(o)).sort() };
  for (const [fam, ref] of Object.entries(REFERENCE_OBJECTS)) {
    const keys = constructKeysByFamily[fam] || [];
    const objs = keys.map(k => CONSTRUCT_OBJECT[k]).filter(Boolean);
    const covered = new Set(objs.filter(o => ref.objects.includes(o)));
    out[fam] = {
      refObjects: ref.objects.length,
      refItems: ref.items,
      constructs: keys.length,
      covered: covered.size,
      ownOnly: keys.filter(k => CONSTRUCT_OBJECT[k] === null).length,
      unmapped: keys.filter(k => CONSTRUCT_OBJECT[k] === undefined).length,
      deficit: ref.objects.length - covered.size,
      missing: ref.objects.filter(o => !covered.has(o)),
    };
  }
  return out;
}

/**
 * The per-form rule, read straight off the corpus.
 *
 * Artifact 1 §9: 49 / 49 / 50 / 50 distinct archetypes in 50 items. Two of the
 * four reference forms repeat exactly one archetype and both repeats are benign
 * (one is a stimulus-sharing pair). So: at most ONE object may appear twice in
 * a form, and none may appear three times.
 */
export const OBJECT_RULES = {
  maxPerObject: 2,
  maxObjectsRepeated: 1,
  refDistinctPerForm: [49, 49, 50, 50],
};

export function objectDiversity(placements) {
  const tally = {};
  for (const p of placements) { const o = objectOf(p.item); (tally[o] ||= []).push(p.q); }
  const repeated = Object.entries(tally).filter(([, qs]) => qs.length > 1);
  const failures = [];
  for (const [o, qs] of repeated)
    if (qs.length > OBJECT_RULES.maxPerObject)
      failures.push(`${qs.length} items ask the object "${o}" (Q${qs.join(', Q')}); no reference form asks one more than twice`);
  if (repeated.length > OBJECT_RULES.maxObjectsRepeated)
    failures.push(`${repeated.length} objects appear more than once (${repeated.map(([o, qs]) => `${o}×${qs.length}`).join(', ')}); ` +
      `reference forms carry ${OBJECT_RULES.maxObjectsRepeated} at most`);
  return { ok: !failures.length, distinct: Object.keys(tally).length, tally, repeated, failures };
}
