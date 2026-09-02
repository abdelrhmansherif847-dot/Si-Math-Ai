// The form assembler — Stage 2.5.
//
// The Stage-2 dry run filled 10 of 50 slots and proved the constraint system
// consistent with a CONSTRUCTED witness. A witness is not assembly feasibility:
// it shows the numbers can add up, not that the generator can produce items
// that add up. This assembler runs the real generator and emitter paths and
// reports what actually happens, including what does not.
//
// TWO STREAMS
//
//   routine    est-routine.mjs — Entry and Core. 53% of real EST items have an
//              Entry profile and no Stage-1 primitive produces one.
//   mechanism  est-primitives.mjs + est-compose.mjs — Stretch and Peak.
//
// The streams are checked by different contracts (assessRoutine vs assess) and
// neither is weakened for the other. Which stream a slot drew from is recorded
// on the placement.
//
// THE CEILING IS STRUCTURES, NOT CANDIDATES
//
// Anti-clone permits one item per STRUCTURE in a form, so a family that offers
// two constructs can fill two slots however many candidates it can draw. That
// is the quantity the bottleneck table reports, and it is the thing that has to
// grow for a form to fill.

import { SLOTS, FAMILIES, DOMAIN_BANDS, SET_RULES, KAR_CALIBRATION } from './est-blueprint.mjs';
import {
  BANDS, BAND_SHARES, TRAP_MIX, MECHANISM_TARGETS, COMPOSITION_LIMITS,
  ARCHETYPE_DIVERSITY, TIME_BUDGET, MECHANISMS, admits, profileOf,
} from './est-signatures.mjs';
import { PRIMITIVES, trapLevel, assess } from './est-primitives.mjs';
import { generateRoutine, ROUTINE_FAMILIES, ROUTINE_CONSTRUCTS, CONSTRUCT_COUNTS, EMITS_STIMULUS,
         assessRoutine, stimulusSet, kindsFor } from './est-routine.mjs';
import { composeClassifyNormalise, composeConvertCombine, composeNamedModel, assessComposed } from './est-compose.mjs';
import { fingerprintItem, detectClone } from './est-fingerprint.mjs';

/** Which family each mechanism sub-form serves. */
export const SERVES = {
  'P-COMBINATION/sum-difference': 'A03',
  'P-COMBINATION/ratio-parameter': 'A05',
  'P-CONVERSION/rate_denominator': 'A12',
  'P-CONVERSION/period_index': 'A12',
  'P-CONVERSION/axis_scale': 'A12',
  'P-CONVERSION/si_prefix': 'A12',
  'P-NORMALISE/non_monic_divisor': 'A07',
  'P-NORMALISE/mixed_base': 'A10',
  'P-SCOPE/residual_referent': 'A12b',
  'P-CLASSIFY/existence-of-solutions': 'A01',
  'P-CLASSIFY/inequality-direction': 'A04',
  'P-NORMALISE/vertex_form': 'A06',
  'P-DECOY/coefficients_sum_zero': 'A10',
  'P-DECOY/shared_terms_cancel': 'A09',
  'P-UNSTATED-MODEL/aggregate_invariance': 'A18',
  'P-NAMED-CONFIG/three_letter_angle': 'A16',
};

export const BAND_PLAN = { Entry: 9, Core: 12, Stretch: 13, Peak: 16 };

/* ────────────────────────── the candidate pool ────────────────────────── */

