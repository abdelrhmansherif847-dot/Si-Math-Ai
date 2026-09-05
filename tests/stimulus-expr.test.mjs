// The expression half — stimulus-expr.js.
//
// Stage 1 moved the parser and sampler out of stimulus-editor.js so the
// RENDERER could share them without depending on the authoring module
// (§16.10.12, U-2). This suite is what stops that move from becoming a second
// evaluator: it pins the module IN ISOLATION, at the constants U-5 locked
// (§16.10.11), against the fixtures §16.7.9 pinned.
//
// tests/stimulus-editor.test.mjs is deliberately unmodified and still runs the
// same 194 checks through the editor's re-exports — that suite is the proof
// Stage 0's behaviour did not move. This one is the proof the module can stand
// on its own.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const t = suite('stimulus-expr');
const X = require('../stimulus-expr.js');
const SRC = read('stimulus-expr.js');

// ══ 1 · THE MODULE, AND ITS ONE DEFINITION OF THE CONSTANTS ═══════════════
t.section('One module, one definition of the four constants');

t.is('the four constants U-5 locked', [X.SAMPLES, X.DP, X.MAX_BRANCHES, X.MIN_POINTS], [201, 4, 8, 2]);
t.is('the eight functions, and only those',
  X.FUNCTION_NAMES, ['abs', 'cos', 'exp', 'ln', 'log', 'sin', 'sqrt', 'tan']);

/* D-6 · the constants have ONE definition in shipped source. A second literal
   201 is the drift hazard the whole extraction exists to prevent. */
const SHIPPED = ['stimulus-expr.js', 'stimulus-editor.js', 'stimulus-view.js'];
const decls = SHIPPED.flatMap((f) => (read(f).match(/var SAMPLES\s*=\s*\d+/g) || []).map(() => f));
t.is('D-6 · SAMPLES is declared in exactly one shipped file', decls, ['stimulus-expr.js']);
t.ok('D-6 is not vacuous — the declaration really is there',
  /var SAMPLES = 201;/.test(SRC));

