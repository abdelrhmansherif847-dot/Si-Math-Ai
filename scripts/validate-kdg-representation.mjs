#!/usr/bin/env node
/**
 * validate-kdg-representation.mjs — ARCHITECTURAL INVARIANTS for the KDG
 * representation axis. Conforms to docs/roadmap/kdg-multi-axis-architecture.md.
 *
 * Design (merge criterion 6): assert the architecture's INVARIANTS, not the
 * implementation's incidental values. If the implementation changes but still
 * satisfies the architecture, this must still pass; if the architecture is
 * violated, this must fail. So: no magic numbers (0.5, 158, "7") except the
 * architecture-NAMED representation set and the architecture-NAMED invalid pairs;
 * everything else is checked as a property.
 *
 * Invariants:
 *   A. Representation set == the architecture-named 7; Assessment absent.
 *   B. Resolver: strict, no-passthrough; alias vocabulary integrity.
 *   C. capabilityOf is tri-state; untagged lesson → null (no hidden fallback, crit 2).
 *   D. DETERMINISM (crit 3): learned affinity / runtime data can NEVER change capability.
 *   E. Architecture-named INVALID pairs are not capable.
 *   F. Expert override beats rule (generic over the override table, §6).
 *   G. Strict collapse (§7): isCapable ⇔ capabilityOf===true; capableRepresentations
 *      is exactly the strict set; fail-closed on unknown (untagged ⇒ []).
 *   H. Affinity: null iff not known-capable; [0,1] iff known-capable; learned clamps.
 *   I. Ranking/edges bounded by capability; affinity weights only.
 *   J. problem_type bridge: property-level, unchanged.
 *   K. Stable API / no source leak (crit 4): capabilityOf public; structural type is
 *      NOT a public surface and NOT in describeNode.
 *   L. Bridge integrity (crit 5): every taxonomy lesson tagged; no orphan tags.
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
const ids = R.REPRESENTATION_IDS;
const idSet = new Set(ids);
const lessons = T.SUBTOPICS.map((s) => s.id);

/* A. Representation set (architecture-named) + Assessment absent (§2, §2.2) */
const ARCHITECTURE_REPS = ['WORD_PROBLEM', 'STANDARD_EQUATION', 'SIMPLE_EQUATION', 'GRAPH', 'TABLE', 'DIAGRAM', 'REAL_LIFE'];
if (ids.length === ARCHITECTURE_REPS.length && ARCHITECTURE_REPS.every((id) => idSet.has(id)))
  ok('representation set == the architecture-named seven');
else fail(`representation set drifted from architecture: ${ids.join(', ')}`);
if (['MCQ', 'multiple choice', 'short answer', 'grid-in'].every((s) => R.resolveRepresentation(s) === null))
  ok('Assessment labels (MC / Short Answer / Grid-in) are not representations');
else fail('an Assessment label still resolves to a representation');

/* B. Resolver + alias vocabulary integrity */
if (R.resolveRepresentation('banana') === null && R.resolveRepresentation('') === null &&
    R.resolveRepresentation(null) === null && ids.every((id) => R.resolveRepresentation(id) === id) &&
    R.resolveRepresentation('graph (visual form)') === 'GRAPH')
  ok('resolver: strict reject, id/paren tolerant, no passthrough');
else fail('resolver contract violated');
let badAlias = 0;
for (const [k, v] of Object.entries(R._aliases)) {
  if (!idSet.has(v)) { fail(`alias "${k}" → unknown id ${v}`); badAlias++; }
  if (R.normalizeKey(k) !== k) { fail(`alias key "${k}" not pre-normalized`); badAlias++; }
}
if (!badAlias) ok('every alias resolves to a real id and is pre-normalized');

/* C. capabilityOf tri-state; untagged → null (crit 2: no hidden fallback) */
let triOK = true;
for (const l of lessons) for (const r of ids) {
  const c = R.capabilityOf(l, r);
  if (c !== true && c !== false && c !== null) { triOK = false; }
  if (c === null) { fail(`tagged lesson ${l} returned null capability (coverage gap)`); }
}
if (triOK) ok('capabilityOf is tri-state {true,false,null} for every lesson × rep');
else fail('capabilityOf returned a non-tri-state value');
if (R.capabilityOf('NOT_A_LESSON', 'GRAPH') === null && R.capabilityOf('ALG_010', 'NOT_A_REP') === false)
  ok('untagged lesson → null (unknown); invalid rep → false (no hidden allow/deny)');
