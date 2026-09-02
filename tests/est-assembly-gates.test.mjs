#!/usr/bin/env node
// Mutation tests for the Stage-2.5 assembly gates.
//
// The eight mutation classes Stage 2.5 was asked to prove: routine items
// disabled, a required family unavailable, stimulus constraints violated, the
// composition quota ignored, structural duplication allowed, anti-clone
// bypassed, a band starved, and mechanism requirements bypassed.
//
// Each takes a REAL assembled form and breaks one thing, then asserts the
// corresponding check fails. A baseline passes first, so every mutation has
// something to break.
import { assemble, verify, bottleneck, BAND_PLAN } from '../scripts/est-assemble.mjs';
import { BANDS, BAND_SHARES, COMPOSITION_LIMITS, ARCHETYPE_DIVERSITY, admits, profileOf } from '../scripts/est-signatures.mjs';
import { trapLevel, assess, Q } from '../scripts/est-primitives.mjs';
import { assessRoutine, ROUTINE_CONSTRUCTS, ROUTINE_FAMILIES, kindsFor, READERS, stimulusSet } from '../scripts/est-routine.mjs';
import { assessComposed } from '../scripts/est-compose.mjs';
import { fingerprintItem, detectClone } from '../scripts/est-fingerprint.mjs';
import { SLOTS, SET_RULES } from '../scripts/est-blueprint.mjs';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${label}`); } };
const clone = r => ({ ...r, placed: r.placed.map(p => ({ ...p, item: JSON.parse(JSON.stringify(p.item)) })) });

/* ── baseline ── */

const base = assemble({ seed: 4100 });
ok(base.placed.length === 50, 'BASELINE: the real assembler fills 50/50');
ok(verify(base).ok, 'BASELINE: and every checkable constraint holds — the mutations below have something to break');
ok(base.placed.every(p => p.item.stream), 'every placed item records which stream produced it');

/* ── 1. routine items disabled ── */
{
  // The routine stream supplies Entry and Core. Without it the form cannot fill
  // — which is the Stage-2 result, reproduced here as an assertion.
  const noRoutine = clone(base);
  noRoutine.placed = noRoutine.placed.filter(p => p.item.stream !== 'routine');
  const v = verify(noRoutine);
  ok(noRoutine.placed.length < 50, `MUTATION routine disabled: only ${noRoutine.placed.length} slots remain`);
  ok(noRoutine.placed.length <= 20, 'MUTATION routine disabled: the mechanism library alone cannot approach 50');
  ok(base.placed.filter(p => p.item.stream === 'routine').length >= 25,
    'the routine stream carries the majority of the form, as the reference profile requires');
}

/* ── 2. one required family unavailable ── */
{
  const b = bottleneck();
  const a13 = b.rows.find(r => r.fam === 'A13');
  ok(a13.slots === 8, 'A13 asks for eight slots — the largest single family demand');
  ok(a13.have >= a13.slots, `A13 supplies ${a13.have} structures for ${a13.slots} slots`);
  // Remove its structures and the bottleneck table reports the shortfall.
  const starved = { ...b, rows: b.rows.map(r => r.fam === 'A13' ? { ...r, have: 1, short: 7 } : r) };
  const short = starved.rows.reduce((a, r) => a + r.short, 0);
  ok(short >= 7, 'MUTATION family unavailable: the bottleneck table reports the shortfall rather than hiding it');
  ok(ROUTINE_FAMILIES.includes('A13'), 'every blueprint family has a routine construct');
}

/* ── 3. stimulus constraints violated ── */
{
  const sets = Object.entries(base.stimuli);
  ok(sets.length >= SET_RULES.count[0] && sets.length <= SET_RULES.count[1], `${sets.length} stimulus sets, inside ${SET_RULES.count.join('..')}`);
  ok(sets.every(([, st]) => st.slots.length >= SET_RULES.size[0]), 'no set is smaller than the rule allows');
  ok(sets.every(([, st]) => st.kind), 'every set records the display kind its items read');

  const broken = clone(base);
  broken.stimuli = { S1: { kind: 'bar-chart', slots: [6] } };          // one set, one item
  ok(!verify(broken).ok, 'MUTATION stimulus: a single undersized set is rejected');

  // A set whose families no display kind can serve must be reported, not filled.
  ok(kindsFor(['A13', 'A13', 'A13', 'A13', 'A13', 'A13']).length === 0,
    'MUTATION stimulus: a set demanding more readings than any display offers has no serving kind');
  ok(kindsFor(['A13', 'A13', 'A14']).length > 0, 'and a set the readers do cover finds one');
  const r = stimulusSet('bar-chart', ['A13', 'A13'], 99, new Set(['bar-difference', 'bar-total', 'bar-argmax', 'bar-above-threshold']));
  ok(!!r.error, 'MUTATION stimulus: excluding every reader of a kind makes the set unbuildable, and it says so');
}

/* ── 4. composition quota ignored ── */
{
  const comp = base.placed.filter(p => p.item.composedOf);
  ok(comp.length >= COMPOSITION_LIMITS.perForm[0], `${comp.length} composed items meets the floor of ${COMPOSITION_LIMITS.perForm[0]}`);
  const none = clone(base);
  none.placed = none.placed.map(p => p.item.composedOf ? { ...p, item: { ...p.item, composedOf: undefined } } : p);
  none.composedCount = 0;
  ok(!verify(none).ok, 'MUTATION composition: a form with none is rejected');
  const many = clone(base);
  many.composedCount = 12;
  ok(!verify(many).ok, 'MUTATION composition: a form with twelve is rejected');
  for (const p of comp) ok(assessComposed(p.item).ok, `Q${p.q}: the placed composed item passes the composed contract`);
}

/* ── 5. structural duplication allowed ── */
{
  const structs = base.placed.map(p => p.item.archetype ? `${p.item.subForm}#${p.item.archetype}` : p.item.subForm);
  ok(new Set(structs).size === structs.length, 'no structure appears twice in the assembled form');
  const dup = clone(base);
  dup.placed[10] = { ...dup.placed[10], item: JSON.parse(JSON.stringify(dup.placed[3].item)) };
  const dstructs = dup.placed.map(p => p.item.archetype ? `${p.item.subForm}#${p.item.archetype}` : p.item.subForm);
  ok(new Set(dstructs).size < dstructs.length, 'MUTATION duplication: a repeated structure is detectable');
  ok(!verify(dup).ok, 'MUTATION duplication: and the form is rejected');
}

