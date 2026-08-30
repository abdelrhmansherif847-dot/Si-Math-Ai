// Experience routing — who lands where, and why it is not a security boundary.
//
// Three surfaces used to answer "who is this account?" independently, and they
// disagreed. 20260830i makes my_experience() the single answer and turns
// login.html and nav.js into its consumers. This suite holds that arrangement
// in place.
//
// FOUR PROPERTIES:
//   1. CONTRACT   the function is caller-scoped, read-only, takes NO argument,
//                 and hands out no privilege — so a browser may act on it
//   2. PENDING    a pending assistant is NOT staff. They were approved by
//                 nobody; every teaching RPC refuses them, so a Teaching link
//                 or a redirect to teacher.html is a page of 42501s. This was
//                 a live defect in nav.js and it is asserted in BOTH the new
//                 path and the fallback
//   3. FALLBACK   the migration is applied by hand and these files deploy on
//                 merge, so they must work in either order. The pre-20260830i
//                 path stays, and is exercised here rather than assumed
//   4. PRECEDENCE staff beats onboarding; platform role beats nothing
//
// The client checks EXECUTE the shipped bytes: the decision blocks are sliced
// out of nav.js and login.html and run against a fake client. A rewritten
// paraphrase would keep passing while the real page broke.

import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('experience-routing');

const MIG  = read('supabase/migrations/20260830i_my_experience.sql');
const BACK = read('supabase/migrations/20260830w_my_experience_rollback.sql');
const NAV   = read('nav.js');
const LOGIN = read('login.html');

/** Executable SQL only. The file carries a long design essay that legitimately
 *  names things the code must not do; asserting over raw text would pass or
 *  fail on prose. */
const exec = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const SQL = exec(MIG);

// ══ 1 · THE FUNCTION'S CONTRACT ═══════════════════════════════════════════
t.section('my_experience() is a caller-scoped, read-only routing hint');

t.ok('the migration really defines it (not a vacuous file)',
  /create or replace function my_experience\(\)/.test(SQL));

/* No argument means no version of this call asks about somebody else. A
   p_user uuid would make it an information-disclosure surface guarded only by
   whatever the body remembered to check. */
t.ok('it takes NO arguments', /function my_experience\(\)\s*\n?\s*returns/.test(SQL));
t.is('no parameter of any kind is declared',
  (SQL.match(/function my_experience\(([^)]*)\)/) || ['', ''])[1].trim(), '');
t.ok('nothing in the body accepts a caller-supplied identity',
  !/\bp_user\b|\bp_uid\b|\bp_id\b/.test(SQL));
t.ok('identity comes from auth.uid()', /v_uid\s+uuid\s+:=\s+auth\.uid\(\)/.test(SQL));

t.ok('security definer', /security definer/.test(SQL));
t.ok('search_path is pinned', /set search_path = pg_catalog, public/.test(SQL));
t.ok('stable, so it can be read but never mutates', /\bstable\b/.test(SQL));

/* Read-only is the property that makes a routing hint harmless. */
for (const verb of ['insert into', 'update ', 'delete from', 'grant all', 'alter table']) {
  t.ok(`the body never does: ${verb.trim()}`, !new RegExp(`\\n\\s*${verb}`, 'i').test(
    SQL.slice(SQL.indexOf('create or replace function my_experience'), SQL.indexOf('comment on function'))));
}

/* It must reach the two workspace tables and nothing academic — a routing
   function has no business reading a student's work. */
t.ok('it reads workspace_staff', /from workspace_staff/.test(SQL));
t.ok('it reads teacher_workspaces', /join teacher_workspaces/.test(SQL));
const FORBIDDEN = ['question_records', 'mastery_records', 'weakness_reports', 'weakness_signals',
  'focus_plans', 'focus_tasks', 'exam_attempts', 'exam_responses', 'chat_sessions',
  'subscriptions', 'credits', 'ai_usage_logs'];
t.is('it reads no academic or commercial table',
  FORBIDDEN.filter((tbl) => new RegExp(`\\b${tbl}\\b`).test(SQL)), []);

// ── privileges ────────────────────────────────────────────────────────────
t.ok('revoked from public, anon and authenticated first',
  /revoke all on function my_experience\(\) from public, anon, authenticated/.test(SQL));
t.ok('granted back to authenticated only',
  /grant execute on function my_experience\(\) to authenticated/.test(SQL));
t.is('anon is never granted execute',
  (SQL.match(/grant execute on function my_experience\(\) to (\w+)/g) || []),
  ['grant execute on function my_experience() to authenticated']);

// ── the four rules ────────────────────────────────────────────────────────
t.section('The four rules, as written in the SQL');

/* Rule 1 — can_staff is ACTIVE membership in an ACTIVE workspace. */
t.ok("can_staff counts only status = 'active'",
  /count\(\*\) filter \(where s\.status = 'active'\)/.test(SQL));
