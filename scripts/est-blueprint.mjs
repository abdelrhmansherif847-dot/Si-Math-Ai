// EST I Math — the generation blueprint, as data.
//
// This is the executable half of docs/engineering/est-generation/06-est-generation-blueprint.md.
// The prose there explains WHY each constraint exists and what evidence tier it
// carries; this file is the machine-checkable statement of it, and
// scripts/validate-est-blueprint.mjs is what makes it fail out loud.
//
// It describes the SHAPE of a form: 50 slots, each with a family, a domain, a
// demand band and the devices it must carry. It contains no exam content and
// never will — the repository is public.
//
// No dependencies, no build step, same bytes in Node and the browser, per the
// repo's standing convention.

// ─────────────────────────────────────────────────────────────────────────────
// RULE STRENGTH — the anti-overfitting layer.
//
// The corpus is four forms. Turning every observed frequency into a mandatory
// rule would produce four forms with shuffled questions, not an exam. Every
// rule below therefore carries a STRENGTH, and the strength decides what the
// validator does with it and what a generator is allowed to vary.
//
//   'hard'      Must always hold. Violation is a defect. Publisher-authoritative
//               facts and structural invariants live here.
//   'range'     Must land inside a stated interval, anywhere inside it.
//   'soft'      Should usually hold. A form may deviate WITH A RECORDED REASON;
//               the validator warns rather than fails.
//   'tendency'  Reproduce in aggregate ACROSS THE SERIES, not in every form.
//               Per-form conformance is not required and not desirable.
//   'rare'      A minority pattern. Must appear in SOME forms of a series and
//               must NOT appear in all of them.
//   'optional'  Free choice. Recorded only so a generator varies it deliberately
//               rather than by accident.
//
// A rule's strength is evidence-driven: T1/T2 findings can be 'hard' or 'range';
// T3 findings cap at 'soft' or 'tendency'; T4 findings cannot constrain
// generation at all.
// ─────────────────────────────────────────────────────────────────────────────

export const STRENGTHS = ['hard', 'range', 'soft', 'tendency', 'rare', 'optional'];

/**
 * Every rule this blueprint states, with its strength, its evidence tier and
 * the reason the two combine the way they do. The validator consults this to
 * decide whether a violation is a failure or a warning; a rule missing from
 * here is itself a failure.
 */
