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
  // The invariant is "every fifth GRIDLINE", not "every fifth unit" — the step
  // is 1 on a tight range and 2 or 2.5 on a wide one, and the ruling has to
  // hold either way. The first version of this check assumed a step of 1 and
  // failed on a range where the renderer had correctly chosen 2.5.
  for (const [xr, yr] of [[[-1, 7], [-1, 5]], [[-11, 11], [-8, 8]], [[0, 30], [0, 20]]]) {
    const svg = plane({ xRange: xr, yRange: yr, curves: [{ points: [[0, 0], [1, 1]] }] },
                      [{ mode: 'polygon' }]);
    const V = withClass(svg, 'sx-grid')[0].children
      .filter(l => l.getAttribute('x1') === l.getAttribute('x2'))
      .sort((a, b) => +a.getAttribute('x1') - +b.getAttribute('x1'));
    const at = V.map((l, i) => ((l.getAttribute('class') || '') === 'sx-major' ? i : -1))
                .filter(i => i >= 0);
    const gaps = at.slice(1).map((v, i) => v - at[i]);
    t.ok(`x∈[${xr}] — majors fall exactly every fifth gridline`,
         at.length > 0 && gaps.every(g => g === 5), `${V.length} lines, majors at ${at}`);
    t.ok(`x∈[${xr}] — the minor rule stays the majority`, at.length * 3 < V.length);
  }
}
{
  const svg = plane({ xRange: [-1, 7], yRange: [-1, 5],
                      curves: [{ points: [[0, 0], [1, 1]] }] }, [{ mode: 'polygon' }]);
  const tickX = withClass(svg, 'sx-tick')[0].children
    .filter(e => e.attrs['text-anchor'] === 'middle').map(e => +e.getAttribute('x'));
  const originX = +withClass(svg, 'sx-axis')[0].children
    .filter(l => l.getAttribute('x1') === l.getAttribute('x2'))
    .map(l => +l.getAttribute('x1'))[0];
  const majorX = withClass(svg, 'sx-grid')[0].children
    .filter(l => (l.getAttribute('class') || '') === 'sx-major'
              && l.getAttribute('x1') === l.getAttribute('x2'))
    .map(l => +l.getAttribute('x1'))
    .filter(x => Math.abs(x - originX) > 0.51);   // the origin is the axis, not a ruled line
  t.ok('every major rule away from the origin carries a numeral',
       majorX.length > 0 && majorX.every(x => tickX.some(t => Math.abs(t - x) < 0.51)),
       `majors ${majorX}, numerals ${tickX}`);
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

export default t;
