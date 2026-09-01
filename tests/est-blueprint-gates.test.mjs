#!/usr/bin/env node
// Mutation tests for the Stage-2 blueprint gates.
//
// A green gate is only evidence if it could have gone red. Each block below
// takes the real constraint set, breaks it in one specific way, and asserts the
// corresponding check fails. The seven mutation classes are the ones Stage 2
// was asked to prove: too many Peak items, too few required mechanism classes,
// trap saturation, duplicate structural archetypes, anti-clone violations,
// invalid compositions, and impossible domain/KAR distributions.
import {
  BANDS, BAND_SHARES, TRAP_MIX, MECHANISM_TARGETS, COMPOSITION_LIMITS,
  ARCHETYPE_DIVERSITY, SIGNATURES, admits, profileOf,
} from '../scripts/est-signatures.mjs';
import { PRIMITIVES, trapLevel, assess } from '../scripts/est-primitives.mjs';
import { composeClassifyNormalise, assessComposed } from '../scripts/est-compose.mjs';
import { fingerprintItem, detectClone } from '../scripts/est-fingerprint.mjs';
import { DOMAIN_BANDS, FAMILIES, SLOTS } from '../scripts/est-blueprint.mjs';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${label}`); } };

/** The form-level quota check, standalone so a mutation can be handed to it. */
function quotaCheck({ band, trap, composed, mechanisms = {}, archetypes = {}, collisions = 0, domain = {} },
                    limits = { BAND_SHARES, TRAP_MIX, MECHANISM_TARGETS, COMPOSITION_LIMITS, ARCHETYPE_DIVERSITY }) {
  const f = [];
  for (const b of BANDS) {
    const [lo, hi] = limits.BAND_SHARES[b].range;
    if ((band[b] || 0) < lo || (band[b] || 0) > hi) f.push(`band ${b} outside ${lo}..${hi}`);
  }
  for (const l of [0, 1, 2]) {
    const [lo, hi] = limits.TRAP_MIX[l].range;
    if ((trap[l] || 0) < lo || (trap[l] || 0) > hi) f.push(`trap ${l} outside ${lo}..${hi}`);
  }
  for (const [m, t] of Object.entries(limits.MECHANISM_TARGETS)) {
    if (t.gated) continue;
    if ((mechanisms[m] || 0) < t.range[0]) f.push(`${m} below its floor ${t.range[0]}`);
  }
  const [clo, chi] = limits.COMPOSITION_LIMITS.perForm;
  if (composed < clo || composed > chi) f.push(`composition outside ${clo}..${chi}`);
  for (const [a, n] of Object.entries(archetypes))
    if (n > limits.ARCHETYPE_DIVERSITY.maxPerArchetype) f.push(`archetype ${a} repeated ${n} times`);
  if (collisions > 0) f.push(`${collisions} anti-clone collisions`);
  for (const [d, spec] of Object.entries(DOMAIN_BANDS)) {
    const share = (domain[d] || 0) / 50;
    if (domain[d] !== undefined && (share < spec.min || share > spec.max)) f.push(`domain ${d} outside its published band`);
  }
  return { ok: f.length === 0, fails: f };
}

/** A form that satisfies everything — the baseline each mutation departs from. */
const HEALTHY = {
  band: { Entry: 9, Core: 12, Stretch: 13, Peak: 16 },
  trap: { 0: 2, 1: 20, 2: 28 },
  composed: 3,
  mechanisms: Object.fromEntries(Object.entries(MECHANISM_TARGETS).map(([m, t]) => [m, t.range[1]])),
  archetypes: { 'a1': 2, 'a2': 1, 'a3': 2 },
  collisions: 0,
  domain: { FA: 15, DAP: 15, AAF: 15, GT: 5 },
};
ok(quotaCheck(HEALTHY).ok, 'BASELINE: a healthy form passes every quota — the mutations below have something to break');

const mutate = (patch, label, expect) => {
  const r = quotaCheck({ ...HEALTHY, ...patch });
  ok(!r.ok, `MUTATION ${label}: rejected`);
  ok(r.fails.some(x => expect.test(x)), `MUTATION ${label}: and the reason says why (${r.fails.join('; ') || 'nothing'})`);
};

/* ── 1. too many Peak items ── */
mutate({ band: { Entry: 4, Core: 6, Stretch: 8, Peak: 32 } }, 'too many Peak items', /band Peak outside/);
mutate({ band: { Entry: 9, Core: 12, Stretch: 13, Peak: 10 } }, 'too few Peak items', /band Peak outside/);

/* ── 2. too few required mechanism classes ── */
mutate({ mechanisms: { ...HEALTHY.mechanisms, hidden_step: 2 } }, 'hidden_step starved', /hidden_step below its floor/);
mutate({ mechanisms: {} }, 'no mechanism supplied at all', /below its floor/);

/* ── 3. trap saturation ── */
mutate({ trap: { 0: 0, 1: 2, 2: 48 } }, 'trap saturation', /trap [12] outside/);
mutate({ trap: { 0: 30, 1: 15, 2: 5 } }, 'no real traps at all', /trap [02] outside/);

/* ── 4. duplicate structural archetypes ── */
mutate({ archetypes: { 'a1': 5 } }, 'one archetype used five times', /archetype a1 repeated/);

/* ── 5. anti-clone violations ── */
mutate({ collisions: 2 }, 'structural clones inside the form', /anti-clone collisions/);

/* ── 6. invalid compositions ── */
mutate({ composed: 0 }, 'composition floor missed', /composition outside/);
mutate({ composed: 12 }, 'composition ceiling breached', /composition outside/);

/* ── 7. impossible domain distribution ── */
mutate({ domain: { FA: 40, DAP: 4, AAF: 4, GT: 2 } }, 'domain distribution impossible', /domain (FA|DAP|AAF) outside/);

/* ── KAR is NOT asserted, and that is deliberate ── */
{
  // artifact 7 §6: no form may claim the published KAR bands until a rubric
  // applied by two independent passes agrees. Stage 2 does not change that, and
  // a gate that pretended to check KAR would be the vacuous kind.
  const { KAR_CALIBRATION } = await import('../scripts/est-blueprint.mjs');
  ok(KAR_CALIBRATION.claimAllowed === false, 'KAR: no form may claim the published bands yet');
  ok(KAR_CALIBRATION.useMeasurementAsConstraint === false, 'KAR: the measured split is not used as a constraint');
}

/* ── the signature itself, mutated ── */

{
  const p = { present: 6, biting: 3, core: 2, trap: 2, composed: false };
  ok(admits('Stretch', p), 'a Stretch profile is admitted by Stretch');
  ok(!admits('Entry', p), 'and refused by Entry');
  ok(!admits('Entry', { ...p, biting: 1, core: 1 }), 'Entry refuses any reasoning-core mechanism, however few bite');
  ok(!admits('Peak', { present: 9, biting: 5, core: 0, trap: 2, composed: false }),
    'Peak refuses an item with no reasoning-core mechanism, however loaded');
  ok(!admits('Core', { present: 3, biting: 1, core: 0, trap: 2, composed: true }), 'Core refuses a composed item');
  ok(!admits('Entry', { present: 3, biting: 1, core: 0, trap: 2, composed: true }), 'Entry refuses a composed item');
}

/* ── the gates hold against REAL generated items, not just synthetic profiles ── */

{
  const items = [];
  for (const n of Object.keys(PRIMITIVES))
    for (let s = 7000; s < 7060 && items.length < 40; s++) {
      let c; try { c = PRIMITIVES[n](s, {}); } catch { continue; }
      if (!c || c.error || !assess(c).loadBearing) continue;
      c.seed = s; items.push(c);
    }
  ok(items.length >= 20, 'a real pool is available');
  // How many real items no band admits. This is a MEASUREMENT, asserted so it
  // cannot drift silently: P-DECOY/shared_terms_cancel has trap level 0 and
  // bites a reasoning-core mechanism, and the corpus contains no such item — 0
  // of its 10 trap-free items bite a reasoning-core mechanism. So the signature
  // refusing it is the corpus speaking, not a hole in the rules.
  const unplaceable = items.filter(i => !BANDS.some(b => admits(b, profileOf(i, trapLevel))));
  const subs = new Set(unplaceable.map(i => `${i.primitive}/${i.form || i.species}`));
  ok(unplaceable.length === 0 || [...subs].every(x => x === 'P-DECOY/shared_terms_cancel'),
    `only the known trap-0 core-biting sub-form is unplaceable; found ${[...subs].join(', ') || 'none'}`);
  // No real item may be Entry-admissible: the library builds mechanism-bearing
  // items, and that is the Stage-2 coverage finding stated as an assertion.
  ok(items.every(i => !admits('Entry', profileOf(i, trapLevel))),
    'NO primitive produces an Entry-profile item — the coverage gap, asserted so it cannot be forgotten');

  // Two items from one sub-form collide: a primitive is a skeleton generator.
  const bySub = {};
  for (const i of items) (bySub[`${i.primitive}/${i.form || i.species}`] ||= []).push(i);
  const pair = Object.values(bySub).find(g => g.length >= 2);
  if (pair) {
    const fps = pair.slice(0, 2).map(fingerprintItem);
    ok(detectClone(fps[1], [fps[0]], 'sibling').clone,
      'two items from one sub-form are detected as a structural repeat at form-assembly scope');
  }
}

/* ── composed items are checked by the composed gate, not the plain one ── */

{
  const c = (() => { for (let s = 7200; s < 7400; s++) { const it = composeClassifyNormalise(s); if (!it.error) return it; } })();
  ok(!!c && assessComposed(c).ok, 'a real composed item passes the composed gate');
  const broken = JSON.parse(JSON.stringify(c));
  broken.conceptChain[2].inputs = ['parameter-a'];
  ok(!assessComposed(broken).ok, 'and fails it when the closing step stops integrating both results');
}

console.log(`  ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
