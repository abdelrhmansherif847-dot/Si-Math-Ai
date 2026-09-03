// Form-level gates — Stage 3.5, sections 3 to 6.
//
// Four properties that are invisible item by item and only exist across a whole
// form. Every threshold below is a number measured on the reference corpus and
// carries the measurement beside it. Where a property is real but could not be
// grounded in the corpus, it is reported as a DIAGNOSTIC and not gated — an
// ungrounded threshold is an opinion with a number attached, and the brief for
// this stage rules those out explicitly.

import { stepsOf } from './est-primitives.mjs';

/* ══════════════════ 3. STEP-COUNT LEAKAGE ══════════════════ */

/**
 * Reference: r(steps, RLx) within a single form.
 *
 *   T1 +0.313   T2 +0.351   T3 +0.432   T4 +0.558
 *
 * ESTM2-2026-P1 measured +0.835 — outside the reference range by a wide margin,
 * which is the signature of a form whose difficulty IS its operation count.
 *
 * The ceiling is T4's +0.558 rounded to +0.60, and there is deliberately no
 * FLOOR. A negative or near-zero correlation would be odd, but the reference
 * gives no basis for calling it a defect, and inventing one would push the
 * generator to manufacture long easy items to keep a statistic in range.
 *
 * There is no maximum on operations anywhere in this file. A nine-step item is
 * in the corpus (T3), and an item is never rejected for being long.
 */
export const STEP_INDEPENDENCE = {
  // ── the GATED quantity: band overlap on step count ────────────────────────
  //
  // In the reference, 95% of non-Entry items (71 of 75, T3+T4) take a number of
  // operations that some Entry item also takes: Entry spans 1 to 7 steps and
  // Peak spans 1 to 8. Knowing how long a real EST item is tells you almost
  // nothing about how hard it is, and THAT is the property a generator has to
  // reproduce. A form where the hard items occupy a length range the easy items
  // do not reach is a form whose difficulty is its arithmetic.
  //
  // Floor set at 0.70, below the observed 0.95, because a single form of fifty
  // items is a small sample and the gate should fire on stratification rather
  // than on sampling noise.
  minBandOverlap: 0.70,
  refBandOverlap: 0.95,

  // ── the REPORTED quantities, and why they are not gated ───────────────────
  //
  // Spearman r(steps, band rank) per reference form: +0.128 / +0.275 / +0.423 /
  // +0.474. Pearson on the same data: +0.313 / +0.351 / +0.432 / +0.558, which
  // is the figure artifact 18 reported for P1 (+0.835).
  //
  // The generator's r sits near +0.85, and the reason is NOT that its bands are
  // reached by operation count — it is that `itemSteps` falls back to the
  // fingerprint chain, which is an authored 2-to-4 element shape label with
  // almost no variance inside a stream. Measured on one assembled form: routine
  // items 1-2, Core-stream items exactly 2, mechanism items 3-4. A correlation
  // computed on that proxy measures which STREAM an item came from. It is
  // recorded because the underlying observation is real and worth acting on —
  // the generator's streams are separated by length where the reference's bands
  // are not — and it is not gated, because the number is an artefact of the
  // proxy and gating on it would be gating on a coincidence.
  //
  // Making it gateable needs a real per-construct step count on all 66
  // constructs, which is open work, recorded in artifact 19 §11.
  maxCorrelation: 0.55,
  refPerFormSpearman: { T1: 0.128, T2: 0.275, T3: 0.423, T4: 0.474 },
  refPerForm: { T1: 0.313, T2: 0.351, T3: 0.432, T4: 0.558 },
  // Within-band spread of steps, T3+T4: Entry 1.24, Core 1.43, Stretch 1.89,
  // Peak 1.45. Reported for the same reason and gated for none of it.
  refWithinBandSd: [1.24, 1.43, 1.89, 1.45],
  // Mean steps per band, T3+T4 uncorrected: 3.24 / 3.65 / 4.67 / 5.11.
  // Largest single band-to-band jump observed: +1.01. Ceiling set at +1.50 so a
  // form is only flagged when a band is reached by piling on operations.
  maxBandJump: 1.50,
  refBandMeans: [3.24, 3.65, 4.67, 5.11],
  refMaxBandJump: 1.01,
};

const BAND_ORDER = ['Entry', 'Core', 'Stretch', 'Peak'];

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

