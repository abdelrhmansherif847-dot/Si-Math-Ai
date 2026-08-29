#!/usr/bin/env node
/**
 * check-exam-figure-fidelity.cjs — the exam draws what the grammar decided.
 *
 *   NODE_PATH=$(npm root -g) node scripts/check-exam-figure-fidelity.cjs <form-fixture.json>
 *
 * WHY THIS EXISTS
 * ---------------
 * exam-surface.css was first built from the exam-UI preview, which only ever
 * showed ONE function graph. Everything that preview did not exercise — the data
 * family's hue, the decided table, the named-point typeface, the number line's
 * weights — was INVENTED here instead of taken from the approved grammar
 * (365d85b, "Close the figure families as a grammar, not five looks"). The
 * figures rendered, so nothing complained.
 *
 * validate-exam-surface-css.mjs could not have caught it: it asks whether every
 * class has A rule, never whether it is the RIGHT one. Coverage is not fidelity.
 *
 * So this check reads the same computed properties from two places — the real
 * exam, on the real Spine rows, and the approved grammar's own page — and fails
 * on any difference. Both now render from exam-surface.css, so it passes; it is
 * here for the day someone forks that file again.
 *
 * The fixture is an export of the actual Spine rows. It is content: it lives
 * with the content and is never committed.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');

const REPO = path.resolve(__dirname, '..');
const FIXTURE = process.argv[2];
if (!FIXTURE) { console.error('usage: check-exam-figure-fidelity.cjs <form-fixture.json>'); process.exit(2); }
const DATA = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

/* The properties that carry the decision. Each was chosen because getting it
 * wrong is visible to a student, and most of them WERE wrong. */
const PROBE = {
  '.sx-tick text':   ['fill', 'fontFamily', 'fontSize', 'paintOrder', 'strokeWidth'],
  '.sx-axis line':   ['stroke', 'strokeWidth'],
  '.sx-grid line':   ['stroke', 'strokeWidth'],
  '.sx-curve':       ['strokeWidth', 'strokeLinecap'],
  '.sx-axis-title':  ['fill', 'fontFamily', 'fontSize'],
  '.sx-label':       ['fill', 'fontFamily', 'fontStyle', 'fontWeight', 'fontSize', 'strokeWidth'],
  '.sx-nl-seg':      ['strokeWidth', 'strokeLinecap'],
  '.sx-nl-minor':    ['stroke', 'opacity', 'strokeWidth'],
  '.sx-endpoint':    ['strokeWidth'],
  '.sx-fam-data .sx-series': ['color'],
  '.sx-table':       ['borderTopWidth', 'borderTopColor', 'fontFamily'],
  '.sx-table th':    ['backgroundColor', 'color', 'fontWeight', 'fontSize', 'textAlign', 'padding'],
  '.sx-table td':    ['fontSize', 'borderTopColor', 'textAlign', 'padding'],
};

const READ = (probe) => {
  const out = {};
  for (const [sel, props] of Object.entries(probe)) {
    const el = document.querySelector(sel);
    if (!el) continue;                       // not on this page; the caller unions
    const cs = getComputedStyle(el);
    out[sel] = Object.fromEntries(props.map((p) => [p, cs[p]]));
  }
  return out;
};

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('PASS  ' + m); };
const no = (m, d) => { fail++; console.log('FAIL  ' + m + (d ? '\n      ' + d : '')); };

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'exams.html';
    const file = path.join(REPO, rel);
    if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;

  const browser = await chromium.launch();

  // ── the approved grammar, as published ───────────────────────────────────
  const g = await browser.newPage();
  await g.goto(base + '/scripts/figure-system.html', { waitUntil: 'networkidle' });
  await g.waitForSelector('.sx');
  const approved = await g.evaluate(READ, PROBE);
  await g.close();

  // ── the real exam, on the real rows ──────────────────────────────────────
  const p = await browser.newPage();
  await p.addInitScript(({ data }) => {
    const T = { exam_forms: [data.form], exam_form_sections: data.sections,
                exam_questions: data.questions, exam_stimuli: data.stimuli,
                profiles: [{ id: 'a', role: 'admin', is_admin: true }] };
    function q(t) { let rows = (T[t] || []).slice(); const a = { select: () => a,
      eq: (c, v) => { rows = rows.filter((r) => String(r[c]) === String(v)); return a; },
      in: (c, vs) => { rows = rows.filter((r) => vs.map(String).includes(String(r[c]))); return a; },
      order: () => a, then: (f) => Promise.resolve({ data: rows, error: null }).then(f),
      maybeSingle: () => Promise.resolve({ data: rows[0] || null, error: null }),
      single: () => Promise.resolve({ data: rows[0] || null, error: null }) }; return a; }
    window.supabase = { createClient: () => ({ from: q, auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'a' } } }) } }) };
  }, { data: DATA });
  await p.goto(base + '/exams.html', { waitUntil: 'networkidle' });
  await p.waitForSelector('.ex-pick button');
  await p.click('.ex-pick button');
  await p.waitForSelector('.ex-card .ex-stem');

  // Module 1 carries one of every stimulus type. Walk to each and union what it
  // shows, because the exam draws ONE question at a time.
  const TYPES = { 2: 'table', 4: 'plot/graph', 7: 'chart', 14: 'plot/data',
                  16: 'plot/plane', 17: 'number line' };
  const live = {}; const seen = {};
  for (const n of Object.keys(TYPES).map(Number)) {
    await p.click('.xc-n-toggle');
    await p.click('.xc-q >> nth=' + (n - 1));
    await p.waitForSelector('.ex-fig svg, .ex-fig table', { timeout: 8000 });
    const got = await p.evaluate(READ, PROBE);
    for (const [sel, v] of Object.entries(got)) {
      if (!(sel in live)) { live[sel] = v; seen[sel] = TYPES[n]; }
    }
  }
  await p.close();

  // ── compare ──────────────────────────────────────────────────────────────
  const selectors = Object.keys(PROBE);
  const missingHere = selectors.filter((s) => !(s in live));
  const missingThere = selectors.filter((s) => !(s in approved));
  // A selector neither page draws is a probe that proves nothing, and a probe
  // that proves nothing is how a check dies quietly.
  const dead = selectors.filter((s) => missingHere.includes(s) && missingThere.includes(s));
  if (dead.length) no('every probe is drawn by at least one of the two surfaces', 'never drawn: ' + dead.join(', '));
  else ok('every probe is drawn by at least one of the two surfaces');

  for (const sel of selectors) {
    if (!(sel in live) || !(sel in approved)) {
      console.log('SKIP  ' + sel + ' — ' + (sel in live ? 'not on the grammar page' : 'not drawn by this form'));
      continue;
    }
    const diffs = Object.entries(approved[sel])
      .filter(([k, v]) => live[sel][k] !== v)
      .map(([k, v]) => `${k}: exam "${live[sel][k]}" vs approved "${v}"`);
    if (diffs.length) no(`${sel} matches the approved grammar  [${seen[sel]}]`, diffs.join('\n      '));
    else ok(`${sel} matches the approved grammar  [${seen[sel]}]`);
  }

  await browser.close();
  server.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('harness error:', e); process.exit(2); });