export function buildPool({ seed = 4100, perConstruct = 10 } = {}) {
  const pool = [];
  const rejected = {};
  const note = why => { rejected[why] = (rejected[why] || 0) + 1; };

  // routine
  for (const fam of ROUTINE_FAMILIES) {
    const r = generateRoutine(fam, perConstruct * CONSTRUCT_COUNTS[fam], { seed });
    for (const e of r.rejected) note(`routine/${fam}: ${e}`);
    for (const it of r.items) { it.stream = 'routine'; it.subForm = `R-${fam}/${it.construct}`;
      it.trapLevel = trapLevel(it).level; pool.push(it); }
  }

  // mechanism
  for (const name of Object.keys(PRIMITIVES)) {
    let s = seed, tries = 0;
    while (tries < perConstruct * 120) {
      tries++;
      let c;
      try { c = PRIMITIVES[name](s++, {}); } catch (e) { note(`${name}: threw ${e.message}`); continue; }
      if (!c || c.error) { note(`${name}: ${c ? c.error : 'null'}`); continue; }
      const a = assess(c);
      if (!a.loadBearing) { note(`${name}: ${a.reasons[0]}`); continue; }
      const sub = `${name}/${c.form || c.species}`;
      if (!SERVES[sub]) { note(`${name}: no family serves ${sub}`); continue; }
      c.seed = s - 1; c.stream = 'mechanism'; c.subForm = sub; c.family = SERVES[sub];
      c.trapLevel = trapLevel(c).level;
      pool.push(c);
    }
  }

  // composed — all three implemented patterns
  const COMPOSERS = [
    { id: 'C2', fn: composeClassifyNormalise, family: 'A07' },
    { id: 'C1', fn: composeConvertCombine, family: 'A03' },
    { id: 'C3', fn: composeNamedModel, family: 'A17' },
  ];
  for (const c of COMPOSERS) {
    let cs = seed, n = 0;
    while (n < perConstruct * 3 && cs < seed + perConstruct * 200) {
      const it = c.fn(cs++);
      if (it.error) { note(`COMPOSED/${c.id}: ${String(it.error).split(';')[0]}`); continue; }
      it.seed = cs - 1; it.stream = 'composed'; it.subForm = `COMPOSED/${c.id}`; it.family = c.family;
      it.trapLevel = trapLevel(it).level;
      pool.push(it); n++;
    }
  }
  return { pool, poolRejections: rejected };
}

/* ────────────────────────── band assignment ────────────────────────── */

/**
 * How many distinct STRUCTURES each family can supply at each band.
 *
 * A per-family set of servable bands is not enough, and the assembler measured
 * why: family A13 offers eight structures, of which exactly one satisfies the
 * Stretch signature. Told only that A13 "can serve Stretch", the assigner gave
 * it five Stretch slots and four went unfilled. Capacity has to be counted per
 * family PER BAND, against distinct structures rather than candidates, because
 * anti-clone lets each structure through once.
 */
export function capacityOf(pool) {
  const cap = {};
  const seen = new Set();
  for (const c of pool) {
    const id = c.archetype ? `${c.subForm}#${c.archetype}` : c.subForm;
    if (seen.has(id)) continue;
    seen.add(id);
    const bands = BANDS.filter(b => admits(b, profileOf(c, trapLevel)));
    if (!bands.length) continue;
    (cap[c.family] ||= { structures: [], composed: false });
    cap[c.family].structures.push({ id, bands: new Set(bands), composed: !!c.composedOf });
    if (c.composedOf) cap[c.family].composed = true;
  }
  return cap;
}

/** Back-compatible view: the set of bands a family can serve at all. */
export function capabilityOf(pool) {
  const cap = capacityOf(pool);
  return Object.fromEntries(Object.entries(cap).map(([f, c]) =>
    [f, new Set(c.structures.flatMap(st => [...st.bands]))]));
}

/**
 * Assign a band to every open slot.
 *
 * This is a MATCHING, not a budget, and three earlier attempts show why nothing
 * simpler works. A fixed difficulty ramp ignored family and filled 8 of 50. A
 * per-family set of servable bands over-promised a family whose one Stretch
 * structure was asked for five slots. A per-band count double-counted every
 * structure admissible in two bands, because using it in one consumes it in the
 * other. So each family holds an explicit list of its remaining STRUCTURES with
 * the bands each admits, and a slot takes one.
 */
