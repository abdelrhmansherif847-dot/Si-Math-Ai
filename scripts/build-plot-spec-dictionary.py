"""Builds the Plot Spec Dictionary — Math Figure Language v1, freeze candidate.

Everything on the page is settled. Nothing is proposed, nothing is open: each
property is stated with its permitted values, each refusal is numbered, each
deferral is marked DEFERRED with its reason, and what cannot be represented at
all is named. If this page reads clean, it is the language.
"""
import io, os, json
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NEW, SAME, CHANGED = 'new', 'unchanged', 'changed'

ENTRIES = [
 dict(name='frame', status=NEW, req='required', type='string',
      values=['<code>plane</code>', '<code>graph</code>', '<code>data</code>'],
      means='''What kind of space the figure lives in — and specifically, whether
              <b>distance is meaningful</b>.
              <ul>
                <li><code>plane</code> — coordinate geometry. One unit of <i>x</i> is one unit of
                    <i>y</i>. A circle is round, a right angle is square, a slope reads true.</li>
                <li><code>graph</code> — a coordinate plane read by <i>value</i>, not distance.
                    Function graphs. The two axes need not share a scale.</li>
                <li><code>data</code> — the axes measure different quantities. Squaring them would
                    be meaningless.</li>
              </ul>''',
      refuses='A plot with no <code>frame</code>, or any value outside the three. '
              'A figure that does not say whether distance is meaningful cannot be drawn '
              'correctly by any renderer.'),

 dict(name='curves[].figure', status=NEW, req='required', type='string',
      values=['<code>scatter</code>', '<code>curve</code>', '<code>polygon</code>'],
      means='''<b>How the points connect</b> — never what shape they make.
              <ul>
                <li><code>scatter</code> — individual marks. Never joined.</li>
                <li><code>curve</code> — samples of a continuous curve. Joined smoothly.</li>
                <li><code>polygon</code> — vertices. Joined with straight segments.</li>
              </ul>
              Connection has exactly three states, so this list is <b>complete</b>, not merely
              current. A circle, an ellipse and any conic are a <code>curve</code>; a triangle,
              a quadrilateral and a segment are a <code>polygon</code>. The shape itself stays
              where it already is — in the points.''',
      refuses='A curve with no <code>figure</code>. This is the defect the whole change exists '
              'to fix: without it the renderer guesses, and a scatter gets drawn as a line.'),

 dict(name='curves[].closed', status=NEW, req='optional · default false', type='boolean',
      values=['<code>true</code>', '<code>false</code>', 'absent'],
      means='''Whether the path returns to its first point. Semantic because a
              <b>smooth</b> closed curve cannot express closure any other way: repeating the
              first sample does not close it — the interpolation still has to wrap, and the
              duplicate distorts the tangent. Repeating a vertex works for a polygon and not
              for a circle.''',
      refuses='''<ul>
                <li>Present on a <code>scatter</code> — a scatter has no closure to assert,
                    in either direction. It must be <b>absent</b>, not merely false.</li>
                <li>Present alongside <code>expr</code> — an expression has no endpoints.</li>
                <li><code>true</code> with fewer than three points — a degenerate closed path.</li>
              </ul>'''),

 dict(name='curves[].pointLabels', status=NEW, req='optional', type='array of strings',
      values=['one entry per point', '<code>""</code> where a point is unnamed'],
      means='''The names the prompt refers to. When a question says "points <i>A</i> and
              <i>B</i>", a renderer that drops the names leaves it unanswerable — which makes
              this content, not decoration.''',
      refuses='A length that does not match <code>points</code>; a non-string entry; presence '
              'alongside <code>expr</code>, which has no enumerable points to name.'),

 dict(name='curves[].points', status=CHANGED, req='required unless <code>expr</code>',
      type='array of [x, y] number pairs',
      values=['<code>scatter</code> → <b>at least 1</b>', '<code>curve</code> · <code>polygon</code> → at least 2'],
      means='''Where the marks are, in figure coordinates.
              <p><b>What changed:</b> the minimum was 2 for everything, which made a single
              point impossible to represent. "Point <i>P</i> is at (3, 4)" is ordinary
              coordinate geometry and cannot be stored today. The minimum now depends on the
              figure: a path needs two, a mark needs one.</p>''',
      refuses='An empty scatter; a one-point path; a non-numeric coordinate.'),

 dict(name='curves[].expr', status=SAME, req='alternative to <code>points</code>', type='string',
      values=['an expression in <i>x</i>'],
      means='A curve given as a formula rather than samples. Implicitly continuous.',
      refuses='Any <code>figure</code> other than <code>curve</code> — an expression cannot be '
              'a scatter or a polygon. Also <code>closed</code> and <code>pointLabels</code>, '
              'neither of which an expression can carry.'),

 dict(name='xRange · yRange', status=SAME, req='required', type='[min, max] numbers',
      values=['min &lt; max'],
      means='The visible window. Semantic: it decides what a student can actually read off the '
            'graph. Under <code>frame: plane</code> the renderer may <b>widen</b> the axis with '
            'room to spare so both scales match — it never crops what was declared.',
      refuses='A reversed or equal range; a non-numeric bound.'),

 dict(name='xLabel · yLabel', status=SAME, req='optional', type='string',
      values=['plain text'],
      means='Axis names. <b>Plain text only</b> — SVG text cannot carry KaTeX, so mathematical '
            'notation belongs in the prompt, the options or a table cell, never in a figure '
            'label. Real exam figures label axes <code>x</code>, <code>y</code> or '
            '"Weeks of practice", so this costs nothing.',
      refuses='A non-string value.'),

 dict(name='display', status=SAME, req='optional', type='object',
      values=['anything the renderer may honour'],
      means='''Rendering hints the renderer <b>may</b> ignore: dash patterns used as decoration,
              mark sizes, grid density, legend placement. Validated only as "an object if
              present" — its contents are the renderer\'s business.
              <p><b>The line:</b> if ignoring it would change what the figure <i>asserts</i>,
              it does not belong here. That is why open/closed endpoints, <code>frame</code> and
              <code>figure</code> are all in the semantic core instead.</p>''',
      refuses='A non-object value. Nothing inside it is validated, by design.'),
]

