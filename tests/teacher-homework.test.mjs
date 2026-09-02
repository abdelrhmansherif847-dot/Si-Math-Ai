// Teacher Homework — contract suite.
//
// Part 1: increment H1, the five audit labels. Enum labels are the one thing
// in this project that cannot be undone cleanly, so the checks are about the
// label SET being exactly the five approved names in the approved order,
// appended rather than positioned, with nothing else riding along — and about
// the rollback posture telling the truth about what it can and cannot do.
//
// Part 2: increment H2, the five tables, their guards and their RLS. Every
// column that differs from Teacher Exams 3b is there because one of the six
// locked decisions (§15.15) says so, and the checks pin the decision, not the
// prose: what is absent (no timer, no queue, no answer record yet), what is
// frozen once published and what is deliberately not, which validators are
// borrowed and that the borrowing is textually 3b's own call, and that the
// answer key has no student-shaped path to it. Parts 3+ (RPCs, surfaces)
// follow their own increments.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('teacher-homework');
const F = read('supabase/migrations/20260902a_workspace_audit_homework_actions.sql');
const R = read('supabase/migrations/20260902z_workspace_audit_homework_actions_rollback.sql');
const B = read('supabase/migrations/20260901b_workspace_audit_exam_actions.sql');   // the type as 3a left it

/* Code, not prose: every ban below is applied with comments stripped, so a
   header that EXPLAINS why there is no 'homework_deleted' cannot trip a check
   that forbids one. */
const code = (s) => s.replace(/--[^\n]*/g, '');
const FC = code(F), RC = code(R);
const constant = (src, name) => {
  const m = src.match(new RegExp(name + ' constant text :=\\s*((?:\\s*\'[^\']*\')+)\\s*;'));
  if (!m) throw new Error(name + ' not found');
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).join('');
};

const SIXTEEN = ['workspace_created', 'join_code_rotated', 'student_joined', 'student_left',
  'student_removed', 'staff_joined', 'staff_activated', 'staff_removed',
  'exam_created', 'exam_published', 'exam_closed', 'exam_code_rotated',
  'exam_access_requested', 'exam_access_approved', 'exam_access_rejected', 'exam_access_revoked'];
const FIVE = ['homework_created', 'homework_published', 'homework_closed', 'homework_code_rotated', 'homework_attached'];

// ══ 1 · FIVE LABELS, APPENDED, AND NOTHING ELSE ═══════════════════════════
t.section('H1 adds exactly the five approved labels, appended');

