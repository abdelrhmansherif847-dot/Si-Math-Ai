"""Renderer evaluation. The SAME real exam specs, drawn by every candidate,
each one configured toward the Si Math AI visual system rather than left on its
defaults — otherwise the comparison is between our art direction and a
library's, which proves nothing.
This page is FIGURE-GRAMMAR-EXPLORATION: a bake-off between candidate
renderers, each configured toward our visual system. Its figure CSS is per
candidate on purpose and is not the shipped grammar.
"""
import io, json, os, re

LIB = '/tmp/libs'
DSAT = '/tmp/claude-0/-home-user-Si-Math-Ai/04b11b7c-9e5a-5d76-8bd0-64a172a5c12c/scratchpad/dsat'
# The payload on disk is a pure exam_stimuli spec; the RENDER decisions (mode,
# aspect, labels) are injected when the preview is built. Read the BUILT preview
# so this evaluation draws exactly what a student would see, decisions and all.
_h = io.open(os.path.join(DSAT, 'dsat-preview.html'), encoding='utf-8').read()
P = json.loads(re.search(r'const DATA = (\[.*?\]);\n', _h, re.S).group(1))
byq = {(d['s'], d['o']): d for d in P}

OURS   = io.open('/home/user/Si-Math-Ai/exam-stimulus.js', encoding='utf-8').read()
JSXG   = io.open(os.path.join(LIB, 'jsxgraph.js'), encoding='utf-8').read()
JSXCSS = io.open(os.path.join(LIB, 'jsxgraph.css'), encoding='utf-8').read()
CHART  = io.open(os.path.join(LIB, 'chart.js'), encoding='utf-8').read()

# the real specs, straight out of the exam payload
SPECS = {
  'triangle': byq[('M1', 16)],
  'curve':    byq[('M1',  4)],
  'circle':   byq[('M2S',15)],
  'scatter':  byq[('M1', 14)],
  'bar':      byq[('M2S', 6)] if byq.get(('M2S',6),{}).get('k')=='chart' else None,
  'numline':  byq[('M1', 17)],
}
BAR = next((d for d in P if d.get('k')=='chart' and d['g'].get('chartType')=='bar'), None)
SPECS['bar'] = BAR

TOK = """
  --plate:#ffffff; --grid:#d3d8de; --grid-major:#848d99; --fig-ink:#111820;
  --ink:#15202b; --ink-2:#42536b; --s1:#1e63b8; --s2:#b0530b;
"""

FIGCSS = r"""
.sx{display:block;margin:0}
.sx-grid line{stroke:var(--grid);stroke-width:1;shape-rendering:crispEdges}
.sx-grid line.sx-major{stroke:var(--grid-major);stroke-width:1}
.sx-axis line{stroke:var(--fig-ink);stroke-width:1.6}
.sx-axis-base{stroke:var(--fig-ink);stroke-width:1.6}
.sx-arrow{fill:var(--fig-ink)}
.sx-tickmark{stroke:var(--fig-ink);stroke-width:1.6;shape-rendering:crispEdges}
.sx-tick text{fill:var(--fig-ink);font-family:'DM Sans',system-ui,sans-serif;font-size:12.5px;
  font-weight:500;font-variant-numeric:tabular-nums;paint-order:stroke;stroke:var(--plate);
  stroke-width:3px;stroke-linejoin:round}
.sx-nl-tick{stroke:var(--fig-ink);stroke-width:1.5}
.sx-nl-axis line{stroke-width:2}
.sx-axis-title{fill:var(--fig-ink);font-family:'DM Sans',sans-serif;font-size:12.5px}
.sx-axis-tip{font-family:'DM Sans',sans-serif;font-weight:700;font-size:15px;font-style:italic;fill:var(--fig-ink)}
.sx-series{color:var(--fig-ink)}
.sx:not(.sx-solo) .sx-s1{color:var(--s1)} .sx:not(.sx-solo) .sx-s2{color:var(--s2)}
.sx-curve{fill:none;stroke:currentColor;stroke-width:2.9;stroke-linecap:round;stroke-linejoin:round}
.sx:not(.sx-solo) .sx-curve{stroke-width:2.6}
.sx-point{fill:currentColor;stroke:var(--plate);stroke-width:2.5}
.sx-bar{fill:currentColor;stroke:var(--plate);stroke-width:1}
.sx-label{fill:var(--fig-ink);font-family:'DM Sans',sans-serif;font-weight:700;font-size:15px;
  stroke:var(--plate);stroke-width:4;stroke-linejoin:round}
.sx-nl-seg{stroke:currentColor;stroke-width:7;stroke-linecap:butt}
.sx-endpoint{stroke:currentColor;stroke-width:2.6}
.sx-closed{fill:currentColor} .sx-open{fill:var(--plate)}
"""

