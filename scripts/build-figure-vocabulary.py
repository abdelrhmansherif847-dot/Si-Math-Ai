"""Builds the Figure Vocabulary review page.

The frame illustration is drawn by the REAL renderer (exam-stimulus.js), so the
argument about equal axis scales is demonstrated rather than asserted.
"""
import io, os, json
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RENDERER = io.open(os.path.join(REPO, 'exam-stimulus.js'), encoding='utf-8').read()

def samples(f, a, b, step):
    out, x = [], a
    while x <= b + 1e-9:
        out.append([round(x,3), round(f(x),3)]); x += step
    return out
CUBIC = samples(lambda x: 3*(x**3 - 7*x*x + 10*x), 0, 5, 0.25)

INVARIANTS = [
 ('P1','<code>frame</code> present and in <code>plane</code> · <code>graph</code> · <code>data</code>',
  'a plot that does not say whether distance is meaningful'),
 ('P2','every curve has <code>figure</code>, in <code>scatter</code> · <code>curve</code> · <code>polygon</code>',
  'a figure the renderer would have to guess at'),
 ('P3','<code>expr</code> ⇒ <code>figure = curve</code>',
  'an expression declared a scatter or a polygon'),
 ('P4','<code>expr</code> ⇒ no <code>closed</code>, no <code>pointLabels</code>',
  'closure or names on something with no enumerable points'),
 ('P5','<code>figure = scatter</code> ⇒ no <code>closed</code>', 'a closed scatter'),
 ('P6','<code>closed</code> present ⇒ boolean', 'a string standing in for a truth value'),
 ('P7','<code>closed = true</code> ⇒ at least 3 points', 'a degenerate closed two-point path'),
 ('P8','<code>scatter</code> ⇒ ≥ 1 point · <code>curve</code>/<code>polygon</code> ⇒ ≥ 2',
  'an empty scatter, a one-point path — and it unblocks the single named point that is impossible today'),
 ('P9','<code>pointLabels</code> ⇒ strings, one per point', 'a label count that does not match the figure'),
]

LEGAL = [
 ('ok','<code>scatter</code>','—','≥ 1','absent','optional',''),
 ('ok','<code>curve</code>','—','≥ 2','absent / <code>false</code>','optional',''),
 ('ok','<code>curve</code>','—','≥ 3','<code>true</code>','optional',''),
 ('ok','<code>curve</code>','string','—','absent','absent',''),
 ('ok','<code>polygon</code>','—','≥ 2','absent / <code>false</code>','optional',''),
 ('ok','<code>polygon</code>','—','≥ 3','<code>true</code>','optional',''),
 ('no','<code>scatter</code>','—','≥ 1','<b>true or false</b>','','P5 — a scatter has no closure'),
 ('no','<code>scatter</code> · <code>polygon</code>','<b>string</b>','','','','P3 — an expression is a curve'),
 ('no','<code>curve</code>','string','','<b>any</b>','','P4 — no endpoints to close'),
 ('no','any','—','<b>2</b>','<b>true</b>','','P7 — degenerate'),
 ('no','any','—','≥ 1','','<b>length ≠ points</b>','P9 — labels do not match'),
 ('no','<b>absent</b>','','','','','P2 — the defect being fixed'),
]