export const RULES = {
  // ── hard: publisher-authoritative structure ────────────────────────────────
  itemCount:            { strength: 'hard', tier: 'T1', why: 'The publisher prints 50 items in one 75-minute section.' },
  allMultipleChoice:    { strength: 'hard', tier: 'T1', why: 'The publisher prints "all multiple choice"; 200/200 corpus items are 4-option MCQ.' },
  fourOptionsAD:        { strength: 'hard', tier: 'T1', why: 'A-D in every item of every form.' },

  // ── hard: structural invariants measured across all four forms ─────────────
  noArchetypeRepeat:    { strength: 'hard', tier: 'T2', why: '191 archetypes over 200 items; two forms reach 50 distinct in 50.' },
  noContextRepeat:      { strength: 'hard', tier: 'T2', why: 'No scenario recurs inside a form anywhere in the corpus.' },
  noNumericDuplication: { strength: 'hard', tier: 'T2', why: 'Series-level. A recognised question invalidates the score it produces.' },
  keyReadNotChosen:     { strength: 'hard', tier: 'T2', why: 'Options run in magnitude or structural order; the letter falls out.' },
  everyDistractorNamed: { strength: 'hard', tier: 'T2', why: 'No unnameable option found in 600 corpus distractors.' },
  derivedPartnerPresent:{ strength: 'hard', tier: 'T2', why: 'The un-derived value is offered on essentially every derived-target item.' },
  lastItemNotPeak:      { strength: 'hard', tier: 'T2', why: 'No reference form ends on its highest-demand item.' },
  peaksNotAdjacent:     { strength: 'hard', tier: 'T2', why: 'No two peak-band items are adjacent anywhere in 200 items.' },
  geometryNotAdjacent:  { strength: 'hard', tier: 'T2', why: 'Geometry is scattered in all four forms; never more than two adjacent.' },

  // ── range: published bands and measured per-form intervals ─────────────────
  domainBands:          { strength: 'range', tier: 'T1', why: 'Published. Anywhere inside the band is authentic.' },
  karBands:             { strength: 'range', tier: 'T1', why: 'Published. See KAR_CALIBRATION below: the TARGET is T1, our MEASUREMENT is T4.' },
  familyCounts:         { strength: 'range', tier: 'T3', why: 'Per-form counts swing widely inside a stable family list.' },
  demandShares:         { strength: 'range', tier: 'T3', why: 'Fitted to reproduce the corpus shape; not calibrated against students.' },
  deviceBudgets:        { strength: 'range', tier: 'T2', why: 'Device presence is T2; per-form counts vary, so a range not a point.' },
  setStructure:         { strength: 'range', tier: 'T2', why: '15 sets over 4 forms: 2-3 items, one of 4, first early and last late.' },
  stimulusCoverage:     { strength: 'range', tier: 'T2', why: '18/17/18/14 items carry a stimulus; one type reaches 5 items.' },
  keyBalance:           { strength: 'range', tier: 'T2', why: 'DELIBERATE DEPARTURE: tighter than the corpus, on fairness grounds.' },

  // ── soft: shape, not law ───────────────────────────────────────────────────
  onRampShape:          { strength: 'soft', tier: 'T3', why: 'Q1-10 is the easiest block in 3 of 4 forms; Form 3 is not.' },
  blockDispersion:      { strength: 'soft', tier: 'T3', why: 'Reproduces a flat-but-varied texture; the exact per-block mix varies.' },
  noFamilyTwiceInARow:  { strength: 'soft', tier: 'T3', why: 'Adjacent same-family items read as a set that is not one.' },
  peaksStackDevices:    { strength: 'soft', tier: 'T3', why: 'The corpus also builds one peak per form from step count alone.' },
  colonStemShare:       { strength: 'soft', tier: 'T2', why: 'About a third of stems trail into the options; the share varies by form.' },

  // ── tendency: hold across the SERIES, not inside one form ──────────────────
  a14ExactlyThree:      { strength: 'tendency', tier: 'T3', why: 'Exactly 3 in all four forms - striking, but n=4. Do not make it law.' },
  perFormFamilyMix:     { strength: 'tendency', tier: 'T3', why: 'A12 runs 2-6, A15 runs 1-4, A05 runs 1-4. Vary between forms.' },
  withinSetOrdering:    { strength: 'tendency', tier: 'T3', why: 'Sets cover distinct skills; they do NOT reliably ramp.' },
  aLetterDeficit:       { strength: 'tendency', tier: 'T2', why: 'Real but deliberately NOT reproduced. Recorded, not applied.' },

  // ── rare: must appear in some forms of a series, never in all ──────────────
  complexNumbers:       { strength: 'rare', tier: 'T3', why: '2 of 4 forms carry an item involving i. Legitimate EST content, but not every form.' },
  notItems:             { strength: 'rare', tier: 'T3', why: '2 of 4 forms ("could NOT be", "is not a solution").' },
  stemModifiers:        { strength: 'rare', tier: 'T3', why: '2 of 4 forms (half of, the square of).' },
  noneOfTheAbove:       { strength: 'rare', tier: 'T3', why: '2 of 4 forms, never as the key.' },
  fourWayOptions:       { strength: 'rare', tier: 'T4', why: '1 form. Rotate; never mandatory.' },
  scaledAxes:           { strength: 'rare', tier: 'T4', why: 'One form scales both axes ("in hundreds"), twice. A real device on thin evidence.' },
  explicitRounding:     { strength: 'rare', tier: 'T4', why: 'One form states a rounding instruction in the stem. Rotate; never required.' },
  namedDataSource:      { strength: 'rare', tier: 'T4', why: '1 form. Only ever with a real, correctly attributed source.' },
  optionWithCaveat:     { strength: 'rare', tier: 'T4', why: 'One option in one form carries its own domain restriction. Elegant, and singular.' },
  proseOnlySharedStim:  { strength: 'rare', tier: 'T4', why: 'One form shares a stimulus that is prose with no graphic at all. Worth keeping available.' },

  // ── optional: vary deliberately ────────────────────────────────────────────
  archetypeChoice:      { strength: 'optional', tier: 'T2', why: 'Which archetype fills a slot is the generator\'s main degree of freedom.' },
  contextChoice:        { strength: 'optional', tier: 'T2', why: 'Bounded by the authenticity model, free within it.' },
  numberChoice:         { strength: 'optional', tier: 'T3', why: 'Bounded by calculator-tractability and distractor separation.' },
};

