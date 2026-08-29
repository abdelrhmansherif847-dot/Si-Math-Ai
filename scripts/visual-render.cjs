/* THE RENDER SIDE of the visual suite: turn a canonical case into pixels, two
 * ways, under conditions that do not drift.
 *
 *   specimen — the case drawn straight through the shared renderer, on the
 *              shared grammar. This is what the design system says.
 *   exam     — the SAME case carried through exams.html as a real question on a
 *              real form: the Spine read model, renderForQuestion, the exam's
 *              own stylesheet, its column measure, its card. This is what a
 *              student gets.
 *
 * The whole point is that these two are compared as images. Property checks
 * could not tell them apart while the exam was drawing a plate a quarter
 * flatter than the specimen, because every property matched.
 *
 * DETERMINISM. Baselines are committed and compared on another machine, so
 * everything that could move is pinned here:
 *   - a fixed viewport and deviceScaleFactor
 *   - light theme, forced, and reduced motion
 *   - webfonts BLOCKED and a pinned local stack substituted. Google Fonts is
 *     unreachable from this environment anyway, and a baseline that depends on
 *     whether a font arrived is a baseline that fails for the wrong reason.
 */
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.png': 'image/png' };

// One stack, present in the image, named explicitly. Never a webfont.
const FONT_PIN = `
  * { font-synthesis: none !important; }
  :root {
    --font-display: "DejaVu Sans", "Liberation Sans", sans-serif !important;
    --font-serif:   "DejaVu Serif", "Liberation Serif", serif !important;
    --font-mono:    "DejaVu Sans Mono", "Liberation Mono", monospace !important;
  }`;

async function serve() {
  const server = http.createServer((q, r) => {
    const f = path.join(REPO, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, ''));
    if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      r.writeHead(404); r.end(); return;
    }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    r.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: 'http://127.0.0.1:' + server.address().port };
}

async function context(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 900, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  // No webfont, from anywhere, ever — including a host that would answer.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|\.(woff2?|ttf|otf|eot)(\?|$)/i,
                  (route) => route.abort());
  return ctx;
}



/* The specimen: the case drawn through renderForQuestion — the SAME entry point
 * the exam uses — on the shared grammar, with nothing else on the page.
 *
 * Calling renderForQuestion here rather than drawPlot directly is deliberate.
 * The first version of this harness passed the render options itself, and got
 * them subtly wrong: it handed `frame` as an option while the database keeps it
 * in the spec, so squared paper was drawn with the data family's aspect on this
 * side and the plane's on the exam side. The two paths would have been compared
 * and found different for a reason that had nothing to do with either page. Now
 * the only difference between the sides is the page around the figure, which is
 * the thing being tested. */
async function renderSpecimens(ctx, base, cases) {
  const p = await ctx.newPage();
  await p.setContent(`<!doctype html><meta charset="utf-8">
    <link rel="stylesheet" href="${base}/figure-system.css">
    <style>${FONT_PIN}
      body{margin:0;background:#fff}
      .case{width:702px;padding:0;background:#fff}</style>
    <div id="host"></div>
    <script src="${base}/exam-stimulus.js"></script>`, { waitUntil: 'load' });
  const failed = await p.evaluate((list) => {
    const R = globalThis.SiExamStimulus;
    const host = document.getElementById('host');
    const bad = [];
    for (const c of list) {
      const d = document.createElement('div');
      d.className = 'case'; d.id = 'case-' + c.id;
      try {
        d.appendChild(R.renderForQuestion({ id: 'q-' + c.id, reading: c.reading },
                                          { id: 'st-' + c.id, kind: c.kind, spec: c.spec }));
      } catch (e) { bad.push(c.id + ': ' + e.message); }
      host.appendChild(d);
    }
    return bad;
  }, cases);
  if (failed.length) throw new Error('specimen render failed:\n  ' + failed.join('\n  '));
  const out = {};
  for (const c of cases)
    out[c.id] = await p.locator('#case-' + c.id + ' > *').first().screenshot();
  await p.close();
  return out;
}

