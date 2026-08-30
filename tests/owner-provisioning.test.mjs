// Owner provisioning — the surface that finally lets a workspace exist.
//
// Until this, no workspace could be created through the product at all:
// teacher_create_workspace() had no caller anywhere in the site, so no class
// code could exist, so the "Connect to a class" box every student now sees in
// Settings could never succeed.
//
// FIVE PROPERTIES:
//   1. SOLE WRITER   the client calls the RPC and never touches a workspace
//                    table — the RPC does the workspace, the teacher staff row,
//                    both codes and the audit entry in one transaction
//   2. NO NEW REACH  the account search reuses the query Role Management
//                    already runs. No new lookup RPC, no new path to profiles
//   3. NOT A ROLE    creating the workspace is what makes a Teacher. Nothing
//                    here writes profiles.role or grants admin
//   4. OWNER ONLY    enforced in the DATABASE. The page's hiding is a display
//                    rule and is asserted to be exactly that, so nobody mistakes
//                    it for the boundary
//   5. GUARDRAIL     one class per teacher until the selector exists, because
//                    teacher.html renders only the first workspace it is handed

import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('owner-provisioning');

const PAGE = read('admin.html');
const FWD  = read('supabase/migrations/20260830k_owner_only_provisioning.sql');
const BACK = read('supabase/migrations/20260830u_owner_only_provisioning_rollback.sql');
const exec = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const SQL  = exec(FWD);

/** The provisioning JS only, so a check cannot be satisfied by another panel. */
const JS = slice(PAGE, '/* ── Teacher Workspaces (owner only)', '\ninit();', 'provisioning JS');

// ══ 1 · SOLE WRITER ═══════════════════════════════════════════════════════
t.section('The RPC is the only writer; the client writes nothing');

t.ok('the panel exists', /id="teacherWsPanel"/.test(PAGE));
t.ok('creation goes through the RPC', /sb\.rpc\('teacher_create_workspace',\s*\n?\s*\{ p_owner: TW\.pick\.id, p_name: name \}\)/.test(JS));

/* The client must never insert, update or delete a workspace row. If it could,
   the atomic guarantee (workspace + teacher staff row + codes + audit in one
   transaction) would be one careless call away from being lost. */