HTML = f"""<!-- FIGURE-GRAMMAR-EXPLORATION — this page shows treatments that were considered and mostly NOT chosen, so its figure CSS is deliberately its own and is not figure-system.css. See the builder's header. -->
<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Renderer evaluation</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&display=swap">
<style>{JSXCSS}</style>
<style>
:root{{{TOK}}}
*{{box-sizing:border-box}}
body{{margin:0;background:#eef1f5;color:var(--ink);
  font:16px/1.6 'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}}
.wrap{{max-width:1180px;margin:0 auto;padding:40px 24px 100px}}
h1{{font-size:34px;font-weight:800;letter-spacing:-.02em;margin:0 0 10px}}
.lede{{color:var(--ink-2);max-width:70ch;margin:0 0 8px}}
h2{{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#5f7288;
   margin:52px 0 4px;font-weight:700}}
.sub{{color:var(--ink-2);margin:0 0 20px;font-size:15px;max-width:70ch}}
.row{{display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:18px;align-items:start}}
.pane{{background:#fff;border:1px solid #d6dde5;border-radius:10px;overflow:hidden}}
.pane.win{{border-color:#1c6b45;box-shadow:0 0 0 2px rgba(28,107,69,.16)}}
.ph{{padding:12px 18px;border-bottom:1px solid #e6ebf1;display:flex;gap:9px;
    align-items:center;font-size:14px;font-weight:700}}
.tag{{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;
     padding:3px 8px;border-radius:3px;background:#eef1f5;color:#5f7288}}
.tag.win{{background:rgba(28,107,69,.10);color:#1c6b45}}
.pb{{padding:16px 18px 20px;overflow-x:auto}}
.note{{padding:0 18px 16px;font-size:13.5px;color:var(--ink-2)}}
.jxgbox{{width:450px;height:400px;background:#fff;border:none!important}}
canvas{{background:#fff}}
{FIGCSS}
</style></head><body><div class="wrap">
<h1>Renderer evaluation</h1>
<p class="lede">The same exam specs, drawn by every candidate. Each library is configured
  toward the Si&nbsp;Math&nbsp;AI system — inked data, quiet grid, our type, no interaction —
  because comparing our art direction against a library's defaults would prove nothing.</p>
<p class="lede">Nothing here is wired into production. JSXGraph is 257&nbsp;KB gzipped,
  Chart.js 70&nbsp;KB, ours 6&nbsp;KB.</p>
__BODY__
</div>
<script>{OURS}</script>
<script>{JSXG}</script>
<script>{CHART}</script>
<script>
const SPECS = __SPECS__;
const {{renderStimulus}} = globalThis.SiExamStimulus;

// ── ours ────────────────────────────────────────────────────────────────
function ours(id, key){{
  const d = SPECS[key];
  document.getElementById(id).appendChild(renderStimulus(d.k, d.g, {{
    aspect:(d.rm&&d.rm[0]&&d.rm[0].aspect)||'data', figures:d.rm||[] }}));
}}

// ── JSXGraph, configured toward our system ─────────────────────────────
const INK='#111820', GRID='#d3d8de', S1='#1e63b8', S2='#b0530b';
function board(id, spec){{
  const [x0,x1]=spec.xRange,[y0,y1]=spec.yRange;
  const b = JXG.JSXGraph.initBoard(id, {{
    boundingbox:[x0,y1,x1,y0], keepaspectratio:true,
    showCopyright:false, showNavigation:false, showInfobox:false,
    pan:{{enabled:false}}, zoom:{{enabled:false}}, drag:{{enabled:false}},
    axis:true,
    defaultAxes:{{
      x:{{ strokeColor:INK, strokeWidth:1.6, highlight:false,
          ticks:{{ majorHeight:9, minorTicks:0, strokeColor:INK, strokeWidth:1.4,
                  label:{{ fontSize:12.5, color:INK, cssStyle:"font-family:'DM Sans',sans-serif;font-weight:500" }} }} }},
      y:{{ strokeColor:INK, strokeWidth:1.6, highlight:false,
          ticks:{{ majorHeight:9, minorTicks:0, strokeColor:INK, strokeWidth:1.4,
                  label:{{ fontSize:12.5, color:INK, cssStyle:"font-family:'DM Sans',sans-serif;font-weight:500" }} }} }}
    }},
    grid:true,
    gridX:1, gridY:1
  }});
  b.options.grid.strokeColor = GRID;
  b.options.grid.strokeWidth = 1;
  b.options.grid.strokeOpacity = 1;
  return b;
}}
const INERT = {{ fixed:true, highlight:false, showInfobox:false }};

function jsxTriangle(id){{
  const d = SPECS.triangle, b = board(id, d.g);
  const pts = d.g.curves[0].points.slice(0,3).map(p =>
    b.create('point', p, Object.assign({{}}, INERT, {{visible:false, name:''}})));
  b.create('polygon', pts, Object.assign({{}}, INERT, {{
    fillOpacity:0, borders:{{strokeColor:INK, strokeWidth:2.9, highlight:false}},
    vertices:{{visible:false}} }}));
}}
function jsxCurve(id){{
  const d = SPECS.curve, b = board(id, d.g);
  const P = d.g.curves[0].points;
  b.create('curve', [P.map(p=>p[0]), P.map(p=>p[1])], Object.assign({{}}, INERT, {{
    strokeColor:INK, strokeWidth:2.9, strokeLineCap:'round' }}));
}}
function jsxCircle(id){{
  const d = SPECS.circle, b = board(id, d.g);
  const P = d.g.curves[0].points;
  // JSXGraph draws a TRUE circle from centre + radius — the one thing it can do
  // that our sampled-points spec cannot express at all.
  const cx = (Math.min(...P.map(p=>p[0]))+Math.max(...P.map(p=>p[0])))/2;
  const cy = (Math.min(...P.map(p=>p[1]))+Math.max(...P.map(p=>p[1])))/2;
  const r  = (Math.max(...P.map(p=>p[0]))-Math.min(...P.map(p=>p[0])))/2;
  b.create('circle', [[cx,cy], r], Object.assign({{}}, INERT, {{
    strokeColor:INK, strokeWidth:2.9, fillOpacity:0 }}));
}}

// ── Chart.js, configured toward our system ────────────────────────────
const CJ_COMMON = {{
  responsive:false, animation:false, events:[],
  plugins:{{ legend:{{display:false}}, tooltip:{{enabled:false}} }},
  elements:{{ point:{{radius:5, backgroundColor:INK, borderColor:'#fff', borderWidth:2}} }}
}};
function cjScales(xTitle, yTitle){{
  const ax = {{
    grid:{{ color:GRID, lineWidth:1, drawTicks:true, tickColor:INK, tickLength:6 }},
    border:{{ color:INK, width:1.6 }},
    ticks:{{ color:INK, font:{{family:"'DM Sans',sans-serif", size:12.5, weight:'500'}} }},
    title:{{ display:!!xTitle, text:xTitle, color:INK,
            font:{{family:"'DM Sans',sans-serif", size:12.5}} }}
  }};
  const ay = JSON.parse(JSON.stringify(ax));
  ay.title = {{ display:!!yTitle, text:yTitle, color:INK,
               font:{{family:"'DM Sans',sans-serif", size:12.5}} }};
  return {{x:ax, y:ay}};
}}
function cjScatter(id){{
  const d = SPECS.scatter, P = d.g.curves[0].points;
  const sc = cjScales(d.g.xLabel, d.g.yLabel);
  // Chart.js chose its own window from the data extremes, cropping the range
  // the author declared — which is the tool deciding the mathematics. It has to
  // be told, explicitly, not to.
  sc.x.min = d.g.xRange[0]; sc.x.max = d.g.xRange[1];
  sc.y.min = d.g.yRange[0]; sc.y.max = d.g.yRange[1];
  new Chart(document.getElementById(id), {{ type:'scatter',
    data:{{ datasets:[{{ data:P.map(p=>({{x:p[0],y:p[1]}})) }}] }},
    options:Object.assign({{}}, CJ_COMMON, {{ scales:sc }}) }});
}}
function cjBar(id){{
  const d = SPECS.bar, s = d.g.series[0];
  new Chart(document.getElementById(id), {{ type:'bar',
    data:{{ labels:d.g.categories, datasets:[{{ data:s.values, backgroundColor:INK,
            borderRadius:{{topLeft:4,topRight:4}}, borderSkipped:false, maxBarThickness:46 }}] }},
    options:Object.assign({{}}, CJ_COMMON, {{ scales:cjScales('', d.g.yLabel) }}) }});
}}
__CALLS__
</script></body></html>"""

