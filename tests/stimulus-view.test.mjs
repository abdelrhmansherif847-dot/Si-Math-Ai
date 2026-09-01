// The stimulus renderer — the half of the exam player that was missing.
//
// Before stimulus-view.js, exam.html rendered a stimulus's label and body and
// nothing else. Every stimulus in the corpus is a `spec` with no body, so 29 of
// the 66 questions in DSAT-2026-A referred to a figure that never appeared.
// These checks are what stop that returning, and what stop the fix becoming a
// new way to attack a student.
//
// The fixtures in tests/fixtures/stimuli.json are copied VERBATIM from
// exam_stimuli in production. A renderer tested only against shapes invented to
// suit it proves nothing about the shapes it will actually meet.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SV = require('../stimulus-view.js');
const FX = require('./fixtures/stimuli.json');
const SHAPES = Object.entries(FX).filter(([k]) => !k.startsWith('_'));

const t = suite('stimulus-view');

// ══ 1 · EVERY REAL SHAPE DRAWS ════════════════════════════════════════════
t.section('Every shape the database actually holds renders something');

t.ok('the fixture covers real shapes (not vacuous)', SHAPES.length >= 12);
t.is('every kind in the corpus is represented',
  ['table', 'chart', 'plot', 'number_line'].filter(
    (k) => !SHAPES.some(([, v]) => v.kind === k)), []);
t.is('every chartType is represented',
  ['bar', 'line', 'pie'].filter(
    (ct) => !SHAPES.some(([, v]) => v.kind === 'chart' && v.spec.chartType === ct)), []);
t.is('every plot frame is represented',
  ['plane', 'graph', 'data'].filter(
    (f) => !SHAPES.some(([, v]) => v.kind === 'plot' && v.spec.frame === f)), []);
t.is('every figure mode is represented',
  ['curve', 'polygon', 'points', 'scatter'].filter(
    (m) => !SHAPES.some(([, v]) => v.kind === 'plot'
      && (v.spec.figures || []).some((f) => f.mode === m))), []);

/* The failure this file exists to end: a figure that renders as nothing. A
   fallback note counts as NOT rendering — it is the honest version of blank,
   and no real shape should reach it. */
t.is('no real shape falls back to a note',
  SHAPES.filter(([, v]) => /sv-note/.test(SV.render(v))).map(([k]) => k), []);
t.is('no output contains NaN, undefined or Infinity',
  SHAPES.filter(([, v]) => /NaN|undefined|Infinity/.test(SV.render(v))).map(([k]) => k), []);
t.is('every drawn shape emits real geometry, not an empty frame',
  SHAPES.filter(([, v]) => {
    const h = SV.render(v);
    if (v.kind === 'table') return !/<td>/.test(h);
    return !/<(polyline|polygon|rect|circle|path)\b/.test(h);
  }).map(([k]) => k), []);

// ══ 2 · ESCAPING ══════════════════════════════════════════════════════════
t.section('Author text can never become markup');

const XSS = '<script>alert(1)</script>';
const hostile = [
  { kind: 'text', label: XSS, body: XSS },
  { kind: 'table', label: XSS, spec: { headers: [XSS], rows: [[XSS]], note: XSS } },
  { kind: 'chart', spec: { chartType: 'bar', categories: [XSS], series: [{ name: XSS, values: [1] }],
                           xLabel: XSS, yLabel: XSS } },
  { kind: 'chart', spec: { chartType: 'pie', panels: [{ title: XSS, categories: [XSS, 'b'], values: [1, 1] }] } },
  { kind: 'plot', spec: { frame: 'plane', xRange: [0, 5], yRange: [0, 5], xLabel: XSS, yLabel: XSS,
                          curves: [{ points: [[1, 1], [2, 2]] }],
                          figures: [{ mode: 'points', labels: [XSS, XSS] }] } },
];
t.ok('the hostile fixtures really do reach the output (not vacuous)',
  hostile.every((h) => /alert\(1\)/.test(SV.render(h))));
t.is('no hostile field is ever emitted as a live tag',
  hostile.map((h) => SV.render(h)).filter((out) => /<script/i.test(out)).length, 0);
/* SVG <text> is parsed as markup exactly as HTML is, so a label inside a chart
   is as dangerous as one outside it. */
t.ok('escaping applies inside SVG too',
  /&lt;script&gt;/.test(SV.render(hostile[4])) && !/<script/i.test(SV.render(hostile[4])));

// ══ 3 · A FIGURE IS SANDBOXED ═════════════════════════════════════════════
t.section('An author-supplied SVG is never injected into the page');

const evilSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
const fig = SV.render({ kind: 'figure', label: 'F1', media_kind: 'svg',
  media_ref: Buffer.from(evilSvg).toString('base64') });
