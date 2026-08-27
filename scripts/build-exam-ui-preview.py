"""The student exam surface: navigator, hideable timer, and Zero Graph.

Composed from the SHIPPED modules — exam-chrome.js, exam-graph.js and the
figure renderer — read at build time. Nothing here re-implements a control;
if the preview shows it, the module does it.

Neutral mathematics. No authored exam item appears.
"""
import io, json

REPO = '/home/user/Si-Math-Ai/'
CHROME = io.open(REPO + 'exam-chrome.js', encoding='utf-8').read()
GRAPH  = io.open(REPO + 'exam-graph.js',  encoding='utf-8').read()
FIG    = io.open('explore-render.js', encoding='utf-8').read()

# One realistic question, in the decided grammar: a function graph, reading=value.
Q = dict(
  n=14, total=22,
  stem='The graph of <i>y</i> = <i>f</i>(<i>x</i>) is shown in the <i>xy</i>-plane. '
       'What is the value of <i>f</i>(3)?',
  choices=['0', '1', '2', '3'],
  spec=dict(frame='graph', xRange=[-0.7, 4.7], yRange=[-1.6, 5], xLabel='x', yLabel='y',
    figures=[dict(mode='curve')],
    curves=[dict(points=[[round(-0.6 + i*0.2, 2),
                          round((-0.6 + i*0.2)**3/3 - 2*(-0.6 + i*0.2)**2 + 3*(-0.6 + i*0.2) + 1, 3)]
                         for i in range(27)])]),
  reading='value')

STATES = {3:'answered',5:'answered',8:'flagged',11:'answered',12:'answered',
          13:'answered',17:'flagged',19:'answered'}

