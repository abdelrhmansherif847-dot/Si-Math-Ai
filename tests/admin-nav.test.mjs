// The shared admin sidebar — who is offered which link.
//
// nav.js exists because a link hand-written into a page "looks correct in the
// source and does not exist in the browser": render() overwrites the slot. So
// the only place an admin link is real is here, and the only thing worth
// asserting is that each one appears at the role level the DATABASE enforces.
// A link shown below that level is a link to a page that will list nothing.
//
// The suite runs the REAL render() out of the shipped file rather than a
// paraphrase — the house pattern, via tests/_source.mjs. Renaming or moving the
// function fails the slice loudly instead of passing vacuously.
import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('admin-nav');

const SRC = read('nav.js');
// Everything render() closes over, taken from the file itself.
const consts = slice(SRC, "  var SLOT_ID = 'adminNavSection';", '  // Every page already loads', 'nav constants');
const page = slice(SRC, '  function currentPageFile() {', '\n  function ', 'currentPageFile');
const body = slice(SRC, '  function render(slot, role) {', '\n  function ', 'render');

const make = (pathname) => {
  const ctx = { location: { pathname } };
  const fn = new Function('location', consts + '\n' + page + '\n' + body + '\n return render;');
  return fn(ctx.location);
};
/** A slot just real enough for render() to fill. */
const slot = () => ({ innerHTML: '', style: {} });
const linksIn = (s) => [...s.innerHTML.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

// ───────────────────────────────────────────────────────────────────────────
t.section('a student is offered no admin link at all');
{
  for (const role of ['user', undefined, 'nonsense', null]) {
    const s = slot();
    make('/dashboard.html')(s, role);
    t.ok(`role ${JSON.stringify(role)} — the section is emptied and hidden`,
         s.innerHTML === '' && s.style.display === 'none');
  }
}

t.section('Exams appears exactly where the database allows it');
{
  // All four Question Spine tables are RLS-gated to has_role_at_least('admin'),
  // so 'admin' is the threshold. Support Queue is gated the same way and is the
  // reference: if these two ever disagree, one of them is lying to somebody.
  const at = (role) => { const s = slot(); make('/dashboard.html')(s, role); return linksIn(s); };
  t.ok('admin is offered Exams', at('admin').includes('exams.html'));
  t.ok('super_admin is offered Exams', at('super_admin').includes('exams.html'));
  t.ok('owner is offered Exams', at('owner').includes('exams.html'));
  t.ok('a plain user is offered nothing', at('user').length === 0);

  for (const role of ['admin', 'super_admin', 'owner']) {
    const l = at(role);
    t.ok(`${role} — Exams sits at the same threshold as Support Queue`,
         l.includes('exams.html') === l.includes('admin-support.html'));
  }
  // AI Monitor is super_admin+, and Exams must NOT have inherited that.
  t.ok('AI Monitor stays super_admin+ while Exams does not',
       !at('admin').includes('ai-monitor.html') && at('super_admin').includes('ai-monitor.html'));
}

t.section('the link says where you are');
{
  const here = slot();
  make('/exams.html')(here, 'owner');
  t.ok('on exams.html the Exams item is marked active',
       /class="nav-item active"[^>]*href="exams\.html"/.test(here.innerHTML), here.innerHTML.slice(0, 400));
  const elsewhere = slot();
  make('/dashboard.html')(elsewhere, 'owner');
  t.ok('and is not marked active anywhere else',
       !/class="nav-item active"[^>]*href="exams\.html"/.test(elsewhere.innerHTML));
  t.ok('the owner still gets the owner label', /Owner Dashboard/.test(elsewhere.innerHTML));
}

t.section('the section is one block, written once');
{
  const s = slot();
  make('/dashboard.html')(s, 'owner');
  const l = linksIn(s);
  t.is('owner sees four admin links, each once', l,
       ['admin.html', 'admin-support.html', 'exams.html', 'ai-monitor.html']);
  t.ok('and the section is shown', s.style.display === 'block');
}

t.done();
