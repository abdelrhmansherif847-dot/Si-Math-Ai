// The math stimulus renderer — geometry, not appearance.
//
// Appearance lives entirely in CSS, so nothing here asserts a colour or a
// stroke width: a restyle must not break this suite. What it does assert is
// every property a STUDENT'S ANSWER depends on, because each one below was a
// real defect that shipped in the first preview and passed both an item review
// and a DOM-level check:
//
//   * a coordinate plane drawn with unequal axis scales (a circle became an
//     ellipse) — and a model-space check passed it, because the points were
//     exactly on a circle the whole time
//   * a closed figure drawn open, leaving a 110 px gap
//   * a sampled curve joined with straight lines (a parabola became a V)
//   * a scatter joined into a line
//   * axis numerals painted underneath the figure that crosses them
//
// The real shipped module runs against a minimal SVG fake — the house pattern,
// since this repo has no test runner and no DOM library.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('exam-stimulus');

// ── A DOM small enough to read, real enough to draw into ───────────────────
function makeDoc() {
  const mk = (tag, ns) => ({
    tag, ns, children: [], attrs: {}, style: {}, _text: '',
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { this.children.push(c); return c; },
    set textContent(v) { this._text = String(v); },
    get textContent() { return this._text || this.children.map(c => c.textContent).join(''); },
    set className(v) { this.attrs.class = v; },
    get className() { return this.attrs.class || ''; },
  });
  return {
    createElementNS: (ns, tag) => mk(tag, ns),
    createElement: (tag) => mk(tag, null),
  };
}
/** Every descendant, depth-first, in paint order. */
function all(node, out = []) {
  for (const c of node.children) { out.push(c); all(c, out); }
  return out;
}
const withClass = (root, cls) => all(root).filter(e => (e.className || '').split(' ').includes(cls));
const nums = d => (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);

// Load the REAL shipped file, unmodified, through its own IIFE — the same
// bytes the browser runs, hung off a fake global.
const SRC = read('exam-stimulus.js');
const doc = makeDoc();
const fakeGlobal = {};
new Function('document', 'globalThis', SRC).call(fakeGlobal, doc, fakeGlobal);
const R = fakeGlobal.SiExamStimulus;

const plane = (spec, figures) => R.drawPlot(spec, { aspect: 'plane', figures });
const SQUARE = { xRange: [-2, 6], yRange: [-2, 4], curves: [{ points: [[0, 0], [1, 1]] }] };

// ───────────────────────────────────────────────────────────────────────────
t.section('a coordinate plane is drawn square');
{
  const svg = plane(SQUARE, [{ mode: 'polygon' }]);
  const g = withClass(svg, 'sx-grid')[0];
  const V = g.children.filter(l => l.getAttribute('x1') === l.getAttribute('x2'))
                      .map(l => +l.getAttribute('x1')).sort((a, b) => a - b);
  const H = g.children.filter(l => l.getAttribute('y1') === l.getAttribute('y2'))
                      .map(l => +l.getAttribute('y1')).sort((a, b) => a - b);
  const dv = (V[V.length - 1] - V[0]) / (V.length - 1);
  const dh = (H[H.length - 1] - H[0]) / (H.length - 1);
  t.ok('the grid has the same pitch across and down', Math.abs(dv - dh) < 0.01);
  t.ok('the declared window is never cropped — both ranges stay visible',
       V.length >= 8 && H.length >= 6);
}
{
  // the same spec WITHOUT aspect:'plane' must be free to differ — otherwise the
  // check above would pass no matter what the renderer did
  const svg = R.drawPlot({ ...SQUARE, xRange: [0, 9], yRange: [10, 36] },
                         { aspect: 'data', figures: [{ mode: 'scatter' }] });
  const g = withClass(svg, 'sx-grid')[0];
  const V = g.children.filter(l => l.getAttribute('x1') === l.getAttribute('x2'));
  const H = g.children.filter(l => l.getAttribute('y1') === l.getAttribute('y2'));
  const dv = (+V[V.length - 1].getAttribute('x1') - +V[0].getAttribute('x1')) / (V.length - 1);
  const dh = (+H[H.length - 1].getAttribute('y1') - +H[0].getAttribute('y1')) / (H.length - 1);
  t.ok('a data plot is NOT squared — its axes measure different things',
       Math.abs(dv - dh) > 1);
}

