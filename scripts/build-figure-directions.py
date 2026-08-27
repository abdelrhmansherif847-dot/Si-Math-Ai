"""Visual design directions — an exploration, judged BY FIGURE FAMILY.

Not one global look. Each mathematical object is a separate decision, because
each one has a different job on screen. A coordinate plane is judged through
four treatments of frame / grid / ink; a number line is judged through four
treatments of its own (nobody frames a number line); a table is judged through
seven structures, three of which are executions of BOXED, because boxed is what
most real exam papers use and the earlier page under-showed it.

The shared fundamentals — type, tick treatment, numeral style, spacing — are
held constant on purpose, so a mix across families still reads as one exam.

Neutral mathematics throughout: no exam item appears here.
"""
import io, json, math

R = io.open('explore-render.js', encoding='utf-8').read()

def samples(f, a, b, st):
    o = []; x = a
    while x <= b + 1e-9:
        o.append([round(x, 3), round(f(x), 3)]); x += st
    return o

def circ(cx, cy, r, n=12):
    return [[round(cx + r*math.cos(2*math.pi*i/n), 3),
             round(cy + r*math.sin(2*math.pi*i/n), 3)] for i in range(n)]

# ═════════════════════════════════════════════ the plane families
PLANE_FIGS = {
 'fn':   dict(spec=dict(xRange=[-1,5], yRange=[-2,5], xLabel='x', yLabel='y',
                curves=[dict(points=samples(lambda x: x**3/3 - 2*x*x + 3*x + 0.6, -0.6, 4.6, 0.3))]),
              opts=dict(aspect='plane', figures=[dict(mode='curve')])),
 'geo':  dict(spec=dict(xRange=[-1,7], yRange=[-1,6], xLabel='x', yLabel='y',
                curves=[dict(points=[[0,0],[5,0],[5,4],[0,0]]), dict(points=circ(2.2,2.4,1.2))]),
              opts=dict(aspect='plane', figures=[dict(mode='polygon'), dict(mode='curve', closed=True)])),
 'stat': dict(spec=dict(xRange=[0,9], yRange=[10,36], xLabel='Weeks', yLabel='Books read',
                curves=[dict(points=[[1,14],[2,19],[3,17],[4,24],[5,26],[6,25],[7,31],[8,34]])]),
              opts=dict(aspect='data', figures=[dict(mode='scatter')])),
}

PLANE_DIRS = [
 dict(id='plate',  name='A · Plate',
      legend='A bounded frame with real margin, the way a plate sits in a textbook. The frame does '
             'the containing, so the grid can whisper and the whitespace inside reads as deliberate.',
      opts=dict(plate=True,  gridMode='major')),
 dict(id='open',   name='B · Open',
      legend='No grid, no frame. Axes, ticks and numerals only. The figure is the entire composition '
             'and whitespace carries it — the most editorial of the four, and the only one where a '
             'value has to be read by tracking back to the axis.',
      opts=dict(plate=False, gridMode='none')),
 dict(id='paper',  name='C · Squared paper',
      legend='A fine half-unit grid under a heavier unit rule: the squared paper a student actually '
             'works on. Dense with information, so the figure has to be bold to sit on top of it.',
      opts=dict(plate=False, gridMode='fine')),
 dict(id='screen', name='D · Screen-native',
      legend='Light grid, thin dark axes, figure in a strong hue rather than ink. The language a '
             'student already has on screen, because Desmos is open beside every question.',
      opts=dict(plate=False, gridMode='major')),
]