const added = [...FC.matchAll(/alter type workspace_audit_action add value if not exists '([a-z_]+)';/g)].map((m) => m[1]);
t.is('the five labels, in the approved order', added, FIVE);
t.ok('each is IF NOT EXISTS (a run that dies mid-way must be re-runnable)',
  (FC.match(/add value if not exists/g) || []).length === 5 && !/add value '(?!if)/.test(FC));
t.ok('appended, never positioned', !/\b(before|after)\s+'/i.test(FC));
t.is('no other object rides along: no table, column, policy, function, trigger, grant',
  [...FC.matchAll(/^\s*(create|alter|drop)\s+(table|policy|function|trigger|index|view|schema|role)\b|^\s*(grant|revoke)\b/gim)].map((m) => m[0].trim()), []);
t.is('no row is written', [...FC.matchAll(/^\s*(insert|update|delete|truncate)\s/gim)].map((m) => m[0].trim()), []);
t.is('the type is the only thing altered', [...new Set([...FC.matchAll(/alter type ([a-z_]+)/g)].map((m) => m[1]))], ['workspace_audit_action']);

// ══ 2 · THE VERIFICATION COULD GO RED ═════════════════════════════════════
t.section('The in-file verification asserts the whole ordered list');

t.is('expected = the sixteen labels 3a left, then the five, in order',
  constant(F, 'v_expected').split(','), SIXTEEN.concat(FIVE));
t.ok('it compares the whole ordered string, not a count', /string_agg\(e\.enumlabel, ',' order by e\.enumsortorder\)/.test(FC) && /is distinct from v_expected/.test(FC));
/* The stored-row invariant names the labels that HAVE writers today. 3a listed
   eight because the exam labels had none yet; now they do, so all sixteen. */
const invariant = (() => {
  const m = FC.match(/action::text <> all \(array\[([\s\S]*?)\]\)/);
  return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null;
})();
t.is('the stored-row invariant lists exactly the sixteen labels with writers', invariant, SIXTEEN);
t.ok('and it is an invariant, not a pinned row count', !/count\(\*\)\s*(=|<>)\s*\d/.test(FC));
t.ok('it records what it cannot check: a write test must run post-apply, in an aborting transaction',
  /CANNOT check/.test(F) && /post-apply/.test(F) && /abort/.test(F));

// ══ 3 · THE FILE TELLS THE TRUTH ABOUT ITSELF ═════════════════════════════
t.section('Irreversibility, the PG property, and the writing convention are recorded');

t.ok('records its apply (version 20260902001047) — and the rollback stays PREPARED',
  /STATUS: ✅ APPLIED 2026-09-02[\s\S]{0,200}20260902001047/.test(F) && /STATUS: 🔴 PREPARED/.test(R));
t.ok('says it is not cleanly reversible and why (no DROP VALUE)', /NOT CLEANLY REVERSIBLE/.test(F) && /no ALTER TYPE \.\.\. DROP VALUE/.test(F));
t.ok('records the measured property that forces the split', /unsafe use of new value/.test(F) && /cannot work as one unit/.test(F));
t.ok('records why exactly five — no deleted, no opened/submitted, no access family (no queue)',
  /homework_deleted/.test(F) && /homework_submitted/.test(F) && /no approval queue/.test(F));
t.ok('records the subject_id convention for every label',
  /homework_created \/ homework_published \/ homework_closed \/ homework_code_rotated[\s\S]{0,120}subject_id NULL/.test(F)
  && /homework_attached[\s\S]{0,120}subject_id = the STUDENT/.test(F));
t.ok('points at the decisions it implements', /§15\.14/.test(F) && /§15\.15/.test(F));

// ══ 4 · THE ROLLBACK POSTURE ══════════════════════════════════════════════
t.section('20260902z refuses to destroy history and rebuilds the exact pre-H1 type');

const refuse = (() => { const m = RC.match(/action::text = any \(array\[([\s\S]*?)\]\)/); return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null; })();
t.is('it refuses if ANY of the five labels is already recorded', refuse, FIVE);
t.ok('the refusal precedes the drop', RC.indexOf('rollback H1 refused') < RC.indexOf('drop type workspace_audit_action'));
const recreated = (() => { const m = RC.match(/create type workspace_audit_action as enum \(([\s\S]*?)\);/); return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null; })();
t.is('it recreates exactly the sixteen pre-H1 labels, in PostgreSQL\'s order', recreated, SIXTEEN);
t.is('which equals the forward file\'s list minus the five', recreated, constant(F, 'v_expected').split(',').slice(0, 16));
t.ok('it widens the column to text, then narrows it back onto the type',
  /alter column action type text/.test(RC) && /alter column action type workspace_audit_action\s+using action::workspace_audit_action/.test(RC));
t.is('its verification expects the sixteen', constant(R, 'v_expected').split(','), SIXTEEN);
t.ok('and checks the column is back ON the type, not left as text', /format_type\(a\.atttypid, a\.atttypmod\)/.test(RC) && /not workspace_audit_action/.test(RC));
t.ok('it is marked PREPARED and unpleasant, and records that its window closes with the first homework RPC',
  /STATUS: 🔴 PREPARED/.test(R) && /no ALTER TYPE \.\.\. DROP VALUE/.test(R) && /closes the moment/.test(R));
t.ok('the sixteen it rebuilds are exactly what 3a\'s own verification expected',
  constant(B, 'v_expected').split(',').join() === SIXTEEN.join());

// ══ 5 · SCOPE ══════════════════════════════════════════════════════════════
t.section('Nothing else moved');
t.is('no homework table, RPC or policy is smuggled in with the labels',
  [...(FC + RC).matchAll(/teacher_homework[a-z_]*/g)].map((m) => m[0]), []);

// ═══════════════════════════════════════════════════════════════════════════
// PART 2 · H2 — the five tables (20260902b), their RLS (20260902c), the undo (20260902y)
// ═══════════════════════════════════════════════════════════════════════════
const TB = read('supabase/migrations/20260902b_teacher_homework_tables.sql');
const TC = read('supabase/migrations/20260902c_teacher_homework_rls.sql');
const TY = read('supabase/migrations/20260902y_teacher_homework_rollback.sql');
const C3B = read('supabase/migrations/20260901c_teacher_exam_tables.sql');   // the template, applied 2026-09-01
const TBC = code(TB), TCC = code(TC), TYC = code(TY), C3BC = code(C3B);
const H2 = TBC + '\n' + TCC;
/* A COMMENT ON literal is documentation stored in the catalog, and it may say
   "unlike teacher_exams" — so the executable view strips those statements too. */
const EXEC2 = H2.replace(/comment on (table|column|function) [\s\S]*?';\n/g, '');

const FIVE_TABLES = ['teacher_homework', 'teacher_homework_stimuli', 'teacher_homework_questions',
                     'teacher_homework_access', 'teacher_homework_attempts'];
const GUARDS = ['teacher_homework_guard', 'teacher_homework_content_guard', 'teacher_homework_stimulus_same_homework',
                'teacher_homework_access_guard', 'teacher_homework_attempts_guard'];

/* A table body runs from `create table X (` to the first `\n);` — every
   definition in these files closes at column 0, so nested parentheses in the
   CHECKs do not matter. */
const tableDef = (src, name) => {
  const i = src.indexOf('create table ' + name + ' (');
  return i < 0 ? '' : src.slice(i, src.indexOf('\n);', i));
};
const fnDef = (src, name) => {
  const m = src.match(new RegExp('create or replace function ' + name + '\\([^)]*\\)([\\s\\S]*?)as \\$fn\\$([\\s\\S]*?)\\$fn\\$;'));
  return m ? { head: m[1], body: m[2] } : { head: '', body: '' };
};
const distinctCols = (s) => [...s.matchAll(/new\.([a-z_]+) is distinct from old\.\1/g)].map((m) => m[1]);
const columns = (def) => [...def.matchAll(/\n  ([a-z_]+)\s+(uuid|text|timestamptz|boolean|integer|jsonb)\b/g)].map((m) => m[1]);

// ══ 6 · FIVE TABLES, AND WHAT IS DELIBERATELY NOT HERE ════════════════════
t.section('H2 creates exactly the five approved tables — no answer record, no row, no exam reference');

t.is('the five tables, in dependency order', [...TBC.matchAll(/create table ([a-z_]+)/g)].map((m) => m[1]), FIVE_TABLES);
t.ok('no per-item answer record: it is named as required before H5 and outside this increment',
  !/teacher_homework_responses/.test(H2) && /required before[\s\S]{0,12}H5/.test(TB) && /deliberately outside this[\s\S]{0,12}increment/.test(TB));
t.is('no type is created (the five labels came with H1)', [...H2.matchAll(/create type [a-z_]+/g)].map((m) => m[0]), []);
t.is('no row is written', [...H2.matchAll(/^\s*(insert|update|delete|truncate)\s/gim)].map((m) => m[0].trim()), []);
t.ok('no audit row either — H2 causes no event the labels could name', !/workspace_audit_log/.test(H2));
t.ok('the executable view really does strip stored comments (not vacuous)', /comment on table/.test(H2) && !/comment on/.test(EXEC2) && EXEC2.length > 8000);
t.is('no exam table, guard, queue or predicate is referenced in executable SQL', [...EXEC2.matchAll(/\bteacher_exam[a-z_]*/g)].map((m) => m[0]), []);
t.is('the analyzer\'s tables are untouched (decision 2)',
  ['weakness_signals', 'exam_mistakes', 'exam_practice_sessions', 'question_records', 'mastery_records', 'weakness_reports']
    .filter((x) => new RegExp('\\b' + x + '\\b').test(EXEC2)), []);
t.ok('the two forward files name 20260902y as their undo, and y names both', /Rollback: 20260902y/.test(TB) && /Rollback: 20260902y/.test(TC) && /20260902b \+ 20260902c/.test(TY));

// ══ 7 · THE PAPER — column by column, decision by decision ════════════════
t.section('teacher_homework mirrors the six decisions');

const HW = tableDef(TBC, 'teacher_homework');
t.ok('untimed: no duration, calculator, opens_at or closes_at anywhere', !/duration_minutes|calculator_allowed|opens_at|closes_at/.test(TBC));
t.ok('due_at is a nullable date — never a lock (decision 3)', /\n\s+due_at\s+timestamptz,\n/.test(HW));
t.ok('reveal_answers is NOT NULL and defaults to false (decision 1)', /reveal_answers boolean not null default false/.test(HW));
t.ok('status is draft | published | closed, born draft', /status\s+text not null default 'draft'/.test(HW) && /status in \('draft', 'published', 'closed'\)/.test(HW));
const codeRule = (s) => (s.match(/~ '(\^\[[A-Z0-9]+\]\{8\}\$)'/) || [])[1];
t.ok('the code alphabet is the exam code\'s alphabet, enforced by the database', !!codeRule(HW) && codeRule(HW) === codeRule(tableDef(C3BC, 'teacher_exams')));
t.ok('the code is unique across all homework', /homework_code\s+text not null unique/.test(HW));
t.ok('a draft has never been published; anything past draft has', /\(status = 'draft'\) = \(published_at is null\)/.test(HW));
t.ok('closed means closed_at, and only then', /\(status = 'closed'\) = \(closed_at is not null\)/.test(HW));
t.ok('owned by the workspace and cascading with it; authored by a real user',
  /workspace_id\s+uuid not null references teacher_workspaces\(id\) on delete cascade/.test(HW) && /created_by\s+uuid not null references auth\.users\(id\)/.test(HW));
t.ok('title and instructions are bounded', /length\(btrim\(title\)\) between 2 and 200/.test(HW) && /char_length\(instructions\) <= 4000/.test(HW));

// ══ 8 · CONTENT — borrowed by call, and textually 3b's own call ═══════════
t.section('Stimuli and questions reuse the four validators exactly as 3b calls them');

const ST = tableDef(TBC, 'teacher_homework_stimuli'), QN = tableDef(TBC, 'teacher_homework_questions');
const calls = (s) => [...s.matchAll(/\b(exam_[a-z_]+_ok)\(([^)]*)\)/g)].map((m) => m[1] + '(' + m[2].replace(/\s+/g, ' ') + ')');
t.is('the four validators are called, and nothing else is borrowed',
  [...new Set(calls(ST + QN).map((c) => c.split('(')[0]))].sort(),
  ['exam_question_answer_ok', 'exam_question_choices_ok', 'exam_stimulus_shape_ok', 'exam_stimulus_spec_ok']);
t.is('each call is, character for character, the call 3b makes',
  calls(ST + QN), calls(tableDef(C3BC, 'teacher_exam_stimuli') + tableDef(C3BC, 'teacher_exam_questions')));
t.ok('grading is not H2\'s: exam_answer_matches() is not referenced', !/exam_answer_matches/.test(H2));
t.ok('the same six stimulus kinds as the exam system',
  !!(ST.match(/kind in \(([^)]*)\)/) || [])[1] && (ST.match(/kind in \(([^)]*)\)/) || [])[1] === (tableDef(C3BC, 'teacher_exam_stimuli').match(/kind in \(([^)]*)\)/) || [])[1]);
