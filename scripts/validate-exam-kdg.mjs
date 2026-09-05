#!/usr/bin/env node
// Gate on the exam-structure + KDG ingestion (artifact 01, exam-structure-and-kdg).
//
// Its sibling scripts/validate-exam-knowledge.mjs guards the notebook ingestion.
// This one guards the pair of infographics, and has one extra reason to exist:
// NEITHER SOURCE CAN BE RE-OPENED. They arrived as inline images, so there is no
// file to diff a doubt against. The transcription is the only record, and the
// only defence against it decaying is to make its internal arithmetic and its
// claim register check each other on every CI run.
//
// What it checks: the question ranges really sum to 44 and 50; every topic range
// is contiguous and non-overlapping; the two exams agree where the artifact says
// they agree; the claim register and the §18 table match in both directions; the
// recorded conflicts stay unresolved; and the fields that must stay empty until
// real questions arrive stay empty.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SOURCES, EXAMS, DSAT_TOPICS, ST1_TOPICS, ST1_WORDING_DIFFS, DEDICATED_TOPICS,
  EXAM_KEY_NOTES, KDG_NODES, KDG_EDGES, EDGE_TYPES, CROSS_TOPIC_SKILLS,
  REPRESENTATIONS, REPRESENTATION_MATRIX, TOPIC_NODE_MAP, CLAIMS, CONFLICTS,
  NOT_YET_DEFINABLE, METADATA_EXAMPLE, PERCENT_CONTRIBUTION, FUNCTIONS_BUNDLE,
  LIVE_TAXONOMY_SNAPSHOT,
} from '../docs/knowledge/exam-knowledge/exam-structure-and-kdg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(here, '..', 'docs', 'knowledge', 'exam-knowledge',
  '01-exam-structure-and-kdg.md'), 'utf8');

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

// ── provenance: these sources cannot be hashed, and that must stay recorded ──
check(SOURCES.length === 2, `${SOURCES.length} sources recorded, the ingestion read two`);
for (const s of SOURCES) {
  check(s.hashable === false,
    `${s.id} is marked hashable; both sources arrived as inline images and neither can be re-opened`);
  check(s.authority.startsWith('project-authored'),
    `${s.id} is not marked project-authored — neither source is external evidence (§0)`);
}
check(/neither can be hashed|neither hashable/i.test(md),
  'the artifact no longer records that the sources cannot be hashed');

// ── the arithmetic that was recomputed rather than trusted ──
const sum = rows => rows.reduce((a, r) => a + r.count, 0);
check(sum(DSAT_TOPICS) === EXAMS.DSAT.totalQuestions,
  `Digital SAT ranges sum to ${sum(DSAT_TOPICS)}, the header says ${EXAMS.DSAT.totalQuestions}`);
check(sum(ST1_TOPICS) === EXAMS.ST1.totalQuestions,
  `ST1 ranges sum to ${sum(ST1_TOPICS)}, the header says ${EXAMS.ST1.totalQuestions}`);
check(EXAMS.DSAT.modules.reduce((a, m) => a + m.questions, 0) === EXAMS.DSAT.totalQuestions,
  'the Digital SAT module questions do not sum to its total');
check(EXAMS.DSAT.modules.reduce((a, m) => a + m.minutes, 0) === EXAMS.DSAT.totalMinutes,
  'the Digital SAT module minutes do not sum to its total');
check(EXAMS.ST1.modules.length === 0, 'ST1 is recorded with modules; the source says single section, no modules');

// Ranges must tile 1..N exactly: contiguous, ordered, no gap, no overlap.
for (const [name, rows, total] of [['Digital SAT', DSAT_TOPICS, 44], ['ST1', ST1_TOPICS, 50]]) {
  let next = 1;
  for (const r of rows) {
    check(r.qFrom === next, `${name} row ${r.n} (${r.topic}) starts at ${r.qFrom}, expected ${next}`);
    check(r.qTo >= r.qFrom, `${name} row ${r.n} has an inverted range`);
    check(r.count === r.qTo - r.qFrom + 1, `${name} row ${r.n} count disagrees with its range`);
    next = r.qTo + 1;
  }
  check(next - 1 === total, `${name} ranges end at ${next - 1}, expected ${total}`);
  check(rows.map(r => r.n).join() === rows.map((_, i) => i + 1).join(),
    `${name} topic numbers are not 1..${rows.length}`);
}

// ── the two exams agree exactly where the artifact says they agree ──
for (let i = 0; i < 22; i++) {
  const d = DSAT_TOPICS[i], t = ST1_TOPICS[i];
  check(d.topic === t.topic && d.qFrom === t.qFrom && d.qTo === t.qTo,
    `row ${i + 1} differs between the exams in topic or range; EK-REL-01 says rows 1–22 match`);
}
check(ST1_TOPICS.length === 25 && DSAT_TOPICS.length === 22,
  'the topic-row counts are not 22 and 25');
