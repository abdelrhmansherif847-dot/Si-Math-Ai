/* Si Math AI — MATH STIMULUS RENDERER
 *
 * ⚠️ STATUS: DRAFT — NOT WIRED. No shipped page loads this file yet, and the
 *    visual language it implements is under review. It is committed because
 *    the specimen sheet it draws is what the design decision is being taken
 *    against, and because its geometry is already covered by
 *    tests/exam-stimulus.test.mjs. Wiring it into the exam surface is a
 *    separate, later step.
 *
 * ⛔ BLOCKED ON A SCHEMA DECISION. exam_stimuli's `plot` kind records where the
 *    points are and cannot record what they ARE — a scatter, a sampled smooth
 *    curve and a polygon are byte-identical in the database and mean entirely
 *    different things to a student. The same gap covers coordinate plane vs
 *    data plot. Until that is settled, every caller has to supply the decision
 *    out of band, via `opts.figures` and `opts.aspect` below. See
 *    docs/engineering/student-facing-rendering-validation.md §4.
 *
 * Turns an exam_stimuli row (kind + spec) into an SVG figure.
 *
 * THE ONE RULE THAT SEPARATES THIS FROM A CHART LIBRARY
 * -----------------------------------------------------
 * An exam figure is READ BY A STUDENT WHO IS BEING ASSESSED. Every affordance
 * a dashboard adds to be helpful — a hover read-out, a value printed on each
 * point, a fitted trend line nobody asked for — answers the question for them.
 * So this renderer is deliberately INERT: no tooltips, no hover, no value
 * labels, no annotations the spec did not ask for. The grid is the only
 * instrument, and it is drawn to be counted.
 *
 * APPEARANCE LIVES IN CSS, NOT HERE
 * ---------------------------------
 * Every element gets a semantic class (sx-grid, sx-axis, sx-curve, sx-point…).
 * Nothing sets a colour. That is what makes one design language possible across
 * light and dark, exam and review, without the renderer knowing a theme exists —
 * and it keeps this module testable in Node, where there is no colour at all.
 *
 * DEPENDENCY-FREE by house rule: the same bytes run in the browser, in Deno and
 * under CI. No build step, no library.
 */

(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs, text) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
  if (text !== undefined) e.textContent = text;
  return e;
}
function svgRoot(w, h) {
  const s = el('svg', { viewBox: `0 0 ${w} ${h}`, class: 'sx', role: 'img',
                        preserveAspectRatio: 'xMidYMid meet' });
  s.style.width = '100%'; s.style.maxWidth = w + 'px'; s.style.height = 'auto';
  return s;
}
/* A nice step: 1, 2, 2.5 or 5 times a power of ten, never a step a student
 * cannot count in their head. */
function niceStep(span, target) {
  const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(c => c >= raw) || p;
}
const fmt = v => String(+(+v).toFixed(4));

/* ---------------------------------------------------------------- geometry */
/* Catmull-Rom through sampled points, as cubic Beziers. A sampled smooth curve
 * is a CURVE: joining its samples with straight lines turns a parabola into a
 * V and a circle into an octagon. `closed` wraps the indices so a closed
 * figure has no seam. */
