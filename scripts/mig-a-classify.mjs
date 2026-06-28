#!/usr/bin/env node
/**
 * mig-a-classify.mjs — Phase 4 MIG-A dry-run classifier (READ-ONLY analysis).
 *
 * Reads a JSON array of { topic, subtopic, n } legacy pairs on stdin and buckets
 * each through the canonical resolver (taxonomy.core.js). NO writes — produces the
 * migration plan only.
 *
 * Buckets:
 *   CONFIDENT_FULL   — topic resolves AND subtopic resolves (or subtopic blank).
 *                      → backfill topic_id + subtopic_id automatically.
 *   CONFIDENT_TOPIC  — topic resolves, subtopic present but unmapped.
 *                      → backfill topic_id; subtopic_id NULL; subtopic = NEEDS_REVIEW alias.
 *   NEEDS_REVIEW     — topic is academic but does not resolve (alias-curation candidate).
 *   NON_ACADEMIC     — system/non-academic topic ('General','Coaching',Arabic-generic,…).
 *                      → leave as-is; excluded from Focus Plan generation.
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const T = require(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'taxonomy.core.js'));

const raw = await new Promise((r) => { let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>r(s)); });
const rows = JSON.parse(raw);

const buckets = { CONFIDENT_FULL: [], CONFIDENT_TOPIC: [], NEEDS_REVIEW: [], NON_ACADEMIC: [] };
const tally = { CONFIDENT_FULL: 0, CONFIDENT_TOPIC: 0, NEEDS_REVIEW: 0, NON_ACADEMIC: 0 };

for (const row of rows) {
  const topic = row.topic === '(blank)' ? '' : row.topic;
  const subtopic = row.subtopic === '(blank)' ? '' : row.subtopic;
  const n = row.n || 0;
  const tid = T.resolveTopicId(topic);
  if (!tid) {
    const b = T.isAcademicTopic(topic) ? 'NEEDS_REVIEW' : 'NON_ACADEMIC';
    buckets[b].push({ topic, subtopic, n }); tally[b] += n; continue;
  }
  const sid = subtopic ? T.resolveSubtopicId(tid, subtopic) : null;
  if (!subtopic || sid) { buckets.CONFIDENT_FULL.push({ topic, subtopic, tid, sid, n }); tally.CONFIDENT_FULL += n; }
  else { buckets.CONFIDENT_TOPIC.push({ topic, subtopic, tid, n }); tally.CONFIDENT_TOPIC += n; }
}

const rowsTotal = rows.reduce((a,r)=>a+(r.n||0),0);
const pairsTotal = rows.length;
console.log('=== MIG-A DRY-RUN (read-only) ===');
console.log(`distinct pairs: ${pairsTotal} | total rows: ${rowsTotal}\n`);
for (const k of Object.keys(buckets)) {
  console.log(`${k}: ${buckets[k].length} distinct pairs, ${tally[k]} rows`);
}
console.log('\n--- NEEDS_REVIEW (academic topic, no canonical match — alias-curation candidates) ---');
buckets.NEEDS_REVIEW.sort((a,b)=>b.n-a.n).slice(0,25).forEach(x=>console.log(`  [${x.n}] ${x.topic} / ${x.subtopic}`));
console.log('\n--- CONFIDENT_TOPIC (topic maps; subtopic needs an alias) top 20 ---');
buckets.CONFIDENT_TOPIC.sort((a,b)=>b.n-a.n).slice(0,20).forEach(x=>console.log(`  [${x.n}] ${x.topic}/${x.subtopic} -> ${x.tid}/(subtopic NULL)`));
