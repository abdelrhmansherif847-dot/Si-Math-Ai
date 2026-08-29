"""The student exam surface: navigator, hideable timer, and Zero Graph.

Composed from the SHIPPED modules — exam-chrome.js, exam-graph.js and the
figure renderer — read at build time. Nothing here re-implements a control;
if the preview shows it, the module does it.

Neutral mathematics. No authored exam item appears.
"""
import io, json, os

REPO = '/home/user/Si-Math-Ai/'
CHROME = io.open(REPO + 'exam-chrome.js', encoding='utf-8').read()
GRAPH  = io.open(REPO + 'exam-graph.js',  encoding='utf-8').read()
CALC   = io.open(REPO + 'exam-calculator.js', encoding='utf-8').read()
WORKSPACE = io.open(REPO + 'exam-workspace.js', encoding='utf-8').read()
PDESMOS= io.open(REPO + 'exam-graph-desmos.js', encoding='utf-8').read()
PZERO  = io.open(REPO + 'exam-graph-zero.js', encoding='utf-8').read()
# The established Zero, inlined at its native 40px and displayed at 34px, which
# is the only size this artwork is crisp at. See "A note on Zero's artwork" in
# docs/engineering/exam-surface.md before reaching for a bigger one.
ZERO_PNG = 'data:image/png;base64,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'
# THE renderer, read from its authored source at build time — never a copy
# pasted into this file. A snapshot was embedded in a preview once and went
# stale immediately: fixes stopped reaching it while it still looked correct.
# validate-exam-stimulus.mjs fails if a generated page here falls behind.
CORE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    '..', 'supabase', 'functions', '_shared', 'exam-stimulus.core.js')
FIG = io.open(CORE, encoding='utf-8').read()

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
.xw-close:focus-visible,.zg-plot:focus-visible,.zg-in:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}

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
/* The launcher's mark. Zero is a 40x40 raster displayed at 34px — the only
   size the established artwork is crisp at. See exam-surface.md. */
.zg-mark{width:38px;height:38px;flex:none;display:grid;place-items:center}
.zg-zero{display:block;width:34px;height:34px}
.zg-name{display:flex;flex-direction:column;line-height:1.15;text-align:left}
.zg-name b{font-size:13.5px;font-weight:700}
.zg-name span{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink-3)}

/* ── the workspace: exam-workspace.js's own markup, styled once ───────────
   Every rule here is provider-agnostic by construction. There is no
   `.xw-panel--desmos`, and adding one would be the bug. */
.xw-scrim{display:none;position:fixed;inset:0;background:rgba(8,12,17,.42);z-index:80}
.xw-scrim.is-open{display:block}
.xw-panel{position:fixed;right:0;top:0;bottom:0;width:min(620px,100%);background:var(--exam);
  border-left:1px solid var(--rule);z-index:90;display:none;flex-direction:column}
.xw-panel.is-open{display:flex}
/* Fixed band. Its height must not depend on which provider is active, or the
   calculator region below it moves when the provider changes. */
.xw-head{display:flex;align-items:center;gap:12px;padding:18px 20px;
  border-bottom:1px solid var(--rule);min-height:78px}
.xw-head>div{min-width:0;flex:1}
.xw-head .zg-mark{width:44px;height:44px}
.xw-head .zg-zero{width:40px;height:40px}
.xw-head h2{font-family:var(--font-display);font-weight:700;font-size:17px;margin:0}
/* The subtitle RESERVES its line even when empty. A gated provider has nothing
   to say here, and letting the line collapse shrank the header by 4px and moved
   the calculator region — the panel changing shape because of which provider is
   active, which is the one thing this layout must never do. */
