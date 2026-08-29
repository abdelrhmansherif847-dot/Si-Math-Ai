"""The figure-family design system.

Five families, five decisions — but the decisions are not five looks. Each
family has a fixed GRAMMAR (what never changes) and one axis of VARIATION, and
the variant is computed from the question rather than picked per figure.

Two inputs decide every variant on the page:

  reading   — 'shape' or 'value'. AUTHORED, because it is a property of the
              question and nothing in the geometry can reveal it.
  resolution — derived: the coarsest step on which every marked value lands.

Every figure below is produced by those rules through the shared renderer. None
is hand-set. Neutral mathematics throughout; no authored exam item appears.
"""
import io, json, math, os

# THE renderer, read from its authored source at build time — never a copy
# pasted into this file. A snapshot was embedded in a preview once and went
# stale immediately: fixes stopped reaching it while it still looked correct.
# validate-exam-stimulus.mjs fails if a generated page here falls behind.
CORE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    '..', 'supabase', 'functions', '_shared', 'exam-stimulus.core.js')
R = io.open(CORE, encoding='utf-8').read()

# THE SHIPPED STYLESHEET, read at build time — not a copy.
#
# This page IS the approved grammar (365d85b). Its figure rules used to live
# here, which meant the decision and the thing students see were two files that
# happened to agree until they did not: exam-surface.css was first built from a
# preview showing one function graph, and the data family, the table and the
# named-point typeface were invented rather than taken from this page. Now there
# is one file, this page renders from it, and check-figure-system.cjs's 96
# assertions test what the exam actually ships.
SHEET = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             '..', 'exam-surface.css'), encoding='utf-8').read()

def samples(f, a, b, st):
    o = []; x = a
    while x <= b + 1e-9:
        o.append([round(x, 3), round(f(x), 3)]); x += st
    return o

CUBIC = lambda x: x**3/3 - 2*x*x + 3*x + 1

