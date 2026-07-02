#!/usr/bin/env node
/**
 * mig-a-classify.mjs — Phase 4 MIG-A dry-run classifier (READ-ONLY analysis).
 *
 * Reads a JSON array of { topic, subtopic, n } legacy pairs on stdin and buckets
 * each through the canonical resolver (taxonomy.core.js). NO writes, NO DB access
 * — it classifies whatever the extraction query (scripts/mig-a-extract.sql) piped
 * in, and emits a migration-grade report on stdout only.
 *
 * Buckets & MIG-B1 write-eligibility (P1: only CONFIDENT_FULL is eligible):
 *   CONFIDENT_FULL   — topic resolves AND (subtopic blank OR subtopic resolves).
 *                      → WRITE-ELIGIBLE: backfill topic_id (+ subtopic_id if present).
 *   CONFIDENT_TOPIC  — topic resolves, subtopic present but unmapped.
 *                      → SKIP. Never more permissive than the live resolver, which
 *                        rejects a non-blank unmapped subtopic outright.
 *   NEEDS_REVIEW     — academic topic (2+ chars, not a system label) that does not
 *                      resolve. → SKIP (alias-curation candidate).
 *   UNMAPPED         — blank / missing / <2-char topic (cannot be mapped at all).
 *                      → SKIP.
 *   NON_ACADEMIC     — recognized SYSTEM_TOPICS only ('General','Coaching',…).
 *                      → SKIP (deliberately excluded from the taxonomy).
 *
 * Reconciliation: Σ(bucket pairs) == input pairs and Σ(bucket rows) == input rows
 * are asserted; if MIGA_SOURCE_ROWCOUNT is supplied it is checked against the
 * extracted row total (proves the extract covered the whole table). Any mismatch
 * sets a non-zero exit code so a broken extract cannot be silently approved.
 *
 * Provenance inputs (all read-only; env or local file — never the DB):
 *   MIGA_SOURCE_TABLE     source table name        (default 'weakness_signals')
 *   MIGA_QUERY_FILE       path to extraction SQL   (default scripts/mig-a-extract.sql)
 *   MIGA_SOURCE_ROWCOUNT  SELECT COUNT(*) of table (optional; enables full reconcile)
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const T = require(resolve(HERE, '..', 'taxonomy.core.js'));

const SOURCE_TABLE = process.env.MIGA_SOURCE_TABLE || 'weakness_signals';
const QUERY_FILE = process.env.MIGA_QUERY_FILE || resolve(HERE, 'mig-a-extract.sql');
let SOURCE_QUERY = '(not provided — set MIGA_QUERY_FILE)';
try { SOURCE_QUERY = readFileSync(QUERY_FILE, 'utf8').trim(); } catch { /* optional */ }
const EXPECTED_ROWCOUNT =
  process.env.MIGA_SOURCE_ROWCOUNT != null && process.env.MIGA_SOURCE_ROWCOUNT !== ''
    ? Number(process.env.MIGA_SOURCE_ROWCOUNT) : null;
const RUN_TS = new Date().toISOString();

const raw = await new Promise((r) => { let s = ''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => r(s)); });
const rows = JSON.parse(raw);

const buckets = { CONFIDENT_FULL: [], CONFIDENT_TOPIC: [], NEEDS_REVIEW: [], UNMAPPED: [], NON_ACADEMIC: [] };
const tally = { CONFIDENT_FULL: 0, CONFIDENT_TOPIC: 0, NEEDS_REVIEW: 0, UNMAPPED: 0, NON_ACADEMIC: 0 };

for (const row of rows) {
  const topic = row.topic === '(blank)' || row.topic == null ? '' : String(row.topic);
  const subtopic = row.subtopic === '(blank)' || row.subtopic == null ? '' : String(row.subtopic);
  const n = Number(row.n) || 0;

  let b;
  if (!topic || topic.trim().length < 2) {
    b = 'UNMAPPED';
    buckets.UNMAPPED.push({ topic, subtopic, n });
  } else {
    const tid = T.resolveTopicId(topic);
    if (!tid) {
      b = T.isAcademicTopic(topic) ? 'NEEDS_REVIEW' : 'NON_ACADEMIC';
      buckets[b].push({ topic, subtopic, n });
    } else {
      const sid = subtopic ? T.resolveSubtopicId(tid, subtopic) : null;
      if (!subtopic || sid) { b = 'CONFIDENT_FULL'; buckets.CONFIDENT_FULL.push({ topic, subtopic, tid, sid: sid || null, n }); }
      else { b = 'CONFIDENT_TOPIC'; buckets.CONFIDENT_TOPIC.push({ topic, subtopic, tid, n }); }
    }
  }
  tally[b] += n;
}

