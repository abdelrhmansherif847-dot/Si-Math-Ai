// What four reference forms can and cannot determine — Stage 25.
//
// WHY THIS EXISTS
//
// Every capacity number in this programme has been computed against a corpus
// vocabulary of 189 archetypes, and 189 has been treated as THE vocabulary.
// It is not. It is what four forms revealed, and four forms is a sample.
//
// The distinction is not pedantic. Stage 24 concluded that "supported
// vocabulary expansion is exhausted" because 183 of the 189 named archetypes
// are built. That is true of the SAMPLE. Whether it is true of the population
// is a species-richness question, and species-richness questions have standard
// answers that this module computes.
//
// The result reframes the programme, so it is worth stating the method before
// the number: if a survey of 200 individuals finds 189 species of which 180
// were seen exactly once, the survey has not found most of the species. That is
// the entire argument, and it is the same argument an ecologist makes about a
// hectare of rainforest.
//
// NO EXAM CONTENT. Counts of archetypes, never archetypes.

import { rng } from './est-primitives.mjs';

/* ══════════════════════════ the four-form observation ══════════════════════════ */

/**
 * What the corpus actually shows, as counts. Every figure is from the item-level
 * archetype database built in artifact 2 and re-stated in `REFERENCE_SERIES`.
 *
 * The frequency decomposition needs care and is recorded as a RANGE rather than
 * a point, because the database records which archetypes recur across forms and
 * how many distinct archetypes each form has, from which the singleton and
 * doubleton counts follow only up to a small ambiguity: 200 items over 189
 * distinct archetypes leaves 11 repeat instances, of which 7 are the recorded
 * cross-form recurrences and 2 are the within-form repeats implied by two forms
 * having 49 distinct archetypes in 50 slots. The remaining 2 could be either.
 */
export const CORPUS_OBSERVED = {
  forms: 4,
  slotsPerForm: 50,
  items: 200,
  distinctArchetypes: 189,
  archetypesInMoreThanOneForm: 7,
  distinctPerForm: [49, 49, 50, 50],
  pairwiseArchetypeOverlap: 7 / 6,        // 1.167 of 50 slots = 2.3%
  // f1 = archetypes seen exactly once among the 200 items,
  // f2 = archetypes seen exactly twice. The middle row is the central case.
  frequencyDecompositions: [
    { label: 'fewest repeats', f1: 182, f2: 7 },
    { label: 'central', f1: 180, f2: 9 },
    { label: 'most repeats', f1: 178, f2: 11 },
  ],
};

/* ══════════════════════════ species-richness estimators ══════════════════════════ */

/**
 * Chao1: the lower bound on species richness from singletons and doubletons.
 *
 *   S_est = S_obs + f1^2 / (2 f2)
 *
 * It is a LOWER bound on the true richness, not a point estimate, which matters
 * here: the conclusion is "at least this many", and the conclusion is already
 * an order of magnitude above 189.
 */
export const chao1 = (sObs, f1, f2) => (f2 > 0 ? sObs + (f1 * f1) / (2 * f2) : sObs + (f1 * (f1 - 1)) / 2);

/** The bias-corrected form, which is the one to quote when f2 is small. */
export const chao1BiasCorrected = (sObs, f1, f2) => sObs + (f1 * (f1 - 1)) / (2 * (f2 + 1));

/**
 * Good-Turing sample coverage: the probability that the NEXT item drawn is an
 * archetype the sample has already seen.
 *
 *   C = 1 - f1 / n
 *
 * Its complement, f1/n, is the share of the archetype pool by frequency that the
 * sample has not seen at all.
 */
export const sampleCoverage = (f1, n) => 1 - f1 / n;

/**
 * An approximate 95% interval for Chao1, using the standard log-transform that
 * keeps the lower limit above S_obs.
 */
export function chao1Interval(sObs, f1, f2) {
  const est = chao1(sObs, f1, f2);
  const d = est - sObs;
  if (d <= 0 || f2 === 0) return { estimate: est, lower: sObs, upper: est };
  // var(S) for the classic estimator
  const r = f1 / f2;
  const variance = f2 * (0.5 * r * r + r * r * r + 0.25 * r * r * r * r);
  const c = Math.exp(1.96 * Math.sqrt(Math.log(1 + variance / (d * d))));
  return { estimate: est, lower: sObs + d / c, upper: sObs + d * c, variance };
}

/**
 * The pool size implied by an observed pairwise overlap, if forms are drawn
 * independently: E[overlap] = S^2 / V, so V = S^2 / overlap.
 *
 * This is an entirely separate line of evidence from the singleton counts, and
 * the two agreeing is what makes the conclusion hard to dismiss.
 */
export const poolFromOverlap = (overlap, S = 50) => (overlap > 0 ? (S * S) / overlap : Infinity);

/* ══════════════════════════ how many forms would settle it ══════════════════════════ */

/**
 * Draw `forms` samples of `slots` archetypes from a pool of `poolSize`, and
 * report what an analyst looking only at those samples would conclude.
 *
 * The pool is uniform, which is the conservative choice: a real archetype pool
 * has a frequency distribution, and any skew makes the estimators MORE biased
 * downward, not less. So a simulation that says four forms are not enough under
 * uniformity is saying it under the most favourable assumption available.
 */
