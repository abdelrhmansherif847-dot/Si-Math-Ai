"""Builds the Math Stimulus Plates specimen sheet from the REAL renderer.

The plates are not mockups: every figure on the page is drawn by
exam-stimulus.js, so what is approved on the specimen sheet is literally what a
student will see. The mathematics is neutral by design — no exam item, option
or answer is in this file or its output, which is what makes the sheet safe to
publish and share while the exam content stays out of a public repository.

  python3 scripts/build-stimulus-plates.py   ->  stimulus-plates.html
"""
import io, json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import importlib.util
_spec = importlib.util.spec_from_file_location(
    'stimulus_specimens', os.path.join(HERE, 'stimulus-specimens.py'))
_mod = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_mod)
SPECIMENS = _mod.SPECIMENS

RENDERER = io.open(os.path.join(REPO, 'exam-stimulus.js'), encoding='utf-8').read()
# the module ships as an IIFE on globalThis (the house shape for root JS);
# the page reaches its API through that, exactly as a browser would.

CSS = r"""
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=DM+Sans:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* ============================================================ TOKENS
   Light is complete on bare :root. Dark redefines ONLY tokens, twice, so an
   explicit choice wins in both directions and the un-stamped "system" state
   still resolves. No component ever declares a colour outside this block. */
:root{
  --paper:#f3f6fa;  --paper-grid:rgba(30,99,184,.062);
  --plate:#ffffff;  --plate-rule:#dde5ee;
  --plate-shadow:0 1px 2px rgba(15,27,45,.05), 0 8px 24px -10px rgba(15,27,45,.16);
  --ink:#0f1b2d;    --ink-2:#46586f;  --ink-3:#5f7288;
  --rule:#dde5ee;
  --s1:#1e63b8;     --s2:#b0530b;     --s3:#7c3aed;
  --grid-line:#ccd8e5;  --grid-major:#7897ba;
  --axis-line:#5b6f88;
  --tag-bg:rgba(30,99,184,.10); --tag-ink:#17518f;
  --flag-bg:rgba(176,83,11,.10); --flag-ink:#8c4109; --flag-rule:rgba(176,83,11,.34);
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --paper:#050a13;  --paper-grid:rgba(125,180,235,.045);
    --plate:#0c1428;  --plate-rule:#1e2b45;
    --plate-shadow:0 1px 2px rgba(0,0,0,.5), 0 8px 26px -12px rgba(0,0,0,.8);
    --ink:#eaf2fd;    --ink-2:#a8bcd9;  --ink-3:#7a90b2;
    --rule:#1e2b45;
    --s1:#3d8fd4;     --s2:#b8801d;     --s3:#8a5fd8;
    --grid-line:#253554;  --grid-major:#44629b;
    --axis-line:#6d84a4;
    --tag-bg:rgba(61,143,212,.14); --tag-ink:#8cc3ee;
    --flag-bg:rgba(184,128,29,.13); --flag-ink:#dda94a; --flag-rule:rgba(184,128,29,.38);
  }
}
:root[data-theme="dark"]{
  --paper:#050a13;  --paper-grid:rgba(125,180,235,.045);
  --plate:#0c1428;  --plate-rule:#1e2b45;
  --plate-shadow:0 1px 2px rgba(0,0,0,.5), 0 8px 26px -12px rgba(0,0,0,.8);
  --ink:#eaf2fd;    --ink-2:#a8bcd9;  --ink-3:#7a90b2;
  --rule:#1e2b45;
  --s1:#3d8fd4;     --s2:#b8801d;     --s3:#8a5fd8;
  --grid-line:#253554;  --grid-major:#44629b;
  --axis-line:#6d84a4;
  --tag-bg:rgba(61,143,212,.14); --tag-ink:#8cc3ee;
  --flag-bg:rgba(184,128,29,.13); --flag-ink:#dda94a; --flag-rule:rgba(184,128,29,.38);
}
/* the two surfaces, pinned, so they can be compared inside one page */
.pin-paper{
  --plate:#ffffff; --plate-rule:#dde5ee; --ink:#0f1b2d; --ink-2:#46586f; --ink-3:#5f7288;
  --rule:#dde5ee; --s1:#1e63b8; --s2:#b0530b; --s3:#7c3aed;
  --grid-line:#ccd8e5; --grid-major:#7897ba; --axis-line:#5b6f88;
  --tag-bg:rgba(30,99,184,.10); --tag-ink:#17518f;
}
.pin-soft{
  --plate:#f4f6f9; --plate-rule:#d7dfea; --ink:#16202e; --ink-2:#43556c; --ink-3:#596c83;
  --rule:#d7dfea; --s1:#1d5fb0; --s2:#a8500a; --s3:#7736e6;
  --grid-line:#c7d2e0; --grid-major:#7590b3; --axis-line:#586c85;
  --tag-bg:rgba(29,95,176,.10); --tag-ink:#17518f;
}
.pin-lifted{
  --plate:#1b2333; --plate-rule:#2f3b52; --ink:#e8eef8; --ink-2:#b3c4dc; --ink-3:#9db0ca;
  --rule:#2f3b52; --s1:#5aa2de; --s2:#c98d24; --s3:#9a75e0;
  --grid-line:#39465f; --grid-major:#5a6e95; --axis-line:#7e93b3;
  --tag-bg:rgba(90,162,222,.15); --tag-ink:#9fcaeb;
}
.pin-night{
  --plate:#0c1428; --plate-rule:#1e2b45; --ink:#eaf2fd; --ink-2:#a8bcd9; --ink-3:#7a90b2;
  --rule:#1e2b45; --s1:#3d8fd4; --s2:#b8801d; --s3:#8a5fd8;
  --grid-line:#253554; --grid-major:#44629b; --axis-line:#6d84a4;
  --tag-bg:rgba(61,143,212,.16); --tag-ink:#8cc3ee;
}

*{box-sizing:border-box}
body{
  margin:0; background-color:var(--paper); color:var(--ink);
  font-family:'DM Sans',system-ui,-apple-system,sans-serif; font-size:16px; line-height:1.65;
  /* the page is graph paper, at the same unit pitch the figures use */
  background-image:linear-gradient(var(--paper-grid) 1px, transparent 1px),
                   linear-gradient(90deg, var(--paper-grid) 1px, transparent 1px);
  background-size:26px 26px;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:940px;margin:0 auto;padding:0 24px 120px}

/* ============================================================ MASTHEAD */
.mast{padding:76px 0 40px;border-bottom:1px solid var(--rule);margin-bottom:52px}
.eyebrow{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;letter-spacing:.14em;
         text-transform:uppercase;color:var(--ink-3);margin:0 0 18px}
h1{font-family:'Manrope',sans-serif;font-weight:800;font-size:clamp(34px,5.4vw,54px);
   line-height:1.06;letter-spacing:-.025em;margin:0 0 20px;text-wrap:balance}
.lede{font-size:19px;line-height:1.6;color:var(--ink-2);max-width:63ch;margin:0}
.lede + .lede{margin-top:16px}

/* ============================================================ SECTIONS */
section{margin:0 0 64px}
h2{font-family:'Manrope',sans-serif;font-weight:700;font-size:15px;letter-spacing:.1em;
   text-transform:uppercase;color:var(--ink-3);margin:0 0 6px}
.sec-sub{font-size:17px;color:var(--ink-2);margin:0 0 30px;max-width:62ch}
h3{font-family:'Manrope',sans-serif;font-weight:700;font-size:21px;letter-spacing:-.01em;
   margin:0;color:var(--ink)}
p{margin:0 0 14px}

/* ============================================================ THE RULE */
.rule-card{background:var(--plate);border:1px solid var(--plate-rule);border-left:3px solid var(--s1);
           border-radius:4px;padding:26px 30px;box-shadow:var(--plate-shadow)}
.rule-card p:last-child{margin-bottom:0}
.rule-card strong{font-weight:700;color:var(--ink)}

/* ============================================================ PLATES */
.plates{display:flex;flex-direction:column;gap:26px}
.plate{background:var(--plate);border:1px solid var(--plate-rule);border-radius:4px;
       box-shadow:var(--plate-shadow);overflow:hidden}
.plate-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;
            padding:20px 26px 16px;border-bottom:1px solid var(--rule)}
.tag{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.06em;
     background:var(--tag-bg);color:var(--tag-ink);padding:3px 9px;border-radius:3px;
     white-space:nowrap}
.plate-fig{padding:26px 20px;display:flex;justify-content:center;overflow-x:auto}
.plate-why{padding:0 26px 22px;font-size:15px;color:var(--ink-2);max-width:70ch}

/* ============================================================ SVG LANGUAGE
   Geometry comes from the renderer; every appearance decision is here. */
.sx{display:block;font-family:'JetBrains Mono',ui-monospace,monospace}
.sx-grid line{stroke:var(--grid-line);stroke-width:1}
.sx-grid line.sx-major{stroke:var(--grid-major);stroke-width:1}
.sx-axis line{stroke:var(--axis-line);stroke-width:1.75;stroke-linecap:round}
.sx-axis-base{stroke:var(--axis-line);stroke-width:1.5}
.sx-arrow{fill:var(--axis-line)}
.sx-tick text{fill:var(--ink-3);font-size:11.5px;font-variant-numeric:tabular-nums;
             paint-order:stroke;stroke:var(--plate);stroke-width:2.5px;stroke-linejoin:round}
.sx-nl-tick{stroke:var(--axis-line);stroke-width:1.25}
.sx-nl-axis line{stroke-width:2.25}
.sx-axis-title{fill:var(--ink-2);font-family:'DM Sans',sans-serif;font-size:12.5px}
.sx-axis-tip{font-family:'Manrope',sans-serif;font-weight:700;font-size:14px;font-style:italic;fill:var(--ink-2)}
.sx-s1{color:var(--s1)} .sx-s2{color:var(--s2)} .sx-s3{color:var(--s3)}
.sx-curve{fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.sx-dashed{stroke-dasharray:8 6;stroke-width:2.25}
.sx-point{fill:currentColor;stroke:var(--plate);stroke-width:2}
.sx-bar{fill:currentColor;stroke:var(--plate);stroke-width:1}
.sx-label{fill:var(--ink);font-family:'Manrope',sans-serif;font-weight:800;font-size:14px;
          stroke:var(--plate);stroke-width:3.5;stroke-linejoin:round}
.sx-nl-seg{stroke:currentColor;stroke-width:6;stroke-linecap:butt;opacity:.9}
.sx-endpoint{stroke:currentColor;stroke-width:2.5}
.sx-closed{fill:currentColor}
.sx-open{fill:var(--plate)}
.sx-legend text{fill:var(--ink-2);font-family:'DM Sans',sans-serif;font-size:12.5px}
.sx-swatch{fill:currentColor}

/* ============================================================ TABLES */
.sx-table-wrap{max-width:100%;overflow-x:auto}
.sx-table{border-collapse:collapse;margin:0 auto;font-family:'DM Sans',sans-serif}
.sx-table th{font-family:'Manrope',sans-serif;font-weight:700;font-size:13.5px;color:var(--ink);
             padding:11px 22px;border-bottom:1.5px solid var(--ink-2);text-align:left;white-space:nowrap}
.sx-table td{font-size:15px;color:var(--ink);padding:10px 22px;border-bottom:1px solid var(--rule)}
.sx-table tbody tr:last-child td{border-bottom:none}
.sx-num{text-align:right;font-family:'JetBrains Mono',ui-monospace,monospace;
        font-variant-numeric:tabular-nums}
.sx-note{margin:14px 0 0;font-size:13px;color:var(--ink-3);text-align:center;
         font-family:'JetBrains Mono',ui-monospace,monospace}

/* ============================================================ SURFACES */
.cands{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media (max-width:760px){.cands{grid-template-columns:1fr}}
.cand{border:1px solid var(--plate-rule);border-radius:4px;overflow:hidden;
      background:var(--plate);box-shadow:var(--plate-shadow)}
.cand-head{padding:14px 20px;border-bottom:1px solid var(--rule);
           font-family:'Manrope',sans-serif;font-size:14px;color:var(--ink);
           display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
.cand-head b{font-weight:700}
.cand-head span{font-weight:400;font-size:12.5px;color:var(--ink-3);flex-basis:100%}
.cand .plate-fig{padding:16px 12px}
.cand-tab{border-top:1px solid var(--rule);padding-top:18px!important}
.surfaces{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media (max-width:720px){.surfaces{grid-template-columns:1fr}}
.surface{border-radius:4px;border:1px solid var(--plate-rule);overflow:hidden;
         box-shadow:var(--plate-shadow)}
.surface .plate-fig{background:var(--plate)}
.surface-name{padding:14px 20px;background:var(--plate);border-bottom:1px solid var(--rule);
              font-family:'Manrope',sans-serif;font-weight:700;font-size:14px;color:var(--ink)}
.surface-name span{font-weight:500;color:var(--ink-3);font-size:13px}

/* ============================================================ SPEC TABLE */
.spec-scroll{overflow-x:auto;background:var(--plate);border:1px solid var(--plate-rule);
             border-radius:4px;box-shadow:var(--plate-shadow)}
table.spec{border-collapse:collapse;width:100%;min-width:560px;font-size:14.5px}
table.spec th{text-align:left;font-family:'Manrope',sans-serif;font-weight:700;font-size:12px;
              letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);
              padding:14px 22px;border-bottom:1px solid var(--rule);white-space:nowrap}
table.spec td{padding:12px 22px;border-bottom:1px solid var(--rule);color:var(--ink-2);
              vertical-align:top}
table.spec tr:last-child td{border-bottom:none}
table.spec td:first-child{color:var(--ink);font-weight:500;white-space:nowrap}
code{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:.88em;
     background:var(--tag-bg);color:var(--tag-ink);padding:2px 6px;border-radius:3px}

/* ============================================================ OPEN */
.open{background:var(--flag-bg);border:1px solid var(--flag-rule);border-radius:4px;
      padding:26px 30px}
.open h3{margin-bottom:12px;color:var(--ink)}
.open p:last-child{margin-bottom:0}
.open ul{margin:0 0 14px;padding-left:22px}
.open li{margin-bottom:8px;color:var(--ink-2)}
.open .badge{display:inline-block;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;
             letter-spacing:.1em;text-transform:uppercase;color:var(--flag-ink);margin-bottom:10px}

:focus-visible{outline:2.5px solid var(--s1);outline-offset:3px;border-radius:2px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
"""

