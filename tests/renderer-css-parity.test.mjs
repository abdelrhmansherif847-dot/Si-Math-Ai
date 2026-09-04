// The renderer's stylesheet, and the three pages that must serve all of it.
//
// stimulus-view.js draws a stimulus into HTML and SVG and styles NOTHING: every
// colour, weight and geometry constraint comes from CSS the page provides. That
// makes the stylesheet part of the renderer's contract, and a page that ships a
// subset of it does not render a slightly plainer figure — it renders a wrong
// one. Measured on teacher-exams.html before I-6: a plot curve filled SOLID
// BLACK, a number line lost its segment entirely, a plot had no axes and no
// grid, and a figure was near-invisible.
//
// THREE PAGES SERVE IT and all three must be identical:
//   exam.html              the student player — the canonical copy
//   teacher-homework.html  the staff preview for homework
//   teacher-exams.html     the staff preview for exams
// A preview is only a preview if it is styled the way the student's page is.
//
// WHY THIS SUITE EXISTS SEPARATELY. The check used to live in
// teacher-homework-ui.test.mjs and it was WRONG in a way that let a real gap
// ship: it derived the class list with /class="((?:sv-[a-z-]+\s*)+)"/, which
// requires a hyphen and a closing quote right after, so it never saw `sv`,
// `sv-dash`, `sv-dot-off` or `sv-poly` — three of which the renderer builds by
// concatenation. teacher-homework.html shipped missing `.sv` with that suite
// green. §1 below derives the list the other way and then PROVES the old
// pattern missed those four, so the fix cannot quietly regress into the bug.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('renderer-css-parity');

const RENDERER = read('stimulus-view.js');
const PAGES = ['exam.html', 'teacher-homework.html', 'teacher-exams.html'];
const SRC = Object.fromEntries(PAGES.map((p) => [p, read(p)]));

/* Comments stripped before anything is derived from source. A class named in
   prose is not a class the renderer emits, and this repo has had three separate
   false results from reading prose as code. */
