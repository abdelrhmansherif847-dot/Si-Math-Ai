// Contract suite for the STUDENT side of Teacher Exams (3g).
//
// A read-only audit proved 3g needed no new schema: every screen is served by
// RPCs 3d and 3e already shipped. So what there is to check is the seam between
// two exam systems sharing one player, and the four ways that goes wrong:
//
//   1. the answer key reaches the student, because a table got read directly
//      instead of going through the named-column select in teacher_exam_start();
//   2. a teacher-authored result reaches the analyzer, because finish() ran its
//      platform hand-off for a paper that must not enter the evidence pipeline;
//   3. the page decides for itself who may sit, instead of asking can_start;
//   4. the PLATFORM experience changes, which is the one thing 3g must not do.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('teacher-exam-student');
const PAGE = read('assignments.html');

// ══ 1 · THE ANSWER KEY ════════════════════════════════════════════════════
t.section('The key stays on the server');

// teacher_exam_start() selects a named column list that omits correct_answer
// and explanation. Reading the tables directly would go around it — and the
// student DOES hold SELECT on them, so this is a live hazard.
t.is('the page reads no teacher-exam table directly',
  ['teacher_exams', 'teacher_exam_questions', 'teacher_exam_stimuli',
   'teacher_exam_access', 'teacher_exam_attempts', 'teacher_exam_responses']
    .filter((n) => new RegExp(`from\\('${n}'`).test(PAGE)), []);
/* H8 gave the page one place that MAY name the key: the homework review, where
   student_homework_paper() sends correct_answer and explanation only to a
   caller who owns a submitted attempt on a paper whose teacher has released
   them. That is a different contract from a teacher EXAM, which never releases
   its key at all — so rather than dropping this check, it is narrowed to
   everywhere else, and pinned so the exemption cannot go vacuous. */
const HWREVIEW = (() => {
  const a = PAGE.indexOf('function hwReviewItem(it, keyVisible) {');
  if (a < 0) throw new Error('assignments.html: hwReviewItem() could not be located');
  return PAGE.slice(a, PAGE.indexOf('\n}\n', a));
})();
t.ok('hwReviewItem() was located (not a vacuous slice)', HWREVIEW.length > 400);
t.ok('the homework review is the exemption, and really does name the key',
  /it\.correct_answer/.test(HWREVIEW) && /it\.explanation/.test(HWREVIEW));
t.ok('and draws it only where the SERVER said this caller may see it',
  /keyVisible && it\.correct_answer != null/.test(HWREVIEW));
t.is('the page names the answer key nowhere else',
  [...PAGE.replace(HWREVIEW, '').matchAll(/correct_answer|\.explanation\b/g)].map((m) => m[0]), []);

// ══ 2 · THE ANALYZER BOUNDARY ═════════════════════════════════════════════
t.section('A teacher-authored result is not learning evidence');

const finishBody = (() => {
  const a = PAGE.indexOf('async function finish(res) {');
  if (a < 0) throw new Error('assignments.html: finish() could not be located');
  return PAGE.slice(a, PAGE.indexOf('\n}\n', a));
})();
t.ok('finish() was located (not a vacuous slice)', finishBody.length > 400);
// The guard must come BEFORE the hand-off, or it guards nothing.
const guardAt = finishBody.indexOf("if (S.source === 'teacher')");
const loggerAt = finishBody.indexOf('ExamMistakesLogger');
t.ok('finish() has a teacher-exam guard', guardAt > 0);
t.ok('the analyzer hand-off exists at all (not vacuous)', loggerAt > 0);
t.ok('the guard comes BEFORE the analyzer hand-off', guardAt < loggerAt);
/* Naming only the logger let a mutant hoist regenerateWeaknessReports above
   the guard and stay green. EVERY writer has to sit below it, so list them. */
t.is('no pipeline writer runs before the guard',
  ['ExamMistakesLogger', 'regenerateWeaknessReports', 'updateStreak']
    .filter((w) => finishBody.indexOf(w) < guardAt), []);
t.ok('and the guard returns rather than falling through', /return;\n  \}/.test(finishBody.slice(guardAt)));
// Position alone is not enough: it stays true when the call is disabled. The
// streak must be BOTH after the guard and still reachable for platform papers.
t.ok('the streak update sits after the teacher-exam guard',
  finishBody.indexOf('updateStreak') > guardAt);
