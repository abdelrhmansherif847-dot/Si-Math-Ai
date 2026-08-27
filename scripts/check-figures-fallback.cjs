const { chromium } = require('playwright'); const path=require('path');
(async()=>{
 const br=await chromium.launch(); const ctx=await br.newContext(); const p=await ctx.newPage();
 await p.goto('file://'+path.join(__dirname,'e2e-preview.html')); await p.waitForTimeout(400);
 const r = await p.evaluate(()=>{
   const {renderForQuestion} = globalThis.SiExplore;
   const base = globalThis.PAYLOAD[0].stimulus;
   const q = {id:'q', reading:'value'};
   const out = {};
   const spec = JSON.parse(JSON.stringify(base.spec));
   delete spec.figures;
   try { renderForQuestion(q, {id:'s', kind:'plot', spec}); out.noFigures='drew'; }
   catch(e){ out.noFigures='refused: '+e.message.slice(0,70); }
   spec.figures = [];
   try { renderForQuestion(q, {id:'s', kind:'plot', spec}); out.emptyFigures='drew'; }
   catch(e){ out.emptyFigures='refused'; }
   spec.figures = [{mode:'scatter'}];
   try { const svg = renderForQuestion(q, {id:'s', kind:'plot', spec});
         out.asScatter = svg.querySelectorAll('.sx-point').length + 'pts/' +
                         svg.querySelectorAll('.sx-curve').length + 'curves'; }
   catch(e){ out.asScatter='refused: '+e.message.slice(0,50); }
   spec.figures = [{mode:'curve'}];
   try { const svg = renderForQuestion(q, {id:'s', kind:'plot', spec});
         out.asCurve = svg.querySelectorAll('.sx-point').length + 'pts/' +
                       svg.querySelectorAll('.sx-curve').length + 'curves'; }
   catch(e){ out.asCurve='refused'; }
   return out;
 });
 const fails=[],pass=[];
 const ok=(n,c,d)=>{(c?pass:fails).push((c?'PASS  ':'FAIL  ')+n+(d?'  — '+d:''));};
 ok('a plot with NO figures[] is refused, not defaulted to a curve',
    /^refused/.test(r.noFigures), r.noFigures);
 ok('an EMPTY figures[] is refused too', r.emptyFigures==='refused', r.emptyFigures);
 ok('the same points draw as a SCATTER when figures says so',
    /^\d+pts\/0curves$/.test(r.asScatter) && parseInt(r.asScatter)>5, r.asScatter);
 ok('...and as a CURVE when it says that instead',
    /^0pts\/1curves$/.test(r.asCurve), r.asCurve);
 await br.close();
 if (fails.length){console.log(fails.join('\n'));process.exit(1);}
 console.log(pass.join('\n')); console.log(`\nALL ${pass.length} CHECKS PASSED`);
})();
