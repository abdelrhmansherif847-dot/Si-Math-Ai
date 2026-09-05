/* stimulus-view.js — one stimulus, drawn.
 *
 * A stimulus is a row of exam_stimuli (platform) or teacher_exam_stimuli
 * (later). This module turns one into HTML. It is the missing half of the exam
 * player: until it existed, assignments.html rendered a stimulus's label and body and
 * nothing else, so all 25 platform stimuli — every one of which is a `spec` and
 * none of which has a `body` — were invisible to students. 29 of the 66
 * questions in DSAT-2026-A referred to a figure that never appeared.
 *
 * IT DRAWS WHAT THE SPEC SAYS AND DERIVES NOTHING
 * ------------------------------------------------
 * The database validates every spec through exam_stimulus_spec_ok() and its
 * helpers before a row can exist. This module is the reader of that contract,
 * not a second opinion about it: it never repairs a malformed spec, never
 * guesses a missing field, and never invents an axis. Where it cannot draw
 * something it says so in the output rather than rendering blank — a silent
 * omission is how a student ends up staring at an unanswerable question, which
 * is the exact failure this file exists to end.
 *
 * THREE SHAPES, MUTUALLY EXCLUSIVE — enforced by exam_stimuli_shape_check:
 *   kind 'text'                                  -> body
 *   kind table|chart|plot|number_line            -> spec
 *   kind 'figure'                                -> media_ref
 *
 * A FIGURE IS NEVER INLINED
 * -------------------------
 * SVG is a document format: it can carry <script>, event handlers and external
 * references. An author-supplied SVG written into the page with innerHTML is
 * stored XSS against every student who opens the paper, executing in a session
 * that holds their whole learning record. Figures render as
 * <img src="data:image/svg+xml;base64,...">, where scripts do not execute and
 * external references do not resolve. The cost is that CSS cannot restyle it,
 * which is one more reason the structured kinds are the ones to prefer.
 *
 * EVERY STRING THAT REACHES THE OUTPUT IS ESCAPED, including inside SVG, where
 * <text> content is parsed as markup exactly as it is in HTML.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Coordinates come from a validated spec, but a validated number can still be
     an integer overflow away from NaN once arithmetic touches it, and one NaN
     in a path attribute silently voids the whole path. Every number that
     reaches the output goes through here. */
  function fin(v, fallback) {
    var n = typeof v === 'number' ? v : Number(v);
    return isFinite(n) ? n : fallback;
  }
  function r2(n) { return Math.round(n * 100) / 100; }

  function note(text, fault) {
    /* `fault` marks a DEPLOYMENT fault with a data- attribute rather than a
       class: renderer-css-parity derives its class-token list from this file's
       whole stripped source, so any name containing `sv-` — `data-sv-fault`
       included — would become a 31st token needing a CSS rule on three pages.
       `data-fault` carries the same distinction for none of that. */
    return '<div class="sv-note"' + (fault ? ' data-fault="' + fault + '"' : '')
         + '>' + esc(text) + '</div>';
  }

  // ── text ────────────────────────────────────────────────────────────────
  function renderText(st) {
    return '<div class="sv-text">' + esc(st.body || '') + '</div>';
  }

  // ── table ───────────────────────────────────────────────────────────────
  function renderTable(spec) {
    var headers = Array.isArray(spec.headers) ? spec.headers : [];
    var rows = Array.isArray(spec.rows) ? spec.rows : [];
    if (!headers.length) return note('This table has no columns to show.');
    var out = '<div class="sv-scroll"><table class="sv-table"><thead><tr>';
    for (var i = 0; i < headers.length; i++) out += '<th>' + esc(headers[i]) + '</th>';
    out += '</tr></thead><tbody>';
    for (var r = 0; r < rows.length; r++) {
      var row = Array.isArray(rows[r]) ? rows[r] : [];
      out += '<tr>';
      for (var c = 0; c < headers.length; c++) out += '<td>' + esc(row[c] == null ? '' : row[c]) + '</td>';
      out += '</tr>';
    }
    out += '</tbody></table></div>';
    if (spec.note) out += '<div class="sv-cap">' + esc(spec.note) + '</div>';
    return out;
  }

  // ── chart ───────────────────────────────────────────────────────────────
  var SERIES_COLOURS = ['#38bdf8', '#f5a524', '#4ade80', '#c084fc', '#fb7185'];

  function renderBarOrLine(spec) {
    var cats = Array.isArray(spec.categories) ? spec.categories : [];
    var series = Array.isArray(spec.series) ? spec.series : [];
    if (!cats.length || !series.length) return note('This chart has no data to show.');

    var W = 520, H = 300, ml = 52, mr = 14, mt = 16, mb = 54;
    var iw = W - ml - mr, ih = H - mt - mb;

    var max = 0;
    for (var s = 0; s < series.length; s++) {
      var vals = Array.isArray(series[s].values) ? series[s].values : [];
      for (var v = 0; v < vals.length; v++) max = Math.max(max, fin(vals[v], 0));
    }
    if (max <= 0) max = 1;
    var step = Math.pow(10, Math.floor(Math.log(max) / Math.LN10));
    var top = Math.ceil(max / step) * step;
    if (top === max) top = max + step;

    var y = function (val) { return mt + ih - (fin(val, 0) / top) * ih; };
    var band = iw / cats.length;

    var svg = '<svg class="sv-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" '
      + 'aria-label="' + esc((spec.chartType === 'line' ? 'Line' : 'Bar') + ' chart') + '">';

    // gridlines and y ticks
    for (var g = 0; g <= 4; g++) {
      var gv = top * g / 4, gy = r2(y(gv));
      svg += '<line x1="' + ml + '" y1="' + gy + '" x2="' + (ml + iw) + '" y2="' + gy + '" class="sv-grid"/>';
      svg += '<text x="' + (ml - 8) + '" y="' + r2(gy + 4) + '" class="sv-tick sv-tick-y">' + esc(r2(gv)) + '</text>';
    }
    svg += '<line x1="' + ml + '" y1="' + mt + '" x2="' + ml + '" y2="' + (mt + ih) + '" class="sv-axis"/>';
    svg += '<line x1="' + ml + '" y1="' + (mt + ih) + '" x2="' + (ml + iw) + '" y2="' + (mt + ih) + '" class="sv-axis"/>';

    if (spec.chartType === 'line') {
      for (var li = 0; li < series.length; li++) {
        var lv = Array.isArray(series[li].values) ? series[li].values : [];
        var pts = [];
        for (var p = 0; p < lv.length; p++) pts.push(r2(ml + band * (p + 0.5)) + ',' + r2(y(lv[p])));
        if (pts.length) {
          svg += '<polyline points="' + pts.join(' ') + '" class="sv-line" '
              + 'style="stroke:' + SERIES_COLOURS[li % SERIES_COLOURS.length] + '"/>';
          for (var d = 0; d < lv.length; d++) {
            svg += '<circle cx="' + r2(ml + band * (d + 0.5)) + '" cy="' + r2(y(lv[d])) + '" r="3.2" '
                + 'style="fill:' + SERIES_COLOURS[li % SERIES_COLOURS.length] + '"/>';
          }
        }
      }
    } else {
      var bw = Math.max(4, (band * 0.68) / series.length);
      for (var bi = 0; bi < series.length; bi++) {
        var bv = Array.isArray(series[bi].values) ? series[bi].values : [];
        for (var k = 0; k < bv.length; k++) {
          var bx = ml + band * k + (band - bw * series.length) / 2 + bw * bi;
          var by = y(bv[k]);
          svg += '<rect x="' + r2(bx) + '" y="' + r2(by) + '" width="' + r2(bw) + '" '
              + 'height="' + r2(mt + ih - by) + '" '
              + 'style="fill:' + SERIES_COLOURS[bi % SERIES_COLOURS.length] + '"/>';
        }
      }
    }

    for (var c2 = 0; c2 < cats.length; c2++) {
      svg += '<text x="' + r2(ml + band * (c2 + 0.5)) + '" y="' + (mt + ih + 18) + '" '
          + 'class="sv-tick sv-tick-x">' + esc(cats[c2]) + '</text>';
    }
    if (spec.xLabel) svg += '<text x="' + r2(ml + iw / 2) + '" y="' + (H - 8) + '" class="sv-axlabel">' + esc(spec.xLabel) + '</text>';
    if (spec.yLabel) svg += '<text x="14" y="' + r2(mt + ih / 2) + '" class="sv-axlabel" '
        + 'transform="rotate(-90 14 ' + r2(mt + ih / 2) + ')">' + esc(spec.yLabel) + '</text>';
    svg += '</svg>';

    var legend = '';
    if (series.length > 1) {
      legend = '<div class="sv-legend">';
      for (var q = 0; q < series.length; q++) {
        legend += '<span class="sv-key"><i style="background:' + SERIES_COLOURS[q % SERIES_COLOURS.length] + '"></i>'
               + esc(series[q].name) + '</span>';
      }
      legend += '</div>';
    }
    return svg + legend;
  }

  function renderPie(spec) {
    var panels = Array.isArray(spec.panels) ? spec.panels : [];
    if (!panels.length) return note('This chart has no data to show.');
    var out = '<div class="sv-panels">';
    for (var p = 0; p < panels.length; p++) {
      var cats = Array.isArray(panels[p].categories) ? panels[p].categories : [];
      var vals = Array.isArray(panels[p].values) ? panels[p].values : [];
      var total = 0, i;
      for (i = 0; i < vals.length; i++) total += Math.max(0, fin(vals[i], 0));
      if (total <= 0) { out += note('A panel of this chart has no values.'); continue; }

      var S = 180, cx = S / 2, cy = S / 2, rad = 66, a0 = -Math.PI / 2;
      var svg = '<svg class="sv-svg sv-pie" viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="Pie chart">';
      for (i = 0; i < vals.length; i++) {
        var frac = Math.max(0, fin(vals[i], 0)) / total;
        var a1 = a0 + frac * Math.PI * 2;
        var col = SERIES_COLOURS[i % SERIES_COLOURS.length];
        if (frac >= 0.9999) {
          svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" style="fill:' + col + '"/>';
        } else {
          var x0 = r2(cx + rad * Math.cos(a0)), y0 = r2(cy + rad * Math.sin(a0));
          var x1 = r2(cx + rad * Math.cos(a1)), y1 = r2(cy + rad * Math.sin(a1));
          svg += '<path d="M' + cx + ' ' + cy + ' L' + x0 + ' ' + y0
              + ' A' + rad + ' ' + rad + ' 0 ' + (frac > 0.5 ? 1 : 0) + ' 1 ' + x1 + ' ' + y1 + ' Z" '
              + 'style="fill:' + col + '"/>';
        }
        a0 = a1;
      }
      svg += '</svg>';

      var keys = '<div class="sv-legend">';
      for (i = 0; i < cats.length; i++) {
        var pct = Math.round((Math.max(0, fin(vals[i], 0)) / total) * 1000) / 10;
        keys += '<span class="sv-key"><i style="background:' + SERIES_COLOURS[i % SERIES_COLOURS.length] + '"></i>'
             + esc(cats[i]) + ' · ' + esc(pct) + '%</span>';
      }
      keys += '</div>';

      out += '<figure class="sv-panel">'
          + (panels[p].title ? '<figcaption class="sv-cap">' + esc(panels[p].title) + '</figcaption>' : '')
          + svg + keys + '</figure>';
    }
    return out + '</div>';
  }

  // ── plot ────────────────────────────────────────────────────────────────
  /* ── Stage 1 · the expression evaluator (stimulus-expr.js) ───────────────
     Resolved LAZILY, at call time, so script order never matters — the pattern
     taxonomy-compat.js already uses. The `typeof require` guard matters: this
     file is a browser IIFE, and an unguarded require() would throw on load in
     every page. Unlike taxonomy-compat.js this does NOT degrade quietly: a
     missing evaluator is a DEPLOYMENT FAULT, never an undrawable expression
     (§16.10.12 C-3), because the only quiet fallback available is a message
     that lies about the cause. */
  function EXPR() {
    var m = (typeof window !== 'undefined' && window.StimulusExpr) || null;
    if (!m && typeof require === 'function') {
      try { m = require('./stimulus-expr.js'); } catch (_) { m = null; }
    }
    return m || null;
  }
  var MISSING_EVALUATOR =
    'Stage 1 expression evaluator is missing: load stimulus-expr.js before rendering expression curves.';

  function renderPlot(spec) {
    var xr = Array.isArray(spec.xRange) ? spec.xRange : [];
    var yr = Array.isArray(spec.yRange) ? spec.yRange : [];
    var curves = Array.isArray(spec.curves) ? spec.curves : [];
    var figures = Array.isArray(spec.figures) ? spec.figures : [];
    var x0 = fin(xr[0], 0), x1 = fin(xr[1], 1), y0 = fin(yr[0], 0), y1 = fin(yr[1], 1);
    if (!(x1 > x0) || !(y1 > y0)) return note('This graph has no range to draw.');

    var frame = spec.frame === 'plane' || spec.frame === 'graph' || spec.frame === 'data' ? spec.frame : 'graph';
    /* A plane carries its labels at the ends of its own axes, so it needs no
       room outside. An edge-framed graph puts them outside the plotting area,
       the way the chart renderer does — otherwise the y label lands on top of
       the highest tick, which is exactly what it did before this was split. */
    var edge = frame !== 'plane';
    var W = 420, H = 340;
    var ml = edge ? 52 : 34, mr = edge ? 16 : 34, mt = edge ? 18 : 34, mb = edge ? 50 : 34;
    var iw = W - ml - mr, ih = H - mt - mb;
    var SX = function (x) { return r2(ml + ((fin(x, x0) - x0) / (x1 - x0)) * iw); };
    var SY = function (y) { return r2(mt + ih - ((fin(y, y0) - y0) / (y1 - y0)) * ih); };

    var svg = '<svg class="sv-svg sv-plot" viewBox="0 0 ' + W + ' ' + H + '" role="img" '
      + 'aria-label="' + esc(spec.xLabel || spec.yLabel ? 'Graph' : 'Coordinate plot') + '">';

    // Integer gridlines, capped so a wide range does not emit hundreds of nodes.
    var stepX = Math.max(1, Math.ceil((x1 - x0) / 12));
    var stepY = Math.max(1, Math.ceil((y1 - y0) / 12));
    var gx, gy;
    for (gx = Math.ceil(x0); gx <= x1; gx += stepX)
      svg += '<line x1="' + SX(gx) + '" y1="' + SY(y0) + '" x2="' + SX(gx) + '" y2="' + SY(y1) + '" class="sv-grid"/>';
    for (gy = Math.ceil(y0); gy <= y1; gy += stepY)
      svg += '<line x1="' + SX(x0) + '" y1="' + SY(gy) + '" x2="' + SX(x1) + '" y2="' + SY(gy) + '" class="sv-grid"/>';

    /* The frame is what the figure IS, so it decides where the axes sit: a
       `plane` is a coordinate plane and its axes cross at the origin; a `graph`
       or a `data` panel is a chart and its axes sit on the edges. */
    var axX = frame === 'plane' && y0 <= 0 && y1 >= 0 ? SY(0) : SY(y0);
    var axY = frame === 'plane' && x0 <= 0 && x1 >= 0 ? SX(0) : SX(x0);
    svg += '<line x1="' + SX(x0) + '" y1="' + axX + '" x2="' + SX(x1) + '" y2="' + axX + '" class="sv-axis"/>';
    svg += '<line x1="' + axY + '" y1="' + SY(y0) + '" x2="' + axY + '" y2="' + SY(y1) + '" class="sv-axis"/>';
    for (gx = Math.ceil(x0); gx <= x1; gx += stepX) {
      if (frame === 'plane' && gx === 0) continue;
      svg += '<text x="' + SX(gx) + '" y="' + r2(axX + 14) + '" class="sv-tick sv-tick-x">' + esc(gx) + '</text>';
    }
    for (gy = Math.ceil(y0); gy <= y1; gy += stepY) {
      if (frame === 'plane' && gy === 0) continue;
      svg += '<text x="' + r2(axY - 7) + '" y="' + r2(SY(gy) + 4) + '" class="sv-tick sv-tick-y">' + esc(gy) + '</text>';
    }

    /* ── U-1/U-4 · which source a curve draws from (§16.10.10) ─────────────
       1. a string `expr` that is DRAWABLE renders from `expr`; points are not
          consulted.  2. an expr that is not drawable falls back to its stored
          points.  3. neither → the note.  4. no string expr → exactly the path
          this renderer always had; a NON-string expr is treated as absent.
       Sampling is at U-5's constants, which are the Stage 0 sampler's own
       (§16.10.11) — the one density at which this path and the fallback path
       draw the SAME figure.
       O-4 grouping: consecutive curves sharing one expr are ONE function, so a
       run is sampled ONCE and its branches are drawn separately. Sampling per
       stored curve would sample the function N times and draw it N times. */
    var unplottable = 0, faultMissing = false;
    var draw = [];                       // {pts, fig, col} — one per polyline
    var gi = 0;
    while (gi < curves.length) {
      var gc = curves[gi] || {};
      var gf = figures[gi] || {};
      var gcol = SERIES_COLOURS[gi % SERIES_COLOURS.length];
      var gex = typeof gc.expr === 'string' ? gc.expr : null;

      if (gex === null) {                                        // rule 4
        var gp = Array.isArray(gc.points) ? gc.points : null;
        if (!gp) unplottable++; else draw.push({ pts: gp, fig: gf, col: gcol });
        gi++;
        continue;
      }

      var gj = gi + 1;                                           // the O-4 run
      while (gj < curves.length && curves[gj] && curves[gj].expr === gex) gj++;

      var X = EXPR();
      if (!X) faultMissing = true;
      var gr = X ? X.sampleFunction(gex, x0, x1, y0, y1) : null;

      if (gr && !gr.error) {                                     // rule 1
        for (var gb = 0; gb < gr.branches.length; gb++)
          draw.push({ pts: gr.branches[gb], fig: gf, col: gcol });
      } else {                                                   // rules 2-3
        for (var gk = gi; gk < gj; gk++) {
          var kc = curves[gk] || {};
          var kp = Array.isArray(kc.points) ? kc.points : null;
          if (!kp) unplottable++;
          else draw.push({ pts: kp, fig: figures[gk] || {},
                           col: SERIES_COLOURS[gk % SERIES_COLOURS.length] });
        }
      }
      gi = gj;
    }
    if (faultMissing && typeof console !== 'undefined' && console.error)
      console.error(MISSING_EVALUATOR);

    for (var i = 0; i < draw.length; i++) {
      var fig = draw[i].fig;
      var mode = fig.mode || 'curve';
      var col = draw[i].col;
      var pts = draw[i].pts;

      var xy = [], j;
      for (j = 0; j < pts.length; j++) {
        if (!Array.isArray(pts[j]) || pts[j].length < 2) continue;
        xy.push([SX(pts[j][0]), SY(pts[j][1])]);
      }
      if (!xy.length) { unplottable++; continue; }

      var poly = xy.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
      var dashed = fig.dashed ? ' sv-dash' : '';

      if (mode === 'points' || mode === 'scatter') {
        for (j = 0; j < xy.length; j++)
          svg += '<circle cx="' + xy[j][0] + '" cy="' + xy[j][1] + '" r="3.6" style="fill:' + col + '"/>';
      } else if (mode === 'polygon') {
        svg += '<polygon points="' + poly + '" class="sv-poly' + dashed + '" style="stroke:' + col + '"/>';
        if (fig.vertices) {
          for (j = 0; j < xy.length; j++)
            svg += '<circle cx="' + xy[j][0] + '" cy="' + xy[j][1] + '" r="3.2" style="fill:' + col + '"/>';
        }
      } else {
        if (fig.closed) svg += '<polygon points="' + poly + '" class="sv-poly' + dashed + '" style="stroke:' + col + '"/>';
        else svg += '<polyline points="' + poly + '" class="sv-line' + dashed + '" style="stroke:' + col + '"/>';
      }

      /* labels are index-matched to the DISTINCT vertices: a closed ring repeats
         its first point at the end, and that repeat carries no label. */
      if (Array.isArray(fig.labels) && (mode === 'polygon' || mode === 'points')) {
        for (j = 0; j < fig.labels.length && j < xy.length; j++) {
          svg += '<text x="' + r2(xy[j][0] + 7) + '" y="' + r2(xy[j][1] - 7) + '" class="sv-plabel">'
              + esc(fig.labels[j]) + '</text>';
        }
      }
    }

    if (edge) {
      if (spec.xLabel) svg += '<text x="' + r2(ml + iw / 2) + '" y="' + (H - 8) + '" class="sv-axlabel">' + esc(spec.xLabel) + '</text>';
      if (spec.yLabel) svg += '<text x="14" y="' + r2(mt + ih / 2) + '" class="sv-axlabel" '
          + 'transform="rotate(-90 14 ' + r2(mt + ih / 2) + ')">' + esc(spec.yLabel) + '</text>';
    } else {
      if (spec.xLabel) svg += '<text x="' + SX(x1) + '" y="' + r2(axX - 8) + '" class="sv-axlabel sv-end">' + esc(spec.xLabel) + '</text>';
      if (spec.yLabel) svg += '<text x="' + r2(axY + 8) + '" y="' + r2(SY(y1) + 10) + '" class="sv-axlabel">' + esc(spec.yLabel) + '</text>';
    }
    svg += '</svg>';

    if (unplottable > 0) {
      /* C-3: when nothing could be drawn AND the evaluator is missing, this is
         a deployment fault, NOT an undrawable expression — so it never borrows
         rule 3's wording, and it carries data-fault so the two can never be
         confused. When the evaluator IS present the note is unchanged. */
      if (faultMissing) svg += note(MISSING_EVALUATOR, 'missing-evaluator');
      else svg += note(unplottable === 1
        ? 'One curve in this graph is defined by a formula and is not drawn here.'
        : unplottable + ' curves in this graph are defined by formulas and are not drawn here.');
    }
    return svg;
  }

  // ── number line ─────────────────────────────────────────────────────────
  function renderNumberLine(spec) {
    var lo = fin(spec.min, 0), hi = fin(spec.max, 1);
    if (!(hi > lo)) return note('This number line has no range to draw.');
    var W = 520, H = 92, m = 26, iw = W - m * 2, yc = 46;
    var SX = function (x) { return r2(m + ((fin(x, lo) - lo) / (hi - lo)) * iw); };

    var svg = '<svg class="sv-svg sv-nline" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Number line">';
    svg += '<line x1="' + m + '" y1="' + yc + '" x2="' + (W - m) + '" y2="' + yc + '" class="sv-axis"/>';
    var step = Math.max(1, Math.ceil((hi - lo) / 16));
    for (var t = Math.ceil(lo); t <= hi; t += step) {
      svg += '<line x1="' + SX(t) + '" y1="' + (yc - 5) + '" x2="' + SX(t) + '" y2="' + (yc + 5) + '" class="sv-axis"/>';
      svg += '<text x="' + SX(t) + '" y="' + (yc + 22) + '" class="sv-tick sv-tick-x">' + esc(t) + '</text>';
    }

    var segs = Array.isArray(spec.segments) ? spec.segments : [];
    for (var s = 0; s < segs.length; s++) {
      var a = fin(segs[s].from, lo), b = fin(segs[s].to, hi);
      svg += '<line x1="' + SX(a) + '" y1="' + yc + '" x2="' + SX(b) + '" y2="' + yc + '" class="sv-seg"/>';
      /* A filled endpoint is "included", a hollow one is "excluded". That is
         the whole question in most number-line items, so it is drawn from the
         flag and never inferred. */
      svg += '<circle cx="' + SX(a) + '" cy="' + yc + '" r="5" class="' + (segs[s].fromClosed ? 'sv-dot-on' : 'sv-dot-off') + '"/>';
      svg += '<circle cx="' + SX(b) + '" cy="' + yc + '" r="5" class="' + (segs[s].toClosed ? 'sv-dot-on' : 'sv-dot-off') + '"/>';
    }
    var pts = Array.isArray(spec.points) ? spec.points : [];
    for (var p = 0; p < pts.length; p++)
      svg += '<circle cx="' + SX(pts[p]) + '" cy="' + yc + '" r="5" class="sv-dot-on"/>';

    return svg + '</svg>';
  }

  // ── figure ──────────────────────────────────────────────────────────────
  function renderFigure(st) {
    if (st.media_kind !== 'svg' || !st.media_ref) {
      return note('This figure could not be displayed.');
    }
    /* Sandboxed on purpose — see the header. An <img> executes no script and
       resolves no external reference, whoever authored the SVG. */
    var src = /^data:/.test(st.media_ref)
      ? st.media_ref
      : 'data:image/svg+xml;base64,' + st.media_ref;
    return '<img class="sv-figure" alt="' + esc(st.label || 'Figure') + '" src="' + esc(src) + '"/>';
  }

  // ── entry point ─────────────────────────────────────────────────────────
  function render(st) {
    if (!st || typeof st !== 'object') return '';
    var kind = st.kind, spec = st.spec, inner;

    if (kind === 'text') inner = renderText(st);
    else if (kind === 'figure') inner = renderFigure(st);
    else if (!spec || typeof spec !== 'object') inner = note('This figure could not be displayed.');
    else if (kind === 'table') inner = renderTable(spec);
    else if (kind === 'chart') inner = spec.chartType === 'pie' ? renderPie(spec) : renderBarOrLine(spec);
    else if (kind === 'plot') inner = renderPlot(spec);
    else if (kind === 'number_line') inner = renderNumberLine(spec);
    /* An unknown kind is a database that has moved on without this file. Say so
       rather than rendering nothing, so the gap is visible in the page instead
       of only in a bug report. */
    else inner = note('This figure could not be displayed.');

    var head = st.label ? '<div class="sv-label">' + esc(st.label) + '</div>' : '';
    return '<div class="sv" data-kind="' + esc(kind || 'unknown') + '">' + head + inner + '</div>';
  }

  var api = { render: render, esc: esc, KINDS: ['text', 'table', 'chart', 'plot', 'number_line', 'figure'] };
  if (typeof window !== 'undefined') window.StimulusView = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}());