# What each direction does FOR THIS OBJECT — the sentence that actually helps a
# per-family judgement, written per family rather than repeated verbatim.
PLANE_NOTES = {
 'fn': {
   'plate':  'The frame closes the window, so the cubic reads as a bounded specimen. Turning points sit clear of the edge.',
   'open':   'Nothing competes with the curve. Reading a turning point is easy; reading its VALUE means eye-tracking to the axis.',
   'paper':  'Every value countable, but the curve is now one line among many. This is the densest option for a smooth shape.',
   'screen': 'Hue separates curve from scaffolding instantly. Closest to what the student sees in Desmos two inches away.',
 },
 'geo': {
   'plate':  'The frame competes with the triangle — two rectangles in one figure. Watch the top-right corner.',
   'open':   'Honest and clean, but lengths must be counted against ticks alone. Hardest place to lose the grid.',
   'paper':  'The grid IS the instrument here: side lengths are countable without measuring. The strongest case for density.',
   'screen': 'Hue reads the triangle as a plotted object rather than a construction. Fine for graphs, arguable for geometry.',
 },
 'stat': {
   'plate':  'The frame is doing real work: it bounds a window that is not square and has no origin in view.',
   'open':   'Trend is obvious, individual readings are not. Weakest option when the question asks for one observation.',
   'paper':  'Wrong instrument — a half-unit grid implies the axes are commensurable. They are weeks against books.',
   'screen': 'Grid as a locating aid, points in hue. The conventional chart language, and here that is a fit rather than a default.',
 },
}

# ═════════════════════════════════════════════ number lines: their own axes
NL_SPEC = dict(min=-6, max=6, segments=[{'from':-3,'to':4,'fromClosed':False,'toClosed':True}])

NL_DIRS = [
 dict(id='ruler', name='1 · Ruler',
      note='Every integer ticked and named. The line is a measuring instrument and the interval is '
           'drawn on it. Most information, and the endpoint has to compete for attention.',
      opts=dict(tickMode='all', endpointR=6.5)),
 dict(id='statement', name='2 · Statement',
      note='Only the values the question turns on are named, and the endpoint is the largest thing '
           'in the figure. Treats open-vs-closed as the subject rather than a detail.',
      opts=dict(tickMode='ends', endpointR=9)),
 dict(id='fine', name='3 · Fine ruler',
      note='Half-unit minor ticks under named integers. Reads as graph paper folded to one dimension '
           '— useful when the endpoint is not on an integer.',
      opts=dict(tickMode='fine', endpointR=7)),
 dict(id='band', name='4 · Lifted band',
      note='The line stays a clean ruler; the interval sits above it as its own object, tied back by '
           'drop lines. Separates "the scale" from "the answer" completely.',
      opts=dict(tickMode='all', endpointR=7.5, segLift=26, height=118)),
]

# ═════════════════════════════════════════════ tables
T_HEAD = ['Plan', 'Sessions', 'Price (EGP)', 'Change']
T_ROWS = [['Starter', '4', '480', '−5%'],
          ['Standard', '8', '900', '−12%'],
          ['Intensive', '12', '1,260', '−18%'],
          ['Full term', '24', '2,160', '−25%']]
T_NUM  = [False, True, True, True]

TABLE_DIRS = [
 ('t-boxed',  '1 · Boxed — classic',
  'Every cell bounded, one weight throughout, a heavier outer rule. What most real exam papers print. '
  'Nothing is ambiguous about which row and column a number belongs to.'),
 ('t-boxed-h','2 · Boxed — header band',
  'The same grid, with the header reversed out of solid ink. The header stops being a row and starts '
  'being a label for the object.'),
 ('t-boxed-z','3 · Boxed — grid + zebra',
  'Boxed structure with a faint tint on alternate rows. Belt and braces: the rules bound each cell and '
  'the tint carries the eye across a long row.'),
 ('t-ruled',  '4 · Ruled',
  'A rule under the header, hairlines between rows, open on all sides. What the renderer produces today.'),
 ('t-band',   '5 · Banded',
  'No rules at all — alternating tint does the separating. Quiet, and easy to track across a wide row.'),
 ('t-type',   '6 · Typographic',
  'No rules, no tint. Alignment and space alone. The most premium and the least forgiving of sloppy '
  'alignment — and the least like an exam.'),
 ('t-panel',  '7 · Panel',
  'The table sits on a tinted panel with a reversed header, so it reads as a distinct object the '
  'question refers to.'),
]

