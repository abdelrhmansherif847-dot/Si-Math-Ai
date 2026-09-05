// Registry-level regression coverage for the DSAT KB gate, and for the corpus
// boundary that now runs at ingestion time.
//
// Every assertion names the STABLE GUARD CODE it expects. That matters more than
// it looks: a test that only asserts "something failed" passes when the wrong
// guard fires, and during the build a mutation meant to test the text-leak guard
// went red for a missing source_id instead. Codes make the test say which
// protection it is proving.
//
// Fixtures are fabricated. No real question, from any source, appears here.

import { gate } from '../scripts/dsat-kb/gate.mjs';
import { insideRepo, assertCorpusOutsideRepo, REPO_ROOT } from '../scripts/dsat-kb/registry.mjs';
import { SIMILARITY, SIMILARITY_THRESHOLDS, structuralFingerprint, mathematicalFingerprint }
  from '../scripts/dsat-kb/fingerprint.mjs';
import { TAXONOMY_SUBTOPICS, KDG_NODE_IDS } from '../scripts/dsat-kb/schema.mjs';
import { join } from 'node:path';

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log(`  ok  ${msg}`); } else { failed++; console.log(`  FAIL  ${msg}`); } };

// The eight taxonomy conflicts the mapping requires, in minimal form.
const CONFLICTS = ['Graphs (Data)', 'Tables (Data)', 'Mean', 'Median', 'Mode',
  'Interquartile Range', 'Asymptote', 'Word Problems / Mixed'].map((t, i) => ({
  conflict_id: `TAX-${String(i + 1).padStart(4, '0')}`, kind: 'TAXONOMY_CONFLICT',
  status: 'open', about: `exam topic "${t}" against the frozen taxonomy`,
  statement_a: 'a', statement_b: 'b',
}));

const clean = (over = {}) => ({ sources: [], questions: [], archetypes: [], conflicts: CONFLICTS, raw: {}, ...over });
const codes = res => res.map(f => f.code);
// Asserts the NAMED guard fired — not merely that something did.
const fires = (code, stores, msg) => {
  const c = codes(gate(clean(stores)));
  ok(c.includes(code), `${msg}  [${code}]` + (c.length ? '' : '  <-- NOTHING FIRED') +
    (c.length && !c.includes(code) ? `  <-- fired instead: ${[...new Set(c)].join(', ')}` : ''));
};

console.log('\n── the clean registry passes, so every failure below is the guard ──');
{
  const res = gate(clean());
  ok(res.length === 0, 'an empty, well-formed registry produces no findings' +
    (res.length ? ` — ${res[0].code}: ${res[0].message}` : ''));
}

console.log('\n── FIX 1: the corpus boundary, enforced at ingestion time ──');
ok(insideRepo('/tmp/definitely-outside') === false, 'an external corpus path is accepted');
ok(insideRepo(REPO_ROOT) === true, 'a corpus path EQUAL to the repo root is rejected');
ok(insideRepo(join(REPO_ROOT, 'corpus')) === true, 'a corpus path inside the repo is rejected');
ok(insideRepo(join(REPO_ROOT, 'a', 'b', 'dsat-corpus')) === true, 'a deeply nested in-repo path is rejected');
ok(insideRepo(REPO_ROOT + '-other') === false, 'a sibling directory with a shared prefix is NOT mistaken for inside');
{
  let threw = false;
  try { assertCorpusOutsideRepo('/tmp/definitely-outside'); } catch { threw = true; }
  ok(!threw, 'assertCorpusOutsideRepo permits an external path');
  for (const [p, label] of [[REPO_ROOT, 'the repo root itself'],
    [join(REPO_ROOT, 'corpus'), 'a child of the repo'],
    [join(REPO_ROOT, 'x', 'y', 'corpus'), 'a nested child of the repo']]) {
    let msg = null;
    try { assertCorpusOutsideRepo(p); } catch (e) { msg = e.message; }
    ok(msg && msg.includes('inside the repository'), `assertCorpusOutsideRepo throws for ${label}`);
  }
}
fires('CORPUS-INSIDE-REPO', { corpusRoot: join(REPO_ROOT, 'corpus') },
  'the gate still rejects an in-repo corpus root');
fires('CORPUS-INSIDE-REPO', { corpusRoot: REPO_ROOT },
  'the gate rejects a corpus root EQUAL to the repo root (the old startsWith check did not)');
{
  const c = codes(gate(clean({ corpusRoot: '/tmp/outside-the-tree' })));
  ok(!c.includes('CORPUS-INSIDE-REPO'), 'an external corpus root passes the gate');
}

console.log('\n── FIX 2: similarity thresholds stay classified as provisional ──');
ok(Array.isArray(SIMILARITY.provisional), 'SIMILARITY.provisional exists and is a list');
ok(SIMILARITY.provisional.includes('nearDuplicate'), 'nearDuplicate is marked provisional');
ok(SIMILARITY.provisional.includes('sameArchetypeFamily'), 'sameArchetypeFamily is marked provisional');
ok(SIMILARITY.fittedOn === null, 'fittedOn is null — no empirical fit is claimed');
ok(SIMILARITY.nearDuplicate === 0.85, 'the numeric threshold is unchanged at 0.85');
ok(SIMILARITY.sameArchetypeFamily === 0.65, 'the family threshold is unchanged at 0.65');
ok(SIMILARITY_THRESHOLDS.every(t => SIMILARITY.provisional.includes(t)),
  'every numeric threshold is accounted for as provisional while nothing is fitted');

