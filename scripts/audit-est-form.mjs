#!/usr/bin/env node
// Audit an AUTHORED EST form against artifact 8's gates.
//
//   node scripts/audit-est-form.mjs <content-dir>
//
// ⚠️  THE CONTENT IS NOT IN THIS REPOSITORY, AND MUST NOT BE. This repository is
//     public. Item text, options and answer keys live with the author, outside
//     it. This script is the TOOLING; it reads <content-dir>/payload.json.
//
// Deliberately NOT named validate-*.mjs: tests/run-all.mjs auto-discovers those
// and runs them with no arguments, so a validator that needs a content
// directory would fail CI for the wrong reason. The blueprint's own gate is
// scripts/validate-est-blueprint.mjs and that one does belong in CI.
//
// This checks the FORM against the blueprint. That is a larger claim than the
// blueprint checking itself: a form can drift from its own plan.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DOMAIN_BANDS, FAMILIES, COMBINED_FAMILY_RANGES, DEMAND_BANDS, DEVICE_BUDGETS,
  SET_RULES, KEY_RULES, SLOTS, RENDERING_CAPABILITY,
} from './est-blueprint.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: audit-est-form.mjs <content-dir>'); process.exit(2); }
const form = JSON.parse(readFileSync(resolve(dir, 'payload.json'), 'utf8'));
const items = form.items;

const fails = [], warns = [], notes = [];
const F = m => fails.push(m), W = m => warns.push(m), N = m => notes.push(m);
const check = (ok, m) => { if (!ok) F(m); };
const soft = (ok, m) => { if (!ok) W(m); };
const counts = a => a.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {});

// ── F: form structure ─────────────────────────────────────────────────────────
check(items.length === 50, `F1: ${items.length} items, expected 50`);
check(items.every((it, i) => it.o === i + 1), 'F1: ordinals must run 1..50');
check(items.every(it => it.format === 'mcq'),
  `F2: ${items.filter(it => it.format !== 'mcq').length} items are not four-option multiple choice`);
check(items.every(it => Array.isArray(it.choices) && it.choices.length === 4),
  'F5: every item must have exactly four options');
check(items.every(it => it.choices.map(c => c.id).join('') === 'ABCD'),
  'F5: options must be lettered A, B, C, D in order');
check(items.every(it => it.choices.some(c => c.id === it.ans)),
  'F5: every key must name one of the item\'s own options');

const dom = counts(items.map(it => it.dom));
for (const [d, band] of Object.entries(DOMAIN_BANDS)) {
  const share = (dom[d] || 0) / items.length;
  check(share >= band.min && share <= band.max,
    `F3: ${d} is ${dom[d] || 0}/50 = ${(share * 100).toFixed(0)}%, outside the published ` +
    `${(band.min * 100).toFixed(0)}-${(band.max * 100).toFixed(0)}%`);
}
const fam = counts(items.map(it => it.fam));
for (const [k, spec] of Object.entries(FAMILIES)) {
  const n = fam[k] || 0;
  check(n >= spec.range[0] && n <= spec.range[1],
    `F4: family ${k} has ${n} items, outside the observed range ${spec.range.join('..')}`);
}
for (const c of COMBINED_FAMILY_RANGES) {
  const n = c.parts.reduce((a, p) => a + (fam[p] || 0), 0);
  check(n >= c.range[0] && n <= c.range[1],
    `F4: ${c.label} totals ${n}, outside ${c.range.join('..')}`);
}

// ── B: balance ────────────────────────────────────────────────────────────────
const dband = counts(items.map(it => it.demand));
for (const [b, spec] of Object.entries(DEMAND_BANDS))
  check((dband[b] || 0) >= spec.share[0] && (dband[b] || 0) <= spec.share[1],
    `B1: demand band ${b} has ${dband[b] || 0} items, outside ${spec.share.join('..')}`);

const key = counts(items.map(it => it.ans));
for (const L of 'ABCD')
  check((key[L] || 0) >= KEY_RULES.perLetter[0] && (key[L] || 0) <= KEY_RULES.perLetter[1],
    `B2: key letter ${L} used ${key[L] || 0} times, outside ${KEY_RULES.perLetter.join('..')}`);
let run = 1, worst = 1;
for (let i = 1; i < items.length; i++) {
  run = items[i].ans === items[i - 1].ans ? run + 1 : 1;
  worst = Math.max(worst, run);
}
check(worst <= KEY_RULES.maxRun, `B2: longest key run is ${worst}, cap ${KEY_RULES.maxRun}`);

