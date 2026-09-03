// What four reference forms can determine — Stage 25.
//
// The estimators here carry a conclusion that overturns an earlier reading of
// the corpus, so they are checked against cases whose answer is known by
// arithmetic rather than by simulation, and the central claim is checked in
// both directions: the observed corpus must be consistent with a large pool and
// INCONSISTENT with the small one the programme has been assuming.

import {
  CORPUS_OBSERVED, chao1, chao1BiasCorrected, chao1Interval, sampleCoverage,
  poolFromOverlap, simulateCorpus, precisionByFormCount, corpusSufficiency,
  formsNeeded, SUFFICIENCY,
} from '../scripts/est-corpus-model.mjs';
import { randomOverlap } from '../scripts/est-series.mjs';

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log(`  ok  ${msg}`); } else { failed++; console.log(`  FAIL  ${msg}`); } };

/* ══════════════ 1. the estimators, on cases done by hand ══════════════ */
{
  // A sample with no singletons has seen everything the estimator can detect.
  ok(chao1(100, 0, 5) === 100, 'Chao1 with no singletons returns the observed richness');
  ok(chao1BiasCorrected(100, 0, 5) === 100, 'and so does the bias-corrected form');
  // f1 = 20, f2 = 10  ->  100 + 400/20 = 120.
  ok(chao1(100, 20, 10) === 120, 'Chao1 on a hand-computed case is exactly 120');
  ok(Math.abs(chao1BiasCorrected(100, 20, 10) - (100 + (20 * 19) / 22)) < 1e-9,
    'the bias-corrected form matches its own definition');
  ok(chao1BiasCorrected(100, 20, 10) < chao1(100, 20, 10),
    'the bias-corrected estimate is the more conservative of the two');

  // Monotonicity: more singletons means more unseen; more doubletons means less.
  ok(chao1(100, 40, 10) > chao1(100, 20, 10), 'more singletons implies a larger pool');
  ok(chao1(100, 20, 20) < chao1(100, 20, 10), 'more doubletons implies a smaller pool');
  // With no doubletons the classic form divides by zero, so the estimator falls
  // back on f1(f1-1)/2. It is finite and above the observed count; whether it
  // lands above or below the f2 = 1 case depends on the numbers, and asserting
  // an ordering there would be asserting an accident.
  const noDoubletons = chao1(100, 20, 0);
  ok(Number.isFinite(noDoubletons) && noDoubletons > 100,
    `MUTATION: zero doubletons gives a finite estimate above the observed count (${noDoubletons})`);

  ok(sampleCoverage(0, 200) === 1, 'a sample with no singletons has full coverage');
  ok(Math.abs(sampleCoverage(180, 200) - 0.1) < 1e-9, 'coverage of the observed corpus is 10%');
  ok(sampleCoverage(200, 200) === 0, 'MUTATION: all-singletons is zero coverage');

  ok(poolFromOverlap(1.25, 50) === 2000, 'the pool implied by an overlap of 1.25 is 2000');
  ok(Math.abs(randomOverlap(2000, 50) - 1.25) < 1e-9, 'and the two models are each other‘s inverse');
  ok(poolFromOverlap(0) === Infinity, 'MUTATION: zero overlap implies an unbounded pool, not a crash');

  const ci = chao1Interval(189, 180, 9);
  ok(ci.lower > 189 && ci.upper > ci.estimate && ci.estimate > ci.lower,
    `the interval brackets the estimate: ${Math.round(ci.lower)} < ${Math.round(ci.estimate)} < ${Math.round(ci.upper)}`);
  ok(ci.lower > 900, 'even the lower limit of the interval is far above the 189 observed');
}

/* ══════════════ 2. the corpus is inconsistent with a pool of 189 ══════════════ */
{
  // This is the claim the whole stage rests on, so it is asserted both ways.
  const observed = CORPUS_OBSERVED.pairwiseArchetypeOverlap;
  ok(Math.abs(observed - 7 / 6) < 1e-9, 'the corpus overlaps 1.167 of 50 slots pairwise');

  const ifSmall = randomOverlap(189, 50);
  ok(ifSmall > 13, `a pool of 189 would overlap ${ifSmall.toFixed(1)} of 50 — eleven times what the corpus does`);
  ok(observed < ifSmall / 10, 'MUTATION: the observed overlap is an order of magnitude below the small-pool prediction');

  const implied = poolFromOverlap(observed, 50);
  ok(implied > 1500 && implied < 3000, `the overlap implies a pool of about ${Math.round(implied)}`);

  // ...and the singleton counts say the same thing from entirely separate data.
  for (const d of CORPUS_OBSERVED.frequencyDecompositions) {
    const est = chao1BiasCorrected(CORPUS_OBSERVED.distinctArchetypes, d.f1, d.f2);
    ok(est > 1400, `the ${d.label} decomposition estimates at least ${Math.round(est)} archetypes`);
  }
  const central = CORPUS_OBSERVED.frequencyDecompositions.find(d => d.label === 'central');
  const fromCounts = chao1BiasCorrected(CORPUS_OBSERVED.distinctArchetypes, central.f1, central.f2);
  ok(Math.abs(fromCounts - implied) / implied < 0.5,
    `the two independent estimators agree within 50%: ${Math.round(fromCounts)} from counts, ${Math.round(implied)} from overlap`);
}

