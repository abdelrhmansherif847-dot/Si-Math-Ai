// The mechanism-composition layer — Stage 2, from the Stage-1.5 proposal.
//
// WHY IT EXISTS
//
// `multiconcept` and `approaches` bite in 0% of Stage-1.5 generated items
// against 17% and 6% in the reference corpus, and they cannot move without
// this. A single primitive produces a single mechanism, so its closing step
// integrates ONE earlier result — and `assertInteraction` correctly refuses to
// call that interaction. Composition is the only honest route to a form whose
// hard items integrate rather than accumulate.
//
// THE OBLIGATION THAT DOES NOT COME FREE
//
// **Load-bearing does not compose.** Two mechanisms that each bite alone can
// produce a composed item in which one is decoration, because resolving the
// other incidentally resolves it. So the singular `counterfactual` becomes a
// per-mechanism structure, and EACH mechanism must be shown to carry weight on
// its own: withholding A alone must move the key or destroy determinacy, and
// likewise B alone. Withholding both is not a test of either.
//
// DEPTH IS CAPPED AT TWO BY THE PAGE
//
// The composed route set is the PRODUCT of the parents' route sets, not the
// union. Two mechanisms with one insight route and one blind route each give
// four combinations, of which three are mechanism-blind: A's error, B's error,
// and both. Those are exactly three distractors, and a four-option item has
// exactly three slots. Depth three needs seven and cannot be printed.

import {
  qEq, qNum, assess, assertInteraction, trapLevel, counterfactualsOf, checkCounterfactual,
} from './est-primitives.mjs';

// The counterfactual shape lives in est-primitives.mjs so that assess() and the
// composed assessment read the SAME implementation. Re-exported here because
// this is where a reader looks for it.
export { counterfactualsOf, checkCounterfactual };

/* ────────────────────────── the composed assessment ────────────────────────── */

/**
 * Everything a composed item must satisfy. `assess()` is reused unchanged for
 * the anti-bypass and load-bearing rules — the composed route product is just a
 * route list — and this adds what composition specifically requires.
 */
export function assessComposed(item) {
  const reasons = [];
  const parts = item.composedOf || [];
  if (parts.length !== 2) reasons.push(`composition depth ${parts.length}, and the four-option format admits exactly two`);

  // 1. The generic gate, on the PRODUCT route set.
  const base = assess(item);
  if (!base.loadBearing) reasons.push(...base.reasons);

  // 2. Both mechanisms interact rather than merely coexisting.
  const inter = assertInteraction(item);
  if (!inter.ok) reasons.push(`stacked, not composed: ${inter.reason}`);

  // 3. EACH mechanism carries weight on its own.
  const keyValue = item.options.find(o => o.id === item.key).value;
  const cfs = counterfactualsOf(item);
  const named = new Set(cfs.map(c => c.mechanism));
  for (const p of parts) if (!named.has(p)) reasons.push(`no counterfactual for ${p} — its load-bearing status is unproven`);
  for (const cf of cfs) {
    const r = checkCounterfactual(cf, keyValue);
    if (!r.ok) reasons.push(r.reason);
  }

  // 4. The error grid is complete: A's error, B's error, and both, each printed.
  const grid = item.errorGrid || {};
  for (const cell of ['a', 'b', 'ab']) {
    if (grid[cell] === undefined) { reasons.push(`error grid has no ${cell} cell`); continue; }
    const lands = item.options.find(o => qEq(o.value, grid[cell]));
    if (!lands) reasons.push(`error-grid cell ${cell} is not printed — the grid is incomplete and the key is identifiable by pattern`);
    else if (lands.id === item.key) reasons.push(`error-grid cell ${cell} IS the key`);
  }

  // 5. At most one representation switch, or the item tests bookkeeping.
  if ((item.representationSwitches ?? 0) > 1)
    reasons.push(`${item.representationSwitches} representation switches — beyond one the item stops testing mathematics`);

  return { ok: reasons.length === 0, reasons, trap: trapLevel(item) };
}

/* ────────────────────────── building one ────────────────────────── */

/**
 * Compose two primitive items into one.
 *
 * `binding` is `serial` (A's output is B's input) or `parallel` (both feed a
 * common closing step). The caller supplies `combine`, which computes the
 * composed key and the three error-grid values from the two parents — the
 * composition layer cannot know the mathematics, only the obligations.
 *
 * Nothing here forces composition on a slot. The caller decides; this decides
 * whether what the caller built is real.
 */
