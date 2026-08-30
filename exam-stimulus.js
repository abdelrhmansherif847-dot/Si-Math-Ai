/* AUTO-GENERATED from supabase/functions/_shared/exam-stimulus.core.js by scripts/sync-exam-stimulus.mjs — DO NOT EDIT. */
/* Si Math AI — MATH STIMULUS RENDERER
 *
 * ✍️ AUTHORED HERE, AND ONLY HERE. The browser copy `exam-stimulus.js` is
 *    GENERATED from this file by scripts/sync-exam-stimulus.mjs, and
 *    scripts/validate-exam-stimulus.mjs fails CI if the two drift — the same
 *    discipline taxonomy.core.js and study-planner.core.js already run under.
 *    Edit this file; run the sync; never edit the copy.
 *
 * WHY IT LIVES IN _shared/
 * ------------------------
 * The M4 migration says so, and says why: "Rendering is delivery-phase work and
 * belongs in _shared/ so preview and delivery cannot draw the same question two
 * ways" (20260825a_exam_stimuli.sql). That is not tidiness. For three of the
 * five stimulus families the figure depends on what the QUESTION asks, so two
 * copies of this renderer would eventually draw one database row two different
 * ways — and the exam would be the place it was noticed.
 *
 * (The fork's name is deliberately not spelled here. The gate that forbids it
 * greps the tracked tree, and this file is inlined verbatim into the generated
 * specimen pages — which are now committed so they can be opened — so naming it
 * in a comment reintroduces it as a match.)
 *
 * It nearly happened. Until 2026-08-29 there were two: this one, exporting
 * SiExamStimulus and marked "DRAFT — NOT WIRED", and scripts/explore-render.js,
 * exporting a second global and marked "EXPLORATION COPY — not production, not wired
 * to anything". The labels were exactly backwards. Every preview build, every
 * figure check and one SHIPPED module — exam-graph-zero.js — read that one,
 * while the file calling itself production had fallen a schema generation
 * behind and was read by nothing that mattered. The fold is that pair collapsed
 * into this file, under the name the exam actually uses.
 *
 * THE SCHEMA DECISION IS TAKEN — this file no longer works around it
 * -----------------------------------------------------------------
 * exam_stimuli's `plot` kind once recorded where the points are and could not
 * record what they ARE: a scatter, a sampled curve and a polygon were
 * byte-identical in the database and mean entirely different things to a
 * student. Every caller had to supply the missing half out of band, and the
 * first preview GUESSED it from the curve's label with a regex, silently, per
 * frame. Two migrations closed it, and both are applied:
 *
 *   20260827a  spec.frame (plane | graph | data) — what a plot IS
 *              exam_questions.reading ('shape' | 'value') — what is asked of it
 *   20260827b  spec.figures[] — one entry per curve, in order, whose mode the
 *              database validates against the frame
 *
 * So the decisions are READ OFF THE ROW now. renderForQuestion() is the entry
 * point content goes through, and it refuses a row that does not carry them
 * rather than drawing a guess. The out-of-band `opts` path survives for the
 * design-exploration pages only (opts.gridMode, opts.plate) — treatments the
 * family rule would never pick, which is precisely why they are not reachable
 * from a question.
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
/* `shown` is the CSS width the figure is DISPLAYED at, which is not the same
 * thing as the width it is DRAWN at. Drawing at the family's reference size and
 * displaying it larger scales the whole figure — line weight, numerals, ticks,
 * arrowheads — by one factor, so what reaches the student is the approved
 * specimen at a different size rather than a redrawn approximation of it.
 * Defaults to the viewBox width, i.e. 1:1, which is what the grammar page uses. */
function svgRoot(w, h, shown) {
  const s = el('svg', { viewBox: `0 0 ${w} ${h}`, class: 'sx', role: 'img',
                        preserveAspectRatio: 'xMidYMid meet' });
  s.style.width = '100%'; s.style.maxWidth = (shown || w) + 'px'; s.style.height = 'auto';
  return s;
}
/* A nice step: 1, 2, 2.5 or 5 times a power of ten, never a step a student
 * cannot count in their head. */
function niceStep(span, target) {
  const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(c => c >= raw) || p;
}
/* The RESOLUTION of a set of values: the coarsest step on which every one of
 * them lands exactly. This is the derived half of the family variant system —
 * a number line's minor ticks and a geometry figure's grid are both this
 * number, computed from the mathematics rather than chosen per figure.
 *
 * An endpoint at -2.5 makes the resolution 1/2, and the figure grows half-step
 * ticks so the endpoint sits ON one. An endpoint at -2 leaves it 1, and no
 * minor ticks appear. Nobody decides that; the spec already contains it. */
const STEPS = [1, 1 / 2, 1 / 4, 1 / 5, 1 / 10];
function resolutionOf(values) {
  const vs = values.filter(v => typeof v === 'number' && isFinite(v));
  for (const st of STEPS)
    if (vs.every(v => Math.abs(v / st - Math.round(v / st)) < 1e-9)) return st;
  return STEPS[STEPS.length - 1];
}

/* THE VARIANT RULE, in one place.
 *
 * Each family has a fixed grammar and one axis of variation, and the variant is
 * COMPUTED rather than picked per figure. Two inputs decide everything:
 *
 *   frame    — which family this is. Fixed by what the object IS, and named
 *              with the SAME vocabulary the spec uses (plane | graph | data),
 *              so the renderer reads the stored field directly instead of
 *              translating it through a second set of names.
 *   reading  — 'shape' or 'value'. AUTHORED, because it is a property of the
 *              question, not of the figure: whether the student must read a
 *              number off the picture or only judge its shape. Nothing in the
 *              geometry can tell you which, so the spec has to carry it.
 *
 * and one derived number, resolutionOf(), for how fine the marks must be.
 *
 *   plane — coordinate geometry. The grid is the measuring instrument, so it
 *           is always present, at the resolution of the figure's own vertices,
 *           and `reading` does not enter into it.
 *   graph — the graph of a function. The curve is the subject; a grid appears
 *           only when the question asks for a value off it.
 *   data  — measured data. The same question, answered with horizontal rules
 *           only, because a value on a chart is read by tracking left.
 */
function gridPlan(frame, reading, res) {
  // SQUARED PAPER ALWAYS CARRIES ITS FINE TIER. The approved treatment is
  // gridMode:'fine' — a half-unit mesh under the unit lines — and that mesh is
  // what makes it read as PAPER rather than as a lattice of drawn lines. Making
  // it conditional on resolutionOf() left every integer-vertex figure, which is
  // most of them, with a single coarse tier.
  //
  // resolutionOf() still decides, and still matters: it sets HOW FINE the mesh
  // is, so a vertex at 2.5 sits on a crossing. It just no longer decides whether
  // there is one. Half is the floor because a half-unit mesh is what squared
  // paper is; a finer resolution makes a finer mesh.
  if (frame === 'plane') return { mode: 'major', sub: Math.min(res, 0.5) };
  if (frame === 'graph') return { mode: reading === 'value' ? 'major' : 'none', sub: 0 };
  if (frame === 'data')  return { mode: reading === 'value' ? 'rules' : 'none', sub: 0 };
  // No silent default. A plot whose frame the spec did not declare is a bug in
  // the content, not a figure to draw a guess for — and the database now makes
  // such a row unstorable, so reaching here means something bypassed it.
  throw new Error('gridPlan: unknown frame ' + JSON.stringify(frame));
}

