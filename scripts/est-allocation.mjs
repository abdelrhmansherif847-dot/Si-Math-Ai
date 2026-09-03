// The allocation model — Stage B.
//
// WHY THIS EXISTS
//
// Stage 22 doubled the library, from 86 named archetypes to 165, and pairwise
// object overlap across 25 forms moved 81% -> 72%. The measurement that mattered
// was not the improvement; it was that a RANDOM DRAW from the same library would
// have overlapped 15.1 items of 50 and the generator overlapped 36.2. The
// generator captures under a quarter of the diversity its own library already
// offers, and that ratio — the allocation penalty — went UP as the library grew,
// from 1.46x to 2.40x.
//
// A penalty that rises with vocabulary is the signature of a constraint that is
// not vocabulary. This module finds it.
//
// THE SIX LAYERS
//
//   vocabulary capacity   objects the library can name at all
//   family capacity       objects available to each family
//   band capacity         objects available to each (family, band) cell
//   slot demand           slots the blueprint asks that cell to fill
//   emitted coverage      objects that actually appear, over assembled forms
//   series reuse          how often the same object comes back
//
// Every layer can be the bottleneck and they are routinely confused. A library
// with 165 objects can still emit the same object in every form if one cell
// holds one object and the blueprint asks that cell for a slot every time.
// `bottleneck()` reports the loss at each layer so the answer is read rather
// than argued.
//
// NO EXAM CONTENT. Structures, families, bands and counts only.

import { SLOTS, FAMILIES } from './est-blueprint.mjs';
import { objectOf } from './est-objects.mjs';
import { profileOf, admits, BANDS } from './est-signatures.mjs';
import { trapLevel, rng } from './est-primitives.mjs';
import { randomOverlap } from './est-series.mjs';

/* ══════════════════════════ layer 1-4: what the library offers a cell ══════════════════════════ */

/**
 * Which (family, band) cells each pool candidate can serve.
 *
 * A candidate serves a cell when its family matches and its measured profile is
 * admissible in that band. Admissibility is DERIVED from the item — never read
 * off a label — so a construct cannot claim a band it cannot occupy.
 */
export function cellsOf(candidate) {
  const fam = candidate.family === 'A12b' ? 'A12b' : candidate.family;
  const prof = profileOf(candidate, trapLevel);
  return BANDS.filter(b => admits(b, prof)).map(b => `${fam}/${b}`);
}

const bandKey = d => ({ entry: 'Entry', core: 'Core', stretch: 'Stretch', peak: 'Peak' }[d] || d);

/**
 * Slots the blueprint DECLARES for each cell, from a slot plan.
 *
 * This is the blueprint's own statement (`slot.d`) and it is not what the
 * assembler does. `assignBands()` ignores `slot.d` entirely and derives a band
 * from the structures the family still has, so the declared demand and the
 * realised demand are different objects and conflating them misreads the whole
 * bottleneck. Both are reported below; the loss figures use the realised one,
 * because an object is only truly unreachable if no cell the ASSEMBLER produces
 * will admit it.
 */
export function slotDemand(slots = SLOTS) {
  const out = {};
  for (const s of slots) {
    const k = `${s.fam}/${bandKey(s.d)}`;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/** Slots each cell actually received, averaged over assembled forms. */
export function realisedDemand(forms) {
  const out = {};
  for (const f of forms) for (const p of f) {
    const k = `${p.fam}/${p.band}`;
    out[k] = (out[k] || 0) + 1;
  }
  const n = Math.max(1, forms.length);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v / n]));
}

/**
 * The family x band capacity matrix.
 *
 * `available` counts DISTINCT OBJECTS the pool can put in the cell, not
 * candidates: ten seeds of one construct are one object, and counting
 * candidates is how a cell with a single structure looks well supplied.
 */