# ═════════════════════════════════════════════ ink, per direction, per theme
# Every colour a direction uses is declared here as (light, dark). The CSS is
# generated from this table, so a colour CANNOT be defined in one theme only —
# which is exactly the bug that made the first draft of the number lines
# near-invisible on a dark screen. --grid-major is the value the plate stack
# already proved at 3.10-3.43:1 across four surfaces; the earlier #d5dce4 was
# 1.38:1 and would have made the Plate direction look quieter than it is.
PLANE_INK = {
 'plate': dict(
   frame=('#c3ccd6', '#3d4956'), grid=('#dce3ea', '#242f3b'), major=('#848d99', '#6b768a'),
   axis=('#2c3742', '#ccd7e4'), num=('#41505f', '#b3c0ce'), ink=('#16202a', '#eef3f9')),
 'open': dict(
   axis=('#101820', '#eef3f9'), num=('#101820', '#eef3f9'), ink=('#101820', '#eef3f9')),
 'paper': dict(
   fine=('#e4eaf0', '#1b242e'), grid=('#cdd8e2', '#2c3844'), major=('#848d99', '#6b768a'),
   axis=('#0e1620', '#e8eff7'), num=('#0e1620', '#e8eff7'), ink=('#0e1620', '#e8eff7')),
 'screen': dict(
   grid=('#d5dce4', '#28333f'), major=('#848d99', '#5d6a7f'),
   axis=('#4a5765', '#8f9dac'), num=('#46535f', '#a3b0be'),
   ink=('#1f6feb', '#6bb6e4'), ink2=('#c2410c', '#f0854a')),
}
NL_INK = {
 'ruler':     dict(axis=('#2c3742', '#c3cfdc'), tick=('#2c3742', '#c3cfdc'),
                   num=('#41505f', '#b3c0ce'), ink=('#16202a', '#eef3f9')),
 'statement': dict(axis=('#7b8896', '#7d8b99'), tick=('#7b8896', '#7d8b99'),
                   num=('#16202a', '#eef3f9'), ink=('#16202a', '#eef3f9')),
 'fine':      dict(axis=('#0e1620', '#e8eff7'), tick=('#0e1620', '#e8eff7'),
                   minor=('#848d99', '#6b768a'), num=('#0e1620', '#e8eff7'),
                   ink=('#0e1620', '#e8eff7')),
 'band':      dict(axis=('#4a5765', '#8f9dac'), tick=('#4a5765', '#8f9dac'),
                   num=('#46535f', '#a3b0be'), ink=('#1f6feb', '#6bb6e4')),
}
TABLE_INK = dict(
  cell=('#7d8b99', '#7b8896'), outer=('#2c3742', '#9fadbb'),
  headbg=('#2c3742', '#39485a'), headfg=('#ffffff', '#eef3f9'),
  tint=('rgba(15,92,140,.09)', 'rgba(107,182,228,.13)'),
  zebra=('rgba(15,92,140,.055)', 'rgba(107,182,228,.11)'),
  panelrule=('rgba(255,255,255,.62)', 'rgba(11,15,21,.55)'),
)

def _tokens(idx):
    out = []
    for d, roles in PLANE_INK.items():
        out += [f'  --{d}-{r}:{v[idx]};' for r, v in roles.items()]
    for d, roles in NL_INK.items():
        out += [f'  --n{d}-{r}:{v[idx]};' for r, v in roles.items()]
    out += [f'  --tb-{r}:{v[idx]};' for r, v in TABLE_INK.items()]
    return '\n'.join(out)

# A token used in a rule but missing from the table would silently render as
# nothing, so the generated sheet is checked against the rules that use it.
INK_CSS = f""":root{{
{_tokens(0)}
}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{
{_tokens(1)}
}}}}
:root[data-theme="dark"]{{
{_tokens(1)}
}}
"""

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
/*__INK__*/
*{box-sizing:border-box}
body{margin:0;background-color:var(--page);color:var(--ink);
  font:16.5px/1.65 'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1340px;margin:0 auto;padding:0 26px 130px}
.mast{padding:78px 0 30px;max-width:74ch}
.kick{font-size:11.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-3);margin:0 0 16px}
h1{font-family:'Newsreader',Georgia,serif;font-weight:600;font-size:clamp(34px,5vw,52px);
   line-height:1.08;letter-spacing:-.02em;margin:0 0 18px;text-wrap:balance}
