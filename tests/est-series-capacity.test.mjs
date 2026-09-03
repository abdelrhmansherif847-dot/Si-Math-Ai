// Series capacity, structural content signatures, and the library expansion.
//
// WHAT THIS SUITE IS FOR
//
// Three modules arrived with the series-capacity pass and none of them had a
// test: `est-series.mjs` (the 25-form capacity model), `est-content.mjs` (the
// structural signatures that replaced a string-length threshold) and
// `est-vocabulary.mjs` (62 routine asks), plus sixteen new Core structures.
//
// The rule this project learned the hard way — a green check is only evidence
// if it could have gone red — applies hardest to a capacity model, because a
// capacity model that always says PASS is indistinguishable from one that is
// never consulted. So every measurement below is asserted in BOTH directions:
// a series the model must accept, and a mutation of it the model must reject.
//
// It is also the drift guard on the expansion. Every ask and every Core
// structure is built here, checked against its own stream's contract, and
// matched to exactly one entry in CONSTRUCT_OBJECT — which is what keeps the
// object registry from silently disagreeing with the code that produces the
// objects.

import {
  REFERENCE_SERIES, randomOverlap, scheduledOverlap, scheduledVocabulary, requiredCapacity,
  SERIES_TARGET, seriesSignature, measureSeries, seriesVerdict, emittedCoverage, SERIES_AXES, AXIS_MEANING,
} from '../scripts/est-series.mjs';
import {
  functionalForms, equationCoefficients, numericTuple, geometricConfiguration,
  transformationParams, signaturesOf, contentCollisions, COMMON_FORMULAS, SIGNATURE_KINDS,
} from '../scripts/est-content.mjs';
import { VOCAB_ASKS, VOCAB_BY_FAMILY } from '../scripts/est-vocabulary.mjs';
import { assessRoutine, ROUTINE_CONSTRUCTS } from '../scripts/est-routine.mjs';
import { CORE_CONSTRUCTS, CORE_SERVES, CORE_READERS, coreItem, assessCore } from '../scripts/est-core-stream.mjs';
import { CONSTRUCT_OBJECT, REFERENCE_OBJECTS, objectOf } from '../scripts/est-objects.mjs';
import { rng } from '../scripts/est-primitives.mjs';

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log(`  ok  ${msg}`); } else { failed++; console.log(`  FAIL  ${msg}`); } };

/* ══════════════ 1. the closed-form capacity models ══════════════ */
{
  // A random draw's expected pairwise overlap is S^2/V and does NOT depend on
  // how many forms there are. That independence is the whole reason a bigger
  // vocabulary — not a longer series — is the lever, so it is asserted.
  ok(Math.abs(randomOverlap(100) - 25) < 1e-9, 'randomOverlap(V=100, S=50) = 25 items');
  ok(randomOverlap(2500) === 1, 'randomOverlap(V=2500) = 1 item');
  ok(randomOverlap(0) === Infinity, 'an empty vocabulary is unusable, not a divide-by-zero');
  ok(randomOverlap(200, 10) === 0.5, 'the model scales with the form length, not just the vocabulary');

  // Scheduled allocation: each object used k times across N forms.
  ok(scheduledOverlap(1, 25) === 0, 'an object used once in the series never collides');
  ok(Math.abs(scheduledOverlap(5, 25) - 50 * 4 / 24) < 1e-9, 'k=5 over 25 forms overlaps 8.33 items');
  ok(scheduledOverlap(5, 1) === 0, 'a one-form series has no pairs, so no overlap');
  ok(scheduledVocabulary(5, 25) === 250, 'k=5 over 25 forms needs 250 objects');
  ok(scheduledVocabulary(1, 25) === 1250, 'never repeating needs one object per slot');

  // The two models must disagree, and in the direction that matters: a schedule
  // beats a draw. If they ever agreed, the allocation penalty would be noise.
  ok(scheduledOverlap(5, 25) < randomOverlap(250),
    'scheduling beats drawing at the same vocabulary — otherwise the penalty measures nothing');

  const at2 = requiredCapacity(0.023);
  ok(at2.randomDrawVocabulary > at2.scheduledVocabulary,
    'reproducing the corpus share needs less vocabulary if allocation is scheduled');
  ok(at2.randomDrawVocabulary > 2000 && at2.scheduledVocabulary > 700,
    `the corpus's 2.3% share needs ${at2.randomDrawVocabulary} objects drawn or ${at2.scheduledVocabulary} scheduled`);
  const at20 = requiredCapacity(0.20);
  ok(at20.randomDrawVocabulary < at2.randomDrawVocabulary && at20.scheduledVocabulary < at2.scheduledVocabulary,
    'a looser share needs less vocabulary');
}