t.section('a figure is drawn as what it is, never as what it might be');
{
  const pts = [[0, 3], [1, 0], [2, -1], [3, 0], [4, 3]];      // a parabola
  const curve = plane({ xRange: [-1, 5], yRange: [-2, 4], curves: [{ points: pts }] },
                      [{ mode: 'curve' }]);
  const poly = plane({ xRange: [-1, 5], yRange: [-2, 4], curves: [{ points: pts }] },
                     [{ mode: 'polygon' }]);
  const dOf = svg => withClass(svg, 'sx-curve')[0].getAttribute('d');
  t.ok('a sampled curve is drawn with cubic segments, not straight lines',
       dOf(curve).includes('C') && !dOf(curve).includes('L'));
  t.ok('a polygon is drawn with straight lines, not curves',
       dOf(poly).includes('L') && !dOf(poly).includes('C'));
  t.is('a smooth curve hides its samples', withClass(curve, 'sx-point').length, 0);
  t.is('a polygon shows only the outline unless vertices are asked for',
       withClass(poly, 'sx-point').length, 0);
  t.is('vertices appear when the figure asks for them',
       withClass(plane({ xRange: [-1, 5], yRange: [-2, 4], curves: [{ points: pts }] },
                       [{ mode: 'polygon', vertices: true }]), 'sx-point').length, 5);
}
{
  const pts = [[1, 2], [2, 4], [3, 3]];
  const sc = R.drawPlot({ xRange: [0, 4], yRange: [0, 5], curves: [{ points: pts }] },
                        { aspect: 'data', figures: [{ mode: 'scatter' }] });
  t.is('a scatter is never joined', withClass(sc, 'sx-curve').length, 0);
  t.is('a scatter draws one mark per observation', withClass(sc, 'sx-point').length, 3);
}
{
  const named = plane({ xRange: [-3, 5], yRange: [-2, 4], curves: [{ points: [[-2, 3], [4, -1]] }] },
                      [{ mode: 'points', labels: ['A', 'B'] }]);
  t.is('named points carry the names the prompt refers to',
       withClass(named, 'sx-label').map(e => e.textContent), ['A', 'B']);
}

t.section('smoothing must not be the thing that decides the shape');
{
  // A student reads values off a drawn curve. If the smoothing moves the curve
  // far from the plain polyline through the same samples, then the RENDERER is
  // choosing the shape, not the author — and the student is reading this
  // function rather than the intended one.
  //
  // Measured on a parabola: polyline and smoothed disagree by 84 px at four
  // samples and by 2 px at twenty. So the safeguard is sampling density, and
  // the check is that smoothing is REDUNDANT: safe precisely when it makes no
  // difference.
  const PXU = 432 / 6;                       // px per figure unit at exam size
  const bez = (p0, p1, p2, p3, t) => {
    const u = 1 - t;
    return [u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
            u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]];
  };
  /** Walk the rendered path's cubic segments back out of the `d` attribute. */
  function walk(d) {
    const nums = d.match(/-?\d+(\.\d+)?(e-?\d+)?/g).map(Number);
    const out = [[nums[0], nums[1]]];
    let i = 2, cur = out[0];
    while (i + 5 < nums.length + 1 && i + 5 <= nums.length) {
      const c1 = [nums[i], nums[i+1]], c2 = [nums[i+2], nums[i+3]], p = [nums[i+4], nums[i+5]];
      for (let k = 1; k <= 24; k++) out.push(bez(cur, c1, c2, p, k / 24));
      cur = p; i += 6;
    }
    return out;
  }
  const worstGap = pts => {
    const svg = plane({ xRange: [-2, 4], yRange: [-5, 5], curves: [{ points: pts }] },
                      [{ mode: 'curve' }]);
    const poly = plane({ xRange: [-2, 4], yRange: [-5, 5], curves: [{ points: pts }] },
                       [{ mode: 'polygon' }]);
    const curve = walk(withClass(svg, 'sx-curve')[0].getAttribute('d'));
    const straight = withClass(poly, 'sx-curve')[0].getAttribute('d')
      .split(/[ML]/).filter(Boolean).map(s => s.split(',').map(Number));
    let worst = 0;
    for (const [x, y] of curve) {
      let best = Infinity;
      for (let i = 0; i < straight.length - 1; i++) {
        const [ax, ay] = straight[i], [bx, by] = straight[i + 1];
        if (x < Math.min(ax, bx) - 0.5 || x > Math.max(ax, bx) + 0.5) continue;
        const t = bx === ax ? 0 : (x - ax) / (bx - ax);
        best = Math.min(best, Math.abs(y - (ay + (by - ay) * t)));
      }
      if (best < Infinity) worst = Math.max(worst, best);
    }
    return worst;
  };
  const parab = n => Array.from({ length: n }, (_, i) => {
    const x = -1.6 + i * (5.2 / (n - 1));
    return [+x.toFixed(4), +(x * x - 2 * x - 3).toFixed(4)];
  });
  const sparse = worstGap(parab(4)), dense = worstGap(parab(20));
  t.ok('a densely sampled curve is drawn where its samples already say it is',
       dense < 4, `${dense.toFixed(1)} px from the polyline`);
  t.ok('and a sparsely sampled one is not — the check can go red',
       sparse > dense * 3, `4 samples: ${sparse.toFixed(1)} px vs 20 samples: ${dense.toFixed(1)} px`);
}

