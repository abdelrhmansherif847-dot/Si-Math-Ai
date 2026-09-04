// Contract suite for Teacher Exams I-2a — the two staff read RPCs.
//
// I-2a is the exam twin of H6. It gives teacher-exams.html somewhere to read
// from other than the tables, and it deliberately revokes NOTHING: the page has
// to be live on these functions before the grants go, or staff are blind in
// between. Homework did it the other way round and measurably was.
//
// What can go wrong in a file like this, and what each section pins:
//   1. it gates AFTER selecting, so an outsider learns a class is empty rather
//      than that it is not theirs;
//   2. it ships every column, which is the shape I-2 exists to remove —
//      media_sha256 in particular is server-computed and read by no client;
//   3. it quietly does I-2b's revokes too, and reopens the blind window;
//   4. it redefines a live function on the way past (the 20260831e hazard);
//   5. it grants EXECUTE to anon by forgetting that the default ACL is PUBLIC.
//
// Every assertion is made against the SQL with `--` comments STRIPPED. The file
// says the words "media_sha256" and "revoke" in prose precisely in order to say
// they are absent or scoped, and a check that reads prose can only ever go the
// wrong way — the defect H3 §6.8 and H4 §7.8 each found in their own
// verification block.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('teacher-exam-reads');

const RAW = read('supabase/migrations/20260907a_teacher_exam_reads.sql');
const RAW_BACK = read('supabase/migrations/20260907z_teacher_exam_reads_rollback.sql');
const strip = (s) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const SQL = strip(RAW);
const BACK = strip(RAW_BACK);

// ══ 0 · THE STRIP IS REAL ═════════════════════════════════════════════════
t.section('The comment strip removed prose and kept the SQL');

t.ok('the migration is a real file', RAW.length > 6000);
t.ok('stripping removed a lot of prose', SQL.length < RAW.length - 3000);
t.ok('and left the SQL behind',
  /create or replace function teacher_exam_list/.test(SQL)
  && /create or replace function teacher_exam_paper/.test(SQL));
/* The load-bearing case: the header explains that media_sha256 is absent, so
   the word exists in the file and must NOT exist in the stripped SQL. */
t.ok('media_sha256 is discussed in the prose', /media_sha256/.test(RAW));
/* The claim is about the two function BODIES. The migration's own verification
   block names the column deliberately — that block IS the check — so asserting
   zero occurrences in the whole file would be asserting the check away. */
const shaAt = [...SQL.matchAll(/media_sha256/g)].map((m) => m.index);
t.ok('it appears in the executable SQL (the file checks for it)', shaAt.length >= 1);
t.is('and EVERY occurrence is inside the verification block, never in a body',
  shaAt.filter((i) => i < SQL.indexOf('do $v$')), []);

// ══ 1 · SHAPE ════════════════════════════════════════════════════════════
t.section('Two functions, one transaction, nothing else');

t.ok('it is a single transaction', /^begin;/m.test(SQL) && /^commit;/m.test(SQL));
const created = [...SQL.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]).sort();
t.is('it creates exactly the two read functions', created, ['teacher_exam_list', 'teacher_exam_paper']);
/* The 20260831e hazard: a file that redefines a live function reverts whatever
   changed in it since. These two names do not exist in production today. */
t.is('and redefines nothing else',
  created.filter((f) => !['teacher_exam_list', 'teacher_exam_paper'].includes(f)), []);

for (const kw of ['create table', 'create policy', 'alter policy', 'drop policy',
                  'create trigger', 'drop trigger', 'alter type', 'create type',
                  'alter table', 'create index']) {
  t.ok(`no ${kw}`, !new RegExp(kw, 'i').test(SQL));
}

for (const fn of ['teacher_exam_list(p_workspace uuid)', 'teacher_exam_paper(p_exam uuid)']) {
  const name = fn.split('(')[0];
  const body = SQL.slice(SQL.indexOf(`create or replace function ${fn}`),
                         SQL.indexOf('$fn$;', SQL.indexOf(`create or replace function ${fn}`)));
  t.ok(`${name} was located (not a vacuous slice)`, body.length > 300);
  t.ok(`${name} is stable`, /\bstable\b/.test(body));
  t.ok(`${name} is security definer`, /security definer/.test(body));
  t.ok(`${name} pins its search_path`, /set search_path = pg_catalog, public/.test(body));
}

// ══ 2 · THE GATE COMES FIRST ═════════════════════════════════════════════
t.section('An outsider is refused, not handed an empty set');

const LIST = SQL.slice(SQL.indexOf('create or replace function teacher_exam_list'),
                       SQL.indexOf('$fn$;', SQL.indexOf('create or replace function teacher_exam_list')));
