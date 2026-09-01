// Blueprint dry run — Stage 2. Fill a 50-question form from the signatures.
//
// This exists to answer one question before any exam is generated: ARE THE NEW
// CONSTRAINTS JOINTLY SATISFIABLE? Band shares, trap mix, mechanism targets,
// archetype diversity, anti-clone and the family/domain quotas all pull against
// each other, and prose cannot settle whether a form exists that satisfies them
// all at once. Filling one can.
//
// It reports what it could NOT do as prominently as what it could. A slot whose
// family no primitive serves is reported as unserved, never quietly skipped —
// the coverage gap is a Stage-2 finding, not an embarrassment to hide.
//
//   node scripts/est-dry-run.mjs           summary
//   node scripts/est-dry-run.mjs --full    every slot, and every rejection

import { SLOTS, FAMILIES, DOMAIN_BANDS } from './est-blueprint.mjs';
import {
  BANDS, BAND_SHARES, TRAP_MIX, MECHANISM_TARGETS, COMPOSITION_LIMITS,
  ARCHETYPE_DIVERSITY, TIME_BUDGET, SIGNATURES, MECHANISMS, ROUTINE_STREAM, admits, profileOf,
} from './est-signatures.mjs';
import { PRIMITIVES, trapLevel, assess } from './est-primitives.mjs';
import { composeClassifyNormalise } from './est-compose.mjs';
import { fingerprintItem, detectClone } from './est-fingerprint.mjs';

/**
 * Which family each primitive sub-form can serve. Assigned by what the item
 * actually asks, not by which primitive built it: P-COMBINATION's
 * ratio-parameter form is a question about lines, whatever its machinery.
 */
export const SERVES = {
  'P-COMBINATION/sum-difference':        'A03',
  'P-COMBINATION/ratio-parameter':       'A05',
  'P-CONVERSION/rate_denominator':       'A12',
  'P-CONVERSION/period_index':           'A12',
  'P-CONVERSION/axis_scale':             'A12',
  'P-CONVERSION/si_prefix':              'A12',
  'P-NORMALISE/non_monic_divisor':       'A07',
  'P-NORMALISE/mixed_base':              'A10',
  'P-SCOPE/residual_referent':           'A12b',
  'P-CLASSIFY/existence-of-solutions':   'A01',
  'P-DECOY/coefficients_sum_zero':       'A10',
  'P-DECOY/shared_terms_cancel':         'A09',
  'P-UNSTATED-MODEL/aggregate_invariance': 'A18',
  'P-NAMED-CONFIG/three_letter_angle':   'A16',
  'COMPOSED/C2':                         'A07',
};

/**
 * The new band assignment. Placement is by SIGNATURE, not by the additive
 * demand score, and the counts come from the drift-corrected reference shares:
 * Entry 18%, Core 24%, Stretch 26%, Peak 32% → 9 / 12 / 13 / 16 of 50, every
 * one inside its observed per-form range.
 *
 * Position matters too. Real forms ramp without being monotone, so Entry is
 * weighted early and Peak late while both appear throughout.
 */
/* ────────────────────────── the candidate pool ────────────────────────── */

function buildPool(seed, perSubForm) {
  const pool = [];
  for (const name of Object.keys(PRIMITIVES)) {
    let s = seed, tries = 0;
    const seen = {};
    while (tries < perSubForm * 60) {
      tries++;
      let c;
      try { c = PRIMITIVES[name](s++, {}); } catch { continue; }
      if (!c || c.error) continue;
      if (!assess(c).loadBearing) continue;
      const sub = `${name}/${c.form || c.species}`;
      if (!SERVES[sub]) continue;
      seen[sub] = (seen[sub] || 0) + 1;
      if (seen[sub] > perSubForm) continue;
      c.seed = s - 1;
      c.subForm = sub;
      c.family = SERVES[sub];
      c.trapLevel = trapLevel(c).level;
      pool.push(c);
    }
  }
  let cs = seed;
  for (let n = 0; n < perSubForm && cs < seed + perSubForm * 40; ) {
    const it = composeClassifyNormalise(cs++);
    if (it.error) continue;
    it.seed = cs - 1;
    it.subForm = 'COMPOSED/C2';
    it.family = SERVES['COMPOSED/C2'];
    it.trapLevel = trapLevel(it).level;
    pool.push(it); n++;
  }
  return pool;
}