t.section('a closed figure closes');
{
  const ring = [[3, 0], [0, 3], [-3, 0], [0, -3]];
  const closed = plane({ xRange: [-4, 4], yRange: [-4, 4], curves: [{ points: ring }] },
                       [{ mode: 'curve', closed: true }]);
  const open = plane({ xRange: [-4, 4], yRange: [-4, 4], curves: [{ points: ring }] },
                     [{ mode: 'curve', closed: false }]);
  const dC = withClass(closed, 'sx-curve')[0].getAttribute('d');
  const dO = withClass(open, 'sx-curve')[0].getAttribute('d');
  t.ok('a closed curve ends with Z and leaves no gap', dC.trim().endsWith('Z'));
  t.ok('an open curve does not', !dO.trim().endsWith('Z'));
  const seg = d => d.split(/(?=[MC])/).length;
  t.ok('closing adds the wrap-around segment, it does not just move the pen',
       seg(dC) === seg(dO) + 1);
}

t.section('the axis numerals are the instrument');
{
  const svg = plane(SQUARE, [{ mode: 'polygon' }]);
  const order = all(svg);
  const lastTick = order.map(e => (e.className || '')).lastIndexOf('sx-tick');
  const lastSeries = order.reduce((acc, e, i) =>
    (e.className || '').startsWith('sx-series') ? i : acc, -1);
  t.ok('tick numerals are painted after the figure, never under it',
       lastTick > lastSeries && lastSeries >= 0);
  const ticks = withClass(svg, 'sx-tick')[0];
  t.ok('the origin is not numbered twice',
       ticks.children.filter(e => e.textContent === '0').length <= 1);
}