FAMILIES = [
 dict(id='fn', name='Function graphs', decision='Open, with a grid only when the question needs one',
   job='Read shape, and sometimes read a value.',
   grammar=[
     'The curve is the heaviest mark in the figure. Scaffolding always steps back behind it.',
     'Scales are <b>not</b> equal. Nothing here needs an <i>x</i> unit to match a <i>y</i> unit, and forcing it wastes the plate.',
     'The axes are a plane: arrowheads, and italic <i>x</i> and <i>y</i> at their ends.',
     'The window is trimmed to where the curve lives, and the curve is clipped to it.',
   ],
   axis='Whether a grid is drawn.',
   rule='<code>reading</code> is authored on the question. <b>shape</b> &rarr; no grid. '
        '<b>value</b> &rarr; a grid, because the student has to get a number off the picture.',
   variants=[
     dict(label='reading: shape', sub='&ldquo;How many turning points does the graph have?&rdquo;',
       spec=dict(xRange=[-0.7,4.7], yRange=[-1.6,5], xLabel='x', yLabel='y',
                 curves=[dict(points=samples(CUBIC,-0.6,4.6,0.2))]),
       opts=dict(aspect='data', axes='plane', frame='graph', reading='shape',
                 width=430, height=280, figures=[dict(mode='curve')])),
     dict(label='reading: value', sub='&ldquo;What is the value of <i>f</i>(3)?&rdquo;',
       spec=dict(xRange=[-0.7,4.7], yRange=[-1.6,5], xLabel='x', yLabel='y',
                 curves=[dict(points=samples(CUBIC,-0.6,4.6,0.2))]),
       opts=dict(aspect='data', axes='plane', frame='graph', reading='value',
                 width=430, height=280, figures=[dict(mode='curve')])),
   ]),
 dict(id='geo', name='Coordinate geometry', decision='Squared paper',
   job='Count lengths and identify named points.',
   grammar=[
     'Equal scales, always. Shape carries meaning here, so a circle must be round and a right angle right.',
     'The grid is the measuring instrument and is <b>always</b> present. It is not background.',
     'Every vertex the stem names is named on the figure, and so is the origin.',
     'The figure is bold enough to sit on top of its own grid.',
   ],
   axis='How fine the grid is.',
   rule='Derived, not chosen: the grid step is <code>resolutionOf()</code> of the figure&rsquo;s own '
        'vertices. Integer vertices &rarr; a unit grid. A vertex at 2.5 &rarr; half-unit lines, so that '
        'vertex sits on a crossing.',
   variants=[
     dict(label='vertices on integers', sub='resolution 1 &rarr; one square per unit',
       spec=dict(xRange=[-1,7.5], yRange=[-1,9.4], xLabel='x', yLabel='y',
                 curves=[dict(points=[[0,0],[6,0],[6,8],[0,0]])]),
       opts=dict(aspect='plane', frame='plane', width=360, maxHeight=430, originLabel='O',
                 figures=[dict(mode='polygon', labels=['','A','B'])])),
     dict(label='a vertex on a half', sub='resolution &frac12; &rarr; half-unit lines appear',
       spec=dict(xRange=[-1,7.5], yRange=[-1,9.4], xLabel='x', yLabel='y',
                 curves=[dict(points=[[0,0],[6,0],[6,7.5],[0,0]])]),
       opts=dict(aspect='plane', frame='plane', width=360, maxHeight=430, originLabel='O',
                 figures=[dict(mode='polygon', labels=['','A','B'])])),
   ]),
 dict(id='data', name='Data and scatterplots', decision='Screen-native',
   job='Locate one observation, or judge a trend.',
   grammar=[
     'These are measured data, so none of the plane&rsquo;s conventions apply: no arrowheads, no equal scales, no origin.',
     'The data carries a validated hue and is the most saturated thing in the figure.',
     'Identity comes from a direct label on the series, never a legend.',
     'Nothing is interactive. On a dashboard a tooltip shows the value; on an exam it is the answer.',
   ],
   axis='Whether reference lines are drawn.',
   rule='The same authored <code>reading</code> as the function family, answered differently: '
        '<b>value</b> &rarr; horizontal rules, because a value on a chart is read by tracking left. '
        '<b>shape</b> &rarr; none, because a trend needs no rule to be seen.',
   variants=[
     dict(label='reading: shape', sub='&ldquo;Which best describes the association?&rdquo;',
       spec=dict(xRange=[0,9], yRange=[0,160], xLabel='Practice tests completed', yLabel='Score gain',
                 curves=[dict(points=[[1,40],[2,60],[3,50],[4,90],[5,110],[6,100],[7,140],[8,150]])]),
       opts=dict(aspect='data', frame='data', reading='shape', width=430, height=280,
                 figures=[dict(mode='scatter')])),
     dict(label='reading: value', sub='&ldquo;What is the greatest gain below 5 tests?&rdquo;',
       spec=dict(xRange=[0,9], yRange=[0,160], xLabel='Practice tests completed', yLabel='Score gain',
                 curves=[dict(points=[[1,40],[2,60],[3,50],[4,90],[5,110],[6,100],[7,140],[8,150]])]),
       opts=dict(aspect='data', frame='data', reading='value', width=430, height=280,
                 figures=[dict(mode='scatter')])),
   ]),
 dict(id='nl', name='Number lines', decision='Statement, with adaptive tick density',
   job='Read one endpoint and decide open or closed.',
   grammar=[
     'Endpoint-first: the endpoint is the largest mark in the figure, because open-versus-closed <i>is</i> the question.',
     'Only the values the question turns on are named. A number line is not a ruler to be read across.',
     'Open and closed are drawn as hollow and filled &mdash; semantic, never decorative.',
     'The line runs the full width of the text. It is a strip, and it is given a strip&rsquo;s shape.',
   ],
   axis='How dense the ticks are.',
   rule='Derived: <code>resolutionOf()</code> of the marked values. All integers &rarr; no minor ticks. '
        'An endpoint at &minus;2.5 &rarr; half-step ticks, and that value is named even though it is '
        'off the major step.',
   kind='nl',
   variants=[
     dict(label='endpoint on an integer', sub='resolution 1 &rarr; clean line, no minor ticks',
       spec=dict(min=-6, max=6, segments=[{'from':-2,'to':6,'fromClosed':True,'toClosed':True}]),
       opts=dict(tickMode='auto', endpointR=9, width=430)),
     dict(label='endpoint on a half', sub='resolution &frac12; &rarr; half-step ticks, and &minus;2.5 named',
       spec=dict(min=-6, max=6, segments=[{'from':-2.5,'to':6,'fromClosed':False,'toClosed':True}]),
       opts=dict(tickMode='auto', endpointR=9, width=430)),
   ]),
]

TABLE = dict(head=['', 'Robotics', 'Debate', 'Studio Art', 'Total'],
             rows=[['Grade 11','32','18','25','75'],
                   ['Grade 12','27','24','19','70'],
                   ['Total','59','42','44','145']])
TABLE_ONE = dict(head=['Plan','Sessions','Price (EGP)'],
                 rows=[['Starter','4','480'],['Standard','8','900'],['Intensive','12','1,260']])

