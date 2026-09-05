// The DSAT Question Knowledge Base: schema, fingerprints, duplicate detection
// and — mostly — the guards.
//
// A validator that has never rejected anything is decoration. Every guard below
// is fired against a record built to trip exactly it, because the whole value of
// this layer is that a bad record cannot be written quietly. The fixtures are
// FABRICATED for these tests: no real question, from any source, appears here.

import * as S from '../scripts/dsat-kb/schema.mjs';
import { validateRecord, validateArchetype } from '../scripts/dsat-kb/validate-record.mjs';
import {
  structuralFingerprint, mathematicalFingerprint, components,
  eraseNumerals, jaccard, classifyPair, groupDuplicates, canonical,
} from '../scripts/dsat-kb/fingerprint.mjs';
import { ARCHETYPE_FIELDS } from '../scripts/dsat-kb/registry.mjs';

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log(`  ok  ${msg}`); } else { failed++; console.log(`  FAIL  ${msg}`); } };

const CTX = {
  sourceIds: new Set(['S-001']),
  archetypeIds: new Set(['A-PARAM-REVERSAL', 'A-UNCLASSIFIED']),
  seenIds: new Set(),
};

// A well-formed fabricated record. Fingerprints are computed, never typed.
function fixture(over = {}) {
  const sig = {
    objects: ['linear_equation_one_unknown'],
    relations: ['a*x + b = c'],
    given_roles: ['coefficient', 'constant', 'target_value'],
    asked_role: 'parameter',
    constraints: [],
  };
  const base = {
    question_id: 'Q-001-p3-q7',
    source_id: 'S-001', source_file: 'fixture.pdf', source_page: 3, source_question_number: '7',
    provenance: 'third_party', provenance_confidence: 'OBSERVED',
    exam: 'DSAT', topic: 'Linear Equations',
    taxonomy_subtopics: ['ALG_006'], knowledge_nodes: ['N-LINEQ'], kdg_confidence: 'INFERRED',
    representation: 'symbolic_algebraic', target_type: 'parameter',
    archetype: 'A-PARAM-REVERSAL', archetype_confidence: 'INFERRED',
    reasoning_mechanisms: [
      { id: 'reversal', load_bearing: true, counterfactual: 'solving forward yields x, not the asked parameter' },
      { id: 'hidden_step', load_bearing: false },
    ],
    distractor_logic: [
      { option: 'A', category: 'reversal_error', wrong_route: 'solves for x and reports it' },
      { option: 'B', category: 'sign_error', wrong_route: 'moves the constant without changing sign' },
      { option: 'C', category: 'unknown' },
    ],
    difficulty_evidence: { kind: 'INFERRED', band: 'medium', structural_basis: 'reversal is load-bearing' },
    difficulty_confidence: 'INFERRED',
    answer_structure: 'mcq_4', stimulus_type: 'none',
    mathematical_signature: sig,
    step_count: 3,
    ...over,
  };
  if (!('structural_fingerprint' in over)) base.structural_fingerprint = structuralFingerprint(base);
  if (!('mathematical_fingerprint' in over)) base.mathematical_fingerprint = mathematicalFingerprint(base.mathematical_signature);
  if (!('fingerprint_components' in over)) base.fingerprint_components = components(base, base.mathematical_signature);
  return base;
}

console.log('\n── the fixture is valid, so every failure below is the guard, not the fixture ──');
{
  const bad = validateRecord(fixture(), CTX);
  ok(bad.length === 0, 'a well-formed record validates clean' + (bad.length ? ` — ${bad[0]}` : ''));
}