// U+2212 MINUS SIGN, not the hyphen a keyboard gives you. On a figure the
// difference is visible: a hyphen is short, high and reads as punctuation,
// where a minus matches the numerals' width and sits on their centre line.
const fmt = v => String(+(+v).toFixed(4)).replace('-', '\u2212');

/* ---------------------------------------------------------------- geometry */
/* CENTRIPETAL Catmull-Rom through sampled points, as cubic Beziers.
 *
 * A sampled smooth curve is a CURVE: joining its samples with straight lines
 * turns a parabola into a V and a circle into an octagon. `closed` wraps the
 * indices so a closed figure has no seam.
 *
 * WHY CENTRIPETAL (alpha = 0.5) AND NOT UNIFORM
 * ---------------------------------------------
 * Uniform parameterisation lets the curve leave the band between the two
 * samples it connects — it draws a maximum or a minimum the data never
 * asserted. Measured on adversarial samples, uniform overshot by up to 0.30
 * figure units where centripetal overshot by 0.09: better on three cases,
 * identical on three, worse on none.
 *
 * BUT THE ALGORITHM IS NOT THE REAL SAFEGUARD — SAMPLING DENSITY IS.
 * On the same parabola, polyline, uniform and centripetal disagree with each
 * other by 84 px at four samples and by 2 px at twenty. Below roughly ten
 * samples the INTERPOLATION is choosing the shape, and a student reading a
 * value off the curve is reading this function rather than the author's.
 *
 * So the contract is: a curve must be sampled densely enough that smoothing
 * changes nothing. tests/exam-stimulus.test.mjs enforces exactly that — the
 * smoothed path has to agree with the plain polyline through the same points.
 * Smoothing is safe precisely when it makes no difference.
 */
