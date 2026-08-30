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
const is = (m, c, d) => (c ? ok(m) : no(m, d));

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
  // THE PLATE ITSELF, not just the ink on it. Every property check in this file
  // passed while the exam was drawing its figures a quarter flatter than these
  // specimens and ruling squared paper every TWO units — a matching font-size
  // and stroke colour say nothing about the shape of the plate they sit on.
  const approvedPlate = await g.evaluate(() => {
    const out = {};
    for (const [key, id] of [['graph', 'v-fn-1'], ['plane', 'v-geo-0'],
                             ['data', 'v-data-1'], ['nl', 'v-nl-0']]) {
      const host = document.getElementById(id); if (!host) continue;
      const svg = host.tagName.toLowerCase() === 'svg' ? host : host.querySelector('svg');
      const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
      const r = svg.querySelector('clipPath rect');
      out[key] = { w: vb[2], h: vb[3],
                   iw: r ? +r.getAttribute('width') : null,
                   ih: r ? +r.getAttribute('height') : null };
    }
    return out;
  });
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

  // ══ THE FAMILY DECISIONS, ON REAL QUESTIONS ══════════════════════════════
  //
  // The property comparison above proves the exam uses the approved STYLES. It
  // cannot prove it applies the approved RULES: Q4 once carried the grammar's
  // exact grid styling and still drew a boxed, plated figure, because "has a
  // grid" and "is enclosed" are different questions. These walk one real
  // question per family and assert the decision itself.
  const p2 = await browser.newPage();
  await p2.addInitScript(({ data }) => {
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
  await p2.goto(base + '/exams.html', { waitUntil: 'networkidle' });
  await p2.waitForSelector('.ex-pick button');
  await p2.click('.ex-pick button');
  await p2.waitForSelector('.ex-card .ex-stem');

  const SHAPE = () => {
    const svg = document.querySelector('.ex-fig svg.sx');
    if (!svg) return { table: !!document.querySelector('.ex-fig .sx-table') };
    const lines = [...(svg.querySelector('.sx-grid') ? svg.querySelector('.sx-grid').children : [])];
    const ax = [...(svg.querySelector('.sx-axis') ? svg.querySelector('.sx-axis').children : [])];
    const V = [], H = []; let top = null, bot = null, left = null, right = null;
    for (const l of lines) {
      const [x1, y1, x2, y2] = ['x1','y1','x2','y2'].map((a) => +l.getAttribute(a));
      if (x1 === x2) { V.push(x1); top = y1; bot = y2; } else { H.push(y1); left = x1; right = x2; }
    }
    const near = (a, b) => a !== null && b !== null && Math.abs(a - b) < 0.6;
    return { fam: (svg.getAttribute('class') || '').match(/sx-fam-\w+/)?.[0] || null,
      gridV: V.length, gridH: H.length,
      closes: (V.length ? near(Math.min(...V), left) && near(Math.max(...V), right) : false)
           && (H.length ? near(Math.min(...H), top) && near(Math.max(...H), bot) : false),
      touchesAnyEdge: (V.length && (near(Math.min(...V), left) || near(Math.max(...V), right)))
                   || (H.length && (near(Math.min(...H), top) || near(Math.max(...H), bot))),
      arrows: ax.filter((l) => l.getAttribute('marker-end')).length,
      endpoints: svg.querySelectorAll('.sx-endpoint').length,
      openEnds: svg.querySelectorAll('.sx-endpoint.sx-open').length };
  };
  const at = async (n) => {
    await p2.click('.xc-n-toggle');
    await p2.click('.xc-q >> nth=' + (n - 1));
    await p2.waitForSelector('.ex-fig svg, .ex-fig table');
    return p2.evaluate(SHAPE);
  };
  const plateAt = async (n) => {
    await p2.click('.xc-n-toggle');
    await p2.click('.xc-q >> nth=' + (n - 1));
    await p2.waitForSelector('.ex-fig svg');
    return p2.evaluate(() => {
      const svg = document.querySelector('.ex-fig svg');
      const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
      const r = svg.querySelector('clipPath rect');
      const gridX = Array.from(svg.querySelectorAll('.sx-grid line'))
        .filter((l) => l.getAttribute('x1') === l.getAttribute('x2'))
        .map((l) => +l.getAttribute('x1')).sort((a, b) => a - b);
      return { w: vb[2], h: vb[3],
               iw: r ? +r.getAttribute('width') : null,
               ih: r ? +r.getAttribute('height') : null,
               cell: gridX.length > 1 ? gridX[1] - gridX[0] : 0 };
    });
  };

  const graph = await at(4);        // "how many values of x does f(x)=2" — reading: value
  is('function graph · Open — the drawing does not close  [Q4]',
     graph.fam === 'sx-fam-graph' && !graph.closes && !graph.touchesAnyEdge, JSON.stringify(graph));
  is('function graph · the grid is there, because the question asks for a value  [Q4]',
     graph.gridV > 0 && graph.gridH > 0, JSON.stringify(graph));
  is('function graph · the axes carry arrowheads — they continue  [Q4]', graph.arrows === 2);

  const plane = await at(16);       // triangle OAB
  is('coordinate geometry · Squared paper — the grid rules to its edges  [Q16]',
     plane.fam === 'sx-fam-plane' && plane.touchesAnyEdge, JSON.stringify(plane));
  is('coordinate geometry · arrowheads, because a plane continues  [Q16]', plane.arrows === 2);

  const scatter = await at(14);
  is('data · Screen-native — rules ACROSS ONLY, and no arrowheads  [Q14]',
     scatter.fam === 'sx-fam-data' && scatter.gridV === 0 && scatter.gridH > 0 && scatter.arrows === 0,
     JSON.stringify(scatter));

  const nl = await at(17);
  is('number line · Statement — open and closed endpoints both drawn  [Q17]',
     nl.endpoints === 2 && nl.openEnds === 1, JSON.stringify(nl));

  const table = await at(12);
  is('table · Boxed — the renderer\'s table, not an SVG  [Q12]', table.table === true);


  // ── the pie names every slice, and no name may be lost ──────────────────
  // A rim label runs OUTWARD from the disc, so the box has to hold the longest
  // one — and on a multi-panel figure the outermost label has no neighbour to
  // borrow room from. It ran off the right by a character the first time, on a
  // figure whose every colour, class and proportion was correct. Measured from
  // laid-out text rather than asserted from CSS, because only the layout knows
  // how wide a word is.
  {
    const r = await p2.evaluate(() => {
      const R = globalThis.SiExamStimulus;
      const host = document.createElement('div');
      host.style.width = '702px'; document.body.appendChild(host);
      const shapes = [
        [{ title: 'By destination', categories: ['USA', 'Japan', 'Others', 'UK'], values: [40, 30, 20, 10] },
         { title: 'By age', categories: ['Above 50', '40–49', '30–39', 'Below 30'], values: [50, 20, 15, 15] }],
        [{ categories: ['Passed', 'Retook', 'Withdrew'], values: [72, 23, 5] }],
        [{ categories: ['A really quite long category name', 'B'], values: [50, 50] }],
      ];
      let clipped = 0, collided = 0, labels = 0;
      for (const panels of shapes) {
        const svg = R.renderForQuestion({ id: 'q', reading: null },
          { id: 's', kind: 'chart', spec: { chartType: 'pie', panels } });
        host.appendChild(svg);
        const box = svg.getBoundingClientRect();
        const rc = [...svg.querySelectorAll('.sx-pie-label')].map((t) => t.getBoundingClientRect());
        labels += rc.length;
        rc.forEach((t) => { if (t.left < box.left - 0.5 || t.right > box.right + 0.5) clipped++; });
        for (let i = 0; i < rc.length; i++) for (let j = i + 1; j < rc.length; j++) {
          const a = rc[i], c = rc[j];
          if (!(a.right < c.left || c.right < a.left || a.bottom < c.top || c.bottom < a.top)) collided++;
        }
      }
      host.remove();
      return { clipped, collided, labels };
    });
    is('pie · every slice label is inside its own figure  [3 shapes]',
       r.clipped === 0 && r.labels > 0, JSON.stringify(r));
    is('pie · and no two labels overlap  [3 shapes]', r.collided === 0, JSON.stringify(r));

    // ONE PANEL AND TWO PANELS ARE THE SAME FAMILY, so they have to be drawn at
    // the same size on the page. The viewBox grows with the panel count, and
    // displaying every pie at one width made a lone pie render a third larger —
    // heavier ink, bigger type, same grammar. The plate-stretch defect again.
    const sc = await p2.evaluate(() => {
      const R = globalThis.SiExamStimulus;
      const host = document.createElement('div');
      host.style.width = '702px'; document.body.appendChild(host);
      const at = (panels) => {
        const svg = R.renderForQuestion({ id: 'q', reading: null },
          { id: 's', kind: 'chart', spec: { chartType: 'pie', panels } });
        host.appendChild(svg);
        return svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      };
      const one = at([{ categories: ['a', 'b', 'c'], values: [7, 2, 1] }]);
      const two = at([{ categories: ['a', 'b'], values: [1, 1] },
                      { categories: ['c', 'd'], values: [1, 1] }]);
      host.remove();
      return { one: +one.toFixed(3), two: +two.toFixed(3) };
    });
    is('pie · a panel is the same size whatever the panel count',
       Math.abs(sc.one - sc.two) < 0.01, JSON.stringify(sc));
  }

  // ── the plate is the specimen's plate, at the specimen's size ────────────
  // Drawn at the reference width and DISPLAYED at the column's, so the exam
  // figure is the approved figure scaled — identical viewBox, identical drawing
  // box, one factor on every line weight and numeral. Checking a ratio alone
  // would pass a figure whose ink had been left behind at the old absolute
  // size, which is exactly what happened.
  for (const [label, n, key] of [['function graph', 4, 'graph'],
                                 ['coordinate geometry', 16, 'plane'],
                                 ['data', 14, 'data'], ['number line', 17, 'nl']]) {
    const a = approvedPlate[key]; if (!a) continue;
    const e = await plateAt(n);
    is(label + ' · drawn on the approved plate  [Q' + n + ']',
       e.w === a.w && (a.iw === null || e.iw === a.iw),
       'exam ' + JSON.stringify(e) + '  approved ' + JSON.stringify(a));
  }
  // Squared paper is ruled in UNITS: consecutive numerals along the axis differ
  // by one, so a leg of length 6 is six squares. Read off the numerals rather
  // than the pixels, because that is the claim — a two-unit cell can be counted
  // only by twos, and this family exists so that it can be counted at all.
  //
  // Anchored on Q19, which is where this actually broke. Q16's window is narrow
  // enough that it was ruled in units even while Q19 was not, so a check that
  // looked only at Q16 would have watched the defect ship.
  for (const n of [19, 16]) {
    await p2.click('.xc-n-toggle');
    await p2.click('.xc-q >> nth=' + (n - 1));
    await p2.waitForSelector('.ex-fig svg');
    const gaps = await p2.evaluate(() => {
      const vals = Array.from(document.querySelectorAll('.ex-fig .sx-tick text'))
        .filter((t) => t.getAttribute('text-anchor') === 'middle')
        .map((t) => parseFloat(t.textContent.replace('\u2212', '-')))
        .filter((v) => !Number.isNaN(v));
      // 0 is never drawn on a plane — the origin carries the letter O instead —
      // so it is put back before the run is measured. A two-unit grid still
      // fails: 0,2,4,6 is not a run of ones.
      if (!vals.includes(0)) vals.push(0);
      vals.sort((a, b) => a - b);
      return vals.slice(1).map((v, i) => +(v - vals[i]).toFixed(3));
    });
    is('coordinate geometry · ruled in units, so squares can be counted  [Q' + n + ']',
       gaps.length > 0 && gaps.every((g) => g === 1), JSON.stringify(gaps));
  }

  await p2.close();
  await browser.close();
  server.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('harness error:', e); process.exit(2); });
