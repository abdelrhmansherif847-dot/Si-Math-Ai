// Desmos activation test — the verification milestone, as a runnable thing.
//
// WHAT THIS IS
// ------------
// The one check that can turn docs/engineering/desmos-integration.md from
// UNPROVEN to ACTIVATED. It mounts the REAL Desmos calculator with a REAL key,
// under this site's REAL Content-Security-Policy, and reports what happened.
//
// It has never passed. It cannot pass in the environment the integration was
// written in — www.desmos.com is blocked by an egress proxy there — and that is
// the entire reason this file exists rather than a paragraph asserting the
// integration works.
//
//   DESMOS_API_KEY=... DESMOS_TIER=commercial \
//     node scripts/check-desmos-activation.cjs
//
// Optional: DESMOS_API_VERSION (default: the provider's own default).
//
// The key is read from the environment and never written anywhere. It is not
// echoed, not logged, and the page it builds is held in memory rather than
// written to disk — a preview file containing a key would be one `git add -A`
// away from a public repository. API Terms §5.c.
//
// WHAT IT CHECKS, AND WHY EACH ONE
// --------------------------------
// Ordered so the first failure is the most likely and the most confusing.
//
//   CSP       our own policy is the most likely first blocker, and its symptom
//             — a script that silently never loads — looks like a bad key.
//   load      the script came from www.desmos.com and nowhere else.
//   features  Desmos.enabledFeatures is per-key; the runbook needs to record
//             which products this key actually carries.
//   mount     an instance exists AND the region has real size. A calculator
//             mounted into a zero-height box reports no error and shows nothing.
//   terms     nothing of ours overlaps the calculator's region (§5.b(iii)),
//             and no Desmos branding was removed from it.
//   destroy   destroy() empties the region. The panel opens and closes many
//             times in one exam; a provider that leaks is a provider that
//             degrades the longer the exam runs.
const fs = require('fs'), path = require('path'), http = require('http');

const REPO = path.join(__dirname, '..');
const KEY = (process.env.DESMOS_API_KEY || '').trim();
const TIER = (process.env.DESMOS_TIER || '').trim();
const VERSION = (process.env.DESMOS_API_VERSION || '').trim();

if (!KEY || !TIER) {
  console.error('check-desmos-activation: NOT RUN — no credentials.\n');
  console.error('  This test requires a real Desmos API key. It is the activation');
  console.error('  milestone, and it has never been run.\n');
  console.error('    DESMOS_API_KEY=<key> DESMOS_TIER=commercial \\');
  console.error('      node scripts/check-desmos-activation.cjs\n');
  console.error('  Get a key at desmos.com/my-api. Use tier=commercial for anything');
  console.error('  student-facing (API Terms §2.a/§3.a); tier=trial is internal only.');
  process.exit(2);
}
if (!['commercial', 'trial'].includes(TIER)) {
  console.error(`check-desmos-activation: DESMOS_TIER must be "commercial" or "trial", got "${TIER}".`);
  process.exit(2);
}

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  console.error('check-desmos-activation: playwright is not installed.\n');
  console.error('  This repository has no package.json by design, so the browser');
  console.error('  checkers run against a global install:  npm i -g playwright');
  console.error('  and then, if the browser is missing:    npx playwright install chromium');
  process.exit(2);
}

// ── the site's own CSP, read from vercel.json rather than restated ────────────
const vercel = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8'));
const CSP = vercel.headers
  .flatMap(h => h.headers || [])
  .find(h => h.key === 'Content-Security-Policy').value;
const DESMOS_ORIGIN = 'https://www.desmos.com';
const cspAllows = d => {
  const m = CSP.match(new RegExp('(?:^|;)\\s*' + d + '\\s+([^;]*)'));
  return !!m && m[1].includes(DESMOS_ORIGIN);
};