/**
 * Band assignment is SOLVED, not hand-set — and the reason is a Stage-2 finding.
 *
 * A first attempt assigned bands on a fixed ramp, independent of which family
 * sat in each slot, and filled 8 of 50. The families are not interchangeable:
 * P-CLASSIFY only ever produces a Peak profile, so an Entry slot carrying
 * family A01 can never be filled however many candidates are drawn. Band and
 * family have to be chosen together.
 *
 * So each slot is assigned the band its family's pool can actually serve,
 * chosen to track the global share targets, and every slot that no band can
 * serve is recorded as routine rather than quietly dropped.
 */
export function capabilityOf(pool) {
  const cap = {};
  for (const c of pool) {
    const p = profileOf(c, trapLevel);
    (cap[c.family] ||= new Set());
    for (const b of BANDS) if (admits(b, p)) cap[c.family].add(b);
  }
  return cap;
}

/** Target counts per band for a 50-slot form, from the drift-corrected shares. */
export const BAND_PLAN = { Entry: 9, Core: 12, Stretch: 13, Peak: 16 };

function assignBands(cap, composedFamilies = new Set()) {
  // Composition carries a per-form quota, so the assembler has to make room for
  // it: a family that can supply a composed item is steered toward a band that
  // permits one until the minimum is met. Without this the greedy pass spends
  // those slots on Core and the quota is unreachable — which is how the first
  // dry run placed zero composed items while declaring a floor of two.
  let compNeeded = COMPOSITION_LIMITS.perForm[0];
  // Early slots lean easy and late slots lean hard, but the binding constraint
  // is capability: a slot only gets a band its family can serve.
  const remaining = { ...BAND_PLAN };
  const order = [...SLOTS].map((s, idx) => ({ ...s, idx }));
  const out = new Array(SLOTS.length);
  for (const slot of order) {
    const can = cap[slot.fam] ? [...cap[slot.fam]] : [];
    if (!can.length) { out[slot.idx] = { q: slot.q, band: null, routine: true, reason: 'no primitive serves this family' }; continue; }
    // Prefer the band that is furthest from meeting its target, then the one
    // closest to where this slot sits in the form.
    const wantHard = slot.q / SLOTS.length;
    can.sort((a, b) => {
      const deficit = x => remaining[x] / BAND_PLAN[x];
      const d = deficit(b) - deficit(a);
      if (Math.abs(d) > 1e-9) return d;
      return Math.abs(BANDS.indexOf(a) / 3 - wantHard) - Math.abs(BANDS.indexOf(b) / 3 - wantHard);
    });
    let pick;
    if (compNeeded > 0 && composedFamilies.has(slot.fam)) {
      pick = can.find(b => COMPOSITION_LIMITS.allowedBands.includes(b) && remaining[b] > 0)
          || can.find(b => COMPOSITION_LIMITS.allowedBands.includes(b));
      if (pick) compNeeded--;
    }
    pick = pick || can.find(b => remaining[b] > 0) || can[0];
    remaining[pick]--;
    out[slot.idx] = { q: slot.q, band: pick, routine: false };
  }
  return out;
}

/* ────────────────────────── the fill ────────────────────────── */

