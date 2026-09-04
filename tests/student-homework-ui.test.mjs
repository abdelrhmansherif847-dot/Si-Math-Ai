// Contract suite for the STUDENT homework surface (H8).
//
// H8 added no schema, no RPC, no policy and no migration: every call it makes
// is a function H4 and H5 already installed and verified. What it added is a
// player, and a player is where a backend contract quietly stops being true.
// The six ways this one could go wrong:
//
//   1. it reaches a homework TABLE instead of an RPC. Students hold no SELECT
//      on teacher_homework_questions or teacher_homework_stimuli at all
//      (H5 revoked both), and RLS answers 0 rows on the rest — so a direct
//      read would fail silently rather than loudly, which is worse;
//   2. it lets a homework result reach the analyzer. exam.html is the one page
//      that loads ExamMistakesLogger, regenerateWeaknessReports and
//      updateStreak, so the boundary is drawn INSIDE this file or nowhere;
//   3. it reads can_open before attempt_status, and a student's own marked
//      homework disappears the day their teacher closes the paper;
//   4. it puts a clock on an untimed paper, or submits one for the student;
//   5. it re-derives the answer-key rule in the browser instead of reading
//      what the server chose to send;
//   6. it changes the platform or teacher-exam paths on the way past.
//
// Every check is written so it COULD go red: each names the exact string whose
// absence is the breach, in a page that really does contain the rest.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('student-homework-ui');

const PAGE = read('exam.html');
const DASH = read('dashboard.html');

/* The page's CODE, with its comments removed. Every structural claim below is
   made against this rather than against the prose: a comment that happens to
   name a table, an RPC or a forbidden call would otherwise decide the result.
   That defect has been found three separate times in this repo's own
   verification blocks, so it is designed out here rather than watched for. */
const strip = (s) => s
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
const CODE = strip(PAGE);
const DCODE = strip(DASH);

/** A top-level function body, by its exact header line. Throws rather than
 *  returning an empty slice: a vacuous slice passes every check in it. */
function fn(src, header, where = 'exam.html') {
  const a = src.indexOf(header);
  if (a < 0) throw new Error(`${where}: ${header} not found`);
  const b = src.indexOf('\n}\n', a);
  if (b < 0) throw new Error(`${where}: end of ${header} not found`);
  const out = src.slice(a, b + 2);
  if (out.length < header.length + 40) throw new Error(`${where}: ${header} sliced empty`);
  return out;
}

// ══ 0 · THE STRIP IS REAL ═════════════════════════════════════════════════
t.section('The comment strip removed comments and kept the code');

t.ok('the page is a real page (not vacuous)', PAGE.length > 40000);
t.ok('stripping removed something', CODE.length < PAGE.length - 4000);
t.ok('and left the homework code behind',
  (CODE.match(/student_homework_|student_attach_homework|student_my_homework/g) || []).length >= 6);
t.ok('a sentence that exists only in a comment is gone',
  /THE ORDER OF THESE BRANCHES IS THE CONTRACT/.test(PAGE)
  && !/THE ORDER OF THESE BRANCHES IS THE CONTRACT/.test(CODE));
t.ok('the dashboard strip did the same',
  /A read-only summary, loaded on its own/.test(DASH)
  && !/A read-only summary, loaded on its own/.test(DCODE));

// ══ 1 · THE READ BOUNDARY ═════════════════════════════════════════════════
t.section('Every homework read goes through an RPC, and no table is touched');

/* The strongest available form, and it is exact: exam.html reaches the
   database through sb.rpc() and through nothing else at all. */
