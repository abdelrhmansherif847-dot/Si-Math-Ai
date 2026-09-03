// The series-capacity model.
//
// WHY THIS EXISTS, AND WHY THE PER-FORM GATE IS NOT IT
//
// `objectDiversity()` in est-objects.mjs polices repetition INSIDE one form and
// is silent across forms. ESTM2-2026-P3 scored 49 of 50 distinct objects on it
// and still shared 83% of those objects with the next form in its own series
// (artifact 21 §8). A per-form gate and a series question are different
// measurements, and until now only the first existed.
//
// THE REFERENCE'S REUSE MODEL, AND THE THING IT TEACHES
//
// Artifact 1 §9 states it in one sentence: "The family mix is nearly fixed
// across forms. The specific archetype inside each family is almost completely
// refreshed between forms, and never repeats inside one form."
//
//   family level      16 of 18 families appear in ALL FOUR forms; the other two
//                     in three of four. Pairwise family overlap is ~100%.
//   archetype level   7 of 191 archetypes appear in more than one form (3.7%).
//                     Pairwise archetype overlap is about 1.2 of 50 — 2.3%.
//   inside a form     49 / 49 / 50 / 50 distinct in 50.
//
// AND THE PART THAT CHANGES WHAT HAS TO BE BUILT
//
// The corpus does not reach 2.3% by having an enormous vocabulary. It has 189
// archetypes for 200 item-slots — barely more than the minimum. A RANDOM DRAW
// from 189 objects would give 50^2/189 = 13.2 shared items, 26%. The corpus
// shows 1.2.
//
// So the publisher is not sampling from a pool; it ALLOCATES each archetype to
// one form. That is a scheduler, and the generator has none: `assemble()` builds
// each form with no memory of any other. The measured 83% is therefore 1.2x
// WORSE than a random draw from the same 74 objects would be, because 32 of the
// 74 appear in every form — their family and band leave the assembler no
// alternative.
//
// The gap is two problems stacked, and they need different fixes:
//
//   vocabulary   how many distinct objects exist at all
//   allocation   which forms get which of them
//
// The two models below quantify each, and REQUIRED_CAPACITY turns a chosen
// overlap ceiling into a vocabulary target.

import { objectOf } from './est-objects.mjs';

/* ══════════════════ the reference model ══════════════════ */

export const REFERENCE_SERIES = {
  forms: 4,
  slotsPerForm: 50,
  archetypes: 191,
  archetypesInMoreThanOneForm: 7,
  distinctPerForm: [49, 49, 50, 50],
  familiesInEveryForm: 16,
  families: 18,
  // 7 extra appearances spread over C(4,2) = 6 form pairs.
  pairwiseArchetypeOverlap: 7 / 6,          // ~1.17 of 50 = 2.3%
  pairwiseFamilyOverlap: 16 / 18,           // ~89% of families in common, by design
  /**
   * What the corpus reuses, what it does not, and at what level. Written out
   * because the four rows are four DIFFERENT rules and conflating them is how a
   * generator ends up with 100% family overlap AND 83% object overlap.
   */
  policy: {
    alwaysReused: 'the family mix — 16 of 18 families in all four forms, and the per-form counts stay inside a narrow range',
    almostNeverReused: 'the specific archetype — 96.3% appear in exactly one form',
    neverRepeatedInsideAForm: 'the archetype, and 2 of 4 forms have no repeat at all',
    neverConsecutive: 'the same family in adjacent slots outside a shared set, and two peak-band items',
    reusableAfterAGap: 'an archetype may return, but 7 of 191 did so across four forms — the observed gap is a whole form or more',
  },
};

/* ══════════════════ the two capacity models ══════════════════ */

/** Random draw: each form picks S of V independently. Independent of N. */
export const randomOverlap = (V, S = 50) => (V > 0 ? (S * S) / V : Infinity);

/** Deliberate allocation: each object used in k of N forms, uses spread apart. */
export const scheduledOverlap = (k, N, S = 50) => (N > 1 ? (S * (k - 1)) / (N - 1) : 0);

/** Vocabulary a scheduled series needs at reuse factor k. */
export const scheduledVocabulary = (k, N, S = 50) => Math.ceil((N * S) / k);

/**
 * How much vocabulary an overlap ceiling costs, under both models.
 *
 * `share` is the ceiling as a fraction of a form — 0.16 means a student sitting
 * two forms may meet at most 8 of the 50 objects for a second time.
 */