export function compose(a, b, { binding, combine, conceptChain, mechanism, fingerprintParts,
                                stem, representationSwitches = 0 }) {
  if (!['serial', 'parallel'].includes(binding)) throw new Error(`unknown binding ${binding}`);
  const built = combine(a, b);
  if (!built || built.error) return { error: built ? built.error : 'combine produced nothing' };

  const item = {
    primitive: `${a.primitive}+${b.primitive}`,
    species: 'composed',
    form: `${a.form || a.species}|${b.form || b.species}`,
    composedOf: [a.primitive, b.primitive],
    binding,
    stem,
    ...built.layout,
    distractorClasses: built.distractorClasses,
    mechanism,
    conceptChain,
    routes: built.routes,
    counterfactuals: built.counterfactuals,
    errorGrid: built.errorGrid,
    representationSwitches,
    fingerprintParts,
    parents: { a: { form: a.form, seed: a.seed }, b: { form: b.form, seed: b.seed } },
  };
  const verdict = assessComposed(item);
  if (!verdict.ok) return { error: verdict.reasons.join('; '), item };
  item.assessment = verdict;
  return item;
}

/**
 * Which primitive pairs may compose, and under which binding. Derived from the
 * five patterns in artifact 15 §8.4. `C5` is present and DISALLOWED on purpose:
 * it is what an unguarded layer would build, and `assertInteraction` rejects it
 * because its closing step integrates one earlier result, not two.
 */
export const COMPOSABLE = [
  { id: 'C1', a: 'P-CONVERSION', b: 'P-COMBINATION', binding: 'serial',
    note: 'a converted quantity enters a system whose combination alone is determined' },
  { id: 'C2', a: 'P-CLASSIFY', b: 'P-NORMALISE', binding: 'serial',
    note: 'the classification decides which normalisation applies' },
  { id: 'C3', a: 'P-NAMED-CONFIG', b: 'P-UNSTATED-MODEL', binding: 'serial',
    note: 'configuration read from naming, then a relation nobody stated' },
  { id: 'C4', a: 'P-DECOY', b: 'P-SCOPE', binding: 'parallel', gated: true,
    note: 'both must be resolved and neither alone suffices; P-SCOPE is unscheduled, so this cannot be first' },
  { id: 'C5', a: 'P-CONVERSION', b: 'P-NAMED-CONFIG', binding: 'parallel', disallowed: true,
    note: 'STACKING, not composition: two independent preconditions on different parts of the item, so the closing step integrates one result' },
];

export const composableIds = () => COMPOSABLE.filter(c => !c.disallowed && !c.gated).map(c => c.id);

/* ────────────────────────── C2 · classification → normalisation ────────────────────────── */

import { Q, qAdd, qMul, qSub, qDiv, qIsInt, qStr, rng, ROUTE } from './est-primitives.mjs';

/**
 * The classification gate fixes a parameter; that parameter is then a
 * coefficient of the polynomial whose remainder the normalisation gate asks
 * for. Serial: A's output IS B's input, and the closing step integrates both
 * A's parameter and B's normalised root — which is what makes it composition
 * rather than two questions printed together.
 *
 * The 2x2 error grid falls out of the mathematics rather than being invented:
 *
 *            root normalised (b/A)      root left un-normalised (b)
 *   a right   KEY                        grid.b
 *   a wrong   grid.a                     grid.ab
 *
 * Each cell is the answer to one specific pair of decisions, all four are
 * printed, and the per-mechanism counterfactuals are the two single-error
 * cells: taking the reflex route on one gate while getting the other right
 * lands exactly there.
 */