/* ══════════════ 2. the reference series is described, not invented ══════════════ */
{
  ok(REFERENCE_SERIES.forms === 4 && REFERENCE_SERIES.slotsPerForm === 50,
    'the reference series is 4 forms of 50, as coded');
  ok(REFERENCE_SERIES.archetypes >= 189,
    `${REFERENCE_SERIES.archetypes} archetypes across 200 slots — a vocabulary almost as large as the series`);
  ok(REFERENCE_SERIES.archetypesInMoreThanOneForm / REFERENCE_SERIES.archetypes < 0.05,
    'fewer than 5% of reference archetypes appear in more than one form');
  ok(REFERENCE_SERIES.distinctPerForm.every(d => d >= 49),
    'every reference form asks 49 or 50 distinct objects in 50 slots');
  // The number a random draw WOULD give, which is why the corpus is evidence of
  // deliberate allocation rather than of a huge library.
  ok(randomOverlap(REFERENCE_SERIES.archetypes) > 12,
    'a random draw from the corpus vocabulary would overlap 13 of 50 — it overlaps 1.2, so it is scheduled');
}

/* ══════════════ 3. measureSeries, and the mutations it must catch ══════════════ */
const form = (objs) => objs.map((o, i) => ({ q: i + 1, fam: 'A01', band: 'Core',
  item: { stream: 'routine', construct: o, family: 'A01', stem: `stem ${o}`,
          options: [], fingerprintParts: { chain: [o] } } }));
{
  // A perfect series: 3 forms of 6, no object shared by any two.
  const perfect = [form(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']),
                   form(['b1', 'b2', 'b3', 'b4', 'b5', 'b6']),
                   form(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])];
  const mp = measureSeries(perfect, { vocabulary: 18 });
  ok(mp.overlap.objects.mean === 0, 'a series with no shared object measures zero overlap');
  ok(mp.objectsInEveryForm === 0, 'and no object in every form');

  // The same three forms, but every object identical.
  const same = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'];
  const worst = [form(same), form(same), form(same)];
  const mw = measureSeries(worst, { vocabulary: 6 });
  ok(mw.overlap.objects.mean === 6, 'MUTATION: three identical forms overlap on every slot');
  ok(mw.objectsInEveryForm === 6, 'MUTATION: and every object is recorded as appearing in every form');
  ok(mw.overlap.objects.share > mp.overlap.objects.share,
    'MUTATION: the share moves in the right direction — a measure that did not could not grade anything');

  // The verdict must reject the bad series and accept the good one.
  ok(seriesVerdict(mp).ok, 'the verdict passes a series with no reuse');
  const vw = seriesVerdict(mw);
  ok(!vw.ok, 'MUTATION: the verdict rejects three identical forms');
  ok(vw.failures.some(f => /appear in EVERY form/.test(f)), 'and says which rule broke');
  ok(vw.stageReached === null, 'and reaches no staged target');

  // One object leaking into all three forms is enough to fail. The gate has to
  // bite on ONE, because the corpus has none.
  const nearlyPerfect = [form(['a1', 'a2', 'a3', 'a4', 'a5', 'z']),
                         form(['b1', 'b2', 'b3', 'b4', 'b5', 'z']),
                         form(['c1', 'c2', 'c3', 'c4', 'c5', 'z'])];
  const vn = seriesVerdict(measureSeries(nearlyPerfect, { vocabulary: 16 }));
  ok(!vn.ok && vn.failures.some(f => /^1 objects appear in EVERY form/.test(f)),
    'MUTATION: a single object present in every form fails the verdict');

  // The allocation penalty separates a forced assembler from a thin library.
  const mFor = measureSeries(nearlyPerfect, { vocabulary: 600 });
  ok(mFor.allocationPenalty > 1, 'a large vocabulary with a repeated object records an allocation penalty');
  ok(mp.allocationPenalty <= 1.05, 'and a series that spreads its draw records none');
}