export function capacityMatrix(pool, { slots = SLOTS, demand: given = null, extra = [] } = {}) {
  const demand = given || slotDemand(slots);
  const cells = {};
  const touch = k => (cells[k] ||= { cell: k, family: k.split('/')[0], band: k.split('/')[1],
    objects: new Set(), structures: new Set(), streams: new Set(), demand: demand[k] || 0 });
  for (const k of Object.keys(demand)) touch(k);
  // `extra` is capacity the candidate pool cannot see. Shared-stimulus readers
  // are built inside the set pass, not by `buildPool`, so a matrix computed
  // from the pool alone reported A13/Core as holding ZERO objects while three
  // were emitted from it every form — the model contradicting the forms, which
  // is the one thing a model must never quietly do.
  for (const c of [...pool, ...extra]) {
    for (const k of cellsOf(c)) {
      const cell = touch(k);
      cell.objects.add(objectOf(c));
      cell.structures.add(c.archetype ? `${c.subForm}#${c.archetype}` : c.subForm);
      cell.streams.add(c.stream || 'reader');
    }
  }
  return Object.values(cells).map(c => ({
    cell: c.cell, family: c.family, band: c.band, demand: c.demand,
    available: c.objects.size, structures: c.structures.size,
    streams: [...c.streams].sort().join('+'),
    // A cell with one object and standing demand emits that object in every
    // form of the series, whatever the rest of the library holds.
    singleObjectForced: c.objects.size === 1 && c.demand > 0,
    starved: c.demand > 0 && c.objects.size < c.demand,
  })).sort((a, b) => (a.available - b.available) || (b.demand - a.demand));
}

/* ══════════════════════════ layer 5-6: what actually comes out ══════════════════════════ */

/**
 * The same matrix, with what the forms actually emitted written into it.
 *
 * `expectedReuse` is what a uniform draw from the cell's own objects would give
 * over N forms; `actualReuse` is the mean number of forms each emitted object
 * appears in. Their ratio is the allocation penalty, computed PER CELL, which
 * is what turns a single series-level number into a list of places to work.
 */
export function cellEmission(pool, forms, { slots = SLOTS, useRealised = true, extra = [] } = {}) {
  const matrix = capacityMatrix(pool, { slots, demand: useRealised ? realisedDemand(forms) : null, extra });
  const byCell = Object.fromEntries(matrix.map(m => [m.cell, m]));
  const seen = {};
  for (const f of forms) {
    const inThisForm = {};
    for (const p of f) {
      const k = `${p.fam}/${p.band}`;
      (inThisForm[k] ||= new Set()).add(objectOf(p.item));
    }
    for (const [k, objs] of Object.entries(inThisForm)) {
      const rec = (seen[k] ||= { uses: {}, forms: 0 });
      rec.forms++;
      for (const o of objs) rec.uses[o] = (rec.uses[o] || 0) + 1;
    }
  }
  const N = forms.length;
  return matrix.map(m => {
    const rec = seen[m.cell] || { uses: {}, forms: 0 };
    const emitted = Object.keys(rec.uses).length;
    const inEvery = Object.values(rec.uses).filter(c => c === N).length;
    const meanForms = emitted ? Object.values(rec.uses).reduce((a, b) => a + b, 0) / emitted : 0;
    // A uniform draw of `demand` objects per form from `available` of them:
    // each object is expected in N * (1 - (1 - d/A)) forms, which for d <= A is
    // N * d / A. Below one form it is not a reuse figure at all.
    const expected = m.available ? Math.min(N, (N * m.demand) / m.available) : 0;
    return {
      ...m,
      emitted, neverEmitted: Math.max(0, m.available - emitted),
      inEveryForm: inEvery, formsAppearedIn: rec.forms,
      expectedReuse: +expected.toFixed(2), actualReuse: +meanForms.toFixed(2),
      cellPenalty: expected > 0 ? +(meanForms / expected).toFixed(2) : null,
    };
  });
}

/**
 * The layered bottleneck report: where the diversity is lost, layer by layer.
 *
 * Read top to bottom. Each line is a count of DISTINCT OBJECTS surviving that
 * layer, so the layer with the largest drop is the constraint.
 */
