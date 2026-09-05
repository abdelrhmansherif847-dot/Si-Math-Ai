// The registry-level gate for the DSAT Question Knowledge Base.
//
// Extracted from scripts/validate-dsat-kb.mjs so it can be TESTED. The CLI there
// is now a thin wrapper that loads the stores from disk and prints; every check
// lives here, takes its data as an argument, and returns findings rather than
// calling process.exit.
//
// Each finding carries a STABLE CODE. Tests assert on the code, not on the
// message prose, so a reworded message does not break a test and — more
// importantly — a test cannot pass because some *other* guard happened to fire.
// That failure mode is real: during the build, a mutation meant to test the
// text-leak guard went red for a missing source_id instead.

import { resolve } from 'node:path';
import * as S from './schema.mjs';
import { insideRepo, ARCHETYPE_FIELDS, REPO_ROOT, CORPUS_ROOT } from './registry.mjs';
import { validateRecord, validateArchetype } from './validate-record.mjs';
import { groupDuplicates, SIMILARITY, SIMILARITY_THRESHOLDS } from './fingerprint.mjs';

export function gate({
  sources = [], questions = [], archetypes = [], conflicts = [],
  raw = {}, corpusRoot = CORPUS_ROOT, repoRoot = REPO_ROOT, storeIssues = [],
} = {}) {
  const found = [];
  const fail = (code, message) => found.push({ code, message });
  const check = (cond, code, message) => { if (!cond) fail(code, message); };

  for (const issue of storeIssues) found.push(issue);

  // ── the schema binds to the real vocabularies, not private copies ──────────
  check(S.TAXONOMY_SUBTOPICS.length === 33, 'SCHEMA-TAX-SUBTOPICS',
    `the frozen taxonomy has ${S.TAXONOMY_SUBTOPICS.length} subtopics, the KB expects 33 — ` +
    'taxonomy.core.js is frozen (CLAUDE.md §2); if it moved, that is the news');
  check(S.TAXONOMY_TOPICS.length === 5, 'SCHEMA-TAX-TOPICS',
    `the frozen taxonomy has ${S.TAXONOMY_TOPICS.length} topics, expected 5`);
  check(S.KDG_NODE_IDS.length === 35, 'SCHEMA-KDG-NODES',
    `the published KDG has ${S.KDG_NODE_IDS.length} nodes, expected 35`);
  check(S.EXAM_TOPICS.DSAT.length === 22 && S.EXAM_TOPICS.ST1.length === 25,
    'SCHEMA-EXAM-TOPICS', 'the exam topic lists no longer match artifact 01');

  for (const n of S.NOT_MECHANISMS)
    check(!S.MECHANISM_IDS.includes(n), 'SCHEMA-STEPS-AS-MECHANISM',
      `"${n}" appears in the mechanism registry — step count is a time-budget descriptor`);
  check(S.MECHANISM_IDS.includes('trap_cost'), 'SCHEMA-TRAP-COST',
    'trap_cost has been dropped from the mechanism registry');
  for (const req of ['hidden_step', 'inference', 'multiconcept', 'nonobvious_relationship',
    'representation_switch', 'abstraction', 'reversal', 'filtering',
    'competing_interpretations', 'option_testing'])
    check(S.MECHANISM_IDS.includes(req), 'SCHEMA-MECHANISM-MISSING',
      `the brief's mechanism "${req}" is missing from the registry`);
  check(S.DISTRACTOR_CATEGORIES.includes('unknown'), 'SCHEMA-DISTRACTOR-UNKNOWN',
    'the distractor taxonomy has no "unknown" — without it a coder must invent a rationale');
  check(S.CONFIDENCE.includes('UNKNOWN'), 'SCHEMA-CONFIDENCE-UNKNOWN',
    'UNKNOWN has been removed from the confidence model');

  // ── similarity thresholds stay classified ─────────────────────────────────
  for (const t of SIMILARITY_THRESHOLDS)
    check((SIMILARITY.provisional ?? []).includes(t) || SIMILARITY.fittedOn,
      'SIM-UNCLASSIFIED-THRESHOLD',
      `similarity threshold "${t}" is neither listed as provisional nor recorded as fitted — ` +
      'an unmeasured number must not harden into a settled constant');
  check(SIMILARITY.fittedOn === null || typeof SIMILARITY.fittedOn === 'object',
    'SIM-FITTED-SHAPE', 'SIMILARITY.fittedOn must be null or a record of the fit');
  if (SIMILARITY.fittedOn === null)
    check((SIMILARITY.provisional ?? []).length === SIMILARITY_THRESHOLDS.length,
      'SIM-PROVISIONAL-INCOMPLETE',
      `${SIMILARITY_THRESHOLDS.length} thresholds exist but ${(SIMILARITY.provisional ?? []).length} are marked provisional; ` +
      'none has been fitted, so all of them are provisional');

  // ── the exam-topic mapping stays total ────────────────────────────────────
  const mapped = new Set(S.EXAM_TOPIC_TAXONOMY.map(r => r.topic));
  for (const t of new Set([...S.EXAM_TOPICS.DSAT, ...S.EXAM_TOPICS.ST1]))
    check(mapped.has(t), 'MAP-TOPIC-MISSING', `exam topic "${t}" has no row in EXAM_TOPIC_TAXONOMY`);
  for (const r of S.EXAM_TOPIC_TAXONOMY) {
    for (const st of r.subtopics)
      check(S.TAXONOMY_SUBTOPICS.includes(st), 'MAP-SUBTOPIC-UNKNOWN',
        `"${r.topic}" maps to unknown subtopic "${st}"`);
    if (r.conflict) check((r.why ?? '').trim(), 'MAP-CONFLICT-NOREASON',
      `"${r.topic}" is flagged conflicting with no reason given`);
  }
  for (const d of ['Graphs (Data)', 'Tables (Data)', 'Mean', 'Median', 'Mode', 'Interquartile Range', 'Asymptote'])
    check(mapped.has(d), 'MAP-DEDICATED-COLLAPSED',
      `dedicated topic "${d}" has been collapsed out of the mapping`);
  for (const t of ['Mean', 'Median', 'Mode']) {
    const row = S.EXAM_TOPIC_TAXONOMY.find(r => r.topic === t);
    check(row?.subtopics.join() === 'STA_002' && row?.conflict === true, 'MAP-CENTRAL-COLLISION',
      `"${t}" no longer maps to STA_002 as a flagged conflict — that collision is real and must stay visible`);
  }

  // ── the corpus lives outside the repository ───────────────────────────────
  check(!insideRepo(corpusRoot, repoRoot), 'CORPUS-INSIDE-REPO',
    `CORPUS_ROOT (${resolve(corpusRoot)}) is inside the repository — question text must never be committed`);

  // ── sources ───────────────────────────────────────────────────────────────
  const sourceIds = new Set(sources.map(s => s.source_id));
  check(sourceIds.size === sources.length, 'SRC-DUPLICATE-ID', 'duplicate source_id in the source registry');
  // Two blocks of one PDF legitimately share source_file and file hash; what must
  // be unique is the (file, block) pair.
  const blockKeys = sources.filter(s => s.source_block != null).map(s => `${s.file_sha256}#${s.source_block}`);
  check(new Set(blockKeys).size === blockKeys.length, 'SRC-DUPLICATE-BLOCK',
    'two source rows claim the same block of the same file');
  for (const s of sources) {
    check(S.SOURCE_ID_RE.test(s.source_id ?? ''), 'SRC-ID-FORMAT', `source id "${s.source_id}" is malformed`);
    check(/^[0-9a-f]{64}$/.test(s.sha256 ?? ''), 'SRC-NO-SHA256',
      `${s.source_id} has no sha256 — a source that cannot be re-identified cannot be cited`);
    check(S.PROVENANCE_IDS.includes(s.provenance), 'SRC-PROVENANCE-INVALID',
      `${s.source_id} has provenance "${s.provenance}"`);
    check(S.CONFIDENCE.includes(s.provenance_confidence), 'SRC-CONFIDENCE-INVALID',
      `${s.source_id} has no valid provenance_confidence`);
    if (S.provenanceNeedsEvidence(s.provenance))
      check((s.provenance_evidence ?? '').trim(), 'SRC-EVIDENCE-MISSING',
        `${s.source_id} claims "${s.provenance}" with no evidence — an unknown source is never silently upgraded`);
    // D-1 as corrected: a source is CLASSIFIED, not discarded. The only hard
    // block left is pinned by hash, so it cannot catch anything by accident.
    const hard = S.HARD_EXCLUDED_SHA256.find(x => x.sha256 === s.sha256);
    check(!hard, 'SRC-HARD-EXCLUDED', `${s.source_id} is ${hard?.what}: ${hard?.why}`);
    check(S.KNOWLEDGE_USE.includes(s.knowledge_use), 'SRC-KNOWLEDGE-USE',
      `${s.source_id} has knowledge_use "${s.knowledge_use}"`);
    check(S.GENERATION_ELIGIBILITY.includes(s.generation_eligibility), 'SRC-GENERATION-ELIGIBILITY',
      `${s.source_id} has generation_eligibility "${s.generation_eligibility}"`);
    // Unofficial provenance never blocks learning, but it must not silently
    // become a direct generation source either.
    if (s.provenance === 'recalled_unofficial')
      check(s.generation_eligibility !== 'APPROVED' || (s.provenance_evidence ?? '').trim(),
        'SRC-APPROVED-WITHOUT-EVIDENCE',
        `${s.source_id} is recalled/unofficial and marked APPROVED for direct generation with no recorded decision`);
    // D-3: a source row is a BLOCK of a file, so its page range must be sane.
    if (s.source_block != null) {
      check(Number.isInteger(s.page_from) && Number.isInteger(s.page_to) && s.page_from <= s.page_to,
        'SRC-BLOCK-RANGE', `${s.source_id} block ${s.source_block} has no valid page range`);
      check(/^[0-9a-f]{64}$/.test(s.file_sha256 ?? ''), 'SRC-BLOCK-FILE-HASH',
        `${s.source_id} block ${s.source_block} does not record the hash of the file it came from`);
    }
    check(!(s.text ?? s.content ?? s.ocr), 'SRC-CARRIES-TEXT',
      `${s.source_id} carries extracted text; that belongs in the corpus`);
  }

  // ── archetypes ────────────────────────────────────────────────────────────
  const archetypeIds = new Set(archetypes.map(a => a.archetype_id));
  check(archetypeIds.size === archetypes.length, 'ARCH-DUPLICATE-ID', 'duplicate archetype_id');
  for (const a of archetypes)
    for (const m of validateArchetype(a, ARCHETYPE_FIELDS)) fail('ARCH-INVALID', m);

  // ── question records ──────────────────────────────────────────────────────
  const seenIds = new Set();
  for (const q of questions) {
    for (const m of validateRecord(q, {
      sourceIds, archetypeIds: new Set([...archetypeIds, 'A-UNCLASSIFIED']), seenIds,
    })) fail('Q-RECORD-INVALID', m);
    seenIds.add(q.question_id);
  }
  if (questions.length) {
    const derived = groupDuplicates(questions);
    const declared = new Set(questions.map(q => q.duplicate_group).filter(Boolean));
    for (const g of derived)
      check(declared.has(g.group_id) || g.members.every(m => !questions.find(q => q.question_id === m)?.duplicate_group),
        'Q-DUPLICATE-GROUP-UNRECORDED',
        `duplicate group ${g.group_id} (${g.members.join(', ')}) is not recorded on its members`);
  }

  // ── conflicts: the known ones stay open, and none closes silently ─────────
  const expectedTax = S.EXAM_TOPIC_TAXONOMY.filter(r => r.conflict).length;
  const taxOpen = conflicts.filter(c => c.kind === 'TAXONOMY_CONFLICT' && c.status === 'open').length;
  check(taxOpen === expectedTax, 'CONF-TAX-COUNT',
    `${taxOpen} taxonomy conflicts are open, the mapping flags ${expectedTax}. ` +
    'These are permanent: taxonomy.core.js is frozen and the exam axis is finer than it');
  for (const c of conflicts) {
    check(S.CONFLICT_KINDS.includes(c.kind), 'CONF-KIND-INVALID', `conflict ${c.conflict_id} has kind "${c.kind}"`);
    check(c.statement_a && c.statement_b, 'CONF-STATEMENTS-MISSING',
      `conflict ${c.conflict_id} does not carry both statements`);
    check(['open', 'resolved'].includes(c.status), 'CONF-STATUS-INVALID',
      `conflict ${c.conflict_id} has status "${c.status}"`);
    if (c.status === 'resolved')
      check((c.resolved_by ?? '').trim() && (c.resolved_on ?? '').trim(), 'CONF-RESOLVED-UNSIGNED',
        `conflict ${c.conflict_id} is resolved with no record of by whom or when`);
  }
  for (const t of ['Mean', 'Median', 'Mode', 'Asymptote'])
    check(conflicts.some(c => c.kind === 'TAXONOMY_CONFLICT' && (c.about ?? '').includes(`"${t}"`) && c.status === 'open'),
      'CONF-REQUIRED-MISSING', `the taxonomy conflict for "${t}" has been removed or closed`);

  // ── copyright posture: scan the raw registry text for prose ───────────────
  for (const [file, text] of Object.entries(raw)) {
    for (const m of text.match(/"[^"]{220,}"/g) ?? [])
      fail('TEXT-LONG-STRING',
        `${file} contains a ${m.length}-character string — question text does not enter this repository`);
    for (const f of S.FORBIDDEN_TEXT_FIELDS)
      check(!new RegExp(`"${f}"\\s*:`).test(text), 'TEXT-FORBIDDEN-FIELD',
        `${file} contains a forbidden field "${f}"`);
  }

  return found;
}