/* ══════════════ 4. every axis declares what its overlap means ══════════════ */
{
  for (const axis of SERIES_AXES) ok(!!AXIS_MEANING[axis], `axis ${axis} declares a basis and whether overlap is a defect`);
  ok(AXIS_MEANING.families.defect === false,
    'family overlap is NOT a defect — every form covers every family by blueprint, so 100% is the design');
  ok(AXIS_MEANING.objects.defect === true && AXIS_MEANING.objects.basis === 'slots',
    'object overlap IS a defect, and is measured against slots');
  const sig = seriesSignature(form(['a', 'b']));
  for (const axis of SERIES_AXES) ok(Array.isArray(sig[axis]), `seriesSignature emits the ${axis} axis as a list`);
}

/* ══════════════ 5. capability is not coverage ══════════════ */
{
  // Ten forms, so "rare" (under a fifth of them) is distinguishable from
  // "reached" at all. A two-form fixture cannot tell the two statuses apart,
  // which is exactly the sort of vacuous check this project has found before.
  const forms = [];
  for (let i = 0; i < 10; i++) forms.push(form(i === 0 ? ['a', 'b', 'd'] : ['a', 'b', 'c']));
  const cons = [{ key: 'routine:a', family: 'A01', target: 'value', object: 'a' },
                { key: 'routine:d', family: 'A01', target: 'value', object: 'd' },
                { key: 'routine:zz', family: 'A01', target: 'equation', object: 'zz' },
                { key: 'routine:qq', family: 'A99', target: 'value', object: 'qq' }];
  const cov = emittedCoverage(cons, forms, { slotsByFamily: { A01: 3 } });
  ok(cov.reached === 1, 'an object in every form is reached');
  ok(cov.rare === 1, 'an object in one form of ten is rare, not reached');
  ok(cov.unreachable === 1, 'MUTATION: a construct with capacity AND demand but no emission is UNREACHABLE');
  ok(cov.noDemand === 1, 'a construct whose family has no slot is no-demand, not a defect');
  const eq = cov.byTarget.find(t => t.target === 'equation');
  ok(eq && eq.unreachable === 1 && eq.itemsPerForm === 0,
    'the per-target breakdown shows the equation gap as zero items per form — the P3 defect, reproduced');
}

