// Surface suite for the Teacher & Assistant experience.
//
// tests/teacher-access-scope.test.mjs proves the DATABASE cannot leak. This one
// covers the page itself: the promises the interface makes, and three bugs that
// were found by actually rendering it headlessly rather than by reading it.
//
// FOUR PROPERTIES:
//   1. PREVIEW    ?preview=1 renders sample data and touches the database not at
//                 all — otherwise "preview" is a word, not a guarantee
//   2. HONESTY    the page shows no learning metric it cannot compute, and says
//                 so in words instead of drawing an empty chart
//   3. SLOT       the Weakness plug-in point is a marked region with exactly one
//                 writer, so connecting it later is a function, not a redesign
//   4. ROLES      an assistant's page differs from the owner's by capability,
//                 and the owner-only controls are gated in the markup as well as
//                 on the server
//
// Plus regression guards for what the render found: a page that dies to a blank
// screen if the CDN is slow, rows whose name and meta collapsed onto one line,
// and cards left invisible when the entry animation never runs.

import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('teacher-surface');
const PAGE = read('teacher.html');

/** The api object is the single place the page reaches the database. */
const API = (() => {
  const a = PAGE.indexOf('const api = {');
  const b = PAGE.indexOf('\n};', a);
  if (a < 0 || b < 0) throw new Error('teacher.html: the api object could not be located');
  return PAGE.slice(a, b);
})();

// ══ 1 · PREVIEW ═══════════════════════════════════════════════════════════
t.section('Preview renders sample data and reaches nothing');

t.ok('preview is opt-in from the query string', /preview.*===\s*'1'/.test(PAGE));
t.ok('the page announces itself as preview', /previewBar/.test(PAGE) && /Nothing here is real/.test(PAGE));

/* Every api method that can reach the database must refuse to, in preview,
   BEFORE it gets there. Splitting on `async name(` gives one segment per
   method; the check is positional, so a guard added after the call fails. */
const methods = API.split(/\n  async /).slice(1)
  .map((seg) => ({ name: (seg.match(/^(\w+)/) || [])[1], body: seg }));
t.ok('api methods were found (not a vacuous split)', methods.length >= 8);

const reaching = methods.filter((m) => /\bsb\./.test(m.body));
t.ok('api methods really do reach the database (not vacuous)', reaching.length >= 8);
t.is('every database call is preceded by a preview guard',
  reaching.filter((m) => {
    const guard = m.body.search(/if \(S\.preview\)/);
    const call = m.body.search(/\bsb\./);
    return guard < 0 || guard > call;
  }).map((m) => m.name), []);

