#!/usr/bin/env node
/* ONE FIGURE GRAMMAR, AND ONE PLACE IT LIVES.
 *
 * figure-system.css is the approved family grammar. Before this gate existed it
 * was a section of exam-surface.css, and six preview builders answered by
 * keeping private copies rather than reading it. They drifted, quietly, for
 * months. The worst was scripts/build-stimulus-plates.py — the sheet whose own
 * header promises "what is approved on the specimen sheet is literally what a
 * student will see" — which differed from the shipped rules in TWENTY
 * selectors: axis strokes 1.75 with round caps against 1.2 with butt caps,
 * curves 2.5 against 3, and the x and y tips set in bold sans rather than the
 * serif italic that ships. An appearance approved from that sheet was an
 * appearance the product never drew.
 *
 * So: nothing but figure-system.css may define a `.sx` rule. A page that draws
 * figures links the file. A page that wants a different look is an exploration
 * and says so in one line, which is the ONE thing this gate accepts as an
 * exemption — because those pages exist to show alternatives that were NOT
 * chosen, and forcing them onto the shipped grammar would destroy the record of
 * why the grammar is what it is.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GRAMMAR = 'figure-system.css';
// A page may opt out only by saying, in its own source, that it is a record of
// alternatives rather than a statement of what ships.
const EXEMPT = 'FIGURE-GRAMMAR-EXPLORATION';

let pass = 0, fail = 0;
const ok = (m, d) => { pass++; console.log('  ✓ ' + m + (d ? '  ' + d : '')); };
const no = (m, d) => { fail++; console.log('  ✗ ' + m + (d ? '\n      ' + d : '')); };

const files = [];
const walk = (dir) => {
  for (const e of readdirSync(resolve(REPO, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
    const rel = dir ? dir + '/' + e.name : e.name;
    if (e.isDirectory()) { if (dir.split('/').length < 3) walk(rel); continue; }
    if (/\.(css|html|py|js|mjs|cjs)$/.test(e.name)) files.push(rel);
  }
};
walk('');

// Where a `.sx` rule is DEFINED — a selector followed by a declaration block.
// Reading one (a querySelector, a className) is not defining one.
const DEFINES = /(^|[\s,>+~])\.sx[a-zA-Z0-9_-]*\s*(\{|[^{;\n]{0,60}\{)/m;

if (!existsSync(resolve(REPO, GRAMMAR))) {
  no(GRAMMAR + ' exists');
} else {
  const g = readFileSync(resolve(REPO, GRAMMAR), 'utf8');
  const n = (g.match(/^\.sx[a-zA-Z0-9_ .:,>()[\]="-]*\{/gm) || []).length;
  ok(GRAMMAR + ' is the grammar', n + ' rules');
  for (const t of ['--fig-axis', '--fig-grid', '--data-1', '--t-head'])
    if (!g.includes(t + ':')) no(GRAMMAR + ' carries its own ' + t + ' token');
  if (!/@media \(prefers-color-scheme:dark\)/.test(g)) no(GRAMMAR + ' defines a dark palette');
  ok(GRAMMAR + ' is self-contained (tokens + both themes)');
}

// A generated page that INLINES the grammar is fine — that is one grammar
// reaching a standalone file. Restating it is not. The two are told apart by
// looking for the grammar's own rule text, verbatim, inside the page: an
// inlined copy contains it, a private copy cannot.
const grammar = readFileSync(resolve(REPO, GRAMMAR), 'utf8');
const RULES = grammar.slice(grammar.indexOf('.sx{display:block'))
                     .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
const SPINE = RULES.split('\n').filter((l) => l.startsWith('.sx'));

// Every `.sx` rule a file defines, normalised to "selector{body}" so an extra
// or an overriding duplicate is visible whatever the whitespace.
const ruleSet = (raw) => {
  // Comments first: several of these files explain the grammar in prose that
  // quotes selectors, and a comment is not a rule.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = [];
  for (const m of src.matchAll(/([^{}();]*\.sx[^{}();]*)\{([^{}]*)\}/g)) {
    const sel = m[1].split('\n').map((l) => l.trim()).filter(Boolean).join(' ').trim();
    if (!/(^|[\s,>+~])\.sx/.test(sel)) continue;
    const body = m[2].split(/\s+/).join(' ').trim();
    for (const one of sel.split(',')) {
      const t = one.trim();
      if (t.includes('.sx')) out.push(t + '{' + body + '}');
    }
  }
  return out;
};
const GRAMMAR_SET = new Set(ruleSet(grammar));

const offenders = [], exempt = [], inlined = [];
for (const f of files) {
  if (f === GRAMMAR) continue;
  const src = readFileSync(resolve(REPO, f), 'utf8');
  if (!DEFINES.test(src)) continue;
  if (src.includes(EXEMPT)) { exempt.push(f); continue; }
  const flat = src.split('\n').map((l) => l.trim()).join('\n');
  const missing = SPINE.filter((l) => !flat.includes(l));
  if (missing.length) {
    offenders.push(f + '  (' + missing.length + '/' + SPINE.length +
                   ' grammar rules differ, e.g. ' + missing[0].slice(0, 64) + ')');
    continue;
  }
  // Carrying the grammar is necessary but not sufficient: a page could carry it
  // and then override it with one extra rule of its own. So every `.sx` rule
  // the page defines has to BE a grammar rule.
  const extra = ruleSet(src).filter((r) => !GRAMMAR_SET.has(r));
  if (extra.length) {
    offenders.push(f + '  (carries the grammar, then adds ' + extra.length +
                   ' rule(s) of its own, e.g. ' + extra[0].slice(0, 70) + ')');
    continue;
  }
  inlined.push(f);
}

if (offenders.length) {
  no('a page states the figure grammar instead of carrying it',
     offenders.join('\n      ') +
     '\n      -> link ' + GRAMMAR + ', or mark the file ' + EXEMPT + ' if it is a record of alternatives');
} else {
  ok('every page that draws figures carries the grammar VERBATIM',
     inlined.length + ' inlined, ' + exempt.length + ' exploration record(s) exempt');
}

// Every exempt page has to SAY it is an exploration, in prose, near the top —
// the marker alone would let a shipping surface opt out with a comment.
for (const f of exempt) {
  const head = readFileSync(resolve(REPO, f), 'utf8').slice(0, 2600);
  if (/exploration|alternativ|direction|candidate|not chosen|bake-?off|evaluation|vocabulary/i.test(head))
    ok('exempt and says why: ' + f);
  else no('exempt but does not say it is an exploration: ' + f);
}

// figure-system.css carries its own tokens so it can be linked alone, and
// exam-surface.css defines the same names so the exam has one palette across
// chrome and figure. That is a deliberate duplication and therefore a place two
// values can drift apart — the figure would then be drawn in one grey on the
// specimen sheet and another in the exam, which is the whole failure this file
// exists to stop. So where both declare a token, the values have to agree.
{
  const surface = readFileSync(resolve(REPO, 'exam-surface.css'), 'utf8');
  const lightRoot = (t) => {
    const i = t.indexOf(':root {');
    const j = t.indexOf('@media', i);
    return i === -1 ? '' : t.slice(i, j === -1 ? undefined : j);
  };
  const decls = (t) => Object.fromEntries(
    [...lightRoot(t).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const a = decls(grammar), b = decls(surface);
  const clash = Object.keys(a).filter((k) => k in b && a[k] !== b[k]);
  if (clash.length) no('the two sheets agree on every token they both define',
    clash.map((k) => `${k}: grammar ${a[k]} vs surface ${b[k]}`).join('\n      '));
  else ok('the two sheets agree on every token they both define',
    Object.keys(a).filter((k) => k in b).length + ' shared');
}

// The exam must link the grammar, and BEFORE its own sheet so its palette wins.
const exams = readFileSync(resolve(REPO, 'exams.html'), 'utf8');
const gi = exams.indexOf(GRAMMAR), ei = exams.indexOf('exam-surface.css"');
if (gi === -1) no('exams.html links ' + GRAMMAR);
else if (ei !== -1 && gi > ei) no('exams.html links ' + GRAMMAR + ' BEFORE exam-surface.css');
else ok('exams.html links ' + GRAMMAR + ' before exam-surface.css');

console.log(fail ? `\nfigure-system: ${fail} check(s) FAILED` : '\nfigure-system: all checks passed');
process.exit(fail ? 1 : 0);
