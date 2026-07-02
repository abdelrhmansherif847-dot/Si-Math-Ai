#!/usr/bin/env node
/**
 * validate-kdg-representation.mjs — guards for the KDG representation layer.
 * Exit non-zero on any failure (run manually / as a CI gate, like
 * validate-taxonomy.mjs).
 *
 * Checks:
 *  1. ID integrity     — ids unique, opaque UPPER_SNAKE, enum matches data.
 *  2. Alias integrity  — every alias points at an existing id; no id/alias clash.
 *  3. Resolver sanity  — raw label → id (incl. infographic + Arabic wording).
 *  4. Reject-on-unmapped — unknown / blank labels resolve to null (no guess).
 *  5. Universal rule   — every lesson gets every representation; canRepresent.
 *  6. problem_type bridge — round-trips with the legacy binary, both directions.
 *  7. Two-layer bridge — describeNode integrates the taxonomy when present.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// Make the taxonomy visible to the representation module's optional bridge,
// exactly as a browser would (both are globals). Load taxonomy FIRST.
const T = require(resolve(root, 'taxonomy.core.js'));
globalThis.Taxonomy = T;
const R = require(resolve(root, 'kdg-representation.js'));

let failures = 0;
const fail = (m) => { console.error('  ✗', m); failures++; };
const ok = (m) => console.log('  ✓', m);

/* 1. ID integrity */
const ids = R.REPRESENTATION_IDS;
if (new Set(ids).size === ids.length) ok(`all ${ids.length} representation ids unique`);
else fail('duplicate representation id detected');

if (ids.length === 9) ok('exactly 9 representations defined');
else fail(`expected 9 representations, found ${ids.length}`);

const OPAQUE = /^[A-Z][A-Z_]*$/;
const badOpaque = ids.filter((id) => !OPAQUE.test(id));
if (!badOpaque.length) ok('all representation ids are opaque UPPER_SNAKE');
else badOpaque.forEach((id) => fail(`representation id "${id}" is not UPPER_SNAKE`));

const enumMismatch = ids.filter((id) => R.REPRESENTATION[id] !== id)
  .concat(Object.keys(R.REPRESENTATION).filter((k) => !ids.includes(k)));
if (!enumMismatch.length) ok('REPRESENTATION enum matches REPRESENTATIONS data');
else fail(`REPRESENTATION enum drift: ${enumMismatch.join(', ')}`);

const missingDisplay = R.REPRESENTATIONS.filter((r) => !r.displayName || !r.description);
if (!missingDisplay.length) ok('every representation has a displayName + description');
else missingDisplay.forEach((r) => fail(`representation ${r.id} missing displayName/description`));

/* 2. Alias integrity */
const idSet = new Set(ids);
let badAlias = 0;
for (const [k, v] of Object.entries(R._aliases)) {
  if (!idSet.has(v)) { fail(`alias "${k}" → unknown id ${v}`); badAlias++; }
  if (normalizeSelf(k) !== k) { fail(`alias key "${k}" is not pre-normalized`); badAlias++; }
}
if (!badAlias) ok(`all ${Object.keys(R._aliases).length} aliases valid + normalized`);
function normalizeSelf(s) { return R.normalizeKey(s); }

/* 3. Resolver sanity — raw label → expected id */
const cases = [
  ['Word Problem', 'WORD_PROBLEM'],
  ['word_problem', 'WORD_PROBLEM'],
  ['مسألة كلامية', 'WORD_PROBLEM'],
  ['Normal Equation', 'STANDARD_EQUATION'],   // infographic wording
  ['Standard Form', 'STANDARD_EQUATION'],
  ['equation', 'STANDARD_EQUATION'],
  ['Small Equation', 'SIMPLE_EQUATION'],       // infographic wording
  ['x + 3 = 7 style', null],                   // free text, not a label → reject
  ['simple', 'SIMPLE_EQUATION'],
  ['Graph', 'GRAPH'],
  ['plot', 'GRAPH'],
  ['chart', 'GRAPH'],
  ['Table of values', 'TABLE'],
  ['جدول', 'TABLE'],
  ['Figure', 'DIAGRAM'],
  ['geometry diagram', 'DIAGRAM'],
  ['Real-life Scenario', 'REAL_LIFE'],
  ['real world', 'REAL_LIFE'],
  ['MCQ', 'MULTIPLE_CHOICE'],
  ['multiple-choice question', 'MULTIPLE_CHOICE'],
  ['Grid-in', 'SHORT_ANSWER'],
  ['free response', 'SHORT_ANSWER'],
  ['GRAPH', 'GRAPH'],                          // already-an-id passthrough (case-insensitive)
  ['graph (visual form)', 'GRAPH'],            // trailing parens stripped
];
for (const [input, expected] of cases) {
  const got = R.resolveRepresentation(input);
  if (got === expected) ok(`resolve ${JSON.stringify(input)} → ${JSON.stringify(expected)}`);
  else fail(`resolve ${JSON.stringify(input)} → ${JSON.stringify(got)} (expected ${JSON.stringify(expected)})`);
}

