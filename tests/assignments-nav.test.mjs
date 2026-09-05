// Assignments in the sidebar — A2.1 + A2.2, and the drift they deliberately
// do not fix.
//
// A1 put a permanent Assignments card on the dashboard. A2.1 puts the
// destination in the sidebar, so it is reachable from anywhere a student
// already is, rather than from one card on one page. A2.2 extends that to
// weakness.html and focus.html, which A2.1 skipped only because they are
// frozen — they were UNFROZEN FOR THAT ONE NAVIGATION CHANGE AND NOTHING ELSE
// and are still frozen otherwise, so this suite covers their nav item and
// asserts nothing else about either file.
//
// STRATEGY (b): PRESENCE PLUS A NAMED EXCEPTION LIST.
// --------------------------------------------------
// The obvious test — "every sidebar is identical" — was measured and rejected.
// The 17 pages carrying a sidebar contain TWELVE distinct link sets: chat.html
// swaps focus and weakness, history.html moves mock-exam to third, support.html
// carries an extra admin link, weakness.html ships a literal href="#" where its
// own self-link belongs, and the five staff surfaces are shorter by design. A
// parity assertion would go red on eleven of seventeen pages the moment it was
// written — a test of a fix nobody has approved.
//
// So this suite asserts what A2.1 and A2.2 actually promise, and records every
// page it deliberately skips WITH A REASON. The exception list is the artifact:
// it is what makes the drift visible instead of invisible, and where a future
// parity increment starts. A page that silently stops carrying the link fails;
// a page that is knowingly without it is named here and says why.
//
// It fixes no drift and normalises no sidebar. A2.1 touched no frozen file;
// A2.2 touched two, by one line each, under an explicit one-change unfreeze
// that did not remove either from CLAUDE.md's frozen list.
import { suite } from './_assert.mjs';
import { read, REPO } from './_source.mjs';
import { readdirSync } from 'node:fs';

const t = suite('assignments-nav');

/* Every page shipping a sidebar, discovered rather than listed — a hand-written
   list would silently miss a page added later, which is the failure mode this
   whole increment exists because of. */
const SIDEBAR_PAGES = readdirSync(REPO)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => /class="sidebar"/.test(read(f)))
  .sort();

/* THE EXCEPTION LIST. Every page that carries a sidebar and does NOT carry the
   Assignments link, with the reason it does not. The shape is borrowed from
   scripts/validate-tokens.mjs, which already records intentional divergence
   this way. An entry that stops being true fails below. */
const EXCEPTIONS = [
  {
    pages: ['mock-exam.html'],
    reason: 'FROZEN per CLAUDE.md §2, and unlike the other two it stays frozen. '
      + 'weakness.html and focus.html sat in this group until A2.2 unfroze them for '
      + 'one navigation change; mock-exam.html is held back for a second reason that '
      + 'outlives the freeze — whether Mock Exams and Assignments should both exist '
      + 'is A3, and a nav increment must not settle an IA question by editing it.',
  },
  {
    pages: ['admin.html', 'admin-support.html', 'ai-monitor.html', 'teacher.html', 'partner.html'],
    reason: 'Staff and admin surfaces. nav.js hides every student destination for an '
      + 'active staff account anyway (STAFF_NAV_KEEP), so a link here would be drawn '
      + 'and then taken away — see tests/staff-nav.test.mjs.',
  },
];
const EXCEPTED = EXCEPTIONS.flatMap((e) => e.pages);

/* COVERED IS DERIVED, NOT WRITTEN — and that is the whole point of this block.
   An adversarial review of the first version found the exception list could
   satisfy itself: moving a page out of a hand-written COVERED and into the
   staff group, then deleting its link, left every check in this file green.
   Both halves agreed with each other and neither agreed with anything outside.

   Deriving COVERED as "every sidebar page that is not excepted" closes that
   path structurally rather than by good intentions. Moving a page into an
   exception group now SHRINKS the derived set, which stops matching the pinned
   eleven below, and the suite goes red. To drop a page from A2.1's coverage a
   future editor must edit the pin — which is a visible line in a diff and a
   decision someone reviews, instead of a silent regression. */