def plate(sp):
    return f"""
    <article class="plate">
      <div class="plate-head"><h3>{sp['name']}</h3><span class="tag">kind: {sp['tag']}</span></div>
      <div class="plate-fig" id="fig-{sp['id']}"></div>
      <p class="plate-why">{sp['why']}</p>
    </article>"""

GROUPS = [
  ('The coordinate plane', 'One px-per-unit on both axes, and a grid at unit pitch. On these figures the grid is not decoration — it is the measuring instrument the student counts with.',
   ['fn','lines','parab','circle','tri','pts']),
  ('Data on axes', 'Here the axes measure different quantities, so the plane is not squared. These are the only stimuli where ordinary chart rules apply.',
   ['scatter','fitline','bar','linechart']),
  ('Tables', 'A table is content, not a container. Numerals align so columns can be compared by eye, and a key that the data cannot be read without travels with it.',
   ['table','tablenote']),
  ('Number lines', 'The smallest figure and the most exacting: an open circle and a closed circle are the entire difference between < and ≤.',
   ['nl1','nl2','nl3']),
]

CANDIDATES = [
 ('pin-paper',  'Paper',            '#ffffff', 'The literal reference. Maximum emitted light.',
  '100.0%', '17.28', '4.94', '1.45', '3.03', '5.95'),
 ('pin-soft',   'Paper, softened',  '#f4f6f9', 'Same contrast, less light. The tuned light surface.',
  '92.0%',  '15.15', '4.98', '1.41', '3.03', '5.85'),
 ('pin-lifted', 'Night, lifted',    '#1b2333', 'Dark without near-black halation. The tuned dark surface.',
  '1.7%',   '13.50', '7.11', '1.66', '3.07', '5.74'),
 ('pin-night',  'Night',            '#0c1428', "The product's own card. Least emitted light.",
  '0.7%',   '16.24', '5.64', '1.50', '3.02', '5.30'),
]
cand_cards = ''.join(
  f"""<div class="cand {cls}">
        <div class="cand-head"><b>{name}</b> <code>{hexv}</code><span>{note}</span></div>
        <div class="plate-fig" id="cand-{cls}"></div>
        <div class="plate-fig cand-tab" id="candt-{cls}"></div>
      </div>"""
  for cls, name, hexv, note, *_ in CANDIDATES)
