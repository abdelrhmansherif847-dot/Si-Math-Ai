"""Visual design directions — an exploration, not a patch.

Four genuinely different visual LANGUAGES for figures and five for tables. Not
variations of one look: each makes a different decision about what carries the
figure, so the choice in front of the owner is a real one.

Neutral mathematics throughout — no exam item appears here.
"""
import io, json, math

import os
HERE = os.path.dirname(os.path.abspath(__file__))
R = io.open(os.path.join(HERE, 'explore-render.js'), encoding='utf-8').read()

def samples(f,a,b,st):
    o=[];x=a
    while x<=b+1e-9: o.append([round(x,3),round(f(x),3)]); x+=st
    return o
def circ(cx,cy,r,n=12):
    return [[round(cx+r*math.cos(2*math.pi*i/n),3), round(cy+r*math.sin(2*math.pi*i/n),3)] for i in range(n)]

FIGS = {
 'geo':   dict(kind='plot', label='Coordinate geometry',
   spec=dict(xRange=[-1,7], yRange=[-1,6], xLabel='x', yLabel='y', curves=[
     dict(points=[[0,0],[5,0],[5,4],[0,0]]), dict(points=circ(2.2,2.4,1.2))]),
   opts=dict(aspect='plane', figures=[dict(mode='polygon'), dict(mode='curve', closed=True)])),
 'fn':    dict(kind='plot', label='Function graph',
   spec=dict(xRange=[-1,5], yRange=[-2,5], xLabel='x', yLabel='y',
     curves=[dict(points=samples(lambda x: x**3/3 - 2*x*x + 3*x + 0.6, -0.6, 4.6, 0.3))]),
   opts=dict(aspect='plane', figures=[dict(mode='curve')])),
 'stat':  dict(kind='plot', label='Scatter',
   spec=dict(xRange=[0,9], yRange=[10,36], xLabel='Weeks', yLabel='Books read',
     curves=[dict(points=[[1,14],[2,19],[3,17],[4,24],[5,26],[6,25],[7,31],[8,34]])]),
   opts=dict(aspect='data', figures=[dict(mode='scatter')])),
}

DIRECTIONS = [
 dict(id='plate', name='A · Plate',
   blurb='The figure lives inside a bounded frame with real margin, the way a plate sits in a textbook. '
         'The frame does the containing, so the grid can be very quiet and the whitespace inside it reads as deliberate.',
   opts=dict(frame=True, gridMode='major')),
 dict(id='open', name='B · Open',
   blurb='No grid and no frame. Axes, ticks and numerals only — the curve is the entire figure and whitespace '
         'carries the composition. The most editorial of the four, and the least like a rendered chart.',
   opts=dict(frame=False, gridMode='none')),
 dict(id='paper', name='C · Squared paper',
   blurb='A fine half-unit grid under a heavier unit rule, so the plate reads as the squared paper a student '
         'actually works on. Dense with mathematical information; the figure has to be bold to sit on top of it.',
   opts=dict(frame=False, gridMode='fine')),
 dict(id='screen', name='D · Screen-native',
   blurb='Light grid, thin dark axes, and the figure in a strong hue rather than ink — the language a student '
         'already sees on every Digital SAT question, because Desmos is on screen beside it the whole time.',
   opts=dict(frame=False, gridMode='major')),
]

TABLE_DATA = dict(headers=['Item','Price (EGP)','Discount'],
                  rows=[['Notebook','48','15%'],['Backpack','320','10%'],['Pen set','96','25%']])
TABLE_DIRS = [
 ('t-ruled','1 · Ruled','A rule under the header, hairlines between rows, open on all sides. What the renderer produces today.'),
 ('t-boxed','2 · Boxed','Every cell bounded. The structure most real exam papers use, and the most unambiguous when a student is scanning across a row under time.'),
 ('t-band','3 · Banded','No rules at all — alternating row tint does the separating. Quiet, and very easy to track across a wide row.'),
 ('t-type','4 · Typographic','No rules, no tint. Alignment and space alone, with a lettered header. The most premium and the least forgiving of sloppy alignment.'),
 ('t-panel','5 · Panel','The table sits on a tinted panel with a reversed header. Reads as a distinct object the question refers to.'),
]

