/* stimulus-editor.js — the authoring half of a stimulus.
 *
 * stimulus-view.js turns a spec into HTML. This turns a TEACHER into a spec.
 * It is the Stage 0 answer to a surface that used to ask a teacher to hand-write
 * {"headers":[…],"rows":[[…]]} in a monospace textarea.
 *
 * IT LIVES IN THE AUTHORING LAYER, ON PURPOSE
 * -------------------------------------------
 * Every function here is pure and runs in the browser. Nothing here is a
 * database function and nothing here belongs in the renderer: Stage 0's whole
 * shape is that the EDITOR samples a formula and stores the result, so the
 * database it writes to and the renderer that draws it are both unchanged.
 * See docs/roadmap/teacher-intelligence-layer.md §16.4 and §16.7.
 *
 * THE CONTRACT IT SERVES
 * ----------------------
 *   · Every spec it emits must satisfy exam_stimulus_spec_ok() — the live
 *     CHECK constraint. This file is the reader of that contract, never a
 *     second opinion about it.
 *   · A function curve stores BOTH the normalised `expr` (the meaning, which
 *     Stage 1 will render directly) AND its sampled `points` (what today's
 *     renderer draws). Never `expr` alone: that is the one shape the renderer
 *     answers with "defined by a formula and is not drawn here".
 *   · A break in a function is a SEPARATE CURVE. The renderer draws each
 *     curve's points as one polyline and has no break token, so a contiguous
 *     run of valid samples is one curve, and a function that breaks
 *     contributes several — all carrying the same `expr`.
 *   · Points are never invented. Every coordinate stored is a real sample.
 *
 * THE PARSER IS A TOTAL FUNCTION OVER A FIXED TOKEN SET.
 * No eval, no Function, no expression engine. An input it does not understand
 * is a refusal with a sentence, never a surprise at render time.
 *
 * DEPENDS ON stimulus-expr.js — the expression half (constants, normalise,
 * parse, sample) moved there in Stage 1 so the RENDERER can share it without
 * depending on this module. Resolution is lazy, so load order never matters,
 * and the eight expression keys below are re-exported here unchanged: this
 * module's public API is exactly what it was. See §16.10.12 (U-2).
 */