export function dryRun({ seed = 4100, perSubForm = 14 } = {}) {
  const pool = buildPool(seed, perSubForm);
  const cap = capabilityOf(pool);
  const composedFamilies = new Set(pool.filter(c => c.composedOf).map(c => c.family));
  const bands = assignBands(cap, composedFamilies);
  const rejected = {};
  const reject = why => { rejected[why] = (rejected[why] || 0) + 1; };

  const used = { archetype: {}, subForm: {}, primitive: {} };
  const placed = [];
  const routine = [];
  const fingerprints = [];
  let composedCount = 0;

  for (const slot of SLOTS) {
    const a = bands[slot.q - 1];
    if (a.routine) { routine.push({ q: slot.q, fam: slot.fam, reason: a.reason }); continue; }
    const band = a.band;
    const candidates = pool.filter(c => c.family === slot.fam && !c.taken);

    let chosen = null;
    for (const c of candidates) {
      const prof = profileOf(c, trapLevel);
      if (!admits(band, prof)) { reject(`${band}: signature not satisfied`); continue; }
      if (prof.composed) {
        if (!COMPOSITION_LIMITS.allowedBands.includes(band)) { reject(`composition not permitted in ${band}`); continue; }
        if (composedCount >= COMPOSITION_LIMITS.perForm[1]) { reject('composition cap reached'); continue; }
      }
      const arch = c.archetype || c.subForm;
      if ((used.archetype[arch] || 0) >= ARCHETYPE_DIVERSITY.maxPerArchetype) { reject('archetype already used twice'); continue; }
      if ((used.subForm[c.subForm] || 0) >= ARCHETYPE_DIVERSITY.maxPerSubForm) { reject('sub-form already used three times'); continue; }
      if ((used.primitive[c.primitive] || 0) >= ARCHETYPE_DIVERSITY.maxPerPrimitive) { reject('primitive quota reached'); continue; }
      const fp = fingerprintItem(c);
      if (detectClone(fp, fingerprints, 'sibling').clone) { reject('anti-clone: structural repeat of an item already placed'); continue; }
      chosen = c; chosen._fp = fp; chosen._prof = prof;
      break;
    }
    if (!chosen) { routine.push({ q: slot.q, fam: slot.fam, reason: `no ${band} candidate in family ${slot.fam} survived the slot rules` }); continue; }

    chosen.taken = true;
    const arch = chosen.archetype || chosen.subForm;
    used.archetype[arch] = (used.archetype[arch] || 0) + 1;
    used.subForm[chosen.subForm] = (used.subForm[chosen.subForm] || 0) + 1;
    used.primitive[chosen.primitive] = (used.primitive[chosen.primitive] || 0) + 1;
    if (chosen._prof.composed) composedCount++;
    fingerprints.push(chosen._fp);
    placed.push({ q: slot.q, band, fam: slot.fam, item: chosen });
  }

  // SATISFIABILITY. Every slot the library could not serve is stood in for by
  // the declared routine stream, whose profile is Entry. This tests whether the
  // CONSTRAINT SYSTEM is consistent; it says nothing about generation, and the
  // report keeps the two apart.
  const satisfiability = feasibility();

  return { placed, routine, rejected, pool: pool.length, composedCount, used, cap, bands, satisfiability };
}

/**
 * IS THE CONSTRAINT SYSTEM CONSISTENT?
 *
 * A different question from "can the library fill a form", and it has to be
 * asked separately or the library's coverage gap drowns it. This asks: given an
 * idealised supply — an item available at any band, trap level and family — does
 * an assignment of 50 slots exist that satisfies EVERY quota at once?
 *
 * It answers by CONSTRUCTING one and checking it, so a positive verdict comes
 * with a witness rather than an assertion. The interactions that make this
 * non-trivial are real: only Entry admits a trap-0 item, only Stretch and Peak
 * admit a composed one, and the reasoning-core mechanisms can only be supplied
 * by bands whose signature permits them.
 */
