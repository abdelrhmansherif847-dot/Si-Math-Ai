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
import { read, slice, evalSnippet } from './_source.mjs';

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


// ══ 7 · THE SELECT-HANDLER BUG, AND ITS WHOLE CLASS ═══════════════════════
t.section('Selecting an account cannot be broken by the characters in a name');

/* The bug: the Select handler was built by concatenating values into an inline
   onclick. esc() escapes & < > and " but NOT the apostrophe, so a name like
   O'Brien produced
       onclick="twSelect('id','email','Abdo O'Brien')"
   — broken JavaScript. Clicking Select did nothing, TW.pick stayed null, the
   Create button never enabled, and clicking it was silent because a disabled
   button cannot reach its own guidance. Found by driving the real page
   headlessly, not by reading it. */

/* Executable code only. The panel's comment legitimately quotes the broken
   onclick it replaced, and asserting over raw text would fail on the very
   documentation of the fix. */
const CODE = JS.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
  .filter((l) => !l.trim().startsWith('//')).join('\n');
t.ok('the stripped code is still the real thing (not emptied)',
  /twRenderResults/.test(CODE) && CODE.length > 2000);
t.ok('no inline event handler is generated anywhere in the panel',
  !/onclick=/.test(CODE) && !/onchange=|oninput=/.test(CODE));