else fail('unknown-input capability policy wrong');

/* D. DETERMINISM (crit 3): learned affinity / runtime data can NEVER change capability */
const snapshot = () => lessons.map((l) => l + ':' + R.capableRepresentations(l).join(',')).join('|');
const before = snapshot();
// Adversarially inject learned affinity on BOTH an invalid and a valid pair.
R._learnedAffinity.ALG_001 = { GRAPH: 1, DIAGRAM: 1 };   // ALG_001→GRAPH is INVALID
R._learnedAffinity.ALG_010 = { WORD_PROBLEM: 1 };        // valid pair, extreme weight
const after = snapshot();
const invariantHeld = before === after &&
  R.capabilityOf('ALG_001', 'GRAPH') === false && !R.isCapable('ALG_001', 'GRAPH') &&
  !R.capableRepresentations('ALG_001').includes('GRAPH') &&
  R.affinity('ALG_001', 'GRAPH') === null &&
  !R.rankedRepresentations('ALG_001').includes('GRAPH') &&
  !R.representationEdges('ALG_001').some((e) => e.to === 'GRAPH');
if (invariantHeld) ok('DETERMINISM: learned affinity can never make an invalid representation valid or appear');
else fail('learned affinity leaked into capability (criterion 3 violated)');
R._learnedAffinity.ALG_001 = undefined; delete R._learnedAffinity.ALG_001; // restore

/* E. Architecture-named INVALID pairs (§2.1) are not capable */
if (R.capabilityOf('ALG_001', 'GRAPH') === false && R.capabilityOf('STA_004', 'STANDARD_EQUATION') === false)
  ok('architecture-named invalid pairs blocked (Order-of-Ops→Graph, Stem-and-Leaf→Standard-Equation)');
else fail('an architecture-named invalid pair is capable');

/* F. Expert override beats rule — generic over the whole override table (§6) */
let overrideOK = true, sawOverrideThatContradictsRule = false;
for (const [lesson, ov] of Object.entries(R._expertOverrides)) {
  const type = R._lessonStructuralType[lesson];
  const affords = (R._ruleAffords[type] || []);
  for (const [rep, val] of Object.entries(ov)) {
    if (R.capabilityOf(lesson, rep) !== (val === true)) { overrideOK = false; fail(`override ${lesson}/${rep} not honoured`); }
    if ((val === true) !== (affords.indexOf(rep) !== -1)) sawOverrideThatContradictsRule = true;
  }
}
if (overrideOK && sawOverrideThatContradictsRule)
  ok('expert override takes precedence over the rule (and at least one genuinely contradicts it)');
else if (overrideOK) fail('override table present but none exercises precedence (add a rule-contradicting case)');

/* G. Strict collapse (§7): isCapable ⇔ capabilityOf===true; list == strict set; fail-closed */
let strictOK = true;
for (const l of lessons.concat(['NOT_A_LESSON'])) {
  const cap = R.capableRepresentations(l);
  for (const r of ids) {
    const strict = R.capabilityOf(l, r) === true;
    if (R.isCapable(l, r) !== strict) strictOK = false;
    if (cap.includes(r) !== strict) strictOK = false;
  }
}
if (strictOK && R.capableRepresentations('NOT_A_LESSON').length === 0)
  ok('strict collapse: isCapable⇔true, capableRepresentations==strict set, untagged⇒[] (fail-closed)');
else fail('strict collapse / fail-closed policy violated (§7)');

/* H. Affinity: null iff not known-capable; [0,1] iff known-capable; learned clamps */
let affOK = true;
for (const l of lessons) for (const r of ids) {
  const a = R.affinity(l, r), cap = R.capabilityOf(l, r) === true;
  if (cap) { if (!(typeof a === 'number' && a >= 0 && a <= 1)) affOK = false; }
  else { if (a !== null) affOK = false; }
}
R._learnedAffinity.ALG_010 = { GRAPH: 5, WORD_PROBLEM: -3 };
const clamps = R.affinity('ALG_010', 'GRAPH') === 1 && R.affinity('ALG_010', 'WORD_PROBLEM') === 0;
delete R._learnedAffinity.ALG_010;
if (affOK && clamps) ok('affinity: null iff not known-capable, [0,1] iff capable, learned clamped');
else fail('affinity range/definition invariant violated');

