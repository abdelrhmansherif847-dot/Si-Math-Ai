#!/usr/bin/env node
/**
 * sync-exam-stimulus.mjs — generate the byte-identical browser copy of the
 * authored math stimulus renderer.
 *
 *   supabase/functions/_shared/exam-stimulus.core.js  (AUTHORED — edit here only)
 *     → exam-stimulus.js                               (browser entry)
 *
 * Run after editing the renderer. validate-exam-stimulus.mjs fails if the copy
 * drifts from the source, or if a generated preview still carries an older one
 * (same discipline as sync-taxonomy.mjs and sync-study-planner.mjs).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = resolve(root, 'supabase/functions/_shared/exam-stimulus.core.js');
export const TARGET = resolve(root, 'exam-stimulus.js');

export const BANNER =
  '/* AUTO-GENERATED from supabase/functions/_shared/exam-stimulus.core.js by scripts/sync-exam-stimulus.mjs — DO NOT EDIT. */\n';

// Only sync when this script is RUN directly.
//
// The validator imports BANNER from this module. sync-study-planner.mjs learned
// this the hard way: while its write ran at import time, running the VALIDATOR
// silently regenerated the copy and then asserted it was in sync — a drift
// guard that could never fail, because it repaired the file before checking it.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = readFileSync(SOURCE, 'utf8');
  writeFileSync(TARGET, BANNER + src);
  console.log('wrote', TARGET.replace(root + '/', ''));
  console.log('exam-stimulus sync complete');
}