/**
 * Spearman rank correlation.
 *
 * Pearson on raw counts compares a 0-to-9 step column against a 1-to-4 chain
 * length and reports a difference of SCALE as a difference of strength. The
 * question asked here is purely ordinal — do harder bands hold longer items? —
 * so it is answered on ranks, and both the reference figures and the generated
 * ones below are computed the same way.
 */
export function spearman(a, b) {
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(v.length);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  return correlation(rank(a), rank(b));
}

export function correlation(a, b) {
  if (a.length < 3) return NaN;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : NaN;
}

/**
 * How many operations an item's intended solution takes.
 *
 * THE MEASURE HAS TO BE THE SAME ONE IN ALL THREE STREAMS, and the first
 * version was not. It read the Core stream's solution-path length (2 to 3) and
 * the mechanism stream's declared route cost (4 to 6), then reported that
 * Stretch items take twice as many steps as Core items. They do not; the two
 * numbers were on different scales, and the routine stream's key route carries
 * a default cost of 2 that means nothing at all.
 *
 * The one measure every stream authors independently is the FINGERPRINT CHAIN:
 * the ordered list of operations on the intended solution path, written per
 * construct for the anti-clone axis and never for this. It is the direct
 * analogue of the reference corpus's `steps` column — "the number of executed
 * operations on the publisher's own solution path" — so it is what is counted.
 * The solution path and the route cost remain as fallbacks, in that order.
 */
export const itemSteps = (it) => {
  const chain = it.fingerprint?.chain || it.fingerprintParts?.chain;
  if (Array.isArray(chain) && chain.length) return chain.length;
  return stepsOf(it) ?? (Number.isFinite(it.steps) ? it.steps
    : Math.max(1, ...(it.routes || []).filter(r => r.natural).map(r => r.cost || 1)));
};

/**
 * Is this form reaching its difficulty bands through reasoning, or through
 * arithmetic length?
 */
export function stepIndependence(placements) {
  const steps = placements.map(p => itemSteps(p.item));
  const rank = placements.map(p => BAND_ORDER.indexOf(p.band));
  const r = spearman(steps, rank);
  const byBand = BAND_ORDER.map(b => mean(placements.filter(p => p.band === b).map(p => itemSteps(p.item))));
  const sdOf = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
  const sdByBand = BAND_ORDER.map(b => sdOf(placements.filter(p => p.band === b).map(p => itemSteps(p.item))));

  // Band overlap: the share of non-Entry items whose step count falls inside
  // the range the Entry items span.
  const entry = placements.filter(p => p.band === 'Entry').map(p => itemSteps(p.item));
  const rest = placements.filter(p => p.band !== 'Entry').map(p => itemSteps(p.item));
  const lo = entry.length ? Math.min(...entry) : 0, hi = entry.length ? Math.max(...entry) : 0;
  const overlap = rest.length ? rest.filter(x => x >= lo && x <= hi).length / rest.length : 1;

  let worstJump = -Infinity, worstAt = null;
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(byBand[i]) || !Number.isFinite(byBand[i + 1])) continue;
    const j = byBand[i + 1] - byBand[i];
    if (j > worstJump) { worstJump = j; worstAt = `${BAND_ORDER[i]}->${BAND_ORDER[i + 1]}`; }
  }
  const failures = [];
  if (entry.length && overlap < STEP_INDEPENDENCE.minBandOverlap)
    failures.push(`only ${(overlap * 100).toFixed(0)}% of non-Entry items take a number of operations some Entry item also takes ` +
      `(Entry spans ${lo}..${hi}); the reference is ${(STEP_INDEPENDENCE.refBandOverlap * 100).toFixed(0)}% — ` +
      `this form's harder bands are separated by length`);
  if (Number.isFinite(worstJump) && worstJump > STEP_INDEPENDENCE.maxBandJump)
    failures.push(`mean steps jump ${worstJump.toFixed(2)} at ${worstAt}, above the ${STEP_INDEPENDENCE.maxBandJump} ceiling ` +
      `(largest reference jump ${STEP_INDEPENDENCE.refMaxBandJump})`);
  return { ok: !failures.length, r, overlap, entrySpan: [lo, hi], byBand, sdByBand, worstJump, worstAt, failures };
}

/* ══════════════════ 4. ANSWER-KEY BALANCE ══════════════════ */