t.ok('it depends on nothing — no require, no global read of a sibling module',
  !/require\s*\(/.test(SRC) && !/window\.Stimulus(View|Editor)/.test(SRC));

/* It is NOT a generated file, and its header says so — the *.core.js suffix in
   this repo means "authored source with a byte-copy", which this is not. */
t.ok('the header states it is not generated', /NOT a generated file/.test(SRC));
t.ok('and no sync script exists for it',
  !read('scripts/sync-taxonomy.mjs').includes('stimulus-expr'));

// ══ 2 · THE PINNED FIXTURES OF §16.7.9, AT THE LOCKED CONSTANTS ═══════════
t.section('F1-F8 reproduce exactly');

for (const [id, expr, x0, x1, y0, y1, n, sizes] of [
  ['F1', 'x^2-4*x+3', -5, 5, -5, 10, 1, [201]],
  ['F2', '2*x+5',     -5, 5, -5, 10, 1, [201]],
  ['F3', 'sin(x)',    -5, 5, -5,  5, 1, [201]],
  ['F4', 'sqrt(x+2)', -5, 5, -5, 10, 1, [141]],
  ['F5', 'ln(x)',     -5, 5, -5,  5, 1, [100]],
  ['F6', '1/x',       -5, 5, -5,  5, 2, [100, 100]],
  ['F7', 'tan(x)',    -5, 5, -5,  5, 5, [5, 61, 61, 61, 5]],
]) {
  const r = X.sampleFunction(expr, x0, x1, y0, y1);
  t.is(`${id} · ${expr} → ${n} branch(es)`, r.branches.length, n);
  t.is(`${id} · branch sizes`, r.branches.map((b) => b.length), sizes);
}
{
  const r = X.sampleFunction('tan(x)', -20, 20, -5, 5);
  t.is('F8 · tan(x) on [-20,20] caps at MAX_BRANCHES', r.branches.length, 8);
  t.ok('F8 · and says so', r.capped === true);
}

/* D-1/D-2/D-3 · the three fixtures that would move if the density did.
   Measured: at 51 samples tan(10*x) draws THROUGH its poles as one curve, and
   the visibility gate refuses x^2 in a 0.02-high window. */
t.is('D-1 · tan(10*x) resolves 8 branches at 201 samples',
  X.sampleFunction('tan(10*x)', -5, 5, -5, 5).branches.length, 8);
t.ok('D-2 · x^2 in y=[-0.01,0.01] is drawable at 201 samples',
  !X.sampleFunction('x^2', -5, 5, -0.01, 0.01).error);
t.ok('D-3 · sin(20*x) is above Nyquist at 201 samples',
  X.sampleFunction('sin(20*x)', -5, 5, -5, 5).branches[0].length === 201);

// ══ 3 · THE MINIMUM-2-POINT RULE, AND NO INVENTED POINTS ══════════════════
t.section('Every stored coordinate is a real sample');

for (const [expr, x0, x1, y0, y1] of [['tan(x)', -5, 5, -5, 5], ['1/x', -5, 5, -5, 5]]) {
  const r = X.sampleFunction(expr, x0, x1, y0, y1);
  t.ok(`${expr} · no branch is shorter than MIN_POINTS`,
    r.branches.every((b) => b.length >= X.MIN_POINTS));
  t.ok(`${expr} · no branch repeats a coordinate to reach the minimum`,
    r.branches.every((b) => !b.some((p, i) => i && p[0] === b[i - 1][0] && p[1] === b[i - 1][1])));
}

// ══ 4 · DOMAIN AND ERROR BEHAVIOUR (§16.7.3) ══════════════════════════════
t.section('What it refuses, it refuses with a sentence');

for (const [input, needle] of [
  ['@@bad@@',   'is not something this editor understands'],
  ['2x',        'Write "2*x"'],
  ['sin x',     'Write "sin(x)"'],
  ['eval("1")', 'is not one of the functions'],
  ['',          'Type a function of x'],
]) t.ok(`${JSON.stringify(input)} is refused with its own sentence`,
  (X.sampleFunction(input, -5, 5, -5, 5).error || '').includes(needle));

t.ok('1/0 parses but has no drawable part',
  (X.sampleFunction('1/0', -5, 5, -5, 5).error || '').includes('no drawable part'));
/* A parse failure is DENSITY-INDEPENDENT — it is decided by the grammar, which
   is why §16.10.11 could close that half of "drawable" and leave the other. */
t.ok('a parse failure is the same sentence on any range',
  new Set([[-5, 5, -5, 5], [0, 1, 0, 1], [-100, 100, -100, 100]]
    .map(([a, b, c, d]) => X.sampleFunction('@@bad@@', a, b, c, d).error)).size === 1);

// ══ 5 · THE GRAMMAR IS CLOSED — NEVER AN EXPRESSION ENGINE ════════════════
t.section('A total parser over a fixed token set');

/* Read against the CODE, not the module's own prose: the header says the words
   "no eval, no Function" in order to promise it does not use them, so a check
   over the raw file could only ever go red. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
t.ok('the comment strip removed prose', CODE.length < SRC.length - 1200);
t.ok('…and left the code',
  CODE.includes('function parse(') && CODE.includes('function sample(')
  && CODE.includes('function evalAt(') && CODE.includes('function tokenize('));
t.ok('the promise really is made in the prose (so the strip is doing work)', /no eval/i.test(SRC));

for (const [banned, re] of [
  ['eval',          /\beval\s*\(/],
  ['new Function',  /\bnew\s+Function\b/],
  ['Function()',    /(?:^|[^A-Za-z_$.])Function\s*\(/],
  ['setTimeout',    /\bsetTimeout\s*\(/],
  ['setInterval',   /\bsetInterval\s*\(/],
  ['__proto__',     /__proto__/],
  ['indirect eval', /\bwindow\s*\[|\bglobalThis\b/],
]) t.ok(`the evaluator never uses ${banned}`, !re.test(CODE));

/* Non-vacuity: each pattern fires on a string that does contain the construct. */
t.ok('the eval pattern would fire', /\beval\s*\(/.test('var r = eval("1+1");'));
t.ok('the Function pattern would fire', /(?:^|[^A-Za-z_$.])Function\s*\(/.test('var f = Function("x");'));
t.ok('the new Function pattern would fire', /\bnew\s+Function\b/.test('new Function("x")'));
t.ok('the setTimeout pattern would fire', /\bsetTimeout\s*\(/.test('setTimeout(f,1)'));
t.ok('the __proto__ pattern would fire', /__proto__/.test('o.__proto__'));
t.ok('the globalThis pattern would fire', /\bglobalThis\b/.test('globalThis.x'));

for (const attack of ['eval("1")', 'constructor', '__proto__', 'process.exit()',
                      'window["alert"]', 'globalThis', 'new Function("x")'])
  t.ok(`${JSON.stringify(attack)} is refused as an ordinary unknown token`,
    !!X.parse(attack).error);

// ══ 6 · NORMALISATION (§16.7.2) ═══════════════════════════════════════════
t.section('Normalisation is a total rewriter');

for (const [input, want] of [['X^2', 'x^2'], ['x²', 'x^2'], ['2·x', '2*x'], ['  x + 1 ', 'x + 1']])
  t.is(`${JSON.stringify(input)} normalises`, X.normalize(input), want);

t.done();
