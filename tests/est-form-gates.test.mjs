#!/usr/bin/env node
// Mutation tests for the Stage-3.5 form gates and the Core stream.
//
// Nine mutation classes, one per rule the stage added. Each takes a REAL
// assembled form or a REAL generated item and breaks exactly one thing, then
// asserts the corresponding check fails. A baseline passes first, so every
// mutation has something to break.
//
//   1  Entry/Core boundary        a routine item pushed into a Core slot
//   2  Stretch protection         a free repr_switch bite pushed into Stretch
//   3  trap rivalry               a rival turned into a truncation
//   4  trap fail-closed           a solution path removed
//   5  Core contract              each clause of assessCore()
//   6  key balance                a letter over quota, and a run of six
//   7  content reuse              an equation, a numeric tuple, an option grid
//   8  authenticity               targets, low-information readings, sub-forms
//   9  step independence          bands separated by length

import { assemble, verify } from '../scripts/est-assemble.mjs';
import { SIGNATURES, BANDS, profileOf, admits, SIGNATURE_EVIDENCE } from '../scripts/est-signatures.mjs';
import { trapLevel, intermediatesOf, stepsOf, Q, qEq } from '../scripts/est-primitives.mjs';
import { generateCore, assessCore, CORE_CONSTRUCTS } from '../scripts/est-core-stream.mjs';
import {
  keyBalance, rebalanceKeys, contentReuse, authenticity, stepIndependence,
  formGates, spearman, itemSteps, KEY_BALANCE, AUTHENTICITY, STEP_INDEPENDENCE,
} from '../scripts/est-form-gates.mjs';
import { objectOf, objectDiversity, coverage, OBJECT_RULES, REFERENCE_OBJECTS } from '../scripts/est-objects.mjs';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${label}`); } };
const clone = r => ({ ...r, placed: r.placed.map(p => ({ ...p, item: JSON.parse(JSON.stringify(p.item)) })) });

const base = assemble({ seed: 4100 });
ok(base.placed.length === 50, 'BASELINE: the assembler fills 50/50');
ok(verify(base).ok, 'BASELINE: and every asserted constraint holds');
ok(keyBalance(base.placed).ok, 'BASELINE: the key is balanced');
ok(contentReuse(base.placed).ok, 'BASELINE: no surface content is printed twice');

/* ── 1. the Entry/Core boundary ── */
{
  const routine = base.placed.find(p => p.item.stream === 'routine');
  ok(!!routine, 'the form contains routine items');
  const prof = profileOf(routine.item, trapLevel);
  ok(admits('Entry', prof), 'a routine item is Entry-admissible');
  ok(!admits('Core', prof), 'MUTATION boundary: a routine item is NOT admissible in a Core slot');
  ok(!admits('Stretch', prof) && !admits('Peak', prof), 'MUTATION boundary: nor in Stretch or Peak');

  // And the rule that does it is the trap grade, not a metadata flag.
  ok(SIGNATURES.Core.admits({ ...prof, trap: 2 }) === true,
    'the only thing standing between that profile and Core is the trap grade');
  ok(SIGNATURE_EVIDENCE.Core.p1Routine === 0,
    'the recorded evidence says Core admits none of the P1 routine constructs');

  const pushed = clone(base);
  const idx = pushed.placed.findIndex(p => p.item.stream === 'routine');
  pushed.placed[idx] = { ...pushed.placed[idx], band: 'Core' };
  ok(!verify(pushed).ok, 'MUTATION boundary: a routine item placed in a Core slot is rejected by verify()');
}

/* ── 2. Stretch protected from a free representational bite ── */
{
  // The Stage-2 leak: a chart reader whose repr_switch bites for free satisfied
  // `biting >= 1` and walked into Stretch.
  const chartLike = { present: 3, biting: 1, core: 0, trap: 1, composed: false };
  ok(!SIGNATURES.Stretch.admits(chartLike), 'MUTATION stretch: one free bite with no core and no full trap is refused');
  ok(SIGNATURES.Stretch.admits({ ...chartLike, core: 1, biting: 1 }), 'and a reasoning-core bite is admitted');
  ok(SIGNATURES.Stretch.admits({ ...chartLike, trap: 2, biting: 1 }), 'and so is a full-cost trap');
}

/* ── 3 & 4. the trap rivalry rule ── */
{
  const item = generateCore('A11', 1, { seed: 4100 }).items[0];
  ok(!!item, 'a Core-stream item generates');
  ok(trapLevel(item).level === 2, 'BASELINE: it grades trap 2');

  // Turn the rival into a TRUNCATION by declaring its value an intermediate.
  const trunc = JSON.parse(JSON.stringify(item));
  trunc.solution = [trunc.solution[0], { label: 'x', value: trunc.rival[trunc.rival.length - 1].value },
                    trunc.solution[trunc.solution.length - 1]];
  ok(trapLevel(trunc).level === 1,
    'MUTATION rivalry: a rival that stops at an intermediate of the solution grades 1, not 2');

  // Remove the solution path entirely: the no-insight branch must FAIL CLOSED.
  const noPath = JSON.parse(JSON.stringify(item));
  delete noPath.solution;
  ok(intermediatesOf(noPath) === null, 'a missing solution path yields no intermediates');
  ok(trapLevel(noPath).level === 1, 'MUTATION fail-closed: with no solution path the trap cannot reach 2');

  // A path that does not terminate on the key buys nothing.
  const wrongEnd = JSON.parse(JSON.stringify(item));
  wrongEnd.solution[wrongEnd.solution.length - 1] = { label: 'x', value: Q(999999) };
  ok(intermediatesOf(wrongEnd) === null, 'MUTATION path: a solution path not ending on the key is refused');
  ok(trapLevel(wrongEnd).level === 1, 'and the trap falls back to 1');

  // Steps are DERIVED from the path, never declared beside it.
  ok(stepsOf(item) === item.solution.length, 'steps are the length of the solution path');
}

/* ── 5. every clause of the Core contract ── */
{
  const good = generateCore('A14', 1, { seed: 4100 }).items[0];
  ok(assessCore(good).ok, 'BASELINE: a generated Core item satisfies its contract');
  const bust = (mutate, pattern, label) => {
    const it = JSON.parse(JSON.stringify(good));
    mutate(it);
    const r = assessCore(it);
    ok(!r.ok && r.reasons.some(x => pattern.test(x)), `MUTATION core contract: ${label}`);
  };
  bust(it => { it.routes[0].requiresInsight = true; }, /must not claim an insight route/, 'an insight route is refused');
  bust(it => { delete it.solution; }, /no solution path|does not terminate/, 'a missing solution path is refused');
  bust(it => { it.rival = [it.rival[0]]; }, /no rival method|slip, not a rival/, 'a one-step rival is refused');
  bust(it => { it.rival[it.rival.length - 1].value = Q(987654); }, /does not land on a printed option/, 'a rival off the option grid is refused');
  bust(it => { it.mechanism = { hidden_step: 2 }; }, /reasoning-core mechanism/, 'a reasoning-core bite is refused');
  bust(it => { it.mechanism = {}; }, /no mechanism is in play/, 'no mechanism at all is refused');
  bust(it => { it.routes = it.routes.filter(r => !r.natural || qEq(r.value, it.options.find(o => o.id === it.key).value)); },
    /trap grades/, 'losing the natural rival route drops the trap grade and is refused');
}

/* ── 6. key balance ── */
{
  const k = keyBalance(base.placed);
  ok(k.ok, `BASELINE: key ${JSON.stringify(k.count)}, longest run ${k.longest}`);
  ok(k.longest >= 2, 'BASELINE: and the key is not run-free, which would be as unlike the reference as a run of six');

  const skewed = clone(base);
  for (let i = 0; i < 20; i++) skewed.placed[i].item.key = 'A';
  const ks = keyBalance(skewed.placed);
  ok(!ks.ok && ks.failures.some(f => /letter A/.test(f)), 'MUTATION key: a letter over quota is caught');

  const runny = clone(base);
  for (let i = 10; i < 17; i++) runny.placed[i].item.key = 'C';
  const kr = keyBalance(runny.placed);
  ok(!kr.ok && kr.failures.some(f => /run/.test(f)), 'MUTATION key: a run above the observed maximum is caught');

  // The rebalancer must never move the ANSWER, only the letter carrying it.
  const before = base.placed.map(p => p.item.options.find(o => o.id === p.item.key).text);
  const again = rebalanceKeys(clone(base).placed, { seed: 4100 });
  const after = again.map(p => p.item.options.find(o => o.id === p.item.key).text);
  ok(before.every((t, i) => t === after[i]), 'the rebalancer permutes option order and never the answer');
  ok(KEY_BALANCE.maxRun === 5, 'the run cap is the observed maximum, not an invented one');
}

/* ── 7. content reuse, and the formulas it must NOT reject ── */
{
  ok(contentReuse(base.placed).ok, 'BASELINE: no collision');

  const eq = clone(base);
  eq.placed[7].item.stem = eq.placed[3].item.stem;
  ok(!contentReuse(eq.placed).ok, 'MUTATION reuse: the same equation printed twice is caught');

  const grid = clone(base);
  grid.placed[9].item.options = JSON.parse(JSON.stringify(grid.placed[2].item.options));
  ok(contentReuse(grid.placed).collisions.some(c => c.kind === 'optionSet'),
    'MUTATION reuse: the same option grid printed twice is caught');

  const nums = clone(base);
  nums.placed[11].item.stem = 'A rope of length 12 is cut into pieces of 3 and 8 metres.';
  nums.placed[12].item.stem = 'A beam of length 8 rests on supports 3 and 12 metres apart.';
  ok(contentReuse(nums.placed).collisions.some(c => c.kind === 'numericTuple'),
    'MUTATION reuse: the same numeric tuple in two stems is caught');

  // …and the common formulas every EST form prints must survive.
  const innocent = clone(base);
  innocent.placed[0].item.stem = 'The line has equation $y = mx + b$. What is $b$?';
  innocent.placed[1].item.stem = 'In a right triangle, $a^2 + b^2 = c^2$. What is $c$?';
  innocent.placed[2].item.stem = 'A circle has area $\\pi r^2$. What is $r$?';
  innocent.placed[4].item.stem = 'What is $x^2$ when $x$ is 5?';
  innocent.placed[5].item.stem = 'What is $x^2$ when $x$ is 9?';
  const ic = contentReuse(innocent.placed).collisions.filter(c => c.kind === 'equation');
  ok(ic.length === 0, `common formulas are not flagged as reuse (${ic.length} false positives)`);
}

/* ── 8. measurable authenticity ── */
{
  const a = authenticity(base.placed);
  ok(a.distinctTargets >= AUTHENTICITY.minDistinctTargets, `BASELINE: ${a.distinctTargets} distinct target kinds`);
  ok(Object.values(a.bySub).every(n => n <= AUTHENTICITY.maxPerSubForm), 'BASELINE: no sub-form appears more than twice');

  const oneTarget = clone(base);
  for (const p of oneTarget.placed) p.item.fingerprintParts = { ...(p.item.fingerprintParts || {}), target: 'value:x' };
  for (const p of oneTarget.placed) if (p.item.fingerprint) p.item.fingerprint.target = 'value:x';
  const at = authenticity(oneTarget.placed);
  ok(!at.ok && at.failures.some(f => /distinct target kinds|ask for a value/.test(f)),
    'MUTATION authenticity: a form that only ever asks for a value is caught');

  const repeated = clone(base);
  for (let i = 0; i < 3; i++) repeated.placed[i].item.subForm = 'P-NAMED-CONFIG/three_letter_angle';
  const ar = authenticity(repeated.placed);
  ok(!ar.ok && ar.failures.some(f => /share the sub-form/.test(f)),
    'MUTATION authenticity: three items on one configuration are caught');

  const lookups = clone(base);
  const setId = lookups.placed.find(p => p.set)?.set;
  for (const p of lookups.placed) if (p.set === setId) p.item.fingerprintParts = { ...(p.item.fingerprintParts || {}), chain: ['read-one-value'] };
  for (const p of lookups.placed) if (p.set === setId && p.item.fingerprint) p.item.fingerprint.chain = ['read-one-value'];
  const al = authenticity(lookups.placed);
  ok(!al.ok && al.failures.some(f => /pure-lookup readings/.test(f)),
    'MUTATION authenticity: a display read three times at one depth is caught');

  ok(typeof a.diagnostics.stemLength.cv === 'number' && a.diagnostics.stemLength.cv > 0,
    'the ungrounded properties are reported as diagnostics, with real numbers');
}

/* ── 9. step independence ── */
{
  const s = stepIndependence(base.placed);
  ok(Number.isFinite(s.overlap), `BASELINE: step-span overlap ${(s.overlap * 100).toFixed(0)}%`);

  // Separate the bands by length and the gate must fire.
  const stratified = clone(base);
  const depth = { Entry: 1, Core: 5, Stretch: 6, Peak: 7 };
  for (const p of stratified.placed) {
    const n = depth[p.band];
    p.item.fingerprintParts = { ...(p.item.fingerprintParts || {}), chain: Array(n).fill('op') };
    if (p.item.fingerprint) p.item.fingerprint.chain = Array(n).fill('op');
  }
  const ss = stepIndependence(stratified.placed);
  ok(!ss.ok && ss.failures.some(f => /separated by length/.test(f)),
    'MUTATION steps: bands separated by operation count are caught');
  ok(ss.overlap === 0, 'and the overlap measure reports zero');

  // No maximum on operations anywhere: a uniformly LONG form passes.
  const long = clone(base);
  for (const p of long.placed) {
    p.item.fingerprintParts = { ...(p.item.fingerprintParts || {}), chain: Array(9).fill('op') };
    if (p.item.fingerprint) p.item.fingerprint.chain = Array(9).fill('op');
  }
  ok(stepIndependence(long.placed).ok, 'a form of nine-step items is NOT rejected — there is no cap on operations');

  ok(Math.abs(spearman([1, 2, 3, 4], [1, 2, 3, 4]) - 1) < 1e-9, 'spearman is exact on a monotone pair');
  ok(Math.abs(spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-9, 'and on a reversed one');
  ok(STEP_INDEPENDENCE.refBandOverlap === 0.95, 'the reference overlap figure is recorded, not rounded away');
}

/* ── the four gates together ── */
{
  const g = formGates(base.placed);
  ok(Array.isArray(g.failures), 'formGates returns a failure list');
  ok(g.step && g.key && g.reuse && g.auth, 'and all four sub-reports');
  ok(itemSteps({ fingerprintParts: { chain: ['a', 'b', 'c'] } }) === 3, 'itemSteps counts the chain');
  ok(Object.keys(CORE_CONSTRUCTS).length >= 13, `${Object.keys(CORE_CONSTRUCTS).length} Core constructs`);
}

/* ── 10. mathematical-object diversity (Primitive Coverage Revision) ────────── */
{
  const od = objectDiversity(base.placed);
  ok(od.distinct >= 49, `BASELINE: ${od.distinct} distinct mathematical objects in ${base.placed.length} items`);
  ok(od.ok, `BASELINE: object diversity holds — ${od.failures.join('; ') || 'no repeats beyond the allowance'}`);
  ok(OBJECT_RULES.refDistinctPerForm.join(',') === '49,49,50,50',
    'the reference standard is recorded: 49 / 49 / 50 / 50 distinct archetypes in 50 items');

  // Three items on one object is what ESTM2-2026-P2 did with the remainder
  // theorem, through three different sub-forms and three different fingerprints.
  const thrice = clone(base);
  for (let i = 0; i < 3; i++) {
    thrice.placed[i].item.stream = 'core';
    thrice.placed[i].item.construct = 'remainder-theorem';
  }
  const t = objectDiversity(thrice.placed);
  ok(!t.ok && t.failures.some(f => /ask the object/.test(f)),
    'MUTATION objects: three items on one mathematical object are caught');

  // Two objects repeated once each: the corpus carries at most one.
  const twice = clone(base);
  twice.placed[0].item.stream = 'core'; twice.placed[0].item.construct = 'remainder-theorem';
  twice.placed[1].item.stream = 'mechanism'; twice.placed[1].item.construct = 'non_monic_divisor';
  twice.placed[2].item.stream = 'routine'; twice.placed[2].item.construct = 'compound-growth';
  twice.placed[3].item.stream = 'core'; twice.placed[3].item.construct = 'compound-two-years';
  const w = objectDiversity(twice.placed);
  ok(!w.ok && w.failures.some(f => /appear more than once/.test(f)),
    'MUTATION objects: two different objects each repeated is caught');

  // Constructs that fingerprint apart but teach the same thing SHARE an id —
  // that is the whole point, and it is asserted rather than assumed.
  ok(objectOf({ stream: 'core', construct: 'remainder-theorem' })
     === objectOf({ stream: 'mechanism', construct: 'non_monic_divisor' }),
    'two different sub-forms of the remainder theorem share one object id');
  ok(objectOf({ stream: 'routine', construct: 'compound-growth' })
     === objectOf({ stream: 'core', construct: 'compound-two-years' }),
    'and so do the two compound-interest constructs');
  ok(objectOf({ stream: 'routine', construct: 'solve-linear' })
     !== objectOf({ stream: 'core', construct: 'multiple-of-the-solution' }),
    'while a target shift IS a different decision point, so it is a different object');

  // An unannotated construct must never silently license a repeat.
  const unknown = objectOf({ stream: 'routine', construct: 'no-such-construct-exists' });
  ok(/^unmapped:/.test(unknown), 'an unmapped construct becomes its own object rather than a blank');

  // Coverage of the reference vocabulary is measurable, not asserted.
  const cov = coverage({ A07: ['routine:evaluate-factored-form', 'core:remainder-theorem'] });
  ok(cov.A07.refObjects === 9 && cov.A07.covered === 2 && cov.A07.deficit === 7,
    `coverage() measures the gap: A07 covers ${cov.A07.covered} of ${cov.A07.refObjects}`);
  ok(Object.values(REFERENCE_OBJECTS).reduce((n, f) => n + f.objects.length, 0) === 189,
    'the reference vocabulary is the full 189 objects from artifact 2');
}

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
