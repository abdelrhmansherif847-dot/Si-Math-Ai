#!/usr/bin/env node
// Gate: the Stage-1 generation primitives must produce items whose mechanism is
// LOAD-BEARING, not merely declared. Auto-discovered by tests/run-all.mjs.
//
// The whole point of artifact 13 is that metadata saying `hidden_step: 2` is
// worth nothing. Four reference items and three prototype items advertised a
// mechanism a student could route around. So this gate does not read any
// primitive's claims about itself — it generates a validation set, enumerates
// the routes, and checks that the un-taken route lands somewhere wrong.
//
// A green run here means: for every primitive, twenty items exist in which
// removing the mechanism changes the answer (or makes the item unanswerable),
// no mechanism-blind route reaches the key at or below the insight's cost, and
// some mechanism-blind route lands on a printed distractor.
//
//   node scripts/validate-est-primitives.mjs           check
//   node scripts/validate-est-primitives.mjs --print   check, then the tally
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRIMITIVES, SPECIES_COVERAGE, generate, assess, pCombination,
  assertInteraction, assertExpensiveFirstMove, qEq,
} from './est-primitives.mjs';
import { fingerprintAll, compare, detectClone, AXES } from './est-fingerprint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const N = 20;                       // the Stage-1 validation set size per primitive
const TRY_BUDGET = 60;              // tries per accepted item before we call it unreliable

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const tally = [];

/* ── 1. every primitive produces its validation set, and every item is load-bearing ── */

const sets = {};
for (const name of Object.keys(PRIMITIVES)) {
  const r = generate(name, N, { seed: 1000 });
  sets[name] = r;
  check(r.items.length === N, `${name}: produced ${r.items.length} of ${N} accepted items`);
  check(r.tries <= N * TRY_BUDGET, `${name}: needed ${r.tries} tries for ${r.items.length} items — generation is unreliable`);

  for (const it of r.items) {
    const a = assess(it);
    check(a.loadBearing, `${name}#${it.seed}: not load-bearing — ${a.reasons.join('; ')}`);
    check(!a.bypass, `${name}#${it.seed}: bypass route reaches the key at or below the insight cost`);
    check(a.trapRoutes.length > 0, `${name}#${it.seed}: no mechanism-blind route lands on a printed distractor`);
    check(it.options.length === 4, `${name}#${it.seed}: ${it.options.length} options`);
    check(it.options.some(o => o.id === it.key), `${name}#${it.seed}: key is not one of the options`);
    check(Array.isArray(it.distractorClasses) && it.distractorClasses.length === 3,
      `${name}#${it.seed}: needs exactly three declared distractor classes`);
    check(it.counterfactual && (it.counterfactual.kind === 'value' || it.counterfactual.kind === 'determinacy'),
      `${name}#${it.seed}: counterfactual must declare kind 'value' or 'determinacy'`);
  }
  tally.push({ name, accepted: r.items.length, tries: r.tries, rejected: r.rejected.length });
}

/* ── 2. the negative control must be REJECTED ──
   P-COMBINATION's `single-relation` form is the corpus shape whose insight is
   optional: one relation, two symbols, so assigning either symbol a convenient
   value solves it at the same cost. If the gate ever accepts it, the anti-bypass
   rule has stopped working. */

let controlAccepted = 0;
for (let s = 5000; s < 5060; s++) {
  const cand = pCombination(s, { form: 'single-relation' });
  if (!cand || cand.error) continue;
  if (assess(cand).loadBearing) controlAccepted++;
}
check(controlAccepted === 0,
  `negative control: ${controlAccepted} single-relation items were accepted — the anti-bypass rule is not biting`);

/* ── 3. mandatory distractor architecture, per primitive ── */

