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
 */
(function () {
  'use strict';

  // ══ §16.7.4 · the sampler's constants ══════════════════════════════════
  var SAMPLES = 201;          // across [x0, x1] inclusive; dx = span / 200
  var DP = 4;                 // decimal places, once, on the stored value
  var MAX_BRANCHES = 8;       // a function that breaks more than this is capped
  var MIN_POINTS = 2;         // the validator's own floor: points length >= 2

  var FUNCS = {
    sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos,
    tan: Math.tan, exp: Math.exp,
    ln: Math.log,
    log: function (v) { return Math.log(v) / Math.LN10; },   // base 10, stated
  };
  var CONSTS = { pi: Math.PI, e: Math.E };

  function round(v) { var f = Math.pow(10, DP); return Math.round(v * f) / f; }
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  /** An input the teacher has not filled in yet. Not the same as a bad one. */
  function blank(v) { return v == null || String(v).trim() === ''; }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v == null ? '' : v).trim();
    if (!s) return null;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  // ══ §16.7.2 · normalisation — a TOTAL rewriter that never raises ════════
  var SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
              '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

  function normalize(input) {
    var s = String(input == null ? '' : input);
    // 1 · trim, and every Unicode space becomes one ASCII space
    s = s.replace(/[\s   -   　]+/g, ' ').trim();
    // 2 · strip a leading "y =" / "f(x) ="
    s = s.replace(/^(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, '');
    // 3 · superscript digits become ^N, consecutive ones folding into one exponent
    s = s.replace(/[⁰¹²³⁴-⁹]+/g, function (run) {
      var d = '';
      for (var i = 0; i < run.length; i++) d += SUP[run.charAt(i)];
      return '^' + d;
    });
    // 4 · Unicode operators become ASCII
    s = s.replace(/−|–|—/g, '-').replace(/×|·/g, '*').replace(/÷/g, '/');
    // 5 · named glyphs
    s = s.replace(/π/g, 'pi').replace(/√\s*\(/g, 'sqrt(');
    // 6 · lower-case the whole string: every token in the grammar is lower-case
    //     ASCII and x is the only variable, so X, SIN( and 1E3 all land right.
    s = s.toLowerCase();
    // Anything this could not rewrite (a bare √, a stray ∫, a second variable)
    // survives here and is refused by the tokenizer — one rejection path.
    return s.replace(/\s+/g, ' ').trim();
  }

  // ══ §16.7.1 · tokenizer ═════════════════════════════════════════════════
  function tokenize(src) {
    var t = [], i = 0;
    while (i < src.length) {
      var c = src.charAt(i);
      if (c === ' ') { i++; continue; }
      if ('+-*/^()'.indexOf(c) >= 0) { t.push({ t: c, at: i }); i++; continue; }
      // A number is read GREEDILY from a digit or a leading '.', and an `e`
      // straight after the digits with at least one exponent digit belongs to
      // it. Everywhere else `e` is the constant — so 1e3 is a thousand, e^2 is
      // the constant squared, and 2e is a parse error rather than 2*e.
      if (/[0-9.]/.test(c)) {
        var m = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/.exec(src.slice(i));
        if (!m) return { error: '"' + src.slice(i, i + 6) + '" is not a number this editor understands.' };
        t.push({ t: 'num', v: Number(m[0]), at: i });
        i += m[0].length;
        continue;
      }
      if (/[a-z]/.test(c)) {
        var w = /^[a-z]+/.exec(src.slice(i))[0];
        if (w === 'x' || CONSTS.hasOwnProperty(w)) t.push({ t: w === 'x' ? 'x' : 'const', v: w, at: i });
        else if (FUNCS.hasOwnProperty(w)) t.push({ t: 'func', v: w, at: i });
        else return { error: '"' + w + '" is not one of the functions this editor understands.' };
        i += w.length;
        continue;
      }
      return { error: '"' + c + '" is not something this editor understands.' };
    }
    return { tokens: t };
  }

  // ══ §16.7.1 · recursive-descent parser ══════════════════════════════════
  //   expr  := term (('+'|'-') term)*          left
  //   term  := unary (('*'|'/') unary)*        left
  //   unary := ('-'|'+') unary | power         right, LOOSER than ^
  //   power := atom ('^' unary)?               right; the exponent may be unary
  var IMPLICIT = 'Write "2*x" rather than "2x" — this editor needs the multiplication sign.';

  function parse(input) {
    var src = normalize(input);
    if (!src) return { error: 'Type a function of x, such as x^2 - 4*x + 3.' };
    var lex = tokenize(src);
    if (lex.error) return { error: lex.error };
    var ts = lex.tokens, p = 0, failed = null;
    if (!ts.length) return { error: 'Type a function of x, such as x^2 - 4*x + 3.' };

    var peek = function () { return ts[p]; };
    var fail = function (msg) { if (!failed) failed = msg; return { k: 'num', v: 0 }; };

    function atom() {
      var tk = peek();
      if (!tk) return fail('This function is incomplete.');
      if (tk.t === 'num')   { p++; return { k: 'num', v: tk.v }; }
      if (tk.t === 'x')     { p++; return { k: 'x' }; }
      if (tk.t === 'const') { p++; return { k: 'num', v: CONSTS[tk.v] }; }
      if (tk.t === 'func') {
        p++;
        if (!peek() || peek().t !== '(')
          return fail('Write "' + tk.v + '(x)" with brackets around what it applies to.');
        p++;
        var a = expr();
        if (!peek() || peek().t !== ')') return fail('This function is missing a closing bracket.');
        p++;
        return { k: 'call', f: tk.v, a: a };
      }
      if (tk.t === '(') {
        p++;
        var e = expr();
        if (!peek() || peek().t !== ')') return fail('This function is missing a closing bracket.');
        p++;
        return e;
      }
      return fail('This function is incomplete.');
    }
    function power() {
      var base = atom();
      if (peek() && peek().t === '^') { p++; return { k: 'op', o: '^', l: base, r: unary() }; }
      return base;
    }
    function unary() {
      var tk = peek();
      if (tk && (tk.t === '-' || tk.t === '+')) { p++; var u = unary(); return tk.t === '-' ? { k: 'neg', a: u } : u; }
      return power();
    }
    function term() {
      var n = unary();
      while (peek() && (peek().t === '*' || peek().t === '/')) { var o = peek().t; p++; n = { k: 'op', o: o, l: n, r: unary() }; }
      return n;
    }
    function expr() {
      var n = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) { var o = peek().t; p++; n = { k: 'op', o: o, l: n, r: term() }; }
      return n;
    }

    var ast = expr();
    if (failed) return { error: failed };
    if (p < ts.length) {
      // The commonest way this happens is implicit multiplication: 2x, 2(x+1),
      // x(x+1). Say the fix rather than "unexpected token".
      var prev = ts[p - 1], next = ts[p];
      var prevEnds = prev && (prev.t === 'num' || prev.t === 'x' || prev.t === 'const' || prev.t === ')');
      var nextBegins = next && (next.t === 'x' || next.t === 'const' || next.t === 'func' || next.t === '(' || next.t === 'num');
      return { error: prevEnds && nextBegins ? IMPLICIT : 'This function has something extra after the end.' };
    }
    return { ast: ast, expr: src };
  }

  // ══ §16.7.3 · evaluation. Total: a domain error is a non-finite number ══
  function evalAt(ast, x) {
    switch (ast.k) {
      case 'num': return ast.v;
      case 'x': return x;
      case 'neg': return -evalAt(ast.a, x);
      case 'call': return FUNCS[ast.f](evalAt(ast.a, x));
      case 'op': {
        var l = evalAt(ast.l, x), r = evalAt(ast.r, x);
        if (ast.o === '+') return l + r;
        if (ast.o === '-') return l - r;
        if (ast.o === '*') return l * r;
        if (ast.o === '/') return l / r;
        return Math.pow(l, r);
      }
      default: return NaN;
    }
  }

  // ══ §16.7.4 · sample → branches ═════════════════════════════════════════
  function sample(ast, x0, x1, y0, y1) {
    var span = y1 - y0, raw = [], i;
    for (i = 0; i < SAMPLES; i++) {
      var x = x0 + (x1 - x0) * i / (SAMPLES - 1);
      var y;
      try { y = evalAt(ast, x); } catch (_) { y = NaN; }
      raw.push(isFinite(y) ? [round(x), round(y)] : null);
    }
    var runs = [], cur = [], invalid = 0;
    for (i = 0; i < raw.length; i++) {
      var pt = raw[i];
      if (pt === null) { invalid++; if (cur.length) runs.push(cur); cur = []; continue; }
      /* The one heuristic in Stage 0: split where the change between
         consecutive stored samples exceeds the whole height of the Y range.
         Without it tan(x) and 1/x draw a full-height vertical line straight
         through the asymptote, which reads as a continuous function. */
      if (cur.length && Math.abs(pt[1] - cur[cur.length - 1][1]) > span) { runs.push(cur); cur = []; }
      cur.push(pt);
    }
    if (cur.length) runs.push(cur);

    // A run shorter than the minimum is DISCARDED. Nothing is invented,
    // duplicated, extrapolated or interpolated to rescue it.
    var kept = [];
    for (i = 0; i < runs.length; i++) if (runs[i].length >= MIN_POINTS) kept.push(runs[i]);
    var capped = kept.length > MAX_BRANCHES;
    if (capped) kept = kept.slice(0, MAX_BRANCHES);
    var visible = 0;
    for (i = 0; i < kept.length; i++)
      for (var j = 0; j < kept[i].length; j++)
        if (kept[i][j][1] >= y0 && kept[i][j][1] <= y1) visible++;
    return { branches: kept, invalid: invalid, runs: runs.length,
             dropped: runs.length - kept.length - (capped ? 0 : 0), capped: capped, visible: visible };
  }

  /** Parse + sample one function. Returns {branches, expr, capped} or {error}. */
  function sampleFunction(input, x0, x1, y0, y1) {
    var pr = parse(input);
    if (pr.error) return { error: pr.error };
    var s = sample(pr.ast, x0, x1, y0, y1);
    if (!s.branches.length) return { error: 'This function has no drawable part in the range you set.' };
    if (s.visible < 2) return { error: 'That function does not pass through the visible part of the graph. Widen the Y axis, or change the function.' };
    return { expr: pr.expr, branches: s.branches, capped: s.capped, invalid: s.invalid, runs: s.runs };
  }

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
      if (r.capped) warnings.push('"' + r.expr + '" breaks into more than ' + MAX_BRANCHES
        + ' pieces in this range. Showing the first ' + MAX_BRANCHES
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
      if (pts.length < MIN_POINTS) return { error: ERR.twoPoints };
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
    SAMPLES: SAMPLES, DP: DP, MAX_BRANCHES: MAX_BRANCHES, MIN_POINTS: MIN_POINTS,
    FUNCTION_NAMES: Object.keys(FUNCS).sort(),
  };
  if (typeof window !== 'undefined') window.StimulusEditor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}());
