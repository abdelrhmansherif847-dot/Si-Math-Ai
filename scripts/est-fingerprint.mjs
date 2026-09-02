// Structural fingerprint and anti-clone detection — artifact 13 section 9.
//
// WHY THIS EXISTS
//
// ESTM1-2026-A Q23 reproduced a reference item's context, device, mathematical
// transformation, target, option architecture, distractor logic and narrative —
// AND its actual constants. Nothing in the pipeline noticed. Surface-number
// variation is not originality, so the comparison has to be structural.
//
// SEVEN AXES (section 9.2). Values are erased on every axis; what is compared
// is the SHAPE.
//
//   ctx        narrative frame + stimulus kind
//   chain      the ordered transformation, operation types only
//   target     what is asked, plus any shift applied to it
//   options    the pattern the option values form
//   distract   the D-class multiset plus the primary trap
//   narrative  entity count, roles, given/asked skeleton, anonymised
//   numeric    the ROLES the constants play, never their values
//
// THRESHOLDS
//   >= 5 of 7 against the reference corpus  -> clone
//   >= 5 of 7 against a sibling in the form -> clone
//   >= 6 of 7 across the series             -> clone
//   chain AND target both matching          -> clone regardless of the rest,
//                                              because that pair is what the
//                                              item actually tests
//
// AXIS COMPARISON IS NOT STRING EQUALITY. The clone that started this had
// archetype `budget-fixed-fee-integer-floor` against the reference's
// `budget-integer-floor`. Exact matching misses it by three characters. Every
// axis is compared as a token set with a Jaccard threshold, so near-identical
// naming still registers.
//
// The reference table stores FINGERPRINTS ONLY — no stem, no options, no
// numbers. That is what lets the comparison set live in a public repository
// while the corpus does not.

/* ────────────────────────── tokens and similarity ────────────────────────── */

/** Split an axis value into a comparable token set. */
export function tokens(value) {
  const flat = Array.isArray(value) ? value.join(' ') : String(value ?? '');
  return new Set(
    flat.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(t => t && !STOP.has(t))
  );
}
const STOP = new Set(['the', 'a', 'of', 'to', 'and', 'in', 'from', 'with', 'by', 'on']);

/** Jaccard over token sets. Two empty sets are not similar — they are unknown. */
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export const AXES = ['ctx', 'chain', 'target', 'options', 'distract', 'narrative', 'numeric'];

/** Per-axis similarity above which the axis counts as matching. */
export const AXIS_THRESHOLD = {
  ctx: 0.5, chain: 0.5, target: 0.6, options: 0.6, distract: 0.6, narrative: 0.5, numeric: 0.5,
};

/**
 * The chain axis carries two different KINDS of value, and they need different
 * thresholds.
 *
 *   a free-text archetype LABEL — what the reference database records, e.g.
 *   `budget-fixed-fee-integer-floor`. Loose matching is right here: the clone
 *   that motivated this whole system differed from its source by three
 *   characters, and exact matching missed it.
 *
 *   a structured STEP LIST — what a generated item supplies, e.g.
 *   ['parse-vertex-names', 'locate-right-angle', 'ratio-adj2hyp', 'special-60'].
 *   Loose matching is wrong here: every item of a type shares its setup steps,
 *   so boilerplate dominates the token set and two genuinely different
 *   transformations score 0.818 on nine shared tokens out of eleven. A chain is
 *   a sequence of operations, and two chains that differ in any operation are
 *   different transformations.
 *
 * Measured on real items: two draws from ONE sub-form score 1.000; two draws
 * with different transformations score 0.818. The threshold below separates
 * them, and the reference-table comparisons are untouched because their chains
 * are strings.
 */
export const CHAIN_STEPLIST_THRESHOLD = 0.9;
const isStepList = v => Array.isArray(v) && v.length > 1;

/* ────────────────────────── building a fingerprint ────────────────────────── */

/**
 * Fingerprint a generated item. Reads `fingerprintParts`, which every primitive
 * in est-primitives.mjs supplies, and never touches the stem text.
 */
export function fingerprintItem(item) {
  const p = item.fingerprintParts || {};
  return {
    id: item.id || `${item.primitive}#${item.seed ?? '?'}`,
    source: 'generated',
    ctx: p.ctx ?? null,
    chain: p.chain ?? null,
    target: p.target ?? null,
    options: p.options ?? null,
    distract: p.distract ? [...p.distract].sort().join(' ') + ' primary:' + (p.distract[0] ?? '') : null,
    narrative: p.narrative ?? null,
    numeric: p.numeric ?? null,
  };
}