t.ok('identity travels as data attributes', /data-id="' \+ esc\(u\.id\)/.test(JS));
t.ok('a delegated listener reads them back',
  /closest\('\.tw-pick'\)/.test(JS) && /twSelect\(row\.dataset\.id, row\.dataset\.email, row\.dataset\.name\)/.test(JS));

/* Executable: run the REAL twRenderResults over names built to break the old
   code, and assert the markup it produces is inert and complete. */
const RENDER = slice(PAGE, 'function twRenderResults', 'function twSelect', 'twRenderResults');
const ESC = slice(PAGE, 'function esc(str)', 'function fmtDate', 'esc');
const HOSTILE = [
  { id: 'u1', email: "o'brien@example.com", full_name: "Abdo O'Brien", role: 'user' },
  { id: 'u2', email: 'q@example.com', full_name: 'A "quoted" name', role: 'user' },
  { id: 'u3', email: 'amp@example.com', full_name: 'Tom & Jerry', role: 'user' },
  { id: 'u4', email: 'x@example.com', full_name: '</div><script>alert(1)</script>', role: 'user' },
];
const box = { innerHTML: '' };
const { twRenderResults } = evalSnippet(
  `${ESC}\nconst TW = { teaching: new Set() };\n` +
  `const document = { getElementById: () => box };\n${RENDER}`,
  { box }, ['twRenderResults']);
twRenderResults(HOSTILE);
const html = box.innerHTML;

t.ok('the render produced markup (not a vacuous empty string)', html.length > 200);
t.ok('every hostile account still yields a selectable row',
  (html.match(/class="tw-pick"/g) || []).length === HOSTILE.length);
t.ok('no onclick survives into the markup', !/onclick/.test(html));
t.ok("an apostrophe reaches the data attribute intact", /data-name="Abdo O'Brien"/.test(html));
t.ok('a double quote is escaped, so the attribute cannot be closed early',
  /data-name="A &quot;quoted&quot; name"/.test(html));
t.ok('an ampersand is escaped', /Tom &amp; Jerry/.test(html));
t.ok('injected markup is neutralised', !/<script>alert/.test(html) && /&lt;\/div&gt;/.test(html));

// ══ 8 · NO SILENT DEAD END ════════════════════════════════════════════════
t.section('The Create button always explains itself');

t.ok('the button is NOT born disabled',
  !/id="twCreateBtn" disabled/.test(PAGE) && /id="twCreateBtn">Create workspace/.test(PAGE));
t.ok('twSelect no longer has to enable it', !/twCreateBtn'\)\.disabled = false/.test(JS));
/* Assert the PROPERTY, not the prose: nothing chosen must produce a visible
   explanation and stop, whatever the wording becomes. */
t.ok('clicking with nothing chosen explains what is missing and stops',
  /if \(!TW\.pick\) \{ twSay\('[^']{20,}', 'err'\); return; \}/.test(JS));
t.ok('and it does not call the account "the teacher" as if it already were one',
  !/twSay\('Choose the teacher/.test(JS));
t.ok('an invalid class name explains itself too',
  /name\.length < 2 \|\| name\.length > 80[\s\S]{0,120}?twSay\(/.test(JS));
t.ok('the button always becomes usable again', /\} finally \{[\s\S]{0,80}?btn\.disabled = false;/.test(JS));
t.ok('a stale message is cleared before each attempt',
  JS.indexOf('twClearMsg();') < JS.indexOf("sb.rpc('teacher_create_workspace'"));

// ══ 9 · A CREATED WORKSPACE IS NEVER REPORTED AS A FAILURE ════════════════
t.section('The read-back cannot turn a success into a crash');

/* Once the RPC returns an id the workspace EXISTS. twShowCreated(null) used to
   throw on w.name and the catch reported that crash as if creation had failed. */
t.ok('the read-back uses maybeSingle, so zero rows is not an error',
  /\.eq\('id', newId\)\.maybeSingle\(\)/.test(JS) && !/\.eq\('id', newId\)\.single\(\)/.test(JS));
t.ok('twShowCreated is only called with a row', /if \(w\) \{[\s\S]{0,120}?twShowCreated\(w, TW\.pick\)/.test(JS));
t.ok('a missing read-back says the workspace exists anyway',
  /was created, but its codes could not be read back/.test(JS));
t.ok('the list is reloaded either way',
  JS.indexOf('await loadTeacherWorkspaces();') > JS.indexOf('could not be read back'));


// ══ 10 · THE COPY MATCHES THE MODEL ═══════════════════════════════════════
t.section('The wording says the account BECOMES the teacher, not that it is one');

/* "Choose the teacher" described the opposite of how this works: nobody is a
   teacher until a class is created for them. Read as a prerequisite, it makes a
   correct flow look broken. */
t.ok('step 1 asks for an account to MAKE the teacher',
  /Choose the account that will teach this class/.test(PAGE));
t.ok('and says explicitly that nothing must be set up first',
  /It becomes the teacher when you create the class/.test(PAGE));
t.ok('the selected panel names an ACCOUNT', /Selected account: <strong>/.test(JS));
t.ok('and says creating the class is what makes it a teacher',
  /Creating the class is what makes this account a teacher/.test(JS));
t.ok('no step calls it "the teacher" as a precondition',
  !/1 · Choose the teacher</.test(PAGE) && !/'Teacher: <strong>'/.test(JS));
t.ok('a no-match result explains the account must already exist',
  /must already have a Si Math AI account/.test(JS));

// ══ 11 · SEARCH IS NOT ENTER-ONLY ═════════════════════════════════════════
t.section('Every control in step 1 can be reached without guessing');

t.ok('a Search button exists', /id="twSearchBtn"/.test(PAGE));
t.ok('the button and the Enter key run the SAME search',
  /const runSearch = async \(\) =>/.test(JS)
  && /sbtn\.addEventListener\('click', runSearch\)/.test(JS)
  && /if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); runSearch\(\); \}/.test(JS));
/* Scoped to THIS panel. Role Management has its own Enter-only search; it is
   a pre-existing control in someone else's section and not this increment's to
   change, so asserting over the whole page would fail on it. */
const PANEL = slice(PAGE, 'id="teacherWsPanel"', '<!-- ============== END OVERVIEW', 'provisioning panel');
t.ok('the panel really is the sliced region', /twSearchInput/.test(PANEL) && /twCreateBtn/.test(PANEL));
t.ok('this panel\'s placeholder no longer demands Enter', !/press Enter/.test(PANEL));
t.ok('an empty search says what to do rather than blanking',
  /Type an email address to search/.test(JS));
t.ok('a failed search reports the error instead of showing nothing',
  /Could not search: ' \+ esc\(error\.message\)/.test(JS));

t.done();