t.ok('the row set is confined to the caller', /where s\.user_id = v_uid/.test(SQL));
t.ok('a deactivated workspace is excluded', /and w\.is_active/.test(SQL));
t.ok("pending_count counts status = 'pending'",
  /count\(\*\) filter \(where s\.status = 'pending'\)/.test(SQL));

/* Rule 2 — can_student is unconditional. Not a variable, not a condition. */
t.ok('can_student is the literal true, with no condition attached',
  /'can_student',\s+true/.test(SQL) && !/'can_student',\s+[a-z_]*v_/.test(SQL));

/* Rule 3 — the platform role must not decide the experience. The case
   expression is the whole decision; it may mention only the staff count. */
const PRIMARY = (SQL.match(/'primary',\s+case when ([^\n]*)/g) || []).join('\n');
t.ok('primary is decided by a staff count (not vacuous)', /v_active > 0/.test(PRIMARY));
t.ok('primary never consults the platform role',
  !/platform_role|v_role|current_user_role|is_admin|user_role/.test(PRIMARY));

/* Rule 4 — teaching is derived on every call, never stored. */
t.ok('platform_role comes from the same read has_role_at_least() enforces with',
  /v_role\s*:=\s*current_user_role\(\)::text/.test(SQL));
t.ok('no user_role value is invented for teaching',
  !/'teacher'::user_role|role\s*=\s*'teacher'/.test(SQL));

// ── the rollback ──────────────────────────────────────────────────────────
t.ok('a rollback exists for the forward migration',
  /drop function if exists my_experience\(\)/.test(exec(BACK)));

// ══ 2 · nav.js — THE REAL DECISION, EXECUTED ══════════════════════════════
t.section('nav.js decides Teaching from can_staff, and still works without it');

/* The actual shipped block, run as-is. `slice` throws if either marker moves,
   so this cannot silently degrade into testing nothing. */
const NAV_DECISION = slice(NAV, '      var role = null;', '      render(slot, role, teaching);',
  'nav.js decision block');

const navDecide = (sb) => {
  const fn = new Function('sb', 'user',
    `return (async () => {\n${NAV_DECISION}\nreturn { role: role, teaching: teaching };\n})();`);
  return fn(sb, { id: 'u1' });
};

/** A stand-in Supabase client. Only the calls nav.js actually makes exist. */
const mkSb = ({ exp = null, expError = null, expThrow = false, profile = null, workspaces = [] } = {}) => ({
  rpc: async (name) => {
    if (name === 'my_experience') {
      if (expThrow) throw new Error('offline');
      return { data: exp, error: expError };
    }
    if (name === 'teacher_my_workspaces') return { data: workspaces, error: null };
    throw new Error(`nav.js called an unexpected RPC: ${name}`);
  },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }),
});

const EXP = (over) => ({
  primary: 'student', can_staff: false, can_student: true,
  platform_role: 'user', staff_memberships: [], pending_count: 0, ...over,
});

t.ok('the sliced block is the real decision (not an empty slice)',
  /my_experience/.test(NAV_DECISION) && /teacher_my_workspaces/.test(NAV_DECISION));

// -- the my_experience path
{
  const r = await navDecide(mkSb({ exp: EXP({ can_staff: true, primary: 'staff', platform_role: 'admin' }) }));
  t.is('active staff gets the Teaching link', r.teaching, true);
  t.is('the platform role comes straight from platform_role', r.role, 'admin');
}
{
  // THE DEFECT. A pending assistant reports one membership and zero staff.
  const r = await navDecide(mkSb({ exp: EXP({ pending_count: 1,
    staff_memberships: [{ workspace_id: 'w1', name: 'A', staff_role: 'assistant', status: 'pending' }] }) }));
  t.is('a PENDING assistant gets NO Teaching link', r.teaching, false);
  t.is('and is still a plain user in the sidebar', r.role, 'user');
}
{
  const r = await navDecide(mkSb({ exp: EXP({ platform_role: null }) }));
  t.is("a missing platform_role degrades to 'user', never to undefined", r.role, 'user');
}

// -- the fallback path, for the window before the migration is applied
{
  const r = await navDecide(mkSb({
    expError: { message: 'function public.my_experience() does not exist' },
    profile: { role: 'super_admin', is_admin: true },
    workspaces: [{ workspace_id: 'w1', staff_status: 'active' }],
  }));
  t.is('without the migration the role still comes from profiles', r.role, 'super_admin');
  t.is('and active staff still gets the Teaching link', r.teaching, true);
}
{
  const r = await navDecide(mkSb({
    expError: { message: 'does not exist' },
    profile: { role: 'user', is_admin: false },
    workspaces: [{ workspace_id: 'w1', staff_status: 'pending' }],
  }));
  t.is('the FALLBACK carries the pending fix too', r.teaching, false);
}
{
  const r = await navDecide(mkSb({
    expError: { message: 'does not exist' },
    profile: { role: 'user', is_admin: false },
    workspaces: [{ workspace_id: 'w1', staff_status: 'removed' }],
  }));
  t.is('a removed membership is not teaching either', r.teaching, false);
}
{
  const r = await navDecide(mkSb({ expThrow: true, profile: null, workspaces: [] }));
  t.is('a thrown RPC does not break the sidebar', r.role, 'user');
  t.is('and shows no Teaching link', r.teaching, false);
}
{
  const r = await navDecide(mkSb({ exp: null, profile: { role: 'admin', is_admin: true }, workspaces: [] }));
  t.is('a null payload falls back rather than rendering undefined', r.role, 'admin');
}

