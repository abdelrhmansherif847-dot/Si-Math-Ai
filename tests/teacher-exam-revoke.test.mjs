// Contract suite for Teacher Exams I-2b — the client loses its direct reach.
//
// I-2b is two revoke statements. Almost everything that can go wrong with it
// is something it does that it should not, so most of this suite asserts
// ABSENCES — and an absence assertion is worthless unless the detector that
// looks for it can find the thing when it IS there. Every such check below
// carries a companion that proves the detector fires.
//
// What can go wrong:
//   1. it revokes MORE than the two approved tables — the scope was a
//      decision (teacher_exams and the three student-facing tables keep
//      their grants), not an oversight to tidy up;
//   2. it revokes before the page is off the tables — H5 did that and staff
//      were measurably blind until H6;
//   3. it drops a POLICY as well as the grant, confusing the rule with the
//      reach;
//   4. it claims to close a leak. It does not: RLS already returns zero rows
//      to non-staff, measured on production, and a migration that oversells
//      itself teaches the next reader the wrong lesson;
//   5. the rollback restores the wrong set, or the pair is run in an order
//      that leaves staff with neither an RPC nor a table.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('teacher-exam-revoke');

const RAW  = read('supabase/migrations/20260908a_teacher_exam_content_revoke.sql');
const BRAW = read('supabase/migrations/20260908z_teacher_exam_content_revoke_rollback.sql');
const strip = (s) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const SQL  = strip(RAW);
const BACK = strip(BRAW);
const PAGE = read('teacher-exams.html');

const REVOKED  = ['teacher_exam_questions', 'teacher_exam_stimuli'];
const KEPT     = ['teacher_exams', 'teacher_exam_access',
                  'teacher_exam_attempts', 'teacher_exam_responses'];

// ══ 0 · THE STRIP IS REAL ═════════════════════════════════════════════════
t.section('The comment strip removed prose and kept the SQL');
t.ok('the migration is a real file', RAW.length > 3000);
t.ok('stripping removed a lot of prose', SQL.length < RAW.length - 2000);
t.ok('and left the SQL behind', /revoke select on teacher_exam_questions/.test(SQL));

// ══ 1 · EXACTLY TWO REVOKES, AND THEY ARE THE APPROVED TWO ════════════════
t.section('Two tables lose their grant — not one, not six');

const revokes = [...SQL.matchAll(/revoke\s+select\s+on\s+(\w+)\s+from\s+(\w+)/g)]
  .map((m) => ({ table: m[1], role: m[2] }));
t.is('exactly two revoke statements', revokes.length, 2);
t.is('and they name exactly the two approved tables',
  revokes.map((r) => r.table).sort(), REVOKED);
t.is('each takes the grant from authenticated only',
  [...new Set(revokes.map((r) => r.role))], ['authenticated']);

/* THE SCOPE ASSERTION. A file that swept in teacher_exams — the change this
   increment deliberately did NOT make — dies here. */
for (const tb of KEPT) {
  t.ok(`${tb} is never revoked`,
    !new RegExp(`revoke[^;]*\\b${tb}\\b`).test(SQL));
}
/* …and the detector can find a revoke when there is one, so the four checks
   above are not four ways of matching nothing. */
t.ok('the KEPT detector fires on a real revoke',
  /revoke[^;]*\bteacher_exams\b/.test('revoke select on teacher_exams from authenticated;'));

t.is('the file grants nothing', (SQL.match(/^\s*grant\b/gm) || []), []);
for (const kw of ['create table', 'drop table', 'create policy', 'drop policy',
                  'alter policy', 'create function', 'create or replace function',
                  'drop function', 'create trigger', 'alter type', 'alter table']) {
  t.ok(`no ${kw}`, !new RegExp(kw, 'i').test(SQL));
}

// ══ 2 · IT DEPENDS ON I-2a HAVING SHIPPED FIRST ═══════════════════════════
t.section('Read first, revoke second — the H5 lesson, stated and asserted');

t.ok('the header names its dependency on I-2a', /20260907a/.test(RAW));
t.ok('…and on the page switch that made it safe', /5c064fa/.test(RAW));
t.ok('it explains the H5 blind window', /H5/.test(RAW) && /blind/i.test(RAW));
/* The file must assert at RUNTIME that the two reads are still callable — a
   revoke that lands while they are broken is the blind window again. */