/* ══════════════ 3. the simulation reproduces the corpus ══════════════ */
{
  // A simulation that could not produce the observed corpus would not be
  // evidence about it. At a pool of 2000 it should; at 189 it must not.
  const big = precisionByFormCount({ poolSize: 2000, counts: [4], replicates: 120 })[0];
  ok(big.observedArchetypes.lo <= 189 && 189 <= big.observedArchetypes.hi,
    `a pool of 2000 produces ${Math.round(big.observedArchetypes.median)} distinct archetypes in 4 forms, bracketing the observed 189`);
  ok(big.overlap.lo <= 7 / 6 && 7 / 6 <= big.overlap.hi,
    `and an overlap interval [${big.overlap.lo.toFixed(2)}, ${big.overlap.hi.toFixed(2)}] containing the observed 1.17`);

  const small = precisionByFormCount({ poolSize: 189, counts: [4], replicates: 120 })[0];
  ok(small.overlap.lo > 7 / 6 * 3,
    `MUTATION: a pool of 189 produces an overlap of ${small.overlap.median.toFixed(1)}, nowhere near the observed 1.17`);
  ok(small.coverage.median > big.coverage.median,
    'MUTATION: and a small pool is far better covered by the same four forms');

  const one = simulateCorpus({ poolSize: 50, forms: 3, slots: 50, seed: 5 });
  ok(one.sObs === 50 && one.overlap === 50,
    'MUTATION: when the pool is exactly one form, every form is identical and overlap is total');
  ok(one.f1 === 0 && one.coverage === 1, 'and such a sample has full coverage and no singletons');
}

/* ══════════════ 4. precision improves with forms, and the tiers separate ══════════════ */
{
  const rows = precisionByFormCount({ poolSize: 2000, counts: [4, 8, 15, 25], replicates: 120 });
  for (let i = 1; i < rows.length; i++) {
    ok(rows[i].coverage.median > rows[i - 1].coverage.median,
      `coverage rises from ${rows[i - 1].forms} to ${rows[i].forms} forms`);
    ok(rows[i].poolEstimate.spread <= rows[i - 1].poolEstimate.spread + 0.05,
      `the pool estimate does not get less precise from ${rows[i - 1].forms} to ${rows[i].forms} forms`);
  }
  ok(rows[0].poolEstimate.spread > 1,
    `MUTATION: at four forms the pool estimate spans more than its own centre (${(rows[0].poolEstimate.spread * 100).toFixed(0)}%)`);

  const s4 = corpusSufficiency(rows[0]);
  ok(!s4.tier1.ok && !s4.tier2.ok, 'four forms reach neither tier');
  ok(s4.tier1.reasons.length > 0, 'and the model says why');

  const need = formsNeeded(precisionByFormCount({ poolSize: 2000, counts: [4, 8, 12, 15, 20, 25, 30], replicates: 120 }));
  ok(need.tier1 !== null && need.tier2 !== null, `both tiers are reachable: ${need.tier1} and ${need.tier2} forms`);
  ok(need.tier1 <= need.tier2, 'allocation work can resume before a completeness claim can be made');
  ok(need.tier1 > CORPUS_OBSERVED.forms, 'and neither is reachable with the corpus we have');

  ok(SUFFICIENCY.tier1.minimumForms >= 8, 'the tier-1 floor is at least eight forms');
  ok(SUFFICIENCY.tier2.coverage > 0.3, 'the tier-2 coverage floor is above thirty percent');
}

/* ══════════════ 5. the observation record is internally consistent ══════════════ */
{
  const c = CORPUS_OBSERVED;
  ok(c.forms * c.slotsPerForm === c.items, 'four forms of fifty slots is two hundred items');
  ok(c.distinctPerForm.length === c.forms, 'a distinct-archetype count is recorded per form');
  ok(c.distinctPerForm.every(d => d <= c.slotsPerForm), 'no form has more archetypes than slots');
  const withinFormRepeats = c.distinctPerForm.reduce((a, d) => a + (c.slotsPerForm - d), 0);
  ok(withinFormRepeats === 2, 'two within-form repeats are implied by the per-form counts');
  for (const d of c.frequencyDecompositions) {
    ok(d.f1 + d.f2 <= c.distinctArchetypes, `${d.label}: singletons and doubletons fit inside the distinct count`);
    ok(d.f1 + 2 * d.f2 <= c.items, `${d.label}: the implied instance count fits inside two hundred items`);
  }
  const central = c.frequencyDecompositions[1];
  ok(central.f2 >= c.archetypesInMoreThanOneForm,
    'the central decomposition accounts for every recorded cross-form recurrence');
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
