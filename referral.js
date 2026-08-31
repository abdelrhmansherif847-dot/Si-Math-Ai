/* ===========================================================================
 * referral.js — student-side referral capture
 * ===========================================================================
 * A teacher shares https://www.si-math-ai.com/?ref=THEIRCODE. This file is the
 * only thing that turns that click into an attribution, and it is deliberately
 * the smallest possible amount of client code to do it.
 *
 * TWO HALVES, AND ONLY THE SECOND ONE NEEDS ANYTHING
 * --------------------------------------------------
 *   capture()  reads ?ref= into localStorage. No client, no session, no
 *              network. Safe on a marketing page that has no database at all.
 *   redeem()   offers that code to attribute_referral() the first time the
 *              page loads with a signed-in session.
 *
 * They are separate because a student who clicks a referral link is almost
 * never signed in yet, and after signUp() Supabase requires an email
 * confirmation — so there is NO session at registration and nothing can be
 * attributed there. The first session appears at login, which is why redeem()
 * runs on page load rather than being wired into a form.
 *
 * localStorage IS NOT THE ATTRIBUTION
 * -----------------------------------
 * It carries a PENDING INTENT between the click and the first sign-in, and
 * nothing more. The attribution itself is a row in referral_attributions,
 * written by a SECURITY DEFINER function, and every rule about it — last touch
 * while unpaid, permanently locked by the first purchase, never overwritten —
 * is enforced there. Clearing this storage loses a click; it can never lose or
 * change an attribution that already exists.
 *
 * A STUDENT CANNOT NAME A TEACHER
 * -------------------------------
 * attribute_referral(p_code, p_source) takes a CODE and nothing else. The
 * teacher is resolved from referral_codes server-side and the student is
 * auth.uid(). There is no user id in the signature to forge — not by
 * convention, but because the parameter does not exist.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 * ---------------------------------------
 * It shows the student nothing. Referral mechanics are the teacher's business
 * and the platform's; a student clicked a link to look at a maths tutor. It
 * also never attributes anybody for joining a classroom — that is a different
 * act with a different meaning, and conflating them is the one thing the whole
 * design refuses.
 * ===========================================================================*/
(function () {
  'use strict';

  var PARAM = 'ref';
  var KEY   = 'si_ref';
  var SUPA_URL = 'https://igvkyxkmjnkzscqgommj.supabase.co';
  var SUPA_KEY = 'sb_publishable_MTRD_njnCX-1CobeqTIMiw_QhNYarXp';

  /* Same shape the codes are generated in (workspace_new_code): 8 characters
     from an unambiguous alphabet. Normalising here means a link that picked up
     a stray dash, a trailing slash or the wrong case still works, and it means
     nothing but code-shaped text is ever stored or sent. */
  function normalise(raw) {
    return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  }

  function readPending() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      return v && typeof v.code === 'string' && v.code ? v.code : null;
    } catch (_) { return null; }
  }
  function clearPending() { try { localStorage.removeItem(KEY); } catch (_) {} }

  function capture() {
    var code = '';
    try { code = normalise(new URLSearchParams(location.search).get(PARAM)); } catch (_) { return; }
    if (!code) return;

    /* LAST TOUCH: a newer code replaces an older pending one, because the
       teacher who walked the student to the point of signing up is the one who
       converted them. This only decides which code we OFFER — the database
       decides whether it may be taken, and refuses once the student has paid. */
    try { localStorage.setItem(KEY, JSON.stringify({ code: code, at: Date.now() })); } catch (_) {}

    /* Strip it from the address bar. A code left in the URL gets bookmarked,
       screenshotted and pasted into a group chat by a student who was never
       asked to distribute it — which would credit their teacher for people
       that teacher never spoke to. */
    try {
      var u = new URL(location.href);
      if (u.searchParams.has(PARAM)) {
        u.searchParams.delete(PARAM);
        history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
      }
    } catch (_) {}
  }

  function waitForLib(ms) {
    return new Promise(function (resolve) {
      if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
      var waited = 0;
      var t = setInterval(function () {
        if (window.supabase && window.supabase.createClient) { clearInterval(t); return resolve(window.supabase); }
        waited += 100;
        if (waited >= ms) { clearInterval(t); resolve(null); }
      }, 100);
    });
  }

  async function redeem() {
    var code = readPending();
    if (!code) return;

    /* Shorter than nav.js's 7s on purpose. nav.js cannot draw its navigation
       without a client, so waiting is the whole job; here, giving up costs
       nothing at all — the pending code is still there on the next page. A
       page that never loads the library would otherwise keep a polling timer
       alive for seven seconds on every single load. */
    var lib = await waitForLib(3000);
    if (!lib) return;                       // no library on this page: try the next one
    var sb = lib.createClient(SUPA_URL, SUPA_KEY);

    var session = null;
    try {
      var r = await sb.auth.getSession();
      session = r && r.data && r.data.session;
    } catch (_) { return; }
    if (!session) return;                   // not signed in yet — the code waits

    var res;
    try { res = await sb.rpc('attribute_referral', { p_code: code, p_source: 'signup_link' }); }
    catch (_) { return; }                   // transport failure: keep it, retry next load

    /* A transport error keeps the pending code so the next page load tries
       again. ANY answer from the database is final — bound, or a reason it can
       never be bound (the code is unknown, it is the student's own, or they
       have already paid and are locked to somebody). Retrying those forever
       would mean an RPC on every page load for the life of the account. */
    if (res && res.error) return;
    clearPending();
  }

  /* redeem is passed directly rather than wrapped in a thunk: the browser
     ignores what a listener returns, but handing over the function itself
     means the promise is reachable, which is what lets the suite await the
     real listener instead of guessing at a delay. */
  capture();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', redeem);
  } else {
    redeem();
  }

  /* Exposed for the test suite, which executes this file rather than a
     paraphrase of it. Nothing in the product calls these. */
  window.SiReferral = { capture: capture, redeem: redeem, normalise: normalise,
                        readPending: readPending, clearPending: clearPending, KEY: KEY };
}());