function smoothPath(pts, X, Y, closed) {
  const n = pts.length;
  const at = i => closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const ALPHA = 0.5;
  const knot = (a, b) => {
    const v = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return v > 1e-12 ? Math.pow(v, ALPHA) : 1e-12;   // coincident samples must not divide by zero
  };
  let d = `M${X(pts[0][0])},${Y(pts[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const t0 = 0, t1 = t0 + knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
    const c1 = [0, 1].map(k => p1[k] + (t2 - t1) * ((p1[k] - p0[k]) / (t1 - t0)
                    - (p2[k] - p0[k]) / (t2 - t0) + (p2[k] - p1[k]) / (t2 - t1)) / 3);
    const c2 = [0, 1].map(k => p2[k] - (t2 - t1) * ((p2[k] - p1[k]) / (t2 - t1)
                    - (p3[k] - p1[k]) / (t3 - t1) + (p3[k] - p2[k]) / (t3 - t2)) / 3);
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
function arrowDefs(s, id, fixed) {
  const defs = el('defs');
  // A marker scales with stroke-width by default. On a number line the axis is
  // 1.4px and the ray is 6px, so the SAME marker came out four times larger on
  // the ray — a huge triangle sitting on top of the axis's own small one, two
  // arrowheads at one end. `fixed` pins the marker to user space so the ray's
  // arrow is sized by the figure, not by how heavy the ray happens to be.
  const attrs = { id, viewBox: '0 0 10 10', refX: 8, refY: 5,
                  orient: 'auto-start-reverse' };
  if (fixed) { attrs.markerUnits = 'userSpaceOnUse';
               attrs.markerWidth = fixed; attrs.markerHeight = fixed; }
  else { attrs.markerWidth = 6; attrs.markerHeight = 6; }
  const m = el('marker', attrs);
  // The terminal arrow of a ray belongs to the RAY, not to the axis it sits on,
  // so it is a separate class rather than reusing the axis arrow's ink.
  m.appendChild(el('path', { d: 'M0,1 L9,5 L0,9 z',
                             class: fixed ? 'sx-arrow sx-ray-arrow' : 'sx-arrow' }));
  defs.appendChild(m); s.appendChild(defs);
}

/* ------------------------------------------------------------------- PLOT */
/* opts.figures — one entry per curve, decided by the AUTHOR, never guessed
 *   here: {mode:'curve'|'polygon'|'scatter'|'points', closed?, labels?}
 * opts.aspect — 'plane' (one px-per-unit on both axes: circles round, right
 *   angles right, slopes true) or 'data' (axes measure different things). */
/* THE PLATE SCALES; IT DOES NOT STRETCH.
 *
 * The approved grammar (365b, and the specimens `scripts/figure-system.html`
 * renders) was drawn at ONE size per family: 430x280 for a function graph or a
 * data plot, 360 wide with a 430 cap for squared paper. Those numbers are not
 * arbitrary — the proportion of the plate is what makes a curve look the shape
 * it looks, and how many grid squares fit is what makes squared paper
 * countable.
 *
 * The exam column is 560 wide, and the first version simply passed that width
 * while keeping the heights tuned for 430. That is a STRETCH, and it broke two
 * things visibly:
 *
 *   - every function and data plate came out 24% flatter than the specimen, so
 *     the same cubic read as a shallower curve;
 *   - squared paper hit its (unscaled) height cap, took the "widen x" branch
 *     below, and came back with a TWO-unit grid and a third of the plate empty.
 *     A student can no longer count squares to measure a leg, which is the one
 *     thing that family exists to allow.
 *
 * So the reference is stored as the proportion of the INNER box — the drawing
 * area inside the numeral gutters — and the height is derived from whatever
 * width the caller asks for. At the reference width every number below is an
 * identity, which is why the grammar page is untouched by this and its checks
 * still pass: that is the proof the plate was scaled and not redesigned. */
const REF = {
  // MEASURED off the specimens, not re-derived from the plate: both the function
  // and the data variants clip to exactly 364 x 202 (`PAD.t` is 36 there, not
  // 18, because both carry a y title — computing it from the plate got this
  // wrong by 9%).
  W: 430, iw: 364, ih: 202,
  // Squared paper: 360 wide, capped at 430 tall, never shorter than 190 of ink
  planeW: 360, planeIw: 294, planeMaxIh: 430 - 18 - 42, planeMinIh: 190,
};

function drawPlot(spec, opts) {
  opts = opts || {};
  const figures = opts.figures || [];
  const W = opts.width || 450;
  // Padding follows what the figure actually carries: a y title set upright
  // needs a line above the plot, and a series that names itself at its own end
  // needs room to the right or the label is clipped.
  const named = (opts.figures || []).filter(f => f.name);
  const PAD = { l: 46, r: 20, t: 18, b: 42 };
  if (opts.aspect !== 'plane' && spec.yLabel) PAD.t = 36;
  if (named.length) PAD.r = Math.max(PAD.r,
    12 + Math.max(...named.map(f => f.name.length)) * 7.2);
  const iw = W - PAD.l - PAD.r;
  let [x0, x1] = spec.xRange, [y0, y1] = spec.yRange;
  let H, ih;


  if (opts.aspect === 'plane') {
    // Equal scales are non-negotiable. HOW they are obtained is a composition
    // decision, and the first version got it wrong: it fixed the canvas and
    // widened the WINDOW to match, which padded every figure out with empty
    // grid — a big plate with small mathematics in the middle of it.
    //
    // The canvas takes the shape the mathematics asks for instead. The declared
    // window is honoured exactly, and the plate is as tall as that window needs
    // at the width available. A wide figure gets a wide plate, a square one a
    // square plate, and nothing is padded.
    const k = iw / (x1 - x0);
    const want = (y1 - y0) * k;
    // A genuinely tall figure gets a tall plate. Capping this low forces the
    // OTHER axis to widen, which is what pads a figure out with empty grid —
    // the cap was the cause, not the symptom.
    const maxIh = opts.maxHeight ? opts.maxHeight - PAD.t - PAD.b
                                : iw * (REF.planeMaxIh / REF.planeIw);
    const minIh = iw * (REF.planeMinIh / REF.planeIw);
    if (want > maxIh) {
      // taller than a plate should be: fit the height and widen x, which adds
      // context rather than distorting anything
      const k2 = maxIh / (y1 - y0), wx = iw / k2, cx = (x0 + x1) / 2;
      x0 = cx - wx / 2; x1 = cx + wx / 2;
      ih = maxIh;
    } else if (want < minIh) {
      // flatter than a plate should be: widen y for the same reason
      const extra = minIh / k - (y1 - y0), cy = (y0 + y1) / 2;
      y0 = cy - ((y1 - y0) + extra) / 2; y1 = cy + ((y1 - y0) + extra) / 2;
      ih = minIh;
    } else {
      ih = want;
    }
    // NOT rounded. Rounding the canvas height re-derives a y scale a fraction
    // different from x, and equal scaling is the one thing this branch exists
    // to guarantee — the geometry test catches it at 0.01 px.
    H = ih + PAD.t + PAD.b;
  } else {
    // Derived from the INNER box, not the plate, so a taller numeral gutter or a
    // wider label margin does not quietly change the drawing's proportion.
    ih = opts.height ? opts.height - PAD.t - PAD.b : iw * (REF.ih / REF.iw);
    H = ih + PAD.t + PAD.b;
  }
  const X = v => PAD.l + ((v - x0) / (x1 - x0)) * iw;
  const Y = v => H - PAD.b - ((v - y0) / (y1 - y0)) * ih;

  let sx = niceStep(x1 - x0, 9), sy = niceStep(y1 - y0, 7);
  if (opts.aspect === 'plane') {
    sx = sy = Math.min(sx, sy);                             // a square grid, countable
    // AND THE SQUARE IS A UNIT. "Integer vertices -> a unit grid" is the stated
    // rule of the squared-paper family, and it was only half implemented:
    // resolutionOf() decided the SUB-grid (half-unit lines under a vertex at
    // 2.5) while the major step was still whatever niceStep picked for the
    // window. niceStep crosses from 1 to 2 the moment a window passes nine
    // units across — which exam windows routinely do, and the approved specimen
    // happens to sit just under at 8.5. So a figure whose vertices are all
    // integers came back ruled every TWO units, and a student can no longer
    // count squares to measure a leg, which is the one thing this family exists
    // to allow.
    //
    // The unit is given up when the ruling would be finer than the approved
    // specimen's texture, and that is judged in px rather than units so it holds
    // at any plate size. The specimen rules at 34.6px per unit and the exam
    // figure that prompted this at 30.8; a window twice as wide as either falls
    // well under the bar and keeps the coarser step and its five-line major
    // tier, which is what that tier is for.
    if (sx > 1 && iw / (x1 - x0) >= 20) sx = sy = 1;
  }

  const s = svgRoot(W, H, opts.shownAt);
  // THE FAMILY, ON THE FIGURE ITSELF.
  //
  // The approved grammar (365d85b, "Close the figure families as a grammar, not
  // five looks") spends colour on the data family and nowhere else, and the
  // exploration page expressed that as `#v-data-0 .sx-series` — a selector for
  // where the figure sat on THAT page. Nothing like it exists in an exam, where
  // a figure's family is a property of its row. So the family is stamped here,
  // and the stylesheet can finally say "data" without knowing the layout.
  //
  // It is the frame VERBATIM — plane | graph | data — not a translation, so
  // there is no second vocabulary to keep in step with the database.
  if (opts.frame) s.setAttribute('class', 'sx sx-fam-' + opts.frame);
  // A curve whose samples run past the declared window used to be drawn past
  // the plate as well — the cubic exited the top of its own frame and kept
  // going. The window is what the author declared, so it is also the boundary:
  // the drawing is clipped to it. Scaffolding is not, because numerals and
  // axis tips are placed in the padding on purpose.
  const clipId = 'sx-clip-' + (drawPlot._n = (drawPlot._n || 0) + 1);
  const defs = el('defs');
  const cp = el('clipPath', { id: clipId });
  cp.appendChild(el('rect', { x: PAD.l, y: PAD.t, width: iw, height: ih }));
  defs.appendChild(cp);
  s.appendChild(defs);
  // COLOUR IS FOR TELLING THINGS APART, and one figure has nothing to be told
  // apart from. A lone circle or triangle drawn in the brand hue reads as a
  // chart; drawn in ink it reads as a figure in an exam. Hue is spent only
  // where there are two or more curves, and then it is the validated
  // categorical set.
  if (spec.curves.length === 1)
    s.setAttribute('class', s.getAttribute('class') + ' sx-solo');
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
  //
  // But a rhythm needs enough beats to be heard, and this one never had them.
  // niceStep holds the gridline count between 6 and 9 at EVERY span from 4 to
  // 1000 — deliberately, so a student can count the divisions. Every fifth of
  // 6-9 lines is one or two lines. Measured on this page: every plane family
  // had exactly two majors per axis, one of them hidden under the axis itself,
  // so the other read as a heavy stray line drawn through the figure.
  //
  // The tier is not wrong; it is inseparable from grid DENSITY, and a coarse
  // grid cannot carry it. So it engages only where it can be perceived — which
  // in practice means gridMode 'fine', where half-steps under the unit lines
  // give a genuinely dense two-tier grid. Everywhere else the grid is uniform,
  // and how loud it is becomes a question for the stylesheet, not the geometry.
  const isMajor = (v, step) => Math.abs(v / (5 * step) - Math.round(v / (5 * step))) < 1e-9;
  const countMajors = (lo, hi, step) => {
    let n = 0;
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) if (isMajor(v, step)) n++;
    return n;
  };
  const TIER_MIN = 3;
  const tierX = countMajors(x0, x1, sx) >= TIER_MIN;
  const tierY = countMajors(y0, y1, sy) >= TIER_MIN;
  const major = v => tierX && isMajor(v, sx);
  const majorY = v => tierY && isMajor(v, sy);
  // The family's rule decides the grid; gridMode stays available so the
  // exploration pages can still show a treatment the rule would not pick.
  const plan = opts.frame
    ? gridPlan(opts.frame, opts.reading,
               resolutionOf((spec.curves || []).flatMap(c => c.points.flat())))
    : { mode: opts.gridMode || 'major', sub: opts.gridMode === 'fine' ? 0.5 : 0 };
  const mode = plan.mode;
  const grid = el('g', { class: 'sx-grid' });
  // Sub-unit gridlines. Under the family rule the step is the figure's own
  // RESOLUTION: a triangle on integer vertices gets a plain unit grid, one with
  // a vertex at 2.5 grows half-unit lines so that vertex sits on a crossing.
  // The legacy 'fine' treatment keeps its fixed half-step so the exploration
  // pages still show what they showed.
  const sub = mode === 'fine' ? sx / 2 : plan.sub;
  if (sub > 0 && sub < sx) {
    for (let v = Math.ceil(x0 / sub) * sub; v <= x1 + 1e-9; v += sub)
      if (Math.abs(v / sx - Math.round(v / sx)) > 1e-9)
        grid.appendChild(el('line', { class: 'sx-fine', x1: X(v), y1: PAD.t, x2: X(v), y2: H - PAD.b }));
    for (let v = Math.ceil(y0 / sub) * sub; v <= y1 + 1e-9; v += sub)
      if (Math.abs(v / sy - Math.round(v / sy)) > 1e-9)
        grid.appendChild(el('line', { class: 'sx-fine', x1: PAD.l, y1: Y(v), x2: W - PAD.r, y2: Y(v) }));
  }
  // OPEN MEANS THE DRAWING DOES NOT CLOSE.
  //
  // The grammar's default for a function graph is Open — the curve is the
  // subject and the axes are supporting structure — and a grid appears only
  // when the question needs a value read off it. But "has a grid" and "is
  // enclosed" are different things, and the renderer was conflating them: a
  // gridline is drawn at every step inside the window INCLUDING the window's
  // own edges, so whenever the declared range happens to land on steps the four
  // outermost lines form a rectangle and the figure reads as a plate.
  //
  // Measured, not guessed. The grammar's own function/value variant carries a
  // gridline on ONE edge; Q4 of the real exam carried one on all four, with the
  // y-axis sitting on the left edge as well because its range starts at zero.
  // Same CSS, same grid density, opposite treatment.
  //
  // So for a GRAPH the grid rules the interior only. A line on the boundary is
  // a frame, and a frame is the plated look this family is defined against. The
  // plane keeps its boundary lines: squared paper is a full sheet, and the
  // grammar's geometry variant draws to its edges on purpose.
  const openFrame = opts.frame === 'graph';
  const inner = (v, lo, hi) => !openFrame || (Math.abs(v - lo) > 1e-9 && Math.abs(v - hi) > 1e-9);
  if (mode !== 'none') {
    // 'rules' is the statistical convention: horizontal rules only. A value is
    // read off a chart by tracking LEFT to the y-axis, so vertical gridlines
    // add ink without adding a reading. A coordinate plane needs both, because
    // a point there is located in two directions at once.
    if (mode !== 'rules')
    for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9; v += sx)
      if (inner(v, x0, x1))
        grid.appendChild(el('line', { class: major(v) ? 'sx-major' : null,
                                      x1: X(v), y1: PAD.t, x2: X(v), y2: H - PAD.b }));
    for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9; v += sy)
      if (inner(v, y0, y1))
        grid.appendChild(el('line', { class: majorY(v) ? 'sx-major' : null,
                                      x1: PAD.l, y1: Y(v), x2: W - PAD.r, y2: Y(v) }));
  }
  s.appendChild(grid);
  // The frame is the PLATE BORDER, not the plot window. Framing the window
  // while the axes run through the interior puts the numerals outside their own
  // frame, clips the leftmost label against it, drops a gridline a few pixels
  // short of it and lets the axis arrow puncture it — all four were visible at
  // exam size. A plate bounds the whole figure, its labels included.
  // `plate`, not `frame`. `frame` is the SEMANTIC field the spec stores — what
  // kind of plot this is — and the presentational boolean that draws a border
  // does not get to keep the better name. This collision has now happened
  // twice in both directions; naming the border for what it is ends it.
  if (opts.plate) s.appendChild(el('rect', { class: 'sx-frame',
    x: 1, y: 1, width: W - 2, height: H - 2 }));

  const ax = el('g', { class: 'sx-axis' });
  const showX = y0 <= 0 && y1 >= 0, showY = x0 <= 0 && x1 >= 0;
  // An arrowhead is a claim that the axis carries on past the edge of the
  // figure. That is true of a coordinate plane and false of a data frame, whose
  // axes are bounded SCALES — weeks 0 to 9, books 10 to 36. The scatter drew
  // arrows anyway, because its weeks happen to start at zero and the test for
  // an axis was "does the window contain the origin" rather than "is this a
  // plane". Arrowheads now belong to the plane, and nowhere else.
  //
  // Whether the axes are a PLANE and whether the scales are EQUAL are two
  // different properties, and tying them together was a bug: dropping equal
  // scales on a function graph — which is correct, nothing there needs an x
  // unit to equal a y unit — silently took its axis arrows with it, and a
  // function graph's axes certainly do continue. `axes` says what the axes ARE;
  // `aspect` says how they are SCALED. It defaults from aspect so callers that
  // only ever needed one of them keep working.
  // NOT `frame` — that name was already taken by the boolean that draws the
  // plate border, and reusing it silently framed every figure that set it.
  const isPlane = opts.axes ? opts.axes === 'plane' : opts.aspect === 'plane';
  const arrows = isPlane
    ? { 'marker-start': 'url(#sx-ar)', 'marker-end': 'url(#sx-ar)' } : {};
  if (showX) ax.appendChild(el('line', Object.assign(
    { x1: PAD.l, y1: Y(0), x2: W - PAD.r, y2: Y(0) }, arrows)));
  if (showY) ax.appendChild(el('line', Object.assign(
    { x1: X(0), y1: H - PAD.b, x2: X(0), y2: PAD.t }, arrows)));
  if (!showX) ax.appendChild(el('line', { x1: PAD.l, y1: H - PAD.b, x2: W - PAD.r, y2: H - PAD.b }));
  if (!showY) ax.appendChild(el('line', { x1: PAD.l, y1: PAD.t, x2: PAD.l, y2: H - PAD.b }));
  // The origin is named in almost every geometry stem ("triangle OAB", "the
  // distance from O"). It sits in the one corner the numerals deliberately
  // leave empty, so labelling it costs nothing.
  const originAt = opts.originLabel && showX && showY ? [X(0), Y(0)] : null;
  // Set when the AUTHOR has already named a vertex sitting at the origin. The
  // automatic origin label exists because most geometry stems say "triangle
  // OAB" and the corner is empty anyway — but a figure whose first vertex IS
  // the origin and is labelled 'O' then got two of them, one from each source,
  // a few pixels apart. Found on the first question ever rendered from the
  // Spine, which is what a review surface is for.
  let originNamed = false;
  s.appendChild(ax);

  // The axis tip labels (x and y) sit at the ends of the axes, and the OUTERMOST
  // numeral wants the same few pixels. Nudging the label never fully resolved it
  // — it collided on seven of the sixty-six figures. So the label wins and the
  // numeral it displaces is dropped: that numeral sits at the edge of the
  // widened window and is usually outside the range the author declared, which
  // makes it the least useful one on the axis.
  const tipX = isPlane && spec.xLabel, tipY = isPlane && spec.yLabel;
  const tk = el('g', { class: 'sx-tick' });
  const axY = showX ? Y(0) : H - PAD.b;      // where the x numerals hang
  const axX = showY ? X(0) : PAD.l;          // where the y numerals sit
  // Every numeral's box, so a vertex label can be placed somewhere else. A
  // label dropped radially outward from the centroid lands in the numeral
  // gutter whenever the vertex sits on an axis — which is most of them, since
  // exam figures are drawn from the origin. Boxes are estimated from the font
  // size rather than measured, because nothing is in the document yet.
  const NUM = 12.5, LAB = 16;
  const taken = [];
  const box = (cx, cy, w, h) => ({ l: cx - w/2, r: cx + w/2, t: cy - h/2, b: cy + h/2 });
  const hits = (a, b) => !(a.r < b.l || b.r < a.l || a.b < b.t || b.b < a.t);
  for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9; v += sx) {
    if (Math.abs(v) < 1e-9 && showY) continue;                  // no 0 twice at the origin
    // A TICK MARK, then the numeral. Without the tick the numeral is a caption
    // floating beside a background grid; with it, it is a reading off a
    // measured axis — which is the single thing that most separated this from
    // a printed exam figure.
    tk.appendChild(el('line', { class: 'sx-tickmark',
      x1: X(v), y1: axY - 4.5, x2: X(v), y2: axY + 4.5 }));
    if (tipX && X(v) > W - PAD.r - 22) continue;                // reserved for the x tip
    tk.appendChild(el('text', { x: X(v), y: axY + 19, 'text-anchor': 'middle' }, fmt(v)));
    taken.push(box(X(v), axY + 19 - NUM/3, fmt(v).length * NUM * .62, NUM));
  }
  for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9; v += sy) {
    if (Math.abs(v) < 1e-9 && showX && showY) continue;
    tk.appendChild(el('line', { class: 'sx-tickmark',
      x1: axX - 4.5, y1: Y(v), x2: axX + 4.5, y2: Y(v) }));
    if (tipY && Y(v) < PAD.t + 20) continue;                    // reserved for the y tip
    tk.appendChild(el('text', { x: axX - 10, y: Y(v) + 4.5, 'text-anchor': 'end' }, fmt(v)));
    const w = fmt(v).length * NUM * .62;
    taken.push(box(axX - 10 - w/2, Y(v), w, NUM));
  }
  // tk is appended AFTER the series, below — an axis numeral must never be
  // crossed out by the figure it is there to measure.

  spec.curves.forEach((c, i) => {
    const f = figures[i];
    if (!f) throw new Error('drawPlot: curve ' + i + ' has no figure decision');
    const g = el('g', { class: 'sx-series sx-s' + ((i % 3) + 1),
                        'clip-path': 'url(#' + clipId + ')' });
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
    // A stem that says "triangle OAB" needs a figure that says which vertex is
    // which. Without it the student has to map the prose onto the picture
    // themselves, which is work the figure exists to remove. Each label is
    // pushed OUTWARD from the figure's centroid so it never lands inside it.
    // A series that names itself at its own end needs no legend box. Identity
    // is still not carried by colour alone — the label sits ON the mark — and
    // on an exam a legend is chrome that costs reading time.
    if (f.name && pts.length) {
      const last = pts[pts.length - 1];
      // Appended to the ROOT, not to the clipped series group. The clip bounds
      // the drawing; a label that names the drawing is annotation, and clipping
      // it turned "Line of best fit" into "Li".
      s.appendChild(el('text', { x: X(last[0]) + 9, y: Y(last[1]) + 4,
                                 class: 'sx-direct', 'text-anchor': 'start' }, f.name));
    }
    if (f.labels && (f.mode === 'points' || f.mode === 'polygon')) {
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      pts.forEach((p, j) => {
        if (!f.labels[j]) return;
        const px = X(p[0]), py = Y(p[1]);
        const dx = px - X(cx), dy = py - Y(cy);
        const want = Math.atan2(dy, dx);
        const w = f.labels[j].length * LAB * .62;
        // eight positions on a ring, tried in order of how close each is to
        // straight out from the centre of the figure
        const ring = [0, 1, -1, 2, -2, 3, -3, 4].map(k => want + k * Math.PI / 4);
        let put = null;
        for (const a of ring) {
          const lx = px + Math.cos(a) * 17, ly = py + Math.sin(a) * 17;
          const b = box(lx, ly, w + 3, LAB);
          if (!taken.some(t => hits(b, t))) { put = [lx, ly]; break; }
        }
        if (!put) put = [px + Math.cos(want) * 17, py + Math.sin(want) * 17];
        taken.push(box(put[0], put[1], w + 3, LAB));
        if (Math.abs(p[0]) < 1e-9 && Math.abs(p[1]) < 1e-9) originNamed = true;
        g.appendChild(label(put[0], put[1] + LAB / 3, f.labels[j], 'sx-vertex'));
      });
    }
    s.appendChild(g);
  });

  // The author's label wins. Two names for one point is worse than none: a
  // student reading "triangle OAB" has to decide which O the stem means.
  if (originAt && !originNamed) {
    const w = opts.originLabel.length * LAB * .62;
    let put = null;
    for (const a of [Math.PI * 0.75, Math.PI * 1.25, Math.PI * 0.5, Math.PI]) {
      const lx = originAt[0] + Math.cos(a) * 17, ly = originAt[1] - Math.sin(a) * 17;
      const b = box(lx, ly, w + 3, LAB);
      if (!taken.some(t => hits(b, t))) { put = [lx, ly]; break; }
    }
    if (!put) put = [originAt[0] - 14, originAt[1] + 16];
    taken.push(box(put[0], put[1], w + 3, LAB));
    originAt.push(label(put[0], put[1] + LAB / 3, opts.originLabel, 'sx-vertex'));
  }
  s.appendChild(tk);
  if (originAt && originAt[2]) s.appendChild(originAt[2]);

  if (isPlane) {
    // At the axis TIP, and on the side the numerals are not on. The numerals sit
    // below the x-axis and left of the y-axis, so the labels go above and right —
    // the textbook placement, and the only one that cannot collide with them.
    if (spec.xLabel) s.appendChild(el('text', {
      x: W - PAD.r + 4, y: (showX ? Y(0) : H - PAD.b) - 9,
      'text-anchor': 'end', class: 'sx-axis-title sx-axis-tip' }, spec.xLabel));
    if (spec.yLabel) s.appendChild(el('text', {
      x: (showY ? X(0) : PAD.l) + 11, y: PAD.t + 3,
      'text-anchor': 'start', class: 'sx-axis-title sx-axis-tip' }, spec.yLabel));
  } else {
    // A data frame's titles say what is measured, and the y title reads
    // left-to-right above its own axis rather than rotated up the side.
    // Rotated type is slower to read and saves no room on a short figure.
    if (spec.xLabel) s.appendChild(el('text', { x: PAD.l + iw / 2, y: H - 8,
      'text-anchor': 'middle', class: 'sx-axis-title' }, spec.xLabel));
    if (spec.yLabel) s.appendChild(el('text', { x: PAD.l - 10, y: PAD.t - 8,
      'text-anchor': 'start', class: 'sx-axis-title sx-ylab' }, spec.yLabel));
  }
  return s;
}

