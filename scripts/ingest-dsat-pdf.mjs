#!/usr/bin/env node
// Ingestion pipeline for a DSAT question PDF.
//
//   node scripts/ingest-dsat-pdf.mjs <file.pdf> --provenance=<id> [options]
//
//   --provenance=   one of: unknown | third_party | project_authored |
//                   real_released_practice | official_college_board
//   --evidence=     required for real_released_practice and official_college_board
//   --title=        human label for the source
//   --topic=        the DSAT topic the PDF is organised by, if it is
//   --dry-run       inspect and report, write nothing
//
// WHAT THIS SCRIPT DOES AND DOES NOT DO
//
// It does the mechanical half of the seventeen-step workflow: inspect, hash,
// classify provenance against the rules, extract to the corpus OUTSIDE this
// repository, and emit a coding manifest listing every page still to be read.
//
// It does NOT code questions. Steps 5–14 — topic, KDG nodes, representation,
// archetype, mechanisms, distractors, difficulty — are judgements about
// mathematics, and a script that guessed them would produce exactly the
// confident nonsense this knowledge base exists to avoid. The manifest is a
// worklist, not a result.
//
// Default provenance is `unknown`, and unknown is a resting state, not a gap.

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import * as S from './dsat-kb/schema.mjs';
import { pageCount, provenanceScan, extractUris } from './dsat-kb/pdf.mjs';
import * as R from './dsat-kb/registry.mjs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
const flag = k => args.includes(`--${k}`);

if (!file) {
  console.log('usage: node scripts/ingest-dsat-pdf.mjs <file.pdf> --provenance=<id> [--evidence=..] [--title=..] [--topic=..] [--dry-run]');
  console.log('       provenance: ' + S.PROVENANCE_IDS.join(' | '));
  process.exit(2);
}
if (!existsSync(file)) { console.log(`no such file: ${file}`); process.exit(2); }

const fail = m => { console.log(`REFUSED: ${m}`); process.exit(1); };

// ── 1. inspect ──────────────────────────────────────────────────────────────
const buf = readFileSync(file);
const sha256 = createHash('sha256').update(buf).digest('hex');
const md5 = createHash('md5').update(buf).digest('hex');
const name = basename(file);

// Page count from the PDF's own page tree, and a text-layer probe. Both are
// read from the bytes, so neither depends on a tool that may not be installed.
const text = buf.toString('latin1');
const pc = pageCount(buf);
const pages = pc.pages;
const hasFont = /\/Font\b/.test(text);
const hasImage = /\/Image\b/.test(text);
const revisions = (text.match(/%%EOF/g) || []).length;

console.log(`file        ${name}`);
console.log(`bytes       ${statSync(file).size}`);
console.log(`sha256      ${sha256}`);
console.log(`md5         ${md5}`);
console.log(`pages       ${pages ?? '?'}  (via ${pc.method}${pc.agree ? ', both routes agree' : `; /Count=${pc.byCount} page objects=${pc.byType}`})`);
console.log(`revisions   ${revisions}`);
console.log(`text layer  ${hasFont ? 'present' : 'ABSENT — image-only, pages must be read visually'}`);
console.log(`images      ${hasImage ? 'present' : 'none'}`);

// ── 3. provenance, with the no-silent-upgrade rule enforced here ────────────
const provenance = opt('provenance') ?? 'unknown';
if (!S.PROVENANCE_IDS.includes(provenance))
  fail(`provenance "${provenance}" is not one of ${S.PROVENANCE_IDS.join(' | ')}`);
const evidence = opt('evidence') ?? '';
if (S.provenanceNeedsEvidence(provenance) && !evidence.trim())
  fail(`provenance "${provenance}" requires --evidence="…". A source is never silently upgraded to official.`);