for (let lo = 0; lo < 50; lo += 10) {
  const blk = items.slice(lo, lo + 10), tag = `Q${lo + 1}-${lo + 10}`;
  check(blk.filter(i => i.demand === 'entry').length >= 2, `B3: ${tag} needs >=2 entry items`);
  check(blk.filter(i => i.demand === 'stretch' || i.demand === 'peak').length >= 1,
    `B3: ${tag} needs >=1 stretch or peak item`);
  check(blk.filter(i => i.demand === 'peak').length <= 1, `B3: ${tag} may hold at most one peak item`);
}
const peaks = items.filter(i => i.demand === 'peak').map(i => i.o);
for (let i = 1; i < peaks.length; i++)
  check(peaks[i] - peaks[i - 1] > 1, `B3: peaks at Q${peaks[i - 1]} and Q${peaks[i]} are adjacent`);
check(items[49].demand !== 'peak', 'B3: the last item must not be the peak');
const ramp = items.slice(0, 8);
check(ramp.filter(i => i.demand === 'entry').length >= 3, 'B4: Q1-8 needs >=3 entry items');
check(ramp.every(i => i.demand !== 'peak'), 'B4: Q1-8 must contain no peak item');
soft(ramp.filter(i => i.demand === 'stretch').length <= 1, 'B4: Q1-8 should hold at most one stretch item');

// B5 has two granularities and they are not interchangeable.
//
//   PER ITEM  — each item's DOMINANT distractor class. This is the granularity
//               the corpus was measured at (artifact 4 §1: 200 items, one label
//               each, largest class 20.1%), so the 30% cap is evidence-backed.
//   PER DISTRACTOR — every wrong option labelled. Finer, and the granularity an
//               author actually works at, but the corpus was never labelled this
//               way. The 40% cap below is a JUDGEMENT about monoculture, not a
//               measurement, and it is marked as such.
const dcl = counts(items.flatMap(i => i.dcl || []));
const dTotal = Object.values(dcl).reduce((a, b) => a + b, 0);
check(Object.keys(dcl).length === 9,
  `B5: ${Object.keys(dcl).length} of 9 distractor classes used (${Object.keys(dcl).sort().join(',')})`);
// An item has a dominant class only when one class appears at least twice. An
// item whose three distractors are three DIFFERENT classes has no monoculture
// at all, and counting it toward whichever class sorts first alphabetically
// would be an artefact of the tie-break, not a finding.
const dominant = items.map(i => {
  const c = counts(i.dcl || []);
  const top = Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return top[1] >= 2 ? top[0] : 'mixed';
});
const domCls = counts(dominant);
for (const [k, n] of Object.entries(domCls))
  check(n / items.length <= 0.30,
    `B5 (per item, measured): dominant class ${k} on ${n}/50 items = ${(100 * n / items.length).toFixed(0)}%, cap 30%`);
for (const [k, n] of Object.entries(dcl))
  soft(n / dTotal <= 0.40,
    `B5 (per distractor, judgement not measurement): class ${k} is ${(100 * n / dTotal).toFixed(0)}% of all distractors, cap 40%`);

// ── C: coherence ──────────────────────────────────────────────────────────────
const arch = counts(items.map(i => i.arch));
check(Object.keys(arch).length === 50,
  `C1: ${Object.keys(arch).length} distinct archetypes in 50 items — repeats: ` +
  Object.entries(arch).filter(([, n]) => n > 1).map(([a]) => a).join(', '));
const ctxItems = items.filter(i => !(i.stim || '').length);
const ctx = counts(ctxItems.map(i => i.ctx));
check(Object.entries(ctx).every(([, n]) => n === 1),
  'C2: contexts repeat outside a shared set: ' +
  Object.entries(ctx).filter(([, n]) => n > 1).map(([c]) => c).join(', '));

const sets = {};
for (const it of items) if (it.stim && it.stim !== 'S5' && it.stim !== 'S6' && it.stim !== 'S7' && it.stim !== 'S8')
  (sets[it.stim] ||= []).push(it.o);
const sharedSets = Object.entries(sets).filter(([, qs]) => qs.length >= 2);
check(sharedSets.length >= SET_RULES.count[0] && sharedSets.length <= SET_RULES.count[1],
  `C3: ${sharedSets.length} shared-stimulus sets, expected ${SET_RULES.count.join('..')}`);
let over = 0;
for (const [id, qs] of sharedSets) {
  check(qs.every((q, i) => i === 0 || q === qs[i - 1] + 1), `C3: set ${id} is not contiguous`);
  if (qs.length > SET_RULES.size[1]) { over++; check(qs.length === SET_RULES.oversizeSetSize, `C3: set ${id} too large`); }
}
check(over <= SET_RULES.oversizeSetsAllowed, `C3: ${over} oversize sets`);
const sharedItems = sharedSets.reduce((n, [, qs]) => n + qs.length, 0);
check(sharedItems >= DEVICE_BUDGETS.shared[0] && sharedItems <= DEVICE_BUDGETS.shared[1],
  `C3: ${sharedItems} items in shared sets, expected ${DEVICE_BUDGETS.shared.join('..')}`);
