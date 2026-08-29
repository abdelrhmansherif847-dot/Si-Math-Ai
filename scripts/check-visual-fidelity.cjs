#!/usr/bin/env node
/* THE VISUAL CONTRACT.
 *
 *   node scripts/check-visual-fidelity.cjs            compare against baselines
 *   node scripts/check-visual-fidelity.cjs --approve  re-record them
 *
 * Two questions, both answered in pixels rather than in properties:
 *
 *   1. Does the shared renderer still draw the approved appearance?
 *      Each canonical case is compared with its committed baseline.
 *
 *   2. Does the exam draw the same thing the design system does?
 *      The same case is carried through exams.html — the Spine read model,
 *      renderForQuestion, the exam stylesheet, the exam's column — and the two
 *      images are compared with each other.
 *
 * WHY IMAGES. This suite exists because the property checks were green through
 * three separate visual regressions: an exam plate a quarter flatter than the
 * specimen, squared paper silently ruled every two units instead of every one,
 * and a specimen sheet whose axes were 1.75 round-capped while the exam shipped
 * 1.2 butt-capped. Every one of those had matching font sizes, matching colours
 * and matching selectors. None of them survives a pixel comparison.
 *
 * --approve re-records the baselines. It is deliberately a separate, explicit
 * run: a baseline is an approval, and approving is a human act. Look at the
 * images it writes before you commit them.
 */
const fs = require('node:fs');
const path = require('node:path');
const P = require('./png.cjs');
const V = require('./visual-render.cjs');

const REPO = V.REPO;
const BASE = path.join(REPO, 'tests', 'visual-baselines');
const OUT = path.join(REPO, 'tests', 'visual-out');
const APPROVE = process.argv.includes('--approve');

// A figure is a few thousand pixels of line work on a lot of white. A moved
// line, a changed weight or a reshaped plate lights up whole percent; a
// re-rasterised glyph edge does not clear the per-channel tolerance at all.
const FAIL_RATIO = 0.0015;      // 0.15% of the frame

let pass = 0, fail = 0;
const rows = [];
const ok = (m, d) => { pass++; console.log('PASS  ' + m + (d ? '  ' + d : '')); };
const no = (m, d) => { fail++; console.log('FAIL  ' + m + (d ? '\n      ' + d : '')); };

const pct = (r) => (r * 100).toFixed(3) + '%';

(async () => {
  const cases = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'figure-specimens.json'), 'utf8')).cases;
  fs.mkdirSync(BASE, { recursive: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const { server, base } = await V.serve();
  const browser = await V.launch();
  const ctx = await V.context(browser);

  const spec = await V.renderSpecimens(ctx, base, cases);
  const exam = await V.renderThroughExam(ctx, base, cases);

  await browser.close();
  server.close();

  if (APPROVE) {
    for (const c of cases) fs.writeFileSync(path.join(BASE, c.id + '.png'), spec[c.id]);
    console.log(`\nrecorded ${cases.length} baselines into tests/visual-baselines/`);
    console.log('LOOK AT THEM before committing — a baseline is an approval.');
    process.exit(0);
  }

  for (const c of cases) {
    const bl = path.join(BASE, c.id + '.png');
    fs.writeFileSync(path.join(OUT, c.id + '.specimen.png'), spec[c.id]);
    fs.writeFileSync(path.join(OUT, c.id + '.exam.png'), exam[c.id]);

    // 1 — the renderer still draws what was approved
    if (!fs.existsSync(bl)) {
      no(`${c.id} · has an approved baseline`, 'run --approve, then look at it');
      rows.push({ id: c.id, label: c.label, baseline: null, cross: null });
      continue;
    }
    const d1 = P.alignedDiff(P.read(bl), P.decode(spec[c.id]));
    if (d1.image) P.write(path.join(OUT, c.id + '.baseline-diff.png'), d1.image);
    const t1 = `${c.family} · ${c.label} — matches the approved baseline`;
    d1.ratio <= FAIL_RATIO ? ok(t1, pct(d1.ratio)) : no(t1, `${pct(d1.ratio)} of pixels moved ${d1.note}${d1.cropped}`);

    // 2 — and the exam draws the same figure the design system does
    const d2 = P.alignedDiff(P.decode(spec[c.id]), P.decode(exam[c.id]));
    if (d2.image) P.write(path.join(OUT, c.id + '.exam-diff.png'), d2.image);
    const t2 = `${c.family} · ${c.label} — the exam draws the specimen`;
    d2.ratio <= FAIL_RATIO ? ok(t2, pct(d2.ratio)) : no(t2, `${pct(d2.ratio)} of pixels differ ${d2.note}${d2.cropped}`);

    rows.push({ id: c.id, label: c.label, family: c.familyName, decision: c.decision,
                baseline: d1.ratio, cross: d2.ratio });
  }

  // A page to look at, because the instruction is to look.
  fs.writeFileSync(path.join(OUT, 'index.html'),
`<!doctype html><meta charset="utf-8"><title>Visual contract</title>
<style>body{font:14px system-ui;margin:0;padding:26px;background:#eef1f5;color:#111820}
h1{font-size:19px;margin:0 0 4px}p.sub{color:#445264;margin:0 0 22px}
.c{background:#fff;border:1px solid #dde3ea;border-radius:6px;padding:16px;margin:0 0 18px}
h2{font-size:15px;margin:0 0 2px}.m{color:#6b7a8c;font-size:12.5px;margin:0 0 12px}
.g{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.g figure{margin:0}.g img{width:100%;border:1px solid #eef1f5;background:#fff}
figcaption{font-size:11.5px;color:#6b7a8c;margin:5px 0 0}
b.bad{color:#b3261e}b.good{color:#1c6b4a}</style>
<h1>Figure visual contract</h1>
<p class="sub">Left to right: the approved baseline, what the renderer draws now, what
<code>exams.html</code> draws, and the two differences. Red is a pixel that moved.</p>
${rows.map((r) => `<div class="c"><h2>${r.family || ''} — ${r.label}</h2>
<p class="m"><code>${r.id}</code> &middot; ${r.decision || ''} &middot;
baseline <b class="${r.baseline > FAIL_RATIO ? 'bad' : 'good'}">${r.baseline == null ? 'none' : pct(r.baseline)}</b>
&middot; exam vs specimen <b class="${r.cross > FAIL_RATIO ? 'bad' : 'good'}">${r.cross == null ? '—' : pct(r.cross)}</b></p>
<div class="g">
<figure><img src="../visual-baselines/${r.id}.png"><figcaption>approved baseline</figcaption></figure>
<figure><img src="${r.id}.specimen.png"><figcaption>renderer now</figcaption></figure>
<figure><img src="${r.id}.exam.png"><figcaption>exams.html</figcaption></figure>
<figure><img src="${r.id}.baseline-diff.png"><figcaption>vs baseline</figcaption></figure>
</div></div>`).join('\n')}`);

  console.log(`\n${pass}/${pass + fail} visual checks passed`);
  console.log('look at them: tests/visual-out/index.html');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('harness error:', e); process.exit(2); });