OTHER_KINDS = [
 ('table', 'unchanged',
  '<code>headers</code> (strings) · <code>rows</code> (equal-width string arrays) · '
  '<code>note</code> (optional)',
  'The <code>note</code> is semantic, not a caption: without a stem-and-leaf key the data '
  'cannot be read at all.'),
 ('chart', 'unchanged',
  '<code>chartType</code> (<code>bar</code>|<code>line</code>) · <code>categories</code> · '
  '<code>series[]</code> of {name, values}',
  'One value per category per series, enforced. Axis labels optional.'),
 ('number_line', 'unchanged',
  '<code>min</code> · <code>max</code> · <code>segments[]</code> and/or <code>points[]</code>',
  'Each segment carries <code>fromClosed</code> and <code>toClosed</code>. These are the '
  'precedent for the whole change: the migration already ruled them semantic because they '
  'encode &lt; against ≤.'),
 ('figure', 'closed',
  'SVG media + content hash + a written reason',
  'The narrow exception path. A free-form spec is refused outright, and no storage bucket '
  'exists — so today no figure of this kind can be created at all.'),
]

REFUSALS = [
 ('P1', '<code>frame</code> present and one of the three', 'a figure that does not say whether distance is meaningful'),
 ('P2', 'every curve carries <code>figure</code>', 'a figure the renderer would have to guess at'),
 ('P3', '<code>expr</code> ⇒ <code>figure = curve</code>', 'an expression declared a scatter or polygon'),
 ('P4', '<code>expr</code> ⇒ no <code>closed</code>, no <code>pointLabels</code>', 'closure or names on something with no points'),
 ('P5', '<code>figure = scatter</code> ⇒ <code>closed</code> absent', 'a closed scatter'),
 ('P6', '<code>closed</code>, when present, is a boolean', 'a string standing in for a truth value'),
 ('P7', '<code>closed = true</code> ⇒ ≥ 3 points', 'a degenerate closed two-point path'),
 ('P8', '<code>scatter</code> ⇒ ≥ 1 point · path ⇒ ≥ 2', 'an empty scatter, a one-point path'),
 ('P9', '<code>pointLabels</code> length = <code>points</code> length, all strings', 'labels that do not match the figure'),
 ('P10', 'a two-point <code>polygon</code> may not end on the visible boundary',
  'a segment drawn edge to edge, which is indistinguishable from a line — see the stress test'),
]

