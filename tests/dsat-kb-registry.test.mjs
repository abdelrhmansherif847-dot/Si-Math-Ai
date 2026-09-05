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
import { HARD_EXCLUDED_SHA256, OBSERVED_TOPICS } from '../scripts/dsat-kb/schema.mjs';
import { pageCount, provenanceScan, inflateAll, contentText, looksLikeText } from '../scripts/dsat-kb/pdf.mjs';
import { deflateSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { SIMILARITY, SIMILARITY_THRESHOLDS, structuralFingerprint, mathematicalFingerprint, classifyPair }
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
  provenance: 'third_party', provenance_confidence: 'OBSERVED',
  knowledge_use: 'REFERENCE', generation_eligibility: 'NOT_DIRECT_SOURCE', ...o });
fires('SRC-DUPLICATE-ID', { sources: [src(), src()] }, 'a duplicate source_id is rejected');
fires('SRC-ID-FORMAT', { sources: [src({ source_id: 'nope' })] }, 'a malformed source id is rejected');
fires('SRC-NO-SHA256', { sources: [src({ sha256: undefined })] }, 'a source with no sha256 is rejected');
fires('SRC-PROVENANCE-INVALID', { sources: [src({ provenance: 'vibes' })] }, 'an invalid provenance is rejected');
fires('SRC-CONFIDENCE-INVALID', { sources: [src({ provenance_confidence: 'maybe' })] }, 'an invalid provenance confidence is rejected');
fires('SRC-EVIDENCE-MISSING', { sources: [src({ provenance: 'official_college_board' })] },
  'an official claim with no evidence is rejected — no silent upgrade');
fires('SRC-EVIDENCE-MISSING', { sources: [src({ provenance: 'real_released_practice' })] },
  'a released-practice claim with no evidence is rejected');
fires('SRC-HARD-EXCLUDED', { sources: [src({ sha256: HARD_EXCLUDED_SHA256[0].sha256 })] },
  'the one hash-pinned hard exclusion still refuses that specific file');
fires('SRC-KNOWLEDGE-USE', { sources: [src({ knowledge_use: 'whatever' })] },
  'an invalid knowledge_use is rejected');
fires('SRC-GENERATION-ELIGIBILITY', { sources: [src({ generation_eligibility: 'sure' })] },
  'an invalid generation_eligibility is rejected');
fires('SRC-APPROVED-WITHOUT-EVIDENCE',
  { sources: [src({ provenance: 'recalled_unofficial', generation_eligibility: 'APPROVED' })] },
  'recalled material marked APPROVED for direct generation needs a recorded decision');
fires('SRC-BLOCK-RANGE', { sources: [src({ source_block: 'A', file_sha256: 'b'.repeat(64), page_from: 9, page_to: 2 })] },
  'a source block with an inverted page range is rejected');
fires('SRC-BLOCK-FILE-HASH', { sources: [src({ source_block: 'A', page_from: 1, page_to: 4 })] },
  'a source block that does not record its file hash is rejected');
fires('SRC-DUPLICATE-BLOCK', { sources: [
  src({ source_id: 'S-001', source_block: 'A', file_sha256: 'c'.repeat(64), page_from: 1, page_to: 4 }),
  src({ source_id: 'S-002', source_block: 'A', file_sha256: 'c'.repeat(64), page_from: 1, page_to: 4 })] },
  'two rows claiming the same block of the same file are rejected');