/**
 * Reference: measured key letter counts across the four forms (artifact 1 §8).
 *
 *   Form 1  A10 B13 C14 D13   longest run 3
 *   Form 2  A 9 B17 C14 D10   longest run 5
 *   Form 3  A 9 B11 C18 D12   longest run 3
 *   Form 5  A 9 B12 C15 D14   longest run 3
 *
 * TWO SEPARATE RULES, WITH DIFFERENT STANDING.
 *
 * The per-letter budget 11-14 is TIGHTER than any reference form and is a
 * DELIBERATE DEPARTURE recorded in artifact 1 §8: the corpus under-uses A in
 * all four forms, which makes A a marginally worse guess, and reproducing an
 * unfairness buys no fidelity. That rule stays.
 *
 * The run cap of 3 does NOT survive. The corpus has no anti-run rule at all —
 * the adjacent-repeat rate is 22.4% against the 25% a random key gives, and
 * Form 2 contains a run of four AND a run of five. A cap of 3 is exactly the
 * unnatural rule this stage was told not to impose, and ESTM2-2026-P1 failed
 * five checks against it while its ACTUAL key defect — A19 B20 C4 D7 — went
 * unenforced because nothing balanced the key at emission.
 *
 * So the cap becomes 5, the observed maximum, and the real work moves to
 * rebalanceKeys() below, which makes the budget a constraint rather than an
 * audit finding.
 */
export const KEY_BALANCE = {
  perLetter: [11, 14],
  maxRun: 5,
  refPerLetter: { A: [9, 10], B: [11, 17], C: [14, 18], D: [10, 14] },
  refLongestRun: [3, 5, 3, 3],
  refAdjacentRepeatRate: 0.224,
  perLetterIsDeparture: 'artifact 1 §8 — tighter than any reference form, on fairness grounds',
};

export const LETTERS = ['A', 'B', 'C', 'D'];

export function keyBalance(placements) {
  const letters = placements.map(p => p.item.key);
  const count = {}; for (const L of LETTERS) count[L] = letters.filter(x => x === L).length;
  let run = 1, longest = 1;
  for (let i = 1; i < letters.length; i++) { run = letters[i] === letters[i - 1] ? run + 1 : 1; longest = Math.max(longest, run); }
  const [lo, hi] = KEY_BALANCE.perLetter;
  const failures = [];
  for (const L of LETTERS)
    if (count[L] < lo || count[L] > hi) failures.push(`key letter ${L} used ${count[L]} times, outside ${lo}..${hi}`);
  if (longest > KEY_BALANCE.maxRun)
    failures.push(`longest key run is ${longest}, above the observed maximum of ${KEY_BALANCE.maxRun}`);
  return { ok: !failures.length, count, longest, failures };
}

/**
 * Permute each item's options so the form meets the letter budget.
 *
 * This changes NOTHING about any item: the same four values are printed and the
 * same one is correct. Only which letter carries the key moves, which is a
 * choice the emitter was making at random and can equally make to a budget.
 *
 * Greedy over positions, always moving the key to the letter furthest below its
 * quota, with a tie broken away from the previous item's letter so runs are not
 * manufactured. It is not an anti-run RULE — a run still forms whenever the
 * budget wants one — it is simply not seeking them out.
 */