/* Preview must also not need a session, or it would bounce to login. */
const boot = PAGE.slice(PAGE.indexOf('async function boot()'), PAGE.indexOf('$(\'staffJoinBtn\')'));
t.ok('preview skips the session check', /if \(!S\.preview\) \{[\s\S]*?getSession/.test(boot));

t.ok('fixtures are visibly fictional', /Sample/.test(PAGE) && !/@/.test(PAGE.slice(PAGE.indexOf('const FIXTURE'), PAGE.indexOf('function iso'))));

// ══ 2 · HONESTY ═══════════════════════════════════════════════════════════
t.section('The page shows no learning metric it cannot compute');

const FIXTURE_BLOCK = PAGE.slice(PAGE.indexOf('const FIXTURE'), PAGE.indexOf('function iso'));
/* severity_band and trend ARE legitimate in fixtures now — they are the
   analyzer's own outputs, which the preview mirrors. What must never appear is
   a metric this platform does not compute for a teacher. */
t.is('no fixture invents a metric the platform does not produce',
  ['accuracy', 'mastery', 'percentile', 'weakness_score', 'improvement']
    .filter((k) => new RegExp(k, 'i').test(FIXTURE_BLOCK)), []);

/* The preview must mirror the real shape, or it sells a product that does not
   exist: 205 of 225 live reports carry no trend. */
const wkFixtures = [...FIXTURE_BLOCK.matchAll(/trend:\s*(null|'(\w+)')/g)].map((m) => m[2] || null);
t.ok('preview carries weakness fixtures', wkFixtures.length >= 3);
t.ok('most preview weaknesses carry no trend, as in production',
  wkFixtures.filter((x) => x === null).length > wkFixtures.filter((x) => x !== null).length);

/* The words are allowed in prose that explains their absence — a number is not.
   This assertion used to require the sentence "Scores and weaknesses are not
   here yet", and it went on passing for a day after the weakness read went
   live and the page began rendering weaknesses. A test that pins prose pins it
   whether or not it is still true, so what is checked now is the property: the
   page names what it withholds, and says why, and the one thing it must still
   withhold is a score. */
t.ok('the page names what it withholds and why',
  /<strong>No scores\.<\/strong>/.test(PAGE)
  && /Mock Experience produces per-question evidence/.test(PAGE));
t.ok('the assistant is told the same thing, not a vaguer version',
  /Neither of you sees scores/.test(PAGE));
t.ok('the boundary around the tutor conversation is stated, not implied',
  /the conversation where they struggled is not/.test(PAGE));
t.ok('the empty learning state explains why, in words',
  /could have been wrong/.test(PAGE) && /Mock Experience/.test(PAGE));

// ══ 3 · THE WEAKNESS SLOT ═════════════════════════════════════════════════
t.section('The Weakness plug-in point is one marked region with one writer');

t.ok('the slot is marked in the markup', /id="learningSlot" data-slot="learning"/.test(PAGE));
t.ok('the slot carries its contract as a comment',
  /LEARNING SLOT/.test(PAGE) && /renderLearning\(student, el\) is the ONLY function that writes/.test(PAGE));
t.ok('the contract names the three surfaces one weakness must read the same on',
  /student's own badge/.test(PAGE) && /assistant's copy/.test(PAGE));

/* Exactly one writer: openCard may blank it, renderLearning fills it. Any other
   assignment means the slot has grown a second author and the plug-in point is
   already forked. */
const slotWrites = [...PAGE.matchAll(/\$\('learningSlot'\)\.innerHTML\s*=\s*([^;]*)/g)].map((m) => m[1].trim());
t.is('the only direct write to the slot is the reset', slotWrites, ["''"]);
t.ok('renderLearning is what fills it', /async function renderLearning\(student, el\)[\s\S]{0,400}el\.innerHTML/.test(PAGE));

/* The slot reads the canonical weakness through the shared module. A surface
   that reached into weakness_reports and shaped its own view would be the
   second authority the whole design exists to prevent. */
t.ok('the slot renders through WeaknessView', /WeaknessView\.canonical\(/.test(PAGE) && /WeaknessView\.forRole\(/.test(PAGE));
t.ok('the module is actually loaded by the page', /<script src="weakness-view\.js"><\/script>/.test(PAGE));
t.ok('the role passed is the viewer\'s real role', /S\.isTeacher \? 'teacher' : 'assistant'/.test(PAGE));
t.ok('a withheld trend renders nothing at all', /v\.showTrend \?/.test(PAGE) && !/showTrend[\s\S]{0,80}'Stable'/.test(PAGE));
t.ok('the page derives no band of its own', !/severity_band\s*[<>=]/.test(PAGE));

/* The read is prepared, not applied. Every other page degrades gracefully when
   an RPC is missing; this slot must too, or opening a student throws. */
t.ok('a missing weakness RPC degrades instead of throwing',
  /catch \(_\) \{[\s\S]{0,600}Reserved — not connected yet/.test(PAGE));
t.ok('renderLearning renders no number', !/%/.test(
  PAGE.slice(PAGE.indexOf('function renderLearning'), PAGE.indexOf('$(\'closeDrawer\')'))));

// ══ 4 · ROLES ═════════════════════════════════════════════════════════════
t.section('An assistant\'s page differs by capability, not by being a worse copy');

for (const [el, what] of [['rotateStudentBtn', 'rotate the class code'],
                          ['staffSection', 'manage assistants'],
                          ['activitySection', 'read class activity']])
  t.ok(`owner-only in the markup: ${what}`,
    new RegExp(`\\$\\('${el}'\\)\\.style\\.display = S\\.isTeacher`).test(PAGE));

/* 20260830h renames the workspace's primary staff role from 'owner' to
   'teacher'. The migration is applied by hand and the site deploys on merge, so
   for one release the page must accept BOTH values in either order. This check
   is what makes that deliberate rather than accidental — and what will fail
   loudly if someone drops the tolerance before the migration is live. */
t.ok('the page accepts both the old and the new staff-role value',
  /TEACHER_ROLES = new Set\(\['teacher', 'owner'\]\)/.test(PAGE)
  && /isTeacherRole\(active\.staff_role\)/.test(PAGE));
t.ok('and it says why the tolerance exists', /deploys on merge[\s\S]{0,200}migrated by hand/.test(PAGE));
t.ok('listing assistants names the role it wants, not the one it excludes',
  /\.eq\('staff_role', 'assistant'\)/.test(PAGE) && !/neq\('staff_role'/.test(PAGE));
t.ok('nothing user-facing still calls the teacher an owner',
  !/'Owner'/.test(PAGE) && !/pill\.owner/.test(PAGE));

t.ok('the assistant is told plainly what is theirs and what is not',
  /roster is theirs to change/.test(PAGE) && /Adding and removing students is the teacher/.test(PAGE));
t.ok('"needs you" stays empty rather than inventing work',
  /if \(!pending\.length\) \{ \$\('needsYou'\)\.style\.display = 'none'/.test(PAGE));

// ══ 5 · REGRESSIONS THE RENDER FOUND ══════════════════════════════════════
t.section('Regressions found by rendering the page, not by reading it');

/* A bare `supabase.createClient(...)` throws a ReferenceError when the CDN
   bundle is missing, and takes the whole inline script — the whole page — with
   it. Found because Chromium here cannot reach the CDN and the page was blank. */
t.ok('the client is constructed defensively', /window\.supabase && window\.supabase\.createClient/.test(PAGE));
t.ok('a missing library explains itself instead of showing a blank page',
  /Could not load the Si Math AI connection library/.test(PAGE));

/* Rows are <button> + <span> so the whole row is one click target; spans are
   inline, so without display:block the name and meta ran together. */
t.ok('row name is blockified', /\.row \.nm\{display:block/.test(PAGE));
t.ok('row meta is blockified', /\.row \.meta\{display:block/.test(PAGE));

/* animation:rise uses fill-mode both, so a card whose animation never runs sits
   at opacity 0 — an invisible page for reduced-motion users. */
t.ok('reduced motion lands on the final state, not on opacity 0',
  /prefers-reduced-motion: reduce\)\{[\s\S]{0,400}\.card\{opacity:1/.test(PAGE));

/* Grid items default to min-width:auto and refuse to shrink below nowrap text.
   Measured clean at 320px; this keeps it that way. */
t.ok('grid children may shrink', /\.cols > \*\{min-width:0\}/.test(PAGE));

// ══ 6 · UNTRUSTED TEXT ════════════════════════════════════════════════════
t.section('Names come from other people, so they are escaped');

t.ok('an escaper exists', /const esc = \(s\)/.test(PAGE));
/* Only markup matters here. A name concatenated into a confirm() string is
   plain text to the browser, and escaping it would show the user "&amp;". So
   the check is scoped to lines that actually build HTML — which is where an
   unescaped name would become an injection. */
const markupLines = PAGE.split('\n').filter((l) => /innerHTML|insertAdjacentHTML|'<|>'/.test(l));
t.ok('the page builds markup by concatenation (not a vacuous scope)', markupLines.length > 20);
t.is('no unescaped name is concatenated into markup',
  markupLines.filter((l) => /\+\s*(?:r|data|s|a)\.(full_name|workspace|exam_type|name)\b/.test(l))
    .map((l) => l.trim().slice(0, 60)), []);
t.ok('the roster escapes what it renders',
  /esc\(r\.full_name\)/.test(PAGE) && /esc\(r\.exam_type/.test(PAGE));


// ══ CODES: both are copyable ══════════════════════════════════════════════
t.section('Every code the teacher hands out can be copied, not transcribed');

/* The assistant code had Rotate but no Copy — the one code most likely to be
   sent to a person privately was the only one you had to read off the screen. */
const CODES = slice(PAGE, 'id="studentCode"', 'id="staffCodeWrap"', 'class code row')
  + slice(PAGE, 'id="staffCodeWrap"', 'code-note', 'assistant code row');
t.ok('the class code has Copy and Rotate',
  /id="copyCodeBtn"/.test(CODES) && /id="rotateStudentBtn"/.test(CODES));
t.ok('the assistant code has Copy and Rotate',
  /id="copyStaffBtn"/.test(CODES) && /id="rotateStaffBtn"/.test(CODES));
t.ok('Copy comes before Rotate on both rows, so the pattern reads the same',
  CODES.indexOf('copyCodeBtn') < CODES.indexOf('rotateStudentBtn')
  && CODES.indexOf('copyStaffBtn') < CODES.indexOf('rotateStaffBtn'));

const COPY_STAFF = slice(PAGE, "$('copyStaffBtn').addEventListener", '});', 'assistant copy handler');
t.ok('it copies the assistant chip, not the class chip',
  /writeText\(\$\('staffCodeVal'\)\.textContent\)/.test(COPY_STAFF));
t.ok('it reports success on the same surface as the class code',
  /say\(\$\('codeMsg'\), 'Assistant code copied\.', 'ok'\)/.test(COPY_STAFF));
t.ok('and it fails the same way, rather than silently',
  /catch \(_\) \{ say\(\$\('codeMsg'\), 'Copy failed/.test(COPY_STAFF));


// ══ THE DATE FIELD CANNOT ESCAPE ITS FORM ═════════════════════════════════
t.section('The WHEN field is constrained, not clipped');

/* Reported from an iPhone: the date input hung ~30px past the dashed .iv-form
   edge. Desktop Blink honours width:100% on a date input and shows nothing
   wrong; iOS Safari lays it out as a native control, so its padding and border
   can land OUTSIDE the declared width. Measured under that condition: 358px
   inside a 328px content box — exactly the reported overhang. */
const DATE_RULE = (PAGE.match(/\.field\[type="date"\]\{[^}]*\}/) || [''])[0];
t.ok('there is a rule for the date control at all', DATE_RULE.length > 0);
t.ok('it can shrink inside its parent', /min-width:0/.test(DATE_RULE));
t.ok('it can never exceed its parent', /max-width:100%/.test(DATE_RULE));
/* max-width alone caps only the CONTENT box: with content-box sizing the
   padding and border still land outside and the ceiling does not hold. */
t.ok('and box-sizing is restated so that ceiling actually holds',
  /box-sizing:border-box/.test(DATE_RULE));
t.ok('the platform stops sizing it as a native widget',
  /-webkit-appearance:none/.test(DATE_RULE) && /[^-]appearance:none/.test(DATE_RULE));

/* The fix must constrain the control, never hide the symptom. */
t.ok('no overflow was clipped away to solve it',
  !/\.iv-form\{[^}]*overflow/.test(PAGE) && !/#interventionSlot\{[^}]*overflow/.test(PAGE));

// ══ THE TWO EXAM CONCEPTS STAY DISTINCT ═══════════════════════════════════
t.section('The copy describes the exam a student is preparing for');

/* Audited against production: not one exam_* table carries workspace_id,
   teacher_id, class_id or assigned_to. A teacher-created exam does not exist,
   so the copy must not imply a teacher can see one. */
t.ok('it names the exam the student is PREPARING FOR',
  /which exam they are preparing for \(SAT, EST or ACT\)/.test(PAGE));
/* Scoped to the rendered STRING, not the file: the comment above it quotes the
   old phrase to explain why it changed, and asserting over the whole page would
   fail on the documentation of the fix. */
const SCOPE_COPY = slice(PAGE, "$('scopeNote').innerHTML", 'renderIntervention', 'scope note copy');
t.ok('the rendered copy is really the sliced region', /You see a student/.test(SCOPE_COPY));
t.ok('it no longer implies a sitting the teacher can see',
  !/which exam they are sitting/.test(SCOPE_COPY));
t.ok('the two concepts are recorded in the source so the next edit keeps them apart',
  /TWO DIFFERENT EXAM CONCEPTS/.test(PAGE) && /THIS DOES NOT EXIST/.test(PAGE));

/* And the page must not have grown a teacher-exam feature by accident. */
t.is('no teacher-assigned exam surface was introduced',
  ['assign_exam', 'teacher_exam', 'workspace_exam', 'assigned_exam', 'class_exam']
    .filter((n) => PAGE.includes(n)), []);

t.done();