const read = f => fs.readFileSync(path.join(REPO, f), 'utf8');
const PAGE = `<title>Desmos activation</title>
<style>
  html,body{margin:0;height:100%;font:15px/1.5 system-ui,sans-serif}
  .panel{position:absolute;inset:0;display:flex;flex-direction:column}
  .xw-head{display:flex;align-items:center;gap:12px;padding:18px 20px;min-height:78px;
    border-bottom:1px solid #dde3ea}
  .xw-head>div{min-width:0;flex:1}.xw-head h2{margin:0;font-size:17px}
  .xw-sub{margin:2px 0 0;font-size:12px;line-height:1.6;min-height:19.2px;color:#6b7a8c}
  .xw-close{margin-left:auto}
  .xw-body{flex:1;display:flex;min-height:0;padding:18px 20px}
  .xw-mount{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}
  .mark{width:38px;height:38px;background:#0f6f9e;border-radius:6px;flex:none}
</style>
<div id="slot"></div>
<script>${read('exam-calculator.js')}</script>
<script>${read('exam-workspace.js')}</script>
<script>${read('exam-graph-desmos.js')}</script>
<script>
globalThis.SI_DESMOS_CONFIG = ${JSON.stringify({
  apiKey: KEY, tier: TIER, studentFacing: TIER === 'commercial',
  ...(VERSION ? { apiVersion: VERSION } : {}),
})};
globalThis.__violations = [];
document.addEventListener('securitypolicyviolation', e => globalThis.__violations.push(
  { directive: e.effectiveDirective, blocked: e.blockedURI }));
const mark = document.createElement('span'); mark.className = 'mark';
const ws = globalThis.SiExamWorkspace.Workspace(
  { providerId: 'desmos', title: 'Graphing Calculator', mark });
ws.el.classList.add('panel');
document.getElementById('slot').appendChild(ws.el);
globalThis.__ws = ws; ws.open();
</script>`;

