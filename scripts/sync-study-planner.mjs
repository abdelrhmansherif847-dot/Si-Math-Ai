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

const src = readFileSync(SOURCE, 'utf8');
writeFileSync(TARGET, BANNER + src);
console.log('wrote', TARGET.replace(root + '/', ''));
console.log('study-planner sync complete');