function smoothPath(pts, X, Y, closed) {
  const n = pts.length;
  const at = i => closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  let d = `M${X(pts[0][0])},${Y(pts[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${X(c1[0])},${Y(c1[1])} ${X(c2[0])},${Y(c2[1])} ${X(p2[0])},${Y(p2[1])}`;
  }
  return d + (closed ? ' Z' : '');
}
function linePath(pts, X, Y) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0])},${Y(p[1])}`).join(' ');
}
/* A label that stays readable wherever it lands — the surface is painted
 * around the glyph, so a point name never disappears into a gridline. */
function label(x, y, text, cls) {
  const t = el('text', { x, y, class: 'sx-label ' + (cls || ''), 'paint-order': 'stroke' }, text);
  return t;
}
function arrowDefs(s, id) {
  const defs = el('defs');
  const m = el('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5,
                           markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
  m.appendChild(el('path', { d: 'M0,1 L9,5 L0,9 z', class: 'sx-arrow' }));
  defs.appendChild(m); s.appendChild(defs);
}

/* ------------------------------------------------------------------- PLOT */
/* opts.figures — one entry per curve, decided by the AUTHOR, never guessed
 *   here: {mode:'curve'|'polygon'|'scatter'|'points', closed?, labels?}
 * opts.aspect — 'plane' (one px-per-unit on both axes: circles round, right
 *   angles right, slopes true) or 'data' (axes measure different things). */
function drawPlot(spec, opts) {
  opts = opts || {};
  const figures = opts.figures || [];
  const W = opts.width || 520, H = opts.height || 400;
  const PAD = { l: 46, r: 20, t: 18, b: 42 };
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;

  let [x0, x1] = spec.xRange, [y0, y1] = spec.yRange;
  if (opts.aspect === 'plane') {
    const k = Math.min(iw / (x1 - x0), ih / (y1 - y0));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, wx = iw / k, wy = ih / k;
    x0 = cx - wx / 2; x1 = cx + wx / 2; y0 = cy - wy / 2; y1 = cy + wy / 2;
  }
  const X = v => PAD.l + ((v - x0) / (x1 - x0)) * iw;
  const Y = v => H - PAD.b - ((v - y0) / (y1 - y0)) * ih;

  let sx = niceStep(x1 - x0, 9), sy = niceStep(y1 - y0, 7);
  if (opts.aspect === 'plane') sx = sy = Math.min(sx, sy);  // a square grid, countable

  const s = svgRoot(W, H);
  arrowDefs(s, 'sx-ar');
  if (opts.title) s.appendChild(el('title', {}, opts.title));

  // TWO-TIER GRID, the way graph paper is actually ruled.
  //
  // A single-weight grid cannot be both calm and countable. Measured against
  // every candidate surface, a hairline grid sits at 1.4–1.7:1 — below the 3:1
  // floor for graphical information a reader needs — while a grid raised to 3:1
  // throughout is loud enough to compete with the figure drawn on it.
  //
  // So the minor rule stays quiet and the MAJOR rule, every fifth unit, carries
  // the contrast. A student counting a radius counts from a major line, which
  // is what ruled paper has always done.
  const major = v => Math.abs(v / (5 * sx) - Math.round(v / (5 * sx))) < 1e-9;
  const majorY = v => Math.abs(v / (5 * sy) - Math.round(v / (5 * sy))) < 1e-9;
  const grid = el('g', { class: 'sx-grid' });
  for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9; v += sx)
    grid.appendChild(el('line', { class: major(v) ? 'sx-major' : null,
                                  x1: X(v), y1: PAD.t, x2: X(v), y2: H - PAD.b }));
  for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9; v += sy)
    grid.appendChild(el('line', { class: majorY(v) ? 'sx-major' : null,
                                  x1: PAD.l, y1: Y(v), x2: W - PAD.r, y2: Y(v) }));
  s.appendChild(grid);

  const ax = el('g', { class: 'sx-axis' });
  const showX = y0 <= 0 && y1 >= 0, showY = x0 <= 0 && x1 >= 0;
  if (showX) ax.appendChild(el('line', { x1: PAD.l, y1: Y(0), x2: W - PAD.r, y2: Y(0),
                                         'marker-start': 'url(#sx-ar)', 'marker-end': 'url(#sx-ar)' }));
  if (showY) ax.appendChild(el('line', { x1: X(0), y1: H - PAD.b, x2: X(0), y2: PAD.t,
                                         'marker-start': 'url(#sx-ar)', 'marker-end': 'url(#sx-ar)' }));
  if (!showX) ax.appendChild(el('line', { x1: PAD.l, y1: H - PAD.b, x2: W - PAD.r, y2: H - PAD.b }));
  if (!showY) ax.appendChild(el('line', { x1: PAD.l, y1: PAD.t, x2: PAD.l, y2: H - PAD.b }));
  s.appendChild(ax);

  const tk = el('g', { class: 'sx-tick' });
  for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9; v += sx) {
    if (showY && Math.abs(v) < 1e-9) continue;                  // no 0 twice at the origin
    tk.appendChild(el('text', { x: X(v), y: (showX ? Y(0) : H - PAD.b) + 17,
                                'text-anchor': 'middle' }, fmt(v)));
  }
  for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9; v += sy) {
    if (Math.abs(v) < 1e-9 && showX && showY) continue;
    tk.appendChild(el('text', { x: (showY ? X(0) : PAD.l) - 9, y: Y(v) + 4,
                                'text-anchor': 'end' }, fmt(v)));
  }
  // tk is appended AFTER the series, below — an axis numeral must never be
  // crossed out by the figure it is there to measure.

  spec.curves.forEach((c, i) => {
    const f = figures[i];
    if (!f) throw new Error('drawPlot: curve ' + i + ' has no figure decision');
    const g = el('g', { class: 'sx-series sx-s' + ((i % 3) + 1) });
    const pts = c.points;
    if (f.mode === 'curve' || f.mode === 'polygon') {
      g.appendChild(el('path', {
        class: 'sx-curve' + (f.dashed ? ' sx-dashed' : ''),
        d: f.mode === 'curve' ? smoothPath(pts, X, Y, !!f.closed) : linePath(pts, X, Y)
      }));
    }
    // a sampled smooth curve hides its samples: visible dots invite reading
    // answers off the sampling rather than off the curve.
    if (f.mode === 'scatter' || f.mode === 'points' || (f.mode === 'polygon' && f.vertices))
      pts.forEach(p => g.appendChild(el('circle', {
        class: 'sx-point' + (f.mode === 'points' ? ' sx-point-named' : ''),
        r: f.mode === 'points' ? 5.5 : 4.5, cx: X(p[0]), cy: Y(p[1]) })));
    if (f.mode === 'points' && f.labels)
      pts.forEach((p, j) => { if (f.labels[j])
        g.appendChild(label(X(p[0]) + 10, Y(p[1]) - 9, f.labels[j])); });
    s.appendChild(g);
  });

  s.appendChild(tk);

  if (opts.aspect === 'plane') {
    if (spec.xLabel) s.appendChild(el('text', {
      x: W - PAD.r + 2, y: (showX ? Y(0) : H - PAD.b) + 20,
      'text-anchor': 'end', class: 'sx-axis-title sx-axis-tip' }, spec.xLabel));
    if (spec.yLabel) s.appendChild(el('text', {
      x: (showY ? X(0) : PAD.l) - 10, y: PAD.t + 2,
      'text-anchor': 'end', class: 'sx-axis-title sx-axis-tip' }, spec.yLabel));
  } else {
    if (spec.xLabel) s.appendChild(el('text', { x: PAD.l + iw / 2, y: H - 8,
      'text-anchor': 'middle', class: 'sx-axis-title' }, spec.xLabel));
    if (spec.yLabel) {
      const t = el('text', { x: 0, y: 0, 'text-anchor': 'middle', class: 'sx-axis-title' }, spec.yLabel);
      t.setAttribute('transform', `translate(14, ${PAD.t + ih / 2}) rotate(-90)`);
      s.appendChild(t);
    }
  }
  return s;
}

/* ------------------------------------------------------------ NUMBER LINE */
function drawNumberLine(spec, opts) {
  opts = opts || {};
  const W = opts.width || 560, H = 96, M = 40, y = 44;
  const X = v => M + ((v - spec.min) / (spec.max - spec.min)) * (W - 2 * M);
  const s = svgRoot(W, H);
  arrowDefs(s, 'sx-ar-nl');
  const ax = el('g', { class: 'sx-axis sx-nl-axis' });
  ax.appendChild(el('line', { x1: M - 14, y1: y, x2: W - M + 14, y2: y,
                              'marker-start': 'url(#sx-ar-nl)', 'marker-end': 'url(#sx-ar-nl)' }));
  s.appendChild(ax);

  const tk = el('g', { class: 'sx-tick' });
  const step = niceStep(spec.max - spec.min, 12);
  for (let v = Math.ceil(spec.min / step) * step; v <= spec.max + 1e-9; v += step) {
    tk.appendChild(el('line', { x1: X(v), y1: y - 6, x2: X(v), y2: y + 6, class: 'sx-nl-tick' }));
    tk.appendChild(el('text', { x: X(v), y: y + 26, 'text-anchor': 'middle' }, fmt(v)));
  }
  s.appendChild(tk);

  const g = el('g', { class: 'sx-series sx-s1' });
  (spec.segments || []).forEach(sg => {
    const unboundedR = sg.to >= spec.max, unboundedL = sg.from <= spec.min;
    g.appendChild(el('line', { class: 'sx-nl-seg', x1: X(sg.from), y1: y, x2: X(sg.to), y2: y,
      'marker-end': unboundedR ? 'url(#sx-ar-nl)' : null,
      'marker-start': unboundedL ? 'url(#sx-ar-nl)' : null }));
    // open vs closed is SEMANTIC — it is the difference between < and <=
    if (!unboundedL) g.appendChild(el('circle', { cx: X(sg.from), cy: y, r: 6.5,
      class: 'sx-endpoint ' + (sg.fromClosed ? 'sx-closed' : 'sx-open') }));
    if (!unboundedR) g.appendChild(el('circle', { cx: X(sg.to), cy: y, r: 6.5,
      class: 'sx-endpoint ' + (sg.toClosed ? 'sx-closed' : 'sx-open') }));
  });
  (spec.points || []).forEach(v =>
    g.appendChild(el('circle', { cx: X(v), cy: y, r: 6.5, class: 'sx-endpoint sx-closed' })));
  s.appendChild(g);
  return s;
}

/* ------------------------------------------------------------------ CHART */
function drawChart(spec, opts) {
  opts = opts || {};
  const W = opts.width || 520, H = opts.height || 340;
  const PAD = { l: 52, r: 18, t: 20, b: spec.series.length > 1 ? 58 : 44 };
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const vals = spec.series.flatMap(s => s.values);
  const lo = Math.min(0, ...vals), hi = Math.max(...vals);
  const step = niceStep(hi - lo, 5), top = Math.ceil(hi / step) * step;
  const Y = v => PAD.t + ih - ((v - lo) / (top - lo)) * ih;
  const n = spec.categories.length;
  const band = iw / n, X = i => PAD.l + band * (i + 0.5);

  const s = svgRoot(W, H);
  const grid = el('g', { class: 'sx-grid' });
  for (let v = lo; v <= top + 1e-9; v += step)
    grid.appendChild(el('line', { x1: PAD.l, y1: Y(v), x2: W - PAD.r, y2: Y(v) }));
  s.appendChild(grid);

  const tk = el('g', { class: 'sx-tick' });
  for (let v = lo; v <= top + 1e-9; v += step)
    tk.appendChild(el('text', { x: PAD.l - 10, y: Y(v) + 4, 'text-anchor': 'end' }, fmt(v)));
  spec.categories.forEach((c, i) =>
    tk.appendChild(el('text', { x: X(i), y: PAD.t + ih + 20, 'text-anchor': 'middle' }, c)));
  s.appendChild(tk);
  s.appendChild(el('line', { x1: PAD.l, y1: Y(lo), x2: W - PAD.r, y2: Y(lo), class: 'sx-axis-base' }));

  spec.series.forEach((ser, si) => {
    const g = el('g', { class: 'sx-series sx-s' + ((si % 3) + 1) });
    if (spec.chartType === 'bar') {
      const bw = Math.min(46, band / spec.series.length - 6);
      ser.values.forEach((v, i) => {
        const x = X(i) - (bw * spec.series.length + 2 * (spec.series.length - 1)) / 2 + si * (bw + 2);
        const h = Math.max(1, Y(lo) - Y(v));
        // 4px rounded data-end, square where it meets the baseline
        g.appendChild(el('path', { class: 'sx-bar', d:
          `M${x},${Y(lo)} L${x},${Y(v) + 4} Q${x},${Y(v)} ${x + 4},${Y(v)} ` +
          `L${x + bw - 4},${Y(v)} Q${x + bw},${Y(v)} ${x + bw},${Y(v) + 4} L${x + bw},${Y(lo)} Z` }));
      });
    } else {
      g.appendChild(el('path', { class: 'sx-curve',
        d: linePath(ser.values.map((v, i) => [i, v]), i => X(i), Y) }));
      ser.values.forEach((v, i) =>
        g.appendChild(el('circle', { class: 'sx-point', r: 4.5, cx: X(i), cy: Y(v) })));
    }
    s.appendChild(g);
  });

  // identity is never colour alone: >= 2 series always carry a keyed legend
  if (spec.series.length > 1) {
    const lg = el('g', { class: 'sx-legend' });
    let x = PAD.l;
    spec.series.forEach((ser, si) => {
      lg.appendChild(el('rect', { x, y: H - 20, width: 11, height: 11, rx: 3,
                                  class: 'sx-swatch sx-s' + ((si % 3) + 1) }));
      const t = el('text', { x: x + 17, y: H - 11 }, ser.name);
      lg.appendChild(t); x += 17 + ser.name.length * 7.1 + 20;
    });
    s.appendChild(lg);
  }
  if (spec.yLabel) {
    const t = el('text', { class: 'sx-axis-title', 'text-anchor': 'middle' }, spec.yLabel);
    t.setAttribute('transform', `translate(14, ${PAD.t + ih / 2}) rotate(-90)`);
    s.appendChild(t);
  }
  return s;
}

/* ------------------------------------------------------------------ TABLE */
function drawTable(spec) {
  const wrap = document.createElement('div');
  wrap.className = 'sx-table-wrap';
  const t = document.createElement('table');
  t.className = 'sx-table';
  const numeric = spec.headers.map((_, c) =>
    spec.rows.every(r => r[c] === '' || /^-?[\d.,%]+$/.test(r[c])));
  const thead = document.createElement('thead'), hr = document.createElement('tr');
  spec.headers.forEach((h, c) => {
    const th = document.createElement('th');
    th.textContent = h; th.className = numeric[c] ? 'sx-num' : '';
    hr.appendChild(th);
  });
  thead.appendChild(hr); t.appendChild(thead);
  const tb = document.createElement('tbody');
  spec.rows.forEach(r => {
    const tr = document.createElement('tr');
    r.forEach((v, c) => {
      const td = document.createElement('td');
      td.textContent = v; td.className = numeric[c] ? 'sx-num' : '';
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb); wrap.appendChild(t);
  // a note is SEMANTIC: without a stem-and-leaf key the data cannot be read
  if (spec.note) {
    const n = document.createElement('p');
    n.className = 'sx-note'; n.textContent = spec.note;
    wrap.appendChild(n);
  }
  return wrap;
}

function renderStimulus(kind, spec, opts) {
  if (kind === 'table') return drawTable(spec);
  if (kind === 'chart') return drawChart(spec, opts);
  if (kind === 'number_line') return drawNumberLine(spec, opts);
  if (kind === 'plot') return drawPlot(spec, opts);
  throw new Error('renderStimulus: unsupported kind ' + kind);
}

  root.SiExamStimulus = {
    renderStimulus: renderStimulus,
    drawPlot: drawPlot,
    drawChart: drawChart,
    drawTable: drawTable,
    drawNumberLine: drawNumberLine,
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
