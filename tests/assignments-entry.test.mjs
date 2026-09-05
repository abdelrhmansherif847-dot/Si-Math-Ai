// The door to Assignments — and the proof that nothing can shut it.
//
// WHAT WAS BROKEN
// ---------------
// assignments.html already held the whole hub: the platform exam list, the
// homework code box and the teacher-exam code box. What it did not have was a
// way in. Measured before this increment, the ENTIRE product contained exactly
// two links to it, both inside dashboard.html's #teachSumCard — and that card
// returns early from loadTeacherSummary() when the student has no homework and
// no teacher exams:
//
//     if (!hw.length && !ex.length) return;
//
// So a student with no class had no route to assignments.html, and therefore no
// route to the PLATFORM exams it lists. The only exam-shaped link on their
// dashboard was Mock Exams, which is a different surface entirely.
//
// WHAT THIS SUITE GUARDS
// ----------------------
// One property, from several directions: the entry is UNCONDITIONAL. Not
// hidden, not script-rendered, not inside the card that hides itself, not
// referenced by the function that hides it, and not dependent on JavaScript
// having run at all. Each check is written so a mutant can turn it red — a
// suite that only asserted "a link to assignments.html exists somewhere" would
// have passed against the broken state it was written to prevent.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('assignments-entry');
const DASH = read('dashboard.html');

/* The card, sliced from its own opening tag to its own close. Throws rather
   than returning empty: a silent empty slice would make every check below pass
   vacuously, which is the failure mode this repository has been bitten by. */
const CARD = (() => {
  /* Anchored on the id and walked BACK to its own <section>, deliberately: an
     anchor on the full opening tag would make every attribute mutant — a
     display:none, an added .reveal — die here instead of at the check written
     to catch it. A check that can only be reached when nothing is wrong is not
     a check. */
  const i = DASH.indexOf('id="assignmentsCard"');
  if (i < 0) throw new Error('dashboard.html: the Assignments card could not be located');
  const a = DASH.lastIndexOf('<section', i);
  if (a < 0) throw new Error('dashboard.html: the Assignments card has no opening tag');
  const b = DASH.indexOf('</section>', i);
  if (b < 0) throw new Error('dashboard.html: the Assignments card has no end');
  return DASH.slice(a, b + '</section>'.length);
})();

/* The teachers card, for the boundary checks. Same shape, same reasoning. */
const TEACH = (() => {
  const a = DASH.indexOf('<section class="card span2" id="teachSumCard"');
  if (a < 0) throw new Error('dashboard.html: the teachers card could not be located');
  const b = DASH.indexOf('</section>', a);
  if (b < 0) throw new Error('dashboard.html: the teachers card has no end');
  return { start: a, end: b + '</section>'.length, html: DASH.slice(a, b + '</section>'.length) };
})();

t.section('1 · the entry exists');

t.ok('the card markup was located (not a vacuous slice)', CARD.length > 600);
t.ok('it is named to the student', /class="card-title">Assignments</.test(CARD));
t.ok('and says what is behind it', /class="card-sub">[^<]*Platform exams/.test(CARD));

t.section('2 · it is OUTSIDE #teachSumCard');

const iCard = DASH.indexOf('id="assignmentsCard"');
t.ok('the Assignments card starts before the teachers card', iCard < TEACH.start);
t.ok('and does not sit inside it',
  !(iCard > TEACH.start && iCard < TEACH.end));
t.ok('the teachers card does not contain the string at all',
  !TEACH.html.includes('assignmentsCard'));
/* The pre-existing placement contract still holds: the student's own work
   first, a teacher's next to the other things they sit. */
const iFocus = DASH.indexOf('Open Study Plan');
const iMock = DASH.indexOf('<!-- MOCK EXAM -->');
t.ok('it lands after Focus Practice', iFocus > 0 && iFocus < iCard);
t.ok('and before the teachers card, which is before Mock Exam',
  iCard < TEACH.start && TEACH.start < iMock);

t.section('3 · it is not gated by teacher-summary state');

t.ok('the card is never hidden', !/display\s*:\s*none/.test(CARD));
t.ok('it carries no .reveal, which starts at opacity 0',
  !/class="[^"]*\breveal\b/.test(CARD));

/* The function that hides the OTHER card must not know this one exists. */
const SUM = (() => {
  const a = DASH.indexOf('async function loadTeacherSummary() {');
  if (a < 0) throw new Error('dashboard.html: loadTeacherSummary() could not be located');
  const b = DASH.indexOf('\n}', a);
  if (b < 0) throw new Error('dashboard.html: loadTeacherSummary() has no end');
  return DASH.slice(a, b);
})();
t.ok('loadTeacherSummary() was located (not a vacuous slice)', SUM.length > 800);
t.ok('it still hides the teachers card on an empty read',
  /if \(!hw\.length && !ex\.length\) return;/.test(SUM));
t.ok('and it never names the Assignments card', !SUM.includes('assignmentsCard'));

/* Nothing anywhere reads or writes it. A door with a script behind it is a door
   that can be closed by a bug in that script. */
t.is('no JavaScript references the card at all',
  (DASH.match(/assignmentsCard/g) || []).length, 1);

t.section('4 · it points at assignments.html, and only there');

t.is('exactly one destination',
  [...new Set([...CARD.matchAll(/(?:href|location\.href)\s*=\s*'?"?([a-z-]+\.html)/g)]
    .map((m) => m[1]))],
  ['assignments.html']);
t.is('and exactly one link', (CARD.match(/<a\s/g) || []).length, 1);

t.section('5 · the door works with no JavaScript');

t.ok('the control is an anchor, not a scripted button',
  /<a href="assignments\.html" class="full-btn">/.test(CARD));
t.ok('there is no onclick anywhere in the card', !/onclick/.test(CARD));
t.ok('and no script tag inside it', !/<script/i.test(CARD));

t.section('6 · A1 changed nothing else');

/* KEEP BOTH DOORS was the decision. The teachers card keeps its own link, and
   this suite is what would notice if a later increment removed it by accident
   while calling itself a cleanup. */
/* BOTH of them, counted, and each pinned by shape. The destination SET is not
   enough and a mutant proved it: this card carries two links to
   assignments.html — the card-link in its head and the full-btn below — so
   deleting one left the set identical and the check green. KEEP BOTH DOORS was
   an explicit decision; a check that cannot see one of them removed does not
   hold it. */
t.is('the teachers card still has exactly two links to assignments.html',
  [...TEACH.html.matchAll(/(?:href|location\.href)\s*=\s*'?"?assignments\.html/g)].length, 2);
t.ok('its head still carries the Open link',
  /<a href="assignments\.html" class="card-link">/.test(TEACH.html));
t.ok('and its footer still carries the full-width button',
  /<button onclick="location\.href='assignments\.html'" class="full-btn">/.test(TEACH.html));
t.is('and it still points nowhere else',
  [...new Set([...TEACH.html.matchAll(/(?:href|location\.href)\s*=\s*'?"?([a-z-]+\.html)/g)]
    .map((m) => m[1]))],
  ['assignments.html']);
t.ok('the teachers card still ships hidden',
  /id="teachSumCard" style="display:none"/.test(DASH));
t.ok('Mock Exams still points at its own surface',
  /location\.href='mock-exam\.html'/.test(DASH));
/* The bootstrap order is pinned by tests/student-homework-ui.test.mjs on exact
   whitespace. Asserted here too, because A1 sits close enough to break it. */
t.ok('the summary is still loaded independently of the dashboard',
  /loadTeacherSummary\(\);\n\nloadDashboard\(\)\.catch/.test(DASH));

t.done();
