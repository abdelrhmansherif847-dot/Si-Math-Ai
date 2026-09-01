#!/usr/bin/env node
// Gate: the EST generation blueprint must satisfy every constraint the corpus
// analysis established. Auto-discovered by tests/run-all.mjs (validate-*.mjs).
//
// This exists because the blueprint is a table of 50 hand-placed slots and a
// dozen interacting budgets. Asserting in prose that it "hits the published
// bands" is worth nothing; a check that could go red is worth something. Every
// assertion here fails on a real, reachable mistake — comment out any single
// slot and this exits non-zero.
//
//   node scripts/validate-est-blueprint.mjs            check
//   node scripts/validate-est-blueprint.mjs --print    check, then print the slot table
import {
  DOMAIN_BANDS, FAMILIES, COMBINED_FAMILY_RANGES, DEMAND_BANDS, DEVICE_BUDGETS,
  SET_RULES, KEY_RULES, SLOTS, ANTI_REPETITION,
} from './est-blueprint.mjs';

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const N = SLOTS.length;

// ── slot integrity ────────────────────────────────────────────────────────────
check(N === 50, `form must be 50 items, blueprint has ${N}`);
check(SLOTS.every((s, i) => s.q === i + 1), 'slot numbers must run 1..50 in order');
for (const s of SLOTS) check(FAMILIES[s.fam], `Q${s.q}: unknown family ${s.fam}`);
for (const s of SLOTS) check(DEMAND_BANDS[s.d], `Q${s.q}: unknown demand band ${s.d}`);

// ── family quotas ─────────────────────────────────────────────────────────────
const famCount = {};
for (const s of SLOTS) famCount[s.fam] = (famCount[s.fam] || 0) + 1;
for (const [fam, spec] of Object.entries(FAMILIES)) {
  const n = famCount[fam] || 0;
  check(n === spec.slots, `${fam} ${spec.label}: blueprint places ${n}, declares ${spec.slots}`);
  check(n >= spec.range[0] && n <= spec.range[1],
    `${fam}: ${n} items is outside the observed per-form range ${spec.range.join('..')}`);
}

for (const c of COMBINED_FAMILY_RANGES) {
  const n = c.parts.reduce((a, p) => a + (famCount[p] || 0), 0);
  check(n >= c.range[0] && n <= c.range[1],
    `${c.label} (${c.parts.join('+')}): ${n} items outside the observed per-form range ${c.range.join('..')}`);
}

// ── published domain bands ────────────────────────────────────────────────────
const domCount = {};
for (const s of SLOTS) {
  const d = FAMILIES[s.fam].domain;
  domCount[d] = (domCount[d] || 0) + 1;
}
for (const [dom, band] of Object.entries(DOMAIN_BANDS)) {
  const share = (domCount[dom] || 0) / N;
  check(share >= band.min && share <= band.max,
    `${dom} (${band.name}): ${domCount[dom] || 0}/50 = ${(share * 100).toFixed(0)}% is outside the ` +
    `published band ${(band.min * 100).toFixed(0)}-${(band.max * 100).toFixed(0)}%`);
}
check(Object.values(domCount).reduce((a, b) => a + b, 0) === N, 'every slot must carry a domain');

// ── demand distribution ───────────────────────────────────────────────────────
const dCount = {};
for (const s of SLOTS) dCount[s.d] = (dCount[s.d] || 0) + 1;
for (const [band, spec] of Object.entries(DEMAND_BANDS)) {
  const n = dCount[band] || 0;
  check(n >= spec.share[0] && n <= spec.share[1],
    `demand band "${band}": ${n} items outside ${spec.share.join('..')}`);
}

// ── placement rules (artifact 3 §4) ───────────────────────────────────────────
const onRamp = SLOTS.filter(s => s.q <= 8);
check(onRamp.filter(s => s.d === 'peak').length === 0, 'Q1-8 must contain no peak-band item');
check(onRamp.filter(s => s.d === 'stretch').length <= 1, 'Q1-8 may contain at most one stretch item');
check(onRamp.filter(s => s.d === 'entry').length >= 3, 'Q1-8 must be entry-heavy (>=3 entry items)');

const peaks = SLOTS.filter(s => s.d === 'peak').map(s => s.q);
for (let i = 1; i < peaks.length; i++) {
  check(peaks[i] - peaks[i - 1] > 1, `peak items at Q${peaks[i - 1]} and Q${peaks[i]} are adjacent`);
}
check(SLOTS[N - 1].d !== 'peak', 'the last item must not be the hardest — no form in the corpus ends on its peak');

// every 10-item block: >=2 entry, >=1 stretch-or-peak, <=1 peak
for (let lo = 0; lo < N; lo += 10) {
  const blk = SLOTS.slice(lo, lo + 10);
  const tag = `Q${lo + 1}-${lo + 10}`;
  check(blk.filter(s => s.d === 'entry').length >= 2, `${tag}: needs >=2 entry items`);
  check(blk.filter(s => s.d === 'stretch' || s.d === 'peak').length >= 1, `${tag}: needs >=1 stretch or peak item`);
  check(blk.filter(s => s.d === 'peak').length <= 1, `${tag}: at most one peak item`);
}

// geometry is never clustered (artifact 1 §3)
const geo = SLOTS.filter(s => FAMILIES[s.fam].domain === 'GT').map(s => s.q);
for (let i = 1; i < geo.length; i++) {
  check(geo[i] - geo[i - 1] > 1, `geometry items at Q${geo[i - 1]} and Q${geo[i]} are adjacent`);
}

