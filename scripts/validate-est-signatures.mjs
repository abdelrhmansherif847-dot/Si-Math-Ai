#!/usr/bin/env node
// Gate: the difficulty-aware blueprint — Stage 2. Auto-discovered by run-all.
//
// Every bound checked here traces to a measurement on the 200 coded reference
// items, and every check below fails on a reachable mistake. The mutation
// suite in tests/est-blueprint-gates.test.mjs proves that by breaking each one.
//
//   node scripts/validate-est-signatures.mjs           check
//   node scripts/validate-est-signatures.mjs --print   check, then the dry run

import {
  BANDS, SIGNATURES, BAND_SHARES, TRAP_MIX, MECHANISM_TARGETS, COMPOSITION_LIMITS,
  ARCHETYPE_DIVERSITY, TIME_BUDGET, ROUTINE_STREAM, MECHANISMS, REASONING_CORE,
  admits, profileOf,
} from './est-signatures.mjs';
import { PRIMITIVES, trapLevel, assess } from './est-primitives.mjs';
import { composeClassifyNormalise, COMPOSABLE, assessComposed, composableIds } from './est-compose.mjs';
import { dryRun, report, feasibility, BAND_PLAN, SERVES } from './est-dry-run.mjs';
import { DEMAND_BANDS, SLOTS, FAMILIES } from './est-blueprint.mjs';

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

/* ── 1. the signatures are properties, not a score ── */

for (const b of BANDS) {
  check(typeof SIGNATURES[b].admits === 'function', `${b}: no admission predicate`);
  check(typeof SIGNATURES[b].describe === 'string' && SIGNATURES[b].describe.length > 30,
    `${b}: the signature must describe the cognitive properties it requires`);
}
// NO BAND MAY REQUIRE EVERY MECHANISM. The richest profile a signature can ask
// for is four of the nine biting, which is the observed Peak median plus one.
const everything = { present: 9, biting: 9, core: 4, trap: 2, composed: false };
const nothing = { present: 0, biting: 0, core: 0, trap: 0, composed: false };
check(admits('Entry', nothing), 'Entry must admit an item carrying no mechanism at all');
check(!admits('Entry', everything), 'Entry must not admit a fully-loaded item');
check(!admits('Peak', nothing), 'Peak must not admit an item carrying no mechanism');
// Monotone at the ends: nothing the Entry signature admits may also be Peak.
let overlap = 0;
for (let present = 0; present <= 9; present++)
  for (let biting = 0; biting <= present; biting++)
    for (let core = 0; core <= Math.min(4, biting); core++)
      for (let trap = 0; trap <= 2; trap++) {
        const p = { present, biting, core, trap, composed: false };
        if (admits('Entry', p) && admits('Peak', p)) overlap++;
      }
check(overlap === 0, `${overlap} profiles are admitted by BOTH Entry and Peak — the bands do not separate`);

/* ── 2. steps are demoted, and the old score is still present ── */

check(!!DEMAND_BANDS, 'the demand score must NOT be deleted until the replacement is proven');
check(TIME_BUDGET.note.includes('0.000') || TIME_BUDGET.note.includes('+0.036'),
  'the time budget must record why steps stopped placing items');
const sigSource = Object.values(SIGNATURES).map(s => String(s.admits)).join(' ');
check(!/steps/.test(sigSource), 'no signature may read step count — steps are a time signal only');

/* ── 3. quota ranges are the observed ones ── */

for (const b of BANDS) {
  const [lo, hi] = BAND_SHARES[b].range;
  check(lo >= 0 && hi > lo && hi <= 50, `band ${b}: implausible range ${lo}..${hi}`);
}
const bandMin = BANDS.reduce((a, b) => a + BAND_SHARES[b].range[0], 0);
const bandMax = BANDS.reduce((a, b) => a + BAND_SHARES[b].range[1], 0);
check(bandMin <= 50 && bandMax >= 50, `band ranges cannot sum to 50 (min ${bandMin}, max ${bandMax})`);
const trapMin = [0, 1, 2].reduce((a, l) => a + TRAP_MIX[l].range[0], 0);
const trapMax = [0, 1, 2].reduce((a, l) => a + TRAP_MIX[l].range[1], 0);
check(trapMin <= 50 && trapMax >= 50, `trap ranges cannot sum to 50 (min ${trapMin}, max ${trapMax})`);
check(TRAP_MIX[0].range[0] === 0, 'a form must be allowed to contain no routine item — the reference low is 0');
check(TRAP_MIX[0].range[1] > 0, 'a form must be ALLOWED routine items — that is the whole trap-saturation fix');

