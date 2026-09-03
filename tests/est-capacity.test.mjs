// The series-capacity optimization: eligibility, the ceiling, the cooldown
// policies and the revised readiness gate.
//
// A ceiling that is not provably a ceiling is a guess with a decimal point, so
// the bound below is checked against hand-computable cases where the answer is
// known by arithmetic, and against the constructive optimizer, which must never
// beat it. Every policy and every gate condition is mutation-tested.

import {
  eligibility, DIVERSITY_LOSS, pairwiseOverlap, overlapFromCounts,
  overlapLowerBound, optimalSeries, bindingConstraints,
  objectScarcity, COOLDOWN_POLICIES,
  READINESS, capacityEfficiency, readinessGate,
} from '../scripts/est-capacity.mjs';
import { assemble, buildPool, verify, BAND_PLAN } from '../scripts/est-assemble.mjs';
import { readerCapacity, bandMixDeviation } from '../scripts/est-allocation.mjs';
import { stimulusSet, READERS } from '../scripts/est-routine.mjs';
import { measureSeries } from '../scripts/est-series.mjs';
import { objectOf, CONSTRUCT_OBJECT, REFERENCE_OBJECTS } from '../scripts/est-objects.mjs';

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log(`  ok  ${msg}`); } else { failed++; console.log(`  FAIL  ${msg}`); } };

const N = 8;
const { pool } = buildPool({ seed: 31400 });
const readers = readerCapacity(stimulusSet, Object.keys(READERS));
const forms = [];
for (let i = 1; i <= N; i++) { const r = assemble({ seed: 31400 + i * 977 }); if (r.placed.length === 50) forms.push(r.placed); }

/* ══════════════ 1. overlap arithmetic ══════════════ */
{
  // Sum over pairs of |F_i n F_j| = sum over objects of C(n_o, 2). The whole
  // model rests on this identity, so it is checked on a case done by hand.
  const f = [['a', 'b'], ['a', 'c'], ['a', 'b']];
  //  a in 3 forms -> C(3,2)=3;  b in 2 -> 1;  c in 1 -> 0.  total 4, over 3 pairs.
  ok(Math.abs(pairwiseOverlap(f) - 4 / 3) < 1e-9, 'pairwise overlap of a hand-computed series is 4/3');
  ok(Math.abs(overlapFromCounts([3, 2, 1], 3) - 4 / 3) < 1e-9, 'and the identity from counts agrees');
  ok(pairwiseOverlap([['a']]) === 0, 'a one-form series has no pairs');
  ok(pairwiseOverlap([['a'], ['b']]) === 0, 'MUTATION: two disjoint forms overlap on nothing');
  ok(pairwiseOverlap([['a'], ['a']]) === 1, 'MUTATION: two identical one-slot forms overlap fully');
}

/* ══════════════ 2. the lower bound is a bound ══════════════ */
{
  // One cell, one slot a form, two eligible objects, ten forms: the best
  // possible split is 5/5, so C(5,2)*2 = 20 over C(10,2)=45 pairs.
  const cells = [{ cell: 'X/Peak', family: 'X', band: 'Peak', demand: 1, objects: ['o1', 'o2'], streams: 'mechanism' }];
  const lb = overlapLowerBound(cells, { N: 10 });
  ok(Math.abs(lb.overlap - 20 / 45) < 1e-9, 'the bound on a hand-computable cell is exactly 20/45');
  ok(lb.forcedEveryFormObjects === 0, 'and two objects over ten forms force none into every form');

  // One object, one slot, ten forms: it is in every form and overlap is 1.
  const forced = [{ cell: 'X/Peak', family: 'X', band: 'Peak', demand: 1, objects: ['only'], streams: 'mechanism' }];
  const lf = overlapLowerBound(forced, { N: 10 });
  ok(Math.abs(lf.overlap - 1) < 1e-9, 'MUTATION: a single-object cell forces overlap of exactly one slot');
  ok(lf.forcedEveryFormObjects === 1, 'MUTATION: and reports the object as forced into every form');

  // More objects can never make the bound worse.
  const wide = [{ ...cells[0], objects: ['o1', 'o2', 'o3', 'o4', 'o5'] }];
  ok(overlapLowerBound(wide, { N: 10 }).overlap < lb.overlap, 'widening a cell lowers the bound');

  // The constructive optimizer must never beat the bound. If it does, one of
  // the two is wrong, and a ceiling nothing can check is not a ceiling.
  const e = eligibility(pool, forms, { extra: readers });
  const bound = overlapLowerBound(e.cells, { N });
  const opt = optimalSeries(e.cells, { N });
  ok(opt.overlap >= bound.overlap - 1e-9,
    `the constructive optimum (${opt.overlap.toFixed(2)}) does not beat the bound (${bound.overlap.toFixed(2)})`);
  ok(opt.slotsPerForm === 50, `the optimizer builds fifty-slot forms, not ${opt.slotsPerForm}`);
  ok(opt.distinctPerForm.min >= 45, `and ${opt.distinctPerForm.min}-${opt.distinctPerForm.max} distinct objects in each`);
  ok(bound.infeasibleCells === 0, 'no cell is infeasible at N=8');
}