/* 4. Reject-on-unmapped */
for (const bad of ['', null, undefined, 'banana', 'calculus', 'xyz']) {
  if (R.resolveRepresentation(bad) === null) ok(`reject ${JSON.stringify(bad)}`);
  else fail(`expected reject for ${JSON.stringify(bad)}, got ${JSON.stringify(R.resolveRepresentation(bad))}`);
}

/* 5. Universal rule — every lesson gets every representation */
const forQuad = R.representationsForLesson('ALG_010');
if (forQuad.length === ids.length && ids.every((id) => forQuad.includes(id)))
  ok('representationsForLesson(ALG_010) returns all representations');
else fail(`representationsForLesson(ALG_010) incomplete: ${JSON.stringify(forQuad)}`);

const forUnknownLesson = R.representationsForLesson('NON_EXISTENT_LESSON');
if (forUnknownLesson.length === ids.length)
  ok('universal rule holds even for an unknown lesson id');
else fail('representationsForLesson should be lesson-agnostic (universal)');

let badCan = 0;
for (const id of ids) if (!R.canRepresent('ALG_010', id)) { fail(`canRepresent(ALG_010, ${id}) should be true`); badCan++; }
if (R.canRepresent('ALG_010', 'NOPE')) { fail('canRepresent should reject an invalid representation id'); badCan++; }
if (!badCan) ok('canRepresent true for every valid representation, false for invalid');

const edges = R.representationEdges('ALG_010');
if (edges.length === ids.length && edges.every((e) => e.from === 'ALG_010' && e.relation === 'CAN_BE_REPRESENTED_AS' && idSet.has(e.to)))
  ok('representationEdges(ALG_010) fans out one valid edge per representation');
else fail('representationEdges shape wrong');

/* 6. problem_type bridges (round-trip with the legacy binary) */
if (R.fromProblemType('word_problem') === 'WORD_PROBLEM') ok("fromProblemType('word_problem') → WORD_PROBLEM");
else fail("fromProblemType('word_problem') wrong");
if (R.fromProblemType('concept') === null) ok("fromProblemType('concept') → null (ambiguous, no guess)");
else fail("fromProblemType('concept') should be null");
if (R.toProblemType('WORD_PROBLEM') === 'word_problem') ok("toProblemType('WORD_PROBLEM') → word_problem");
else fail("toProblemType('WORD_PROBLEM') wrong");
if (R.toProblemType('REAL_LIFE') === 'word_problem') ok("toProblemType('REAL_LIFE') → word_problem");
else fail("toProblemType('REAL_LIFE') wrong");
let badBinary = 0;
for (const id of ids) {
  const pt = R.toProblemType(id);
  if (pt !== 'word_problem' && pt !== 'concept') { fail(`toProblemType(${id}) → ${pt} (must be a legacy binary value)`); badBinary++; }
}
if (!badBinary) ok('every representation collapses to a valid legacy problem_type');
if (R.toProblemType('NOPE') === 'concept') ok("toProblemType(unknown) → 'concept' (safe default)");
else fail('toProblemType(unknown) should default to concept');

/* 7. Two-layer bridge — same lesson, different representation ⇒ same knowledge */
const asGraph = R.describeNode({ lessonId: 'ALG_010', representationId: 'graph' });
const asWord = R.describeNode({ lessonId: 'ALG_010', representationId: 'Word Problem' });
if (asGraph.knowledge.lessonId === asWord.knowledge.lessonId &&
    asGraph.knowledge.lessonName === asWord.knowledge.lessonName &&
    asGraph.representation.id === 'GRAPH' && asWord.representation.id === 'WORD_PROBLEM')
  ok('describeNode: same lesson node, different representation (layers are independent)');
else fail(`describeNode two-layer separation wrong: ${JSON.stringify({ asGraph, asWord })}`);

if (asGraph.knowledge.lessonName === T.displayName('ALG_010'))
  ok(`describeNode enriches lesson name from taxonomy ("${asGraph.knowledge.lessonName}")`);
else fail('describeNode did not integrate taxonomy display name');

const everyEdge = R.allEdges();
const expectedEdgeCount = T.SUBTOPICS.length * ids.length;
if (everyEdge.length === expectedEdgeCount)
  ok(`allEdges materialises the full universal layer (${T.SUBTOPICS.length} lessons × ${ids.length} reps = ${expectedEdgeCount} edges)`);
else fail(`allEdges expected ${expectedEdgeCount} edges, got ${everyEdge.length}`);

console.log(failures ? `\nFAILED: ${failures} check(s)` : '\nAll KDG representation checks passed');
process.exit(failures ? 1 : 0);
