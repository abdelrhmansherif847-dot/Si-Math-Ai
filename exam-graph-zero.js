// Zero Graph as a PROVIDER — the first-party option, on the same contract.
//
// It is registered exactly like the Desmos provider and mounts through the same
// interface, so the exam UI has no idea which one it is showing. That is what
// stops the interface being redesigned around whichever tool happens to be
// active this month, and it is why Zero Graph can be a fallback rather than a
// replacement decision.
(function (root) {
  'use strict';
  var host = null;

  // Zero Graph needs TWO things, and until 2026-08-27 it only checked one.
  //
  // It reported ready whenever exam-graph.js was present, but it also draws
  // through the figure renderer, and that renderer is not shipped on any page
  // yet — exam-stimulus.js is marked DRAFT — NOT WIRED and speaks an older
  // spec shape (opts.figures rather than spec.figures). So on the production
  // exam page this provider would have reported READY and then thrown on mount,
  // which is the worst of both: an offer that cannot be honoured.
  //
  // The check now names what is missing, and mock-exam.html passes no
  // fallbackId as a result — a fallback that cannot draw is not a fallback.
  function renderer() {
    try { return (root.SiExplore && root.SiExplore.renderForQuestion) ? root.SiExplore : null; }
    catch (e) { return null; }
  }

  function status() {
    if (!(root.SiExamGraph && root.SiExamGraph.compile)) {
      return { ready: false, state: 'missing', detail: 'exam-graph.js is not loaded.' };
    }
    if (!renderer()) {
      return { ready: false, state: 'no-renderer',
        detail: 'The figure renderer is not loaded on this page, so Zero Graph has ' +
                'nothing to draw with.' };
    }
    return { ready: true, state: 'first-party', detail: 'Zero Graph, built in.' };
  }

  function mount(elm, opts) {
    var st = status();
    if (!st.ready) return Promise.reject(new Error(st.detail));
    var G = root.SiExamGraph, R = renderer();
    host = elm;
    elm.textContent = '';
    var row = document.createElement('div'); row.className = 'zg-row';
    var input = document.createElement('input');
    input.className = 'zg-in'; input.spellcheck = false;
    input.value = (opts && opts.seed) || 'x^2 - 3';
    input.setAttribute('aria-label', 'Function of x to plot');
    var go = document.createElement('button');
    go.className = 'zg-plot'; go.type = 'button'; go.textContent = 'Plot';
    row.appendChild(input); row.appendChild(go);
    var err = document.createElement('div');
    var plate = document.createElement('div'); plate.className = 'zg-plate';
    elm.appendChild(row); elm.appendChild(err); elm.appendChild(plate);

    function draw() {
      err.textContent = ''; plate.textContent = '';
      try {
        var spec = G.toSpec([G.compile(input.value)], [-6, 6], [-6, 8], 140);
        if (!spec) throw new Error('Nothing lands inside the window');
        // the student's own sketch, through the exam's renderer, so it obeys
        // the same grammar as the question's figure
        plate.appendChild(R.renderForQuestion(
          { id: 'zg', reading: 'value' }, { id: 'zg', kind: 'plot', spec: spec }));
      } catch (e) {
        var d = document.createElement('div'); d.className = 'zg-err';
        d.textContent = e.message; err.appendChild(d);
      }
    }
    go.addEventListener('click', draw);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') draw(); });
    draw();
    return Promise.resolve({ redraw: draw, focus: function () { input.focus(); } });
  }

  function unmount() { if (host) host.textContent = ''; host = null; }

  root.SiExamGraphZero = {
    id: 'zero-graph', displayName: 'Zero Graph',
    status: status, mount: mount, unmount: unmount, _renderer: renderer,
  };
  try {
    if (root.SiExamCalculator && root.SiExamCalculator.registerProvider) {
      root.SiExamCalculator.registerProvider('zero-graph', root.SiExamGraphZero);
    }
  } catch (e) {}
}(typeof globalThis !== 'undefined' ? globalThis : this));