cand_rows = ''.join(
  f"<tr><td>{name} <code>{hexv}</code></td><td>{em}</td><td>{ink}</td><td>{num}</td>"
  f"<td>{mi}</td><td>{ma}</td><td>{st}</td></tr>"
  for cls, name, hexv, note, em, ink, num, mi, ma, st in CANDIDATES)

by_id = {s['id']: s for s in SPECIMENS}
sections = []
for title, sub, ids in GROUPS:
    body = ''.join(plate(by_id[i]) for i in ids)
    sections.append(f"""
  <section>
    <h2>{title}</h2>
    <p class="sec-sub">{sub}</p>
    <div class="plates">{body}</div>
  </section>""")

ANATOMY = [
 ('Grid', 'two-tier: 1 px minor at unit pitch, a major rule every fifth line at 3:1',
  'On an analytics chart the grid is decoration and fades away. Here a student counts squares to read a radius. A single-weight hairline measured 1.41–1.66:1 on every candidate surface — under the 3:1 floor for graphics a reader needs — and raising the whole grid to 3:1 makes it compete with the figure. Ruled paper solved this a long time ago.'),
 ('Axis', '1.75 px, arrowheads on both ends', 'Arrowheads say the line continues — a mathematical statement, not an ornament.'),
 ('Tick numerals', "JetBrains Mono 11.5 px, tabular", 'Numerals on an axis are measurements. Mono keeps them aligned and reads as an instrument.'),
 ('Curve', '2.5 px, round cap and join, Catmull-Rom through the samples', 'A sampled curve is a curve. Straight-joining turns a parabola into a V.'),
 ('Polygon', '2.5 px, exactly the authored vertices', 'A triangle has corners. Nothing is smoothed that was not sampled.'),
 ('Point', 'r 4.5 (named: 5.5), 2 px ring in the surface colour', 'The ring keeps a point readable where it sits on a gridline or another mark.'),
 ('Point label', 'Manrope 800 14 px, surface painted around the glyph', 'A name the prompt refers to must survive whatever is underneath it.'),
 ('Number line', '2.25 px rule, 6 px segment, endpoint r 6.5 at 2.5 px', 'Sized so the open/closed distinction is unmissable at a glance.'),
 ('Bar', '4 px radius at the data end only, square at the baseline, 2 px gap', 'A rounded baseline would lie about where zero is.'),
 ('Series colour', '<code>--s1 #1e63b8</code> · <code>--s2 #b0530b</code> · <code>--s3 #7c3aed</code>', 'Validated: passes the lightness band, chroma floor, colour-vision separation (worst adjacent pair ΔE 24.0 protan) and contrast. Each candidate surface gets its own set, validated against that surface — never flipped from another one.'),
 ('Type', "Manrope · DM Sans · JetBrains Mono", "The product's own three faces. Nothing new was introduced for figures."),
]
anatomy_rows = ''.join(
  f"<tr><td>{a}</td><td>{b}</td><td>{c}</td></tr>" for a,b,c in ANATOMY)