.lede{font-size:19px;color:var(--ink-2);margin:0 0 14px}
h2{font-family:'Newsreader',Georgia,serif;font-weight:600;font-size:27px;letter-spacing:-.01em;
   margin:0 0 6px;color:var(--ink)}
.fam{margin:52px 0 0;padding-top:30px;border-top:1px solid var(--rule)}
.fam:first-of-type{border-top:none}
.sub{color:var(--ink-2);margin:0 0 22px;max-width:72ch;font-size:16px}
.grid4,.grid2{display:grid;gap:16px}
.grid4{grid-template-columns:repeat(auto-fit,minmax(272px,1fr))}
.grid2{grid-template-columns:repeat(auto-fit,minmax(452px,1fr))}
.dir{background:var(--card);border:1px solid var(--rule);border-radius:6px;box-shadow:var(--shadow);
  overflow:hidden;display:grid;grid-template-rows:subgrid;grid-row:span 2}
.dh{padding:13px 17px 11px;border-bottom:1px solid var(--rule)}
.dh b{display:block;font-size:14.5px;font-weight:700;margin-bottom:4px}
.dh span{font-size:12.5px;color:var(--ink-3);line-height:1.5;display:block}
.db{padding:16px 12px;display:flex;justify-content:center;align-items:center;
  overflow-x:auto;background:var(--card)}
.tb{padding:30px 26px;display:flex;justify-content:center;align-items:center;overflow-x:auto}

/* the four plane directions, described once */
.legend{background:var(--card);border:1px solid var(--rule);border-radius:6px;box-shadow:var(--shadow);
  padding:22px 26px;margin:6px 0 8px}
.legend h3{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);
  margin:0 0 16px;font-weight:700}
.legend dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px 26px;margin:0}
.legend dt{font-weight:700;font-size:14px;margin:0 0 4px}
.legend dd{margin:0;font-size:13px;color:var(--ink-3);line-height:1.55}
.note{font-size:14.5px;color:var(--ink-2);margin:0 0 22px;max-width:72ch}

.ask{background:var(--accent-soft);border:1px solid var(--rule);border-radius:6px;padding:26px 30px;margin-top:52px}
.ask h3{font-family:'Newsreader',serif;font-weight:600;font-size:21px;margin:0 0 12px}
.ask p{margin:0 0 12px;color:var(--ink-2)}.ask p:last-child{margin:0}
.ask b{color:var(--ink)}
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
.d-plate .sx-frame{stroke:var(--plate-frame);stroke-width:1.2}
.d-plate .sx-grid line{stroke:var(--plate-grid)}
.d-plate .sx-grid line.sx-major{stroke:var(--plate-major)}
.d-plate .sx-axis line{stroke:var(--plate-axis);stroke-width:1.3}
.d-plate .sx-arrow{fill:var(--plate-axis)}
.d-plate .sx-tickmark{stroke:var(--plate-axis);stroke-width:1.3}
.d-plate .sx-tick text{fill:var(--plate-num);font-size:12px;font-weight:400}
.d-plate .sx-axis-tip{fill:var(--plate-axis);font-size:15px}
.d-plate .sx-axis-title{fill:var(--plate-num)}
.d-plate .sx-series{color:var(--plate-ink)}
.d-plate .sx-curve{stroke-width:2.4}
.d-plate .sx-point{stroke:var(--card);stroke-width:2.5}

/* ─── B · OPEN ─── nothing but axes; whitespace carries it */
.d-open .sx-axis line{stroke:var(--open-axis);stroke-width:1.5}
.d-open .sx-arrow{fill:var(--open-axis)}
.d-open .sx-tickmark{stroke:var(--open-axis);stroke-width:1.5}
.d-open .sx-tick text{fill:var(--open-num);font-size:13px;font-weight:500}
.d-open .sx-axis-tip{fill:var(--open-axis);font-size:17px}
.d-open .sx-axis-title{fill:var(--open-num)}
.d-open .sx-series{color:var(--open-ink)}
.d-open .sx-curve{stroke-width:3.4}
.d-open .sx-point{stroke:var(--card);stroke-width:3}