for (const tbl of ['teacher_workspaces', 'workspace_staff', 'workspace_students', 'workspace_audit_log']) {
  for (const verb of ['insert', 'update', 'delete', 'upsert']) {
    t.ok(`the client never calls .${verb}() on ${tbl}`,
      !new RegExp(`from\\('${tbl}'\\)[\\s\\S]{0,120}?\\.${verb}\\(`).test(JS));
  }
}
t.ok('the client only SELECTs from workspace tables',
  (JS.match(/from\('(teacher_workspaces|workspace_students)'\)/g) || []).length >= 2
  && /from\('teacher_workspaces'\)\s*\n?\s*\.select\(/.test(JS));

// ══ 2 · NO NEW REACH ══════════════════════════════════════════════════════
t.section('The account search adds no new way to reach profiles');

/* Role Management already runs exactly this query. Admins can already select
   every profile row (RLS admin_select_profiles), so a second, narrower path
   would be more surface for no less exposure. */
const ROLE_MGMT_QUERY = /from\('profiles'\)\s*\n?\s*\.select\('id, email, full_name, role'\)\.ilike\('email', '%' \+ q \+ '%'\)\.limit\(50\)/;
t.ok('Role Management still runs the search this reuses', ROLE_MGMT_QUERY.test(PAGE));
t.ok('provisioning runs the SAME query, not a new one', ROLE_MGMT_QUERY.test(JS));
t.ok('no account-lookup RPC was introduced',
  !/rpc\('admin_find_account'|rpc\('admin_lookup|rpc\('find_account/.test(PAGE));

/* And it must not have quietly widened what is selected about an account. */
const selected = (JS.match(/from\('profiles'\)\s*\n?\s*\.select\('([^']*)'\)/g) || []).join(' ');
t.is('provisioning selects no column beyond what Role Management shows',
  ['plan_code', 'credits_balance', 'is_founder', 'xp', 'subscription_credits']
    .filter((c) => selected.includes(c)), []);

// ══ 3 · NOT A ROLE ════════════════════════════════════════════════════════
t.section('Creating a workspace is what makes a Teacher');

t.ok('nothing here writes profiles.role', !/change_user_role|role:\s*'|\.update\(\{[^}]*role/.test(JS));
t.ok('nothing here grants admin', !/is_admin/.test(JS));
t.ok('the page says so in words',
  /no platform role/i.test(PAGE) && /never become an admin|gains no platform role/i.test(PAGE));

// ══ 4 · OWNER ONLY, IN THE DATABASE ═══════════════════════════════════════
t.section('Owner-only is enforced by the migration, not by hiding the panel');

t.ok('the migration replaces the creation RPC',
  /create or replace function teacher_create_workspace\(p_owner uuid, p_name text\)/.test(SQL));
t.ok("the gate is an equality on 'owner', not a rung comparison",
  /current_user_role\(\) <> 'owner'::user_role/.test(SQL));
t.ok('the old admin gate is gone from the new body',
  !/has_role_at_least\('admin'/.test(SQL));

/* Everything else about the function must be untouched, or this stops being a
   one-line authorization change. */
for (const kept of [
  'security definer', 'set search_path = pg_catalog, public',
  "raise exception 'teacher_create_workspace: unknown owner'",
  'workspace_new_code()', "'teacher', 'active'", "'workspace_created'",
  'when unique_violation then',
]) {
  t.ok(`still present: ${kept}`, SQL.includes(kept));
}
t.is('the migration replaces exactly one function',
  (SQL.match(/create or replace function (\w+)/g) || []),
  ['create or replace function teacher_create_workspace']);
t.ok('no policy, table or trigger is touched',
  !/\b(alter table|create policy|drop policy|create trigger)\b/i.test(SQL));
t.ok('privileges are restated, never widened',
  /revoke all on function teacher_create_workspace\(uuid, text\) from public, anon, authenticated/.test(SQL)
  && !/to anon/.test(SQL));

/* The page's own gating must be documented as a display rule. A future reader
   who believes the panel is the boundary would remove the migration. */
t.ok('the page records that hiding the panel is NOT the boundary',
  /DISPLAY rule, not a boundary/.test(PAGE));
t.ok('the create handler surfaces the server refusal rather than hiding it',
  /twSay\(e\.message/.test(JS));

// ── the rollback ──────────────────────────────────────────────────────────
const BSQL = exec(BACK);
t.ok('the rollback restores the admin gate', /has_role_at_least\('admin'::user_role\)/.test(BSQL));
t.ok('the rollback carries no owner-only gate', !/current_user_role\(\) <> 'owner'/.test(BSQL));

// ══ 5 · THE GUARDRAIL ═════════════════════════════════════════════════════
t.section('One class per teacher, until the selector exists');

/* teacher.html renders only the first active workspace, so a second class would
   be created and then be unreachable for its teacher. */
t.ok('teacher.html still renders only the first workspace (the reason for this)',
  /rows\.find\(\(r\) => r\.staff_status === 'active'\)/.test(read('teacher.html')));
t.ok('accounts that already teach are tracked', /TW\.teaching\s*=\s*new Set\(/.test(JS));
t.ok('only ACTIVE workspaces count toward it', /rows\.filter\(w => w\.is_active\)\.map\(w => w\.owner_id\)/.test(JS));
t.ok('the search marks them and offers no Select button',
  /already teaches a class/.test(JS) && /already\s*\n?\s*\? '<span/.test(JS.replace(/\s+/g, (m) => m.includes('\n') ? '\n' : ' ')));
t.ok('and creation refuses them even if the button is reached',
  /if \(TW\.teaching\.has\(TW\.pick\.id\)\) \{[\s\S]{0,300}?return;/.test(JS));
t.ok('the guardrail is documented as a guardrail, not a boundary',
  /GUARDRAIL, not a boundary/.test(JS));

// ══ 6 · WHAT THE OWNER IS SHOWN ═══════════════════════════════════════════
t.section('After creation the Owner is shown the codes and what they are for');

const CREATED = slice(PAGE, 'function twShowCreated', '\n}', 'created panel');
t.ok('the class name is shown', /esc\(w\.name\)/.test(CREATED));
t.ok('the teacher is named', /teacher\.name \|\| teacher\.email/.test(CREATED));
t.ok('the student code is shown', /esc\(w\.student_join_code\)/.test(CREATED));
t.ok('the staff code is shown', /esc\(w\.staff_join_code\)/.test(CREATED));
t.ok('the creation time is shown', /fmtDate\(w\.created_at\)/.test(CREATED));
t.ok('it says what the STUDENT code is for', /Settings/.test(CREATED) && /consent/i.test(CREATED));
t.ok('it warns that the staff code mints assistants',
  /assistants/i.test(CREATED) && /pending/i.test(CREATED));

/* The read-back must not use teacher_my_workspaces(): the Owner is not staff of
   the workspace, so that RPC correctly returns nothing and the panel would
   silently show an empty list. */
/* Assert on the CALL, not the prose: the comment above the list legitimately
   names teacher_my_workspaces() to explain why it is not used. */
t.ok('the list reads the table directly, not teacher_my_workspaces()',
  !/rpc\('teacher_my_workspaces'\)/.test(JS) && /from\('teacher_workspaces'\)/.test(JS));

t.done();