check(ST1_WORDING_DIFFS.length === 3, 'EK-REL-02 records three wording differences');
for (const w of ST1_WORDING_DIFFS)
  check(w.dsat !== w.st1, `wording diff at row ${w.n} records two identical strings`);

// ── dedicated topics really are separate rows ──
const topicNames = new Set(ST1_TOPICS.map(r => r.topic));
for (const d of DEDICATED_TOPICS) {
  const found = [...topicNames].some(t => t === d || t.startsWith(d + ' ('));
  check(found, `dedicated topic "${d}" is not a topic row of its own (EK-TOPIC-01)`);
}
check(DEDICATED_TOPICS.length === 7, `${DEDICATED_TOPICS.length} dedicated topics, the source boxes seven`);
for (const one of ['Mean', 'Median', 'Mode'])
  check(DEDICATED_TOPICS.includes(one),
    `${one} has been folded away; the source keeps it a dedicated topic (EK-TOPIC-01)`);

// ── the graph keeps its four distinct relation kinds ──
check(EDGE_TYPES.length === 4, 'the four relation kinds of the legend are not all recorded');
const kinds = new Set(EDGE_TYPES.map(t => t.id));
for (const e of KDG_EDGES) {
  check(kinds.has(e.type), `an edge carries type "${e.type}", not one of the legend's four`);
  check(e.conf, 'an edge carries no confidence grade');
}
for (const k of kinds)
  check(KDG_EDGES.some(e => e.type === k),
    `no edge of kind "${k}" survives; collapsing the legend's kinds loses the graph's content (EK-EDGE-01)`);
const nodeIds = new Set(KDG_NODES.map(n => n.id));
for (const e of KDG_EDGES) {
  check(nodeIds.has(e.from), `edge from unknown node ${e.from}`);
  check(nodeIds.has(e.to), `edge to unknown node ${e.to}`);
}
check(FUNCTIONS_BUNDLE.memberList === 'UNREADABLE',
  'the FUNCTIONS bundle has been given a member list; it is not readable from the graphic (EK-KDG-02)');

// ── cross-topic skills keep their universal reach and no parent ──
check(CROSS_TOPIC_SKILLS.length === 4, 'the four cross-topic skills are not all recorded');
for (const s of CROSS_TOPIC_SKILLS) {
  const n = KDG_NODES.find(x => x.id === s.id);
  check(n && n.cluster === 'XT', `${s.id} is not in the cross-topic cluster`);
}
check(!('parent' in CROSS_TOPIC_SKILLS[0]),
  'a cross-topic skill has been given a parent topic; the source says they are not tied to one lesson (EK-XT-03)');

// ── representations stay orthogonal ──
check(REPRESENTATIONS.length === 5, `${REPRESENTATIONS.length} representations, the source names five`);
check(REPRESENTATION_MATRIX.allTicked === true,
  'the representation matrix is no longer universal; the source ticks all 30 cells (EK-REP-02)');

// ── the mapping stays many-to-many in both directions ──
const mapped = new Set(TOPIC_NODE_MAP.flatMap(t => t.nodes));
for (const n of mapped) check(nodeIds.has(n), `the mapping references unknown node ${n}`);
const spanning = TOPIC_NODE_MAP.filter(t => t.nodes.length > 1).length;
const byNode = {};
for (const t of TOPIC_NODE_MAP) for (const n of t.nodes) (byNode[n] ||= []).push(t.topic);
const shared = Object.values(byNode).filter(v => v.length > 1).length;
check(spanning > 0 && shared > 0,
  'the topic↔node mapping has become one-to-one; the source pair is coarser in one direction and finer in the other (§11)');
check(md.includes(`${mapped.size} of ${KDG_NODES.length} nodes`) || md.includes(`24 of 35`),
  `§11 does not record ${mapped.size} of ${KDG_NODES.length} nodes reached`);
const unreached = [...nodeIds].filter(n => !mapped.has(n));
check(md.includes(`${unreached.length} of ${KDG_NODES.length}`),
  `§11.3 does not record ${unreached.length} unreached nodes of ${KDG_NODES.length}`);
// Mean/Median/Mode must still land on one node — the collision the brief warned about
const central = byNode['N-CENTRAL'] || [];
check(central.length === 3 && ['Mean', 'Median', 'Mode'].every(t => central.includes(t)),
  'Mean, Median and Mode no longer share one knowledge node; that collision is the point of §17.4');

// ── the §18 table is derived, not typed ──
const LABEL = { 'SOURCE-STATED': 'SOURCE-STATED', 'INFERRED': 'INFERRED',
  'NOT-SPECIFIED': 'NOT SPECIFIED', 'UNKNOWN': 'UNKNOWN' };