/**
 * The KAR position, stated once so it cannot drift.
 *
 * The PUBLISHED bands are the generation target and are PUBLISHER-AUTHORITATIVE.
 * OUR item-level classification of the corpus is an imperfect MEASUREMENT that
 * disagrees with them (we measured Knowledge at 14% against a published 35-45%),
 * and it is NOT used as a generation constraint.
 *
 * Where the published specification and our measurement disagree, the
 * SPECIFICATION WINS and the disagreement is recorded rather than resolved by
 * quietly moving the specification. The most likely explanation is that our
 * Knowledge bar is set too high; the corpus contains no publisher-classified
 * exemplar of any band, so there is nothing to calibrate against.
 */
export const KAR_CALIBRATION = {
  target: 'published',                 // never 'measured'
  targetTier: 'T1',
  measurementTier: 'T4',
  measured: { K: 0.14, A: 0.66, R: 0.20 },
  useMeasurementAsConstraint: false,
  blockedOn: 'A KAR rubric applied by two independent passes that agree (artifact 7 section 6).',
  claimAllowed: false,                 // no form may claim to hit the published bands yet
};

/** Published domain bands (PUBLISHER-AUTHORITATIVE, artifact 1 §3). */
export const DOMAIN_BANDS = {
  FA:  { name: 'Foundational Algebra',           min: 0.27, max: 0.32 },
  DAP: { name: 'Data Analysis and Probability',  min: 0.27, max: 0.32 },
  AAF: { name: 'Advanced Algebra and Functions', min: 0.27, max: 0.32 },
  GT:  { name: 'Geometry and Trigonometry',      min: 0.08, max: 0.13 },
};

/** Published cognitive bands (PUBLISHER-AUTHORITATIVE, artifact 1 §4). */
export const KAR_BANDS = {
  K: { name: 'Knowledge',   min: 0.35, max: 0.45 },
  A: { name: 'Application', min: 0.45, max: 0.55 },
  R: { name: 'Reasoning',   min: 0.05, max: 0.15 },
};

/**
 * Family quotas. `range` is what the four reference forms actually did
 * (per form, min..max); `slots` is this blueprint's default draw. A generated
 * form may move off the default but never outside the range.
 */
export const FAMILIES = {
  A01: { domain: 'FA',  label: 'Linear equations & solving',          range: [1, 4],  slots: 3 },
  A02: { domain: 'FA',  label: 'Modelling: build the expression',     range: [0, 3],  slots: 2 },
  A03: { domain: 'FA',  label: 'Systems of equations',                range: [1, 3],  slots: 2 },
  A04: { domain: 'FA',  label: 'Inequalities',                        range: [2, 3],  slots: 3 },
  A05: { domain: 'FA',  label: 'Lines in the plane',                  range: [1, 4],  slots: 3 },
  A18: { domain: 'FA',  label: 'Number properties & logic',           range: [1, 2],  slots: 1 },
  A12: { domain: 'FA',  label: 'Proportional reasoning: rate & cost', range: [1, 4],  slots: 1 },
  A13: { domain: 'DAP', label: 'Data: read a display',                range: [6, 10], slots: 8 },
  A14: { domain: 'DAP', label: 'Statistics: summarise a data set',    range: [3, 3],  slots: 3 },
  A15: { domain: 'DAP', label: 'Probability & counting',              range: [1, 4],  slots: 3 },
  A12b:{ domain: 'DAP', label: 'Percentages: share of a population',  range: [1, 4],  slots: 2 },
  A06: { domain: 'AAF', label: 'Quadratics & parabolas',              range: [2, 5],  slots: 3 },
  A07: { domain: 'AAF', label: 'Polynomials & factoring',             range: [2, 3],  slots: 3 },
  A08: { domain: 'AAF', label: 'Rational expressions & functions',    range: [2, 3],  slots: 2 },
  A09: { domain: 'AAF', label: 'Functions: composition & evaluation', range: [2, 3],  slots: 3 },
  A10: { domain: 'AAF', label: 'Exponents, radicals & complex',       range: [1, 4],  slots: 2 },
  A11: { domain: 'AAF', label: 'Growth & variation',                  range: [1, 2],  slots: 1 },
  A16: { domain: 'GT',  label: 'Geometry: angles & triangles',        range: [1, 3],  slots: 3 },
  A17: { domain: 'GT',  label: 'Geometry: circles, area & solids',    range: [1, 4],  slots: 2 },
};

