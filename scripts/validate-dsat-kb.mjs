#!/usr/bin/env node
// CI gate for the DSAT Question Knowledge Base.
//
// Runs on every commit, including now, while the registries are empty. That is
// deliberate: most of what can go wrong here is structural, and structure can be
// checked before there is any data. The schema binds to the frozen taxonomy and
// the published KDG; the exam-topic mapping must stay total; the known taxonomy
// conflicts must stay open. Those hold with zero questions ingested, and they
// are what stops the first PDF landing on a broken foundation.
//
// When records arrive the same gate checks each one through the shared
// validator, so a record cannot be written by a route that checks less than CI.

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as S from './dsat-kb/schema.mjs';
import * as R from './dsat-kb/registry.mjs';
import { validateRecord, validateArchetype } from './dsat-kb/validate-record.mjs';
import { groupDuplicates } from './dsat-kb/fingerprint.mjs';

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

// ── the schema binds to the real vocabularies, not private copies ───────────
check(S.TAXONOMY_SUBTOPICS.length === 33,
  `the frozen taxonomy has ${S.TAXONOMY_SUBTOPICS.length} subtopics, the KB expects 33 — ` +
  'taxonomy.core.js is frozen (CLAUDE.md §2); if it moved, that is the news');
check(S.TAXONOMY_TOPICS.length === 5, `the frozen taxonomy has ${S.TAXONOMY_TOPICS.length} topics, expected 5`);
check(S.KDG_NODE_IDS.length === 35, `the published KDG has ${S.KDG_NODE_IDS.length} nodes, expected 35`);
check(S.EXAM_TOPICS.DSAT.length === 22 && S.EXAM_TOPICS.ST1.length === 25,
  'the exam topic lists no longer match artifact 01');

// Steps are not a mechanism, and the two lists must stay disjoint.
for (const n of S.NOT_MECHANISMS)
  check(!S.MECHANISM_IDS.includes(n),
    `"${n}" appears in the mechanism registry — step count is a time-budget descriptor, not a reasoning mechanism`);
check(S.MECHANISM_IDS.includes('trap_cost'), 'trap_cost has been dropped from the mechanism registry');
for (const req of ['hidden_step', 'inference', 'multiconcept', 'nonobvious_relationship',
  'representation_switch', 'abstraction', 'reversal', 'filtering',
  'competing_interpretations', 'option_testing'])
  check(S.MECHANISM_IDS.includes(req), `the brief's mechanism "${req}" is missing from the registry`);
check(S.DISTRACTOR_CATEGORIES.includes('unknown'),
  'the distractor taxonomy has no "unknown" — without it a coder must invent a rationale');
check(S.CONFIDENCE.includes('UNKNOWN'), 'UNKNOWN has been removed from the confidence model');

// ── the exam-topic mapping stays total ──────────────────────────────────────
const mapped = new Set(S.EXAM_TOPIC_TAXONOMY.map(r => r.topic));
for (const t of new Set([...S.EXAM_TOPICS.DSAT, ...S.EXAM_TOPICS.ST1]))
  check(mapped.has(t), `exam topic "${t}" has no row in EXAM_TOPIC_TAXONOMY`);
for (const r of S.EXAM_TOPIC_TAXONOMY) {
  for (const st of r.subtopics)
    check(S.TAXONOMY_SUBTOPICS.includes(st), `"${r.topic}" maps to unknown subtopic "${st}"`);
  if (r.conflict) check((r.why ?? '').trim(), `"${r.topic}" is flagged conflicting with no reason given`);
}
// The dedicated topics must still be distinct rows.
for (const d of ['Graphs (Data)', 'Tables (Data)', 'Mean', 'Median', 'Mode', 'Interquartile Range', 'Asymptote'])
  check(mapped.has(d), `dedicated topic "${d}" has been collapsed out of the mapping`);
// …and Mean/Median/Mode must still land on the one frozen subtopic, flagged.
for (const t of ['Mean', 'Median', 'Mode']) {
  const row = S.EXAM_TOPIC_TAXONOMY.find(r => r.topic === t);
  check(row?.subtopics.join() === 'STA_002' && row?.conflict === true,
    `"${t}" no longer maps to STA_002 as a flagged conflict — that collision is real and must stay visible`);
}

