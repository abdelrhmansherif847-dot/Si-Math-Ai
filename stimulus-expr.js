/* stimulus-expr.js — the expression half of a stimulus.
 *
 * stimulus-view.js draws a spec. stimulus-editor.js turns a teacher into one.
 * This evaluates the formulas both of them need, and it is the ONE definition
 * of the four constants U-5 locked: 201 samples, 4 decimal places, at most 8
 * branches, at least 2 points per branch. Changing one here changes BOTH what
 * Stage 0 stores and what Stage 1 draws — that is the point of it living here.
 *
 * NOT a generated file. Unlike taxonomy.core.js and study-planner.core.js it
 * has no sync script, no byte-copy and no drift guard, because both consumers
 * are browser modules served from this origin and the Node suites run these
 * same bytes. Edit it here; there is nowhere else it lives.
 *
 * Depends on nothing. stimulus-editor.js and stimulus-view.js both depend on
 * it; neither depends on the other, and that is what keeps the layering
 * acyclic. Roadmap: teacher-intelligence-layer.md §16.10.12 (U-2).
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
  /* The eight keys stimulus-editor.js re-exports as its own public API, plus
     the three helpers it uses internally and never exposed. */
  var api = {
    normalize: normalize, parse: parse, sampleFunction: sampleFunction,
    SAMPLES: SAMPLES, DP: DP, MAX_BRANCHES: MAX_BRANCHES, MIN_POINTS: MIN_POINTS,
    FUNCTION_NAMES: Object.keys(FUNCS).sort(),
    blank: blank, num: num, round: round,
  };
  if (typeof window !== 'undefined') window.StimulusExpr = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}());
