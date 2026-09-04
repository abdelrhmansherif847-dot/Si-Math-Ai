// Contract suite for the Teacher Homework staff surface (H7).
//
// H7 added no schema at all — every read and every write is a function H2–H6
// already installed and verified. So what there is to check is a PAGE, and
// the five ways a staff page like this goes wrong quietly:
//
//   1. it calls an RPC nobody wrote, or reaches a table outside this system;
//   2. it reads a table DIRECTLY. teacher_homework still grants SELECT to
//      `authenticated`, so this one would work — and would step around the
//      read boundary H5's F-5 and H6's two read functions exist to draw.
//      The rule here is stricter than the exam page's: ZERO table reads;
//   3. it writes through a table instead of an RPC, which would need a grant
//      that deliberately does not exist;
//   4. it gates on the wrong thing — teacher-only, when assistants have
//      locked academic parity;
//   5. it draws stimuli itself instead of using the shipped renderer, so what
//      a teacher previews stops being what a student will see.
//
// Every check below is written so it COULD go red: each names the exact
// string whose absence would be the breach, against a page that really does
// contain the other strings around it.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('teacher-homework-ui');

const PAGE = read('teacher-homework.html');
const TEACHER = read('teacher.html');
const MIG = {
  h3: read('supabase/migrations/20260903b_teacher_homework_authoring.sql'),
  h4: read('supabase/migrations/20260904a_teacher_homework_h4.sql'),
  h5: read('supabase/migrations/20260905a_teacher_homework_h5.sql'),
  h6: read('supabase/migrations/20260906a_teacher_homework_h6.sql'),
};
const execSql = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const DEFINED = Object.values(MIG).map(execSql).join('\n');

/* The page's CODE, with its comments removed. Every structural claim below is
   made against this and not against the prose: a comment that happens to name
   a table or a call would otherwise decide the result, which is the mirror of
   the defect the H3 and H4 dry-runs found in their own verification blocks —
   a check that reads prose can only ever go the wrong way. */
const CODE = PAGE
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