console.log('\n── registry schema and store shape ──');
fires('STORE-MALFORMED-JSON', { storeIssues: [{ code: 'STORE-MALFORMED-JSON', message: 'x' }] },
  'a malformed store is reported through the gate');
{
  // The schema guards fire only when the bound vocabularies move, which cannot
  // be simulated from here — they are module constants. So assert what is
  // actually checkable: the gate is silent on the real vocabulary, and the
  // vocabulary is the frozen one.
  const c = codes(gate(clean()));
  ok(!c.some(x => x.startsWith('SCHEMA-')), 'the gate reports no schema finding against the real vocabularies');
  ok(TAXONOMY_SUBTOPICS.length === 33 && KDG_NODE_IDS.length === 35,
    'and those vocabularies are the frozen 33 subtopics and the published 35 KDG nodes');
}

console.log('\n── sources: provenance, evidence, exclusion, identity ──');
const src = (o = {}) => ({ source_id: 'S-001', source_file: 'f.pdf', sha256: 'a'.repeat(64),
  provenance: 'third_party', provenance_confidence: 'OBSERVED', ...o });
fires('SRC-DUPLICATE-ID', { sources: [src(), src()] }, 'a duplicate source_id is rejected');
fires('SRC-ID-FORMAT', { sources: [src({ source_id: 'nope' })] }, 'a malformed source id is rejected');
fires('SRC-NO-SHA256', { sources: [src({ sha256: undefined })] }, 'a source with no sha256 is rejected');
fires('SRC-PROVENANCE-INVALID', { sources: [src({ provenance: 'vibes' })] }, 'an invalid provenance is rejected');
fires('SRC-CONFIDENCE-INVALID', { sources: [src({ provenance_confidence: 'maybe' })] }, 'an invalid provenance confidence is rejected');
fires('SRC-EVIDENCE-MISSING', { sources: [src({ provenance: 'official_college_board' })] },
  'an official claim with no evidence is rejected — no silent upgrade');
fires('SRC-EVIDENCE-MISSING', { sources: [src({ provenance: 'real_released_practice' })] },
  'a released-practice claim with no evidence is rejected');
fires('SRC-EXCLUDED', { sources: [src({ source_file: 'leaked_march_2026.pdf' })] },
  'a leaked source is rejected by pattern');
fires('SRC-EXCLUDED', { sources: [src({ title: 'recalled live exam, Nov' })] },
  'a recalled live exam is rejected by pattern');
fires('SRC-CARRIES-TEXT', { sources: [src({ ocr: 'some extracted text' })] },
  'a source row carrying extracted text is rejected');
{
  const c = codes(gate(clean({ sources: [src({ provenance: 'official_college_board', provenance_evidence: 'CB practice 4 p.12' })] })));
  ok(c.length === 0, 'an official source WITH evidence is accepted');
}

console.log('\n── question records: identity, referential integrity, fingerprints ──');
// Fingerprints are COMPUTED, never typed. A fixture with hardcoded ones is
// invalid at baseline, and then every Q-RECORD-INVALID assertion passes because
// of the fingerprint mismatch rather than the thing it means to test. That is
// exactly what happened on the first run of this file, and the one case
// expecting ACCEPTANCE is what exposed it.
const SIG = { objects: ['linear_equation'], relations: ['a*x + b = c'],
  given_roles: ['coefficient'], asked_role: 'value', constraints: [] };
const q = (o = {}) => {
  const base = {
    question_id: 'Q-001-p1-q1', source_id: 'S-001', source_file: 'f.pdf', source_page: 1,
    provenance: 'unknown', provenance_confidence: 'UNKNOWN', exam: 'DSAT', topic: 'Linear Equations',
    taxonomy_subtopics: ['ALG_006'], knowledge_nodes: ['N-LINEQ'],
    representation: 'verbal', target_type: 'value', archetype: 'A-UNCLASSIFIED',
    archetype_confidence: 'UNKNOWN', reasoning_mechanisms: [], distractor_logic: [],
    difficulty_evidence: { kind: 'UNKNOWN' }, difficulty_confidence: 'UNKNOWN',
    answer_structure: 'mcq_4', stimulus_type: 'none', mathematical_signature: SIG, ...o,
  };
  if (!('structural_fingerprint' in o)) base.structural_fingerprint = structuralFingerprint(base);
  if (!('mathematical_fingerprint' in o)) base.mathematical_fingerprint = mathematicalFingerprint(SIG);
  return base;
};
const withSrc = extra => ({ sources: [src()], ...extra });
{
  const c = codes(gate(clean(withSrc({ questions: [q()] }))));
  ok(c.length === 0, 'the baseline question fixture is itself clean' +
    (c.length ? ` — ${c.join(', ')}` : '') + '  (without this, every rejection below could be spurious)');
}
fires('Q-RECORD-INVALID', withSrc({ questions: [q({ source_id: 'S-404' })] }),
  'a record pointing at an unregistered source is rejected');