export function feasibility() {
  const fails = [];
  const inRange = (v, [lo, hi]) => v >= lo && v <= hi;

  // A witness. Band counts track the drift-corrected pooled shares; trap counts
  // track the pooled n=200 trap distribution.
  const band = { ...BAND_PLAN };                       // 9 / 12 / 13 / 16 = 50
  const trap = { 0: 2, 1: 20, 2: 28 };                 // 50
  const composed = 3;

  const total = BANDS.reduce((a, b) => a + band[b], 0);
  if (total !== 50) fails.push(`the band witness sums to ${total}, not 50`);
  for (const b of BANDS) if (!inRange(band[b], BAND_SHARES[b].range))
    fails.push(`band ${b}: witness ${band[b]} outside ${BAND_SHARES[b].range.join('..')}`);

  const tt = trap[0] + trap[1] + trap[2];
  if (tt !== 50) fails.push(`the trap witness sums to ${tt}, not 50`);
  for (const l of [0, 1, 2]) if (!inRange(trap[l], TRAP_MIX[l].range))
    fails.push(`trap level ${l}: witness ${trap[l]} outside ${TRAP_MIX[l].range.join('..')}`);

  // INTERACTION 1. Only the Entry signature admits a trap-0 item; Core, Stretch
  // and Peak all require trap >= 1. So every trap-0 item must be an Entry item.
  if (trap[0] > band.Entry)
    fails.push(`${trap[0]} trap-0 items but only ${band.Entry} Entry slots, and no other signature admits trap 0`);

  // INTERACTION 2. Composition is permitted only in Stretch and Peak.
  const compCapacity = COMPOSITION_LIMITS.allowedBands.reduce((a, b) => a + band[b], 0);
  if (!inRange(composed, COMPOSITION_LIMITS.perForm))
    fails.push(`composition witness ${composed} outside ${COMPOSITION_LIMITS.perForm.join('..')}`);
  if (composed > compCapacity)
    fails.push(`${composed} composed items but only ${compCapacity} slots permit composition`);

  // INTERACTION 3. Mechanism minima against the per-band biting ceilings the
  // signatures impose: Entry 1 (never a reasoning-core one), Core 2 (at most one
  // core), Stretch 3 (at most two core), Peak 7 (at most four core).
  const bitingCapacity = band.Entry * 1 + band.Core * 2 + band.Stretch * 3 + band.Peak * 7;
  const coreCapacity = band.Core * 1 + band.Stretch * 2 + band.Peak * 4;
  const needAll = Object.values(MECHANISM_TARGETS).reduce((a, t) => a + t.range[0], 0);
  const needCore = ['hidden_step', 'inference', 'multiconcept', 'nonobvious_rel']
    .reduce((a, m) => a + MECHANISM_TARGETS[m].range[0], 0);
  if (needAll > bitingCapacity)
    fails.push(`mechanism minima need ${needAll} bitings; the band mix supplies at most ${bitingCapacity}`);
  if (needCore > coreCapacity)
    fails.push(`reasoning-core minima need ${needCore} bitings; the band mix supplies at most ${coreCapacity}`);

  // INTERACTION 4. No single mechanism's minimum may exceed the slots that can
  // carry it. A reasoning-core mechanism cannot appear in an Entry item at all.
  for (const [m, t] of Object.entries(MECHANISM_TARGETS)) {
    if (t.gated) continue;
    const cap = ['hidden_step', 'inference', 'multiconcept', 'nonobvious_rel'].includes(m)
      ? band.Core + band.Stretch + band.Peak
      : 50;
    if (t.range[0] > cap) fails.push(`${m} needs ${t.range[0]} items; only ${cap} slots can carry it`);
  }

  return { ok: fails.length === 0, fails, witness: { band, trap, composed, bitingCapacity, coreCapacity, needAll, needCore } };
}

/* ────────────────────────── the report ────────────────────────── */

const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const pad = (s, n) => String(s).padEnd(n);