/**
 * Fingerprint a row of the reference archetype database. FOUR axes are
 * populated from what that database records; `options`, `narrative` and
 * `numeric` are not recorded there and stay null. A null axis never matches,
 * so the reference comparison runs at a documented four-axis strength, and the
 * >=5 threshold cannot be reached against it — which is why `chain AND target`
 * is a clone on its own. See section 9.4 and the Stage 1 report.
 */
export function fingerprintReferenceRow(row) {
  return {
    id: `${row.form}-Q${row.q}`,
    source: 'reference',
    ctx: [row.stim === '-' ? 'no-stimulus' : `stimulus:${row.stim}`, row.devices === '-' ? '' : row.devices].join(' ').trim(),
    chain: row.archetype,
    target: `${row.target}:${row.domain}`,
    options: null,
    distract: row.distractor_family || null,
    narrative: null,
    numeric: null,
  };
}

/* ────────────────────────── comparison ────────────────────────── */

/** Per-axis match report between two fingerprints. */
export function compare(a, b) {
  const per = {};
  let matched = 0, comparable = 0;
  for (const ax of AXES) {
    if (a[ax] == null || b[ax] == null) { per[ax] = null; continue; }
    comparable++;
    const sim = jaccard(tokens(a[ax]), tokens(b[ax]));
    const need = ax === 'chain' && isStepList(a[ax]) && isStepList(b[ax])
      ? CHAIN_STEPLIST_THRESHOLD : AXIS_THRESHOLD[ax];
    const hit = sim >= need;
    per[ax] = { sim: Number(sim.toFixed(3)), hit };
    if (hit) matched++;
  }
  return { per, matched, comparable };
}

export const CLONE_RULES = {
  reference: 5,
  sibling: 5,
  series: 6,
};

/**
 * Decide whether `candidate` clones anything in `table`.
 * `scope` picks the threshold; `chain AND target` is decisive at every scope.
 */
export function detectClone(candidate, table, scope = 'reference') {
  const need = CLONE_RULES[scope];
  if (!need) throw new Error(`unknown clone scope ${scope}`);
  const hits = [];
  let maxComparable = 0;
  for (const other of table) {
    if (other.id === candidate.id) continue;
    const c = compare(candidate, other);
    if (c.comparable > maxComparable) maxComparable = c.comparable;
    const decisivePair = c.per.chain?.hit && c.per.target?.hit;
    if (c.matched >= need || decisivePair) {
      hits.push({
        against: other.id,
        matched: c.matched,
        comparable: c.comparable,
        reason: decisivePair && c.matched < need ? 'chain+target decisive pair' : `${c.matched} of ${c.comparable} axes`,
        per: c.per,
      });
    }
  }
  hits.sort((x, y) => y.matched - x.matched);

  // STRENGTH. A fingerprint comparison is only as good as the axes both sides
  // populate. Generated-vs-generated compares all seven. Generated-vs-reference
  // compares the four the archetype database records, of which `distract` uses
  // a different vocabulary on each side and never matches — so three are live.
  //
  // At three live axes the decisive `chain AND target` pair cannot separate
  // legitimate archetype reuse (the generator is BUILT from the archetype
  // library) from a real clone, because the two things that would separate
  // them — the narrative frame and the numeric skeleton — are exactly the
  // axes the reference table cannot populate. Measured on ESTM1-2026-A: 12 of
  // 50 items flag against the corpus, of which one is the known true positive.
  //
  // So a reduced-strength result is a REVIEW CANDIDATE, never a rejection.
  // Enforcement runs at full strength only. Populating the reference table's
  // narrative and numeric axes is named Stage-1-remaining work.
  // Strength is a property of the COMPARISON, not of the candidate: it is how
  // many axes both sides populate. Reading it off the candidate alone reported
  // seven against a table that can only offer four.
  const strength = maxComparable >= 5 ? 'full' : 'reduced';
  return { clone: hits.length > 0 && strength === 'full', candidates: hits.length > 0, strength, comparable: maxComparable, hits };
}

/** Build a table from an array of generated items. */
export const fingerprintAll = items => items.map(fingerprintItem);