// ══ 3 · login.html — THE REAL ROUTING, EXECUTED ═══════════════════════════
t.section('login.html sends active staff to teacher.html, and nobody else');

const LOGIN_ROUTE = slice(LOGIN, "      var primary='student';",
  "      else{window.location.href='onboarding.html';}", 'login.html routing block');

const loginRoute = (supabaseClient, profile) => {
  const win = { location: { href: '' } };
  const fn = new Function('supabaseClient', 'profile', 'window',
    `return (async () => {\n${LOGIN_ROUTE}\n      else{window.location.href='onboarding.html';}\n})();`);
  return fn(supabaseClient, profile, win).then(() => win.location.href);
};

const mkLoginSb = ({ exp = null, expError = null, expThrow = false } = {}) => ({
  rpc: async (name) => {
    if (name !== 'my_experience') throw new Error(`login.html called an unexpected RPC: ${name}`);
    if (expThrow) throw new Error('offline');
    return { data: exp, error: expError };
  },
});

t.ok('the sliced block is the real routing (not an empty slice)',
  /my_experience/.test(LOGIN_ROUTE) && /teacher\.html/.test(LOGIN_ROUTE));

t.is('active staff land on the staff surface',
  await loginRoute(mkLoginSb({ exp: EXP({ primary: 'staff', can_staff: true }) }), { onboarding_completed: true }),
  'teacher.html');

/* PRECEDENCE. Student onboarding asks for an exam type and a target date; a
   teacher who does not study here has no answer to either. */
t.is('staff beats unfinished onboarding',
  await loginRoute(mkLoginSb({ exp: EXP({ primary: 'staff', can_staff: true }) }), { onboarding_completed: false }),
  'teacher.html');

t.is('an onboarded student still lands on the dashboard',
  await loginRoute(mkLoginSb({ exp: EXP() }), { onboarding_completed: true }),
  'dashboard.html');

t.is('a new student still lands on onboarding',
  await loginRoute(mkLoginSb({ exp: EXP() }), { onboarding_completed: false }),
  'onboarding.html');

/* A PENDING assistant is not staff, so they stay in the learning product. */
t.is('a pending assistant is routed as a student',
  await loginRoute(mkLoginSb({ exp: EXP({ pending_count: 1 }) }), { onboarding_completed: true }),
  'dashboard.html');

/* Skew and failure: login is the front door and must never be the thing that
   breaks. Both failure modes route exactly as they did before 20260830i. */
t.is('a missing function routes as before',
  await loginRoute(mkLoginSb({ expError: { message: 'function public.my_experience() does not exist' } }),
    { onboarding_completed: true }),
  'dashboard.html');
t.is('a thrown RPC routes as before',
  await loginRoute(mkLoginSb({ expThrow: true }), { onboarding_completed: true }),
  'dashboard.html');
t.is('a null profile still reaches onboarding',
  await loginRoute(mkLoginSb({ exp: EXP() }), null),
  'onboarding.html');

/* The RPC error is destructured, not ignored. Reading only `data` is the bug
   that once told students their plan allowed N devices when the check had
   simply failed — see the comment above can_register_device in login.html. */
t.ok('the routing call destructures the error', /error:\s*xerr/.test(LOGIN_ROUTE));

// ══ 4 · ROUTING IS NOT AUTHORIZATION ══════════════════════════════════════
t.section('Nothing here decides a permission, and no role is read from an email');

/* An email address is not an authorization fact. Being a teacher is holding an
   active staff row, and that is the only derivation allowed on any surface. */
for (const [name, src] of [['nav.js', NAV], ['login.html', LOGIN], ['teacher.html', read('teacher.html')]]) {
  t.ok(`${name} never infers a role or an experience from an email address`,
    !/email[^\n]*(===|==|includes|endsWith|startsWith|match)[^\n]*(admin|owner|teacher|staff)/i.test(src)
    && !/(admin|owner|teacher|staff)[^\n]*(===|==)[^\n]*\bemail\b/i.test(src));
}

/* The client may not decide staff-ness from a platform role either — that is
   the collision 20260830h was about. */
t.ok('nav.js derives Teaching from can_staff, not from the role',
  /teaching = x\.can_staff === true/.test(NAV) && !/teaching\s*=\s*[^\n]*\brole\b/.test(NAV));

t.ok('login.html routes on primary, not on a role',
  /xp\.primary==='staff'/.test(LOGIN) && !/routeAfterAuth[\s\S]{0,4000}?platform_role\s*===/.test(LOGIN));

t.done();
