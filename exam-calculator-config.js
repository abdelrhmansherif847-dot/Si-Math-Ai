// Fetch the calculator's configuration, on demand and with the student's session.
//
// WHY A FETCH AND NOT A SCRIPT TAG
// --------------------------------
// This used to be `<script src="/api/desmos-config">` in the exam page, which
// meant two things that turned out to matter:
//
//   1. A plain script tag cannot send an Authorization header, so the endpoint
//      had to answer anyone who asked — including the open internet.
//   2. It ran on every exam page load, so the key was fetched even by students
//      who never opened the calculator.
//
// Fetching it here fixes both: the request carries the Supabase access token,
// and it happens the first time someone actually opens the calculator.
//
// WHAT THIS DOES NOT ACHIEVE, AND CANNOT
// --------------------------------------
// The key still reaches the browser. It has to: the Desmos API script is loaded
// by the browser with the key in its URL. This narrows WHO can obtain the key
// (signed-in users of this site, rather than anybody) and WHEN (on use, rather
// than on page load). It does not, and cannot, keep the key off the client while
// still using the official client-side API. See desmos-integration.md §9.
(function (root) {
  'use strict';

  var ENDPOINT = '/api/desmos-config';
  var pending = null;
  var loaded = false;

  function token(sb) {
    // The caller passes its own Supabase client; this module creates none. The
    // exam page already has one, and a second client would mean a second
    // session store and a second place for auth to be subtly wrong.
    try {
      if (!sb || !sb.auth || !sb.auth.getSession) return Promise.resolve(null);
      return sb.auth.getSession().then(function (r) {
        return (r && r.data && r.data.session && r.data.session.access_token) || null;
      }, function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  /**
   * load(sb) → Promise<{ok, state, note}>
   *
   * Assigns globalThis.SI_DESMOS_CONFIG and resolves with what happened. It
   * never rejects: a calculator that cannot be configured is a calculator that
   * reports why, and the workspace already has a card for every reason.
   *
   * Called more than once, it does the work once. The exam panel opens and
   * closes repeatedly and must not re-request a credential each time.
   */
  function load(sb) {
    if (loaded) return Promise.resolve({ ok: true, state: 'cached', note: '' });
    if (pending) return pending;
    pending = token(sb).then(function (tok) {
      if (!tok) return { ok: false, state: 'signed-out',
        note: 'You need to be signed in to use the calculator.' };
      return fetch(ENDPOINT, {
        headers: { Authorization: 'Bearer ' + tok },
        cache: 'no-store',
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (r.status === 401) {
            return { ok: false, state: 'signed-out',
              note: (body && body.note) || 'Sign in to use the calculator.' };
          }
          if (!r.ok) {
            return { ok: false, state: 'unavailable',
              note: 'The calculator configuration could not be loaded.' };
          }
          var cfg = (body && body.config) || {};
          root.SI_DESMOS_CONFIG = cfg;
          loaded = true;
          // An empty object is a legitimate answer — the environment has no key
          // configured — and the provider's own 'no-key' state explains it.
          return { ok: true, state: cfg.apiKey ? 'configured' : 'unconfigured',
                   note: (body && body.note) || '' };
        });
      }, function () {
        return { ok: false, state: 'unavailable',
          note: 'The calculator configuration could not be reached.' };
      });
    }).then(function (out) {
      // Only a success is remembered. A network blip must not permanently
      // poison the calculator for the rest of the exam.
      if (!out.ok) pending = null;
      return out;
    });
    return pending;
  }

  root.SiExamCalculatorConfig = {
    ENDPOINT: ENDPOINT,
    load: load,
    isLoaded: function () { return loaded; },
    // Test seam only.
    _reset: function () { loaded = false; pending = null; delete root.SI_DESMOS_CONFIG; },
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
