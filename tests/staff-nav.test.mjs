// The staff navigation filter — and the proof that it is only navigation.
//
// When an account is ACTIVE workspace staff the sidebar shows Teacher
// Workspace, Profile and Settings, and nothing else. The risk in a change like
// this is not that it fails to hide something; it is that hiding quietly turns
// into taking away. So the suite is built around one question:
//
//     does this filter change anything a student could still DO?
//
// It must not. can_student stays unconditionally true, every student page stays
// reachable by URL, no permission moves, and no element is destroyed — only
// style.display changes. A surface switcher will make moving between the two
// experiences deliberate; until then, hiding a link must never become a lock.

import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('staff-nav');

const NAV = read('nav.js');
const FILTER = slice(NAV, 'var STAFF_NAV_KEEP', 'function render(', 'staff nav filter');
/** Executable lines only — the filter's own comment explains what it refuses
 *  to do, and asserting over prose would pass on the documentation. */
const CODE = FILTER.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
  .filter((l) => !l.trim().startsWith('//')).join('\n');

// ══ 1 · THE SURFACE ═══════════════════════════════════════════════════════
t.section('The staff surface is exactly three destinations');

t.ok('the filter exists and is real code', /function applyStaffNav/.test(CODE) && CODE.length > 400);
t.is('the keep-list is exactly Teacher Workspace, Profile, Settings',
  (FILTER.match(/'([a-z-]+\.html)': 1/g) || []).map((m) => m.match(/'(.+)'/)[1]).sort(),
  ['profile.html', 'settings.html', 'teacher.html']);

// ══ 2 · IT IS COSMETIC — THE WHOLE POINT ══════════════════════════════════
t.section('The filter changes appearance and nothing else');

t.ok('it only ever sets style.display', /\.style\.display = 'none'/.test(CODE));
/* A cosmetic filter that can SHOW things is not only cosmetic: writing '' back
   to a heading would reveal one a page had deliberately hidden. */
t.ok('it never un-hides anything', !/style\.display = ''/.test(CODE) && !/style\.display = anyVisible/.test(CODE));
t.ok('a heading is only ever hidden, and only when nothing under it is left',
  /if \(!anyVisible\) kids\[j\]\.style\.display = 'none';/.test(CODE));
/* A kept destination must survive a query string or a fragment. */
t.ok('the href is reduced to its filename, query and fragment removed',
  /\.split\('\?'\)\[0\]\.split\('#'\)\[0\]/.test(CODE));
