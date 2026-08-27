"""End-to-end proof: Question + Stimulus -> Rendered Figure.

The payload is exported from a real Spine database by ../e2e-fixture.sh: ONE
exam_stimuli row referenced by TWO exam_questions rows whose `reading` differs.
Nothing here re-states the spec or the reading — both arrive from the database,
and the page calls renderForQuestion(question, question.stimulus) with what it
was given.

If the figures below differ, the difference came from the question row, because
the stimulus row is byte-identical between them.
"""
import io, json, sys

R = io.open('explore-render.js', encoding='utf-8').read()
PAYLOAD = io.open(sys.argv[1] if len(sys.argv) > 1 else '../e2e-payload.json',
                  encoding='utf-8').read()
OUT = sys.argv[2] if len(sys.argv) > 2 else 'e2e-preview.html'
data = json.loads(PAYLOAD)
sid = data[0]['stimulus']['id']
assert all(q['stimulus']['id'] == sid for q in data), 'payload must share one stimulus'

CSS = r"""
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap">
<style>
:root{
  --page:#e9edf2; --card:#fff; --rule:#dde3ea; --ink:#111820; --ink-2:#445264; --ink-3:#6b7a8c;
  --accent:#0f5c8c; --accent-soft:rgba(15,92,140,.08);
  --shadow:0 1px 2px rgba(17,24,32,.05), 0 12px 32px -18px rgba(17,24,32,.3);
  --good:#1c6b4a; --good-soft:rgba(28,107,74,.10);
  --exam:#fff; --exam-rule:#8792a0;
  --fig-ink:#111820; --fig-axis:#3b4756; --fig-num:#2a3644;
  --fig-grid:#848d99; --fig-fine:#c7d0da;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --page:#080c11; --card:#131920; --rule:#26313d; --ink:#eef3f9; --ink-2:#aebccc; --ink-3:#8493a5;
  --accent:#6bb6e4; --accent-soft:rgba(107,182,228,.12);
  --shadow:0 1px 2px rgba(0,0,0,.5), 0 12px 34px -18px rgba(0,0,0,.9);
  --good:#63c39a; --good-soft:rgba(99,195,154,.13);
  --exam:#161d25; --exam-rule:#6f7d8c;
  --fig-ink:#eef3f9; --fig-axis:#b9c7d6; --fig-num:#cfdae6;
  --fig-grid:#6b768a; --fig-fine:#333f4e;
}}
:root[data-theme="dark"]{
  --page:#080c11; --card:#131920; --rule:#26313d; --ink:#eef3f9; --ink-2:#aebccc; --ink-3:#8493a5;
  --accent:#6bb6e4; --accent-soft:rgba(107,182,228,.12);
  --shadow:0 1px 2px rgba(0,0,0,.5), 0 12px 34px -18px rgba(0,0,0,.9);
  --good:#63c39a; --good-soft:rgba(99,195,154,.13);
  --exam:#161d25; --exam-rule:#6f7d8c;
  --fig-ink:#eef3f9; --fig-axis:#b9c7d6; --fig-num:#cfdae6;
  --fig-grid:#6b768a; --fig-fine:#333f4e;
}
*{box-sizing:border-box}
body{margin:0;background-color:var(--page);color:var(--ink);
  font:16.5px/1.6 'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1320px;margin:0 auto;padding:0 26px 120px}
.mast{padding:74px 0 10px;max-width:70ch}
.kick{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3);
  margin:0 0 16px;font-weight:600}
h1{font-family:'Newsreader',Georgia,serif;font-weight:600;font-size:clamp(34px,5vw,52px);
  line-height:1.05;letter-spacing:-.02em;margin:0 0 18px;text-wrap:balance}
.lede{font-size:19px;color:var(--ink-2);margin:0 0 14px}
.src{background:var(--card);border:1px solid var(--rule);border-radius:6px;box-shadow:var(--shadow);
  padding:20px 24px;margin:30px 0 8px;font-family:ui-monospace,monospace;font-size:13px;
  color:var(--ink-2);overflow-x:auto}
.src b{color:var(--ink);font-family:'DM Sans',sans-serif;font-weight:700;
  display:block;margin-bottom:10px;font-size:12px;letter-spacing:.1em;text-transform:uppercase}
.src .k{color:var(--accent)}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(560px,1fr));gap:22px;
  align-items:start;margin-top:26px}
.col{display:flex;flex-direction:column;gap:11px}
.tag{font-family:ui-monospace,monospace;font-size:12.5px;font-weight:600;color:var(--good);
  background:var(--good-soft);border-radius:3px;padding:6px 11px;width:max-content}
.q{background:var(--exam);border:1px solid var(--rule);border-radius:5px;box-shadow:var(--shadow);
  padding:28px 32px 30px}
.qn{font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--ink-3);margin:0 0 15px}
.stem{font-size:17.5px;line-height:1.55;margin:0 0 22px}
.figbox{margin:0 0 22px;overflow-x:auto}
.opts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.opts li{display:flex;align-items:center;gap:13px;font-size:16.5px;
  border:1px solid var(--exam-rule);border-radius:4px;padding:11px 15px}
.opts .k{flex:none;width:26px;height:26px;border-radius:50%;border:1.4px solid var(--exam-rule);
  display:grid;place-items:center;font-size:13.5px;font-weight:600}
.note{background:var(--accent-soft);border-radius:5px;padding:18px 22px;margin:30px 0 0;
  font-size:15px;color:var(--ink-2);max-width:86ch}
.note b{color:var(--ink)}
.sx{display:block;margin:0}
.sx-grid line{stroke:var(--fig-grid);stroke-width:1;shape-rendering:crispEdges}
.sx-grid line.sx-fine{stroke:var(--fig-fine)}
.sx-axis line{stroke:var(--fig-axis);stroke-width:1.2;stroke-linecap:butt}
.sx-arrow{fill:var(--fig-axis)}
.sx-tickmark{stroke:var(--fig-axis);stroke-width:1.2;shape-rendering:crispEdges}
.sx-tick text{fill:var(--fig-num);font-family:'DM Sans',sans-serif;font-size:12.5px;
  font-variant-numeric:tabular-nums;paint-order:stroke;stroke:var(--exam);
  stroke-width:3.5px;stroke-linejoin:round}
.sx-axis-tip{fill:var(--fig-axis);font-family:'Newsreader',Georgia,serif;font-style:italic;
  font-weight:600;font-size:15px}
.sx-axis-title{fill:var(--fig-num);font-family:'DM Sans',sans-serif;font-size:12.5px}
.sx-label{fill:var(--fig-ink);font-family:'Newsreader',Georgia,serif;font-style:italic;
  font-weight:600;font-size:16px;text-anchor:middle;paint-order:stroke;stroke:var(--exam);
  stroke-width:4px;stroke-linejoin:round}
.sx-curve{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:3}
.sx-point{fill:currentColor;stroke:var(--exam);stroke-width:2}
.sx-series{color:var(--fig-ink)}
</style>
"""