t.ok('a question carries no taxonomy, difficulty or origin column', !/topic_id|subtopic_id|difficulty|skill|content_origin|originality/.test(QN));
t.ok('one ordinal per slot, positive', /unique \(homework_id, ordinal\)/.test(QN) && /ordinal > 0/.test(QN));
t.ok('mcq | grid_in, and the answer key is NOT NULL', /question_format in \('mcq', 'grid_in'\)/.test(QN) && /correct_answer\s+text not null/.test(QN));
t.ok('a stimulus under a question cannot be deleted from beneath it', /stimulus_id\s+uuid references teacher_homework_stimuli\(id\) on delete restrict/.test(QN));
t.ok('content cascades with its homework', /homework_id\s+uuid not null references teacher_homework\(id\) on delete cascade/.test(ST) && /homework_id\s+uuid not null references teacher_homework\(id\) on delete cascade/.test(QN));
t.ok('no media_reason — there is no reviewer for a teacher\'s own paper', !/media_reason/.test(TBC));

// ══ 9 · THE ATTACHMENT — a record, not a decision ═════════════════════════
t.section('teacher_homework_access has no queue in it');

const AC = tableDef(TBC, 'teacher_homework_access');
t.is('exactly three columns: which homework, which student, when', columns(AC), ['homework_id', 'student_id', 'attached_at']);
t.ok('no state, no decision, no was_member — §15.14 gives homework no approval queue',
  !/\bstate\b|decided|was_member|\bpending\b|approved|rejected|revoked/.test(AC));