.xw-sub{margin:2px 0 0;font-size:12px;line-height:1.6;min-height:19.2px;color:var(--ink-3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xw-close{margin-left:auto;background:none;border:1px solid var(--rule);border-radius:4px;
  padding:6px 10px;font-size:13px;color:var(--ink-3)}
.xw-close:hover{border-color:var(--cyan-line);color:var(--cyan)}
.xw-body{padding:18px 20px;overflow-y:auto;flex:1;display:flex;min-height:0}
/* A STAGE of fixed size, not a box that grows to fit. Two reasons, and the
   second is load-bearing: the workspace must not resize under the student, and
   Desmos.GraphingCalculator() measures the element it is given — an auto-height
   container mounts a calculator with no height. */
.xw-mount{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}
.xw-gate,.xw-err{border-radius:6px;padding:26px 28px;text-align:left;
  flex:0 0 auto;margin:auto 0;display:flex;flex-direction:column;align-items:flex-start}
.xw-gate{border:1px dashed #8792a0}
/* A failure mid-exam is told, not shouted. The red lives in the state chip and
   a single edge rule; a full red wash across the panel is the wrong volume for
   a student who has a clock running. */
.xw-err{border:1px solid var(--rule);border-left:3px solid var(--low)}
.xw-gate h3,.xw-err h3{margin:0 0 10px;font-size:15.5px}
.xw-gate p,.xw-err p{margin:0 0 10px;font-size:14px;color:var(--ink-2);line-height:1.6;
  max-width:52ch}
.xw-state{display:inline-block;font-family:var(--font-mono);font-size:11px;
  padding:3px 8px;border-radius:3px;margin:0 0 12px;background:var(--flag-soft);color:var(--flag)}
.xw-state.xw-bad{background:var(--low-soft);color:var(--low)}
.xw-fb-note{color:var(--ink-3)!important;font-size:13px!important}
.xw-fb{background:none;border:1px solid var(--cyan);border-radius:4px;
  padding:8px 14px;font-size:13.5px;font-weight:600;color:var(--cyan)}
.xw-fb:hover{background:var(--cyan-soft)}
.xw-fb:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
/* Preview-only. Not in the student build — see the label it carries. */
.zg-switch{display:flex;align-items:center;gap:6px;padding:10px 20px;
  border-bottom:1px solid var(--rule);background:var(--page)}
.zg-switch span{font-family:var(--font-mono);font-size:10px;letter-spacing:.11em;
  text-transform:uppercase;color:var(--ink-3);margin-right:4px}
.zg-switch button{background:none;border:1px solid var(--rule);border-radius:4px;
  padding:5px 10px;font-size:12px;color:var(--ink-3)}
.zg-switch button.on{border-color:var(--cyan);color:var(--cyan);background:var(--cyan-soft);
  font-weight:600}

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

<!-- The panel is built by exam-workspace.js, not written here. The only thing
     the preview adds to it is the review-only provider switcher below. -->
<div id="wsslot"></div>
<template id="switch-tpl">
  <div class="zg-switch" role="group"
       aria-label="Provider (review control, not in the student build)">
    <span>Provider &middot; review only</span>
    <button type="button" data-p="desmos" class="on">No key</button>
    <button type="button" data-p="desmos-cfg">Key set</button>
    <button type="button" data-p="zero-graph">Zero Graph</button>
  </div>
</template>

<script>{FIG}</script>
<script>{CHROME}</script>
<script>{CALC}</script>
<script>{WORKSPACE}</script>
<script>{GRAPH}</script>
<script>{PZERO}</script>
<script>{PDESMOS}</script>
<script>
const Q = {json.dumps(Q)};
const STATES = {json.dumps({str(k): v for k, v in STATES.items()})};
const {{ renderForQuestion }} = globalThis.SiExamStimulus;
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

// ── the workspace ─────────────────────────────────────────────────────────
// Built by exam-workspace.js. The preview supplies the launcher, the mark and
// the review-only switcher; the panel, the gate card, the error card and the
// fallback offer are all shipped code.
const {{ Workspace }} = globalThis.SiExamWorkspace;

const mark = () => {{
  const t = document.createElement('template');
  t.innerHTML = {json.dumps(MARK)};
  return t.content.firstElementChild;
}};

const ws = Workspace({{ providerId: 'desmos', fallbackId: 'zero-graph',
                        title: 'Graphing Calculator', mark: mark(), seed: 'x^2 - 3' }});
document.body.appendChild(ws.scrim);
document.body.appendChild(ws.el);

// The switcher is spliced into the panel between our header and the mount
// region. It exists so all three provider states can be reviewed side by side
// and is NOT part of the student build.
const sw = document.getElementById('switch-tpl').content.firstElementChild.cloneNode(true);
ws.el.insertBefore(sw, ws.el.querySelector('.xw-body'));

// 'desmos' and 'desmos-cfg' are the SAME provider under different configuration.
// That is the point: the difference between gated and licensed is a config
// value, not a code path.
function show(id) {{
  if (id === 'desmos-cfg') {{
    globalThis.SI_DESMOS_CONFIG = {{ apiKey: 'PREVIEW-NOT-A-REAL-KEY',
                                     tier: 'commercial', studentFacing: true }};
  }} else {{
    globalThis.SI_DESMOS_CONFIG = undefined;
  }}
  sw.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.p === id));
  ws.setProvider(id === 'zero-graph' ? 'zero-graph' : 'desmos');
  globalThis.__switchId = id;
}}
sw.querySelectorAll('button').forEach(b =>
  b.addEventListener('click', () => show(b.dataset.p)));

document.getElementById('zgopen').addEventListener('click', () => {{
  show(globalThis.__switchId || 'desmos'); ws.open();
}});

globalThis.__ws = ws;
globalThis.__open = v => v ? ws.open() : ws.close();
globalThis.__show = show;
globalThis.__providers = () => globalThis.SiExamCalculator.providerCount();
</script>
"""
io.open('exam-ui-preview.html', 'w', encoding='utf-8').write(HTML)
print('written  exam-ui-preview.html  %d chars' % len(HTML))