CSS = r"""
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap">
<style>
:root{
  --page:#eceff4; --card:#ffffff; --rule:#dfe4ea; --ink:#131a22; --ink-2:#48566a; --ink-3:#6d7b8c;
  --accent:#0f5c8c; --accent-soft:rgba(15,92,140,.09);
  --shadow:0 1px 2px rgba(19,26,34,.05), 0 10px 28px -16px rgba(19,26,34,.28);
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --page:#0b0f15; --card:#141a22; --rule:#26303c; --ink:#eef3f9; --ink-2:#b0bfd0; --ink-3:#8797a9;
  --accent:#6bb6e4; --accent-soft:rgba(107,182,228,.13);
  --shadow:0 1px 2px rgba(0,0,0,.5), 0 10px 30px -16px rgba(0,0,0,.85);
}}
:root[data-theme="dark"]{
  --page:#0b0f15; --card:#141a22; --rule:#26303c; --ink:#eef3f9; --ink-2:#b0bfd0; --ink-3:#8797a9;
  --accent:#6bb6e4; --accent-soft:rgba(107,182,228,.13);
  --shadow:0 1px 2px rgba(0,0,0,.5), 0 10px 30px -16px rgba(0,0,0,.85);
}
*{box-sizing:border-box}
body{margin:0;background-color:var(--page);color:var(--ink);
  font:16.5px/1.65 'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1220px;margin:0 auto;padding:0 26px 130px}
.mast{padding:78px 0 34px;max-width:74ch}
.kick{font-size:11.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-3);margin:0 0 16px}
h1{font-family:'Newsreader',Georgia,serif;font-weight:600;font-size:clamp(34px,5vw,52px);
   line-height:1.08;letter-spacing:-.02em;margin:0 0 18px;text-wrap:balance}
.lede{font-size:19px;color:var(--ink-2);margin:0 0 14px}
h2{font-family:'Newsreader',Georgia,serif;font-weight:600;font-size:27px;letter-spacing:-.01em;
   margin:56px 0 6px;color:var(--ink)}
.sub{color:var(--ink-2);margin:0 0 24px;max-width:70ch;font-size:16px}
.grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(292px,1fr));gap:16px;align-items:start}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:16px;align-items:start}
.dir{background:var(--card);border:1px solid var(--rule);border-radius:6px;box-shadow:var(--shadow);overflow:hidden}
.dh{padding:14px 18px 12px;border-bottom:1px solid var(--rule)}
.dh b{display:block;font-size:14.5px;font-weight:700;margin-bottom:5px}
.dh span{font-size:13px;color:var(--ink-3);line-height:1.5;display:block}
.db{padding:14px 12px;display:flex;justify-content:center;overflow-x:auto;background:var(--card)}
.tb{padding:26px 22px;display:flex;justify-content:center;overflow-x:auto}
.ask{background:var(--accent-soft);border:1px solid var(--rule);border-radius:6px;padding:26px 30px;margin-top:44px}
.ask h3{font-family:'Newsreader',serif;font-weight:600;font-size:21px;margin:0 0 12px}
.ask p{margin:0 0 12px;color:var(--ink-2)}.ask p:last-child{margin:0}
code{font-family:ui-monospace,monospace;font-size:.86em;background:var(--accent-soft);
     color:var(--accent);padding:2px 6px;border-radius:3px}

/* ═══════════ shared figure skeleton ═══════════ */
.sx{display:block;margin:0}
.sx-frame{fill:none}
.sx-grid line{stroke-width:1;shape-rendering:crispEdges}
.sx-axis line{stroke-linecap:butt}
.sx-tickmark{shape-rendering:crispEdges}
.sx-tick text{font-family:'DM Sans',sans-serif;font-variant-numeric:tabular-nums}
.sx-axis-tip{font-family:'Newsreader',Georgia,serif;font-style:italic;font-weight:600}
.sx-axis-title{font-family:'DM Sans',sans-serif;font-size:12px}
.sx-curve{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round}
.sx-point{fill:currentColor}

/* ─── A · PLATE ─── the frame contains; the grid can whisper */
.d-plate .sx-frame{stroke:#c3ccd6;stroke-width:1.2}
.d-plate .sx-grid line{stroke:#e9edf2}
.d-plate .sx-grid line.sx-major{stroke:#d5dce4}
.d-plate .sx-axis line{stroke:#2c3742;stroke-width:1.3}
.d-plate .sx-arrow{fill:#2c3742}
.d-plate .sx-tickmark{stroke:#2c3742;stroke-width:1.3}
.d-plate .sx-tick text{fill:#41505f;font-size:12px;font-weight:400}
.d-plate .sx-axis-tip{fill:#2c3742;font-size:15px}
.d-plate .sx-series{color:#16202a}
.d-plate .sx-curve{stroke-width:2.4}
.d-plate .sx-point{stroke:var(--card);stroke-width:2.5}

/* ─── B · OPEN ─── nothing but axes; whitespace carries it */
.d-open .sx-axis line{stroke:#101820;stroke-width:1.5}
.d-open .sx-arrow{fill:#101820}
.d-open .sx-tickmark{stroke:#101820;stroke-width:1.5}
.d-open .sx-tick text{fill:#101820;font-size:13px;font-weight:500}
.d-open .sx-axis-tip{fill:#101820;font-size:17px}
.d-open .sx-series{color:#101820}
.d-open .sx-curve{stroke-width:3.4}
.d-open .sx-point{stroke:var(--card);stroke-width:3}

/* ─── C · SQUARED PAPER ─── dense, and the figure must be bold on top */
.d-paper .sx-grid line.sx-fine{stroke:#e4eaf0}
.d-paper .sx-grid line{stroke:#cdd8e2}
.d-paper .sx-grid line.sx-major{stroke:#a8b6c4}
.d-paper .sx-axis line{stroke:#0e1620;stroke-width:1.8}
.d-paper .sx-arrow{fill:#0e1620}
.d-paper .sx-tickmark{stroke:#0e1620;stroke-width:1.8}
.d-paper .sx-tick text{fill:#0e1620;font-size:12px;font-weight:600;
  paint-order:stroke;stroke:var(--card);stroke-width:3.5px;stroke-linejoin:round}
.d-paper .sx-axis-tip{fill:#0e1620;font-size:15px}
.d-paper .sx-series{color:#0e1620}
.d-paper .sx-curve{stroke-width:3.2}
.d-paper .sx-point{stroke:var(--card);stroke-width:3}

/* ─── D · SCREEN-NATIVE ─── the language beside Desmos all exam */
.d-screen .sx-grid line{stroke:#dde3ea}
.d-screen .sx-grid line.sx-major{stroke:#c2cbd5}
.d-screen .sx-axis line{stroke:#4a5765;stroke-width:1.3}
.d-screen .sx-arrow{fill:#4a5765}
.d-screen .sx-tickmark{stroke:#4a5765;stroke-width:1.3}
.d-screen .sx-tick text{fill:#5b6875;font-size:12px;font-weight:500}
.d-screen .sx-axis-tip{fill:#5b6875;font-size:15px}
.d-screen .sx-series{color:#1f6feb}
.d-screen .sx-s2{color:#c2410c}
.d-screen .sx-curve{stroke-width:3}
.d-screen .sx-point{stroke:var(--card);stroke-width:2.5}

/* ═══════════ tables ═══════════ */
table{border-collapse:collapse;font-family:'DM Sans',sans-serif;font-variant-numeric:tabular-nums}
.num{text-align:right}
.t-ruled th{font-weight:700;font-size:13px;padding:0 22px 9px;border-bottom:2px solid var(--ink-2);text-align:left}
.t-ruled th.num{text-align:right}
.t-ruled th,.t-ruled td{white-space:nowrap}
.t-ruled td{font-size:15.5px;padding:9px 26px;border-bottom:1px solid var(--rule)}
.t-ruled tr:last-child td{border-bottom:none}

.t-boxed{border:1.5px solid var(--ink-2)}
.t-boxed th{font-weight:700;font-size:13px;padding:10px 20px;border:1px solid var(--ink-2);
  background:var(--accent-soft);text-align:left}
.t-boxed th.num{text-align:right}
.t-boxed th,.t-boxed td{white-space:nowrap}
.t-boxed td{font-size:15.5px;padding:9px 24px;border:1px solid #c3ccd6}

.t-band th{font-weight:700;font-size:12px;letter-spacing:.07em;text-transform:uppercase;
  color:var(--ink-3);padding:0 22px 10px;text-align:left}
.t-band th.num{text-align:right}
.t-band th,.t-band td{white-space:nowrap}
.t-band td{font-size:15.5px;padding:11px 26px;border:none}
.t-band tbody tr:nth-child(odd){background:rgba(15,92,140,.055)}

.t-type th{font-family:'Newsreader',serif;font-weight:600;font-size:15px;font-style:italic;
  padding:0 30px 14px;text-align:left;color:var(--ink-2)}
.t-type th.num{text-align:right}
.t-type th,.t-type td{white-space:nowrap}
.t-type td{font-size:16px;padding:7px 32px;border:none}

.t-panel{border-radius:6px;overflow:hidden}
.t-panel th{font-weight:700;font-size:12.5px;letter-spacing:.05em;padding:12px 22px;
  background:var(--ink);color:var(--card);text-align:left}
.t-panel th.num{text-align:right}
.t-panel th,.t-panel td{white-space:nowrap}
.t-panel td{font-size:15.5px;padding:10px 26px;background:rgba(15,92,140,.05);
  border-bottom:1px solid rgba(255,255,255,.55)}
.t-panel tr:last-child td{border-bottom:none}
</style>
"""

