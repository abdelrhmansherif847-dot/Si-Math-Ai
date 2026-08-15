#!/usr/bin/env node
// audit-tokens.mjs — report design-token divergence across the site.
//
// Si Math AI defines its design tokens in two places by architecture:
//   * 27 knowledge/marketing pages link assets/knowledge.css — already one source.
//   * 19 app pages each carry a PRIVATE inline :root block — where drift lives.
//
// This script reads every base :root block, canonicalises each value, and
// classifies every divergence so that "safe to normalise" is separated from
// "changes what a student sees". It CHANGES NOTHING — it only reports.
//
//   node scripts/audit-tokens.mjs           # human-readable report
//   node scripts/audit-tokens.mjs --json    # machine-readable
//
// Exit code is always 0: divergence is a finding to triage, not a build break.
// The CI drift gate comes later, once a single source exists to check against.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_OUT = process.argv.includes('--json');

/* ── sources ───────────────────────────────────────────────────────────────── */

const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
const SHARED = 'assets/knowledge.css';
const sources = [...pages, SHARED];

/** The first `:root{…}` in a file — the base block, not a media-query override. */
function baseRoot(src) {
  const i = src.search(/:root\s*\{/);
  if (i < 0) return null;
  const start = src.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && !--depth) return src.slice(start + 1, j);
  }
  return null;
}

/* ── canonicalisation ──────────────────────────────────────────────────────── */

/** Parse a colour to {r,g,b,a} so `#fff` and `#ffffff` compare equal. */
function toRGBA(v) {
  let m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) {
    const p = m[1].split(',').map((x) => x.trim());
    if (p.length < 3) return null;
    return { r: +p[0], g: +p[1], b: +p[2], a: p[3] === undefined ? 1 : parseFloat(p[3]) };
  }
  return null;
}