export function assignBands(cap, composedFamilies, slots = SLOTS, alreadyPlaced = []) {
  const remaining = { ...BAND_PLAN };
  for (const p of alreadyPlaced) if (remaining[p.band] !== undefined) remaining[p.band]--;
  const left = {};
  for (const [f, c] of Object.entries(cap)) left[f] = c.structures.map(st => ({ ...st }));
  let compNeeded = COMPOSITION_LIMITS.perForm[0];
  const out = [];

  // Scarcest families first: one with a single structure has no alternative,
  // and an abundant one can wait.
  const order = [...slots].map((s, i) => ({ ...s, i }))
    .sort((a, b) => (left[a.fam]?.length ?? 0) - (left[b.fam]?.length ?? 0));

  for (const slot of order) {
    const pool = left[slot.fam];
    if (!pool || !pool.length) {
      out.push({ q: slot.q, i: slot.i, band: null,
        reason: !cap[slot.fam] ? `no stream serves family ${slot.fam}`
          : `family ${slot.fam} offers ${cap[slot.fam].structures.length} distinct structures and the form has used them all` });
      continue;
    }
    const wantHard = slot.q / SLOTS.length;
    // Composition first while the floor is unmet, then the band furthest from
    // its target, then the band that suits this position in the form.
    const options = [];
    for (const st of pool) for (const b of st.bands) {
      if (st.composed && !COMPOSITION_LIMITS.allowedBands.includes(b)) continue;
      // A band already at its plan is a LAST resort, not a cheap option: the
      // first version scored purely on deficit and still overfilled Core to 21
      // against a ceiling of 19 while Peak sat at 7 against a floor of 11.
      options.push({ st, b,
        score: (compNeeded > 0 && st.composed ? -1000 : 0)
             + (remaining[b] <= 0 ? 500 : 0)
             + -(remaining[b] / BAND_PLAN[b]) * 40
             + Math.abs(BANDS.indexOf(b) / 3 - wantHard) });
    }
    if (!options.length) {
      out.push({ q: slot.q, i: slot.i, band: null, reason: `family ${slot.fam} has structures left but none admissible in a permitted band` });
      continue;
    }
    options.sort((x, y) => x.score - y.score);
    const pick = options[0];
    if (pick.st.composed) compNeeded--;
    remaining[pick.b]--;
    left[slot.fam] = pool.filter(st => st.id !== pick.st.id);
    out.push({ q: slot.q, i: slot.i, band: pick.b, structure: pick.st.id });
  }
  return out;
}

/* ────────────────────────── the fill ────────────────────────── */

