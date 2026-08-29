#!/usr/bin/env node
/**
 * validate-exam-surface-css.mjs — the exam surface has exactly one stylesheet,
 * and it dresses everything the shipped renderers draw. CI gate.
 *
 *   node scripts/validate-exam-surface-css.mjs
 *
 * WHY
 * ---
 * exam-stimulus.js and exam-chrome.js both say, in their headers, that they set
 * no colours: "appearance lives in CSS, not here". That is what lets one figure
 * grammar serve light, dark, exam and review — and it means a class the
 * renderer emits with no rule behind it is INVISIBLE, not merely unstyled. The
 * first DSAT preview shipped exactly that defect: every multiple-choice option
 * rendered white on white, textContent perfectly correct, and no DOM assertion
 * could see it.
 *
 * So: every class the renderers can emit must have a rule, and the check is
 * driven from the renderers rather than from a list somebody maintains.
 *
 * Checks:
 *   1. Coverage      — every .sx-* and .xc-* class the shipped modules emit is
 *                      styled, with a reasoned exemption list that cannot rot.
 *   2. Tokens        — every var(--x) the stylesheet reads, it also defines.
 *   3. Dark          — the palette is redefined for both dark states, and the
 *                      explicit light choice still wins.
 *   4. Launcher      — the calculator's token names are aliased, so it looks
 *                      native here rather than falling back to its literals.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const fail = (m) => { console.error('  ✗', m); failures++; };
const ok = (m) => console.log('  ✓', m);
const assert = (c, m) => (c ? ok(m) : fail(m));

// BOTH sheets. The figure grammar moved to figure-system.css so that every
// surface could link the one file instead of keeping a private copy of it (see
// validate-figure-system.mjs); the exam links both, in this order, so the checks
// below still read what the exam actually resolves.
const SHEETS = ['figure-system.css', 'exam-surface.css']
  .map((f) => readFileSync(resolve(root, f), 'utf8'));
const css = SHEETS.join('\n');
const stimulus = readFileSync(resolve(root, 'exam-stimulus.js'), 'utf8');
const chrome = readFileSync(resolve(root, 'exam-chrome.js'), 'utf8');

/* Names the renderers build that are NOT classes, or are built by
 * concatenation. Each carries its reason, and an entry that stops matching
 * anything fails below — an exemption list nobody prunes is how coverage rots. */
const EXEMPT = new Map([
  ['sx-ar',     'a <marker> id, referenced as url(#sx-ar)'],
  ['sx-ar-nl',  'a <marker> id'],
  ['sx-ar-ray', 'a <marker> id'],
  ['sx-clip-',  'a <clipPath> id prefix, completed with a counter'],
  ['sx-s',      'the series-colour prefix; sx-s1..sx-s3 are the real classes'],
  ['sx-fam-',   'the family prefix; sx-fam-plane|graph|data are the real classes'],
  ['xc-q-',     'the navigator state prefix; the four states are the real classes'],

  // DELIBERATELY UNSTYLED, each because the approved grammar (365d85b) decided
  // it needs no treatment of its own. An entry here is a decision on the
  // record, not a gap: the alternative was inventing a rule, which is exactly
  // how this stylesheet went wrong the first time.
  ['sx-solo',    'a lone curve. Colour is decided by the FAMILY under the grammar, ' +
                 'so a single-curve figure needs no separate treatment'],
  ['sx-major',   'the pre-grammar two-tier grid. No approved surface ever styled it — ' +
                 'the grammar draws a uniform grid with a quieter sub-unit tier instead'],
  ['sx-num',     'the decided table aligns by column POSITION (first is the label, ' +
                 'the rest are values), so the numeric marking carries no treatment'],
  ['sx-th-num',  'as sx-num, for the header band'],
]);

const classesIn = (src, prefix) => {
  const re = new RegExp(prefix + '-[a-z0-9-]+', 'g');
  return [...new Set(src.match(re) || [])];
};
/* A class is styled when the sheet selects it — `.name` not followed by another
 * identifier character, so `.sx-point` does not satisfy `.sx-point-named`. */
const styled = (name) => new RegExp('\\.' + name + '(?![a-zA-Z0-9_-])').test(css);