TABLE_FAMILY = dict(
  name='Tables', decision='Boxed &mdash; header band',
  job='Find one cell fast, and be certain of its row and its column.',
  grammar=[
    'Every cell is bounded. Under time, nothing about which row and column a number belongs to is left to alignment.',
    'The header is reversed out of solid ink, so it labels the object rather than being its first row.',
    'Numerals are tabular and right-aligned; row labels are not.',
    'The table sits at the text&rsquo;s left margin. It is part of the question, not an object placed beside it.',
  ],
  axis='Whether a totals rank is present.',
  rule='Structural, and derived from the data: a totals row or column is separated by <b>weight</b> '
       '&mdash; a heavier rule and bolder numerals &mdash; never by a different treatment, so the table '
       'still reads as one object.',
  refused=[('Panel', 'reads as UI placed beside the question rather than part of it'),
           ('Typographic', 'beautiful, and the slowest to track a row across under time')])

CSS = r"""
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&display=swap">
<style>
:root{
  --page:#e9edf2; --card:#ffffff; --rule:#dde3ea; --ink:#111820; --ink-2:#445264; --ink-3:#6b7a8c;
  --accent:#0f5c8c; --accent-soft:rgba(15,92,140,.08);
  --shadow:0 1px 2px rgba(17,24,32,.05), 0 12px 32px -18px rgba(17,24,32,.3);
  --good:#1c6b4a; --good-soft:rgba(28,107,74,.10);
  --bad:#a33a20; --bad-soft:rgba(163,58,32,.09);
  --exam:#ffffff; --exam-rule:#8792a0;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --page:#080c11; --card:#131920; --rule:#26313d; --ink:#eef3f9; --ink-2:#aebccc; --ink-3:#8493a5;
  --accent:#6bb6e4; --accent-soft:rgba(107,182,228,.12);
  --shadow:0 1px 2px rgba(0,0,0,.5), 0 12px 34px -18px rgba(0,0,0,.9);
  --good:#63c39a; --good-soft:rgba(99,195,154,.13);
  --bad:#e08165; --bad-soft:rgba(224,129,101,.13);
  --exam:#161d25; --exam-rule:#6f7d8c;
}}
:root[data-theme="dark"]{
  --page:#080c11; --card:#131920; --rule:#26313d; --ink:#eef3f9; --ink-2:#aebccc; --ink-3:#8493a5;
  --accent:#6bb6e4; --accent-soft:rgba(107,182,228,.12);
  --shadow:0 1px 2px rgba(0,0,0,.5), 0 12px 34px -18px rgba(0,0,0,.9);
  --good:#63c39a; --good-soft:rgba(99,195,154,.13);
  --bad:#e08165; --bad-soft:rgba(224,129,101,.13);
  --exam:#161d25; --exam-rule:#6f7d8c;
}
*{box-sizing:border-box}
body{margin:0;background-color:var(--page);color:var(--ink);
  font:16.5px/1.6 'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:0 26px 140px}
.mast{padding:84px 0 6px;max-width:66ch}
.kick{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3);
  margin:0 0 18px;font-weight:600}
h1{font-family:'Newsreader',Georgia,serif;font-weight:600;font-size:clamp(38px,5.4vw,58px);
  line-height:1.03;letter-spacing:-.024em;margin:0 0 22px;text-wrap:balance}
.lede{font-size:19.5px;color:var(--ink-2);margin:0 0 16px}
h2{font-family:'Newsreader',Georgia,serif;font-weight:600;font-size:31px;letter-spacing:-.014em;
  margin:0 0 4px}
.dec{font-size:15px;color:var(--good);font-weight:600;margin:0 0 4px}
.job{font-size:15.5px;color:var(--ink-3);margin:0 0 26px}

/* the two rules, stated once, up front */
.rules{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px;margin:40px 0 12px}
.rl{background:var(--card);border:1px solid var(--rule);border-radius:6px;box-shadow:var(--shadow);
  padding:24px 26px}
.rl .n{font-size:11.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;
  color:var(--accent);margin:0 0 10px}
.rl h3{font-family:'Newsreader',serif;font-weight:600;font-size:21px;margin:0 0 10px}
.rl p{margin:0 0 10px;font-size:15px;color:var(--ink-2)}.rl p:last-child{margin:0}
.rl .tag{display:inline-block;font-size:11.5px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;padding:3px 8px;border-radius:3px;margin-bottom:12px}
.rl .aut{color:var(--bad);background:var(--bad-soft)}
.rl .der{color:var(--good);background:var(--good-soft)}

.fam{margin:70px 0 0;padding-top:36px;border-top:1px solid var(--rule)}
.split{display:grid;grid-template-columns:minmax(280px,340px) 1fr;gap:34px;align-items:start}
@media (max-width:900px){.split{grid-template-columns:1fr}}
.gram{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:11px}
.gram li{font-size:14.5px;line-height:1.55;color:var(--ink-2);padding-left:17px;position:relative}
.gram li::before{content:'';position:absolute;left:0;top:.62em;width:6px;height:1.5px;
  background:var(--accent)}
.gram li b{color:var(--ink)}
.lbl{font-size:11.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;
  color:var(--ink-3);margin:0 0 12px}
.varrule{background:var(--accent-soft);border-radius:5px;padding:15px 18px;margin:22px 0 0;
  font-size:14.5px;line-height:1.6;color:var(--ink-2)}
.varrule b{color:var(--ink)}
.vgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.v{background:var(--exam);border:1px solid var(--rule);border-radius:5px;box-shadow:var(--shadow);
  padding:18px 20px 16px;display:flex;flex-direction:column;gap:10px}
.v .vh{font-family:ui-monospace,monospace;font-size:12.5px;color:var(--accent);font-weight:600}
.v .vs{font-size:13.5px;color:var(--ink-3);line-height:1.5}
.v .vb{overflow-x:auto;display:flex;justify-content:center;padding:6px 0 2px}
.ref{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 0}
.ref span{font-size:13px;color:var(--ink-3);background:var(--bad-soft);border-radius:4px;
  padding:8px 12px}
.ref b{color:var(--bad);font-weight:700}

.close{background:var(--card);border:1px solid var(--rule);border-radius:6px;box-shadow:var(--shadow);
  padding:30px 34px;margin-top:70px}
.close h3{font-family:'Newsreader',serif;font-weight:600;font-size:22px;margin:0 0 14px}
.close p{margin:0 0 12px;color:var(--ink-2);max-width:80ch}.close p:last-child{margin:0}
.close b{color:var(--ink)}
code{font-family:ui-monospace,monospace;font-size:.86em;background:var(--accent-soft);
  color:var(--accent);padding:2px 6px;border-radius:3px}

/* The figure grammar and the decided table now live in exam-surface.css,
   inlined below. */
</style>
"""

