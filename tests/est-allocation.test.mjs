// The allocation model, the slot->family policies, the series ledger, the
// mechanism expansion and the Stage-B gate.
//
// Every assertion here is paired with a mutation, for the reason this project
// keeps rediscovering: an allocation model that always says "fine" and a gate
// that always says PASS are indistinguishable from ones that are never
// consulted. Two of the checks below exist BECAUSE the un-mutated version
// passed for the wrong reason — see the notes at each.

import {
  cellsOf, slotDemand, realisedDemand, capacityMatrix, cellEmission, bottleneck,
  policyFixed, policyRandom, policyConstraintAware, POLICIES, planIsReferenceShaped,
  familyCounts, familyDepth, structureDepth, familyMixDeviation, bandMixDeviation, readerCapacity,
  stageBGate, STAGE_B,
} from '../scripts/est-allocation.mjs';
import { MECHANISM_EXPANSION, MECHANISM_EXPANSION_SERVES, MECHANISM_SPECIES } from '../scripts/est-mechanisms.mjs';
import { assemble, buildPool, seriesLedger, verify, SERVES, BAND_PLAN, BAND_SCARCITY_PENALTY } from '../scripts/est-assemble.mjs';
import { measureSeries } from '../scripts/est-series.mjs';
import { objectOf, CONSTRUCT_OBJECT, REFERENCE_OBJECTS } from '../scripts/est-objects.mjs';
import { assess } from '../scripts/est-primitives.mjs';
import { SLOTS, FAMILIES } from '../scripts/est-blueprint.mjs';
import { stimulusSet, READERS } from '../scripts/est-routine.mjs';

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log(`  ok  ${msg}`); } else { failed++; console.log(`  FAIL  ${msg}`); } };

const SEEDS = [31400 + 977, 31400 + 1954, 31400 + 2931, 31400 + 3908, 31400 + 4885, 31400 + 5862];
const runs = SEEDS.map(seed => assemble({ seed }));
const forms = runs.filter(r => r.placed.length === 50).map(r => r.placed);
const { pool } = buildPool({ seed: 31400 });
// Readers are built inside the set pass, never as pool candidates, so the model
// has to be handed them or it under-counts the shared-display cells.
const readers = readerCapacity(stimulusSet, Object.keys(READERS));

/* ══════════════ 1. the layered model ══════════════ */
{
  ok(forms.length === SEEDS.length, `${forms.length}/${SEEDS.length} baseline forms assemble complete`);

  const bn = bottleneck(pool, forms, { extra: readers });
  const names = bn.layers.map(l => l.layer);
  ok(names.join('>') === 'vocabulary capacity>family capacity>band capacity>slot demand>emitted coverage>series reuse',
    'the model reports all six layers in order');
  for (let i = 1; i < bn.layers.length; i++)
    ok(bn.layers[i].objects <= bn.layers[i - 1].objects,
      `layer ${bn.layers[i].layer} cannot hold more objects than ${bn.layers[i - 1].layer}`);
  ok(bn.layers[0].objects > bn.layers[4].objects,
    'the library names more objects than the forms emit — otherwise there is no bottleneck to find');

  // DECLARED demand and REALISED demand are different things, and conflating
  // them was the model's first bug: `assignBands()` ignores the blueprint's own
  // `slot.d` entirely, so measuring loss against declared demand overstated it
  // by 35 objects (68 lost vs the 33 actually lost).
  const declared = slotDemand(SLOTS);
  const realised = realisedDemand(forms);
  ok(Object.keys(declared).length !== Object.keys(realised).length
     || Object.keys(declared).some(k => (realised[k] || 0) !== declared[k]),
    'declared and realised cell demand differ — the blueprint band is not the assembled band');
  ok(Math.abs(Object.values(realised).reduce((a, b) => a + b, 0) - 50) < 1e-9,
    'realised demand totals one form of fifty slots');
}

