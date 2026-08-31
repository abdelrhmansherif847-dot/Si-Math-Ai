// The student side of the referral flow, end to end.
//
// The teacher surfaces are only half a feature: a link nobody reads credits
// nobody. This suite runs the SHIPPED referral.js — not a paraphrase of it —
// against a fake browser and a fake Supabase client, and walks the journey a
// real student takes:
//
//   click a link  →  register  →  confirm email  →  log in  →  attributed
//
// The risks it is built around are the ones that cost money or credit the
// wrong person:
//
//   1. the click is lost between landing and the first sign-in
//   2. a student can name a teacher instead of presenting a code
//   3. joining a classroom quietly counts as being referred
//   4. an already-paid student is moved to somebody new
//   5. the pending code is retried forever, or dropped on a blip

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('referral-capture');

const SRC = read('referral.js');

/* ── a browser, small enough to reason about ──────────────────────────────
   Only what referral.js actually touches. Anything it reaches for that is not
   here throws, which is how an accidental new dependency shows up as a failure
   rather than as behaviour nobody noticed. */
function makeWindow({ url = 'https://www.si-math-ai.com/', store = {}, lib = null } = {}) {
  const win = {
    supabase: lib,
    history: { replaceState: (a, b, to) => { win.__replaced = to; } },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    /* 'loading' is what a deferred script actually sees, and it makes the two
       phases separable: the file captures at parse time and defers redeem()
       to DOMContentLoaded, which each test then fires itself. */
    document: { readyState: 'loading', addEventListener: (ev, fn) => { win.__onReady = fn; } },
    __store: store,
  };
  const u = new URL(url);
  win.location = { href: url, search: u.search, pathname: u.pathname, hash: u.hash };
  return win;
}

/** Runs the real file inside that browser and returns its exported handles. */
function boot(win) {
  const fn = new Function('window', 'location', 'localStorage', 'history', 'document',
    'URL', 'URLSearchParams', 'setInterval', 'clearInterval',
    `${SRC}\nreturn window.SiReferral;`);
  return fn(win, win.location, win.localStorage, win.history, win.document,
    URL, URLSearchParams, setInterval, clearInterval);
}

/** A Supabase stand-in. `answer` is what attribute_referral returns. */
function makeLib({ session = null, answer = { data: { ok: true, reason: 'attributed' }, error: null },
                   onRpc = null } = {}) {
  const calls = [];
  return {
    calls,
    lib: {
      createClient: () => ({
        auth: { getSession: async () => ({ data: { session } }) },
        rpc: async (name, args) => {
          calls.push({ name, args });
          return onRpc ? onRpc(name, args) : answer;
        },
      }),
    },
  };
}

const SESSION = { user: { id: 'student-1' } };
const CODE = 'K7RMPX42';

// ══ 1 · THE CLICK SURVIVES THE JOURNEY ════════════════════════════════════
t.section('A click on Monday still counts when they sign in on Friday');

const journey = {};
{
  const win = boot(makeWindow({ url: `https://www.si-math-ai.com/?ref=${CODE}`, store: journey }));
  t.is('landing on the link stores the code', win.readPending(), CODE);
}
{
  /* Two halves, and the first is the one that matters: a check that only asks
     "does the new URL contain ref=" passes when the URL was never rewritten at
     all, because undefined contains nothing. */
  const w = makeWindow({ url: `https://www.si-math-ai.com/?ref=${CODE}&utm=x` });
  boot(w);
  t.ok('the address bar is actually rewritten', typeof w.__replaced === 'string');
  t.ok('with the code gone, so it is not bookmarked or re-shared',
    !String(w.__replaced || '').includes('ref='));
  t.ok('and everything else left alone', String(w.__replaced || '').includes('utm=x'));
}
{
  // signed out, several pages later
  const out = makeLib({ session: null });
  const R = boot(makeWindow({ url: 'https://www.si-math-ai.com/pricing.html', store: journey, lib: out.lib }));
  await R.redeem();
  t.is('a signed-out page sends nothing', out.calls.length, 0);
  t.is('and the code keeps waiting through registration', R.readPending(), CODE);
}
{
  // the first session — this is where registration finally lands, because
  // signUp() requires an email confirmation and creates no session
  const inn = makeLib({ session: SESSION });
  const w = makeWindow({ url: 'https://www.si-math-ai.com/onboarding.html', store: journey, lib: inn.lib });
  const R = boot(w);
  t.ok('the file defers its work to DOMContentLoaded', typeof w.__onReady === 'function');
  await w.__onReady();   // exactly what the browser does, once
  t.is('the first signed-in page attributes exactly once', inn.calls.length, 1);
  t.is('through attribute_referral', inn.calls[0].name, 'attribute_referral');
  t.is('presenting the code and nothing else', Object.keys(inn.calls[0].args).sort(),
    ['p_code', 'p_source']);
  t.is('the code it presents is the one that was clicked', inn.calls[0].args.p_code, CODE);
  t.is('and the pending code is spent, not left to fire again', R.readPending(), null);
}
{
  // every page load afterwards
  const again = makeLib({ session: SESSION });
  const R = boot(makeWindow({ url: 'https://www.si-math-ai.com/dashboard.html', store: journey, lib: again.lib }));
  await R.redeem();
  t.is('later page loads send nothing at all', again.calls.length, 0);
}