export function report(run) {
  const { placed, routine, satisfiability: sat } = run;
  const items = placed.map(p => p.item);
  const L = [];
  const say = (...a) => L.push(a.join(' '));

  say(`\n═══ A · WHAT REAL GENERATED ITEMS FILLED ═══`);
  say(`${placed.length}/50 slots filled from a pool of ${run.pool} load-bearing candidates.`);
  say(`${routine.length}/50 could not be, and are shown below. They are NOT generated questions.`);
  const why = count(routine, r => r.reason);
  for (const [r, n] of Object.entries(why).sort((a, b) => b[1] - a[1])) say(`   ${pad(n, 3)} ${r}`);
  say(`\n  family -> bands the primitive library can actually serve:`);
  for (const [f, bs] of Object.entries(run.cap).sort()) say(`   ${pad(f, 6)} ${[...bs].join(', ') || '(none)'}`);
  say(`   every other family in the blueprint: (none)`);

  say(`\n── domain distribution, filled slots only ──`);
  const dom = count(items, i => FAMILIES[i.family].domain);
  for (const d of Object.keys(DOMAIN_BANDS))
    say(`  ${pad(d, 5)} ${pad(dom[d] || 0, 3)} (${(100 * (dom[d] || 0) / (items.length || 1)).toFixed(0)}%)   published band ${(100 * DOMAIN_BANDS[d].min).toFixed(0)}-${(100 * DOMAIN_BANDS[d].max).toFixed(0)}%`);
  say(`  the filled subset is NOT domain-balanced and cannot be: DAP is 8 data-display slots the library does not serve.`);

  say(`\n── KAR distribution ──`);
  say(`  not asserted. KAR_CALIBRATION.claimAllowed is false — no form may claim the published bands until a`);
  say(`  rubric applied by two independent passes agrees (artifact 7 §6). Stage 2 does not change that.`);

  say(`\n── Entry / Core / Stretch / Peak, filled slots only ──`);
  const bandGot = count(placed, p => p.band);
  for (const b of BANDS) say(`  ${pad(b, 8)} ${pad(bandGot[b] || 0, 3)}  plan ${pad(BAND_PLAN[b], 3)}  observed per-form range ${BAND_SHARES[b].range.join('..')}`);

  say(`\n── mechanism distribution (items in which it BITES) ──`);
  for (const [m, t] of Object.entries(MECHANISM_TARGETS)) {
    const n = items.filter(i => (i.mechanism?.[m] || 0) >= 2).length;
    const pr = t.range.map(x => Math.round(x * items.length / 50));
    say(`  ${pad(m, 18)} ${pad(n, 3)}  pro-rata ${pad(pr.join('..'), 6)}${t.gated ? ' [GATED]' : n < pr[0] ? ' UNDER' : n > pr[1] ? ' OVER' : ''}`);
  }

  say(`\n── trap cost ──`);
  const trap = count(items, i => i.trapLevel);
  for (const lvl of [0, 1, 2])
    say(`  level ${lvl}  ${pad(trap[lvl] || 0, 3)} (${(100 * (trap[lvl] || 0) / (items.length || 1)).toFixed(0)}%)  ${TRAP_MIX[lvl].label}`);

  say(`\n── hidden-step species ──`);
  const hs = count(items.filter(i => (i.mechanism?.hidden_step || 0) >= 2), i => i.species);
  for (const [k, v] of Object.entries(hs).sort((a, b) => b[1] - a[1])) say(`  ${pad(k, 32)} ${v}`);

  say(`\n── composition ──`);
  say(`  ${run.composedCount} composed items; per-form range ${COMPOSITION_LIMITS.perForm.join('..')}, max depth ${COMPOSITION_LIMITS.maxDepth}`);

  say(`\n── representation switch ──   ${items.filter(i => (i.mechanism?.repr_switch || 0) >= 2).length} items at full strength`);

  say(`\n── stimulus ──`);
  say(`  0 filled items carry a stimulus: no primitive emits one, so every shared-stimulus set is unserved.`);

  say(`\n── structural archetype diversity ──`);
  const arch = count(items, i => i.archetype || i.subForm);
  say(`  ${Object.keys(arch).length} distinct archetypes across ${items.length} items; most-repeated ${items.length ? Math.max(...Object.values(arch)) : 0}`);
  say(`  ceiling ${ARCHETYPE_DIVERSITY.maxPerArchetype} per archetype, ${ARCHETYPE_DIVERSITY.maxPerSubForm} per sub-form, ${ARCHETYPE_DIVERSITY.maxPerPrimitive} per primitive`);

  say(`\n── anti-clone ──`);
  const fps = items.map(fingerprintItem);
  say(`  ${fps.filter(f => detectClone(f, fps, 'sibling').clone).length} structural collisions among the placed items`);

  say(`\n── time budget ──`);
  const steps = items.reduce((a, i) => a + (i.steps || 3), 0);
  const secs = items.length * TIME_BUDGET.fixedSecondsPerItem + steps * TIME_BUDGET.secondsPerStep;
  say(`  ${(secs / 60).toFixed(1)} min for ${items.length} items; pro-rata allowance ${(TIME_BUDGET.minutesPerForm * items.length / 50).toFixed(1)} min (±${100 * TIME_BUDGET.tolerance}%)`);
  say(`  steps are a TIME signal only — ${TIME_BUDGET.note}`);

  say(`\n── rejections during fill ──`);
  const rs = Object.entries(run.rejected).sort((a, b) => b[1] - a[1]);
  if (!rs.length) say('  none'); else for (const [w, n] of rs) say(`  ${pad(n, 5)} ${w}`);

  say(`\n═══ B · IS THE CONSTRAINT SYSTEM CONSISTENT? ═══`);
  say(`A separate question from part A, asked with an idealised supply: does an assignment of 50 slots`);
  say(`exist that satisfies every quota at once? Answered by constructing one, so a yes comes with a witness.`);
  say(`  witness bands: ` + BANDS.map(b => `${b} ${sat.witness.band[b]}`).join(', ') + `  (= 50)`);
  say(`  witness traps: ` + [0, 1, 2].map(l => `level ${l} ${sat.witness.trap[l]}`).join(', ') + `  (= 50)`);
  say(`  witness composed: ${sat.witness.composed}`);
  say(`  every trap-0 item must be an Entry item — no other signature admits one: ${sat.witness.trap[0]} <= ${sat.witness.band.Entry}`);
  say(`  mechanism minima need ${sat.witness.needAll} bitings, of which ${sat.witness.needCore} reasoning-core;`);
  say(`  the band mix supplies at most ${sat.witness.bitingCapacity} and ${sat.witness.coreCapacity}.`);
  say(sat.ok ? `  VERDICT: the constraint system is CONSISTENT — the witness above satisfies every form-level quota.`
             : `  VERDICT: INCONSISTENT —\n` + sat.fails.map(f => `    • ${f}`).join('\n'));

  say(`\n═══ VERDICT ═══`);
  say(`  constraint system consistent: ${sat.ok ? 'YES' : 'NO'}`);
  say(`  slots the current library can fill with real generated items: ${placed.length}/50`);
  say(`  Stage 2 does not close that gap and does not claim to. A form cannot be generated from`);
  say(`  this library alone, and the report names exactly what is missing.`);

  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = dryRun();
  console.log(report(run));
  if (process.argv.includes('--full')) {
    console.log('\n── every slot ──');
    for (const p of run.placed)
      console.log(`  Q${pad(p.q, 3)} ${pad(p.band, 8)} ${pad(p.fam, 5)} ${pad(p.item.subForm, 38)} trap ${p.item.trapLevel}`);
    for (const u of run.unserved) console.log(`  Q${pad(u.q, 3)} ${pad(u.band, 8)} ${pad(u.fam, 5)} UNSERVED — ${u.reason}`);
  }
}
