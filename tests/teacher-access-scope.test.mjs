// Scope suite for the Teacher & Assistant foundation.
//
// The whole justification for this system is that a teacher sees SOME things
// about SPECIFIC students and nothing else. That property is one careless
// policy away from gone, and it would go quietly — a widened GRANT reads like
// a convenience in a diff. So it is asserted here against the real bytes: the
// migration SQL as written, and the shipped page as it will run.
//
// FIVE BOUNDARIES, and what would breach each:
//
//   1. ACADEMIC   a policy, grant, view or foreign key that lets a teacher
//                 reach question_records / mastery_records / weakness_* /
//                 focus_* / exam_* / chat_sessions. T1 is identity and consent
//                 with no analytics (docs/roadmap/teacher-intelligence-layer.md
//                 §10); the first insight must arrive deliberately, not because
//                 a policy was already open.
//   2. SCOPE      any teacher-side read that does not route through an ACTIVE
//                 link to THAT student — a role check standing in for a
//                 relationship, or a predicate that forgets `status`
//   3. CONSENT    a link that can be created, or restored, by anyone but the
//                 student it describes
//   4. COMMERCE   plan, credits, founder status, xp or email crossing into the
//                 teacher's read surface (§8.4)
//   5. AUTHORITY  an assistant doing an owner's job — changing the roster,
//                 rotating codes, or approving other staff
//
// Every check is written so it COULD go red: the column-surface tests name the
// forbidden columns and assert their absence from SQL that really does select
// from profiles, rather than asserting that an empty string stays empty.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('teacher-access-scope');

const MIG = {
  a: read('supabase/migrations/20260830a_teacher_foundation_tables.sql'),
  b: read('supabase/migrations/20260830b_teacher_foundation_rls.sql'),
  c: read('supabase/migrations/20260830c_teacher_foundation_rpcs.sql'),
  d: read('supabase/migrations/20260830d_teacher_weakness_read.sql'),
  z: read('supabase/migrations/20260830z_teacher_foundation_rollback.sql'),
};
const PAGE = read('teacher.html');
const SETTINGS = read('settings.html');
const NAV = read('nav.js');

/** Executable SQL only. These files carry long design essays that legitimately
 *  NAME the tables they promise not to touch; asserting over raw text would
 *  fail on the prose documenting the property being checked. */
const exec = (sql) => sql
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');

const EXEC = Object.fromEntries(Object.entries(MIG).map(([k, v]) => [k, exec(v)]));
const FORWARD = [EXEC.a, EXEC.b, EXEC.c].join('\n');
/* Migration d is the FIRST deliberate academic read, so it is held to a
   different, narrower contract than the foundation — see section 9. Keeping it
   out of FORWARD is what lets the foundation's blanket ban stay a blanket ban. */
const WEAKNESS = EXEC.d;
/* Privilege hygiene and rollback completeness apply to every function this
   system ships, foundation or not. Only the academic-boundary ban is scoped to
   the foundation alone. */
const ALL_FORWARD = FORWARD + '\n' + WEAKNESS;

// The four tables this system is allowed to create and touch.
const OWN_TABLES = ['teacher_workspaces', 'workspace_staff', 'workspace_students', 'workspace_audit_log'];

// ══ 1 · ACADEMIC BOUNDARY ═════════════════════════════════════════════════
t.section('Academic boundary — no teacher path into a student\'s learning record');

const ACADEMIC = [
  'question_records', 'mastery_records', 'weakness_signals', 'weakness_reports',
  'focus_plans', 'focus_tasks', 'focus_xp_log', 'study_plans', 'session_questions',
  'chat_sessions', 'exam_practice_sessions', 'exam_mistakes', 'exam_forms',
  'exam_questions', 'exam_stimuli', 'exam_integrity_events', 'ai_usage_logs',
  'verification_decisions', 'analyzer_runs',
];
const academicHits = ACADEMIC.filter((tbl) => new RegExp(`\\b${tbl}\\b`).test(FORWARD));
t.is('no forward migration references an academic table', academicHits, []);

// A teacher predicate appearing on someone else's table is the exact shape of
// the breach: `create policy ... on question_records ... teacher_can_see_student`.
const policyTargets = [...FORWARD.matchAll(/create\s+policy\s+\S+\s+on\s+([a-z_.]+)/gi)].map((m) => m[1]);
t.ok('at least one policy is created (the check is not vacuous)', policyTargets.length > 0);
t.is('every policy lands on one of this system\'s own four tables',
  policyTargets.filter((x) => !OWN_TABLES.includes(x)), []);