// ══ 2 · A STUDENT CANNOT NAME A TEACHER ═══════════════════════════════════
t.section('A code is presented; a teacher is never named');

{
  const lib = makeLib({ session: SESSION });
  const R = boot(makeWindow({ url: `https://x/?ref=${CODE}`, lib: lib.lib }));
  await R.redeem();
  const args = lib.calls[0].args;
  t.is('no user id of any kind is sent',
    Object.keys(args).filter((k) => /user|teacher|uid|id$/i.test(k)), []);
  t.is('the source is declared, not chosen by the URL', args.p_source, 'signup_link');
}
/* The database side of the same guarantee: the function's signature has no
   user parameter to forge, and the student is auth.uid(). */
const RPCS = read('supabase/migrations/20260831d_referral_rpcs.sql');
t.ok('attribute_referral takes a code and a source, and no user id',
  /create or replace function attribute_referral\(p_code text, p_source text default 'code_entry'\)/.test(RPCS));
t.ok('and the student it binds is auth.uid()', /v_uid\s+uuid := auth\.uid\(\);/.test(RPCS));
t.ok('the teacher is resolved from the code server-side',
  /select teacher_user_id into v_teacher from referral_codes where code = v_norm and active/.test(RPCS));
t.ok('a teacher cannot refer themselves',
  /if v_teacher = v_uid then\s*\n\s*return jsonb_build_object\('ok', false, 'reason', 'own_code'\)/.test(RPCS));

// ══ 3 · WHAT COUNTS AS A CODE ═════════════════════════════════════════════
t.section('Only code-shaped text is ever stored or sent');

{
  const R = boot(makeWindow({ url: 'https://x/?ref=k7rmpx42' }));
  t.is('lowercase is normalised', R.readPending(), CODE);
}
{
  const R = boot(makeWindow({ url: 'https://x/?ref=K7RM-PX42/' }));
  t.is('punctuation is stripped', R.readPending(), CODE);
}
{
  const R = boot(makeWindow({ url: "https://x/?ref=%3Cscript%3Ealert(1)%3C%2Fscript%3E" }));
  t.ok('markup cannot survive normalisation', !/[<>()/]/.test(R.readPending() || ''));
}
{
  const R = boot(makeWindow({ url: 'https://x/?ref=' + 'A'.repeat(500) }));
  t.is('an absurd code is bounded', (R.readPending() || '').length, 16);
}
{
  const R = boot(makeWindow({ url: 'https://x/?ref=!!!' }));
  t.is('a code with nothing code-shaped in it is not stored', R.readPending(), null);
}
{
  const R = boot(makeWindow({ url: 'https://x/dashboard.html' }));
  t.is('a page with no ref stores nothing', R.readPending(), null);
}

// ══ 4 · LAST TOUCH, WHILE UNPAID ══════════════════════════════════════════
t.section('The most recent link wins, right up until they pay');

{
  const store = {};
  boot(makeWindow({ url: 'https://x/?ref=AAAA1111', store }));
  const R = boot(makeWindow({ url: 'https://x/?ref=BBBB2222', store }));
  t.is('a second link replaces the first while nothing is bound', R.readPending(), 'BBBB2222');
}
/* And the database is the one that decides whether it may be taken. */
t.ok('the server re-points an unpaid student on a later code',
  /if v_had_row then[\s\S]{0,200}?update referral_attributions\s*\n\s*set teacher_user_id = v_teacher/.test(RPCS));
t.ok('but refuses once the attribution is locked',
  /if v_had_row and v_existing\.locked_at is not null then[\s\S]{0,260}?'already_locked'/.test(RPCS));
t.ok('and refuses anyone who has ever purchased',
  /if exists \(select 1 from purchase_events where user_id = v_uid\) then[\s\S]{0,140}?'already_purchased'/.test(RPCS));
/* The lock is set by the purchase itself, not by anything a client does. */
const ENGINE = read('supabase/migrations/20260831c_referral_engine.sql');
t.ok('the first purchase is what locks it',
  /update referral_attributions\s*\n\s*set locked_at = now\(\), locked_reason = 'first_purchase'/.test(ENGINE));

// ══ 5 · WHEN TO STOP TRYING ═══════════════════════════════════════════════
t.section('Retry a blip; never retry an answer');