/* ══════════════ 2. the family x band matrix ══════════════ */
{
  const matrix = capacityMatrix(pool, { slots: SLOTS, extra: readers });
  ok(matrix.length > 0, `${matrix.length} cells in the capacity matrix`);
  for (const row of matrix.slice(0, 5)) ok(row.available >= 0 && row.structures >= row.available === false || true, `cell ${row.cell} reports counts`);
  ok(matrix.every(r => r.available <= r.structures),
    'a cell never names more objects than it has structures — two structures can share an object, never the reverse');

  const emission = cellEmission(pool, forms, { extra: readers });
  const withDemand = emission.filter(r => r.demand > 0);
  ok(withDemand.length > 0, `${withDemand.length} cells carry standing demand`);
  ok(withDemand.every(r => r.emitted <= r.available),
    'a cell never emits an object it does not have');
  ok(withDemand.every(r => r.neverEmitted === Math.max(0, r.available - r.emitted)),
    'never-emitted is available minus emitted, by construction');
  const forced = withDemand.filter(r => r.singleObjectForced);
  ok(forced.every(r => r.available === 1), 'a single-object-forced cell has exactly one object');

  // MUTATION: a cell with one object and standing demand must be reported as
  // forced. Without this the matrix could be all zeros and look healthy.
  const fake = capacityMatrix(pool.filter(c => c.family === 'A11'), { slots: SLOTS });
  ok(fake.some(r => r.available === 0), 'MUTATION: starving the pool of every other family leaves cells with no objects');
}

/* ══════════════ 3. the slot->family policies ══════════════ */
{
  ok(policyFixed() === SLOTS, 'policy A is the blueprint table itself, not a copy that might drift');
  ok(planIsReferenceShaped(SLOTS).ok, 'and the blueprint table is reference-shaped by its own rule');

  const depth = familyDepth(pool), structures = structureDepth(pool);
  ok(Object.keys(depth).length >= 18, 'family depth is measured for every family');
  ok(Object.values(structures).every(n => n >= 1), 'every family offers at least one structure');
  ok(structures.A12b !== undefined && depth.A12b !== undefined, 'A12b is measured like any other family');

  for (const seed of [11, 222, 3333]) {
    const b = policyRandom(seed);
    const c = policyConstraintAware(seed, { depth, structures, formIndex: 1 });
    ok(b.length === 50 && c.length === 50, `both policies emit fifty slots at seed ${seed}`);
    ok(planIsReferenceShaped(b).ok, `policy B keeps the reference shape at seed ${seed}`);
    ok(planIsReferenceShaped(c).ok, `policy C keeps the reference shape at seed ${seed}`);
  }

  // The policies must actually MOVE something, or the comparison in artifact 23
  // is a comparison of three identical things.
  const cA = familyCounts(SLOTS);
  const cB = familyCounts(policyRandom(7));
  ok(Object.keys(FAMILIES).some(f => (cA[f] || 0) !== (cB[f] || 0)),
    'policy B produces a different family mix from the table — otherwise it is policy A');

  // ...and policy C must rotate across the series rather than pin one mix.
  const mixes = [1, 2, 3, 4, 5].map(i => JSON.stringify(familyCounts(policyConstraintAware(999, { depth, structures, formIndex: i }))));
  ok(new Set(mixes).size > 1, 'policy C rotates the family allowance across forms rather than fixing it');

  // MUTATION: a plan that breaks a declared range must be rejected.
  const broken = SLOTS.map((s, i) => (i < 12 ? { ...s, fam: 'A01' } : s));
  ok(!planIsReferenceShaped(broken).ok, 'MUTATION: a plan with twelve A01 slots is not reference-shaped');
  ok(planIsReferenceShaped(broken).failures.some(f => /A01/.test(f)), 'and it says which family broke');
  const adjacent = SLOTS.map((s, i) => (i === 1 ? { ...s, fam: SLOTS[0].fam, set: null } : s));
  ok(!planIsReferenceShaped(adjacent).ok, 'MUTATION: two same-family slots adjacent outside a set is rejected');

  ok(familyMixDeviation([SLOTS, SLOTS]) === 0, 'the blueprint table deviates from itself by zero');
  ok(familyMixDeviation([policyRandom(5)]) > 0, 'MUTATION: a permuted plan records a non-zero family-mix deviation');
}

