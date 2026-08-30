// The intervention record (T1.6) — the contract, on both sides.
//
// docs/roadmap/teacher-intelligence-layer.md §10 T1.6 makes four promises that
// are worth nothing if only prose keeps them, because every one of them is
// cheap to break by accident a year from now:
//
//   1. BOUNDARY   nothing here reaches the learning profile. §8.3 — the table
//                 carries no foreign key into any academic table, and no
//                 analyzer reads it. support_tickets is the precedent.
//   2. APPEND     the record is append-only. Withdrawable, never editable,
//                 never deletable — including by service_role, because a
//                 rewritable history is not evidence.
//   3. VISIBLE    the student can read what is held about them (§8.2 principle
//                 5), and the teacher is told so before they type.
//   4. RESTRAINT  the platform records, and does not recommend, rank or derive.
//
// The database side of 1–3 was also proven by running 20260830a..e against a
// real PostgreSQL 16 and asserting behaviour under simulated JWTs, 33 of 33 —
// see docs/engineering/teacher-intervention-verification.md. This suite is what
// keeps the contract true afterwards, in CI, without a database.

import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('teacher-intervention');
const MIG = read('supabase/migrations/20260830g_teacher_intervention_record.sql');
const ROLLBACK = read('supabase/migrations/20260830x_teacher_intervention_rollback.sql');
const PAGE = read('teacher.html');

/* The region of the page that owns this feature. Sliced rather than searched so
   a match somewhere else on the page cannot make an assertion pass — and
   through _source.slice(), which searches the end marker FORWARD from the start
   and throws on an empty result. Written first with a bare indexOf pair, which
   silently produced a backwards slice for the fixtures below and made three
   assertions fail for the wrong reason. */
const REGION = slice(PAGE, '/* ── THE INTERVENTION RECORD ──', "$('closeDrawer')", 'intervention region');

// ══ 1 · THE BOUNDARY ══════════════════════════════════════════════════════
t.section('Nothing recorded here can reach the learning profile');

/* The academic tables, named. A foreign key from class_interventions into any
   of them is the exact failure §8.3 exists to prevent: once staff opinion can
   join to a measurement, nobody downstream can tell which is which. */
const ACADEMIC = ['weakness_reports', 'weakness_signals', 'mastery_records', 'question_records',
                  'session_questions', 'focus_tasks', 'focus_plans', 'exam_practice_sessions',
                  'exam_mistakes', 'study_plans', 'profiles', 'chat_sessions', 'ai_usage_logs'];

const TABLE = (() => {
  const a = MIG.indexOf('create table class_interventions');
  const b = MIG.indexOf('comment on table class_interventions', a);
  if (a < 0 || b < 0) throw new Error('20260830g: the table definition could not be located');
  return MIG.slice(a, b);
})();

t.ok('the table definition really was extracted (not a vacuous slice)',
  /workspace_id\s+uuid not null references teacher_workspaces/.test(TABLE) && TABLE.length > 400);

t.is('no column references an academic table',
  ACADEMIC.filter((tbl) => new RegExp('references\\s+' + tbl + '\\b').test(TABLE)), []);

/* The inverse check: the references it DOES hold are the three it is allowed.
   Without this, deleting every foreign key would also pass the test above. */
