// Stage 1 — the renderer draws a formula.
//
// This is the suite for the four decisions that make Stage 1 what it is:
//   U-1/U-4 (§16.10.10) which source a curve draws from, and what becomes of
//     the "defined by a formula and is not drawn here" note;
//   U-5     (§16.10.11) the renderer samples at the Stage 0 constants;
//   U-2     (§16.10.12) where the evaluator lives, and what a MISSING one does;
//   U-3     (§16.10.13) every page that loads the renderer loads the evaluator.
//
// M-1…M-9 and D-1…D-7 are named in those sections as the mutants that must be
// killed. Each check below carries its label so a future reader can tell which
// decision it defends — and M-9/D-7 are EQUIVALENT guards that must SURVIVE.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const t = suite('stage1-render');
const SV = require('../stimulus-view.js');
const X  = require('../stimulus-expr.js');
const FX = require('./fixtures/stimuli.json');

const plot = (curves, xr = [-5, 5], yr = [-5, 10], figs) => ({
  kind: 'plot',
  spec: { frame: 'plane', xRange: xr, yRange: yr, curves,
          figures: figs || curves.map(() => ({ mode: 'curve' })) },
});
const draw  = (h) => (h.match(/<polyline/g) || []).length;
const polys = (h) => [...h.matchAll(/<polyline points="([^"]+)"/g)].map((m) => m[1]);
const P2 = [[0, 0], [1, 1]];

// ══ 1 · C-1 · THE STATIC DEPENDENCY CONTRACT ══════════════════════════════
t.section('Every page that loads the renderer loads the evaluator');

const PAGES = ['exam.html', 'teacher-exams.html', 'teacher-homework.html'];
const SRC = Object.fromEntries(PAGES.map((p) => [p, read(p)]));
const loadsView = (s) => /<script src="stimulus-view\.js"><\/script>/.test(s);
const loadsExpr = (s) => /<script src="stimulus-expr\.js"><\/script>/.test(s);

t.is('the three pages are the ones that load the renderer',
  PAGES.filter((p) => loadsView(SRC[p])), PAGES);
for (const p of PAGES)
  t.ok(`C-1 · ${p} loads the evaluator`, loadsExpr(SRC[p]));

/* DETECTOR-FIRES GUARD. A contract that cannot go red is not a contract: strip
   the tag from a copy and the same rule must reject it. */
t.ok('C-1 · and the check fires when a page drops the tag',
  !loadsExpr(SRC['exam.html'].replace('<script src="stimulus-expr.js"></script>\n', '')));

/* U-3 · no page is left half-wired: nothing loads the evaluator without the
   renderer either, which would ship 10KB to a page that cannot use it. */
t.is('U-3 · no page loads the evaluator without the renderer',
  PAGES.filter((p) => loadsExpr(SRC[p]) && !loadsView(SRC[p])), []);

// ══ 2 · U-1/U-4 · THE TRUTH TABLE, ROW BY ROW ═════════════════════════════
t.section('Which source a curve draws from');