def variants_html(fam):
    out = ''
    for i, v in enumerate(fam['variants']):
        out += (f'<div class="v"><div class="vh">{v["label"]}</div>'
                f'<div class="vs">{v["sub"]}</div>'
                f'<div class="vb" id="v-{fam["id"]}-{i}"></div></div>')
    return out

def table_html(cls, data, totals):
    th = ''.join(f'<th>{h}</th>' for h in data['head'])
    rows = ''
    for r in data['rows']:
        tot = ' class="tot"' if totals and r[0] == 'Total' else ''
        rows += f'<tr{tot}>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>'
    return f'<table class="{cls}"><thead><tr>{th}</tr></thead><tbody>{rows}</tbody></table>'

def family_html(f):
    return f'''
<section class="fam" id="{f["id"]}">
  <h2>{f["name"]}</h2>
  <p class="dec">&#10003;&ensp;{f["decision"]}</p>
  <p class="job">{f["job"]}</p>
  <div class="split">
    <div><p class="lbl">The grammar &mdash; never varies</p>
      <ul class="gram">{''.join(f'<li>{g}</li>' for g in f["grammar"])}</ul></div>
    <div><p class="lbl">The one thing that varies &mdash; {f["axis"]}</p>
      <div class="vgrid">{variants_html(f)}</div>
      <p class="varrule">{f["rule"]}</p></div>
  </div>
</section>'''

tf = TABLE_FAMILY
tables_section = f'''
<section class="fam" id="tbl">
  <h2>{tf["name"]}</h2>
  <p class="dec">&#10003;&ensp;{tf["decision"]}</p>
  <p class="job">{tf["job"]}</p>
  <div class="split">
    <div><p class="lbl">The grammar &mdash; never varies</p>
      <ul class="gram">{''.join(f'<li>{g}</li>' for g in tf["grammar"])}</ul>
      <div class="ref">{''.join(f'<span><b>Refused &middot; {n}</b> &mdash; {w}</span>'
                                for n, w in tf["refused"])}</div></div>
    <div><p class="lbl">The one thing that varies &mdash; {tf["axis"]}</p>
      <div class="vgrid">
        <div class="v"><div class="vh">no totals</div>
          <div class="vs">A one-way table. Header band, bounded cells, nothing else.</div>
          <div class="vb">{table_html("sx-table", TABLE_ONE, False)}</div></div>
        <div class="v"><div class="vh">totals present</div>
          <div class="vs">A two-way table. The totals rank gains weight, not a new treatment.</div>
          <div class="vb">{table_html("sx-table", TABLE, True)}</div></div>
      </div>
      <p class="varrule">{tf["rule"]}</p></div>
  </div>
</section>'''

