const { chromium } = require('playwright'); const path=require('path'), fs=require('fs');
const OUT=path.join(__dirname,'shots2'); fs.mkdirSync(OUT,{recursive:true});
const parse = c => { const p=(c.match(/[\d.]+/g)||[0,0,0]).map(Number);
  return {r:p[0]||0,g:p[1]||0,b:p[2]||0,a:p.length>3?p[3]:1}; };
const over=(f,b)=>({r:f.r*f.a+b.r*(1-f.a),g:f.g*f.a+b.g*(1-f.a),b:f.b*f.a+b.b*(1-f.a),a:1});
const lum=o=>{const[r,g,b]=[o.r,o.g,o.b].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});
  return .2126*r+.7152*g+.0722*b;};
const cr=(a,b)=>{const B=over(parse(b),{r:255,g:255,b:255,a:1}),A=over(parse(a),B);
  const[x,y]=[lum(A),lum(B)].sort((m,n)=>n-m); return (x+.05)/(y+.05);};

(async()=>{const br=await chromium.launch(); const fails=[],pass=[];
 const ok=(n,c,d)=>{(c?pass:fails).push((c?'PASS  ':'FAIL  ')+n+(d?'  — '+d:''));};
 for (const theme of ['light','dark']) {
  const ctx=await br.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,colorScheme:theme});
  const p=await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push('pageerror: '+e));
  p.on('console',m=>{if(m.type()==='error'&&!/fonts\.(googleapis|gstatic)/.test(m.text()+m.location().url))errs.push('console: '+m.text());});
  await p.goto('file://'+path.join(__dirname,'exam-composition.html'));
  await p.waitForTimeout(700);
  ok(`[${theme}] no JS errors`, errs.length===0, errs.join(' | '));

  const figs = await p.evaluate(()=>[...document.querySelectorAll('.figbox')].map(h=>{
    const s=h.querySelector('svg'), t=h.querySelector('table'), r=(s||t)&&(s||t).getBoundingClientRect();
    return {id:h.id||'table', kind:s?'svg':'table', w:r?Math.round(r.width):0, h:r?Math.round(r.height):0,
            marks:s?s.querySelectorAll('path,line,circle,polyline').length:0};
  }));
  ok(`[${theme}] 10 stimuli present (8 figures + 2 tables)`, figs.length===10, 'got '+figs.length);
  for (const f of figs) ok(`[${theme}] ${f.id}/${f.kind} drew`,
     f.w>200 && f.h>60 && (f.kind==='table'||f.marks>3), JSON.stringify(f));

  // ── the claim of the page: the recomposed figure is BIGGER and its subject
  //    is HEAVIER than the scaffolding. Measured, not asserted.
  const comp = await p.evaluate(()=>{
    const o={};
    for (const fam of ['fn','geo','stat','nl']) {
      const g=id=>{const s=document.querySelector('#fig-'+fam+'-'+id+' svg');
        const sub=s.querySelector('.sx-curve,.sx-nl-seg,.sx-point');
        const ax=s.querySelector('.sx-axis line,.sx-nl-axis line');
        // a scatter's subject is a filled dot, so its weight is the radius
        const w=sub.classList.contains('sx-point')
          ? +sub.getAttribute('r') : parseFloat(getComputedStyle(sub).strokeWidth);
        return {w:Math.round(s.getBoundingClientRect().width),
                h:Math.round(s.getBoundingClientRect().height),
                sub:w, ax:parseFloat(getComputedStyle(ax).strokeWidth)};};
      o[fam]={today:g('today'), fixed:g('fixed')};
    }
    return o;
  });
  for (const [fam,v] of Object.entries(comp)) {
    ok(`[${theme}] ${fam}: recomposed figure is wider`, v.fixed.w > v.today.w,
       `${v.today.w}px -> ${v.fixed.w}px`);
    ok(`[${theme}] ${fam}: the subject outweighs the scaffolding`, v.fixed.sub > v.fixed.ax,
       `subject ${v.fixed.sub} vs axis ${v.fixed.ax}`);
  }

  // ── per-family differences are REAL, not described
  const diff = await p.evaluate(()=>{
    const q=(sel)=>document.querySelector(sel);
    const n=(sel)=>document.querySelectorAll(sel).length;
    const svg=id=>q('#fig-'+id+' svg');
    const vlines=s=>[...s.querySelectorAll('.sx-grid line')].filter(l=>l.getAttribute('x1')===l.getAttribute('x2')).length;
    const hlines=s=>[...s.querySelectorAll('.sx-grid line')].filter(l=>l.getAttribute('y1')===l.getAttribute('y2')).length;
    const fn=svg('fn-fixed'), geo=svg('geo-fixed'), stat=svg('stat-fixed');
    // equal scales: one unit in x vs one unit in y, in pixels
    const scale=s=>{const t=[...s.querySelectorAll('.sx-tickmark')];return t.length;};
    return {
      statVerticals: vlines(stat), statHorizontals: hlines(stat),
      // one square per unit, read off the numeral VALUES a student counts
      unitStep: (()=>{
        const nx=[...geo.querySelectorAll('.sx-tick text')]
          .filter(t=>!t.classList.contains('sx-label'))
          .map(t=>({x:+t.getAttribute('x'),y:+t.getAttribute('y'),
                    v:parseFloat(t.textContent.replace('\u2212','-'))}));
        const rows={};
        nx.forEach(p=>{const k=Math.round(p.y); (rows[k]=rows[k]||[]).push(p.v);});
        const row=(Object.values(rows).sort((a,b)=>b.length-a.length)[0]||[]).sort((a,b)=>a-b);
        const g=[]; for(let i=1;i<row.length;i++) g.push(row[i]-row[i-1]);
        g.sort((a,b)=>a-b);
        return g.length?g[Math.floor(g.length/2)]:0;
      })(),
      geoLabels: [...geo.querySelectorAll('.sx-label')].map(t=>t.textContent).sort().join(''),
      fnLabels: geo && [...fn.querySelectorAll('.sx-label')].length,
      statArrows: [...stat.querySelectorAll('.sx-axis line')].filter(l=>l.getAttribute('marker-end')).length,
      fnArrows: [...fn.querySelectorAll('.sx-axis line')].filter(l=>l.getAttribute('marker-end')).length,
    };
  });
  ok(`[${theme}] the scatter has horizontal rules and no verticals`,
     diff.statVerticals===0 && diff.statHorizontals>2,
     `${diff.statVerticals} vertical, ${diff.statHorizontals} horizontal`);
  ok(`[${theme}] geometry is one square per unit`, diff.unitStep === 1,
     'numerals step by ' + diff.unitStep);
  ok(`[${theme}] geometry names O, A and B; the function graph names nothing`,
     diff.geoLabels==='ABO' && diff.fnLabels===0, `"${diff.geoLabels}" / ${diff.fnLabels}`);
  ok(`[${theme}] the plane keeps arrowheads, the scatter has none`,
     diff.fnArrows===2 && diff.statArrows===0, `fn ${diff.fnArrows}, stat ${diff.statArrows}`);

  // ── equal scales where they are mandatory, absent where they are not
  const aspect = await p.evaluate(()=>{
    const o={};
    for (const id of ['geo-fixed','fn-fixed']) {
      const s=document.querySelector('#fig-'+id+' svg');
      const xs=[...s.querySelectorAll('.sx-grid line')].filter(l=>l.getAttribute('x1')===l.getAttribute('x2'))
        .map(l=>+l.getAttribute('x1')).sort((a,b)=>a-b);
      const ys=[...s.querySelectorAll('.sx-grid line')].filter(l=>l.getAttribute('y1')===l.getAttribute('y2'))
        .map(l=>+l.getAttribute('y1')).sort((a,b)=>a-b);
      o[id]={dx:xs.length>1?xs[1]-xs[0]:0, dy:ys.length>1?ys[1]-ys[0]:0};
    }
    return o;
  });
  ok(`[${theme}] geometry keeps equal scales`,
     Math.abs(aspect['geo-fixed'].dx-aspect['geo-fixed'].dy)<0.02,
     `dx ${aspect['geo-fixed'].dx.toFixed(2)} dy ${aspect['geo-fixed'].dy.toFixed(2)}`);
  ok(`[${theme}] the function graph deliberately does not`,
     Math.abs(aspect['fn-fixed'].dx-aspect['fn-fixed'].dy)>1,
     `dx ${aspect['fn-fixed'].dx.toFixed(2)} dy ${aspect['fn-fixed'].dy.toFixed(2)}`);

  // ── contrast on the exam surface
  const exam = await p.evaluate(()=>getComputedStyle(document.querySelector('.q')).backgroundColor);
  const c = await p.evaluate(()=>{const g=(s,pr)=>{const e=document.querySelector(s);return e?getComputedStyle(e)[pr]:null;};
    return {stem:g('.stem','color'), num:g('.sx-tick text','fill'), ink:g('.sx-series','color'),
            axis:g('.sx-axis line','stroke'), lab:g('.sx-label','fill'),
            optRule:g('.opts li','borderTopColor'), tRule:g('.t-new tbody td','borderTopColor'),
            tTxt:g('.t-new tbody td','color')};});
  for (const [k,min] of [['stem',4.5],['num',4.5],['ink',3],['axis',3],['lab',4.5],['optRule',3],['tRule',3],['tTxt',4.5]])
    ok(`[${theme}] ${k} ≥ ${min}:1 on the exam surface`, cr(c[k],exam)>=min, cr(c[k],exam).toFixed(2)+':1');

  // ── the drawing is clipped to the declared window.
  //    getBoundingClientRect ignores clip-path, so a "does it spill" check on
  //    the live figure measures geometry, not paint, and would pass either way.
  //    Instead: the clip rect must equal the plot window, and a spec built to
  //    overflow must actually be bounded by it.
  const clip = await p.evaluate(()=>{
    const out={};
    for (const id of ['fn-fixed','geo-fixed','stat-fixed']) {
      const svg=document.querySelector('#fig-'+id+' svg');
      const g=svg.querySelector('.sx-series');
      const r=svg.querySelector('clipPath rect');
      const b=g.getBBox();
      out[id]={clipped:!!g.getAttribute('clip-path'),
               rect:r&&{x:+r.getAttribute('x'),y:+r.getAttribute('y'),
                        w:+r.getAttribute('width'),h:+r.getAttribute('height')},
               bbox:{x:Math.round(b.x),y:Math.round(b.y),
                     r:Math.round(b.x+b.width),b:Math.round(b.y+b.height)}};
    }
    // a curve deliberately sent far outside its window
    const {drawPlot}=globalThis.SiExplore;
    const pts=[]; for(let x=-4;x<=4;x+=0.25) pts.push([x,x*x*x]);
    const svg=drawPlot({xRange:[-2,2],yRange:[-2,2],xLabel:'x',yLabel:'y',curves:[{points:pts}]},
      {aspect:'data',axes:'plane',width:400,height:260,figures:[{mode:'curve'}]});
    document.body.appendChild(svg);
    const r=svg.querySelector('clipPath rect');
    const g=svg.querySelector('.sx-series');
    const b=svg.querySelector('.sx-curve').getBBox();
    const bounded = b.y < +r.getAttribute('y') || b.y+b.height > +r.getAttribute('y')+ +r.getAttribute('height');
    svg.remove();
    out.overflowCase={clipped:!!g.getAttribute('clip-path'), reallyOverflows:bounded};
    return out;
  });
  for (const id of ['fn-fixed','geo-fixed','stat-fixed']) {
    const v=clip[id];
    ok(`[${theme}] ${id}: the series is clipped to its window`, v.clipped && !!v.rect,
       JSON.stringify(v.rect));
    ok(`[${theme}] ${id}: the declared window actually contains the figure`,
       v.bbox.x >= v.rect.x-1 && v.bbox.r <= v.rect.x+v.rect.w+1 &&
       v.bbox.y >= v.rect.y-1 && v.bbox.b <= v.rect.y+v.rect.h+1,
       `bbox ${JSON.stringify(v.bbox)} vs rect ${JSON.stringify(v.rect)}`);
  }
  ok(`[${theme}] and a curve that does overflow is clipped rather than drawn outside`,
     clip.overflowCase.clipped && clip.overflowCase.reallyOverflows,
     JSON.stringify(clip.overflowCase));

  // ── a vertex label that lands on an axis numeral reads as a mistake. Placed
  //    on the first clear position of a ring, and checked against real boxes.
  const labs = await p.evaluate(()=>{
    const out=[];
    for (const host of document.querySelectorAll('.figbox')) {
      const svg=host.querySelector('svg'); if(!svg) continue;
      const L=[...svg.querySelectorAll('.sx-label')];
      const N=[...svg.querySelectorAll('.sx-tick text')].filter(t=>!t.classList.contains('sx-label'));
      const hit=(a,b)=>!(a.right<b.left||b.right<a.left||a.bottom<b.top||b.bottom<a.top);
      for (const l of L) {
        for (const n of N) if (hit(l.getBoundingClientRect(), n.getBoundingClientRect()))
          out.push(host.id+': "'+l.textContent+'" on "'+n.textContent+'"');
        for (const m of L) if (m!==l && hit(l.getBoundingClientRect(), m.getBoundingClientRect()))
          out.push(host.id+': "'+l.textContent+'" on "'+m.textContent+'"');
      }
    }
    return out;
  });
  ok(`[${theme}] no vertex label sits on a numeral or another label`, labs.length===0,
     labs.join(' | '));

  // ...and on a figure built so the naive placement WOULD collide: vertices
  // sitting on the axes at labelled values, which is where exam figures put
  // them. Without the ring this reports overlaps.
  const ring = await p.evaluate(()=>{
    const {drawPlot}=globalThis.SiExplore;
    const svg=drawPlot({xRange:[-1,7],yRange:[-1,7],xLabel:'x',yLabel:'y',
      curves:[{points:[[0,0],[5,0],[5,5],[0,5]]}]},
      {aspect:'plane',gridMode:'major',width:420,maxHeight:420,originLabel:'O',
       figures:[{mode:'polygon',labels:['','P','Q','R']}]});
    document.body.appendChild(svg);
    const L=[...svg.querySelectorAll('.sx-label')];
    const N=[...svg.querySelectorAll('.sx-tick text')].filter(t=>!t.classList.contains('sx-label'));
    const hit=(a,b)=>!(a.right<b.left||b.right<a.left||a.bottom<b.top||b.bottom<a.top);
    const bad=[];
    for (const l of L) for (const n of N)
      if (hit(l.getBoundingClientRect(), n.getBoundingClientRect()))
        bad.push(l.textContent+'/'+n.textContent);
    const placed=L.map(t=>t.textContent).sort().join('');
    svg.remove();
    return {bad, placed};
  });
  ok(`[${theme}] vertices on the axes are placed clear of the numerals`,
     ring.bad.length===0, ring.bad.join(' '));
  ok(`[${theme}] ...and all four labels are actually drawn`, ring.placed==='OPQR', ring.placed);

  // ── one arrowhead per end of a number line, and the ray's is not scaled by
  //    how heavy the ray is
  const nlArrows = await p.evaluate(()=>{
    const out={};
    for (const id of ['nl-today','nl-fixed']) {
      const svg=document.querySelector('#fig-'+id+' svg');
      const axis=svg.querySelector('.sx-nl-axis line');
      const seg=svg.querySelector('.sx-nl-seg');
      const ray=svg.querySelector('#sx-ar-ray');
      out[id]={axisEnd:!!axis.getAttribute('marker-end'),
               segEnd:(seg.getAttribute('marker-end')||'').includes('ray'),
               rayUnits:ray&&ray.getAttribute('markerUnits'),
               segW:parseFloat(getComputedStyle(seg).strokeWidth)};
    }
    return out;
  });
  for (const [id,v] of Object.entries(nlArrows)) {
    ok(`[${theme}] ${id}: exactly one arrowhead at the open end`,
       v.segEnd && !v.axisEnd, JSON.stringify(v));
    ok(`[${theme}] ${id}: the ray's arrow is not scaled by the ray's weight`,
       v.rayUnits==='userSpaceOnUse', String(v.rayUnits));
  }

  // ═══ the Screen-native decision for the data family ═══════════════════════
  const dataFigs = await p.evaluate(()=>{
    const ids=['fig-stat-fixed','dat-fit','dat-bar','dat-line'];
    const o={};
    for (const id of ids) {
      const host=document.getElementById(id), svg=host.querySelector('svg');
      const g=[...svg.querySelectorAll('.sx-grid line')];
      const pt=svg.querySelector('.sx-point');
      o[id]={
        verticals:g.filter(l=>l.getAttribute('x1')===l.getAttribute('x2')).length,
        horizontals:g.filter(l=>l.getAttribute('y1')===l.getAttribute('y2')).length,
        arrows:[...svg.querySelectorAll('line')].filter(l=>l.getAttribute('marker-end')||l.getAttribute('marker-start')).length,
        legend:svg.querySelectorAll('.sx-legend,.sx-swatch').length,
        titles:svg.querySelectorAll('title,desc').length,  // scoped: svg is the root here
        bgRect:[...svg.querySelectorAll('rect')].filter(r=>!r.closest('clipPath')&&!r.classList.contains('sx-bar')).length,
        direct:[...svg.querySelectorAll('.sx-direct')].map(t=>t.textContent),
        ylabUpright:(()=>{const t=svg.querySelector('.sx-ylab');
          return t? !(t.getAttribute('transform')||'').includes('rotate') : null;})(),
        ptR: pt? +getComputedStyle(pt).r.replace('px','')||+pt.getAttribute('r') : null,
        ink: getComputedStyle(svg.querySelector('.sx-series')).color,
      };
    }
    return o;
  });
  const exam2 = await p.evaluate(()=>getComputedStyle(document.querySelector('.q')).backgroundColor);
  for (const [id,v] of Object.entries(dataFigs)) {
    ok(`[${theme}] ${id}: reference lines run across only`,
       v.verticals===0 && v.horizontals>=3, `${v.verticals}V / ${v.horizontals}H`);
    ok(`[${theme}] ${id}: no coordinate-plane arrowheads`, v.arrows===0, 'arrows '+v.arrows);
    ok(`[${theme}] ${id}: no legend`, v.legend===0, 'legend nodes '+v.legend);
    ok(`[${theme}] ${id}: no native tooltip source`, v.titles===0, '<title>/<desc> '+v.titles);
    ok(`[${theme}] ${id}: no panel or card inside the figure`, v.bgRect===0, 'rects '+v.bgRect);
    ok(`[${theme}] ${id}: the data carries the validated hue`, cr(v.ink, exam2)>=3,
       v.ink+' '+cr(v.ink, exam2).toFixed(2)+':1');
    if (v.ptR!==null) ok(`[${theme}] ${id}: markers are at least 8px across`, v.ptR*2>=8,
       (v.ptR*2)+'px');
    if (v.ylabUpright!==null) ok(`[${theme}] ${id}: the y title is not rotated`, v.ylabUpright);
  }
  ok(`[${theme}] two series are told apart by direct labels, not a legend`,
     dataFigs['dat-line'].direct.sort().join('/')==='Class A/Class B',
     dataFigs['dat-line'].direct.join(','));
  ok(`[${theme}] the fit line names itself`,
     dataFigs['dat-fit'].direct.join('')==='Line of best fit', dataFigs['dat-fit'].direct.join(','));

  // ...and the label is actually READABLE: not clipped by the window and not
  // running off the figure. The DOM said "Line of best fit" while the screen
  // showed "Li".
  const labelsVisible = await p.evaluate(()=>{
    const bad=[];
    for (const t of document.querySelectorAll('.sx-direct')) {
      const svg=t.closest('svg'), b=t.getBBox(), sb=svg.viewBox.baseVal;
      if (t.closest('[clip-path]')) bad.push(t.textContent+': inside a clipped group');
      if (b.x + b.width > sb.width + 0.5) bad.push(t.textContent+': runs off the figure');
    }
    return bad;
  });
  ok(`[${theme}] every direct label is fully visible`, labelsVisible.length===0,
     labelsVisible.join(' | '));

  // the decision is NOT forced onto the other families. Both colours are
  // resolved by the browser so an rgb() string is never compared to a hex one.
  const notForced = await p.evaluate(()=>{
    const probe=document.createElement('span');
    probe.style.display='none'; document.body.appendChild(probe);
    const resolve=v=>{probe.style.color=v; return getComputedStyle(probe).color;};
    const ink=resolve('var(--fig-ink)'), hue=resolve('var(--data-1)');
    const o={ink, hue, fams:{}};
    for (const id of ['fig-fn-fixed','fig-geo-fixed','fig-nl-fixed'])
      o.fams[id]=getComputedStyle(document.querySelector('#'+id+' .sx-series')).color;
    probe.remove();
    return o;
  });
  ok(`[${theme}] the data hue and the figure ink are actually different colours`,
     notForced.ink !== notForced.hue, notForced.ink+' vs '+notForced.hue);
  for (const [id,c] of Object.entries(notForced.fams))
    ok(`[${theme}] ${id} is untouched by the data decision — still ink, not hue`,
       c === notForced.ink && c !== notForced.hue, c);

  // the whole page is inert: no interactivity anywhere, in code not prose
  const inert = await p.evaluate(()=>{
    const src=[...document.querySelectorAll('script')].map(s=>s.textContent).join('\n')
      .replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
    return {code:/addEventListener|onmouse|mouseover|tooltip|onclick/i.test(src),
            attrs:document.querySelectorAll('[onclick],[onmouseover],[title]').length};
  });
  ok(`[${theme}] the page carries no interactivity`, !inert.code && inert.attrs===0,
     JSON.stringify(inert));

  const sc = await p.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.clientWidth]);
  ok(`[${theme}] page does not scroll sideways`, sc[0]<=sc[1]+1, sc.join(' vs '));

  const names=['0-faults','1-function','2-geometry','3-data','4-numberline','5-tables'];
  const secs=await p.$$('section.fam');
  for (let i=0;i<secs.length;i++)
    await secs[i].screenshot({path:path.join(OUT,names[i]+(theme==='dark'?'-dark':'')+'.png')});
  if (theme==='light') await p.screenshot({path:path.join(OUT,'full.png'),fullPage:true});
  await ctx.close();
 }
 await br.close();
 if (fails.length){console.log(fails.join('\n'));console.log(`\n${fails.length} FAILED, ${pass.length} passed`);process.exit(1);}
 console.log(pass.join('\n')); console.log(`\nALL ${pass.length} CHECKS PASSED`);
})();
