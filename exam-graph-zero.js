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

  function status() {
    var ok = !!(root.SiExamGraph && root.SiExamGraph.compile);
    return ok ? { ready: true, state: 'first-party', detail: 'Zero Graph, built in.' }
              : { ready: false, state: 'missing', detail: 'exam-graph.js is not loaded.' };
  }

  function mount(elm, opts) {
    var G = root.SiExamGraph;
    if (!G) return Promise.reject(new Error('exam-graph.js is not loaded.'));
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
        plate.appendChild(root.SiExplore.renderForQuestion(
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
    status: status, mount: mount, unmount: unmount,
  };
  try {
    if (root.SiExamCalculator && root.SiExamCalculator.registerProvider) {
      root.SiExamCalculator.registerProvider('zero-graph', root.SiExamGraphZero);
    }
  } catch (e) {}
}(typeof globalThis !== 'undefined' ? globalThis : this));
