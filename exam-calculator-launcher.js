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

  // What WE call our wrapper. The calculator inside it is Desmos's, and the
  // header names them directly beneath this. Keeping the two on separate lines
  // is what stops our branding reading as a claim over their product.
  //
  // ⛔ THIS NAME MAY NOT BE DERIVED FROM "DESMOS". Desmos API Terms §6.b:
  //
  //   "You will not challenge the validity of or attempt to register any of the
  //    Marks, nor will you adopt any derivative or confusingly similar names,
  //    brands or marks or create any COMBINATION MARKS with the Marks."
  //
  // "Zesmos" — Zero + De(smos) — was requested for this slot on 2026-08-29. It
  // is a combination mark with theirs, which is the case that sentence names
  // outright, so it is not implemented here. A blend reads as one product with
  // one owner, and the owner it implies is us; the calculator is theirs.
  //
  // The name is a placeholder chosen to be unmistakably ours and derived from
  // nothing: swapping it is this one line.
  var WRAPPER_NAME = 'Zero Graphing Studio';
  var WRAPPER_TAGLINE = 'Powered by Zero';

  // Zero, the established mascot: the 360x360 mentor artwork that already ships
  // inline in chat.html, extracted to a file so the exam can use it without
  // carrying a second copy of 32KB of base64. Not a new mascot — the same one.
  var ZERO_SRC = 'assets/zero-mentor.png';
  var ws = null, observer = null, opts = {};

  // ── the verification override ────────────────────────────────────────────
  //
  // Activation is circular: the calculator cannot be checked without being
  // shown, and must not be shown to students before it is checked. This renders
  // the control for whoever turns it on and changes nothing for anyone else.
  // It takes no second opinion on availability — whatever state the provider is
  // in, the workspace already has a card for it.
  //
  // IT STICKS FOR THE TAB. It used to read the query string and nothing else,
  // which made it evaporate on the first in-app navigation: signing in lands on
  // the dashboard, and the sidebar's link to the exam is a bare mock-exam.html.
  // The flag was gone before the exam even started, the button correctly did not
  // render, and that looked exactly like a broken deployment. It cost two
  // debugging cycles.
  //
  // sessionStorage rather than localStorage, deliberately: it dies with the tab,
  // so a mode meant for one verification session cannot quietly outlive it.
  // `?desmos-check=0` turns it off again.
  var CHECK_KEY = 'si-desmos-check';

  function store() {
    try { return root.sessionStorage; } catch (e) { return null; }
  }

  function checkMode() {
    try {
      var q = new URLSearchParams(root.location.search).get('desmos-check');
      var ss = store();
      if (q === '1') { if (ss) { try { ss.setItem(CHECK_KEY, '1'); } catch (e) {} } return true; }
      if (q === '0') { if (ss) { try { ss.removeItem(CHECK_KEY); } catch (e) {} } return false; }
      if (!ss) return false;
      try { return ss.getItem(CHECK_KEY) === '1'; } catch (e) { return false; }
    } catch (e) { return false; }
  }

  // The production rule, and the only one a student is ever subject to: the
  // exam's OWN policy names a provider and that provider is registered.
  function policyAllows(code) {
    try {
      var d = root.SiExamCalculator && root.SiExamCalculator.describe(code);
      return !!(d && d.inApp);
    } catch (e) { return false; }
  }

  // ── reviewer mode ─────────────────────────────────────────────────────────
  //
  // The same override as above, turned on by the PAGE rather than by typing a
  // query string. exams.html reviews DRAFT forms and is admin-only — the Spine
  // tables are RLS-gated to has_role_at_least('admin'), so a non-admin gets no
  // form and never reaches a question to put a calculator beside. On that page,
  // asking a reviewer to remember ?desmos-check=1 on every visit is friction
  // with no safety in it: the flag is already typeable by anyone signed in, so
  // enabling it for admins WIDENS NOTHING. It narrows the typing, not the gate.
  //
  // What it deliberately does not do: it does not consult the exam's policy,
  // does not name a provider, and does not touch desmos-commercial. Students
  // remain governed by policyAllows() alone — API Terms §3.a, which nothing
  // here can grant. This is §2.a internal evaluation and is labelled TEST on
  // the control like any other override.
  var reviewer = false;

  /**
   * setReviewer(on)
   *
   * Turn the control on for a reviewing admin. Called by the page AFTER its own
   * role read, because only the page knows who is looking. Re-scans, so it
   * works whether it is called before or after the slot appears.
   */
  function setReviewer(on) {
    reviewer = !!on;
    if (observer) scan();
  }

  function overridden() { return checkMode() || reviewer; }

  function available(code) {
    return policyAllows(code) || overridden();
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
    '.si-calc-open{transition:filter .16s ease,transform .12s ease,box-shadow .2s ease}',
    '.si-calc-open:hover{filter:brightness(1.08);',
    '  box-shadow:0 4px 16px -8px rgba(52,211,153,.9)}',
    '.si-calc-open:active{transform:translateY(1px);filter:brightness(.97)}',
    '.si-calc-open:focus-visible{outline:2px solid var(--green,#34d399);outline-offset:3px}',
    '.si-calc-open svg{width:14px;height:14px}',
    '.si-calc-test{font-family:ui-monospace,monospace;font-size:9.5px;font-weight:700;',
    '  letter-spacing:.09em;padding:2px 5px;border-radius:3px;margin-left:2px;',
    '  background:rgba(4,18,27,.22);color:inherit}',
    // ── the panel ─────────────────────────────────────────────────────────
    // visibility + opacity + transform rather than a display toggle, so the
    // panel animates in BOTH directions. Deliberately no scale and no width
    // change: Desmos measures the element it is handed, and a size that moves
    // mid-mount is a calculator that lays itself out against the wrong box.
    // Only opacity and X translation are animated, so the measured size is
    // constant from the first frame.
    '.xw-scrim{position:fixed;inset:0;z-index:120;opacity:0;visibility:hidden;',
    '  pointer-events:none;transition:opacity .28s ease,visibility 0s linear .28s;',
    '  background:radial-gradient(120% 80% at 70% 0%,rgba(6,26,34,.55),rgba(3,9,16,.80))}',
    '.xw-scrim.is-open{opacity:1;visibility:visible;pointer-events:auto;',
    '  transition:opacity .28s ease,visibility 0s}',
    '.xw-panel{position:fixed;right:0;top:0;bottom:0;width:min(660px,100%);z-index:130;',
    '  background:var(--bg-card,#0a1120);display:flex;flex-direction:column;font:inherit;',
    '  border-left:1px solid rgba(52,211,153,.16);',
    '  box-shadow:-32px 0 68px -34px rgba(0,0,0,.85);',
    '  opacity:0;visibility:hidden;pointer-events:none;transform:translateX(18px);',
    '  transition:opacity .30s ease,transform .34s cubic-bezier(.22,1,.36,1),',
    '    visibility 0s linear .34s}',
    '.xw-panel.is-open{opacity:1;visibility:visible;pointer-events:auto;',
    '  transform:none;transition:opacity .26s ease,',
    '    transform .38s cubic-bezier(.22,1,.36,1),visibility 0s}',

    // ── the header: our chrome, and the only place we brand ───────────────
    //
    // A quiet lift rather than a hero. The gradient runs a few percent lighter
    // at the top and settles into the panel; a single hairline of teal along
    // the bottom edge is the whole accent. Anything louder would compete with
    // the calculator, which is the thing the student is actually here for.
    '.xw-head{position:relative;display:flex;align-items:center;gap:15px;',
    '  padding:18px 20px 17px;min-height:86px;',
    '  background:linear-gradient(180deg,rgba(52,211,153,.055),rgba(52,211,153,0) 62%),',
    '    linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,0) 40%)}',
    // top highlight and bottom rule, drawn rather than bordered so neither
    // adds to the header's height and moves the calculator region.
    '.xw-head::before{content:"";position:absolute;left:0;right:0;top:0;height:1px;',
    '  background:linear-gradient(90deg,transparent,rgba(255,255,255,.16) 22%,',
    '    rgba(255,255,255,.16) 78%,transparent)}',
    '.xw-head::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;',
    '  background:linear-gradient(90deg,rgba(52,211,153,.42),rgba(56,189,248,.26) 46%,',
    '    transparent 88%)}',
    '.xw-head>div{min-width:0;flex:1}',
    '.xw-eyebrow{display:block;font-family:ui-monospace,monospace;font-size:9.5px;',
    '  font-weight:700;letter-spacing:.15em;text-transform:uppercase;',
    '  color:rgba(52,211,153,.92);margin:0 0 3px}',
    '.xw-head h2{margin:0;font-size:18px;font-weight:700;letter-spacing:-.014em;',
    '  color:var(--text,#e8eef7);text-wrap:balance}',

    // The branding arrives; the calculator does not. Each header element rises
    // a few pixels on a short stagger, and nothing inside .xw-mount is touched
    // — a moving container would make Desmos re-measure mid-layout.
    '@keyframes xw-rise{from{opacity:0;transform:translateY(7px)}',
    '  to{opacity:1;transform:none}}',
    '.xw-panel.is-open .xw-mark{animation:xw-rise .42s cubic-bezier(.22,1,.36,1) both}',
    '.xw-panel.is-open .xw-eyebrow{animation:xw-rise .42s cubic-bezier(.22,1,.36,1) .05s both}',
    '.xw-panel.is-open .xw-head h2{animation:xw-rise .42s cubic-bezier(.22,1,.36,1) .09s both}',
    '.xw-panel.is-open .xw-sub{animation:xw-rise .42s cubic-bezier(.22,1,.36,1) .14s both}',
    '.xw-panel.is-open .xw-close{animation:xw-rise .42s cubic-bezier(.22,1,.36,1) .18s both}',

    // ── the mascot ────────────────────────────────────────────────────────
    //
    // Zero as he is drawn everywhere else — the mentor artwork from chat.html,
    // not a glyph and not a new drawing. The glow is behind him and stops well
    // inside the tile, so it reads as depth rather than a sticker.
    '.xw-mark{position:relative;width:52px;height:52px;flex:none;border-radius:15px;',
    '  display:flex;align-items:center;justify-content:center;',
    '  background:linear-gradient(150deg,rgba(52,211,153,.16),rgba(56,189,248,.09) 70%);',
    '  border:1px solid rgba(52,211,153,.30);',
    '  box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 6px 18px -10px rgba(52,211,153,.55)}',
    '.xw-zero{display:block;width:44px;height:44px;object-fit:contain;position:relative;',
    '  z-index:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45));',
    '  transition:transform .32s cubic-bezier(.22,1,.36,1)}',
    // A slow breath behind him, not on him — the artwork never moves or blurs.
    '.xw-mark::after{content:"";position:absolute;inset:5px;border-radius:11px;',
    '  background:radial-gradient(60% 60% at 50% 55%,rgba(52,211,153,.34),transparent 72%);',
    '  opacity:.55;animation:xw-breathe 5.5s ease-in-out infinite}',
    '@keyframes xw-breathe{0%,100%{opacity:.38;transform:scale(.94)}',
    '  50%{opacity:.72;transform:scale(1.04)}}',
    '.xw-head:hover .xw-zero{transform:translateY(-1.5px) scale(1.04)}',

    // ── attribution ───────────────────────────────────────────────────────
    //
    // The subtitle is where the provider is named, and it is deliberately not
    // shrunk to a whisper: we have just put our own name on the header, and the
    // calculator below belongs to Desmos. API Terms §6.b licenses the mark for
    // exactly this — identifying the tool inside the product.
    '.xw-sub{margin:3px 0 0;font-size:12px;line-height:1.5;min-height:18px;',
    '  color:var(--text-dim,#8fa3bd);white-space:nowrap;overflow:hidden;',
    '  text-overflow:ellipsis;letter-spacing:.005em}',
    '.xw-sub b{font-weight:600;color:rgba(190,214,234,.96)}',

    // ── close ─────────────────────────────────────────────────────────────
    '.xw-close{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:7px;',
    '  background:rgba(255,255,255,.035);border:1px solid var(--border-soft,#1e2a3d);',
    '  border-radius:9px;padding:8px 13px;font:inherit;font-size:12.5px;font-weight:600;',
    '  color:var(--text-dim,#8fa3bd);cursor:pointer;transition:color .16s,border-color .16s,',
    '    background .16s}',
    '.xw-close:hover{color:var(--text,#e8eef7);border-color:rgba(52,211,153,.45);',
    '  background:rgba(52,211,153,.10)}',
    '.xw-close:focus-visible{outline:2px solid rgba(52,211,153,.75);outline-offset:2px}',
    '.xw-close:active{transform:translateY(1px);background:rgba(52,211,153,.16)}',

    // ── the calculator's own region ───────────────────────────────────────
    //
    // Nothing of ours is drawn inside it. The padding is the only thing that
    // changed here, and it exists so the calculator is not flush to the panel.
    '.xw-body{padding:16px 18px 18px;flex:1;display:flex;min-height:0;overflow-y:auto}',
    // `position:relative` is load-bearing, not decoration. Without it the mount
    // region establishes no containing block, so anything the PROVIDER positions
    // absolutely — a keypad overlay, a settings menu, an error toast — resolves
    // against the fixed panel instead and lands on top of our header, including
    // the Close button. Which is the one control a student needs when the thing
    // covering it has gone wrong. Found when a stub calculator did exactly that
    // and the flow check could not press Close.
    '.xw-mount{position:relative;flex:1;min-width:0;min-height:0;display:flex;',
    '  flex-direction:column;border-radius:10px;overflow:hidden}',

    // ── our cards, when there is no calculator to show ────────────────────
    '.xw-gate,.xw-err{border-radius:10px;padding:24px 26px;flex:0 0 auto;margin:auto 0;',
    '  display:flex;flex-direction:column;align-items:flex-start;',
    '  background:rgba(255,255,255,.02)}',
    '.xw-gate{border:1px dashed rgba(143,163,189,.42)}',
    '.xw-err{border:1px solid var(--border-soft,#1e2a3d);',
    '  border-left:3px solid var(--amber,#e0b062)}',
    '.xw-gate h3,.xw-err h3{margin:0 0 9px;font-size:15.5px;font-weight:700;',
    '  color:var(--text,#e8eef7)}',
    '.xw-gate p,.xw-err p{margin:0 0 11px;font-size:13.5px;line-height:1.62;',
    '  color:var(--text-dim,#8fa3bd);max-width:52ch}',
    '.xw-state{display:inline-block;font-family:ui-monospace,monospace;font-size:10.5px;',
    '  letter-spacing:.05em;padding:3px 9px;border-radius:5px;margin:0 0 11px;',
    '  background:rgba(52,211,153,.13);color:var(--green,#34d399)}',
    '.xw-state.xw-bad{background:var(--amber-soft,rgba(224,176,98,.14));',
    '  color:var(--amber,#e0b062)}',
    // Every animation above is decoration. None of it carries meaning, so all
    // of it goes when the viewer has asked for less — including the ambient
    // breath, which is the one thing that would otherwise never stop.
    '@media (prefers-reduced-motion:reduce){',
    '  .xw-panel,.xw-scrim,.xw-zero,.si-calc-open,.xw-close{transition:none!important}',
    '  .xw-panel.is-open .xw-mark,.xw-panel.is-open .xw-eyebrow,',
    '  .xw-panel.is-open .xw-head h2,.xw-panel.is-open .xw-sub,',
    '  .xw-panel.is-open .xw-close{animation:none!important}',
    '  .xw-mark::after{animation:none!important;opacity:.5}',
    '  .xw-head:hover .xw-zero{transform:none}',
    '}',
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

  // Set from the slot at fill() time. Modal-ness is a property of the PAGE —
  // whether there is anything to work with behind the panel — not of the click.
  var wantModal = true;

  function workspace() {
    if (ws) return ws;
    var W = root.SiExamWorkspace && root.SiExamWorkspace.Workspace;
    if (!W) return null;
    injectStyle();
    var mark = document.createElement('span');
    mark.className = 'xw-mark';
    mark.setAttribute('aria-hidden', 'true');
    var img = document.createElement('img');
    img.src = ZERO_SRC; img.alt = ''; img.width = 44; img.height = 44;
    img.className = 'xw-zero';
    mark.appendChild(img);
    ws = W({
      providerId: 'desmos',
      // Zero Graph draws through the figure renderer, so it is a fallback only
      // on a page that loads one. This used to be a flat null with a note
      // saying "pass it once the renderer ships" — the renderer has now shipped
      // and exams.html loads it, so the condition is asked instead of assumed.
      // On a page without it the provider reports 'no-renderer' and a fallback
      // that cannot draw is not a fallback.
      fallbackId: (root.SiExamStimulus && root.SiExamStimulus.renderForQuestion)
        ? 'zero-graph' : null,
      title: WRAPPER_NAME,
      eyebrow: WRAPPER_TAGLINE,
      mark: mark,
      modal: wantModal,
    });
    if (ws.scrim) document.body.appendChild(ws.scrim);
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
    // Whether the configuration was ALREADY here when the panel opened. The
    // config loader caches a success, so from the second open onwards it is —
    // and the panel was then rendering twice per open: once from open() with
    // the key already in hand, and again from the callback below. With the real
    // provider that is a calculator constructed, torn down and constructed
    // again on every open. Re-render only when the config actually arrived
    // after the panel was already showing something else.
    var hadConfig = !!root.SI_DESMOS_CONFIG;
    w.open();
    cfgLoad.then(function (r) {
      // A refusal is not an error path: the workspace's gate card explains
      // 'signed-out' the same way it explains 'no-key'.
      if (r && !r.ok && r.note) w.showMessage(r.state, r.note);
      else if (!hadConfig) w._render();
    });
  }

  function fill(slot) {
    // Read before the early return: the attribute has to be honoured on a slot
    // that is already filled, or a page whose first screen was modal would keep
    // that choice for the rest of the exam.
    wantModal = slot.getAttribute('data-si-calculator-modal') !== 'false';
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
    // When the control is only here because verification mode is on, SAY SO on
    // the control. Otherwise a tester cannot tell a real, policy-driven
    // calculator from one they switched on themselves — and that is exactly the
    // confusion this whole gate exists to prevent.
    if (overridden() && !policyAllows(code)) {
      var chip = document.createElement('span');
      chip.className = 'si-calc-test';
      chip.textContent = 'TEST';
      b.appendChild(chip);
    }
    b.addEventListener('click', open);
    slot.textContent = '';
    slot.appendChild(b);
  }

  function scan() {
    var slots = document.querySelectorAll(SLOT);
    // THE CALCULATOR BELONGS TO THE RUNNING EXAM. When the screen carrying the
    // slot is gone, so is the calculator — the exam ended, or a module boundary
    // was crossed.
    //
    // Without this the panel outlived the exam: open it during the timer, end
    // the exam, and the student landed on the Results screen with a calculator
    // panel and a dark scrim still over it. The panel is appended to <body> so
    // that it survives the page re-rendering its views, and that is exactly why
    // nothing was tearing it down. Reproduced in a browser before fixing.
    if (!slots.length) {
      if (ws && ws.isOpen()) ws.close();
      return;
    }
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
    setReviewer: setReviewer,
    open: open,
    isAvailable: available,
    _workspace: function () { return ws; },
    _reset: function () {
      reviewer = false;
      if (observer) { observer.disconnect(); observer = null; }
      if (ws) {
        try { ws.close(); } catch (e) {}
        ws.el.remove(); if (ws.scrim) ws.scrim.remove(); ws = null;
      }
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