CSS = r"""
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Newsreader:opsz,wght@6..72,400;6..72,600&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>
:root{
  --page:#eef1f5;--exam:#ffffff;--rule:#dde3ea;--ink:#111820;--ink-2:#445264;--ink-3:#6b7a8c;
  --cyan:#0f6f9e;--cyan-soft:rgba(15,111,158,.09);--cyan-line:rgba(15,111,158,.3);
  --shadow:0 1px 2px rgba(17,24,32,.05),0 12px 32px -18px rgba(17,24,32,.3);
  --flag:#8a5a00;--flag-soft:rgba(138,90,0,.14);
  --low:#a33a20;--low-soft:rgba(163,58,32,.10);
  --fig-ink:#111820;--fig-axis:#3b4756;--fig-num:#2a3644;--fig-grid:#848d99;--fig-fine:#c7d0da;
  --font-display:'DM Sans',system-ui,sans-serif;--font-mono:'JetBrains Mono',ui-monospace,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --page:#080c11;--exam:#161d25;--rule:#26313d;--ink:#eef3f9;--ink-2:#aebccc;--ink-3:#8493a5;
  --cyan:#38bdf8;--cyan-soft:rgba(56,189,248,.13);--cyan-line:rgba(56,189,248,.4);
  --shadow:0 1px 2px rgba(0,0,0,.5),0 12px 34px -18px rgba(0,0,0,.9);
  --flag:#e0b062;--flag-soft:rgba(224,176,98,.16);
  --low:#e08165;--low-soft:rgba(224,129,101,.14);
  --fig-ink:#eef3f9;--fig-axis:#b9c7d6;--fig-num:#cfdae6;--fig-grid:#6b768a;--fig-fine:#333f4e;
}}
:root[data-theme="dark"]{
  --page:#080c11;--exam:#161d25;--rule:#26313d;--ink:#eef3f9;--ink-2:#aebccc;--ink-3:#8493a5;
  --cyan:#38bdf8;--cyan-soft:rgba(56,189,248,.13);--cyan-line:rgba(56,189,248,.4);
  --shadow:0 1px 2px rgba(0,0,0,.5),0 12px 34px -18px rgba(0,0,0,.9);
  --flag:#e0b062;--flag-soft:rgba(224,176,98,.16);
  --low:#e08165;--low-soft:rgba(224,129,101,.14);
  --fig-ink:#eef3f9;--fig-axis:#b9c7d6;--fig-num:#cfdae6;--fig-grid:#6b768a;--fig-fine:#333f4e;
}
*{box-sizing:border-box}
body{margin:0;background-color:var(--page);color:var(--ink);
  font:16.5px/1.6 var(--font-display);-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit;cursor:pointer}

/* ── the exam shell ─────────────────────────────────────────────── */
.shell{max-width:1180px;margin:0 auto;padding:0 22px 90px}
.bar{display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid var(--rule);
  position:sticky;top:0;background:var(--page);z-index:40}
.bar-id{font-family:var(--font-mono);font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-3);font-weight:600}
.bar-sp{flex:1}
.qcard{background:var(--exam);border:1px solid var(--rule);border-radius:6px;box-shadow:var(--shadow);
  padding:34px 38px 36px;margin:26px 0 0;max-width:760px}
.qn{font-family:var(--font-mono);font-size:11.5px;font-weight:600;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink-3);margin:0 0 16px}
.stem{font-size:17.5px;line-height:1.55;margin:0 0 24px}
.stem i{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:1.06em}
.figbox{margin:0 0 26px;overflow-x:auto}
.opts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.opts li{display:flex;align-items:center;gap:14px;font-size:16.5px;border:1px solid #8792a0;
  border-radius:4px;padding:12px 16px;cursor:pointer}
.opts li:hover{border-color:var(--cyan)}
.opts .k{flex:none;width:27px;height:27px;border-radius:50%;border:1.4px solid #8792a0;
  display:grid;place-items:center;font-size:13.5px;font-weight:600}

/* ── TIMER ─────────────────────────────────────────────────────────
   Prominent by weight, not by decoration. The hidden state keeps the
   control on screen so nothing is lost and nothing has to be hunted. */
.xc-timer{display:flex;align-items:center;gap:10px;padding:6px 8px 6px 14px;border-radius:5px;
  border:1px solid var(--rule);background:var(--exam)}
.xc-t-face{font-family:var(--font-mono);font-weight:600;font-size:19px;letter-spacing:.02em;
  font-variant-numeric:tabular-nums;color:var(--ink)}
.xc-t-hidden{display:none;font-size:13.5px;color:var(--ink-3)}
.xc-timer.is-hidden .xc-t-face{display:none}
.xc-timer.is-hidden .xc-t-hidden{display:inline}
.xc-timer.is-low{border-color:var(--low);background:var(--low-soft)}
.xc-timer.is-low .xc-t-face{color:var(--low)}
.xc-t-toggle{display:inline-flex;align-items:center;gap:6px;background:none;border:none;
  padding:5px 8px;border-radius:4px;font-size:12.5px;font-weight:600;color:var(--ink-3)}
.xc-t-toggle:hover{background:var(--cyan-soft);color:var(--cyan)}
.xc-t-toggle:focus-visible,.xc-n-toggle:focus-visible,.xc-q:focus-visible,.zg-open:focus-visible,
.zg-close:focus-visible,.zg-plot:focus-visible,.zg-in:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}

/* ── NAVIGATOR ────────────────────────────────────────────────── */
.xc-nav{position:relative}
.xc-n-toggle{display:flex;align-items:center;gap:9px;background:var(--exam);
  border:1px solid var(--rule);border-radius:5px;padding:8px 14px;font-size:14.5px;font-weight:600}
.xc-n-toggle:hover{border-color:var(--cyan-line)}
.xc-n-caret{width:0;height:0;border-left:4.5px solid transparent;border-right:4.5px solid transparent;
  border-top:5px solid var(--ink-3);transition:transform .15s}
.xc-nav.is-open .xc-n-caret{transform:rotate(180deg)}
.xc-n-panel{display:none;position:absolute;top:calc(100% + 8px);left:0;z-index:60;
  background:var(--exam);border:1px solid var(--rule);border-radius:6px;box-shadow:var(--shadow);
  padding:16px 18px;min-width:330px}
.xc-nav.is-open .xc-n-panel{display:block}
.xc-n-legend{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 14px;padding-bottom:12px;
  border-bottom:1px solid var(--rule)}
.xc-lg{font-size:11.5px;color:var(--ink-3);display:inline-flex;align-items:center;gap:6px}
.xc-lg::before{content:'';width:13px;height:13px;border-radius:3px;border:1.4px solid #8792a0}
.xc-lg-cur::before{background:var(--cyan);border-color:var(--cyan);
  box-shadow:0 0 0 2px var(--exam),0 0 0 3.6px var(--cyan)}
.xc-lg-ans::before{background:var(--ink-2);border-color:var(--ink-2)}
.xc-lg-flag::before{background:var(--flag-soft);border-color:var(--flag);
  clip-path:polygon(0 0,100% 0,100% 62%,62% 100%,0 100%)}
.xc-n-grid{display:grid;grid-template-columns:repeat(11,1fr);gap:6px}
.xc-q{width:100%;aspect-ratio:1;min-width:26px;border-radius:4px;border:1.4px solid #8792a0;
  background:none;font-family:var(--font-mono);font-size:12.5px;font-weight:500;color:var(--ink-2);
  display:grid;place-items:center;padding:0}
.xc-q:hover{border-color:var(--cyan)}
.xc-q-answered{background:var(--ink-2);border-color:var(--ink-2);color:var(--exam)}
/* shape, not colour alone: a flagged chip is notched */
.xc-q-flagged{background:var(--flag-soft);border-color:var(--flag);color:var(--flag);font-weight:700;
  clip-path:polygon(0 0,100% 0,100% 62%,62% 100%,0 100%)}
/* the current chip is the only one with a ring — that is what makes it unmistakable */
.xc-q.is-current{background:var(--cyan);border-color:var(--cyan);color:#fff;font-weight:700;
  box-shadow:0 0 0 2px var(--exam),0 0 0 4px var(--cyan);clip-path:none}

/* ── ZERO GRAPH ────────────────────────────────────────────────────
   One tool, one name, one mark. Zero leans on the plate rather than
   standing beside a second logo. */
.zg-open{display:inline-flex;align-items:center;gap:10px;background:var(--exam);
  border:1px solid var(--rule);border-radius:5px;padding:6px 14px 6px 8px;font-size:14px;font-weight:600}
.zg-open:hover{border-color:var(--cyan-line);background:var(--cyan-soft)}
.zg-mark{position:relative;width:30px;height:30px;flex:none}
.zg-mark .plate{position:absolute;inset:4px 0 0 0;border-radius:5px;border:1.5px solid var(--cyan);
  background:var(--cyan-soft)}
.zg-mark .plate::before,.zg-mark .plate::after{content:'';position:absolute;background:var(--cyan-line)}
.zg-mark .plate::before{left:0;right:0;top:52%;height:1px}
.zg-mark .plate::after{top:0;bottom:0;left:38%;width:1px}
.zg-mark .curve{position:absolute;inset:4px 0 0 0}
/* Zero perches on the top-left corner of the plate, overlapping it, so the two
   read as one object rather than an emoji parked next to an icon. */
.zg-mark .zero{position:absolute;top:-3px;left:-4px;font-size:15px;line-height:1;
  filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))}
.zg-name{display:flex;flex-direction:column;line-height:1.15;text-align:left}
.zg-name b{font-size:13.5px;font-weight:700}
.zg-name span{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink-3)}

.zg-scrim{display:none;position:fixed;inset:0;background:rgba(8,12,17,.42);z-index:80}
.zg-scrim.is-open{display:block}
.zg-panel{position:fixed;right:0;top:0;bottom:0;width:min(520px,100%);background:var(--exam);
  border-left:1px solid var(--rule);z-index:90;display:none;flex-direction:column}
.zg-panel.is-open{display:flex}
.zg-head{display:flex;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid var(--rule)}
.zg-head .zg-mark{width:40px;height:40px}
.zg-head .zg-mark .zero{font-size:20px;top:-5px;left:-6px}
.zg-head h2{font-family:var(--font-display);font-weight:700;font-size:17px;margin:0}
.zg-head p{margin:2px 0 0;font-size:12px;color:var(--ink-3)}
.zg-close{margin-left:auto;background:none;border:1px solid var(--rule);border-radius:4px;
  padding:6px 10px;font-size:13px;color:var(--ink-3)}
.zg-close:hover{border-color:var(--cyan-line);color:var(--cyan)}
.zg-body{padding:18px 20px;overflow-y:auto;flex:1}
.zg-row{display:flex;gap:8px;margin:0 0 12px}
.zg-in{flex:1;font-family:var(--font-mono);font-size:14.5px;padding:10px 12px;border-radius:4px;
  border:1px solid #8792a0;background:var(--exam);color:var(--ink)}
.zg-in:focus{border-color:var(--cyan);outline:none}
.zg-plot{background:var(--cyan);border:1px solid var(--cyan);color:#fff;border-radius:4px;
  padding:10px 18px;font-size:14px;font-weight:600}
.zg-err{font-size:13.5px;color:var(--low);background:var(--low-soft);border-radius:4px;
  padding:9px 12px;margin:0 0 12px}
.zg-plate{border:1px solid var(--rule);border-radius:5px;padding:12px;display:flex;
  justify-content:center;overflow-x:auto;min-height:200px;align-items:center}
.zg-hint{font-size:12.5px;color:var(--ink-3);margin:12px 0 0;line-height:1.6}
.zg-hint code{font-family:var(--font-mono);font-size:.92em;background:var(--cyan-soft);
  color:var(--cyan);padding:1px 5px;border-radius:3px}

/* ── figures: the exam's own grammar, unchanged ───────────────── */
.sx{display:block;margin:0}
.sx-grid line{stroke:var(--fig-grid);stroke-width:1;shape-rendering:crispEdges}
.sx-grid line.sx-fine{stroke:var(--fig-fine)}
.sx-axis line{stroke:var(--fig-axis);stroke-width:1.2;stroke-linecap:butt}
.sx-arrow{fill:var(--fig-axis)}
.sx-tickmark{stroke:var(--fig-axis);stroke-width:1.2;shape-rendering:crispEdges}
.sx-tick text{fill:var(--fig-num);font-family:var(--font-display);font-size:12.5px;
  font-variant-numeric:tabular-nums;paint-order:stroke;stroke:var(--exam);stroke-width:3.5px;
  stroke-linejoin:round}
.sx-axis-tip{fill:var(--fig-axis);font-family:'Newsreader',Georgia,serif;font-style:italic;
  font-weight:600;font-size:15px}
.sx-axis-title{fill:var(--fig-num);font-family:var(--font-display);font-size:12.5px}
.sx-curve{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:3}
.sx-point{fill:currentColor;stroke:var(--exam);stroke-width:2}
.sx-series{color:var(--fig-ink)}
</style>
"""