const byN = (a, b) => b.n - a.n || String(a.topic).localeCompare(String(b.topic)) || String(a.subtopic).localeCompare(String(b.subtopic));
for (const k of Object.keys(buckets)) buckets[k].sort(byN);

const pairsTotal = rows.length;
const rowsTotal = rows.reduce((a, r) => a + (Number(r.n) || 0), 0);
const bucketPairs = Object.values(buckets).reduce((a, x) => a + x.length, 0);
const bucketRows = Object.values(tally).reduce((a, x) => a + x, 0);
const pct = (x) => rowsTotal ? (100 * x / rowsTotal).toFixed(1) + '%' : '0.0%';

const ELIGIBLE = { CONFIDENT_FULL: 'WRITE-ELIGIBLE (MIG-B1)', CONFIDENT_TOPIC: 'SKIP', NEEDS_REVIEW: 'SKIP', UNMAPPED: 'SKIP', NON_ACADEMIC: 'SKIP' };

let ok = true;
const check = (label, cond) => { if (!cond) ok = false; return `  [${cond ? 'PASS' : 'FAIL'}] ${label}`; };

const L = [];
L.push('════════════════════════════════════════════════════════════════');
L.push(' MIG-A DRY-RUN CLASSIFICATION REPORT (read-only — no writes)');
L.push('════════════════════════════════════════════════════════════════');
L.push(`source table   : ${SOURCE_TABLE}`);
L.push(`generated at    : ${RUN_TS}`);
L.push(`distinct pairs  : ${pairsTotal}`);
L.push(`total rows      : ${rowsTotal}`);
L.push('');
L.push('--- extraction query / provenance ---');
L.push(SOURCE_QUERY);
L.push('');
L.push('--- bucket summary (MIG-B1 eligibility) ---');
for (const k of Object.keys(buckets)) {
  L.push(`  ${k.padEnd(16)} ${String(buckets[k].length).padStart(5)} pairs  ${String(tally[k]).padStart(8)} rows  ${pct(tally[k]).padStart(7)}   ${ELIGIBLE[k]}`);
}
L.push('');
L.push('--- reconciliation ---');
L.push(check(`pairs accounted: Σbuckets ${bucketPairs} == input ${pairsTotal}`, bucketPairs === pairsTotal));
L.push(check(`rows accounted : Σbuckets ${bucketRows} == input ${rowsTotal}`, bucketRows === rowsTotal));
if (EXPECTED_ROWCOUNT != null) {
  L.push(check(`table coverage : extracted ${rowsTotal} == COUNT(*) ${EXPECTED_ROWCOUNT}`, rowsTotal === EXPECTED_ROWCOUNT));
} else {
  L.push('  [SKIP] table coverage : set MIGA_SOURCE_ROWCOUNT to verify extract covers the whole table');
}

const dump = (title, arr, fmt) => { L.push(''); L.push(`--- ${title} (${arr.length} pairs) ---`); if (!arr.length) L.push('  (none)'); else arr.forEach(x => L.push(fmt(x))); };
dump('CONFIDENT_FULL — WRITE-ELIGIBLE (MIG-B1): legacy → canonical', buckets.CONFIDENT_FULL,
  x => `  [${x.n}] ${x.topic} / ${x.subtopic || '(topic-level)'}  ->  ${x.tid} / ${x.sid || '(none)'}`);
dump('CONFIDENT_TOPIC — SKIP (topic maps; subtopic needs an alias)', buckets.CONFIDENT_TOPIC,
  x => `  [${x.n}] ${x.topic} / ${x.subtopic}  ->  ${x.tid} / (subtopic UNRESOLVED — SKIP)`);
dump('NEEDS_REVIEW — SKIP (academic topic, no canonical match)', buckets.NEEDS_REVIEW,
  x => `  [${x.n}] ${x.topic} / ${x.subtopic || '(none)'}`);
dump('UNMAPPED — SKIP (blank / missing topic, cannot map)', buckets.UNMAPPED,
  x => `  [${x.n}] "${x.topic}" / "${x.subtopic}"`);
dump('NON_ACADEMIC — SKIP (recognized system topic)', buckets.NON_ACADEMIC,
  x => `  [${x.n}] ${x.topic} / ${x.subtopic || '(none)'}`);

L.push('');
L.push(`RESULT: ${ok ? 'reconciliation PASS' : 'reconciliation FAIL — do not approve'}`);
console.log(L.join('\n'));
if (!ok) process.exitCode = 1;