t.ok('a figure renders as an <img>', /<img\b/.test(fig));
t.ok('with a data: URI', /src="data:image\/svg\+xml;base64,/.test(fig));
/* The whole point: an <img> executes no script and resolves no external
   reference, whoever authored the SVG. Inlining it would be stored XSS against
   every student who opens the paper. */
t.ok('the SVG is never inlined as markup', !/<svg/i.test(fig) && !/<script/i.test(fig));
/* Stronger than "contains an img": the figure branch must emit the img and
   NOTHING else. A stray text node beside it would put the raw source on the
   page — harmless in itself, but it means something other than the sandboxed
   element is reaching the student, which is the property under test. */
const figBody = fig.replace(/^<div class="sv"[^>]*>/, '').replace(/<\/div>$/, '')
                   .replace(/<div class="sv-label">[\s\S]*?<\/div>/, '').trim();
t.ok('and the figure branch emits the sandboxed element and nothing else',
  /^<img\b[^>]*\/>$/.test(figBody));
t.ok('a figure with no media says so rather than rendering blank',
  /sv-note/.test(SV.render({ kind: 'figure', media_kind: 'svg', media_ref: null })));
t.ok('a non-svg media kind is refused',
  /sv-note/.test(SV.render({ kind: 'figure', media_kind: 'png', media_ref: 'AAAA' })));

// ══ 4 · HONEST DEGRADATION ════════════════════════════════════════════════
t.section('What it cannot draw, it says');

/* Nothing here evaluates an expression. Every plot in the corpus uses points,
   but the schema permits `expr`, and silently omitting a curve would show a
   student a graph that is wrong rather than one that is incomplete. */
const exprPlot = SV.render({ kind: 'plot', spec: { frame: 'graph', xRange: [0, 5], yRange: [0, 5],
  curves: [{ expr: 'x^2' }, { points: [[0, 0], [1, 1]] }], figures: [{ mode: 'curve' }, { mode: 'curve' }] } });
t.ok('an expression curve is reported, not dropped in silence',
  /sv-note/.test(exprPlot) && /formula/.test(exprPlot));
t.ok('and the points curve beside it is still drawn', /<polyline/.test(exprPlot));

t.ok('an unknown kind says so rather than rendering nothing',
  /sv-note/.test(SV.render({ kind: 'hologram', spec: {} })));
t.ok('a structured kind with no spec says so',
  /sv-note/.test(SV.render({ kind: 'plot', spec: null })));
t.ok('a plot with an inverted range refuses rather than drawing backwards',
  /sv-note/.test(SV.render({ kind: 'plot', spec: { frame: 'graph', xRange: [5, 0], yRange: [0, 5],
    curves: [{ points: [[1, 1]] }], figures: [{ mode: 'points' }] } })));
t.ok('a chart whose values are all zero does not divide by zero',
  !/NaN/.test(SV.render({ kind: 'chart', spec: { chartType: 'bar', categories: ['a'],
    series: [{ name: 's', values: [0] }] } })));
t.ok('nothing at all renders as nothing, not as a crash', SV.render(null) === '');

// ══ 5 · THE MEANING IS PRESERVED ══════════════════════════════════════════
t.section('The drawing says what the spec says');

/* On a number line the open/closed endpoint IS the question. If both ends drew
   the same dot, every one of these items would become unanswerable while
   looking perfectly fine. */
const nlOpen = SV.render(FX.number_line_open);
const nlClosed = SV.render(FX.number_line_closed);
t.ok('an excluded endpoint is drawn differently from an included one',
  /sv-dot-off/.test(nlOpen) && /sv-dot-on/.test(nlOpen));
t.ok('and a segment closed at both ends has no excluded endpoint',
  !/sv-dot-off/.test(nlClosed));

t.ok('a table renders one row per row and one cell per header',
  (SV.render(FX.table).match(/<tr>/g) || []).length === 5
  && (SV.render(FX.table).match(/<td>/g) || []).length === 8);

/* A closed curve must close: the circle item asks for a centre and radius, and
   an open arc would read as a different shape entirely. */
t.ok('a curve marked closed is drawn as a polygon', /<polygon/.test(SV.render(FX.plot_plane_closed)));
t.ok('an open curve is drawn as a polyline', /<polyline/.test(SV.render(FX.plot_graph_curve)));
t.ok('a dashed figure is dashed', /sv-dash/.test(SV.render(FX.plot_data_scatter)));
t.ok('vertex labels reach the drawing',
  ['O', 'A', 'B'].every((L) => new RegExp('>' + L + '</text>').test(SV.render(FX.plot_plane_polygon))));
t.ok('a pie panel labels every category with its share',
  /Mathematics · 45%/.test(SV.render(FX.chart_pie)));
t.ok('a multi-series chart carries a legend naming each series',
  /Boys/.test(SV.render(FX.chart_bar)) && /Girls/.test(SV.render(FX.chart_bar)));

// ══ 6 · THE PAGE USES IT ══════════════════════════════════════════════════
t.section('exam.html renders through the module and not around it');

const PAGE = read('exam.html');
t.ok('the module is loaded', /<script src="stimulus-view\.js"><\/script>/.test(PAGE));
t.ok('the item renderer calls it', /window\.StimulusView\.render\(it\.stimulus\)/.test(PAGE));
/* The old two-line renderer is what left 29 questions blank. If it comes back,
   it comes back silently — so its exact shape is asserted gone. */
t.ok('the label-and-body-only renderer is gone',
  !/esc\(it\.stimulus\.body\s*\|\|\s*''\)/.test(PAGE));
t.ok('a missing module degrades to a visible message, not a blank figure',
  /StimulusView[\s\S]{0,200}This figure could not be displayed/.test(PAGE));
t.ok('the stimulus styles ship with the page', /\.sv-svg\{/.test(PAGE) && /\.sv-dot-off\{/.test(PAGE));

t.done();
