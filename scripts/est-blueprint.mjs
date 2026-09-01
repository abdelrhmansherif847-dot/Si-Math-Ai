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