/* ------------------------------------------------------------ NUMBER LINE */
function drawNumberLine(spec, opts) {
  opts = opts || {};
  // A number line has its own design axes, and they are not the plane's. What
  // varies is how many values are named, how loud the endpoint is, and whether
  // the interval rides ON the axis or sits as a separate band ABOVE it.
  // The strip scales with its width, for the same reason the plate does. Its
  // grammar is ENDPOINT-FIRST — "the endpoint is the largest mark in the figure,
  // because open-versus-closed IS the question" — and that is a statement about
  // proportion. Running the approved 430-wide strip out to the exam's 560 while
  // the marks stayed fixed shrank the endpoint by 23% relative to the line, and
  // the rule quietly stopped being true. k is 1 at the reference width.
  const W = opts.width || 560, k = W / 430;
  const H = opts.height || 96 * k, M = 40 * k;
  const lift = (opts.segLift || 0) * k;       // px the interval sits above the axis
  const y = opts.axisY || (lift ? H - 52 * k : 44 * k);
  const ER = (opts.endpointR || 6.5) * k;
  const X = v => M + ((v - spec.min) / (spec.max - spec.min)) * (W - 2 * M);
  const s = svgRoot(W, H, opts.shownAt);
  arrowDefs(s, 'sx-ar-nl');
  arrowDefs(s, 'sx-ar-ray', 13 * k);
  // A ray that runs off the end of the line already says "continues", so the
  // axis does not need to say it again two pixels further out.
  const segs = spec.segments || [];
  const openR = segs.some(g => g.to >= spec.max), openL = segs.some(g => g.from <= spec.min);
  const ax = el('g', { class: 'sx-axis sx-nl-axis' });
  ax.appendChild(el('line', { x1: M - 14 * k, y1: y, x2: W - M + 14 * k, y2: y,
    'marker-start': openL && !lift ? null : 'url(#sx-ar-nl)',
    'marker-end': openR && !lift ? null : 'url(#sx-ar-nl)' }));
  s.appendChild(ax);

  const tk = el('g', { class: 'sx-tick' });
  const step = niceStep(spec.max - spec.min, 12);
  let mode = opts.tickMode || 'all';
  // The family's grammar is endpoint-first: name only what the question turns
  // on. Its one variant is tick DENSITY, and that is derived, not chosen.
  const marked = [].concat((spec.segments || []).flatMap(g => [g.from, g.to]),
                           spec.points || []);
  const res = resolutionOf(marked);
  if (mode === 'auto') mode = res < 1 ? 'autofine' : 'ends';
  // Which values a number line names is a DESIGN decision, not a fixed one:
  // every integer (a ruler), only the values that matter (minimal), or a fine
  // ruler with unlabelled halves between the integers.
  if (mode === 'fine' || mode === 'autofine') {
    const ms = mode === 'autofine' ? res * step : step / 2;
    for (let v = Math.ceil(spec.min / ms) * ms; v <= spec.max + 1e-9; v += ms)
      if (Math.abs(v / step - Math.round(v / step)) > 1e-9)
        tk.appendChild(el('line', { x1: X(v), y1: y - 3.5 * k, x2: X(v), y2: y + 3.5 * k, class: 'sx-nl-minor' }));
  }
  const named = (mode === 'ends' || mode === 'autofine')
    ? [spec.min, spec.max].concat((spec.segments||[]).flatMap(g => [g.from, g.to]))
                          .concat(spec.points||[])
    : null;
  const drawn = [];
  for (let v = Math.ceil(spec.min / step) * step; v <= spec.max + 1e-9; v += step) {
    tk.appendChild(el('line', { x1: X(v), y1: y - 6 * k, x2: X(v), y2: y + 6 * k, class: 'sx-nl-tick' }));
    if (named && !named.some(n => Math.abs(n - v) < 1e-9)) continue;
    tk.appendChild(el('text', { x: X(v), y: y + 26 * k, 'text-anchor': 'middle' }, fmt(v)));
    drawn.push(v);
  }
  // A marked value off the major step — an endpoint at -2.5 — would otherwise
  // be a dot the student cannot put a number to.
  if (named) for (const v of marked)
    if (v > spec.min && v < spec.max && !drawn.some(d => Math.abs(d - v) < 1e-9)) {
      tk.appendChild(el('line', { x1: X(v), y1: y - 6 * k, x2: X(v), y2: y + 6 * k, class: 'sx-nl-tick' }));
      tk.appendChild(el('text', { x: X(v), y: y + 26 * k, 'text-anchor': 'middle' }, fmt(v)));
    }
  s.appendChild(tk);

  const g = el('g', { class: 'sx-series sx-s1' });
  const sy = y - lift;
  (spec.segments || []).forEach(sg => {
    const unboundedR = sg.to >= spec.max, unboundedL = sg.from <= spec.min;
    g.appendChild(el('line', { class: 'sx-nl-seg', x1: X(sg.from), y1: sy, x2: X(sg.to), y2: sy,
      'marker-end': unboundedR ? 'url(#sx-ar-ray)' : null,
      'marker-start': unboundedL ? 'url(#sx-ar-ray)' : null }));
    // When the interval is lifted off the axis it stops being self-locating, so
    // a drop line ties each endpoint back to the value it actually names.
    if (lift) {
      if (!unboundedL) g.appendChild(el('line', { class: 'sx-nl-drop',
        x1: X(sg.from), y1: sy, x2: X(sg.from), y2: y }));
      if (!unboundedR) g.appendChild(el('line', { class: 'sx-nl-drop',
        x1: X(sg.to), y1: sy, x2: X(sg.to), y2: y }));
    }
    // open vs closed is SEMANTIC — it is the difference between < and <=
    if (!unboundedL) g.appendChild(el('circle', { cx: X(sg.from), cy: sy, r: ER,
      class: 'sx-endpoint ' + (sg.fromClosed ? 'sx-closed' : 'sx-open') }));
    if (!unboundedR) g.appendChild(el('circle', { cx: X(sg.to), cy: sy, r: ER,
      class: 'sx-endpoint ' + (sg.toClosed ? 'sx-closed' : 'sx-open') }));
  });
  (spec.points || []).forEach(v =>
    g.appendChild(el('circle', { cx: X(v), cy: sy, r: ER, class: 'sx-endpoint sx-closed' })));
  s.appendChild(g);
  return s;
}

