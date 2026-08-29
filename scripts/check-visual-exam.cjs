#!/usr/bin/env node
/* THE REAL EXAM, IN PIXELS.
 *
 *   node scripts/check-visual-exam.cjs <form-fixture.json>
 *
 * check-visual-fidelity.cjs proves the design system draws what was approved,
 * on synthetic mathematics. This proves the same thing about the content
 * students will actually see, and it is the one that matters: a figure family
 * can be right on a specimen and wrong on the question that uses it.
 *
 * NO BASELINE, AND NOT BY OVERSIGHT. This repository is PUBLIC and the exam
 * content must never enter it, which rules out committing a picture of an exam
 * figure. So nothing here is compared against a stored image. Instead every
 * real figure is rendered TWICE — once through exams.html, once through the
 * design system's own path — and the two are compared with each other. That
 * needs no stored pixels at all, and it answers the question that is actually
 * at issue: does the exam draw the figure the design system specifies?
 *
 * Renders go to tests/visual-out/exam/, which .gitignore excludes. Look at
 * them; do not commit them.
 *
 * On top of the comparison, each family is checked against the one thing its
 * decision says about its APPEARANCE that a class name cannot express:
 * colour is spent on the data family and nowhere else. That is measured off
 * the pixels, so a figure that carries every right class and still comes out
 * looking like a different family is visible here.
 */
const fs = require('node:fs');
const path = require('node:path');
const P = require('./png.cjs');
const V = require('./visual-render.cjs');

const FIXTURE = process.argv[2];
if (!FIXTURE) { console.error('usage: check-visual-exam.cjs <form-fixture.json>'); process.exit(2); }
const OUT = path.join(V.REPO, 'tests', 'visual-out', 'exam');
const FAIL_RATIO = 0.0015;

let pass = 0, fail = 0;
const ok = (m, d) => { pass++; console.log('PASS  ' + m + (d ? '  ' + d : '')); };
const no = (m, d) => { fail++; console.log('FAIL  ' + m + (d ? '\n      ' + d : '')); };
const pct = (r) => (r * 100).toFixed(3) + '%';

/* How much colour is in this figure, and what colour. Greys have no chroma; the
 * data hue has a lot. Measured rather than asserted from a class, because
 * "carries .sx-fam-data" and "looks like the data family" are the two things
 * this whole exercise keeps finding are not the same statement. */