console.log('\n── unofficial provenance is CLASSIFIED, never discarded (the 2026-09-05 correction) ──');
for (const p of ['unknown', 'third_party', 'recalled_unofficial']) {
  const c = codes(gate(clean({ sources: [src({ provenance: p, provenance_confidence: p === 'unknown' ? 'UNKNOWN' : 'OBSERVED' })] })));
  ok(c.length === 0, `provenance "${p}" is accepted as reference knowledge`);
}
{
  const c = codes(gate(clean({ sources: [
    src({ source_id: 'S-001', source_block: 'A', file_sha256: 'd'.repeat(64), page_from: 1, page_to: 4,
      provenance: 'recalled_unofficial', generation_eligibility: 'EXCLUDED' }),
    src({ source_id: 'S-002', source_block: 'B', file_sha256: 'd'.repeat(64), page_from: 5, page_to: 86,
      provenance: 'unknown', provenance_confidence: 'UNKNOWN', generation_eligibility: 'NOT_DIRECT_SOURCE' })] })));
  ok(c.length === 0, 'one file split into two blocks with different provenance is accepted (D-3)');
}
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
    provenance: 'unknown', provenance_confidence: 'UNKNOWN',
    knowledge_use: 'REFERENCE', generation_eligibility: 'NOT_DIRECT_SOURCE',
    observed_topic: 'exponential_functions', source_label: 'Exponential Functions',
    exam: 'DSAT', topic: 'Linear Equations',
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

console.log('\n── the observed vocabulary stays disjoint from the canonical one ──');
{
  const c = codes(gate(clean()));
  ok(!c.some(x => x.startsWith('OBS-TOPIC-')), 'the gate reports no observed-vocabulary finding against the real registries');
  ok(OBSERVED_TOPICS.length >= 2, 'the observed vocabulary is populated');
  ok(OBSERVED_TOPICS.includes('UNKNOWN'), 'and keeps UNKNOWN for sources that name no topic');
  ok(!OBSERVED_TOPICS.some(o => TAXONOMY_SUBTOPICS.includes(o)),
    'no observed topic collides with a taxonomy subtopic id');
  ok(TAXONOMY_SUBTOPICS.length === 33,
    'and the frozen taxonomy is still 33 subtopics — observed topics create no taxonomy nodes');
}

console.log('\n── the copyright boundary on the raw stores ──');
fires('TEXT-LONG-STRING', { raw: { 'questions.json': `{"note":"${'x'.repeat(250)}"}` } },
  'a long string in a store is rejected as possible question text');
fires('TEXT-FORBIDDEN-FIELD', { raw: { 'questions.json': '{"stem": "short"}' } },
  'a forbidden field name in a store is rejected');
{
  const c = codes(gate(clean({ raw: { 'questions.json': '{"note":"table has 4 rows"}' } })));
  ok(c.length === 0, 'a short structural note in a store is accepted');
}

console.log('\n── D-2: page counting survives compressed cross-reference streams ──');
{
  // The pilot PDF reported "?" before this: its page tree is inside compressed
  // object streams. Skipped rather than failed when the file is not present, so
  // the suite stays green on a machine without the corpus.
  const F = '/root/.claude/uploads/04b11b7c-9e5a-5d76-8bd0-64a172a5c12c/0f2ec69d-Exponents_103_Questions.pdf';
  if (existsSync(F)) {
    const buf = readFileSync(F);
    const pc = pageCount(buf);
    ok(pc.pages === 86, `a compressed-xref PDF counts 86 pages (got ${pc.pages})`);
    ok(pc.agree === true, 'both counting routes agree once the streams are inflated');
    ok(inflateAll(buf).length > 100000, 'inflateAll reaches the object streams (the endstream bug made this 516 bytes)');
    const scan = provenanceScan({ buf, text: '[March US 2023] Exponents Real @handle' });
    ok(scan.uris.includes('https://t.me/satashkent'), 'the annotation URI is recovered from the compressed streams');
    ok(scan.signals.some(x => x.id === 'telegram_channel'), 'the Telegram signal is raised');
    ok(scan.signals.some(x => x.id === 'administration_tag'), 'the administration-tag signal is raised');
    ok(scan.suggestedProvenance === 'recalled_unofficial', 'the file is classified, not discarded');
    ok(scan.hardExcluded === null, 'and it is not on the hash-pinned hard exclusion list');
  } else {
    ok(true, 'D-2 corpus file not present on this machine — page-count checks skipped');
  }
}

