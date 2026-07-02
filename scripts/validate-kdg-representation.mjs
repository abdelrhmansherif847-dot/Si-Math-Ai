#!/usr/bin/env node
/**
 * validate-kdg-representation.mjs — guards for the KDG representation axis.
 * Exit non-zero on any failure. Conforms to
 * docs/roadmap/kdg-multi-axis-architecture.md.
 *
 * Checks:
 *  1. ID integrity      — 7 reps, unique, opaque, enum matches; Assessment gone.
 *  2. Alias integrity   — aliases point at existing ids, pre-normalized; MC/SA
 *                         labels no longer resolve.
 *  3. Resolver sanity   — raw label → id (infographic + Arabic); reject-on-unmapped.
 *  4. Structural tags   — every taxonomy lesson tagged; no orphan tags; afford
 *                         sets reference only real rep ids.
 *  5. Capability (hybrid)— canonical INVALID cases blocked; valid allowed; expert
 *                         override beats the rule; untagged lesson permissive.
 *  6. Affinity          — [0,1] for capable, null for not-capable; learned override.
 *  7. problem_type bridge— unchanged, both directions (round-trip).
 *  8. Edges / describeNode — capable-only, affinity-weighted; two-layer integration.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const T = require(resolve(root, 'taxonomy.core.js'));
globalThis.Taxonomy = T;
const R = require(resolve(root, 'kdg-representation.js'));

let failures = 0;
const fail = (m) => { console.error('  ✗', m); failures++; };
const ok = (m) => console.log('  ✓', m);

/* 1. ID integrity + Assessment removal */
const ids = R.REPRESENTATION_IDS;
if (ids.length === 7) ok('exactly 7 representations (Assessment removed)');
else fail(`expected 7 representations, found ${ids.length}: ${ids.join(', ')}`);
if (new Set(ids).size === ids.length) ok('representation ids unique'); else fail('duplicate id');
if (!ids.includes('MULTIPLE_CHOICE') && !ids.includes('SHORT_ANSWER'))
  ok('Multiple Choice / Short Answer are not representations');
else fail('Assessment ids still present in representations');
const OPAQUE = /^[A-Z][A-Z_]*$/;
if (ids.every((id) => OPAQUE.test(id))) ok('ids opaque UPPER_SNAKE'); else fail('non-opaque id');
const enumMismatch = ids.filter((id) => R.REPRESENTATION[id] !== id)
  .concat(Object.keys(R.REPRESENTATION).filter((k) => !ids.includes(k)));
if (!enumMismatch.length) ok('REPRESENTATION enum matches data'); else fail(`enum drift: ${enumMismatch}`);
if (R.REPRESENTATION_LAYER_VERSION === 2) ok('version bumped to 2'); else fail('version should be 2');

/* 2. Alias integrity */
const idSet = new Set(ids);
let badAlias = 0;
for (const [k, v] of Object.entries(R._aliases)) {
  if (!idSet.has(v)) { fail(`alias "${k}" → unknown id ${v}`); badAlias++; }
  if (R.normalizeKey(k) !== k) { fail(`alias key "${k}" not pre-normalized`); badAlias++; }
}
if (!badAlias) ok(`all ${Object.keys(R._aliases).length} aliases valid + normalized`);

/* 3. Resolver sanity + reject (incl. removed Assessment labels) */
const cases = [
  ['Word Problem', 'WORD_PROBLEM'], ['Normal Equation', 'STANDARD_EQUATION'],
  ['Small Equation', 'SIMPLE_EQUATION'], ['plot', 'GRAPH'], ['جدول', 'TABLE'],
  ['Figure', 'DIAGRAM'], ['real world', 'REAL_LIFE'], ['graph (visual form)', 'GRAPH'],
  // Assessment labels must now REJECT (moved off the representation axis)
  ['MCQ', null], ['multiple choice', null], ['short answer', null], ['grid-in', null],
  // generic rejects
  ['banana', null], ['', null], [null, null],
];
for (const [input, expected] of cases) {
  const got = R.resolveRepresentation(input);
  if (got === expected) ok(`resolve ${JSON.stringify(input)} → ${JSON.stringify(expected)}`);
  else fail(`resolve ${JSON.stringify(input)} → ${JSON.stringify(got)} (expected ${JSON.stringify(expected)})`);
}

/* 4. Structural-tag coverage (no drift vs taxonomy) */
const subIds = new Set(T.SUBTOPICS.map((s) => s.id));
const tagged = R._lessonStructuralType;
const untagged = [...subIds].filter((id) => !tagged[id]);
if (!untagged.length) ok(`every taxonomy lesson (${subIds.size}) has a structural tag`);
else fail(`untagged lessons: ${untagged.join(', ')}`);
const orphanTags = Object.keys(tagged).filter((id) => !subIds.has(id));
if (!orphanTags.length) ok('no orphan structural tags'); else fail(`orphan tags: ${orphanTags.join(', ')}`);
let badAfford = 0;
for (const [type, reps] of Object.entries(R._ruleAffords))
  for (const rep of reps) if (!idSet.has(rep)) { fail(`RULE_AFFORDS[${type}] → unknown rep ${rep}`); badAfford++; }
if (!badAfford) ok('all afford sets reference real representation ids');

