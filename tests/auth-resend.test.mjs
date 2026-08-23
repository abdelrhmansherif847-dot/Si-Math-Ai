// The "Resend email" action, exercised against the real auth-resend.js.
//
// The defect this suite exists to prevent is a specific production failure,
// reproduced from the auth log on 2026-08-23:
//
//   04:05:48  POST /signup  200   confirmation email sent
//   04:06:26  POST /resend  429   "you can only request this after 21 seconds"
//   04:06:28  POST /resend  429   "after 19 seconds"
//   ... five more ...
//   04:06:37  POST /resend  429   "after 10 seconds"
//
// Seven clicks in eleven seconds, seven refusals, zero emails. Supabase enforces
// a ~60s per-address cooldown and the SIGNUP email starts it, so a student's
// first resend attempt usually lands inside the window. The old UI showed
// "Failed — try again" and re-enabled the button immediately, which is an
// invitation to click again — so it looked broken rather than busy.
//
// Every refusal carries the seconds remaining. The rule these tests pin is that
// we use that number instead of discarding it, and never call a rate-limit
// refusal a failure.
import { suite } from './_assert.mjs';
import { read, evalSnippet, inlineScripts, slice } from './_source.mjs';

const t = suite('auth-resend');
const R = evalSnippet(read('auth-resend.js'), {}, ['SiAuthResend']).SiAuthResend;

/** The exact error shape supabase-js surfaces for a GoTrue 429. */
const rateLimit = (secs) => ({
  error: {
    status: 429,
    code: 'over_email_send_rate_limit',
    message: `For security purposes, you can only request this after ${secs} seconds.`,
  },
});

t.section('The production refusal is recognised, not treated as failure');
// Each of the seven real responses, verbatim from the log.
for (const secs of [21, 19, 16, 15, 14, 13, 10]) {
  const c = R.classify(rateLimit(secs));
  t.is(`429 "after ${secs} seconds" -> cooldown`, c.state, 'cooldown');
  t.is(`429 "after ${secs} seconds" -> retryAfter ${secs}`, c.retryAfter, secs);
}
t.ok('a cooldown message never uses the word "failed"',
  !/fail/i.test(R.classify(rateLimit(21)).message));
t.ok('a cooldown message states the wait in seconds',
  /21 seconds/.test(R.classify(rateLimit(21)).message));
t.ok('a cooldown message still points at Spam/Junk',
  /spam or junk/i.test(R.classify(rateLimit(21)).message));
t.is('singular second is not written "1 seconds"',
  /1 second\b/.test(R.classify(rateLimit(1)).message), true);

t.section('Rate limiting is detected however the SDK surfaces it');
t.is('by HTTP status',  R.isRateLimited({ status: 429 }), true);
t.is('by error code',   R.isRateLimited({ code: 'over_email_send_rate_limit' }), true);
t.is('by message text', R.isRateLimited({ message: 'you can only request this after 9 seconds' }), true);
t.is('a normal error is not a rate limit', R.isRateLimited({ message: 'network down' }), false);
t.is('no error is not a rate limit', R.isRateLimited(null), false);

t.section('Seconds are read from the server, never invented');
t.is('parsed from the GoTrue phrasing', R.parseRetryAfter(rateLimit(37).error), 37);
t.is('parsed from a Retry-After field', R.parseRetryAfter({ retryAfter: '45' }), 45);
t.is('absent when the message has no number', R.parseRetryAfter({ message: 'slow down' }), null);
// A missing number must fall back to the full window rather than to 0, which
// would re-enable the button instantly and reproduce the original bug.
t.is('unparseable rate limit falls back to the full cooldown',
  R.classify({ error: { status: 429, message: 'slow down' } }).retryAfter, R.COOLDOWN_SECONDS);
t.is('the fallback window matches the measured server window', R.COOLDOWN_SECONDS, 60);

t.section('Successful resend');
const sent = R.classify({ data: {}, error: null });
t.is('state', sent.state, 'sent');
t.is('ok', sent.ok, true);
t.ok('says an email was sent, so the student is not left guessing',
  /sent/i.test(sent.message));
t.ok('names Spam or Junk, for a student who does not know where that is',
  /spam or junk/i.test(sent.message));