for (const it of sets['P-CONVERSION'].items) {
  const unconverted = it.routes.find(r => r.name.startsWith('compute-in-given-units') || r.name === 'divide-in-given-units');
  check(!!unconverted, `P-CONVERSION#${it.seed}: no un-converted route enumerated`);
  check(it.options.some(o => qEq(o.value, unconverted.value)),
    `P-CONVERSION#${it.seed}: the un-converted answer is not a printed option — the conversion cannot be diagnosed`);
  check(!qEq(unconverted.value, it.options.find(o => o.id === it.key).value),
    `P-CONVERSION#${it.seed}: the un-converted answer IS the key — the conversion is not binding`);
}

for (const it of sets['P-SCOPE'].items) {
  check(it.scheduled === false, `P-SCOPE#${it.seed}: must be emitted unscheduled while competing_interp is unstable`);
  check(Array.isArray(it.readings) && it.readings.length === 2,
    `P-SCOPE#${it.seed}: exactly two readings must be enumerated — a third makes the item defective`);
  const alt = it.readings.find(r => !r.intended);
  check(it.options.some(o => qEq(o.value, alt.value)),
    `P-SCOPE#${it.seed}: the alternative reading's answer is not offered — this is the T2-Q9 failure`);
}

for (const it of sets['P-CLASSIFY'].items) {
  const reflex = it.routes.find(r => r.name === 'require-both-sides-identical');
  check(!!reflex && it.options.some(o => qEq(o.value, reflex.value)),
    `P-CLASSIFY#${it.seed}: the reflex technique's output must be a printed option`);
}

for (const it of sets['P-DECOY'].items) {
  check(it.collapse && it.collapse.sum === 0, `P-DECOY#${it.seed}: the collapse is not exact`);
  const blind = it.routes.filter(r => !r.requiresInsight);
  check(blind.every(r => it.options.some(o => qEq(o.value, r.value))),
    `P-DECOY#${it.seed}: every "processed the decoy" route must land on a printed option`);
}

for (const it of sets['P-UNSTATED-MODEL'].items) {
  check(it.relationStatedInStem === false && it.relationOnReferenceSheet === false,
    `P-UNSTATED-MODEL#${it.seed}: the bridging relation must be absent from both stem and reference sheet`);
  check(it.counterfactual.kind === 'determinacy' && it.counterfactual.optionsSurviving > 1,
    `P-UNSTATED-MODEL#${it.seed}: withholding the relation must leave the item indeterminate`);
}

for (const it of sets['P-NAMED-CONFIG'].items) {
  check(it.figureMode === 'none', `P-NAMED-CONFIG#${it.seed}: not_to_scale figures wait on the R1 contract`);
  const wrongCfg = it.routes.filter(r => !r.requiresInsight);
  const keyVal = it.options.find(o => o.id === it.key).value;
  check(wrongCfg.every(r => !qEq(r.value, keyVal)),
    `P-NAMED-CONFIG#${it.seed}: the answer is invariant across a wrong configuration — naming does not determine it`);
}

for (const it of sets['P-NORMALISE'].items) {
  const naive = it.routes.find(r => r.natural);
  check(!!naive && it.options.some(o => qEq(o.value, naive.value)),
    `P-NORMALISE#${it.seed}: the un-normalised route must terminate on a printed option, not dead-end`);
}

/* ── 4. the two strengthenings ── */

const interacting = {
  conceptChain: [
    { concept: 'midpoint', inputs: ['A', 'B'], output: 'M' },
    { concept: 'slope-from-standard-form', inputs: ['line-d'], output: 'm1' },
    { concept: 'perpendicular', inputs: ['m1'], output: 'm2' },
    { concept: 'point-slope', inputs: ['M', 'm2'], output: 'equation' },
  ],
};
const stacked = {
  conceptChain: [
    { concept: 'inequality', inputs: ['given'], output: 'range' },
    { concept: 'target-shift', inputs: ['unrelated'], output: 'shifted' },
  ],
};
check(assertInteraction(interacting).ok, 'S-MULTICONCEPT: an interacting chain must pass');
check(!assertInteraction(stacked).ok, 'S-MULTICONCEPT: a stacked-but-independent chain must FAIL');
check(!assertInteraction({ conceptChain: [{ concept: 'x', inputs: [], output: 'y' }] }).ok,
  'S-MULTICONCEPT: a single concept is not a chain');