t.section('the grid is countable, not merely present');
{
  // TWO rules, and the second exists because the first turned out to be
  // inaudible. Majors fall every fifth GRIDLINE — not every fifth unit, since
  // the step is 1 on a tight range and 2 or 2.5 on a wide one. But niceStep
  // holds the line count between 6 and 9 at every span from 4 to 1000, so
  // "every fifth" is usually one or two lines, one of them hidden underneath
  // the axis itself. A rhythm with two beats is not a rhythm: the surviving
  // major read as a heavy stray line drawn through the figure. So the tier
  // engages only where at least three majors fall inside the window.
  //
  // BOTH branches are asserted. Checking only the engaged one would pass a
  // renderer that had quietly lost the threshold and gone back to drawing
  // strays, which is the defect this rule was written to remove.
  const gridOf = (xr, yr) => {
    const svg = plane({ xRange: xr, yRange: yr, curves: [{ points: [[0, 0], [1, 1]] }] },
                      [{ mode: 'polygon' }]);
    const V = withClass(svg, 'sx-grid')[0].children
      .filter(l => l.getAttribute('x1') === l.getAttribute('x2'))
      .sort((a, b) => +a.getAttribute('x1') - +b.getAttribute('x1'));
    const at = V.map((l, i) => ((l.getAttribute('class') || '') === 'sx-major' ? i : -1))
                .filter(i => i >= 0);
    return { svg, lines: V.length, at };
  };

  for (const [xr, yr] of [[[-1, 7], [-1, 5]], [[-11, 11], [-8, 8]], [[0, 30], [0, 20]]]) {
    const { lines, at } = gridOf(xr, yr);
    t.ok(`x\u2208[${xr}] — fewer than three majors would fall here, so none are drawn`,
         at.length === 0);
    t.ok(`x\u2208[${xr}] — ${lines} gridlines, all of them one weight`, lines > 0);
  }

  const wide = gridOf([0, 100], [0, 60]);
  const gaps = wide.at.slice(1).map((v, i) => v - wide.at[i]);
  t.ok('x\u2208[0,100] — the tier engages, and majors fall exactly every fifth gridline',
       wide.at.length >= 3 && gaps.length > 0 && gaps.every(g => g === 5));
  t.ok('x\u2208[0,100] — the minor rule stays the majority', wide.at.length * 3 < wide.lines);
}
{
  // Where the tier IS engaged, every ruled line a student might count from has
  // to be a line they can put a number to.
  const svg = plane({ xRange: [0, 100], yRange: [0, 60],
                      curves: [{ points: [[0, 0], [1, 1]] }] }, [{ mode: 'polygon' }]);
  const tickX = withClass(svg, 'sx-tick')[0].children
    .filter(e => e.attrs['text-anchor'] === 'middle').map(e => +e.getAttribute('x'));
  const axisV = withClass(svg, 'sx-axis')[0].children
    .filter(l => l.getAttribute('x1') === l.getAttribute('x2'))
    .map(l => +l.getAttribute('x1'));
  const originX = axisV.length ? axisV[0] : -1e9;
  const majorX = withClass(svg, 'sx-grid')[0].children
    .filter(l => (l.getAttribute('class') || '') === 'sx-major'
              && l.getAttribute('x1') === l.getAttribute('x2'))
    .map(l => +l.getAttribute('x1'))
    .filter(x => Math.abs(x - originX) > 0.51);   // the origin is the axis, not a ruled line
  t.ok('every major rule away from the origin carries a numeral',
       majorX.length > 0 && majorX.every(x => tickX.some(v => Math.abs(v - x) < 0.51)));
}
{
  // A NEGATIVE numeral must still read as negative. The renderer sets U+2212
  // MINUS rather than the hyphen a keyboard gives you — a hyphen is short, high
  // and reads as punctuation next to numerals — and the failure mode worth
  // guarding is not the glyph choice but the sign going missing altogether.
  const svg = plane({ xRange: [-8, 8], yRange: [-6, 6],
                      curves: [{ points: [[0, 0], [1, 1]] }] }, [{ mode: 'polygon' }]);
  const labels = withClass(svg, 'sx-tick')[0].children
    .filter(e => e.tag === 'text').map(e => e.textContent);
  t.ok('negative numerals keep their sign, set as a real minus',
       labels.some(v => v.startsWith('\u2212')) && !labels.some(v => v.startsWith('-')));
}

t.section('a number line says < or ≤ and nothing vaguer');
{
  const nl = R.drawNumberLine({ min: -6, max: 6,
    segments: [{ from: -3, to: 4, fromClosed: false, toClosed: true }] });
  const ends = withClass(nl, 'sx-endpoint');
  t.is('both endpoints are drawn', ends.length, 2);
  t.is('the open end is open and the closed end is closed',
       ends.map(e => e.className.includes('sx-open') ? 'open' : 'closed'), ['open', 'closed']);
  const un = R.drawNumberLine({ min: -6, max: 6,
    segments: [{ from: -1, to: 6, fromClosed: true, toClosed: true }] });
  const seg = withClass(un, 'sx-nl-seg')[0];
  t.ok('a segment reaching the edge ends in an arrow, not a stop',
       !!seg.getAttribute('marker-end'));
  t.is('and grows no endpoint there', withClass(un, 'sx-endpoint').length, 1);
}