export function requiredCapacity(share, N = 25, S = 50) {
  const shared = share * S;
  const randomV = Math.ceil((S * S) / shared);
  const k = 1 + (shared * (N - 1)) / S;
  return {
    share, shared,
    randomDrawVocabulary: randomV,
    scheduledReuseFactor: +k.toFixed(2),
    scheduledVocabulary: scheduledVocabulary(k, N, S),
  };
}

/**
 * The staged target, and the reasoning for each rung.
 *
 * The end state is stated first so the stages are not mistaken for the goal.
 * Nothing here claims a generated series can reach the corpus's 2.3%: that
 * needs a deliberate allocation over ~1,200 objects, which is a publisher's
 * item bank, not a library.
 */
export const SERIES_TARGET = {
  referenceShare: 0.023,
  stages: [
    { id: 'A', vocabulary: 120, share: 0.42,
      why: 'halves the measured 83%. A staging post, not a target — two forms still share a third of their objects.' },
    { id: 'B', vocabulary: 250, share: 0.20,
      why: 'the point at which no object need appear in more than 5 of 25 forms, so the "in every form" class disappears. The minimum before a fourth prototype is worth coding.' },
    { id: 'C', vocabulary: 625, share: 0.08,
      why: 'reuse factor 2 over 25 forms with a scheduler: 4% overlap, within 2x of the corpus. The target for a credible 25-form series.' },
  ],
  gateBeforeP4: 'B',
  gateBeforeScaling: 'C',
};

/* ══════════════════ the fifteen measurements ══════════════════ */

const jaccardCount = (a, b) => { const B = new Set(b); return [...new Set(a)].filter(x => B.has(x)).length; };
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

/**
 * Everything a form contributes to the series question, extracted once.
 *
 * Each axis is a DIFFERENT kind of repetition, and they are kept apart because
 * a series can be clean on one and saturated on another — P3 had zero repeated
 * option grids and 83% repeated objects.
 */
export function seriesSignature(placements) {
  const sig = k => placements.map(k).filter(Boolean);
  return {
    objects: placements.map(p => objectOf(p.item)),
    archetypes: sig(p => (p.item.archetype ? `${p.item.subForm}#${p.item.archetype}` : p.item.subForm)),
    families: sig(p => (p.fam === 'A12b' ? 'A12' : p.fam)),
    numericConfigurations: sig(p => numericConfiguration(p.item)),
    targetExpressions: sig(p => p.item.fingerprint?.target || p.item.fingerprintParts?.target),
    equationStructures: sig(p => equationStructure(p.item)),
    representationPatterns: sig(p => p.item.fingerprint?.ctx || p.item.fingerprintParts?.ctx),
    stimulusShapes: sig(p => (p.item.stimulus ? `${p.item.stimulus.kind}:${(p.item.stimulus.values || p.item.stimulus.rows || []).length}` : null)),
    optionStructures: sig(p => p.item.fingerprint?.options || p.item.fingerprintParts?.options),
    reasoningRoutes: sig(p => (p.item.fingerprint?.chain || p.item.fingerprintParts?.chain || []).join('>')),
  };
}

/** The distinctive numbers a stem prints, as a sorted tuple — formatting-blind. */
export function numericConfiguration(item) {
  const nums = (String(item.stem).match(/-?\d+(?:\.\d+)?/g) || []).map(Number)
    .filter(n => Number.isFinite(n));
  if (nums.length < 3) return null;
  return nums.slice().sort((a, b) => a - b).join(',');
}

/** The coefficient vector of every polynomial-shaped span in a stem. */
export function equationStructure(item) {
  const spans = (String(item.stem).match(/\$[^$]+\$/g) || []).map(s => s.slice(1, -1));
  const coeffs = spans.map(s => (s.match(/-?\d+/g) || []).join(',')).filter(Boolean);
  return coeffs.length ? coeffs.sort().join('|') : null;
}

export const SERIES_AXES = ['objects', 'archetypes', 'families', 'numericConfigurations',
  'targetExpressions', 'equationStructures', 'representationPatterns', 'stimulusShapes',
  'optionStructures', 'reasoningRoutes'];