export function bottleneck(pool, forms, { slots = SLOTS, vocabulary = null, useRealised = true, extra = [] } = {}) {
  const rows = cellEmission(pool, forms, { slots, useRealised, extra });
  const poolObjects = new Set(pool.map(objectOf));
  const V = vocabulary ?? poolObjects.size;
  const reachable = new Set();
  for (const r of rows) if (r.demand > 0) r.available && reachable.add(r.cell);
  // An object is REACHABLE when some cell with standing demand can admit it.
  const reachableObjects = new Set();
  const demandCells = new Set(rows.filter(r => r.demand > 0).map(r => r.cell));
  for (const c of pool) if (cellsOf(c).some(k => demandCells.has(k))) reachableObjects.add(objectOf(c));
  const emittedObjects = new Set();
  for (const f of forms) for (const p of f) emittedObjects.add(objectOf(p.item));
  const N = forms.length;
  const perObjectForms = {};
  for (const f of forms) for (const o of new Set(f.map(p => objectOf(p.item)))) perObjectForms[o] = (perObjectForms[o] || 0) + 1;
  const S = forms[0]?.length || 50;

  return {
    layers: [
      { layer: 'vocabulary capacity', objects: V, note: 'objects the library can name' },
      { layer: 'family capacity', objects: new Set(pool.filter(c => FAMILIES[c.family] || c.family === 'A12b').map(objectOf)).size,
        note: 'objects belonging to a family the blueprint knows' },
      { layer: 'band capacity', objects: reachableObjects.size,
        note: 'objects admissible in some cell that has standing demand' },
      { layer: 'slot demand', objects: Math.min(reachableObjects.size, S * N),
        note: `${S} slots x ${N} forms bounds what can be emitted at all` },
      { layer: 'emitted coverage', objects: emittedObjects.size, note: 'objects that actually appeared' },
      { layer: 'series reuse', objects: Object.values(perObjectForms).filter(c => c === 1).length,
        note: 'objects that appeared in exactly one form' },
    ],
    singleObjectCells: rows.filter(r => r.singleObjectForced).length,
    starvedCells: rows.filter(r => r.starved).length,
    cellsWithDemand: rows.filter(r => r.demand > 0).length,
    slotsFromEveryFormObjects: +rows.reduce((a, r) => a + (r.inEveryForm > 0 ? r.demand : 0), 0).toFixed(1),
    randomPrediction: +randomOverlap(V, S).toFixed(2),
    rows,
  };
}

/* ══════════════════════════ slot -> family policies ══════════════════════════ */
//
// A policy produces a 50-slot plan for one form. Policy A returns the blueprint
// table unchanged and is the control; B and C are only worth anything measured
// against it.
//
// What a policy may NOT do is decide the shape of the exam. The per-form family
// counts must stay inside `FAMILIES[fam].range`, which the blueprint already
// declares from the corpus, and the band of a position is not a policy's to
// choose — `assignBands()` decides that from measured capacity. A policy moves
// WHICH family sits at WHICH position, and nothing else.

/** Policy A — the blueprint table, unpermuted. The control. */
export const policyFixed = () => SLOTS;

const clone = s => ({ ...s, f: [...(s.f || [])] });

/**
 * Re-label a slot plan's families from a target per-family count.
 *
 * Set membership, device flags and positions are untouched: a set is several
 * readings of ONE display and its slots' families decide which readers can
 * serve it, so set slots keep their family in every policy. Only the free
 * positions are re-labelled.
 */
