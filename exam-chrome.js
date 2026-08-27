// Exam Chrome — the furniture around a question.
//
// WHAT THIS FILE IS FOR
// ---------------------
// The navigator, the timer and the tool launcher are the three things a student
// touches that are NOT the question. They were living inside one preview build,
// which is the same two-renderers problem exam-stimulus.js was written to end:
// a preview and a delivery drawing the same control two ways.
//
// So they live here, as one module, in the house pattern — no build step, no
// dependencies, the same bytes in the browser and under CI.
//
// THE RULE THIS FURNITURE OBEYS
// -----------------------------
// Quiet during the question. The figure design system spent a lot of effort
// making the mathematics the loudest thing on screen; chrome that competes with
// it undoes that. Everything here is available without announcing itself:
// the navigator collapses, the timer can be hidden, the tool sits behind one
// button. None of it animates while a student is reading.
//
// WHAT IT DOES NOT DO
// -------------------
// It does not own exam state. It renders what it is given and reports what was
// clicked. Timing, scoring, saving and the integrity log are somebody else's
// job, and this file loading or not must not change any of them.
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function svg(tag, attrs, kids) {
    var n = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function icon(paths, size) {
    var s = svg('svg', { viewBox: '0 0 24 24', width: size || 16, height: size || 16,
      fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    paths.forEach(function (d) { s.appendChild(svg('path', { d: d })); });
    return s;
  }

  // ── TIMER ──────────────────────────────────────────────────────────────────
  //
  // Prominent, and hideable — because for some students a visible countdown is
  // the thing that ends the exam early. Hiding is a DELIBERATE, REVERSIBLE act:
  // the control stays on screen saying "Time hidden", so nobody loses the clock
  // by accident and nobody has to hunt for it. The timer never stops; only its
  // face is covered.
  function mmss(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function Timer(opts) {
    opts = opts || {};
    var hidden = !!opts.hidden;
    var remaining = opts.remaining || 0;
    var total = opts.total || 0;

    var face = el('span', { class: 'xc-t-face', text: mmss(remaining) });
    var word = el('span', { class: 'xc-t-hidden', text: 'Time hidden' });
    var btn = el('button', { class: 'xc-t-toggle', type: 'button' });
    var wrap = el('div', { class: 'xc-timer' }, [face, word, btn]);

    function paint() {
      wrap.classList.toggle('is-hidden', hidden);
      // Low time is signalled by weight and colour, never by motion: a pulsing
      // clock in peripheral vision is exactly the pressure the hide exists for.
      wrap.classList.toggle('is-low', !hidden && total > 0 && remaining <= Math.min(300, total * 0.1));
      face.textContent = mmss(remaining);
      btn.textContent = '';
      btn.appendChild(icon(hidden
        ? ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 9a3 3 0 100 6 3 3 0 000-6z']
        : ['M17.94 17.94A10.07 10.07 0 0112 20C5 20 1 12 1 12a18.45 18.45 0 015.06-5.94',
           'M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19', 'M1 1l22 22']));
      btn.appendChild(el('span', { text: hidden ? 'Show' : 'Hide' }));
      btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      btn.setAttribute('aria-label', hidden ? 'Show the remaining time' : 'Hide the remaining time');
      wrap.setAttribute('aria-label', hidden
        ? 'Time remaining is hidden' : 'Time remaining ' + mmss(remaining));
    }
    btn.addEventListener('click', function () {
      hidden = !hidden; paint();
      if (opts.onToggle) opts.onToggle(hidden);
    });
    paint();
    return {
      el: wrap,
      set: function (sec) { remaining = sec; paint(); },
      isHidden: function () { return hidden; },
      setHidden: function (v) { hidden = !!v; paint(); },
    };
  }

  // ── NAVIGATOR ──────────────────────────────────────────────────────────────
  //
  // "Question X of Y" is the control, and the grid of every question sits under
  // it. Four states, and they are told apart by SHAPE as well as by colour, so
  // the grid survives a colour-vision difference and a bad screen:
  //
  //   current    a filled chip with a ring around it — unmistakable, which was
  //              the requirement. Nothing else on the grid carries a ring.
  //   answered   filled, no ring
  //   flagged    a corner notch
  //   unseen     outline only
  function Navigator(opts) {
    opts = opts || {};
    var total = opts.total || 0;
    var current = opts.current || 1;
    var states = opts.states || {};      // { 3: 'answered', 7: 'flagged' }
    var open = !!opts.open;

    var label = el('span', { class: 'xc-n-label' });
    var caret = el('span', { class: 'xc-n-caret' });
    var toggle = el('button', { class: 'xc-n-toggle', type: 'button',
      'aria-haspopup': 'true' }, [label, caret]);
    var grid = el('div', { class: 'xc-n-grid', role: 'group',
      'aria-label': 'Jump to a question' });
    var panel = el('div', { class: 'xc-n-panel' }, [
      el('div', { class: 'xc-n-legend' }, [
        el('span', { class: 'xc-lg xc-lg-cur',  text: 'Current' }),
        el('span', { class: 'xc-lg xc-lg-ans',  text: 'Answered' }),
        el('span', { class: 'xc-lg xc-lg-flag', text: 'Flagged' }),
        el('span', { class: 'xc-lg xc-lg-un',   text: 'Not seen' }),
      ]), grid]);
    var wrap = el('div', { class: 'xc-nav' }, [toggle, panel]);

    function paintGrid() {
      grid.textContent = '';
      for (var i = 1; i <= total; i++) {
        var st = states[i] || 'unseen';
        var isCur = i === current;
        var b = el('button', {
          class: 'xc-q xc-q-' + st + (isCur ? ' is-current' : ''),
          type: 'button', text: String(i),
          'aria-current': isCur ? 'true' : null,
          'aria-label': 'Question ' + i + ', ' + (isCur ? 'current' : st),
        });
        (function (n) {
          b.addEventListener('click', function () { if (opts.onJump) opts.onJump(n); });
        }(i));
        grid.appendChild(b);
      }
    }
    function paint() {
      label.textContent = 'Question ' + current + ' of ' + total;
      wrap.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      paintGrid();
    }
    toggle.addEventListener('click', function () { open = !open; paint(); });
    // Escape closes the grid; it must never trap a student inside a control.
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) { open = false; paint(); toggle.focus(); }
    });
    paint();
    return {
      el: wrap,
      setCurrent: function (n) { current = n; paint(); },
      setState: function (n, s) { states[n] = s; paint(); },
      setOpen: function (v) { open = !!v; paint(); },
      isOpen: function () { return open; },
    };
  }

  root.SiExamChrome = {
    mmss: mmss,
    Timer: Timer,
    Navigator: Navigator,
    _el: el, _icon: icon, _svg: svg,
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