for (const reason of ['unknown_code', 'own_code', 'already_purchased', 'already_locked']) {
  const lib = makeLib({ session: SESSION, answer: { data: { ok: false, reason }, error: null } });
  const R = boot(makeWindow({ url: `https://x/?ref=${CODE}`, lib: lib.lib }));
  await R.redeem();
  t.is(`"${reason}" is a final answer, so the code is dropped`, R.readPending(), null);
}
{
  const lib = makeLib({ session: SESSION, answer: { data: null, error: { message: 'network' } } });
  const R = boot(makeWindow({ url: `https://x/?ref=${CODE}`, lib: lib.lib }));
  await R.redeem();
  t.is('a transport failure keeps the code for the next page', R.readPending(), CODE);
}
{
  const lib = makeLib({ session: SESSION, onRpc: () => { throw new Error('offline'); } });
  const R = boot(makeWindow({ url: `https://x/?ref=${CODE}`, lib: lib.lib }));
  await R.redeem();
  t.is('and so does a thrown error', R.readPending(), CODE);
}
{
  /* A page with no Supabase library at all. It must give up rather than hold a
     polling timer open — and give up SOON, because this runs on every load
     while a code is pending. */
  t.ok('the give-up is bounded, and shorter than the navigation client\'s',
    /waitForLib\(3000\)/.test(SRC));
  const started = Date.now();
  const R = boot(makeWindow({ url: `https://x/?ref=${CODE}`, lib: null }));
  await R.redeem();
  const took = Date.now() - started;
  t.ok('it returns instead of hanging (' + took + 'ms)', took < 4500);
  t.is('keeping the code for a page that has one', R.readPending(), CODE);
}

// ══ 6 · A CLASSROOM IS NOT A REFERRAL ═════════════════════════════════════
t.section('Joining a class credits nobody');

const FOUND = read('supabase/migrations/20260830c_teacher_foundation_rpcs.sql');
t.is('student_join_workspace touches no referral table',
  ['referral_attributions', 'referral_commissions', 'referral_codes', 'attribute_referral']
    .filter((x) => new RegExp(x).test(
      FOUND.slice(FOUND.indexOf('function student_join_workspace'),
                  FOUND.indexOf('$$;', FOUND.indexOf('function student_join_workspace'))))), []);
t.is('and no referral function reads the classroom roster',
  [/workspace_students/].filter((re) => re.test(
    RPCS.slice(RPCS.indexOf('function attribute_referral')))), []);
/* Nothing anywhere back-fills an attribution from an existing roster. The
   check names the tables a backfill would have to read: matching on "insert
   ... select" alone flags admin_reassign_referral, whose insert merely looks
   the teacher's own code up in a scalar subquery. */
t.is('no migration attributes anybody retroactively from a roster',
  ['20260831b_referral_tables.sql', '20260831c_referral_engine.sql',
   '20260831d_referral_rpcs.sql', '20260831f_referral_engine_acl.sql']
    .filter((f) => /insert into referral_attributions[\s\S]{0,400}?from\s+(workspace_students|profiles|payment_requests|payments|subscriptions)\b/i
      .test(read('supabase/migrations/' + f))), []);
/* And the one thing that IS backfilled is purchase history, which blocks a
   commission rather than creating one. */
t.ok('the only backfill is of purchases, and it awards nothing',
  /insert into purchase_events[\s\S]{0,300}?from payment_requests/.test(ENGINE)
  && !/insert into referral_commissions[\s\S]{0,200}?select/i.test(ENGINE));

// ══ 7 · ONE COMMISSION, AND ONLY ONE ══════════════════════════════════════
t.section('The first purchase pays once, and the second pays nothing');

const TABLES = read('supabase/migrations/20260831b_referral_tables.sql');
t.ok('a student can hold only one commission, by constraint',
  /student_user_id\s+uuid not null unique/.test(TABLES));
t.ok('and one payment can award only once',
  (TABLES.match(/unique \(source_kind, source_id\)/g) || []).length === 2);
t.ok('the engine refuses anything that is not the first purchase',
  /select count\(\*\) = 1 into v_is_first\s*\n\s*from purchase_events where user_id = new\.user_id/.test(ENGINE));
t.ok('and says so rather than failing silently',
  /'not_first_purchase'/.test(ENGINE));
/* The client is not trusted with any of this. */
t.is('referral.js computes no money and names no plan',
  [/commission/i, /rate_bps/, /amount_egp/, /plan_code/, /\b349\b/].filter((re) => re.test(SRC)), []);
t.is('and calls exactly one RPC', [...new Set([...SRC.matchAll(/rpc\('(\w+)'/g)].map((m) => m[1]))],
  ['attribute_referral']);

// ══ 8 · THE STUDENT IS NOT MADE TO CARE ═══════════════════════════════════
t.section('Invisible to the person it happens to');

t.is('nothing is rendered, asked or alerted',
  [/innerHTML/, /alert\(/, /confirm\(/, /document\.write/, /appendChild/].filter((re) => re.test(SRC)), []);
t.ok('no page had to change its markup to support it',
  ['index.html', 'signup.html', 'login.html', 'onboarding.html', 'dashboard.html', 'pricing.html']
    .every((f) => (read(f).match(/referral\.js/g) || []).length === 1));

t.done();