export function simulateCorpus({ poolSize, forms = 4, slots = 50, seed = 1 }) {
  const rand = rng(seed >>> 0);
  const counts = new Map();
  const perForm = [];
  for (let f = 0; f < forms; f++) {
    const drawn = new Set();
    while (drawn.size < slots) drawn.add(rand.int(0, poolSize - 1));
    perForm.push(drawn);
    for (const a of drawn) counts.set(a, (counts.get(a) || 0) + 1);
  }
  const freq = [...counts.values()];
  const f1 = freq.filter(n => n === 1).length;
  const f2 = freq.filter(n => n === 2).length;
  const sObs = counts.size;
  const n = forms * slots;
  let overlapTotal = 0, pairs = 0;
  for (let i = 0; i < forms; i++) for (let j = i + 1; j < forms; j++) {
    let k = 0; for (const a of perForm[i]) if (perForm[j].has(a)) k++;
    overlapTotal += k; pairs++;
  }
  const overlap = pairs ? overlapTotal / pairs : 0;
  return {
    sObs, f1, f2, n, overlap,
    turnover: sObs ? f1 / sObs : 0,
    coverage: sampleCoverage(f1, n),
    chao1: chao1(sObs, f1, f2),
    chao1BC: chao1BiasCorrected(sObs, f1, f2),
    poolFromOverlap: poolFromOverlap(overlap, slots),
  };
}

const quantile = (sorted, q) => {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

/**
 * How precisely each quantity is known after `forms` reference forms.
 *
 * Reported as the ratio of the 95% interval's width to its centre, because that
 * is what decides whether a measurement can carry a design decision: an estimate
 * of the pool size that spans a factor of four cannot size a 25-form series.
 */
export function precisionByFormCount({ poolSize, counts = [4, 6, 8, 10, 15, 20],
  replicates = 200, slots = 50, seed = 7 } = {}) {
  return counts.map(forms => {
    const runs = [];
    for (let r = 0; r < replicates; r++)
      runs.push(simulateCorpus({ poolSize, forms, slots, seed: seed + r * 7919 + forms * 104729 }));
    const stat = key => {
      const xs = runs.map(x => x[key]).filter(x => Number.isFinite(x)).sort((a, b) => a - b);
      const lo = quantile(xs, 0.025), hi = quantile(xs, 0.975), mid = quantile(xs, 0.5);
      return { median: mid, lo, hi, spread: mid > 0 ? (hi - lo) / mid : Infinity };
    };
    return {
      forms,
      observedArchetypes: stat('sObs'),
      overlap: stat('overlap'),
      turnover: stat('turnover'),
      coverage: stat('coverage'),
      poolEstimate: stat('chao1BC'),
      poolFromOverlap: stat('poolFromOverlap'),
    };
  });
}

/**
 * When is the corpus big enough to resume generator work?
 *
 * Not "when we have more forms" — when the quantities the generator is designed
 * against are known well enough to design against. Each threshold is a relative
 * interval width, so it is scale-free and does not need the answer in advance.
 */
export const SUFFICIENCY = {
  /**
   * TIER 1 — enough to revise the capacity model and resume allocation work.
   *
   * Allocation work needs to know the series reuse rate it is aiming at and the
   * rough size of the pool that sets the ceiling. It does not need the pool
   * enumerated.
   */
  tier1: { poolEstimateSpread: 0.75, overlapSpread: 0.40, minimumForms: 8 },
  /**
   * TIER 2 — enough to make a claim about VOCABULARY COMPLETENESS.
   *
   * This is the threshold the programme has been unknowingly failing. "183 of
   * 189 archetypes are executable" is a statement about the pool, and it can
   * only be made when a real share of the pool has been seen. At 10% coverage
   * it is a statement about the sample wearing the sample's own clothes.
   */
  tier2: { coverage: 0.35, poolEstimateSpread: 0.40 },
};

export function corpusSufficiency(row) {
  const t1 = [];
  if (!(row.poolEstimate.spread <= SUFFICIENCY.tier1.poolEstimateSpread))
    t1.push(`pool estimate spans ${(row.poolEstimate.spread * 100).toFixed(0)}% of its centre, target ${(SUFFICIENCY.tier1.poolEstimateSpread * 100).toFixed(0)}%`);
  if (!(row.overlap.spread <= SUFFICIENCY.tier1.overlapSpread))
    t1.push(`overlap spans ${(row.overlap.spread * 100).toFixed(0)}% of its centre, target ${(SUFFICIENCY.tier1.overlapSpread * 100).toFixed(0)}%`);
  if (row.forms < SUFFICIENCY.tier1.minimumForms)
    t1.push(`${row.forms} forms is below the ${SUFFICIENCY.tier1.minimumForms}-form floor`);

  const t2 = [];
  if (!(row.coverage.median >= SUFFICIENCY.tier2.coverage))
    t2.push(`sample coverage ${(row.coverage.median * 100).toFixed(0)}%, floor ${(SUFFICIENCY.tier2.coverage * 100).toFixed(0)}%`);
  if (!(row.poolEstimate.spread <= SUFFICIENCY.tier2.poolEstimateSpread))
    t2.push(`pool estimate spans ${(row.poolEstimate.spread * 100).toFixed(0)}%, target ${(SUFFICIENCY.tier2.poolEstimateSpread * 100).toFixed(0)}%`);

  return {
    forms: row.forms,
    tier1: { ok: t1.length === 0, reasons: t1 },
    tier2: { ok: t2.length === 0, reasons: t2 },
  };
}

/**
 * The smallest form count that reaches each tier, under a hypothesised pool.
 *
 * Returned as a pair because the two answers are different and the difference
 * is the point: allocation work can resume long before a completeness claim can
 * be made, and conflating them is what produced the 250-object milestone.
 */
export function formsNeeded(rows) {
  const first = key => rows.find(r => corpusSufficiency(r)[key].ok)?.forms ?? null;
  return { tier1: first('tier1'), tier2: first('tier2') };
}