const starts = sharedSets.map(([, qs]) => qs[0]).sort((a, b) => a - b);
check(starts[0] <= SET_RULES.firstSetStartsBy, `C3: first set starts at Q${starts[0]}`);
check(starts[starts.length - 1] > SET_RULES.lastSetStartsAfter, `C3: last set starts at Q${starts[starts.length - 1]}`);

const withStim = items.filter(i => i.stim || i.figureHeld);
check(withStim.length >= 14 && withStim.length <= 18,
  `C4: ${withStim.length} items carry a stimulus, expected 14-18`);
const shapes = counts(items.filter(i => i.stim).map(i => form.stimuli[i.stim].kind)
  .concat(items.filter(i => i.figureHeld).map(() => 'figure')));
for (const [k, n] of Object.entries(shapes))
  check(n <= 5, `C4: stimulus type ${k} is used on ${n} items, cap 5`);

// ── device budgets, as authored ───────────────────────────────────────────────
const dev = counts(items.flatMap(i => i.dev || []));
for (const [d, [lo, hi]] of Object.entries(DEVICE_BUDGETS)) {
  if (d === 'shared') continue;
  const n = dev[d] || 0;
  check(n >= lo && n <= hi, `device "${d}": ${n} items, budget ${lo}..${hi}`);
}

// ── derived-target partner (artifact 4 D1, artifact 7 G2.3) ──────────────────
for (const it of items.filter(i => (i.dev || []).includes('derived')))
  check((it.dcl || []).includes('D1'),
    `G2.3: Q${it.o} has a derived target but no D1 (un-derived value) distractor`);

// ── rendering capability: authored, held, and NOT worked around ──────────────
const held = items.filter(i => i.figureHeld);
for (const [name, g] of Object.entries(RENDERING_CAPABILITY)) {
  const n = items.filter(i => (i.dev || []).includes(g.device)).length;
  const [lo] = DEVICE_BUDGETS[g.device];
  check(n >= lo, `${name}: ${n} items carry "${g.device}", budget floor ${lo} — the budget is retained`);
}
for (const it of held) {
  check((it.dev || []).includes('nts'), `Q${it.o}: a held figure must be on an nts item`);
  check(!it.stim, `Q${it.o}: a held-figure item must carry no substitute stimulus`);
  check(!/not drawn to scale/i.test(it.prompt),
    `Q${it.o}: must not say "not drawn to scale" when no figure is shown`);
  N(`Q${it.o} is allocated to the not-to-scale budget; its figure (${it.figureHeld}) is authored and HELD pending R1.`);
}

// ── report ────────────────────────────────────────────────────────────────────
const pct = (n) => `${n} (${(100 * n / 50).toFixed(0)}%)`;
console.log(`\nESTM1 form audit — ${form.code}`);
console.log(`  items      ${items.length}, all mcq: ${items.every(i => i.format === 'mcq')}`);
console.log(`  domains    ` + Object.entries(dom).map(([k, v]) => `${k}=${pct(v)}`).join('  '));
console.log(`  demand     ` + Object.entries(dband).map(([k, v]) => `${k}=${v}`).join('  '));
console.log(`  key        ` + 'ABCD'.split('').map(L => `${L}=${key[L] || 0}`).join('  ') + `   longest run ${worst}`);
console.log(`  archetypes ${Object.keys(arch).length} distinct`);
console.log(`  distractor ` + Object.entries(dcl).sort().map(([k, v]) => `${k}=${v}`).join(' ') + '   (per distractor)');
console.log(`  dominant   ` + Object.entries(domCls).sort().map(([k, v]) => `${k}=${v}`).join(' ') + '   (per item, the measured basis)');
console.log(`  devices    ` + Object.entries(dev).sort().map(([k, v]) => `${k}=${v}`).join(' ') + `  shared=${sharedItems}`);
console.log(`  stimuli    ${withStim.length} items; types ` + Object.entries(shapes).map(([k, v]) => `${k}=${v}`).join(' '));
if (notes.length) { console.log('\nNOTES'); for (const n of notes) console.log(`  • ${n}`); }
if (warns.length) { console.log('\nWARNINGS'); for (const w of warns) console.log(`  ! ${w}`); }
if (fails.length) {
  console.log(`\nFAIL  ${fails.length} gate(s) violated`);
  for (const f of fails) console.log(`  × ${f}`);
  process.exit(1);
}
console.log('\nPASS  every form gate met');