/* 5. Capability (hybrid) */
// Canonical INVALID cases from the architecture — must be blocked.
if (R.canRepresent('ALG_001', 'GRAPH') === false) ok('INVALID blocked: Order of Operations → Graph');
else fail('Order of Operations → Graph should be invalid');
if (R.canRepresent('STA_004', 'STANDARD_EQUATION') === false) ok('INVALID blocked: Stem-and-Leaf → Standard Equation');
else fail('Stem-and-Leaf → Standard Equation should be invalid');
// Valid cases.
if (R.canRepresent('ALG_010', 'GRAPH') && R.canRepresent('ALG_010', 'TABLE')) ok('VALID: Quadratics → Graph & Table');
else fail('Quadratics should afford Graph & Table');
// Expert override beats the rule (Complex Numbers → Graph via Argand).
if (R.structuralTypeOf('ALG_005') === 'PROCEDURAL' &&
    R._ruleAffords.PROCEDURAL.indexOf('GRAPH') === -1 &&
    R.canRepresent('ALG_005', 'GRAPH') === true)
  ok('expert override beats rule: Complex Numbers → Graph capable though PROCEDURAL rule excludes it');
else fail('expert override for ALG_005 → Graph not applied');
// Override is surgical (does not open unrelated reps).
if (R.canRepresent('ALG_005', 'DIAGRAM') === false) ok('override is surgical: Complex Numbers → Diagram still blocked');
else fail('override leaked to Diagram');
// capableRepresentations is a strict subset for a tagged lesson.
const capOrder = R.capableRepresentations('ALG_001');
if (capOrder.length < ids.length && !capOrder.includes('GRAPH') && capOrder.includes('SIMPLE_EQUATION'))
  ok(`capableRepresentations(ALG_001) = capable subset [${capOrder.join(', ')}]`);
else fail(`capableRepresentations(ALG_001) wrong: ${capOrder.join(', ')}`);
// Untagged lesson → permissive (capability unknown, not blocked).
if (R.capabilityOf('NOT_A_LESSON', 'GRAPH') === null && R.canRepresent('NOT_A_LESSON', 'GRAPH') === true &&
    R.capableRepresentations('NOT_A_LESSON').length === ids.length)
  ok('untagged lesson is permissive (null capability → allowed)');
else fail('untagged lesson should degrade permissively');
// Invalid rep id is never capable.
if (R.capabilityOf('ALG_010', 'NOPE') === false && !R.canRepresent('ALG_010', 'NOPE')) ok('invalid rep id → not capable');
else fail('invalid rep id should be not-capable');

/* 6. Affinity */
if (R.affinity('ALG_001', 'GRAPH') === null) ok('affinity null for a not-capable pair');
else fail('affinity should be null when not capable');
const aff = R.affinity('ALG_010', 'GRAPH');
if (typeof aff === 'number' && aff >= 0 && aff <= 1) ok(`affinity in [0,1] for a capable pair (${aff})`);
else fail(`affinity out of range: ${aff}`);
// Learned override is read (and clamped).
R._learnedAffinity.ALG_010 = { GRAPH: 0.9, TABLE: 5 /* clamps to 1 */ };
if (R.affinity('ALG_010', 'GRAPH') === 0.9 && R.affinity('ALG_010', 'TABLE') === 1)
  ok('learned affinity read + clamped; ranking reflects it');
else fail('learned affinity not applied/clamped');
const ranked = R.rankedRepresentations('ALG_010');
if (ranked[0] === 'GRAPH' || ranked[0] === 'TABLE') ok(`rankedRepresentations puts high-affinity first (${ranked[0]})`);
else fail(`ranking ignored affinity: ${ranked.join(', ')}`);
delete R._learnedAffinity.ALG_010; // restore cold-start for later checks

/* 7. problem_type bridge (unchanged) */
if (R.fromProblemType('word_problem') === 'WORD_PROBLEM' && R.fromProblemType('concept') === null)
  ok('fromProblemType unchanged'); else fail('fromProblemType changed');
if (R.toProblemType('WORD_PROBLEM') === 'word_problem' && R.toProblemType('REAL_LIFE') === 'word_problem' &&
    R.toProblemType('GRAPH') === 'concept' && R.toProblemType('NOPE') === 'concept')
  ok('toProblemType unchanged'); else fail('toProblemType changed');

/* 8. Edges + describeNode (capable-only, weighted; two-layer view) */
const edges = R.representationEdges('ALG_001');
if (edges.length === capOrder.length && edges.every((e) => e.from === 'ALG_001' && e.relation === 'CAN_BE_REPRESENTED_AS'
    && idSet.has(e.to) && typeof e.weight === 'number'))
  ok('representationEdges are capable-only and affinity-weighted');
else fail('representationEdges shape/weight wrong');
const g = R.describeNode({ lessonId: 'ALG_010', representationId: 'graph' });
const w = R.describeNode({ lessonId: 'ALG_010', representationId: 'Word Problem' });
if (g.knowledge.lessonId === w.knowledge.lessonId && g.knowledge.lessonName === T.displayName('ALG_010') &&
    g.knowledge.structuralType === 'FUNCTIONAL' && g.representation.id === 'GRAPH' && g.capable === true)
  ok('describeNode: same lesson node, capability + structural type surfaced');
else fail(`describeNode wrong: ${JSON.stringify(g)}`);
const invalidNode = R.describeNode({ lessonId: 'ALG_001', representationId: 'graph' });
if (invalidNode.capable === false && invalidNode.affinity === null)
  ok('describeNode reports capable=false / affinity=null for an invalid pair');
else fail('describeNode should mark invalid pair not-capable');

const every = R.allEdges();
const expected = R.lessonIds().reduce((n, l) => n + R.capableRepresentations(l).length, 0);
if (every.length === expected && expected < T.SUBTOPICS.length * ids.length && expected > 0)
  ok(`allEdges materialises capable edges only (${every.length}; < ${T.SUBTOPICS.length * ids.length} universal)`);
else fail(`allEdges count wrong: ${every.length} (expected ${expected})`);

console.log(failures ? `\nFAILED: ${failures} check(s)` : '\nAll KDG representation checks passed');
process.exit(failures ? 1 : 0);