/* ══════════════ 6. structural content signatures ══════════════ */
{
  ok(functionalForms('$f(x) = 2x + 4$').length === 1, 'a linear rule yields one functional-form signature');
  ok(functionalForms('A shape is drawn.').length === 0, 'MUTATION: a stem with no function rule yields none');
  ok(functionalForms('$f(x) = 2x + 4$')[0] === functionalForms('The function $f(x) = 2x + 4$ is given.')[0],
    'the same rule in different prose yields the SAME signature — this is the P3 Q15/Q47 collision');
  ok(functionalForms('$f(x) = 2x + 5$')[0] !== functionalForms('$f(x) = 2x + 4$')[0],
    'MUTATION: a changed constant is a different signature');
  ok(functionalForms('$g(x) = 2x + 4$')[0] !== functionalForms('$f(x) = 2x + 4$')[0],
    'and the function name is part of it');

  ok(equationCoefficients('$2x + 4 = 0$').length >= 1, 'an equation yields a coefficient signature');
  ok(typeof numericTuple('The values are 3, 7, 11 and 19.') === 'string', 'four loose numbers make a numeric tuple');
  ok(numericTuple('The value is 3.') === null, 'MUTATION: one number is not a tuple');
  ok(numericTuple('The values are 3, 7, 11 and 19.') === numericTuple('The totals are 19, 11, 7 and 3.'),
    'the tuple is order-independent — the same numbers reprinted are the same content');
  ok(typeof geometricConfiguration('In triangle $ABC$, $AB = 3$. What is the length of $BC$?') === 'string',
    'a named figure with a measurement yields a configuration');
  ok(geometricConfiguration('A triangle is drawn.') === null,
    'MUTATION: a geometry stem with no numbers has no configuration to collide on');
  ok(Array.isArray(transformationParams('$y = 3x + 5$')), 'transformations are extracted as a list');

  // The executable false-positive guarantee. A signature scheme that flagged
  // the quadratic formula would be unusable, so the formulas are a fixture.
  const opts = n => [{ id: 'A', text: `${n}` }, { id: 'B', text: `${n + 1}` },
                     { id: 'C', text: `${n + 2}` }, { id: 'D', text: `${n + 3}` }];
  const asItems = COMMON_FORMULAS.map((stem, i) => ({ q: i + 1, item: { stem, options: opts(i * 10) } }));
  const cc = contentCollisions(asItems);
  ok(cc.ok, `no two of the ${COMMON_FORMULAS.length} common formulas collide: ${cc.failures.join('; ') || 'clean'}`);

  // A signature derived from nothing must not be a signature. Two items with no
  // printed options both produced the option grid '' and were reported as a
  // content collision; production items always have four options, so the defect
  // could only ever be found by asking.
  const empty = [{ q: 1, item: { stem: 'One shape is drawn.', options: [] } },
                 { q: 2, item: { stem: 'Another shape is drawn.', options: [] } }];
  ok(contentCollisions(empty).ok, 'MUTATION: two option-less items do not collide on an empty option grid');
  const oneOpt = [{ q: 1, item: { stem: 'One shape.', options: [{ id: 'A', text: '4' }] } },
                  { q: 2, item: { stem: 'Another shape.', options: [{ id: 'A', text: '4' }] } }];
  ok(contentCollisions(oneOpt).ok, 'MUTATION: nor do two single-option items');
  const fourSame = [{ q: 1, item: { stem: 'One shape.', options: opts(3) } },
                    { q: 2, item: { stem: 'Another shape.', options: opts(3) } }];
  ok(!contentCollisions(fourSame).ok, 'but a genuinely repeated four-option grid still collides');

  // An item cannot repeat content with itself. A stem stating two equal values
  // yields the same signature twice, and the detector reported the item as
  // colliding with its own q — a form failing its content gate because one item
  // said something twice.
  const twice = [{ q: 8, item: { stem: 'The functions satisfy $f(5) = -3$ and $g(5) = -3$.', options: opts(1) } }];
  const selfSigs = signaturesOf(twice[0].item).map(([k, v]) => `${k}::${v}`);
  ok(selfSigs.length === new Set(selfSigs).size, 'one item never yields the same signature twice');
  ok(contentCollisions(twice).ok, 'MUTATION: an item stating the same value twice does not collide with itself');

  // ...and it still catches a real repeat.
  const repeat = [{ q: 1, item: { stem: 'The function $f(x) = 2x + 4$ is given. What is $f(3)$?', options: [] } },
                  { q: 2, item: { stem: 'For $f(x) = 2x + 4$, what is $f(-1)$?', options: [] } }];
  const rc = contentCollisions(repeat);
  ok(!rc.ok && rc.collisions.some(c => c.kind === 'functionalForm'),
    'MUTATION: the same rule printed twice in one form is caught');
  ok(SIGNATURE_KINDS.length >= 5, `${SIGNATURE_KINDS.length} signature kinds, not one length threshold`);
}

/* ══════════════ 7. the routine vocabulary expansion ══════════════ */
{
  const names = Object.keys(VOCAB_ASKS);
  ok(names.length >= 60, `${names.length} routine asks in the vocabulary expansion`);
  const grouped = Object.values(VOCAB_BY_FAMILY).reduce((n, g) => n + g.length, 0);
  ok(grouped === names.length,
    'every ask is reachable through the family grouping the assembler draws from — capability the assembler cannot see is not coverage');

  let built = 0; const unbuilt = [], unregistered = [], badContract = [];
  for (const [name, fn] of Object.entries(VOCAB_ASKS)) {
    let it = null;
    for (let s = 1; s <= 120 && !it; s++) { const c = fn(rng(s * 7919 + 13)); if (c && !c.error) it = c; }
    if (!it) { unbuilt.push(name); continue; }
    built++;
    it.stream = 'routine';
    if (!assessRoutine(it).ok) badContract.push(`${name}: ${assessRoutine(it).reasons[0]}`);
    if (it.object !== name) unregistered.push(`${name} declares object ${it.object}`);
    const key = `routine:${it.construct}`;
    if (CONSTRUCT_OBJECT[key] !== it.object) unregistered.push(`${key} maps to ${CONSTRUCT_OBJECT[key]}, not ${it.object}`);
  }
  ok(unbuilt.length === 0, `every ask builds within 120 seeds${unbuilt.length ? ': ' + unbuilt.join(', ') : ''}`);
  ok(badContract.length === 0, `every ask satisfies the routine contract${badContract.length ? ': ' + badContract.join('; ') : ''}`);
  ok(unregistered.length === 0, `every ask's object is registered exactly as it is declared${unregistered.length ? ': ' + unregistered.slice(0, 3).join('; ') : ''}`);
  ok(built === names.length, `${built} of ${names.length} asks produced an accepted item`);

  // Every ask is wired into the family the assembler draws from.
  const missing = [];
  for (const [fam, list] of Object.entries(VOCAB_BY_FAMILY))
    for (const fn of list) if (!(ROUTINE_CONSTRUCTS[fam] || []).includes(fn)) missing.push(fam);
  ok(missing.length === 0, `every vocabulary ask is in ROUTINE_CONSTRUCTS${missing.length ? ': ' + [...new Set(missing)].join(', ') : ''}`);
}