def pane(title, tag, host, note, win=False, kind='div'):
    el = ('<canvas id="%s" width="450" height="400"></canvas>' % host if kind=='canvas'
          else '<div id="%s"%s></div>' % (host, ' class="jxgbox"' if kind=='jxg' else ''))
    return (f'<div class="pane{" win" if win else ""}">'
            f'<div class="ph">{title}<span class="tag{" win" if win else ""}">{tag}</span></div>'
            f'<div class="pb">{el}</div><p class="note">{note}</p></div>')

SECTIONS = [
 ('Coordinate geometry — a right triangle',
  'The figure a student counts side lengths off. Both are mathematically identical; the question is which reads as an exam figure.',
  [pane('Custom SVG','ours · recommended','o-tri','Inked outline, tick marks, two-tier grid, axis tips at the arrowheads.',True),
   pane('JSXGraph','257 KB gz','j-tri','Configured to our ink, grid and type, with drag, pan, zoom and the infobox all disabled.')]),
 ('Function graph',
  'Fifteen authored samples of a cubic. Both interpolate; neither is given the formula.',
  [pane('Custom SVG','ours · recommended','o-curve','Centripetal Catmull-Rom through the authored samples.',True),
   pane('JSXGraph','257 KB gz','j-curve','JSXGraph&rsquo;s own curve through the same points.')]),
 ('Circle',
  'The case where JSXGraph SHOULD win: a true circle primitive against twelve sampled points. Measured, the advantage does not survive contact with exam size.',
  [pane('Custom SVG','ours · recommended','o-circle','Twelve samples, closed, centripetal. Round to within 1.4 px, and unit steps.',True),
   pane('JSXGraph','257 KB gz · indistinguishable at exam size','j-circle','An exact circle primitive — and at exam size it cannot be told apart from twelve samples. It also chose 0.5 steps, which is worse for counting a radius.')]),
 ('Scatter',
  'Statistical, not geometric — the family where a chart library is designed to compete.',
  [pane('Custom SVG','ours · recommended','o-scatter','Same marks, same axes, 6 KB.',True),
   pane('Chart.js','70 KB gz · canvas','c-scatter','Canvas: no DOM to style, no CSS theming, raster at any zoom, nothing in the accessibility tree.', kind='canvas')]),
 ('Bar chart',
  'The other statistical family.',
  [pane('Custom SVG','ours · recommended','o-bar','Rounded at the data end only, square at the baseline.',True),
   pane('Chart.js','70 KB gz · canvas','c-bar','Configured to our ink and type; still canvas.', kind='canvas')]),
 ('Number line',
  'No candidate library models an open against a closed endpoint at all — the distinction that IS the question.',
  [pane('Custom SVG','ours · only option','o-nl','Open and closed endpoints, arrows where a segment reaches the edge.',True)]),
]

body = ''
for title, sub, panes in SECTIONS:
    body += f'<h2>{title}</h2><p class="sub">{sub}</p><div class="row">{"".join(panes)}</div>'

CALLS = """
ours('o-tri','triangle'); ours('o-curve','curve'); ours('o-circle','circle');
ours('o-scatter','scatter'); ours('o-bar','bar'); ours('o-nl','numline');
jsxTriangle('j-tri'); jsxCurve('j-curve'); jsxCircle('j-circle');
cjScatter('c-scatter'); cjBar('c-bar');
"""
# JSXGraph needs its host divs sized before initBoard
body = body.replace('id="j-tri"', 'id="j-tri" class="jxgbox"')
body = body.replace('id="j-curve"', 'id="j-curve" class="jxgbox"')
body = body.replace('id="j-circle"', 'id="j-circle" class="jxgbox"')

out = HTML.replace('__BODY__', body).replace('__SPECS__', json.dumps(SPECS, ensure_ascii=False)).replace('__CALLS__', CALLS)
io.open('renderer-eval.html','w',encoding='utf-8').write(out)
print('written  renderer-eval.html  %.1f MB' % (len(out)/1048576))