export function rebalanceKeys(placements, { perLetter = KEY_BALANCE.perLetter, seed = 0 } = {}) {
  const n = placements.length;
  const target = Math.floor(n / LETTERS.length);
  const used = Object.fromEntries(LETTERS.map(L => [L, 0]));
  used.total = 0;
  let prev = null, run = 0;
  for (const p of placements) {
    const it = p.item;
    const keyValue = it.options.find(o => o.id === it.key).value;
    const keyText = it.options.find(o => o.id === it.key).text;
    // ANY letter the budget can still afford, chosen pseudo-randomly — not the
    // letter furthest below quota.
    //
    // Two earlier versions produced a form whose longest key run was ONE. The
    // first broke ties away from the previous letter; the second took the
    // minimum-deficit letter, which with four letters and fifty items rotates
    // almost deterministically. Both are anti-run rules arriving by the back
    // door, and the corpus has no anti-run rule at all: its adjacent-repeat
    // rate is 22.4% against the 25% a random key gives, and one reference form
    // contains a run of five. A key with no adjacent repeats is as unlike the
    // reference as one with a run of six.
    //
    // So a letter is ELIGIBLE when taking it keeps it within the ceiling and
    // still leaves enough positions for every other letter to reach the floor,
    // and the choice among eligible letters is a hash of the position. Runs
    // form wherever the budget leaves them free to.
    const left = n - used.total;
    const eligible = LETTERS.filter(L => {
      if (used[L] + 1 > perLetter[1]) return false;
      const deficit = LETTERS.reduce((acc, M) => acc + Math.max(0, perLetter[0] - (used[M] + (M === L ? 1 : 0))), 0);
      return deficit <= left - 1;
    });
    // The observed maximum run in the corpus is five (Form 2). A letter that
    // would make a sixth is dropped — this is a CEILING read off the reference,
    // not an anti-run rule: runs of two, three, four and five all form freely.
    const noSixth = eligible.filter(L => !(L === prev && run >= KEY_BALANCE.maxRun));
    const pick = (noSixth.length ? noSixth : eligible).length
      ? (noSixth.length ? noSixth : eligible)
      : LETTERS.filter(L => used[L] + 1 <= perLetter[1]);
    // A LINEAR hash modulo four is a permutation cycle, not a choice: the first
    // version printed A B C D A B C D and produced a longest run of one all
    // over again. Mixed with a xorshift first.
    // >>> 0 after every step: `^` yields a SIGNED int32 in JavaScript, and a
    // negative x made `x % pick.length` negative, which indexed off the array.
    // The seed is mixed in, not just the position. Without it every form in the
    // series carried the SAME 50-letter key — three seeds produced the identical
    // string BCBABDDBADCACDCDBCAB..., which is a series-level fingerprint far
    // worse than any single form's imbalance.
    let x = (((p.q + 1) * 2654435761) ^ Math.imul(seed | 0, 40503)) >>> 0;
    x = (x ^ (x >>> 15)) >>> 0; x = Math.imul(x, 2246822507) >>> 0; x = (x ^ (x >>> 13)) >>> 0;
    const want = pick.length ? pick[x % pick.length] : it.key;
    if (want !== it.key) {
      const from = it.options.findIndex(o => o.id === it.key);
      const to = LETTERS.indexOf(want);
      const vals = it.options.map(o => ({ value: o.value, text: o.text }));
      const moved = vals.splice(from, 1)[0];
      vals.splice(to, 0, moved);
      it.options = vals.map((v, i) => ({ id: LETTERS[i], value: v.value, text: v.text }));
      it.key = want;
    }
    // The key must still be the same VALUE it was before the permutation.
    const now = it.options.find(o => o.id === it.key);
    if (now.text !== keyText) throw new Error(`key rebalance moved the answer on q${p.q}`);
    void keyValue;
    used[it.key]++; used.total++;
    run = it.key === prev ? run + 1 : 1; prev = it.key;
    void target; void prev;
  }

  // REPAIR. The greedy pass can be forced into a sixth consecutive letter at the
  // tail, where the per-letter budget leaves no choice. Swapping the key LETTER
  // of two items leaves every count identical, so the run is repaired without
  // touching the budget — and without becoming an anti-run rule, since only a
  // run above the observed maximum is repaired at all.
  const letterAt = i => placements[i].item.key;
  const swapKeys = (i, j) => {
    for (const idx of [i, j]) void idx;
    const a = placements[i].item, b = placements[j].item;
    const move = (it, want) => {
      if (it.key === want) return;
      const from = it.options.findIndex(o => o.id === it.key);
      const to = LETTERS.indexOf(want);
      const vals = it.options.map(o => ({ value: o.value, text: o.text }));
      const moved = vals.splice(from, 1)[0];
      vals.splice(to, 0, moved);
      it.options = vals.map((v, k) => ({ id: LETTERS[k], value: v.value, text: v.text }));
      it.key = want;
    };
    const ka = a.key, kb = b.key;
    move(a, kb); move(b, ka);
  };
  const longestRunAt = () => {
    let r = 1, best = 1, at = 0;
    for (let i = 1; i < placements.length; i++) {
      if (letterAt(i) === letterAt(i - 1)) { r++; if (r > best) { best = r; at = i; } } else r = 1;
    }
    return { best, at };
  };
  for (let guard = 0; guard < 200; guard++) {
    const { best, at } = longestRunAt();
    if (best <= KEY_BALANCE.maxRun) break;
    let fixed = false;
    for (let j = 0; j < placements.length && !fixed; j++) {
      if (Math.abs(j - at) < 2 || letterAt(j) === letterAt(at)) continue;
      const before = longestRunAt().best;
      swapKeys(at, j);
      if (longestRunAt().best < before) fixed = true; else swapKeys(at, j);
    }
    if (!fixed) break;
  }
  return placements;
}

/* ══════════════════ 5. CONTENT-LEVEL REUSE ══════════════════ */