const PAPER = SQL.slice(SQL.indexOf('create or replace function teacher_exam_paper'),
                        SQL.indexOf('$fn$;', SQL.indexOf('create or replace function teacher_exam_paper')));

t.ok('the list gates on workspace_is_active_staff', /if not workspace_is_active_staff\(p_workspace\)/.test(LIST));
t.ok('the paper gates on teacher_exam_is_staff', /if not teacher_exam_is_staff\(p_exam\)/.test(PAPER));
/* Positional, not merely present: a gate after the select would already have
   answered the question it exists to refuse. */
t.ok('the list gate precedes its select', LIST.indexOf('workspace_is_active_staff') < LIST.indexOf('return query'));
t.ok('the paper gate precedes its select', PAPER.indexOf('teacher_exam_is_staff') < PAPER.indexOf('select * into e'));
t.ok('both refuse with 42501',
  (LIST.match(/errcode = '42501'/g) || []).length === 1
  && (PAPER.match(/errcode = '42501'/g) || []).length === 1);
/* The gates are role-blind and carry no admin arm — H6's decision, kept. */
t.is('neither gate reads staff_role', (SQL.match(/staff_role/g) || []).length, 0);
t.is('and neither carries the policies admin arm', (SQL.match(/has_role_at_least/g) || []).length, 0);

// ══ 3 · WHAT THE PAPER RETURNS ═══════════════════════════════════════════
t.section('Named fields, counted — not select *');

t.is('no select * anywhere', (SQL.match(/select\s+\*/g) || []).length, 1);  // `select * into e` only
t.ok('…and that one is the rowtype fetch after the gate', /select \* into e from teacher_exams where id = p_exam/.test(PAPER));

const stimBlock = PAPER.slice(PAPER.indexOf("'stimuli'"), PAPER.indexOf("'questions'"));
const qBlock = PAPER.slice(PAPER.indexOf("'questions'"));
const fieldsOf = (b) => [...b.matchAll(/'(\w+)',\s*(?:s|q)\.\w+/g)].map((m) => m[1]);
const stimFields = fieldsOf(stimBlock), qFields = fieldsOf(qBlock);
t.is('seven stimulus fields, named one by one', stimFields.length, 7);
t.is('and they are these seven', stimFields.sort(),
  ['body', 'id', 'kind', 'label', 'media_kind', 'media_ref', 'spec']);
t.is('eight question fields', qFields.length, 8);
t.is('and they are these eight', qFields.sort(),
  ['choices', 'correct_answer', 'explanation', 'id', 'ordinal', 'prompt', 'question_format', 'stimulus_id']);
/* media_kind is required by stimulus-view.js: renderFigure() refuses to draw
   without it. Its presence is the non-vacuity proof for the media_sha256
   absence above — the strip did not simply delete the whole block. */
t.ok('media_kind is present, because the renderer needs it', stimFields.includes('media_kind'));
/* The claim that matters, stated where the bodies are in scope: neither
   function body names the column, so no s.* can have crept back in. */
t.is('neither function body names media_sha256',
  [['teacher_exam_list', LIST], ['teacher_exam_paper', PAPER]]
    .filter(([, b]) => /media_sha256/.test(b)).map(([n]) => n), []);
t.ok('and the renderer really does require it',
  /st\.media_kind !== 'svg'/.test(read('stimulus-view.js')));
/* The key IS here, and that is not a leak: the function is staff-gated and
   staff authored it. The student path is untouched. */
t.ok('the answer key is returned to staff', qFields.includes('correct_answer'));
t.is('and no student-facing function is redefined',
  created.filter((f) => /^(exam_|student_)/.test(f)), []);

// ══ 4 · THE I-2b BOUNDARY ════════════════════════════════════════════════
t.section('This file revokes nothing on any table');

/* The whole reason I-2 is split in two. H5 revoked before H6 restored the read,
   and staff were measurably blind in between — 42501 on both content tables for
   a teacher AND an active assistant, with no way to edit an existing question. */
const revokes = [...SQL.matchAll(/revoke\s+[\s\S]*?\s+on\s+(\w+)/g)].map((m) => m[1]);
t.ok('it revokes something (not vacuous)', revokes.length === 2);
t.is('and every revoke is on a FUNCTION, never a table', revokes.filter((x) => x !== 'function'), []);
t.is('no table is named in a grant or revoke',
  ['teacher_exam_questions', 'teacher_exam_stimuli', 'teacher_exams']
    .filter((tb) => new RegExp(`(grant|revoke)[\\s\\S]{0,80}\\bon\\s+(table\\s+)?${tb}\\b`, 'i').test(SQL)), []);
/* Concepts, not a sentence: the header must name the deferred half and the
   failure it exists to avoid. Pinning the exact wording would make a reword a
   test failure, which is a contract about prose rather than about the file. */