/**
 * What each axis is measured AGAINST, and whether overlap on it is a defect.
 *
 * Three different denominators, because "18 of 18 families in common" and
 * "42 of 50 objects in common" are not the same statement and dividing both by
 * 50 makes the first look like 36%.
 *
 *   slots       the axis has one value per item; the denominator is 50
 *   vocabulary  the axis is a small closed label set; the denominator is the
 *               number of distinct labels the library uses at all
 *   stimuli     only the items carrying a display have a value
 *
 * `defect` says whether high overlap on that axis is a problem. It is FALSE for
 * families by design — the corpus keeps 16 of 18 families in all four forms, and
 * a generator that varied the family mix would be less authentic, not more — and
 * false for the three coarse label axes, whose vocabularies are small on purpose.
 */
export const AXIS_MEANING = {
  objects:                { basis: 'slots',      defect: true,  note: 'the measurement the series question is about' },
  archetypes:             { basis: 'slots',      defect: true,  note: 'finer than objects; tracks it closely' },
  families:               { basis: 'vocabulary', defect: false, note: 'total overlap is the corpus design: 16 of 18 families in all four forms' },
  numericConfigurations:  { basis: 'slots',      defect: true,  note: 'the numbers a stem prints, sorted — formatting-blind' },
  targetExpressions:      { basis: 'vocabulary', defect: false, note: 'a closed label set of about a dozen target kinds' },
  equationStructures:     { basis: 'slots',      defect: true,  note: 'coefficient vectors of every printed math span' },
  representationPatterns: { basis: 'vocabulary', defect: false, note: 'a closed label set of contexts' },
  stimulusShapes:         { basis: 'stimuli',    defect: true,  note: 'display kind and size' },
  optionStructures:       { basis: 'vocabulary', defect: false, note: 'a closed label set of option-grid kinds' },
  reasoningRoutes:        { basis: 'slots',      defect: true,  note: 'the ordered operation chain; the closest thing to "the same question again"' },
};

/**
 * Measure a series. `forms` is an array of placement arrays.
 *
 * Nothing here reads or stores exam text: every axis is a signature.
 */
export function measureSeries(forms, { vocabulary = null } = {}) {
  const sigs = forms.map(seriesSignature);
  const N = sigs.length;
  const S = forms[0]?.length || 50;

  // 1-9: pairwise overlap on every axis
  const overlap = {};
  for (const axis of SERIES_AXES) {
    const per = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) per.push(jaccardCount(sigs[i][axis], sigs[j][axis]));
    const basis = AXIS_MEANING[axis].basis;
    const denom = basis === 'slots' ? S
      : basis === 'stimuli' ? Math.max(1, mean(sigs.map(x => x[axis].length)))
        : Math.max(1, new Set(sigs.flatMap(x => x[axis])).size);
    overlap[axis] = { mean: +mean(per).toFixed(2), min: Math.min(...per), max: Math.max(...per),
      basis, denominator: +denom.toFixed(1), share: +(mean(per) / denom).toFixed(3),
      defect: AXIS_MEANING[axis].defect };
  }

  // 10-12: how widely each object is spread
  const formsPerObject = {};
  for (const s of sigs) for (const o of new Set(s.objects)) formsPerObject[o] = (formsPerObject[o] || 0) + 1;
  const used = Object.keys(formsPerObject).length;
  const inEvery = Object.values(formsPerObject).filter(c => c === N).length;
  const inMoreThanOne = Object.values(formsPerObject).filter(c => c > 1).length;

  // 13: forms before an object MUST repeat
  const formsBeforeForcedRepeat = Math.max(1, Math.floor((vocabulary ?? used) / S));

  // 14-15: what this vocabulary can support
  const V = vocabulary ?? used;
  const supportable = SERIES_TARGET.stages.map(st => ({
    stage: st.id, share: st.share,
    formsAtThisShare: V >= st.vocabulary ? '>= 25' : `${Math.max(1, Math.floor(V / st.vocabulary * 25))} (vocabulary ${V} of ${st.vocabulary})`,
  }));

  return {
    forms: N, slotsPerForm: S, vocabulary: V, objectsUsed: used,
    overlap,
    objectsInEveryForm: inEvery,
    objectsInMoreThanOneForm: inMoreThanOne,
    shareInMoreThanOneForm: +(inMoreThanOne / used).toFixed(3),
    meanUsesPerObject: +((N * S) / used).toFixed(1),
    distinctObjectsPerSlot: +(used / (N * S)).toFixed(3),
    formsBeforeForcedRepeat,
    randomDrawPrediction: +randomOverlap(V, S).toFixed(1),
    allocationPenalty: +(overlap.objects.mean / randomOverlap(V, S)).toFixed(2),
    supportable,
    reference: {
      pairwiseObjectOverlap: +REFERENCE_SERIES.pairwiseArchetypeOverlap.toFixed(2),
      shareInMoreThanOneForm: +(REFERENCE_SERIES.archetypesInMoreThanOneForm / REFERENCE_SERIES.archetypes).toFixed(3),
      distinctObjectsPerSlot: +(REFERENCE_SERIES.archetypes / (REFERENCE_SERIES.forms * REFERENCE_SERIES.slotsPerForm)).toFixed(3),
      familyOverlapIsTotalByDesign: true,
    },
  };
}