t.ok('one row per student per homework, as a constraint', /primary key \(homework_id, student_id\)/.test(AC));
t.ok('the rate-limit index H4 needs: per student, newest first',
  /create index teacher_homework_access_student_recent_idx\s+on teacher_homework_access \(student_id, attached_at desc\)/.test(TBC));
t.ok('a student who leaves the platform takes their attachments with them', /student_id\s+uuid not null references auth\.users\(id\) on delete cascade/.test(AC));

// ══ 10 · THE ATTEMPT — one, resumable, late-flagged ═══════════════════════
t.section('teacher_homework_attempts: one per student, ever; late is a flag');

const AT = tableDef(TBC, 'teacher_homework_attempts');
t.ok('one attempt per student per homework — the pair is the idempotency', /constraint teacher_homework_attempts_one_per_student unique \(homework_id, user_id\)/.test(AT));
t.ok('in_progress | submitted — nothing times out, so nothing is abandoned', /status in \('in_progress', 'submitted'\)/.test(AT) && !/abandoned/.test(TBC));
t.ok('no duration, no client request id', !/duration_seconds|client_request_id/.test(TBC));
t.ok('late is NOT NULL and defaults to false (decision 3)', /late\s+boolean not null default false/.test(AT));
t.ok('late can only be true of a submission', /\(\(not late\) or status = 'submitted'\)/.test(AT));
t.ok('submitted means submitted_at, and only then', /\(status = 'submitted'\) = \(submitted_at is not null\)/.test(AT));

