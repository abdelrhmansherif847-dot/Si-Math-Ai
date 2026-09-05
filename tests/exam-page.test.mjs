// The delivery page — the browser half of the evidence layer.
//
// tests/exam-delivery.test.mjs guards the database contract. This one guards
// what the page does with it: that a preview reaches nothing, that the four
// facts are actually reported, that the hand-off goes to the frozen pipeline
// rather than around it, and that the page never tells a student something the
// platform did not compute.
//
// The flow itself was driven in a real browser — start, answer, navigate to a
// grid-in item, type, submit — and reached "1 correct, 1 wrong, 2 left blank,
// 4 questions". These checks are what stop that behaviour being edited away.

import { suite } from './_assert.mjs';
import { read, slice, evalSnippet } from './_source.mjs';

const t = suite('exam-page');
const PAGE = read('assignments.html');

const API = (() => {
  const a = PAGE.indexOf('const api = {');
  const b = PAGE.indexOf('\n};', a);
  if (a < 0 || b < 0) throw new Error('assignments.html: the api object could not be located');
  return PAGE.slice(a, b);
})();

// ══ 1 · PREVIEW ═══════════════════════════════════════════════════════════
t.section('A preview paper reaches nothing');

t.ok('preview is opt-in from the query string', /preview.*===\s*'1'/.test(PAGE));
const methods = API.split(/\n  async /).slice(1).map((seg) => ({ name: (seg.match(/^(\w+)/) || [])[1], body: seg }));
const reaching = methods.filter((m) => /\bsb\.rpc/.test(m.body));
// A floor, not an exact count: the point is only that the preview-guard
// check below is not testing an empty set. 3g took it from 5 to 7.
t.ok('api methods reach the database (not vacuous)', reaching.length >= 7);
t.is('every database call is preceded by a preview guard',
  reaching.filter((m) => {
    const g = m.body.search(/if \(S\.preview\)/), c = m.body.search(/\bsb\.rpc/);
    return g < 0 || g > c;
  }).map((m) => m.name), []);
t.ok('a preview submit records no weakness',
  /res\.preview[\s\S]{0,400}nothing was saved and no weakness was recorded/.test(PAGE));
t.ok('and returns before the pipeline hand-off', /if \(res\.preview\) return;/.test(PAGE));

// ══ 2 · THE FOUR FACTS ════════════════════════════════════════════════════
t.section('It reports what the evidence layer exists to record');

t.ok('the answer is sent', /p_answer:/.test(PAGE));
t.ok('time is sent as a DELTA, not a running total',
  /const delta = Date\.now\(\) - S\.enteredAt;[\s\S]{0,120}S\.enteredAt = Date\.now\(\)/.test(PAGE));