console.log('\n── D-1: the text signals are reachable from the pipeline, not just from a test ──');
{
  // The four text-reading signals passed for months while the pipeline handed
  // provenanceScan the empty string: the only test that exercised them supplied
  // the text itself. These assertions come at it from the caller's side.

  // A synthetic PDF: one FlateDecode content stream that draws readable text,
  // and one that draws a subset font's shifted code table (the shape that makes
  // a naive harvest emit confident nonsense).
  const mkPdf = (...bodies) => Buffer.concat(bodies.map(b =>
    Buffer.concat([Buffer.from('4 0 obj<</Filter/FlateDecode>>stream\n'),
                   deflateSync(Buffer.from(b, 'latin1')),
                   Buffer.from('\nendstream endobj\n')])));

  const readable = 'BT /F1 12 Tf (Polynomials1.[AugustUS2023]Whichexpressionisequivalentto) Tj ET';
  const shifted  = 'BT /F2 12 Tf (\x004\x00X\x00H\x00V\x00W\x00L\x00R\x00Q\x00\x03\x00,\x00\x27) Tj ET';

  const probe = contentText(mkPdf(readable, shifted));
  ok(probe.streams === 2, `both content streams are seen (got ${probe.streams})`);
  ok(probe.legible === 1, `only the legible one is kept (got ${probe.legible})`);
  ok(/AugustUS2023/.test(probe.text), 'the readable run reaches the caller');
  ok(!/\x00/.test(probe.text), 'the shifted run is dropped, not guessed at');
  ok(probe.ratio < 1, 'and the under-read is reported rather than hidden');

  ok(looksLikeText('Whichexpressionisequivalentto') === true, 'English-shaped text is accepted');
  ok(looksLikeText('4XHVWLRQ\x00,\x00\x27\x00I\x00\x18\x00F\x00\x16\x00H') === false,
     'a shifted code table is rejected');
  ok(looksLikeText('qqq') === false, 'a run too short to judge is rejected');

  // The tag as it actually arrives once a PDF's kerning has eaten the spaces.
  const tagScan = provenanceScan({ buf: Buffer.from('x'), text: '1.[AugustUS2023]2.[May2024]' });
  ok(tagScan.signals.some(x => x.id === 'administration_tag'),
     'the administration tag fires WITHOUT inter-word spaces (the \\s+ pattern matched none of 28)');
  ok(tagScan.suggestedProvenance === 'recalled_unofficial', 'and the file is classified from it');

  // The caller-side check: nothing in the pipeline may hand the scanner an empty
  // string again. This is the assertion that would have gone red before the fix.
  const pipeline = readFileSync(new URL('../scripts/ingest-dsat-pdf.mjs', import.meta.url), 'utf8');
  ok(/provenanceScan\(\{[^}]*text:\s*probe\.text/.test(pipeline),
     'ingest-dsat-pdf.mjs passes the probe text to provenanceScan');
  ok(!/provenanceScan\(\{[^}]*text:\s*''/.test(pipeline),
     'and never passes the empty string, which made four of five signals dead code');
}

console.log('\n── an unknown construction is never grouped as a duplicate ──');
{
  const unk = id => ({ question_id: id, structural_fingerprint: 'a'.repeat(16),
    mathematical_fingerprint: 'b'.repeat(16), fingerprint_components: ['obj:UNKNOWN', 'rep:other'] });
  ok(classifyPair(unk('Q-1'), unk('Q-2')).relation === 'unknown_construction',
    'two items whose construction could not be read are not called duplicates');
  const known = id => ({ question_id: id, structural_fingerprint: 'a'.repeat(16),
    mathematical_fingerprint: 'b'.repeat(16), fingerprint_components: ['obj:linear', 'rep:other'] });
  ok(classifyPair(known('Q-3'), known('Q-4')).relation === 'duplicate_or_renumbered',
    'but two items with the same known construction still are');
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
