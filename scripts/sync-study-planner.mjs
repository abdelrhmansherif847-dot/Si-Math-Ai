#!/usr/bin/env node
/**
 * sync-study-planner.mjs — generate the byte-identical browser copy of the
 * authored Study Planner engine.
 *
 *   supabase/functions/_shared/study-planner.core.js  (AUTHORED — edit here only;
 *                                                       Deno / Edge Function + Node)
 *     → study-planner.js                               (browser entry; chat.html loads this)
 *
 * Run after editing the engine. validate-study-planner.mjs fails if the copy
 * drifts from the source (same discipline as sync-taxonomy.mjs).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(root, 'supabase/functions/_shared/study-planner.core.js');
const TARGET = resolve(root, 'study-planner.js');

export const BANNER =
  '/* AUTO-GENERATED from supabase/functions/_shared/study-planner.core.js by scripts/sync-study-planner.mjs — DO NOT EDIT. */\n';

// Only sync when this script is RUN directly.
//
// validate-study-planner.mjs imports BANNER from this module. While the write
// executed at import time, running the VALIDATOR silently regenerated
// study-planner.js and then asserted it was in sync — a drift guard that could
// never fail, because it repaired the file before checking it. study-planner.js
// is shipped to the browser (chat.html loads it), so an engine/browser
// divergence could have reached production with the gate reporting green.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = readFileSync(SOURCE, 'utf8');
  writeFileSync(TARGET, BANNER + src);
  console.log('wrote', TARGET.replace(root + '/', ''));
  console.log('study-planner sync complete');
}