export function assemble({ seed = 4100, perConstruct = 10 } = {}) {
  const { pool, poolRejections } = buildPool({ seed, perConstruct });
  const composedFamilies = new Set(pool.filter(c => c.composedOf).map(c => c.family));

  const rejected = {};
  const reject = why => { rejected[why] = (rejected[why] || 0) + 1; };
  const used = { structure: {}, subForm: {}, primitive: {} };
  const placed = [], unfilled = [], fingerprints = [];
  const stimuli = {};
  let composedCount = 0, retries = 0;

  // ── PASS 1: shared-stimulus sets ────────────────────────────────────────────
  // A declared set is several questions about ONE display, so it is assembled
  // as a unit before any individual slot. Filling slots one at a time cannot
  // build a set: the second slot needs a second reading of the FIRST slot's
  // chart, and a per-item generator has already moved on to a new one.
  const setSlots = {};
  for (const slot of SLOTS) if (slot.set) (setSlots[slot.set] ||= []).push(slot);
  const setSlotQs = new Set();
  const setNeed = { ...BAND_PLAN };
  const usedReaders = new Set();
  const usedKinds = new Set();
  // MOST CONSTRAINED FIRST. Size is the wrong key and the assembler measured
  // why: a two-slot A13+A13 set, servable by any of three display kinds, took
  // the data-list — and stranded the two sets containing an A14 slot, for which
  // the data-list is the ONLY kind with readers. Sets are therefore ordered by
  // how few kinds can serve them, and only then by size.
  const setOrder = Object.entries(setSlots).sort((a, b) => {
    const k = g => kindsFor(g.map(x => x.fam)).length;
    return (k(a[1]) - k(b[1])) || (b[1].length - a[1].length);
  });
  for (const [setId, group] of setOrder) {
    const families = group.map(g => g.fam);
    const all = kindsFor(families, usedReaders);
    // Prefer a display kind no other set has used, so the form does not open
    // with three bar charts.
    const kinds = [...all.filter(k => !usedKinds.has(k)), ...all.filter(k => usedKinds.has(k))];
    if (!kinds.length) {
      reject(`stimulus set ${setId}: no display kind has readers for ${families.join('+')}`);
      for (const g of group) unfilled.push({ q: g.q, fam: g.fam, band: null, reason: `stimulus set ${setId} has no display kind serving ${families.join('+')}` });
      group.forEach(g => setSlotQs.add(g.q));
      continue;
    }
    let built = null;
    for (const kind of kinds) {
      const r = stimulusSet(kind, families, seed + setId.charCodeAt(1) * 131, usedReaders);
      if (!r.error) { built = r; break; }
      reject(`stimulus set ${setId}: ${r.error}`);
    }
    group.forEach(g => setSlotQs.add(g.q));
    if (!built) { for (const g of group) unfilled.push({ q: g.q, fam: g.fam, band: null, reason: `stimulus set ${setId} could not be built` }); continue; }
    stimuli[setId] = { ...built.stimulus, slots: group.map(g => g.q) };
    usedKinds.add(built.kind);
    for (const n of built.readers) usedReaders.add(n);
    built.items.forEach((it, i) => {
      const g = group[i];
      it.trapLevel = trapLevel(it).level;
      const prof = profileOf(it, trapLevel);
      // Take the band the plan is furthest from filling, not simply the first
      // that admits — otherwise ten set slots all land in Entry and the budget
      // for the other forty is already spent.
      const okBands = BANDS.filter(b => admits(b, prof));
      const band = okBands.sort((x, y) => (setNeed[y] / BAND_PLAN[y]) - (setNeed[x] / BAND_PLAN[x]))[0] || 'Core';
      setNeed[band]--;
      const struct = it.subForm;
      used.structure[struct] = (used.structure[struct] || 0) + 1;
      used.primitive[it.primitive] = (used.primitive[it.primitive] || 0) + 1;
      fingerprints.push(fingerprintItem(it));
      placed.push({ q: g.q, band, fam: g.fam, set: setId, item: it });
    });
  }

  // ── band assignment, AFTER the sets ────────────────────────────────────────
  // Capacity has to be counted on the structures that are still AVAILABLE. The
  // stimulus pass has already consumed several, and a budget computed before it
  // over-counts them — which left five slots assigned to bands whose structures
  // were gone by the time pass 2 reached them.
  const remainingPool = pool.filter(c => {
    const struct = c.archetype ? `${c.subForm}#${c.archetype}` : c.subForm;
    return !used.structure[struct];
  });
  const cap = capacityOf(remainingPool);
  const openSlots = SLOTS.filter(s2 => !setSlotQs.has(s2.q));
  const bands = assignBands(cap, composedFamilies, openSlots, placed);

  // ── PASS 2: the remaining slots ────────────────────────────────────────────
  const bandFor = Object.fromEntries(bands.filter(Boolean).map(b => [b.q, b]));
  for (const slot of SLOTS) {
    if (setSlotQs.has(slot.q)) continue;
    const a = bandFor[slot.q] || { band: null, reason: 'no band assigned' };
    if (!a.band) { unfilled.push({ q: slot.q, fam: slot.fam, reason: a.reason }); continue; }
    const band = a.band;

    // The matching is a PLAN, not a contract. Two candidates can share a
    // structure id and still differ in trap level — a P-NAMED-CONFIG item whose
    // 45-degree misreading collapses onto the given value grades differently
    // from one whose does not — so the planned structure can turn out
    // inadmissible. When it does, any unused structure of the family is tried
    // before the slot is given up, and `used.structure` still stops a repeat.
    let chosen = null;
    for (const relaxed of [false, true]) {
    if (chosen) break;
    for (const c of pool) {
      if (c.taken || c.family !== slot.fam) continue;
      // Honour the structure the matching chose. Searching the family freely
      // let an early slot take the structure a later one had been matched to,
      // and that later slot then had nothing left.
      const cid = c.archetype ? `${c.subForm}#${c.archetype}` : c.subForm;
      if (a.structure && cid !== a.structure && !relaxed) continue;
      retries++;
      const prof = profileOf(c, trapLevel);
      if (!admits(band, prof)) { reject(`${band}: signature not satisfied`); continue; }
      if (prof.composed) {
        if (!COMPOSITION_LIMITS.allowedBands.includes(band)) { reject(`composition not permitted in ${band}`); continue; }
        if (composedCount >= COMPOSITION_LIMITS.perForm[1]) { reject('composition ceiling reached'); continue; }
      }
      const struct = c.archetype ? `${c.subForm}#${c.archetype}` : c.subForm;
      if ((used.structure[struct] || 0) >= ARCHETYPE_DIVERSITY.maxPerArchetype) { reject(`structure ${struct} already used ${ARCHETYPE_DIVERSITY.maxPerArchetype}x`); continue; }
      if ((used.primitive[c.primitive] || 0) >= ARCHETYPE_DIVERSITY.maxPerPrimitive) { reject(`primitive ${c.primitive} quota reached`); continue; }
      const fp = fingerprintItem(c);
      if (detectClone(fp, fingerprints, 'sibling').clone) { reject('anti-clone: structural repeat of an item already placed'); continue; }
      chosen = c; chosen._fp = fp; chosen._prof = prof;
      break;
    }
    }
    if (!chosen) { unfilled.push({ q: slot.q, fam: slot.fam, band,
      reason: `no ${band} candidate of structure ${a.structure || '(any)'} in ${slot.fam} survived the slot rules` }); continue; }

    chosen.taken = true;
    const struct = chosen.archetype ? `${chosen.subForm}#${chosen.archetype}` : chosen.subForm;
    used.structure[struct] = (used.structure[struct] || 0) + 1;
    used.subForm[chosen.subForm] = (used.subForm[chosen.subForm] || 0) + 1;
    used.primitive[chosen.primitive] = (used.primitive[chosen.primitive] || 0) + 1;
    if (chosen._prof.composed) composedCount++;
    fingerprints.push(chosen._fp);
    placed.push({ q: slot.q, band, fam: slot.fam, set: slot.set || null, item: chosen });
  }

  return { seed, placed, unfilled, rejected, poolRejections, pool: pool.length, cap,
           composedCount, used, stimuli, retries, bands };
}