t.is('the only tables referenced are the workspace, the taxonomy and auth.users',
  [...TABLE.matchAll(/references\s+([a-z_.]+)\s*\(/g)].map((m) => m[1]).sort()
    .filter((v, i, a) => a.indexOf(v) === i),
  ['auth.users', 'taxonomy_subtopics', 'taxonomy_topics', 'teacher_workspaces']);

/* The taxonomy is vocabulary, not evidence, and the file has to say why it is
   not a counter-example to the rule above. */
t.ok('the migration explains why a taxonomy reference is not an academic one',
  /taxonomy is curriculum vocabulary/.test(MIG));

/* An analyzer that read this table would make the boundary meaningless however
   the schema is drawn. The analyzer is a repo file, so this is checkable. */
t.ok('the analyzer does not read the intervention record',
  !/class_interventions/.test(read('regenerate-reports.js')));

// ══ 2 · APPEND-ONLY ═══════════════════════════════════════════════════════
t.section('The record cannot be rewritten, by anyone');

t.ok('a trigger enforces it, rather than a comment promising it',
  /create trigger class_interventions_append_only_trg[\s\S]{0,160}before update or delete on class_interventions/.test(MIG));
t.ok('DELETE is refused outright', /append-only: withdraw the record, do not delete it/.test(MIG));
t.ok('the only permitted update is a withdrawal', /the only permitted update is a withdrawal/.test(MIG));
t.ok('a withdrawal may change nothing else', /a withdrawal may change nothing else/.test(MIG));
t.ok('withdrawal is one-way', /this record is already withdrawn/.test(MIG));

/* The trigger must compare every column, or a withdrawal becomes a way to edit
   the ones it forgot. Listed explicitly so adding a column and forgetting it
   fails here rather than silently permitting an edit. */
for (const col of ['subject_label', 'kind', 'note', 'decided_on', 'created_at', 'decided_by',
                   'topic_id', 'subtopic_id', 'student_id', 'workspace_id'])
  t.ok(`the frozen-column check covers ${col}`,
    new RegExp('new\\.' + col + '\\b').test(MIG) && new RegExp('old\\.' + col + '\\b').test(MIG));

/* RLS filters rows a role may already touch. Writes go through the RPCs, so the
   table privilege must never include one. */
t.ok('authenticated is granted select and nothing else on the table',
  /grant select on table class_interventions to authenticated;/.test(MIG)
  && !/grant (insert|update|delete|all)[^;]*on table class_interventions/.test(MIG));
t.ok('the default ACL is stripped before anything is granted back',
  MIG.indexOf('revoke all on table class_interventions from anon, authenticated;')
    < MIG.indexOf('grant select on table class_interventions to authenticated;'));
t.ok('row level security is on', /alter table class_interventions enable row level security;/.test(MIG));

// ══ 3 · WHO MAY DO WHAT ═══════════════════════════════════════════════════
t.section('Owner writes, assistant reads, student sees themselves');

t.ok('recording is owner-only on the server',
  /teacher_record_intervention[\s\S]{0,900}if not workspace_is_owner\(p_workspace\) then/.test(MIG));
t.ok('withdrawing is owner-only on the server',
  /teacher_withdraw_intervention[\s\S]{0,700}if not workspace_is_owner\(v_ws\) then/.test(MIG));

/* The same three gates the weakness read passes. Being staff of a workspace is
   not by itself a relationship to a student, and workspace A must not reach a
   student linked only through workspace B. */
for (const fn of ['teacher_record_intervention', 'teacher_student_interventions']) {
  const body = MIG.slice(MIG.indexOf('function ' + fn), MIG.indexOf('comment on function ' + fn));
  t.ok(`${fn} checks the caller's link to the student`, /teacher_can_see_student\(/.test(body));
  t.ok(`${fn} checks the workspace/student pairing explicitly`,
    /from workspace_students ws[\s\S]{0,220}ws\.workspace_id = p_workspace[\s\S]{0,160}ws\.student_id = p_student/.test(body));
}

t.ok('staff of the workspace may read', /create policy class_interventions_staff_read[\s\S]{0,200}workspace_is_active_staff\(workspace_id\)/.test(MIG));
t.ok('the student named on a row may read it',
  /create policy class_interventions_subject_read[\s\S]{0,200}student_id = \(select auth\.uid\(\)\)/.test(MIG));
t.ok('the student has a read path of their own', /create or replace function student_my_interventions\(\)/.test(MIG));
t.ok('and it is granted to them', /grant execute on function student_my_interventions\(\) to authenticated;/.test(MIG));

/* §8.2 principle 5 is a design constraint, so the teacher is told at the moment
   it costs them something — not in a settings page they will never open. */
t.ok('the writing surface warns that the student can read it',
  /can read anything you write here/.test(REGION));
t.ok('the page does not offer an assistant a way to record',
  /if \(!S\.isTeacher \|\| !live\) return;/.test(REGION)
  && /S\.isTeacher && live/.test(REGION));

// ══ 4 · RESTRAINT ═════════════════════════════════════════════════════════
t.section('The platform records what the teacher did; it proposes nothing');

/* A recommendation would be the layer becoming an authority over the teacher,
   which §2 names as the invariant the whole direction turns on.

   Checked against the region with its comments removed. The first version of
   this ran against the raw text and failed on the comment that PROMISES the
   restraint ("nothing below derives, suggests or ranks") — a check that a
   feature is safe must not be tripped by the sentence saying it is safe. */
const CODE = REGION.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
t.ok('stripping comments left the actual code behind (not a vacuous check)',
  CODE.length > REGION.length * 0.5 && /api\.recordIntervention\(/.test(CODE));
t.is('no word of recommendation appears in the shipped code',
  ['recommend', 'suggest', 'you should', 'we advise', 'next best', 'priority score']
    .filter((w) => new RegExp(w, 'i').test(CODE)), []);
t.ok('the region renders no number of its own', !/%/.test(REGION));

/* Grouping happens on the canonical id or not at all: the free-text labels
   collide, so a surface that grouped on them would understate agreement without
   anyone noticing. taxonomy-compat.js is explicitly forbidden this use by its
   own header, so the resolver must be the authoritative one. */
t.ok('the page loads the authoritative taxonomy resolver', /<script src="taxonomy\.js"><\/script>/.test(PAGE));
t.ok('labels are resolved to canonical ids before recording',
  /Taxonomy[\s\S]{0,200}resolveTopicId/.test(REGION) && /resolveSubtopicId\(/.test(REGION));
t.ok('the display-only compat layer is not used for it', !/taxonomy-compat/.test(REGION));
t.ok('an unresolved label is stored as a label, not as a guessed id',
  /return \{ topic_id: null, subtopic_id: null \}/.test(PAGE)
  && /subtopic_id\s+text references taxonomy_subtopics/.test(MIG));

// ══ 5 · THE SURFACE ═══════════════════════════════════════════════════════
t.section('One region, one writer, and it degrades before it is applied');

t.ok('the region is marked in the markup', /id="interventionSlot" data-slot="intervention"/.test(PAGE));
t.ok('it carries its contract as a comment',
  /INTERVENTION RECORD/.test(PAGE) && /renderInterventions\(student, el\) is the ONLY function that\n {7}writes here/.test(PAGE));

const slotWrites = [...PAGE.matchAll(/\$\('interventionSlot'\)\.innerHTML\s*=\s*([^;]*)/g)].map((m) => m[1].trim());
t.is('the only direct write to the slot is the reset', slotWrites, ["''"]);

/* The RPCs are live now, so a failure here is a real one. It must still not
   throw — that would take the whole student card down — and must not read as
   "you have done nothing", which would be a false statement about a teacher. */
t.ok('a failed read degrades instead of throwing',
  /catch \(_\) \{[\s\S]{0,500}Could not load this/.test(REGION));
t.ok('the failure state does not imply the teacher did nothing',
  /Nothing has been lost/.test(REGION));
t.ok('an empty record says so without implying the teacher did nothing',
  /Nothing recorded/.test(REGION) && /not something the platform works out/.test(REGION));

/* Preview must reach nothing, exactly as the rest of the page does not. */
for (const m of ['interventions', 'recordIntervention', 'withdrawIntervention']) {
  const seg = PAGE.slice(PAGE.indexOf('async ' + m + '('), PAGE.indexOf('async ' + m + '(') + 900);
  t.ok(`api.${m} guards preview before it reaches the database`,
    seg.search(/if \(S\.preview\)/) >= 0 && seg.search(/if \(S\.preview\)/) < seg.search(/\bsb\.rpc/));
}

/* The preview must mirror the shape of a habit nobody has formed yet, not a
   tidy history on every student. */
const FIX = slice(PAGE, 'interventions: {', 'activity: [', 'intervention fixtures');
t.ok('preview fixtures exist', /kind: 'retaught'/.test(FIX));
t.ok('a withdrawn record is represented, so the state is designed for', /withdrawn_at: iso\(/.test(FIX));
t.ok('not every preview student has a history', /p1: \[\]/.test(FIX));

// ══ 6 · THE MIGRATION IS PREPARED, AND REVERSIBLE ═════════════════════════
t.section('Prepared, not applied — and a rollback that tells the truth');

/* Applied 2026-08-30. The header now has to carry the one thing that makes an
   applied migration checkable later: WHICH applied object this file describes.
   20260830d's header is the shape being matched. */
t.ok('the migration records that it was applied, with its version',
  /STATUS: ✅ APPLIED 2026-08-30/.test(MIG) && /20260830204951/.test(MIG));
t.ok('it names the approval rule it went through', /CLAUDE\.md §3/.test(MIG));
t.ok('it records the service_role result, which was the open gap',
  /service_role/.test(MIG) && /42501/.test(MIG));
/* Two files shared the ordinal 20260830e for part of a day. The prefix is this
   repo's ordering key, so the collision has to stay described, not just fixed. */
t.ok('the rename out of the ordinal collision is explained', /FILE NAME:/.test(MIG));
t.ok('a rollback exists', ROLLBACK.length > 400);
t.ok('the rollback runs before the foundation rollback', /x runs before z/.test(ROLLBACK));
t.ok('the rollback warns that the record cannot be recomputed',
  /THIS DESTROYS THE RECORD/.test(ROLLBACK) && /cannot be recomputed/.test(ROLLBACK));
t.is('the rollback drops everything the migration created',
  ['student_my_interventions', 'teacher_student_interventions', 'teacher_withdraw_intervention',
   'teacher_record_intervention', 'class_interventions_append_only', 'class_interventions',
   'intervention_kind']
    .filter((o) => !new RegExp('drop [a-z ]*if exists ' + o + '\\b').test(ROLLBACK)), []);

t.done();
