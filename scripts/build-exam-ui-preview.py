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
CALC   = io.open(REPO + 'exam-calculator.js', encoding='utf-8').read()
PDESMOS= io.open(REPO + 'exam-graph-desmos.js', encoding='utf-8').read()
PZERO  = io.open(REPO + 'exam-graph-zero.js', encoding='utf-8').read()
# The established Zero, inlined at its native 40px and displayed at 34px, which
# is the only size this artwork is crisp at. See "A note on Zero's artwork" in
# docs/engineering/exam-surface.md before reaching for a bigger one.
ZERO_PNG = 'data:image/png;base64,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'
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
  padding:34px 38px 36px;margin:26px auto 0;max-width:760px}
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
.zg-panel{position:fixed;right:0;top:0;bottom:0;width:min(620px,100%);background:var(--exam);
  border-left:1px solid var(--rule);z-index:90;display:none;flex-direction:column}
.zg-panel.is-open{display:flex}
.zg-head{display:flex;align-items:center;gap:12px;padding:18px 20px;
  border-bottom:1px solid var(--rule);min-height:78px}
.zg-head>div{min-width:0;flex:1}
.zg-head .zg-mark{width:40px;height:40px}
.zg-head .zg-mark .zero{font-size:20px;top:-5px;left:-6px}
.zg-head h2{font-family:var(--font-display);font-weight:700;font-size:17px;margin:0}
.zg-head p{margin:2px 0 0;font-size:12px;color:var(--ink-3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zg-close{margin-left:auto;background:none;border:1px solid var(--rule);border-radius:4px;
  padding:6px 10px;font-size:13px;color:var(--ink-3)}
.zg-close:hover{border-color:var(--cyan-line);color:var(--cyan)}
.zg-body{padding:18px 20px;overflow-y:auto;flex:1;display:flex;min-height:0}
#zgmount{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}
.zg-row{display:flex;gap:8px;margin:0 0 12px}
.zg-in{flex:1;font-family:var(--font-mono);font-size:14.5px;padding:10px 12px;border-radius:4px;
  border:1px solid #8792a0;background:var(--exam);color:var(--ink)}
.zg-in:focus{border-color:var(--cyan);outline:none}
.zg-plot{background:var(--cyan);border:1px solid var(--cyan);color:#fff;border-radius:4px;
  padding:10px 18px;font-size:14px;font-weight:600}
.zg-err{font-size:13.5px;color:var(--low);background:var(--low-soft);border-radius:4px;
  padding:9px 12px;margin:0 0 12px}
.zg-plate{border:1px solid var(--rule);border-radius:5px;padding:12px;display:flex;
  justify-content:center;overflow:auto;min-height:200px;align-items:center}
.zg-hint{font-size:12.5px;color:var(--ink-3);margin:12px 0 0;line-height:1.6}
.zg-hint code{font-family:var(--font-mono);font-size:.92em;background:var(--cyan-soft);
  color:var(--cyan);padding:1px 5px;border-radius:3px}
.zg-zero{display:block;width:34px;height:34px;image-rendering:auto}
.zg-head .zg-mark{width:44px;height:44px;display:grid;place-items:center}
.zg-head .zg-zero{width:40px;height:40px}
.zg-switch{display:flex;align-items:center;gap:6px;padding:10px 20px;
  border-bottom:1px solid var(--rule);background:var(--page)}
.zg-switch span{font-family:var(--font-mono);font-size:10px;letter-spacing:.11em;
  text-transform:uppercase;color:var(--ink-3);margin-right:4px}
.zg-switch button{background:none;border:1px solid var(--rule);border-radius:4px;
  padding:5px 10px;font-size:12px;color:var(--ink-3)}
.zg-switch button.on{border-color:var(--cyan);color:var(--cyan);background:var(--cyan-soft);
  font-weight:600}
.zg-gate{border:1px dashed #8792a0;border-radius:6px;padding:26px 28px;text-align:left;
  flex:1;display:flex;flex-direction:column;justify-content:center;align-items:flex-start}
.zg-gate h3{margin:0 0 10px;font-size:15.5px}
.zg-gate p{margin:0 0 10px;font-size:14px;color:var(--ink-2);line-height:1.6}
.zg-gate p:last-child{margin:0}
.zg-gate .st{display:inline-block;font-family:var(--font-mono);font-size:11px;
  padding:3px 8px;border-radius:3px;margin:0 0 12px;background:var(--flag-soft);color:var(--flag)}
.zg-gate .st.ok{background:var(--cyan-soft);color:var(--cyan)}
.zg-gate code{font-family:var(--font-mono);font-size:.9em;background:var(--cyan-soft);
  color:var(--cyan);padding:1px 5px;border-radius:3px}
.zg-res{border:1px solid var(--rule);border-radius:6px;flex:1;display:grid;
  place-items:center;text-align:center;padding:26px;background:var(--page)}
.zg-res b{display:block;font-size:14.5px;margin-bottom:8px}
.zg-res span{font-size:13px;color:var(--ink-3);max-width:44ch;line-height:1.6;display:block}

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

# Zero, at his native 40px where the established artwork is crisp. He belongs to
# OUR chrome — the launcher and the workspace header — and never appears over a
# provider's own surface.
MARK = ('<span class="zg-mark" aria-hidden="true">'
        '<img class="zg-zero" src="' + ZERO_PNG + '" alt="" width="34" height="34">'
        '</span>')

opts = ''.join('<li><span class="k">%s</span><span>%s</span></li>' % ('ABCD'[i], c)
               for i, c in enumerate(Q['choices']))

HTML = f"""<title>Si Math Exam Surface</title>
{CSS}
<div class="shell">
  <div class="bar">
    <span class="bar-id">Digital SAT &middot; Module 1</span>
    <span id="navslot"></span>
    <span class="bar-sp"></span>
    <button class="zg-open" id="zgopen" type="button" aria-haspopup="dialog">
      {MARK}<span class="zg-name"><b>Graphing Calculator</b><span>Open with Zero</span></span>
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
<aside class="zg-panel" id="zgpanel" role="dialog" aria-modal="false"
       aria-label="Graphing calculator">
  <!-- OUR header. Zero lives here. Below the rule, the provider owns the space. -->
  <div class="zg-head">
    {MARK}
    <div><h2 id="zgtitle">Graphing Calculator</h2>
         <p id="zgsub">Zero has this open for you.</p></div>
    <button class="zg-close" id="zgclose" type="button">Close</button>
  </div>
  <div class="zg-switch" role="group" aria-label="Provider (review control, not in the student build)">
    <span>Provider &middot; review only</span>
    <button type="button" data-p="desmos" class="on">Desmos</button>
    <button type="button" data-p="desmos-cfg">Desmos, configured</button>
    <button type="button" data-p="zero-graph">Zero Graph</button>
  </div>
  <div class="zg-body"><div id="zgmount"></div></div>
</aside>

<script>{FIG}</script>
<script>{CHROME}</script>
<script>{CALC}</script>
<script>{GRAPH}</script>
<script>{PZERO}</script>
<script>{PDESMOS}</script>
<script>
const Q = {json.dumps(Q)};
const STATES = {json.dumps({str(k): v for k, v in STATES.items()})};
const {{ renderForQuestion }} = globalThis.SiExplore;
const {{ Timer, Navigator }} = globalThis.SiExamChrome;

document.getElementById('fig').appendChild(
  renderForQuestion({{ id: 'q' + Q.n, reading: Q.reading }},
                    {{ id: 's1', kind: 'plot', spec: Q.spec }}));

const nav = Navigator({{ total: Q.total, current: Q.n, states: STATES,
  onJump: n => nav.setCurrent(n) }});
document.getElementById('navslot').appendChild(nav.el);
const timer = Timer({{ remaining: 1043, total: 2100 }});
document.getElementById('timeslot').appendChild(timer.el);
globalThis.__nav = nav; globalThis.__timer = timer;

// ── the workspace is PROVIDER-AGNOSTIC ────────────────────────────────────
// It asks exam-calculator.js for a provider, reads its status, and mounts it.
// It contains no branch on which provider it is, which is what stops the exam
// UI being redesigned around whichever tool is active.
const panel = document.getElementById('zgpanel'), scrim = document.getElementById('zgscrim');
const mountEl = document.getElementById('zgmount');
const titleEl = document.getElementById('zgtitle'), subEl = document.getElementById('zgsub');
let activeId = 'desmos', active = null;

function providerFor(id) {{
  if (id === 'zero-graph') return globalThis.SiExamGraphZero;
  // 'desmos-cfg' is a PREVIEW-ONLY state: the same provider with a key present,
  // so the gated and licensed paths can both be seen. It configures nothing real.
  if (id === 'desmos-cfg') {{
    globalThis.SI_DESMOS_CONFIG = {{ apiKey: 'PREVIEW-NOT-A-REAL-KEY',
                                    tier: 'commercial', studentFacing: true }};
    return globalThis.SiExamGraphDesmos;
  }}
  globalThis.SI_DESMOS_CONFIG = undefined;
  return globalThis.SiExamGraphDesmos;
}}

function gate(st, prov) {{
  const d = document.createElement('div'); d.className = 'zg-gate';
  const badge = document.createElement('span');
  badge.className = 'st'; badge.textContent = st.state;
  d.appendChild(badge);
  const h = document.createElement('h3');
  h.textContent = prov.displayName + ' is not active';
  d.appendChild(h);
  const p1 = document.createElement('p'); p1.textContent = st.detail; d.appendChild(p1);
  const p2 = document.createElement('p');
  p2.innerHTML = 'The integration is built and wired. Activation needs a key in ' +
    '<code>SI_DESMOS_CONFIG</code> and a tier declared under the API terms — ' +
    '&sect;2.a trial for internal evaluation, or &sect;3.a self-serve paid plan / ' +
    'Commercial Addendum for anything student-facing.';
  d.appendChild(p2);
  return d;
}}

function reserved(prov) {{
  const d = document.createElement('div'); d.className = 'zg-res';
  const inner = document.createElement('div');
  const b = document.createElement('b'); b.textContent = prov.displayName + ' mounts here';
  const s2 = document.createElement('span');
  s2.textContent = 'With a licensed key this region is the official calculator, running from ' +
    'Desmos\u2019s own script, presented as it comes. Nothing of ours is drawn over it. ' +
    'It has never been rendered in this environment: desmos.com is blocked by the ' +
    'egress proxy here and no key exists.';
  inner.appendChild(b); inner.appendChild(s2); d.appendChild(inner);
  return d;
}}

function show(id) {{
  if (active && active.unmount) {{ try {{ active.unmount(); }} catch (e) {{}} }}
  activeId = id;
  const prov = providerFor(id);
  active = prov;
  mountEl.textContent = '';
  const st = prov.status();
  titleEl.textContent = 'Graphing Calculator';
  subEl.textContent = st.ready ? st.detail : 'Zero has this open for you.';
  document.querySelectorAll('.zg-switch button').forEach(b =>
    b.classList.toggle('on', b.dataset.p === id));
  if (!st.ready) {{ mountEl.appendChild(gate(st, prov)); return; }}
  if (prov.id === 'desmos') {{ mountEl.appendChild(reserved(prov)); return; }}
  prov.mount(mountEl, {{ seed: 'x^2 - 3' }}).catch(e => {{
    const d = document.createElement('div'); d.className = 'zg-err';
    d.textContent = e.message; mountEl.appendChild(d);
  }});
}}
document.querySelectorAll('.zg-switch button').forEach(b =>
  b.addEventListener('click', () => show(b.dataset.p)));

function open(v) {{
  panel.classList.toggle('is-open', v); scrim.classList.toggle('is-open', v);
  if (v) show(activeId);
  else if (active && active.unmount) {{ try {{ active.unmount(); }} catch (e) {{}} }}
}}
document.getElementById('zgopen').addEventListener('click', () => open(true));
document.getElementById('zgclose').addEventListener('click', () => open(false));
scrim.addEventListener('click', () => open(false));
document.addEventListener('keydown', e => {{ if (e.key === 'Escape') open(false); }});
globalThis.__open = open; globalThis.__show = show;
globalThis.__providers = () => globalThis.SiExamCalculator.providerCount();
</script>
"""
io.open('exam-ui-preview.html', 'w', encoding='utf-8').write(HTML)
print('written  exam-ui-preview.html  %d chars' % len(HTML))
