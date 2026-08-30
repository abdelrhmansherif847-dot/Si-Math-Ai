// The reviewer bar — a strip of review controls on the exam surface, and
// nothing a student can ever reach.
//
// WHY IT EXISTS
// -------------
// exams.html is where a DRAFT form is looked at before it is published, and two
// questions come up on every pass: does this hold together on the surfaces we
// are choosing between, and did all the mathematics actually typeset. Both were
// answered by opening other pages, or by squinting. Neither is a student
// concern, so neither belongs in the exam UI — but both belong ON it, because
// the whole point is to judge the real card rather than a specimen of it.
//
// WHAT IT IS NOT
// --------------
// It is NOT a theme picker, and it does not touch the figure grammar. The four
// surfaces below differ in ONE thing — how much light the card emits — which is
// what `stimulus-plates.html` put them side by side to compare, and the hexes
// here are that page's own, unchanged. Everything drawn on the card keeps the
// approved grammar: the axis ink, the grid tiers, the two data hues and the
// table rules all come from figure-system.css and are not overridden here.
//
// That restraint is the design. The specimen sheet also carries tuned INK sets
// per candidate (`--grid-line`, `--axis-line`, `--s1`…), and mapping those onto
// the product would re-tint every figure on the review page — so a reviewer
// would be judging figures the product does not draw. That is the exact defect
// this project has already shipped twice: a grid one tier too dark, and a
// specimen sheet that differed from the shipped sheet in twenty selectors.
// A review surface that lies is worse than no review surface.
//
// HOW IT IS GATED
// ---------------
// It installs only when the page calls install(), and exams.html calls it at
// the same point it turns on the calculator's reviewer mode: after RLS has
// answered with a non-empty exam library. That is the database's verdict on who
// is looking, not the page's own role read. Nothing here is reachable from
// mock-exam.html or any student surface, because nothing else calls install().
(function (root) {
  'use strict';

  var STYLE_ID = 'si-rv-style';
  var installed = false, current = 'paper', bar = null;

  /* THE FOUR CANDIDATES, from scripts/build-stimulus-plates.py, verbatim.
   *
   * `theme` is which of the product's OWN palettes the surface belongs to —
   * light or dark — so the ink, the rules and the figure grammar all come from
   * the shipped stylesheet exactly as they would for a student on that theme.
   * `plate` is the one value that differs from it, and `page` is the ground
   * behind the card, kept a step away from the plate so the card still reads as
   * a card. Paper is the product's light surface unchanged, which is why its
   * plate is the same #ffffff exam-surface.css already sets. */
  var SURFACES = [
    { id: 'paper',  label: 'Paper',    theme: 'light', plate: '#ffffff', page: '#eef1f5',
      note: 'The literal reference. Maximum emitted light.' },
    { id: 'soft',   label: 'Softened', theme: 'light', plate: '#f4f6f9', page: '#e5e9ef',
      note: 'Same contrast, less light. The tuned light surface.' },
    { id: 'lifted', label: 'Lifted',   theme: 'dark',  plate: '#1b2333', page: '#111725',
      note: 'Dark without near-black halation. The tuned dark surface.' },
    { id: 'night',  label: 'Night',    theme: 'dark',  plate: '#0c1428', page: '#070c18',
      note: "The product's own card. Least emitted light." },
  ];

  var CSS = [
    '.rv-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;',
    '  max-width:780px;margin:14px auto -6px;padding:6px 10px;',
    '  border:1px dashed var(--rule);border-radius:5px;background:var(--exam);',
    '  font:600 11.5px/1 var(--font-display,system-ui);color:var(--ink-3)}',
    /* A DASHED BORDER AND A LABEL, because a control a student must never see
       should not look like one of theirs. The exam's own actions are solid and
       filled; this is deliberately not. */
    '.rv-tag{font-family:var(--font-mono,ui-monospace,monospace);font-size:9.5px;',
    '  letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);',
    '  border:1px solid var(--rule);border-radius:3px;padding:3px 6px}',
    '.rv-set{display:flex;gap:4px}',
    '.rv-b{font:inherit;font-size:11.5px;padding:5px 10px;border-radius:4px;cursor:pointer;',
    '  border:1px solid var(--rule);background:transparent;color:var(--ink-2)}',
    '.rv-b:hover{border-color:var(--ink-3);color:var(--ink)}',
    '.rv-b[aria-pressed="true"]{background:var(--cyan-soft);border-color:var(--cyan-line);',
    '  color:var(--cyan)}',
    '.rv-b:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}',
    '.rv-sp{flex:1}',
    '.rv-out{font-weight:500;font-size:11.5px;color:var(--ink-2);max-width:100%}',
    '.rv-out b{font-weight:700}',
    '.rv-bad{color:var(--low)}',
    '.rv-ok{color:var(--good)}',
    /* What a notation failure looks like ON the card, so the reviewer sees the
       item rather than a count. Outline, never a background: a fill would sit
       under the maths it is pointing at. */
    '.rv-flag{outline:2px solid var(--low);outline-offset:3px;border-radius:3px}',
  ].join('');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* The surface is applied as an INLINE override on <html>, over the theme the
   * stylesheet already resolves. Two properties, both surface: everything else
   * — ink, rules, the whole figure grammar — follows from data-theme, which is
   * the shipped mechanism and not a copy of it. */
  function applySurface(id) {
    var s = null;
    for (var i = 0; i < SURFACES.length; i++) if (SURFACES[i].id === id) s = SURFACES[i];
    if (!s) return;
    current = id;
    var r = document.documentElement;
    r.setAttribute('data-theme', s.theme);
    r.style.setProperty('--exam', s.plate);
    r.style.setProperty('--page', s.page);
    if (bar) {
      var bs = bar.querySelectorAll('[data-rv-surface]');
      for (var j = 0; j < bs.length; j++)
        bs[j].setAttribute('aria-pressed', String(bs[j].getAttribute('data-rv-surface') === id));
    }
  }

  /* NOTATION CHECK — did the mathematics typeset?
   *
   * Item text is authored with $…$ and KaTeX renders it after insertion. When
   * that does not happen — the CDN blocked, a malformed expression, a render
   * that ran before the node was in the document — the page shows the SOURCE,
   * dollar signs and all, and it is easy to read past. So the check looks for
   * exactly the two ways it fails: source text still visible, and KaTeX's own
   * error nodes. It reports on the question in front of the reviewer, because
   * that is the one whose figure and choices they are already looking at.
   */
  function notationCheck() {
    var card = document.querySelector('.ex-card');
    var out = bar && bar.querySelector('[data-rv-out]');
    var say = function (cls, html) { if (out) { out.className = 'rv-out ' + cls; out.innerHTML = html; } };
    var old = document.querySelectorAll('.rv-flag');
    for (var i = 0; i < old.length; i++) old[i].classList.remove('rv-flag');
    if (!card) return say('', 'No question on screen.');

    var loaded = !!root.katex;
    var raw = [], errs = card.querySelectorAll('.katex-error');
    // Walk TEXT NODES, not innerHTML: rendered maths leaves no dollar signs
    // behind, so anything still carrying a $…$ pair is source that never ran.
    var walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walk.nextNode())) {
      if (n.parentElement && n.parentElement.closest('.katex')) continue;
      if (/\$[^$]+\$/.test(n.nodeValue || '')) raw.push(n.parentElement);
    }
    for (var k = 0; k < raw.length; k++) if (raw[k]) raw[k].classList.add('rv-flag');
    for (var m = 0; m < errs.length; m++) errs[m].classList.add('rv-flag');

    var typeset = card.querySelectorAll('.katex').length;
    if (!loaded)
      return say('rv-bad', '<b>KaTeX did not load.</b> Any $…$ on this item is showing as source.');
    if (raw.length || errs.length)
      return say('rv-bad', '<b>' + (raw.length + errs.length) + ' not typeset</b> — outlined on the card. '
        + typeset + ' rendered.');
    return say('rv-ok', '<b>Notation OK</b> — ' + typeset + ' expression'
      + (typeset === 1 ? '' : 's') + ' typeset, no source left showing.');
  }

  function build() {
    injectStyle();
    var el = document.createElement('div');
    el.className = 'rv-bar';
    el.setAttribute('data-si-reviewer-bar', '');

    var tag = document.createElement('span');
    tag.className = 'rv-tag';
    tag.textContent = 'Reviewer';
    el.appendChild(tag);

    var set = document.createElement('span');
    set.className = 'rv-set';
    SURFACES.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'rv-b';
      b.setAttribute('data-rv-surface', s.id);
      b.setAttribute('aria-pressed', String(s.id === current));
      b.title = s.note + '  ' + s.plate;
      b.textContent = s.label;
      b.addEventListener('click', function () { applySurface(s.id); });
      set.appendChild(b);
    });
    el.appendChild(set);

    var nb = document.createElement('button');
    nb.type = 'button'; nb.className = 'rv-b';
    nb.textContent = 'Notation check';
    nb.addEventListener('click', notationCheck);
    el.appendChild(nb);

    var sp = document.createElement('span'); sp.className = 'rv-sp'; el.appendChild(sp);
    var out = document.createElement('span');
    out.className = 'rv-out'; out.setAttribute('data-rv-out', '');
    el.appendChild(out);
    return el;
  }

  /**
   * install()
   *
   * Idempotent, and called by the page only once RLS has served it an exam
   * library. The bar is placed ABOVE the exam shell and outside it, so the
   * card, the navigator and the timer keep their own layout and nothing in the
   * exam flow moves because a review control exists.
   */
  function install() {
    if (installed) return;
    installed = true;
    bar = build();
    var shell = document.querySelector('.ex-shell');
    if (shell && shell.parentNode) shell.parentNode.insertBefore(bar, shell);
    else document.body.insertBefore(bar, document.body.firstChild);
    applySurface(current);
  }

  root.SiExamReviewerBar = {
    install: install,
    surfaces: SURFACES,
    _apply: applySurface,
    _check: notationCheck,
    _reset: function () {
      installed = false;
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      bar = null; current = 'paper';
      var r = document.documentElement;
      r.removeAttribute('data-theme');
      r.style.removeProperty('--exam'); r.style.removeProperty('--page');
    },
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