// no family twice in a row — the corpus never repeats an archetype, and adjacent
// same-family items read as a set that is not one
for (let i = 1; i < N; i++) {
  check(SLOTS[i].fam !== SLOTS[i - 1].fam || (SLOTS[i].set && SLOTS[i].set === SLOTS[i - 1].set),
    `Q${SLOTS[i - 1].q}/Q${SLOTS[i].q}: same family ${SLOTS[i].fam} adjacent outside a shared set`);
}

// ── shared-stimulus sets (artifact 1 §6) ──────────────────────────────────────
const sets = {};
for (const s of SLOTS) if (s.set) (sets[s.set] ||= []).push(s.q);
const setIds = Object.keys(sets);
check(setIds.length >= SET_RULES.count[0] && setIds.length <= SET_RULES.count[1],
  `${setIds.length} shared-stimulus sets, expected ${SET_RULES.count.join('..')}`);
let oversize = 0;
for (const [id, qs] of Object.entries(sets)) {
  check(qs.every((q, i) => i === 0 || q === qs[i - 1] + 1), `set ${id} is not contiguous: ${qs.join(',')}`);
  const n = qs.length;
  if (n > SET_RULES.size[1]) {
    oversize++;
    check(n === SET_RULES.oversizeSetSize, `set ${id} has ${n} items; the corpus's largest is ${SET_RULES.oversizeSetSize}`);
  } else {
    check(n >= SET_RULES.size[0], `set ${id} has ${n} items, minimum ${SET_RULES.size[0]}`);
  }
}
check(oversize <= SET_RULES.oversizeSetsAllowed,
  `${oversize} sets larger than ${SET_RULES.size[1]}; at most ${SET_RULES.oversizeSetsAllowed} allowed`);
const starts = setIds.map(id => sets[id][0]).sort((a, b) => a - b);
check(starts[0] <= SET_RULES.firstSetStartsBy, `first set starts at Q${starts[0]}, must start by Q${SET_RULES.firstSetStartsBy}`);
check(starts[starts.length - 1] > SET_RULES.lastSetStartsAfter,
  `last set starts at Q${starts[starts.length - 1]}, must start after Q${SET_RULES.lastSetStartsAfter}`);
const sharedItems = SLOTS.filter(s => s.set).length;
check(sharedItems >= DEVICE_BUDGETS.shared[0] && sharedItems <= DEVICE_BUDGETS.shared[1],
  `${sharedItems} items in shared sets, expected ${DEVICE_BUDGETS.shared.join('..')}`);

// ── device budgets ────────────────────────────────────────────────────────────
const devCount = {};
for (const s of SLOTS) for (const f of s.f) devCount[f] = (devCount[f] || 0) + 1;
for (const [dev, [lo, hi]] of Object.entries(DEVICE_BUDGETS)) {
  if (dev === 'shared') continue; // counted from set membership above
  const n = devCount[dev] || 0;
  check(n >= lo && n <= hi, `device "${dev}": ${n} items outside budget ${lo}..${hi}`);
}
for (const dev of Object.keys(devCount)) {
  check(DEVICE_BUDGETS[dev], `device "${dev}" is used by a slot but has no declared budget`);
}

// the Roman-numeral item is exactly one, and it is not in the on-ramp
const roman = SLOTS.filter(s => s.f.includes('roman'));
check(roman.length === 1, `expected exactly one Roman-numeral item, found ${roman.length}`);
if (roman.length === 1) check(roman[0].q > 8, 'the Roman-numeral item should not sit in the Q1-8 on-ramp');

// every peak item must stack at least two devices — hard items are layered,
// not deep (artifact 3 §2, L7). Q49 is the deliberate exception: a peak built
// from step count alone, which the corpus also does.
const stackedPeaks = SLOTS.filter(s => s.d === 'peak' && s.f.length >= 2).length;
check(stackedPeaks >= peaks.length - 1,
  `${peaks.length - stackedPeaks} peak items stack fewer than two devices; at most one may`);

// ── key rules are self-consistent ─────────────────────────────────────────────
check(KEY_RULES.perLetter[0] * 4 <= N && KEY_RULES.perLetter[1] * 4 >= N,
  `key budget ${KEY_RULES.perLetter.join('..')} per letter cannot sum to ${N}`);
check(ANTI_REPETITION.archetypeRepeatsWithinForm === 0,
  'anti-repetition must forbid archetype repeats within a form');

// ── report ────────────────────────────────────────────────────────────────────
if (process.argv.includes('--print')) {
  const w = { 1: 4, 2: 6, 3: 34, 4: 9, 5: 5 };
  console.log('\nQ    FAM    FAMILY                              DEMAND   SET  DEVICES');
  for (const s of SLOTS) {
    console.log(
      `${String(s.q).padEnd(w[1])} ${s.fam.padEnd(w[2])} ${FAMILIES[s.fam].label.padEnd(w[3])} ` +
      `${s.d.padEnd(w[4])} ${(s.set || '-').padEnd(w[5])} ${s.f.join(' ')}`);
  }
  console.log('\ndomains:', Object.entries(domCount).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('demand :', Object.entries(dCount).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('devices:', Object.entries(devCount).map(([k, v]) => `${k}=${v}`).join(' '), `shared=${sharedItems}`);
}

if (fails.length) {
  console.error(`FAIL  est-blueprint: ${fails.length} constraint(s) violated`);
  for (const f of fails) console.error(`  • ${f}`);
  process.exit(1);
}
console.log(`PASS  est-blueprint: 50 slots, ${setIds.length} shared sets, all domain/demand/device budgets met`);