def question_html(q):
    opts = ''.join(f'<li><span class="k">{c["id"]}</span><span>{c["text"]}</span></li>'
                   for c in q['choices'])
    return (f'<div class="q"><p class="qn">Question {q["ordinal"]}</p>'
            f'<p class="stem">{q["prompt"]}</p>'
            f'<div class="figbox" id="fig-{q["ordinal"]}"></div>'
            f'<ul class="opts">{opts}</ul></div>')

cols = ''.join(
  f'<div class="col"><span class="tag">exam_questions.reading = "{q["reading"]}"</span>'
  f'{question_html(q)}</div>' for q in data)

HTML = f"""<title>Shared Stimulus Proof</title>
{CSS}
<div class="wrap">
  <header class="mast">
    <p class="kick">Si Math AI &middot; end-to-end proof &middot; nothing applied</p>
    <h1>One stimulus. Two questions. Two figures.</h1>
    <p class="lede">Both questions below reference <b>the same <code>exam_stimuli</code> row</b> —
      same id, byte-identical spec — exported from a real Spine database with the PREPARED
      migration applied to it.</p>
    <p class="lede">The only thing that differs between them is <code>exam_questions.reading</code>.
      If the figures differ, the difference came from the question.</p>
  </header>

  <div class="src"><b>What the client fetched</b>
    stimulus <span class="k">{sid}</span> &middot; kind <span class="k">plot</span> &middot;
    spec.frame <span class="k">"{data[0]['stimulus']['spec']['frame']}"</span> &middot;
    {len(data[0]['stimulus']['spec']['curves'][0]['points'])} points<br>
    Q{data[0]['ordinal']} &rarr; reading <span class="k">"{data[0]['reading']}"</span> &nbsp;&middot;&nbsp;
    Q{data[1]['ordinal']} &rarr; reading <span class="k">"{data[1]['reading']}"</span><br>
    both rendered by <span class="k">renderForQuestion(question, question.stimulus)</span>
  </div>

  <div class="pair">{cols}</div>

  <div class="note"><b>The path is Question + Stimulus &rarr; Figure.</b> The page passes the
    question object it was given; it does not choose a treatment, and it has no branch on the
    question number. <code>renderStimulus(kind, spec)</code> — the stimulus-only path — now
    <b>throws</b> for these families rather than drawing a default, so the old path cannot be
    taken by accident.</div>
</div>
<script>{R}</script>
<script>
// The payload EXACTLY as the database returned it. Nothing is edited here.
const PAYLOAD = {PAYLOAD};
// exposed so the harness reads exactly what the page used, rather than
// re-parsing the file and possibly checking a different thing
globalThis.PAYLOAD = PAYLOAD;
const {{ renderForQuestion }} = globalThis.SiExplore;
for (const q of PAYLOAD) {{
  const host = document.getElementById('fig-' + q.ordinal);
  if (!host) throw new Error('missing host for question ' + q.ordinal);
  host.appendChild(renderForQuestion(q, q.stimulus));
}}
</script>
"""
io.open(OUT, 'w', encoding='utf-8').write(HTML)
print('written  %s  %d chars' % (OUT, len(HTML)))