fires('Q-RECORD-INVALID', withSrc({ questions: [q(), q()] }), 'a duplicate question_id is rejected');
fires('Q-RECORD-INVALID', withSrc({ questions: [q({ topic: 'Calculus' })] }), 'an invalid topic is rejected');
fires('Q-RECORD-INVALID', withSrc({ questions: [q({ taxonomy_subtopics: ['ALG_999'] })] }),
  'an invalid taxonomy subtopic is rejected');
fires('Q-RECORD-INVALID', withSrc({ questions: [q({ knowledge_nodes: ['N-NOPE'] })] }),
  'an invalid KDG node is rejected');
fires('Q-RECORD-INVALID', withSrc({ questions: [q({ knowledge_nodes: ['N-QUAD'] })] }),
  'an invented KDG relationship is rejected without a conflict');
fires('Q-RECORD-INVALID', withSrc({ questions: [q({ source_page: undefined })] }),
  'a record with no source page is rejected');
fires('Q-RECORD-INVALID', withSrc({ questions: [q({ structural_fingerprint: 'zz' })] }),
  'a malformed fingerprint is rejected');
fires('Q-RECORD-INVALID', withSrc({ questions: [q({ difficulty_evidence: { kind: 'UNKNOWN', band: 'hard' } })] }),
  'an unsupported difficulty claim is rejected');
{
  const c = codes(gate(clean(withSrc({ questions: [q({ knowledge_nodes: ['N-QUAD'], conflicts: ['KDG_MAPPING_CONFLICT'] })] }))));
  ok(!c.includes('Q-RECORD-INVALID'), 'an out-of-map KDG node IS accepted once the conflict is recorded');
}

console.log('\n── archetypes ──');
const archFull = Object.fromEntries(['given', 'find', 'transformation', 'hidden_relationship',
  'representation', 'wrong_route', 'distractor_basis', 'cognitive_demand'].map(f => [f, 'stated']));
fires('ARCH-DUPLICATE-ID', { archetypes: [{ archetype_id: 'A-X', label: 'a construction', ...archFull },
  { archetype_id: 'A-X', label: 'another', ...archFull }] }, 'a duplicate archetype id is rejected');
fires('ARCH-INVALID', { archetypes: [{ archetype_id: 'A-X', label: 'Linear Equations', ...archFull }] },
  'an archetype labelled with a topic name is rejected');
fires('ARCH-INVALID', { archetypes: [{ archetype_id: 'A-X', label: 'ok', ...archFull, wrong_route: '' }] },
  'an archetype missing a construction field is rejected');

console.log('\n── the conflict register ──');
fires('CONF-TAX-COUNT', { conflicts: CONFLICTS.slice(0, 7) }, 'deleting a taxonomy conflict is rejected');
fires('CONF-REQUIRED-MISSING', { conflicts: CONFLICTS.filter(c => !c.about.includes('"Median"')) },
  'removing the Median conflict specifically is named');
fires('CONF-TAX-COUNT', { conflicts: CONFLICTS.map(c => c.about.includes('"Mode"') ? { ...c, status: 'resolved', resolved_by: 'x', resolved_on: 'y' } : c) },
  'silently resolving a taxonomy conflict drops the open count');
fires('CONF-KIND-INVALID', { conflicts: [...CONFLICTS, { conflict_id: 'X-1', kind: 'MADE_UP', status: 'open', about: 'x', statement_a: 'a', statement_b: 'b' }] },
  'an invented conflict kind is rejected');
fires('CONF-STATEMENTS-MISSING', { conflicts: [...CONFLICTS, { conflict_id: 'X-2', kind: 'SOURCE_CONFLICT', status: 'open', about: 'x', statement_a: 'a' }] },
  'a conflict with only one side is rejected');
fires('CONF-STATUS-INVALID', { conflicts: [...CONFLICTS, { conflict_id: 'X-3', kind: 'SOURCE_CONFLICT', status: 'maybe', about: 'x', statement_a: 'a', statement_b: 'b' }] },
  'an invalid conflict status is rejected');
fires('CONF-RESOLVED-UNSIGNED', { conflicts: [...CONFLICTS, { conflict_id: 'X-4', kind: 'SOURCE_CONFLICT', status: 'resolved', about: 'x', statement_a: 'a', statement_b: 'b' }] },
  'a conflict resolved with no signature is rejected');

console.log('\n── the copyright boundary on the raw stores ──');
fires('TEXT-LONG-STRING', { raw: { 'questions.json': `{"note":"${'x'.repeat(250)}"}` } },
  'a long string in a store is rejected as possible question text');
fires('TEXT-FORBIDDEN-FIELD', { raw: { 'questions.json': '{"stem": "short"}' } },
  'a forbidden field name in a store is rejected');
{
  const c = codes(gate(clean({ raw: { 'questions.json': '{"note":"table has 4 rows"}' } })));
  ok(c.length === 0, 'a short structural note in a store is accepted');
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