t.section('tables are content, not containers');
{
  const tb = R.drawTable({ headers: ['Item', 'Price'], rows: [['Pen', '48'], ['Bag', '320']],
                           note: 'Key: 3 | 2 means 32' });
  const cells = all(tb).filter(e => e.tag === 'td');
  t.is('every cell is present', cells.map(c => c.textContent), ['Pen', '48', 'Bag', '320']);
  t.is('numeric columns are marked so they can align',
       cells.filter(c => c.className === 'sx-num').map(c => c.textContent), ['48', '320']);
  t.ok('a key travels with the data it makes readable',
       all(tb).some(e => e.className === 'sx-note' && e.textContent.startsWith('Key:')));
}

t.section('nothing is guessed');
{
  let threw = false;
  try { R.drawPlot({ xRange: [0, 1], yRange: [0, 1], curves: [{ points: [[0, 0], [1, 1]] }] },
                   { aspect: 'plane', figures: [] }); } catch { threw = true; }
  t.ok('a curve with no figure decision is a loud failure, not a default', threw);
  let threw2 = false;
  try { R.renderStimulus('figure', {}, {}); } catch { threw2 = true; }
  t.ok('an unsupported kind is refused rather than drawn blank', threw2);
}

t.section('the renderer stays inert — an exam figure answers nothing');
{
  const svg = plane(SQUARE, [{ mode: 'polygon' }]);
  const bad = all(svg).filter(e =>
    Object.keys(e.attrs).some(k => /^on/i.test(k) || k === 'tabindex'));
  t.is('no interaction handler is attached anywhere', bad.length, 0);
  t.ok('no value label is printed on the figure',
       withClass(svg, 'sx-label').length === 0);
  // scan the CODE, not the prose. The first version of this check matched the
  // module's own comment explaining that it has no hover, and failed.
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  t.ok('the module contains no hover or tooltip machinery',
       !/addEventListener|mouseover|tooltip|onmouse|title=/i.test(code));
}

// ═══════════════════════════════════════════════════════════════════════════
// THE SCHEMA-AWARE PATH — what the renderer reads off the row
//
// Until 2026-08-29 these decisions arrived out of band through `opts`, and the
// first preview GUESSED one of them from a curve's label with a regex, per
// frame, silently. Two applied migrations put them in the database — 20260827a
// (spec.frame, exam_questions.reading) and 20260827b (spec.figures[]) — and
// renderForQuestion() is the entry point that reads them. Everything below is
// a refusal or a difference the row is supposed to produce.
// ═══════════════════════════════════════════════════════════════════════════

t.section('where reading applies is one rule, and the database owns it');
{
  // Written out here INDEPENDENTLY of the renderer, from the migration's own
  // documented semantics — a table that read the implementation back to itself
  // would move with any bug.
  const EXPECT = [
    ['chart',       null,     true,  'a chart is always measured data'],
    ['plot',        'graph',  true,  'a function graph rules only for a value'],
    ['plot',        'data',   true,  'measured data rules only for a value'],
    ['plot',        'plane',  false, 'the plane\'s grid is the instrument, always drawn'],
    ['table',       null,     false, 'a table has no rendering variant'],
    ['number_line', null,     false, 'a number line has no rendering variant'],
  ];
  for (const [kind, frame, want, why] of EXPECT)
    t.is(`${kind}${frame ? '/' + frame : ''} — ${why}`,
         R.needsReading(kind, frame ? { frame } : {}), want);

  // The SQL side of the same rule. If the database changes where reading
  // applies, this fails and the mirror above has to be revisited rather than
  // silently disagreeing with what may be stored.
  const sql = read('supabase/migrations/20260827a_stimulus_reading.sql');
  t.ok('exam_stimulus_needs_reading still states the rule this mirrors',
       sql.includes("k = 'chart'")
    && sql.includes("(k = 'plot' and (s ->> 'frame') in ('graph', 'data'))"));
}