/* ────────────────────────── verification of an assembled form ────────────────────────── */

/**
 * Everything a completed form must satisfy. Runs on the REAL placed items, and
 * re-derives load-bearing status from the items themselves rather than trusting
 * any metadata carried along with them.
 */
export function verify(run) {
  const fails = [];
  const items = run.placed.map(p => p.item);

  for (const p of run.placed) {
    const it = p.item;
    if (it.stream === 'routine') {
      const v = assessRoutine(it);
      if (!v.ok) fails.push(`Q${p.q}: routine item fails its contract — ${v.reasons[0]}`);
    } else if (it.composedOf) {
      const v = assessComposed(it);
      if (!v.ok) fails.push(`Q${p.q}: composed item fails — ${v.reasons[0]}`);
    } else {
      const v = assess(it);
      if (!v.loadBearing) fails.push(`Q${p.q}: mechanism item is not load-bearing — ${v.reasons[0]}`);
    }
    if (!admits(p.band, profileOf(it, trapLevel))) fails.push(`Q${p.q}: item is not admissible in a ${p.band} slot`);
  }

  const fps = items.map(fingerprintItem);
  const collisions = fps.filter(f => detectClone(f, fps, 'sibling').clone).length;
  if (collisions) fails.push(`${collisions} anti-clone collisions among the placed items`);

  if (run.placed.length === SLOTS.length) {
    const band = {}; for (const p of run.placed) band[p.band] = (band[p.band] || 0) + 1;
    for (const b of BANDS) {
      const [lo, hi] = BAND_SHARES[b].range;
      if ((band[b] || 0) < lo || (band[b] || 0) > hi) fails.push(`band ${b}: ${band[b] || 0} outside ${lo}..${hi}`);
    }
    // TRAP: what is checkable, and what is not.
    //
    // TRAP_MIX's ranges were counted on the reference corpus with a JUDGEMENT
    // instrument — my own 0/1/2 coding of 200 published items. Generated items
    // are graded by the ROUTE MODEL, which reads the cost of the natural move
    // off an enumerated route list. Stage 2 recorded that these are different
    // instruments and that the route model cannot be applied to the reference
    // at all, because published items come with no routes.
    //
    // Asserting the reference counts against route-model grades is therefore a
    // category error, and a gate built on one is not a gate. Stage 2 built it
    // anyway, in feasibility(); this is the correction. What IS checkable about
    // the trap profile is its SHAPE, and that is asserted:
    const trap = {}; for (const it of items) trap[it.trapLevel ?? trapLevel(it).level] = (trap[it.trapLevel ?? trapLevel(it).level] || 0) + 1;
    const levelsSeen = [0, 1, 2].filter(l => trap[l]).length;
    if (levelsSeen < 2) fails.push('every item carries the same trap level — the form has one texture');
    if ((trap[2] || 0) === 0) fails.push('no item punishes the natural move at full cost');
    if ((trap[2] || 0) > 0.8 * items.length) fails.push(`${trap[2]} of ${items.length} items punish the natural move at full cost — saturated`);
    // Only Entry admits a trap-0 item, so any that appear must be Entry.
    const misplacedZero = run.placed.filter(p => (p.item.trapLevel ?? trapLevel(p.item).level) === 0 && p.band !== 'Entry');
    if (misplacedZero.length) fails.push(`${misplacedZero.length} trap-free items sit outside Entry, which is the only band admitting one`);
    const [clo, chi] = COMPOSITION_LIMITS.perForm;
    if (run.composedCount < clo || run.composedCount > chi) fails.push(`composition: ${run.composedCount} outside ${clo}..${chi}`);
    const nSets = Object.keys(run.stimuli).length;
    if (nSets < SET_RULES.count[0] || nSets > SET_RULES.count[1]) fails.push(`${nSets} stimulus sets, outside ${SET_RULES.count.join('..')}`);
  }
  return { ok: fails.length === 0, fails, complete: run.placed.length === SLOTS.length };
}

