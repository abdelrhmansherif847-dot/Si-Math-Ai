// Contract suite for Mock delivery.
//
// The delivery layer exists for one reason: docs/engineering/weakness-evidence-audit.md
// found that no per-item response is recorded anywhere, and that every blocked
// weakness insight is blocked by that one absence. So the checks here are about
// whether it records the right four things, and whether it can be trusted with
// the answer key.
//
// FOUR PROPERTIES:
//   1. KEY        the answer key never reaches the browser, and grading happens
//                 only on the server
//   2. EVIDENCE   response, correctness, time and revisits are all captured, and
//                 an omission is recorded WITHOUT becoming a weakness signal
//   3. REUSE      it feeds the existing pipeline rather than forking it — no new
//                 signal source, no second analyzer, no second grader
//   4. SCOPE      it captures evidence and stops. No scaled scores, no adaptive
//                 routing, no proctoring.
//
// The behavioural half of this — grading, timing accumulation, ownership,
// idempotency — was verified against the live database inside a rolled-back
// transaction; see docs/engineering/exam-delivery-verification.md. This suite
// guards the properties that a later edit could quietly remove.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('exam-delivery');

const TABLES = read('supabase/migrations/20260830e_exam_delivery.sql');
const RPCS   = read('supabase/migrations/20260830f_exam_delivery_rpcs.sql');
const BACK   = read('supabase/migrations/20260830y_exam_delivery_rollback.sql');

/** Executable SQL only — these files explain at length what they do not do. */
const exec = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const E_TABLES = exec(TABLES), E_RPCS = exec(RPCS), E_ALL = E_TABLES + '\n' + E_RPCS;