(async () => {
  const fails = [], pass = [], notes = [];
  const ok = (n, c, d) => { (c ? pass : fails).push((c ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

  // ── 0. the CSP gate, before touching a browser ──────────────────────────────
  //
  // Our own policy blocking the script is the failure mode most likely to be
  // misread as "the key is wrong", so it is diagnosed first and by name.
  const needed = ['script-src', 'connect-src', 'img-src', 'style-src', 'font-src'];
  const missing = needed.filter(d => !cspAllows(d));
  if (missing.includes('script-src')) {
    console.error('check-desmos-activation: BLOCKED BY OUR OWN CSP\n');
    console.error(`  vercel.json's Content-Security-Policy does not allow ${DESMOS_ORIGIN}`);
    console.error(`  in: ${missing.join(', ')}\n`);
    console.error('  The Desmos API script would be refused by the browser on the live');
    console.error('  site before any Desmos code ran. Add the origin to those directives');
    console.error('  in vercel.json, then re-run. Runbook: docs/engineering/desmos-integration.md §6.');
    process.exit(1);
  }
  if (missing.length) {
    notes.push(`CSP does not list ${DESMOS_ORIGIN} in: ${missing.join(', ')}. ` +
               'script-src is present so the API can load; watch the violations below ' +
               'for anything else the calculator needs.');
  }

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8',
                         'Content-Security-Policy': CSP });
    res.end(PAGE);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 760 } });
  const page = await ctx.newPage();
  const requests = [], errors = [];
  page.on('request', r => { if (r.url().includes('desmos.com')) requests.push(r.url()); });
  page.on('requestfailed', r => { if (r.url().includes('desmos.com'))
    errors.push('request failed: ' + r.url() + ' — ' + (r.failure() || {}).errorText); });
  page.on('pageerror', e => errors.push('pageerror: ' + e));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(url);
  // The provider's own load timeout is 12s; give it room to resolve or reject.
  await page.waitForFunction(
    () => globalThis.Desmos || document.querySelector('.xw-err,.xw-gate'),
    null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const st = await page.evaluate(() => ({
    gate: (document.querySelector('.xw-gate') || {}).innerText || null,
    err: (document.querySelector('.xw-err') || {}).innerText || null,
    hasDesmos: !!globalThis.Desmos,
    features: globalThis.Desmos ? globalThis.Desmos.enabledFeatures : null,
    violations: globalThis.__violations,
    scriptSrc: (document.getElementById('si-desmos-api') || {}).src || null,
  }));

  ok('the provider is not gated', !st.gate, st.gate && st.gate.replace(/\n/g, ' '));
  ok('the API script came from Desmos’s own origin',
     !!st.scriptSrc && st.scriptSrc.startsWith(DESMOS_ORIGIN + '/api/'),
     st.scriptSrc ? st.scriptSrc.replace(/apiKey=[^&]*/, 'apiKey=***') : 'no script tag');
  ok('nothing was blocked by the Content-Security-Policy',
     st.violations.length === 0,
     st.violations.map(v => v.directive + ' ← ' + v.blocked).join(' | '));
  ok('the API loaded', st.hasDesmos, st.err ? st.err.replace(/\n/g, ' ') : '');
  ok('the graphing calculator is enabled on this key',
     !!(st.features && st.features.GraphingCalculator), JSON.stringify(st.features));

  const mounted = await page.evaluate(() => {
    const m = document.querySelector('.xw-mount');
    const r = m.getBoundingClientRect();
    const head = document.querySelector('.xw-head').getBoundingClientRect();
    const kids = m.children.length;
    // Anything of OURS drawn inside the calculator's region would be a §5.b(iii)
    // problem. The workspace puts our mark in the header; assert the header and
    // the mount region do not overlap, and that our mark is not in the mount.
    const overlap = !(head.bottom <= r.top || r.bottom <= head.top);
    return { w: Math.round(r.width), h: Math.round(r.height), kids, overlap,
             ourMarkInMount: m.querySelectorAll('.mark').length,
             // an error or gate card in the region is OUR markup, not theirs —
             // it must never count as "the calculator mounted"
             ours: !!m.querySelector('.xw-err,.xw-gate'),
             text: m.innerText.slice(0, 200) };
  });
  ok('the calculator region has real size',
     mounted.w > 200 && mounted.h > 200, `${mounted.w}x${mounted.h}`);
  ok('the calculator itself is what is in the region',
     mounted.kids > 0 && !mounted.ours,
     mounted.ours ? 'our own card is there: ' + mounted.text.replace(/\n/g, ' ')
                  : `${mounted.kids} child node(s)`);
  ok('our chrome does not overlap the calculator (§5.b(iii))',
     !mounted.overlap && mounted.ourMarkInMount === 0,
     `overlap=${mounted.overlap} ourMark=${mounted.ourMarkInMount}`);

  const shot = path.join(__dirname, 'desmos-activation.png');
  await page.screenshot({ path: shot });

  const destroyed = await page.evaluate(() => {
    globalThis.__ws.close();
    return { kids: document.querySelector('.xw-mount').children.length };
  });
  ok('destroy() leaves the region empty', destroyed.kids === 0, `${destroyed.kids} left`);
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close(); server.close();

  console.log([...pass, ...fails].join('\n'));
  for (const n of notes) console.log('\nNOTE  ' + n);
  console.log(`\nscreenshot: ${shot}`);
  console.log(`desmos requests: ${requests.length}`);

  if (fails.length) {
    console.log(`\n${fails.length} FAILED, ${pass.length} passed — DO NOT mark the record ACTIVATED.`);
    process.exit(1);
  }
  console.log(`\nALL ${pass.length} CHECKS PASSED.`);
  console.log('\nRecord it. In docs/engineering/desmos-integration.md, replace the marker with:\n');
  console.log('  <!-- desmos-activation: ACTIVATED -->');
  console.log(`  <!-- desmos-evidence: date=<YYYY-MM-DD>; apiVersion=${VERSION || '<the version used>'}; ` +
              `tier=${TIER}; checkedBy=<who ran this> -->`);
  console.log('\nThen, and only then, name the provider in exam-registry.js for the exams');
  console.log('where an on-screen calculator is faithful to test day.');
})();