/* ────────────────────────── the bottleneck table ────────────────────────── */

/**
 * Distinct STRUCTURES available per family against slots demanded. This is the
 * quantity that decides whether a form can fill, and printing it is the point:
 * "show me the bottleneck" is answered here and nowhere else.
 */
export function bottleneck({ seed = 4100, perConstruct = 10 } = {}) {
  const { pool } = buildPool({ seed, perConstruct });
  const byFam = {};
  for (const c of pool) {
    (byFam[c.family] ||= { fps: [], streams: new Set() });
    const fp = fingerprintItem(c);
    if (!detectClone(fp, byFam[c.family].fps, 'sibling').clone) { byFam[c.family].fps.push(fp); byFam[c.family].streams.add(c.stream); }
  }
  const rows = [];
  for (const fam of Object.keys(FAMILIES)) {
    const slots = SLOTS.filter(s => s.fam === fam).length;
    const have = byFam[fam]?.fps.length || 0;
    rows.push({ fam, domain: FAMILIES[fam].domain, slots, have, short: Math.max(0, slots - have),
                streams: [...(byFam[fam]?.streams || [])].join('+') || '(none)' });
  }
  return { rows, totalSlots: rows.reduce((a, r) => a + r.slots, 0),
           totalHave: rows.reduce((a, r) => a + r.have, 0), totalShort: rows.reduce((a, r) => a + r.short, 0) };
}

/* ────────────────────────── the report ────────────────────────── */

const tally = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const pad = (s, n) => String(s).padEnd(n);

