// Difficulty as a SIGNATURE, not a score — Stage 2.
//
// WHAT THIS REPLACES
//
// `DEMAND_BANDS` in est-blueprint.mjs places items by an additive 1-9 score
// built mostly from step count. The n=200 forensic study measured what that
// score is worth: r(steps, RLx) = +0.413 raw, partial r = +0.036 after the
// reasoning mechanisms, and ΔR² = 0.000. Across the four observed bands mean
// step count moves from 2.78 to 3.79 — one step separates Entry from Peak.
//
// So steps stay, but only as a TIME-BUDGET signal. They no longer place items.
//
// WHAT A SIGNATURE IS
//
// A conjunction of admission properties, not a threshold on a sum. A slot of
// band B admits an item when the item's profile satisfies B's predicate. Bands
// deliberately overlap — an easy item is admissible in an easy slot and in a
// slightly harder one — and the FORM-LEVEL quotas, not the signature, fix the
// mix. Nothing here is summed and nothing is ranked.
//
// FOUR PROPERTIES, all read off the item, none of them a total:
//
//   present   how many of the nine mechanisms appear at all (>= 1)
//   biting    how many appear at full strength (= 2)
//   core      how many of the four REASONING-CORE mechanisms bite
//   trap      the trap level from est-primitives.mjs: 0, 1 or 2
//
// `core` is the sharpest discriminator the corpus offers: 0% of Entry items,
// 2% of Core, 40% of Stretch and 86% of Peak bite at least one of
// hidden_step / inference / multiconcept / nonobvious_rel.
//
// PROVENANCE OF EVERY BOUND BELOW
//
// Measured on the 200 coded reference items, banded by RLx with the +4.00
// per-form coder-drift correction applied to T1 and T2 (blind re-code,
// `forensics/blind/drift-report.txt`). trap_cost needed NO correction: its
// blind-re-code shift was +0.05, which is why all four forms count for the trap
// quota while only the drift-corrected RLx bands are used for the shares.
//
//   band     present   biting   core   n
//   Entry     0..5      0..1     0     37
//   Core      1..7      0..2    0..1   48
//   Stretch   2..8      0..3    0..2   52
//   Peak      3..9      1..7    0..4   63
//
// The Peak signature is DELIBERATELY NARROWER than the observed Peak band: it
// requires a reasoning-core mechanism, which 14% of real Peak items do without.
// Generated Peak items therefore sit in the modal Peak profile rather than its
// tail. That is a design choice, stated rather than hidden, and it is measured:
// the signature admits 81% of observed Peak items and 0% of Entry or Core.

export const MECHANISMS = [
  'hidden_step', 'inference', 'multiconcept', 'nonobvious_rel',
  'competing_interp', 'repr_switch', 'filtering', 'abstraction', 'reversal',
];

/** The four mechanisms whose biting separates the bands most sharply. */
export const REASONING_CORE = ['hidden_step', 'inference', 'multiconcept', 'nonobvious_rel'];

/**
 * Read an item's four signature properties.
 *
 * `mechanism` is the primitive's declaration. It is not taken on trust: an item
 * only reaches here after assess() has proved its primary mechanism
 * load-bearing, and Stage 1.5 blind-coded every sub-form against the same
 * 14-dimension frame the reference corpus was coded on. A COMPOSED item carries
 * one counterfactual per mechanism and each is checked separately
 * (est-compose.mjs), which is the stronger case.
 */
export function profileOf(item, trapLevelOf) {
  const m = item.mechanism || {};
  const present = MECHANISMS.filter(k => (m[k] || 0) >= 1).length;
  const biting = MECHANISMS.filter(k => (m[k] || 0) >= 2).length;
  const core = REASONING_CORE.filter(k => (m[k] || 0) >= 2).length;
  const trap = trapLevelOf ? trapLevelOf(item).level : (item.trapLevel ?? null);
  return { present, biting, core, trap, composed: !!item.composedOf };
}