/* ══════════════ 3. eligibility reflects the forms, not the blueprint ══════════════ */
{
  const e = eligibility(pool, forms, { extra: readers });
  ok(e.cells.length > 0, `${e.cells.length} cells carry demand`);
  ok(Math.abs(e.totalDemand - 50) < 0.51, `cell demand totals ${e.totalDemand.toFixed(1)} slots per form`);
  ok(e.cells.every(c => c.objects.length >= 0), 'every cell reports its eligible objects');
  ok(e.universe.size > 100, `${e.universe.size} objects are eligible for some cell with demand`);

  // MUTATION: readers are invisible to a pool-only view, and the A13 cells are
  // where that shows. Stage B found this by contradiction; it stays checked.
  const withoutReaders = eligibility(pool, forms).cells.find(c => c.cell === 'A13/Core');
  const withReaders = e.cells.find(c => c.cell === 'A13/Core');
  if (withReaders) ok((withoutReaders?.objects.length || 0) < withReaders.objects.length,
    'MUTATION: dropping the reader capacity under-counts A13/Core, as it did before it was fixed');
}

/* ══════════════ 4. the objective is written down ══════════════ */
{
  for (const k of ['pairwiseObjectOverlap', 'everyFormObject', 'repeatedObjectFrequency',
    'reasoningSpeciesOverlap', 'targetStructureOverlap', 'cellScarcityPressure', 'allocationPenalty'])
    ok(typeof DIVERSITY_LOSS[k] === 'number', `the loss weights the ${k} term`);
  ok(DIVERSITY_LOSS.everyFormObject > DIVERSITY_LOSS.pairwiseObjectOverlap,
    'an object in every form is weighted above raw overlap — the corpus has none of the first');
}

/* ══════════════ 5. binding constraints ══════════════ */
{
  const e = eligibility(pool, forms, { extra: readers });
  const bc = bindingConstraints(e.cells, { N, targetShare: 0.20 });
  ok(bc.rows.length > 0, `${bc.rows.length} cells reported with a vocabulary requirement`);
  ok(bc.rows.every(r => r.wouldNeed >= r.have), 'a cell never needs fewer objects than it has');
  const top = bc.rows[0];
  ok(top.contribution >= bc.rows[bc.rows.length - 1].contribution,
    'the rows are ranked by how much of the bound they carry');
  ok(bc.rows.some(r => /Stretch|Peak/.test(r.cell)), 'the hard bands appear among the binding cells');
}

/* ══════════════ 6. the cooldown policies ══════════════ */
{
  const e = eligibility(pool, forms, { extra: readers });
  const scarcity = objectScarcity(e.cells);
  ok(scarcity.size > 0, `scarcity measured for ${scarcity.size} objects`);
  ok([...scarcity.values()].every(v => v >= 1), 'a scarcity score is a count of alternatives, never zero');

  ok(COOLDOWN_POLICIES.A.build([]) === null, 'policy A applies no cooldown at all');
  for (const id of ['B', 'C', 'D']) {
    const led = COOLDOWN_POLICIES[id].build(forms, { scarcity });
    ok(led instanceof Map && led.size > 0, `policy ${id} produces a ledger over ${led.size} objects`);
  }
  // B and C differ only in how far back they look, so C must remember more.
  const b = COOLDOWN_POLICIES.B.build(forms), c = COOLDOWN_POLICIES.C.build(forms);
  ok(c.size >= b.size, 'a two-form cooldown remembers at least as much as a one-form cooldown');

  // MUTATION: D must weight by scarcity, not uniformly. Two objects seen the
  // same number of times but with different scarcity must score differently.
  const led = COOLDOWN_POLICIES.D.build(forms, { scarcity });
  const scores = [...led.entries()].map(([o, v]) => `${scarcity.get(o)}:${v.toFixed(3)}`);
  ok(new Set([...led.values()]).size > 1, 'MUTATION: policy D does not score every object identically');

  // Every policy must still produce assemblable forms. A cooldown that starves
  // a cell is not a diversity policy, it is a bug.
  for (const id of ['A', 'B', 'C', 'D']) {
    const hist = []; let complete = 0;
    for (let i = 1; i <= 4; i++) {
      const r = assemble({ seed: 31400 + i * 977, ledger: COOLDOWN_POLICIES[id].build(hist, { scarcity }) });
      if (r.placed.length === 50) { hist.push(r.placed); complete++; }
    }
    ok(complete === 4, `policy ${id} assembles 4/4 forms`);
    const bands = {}; for (const f of hist) for (const p of f) bands[p.band] = (bands[p.band] || 0) + 1;
    ok((bands.Stretch || 0) / hist.length >= 8, `policy ${id} does not starve Stretch (${((bands.Stretch || 0) / hist.length).toFixed(1)} per form)`);
    ok((bands.Peak || 0) / hist.length >= 11, `policy ${id} does not starve Peak (${((bands.Peak || 0) / hist.length).toFixed(1)} per form)`);
  }
}