DEFERRED = [
 ('<code>extends</code>', 'segment against ray against line — whether a path continues past the visible window',
  'No item in DSAT, EST or ACT distinguishes them yet. Optional, so adding it later is a function replacement with nothing to back-fill.'),
 ('region fill + boundary strictness', 'a shaded solution set, and solid against dashed boundary for ≤ against &lt;',
  'Genuinely semantic — a dashed boundary changes the answer. But no region item exists, so the contract could not be exercised against a real figure. Recorded so the eventual work does not put meaning in <code>display</code>.'),
 ('box plot · stem-and-leaf as a figure', 'five-number summaries drawn rather than tabulated',
  'These are a new <code>kind</code>, not a <code>plot</code> figure. A separate capability.'),
]

EXAMPLES = [
 ('A circle — <code>frame: plane</code>', '''{
  "frame": "plane",
  "xRange": [-2, 6], "yRange": [-2, 6],
  "xLabel": "x", "yLabel": "y",
  "curves": [
    { "figure": "curve", "closed": true,
      "points": [[5,2],[4.4,3.4],[3,4],[1.6,3.4],[1,2],[1.6,0.6],[3,0],[4.4,0.6]] }
  ]
}'''),
 ('Two named points — the case that is impossible today', '''{
  "frame": "plane",
  "xRange": [-3, 5], "yRange": [-2, 4],
  "curves": [
    { "figure": "scatter",
      "points": [[-2,3],[4,-1]],
      "pointLabels": ["A", "B"] }
  ]
}'''),
 ('A scatter with a supplied line of best fit — <code>frame: data</code>', '''{
  "frame": "data",
  "xRange": [0, 9], "yRange": [10, 36],
  "xLabel": "Weeks", "yLabel": "Books read",
  "curves": [
    { "figure": "scatter", "points": [[1,14],[2,19],[3,17],[4,24],[5,26]] },
    { "figure": "polygon", "points": [[0.5,13],[8.5,34.5]],
      "display": { "dashed": true } }
  ]
}'''),
]