/* Row 3 · expr only, drawable → draws, and the note is GONE. (M-2) */
{
  const h = SV.render(plot([{ expr: 'x^2' }]));
  t.is('M-2 · row 3 · expr only draws', draw(h), 1);
  t.ok('M-2 · …and emits no formula note', !/defined by a formula/.test(h));
}
/* Row 6/7 · expr + points → expr WINS. M-1 is the only test that separates the
   three candidate rules, so its points DISAGREE with its formula on purpose,
   and it asserts SHAPE — a vertex count would depend on U-5. */
{
  const straight = [[-4, -4], [-2, -2], [0, 0], [2, 2], [4, 4]];
  const h = SV.render(plot([{ expr: 'x^2', points: straight }]));
  const ys = polys(h)[0].split(' ').map((p) => +p.split(',')[1]);
  t.ok('M-1 · row 7 · the drawn path is NOT the stored straight line',
    !ys.every((v, i) => i === 0 || v <= ys[i - 1]));
  t.ok('M-1 · …and it is the parabola, drawn from expr', ys.length > straight.length);
}
/* Row 8 · expr that cannot be parsed + points → the POINTS draw. (M-4) */
{
  const h = SV.render(plot([{ expr: '@@bad@@', points: P2 }]));
  t.is('M-4 · row 8 · an unparseable expr falls back to its points', draw(h), 1);
  t.ok('M-4 · …and says nothing, because the curve is drawn', !/sv-note/.test(h));
}
/* Rows 4-5 · nothing to draw from either source → the note SURVIVES. (M-5) */
{
  const a = SV.render(plot([{ expr: '@@bad@@' }]));
  t.is('M-5a · row 4 · a parse failure with no points draws nothing', draw(a), 0);
  t.ok('M-5a · …and keeps rule 3\'s note', /defined by a formula/.test(a));
  const b = SV.render(plot([{ expr: '1/0' }], [-5, 5], [-5, 5]));
  t.is('M-5b · row 5 · no drawable part in range draws nothing', draw(b), 0);
  t.ok('M-5b · …and keeps rule 3\'s note', /defined by a formula/.test(b));
}
/* Row 9 · expr + a degenerate points array → expr still wins. (M-6) */
{
  const h = SV.render(plot([{ expr: 'x^2', points: [[0, 0]] }]));
  t.ok('M-6 · row 9 · a 1-point array does not beat a drawable expr',
    polys(h)[0].split(' ').length > 1);
}
/* Row 10 · a NON-string expr is treated as absent. (M-7)
   The fixture is `5`, not `123`, and that is the whole point: String(123)
   parses to a constant that lands OUTSIDE this y-range, so the visibility gate
   refuses it and a truthy-instead-of-string bug would fall back to the points
   and look identical. `5` is inside the range, so a bug draws the horizontal
   line y=5 where the stored points trace a diagonal — the geometry separates
   them. Found by mutation: the 123 fixture let that mutant survive. */
{
  const diag = [[-4, -4], [0, 0], [4, 4]];
  const h = SV.render(plot([{ expr: 5, points: diag }]));
  t.is('M-7 · row 10 · a non-string expr draws its points', draw(h), 1);
  const ys = polys(h)[0].split(' ').map((p) => +p.split(',')[1]);
  t.ok('M-7 · …and the geometry is the POINTS, not the constant expr',
    new Set(ys).size === diag.length);
  t.ok('M-7 · …and it never reaches the evaluator', !/sv-note/.test(h));
}
/* Row 11 · neither key → the note, unchanged. */
t.ok('row 11 · a curve with neither key still says so',
  /defined by a formula/.test(SV.render(plot([{}]))));

// ══ 3 · O-4 · FUNCTION IDENTITY IS ADJACENCY ══════════════════════════════
t.section('Consecutive curves sharing one expr are ONE function');

/* Stage 0 stores one curve PER BRANCH, each carrying the same expr. Sampling
   per stored curve would sample the function N times and draw it N times. */
for (const [expr, yr, branches] of [['1/x', [-5, 5], 2], ['tan(x)', [-5, 5], 5]]) {
  const stored = X.sampleFunction(expr, -5, 5, yr[0], yr[1]).branches
    .map((pts) => ({ expr: expr, points: pts }));
  t.is(`${expr} · Stage 0 stored ${branches} branches`, stored.length, branches);
  const h = SV.render(plot(stored, [-5, 5], yr));
  t.is(`O-4 · ${expr} draws ${branches} polylines, not ${branches * branches}`,
    draw(h), branches);
}
/* Branch geometry stays SEPARATE — grouping is function identity, never merged
   geometry. This is what stops a naive fix joining branches across an asymptote. */
{
  const h = SV.render(plot([{ expr: '1/x' }], [-5, 5], [-5, 5]));
  t.is('O-4 · a broken function draws one polyline PER BRANCH', draw(h), 2);
  const [a, b] = polys(h);
  t.ok('O-4 · …and the two branches are different geometry', a !== b);
}
/* Non-consecutive identical expressions are SEPARATE functions, and a points
   curve resets adjacency — the renderer must agree with hydratePlot. */
{
  const E = require('../stimulus-editor.js');
  const spec = plot([{ expr: '1/x', points: P2 }, { expr: 'x^2', points: P2 },
                     { expr: '1/x', points: P2 }]).spec;
  t.is('O-4 · hydrate sees three functions',
    E.hydrate('plot', spec).inputs.functions, ['1/x', 'x^2', '1/x']);
}