/* ══════════════ 8. the Core stream expansion ══════════════ */
{
  const ids = Object.keys(CORE_CONSTRUCTS);
  ok(ids.length >= 33, `${ids.length} Core constructs`);
  const unserved = ids.filter(id => !CORE_SERVES[id]);
  ok(unserved.length === 0, `every Core construct declares the family it serves${unserved.length ? ': ' + unserved.join(', ') : ''}`);

  const thin = [], unmapped = [];
  for (const id of ids) {
    let it = null;
    for (let s = 1; s <= 200 && !it; s++) { const c = coreItem(id, s * 6151 + 7); if (!c.error) it = c; }
    if (!it) { thin.push(id); continue; }
    if (!assessCore(it).ok) thin.push(`${id} (contract)`);
    if (objectOf(it).startsWith('unmapped:')) unmapped.push(`${id} -> ${it.construct}`);
  }
  ok(thin.length === 0, `every Core construct builds an item that passes assessCore${thin.length ? ': ' + thin.join(', ') : ''}`);
  ok(unmapped.length === 0, `every Core construct's object is registered${unmapped.length ? ': ' + unmapped.join(', ') : ''}`);

  // The A13 Core readers, which is where the blueprint's core demand is heaviest.
  const a13Readers = Object.values(CORE_READERS).flatMap(byFam => byFam.A13 || []);
  ok(a13Readers.length >= 5, `${a13Readers.length} Core readers serve A13, which holds six of the blueprint's Core slots`);
}

/* ══════════════ 9. the object registry has no silent overwrite ══════════════ */
{
  // Two constructs mapping to one object is legitimate. Two entries under one
  // KEY is not — and a spread-merged object literal loses one silently, which
  // has already happened twice in this project.
  const raw = Object.keys(CONSTRUCT_OBJECT);
  ok(raw.length === new Set(raw).size, `${raw.length} construct keys, all distinct`);
  const named = new Set(Object.values(CONSTRUCT_OBJECT).filter(Boolean));
  const refObjects = new Set(Object.values(REFERENCE_OBJECTS).flatMap(f => f.objects));
  const invented = [...named].filter(o => !refObjects.has(o));
  ok(invented.length === 0,
    `every named object is a reference archetype, not an invention${invented.length ? ': ' + invented.slice(0, 5).join(', ') : ''}`);
  const covered = [...refObjects].filter(o => named.has(o)).length;
  ok(covered >= 160, `${covered} of ${refObjects.size} reference archetypes are buildable`);
}

/* ══════════════ 10. the staged target is a ladder, not a slogan ══════════════ */
{
  const st = SERIES_TARGET.stages;
  ok(st.length >= 3, 'the target is staged rather than a single number');
  for (let i = 1; i < st.length; i++) {
    ok(st[i].vocabulary > st[i - 1].vocabulary, `stage ${st[i].id} demands more vocabulary than ${st[i - 1].id}`);
    ok(st[i].share < st[i - 1].share, `stage ${st[i].id} tolerates less overlap than ${st[i - 1].id}`);
  }
  ok(SERIES_TARGET.referenceShare < st[st.length - 1].share,
    'even the last stage is looser than the corpus — the target is honest about not reproducing it');
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
