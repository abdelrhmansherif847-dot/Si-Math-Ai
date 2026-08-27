// Does mock-exam.html actually offer the calculator, and only when it should?
//
// The production exam page was unfrozen on 2026-08-27 to wire the calculator in.
// This drives the real file in a browser, under the real Content-Security-Policy
// from vercel.json, with a stubbed /api/desmos-config — so everything up to the
// request to Desmos is exercised. It cannot check what Desmos renders; nothing
// in this environment can reach www.desmos.com. That is what deployed mode of
// check-desmos-activation.cjs is for.
//
// The load-bearing assertion is the NEGATIVE one: with no exam naming a
// provider, a student must see no calculator control at all. Everything else
// here is about the verification override behaving as narrowly as advertised.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');

const REPO = path.join(__dirname, '..');
const CSP = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8')).headers
  .flatMap(h => h.headers || []).find(h => h.key === 'Content-Security-Policy').value;

// A placeholder, never a real key. The point is to reach the request to Desmos,
// not to make it succeed.
const STUB = { apiKey: 'WIRING-CHECK-NOT-A-REAL-KEY', tier: 'commercial', studentFacing: true };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const send = (type, body, extra) => {
    res.writeHead(200, Object.assign({ 'Content-Type': type, 'Content-Security-Policy': CSP }, extra || {}));
    res.end(body);
  };
  if (url === '/api/desmos-config') {
    return send(TYPES['.js'], 'globalThis.SI_DESMOS_CONFIG = ' + JSON.stringify(STUB) + ';\n');
  }
  // The Supabase CDN bundle is unreachable from this environment. A stub keeps
  // the page's own code running, which is what is under test here.
  if (url === '/__supabase-stub.js') {
    return send(TYPES['.js'], 'globalThis.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),' +
      'getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},' +
      'from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})}),' +
      'channel:()=>({on:()=>({subscribe(){}}),subscribe(){}}),removeChannel(){},rpc:async()=>({data:null})})};\n');
  }
  const file = path.join(REPO, url === '/' ? 'index.html' : url.replace(/^\//, ''));
  if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Security-Policy': CSP }); return res.end('not found');
  }
  let body = fs.readFileSync(file);
  if (path.extname(file) === '.html') {
    body = body.toString().replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^>]*><\/script>/,
      '<script src="/__supabase-stub.js"></script>');
  }
  send(TYPES[path.extname(file)] || 'application/octet-stream', body);
});

