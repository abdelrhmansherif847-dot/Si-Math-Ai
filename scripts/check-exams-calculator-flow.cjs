#!/usr/bin/env node
/**
 * check-exams-calculator-flow.cjs — the calculator inside a running exam.
 *
 *   NODE_PATH=$(npm root -g) node scripts/check-exams-calculator-flow.cjs <form-fixture.json>
 *
 * ⚠️  THE CALCULATOR HERE IS A DESMOS-SHAPED STUB. Not their code, not their
 *     rendering, not their behaviour. Passing this proves NOTHING about the
 *     Desmos calculator — the same warning scripts/check-calculator-mount-path.cjs
 *     carries, and for the same reason: this environment cannot reach
 *     www.desmos.com (the gateway answers 403 to CONNECT).
 *
 *     What it proves is everything on OUR side of the boundary, which is the
 *     part this change touches:
 *
 *       · the section's calculator_allowed decides whether a launcher exists
 *       · a student can open it, work, close it and reopen it mid-module
 *       · NOTHING in the exam is lost across that: not the answer to the
 *         question they are on, not the answers behind them, not a flag, not
 *         the position in the module, and not the clock
 *       · the launcher element is not rebuilt as they navigate
 *       · the panel closes when the module ends, and does not outlive it
 *
 * VERIFICATION MODE, NOT A BYPASS. The launcher offers a calculator when the
 * exam's own policy names a provider OR when verification mode is on. No exam
 * names one — the two Desmos gates are still UNPROVEN/PENDING — so this drives
 * the flow with `?desmos-check=1`, which is the affordance built for exactly
 * this and which labels the control TEST on screen. Nothing here changes a gate.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');

const REPO = path.resolve(__dirname, '..');
const FIXTURE = process.argv[2];
if (!FIXTURE) { console.error('usage: check-exams-calculator-flow.cjs <form-fixture.json>'); process.exit(2); }
const DATA = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const CSP = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8')).headers
  .flatMap((h) => h.headers || []).find((h) => h.key === 'Content-Security-Policy').value;

const KEY = 'STUB-KEY-NOT-A-REAL-KEY';
const CFG = { apiKey: KEY, tier: 'trial', apiVersion: 'v1.12', studentFacing: false };

/* A stand-in with Desmos's SHAPE and none of its behaviour. It records that it
 * was constructed with a sized element, and destroy() must empty it. */
const STUB_DESMOS = `
window.Desmos = {
  enabledFeatures: { GraphingCalculator: true },
  GraphingCalculator: function (el, opts) {
    var r = el.getBoundingClientRect();
    window.__stub = { mounted: true, w: Math.round(r.width), h: Math.round(r.height),
                      destroyed: false, mounts: (window.__stub ? window.__stub.mounts : 0) + 1 };
    var d = document.createElement('div');
    d.setAttribute('data-stub-desmos', '1');
    d.style.cssText = 'position:absolute;inset:0;background:#fff;color:#111;font:14px system-ui;' +
      'display:flex;align-items:center;justify-content:center;border-radius:4px';
    d.textContent = 'STUB CALCULATOR (not Desmos)';
    el.appendChild(d);
    return { setExpression: function () {}, destroy: function () {
      window.__stub.destroyed = true; if (d.parentNode) d.parentNode.removeChild(d); } };
  },
};`;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('PASS  ' + m); };
const no = (m, d) => { fail++; console.log('FAIL  ' + m + (d ? '  — ' + d : '')); };
const is = (m, c, d) => (c ? ok(m) : no(m, d));