// Foreign keys leave a permanent join path even with no policy attached.
const fkTargets = [...FORWARD.matchAll(/references\s+([a-z_.]+)\s*\(/gi)].map((m) => m[1]);
t.ok('foreign keys exist (the check is not vacuous)', fkTargets.length > 0);
t.is('every foreign key points at auth.users or this system\'s own tables',
  [...new Set(fkTargets)].filter((x) => x !== 'auth.users' && !OWN_TABLES.includes(x)), []);

// ══ 2 · SCOPE ═════════════════════════════════════════════════════════════
t.section('Scope — visibility is derived from an active link, never from a role');

const canSee = /create or replace function teacher_can_see_student[\s\S]*?\$\$([\s\S]*?)\$\$/i.exec(EXEC.b);
t.ok('teacher_can_see_student() exists', !!canSee);
const body = canSee ? canSee[1] : '';
t.ok('it joins the link table to the staff table', /workspace_students[\s\S]*join\s+workspace_staff/i.test(body));
t.ok('it requires the LINK to be active', /ws\.status\s*=\s*'active'/.test(body));
t.ok('it requires the STAFF row to be active', /st\.status\s*=\s*'active'/.test(body));
t.ok('it honours the expiry window', /ws\.expires_at is null or ws\.expires_at > now\(\)/.test(body));
t.ok('it is scoped to the calling user', /st\.user_id\s*=\s*auth\.uid\(\)/.test(body));
t.ok('it names the student it was asked about', /ws\.student_id\s*=\s*p_student/.test(body));

// The point of T1: the predicate exists and guards nothing yet. If a future
// phase wires it into a policy, that policy must be on a table this suite has
// reviewed — which check 1 already enforces.
t.ok('no academic table is guarded by it yet',
  !/on\s+(question_records|mastery_records|weakness_\w+|exam_\w+)/i.test(FORWARD));

// A role check must never be the whole authorization for seeing a student.
const roster = /create or replace function teacher_roster[\s\S]*?\$\$([\s\S]*?)\$\$/i.exec(EXEC.c);
t.ok('teacher_roster() gates on workspace membership, not on a role',
  !!roster && /workspace_is_active_staff\(p_workspace\)/.test(roster[1])
  && !/has_role_at_least/.test(roster[1]));

// ══ 3 · CONSENT ═══════════════════════════════════════════════════════════
t.section('Consent — only the student can create or restore their own link');

const guard = /create or replace function workspace_students_guard[\s\S]*?\$\$([\s\S]*?)\$\$/i.exec(EXEC.a);
t.ok('workspace_students_guard() exists', !!guard);
const g = guard ? guard[1] : '';
t.ok('INSERT is refused unless the caller IS the student',
  /new\.student_id is distinct from auth\.uid\(\)/.test(g));
t.ok('restoring a link is refused unless the caller IS the student',
  /new\.status = 'active'[\s\S]{0,240}auth\.uid\(\) is distinct from old\.student_id/.test(g));
t.ok('revoking is the student\'s own act',
  /new\.status = 'revoked'[\s\S]{0,240}auth\.uid\(\) is distinct from old\.student_id/.test(g));
t.ok('the guard runs BEFORE the write, on both verbs',
  /before insert or update on workspace_students/i.test(EXEC.a));

// A guard that a SECURITY DEFINER RPC could bypass would be decoration. It
// cannot: definer rights bypass RLS, not triggers.
t.ok('the identity the guard trusts is the session, not an argument',
  /auth\.uid\(\)/.test(g) && !/p_student/.test(g));

// ══ 4 · COMMERCE AND PII ══════════════════════════════════════════════════
t.section('Read surface — five columns, and what is deliberately missing');

const rosterSig = /create or replace function teacher_roster\(p_workspace uuid\)\s*returns table \(([\s\S]*?)\)\s*language/i.exec(EXEC.c);
t.ok('teacher_roster() declares its columns', !!rosterSig);
const cols = rosterSig ? rosterSig[1].split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean) : [];
t.is('the roster returns exactly the approved five',
  cols, ['student_id', 'full_name', 'exam_type', 'joined_at', 'status']);

// profiles IS read by the RPCs — so this check has something real to catch.
t.ok('the read surface really does select from profiles (not a vacuous check)',
  /from profiles|join profiles/i.test(EXEC.c));
const FORBIDDEN_COLS = [
  'email', 'plan_code', 'credits_balance', 'subscription_credits', 'pack_credits',
  'is_founder', 'founder_badge', 'is_admin', 'xp', 'rank_name', 'current_streak',
  'best_streak', 'target_score', 'exam_date', 'biggest_weakness', 'mastered_topics',
  'improvement_trends', 'upgrade_note', 'timezone',
];
t.is('no commercial, security or academic profile column reaches a teacher',
  FORBIDDEN_COLS.filter((c) => new RegExp(`\\b${c}\\b`).test(EXEC.c)), []);