t.ok('the header names the deferred half and the blind window it avoids',
  /I-2b/.test(RAW) && /blind/i.test(RAW) && /20260905a|H5/.test(RAW));

// ══ 5 · WHO MAY CALL ═════════════════════════════════════════════════════
t.section('authenticated only, and revoke before grant');

for (const fn of ['teacher_exam_list', 'teacher_exam_paper']) {
  t.ok(`${fn} is revoked from public, anon, authenticated first`,
    new RegExp(`revoke all on function ${fn}\\(uuid\\)\\s+from public, anon, authenticated`).test(SQL));
  t.ok(`${fn} is then granted to authenticated`,
    new RegExp(`grant execute on function ${fn}\\(uuid\\)\\s+to authenticated`).test(SQL));
}
t.is('nothing is granted to anon', (SQL.match(/grant[^;]*to[^;]*\banon\b/g) || []).length, 0);
/* Order matters: the default ACL on a new function is EXECUTE to PUBLIC, so a
   grant without a preceding revoke leaves anon able to call it. */
t.ok('every revoke precedes every grant',
  SQL.lastIndexOf('revoke all on function') < SQL.indexOf('grant execute on function'));

// ══ 6 · ORDERING IS THE PAGE'S CURRENT ORDERING ══════════════════════════
t.section('The list preserves the order the page already shows');

t.ok('the list orders by created_at desc', /order by e\.created_at desc/.test(LIST));
t.ok('…which is what teacher-exams.html asks the table for today',
  /\.order\('created_at', \{ ascending: false \}\)/.test(read('teacher-exams.html')));
/* H6's homework list puts drafts first. Adopting that here would be a UX
   change inside a read-boundary increment, so it is deliberately not made. */
t.ok('and it does NOT adopt H6s drafts-first ordering', !/case e\.status when 'draft'/.test(LIST));

// ══ 7 · THE ROLLBACK ═════════════════════════════════════════════════════
t.section('Two drops, no window, no refusal');

t.ok('the rollback is a real file', RAW_BACK.length > 1500);
const dropped = [...BACK.matchAll(/drop function if exists (\w+)\(/g)].map((m) => m[1]).sort();
t.is('it drops exactly the two this migration adds', dropped, ['teacher_exam_list', 'teacher_exam_paper']);
t.is('and drops nothing else', dropped.length, created.length);
t.ok('it touches no table', !/(create|alter|drop)\s+table/i.test(BACK));
t.is('and no grant or revoke at all', (BACK.match(/^\s*(grant|revoke)\b/gm) || []).length, 0);
/* No refusal condition, deliberately: nothing is restored, so there is no state
   that makes the undo unsafe later than it was earlier. */
t.ok('it states that it has no window', /NO WINDOW/.test(RAW_BACK));
t.ok('and warns that I-2b changes that', /I-2b/.test(RAW_BACK) && /blind/i.test(RAW_BACK));
t.ok('it verifies the other 29 functions survive', /expected 29/.test(BACK));

// ══ 8 · THE FILE VERIFIES ITSELF ═════════════════════════════════════════
t.section('The migration carries its own assertions');

t.ok('it has a verification block', /do \$v\$/.test(SQL) && /raise notice/.test(SQL));
t.ok('it asserts the function shape', /prosecdef/.test(SQL) && /provolatile = 's'/.test(SQL));
t.ok('it asserts anon cannot call either', /has_function_privilege\('anon'/.test(SQL));
t.ok('it asserts the content-table grants did not move', /content-table grants|the content-table grants moved/.test(SQL));
/* Asserted as a HASH of the live bodies, not a count: the first draft said
   28 + 2 = 30, the real number is 29, and the production dry-run refused the
   file. A count cannot notice a REDEFINITION anyway, which is the hazard. */
t.ok('it asserts no existing function was redefined, by body hash',
  /a664e4521cbaffc1d0cce3f051dbdcfd/.test(SQL) && /an existing teacher_exam\* body changed/.test(SQL));
t.ok('and the rollback asserts the same hash',
  /a664e4521cbaffc1d0cce3f051dbdcfd/.test(BACK));
t.ok('the counts agree with the hash check', /expected 31 = 29/.test(SQL) && /expected 29/.test(BACK));
/* The strip check inside the FILE has its own non-vacuity guard, for the same
   reason this suite does. */
t.ok('its media_sha256 check strips comments first', /regexp_replace\(p\.prosrc/.test(SQL)
  && SQL.indexOf('regexp_replace(p.prosrc') < SQL.indexOf("like '%media_sha256%'"));
t.ok('…and proves the strip did not remove media_kind too', /media_kind is gone too/.test(RAW));

t.done();