t.ok('it asserts authenticated can still call both I-2a reads',
  /has_function_privilege\('authenticated', 'teacher_exam_list\(uuid\)'/.test(SQL)
  && /has_function_privilege\('authenticated', 'teacher_exam_paper\(uuid\)'/.test(SQL));

/* The page must already be off the tables. This is the precondition the whole
   increment rests on, so it is asserted against the page itself, not assumed. */
t.is('teacher-exams.html reads no table directly',
  [...new Set([...PAGE.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]))], []);
t.ok('…and it calls both replacement RPCs',
  /sb\.rpc\('teacher_exam_list'/.test(PAGE) && /sb\.rpc\('teacher_exam_paper'/.test(PAGE));

// ══ 3 · THE POLICIES SURVIVE ══════════════════════════════════════════════
t.section('The policy is the rule; the grant is the reach');

t.ok('it asserts both content-table policies still exist',
  /tablename in \('teacher_exam_questions', 'teacher_exam_stimuli'\)/.test(SQL)
  && /content-table policies moved/.test(SQL));
t.ok('it asserts the whole-schema policy count is unmoved', /expected 133/.test(SQL));

// ══ 4 · IT DOES NOT OVERSELL ITSELF ═══════════════════════════════════════
t.section('It removes reach, and says so');

/* Concepts, not a sentence: pinning exact wording would make a reword a test
   failure, which is a contract about prose rather than about the claim. */
t.ok('the header states it closes NO live leak',
  /CLOSES NO LIVE LEAK|closes no live leak/i.test(RAW));
t.ok('…and says what it does remove instead', /REACH|reach/.test(RAW));
t.ok('…and cites the measurement behind the claim',
  /zero rows|returned 0/i.test(RAW) && /RLS/.test(RAW));

// ══ 5 · NO EXISTING FUNCTION MOVES ════════════════════════════════════════
t.section('It adds and redefines nothing');
t.ok('it asserts the teacher_exam* bodies by hash, not by count alone',
  /5cf7b7617f098fc200aac7cf6ecc23c0/.test(SQL) && /expected 31/.test(SQL));

// ══ 6 · THE ROLLBACK ══════════════════════════════════════════════════════
t.section('Two grants back, and only those two');

const grants = [...BACK.matchAll(/grant\s+select\s+on\s+(\w+)\s+to\s+(\w+)/g)]
  .map((m) => ({ table: m[1], role: m[2] }));
t.is('exactly two grant statements', grants.length, 2);
t.is('restoring exactly the two tables the forward file revoked',
  grants.map((g) => g.table).sort(), REVOKED);
t.is('to authenticated only — never anon',
  [...new Set(grants.map((g) => g.role))], ['authenticated']);
t.is('the rollback revokes nothing', (BACK.match(/^\s*revoke\b/gm) || []), []);
t.ok('it touches no policy or function',
  !/(create|drop|alter)\s+(policy|function|table|trigger)/i.test(BACK));
t.ok('it asserts anon gained nothing', /grantee = 'anon'/.test(BACK));
t.ok('it asserts the full grant set is back to the pre-I-2b string',
  /teacher_exam_questions:SELECT/.test(BACK) && /teacher_exams:SELECT/.test(BACK));

/* THE ORDER RULE. Once I-2b is applied, running I-2a's rollback alone leaves
   staff with neither an RPC nor a table — the H5 blind state exactly. */
t.ok('the rollback warns that 20260907z must not run alone', /20260907z/.test(BRAW));
t.ok('…names the resulting blind state', /blind/i.test(BRAW) && /H5/.test(BRAW));
/* The guard must be REACHABLE, not merely present: `if false then raise
   warning` keeps every word and tests nothing. Assert the condition is wired
   to the count of surviving I-2a reads. */
t.ok('…and carries a runtime guard that is actually wired to the read count',
  /proname in \('teacher_exam_list', 'teacher_exam_paper'\)/.test(BACK)
  && /if n <> 2 then\s*\n\s*raise warning/.test(BACK));
t.ok('it states it has no window', /NO WINDOW/.test(BRAW));

t.done();
