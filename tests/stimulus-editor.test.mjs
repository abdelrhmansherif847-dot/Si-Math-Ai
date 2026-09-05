// The authoring half of a stimulus — stimulus-editor.js.
//
// stimulus-view.test.mjs proves a spec draws correctly. This proves a TEACHER
// becomes a correct spec, which is the half Stage 0 adds. It runs the real
// shipped module, not a paraphrase.
//
// Five properties carry the contract (§16.4, §16.7):
//
//   1. every emitted spec would satisfy exam_stimulus_spec_ok();
//   2. a function curve stores BOTH the normalised expr and its points —
//      never expr alone, which is the one shape the live renderer answers
//      with "defined by a formula and is not drawn here";
//   3. a break in a function is a SEPARATE CURVE, because the renderer draws
//      a curve's points as one polyline and has no break token;
//   4. no coordinate is ever invented, duplicated or interpolated;
//   5. a spec the visual editor cannot represent is NOT loaded partially.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const t = suite('stimulus-editor');
const E = require('../stimulus-editor.js');
const SV = require('../stimulus-view.js');
const SRC = read('stimulus-editor.js');

// ══ 0 · THE MODULE IS THE SHIPPED ONE, AND IT IS NOT AN EVALUATOR ═════════
t.section('A total parser over a fixed token set — never an expression engine');

t.ok('the page loads the module', /<script src="stimulus-editor\.js"><\/script>/.test(read('teacher-homework.html')));
t.is('the eight functions, and only those',
  E.FUNCTION_NAMES, ['abs', 'cos', 'exp', 'ln', 'log', 'sin', 'sqrt', 'tan']);
t.is('the sampler constants are the pinned ones',
  [E.SAMPLES, E.DP, E.MAX_BRANCHES, E.MIN_POINTS], [201, 4, 8, 2]);

/* The grammar-closure check, read against the CODE and not the module's own
   prose — its header says the words "no eval, no Function" in order to promise
   it does not use them, so a check over the raw file could only ever go red.
   Same lesson the H3 and H4 dry-runs learned inside their own SQL. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
t.ok('the comment strip removed prose', CODE.length < SRC.length - 2000);
/* STAGE 1 RE-POINTED THIS GUARD, IT DID NOT NARROW IT. Its job is to prove the
   comment strip left real code, so the functions it names must be functions
   that live in THIS file — and the parser and sampler moved to
   stimulus-expr.js (§16.10.12, U-2), where tests/stimulus-expr.test.mjs runs
   the same strip and the same seven banned patterns against them
   non-vacuously. `parse` is still here as a re-export shim; `buildPlot` and
   `hydratePlot` are the authoring half this module kept. The seven checks
   below are UNCHANGED and still fire on this file: an eval planted in
   stimulus-editor.js turns them red, measured. */
t.ok('…and left the code', CODE.includes('function parse(')
  && CODE.includes('function buildPlot(') && CODE.includes('function hydratePlot('));
t.ok('the promise really is made in the prose (so the strip is doing work)', /no eval/i.test(SRC));
/* Word-boundary patterns, not substrings: a plain `Function(` search matches
   this module's own `sampleFunction(` and could only ever go red. */