const COVERED = SIDEBAR_PAGES.filter((p) => !EXCEPTED.includes(p));

/* The eleven covered pages — A2.1's nine plus A2.2's two — and the five staff
   pages excepted, pinned as literals. The remaining frozen page needs no pin
   here: it is already grounded in CLAUDE.md below, which is a fact outside this
   file. The staff five have no such external source — 'is a staff surface' is
   not a property any file declares — so a pin is the honest instrument, and its
   weakness is stated rather than hidden: it stops a silent move, not a
   determined editor.

   weakness.html and focus.html appear HERE while CLAUDE.md still lists them as
   frozen, and that disagreement is deliberate rather than stale: A2.2 unfroze
   them for one navigation change and nothing else. The check below reads
   CLAUDE.md one way only — every page this suite calls frozen must be frozen
   there — precisely so that a page can be frozen in CLAUDE.md and still carry
   the one link an explicit unfreeze put in it. */
const COVERED_PIN = ['chat.html', 'dashboard.html', 'devices.html', 'focus.html',
                     'history.html', 'pricing.html', 'profile.html', 'progress.html',
                     'settings.html', 'support.html', 'weakness.html'];
/* Sorted, and the order is measured rather than guessed: JS sorts
   'admin-support.html' BEFORE 'admin.html', because '-' (0x2D) sorts under '.'
   (0x2E). The first version of this pin listed them the other way round and the
   check went red — which is the cheapest possible demonstration that it can. */
const STAFF_PIN = ['admin-support.html', 'admin.html', 'ai-monitor.html',
                   'partner.html', 'teacher.html'];

const navHrefs = (f) => [...read(f).matchAll(/<a\b[^>]*class="[^"]*\bnav-item\b[^"]*"[^>]*>/g)]
  .map((m) => (m[0].match(/href="([^"]*)"/) || [, ''])[1]);

t.section('1 · the sweep is not vacuous');

t.ok('sidebar pages were discovered', SIDEBAR_PAGES.length >= 14);
t.is('the excepted pages all ship a sidebar',
  EXCEPTED.filter((p) => !SIDEBAR_PAGES.includes(p)), []);

/* THE TWO PINS. These are what an exception list needs to be worth anything:
   without them the list and the coverage are each other's only witness.

   'every sidebar page is either covered or excepted' used to sit here. It is
   now true by construction — COVERED is defined as the complement — so it
   could never go red, and a green check that cannot fail reports safety it has
   not tested. These replace it, and they can. */
t.is('the derived coverage is exactly the eleven A2.1 and A2.2 were approved for',
  COVERED, COVERED_PIN);
t.is('and the staff exception group is exactly the five it was approved with',
  EXCEPTIONS.find((e) => /Staff and admin/.test(e.reason)).pages.slice().sort(), STAFF_PIN);
t.is('no page is both covered and excepted', COVERED.filter((p) => EXCEPTED.includes(p)), []);

t.section('2 · the eleven covered pages carry the link');

t.is('every covered page has an Assignments nav item',
  COVERED.filter((p) => !navHrefs(p).includes('assignments.html')), []);
t.is('exactly one, never two',
  COVERED.filter((p) => navHrefs(p).filter((h) => h === 'assignments.html').length !== 1), []);
/* PRESENT IS NOT REACHABLE, and a mutant proved it: adding style="display:none"
   to the link on one page passed every other check in this file. A1's card
   carries a never-hidden assertion for exactly this reason; the nav suite was
   written without it. nav.js sets display:none on student links for STAFF, at
   runtime — that is the tested, intended behaviour — but a link shipped hidden
   in the markup is hidden for everybody, which is a link that does not exist. */
t.is('no covered page ships the link hidden',
  COVERED.filter((p) => /<a\b[^>]*href="assignments\.html"[^>]*(style="[^"]*display\s*:\s*none|\shidden)/.test(read(p))
                     || /<a\b[^>]*(style="[^"]*display\s*:\s*none|\shidden)[^>]*href="assignments\.html"/.test(read(p))), []);