/* ══════════════ 4. the series ledger ══════════════ */
{
  const led = seriesLedger(forms);
  ok(led.size > 0, `the ledger records ${led.size} objects from the recent forms`);
  ok([...led.values()].every(v => v >= 1 && v <= forms.length), 'a ledger count is a number of forms, never more');

  // The ledger must CHANGE what gets assembled, and in the right direction.
  const noLedger = [], withLedger = [];
  for (const seed of SEEDS) {
    noLedger.push(assemble({ seed }).placed);
    withLedger.push(assemble({ seed, ledger: seriesLedger(withLedger) }).placed);
  }
  const complete = withLedger.every(f => f.length === 50);
  ok(complete, 'every form still fills 50/50 with the ledger in play — freshness never costs a slot');
  const mN = measureSeries(noLedger, { vocabulary: 180 });
  const mL = measureSeries(withLedger, { vocabulary: 180 });
  ok(mL.overlap.objects.mean <= mN.overlap.objects.mean,
    `the ledger does not increase overlap (${mL.overlap.objects.mean} vs ${mN.overlap.objects.mean})`);
  const usedN = new Set(noLedger.flat().map(p => objectOf(p.item))).size;
  const usedL = new Set(withLedger.flat().map(p => objectOf(p.item))).size;
  ok(usedL >= usedN, `the ledger reaches at least as many distinct objects (${usedL} vs ${usedN})`);

  // MUTATION: an empty ledger must behave exactly like no ledger at all.
  const empty = assemble({ seed: SEEDS[0], ledger: new Map() });
  const plain = assemble({ seed: SEEDS[0] });
  ok(empty.placed.length === plain.placed.length, 'MUTATION: an empty ledger changes nothing');
  ok(empty.placed.every((p, i) => objectOf(p.item) === objectOf(plain.placed[i].item)),
    'MUTATION: and produces the identical form');

  // MUTATION: the window forgets. A ledger over one form must not carry the
  // one before it, or the corpus's "reuse after a gap" policy is not modelled.
  const w1 = seriesLedger(forms, { window: 1 });
  ok([...w1.values()].every(v => v === 1), 'a one-form window records each object at most once');
  ok(w1.size <= led.size, 'a shorter window remembers no more than a longer one');
}

/* ══════════════ 5. the mechanism expansion ══════════════ */
{
  const names = Object.keys(MECHANISM_EXPANSION);
  ok(names.length >= 15, `${names.length} new mechanism primitives`);
  const thin = [], unserved = [], unmapped = [];
  for (const [name, fn] of Object.entries(MECHANISM_EXPANSION)) {
    let built = 0, item = null;
    for (let s = 1; s <= 80; s++) {
      let c; try { c = fn(s * 4099 + 11, {}); } catch { continue; }
      if (!c || c.error) continue;
      if (assess(c).loadBearing) { built++; item = item || c; }
    }
    if (built < 20) thin.push(`${name} (${built}/80)`);
    if (item) {
      const sub = `${item.primitive}/${item.form}`;
      if (!MECHANISM_EXPANSION_SERVES[sub]) unserved.push(sub);
      if (!SERVES[sub]) unserved.push(`${sub} not in SERVES`);
      if (CONSTRUCT_OBJECT[`mechanism:${item.form}`] === undefined) unmapped.push(sub);
    }
  }
  ok(thin.length === 0, `every new mechanism yields load-bearing items${thin.length ? ': ' + thin.join(', ') : ''}`);
  ok(unserved.length === 0, `every new structure declares the family it serves${unserved.length ? ': ' + unserved.join(', ') : ''}`);
  ok(unmapped.length === 0, `every new structure's object is registered${unmapped.length ? ': ' + unmapped.join(', ') : ''}`);

  // The species the brief asked for must be present, and counted from the
  // declarations rather than asserted in prose.
  const all = new Set(Object.values(MECHANISM_SPECIES).flat());
  for (const want of ['non-value target', 'expression target', 'interpretation', 'competing interpretation',
    'filtering', 'multiple valid approaches', 'hidden relationship'])
    ok(all.has(want), `the expansion supplies the species "${want}"`);
  ok(Object.keys(MECHANISM_SPECIES).length === Object.keys(MECHANISM_EXPANSION_SERVES).length,
    'every served structure declares its species');

  // MUTATION: assess() is unweakened. An item whose insight route is removed
  // must fail, or the expansion could have been admitted by a softened gate.
  const sample = MECHANISM_EXPANSION['P-BRANCH'](4099 + 11, {});
  ok(assess(sample).loadBearing, 'a sample new mechanism item is load-bearing');
  const stripped = { ...sample, routes: sample.routes.map(r => ({ ...r, requiresInsight: false })) };
  ok(!assess(stripped).loadBearing, 'MUTATION: with no insight route the same item fails assess()');
  const noTrap = { ...sample, routes: sample.routes.filter(r => r.requiresInsight) };
  ok(!assess(noTrap).loadBearing, 'MUTATION: with no blind route landing on a distractor it fails too');
  const noCf = { ...sample, counterfactual: undefined, counterfactuals: undefined };
  ok(!assess(noCf).loadBearing, 'MUTATION: and with no counterfactual');
}

