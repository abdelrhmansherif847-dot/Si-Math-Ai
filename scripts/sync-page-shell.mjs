#!/usr/bin/env node
/**
 * sync-page-shell.mjs — rewrites the nav and footer of the hand-written
 * Knowledge Center pages from scripts/_page-shell.mjs.
 *
 * The generated pages (faq.html, learn*.html) already build their shell from
 * that module. The hand-written ones — about, principles, how-it-works,
 * why-not-chatgpt, ai-knowledge, founder-badge — would otherwise each carry a
 * private copy, and adding a page would mean remembering to edit six footers.
 * One would get missed, and the new page would be an orphan nowhere linked.
 *
 * So the module stays the single definition and this script propagates it.
 *
 *   node scripts/sync-page-shell.mjs           # rewrite the pages
 *   node scripts/sync-page-shell.mjs --check   # fail if any page has drifted
 *
 * validate-knowledge-layer.mjs runs the --check form in CI.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nav, footer } from './_page-shell.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const check = process.argv.includes('--check');

/** Hand-written pages. Generated pages build their own shell from the module. */
export const SHELL_PAGES = [
  'about.html',
  'why-we-built-si-math-ai.html',
  'trust.html',
  'architecture.html',
  'principles.html',
  'how-it-works.html',
  'why-not-chatgpt.html',
  'ai-knowledge.html',
  'founder-badge.html',
];

const NAV_RE = /<nav class="k-nav">[\s\S]*?<\/nav>/;
const FOOTER_RE = /<footer class="k-footer">[\s\S]*?<\/footer>/;

let changed = 0;
const drifted = [];

for (const file of SHELL_PAGES) {
  const path = resolve(REPO, file);
  const src = readFileSync(path, 'utf8');

  if (!NAV_RE.test(src)) throw new Error(`${file}: no <nav class="k-nav"> block found`);
  if (!FOOTER_RE.test(src)) throw new Error(`${file}: no <footer class="k-footer"> block found`);

  // A page marks its own nav item current only if it appears in the nav at all;
  // principles / ai-knowledge / founder-badge live in the footer instead.
  const out = src.replace(NAV_RE, nav(file)).replace(FOOTER_RE, footer());

  if (out === src) continue;
  if (check) { drifted.push(file); continue; }
  writeFileSync(path, out);
  changed++;
  console.log(`  synced ${file}`);
}

if (check) {
  if (drifted.length) {
    console.error(`FAIL  ${drifted.length} page(s) have a nav/footer that differs from _page-shell.mjs:`);
    for (const f of drifted) console.error(`        ${f}`);
    console.error('      run: node scripts/sync-page-shell.mjs');
    process.exit(1);
  }
  console.log(`PASS  ${SHELL_PAGES.length} hand-written pages match _page-shell.mjs`);
} else {
  console.log(changed ? `synced ${changed} page(s)` : 'all pages already in sync');
}
