// The calculator launcher — everything the exam page would otherwise have to know.
//
// WHY THIS FILE EXISTS
// --------------------
// mock-exam.html is a frozen file. Wiring the calculator into it originally
// meant ~60 lines of logic and ~40 lines of CSS inside that file: availability,
// the verification override, building the workspace, styling the panel. All of
// that is generic — none of it is about the mock exam specifically — and all of
// it belongs where it can be changed without unfreezing a page again.
//
// So the page's whole share of the calculator is now:
//
//   · five <script> tags, and
//   · one empty element carrying data-si-calculator-slot
//
// and that is the floor. A page cannot load modules it does not reference, and
// a module cannot know where in a layout a button belongs.
//
// HOW IT INSTALLS
// ---------------
// The exam page re-renders its screens by replacing innerHTML, so a button
// wired once is gone on the next render. Rather than ask the page to call us
// back — which would put logic in the page again — this watches the document
// for the slot appearing and fills it whenever it does.
//
// WHAT DECIDES WHETHER ANYTHING APPEARS
// -------------------------------------
// SiExamCalculator.describe(code).inApp, and nothing else. That is true only
// when the exam's OWN policy names a provider AND that provider is registered.
// Every exam is provider: null, so this renders nothing for every student today.
(function (root) {
  'use strict';

  var SLOT = '[data-si-calculator-slot]';
  var STYLE_ID = 'si-calc-style';
  var ws = null, observer = null, opts = {};

  // ── the verification override ────────────────────────────────────────────
  //
  // Activation is circular: the calculator cannot be checked without being
  // shown, and must not be shown to students before it is checked. This renders
  // the control for whoever types the flag and changes nothing for anyone else.
  // It takes no second opinion on availability — whatever state the provider is
  // in, the workspace already has a card for it.
  function checkMode() {
    try { return new URLSearchParams(root.location.search).get('desmos-check') === '1'; }
    catch (e) { return false; }
  }

  function available(code) {
    try {
      if (checkMode()) return true;
      return !!(root.SiExamCalculator && root.SiExamCalculator.describe(code)
                && root.SiExamCalculator.describe(code).inApp);
    } catch (e) { return false; }
  }

  // ── styles ───────────────────────────────────────────────────────────────
  //
  // Injected rather than written into the page, for the same reason the logic
  // is: a stylesheet in a frozen file is a stylesheet that needs an unfreeze to
  // fix. Everything here is keyed to this widget's own classes and reads the
  // host page's design tokens, so it inherits the surface it lands on rather
  // than imposing one. Nothing is keyed to WHICH provider is mounted — a
  // `.xw-panel--desmos` would be the bug this whole abstraction exists to stop.
  var CSS = [
    /* It sits beside the calculator-policy badge, which is a soft green pill.
       If the launcher were also a soft green pill a student could not tell
       which of the two does anything — so it is FILLED, which is what this
       page's other actions look like. Informational and interactive must not
       share a treatment when they share a row. */
    '.si-calc-open{display:inline-flex;align-items:center;gap:7px;margin-top:10px;',
    '  padding:8px 16px;border-radius:100px;background:var(--green,#34d399);',
    '  border:1px solid var(--green,#34d399);color:#04121b;',
    '  font:inherit;font-size:13px;font-weight:700;cursor:pointer}',
    '.si-calc-open:hover{filter:brightness(1.08)}',
    '.si-calc-open:focus-visible{outline:2px solid var(--green,#34d399);outline-offset:3px}',
    '.si-calc-open svg{width:14px;height:14px}',
    '.xw-scrim{display:none;position:fixed;inset:0;background:rgba(5,10,20,.72);z-index:120}',
    '.xw-scrim.is-open{display:block}',
    '.xw-panel{position:fixed;right:0;top:0;bottom:0;width:min(620px,100%);z-index:130;',
    '  background:var(--bg-card,#0a1120);border-left:1px solid var(--border-soft,#1e2a3d);',
    '  display:none;flex-direction:column;font:inherit}',
    '.xw-panel.is-open{display:flex}',
    /* Fixed band: the header's height must not depend on which provider is
       active, or the calculator region below it moves when it changes. */
    '.xw-head{display:flex;align-items:center;gap:12px;padding:16px 18px;min-height:76px;',
    '  border-bottom:1px solid var(--border-soft,#1e2a3d)}',
    '.xw-head>div{min-width:0;flex:1}',
    '.xw-head h2{margin:0;font-size:16px;font-weight:700;color:var(--text,#e8eef7)}',
    /* Reserves its line even when empty — a collapsing subtitle shrinks the
       header and moves the calculator region. */
    '.xw-sub{margin:2px 0 0;font-size:11.5px;line-height:1.6;min-height:18.4px;',
    '  color:var(--text-dim,#8fa3bd);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.xw-close{margin-left:auto;background:none;border:1px solid var(--border-soft,#1e2a3d);',
    '  border-radius:6px;padding:6px 12px;font:inherit;font-size:12.5px;',
    '  color:var(--text-dim,#8fa3bd);cursor:pointer}',
    '.xw-close:hover{color:var(--text,#e8eef7)}',
    '.xw-close:focus-visible{outline:2px solid var(--text,#e8eef7);outline-offset:2px}',
    '.xw-body{padding:16px 18px;flex:1;display:flex;min-height:0;overflow-y:auto}',
    /* A stage of fixed size. Desmos.GraphingCalculator() measures the element it
       is given: an auto-height container mounts a calculator with no height. */
    '.xw-mount{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}',
    '.xw-gate,.xw-err{border-radius:8px;padding:22px 24px;flex:0 0 auto;margin:auto 0;',
    '  display:flex;flex-direction:column;align-items:flex-start}',
    '.xw-gate{border:1px dashed var(--border-soft,#1e2a3d)}',
    /* Told, not shouted: a student mid-exam has a clock running. */
    '.xw-err{border:1px solid var(--border-soft,#1e2a3d);border-left:3px solid var(--amber,#e0b062)}',
    '.xw-gate h3,.xw-err h3{margin:0 0 8px;font-size:15px;color:var(--text,#e8eef7)}',
    '.xw-gate p,.xw-err p{margin:0 0 10px;font-size:13.5px;line-height:1.6;',
    '  color:var(--text-dim,#8fa3bd);max-width:52ch}',
    '.xw-state{display:inline-block;font-family:ui-monospace,monospace;font-size:10.5px;',
    '  padding:3px 8px;border-radius:4px;margin:0 0 10px;',
    '  background:var(--green-soft,rgba(52,211,153,.12));color:var(--green,#34d399)}',
    '.xw-state.xw-bad{background:var(--amber-soft,rgba(224,176,98,.14));color:var(--amber,#e0b062)}',
    /* Zero, in the treatment this site already uses — the dragon glyph in a
       tinted tile. He sits in OUR header and never over the calculator: Desmos
       API Terms §5.b(iii) forbids obscuring their branding on the Software
       Service, and drawing a mascot over someone else's calculator would be
       poor manners even where it is permitted. */
    '.xw-mark{width:38px;height:38px;flex:none;border-radius:11px;font-size:20px;',
    '  display:flex;align-items:center;justify-content:center;',
    '  background:linear-gradient(135deg,rgba(56,189,248,.2),rgba(14,165,233,.1));',
    '  border:1.5px solid rgba(56,189,248,.4)}',
  ].join('\n');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/>'
    + '<line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>';

  function workspace() {
    if (ws) return ws;
    var W = root.SiExamWorkspace && root.SiExamWorkspace.Workspace;
    if (!W) return null;
    var mark = document.createElement('span');
    mark.className = 'xw-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '\u{1F409}';
    ws = W({
      providerId: 'desmos',
      // NO fallbackId. Zero Graph draws through the figure renderer, which no
      // shipped page loads, so it reports 'no-renderer' here — and a fallback
      // that cannot draw is not a fallback. Pass it once the renderer ships.
      fallbackId: null,
      title: 'Graphing Calculator',
      mark: mark,
    });
    document.body.appendChild(ws.scrim);
    document.body.appendChild(ws.el);
    return ws;
  }

  function open() {
    var w = workspace();
    if (!w) return;
    // The configuration is fetched HERE — on use, with the student's session,
    // once per page. Before this, it was a script tag on every exam page load,
    // answerable by anyone.
    var cfgLoad = root.SiExamCalculatorConfig
      ? root.SiExamCalculatorConfig.load(opts.supabase || root.SI_EXAM_SUPABASE)
      : Promise.resolve({ ok: true });
    w.open();
    cfgLoad.then(function (r) {
      // Re-render whatever the config turned out to be. A refusal is not an
      // error path: the workspace's gate card explains 'signed-out' the same
      // way it explains 'no-key'.
      if (r && !r.ok && r.note) w.showMessage(r.state, r.note);
      else w._render();
    });
  }

  function fill(slot) {
    if (slot.querySelector('.si-calc-open')) return;
    var code = slot.getAttribute('data-si-calculator-slot') || '';
    if (!available(code)) { slot.textContent = ''; return; }
    injectStyle();
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'si-calc-open';
    b.setAttribute('data-si-calculator-open', '');
    b.innerHTML = ICON;
    b.appendChild(document.createTextNode('Graphing Calculator'));
    b.addEventListener('click', open);
    slot.textContent = '';
    slot.appendChild(b);
  }

  function scan() {
    var slots = document.querySelectorAll(SLOT);
    for (var i = 0; i < slots.length; i++) fill(slots[i]);
  }

  /**
   * install({ supabase })
   *
   * Idempotent. Watches for the slot and fills it whenever the host page
   * re-renders. The Supabase client is passed in rather than constructed —
   * a second client would mean a second session store.
   */
  function install(options) {
    opts = options || {};
    if (observer) { scan(); return; }
    scan();
    observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  root.SiExamCalculatorLauncher = {
    install: install,
    open: open,
    isAvailable: available,
    _workspace: function () { return ws; },
    _reset: function () {
      if (observer) { observer.disconnect(); observer = null; }
      if (ws) { try { ws.close(); } catch (e) {} ws.el.remove(); ws.scrim.remove(); ws = null; }
    },
  };

  // Self-install once the document is ready, so a page needs no call at all.
  //
  // The Supabase client is read from globalThis.SI_EXAM_SUPABASE, which the
  // host page assigns. That is a deliberate handoff rather than install() being
  // called, because this module is deferred and the page's inline script runs
  // first — an install() call there would run before this file existed. It is
  // the same integration shape as SI_DESMOS_CONFIG: one documented global, and
  // no ordering to get wrong. install({supabase}) still works for a page that
  // loads this module first.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { install(opts); });
  } else {
    install(opts);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