(async () => {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/api/desmos-config') {
      // The real endpoint is auth-gated and returns {config}. The stub answers
      // the same shape; the auth path is check-desmos-config-endpoint.mjs's job.
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private' });
      res.end(JSON.stringify({ config: CFG })); return;
    }
    const rel = decodeURIComponent(url).replace(/^\/+/, '') || 'exams.html';
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
  const problems = [];
  const NETWORK = /Failed to load resource|ERR_TUNNEL|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED/;
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() !== 'error') return;
    if (/Content Security Policy|Refused to/i.test(t)) problems.push('CSP: ' + t);
    else if (!NETWORK.test(t)) problems.push('console: ' + t);
  });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));

  // Every request to Desmos is answered by the stub, and the URL is recorded so
  // the version and origin can be asserted rather than assumed.
  const desmosUrls = [];
  await page.route('https://www.desmos.com/**', (route) => {
    desmosUrls.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB_DESMOS });
  });

  const initStub = ({ data }) => {
    const T = { exam_forms: [data.form], exam_form_sections: data.sections,
                exam_questions: data.questions, exam_stimuli: data.stimuli,
                profiles: [{ id: 'admin-1', role: 'admin', is_admin: true }] };
    function query(table) {
      let rows = (T[table] || []).slice();
      const a = { select: () => a,
        eq: (c, v) => { rows = rows.filter((r) => String(r[c]) === String(v)); return a; },
        in: (c, vs) => { rows = rows.filter((r) => vs.map(String).includes(String(r[c]))); return a; },
        order: () => a, then: (f) => Promise.resolve({ data: rows, error: null }).then(f),
        maybeSingle: () => Promise.resolve({ data: rows[0] || null, error: null }),
        single: () => Promise.resolve({ data: rows[0] || null, error: null }) };
      return a;
    }
    window.supabase = { createClient: () => ({ from: query, auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'admin-1' } } }),
      getSession: () => Promise.resolve({ data: { session: { access_token: 'stub-token' } } }) } }) };
  };
  await page.addInitScript(initStub, { data: DATA });

  await page.goto(base + '/exams.html?desmos-check=1', { waitUntil: 'networkidle' });
  await page.waitForSelector('.ex-pick button');
  await page.click('.ex-pick button');
  await page.waitForSelector('.ex-card .ex-stem');

  // ── the launcher is offered, because this section allows one ─────────────
  await page.waitForSelector('[data-si-calculator-open]', { timeout: 8000 });
  is('the section allows a calculator, so a launcher appears', true);
  is('and it is marked TEST, because no exam names a provider',
     (await page.textContent('[data-si-calculator-open]')).includes('TEST'),
     await page.textContent('[data-si-calculator-open]'));
  is('the launcher sits on the exam bar, aligned with the timer',
     await page.evaluate(() => {
       const b = document.querySelector('.ex-bar [data-si-calculator-open]');
       const t = document.querySelector('.ex-bar .xc-timer');
       if (!b || !t) return false;
       const rb = b.getBoundingClientRect(), rt = t.getBoundingClientRect();
       return Math.abs((rb.top + rb.height / 2) - (rt.top + rt.height / 2)) < 6;
     }));

  // ── lay down state to lose ───────────────────────────────────────────────
  await page.click('.ex-opt >> nth=1');                    // answer Q1 = B
  await page.click('.ex-nav .ex-btn:not(.ghost)');         // → Q2
  await page.waitForSelector('.ex-stem');
  await page.click('.ex-opt >> nth=0');                    // answer Q2 = A
  await page.click('.ex-flag');                            // flag Q2
  const slotId = await page.evaluate(() => {
    const s = document.querySelector('[data-si-calculator-slot]');
    s.__mark = 'original'; return true;
  });
  const before = await page.evaluate(() => ({
    q: document.querySelector('.xc-n-label').textContent,
    picked: [...document.querySelectorAll('.ex-opt')].findIndex((b) => b.classList.contains('is-picked')),
    flagged: document.querySelector('.ex-flag').classList.contains('is-on'),
    clock: document.querySelector('.xc-t-face').textContent,
  }));

  // ── open it ──────────────────────────────────────────────────────────────
  await page.click('[data-si-calculator-open]');
  await page.waitForSelector('.xw-panel.is-open', { timeout: 8000 });
  await page.waitForFunction(() => window.__stub && window.__stub.mounted, null, { timeout: 8000 });
  const stub = await page.evaluate(() => window.__stub);
  is('the calculator mounts into a region with real size', stub.w > 100 && stub.h > 100,
     JSON.stringify(stub));
  is('it was loaded from www.desmos.com and nowhere else',
     desmosUrls.length > 0 && desmosUrls.every((u) => u.startsWith('https://www.desmos.com/')),
     desmosUrls.join(', '));
  is('at the version the configuration names', desmosUrls.some((u) => u.includes('/v1.12/')),
     desmosUrls.join(', '));
  is('the credential is nowhere in the page text',
     !(await page.evaluate(() => document.documentElement.innerText)).includes('STUB-KEY'));

  // THE POINT OF NON-MODAL: the exam is not merely visible behind the panel,
  // it is USABLE. This is what the first run of this check could not do — the
  // scrim swallowed the click on Next and the flow could not proceed.
  is('no scrim is covering the exam', (await page.$$('.xw-scrim')).length === 0);
  const room = await page.evaluate(() => {
    const card = document.querySelector('.ex-card').getBoundingClientRect();
    const panel = document.querySelector('.xw-panel').getBoundingClientRect();
    return { cardRight: Math.round(card.right), panelLeft: Math.round(panel.left),
             pad: getComputedStyle(document.querySelector('.ex-shell')).paddingRight,
             onBody: document.body.classList.contains('si-calc-panel-open'),
             vw: window.innerWidth };
  });
  is('the page made room for the panel rather than letting it cover the question',
     room.cardRight <= room.panelLeft + 1, JSON.stringify(room));

  // THE CLOCK MUST SURVIVE. The first version narrowed the shell and left the
  // bar to cope: the launcher ended up half under the panel it had opened, and
  // the timer was pushed off the bar entirely. A student who opens a calculator
  // must not lose the clock to do it.
  const bar = await page.evaluate(() => {
    const r = (sel) => { const n = document.querySelector(sel); if (!n) return null;
      const b = n.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right),
        w: Math.round(b.width), h: Math.round(b.height) }; };
    const panel = document.querySelector('.xw-panel').getBoundingClientRect();
    return { timer: r('.xc-timer'), nav: r('.xc-nav'), panelLeft: Math.round(panel.left) };
  });
  is('the timer is still on screen, and not under the panel',
     !!bar.timer && bar.timer.w > 0 && bar.timer.r <= bar.panelLeft + 1, JSON.stringify(bar));
  is('so is the navigator',
     !!bar.nav && bar.nav.w > 0 && bar.nav.r <= bar.panelLeft + 1, JSON.stringify(bar));
  await page.click('.ex-opt >> nth=2');            // answer, with it open
  is('a question can be answered while the calculator is open',
     await page.evaluate(() =>
       [...document.querySelectorAll('.ex-opt')].findIndex((b) => b.classList.contains('is-picked')) === 2));
  await page.click('.ex-opt >> nth=0');            // put it back for the checks below

  // the exam is still underneath, untouched
  const during = await page.evaluate(() => ({
    q: document.querySelector('.xc-n-label').textContent,
    picked: [...document.querySelectorAll('.ex-opt')].findIndex((b) => b.classList.contains('is-picked')),
    flagged: document.querySelector('.ex-flag').classList.contains('is-on'),
  }));
  is('the question, the answer and the flag are all still there with it open',
     during.q === before.q && during.picked === before.picked && during.flagged === before.flagged,
     JSON.stringify({ before, during }));

  // ── close, navigate, reopen ──────────────────────────────────────────────
  await page.click('.xw-close');
  await page.waitForSelector('.xw-panel:not(.is-open)');
  is('closing tears the calculator down rather than hiding it',
     (await page.evaluate(() => window.__stub.destroyed)) === true);

  await page.click('.ex-nav .ex-btn:not(.ghost)');   // → Q3
  await page.waitForSelector('.ex-stem');
  await page.click('.ex-opt >> nth=2');              // answer Q3 = C
  await page.click('.ex-nav .ex-btn.ghost');         // ← back to Q2
  await page.waitForSelector('.ex-stem');
  const after = await page.evaluate(() => ({
    q: document.querySelector('.xc-n-label').textContent,
    picked: [...document.querySelectorAll('.ex-opt')].findIndex((b) => b.classList.contains('is-picked')),
    flagged: document.querySelector('.ex-flag').classList.contains('is-on'),
    slotSurvived: document.querySelector('[data-si-calculator-slot]').__mark === 'original',
    launchers: document.querySelectorAll('[data-si-calculator-open]').length,
  }));
  is('navigating back returns to the same question', after.q === before.q, after.q);
  is('with its answer intact', after.picked === before.picked, String(after.picked));
  is('and its flag intact', after.flagged === before.flagged);
  is('the launcher element was never rebuilt while navigating', after.slotSurvived);
  is('and there is exactly one of it', after.launchers === 1, String(after.launchers));

  await page.click('[data-si-calculator-open]');
  await page.waitForSelector('.xw-panel.is-open');
  await page.waitForFunction(() => window.__stub && window.__stub.mounted && !window.__stub.destroyed);
  is('reopening mounts a fresh calculator', (await page.evaluate(() => window.__stub.mounts)) === 2,
     String(await page.evaluate(() => window.__stub.mounts)));

  const clockNow = await page.textContent('.xc-t-face');
  const secs = (t) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
  is('the clock never stopped and never reset', secs(clockNow) < secs(before.clock),
     before.clock + ' → ' + clockNow);

  // ── finish the module with the calculator OPEN ───────────────────────────
  for (let i = 0; i < 21; i++) {
    const hasOpts = await page.$('.ex-opt');
    if (hasOpts) await page.click('.ex-opt >> nth=0'); else await page.fill('.ex-grid-in', '1');
    await page.click('.ex-nav .ex-btn:not(.ghost)');
    if (i < 20) await page.waitForSelector('.ex-card .ex-stem');
  }
  await page.waitForSelector('.ex-mid h1');
  const ended = await page.evaluate(() => ({
    panelOpen: !!document.querySelector('.xw-panel.is-open'),
    scrimOpen: !!document.querySelector('.xw-scrim.is-open'),
    slots: document.querySelectorAll('[data-si-calculator-slot]').length,
    destroyed: window.__stub.destroyed,
    view: document.querySelector('.ex-mid h1').textContent,
  }));
  is('the module ended on the break screen', /Module complete/.test(ended.view), ended.view);
  is('and the calculator did not outlive it',
     !ended.panelOpen && !ended.scrimOpen && ended.slots === 0 && ended.destroyed,
     JSON.stringify(ended));

  is('the body class the page lays out against is cleared too',
     !(await page.evaluate(() => document.body.classList.contains('si-calc-panel-open'))));

  // ── a section that FORBIDS one gets no launcher at all ───────────────────
  // The gate is read per section, so the only way to check it is to sit a
  // section whose policy says no. Nothing about the page changes — the same
  // build, the same verification mode, one column flipped in the form it reads.
  {
    const forbidden = JSON.parse(JSON.stringify(DATA));
    forbidden.sections.forEach((sec) => { sec.calculator_allowed = false; });
    const p2 = await browser.newPage();
    await p2.route('https://www.desmos.com/**', (r) =>
      r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB_DESMOS }));
    await p2.addInitScript(initStub, { data: forbidden });
    await p2.goto(base + '/exams.html?desmos-check=1', { waitUntil: 'networkidle' });
    await p2.waitForSelector('.ex-pick button');
    await p2.click('.ex-pick button');
    await p2.waitForSelector('.ex-card .ex-stem');
    await p2.waitForTimeout(400);
    const none = await p2.evaluate(() => ({
      slots: document.querySelectorAll('[data-si-calculator-slot]').length,
      buttons: document.querySelectorAll('[data-si-calculator-open]').length,
    }));
    is('a section that forbids a calculator emits no slot and offers no launcher',
       none.slots === 0 && none.buttons === 0, JSON.stringify(none));
    await p2.close();
  }

  is('the page\'s own code threw nothing, and the CSP refused nothing',
     problems.length === 0, problems.slice(0, 3).join(' | '));

  await browser.close();
  server.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('harness error:', e); process.exit(2); });