console.log('\n── shape and identity ──');
const rejects = (over, needle, msg, ctx = CTX) => {
  const bad = validateRecord(fixture(over), ctx);
  ok(bad.some(b => b.includes(needle)), msg + (bad.length ? '' : '  [NOTHING REJECTED]'));
};
rejects({ provenance: undefined }, 'missing required field "provenance"', 'missing provenance is rejected');
rejects({ source_page: undefined }, 'source_page must be', 'missing source page is rejected');
rejects({ source_page: 0 }, 'source_page must be', 'a zero source page is rejected');
rejects({ source_id: 'S-999' }, 'not in the source registry', 'an unregistered source_id is rejected');
rejects({ question_id: 'Q7' }, 'not of the form', 'a malformed question_id is rejected');
rejects({ stem: 'What is x?' }, 'unknown field', 'an unknown field is rejected outright');
{
  const seen = new Set(['Q-001-p3-q7']);
  const bad = validateRecord(fixture(), { ...CTX, seenIds: seen });
  ok(bad.some(b => b.includes('duplicate question_id')), 'a duplicate question_id is rejected');
}

console.log('\n── vocabulary bound to the frozen taxonomy and the published KDG ──');
rejects({ topic: 'Trigonometry' }, 'is not a topic of DSAT', 'an ST1-only topic on a DSAT record is rejected');
rejects({ topic: 'Calculus' }, 'is not a topic of DSAT', 'an invented topic is rejected');
rejects({ taxonomy_subtopics: ['ALG_999'] }, 'does not exist in the frozen taxonomy', 'an invalid taxonomy subtopic is rejected');
rejects({ knowledge_nodes: ['N-NOPE'] }, 'does not exist', 'an invalid KDG node is rejected');
rejects({ representation: 'vibes' }, 'representation "vibes"', 'an invalid representation is rejected');
rejects({ answer_structure: 'mcq_7' }, 'answer_structure', 'an invalid answer structure is rejected');
rejects({ provenance_confidence: 'PROBABLY' }, 'provenance_confidence', 'an invalid confidence label is rejected');
rejects({ provenance_confidence: undefined }, 'missing required field', 'a missing confidence label is rejected');

console.log('\n── invented relationships need a conflict, not silence ──');
rejects({ knowledge_nodes: ['N-QUAD'] }, 'invented KDG relationship',
  'a KDG node outside the published mapping is rejected as invented');
{
  const bad = validateRecord(fixture({ knowledge_nodes: ['N-QUAD'], conflicts: ['KDG_MAPPING_CONFLICT'] }), CTX);
  ok(bad.length === 0, '…and accepted once a KDG_MAPPING_CONFLICT is recorded on the record');
}
rejects({ taxonomy_subtopics: ['GEO_001'] }, 'outside the published mapping',
  'a taxonomy subtopic outside the published mapping is rejected');
rejects({ conflicts: ['MADE_UP'] }, 'is not one of the register', 'an invented conflict kind is rejected');

console.log('\n── the dedicated topics stay distinct, and the collision stays visible ──');
{
  const row = S.EXAM_TOPIC_TAXONOMY.filter(r => ['Mean', 'Median', 'Mode'].includes(r.topic));
  ok(row.length === 3, 'Mean, Median and Mode are three separate exam-topic rows');
  ok(row.every(r => r.subtopics.join() === 'STA_002'), '…all landing on the one frozen subtopic STA_002');
  ok(row.every(r => r.conflict === true), '…each flagged as a taxonomy conflict rather than collapsed');
  const asym = S.EXAM_TOPIC_TAXONOMY.find(r => r.topic === 'Asymptote');
  ok(asym?.conflict === true, 'Asymptote is flagged: it is a dedicated topic with no subtopic of its own');
  const wp = S.EXAM_TOPIC_TAXONOMY.find(r => r.topic === 'Word Problems / Mixed');
  ok(wp?.subtopics.length === 0 && wp.conflict, 'Word Problems / Mixed has no taxonomy home, and says so');
}

console.log('\n── support: a claim needs the evidence its level implies ──');
rejects({ provenance: 'official_college_board' }, 'requires provenance_evidence',
  'an official provenance without evidence is rejected — no silent upgrade');
{
  const bad = validateRecord(fixture({ provenance: 'official_college_board', provenance_evidence: 'College Board practice test 4, p.12' }), CTX);
  ok(bad.length === 0, '…and accepted with evidence');
}
rejects({ provenance: 'real_released_practice', provenance_confidence: 'UNKNOWN', provenance_evidence: 'x' },
  'confidence is UNKNOWN', 'a released-practice grade with UNKNOWN confidence is rejected');