/* ─── C · SQUARED PAPER ─── dense, and the figure must be bold on top */
.d-paper .sx-grid line.sx-fine{stroke:var(--paper-fine)}
.d-paper .sx-grid line{stroke:var(--paper-grid)}
.d-paper .sx-grid line.sx-major{stroke:var(--paper-major)}
.d-paper .sx-axis line{stroke:var(--paper-axis);stroke-width:1.8}
.d-paper .sx-arrow{fill:var(--paper-axis)}
.d-paper .sx-tickmark{stroke:var(--paper-axis);stroke-width:1.8}
.d-paper .sx-tick text{fill:var(--paper-num);font-size:12px;font-weight:600;
  paint-order:stroke;stroke:var(--card);stroke-width:3.5px;stroke-linejoin:round}
.d-paper .sx-axis-tip{fill:var(--paper-axis);font-size:15px}
.d-paper .sx-axis-title{fill:var(--paper-num)}
.d-paper .sx-series{color:var(--paper-ink)}
.d-paper .sx-curve{stroke-width:3.2}
.d-paper .sx-point{stroke:var(--card);stroke-width:3}

/* ─── D · SCREEN-NATIVE ─── the language beside Desmos all exam */
.d-screen .sx-grid line{stroke:var(--screen-grid)}
.d-screen .sx-grid line.sx-major{stroke:var(--screen-major)}
.d-screen .sx-axis line{stroke:var(--screen-axis);stroke-width:1.3}
.d-screen .sx-arrow{fill:var(--screen-axis)}
.d-screen .sx-tickmark{stroke:var(--screen-axis);stroke-width:1.3}
.d-screen .sx-tick text{fill:var(--screen-num);font-size:12px;font-weight:500}
.d-screen .sx-axis-tip{fill:var(--screen-axis);font-size:15px}
.d-screen .sx-axis-title{fill:var(--screen-num)}
.d-screen .sx-series{color:var(--screen-ink)}
.d-screen .sx-s2{color:var(--screen-ink2)}
.d-screen .sx-curve{stroke-width:3}
.d-screen .sx-point{stroke:var(--card);stroke-width:2.5}

/* ═══════════ number lines — one skeleton, four treatments of its own ═══════════ */
.nl .sx-nl-seg{stroke:currentColor;stroke-linecap:butt}
.n-ruler .sx-ray-arrow{fill:var(--nruler-ink)}
.n-statement .sx-ray-arrow{fill:var(--nstatement-ink)}
.n-fine .sx-ray-arrow{fill:var(--nfine-ink)}
.n-band .sx-ray-arrow{fill:var(--nband-ink)}
.nl .sx-endpoint{stroke:currentColor;stroke-width:2.4}
.nl .sx-closed{fill:currentColor}
.nl .sx-open{fill:var(--card)}
.nl .sx-nl-drop{stroke:currentColor;stroke-width:1.2;stroke-dasharray:3 3;opacity:.6}
.nl .sx-nl-tick,.nl .sx-nl-minor{shape-rendering:crispEdges}

.n-ruler .sx-nl-axis line{stroke:var(--nruler-axis);stroke-width:1.4}
.n-ruler .sx-arrow{fill:var(--nruler-axis)}
.n-ruler .sx-nl-tick{stroke:var(--nruler-tick);stroke-width:1.4}
.n-ruler .sx-tick text{fill:var(--nruler-num);font-size:12.5px}
.n-ruler .sx-series{color:var(--nruler-ink)}
.n-ruler .sx-nl-seg{stroke-width:4}

.n-statement .sx-nl-axis line{stroke:var(--nstatement-axis);stroke-width:1.3}
.n-statement .sx-arrow{fill:var(--nstatement-axis)}
.n-statement .sx-nl-tick{stroke:var(--nstatement-tick);stroke-width:1.2}
.n-statement .sx-tick text{fill:var(--nstatement-num);font-size:13.5px;font-weight:600}
.n-statement .sx-series{color:var(--nstatement-ink)}
.n-statement .sx-nl-seg{stroke-width:5}
.n-statement .sx-endpoint{stroke-width:3}