CSS = r"""
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;800&family=DM+Sans:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500;700&display=swap">
<style>
:root{
  --page:#f1f0f4; --surface:#ffffff; --rule:#e4e1ea; --rule-soft:#efedf3;
  --ink:#191721; --ink-2:#4b4658; --ink-3:#6a6480;
  --accent:#6b3fa0; --accent-soft:rgba(107,63,160,.09); --accent-rule:rgba(107,63,160,.28);
  --new:#1c6b45; --new-soft:rgba(28,107,69,.10);
  --chg:#9a5a06; --chg-soft:rgba(154,90,6,.10);
  --no:#a3302b; --no-soft:rgba(163,48,43,.07);
  --shadow:0 1px 2px rgba(25,23,33,.05), 0 10px 26px -14px rgba(25,23,33,.22);
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --page:#0e0c17; --surface:#151320; --rule:#2b2740; --rule-soft:#221f35;
  --ink:#efecf6; --ink-2:#b8b1c9; --ink-3:#948caa;
  --accent:#b491e8; --accent-soft:rgba(180,145,232,.13); --accent-rule:rgba(180,145,232,.32);
  --new:#5fc494; --new-soft:rgba(95,196,148,.13);
  --chg:#dfa44e; --chg-soft:rgba(223,164,78,.13);
  --no:#f0857f; --no-soft:rgba(240,133,127,.10);
  --shadow:0 1px 2px rgba(0,0,0,.55), 0 10px 28px -14px rgba(0,0,0,.85);
}}
:root[data-theme="dark"]{
  --page:#0e0c17; --surface:#151320; --rule:#2b2740; --rule-soft:#221f35;
  --ink:#efecf6; --ink-2:#b8b1c9; --ink-3:#948caa;
  --accent:#b491e8; --accent-soft:rgba(180,145,232,.13); --accent-rule:rgba(180,145,232,.32);
  --new:#5fc494; --new-soft:rgba(95,196,148,.13);
  --chg:#dfa44e; --chg-soft:rgba(223,164,78,.13);
  --no:#f0857f; --no-soft:rgba(240,133,127,.10);
  --shadow:0 1px 2px rgba(0,0,0,.55), 0 10px 28px -14px rgba(0,0,0,.85);
}
*{box-sizing:border-box}
body{margin:0;background-color:var(--page);color:var(--ink);
     font-family:'DM Sans',system-ui,sans-serif;font-size:16.5px;line-height:1.65;
     -webkit-font-smoothing:antialiased}
.wrap{max-width:880px;margin:0 auto;padding:0 26px 130px}
.mast{padding:80px 0 38px;border-bottom:1px solid var(--rule);margin-bottom:14px}
.kicker{font-family:'JetBrains Mono',monospace;font-size:11.5px;letter-spacing:.14em;
        text-transform:uppercase;color:var(--ink-3);margin:0 0 18px}
h1{font-family:'Manrope',sans-serif;font-weight:800;font-size:clamp(32px,4.8vw,48px);
   line-height:1.06;letter-spacing:-.028em;margin:0 0 20px;text-wrap:balance}
.lede{font-size:19px;color:var(--ink-2);max-width:62ch;margin:0 0 14px}
h2{font-family:'Manrope',sans-serif;font-weight:800;font-size:15px;letter-spacing:.09em;
   text-transform:uppercase;color:var(--ink-3);margin:56px 0 6px}
.h2sub{font-size:16.5px;color:var(--ink-2);margin:0 0 22px;max-width:62ch}

/* ── dictionary entry ───────────────────────────────────────────── */
.entry{background:var(--surface);border:1px solid var(--rule);border-left:3px solid var(--accent);
       border-radius:3px;box-shadow:var(--shadow);margin:0 0 16px;overflow:hidden}
.entry-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
         padding:16px 22px;border-bottom:1px solid var(--rule-soft)}
.term{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:16px;color:var(--ink)}
.pill{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.08em;
      text-transform:uppercase;padding:3px 8px;border-radius:2px;white-space:nowrap}
.p-new{background:var(--new-soft);color:var(--new)}
.p-chg{background:var(--chg-soft);color:var(--chg)}
.p-same{background:var(--accent-soft);color:var(--ink-3)}
.p-req{background:var(--accent-soft);color:var(--accent)}
.entry-b{padding:18px 22px 20px}
dl{margin:0;display:grid;grid-template-columns:88px 1fr;gap:14px 20px}
@media (max-width:620px){dl{grid-template-columns:1fr;gap:4px 0}dt{margin-top:12px}}
dt{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.09em;
   text-transform:uppercase;color:var(--ink-3);padding-top:4px}
dd{margin:0;color:var(--ink-2)}
dd p{margin:0 0 10px}dd p:last-child{margin:0}
dd ul{margin:6px 0 0;padding-left:20px}dd li{margin-bottom:6px}
dd b{color:var(--ink);font-weight:500}
.vals{display:flex;flex-wrap:wrap;gap:7px}
.refuse{background:var(--no-soft);border-left:2px solid var(--no);padding:11px 15px;
        border-radius:2px;color:var(--ink-2);font-size:15px}
.refuse ul{margin:0;padding-left:19px}
.refuse li:last-child{margin-bottom:0}

code{font-family:'JetBrains Mono',monospace;font-size:.85em;background:var(--accent-soft);
     color:var(--accent);padding:2px 6px;border-radius:2px;white-space:nowrap}
i{font-style:italic}

.card{background:var(--surface);border:1px solid var(--rule);border-radius:3px;
      box-shadow:var(--shadow);overflow-x:auto;margin:0 0 16px}
table{border-collapse:collapse;width:100%;font-size:14.5px;min-width:480px}
th{text-align:left;font-family:'JetBrains Mono',monospace;font-weight:500;font-size:10.5px;
   letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);
   padding:13px 18px;border-bottom:1px solid var(--rule);white-space:nowrap}
td{padding:12px 18px;border-bottom:1px solid var(--rule-soft);color:var(--ink-2);vertical-align:top}
tr:last-child td{border-bottom:none}
td.k{color:var(--ink);font-weight:500;white-space:nowrap}
.pn{font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent);font-size:12.5px}

pre{margin:0;padding:18px 22px;overflow-x:auto;font-family:'JetBrains Mono',monospace;
    font-size:13px;line-height:1.62;color:var(--ink-2);background:var(--surface)}
.ex-h{padding:13px 22px;border-bottom:1px solid var(--rule-soft);font-size:14px;color:var(--ink)}
.ask{background:var(--accent-soft);border:1px solid var(--accent-rule);border-radius:3px;
     padding:26px 30px;margin-top:34px}
.ask h3{font-family:'Manrope',sans-serif;font-weight:800;font-size:19px;margin:0 0 12px;color:var(--ink)}
.ask p{margin:0 0 12px;color:var(--ink-2)}.ask p:last-child{margin:0}
:focus-visible{outline:2.5px solid var(--accent);outline-offset:3px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
"""

