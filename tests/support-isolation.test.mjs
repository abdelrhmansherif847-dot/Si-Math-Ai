// Isolation suite for the Help & Support system.
//
// The support system's whole justification is that it is SEPARATE: separate
// from Zero, separate from the academic record, separate from the credentials
// that create meetings. Separation is easy to assert in a document and easy to
// lose in a diff, so this suite asserts it against the real shipped bytes —
// the migration SQL as written, and the provider modules imported and executed.
//
// FIVE BOUNDARIES, and what would breach each:
//
//   1. ACADEMIC   a foreign key, column or write from support into
//                 question_records / mastery_records / weakness_* / focus_* /
//                 study_plans / session_questions / chat_sessions
//   2. ZERO       an AI call, model name or prompt anywhere in the support
//                 surface — the owner's rule is that no ticket is answered by a
//                 model, and "no automatic AI handling" has to be checkable
//   3. TENANT     a student reading or writing another student's ticket,
//                 message, attachment or meeting; or granting their own meeting
//   4. CREDENTIAL a provider secret, or Zoom's host-authenticated start_url,
//                 reaching a row a student can read or a response body
//   5. STORAGE    an upload that is not bound to a live ticket the caller owns
//
// Every check here is written so it COULD go red: the redaction tests feed the
// real function a payload containing every forbidden key and assert each is
// absent, rather than asserting that a clean payload stays clean.

import { suite } from './_assert.mjs';
import { read, importTS } from './_source.mjs';

const t = suite('support-isolation');

const MIG = {
  a: read('supabase/migrations/20260815a_support_enums_tables.sql'),
  b: read('supabase/migrations/20260815b_support_rls.sql'),
  c: read('supabase/migrations/20260815c_support_trigger.sql'),
  d: read('supabase/migrations/20260815d_support_rpcs.sql'),
  e: read('supabase/migrations/20260815e_support_storage.sql'),
  f: read('supabase/migrations/20260815f_support_seed.sql'),
};
const FN = read('supabase/functions/support-actions/index.ts');
const PROVIDER_SRC = read('supabase/functions/_shared/support-provider.core.ts');
const ZOOM_SRC = read('supabase/functions/_shared/support-zoom.core.ts');

/** Executable SQL only. Every one of these files carries long design essays in
 *  comments that legitimately NAME the academic tables while explaining why
 *  support does not touch them; asserting over raw text would fail on the prose
 *  that documents the property it is checking. */
const exec = (sql) => sql.split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const EXEC = Object.fromEntries(Object.entries(MIG).map(([k, v]) => [k, exec(v)]));
const ALL_EXEC = Object.values(EXEC).join('\n');

// ══ 1 · ACADEMIC BOUNDARY ═════════════════════════════════════════════════
// A support ticket must never become an input to what the platform believes
// about a student's mathematics. The schema makes that structural rather than
// conventional: no support table references an academic one, in either
// direction, and no support code writes to one.

const ACADEMIC = [
  'question_records', 'mastery_records', 'weakness_reports', 'weakness_signals',
  'focus_plans', 'focus_tasks', 'study_plans', 'session_questions',
  'chat_sessions', 'exam_mistakes', 'ai_usage_logs', 'ai_model_calls',
];

for (const table of ACADEMIC) {
  t.ok(`migrations never name ${table} in executable SQL`,
    !new RegExp(`\\b${table}\\b`).test(ALL_EXEC));
}

t.ok('no support table takes a foreign key into an academic table',
  !/references\s+public\.(question_records|mastery_records|weakness_\w+|focus_\w+|study_plans|session_questions|chat_sessions|exam_mistakes)/i
    .test(EXEC.a));

t.ok('the only cross-schema references are auth.users and public.profiles',
  (EXEC.a.match(/references\s+(auth|public)\.(\w+)/g) ?? [])
    .every((m) => /support_\w+|auth\.users|public\.profiles/.test(m)));

t.ok('the Edge Function never touches an academic table',
  !ACADEMIC.some((tbl) => new RegExp(`['"\`]${tbl}['"\`]`).test(FN)));

// ══ 2 · ZERO BOUNDARY ═════════════════════════════════════════════════════
// "Do not merge this functionality into Zero AI Tutor" and "no automatic AI
// handling of support tickets" are product rules. They are only real if a
// future diff that adds a model call to the support surface fails a check.