/* -------------------------------------------------------------------- PIE */
/* A WHOLE, DIVIDED — and a family, not a drawing for one question.
 *
 * The treatment is "the decided vocabulary" (scripts/pie-directions.html, C),
 * chosen from four by looking at them inside a question at the exam's own
 * measure. Its point is that it introduces NO new colour: the two decided hues,
 * then two neutrals, so a pie can be drawn without reopening the palette.
 *
 * `panels` is why this is a family. One stimulus may carry several pies —
 * distributions of the same population cut different ways — which is the shape
 * this kind of question actually takes, and a schema that allowed only one
 * would have forced two stimulus rows and lost the fact that the two charts
 * describe one whole. Each panel is independent: its own categories, its own
 * values, its own title.
 *
 * FOUR SLOTS, AND NO MORE. The vocabulary has four fills. A distribution with
 * more parts than that is not drawable here, and says so rather than cycling
 * back to slot 1 and telling a reader two different things are the same thing.
 */
/* PAD is the room a rim label needs, and it is not optional. A label sits at
 * R + LAB from the centre and runs OUTWARD from there, so the box has to hold
 * the disc plus the longest label — and the outermost panel has no neighbour to
 * borrow from. Without it "Above 50 50%" ran off the right of a two-panel
 * figure by a character, which the exploration never showed because each pie
 * there had a box of its own. */
