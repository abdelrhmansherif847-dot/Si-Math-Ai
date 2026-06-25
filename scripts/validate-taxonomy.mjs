#!/usr/bin/env node
/**
 * validate-taxonomy.mjs — Phase 1 guards for the canonical taxonomy.
 * Exit non-zero on any failure (CI gate).
 *
 * Checks:
 *  1. Drift guard      — generated copies are byte-identical to the source.
 *  2. ID uniqueness    — every topic/subtopic id is unique.
 *  3. Alias integrity  — every alias value points at an existing id.
 *  4. Cross-topic      — every subtopic id maps to an existing topic id.
 *  5. Resolver sanity  — reject-on-unmapped + canonical resolution behave.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(resolve(root, 'taxonomy.core.js'));

let failures = 0;
const fail = (m) => { console.error('  ✗', m); failures++; };
const ok = (m) => console.log('  ✓', m);

/* 1. Drift guard */
const BANNER = '/* AUTO-GENERATED from taxonomy.core.js by scripts/sync-taxonomy.mjs — DO NOT EDIT. */\n';
const src = readFileSync(resolve(root, 'taxonomy.core.js'), 'utf8');
for (const rel of ['taxonomy.js', 'supabase/functions/_shared/taxonomy.core.js']) {
  let copy;
  try { copy = readFileSync(resolve(root, rel), 'utf8'); }
  catch { fail(`generated copy missing: ${rel} (run scripts/sync-taxonomy.mjs)`); continue; }
  if (copy === BANNER + src) ok(`copy in sync: ${rel}`);
  else fail(`copy drifted from source: ${rel} (run scripts/sync-taxonomy.mjs)`);
}

/* 2. ID uniqueness */
const topicIds = T.TOPICS.map((t) => t.id);
const subIds = T.SUBTOPICS.map((s) => s.id);
const allIds = topicIds.concat(subIds);
if (new Set(allIds).size === allIds.length) ok(`all ${allIds.length} ids unique`);
else fail('duplicate id detected');

/* 3 + 4. Alias integrity + cross-topic */
const topicSet = new Set(topicIds);
const subSet = new Set(subIds);
let badTopicAlias = 0, badSubAlias = 0, badCrossTopic = 0;
for (const [k, v] of Object.entries(T._topicAliasIds)) if (!topicSet.has(v)) { badTopicAlias++; fail(`topic alias "${k}" → unknown id ${v}`); }
for (const [k, v] of Object.entries(T._subtopicAliasIds)) if (!subSet.has(v)) { badSubAlias++; fail(`subtopic alias "${k}" → unknown id ${v}`); }
for (const s of T.SUBTOPICS) if (!topicSet.has(s.topicId)) { badCrossTopic++; fail(`subtopic ${s.id} → unknown topic ${s.topicId}`); }
if (!badTopicAlias) ok(`all ${Object.keys(T._topicAliasIds).length} topic aliases valid`);
if (!badSubAlias) ok(`all ${Object.keys(T._subtopicAliasIds).length} subtopic aliases valid`);
if (!badCrossTopic) ok('all subtopics map to a known topic');

/* 4b. Opaque, name-independent subtopic ids — must be <PREFIX>_<NNN>, never
 * a name-derived slug. Guards the immutability rule against accidental reverts. */
const OPAQUE = /^[A-Z]+_\d{3}$/;
const badOpaque = T.SUBTOPICS.filter((s) => !OPAQUE.test(s.id));
if (!badOpaque.length) ok(`all ${subIds.length} subtopic ids are opaque (<PREFIX>_NNN)`);
else badOpaque.forEach((s) => fail(`subtopic id "${s.id}" is not opaque (name-derived?)`));

/* 5. Resolver sanity */
const cases = [
  [{ topic: 'الجبر', subtopic: 'order of operations' }, 'ALGEBRA', 'ALG_001'],
  [{ topic: 'Algebra', subtopic: 'Radicals' }, 'ALGEBRA', 'ALG_003'],
  [{ topic: 'Algebra', subtopic: 'Exponents' }, 'ALGEBRA', 'ALG_002'],
  [{ topic: 'percentage calculation', subtopic: 'percentages' }, 'PROBABILITY_RATIOS', 'PR_003'],
  [{ topic: 'المثلثات', subtopic: 'trig' }, 'GEOMETRY', 'GEO_005'],
];
for (const [input, eTopic, eSub] of cases) {
  const r = T.resolve(input);
  if (r && r.topicId === eTopic && r.subtopicId === eSub) ok(`resolve ${JSON.stringify(input)} → ${eTopic}/${eSub}`);
  else fail(`resolve ${JSON.stringify(input)} → ${JSON.stringify(r)} (expected ${eTopic}/${eSub})`);
}
/* Reject cases — must return null, never a guessed name */
for (const input of [
  { topic: 'الرياضيات', subtopic: '' },
  { topic: 'Calculus', subtopic: 'Limits' },
  { topic: 'Coaching', subtopic: '' },
  { topic: 'Algebra', subtopic: 'Quantum Field Theory' }, // unknown subtopic of known topic
  { topic: 'out_of_scope', subtopic: '' },
]) {
  const r = T.resolve(input);
  if (r === null) ok(`reject ${JSON.stringify(input)}`);
  else fail(`expected reject for ${JSON.stringify(input)}, got ${JSON.stringify(r)}`);
}
/* Cross-topic guard: a Geometry subtopic must not resolve under Algebra */
if (T.resolveSubtopicId('ALGEBRA', 'triangles') === null) ok('cross-topic guard: triangles rejected under Algebra');
else fail('cross-topic guard failed: triangles resolved under Algebra');

/* Problem-type metadata */
if (T.resolveProblemType({ wordProblem: true }) === 'word_problem' &&
    T.resolveProblemType({ wordProblem: false }) === 'concept' &&
    T.resolveProblemType({ rawSubtopic: 'Linear Word Problems' }) === 'word_problem') ok('problem-type resolution');
else fail('problem-type resolution wrong');

console.log(failures ? `\nFAILED: ${failures} check(s)` : '\nAll taxonomy checks passed');
process.exit(failures ? 1 : 0);