def fig_panes(fid):
    f = FIGS[fid]
    out = ''
    for d in DIRECTIONS:
        out += (f'<div class="dir"><div class="dh"><b>{d["name"]}</b><span>{d["blurb"]}</span></div>'
                f'<div class="db d-{d["id"]}" id="f-{fid}-{d["id"]}"></div></div>')
    return out

def table_html(cls):
    numeric = [False, True, True]
    th = ''.join(f'<th class="{"num" if numeric[i] else ""}">{h}</th>'
                 for i,h in enumerate(TABLE_DATA['headers']))
    rows = ''.join('<tr>' + ''.join(
        f'<td class="{"num" if numeric[i] else ""}">{c}</td>' for i,c in enumerate(r)) + '</tr>'
        for r in TABLE_DATA['rows'])
    return f'<table class="{cls}"><thead><tr>{th}</tr></thead><tbody>{rows}</tbody></table>'

tables = ''.join(
  f'<div class="dir"><div class="dh"><b>{name}</b><span>{blurb}</span></div>'
  f'<div class="tb">{table_html(cid)}</div></div>'
  for cid, name, blurb in TABLE_DIRS)

BODY = f"""
<h2>Coordinate geometry</h2>
<p class="sub">A triangle and a circle on one plane. Watch how much of the plate the mathematics
  occupies, and whether the grid helps you count or competes with the figure.</p>
<div class="grid4">{fig_panes('geo')}</div>

<h2>Function graph</h2>
<p class="sub">A cubic from sampled points. Here the question is whether the curve reads as the
  subject of the figure or as one more line among the grid lines.</p>
<div class="grid4">{fig_panes('fn')}</div>

<h2>Scatter</h2>
<p class="sub">Statistical rather than geometric. Different rules apply — the axes measure
  different quantities, so nothing is squared.</p>
<div class="grid4">{fig_panes('stat')}</div>

<h2>Tables, from scratch</h2>
<p class="sub">Not five adjustments of one table — five different ideas about what separates a row
  from the next one. A mathematically correct HTML table is not automatically an exam table.</p>
<div class="grid2">{tables}</div>

<div class="ask">
  <h3>What this is asking</h3>
  <p>Pick a <b>direction</b>, not a detail. Each one makes a different bet about what carries a
    figure: the frame, the whitespace, the paper, or the colour. Details — a weight here, a
    half-pixel there — come after, and only inside whichever bet you take.</p>
  <p>They may not split cleanly by family. It is entirely reasonable for geometry to want
    <b>Squared paper</b> and a scatter to want <b>Open</b>, provided the type, the tick treatment
    and the ink stay common so it still reads as one system.</p>
  <p>Nothing here is wired to anything. The production renderer is untouched.</p>
</div>
"""