// Success must also start a cooldown, or a second click immediately earns a 429.
t.is('success starts the full cooldown', sent.retryAfter, R.COOLDOWN_SECONDS);

t.section('Other outcomes');
const conf = R.classify({ error: { message: 'Email address already confirmed' } });
t.is('already confirmed is its own state', conf.state, 'confirmed');
t.ok('and points at logging in', /log/i.test(conf.message));
const err = R.classify({ error: { message: 'connection refused' } });
t.is('a genuine failure is an error', err.state, 'error');
t.ok('a genuine failure is actionable', /try again/i.test(err.message));
t.is('a genuine failure does not hold the button', err.retryAfter, 0);

t.section('No account enumeration');
// A stranger typing addresses must not be able to tell which have accounts, so
// no message may distinguish "no such user" from an ordinary failure.
for (const m of ['User not found', 'no user found with this email', 'Signups not allowed']) {
  const c = R.classify({ error: { message: m } });
  t.is(`"${m}" -> generic error state`, c.state, 'error');
  t.is(`"${m}" -> generic wording`, c.message,
    'Could not send the email just now. Please try again in a minute.');
}

t.section('Countdown label');
t.is('formats whole seconds', R.countdownLabel(21), 'Resend in 21s');
t.is('never shows a negative', R.countdownLabel(-3), 'Resend in 0s');
t.is('rounds a fractional tick up', R.countdownLabel(4.2), 'Resend in 5s');