CSS = r"""
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;800&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500;700&display=swap">
<style>
:root{
  --page:#f1f0f4; --surface:#ffffff; --rule:#e4e1ea;
  --ink:#191721; --ink-2:#4b4658; --ink-3:#6a6480;
  --accent:#6b3fa0; --accent-soft:rgba(107,63,160,.09); --accent-rule:rgba(107,63,160,.26);
  --ok:#1c6b45; --ok-soft:rgba(28,107,69,.09);
  --no:#a3302b; --no-soft:rgba(163,48,43,.08);
  --shadow:0 1px 2px rgba(25,23,33,.05), 0 10px 26px -14px rgba(25,23,33,.24);
  --plot-1:#6b3fa0; --grid:#dcd8e4; --grid-major:#9c8fb4; --axis:#6a6480;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --page:#0e0c17; --surface:#151320; --rule:#2b2740;
    --ink:#efecf6; --ink-2:#b8b1c9; --ink-3:#948caa;
    --accent:#b491e8; --accent-soft:rgba(180,145,232,.13); --accent-rule:rgba(180,145,232,.3);
    --ok:#5fc494; --ok-soft:rgba(95,196,148,.12);
    --no:#f0857f; --no-soft:rgba(240,133,127,.11);
    --shadow:0 1px 2px rgba(0,0,0,.55), 0 10px 28px -14px rgba(0,0,0,.85);
    --plot-1:#b491e8; --grid:#2e2a45; --grid-major:#5d5480; --axis:#8d85a6;
  }
}
:root[data-theme="dark"]{
  --page:#0e0c17; --surface:#151320; --rule:#2b2740;
  --ink:#efecf6; --ink-2:#b8b1c9; --ink-3:#948caa;
  --accent:#b491e8; --accent-soft:rgba(180,145,232,.13); --accent-rule:rgba(180,145,232,.3);
  --ok:#5fc494; --ok-soft:rgba(95,196,148,.12);
  --no:#f0857f; --no-soft:rgba(240,133,127,.11);
  --shadow:0 1px 2px rgba(0,0,0,.55), 0 10px 28px -14px rgba(0,0,0,.85);
  --plot-1:#b491e8; --grid:#2e2a45; --grid-major:#5d5480; --axis:#8d85a6;
}
*{box-sizing:border-box}
body{margin:0;background-color:var(--page);color:var(--ink);
     font-family:'DM Sans',system-ui,sans-serif;font-size:16.5px;line-height:1.66;
     -webkit-font-smoothing:antialiased}
.wrap{max-width:900px;margin:0 auto;padding:0 26px 130px}

.mast{padding:80px 0 34px}
.status{display:inline-flex;align-items:center;gap:9px;font-family:'JetBrains Mono',monospace;
        font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--accent);
        background:var(--accent-soft);border:1px solid var(--accent-rule);
        padding:5px 12px;border-radius:2px;margin-bottom:22px}
h1{font-family:'Manrope',sans-serif;font-weight:800;font-size:clamp(33px,5vw,50px);line-height:1.05;
   letter-spacing:-.028em;margin:0 0 20px;text-wrap:balance}
.lede{font-size:19px;color:var(--ink-2);max-width:62ch;margin:0 0 15px}
.pull{border-left:2px solid var(--accent);padding:2px 0 2px 20px;margin:30px 0 0;
      font-size:17.5px;color:var(--ink-2);max-width:60ch}

/* clause numbering is structural: the matrix below cites P1–P9 by number */
.clause{display:grid;grid-template-columns:64px 1fr;gap:0 22px;
        border-top:1px solid var(--rule);padding:44px 0 8px;margin:0}
.cn{font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:700;color:var(--accent);
    letter-spacing:.06em;padding-top:7px}
.body h2{font-family:'Manrope',sans-serif;font-weight:800;font-size:25px;letter-spacing:-.018em;
         margin:0 0 14px;color:var(--ink);text-wrap:balance}
.body p{margin:0 0 15px;max-width:64ch}
.body p:last-child{margin-bottom:0}
.body strong{font-weight:500;color:var(--ink)}
.body em{font-style:italic}
@media (max-width:680px){.clause{grid-template-columns:1fr;gap:0}.cn{padding:0 0 8px}}

code{font-family:'JetBrains Mono',monospace;font-size:.85em;background:var(--accent-soft);
     color:var(--accent);padding:2px 6px;border-radius:2px;white-space:nowrap}
b code{font-weight:700}

.card{background:var(--surface);border:1px solid var(--rule);border-radius:3px;
      box-shadow:var(--shadow);margin:22px 0}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14.5px;min-width:520px}
th{text-align:left;font-family:'JetBrains Mono',monospace;font-weight:500;font-size:11px;
   letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);
   padding:14px 18px;border-bottom:1px solid var(--rule);white-space:nowrap}
td{padding:12px 18px;border-bottom:1px solid var(--rule);color:var(--ink-2);vertical-align:top}
tr:last-child td{border-bottom:none}
td.k{color:var(--ink);font-weight:500;white-space:nowrap}
td.mark{width:34px;text-align:center;font-size:15px}
tr.no td{background:var(--no-soft)}
tr.no td.why{color:var(--no)}
tr.ok td.mark{color:var(--ok)}
tr.no td.mark{color:var(--no)}
.pnum{font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent);font-size:12.5px}

.split{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:24px 0}
@media (max-width:720px){.split{grid-template-columns:1fr}}
.demo{background:var(--surface);border:1px solid var(--rule);border-radius:3px;
      box-shadow:var(--shadow);overflow:hidden}
.demo-h{padding:13px 18px;border-bottom:1px solid var(--rule);font-family:'JetBrains Mono',monospace;
        font-size:12px;color:var(--ink);letter-spacing:.04em}
.demo-h em{color:var(--ink-3);font-style:normal;font-size:11.5px}
.demo-f{padding:14px 10px;display:flex;justify-content:center;overflow-x:auto}
.demo-c{padding:0 18px 16px;font-size:13.5px;color:var(--ink-2)}

.sx{display:block;font-family:'JetBrains Mono',monospace}
.sx-grid line{stroke:var(--grid);stroke-width:1}
.sx-grid line.sx-major{stroke:var(--grid-major);stroke-width:1}
.sx-axis line{stroke:var(--axis);stroke-width:1.6;stroke-linecap:round}
.sx-arrow{fill:var(--axis)}
.sx-tick text{fill:var(--ink-3);font-size:10.5px;font-variant-numeric:tabular-nums;
              paint-order:stroke;stroke:var(--surface);stroke-width:2.5px;stroke-linejoin:round}
.sx-axis-title,.sx-axis-tip{fill:var(--ink-3);font-family:'DM Sans',sans-serif;font-size:12px}
.sx-s1,.sx-s2,.sx-s3{color:var(--plot-1)}
.sx-curve{fill:none;stroke:currentColor;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}
.sx-point{fill:currentColor;stroke:var(--surface);stroke-width:2}

.ask{background:var(--accent-soft);border:1px solid var(--accent-rule);border-radius:3px;
     padding:26px 30px;margin-top:26px}
.ask h3{font-family:'Manrope',sans-serif;font-weight:800;font-size:19px;margin:0 0 12px;color:var(--ink)}
.ask p{margin:0 0 13px;color:var(--ink-2)}
.ask p:last-child{margin:0}
.seq{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--ink-2);
     background:var(--surface);border:1px solid var(--rule);border-radius:3px;
     padding:16px 20px;margin-top:16px;overflow-x:auto;white-space:pre;line-height:1.9}
.seq b{color:var(--accent);font-weight:700}
:focus-visible{outline:2.5px solid var(--accent);outline-offset:3px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
"""

