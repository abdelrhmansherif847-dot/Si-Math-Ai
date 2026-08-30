// The assistant re-application path — P0.
//
// A removed assistant used to be told "pending" by staff_join_workspace() while
// their row stayed "removed". They then sat on teacher.html's waiting screen
// forever, for an application that was never filed. Two things had to change,
// and this suite holds both in place:
//
//   1. TRUTH        the RPC reports the status that is actually in the row
//   2. ALLOWANCE    the guard permits removed -> pending, by the row's OWN user,
//                   and NOTHING else — in particular never removed -> active
//   3. NO GRANT     re-applying grants nothing; pending is still refused by
//                   every teaching read
//   4. REACHABLE    the assistant can get to the code box through the product,
//                   without being given staff access before approval
//
// The guard change is the risky half: it is the first time an account other
// than the workspace owner may change a workspace_staff status at all. So the
// checks below name the transitions that must stay closed, not just the one
// that opens.

import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('staff-rejoin');

const FWD  = read('supabase/migrations/20260830j_staff_rejoin.sql');
const BACK = read('supabase/migrations/20260830v_staff_rejoin_rollback.sql');
const PAGE = read('teacher.html');
const SETTINGS = read('settings.html');

/** Executable SQL only — these files carry design essays that legitimately
 *  describe the behaviour being forbidden. */
const exec = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const SQL = exec(FWD);

/** The guard body alone, so a check cannot be satisfied by the RPC's text. */
const GUARD = slice(SQL, 'create or replace function workspace_staff_guard()',
  'create or replace function staff_join_workspace', 'guard body');
/** The RPC body alone, for the same reason. */
const RPC = slice(SQL, 'create or replace function staff_join_workspace(p_code text)',
  'revoke all on function', 'rpc body');

// ══ 1 · TRUTH ═════════════════════════════════════════════════════════════
t.section('The RPC reports the status that is really in the row');

t.ok('the blanket on-conflict-do-nothing is gone',
  !/on conflict \(workspace_id, user_id\) do nothing/.test(RPC));
t.ok('the hard-coded pending answer is gone',
  !/'status',\s*'pending'/.test(RPC));
t.ok('the answer comes from a variable', /'status',\s+v_status/.test(RPC));
/* Read before write: the existing row must be consulted before a new one is
   created, or the "already pending / already active" branches can never run. */
t.ok('an existing row is read before anything is written',
  RPC.indexOf('select * into v_row from workspace_staff') > 0
  && RPC.indexOf('select * into v_row') < RPC.indexOf('insert into workspace_staff'));
t.ok('an existing non-removed row reports its own status',
  /else\s+v_status := v_row\.status;/.test(RPC.replace(/\s+/g, ' ').replace(/ /g, ' ')));

/* The audit log must record what happened, not what was attempted. */
t.ok('the audit write is conditional on something having happened',
  /if v_applied then[\s\S]{0,300}?insert into workspace_audit_log/.test(RPC));
t.ok('v_applied is only set on a real insert or update',
  (RPC.match(/v_applied := true/g) || []).length === 2);

// ══ 2 · THE ALLOWANCE, AND ITS LIMITS ═════════════════════════════════════
t.section('The guard opens exactly one transition');

t.ok('the guard really is rewritten here (not a vacuous slice)',
  /tg_op = 'INSERT'/.test(GUARD) && /workspace_staff: workspace_id, user_id and staff_role are immutable/.test(GUARD));

const ALLOW = (GUARD.match(/if old\.status = 'removed'[\s\S]*?end if;/) || [''])[0];
t.ok('the re-application block exists', ALLOW.length > 0);
t.ok('it is limited to removed -> pending', /old\.status = 'removed'/.test(ALLOW) && /new\.status = 'pending'/.test(ALLOW));
t.ok("it is limited to the row's OWN user", /new\.user_id = auth\.uid\(\)/.test(ALLOW));
t.ok('it never mentions active', !/'active'/.test(ALLOW));

/* The owner check must still stand AFTER the allowance, or the allowance
   becomes the only gate on every other transition. */
t.ok('the workspace-owner check still follows the allowance',
  GUARD.indexOf("old.status = 'removed'") < GUARD.indexOf('only the workspace owner can change staff status'));
t.ok('the teacher row is still immovable, and checked FIRST',
  GUARD.indexOf("old.staff_role = 'teacher'") < GUARD.indexOf("old.status = 'removed'"));

/* Clearing the lifecycle columns is correctness, not tidiness: the approval
   path uses coalesce(activated_at, now()), so a stale value would report the
   FIRST approval as the time of the second. */
