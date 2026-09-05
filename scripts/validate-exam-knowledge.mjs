#!/usr/bin/env node
// Gate on the exam-knowledge ingestion (docs/knowledge/exam-knowledge/).
//
// The ingestion brief asked for two things this validator makes executable:
// that no page of the source is silently omitted, and that every extracted
// claim keeps the evidence class it was graded at. Both are the kind of thing
// that decays quietly — a page drops out of a table during an edit, a hedged
// claim gets firmed up in prose while the register still says INFERRED — and
// neither would be caught by reading.
//
// So this checks the markdown and the data module against each other. Their
// claim IDs must agree in both directions: a claim discussed in prose but
// missing from the register is an ungraded assertion, and a registered claim
// no one discusses is a stale row.
//
// It deliberately does NOT check the source PDF. That file lives outside the
// repository (§1.4) and CI has no access to it. What it checks is that the
// record of it stays internally honest.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SOURCE, PAGE_INVENTORY, TEST_TYPES, DIFFICULTY_BANDS, CARRIERS, TOPICS,
  CLAIMS, CONFLICTS, ITEM_LOG_AGGREGATE, FORM_DNA, CONSTRUCTION_RULES, RULE_CLASSES,
} from '../docs/knowledge/exam-knowledge/exam-knowledge-01.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DOC = join(here, '..', 'docs', 'knowledge', 'exam-knowledge', '01-exam-knowledge-ingestion.md');
const md = readFileSync(DOC, 'utf8');

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

// ── the source, and the page count that was measured rather than believed ──
check(SOURCE.pages === 24, `source is recorded as ${SOURCE.pages} pages, ingestion read 24`);
check(SOURCE.harnessReportedPages !== SOURCE.pages,
  'the harness page count and the measured page count are recorded as equal — ' +
  'they disagreed (58 vs 24), and that disagreement is why the file was measured');
check(/^[0-9a-f]{64}$/.test(SOURCE.sha256), 'source sha256 is not a 64-hex digest');
check(SOURCE.textLayerChars === 0,
  'source is recorded as having a text layer; it is image-only, which is why ' +
  'every reading carries a confidence grade');
check(md.includes(SOURCE.sha256), 'the artifact does not carry the source sha256');
check(md.includes(SOURCE.md5), 'the artifact does not carry the source md5');

// ── every page accounted for, exactly once ──
const seen = new Set();
for (const p of PAGE_INVENTORY) {
  check(!seen.has(p.page), `page ${p.page} appears twice in the inventory`);
  seen.add(p.page);
  check(p.cls && p.note, `page ${p.page} has no class or no note`);
}
check(seen.size === SOURCE.pages,
  `page inventory covers ${seen.size} pages, source has ${SOURCE.pages}`);
for (let i = 1; i <= SOURCE.pages; i++) check(seen.has(i), `page ${i} is missing from the inventory`);

