// Exam Workspace — the calculator panel, and the reason it knows no provider.
//
// WHAT THIS FILE IS FOR
// ---------------------
// One panel, opened beside the question a student is still on, into which
// whichever calculator provider is licensed gets mounted. It asks
// exam-calculator.js for the provider and reads its `status()`; it contains no
// branch on which provider that is.
//
// That is the whole point. If this file said `if (provider === 'desmos')`
// anywhere, the exam interface would be a Desmos interface, and swapping the
// provider would become a redesign instead of a configuration change. The
// invariant is checked rather than trusted: scripts/check-exam-ui.cjs compares
// the panel, header and mount rectangles across every provider state and
// diffs the chrome's markup between them.
//
// WHY THE PANEL AND NOT A NEW TAB
// -------------------------------
// exam-integrity.js records the exam tab being hidden or losing focus as an
// integrity event. Sending a student to a calculator in a second tab would fire
// an integrity event on every legitimate use of a permitted tool.
//
// THE FALLBACK IS OFFERED, NEVER TAKEN
// ------------------------------------
// When a provider fails to mount, this file says so and offers the first-party
// tool as a BUTTON. It never switches silently. A student mid-exam who reaches
// for a graphing calculator and is quietly handed a different one with different
// capabilities has been misled at the worst possible moment, and the exam's own
// record would say they used a tool they did not choose.
//
// WHAT IT DOES NOT DO
// -------------------
// It does not own exam state, does not time anything, and does not decide
// whether a calculator is allowed — that is the registry's calculator policy,
// read through SiExamCalculator.isInAppAvailable(). It renders a panel it was
// told to render.
(function (root) {
  'use strict';

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'cls') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function socket() {
    try { return root.SiExamCalculator || null; } catch (e) { return null; }
  }

  /**
   * Workspace({ providerId, fallbackId, title, mark, seed, dark })
   *
   *   providerId  which provider to mount, by the id it registered under
   *   fallbackId  offered by name when the primary fails; never taken silently
   *   title       what the student calls the tool. NOT the provider's name —
   *               "Graphing Calculator" is the job, and keeping the vendor out
   *               of the title is what stops the exam being redesigned around
   *               whoever is supplying it this month.
   *   mark        an element for our own identity in the header. It is placed
   *               in OUR chrome and never inside the provider's region: Desmos
   *               API Terms §5.b(iii) forbids obscuring their branding on the
   *               Software Service, and drawing a mascot over someone else's
   *               calculator would be poor manners even where it is permitted.
   *   modal       default TRUE: a dimming scrim covers the page and a click on
   *               it closes the panel.
   *
   * MODAL IS WRONG WHERE THERE IS A QUESTION BEHIND IT, and that is not a taste
   * decision. On mock-exam.html there is nothing behind the panel but a clock,
   * so a scrim costs nothing. On a page delivering questions it costs
   * everything: a student cannot read the stem, pick an option or type a
   * grid-in answer while a scrim swallows the clicks — which is most of what a
   * calculator is FOR. It was found by driving the exam with the panel open and
   * being unable to press Next.
   *
   * The panel already said `aria-modal="false"`, so the scrim was also telling
   * assistive technology one thing and the pointer another. `modal: false`
   * makes the two agree: no scrim, no click-to-close, and the exam stays live
   * underneath.
   *
   * Either way the panel toggles `si-calc-panel-open` on <body> while it is
   * open, so a host page can make room for it without watching the panel.
   *
   * Returns { el, scrim, open, close, isOpen, setProvider, providerId, mountEl }.
   * `scrim` is null when modal is false — there is nothing to append.
   */
  function Workspace(opts) {
    opts = opts || {};
    var providerId = opts.providerId || null;
    var fallbackId = opts.fallbackId || null;
    var title = opts.title || 'Graphing Calculator';
    var seed = opts.seed;

    var modal = opts.modal !== false;
    var scrim = modal ? el('div', { cls: 'xw-scrim' }) : null;
    // An optional line above the title, for the host product's own voice. It is
    // static — it never varies with the provider — so it cannot make the header
    // change height when the provider does.
    var eyebrowEl = opts.eyebrow ? el('span', { cls: 'xw-eyebrow', text: opts.eyebrow }) : null;
    var titleEl = el('h2', { id: 'xw-title', text: title });
    var subEl = el('p', { cls: 'xw-sub' });
    var closeBtn = el('button', { cls: 'xw-close', type: 'button', text: 'Close' });
    var head = el('div', { cls: 'xw-head' }, [
      opts.mark || null,
      el('div', {}, [eyebrowEl, titleEl, subEl]),
      closeBtn,
    ]);
    var mountEl = el('div', { cls: 'xw-mount' });
    var panel = el('aside', {
      cls: 'xw-panel', role: 'dialog', 'aria-modal': 'false',
      'aria-labelledby': 'xw-title',
    }, [head, el('div', { cls: 'xw-body' }, [mountEl])]);

    var active = null, open = false;

    function providerOf(id) {
      var s = socket();
      return (s && s.getProvider(id)) || null;
    }

    function clear() {
      if (active && active.unmount) { try { active.unmount(); } catch (e) {} }
      active = null;
      mountEl.textContent = '';
    }

    // ── the three things that can appear in the mount region ─────────────────
    //
    // None of them is styled per-provider. A gate looks the same whichever
    // provider is gated, which is what makes the panel's shape a constant.

    function card(cls, kids) { return el('div', { cls: cls }, kids); }

    function gateCard(st, prov) {
      return card('xw-gate', [
        el('span', { cls: 'xw-state', text: st.state }),
        el('h3', { text: prov.displayName + ' is not active' }),
        el('p', { text: st.detail }),
      ]);
    }

    // A reason that comes from BEFORE any provider is consulted — the student is
    // signed out, the configuration could not be fetched. Rendered in the same
    // card as a provider's own gate, because to a student the distinction
    // between "we could not get the key" and "the key is not set" is noise.
    function messageCard(state, text) {
      return card('xw-gate', [
        el('span', { cls: 'xw-state', text: state }),
        el('h3', { text: 'The calculator is not available' }),
        el('p', { text: text }),
      ]);
    }

    function errorCard(message) {
      var kids = [
        el('span', { cls: 'xw-state xw-bad', text: 'unavailable' }),
        el('h3', { text: 'The calculator did not open' }),
        el('p', { text: message }),
      ];
      // The fallback is a button, not a redirect. See the header note.
      var fb = fallbackId && providerOf(fallbackId);
      if (fb && fb.status && fb.status().ready) {
        kids.push(el('p', { cls: 'xw-fb-note',
          text: 'You can carry on with the built-in tool. It is not the same '
              + 'calculator, so switch only if you want to.' }));
        var b = el('button', { cls: 'xw-fb', type: 'button',
          text: 'Use ' + fb.displayName + ' instead' });
        b.addEventListener('click', function () { setProvider(fallbackId); });
        kids.push(b);
      }
      return card('xw-err', kids);
    }

    function render() {
      clear();
      var prov = providerOf(providerId);
      if (!prov) {
        subEl.textContent = '';
        mountEl.appendChild(errorCard('No calculator is configured for this exam.'));
        return;
      }
      var st = prov.status ? prov.status() : { ready: true, state: 'ready', detail: '' };
      // The subtitle is where the provider IS named, which is exactly what
      // Desmos API Terms §6.b licenses the Marks for: identifying the tool
      // inside the application. The name is emphasised rather than buried:
      // the header above it carries OUR brand, and the calculator below is
      // theirs, so the attribution has to carry its own weight. It stays one
      // line by construction — a wrapping subtitle would grow the header and
      // move the calculator region, and the panel's shape must not depend on
      // which provider is active.
      subEl.textContent = '';
      if (st.ready) {
        subEl.appendChild(el('b', { text: prov.displayName }));
        var tier = String(st.state || '').replace(/^(trial|commercial)$/, '$1 tier');
        if (tier) subEl.appendChild(document.createTextNode(' \u00b7 ' + tier));
      }
      if (!st.ready) { mountEl.appendChild(gateCard(st, prov)); return; }
      active = prov;
      var p;
      try { p = prov.mount(mountEl, { seed: seed, dark: !!opts.dark }); }
      catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).catch(function (e) {
        active = null;
        mountEl.textContent = '';
        mountEl.appendChild(errorCard((e && e.message) || 'It could not be loaded.'));
      });
    }

    function setOpen(v) {
      open = !!v;
      panel.classList.toggle('is-open', open);
      if (scrim) scrim.classList.toggle('is-open', open);
      // The one signal a host page needs. It is set in BOTH modes: a modal host
      // may want it too, and a class that appears only sometimes is a class
      // nobody can rely on.
      if (document.body) document.body.classList.toggle('si-calc-panel-open', open);
      if (open) render();
      else clear();
    }

    function setProvider(id) {
      providerId = id;
      if (open) render();
    }

    closeBtn.addEventListener('click', function () { setOpen(false); });
    if (scrim) scrim.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) setOpen(false);
    });

    return {
      el: panel,
      scrim: scrim,
      mountEl: mountEl,
      open: function () { setOpen(true); },
      /**
       * Replace the mount region with a plain explanation, for a reason that
       * arises before a provider is asked — nobody is signed in, the config
       * request failed. It unmounts whatever was there first, so it cannot
       * leave a half-mounted provider behind it.
       */
      showMessage: function (state, text) {
        clear();
        mountEl.appendChild(messageCard(state || 'unavailable', text || ''));
      },
      close: function () { setOpen(false); },
      isOpen: function () { return open; },
      setProvider: setProvider,
      providerId: function () { return providerId; },
      // Test seam: re-render without reopening.
      _render: render,
    };
  }

  root.SiExamWorkspace = { Workspace: Workspace };
}(typeof globalThis !== 'undefined' ? globalThis : this));