// ── 2. content-level provenance scan (D-1, as corrected) ────────────────────
// This CLASSIFIES. It does not discard: unofficial material is reference
// knowledge, and refusing to read it would be the wrong kind of caution. The one
// hard block is pinned by hash.
const scan = provenanceScan({ buf, text: '', uris: extractUris(buf) });
if (scan.hardExcluded) fail(`${scan.hardExcluded.what}: ${scan.hardExcluded.why}`);
if (scan.signals.length) {
  console.log('\nprovenance signals read from the file itself:');
  for (const sg of scan.signals)
    console.log(`  ${sg.id} x${sg.hits}  ${sg.means}  -> suggests ${sg.suggests}`);
  console.log(`  suggested provenance: ${scan.suggestedProvenance}`);
  if (scan.suggestedProvenance !== 'unknown' && provenance !== scan.suggestedProvenance)
    console.log(`  NOTE: --provenance=${provenance} was given; the file's own content suggests ${scan.suggestedProvenance}.`);
}


const existing = R.rows('sources');
const already = existing.find(s => s.sha256 === sha256);
if (already) {
  console.log(`\nALREADY REGISTERED as ${already.source_id} (provenance ${already.provenance}).`);
  if (S.provenanceRank(provenance) > S.provenanceRank(already.provenance))
    fail(`this run would upgrade ${already.source_id} from "${already.provenance}" to "${provenance}". ` +
         'Provenance upgrades are a deliberate, evidenced edit to sources.json, not a side effect of re-running ingest.');
  process.exit(0);
}

const sourceId = R.nextSourceId(existing);
const topic = opt('topic');
if (topic && !S.EXAM_TOPICS.DSAT.includes(topic))
  fail(`--topic="${topic}" is not a Digital SAT topic. One of: ${S.EXAM_TOPICS.DSAT.join(' | ')}`);

// ── 4. the corpus, outside the repository ───────────────────────────────────
const corpusDir = join(R.CORPUS_ROOT, sha256.slice(0, 12));

// The boundary is enforced HERE, before anything is written and before a dry run
// even reports a path — not only in CI. CI reads the same DSAT_CORPUS_ROOT this
// script does, so ingesting with it pointed inside the tree and then running CI
// without it would have passed while the corpus sat in the working tree.
try { R.assertCorpusOutsideRepo(corpusDir); }
catch (e) { fail(e.message); }
const manifest = {
  source_id: sourceId, source_file: name, sha256, md5,
  pages, text_layer: hasFont, image_only: !hasFont,
  declared_topic: topic ?? null,
  provenance, provenance_evidence: evidence || null,
  created: new Date().toISOString().slice(0, 10),
  // One row per page, to be filled in by the coding pass. Nothing is guessed.
  coding_worklist: Array.from({ length: pages ?? 0 }, (_, i) => ({
    page: i + 1, status: 'uncoded', questions_found: null, question_ids: [],
  })),
  next_steps: [
    'read each page and mark question boundaries',
    'code each question through scripts/dsat-kb/schema.mjs',
    'record UNKNOWN wherever evidence is absent — never infer to fill a field',
    'run node scripts/validate-dsat-kb.mjs',
  ],
};

if (flag('dry-run')) {
  console.log(`\nDRY RUN — nothing written.`);
  console.log(`would register  ${sourceId} (provenance ${provenance})`);
  console.log(`would extract to ${corpusDir}`);
  process.exit(0);
}

mkdirSync(corpusDir, { recursive: true });
writeFileSync(join(corpusDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const store = R.load('sources');
store.sources.push({
  source_id: sourceId, source_file: name, sha256, md5,
  bytes: statSync(file).size, pages,
  title: opt('title') ?? name,
  declared_topic: topic ?? null,
  provenance, provenance_confidence: provenance === 'unknown' ? 'UNKNOWN' : 'SOURCE-STATED',
  provenance_evidence: evidence || undefined,
  text_layer: hasFont, image_only: !hasFont,
  corpus_dir: corpusDir,          // outside the repository, by construction
  registered: new Date().toISOString().slice(0, 10),
  questions_coded: 0,
});
R.save('sources', store);

console.log(`\nregistered  ${sourceId}`);
console.log(`corpus      ${corpusDir}  (outside the repository — question text stays here)`);
console.log(`manifest    ${join(corpusDir, 'manifest.json')}  ${pages ?? 0} pages, all uncoded`);
console.log(`\nSteps 5–14 are a coding pass, not a script. Nothing has been classified.`);
console.log(`Next: node scripts/validate-dsat-kb.mjs`);