/* ── 1. Coverage ──────────────────────────────────────────────────────────── */
{
  const used = new Set();
  for (const [src, prefix, what] of [[stimulus, 'sx', 'figure'], [chrome, 'xc', 'chrome']]) {
    const missing = [];
    for (const name of classesIn(src, prefix)) {
      if (EXEMPT.has(name)) { used.add(name); continue; }
      if (!styled(name)) missing.push(name);
    }
    assert(missing.length === 0,
      `every ${what} class the renderer emits has a rule` +
      (missing.length ? ` — unstyled: ${missing.join(', ')}` : ''));
  }
  // The three series colours are built by concatenation, so nothing above sees
  // them. They are the difference between two curves on one plot.
  // Built by concatenation, so nothing above sees them. The grammar decided two
  // hues; slot 3 is ink. All three must still resolve to something.
  const series = ['sx-s1', 'sx-s2', 'sx-s3'].filter((n) => !styled(n));
  assert(series.length === 0,
    'the series colours sx-s1..sx-s3 are all styled' + (series.length ? ` — missing: ${series}` : ''));

  const stale = [...EXEMPT.keys()].filter((n) => !used.has(n));
  assert(stale.length === 0,
    'no exemption has outlived the code it excused' +
    (stale.length ? ` — stale: ${stale.map((n) => `${n} (${EXEMPT.get(n)})`).join('; ')}` : ''));
}

/* ── 2. Every token it reads, it defines ──────────────────────────────────── */
{
  const read = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  // Declarations are packed several to a line, so a start-of-line anchor sees
  // only the first of each and reports the rest as undefined. This is the
  // check's own first bug, kept in mind: a declaration follows `{` or `;`.
  const defined = new Set([...css.matchAll(/(?:^|[;{])\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
  const undef = [...read].filter((t) => !defined.has(t));
  assert(undef.length === 0,
    'every var(--token) the sheet reads is defined in it' +
    (undef.length ? ` — undefined: ${undef.join(', ')}` : ''));
}

/* ── 3. Three theme states, not two ───────────────────────────────────────── */
{
  assert(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/.test(css),
    'the system-dark block is guarded so an explicit light choice still wins');
  assert(/:root\[data-theme="dark"\]\s*\{/.test(css),
    'an explicit dark choice has its own block, so the toggle wins both ways');
  // A token defined only inside a media query is undefined for the other state.
  // The LIGHT `:root` of each sheet, taken the same way for both: the text from
  // its first `:root {` up to its first dark block. Read per file rather than on
  // the concatenation — a single pass over the joined text sees the first
  // sheet's dark block and stops, which silently answered "yes" for every token
  // in the second sheet.
  const lightRoot = (text) => {
    const i = text.indexOf(':root {');
    if (i === -1) return '';
    const j = text.indexOf('@media', i);
    return text.slice(i, j === -1 ? undefined : j);
  };
  const base = SHEETS.map(lightRoot).join('\n');
  const declares = (block, t) => new RegExp('(?:^|[;{])\\s*' + t + '\\s*:', 'm').test(block);
  const darkOnly = ['--fig-ink', '--fig-grid', '--cyan', '--low', '--flag', '--good']
    .filter((t) => !declares(base, t));
  assert(darkOnly.length === 0,
    'no colour has its only definition inside a dark block' +
    (darkOnly.length ? ` — missing from :root: ${darkOnly.join(', ')}` : ''));
}

/* ── 4. The calculator looks native here ──────────────────────────────────── */
{
  const launcher = readFileSync(resolve(root, 'exam-calculator-launcher.js'), 'utf8');
  const wanted = [...new Set([...launcher.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))];
  const unaliased = wanted.filter((t) => !new RegExp('(?:^|[;{])\\s*' + t + '\\s*:', 'm').test(css));
  assert(unaliased.length === 0,
    'every token exam-calculator-launcher.js styles against is defined here' +
    (unaliased.length ? ` — it would fall back to its own literals for: ${unaliased.join(', ')}` : ''));
}

if (failures) {
  console.error(`\nexam-surface-css: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nexam-surface-css: all checks passed');
