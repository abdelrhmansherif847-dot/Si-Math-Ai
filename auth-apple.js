/**
 * auth-apple.js — Sign in with Apple, single authored source.
 *
 * Loaded by login.html and signup.html. Environment-agnostic UMD in the same
 * idiom as taxonomy.core.js: attaches `SiAuthApple` to the global object in the
 * browser, exports via module.exports under Node so tests/apple-signin.test.mjs
 * exercises these exact bytes rather than a paraphrase of them.
 *
 * ── WHY A SEPARATE FILE ──────────────────────────────────────────────────────
 * The rules here (which redirect URL is legal, what a private-relay address
 * means, which errors are the student's fault and which are ours) have to be
 * identical on the login page and the signup page. Two inline copies would
 * drift the first time one of them was edited.
 *
 * ── THE FLAG ─────────────────────────────────────────────────────────────────
 * ENABLED is false. While it is false this module renders nothing, and the two
 * pages look and behave exactly as they do today. Flip it to true ONLY after
 * every item in docs/engineering/apple-signin-audit.md §5 is done — Apple
 * Developer, the Supabase Apple provider, and the redirect allow list. A button
 * shipped before the provider exists sends students to a Supabase error page
 * reading "Unsupported provider: provider is not enabled", which is a worse
 * login experience than the one we are fixing.
 *
 * ── WHY signInWithOAuth AND NOT SIGN IN WITH APPLE JS ────────────────────────
 * vercel.json sets `frame-src 'none'`. Sign in with Apple JS renders Apple's
 * consent screen in an iframe (or a popup that then frames it), so the CSP kills
 * it outright. signInWithOAuth is a top-level navigation, which no CSP directive
 * in vercel.json restricts. This is a constraint of this repo, not a preference.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SiAuthApple = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Flip to true only when Apple + Supabase config is live. See header. */
  var ENABLED = false;

  /**
   * Where Apple sends the student back to. Hardcoded to production for the same
   * reason emailRedirectTo already is in login.html and signup.html: this exact
   * string must appear in the Supabase redirect allow list, and deriving it from
   * window.location.origin would silently produce a URL that is not on the list
   * (every Vercel preview deploy has a different hostname) and fail the sign-in
   * with `redirect_to is not allowed`. Localhost is the one exception, so the
   * flow can be exercised locally once http://localhost:*  is allow-listed too.
   */
  var PRODUCTION_ORIGIN = 'https://www.si-math-ai.com';

  /** Apple's Hide My Email domain. See isPrivateRelayEmail. */
  var PRIVATE_RELAY_DOMAIN = 'privaterelay.appleid.com';

  function originFor(loc) {
    if (loc && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(loc.origin || '')) {
      return loc.origin;
    }
    return PRODUCTION_ORIGIN;
  }

  /** Absolute return URL for a page, e.g. redirectTarget('login.html'). */
  function redirectTarget(page, loc) {
    return originFor(loc) + '/' + String(page || '').replace(/^\/+/, '');
  }

  /**
   * True for an address Apple minted to hide the student's real one.
   *
   * This is the single most important predicate in this file. Supabase links an
   * Apple identity to an existing account by matching the email Apple reports
   * against auth.users.email. When the student picks "Hide My Email" the address
   * Apple reports is a per-app relay that matches nothing, so Supabase correctly
   * concludes this is a new person and creates a NEW user id — a second account,
   * with none of the first one's credits, chat history, question records,
   * weakness reports or focus plans. Detecting it is what lets us stop and ask
   * instead of forking the account silently.
   */
  function isPrivateRelayEmail(email) {
    if (!email || typeof email !== 'string') return false;
    var at = email.lastIndexOf('@');
    if (at < 0) return false;
    return email.slice(at + 1).toLowerCase() === PRIVATE_RELAY_DOMAIN;
  }

  /**
   * True when this signed-in user arrived through Apple with a hidden address
   * AND has nothing in their account yet — the only state in which a silent
   * fork is both possible and still cheap to undo. A student who has already
   * done work under this Apple identity is not at risk from it; interrupting
   * them on every login would be noise.
   */
  function needsRelayLinkCheck(user, profile) {
    if (!user || !isPrivateRelayEmail(user.email)) return false;
    var ids = Array.isArray(user.identities) ? user.identities : [];
    var viaApple = ids.some(function (i) { return i && i.provider === 'apple'; });
    if (!viaApple) return false;
    return !(profile && profile.onboarding_completed === true);
  }

  /**
   * Supabase reports OAuth failures by redirecting back with the error in the
   * query string (PKCE) or the fragment (implicit). Which one this project uses
   * depends on the supabase-js default for 2.110.8, so read BOTH rather than
   * guessing: a missed error is a student staring at a login page that silently
   * did nothing.
   */
  function errorFromUrl(loc) {
    if (!loc) return null;
    var out = null;
    [String(loc.search || '').replace(/^\?/, ''),
     String(loc.hash || '').replace(/^#/, '')].forEach(function (raw) {
      if (out || !raw) return;
      var params = {};
      raw.split('&').forEach(function (pair) {
        if (!pair) return;
        var eq = pair.indexOf('=');
        var k = eq < 0 ? pair : pair.slice(0, eq);
        var v = eq < 0 ? '' : pair.slice(eq + 1);
        try { params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); }
        catch (_) { params[k] = v; }
      });
      if (params.error || params.error_code) {
        out = {
          code: params.error_code || params.error,
          description: params.error_description || '',
        };
      }
    });
    return out;
  }

  /**
   * Student-facing text for an OAuth failure. Supabase's raw strings name
   * providers and config ("Unsupported provider", "redirect_to is not allowed")
   * — accurate for us, meaningless to a student sitting an exam next week.
   */
  function friendlyError(err) {
    if (!err) return null;
    var code = String(err.code || '').toLowerCase();
    var desc = String(err.description || err.message || '');
    if (code.indexOf('access_denied') >= 0 || /cancel/i.test(desc)) {
      return 'Sign in with Apple was cancelled. You can try again, or log in with your email and password.';
    }
    if (/unsupported provider|not enabled/i.test(desc) || code === 'validation_failed') {
      return 'Sign in with Apple is not available right now. Please log in with your email and password.';
    }
    if (/redirect_to/i.test(desc)) {
      return 'Sign in with Apple could not return you to Si Math AI. Please log in with your email and password and let us know.';
    }
    return desc || 'Sign in with Apple did not complete. Please try again, or log in with your email and password.';
  }

  /**
   * Start the flow. `scopes` asks Apple for the name and email; Apple only ever
   * releases the name on the very first authorisation, and not at all through
   * the OAuth (as opposed to native) flow, so onboarding still collects it —
   * see the audit note on the missing full_name.
   */
  function signIn(client, opts) {
    var o = opts || {};
    return client.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: o.redirectTo || redirectTarget('login.html', o.location),
        scopes: 'name email',
      },
    });
  }

  var APPLE_MARK =
    '<svg class="apple-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>';

  /**
   * Render the divider + button into `container` and wire it up. Returns false
   * and touches nothing when the flag is off, which is what keeps this change
   * inert in production until the configuration exists.
   */
  function mount(container, client, opts) {
    if (!ENABLED || !container || !client) return false;
    var o = opts || {};
    var wrap = container.ownerDocument.createElement('div');
    wrap.innerHTML =
      '<div class="divider">OR</div>' +
      '<button type="button" class="btn btn-apple" id="appleBtn">' +
      APPLE_MARK + '<span>Continue with Apple</span></button>';
    container.appendChild(wrap);
    var btn = wrap.querySelector('#appleBtn');
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.style.opacity = '0.7';
      try {
        var res = await signIn(client, o);
        // On success the browser is already navigating to Apple; only an error
        // returns control here.
        if (res && res.error) {
          btn.disabled = false;
          btn.style.opacity = '1';
          if (typeof o.onError === 'function') o.onError(friendlyError(res.error));
        }
      } catch (e) {
        btn.disabled = false;
        btn.style.opacity = '1';
        if (typeof o.onError === 'function') o.onError(friendlyError(e));
      }
    });
    return true;
  }

  return {
    ENABLED: ENABLED,
    PRODUCTION_ORIGIN: PRODUCTION_ORIGIN,
    PRIVATE_RELAY_DOMAIN: PRIVATE_RELAY_DOMAIN,
    redirectTarget: redirectTarget,
    isPrivateRelayEmail: isPrivateRelayEmail,
    needsRelayLinkCheck: needsRelayLinkCheck,
    errorFromUrl: errorFromUrl,
    friendlyError: friendlyError,
    signIn: signIn,
    mount: mount,
  };
}));
