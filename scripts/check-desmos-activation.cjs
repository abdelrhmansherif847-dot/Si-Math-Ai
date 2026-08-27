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

// ── two modes ────────────────────────────────────────────────────────────────
//
//   deployed  DESMOS_ACTIVATION_URL=https://www.si-math-ai.com/mock-exam.html
//             Drives the REAL page as a student would: opens the calculator
//             from the real launcher, with the key the deployed /api/desmos-config
//             supplies. No key is needed locally, and none is handled here.
//             This is the end-to-end check.
//
//   local     DESMOS_API_KEY=… DESMOS_TIER=commercial
//             Mounts the provider on a synthetic page under the CSP read from
//             vercel.json. Useful before deploying, or to isolate a failure.
//
const URL_MODE = (process.env.DESMOS_ACTIVATION_URL || '').trim();

if (!URL_MODE && (!KEY || !TIER)) {
  console.error('check-desmos-activation: NOT RUN. It has never been run.\n');
  console.error('  DEPLOYED mode — the activation milestone. Drives the live page as a');
  console.error('  student does; the key comes from the deployed /api/desmos-config and');
  console.error('  is never handled here:\n');
  console.error('    DESMOS_ACTIVATION_URL=https://www.si-math-ai.com/mock-exam.html \\');
  console.error('      node scripts/check-desmos-activation.cjs\n');
  console.error('  LOCAL mode — mounts the provider on a synthetic page, to isolate a');
  console.error('  failure before deploying. Not the milestone:\n');
  console.error('    DESMOS_API_KEY=<key> DESMOS_TIER=commercial \\');
  console.error('      node scripts/check-desmos-activation.cjs\n');
  console.error('  Either way, run it from a network that can reach www.desmos.com.');
  process.exit(2);
}
if (!URL_MODE && !['commercial', 'trial'].includes(TIER)) {
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

// ── deployed mode ────────────────────────────────────────────────────────────
//
// Drives the live page the way a student does. Nothing here knows the key; the
// deployed /api/desmos-config supplies it to the browser, and this process never
// reads it. The one assertion made about the key is that the endpoint returned
// one — never its value, its length or any part of it.
async function runDeployed({ ok, fails, pass }) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], desmosReqs = [];
  let configStatus = null, configShape = null;

  page.on('response', async r => {
    const u = r.url();
    if (u.includes('/api/desmos-config')) {
      configStatus = r.status();
      try {
        const body = await r.text();
        // The body contains the key. It is parsed for SHAPE and immediately
        // discarded; nothing about its value leaves this block.
        const m = body.match(/globalThis\.SI_DESMOS_CONFIG\s*=\s*(\{[\s\S]*?\});/);
        const cfg = m ? JSON.parse(m[1]) : null;
        configShape = cfg ? {
          hasKey: typeof cfg.apiKey === 'string' && cfg.apiKey.trim().length > 0,
          tier: cfg.tier || null,
          studentFacing: cfg.studentFacing === true,
          apiVersion: cfg.apiVersion || '(provider default)',
          fields: Object.keys(cfg).sort().join(','),
        } : { hasKey: false, tier: null, studentFacing: false, fields: '' };
      } catch (e) { configShape = null; }
    }
    if (u.includes('desmos.com')) desmosReqs.push({ url: u.split('?')[0], status: r.status() });
  });
  page.on('requestfailed', r => { if (r.url().includes('desmos.com'))
    errors.push('request failed: ' + r.url().split('?')[0] + ' — ' + (r.failure() || {}).errorText); });
  page.on('pageerror', e => errors.push('pageerror: ' + e));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.addInitScript(() => {
    globalThis.__violations = [];
    document.addEventListener('securitypolicyviolation', e => globalThis.__violations.push(
      { directive: e.effectiveDirective, blocked: e.blockedURI }));
  });

  let resp = null;
  try {
    resp = await page.goto(URL_MODE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    await browser.close();
    console.error(`check-desmos-activation: could not reach ${URL_MODE}`);
    console.error(`  ${(e && e.message ? e.message : e).split('\n')[0]}`);
    console.error('  Run this from a network that can reach both the site and www.desmos.com.');
    process.exit(2);
  }
  ok('the page loads', !!resp && resp.ok(), resp ? String(resp.status()) : 'no response');
  await page.waitForTimeout(2000);

  ok('/api/desmos-config responded', configStatus === 200, String(configStatus));
  ok('it returned a key (value never read)', !!(configShape && configShape.hasKey),
     configShape ? `fields=${configShape.fields}` : 'no parseable config');
  ok('the tier is commercial (API Terms §3.a for student-facing use)',
     !!configShape && configShape.tier === 'commercial',
     configShape ? String(configShape.tier) : '—');
  if (configShape) notes.push(`config: tier=${configShape.tier} studentFacing=${configShape.studentFacing} `
    + `apiVersion=${configShape.apiVersion}`);

  // ── open the calculator the way a student does ─────────────────────────────
  const launcher = await page.$('[data-si-calculator-open]');
  ok('the exam page offers a calculator control', !!launcher,
     launcher ? '' : 'no [data-si-calculator-open] on the page — either the exam '
                   + 'does not name a provider, or the launcher is not wired');
  if (!launcher) { await browser.close(); return report({ fails, pass }); }

  await launcher.click();
  await page.waitForSelector('.xw-panel.is-open', { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(
    () => globalThis.Desmos || document.querySelector('.xw-err,.xw-gate'),
    null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const st = await page.evaluate(() => {
    const m = document.querySelector('.xw-mount');
    const r = m ? m.getBoundingClientRect() : { width: 0, height: 0 };
    const head = document.querySelector('.xw-head');
    const hr = head ? head.getBoundingClientRect() : null;
    return {
      panelOpen: !!document.querySelector('.xw-panel.is-open'),
      gate: (document.querySelector('.xw-gate') || {}).innerText || null,
      err: (document.querySelector('.xw-err') || {}).innerText || null,
      hasDesmos: !!globalThis.Desmos,
      features: globalThis.Desmos ? globalThis.Desmos.enabledFeatures : null,
      violations: globalThis.__violations || [],
      w: Math.round(r.width), h: Math.round(r.height),
      kids: m ? m.children.length : 0,
      ours: !!(m && m.querySelector('.xw-err,.xw-gate')),
      overlap: !!(hr && !(hr.bottom <= r.top || r.bottom <= hr.top)),
      title: (document.getElementById('xw-title') || {}).textContent || null,
      bodyText: document.body.innerText || '',
    };
  });

  ok('the workspace opens over the question', st.panelOpen);
  ok('the provider is not gated', !st.gate, st.gate && st.gate.replace(/\n/g, ' '));
  ok('nothing was blocked by the Content-Security-Policy', st.violations.length === 0,
     st.violations.map(v => v.directive + ' ← ' + v.blocked).join(' | '));
  ok('the Desmos API loaded on the live page', st.hasDesmos,
     st.err ? st.err.replace(/\n/g, ' ') : '');
  ok('the graphing calculator is enabled on this key',
     !!(st.features && st.features.GraphingCalculator), JSON.stringify(st.features));
  ok('the calculator region has real size', st.w > 200 && st.h > 200, `${st.w}x${st.h}`);
  ok('the calculator itself is what is in the region', st.kids > 0 && !st.ours,
     st.ours ? 'our own card is there' : `${st.kids} child node(s)`);
  ok('our chrome does not overlap it (§5.b(iii))', !st.overlap, `overlap=${st.overlap}`);
  ok('the tool is named for its job, not the vendor',
     st.title === 'Graphing Calculator', st.title);
  ok('nothing claims a partnership',
     !/(powered by|in partnership|zero ?[x×] ?desmos|endorsed|affiliat)/i.test(st.bodyText));
  ok('served over https from Desmos’s own origin',
     desmosReqs.length > 0 && desmosReqs.every(r => r.status < 400),
     desmosReqs.map(r => r.status + ' ' + r.url).slice(0, 4).join(' | ') || 'no desmos requests');
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  const shot = path.join(__dirname, 'desmos-activation.png');
  await page.screenshot({ path: shot, fullPage: false });
  await browser.close();
  console.log(`\nscreenshot: ${shot}`);
  return report({ fails, pass });
}

function report({ fails, pass, deployed = true }) {
  console.log([...pass, ...fails].join('\n'));
  for (const n of notes) console.log('\nNOTE  ' + n);
  if (fails.length) {
    console.log(`\n${fails.length} FAILED, ${pass.length} passed — DO NOT mark the record ACTIVATED.`);
    process.exit(1);
  }
  console.log(`\nALL ${pass.length} CHECKS PASSED.`);
  if (!deployed) {
    console.log('\nThis was LOCAL mode: the provider mounts. It is not the activation');
    console.log('milestone, because no student flow was exercised. Re-run against the');
    console.log('deployed page before recording anything:\n');
    console.log('  DESMOS_ACTIVATION_URL=https://www.si-math-ai.com/mock-exam.html \\');
    console.log('    node scripts/check-desmos-activation.cjs');
    return;
  }
  console.log('\nRecord it. In docs/engineering/desmos-integration.md, replace the marker with:\n');
  console.log('  <!-- desmos-activation: ACTIVATED -->');
  console.log('  <!-- desmos-evidence: date=<YYYY-MM-DD>; apiVersion=<version used>; ' +
              'tier=commercial; checkedBy=<who ran this> -->');
}

const notes = [];

(async () => {
  const fails = [], pass = [];
  const ok = (n, c, d) => { (c ? pass : fails).push((c ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

  if (URL_MODE) return runDeployed({ ok, fails, pass });

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

  console.log(`\nscreenshot: ${shot}`);
  console.log(`desmos requests: ${requests.length}`);
  // Local mode proves the provider mounts. It does NOT prove the student flow,
  // so it deliberately does not print the ACTIVATED lines — only deployed mode
  // does, because only deployed mode drove the page a student actually gets.
  report({ fails, pass, deployed: false });
})();
