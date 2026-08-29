#!/usr/bin/env node
/**
 * check-exams-page.cjs — drive exams.html in a real browser, on real rows.
 *
 *   NODE_PATH=$(npm root -g) node scripts/check-exams-page.cjs <form-fixture.json>
 *
 * The fixture is an export of the ACTUAL Spine rows (see
 * scripts/verify-exam-form-draft.sh). It is content, so it lives with the
 * content and is never committed. Everything else — the page, the renderer, the
 * chrome, the state machine — is the shipped source, served over the same
 * Content-Security-Policy production sends.
 *
 * WHY A BROWSER
 * -------------
 * docs/engineering/student-facing-rendering-validation.md §3: every defect in
 * the first DSAT preview passed item review, and two passed a DOM-level check
 * as well. One of them made every multiple-choice option render white on white,
 * with textContent perfectly correct. So the assertions below read COMPUTED
 * style and painted geometry wherever a defect could hide behind correct DOM.
 *
 * The Supabase client is stubbed — this checks the page, not the network — and
 * the stub answers from the fixture in the same shape PostgREST does. The auth
 * and RLS path is exercised by opening the page signed in, which is a person's
 * job and is reported as such rather than claimed here.
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const FIXTURE = process.argv[2];
if (!FIXTURE) { console.error('usage: check-exams-page.cjs <form-fixture.json>'); process.exit(2); }
const DATA = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.desmos.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://www.desmos.com; " +
  "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data: https://www.desmos.com; " +
  "img-src 'self' data: blob: https://igvkyxkmjnkzscqgommj.supabase.co; " +
  "connect-src 'self' https://igvkyxkmjnkzscqgommj.supabase.co; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.png': 'image/png', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('PASS  ' + m); };
const no = (m, d) => { fail++; console.log('FAIL  ' + m + (d ? '  — ' + d : '')); };
const is = (m, c, d) => (c ? ok(m) : no(m, d));

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'exams.html';
    const file = path.join(REPO, rel);
    if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
                         'Content-Security-Policy': CSP });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  // SCRIPT errors only. The sandbox this runs in cannot reach jsdelivr or
  // Google Fonts, so every CDN asset fails to load and would drown a plain
  // "no console errors" assertion in noise that is the environment's, not the
  // page's. What is asserted instead is that nothing the page's OWN code does
  // throws, and that the CSP refuses nothing — and the KaTeX consequence is
  // reported rather than hidden.
  const problems = [];
  const NETWORK = /Failed to load resource|ERR_TUNNEL|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED/;
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() !== 'error') return;
    if (/Content Security Policy|Refused to/i.test(t)) problems.push('CSP: ' + t);
    else if (!NETWORK.test(t)) problems.push('console: ' + t);
  });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));

  // The stub stands in for @supabase/supabase-js. It answers in PostgREST's
  // shape ({data, error}) so the page's real query code runs unmodified.
  await page.addInitScript(({ data }) => {
    const T = { exam_forms: [data.form], exam_form_sections: data.sections,
                exam_questions: data.questions, exam_stimuli: data.stimuli,
                profiles: [{ id: 'admin-1', role: 'admin', is_admin: true }] };
    function query(table) {
      let rows = (T[table] || []).slice();
      const api = {
        select() { return api; },
        eq(col, v) { rows = rows.filter((r) => String(r[col]) === String(v)); return api; },
        in(col, vs) { rows = rows.filter((r) => vs.map(String).includes(String(r[col]))); return api; },
        order() { return api; },
        then(res) { return Promise.resolve({ data: rows, error: null }).then(res); },
        maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
        single() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      };
      return api;
    }
    window.supabase = {
      createClient: () => ({
        from: query,
        auth: { getUser: () => Promise.resolve({ data: { user: { id: 'admin-1' } } }),
                getSession: () => Promise.resolve({ data: { session: null } }) },
      }),
    };
  }, { data: DATA });

  await page.goto(base + '/exams.html', { waitUntil: 'networkidle' });

  // ── the library ──────────────────────────────────────────────────────────
  await page.waitForSelector('.ex-pick button', { timeout: 10000 });
  const label = await page.textContent('.ex-pick button');
  is('the exam library lists the form from the Spine', /DSAT-2026-A/.test(label), label);
  is('and says it is a draft', /draft/.test(label), label);

  await page.click('.ex-pick button');
  await page.waitForSelector('.ex-card .ex-stem', { timeout: 10000 });

  // ── module 1 ─────────────────────────────────────────────────────────────
  const nav1 = await page.textContent('.xc-n-label');
  is('opens on question 1 of 22', nav1 === 'Question 1 of 22', nav1);
  is('the module is named without leaking a variant',
     (await page.textContent('#barNote')) === 'Module 1');
  is('the timer shows the section duration', (await page.textContent('.xc-t-face')).startsWith('34:')
     || (await page.textContent('.xc-t-face')) === '35:00');

  // Walk every question of module 1: each must have a stem that is VISIBLE,
  // options that are visible, and a figure where the row has a stimulus.
  let figures = 0, invisible = [], noAnswerable = [];
  for (let i = 1; i <= 22; i++) {
    await page.waitForSelector('.ex-stem');
    const shot = await page.evaluate(() => {
      const vis = (n) => {
        if (!n) return false;
        const cs = getComputedStyle(n), r = n.getBoundingClientRect();
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
        if (r.width < 1 || r.height < 1) return false;
        // white-on-white: the defect a DOM check cannot see
        const bg = (el) => {
          for (let e = el; e; e = e.parentElement) {
            const c = getComputedStyle(e).backgroundColor;
            if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
          }
          return 'rgb(255,255,255)';
        };
        return cs.color !== bg(n);
      };
      const stem = document.querySelector('.ex-stem');
      const opts = [...document.querySelectorAll('.ex-opt')];
      const input = document.querySelector('.ex-grid-in');
      return {
        n: document.querySelector('.xc-n-label').textContent,
        stemVisible: vis(stem) && stem.textContent.trim().length > 0,
        optCount: opts.length,
        optsVisible: opts.every(vis),
        hasInput: !!input,
        figs: document.querySelectorAll('.ex-fig svg, .ex-fig table').length,
        figEmpty: [...document.querySelectorAll('.ex-fig svg')].some((s) => s.children.length === 0),
        figError: !!document.querySelector('.ex-fig .ex-hint'),
      };
    });
    if (!shot.stemVisible) invisible.push('Q' + i + ' stem');
    if (shot.optCount && !shot.optsVisible) invisible.push('Q' + i + ' options');
    if (!shot.optCount && !shot.hasInput) noAnswerable.push('Q' + i);
    if (shot.figError) invisible.push('Q' + i + ' figure threw');
    if (shot.figEmpty) invisible.push('Q' + i + ' figure drew nothing');
    figures += shot.figs;

    // Answer it — except Q5, left blank on purpose, and Q7, flagged. Answering
    // everything would have made the navigator assertion below true whatever
    // the other three states did, which is how a grid check goes quietly dead.
    if (i === 7) await page.click('.ex-flag');
    if (i !== 5) {
      if (shot.optCount) await page.click('.ex-opt >> nth=0');
      else await page.fill('.ex-grid-in', '1');
    }
    if (i < 22) await page.click('.ex-nav .ex-btn:not(.ghost)');
  }
  is('every question in module 1 is readable on screen', invisible.length === 0, invisible.join('; '));
  is('every question offers a way to answer it', noAnswerable.length === 0, noAnswerable.join('; '));
  is('module 1 drew the figures its rows carry (9)', figures === 9, 'drew ' + figures);

  // ── the navigator reflects what was done ─────────────────────────────────
  await page.click('.xc-n-toggle');
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('.xc-q')].map((b) => b.className));
  const count = (re) => chips.filter((c) => re.test(c)).length;
  is('the navigator shows 22 chips', chips.length === 22);
  // 22 questions: 20 answered, Q5 left blank, Q7 flagged. All four states.
  is('the 20 answered questions read answered', count(/xc-q-answered/) === 20, JSON.stringify(chips));
  is('the one skipped question does not', /xc-q-unseen/.test(chips[4]), chips[4]);
  is('the flagged one reads flagged even though it was answered',
     /xc-q-flagged/.test(chips[6]), chips[6]);
  is('exactly one chip is current, and it is the last', count(/is-current/) === 1
     && /is-current/.test(chips[21]));
  await page.click('.xc-n-toggle');

  // ── the break screen ─────────────────────────────────────────────────────
  await page.click('.ex-nav .ex-btn:not(.ghost)');       // Finish module
  await page.waitForSelector('.ex-mid h1');
  const breakText = await page.textContent('#view');
  is('the break screen appears', /Module complete/.test(breakText));

  // THE PROPERTY THAT MATTERS, stated as a property rather than as a word
  // search. The first version of this check failed on the sentence that SAYS
  // the score is withheld, which contains the word "score" — searching for
  // vocabulary instead of for information.
  //
  // The reviewer banner is excluded because it names the variants the reviewer
  // is choosing BETWEEN, which is the opposite of revealing one taken; it is
  // review-only and says so on its face. A student build has no such element,
  // and the check below asserts the student-visible remainder.
  const studentText = await page.evaluate(() => {
    const v = document.getElementById('view').cloneNode(true);
    v.querySelectorAll('.ex-banner').forEach((n) => n.remove());
    return v.textContent;
  });
  const leaks = [];
  if (/\d+\s*(of|\/)\s*\d+/.test(studentText)) leaks.push('a score-shaped number');
  if (/\b(standard|advanced)\b/i.test(studentText)) leaks.push('the route taken');
  if (/\b\d+\b/.test(studentText.replace(/Module \d+/g, ''))) leaks.push('a bare number');
  is('the break screen carries no score and no route', leaks.length === 0,
     leaks.join(', ') + ' :: ' + studentText.slice(0, 160));
  is('and says plainly that both are withheld',
     /deliberately not shown/i.test(studentText));
  const reviewerBlock = await page.$('.ex-banner');
  is('the reviewer route control is present and labelled as review-only',
     !!reviewerBlock && /not part of the student experience/i.test(await page.textContent('.ex-banner')));

  // ── module 2, by an explicitly chosen variant ────────────────────────────
  await page.click('.ex-banner .ex-pick button >> nth=1');   // the second variant
  await page.click('.ex-mid .ex-btn');
  await page.waitForSelector('.ex-card .ex-stem');
  is('module 2 opens at question 1 of 22',
     (await page.textContent('.xc-n-label')) === 'Question 1 of 22');
  is('and is still named only "Module 2"', (await page.textContent('#barNote')) === 'Module 2');

  for (let i = 1; i <= 22; i++) {
    const hasOpts = await page.$('.ex-opt');
    if (hasOpts) await page.click('.ex-opt >> nth=1');
    else await page.fill('.ex-grid-in', '2');
    await page.click('.ex-nav .ex-btn:not(.ghost)');
    if (i < 22) await page.waitForSelector('.ex-card .ex-stem');
  }
  await page.waitForSelector('.ex-mark');
  const done = await page.textContent('#view');
  is('the exam ends in a review', /Exam complete/.test(done));
  is('and only then are the module scores shown', /of 22 correct/.test(done));
  const marks = await page.evaluate(() => document.querySelectorAll('.ex-mark').length);
  is('every question sat is marked (44)', marks === 44, 'marked ' + marks);

  // ── the calculator gate ──────────────────────────────────────────────────
  // Both DSAT sections allow one, so the SLOT is emitted on every module — and
  // it stays EMPTY, because exam-registry.js names no provider for any exam and
  // the launcher will not fill a slot for an exam whose policy does not.
  const calc = await page.evaluate(() => ({
    slotsSeen: window.__slotsSeen || 0,
    openButtons: document.querySelectorAll('[data-si-calculator-open]').length,
    panels: document.querySelectorAll('.xw-panel').length,
  }));
  is('no calculator was offered — the registry names no provider',
     calc.openButtons === 0 && calc.panels === 0, JSON.stringify(calc));

  is('the page\'s own code threw nothing, and the CSP refused nothing',
     problems.length === 0, problems.slice(0, 3).join(' | '));

  // Stated, not assumed: KaTeX is a CDN asset and this sandbox has no route to
  // it, so `$maths$` stays literal here. Maths typesetting is verified by
  // opening the page with a network, which is a person's job.
  const katex = await page.evaluate(() => !!window.renderMathInElement);
  console.log(katex
    ? 'NOTE  KaTeX loaded — maths in this run was typeset'
    : 'NOTE  KaTeX did not load (no CDN route in this sandbox), so $maths$ stayed literal;\n' +
      '      everything above is about structure and visibility, not about typeset maths');

  await browser.close();
  server.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('harness error:', e); process.exit(2); });