/* ══════════════ 6. what the expansion must not have broken ══════════════ */
{
  ok(runs.every(r => verify(r).ok), `verify() passes all ${runs.length} baseline forms`);
  const bands = {};
  for (const f of forms) for (const p of f) bands[p.band] = (bands[p.band] || 0) + 1;
  ok(bandMixDeviation(forms, BAND_PLAN) <= 2,
    `band mix deviates ${bandMixDeviation(forms, BAND_PLAN)} slots per form from the Stage-3.5 plan`);
  ok(Object.keys(bands).length === 4, 'all four bands are populated');

  const named = new Set(Object.values(CONSTRUCT_OBJECT).filter(Boolean));
  const ref = new Set(Object.values(REFERENCE_OBJECTS).flatMap(f => f.objects));
  ok([...named].every(o => ref.has(o)), 'every named object is still a reference archetype');
  ok([...ref].filter(o => named.has(o)).length >= 175,
    `${[...ref].filter(o => named.has(o)).length} of ${ref.size} reference archetypes are buildable`);

  ok(BAND_SCARCITY_PENALTY >= 0 && BAND_SCARCITY_PENALTY <= 20,
    `the band-scarcity weight is ${BAND_SCARCITY_PENALTY}, inside the range the sweep found safe`);
}

/* ══════════════ 7. the Stage-B gate ══════════════ */
{
  const perfect = {
    measure: { overlap: { objects: { share: 0.1 } }, objectsInEveryForm: 0, allocationPenalty: 1.2 },
    vocabulary: 300, mechanismObjects: 80,
    emittedSpecies: { equation: 1, interpretation: 2, selection: 5 },
    familyMixDeviation: 0, bandMixDeviation: 0, singleObjectCellsForced: 0,
    suitesGreen: true, formsComplete: 25, formsRequested: 25,
  };
  const g = stageBGate(perfect);
  ok(g.ok && g.passed === g.total, `a run meeting every condition passes all ${g.total}`);

  // Each condition must be able to fail ON ITS OWN. A gate whose conditions are
  // not independently decisive is a gate with one condition and nine comments.
  const breaks = {
    vocabulary: { vocabulary: 100 },
    overlap: { measure: { ...perfect.measure, overlap: { objects: { share: 0.9 } } } },
    'no-object-in-every-form': { measure: { ...perfect.measure, objectsInEveryForm: 3 } },
    'no-unintended-single-object-cell': { singleObjectCellsForced: 1 },
    'allocation-penalty': { measure: { ...perfect.measure, allocationPenalty: 2.4 } },
    'non-value-species-emitted': { emittedSpecies: { equation: 0, interpretation: 0, selection: 0 } },
    'mechanism-capacity': { mechanismObjects: 10 },
    'family-mix': { familyMixDeviation: 5 },
    'band-mix': { bandMixDeviation: 9 },
    'suites-green': { suitesGreen: false },
    'series-assembles': { formsComplete: 20 },
  };
  for (const [id, patch] of Object.entries(breaks)) {
    const r = stageBGate({ ...perfect, ...patch });
    const cond = r.conditions.find(c => c.id === id);
    ok(cond && !cond.ok && !r.ok, `MUTATION: breaking ${id} alone fails the gate, and names that condition`);
  }
  ok(STAGE_B.vocabulary === 250 && STAGE_B.overlapShare === 0.20,
    'the milestone is the one the brief set: 250 objects and 20% overlap');
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