/** What the browser actually renders — the basis for "cosmetic vs visible". */
function rendered(v) {
  const c = toRGBA(v.trim());
  if (c) return `rgba(${c.r},${c.g},${c.b},${Number.isNaN(c.a) ? 1 : c.a})`;
  // Not a colour: collapse whitespace and normalise quotes so font stacks and
  // lengths compare on substance rather than spacing.
  return v.trim().replace(/\s+/g, ' ').replace(/"/g, "'").toLowerCase();
}

/* ── collect ───────────────────────────────────────────────────────────────── */

const defs = new Map(); // token -> [{file, raw, rendered}]
for (const f of sources) {
  let src;
  try { src = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
  const block = baseRoot(src);
  if (!block) continue;
  for (const m of block.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
    if (!defs.has(m[1])) defs.set(m[1], []);
    defs.get(m[1]).push({ file: f, raw: m[2].trim(), rendered: rendered(m[2]) });
  }
}

/* ── classify ──────────────────────────────────────────────────────────────── */

// Values that legitimately differ per surface. Unifying these would be a
// regression, not a fix: a 262px chat sidebar and a 248px admin sidebar are two
// design decisions, not one decision written down inconsistently.
const SURFACE_SPECIFIC = new Set(['--nav-h', '--side-w', '--container-x', '--section-y',
  '--fs-h1', '--fs-h2', '--fs-h3', '--fs-body']);

const report = [];
for (const [token, list] of [...defs].sort()) {
  const rawSet = new Set(list.map((d) => d.raw));
  const renderedSet = new Set(list.map((d) => d.rendered));
  let kind;
  if (renderedSet.size > 1) kind = SURFACE_SPECIFIC.has(token) ? 'surface' : 'visible';
  else if (rawSet.size > 1) kind = 'cosmetic';
  else kind = 'agreed';

  // Majority by rendered value; ties break on the alphabetically-first value so
  // the result never depends on directory order.
  const byRendered = new Map();
  for (const d of list) {
    if (!byRendered.has(d.rendered)) byRendered.set(d.rendered, []);
    byRendered.get(d.rendered).push(d);
  }
  const ranked = [...byRendered].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  report.push({
    token, kind, defs: list.length,
    majority: ranked[0][1][0].raw,
    majorityCount: ranked[0][1].length,
    variants: ranked.map(([r, ds]) => ({ rendered: r, raw: [...new Set(ds.map((d) => d.raw))], files: ds.map((d) => d.file) })),
  });
}

const byKind = (k) => report.filter((r) => r.kind === k);

/* ── per-page impact ───────────────────────────────────────────────────────── */

const impact = new Map(); // file -> {visible:[], cosmetic:[]}
for (const r of report) {
  if (r.kind !== 'visible' && r.kind !== 'cosmetic') continue;
  for (const v of r.variants.slice(1)) {
    for (const f of v.files) {
      if (!impact.has(f)) impact.set(f, { visible: [], cosmetic: [] });
      impact.get(f)[r.kind].push({ token: r.token, from: v.raw[0], to: r.majority });
    }
  }
}

/* ── output ────────────────────────────────────────────────────────────────── */

if (JSON_OUT) {
  console.log(JSON.stringify({
    sources: sources.length,
    pagesSharingStylesheet: pages.filter((p) => readFileSync(join(ROOT, p), 'utf8').includes(SHARED)).length,
    pagesWithOwnRoot: sources.filter((f) => baseRoot(readFileSync(join(ROOT, f), 'utf8') ?? '')).length,
    counts: { total: report.length, agreed: byKind('agreed').length, cosmetic: byKind('cosmetic').length, visible: byKind('visible').length, surface: byKind('surface').length },
    report,
    impact: Object.fromEntries(impact),
  }, null, 2));
} else {
  const shared = pages.filter((p) => readFileSync(join(ROOT, p), 'utf8').includes(SHARED)).length;
  const own = sources.filter((f) => baseRoot(readFileSync(join(ROOT, f), 'utf8') ?? '')).length;
  console.log(`Si Math AI — design token audit\n${'='.repeat(60)}`);
  console.log(`${pages.length} pages · ${shared} share ${SHARED} · ${own} define their own :root`);
  console.log(`${report.length} distinct tokens\n`);
  console.log(`  agreed    ${String(byKind('agreed').length).padStart(3)}  identical everywhere`);
  console.log(`  cosmetic  ${String(byKind('cosmetic').length).padStart(3)}  same rendered value, different notation — safe to normalise`);
  console.log(`  visible   ${String(byKind('visible').length).padStart(3)}  RENDER DIFFERENTLY — each needs a decision`);
  console.log(`  surface   ${String(byKind('surface').length).padStart(3)}  legitimately per-surface — do not unify\n`);

  for (const [label, kind] of [['VISIBLE DIVERGENCE — needs a decision', 'visible'],
                               ['SURFACE-SPECIFIC — leave alone', 'surface'],
                               ['COSMETIC — normalise for free', 'cosmetic']]) {
    const rows = byKind(kind);
    if (!rows.length) continue;
    console.log(`\n${label}\n${'-'.repeat(60)}`);
    for (const r of rows) {
      console.log(`${r.token}`);
      for (const v of r.variants) {
        console.log(`    ${v.raw.join(' / ').padEnd(46)} ×${String(v.files.length).padStart(2)}  ${v.files.length <= 3 ? v.files.join(', ') : v.files.slice(0, 3).join(', ') + ', …'}`);
      }
    }
  }

  console.log(`\n\nPER-PAGE IMPACT OF NORMALISING TO MAJORITY\n${'-'.repeat(60)}`);
  for (const [f, i] of [...impact].sort((a, b) => (b[1].visible.length - a[1].visible.length) || a[0].localeCompare(b[0]))) {
    console.log(`${f.padEnd(28)} ${String(i.visible.length).padStart(2)} visible · ${String(i.cosmetic.length).padStart(2)} cosmetic`);
    for (const c of i.visible) console.log(`    ${c.token}: ${c.from}  ->  ${c.to}`);
  }
}