t.ok('a visit is recorded on entering an item', /api\.save\(it\.question_id, it\.answer, 0, true\)/.test(PAGE));
t.ok('time is flushed when leaving an item, and periodically', /setInterval\(\(\) => \{ if \(!S\.submitting\) flush\(false\)/.test(PAGE));
t.ok('and on the tab going away', /visibilitychange/.test(PAGE) && /beforeunload/.test(PAGE));

// ══ 3 · THE HAND-OFF ══════════════════════════════════════════════════════
t.section('It feeds the frozen pipeline instead of going around it');

t.ok('the frozen logger is what writes the signals', /window\.ExamMistakesLogger[\s\S]{0,200}\.process\(/.test(PAGE));
t.ok('the frozen analyzer is what rebuilds the reports', /window\.regenerateWeaknessReports\(/.test(PAGE));
t.is('the page writes no weakness table itself',
  ['weakness_signals', 'weakness_reports', 'mastery_records', 'exam_mistakes']
    .filter((tbl) => new RegExp(`from\\('${tbl}'\\)`).test(PAGE)), []);
t.is('every RPC it calls is one of the approved ones',
  [...new Set([...PAGE.matchAll(/\.rpc\('([a-z_]+)'/g)].map((m) => m[1]))]
    .filter((f) => !['exam_available_sections', 'exam_start', 'exam_save_response', 'exam_submit',
                     'student_my_teachers',
                     // 3g. The five STUDENT-side teacher-exam contracts and no
                     // others: nothing here may reach an authoring or staff RPC.
                     'student_my_teacher_exams', 'student_request_exam_access',
                     'teacher_exam_start', 'teacher_exam_save_response',
                     'teacher_exam_submit',
                     // H8. The six STUDENT-side homework contracts and no
                     // others. Every one of them is a function H4 or H5
                     // installed; nothing here may reach a staff RPC either.
                     'student_my_homework', 'student_attach_homework',
                     'student_homework_start', 'student_homework_paper',
                     'student_homework_save', 'student_homework_submit'].includes(f)), []);
/* The same rule for homework: the student page must never reach the surface
   teacher-homework.html uses. Named individually so wiring one in fails. */
t.is('no staff-only homework RPC is reachable from the student page',
  ['teacher_homework_create', 'teacher_homework_publish', 'teacher_homework_close',
   'teacher_homework_list', 'teacher_homework_paper', 'teacher_homework_students',
   'teacher_homework_review', 'teacher_homework_reveal_answers',
   'teacher_homework_rotate_code', 'teacher_homework_save_question',
   'teacher_homework_delete']
    .filter((fn) => new RegExp(`rpc\\('${fn}'`).test(PAGE)), []);
/* The student player must never call a STAFF surface. Naming them individually
   is what makes this fail if one is ever wired in by mistake. */
t.is('no staff-only teacher-exam RPC is reachable from the student page',
  ['teacher_exam_create', 'teacher_exam_publish', 'teacher_exam_close', 'teacher_exam_requests',
   'teacher_exam_decide_access', 'teacher_exam_results', 'teacher_exam_result_detail',
   'teacher_exam_rotate_code', 'teacher_exam_save_question', 'teacher_exam_approve_members']
    .filter((fn) => new RegExp(`rpc\\('${fn}'`).test(PAGE)), []);
t.ok('the dependencies the frozen logger needs are loaded',
  ['taxonomy.js', 'taxonomy-write.js', 'mastery-updater.js', 'regenerate-reports.js', 'exam-mistakes-logger.js']
    .every((f) => new RegExp(`<script src="${f.replace('.', '\\.')}"`).test(PAGE)));

// ══ 4 · HONESTY ═══════════════════════════════════════════════════════════
t.section('It tells the student only what was computed');

/* Scoped to what is RENDERED — the prose above the check legitimately explains
   why no scaled score exists, and a check that trips on its own explanation is
   a check that gets deleted. */
const RESULT = PAGE.slice(PAGE.indexOf("$('doneStats').innerHTML"), PAGE.indexOf("$('doneNote')"));
t.ok('the result block was located (not a vacuous slice)', RESULT.length > 200);
t.is('the result shows four raw counts and nothing else',
  [...RESULT.matchAll(/l: '([^']+)'/g)].map((m) => m[1]),
  ['Correct', 'Wrong', 'Left blank', 'Questions']);
t.ok('no scaled or converted score is rendered anywhere',
  !/res\.score|scaled_score|out of 800/.test(PAGE));
/* The distinction the dry run forced into the schema has to reach the student,
   or they will read "left blank" as "got it wrong" exactly as a teacher would. */
t.ok('blank is explained as pacing, not as not knowing',
  /left blank are recorded but not counted as weaknesses/i.test(PAGE)
  && /running out of time is a pacing/i.test(PAGE));

// ══ 5 · SITTING MECHANICS ═════════════════════════════════════════════════
t.section('Timed, resumable, and hard to lose work in');

t.ok('the timer is anchored to the server\'s started_at, not to page load',
  /new Date\(S\.attempt\.started_at\)\.getTime\(\)/.test(PAGE));
t.ok('running out of time submits', /if \(left <= 0\)[\s\S]{0,60}doSubmit\(true\)/.test(PAGE));
t.ok('a stable request id makes a refresh resume the same sitting',
  /localStorage\.getItem\(key\)/.test(PAGE) && /exam_start[\s\S]{0,200}p_client_request_id: reqId/.test(PAGE));
t.ok('an already-submitted attempt cannot be sat again',
  /S\.attempt\.status === 'submitted'/.test(PAGE));
t.ok('submitting with blanks asks first', /still blank\. Submit anyway/.test(PAGE));
t.ok('a failed submit returns the student to the paper, not to a dead end',
  /catch \(e\)[\s\S]{0,200}show\('sitting'\)[\s\S]{0,120}Your answers are saved/.test(PAGE));

// ══ 6 · ROBUSTNESS ════════════════════════════════════════════════════════
t.section('Regressions carried over from the other pages');

t.ok('the supabase client is constructed defensively',
  /window\.supabase && window\.supabase\.createClient/.test(PAGE));
t.ok('missing math rendering degrades to readable text',
  /if \(!window\.renderMathInElement\) return;/.test(PAGE));
t.ok('prompts and choices are escaped', /esc\(it\.prompt\)/.test(PAGE) && /esc\(c\.text\)/.test(PAGE));
t.ok('reduced motion is honoured', /prefers-reduced-motion: reduce/.test(PAGE));

/* Nothing is published, so the honest empty state is the one students see. */
t.ok('an empty catalogue explains itself rather than looking broken',
  /No exam is available yet/.test(PAGE) && /that is deliberate, not a fault/.test(PAGE));

// ══ 7 · THE TWO CATEGORIES ════════════════════════════════════════════════
// Increment A. The page grew a category structure and NOTHING ELSE: no teacher
// exam content, no second code, no schema. These checks pin the shape so the
// Teacher Assignment system has somewhere honest to land, and so the platform
// catalogue cannot quietly acquire a class.
t.section('Platform exams and Teachers are separate categories');

/* H8 renamed the second category and split it in two. The platform catalogue
   and the teacher-set work are still separate headings, and homework and exams
   are separate GROUPS under the second — because their two code boxes do
   different things and a student must be able to tell them apart. */
t.ok('both categories exist in the markup',
  /class="sec-label"[^>]*>Platform exams</.test(PAGE)
  && /class="sec-label"[^>]*>From your teachers</.test(PAGE));
t.ok('and the teacher category is split into homework and exams',
  /class="grp">Homework /.test(PAGE) && /class="grp">Exams /.test(PAGE));
t.ok('they render into separate containers',
  /id="pickList"/.test(PAGE) && /id="teacherList"/.test(PAGE));

/* The Teachers block is hidden by default in the markup AND hidden again
   whenever there is no active link, so neither alone is load-bearing. */
t.ok('the Teachers block ships hidden', /id="teachersBlock" style="display:none"/.test(PAGE));
/* 3g widened this by exactly one case: a student with no class but a pending
   request must still see it, or the request they raised has nowhere to appear.
   Anyone with neither still gets nothing. */
/* H8 widened it by one more case, for the same reason: a student removed from
   a class keeps the homework they already submitted, so homework alone opens
   the block too. Anyone with none of the three still gets nothing. */
t.ok('and is hidden for a student with neither a class nor a request',
  /if \(!teachers\.length && !exams\.length && !homework\.length\) \{\n\s*\$\('teachersBlock'\)\.style\.display = 'none'; return;\n\s*\}/.test(PAGE));

/* A student who LEFT a class must not keep the category: student_my_teachers()
   returns revoked and removed links too, ordered active-first but unfiltered. */
t.ok('only an ACTIVE link opens the category', /filter\(\(t\) => t && t\.status === 'active'\)/.test(PAGE));

/* Platform grouping is derived, not enumerated, so a family added later cannot
   silently vanish from the page. */
t.ok('families are derived from exam_code, not hardcoded',
  /split\('_'\)\[0\]/.test(PAGE));
t.ok('an unknown family still gets a heading rather than disappearing',
  /rest = \[\.\.\.byFamily\.keys\(\)\]\.filter/.test(PAGE) && /known\.concat\(rest\)/.test(PAGE));

/* The seam, connected in 3g. It reads the student's OWN access rows, which is
   what keeps an exam undiscoverable without its code — the RPC is scoped to
   auth.uid() and takes no workspace argument to widen. */
t.ok('teacherExams() calls student_my_teacher_exams()',
  /async teacherExams\(\) \{[\s\S]{0,320}rpc\('student_my_teacher_exams'\)/.test(PAGE));
t.ok('it passes no workspace argument that could widen the scope',
  !/student_my_teacher_exams',\s*\{/.test(PAGE));
/* Reading a teacher-exam TABLE directly would bypass the named-column select
   that keeps the answer key server-side. The student page holds SELECT on
   those tables, so this is a live hazard, not a theoretical one. */
t.is('the student page reads no teacher-exam table directly',
  ['teacher_exams', 'teacher_exam_questions', 'teacher_exam_stimuli', 'teacher_exam_access',
   'teacher_exam_attempts', 'teacher_exam_responses', 'homework', 'assignment']
    .filter((n) => new RegExp(`from\\('${n}'`).test(PAGE)), []);

/* Both empty states have to read as deliberate rather than broken — the whole
   page is empty today and will be until a form is published. */
t.ok('the Teachers empty state is honest about being empty',
  /No exam yet/.test(PAGE) && /appear here once you enter the code your teacher gives you/.test(PAGE));
/* H8 made this state reachable with NO active class link — a student removed
   from their class who still holds submitted homework opens the block on the
   strength of the homework alone. `names` is then empty, so the sentence needs
   a subject either way and this check covers both halves. */
t.ok('it names the class the papers would come from, and never leaves a hole',
  /Papers set by ' \+ \(names \|\| 'your teacher'\)/.test(PAGE));

/* The platform side must stay exactly what it was. */
t.ok('platform exams still come from the unparameterised published read',
  /rpc\('exam_available_sections'\)/.test(PAGE));
t.is('the page sends no workspace or class argument to any exam RPC',
  [...PAGE.matchAll(/p_workspace|workspace_id:|p_class/g)].map((m) => m[0]), []);

// ══ F-4 · ROOM SOUND ══════════════════════════════════════════════════════
//
// The ambience control. Two things have to be true and they are proved
// differently: the WIRING is read out of the page source, and the RULES are
// RUN — the preference block is sliced out and executed against fake storage,
// because "returns false when localStorage throws" is not a claim a regex can
// make. tests/teacher-class-patterns.test.mjs set that precedent.
t.section('F-4 — the room-sound control is wired into the bar');

t.ok('the page loads the ambience capability', /<script src="exam-ambience\.js"><\/script>/.test(PAGE));
t.ok('the control sits before the clock, not after it',
  PAGE.indexOf('id="ambBtn"') < PAGE.indexOf('id="timer"'));
t.ok('it starts hidden', /id="ambBtn"[\s\S]{0,120}style="display:none"/.test(PAGE));

// The accessible name is the whole point of not reusing settings.html's
// .toggle, which ships four unnamed checkboxes.
const BTN = slice(PAGE, '<button class="ambtn" id="ambBtn"', '</button>', 'ambBtn markup');
t.ok('it has a real accessible name', /aria-label="Room sound"/.test(BTN));
t.ok('state is carried by aria-pressed', /aria-pressed="false"/.test(BTN));
t.ok('the icon is hidden from assistive tech', /aria-hidden="true"/.test(BTN));
t.ok('it is a button, not a div', /type="button"/.test(BTN));
t.ok('the click is wired', /\$\('ambBtn'\)\.addEventListener\('click', ambToggle\);/.test(PAGE));

// An icon-sized control, because the 58px bar already carries three things on
// a phone and this page has no width breakpoint.
t.ok('the control is icon-sized', /\.ambtn\{[^}]*width:34px;height:34px/.test(PAGE));
t.ok('it has a visible focus state', /\.ambtn:focus-visible\{outline:/.test(PAGE));
t.ok('the pressed look is driven by aria-pressed, not a second class',
  /\.ambtn\[aria-pressed="true"\]\{/.test(PAGE));

t.section('F-4 — the control is isolated from the clock and the footer');

// W-1 stays open: the pulse is untouched and nothing new animates.
t.ok('the three timer rules are byte-identical',
  PAGE.includes('.timer{font-family:var(--font-mono);font-size:19px;font-weight:700;color:var(--cyan-3);')
  && PAGE.includes('.timer.warn{color:#fcd34d;border-color:var(--amber-border);background:var(--amber-soft)}')
  && PAGE.includes('.timer.crit{color:#fca5a5;border-color:var(--red-border);background:var(--red-soft);animation:pulse 1.6s ease-in-out infinite}'));
t.ok('the control animates nothing', !/\.ambtn[^{]*\{[^}]*animation/.test(PAGE));
t.is('there is exactly one pulse animation on the page still',
  (PAGE.match(/animation:pulse/g) || []).length, 1);

const AMB = slice(PAGE, "const AMB_KEY = 'simath_exam_ambience';", '\nfunction show(which) {', 'ambience block');
const AMBCODE = AMB.split('\n').filter((l) => !/^\s*(\/\*|\*|\/\/)/.test(l)).join('\n');

// Reading prose is how a check goes green on a comment. These read code.
for (const forbidden of ['S.tick', 'S.endsAt', 'startTimer', 'timer', 'Footer', 'createElement']) {
  t.ok(`the block never touches ${forbidden}`, !AMBCODE.includes(forbidden));
}
// W-5 stays closed: still exactly the two footers that were there before.
t.is('no third footer was introduced', (PAGE.match(/id="(hw)?[Ff]ooter"/g) || []).length, 2);

// It must not have grown a bypass, a calculator, or an announcement.
for (const forbidden of ['desmos', 'checkMode', 'SiExamAudio', 'SiExamRegistry', 'Calculator']) {
  t.ok(`the block has no ${forbidden}`, !AMB.includes(forbidden));
}

t.section('F-4 — the rules, RUN against fake storage');

/* A sandbox holding the real sliced block. `store` is the localStorage stand-in
   — omit it entirely to model a browser where the identifier does not resolve
   at all, which is a different failure from one that throws. */
function amb(opts) {
  opts = opts || {};
  const calls = [];
  const btn = { style: { display: 'none' }, attrs: {},
                setAttribute(k, v) { this.attrs[k] = v; } };
  const g = {};
  if (opts.noModule !== true) {
    g.SiExamAmbience = {
      enable() { calls.push('enable'); return true; },
      disable() { calls.push('disable'); return true; },
      noteModule(k) { calls.push('noteModule:' + k); return true; },
    };
  }
  const env = {
    window: g,
    $: (id) => (id === 'ambBtn' ? btn : null),
    S: { attempt: opts.attempt === undefined ? { attempt_id: 'A1' } : opts.attempt },
  };
  if (opts.store !== 'absent') env.localStorage = opts.store || memStore();
  const api = evalSnippet(AMB, env,
    ['AMB_KEY', 'ambWanted', 'ambRemember', 'ambApply', 'ambPaint', 'ambToggle', 'ambSync']);
  return { api, btn, calls, store: env.localStorage };
}
function memStore(seed) {
  const m = new Map(Object.entries(seed || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
           removeItem: (k) => m.delete(k), _map: m };
}
const throwStore = { getItem() { throw new Error('blocked'); },
                     setItem() { throw new Error('blocked'); },
                     removeItem() { throw new Error('blocked'); } };

// ── default off ──────────────────────────────────────────────────────────
{
  const { api, calls } = amb();
  t.is('the key is the one settings would later own', api.AMB_KEY, 'simath_exam_ambience');
  t.ok('a student who never chose hears nothing', api.ambWanted() === false);
  t.is('and nothing was enabled by loading the block', calls, []);
}

// ── the value is read strictly ───────────────────────────────────────────
t.ok("'on' is on", amb({ store: memStore({ simath_exam_ambience: 'on' }) }).api.ambWanted() === true);
for (const v of ['off', 'ON', 'true', '1', 'yes', '']) {
  t.ok(`'${v}' is not on`, amb({ store: memStore({ simath_exam_ambience: v }) }).api.ambWanted() === false);
}

// ── storage that fails ───────────────────────────────────────────────────
{
  const { api } = amb({ store: throwStore });
  t.ok('a throwing read fails closed to OFF', api.ambWanted() === false);
  let threw = false;
  try { api.ambRemember(true); } catch (_) { threw = true; }
  t.ok('a throwing write is swallowed', threw === false);
  t.ok('and it is still off afterwards', api.ambWanted() === false);
}
{
  const { api } = amb({ store: 'absent' });
  t.ok('no localStorage at all fails closed to OFF', api.ambWanted() === false);
  let threw = false;
  try { api.ambRemember(true); } catch (_) { threw = true; }
  t.ok('and writing without storage does not throw', threw === false);
}

// ── persistence round trip ───────────────────────────────────────────────
{
  const { api, store } = amb();
  api.ambRemember(true);
  t.is('on is written as the exact string', store.getItem('simath_exam_ambience'), 'on');
  t.ok('and reads back on', api.ambWanted() === true);
  api.ambRemember(false);
  t.is('off is written explicitly, not deleted', store.getItem('simath_exam_ambience'), 'off');
  t.ok('and reads back off', api.ambWanted() === false);
}

// ── the toggle ───────────────────────────────────────────────────────────
{
  const { api, btn, calls, store } = amb();
  api.ambToggle();
  t.is('one click enables', calls, ['enable']);
  t.is('and persists', store.getItem('simath_exam_ambience'), 'on');
  t.is('and paints the button pressed', btn.attrs['aria-pressed'], 'true');
  api.ambToggle();
  t.is('a second click disables', calls, ['enable', 'disable']);
  t.is('and persists off', store.getItem('simath_exam_ambience'), 'off');
  t.is('and paints it unpressed', btn.attrs['aria-pressed'], 'false');
}

t.section('F-4 — visibility: the exam screen and nowhere else');

for (const screen of ['pick', 'hwSit', 'hwRev', 'done', 'loading']) {
  const { api, btn, calls } = amb({ store: memStore({ simath_exam_ambience: 'on' }) });
  api.ambSync(screen);
  t.is(`hidden on ${screen}`, btn.style.display, 'none');
  t.is(`and silenced on ${screen}`, calls, ['disable']);
}
{
  const { api, btn, calls } = amb({ store: memStore({ simath_exam_ambience: 'on' }) });
  api.ambSync('sitting');
  t.is('shown on sitting', btn.style.display, '');
  t.is('the module is told which sitting it is, then started',
    calls, ['noteModule:A1', 'enable']);
  t.is('and the button shows the stored state', btn.attrs['aria-pressed'], 'true');
}
{
  // The whole point of default-off: entering the exam screen having never
  // chosen must NOT start anything.
  const { api, btn, calls } = amb();
  api.ambSync('sitting');
  t.is('shown on sitting even when off', btn.style.display, '');
  t.is('but nothing is enabled', calls, ['noteModule:A1']);
  t.is('and the button reads unpressed', btn.attrs['aria-pressed'], 'false');
}
{
  // A failed submit re-enters sitting. noteModule is idempotent on the key, so
  // this must not look like a new module to the caller either.
  const { api, calls } = amb({ store: memStore({ simath_exam_ambience: 'on' }) });
  api.ambSync('sitting'); api.ambSync('sitting');
  t.is('re-entering the same sitting passes the same key',
    calls, ['noteModule:A1', 'enable', 'noteModule:A1', 'enable']);
}
{
  // No capability loaded: no control at all, rather than a dead button.
  const { api, btn } = amb({ noModule: true, store: memStore({ simath_exam_ambience: 'on' }) });
  api.ambSync('sitting');
  t.is('with no module the control is not shown', btn.style.display, 'none');
  t.ok('and applying does nothing', api.ambApply(true) === false);
}
{
  // An attempt with no id must not throw on the way into the screen.
  const { api, btn } = amb({ attempt: null, store: memStore({ simath_exam_ambience: 'on' }) });
  let threw = false;
  try { api.ambSync('sitting'); } catch (_) { threw = true; }
  t.ok('a missing attempt does not break the screen switch', threw === false);
  t.is('and the control still shows', btn.style.display, '');
}

t.done();