def entry(e):
    pill = {'new':'<span class="pill p-new">new</span>',
            'changed':'<span class="pill p-chg">rule changed</span>',
            'unchanged':'<span class="pill p-same">unchanged</span>'}[e['status']]
    vals = '<div class="vals">' + ' '.join(e['values']) + '</div>'
    return f"""<article class="entry">
      <div class="entry-h"><span class="term">{e['name']}</span>{pill}
        <span class="pill p-req">{e['req']}</span>
        <span class="pill p-same">{e['type']}</span></div>
      <div class="entry-b"><dl>
        <dt>values</dt><dd>{vals}</dd>
        <dt>means</dt><dd>{e['means']}</dd>
        <dt>refuses</dt><dd><div class="refuse">{e['refuses']}</div></dd>
      </dl></div></article>"""

entries = ''.join(entry(e) for e in ENTRIES)
other = ''.join(f'<tr><td class="k"><code>{k}</code></td><td>{sh}</td><td>{note}</td></tr>'
                for k, st, sh, note in OTHER_KINDS)
refusals = ''.join(f'<tr><td class="k"><span class="pn">{n}</span></td><td>{r}</td><td>{w}</td></tr>'
                   for n, r, w in REFUSALS)
deferred = ''.join(f'<tr><td class="k">{n}</td><td>{w}</td><td>{y}</td></tr>'
                   for n, w, y in DEFERRED)
examples = ''.join(f'<div class="card"><div class="ex-h">{t}</div><pre>{c}</pre></div>'
                   for t, c in EXAMPLES)