const fn = (name) => {
  const m = new RegExp(`create or replace function ${name}\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(E_RPCS);
  if (!m) throw new Error(`exam-delivery: ${name}() not found`);
  return { sig: m[1], body: m[2] };
};

// ══ 1 · THE ANSWER KEY ════════════════════════════════════════════════════
t.section('The answer key never leaves the server');

const start = fn('exam_start');
t.ok('exam_start returns a named field list (not select *)', /jsonb_build_object/.test(start.body));
t.is('it returns neither the correct answer nor the explanation',
  ['correct_answer', 'explanation'].filter((c) => new RegExp(`'${c}'|\\bq\\.${c}\\b`).test(start.body)), []);
t.ok('but it does return what a student needs to answer',
  /'prompt'/.test(start.body) && /'choices'/.test(start.body) && /'ordinal'/.test(start.body));

/* Grading is the only legitimate reader of the key, and it lives in submit. */
const submit = fn('exam_submit');
t.ok('exam_submit is the only place the key is read', /q\.correct_answer/.test(submit.body));
t.ok('and the only place is_correct is written',
  (E_ALL.match(/set\s+is_correct/g) || []).length === 1 && /set is_correct/.test(submit.body));

/* exam_answer_matches takes the correct answer as an argument, so a client able
   to call it could probe the key one guess at a time. */
t.ok('the matcher is not callable by a client',
  /revoke all on function exam_answer_matches\(text, text, text\)\s+from public, anon, authenticated/.test(E_RPCS)
  && !/grant execute on function exam_answer_matches/.test(E_RPCS));

t.is('clients get no write verb on either table',
  [...E_TABLES.matchAll(/grant\s+(insert|update|delete)[^;]*to\s+(anon|authenticated)/gi)].map((m) => m[0]), []);
for (const tbl of ['exam_attempts', 'exam_responses']) {
  t.ok(`${tbl}: RLS on`, new RegExp(`alter table ${tbl}\\s+enable row level security`).test(E_TABLES));
  t.ok(`${tbl}: anon stripped, authenticated gets SELECT only`,
    new RegExp(`revoke all on table ${tbl}\\s+from anon, authenticated`).test(E_TABLES)
    && new RegExp(`grant select on table ${tbl}\\s+to authenticated`).test(E_TABLES));
}

// ══ 2 · THE EVIDENCE ══════════════════════════════════════════════════════
t.section('The four facts the audit found missing');

for (const [col, why] of [['answer', 'what they chose'], ['is_correct', 'whether it was right'],
                          ['ms_on_item', 'how long they spent'], ['visit_count', 'how often they came back'],
                          ['first_seen_at', 'when they first reached it'], ['ordinal', 'where it sat in the paper']])
  t.ok(`exam_responses records ${why}`, new RegExp(`\\n\\s+${col}\\s`).test(E_TABLES));

t.ok('a row exists per item before any answer, so omission is a row not a gap',
  /insert into exam_responses \(attempt_id, question_id, ordinal\)[\s\S]{0,200}from exam_questions/.test(start.body));

/* The finding the dry run produced: an unanswered item must not be graded
   false, or the questions at the end of a timed paper become a topic weakness. */
t.ok('an unanswered item is left ungraded, not marked wrong',
  /when r\.answer is null then null/.test(submit.body));
t.ok('the weakness signal is built only from ATTEMPTED wrong answers',
  /r\.is_correct is false/.test(submit.body) && !/is_correct is false or r\.answer is null/.test(submit.body));
t.ok('time is accumulated, never overwritten',
  /ms_on_item\s*=\s*r\.ms_on_item\s*\+/.test(fn('exam_save_response').body));
t.ok('a runaway timer cannot report a week', /least\(greatest\(coalesce\(p_ms_delta, 0\), 0\), 3600000\)/.test(fn('exam_save_response').body));

// ══ 3 · REUSE, NOT A FORK ═════════════════════════════════════════════════
t.section('It feeds the existing pipeline instead of forking it');

t.ok('it writes the session table history and the streak already read',
  /insert into exam_practice_sessions/.test(submit.body));
t.ok('it fills the three exam_mistakes columns that are empty in every legacy row',
  /question_id, correct_answer, student_answer/.test(submit.body));
t.ok('it returns mistakes in the shape the frozen logger takes',
  /'topic'/.test(submit.body) && /'subtopic'/.test(submit.body) && /'count'/.test(submit.body));

/* A second writer of weakness_signals would be a second analyzer. The frozen
   logger stays the only one. */
t.is('it writes no weakness signal itself',
  ['weakness_signals', 'weakness_reports', 'mastery_records']
    .filter((tbl) => new RegExp(`\\b${tbl}\\b`).test(E_ALL)), []);
t.ok('and invents no new signal source',
  !/'MOCK_EXAM'|'AI_CHAT'|'FOCUS_PRACTICE'/.test(E_ALL));

// ══ 4 · SCOPE ═════════════════════════════════════════════════════════════
t.section('It captures evidence and stops');

t.ok('score is left NULL rather than invented', /score,[\s\S]{0,400}null,/.test(submit.body));
t.is('no scoring, routing or proctoring crept in',
  ['scaled_score', 'percentile', 'adaptive', 'route', 'exam_integrity_events']
    .filter((k) => new RegExp(k, 'i').test(E_ALL)), []);
t.ok('only published forms are deliverable',
  /v_form\.status <> 'published'/.test(start.body)
  && /f\.status = 'published'/.test(fn('exam_available_sections').body));
t.ok('an attempt belongs to one section', /section_id\s+uuid not null references exam_form_sections/.test(E_TABLES));

// ══ 5 · HYGIENE ═══════════════════════════════════════════════════════════
t.section('The same privilege and rollback discipline as everything else here');

const created = [...E_ALL.matchAll(/create or replace function ([a-z_]+)\s*\(/gi)].map((m) => m[1]);
t.ok('functions were created (not a vacuous list)', created.length >= 5);
t.is('every function is revoked from public, anon, authenticated',
  [...new Set(created)].filter((f) => !new RegExp(`revoke all on function ${f}\\s*\\(`).test(E_ALL)), []);
t.is('every definer function pins its search_path',
  [...E_ALL.matchAll(/security definer([\s\S]*?)as \$\$/g)]
    .filter((m) => !/set search_path = pg_catalog, public/.test(m[1])).length, 0);

const E_BACK = exec(BACK);
t.is('the rollback drops every function',
  [...new Set(created)].filter((f) => !new RegExp(`drop function if exists ${f}\\s*\\(`).test(E_BACK)), []);
t.is('the rollback drops both tables',
  ['exam_attempts', 'exam_responses'].filter((x) => !new RegExp(`drop table if exists ${x}\\b`).test(E_BACK)), []);
t.ok('the rollback leaves the student\'s history and weaknesses alone',
  !/exam_practice_sessions|exam_mistakes|weakness_/.test(E_BACK));
t.ok('and says so, because the asymmetry is the dangerous part',
  /NOT recoverable|asymmetric/i.test(BACK));

t.done();