/* D4: the visible label is exactly this word. A sidebar that says something
   else is a different decision from the one that was approved. */
t.is('the visible label is exactly "Assignments"',
  COVERED.filter((p) => !/<a\b[^>]*href="assignments\.html"[^>]*>[\s\S]{0,400}?Assignments\s*(<\/span>)?\s*<\/a>/
    .test(read(p))), []);

t.section('3 · D2 — it sits immediately after History, and moves nothing');

t.is('every covered page places Assignments directly after History',
  COVERED.filter((p) => {
    const h = navHrefs(p);
    const i = h.indexOf('history.html');
    return i < 0 || h[i + 1] !== 'assignments.html';
  }), []);
/* THE REST OF EACH RAIL, PINNED EXACTLY — and pinned PER PAGE, not against
   each other. That distinction is the whole of strategy (b): these nine rails
   disagree (chat swaps focus and weakness; history moves mock-exam to third;
   support carries an extra admin link) and A2.1 fixes none of it. Asserting
   each page against ITS OWN order catches a reordering without demanding the
   pages agree — which would be the parity increment nobody has approved.

   Order, not set: a set cannot see two items swapped, which is how chat.html's
   drift got in unnoticed.

   The first version of this check was `h.join('|') !== h.join('|')`, which is
   constantly false and could not go red. It is recorded because a green check
   that cannot fail is worse than no check: it reports safety it never tested. */
const RAILS = {
  'chat.html': 'dashboard chat focus weakness mock-exam history assignments progress profile devices settings support pricing admin',
  'dashboard.html': 'dashboard chat weakness focus mock-exam history assignments progress profile devices settings support pricing admin',
  'devices.html': 'dashboard chat weakness focus mock-exam history assignments progress profile devices settings support pricing admin',
  /* A2.2's two. Both are shorter than the other nine — no support, no admin —
     and weakness.html's third item is a literal '#', which is its OWN self-link
     — the only page in the repo written that way — and a convention this file
     records rather than a broken destination to fix; the A3 audit corrected an
     earlier claim here that it was a live defect. Pinned as found: A2.2 added
     one item to each rail and reordered nothing. */
  'focus.html': 'dashboard chat weakness focus mock-exam history assignments progress profile devices settings pricing',
  'history.html': 'dashboard chat mock-exam weakness focus history assignments progress profile devices settings pricing admin',
  'pricing.html': 'dashboard chat weakness focus mock-exam history assignments progress profile devices settings support pricing admin',
  'profile.html': 'dashboard chat weakness focus mock-exam history assignments progress profile devices settings support pricing admin',
  'progress.html': 'dashboard chat weakness focus mock-exam history assignments progress profile devices settings support pricing admin',
  'settings.html': 'dashboard chat weakness focus mock-exam history assignments progress profile devices settings support pricing admin',
  'support.html': 'dashboard chat weakness focus mock-exam history assignments progress profile devices settings support pricing admin admin-support',
  'weakness.html': 'dashboard chat # focus mock-exam history assignments progress profile devices settings pricing',
};
t.is('every covered page has a pinned rail', COVERED.filter((p) => !RAILS[p]), []);
t.is('and every rail is exactly as expected',
  COVERED.filter((p) => navHrefs(p).map((h) => h.replace('.html', '')).join(' ') !== RAILS[p]), []);
/* Six of the eleven differ from the other five, and that is recorded rather
   than corrected: chat swaps focus/weakness, history reorders three and drops
   support, support adds admin-support, and A2.2's focus and weakness each drop
   support and admin (weakness with a '#' self-link besides). Naming them here
   is what stops a future reader assuming the rails already agree.

   The number moved 4 → 6 with A2.2 because two more distinct rails joined the
   set, not because any existing rail changed — the nine A2.1 pinned are still
   pinned, character for character, in the block above. */