t.is('the page never queries a table through the supabase client',
  (CODE.match(/\bsb\s*\.\s*from\(/g) || []).length, 0);
t.is('and names no table in a query anywhere',
  (CODE.match(/\.from\(\s*['"`]/g) || []).length, 0);
t.is('no homework table is named on the page at all',
  ['teacher_homework', 'teacher_homework_questions', 'teacher_homework_stimuli',
   'teacher_homework_access', 'teacher_homework_attempts', 'teacher_homework_responses',
   'teacher_homework_retired_codes', 'teacher_homework_attach_attempts']
    .filter((n) => new RegExp(`['"\`]${n}['"\`]`).test(CODE)), []);

const HW_RPCS = ['student_my_homework', 'student_attach_homework', 'student_homework_start',
                 'student_homework_paper', 'student_homework_save', 'student_homework_submit'];
for (const fnName of HW_RPCS) t.ok(`it calls ${fnName}`, new RegExp(`rpc\\('${fnName}'`).test(CODE));

/* The student page must never reach the staff surface teacher-homework.html
   uses. Named one by one, so wiring any of them in fails here. */
t.is('no staff homework RPC is reachable from the student page',
  ['teacher_homework_list', 'teacher_homework_paper', 'teacher_homework_students',
   'teacher_homework_review', 'teacher_homework_create', 'teacher_homework_publish',
   'teacher_homework_close', 'teacher_homework_delete', 'teacher_homework_rotate_code',
   'teacher_homework_reveal_answers', 'teacher_homework_save_question',
   'teacher_homework_save_stimulus', 'teacher_homework_reorder']
    .filter((n) => new RegExp(`rpc\\('${n}'`).test(CODE)), []);

// ══ 2 · THE ANALYZER BOUNDARY ═════════════════════════════════════════════
t.section('A homework result is not learning evidence');

const HW_FNS = [
  'async function submitHwCode() {',
  'function renderHomework(rows, teachers) {',
  'function homeworkTile(h) {',
  'function whyNoHomework(h) {',
  'async function openHomework(id) {',
  'function hwRender() {',
  'function hwPalette() {',
  'function hwCurrentTyped() {',
  'function hwFlush() {',
  'function hwChoose(id) {',
  'function hwGo(i) {',
  'async function hwDoSubmit() {',
  'async function openHomeworkReview(id) {',
  'function hwReviewItem(it, keyVisible) {',
  'function hwAnswerText(it, id) {',
];
const HW_CODE = HW_FNS.map((h) => fn(CODE, h)).join('\n');
t.ok('the homework functions were located (not a vacuous slice)', HW_CODE.length > 6000);
t.ok('and they are the real ones', /rpc\('student_homework_submit'/.test(fn(CODE, 'const api = {').length ? CODE : '')
  && /hwSubmit\(S\.attempt\.attempt_id\)/.test(HW_CODE));

/* The three writers of the learning profile. exam.html loads all three, so
   this file is the only place the boundary can be drawn. */
t.is('no homework function reaches a writer of the learning profile',
  ['ExamMistakesLogger', 'regenerateWeaknessReports', 'updateStreak']
    .filter((w) => new RegExp(`\\b${w}\\b`).test(HW_CODE)), []);
/* finish() is where all three live, so not reaching it is the same claim
   stated at the one door they are behind. */
t.ok('and none of them calls finish()', !/\bfinish\(/.test(HW_CODE));
t.is('finish() is defined once', [...CODE.matchAll(/async function finish\(/g)].length, 1);
t.is('and called from the two exam paths only',
  [...CODE.matchAll(/(?:await |return )finish\(/g)].length, 2);
t.ok('the two callers are the exam ones',
  /return finish\(await api\.submit\(\)\)/.test(fn(CODE, 'async function startSection(sectionId) {'))
  && /await finish\(res\)/.test(fn(CODE, 'async function doSubmit(auto) {')));

/* The homework path writes no table and posts nothing to the analyzer even
   by name — the counterpart of the check the exam page makes for itself. */
t.is('the homework path names no analyzer table',
  ['weakness_signals', 'weakness_reports', 'mastery_records', 'exam_mistakes',
   'exam_practice_sessions', 'question_records']
    .filter((tbl) => new RegExp(tbl).test(HW_CODE)), []);

// ══ 3 · THE LIFECYCLE INVARIANT ═══════════════════════════════════════════
t.section('attempt_status is read before can_open, everywhere');

const TILE = fn(CODE, 'function homeworkTile(h) {');
const atSubmitted = TILE.indexOf("attempt_status === 'submitted'");
const atCanOpen = TILE.indexOf('h.can_open');
t.ok('the tile tests attempt_status', atSubmitted > 0);
t.ok('the tile tests can_open', atCanOpen > 0);
/* THE CHECK. can_open is the start-or-resume gate and goes false the moment
   the paper closes; a submitted attempt is finished work the student keeps.
   Reading can_open first would hide their own marked homework. */
t.ok('and submitted is decided FIRST', atSubmitted < atCanOpen);
t.ok('a submitted homework offers Review', /data-hw-review="/.test(TILE));
t.ok('an openable one offers Start or Continue',
  /data-hw-open="/.test(TILE) && /'Continue' : 'Start'/.test(TILE));

const REVIEW = fn(CODE, 'async function openHomeworkReview(id) {');
/* THE OTHER HALF. Review must read the paper directly: a submitted attempt is
   not startable, and a student whose class link has lapsed can still read
   their own finished work — which is exactly when can_open is false. */
t.ok('review reads the paper directly', /api\.hwPaper\(id\)/.test(REVIEW));
t.ok('and never starts a sitting to get there', !/hwStart\(/.test(REVIEW));
t.ok('opening a submitted homework lands on the review, not a sitting',
  /if \(st\.status === 'submitted'\) return openHomeworkReview\(id\)/.test(fn(CODE, 'async function openHomework(id) {')));

// ══ 4 · UNTIMED, AND NEVER SUBMITTED FOR THE STUDENT ══════════════════════
t.section('Homework has no clock and no auto-submit');

t.is('no homework function touches the timer',
  ['S.tick', 'startTimer', 'S.endsAt', 'duration_seconds', 'mmss(', "$('timer')"]
    .filter((s) => HW_CODE.includes(s)), []);
/* The timer is bound to the exam screen inside show(), so there is no state of
   this page in which a homework sitting can display one. */
const SHOW = fn(CODE, 'function show(which) {');
t.ok('show() lists the two homework screens', /'hwSit', 'hwRev'/.test(SHOW));
t.ok('the timer is shown for the exam screen and nothing else',
  /\$\('timer'\)\.style\.display = \(which === 'sitting'\) \? '' : 'none'/.test(SHOW));
t.ok('the homework footer is shown only for the homework sitting',
  /\$\('hwFooter'\)\.style\.display = \(which === 'hwSit'\) \? '' : 'none'/.test(SHOW));
t.ok('the exam footer is unchanged',
  /\$\('footer'\)\.style\.display = \(which === 'sitting'\) \? '' : 'none'/.test(SHOW));

const SUBMIT = fn(CODE, 'async function hwDoSubmit() {');
t.ok('hwDoSubmit takes no auto flag', /async function hwDoSubmit\(\) \{/.test(CODE));
t.ok('and always asks the student first',
  (SUBMIT.match(/confirm\(/g) || []).length === 2);
t.ok('nothing but the button calls it',
  [...CODE.matchAll(/hwDoSubmit\(\)/g)].length === 2);   // the definition and the click handler

// ══ 5 · THE AUTOSAVE ══════════════════════════════════════════════════════
t.section('Answers are saved as the student works, and nothing else is');

const API = fn(CODE, 'const api = {');
t.ok('save sends exactly the three arguments the RPC takes',
  /\{ p_attempt: attemptId, p_question: questionId, p_answer: answer \}/.test(API));
/* Homework is untimed, so a per-item time would be a pacing number measured on
   a paper nobody sat under pacing conditions. The columns do not exist either. */
t.is('and sends no time and no visit',
  ['p_ms_delta', 'p_visit'].filter((a) => new RegExp(a).test(fn(CODE, '  async hwSave(attemptId, questionId, answer) {'))), []);

const FLUSH = fn(CODE, 'function hwFlush() {');
t.ok('a save only happens when the answer actually moved', /if \(value === it\.saved\) return/.test(FLUSH));
t.ok('and the saved marker moves only after the write succeeded',
  /\.then\(\(\) => \{ it\.saved = value; \}\)/.test(FLUSH));
t.ok('a resumed sitting starts with the server value already marked saved',
  /Object\.assign\(\{\}, i, \{ saved: i\.answer \}\)/.test(CODE));

for (const [what, re] of [
  ['choosing an option', /function hwChoose\(id\) \{[\s\S]{0,240}hwFlush\(\)/],
  ['leaving an item', /function hwGo\(i\) \{[\s\S]{0,160}hwFlush\(\)/],
  ['the write-in box losing focus', /\$\('hwGridInput'\)\.addEventListener\('blur', \(\) => \{ hwFlush\(\); \}\)/],
  ['the tab going away', /visibilitychange[\s\S]{0,120}S\.hwLive && document\.hidden\) hwFlush\(\)/],
  ['the page unloading', /beforeunload[\s\S]{0,80}if \(S\.hwLive\) hwFlush\(\)/],
  ['a twenty-second tick', /setInterval\(\(\) => \{ if \(S\.hwLive && !S\.hwSubmitting\) hwFlush\(\); \}, 20000\)/],
]) t.ok(`it saves on ${what}`, re.test(CODE));

/* The listeners are registered ONCE, at module scope, and gated on S.hwLive —
   so a second sitting reuses them instead of adding a second copy, and so a
   homework save can never fire during an exam sitting. The exam player keeps
   its own two, registered per sitting; four in total, and none shared. */
t.is('the page registers four background listeners in total',
  [...CODE.matchAll(/addEventListener\('beforeunload'/g)].length
  + [...CODE.matchAll(/addEventListener\('visibilitychange'/g)].length, 4);
t.is('exactly two of them are the homework ones',
  [...CODE.matchAll(/addEventListener\('(?:beforeunload|visibilitychange)'[^\n]*\n?[^\n]*S\.hwLive/g)].length, 2);
t.ok('and the start path registers none, so a second sitting adds none',
  !/addEventListener/.test(fn(CODE, 'async function openHomework(id) {')));
t.ok('every background save is gated on a live homework sitting',
  (CODE.match(/S\.hwLive/g) || []).length >= 6);

// ══ 6 · THE ANSWER KEY ════════════════════════════════════════════════════
t.section('The key is what the server sent, never what the page decided');

const RVITEM = fn(CODE, 'function hwReviewItem(it, keyVisible) {');
t.ok('keyVisible comes from the server-computed flag',
  /const keyVisible = !!paper\.answers_visible;/.test(REVIEW));
/* answers_visible is NOT reveal_answers: the flag alone is not sufficient, the
   caller must also own this submitted attempt. Re-deriving it from
   reveal_answers in the browser would hand the key to a student mid-sitting. */
t.is('the page never reads reveal_answers', (CODE.match(/reveal_answers/g) || []).length, 0);
t.ok('the key is drawn only where the server said so',
  /keyVisible && it\.correct_answer != null/.test(RVITEM));
t.ok('and so is the explanation', /keyVisible && it\.explanation/.test(RVITEM));
/* An unanswered question is never a wrong one — is_correct is three-valued and
   the review must not collapse NULL into false. */
t.ok('a blank answer is reported as blank, not as wrong',
  /it\.is_correct === false \? \['Wrong'/.test(RVITEM)
  && /it\.answer == null \? \['Left blank'/.test(RVITEM));
t.ok('the counts use the same three-valued rule',
  /i\.is_correct === true\)\.length[\s\S]{0,200}i\.is_correct === false\)\.length[\s\S]{0,200}i\.answer == null\)\.length/.test(REVIEW));

/* The boundary is stated to the STUDENT and not only enforced in the code. A
   result they can see but cannot explain is a result they will draw their own
   conclusions from. */
t.ok('the review says a homework result is not weakness evidence',
  /does not change your weakness analysis/.test(fn(CODE, 'async function openHomeworkReview(id) {')));
t.ok('and the picker says the same before they start',
  /neither it nor a teacher's exam changes your weakness analysis/.test(PAGE));
t.ok('the picker no longer claims everything on it is timed',
  /homework is untimed and saved as you go/.test(PAGE));
t.ok('and a homework title cannot outlive its screen',
  /if \(which === 'pick'\) \{ \$\('barTitle'\)\.textContent = 'Exams & homework';/.test(CODE));

// ══ 7 · THE TWO CODE BOXES ════════════════════════════════════════════════
t.section('A homework code attaches; an exam code requests');

t.ok('there are two separate inputs', /id="hwCodeIn"/.test(PAGE) && /id="codeIn"/.test(PAGE));
t.ok('with two separate handlers',
  /\$\('hwCodeGo'\)\.addEventListener\('click', submitHwCode\)/.test(CODE)
  && /\$\('codeGo'\)\.addEventListener\('click', submitCode\)/.test(CODE));
const HWCODE = fn(CODE, 'async function submitHwCode() {');
t.ok('the homework box attaches', /api\.attachHomework\(code\)/.test(HWCODE));
t.ok('and the exam box still only requests',
  /api\.requestAccess\(code\)/.test(fn(CODE, 'async function submitCode() {')));
/* The server answers a wrong code, a draft's code, a closed paper's and a real
   code held by a class this student is not in with the identical 'no_match'.
   Splitting them apart here would hand back exactly what it withheld. */
t.ok('every refusal but one is the same sentence',
  (HWCODE.match(/That code did not match a homework you can open/g) || []).length === 2);
t.ok('and the page does not branch on any reason but staff',
  [...HWCODE.matchAll(/res\.reason === '([a-z_]+)'/g)].map((m) => m[1]).sort().join(',')
  === 'already_attached,staff');

// ══ 8 · THE PREVIEW ═══════════════════════════════════════════════════════
t.section('A preview reaches no homework');

for (const m of ['myHomework()', 'attachHomework(code)', 'hwStart(id)', 'hwPaper(id)',
                 'hwSave(attemptId, questionId, answer)', 'hwSubmit(attemptId)']) {
  const body = fn(CODE, `  async ${m} {`);
  const g = body.search(/if \(S\.preview\)/), c = body.search(/\bsb\.rpc/);
  t.ok(`${m.split('(')[0]} is preview-guarded before it reaches the database`, g >= 0 && (c < 0 || g < c));
}

// ══ 9 · THE PATHS THAT MUST NOT HAVE MOVED ════════════════════════════════
t.section('The platform and teacher-exam players are untouched');

for (const header of ['async function startSection(sectionId) {', 'function renderItem(isEntry) {',
                      'function flush(markVisit) {', 'async function doSubmit(auto) {',
                      'async function finish(res) {', 'function drawPalette() {']) {
  const body = fn(CODE, header);
  t.is(`${header.match(/function (\w+)/)[1]}() knows nothing about homework`,
    ['homework', 'hwFlush', 'hwRender', 'S.hwLive', 'hwPaper']
      .filter((s) => body.includes(s)), []);
}
t.ok('the exam still records a visit on entering an item',
  /api\.save\(it\.question_id, it\.answer, 0, true\)/.test(CODE));
t.ok('the exam still sends a time delta', /p_ms_delta: Math\.round\(msDelta\)/.test(CODE));
t.ok('the exam still auto-submits when its clock runs out',
  /if \(left <= 0\) \{ clearInterval\(S\.tick\); doSubmit\(true\); \}/.test(CODE));
/* H8 gave the page a screen a student can return to the picker from, so
   S.source can now be stale where before it never was. */
t.ok('a platform sitting names its own source explicitly',
  /async function startPlatformSection\(sectionId\) \{\n  S\.source = 'platform';/.test(CODE));
t.ok('and the platform tiles go through it',
  /startPlatformSection\(b\.getAttribute\('data-sec'\)\)/.test(CODE));

// ══ 10 · THE DASHBOARD CARD ═══════════════════════════════════════════════
t.section('The dashboard summarises and does not become a second list');

t.ok('the card exists and ships hidden',
  /id="teachSumCard" style="display:none"/.test(DASH));
t.ok('it spans the grid', /class="card span2" id="teachSumCard"/.test(DASH));
/* Placed after Focus Practice and before the Mock Exam card: the student's own
   work comes first, and a teacher's is next to the other things they sit. */
const iFocus = DASH.indexOf('Open Study Plan');
const iCard = DASH.indexOf('id="teachSumCard"');
const iMock = DASH.indexOf('<!-- MOCK EXAM -->');
t.ok('after Focus Practice', iFocus > 0 && iFocus < iCard);
t.ok('and before Mock Exam', iCard < iMock);

const SUM = fn(DCODE, 'async function loadTeacherSummary() {', 'dashboard.html');
t.ok('loadTeacherSummary() was located (not a vacuous slice)', SUM.length > 800);
t.is('it calls exactly the two list RPCs and nothing else',
  [...new Set([...SUM.matchAll(/\.rpc\('([a-z_]+)'/g)].map((m) => m[1]))].sort(),
  ['student_my_homework', 'student_my_teacher_exams']);
t.is('and reaches no table', (SUM.match(/\.from\(/g) || []).length, 0);
/* No new RPC: H8 added none, and a summary that needed one would be a backend
   increment wearing a dashboard card. */
t.ok('the two RPCs are ones the exam page already called',
  /rpc\('student_my_homework'\)/.test(CODE) && /rpc\('student_my_teacher_exams'\)/.test(CODE));

t.ok('the card is hidden when both lists are empty',
  /if \(!hw\.length && !ex\.length\) return;/.test(SUM));
/* Same branch order as the tile, for the same reason. */
const dSub = SUM.indexOf("attempt_status === 'submitted'");
const dOpen = SUM.indexOf('can_open');
t.ok('it counts a submitted attempt as done before it looks at can_open',
  dSub > 0 && dOpen > 0 && dSub < dOpen);
t.is('it shows no score, no mark and no question count',
  ['score', 'correct', 'wrong', 'is_correct', 'question_count', 'total']
    .filter((s) => new RegExp(`\\b${s}\\b`).test(SUM)), []);
const CARD = (() => {
  const a = DASH.indexOf('<section class="card span2" id="teachSumCard"');
  if (a < 0) throw new Error('dashboard.html: the teachers card could not be located');
  const b = DASH.indexOf('</section>', a);
  if (b < 0) throw new Error('dashboard.html: the teachers card has no end');
  return DASH.slice(a, b);
})();
t.ok('the card markup was located (not a vacuous slice)', CARD.length > 700);
t.is('and there is one destination, not two',
  [...new Set([...CARD.matchAll(/(?:href|location\.href)\s*=\s*'?"?([a-z-]+\.html)/g)].map((m) => m[1]))],
  ['exam.html']);
/* A failure here must leave the dashboard exactly as it was — the card stays
   hidden rather than raising the page's error banner. */
t.ok('it is loaded independently of the dashboard itself',
  /loadTeacherSummary\(\);\n\nloadDashboard\(\)\.catch/.test(DCODE));
t.is('it names no analyzer writer',
  ['ExamMistakesLogger', 'regenerateWeaknessReports', 'updateStreak']
    .filter((w) => SUM.includes(w)), []);

t.done();