/**
 * Families the corpus treats as one but this blueprint splits across two
 * domains, with the combined per-form range the corpus actually showed.
 */
export const COMBINED_FAMILY_RANGES = [
  { parts: ['A12', 'A12b'], label: 'Percentages & proportional reasoning', range: [2, 6] },
];

/** Demand bands (artifact 3 §3). `share` is items per 50-item form. */
export const DEMAND_BANDS = {
  entry:   { score: [1, 2], share: [8, 12] },
  core:    { score: [3, 5], share: [26, 32] },
  stretch: { score: [6, 7], share: [6, 10] },
  peak:    { score: [8, 9], share: [1, 3] },
};

/** Form-level device budgets (artifact 2 §4, artifact 1 §6-7). */
export const DEVICE_BUDGETS = {
  shared:        [8, 12],  // items sitting in a shared-stimulus set
  derived:       [6, 12],  // stem asks for a quantity the work does not directly produce
  nts:           [1, 4],   // "Figure not drawn to scale"
  boundary:      [1, 3],   // strict-vs-inclusive discrimination
  roman:         [1, 1],   // exactly one Roman-numeral multi-statement item
  offsheet:      [2, 5],   // requires a formula absent from the reference sheet
  integer:       [1, 3],   // floor / ceiling / "smallest integer such that"
  objectOptions: [1, 2],   // the four options are objects, not values
  rareStimulus:  [1, 2],   // one stimulus from the long tail (§7 of artifact 1)
  fourWay:       [0, 2],   // four options each needing their own computation
};

/** Shared-stimulus set shape (artifact 1 §6). */
export const SET_RULES = {
  count: [3, 5],
  size: [2, 3],
  oversizeSetsAllowed: 1,      // at most one set of 4
  oversizeSetSize: 4,
  firstSetStartsBy: 10,
  lastSetStartsAfter: 39,
  nonGraphicalSetsPerForm: [0, 1],
};

/** Answer-key rules. Deliberately tighter than the corpus — artifact 1 §8. */
export const KEY_RULES = { perLetter: [11, 14], maxRun: 3 };

/**
 * The 50 slots.
 *   d   demand band
 *   set shared-stimulus set id (null = standalone)
 *   f   devices this slot must carry
 */
const S = (q, fam, d, set = null, f = []) => ({ q, fam, d, set, f });