// ══ 4 · U-5 · THE RENDERER SAMPLES AT THE STAGE 0 CONSTANTS ═══════════════
t.section('Primary and fallback draw the same figure');

/* D-4 · THE test that pins the density decision. Rendering from expr and
   rendering from that expr's own stored points must produce the IDENTICAL SVG.
   At any other density they diverge, and a parse regression would silently
   change the drawing. */
const geometry = (h) => JSON.stringify(polys(h));
for (const [expr, yr] of [['x^2-4*x+3', [-5, 10]], ['sin(x)', [-5, 5]], ['1/x', [-5, 5]]]) {
  const branches = X.sampleFunction(expr, -5, 5, yr[0], yr[1]).branches;
  const primary  = SV.render(plot([{ expr: expr }], [-5, 5], yr));
  const fallback = SV.render(plot(branches.map((p) => ({ points: p })), [-5, 5], yr));
  /* GEOMETRY is what D-4 exists to pin: at any density but U-5's the two paths
     would trace different coordinates. It holds for every branch count. */
  t.ok(`D-4 · ${expr} · primary and fallback trace identical geometry`,
    geometry(primary) === geometry(fallback));
  /* The WHOLE SVG matches only when the function is single-branch. A function
     that breaks is ONE function drawn as N polylines (O-4), so the primary path
     gives its branches one colour, while N separately stored point-curves take
     N colours from the series ramp. That difference is COLOUR, never geometry,
     and which of the two is right is NOT settled by any closed decision — see
     the open question raised with this suite. */
  if (branches.length === 1)
    t.ok(`D-4 · ${expr} · single-branch → byte-identical SVG`, primary === fallback);
}
t.note('D-4 · multi-branch colour parity is deliberately not asserted — open question');
/* THE DENSITY PIN. Branch counts are density-STABLE — §16.11's audit measured
   1/x at 2 branches and tan(x) at 5 from 51 samples to 1601 — so no branch-count
   check can catch a changed density, and D-4 cannot either, because both of its
   paths would move together. The VERTEX COUNT of a smooth curve is the thing
   that moves: 201 samples in, 201 coordinates out. Found by mutation: without
   this, SAMPLES = 401 passed the whole suite. */
{
  const h = SV.render(plot([{ expr: 'x^2-4*x+3' }], [-5, 5], [-5, 10]));
  t.is('U-5 · a smooth curve draws exactly SAMPLES coordinates',
    polys(h)[0].split(' ').length, X.SAMPLES);
  t.is('U-5 · and SAMPLES is the Stage 0 constant', X.SAMPLES, 201);
}
/* D-5 · the pinned fixtures are renderer invariants, not only storage ones. */
for (const [id, expr, yr, n] of [
  ['F1', 'x^2-4*x+3', [-5, 10], 1], ['F6', '1/x', [-5, 5], 2],
  ['F7', 'tan(x)', [-5, 5], 5], ['F8', 'tan(x)', [-5, 5], 5],
]) t.is(`D-5 · ${id} · ${expr} draws ${n} polyline(s)`,
  draw(SV.render(plot([{ expr: expr }], [-5, 5], yr))), n);

// ══ 5 · C-3/C-4/C-5 · A MISSING EVALUATOR IS A DEPLOYMENT FAULT ═══════════
t.section('A missing evaluator is never an undrawable expression');

/* The renderer resolves the evaluator lazily, so a sandbox without it exercises
   the fault path on the REAL shipped source. */