const PIE = { W: 330, H: 234, R: 64, LAB: 15, PAD: 46, CH: 7.2, PX: 245, SEP: -Math.PI / 2 };
/* The four fills, NAMED rather than built by concatenating an index. Spelling
 * them out is how the stylesheet gate can see them: it reads the classes this
 * file emits out of the source text, so a name assembled from a prefix and a
 * number reaches it as the bare prefix — a class no rule will ever match. (The
 * first version of this comment quoted that prefix and tripped the same gate on
 * itself, which is worth knowing before writing one here.) It also puts the
 * vocabulary's limit in one place instead of in an arithmetic expression. */
const PIE_SLOT = ['sx-pie-s1', 'sx-pie-s2', 'sx-pie-s3', 'sx-pie-s4'];

function drawPie(spec, opts) {
  opts = opts || {};
  const panels = spec.panels || [];
  if (!panels.length) throw new Error('drawPie: a pie needs at least one panel');
  const titled = panels.some(p => p.title);
  const pw = PIE.W, ph = PIE.H + (titled ? 20 : 0);

  /* MEASURE FIRST, LAY OUT SECOND. Which side of its circle a label sits on
   * follows from the slice angles, so every panel's angles are computed before
   * anything is placed. The layout then knows how far each panel's ink actually
   * reaches to its left and to its right, which is what the gutters and the
   * channel between two panels are sized from. */
  const geom = panels.map((pan, pi) => {
    const cats = pan.categories || [], vals = pan.values || [];
    if (cats.length !== vals.length)
      throw new Error('drawPie: panel ' + pi + ' has ' + cats.length +
                      ' categories and ' + vals.length + ' values');
    if (cats.length > PIE_SLOT.length)
      throw new Error('drawPie: panel ' + pi + ' has ' + cats.length +
                      ' slices and the decided vocabulary has ' + PIE_SLOT.length +
                      ' fills — a fifth would have to invent a hue');
    const total = vals.reduce((a, v) => a + v, 0);
    if (!(total > 0)) throw new Error('drawPie: panel ' + pi + ' sums to ' + total);

    let a0 = PIE.SEP;
    const arcs = vals.map((v) => {
      const a1 = a0 + (v / total) * Math.PI * 2, arc = [a0, a1, (a0 + a1) / 2];
      a0 = a1; return arc;
    });
    /* Widths are ESTIMATED from the character count, the way drawChart already
     * sizes for a named series — nothing is in the document yet to measure, and
     * the Edge Function has no document at all. 7.2 per character is that same
     * constant; 6.6 was tried first and came up ten pixels short on a long one.
     * It over-estimates by around 15% on real strings, and every consumer below
     * relies on erring long: that surplus IS the air between two labels. */
    const labels = cats.map((c, i) => {
      const text = c + '  ' + fmt(Math.round((vals[i] / total) * 1000) / 10) + '%';
      return { text, mid: arcs[i][2], right: Math.cos(arcs[i][2]) >= -0.02,
               w: Math.round(text.length * PIE.CH + 10) };
    });
    const reach = (side) => Math.max(0, ...labels.filter(L => L.right === side).map(L => L.w));
    return { arcs, labels, title: pan.title, reachR: reach(true), reachL: reach(false) };
  });

  // The outer gutter holds the longest label of all, so no panel is clipped by
  // the plate edge whichever end it happens to land on.
  const widest = Math.max(0, ...geom.flatMap(g => g.labels.map(L => L.w)));
  const pad = Math.max(PIE.PAD, widest - (pw / 2 - PIE.R - PIE.LAB));

  /* THE CHANNEL BETWEEN TWO PANELS is sized by the two labels that actually
   * meet in it — the left panel's furthest-right label and the right panel's
   * furthest-left one — and not by a constant.
   *
   * Abutting panels are wide enough only while both are short. On the
   * study-centre pair they were not: "Mathematics  45%" and "Year 10  20%"
   * overlapped by a pixel and read as a two-line block floating between the
   * pies, belonging to neither, on a question whose whole point is telling the
   * two apart. The OUTER gutter had been sized for exactly this overhang and
   * the inner one had never been sized at all.
   *
   * No slack is added beyond the two reaches. The estimate above already runs
   * long, and every unit here is paid for twice: the plate is capped at the
   * question column, so a wider channel scales the whole figure — pies, labels
   * and all — down. A pair that already clears keeps abutting panels, so a pie
   * whose labels never met renders exactly as it did before this existed. */
  const steps = geom.slice(0, -1).map((g, i) =>
    Math.max(pw, 2 * (PIE.R + PIE.LAB) + g.reachR + geom[i + 1].reachL));
  const W = pw + steps.reduce((a, d) => a + d, 0) + pad * 2, H = ph;

  /* A PANEL IS ALWAYS THE SAME SIZE ON THE PAGE. The viewBox grows with the
   * panel count, so displaying every pie at one width made a lone pie render a
   * third larger than a pair — same family, same grammar, visibly heavier ink
   * and bigger type, purely because of how many panels it happened to have.
   * That is the plate-stretch defect again in a different costume. So the
   * display width is derived from the panel width instead, and the caller's
   * value is a CAP rather than a target.
   *
   * The cap BINDS for two panels: 245 per panel wants more than the column has,
   * so a two-panel pie is scaled to fit and its type lands smaller than the
   * rest of the family's. That is a property of the arrangement, not of this
   * cap — see docs/engineering/figure-visual-system.md. */
  const shown = Math.min(opts.shownAt || W, Math.round(W * PIE.PX / pw));
  const s = svgRoot(W, H, shown);
  s.setAttribute('class', 'sx sx-fam-data');

  let left = pad;
  geom.forEach((gm, pi) => {
    const g = el('g', {});
    const cx = left + pw / 2, cy = (titled ? 20 : 0) + PIE.H / 2, r = PIE.R;
    left += steps[pi] || 0;
    if (gm.title)
      g.appendChild(el('text', { x: cx, y: 14, class: 'sx-pie-title' }, gm.title));

    const P = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    gm.arcs.forEach(([a0, a1], i) => {
      const big = (a1 - a0) > Math.PI ? 1 : 0;
      const [x0, y0] = P(a0, r), [x1, y1] = P(a1, r);
      // A single-slice distribution is a circle, and an arc from a point back to
      // itself draws nothing at all — so it is closed as a circle instead.
      g.appendChild(gm.arcs.length === 1
        ? el('circle', { cx, cy, r, class: 'sx-pie-slice ' + PIE_SLOT[0] })
        : el('path', { class: 'sx-pie-slice ' + PIE_SLOT[i],
            d: `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${big} 1 ${x1},${y1} Z` }));
    });

    gm.labels.forEach((L) => {
      const [lx, ly] = P(L.mid, r + PIE.LAB);
      g.appendChild(el('text', { x: lx, y: ly + 4, class: 'sx-pie-label',
        'text-anchor': L.right ? 'start' : 'end' }, L.text));
    });
    s.appendChild(g);
  });
  return s;
}