.n-fine .sx-nl-axis line{stroke:var(--nfine-axis);stroke-width:1.6}
.n-fine .sx-arrow{fill:var(--nfine-axis)}
.n-fine .sx-nl-tick{stroke:var(--nfine-tick);stroke-width:1.6}
.n-fine .sx-nl-minor{stroke:var(--nfine-minor);stroke-width:1}
.n-fine .sx-tick text{fill:var(--nfine-num);font-size:12.5px;font-weight:600;
  paint-order:stroke;stroke:var(--card);stroke-width:3.5px;stroke-linejoin:round}
.n-fine .sx-series{color:var(--nfine-ink)}
.n-fine .sx-nl-seg{stroke-width:4.5}

.n-band .sx-nl-axis line{stroke:var(--nband-axis);stroke-width:1.2}
.n-band .sx-arrow{fill:var(--nband-axis)}
.n-band .sx-nl-tick{stroke:var(--nband-tick);stroke-width:1.2}
.n-band .sx-tick text{fill:var(--nband-num);font-size:12.5px}
.n-band .sx-series{color:var(--nband-ink)}
.n-band .sx-nl-seg{stroke-width:7}

/* ═══════════ tables ═══════════ */
table{border-collapse:collapse;font-family:'DM Sans',sans-serif;font-variant-numeric:tabular-nums}
th,td{white-space:nowrap}
.num{text-align:right}

/* 1 · boxed — classic */
.t-boxed{border:1.6px solid var(--tb-outer)}
.t-boxed th{font-weight:700;font-size:13.5px;padding:11px 20px;
  border:1px solid var(--tb-outer);text-align:left}
.t-boxed th.num{text-align:right}
.t-boxed td{font-size:16px;padding:10px 22px;border:1px solid var(--tb-cell)}

/* 2 · boxed — header band */
.t-boxed-h{border:1.6px solid var(--tb-outer)}
.t-boxed-h th{font-weight:700;font-size:13px;letter-spacing:.04em;padding:12px 20px;
  border:1px solid var(--tb-headbg);background:var(--tb-headbg);color:var(--tb-headfg);text-align:left}
.t-boxed-h th.num{text-align:right}
.t-boxed-h td{font-size:16px;padding:10px 22px;border:1px solid var(--tb-cell)}

/* 3 · boxed — grid + zebra */
.t-boxed-z{border:1.6px solid var(--tb-outer)}
.t-boxed-z th{font-weight:700;font-size:13.5px;padding:11px 20px;border:1px solid var(--tb-outer);
  background:var(--tb-tint);text-align:left}
.t-boxed-z th.num{text-align:right}
.t-boxed-z td{font-size:16px;padding:10px 22px;border:1px solid var(--tb-cell)}
.t-boxed-z tbody tr:nth-child(even) td{background:var(--tb-zebra)}

/* 4 · ruled */
.t-ruled th{font-weight:700;font-size:13px;padding:0 22px 9px;border-bottom:2px solid var(--ink-2);text-align:left}
.t-ruled th.num{text-align:right}
.t-ruled td{font-size:16px;padding:9px 26px;border-bottom:1px solid var(--rule)}
.t-ruled tr:last-child td{border-bottom:none}

/* 5 · banded */
.t-band th{font-weight:700;font-size:12px;letter-spacing:.07em;text-transform:uppercase;
  color:var(--ink-3);padding:0 22px 10px;text-align:left}
.t-band th.num{text-align:right}
.t-band td{font-size:16px;padding:11px 26px;border:none}
.t-band tbody tr:nth-child(odd){background:var(--tb-zebra)}

/* 6 · typographic */
.t-type th{font-family:'Newsreader',serif;font-weight:600;font-size:15px;font-style:italic;
  padding:0 30px 14px;text-align:left;color:var(--ink-2)}
.t-type th.num{text-align:right}
.t-type td{font-size:16.5px;padding:7px 32px;border:none}

/* 7 · panel */
.t-panel{border-radius:6px;overflow:hidden}
.t-panel th{font-weight:700;font-size:12.5px;letter-spacing:.05em;padding:12px 22px;
  background:var(--ink);color:var(--card);text-align:left}
