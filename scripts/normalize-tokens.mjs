#!/usr/bin/env node
// normalize-tokens.mjs — converge divergent design tokens onto one value each.
//
// Dry-run by default. Pass --apply to write.
//
//   node scripts/normalize-tokens.mjs            # show the plan
//   node scripts/normalize-tokens.mjs --apply    # write it
//
// Companion to scripts/audit-tokens.mjs, which found the divergence and
// classified it. See docs/engineering/token-drift-audit.md for the reasoning
// behind every value below.
//
// THREE RULES, applied literally:
//
//  1. Best rendering wins, NOT blind majority. The font stacks take the LONGER
//     fallback chain from assets/knowledge.css even though 18 pages carry the
//     terser one, because the extra links degrade better when the webfont fails.
//     For the colours no such argument exists — they are solid values that
//     render exactly as written — so those take the majority.
//
//  2. Only semantic equivalents converge. Tokens that legitimately differ per
//     surface are listed in SURFACE_SPECIFIC and are never touched: a 262px chat
//     sidebar and a 248px admin sidebar are two decisions, not one written down
//     twice.
//
//  3. Frozen files are not touched. mock-exam.html, weakness.html and focus.html
//     are frozen per CLAUDE.md. They already carry the majority colour values;
//     they would only need editing for the font stacks, which requires an
//     explicit unfreeze. The script reports what it skipped rather than
//     silently leaving a gap.
//
// Duplicate tokens (--border, --font-sans, --radius-card in reset-password.html)
// are deliberately NOT removed: all three are actively referenced there, so
// removing them means rewriting usages, and --border -> --border-soft would
// shift #1a2640 to #1a2540. Out of scope.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');

// Frozen per CLAUDE.md §2. Editing these needs explicit user approval.
const FROZEN = new Set(['mock-exam.html', 'weakness.html', 'focus.html']);

// Never converged — legitimately per-surface.
const SURFACE_SPECIFIC = ['--nav-h', '--side-w', '--fs-h1', '--fs-h2', '--fs-h3', '--fs-body'];

const CANONICAL = {
  // Longer fallback chain — better rendering, against the majority (rule 1).
  '--font-display': "'Manrope', system-ui, -apple-system, sans-serif",
  '--font-body': "'DM Sans', system-ui, -apple-system, sans-serif",
  '--font-mono': "'JetBrains Mono', ui-monospace, monospace",

  // Solid brand/status colours — majority.
  '--green': '#22c55e',
  '--amber': '#f5b942',
  '--red': '#ef4f5f',
  '--purple': '#a855f7',
  '--text-100': '#ffffff',

  // Translucent fills and borders — majority (.12 / .32 family).
  '--green-soft': 'rgba(34,197,94,.12)',
  '--green-border': 'rgba(34,197,94,.32)',
  '--amber-soft': 'rgba(245,185,66,.12)',
  '--amber-border': 'rgba(245,185,66,.32)',
  '--red-soft': 'rgba(239,79,95,.12)',
  '--red-border': 'rgba(239,79,95,.32)',
  '--purple-soft': 'rgba(168,85,247,.12)',
  '--purple-border': 'rgba(168,85,247,.32)',
  '--cyan-bg-soft': 'rgba(56,189,248,.1)',
  '--cyan-bg-med': 'rgba(56,189,248,.16)',
  '--cyan-border': 'rgba(56,189,248,.28)',
  '--cyan-border-soft': 'rgba(56,189,248,.14)',

  // Radius — majority.
  '--r-xl': '24px',
};

/** Byte offsets of the first `:root{…}` body — the base block only. */
function baseRootRange(src) {
  const i = src.search(/:root\s*\{/);
  if (i < 0) return null;
  const start = src.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && !--depth) return [start + 1, j];
  }
  return null;
}

const files = [...readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort(), 'assets/knowledge.css'];
const changed = [];
const skipped = [];

for (const f of files) {
  let src;
  try { src = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
  const range = baseRootRange(src);
  if (!range) continue;
  const [a, b] = range;
  let block = src.slice(a, b);
  const edits = [];

  for (const [token, want] of Object.entries(CANONICAL)) {
    // Capture the declaration's own spacing so each file keeps its house style.
    const re = new RegExp(`(${token}\\s*:\\s*)([^;]+)(;)`, 'g');
    block = block.replace(re, (whole, head, val, tail) => {
      if (val.trim() === want) return whole;
      edits.push({ token, from: val.trim(), to: want });
      return `${head}${want}${tail}`;
    });
  }

  if (!edits.length) continue;
  if (FROZEN.has(f)) { skipped.push({ file: f, edits }); continue; }
  changed.push({ file: f, edits });
  if (APPLY) writeFileSync(join(ROOT, f), src.slice(0, a) + block + src.slice(b));
}

/* ── report ────────────────────────────────────────────────────────────────── */

const totalEdits = changed.reduce((n, c) => n + c.edits.length, 0);
console.log(`${APPLY ? 'APPLIED' : 'DRY RUN — pass --apply to write'}`);
console.log(`${'='.repeat(64)}`);
console.log(`${changed.length} file(s), ${totalEdits} declaration(s)\n`);
for (const c of changed) {
  console.log(`${c.file}`);
  for (const e of c.edits) console.log(`    ${e.token.padEnd(20)} ${e.from}  ->  ${e.to}`);
}
if (skipped.length) {
  console.log(`\nSKIPPED — FROZEN (CLAUDE.md §2; needs explicit unfreeze)\n${'-'.repeat(64)}`);
  for (const s of skipped) {
    console.log(`${s.file}`);
    for (const e of s.edits) console.log(`    ${e.token.padEnd(20)} ${e.from}  ->  ${e.to}  [NOT APPLIED]`);
  }
}
console.log(`\nNever converged (per-surface by design): ${SURFACE_SPECIFIC.join(', ')}`);
