#!/usr/bin/env node
// Gate: the form assembler must fill 50 slots from the real generator paths,
// across independent seeds, with every checkable constraint holding at once.
//
// Stage 2 proved the constraint SYSTEM consistent with a constructed witness
// and filled 10 of 50. A witness is not assembly feasibility, and this gate is
// the difference: it runs the generator.
//
//   node scripts/validate-est-assembly.mjs           check
//   node scripts/validate-est-assembly.mjs --print   check, then the dry run

import { assemble, verify, report, bottleneck, BAND_PLAN, SERVES } from './est-assemble.mjs';
import { BANDS, BAND_SHARES, COMPOSITION_LIMITS, admits, profileOf } from './est-signatures.mjs';
import { trapLevel, assess } from './est-primitives.mjs';
import { assessRoutine, ROUTINE_FAMILIES, CONSTRUCT_COUNTS, kindsFor, READERS } from './est-routine.mjs';
import { assessComposed } from './est-compose.mjs';
import { fingerprintItem, detectClone } from './est-fingerprint.mjs';
import { SLOTS, FAMILIES, SET_RULES, KAR_CALIBRATION } from './est-blueprint.mjs';

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

/* ── the five seeds ── */

const SEEDS = [4100, 5200, 6300, 7400, 8500];
const runs = SEEDS.map(seed => ({ seed, run: assemble({ seed }) }));

for (const { seed, run } of runs) {
  check(run.placed.length === SLOTS.length, `seed ${seed}: filled ${run.placed.length}/50`);
  const v = verify(run);
  check(v.ok, `seed ${seed}: ${v.fails.join('; ')}`);

  // E. No mechanism is satisfied through metadata. Every item is re-checked by
  //    the contract for ITS stream, from the item itself.
  for (const p of run.placed) {
    const it = p.item;
    if (it.stream === 'routine') check(assessRoutine(it).ok, `seed ${seed} Q${p.q}: routine contract`);
    else if (it.composedOf) check(assessComposed(it).ok, `seed ${seed} Q${p.q}: composed contract`);
    else check(assess(it).loadBearing, `seed ${seed} Q${p.q}: load-bearing`);
    check(admits(p.band, profileOf(it, trapLevel)), `seed ${seed} Q${p.q}: not admissible in a ${p.band} slot`);
  }

  // C. No anti-clone violation.
  const fps = run.placed.map(p => fingerprintItem(p.item));
  check(fps.filter(f => detectClone(f, fps, 'sibling').clone).length === 0, `seed ${seed}: anti-clone collisions`);

  // D. No invalid composition.
  const comp = run.placed.filter(p => p.item.composedOf);
  check(comp.length >= COMPOSITION_LIMITS.perForm[0] && comp.length <= COMPOSITION_LIMITS.perForm[1],
    `seed ${seed}: ${comp.length} composed items, outside ${COMPOSITION_LIMITS.perForm.join('..')}`);
  for (const p of comp) check(p.item.composedOf.length === COMPOSITION_LIMITS.maxDepth,
    `seed ${seed} Q${p.q}: composition depth ${p.item.composedOf.length}`);

  // F. Bands, stimulus sets and structures hold simultaneously.
  const band = {}; for (const p of run.placed) band[p.band] = (band[p.band] || 0) + 1;
  for (const b of BANDS) {
    const [lo, hi] = BAND_SHARES[b].range;
    check((band[b] || 0) >= lo && (band[b] || 0) <= hi, `seed ${seed}: band ${b} = ${band[b] || 0}, outside ${lo}..${hi}`);
  }
  const nSets = Object.keys(run.stimuli).length;
  check(nSets >= SET_RULES.count[0] && nSets <= SET_RULES.count[1], `seed ${seed}: ${nSets} stimulus sets`);
  for (const [id, st] of Object.entries(run.stimuli))
    check(st.slots.length >= SET_RULES.size[0] && st.slots.length <= SET_RULES.oversizeSetSize,
      `seed ${seed}: set ${id} has ${st.slots.length} items`);
  const structs = new Set(run.placed.map(p => p.item.archetype ? `${p.item.subForm}#${p.item.archetype}` : p.item.subForm));
  check(structs.size === run.placed.length, `seed ${seed}: ${structs.size} distinct structures for ${run.placed.length} items`);
}

/* ── the routine stream ── */

check(ROUTINE_FAMILIES.length >= 19, `the routine stream covers ${ROUTINE_FAMILIES.length} families, not all 19`);
for (const f of Object.keys(FAMILIES)) {
  const slots = SLOTS.filter(s => s.fam === f).length;
  check(ROUTINE_FAMILIES.includes(f), `family ${f} has no routine construct and the blueprint asks for ${slots} slots`);
}
// Routine items must be genuinely ENTRY-profile, or the stream is misnamed.
// Checked on the ASSEMBLED forms, where every routine item is a real one.
for (const { seed, run } of runs)
  for (const p of run.placed.filter(x => x.item.stream === 'routine'))
    check(admits('Entry', profileOf(p.item, trapLevel)),
      `seed ${seed} Q${p.q}: a routine item that is not Entry-admissible is not routine`);
check(Object.keys(READERS).length >= 3, 'fewer than three display kinds have readers — shared-stimulus sets cannot vary');

/* ── the bottleneck, asserted so it cannot drift ── */

const b = bottleneck();
check(b.totalHave >= b.totalSlots, `only ${b.totalHave} distinct structures for ${b.totalSlots} slots — short ${b.totalShort}`);

/* ── KAR is still not claimable ── */

check(KAR_CALIBRATION.claimAllowed === false, 'KAR: no form may claim the published bands yet');

/* ── report ── */

if (process.argv.includes('--print')) console.log(report(runs[0].run));

if (fails.length) {
  console.error(`FAIL  est-assembly: ${fails.length} check(s) failed`);
  for (const f of fails.slice(0, 20)) console.error(`  • ${f}`);
  process.exit(1);
}
console.log(`PASS  est-assembly: ${SEEDS.length} seeds each filled 50/50 from the real generator, ` +
  `${b.totalHave} structures for ${b.totalSlots} slots, no clone collisions, composition in range`);