BODY = f'''
<div class="rules">
  <div class="rl">
    <p class="n">Rule one</p>
    <span class="tag aut">Authored</span>
    <h3><code>reading</code>: shape or value</h3>
    <p>Does the student have to get a <b>number</b> off the figure, or only judge its <b>shape</b>?</p>
    <p>Nothing in the geometry can answer that &mdash; it is a property of the question, not of the
      picture. So it has to be authored, and the stimulus schema has to carry a field for it.</p>
    <p>It turns the grid on a function graph on and off, and the reference lines on a chart.</p>
  </div>
  <div class="rl">
    <p class="n">Rule two</p>
    <span class="tag der">Derived</span>
    <h3><code>resolutionOf()</code>: how fine the marks are</h3>
    <p>The coarsest step on which <b>every marked value lands exactly</b> &mdash; 1, &frac12;,
      &frac14;, &#8533; or &#8530;.</p>
    <p>Nobody chooses it. It is already in the spec: an endpoint at &minus;2.5 makes it &frac12;,
      and the figure grows half-step marks so that endpoint sits on one.</p>
    <p>It sets tick density on a number line and grid density in coordinate geometry.</p>
  </div>
</div>
{''.join(family_html(f) for f in FAMILIES)}
{tables_section}
<div class="close">
  <h3>What this changes downstream</h3>
  <p><b>One field is now missing from the schema.</b> <code>reading</code> cannot be inferred from a
    figure &mdash; two questions can share a graph and want different treatments &mdash; so
    <code>exam_stimuli</code> needs to carry it, and <code>exam_stimulus_spec_ok</code> needs to
    accept it. That is a migration change, and it is worth knowing now rather than after content is
    inserted.</p>
  <p><b>Everything else is derivable.</b> Grid density, tick density and the totals rank all fall
    out of values the spec already holds, which is why nothing on this page was hand-set: every
    figure above was produced by the two rules through the shared renderer.</p>
  <p><b>Shared across all five, and not negotiable per family:</b> the typeface and numeral style,
    tick treatment and numeral placement, the space around a figure inside a question, and the
    measure of the column. Those are what make a set of five different treatments still read as one
    exam.</p>
  <p>Production is untouched: the renderer is not wired, no migration exists, and no content has
    been inserted.</p>
</div>
'''

VAR_JSON = json.dumps([
  {'id': f['id'], 'kind': f.get('kind', 'plot'),
   'variants': [{'spec': v['spec'], 'opts': v['opts']} for v in f['variants']]}
  for f in FAMILIES])

HTML = f"""<title>Figure Family Grammar</title>
{CSS}
<style>{SHEET}</style>
<div class="wrap">
  <header class="mast">
    <p class="kick">Si Math AI &middot; design system &middot; nothing wired</p>
    <h1>Five families, two rules.</h1>
    <p class="lede">Not five looks handed out to five kinds of picture. Each family has a fixed
      <b>grammar</b> that never varies, and one axis of variation &mdash; and the variant is
      <b>computed from the question</b>, not chosen per figure.</p>
    <p class="lede">Two inputs decide every variant below. One has to be authored because no figure
      can reveal it; the other is already sitting in the spec. Every figure on this page was
      produced by those rules through the shared renderer &mdash; none is hand-set.</p>
  </header>
  {BODY}
</div>
<script>{R}</script>
<script>
const FAMS = {VAR_JSON};
const {{drawPlot, drawNumberLine}} = globalThis.SiExamStimulus;
for (const f of FAMS) {{
  f.variants.forEach((v, i) => {{
    const host = document.getElementById('v-' + f.id + '-' + i);
    if (!host) throw new Error('missing host v-' + f.id + '-' + i);
    host.appendChild(f.kind === 'nl' ? drawNumberLine(v.spec, v.opts) : drawPlot(v.spec, v.opts));
  }});
}}
</script>
"""
io.open('figure-system.html', 'w', encoding='utf-8').write(HTML)
print('written  figure-system.html  %d chars' % len(HTML))
