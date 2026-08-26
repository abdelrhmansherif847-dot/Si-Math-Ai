const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

// Written INDEPENDENTLY of build-directions.py: what each number-line direction
// is SUPPOSED to differ in. Checking a drawing against its own options would
// pass even if the options were nonsense.
const NL_INTENT = {
  ruler:     { named: 13, lifted: false, minor: false },  // every integer named
  statement: { named: 4,  lifted: false, minor: false },  // −6, −3, 4, 6 only
  fine:      { named: 13, lifted: false, minor: true  },  // integers + half ticks
  band:      { named: 13, lifted: true,  minor: false },
};
const PLANE_DIRS = ['plate', 'open', 'paper', 'screen'];
const FAMS = ['fn', 'geo', 'stat'];

// A translucent tint measured as if it were opaque is a lie in both
// directions: rgba(15,92,140,.09) over white reads as a dark navy. Every
// colour is composited over the card before its luminance is taken.
const parse = c => { const p = (c.match(/[\d.]+/g) || [0,0,0]).map(Number);
  return { r: p[0]||0, g: p[1]||0, b: p[2]||0, a: p.length > 3 ? p[3] : 1 }; };
const over = (fg, bg) => ({ r: fg.r*fg.a + bg.r*(1-fg.a), g: fg.g*fg.a + bg.g*(1-fg.a),
                            b: fg.b*fg.a + bg.b*(1-fg.a), a: 1 });
const lum = o => { const [r,g,b] = [o.r,o.g,o.b]
  .map(v => { v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); });
  return .2126*r + .7152*g + .0722*b; };
const cr = (a, b) => { const B = over(parse(b), { r:255, g:255, b:255, a:1 });
  const A = over(parse(a), B);
  const [x, y] = [lum(A), lum(B)].sort((m,n)=>n-m);
  return (x + .05) / (y + .05); };