// ══ 11 · GUARDS — five, definer, revoked, wired ═══════════════════════════
t.section('Five guards, each SECURITY DEFINER with a pinned search_path, each revoked, each wired BEFORE');

t.is('exactly five guard functions', [...TBC.matchAll(/create or replace function ([a-z_]+)\(\)/g)].map((m) => m[1]), GUARDS);
for (const g of GUARDS) {
  const f = fnDef(TBC, g);
  t.ok(`${g}: security definer with a pinned search_path`, /security definer/.test(f.head) && /set search_path = pg_catalog, public/.test(f.head));
  t.ok(`${g}: EXECUTE revoked from public, anon, authenticated`, new RegExp(`revoke all on function ${g}\\(\\)\\s+from public, anon, authenticated;`).test(TBC));
  t.ok(`${g}: granted back to nobody`, !new RegExp(`grant [a-z]+ on function ${g}\\(`).test(H2));
}
t.is('six triggers, each BEFORE, on exactly these verbs',
  [...TBC.matchAll(/create trigger ([a-z_]+)\s+before ([a-z ]+?) on ([a-z_]+)\s+for each row execute function ([a-z_]+)\(\)/g)].map((m) => [m[1], m[2], m[3], m[4]]),
  [['teacher_homework_guard_trg', 'update or delete', 'teacher_homework', 'teacher_homework_guard'],
   ['teacher_homework_stimuli_content_trg', 'insert or update or delete', 'teacher_homework_stimuli', 'teacher_homework_content_guard'],
   ['teacher_homework_questions_content_trg', 'insert or update or delete', 'teacher_homework_questions', 'teacher_homework_content_guard'],
   ['teacher_homework_questions_stimulus_trg', 'insert or update', 'teacher_homework_questions', 'teacher_homework_stimulus_same_homework'],
   ['teacher_homework_access_guard_trg', 'update or delete', 'teacher_homework_access', 'teacher_homework_access_guard'],
   ['teacher_homework_attempts_guard_trg', 'update or delete', 'teacher_homework_attempts', 'teacher_homework_attempts_guard']]);

// ══ 12 · THE HOMEWORK'S LIFE ══════════════════════════════════════════════
t.section('draft -> published -> closed, one way; the paper freezes, three things stay mutable');

const G = fnDef(TBC, 'teacher_homework_guard').body;
t.ok('a draft may be deleted; anything published may not', /if tg_op = 'DELETE' then\s+if old\.status <> 'draft' then\s+raise exception/.test(G));
const immutable = distinctCols(G.slice(0, G.indexOf("old.status = 'closed'")));
t.is('identity is immutable: id, workspace, author, creation time', immutable, ['id', 'workspace_id', 'created_by', 'created_at']);
t.ok('closed is final in every respect', /if old\.status = 'closed' then\s+raise exception/.test(G));
t.ok('draft -> published stamps published_at; published -> closed stamps closed_at; nothing else is legal',
  /if old\.status = 'draft' and new\.status = 'published' then\s+new\.published_at := coalesce\(new\.published_at, now\(\)\);\s+elsif old\.status = 'published' and new\.status = 'closed' then\s+new\.closed_at := coalesce\(new\.closed_at, now\(\)\);\s+else\s+raise exception/.test(G));
const frozen = distinctCols(G.slice(G.indexOf("if old.status = 'published' then")));
t.is('once published the PAPER is frozen: title, instructions, published_at', frozen, ['title', 'instructions', 'published_at']);
/* "Exactly three stay mutable" is derived from the table, not asserted from a
   list: every column the guard does not freeze or manage must be one of the
   three, so adding a column without deciding its fate turns this red. */
