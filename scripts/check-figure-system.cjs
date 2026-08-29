const { chromium } = require('playwright'); const path=require('path'), fs=require('fs');
const OUT=path.join(__dirname,'shots3'); fs.mkdirSync(OUT,{recursive:true});
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
  const ctx=await br.newContext({viewport:{width:1300,height:1000},deviceScaleFactor:2,colorScheme:theme});
  const p=await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push('pageerror: '+e));
  p.on('console',m=>{if(m.type()==='error'&&!/fonts\.(googleapis|gstatic)/.test(m.text()+m.location().url))errs.push('console: '+m.text());});
  await p.goto('file://'+path.join(__dirname,'figure-system.html'));
  await p.waitForTimeout(700);
  ok(`[${theme}] no JS errors`, errs.length===0, errs.join(' | '));

  const drew = await p.evaluate(()=>[...document.querySelectorAll('.vb')].map(h=>{
    const s=h.querySelector('svg'), t=h.querySelector('table');
    const r=(s||t)&&(s||t).getBoundingClientRect();
    return {id:h.id||'table', ok:!!(s||t), w:r?Math.round(r.width):0,
            marks:s?s.querySelectorAll('path,line,circle,polyline').length:0};
  }));
  ok(`[${theme}] 10 variants present`, drew.length===10, 'got '+drew.length);
  for (const d of drew) ok(`[${theme}] ${d.id} drew`, d.ok && d.w>200, JSON.stringify(d));

  // ═══ RULE ONE: `reading` flips the grid. The page's central claim. ═══════
  const rule1 = await p.evaluate(()=>{
    const g=id=>{const s=document.querySelector('#'+id+' svg');
      const L=[...s.querySelectorAll('.sx-grid line')];
      return {v:L.filter(l=>l.getAttribute('x1')===l.getAttribute('x2')).length,
              h:L.filter(l=>l.getAttribute('y1')===l.getAttribute('y2')).length};};
    return {fnShape:g('v-fn-0'), fnValue:g('v-fn-1'),
            dataShape:g('v-data-0'), dataValue:g('v-data-1')};
  });
  ok(`[${theme}] function · reading:shape draws no grid`,
     rule1.fnShape.v===0 && rule1.fnShape.h===0, JSON.stringify(rule1.fnShape));
  ok(`[${theme}] function · reading:value draws a full grid`,
     rule1.fnValue.v>3 && rule1.fnValue.h>3, JSON.stringify(rule1.fnValue));
  ok(`[${theme}] data · reading:shape draws no rules`,
     rule1.dataShape.v===0 && rule1.dataShape.h===0, JSON.stringify(rule1.dataShape));
  ok(`[${theme}] data · reading:value draws rules ACROSS ONLY`,
     rule1.dataValue.h>2 && rule1.dataValue.v===0, JSON.stringify(rule1.dataValue));

  // ═══ RULE TWO: resolution drives density. Derived, so test the function. ═
  const rule2 = await p.evaluate(()=>{
    const {resolutionOf, gridPlan} = globalThis.SiExamStimulus;
    const geoInt=document.querySelector('#v-geo-0 svg');
    const geoHalf=document.querySelector('#v-geo-1 svg');
    const fine=s=>[...s.querySelectorAll('.sx-grid line.sx-fine')].length;
    const nlMinor=id=>[...document.querySelectorAll('#'+id+' .sx-nl-minor')].length;
    const nlNamed=id=>[...document.querySelectorAll('#'+id+' .sx-tick text')].map(t=>t.textContent);
    return {
      resInt: resolutionOf([0,0,6,0,6,8]), resHalf: resolutionOf([0,0,6,0,6,7.5]),
      resFifth: resolutionOf([0.2,0.4,1]), resTenth: resolutionOf([0.1,0.35]),
      geoFineInt: fine(geoInt), geoFineHalf: fine(geoHalf),
      nlMinorInt: nlMinor('v-nl-0'), nlMinorHalf: nlMinor('v-nl-1'),
      nlNamedInt: nlNamed('v-nl-0'), nlNamedHalf: nlNamed('v-nl-1'),
      planGeo: gridPlan('plane','shape',0.5),
      planFnShape: gridPlan('graph','shape',1),
      planFnValue: gridPlan('graph','value',1),
      planDataShape: gridPlan('data','shape',1),
    };
  });
  ok(`[${theme}] resolutionOf: integers → 1`, rule2.resInt===1, String(rule2.resInt));
  ok(`[${theme}] resolutionOf: a half → ½`, rule2.resHalf===0.5, String(rule2.resHalf));
  ok(`[${theme}] resolutionOf: fifths → ⅕`, Math.abs(rule2.resFifth-0.2)<1e-9, String(rule2.resFifth));
  ok(`[${theme}] resolutionOf: a value off every coarse step → ⅒`,
     Math.abs(rule2.resTenth-0.1)<1e-9, String(rule2.resTenth));
  ok(`[${theme}] geometry · integer vertices → no sub-unit lines`,
     rule2.geoFineInt===0, String(rule2.geoFineInt));
  ok(`[${theme}] geometry · a vertex on a half → sub-unit lines appear`,
     rule2.geoFineHalf>6, String(rule2.geoFineHalf));
  ok(`[${theme}] number line · integer endpoint → no minor ticks`,
     rule2.nlMinorInt===0, String(rule2.nlMinorInt));
  ok(`[${theme}] number line · endpoint on a half → minor ticks appear`,
     rule2.nlMinorHalf>6, String(rule2.nlMinorHalf));
  ok(`[${theme}] number line names −2.5 even though it is off the major step`,
     rule2.nlNamedHalf.includes('−2.5'), rule2.nlNamedHalf.join(','));
  ok(`[${theme}] ...and the integer case does not name a half`,
     !rule2.nlNamedInt.some(t=>t.includes('.')), rule2.nlNamedInt.join(','));

  // the rule is a rule: geometry ignores `reading`, the others obey it
  ok(`[${theme}] geometry's grid does not depend on reading`,
     rule2.planGeo.mode==='major', JSON.stringify(rule2.planGeo));
  ok(`[${theme}] function/data grids DO depend on reading`,
     rule2.planFnShape.mode==='none' && rule2.planFnValue.mode==='major'
     && rule2.planDataShape.mode==='none', JSON.stringify(rule2));

  // ═══ the grammar that must NOT vary ═════════════════════════════════════
  const gram = await p.evaluate(()=>{
    const s=id=>document.querySelector('#'+id+' svg');
    const arrows=x=>[...x.querySelectorAll('.sx-axis line')].filter(l=>l.getAttribute('marker-end')).length;
    const eq=x=>{const V=[...x.querySelectorAll('.sx-grid line')]
        .filter(l=>l.getAttribute('x1')===l.getAttribute('x2')).map(l=>+l.getAttribute('x1')).sort((a,b)=>a-b);
      const H=[...x.querySelectorAll('.sx-grid line')]
        .filter(l=>l.getAttribute('y1')===l.getAttribute('y2')).map(l=>+l.getAttribute('y1')).sort((a,b)=>a-b);
      return V.length>1&&H.length>1 ? Math.abs((V[1]-V[0])-(H[1]-H[0])) : null;};
    return {
      geoEqual: eq(s('v-geo-0')), fnEqual: eq(s('v-fn-1')),
      geoLabels: [...s('v-geo-0').querySelectorAll('.sx-label')].map(t=>t.textContent).sort().join(''),
      dataArrows: arrows(s('v-data-1')), fnArrows: arrows(s('v-fn-0')),
      nlOpen: [...s('v-nl-1').querySelectorAll('.sx-endpoint')]
        .map(e=>e.getAttribute('class').includes('sx-open')),
      nlClosed: [...s('v-nl-0').querySelectorAll('.sx-endpoint')]
        .map(e=>e.getAttribute('class').includes('sx-closed')),
      legends: document.querySelectorAll('.sx-legend,.sx-swatch,svg title,svg desc').length,
      interactive: document.querySelectorAll('[onclick],[onmouseover],[title]').length,
    };
  });
  ok(`[${theme}] geometry keeps equal scales`, gram.geoEqual!==null && gram.geoEqual<0.02,
     String(gram.geoEqual));
  ok(`[${theme}] the function graph deliberately does not`,
     gram.fnEqual!==null && gram.fnEqual>1, String(gram.fnEqual));
  ok(`[${theme}] geometry names O, A and B`, gram.geoLabels==='ABO', gram.geoLabels);
  ok(`[${theme}] the plane keeps arrowheads`, gram.fnArrows===2, String(gram.fnArrows));
  ok(`[${theme}] the data frame has none`, gram.dataArrows===0, String(gram.dataArrows));
  ok(`[${theme}] number line keeps open/closed semantics`,
     gram.nlOpen[0]===true && gram.nlClosed[0]===true,
     JSON.stringify([gram.nlOpen,gram.nlClosed]));
  ok(`[${theme}] no legend and no tooltip source anywhere`, gram.legends===0, String(gram.legends));
  ok(`[${theme}] nothing on the page is interactive`, gram.interactive===0, String(gram.interactive));

  // ═══ contrast on the exam surface ═══════════════════════════════════════
  const surf = await p.evaluate(()=>getComputedStyle(document.querySelector('.v')).backgroundColor);
  const c = await p.evaluate(()=>{const g=(s,pr)=>{const e=document.querySelector(s);return e?getComputedStyle(e)[pr]:null;};
    return {num:g('.sx-tick text','fill'), ink:g('.sx-series','color'), axis:g('.sx-axis line','stroke'),
            lab:g('.sx-label','fill'), data:g('#v-data-1 .sx-series','color'),
            grid:g('.sx-grid line:not(.sx-fine)','stroke'), fine:g('.sx-grid line.sx-fine','stroke'),
            tRule:g('.t-sys tbody td','borderTopColor'), tTxt:g('.t-sys tbody td','color'),
            tHeadBg:g('.t-sys th','backgroundColor'), tHeadFg:g('.t-sys th','color')};});
  // A grid is only drawn when the question needs it, so every grid here is
  // information the reader must perceive — not decoration under a figure.
  for (const [k,min] of [['num',4.5],['ink',3],['axis',3],['lab',4.5],['data',3],
                         ['grid',3],['tRule',3],['tTxt',4.5]])
    ok(`[${theme}] ${k} ≥ ${min}:1 on the figure surface`, cr(c[k],surf)>=min, cr(c[k],surf).toFixed(2)+':1');
  ok(`[${theme}] table header text on its band ≥ 4.5:1`, cr(c.tHeadFg,c.tHeadBg)>=4.5,
     cr(c.tHeadFg,c.tHeadBg).toFixed(2)+':1');

  // a numeral on a countable grid needs to clear the lines running under it
  const halo = await p.evaluate(()=>{
    const t=document.querySelector('.sx-tick text'), cs=getComputedStyle(t);
    const surf=getComputedStyle(document.querySelector('.v')).backgroundColor;
    return {order:cs.paintOrder, w:parseFloat(cs.strokeWidth)||0, stroke:cs.stroke, surf};
  });
  ok(`[${theme}] numerals carry a halo so the grid does not run through them`,
     /stroke/.test(halo.order) && halo.w>=2 && halo.stroke===halo.surf,
     JSON.stringify(halo));

  ok(`[${theme}] the sub-unit tier stays quieter than the unit grid`,
     cr(c.fine,surf) < cr(c.grid,surf),
     `fine ${cr(c.fine,surf).toFixed(2)}:1 vs unit ${cr(c.grid,surf).toFixed(2)}:1`);

  const sc = await p.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.clientWidth]);
  ok(`[${theme}] page does not scroll sideways`, sc[0]<=sc[1]+1, sc.join(' vs '));

  const names=['1-function','2-geometry','3-data','4-numberline','5-tables'];
  const secs=await p.$$('section.fam');
  for (let i=0;i<secs.length;i++)
    await secs[i].screenshot({path:path.join(OUT,names[i]+(theme==='dark'?'-dark':'')+'.png')});
  if (theme==='light') {
    await p.screenshot({path:path.join(OUT,'0-rules.png'),clip:{x:0,y:0,width:1300,height:1100}});
    await p.screenshot({path:path.join(OUT,'full.png'),fullPage:true});
  }
  await ctx.close();
 }
 await br.close();
 if (fails.length){console.log(fails.join('\n'));console.log(`\n${fails.length} FAILED, ${pass.length} passed`);process.exit(1);}
 console.log(pass.join('\n')); console.log(`\nALL ${pass.length} CHECKS PASSED`);
})();