function relabel(counts, rand) {
  const plan = SLOTS.map(clone);
  const free = plan.filter(s => !s.set);
  const fixedCounts = {};
  for (const s of plan) if (s.set) fixedCounts[s.fam] = (fixedCounts[s.fam] || 0) + 1;
  const bag = [];
  for (const [fam, n] of Object.entries(counts)) {
    const already = fixedCounts[fam] || 0;
    for (let i = 0; i < Math.max(0, n - already); i++) bag.push(fam);
  }
  if (bag.length !== free.length) return { error: `plan asks for ${bag.length} free slots, the blueprint has ${free.length}` };
  for (let i = bag.length - 1; i > 0; i--) { const j = rand.int(0, i); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  free.forEach((s, i) => { s.fam = bag[i]; });
  return { plan };
}

/** Every family's per-form count, from a plan. */
export const familyCounts = (slots) => {
  const out = {};
  for (const s of slots) out[s.fam] = (out[s.fam] || 0) + 1;
  return out;
};

/**
 * Does a plan keep the shape the corpus measured?
 *
 * Family counts inside their declared range, the combined percentage range
 * honoured, and the blueprint's adjacency rule — no two same-family slots side
 * by side outside a shared set — still holding.
 */
export function planIsReferenceShaped(slots) {
  const failures = [];
  const counts = familyCounts(slots);
  for (const [fam, spec] of Object.entries(FAMILIES)) {
    const n = counts[fam] || 0;
    if (n < spec.range[0] || n > spec.range[1])
      failures.push(`${fam} appears ${n} times, outside its measured range ${spec.range[0]}-${spec.range[1]}`);
  }
  const pct = (counts.A12 || 0) + (counts.A12b || 0);
  if (pct < 2 || pct > 6) failures.push(`A12+A12b appears ${pct} times, outside the combined range 2-6`);
  for (let i = 1; i < slots.length; i++)
    if (slots[i].fam === slots[i - 1].fam && !(slots[i].set && slots[i].set === slots[i - 1].set))
      failures.push(`Q${slots[i - 1].q} and Q${slots[i].q} are both ${slots[i].fam} and adjacent outside a shared set`);
  if (slots.length !== SLOTS.length) failures.push(`the plan has ${slots.length} slots, not ${SLOTS.length}`);
  return { ok: !failures.length, failures };
}

/**
 * Policy B — a random re-labelling inside the declared family ranges.
 *
 * Deliberately naive. It is here to answer one question: is the fixed table the
 * problem, or is ANY permutation? If B fixes the overlap, the table is the
 * defect; if B breaks the form's shape while barely moving the overlap, the
 * defect is elsewhere and C has to be cleverer than shuffling.
 */
export function policyRandom(seed) {
  const rand = rng((seed * 2246822519) >>> 0);
  for (let attempt = 0; attempt < 400; attempt++) {
    const counts = {};
    let total = 0;
    const fams = Object.keys(FAMILIES);
    for (const fam of fams) { counts[fam] = FAMILIES[fam].range[0]; total += counts[fam]; }
    while (total < SLOTS.length) {
      const fam = fams[rand.int(0, fams.length - 1)];
      if (counts[fam] < FAMILIES[fam].range[1]) { counts[fam]++; total++; }
    }
    const r = relabel(counts, rand);
    if (r.error) continue;
    if (planIsReferenceShaped(r.plan).ok) return r.plan;
  }
  return SLOTS;
}

/**
 * Policy C — constraint-aware: spend each family's per-form allowance where the
 * library can pay for it, and rotate the positions it lands on.
 *
 * Two ideas, and the second is the one that matters.
 *
 * FIRST, a family's count leans toward the top of its declared range when that
 * family has objects to spare and toward the bottom when it does not. A01 with
 * eleven objects and a range of 1-4 should be asked four times; A11 with three
 * and a range of 1-2 should be asked once. That converts library depth into
 * slots instead of leaving it unreachable.
 *
 * SECOND, the leaning is a function of the FORM INDEX, not of a coin. A family
 * asked four times in every form is exactly the failure mode being fixed, so
 * the allowance rotates: the family at the top of its range this form sits at
 * the bottom two forms later. That is the scheduled allocation the corpus uses,
 * applied one level up from objects.
 */
export function policyConstraintAware(seed, { depth = {}, structures = {}, formIndex = 0, period = 5 } = {}) {
  const rand = rng((seed * 2654435761) >>> 0);
  const fams = Object.keys(FAMILIES);
  const scored = fams.map((fam, i) => {
    const [lo, hiDeclared] = FAMILIES[fam].range;
    const d = depth[fam] ?? 0;
    // The declared range is what the corpus permits; the structure count is
    // what this library can pay for, and the smaller of the two is the ceiling.
    // One structure is held back so the fill loop still has an alternative when
    // a planned structure turns out inadmissible in its band — without that
    // slack the plan is feasible only if every first choice happens to work.
    const cap = structures[fam] ? Math.max(lo, structures[fam] - 1) : hiDeclared;
    const hi = Math.max(lo, Math.min(hiDeclared, cap));
    const afford = hi > 0 ? d / hi : 0;
    const phase = ((formIndex + i * 2) % period) / period;      // rotates per form
    return { fam, lo, hi, afford, phase };
  });
  for (let attempt = 0; attempt < 400; attempt++) {
    const counts = {};
    let total = 0;
    for (const s of scored) {
      // A deep family leans high, a shallow one low, and the phase moves the
      // lean around the series so no family is pinned at its maximum.
      const lean = Math.min(1, s.afford / 3) * (0.5 + 0.5 * Math.cos(2 * Math.PI * s.phase));
      const n = Math.max(s.lo, Math.min(s.hi, Math.round(s.lo + lean * (s.hi - s.lo))));
      counts[s.fam] = n; total += n;
    }
    // Settle to exactly 50 by moving single slots to and from the families with
    // the most and least depth to spare.
    const order = [...scored].sort((a, b) => b.afford - a.afford).map(s => s.fam);
    const byFam = Object.fromEntries(scored.map(s => [s.fam, s]));
    let guard = 0;
    while (total !== SLOTS.length && guard++ < 500) {
      if (total < SLOTS.length) {
        const fam = order.find(f => counts[f] < (byFam[f]?.hi ?? FAMILIES[f].range[1]));
        if (!fam) break; counts[fam]++; total++;
      } else {
        const fam = [...order].reverse().find(f => counts[f] > FAMILIES[f].range[0]);
        if (!fam) break; counts[fam]--; total--;
      }
    }
    const r = relabel(counts, rand);
    if (r.error) continue;
    if (planIsReferenceShaped(r.plan).ok) return r.plan;
  }
  return SLOTS;
}

/** Objects each family can name, from a pool — the `depth` policy C consults. */
export function familyDepth(pool) {
  const out = {};
  for (const c of pool) {
    const fam = c.family;
    (out[fam] ||= new Set()).add(objectOf(c));
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.size]));
}