rejects({ difficulty_evidence: { kind: 'UNKNOWN', band: 'hard' } }, 'unsupported difficulty claim',
  'a difficulty band asserted on UNKNOWN evidence is rejected');
rejects({ difficulty_evidence: { kind: 'INFERRED', band: 'hard' } }, 'no structural basis',
  'an inferred difficulty with no structural basis is rejected');
rejects({ difficulty_evidence: { kind: 'SOURCE-STATED', band: 'hard' } }, 'no source statement',
  'a source-stated difficulty with nothing quoted is rejected');
rejects({ archetype_confidence: 'UNKNOWN' }, 'use A-UNCLASSIFIED',
  'an archetype named at UNKNOWN confidence is rejected');
rejects({ archetype: 'A-INVENTED' }, 'not in the archetype registry', 'an unregistered archetype is rejected');

console.log('\n── mechanisms: steps are not one, and load-bearing means something ──');
for (const notMech of S.NOT_MECHANISMS)
  ok(!S.MECHANISM_IDS.includes(notMech), `"${notMech}" is not in the mechanism registry`);
rejects({ reasoning_mechanisms: [{ id: 'steps', load_bearing: true, counterfactual: 'x' }] },
  'not a reasoning mechanism', '"steps" as a mechanism is rejected by name');
rejects({ reasoning_mechanisms: [{ id: 'reversal', load_bearing: true }] }, 'no counterfactual',
  'load-bearing without a counterfactual is rejected');
{
  const bad = validateRecord(fixture({ reasoning_mechanisms: [{ id: 'reversal', load_bearing: false }] }), CTX);
  ok(bad.length === 0, 'a non-load-bearing mechanism needs no counterfactual');
}
rejects({ reasoning_mechanisms: [{ id: 'telepathy', load_bearing: false }] }, 'not in the registry',
  'an invented mechanism is rejected');

console.log('\n── distractors: a category without a route is a guess ──');
rejects({ distractor_logic: [{ option: 'A', category: 'sign_error' }] }, 'without the wrong route',
  'a distractor category with no wrong route is rejected');
{
  const bad = validateRecord(fixture({ distractor_logic: [{ option: 'A', category: 'unknown' }] }), CTX);
  ok(bad.length === 0, '…and "unknown" is accepted with no route, which is the point of having it');
}
rejects({ distractor_logic: [{ option: 'A', category: 'bad_vibes', wrong_route: 'x' }] }, 'not in the taxonomy',
  'an invented distractor category is rejected');

console.log('\n── copyright hygiene: no question text, in any field ──');
for (const f of ['question_text', 'options', 'solution', 'passage'])
  rejects({ [f]: 'x' }, 'unknown field', `a "${f}" field is refused by the schema`);
rejects({ source_notes: 'A machine produces 12 widgets per hour and runs for h hours before a fault occurs, at which point production halves for the remainder of the shift; what is the total output?' },
  'looks like source prose', 'a stem smuggled into a notes field is caught by length');
rejects({ inference_notes: 'What is the value of x when the parameter is doubled?' },
  'looks like source prose', 'a short question smuggled into notes is caught by its question mark');
{
  const bad = validateRecord(fixture({ source_notes: 'table has 4 rows, 3 columns' }), CTX);
  ok(bad.length === 0, 'a short structural note is allowed — the guard is not a blanket ban on strings');
}
rejects({ mathematical_signature: { objects: ['linear'], relations: ['3*x + 7 = 22'], given_roles: [], asked_role: 'value', constraints: [] },
  mathematical_fingerprint: undefined },
  'literal numerals', 'a signature carrying the printed numbers is rejected');

console.log('\n── fingerprints ──');
ok(eraseNumerals('3x + 7 = 22') === eraseNumerals('5x + 2 = 17'), 'renumbering erases to the same schematic');
ok(eraseNumerals('x^2 - 5x + 6') !== eraseNumerals('x - 5'), 'a different structure does not erase to the same schematic');
ok(canonical({ b: 1, a: [2, 1] }) === canonical({ a: [1, 2], b: 1 }), 'canonical JSON is order-independent');
rejects({ structural_fingerprint: 'nothex' }, 'malformed', 'a malformed fingerprint is rejected');
rejects({ structural_fingerprint: '0'.repeat(16) }, 'does not match the record',
  'a fingerprint that does not recompute is rejected');