/* ------------------------------------------------------------------ CHART */
function drawChart(spec, opts) {
  opts = opts || {};
  const W = opts.width || 520;
  const named = spec.series.filter(x => x.name);
  const PAD = { l: 52, r: 18, t: spec.yLabel ? 36 : 20, b: spec.xLabel ? 46 : 30 };
  if (spec.chartType !== 'bar' && named.length > 1) PAD.r = Math.max(PAD.r,
    12 + Math.max(...named.map(x => x.name.length)) * 7.2);
  // Same rule as the plate: the drawing area keeps the proportion it was
  // designed at (520 x 340, labelled on both axes) whatever width it is asked
  // for. A bar chart run out to the exam column with its height left behind
  // came back a third flatter than the scatterplot beside it, which is a
  // difference the data family never asked for.
  const iw = W - PAD.l - PAD.r;
  const ih = opts.height ? opts.height - PAD.t - PAD.b : iw * (REF.ih / REF.iw);
  const H = ih + PAD.t + PAD.b;
  const vals = spec.series.flatMap(s => s.values);
  const lo = Math.min(0, ...vals), hi = Math.max(...vals);
  const step = niceStep(hi - lo, 5), top = Math.ceil(hi / step) * step;
  const Y = v => PAD.t + ih - ((v - lo) / (top - lo)) * ih;
  const n = spec.categories.length;
  const band = iw / n, X = i => PAD.l + band * (i + 0.5);

  const s = svgRoot(W, H, opts.shownAt);
  // A chart is always measured data — the reference-line rule below already
  // says so — so it carries the data family without being told.
  s.setAttribute('class', 'sx sx-fam-data');
  // A chart is always measured data, so its reference lines follow the same
  // rule the data family follows on a plot: they appear when the question asks
  // for a value, and not when it asks about a trend.
  const chartPlan = opts.reading ? gridPlan('data', opts.reading, 1) : { mode: 'rules' };
  const grid = el('g', { class: 'sx-grid' });
  if (chartPlan.mode !== 'none')
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

  // Identity is never colour alone. On an exam it is carried by a DIRECT LABEL
  // on the series itself rather than a legend box: a legend costs a lookup, and
  // a lookup under time is exactly what a figure is supposed to remove.
  if (spec.series.length > 1) {
    spec.series.forEach((ser, si) => {
      if (!ser.name) return;
      const i = ser.values.length - 1, v = ser.values[i];
      const at = spec.chartType === 'bar'
        ? [X(i) + (si - (spec.series.length - 1) / 2) * 24, Y(v) - 9]
        : [X(i) + 9, Y(v) + 4];
      s.appendChild(el('text', { x: at[0], y: at[1], class: 'sx-direct',
        'text-anchor': spec.chartType === 'bar' ? 'middle' : 'start' }, ser.name));
    });
  }
  // The y title reads left-to-right above its own axis, not rotated up the
  // side. Rotated type is slower to read and, on a short exam figure, there is
  // no room it saves.
  if (spec.yLabel) s.appendChild(el('text', { x: PAD.l - 10, y: PAD.t - 8,
    'text-anchor': 'start', class: 'sx-axis-title sx-ylab' }, spec.yLabel));
  if (spec.xLabel) s.appendChild(el('text', { x: PAD.l + iw / 2, y: H - 6,
    'text-anchor': 'middle', class: 'sx-axis-title' }, spec.xLabel));
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
    th.textContent = h;
    // the header is TEXT even above a numeric column — it takes the alignment
    // of its column, never its typeface
    th.className = numeric[c] ? 'sx-th-num' : '';
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

/* Does this stimulus render differently depending on what the question asks?
 * The JS mirror of exam_stimulus_needs_reading(kind, spec). The two are kept
 * deliberately identical: the database decides what may be STORED, this decides
 * what may be DRAWN, and a disagreement would mean a row that validates and
 * cannot be rendered, or the reverse. */
function needsReading(kind, spec) {
  // A PIE IS THE EXCEPTION AMONG CHARTS. Every other chart renders by `reading`,
  // because whether a value must be got off the figure decides whether it is
  // ruled. A pie names every slice on the figure itself, so there is nothing
  // left for a question to change — it renders from the stimulus alone. Placed
  // FIRST: written after the return below, it was dead, and a pie would have
  // been refused for carrying no reading it could ever have used.
  if (kind === 'chart' && (spec || {}).chartType === 'pie') return false;
  return kind === 'chart'
      || (kind === 'plot' && ['graph', 'data'].indexOf((spec || {}).frame) !== -1);
}

/* THE ONLY ENTRY POINT CONTENT GOES THROUGH.
 *
 * It takes a QUESTION and its stimulus, never a stimulus alone, because for
 * three of the five families the variant is not a property of the figure. One
 * stimulus row referenced by two questions — "how many turning points?" and
 * "what is f(3)?" — must produce two different figures, and it can only do that
 * if the question is an input.
 *
 * So the path is  Question + Stimulus -> Figure,  and renderStimulus() below
 * refuses the cases where a stimulus alone is not enough. */
function renderForQuestion(question, stimulus) {
  if (!question) throw new Error('renderForQuestion: a question is required');
  if (!stimulus) throw new Error('renderForQuestion: a stimulus is required');
  const kind = stimulus.kind, spec = stimulus.spec;
  if (kind === 'plot' && !(spec && Array.isArray(spec.figures) && spec.figures.length))
    throw new Error('renderForQuestion: plot ' + (stimulus.id || '?') +
      ' has no figures[] — how each curve is drawn is authored, never guessed');
  const need = needsReading(kind, spec);

  // The same refusal the database makes, made again here. A payload that
  // reached the browser without it has come from somewhere the constraint does
  // not cover, and drawing a guess would hide that.
  if (need && !question.reading)
    throw new Error('renderForQuestion: stimulus ' + (stimulus.id || '?') +
      ' renders by reading, but question ' + (question.id || '?') + ' carries none');
  if (!need && question.reading)
    throw new Error('renderForQuestion: question ' + (question.id || '?') +
      ' carries reading="' + question.reading + '" for a stimulus that does not render by it');

  /* DRAWN AT THE REFERENCE SIZE, SHOWN AT THE COLUMN'S.
   *
   * The first version drew straight at the 560 of the exam column while keeping
   * the heights the grammar was tuned for at 430. That is a stretch, and it was
   * visible: plates came out a quarter flatter than the specimen, squared paper
   * hit its unscaled cap and fell back to a TWO-unit grid a student cannot count
   * squares on, and every line and numeral ended up a fifth lighter relative to
   * the figure around it.
   *
   * Passing the reference width and letting the browser scale the SVG makes the
   * exam figure the SAME figure as the specimen — identical geometry, one scale
   * factor on everything at once. Numerals land at 16.3px against a 17.5px stem,
   * which is the proportion the grammar page has. */
  const SHOWN = 560;
  if (kind === 'table') return drawTable(spec);
  if (kind === 'number_line')
    return drawNumberLine(spec, { tickMode: 'auto', endpointR: 9,
                                  width: REF.W, shownAt: SHOWN });
  if (kind === 'chart')
    // A pie is a chart whose shape is a whole rather than an axis, so it comes
    // through the chart kind and branches on chartType — the same field the
    // database validates against.
    return spec.chartType === 'pie'
      ? drawPie(spec, { shownAt: SHOWN })
      : drawChart(spec, { reading: question.reading, width: REF.W, shownAt: SHOWN });
  if (kind === 'plot')
    return drawPlot(spec, {
      frame: spec.frame,
      reading: question.reading,
      aspect: spec.frame === 'plane' ? 'plane' : 'data',
      axes: spec.frame === 'data' ? 'data' : 'plane',
      originLabel: spec.frame === 'plane' ? 'O' : null,
      // Squared paper is drawn narrower and taller than the other families, and
      // that is its own reference, not a variation on theirs.
      width: spec.frame === 'plane' ? REF.planeW : REF.W,
      shownAt: SHOWN,
      // NO FALLBACK. `figures` says whether these points are a parabola or a
      // scatterplot, and defaulting to 'curve' would draw a continuous
      // relationship the data never claimed. A spec without it is a content
      // bug, and after 20260827b the database will not store one.
      figures: spec.figures,
    });
  throw new Error('renderForQuestion: unsupported kind ' + kind);
}

/* The stimulus-only path, now CLOSED for the families whose variant depends on
 * the question. It was the whole bug: it let a figure be drawn from a stimulus
 * with no idea what was being asked, and would have quietly produced one
 * treatment for two questions that need different ones. */
function renderStimulus(kind, spec, opts) {
  if (needsReading(kind, spec) && !(opts && opts.reading))
    throw new Error('renderStimulus: ' + kind + (spec && spec.frame ? '/' + spec.frame : '') +
      ' renders by the question, so it cannot be drawn from a stimulus alone — ' +
      'use renderForQuestion(question, stimulus)');
  if (kind === 'table') return drawTable(spec);
  if (kind === 'chart')
    return spec.chartType === 'pie' ? drawPie(spec, opts) : drawChart(spec, opts);
  if (kind === 'number_line') return drawNumberLine(spec, opts);
  if (kind === 'plot') return drawPlot(spec, opts);
  throw new Error('renderStimulus: unsupported kind ' + kind);
}

  root.SiExamStimulus = {
    renderForQuestion: renderForQuestion,
    needsReading: needsReading,
    renderStimulus: renderStimulus,
    resolutionOf: resolutionOf,
    gridPlan: gridPlan,
    drawPlot: drawPlot,
    drawChart: drawChart,
    drawTable: drawTable,
    drawNumberLine: drawNumberLine,
    drawPie: drawPie,
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