/**
 * The four signatures. Each is a conjunction of admission properties.
 *
 * `composition` is a permission, never a requirement: no band demands a
 * composed item, and the form-level cap keeps composition rare.
 */
export const SIGNATURES = {
  Entry: {
    label: 'Entry',
    admits: p => p.biting <= 1 && p.core === 0 && p.present <= 5 && !p.composed,
    describe: 'at most one mechanism at full strength, none of them a reasoning-core mechanism, and never a composed item',
    composition: 'forbidden',
  },
  Core: {
    label: 'Core',
    admits: p => p.biting <= 2 && p.core <= 1 && p.present >= 1 && p.present <= 7 && p.trap >= 1 && !p.composed,
    describe: 'up to two mechanisms biting, at most one from the reasoning core, some trap present, never composed',
    composition: 'forbidden',
  },
  Stretch: {
    label: 'Stretch',
    admits: p => p.biting >= 1 && p.biting <= 3 && p.core <= 2 && p.present >= 2 && p.trap >= 1,
    describe: 'one to three mechanisms biting, at most two from the reasoning core; composition permitted but never required',
    composition: 'allowed',
  },
  Peak: {
    label: 'Peak',
    admits: p => p.biting >= 2 && p.core >= 1 && p.present >= 4 && p.trap >= 1,
    describe: 'at least two mechanisms biting with at least one from the reasoning core, and at least four mechanisms in play',
    composition: 'allowed',
  },
};

export const BANDS = ['Entry', 'Core', 'Stretch', 'Peak'];

/** Does a slot of this band admit this item? */
export const admits = (band, profile) => SIGNATURES[band].admits(profile);

/**
 * Band shares per 50-item form.
 *
 * `share` is the drift-corrected pooled n=200 proportion; `range` is what the
 * four reference forms actually did, in items of 50. A generated form may move
 * inside the range and never outside it — the same discipline the family quotas
 * already use.
 */
export const BAND_SHARES = {
  Entry:   { pooled: 0.18, range: [6, 16] },
  Core:    { pooled: 0.24, range: [6, 19] },
  Stretch: { pooled: 0.26, range: [8, 16] },
  Peak:    { pooled: 0.32, range: [11, 24] },
};

/**
 * Trap mix per 50-item form — the form-level answer to trap saturation.
 *
 * Solved HERE and not inside the primitives, because assess() requires a
 * mechanism-blind route to land on a printed distractor and that requirement is
 * not being weakened. A routine trap-free item is a legitimate thing for a
 * paper to contain and an illegitimate thing for a mechanism-bearing primitive
 * to fake, so the mixture is an assembly decision.
 *
 * Ranges are the observed per-form counts across all four reference forms.
 * trap_cost is drift-immune (blind re-code shift +0.05), so all four count.
 *
 *   T1  tc0  8   tc1 15   tc2 27
 *   T2  tc0  0   tc1  7   tc2 43
 *   T3  tc0  0   tc1 21   tc2 29
 *   T4  tc0  2   tc1 27   tc2 21
 *   pooled n=200: 5% / 35% / 60%
 */
export const TRAP_MIX = {
  0: { label: 'routine — no natural route lands wrong', range: [0, 8], pooled: 0.05 },
  1: { label: 'natural trap, cheap',                    range: [7, 27], pooled: 0.35 },
  2: { label: 'natural trap, full cost',                range: [21, 43], pooled: 0.60 },
};

/**
 * Mechanism targets per 50-item form, as counts of items in which the mechanism
 * BITES (= 2).
 *
 * `range` is the observed per-form span across all four reference forms.
 * `anchor` is T3+T4 only — the two forms coded at the current standard — and is
 * the trustworthy figure, because every mechanism here except none is a
 * JUDGEMENT dimension and T1/T2 are ~0.4 under-coded on those.
 *
 * `estm1Gap` records where ESTM1-2026-A fell short, which is what Stage 1 was
 * built to fix; it is documentation, not a constraint.
 */