const stripJs = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const css = (html) => stripCss(
  [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n'));

/** Every rule whose selector list mentions an .sv class, as [selector, body]. */
function svRules(sheet) {
  return [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => [m[1].trim().replace(/\s+/g, ' '), m[2].trim()])
    .filter(([sel]) => /\.sv\b|\.sv-/.test(sel));
}
/** Which class tokens a page's rules can actually match. */
const styledBy = (rules) => new Set(
  rules.flatMap(([sel]) => [...sel.matchAll(/\.(sv(?:-[a-z0-9-]+)?)\b/g)].map((m) => m[1])));

// ══ 1 · THE COMPLETE TOKEN SET, AND THE BLIND SPOT THAT HID FOUR OF IT ═════
t.section('What the renderer emits, derived completely');

/* Every sv token in the renderer's CODE. Not "every class attribute written as
   a literal" — the renderer builds several by concatenation
   (`class="sv-line' + dashed + '"`), which is exactly what the old pattern
   could not see. */
const EMITTED = [...new Set(stripJs(RENDERER).match(/\bsv(?:-[a-z0-9-]+)?\b/g) || [])].sort();
t.is('the renderer emits 30 class tokens', EMITTED.length, 30);
t.ok('and the list is real, not a stray match', EMITTED.includes('sv') && EMITTED.includes('sv-figure'));

/* THE OLD PATTERN, kept verbatim so the claim about it is measured rather than
   remembered. If a future edit makes it equivalent to the new one this check
   goes red and the four names below stop being special — which is the correct
   time to delete this. */
const OLD_PATTERN_SAW = [...new Set(
  [...RENDERER.matchAll(/class="((?:sv-[a-z-]+\s*)+)"/g)].flatMap((m) => m[1].trim().split(/\s+/)))].sort();
const BLIND = ['sv', 'sv-dash', 'sv-dot-off', 'sv-poly'];
t.is('the old derivation saw only 26 of them', OLD_PATTERN_SAW.length, 26);
t.is('and these four are exactly what it missed',
  EMITTED.filter((c) => !OLD_PATTERN_SAW.includes(c)), BLIND);
/* NON-VACUITY. The four are not a historical footnote: each must be in the set
   this suite tests the pages against, or the fix is cosmetic. */
for (const c of BLIND) t.ok(`${c} is in the set the pages are tested against`, EMITTED.includes(c));
/* Two of them are load-bearing rather than decorative, and the audit measured
   what their absence does. */
t.ok('sv-poly is emitted by the polygon and closed-curve branches',
  /class="sv-poly/.test(stripJs(RENDERER)));
t.ok('sv-dot-off is emitted by the number line', /sv-dot-off/.test(stripJs(RENDERER)));

// ══ 2 · EVERY PAGE STYLES EVERY TOKEN ═════════════════════════════════════
t.section('All three pages style the whole set');

const RULES = Object.fromEntries(PAGES.map((p) => [p, svRules(css(SRC[p]))]));
for (const p of PAGES) {
  t.ok(`${p} has renderer rules (not a vacuous slice)`, RULES[p].length >= 30);
  t.is(`${p} styles every emitted class`,
    EMITTED.filter((c) => !styledBy(RULES[p]).has(c)), []);
}

// ══ 3 · AND THEY ARE THE SAME RULES ═══════════════════════════════════════
t.section('The three copies have not drifted');

/* Normalised: selector + body, sorted, so a reordering or a reflow is not a
   difference but a changed declaration is. */
const norm = (rules) => rules.map(([s, b]) => s + '{' + b + '}').sort().join('\n');
const CANON = norm(RULES['exam.html']);
t.ok('the canonical set is substantial (not vacuous)', CANON.length > 1800);
for (const p of PAGES.slice(1)) {
  t.is(`${p} is byte-identical to exam.html after normalisation`, norm(RULES[p]), CANON);
}
t.is('all three carry the same number of rules',
  PAGES.map((p) => RULES[p].length), [34, 34, 34]);

// ══ 4 · THE DECLARATIONS THAT TURN A FIGURE INTO A BLOB ═══════════════════
t.section('The rules whose absence breaks rather than restyles');

const decl = (p, selector) => {
  const hit = RULES[p].find(([s]) => s === selector);
  return hit ? hit[1] : null;
};
for (const p of PAGES) {
  /* An SVG <polyline>/<polygon> FILLS BLACK by default. These two rules are the
     only thing between a plotted curve and a solid black shape. */
  for (const sel of ['.sv-line', '.sv-poly']) {
    const d = decl(p, sel);
    t.ok(`${p} ${sel} exists`, d !== null);
    t.ok(`${p} ${sel} sets fill:none`, !!d && /(^|;)\s*fill:\s*none\s*(;|$)/.test(d));
  }
  /* Without a stroke these three draw nothing at all: no segment on a number
     line, no grid and no axes on a plot. */
  for (const sel of ['.sv-seg', '.sv-grid', '.sv-axis']) {
    const d = decl(p, sel);
    t.ok(`${p} ${sel} exists`, d !== null);
    t.ok(`${p} ${sel} sets a stroke`, !!d && /(^|;)\s*stroke:\s*[^;]+/.test(d)
      && !/stroke:\s*none/.test(d));
  }
  /* A figure is an <img> of an author's SVG, usually black ink on nothing. */
  const fig = decl(p, '.sv-figure');
  t.ok(`${p} .sv-figure gives the image a white card`, !!fig && /background:\s*#fff/.test(fig));
  /* A wide table must scroll inside itself rather than widen the page. */
  const scroll = decl(p, '.sv-scroll');
  t.ok(`${p} .sv-scroll scrolls`, !!scroll && /overflow-x:\s*auto/.test(scroll));
  /* Authored line breaks in a text stimulus. */
  const text = decl(p, '.sv-text');
  t.ok(`${p} .sv-text preserves line breaks`, !!text && /white-space:\s*pre-wrap/.test(text));
  /* Two chart panels sit side by side. */
  const panels = decl(p, '.sv-panels');
  t.ok(`${p} .sv-panels lays panels out in a row`, !!panels && /display:\s*flex/.test(panels));
}

// ══ 5 · THE SIX RULES I-6 REPLACED ════════════════════════════════════════
t.section('The hand-written approximation is gone');

/* These are not "old versions" of canonical rules — they DISAGREED with them,
   so leaving any behind would beat the canonical rule it duplicates. Named
   individually: a partial revert has to fail here. */
const OBSOLETE = [
  ['.sv-table with its own width', /\.sv-table\{width:100%/],
  ['.sv-table cells at 6px 9px',   /\.sv-table th,\.sv-table td\{[^}]*padding:6px 9px/],
  ['.sv-note as grey italics',     /\.sv-note\{color:var\(--text-400\);font-size:12\.5px;font-style:italic\}/],
  ['.sv-label as 13px bold body',  /\.sv-label\{font-weight:700/],
  ['.sv-dot-on as currentColor',   /\.sv-dot-on\{fill:currentColor\}/],
  ['.sv-dot-off filled with --bg', /\.sv-dot-off\{fill:var\(--bg\)\}/],
];
for (const p of PAGES) {
  t.is(`${p} carries none of the six`,
    OBSOLETE.filter(([, re]) => re.test(css(SRC[p]))).map(([name]) => name), []);
}
/* …and the ban is not vacuous: the canonical forms those six replaced ARE
   present, so the patterns are looking at a page that really has these rules. */
t.ok('the canonical .sv-dot-on is what is there instead',
  /\.sv-dot-on\{fill:var\(--cyan\);stroke:var\(--cyan\);stroke-width:2\}/.test(css(SRC['teacher-exams.html'])));
t.ok('and the canonical .sv-label',
  /\.sv-label\{font-family:var\(--font-mono\)/.test(css(SRC['teacher-exams.html'])));

// ══ 6 · THE TOKENS THE RULES DEPEND ON ════════════════════════════════════
t.section('Every page defines the custom properties the block needs');

const NEEDED = [...new Set(RULES['exam.html']
  .flatMap(([, b]) => [...b.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1])))].sort();
t.ok('the block needs custom properties (not vacuous)', NEEDED.length >= 12);
for (const p of PAGES) {
  const defined = new Set([...css(SRC[p]).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  t.is(`${p} defines all ${NEEDED.length} of them`, NEEDED.filter((x) => !defined.has(x)), []);
}

// ══ 7 · THE PAGES REALLY DO USE THE SHARED RENDERER ═══════════════════════
t.section('…and none of them draws a stimulus itself');

for (const p of PAGES) {
  t.ok(`${p} loads stimulus-view.js`, /<script src="stimulus-view\.js"><\/script>/.test(SRC[p]));
  t.ok(`${p} renders through it`, /window\.StimulusView\s*\n?\s*\?\s*window\.StimulusView\.render\(|window\.StimulusView\s*\?\s*window\.StimulusView\.render\(/.test(SRC[p])
    || /StimulusView\.render\(/.test(SRC[p]));
}
/* If a page ever built its own SVG the stylesheet parity above would stop
   meaning anything, so the two claims are checked together. */
t.is('no page constructs stimulus SVG of its own',
  PAGES.filter((p) => /<(?:polyline|polygon|circle)\s+points=|createElementNS/.test(SRC[p])), []);

t.done();