check(!assertInteraction({ ...interacting, optionShortCircuit: true }).ok,
  'S-MULTICONCEPT: an option set that short-circuits the chain must FAIL');

for (const name of Object.keys(PRIMITIVES)) {
  for (const it of sets[name].items) {
    const r = assertExpensiveFirstMove(it);
    check(r.ok, `S-TRAPCOST ${name}#${it.seed}: ${r.reason}`);
  }
}

/* ── 5. anti-clone ── */

const bySubForm = {};
for (const name of Object.keys(PRIMITIVES))
  for (const it of sets[name].items) (bySubForm[`${name}/${it.form || '-'}`] ||= []).push(it);

const subForms = Object.keys(bySubForm);
check(subForms.length >= 12, `anti-clone: only ${subForms.length} distinct skeletons across eight primitives`);

// A primitive IS a skeleton generator: two items from one sub-form share a
// skeleton and MUST be flagged. If they are not, the detector is blind.
for (const k of subForms) {
  const fps = fingerprintAll(bySubForm[k]);
  if (fps.length < 2) continue;
  const c = compare(fps[0], fps[1]);
  check(c.matched >= 5 || (c.per.chain?.hit && c.per.target?.hit),
    `anti-clone: two items from ${k} are not detected as sharing a skeleton`);
}

// Across skeletons the detector must be quiet, or it cannot be used at all.
let crossFlagged = 0, crossPairs = 0;
for (let i = 0; i < subForms.length; i++) {
  for (let j = i + 1; j < subForms.length; j++) {
    const a = fingerprintAll(bySubForm[subForms[i]])[0];
    const b = fingerprintAll(bySubForm[subForms[j]])[0];
    const c = compare(a, b);
    crossPairs++;
    if (c.matched >= 5 || (c.per.chain?.hit && c.per.target?.hit)) crossFlagged++;
  }
}
check(crossFlagged / crossPairs <= 0.10,
  `anti-clone: ${crossFlagged}/${crossPairs} cross-skeleton pairs flagged — the detector is too loose to use`);

/* ── 6. the reference fingerprint table ── */

const refPath = resolve(HERE, 'est-reference-fingerprints.json');
const ref = JSON.parse(readFileSync(refPath, 'utf8'));
check(ref.items.length === 200, `reference table: ${ref.items.length} rows, expected 200`);
check(Array.isArray(ref._axes_null) && ref._axes_null.length === 3,
  'reference table: must declare which axes it cannot populate');
for (const row of ref.items) {
  for (const ax of ref._axes_null) check(row[ax] === null, `reference table ${row.id}: ${ax} should be null`);
  check(typeof row.chain === 'string' && row.chain.length > 0, `reference table ${row.id}: no chain`);
}
// No exam content may enter this repository. A fingerprint carries structure,
// never a value: any multi-digit number in a row is a leak.
const rowBlob = JSON.stringify(ref.items);
check(!/\d{3,}/.test(rowBlob), 'reference table: a row contains a multi-digit number — possible content leak');

// Against the reference the comparison runs at reduced strength, and a
// reduced-strength hit is a review candidate, never a rejection.
const oneFp = fingerprintAll(sets['P-COMBINATION'].items)[0];
const refCheck = detectClone(oneFp, ref.items, 'reference');
check(refCheck.strength === 'reduced',
  'reference table: comparison should report reduced strength while three axes are unpopulated');
check(refCheck.clone === false,
  'reference table: a reduced-strength comparison must never harden into a rejection');

/* ── 7. species coverage is declared for every primitive ── */

for (const name of Object.keys(PRIMITIVES))
  check(!!SPECIES_COVERAGE[name], `${name}: no declared species coverage`);