inv_rows = ''.join(
  f'<tr><td class="k"><span class="pnum">{n}</span></td><td>{rule}</td><td>{rej}</td></tr>'
  for n, rule, rej in INVARIANTS)
legal_rows = ''.join(
  f'<tr class="{cls}"><td class="mark">{"✓" if cls=="ok" else "✕"}</td><td class="k">{fig}</td>'
  f'<td>{expr or "—"}</td><td>{pts or "—"}</td><td>{cl or "—"}</td><td>{lb or "—"}</td>'
  f'<td class="why">{why}</td></tr>'
  for cls, fig, expr, pts, cl, lb, why in LEGAL)

def clause(n, title, body):
    return f'<section class="clause"><div class="cn">{n}</div><div class="body"><h2>{title}</h2>{body}</div></section>'

HTML = f"""<title>Figure Vocabulary</title>
{CSS}
<div class="wrap">
  <header class="mast">
    <span class="status">Under review · nothing written · nothing applied</span>
    <h1>What a figure is allowed to say</h1>
    <p class="lede">The first migration here is not a technical change. It becomes the language
      every figure on the platform is described in — for EST and ACT as much as for the DSAT
      items that happen to exist today.</p>
    <p class="pull">Revision 1 proposed four additions. This review changes two of them, and
      found two limits in the <em>existing</em> validator that block real EST and ACT figures.</p>
  </header>

  {clause('§0', 'The line between now and later', '''
    <p>The change is cheap only because every Spine table is empty — forms, sections, questions,
    stimuli and published forms all measured at zero. But <strong>cheap now is not a reason to
    freeze everything now.</strong></p>
    <p>The M4 migration already set the test when it deferred <code>accepted_answers</code>: defer
    what can be added later without a back-fill. Applied here that draws one clean line —</p>
    <div class="card scroll"><table>
      <thead><tr><th></th><th>Goes in the first migration</th></tr></thead>
      <tbody>
        <tr><td class="k">Required keys</td><td>Yes. A required key cannot be added later without a
          back-fill, and a published form freezes the old shape permanently.</td></tr>
        <tr><td class="k">Optional, with a figure to exercise it today</td><td>Yes. The validation can
          actually be tested against something real.</td></tr>
        <tr><td class="k">Optional, no consumer yet</td><td>No. Adding one later is a function
          replacement, and absent correctly means "not that kind of figure".</td></tr>
      </tbody></table></div>
    <p>So the migration freezes as little as it can, and everything deferred is listed with its
    reason — a recorded decision rather than an oversight.</p>''')}

  {clause('§1', 'frame — three values, not two', f'''
    <p><strong>Changed.</strong> Revision 1 had <code>plane</code> and <code>data</code>. Stressed
    against EST and ACT rather than the DSAT set, that collapses two different things.</p>
    <div class="card scroll"><table>
      <thead><tr><th>value</th><th>axes</th><th>scale</th></tr></thead>
      <tbody>
        <tr><td class="k"><code>plane</code></td><td>both pure number, and <strong>distance is
          meaningful</strong></td><td><strong>must be equal on both axes</strong></td></tr>
        <tr><td class="k"><code>graph</code></td><td>both pure number, distance not compared</td>
          <td>free</td></tr>
        <tr><td class="k"><code>data</code></td><td>axes measure <strong>different quantities</strong></td>
          <td>free</td></tr>
      </tbody></table></div>
    <p>The split is not cosmetic. A circle, a right angle or a distance is only readable when one
    unit of <em>x</em> is one unit of <em>y</em> — that is what <code>plane</code> guarantees. A
    function graph asks for none of it and is destroyed by it:</p>
    <div class="split">
      <div class="demo"><div class="demo-h">frame: plane <em>— equal scales enforced</em></div>
        <div class="demo-f" id="d-plane"></div>
        <div class="demo-c">The same function. Equal scaling widens the visible window to about
          fifty units of <em>x</em> to fit forty of <em>y</em>, and the curve becomes a smear.</div></div>
      <div class="demo"><div class="demo-h">frame: graph <em>— scales free</em></div>
        <div class="demo-f" id="d-graph"></div>
        <div class="demo-c">Read by value, not by distance. Every turning point and intercept is
          recoverable.</div></div>
    </div>
    <p>Revision 1 would have forced every function graph into <code>plane</code>. It worked on the
    DSAT set only because those ranges happened to be similar — the accident this review exists
    to catch.</p>''')}

  {clause('§2', 'figure — a closed vocabulary of three', '''
    <p>The vocabulary names <strong>how the points connect</strong>, not what shape they make.
    Connection has exactly three states, so the list can be closed rather than merely current:</p>
    <div class="card scroll"><table>
      <thead><tr><th>value</th><th>the points are</th><th>joined</th></tr></thead>
      <tbody>
        <tr><td class="k"><code>scatter</code></td><td>individual marks</td><td>never</td></tr>
        <tr><td class="k"><code>curve</code></td><td>samples of a continuous curve</td><td>smoothly</td></tr>
        <tr><td class="k"><code>polygon</code></td><td>vertices</td><td>with straight segments</td></tr>
      </tbody></table></div>
    <p>Every figure the three exams can pose is one of them — circle, ellipse, arc and any conic
    are a <code>curve</code>; triangle, quadrilateral, segment and path are a <code>polygon</code>;
    a scatter, a plotted point and a set of named points are <code>scatter</code>.</p>
    <p><strong>This is the reason shape names do not belong in the vocabulary.</strong>
    <code>circle</code>, <code>triangle</code>, <code>parabola</code> is an open list — the next
    exam brings a sector, an annulus, an arc — and an open list inside a frozen spec is a
    vocabulary that is wrong the first time it meets a figure nobody anticipated. It also
    duplicates what the points already say, and duplication is where contradiction comes from:
    <code>figure: circle</code> with four points, or with <code>closed: false</code>, is
    representable nonsense. Naming the connection keeps the shape where it already is.</p>''')}

  {clause('§3', 'closed — a sibling key, with the contradictions rejected', '''
    <p>The question raised in review: beside <code>figure</code>, or inside it?</p>
    <p><strong>Folding it in was considered and rejected.</strong> A vocabulary of
    <code>scatter</code> · <code>curve</code> · <code>closed_curve</code> · <code>polygon</code> ·
    <code>closed_polygon</code> does make the illegal state unrepresentable rather than merely
    rejected, which is the stronger guarantee. It stops scaling the moment a second orthogonal
    property arrives: adding extent (§5) would multiply the list to fifteen values, and each
    further property multiplies it again. That is how a vocabulary becomes unusable.</p>
    <p><strong>Kept as a sibling, with the contradictions rejected by the validator instead</strong>
    — so the model still cannot <em>store</em> a contradictory figure, which is the guarantee that
    was actually asked for. <code>closed</code> is forbidden on a <code>scatter</code> (absent, not
    merely false — a scatter has no closure to assert either way), forbidden alongside
    <code>expr</code>, and requires at least three points when true.</p>''')}

  {clause('§4', 'Two limits in the current validator', '''
    <p>Neither is one of the four additions. Both are existing rules that block real EST and ACT
    figures, and both are cheapest to fix in the same migration.</p>
    <p><strong>A single point cannot exist.</strong> <code>points</code> must have length ≥ 2
    today, so "point <em>P</em> is at (3, 4)" — an ordinary coordinate-geometry item — cannot be
    represented at all. The minimum should depend on the figure: a path needs two, a
    <code>scatter</code> needs one.</p>
    <p><strong>A dashed line is sometimes semantic.</strong> Revision 1 filed <code>dashed</code>
    under <code>display</code>. As decoration that is right. As the <em>boundary of a region</em>
    it carries strict-versus-inclusive — exactly the distinction M4 already ruled semantic for
    number-line endpoints. No region item exists yet, so it is deferred with the rest — but
    recorded, so the eventual region work does not quietly put meaning in a hint.</p>''')}

  {clause('§5', 'Deliberately deferred', '''
    <p>Each is a real figure property EST or ACT can pose. Each is optional, so adding it later is
    a function replacement with no back-fill — and absent correctly means "not that kind of
    figure". None has a consumer today, so its validation could not be exercised against a real
    figure.</p>
    <div class="card scroll"><table>
      <thead><tr><th>deferred</th><th>would express</th><th>why not now</th></tr></thead>
      <tbody>
        <tr><td class="k"><code>extends</code></td><td>segment vs ray vs line — whether the path
          continues past the visible window</td><td>no item distinguishes them yet</td></tr>
        <tr><td class="k">region fill</td><td>"the shaded region represents…", solid vs dashed
          boundary for ≤ against &lt;</td><td>guessing the shape now freezes an unexercised
          contract</td></tr>
        <tr><td class="k">box plot</td><td>five-number summaries drawn as a figure</td>
          <td>a new <code>kind</code>, not a <code>plot</code> figure — out of scope</td></tr>
      </tbody></table></div>''')}

  {clause('§6', 'The invariants', f'''
    <p>Every rule the validator would enforce, and what each one rejects. A rule that cannot
    reject anything is not a rule.</p>
    <div class="card scroll"><table>
      <thead><tr><th></th><th>invariant</th><th>rejects</th></tr></thead>
      <tbody>{inv_rows}</tbody></table></div>
    <p>And the combinations, exhaustively — the reason for numbering the invariants is that every
    refusal below names the one that catches it:</p>
    <div class="card scroll"><table>
      <thead><tr><th></th><th>figure</th><th>expr</th><th>points</th><th>closed</th>
        <th>pointLabels</th><th>refused by</th></tr></thead>
      <tbody>{legal_rows}</tbody></table></div>''')}

  {clause('§7', 'What is being asked for', '''
    <div class="ask">
      <h3>A decision on the vocabulary, not a migration</h3>
      <p>The three <code>frame</code> values, the three <code>figure</code> values, the placement
      of <code>closed</code>, and the two existing-validator fixes in §4.</p>
      <p>Only after that is a migration written — carrying the §6 invariants, its rollback, and a
      behavioural probe inside a subtransaction that always rolls back, the shape M1, M3, B1, B5
      and M4 all used — and presented for a second, separate approval before anything is applied.</p>
      <div class="seq">vocabulary review   <b>← you are here</b>
  ↓
migration proposal
  ↓
separate approval
  ↓
apply  →  DSAT insert  →  renderer wiring</div>
    </div>''')}
</div>

<script>
{RENDERER}
const {{drawPlot}} = globalThis.SiExamStimulus;
const CUBIC = {json.dumps(CUBIC)};
const spec = {{ xRange: [0, 5], yRange: [-25, 15], xLabel: 'x', yLabel: 'y',
                curves: [{{ points: CUBIC }}] }};
document.getElementById('d-plane').appendChild(
  drawPlot(spec, {{ aspect: 'plane', figures: [{{ mode: 'curve' }}], width: 400, height: 330 }}));
document.getElementById('d-graph').appendChild(
  drawPlot(spec, {{ aspect: 'data',  figures: [{{ mode: 'curve' }}], width: 400, height: 330 }}));
</script>
"""
io.open(os.path.join(REPO,'figure-vocabulary.html'),'w',encoding='utf-8').write(HTML)
print('written  figure-vocabulary.html  %d bytes' % len(HTML))