/**
 * The verdict, so a number does not have to be interpreted by eye.
 *
 * FAMILY overlap is deliberately not a failure at any level: the corpus keeps
 * its family mix nearly fixed and a generator that varied it would be less
 * authentic, not more.
 */
export function seriesVerdict(m) {
  const failures = [];
  for (const [axis, o] of Object.entries(m.overlap))
    if (o.defect && axis !== 'objects' && o.share > 0.25)
      failures.push(`${axis}: ${(o.share * 100).toFixed(0)}% overlap between forms`);
  const stage = SERIES_TARGET.stages.find(s => m.overlap.objects.share <= s.share);
  if (!stage) failures.push(`pairwise object overlap ${(m.overlap.objects.share * 100).toFixed(0)}% is worse than every staged target`);
  if (m.objectsInEveryForm > 0)
    failures.push(`${m.objectsInEveryForm} objects appear in EVERY form; the corpus has none`);
  if (m.allocationPenalty > 1.05)
    failures.push(`overlap is ${m.allocationPenalty}x a random draw from the same vocabulary — the assembler is forced onto particular objects, which is an allocation defect on top of the vocabulary one`);
  return { stageReached: stage ? stage.id : null, ok: !failures.length, failures };
}

/* ══════════════════ capability is not coverage ══════════════════ */

/**
 * Three quantities that are routinely confused, and were confused in P3.
 *
 * The library contains `P-SELECT-OBJECT/which_equation`, an equation-targeted
 * construct. ESTM2-2026-P3 emitted ZERO equation-targeted items. The construct
 * serves family A05, A05 has three slots, and all three went to other
 * constructs — so a capability that exists was never once reachable.
 *
 *   capacity   the library can build it at all
 *   demand     the blueprint has slots whose family and band could accept it
 *   emitted    it actually appears, measured over assembled forms
 *
 * A construct with capacity and demand but no emission is NOT covered. The
 * distinction matters because every previous coverage figure in this programme
 * measured capacity and reported it as coverage.
 */
export function emittedCoverage(constructs, forms, { slotsByFamily = {} } = {}) {
  const N = forms.length;
  const seen = {};
  for (const f of forms) for (const p of f) {
    const k = `${p.item.stream}:${p.item.construct || p.item.form || p.item.species}`;
    (seen[k] ||= new Set()).add(f);
  }
  const rows = constructs.map(c => {
    const appearances = forms.filter(f => f.some(p =>
      `${p.item.stream}:${p.item.construct || p.item.form || p.item.species}` === c.key)).length;
    const totalItems = forms.reduce((n, f) => n + f.filter(p =>
      `${p.item.stream}:${p.item.construct || p.item.form || p.item.species}` === c.key).length, 0);
    const demand = slotsByFamily[c.family] || 0;
    const reach = N ? appearances / N : 0;
    return {
      key: c.key, family: c.family, target: c.target, object: c.object,
      capacity: 1, demand, appearances, totalItems, reach: +reach.toFixed(2),
      status: demand === 0 ? 'no-demand' : reach === 0 ? 'UNREACHABLE' : reach < 0.2 ? 'rare' : 'reached',
    };
  });
  const by = s => rows.filter(r => r.status === s).length;
  void seen;
  return {
    forms: N, constructs: rows.length,
    reached: by('reached'), rare: by('rare'), unreachable: by('UNREACHABLE'), noDemand: by('no-demand'),
    rows,
    /** Per target kind, because that is where P3's gap was. */
    byTarget: [...new Set(rows.map(r => r.target))].sort().map(t => {
      const g = rows.filter(r => r.target === t);
      return { target: t, constructs: g.length,
        reached: g.filter(r => r.status === 'reached').length,
        unreachable: g.filter(r => r.status === 'UNREACHABLE').length,
        itemsPerForm: +(g.reduce((n, r) => n + r.totalItems, 0) / Math.max(1, N)).toFixed(2) };
    }),
  };
}