for (const forbidden of [
  ['removes an element',        /removeChild|\.remove\(\)/],
  ['rewrites a link',           /setAttribute\('href'|\.href\s*=/],
  ['disables a control',        /\.disabled\s*=/],
  ['calls the database',        /\bsb\.|\.rpc\(|\.from\(/],
  ['reads or writes a role',    /profiles|user_role|is_admin|change_user_role/],
  ['touches storage',           /localStorage|sessionStorage|document\.cookie/],
  ['navigates anywhere',        /location\s*=|location\.href|location\.replace|location\.assign/],
]) {
  const [label, re] = forbidden;
  t.ok(`it never ${label}`, !re.test(CODE));
}

/* The claim that student pages stay reachable is only true if nothing else
   started gating them. Assert that too, across the shipped pages. */
const STUDENT_PAGES = ['dashboard.html', 'chat.html', 'progress.html', 'history.html',
  'devices.html', 'pricing.html', 'support.html'];
for (const page of STUDENT_PAGES) {
  const src = read(page);
  t.ok(`${page} still gates on nothing staff-related`,
    !/my_experience|can_staff|primary\s*===\s*'staff'|teacher_my_workspaces/.test(src));
}

// ══ 3 · IT APPLIES TO ACTIVE STAFF, AND ONLY THEM ═════════════════════════
t.section('Active Teacher and active Assistant; pending assistant untouched');

t.ok('the filter returns immediately when not staff', /if \(!teaching\) return;/.test(CODE));
t.ok('and `teaching` is can_staff, which is ACTIVE membership only',
  /teaching = x\.can_staff === true/.test(NAV));
t.ok('the fallback path is active-only too',
  /r\.staff_status === 'active'/.test(NAV) && !/staff_status !== 'removed'/.test(NAV));

/* teacher.html keeps its student menu in the markup on purpose: a PENDING
   assistant reaches that page from Settings and must keep their way back. */
const PAGE = read('teacher.html');
t.ok('teacher.html still carries the student menu for non-staff visitors',
  /href="dashboard\.html"/.test(PAGE) && /href="chat\.html"/.test(PAGE));

// ══ 4 · CONSISTENT ACROSS EVERY PAGE WITH A SIDEBAR ═══════════════════════
t.section('No page is left showing the full student sidebar');

t.ok('support.html now loads nav.js', /<script src="nav\.js" defer><\/script>/.test(read('support.html')));
t.ok('and it has the slot nav.js needs', /id="adminNavSection"/.test(read('support.html')));
t.ok('the filter runs on the same sweeps as the admin cleanup',
  (NAV.match(/applyStaffNav\(slot, teaching\)/g) || []).length >= 4);
t.ok('the slot itself is never filtered — the Teaching and Admin links live there',
  /if \(slot && slot\.contains\(a\)\) continue;/.test(CODE));

// ══ 5 · EXECUTABLE — run the real filter over a real-shaped sidebar ═══════
t.section('The shipped filter, executed');

/** The smallest DOM the filter actually uses. */
function makeDom(spec) {
  const mk = (cls, href) => ({
    classList: { contains: (c) => cls.split(' ').includes(c) },
    style: { display: '' },
    getAttribute: (n) => (n === 'href' ? href : null),
    _cls: cls, _href: href,
  });
  const children = spec.map(([cls, href]) => mk(cls, href));
  const slot = { contains: (el) => el._slot === true };
  const sidebar = {
    children,
    querySelectorAll: (sel) => (sel === 'a.nav-item' ? children.filter((c) => c._cls.includes('nav-item')) : []),
  };
  return { children, slot, document: { querySelector: (s) => (s === '.sidebar' ? sidebar : null) } };
}

const SPEC = [
  ['brand', 'dashboard.html'],          // the logo — not a nav-item
  ['side-sec', null], ['nav-item', 'dashboard.html'], ['nav-item', 'chat.html'],
  ['nav-item', 'weakness.html'], ['nav-item', 'mock-exam.html'], ['nav-item', 'progress.html'],
  ['side-sec', null], ['nav-item', 'teacher.html'],
  ['side-sec', null], ['nav-item', 'profile.html'], ['nav-item', 'devices.html'],
  ['nav-item', 'settings.html'],
];

const runFilter = (teaching) => {
  const dom = makeDom(SPEC);
  const fn = new Function('document', 'slot', 'teaching',
    `${FILTER.slice(0, FILTER.lastIndexOf('function render('))}\napplyStaffNav(slot, teaching);`);
  fn(dom.document, dom.slot, teaching);
  const by = (href) => dom.children.find((c) => c._href === href && c._cls.includes('nav-item'));
  return { dom, by, secs: dom.children.filter((c) => c._cls === 'side-sec') };
};

// -- as ACTIVE staff
{
  const { dom, by, secs } = runFilter(true);
  t.is('the three staff destinations stay visible',
    ['teacher.html', 'profile.html', 'settings.html'].filter((h) => by(h).style.display === ''),
    ['teacher.html', 'profile.html', 'settings.html']);
  t.is('every student destination is hidden',
    ['dashboard.html', 'chat.html', 'weakness.html', 'mock-exam.html', 'progress.html', 'devices.html']
      .filter((h) => by(h).style.display !== 'none'), []);
  t.is('the emptied section heading is hidden, the two live ones are not',
    secs.map((s) => s.style.display), ['none', '', '']);
  t.is('the brand/logo is never touched', dom.children[0].style.display, '');

  /* The reachability claim, executed: every anchor still exists and still
     points where it did. Hidden is not removed, and hidden is not rewritten. */
  const EVERY_HREF = ['dashboard.html', 'chat.html', 'weakness.html', 'mock-exam.html',
    'progress.html', 'teacher.html', 'profile.html', 'devices.html', 'settings.html'];
  t.is('no anchor was destroyed',
    dom.children.filter((c) => c._cls.includes('nav-item')).length, EVERY_HREF.length);
  t.is('every href survives untouched',
    dom.children.filter((c) => c._cls.includes('nav-item')).map((c) => c._href), EVERY_HREF);
}

// -- as a student, or a PENDING assistant
{
  const { by, secs } = runFilter(false);
  t.is('a non-staff account keeps every destination',
    ['dashboard.html', 'chat.html', 'weakness.html', 'mock-exam.html', 'progress.html',
     'teacher.html', 'profile.html', 'devices.html', 'settings.html']
      .filter((h) => by(h).style.display !== ''), []);
  t.is('and every section heading', secs.filter((s) => s.style.display !== '').length, 0);
}

// -- a kept destination carrying a fragment, and a pre-hidden heading
{
  const spec = [
    ['side-sec', null], ['nav-item', 'dashboard.html'],
    ['side-sec', null], ['nav-item', 'profile.html#security'], ['nav-item', 'settings.html?tab=1'],
  ];
  const dom = makeDom(spec);
  dom.children[0].style.display = 'none';        // a heading the page hid itself
  const fn = new Function('document', 'slot', 'teaching',
    `${FILTER.slice(0, FILTER.lastIndexOf('function render('))}\napplyStaffNav(slot, teaching);`);
  fn(dom.document, dom.slot, true);
  t.is('a kept page survives a #fragment', dom.children[3].style.display, '');
  t.is('and a ?query', dom.children[4].style.display, '');
  t.is('a heading the page hid stays hidden', dom.children[0].style.display, 'none');
}

// -- running twice must not drift
{
  const dom = makeDom(SPEC);
  const fn = new Function('document', 'slot', 'teaching',
    `${FILTER.slice(0, FILTER.lastIndexOf('function render('))}\napplyStaffNav(slot, teaching);applyStaffNav(slot, teaching);`);
  fn(dom.document, dom.slot, true);
  const by = (href) => dom.children.find((c) => c._href === href && c._cls.includes('nav-item'));
  t.is('the filter is idempotent across the repeated sweeps',
    [by('settings.html').style.display, by('dashboard.html').style.display], ['', 'none']);
}


// ══ 6 · EVERY REAL SIDEBAR IN THE REPO, THROUGH THE REAL FILTER ═══════════
t.section('The shipped filter, run over every page that actually has a sidebar');

/* A browser probe kept truncating settings.html, so this drives the same code
   over the real markup instead: the anchors and headings are parsed out of each
   shipped page, in document order, and the shipped filter is executed on them.
   No browser, no timing, and it covers pages a manual probe would skip. */
import { readdirSync } from 'node:fs';
import { REPO } from './_source.mjs';

const SIDEBAR_PAGES = readdirSync(REPO).filter((f) => f.endsWith('.html'))
  .filter((f) => /class="sidebar"/.test(read(f)));
t.ok('sidebar pages were found (not a vacuous sweep)', SIDEBAR_PAGES.length >= 14);

const parseSidebar = (html) => {
  const a = html.indexOf('<aside class="sidebar"');
  const b = html.indexOf('</aside>', a);
  if (a < 0 || b < 0) return null;
  const region = html.slice(a, b);
  const out = [];
  const re = /<div class="side-sec"[^>]*>|<a\b[^>]*class="[^"]*\bnav-item\b[^"]*"[^>]*>/g;
  let m;
  while ((m = re.exec(region))) {
    const tag = m[0];
    if (tag.startsWith('<div')) out.push(['side-sec', null]);
    else out.push(['nav-item', (tag.match(/href="([^"]*)"/) || [, ''])[1]]);
  }
  return out;
};

const KEEP = new Set(['teacher.html', 'profile.html', 'settings.html']);
const leaks = [];
const emptied = [];
for (const page of SIDEBAR_PAGES) {
  const spec = parseSidebar(read(page));
  if (!spec || !spec.some(([c]) => c === 'nav-item')) continue;
  const dom = makeDom(spec);
  const fn = new Function('document', 'slot', 'teaching',
    `${FILTER.slice(0, FILTER.lastIndexOf('function render('))}\napplyStaffNav(slot, teaching);`);
  fn(dom.document, dom.slot, true);
  const visible = dom.children
    .filter((c) => c._cls.includes('nav-item') && c.style.display !== 'none')
    .map((c) => (c._href || '').split('/').pop().split('?')[0].split('#')[0].toLowerCase());
  const bad = visible.filter((h) => h && !KEEP.has(h));
  if (bad.length) leaks.push(`${page}: ${bad.join(', ')}`);
  if (!visible.length) emptied.push(page);
}
t.is('no page leaks a student destination into the staff surface', leaks, []);

/* A page whose sidebar has none of the three would render an empty rail. The
   Teaching link nav.js injects into the slot still appears, but it is worth
   knowing which pages those are rather than discovering it visually. */
t.is('no page is left with an entirely empty sidebar', emptied, []);

// and the same sweep as a non-staff account must change nothing at all
const untouched = [];
for (const page of SIDEBAR_PAGES) {
  const spec = parseSidebar(read(page));
  if (!spec || !spec.some(([c]) => c === 'nav-item')) continue;
  const dom = makeDom(spec);
  const fn = new Function('document', 'slot', 'teaching',
    `${FILTER.slice(0, FILTER.lastIndexOf('function render('))}\napplyStaffNav(slot, teaching);`);
  fn(dom.document, dom.slot, false);
  if (dom.children.some((c) => c.style.display === 'none')) untouched.push(page);
}
t.is('a non-staff account has every sidebar left completely untouched', untouched, []);

/* The sweep above proves the filter WOULD hide those links. It does not prove
   nav.js runs on the page — and without it, nothing hides. So pin the coverage:
   every sidebar page must load nav.js and carry the slot it needs, with one
   documented exception. */
const NO_NAV = SIDEBAR_PAGES.filter((f) => !/<script src="nav\.js"/.test(read(f)));
const NO_SLOT = SIDEBAR_PAGES.filter((f) => !/id="adminNavSection"/.test(read(f)));

/* admin-support.html is the Support Queue: an ADMIN page, reachable only at
   role >= admin, and it carries neither nav.js nor the slot. An account that is
   both an admin AND active staff would still see the full student sidebar
   there. It is pinned here rather than fixed, because wiring it is a markup
   change to an admin surface that was not in this increment's scope — and
   pinning it means the next person finds it deliberately instead of by
   surprise. Tighten this list, never grow it. */
t.is('admin-support.html is the ONLY sidebar page nav.js does not reach',
  NO_NAV, ['admin-support.html']);
t.is('and the only one without the slot', NO_SLOT, ['admin-support.html']);

t.done();