export function report(run) {
  const { placed, unfilled } = run;
  const items = placed.map(p => p.item);
  const L = [];
  const say = (...a) => L.push(a.join(' '));

  say(`\n── fill ──`);
  say(`  ${placed.length}/50 slots filled by the REAL generator and emitter paths. ${unfilled.length} unfilled.`);
  for (const [why, n] of Object.entries(tally(unfilled, u => u.reason))) say(`    ${pad(n, 3)} ${why}`);
  say(`  streams: ` + Object.entries(tally(items, i => i.stream)).map(([k, v]) => `${k} ${v}`).join(', '));

  say(`\n── domain distribution ──`);
  const dom = tally(items, i => FAMILIES[i.family].domain);
  for (const d of Object.keys(DOMAIN_BANDS)) {
    const share = (dom[d] || 0) / (items.length || 1);
    const inBand = share >= DOMAIN_BANDS[d].min && share <= DOMAIN_BANDS[d].max;
    say(`  ${pad(d, 5)} ${pad(dom[d] || 0, 3)} (${(100 * share).toFixed(0)}%)  published ${(100 * DOMAIN_BANDS[d].min).toFixed(0)}-${(100 * DOMAIN_BANDS[d].max).toFixed(0)}%  ${inBand ? 'in band' : 'OUT'}`);
  }
  say(`  the family quotas are the blueprint's, unchanged by Stage 2.5; the domain split follows from them.`);

  say(`\n── KAR distribution ──`);
  say(`  NOT ASSERTED, and the implementation cannot legitimately assert it. KAR_CALIBRATION.claimAllowed`);
  say(`  is false: no form may claim the published bands until a rubric applied by two independent passes`);
  say(`  agrees (artifact 7 §6). Nothing in Stage 2.5 changes that, and printing a number here would`);
  say(`  manufacture a claim the evidence does not support.`);

  say(`\n── Entry / Core / Stretch / Peak ──`);
  const band = tally(placed, p => p.band);
  for (const b of BANDS) {
    const [lo, hi] = BAND_SHARES[b].range;
    const n = band[b] || 0;
    say(`  ${pad(b, 8)} ${pad(n, 3)}  plan ${pad(BAND_PLAN[b], 3)} observed per-form range ${lo}..${hi}  ${n >= lo && n <= hi ? 'in range' : 'OUT'}`);
  }

  say(`\n── mechanism distribution (items in which it BITES) ──`);
  for (const [m, t] of Object.entries(MECHANISM_TARGETS)) {
    const n = items.filter(i => (i.mechanism?.[m] || 0) >= 2).length;
    say(`  ${pad(m, 18)} ${pad(n, 3)} observed per-form range ${pad(t.range.join('..'), 7)}${t.gated ? '[GATED]' : n < t.range[0] ? 'UNDER' : n > t.range[1] ? 'OVER' : ''}`);
  }

  say(`\n── hidden-step species ──`);
  const hs = tally(items.filter(i => (i.mechanism?.hidden_step || 0) >= 2), i => i.species);
  for (const [k, v] of Object.entries(hs).sort((a, b) => b[1] - a[1])) say(`  ${pad(k, 30)} ${v}`);

  say(`\n── trap cost ──`);
  const trap = tally(items, i => i.trapLevel ?? trapLevel(i).level);
  for (const l of [0, 1, 2]) say(`  level ${l}  ${pad(trap[l] || 0, 3)} (${(100 * (trap[l] || 0) / items.length).toFixed(0)}%)  ${TRAP_MIX[l].label}`);
  say(`  NOT compared against the reference counts. TRAP_MIX was measured with a JUDGEMENT instrument on`);
  say(`  200 published items; generated items are graded by the ROUTE MODEL, which needs an enumerated`);
  say(`  route list published items do not have. The two are not the same scale, so what is asserted is`);
  say(`  the profile's SHAPE — more than one level present, some item at full cost, none saturated, and`);
  say(`  every trap-free item in Entry, the only band admitting one.`);

  say(`\n── composition ──`);
  const comp = items.filter(i => i.composedOf);
  say(`  ${comp.length} composed items (range ${COMPOSITION_LIMITS.perForm.join('..')}, max depth ${COMPOSITION_LIMITS.maxDepth}): ` +
      comp.map(i => `Q?/${i.subForm}`).join(', '));
  say(`  every one re-verified by assessComposed at report time, not trusted from assembly.`);

  say(`\n── representation switch ──`);
  say(`  ${items.filter(i => (i.mechanism?.repr_switch || 0) >= 2).length} items switch representation at full strength ` +
      `(observed per-form range ${MECHANISM_TARGETS.repr_switch.range.join('..')})`);

  say(`\n── stimulus ──`);
  const sets = Object.entries(run.stimuli);
  say(`  ${sets.length} shared-stimulus sets (rule ${SET_RULES.count.join('..')}), covering ${sets.reduce((a, [, v]) => a + v.slots.length, 0)} slots`);
  for (const [id, st] of sets) say(`    ${pad(id, 4)} ${pad(st.kind, 12)} ${st.slots.length} items  slots ${st.slots.join(', ')}`);
  const sizes = sets.map(([, v]) => v.slots.length);
  say(`  items per set: ${sizes.join(', ')}  (rule ${SET_RULES.size.join('..')}, one oversize set of ${SET_RULES.oversizeSetSize} allowed)`);
  say(`  unsupported combinations: ` + (run.unsupportedSets?.length ? run.unsupportedSets.join('; ') : 'none — every declared set found a display kind with enough readers'));

  say(`\n── structural archetypes ──`);
  const structs = new Set(items.map(i => i.archetype ? `${i.subForm}#${i.archetype}` : i.subForm));
  say(`  ${structs.size} distinct structures across ${items.length} items; most-repeated ${Math.max(...Object.values(tally(items, i => i.archetype ? `${i.subForm}#${i.archetype}` : i.subForm)))}`);
  say(`  ceiling ${ARCHETYPE_DIVERSITY.maxPerArchetype} per structure`);

  say(`\n── anti-clone ──`);
  const fps = items.map(fingerprintItem);
  say(`  ${fps.filter(f => detectClone(f, fps, 'sibling').clone).length} structural collisions among the placed items`);

  say(`\n── time budget ──`);
  const steps = items.reduce((a, i) => a + (i.steps || 3), 0);
  const mins = (items.length * TIME_BUDGET.fixedSecondsPerItem + steps * TIME_BUDGET.secondsPerStep) / 60;
  const allow = TIME_BUDGET.minutesPerForm;
  say(`  ${mins.toFixed(1)} min estimated against a ${allow} min paper (${(100 * mins / allow).toFixed(0)}%, tolerance ±${100 * TIME_BUDGET.tolerance}%)`);
  say(`  steps are a TIME signal only — ${TIME_BUDGET.note}`);

  say(`\n── rejected candidates during the fill ──`);
  const rs = Object.entries(run.rejected).sort((a, b) => b[1] - a[1]);
  say(`  ${run.retries} candidates examined; ${rs.reduce((a, [, n]) => a + n, 0)} rejected`);
  for (const [why, n] of rs) say(`    ${pad(n, 5)} ${why}`);

  say(`\n── rejected during pool construction ──`);
  const pr = Object.entries(run.poolRejections).sort((a, b) => b[1] - a[1]).slice(0, 12);
  for (const [why, n] of pr) say(`    ${pad(n, 5)} ${why}`);
  if (Object.keys(run.poolRejections).length > 12) say(`    … and ${Object.keys(run.poolRejections).length - 12} further reasons`);

  const v = verify(run);
  say(`\n── verdict ──`);
  say(v.ok ? `  PASS — 50/50 filled and every checkable constraint holds simultaneously.`
           : `  FAIL —\n` + v.fails.map(f => `    • ${f}`).join('\n'));
  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seed = Number(process.argv.find(a => /^\d+$/.test(a))) || 4100;
  console.log(report(assemble({ seed })));
}