export const MECHANISM_TARGETS = {
  hidden_step:      { range: [13, 17], anchor: [16, 17], estm1: 8,  note: 'strongest and most stable mechanism in the study' },
  repr_switch:      { range: [6, 14],  anchor: [12, 14], estm1: 16, note: 'the one mechanism ESTM1-A already over-produced' },
  abstraction:      { range: [8, 14],  anchor: [8, 11],  estm1: 7 },
  inference:        { range: [2, 10],  anchor: [9, 10],  estm1: 4 },
  filtering:        { range: [5, 12],  anchor: [5, 12],  estm1: 6 },
  competing_interp: { range: [5, 8],   anchor: [8, 8],   estm1: 1,
                      gated: true, gateReason: 'competing_interp flips sign across the four forms; P-SCOPE stays unscheduled until n>=250 or the paired-solver gate' },
  multiconcept:     { range: [5, 14],  anchor: [7, 8],   estm1: 7,  needsComposition: true },
  nonobvious_rel:   { range: [3, 11],  anchor: [3, 5],   estm1: 4 },
  reversal:         { range: [0, 6],   anchor: [4, 6],   estm1: 3 },
};

/**
 * Composition limits. Depth is capped at two by the option format, not by
 * taste: the composed route set is the PRODUCT of the parents', so two
 * mechanisms yield exactly three mechanism-blind combinations and a four-option
 * item has exactly three distractor slots. Three mechanisms would need seven.
 */
export const COMPOSITION_LIMITS = {
  maxDepth: 2,
  perForm: [2, 6],
  allowedBands: ['Stretch', 'Peak'],
  reason: 'the route product fills a four-option grid exactly at depth two; depth three needs seven distractors and cannot be printed',
};

/**
 * Structural diversity. Stage 1.5 gave P-NAMED-CONFIG ten archetypes; this
 * stops a form from spending them on one. The unit is the ARCHETYPE — the
 * structural identity — never the surface numbers.
 */
export const ARCHETYPE_DIVERSITY = {
  maxPerArchetype: 2,
  maxPerSubForm: 3,
  maxPerPrimitive: 8,
  minDistinctArchetypes: 18,
  reason: 'a student meets a form once; repetition inside it is what lets pattern-matching replace the mechanism',
};

/** Steps survive only as a time budget. This is the whole of their remaining role. */
export const TIME_BUDGET = {
  minutesPerForm: 75,
  secondsPerStep: 18,
  fixedSecondsPerItem: 25,
  tolerance: 0.15,
  note: 'steps no longer place items: partial r with RLx is +0.036 and ΔR² is 0.000 once the reasoning mechanisms are in the model',
};

/**
 * THE ROUTINE STREAM.
 *
 * Measured on the 200 coded reference items: **53% have an Entry profile** —
 * at most one mechanism biting and no reasoning-core mechanism among them — and
 * **71% have an Entry-or-Core profile**. The Stage-1/1.5 primitive library
 * produces NONE of those, because every primitive in it was built to make a
 * mechanism bite.
 *
 * This is the trap-saturation finding one level up, and it has the same shape
 * and the same resolution: a bank of mechanism-bearing items is not a paper.
 * Most of an authentic form is routine work, and routine items must come from
 * routine generation rather than from a mechanism primitive pretending to be
 * gentle. Faking them inside a primitive would mean weakening assess(), which
 * is not on offer.
 *
 * The dry run uses this declared profile to test whether the CONSTRAINT SYSTEM
 * is consistent — band shares against trap mix against family quotas — while
 * reporting separately, and first, how many slots real generated items filled.
 * A slot filled from this stream is not a generated question and is never
 * counted as one.
 */
export const ROUTINE_STREAM = {
  generated: false,
  source: 'the existing non-mechanism generator constructs; not one of the eight Stage-1 primitives',
  profile: { present: 3, biting: 0, core: 0, trap: 1, composed: false },
  evidence: { entryProfileShare: 0.53, entryOrCoreProfileShare: 0.71, n: 200 },
  note: 'declared so the dry run can test constraint consistency; it proves nothing about generation',
};
