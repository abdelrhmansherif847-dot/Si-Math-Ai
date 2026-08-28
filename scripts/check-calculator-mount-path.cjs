// The mount path, exercised against a Desmos-SHAPED STUB.
//
// ⚠️  THE STUB IS NOT DESMOS. Not their code, not their rendering, not their
//     behaviour. Passing this proves NOTHING about the Desmos calculator. What
//     it proves is everything on OUR side of the boundary:
//
//       · a signed-in browser gets a configuration from /api/desmos-config
//       · the apiVersion in that configuration is what ends up in the script URL
//       · the script is requested from www.desmos.com and nowhere else
//       · GraphingCalculator() is handed our mount element, with real size
//       · what lands in that element is the calculator, not one of our cards
//       · Zero is in our header and not over it (API Terms §5.b(iii))
//       · closing the panel calls destroy() and leaves the region empty
//       · no credential is rendered into the page
//
//     Every one of those was previously unverifiable here, because this
//     environment cannot reach www.desmos.com — so the mount path was written
//     against documentation and never run. This runs it.
//
//     The real proof is scripts/check-desmos-activation.cjs in deployed mode,
//     against a deployment, on a network that can reach Desmos. Nothing here
//     substitutes for that, and the record stays UNPROVEN until it passes.

const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = '/home/user/Si-Math-Ai';
const CSP = JSON.parse(fs.readFileSync(path.join(REPO,'vercel.json'),'utf8')).headers
  .flatMap(h=>h.headers||[]).find(h=>h.key==='Content-Security-Policy').value;
const KEY = 'STUB-KEY-NOT-A-REAL-KEY';

const STUB_DESMOS = `
window.Desmos = {
  enabledFeatures: { GraphingCalculator: true, ScientificCalculator: true },
  GraphingCalculator: function (el, opts) {
    var d = document.createElement('div');
    d.setAttribute('data-stub-desmos','1');
    d.style.cssText = 'position:absolute;inset:0;background:#fff;color:#111;'
      + 'font:14px system-ui;display:flex;align-items:center;justify-content:center;'
      + 'flex-direction:column;gap:8px;border-radius:4px';
    d.innerHTML = '<div style="font-weight:700">Desmos Graphing Calculator</div>'
      + '<div style="opacity:.6;font-size:12px">(stub standing in for the real bundle)</div>'
      + '<canvas width="420" height="220" style="border:1px solid #ddd"></canvas>';
    el.style.position = 'relative';
    el.appendChild(d);
    return { destroy: function(){ d.remove(); }, setExpression: function(){}, opts: opts };
  }
};
`;

const srv = http.createServer((req,res)=>{
  const u = req.url.split('?')[0];
  const send=(t,b,extra)=>{res.writeHead(200,Object.assign({'Content-Type':t,'Content-Security-Policy':CSP},extra||{}));res.end(b);};
  if (u==='/api/desmos-config'){
    const a=req.headers.authorization||'';
    const okAuth=/^Bearer \S+$/.test(a);
    res.writeHead(okAuth?200:401,{'Content-Type':'application/json','Cache-Control':'no-store, max-age=0, private','Content-Security-Policy':CSP});
    return res.end(JSON.stringify(okAuth
      ? {note:'Desmos configuration, commercial tier.',config:{apiKey:KEY,tier:'commercial',studentFacing:true,apiVersion:'v1.12'}}
      : {note:'Sign in to use the calculator.',config:{}}));
  }
  if (u==='/__s.js') return send('application/javascript',
    'globalThis.supabase={createClient:()=>({auth:{'
    +'getSession:async()=>({data:{session:{access_token:"stub-session-token"}}}),'
    +'getUser:async()=>({data:{user:{id:"u1"}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},'
    +'from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})}),'
    +'channel:()=>({on:()=>({subscribe(){}}),subscribe(){}}),removeChannel(){},rpc:async()=>({data:null})})};');
  const f = path.join(REPO, u==='/'?'index.html':u.slice(1));
  if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404,{'Content-Security-Policy':CSP});return res.end('x');}
  let b = fs.readFileSync(f);
  if (f.endsWith('.html')) b = b.toString().replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^>]*><\/script>/,'<script src="/__s.js"></script>');
  send(f.endsWith('.js')?'application/javascript':f.endsWith('.html')?'text/html; charset=utf-8':'text/plain', b);
});