DIRS_JSON = json.dumps([{'id': d['id'], 'opts': d['opts']} for d in DIRECTIONS])

HTML = f"""<title>Figure Design Directions</title>
{CSS}
<div class="wrap">
  <header class="mast">
    <p class="kick">Si Math AI · exploration · nothing wired</p>
    <h1>Four ways a figure could look</h1>
    <p class="lede">Not another round of adjustments. Four genuinely different visual languages for
      figures and five for tables, each making a different decision about what carries the
      composition.</p>
    <p class="lede">The mathematics is neutral and identical across every panel, so the only thing
      changing is the design.</p>
  </header>
  {BODY}
</div>
<script>{R}</script>
<script>
const FIGS = {json.dumps(FIGS)};
const DIRS = {DIRS_JSON};
const {{drawPlot}} = globalThis.SiExplore;
for (const fid of Object.keys(FIGS)) {{
  const f = FIGS[fid];
  for (const d of DIRS) {{
    const host = document.getElementById('f-' + fid + '-' + d.id);
    host.appendChild(drawPlot(f.spec, Object.assign({{}}, f.opts, d.opts,
      {{ width: 320, maxHeight: 345 }})));
  }}
}}
</script>
"""
io.open(os.path.join(os.path.dirname(HERE), 'figure-directions.html'),'w',encoding='utf-8').write(HTML)
print('written  figure-directions.html  %d bytes' % len(HTML))