.t-panel th.num{text-align:right}
.t-panel td{font-size:16px;padding:10px 26px;background:var(--tb-zebra);
  border-bottom:1px solid var(--tb-panelrule)}
.t-panel tr:last-child td{border-bottom:none}

</style>
"""

CSS = CSS.replace("/*__INK__*/", INK_CSS)

# A token referenced by a rule but absent from the ink table renders as nothing
# at all — a silently invisible figure, which is the failure this whole table
# exists to prevent. So the sheet is checked against itself at build time.
import re as _re
_used = set(_re.findall(r'var\((--[a-z0-9-]+)\)', CSS))
_defined = set(_re.findall(r'(--[a-z0-9-]+)\s*:', CSS))
_missing = sorted(_used - _defined)
if _missing:
    raise SystemExit('CSS references undefined tokens: ' + ', '.join(_missing))
_light = set(_re.findall(r'(--[a-z0-9-]+)\s*:', INK_CSS.split('@media')[0]))
_dark  = set(_re.findall(r'(--[a-z0-9-]+)\s*:', INK_CSS.split('@media')[1]))
if _light != _dark:
    raise SystemExit('ink table is not theme-complete: ' + str(_light ^ _dark))
print('ink table: %d tokens, both themes complete' % len(_light))

def plane_panes(fid):
    return ''.join(
      f'<div class="dir"><div class="dh"><b>{d["name"]}</b>'
      f'<span>{PLANE_NOTES[fid][d["id"]]}</span></div>'
      f'<div class="db d-{d["id"]}" id="f-{fid}-{d["id"]}"></div></div>'
      for d in PLANE_DIRS)

nl_panes = ''.join(
  f'<div class="dir"><div class="dh"><b>{d["name"]}</b><span>{d["note"]}</span></div>'
  f'<div class="db nl n-{d["id"]}" id="nl-{d["id"]}"></div></div>'
  for d in NL_DIRS)

def table_html(cls):
    th = ''.join(f'<th class="{"num" if T_NUM[i] else ""}">{h}</th>'
                 for i, h in enumerate(T_HEAD))
    rows = ''.join('<tr>' + ''.join(
        f'<td class="{"num" if T_NUM[i] else ""}">{c}</td>' for i, c in enumerate(r)) + '</tr>'
        for r in T_ROWS)
    return f'<table class="{cls}"><thead><tr>{th}</tr></thead><tbody>{rows}</tbody></table>'

tables = ''.join(
  f'<div class="dir"><div class="dh"><b>{name}</b><span>{blurb}</span></div>'
  f'<div class="tb">{table_html(cid)}</div></div>'
  for cid, name, blurb in TABLE_DIRS)

legend = '<div class="legend"><h3>The four treatments, described once</h3><dl>' + ''.join(
  f'<div><dt>{d["name"]}</dt><dd>{d["legend"]}</dd></div>' for d in PLANE_DIRS) + '</dl></div>'

BODY = f"""
<section class="fam">
  <h2>Function graphs</h2>
  <p class="sub"><b>The job:</b> read shape and read values — turning points, intercepts, how many
    times it crosses a line. The curve is the subject; everything else is scaffolding. This is the
    one family where the Desmos comparison genuinely applies, because Desmos is open beside the
    question. It is not a reason to make a triangle look like a plotted function.</p>
  {legend}
  <p class="note">The same cubic in all four. Judge the curve first, then how hard it is to get a
    value off it.</p>
  <div class="grid4">{plane_panes('fn')}</div>
</section>

<section class="fam">
  <h2>Coordinate geometry</h2>
  <p class="sub"><b>The job:</b> count lengths and read positions. Here the grid is an instrument
    the student uses, not background — which is the opposite of what a function graph wants, and the
    reason these two families may not land on the same answer.</p>
  <div class="grid4">{plane_panes('geo')}</div>
</section>

<section class="fam">
  <h2>Scatter and statistical</h2>
  <p class="sub"><b>The job:</b> judge a trend and locate one observation. The axes measure
    different quantities, so nothing is squared, there is no origin in view, and the grid can only
    be a locating aid — never a ruler.</p>
  <div class="grid4">{plane_panes('stat')}</div>