// ══ 0 · THE STRIP IS REAL ═════════════════════════════════════════════════
t.section('The comment strip removed comments and kept the code');
t.ok('the page is a real page (not vacuous)', PAGE.length > 20000);
t.ok('stripping removed something', CODE.length < PAGE.length - 2000);
t.ok('and left the code behind', (CODE.match(/sb\.rpc\(/g) || []).length >= 18);
t.ok('a sentence that exists only in a comment is gone',
  /never drift from the first/.test(PAGE) && !/never drift from the first/.test(CODE));

// ══ 1 · PROVENANCE ════════════════════════════════════════════════════════
t.section('Every call the page makes is one somebody wrote');

const rpcs = [...new Set([...CODE.matchAll(/\.rpc\('([a-z_]+)'/g)].map((m) => m[1]))].sort();
t.ok('the page calls RPCs (not vacuous)', rpcs.length >= 18);
t.is('every RPC is defined by an applied homework migration',
  rpcs.filter((fn) => !new RegExp(`create or replace function ${fn}\\s*\\(`, 'i').test(DEFINED)
                   && fn !== 'teacher_my_workspaces'), []);

/* The five reads, named. Decision 2 of §15.29 fixed this list; anything added
   to it later is a boundary change and should be a deliberate one. */
const READS = ['teacher_my_workspaces', 'teacher_homework_list', 'teacher_homework_paper',
               'teacher_homework_students', 'teacher_homework_review'];
for (const fn of READS) t.ok(`the page reads through ${fn}`, rpcs.includes(fn));

/* And the thirteen writes, each mapped to one control. A missing one is a
   capability the page silently dropped. */
const WRITES = ['teacher_homework_create', 'teacher_homework_update', 'teacher_homework_set_due_at',
  'teacher_homework_reveal_answers', 'teacher_homework_delete', 'teacher_homework_save_stimulus',
  'teacher_homework_delete_stimulus', 'teacher_homework_save_question',
  'teacher_homework_delete_question', 'teacher_homework_reorder_questions',
  'teacher_homework_publish', 'teacher_homework_close', 'teacher_homework_rotate_code'];
for (const fn of WRITES) t.ok(`the page writes through ${fn}`, rpcs.includes(fn));
t.is('and it calls nothing else at all', rpcs.filter((f) => !READS.includes(f) && !WRITES.includes(f)), []);

// ══ 2 · THE READ BOUNDARY — ZERO TABLE READS ══════════════════════════════
t.section('Nothing is read from a table, not even where a grant still allows it');

/* teacher-exams.html reads its own tables and that is allowed there. Here it
   is not, and the assertion is a COUNT rather than an allow-list, because an
   allow-list would quietly admit the next table added to it. */
t.is('the page issues no table query at all', (CODE.match(/\.from\(/g) || []).length, 0);
t.is('and not through the postgrest url form either', (CODE.match(/\/rest\/v1\//g) || []).length, 0);

/* The specific step-around this forbids: teacher_homework still grants SELECT
   to `authenticated`, so a direct read of it would WORK. That is exactly why
   naming it is worth a check of its own. */
for (const tbl of ['teacher_homework', 'teacher_homework_questions', 'teacher_homework_stimuli',
                   'teacher_homework_access', 'teacher_homework_attempts',
                   'teacher_homework_responses', 'workspace_students', 'profiles']) {
  t.ok(`no query names ${tbl}`, !new RegExp(`['"\`]${tbl}['"\`]`).test(CODE));
}

// ══ 3 · WRITES GO THROUGH RPCs, NEVER THROUGH A TABLE ═════════════════════
t.section('No client write path — there is no grant for one');
for (const verb of ['insert', 'update', 'upsert', 'delete']) {
  t.ok(`the page never calls .${verb}( on a table`,
    !new RegExp(`\\.from\\([^)]*\\)[\\s\\S]{0,120}\\.${verb}\\(`).test(CODE));
}
t.ok('and it never reaches auth admin or the service key',
  !/service_role|auth\.admin|SUPABASE_SERVICE/.test(CODE));

// ══ 4 · GATED ON ACTIVE STAFF — TEACHER AND ASSISTANT ALIKE ═══════════════
t.section('Parity: an active assistant is staff, and the page never asks the role');

t.ok('it gates on staff_status active', /staff_status === 'active'/.test(CODE));
// The breach this names: gating on the ROLE would lock assistants out of a
// surface a locked decision gives them. Every homework RPC is role-blind
// (teacher_homework_is_staff), so a role test here would be the page's own.
t.ok('it does NOT gate the page on staff_role',
  !/staff_role/.test(CODE) && !/isTeacher/.test(CODE));
t.ok('a denial state exists for everyone else', /id="denyState"/.test(PAGE));
t.ok('the denial is reached when there is no active staff row',
  /if \(error \|\| !S\.staff\.length\) \{ show\('denyState'\); return; \}/.test(CODE));
t.ok('signed-out visitors are sent to login', /location\.href = 'login\.html'/.test(CODE));
t.ok('a missing supabase library denies rather than throwing',
  /window\.supabase && window\.supabase\.createClient/.test(CODE)
  && /if \(!sb\) \{ show\('denyState'\); return; \}/.test(CODE));

t.ok('teacher.html links to the page', /href="teacher-homework\.html"/.test(TEACHER));
t.ok('the Homework link is revealed without a role test',
  /^\s*\$\('sideHomeworkLink'\)\.style\.display = '';/m.test(TEACHER));
// The contrast that makes the parity check meaningful: the Partner link IS
// role-gated in the same file, so an unguarded reveal here is a choice.
t.ok('and the Partner link still IS role-gated (the check is not vacuous)',
  /if \(S\.isTeacher\) \$\('sidePartnerLink'\)\.style\.display = '';/.test(TEACHER));

// ══ 5 · ONE RENDERER ══════════════════════════════════════════════════════
t.section('Preview uses the shipped renderer, not a second one');

t.ok('the page loads stimulus-view.js', /<script src="stimulus-view\.js">/.test(PAGE));
t.ok('preview goes through window.StimulusView.render',
  (CODE.match(/window\.StimulusView\.render\(/g) || []).length >= 2);
// A second implementation would look like the renderer's own internals turning
// up here: an <svg> built by hand, or a <table> assembled from a spec.
t.ok('the page builds no SVG of its own', !/<svg[^>]*viewBox/.test(CODE));
t.ok('the page does not read spec.headers or spec.rows itself',
  !/spec\.headers|spec\.rows|\.spec\['headers'\]/.test(CODE));
t.ok('and it does not compute media_sha256 or expect one',
  !/media_sha256/.test(PAGE));
/* A preview that does not typeset is not a preview: a prompt written with $x$
   would look right to the teacher and wrong to nobody until a student saw it. */
t.ok('both previews and the question list run KaTeX',
  /math\(\$\('stimPrevBody'\)\)/.test(CODE) && /math\(\$\('qPrevBody'\)\)/.test(CODE)
  && /\$\('qList'\)\.querySelectorAll\('\.qp'\)\.forEach\(math\)/.test(CODE));
t.ok('and so does the review', /\$\('reviewBody'\)\.querySelectorAll\('\.qp'\)\.forEach\(math\)/.test(CODE));

// ══ 6 · ALL SIX STIMULUS KINDS ════════════════════════════════════════════
t.section('Every kind the renderer supports is offerable');
for (const kind of ['text', 'table', 'chart', 'plot', 'number_line', 'figure']) {
  t.ok(`the kind picker offers ${kind}`, new RegExp(`<option value="${kind}"`).test(PAGE));
}
t.ok('a figure is uploaded as SVG and base64-encoded', /readAsText/.test(CODE) && /btoa\(/.test(CODE));
t.ok('a non-SVG upload is refused client-side', /\/<svg\/i\.test\(txt\)/.test(CODE));

// ══ 7 · THE STATUS MATRIX ═════════════════════════════════════════════════
t.section('draft, published, closed — each control in its right state');

for (const st of ['draft', 'published', 'closed']) {
  t.ok(`the ${st} status is styled`, new RegExp(`\\.pill\\.${st}\\{`).test(PAGE));
}

/* The paper RPC computes can_edit_content as (status = 'draft'). The page uses
   THAT rather than re-deriving the rule, so the two can never disagree. */
t.ok('editability comes from the server, not from a second rule here',
  /const draft = h\.can_edit_content;/.test(CODE));
t.ok('and the page derives no status rule of its own for editing',
  !/const draft = .*status === 'draft'/.test(CODE));

t.ok('the title and instructions are frozen once it leaves draft',
  /\['fTitle','fInstr'\]\.forEach\(\(f\) => \{ \$\(f\)\.disabled = !draft; \}\)/.test(CODE)
  && /\$\('btnSaveMeta'\)\.disabled = !draft/.test(CODE));
t.ok('the figure and question FORMS are shut off once it leaves draft',
  /\$\('stimForm'\)\.classList\.toggle\('hide', !draft\)/.test(CODE)
  && /\$\('qForm'\)\.classList\.toggle\('hide', !draft\)/.test(CODE));
/* But the CONTENT stays on screen: after publish the read-only list is the
   only place staff can check what they set. Hiding the whole card would take
   that away. */
t.ok('the figures and questions themselves stay visible after publish',
  !/\$\('stimCard'\)\.classList\.toggle\('hide'/.test(CODE)
  && !/\$\('qCard'\)\.classList\.toggle\('hide'/.test(CODE));

t.ok('delete is offered only on a draft',
  /\$\('btnDelete'\)\.classList\.toggle\('hide', !draft\)/.test(CODE));
t.ok('publish is offered only on a draft',
  /\$\('btnPublish'\)\.classList\.toggle\('hide', !draft\)/.test(CODE));
t.ok('close is offered only while published',
  /\$\('btnClose'\)\.classList\.toggle\('hide', h\.status !== 'published'\)/.test(CODE));
t.ok('the publishing card disappears once closed',
  /\$\('publishCard'\)\.classList\.toggle\('hide', closed\)/.test(CODE));

/* Decision 5: a draft HAS a code in the database, and it resolves to the same
   no_match a wrong code does. Showing it would hand out something that looks
   usable and is not. */
t.ok('the code panel only appears once published',
  /\$\('codeCard'\)\.classList\.toggle\('hide', draft\)/.test(CODE));
t.ok('and the list does not print a draft\'s code either',
  /if \(h\.status !== 'draft'\) bits\.push\('code ' \+ esc\(h\.homework_code\)\)/.test(CODE));
t.ok('rotate is offered only while published',
  /\$\('btnRotate'\)\.classList\.toggle\('hide', h\.status !== 'published'\)/.test(CODE));

/* teacher_homework_set_due_at raises 22023 on a closed paper. Disabling the
   control says so before the round trip rather than after it. */
t.ok('the due date is disabled once closed',
  /\$\('fDue'\)\.disabled = closed;/.test(CODE)
  && /\$\('btnSetDue'\)\.disabled = closed;/.test(CODE)
  && /\$\('btnClearDue'\)\.disabled = closed;/.test(CODE));
/* Reveal is NOT disabled when closed — the RPC allows it in every status, and
   "close it, then show the answers" is the ordinary way to use it. */
t.ok('reveal stays available after closing, as the backend allows',
  !/\$\('btnReveal'\)\.disabled = closed/.test(CODE));
t.ok('reveal is hidden once it has been done — there is no un-reveal to offer',
  /\$\('btnReveal'\)\.classList\.toggle\('hide', !!h\.reveal_answers\)/.test(CODE));
t.ok('and the page says the reveal is one-way', /cannot be undone/.test(PAGE));

/* Nothing can attach to a draft, so a roster there would always be empty. */
t.ok('the roster appears only once published',
  /\$\('rosterCard'\)\.classList\.toggle\('hide', draft\)/.test(CODE));
t.ok('and the review card starts closed on every paper',
  /\$\('reviewCard'\)\.classList\.add\('hide'\)/.test(CODE));

// ══ 8 · ROSTER AND REVIEW LIVE IN THE PAPER SCREEN ════════════════════════
t.section('Homework → paper → roster → student → review, one screen');

t.is('the page has exactly the four states',
  (CODE.match(/'(loadingState|denyState|listState|paperState)'/g) || [])
    .filter((v, i, a) => a.indexOf(v) === i).sort(),
  ["'denyState'", "'listState'", "'loadingState'", "'paperState'"]);
t.ok('the roster is a card inside the paper screen, not a page of its own',
  /id="rosterCard"/.test(PAGE) && !/roster\.html|review\.html/.test(PAGE));
t.ok('a Review button on a roster row opens the review card',
  /data-rv="/.test(CODE) && /openReview\(b\.getAttribute\('data-rv'\)/.test(CODE));
t.ok('the review is fetched per student, by id',
  /api\.review\(S\.hw\.homework_id, student\)/.test(CODE));

/* A student removed from the class mid-homework keeps an attempt that can
   never be finished (§15.21, an accepted consequence). The roster would show
   that exactly like an active sitting unless it says so. */
t.ok('the roster marks a student who is no longer in the class',
  /r\.active_member/.test(CODE) && /no longer in this class/.test(PAGE));
/* Three attempt states, and the pill must tell them apart. A truthiness test
   would call an in-progress sitting "submitted" and put a mark on a paper
   nobody has handed in. */
const PILLFN = (CODE.match(/const attemptPill = [\s\S]*?\n\};/) || [''])[0];
t.ok('the roster pill is real code (not a vacuous slice)', PILLFN.length > 120);
t.ok('and it tests all three attempt states by name',
  /=== 'submitted'/.test(PILLFN) && /=== 'in_progress'/.test(PILLFN) && /not started/.test(PILLFN));
/* An omission is not a wrong answer — the database keeps is_correct NULL to
   say so, and a page that renders NULL as "wrong" would turn a pacing problem
   into a topic weakness on the teacher's screen. */
t.ok('the review renders three verdicts, not two',
  /it\.is_correct === true/.test(CODE) && /it\.is_correct === false/.test(CODE)
  && /left blank/.test(PAGE));
t.ok('and it says whether the student can see the answers',
  /data\.reveal_answers/.test(CODE) && /They cannot see the correct answers/.test(PAGE));

// ══ 9 · THE FIVE CONFIRMATIONS ════════════════════════════════════════════
t.section('Everything irreversible asks first');

const confirms = [...CODE.matchAll(/confirm\('([^']*)'/g)].map((m) => m[1]);
t.is('there are exactly five confirmations', confirms.length, 5);
for (const [what, needle] of [
  ['reveal',  /Show the correct answers/],
  ['publish', /Publish this homework/],
  ['close',   /Close this homework/],
  ['rotate',  /Rotate the code/],
  ['delete',  /Delete this draft/],
]) {
  t.ok(`${what} asks first`, confirms.some((c) => needle.test(c)));
}
/* A confirm that does not gate the call is decoration. Each must be the
   early return in front of its own RPC. */
for (const fn of ['doReveal', 'doPublish', 'doClose', 'doRotate', 'doDelete']) {
  t.ok(`${fn} returns when the confirm is declined`,
    new RegExp(`function ${fn}\\(\\) \\{\\s*if \\(!confirm\\('[^']*'\\)\\) return;`).test(CODE));
}
/* And nothing else grew one: an extra confirmation on an ordinary save is a
   gate the decision did not authorise. */
t.ok('saving, reordering and setting a due date ask nothing',
  !/function saveQuestion[\s\S]{0,200}confirm\(/.test(CODE)
  && !/function move\([\s\S]{0,200}confirm\(/.test(CODE)
  && !/async function setDue\([\s\S]{0,200}confirm\(/.test(CODE));

// ══ 10 · THE THINGS A UI IS MOST LIKELY TO GET WRONG ══════════════════════
t.section('Reorder, ordinals, and the answer key');

// The reorder RPC refuses a partial list; sending one would be a runtime error
// on every move.
t.ok('reorder sends the whole ordered list', /S\.questions\.map\(\(q\) => q\.id\)/.test(CODE));
t.ok('a new question takes the next ordinal, an edited one keeps its own',
  /S\.editQ\s*\n?\s*\?\s*\(S\.questions\.find\(\(x\) => x\.id === S\.editQ\) \|\| \{\}\)\.ordinal\s*\n?\s*:\s*S\.questions\.length \+ 1/.test(CODE));
t.ok('the publish hint restates the live gate — at least one question, 1..n with no gaps',
  /Add at least one question before publishing/.test(PAGE)
  && /must run 1 to ' \+ n \+ ' with no gaps/.test(CODE));

// This page is staff-only, so it SHOWS the key — that is correct, and it is
// what makes the student-side absence meaningful. What must never happen is
// the page treating the key as something a learner may see.
t.ok('the preview says the key is not shown to a student before the reveal',
  /answer key is never shown to a student before you reveal it/.test(PAGE));
t.ok('the read-only question list shows the key to staff',
  /Answer <b>' \+ esc\(q\.correct_answer\)/.test(CODE));

/* After a write the page re-reads the paper rather than patching its own copy,
   so what is on screen is what the database holds — and so a refusal the RPC
   applied silently (a guard, a latch) cannot leave a stale screen claiming it
   worked. Counted exactly: one dropped re-read is one stale card. */
t.is('every write is followed by a re-read', (CODE.match(/await reloadPaper\(\)/g) || []).length, 10);
const fnBody = (name) =>
  (CODE.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`)) || [''])[0];
for (const fn of ['saveStimulus', 'deleteStimulus', 'saveQuestion', 'deleteQuestion',
                  'move', 'setDue', 'doReveal', 'doPublish', 'doClose']) {
  const body = fnBody(fn);
  t.ok(`${fn} re-reads the paper after writing`, body.length > 60 && /reloadPaper\(\)/.test(body));
}
const SAVE_META = (CODE.match(/\$\('btnSaveMeta'\)\.addEventListener\([\s\S]*?\n\}\);/) || [''])[0];
t.ok('and so does saving the title and instructions',
  SAVE_META.length > 100 && /await reloadPaper\(\)/.test(SAVE_META));

// ══ 11 · EMPTY, LOADING, ERROR ════════════════════════════════════════════
t.section('Every state a real class will hit');

t.ok('an empty homework list says so', /No homework yet/.test(PAGE));
t.ok('an empty roster says so', /Nobody has this homework yet/.test(PAGE));
t.ok('a student who has not started says so', /Not opened yet/.test(PAGE));
t.ok('there is a loading state', /id="loadingState"/.test(PAGE));
/* The refusals these RPCs raise are written for a person to read — "this
   homework is closed", "close it, do not delete it". Showing error.message is
   how that reaches them; a generic string would throw it away. */
const errs = (CODE.match(/say\(\$\('[a-zA-Z]+'\), error\.message, 'err'\)/g) || []).length;
t.is('refusals are shown verbatim, not replaced with a generic sentence', errs, 16);
t.is('and no error path invents a sentence of its own',
  (CODE.match(/if \(error\) \{ say\(\$\('[a-zA-Z]+'\), '/g) || []), []);
t.ok('and every card has a message row of its own',
  (PAGE.match(/class="msg" id="/g) || []).length >= 7);

// ══ 12 · ESCAPING ═════════════════════════════════════════════════════════
t.section('Author text can never become markup');

t.ok('the page defines esc()', /const esc = \(s\) =>/.test(CODE));
const TEXTY = 'title|student_name|label|prompt|kind|homework_code|status|correct_answer|explanation|given|name|text';
t.ok('escaped interpolations exist (not vacuous)',
  new RegExp(`\\+ esc\\([a-z]{1,2}\\.(?:${TEXTY})\\b`).test(CODE));
const raw = [...CODE.matchAll(new RegExp(`\\+\\s*(?!esc\\()[a-z]{1,2}\\.(?:${TEXTY})\\b`, 'g'))]
  .map((m) => m[0].trim());
t.is('no author-controlled field is concatenated into HTML without esc()', raw, []);

/* The sweep above only catches the direct form. A field wrapped in parentheses
   or a fallback — `(s.label || '(no label)')` — slips past it, so every
   author-controlled value that reaches the DOM is also named here one by one.
   Each of these could go red on its own. */
for (const [what, re] of [
  ['the class name',        /esc\(w\.workspace_id\)[\s\S]{0,40}esc\(w\.name\)/],
  ['the homework title',    /esc\(h\.title\)/],
  ['the figure kind',       /esc\(s\.kind\)/],
  ['the figure label',      /esc\(s\.label \|\| '\(no label\)'\)/],
  ['the figure label again in the picker', /esc\(s\.label \|\| s\.id\.slice\(0, 8\)\)/],
  ['the question prompt',   /esc\(q\.prompt\)/],
  ['the answer key',        /esc\(q\.correct_answer\)/],
  ['the explanation',       /esc\(q\.explanation\)/],
  ['the student name',      /esc\(r\.student_name\)/],
  ['the review prompt',     /esc\(it\.prompt\)/],
  ['the answer they gave',  /esc\(it\.given == null \? '—' : it\.given\)/],
  ['the review key',        /esc\(it\.correct_answer\)/],
  ['the review explanation',/esc\(it\.explanation\)/],
  ['the homework code in the list', /esc\(h\.homework_code\)/],
  ['a preview choice',      /esc\(c\.text\)/],
]) t.ok(`${what} is escaped`, re.test(CODE));

// ══ 13 · DELIVERY ═════════════════════════════════════════════════════════
t.section('What ships with the page');

t.ok('the page is noindex', /<meta name="robots" content="noindex,nofollow"\/>/.test(PAGE));
t.ok('it is absent from the sitemap', !/teacher-homework/.test(read('sitemap.xml')));
t.ok('and from llms.txt', !/teacher-homework/.test(read('llms.txt')));
t.ok('the supabase bundle is pinned with SRI',
  /supabase-js@2\.110\.8[\s\S]{0,200}integrity="sha384-/.test(PAGE));
t.ok('KaTeX is pinned with SRI', /katex@0\.16\.11[\s\S]{0,200}integrity="sha384-/.test(PAGE));
/* This page carries no sidebar, so nav.js's staff filter never runs on it —
   the same shape teacher-exams.html has. The way back is the explicit link. */
t.ok('it carries no sidebar and does not load nav.js',
  !/class="sidebar"/.test(PAGE) && !/<script src="nav\.js"/.test(PAGE));
t.ok('and it offers a way back to the hub', /<a class="btn ghost" href="teacher\.html">/.test(PAGE));

// ══ 14 · RESPONSIVE ═══════════════════════════════════════════════════════
t.section('It survives a phone');

t.ok('the page is width-capped and padded like its sibling',
  /\.wrap\{max-width:1080px/.test(PAGE));
t.ok('the two-column grid collapses by itself',
  /\.grid2\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(200px,1fr\)\)/.test(PAGE));
/* A roster is wider than a phone. It must scroll inside its own box rather
   than pushing the whole page sideways. */
t.ok('the roster table scrolls inside its own container',
  /\.tbl-wrap\{overflow-x:auto/.test(PAGE) && /<div class="tbl-wrap">/.test(CODE));
/* The date control sizes itself as a native widget on iOS and overflows its
   card — the rule teacher.html already carries for the same reason. */
const DATE_RULE = (PAGE.match(/input\[type="datetime-local"\]\{[^}]*\}/) || [''])[0];
t.ok('there is a rule for the date control at all', DATE_RULE.length > 0);
t.ok('it can shrink inside its parent', /min-width:0/.test(DATE_RULE));
t.ok('and it can never exceed it', /max-width:100%/.test(DATE_RULE));

t.done();