(function () {
  'use strict';

  /* The expression half, resolved LAZILY so script order never matters —
     the pattern taxonomy-compat.js already uses. Node takes the require path,
     the browser takes the global; neither is reached at load time. */
  function EXPR() {
    var m = (typeof window !== 'undefined' && window.StimulusExpr) || null;
    if (!m && typeof require === 'function') { try { m = require('./stimulus-expr.js'); } catch (_) { m = null; } }
    if (!m) throw new Error('stimulus-editor.js requires stimulus-expr.js');
    return m;
  }
  function normalize(s)                { return EXPR().normalize(s); }
  function parse(s)                    { return EXPR().parse(s); }
  function sampleFunction(s, a, b, c, d) { return EXPR().sampleFunction(s, a, b, c, d); }
  function blank(v)                    { return EXPR().blank(v); }
  function num(v)                      { return EXPR().num(v); }
  function round(v)                    { return EXPR().round(v); }


  // ══ builders — every one returns {spec} or {error} ══════════════════════
  var ERR = {
    tableCols: 'A table needs at least one column.',
    tableRows: 'A table needs at least one row.',
    chartNum:  'Every value must be a number.',
    pieSlices: 'A pie chart needs between 2 and 4 slices in each panel.',
    pieZero:   'A pie panel’s values cannot all be zero.',
    nlOrder:   'From must be smaller than To.',
    nlEmpty:   'A number line needs at least one point or one interval.',
    axisOrder: 'The X axis must run from a smaller number to a larger one.',
    axisOrderY:'The Y axis must run from a smaller number to a larger one.',
    plotEmpty: 'A graph needs at least one function or one point.',
    twoPoints: 'Mark at least two points, or use a function.',
  };

  function buildTable(inp) {
    var headers = (inp.headers || []).map(function (h) { return String(h == null ? '' : h); });
    var rows = inp.rows || [];
    if (!headers.length) return { error: ERR.tableCols };
    if (!rows.length) return { error: ERR.tableRows };
    var spec = { headers: headers, rows: rows.map(function (r) {
      var out = [];
      for (var c = 0; c < headers.length; c++) out.push(String(r && r[c] != null ? r[c] : ''));
      return out;
    }) };
    var note = String(inp.note == null ? '' : inp.note).trim();
    if (note) spec.note = note;
    return { spec: spec };
  }

  function buildChart(inp) {
    if (inp.chartType === 'pie') {
      var panels = [];
      for (var p = 0; p < (inp.panels || []).length; p++) {
        var pan = inp.panels[p];
        var cats = (pan.categories || []).map(function (c) { return String(c == null ? '' : c).trim(); })
                    .filter(function (c) { return c !== ''; });
        if (cats.length < 2 || cats.length > 4) return { error: ERR.pieSlices };
        var vals = [], sum = 0;
        for (var v = 0; v < cats.length; v++) {
          var n = num((pan.values || [])[v]);
          if (n === null || n < 0) return { error: ERR.chartNum };
          vals.push(n); sum += n;
        }
        if (sum <= 0) return { error: ERR.pieZero };
        var out = { categories: cats, values: vals };
        var title = String(pan.title == null ? '' : pan.title).trim();
        if (title) out.title = title;
        panels.push(out);
      }
      if (!panels.length || panels.length > 3) return { error: ERR.pieSlices };
      // A pie spec must carry NONE of categories/series/xLabel/yLabel.
      return { spec: { chartType: 'pie', panels: panels } };
    }

    var categories = (inp.categories || []).map(function (c) { return String(c == null ? '' : c).trim(); })
                       .filter(function (c) { return c !== ''; });
    if (!categories.length) return { error: 'A chart needs at least one category.' };
    var series = [];
    for (var s = 0; s < (inp.series || []).length; s++) {
      var ser = inp.series[s];
      var values = [];
      for (var i = 0; i < categories.length; i++) {
        var n2 = num((ser.values || [])[i]);
        if (n2 === null) return { error: ERR.chartNum };
        values.push(n2);
      }
      series.push({ name: String(ser.name == null ? '' : ser.name).trim() || ('Series ' + (s + 1)), values: values });
    }
    if (!series.length) return { error: 'A chart needs at least one series.' };
    var spec2 = { chartType: inp.chartType === 'line' ? 'line' : 'bar', categories: categories, series: series };
    var xl = String(inp.xLabel == null ? '' : inp.xLabel).trim();
    var yl = String(inp.yLabel == null ? '' : inp.yLabel).trim();
    if (xl) spec2.xLabel = xl;
    if (yl) spec2.yLabel = yl;
    return { spec: spec2 };
  }

  function buildNumberLine(inp) {
    var min = num(inp.min), max = num(inp.max);
    if (min === null || max === null) return { error: ERR.chartNum };
    if (!(min < max)) return { error: ERR.nlOrder };
    var points = [], segs = [], i;
    /* A row the teacher has not filled in yet is not an error — it is an empty
       row. The graph editor already skips a blank function row this way, and
       without the same rule here, opening the number line and pressing Preview
       answers "Every value must be a number" about a field nobody typed in.
       A row with something in it that is not a number is still refused. */
    for (i = 0; i < (inp.points || []).length; i++) {
      if (blank(inp.points[i])) continue;
      var v = num(inp.points[i]);
      if (v === null) return { error: ERR.chartNum };
      if (v < min || v > max) return { error: 'Every point must sit between ' + min + ' and ' + max + '.' };
      points.push(v);
    }
    for (i = 0; i < (inp.segments || []).length; i++) {
      var g = inp.segments[i];
      /* Both ends blank is an untouched row; ONE end blank is a half-finished
         interval, and that is a real mistake worth naming. */
      if (blank(g.from) && blank(g.to)) continue;
      var a = num(g.from), b = num(g.to);
      if (a === null || b === null) return { error: ERR.chartNum };
      if (!(a < b)) return { error: ERR.nlOrder };
      if (a < min || b > max) return { error: 'Every interval must sit between ' + min + ' and ' + max + '.' };
      segs.push({ from: a, to: b, fromClosed: !!g.fromClosed, toClosed: !!g.toClosed });
    }
    if (!points.length && !segs.length) return { error: ERR.nlEmpty };
    var spec = { min: min, max: max };
    if (segs.length) spec.segments = segs;
    if (points.length) spec.points = points;
    return { spec: spec };
  }

  /** The graph. Functions become expr+points curves, one per branch. */
  function buildPlot(inp) {
    var x0 = num(inp.xMin), x1 = num(inp.xMax), y0 = num(inp.yMin), y1 = num(inp.yMax);
    if (x0 === null || x1 === null || y0 === null || y1 === null) return { error: ERR.chartNum };
    if (!(x0 < x1)) return { error: ERR.axisOrder };
    if (!(y0 < y1)) return { error: ERR.axisOrderY };

    var curves = [], figures = [], warnings = [], i, j;

    for (i = 0; i < (inp.functions || []).length; i++) {
      var raw = String(inp.functions[i] == null ? '' : inp.functions[i]).trim();
      if (!raw) continue;
      var r = sampleFunction(raw, x0, x1, y0, y1);
      if (r.error) return { error: r.error };
      // ONE CURVE PER BRANCH, each carrying the same expr. This is how a
      // segment break is expressed without touching the renderer.
      for (j = 0; j < r.branches.length; j++) {
        curves.push({ expr: r.expr, points: r.branches[j] });
        figures.push({ mode: 'curve' });
      }
      if (r.capped) warnings.push('"' + r.expr + '" breaks into more than ' + EXPR().MAX_BRANCHES
        + ' pieces in this range. Showing the first ' + EXPR().MAX_BRANCHES
        + ' — narrowing the X axis will show it properly.');
    }

    for (i = 0; i < (inp.pointGroups || []).length; i++) {
      var grp = inp.pointGroups[i] || {};
      var pts = [], labels = [], anyLabel = false;
      for (j = 0; j < (grp.points || []).length; j++) {
        var px = num(grp.points[j].x), py = num(grp.points[j].y);
        if (px === null || py === null) return { error: ERR.chartNum };
        pts.push([round(px), round(py)]);
        var lb = String(grp.points[j].label == null ? '' : grp.points[j].label).trim();
        labels.push(lb); if (lb) anyLabel = true;
      }
      if (!pts.length) continue;
      // The validator requires points length >= 2. A single marked point
      // cannot be stored, and nothing is duplicated to pretend otherwise.
      if (pts.length < EXPR().MIN_POINTS) return { error: ERR.twoPoints };
      var fig = { mode: 'points' };
      if (anyLabel) {
        for (j = 0; j < labels.length; j++) if (!labels[j]) return { error: 'Label every point in this group, or none of them.' };
        fig.labels = labels;
      }
      curves.push({ points: pts });
      figures.push(fig);
    }

    if (!curves.length) return { error: ERR.plotEmpty };
    var spec = { frame: 'plane', xRange: [x0, x1], yRange: [y0, y1], curves: curves, figures: figures };
    var xl = String(inp.xLabel == null ? '' : inp.xLabel).trim();
    var yl = String(inp.yLabel == null ? '' : inp.yLabel).trim();
    if (xl) spec.xLabel = xl;
    if (yl) spec.yLabel = yl;
    return { spec: spec, warnings: warnings };
  }

  // ══ hydration — a stored spec back into editor inputs ═══════════════════
  /* The round-trip law: if a spec carries anything the visual editor cannot
     represent, it does NOT load partially. It reports why, and the caller
     opens it in Advanced instead. A partial load that saved back would drop
     fields silently, which is the one failure a teacher cannot see. */
  var PLOT_TOP = ['frame', 'xRange', 'yRange', 'curves', 'figures', 'xLabel', 'yLabel'];

  function hydrateTable(spec) {
    return { inputs: { headers: (spec.headers || []).slice(),
                       rows: (spec.rows || []).map(function (r) { return r.slice(); }),
                       note: spec.note || '' } };
  }

  function hydrateChart(spec) {
    if (spec.chartType === 'pie') {
      return { inputs: { chartType: 'pie', panels: (spec.panels || []).map(function (p) {
        return { categories: p.categories.slice(), values: p.values.slice(), title: p.title || '' }; }) } };
    }
    return { inputs: { chartType: spec.chartType, categories: (spec.categories || []).slice(),
      series: (spec.series || []).map(function (s) { return { name: s.name, values: s.values.slice() }; }),
      xLabel: spec.xLabel || '', yLabel: spec.yLabel || '' } };
  }

  function hydrateNumberLine(spec) {
    return { inputs: { min: spec.min, max: spec.max,
      points: (spec.points || []).slice(),
      segments: (spec.segments || []).map(function (g) {
        return { from: g.from, to: g.to, fromClosed: !!g.fromClosed, toClosed: !!g.toClosed }; }) } };
  }

  function hydratePlot(spec) {
    var k, i;
    for (k in spec) if (Object.prototype.hasOwnProperty.call(spec, k) && PLOT_TOP.indexOf(k) < 0)
      return { advanced: 'This graph uses "' + k + '", which the visual editor does not handle.' };
    if (spec.frame !== 'plane')
      return { advanced: 'This graph uses the "' + spec.frame + '" frame, which the visual editor does not handle.' };
    var curves = spec.curves || [], figures = spec.figures || [];
    if (curves.length !== figures.length) return { advanced: 'This graph’s curves and figures do not line up.' };

    var functions = [], groups = [], lastExpr = null;
    for (i = 0; i < curves.length; i++) {
      var c = curves[i], f = figures[i] || {};
      if (f.closed !== undefined || f.vertices !== undefined || f.dashed !== undefined)
        return { advanced: 'This graph uses drawing options the visual editor does not handle.' };
      if (f.mode !== 'curve' && f.mode !== 'points')
        return { advanced: 'This graph uses the "' + f.mode + '" mode, which the visual editor does not handle.' };
      if (!Array.isArray(c.points))
        return { advanced: 'This graph has a curve with no points, which the visual editor does not handle.' };
      if (c.expr) {
        if (f.mode !== 'curve') return { advanced: 'This graph pairs a formula with a mode the visual editor does not handle.' };
        // Consecutive curves sharing one expr are BRANCHES OF ONE FUNCTION and
        // must fold back into a single row, or the round trip would multiply
        // the function by its own branch count.
        if (c.expr !== lastExpr) { functions.push(c.expr); lastExpr = c.expr; }
        continue;
      }
      lastExpr = null;
      if (f.mode !== 'points') return { advanced: 'This graph has points drawn in a mode the visual editor does not handle.' };
      if (f.labels && f.labels.length !== c.points.length)
        return { advanced: 'This graph labels only some of its points, which the visual editor does not handle.' };
      groups.push({ points: c.points.map(function (p, n) {
        return { x: p[0], y: p[1], label: f.labels ? f.labels[n] : '' }; }) });
    }
    return { inputs: { xMin: spec.xRange[0], xMax: spec.xRange[1], yMin: spec.yRange[0], yMax: spec.yRange[1],
      functions: functions, pointGroups: groups, xLabel: spec.xLabel || '', yLabel: spec.yLabel || '' } };
  }

  /** Dispatch. {inputs} to edit visually, {advanced, reason} to fall back. */
  function hydrate(kind, spec) {
    if (!spec || typeof spec !== 'object') return { advanced: 'This figure has no data the visual editor can read.' };
    if (kind === 'table') return hydrateTable(spec);
    if (kind === 'chart') return hydrateChart(spec);
    if (kind === 'number_line') return hydrateNumberLine(spec);
    if (kind === 'plot') return hydratePlot(spec);
    return { advanced: 'This kind has no visual editor.' };
  }

  function build(kind, inputs) {
    if (kind === 'table') return buildTable(inputs);
    if (kind === 'chart') return buildChart(inputs);
    if (kind === 'number_line') return buildNumberLine(inputs);
    if (kind === 'plot') return buildPlot(inputs);
    return { error: 'That kind has no visual editor.' };
  }

  /** Excel and Sheets paste as tab-separated lines. */
  function parseTSV(text) {
    var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i] === '' && i === lines.length - 1) continue;
      out.push(lines[i].split('\t'));
    }
    return out;
  }

  var api = {
    normalize: normalize, parse: parse, sampleFunction: sampleFunction,
    build: build, hydrate: hydrate, parseTSV: parseTSV,
  };
  /* The four constants and FUNCTION_NAMES are re-exported as GETTERS, not
     values: reading them still gives exactly what it always gave, but nothing
     resolves stimulus-expr.js at load time, so script order stays free. */
  ['SAMPLES', 'DP', 'MAX_BRANCHES', 'MIN_POINTS', 'FUNCTION_NAMES'].forEach(function (k) {
    Object.defineProperty(api, k, { enumerable: true, get: function () { return EXPR()[k]; } });
  });
  if (typeof window !== 'undefined') window.StimulusEditor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}());