// ══ 5 · AUTHORITY ═════════════════════════════════════════════════════════
t.section('Authority — an assistant works the roster, an owner owns it');

const OWNER_ONLY = ['teacher_rotate_join_code', 'teacher_remove_student', 'teacher_set_staff_status'];
for (const fn of OWNER_ONLY) {
  const m = new RegExp(`create or replace function ${fn}[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(EXEC.c);
  t.ok(`${fn}() requires workspace_is_owner()`, !!m && /workspace_is_owner\(/.test(m[1]));
}
t.ok('an assistant is born pending and only the owner can activate them',
  /new\.status <> 'pending'[\s\S]{0,200}born pending|assistant is always born pending/i.test(MIG.a)
  && /only the workspace owner can change staff status/.test(MIG.a));
t.ok('workspace_is_owner() is the owner column, not a staff row',
  /create or replace function workspace_is_owner[\s\S]*?w\.owner_id\s*=\s*auth\.uid\(\)/i.test(EXEC.b));

// ══ 6 · PRIVILEGES ════════════════════════════════════════════════════════
t.section('Privileges — SELECT only for clients, every function stated');

for (const tbl of OWN_TABLES) {
  t.ok(`${tbl}: RLS is enabled`, new RegExp(`alter table ${tbl}\\s+enable row level security`, 'i').test(EXEC.a));
  t.ok(`${tbl}: anon and authenticated are stripped first`,
    new RegExp(`revoke all on table ${tbl}\\s+from anon, authenticated`, 'i').test(EXEC.b));
  t.ok(`${tbl}: authenticated gets SELECT and nothing else`,
    new RegExp(`grant select on table ${tbl}\\s+to authenticated`, 'i').test(EXEC.b));
}
t.is('no write verb is granted to a client role',
  [...ALL_FORWARD.matchAll(/grant\s+(insert|update|delete|truncate)[^;]*to\s+(anon|authenticated)/gi)].map((m) => m[0]), []);

// The DEFAULT ACL on public functions grants EXECUTE to anon and authenticated,
// so a bare CREATE FUNCTION is callable by anyone logged in. Both directions of
// getting this wrong are already in the repo's history — see the header of
// 20260830b. Every function must therefore be revoked explicitly.
const created = [...ALL_FORWARD.matchAll(/create or replace function ([a-z_]+)\s*\(/gi)].map((m) => m[1]);
t.ok('functions are created (the check is not vacuous)', created.length >= 14);
const unrevoked = [...new Set(created)].filter(
  (fn) => !new RegExp(`revoke all on function ${fn}\\s*\\(`, 'i').test(ALL_FORWARD));
t.is('every function is revoked from public, anon, authenticated', unrevoked, []);

const definers = [...ALL_FORWARD.matchAll(/create or replace function [a-z_]+\([\s\S]*?security definer([\s\S]*?)as \$\$/gi)];
t.ok('security definer functions exist', definers.length >= 10);
t.is('every definer function pins its search_path',
  definers.filter((m) => !/set search_path = pg_catalog, public/.test(m[1])).length, 0);

// The platform standardised on has_role_at_least(); the legacy inline form
// re-reads a table RLS is already evaluating and drifts from the role enum.
t.ok('admin branches use has_role_at_least()', /has_role_at_least\('admin'::user_role\)/.test(EXEC.b));
t.ok('no inline is_admin predicate is copied in',
  !/from profiles[\s\S]{0,120}is_admin/i.test(FORWARD));

// ══ 7 · ROLLBACK ══════════════════════════════════════════════════════════
t.section('Rollback — written now, and complete');

const madeTables = [...EXEC.a.matchAll(/create table ([a-z_]+)/gi)].map((m) => m[1]);
const madeTypes = [...EXEC.a.matchAll(/create type ([a-z_]+)/gi)].map((m) => m[1]);
t.ok('tables and types are created (not vacuous)', madeTables.length === 4 && madeTypes.length === 4);
t.is('every table is dropped by the rollback',
  madeTables.filter((x) => !new RegExp(`drop table if exists ${x}\\b`, 'i').test(EXEC.z)), []);
t.is('every type is dropped by the rollback',
  madeTypes.filter((x) => !new RegExp(`drop type if exists ${x}\\b`, 'i').test(EXEC.z)), []);
t.is('every function is dropped by the rollback',
  [...new Set(created)].filter((x) => !new RegExp(`drop function if exists ${x}\\s*\\(`, 'i').test(EXEC.z)), []);

// ══ 8 · THE SHIPPED SURFACES ══════════════════════════════════════════════
t.section('The pages call the approved surface and nothing else');

// A page that reads an academic table directly would bypass every rule above.
const pageTables = [...PAGE.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]);
t.is('teacher.html touches no table outside this system',
  pageTables.filter((x) => !OWN_TABLES.includes(x)), []);

const pageRpcs = [...PAGE.matchAll(/\.rpc\('([a-z_]+)'/g)].map((m) => m[1]);
t.ok('teacher.html calls RPCs (not vacuous)', pageRpcs.length >= 5);
t.is('every RPC teacher.html calls is defined by these migrations',
  [...new Set(pageRpcs)].filter((fn) => !created.includes(fn)), []);

// The student's own consent surface has to exist, or the teacher page describes
// an act the student has no way to perform.
t.ok('settings.html lets a student connect to a class', /rpc\('student_join_workspace'/.test(SETTINGS));
t.ok('settings.html lets a student disconnect', /rpc\('student_leave_workspace'/.test(SETTINGS));
t.ok('settings.html shows who can currently see them', /rpc\('student_my_teachers'/.test(SETTINGS));

// Until the migrations are applied the RPC does not exist. Every page loads
// nav.js, so an unguarded call there would throw site-wide.
t.ok('nav.js tolerates the RPC not existing yet', /try \{[\s\S]{0,400}teacher_my_workspaces[\s\S]{0,400}catch/.test(NAV));

// Honesty check: the page must not display analytics it cannot compute (§6).
// Asserted as a property rather than an exact sentence — the wording is free to
// improve, the promise is not. teacher-surface.test.mjs owns the detail.
t.ok('the teacher page states what it does not show, rather than faking it',
  /could have been wrong/.test(PAGE) && /Mock Experience/.test(PAGE));

// ══ 9 · THE FIRST ACADEMIC READ ═══════════════════════════════════════════
t.section('Weakness read — narrow by construction, not by good intentions');

/* The foundation reaches no academic table. This one reaches exactly two, and
   the whole value of the boundary is that the list is short and checked. */
const WEAKNESS_ALLOWED = ['weakness_reports', 'weakness_signals'];
t.is('it reads only the two weakness tables',
  ACADEMIC.filter((tbl) => new RegExp(`\\b${tbl}\\b`).test(WEAKNESS))
    .filter((tbl) => !WEAKNESS_ALLOWED.includes(tbl)), []);
t.ok('it really does read them (not vacuous)',
  WEAKNESS_ALLOWED.every((tbl) => new RegExp(`\\b${tbl}\\b`).test(WEAKNESS)));

/* Both gates, and the pairing of the two. teacher_can_see_student() is
   caller-scoped rather than workspace-scoped, so staff of workspace A must not
   reach a student they are only linked to in workspace B. */
t.ok('it gates on workspace staff', /workspace_is_active_staff\(p_workspace\)/.test(WEAKNESS));
t.ok('it gates on the link to this student', /teacher_can_see_student\(p_student\)/.test(WEAKNESS));
t.ok('it checks the student is in THIS workspace',
  /workspace_students ws[\s\S]{0,300}ws\.workspace_id = p_workspace[\s\S]{0,200}ws\.student_id = p_student/.test(WEAKNESS));

/* The analyzer's working numbers stay with the analyzer. Handing them to a
   surface is how a second authority for severity gets built by accident. */
t.is('the analyzer\'s working numbers are withheld',
  ['weakness_score', 'mastery_score', 'improvement_score', 'recent7_count', 'recent14_count']
    .filter((c) => new RegExp(`\\b${c}\\b`).test(WEAKNESS)), []);
t.ok('but the conclusions are returned', /severity_band/.test(WEAKNESS) && /priority_rank/.test(WEAKNESS));
t.ok('a null trend is never coalesced', !/coalesce\(r\.trend/.test(WEAKNESS));

t.ok('it creates no table, policy or role', !/create (table|policy|type|role)/i.test(WEAKNESS));
t.ok('it joins no profile data', !/\bprofiles\b/.test(WEAKNESS));
t.ok('it is revoked then granted deliberately',
  /revoke all on function teacher_student_weaknesses/.test(WEAKNESS)
  && /grant execute on function teacher_student_weaknesses\(uuid, uuid\)\s+to authenticated/.test(WEAKNESS));
t.ok('it pins its search_path', /security definer[\s\S]{0,120}set search_path = pg_catalog, public/.test(WEAKNESS));
t.ok('the rollback drops it',
  /drop function if exists teacher_student_weaknesses\(uuid, uuid\)/.test(EXEC.z));

t.done();
