const { chromium } = require('playwright'); const path=require('path'), fs=require('fs');
const OUT=path.join(__dirname,'shots5'); fs.mkdirSync(OUT,{recursive:true});
const parse=c=>{const p=(c.match(/[\d.]+/g)||[0,0,0]).map(Number);
  return {r:p[0]||0,g:p[1]||0,b:p[2]||0,a:p.length>3?p[3]:1};};
const over=(f,b)=>({r:f.r*f.a+b.r*(1-f.a),g:f.g*f.a+b.g*(1-f.a),b:f.b*f.a+b.b*(1-f.a),a:1});
const lum=o=>{const[r,g,b]=[o.r,o.g,o.b].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});
  return .2126*r+.7152*g+.0722*b;};
const cr=(a,b)=>{const B=over(parse(b),{r:255,g:255,b:255,a:1}),A=over(parse(a),B);
  const[x,y]=[lum(A),lum(B)].sort((m,n)=>n-m);return (x+.05)/(y+.05);};

(async()=>{const br=await chromium.launch(); const fails=[],pass=[];
 const ok=(n,c,d)=>{(c?pass:fails).push((c?'PASS  ':'FAIL  ')+n+(d?'  — '+d:''));};
 for (const theme of ['light','dark']) {
  const ctx=await br.newContext({viewport:{width:1280,height:920},deviceScaleFactor:2,colorScheme:theme});
  const p=await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push('pageerror: '+e));
  p.on('console',m=>{if(m.type()==='error'&&!/fonts\.(googleapis|gstatic)|desmos\.com/.test(m.text()+m.location().url))errs.push('console: '+m.text());});
  await p.goto('file://'+path.join(__dirname,'exam-ui-preview.html'));
  await p.waitForTimeout(600);
  ok(`[${theme}] no JS errors`, errs.length===0, errs.join(' | '));

  // ── TIMER (regression): prominent, hideable, reversible, never stops
  const t0 = await p.evaluate(()=>({face:document.querySelector('.xc-t-face').textContent,
    hidden:globalThis.__timer.isHidden(),
    faceShown:getComputedStyle(document.querySelector('.xc-t-face')).display!=='none'}));
  ok(`[${theme}] the timer shows a time`, /^\d\d:\d\d$/.test(t0.face), t0.face);
  ok(`[${theme}] and is visible by default`, t0.faceShown && !t0.hidden);
  await p.click('.xc-t-toggle'); await p.waitForTimeout(120);
  const t1 = await p.evaluate(()=>({hidden:globalThis.__timer.isHidden(),
    faceShown:getComputedStyle(document.querySelector('.xc-t-face')).display!=='none',
    wordShown:getComputedStyle(document.querySelector('.xc-t-hidden')).display!=='none',
    btn:document.querySelector('.xc-t-toggle').textContent.trim(),
    stillTicking:(globalThis.__timer.set(999), document.querySelector('.xc-t-face').textContent)}));
  ok(`[${theme}] hiding conceals the face`, t1.hidden && !t1.faceShown);
  ok(`[${theme}] but the control stays, saying so`, t1.wordShown && /Show/.test(t1.btn), t1.btn);
  ok(`[${theme}] the clock keeps running while hidden`, t1.stillTicking==='16:39', t1.stillTicking);
  await p.click('.xc-t-toggle'); await p.waitForTimeout(120);
  ok(`[${theme}] and showing it again is one click`,
     await p.evaluate(()=>!globalThis.__timer.isHidden()
       && getComputedStyle(document.querySelector('.xc-t-face')).display!=='none'));

  // ── NAVIGATOR (regression)
  const n0 = await p.evaluate(()=>({label:document.querySelector('.xc-n-label').textContent,
    open:globalThis.__nav.isOpen()}));
  ok(`[${theme}] the control reads "Question X of Y"`, /^Question \d+ of \d+$/.test(n0.label), n0.label);
  ok(`[${theme}] the grid is closed until asked for`, !n0.open);
  await p.click('.xc-n-toggle'); await p.waitForTimeout(150);
  const n1 = await p.evaluate(()=>{
    const qs=[...document.querySelectorAll('.xc-q')];
    const cur=qs.filter(q=>q.classList.contains('is-current'));
    return {count:qs.length, current:cur.length, curText:cur[0]&&cur[0].textContent,
      curRing:cur[0]&&getComputedStyle(cur[0]).boxShadow!=='none',
      othersRinged:qs.filter(q=>!q.classList.contains('is-current')
        && getComputedStyle(q).boxShadow!=='none').length,
      flaggedClipped:[...document.querySelectorAll('.xc-q-flagged')]
        .every(q=>getComputedStyle(q).clipPath!=='none'),
      answered:document.querySelectorAll('.xc-q-answered').length};
  });
  ok(`[${theme}] the grid holds every question`, n1.count===22, String(n1.count));
  ok(`[${theme}] exactly one chip is current`, n1.current===1 && n1.curText==='14', n1.curText);
  ok(`[${theme}] the current chip is the ONLY one with a ring`,
     n1.curRing && n1.othersRinged===0, `ring=${n1.curRing} others=${n1.othersRinged}`);
  ok(`[${theme}] flagged chips differ by SHAPE, not colour alone`, n1.flaggedClipped);
  ok(`[${theme}] answered chips are marked`, n1.answered>=6, String(n1.answered));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok(`[${theme}] Escape closes the grid`, await p.evaluate(()=>!globalThis.__nav.isOpen()));

  // ── THE SOCKET: both providers registered on the contract that already existed
  const reg = await p.evaluate(()=>{
    const C=globalThis.SiExamCalculator;
    const each=id=>{const q=C.getProvider(id);
      return q?{mount:typeof q.mount,unmount:typeof q.unmount,name:q.displayName}:null;};
    return {count:C.providerCount(), desmos:each('desmos'), zero:each('zero-graph'),
            // the socket's own gate for a REAL exam: no exam names a provider,
            // so no student is offered a calculator regardless of registration
            inApp:['DSAT','EST_MATH_1','ACT_MATH'].map(c=>C.isInAppAvailable(c))};
  });
  ok(`[${theme}] both providers register into the EXISTING socket`, reg.count===2, String(reg.count));
  ok(`[${theme}] each satisfies mount/unmount, the contract Phase 4 defined`,
     reg.desmos && reg.zero && reg.desmos.mount==='function' && reg.desmos.unmount==='function'
     && reg.zero.mount==='function' && reg.zero.unmount==='function');
  ok(`[${theme}] registering a provider still offers NO student a calculator`,
     reg.inApp.every(v=>v===false), JSON.stringify(reg.inApp));

  // ── THE FOUR GATE STATES, driven by config alone
  const gates = await p.evaluate(()=>{
    const D=globalThis.SiExamGraphDesmos, keep=globalThis.SI_DESMOS_CONFIG, out=[];
    const t=(label,cfg)=>{globalThis.SI_DESMOS_CONFIG=cfg;const s=D.status();
      out.push([label,s.state,s.ready]);};
    t('no config', undefined);
    t('key, no tier', {apiKey:'k'});
    t('trial served to students', {apiKey:'k',tier:'trial',studentFacing:true});
    t('trial, internal only', {apiKey:'k',tier:'trial'});
    t('commercial, student-facing', {apiKey:'k',tier:'commercial',studentFacing:true});
    globalThis.SI_DESMOS_CONFIG=keep; return out;
  });
  const want=[['no config','no-key',false],['key, no tier','no-tier',false],
    ['trial served to students','trial-misuse',false],['trial, internal only','trial',true],
    ['commercial, student-facing','commercial',true]];
  ok(`[${theme}] the gate is decided by credentials, not a flag`,
     JSON.stringify(gates)===JSON.stringify(want), JSON.stringify(gates));

  // ── THE WORKSPACE IS PROVIDER-AGNOSTIC — the chrome must not move
  await p.click('#zgopen'); await p.waitForTimeout(300);
  const shots={};
  for (const id of ['desmos','desmos-cfg','zero-graph']) {
    await p.evaluate(i=>globalThis.__show(i), id);
    // 'desmos-cfg' really attempts to load desmos.com and really fails here, so
    // wait for the outcome rather than a fixed beat.
    await p.waitForFunction(()=>{const m=document.querySelector('.xw-mount');
      return m && m.querySelector('.xw-gate,.xw-err,svg');}, null, {timeout:20000});
    shots[id]=await p.evaluate(()=>{
      const panel=document.querySelector('.xw-panel'), mount=document.querySelector('.xw-mount');
      const head=document.querySelector('.xw-head');
      const box=e=>{const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),
        Math.round(r.width),Math.round(r.height)];};
      return {
        // chrome markup + geometry, minus the one line that is meant to differ
        chrome: head.innerHTML.replace(/<p class="xw-sub">[^<]*<\/p>/,''),
        headBox: box(head), mountBox: box(mount), panelBox: box(panel),
        closeText: document.querySelector('.xw-close').textContent,
        title: document.getElementById('xw-title').textContent,
        sub: document.querySelector('.xw-sub').textContent,
        zeroInHead: head.querySelectorAll('.zg-mark').length,
        zeroInMount: mount.querySelectorAll('.zg-mark,.zg-zero').length,
        mountText: mount.innerText,
        mountHasSvg: !!mount.querySelector('svg'),
        curves: mount.querySelectorAll('.sx-curve').length,
        fallbackBtn: !!mount.querySelector('.xw-fb'),
        activeProvider: globalThis.__ws.providerId(),
      };
    });
  }
  const base=shots['desmos'];
  ok(`[${theme}] the panel does not move or resize with the provider`,
     ['desmos-cfg','zero-graph'].every(k=>
       JSON.stringify(shots[k].panelBox)===JSON.stringify(base.panelBox)
       && JSON.stringify(shots[k].headBox)===JSON.stringify(base.headBox)
       && JSON.stringify(shots[k].mountBox)===JSON.stringify(base.mountBox)),
     JSON.stringify(Object.fromEntries(Object.entries(shots).map(([k,v])=>[k,v.mountBox]))));
  ok(`[${theme}] our chrome is byte-identical across all three providers`,
     ['desmos-cfg','zero-graph'].every(k=>shots[k].chrome===base.chrome
       && shots[k].closeText===base.closeText && shots[k].title===base.title),
     ['desmos-cfg','zero-graph'].filter(k=>shots[k].chrome!==base.chrome).join(',')||'identical');
  ok(`[${theme}] the title is the tool's job, never the vendor's name`,
     base.title==='Graphing Calculator', base.title);

  // ── ZERO'S PLACEMENT — API Terms §5.b(iii), enforced rather than promised
  ok(`[${theme}] Zero is in OUR header in every state`,
     Object.values(shots).every(s=>s.zeroInHead===1),
     Object.entries(shots).map(([k,v])=>k+'='+v.zeroInHead).join(' '));
  ok(`[${theme}] and never inside the provider's own region`,
     Object.values(shots).every(s=>s.zeroInMount===0),
     Object.entries(shots).map(([k,v])=>k+'='+v.zeroInMount).join(' '));

  // ── WHAT EACH STATE ACTUALLY SHOWS
  ok(`[${theme}] unlicensed: nothing mounts, and the reason is the missing key`,
     /no-key/.test(shots['desmos'].mountText) && !shots['desmos'].mountHasSvg
     && /API key/i.test(shots['desmos'].mountText),
     shots['desmos'].mountText.slice(0,80).replace(/\n/g,' '));
  ok(`[${theme}] a key set: it really tries, really fails here, and says so plainly`,
     /did not open/i.test(shots['desmos-cfg'].mountText)
     && !shots['desmos-cfg'].mountHasSvg,
     shots['desmos-cfg'].mountText.slice(0,80).replace(/\n/g,' '));
  ok(`[${theme}] Zero Graph: plots through the exam's own figure renderer`,
     shots['zero-graph'].mountHasSvg && shots['zero-graph'].curves===1,
     `svg=${shots['zero-graph'].mountHasSvg} curves=${shots['zero-graph'].curves}`);

  // ── THE FALLBACK IS OFFERED, NEVER TAKEN
  //
  // A student who reaches for a graphing calculator must not be handed a
  // different one without being asked. So after the failure the active provider
  // is STILL the one that failed, and only a click changes it.
  await p.evaluate(()=>globalThis.__show('desmos-cfg'));
  await p.waitForSelector('.xw-err', {timeout:20000});
  const fb0 = await p.evaluate(()=>({
    offered: !!document.querySelector('.xw-fb'),
    label: (document.querySelector('.xw-fb')||{}).textContent,
    stillDesmos: globalThis.__ws.providerId()==='desmos',
    drew: !!document.querySelector('.xw-mount svg'),
    warns: /not the same calculator/i.test(document.querySelector('.xw-mount').innerText)}));
  ok(`[${theme}] a failure offers the built-in tool by name`,
     fb0.offered && /Zero Graph/.test(fb0.label||''), fb0.label);
  ok(`[${theme}] but does NOT switch on its own`,
     fb0.stillDesmos && !fb0.drew, `provider=${fb0.stillDesmos} drew=${fb0.drew}`);
  ok(`[${theme}] and warns that it is a different calculator`, fb0.warns);
  await p.click('.xw-fb'); await p.waitForTimeout(300);
  const fb1 = await p.evaluate(()=>({now:globalThis.__ws.providerId(),
    drew:!!document.querySelector('.xw-mount svg')}));
  ok(`[${theme}] one click does switch it`,
     fb1.now==='zero-graph' && fb1.drew, JSON.stringify(fb1));

  // ── NO CLAIM OF A RELATIONSHIP, anywhere a student could read one
  const claim = await p.evaluate(()=>{
    const bad=/(powered by|in partnership|partner|official partner|zero ?[x×] ?desmos|endorsed|affiliat)/i;
    const txt=document.body.innerText||'';
    return {hit:(txt.match(bad)||[])[0]||null,
      labels:[...document.querySelectorAll('[alt],[aria-label],[title]')]
        .map(e=>(e.getAttribute('alt')||'')+' '+(e.getAttribute('aria-label')||'')+' '+(e.getAttribute('title')||''))
        .filter(s=>bad.test(s)||/desmos/i.test(s))};
  });
  ok(`[${theme}] nothing claims a partnership, sponsorship or co-branding`,
     !claim.hit && claim.labels.length===0, claim.hit||claim.labels.join('|'));

  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  ok(`[${theme}] Escape closes the workspace`,
     await p.evaluate(()=>!globalThis.__ws.isOpen()));

  // ── QUIET, and contrast on the exam surface
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  const quiet = await p.evaluate(()=>({
    anim:[...document.querySelectorAll('.bar *,.qcard *')]
      .filter(e=>{const a=getComputedStyle(e).animationName; return a && a!=='none';}).length,
    scroll:[document.documentElement.scrollWidth,document.documentElement.clientWidth]}));
  ok(`[${theme}] nothing in the bar or the question animates`, quiet.anim===0, String(quiet.anim));
  ok(`[${theme}] no sideways scroll`, quiet.scroll[0]<=quiet.scroll[1]+1, quiet.scroll.join(' vs '));

  const exam = await p.evaluate(()=>getComputedStyle(document.querySelector('.qcard')).backgroundColor);
  const c = await p.evaluate(()=>{const g=(s,pr)=>{const e=document.querySelector(s);return e?getComputedStyle(e)[pr]:null;};
    return {stem:g('.stem','color'), face:g('.xc-t-face','color'), navlbl:g('.xc-n-toggle','color'),
            qtext:g('.xc-q','color'), tool:g('.zg-name b','color'), num:g('.sx-tick text','fill')};});
  for (const k of ['stem','face','navlbl','qtext','tool','num'])
    ok(`[${theme}] ${k} \u2265 4.5:1`, cr(c[k],exam)>=4.5, cr(c[k],exam).toFixed(2)+':1');

  if (theme==='light') {
    await p.screenshot({path:path.join(OUT,'1-question.png')});
    await p.evaluate(()=>globalThis.__nav.setOpen(true)); await p.waitForTimeout(200);
    await p.screenshot({path:path.join(OUT,'2-navigator.png')});
    await p.evaluate(()=>{globalThis.__nav.setOpen(false);globalThis.__open(true);
      globalThis.__show('desmos');});
    await p.waitForSelector('.xw-gate',{timeout:20000});
    await p.screenshot({path:path.join(OUT,'3-desmos-gated.png')});
    await p.evaluate(()=>globalThis.__show('desmos-cfg'));
    await p.waitForSelector('.xw-err',{timeout:20000});
    await p.screenshot({path:path.join(OUT,'4-desmos-failed.png')});
    await p.evaluate(()=>globalThis.__show('zero-graph')); await p.waitForTimeout(400);
    await p.screenshot({path:path.join(OUT,'5-zero-graph.png')});
    await p.evaluate(()=>{globalThis.__open(false);globalThis.__timer.setHidden(true);});
    await p.waitForTimeout(200);
    await p.screenshot({path:path.join(OUT,'6-timer-hidden.png'),clip:{x:0,y:0,width:1280,height:220}});
  } else {
    await p.evaluate(()=>{globalThis.__open(true);globalThis.__show('zero-graph');});
    await p.waitForTimeout(400);
    await p.screenshot({path:path.join(OUT,'7-dark-zero-graph.png')});
    await p.evaluate(()=>globalThis.__show('desmos'));
    await p.waitForSelector('.xw-gate',{timeout:20000});
    await p.screenshot({path:path.join(OUT,'8-dark-desmos-gated.png')});
  }
  await ctx.close();
 }
 await br.close();
 if (fails.length){console.log(fails.join('\n'));console.log(`\n${fails.length} FAILED, ${pass.length} passed`);process.exit(1);}
 console.log(pass.join('\n')); console.log(`\nALL ${pass.length} CHECKS PASSED`);
})();