function chroma(img) {
  let peak = 0, at = null, n = 0;
  for (let p = 0; p < img.width * img.height; p++) {
    const r = img.data[p * 3], g = img.data[p * 3 + 1], b = img.data[p * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const c = mx - mn;
    if (c > 40) n++;
    if (c > peak) { peak = c; at = [r, g, b]; }
  }
  return { peak, at, coloured: n / (img.width * img.height) };
}

(async () => {
  const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const byStim = Object.fromEntries((data.stimuli || []).map((s) => [s.id, s]));
  const secOrd = Object.fromEntries((data.sections || []).map((s) => [s.id, s.ordinal]));

  // One representative per family actually present in the form, taken as the
  // FIRST question of module 1 that uses it — not hand-picked, so the set moves
  // with the content instead of being curated around what passes.
  const mod1 = (data.questions || [])
    .filter((q) => secOrd[q.section_id] === 1)
    .sort((a, b) => a.ordinal - b.ordinal);
  const famOf = (st) => {
    if (!st) return null;
    if (st.kind === 'table') return 'table';
    if (st.kind === 'number_line') return 'number line';
    if (st.kind === 'chart') return 'data';
    const f = (st.spec || {}).frame;
    return f === 'plane' ? 'coordinate geometry' : f === 'graph' ? 'function graph' : f === 'data' ? 'data' : null;
  };
  const reps = [];
  const seen = new Set();
  mod1.forEach((q, i) => {
    const st = byStim[q.stimulus_id];
    const fam = famOf(st);
    if (!fam || seen.has(fam)) return;
    seen.add(fam);
    reps.push({ n: i + 1, fam, q, st });
  });
  if (!reps.length) { console.error('no figures in module 1 of this form'); process.exit(2); }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const { server, base } = await V.serve();
  const browser = await V.launch();
  const ctx = await V.context(browser);

  // the design system's own render of these exact rows
  const cases = reps.map((r) => ({ id: 'q' + r.n, kind: r.st.kind,
                                   spec: r.st.spec, reading: r.q.reading || null }));
  const specimen = await V.renderSpecimens(ctx, base, cases);

  // and the exam's, driven through the real page on the real form
  const exam = await V.renderExamForm(ctx, base, data, reps.map((r) => r.n));

  await browser.close();
  server.close();

  const rows = [];
  for (const r of reps) {
    const id = 'q' + r.n;
    fs.writeFileSync(path.join(OUT, id + '.exam.png'), exam[r.n]);
    fs.writeFileSync(path.join(OUT, id + '.specimen.png'), specimen[id]);

    const d = P.alignedDiff(P.decode(specimen[id]), P.decode(exam[r.n]));
    if (d.image) P.write(path.join(OUT, id + '.diff.png'), d.image);
    const t = `${r.fam} · Q${r.n} — the exam draws what the design system specifies`;
    d.ratio <= FAIL_RATIO ? ok(t, pct(d.ratio)) : no(t, `${pct(d.ratio)} of pixels differ ${d.cropped}`);

    // colour is spent on the data family and nowhere else
    const c = chroma(P.decode(exam[r.n]));
    const isData = r.fam === 'data';
    const t2 = `${r.fam} · Q${r.n} — ${isData ? 'carries the data hue' : 'is drawn in ink, with no hue'}`;
    if (isData) (c.peak > 60 ? ok(t2, `peak chroma ${c.peak}`) : no(t2, `peak chroma only ${c.peak} — the observations should be the most saturated thing here`));
    else (c.coloured < 0.001 ? ok(t2, `${pct(c.coloured)} coloured`) : no(t2, `${pct(c.coloured)} of pixels carry a hue (rgb ${c.at}) — colour belongs to the data family alone`));

    rows.push({ id, n: r.n, fam: r.fam, ratio: d.ratio, chroma: c.peak });
  }

  fs.writeFileSync(path.join(OUT, 'index.html'),
`<!doctype html><meta charset="utf-8"><title>DSAT-2026-A figures</title>
<style>body{font:14px system-ui;margin:0;padding:26px;background:#eef1f5;color:#111820}
h1{font-size:19px;margin:0 0 4px}p.s{color:#445264;margin:0 0 20px}
.c{background:#fff;border:1px solid #dde3ea;border-radius:6px;padding:16px;margin:0 0 18px}
h2{font-size:15px;margin:0 0 10px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
img{width:100%;border:1px solid #eef1f5}figure{margin:0}
figcaption{font-size:11.5px;color:#6b7a8c;margin:5px 0 0}
b.bad{color:#b3261e}b.good{color:#1c6b4a}</style>
<h1>DSAT-2026-A — one real question per family</h1>
<p class="s">The design system's render, the exam's render, and the difference between them.
Red is a pixel that moved. <b>Exam content: not committed, and not to be.</b></p>
${rows.map((r) => `<div class="c"><h2>${r.fam} — Question ${r.n}
<b class="${r.ratio > FAIL_RATIO ? 'bad' : 'good'}">${pct(r.ratio)}</b></h2>
<div class="g">
<figure><img src="${r.id}.specimen.png"><figcaption>design system</figcaption></figure>
<figure><img src="${r.id}.exam.png"><figcaption>exams.html</figcaption></figure>
<figure><img src="${r.id}.diff.png"><figcaption>difference</figcaption></figure>
</div></div>`).join('\n')}`);

  console.log(`\n${pass}/${pass + fail} checks passed on ${reps.length} real questions`);
  console.log('look at them: tests/visual-out/exam/index.html');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('harness error:', e); process.exit(2); });