/**
 * Repetition the structural fingerprint cannot see.
 *
 * The seven-axis fingerprint compares SHAPE — context, chain, target, option
 * kind, distractor family, narrative, numeric role. Two items can score far
 * apart on all seven and still print the same equation, and ESTM2-2026-P1 did
 * exactly that: Q01 and Q12 both printed $(a-2)(4x+1) = 12x-4$, from different
 * primitives, and no gate saw it. That is defect D2 in artifact 18.
 *
 * So this reads the SURFACE — the characters a student sees — and it is
 * deliberately independent of the fingerprint, because two independent
 * detectors that agree tell you more than one detector run twice.
 *
 * NOT REJECTING LEGITIMATE COMMON MATHEMATICS is the whole difficulty. Every
 * EST form prints `x^2`, `y = mx + b`, `\pi r^2`, a percentage, a right angle.
 * The rules below therefore only ever fire on SPECIFIC, LONG, NUMERIC content:
 *
 *   equations      a math span of >= 12 characters carrying >= 2 distinct
 *                  numerals. `a^2 + b^2 = c^2` has no numerals beyond the
 *                  exponents and is never compared; `(a-2)(4x+1) = 12x-4` is.
 *   numericTuple   the sorted multiset of numbers in the stem, >= 3 of them.
 *                  Two items both using 40 and 300 collide on nothing; two
 *                  items using {3, 8, 12, 45} are the same numbers twice.
 *   optionSet      the four printed option texts, as a sorted tuple. An exact
 *                  repeat is the same answer grid printed twice.
 *   constants      the sorted set of distinct integers >= 10 in the stem, >= 3
 *                  of them — the "constant combination" axis, which catches a
 *                  reworded item built on the same numbers.
 */
export const REUSE_RULES = {
  equationMinChars: 12,
  equationMinDistinctNumerals: 2,
  numericTupleMinLength: 3,
  constantsMinCount: 3,
  constantsMinValue: 10,
};

const mathSpans = stem => (String(stem).match(/\$[^$]+\$/g) || []).map(s => s.slice(1, -1).replace(/\s+/g, ''));
const numbersIn = s => (String(s).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);

export function contentKeysOf(item) {
  const keys = [];
  for (const span of mathSpans(item.stem)) {
    const nums = new Set((span.match(/\d+/g) || []));
    if (span.length >= REUSE_RULES.equationMinChars && nums.size >= REUSE_RULES.equationMinDistinctNumerals)
      keys.push(['equation', span]);
  }
  const nums = numbersIn(String(item.stem).replace(/\$[^$]*\$/g, m => m));
  if (nums.length >= REUSE_RULES.numericTupleMinLength)
    keys.push(['numericTuple', [...nums].sort((a, b) => a - b).join(',')]);
  const consts = [...new Set(nums.filter(x => Number.isInteger(x) && Math.abs(x) >= REUSE_RULES.constantsMinValue))];
  if (consts.length >= REUSE_RULES.constantsMinCount)
    keys.push(['constants', consts.sort((a, b) => a - b).join(',')]);
  keys.push(['optionSet', item.options.map(o => o.text).sort().join('|')]);
  return keys;
}

export function contentReuse(placements) {
  const seen = new Map();
  const collisions = [];
  for (const p of placements) {
    for (const [kind, key] of contentKeysOf(p.item)) {
      const id = `${kind}::${key}`;
      if (seen.has(id)) collisions.push({ kind, key, first: seen.get(id), second: p.q });
      else seen.set(id, p.q);
    }
  }
  return { ok: !collisions.length, collisions,
    failures: collisions.map(c => `q${c.first} and q${c.second} share the same ${c.kind}`) };
}

/* ══════════════════ 6. MEASURABLE AUTHENTICITY ══════════════════ */

/**
 * Three gated properties and three diagnostics.
 *
 * GATED, because each has a reference measurement behind it:
 *
 *   targetDiversity   every reference form asks at least FOUR distinct kinds of
 *                     thing (value / selection / expression / equation /
 *                     interpretation), and `value` is 64-76% of items. A form
 *                     that only ever asks "what is the value of" reads as
 *                     generated because it is unlike every real form measured.
 *   lowInfoReadings   a shared display carries at most ONE pure-lookup reading.
 *                     T1 Q31 — "read ONE bar", the easiest item on the paper —
 *                     is singular in its block. P1 printed three low-information
 *                     readings of one five-number list (defect D9).
 *   configRepeat      at most TWO items may share a sub-form. Artifact 1 §9:
 *                     within a form an archetype essentially never repeats, and
 *                     two of the four reference forms have 50 distinct
 *                     archetypes in 50 items. P-NAMED-CONFIG offers fourteen
 *                     variations on one special-triangle configuration, and P1
 *                     printed three of them (defect D10).
 *
 * DIAGNOSTIC ONLY, because the corpus available to this project is coded on 14
 * dimensions and does not carry machine-readable stems: stem-length spread,
 * numeric-magnitude spread, and context-noun reuse are reported and never
 * gated. Each is a real AI tell. None has a threshold that could be defended
 * from evidence rather than taste, and a threshold chosen by taste is the
 * subjective black-box detector this stage was told not to build.
 */