for (const [banned, re] of [
  ['eval',          /\beval\s*\(/],
  ['new Function',  /\bnew\s+Function\b/],
  ['Function()',    /(?:^|[^A-Za-z_$.])Function\s*\(/],
  ['setTimeout',    /\bsetTimeout\s*\(/],
  ['setInterval',   /\bsetInterval\s*\(/],
  ['__proto__',     /__proto__/],
  ['indirect eval', /\bwindow\s*\[|\bglobalThis\b/],
]) t.ok(`the parser never uses ${banned}`, !re.test(CODE));
/* And the patterns are not vacuous: each one fires on a string that contains
   the construct it bans. */
t.ok('the eval pattern would fire', /\beval\s*\(/.test('var r = eval("1+1");'));
t.ok('the Function pattern would fire', /(?:^|[^A-Za-z_$.])Function\s*\(/.test('var f = Function("return 1");'));
t.ok('…and does NOT fire on sampleFunction(', !/(?:^|[^A-Za-z_$.])Function\s*\(/.test('sampleFunction(a)'));
for (const attack of ['eval("1")', 'constructor', 'this', 'window', 'x;alert(1)', '__proto__', 'process.exit()']) {
  t.ok(`"${attack}" is a parse error like any other unknown token`, !!E.parse(attack).error);
}

// ══ 1 · NORMALISATION ═════════════════════════════════════════════════════
t.section('Six ordered rules, each with an input only it fixes');

for (const [what, input, want] of [
  ['collapses Unicode spaces',      'x  +  1', 'x + 1'],
  ['strips a leading y =',          'y = x^2', 'x^2'],
  ['strips a leading f(x) =',       'f(x) = x^2', 'x^2'],
  ['superscript digits become ^',   'x²', 'x^2'],
  ['consecutive superscripts fold', 'x¹²', 'x^12'],
  ['the Unicode minus',             'x − 1', 'x - 1'],
  ['the multiplication sign',       '2 × x', '2 * x'],
  ['the division sign',             'x ÷ 2', 'x / 2'],
  ['pi',                            'π * x', 'pi * x'],
  ['the root glyph with a bracket', '√(x + 2)', 'sqrt(x + 2)'],
  ['lower-cases the whole string',  'SIN(X) + 1E3', 'sin(x) + 1e3'],
]) t.is(what, E.normalize(input), want);

/* Normalisation is a TOTAL rewriter and never raises. What it cannot rewrite
   survives and the tokenizer refuses it — one rejection path, not two. */
t.is('a bare root glyph survives normalisation', E.normalize('√x + 1'), '√x + 1');
t.ok('…and is then refused by the tokenizer', !!E.parse('√x + 1').error);

// ══ 2 · TOKENISATION — the e / 1e3 collision ══════════════════════════════
t.section('Scientific notation and the constant e never mean two things');

const val = (src, x) => { const p = E.parse(src); if (p.error) return p.error; const r = E.sampleFunction(src, 0, 1, -1e9, 1e9); return r.error || r.branches[0][0][1]; };
t.is('1e3 is one thousand', val('1e3'), 1000);
t.is('e is the constant', val('e'), 2.7183);
t.is('e^2 is the constant squared', val('e^2'), 7.3891);
t.is('2.5e-4 parses', val('2.5e-4'), 0.0003);   // rounded to 4 dp
t.ok('2e is a parse error, not 2*e', !!E.parse('2e').error);
/* Refused for the right reason: the tokenizer reads "2" as a number, leaving
   the constant e beside it, which is implicit multiplication — and the message
   says exactly that. What must never happen is 2e quietly meaning 2*e. */
t.ok('…and it is refused as implicit multiplication', /multiplication sign/.test(E.parse('2e').error));
t.ok('…so it never evaluates to 5.4366', typeof E.sampleFunction('2e', 0, 1, -9, 9).error === 'string');

// ══ 3 · PRECEDENCE ════════════════════════════════════════════════════════
t.section('The only precedence table Stage 0 has');
t.is('-x^2 is -(x^2), read at x = 3',
  E.sampleFunction('-x^2', 3, 4, -20, 20).branches[0][0], [3, -9]);
t.is('2^3^2 is 512, not 64', val('2^3^2'), 512);
t.is('2^-3 parses, the exponent may be unary', val('2^-3'), 0.125);
t.is('unary minus binds looser than ^',
  E.sampleFunction('-x^2', -3, 3, -20, 20).branches[0].slice(-1)[0], [3, -9]);
t.is('* binds tighter than +', val('1+2*3'), 7);
t.is('and brackets win', val('(1+2)*3'), 9);

/* ln is natural, log is base 10. The two conventions differ by country, so a
   silent choice here is a wrong graph — and a swap is invisible without this. */
t.is('log is base 10', val('log(100)'), 2);
t.is('ln is natural', val('ln(e)'), 1);
t.ok('…and they really differ', val('log(100)') !== val('ln(100)'));
t.is('sqrt', val('sqrt(9)'), 3);
t.is('abs', val('abs(0-7)'), 7);
t.is('exp', val('exp(1)'), 2.7183);
t.is('trig is in radians, not degrees', val('sin(pi)'), 0);
t.ok('…and sin(90) is not 1, which it would be in degrees', val('sin(90)') !== 1);

// ══ 4 · REFUSALS ══════════════════════════════════════════════════════════
t.section('Every refusal is a sentence, and names the fix');

t.ok('2x teaches the multiplication sign', /2\*x/.test(E.parse('2*x').error || '') === false
  && /needs the multiplication sign/.test(E.parse('2x').error));
t.ok('2(x+1) too', /needs the multiplication sign/.test(E.parse('2(x+1)').error));
t.ok('x(x+1) too', /needs the multiplication sign/.test(E.parse('x(x+1)').error));
t.ok('sin x asks for brackets', /brackets/.test(E.parse('sin x').error));
t.ok('an unknown name is named', /"sec" is not one of the functions/.test(E.parse('sec(x)').error));
t.ok('a second variable is refused', !!E.parse('x + t').error);
t.ok('an unclosed bracket is refused', /closing bracket/.test(E.parse('sin(x').error));
t.ok('an empty input asks for one', /Type a function/.test(E.parse('   ').error));

// ══ 5 · THE PINNED FIXTURES (§16.7.9) ═════════════════════════════════════
t.section('Branch counts, with every parameter that produces them pinned');

/* A branch count is meaningless without the expression, both ranges, the
   sample count and the precision. All five are fixed here, and the expected
   numbers are the ones §16.7.9 records. */
const FIXTURES = [
  ['F1', 'x^2-4*x+3', -5,  5, -5, 10, 1, [201]],
  ['F2', '2*x+5',     -5,  5, -5, 10, 1, [201]],
  ['F3', 'sin(x)',    -5,  5, -5,  5, 1, [201]],
  ['F4', 'sqrt(x+2)', -5,  5, -5, 10, 1, [141]],
  ['F5', 'ln(x)',     -5,  5, -5,  5, 1, [100]],
  ['F6', '1/x',       -5,  5, -5,  5, 2, [100, 100]],
  ['F7', 'tan(x)',    -5,  5, -5,  5, 5, [5, 61, 61, 61, 5]],
];
for (const [id, expr, x0, x1, y0, y1, n, sizes] of FIXTURES) {
  const r = E.sampleFunction(expr, x0, x1, y0, y1);
  t.is(`${id} · ${expr} on [${x0},${x1}]×[${y0},${y1}] → ${n} branch(es)`, r.branches.length, n);
  t.is(`${id} · branch sizes`, r.branches.map((b) => b.length), sizes);
}
{ // F8 · the only fixture that fires the cap
  const r = E.sampleFunction('tan(x)', -20, 20, -5, 5);
  t.is('F8 · tan(x) on [-20,20] is capped to 8 branches', r.branches.length, 8);
  t.ok('F8 · and the cap is reported, not silent', r.capped === true);
}
/* F6 splits under BOTH the domain rule and the Y-delta rule, so only F7
   isolates the heuristic — there nothing is non-finite at all. */
t.is('F6 · 1/x has exactly one non-finite sample (x = 0)',
  E.sampleFunction('1/x', -5, 5, -5, 5).invalid, 1);
t.is('F7 · tan(x) has NO non-finite samples — the heuristic does all the work',
  E.sampleFunction('tan(x)', -5, 5, -5, 5).invalid, 0);
t.is('F4 · sqrt(x+2) drops 60 samples below its domain',
  E.sampleFunction('sqrt(x+2)', -5, 5, -5, 10).invalid, 60);
t.is('F5 · ln(x) drops 101', E.sampleFunction('ln(x)', -5, 5, -5, 5).invalid, 101);

// ══ 6 · THE MINIMUM-2-POINT RULE, AND NO INVENTED POINTS ══════════════════
t.section('A run of one is discarded, never rescued');

{
  const r = E.sampleFunction('tan(x)', -5, 5, -5, 5);
  t.is('F7 produced 13 runs', r.runs, 13);
  t.is('…of which 5 were kept', r.branches.length, 5);
  t.is('…so 8 single-point runs were discarded', r.runs - r.branches.length, 8);
  t.is('every stored branch has at least 2 points',
    r.branches.filter((b) => b.length < 2).length, 0);
  /* The rescue this forbids: duplicating a coordinate to reach the minimum
     would store 8 more curves, each a degenerate two-identical-points
     polyline drawn as a dot at an asymptote no sample supports. */
  const degenerate = r.branches.filter((b) => b.length === 2 && b[0][0] === b[1][0] && b[0][1] === b[1][1]);
  t.is('no branch is a duplicated point', degenerate.length, 0);
  /* Every coordinate is a real sample at a grid x-value. */
  const grid = new Set(Array.from({ length: 201 }, (_, i) => Math.round((-5 + 10 * i / 200) * 1e4) / 1e4));
  const offGrid = r.branches.flat().filter((p) => !grid.has(p[0]));
  t.is('every x is one of the 201 grid values', offGrid.length, 0);
  const strictlyIncreasing = r.branches.every((b) => b.every((p, i) => i === 0 || p[0] > b[i - 1][0]));
  t.ok('and no branch repeats or reverses an x', strictlyIncreasing);
}

// ══ 7 · DETERMINISM ═══════════════════════════════════════════════════════
t.section('The same formula and ranges give byte-identical points');
{
  const a = JSON.stringify(E.sampleFunction('x^2-4*x+3', -5, 5, -5, 10).branches);
  const b = JSON.stringify(E.sampleFunction('x^2-4*x+3', -5, 5, -5, 10).branches);
  t.is('two runs agree exactly', a, b);
  t.ok('and the values are rounded to 4 dp',
    JSON.parse(a)[0].every((p) => Math.round(p[1] * 1e4) / 1e4 === p[1]));
}

// ══ 8 · THE expr + points INVARIANT ═══════════════════════════════════════
t.section('A function curve stores its meaning AND its drawing');

const plot = (inp) => E.build('plot', inp);
{
  const out = plot({ xMin: -5, xMax: 5, yMin: -5, yMax: 10,
    functions: ['y = x² - 4x + 3'.replace('4x', '4*x')], pointGroups: [] });
  t.ok('a graph builds', !out.error);
  const fn = out.spec.curves.filter((c) => c.expr);
  t.ok('the function curve carries expr', fn.length === 1 && fn[0].expr === 'x^2 - 4*x + 3');
  t.ok('…and points', Array.isArray(fn[0].points) && fn[0].points.length === 201);
  t.is('curves and figures are index-matched', out.spec.curves.length, out.spec.figures.length);
}
{
  const out = plot({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: ['1/x'], pointGroups: [] });
  t.is('a broken function becomes one curve per branch', out.spec.curves.length, 2);
  t.ok('both branches carry the SAME expr',
    out.spec.curves[0].expr === '1/x' && out.spec.curves[1].expr === '1/x');
  t.is('and each has its own figures entry',
    out.spec.figures, [{ mode: 'curve' }, { mode: 'curve' }]);
  t.is('no branch is stored without points',
    out.spec.curves.filter((c) => c.expr && !(c.points || []).length).length, 0);
}
t.ok('no code path can emit expr without points',
  !/\{\s*expr\s*:[^}]*\}(?!\s*,\s*points)/.test(SRC.replace(/\s+/g, ' ')) ||
  /curves\.push\(\{ expr: r\.expr, points: r\.branches\[j\] \}\)/.test(SRC));

// ══ 9 · THE SINGLE-POINT LIMIT (L-1) ══════════════════════════════════════
t.section('A single marked point cannot be stored, and is not faked');
{
  const one = plot({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: [],
    pointGroups: [{ points: [{ x: 2, y: -1, label: '' }] }] });
  t.ok('one point is refused', !!one.error);
  t.ok('…with the sentence that says what to do', /at least two points/.test(one.error));
  const two = plot({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: [],
    pointGroups: [{ points: [{ x: 2, y: -1, label: 'A' }, { x: 4, y: 3, label: 'B' }] }] });
  t.ok('two points are accepted', !two.error);
  t.is('and the labels ride on the figure', two.spec.figures[0], { mode: 'points', labels: ['A', 'B'] });
}

// ══ 10 · EVERY EDITOR'S CANONICAL SPEC ════════════════════════════════════
t.section('Each editor emits the shape the database validates');

{
  const out = E.build('table', { headers: ['Month', 'Units'], rows: [['Jan', '12'], ['Feb', 19]], note: 'Source: sales' });
  t.is('table headers', out.spec.headers, ['Month', 'Units']);
  t.is('numbers are stringified — the validator requires strings', out.spec.rows[1], ['Feb', '19']);
  t.is('the note rides along', out.spec.note, 'Source: sales');
  t.ok('every cell is a string', out.spec.rows.every((r) => r.every((c) => typeof c === 'string')));
}
{
  const out = E.build('chart', { chartType: 'bar', categories: ['A', 'B'],
    series: [{ name: 'S1', values: ['1', '2'] }], xLabel: '', yLabel: 'Units' });
  t.is('chart values are numbers', out.spec.series[0].values, [1, 2]);
  t.ok('an empty axis label is omitted, not stored blank', !('xLabel' in out.spec) && out.spec.yLabel === 'Units');
  t.is('series length matches categories', out.spec.series[0].values.length, out.spec.categories.length);
}
{
  const out = E.build('chart', { chartType: 'pie',
    panels: [{ categories: ['A', 'B', 'C'], values: [1, 2, 3], title: 'Split' }] });
  t.is('a pie carries panels', out.spec.panels.length, 1);
  /* The validator refuses a pie that also carries these. */
  for (const k of ['categories', 'series', 'xLabel', 'yLabel'])
    t.ok(`a pie spec has no ${k}`, !(k in out.spec));
}
{
  const out = E.build('number_line', { min: -5, max: 5, points: [2],
    segments: [{ from: -3, to: 1, fromClosed: true, toClosed: false }] });
  t.is('number line min/max', [out.spec.min, out.spec.max], [-5, 5]);
  t.is('the interval keeps both flags', out.spec.segments[0], { from: -3, to: 1, fromClosed: true, toClosed: false });
  t.is('points are numbers', out.spec.points, [2]);
}

// ══ 11 · MALFORMED INPUT ══════════════════════════════════════════════════
t.section('Every refusal a real teacher will hit');

for (const [what, kind, inputs, needle] of [
  ['a table with no columns',   'table', { headers: [], rows: [[]] },                        /at least one column/],
  ['a table with no rows',      'table', { headers: ['A'], rows: [] },                       /at least one row/],
  ['a chart value that is text','chart', { chartType: 'bar', categories: ['A'], series: [{ name: 'S', values: ['x'] }] }, /must be a number/],
  ['a pie with one slice',      'chart', { chartType: 'pie', panels: [{ categories: ['A'], values: [1] }] }, /between 2 and 4/],
  ['a pie of zeroes',           'chart', { chartType: 'pie', panels: [{ categories: ['A', 'B'], values: [0, 0] }] }, /cannot all be zero/],
  ['a number line with nothing','number_line', { min: 0, max: 1, points: [], segments: [] },  /at least one point or one interval/],
  ['a half-finished interval', 'number_line', { min: -5, max: 5, points: [], segments: [{ from: '-3', to: '', fromClosed: true, toClosed: false }] }, /must be a number/],
  ['a point outside the range','number_line', { min: -5, max: 5, points: ['99'] },              /must sit between -5 and 5/],
  ['a reversed number line',    'number_line', { min: 5, max: 1, points: [1] },               /smaller than/],
  ['a reversed X axis',         'plot', { xMin: 5, xMax: -5, yMin: -5, yMax: 5, functions: ['x'] }, /X axis must run/],
  ['a reversed Y axis',         'plot', { xMin: -5, xMax: 5, yMin: 5, yMax: -5, functions: ['x'] }, /Y axis must run/],
  ['an empty graph',            'plot', { xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: [], pointGroups: [] }, /at least one function or one point/],
]) {
  const out = E.build(kind, inputs);
  t.ok(`${what} is refused`, !!out.error && needle.test(out.error));
}
{
  const off = plot({ xMin: -5, xMax: 5, yMin: 100, yMax: 200, functions: ['x'], pointGroups: [] });
  t.ok('a function entirely off-screen is refused', /does not pass through the visible part/.test(off.error));
}

// ══ 11b · A ROW NOT FILLED IN YET IS NOT A TYPE ERROR ═════════════════════
t.section('Blank rows are skipped; bad values are still refused');

/* The editors open with an empty row so there is somewhere to type. Pressing
   Preview straight away must answer with the empty-state sentence, not with
   "Every value must be a number" about a field nobody touched. The graph
   already skipped a blank function row; the number line did not, which is the
   defect this pins. */
const nl = (inp) => E.build('number_line', Object.assign({ min: -5, max: 5 }, inp));
t.ok('1 · a blank point row gives the empty-state sentence',
  /at least one point or one interval/.test(nl({ points: [''], segments: [] }).error));
t.ok('    …and so does a blank point row beside a blank interval row',
  /at least one point or one interval/.test(
    nl({ points: [''], segments: [{ from: '', to: '', fromClosed: true, toClosed: false }] }).error));
t.ok('2 · a non-empty value that is not a number is still refused',
  /must be a number/.test(nl({ points: ['abc'] }).error));
t.ok('    …as is an interval with only one end filled',
  /must be a number/.test(nl({ points: [], segments: [{ from: '-3', to: '', fromClosed: true, toClosed: false }] }).error));
t.is('3 · a valid point is accepted, with a blank row beside it',
  nl({ points: ['2', ''] }).spec, { min: -5, max: 5, points: [2] });
t.is('4 · an interval alone is accepted, with a blank point row beside it',
  nl({ points: [''], segments: [{ from: -3, to: 1, fromClosed: true, toClosed: false }] }).spec,
  { min: -5, max: 5, segments: [{ from: -3, to: 1, fromClosed: true, toClosed: false }] });
t.ok('a point outside the range is still refused',
  /must sit between/.test(nl({ points: ['99'] }).error));
/* The graph's behaviour is unchanged, and is what the number line now matches. */
t.ok('the graph still skips a blank function row the same way',
  /at least one function or one point/.test(
    E.build('plot', { xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: [''], pointGroups: [] }).error));

// ══ 12 · ROUND TRIP, AND THE LAW AGAINST PARTIAL LOADS ════════════════════
t.section('hydrate(build(inputs)) returns the inputs');

{
  const inputs = { headers: ['A', 'B'], rows: [['1', '2']], note: 'n' };
  const back = E.hydrate('table', E.build('table', inputs).spec).inputs;
  t.is('a table round-trips', back, inputs);
}
{
  const inputs = { chartType: 'bar', categories: ['A', 'B'], series: [{ name: 'S', values: [1, 2] }], xLabel: '', yLabel: '' };
  const back = E.hydrate('chart', E.build('chart', inputs).spec).inputs;
  t.is('a chart round-trips', back, inputs);
}
{
  const inputs = { min: -5, max: 5, points: [2], segments: [{ from: -3, to: 1, fromClosed: true, toClosed: false }] };
  const back = E.hydrate('number_line', E.build('number_line', inputs).spec).inputs;
  t.is('a number line round-trips', back, inputs);
}
{
  /* The one that matters: 1/x emits TWO curves sharing one expr, and hydrate
     must fold them back into ONE function row — otherwise the next save would
     multiply the function by its own branch count. */
  const spec = plot({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: ['1/x'], pointGroups: [] }).spec;
  t.is('the graph stored two branches', spec.curves.length, 2);
  const back = E.hydrate('plot', spec).inputs;
  t.is('…and hydrate folds them into one function', back.functions, ['1/x']);
  const again = plot(back).spec;
  t.is('so a re-save produces the same two curves, not four', again.curves.length, 2);
  t.is('and the identical spec', JSON.stringify(again), JSON.stringify(spec));
}
{
  const spec = plot({ xMin: -5, xMax: 5, yMin: -5, yMax: 10, functions: ['x^2-4*x+3'],
    pointGroups: [{ points: [{ x: 2, y: -1, label: 'A' }, { x: 4, y: 3, label: 'B' }] }] }).spec;
  const back = E.hydrate('plot', spec).inputs;
  t.is('a function and a labelled group both round-trip',
    [back.functions, back.pointGroups[0].points.map((p) => [p.x, p.y, p.label])],
    [['x^2-4*x+3'], [[2, -1, 'A'], [4, 3, 'B']]]);
}

/* Anything the visual editor cannot represent must fall back WHOLE. */
/* A spec the editor itself produced — the only kind it claims to represent.
   A raw points-in-curve-mode polyline (which the platform corpus does use) is
   deliberately NOT representable and is asserted to fall back below. */
const base = plot({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: ['x'], pointGroups: [] }).spec;
const clone = (o) => JSON.parse(JSON.stringify(o));
for (const [what, mutate] of [
  ['a hand-drawn polyline (points in curve mode, no formula)',
                            (s) => { delete s.curves[0].expr; }],
  ['partly-labelled points', (s) => {
      s.curves.push({ points: [[0, 0], [1, 1], [2, 2]] });
      s.figures.push({ mode: 'points', labels: ['A'] }); }],
  ['a dashed curve',        (s) => { s.figures[0].dashed = true; }],
  ['a closed curve',        (s) => { s.figures[0].closed = true; }],
  ['vertices',              (s) => { s.figures[0].mode = 'polygon'; s.figures[0].vertices = true; }],
  ['polygon mode',          (s) => { s.figures[0].mode = 'polygon'; }],
  ['scatter mode',          (s) => { s.frame = 'data'; s.figures[0].mode = 'scatter'; }],
  ['a graph frame',         (s) => { s.frame = 'graph'; }],
  ['a data frame',          (s) => { s.frame = 'data'; }],
  ['an unknown top-level key', (s) => { s.display = { theme: 'dark' }; }],
  ['mismatched lengths',    (s) => { s.figures.push({ mode: 'curve' }); }],
]) {
  const spec = clone(base); mutate(spec);
  const h = E.hydrate('plot', spec);
  t.ok(`${what} falls back to Advanced whole`, !!h.advanced && !h.inputs);
  t.ok(`…and says why`, typeof h.advanced === 'string' && h.advanced.length > 20);
}
t.ok('a representable graph does NOT fall back', !E.hydrate('plot', clone(base)).advanced);

// ══ 13 · PREVIEW PARITY — the specs really draw ═══════════════════════════
t.section('Every emitted spec goes through the shipped renderer');

{
  const spec = plot({ xMin: -5, xMax: 5, yMin: -5, yMax: 10, functions: ['x^2-4*x+3'],
    pointGroups: [{ points: [{ x: 2, y: -1, label: 'A' }, { x: 4, y: 3, label: 'B' }] }] }).spec;
  const html = SV.render({ kind: 'plot', label: 'y = x^2-4*x+3', spec });
  t.is('the function draws as one polyline', (html.match(/<polyline/g) || []).length, 1);
  t.is('the two marked points draw as circles', (html.match(/<circle/g) || []).length, 2);
  t.ok('the labels appear', /sv-plabel">A</.test(html) && /sv-plabel">B</.test(html));
  /* The proof that the expr+points law is doing its job: this note is what a
     teacher would see if the editor had stored the formula alone. */
  t.ok('and NO "defined by a formula" note', !/defined by a formula/.test(html));
}
{
  const spec = plot({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: ['1/x'], pointGroups: [] }).spec;
  const html = SV.render({ kind: 'plot', spec });
  t.is('a broken function draws as one polyline PER BRANCH', (html.match(/<polyline/g) || []).length, 2);
  t.ok('so no line crosses the gap', !/defined by a formula/.test(html));
}
for (const [kind, inputs, needle] of [
  ['table',       { headers: ['A', 'B'], rows: [['1', '2']] },                                   /sv-table/],
  ['chart',       { chartType: 'bar', categories: ['A'], series: [{ name: 'S', values: [1] }] },  /<rect/],
  ['chart',       { chartType: 'line', categories: ['A', 'B'], series: [{ name: 'S', values: [1, 2] }] }, /sv-line/],
  ['chart',       { chartType: 'pie', panels: [{ categories: ['A', 'B'], values: [1, 1] }] },     /sv-pie/],
  ['number_line', { min: -5, max: 5, points: [2], segments: [{ from: -3, to: 1, fromClosed: true, toClosed: false }] }, /sv-dot-on/],
]) {
  const spec = E.build(kind, inputs).spec;
  const html = SV.render({ kind, spec });
  t.ok(`a ${inputs.chartType || kind} spec draws`, needle.test(html));
  t.ok(`…and the renderer does not call it undrawable`, !/could not be displayed/.test(html));
}

// ══ 14 · THE EXISTING CORPUS STILL LOADS ══════════════════════════════════
t.section('Specs authored before this editor existed');

/* The shapes the 33 live platform stimuli use. A plot with an edge frame or a
   polygon is exactly the kind of thing the round-trip law must protect. */
const CORPUS = Object.entries(JSON.parse(read('tests/fixtures/stimuli.json')))
  .filter(([k, v]) => k !== '_comment' && v && v.kind)
  .map(([, v]) => v);
t.ok('the fixture corpus was found (not vacuous)', CORPUS.length >= 8);
let representable = 0, fellBack = 0;
for (const st of CORPUS) {
  if (!['table', 'chart', 'plot', 'number_line'].includes(st.kind) || !st.spec) continue;
  const h = E.hydrate(st.kind, st.spec);
  if (h.advanced) { fellBack++; continue; }
  representable++;
  // A spec the editor claims to understand must survive the round trip.
  const again = E.build(st.kind, h.inputs);
  t.ok(`${st.kind} "${(st.label || '').slice(0, 24)}" survives a round trip`, !again.error);
}
t.ok('some corpus specs are representable (not vacuous)', representable > 0);
t.note(`corpus: ${representable} representable, ${fellBack} correctly fell back to Advanced`);

// ══ 15 · PASTE ════════════════════════════════════════════════════════════
t.section('Excel and Sheets paste as tab-separated lines');
t.is('a TSV block becomes rows', E.parseTSV('a\tb\n1\t2\n'), [['a', 'b'], ['1', '2']]);
t.is('a ragged block keeps its ragged rows for the caller to pad',
  E.parseTSV('a\tb\tc\n1\t2\n'), [['a', 'b', 'c'], ['1', '2']]);
t.is('empty text is no rows, not a crash', E.parseTSV(''), []);
t.is('a trailing newline does not add a phantom row', E.parseTSV('a\tb\n'), [['a', 'b']]);

t.done();