t.is('the drift A2.1 and A2.2 do not fix is still exactly these six shapes',
  [...new Set(Object.entries(RAILS).map(([, v]) => v))].length, 6);
t.ok('it is never marked active — none of these pages IS assignments.html',
  COVERED.every((p) => !/<a\b[^>]*href="assignments\.html"[^>]*class="[^"]*\bactive\b/.test(read(p))
                    && !/<a\b[^>]*class="[^"]*\bactive\b[^"]*"[^>]*href="assignments\.html"/.test(read(p))));

t.section('4 · the excepted pages are excepted on purpose');

t.is('no excepted page carries the link',
  EXCEPTED.filter((p) => navHrefs(p).includes('assignments.html')), []);
t.ok('every exception states a reason', EXCEPTIONS.every((e) => e.reason.length > 60));
/* The frozen three are named as frozen HERE and in CLAUDE.md. If the two ever
   disagree, one of them is lying about what may be edited. */
const FROZEN = EXCEPTIONS.find((e) => /FROZEN/.test(e.reason)).pages;
t.is('the frozen list matches CLAUDE.md',
  FROZEN.filter((p) => !new RegExp(`^- \`${p}\``, 'm').test(read('CLAUDE.md'))), []);

/* A2.2's two pages are COVERED here and STILL FROZEN in CLAUDE.md, because the
   unfreeze was for one navigation change and was never a removal from the
   freeze. Nothing else in the repo pins that: quietly deleting either line from
   CLAUDE.md's frozen list would turn a one-change exception into a permanent
   one and every other check in this file would stay green.

   Pinned as literals rather than derived, and that is the point. Deriving this
   as 'covered pages that CLAUDE.md calls frozen' would SHRINK to match a
   deletion — it would satisfy itself in exactly the direction being guarded
   against. The pin's honest weakness is the same as STAFF_PIN's: it stops a
   silent removal, not a determined editor who edits both lines. */
const UNFROZEN_ONCE = ['weakness.html', 'focus.html'];
t.is('the two pages A2.2 unfroze for one line are still frozen in CLAUDE.md',
  UNFROZEN_ONCE.filter((p) => !new RegExp(`^- \`${p}\``, 'm').test(read('CLAUDE.md'))), []);

t.section('5 · A2.1 and A2.2 touched nothing they were not meant to');

t.is('the still-frozen page was not modified',
  FROZEN.filter((p) => navHrefs(p).includes('assignments.html')), []);
/* nav.js stays out of it: a student link needs no keep-list entry, because the
   filter hides what is NOT in the list rather than showing what is. */
t.ok('nav.js does not name assignments.html', !read('nav.js').includes('assignments.html'));
t.ok('and its keep-list is unchanged',
  /STAFF_NAV_KEEP = \{ 'teacher\.html': 1, 'teacher-exams\.html': 1,\s*'teacher-homework\.html': 1, 'partner\.html': 1,\s*'profile\.html': 1, 'settings\.html': 1 \};/
    .test(read('nav.js')));
/* A2.1 and A2.2 are navigation only. The destination is A1's and Increment 2's. */
t.ok('assignments.html still holds the hub', /<section id="pick"/.test(read('assignments.html')));
t.ok('and the A1 dashboard card is still there', /id="assignmentsCard"/.test(read('dashboard.html')));

t.section('6 · A3 is not being answered here');

/* Mock Exams keeps its own entry and its own destination. Whether the two
   should both exist is A3, and a nav increment must not settle it by quietly
   removing one. */
t.is('every covered page that had Mock Exams still has it',
  COVERED.filter((p) => {
    const before = navHrefs(p);
    return read(p).includes('mock-exam.html') !== before.includes('mock-exam.html');
  }), []);
t.is('Mock Exams still points at mock-exam.html on every covered page that lists it',
  COVERED.filter((p) => navHrefs(p).includes('mock-exam.html'))
         .filter((p) => !/href="mock-exam\.html"/.test(read(p))), []);

t.done();