(async () => {
  const fails = [], pass = [];
  const ok = (n, c, d) => { (c ? pass : fails).push((c ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();

  // Reaching the TIMER view needs an exam and a running clock. The page's own
  // state object is driven directly rather than clicking through selection —
  // this is a test of the calculator wiring, not of exam setup.
  let ctx = null;
  async function timerPage(query) {
    if (ctx) await ctx.close();
    ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    const page = await ctx.newPage();
    const errs = [], desmos = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e));
    page.on('request', r => { if (r.url().includes('desmos.com')) desmos.push(r.url()); });
    page.on('console', m => { if (m.type() === 'error'
      && !/favicon|ERR_(TUNNEL|NAME|CONNECTION)|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await page.goto(base + '/mock-exam.html' + query, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      s.exam = window.SiExamRegistry.get('SAT_MODULE_1') ||
               { code: 'SAT_MODULE_1', displayName: 'SAT Math', org: 'College Board', questions: 22 };
      s.exam.code = s.exam.code || 'SAT_MODULE_1';
      s.timerTotal = 2100; s.timerSec = 1043; s.timerRunning = false;
      s.modulePlan = []; s.moduleOrdinal = 1; s.view = 'TIMER';
      render();
    });
    await page.waitForTimeout(400);
    return { page, errs, desmos };
  }

  // ── 1. the student's view: nothing, because no exam names a provider ───────
  const a = await timerPage('');
  const plain = await a.page.evaluate(() => ({
    launcher: document.querySelectorAll('[data-si-calculator-open]').length,
    badge: !!document.querySelector('.calc-badge'),
    panel: document.querySelectorAll('.xw-panel').length,
    inApp: window.SiExamCalculator.describe('SAT_MODULE_1')?.inApp,
    registered: window.SiExamCalculator.providerCount(),
  }));
  ok('the timer screen renders for a student', plain.badge);
  ok('NO calculator control is offered', plain.launcher === 0, String(plain.launcher));
  ok('and no panel is even built', plain.panel === 0, String(plain.panel));
  ok('because the exam names no provider', plain.inApp === false, String(plain.inApp));
  ok('even though both providers are registered', plain.registered === 2, String(plain.registered));
  ok('no page errors', a.errs.length === 0, a.errs.slice(0, 2).join(' | '));

  // ── 2. the verification override ──────────────────────────────────────────
  const b = await timerPage('?desmos-check=1');
  ok('?desmos-check=1 offers the control', await b.page.evaluate(
    () => document.querySelectorAll('[data-si-calculator-open]').length === 1));
  const label = await b.page.evaluate(
    () => document.querySelector('[data-si-calculator-open]').textContent.trim());
  ok('named for its job, not the vendor', label === 'Graphing Calculator', label);

  await b.page.click('[data-si-calculator-open]');
  await b.page.waitForSelector('.xw-panel.is-open', { timeout: 10000 });
  await b.page.waitForFunction(
    () => document.querySelector('.xw-mount').children.length > 0, null, { timeout: 30000 });
  const open = await b.page.evaluate(() => {
    const m = document.querySelector('.xw-mount'), h = document.querySelector('.xw-head');
    const r = m.getBoundingClientRect(), hr = h.getBoundingClientRect();
    return { title: document.getElementById('xw-title').textContent,
      sub: document.querySelector('.xw-sub').textContent,
      w: Math.round(r.width), h: Math.round(r.height),
      overlap: !(hr.bottom <= r.top || r.bottom <= hr.top),
      markInHead: h.querySelectorAll('.xw-mark').length,
      markInMount: m.querySelectorAll('.xw-mark').length,
      text: m.innerText.replace(/\n/g, ' '),
      fallback: !!m.querySelector('.xw-fb'),
      script: (document.getElementById('si-desmos-api') || {}).src || null };
  });
  ok('the workspace opens', open.w > 200 && open.h > 200, `${open.w}x${open.h}`);
  ok('the tool is called Graphing Calculator', open.title === 'Graphing Calculator', open.title);
  ok('the provider is named in the subtitle, which §6.b licenses',
     /Desmos/.test(open.sub), open.sub);
  ok('Zero is in our header and not in the calculator region (§5.b(iii))',
     open.markInHead === 1 && open.markInMount === 0,
     `head=${open.markInHead} mount=${open.markInMount}`);
  ok('it requested the official API from Desmos’s own origin',
     !!open.script && open.script.startsWith('https://www.desmos.com/api/'),
     open.script ? open.script.replace(/apiKey=[^&]*/, 'apiKey=***') : 'no script tag');
  ok('the request was not blocked by our own CSP',
     b.desmos.length > 0, `${b.desmos.length} request(s)`);
  // Unreachable here, so the honest end state is the failure card — and it must
  // NOT offer Zero Graph, which has no renderer on this page.
  ok('unreachable Desmos ends in the failure card, not a spinner',
     /did not open/i.test(open.text), open.text.slice(0, 70));
  ok('and offers no fallback it cannot honour', !open.fallback);

  // ── 3. the override is narrow ─────────────────────────────────────────────
  // Auth is stubbed here, so a background user lookup can re-render the page
  // back to SELECT after the assertions. Put the exam screen back before the
  // shot so the picture shows the launcher where a student would meet it.
  const shot = path.join(__dirname, 'shots5', 'mock-exam-calculator.png');
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await b.page.evaluate(() => { if (s.view !== 'TIMER') { s.view = 'TIMER'; render(); } });
  await b.page.waitForTimeout(300);
  ok('the launcher is still on the exam screen behind the panel', await b.page.evaluate(
    () => document.querySelectorAll('[data-si-calculator-open]').length === 1));
  await b.page.screenshot({ path: shot });

  const c = await timerPage('?desmos-check=0');
  ok('any other value of the flag offers nothing', await c.page.evaluate(
    () => document.querySelectorAll('[data-si-calculator-open]').length === 0));
  console.log('screenshot: ' + shot);

  await browser.close(); server.close();
  console.log([...pass, ...fails].join('\n'));
  console.log(`\nscreenshot: ${shot}`);
  if (fails.length) { console.log(`\n${fails.length} FAILED, ${pass.length} passed`); process.exit(1); }
  console.log(`\nALL ${pass.length} CHECKS PASSED`);
})();