/**
 * Distinct STRUCTURES each family can offer — the number that actually binds.
 *
 * `assignBands()` hands each slot a structure the family has not used yet and
 * gives up when the family runs out; the failure it prints says so in as many
 * words ("family A12b offers 2 distinct structures and the form has used them
 * all"). Objects are not the limit at plan time, structures are, and the first
 * version of policy C leaned on objects and broke fifteen forms in twenty-five.
 */
export function structureDepth(pool) {
  const out = {};
  for (const c of pool) {
    const id = c.archetype ? `${c.subForm}#${c.archetype}` : c.subForm;
    (out[c.family] ||= new Set()).add(id);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.size]));
}

export const POLICIES = {
  A: { id: 'A', name: 'fixed slot->family (the blueprint table)', plan: () => policyFixed() },
  B: { id: 'B', name: 'random permutation inside the declared ranges', plan: (seed) => policyRandom(seed) },
  C: { id: 'C', name: 'constraint-aware: structure-capped, depth-weighted, rotated', plan: (seed, o) => policyConstraintAware(seed, o) },
};

/* ══════════════════════════ deviation from the reference shape ══════════════════════════ */

/** Mean absolute deviation of a series' family mix from the blueprint's own table. */
export function familyMixDeviation(formsSlots) {
  const target = familyCounts(SLOTS);
  const fams = Object.keys(FAMILIES);
  let total = 0;
  for (const slots of formsSlots) {
    const c = familyCounts(slots);
    total += fams.reduce((a, f) => a + Math.abs((c[f] || 0) - (target[f] || 0)), 0);
  }
  return +(total / Math.max(1, formsSlots.length)).toFixed(2);
}

/** Mean absolute deviation of a series' band mix from BAND_PLAN. */
export function bandMixDeviation(forms, plan) {
  let total = 0;
  for (const f of forms) {
    const c = {}; for (const p of f) c[p.band] = (c[p.band] || 0) + 1;
    total += BANDS.reduce((a, b) => a + Math.abs((c[b] || 0) - (plan[b] || 0)), 0);
  }
  return +(total / Math.max(1, forms.length)).toFixed(2);
}

/* ══════════════════════════ the A/B/C simulation ══════════════════════════ */

/**
 * Assemble a series under one slot->family policy and measure it.
 *
 * The simulation runs the REAL assembler against a real pool — it is not a
 * model of the generator, it is the generator with one input changed. Anything
 * less would be measuring the model's opinion of the policy.
 *
 * `assembleFn` is injected so this module does not import the assembler, which
 * imports the signature layer, which would close a cycle.
 */
export function simulateSeries({ policy, forms: N = 25, seed0 = 31400, step = 977,
  assembleFn, poolFn, measureFn, verdictFn, depth = null }) {
  const { pool } = poolFn({ seed: seed0 });
  const d = depth ?? familyDepth(pool);
  const st = structureDepth(pool);
  const forms = [], plans = [], incomplete = [];
  for (let i = 1; i <= N; i++) {
    const seed = seed0 + i * step;
    const plan = policy.plan(seed, { depth: d, structures: st, formIndex: i });
    const run = assembleFn({ seed, slots: plan });
    plans.push(plan);
    if (run.placed.length === plan.length) forms.push(run.placed);
    else incomplete.push({ seed, placed: run.placed.length, why: run.unfilled?.[0]?.reason });
  }
  const V = new Set(pool.map(objectOf)).size;
  const m = measureFn(forms, { vocabulary: V });
  const bn = bottleneck(pool, forms, { vocabulary: V });
  return {
    policy: policy.id, name: policy.name,
    formsRequested: N, formsComplete: forms.length, incomplete,
    vocabulary: V,
    measure: m, verdict: verdictFn(m), bottleneck: bn,
    familyMixDeviation: familyMixDeviation(plans),
    planShapeFailures: plans.flatMap(p => planIsReferenceShaped(p).failures).length,
    forms, plans, pool,
  };
}