(async () => {
  const browser = await chromium.launch();
  const fails = [], pass = [];
  const ok = (n, c, d) => { (c ? pass : fails).push((c ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 },
      deviceScaleFactor: 2, colorScheme: theme });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e));
    page.on('console', m => { if (m.type() === 'error' &&
      !/fonts\.(googleapis|gstatic)/.test(m.text() + m.location().url)) errs.push('console: ' + m.text()); });
    await page.goto('file://' + path.join(__dirname, 'figure-directions.html'));
    await page.waitForTimeout(700);
    ok(`[${theme}] no JS errors`, errs.length === 0, errs.join(' | '));

    // ── every declared host holds a drawn SVG (measured on screen, not from an
    //    attribute — the renderer sizes with viewBox + CSS, so width is null)
    const panels = await page.evaluate(() => [...document.querySelectorAll('.db')].map(h => {
      const s = h.querySelector('svg'), r = s && s.getBoundingClientRect();
      return { id: h.id, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
               marks: s ? s.querySelectorAll('path,line,circle,polyline').length : 0 };
    }));
    ok(`[${theme}] 16 figure panels (12 plane + 4 number line)`, panels.length === 16, 'got ' + panels.length);
    for (const p of panels)
      ok(`[${theme}] ${p.id} drew`, p.w > 250 && p.h > 60 && p.marks > 3, JSON.stringify(p));

    // ── the four plane directions are genuinely different, not four tints
    const plane = await page.evaluate(() => {
      const o = {};
      for (const host of document.querySelectorAll('[id^="f-fn-"]')) {
        const s = host.querySelector('svg');
        o[host.id.split('-')[2]] = {
          grid: s.querySelectorAll('.sx-grid line').length,
          fine: s.querySelectorAll('.sx-grid line.sx-fine').length,
          frame: s.querySelectorAll('.sx-frame').length,
          named: s.querySelectorAll('.sx-tick text').length,
        };
      }
      return o;
    });
    ok(`[${theme}] Plate is the only framed direction`,
       plane.plate.frame === 1 && !plane.open.frame && !plane.paper.frame && !plane.screen.frame,
       JSON.stringify(Object.fromEntries(Object.entries(plane).map(([k,v]) => [k, v.frame]))));
    ok(`[${theme}] Open is the only gridless direction`,
       plane.open.grid === 0 && plane.plate.grid > 0 && plane.paper.grid > 0 && plane.screen.grid > 0);
    ok(`[${theme}] Squared paper is the only one with a half-unit grid`,
       plane.paper.fine > 0 && !plane.plate.fine && !plane.screen.fine);
    ok(`[${theme}] all four plane directions name the same values`,
       new Set(PLANE_DIRS.map(d => plane[d].named)).size === 1,
       JSON.stringify(plane));

    // ── number lines: match the independently-written intent, and never lose
    //    the semantics (−3 open, 4 closed) whatever the styling does
    const nl = await page.evaluate(() => {
      const o = {};
      for (const host of document.querySelectorAll('.nl')) {
        const s = host.querySelector('svg');
        const eps = [...s.querySelectorAll('.sx-endpoint')];
        o[host.id.replace('nl-','')] = {
          named: s.querySelectorAll('.sx-tick text').length,
          minor: s.querySelectorAll('.sx-nl-minor').length > 0,
          drops: s.querySelectorAll('.sx-nl-drop').length,
          axisY: +s.querySelector('.sx-nl-axis line').getAttribute('y1'),
          segY:  +s.querySelector('.sx-nl-seg').getAttribute('y1'),
          r: +eps[0].getAttribute('r'),
          open: eps.map(e => e.getAttribute('class').includes('sx-open')),
        };
      }
      return o;
    });
    for (const [id, want] of Object.entries(NL_INTENT)) {
      const g = nl[id];
      ok(`[${theme}] nl:${id} names ${want.named} values`, g.named === want.named, 'got ' + g.named);
      ok(`[${theme}] nl:${id} half-step ticks = ${want.minor}`, g.minor === want.minor);
      const lifted = g.segY < g.axisY - 5;
      ok(`[${theme}] nl:${id} interval lifted = ${want.lifted}`, lifted === want.lifted,
         `segY ${g.segY} vs axisY ${g.axisY}`);
      ok(`[${theme}] nl:${id} drop lines iff lifted`, (g.drops > 0) === want.lifted, 'drops ' + g.drops);
      ok(`[${theme}] nl:${id} keeps −3 OPEN and 4 CLOSED`,
         g.open.length === 2 && g.open[0] === true && g.open[1] === false, JSON.stringify(g.open));
    }
    ok(`[${theme}] number-line directions differ in endpoint size`,
       new Set(Object.values(nl).map(g => g.r)).size >= 3,
       Object.values(nl).map(g => g.r).join(','));

    // ── tables
    const tb = await page.evaluate(() => [...document.querySelectorAll('.tb table')].map(t => {
      const td = t.querySelector('tbody td'), cs = getComputedStyle(td);
      const rows = [...t.querySelectorAll('tr')];
      return { cls: t.className, cols: t.querySelectorAll('thead th').length,
        rows: t.querySelectorAll('tbody tr').length,
        bordered: parseFloat(cs.borderLeftWidth) > 0 && parseFloat(cs.borderTopWidth) > 0,
        tallest: Math.max(...rows.map(r => r.getBoundingClientRect().height)),
        w: Math.round(t.getBoundingClientRect().width) };
    }));
    ok(`[${theme}] 7 tables`, tb.length === 7, 'got ' + tb.length);
    const boxed = tb.filter(t => t.cls.startsWith('t-boxed'));
    ok(`[${theme}] 3 boxed executions`, boxed.length === 3, 'got ' + boxed.length);
    ok(`[${theme}] boxed cells really are bounded on all sides`, boxed.every(t => t.bordered));
    ok(`[${theme}] every table is 4 columns × 4 rows`, tb.every(t => t.cols === 4 && t.rows === 4));
    ok(`[${theme}] no row wraps to two lines`, tb.every(t => t.tallest < 56),
       tb.map(t => t.cls + ':' + Math.round(t.tallest)).join(' '));

    // ── contrast, measured across EVERY direction rather than a sample
    const card = await page.evaluate(() => getComputedStyle(document.querySelector('.dir')).backgroundColor);
    const probe = await page.evaluate(dirs => {
      const g = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
      const o = {};
      for (const d of dirs) o[d] = {
        axis:   g(`.d-${d} .sx-axis line`, 'stroke'),
        num:    g(`.d-${d} .sx-tick text`, 'fill'),
        ink:    g(`.d-${d} .sx-series`, 'color'),
        grid:   g(`.d-${d} .sx-grid line`, 'stroke'),
      };
      for (const n of ['ruler','statement','fine','band']) o['nl:'+n] = {
        axis: g(`.n-${n} .sx-nl-axis line`, 'stroke'),
        num:  g(`.n-${n} .sx-tick text`, 'fill'),
        ink:  g(`.n-${n} .sx-series`, 'color'),
      };
      for (const t of ['t-boxed','t-boxed-h','t-boxed-z']) o['tbl:'+t] = {
        rule: g(`.${t} tbody td`, 'borderTopColor'),
        text: g(`.${t} tbody td`, 'color'),
        headbg: g(`.${t} th`, 'backgroundColor'),
        headfg: g(`.${t} th`, 'color'),
      };
      return o;
    }, PLANE_DIRS);
    const grids = [];
    for (const [k, v] of Object.entries(probe)) {
      if (v.axis) ok(`[${theme}] ${k} axis ≥ 3:1`, cr(v.axis, card) >= 3, cr(v.axis, card).toFixed(2) + ':1');
      if (v.num)  ok(`[${theme}] ${k} numerals ≥ 4.5:1`, cr(v.num, card) >= 4.5, cr(v.num, card).toFixed(2) + ':1');
      if (v.ink)  ok(`[${theme}] ${k} figure ink ≥ 3:1`, cr(v.ink, card) >= 3, cr(v.ink, card).toFixed(2) + ':1');
      if (v.grid) grids.push(`${k} ${cr(v.grid, card).toFixed(2)}:1`);
      if (v.rule) ok(`[${theme}] ${k} cell rule ≥ 3:1`, cr(v.rule, card) >= 3, cr(v.rule, card).toFixed(2) + ':1');
      if (v.text) ok(`[${theme}] ${k} cell text ≥ 4.5:1`, cr(v.text, card) >= 4.5, cr(v.text, card).toFixed(2) + ':1');
      if (v.headfg && v.headbg) {
        const band = /rgba\(0, 0, 0, 0\)/.test(v.headbg)
          ? card : 'rgba(' + [over(parse(v.headbg), parse(card)).r,
                              over(parse(v.headbg), parse(card)).g,
                              over(parse(v.headbg), parse(card)).b, 1].join(',') + ')';
        ok(`[${theme}] ${k} header text on its band ≥ 4.5:1`, cr(v.headfg, band) >= 4.5,
           cr(v.headfg, band).toFixed(2) + ':1');
      }
    }

    // ── a framed plate must CONTAIN its figure. Every one of these was a real
    //    defect at exam size before the frame became the plate border.
    const frames = await page.evaluate(() => {
      const out = [];
      for (const host of document.querySelectorAll('[id^="f-"]')) {
        const svg = host.querySelector('svg'), fr = svg.querySelector('.sx-frame');
        if (!fr) continue;
        const f = fr.getBoundingClientRect();
        const inside = e => { const b = e.getBoundingClientRect();
          return b.left >= f.left - .5 && b.right <= f.right + .5 &&
                 b.top >= f.top - .5 && b.bottom <= f.bottom + .5; };
        const near = e => { const b = e.getBoundingClientRect();
          return Math.min(Math.abs(b.left - f.left), Math.abs(b.left - f.right)) < 8; };
        out.push({ id: host.id,
          strays: [...svg.querySelectorAll('.sx-tick text,.sx-axis-tip')]
                    .filter(e => !inside(e)).map(e => e.textContent),
          hugging: [...svg.querySelectorAll('.sx-grid line')]
                    .filter(l => l.getAttribute('x1') === l.getAttribute('x2') && near(l)).length });
      }
      return out;
    });
    for (const f of frames) {
      ok(`[${theme}] ${f.id}: nothing falls outside the plate border`,
         f.strays.length === 0, f.strays.join(','));
      ok(`[${theme}] ${f.id}: no gridline hugs the plate border`, f.hugging === 0, 'n=' + f.hugging);
    }

    // ── minus signs on a figure are U+2212, not the keyboard hyphen
    const hyphens = await page.evaluate(() => [...document.querySelectorAll('svg .sx-tick text')]
      .map(t => t.textContent).filter(s => s.includes('-')));
    ok(`[${theme}] figure numerals use a real minus sign`, hyphens.length === 0, hyphens.join(','));

    // ── four directions must sit in ONE row, and align with each other
    const rows = await page.evaluate(() => {
      const o = {};
      for (const g of document.querySelectorAll('.grid4')) {
        const cards = [...g.children];
        o[g.previousElementSibling.textContent.slice(0, 18)] = {
          tops: new Set(cards.map(c => Math.round(c.getBoundingClientRect().top))).size,
          bodyTops: new Set(cards.map(c =>
            Math.round(c.querySelector('.db').getBoundingClientRect().top))).size,
        };
      }
      return o;
    });
    for (const [k, v] of Object.entries(rows)) {
      ok(`[${theme}] "${k}" shows all four side by side`, v.tops === 1, v.tops + ' rows');
      ok(`[${theme}] "${k}" figures share a baseline`, v.bodyTops === 1, v.bodyTops + ' offsets');
    }

    if (theme === 'light') console.log('  grid contrast (reported, not asserted): ' + grids.join('  ·  '));

    // ── the two-tier grid engages only where the rhythm can be perceived. Both
    //    halves are checked: a lone heavy line is the defect, and a rule that
    //    never engages at all would be a silent regression rather than a fix.
    const tiers = await page.evaluate(() => {
      const { drawPlot } = globalThis.SiExplore;
      const count = (x1, y1) => {
        const svg = drawPlot({ xRange: [0, x1], yRange: [0, y1], curves: [{ points: [[0,0],[1,1]] }] },
                             { aspect: 'data', gridMode: 'major', figures: [{ mode: 'curve' }] });
        const g = [...svg.querySelectorAll('.sx-grid line')];
        const V = g.filter(l => l.getAttribute('x1') === l.getAttribute('x2'));
        return V.filter(l => /sx-major/.test(l.getAttribute('class') || '')).length;
      };
      const live = [];
      for (const host of document.querySelectorAll('[id^="f-"]')) {
        const svg = host.querySelector('svg');
        for (const axis of [['x1','x2'], ['y1','y2']]) {
          const g = [...svg.querySelectorAll('.sx-grid line')]
            .filter(l => l.getAttribute(axis[0]) === l.getAttribute(axis[1]));
          const m = g.filter(l => /sx-major/.test(l.getAttribute('class') || '')).length;
          if (m > 0) live.push(host.id + ':' + m);
        }
      }
      // the dense mode: half-steps under unit lines. THIS tier has the beats.
      const paper = document.querySelector('#f-geo-paper svg');
      const pg = [...paper.querySelectorAll('.sx-grid line')];
      return { coarse: Math.max(...[8, 40, 200].map(count)), live,
               fine: pg.filter(l => /sx-fine/.test(l.getAttribute('class') || '')).length,
               unit: pg.filter(l => !/sx-fine/.test(l.getAttribute('class') || '')).length };
    });
    ok(`[${theme}] no lone major line on any axis`,
       !tiers.live.some(s => s.endsWith(':1') || s.endsWith(':2')), tiers.live.join(','));
    ok(`[${theme}] the every-fifth tier stays off on a coarse grid`, tiers.coarse === 0,
       'majors ' + tiers.coarse);
    ok(`[${theme}] the dense mode still gives a real two-tier grid`,
       tiers.fine > tiers.unit && tiers.fine + tiers.unit >= 40,
       `${tiers.fine} fine vs ${tiers.unit} unit, ${tiers.fine + tiers.unit} total`);

    // ── an arrowhead claims the axis continues; only a plane's does
    const arrows = await page.evaluate(() => {
      const o = {};
      for (const host of document.querySelectorAll('[id^="f-"]')) {
        const svg = host.querySelector('svg');
        o[host.id] = [...svg.querySelectorAll('.sx-axis line')]
          .filter(l => l.getAttribute('marker-end')).length;
      }
      return o;
    });
    for (const [id, n] of Object.entries(arrows)) {
      const plane = /f-(fn|geo)-/.test(id);
      ok(`[${theme}] ${id} ${plane ? 'is a plane, so its axes carry arrows' : 'is a data frame, so its axes do not'}`,
         plane ? n === 2 : n === 0, 'arrowed axes: ' + n);
    }

    // ── a banded table whose bands cannot be seen is just an unbanded table.
    //    Measured on the two rows, not asserted from the stylesheet.
    const bands = await page.evaluate(() => {
      const o = {};
      for (const cls of ['t-boxed-z', 't-band', 't-boxed']) {
        const rows = [...document.querySelectorAll(`.${cls} tbody tr`)];
        const eff = r => {
          const td = getComputedStyle(r.querySelector('td')).backgroundColor;
          return /, 0\)$/.test(td) ? getComputedStyle(r).backgroundColor : td;
        };
        o[cls] = rows.slice(0, 2).map(eff);
      }
      return o;
    });
    const delta = (a, b) => {
      const A = over(parse(a), parse(card)), B = over(parse(b), parse(card));
      return Math.abs(lum(A) - lum(B));
    };
    ok(`[${theme}] the zebra rows in "grid + zebra" are actually distinguishable`,
       delta(bands['t-boxed-z'][0], bands['t-boxed-z'][1]) > .004,
       'Δluminance ' + delta(bands['t-boxed-z'][0], bands['t-boxed-z'][1]).toFixed(4));
    ok(`[${theme}] the banded table's bands are actually distinguishable`,
       delta(bands['t-band'][0], bands['t-band'][1]) > .004,
       'Δluminance ' + delta(bands['t-band'][0], bands['t-band'][1]).toFixed(4));
    ok(`[${theme}] and the un-banded boxed table has no bands`,
       delta(bands['t-boxed'][0], bands['t-boxed'][1]) < .0005);

    const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    ok(`[${theme}] page does not scroll sideways`, scroll[0] <= scroll[1] + 1, scroll.join(' vs '));

    const names = ['1-function-graphs','2-coordinate-geometry','3-scatter','4-number-lines','5-tables'];
    const secs = await page.$$('section.fam');
    for (let i = 0; i < secs.length; i++)
      await secs[i].screenshot({ path: path.join(OUT, names[i] + (theme === 'dark' ? '-dark' : '') + '.png') });
    if (theme === 'light') await page.screenshot({ path: path.join(OUT, '0-full.png'), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  if (fails.length) { console.log(fails.join('\n')); console.log(`\n${fails.length} FAILED, ${pass.length} passed`); process.exit(1); }
  console.log(pass.join('\n'));
  console.log(`\nALL ${pass.length} CHECKS PASSED`);
})();