HTML = f"""<title>Math Figure Language</title>
{CSS}
<div class="wrap">
  <header class="mast">
    <p class="kicker">Si Math AI · v1 · freeze candidate</p>
    <h1>Everything a figure is allowed to say</h1>
    <p class="lede">The complete language, on one page. Every property with its permitted values
      and its mathematical meaning, every refusal numbered, every deferral marked, and everything
      that cannot be represented at all named as such.</p>
    <p class="lede"><b>Nothing here is open.</b> This is what v1 is; the migration carries exactly
      this and nothing more. It will describe every EST and ACT figure, not only the DSAT ones
      that exist today.</p>
  </header>

  <h2>The four stimulus kinds</h2>
  <p class="h2sub">Only <code>plot</code> changes. The other three are listed so the language is
    complete on one page.</p>
  <div class="card"><table>
    <thead><tr><th>kind</th><th>shape</th><th>note</th></tr></thead>
    <tbody>
      <tr><td class="k"><code>plot</code></td><td>the subject of this page</td>
        <td>Gains <code>frame</code>, and each curve gains <code>figure</code>.</td></tr>
      {other}
    </tbody></table></div>

  <h2>The plot vocabulary</h2>
  <p class="h2sub">Nine entries. Four are new or changed; five are listed unchanged so nothing
    about the language has to be remembered from elsewhere.</p>
  {entries}

  <h2>Everything the validator refuses</h2>
  <p class="h2sub">Nine rules. Each one rejects something a person could otherwise write, which is
    the only reason a rule earns its place.</p>
  <div class="card"><table>
    <thead><tr><th></th><th>rule</th><th>refuses</th></tr></thead>
    <tbody>{refusals}</tbody></table></div>

  <h2>Worked examples</h2>
  <p class="h2sub">The same language, written out.</p>
  {examples}

  <h2>Deliberately deferred</h2>
  <p class="h2sub">Real figure properties EST or ACT can pose. Each is optional, so adding it later
    is a function replacement with nothing to back-fill — and absent correctly means "not that kind
    of figure".</p>
  <div class="card"><table>
    <thead><tr><th>deferred</th><th>would express</th><th>why it waits</th></tr></thead>
    <tbody>{deferred}</tbody></table></div>

  <h2>Stressed against figures we do not have</h2>
  <p class="h2sub">The vocabulary was written from the figures that exist. This is it tested
    against nine that do not — every case landing in exactly one bucket, with no case left
    representable-but-ambiguous except one, which is named.</p>
  <div class="card"><table>
    <thead><tr><th>case</th><th>verdict</th></tr></thead>
    <tbody>
      <tr><td class="k">a single named point</td><td>✅ representable — <b>only because of the P8 change</b></td></tr>
      <tr><td class="k">a line both ways · a ray · a segment</td><td>⏸ deferred — and <b>no longer fakeable</b>, because P10 refuses a segment drawn edge to edge</td></tr>
      <tr><td class="k">open/closed boundary, number line</td><td>✅ representable today</td></tr>
      <tr><td class="k">open/closed boundary of a region</td><td>⏸ deferred with regions; strictness will never be carried by <code>display</code></td></tr>
      <tr><td class="k">region / shading</td><td>⛔ cannot be expressed at all — so it cannot be got wrong</td></tr>
      <tr><td class="k">several curves in one figure</td><td>✅ representable — the renderer cycles three series colours, so a fourth needs a rule</td></tr>
      <tr><td class="k">a circle with a labelled centre</td><td>✅ representable — needs single-point <b>and</b> multi-curve together</td></tr>
      <tr><td class="k">asymptote / discontinuity</td><td>⚠️ <b>the one genuine hole.</b> Correct as one curve per branch; also storable as a single curve that draws a false vertical through the asymptote. Undecidable at the CHECK level — mitigated by an authoring preflight, not by the schema</td></tr>
    </tbody></table></div>

  <h2>Binding on content, not on code</h2>
  <p class="h2sub">Four rules the schema cannot enforce and an author must. They exist because the
    alternative is letting the renderer decide something only the author knows.</p>
  <div class="card"><table>
    <thead><tr><th>rule</th><th>why</th></tr></thead>
    <tbody>
      <tr><td class="k">A curve entry is <b>one continuous branch</b></td>
        <td>A discontinuity is never encoded by hoping the renderer infers a gap from point
          positions. Split the branches into separate entries — or, if the figure needs something
          this language cannot state, <b>stop authoring it</b> until the language is extended.
          It is not approximated.</td></tr>
      <tr><td class="k">Sample a curve densely</td>
        <td>Polyline, uniform and centripetal interpolation disagree by <b>84&nbsp;px at four
          samples and 2&nbsp;px at twenty</b>. Below about ten, the renderer is choosing the shape
          and a student reads it instead of the author's function.</td></tr>
      <tr><td class="k">Figure labels carry no notation</td>
        <td>SVG text cannot render KaTeX. Labels are <code>x</code>, <code>y</code>,
          "Time (minutes)". Notation lives in the prompt, the options or a table cell.</td></tr>
      <tr><td class="k">At most three curves in a figure</td>
        <td>The renderer cycles three series colours. A fourth needs a colour rule first.</td></tr>
    </tbody></table></div>

  <div class="ask">
    <h3>Math Figure Language v1</h3>
    <p>Three <code>frame</code> values. Three <code>figure</code> values. <code>closed</code> as an
      independent property whose contradictions are refused rather than merely discouraged.
      <code>pointLabels</code> in the semantic core. A minimum point count that depends on the
      figure, so a single named point becomes possible. Ten numbered refusals.</p>
    <p>One hole is known and accepted: a discontinuity encoded as a single curve stores cleanly and
      draws a false vertical. It is undecidable at the CHECK level, so it is held by the authoring
      rule above rather than by the schema — <b>recorded, not hidden</b>.</p>
    <p>Everything deferred is deferred on the same test: it is optional, so adding it later is a
      function replacement with nothing to back-fill, and its absence correctly means
      "not that kind of figure".</p>
  </div>
</div>
</div>
"""
io.open(os.path.join(REPO, 'plot-spec-dictionary.html'), 'w', encoding='utf-8').write(HTML)
print('written  plot-spec-dictionary.html  %d bytes' % len(HTML))