HTML = f"""<title>Math Stimulus Plates</title>
{CSS}
<div class="wrap">

  <header class="mast">
    <p class="eyebrow">Si Math AI · design system · draft for review</p>
    <h1>Every figure a student is asked to read</h1>
    <p class="lede">Fifteen plates covering every stimulus the Question Spine can store — the four
      native kinds, and every hard case inside them. Each one is drawn by the renderer that will
      ship, not mocked up, so what is approved here is literally what students will see.</p>
    <p class="lede">The mathematics is neutral throughout. No exam item, option or answer appears
      on this page.</p>
  </header>

  <section>
    <h2>The rule everything else follows from</h2>
    <div class="rule-card">
      <p><strong>An exam figure is read by someone being assessed.</strong> Every affordance a
      dashboard adds to be helpful — a hover read-out, a value printed on each point, a fitted
      trend line nobody asked for — answers the question for them.</p>
      <p>So this renderer is deliberately inert. No tooltips, no hover, no value labels, no
      annotation the spec did not ask for. It is the one place where the ordinary rules of data
      visualisation are not just inapplicable but actively wrong, and it is why these figures
      cannot come from a charting library.</p>
      <p>The grid is the only instrument, and it is drawn to be counted.</p>
    </div>
  </section>

  <section>
    <h2>Which surface the exam is sat on</h2>
    <p class="sec-sub">Not locked. The DSAT is a screen exam, so this is a
      screen-first assessment question — which surface a student can read
      mathematics on for a full 35-minute module — and not a choice between a
      brand identity and a paper metaphor.</p>

    <div class="rule-card" style="margin-bottom:26px">
      <p><strong>A screen emits; paper reflects.</strong> A white panel in an
      ordinary room puts out several times the light the paper on the desk beside
      it reflects. That is the fatigue driver, and contrast ratio does not measure
      it at all — pure white and a softened white can have identical contrast and
      feel completely different after half an hour.</p>
      <p><strong>Thin light strokes on near-black bloom.</strong> Halation is
      worst for exactly this content: hairline axes, 1&nbsp;px grids, small
      numerals. It affects a large minority of readers, astigmatism especially.</p>
      <p>Which is why there are four candidates below and not two. <strong>Paper
      and Night are the extremes of their families</strong> — the most and least
      light a surface can emit. The two inboard candidates are the tuned member
      of each. The exam may well want one of those rather than either pole.</p>
    </div>

    <div class="cands">{cand_cards}</div>

    <div class="spec-scroll" style="margin-top:26px">
      <table class="spec">
        <thead><tr><th>Surface</th><th>Emitted</th><th>Body ink</th>
          <th>Axis numerals</th><th>Minor rule</th><th>Major rule</th><th>Plot stroke</th></tr></thead>
        <tbody>{cand_rows}</tbody>
      </table>
    </div>
    <p class="sec-sub" style="margin-top:14px;font-size:15px">
      <strong>Emitted</strong> is the share of full white the panel puts out across
      the reading area — the fatigue proxy. Everything else is a contrast ratio
      against that surface. Text floor is 4.5:1; the floor for graphics a reader
      needs is 3:1.</p>

    <div class="open" style="margin-top:26px">
      <p class="badge">Found while measuring · fixed</p>
      <h3>The grid was decoration, on all four</h3>
      <p>A single-weight hairline grid measures <strong>1.41–1.66:1</strong> on
      every candidate — well under the 3:1 floor for graphical information a
      reader needs. On a coordinate plane the grid is not decoration: it is the
      instrument a student counts a radius with.</p>
      <p>Raising the whole grid to 3:1 makes it loud enough to compete with the
      figure drawn on it. So the ruling is now two-tier, the way graph paper has
      always been ruled — a quiet minor rule, and a <strong>major rule every
      fifth line carrying the contrast</strong>. Every figure above and below is
      drawn that way.</p>
    </div>
  </section>
{''.join(sections)}
  <section>
    <h2>The anatomy</h2>
    <p class="sec-sub">Every measured value the renderer is built from, and why it is that value
      rather than a nicer-looking one.</p>
    <div class="spec-scroll">
      <table class="spec">
        <thead><tr><th>Element</th><th>Specification</th><th>Why</th></tr></thead>
        <tbody>{anatomy_rows}</tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>What this cannot decide on its own</h2>
    <div class="open">
      <p class="badge">Blocking · schema</p>
      <h3>The spec cannot say what a figure is</h3>
      <p><code>exam_stimuli</code>'s <code>plot</code> kind records where the points are. It has no
      way to record what they <em>are</em>. These three are byte-identical in the database and mean
      entirely different things to a student:</p>
      <ul>
        <li>a scatter of observations — must never be joined</li>
        <li>a sampled smooth curve — must be joined and smoothed</li>
        <li>a polygon — must be joined with straight segments</li>
      </ul>
      <p>The same gap covers whether a plot is a coordinate plane or a data plot. Every figure on
      this page therefore carries its decision in a table beside the spec rather than inside it.
      That is honest for one renderer and breaks the moment there are two — which is exactly what
      the M4 migration set out to prevent.</p>
      <p><strong>Until it is settled, a plot-bearing form should not be published:</strong>
      publication freezes the spec forever, and a published plot spec cannot currently describe
      its own figure.</p>
    </div>
  </section>

</div>

<script>
{RENDERER}

const SPECIMENS = {json.dumps(SPECIMENS, ensure_ascii=False)};
const {{renderStimulus}} = globalThis.SiExamStimulus;
for (const sp of SPECIMENS) {{
  const host = document.getElementById('fig-' + sp.id);
  if (host) host.appendChild(renderStimulus(sp.kind, sp.spec, sp.opts || {{}}));
}}
const circleSp = SPECIMENS.find(s => s.id === 'circle');
const tableSp  = SPECIMENS.find(s => s.id === 'table');
for (const cls of ['pin-paper','pin-soft','pin-lifted','pin-night']) {{
  document.getElementById('cand-' + cls).appendChild(renderStimulus(
    'plot', circleSp.spec, Object.assign({{}}, circleSp.opts, {{width: 400, height: 320}})));
  // a table too: fatigue shows up in numerals long before it shows in a curve
  document.getElementById('candt-' + cls).appendChild(
    renderStimulus('table', tableSp.spec, {{}}));
}}
</script>
"""
io.open(os.path.join(REPO, 'stimulus-plates.html'), 'w', encoding='utf-8').write(HTML)
print('written  stimulus-plates.html  %d bytes' % len(HTML))