t.ok('and is still reachable for a platform paper',
  /if \(window\.updateStreak\) await window\.updateStreak\(/.test(PAGE));

// ══ 3 · THE PAGE DOES NOT DECIDE WHO MAY SIT ══════════════════════════════
t.section('can_start is the server\'s answer, not the page\'s');

t.ok('a tile becomes startable only on can_start', /if \(e\.can_start\) \{/.test(PAGE));
// Re-deriving the rule client-side is the breach: the page must not test
// approval or membership itself.
t.ok('the page does not re-derive approval',
  !/access_state\s*===\s*'approved'/.test(PAGE));
t.ok('the page does not re-derive membership', !/is_member/.test(PAGE));

/* The page DOES read opens_at/closes_at — but only to word a row it has
   already been told is not startable. Scoped to the function that words it,
   so the tile's own decision cannot quietly grow a second condition. */
const TILE = PAGE.slice(PAGE.indexOf('function teacherTile(e) {'),
                        PAGE.indexOf('\n}', PAGE.indexOf('function teacherTile(e) {')));
t.ok('teacherTile() was located (not a vacuous slice)', TILE.length > 300);
t.is('the startable decision reads nothing but can_start',
  [...TILE.matchAll(/opens_at|closes_at|access_state\s*===|status\s*===/g)].map((m) => m[0]), []);

// ══ 4 · EVERY ACCESS STATE IS SHOWN ═══════════════════════════════════════
t.section('The student is told where they stand');
for (const st of ['pending', 'rejected', 'revoked']) {
  t.ok(`the ${st} state is rendered`, new RegExp(`${st}:\\s*\\[`).test(PAGE));
}
t.ok('a closed exam says so', /e\.status === 'closed'\) return \['Closed'/.test(PAGE));

/* THE HONESTY RULE, and it is not decoration — the headless probe caught the
   page saying "Not open yet" about a published, in-window exam whose student
   had simply been removed from the class. can_start carries no reason, so a
   row the page cannot explain must say so instead of inventing a cause. */
const WHY = PAGE.slice(PAGE.indexOf('function whyNotOpen(e) {'),
                       PAGE.indexOf('\n}', PAGE.indexOf('function whyNotOpen(e) {')));
t.ok('whyNotOpen() was located (not a vacuous slice)', WHY.length > 200);
t.ok('a window that has not opened names the date', /opens > now\) return \['Opens '/.test(WHY));
t.ok('a window that has passed says so', /closes < now\) return \['Window closed'/.test(WHY));
/* The fallback is the whole point: everything the page cannot see — a revoked
   class link, a deactivated workspace — lands here, and must not claim a cause. */
t.ok('an unexplainable row makes no claim about the exam',
  /return \['Ask your teacher'/.test(WHY));
/* Scoped to the LAST return in the function — the fallback itself. Slicing
   from the window branch instead would trip on its own "Window closed". */
const fallback = WHY.slice(WHY.lastIndexOf('return ['));
t.is('and the fallback never asserts the exam is shut or unopened',
  [...fallback.matchAll(/Not open yet|Closed|Window closed/g)].map((m) => m[0]), []);
t.ok('the code box exists', /id="codeIn"/.test(PAGE) && /rpc\('student_request_exam_access'/.test(PAGE));
t.ok('a code failure is surfaced to the student', /That code did not match an open exam/.test(PAGE));

// ══ 5 · ONE PLAYER, TWO SYSTEMS ═══════════════════════════════════════════
t.section('The seam is a dispatch, not a second player');

for (const [fn, teacherRpc, platformRpc] of [
  ['start', 'teacher_exam_start', 'exam_start'],
  ['save', 'teacher_exam_save_response', 'exam_save_response'],
  ['submit', 'teacher_exam_submit', 'exam_submit'],
]) {
  /* rpc('...') with the quotes, not a bare name: 'teacher_exam_start' contains
     'exam_start', and a substring match let both branches point at the teacher
     RPC while still reading as a dispatch. */
  t.ok(`${fn}() dispatches on S.source and keeps both paths`,
    new RegExp(`S\\.source === 'teacher'[\\s\\S]{0,220}rpc\\('${teacherRpc}'[\\s\\S]{0,220}rpc\\('${platformRpc}'`).test(PAGE));
}
// One localStorage namespace per system, or a resume could land on the wrong
// sitting: both ids are uuids and would otherwise share a key space.
t.ok('resume keys are namespaced by source', /'exam_req_' \+ \(S\.source === 'teacher' \? 't_' : ''\)/.test(PAGE));
t.ok('the shared renderer is still the only one', /window\.StimulusView\s*\n?\s*\?\s*window\.StimulusView\.render/.test(PAGE));

// ══ 6 · THE PLATFORM EXPERIENCE IS UNCHANGED ══════════════════════════════
t.section('Nothing about the platform papers moved');

t.ok('platform exams still come from the unparameterised published read',
  /rpc\('exam_available_sections'\)/.test(PAGE));
// Asserting the CALL exists is not enough — disabling its condition leaves the
// string in place. The hand-off has to still be reachable.
t.ok('the platform hand-off to the frozen logger is still reachable',
  /if \(window\.ExamMistakesLogger && res\.session_id\) \{[\s\S]{0,200}ExamMistakesLogger\.process\(/.test(PAGE));
t.ok('the frozen analyzer still rebuilds the reports', /regenerateWeaknessReports/.test(PAGE));
t.ok('platform tiles still start via data-sec', /data-sec="/.test(PAGE));
t.ok('the source defaults to platform', /source: 'platform'/.test(PAGE));
// Every DB call preview-guarded, teacher ones included.
const api = PAGE.slice(PAGE.indexOf('const api = {'), PAGE.indexOf('\n};', PAGE.indexOf('const api = {')));
const unguarded = api.split(/\n  async /).slice(1)
  .filter((m) => /\bsb\.rpc/.test(m) && !/S\.preview/.test(m))
  .map((m) => (m.match(/^(\w+)/) || [])[1]);
t.is('every api method that reaches the database is preview-guarded', unguarded, []);

t.done();
