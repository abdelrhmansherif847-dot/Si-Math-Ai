const { chromium } = require('playwright'); const path=require('path'), fs=require('fs');
const OUT=path.join(__dirname,'shots4'); fs.mkdirSync(OUT,{recursive:true});
const FILE = process.argv[2] || 'e2e-preview.html';
const LABEL = process.argv[3] || 'run';

(async()=>{
 const br=await chromium.launch(); const fails=[],pass=[];
 const ok=(n,c,d)=>{(c?pass:fails).push((c?'PASS  ':'FAIL  ')+n+(d?'  — '+d:''));};
 const ctx=await br.newContext({viewport:{width:1400,height:1000},deviceScaleFactor:2});
 const p=await ctx.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push('pageerror: '+e));
 p.on('console',m=>{if(m.type()==='error'&&!/fonts\.(googleapis|gstatic)/.test(m.text()+m.location().url))errs.push('console: '+m.text());});
 await p.goto('file://'+path.join(__dirname,FILE));
 await p.waitForTimeout(600);
 ok(`[${LABEL}] the page renders with no JS errors`, errs.length===0, errs.join(' | '));

 const r = await p.evaluate(()=>{
   const fig = ord => {
     const svg=document.querySelector('#fig-'+ord+' svg');
     const L=[...svg.querySelectorAll('.sx-grid line')];
     return {
       gridV:L.filter(l=>l.getAttribute('x1')===l.getAttribute('x2')).length,
       gridH:L.filter(l=>l.getAttribute('y1')===l.getAttribute('y2')).length,
       curve:svg.querySelector('.sx-curve').getAttribute('d').length,
       marks:svg.querySelectorAll('path,line,circle').length,
     };
   };
   const ords=[...document.querySelectorAll('[id^="fig-"]')].map(e=>+e.id.split('-')[1]).sort();
   const o={ords, figs:{}};
   for (const n of ords) o.figs[n]=fig(n);
   return o;
 });
 // the payload the page actually used, read from the page itself
 const payload = await p.evaluate(()=>globalThis.PAYLOAD);
 const byOrd = Object.fromEntries(payload.map(q=>[q.ordinal,q]));

 ok(`[${LABEL}] two questions rendered`, r.ords.length===2, r.ords.join(','));
 ok(`[${LABEL}] both reference ONE stimulus id`,
    payload[0].stimulus.id===payload[1].stimulus.id, payload[0].stimulus.id);
 ok(`[${LABEL}] and its spec is byte-identical between them`,
    JSON.stringify(payload[0].stimulus.spec)===JSON.stringify(payload[1].stimulus.spec));
 ok(`[${LABEL}] their readings differ`,
    payload[0].reading!==payload[1].reading,
    payload.map(q=>`Q${q.ordinal}=${q.reading}`).join(' '));

 // THE CLAIM: the figure follows the QUESTION's reading, whichever question holds it
 for (const n of r.ords) {
   const want = byOrd[n].reading;
   const f = r.figs[n];
   const gridded = f.gridV>2 && f.gridH>2;
   ok(`[${LABEL}] Q${n} reading="${want}" → ${want==='value'?'a grid':'no grid'}`,
      gridded === (want==='value'), `${f.gridV}V/${f.gridH}H`);
 }
 // ...and the two figures are genuinely different renderings of one spec
 const [a,b] = r.ords.map(n=>r.figs[n]);
 ok(`[${LABEL}] the two figures differ`, a.marks!==b.marks, `${a.marks} vs ${b.marks} marks`);
 ok(`[${LABEL}] but the CURVE is identical — only scaffolding changed`,
    a.curve===b.curve, `path length ${a.curve} vs ${b.curve}`);

 // the stimulus-only path is closed
 const closed = await p.evaluate(()=>{
   const {renderStimulus, renderForQuestion} = globalThis.SiExplore;
   const out = {};
   const s = globalThis.PAYLOAD[0].stimulus;
   try { renderStimulus(s.kind, s.spec, {}); out.stimulusAlone='drew'; }
   catch (e) { out.stimulusAlone='refused: '+e.message.slice(0,60); }
   try { renderForQuestion({id:'q',reading:null}, s); out.noReading='drew'; }
   catch (e) { out.noReading='refused'; }
   try { renderForQuestion({id:'q',reading:'value'}, s); out.withReading='drew'; }
   catch (e) { out.withReading='refused: '+e.message.slice(0,60); }
   return out;
 });
 ok(`[${LABEL}] renderStimulus(stimulus alone) is REFUSED`,
    /^refused/.test(closed.stimulusAlone), closed.stimulusAlone);
 ok(`[${LABEL}] renderForQuestion with no reading is REFUSED`,
    closed.noReading==='refused', closed.noReading);
 ok(`[${LABEL}] renderForQuestion with a reading draws`,
    closed.withReading==='drew', closed.withReading);

 await p.screenshot({path:path.join(OUT, LABEL+'.png'), fullPage:true});
 await ctx.close(); await br.close();
 // machine-readable line for the swap comparison
 fs.writeFileSync(path.join(OUT, LABEL+'.json'), JSON.stringify(
   Object.fromEntries(r.ords.map(n=>[n,{reading:byOrd[n].reading, grid:r.figs[n].gridV>2}])), null, 1));
 if (fails.length){console.log(fails.join('\n'));console.log(`\n${fails.length} FAILED, ${pass.length} passed`);process.exit(1);}
 console.log(pass.join('\n')); console.log(`\nALL ${pass.length} CHECKS PASSED`);
})();