const managed = ['status', 'closed_at', 'updated_at'];
t.is('and exactly three stay mutable — the code (rotation), due_at (extension), reveal_answers (decision 1)',
  columns(HW).filter((c) => !immutable.includes(c) && !frozen.includes(c) && !managed.includes(c)), ['homework_code', 'due_at', 'reveal_answers']);
t.ok('updated_at is stamped by the guard, never trusted from the client', /new\.updated_at := now\(\);\s+return new;\s*end;/.test(G));

// ══ 13 · CONTENT, STIMULUS, ATTACHMENT, ATTEMPT GUARDS ═════════════════════
t.section('The other four guards fail closed');

const CG = fnDef(TBC, 'teacher_homework_content_guard').body;
t.ok('content cannot be moved between homework', /tg_op = 'UPDATE' and new\.homework_id is distinct from old\.homework_id then\s+raise exception/.test(CG));
t.ok('the parent is read by the definer, so RLS cannot blind the guard', /select status, homework_code into v_status, v_code from teacher_homework where id = v_homework_id/.test(CG));
t.ok('FAIL CLOSED: an unreadable parent is refused, not waved through', /if v_status is null or v_status <> 'draft' then\s+raise exception/.test(CG));
t.ok('a delete on content is judged by the same rule before it returns old', CG.indexOf("if tg_op = 'DELETE' then return old; end if;") > CG.indexOf("v_status <> 'draft'"));
const SG = fnDef(TBC, 'teacher_homework_stimulus_same_homework').body;
t.ok('a stimulus is shared within one homework, never across two — a missing one fails closed',
  /select homework_id into v_stimulus_homework from teacher_homework_stimuli where id = new\.stimulus_id/.test(SG)
  && /if v_stimulus_homework is distinct from new\.homework_id then\s+raise exception/.test(SG));