const dist = {};
for (const c of CLAIMS) dist[c.cls] = (dist[c.cls] || 0) + 1;
for (const [cls, n] of Object.entries(dist))
  check(new RegExp(`\\*\\*${LABEL[cls]}\\*\\* \\| ${n} `).test(md),
    `§18 does not record ${n} ${cls} claims; the register holds ${n}`);
check(md.includes(`| | **${CLAIMS.length}** | claims |`),
  `§18 does not record the claim total of ${CLAIMS.length}`);
const blocks = {};
for (const [cls, label] of Object.entries(LABEL)) {
  const m = md.match(new RegExp(`\\*\\*${label} \\(\\d+\\)\\*\\* —([\\s\\S]*?)\\n\\n`));
  check(m, `§18 has no register block for ${label}`);
  blocks[cls] = m ? m[1] : '';
}
for (const c of CLAIMS) {
  const inB = Object.entries(blocks).filter(([, b]) => b.includes(`\`${c.id}\``)).map(([k]) => k);
  check(inB.length === 1, `${c.id} appears in ${inB.length} §18 blocks; it must appear in exactly one`);
  check(inB[0] === c.cls, `${c.id} is graded ${c.cls} but §18 lists it under ${inB[0]}`);
}
// [A-Z0-9] not [A-Z]: EK-ST1-nn carries a digit inside its middle segment, and
// an [A-Z]-only class silently skipped all four ST1 claims on the first run.
const inDoc = new Set(md.match(/EK-[A-Z0-9]+-\d+/g) || []);
const inData = new Set(CLAIMS.map(c => c.id));
for (const id of inData) check(inDoc.has(id), `${id} is registered but never discussed in the artifact`);
for (const id of inDoc) check(inData.has(id), `${id} is discussed in the artifact but carries no evidence class`);

// ── conflicts stay recorded ──
check(CONFLICTS.length >= 5, 'the five recorded conflicts have been dropped (§17)');
for (const c of CONFLICTS) {
  check(c.a && c.b, `${c.id} does not carry both statements`);
  check(c.resolved === false,
    `${c.id} is marked resolved; neither source resolves it, and resolving it here would be invention`);
}
// The percent example genuinely does not sum. Keep that visible.
const p6 = PERCENT_CONTRIBUTION.panel6.reduce((a, [, v]) => a + v, 0);
const p8 = PERCENT_CONTRIBUTION.panel8.reduce((a, [, v]) => a + v, 0);
check(p6 !== PERCENT_CONTRIBUTION.panel6StatedTotal,
  'panel 6 now sums to its stated total; it did not, and XC-2 exists because of that');
check(md.includes(`**${p6}%**`) && md.includes(`**${p8}%**`),
  `§17.2 does not show the two sums ${p6}% and ${p8}%`);

// ── the live taxonomy stays flagged as frozen, and untouched ──
check(LIVE_TAXONOMY_SNAPSHOT.frozen === true,
  'the live taxonomy is no longer marked frozen; taxonomy.core.js is frozen in practice (CLAUDE.md §2)');
check(LIVE_TAXONOMY_SNAPSHOT.granularityConflicts.length >= 4,
  'the live-taxonomy granularity conflicts have been trimmed (§17.4)');

// ── fields that must stay empty until real questions arrive ──
// Naming the fields, not just counting them: a count-only check passes a rename.
const undefinable = new Set(NOT_YET_DEFINABLE.map(f => f.field));
for (const required of ['archetype', 'difficultyEvidence'])
  check(undefinable.has(required),
    `"${required}" is no longer guarded as not-yet-definable — neither source supports it (§19)`);
check(NOT_YET_DEFINABLE.length === 2, 'the not-yet-definable fields have changed');
for (const f of NOT_YET_DEFINABLE)
  check(f.why && f.why.length > 20, `${f.field} carries no reason for staying empty`);
check(/NOT YET DEFINABLE/.test(md),
  'the artifact no longer marks archetype and difficultyEvidence as undefinable (§19)');
check(!METADATA_EXAMPLE.archetype && !METADATA_EXAMPLE.difficulty?.scale,
  'an archetype or difficulty scale has been attached to the metadata example');

// ── this ingestion asserts no exam strategies ──
check(CLAIMS.find(c => c.id === 'EK-STRAT-01')?.cls === 'NOT-SPECIFIED',
  'EK-STRAT-01 no longer records that these two sources define no exam strategies (§8)');

if (failures.length) {
  console.log(`FAIL validate-exam-kdg (${failures.length})`);
  for (const f of failures) console.log(`  • ${f}`);
  process.exit(1);
}
console.log(`validate-exam-kdg: ${sum(DSAT_TOPICS)}+${sum(ST1_TOPICS)} questions tile exactly, ` +
  `${KDG_NODES.length} nodes / ${KDG_EDGES.length} edges across ${EDGE_TYPES.length} relation kinds, ` +
  `${CLAIMS.length} claims graded, ${CONFLICTS.length} conflicts recorded unresolved — OK`);