for (const col of ['activated_at', 'activated_by', 'removed_at', 'removed_by']) {
  t.ok(`re-application clears ${col}`, new RegExp(`new\\.${col}\\s*:=\\s*null`).test(ALLOW));
}
t.ok('created_at is NOT reset — it is when they first applied here',
  !/new\.created_at/.test(GUARD));

/* Nothing else about the guard may have moved. */
for (const invariant of [
  'an assistant row can only be created by that assistant',
  'an assistant is always born pending',
  'this account is an enrolled student in this workspace',
  'the owner row must belong to the workspace owner',
  'workspace_id, user_id and staff_role are immutable',
]) {
  t.ok(`still enforced: ${invariant}`, GUARD.includes(invariant));
}

// ══ 3 · NO GRANT ══════════════════════════════════════════════════════════
t.section('Re-applying grants nothing');

t.ok('the RPC never writes a status other than pending',
  !/set status = 'active'/.test(RPC) && /set status = 'pending'/.test(RPC));
t.ok('the RPC never touches staff_role on an existing row',
  !/set[^;]*staff_role/.test(RPC));
t.ok('a new row is still born assistant/pending',
  /values \(w\.id, auth\.uid\(\), 'assistant', 'pending'\)/.test(RPC));
t.ok('privileges are restated, not widened',
  /revoke all on function staff_join_workspace\(text\) from public, anon, authenticated/.test(SQL)
  && /grant execute on function staff_join_workspace\(text\) to authenticated/.test(SQL)
  && !/to anon/.test(SQL));

/* The migration must not reach outside the two functions it names. */
t.is('it creates or replaces exactly two functions',
  (SQL.match(/create or replace function (\w+)/g) || []).sort(),
  ['create or replace function staff_join_workspace',
   'create or replace function workspace_staff_guard']);
t.ok('no table is altered', !/\balter table\b/i.test(SQL));
t.ok('no policy is touched', !/\b(create|drop|alter) policy\b/i.test(SQL));
t.ok('no trigger is redefined', !/\bcreate trigger\b/i.test(SQL));

// ══ 4 · THE ROLLBACK ══════════════════════════════════════════════════════
t.section('The rollback really restores the previous behaviour');

const BSQL = exec(BACK);
t.ok('it restores the old blanket insert',
  /on conflict \(workspace_id, user_id\) do nothing/.test(BSQL));
t.ok('it restores the hard-coded pending answer', /'status', 'pending'/.test(BSQL));
t.ok('it carries NO re-application allowance',
  !/old\.status = 'removed'\s+and new\.status = 'pending'/.test(BSQL));
t.ok('it restores both functions',
  /create or replace function workspace_staff_guard\(\)/.test(BSQL)
  && /create or replace function staff_join_workspace\(p_code text\)/.test(BSQL));

// ══ 5 · THE CLIENT ════════════════════════════════════════════════════════
t.section('teacher.html acts on the real status');

const HANDLER = slice(PAGE, "$('staffJoinBtn').addEventListener", "});", 'staff join handler');
t.ok('the handler branches on the returned status', /data\.status === 'active'/.test(HANDLER));
t.ok("only 'pending' still shows the waiting screen",
  HANDLER.indexOf("data.status === 'active'") < HANDLER.indexOf("show('pendingState')"));
t.ok('the active branch leaves the waiting screen unshown', /return;\s*\}/.test(HANDLER));
t.ok('preview returns the same shape as the RPC',
  /if \(S\.preview\) return \{ name: FIXTURE\.ws\.name, status: 'pending' \};/.test(PAGE));

t.section('The assistant can reach the code box through the product');

/* The box lives on teacher.html, whose only links are gated on ACTIVE staff.
   Settings is reachable by everyone and is already where class relationships
   are managed, so the way in belongs there. */
const CARD = slice(SETTINGS, 'id="teacherSection"', 'Privacy &amp; Security', 'teachers card');
t.ok('settings links to the assistant code box', /href="teacher\.html"/.test(CARD));
t.ok('it says what an assistant code is', /assistant code/i.test(CARD));
t.ok('it promises no access before approval', /until they approve you/i.test(CARD));

/* A link is not access. Nothing here may hand staff capability to a caller who
   has not been approved — that is the whole point of the pending state. */
t.ok('settings gained no staff RPC', !/teacher_roster|teacher_student_card|teacher_student_weaknesses/.test(SETTINGS));
t.ok('nav.js still gates Teaching on ACTIVE staff only',
  /teaching = x\.can_staff === true/.test(read('nav.js'))
  && !/pending_count/.test(read('nav.js')));

t.done();