/* ── 4. the band plan sits inside every range ── */

check(BANDS.reduce((a, b) => a + BAND_PLAN[b], 0) === 50, 'the band plan must place exactly 50 items');
for (const b of BANDS) {
  const [lo, hi] = BAND_SHARES[b].range;
  check(BAND_PLAN[b] >= lo && BAND_PLAN[b] <= hi, `band plan ${b}=${BAND_PLAN[b]} outside the observed range ${lo}..${hi}`);
}

/* ── 5. composition ── */

check(COMPOSITION_LIMITS.maxDepth === 2, 'composition depth must be capped at two — the route product fills four options exactly');
check(COMPOSITION_LIMITS.allowedBands.every(b => BANDS.includes(b)), 'composition allowed in an unknown band');
check(!COMPOSITION_LIMITS.allowedBands.includes('Entry') && !COMPOSITION_LIMITS.allowedBands.includes('Core'),
  'composition must not be permitted in Entry or Core');
check(COMPOSABLE.some(c => c.disallowed), 'the composable table must record at least one pattern it REJECTS, or it records no judgement');
check(composableIds().length >= 1, 'no composition pattern is available at all');

let composed = 0, composedRejected = 0;
for (let s = 5000; s < 5120 && composed < 12; s++) {
  const it = composeClassifyNormalise(s);
  if (it.error) { composedRejected++; continue; }
  composed++;
  check(it.composedOf.length === 2, `composed#${s}: depth ${it.composedOf.length}`);
  check(Array.isArray(it.counterfactuals) && it.counterfactuals.length === 2,
    `composed#${s}: needs one counterfactual per mechanism, has ${it.counterfactuals?.length}`);
  const v = assessComposed(it);
  check(v.ok, `composed#${s}: ${v.reasons.join('; ')}`);
  for (const cell of ['a', 'b', 'ab'])
    check(it.options.some(o => o.value && it.errorGrid[cell] !== undefined), `composed#${s}: error grid cell ${cell} missing`);
}
check(composed >= 10, `only ${composed} composed items in 120 seeds (${composedRejected} rejected)`);

/* ── 6. diversity and the routine stream ── */

check(ARCHETYPE_DIVERSITY.maxPerArchetype >= 1 && ARCHETYPE_DIVERSITY.maxPerArchetype <= 3,
  'the per-archetype ceiling must be small — a form is met once');
check(ROUTINE_STREAM.generated === false, 'the routine stream must declare that it is NOT generated');
check(ROUTINE_STREAM.profile.biting === 0 && ROUTINE_STREAM.profile.core === 0,
  'the routine stream must carry an Entry profile');
check(admits('Entry', ROUTINE_STREAM.profile), 'the routine stream profile must be Entry-admissible');

/* ── 7. the constraint system is consistent, with a witness ── */

const feas = feasibility();
check(feas.ok, `the constraint system is inconsistent: ${feas.fails.join('; ')}`);

/* ── 8. the dry run runs, and reports its own gap ── */

const run = dryRun();
check(run.placed.length + run.routine.length === SLOTS.length, 'the dry run must account for all 50 slots');
check(run.placed.every(p => admits(p.band, profileOf(p.item, trapLevel))),
  'the dry run placed an item its slot signature does not admit');
check(run.placed.every(p => assess(p.item).loadBearing || p.item.composedOf),
  'the dry run placed an item that is not load-bearing');
// The coverage gap is REPORTED, not hidden. This asserts the honesty, not the size.
check(run.routine.length > 0 ? run.routine.every(r => typeof r.reason === 'string' && r.reason.length > 10) : true,
  'every unfilled slot must carry a stated reason');
check(Object.keys(SERVES).length >= 14, 'the family-service map has lost entries');

/* ── report ── */

if (process.argv.includes('--print')) console.log(report(run));

if (fails.length) {
  console.error(`FAIL  est-signatures: ${fails.length} check(s) failed`);
  for (const f of fails.slice(0, 25)) console.error(`  • ${f}`);
  process.exit(1);
}
console.log(`PASS  est-signatures: 4 signatures, band plan ${BANDS.map(b => BAND_PLAN[b]).join('/')}, ` +
  `constraint system consistent, dry run filled ${run.placed.length}/50 with ${run.routine.length} reported unserved`);
