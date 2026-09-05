#!/usr/bin/env node
// CI gate for the DSAT Question Knowledge Base — the command-line wrapper.
//
// Every check lives in scripts/dsat-kb/gate.mjs so it can be tested directly
// against synthetic stores. This file only loads the four stores from disk,
// reports what the gate found, and sets the exit code.
//
// It runs on every commit, including now, with the registries empty. Most of
// what can go wrong here is structural, and structure can be checked before
// there is any data.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as R from './dsat-kb/registry.mjs';
import { gate } from './dsat-kb/gate.mjs';

const data = {}, raw = {}, storeIssues = [];
for (const [name, meta] of Object.entries(R.STORES)) {
  const path = join(R.REGISTRY_DIR, meta.file);
  if (!existsSync(path)) { storeIssues.push({ code: 'STORE-MISSING', message: `registry store ${meta.file} is missing` }); continue; }
  const text = readFileSync(path, 'utf8');
  raw[meta.file] = text;
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) { storeIssues.push({ code: 'STORE-MALFORMED-JSON', message: `${meta.file} is not valid JSON: ${e.message}` }); continue; }
  if (parsed.schema_version !== 1)
    storeIssues.push({ code: 'STORE-SCHEMA-VERSION', message: `${meta.file} has no schema_version 1` });
  if (!Array.isArray(parsed[meta.key]))
    storeIssues.push({ code: 'STORE-SHAPE', message: `${meta.file} has no ${meta.key} array` });
  data[name] = parsed[meta.key] ?? [];
}

const found = gate({ ...data, raw, storeIssues });

if (found.length) {
  console.log(`FAIL validate-dsat-kb (${found.length})`);
  for (const f of found.slice(0, 40)) console.log(`  • [${f.code}] ${f.message}`);
  if (found.length > 40) console.log(`  … ${found.length - 40} more`);
  process.exit(1);
}
const n = k => (data[k] ?? []).length;
const taxOpen = (data.conflicts ?? []).filter(c => c.kind === 'TAXONOMY_CONFLICT' && c.status === 'open').length;
console.log(`validate-dsat-kb: ${n('sources')} sources, ${n('questions')} questions, ` +
  `${n('archetypes')} archetypes, ${n('conflicts')} conflicts (${taxOpen} taxonomy, open) — ` +
  `bound to 33 frozen subtopics and 35 KDG nodes — OK`);