/* ══════════════════════════ the Stage-B gate ══════════════════════════ */

/**
 * Stage B's acceptance conditions, all ten, as one executable check.
 *
 * The brief was explicit that raw object count must not be sufficient, so this
 * returns a per-condition verdict rather than a number: every condition has to
 * hold at once, and a run that clears the vocabulary milestone while repeating
 * the same fifteen objects in every form fails here exactly as loudly as one
 * with no vocabulary at all.
 */
export const STAGE_B = {
  vocabulary: 250,
  overlapShare: 0.20,
  objectsInEveryForm: 0,
  allocationPenalty: 1.5,          // "meaningful movement from 2.40x toward 1x"
  mechanismObjects: 60,            // materially increased from the 24 Stage 22 measured
  familyMixDeviation: 0,
  bandMixDeviation: 2,
  minPerSpecies: { equation: 0.2, interpretation: 0.5, selection: 2 },
};

export function stageBGate({ measure, vocabulary, mechanismObjects, emittedSpecies = {},
  familyMixDeviation: fmd = 0, bandMixDeviation: bmd = 0, singleObjectCellsForced = 0,
  suitesGreen = null, formsComplete = 0, formsRequested = 0 } = {}) {
  const c = [];
  const add = (id, ok, detail) => c.push({ id, ok, detail });

  add('vocabulary', vocabulary >= STAGE_B.vocabulary,
    `${vocabulary} executable objects against a milestone of ${STAGE_B.vocabulary}`);
  add('overlap', measure.overlap.objects.share <= STAGE_B.overlapShare,
    `${(measure.overlap.objects.share * 100).toFixed(0)}% pairwise object overlap against a ceiling of ${STAGE_B.overlapShare * 100}%`);
  add('no-object-in-every-form', measure.objectsInEveryForm <= STAGE_B.objectsInEveryForm,
    `${measure.objectsInEveryForm} objects appear in every simulated form`);
  add('no-unintended-single-object-cell', singleObjectCellsForced === 0,
    `${singleObjectCellsForced} cells are single-object-forced without a recorded decision`);
  add('allocation-penalty', measure.allocationPenalty <= STAGE_B.allocationPenalty,
    `allocation penalty ${measure.allocationPenalty}x against a target of ${STAGE_B.allocationPenalty}x`);
  const species = Object.entries(STAGE_B.minPerSpecies)
    .filter(([k, min]) => (emittedSpecies[k] || 0) < min);
  add('non-value-species-emitted', species.length === 0,
    species.length ? `under-emitted: ${species.map(([k, min]) => `${k} ${(emittedSpecies[k] || 0).toFixed(1)}/form < ${min}`).join(', ')}`
      : `every non-value species is emitted, not merely available`);
  add('mechanism-capacity', mechanismObjects >= STAGE_B.mechanismObjects,
    `${mechanismObjects} mechanism objects against a target of ${STAGE_B.mechanismObjects}`);
  add('family-mix', fmd <= STAGE_B.familyMixDeviation, `family mix deviates ${fmd} slots per form`);
  add('band-mix', bmd <= STAGE_B.bandMixDeviation, `band mix deviates ${bmd} slots per form`);
  add('suites-green', suitesGreen === true, suitesGreen === null ? 'not measured here' : `suites green: ${suitesGreen}`);
  add('series-assembles', formsRequested > 0 && formsComplete === formsRequested,
    `${formsComplete}/${formsRequested} forms assembled complete`);

  return { ok: c.every(x => x.ok), passed: c.filter(x => x.ok).length, total: c.length, conditions: c };
}

/**
 * Capacity the candidate pool cannot see: the readers of a shared display.
 *
 * A set is assembled as a unit inside `assemble()`, from readers that are never
 * pool candidates, so every model built on the pool alone under-counts the A13
 * and A14 cells. This builds each reader once and reports it in the same shape
 * a pool candidate has, so `capacityMatrix` can take it as `extra`.
 */
export function readerCapacity(stimulusSetFn, kinds, { seed = 31400, families = ['A13', 'A13'] } = {}) {
  const out = [];
  for (const kind of kinds) {
    for (let i = 0; i < 6; i++) {
      const r = stimulusSetFn(kind, families, seed + i * 101, new Set(), { coreFirst: 1, priorFps: [] });
      if (r.error) continue;
      for (const it of r.items) out.push(it);
    }
  }
  return out;
}