// ── identifiers unique across every register ──
const ids = [...CLAIMS, ...CONSTRUCTION_RULES, ...TEST_TYPES, ...DIFFICULTY_BANDS, ...CARRIERS, ...TOPICS, ...CONFLICTS]
  .map(x => x.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
check(dupes.length === 0, `duplicate identifiers: ${[...new Set(dupes)].join(', ')}`);

// ── evidence classes ──
const EV = ['SOURCE-STATED', 'INFERRED', 'NOT-SPECIFIED', 'UNKNOWN'];
for (const c of CLAIMS) {
  check(EV.includes(c.cls), `${c.id} has evidence class "${c.cls}", not one of ${EV.join('/')}`);
  check(c.text && c.text.length > 8, `${c.id} has no readable text`);
}
// The document asserts no obligations. If a later edit grades something a hard
// rule, that is a claim about the SOURCE which the source does not support.
for (const r of CONSTRUCTION_RULES) {
  check(RULE_CLASSES.includes(r.cls), `${r.id} has rule class "${r.cls}", not one of ${RULE_CLASSES.join('/')}`);
  check(r.cls !== 'HARD-RULE',
    `${r.id} is graded HARD-RULE — the source is a notebook and asserts no obligations (§0)`);
  check(r.executable === false,
    `${r.id} is marked executable; no rule in this source is quantified enough to build to (§10)`);
}

// ── markdown and register agree in both directions ──
const inDoc = new Set((md.match(/SK-[A-Z]+-\d+/g) || []));
const inData = new Set([...CLAIMS, ...CONSTRUCTION_RULES].map(x => x.id));
for (const id of inData) check(inDoc.has(id), `${id} is registered but never discussed in the artifact`);
for (const id of inDoc) check(inData.has(id), `${id} is discussed in the artifact but carries no evidence class`);

// ── the four types ──
check(TEST_TYPES.length === 4, `${TEST_TYPES.length} test types recorded, the source names four`);
check(TEST_TYPES.map(t => t.ordinal).join() === '1,2,3,4', 'test-type ordinals are not 1..4');
check(TEST_TYPES.filter(t => t.scorePredictor).length === 1,
  'exactly one type is described as predicting the real score (SK-TYPE-02)');

// ── conflicts stay recorded ──
check(CONFLICTS.length >= 2, 'the two recorded conflicts have been dropped (§12.1, §12.2)');
for (const c of CONFLICTS) {
  check(c.a && c.b, `${c.id} does not carry both statements — a conflict needs both sides`);
  check(c.resolved === false,
    `${c.id} is marked resolved; the source does not resolve it, and resolving it here would be invention`);
}

// ── aggregate arithmetic, since these numbers were computed not asserted ──
const a = ITEM_LOG_AGGREGATE;
check(a.rowsWithTopic <= a.rowsTranscribed, 'more rows carry a topic than were transcribed');
check(a.forms * 2 === a.modules, `${a.forms} forms should give ${a.forms * 2} modules, ${a.modules} recorded`);
check(a.rowsTranscribed === a.modules * a.questionsPerModule - 1,
  `${a.modules}×${a.questionsPerModule} slots less the one skipped index should be ` +
  `${a.modules * a.questionsPerModule - 1}, ${a.rowsTranscribed} recorded`);
const conf = a.confidence.high + a.confidence.med + a.confidence.low;
check(conf === a.rowsTranscribed, `confidence grades total ${conf}, rows total ${a.rowsTranscribed}`);
const [m1c, m1n] = a.composite.byModulePosition.MOD1;
const [m2c, m2n] = a.composite.byModulePosition.MOD2;
check(m1c + m2c === a.composite.total, `composite by module sums to ${m1c + m2c}, total says ${a.composite.total}`);
check(m1n + m2n === a.composite.ofRows, `module denominators sum to ${m1n + m2n}, rows-with-topic says ${a.composite.ofRows}`);
check(a.composite.ofRows === a.rowsWithTopic, 'composite denominator disagrees with rows-with-topic');

// ── the DNA chain records where it breaks ──
const OK = ['present', 'partial', 'absent'];
for (const [k, v] of Object.entries(FORM_DNA)) check(OK.includes(v), `FORM_DNA.${k} is "${v}"`);
check(Object.values(FORM_DNA).includes('absent'),
  'FORM_DNA claims a complete chain; three levels are absent from this source (§13.5)');

// ── the §11 distribution table is derived, not typed ──
// A validator cannot adjudicate whether a claim is source-stated or inferred —
// that is a judgement about a PDF CI cannot see. What it can do is pin the
// shape of the register, so quietly upgrading hedged claims moves the counts
// and trips. This check found the table wrong on its first run: it read
// 21/9/12/5, written from the prose lists instead of counted.
const dist = {};
for (const c of CLAIMS) dist[c.cls] = (dist[c.cls] || 0) + 1;
for (const [cls, n] of Object.entries(dist)) {
  const label = cls === 'NOT-SPECIFIED' ? 'NOT SPECIFIED'
    : cls === 'UNKNOWN' ? 'UNKNOWN / AMBIGUOUS' : cls;
  const row = new RegExp(`\\*\\*${label.replace(/[/]/g, '.')}\\*\\* \\| ${n} `);
  check(row.test(md), `§11 does not record ${n} ${cls} claims; the register holds ${n}`);
}
check(md.includes(`| | **${CLAIMS.length}** |`),
  `§11 does not record the claim total of ${CLAIMS.length}`);
const ruleDist = {};
for (const r of CONSTRUCTION_RULES) ruleDist[r.cls] = (ruleDist[r.cls] || 0) + 1;
check(new RegExp(`\\*\\*${ruleDist.PATTERN} PATTERN,\\s+${ruleDist.PREFERENCE}\\s+PREFERENCE`).test(md),
  `§11 does not record the rule distribution (${ruleDist.PATTERN} PATTERN, ${ruleDist.PREFERENCE} PREFERENCE)`);
check(!ruleDist['HARD-RULE'] && !ruleDist.RANGE,
  'a rule is graded HARD-RULE or RANGE; §11 records both as zero');

// Each claim must appear in EXACTLY ONE §11 class list, and it must be the list
// matching its registered class. Checking only "appears under its own class"
// would miss a claim quietly added to a second, stronger list as well.
const LABEL = { 'SOURCE-STATED': 'SOURCE-STATED', 'INFERRED': 'INFERRED',
  'NOT-SPECIFIED': 'NOT SPECIFIED', 'UNKNOWN': 'UNKNOWN / AMBIGUOUS' };
const blocks = {};
for (const [cls, label] of Object.entries(LABEL)) {
  const m = md.match(new RegExp(`\\*\\*${label.replace(/[/]/g, '.')} \\(\\d+\\)\\*\\* —([\\s\\S]*?)\\n\\n`));
  check(m, `§11 has no register block for ${label}`);
  blocks[cls] = m ? m[1] : '';
}
for (const c of CLAIMS) {
  const inBlocks = Object.entries(blocks).filter(([, b]) => b.includes(`\`${c.id}\``)).map(([k]) => k);
  check(inBlocks.length === 1,
    `${c.id} appears in ${inBlocks.length} §11 register blocks (${inBlocks.join(', ') || 'none'}); it must appear in exactly one`);
  check(inBlocks[0] === c.cls,
    `${c.id} is graded ${c.cls} but §11 lists it under ${inBlocks[0]}`);
}

// ── the artifact still says what it is ──
check(/handwritten personal notebook/i.test(md), 'the artifact no longer states that the source is a notebook');
check(/NOT SPECIFIED|NOT-SPECIFIED/.test(md), 'the artifact records no gaps at all, which cannot be right');

if (failures.length) {
  console.log(`FAIL validate-exam-knowledge (${failures.length})`);
  for (const f of failures) console.log(`  • ${f}`);
  process.exit(1);
}
console.log(`validate-exam-knowledge: ${SOURCE.pages}/${SOURCE.pages} pages inventoried, ` +
  `${CLAIMS.length} claims graded, ${CONSTRUCTION_RULES.length} rules classified, ` +
  `${CONFLICTS.length} conflicts recorded unresolved — OK`);
