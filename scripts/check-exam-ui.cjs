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
  const ctx=await br.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2,colorScheme:theme});
  const p=await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push('pageerror: '+e));
  p.on('console',m=>{if(m.type()==='error'&&!/fonts\.(googleapis|gstatic)/.test(m.text()+m.location().url))errs.push('console: '+m.text());});
  await p.goto('file://'+path.join(__dirname,'exam-ui-preview.html'));
  await p.waitForTimeout(600);
  ok(`[${theme}] no JS errors`, errs.length===0, errs.join(' | '));

  // ── TIMER: prominent, hideable, reversible, and it never stops
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
  ok(`[${theme}] but the control stays, saying so`, t1.wordShown && /Show/.test(t1.btn),
     t1.btn);
  ok(`[${theme}] the clock keeps running while hidden`, t1.stillTicking==='16:39', t1.stillTicking);
  await p.click('.xc-t-toggle'); await p.waitForTimeout(120);
  const t2 = await p.evaluate(()=>({hidden:globalThis.__timer.isHidden(),
    faceShown:getComputedStyle(document.querySelector('.xc-t-face')).display!=='none'}));
  ok(`[${theme}] and showing it again is one click`, !t2.hidden && t2.faceShown);

  // ── NAVIGATOR
  const n0 = await p.evaluate(()=>({label:document.querySelector('.xc-n-label').textContent,
    open:globalThis.__nav.isOpen(),
    panelShown:getComputedStyle(document.querySelector('.xc-n-panel')).display!=='none'}));
  ok(`[${theme}] the control reads "Question X of Y"`, /^Question \d+ of \d+$/.test(n0.label), n0.label);
  ok(`[${theme}] the grid is closed until asked for`, !n0.open && !n0.panelShown);
  await p.click('.xc-n-toggle'); await p.waitForTimeout(150);
  const n1 = await p.evaluate(()=>{
    const qs=[...document.querySelectorAll('.xc-q')];
    const cur=qs.filter(q=>q.classList.contains('is-current'));
    const cs=cur[0]&&getComputedStyle(cur[0]);
    return {count:qs.length, current:cur.length, curText:cur[0]&&cur[0].textContent,
      curRing:cs&&cs.boxShadow!=='none',
      othersRinged:qs.filter(q=>!q.classList.contains('is-current')
        && getComputedStyle(q).boxShadow!=='none').length,
      flaggedClipped:[...document.querySelectorAll('.xc-q-flagged')]
        .every(q=>getComputedStyle(q).clipPath!=='none'),
      answered:document.querySelectorAll('.xc-q-answered').length,
      panelShown:getComputedStyle(document.querySelector('.xc-n-panel')).display!=='none'};
  });
  ok(`[${theme}] the grid holds every question`, n1.count===22, String(n1.count));
  ok(`[${theme}] exactly one chip is current`, n1.current===1 && n1.curText==='14', n1.curText);
  ok(`[${theme}] the current chip is the ONLY one with a ring`,
     n1.curRing && n1.othersRinged===0, `ring=${n1.curRing} others=${n1.othersRinged}`);
  ok(`[${theme}] flagged chips differ by SHAPE, not colour alone`, n1.flaggedClipped);
  ok(`[${theme}] answered chips are marked`, n1.answered>=6, String(n1.answered));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok(`[${theme}] Escape closes the grid`,
     await p.evaluate(()=>!globalThis.__nav.isOpen()));

  // ── ZERO GRAPH: one tool, one mark, and it really plots
  const z0 = await p.evaluate(()=>{
    const b=document.getElementById('zgopen');
    return {label:b.querySelector('.zg-name b').textContent,
      marks:b.querySelectorAll('.zg-mark').length,
      zeroOnPlate:(()=>{const z=b.querySelector('.zg-mark .zero'),pl=b.querySelector('.zg-mark .plate');
        const a=z.getBoundingClientRect(),c=pl.getBoundingClientRect();
        return !(a.right<c.left||c.right<a.left||a.bottom<c.top||c.bottom<a.top);})(),
      dragon:b.querySelector('.zg-mark .zero').textContent,
      mentionsDesmos:/desmos/i.test(document.body.innerText || ''),
      inAltText:[...document.querySelectorAll('[alt],[aria-label],[title]')]
        .some(e=>/desmos/i.test((e.getAttribute('alt')||'')+(e.getAttribute('aria-label')||'')
                                +(e.getAttribute('title')||'')))};
  });
  ok(`[${theme}] the tool has ONE name`, z0.label==='Zero Graph', z0.label);
  ok(`[${theme}] Zero overlaps the plate — one object, not two logos`, z0.zeroOnPlate);
  ok(`[${theme}] and it is Zero the dragon, the established identity`, z0.dragon==='\u{1F409}');
  ok(`[${theme}] nothing a student can see claims a Desmos relationship`,
     !z0.mentionsDesmos && !z0.inAltText,
     `visible=${z0.mentionsDesmos} labels=${z0.inAltText}`);

  await p.click('#zgopen'); await p.waitForTimeout(350);
  const z1 = await p.evaluate(()=>{
    const sv=document.querySelector('#zgplate svg');
    return {open:getComputedStyle(document.getElementById('zgpanel')).display!=='none',
      drew:!!sv, marks:sv?sv.querySelectorAll('path,line').length:0,
      curve:sv?sv.querySelectorAll('.sx-curve').length:0};
  });
  ok(`[${theme}] the workspace opens`, z1.open);
  ok(`[${theme}] and plots the typed function through the exam renderer`,
     z1.drew && z1.curve===1, JSON.stringify(z1));
  const z2 = await p.evaluate(()=>{
    document.getElementById('zgin').value='sin(';
    globalThis.__plot();
    return {err:(document.querySelector('.zg-err')||{}).textContent||'',
            plate:document.getElementById('zgplate').children.length};
  });
  ok(`[${theme}] a bad expression explains itself and draws nothing`,
     /bracket/i.test(z2.err) && z2.plate===0, z2.err);
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  ok(`[${theme}] Escape closes the workspace`,
     await p.evaluate(()=>getComputedStyle(document.getElementById('zgpanel')).display==='none'));

  // ── quiet during the question
  const quiet = await p.evaluate(()=>{
    const anim=[...document.querySelectorAll('.bar *,.qcard *')]
      .filter(e=>{const a=getComputedStyle(e).animationName; return a && a!=='none';}).length;
    return {anim, scroll:[document.documentElement.scrollWidth,document.documentElement.clientWidth]};
  });
  ok(`[${theme}] nothing in the bar or the question animates`, quiet.anim===0, String(quiet.anim));
  ok(`[${theme}] no sideways scroll`, quiet.scroll[0]<=quiet.scroll[1]+1, quiet.scroll.join(' vs '));

  // ── contrast on the exam surface
  const exam = await p.evaluate(()=>getComputedStyle(document.querySelector('.qcard')).backgroundColor);
  const c = await p.evaluate(()=>{const g=(s,pr)=>{const e=document.querySelector(s);return e?getComputedStyle(e)[pr]:null;};
    return {stem:g('.stem','color'), face:g('.xc-t-face','color'), navlbl:g('.xc-n-toggle','color'),
            qtext:g('.xc-q','color'), tool:g('.zg-name b','color'), num:g('.sx-tick text','fill')};});
  for (const [k,min] of [['stem',4.5],['face',4.5],['navlbl',4.5],['qtext',4.5],['tool',4.5],['num',4.5]])
    ok(`[${theme}] ${k} ≥ ${min}:1`, cr(c[k],exam)>=min, cr(c[k],exam).toFixed(2)+':1');

  if (theme==='light') {
    await p.screenshot({path:path.join(OUT,'1-question.png')});
    await p.evaluate(()=>globalThis.__nav.setOpen(true)); await p.waitForTimeout(200);
    await p.screenshot({path:path.join(OUT,'2-navigator.png')});
    await p.evaluate(()=>{globalThis.__nav.setOpen(false);
      document.getElementById('zgin').value='x^3/3 - 2x^2 + 3x + 1'; globalThis.__open(true);});
    await p.waitForTimeout(350);
    await p.screenshot({path:path.join(OUT,'3-zerograph.png')});
    await p.evaluate(()=>{globalThis.__open(false); globalThis.__timer.setHidden(true);});
    await p.waitForTimeout(200);
    await p.screenshot({path:path.join(OUT,'4-timer-hidden.png'),clip:{x:0,y:0,width:1280,height:220}});
  }
  await ctx.close();
 }
 await br.close();
 if (fails.length){console.log(fails.join('\n'));console.log(`\n${fails.length} FAILED, ${pass.length} passed`);process.exit(1);}
 console.log(pass.join('\n')); console.log(`\nALL ${pass.length} CHECKS PASSED`);
})();