/* I. Ranking + edges bounded by capability; weights are affinity */
let boundOK = true;
for (const l of lessons) {
  const cap = new Set(R.capableRepresentations(l));
  const ranked = R.rankedRepresentations(l);
  if (ranked.length !== cap.size || !ranked.every((r) => cap.has(r))) boundOK = false;
  for (let i = 1; i < ranked.length; i++) if (R.affinity(l, ranked[i - 1]) < R.affinity(l, ranked[i])) boundOK = false;
  for (const e of R.representationEdges(l)) {
    if (!cap.has(e.to) || e.relation !== 'CAN_BE_REPRESENTED_AS' || e.weight !== R.affinity(l, e.to)) boundOK = false;
  }
}
const allE = R.allEdges();
if (boundOK && allE.every((e) => R.isCapable(e.from, e.to)) && allE.length < lessons.length * ids.length && allE.length > 0)
  ok('ranking & edges are capability-bounded, affinity-weighted, and capability actually filters');
else fail('ranking/edge capability-bound invariant violated');

/* J. problem_type bridge — property-level, unchanged */
let bridgeOK = R.fromProblemType('word_problem') === 'WORD_PROBLEM' && R.fromProblemType('concept') === null;
for (const r of ids) {
  const pt = R.toProblemType(r);
  if (pt !== REP_LEGACY(r)) bridgeOK = false;
  if (pt !== 'word_problem' && pt !== 'concept') bridgeOK = false;
}
function REP_LEGACY(id) { return R.REPRESENTATIONS.find((x) => x.id === id).legacyProblemType; }
if (bridgeOK && R.toProblemType('NOT_A_REP') === 'concept') ok('problem_type bridge unchanged (property-level)');
else fail('problem_type bridge invariant violated');

/* K. Stable API / no source leak (crit 4) */
const node = R.describeNode({ lessonId: 'ALG_010', representationId: 'graph' });
const knowledgeKeys = Object.keys(node.knowledge).sort().join(',');
if (typeof R.capabilityOf === 'function' && R.structuralTypeOf === undefined && R.STRUCTURAL_TYPE === undefined &&
    !('structuralType' in node.knowledge) && !JSON.stringify(node).includes('STRUCTURAL') && knowledgeKeys === 'lessonId,lessonName')
  ok('stable API: capability reached only via capabilityOf; structural type is not a public surface');
else fail(`structural-type source leaked into the public API / describeNode (${knowledgeKeys})`);
// two-layer view holds
const n2 = R.describeNode({ lessonId: 'ALG_010', representationId: 'Word Problem' });
if (node.knowledge.lessonId === n2.knowledge.lessonId && node.knowledge.lessonName === T.displayName('ALG_010') &&
    node.representation.id === 'GRAPH' && node.capable === true)
  ok('describeNode: same lesson node across representations; capability surfaced');
else fail('describeNode two-layer view wrong');

/* L. Bridge integrity (crit 5): coverage + no orphans (guards the temporary map) */
const subSet = new Set(lessons);
const untagged = lessons.filter((id) => !R._lessonStructuralType[id]);
const orphans = Object.keys(R._lessonStructuralType).filter((id) => !subSet.has(id));
let badAfford = 0;
for (const [t, reps] of Object.entries(R._ruleAffords)) for (const r of reps) if (!idSet.has(r)) badAfford++;
if (!untagged.length && !orphans.length && !badAfford)
  ok('bridge integrity: every taxonomy lesson tagged, no orphan tags, afford sets valid');
else fail(`bridge drift — untagged:[${untagged}] orphans:[${orphans}] badAfford:${badAfford}`);

console.log(failures ? `\nFAILED: ${failures} invariant(s)` : '\nAll KDG representation invariants hold');
process.exit(failures ? 1 : 0);