const AI_MARKERS = [
  'openai', 'anthropic', 'gpt-', 'claude-', 'ai-tutor', 'completions',
  'system_prompt', 'systemPrompt', 'OPENAI_KEY', 'zero_personality',
];
for (const marker of AI_MARKERS) {
  t.ok(`support Edge Function contains no AI marker: ${marker}`,
    !new RegExp(marker.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i').test(FN));
  t.ok(`support migrations contain no AI marker: ${marker}`,
    !new RegExp(marker.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i').test(ALL_EXEC));
}

t.ok('sender_role has exactly three values and none of them is a model',
  /create type public\.support_sender_role as enum \('student', 'agent', 'system'\)/.test(EXEC.a));

t.ok("only admin_support_reply writes sender_role 'agent'",
  /insert into public\.support_messages \(ticket_id, sender_id, sender_role, body\)\s*\n\s*values \(p_ticket_id, auth\.uid\(\), 'agent', p_body\)/.test(EXEC.d) &&
  (EXEC.d.match(/sender_role[\s\S]{0,80}?'agent'/g) ?? []).length === 1);

// ══ 3 · TENANT BOUNDARY ═══════════════════════════════════════════════════
// One student must not reach another's support conversation, and no student
// may authorise their own meeting — the single rule the escalation design
// exists to enforce.

t.ok('tickets are readable only by their owner or an agent',
  /support_tickets_read_own[\s\S]*?using \(\s*user_id = auth\.uid\(\) or has_role_at_least\('admin'\)\s*\)/.test(EXEC.b));

t.ok('a student cannot insert a ticket for someone else',
  /support_tickets_insert_own[\s\S]*?user_id = auth\.uid\(\)/.test(EXEC.b));

t.ok('a student cannot open a ticket that is already meeting-granted',
  /support_tickets_insert_own[\s\S]*?meeting_granted = false/.test(EXEC.b));

t.ok('a student cannot open a ticket pre-assigned or pre-resolved',
  /support_tickets_insert_own[\s\S]*?assigned_to is null[\s\S]*?resolved_at is null[\s\S]*?closed_at is null/.test(EXEC.b));

t.ok('THERE IS NO STUDENT UPDATE POLICY ON support_tickets',
  !/create policy support_tickets_(update|write)_own/.test(EXEC.b));

t.ok('the only ticket policy granting UPDATE is the admin one',
  (EXEC.b.match(/create policy support_tickets_\w+/g) ?? []).join(',') ===
    'create policy support_tickets_read_own,create policy support_tickets_insert_own,create policy support_tickets_admin_all');

t.ok('messages are readable only via a ticket the caller owns',
  /support_messages_read_own[\s\S]*?t\.user_id = auth\.uid\(\)/.test(EXEC.b));

t.ok("a student's message is pinned to sender_role 'student'",
  /support_messages_insert_own[\s\S]*?sender_role = 'student'/.test(EXEC.b));

t.ok('posting is gated by the shared lifecycle predicate',
  /support_messages_insert_own[\s\S]*?support_student_can_post\(ticket_id\)/.test(EXEC.b));

t.ok('granting a meeting is refused for a non-agent by the row guard',
  /meeting_granted[\s\S]*?has_role_at_least\('admin'\)[\s\S]*?raise exception/.test(EXEC.a));

t.ok('the grant is spent by a trigger, not by client code',
  /create trigger support_meetings_consume_grant[\s\S]*?after insert on public\.support_meetings/.test(EXEC.a));

// A check that read `A === G - (G - A)` used to sit here. It reduces
// algebraically to A === A and could never have failed — precisely the vacuous
// assertion docs/roadmap/verification-framework-audit.md exists to forbid. It
// is deleted rather than repaired: the nine per-function checks below do the
// real work, one function at a time, and each of them can go red.

for (const fn of ['admin_support_reply', 'admin_support_set_status', 'admin_support_assign',
  'admin_support_grant_meeting', 'admin_support_revoke_meeting',
  'admin_support_schedule_for_student', 'admin_support_upsert_slot',
  'admin_support_cancel_slot', 'admin_support_upsert_article']) {
  const body = EXEC.d.split(`create or replace function public.${fn}`)[1] ?? '';
  t.ok(`${fn}() calls support_require_agent() before doing anything`,
    /^[\s\S]{0,600}?perform public\.support_require_agent\(\);/.test(body));
}

// ══ 4 · CREDENTIAL BOUNDARY ═══════════════════════════════════════════════
// The one that would be worst to get wrong, because provider_ref is a column a
// student can SELECT. These run the REAL redaction function.

// importTS appends its own `export {...}` line, so the module's own `export`
// keywords are stripped first — the declarations, and therefore the behaviour
// under test, are the real shipped ones either way.
const provider = await importTS(PROVIDER_SRC.replace(/^export /gm, ''), [
  'PROVIDER_REF_ALLOWED', 'PROVIDER_REF_FORBIDDEN',
  'redactProviderRef', 'isSafeProviderRef', 'isValidProviderName',
]);

// A realistic Zoom create-meeting response, including the fields that are
// dangerous. If redaction is ever weakened, these go red.
const ZOOM_RESPONSE = {
  provider: 'zoom',
  meeting_id: 84512345678,
  id: 84512345678,
  join_url: 'https://zoom.us/j/84512345678?pwd=abc',
  start_url: 'https://zoom.us/s/84512345678?zak=eyJhbGciOi_HOST_TOKEN',
  password: 'q7Rt2p',
  passcode: 'q7Rt2p',
  encrypted_password: 'ZW5jcnlwdGVkLXBhc3N3b3Jk',
  host_email: 'agent@simathai.com',
  host_id: 'abc123hostid',
  starts_at: '2026-08-20T13:00:00Z',
  start_time: '2026-08-20T13:00:00Z',
  access_token: 'eyJhbGciOiJIUzI1NiJ9.SECRET',
  settings: { host_video: true, alternative_hosts: 'someone@example.com' },
  registration_url: 'https://zoom.us/meeting/register/xyz',
};

const redacted = provider.redactProviderRef(ZOOM_RESPONSE);

for (const forbidden of provider.PROVIDER_REF_FORBIDDEN) {
  t.ok(`redaction drops '${forbidden}' from what reaches the database`,
    !(forbidden in redacted));
}

t.ok('start_url — the Zoom HOST credential — is absent',
  !('start_url' in redacted) && !JSON.stringify(redacted).includes('HOST_TOKEN'));

t.ok('no value anywhere in the redacted ref contains a host token',
  !JSON.stringify(redacted).includes('zak='));

t.ok('the attendee join_url IS kept — redaction that dropped everything would be useless',
  redacted.join_url === 'https://zoom.us/j/84512345678?pwd=abc');

t.ok('the passcode is kept, the encrypted one is not',
  redacted.passcode === 'q7Rt2p' && !('encrypted_password' in redacted));

t.ok('every surviving key is on the allow-list',
  Object.keys(redacted).every((k) => provider.PROVIDER_REF_ALLOWED.includes(k)));

t.ok('redaction is an allow-list: an unknown future field does not survive',
  !('some_new_zoom_field_2027' in
    provider.redactProviderRef({ ...ZOOM_RESPONSE, some_new_zoom_field_2027: 'leak' })));

t.ok('nested objects are dropped rather than recursed into',
  !('settings' in redacted));

t.ok('isSafeProviderRef rejects a ref carrying a forbidden key',
  provider.isSafeProviderRef({ join_url: 'x' }) === true &&
  provider.isSafeProviderRef({ join_url: 'x', start_url: 'y' }) === false);

t.ok('isSafeProviderRef rejects a nested value',
  provider.isSafeProviderRef({ join_url: 'x', passcode: { a: 1 } }) === false);

t.ok('provider names are constrained exactly as support_slots_provider_chk is',
  provider.isValidProviderName('zoom') === true &&
  provider.isValidProviderName('Zoom') === false &&
  provider.isValidProviderName('a') === false &&
  provider.isValidProviderName('meet_v2') === true &&
  provider.isValidProviderName('drop table') === false);

// The secrets themselves: named only in the adapter, never sent anywhere.
const SECRETS = ['ZOOM_CLIENT_SECRET', 'ZOOM_CLIENT_ID', 'ZOOM_ACCOUNT_ID', 'ZOOM_USER_ID'];
for (const s of SECRETS) {
  t.ok(`${s} is read only inside the Zoom adapter`, !new RegExp(s).test(FN));
}
t.ok('the adapter reads its secrets from the environment, not from a table',
  SECRETS.every((s) => new RegExp(`get\\('${s}'\\)`).test(ZOOM_SRC)));
t.ok('no support frontend page names a provider secret',
  SECRETS.every((s) => !new RegExp(s).test(read('support.html') + read('admin-support.html'))));
t.ok('no support frontend page calls a provider API directly',
  !/zoom\.us|api\.zoom/i.test(read('support.html') + read('admin-support.html')));

t.ok('the Edge Function never returns a provider payload to the caller',
  !/json\(\s*\{[^}]*provider_ref/.test(FN) && !/json\(\s*\{[^}]*join_url/.test(FN));

t.ok('the function redacts AND re-checks before writing',
  /redactProviderRef\(raw\)/.test(FN) && /isSafeProviderRef\(ref\)/.test(FN));

t.ok('an unsafe ref is refused rather than written',
  /if \(!isSafeProviderRef\(ref\)[\s\S]{0,400}?return 'provider_failed'/.test(FN));

// ══ 5 · STORAGE BOUNDARY ══════════════════════════════════════════════════
// Revision 1 of 20260815e accepted `${uid}/anything.png` — no ticket required —
// which made the bucket an open image host. These assert the fix is present.

t.ok('the bucket is private',
  /insert into storage\.buckets[\s\S]*?'support-attachments',[\s\S]*?false,/.test(EXEC.e));

t.ok('upload requires BOTH a uid segment and a ticket segment',
  /array_length\(v_parts, 1\), 0\) < 2/.test(EXEC.e));

t.ok('the first path segment must be the caller',
  /v_parts\[1\] is distinct from auth\.uid\(\)::text/.test(EXEC.e));

t.ok('the second segment is checked with the SAME lifecycle predicate as the row',
  /return public\.support_student_can_post\(v_ticket\)/.test(EXEC.e));

t.ok('a malformed ticket id is refused, not raised',
  /exception when invalid_text_representation then\s*\n\s*return false/.test(EXEC.e));

t.ok('there is no UPDATE policy on support attachment objects',
  !/create policy "support attachments[^"]*" *\n?\s*on storage\.objects for update/.test(EXEC.e));

t.ok('deletion of attachments is agent-only',
  /support attachments: delete by agent[\s\S]*?has_role_at_least\('admin'\)/.test(EXEC.e));

t.ok('the support bucket is separate from payment-proofs',
  /'support-attachments'/.test(EXEC.e) && !/payment-proofs/.test(EXEC.e));

// ══ 6 · THE CHAIN'S OWN INVARIANTS ════════════════════════════════════════
// Not a boundary, but the properties the review established, so that a later
// edit to a PREPARED migration cannot quietly undo one.

t.ok('all six migrations are still marked PREPARED — NOT YET APPLIED',
  Object.values(MIG).every((m) => /STATUS: ⛔ PREPARED — NOT YET APPLIED/.test(m)));

t.ok('the rollback exists and is also PREPARED',
  /STATUS: ⛔ PREPARED — NOT YET APPLIED/.test(read('supabase/migrations/20260815z_support_rollback.sql')));

t.ok('the meeting cap is enforced under an advisory lock on BOTH booking doors',
  /pg_advisory_xact_lock\(20260815, hashtext/.test(EXEC.d) &&
  (EXEC.d.match(/support_assert_meeting_capacity\(/g) ?? []).length >= 3);

// EXEC.d, not MIG.d: revision 6's header quotes the broken line verbatim while
// explaining the defect, so the raw file legitimately contains the string it
// exists to have removed from the executable SQL.
t.ok('no GET STACKED DIAGNOSTICS item outside the real set',
  !/pg_exception_constraint/.test(EXEC.d) &&
  (EXEC.d.match(/get stacked diagnostics v_constraint = constraint_name;/g) ?? []).length === 2);

t.ok('the three policy settings ship UNSET rather than with invented values',
  /'support\.reopen_window_days',\s*\n?\s*'',/.test(EXEC.f) &&
  /'support\.auto_close_after_resolved_days',\s*\n?\s*'',/.test(EXEC.f) &&
  /'support\.max_active_meetings_per_student',\s*\n?\s*'',/.test(EXEC.f));

t.ok('the Edge Function reports an unapplied schema instead of crashing',
  /schema_not_ready/.test(FN) && /42P01/.test(FN));

t.ok('the sweep reports its cap rather than truncating silently',
  /capped: SWEEP_LIMIT/.test(FN));

// ══ 7 · THE FIXED MEETING LIFECYCLE ═══════════════════════════════════════
// Six defects were found by reviewing this phase rather than by running it.
// These are the checks that would have caught each one.

const STUDENT_PAGE = read('support.html');
const AGENT_PAGE = read('admin-support.html');

// D1 — the function had no caller anywhere, so a booked meeting never got a link
const BOOK_SLOT = STUDENT_PAGE.slice(
  STUDENT_PAGE.indexOf('async function bookSlot'),
  STUDENT_PAGE.indexOf('async function provisionMeeting'));
t.ok('D1: bookSlot calls the RPC and then asks for the link',
  /support_book_meeting/.test(BOOK_SLOT) && /provisionMeeting\(/.test(BOOK_SLOT));
t.ok('D1: both pages invoke the Edge Function by name',
  /functions\.invoke\('support-actions'/.test(STUDENT_PAGE) &&
  /functions\.invoke\('support-actions'/.test(AGENT_PAGE));
t.ok('D1: the agent page can run a sweep',
  /action: 'sweep'/.test(AGENT_PAGE) && /sweepBtn/.test(AGENT_PAGE));

// D2 — release() was not awaited, and provider_ref was cleared regardless
t.ok('D2: the provider release is awaited',
  /await provider\.release\(String\(pid\)\)/.test(FN));
t.ok('D2: provider_ref is cleared only after a successful release',
  /await provider\.release[\s\S]{0,700}?return json\(\{ ok: false, status: 'provider_failed' \}, 502\)[\s\S]{0,600}?update\(\{ provider_ref: \{\} \}\)/.test(FN));

// D3 — cancelling stopped at Postgres, leaving a live room and a working link
t.ok('D3: cancelling releases at the provider, from both sides',
  /support_cancel_meeting[\s\S]{0,900}?action: 'release'/.test(STUDENT_PAGE) &&
  /releaseMeeting\(/.test(AGENT_PAGE));

// D4 — the CAS depended on an unverified PostgREST JSON-path filter
// Executable lines only: the function's own comments legitimately quote the
// removed filter while explaining why it went.
const FN_EXEC = FN.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
t.ok('D4: no JSON-path filter is relied on in executable code',
  !/provider_ref->>/.test(FN_EXEC));
t.ok('D4: the compare-and-swap uses updated_at, a plain column',
  /\.eq\('updated_at', row\.updated_at\)/.test(FN));
t.ok("D4: 'has no link yet' is decided in JS, not by a filter",
  /rows \?\? \[\]\)\.filter\(\s*\n?\s*\(m\) => !\(\(m\.provider_ref/.test(FN));

// Q2 — release was agent-only, so a student could not undo their own booking
t.ok('Q2: release is callable by the meeting owner or an agent',
  /if \(m\.user_id !== user\.id && !isAgent\) return json\(\{ error: 'forbidden' \}, 403\)/.test(FN));
t.ok('Q2: release still refuses while the row says scheduled',
  /if \(m\.status === 'scheduled'\) return json\(\{ ok: false, status: 'still_scheduled' \}, 409\)/.test(FN));

// Q3/I5 — a leaked link should not drop a stranger into an account conversation
t.ok('Q3: the waiting room is enabled and join_before_host is off',
  /waiting_room: true/.test(ZOOM_SRC) && /join_before_host: false/.test(ZOOM_SRC));
t.ok('Q3: support calls are still never recorded',
  /auto_recording: 'none'/.test(ZOOM_SRC));

// Q4/I2 — one Zoom licence cannot host two concurrent meetings
t.ok('Q4: the function refuses to provision an overlapping meeting on one host',
  /host_busy/.test(FN));
t.ok('Q4: the agent page refuses to create an overlapping slot',
  /overlaps an open slot on the same host/.test(AGENT_PAGE));
t.ok('Q4: slot host_id is actually read rather than decorative',
  /host_id/.test(FN) && /resolveHost/.test(ZOOM_SRC));

// I1 — a link arriving was neither a message nor a status change, so it never drew
t.ok('I1: the student refresh treats the meeting as its own reason to redraw',
  /const meetSig = \[t\.meeting_granted/.test(STUDENT_PAGE));

// Point 4 — a student must never be told a link is coming when it is not
t.ok('P4: the student page reacts to a failed provision instead of returning silently',
  /state\.linkFailed = status/.test(STUDENT_PAGE) && /renderMeetingPanel\(\)/.test(STUDENT_PAGE));
t.ok('P4: host_busy gets its own honest sentence for the student',
  /clashes with another meeting/.test(STUDENT_PAGE));
t.ok('P4: the student is offered a retry rather than an endless wait',
  /retryLinkBtn/.test(STUDENT_PAGE));
// Executable lines only — two of the three occurrences are comments explaining
// why the message needed a sibling.
const STUDENT_EXEC = STUDENT_PAGE.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
t.ok('P4: "being created" is no longer the only no-link message',
  (STUDENT_EXEC.match(/joining link is being created/g) ?? []).length === 1 &&
  /could not be created/.test(STUDENT_EXEC));
t.ok('P4: the agent queue counts scheduled meetings with NO joining link',
  /with NO joining link/.test(AGENT_PAGE) && /stMeetSub/.test(AGENT_PAGE));
t.ok('P4: the agent ticket view calls out a missing link and offers a retry',
  /NO JOINING LINK/.test(AGENT_PAGE) && /mtRetryLink/.test(AGENT_PAGE));

// I3 — ...raw came last and would have silently overridden the mapping
t.ok('I3: the adapter spreads raw FIRST and maps explicitly after',
  /return \{\s*\n\s*\.\.\.raw,\s*\n\s*provider: 'zoom'/.test(ZOOM_SRC));

t.done();