export function composeClassifyNormalise(seed, opts = {}) {
  const rand = rng(seed);
  // ── the classification half ────────────────────────────────────────────────
  const k = rand.nonZero(-6, 6), qc = rand.pick([2, 3, 4, 5]), r = rand.nonZero(-8, 8);
  const m = qc * rand.int(2, 6);
  const u = rand.nonZero(-12, 12);
  const aRight = qSub(Q(m, qc), Q(k));            // no solution: x-terms cancel, constants do not
  const aWrong = qSub(Q(u, r), Q(k));             // the reflex "infinitely many" reading
  if (qEq(aRight, aWrong)) return { error: 'no-solution and infinitely-many coincide — the item is unsound' };
  if (!qIsInt(aRight)) return { error: 'the classified parameter is not an integer — it reads as a second puzzle' };

  // ── the normalisation half ────────────────────────────────────────────────
  const A = rand.pick([2, 3]), Bv = rand.pick([3, 5, 7, 9]);
  if (Bv % A === 0) return { error: 'root is an integer — the divisor normalises itself away' };
  const c2 = rand.nonZero(-4, 4), c0 = rand.nonZero(-9, 9);
  const root = Q(Bv, A), naive = Q(Bv);
  const P = (aVal, x) => qAdd(qAdd(qMul(Q(c2), qMul(x, x)), qMul(aVal, x)), Q(c0));

  const key   = P(aRight, root);
  const gridA = P(aWrong, root);                  // misclassified, normalised correctly
  const gridB = P(aRight, naive);                 // classified correctly, divisor left non-monic
  const gridAB = P(aWrong, naive);                // both

  const all = [key, gridA, gridB, gridAB];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++)
    if (qEq(all[i], all[j])) return { error: 'two cells of the error grid coincide — the grid cannot be printed' };
  if (all.some(v => Math.abs(qNum(v)) > 400)) return { error: 'a cell is outside a printable range' };

  // ANTI-ESTIMATION, as everywhere else: magnitude alone must not pick the key.
  const kn = Math.abs(qNum(key));
  const near = [gridA, gridB, gridAB].some(v => {
    const x = Math.abs(qNum(v));
    return kn === 0 ? x < 3 : x > kn / 3 && x < kn * 3;
  });
  if (!near) return { error: 'every cell is more than a factor of three from the key — magnitude alone identifies it' };

  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = rand.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
  const LETTERS = ['A', 'B', 'C', 'D'];
  const layout = {
    options: order.map((src, pos) => ({ id: LETTERS[pos], value: all[src], text: qStr(all[src]) })),
    key: LETTERS[order.indexOf(0)],
  };

  const sign = c => `${c < 0 ? '-' : '+'} ${Math.abs(c)}`;
  const coefX2 = c2 === 1 ? 'x^2' : c2 === -1 ? '-x^2' : `${c2}x^2`;
  const stem = `In the equation $(a ${sign(k)})(${qc === 1 ? '' : qc}x ${sign(r)}) = ${m}x ${sign(u)}$ there is no value of $x$ that makes the equation true. ` +
    `What is the remainder when $P(x) = ${coefX2} + ax ${sign(c0)}$ is divided by $(${A}x - ${Bv})$?`;

  return compose(
    { primitive: 'P-CLASSIFY', form: 'existence-of-solutions', seed },
    { primitive: 'P-NORMALISE', form: 'non_monic_divisor', seed },
    {
      binding: 'serial',
      stem,
      representationSwitches: 0,
      mechanism: { hidden_step: 2, inference: 2, multiconcept: 2, nonobvious_rel: 2,
                   abstraction: 2, reversal: 2, competing_interp: 1, filtering: 1 },
      // The closing step consumes BOTH the classified parameter and the
      // normalised root. Remove either and assertInteraction rejects the item.
      conceptChain: [
        { concept: 'classify-solution-set', inputs: ['coefficients'], output: 'parameter-a' },
        { concept: 'normalise-non-monic-divisor', inputs: ['divisor'], output: 'root' },
        { concept: 'evaluate-polynomial-at-root', inputs: ['parameter-a', 'root'], output: 'remainder' },
      ],
      fingerprintParts: {
        ctx: 'pure-algebraic composed', target: 'value:remainder-of-parametrised-polynomial',
        chain: ['classify-solution-set', 'solve-for-parameter', 'normalise-divisor-root', 'evaluate-at-root'],
        options: '2x2-error-grid', distract: ['D2', 'D4', 'D2D4'],
        narrative: 'symbols-only:1-parameter', numeric: ['offset-k', 'coeff-q', 'const-r', 'coeff-m', 'const-u', 'divisor-a', 'divisor-b'],
      },
      combine: () => ({
        layout,
        distractorClasses: ['D2', 'D4', 'D2D4'],
        errorGrid: { a: gridA, b: gridB, ab: gridAB },
        routes: [
          ROUTE('classify-then-normalise', { insight: true, cost: 7, value: key }),
          ROUTE('misclassify-then-normalise', { insight: false, cost: 7, value: gridA, natural: true }),
          ROUTE('classify-then-read-divisor-as-monic', { insight: false, cost: 5, value: gridB }),
          ROUTE('misclassify-and-read-divisor-as-monic', { insight: false, cost: 5, value: gridAB }),
        ],
        // Each mechanism's counterfactual is its OWN error cell: taking the
        // reflex route on that gate alone lands exactly there, so a cell equal
        // to the key would mean the gate changes nothing.
        counterfactuals: [
          { mechanism: 'P-CLASSIFY',  kind: 'value', value: gridA,
            note: 'the reflex "both sides identical" reading, with the divisor still normalised' },
          { mechanism: 'P-NORMALISE', kind: 'value', value: gridB,
            note: 'the divisor read as monic, with the parameter still classified correctly' },
        ],
      }),
    });
}
