#!/usr/bin/env node
// validate-tokens.mjs — the design-token drift gate.
//
// Discovered automatically by tests/run-all.mjs (it runs every
// scripts/validate-*.mjs), so there is no CI wiring to keep in sync.
//
//   node scripts/validate-tokens.mjs
//
// WHAT IT PREVENTS
//
// assets/tokens.core.css declares the shared design tokens. 19 app pages and
// assets/knowledge.css each carry their own inline :root block — that
// duplication is deliberate (inlining keeps first paint dark with no extra
// request), but it is exactly what let 27 tokens drift apart before
// docs/engineering/token-drift-audit.md found it. This gate makes the copies
// stay honest: change a shared value on one page and CI names the file, the
// token, and both values.
//
// WHAT IT DELIBERATELY DOES NOT ENFORCE
//
//   1. PER_SURFACE tokens. --nav-h, --side-w and the --fs-* bases differ
//      between the marketing site, the app shell and the dashboard BY DESIGN.
//      Forcing them equal would be a regression, not a fix.
//   2. Page-local tokens — defined by exactly one file, so there is nothing to
//      disagree with (e.g. --bg-glass, --cyan-glow, and reset-password.html's
//      --border / --font-sans / --radius-card).
//   3. Notation. Values are compared as RENDERED, so #fff and #ffffff are the
//      same thing. Only real differences fail.
//   4. EXCEPTIONS — specific file+token pairs that diverge on purpose, each
//      carrying a written reason. An exception that is no longer needed also
//      fails, so the list cannot quietly rot.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = 'assets/tokens.core.css';

// Differ per surface by design — never compared. Widening this list is a design
// decision: record why in docs/engineering/token-drift-audit.md first.
const PER_SURFACE = new Set(['--nav-h', '--side-w', '--fs-h1', '--fs-h2', '--fs-h3', '--fs-body']);

// Intentional, documented divergence. Every entry needs a reason, and the gate
// fails if an entry stops being necessary.
const EXCEPTIONS = [
  {
    files: ['mock-exam.html', 'weakness.html', 'focus.html'],
    tokens: ['--font-display', '--font-body', '--font-mono'],
    reason: 'FROZEN per CLAUDE.md §2. These three carry the shorter fallback chain '
      + "('Manrope',sans-serif). Converging them onto the longer chain would mean editing "
      + 'frozen files, which needs explicit unfreezing — deliberately deferred rather than '
      + 'done quietly. Effect is limited to how they fall back when the webfont fails.',
  },
];

/* ── helpers ───────────────────────────────────────────────────────────────── */

/** Compare what the browser renders, not how it was typed. */
function rendered(v) {
  const s = v.trim().replace(/\s+/g, ' ');
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return `rgba(${[0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16)).join(',')},1)`;
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return `rgba(${[0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).join(',')},1)`;
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(',').map((x) => x.trim());
    if (p.length >= 3) return `rgba(${+p[0]},${+p[1]},${+p[2]},${p[3] === undefined ? 1 : parseFloat(p[3])})`;
  }
  return s.replace(/"/g, "'").toLowerCase();
}

/** Declarations in a file's FIRST :root block (the base, not media overrides). */
function baseTokens(src) {
  const i = src.search(/:root\s*\{/);
  if (i < 0) return null;
  const start = src.indexOf('{', i);
  let depth = 0, end = -1;
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && !--depth) { end = j; break; }
  }
  if (end < 0) return null;
  const out = {};
  for (const m of src.slice(start + 1, end).matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/* ── load ──────────────────────────────────────────────────────────────────── */

const errors = [];
const core = baseTokens(readFileSync(join(ROOT, CORE), 'utf8'));
if (!core) { console.error(`✗ ${CORE}: no :root block found`); process.exit(1); }

const sources = [...readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort(), 'assets/knowledge.css'];
const declared = new Map(); // file -> {token: raw}
for (const f of sources) {
  const t = baseTokens(readFileSync(join(ROOT, f), 'utf8'));
  if (t) declared.set(f, t);
}

// How many files define each token — a token defined once is page-local.
const fileCount = new Map();
for (const t of declared.values()) for (const k of Object.keys(t)) fileCount.set(k, (fileCount.get(k) ?? 0) + 1);

const excepted = (file, token) =>
  EXCEPTIONS.find((e) => e.files.includes(file) && e.tokens.includes(token));

/* ── check 1: every shared token matches the core ──────────────────────────── */

const usedExceptions = new Set();
for (const [file, tokens] of declared) {
  for (const [token, raw] of Object.entries(tokens)) {
    if (PER_SURFACE.has(token)) continue;
    if (fileCount.get(token) === 1) continue;           // page-local
    if (!(token in core)) {
      errors.push(`[UNDECLARED] ${file}: ${token} is defined in ${fileCount.get(token)} files but is not in ${CORE}.\n`
        + `    A token shared across pages must be declared there so it can be checked.\n`
        + `    Add it to ${CORE}, or if it is genuinely per-surface add it to PER_SURFACE in this script (with a note in the audit doc).`);
      continue;
    }
    if (rendered(raw) === rendered(core[token])) {
      // Matching while excepted means the exception has served its purpose.
      const ex = excepted(file, token);
      if (ex) errors.push(`[STALE_EXCEPTION] ${file}: ${token} now matches ${CORE}, so its documented exception is obsolete.\n`
        + `    Remove ${token}/${file} from EXCEPTIONS in this script.`);
      continue;
    }
    const ex = excepted(file, token);
    if (ex) { usedExceptions.add(`${file}|${token}`); continue; }
    errors.push(`[TOKEN_DRIFT] ${file}: ${token} is "${raw}" but ${CORE} says "${core[token]}".\n`
      + `    Shared tokens must be identical everywhere. Fix the page, or change ${CORE} and every page that declares it.\n`
      + `    If this difference is intentional, add it to EXCEPTIONS in this script with a written reason.`);
  }
}

/* ── check 2: no exception entry points at nothing ─────────────────────────── */

for (const e of EXCEPTIONS) {
  if (!e.reason?.trim()) { errors.push(`[EXCEPTION_NO_REASON] an EXCEPTIONS entry has no reason.`); continue; }
  for (const f of e.files) {
    if (!declared.has(f)) { errors.push(`[EXCEPTION_DEAD] ${f} is in EXCEPTIONS but defines no :root block — remove it.`); continue; }
    for (const t of e.tokens) {
      if (!(t in declared.get(f))) errors.push(`[EXCEPTION_DEAD] ${f} is excepted for ${t} but no longer declares it — remove it.`);
    }
  }
}

/* ── report ────────────────────────────────────────────────────────────────── */

if (errors.length) {
  console.error(`✗ design token drift (${errors.length} problem${errors.length === 1 ? '' : 's'})\n`);
  for (const e of errors) console.error(`  ${e}\n`);
  console.error(`  Context: docs/engineering/token-drift-audit.md`);
  process.exit(1);
}

const checked = [...declared.values()].reduce((n, t) =>
  n + Object.keys(t).filter((k) => !PER_SURFACE.has(k) && fileCount.get(k) > 1 && k in core).length, 0);
console.log(`tokens: ${checked} shared declarations across ${declared.size} files agree with ${CORE}`);
console.log(`  ${PER_SURFACE.size} per-surface tokens exempt · ${usedExceptions.size} documented exception(s) in force`);
process.exit(0);