(async()=>{
  await new Promise(r=>srv.listen(8742,'127.0.0.1',r));
  const br = await chromium.launch();
  const ctx = await br.newContext({viewport:{width:1200,height:860}});
  const page = await ctx.newPage();
  const seen = [];
  // Stand in for desmos.com. THIS IS THE STUB — nothing here is Desmos's code.
  await page.route('**://www.desmos.com/**', route => {
    seen.push(route.request().url());
    route.fulfill({ status:200, contentType:'application/javascript', body: STUB_DESMOS });
  });
  const errs=[];
  page.on('pageerror',e=>errs.push(''+e));
  page.on('console',m=>{if(m.type()==='error'&&!/favicon|Failed to load resource/.test(m.text()))errs.push(m.text());});
  await page.goto('http://127.0.0.1:8742/mock-exam.html?desmos-check=1',{waitUntil:'load'});
  await page.waitForTimeout(700);
  await page.evaluate(()=>{s.exam=window.SiExamRegistry.get('SAT_MODULE_1')||{code:'SAT_MODULE_1'};
    s.exam.code='SAT_MODULE_1';s.timerTotal=2100;s.timerSec=1043;s.timerRunning=false;
    s.modulePlan=[];s.moduleOrdinal=1;s.view='TIMER';render();});
  await page.waitForTimeout(400);
  await page.click('[data-si-calculator-open]');
  await page.waitForSelector('[data-stub-desmos]',{timeout:20000});
  await page.waitForTimeout(500);
  const r = await page.evaluate(()=>{
    const m=document.querySelector('.xw-mount'), h=document.querySelector('.xw-head');
    const mb=m.getBoundingClientRect(), hb=h.getBoundingClientRect();
    return {mounted:!!m.querySelector('[data-stub-desmos]'),
      w:Math.round(mb.width),h:Math.round(mb.height),
      ourCard:!!m.querySelector('.xw-err,.xw-gate'),
      markInMount:m.querySelectorAll('.xw-mark').length,
      markInHead:h.querySelectorAll('.xw-mark').length,
      overlap:!(hb.bottom<=mb.top||mb.bottom<=hb.top),
      sub:document.querySelector('.xw-sub').textContent,
      features:JSON.stringify(window.Desmos.enabledFeatures),
      keyVisible:(document.body.innerText||'').includes('STUB-KEY'),
      script:(document.getElementById('si-desmos-api')||{}).src||null};
  });
  const fails = [], pass = [];
  const ok = (n, c, d) => { (c ? pass : fails).push((c ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };
  const url = (r.script || '').replace(/apiKey=[^&]*/, 'apiKey=***');

  ok('a signed-in page gets a configuration', /commercial tier/.test(r.sub), r.sub);
  ok('the configured apiVersion is what is requested',
     /\/api\/v1\.12\/calculator\.js/.test(url), url);
  ok('the script is requested from Desmos’s own origin and nowhere else',
     seen.length === 1 && seen[0].startsWith('https://www.desmos.com/api/'), String(seen.length));
  ok('the calculator mounted into our element', r.mounted);
  ok('and it is the calculator, not one of our cards', !r.ourCard);
  ok('the region has real size', r.w > 200 && r.h > 200, `${r.w}x${r.h}`);
  ok('enabledFeatures is readable from the loaded API',
     /GraphingCalculator/.test(r.features), r.features);
  ok('Zero is in our header, never over the calculator (§5.b(iii))',
     r.markInHead === 1 && r.markInMount === 0, `head=${r.markInHead} mount=${r.markInMount}`);
  ok('our chrome does not overlap the calculator', !r.overlap);
  ok('no credential is rendered into the page', !r.keyVisible);
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

  const shot = '/home/user/Si-Math-Ai/scripts/shots5/exam-3-mounted-stub.png';
  await page.screenshot({ path: shot });
  await page.evaluate(() => document.querySelector('.xw-close').click());
  await page.waitForTimeout(400);
  const left = await page.evaluate(() => document.querySelector('.xw-mount').children.length);
  ok('closing the panel calls destroy() and empties the region', left === 0, String(left));

  console.log([...pass, ...fails].join('\n'));
  console.log(`\nscreenshot: ${shot}`);
  console.log('\nThe white rectangle is the STUB. The real calculator would occupy it.');
  if (fails.length) { console.log(`\n${fails.length} FAILED, ${pass.length} passed`); process.exitCode = 1; }
  else console.log(`\nALL ${pass.length} CHECKS PASSED — against a stub, not against Desmos.`);
  await br.close(); srv.close();
})();