t.section('The page wires it up, and holds the button');
const src = read('login.html');
t.ok('login.html loads auth-resend.js', src.includes('<script src="auth-resend.js"></script>'));
t.ok('the resend button is wired through the module', /wireResend\(resendBtn,\s*email\)/.test(src));
t.ok('a second click while in flight is ignored', /if\(busy\|\|btn\.disabled\)return;/.test(src));
t.ok('only one countdown timer can run', /if\(_resendTimer\)\{clearInterval\(_resendTimer\)/.test(src));
t.ok('a cooldown holds the button, it does not re-enable it',
  /outcome\.state==='sent'\|\|outcome\.state==='cooldown'\)\{\s*hold\(outcome\.retryAfter\)/.test(src));
t.ok('the prompt tells students to check Spam or Junk',
  /Spam or Junk folder, then resend it/.test(src));
// The exact strings the old version showed. Their absence is the fix.
t.ok('the old "Failed — try again" button label is gone',
  !src.includes('Failed — try again'));
t.ok('the old "Sent! Check your inbox" label is gone',
  !src.includes('Sent! Check your inbox'));
t.ok('no second copy of the cooldown rule lives in the page',
  !inlineScripts(src).some(js => js.includes('over_email_send_rate_limit')));

t.section('These checks could go red');
// verification-framework-audit.md: a green check is only evidence if it could
// have failed. Show each detector firing on the behaviour it was written for.
t.is('the old code would have been classified as a plain failure by nothing — '
  + 'classify() is what makes 429 distinct from error',
  R.classify(rateLimit(21)).state !== R.classify({ error: { message: 'x' } }).state, true);
t.ok('the enumeration check would catch a leaky message',
  'No account exists for that address.' !== R.classify({ error: { message: 'User not found' } }).message);
t.ok('the in-flight guard regex would fail on the old handler',
  !/if\(busy\|\|btn\.disabled\)return;/.test('btn.disabled=true;btn.textContent="Sending…";'));

t.section('The button state machine, driven as a browser would drive it');
// The module decides; the page acts. This runs the page's REAL wireResend /
// setResendNote out of login.html in a sandbox with a fake DOM and fake timers,
// because the failure being fixed was a state bug — a button re-enabled too
// early — and no amount of testing classify() would have caught it.
const block = slice(read('login.html'),
  '  // ── Resend confirmation email ───',
  '  // ── Sign in with Apple ───',
  'resend block');

function harness(resendImpl) {
  const listeners = [];
  const mk = () => ({
    disabled: false, textContent: '', style: { cssText: '', color: '' }, id: '',
    children: [], appendChild(c) { this.children.push(c); },
    addEventListener(_ev, fn) { listeners.push(fn); },
  });
  const btn = mk(), errEl = mk();
  // showErrWithAction sets this before wireResend is called, and wireResend
  // captures it as the label to restore after a countdown. Omitting it here made
  // the harness — not the page — look broken.
  btn.textContent = 'Resend email';
  const timers = [];
  const sandbox = {
    console,
    document: {
      getElementById: (id) => (id === 'loginErr' ? errEl
        : (errEl.children.find((c) => c.id === id) || null)),
      createElement: mk,
    },
    window: { SiAuthResend: R },
    supabaseClient: { auth: { resend: resendImpl } },
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    clearInterval: (h) => { if (h) timers[h - 1] = null; },
  };
  const out = evalSnippet(block, sandbox, ['wireResend', 'setResendNote']);
  out.wireResend(btn, 'student@icloud.com');
  return {
    btn, errEl,
    click: () => listeners.forEach((fn) => fn.call(btn)),
    tick: (n) => { for (let i = 0; i < n; i++) timers.forEach((fn) => fn && fn()); },
    note: () => (errEl.children.find((c) => c.id === 'resendNote') || {}).textContent,
  };
}

// 1. Successful resend.
{
  const h = harness(async () => ({ data: {}, error: null }));
  h.click();
  await new Promise((r) => setImmediate(r));
  t.ok('success: the student is told an email was sent', /sent/i.test(h.note()));
  t.ok('success: Spam/Junk is named', /Spam or Junk/i.test(h.note()));
  t.is('success: the button is held, not left clickable', h.btn.disabled, true);
  t.is('success: it counts down from the full window', h.btn.textContent, 'Resend in 60s');
  h.tick(59);
  t.is('after 59 ticks it is still held', h.btn.disabled, true);
  h.tick(1);
  t.is('after the 60th tick it is clickable again', h.btn.disabled, false);
  t.is('and the label is restored', h.btn.textContent, 'Resend email');
}

// 2. The production case: a 429 with 21 seconds left.
{
  const h = harness(async () => rateLimit(21));
  h.click();
  await new Promise((r) => setImmediate(r));
  t.is('cooldown: the button shows the server\'s own number', h.btn.textContent, 'Resend in 21s');
  t.is('cooldown: the button is NOT re-enabled — the original bug', h.btn.disabled, true);
  t.ok('cooldown: the note explains the wait', /21 seconds/.test(h.note()));
  t.ok('cooldown: the note does not say it failed', !/fail/i.test(h.note()));
  h.tick(21);
  t.is('cooldown: clickable again exactly when the server allows it', h.btn.disabled, false);
}

// 3. Repeated clicks while a request is in flight.
{
  let calls = 0;
  const h = harness(() => { calls++; return new Promise(() => {}); });   // never resolves
  h.click(); h.click(); h.click(); h.click(); h.click();
  t.is('five rapid clicks produce exactly one request', calls, 1);
  t.is('and the button reads Sending…', h.btn.textContent, 'Sending…');
}

// 4. Clicks during the cooldown must not reach the network either.
{
  let calls = 0;
  const h = harness(async () => { calls++; return rateLimit(15); });
  h.click();
  await new Promise((r) => setImmediate(r));
  t.is('the refused attempt was one request', calls, 1);
  h.click(); h.click();
  t.is('clicking during the countdown sends nothing', calls, 1);
}

// 5. A genuine failure must release the button — a student should be able to retry.
{
  const h = harness(async () => { throw new Error('Failed to fetch'); });
  h.click();
  await new Promise((r) => setImmediate(r));
  t.is('a thrown network error is caught', h.btn.disabled, false);
  t.is('and the button is usable again', h.btn.textContent, 'Resend email');
  t.ok('with an actionable message', /try again/i.test(h.note()));
}

// 6. Already confirmed: resending is pointless, so the button stays down.
{
  const h = harness(async () => ({ error: { message: 'Email address already confirmed' } }));
  h.click();
  await new Promise((r) => setImmediate(r));
  t.is('already-confirmed keeps the button down', h.btn.disabled, true);
  t.is('and says so', h.btn.textContent, 'Already confirmed');
  t.ok('and points at logging in', /logging in/i.test(h.note()));
}

t.done();
