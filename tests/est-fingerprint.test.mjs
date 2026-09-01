#!/usr/bin/env node
// Anti-clone detection, broken one axis at a time.
//
// The requirement exists because ESTM1-2026-A Q23 reproduced a reference item's
// context, transformation, target, options, distractors, narrative AND its
// constants, and nothing noticed. So the tests below check two opposite things:
// that the detector fires on a structural repeat, and that it stays quiet on
// legitimate variation. A detector that flags everything is as useless as one
// that flags nothing.
import { readFileSync } from 'node:fs';
import {
  tokens, jaccard, compare, detectClone, fingerprintItem, fingerprintAll,
  fingerprintReferenceRow, AXES, AXIS_THRESHOLD, CLONE_RULES,
} from '../scripts/est-fingerprint.mjs';
import { generate, PRIMITIVES } from '../scripts/est-primitives.mjs';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${label}`); } };

/* ── token similarity ── */

ok(jaccard(tokens('budget-fixed-fee-integer-floor'), tokens('budget-integer-floor')) >= AXIS_THRESHOLD.chain,
  'the Q23 archetype pair is similar enough to register — exact string matching misses it by three characters');
ok(jaccard(tokens('linear-solve'), tokens('circle-centre-point-diameter')) < AXIS_THRESHOLD.chain,
  'unrelated archetypes are not similar');
ok(jaccard(tokens(''), tokens('anything')) === 0, 'an empty axis is unknown, not similar');
ok(jaccard(tokens(['a', 'b', 'c']), tokens(['c', 'b', 'a'])) === 1, 'axis order does not change the token set');

/* ── the seven axes ── */

ok(AXES.length === 7, 'seven axes, as specified');
ok(Object.keys(AXIS_THRESHOLD).length === 7, 'every axis has a threshold');
ok(CLONE_RULES.reference === 5 && CLONE_RULES.sibling === 5 && CLONE_RULES.series === 6,
  'thresholds are 5 / 5 / 6 as specified');

/* ── a primitive is a skeleton generator: its own items must be detected ── */

const sets = {};
for (const n of Object.keys(PRIMITIVES)) sets[n] = generate(n, 6, { seed: 2024 }).items;
const bySkeleton = {};
for (const n of Object.keys(sets)) for (const it of sets[n]) (bySkeleton[`${n}/${it.form || '-'}`] ||= []).push(it);

for (const k of Object.keys(bySkeleton)) {
  const g = bySkeleton[k];
  if (g.length < 2) continue;
  const [a, b] = fingerprintAll(g);
  const c = compare(a, b);
  ok(c.matched >= 5 || (c.per.chain.hit && c.per.target.hit),
    `${k}: two items from one skeleton are detected as sharing it`);
}

/* ── across skeletons the detector must stay quiet ── */

{
  const keys = Object.keys(bySkeleton);
  let flagged = 0, pairs = 0;
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = fingerprintAll(bySkeleton[keys[i]])[0];
    const b = fingerprintAll(bySkeleton[keys[j]])[0];
    const c = compare(a, b);
    pairs++;
    if (c.matched >= 5 || (c.per.chain.hit && c.per.target.hit)) flagged++;
  }
  ok(flagged / pairs <= 0.10, `cross-skeleton false positives ${flagged}/${pairs} within budget`);
  ok(pairs > 50, 'enough distinct skeletons to make that rate meaningful');
}

/* ── mutation: change only the numbers ──
   Surface-number variation is not originality. Two items from one primitive
   differ only in their constants, and the detector must say so. */

{
  const a = fingerprintItem(sets['P-CLASSIFY'][0]);
  const b = fingerprintItem(sets['P-CLASSIFY'][1]);
  ok(sets['P-CLASSIFY'][0].stem !== sets['P-CLASSIFY'][1].stem, 'the two items do differ on the page');
  const c = compare(a, b);
  ok(c.matched === 7, 'but every structural axis matches — numbers are not structure');
}

/* ── mutation: break one axis at a time ──
   Each axis must be load-bearing in the comparison, or it is decoration. */

{
  const a = fingerprintItem(sets['P-DECOY'][0]);
  for (const ax of AXES) {
    const b = { ...fingerprintItem(sets['P-DECOY'][1]), [ax]: 'entirely-unrelated-structure-token' };
    const c = compare(a, b);
    ok(c.matched === 6, `breaking ${ax} drops the match count by exactly one`);
    ok(c.per[ax].hit === false, `and ${ax} itself no longer hits`);
  }
}

/* ── a null axis never matches, so an unpopulated table cannot manufacture hits ── */

{
  const a = fingerprintItem(sets['P-NORMALISE'][0]);
  const b = { ...fingerprintItem(sets['P-NORMALISE'][1]), narrative: null, numeric: null, options: null };
  const c = compare(a, b);
  ok(c.comparable === 4, 'three null axes leave four comparable');
  ok(c.matched <= 4, 'a null axis cannot count as a match');
}

/* ── the reference table ── */

const ref = JSON.parse(readFileSync(new URL('../scripts/est-reference-fingerprints.json', import.meta.url), 'utf8'));

ok(ref.items.length === 200, 'the reference table carries all 200 corpus items');
ok(ref._axes_null.length === 3 && ref._axes_populated.length === 4,
  'the table declares which axes it can and cannot populate');
ok(ref.items.every(r => ref._axes_null.every(ax => r[ax] === null)), 'the null axes really are null');
// NO CONTENT LEAK. The repository is public and the corpus is not in it, so
// the table must carry structural vocabulary and nothing else. A word blacklist
// is the wrong instrument — it cleared prose that avoided the words and tripped
// on the legitimate device label `symbolic-answer`. What actually separates a
// structural label from a leaked stem is SHAPE: a controlled token, not a
// sentence. Every bound below is measured against the table, not guessed.
{
  const vals = ref.items.flatMap(r => AXES.map(ax => r[ax]).filter(v => v != null));
  ok(vals.length > 0 && vals.every(v => /^[A-Za-z0-9;: -]+$/.test(v)),
    'NO CONTENT LEAK: every axis is controlled vocabulary — no prose punctuation, quotes or currency');
  ok(vals.every(v => v.trim().split(/\s+/).length <= 3),
    'NO CONTENT LEAK: no axis runs longer than three words — labels, not sentences');
  ok(vals.every(v => v.length <= 60), 'NO CONTENT LEAK: no axis carries a sentence-length string');
  ok(!/\d{3,}/.test(JSON.stringify(ref.items)),
    'NO CONTENT LEAK: no row carries a multi-digit number');
  // A leaked stem would explode the vocabulary; a controlled one stays bounded.
  const vocab = new Set(vals.flatMap(v => v.toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean));
  ok(vocab.size < 600, `NO CONTENT LEAK: ${vocab.size} distinct tokens across 200 items is a closed vocabulary`);
}
ok(new Set(ref.items.map(r => r.id)).size === 200, 'every reference id is distinct');

/* ── reduced strength must never harden into a rejection ── */

{
  const cand = fingerprintItem(sets['P-COMBINATION'][0]);
  const r = detectClone(cand, ref.items, 'reference');
  ok(r.strength === 'reduced', 'reference comparison reports reduced strength');
  ok(r.comparable < 5, `only ${r.comparable} axes are comparable against the reference table`);
  ok(r.clone === false, 'a reduced-strength comparison never returns clone:true');
  ok(typeof r.candidates === 'boolean', 'it reports review candidates instead');
}

/* ── full strength does harden ── */

{
  const table = fingerprintAll(sets['P-NAMED-CONFIG']);
  const r = detectClone(table[0], table, 'sibling');
  ok(r.strength === 'full', 'generated-vs-generated compares at full strength');
  ok(r.comparable === 7, 'all seven axes comparable');
  ok(r.clone === true, 'and a structural repeat is rejected, not merely noted');
}

/* ── the reference row mapper ── */

{
  const row = fingerprintReferenceRow({
    form: 'T3', q: '43', domain: 'FA', kar: 'A',
    archetype: 'budget-integer-floor', target: 'direct', stim: 'text',
    devices: 'shared;integer', distractor_family: 'fee-omitted',
  });
  ok(row.id === 'T3-Q43', 'reference rows are identified by form and number');
  ok(row.chain === 'budget-integer-floor', 'the archetype is the chain proxy');
  ok(row.narrative === null && row.numeric === null && row.options === null,
    'the three unrecorded axes stay null');

  // The clone that started all of this: same skeleton, different numbers.
  const q23 = {
    id: 'E1-Q23', ctx: 'no-stimulus integer', chain: 'budget-fixed-fee-integer-floor',
    target: 'direct:FA', options: null, distract: null, narrative: null, numeric: null,
  };
  const c = compare(q23, row);
  ok(c.per.chain.hit, 'THE Q23 CASE: its archetype registers against the reference archetype');
  ok(c.per.target.hit, 'THE Q23 CASE: and its target class matches');
  ok(detectClone(q23, [row], 'reference').candidates,
    'THE Q23 CASE: the detector raises it as a review candidate');
}

console.log(`  ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
