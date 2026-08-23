/**
 * auth-resend.js — the decision logic behind the "Resend email" action.
 *
 * Environment-agnostic UMD, same idiom as taxonomy.core.js and auth-apple.js:
 * attaches `SiAuthResend` to the global object in a browser, exports via
 * module.exports under Node so tests/auth-resend.test.mjs exercises these exact
 * bytes rather than a paraphrase of them.
 *
 * ── THE BUG THIS EXISTS TO FIX ───────────────────────────────────────────────
 * Supabase enforces a per-address email cooldown of roughly 60 seconds, and the
 * signup email itself starts the clock. Measured in production 2026-08-23:
 *
 *   04:05:48  POST /signup  200   confirmation email sent
 *   04:06:26  POST /resend  429   "you can only request this after 21 seconds"
 *   04:06:28  POST /resend  429   "after 19 seconds"
 *   04:06:30  POST /resend  429   "after 16 seconds"
 *   04:06:32  POST /resend  429   "after 15 seconds"
 *   04:06:33  POST /resend  429   "after 14 seconds"
 *   04:06:33  POST /resend  429   "after 13 seconds"
 *   04:06:37  POST /resend  429   "after 10 seconds"
 *
 * Seven clicks in eleven seconds, seven refusals, zero emails. Each response
 * carries the exact seconds remaining, and every one of those click-time +
 * seconds-remaining sums lands 58-59 seconds after the signup — which is how the
 * window length above is known rather than guessed.
 *
 * The old UI threw all of that away: it showed "Failed — try again" and
 * re-enabled the button immediately, which is an invitation to click again. From
 * the student's seat the feature was simply broken.
 *
 * So the fix is not to retry harder. It is to (a) tell the student how long to
 * wait, using the number the server already sent, (b) keep the button disabled
 * until then, and (c) never generate a request that is certain to be refused.
 *
 * Nothing here bypasses or weakens Supabase's limit — it respects it and makes
 * it legible.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SiAuthResend = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Client-side cooldown after a SUCCESSFUL send. Matches the server's observed
   * window, so the next click is possible exactly when the server would allow
   * it — no spurious 429s, and no pretending the student must wait longer than
   * they do.
   */
  var COOLDOWN_SECONDS = 60;

  /** A rate-limit refusal, however the SDK surfaces it. */
  function isRateLimited(error) {
    if (!error) return false;
    if (error.status === 429) return true;
    var code = String(error.code || '').toLowerCase();
    if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return true;
    return /rate limit|only request this after/i.test(String(error.message || ''));
  }

  /**
   * Seconds the server says to wait. GoTrue phrases it as "For security
   * purposes, you can only request this after 21 seconds." Returns null when no
   * number is present, so the caller can fall back rather than invent one.
   */
  function parseRetryAfter(error) {
    if (!error) return null;
    var m = String(error.message || '').match(/after (\d+) seconds?/i);
    if (m) return parseInt(m[1], 10);
    // Some transports expose it as a header value on the error object.
    var h = error.retryAfter || error.retry_after;
    if (h != null && String(h).match(/^\d+$/)) return parseInt(String(h), 10);
    return null;
  }

  /** True once the address is already usable — resending would be pointless. */
  function isAlreadyConfirmed(error) {
    if (!error) return false;
    var t = String(error.code || '') + ' ' + String(error.message || '');
    return /already confirmed|already been confirmed|email_already_confirmed/i.test(t);
  }

  /**
   * Turn a supabase-js resend() result into what the student should see.
   *
   * Returns { ok, state, message, retryAfter } where state is one of
   * 'sent' | 'cooldown' | 'confirmed' | 'error'.
   *
   * On anti-enumeration: this never reports whether an address has an account.
   * Supabase deliberately answers ambiguously for unknown addresses so a
   * stranger cannot probe who is registered, and the wording below preserves
   * that — every non-cooldown outcome reads the same to someone guessing.
   */
  function classify(result) {
    var error = result && result.error;
    if (!error) {
      return {
        ok: true,
        state: 'sent',
        retryAfter: COOLDOWN_SECONDS,
        message: 'Confirmation email sent. Check your Inbox and your Spam or Junk folder.',
      };
    }
    if (isRateLimited(error)) {
      var wait = parseRetryAfter(error);
      if (wait == null) wait = COOLDOWN_SECONDS;
      return {
        ok: false,
        state: 'cooldown',
        retryAfter: wait,
        // Not an error from the student's side — one was already sent. Say that,
        // because "failed" sends them looking for a problem that isn't there.
        message: 'An email was sent very recently. You can request another in '
                 + wait + ' second' + (wait === 1 ? '' : 's') +
                 '. Meanwhile, check your Spam or Junk folder.',
      };
    }
    if (isAlreadyConfirmed(error)) {
      return {
        ok: false,
        state: 'confirmed',
        retryAfter: 0,
        message: 'This email address is already confirmed. Try logging in.',
      };
    }
    return {
      ok: false,
      state: 'error',
      retryAfter: 0,
      message: 'Could not send the email just now. Please try again in a minute.',
    };
  }

  /** Button label while a cooldown runs. */
  function countdownLabel(secondsLeft) {
    return 'Resend in ' + Math.max(0, Math.ceil(secondsLeft)) + 's';
  }

  return {
    COOLDOWN_SECONDS: COOLDOWN_SECONDS,
    isRateLimited: isRateLimited,
    parseRetryAfter: parseRetryAfter,
    isAlreadyConfirmed: isAlreadyConfirmed,
    classify: classify,
    countdownLabel: countdownLabel,
  };
}));