</section>

<section class="fam">
  <h2>Number lines</h2>
  <p class="sub"><b>The job:</b> read one endpoint and decide whether it is open or closed. That
    distinction <i>is</i> the question — it is the difference between &lt; and &le; — so it has to
    be unmissable, and everything else exists only to locate it.</p>
  <p class="note">These are <b>not</b> the four treatments above. Frame and grid mean nothing on a
    number line, so this family gets its own four: they differ in how many values are named, how
    loud the endpoint is, and whether the interval rides on the axis or sits above it. All four draw
    the same interval — &minus;3 open, 4 closed.</p>
  <div class="grid4">{nl_panes}</div>
</section>

<section class="fam">
  <h2>Tables</h2>
  <p class="sub"><b>The job:</b> find one value fast, and be certain which row and column it belongs
    to, under time. Seven structures, not seven adjustments — each has a different answer to what
    does the separating.</p>
  <p class="note"><b>Boxed gets three executions</b>, because the last page under-showed it: it
    appeared once, small, at three columns. Here every table carries four columns, a negative
    numeric column and a thousands separator, at the size a question would actually print it. That
    is where the differences between these actually appear.</p>
  <div class="grid2">{tables}</div>
</section>

<div class="ask">
  <h3>What this is asking</h3>
  <p>React <b>per family</b>. There is no requirement that the answer be the same in all five, and
    good reason to think it will not be: geometry wants a countable grid, a scatter cannot have one,
    and a number line has no grid at all.</p>
  <p>What <i>must</i> stay common is the fundamentals — typeface, numeral style, tick treatment,
    label placement, the spacing around a figure and the card it sits on. Those are what make a mixed
    set still read as one exam. They are already held constant across every panel here, which is why
    a mix does not look like a mix.</p>
  <p>Once you have reacted, the next artefact is not a patch: it is a <b>figure-family design
    system</b> — the chosen treatment per mathematical object, plus the shared layer written down as
    rules the renderer enforces.</p>
  <p>Nothing here is wired to anything. The production renderer is untouched, no migration exists,
    and no content has been inserted.</p>
</div>
"""

HTML = f"""<title>Figure Family Directions</title>
{CSS}
<div class="wrap">
  <header class="mast">
    <p class="kick">Si Math AI · exploration · nothing wired</p>
    <h1>Five families, judged one at a time</h1>
    <p class="lede">Not one global look. Each mathematical object gets its own set of genuinely
      different treatments, because each one has a different job on screen.</p>
    <p class="lede">The mathematics is neutral and identical inside each family, so the only thing
      changing between panels is the design.</p>
  </header>
  {BODY}
</div>
<script>{R}</script>
<script>
const PLANE = {json.dumps(PLANE_FIGS)};
const PDIRS = {json.dumps([{'id': d['id'], 'opts': d['opts']} for d in PLANE_DIRS])};
const NLSPEC = {json.dumps(NL_SPEC)};
const NDIRS = {json.dumps([{'id': d['id'], 'opts': d['opts']} for d in NL_DIRS])};
const {{drawPlot, drawNumberLine}} = globalThis.SiExplore;

for (const fid of Object.keys(PLANE)) {{
  const f = PLANE[fid];
  for (const d of PDIRS) {{
    const host = document.getElementById('f-' + fid + '-' + d.id);
    if (!host) throw new Error('missing host f-' + fid + '-' + d.id);
    host.appendChild(drawPlot(f.spec, Object.assign({{}}, f.opts, d.opts,
      {{ width: 320, maxHeight: 345 }})));
  }}
}}
for (const d of NDIRS) {{
  const host = document.getElementById('nl-' + d.id);
  if (!host) throw new Error('missing host nl-' + d.id);
  host.appendChild(drawNumberLine(NLSPEC, Object.assign({{ width: 306 }}, d.opts)));
}}
</script>
"""
io.open('figure-directions.html', 'w', encoding='utf-8').write(HTML)
print('written  figure-directions.html  %d chars' % len(HTML))