import vm from 'node:vm';
function renderWithoutEvaluator(stimulus) {
  const mod = { exports: {} };
  const errs = [];
  vm.runInNewContext(read('stimulus-view.js'), {
    module: mod, Math, JSON, String, Number, Object, Array, RegExp, isFinite,
    console: { error: (m) => errs.push(m) },
  });
  return { html: mod.exports.render(stimulus), errs };
}
{
  const { html, errs } = renderWithoutEvaluator(plot([{ expr: 'x^2' }]));
  t.is('C-3 · nothing is drawn without an evaluator', draw(html), 0);
  t.ok('C-3 · the note carries data-fault', /data-fault="missing-evaluator"/.test(html));
  t.ok('C-3 · …and NEVER borrows rule 3\'s wording', !/defined by a formula/.test(html));
  t.is('C-3 · exactly one console.error', errs.length, 1);
  t.is('C-3 · with the exact developer-facing wording', errs[0],
    'Stage 1 expression evaluator is missing: load stimulus-expr.js before rendering expression curves.');
}
{
  const { html, errs } = renderWithoutEvaluator(plot([{ expr: 'x^2', points: P2 }]));
  t.is('C-4 · correct output is never withheld — the points still draw', draw(html), 1);
  t.ok('C-4 · …and no note is shown over a correct graph', !/sv-note/.test(html));
  t.is('C-4 · but the fault is still reported once', errs.length, 1);
}
{
  const { html, errs } = renderWithoutEvaluator(plot([{ points: P2 }]));
  t.is('C-5 · points-only content is untouched', draw(html), 1);
  t.is('C-5 · …and reports nothing at all', errs.length, 0);
}
/* The fault marker adds NO renderer class token — that was the whole reason it
   is a data- attribute. A name containing `sv-` would be counted as a 31st. */
/* Read against the CODE, not the prose: the comment beside note() spells out
   `data-sv-fault` in order to say why it is NOT used, so a check over the raw
   file could only ever go red. Same lesson §0 of the editor suite records. */
const VIEW_CODE = read('stimulus-view.js').replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
t.ok('the comment strip removed prose', VIEW_CODE.length < read('stimulus-view.js').length - 2000);
t.ok('the fault marker adds no sv- class token', !/sv-fault/.test(VIEW_CODE));
t.ok('…and the check is not vacuous — it fires on a real sv- token',
  /sv-note/.test(VIEW_CODE));

// ══ 6 · M-3 · EXISTING POINTS-ONLY BEHAVIOUR IS PRESERVED ═════════════════
t.section('Every points-only fixture renders as it did');

const CORPUS = Object.entries(FX).filter(([k]) => !k.startsWith('_')).map(([, v]) => v);
t.ok('the corpus was found (not vacuous)', CORPUS.length >= 8);
let plots = 0;
for (const st of CORPUS) {
  if (st.kind !== 'plot' || !st.spec) continue;
  plots++;
  const h = SV.render(st);
  t.ok(`M-3 · ${(st.label || 'plot').slice(0, 26)} still draws`,
    /<(polyline|polygon|circle)/.test(h));
  t.ok(`M-3 · …and emits no formula note`, !/defined by a formula/.test(h));
}
t.ok('M-3 covered real plot fixtures (not vacuous)', plots >= 3);
t.is('M-3 · and none of the corpus carries an expr at all',
  CORPUS.filter((s) => s.kind === 'plot' && s.spec &&
    (s.spec.curves || []).some((c) => typeof c.expr === 'string')), []);

// ══ 7 · M-9 / D-7 · EQUIVALENT GUARDS THAT MUST SURVIVE ═══════════════════
t.section('The suite pins behaviour, not source text');

/* Two orderings that are behaviourally identical must BOTH pass. If either of
   these ever fails, the suite has started asserting how the code is written
   rather than what it does. */
{
  const a = SV.render(plot([{ expr: 'x^2' }, { points: P2 }]));
  const b = SV.render(plot([{ expr: 'x^2' }, { points: P2 }]));
  t.ok('M-9 · rendering is deterministic across calls', a === b);
}
{
  const withKey    = SV.render(plot([{ expr: 'sin(x)', points: P2 }], [-5, 5], [-5, 5]));
  const withoutKey = SV.render(plot([{ expr: 'sin(x)' }],             [-5, 5], [-5, 5]));
  t.ok('D-7 · stored points do not change what a drawable expr draws',
    withKey === withoutKey);
}

t.done();
