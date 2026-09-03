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
import { createHash } from 'node:crypto';

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

/* An enum migration adds a LABEL and nothing else, so this is the pattern both
   label migrations are scoped by. `alter type` is the one statement they are
   allowed — every other DDL verb, INCLUDING the `or replace` and `unique`
   forms an earlier version of this pattern could not see, is out of scope. A
   mutant that smuggled `create or replace function` past it survived once;
   that is why the qualifier group exists. */
const OBJ = String.raw`(table|policy|function|procedure|trigger|index|view|schema|role|sequence|domain|type)`;
const SCOPE = new RegExp(
  String.raw`^\s*(create|drop)\s+(or\s+replace\s+|unique\s+|temp(orary)?\s+|materialized\s+)?` + OBJ + String.raw`\b`
  + String.raw`|^\s*alter\s+(?!type\b)` + OBJ + String.raw`\b`
  + String.raw`|^\s*(grant|revoke)\b`, 'gim');

// ══ 1 · FIVE LABELS, APPENDED, AND NOTHING ELSE ═══════════════════════════
t.section('H1 adds exactly the five approved labels, appended');

const added = [...FC.matchAll(/alter type workspace_audit_action add value if not exists '([a-z_]+)';/g)].map((m) => m[1]);
t.is('the five labels, in the approved order', added, FIVE);
t.ok('each is IF NOT EXISTS (a run that dies mid-way must be re-runnable)',
  (FC.match(/add value if not exists/g) || []).length === 5 && !/add value '(?!if)/.test(FC));
t.ok('appended, never positioned', !/\b(before|after)\s+'/i.test(FC));
t.is('no other object rides along: no table, column, policy, function, trigger, grant',
  [...FC.matchAll(SCOPE)].map((m) => m[0].trim()), []);
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
t.ok('file b creates no answer record itself — that is 20260902d, which it names',
  !/create table teacher_homework_responses/.test(TBC) && /20260902d/.test(TB));
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
t.ok('closed refuses every column change but one, and says which',
  /is closed — revealing the answers is the only change still permitted/.test(G));
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

t.ok('refuses if any attempt, attachment or answer exists',
  /if v_attempts > 0 or v_access > 0 or v_answers > 0 then\s+raise exception\s+'rollback H2 refused/.test(TYC));
t.ok('the refusal precedes the first drop', TYC.indexOf('rollback H2 refused') < TYC.indexOf('drop table if exists'));
t.is('drops all SIX tables, children first — the answer record before the two it points at',
  [...TYC.matchAll(/drop table if exists ([a-z_]+);/g)].map((m) => m[1]),
  ['teacher_homework_responses', ...[...FIVE_TABLES].reverse()]);
t.is('drops the seven functions and no other',
  [...TYC.matchAll(/drop function if exists ([a-z_]+)\(/g)].map((m) => m[1]).sort(),
  [...GUARDS, 'teacher_homework_is_staff', 'teacher_homework_responses_guard'].sort());
t.ok('it refuses if any ANSWER exists too, not only attempts and attachments',
  /v_attempts > 0 or v_access > 0 or v_answers > 0/.test(TYC));
t.ok('and it is safe on a PARTIALLY applied package: every drop is if-exists, every count to_regclass-guarded',
  (TYC.match(/drop (table|function) if exists/g) || []).length === 13
  && (TYC.match(/to_regclass\(/g) || []).length === 3);
t.ok('asserts nothing homework-shaped remains', /relname like 'teacher\\_homework%'/.test(TYC) && /proname like 'teacher\\_homework%'/.test(TYC));
t.is('asserts the borrowed validators SURVIVE',
  ((TYC.match(/unnest\(array\[([\s\S]*?)\]\)/) || [])[1] || '').match(/'([a-z_]+)'/g)?.map((s) => s.replace(/'/g, '')) || null,
  ['exam_stimulus_shape_ok', 'exam_stimulus_spec_ok', 'exam_question_choices_ok', 'exam_question_answer_ok', 'exam_answer_matches']);
t.ok('asserts the six teacher_exam tables are still present', /relname like 'teacher\\_exam%' and c\.relkind = 'r'/.test(TYC) && /if v_n <> 6 then/.test(TYC));
t.ok('drops no exam table, no validator, no type', !/drop (table|function) if exists (teacher_exam|exam_)/.test(TYC) && !/drop type/.test(TYC));


// ══ 17 · THE THREE POST-PUBLISH MUTABLE FIELDS ════════════════════════════
/* MEASURED on production, in aborting transactions, against the paper table
   and its guard extracted VERBATIM from 20260902b. The rule below is the one
   the owner approved on 2026-09-02 after the first measurement showed a closed
   homework could never reveal its answers at all:

     field                draft       published                   closed
     homework_code        rotate ok   rotate ok                   REFUSED 42501
     due_at               set ok      later / earlier / null ok   REFUSED 42501
     reveal false -> true ok          ok                          OK — the one exception
     reveal true -> false REFUSED     REFUSED                     REFUSED   (22000, any status)
     title, instructions  edit ok     REFUSED                     REFUSED

   Two consequences recorded deliberately: a reveal set by mistake on a DRAFT
   cannot be unset (a draft has no students, so nothing was shown — delete it);
   and a code the paper rotated AWAY from can be claimed by a new homework,
   which is an H4 decision and is not solved here. */
t.section('The three post-publish mutable fields: the approved rule, pinned to the guard');

t.ok('the latch is checked BEFORE the closed gate — which is what lets a closed homework still reveal',
  G.indexOf('old.reveal_answers and not new.reveal_answers') < G.indexOf("if old.status = 'closed' then"));
t.ok('un-reveal is refused unconditionally: no status appears anywhere in the latch',
  /if old\.reveal_answers and not new\.reveal_answers then\s+raise exception 'teacher_homework: answers, once revealed, stay revealed'\s+using errcode = '22000';\s+end if;/.test(G));
/* The closed gate lists the frozen columns rather than inferring them, so a
   column added to the table later is refused by default instead of quietly
   joining reveal_answers in the exception. This check derives the expected list
   FROM THE TABLE, so adding a column without deciding its fate turns it red. */
const closedTuple = (() => {
  const m = G.match(/if old\.status = 'closed' then\s+if \(([\s\S]*?)\)\s+is distinct from/);
  return m ? [...m[1].matchAll(/new\.([a-z_]+)/g)].map((x) => x[1]) : null;
})();
t.is('the closed gate freezes every column except reveal_answers',
  (closedTuple || []).slice().sort(),
  columns(HW).filter((c) => !['id', 'workspace_id', 'created_by', 'created_at', 'updated_at', 'reveal_answers'].includes(c)).sort());
t.ok('and having passed it, a closed row is stamped and returned rather than falling through to the transition rules',
  /old\.status = 'closed' then[\s\S]*?new\.updated_at := now\(\);\s+return new;\s+end if;/.test(G));

/* Outside the closed gate nothing restricts the three by status. Removing that
   one block is how this is asserted: the outer `end if;` is the only one at
   two-space indent, so the inner refusal cannot be mistaken for it. */
const gNoClosed = G.replace(/if old\.status = 'closed' then[\s\S]*?\n  end if;\n/, '');
t.ok('with the closed gate removed, no branch mentions homework_code or due_at at all',
  !/new\.homework_code|new\.due_at/.test(gNoClosed));
t.ok('and reveal_answers survives exactly once outside it — the latch, and nothing else',
  (gNoClosed.match(/new\.reveal_answers/g) || []).length === 1);
t.ok('due_at carries no CHECK — it may be null, past or future',
  !/due_at/.test(HW.replace(/due_at\s+timestamptz,/, '')));
t.ok('a submitted attempt is final, so moving due_at can never rewrite an existing late flag',
  /if old\.status <> 'in_progress' then\s+raise exception/.test(TG));
t.ok('the code alphabet excludes the ambiguous glyphs I, O, 0 and 1',
  !/[IO01]/.test(codeRule(HW)));
t.ok('uniqueness is on the LIVE value only, and no history table exists — a retired code can be claimed again (H4)',
  /homework_code\s+text not null unique/.test(HW) && !/code_history|retired_code/.test(H2));

/* The header's prose wraps across comment lines, so it is matched flat. */
const TBFLAT = TB.replace(/\n\s*--\s*/g, ' ').replace(/\s+/g, ' ');
t.ok('the file states which three stay mutable and why, so the choice is visible in review',
  /the code \(rotation answers a leak\)/.test(TBFLAT) && /due_at \(a teacher may extend or bring forward\)/.test(TBFLAT));
t.ok('and it records the latch, the measurement behind it, and the draft consequence',
  /ONE-WAY LATCH/.test(TBFLAT) && /made the ordinary marking flow/.test(TBFLAT)
  && /a reveal set by mistake on a DRAFT cannot be unset either/.test(TBFLAT));

// ══ 18 · THE ANSWER RECORD (20260902d) ════════════════════════════════════
const TD = read('supabase/migrations/20260902d_teacher_homework_responses.sql');
const TDC = code(TD);
const RS = tableDef(TDC, 'teacher_homework_responses');
const RGF = fnDef(TDC, 'teacher_homework_responses_guard');

t.section('20260902d: one answer record, and "same homework" as a foreign key');

t.is('exactly one table', [...TDC.matchAll(/create table ([a-z_]+)/g)].map((m) => m[1]), ['teacher_homework_responses']);
t.is('its columns are the approved eight',
  columns(RS), ['id', 'attempt_id', 'question_id', 'homework_id', 'ordinal', 'answer', 'is_correct', 'last_answered_at']);
t.ok('no timing or visit columns — homework is untimed and resumable (§15.15a)',
  !/ms_on_item|visit_count|first_seen_at|duration/.test(TDC));
t.ok('no taxonomy, difficulty, skill or origin column — nothing to pretend calibration with',
  !/topic_id|subtopic_id|difficulty|\bskill\b|content_origin/.test(TDC));
t.ok('the answer KEY is not here: no correct_answer and no explanation column',
  !/correct_answer|explanation/.test(TDC));
t.ok('the three-valued rule is structural: NULL is "not answered", never "wrong"',
  /check \(answer is not null or is_correct is null\)/.test(RS));
t.ok('one answer per item per attempt', /unique \(attempt_id, question_id\)/.test(RS));
t.ok('the answer is bounded and the ordinal positive',
  /char_length\(answer\) <= 500/.test(RS) && /ordinal > 0/.test(RS));

/* THE INVARIANT. Both keys must be COMPOSITE and both must carry homework_id —
   a pair of single-column FKs would satisfy "points at a real row" while still
   allowing an attempt of one homework beside a question of another. */
const fks = [...RS.matchAll(/foreign key \(([^)]+)\)\s*references ([a-z_]+) \(([^)]+)\)([^,\n]*)/g)]
  .map((m) => `${m[1].replace(/\s+/g, ' ')} -> ${m[2]}(${m[3].replace(/\s+/g, ' ')})${m[4].replace(/\s+$/, '')}`);
t.is('both foreign keys are composite, and each carries homework_id', fks,
  ['attempt_id, homework_id -> teacher_homework_attempts(id, homework_id) on delete cascade',
   'question_id, homework_id -> teacher_homework_questions(id, homework_id) on delete restrict']);
t.ok('so the rule is a constraint, not a trigger: no same-homework guard exists for responses',
  !/same_homework/.test(TDC));
t.ok('and 20260902b carries the two parent keys those foreign keys point at',
  /constraint teacher_homework_attempts_id_homework_uq unique \(id, homework_id\)/.test(TBC)
  && /constraint teacher_homework_questions_id_homework_uq unique \(id, homework_id\)/.test(TBC));
t.is('two indexes: a whole attempt in order, and one item across the class',
  [...TDC.matchAll(/create index ([a-z_]+)\s+on teacher_homework_responses \(([^)]+)\)/g)].map((m) => `${m[1]} (${m[2]})`),
  ['teacher_homework_responses_attempt_idx (attempt_id, ordinal)',
   'teacher_homework_responses_question_idx (question_id)']);

t.ok('the guard is SECURITY DEFINER with a pinned search_path, and EXECUTE is revoked',
  /security definer/.test(RGF.head) && /set search_path = pg_catalog, public/.test(RGF.head)
  && /revoke all on function teacher_homework_responses_guard\(\) from public, anon, authenticated;/.test(TDC));
t.ok('an answer is never deleted', /if tg_op = 'DELETE' then\s+raise exception/.test(RGF.body));
t.is('which item of which attempt is immutable', distinctCols(RGF.body).slice(0, 4),
  ['attempt_id', 'question_id', 'homework_id', 'ordinal']);
t.ok('graded once, never re-graded',
  /if old\.is_correct is not null and new\.is_correct is distinct from old\.is_correct then/.test(RGF.body));
t.ok('an answer cannot change once its attempt is not in progress, and it fails closed on an unreadable parent',
  /select status into v_status from teacher_homework_attempts where id = new\.attempt_id/.test(RGF.body)
  && /if v_status is null or v_status <> 'in_progress' then/.test(RGF.body));
t.ok('wired BEFORE update or delete',
  /create trigger teacher_homework_responses_guard_trg\s+before update or delete on teacher_homework_responses/.test(TDC));

t.ok('RLS on, privileges stripped, SELECT only for authenticated',
  /alter table teacher_homework_responses enable row level security/.test(TDC)
  && /revoke all on table teacher_homework_responses from anon, authenticated/.test(TDC)
  && /grant select on table teacher_homework_responses to authenticated;/.test(TDC));
t.is('no write verb and no anon grant',
  [...TDC.matchAll(/grant\s+(insert|update|delete|truncate|all)[^;]*;|grant[^;]*to anon[^;]*;/gi)].map((m) => m[0]), []);
const RPOL = [...TDC.matchAll(/create policy ([a-z_]+) on teacher_homework_responses\s+for ([a-z]+) to ([a-z_]+)\s+using \(([\s\S]*?)\);/g)]
  .map((m) => ({ name: m[1], cmd: m[2], role: m[3], qual: m[4].replace(/\s+/g, ' ') }));
t.is('exactly two policies, both SELECT for authenticated', RPOL.map((p) => `${p.name}:${p.cmd}:${p.role}`),
  ['teacher_homework_responses_own_read:select:authenticated',
   'teacher_homework_responses_staff_read:select:authenticated']);
t.ok('a student reads only the answers of an attempt that is theirs',
  RPOL.length === 2 && /a\.user_id = auth\.uid\(\)/.test(RPOL[0].qual) && /teacher_homework_attempts a/.test(RPOL[0].qual));
t.ok('staff read through the role-blind helper on the denormalised homework_id',
  RPOL.length === 2 && /teacher_homework_is_staff\(homework_id\) or has_role_at_least\('admin'::user_role\)/.test(RPOL[1].qual)
  && !/staff_role/.test(TDC));
t.ok('its verification pins the composite keys, the parent keys, the omission CHECK and the package totals',
  /2 two-column foreign keys/.test(TD) && /keys from 20260902b are missing/.test(TD)
  && /omission CHECK is gone/.test(TD) && /found 6/.test(TD.replace(/found %/g, 'found 6')));

// ══ 19 · THE PACKAGE ══════════════════════════════════════════════════════
t.section('b + c + d apply together or not at all, and one rollback undoes all three');

/* The phrase wraps across comment lines in 20260902d, so the declaration is
   matched flat — a sentence broken by a line break is still the sentence. */
const flat = (f) => f.replace(/\n\s*--\s*/g, ' ').replace(/\s+/g, ' ');
t.ok('all three forward files declare the atomic package and name the other two',
  [TB, TC, TD].every((f) => /ATOMIC H2 SCHEMA PACKAGE/.test(flat(f)))
  && /20260902c/.test(TB) && /20260902d/.test(TB)
  && /20260902b/.test(TC) && /20260902d/.test(TC)
  && /20260902b/.test(TD) && /20260902c/.test(TD));
t.ok('and all three name 20260902y as the single undo',
  [TB, TC, TD].every((f) => /20260902y/.test(f)));
t.ok('20260902c records that its own counts are point-in-time, not package totals', /POINT-IN-TIME/.test(TC));
/* The package went live on 2026-09-03. Each forward file records the version it
   was applied as — in the order they were applied, which is the order the file
   headers promise — and the rollback stays PREPARED, which is its whole point. */
t.is('each forward file records the version it was applied as, in package order',
  [TB, TC, TD].map((f) => (f.match(/APPLIED 2026-09-03 as version (\d+)/) || [])[1]),
  ['20260903123333', '20260903123410', '20260903123458']);
t.ok('and the rollback is still PREPARED and unapplied',
  /STATUS: 🟡 PREPARED, deliberately unapplied/.test(TY) && !/APPLIED 2026-09-03 as version/.test(TY));

// ═══════════════════════════════════════════════════════════════════════════
// PART 4 · H3 — the authoring RPCs (20260903a), and the undo (20260903z)
// ═══════════════════════════════════════════════════════════════════════════
const TA = read('supabase/migrations/20260903b_teacher_homework_authoring.sql');
const TAZ = read('supabase/migrations/20260903y_teacher_homework_authoring_rollback.sql');
const RV = read('supabase/migrations/20260903a_workspace_audit_reveal_action.sql');
const RVZ = read('supabase/migrations/20260903z_workspace_audit_reveal_action_rollback.sql');
const RVC = code(RV), RVZC = code(RVZ);
const TAC = code(TA), TAZC = code(TAZ);
const E3C = read('supabase/migrations/20260901e_teacher_exam_authoring.sql');   // the template, live since 2026-09-01

const CLIENT_RPCS = ['teacher_homework_create', 'teacher_homework_update', 'teacher_homework_set_due_at',
  'teacher_homework_reveal_answers', 'teacher_homework_delete', 'teacher_homework_save_stimulus',
  'teacher_homework_delete_stimulus', 'teacher_homework_save_question', 'teacher_homework_delete_question',
  'teacher_homework_reorder_questions', 'teacher_homework_publish', 'teacher_homework_close',
  'teacher_homework_rotate_code'];
const INTERNAL_FNS = ['teacher_homework_new_code', 'teacher_homework_shift_ordinals'];
/* Draft-only in the RPC as well as in the guard: the trigger is what cannot be
   bypassed, the RPC is what gives a teacher a message they can act on. */
const DRAFT_ONLY = ['teacher_homework_update', 'teacher_homework_delete', 'teacher_homework_save_stimulus',
  'teacher_homework_delete_stimulus', 'teacher_homework_save_question', 'teacher_homework_delete_question',
  'teacher_homework_reorder_questions'];
const body3 = (n) => fnDef(TAC, n).body;

// ══ 20 · WHAT H3 SHIPS ════════════════════════════════════════════════════
t.section('H3: thirteen RPCs a client may call, two helpers nobody may');

t.is('exactly fifteen functions, in the file\'s own order',
  [...TAC.matchAll(/create or replace function ([a-z_]+)\s*\(/g)].map((m) => m[1]),
  [...INTERNAL_FNS, ...CLIENT_RPCS]);
t.is('every one is revoked from public, anon and authenticated first',
  [...INTERNAL_FNS, ...CLIENT_RPCS].filter((f) => !new RegExp(`revoke all on function ${f}\\(`).test(TAC)), []);
t.is('exactly the thirteen are granted back, and only to authenticated',
  [...TAC.matchAll(/grant execute on function ([a-z_]+)\([^)]*\)\s+to ([a-z_, ]+);/g)].map((m) => `${m[1]}:${m[2].trim()}`),
  CLIENT_RPCS.map((f) => `${f}:authenticated`));
t.is('the two helpers are granted to nobody', INTERNAL_FNS.filter((f) => new RegExp(`grant execute on function ${f}\\(`).test(TAC)), []);
t.ok('nothing is granted to anon anywhere', !/to [a-z_, ]*\banon\b/.test(TAC.replace(/revoke[^;]*;/g, '')));
t.is('every client RPC is SECURITY DEFINER with a pinned search_path',
  CLIENT_RPCS.filter((f) => !/security definer/.test(fnDef(TAC, f).head)
                         || !/set search_path = pg_catalog, public/.test(fnDef(TAC, f).head)), []);
t.ok('H3 creates no table, policy, type, index or column',
  !/create (table|policy|type|index)|alter table/i.test(TAC));
t.ok('and it re-uses H2\'s staff helper rather than redefining it',
  !/create or replace function teacher_homework_is_staff/.test(TAC)
  && /teacher_homework_is_staff\(\) was redefined/.test(TA));

// ══ 21 · AUTHORIZATION ════════════════════════════════════════════════════
t.section('One gate, one message, and parity that needs no line of its own');

t.is('every RPC except create gates on teacher_homework_is_staff()',
  CLIENT_RPCS.filter((f) => f !== 'teacher_homework_create')
             .filter((f) => !/not teacher_homework_is_staff\(/.test(body3(f))), []);
/* The two RPCs addressed by a CHILD id must resolve the parent first, and an
   unresolvable parent has to fail the same way as a foreign one — otherwise a
   missing row would reach the staff gate as NULL and answer nothing. */
t.is('delete_stimulus and delete_question fail closed on an unresolvable parent',
  ['teacher_homework_delete_stimulus', 'teacher_homework_delete_question']
    .filter((f) => !/if v_homework is null or not teacher_homework_is_staff\(v_homework\) then/.test(body3(f))), []);
t.ok('create gates on active staff of the WORKSPACE, and on being signed in at all',
  /if auth\.uid\(\) is null then/.test(body3('teacher_homework_create'))
  && /if not workspace_is_active_staff\(p_workspace\) then/.test(body3('teacher_homework_create')));
t.ok('no RPC tests staff_role — teacher/assistant parity is structural (decision 5)', !/staff_role/.test(TAC));
/* The refusal must not distinguish "no such homework" from "not your class",
   or the id becomes an oracle. Asserted on every RPC, not spot-checked. */
t.is('every staff refusal carries the one indistinguishable message',
  CLIENT_RPCS.filter((f) => f !== 'teacher_homework_create')
    .filter((f) => !new RegExp(`${f}: no such (homework|stimulus|question), or you are not staff of its class`).test(body3(f))), []);
t.is('and every one of those refusals is 42501',
  CLIENT_RPCS.filter((f) => f !== 'teacher_homework_create')
    .filter((f) => !/or you are not staff of its class'\s*\n\s*using errcode = '42501'/.test(body3(f))), []);

// ══ 22 · THE LIFECYCLE EACH RPC IS ALLOWED TO ACT IN ══════════════════════
t.section('Draft-only where the paper is fixed, and the three exceptions');

t.is('the seven content/paper RPCs refuse anything but a draft',
  DRAFT_ONLY.filter((f) => !/if v_status <> 'draft' then\s+raise exception/.test(body3(f))), []);
/* due_at outlives the draft (§15.15b): mutable while published, refused once
   closed. If this ever became draft-only it would contradict decision 3. */
t.ok('set_due_at is NOT draft-only — it refuses only a closed homework',
  !/v_status <> 'draft'/.test(body3('teacher_homework_set_due_at'))
  && /if v_status = 'closed' then\s+raise exception/.test(body3('teacher_homework_set_due_at')));
/* Every parameter list, pinned. fnDef()'s `head` begins AFTER the closing
   paren, so a widened signature is invisible to any check written against it —
   a mutant that folded due_at back into the paper update survived exactly that
   blind spot. These are read from the file's own text instead. */
const sig = (n) => (TAC.match(new RegExp('create or replace function ' + n + '\\(([^)]*)\\)')) || [])[1]
  .replace(/\s+/g, ' ').trim();
t.is('every signature is exactly as designed — no parameter may be added unnoticed',
  [...INTERNAL_FNS, ...CLIENT_RPCS].map((f) => `${f}(${sig(f)})`), [
    'teacher_homework_new_code()',
    'teacher_homework_shift_ordinals(p_homework uuid, p_from integer)',
    'teacher_homework_create(p_workspace uuid, p_title text)',
    'teacher_homework_update(p_homework uuid, p_title text, p_instructions text)',
    'teacher_homework_set_due_at(p_homework uuid, p_due_at timestamptz)',
    'teacher_homework_reveal_answers(p_homework uuid)',
    'teacher_homework_delete(p_homework uuid)',
    'teacher_homework_save_stimulus(p_homework uuid, p_stimulus uuid, p_kind text, p_label text, p_body text, p_spec jsonb, p_media_ref text)',
    'teacher_homework_delete_stimulus(p_stimulus uuid)',
    'teacher_homework_save_question(p_homework uuid, p_question uuid, p_ordinal integer, p_prompt text, p_format text, p_correct_answer text, p_choices jsonb, p_explanation text, p_stimulus uuid)',
    'teacher_homework_delete_question(p_question uuid)',
    'teacher_homework_reorder_questions(p_homework uuid, p_question_ids uuid[])',
    'teacher_homework_publish(p_homework uuid)',
    'teacher_homework_close(p_homework uuid)',
    'teacher_homework_rotate_code(p_homework uuid)']);
t.ok('so due_at is absent from the paper update — one function never holds two lifecycles',
  !/due_at/.test(body3('teacher_homework_update')));
t.ok('close accepts only a published homework', /if h\.status <> 'published' then\s+raise exception/.test(body3('teacher_homework_close')));
t.ok('publish accepts only a draft, and takes the row FOR UPDATE first',
  /select \* into h from teacher_homework where id = p_homework for update;\s+if h\.status <> 'draft' then/.test(body3('teacher_homework_publish')));
t.ok('rotate refuses a closed homework', /if v_status = 'closed' then\s+raise exception/.test(body3('teacher_homework_rotate_code')));

// ══ 23 · THE LATCH, AS AN API AND NOT ONLY AS A GUARD ═════════════════════
t.section('reveal_answers: un-revealing is not a call this API can express');

const reveal = fnDef(TAC, 'teacher_homework_reveal_answers');
t.is('the RPC takes the homework id and nothing else',
  (TAC.match(/create or replace function teacher_homework_reveal_answers\(([^)]*)\)/) || [])[1].trim(), 'p_homework uuid');
t.ok('it sets the latch true, and the word false appears nowhere in it',
  /update teacher_homework set reveal_answers = true\s+where id = p_homework and not reveal_answers/.test(reveal.body)
  && !/false/.test(reveal.body));
/* Not "no v_status" — no status, in any spelling. A mutant that gated on
   `exists (select 1 from teacher_homework where ... and status = 'closed')`
   named neither variable and survived the narrower check. The migration's own
   §6.8 now refuses the same thing against the live body. */
t.ok('it has NO status gate — a closed homework may still be revealed (§15.15b)',
  !/\bstatus\b/.test(reveal.body));
t.ok('and the migration refuses to install one, whatever it is called',
  /reads status — a closed homework could no longer be revealed/.test(TA));
/* §6.8 reads the argument TYPES. It used to compare
   pg_get_function_identity_arguments() against 'uuid', which that function
   never returns — it carries the parameter name too — so the line could only
   ever raise and the file could not install. Nothing static caught it; the
   production dry-run did. This pins the shape that works. */
t.ok('§6.8 pins the parameter list by type, not by a string that function never returns',
  /select t::regtype::text from unnest\(p\.proargtypes\) t/.test(TA)
  && !/pg_get_function_identity_arguments\(p\.oid\)[\s\S]{0,200}<> 'uuid'/.test(TA));
t.ok('the file records why the latch has no parameter rather than a refused one',
  /would make un-revealing something the API can express/.test(TA.replace(/\n\s*--\s*/g, ' ')));

// ══ 24 · THE PUBLISH GATE ═════════════════════════════════════════════════
t.section('Publish checks only what a CHECK constraint cannot express');

const pub = body3('teacher_homework_publish');
t.ok('a paper with no questions is refused', /if v_n = 0 then\s+raise exception/.test(pub));
t.ok('ordinals must run 1..n with no gaps', /if v_min <> 1 or v_max <> v_n or v_distinct <> v_n then/.test(pub));
t.ok('and no question may reference another homework\'s figure', /s\.homework_id <> p_homework/.test(pub));
/* Homework has no window and no duration, so the two exam gates that exist for
   those must NOT have been copied across. */
t.ok('no window, duration or calculator check anywhere in H3',
  !/duration_minutes|calculator_allowed|opens_at|closes_at/.test(TAC));
t.ok('publishing with a due date already past is deliberately allowed, and the file says why',
  !/due_at.*(<=|<)\s*now\(\)/.test(pub)
  && /DELIBERATELY no check on due_at/.test(TA.replace(/\n\s*--\s*/g, ' ')));

// ══ 25 · CODES AND ORDINALS ═══════════════════════════════════════════════
t.section('The code generator, its retry, and the ordinal shuffle');

const alphabet = (src) => (src.match(/alphabet constant text := '([A-Z0-9]+)'/) || [])[1];
t.ok('the homework alphabet is the exam alphabet, character for character',
  !!alphabet(TAC) && alphabet(TAC) === alphabet(E3C));
t.is('both writers that allocate a code wrap a bounded retry around the write',
  ['teacher_homework_create', 'teacher_homework_rotate_code']
    .filter((f) => !/for i in 1\.\.10 loop/.test(body3(f)) || !/if i = 10 then\s+raise exception/.test(body3(f))), []);
t.is('and each retries ONLY a code collision, named, re-raising anything else',
  ['teacher_homework_create', 'teacher_homework_rotate_code']
    .filter((f) => !/if v_con is distinct from 'teacher_homework_homework_code_key' then/.test(body3(f))
                || !/\braise;/.test(body3(f))), []);
t.ok('deleting a question closes the gap without ever colliding on the slot unique',
  /ordinal \+ 1000000/.test(body3('teacher_homework_shift_ordinals'))
  && /ordinal - 1000000 - 1/.test(body3('teacher_homework_shift_ordinals'))
  && /perform teacher_homework_shift_ordinals\(v_homework, v_ord\);/.test(body3('teacher_homework_delete_question')));
t.ok('reorder demands the WHOLE list, so it cannot leave a non-contiguous paper behind',
  /if v_n <> v_total or array_length\(p_question_ids, 1\) is distinct from v_total then/.test(body3('teacher_homework_reorder_questions')));
t.ok('a figure that is not base64, or does not look like an SVG, is refused before it is stored',
  /the figure is not valid base64 text/.test(body3('teacher_homework_save_stimulus'))
  && /if v_head !~\* '<svg' then\s+raise exception/.test(body3('teacher_homework_save_stimulus')));
t.ok('a figure is hashed server-side from its bytes, and no parameter offers a hash',
  /v_sha  := encode\(sha256\(decode\(p_media_ref, 'base64'\)\), 'hex'\);/.test(body3('teacher_homework_save_stimulus'))
  && !/p_sha|p_media_sha/.test(TAC));
t.ok('a stimulus still used by a question cannot be deleted, with a message that says by how many',
  /question\(s\) still use this figure/.test(body3('teacher_homework_delete_stimulus')));

// ══ 26 · THE AUDIT LOG, AND ITS SILENCES ══════════════════════════════════
t.section('Four labels, written by four RPCs, and nothing else logged');

const audits = [...TAC.matchAll(/insert into workspace_audit_log[\s\S]*?'(homework_[a-z_]+)'/g)].map((m) => m[1]);
/* Compared as a set: the order here is the order the functions happen to be
   defined in, which is not a property worth pinning. That there are exactly
   five, each written once, is. */
t.is('exactly five audit writes, one each', [...audits].sort(),
  ['homework_answers_revealed', 'homework_closed', 'homework_code_rotated', 'homework_created', 'homework_published']);
/* The label appears once in the file, inside the verification that FORBIDS it.
   The ban therefore has to be read against the function bodies, not the file —
   otherwise the guard against the mistake would itself trip the check. */
t.is('homework_attached is H4\'s and no function body writes it',
  [...INTERNAL_FNS, ...CLIENT_RPCS].filter((f) => /homework_attached/.test(body3(f))), []);
t.ok('and the in-file verification is what forbids it', /homework_attached/.test(TAC));
t.is('the RPCs that do NOT log are the ones with no label to log',
  ['teacher_homework_update', 'teacher_homework_set_due_at', 'teacher_homework_delete',
   'teacher_homework_save_question', 'teacher_homework_delete_question',
   'teacher_homework_save_stimulus', 'teacher_homework_delete_stimulus', 'teacher_homework_reorder_questions']
    .filter((f) => /workspace_audit_log/.test(body3(f))), []);
t.ok('and the file records why a delete needs no label — it can only destroy an empty draft',
  /can only ever\s+destroy a draft with no attachment, no attempt and no answer/.test(TA.replace(/\n\s*--\s*/g, ' ')));

// ══ 26b · THE REVEAL EVENT ════════════════════════════════════════════════
t.section('One reveal, one audit row — and none for a repeat or a refusal');

t.ok('the reveal writes homework_answers_revealed', /'homework_answers_revealed'/.test(body3('teacher_homework_reveal_answers')));
/* The clause that makes the row honest: an already-revealed paper matches no
   row, so the function returns before logging. Without it a teacher clicking
   twice would forge a second event. */
t.ok('it only logs when the latch actually moved',
  /update teacher_homework set reveal_answers = true\s+where id = p_homework and not reveal_answers\s+returning workspace_id into v_ws;\s+if v_ws is null then\s+return;\s+end if;/.test(body3('teacher_homework_reveal_answers')));
t.ok('the audit insert comes AFTER that early return, so a repeat cannot reach it',
  body3('teacher_homework_reveal_answers').indexOf('if v_ws is null then')
    < body3('teacher_homework_reveal_answers').indexOf('insert into workspace_audit_log'));
t.ok('and it follows 20260902a\'s convention: actor is the caller, subject_id NULL, homework in meta',
  /values \(v_ws, auth\.uid\(\), 'homework_answers_revealed', null,\s+jsonb_build_object\('homework_id', p_homework\)\);/.test(body3('teacher_homework_reveal_answers')));
t.ok('the migration refuses to install a reveal RPC whose label does not exist yet',
  /apply 20260903a first/.test(TA));

// ══ 26c · DELETE, AS §15.16a MEASURED IT ══════════════════════════════════
t.section('A draft with content is deletable; a draft with student rows is not');

const del = body3('teacher_homework_delete');
t.ok('student rows are refused first, and the message says what is in the way',
  /select count\(\*\) into v_attached from teacher_homework_access where homework_id = p_homework;/.test(del)
  && /select count\(\*\) into v_attempts from teacher_homework_attempts where homework_id = p_homework;/.test(del)
  && /if v_attached > 0 or v_attempts > 0 then\s+raise exception/.test(del));
t.ok('it deletes the questions, then the stimuli, then the paper — in that order',
  /delete from teacher_homework_questions where homework_id = p_homework;\s+delete from teacher_homework_stimuli where homework_id = p_homework;\s+delete from teacher_homework where id = p_homework;/.test(del));
/* The ordering is not cosmetic: the stimulus foreign key is ON DELETE RESTRICT,
   so a stimulus still referenced by a question cannot go first. */
t.ok('questions before stimuli, because the stimulus key is RESTRICT',
  del.indexOf('delete from teacher_homework_questions') < del.indexOf('delete from teacher_homework_stimuli'));
t.ok('it still refuses anything past draft', /elsif v_status <> 'draft' then\s+raise exception/.test(del));
/* One message per status, because they ask for different things. The live 3c
   exam RPC says "close it, do not delete it" for a CLOSED exam too — advice
   its reader has already followed. The dry-run surfaced it; H3 does not
   inherit it. */
t.ok('published and closed get different refusals, and neither tells a closed paper to close',
  /this homework is published — close it, do not delete it/.test(del)
  && /this homework is % and can no longer be deleted/.test(del)
  && del.indexOf("v_status = 'published'") < del.indexOf("elsif v_status <> 'draft'"));
t.ok('and the file records the measurement that forced this shape',
  /PostgreSQL removes the parent row BEFORE\s+running the cascade/.test(TA.replace(/\n\s*--\s*/g, ' '))
  && /§15\.16a/.test(TA));
t.ok('the content guard is neither weakened nor touched by H3',
  !/teacher_homework_content_guard/.test(TAC) && !/create or replace function teacher_homework_content_guard/.test(TA));

// ══ 26d · THE REVEAL LABEL MIGRATION (20260903a) ══════════════════════════
t.section('20260903a adds one label, H1-style, and nothing else');

t.is('exactly one label is added, appended',
  [...RVC.matchAll(/alter type workspace_audit_action add value if not exists '([a-z_]+)';/g)].map((m) => m[1]),
  ['homework_answers_revealed']);
t.ok('it is IF NOT EXISTS, and never positioned',
  /add value if not exists/.test(RVC) && !/\b(before|after)\s+'/i.test(RVC));
t.is('no other object rides along',
  [...RVC.matchAll(SCOPE)].map((m) => m[0].trim()), []);
t.is('the type is the only thing altered', [...new Set([...RVC.matchAll(/alter type ([a-z_]+)/g)].map((m) => m[1]))], ['workspace_audit_action']);
t.is('and no row is written', [...RVC.matchAll(/^\s*(insert|update|delete|truncate)\s/gim)].map((m) => m[0].trim()), []);
t.is('its verification expects the twenty-one existing labels then the new one, in order',
  constant(RV, 'v_expected').split(','), SIXTEEN.concat(FIVE).concat(['homework_answers_revealed']));
t.ok('compared as one ordered string, not a count', /is distinct from v_expected/.test(RVC));
t.is('the stored-row invariant is still the sixteen labels that have writers today',
  (() => { const m = RVC.match(/action::text <> all \(array\[([\s\S]*?)\]\)/); return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null; })(),
  SIXTEEN);
t.ok('it says why it must be its own migration, and why it cannot be undone',
  /unsafe use of new value/.test(RV) && /NOT CLEANLY REVERSIBLE/.test(RV));
t.ok('it records the measurement that justifies the label, not just an opinion',
  /teacher_homework has no updated_by, no revealed_by, no revealed_at/.test(RV.replace(/\n\s*--\s*/g, ' '))
  && /updated_at is stamped by EVERY accepted update/.test(RV.replace(/\n\s*--\s*/g, ' ')));
t.ok('it states the writing convention it expects H3 to follow',
  /actor_id   = the staff member who threw the latch/.test(RV) && /subject_id = NULL/.test(RV)
  && /EXACTLY ONCE per reveal that actually changed something/.test(RV.replace(/\n\s*--\s*/g, ' ')));
t.ok('and it explains why exactly one label — no un-reveal, no delete, no update',
  /No 'homework_answers_hidden'/.test(RV) && /No 'homework_deleted'/.test(RV));

const rvRefuse = (() => { const m = RVZC.match(/action::text = any \(array\[([\s\S]*?)\]\)/); return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null; })();
t.is('the rollback refuses if the label is already recorded', rvRefuse, ['homework_answers_revealed']);
t.ok('the refusal precedes the drop', RVZC.indexOf('rollback refused') < RVZC.indexOf('drop type workspace_audit_action'));
t.is('it rebuilds exactly the twenty-one labels that preceded it',
  (() => { const m = RVZC.match(/create type workspace_audit_action as enum \(([\s\S]*?)\);/); return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null; })(),
  SIXTEEN.concat(FIVE));
t.ok('it widens to text and narrows back onto the type',
  /alter column action type text/.test(RVZC) && /alter column action type workspace_audit_action\s+using action::workspace_audit_action/.test(RVZC));
t.ok('and checks the column landed back ON the type', /format_type\(a\.atttypid, a\.atttypmod\)/.test(RVZC));
t.ok('the label migration records its apply, and its rollback stays PREPARED',
  /STATUS: ✅ APPLIED 2026-09-03 as version 20260903175543/.test(RV) && /STATUS: 🔴 PREPARED/.test(RVZ));
/* Order is a real dependency, not a filing convention: the label cannot be
   written in the transaction that adds it, so 20260903b installed first would
   give a teacher a runtime failure. Both files say so. */
/* The order survives the apply as a documented dependency, not just as two
   timestamps: 20260903a says it went in before 20260903b, 20260903b says the
   label must be committed before it can write it, and the versions agree. */
t.ok('20260903a was applied BEFORE 20260903b, and both files say why',
  /immediately before\s+--\s+20260903b/.test(RV)
  && /immediately after\s+--\s+20260903a/.test(TA)
  && /must\s+--\s+be committed before this file can write it/.test(TA)
  && RV.includes('20260903175543') && TA.includes('20260903175957'));
t.ok('and 20260903b refuses to install if the label is not there yet', /apply 20260903a first/.test(TA));

// ══ 27 · THE H3 / H4 / H5 BOUNDARY ════════════════════════════════════════
t.section('No student surface, and no analyzer');

/* H3 gained one legitimate READ of the student tables when the delete fix
   landed: it counts attachments and attempts in order to REFUSE. So the
   boundary is stated as what it must actually be — no writes at all, and reads
   confined to that one refusal — rather than as a blanket absence that the
   approved fix would have to violate. */
t.is('no function WRITES a student table',
  [...INTERNAL_FNS, ...CLIENT_RPCS].filter((f) =>
    /(insert into|update|delete from)\s+teacher_homework_(access|attempts|responses)\b/.test(body3(f))), []);
t.is('and only the delete RPC mentions one at all',
  [...INTERNAL_FNS, ...CLIENT_RPCS]
    .filter((f) => /teacher_homework_(access|attempts|responses)/.test(body3(f)))
    .filter((f) => f !== 'teacher_homework_delete'), []);
t.ok('where it is exactly two count(*) reads feeding a refusal',
  (body3('teacher_homework_delete').match(/select count\(\*\) into v_(attached|attempts) from teacher_homework_(access|attempts) where homework_id = p_homework;/g) || []).length === 2);
t.ok('teacher_homework_responses is never named anywhere in H3',
  !/teacher_homework_responses/.test(TAC));
t.is('and no analyzer table is named',
  ['weakness_signals', 'weakness_reports', 'exam_mistakes', 'exam_practice_sessions', 'question_records', 'mastery_records']
    .filter((x) => new RegExp('\\b' + x + '\\b').test(TAC)), []);
t.ok('no exam table, RPC or predicate is referenced either', !/teacher_exam/.test(TAC));
/* And the migration pins the same boundary against the LIVE bodies, in both
   halves. Its first draft forbade the mention rather than the write, and the
   production dry-run refused to install the file — so this assertion exists
   because the looser one shipped a migration that could not run. */
t.ok('the in-file verification pins that boundary, so a later edit cannot cross it quietly',
  /a function WRITES a student table/.test(TA)
  && /a function other than the delete pre-check reads a student table/.test(TA)
  && /homework_attached belongs to H4/.test(TA));
/* Both halves are pinned by their PREDICATE, not by their message. A mutant
   that left the raise text in place and neutered the condition survived an
   earlier version of these two checks. */
t.ok('and it forbids the write rather than the word, or the approved delete could not install',
  /\(insert\\s\+into\|update\|delete\\s\+from\)\\s\+teacher_homework_\(access\|attempts\|responses\)/.test(TA));
t.ok('and the read-confinement half tests proname, not prose',
  /and p\.prosrc ~ 'teacher_homework_\(access\|attempts\|responses\)'\s+and p\.proname <> 'teacher_homework_delete';/.test(TA));

// ══ 28 · THE UNDO ═════════════════════════════════════════════════════════
t.section('20260903z removes the write path and leaves H2 exactly as it was');

t.is('it drops all fifteen functions',
  [...INTERNAL_FNS, ...CLIENT_RPCS].filter((f) => !new RegExp(`drop function if exists ${f}\\(`).test(TAZC)), []);
t.ok('it drops NOTHING else — no table, policy, type, or H2 function',
  !/drop (table|policy|type|trigger|index)/i.test(TAZC)
  && !/drop function if exists teacher_homework_is_staff/.test(TAZC)
  && !/drop function if exists teacher_homework_(guard|content_guard|access_guard|attempts_guard|responses_guard)/.test(TAZC));
t.ok('it asserts H2 survives: the helper, the five guards, six tables, nine policies',
  /it destroyed H2 functions/.test(TAZC) && /<> 6 then/.test(TAZC) && /<> 9 then/.test(TAZC));
t.ok('it reports what it would strand rather than refusing — a draft is not a submitted answer',
  /raise notice/.test(TAZC) && /uneditable until the RPCs return/.test(TAZ.replace(/\n\s*--\s*/g, ' ')));
/* Applied in the order the dependency requires, and the two versions prove it:
   the label (…175543) precedes the RPCs (…175957). The rollback stays PREPARED,
   which is its whole point. */
t.ok('H3 records its apply, in the required order, and its rollback stays PREPARED',
  /STATUS: ✅ APPLIED 2026-09-03 as version 20260903175957/.test(TA)
  && /STATUS: 🟡 PREPARED, deliberately unapplied/.test(TAZ)
  && !/STATUS: ✅ APPLIED/.test(TAZ));
t.ok('and both files name the order as a dependency rather than a convention',
  /20260903175543/.test(TA) && /20260903175957/.test(RV)
  && /that order is a real dependency/i.test(RV.replace(/\n\s*--\s*/g, ' ')));

// ══════════════════════════════════════════════════════════════════════════
// PART 5 · increment H4 — the student attaches
// ══════════════════════════════════════════════════════════════════════════
/* H4 is the first student WRITE path. Two things in it are not copies of the
   exam system but corrections to it, each approved after the audit measured
   the problem: a rotated homework code is retired permanently (the exam system
   frees it, and a different paper can take it), and the limiter counts every
   submission (the exam limiter counts rows created, so a wrong code is free).
   The checks below pin both, plus the attach ORDER, which is the contract. */

const H4  = read('supabase/migrations/20260904a_teacher_homework_h4.sql');
const H4Z = read('supabase/migrations/20260904z_teacher_homework_h4_rollback.sql');
const H4C = code(H4), H4ZC = code(H4Z);
const body4 = (n) => fnDef(H4C, n).body;
const sig4 = (n) => (H4.match(new RegExp('create or replace function ' + n + '\\(([^)]*)\\)')) || [])[1];

// ══ 28 · THE TWO NEW TABLES ═══════════════════════════════════════════════
t.section('H4 adds exactly two tables, and neither is client-reachable');

t.is('the retired-code reservation holds provenance and a timestamp, nothing more',
  columns(tableDef(H4C, 'teacher_homework_retired_codes')),
  ['code', 'homework_id', 'workspace_id', 'retired_at', 'retired_by']);
/* The measured reason: a cascade would free the code the moment its draft was
   deleted, which is the hazard the table exists to prevent. */
t.ok('and it carries NO foreign key, on purpose',
  !/references/.test(tableDef(H4C, 'teacher_homework_retired_codes'))
  && /must outlive the paper/.test(H4.replace(/\n\s*--\s*/g, ' ')));
/* SQL string literals are concatenated across lines, so the comment text is
   flattened by joining adjacent literals before it is matched. */
const H4FLAT = H4.replace(/'\s*\n\s*'/g, '').replace(/\n\s*--\s*/g, ' ');
t.ok('the reservation is permanent — no TTL, no expiry column, no sweep',
  !/expires_at|ttl|valid_until/i.test(tableDef(H4C, 'teacher_homework_retired_codes'))
  && /Permanent by decision, not a TTL/.test(H4FLAT));
t.ok('the code it stores must look like a homework code', codeRule(tableDef(H4C, 'teacher_homework_retired_codes')) === '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$');

/* The limiter is the one table in this system whose value is what it does NOT
   hold: no submitted code, no outcome, no homework id. Storing the outcome
   would make the table the oracle the one-message rule exists to prevent. */
t.is('the limiter holds exactly who and when', 
  [...tableDef(H4C, 'teacher_homework_attach_attempts').matchAll(/\n  ([a-z_]+)\s+\S/g)].map((m) => m[1]),
  ['id', 'user_id', 'attempted_at']);
t.ok('it never stores the submitted code, the outcome, or the homework',
  !/code|outcome|success|failed|homework_id|ip_|user_agent/.test(
    tableDef(H4C, 'teacher_homework_attach_attempts')));
t.ok('it is indexed the way the two live counters already are',
  /on teacher_homework_attach_attempts \(user_id, attempted_at desc\)/.test(H4C));

t.is('neither table grants anything to a client',
  [...H4C.matchAll(/grant [a-z, ]+ on table (teacher_homework_retired_codes|teacher_homework_attach_attempts)/gi)].map((m) => m[0]), []);
t.ok('both revoke from anon and authenticated, and both enable RLS',
  (H4C.match(/revoke all on table teacher_homework_(retired_codes|attach_attempts) from anon, authenticated;/g) || []).length === 2
  && (H4C.match(/alter table teacher_homework_(retired_codes|attach_attempts) enable row level security;/g) || []).length === 2);
t.is('and neither gets a policy',
  [...H4C.matchAll(/create policy [a-z_]+ on (teacher_homework_retired_codes|teacher_homework_attach_attempts)/gi)].map((m) => m[0]), []);

t.ok('a reservation is never released or edited',
  /a retired code is never released/.test(body4('teacher_homework_retired_codes_guard'))
  && /written once and never changed/.test(body4('teacher_homework_retired_codes_guard')));
/* An attempt may be PRUNED — that is the retention mechanism — but never
   rewritten, so the guard covers UPDATE alone. */
t.ok('an attempt may be pruned but never rewritten',
  /before update on teacher_homework_attach_attempts/.test(H4C)
  && !/before update or delete on teacher_homework_attach_attempts/.test(H4C));

// ══ 29 · RETENTION, DEFINED RATHER THAN ASSUMED ═══════════════════════════
t.section('Retention: the only sweep that can run is the one inside the RPC');

/* Measured during the audit: this database has no pg_cron, no scheduled job
   and no cleanup function anywhere. A retention policy that needs a scheduler
   would therefore never run, so the RPC prunes its own caller's rows. */
t.ok('the file records that there is no scheduler to rely on',
  /there is no scheduler in\s+this database \(measured/.test(H4.replace(/\n\s*--\s*/g, '\n  '))
  || /no pg_cron, no job, no cleanup function/.test(H4.replace(/\n\s*--\s*/g, ' ')));
t.ok('the prune happens BEFORE the count, so an expired row can never be counted',
  body4('student_attach_homework').indexOf('delete from teacher_homework_attach_attempts')
    < body4('student_attach_homework').indexOf('select count(*) into v_recent'));
t.ok('the window and the limit are named constants, not literals buried in a comparison',
  /WINDOW_\s+constant interval := interval '1 hour'/.test(H4C)
  && /LIMIT_\s+constant integer\s+:= 10/.test(H4C));
t.ok('and the residual is stated: a caller who never returns leaves at most the limit',
  /leaves behind at most\s+LIMIT_ rows/.test(H4.replace(/\n\s*--\s*/g, ' ')));

// ══ 30 · THE ATTACH ORDER IS THE CONTRACT ═════════════════════════════════
t.section('signed in -> rate limit -> resolve -> not staff -> member -> attach -> audit');

const AB = body4('student_attach_homework');
const at = (needle) => { const i = AB.indexOf(needle); if (i < 0) throw new Error('missing: ' + needle); return i; };
t.ok('1 signed in, before anything else', at("sign in first") < at('delete from teacher_homework_attach_attempts'));
t.ok('2 the attempt is RECORDED before it is counted — a guess is never free',
  at('insert into teacher_homework_attach_attempts') < at('select count(*) into v_recent'));
t.ok('3 the limit is enforced BEFORE the code is resolved',
  at('too many attempts') < at('select hw.* into h from teacher_homework hw'));
/* MEASURED on production: a row inserted by a function that then raises does
   not survive the raise. An expected refusal must therefore RETURN, or the
   attempt row this limiter exists to keep is rolled back with the exception
   and only successes are ever counted — the exam limiter's blind spot,
   reintroduced. The rate limit is the one refusal that still raises, and that
   is deliberate: it discards its own row so a throttled caller cannot grow
   the table. */
t.ok('every expected refusal RETURNS, so the attempt it recorded survives',
  !/raise exception 'student_attach_homework: that code/.test(AB)
  && (AB.match(/return jsonb_build_object\('ok', false/g) || []).length === 3);
t.is('and exactly one refusal still raises — the rate limit',
  [...AB.matchAll(/raise exception 'student_attach_homework: ([^']*)'/g)].map((m) => m[1]),
  ['sign in first', 'too many attempts in the last hour, try again later']);
t.ok('the file records the measurement that forced this shape',
  /a row inserted by\s+a plpgsql function that then RAISES does not survive the raise/.test(H4FLAT)
  && /0 rows/.test(H4FLAT) && /1 row/.test(H4FLAT));
t.ok('4 the code resolves only a PUBLISHED homework in an ACTIVE class',
  /where hw\.homework_code = v_norm and hw\.status = 'published' and w\.is_active/.test(AB));
/* h is the rowtype variable; an alias of h makes the join ambiguous and
   plpgsql refuses with 42702. The dry-run found it, so the alias is pinned. */
t.ok('and the join alias does not collide with the rowtype variable',
  /from teacher_homework hw/.test(AB) && !/from teacher_homework h\b/.test(AB));
t.ok('5 staff are refused before membership is even considered',
  at("'reason', 'staff'") < at('from workspace_students ws'));
t.ok('6 membership is checked LIVE and never stored',
  /ws\.status = 'active'\s+and \(ws\.expires_at is null or ws\.expires_at > now\(\)\)/.test(AB)
  && !/was_member/.test(AB));
t.ok('7 the attach is idempotent by primary key',
  /on conflict \(homework_id, student_id\) do nothing/.test(AB));
t.ok('8 the audit row comes last, and only when something attached',
  at('if v_new then') < at('homework_attached') && at('on conflict (homework_id, student_id)') < at('if v_new then'));

/* The normalisation both live entry points already use, character for
   character — a student who types spaces or lowercase is not punished. */
t.ok('the code is normalised exactly as student_join_workspace does',
  AB.includes("upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))"));
/* An exam records was_member_at_request because a non-member may still raise a
   request. Here they may not, so there is nothing to record — and nothing in
   this path may reach the exam access model either. */
t.ok('it records no membership flag and never reads the exam access model',
  !/was_member/.test(AB) && !/teacher_exam/.test(AB));
t.ok('the count reads the limiter, not the attachment table (the exam mistake)',
  /from teacher_homework_attach_attempts\n   where user_id = auth\.uid\(\) and attempted_at > now\(\) - WINDOW_/.test(AB)
  && !/from teacher_homework_access[\s\S]{0,80}attached_at > now\(\)/.test(AB));
t.ok('the staff roster is gated on active staff of that homework',
  /if not teacher_homework_is_staff\(p_homework\) then/.test(body4('teacher_homework_students')));

// ══ 31 · THE ONE MESSAGE ══════════════════════════════════════════════════
t.section('A bad code and a non-member fail identically');

t.is('the same reason is returned exactly twice — unknown code, and not a member',
  (AB.match(/'no_match'/g) || []).length, 2);
t.ok('and the not-a-member case has no reason of its own',
  !/not_a_member|not_member|no_membership/.test(AB));
t.ok('a draft, a closed paper and a deactivated class all fall into the same branch',
  (AB.match(/status = 'published'/g) || []).length === 1 && !/status = 'draft'|status = 'closed'/.test(AB));
/* Staff DO get a distinct message, and safely: staff already read every
   homework in their class, its code included, so it confirms nothing. */
t.ok('only staff get a distinct reason, and the file says why that leaks nothing',
  /'reason', 'staff'/.test(AB)
  && /confirms nothing they cannot already see/.test(H4.replace(/\n\s*--\s*/g, ' ')));
t.ok('and the cost of the one message is recorded, not hidden',
  /The cost is real and is accepted/.test(H4.replace(/\n\s*--\s*/g, ' ')));

// ══ 32 · THE GATE ═════════════════════════════════════════════════════════
t.section('teacher_homework_can_open: no student parameter, four live conditions');

t.is('it takes the homework and nothing else', sig4('teacher_homework_can_open'), 'p_homework uuid');
t.ok('the caller is bound from auth.uid(), never passed in',
  (body4('teacher_homework_can_open').match(/auth\.uid\(\)/g) || []).length === 2);
const CO = body4('teacher_homework_can_open');
t.ok('attached, active membership, active workspace, published — all four, all live',
  /teacher_homework_access a/.test(CO) && /ws\.status = 'active'/.test(CO)
  && /w\.is_active/.test(CO) && /h\.status = 'published'/.test(CO));
/* Decision 3: the due date is a date, never a lock. A gate that read it would
   turn every late submission into a refusal. */
t.ok('and it never reads due_at', !/due_at/.test(CO));
t.ok('the student list computes the gate per row rather than filtering',
  /teacher_homework_can_open\(h\.id\)/.test(body4('student_my_homework')));

// ══ 33 · THE RETIRED-CODE FIX ═════════════════════════════════════════════
t.section('A rotated code never comes back');

t.ok('create and rotate both consult the reservation',
  /teacher_homework_code_available/.test(body4('teacher_homework_create'))
  && /teacher_homework_code_available/.test(body4('teacher_homework_rotate_code')));
t.ok('availability means BOTH not-in-use and not-retired, in one place',
  /not exists \(select 1 from teacher_homework where homework_code = p_code\)/.test(body4('teacher_homework_code_available'))
  && /not exists \(select 1 from teacher_homework_retired_codes where code = p_code\)/.test(body4('teacher_homework_code_available')));
t.ok('the helper that answers "does this code exist" is callable by NOBODY',
  /revoke all on function teacher_homework_code_available\(text\)\s+from public, anon, authenticated;/.test(H4C)
  && !/grant execute on function teacher_homework_code_available/.test(H4C));
t.ok('rotation retires the code it replaces, after the new one is in place',
  /insert into teacher_homework_retired_codes/.test(body4('teacher_homework_rotate_code'))
  && body4('teacher_homework_rotate_code').indexOf('update teacher_homework set homework_code')
     < body4('teacher_homework_rotate_code').indexOf('insert into teacher_homework_retired_codes'));

/* THE INVARIANT: once a homework code has existed, it never becomes available
   again. Rotation is one exit; deleting a draft is the other, and it counts
   even though a draft's code grants nothing — a draft code can still have been
   shared, and reissuing it is the same wrong-paper attachment. */
const DEL4 = body4('teacher_homework_delete');
t.ok('deleting a draft retires its code too', /insert into teacher_homework_retired_codes/.test(DEL4));
t.ok('and retires it BEFORE the row that holds it goes — no instant where it is free',
  DEL4.indexOf('insert into teacher_homework_retired_codes')
    < DEL4.indexOf('delete from teacher_homework where id = p_homework'));
t.ok('retirement does not depend on published vs draft',
  !/if v_status[^;]*then\s*insert into teacher_homework_retired_codes/.test(DEL4));
t.ok('the delete still refuses on any student row, and still deletes content first',
  /% student\(s\) hold this homework/.test(DEL4)
  && DEL4.indexOf('delete from teacher_homework_questions') < DEL4.indexOf('delete from teacher_homework where id'));
t.ok('the file states the invariant in those words',
  /ONCE A HOMEWORK CODE HAS EXISTED, IT NEVER BECOMES AVAILABLE AGAIN/.test(H4)
  && /Both exits are atomic/.test(H4FLAT));
/* The dry-run measured that a raw INSERT could still claim a retired code —
   UNIQUE cannot see the reservation table and a CHECK may not subquery — so
   the invariant is now enforced one level down as well. */
t.ok('a guard on BOTH write verbs puts the invariant in the database',
  /before insert or update of homework_code on teacher_homework\s+for each row execute function teacher_homework_code_guard\(\)/.test(H4C));
/* Scoped to the column, not the table. A bare `or update` would fire on every
   title, due-date, status and reveal-latch write H2 governs — none of which
   can put a code on a row — and a delete clause would sit in the way of
   teacher_homework_delete(). */
t.ok('it is scoped to the code column — no bare UPDATE, no DELETE',
  !/before insert or update on teacher_homework/.test(H4C)
  && !/create trigger teacher_homework_code_guard_trg\s+before[^;]*\bdelete\b/i.test(H4C)
  && !/create trigger teacher_homework_code_guard_trg\s+before (update|delete)/.test(H4C));
t.ok('it consults the reservation, and fails closed by being definer',
  /from teacher_homework_retired_codes where code = new\.homework_code/.test(body4('teacher_homework_code_guard'))
  && /create or replace function teacher_homework_code_guard\(\)\nreturns trigger\nlanguage plpgsql\nsecurity definer\nset search_path = pg_catalog, public/.test(H4C));
t.ok('it is callable by nobody',
  /revoke all on function teacher_homework_code_guard\(\) from public, anon, authenticated;/.test(H4C)
  && !/grant execute on function teacher_homework_code_guard/.test(H4C));
/* Not 23505: teacher_homework_create() catches unique_violation to retry a
   collision, and a RAISE carries no constraint_name, so a 23505 here would
   enter that handler only to be re-raised opaquely. */
t.ok('and it deliberately avoids the errcode the create retry catches',
  /using errcode = '22000'/.test(body4('teacher_homework_code_guard'))
  && !/23505/.test(body4('teacher_homework_code_guard'))
  && /Deliberately NOT errcode 23505/.test(H4));
/* H4 only ever ADDS. Anything it dropped would belong to H2 or H3, and the
   file that installs a guard is the easiest place to quietly remove one. */
t.is('the forward file drops nothing at all',
  [...H4C.matchAll(/drop\s+(trigger|function|table|policy|index|type|constraint)/gi)].map((m) => m[0]), []);
t.ok('§7.12b pins the trigger on both verbs, and §7.12c pins H2\u2019s as untouched',
  /the invariant is only a convention/.test(H4C)
  && /BEFORE INSERT OR UPDATE OF homework_code ON public/.test(H4C)
  && /the code guard is wider than the column it protects/.test(H4C)
  && /19bbc18c825edce8b3c9a03c75f9fecb/.test(H4C)
  && /BEFORE DELETE OR UPDATE ON public/.test(H4C));
/* Said rather than left to be found: an invariant enforced on one write verb
   and not the other is not enforced, and rotation only survives because the
   RPC writes the new code BEFORE retiring the old one. */
t.ok('the file states that the guard covers both verbs, and why rotation still works',
  /covers BOTH ways a code can arrive on a row: INSERT, and[\s\S]{0,40}UPDATE OF homework_code/.test(H4)
  && /Rotation still works, and the order is why/.test(H4)
  && /Rotating A to B and later back to A is[\s\S]{0,40}therefore refused/.test(H4));
t.ok('§7.5b pins the other exit, and that it precedes the row delete',
  /deleting a draft releases its code back into circulation/.test(H4C)
  && /there is a window where it is free/.test(H4C));
/* The two redefined bodies are H3's plus this check and nothing else. The
   header carries the 20260831e warning because that is the hazard. */
t.ok('the file warns that it redefines three LIVE functions',
  /THIS FILE REDEFINES THREE LIVE FUNCTIONS/.test(H4) && /20260831e/.test(H4));
t.is('and all three consult the reservation',
  ['teacher_homework_create', 'teacher_homework_rotate_code', 'teacher_homework_delete']
    .filter((f) => !/teacher_homework_(code_available|retired_codes)/.test(body4(f))), []);

// ══ 34 · THE AUDIT EVENT ══════════════════════════════════════════════════
t.section('One attachment, one homework_attached event');

t.ok('the label is H1’s, and no enum migration is needed',
  /'homework_attached'/.test(AB) && !/alter type workspace_audit_action/.test(H4C));
t.ok('actor and subject are both the student; meta names the homework',
  /values \(h\.workspace_id, auth\.uid\(\), 'homework_attached', auth\.uid\(\),\s+jsonb_build_object\('homework_id', h\.id\)\)/.test(AB));
t.ok('a re-entered code attaches nothing and logs nothing',
  /if v_new then/.test(AB) && /get diagnostics v_recent = row_count/.test(AB));
/* Two disciplines exist in production; the audit measured student_join_workspace
   writing three rows for one membership. H4 follows the exam RPC instead. */
t.ok('and the file says which of the two live conventions it followed, and why',
  /deliberately NOT\s+student_join_workspace/.test(H4.replace(/\n\s*--\s*/g, '\n  ')));

// ══ 35 · THE H4 / H5 BOUNDARY ═════════════════════════════════════════════
t.section('H4 writes attachments and nothing else');

t.is('no H4 function writes an attempt or a response',
  ['student_attach_homework', 'teacher_homework_can_open', 'student_my_homework', 'teacher_homework_students']
    .filter((f) => /(insert\s+into|update|delete\s+from)\s+teacher_homework_(attempts|responses)/.test(body4(f))), []);
t.is('and no open, save, submit or grade appears anywhere in the file',
  [...H4C.matchAll(/create or replace function (student_homework_(open|save|submit)|teacher_homework_grade)\w*/g)].map((m) => m[0]), []);
t.ok('the staff roster reads attempts but never writes them',
  /left join teacher_homework_attempts/.test(body4('teacher_homework_students')));

// ══ 36 · THE ROLLBACK, AND ITS WINDOW ═════════════════════════════════════
t.section('20260904z: a window that closes on its own, said before the apply');

t.ok('it is PREPARED and unapplied', /STATUS: 🟡 PREPARED, deliberately unapplied/.test(H4Z));
t.ok('it REFUSES while any code is reserved — releasing them is the hazard itself',
  /rollback H4 refused: % retired homework code\(s\) are reserved/.test(H4ZC));
t.ok('it does NOT refuse on attachments, and says what survives instead',
  /raise notice/.test(H4ZC) && /They are NOT deleted/.test(H4ZC)
  && !/rollback H4 refused[\s\S]{0,200}attachment/.test(H4ZC));
/* The point the owner asked to be written down BEFORE the apply rather than
   discovered after it. */
t.ok('the header names every closing event up front — including draft deletion',
  /THE FIRST CODE ROTATION \*OR\* THE FIRST DRAFT DELETION closes this/.test(H4Z)
  && /THE FIRST STUDENT ATTACHMENT closes the H2 rollback/.test(H4Z)
  && /the ordinary authoring action of the two/.test(H4Z.replace(/\n--\s*/g, ' ')));
t.ok('it restores both redefined bodies and asserts their H3 md5',
  /c9c6e06c2f8c7978dd3dc871dfd1f13f/.test(H4ZC) && /58cedf72a23d0adcaac12ca27fd41c86/.test(H4ZC));
/* Stronger than quoting the hashes: the restored text is compared against the
   H3 file itself. A restore that is nearly right — one lost btrim() — is the
   20260831e failure, and a quoted md5 alone would not catch it here. */
t.is('and all THREE bodies it restores ARE 20260903b\u2019s, character for character',
  ['teacher_homework_create', 'teacher_homework_rotate_code', 'teacher_homework_delete']
    .map((f) => fnDef(H4Z, f).body),
  ['teacher_homework_create', 'teacher_homework_rotate_code', 'teacher_homework_delete']
    .map((f) => fnDef(TA, f).body));
t.ok('and it asserts the third md5 as well',
  /7f3c8934a08ef9a749717fc2d52ff26a/.test(H4ZC));
t.ok('the refusal is a real condition, not a disabled one',
  /if v_codes > 0 then/.test(H4ZC) && !/if false then/.test(H4ZC));
t.is('it drops exactly what H4 added — six functions, two guards, two tables',
  [...H4ZC.matchAll(/drop (?:function|table) if exists ([a-z_]+)/g)].map((m) => m[1]).sort(),
  ['student_attach_homework', 'student_my_homework', 'teacher_homework_attach_attempts',
   'teacher_homework_attach_attempts_guard', 'teacher_homework_can_open',
   'teacher_homework_code_available', 'teacher_homework_code_guard',
   'teacher_homework_retired_codes', 'teacher_homework_retired_codes_guard',
   'teacher_homework_students']);
/* The guard sits on an H2 table that SURVIVES, so no DROP TABLE carries it
   away — it must be removed by name, trigger before function. */
t.ok('the code guard is dropped explicitly, trigger first',
  /drop trigger if exists teacher_homework_code_guard_trg on teacher_homework;/.test(H4ZC)
  && H4ZC.indexOf('drop trigger if exists teacher_homework_code_guard_trg')
     < H4ZC.indexOf('drop function if exists teacher_homework_code_guard()'));
t.ok('and it asserts teacher_homework is back to H2\u2019s single trigger',
  /H2 left exactly one/.test(H4ZC) && /19bbc18c825edce8b3c9a03c75f9fecb/.test(H4ZC));
t.ok('and it asserts H2 and the rest of H3 came back: 6 tables, 9 policies, 22 functions',
  /<> 6 then/.test(H4ZC) && /<> 9 then/.test(H4ZC) && /<> 22 then/.test(H4ZC));
/* H4 is LIVE; its rollback is not. The forward file names the version it
   went in as, and the rollback names the state its window was in at the
   post-apply measurement — 0 reservations, 0 attachments — because that is
   what decides whether it can still be run. */
t.ok('H4 is APPLIED and names its version; its rollback stays PREPARED',
  /STATUS: ✅ APPLIED 2026-09-03 as version 20260903203209/.test(H4)
  && /STATUS: 🟡 PREPARED, deliberately unapplied/.test(H4Z)
  && !/APPLIED 2026-09-03 as version/.test(H4Z)
  && /20260904a is LIVE as of 2026-09-03 \(version 20260903203209\)/.test(H4Z));

// ══ 37 · THE FILE'S OWN VERIFICATION MUST BE ABLE TO FAIL ═════════════════
t.section('§7 checks the four things that would actually break H4');

/* A verification block is only evidence if its conditions are live. Each of
   these was a surviving mutant until it was pinned: replacing any one with a
   constant-false test left the suite green. */
t.ok('§7.2 forbids a foreign key that could free reserved codes',
  /conrelid = 'teacher_homework_retired_codes'::regclass and contype = 'f'\) then/.test(H4C));
t.ok('§7.6 compares the positions of the limit and the code lookup',
  /position\('too many attempts' in v_code\) > position\('''no_match''' in v_code\)/.test(H4C));
/* The FIRST H4 dry-run was red on a body that satisfies §7.8: the attach
   body names was_member_at_request in a comment in order to say it is
   absent, so a check reading the raw prosrc could ONLY ever raise and the
   file could not install. Every §7 source check now reads the body with its
   -- comments stripped, and the raw source is not held in a variable at all
   so a later check cannot reach for it. */
t.ok('every §7 source check reads code, never prose',
  !/\bv_src\b/.test(H4C)
  // counted on the RAW file: code() strips from the first `--`, and the
  // needle IS a string literal starting with `--`, so H4C cannot contain it.
  && H4.split("regexp_replace(p.prosrc, '--[^\\n]*', '', 'g')").length - 1 === 7
  && /the raw prosrc is deliberately never held in a variable/i.test(H4FLAT));
/* The clause above pins the idiom; this one pins the ABSENCE of the
   alternative. Every §7 read of a body is either comment-stripped or an
   md5 of the whole thing — an inlined `p.prosrc` anywhere else is a check
   reading prose, whatever variable it lands in. */
const H4S7 = H4.slice(H4.indexOf('7 \u00b7 verification'));
t.ok('and no \u00a77 check reads an unstripped body by any route',
  !/p\.prosrc/.test(H4S7.replace(/regexp_replace\(p\.prosrc/g, '').replace(/md5\(p\.prosrc\)/g, '')));
t.ok('§7.7 counts the shared reason and requires exactly two',
  /\(length\(v_code\) - length\(replace\(v_code, '''no_match''', ''\)\)\)/.test(H4C)
  && /length\('''no_match'''\) <> 2 then/.test(H4C));
t.ok('§7.7b forbids an expected refusal from raising',
  /an expected refusal raises, which discards the attempt it just recorded/.test(H4C));
t.ok('§7.13 pins the table count at eight',
  /if v_n <> 8 then/.test(H4C));
t.ok('and none of §7 has been disabled with a constant', !/if false then/.test(H4C));

// ══════════════════════════════════════════════════════════════════════════
// Part 6 — increment H5, the student sits the paper.
//
// Fourteen invariants were locked before a line was written (§15.19–§15.22),
// and every check below pins one of them rather than the prose that explains
// it. The three that could not be settled by reading — that a DEFERRED check
// leaves grade-then-flip legal, that a forged verdict cannot survive, that a
// born-submitted attempt cannot exist — were built and exercised against
// production in an aborting transaction first.
// ══════════════════════════════════════════════════════════════════════════

const H5  = read('supabase/migrations/20260905a_teacher_homework_h5.sql');
const H5Z = read('supabase/migrations/20260905z_teacher_homework_h5_rollback.sql');
const H5C = code(H5), H5ZC = code(H5Z);
const body5 = (n) => fnDef(H5C, n).body;
const H5FLAT = H5.replace(/'\s*\n\s*'/g, '').replace(/\n\s*--\s*/g, ' ');

t.section('H5 adds no table, no policy, no enum label — and says so in its own file');

t.is('it creates no table, no policy and no type',
  [...H5C.matchAll(/create\s+(?:unique\s+)?(table|policy|type|index)\b/gi)].map((m) => m[1].toLowerCase()), []);
t.ok('it alters no type', !/alter type/i.test(H5C));
t.ok('§12.1 pins all three counts',
  /the homework table count moved to/.test(H5C)
  && /the homework policy count moved to/.test(H5C)
  && /the audit label count moved to % — D-6 adds none/.test(H5C));
/* D-6: the attempt row already records who, what and when, permanently and
   immutably, and no existing label records a student academic act. */
t.ok('and no audit label is written by any H5 function',
  !/workspace_audit_log/.test(H5C.replace(/[\s\S]*?-- ── 1 ·/, '')));

t.section('the two gates differ by exactly one condition');

/* can_open is the NEW-START gate and stays untouched; can_resume is D-1's
   exception. If can_resume ever gained a status condition the two would
   collapse into one and closing a paper would kill a sitting again. */
t.ok('can_resume requires an in-progress attempt and live membership',
  /t\.status = 'in_progress'/.test(body5('teacher_homework_can_resume'))
  && /ws\.status = 'active'/.test(body5('teacher_homework_can_resume'))
  && /w\.is_active/.test(body5('teacher_homework_can_resume')));
t.ok('and it deliberately does NOT look at the paper status',
  !/h\.status/.test(body5('teacher_homework_can_resume')));
t.ok('it honours expires_at, like every other membership predicate',
  /\(ws\.expires_at is null or ws\.expires_at > now\(\)\)/.test(body5('teacher_homework_can_resume')));
/* D-1's whole visible effect: without the second arm the student's own list
   greys out a paper they may still finish. */
t.ok('the student list offers BOTH arms',
  /teacher_homework_can_open\(h\.id\) or teacher_homework_can_resume\(h\.id\)/
    .test(body5('student_my_homework')));
t.ok('teacher_homework_can_open is not redefined here',
  !/create or replace function teacher_homework_can_open/.test(H5C));

t.section('start · resume · the race');

t.ok('start is the ONLY thing that locks the paper',
  /from teacher_homework where id = p_homework for update/.test(body5('student_homework_start'))
  && !/for update/.test(body5('student_homework_submit').replace(
       /teacher_homework_attempts\s+where id = p_attempt and user_id = auth\.uid\(\) for update/, '')));
t.ok('it resumes before it asks the new-start gate',
  body5('student_homework_start').indexOf('teacher_homework_attempts') >= 0
  && body5('student_homework_start').indexOf('teacher_homework_can_open') >= 0
  && body5('student_homework_start').indexOf('teacher_homework_attempts')
    < body5('student_homework_start').indexOf('teacher_homework_can_open'));
t.ok('and the new-start gate is asked exactly once, after the lookup',
  (body5('student_homework_start').match(/teacher_homework_can_open/g) || []).length === 1);
/* Racing tabs converge instead of erroring: the UNIQUE makes the second insert
   23505, and catching it re-selects the one attempt. */
/* The handler must RE-SELECT. One that re-raises still matches the keyword and
   still hands the student an error for something that already succeeded. */
t.ok('racing starts converge on the one attempt',
  /when unique_violation then[\s\S]*?select \* into t from teacher_homework_attempts/
    .test(body5('student_homework_start'))
  && !/when unique_violation then\s*\n\s*raise;/.test(body5('student_homework_start')));
t.ok('a submitted attempt is returned, never reopened',
  !/set status = 'in_progress'/.test(body5('student_homework_start')));
t.ok('and resuming is AUTHORIZED, unlike teacher_exam_start',
  /teacher_homework_can_resume/.test(body5('student_homework_start')));

t.section('save writes an answer and never a verdict');

/* indexOf alone would pass on a body with no lock at all: -1 sorts first. */
t.ok('save takes the attempt lock, and takes it BEFORE it validates',
  body5('student_homework_save').includes('for update')
  && body5('student_homework_save').indexOf('for update') >= 0
  && body5('student_homework_save').indexOf('for update')
    < body5('student_homework_save').indexOf('teacher_homework_can_resume'));
/* S-2 is load-bearing: the database will let a removed student's in-progress
   attempt be written, so this line is the whole of the rule. */
t.ok('and it re-checks live membership on EVERY call',
  /teacher_homework_can_resume/.test(body5('student_homework_save')));
t.ok('save never writes is_correct', !/is_correct/.test(body5('student_homework_save')));

t.section('submit: grade first, flip once, count only');

t.ok('it grades through the platform authority and nothing else',
  /exam_answer_matches/.test(body5('student_homework_submit')));
t.ok('an unanswered item stays NULL rather than false',
  /case when r\.answer is null then null/.test(body5('student_homework_submit')));
t.ok('it grades BEFORE it flips',
  body5('student_homework_submit').indexOf('exam_answer_matches')
    < body5('student_homework_submit').indexOf("set status = 'submitted'"));
t.ok('it locks the attempt and nothing else',
  (body5('student_homework_submit').match(/for update/g) || []).length === 1);
/* Invariant 9: start holds homework -> attempt, so locking the paper here
   would close a deadlock cycle. */
t.ok('and it READS the homework without locking it',
  /from teacher_homework where id = t\.homework_id;/.test(body5('student_homework_submit')));
t.ok('it is idempotent by branching, not by catching the guard',
  /if t\.status = 'in_progress' then/.test(body5('student_homework_submit')));
t.ok('and it re-checks live membership too — S-2 covers submit as well as save',
  /teacher_homework_can_resume\(t\.homework_id\)/.test(body5('student_homework_submit')));
t.ok('late is decided once, at submission, and actually stored',
  /v_late := h\.due_at is not null and now\(\) > h\.due_at/.test(body5('student_homework_submit'))
  && /set status = 'submitted', submitted_at = now\(\), late = v_late/.test(body5('student_homework_submit')));
/* The first of the two analyzer locks: a submit that returns no per-item
   breakdown gives a client nothing analyzer-shaped to forward. */
t.ok('and it returns counts only — no mistakes array, no session id',
  !/mistakes/.test(body5('student_homework_submit'))
  && !/session_id/.test(body5('student_homework_submit'))
  && /'correct', v_c, 'wrong', v_w, 'omitted', v_o/.test(body5('student_homework_submit')));

t.section('the student read: the key is not selected unless it is owed');

/* Not a masking CASE. The unentitled branch must not name the column at all,
   so that "the key was never read" is a statement about the query that ran. */
t.ok('q.correct_answer is named in exactly one branch',
  (body5('student_homework_paper').match(/q\.correct_answer/g) || []).length === 1);
t.ok('and so is the explanation',
  (body5('student_homework_paper').match(/q\.explanation/g) || []).length === 1);
t.ok('S-1: the flag is necessary but NOT sufficient',
  /reveal_answers and v_sat and t\.status = 'submitted'/.test(body5('student_homework_paper')));
t.ok('the gate has all three arms — start, resume, and reading your own finished work',
  /teacher_homework_can_open\(p_homework\)/.test(body5('student_homework_paper'))
  && /teacher_homework_can_resume\(p_homework\)/.test(body5('student_homework_paper'))
  && /v_sat and t\.status = 'submitted'/.test(body5('student_homework_paper')));
t.ok('§12.8 pins the single-branch rule',
  /the answer key is read in more than one branch of the student read/.test(H5C));

t.section('the guards H-1 and H-2 close');

t.ok('an attempt is born in_progress — the INSERT branch H2 did not have',
  /if tg_op = 'INSERT' then/.test(body5('teacher_homework_attempts_guard'))
  && /an attempt is born in_progress, not/.test(body5('teacher_homework_attempts_guard')));
t.ok('and the trigger now covers all three verbs',
  /before insert or delete or update on teacher_homework_attempts/.test(H5C));
t.ok('H-2: last_answered_at is frozen with the answer, not separately',
  /new\.answer is distinct from old\.answer\s*\n\s*or new\.last_answered_at is distinct from old\.last_answered_at/
    .test(body5('teacher_homework_responses_guard')));
t.ok('H-1c: a verdict is VERIFIED against the canonical rule, never computed',
  /exam_answer_matches\(q\.question_format, q\.correct_answer, new\.answer\)/
    .test(body5('teacher_homework_verdict_guard'))
  && /a verdict must agree with the platform grading rule/.test(body5('teacher_homework_verdict_guard')));
t.ok('and it fails closed on a question it cannot read',
  /a verdict cannot be verified against an unreadable question/.test(body5('teacher_homework_verdict_guard')));
t.ok('the state guard admits exactly one status',
  /if v_status is distinct from 'submitted' then/.test(body5('teacher_homework_verdict_state_guard')));
t.ok('and the responses guard still fails closed on an unreadable attempt',
  /if v_status is null or v_status <> 'in_progress' then/.test(body5('teacher_homework_responses_guard')));
t.ok('the truth guard fires on BOTH write verbs',
  /create trigger teacher_homework_responses_verdict_trg\s+before insert or update on teacher_homework_responses/.test(H5C));
/* Measured, not assumed: an IMMEDIATE check would refuse grading before the
   flip and force the locked submit order to invert. */
t.ok('D-4 is enforced by a DEFERRED constraint trigger',
  /create constraint trigger teacher_homework_verdict_state_trg\s+after insert or update on teacher_homework_responses\s+deferrable initially deferred/.test(H5C));
t.ok('and §12.5 pins that it really is deferred, in the catalogue as well as the text',
  /DEFERRABLE INITIALLY DEFERRED/.test(H5C)
  && /tg\.tgdeferrable and tg\.tginitdeferred/.test(H5C));
/* BEFORE ROW triggers fire in alphabetical name order — measured during H4. */
t.ok('the immutability guard sorts before the truth guard',
  'teacher_homework_responses_guard_trg' < 'teacher_homework_responses_verdict_trg'
  && /the verdict guard would fire before the immutability guard/.test(H5C));

t.section('the student read boundary becomes RPC-only');

t.ok('the direct grant is revoked',
  /revoke select on teacher_homework_questions from authenticated;/.test(H5C));
/* The policy is the rule and the grant is the reach: keeping the rule means a
   future GRANT cannot silently hand students the key. */
t.ok('and the staff-read POLICY is deliberately left in place',
  !/drop policy/.test(H5C)
  && /the rule must survive the reach/.test(H5C));
t.ok('staff keep a path to the key, through the review RPC',
  /q\.correct_answer/.test(body5('teacher_homework_review'))
  && /teacher_homework_is_staff/.test(body5('teacher_homework_review')));
t.ok('§12.4 pins the revocation and that nothing else lost a grant',
  /authenticated still holds a direct SELECT on teacher_homework_questions/.test(H5C)
  && /it removed a grant it should not have/.test(H5C));

t.section('the roster gains one signal, and no lifecycle');

t.ok('active_member exists so a stranded sitting is distinguishable',
  /active_member  boolean/.test(H5C)
  && /ws\.status = 'active'/.test(body5('teacher_homework_students')));
t.ok('and no terminal state was invented',
  !/abandoned/.test(H5C) && !/cancelled/.test(H5C));
t.ok('the roster is still gated on active staff, role-blind',
  /teacher_homework_is_staff/.test(body5('teacher_homework_students'))
  && !/staff_role/.test(H5C));

t.section('H5 disturbs nothing it does not own');

t.is('the forward file drops only the two things it replaces',
  [...H5C.matchAll(/drop\s+(trigger|function|table|policy|index|type|constraint)/gi)]
    .map((m) => m[0].toLowerCase()).sort(),
  ['drop function', 'drop trigger']);
t.ok('§12.2 asserts the four redefined bodies really changed',
  /these were supposed to be redefined and still carry their H4 body/.test(H5C));
t.ok('and that nine H2/H3/H4 bodies did NOT',
  /it disturbed a function it does not own/.test(H5C)
  && /63ef7fa28bf3a0c48bd6658abd11009a/.test(H5C)
  && /f54ea68a1b3ef3de5475e92c601a51dc/.test(H5C)
  && /9ef8d477bede57132177ca896ab4a2f9/.test(H5C));
/* The first draft asserted the analyzer boundary inside the migration, by
   naming the analyzer tables in a regex. teacher-access-scope went red: its
   blanket ban is that no forward migration may NAME an academic table in
   executable SQL at all, which is the stronger statement and already in CI. The
   weaker copy bought nothing and broke the real one, so it was removed. */
t.ok('H5 names no analyzer table in executable SQL',
  !/weakness_signals|weakness_reports|question_records|mastery_records|exam_mistakes|exam_practice_sessions/
    .test(H5C));
t.ok('and the file says why it does not assert that boundary itself',
  /THE ANALYZER BOUNDARY IS NOT ASSERTED HERE, DELIBERATELY/.test(H5));
t.ok('every §12 source check reads code, never prose',
  !/\bv_src\b/.test(H5C)
  && H5.split("regexp_replace(p.prosrc, '--[^\\n]*', '', 'g')").length - 1 === 4);
t.ok('and none of §12 has been disabled with a constant', !/if false then/.test(H5C));
/* The HEADER only — the slice between the signature and the body marker — so a
   later function's `security definer` can never stand in for a missing one. */
const header5 = (n) => {
  const i = H5C.indexOf('create or replace function ' + n + '(');
  return i < 0 ? '' : H5C.slice(i, H5C.indexOf('as $', i));
};
t.is('every one of the eight new or redefined RPCs is definer with a pinned path',
  ['teacher_homework_can_resume', 'student_homework_paper', 'student_homework_start',
   'student_homework_save', 'student_homework_submit', 'student_my_homework',
   'teacher_homework_students', 'teacher_homework_review']
    .filter((f) => !/security definer\nset search_path = pg_catalog, public/.test(header5(f))), []);
t.is('and so are the four guards',
  ['teacher_homework_attempts_guard', 'teacher_homework_responses_guard',
   'teacher_homework_verdict_guard', 'teacher_homework_verdict_state_guard']
    .filter((f) => !/security definer\nset search_path = pg_catalog, public/.test(header5(f))), []);
t.ok('and anon is granted nothing at all', !/to authenticated, anon|to anon/.test(H5C));

t.section('the H5 rollback restores the exact H4 state');

t.ok('it refuses while any sitting exists, and the refusal is a real condition',
  /rollback H5 refused: % attempt\(s\)/.test(H5ZC)
  && /select count\(\*\) from teacher_homework_attempts/.test(H5ZC)
  && /if v_attempts > 0 then/.test(H5ZC));
t.is('it drops all eight functions H5 added',
  ['teacher_homework_can_resume', 'student_homework_paper', 'student_homework_start',
   'student_homework_save', 'student_homework_submit', 'teacher_homework_review',
   'teacher_homework_verdict_guard', 'teacher_homework_verdict_state_guard']
    .filter((f) => !new RegExp('drop function if exists ' + f).test(H5ZC)), []);
t.is('both triggers are dropped, before their functions',
  ['teacher_homework_verdict_state_trg', 'teacher_homework_responses_verdict_trg']
    .filter((x) => !H5ZC.includes('drop trigger if exists ' + x)), []);
t.ok('and the trigger drop precedes the function drop',
  H5ZC.indexOf('drop trigger if exists teacher_homework_verdict_state_trg') >= 0
  && H5ZC.indexOf('drop trigger if exists teacher_homework_verdict_state_trg')
    < H5ZC.indexOf('drop function if exists teacher_homework_verdict_state_guard'));
/* Naming the md5 is not restoring it. These hash the bodies the rollback file
   ACTUALLY carries and compare them to what H4 left live, so a body that drifts
   by one character fails here rather than at apply time. */
t.is('and the four bodies it carries really are H4\u2019s, byte for byte',
  [['teacher_homework_attempts_guard', 'dacf16fdbce357a20975d566b3035680'],
   ['teacher_homework_responses_guard', 'c5db8f0336d0460c0ad1eb534bbbfc0b'],
   ['student_my_homework', '04198136c9609eb8e73baeb747d13dd3'],
   ['teacher_homework_students', '01b0386d8a03c5d54d734f7a565c23ee']]
    .filter(([n, m]) => createHash('md5').update(fnDef(H5Z, n).body).digest('hex') !== m)
    .map(([n]) => n), []);
t.is('and it asserts each of those md5s in the file too',
  ['dacf16fdbce357a20975d566b3035680', 'c5db8f0336d0460c0ad1eb534bbbfc0b',
   '04198136c9609eb8e73baeb747d13dd3', '01b0386d8a03c5d54d734f7a565c23ee']
    .filter((m) => !H5ZC.includes(m)), []);
/* A rollback that leaves the read boundary half-moved is not a rollback: with
   the RPCs gone and the grant still revoked, staff lose every path. */
t.ok('it puts the revoked grant back',
  /grant select on teacher_homework_questions to authenticated;/.test(H5ZC)
  && /the direct SELECT on teacher_homework_questions was not restored/.test(H5ZC));
t.ok('and it returns both triggers to their H2 shape',
  /before delete or update on teacher_homework_attempts/.test(H5ZC)
  && /teacher_homework_responses carries % trigger\(s\); H2 left exactly one/.test(H5ZC));
t.ok('it asserts H4 is otherwise intact',
  /expected the eight H4 tables/.test(H5ZC)
  && /expected the 30 H4 homework functions/.test(H5ZC)
  && /it disturbed H4''s code guard/.test(H5ZC));
t.ok('H5 is PREPARED and its rollback is unapplied',
  /STATUS: 🟡 PREPARED, not applied/.test(H5)
  && /STATUS: 🟡 PREPARED, deliberately unapplied/.test(H5Z)
  && !/APPLIED 2026-09-0[0-9] as version/.test(H5));

t.done();