t.section('a figure is drawn from the row, or not at all');
{
  const GRAPH = { id: 'st-1', kind: 'plot', spec: {
    frame: 'graph', xRange: [-1, 5], yRange: [-2, 6],
    curves: [{ points: [[0, 0], [1, 2], [2, 1], [3, 4]] }],
    figures: [{ mode: 'curve' }] } };
  const refuse = (label, q, st) => {
    let threw = false;
    try { R.renderForQuestion(q, st); } catch { threw = true; }
    t.ok(label, threw);
  };

  refuse('a plot with no figures[] is refused, never drawn as a guessed curve',
         { id: 'q', reading: 'value' },
         { id: 'st', kind: 'plot', spec: { frame: 'graph', xRange: [0, 1], yRange: [0, 1],
                                           curves: [{ points: [[0, 0], [1, 1]] }] } });
  refuse('a stimulus that renders BY the reading is refused without one',
         { id: 'q' }, GRAPH);
  refuse('and a reading supplied where nothing renders by it is refused too',
         { id: 'q', reading: 'value' },
         { id: 'st', kind: 'table', spec: { headers: ['x'], rows: [['1']] } });
  refuse('a question is required — a stimulus alone cannot decide',
         null, GRAPH);

  // THE PROPERTY THE READING COLUMN EXISTS FOR. One stimulus row, byte-identical
  // in both calls; two questions that differ only in `reading`. If the figures
  // come out the same, the column is decorative and the schema bought nothing.
  const shape = R.renderForQuestion({ id: 'q14', reading: 'shape' }, GRAPH);
  const value = R.renderForQuestion({ id: 'q15', reading: 'value' }, GRAPH);
  const ruled = (svg) => (withClass(svg, 'sx-grid')[0] || { children: [] }).children.length;
  t.ok('one stimulus + reading "shape" draws no grid — the curve is the subject',
       ruled(shape) === 0);
  t.ok('the same stimulus + reading "value" rules a grid to read the value off',
       ruled(value) > 0);
}

t.section('the family rule is computed, not chosen per figure');
{
  // Each row is a family and what it does with the question's reading. The
  // plane ignores reading entirely — its grid IS the measuring instrument.
  t.is('plane — always ruled, whatever is asked',      R.gridPlan('plane', 'shape', 1).mode, 'major');
  t.is('plane — and still ruled when a value is asked', R.gridPlan('plane', 'value', 1).mode, 'major');
  t.is('graph + shape — no grid; the curve is the subject', R.gridPlan('graph', 'shape', 1).mode, 'none');
  t.is('graph + value — a grid, to read the value off',     R.gridPlan('graph', 'value', 1).mode, 'major');
  t.is('data + shape — no grid',                            R.gridPlan('data', 'shape', 1).mode, 'none');
  t.is('data + value — horizontal rules only, tracking left', R.gridPlan('data', 'value', 1).mode, 'rules');
  let threw = false;
  try { R.gridPlan('scatterplot', 'value', 1); } catch { threw = true; }
  t.ok('an undeclared frame throws rather than defaulting to a look', threw);

  // The sub-unit grid follows the figure's own vertices, so an endpoint at 2.5
  // sits ON a crossing instead of between two of them.
  t.is('integer vertices need no half-steps', R.resolutionOf([0, 1, -3, 12]), 1);
  t.is('a vertex at 2.5 grows half-unit lines', R.resolutionOf([0, 2.5, 4]), 0.5);
  t.is('and one at 0.2 grows fifths', R.resolutionOf([0, 0.2, 1]), 0.2);
  t.ok('a plane\'s sub-grid is its resolution, not a fixed fraction',
       R.gridPlan('plane', 'shape', 0.5).sub === 0.5 && R.gridPlan('plane', 'shape', 1).sub === 0);
}

t.section('the stimulus-only path is closed where a figure needs the question');
{
  const shut = (label, kind, spec) => {
    let threw = false;
    try { R.renderStimulus(kind, spec, {}); } catch { threw = true; }
    t.ok(label, threw);
  };
  shut('a function graph cannot be drawn from a stimulus alone', 'plot',
       { frame: 'graph', xRange: [0, 1], yRange: [0, 1],
         curves: [{ points: [[0, 0], [1, 1]] }], figures: [{ mode: 'curve' }] });
  shut('nor can a chart', 'chart',
       { series: [{ name: 'a', values: [1, 2] }], categories: ['x', 'y'] });
  // …but the families whose figure does not depend on the question still draw,
  // which is what keeps this a boundary rather than a blanket refusal.
  let drew = false;
  try { drew = !!R.renderStimulus('table', { headers: ['x'], rows: [['1']] }, {}); } catch { drew = false; }
  t.ok('a table still draws from the stimulus alone', drew);
}

t.done();

export default t;