MARK = ('<span class="zg-mark" aria-hidden="true">'
        '<span class="plate"></span>'
        '<svg class="curve" viewBox="0 0 30 26"><path d="M2 22 C 9 22, 9 6, 16 6 S 24 12, 28 4" '
        'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
        'style="color:var(--cyan)"/></svg>'
        '<span class="zero">\U0001F409</span></span>')

opts = ''.join('<li><span class="k">%s</span><span>%s</span></li>' % ('ABCD'[i], c)
               for i, c in enumerate(Q['choices']))

HTML = f"""<title>Exam Surface Preview</title>
{CSS}
<div class="shell">
  <div class="bar">
    <span class="bar-id">Digital SAT &middot; Module 1</span>
    <span id="navslot"></span>
    <span class="bar-sp"></span>
    <button class="zg-open" id="zgopen" type="button" aria-haspopup="dialog">
      {MARK}<span class="zg-name"><b>Zero Graph</b><span>Graphing workspace</span></span>
    </button>
    <span id="timeslot"></span>
  </div>

  <div class="qcard">
    <p class="qn">Question {Q['n']}</p>
    <p class="stem">{Q['stem']}</p>
    <div class="figbox" id="fig"></div>
    <ul class="opts">{opts}</ul>
  </div>
</div>

<div class="zg-scrim" id="zgscrim"></div>
<aside class="zg-panel" id="zgpanel" role="dialog" aria-modal="false" aria-label="Zero Graph">
  <div class="zg-head">
    {MARK}
    <div><h2>Zero Graph</h2><p>Sketch a function. Your work stays yours.</p></div>
    <button class="zg-close" id="zgclose" type="button">Close</button>
  </div>
  <div class="zg-body">
    <div class="zg-row">
      <input class="zg-in" id="zgin" value="x^3/3 - 2x^2 + 3x + 1" spellcheck="false"
             aria-label="Function of x to plot">
      <button class="zg-plot" id="zgplot" type="button">Plot</button>
    </div>
    <div id="zgerr"></div>
    <div class="zg-plate" id="zgplate"></div>
    <p class="zg-hint">Type a function of <code>x</code>. Powers with <code>^</code>,
      and <code>sin</code> <code>cos</code> <code>tan</code> <code>sqrt</code> <code>abs</code>
      <code>ln</code> are available. Nothing you sketch here is submitted or marked.</p>
  </div>
</aside>

<script>{FIG}</script>
<script>{CHROME}</script>
<script>{GRAPH}</script>
<script>
const Q = {json.dumps(Q)};
const STATES = {json.dumps({str(k): v for k, v in STATES.items()})};
const {{ renderForQuestion }} = globalThis.SiExplore;
const {{ Timer, Navigator }} = globalThis.SiExamChrome;
const G = globalThis.SiExamGraph;

document.getElementById('fig').appendChild(
  renderForQuestion({{ id: 'q' + Q.n, reading: Q.reading }},
                    {{ id: 's1', kind: 'plot', spec: Q.spec }}));

const nav = Navigator({{ total: Q.total, current: Q.n, states: STATES,
  onJump: n => nav.setCurrent(n) }});
document.getElementById('navslot').appendChild(nav.el);

const timer = Timer({{ remaining: 1043, total: 2100 }});
document.getElementById('timeslot').appendChild(timer.el);
globalThis.__nav = nav; globalThis.__timer = timer;

// ── Zero Graph ────────────────────────────────────────────────────
const panel = document.getElementById('zgpanel'), scrim = document.getElementById('zgscrim');
const plate = document.getElementById('zgplate'), errbox = document.getElementById('zgerr');
function open(v) {{
  panel.classList.toggle('is-open', v); scrim.classList.toggle('is-open', v);
  if (v) {{ document.getElementById('zgin').focus(); plot(); }}
}}
document.getElementById('zgopen').addEventListener('click', () => open(true));
document.getElementById('zgclose').addEventListener('click', () => open(false));
scrim.addEventListener('click', () => open(false));
document.addEventListener('keydown', e => {{ if (e.key === 'Escape') open(false); }});
function plot() {{
  const src = document.getElementById('zgin').value;
  errbox.textContent = '';
  plate.textContent = '';
  try {{
    const spec = G.toSpec([G.compile(src)], [-4, 6], [-4, 8], 140);
    if (!spec) throw new Error('Nothing lands inside the window');
    // the STUDENT's sketch goes through the exam's own renderer, so it obeys
    // the same grammar as the question's figure
    plate.appendChild(renderForQuestion({{ id: 'zg', reading: 'value' }},
                                        {{ id: 'zg', kind: 'plot', spec: spec }}));
  }} catch (e) {{
    const d = document.createElement('div');
    d.className = 'zg-err'; d.textContent = e.message;
    errbox.appendChild(d);
  }}
}}
document.getElementById('zgplot').addEventListener('click', plot);
document.getElementById('zgin').addEventListener('keydown', e => {{ if (e.key === 'Enter') plot(); }});
globalThis.__plot = plot; globalThis.__open = open;
</script>
"""
io.open('exam-ui-preview.html', 'w', encoding='utf-8').write(HTML)
print('written  exam-ui-preview.html  %d chars' % len(HTML))
