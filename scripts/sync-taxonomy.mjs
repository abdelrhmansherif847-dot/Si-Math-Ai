#!/usr/bin/env node
/**
 * sync-taxonomy.mjs — generate the byte-identical copies of the single authored
 * taxonomy source (taxonomy.core.js) consumed by the browser and the Edge Function.
 *
 *   taxonomy.core.js  (AUTHORED — edit here only)
 *     → taxonomy.js                                  (browser entry)
 *     → supabase/functions/_shared/taxonomy.core.js  (Deno / Edge Function)
 *
 * Run after editing taxonomy.core.js. CI / validate-taxonomy.mjs fails if the
 * copies drift from the source.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(root, 'taxonomy.core.js');
const TARGETS = [
  resolve(root, 'taxonomy.js'),
  resolve(root, 'supabase/functions/_shared/taxonomy.core.js'),
];

const BANNER =
  '/* AUTO-GENERATED from taxonomy.core.js by scripts/sync-taxonomy.mjs — DO NOT EDIT. */\n';

const src = readFileSync(SOURCE, 'utf8');
for (const target of TARGETS) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, BANNER + src);
  console.log('wrote', target.replace(root + '/', ''));
}
console.log('taxonomy sync complete');