const AG = fnDef(TBC, 'teacher_homework_access_guard').body;
t.ok('an attachment is never deleted', /if tg_op = 'DELETE' then\s+raise exception 'teacher_homework_access: an attachment is a record and is never deleted'/.test(AG));
t.ok('and never changed — no path through the guard returns a row', /never changed'/.test(AG) && !/return (new|old)/.test(AG));
const TG = fnDef(TBC, 'teacher_homework_attempts_guard').body;
t.ok('an attempt is never deleted', /if tg_op = 'DELETE' then\s+raise exception/.test(TG));
t.is('whose, of what, from when — immutable', distinctCols(TG), ['id', 'user_id', 'homework_id', 'started_at']);
t.ok('once submitted NOTHING changes (stricter than the exam sitting, which froze only status)',
  /if old\.status <> 'in_progress' then\s+raise exception/.test(TG) && !/and new\.status is distinct from old\.status/.test(TG));

// ══ 14 · RLS — SELECT only, and no student path to the answer key ══════════
t.section('20260902c: readable by exactly the right people, writable by nobody');

const IS = fnDef(TCC, 'teacher_homework_is_staff');
t.ok('teacher_homework_is_staff(): sql, stable, definer, pinned search_path', /language sql\s+stable\s+security definer\s+set search_path = pg_catalog, public/.test(IS.head));
t.ok('it derives from workspace_is_active_staff() on the homework\'s workspace',
  /workspace_is_active_staff\(h\.workspace_id\)/.test(IS.body) && /from teacher_homework h\s+where h\.id = p_homework/.test(IS.body));
t.ok('role-blind: teacher and active assistant alike (decision 5)', !/staff_role/.test(IS.body));
t.ok('revoked, then granted to authenticated and service_role — the ACL of the four teaching reads',
  /revoke all on function teacher_homework_is_staff\(uuid\) from public, anon, authenticated;\s+grant execute on function teacher_homework_is_staff\(uuid\) to authenticated, service_role;/.test(TCC));
t.is('RLS enabled on all five', [...TCC.matchAll(/alter table ([a-z_]+)\s+enable row level security/g)].map((m) => m[1]), FIVE_TABLES);
t.is('all five stripped from anon and authenticated first', [...TCC.matchAll(/revoke all on table ([a-z_]+)\s+from anon, authenticated/g)].map((m) => m[1]), FIVE_TABLES);
/* The grantee LIST, not a prefix: `to authenticated, anon` still starts with
   "to authenticated", and a mutant that appended anon to these five grants
   survived a check written that way. */
t.is('all five: SELECT to authenticated and to nobody else',
  [...TCC.matchAll(/grant select on table ([a-z_]+)\s+to ([^;]+);/g)].map((m) => m[1] + ' -> ' + m[2].trim()),
  FIVE_TABLES.map((x) => x + ' -> authenticated'));
/* Anchored to the start of a statement: `role_table_grants`, which the file's
   own verification queries, contains the word "grant" mid-line. */
const GRANTS = [...TCC.matchAll(/(?:^|\n)\s*(grant\s[^;]*);/gi)].map((m) => m[1].replace(/\s+/g, ' '));
t.ok('grants exist to check (not vacuous)', GRANTS.length === 6);
t.is('no write verb is granted at all', GRANTS.filter((g) => /\b(insert|update|delete|truncate|all)\b/i.test(g)), []);
t.is('anon appears in no grant, in any position', GRANTS.filter((g) => /\banon\b/i.test(g)), []);
const POL = [...TCC.matchAll(/create policy ([a-z_]+) on ([a-z_]+)\s+for ([a-z]+) to ([a-z_]+)\s+using \(([^;]*)\);/g)]
  .map((m) => ({ name: m[1], table: m[2], cmd: m[3], role: m[4], qual: m[5].replace(/\s+/g, ' ') }));
t.is('exactly seven policies', POL.map((p) => p.table + ':' + p.name), [
  'teacher_homework:teacher_homework_staff_read',
  'teacher_homework_stimuli:teacher_homework_stimuli_staff_read',
  'teacher_homework_questions:teacher_homework_questions_staff_read',
  'teacher_homework_access:teacher_homework_access_staff_read',
  'teacher_homework_access:teacher_homework_access_own_read',
  'teacher_homework_attempts:teacher_homework_attempts_own_read',
  'teacher_homework_attempts:teacher_homework_attempts_staff_read']);
t.ok('every policy is SELECT for authenticated', POL.length === 7 && POL.every((p) => p.cmd === 'select' && p.role === 'authenticated'));
t.is('the paper: staff of its workspace or a platform admin — never a student',
  POL.filter((p) => p.table === 'teacher_homework').map((p) => p.qual), ["workspace_is_active_staff(workspace_id) or has_role_at_least('admin'::user_role)"]);
t.is('THE ANSWER KEY: questions and stimuli have one policy each, staff-or-admin, with no auth.uid() in sight',
  POL.filter((p) => p.table === 'teacher_homework_questions' || p.table === 'teacher_homework_stimuli').map((p) => p.qual),
  ["teacher_homework_is_staff(homework_id) or has_role_at_least('admin'::user_role)",
   "teacher_homework_is_staff(homework_id) or has_role_at_least('admin'::user_role)"]);
t.is('a student reads their OWN attachment and OWN attempt, nothing wider',
  POL.filter((p) => /own_read/.test(p.name)).map((p) => p.qual), ['student_id = auth.uid()', 'user_id = auth.uid()']);
t.ok('no queue predicate anywhere — no state, pending or approved', !/\bstate\b|\bpending\b|\bapproved\b/.test(TCC));
t.ok('the in-file verification pins 5 tables, 7 policies, every policy SELECT, and a role-blind helper',
  /v_n <> 5 then/.test(TCC) && /v_n <> 7 then/.test(TCC) && /p\.polcmd <> 'r'/.test(TCC) && /~ 'staff_role' then/.test(TCC));
t.ok('and it rejects a student-shaped predicate on content, not merely a policy lacking the staff helper',
  /!~ 'teacher_homework_is_staff'/.test(TCC) && /~ 'auth\\\.uid'/.test(TCC));

// ══ 15 · THE UNDO ═════════════════════════════════════════════════════════
t.section('20260902y is a clean undo that refuses to destroy student work');

t.ok('refuses if any attempt or attachment exists', /if v_attempts > 0 or v_access > 0 then\s+raise exception\s+'rollback H2 refused/.test(TYC));
t.ok('the refusal precedes the first drop', TYC.indexOf('rollback H2 refused') < TYC.indexOf('drop table if exists'));
t.is('drops the five tables, children first', [...TYC.matchAll(/drop table if exists ([a-z_]+);/g)].map((m) => m[1]), [...FIVE_TABLES].reverse());
t.is('drops the six functions and no other', [...TYC.matchAll(/drop function if exists ([a-z_]+)\(/g)].map((m) => m[1]).sort(), [...GUARDS, 'teacher_homework_is_staff'].sort());
t.ok('asserts nothing homework-shaped remains', /relname like 'teacher\\_homework%'/.test(TYC) && /proname like 'teacher\\_homework%'/.test(TYC));
t.is('asserts the borrowed validators SURVIVE',
  ((TYC.match(/unnest\(array\[([\s\S]*?)\]\)/) || [])[1] || '').match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, '')) || null,
  ['exam_stimulus_shape_ok', 'exam_stimulus_spec_ok', 'exam_question_choices_ok', 'exam_question_answer_ok', 'exam_answer_matches']);
t.ok('asserts the six teacher_exam tables are still present', /relname like 'teacher\\_exam%' and c\.relkind = 'r'/.test(TYC) && /if v_n <> 6 then/.test(TYC));
t.ok('drops no exam table, no validator, no type', !/drop (table|function) if exists (teacher_exam|exam_)/.test(TYC) && !/drop type/.test(TYC));

// ══ 16 · STATUS ═══════════════════════════════════════════════════════════
t.section('All three H2 files are PREPARED');
t.ok('PREPARED, and none claims APPLIED', [TB, TC, TY].every((f) => /STATUS: 🟡 PREPARED/.test(f) && !/APPLIED/.test(f)));

// ══ 17 · THE THREE POST-PUBLISH MUTABLE FIELDS ════════════════════════════
/* MEASURED on production 2026-09-02 in an aborting transaction, against the
   paper table and both guards extracted VERBATIM from 20260902b (cases L01–L24,
   0 unexpected results). The truth table:

     field             draft            published                     closed
     homework_code     rotate ok        rotate ok                     REFUSED 42501
     due_at            set ok           later / earlier / null ok     REFUSED 42501
     reveal_answers    on and off ok    on ok, and OFF AGAIN ok       REFUSED 42501 both ways
     title, instr.     edit ok          REFUSED 42501                 REFUSED 42501

   Three further measurements, each of which is a decision the owner now holds:
     · moving due_at 30 days into the future AFTER a late submission left that
       attempt late = true — history is not rewritten, and the flag is
       structurally unrewritable anyway;
     · a code the paper had rotated AWAY from was claimed by a NEW homework;
     · closing while reveal_answers is false is permitted, and it can then never
       be turned on — so "close, then show the answers" is impossible today.

   The checks below pin that behaviour to the source, so a silent change turns
   this suite red. They pin what IS, not what should be. */
t.section('The three post-publish mutable fields: lifecycle pinned to the guard');

t.ok('no branch of the guard names any of the three, so no per-status rule restricts them',
  !/new\.homework_code|new\.due_at|new\.reveal_answers/.test(G));
t.ok('the closed refusal precedes both the transition block and the published freeze — closed freezes all three',
  G.indexOf("old.status = 'closed'") < G.indexOf('new.status is distinct from old.status')
  && G.indexOf("old.status = 'closed'") < G.indexOf("if old.status = 'published' then"));
t.ok('and the closed refusal carves out no exception: reveal_answers is not excluded from it',
  /if old\.status = 'closed' then\s+raise exception[^;]+;\s*end if;/.test(G));
t.ok('due_at carries no CHECK — it may be null, past or future',
  !/due_at/.test(HW.replace(/due_at\s+timestamptz,/, '')));
t.ok('a submitted attempt is final, so moving due_at can never rewrite an existing late flag',
  /if old\.status <> 'in_progress' then\s+raise exception/.test(TG));
t.ok('the code alphabet excludes the ambiguous glyphs I, O, 0 and 1',
  !/[IO01]/.test(codeRule(HW)));
t.ok('uniqueness is on the LIVE value only, and no history table exists — a retired code can be claimed again',
  /homework_code\s+text not null unique/.test(HW) && !/code_history|retired_code/.test(H2));
/* The header's prose wraps across comment lines, so it is matched flat: a
   sentence that spans a line break is still one sentence. */
const TBFLAT = TB.replace(/\n\s*--\s*/g, ' ').replace(/\s+/g, ' ');
t.ok('the file states which three stay mutable and why, so the choice is visible in review',
  /the code \(rotation answers a leak\)/.test(TBFLAT) && /due_at \(a teacher may extend or bring forward\)/.test(TBFLAT));
t.ok('and it records the reveal_answers rationale that the closed rule partly defeats (open decision, §15.15)',
  /turning answers on after everyone has submitted is the normal use/.test(TBFLAT)
  && /closed homework is final in every respect/.test(TBFLAT));

// ══ 18 · THE ANSWER RECORD IS ABSENT, AND SAYS SO ═════════════════════════
t.section('No per-item answer record exists yet, and H2 does not assume one');
t.ok('nothing in the H2 SQL references a response/answer table',
  !/teacher_homework_responses|teacher_homework_answers/.test(H2));
t.ok('the rollback does not pretend to drop one either', !/teacher_homework_responses/.test(TYC));

t.done();