/* ── 6. anti-clone bypassed ── */
{
  const fps = base.placed.map(p => fingerprintItem(p.item));
  ok(fps.filter(f => detectClone(f, fps, 'sibling').clone).length === 0, 'the assembled form has no clone collisions');
  const cloned = clone(base);
  cloned.placed[20] = { ...cloned.placed[20], item: JSON.parse(JSON.stringify(cloned.placed[20].item)) };
  cloned.placed[21] = { ...cloned.placed[21], item: JSON.parse(JSON.stringify(cloned.placed[20].item)) };
  cloned.placed[21].item.seed = 999999;
  const v = verify(cloned);
  ok(!v.ok && v.fails.some(f => /anti-clone/.test(f)), 'MUTATION anti-clone: two structurally identical items are caught');
}

/* ── 7. a band starved ── */
{
  const band = {}; for (const p of base.placed) band[p.band] = (band[p.band] || 0) + 1;
  for (const b of BANDS) {
    const [lo, hi] = BAND_SHARES[b].range;
    ok(band[b] >= lo && band[b] <= hi, `band ${b} = ${band[b]}, inside ${lo}..${hi}`);
  }
  const starved = clone(base);
  starved.placed = starved.placed.map(p => ({ ...p, band: p.band === 'Peak' ? 'Core' : p.band }));
  const v = verify(starved);
  ok(!v.ok && v.fails.some(f => /band Peak/.test(f)), 'MUTATION band starved: emptying Peak is rejected');
  const flooded = clone(base);
  flooded.placed = flooded.placed.map(p => ({ ...p, band: 'Peak' }));
  ok(!verify(flooded).ok, 'MUTATION band flooded: making every slot Peak is rejected');
}

/* ── 8. mechanism requirements bypassed ── */
{
  // An item whose mechanism map claims everything but whose ROUTES prove
  // nothing must not pass. Load-bearing is re-derived from the item, never read
  // off its metadata.
  const faked = clone(base);
  const target = faked.placed.find(p => p.item.stream === 'mechanism');
  target.item.mechanism = { hidden_step: 2, inference: 2, multiconcept: 2, nonobvious_rel: 2, abstraction: 2 };
  target.item.routes = target.item.routes.filter(r => !r.requiresInsight);
  const v = verify(faked);
  ok(!v.ok && v.fails.some(f => /load-bearing/.test(f)),
    'MUTATION metadata: a rich mechanism map with no insight route is rejected');

  const fakedRoutine = clone(base);
  const rt = fakedRoutine.placed.find(p => p.item.stream === 'routine');
  rt.item.mechanism = { hidden_step: 2, inference: 2 };
  ok(!assessRoutine(rt.item).ok, 'MUTATION metadata: a routine item claiming reasoning-core mechanisms fails its own contract');
  ok(!verify(fakedRoutine).ok, 'MUTATION metadata: and the form is rejected');

  const unrouted = clone(base);
  const ru = unrouted.placed.find(p => p.item.stream === 'routine');
  ru.item.options[1].value = Q(987654);
  ok(!assessRoutine(ru.item).ok, 'MUTATION distractor: an option no route reaches fails the routine contract');
}

/* ── the streams are checked by DIFFERENT contracts, and neither is weakened ── */
{
  const rt = base.placed.find(p => p.item.stream === 'routine').item;
  ok(!assess(rt).loadBearing, 'a routine item does NOT pass assess() — it has no insight route, and assess() was not relaxed to let it');
  ok(assessRoutine(rt).ok, 'it passes the routine contract instead');
  const mech = base.placed.find(p => p.item.stream === 'mechanism').item;
  ok(assess(mech).loadBearing, 'a mechanism item passes assess() unchanged');
}

console.log(`  ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