rejects({ fingerprint_components: ['wrong'] }, 'do not match the record', 'stale components are rejected');
{
  const a = fixture();
  const b = fixture({ question_id: 'Q-001-p9-q2', source_page: 9 });
  ok(a.mathematical_fingerprint === b.mathematical_fingerprint,
    'the same construction on a different page shares a mathematical fingerprint');
  const c = fixture({
    question_id: 'Q-001-p9-q3', source_page: 9,
    topic: 'Quadratic Equations', taxonomy_subtopics: ['ALG_010'], knowledge_nodes: ['N-QUAD'],
    mathematical_signature: { objects: ['quadratic_equation'], relations: ['a*x^2 + b*x + c = 0'], given_roles: ['coefficient'], asked_role: 'value', constraints: [] },
    mathematical_fingerprint: undefined, fingerprint_components: undefined, structural_fingerprint: undefined,
  });
  ok(a.mathematical_fingerprint !== c.mathematical_fingerprint, 'a different construction does not collide');
  ok(classifyPair(a, b).relation === 'duplicate_or_renumbered', 'the pair is classified as duplicate-or-renumbered');
  ok(classifyPair(a, c).relation !== 'duplicate_or_renumbered', 'a genuinely different item is not');
  ok(jaccard(a.fingerprint_components, a.fingerprint_components) === 1, 'a record is identical to itself');
}

console.log('\n── duplicates are grouped, never deleted ──');
{
  const recs = [fixture(), fixture({ question_id: 'Q-001-p9-q2', source_page: 9 }),
    fixture({ question_id: 'Q-001-p4-q1', source_page: 4 })];
  const groups = groupDuplicates(recs);
  ok(groups.length === 1, 'three renumbered variants form one group');
  ok(groups[0].members.length === 3, '…containing all three');
  ok(recs.length === 3, '…and no record was removed');
  ok(groups[0].relation === 'duplicate_or_renumbered', '…labelled by the relation that put them together');
}

console.log('\n── archetypes are constructions, not topic labels ──');
{
  const good = Object.fromEntries(ARCHETYPE_FIELDS.map(f => [f, 'stated']));
  ok(validateArchetype({ archetype_id: 'A-PARAM-REVERSAL', label: 'parameter recovered by reversing the solve', ...good }).length === 0,
    'a fully specified construction validates');
  for (const f of ARCHETYPE_FIELDS) {
    const missing = { ...good }; delete missing[f];
    ok(validateArchetype({ archetype_id: 'A-X', label: 'something', ...missing }).some(b => b.includes(f)),
      `an archetype missing "${f}" is rejected`);
  }
  ok(validateArchetype({ archetype_id: 'A-X', label: 'Linear Equations', ...good }).some(b => b.includes('topic name')),
    'an archetype labelled with an exam topic name is rejected');
  ok(validateArchetype({ archetype_id: 'A-X', label: 'Quadratic Equations & Functions', ...good }).some(b => b.includes('topic name')),
    'an archetype labelled with a taxonomy subtopic name is rejected');
  ok(validateArchetype({ archetype_id: 'nope', label: 'x', ...good }).some(b => b.includes('malformed')),
    'a malformed archetype id is rejected');
}

console.log('\n── stimulus relationships ──');
rejects({ stimulus_type: 'table' }, 'carries no stimulus_id', 'a stimulus without an id is rejected');
rejects({ stimulus_type: 'none', stimulus_id: 'ST-1' }, 'stimulus_id given while', 'an orphan stimulus id is rejected');
{
  const bad = validateRecord(fixture({ stimulus_type: 'table', stimulus_id: 'ST-001', representation: 'table' }), CTX);
  ok(bad.length === 0, 'a stimulus-backed record with an id validates');
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