/* ── 8. printed form ──
   Found by BLIND CODING the Stage-1 set, not by any structural check: four of
   the eight primitives printed unit coefficients (`1x`, `- 1v`, `1\sqrt{25t}`)
   and a fifth printed `(a + -3)`. Every one was mathematically correct and
   structurally sound, which is exactly why assess() could not see them — and
   why a generated paper would still have announced itself on sight. */

const PRINT_DEFECT = /(?<![\d.])1(?=[a-zA-Z\\])|\+ -|- -/;
for (const name of Object.keys(sets))
  for (const it of sets[name].items)
    check(!PRINT_DEFECT.test(it.stem), `${name}: stem prints a unit coefficient or a doubled sign — ${it.stem.slice(0, 70)}`);

/* ── 9. answer variety ──
   A mechanism that is load-bearing on one item stops biting across a series if
   the key never moves: a student who answers one answers the rest by pattern.
   Blind coding found P-UNSTATED-MODEL keyed "increased" in all 20 items (its
   direction guard was one-sided — now fixed) and P-DECOY keyed 0 in all 20.
   Thresholds are set from what the other seven primitives actually achieve, and
   are shaped by target type: a prose SELECTION target has only four possible
   keys, so a numeric floor would be meaningless against it. */

const SELECTION = new Set(['P-UNSTATED-MODEL']);
// P-DECOY is a KNOWN, UNRESOLVED defect, not an exemption of convenience: its
// only realisation of the supplied-decoy species collapses the numerator to
// zero, so its key is 0 by construction. Choosing a different realisation is a
// design decision held for Stage 2 review. The entry is deliberately narrow —
// remove this line and the gate fails until the primitive is redesigned.
const VARIETY_WAIVED = new Set(['P-DECOY']);

for (const name of Object.keys(sets)) {
  const keys = sets[name].items.map(it => it.options.find(o => o.id === it.key).text);
  const distinct = new Set(keys).size;
  const commonest = Math.max(...[...new Set(keys)].map(k => keys.filter(x => x === k).length));
  if (VARIETY_WAIVED.has(name)) {
    check(distinct === 1, `${name}: waived for answer variety but now varies — remove the waiver`);
    continue;
  }
  const [minDistinct, maxShare] = SELECTION.has(name) ? [2, 0.75] : [8, 0.40];
  check(distinct >= minDistinct, `${name}: only ${distinct} distinct keys across ${N} items (need ${minDistinct})`);
  check(commonest / keys.length <= maxShare,
    `${name}: one key accounts for ${commonest}/${keys.length} items (max ${Math.round(maxShare * 100)}%)`);
}

/* ── report ── */

if (process.argv.includes('--print')) {
  const w = Math.max(...tally.map(t => t.name.length));
  console.log('\nprimitive'.padEnd(w + 2) + 'accepted  tries  rejected  skeletons');
  for (const t of tally) {
    const sk = subForms.filter(k => k.startsWith(t.name + '/')).length;
    console.log(t.name.padEnd(w + 2) + String(t.accepted).padStart(8) + String(t.tries).padStart(7) +
      String(t.rejected).padStart(10) + String(sk).padStart(11));
  }
  console.log(`\ncross-skeleton false positives: ${crossFlagged}/${crossPairs}`);
  console.log(`reference table: ${ref.items.length} fingerprints, ${ref._axes_populated.length} axes populated, ` +
    `${ref._axes_null.length} null (${ref._axes_null.join(', ')})`);
}

if (fails.length) {
  console.error(`FAIL  est-primitives: ${fails.length} check(s) failed`);
  for (const f of fails.slice(0, 25)) console.error(`  • ${f}`);
  if (fails.length > 25) console.error(`  … and ${fails.length - 25} more`);
  process.exit(1);
}
console.log(`PASS  est-primitives: ${Object.keys(PRIMITIVES).length} primitives x ${N} load-bearing items, ` +
  `${subForms.length} skeletons, ${crossFlagged}/${crossPairs} cross-skeleton false positives, ` +
  `${ref.items.length} reference fingerprints`);