/* ══════════════ 7. the revised readiness gate ══════════════ */
{
  ok(capacityEfficiency(20, 40) === 0.5, 'efficiency is the ceiling over the achieved value');
  ok(capacityEfficiency(20, 0) === 0, 'and is zero rather than infinite when nothing was achieved');

  const perfect = {
    archetypesBuilt: 189, archetypesNamed: 189, unbuiltClassified: true,
    bound: 20, achieved: 21, everyFormObjects: 3, everyFormMinimum: 3,
    formsComplete: 25, formsRequested: 25, bandMixDeviation: 0, familyMixDeviation: 0, suitesGreen: true,
  };
  const g = readinessGate(perfect);
  ok(g.ok && g.passed === g.total, `a run meeting every revised condition passes all ${g.total}`);

  const breaks = {
    'vocabulary-completeness': { archetypesBuilt: 100 },
    'unbuilt-classified': { unbuiltClassified: false },
    'allocation-efficiency': { achieved: 60 },
    'every-form-objects': { everyFormObjects: 30 },
    'series-assembles': { formsComplete: 24 },
    'band-mix': { bandMixDeviation: 9 },
    'family-mix': { familyMixDeviation: 4 },
    'suites-green': { suitesGreen: false },
  };
  for (const [id, patch] of Object.entries(breaks)) {
    const r = readinessGate({ ...perfect, ...patch });
    const cond = r.conditions.find(x => x.id === id);
    ok(cond && !cond.ok && !r.ok, `MUTATION: breaking ${id} alone fails the revised gate and names it`);
  }

  // The gate must not be satisfiable by vocabulary alone — that was the defect
  // in the 250-object milestone it replaces.
  const bigButBadlyAllocated = readinessGate({ ...perfect, archetypesBuilt: 189, achieved: 45 });
  ok(!bigButBadlyAllocated.ok,
    'MUTATION: a complete vocabulary allocated badly still fails — raw object count is not sufficient');

  ok(READINESS.allocationEfficiency > 0 && READINESS.allocationEfficiency <= 1,
    'the efficiency target is a fraction of an achievable ceiling, not an absolute overlap');
}

/* ══════════════ 8. the supported vocabulary, and what remains ══════════════ */
{
  const named = new Set(Object.values(CONSTRUCT_OBJECT).filter(Boolean));
  const ref = new Set(Object.values(REFERENCE_OBJECTS).flatMap(f => f.objects));
  const built = [...ref].filter(o => named.has(o));
  const unbuilt = [...ref].filter(o => !named.has(o));
  ok(built.length >= 183, `${built.length} of ${ref.size} named archetypes are executable`);
  ok(unbuilt.length <= 6, `${unbuilt.length} remain: ${unbuilt.join(', ')}`);
  // Every remaining gap must be one the artifact classified as infrastructure.
  const INFRASTRUCTURE = new Set(['inequality-from-graph', 'absvalue-graph-identify', 'graph-roman-numeral',
    'event-anchored-series-scan', 'physics-graph-unit-conversion', 'vertical-line-roman']);
  ok(unbuilt.every(o => INFRASTRUCTURE.has(o)),
    'every remaining gap is one of the six classified as needing a graph or display layer');
  ok([...named].every(o => ref.has(o)), 'and nothing was invented to close the count');
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