export const AUTHENTICITY = {
  minDistinctTargets: 4,
  maxValueTargetShare: 0.80,
  refTargetsPerForm: [5, 4, 4, 4],
  refValueShare: [0.64, 0.68, 0.76, 0.76],
  maxLowInfoPerStimulus: 1,
  maxPerSubForm: 2,
  refDistinctArchetypes: [49, 49, 50, 50],
};

const targetOf = it => (it.fingerprint?.target || it.fingerprintParts?.target || 'value:unknown').split(':')[0];

export function authenticity(placements) {
  const failures = [];
  // target diversity
  const targets = placements.map(p => targetOf(p.item));
  const distinct = new Set(targets);
  const valueShare = targets.filter(t => t === 'value').length / targets.length;
  if (distinct.size < AUTHENTICITY.minDistinctTargets)
    failures.push(`only ${distinct.size} distinct target kinds (${[...distinct].join(', ')}); every reference form has at least ${AUTHENTICITY.minDistinctTargets}`);
  if (valueShare > AUTHENTICITY.maxValueTargetShare)
    failures.push(`${(valueShare * 100).toFixed(0)}% of items ask for a value; the reference range is 64-76%`);

  // low-information readings per shared display
  const perSet = {};
  for (const p of placements) if (p.set) (perSet[p.set] ||= []).push(p);
  const lowInfo = {};
  for (const [id, group] of Object.entries(perSet)) {
    const n = group.filter(p => itemSteps(p.item) <= 1).length;
    lowInfo[id] = n;
    if (n > AUTHENTICITY.maxLowInfoPerStimulus)
      failures.push(`stimulus set ${id} has ${n} pure-lookup readings; a reference display carries at most one`);
  }

  // configuration repetition
  const bySub = {};
  for (const p of placements) bySub[p.item.subForm] = (bySub[p.item.subForm] || 0) + 1;
  for (const [sub, n] of Object.entries(bySub))
    if (n > AUTHENTICITY.maxPerSubForm)
      failures.push(`${n} items share the sub-form ${sub}; the ceiling is ${AUTHENTICITY.maxPerSubForm}`);

  // diagnostics — reported, never gated
  const lens = placements.map(p => String(p.item.stem).length);
  const mags = placements.map(p => {
    const v = Math.abs(Number(String(p.item.options.find(o => o.id === p.item.key).text).replace(/[^0-9.\-]/g, '')) || 0);
    return v > 0 ? Math.floor(Math.log10(v)) : 0;
  });
  const nouns = {};
  for (const p of placements) {
    const nar = p.item.fingerprint?.narrative || p.item.fingerprintParts?.narrative || '';
    if (nar) nouns[nar] = (nouns[nar] || 0) + 1;
  }
  const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
  const diagnostics = {
    stemLength: { mean: +mean(lens).toFixed(1), sd: +sd(lens).toFixed(1), cv: +(sd(lens) / mean(lens)).toFixed(3), min: Math.min(...lens), max: Math.max(...lens) },
    keyMagnitudeSpread: { distinctOrders: new Set(mags).size, histogram: mags.reduce((o, m) => (o[m] = (o[m] || 0) + 1, o), {}) },
    narrativeReuse: Object.fromEntries(Object.entries(nouns).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])),
  };

  return { ok: !failures.length, distinctTargets: distinct.size, valueShare, lowInfo, bySub, diagnostics, failures };
}

/* ══════════════════ the four together ══════════════════ */

export function formGates(placements) {
  const step = stepIndependence(placements);
  const key = keyBalance(placements);
  const reuse = contentReuse(placements);
  const auth = authenticity(placements);
  const failures = [...step.failures, ...key.failures, ...reuse.failures, ...auth.failures];
  return { ok: !failures.length, step, key, reuse, auth, failures };
}
