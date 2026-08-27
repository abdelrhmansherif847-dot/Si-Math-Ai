// Zero Graph — the in-exam graphing workspace.
//
// WHY THIS IS OURS AND NOT DESMOS
// -------------------------------
// The brief asked for a Desmos workspace co-branded with Zero. That is blocked,
// and the block is already recorded in this repository — exam-calculator.js and
// docs/roadmap/mock-exam-v2-investigation.md §7 quote the Desmos Terms of
// Service directly: the Tools may be used only by an end user non-commercially
// or by a School in individual classes; "you may not frame or mirror the Desmos
// Tools without our prior consent"; commercial use requires a separate written
// agreement. Si Math AI sells subscriptions, so neither exemption applies, and
// the JS API key is issued under that same agreement.
//
// Co-branding is a second, independent problem: "Zero x Desmos" asserts a
// partnership that does not exist, which is a trademark question rather than a
// terms-of-service one, and it does not become true by being visually pretty.
//
// So this is a FIRST-PARTY tool. That is not a consolation prize — it is the
// only version of the brief that can actually ship, and it is the only one that
// can honestly read as one merged tool with Zero, because we own both halves.
//
// exam-calculator.js's provider socket is untouched. If the agreement is ever
// signed, Desmos registers there and this becomes the unlicensed fallback
// rather than something to unpick.
//
// WHAT IT DOES
// ------------
// Plots y = f(x) for typed expressions, on the same renderer that draws the
// exam's own figures — so a student's own sketch and the question's figure obey
// one visual grammar instead of looking like two different products.
(function (root) {
  'use strict';

  // ── A SMALL, SAFE EVALUATOR ───────────────────────────────────────────────
  //
  // Shunting-yard to RPN, then evaluate. NOT eval() and not new Function():
  // this parses a student's keystrokes, and handing those to a JS compiler in a
  // page that also holds exam state is not a risk worth taking for the sake of
  // fifty lines.
  var FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt,
    abs: Math.abs, log: Math.log, ln: Math.log, exp: Math.exp,
  };
  var CONSTS = { pi: Math.PI, e: Math.E };
  var OPS = {
    '+': { p: 1, a: 'L', f: function (a, b) { return a + b; } },
    '-': { p: 1, a: 'L', f: function (a, b) { return a - b; } },
    '*': { p: 2, a: 'L', f: function (a, b) { return a * b; } },
    '/': { p: 2, a: 'L', f: function (a, b) { return a / b; } },
    '^': { p: 4, a: 'R', f: function (a, b) { return Math.pow(a, b); } },
  };

  function tokenize(src) {
    var out = [], i = 0, s = String(src).replace(/\s+/g, '');
    while (i < s.length) {
      var c = s[i];
      if (/[0-9.]/.test(c)) {
        var n = '';
        while (i < s.length && /[0-9.]/.test(s[i])) n += s[i++];
        out.push({ t: 'num', v: parseFloat(n) });
        continue;
      }
      if (/[a-z]/i.test(c)) {
        var w = '';
        while (i < s.length && /[a-z]/i.test(s[i])) w += s[i++];
        w = w.toLowerCase();
        if (FUNCS[w]) out.push({ t: 'fn', v: w });
        else if (CONSTS[w] !== undefined) out.push({ t: 'num', v: CONSTS[w] });
        else if (w === 'x') out.push({ t: 'x' });
        else throw new Error('I do not know "' + w + '"');
        continue;
      }
      if (OPS[c]) { out.push({ t: 'op', v: c }); i++; continue; }
      if (c === '(' || c === ')') { out.push({ t: c }); i++; continue; }
      throw new Error('"' + c + '" is not something I can plot');
    }
    // implicit multiplication: 2x, 3(x+1), x(x-1), )( — written out because a
    // student types 2x and means it
    var fixed = [];
    for (var k = 0; k < out.length; k++) {
      var a = out[k], b = out[k + 1];
      fixed.push(a);
      if (!b) continue;
      var aEnd = a.t === 'num' || a.t === 'x' || a.t === ')';
      var bStart = b.t === 'num' || b.t === 'x' || b.t === '(' || b.t === 'fn';
      if (aEnd && bStart) fixed.push({ t: 'op', v: '*' });
    }
    return fixed;
  }

  function toRPN(tokens) {
    var out = [], stack = [];
    tokens.forEach(function (tk) {
      if (tk.t === 'num' || tk.t === 'x') out.push(tk);
      else if (tk.t === 'fn') stack.push(tk);
      else if (tk.t === 'op') {
        while (stack.length) {
          var top = stack[stack.length - 1];
          if (top.t === 'fn' || (top.t === 'op' &&
              (OPS[top.v].p > OPS[tk.v].p ||
               (OPS[top.v].p === OPS[tk.v].p && OPS[tk.v].a === 'L')))) out.push(stack.pop());
          else break;
        }
        stack.push(tk);
      } else if (tk.t === '(') stack.push(tk);
      else if (tk.t === ')') {
        while (stack.length && stack[stack.length - 1].t !== '(') out.push(stack.pop());
        if (!stack.length) throw new Error('A bracket is not closed');
        stack.pop();
        if (stack.length && stack[stack.length - 1].t === 'fn') out.push(stack.pop());
      }
    });
    while (stack.length) {
      var s = stack.pop();
      if (s.t === '(') throw new Error('A bracket is not closed');
      out.push(s);
    }
    return out;
  }

  function evalRPN(rpn, x) {
    var st = [];
    for (var i = 0; i < rpn.length; i++) {
      var tk = rpn[i];
      if (tk.t === 'num') st.push(tk.v);
      else if (tk.t === 'x') st.push(x);
      // A student reads these mid-exam, so they say what is wrong rather than
      // naming the internals that noticed.
      else if (tk.t === 'fn') {
        if (!st.length) throw new Error(tk.v + '( needs something inside it');
        st.push(FUNCS[tk.v](st.pop()));
      } else {
        var b = st.pop(), a = st.pop();
        if (a === undefined || b === undefined)
          throw new Error('"' + tk.v + '" needs a value on both sides');
        st.push(OPS[tk.v].f(a, b));
      }
    }
    if (st.length !== 1) throw new Error('That expression is incomplete');
    return st[0];
  }

  /** Compile once, evaluate many. Returns f(x) or throws with a readable reason. */
  function compile(src) {
    if (!String(src || '').trim()) throw new Error('Nothing to plot yet');
    var rpn = toRPN(tokenize(src));
    evalRPN(rpn, 1);                       // fail now, not inside the sample loop
    return function (x) { return evalRPN(rpn, x); };
  }

  /**
   * Sample a compiled function into the plot spec the exam renderer already
   * speaks — frame 'graph', one curve, figures [{mode:'curve'}]. A student's
   * own sketch is drawn by the same code as the question's figure, which is
   * the whole reason this is worth building rather than embedding.
   */
  function toSpec(fns, xRange, yRange, samples) {
    var x0 = xRange[0], x1 = xRange[1], n = samples || 120;
    var curves = [], figures = [];
    fns.forEach(function (f) {
      var pts = [], step = (x1 - x0) / n;
      for (var i = 0; i <= n; i++) {
        var x = x0 + i * step, y;
        try { y = f(x); } catch (e) { continue; }
        // A vertical asymptote is a break in the function, not a stroke across
        // the plate. Samples outside the window are dropped so the renderer's
        // clip never has to hide a line that should not have been drawn.
        if (typeof y !== 'number' || !isFinite(y)) continue;
        if (y < yRange[0] - (yRange[1] - yRange[0]) || y > yRange[1] + (yRange[1] - yRange[0])) continue;
        pts.push([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
      }
      if (pts.length >= 2) { curves.push({ points: pts }); figures.push({ mode: 'curve' }); }
    });
    if (!curves.length) return null;
    return { frame: 'graph', xRange: [x0, x1], yRange: yRange,
             xLabel: 'x', yLabel: 'y', curves: curves, figures: figures };
  }

  root.SiExamGraph = {
    NAME: 'Zero Graph',
    compile: compile,
    toSpec: toSpec,
    _tokenize: tokenize, _toRPN: toRPN,
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