/* The exam: the same case, as a question on a form, through the shipped page. */
async function renderThroughExam(ctx, base, cases) {
  const form = { id: 'F', code: 'VISUAL', exam_code: 'SAT', title: 'visual contract',
                 status: 'draft', variant_policy: null };
  const sections = [{ id: 'S', form_id: 'F', ordinal: 1, variant_id: null, label: 'Module 1',
                      question_count: cases.length, duration_minutes: 35,
                      calculator_allowed: false }];
  const stimuli = cases.map((c) => ({ id: 'st-' + c.id, form_id: 'F', kind: c.kind,
    label: c.id, body: null, spec: c.spec, media_ref: null, media_kind: null }));
  const questions = cases.map((c, i) => ({
    id: 'q-' + c.id, section_id: 'S', ordinal: i + 1,
    prompt: 'Visual contract ' + c.id + '.', question_format: 'mcq',
    choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }],
    correct_answer: 'A', explanation: null, difficulty: 'medium',
    topic_id: 'ALGEBRA', subtopic_id: 'ALG_006', stimulus_id: 'st-' + c.id,
    reading: c.reading || null }));

  const p = await ctx.newPage();
  await p.addInitScript(({ data, pin }) => {
    const T = { exam_forms: [data.form], exam_form_sections: data.sections,
                exam_questions: data.questions, exam_stimuli: data.stimuli,
                profiles: [{ id: 'a', role: 'admin', is_admin: true }] };
    function q(t) { let rows = (T[t] || []).slice(); const a = { select: () => a,
      eq: (c, v) => { rows = rows.filter((r) => String(r[c]) === String(v)); return a; },
      in: (c, vs) => { rows = rows.filter((r) => vs.map(String).includes(String(r[c]))); return a; },
      order: () => a, then: (f) => Promise.resolve({ data: rows, error: null }).then(f),
      maybeSingle: () => Promise.resolve({ data: rows[0] || null, error: null }),
      single: () => Promise.resolve({ data: rows[0] || null, error: null }) }; return a; }
    window.supabase = { createClient: () => ({ from: q,
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'a' } } }) } }) };
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style'); s.textContent = pin;
      document.head.appendChild(s);
    });
  }, { data: { form, sections, questions, stimuli }, pin: FONT_PIN });

  await p.goto(base + '/exams.html', { waitUntil: 'load' });
  await p.waitForSelector('.ex-pick button');
  await p.click('.ex-pick button');
  await p.waitForSelector('.ex-card .ex-stem');
  const out = {};
  for (let i = 0; i < cases.length; i++) {
    await p.click('.xc-n-toggle');
    await p.click('.xc-q >> nth=' + i);
    await p.waitForSelector('.ex-fig svg, .ex-fig table');
    // The figure itself, so the comparison is about the drawing and not about
    // the card's padding. Both sides are shot the same way.
    out[cases[i].id] = await p.locator('.ex-fig > *').first().screenshot();
  }
  await p.close();
  return out;
}

/* Chromium, with the three things that make a screenshot reproducible.
 *
 * --disable-lcd-text is the one that mattered. The exam card composites its
 * figure onto a layer where Chromium uses subpixel (RGB) antialiasing, while the
 * specimen page gets grayscale — so the identical table came out with orange and
 * blue fringes on one side and neutral edges on the other, and reported half a
 * percent of its glyphs as changed. Every measured property matched, because
 * this is a rasteriser mode rather than anything in the CSS. Grayscale on both
 * sides is also what a baseline committed on one machine and compared on
 * another needs.
 */
async function launch() {
  return chromium.launch({ args: [
    '--disable-lcd-text',              // grayscale antialiasing, both sides
    '--disable-font-subpixel-positioning',
    '--force-color-profile=srgb',
  ] });
}

module.exports = { serve, context, renderSpecimens, renderThroughExam, chromium, launch,
                   FONT_PIN, REPO };