// ── the stores load and are shaped ──────────────────────────────────────────
for (const [name, meta] of Object.entries(R.STORES)) {
  const path = join(R.REGISTRY_DIR, meta.file);
  check(existsSync(path), `registry store ${meta.file} is missing`);
  if (!existsSync(path)) continue;
  let data;
  try { data = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { failures.push(`${meta.file} is not valid JSON: ${e.message}`); continue; }
  check(data.schema_version === 1, `${meta.file} has no schema_version 1`);
  check(Array.isArray(data[meta.key]), `${meta.file} has no ${meta.key} array`);
}

// ── the corpus lives outside the repository ─────────────────────────────────
check(!resolve(R.CORPUS_ROOT).startsWith(resolve(R.REPO_ROOT) + '/'),
  `CORPUS_ROOT (${R.CORPUS_ROOT}) is inside the repository — question text must never be committed`);

// ── sources ─────────────────────────────────────────────────────────────────
const sources = R.rows('sources');
const sourceIds = new Set(sources.map(s => s.source_id));
check(sourceIds.size === sources.length, 'duplicate source_id in the source registry');
for (const s of sources) {
  check(S.SOURCE_ID_RE.test(s.source_id ?? ''), `source id "${s.source_id}" is malformed`);
  check(/^[0-9a-f]{64}$/.test(s.sha256 ?? ''), `${s.source_id} has no sha256 — a source that cannot be re-identified cannot be cited`);
  check(S.PROVENANCE_IDS.includes(s.provenance), `${s.source_id} has provenance "${s.provenance}"`);
  check(S.CONFIDENCE.includes(s.provenance_confidence), `${s.source_id} has no valid provenance_confidence`);
  if (S.provenanceNeedsEvidence(s.provenance))
    check((s.provenance_evidence ?? '').trim(),
      `${s.source_id} claims "${s.provenance}" with no evidence — an unknown source is never silently upgraded`);
  for (const x of S.EXCLUDED_SOURCES)
    check(!x.pattern.test(s.source_file ?? '') && !x.pattern.test(s.title ?? ''),
      `${s.source_id} matches an excluded source pattern: ${x.why}`);
  check(!(s.text ?? s.content ?? s.ocr), `${s.source_id} carries extracted text; that belongs in the corpus`);
}

// ── archetypes ──────────────────────────────────────────────────────────────
const archetypes = R.rows('archetypes');
const archetypeIds = new Set(archetypes.map(a => a.archetype_id));
check(archetypeIds.size === archetypes.length, 'duplicate archetype_id');
for (const a of archetypes) failures.push(...validateArchetype(a, R.ARCHETYPE_FIELDS));

// ── question records ────────────────────────────────────────────────────────
const questions = R.rows('questions');
const seenIds = new Set();
for (const q of questions) {
  failures.push(...validateRecord(q, { sourceIds, archetypeIds: new Set([...archetypeIds, 'A-UNCLASSIFIED']), seenIds }));
  seenIds.add(q.question_id);
}
// Duplicate groups are derived, never hand-maintained.
if (questions.length) {
  const derived = groupDuplicates(questions);
  const declared = new Set(questions.map(q => q.duplicate_group).filter(Boolean));
  for (const g of derived)
    check(declared.has(g.group_id) || g.members.every(m => !questions.find(q => q.question_id === m)?.duplicate_group),
      `duplicate group ${g.group_id} (${g.members.join(', ')}) is not recorded on its members`);
}

// ── conflicts: the known ones stay open, and none closes silently ───────────
const conflicts = R.rows('conflicts');
const expectedTax = S.EXAM_TOPIC_TAXONOMY.filter(r => r.conflict).length;
const taxOpen = conflicts.filter(c => c.kind === 'TAXONOMY_CONFLICT' && c.status === 'open').length;
check(taxOpen === expectedTax,
  `${taxOpen} taxonomy conflicts are open, the mapping flags ${expectedTax}. ` +
  'These are permanent: taxonomy.core.js is frozen and the exam axis is finer than it');
for (const c of conflicts) {
  check(S.CONFLICT_KINDS.includes(c.kind), `conflict ${c.conflict_id} has kind "${c.kind}"`);
  check(c.statement_a && c.statement_b, `conflict ${c.conflict_id} does not carry both statements`);
  check(['open', 'resolved'].includes(c.status), `conflict ${c.conflict_id} has status "${c.status}"`);
  if (c.status === 'resolved')
    check((c.resolved_by ?? '').trim() && (c.resolved_on ?? '').trim(),
      `conflict ${c.conflict_id} is resolved with no record of by whom or when — conflicts are never silently closed`);
}
for (const t of ['Mean', 'Median', 'Mode', 'Asymptote'])
  check(conflicts.some(c => c.kind === 'TAXONOMY_CONFLICT' && c.about.includes(`"${t}"`) && c.status === 'open'),
    `the taxonomy conflict for "${t}" has been removed or closed`);

// ── copyright posture: scan the raw registry files for prose ────────────────
for (const meta of Object.values(R.STORES)) {
  const path = join(R.REGISTRY_DIR, meta.file);
  if (!existsSync(path)) continue;
  const raw = readFileSync(path, 'utf8');
  for (const m of raw.match(/"[^"]{220,}"/g) ?? [])
    failures.push(`${meta.file} contains a ${m.length}-character string — question text does not enter this repository`);
  for (const f of S.FORBIDDEN_TEXT_FIELDS)
    check(!new RegExp(`"${f}"\\s*:`).test(raw), `${meta.file} contains a forbidden field "${f}"`);
}

if (failures.length) {
  console.log(`FAIL validate-dsat-kb (${failures.length})`);
  for (const f of failures.slice(0, 40)) console.log(`  • ${f}`);
  if (failures.length > 40) console.log(`  … ${failures.length - 40} more`);
  process.exit(1);
}
console.log(`validate-dsat-kb: ${sources.length} sources, ${questions.length} questions, ` +
  `${archetypes.length} archetypes, ${conflicts.length} conflicts (${taxOpen} taxonomy, open) — ` +
  `bound to ${S.TAXONOMY_SUBTOPICS.length} frozen subtopics and ${S.KDG_NODE_IDS.length} KDG nodes — OK`);