export const SLOTS = [
  S(1,  'A01',  'entry'),
  S(2,  'A12b', 'entry'),
  S(3,  'A02',  'entry'),
  S(4,  'A06',  'core'),
  S(5,  'A05',  'core'),
  S(6,  'A13',  'entry',   'S1', ['rareStimulus']),
  S(7,  'A13',  'core',    'S1'),
  S(8,  'A13',  'core',    'S1'),
  S(9,  'A10',  'stretch'),
  S(10, 'A16',  'core',    null, ['nts']),
  S(11, 'A04',  'core',    null, ['boundary']),
  S(12, 'A07',  'stretch', null, ['derived']),
  S(13, 'A01',  'entry'),
  S(14, 'A17',  'core'),
  S(15, 'A09',  'core'),
  S(16, 'A03',  'stretch', null, ['derived']),
  S(17, 'A14',  'entry'),
  S(18, 'A08',  'core'),
  S(19, 'A13',  'core',    'S2'),
  S(20, 'A13',  'core',    'S2', ['derived']),
  S(21, 'A05',  'core',    null, ['offsheet']),
  S(22, 'A06',  'entry'),
  S(23, 'A12',  'core',    null, ['integer']),
  S(24, 'A18',  'stretch', null, ['roman']),
  S(25, 'A10',  'core',    null, ['offsheet']),
  S(26, 'A15',  'core'),
  S(27, 'A16',  'entry'),
  S(28, 'A06',  'peak',    null, ['derived', 'offsheet']),
  S(29, 'A13',  'core',    'S3'),
  S(30, 'A13',  'core',    'S3'),
  S(31, 'A14',  'core',    'S3'),
  S(32, 'A04',  'entry'),
  S(33, 'A07',  'core'),
  S(34, 'A11',  'core'),
  S(35, 'A16',  'peak',    null, ['nts', 'derived']),
  S(36, 'A03',  'core',    null, ['derived']),
  S(37, 'A09',  'entry'),
  S(38, 'A12b', 'core'),
  S(39, 'A05',  'stretch', null, ['offsheet', 'derived']),
  S(40, 'A08',  'core'),
  S(41, 'A15',  'stretch', null, ['derived']),
  S(42, 'A02',  'core'),
  S(43, 'A14',  'core',    'S4'),
  S(44, 'A13',  'core',    'S4', ['fourWay']),
  S(45, 'A17',  'entry'),
  S(46, 'A04',  'stretch', null, ['boundary', 'derived', 'integer']),
  S(47, 'A09',  'core',    null, ['objectOptions']),
  S(48, 'A15',  'peak'),
  S(49, 'A07',  'core'),
  S(50, 'A01',  'entry'),
];

/**
 * PRODUCT / RENDERING CAPABILITY GAPS.
 *
 * These are NOT exam-design exclusions. Each names an item type the authentic
 * corpus contains, that the blueprint therefore keeps a budget for, and that the
 * CURRENT renderer or schema cannot yet present. The budget stays; the platform
 * has to catch up.
 *
 * A generator authors these items in full, including their figure or choice
 * specification. The delivery layer decides whether they can be presented today.
 * Nothing here is worked around: no diagram is drawn to scale and labelled as if
 * it were not, and no graphical option set is faked as text.
 */
export const RENDERING_CAPABILITY = {
  notToScaleFigure: {
    kind: 'PRODUCT / RENDERING CAPABILITY GAP',
    device: 'nts',
    budgetRetained: true,
    corpusEvidence: '8 items across 4 of 4 forms — core recurring',
    blockedBy: "exam-stimulus.js throws on the 'figure' kind; every plot frame draws to scale",
    requirement: 'docs/engineering/est-generation/R1-figure-renderer-requirements.md',
    interimRule: 'Author the item and its figure spec in full. Do NOT substitute a to-scale ' +
                 'diagram, and do NOT label a to-scale diagram "not drawn to scale".',
  },
  graphicalChoices: {
    kind: 'PRODUCT / RENDERING CAPABILITY GAP',
    device: 'objectOptions',
    budgetRetained: true,
    corpusEvidence: '4 items across 3 of 4 forms — occasional; graphs, number lines, systems, table rows',
    blockedBy: 'exam_questions.choices is [{id, text}] — a string per option',
    requirement: 'docs/engineering/est-generation/R2-answer-choice-schema.md',
    interimRule: 'Text-expressible object choices (systems, prose claims, table rows) are ' +
                 'authorable today. Graph and number-line choices are authored and held.',
  },
};

/** Anti-repetition rules that span forms (artifact 2 §1, artifact 1 §9). */
export const ANTI_REPETITION = {
  archetypeRepeatsWithinForm: 0,          // hard: 191 archetypes over 200 corpus items
  maxArchetypeCarryoverBetweenAdjacentForms: 4,
  maxArchetypeUsesAcrossSeries: 3,
  contextRepeatsWithinForm: 0,            // no two items share a scenario
  maxContextUsesAcrossSeries: 2,
  namedPersonRepeatsWithinForm: 0,
  stimulusTypeMaxPerForm: 5,   // measured: the corpus reaches 5 items on one type
};
