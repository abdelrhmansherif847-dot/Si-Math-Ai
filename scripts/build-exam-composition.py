"""Each stimulus family, inside a realistic exam question.

Not a page to pick a favourite from. A plate on a card is the wrong frame for
judging an exam figure: a student never sees one. They see a stem, a figure and
four choices in a single centred column, and the figure has to do its job in
that composition, at that measure, against that text.

So every family below is shown as a whole question at true exam measure — first
as the renderer draws it today, then recomposed. The composition changes are
per family on purpose: a function graph and a coordinate-geometry figure want
opposite things, and forcing one visual language on both is what makes the set
look generic.

The questions are original and neutral. No authored exam item appears here.

This page is FIGURE-GRAMMAR-EXPLORATION: it shows each family as it is drawn
today beside a RECOMPOSED alternative, so half of it is by definition not the
shipped grammar. Its figure CSS stays its own; figure-system.css is what the
exam actually links.
"""
import io, json, math, os

# THE renderer, read from its authored source at build time — never a copy
# pasted into this file. A snapshot was embedded in a preview once and went
# stale immediately: fixes stopped reaching it while it still looked correct.
# validate-exam-stimulus.mjs fails if a generated page here falls behind.
CORE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    '..', 'supabase', 'functions', '_shared', 'exam-stimulus.core.js')
R = io.open(CORE, encoding='utf-8').read()

def samples(f, a, b, st):
    o = []; x = a
    while x <= b + 1e-9:
        o.append([round(x, 3), round(f(x), 3)]); x += st
    return o

CUBIC = lambda x: x**3/3 - 2*x*x + 3*x + 1

# ── the five questions ────────────────────────────────────────────────────────
Q = {
 'fn': dict(
   stem='The graph of <i>y</i> = <i>f</i>(<i>x</i>) is shown in the <i>xy</i>-plane. '
        'For how many values of <i>x</i> is <i>f</i>(<i>x</i>) = 2?',
   choices=['One', 'Two', 'Three', 'Four'], answer=2),
 'geo': dict(
   stem='Triangle <i>OAB</i> is shown in the <i>xy</i>-plane. What is the length of '
        '<i>OB</i>?',
   choices=['8', '10', '12', '14'], answer=1),
 'stat': dict(
   stem='The scatterplot shows the number of practice tests completed and the score '
        'gain for each of 8 students. What is the greatest score gain for a student '
        'who completed fewer than 5 practice tests?',
   choices=['50', '60', '90', '110'], answer=2),
 'nl': dict(
   stem='The solution to an inequality is graphed on the number line shown. Which '
        'inequality has this solution?',
   choices=['<i>x</i> &lt; &minus;2', '<i>x</i> &le; &minus;2',
            '<i>x</i> &gt; &minus;2', '<i>x</i> &ge; &minus;2'], answer=3),
 'tbl': dict(
   stem='The table shows the number of students in each of two grade levels who '
        'selected each of three elective courses. One of the 145 students will be '
        'selected at random. What is the probability that the student selected is in '
        'Grade&nbsp;12 <i>and</i> selected Debate?',
   choices=['24/70', '24/145', '42/145', '70/145'], answer=1),
}

TABLE = dict(head=['', 'Robotics', 'Debate', 'Studio Art', 'Total'],
             rows=[['Grade 11', '32', '18', '25', '75'],
                   ['Grade 12', '27', '24', '19', '70'],
                   ['Total', '59', '42', '44', '145']])

# ── figure specs: TODAY as the renderer draws it, and RECOMPOSED ──────────────
FIGS = {
 # A cubic under equal scales gets a tall narrow plate and a window that is
 # mostly empty sky. Nothing requires equal scales on a function graph — only
 # geometry, where shape carries meaning.
 'fn': dict(
   today=dict(spec=dict(xRange=[-0.6, 4.6], yRange=[-2, 5], xLabel='x', yLabel='y',
                curves=[dict(points=samples(CUBIC, -0.6, 4.6, 0.3))]),
              opts=dict(aspect='plane', gridMode='major', width=320, maxHeight=345,
                        figures=[dict(mode='curve')])),
   fixed=dict(spec=dict(xRange=[-0.7, 4.7], yRange=[-1.6, 5], xLabel='x', yLabel='y',
                curves=[dict(points=samples(CUBIC, -0.6, 4.6, 0.2))]),
              opts=dict(aspect='data', axes='plane', gridMode='major', width=560, height=300,
                        figures=[dict(mode='curve')]))),
 'geo': dict(
   today=dict(spec=dict(xRange=[-1, 8], yRange=[-1, 9], xLabel='x', yLabel='y',
                curves=[dict(points=[[0,0],[6,0],[6,8],[0,0]])]),
              opts=dict(aspect='plane', gridMode='major', width=320, maxHeight=345,
                        figures=[dict(mode='polygon')])),
   fixed=dict(spec=dict(xRange=[-1, 7.5], yRange=[-1, 9.4], xLabel='x', yLabel='y',
                curves=[dict(points=[[0,0],[6,0],[6,8],[0,0]])]),
              opts=dict(aspect='plane', gridMode='major', width=400, maxHeight=470,
                        originLabel='O',
                        figures=[dict(mode='polygon', labels=['', 'A', 'B'])]))),
 'stat': dict(
   today=dict(spec=dict(xRange=[0, 9], yRange=[0, 160], xLabel='Weeks', yLabel='Score gain',
                curves=[dict(points=[[1,40],[2,60],[3,50],[4,90],[5,110],[6,100],[7,140],[8,150]])]),
              opts=dict(aspect='data', gridMode='major', width=320, height=300,
                        figures=[dict(mode='scatter')])),
   fixed=dict(spec=dict(xRange=[0, 9], yRange=[0, 160],
                xLabel='Practice tests completed', yLabel='Score gain',
                curves=[dict(points=[[1,40],[2,60],[3,50],[4,90],[5,110],[6,100],[7,140],[8,150]])]),
              opts=dict(aspect='data', gridMode='rules', width=560, height=310,
                        figures=[dict(mode='scatter')]))),
 'nl': dict(
   today=dict(spec=dict(min=-6, max=6, segments=[{'from':-2,'to':6,'fromClosed':True,'toClosed':True}]),
              opts=dict(width=306)),
   fixed=dict(spec=dict(min=-6, max=6, segments=[{'from':-2,'to':6,'fromClosed':True,'toClosed':True}]),
              opts=dict(width=560, endpointR=8.5, height=104))),
}

# ── the rest of the data family, in the same decided language ────────────────
# "Data charts and scatter plots" is one family, so the decision has to hold for
# more than the one scatter that prompted it.
DATA_FIGS = {
 'fit': dict(kind='plot',
   caption='Scatter with a line of best fit &mdash; the commonest data figure on the test. '
           'The fit names itself where it ends, so no legend is needed.',
   spec=dict(xRange=[0, 9], yRange=[0, 160],
     xLabel='Practice tests completed', yLabel='Score gain',
     curves=[dict(points=[[1,40],[2,60],[3,50],[4,90],[5,110],[6,100],[7,140],[8,150]]),
             dict(points=[[0.5, 32], [8.5, 152]])]),
   opts=dict(aspect='data', gridMode='rules', width=520, height=300,
     figures=[dict(mode='scatter'), dict(mode='curve', name='Line of best fit')])),
 'bar': dict(kind='chart',
   caption='A bar chart. Rounded data-ends anchored to the baseline, a 2px gap between '
           'bars, and reference lines only across.',
   spec=dict(chartType='bar', categories=['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
     xLabel='Day', yLabel='Questions answered',
     series=[dict(name='', values=[18, 24, 21, 32, 28])]),
   opts=dict(width=520, height=290)),
 'line': dict(kind='chart',
   caption='Two series, told apart by a label at the end of each line rather than by a '
           'legend the student has to look up.',
   spec=dict(chartType='line', categories=['1', '2', '3', '4', '5', '6'],
     xLabel='Week', yLabel='Average score',
     series=[dict(name='Class A', values=[62, 68, 71, 74, 79, 83]),
             dict(name='Class B', values=[58, 61, 67, 66, 72, 75])]),
   opts=dict(width=520, height=290)),
}

TOOK = [
 ('Clean screen-first composition',
  'The figure is sized for a screen and given room, not squeezed to imitate a printed plate.'),
 ('Data-led hierarchy',
  'The observations are the heaviest, most saturated thing in the figure. Everything else '
  'recedes behind them.'),
 ('Restrained, validated colour',
  'Two slots from a palette checked against the real exam surface in both themes &mdash; '
  'lightness band, chroma floor, colour-vision separation and contrast all pass.'),
 ('Horizontal reference lines only',
  'A value is read by tracking left to the axis, so verticals add ink without adding a '
  'reading. They are gone.'),
 ('No coordinate-plane conventions',
  'No arrowheads, no equal-scale grid, no origin. These axes are a range of measured data, '
  'and they say so.'),
 ('Modern axis labels',
  'The y title reads left-to-right above its own axis instead of rotated up the side, and '
  'says what is measured rather than abbreviating it.'),
]
REFUSED = [
 ('No legend', 'A legend is a lookup, and a lookup under time is exactly what a figure exists '
  'to remove. Series name themselves at their own end &mdash; which still keeps identity off '
  'colour alone.'),
 ('No tooltip or hover', 'On a dashboard a tooltip reveals the value. On an exam that is the '
  'answer. The figure is inert, and a test enforces it.'),
 ('No card, panel or shadow', 'The figure sits directly in the question. Chrome around it '
  'would make it a widget the question contains rather than part of the question.'),
 ('No decorative fills or gradients', 'Nothing in the figure carries meaning it was not given '
  'by the data.'),
]

# ── what each recomposition changes, and what it costs ────────────────────────
NOTES = {
 'fn': ("Equal scales are dropped. Nothing on a function graph requires them — only "
        "geometry does, where shape carries meaning — and forcing them here gave a tall "
        "narrow plate whose upper half was empty. The window is trimmed to where the "
        "curve actually lives, the plate runs the full width of the text, and the curve "
        "is the heaviest thing in the figure with the scaffolding stepped back behind it.",
        "The cost: an <i>x</i> unit and a <i>y</i> unit are no longer the same length, "
        "so this figure must never be used for a question about distance or slope."),
 'geo': ("Equal scales are kept — they are the whole point here — and everything else "
         "changes. The vertices are named, so the stem's &ldquo;triangle <i>OAB</i>&rdquo; "
         "lands on the picture without the student having to work out which corner is "
         "which. The grid is one square per unit and the numerals agree with it, so "
         "counting 6 across and 8 up is literally counting squares.",
         "The cost: the window has to be trimmed to keep the grid on the unit &mdash; a "
         "wider one silently steps to 2 and the squares stop matching the numerals."),
 'stat': ("This family is <b>decided</b>. These figures are measured data, not coordinate "
          "geometry, so they no longer inherit the plane's language: no arrowheads, no "
          "equal-scale grid, no origin. Reference lines run only across, because that is the "
          "direction a value is read in. The observations carry a validated hue and are the "
          "heaviest thing in the figure; the scaffolding recedes behind them.",
          "The cost: this is the one family where colour carries meaning, so it is also the "
          "one that has to survive a colour-vision check &mdash; which is why the palette was "
          "validated rather than chosen."),
 'nl': ("A number line is a strip, so it is given the strip's natural shape: the full "
        "width of the text, one line high. The endpoint is the largest mark in the figure, "
        "because open-versus-closed <i>is</i> the question — every choice differs only in "
        "that.",
        "The cost: none. This family was simply drawn at a third of the size it deserved."),
 'tbl': ("Every cell is bounded and the table sits at the text's left margin rather than "
         "floating centred. The total row and column are separated by weight rather than by "
         "a different treatment, so the table still reads as one object. Numerals are "
         "tabular and right-aligned; row labels are not.",
         "The cost: boxed is more ink than the alternatives. At four columns with a totals "
         "row, that ink is doing work."),
}

CSS = r"""
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&display=swap">
<style>
:root{
  --page:#e9edf2; --card:#ffffff; --rule:#dde3ea; --ink:#111820; --ink-2:#44526440;
  --ink-2:#445264; --ink-3:#6b7a8c; --accent:#0f5c8c; --accent-soft:rgba(15,92,140,.08);
  --shadow:0 1px 2px rgba(17,24,32,.05), 0 12px 32px -18px rgba(17,24,32,.3);
  --bad:#a33a20; --bad-soft:rgba(163,58,32,.09);
  --good:#1c6b4a; --good-soft:rgba(28,107,74,.10);
  /* exam surface + figure ink, defined here so both themes resolve as a set */
  --exam:#ffffff; --exam-ink:#111820; --exam-rule:#8792a0;
  --fig-ink:#111820; --fig-axis:#3b4756; --fig-num:#2a3644;
  --fig-grid:#dbe2ea; --fig-fine:#eaeff4; --fig-frame:#c3ccd6;
  --t-rule:#8592a0; --t-outer:#2b3743;
  /* Data series. Slots 1-2 of the validated categorical palette, checked
     against THIS surface (#ffffff / #161d25) in both themes: lightness band,
     chroma floor, all-pairs colour-vision separation and 3:1 contrast all pass. */
  --data-1:#2a78d6; --data-2:#eb6834;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --page:#080c11; --card:#131920; --rule:#26313d; --ink:#eef3f9; --ink-2:#aebccc;
  --ink-3:#8493a5; --accent:#6bb6e4; --accent-soft:rgba(107,182,228,.12);
  --shadow:0 1px 2px rgba(0,0,0,.5), 0 12px 34px -18px rgba(0,0,0,.9);
  --bad:#e08165; --bad-soft:rgba(224,129,101,.13);
  --good:#63c39a; --good-soft:rgba(99,195,154,.13);
  --exam:#161d25; --exam-ink:#eef3f9; --exam-rule:#6f7d8c;
  --fig-ink:#eef3f9; --fig-axis:#b9c7d6; --fig-num:#cfdae6;
  --fig-grid:#28323e; --fig-fine:#1d252e; --fig-frame:#3c4956;
  --t-rule:#7b8896; --t-outer:#9fadbb;
  --data-1:#3987e5; --data-2:#d95926;
}}
:root[data-theme="dark"]{
  --page:#080c11; --card:#131920; --rule:#26313d; --ink:#eef3f9; --ink-2:#aebccc;
  --ink-3:#8493a5; --accent:#6bb6e4; --accent-soft:rgba(107,182,228,.12);
  --shadow:0 1px 2px rgba(0,0,0,.5), 0 12px 34px -18px rgba(0,0,0,.9);
  --bad:#e08165; --bad-soft:rgba(224,129,101,.13);
  --good:#63c39a; --good-soft:rgba(99,195,154,.13);
  --exam:#161d25; --exam-ink:#eef3f9; --exam-rule:#6f7d8c;
  --fig-ink:#eef3f9; --fig-axis:#b9c7d6; --fig-num:#cfdae6;
  --fig-grid:#28323e; --fig-fine:#1d252e; --fig-frame:#3c4956;
  --t-rule:#7b8896; --t-outer:#9fadbb;
  --data-1:#3987e5; --data-2:#d95926;
}
*{box-sizing:border-box}
body{margin:0;background-color:var(--page);color:var(--ink);
  font:16.5px/1.6 'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1380px;margin:0 auto;padding:0 26px 140px}
.mast{padding:80px 0 8px;max-width:68ch}
.kick{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3);
  margin:0 0 18px;font-weight:600}
h1{font-family:'Newsreader',Georgia,serif;font-weight:600;font-size:clamp(36px,5vw,56px);
  line-height:1.05;letter-spacing:-.022em;margin:0 0 20px;text-wrap:balance}
.lede{font-size:19.5px;color:var(--ink-2);margin:0 0 16px}
h2{font-family:'Newsreader',Georgia,serif;font-weight:600;font-size:30px;letter-spacing:-.012em;
  margin:0 0 8px}
.fam{margin:64px 0 0;padding-top:34px;border-top:1px solid var(--rule)}
.sub{color:var(--ink-2);margin:0 0 26px;max-width:74ch;font-size:16.5px}
.sub b{color:var(--ink)}

/* ── the exam surface: a question at the measure a student reads it ── */
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(560px,1fr));gap:22px;
  align-items:start}
.col{display:flex;flex-direction:column;gap:12px}
.tag{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;
  letter-spacing:.09em;text-transform:uppercase;padding:5px 11px;border-radius:3px;width:max-content}
.tag.now{color:var(--bad);background:var(--bad-soft)}
.tag.new{color:var(--good);background:var(--good-soft)}
.q{background:var(--exam);color:var(--exam-ink);border:1px solid var(--rule);border-radius:5px;
  box-shadow:var(--shadow);padding:30px 34px 32px}
.qn{font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--ink-3);margin:0 0 16px}
.stem{font-size:17.5px;line-height:1.55;margin:0 0 22px}
.stem i{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:1.06em}
.figbox{margin:0 0 24px;overflow-x:auto}
.figbox.mid{display:flex;justify-content:center}
.opts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.opts li{display:flex;align-items:center;gap:13px;font-size:16.5px;
  border:1px solid var(--exam-rule);border-radius:4px;padding:11px 15px}
.opts .k{flex:none;width:26px;height:26px;border-radius:50%;border:1.4px solid var(--exam-rule);
  display:grid;place-items:center;font-size:13.5px;font-weight:600}
.opts i{font-family:'Newsreader',Georgia,serif;font-size:1.06em}

/* ── the running commentary ── */
.why{border-left:2px solid var(--accent);padding:2px 0 2px 18px;margin:22px 0 0;max-width:74ch}
.why p{margin:0 0 10px;font-size:15.5px;color:var(--ink-2)}
.why p:last-child{margin:0}
.why .cost{color:var(--ink-3);font-size:14.5px}
.faults{display:grid;grid-template-columns:repeat(auto-fit,minmax(258px,1fr));gap:14px;margin:26px 0 0}
.f{background:var(--card);border:1px solid var(--rule);border-radius:5px;padding:17px 19px}
.f b{display:block;font-size:14.5px;margin:0 0 6px}
.f span{font-size:13.5px;color:var(--ink-3);line-height:1.55;display:block}
.f em{color:var(--bad);font-style:normal;font-weight:600}
.close{background:var(--accent-soft);border:1px solid var(--rule);border-radius:5px;
  padding:28px 32px;margin-top:60px;max-width:none}
.close h3{font-family:'Newsreader',serif;font-weight:600;font-size:22px;margin:0 0 14px}
.close p{margin:0 0 12px;color:var(--ink-2);max-width:78ch}.close p:last-child{margin:0}
.close b{color:var(--ink)}

/* ═════════ figures: geometry in the renderer, appearance here ═════════ */
.sx{display:block;margin:0}
.sx-frame{fill:none;stroke:var(--fig-frame);stroke-width:1.2}
.sx-grid line{stroke:var(--fig-grid);stroke-width:1;shape-rendering:crispEdges}
.sx-grid line.sx-fine{stroke:var(--fig-fine)}
.sx-axis line{stroke:var(--fig-axis);stroke-width:1.3;stroke-linecap:butt}
.sx-arrow{fill:var(--fig-axis)}
.sx-tickmark{stroke:var(--fig-axis);stroke-width:1.3;shape-rendering:crispEdges}
.sx-tick text{fill:var(--fig-num);font-family:'DM Sans',sans-serif;font-size:12.5px;
  font-variant-numeric:tabular-nums}
.sx-axis-tip{fill:var(--fig-axis);font-family:'Newsreader',Georgia,serif;font-style:italic;
  font-weight:600;font-size:15px}
.sx-axis-title{fill:var(--fig-num);font-family:'DM Sans',sans-serif;font-size:12.5px}
.sx-label{fill:var(--fig-ink);font-family:'Newsreader',Georgia,serif;font-style:italic;
  font-weight:600;font-size:16px;text-anchor:middle;
  paint-order:stroke;stroke:var(--exam);stroke-width:4px;stroke-linejoin:round}
.sx-curve{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:2.6}
.sx-point{fill:currentColor;stroke:var(--exam);stroke-width:2.5}
.sx-series{color:var(--fig-ink)}

/* the recomposed figures put MORE weight on the subject and LESS on the
   scaffolding — the inversion was the loudest thing wrong with them */
.new .sx-curve{stroke-width:3.2}
.new .sx-axis line{stroke-width:1.2}
.new .sx-tickmark{stroke-width:1.2}
.new .sx-point{r:5}
.new .sx-tick text{font-size:13px}

/* number lines */
.sx-nl-axis line{stroke:var(--fig-axis);stroke-width:1.4}
.sx-nl-tick{stroke:var(--fig-axis);stroke-width:1.4;shape-rendering:crispEdges}
.sx-nl-minor{stroke:var(--fig-grid);stroke-width:1}
.sx-nl-seg{stroke:currentColor;stroke-linecap:butt;stroke-width:4.5}
.sx-ray-arrow{fill:var(--fig-ink)}
.sx-endpoint{stroke:currentColor;stroke-width:2.6}
.sx-closed{fill:currentColor}
.sx-open{fill:var(--exam)}
.new .sx-nl-seg{stroke-width:6}
.new .sx-endpoint{stroke-width:3.2}

/* ═════════ the decided data family ═════════
   Colour is spent here and nowhere else: on this family the data IS the
   subject, so the observations carry hue and the scaffolding stays ink. */
.data .sx-series,.data .sx-s1{color:var(--data-1)}
.data .sx-s2{color:var(--data-2)}
.data .sx-point{stroke:var(--exam);stroke-width:2;r:5}
.data .sx-curve{stroke-width:2.2}
.data .sx-bar{fill:currentColor}
.data .sx-grid line{stroke:var(--fig-grid)}
.data .sx-axis-base{stroke:var(--fig-axis);stroke-width:1.2}
/* text wears text ink, never the series colour; the mark beside it carries
   the identity */
.sx-direct{fill:var(--fig-num);font-family:'DM Sans',sans-serif;font-size:12.5px;
  font-weight:600;paint-order:stroke;stroke:var(--exam);stroke-width:3.5px;stroke-linejoin:round}
.sx-ylab{font-weight:600}

.dgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:20px;margin:0 0 8px}
.dfig{margin:0;background:var(--exam);border:1px solid var(--rule);border-radius:5px;
  box-shadow:var(--shadow);padding:22px 24px 18px;display:flex;flex-direction:column;gap:14px}
.dfb{overflow-x:auto}
.dfig figcaption{font-size:13.5px;color:var(--ink-3);line-height:1.55;margin-top:auto}
h3.minor{font-family:'DM Sans',sans-serif;font-size:12.5px;font-weight:700;letter-spacing:.11em;
  text-transform:uppercase;color:var(--ink-3);margin:38px 0 10px}
.bnd{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:18px}
.bnd>div{background:var(--card);border:1px solid var(--rule);border-radius:5px;padding:20px 24px}
.bnd h4{margin:0 0 14px;font-size:14.5px}
.bnd .took h4{color:var(--good)}.bnd .ref h4{color:var(--bad)}
.bnd ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:13px}
.bnd li b{display:block;font-size:14px;margin-bottom:3px}
.bnd li span{font-size:13.5px;color:var(--ink-3);line-height:1.55}
.chip{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;padding:4px 9px;border-radius:3px;vertical-align:middle;
  color:var(--good);background:var(--good-soft);margin-left:8px}
.chip.open{color:var(--ink-3);background:var(--accent-soft)}
.tag.done{color:var(--good);background:var(--good-soft)}

/* ═════════ tables ═════════ */
table{border-collapse:collapse;font-family:'DM Sans',sans-serif;font-variant-numeric:tabular-nums}
th,td{white-space:nowrap}
.t-now th{font-weight:700;font-size:13px;padding:0 20px 9px;border-bottom:2px solid var(--ink-2);
  text-align:right}
.t-now th:first-child{text-align:left}
.t-now td{font-size:15.5px;padding:9px 20px;border-bottom:1px solid var(--rule);text-align:right}
.t-now td:first-child{text-align:left}
.t-now tr:last-child td{border-bottom:none}

.t-new{border:1.6px solid var(--t-outer);width:100%}
.t-new th{font-weight:700;font-size:14px;padding:11px 16px;border:1px solid var(--t-outer);
  text-align:right}
.t-new th:first-child{text-align:left}
.t-new td{font-size:16.5px;padding:11px 16px;border:1px solid var(--t-rule);text-align:right}
.t-new td:first-child{text-align:left;font-weight:500}
.t-new th:first-child,.t-new td:first-child{width:1%}
.t-new tbody tr:last-child td{border-top:1.6px solid var(--t-outer);font-weight:700}
</style>
"""

def opts_html(fam):
    q = Q[fam]
    return '<ul class="opts">' + ''.join(
      f'<li><span class="k">{"ABCD"[i]}</span><span>{c}</span></li>'
      for i, c in enumerate(q['choices'])) + '</ul>'

def table_html(cls):
    th = ''.join(f'<th>{h}</th>' for h in TABLE['head'])
    rows = ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in TABLE['rows'])
    return f'<table class="{cls}"><thead><tr>{th}</tr></thead><tbody>{rows}</tbody></table>'

def question(fam, which, n, mid=False):
    q = Q[fam]
    cls = ' data' if (fam == 'stat' and which == 'fixed') else ''
    fig = (f'<div class="figbox{" mid" if mid else ""}{cls}" id="fig-{fam}-{which}"></div>'
           if fam != 'tbl' else
           f'<div class="figbox{" mid" if mid else ""}">'
           f'{table_html("t-now" if which == "today" else "t-new")}</div>')
    return (f'<div class="q{" new" if which == "fixed" else ""}">'
            f'<p class="qn">Question {n}</p>'
            f'<p class="stem">{q["stem"]}</p>{fig}{opts_html(fam)}</div>')

def pair(fam, n, decided=False):
    now, new = NOTES[fam]
    tag = ('<span class="tag done">&#10003;&ensp;Decided &middot; Screen-native</span>'
           if decided else '<span class="tag new">Recomposed</span>')
    return (f'<div class="pair">'
            f'<div class="col"><span class="tag now">As it renders today</span>'
            f'{question(fam, "today", n, mid=True)}</div>'
            f'<div class="col">{tag}{question(fam, "fixed", n)}</div></div>'
            f'<div class="why"><p>{now}</p><p class="cost">{new}</p></div>')

def data_family():
    figs = ''.join(
      f'<figure class="dfig"><div class="dfb data" id="dat-{k}"></div>'
      f'<figcaption>{v["caption"]}</figcaption></figure>'
      for k, v in DATA_FIGS.items())
    took = ''.join(f'<li><b>{t}</b><span>{d}</span></li>' for t, d in TOOK)
    ref  = ''.join(f'<li><b>{t}</b><span>{d}</span></li>' for t, d in REFUSED)
    return (f'<h3 class="minor">The rest of the family, in the same language</h3>'
            f'<p class="note">The decision is for <b>data charts and scatterplots</b>, not for '
            f'one scatter, so it has to hold for a fit line, a bar chart and two series at '
            f'once.</p>'
            f'<div class="dgrid">{figs}</div>'
            f'<h3 class="minor">Screen-native, not dashboard</h3>'
            f'<div class="bnd"><div class="took"><h4>Taken from the direction</h4>'
            f'<ul>{took}</ul></div>'
            f'<div class="ref"><h4>Deliberately refused</h4><ul>{ref}</ul></div></div>')

FAULTS = [
 ('The window is not composed',
  'It is derived from the data range plus padding, so the figure gets whatever shape that '
  'happens to produce. On the cubic that is <em>a plate whose upper half is empty sky</em>.'),
 ('Scaffolding outweighs the subject',
  'Arrowheads on four ends, italic tips, a grid, ticks and numerals — against a curve at '
  '2.4px. <em>The frame is louder than the thing it frames.</em>'),
 ('The figure does not name itself',
  'A stem says &ldquo;triangle <i>OAB</i>&rdquo; and the figure names no vertex and no origin, '
  'so <em>the student has to work out which corner is which</em> before starting.'),
 ('The figure floats',
  'It is centred in whatever box it is given, at a width unrelated to the text it belongs to, '
  'so <em>it reads as an illustration beside the question</em> rather than part of it.'),
 ('One language is forced on every object',
  'Equal scales and a coordinate grid are right for geometry and wrong for a function graph '
  'and a scatterplot. Applied to all three, <em>each one is compromised for the others.</em>'),
]

BODY = f"""
<section class="fam" style="border-top:none;padding-top:26px">
  <h2>Why they don't read as professional</h2>
  <p class="sub">Not grid colour and not border weight. Five faults of <b>composition</b>, all of
    which pass every geometry and contrast check, and all of which are visible the moment a figure
    is put inside a question instead of on a card.</p>
  <div class="faults">{''.join(
    f'<div class="f"><b>{i+1} &middot; {t}</b><span>{d}</span></div>'
    for i, (t, d) in enumerate(FAULTS))}</div>
</section>

<section class="fam">
  <h2>Function graphs <span class="chip open">Still open</span></h2>
  <p class="sub"><b>The job:</b> read shape and read values off a curve. Nothing here needs an
    <i>x</i> unit to be the same length as a <i>y</i> unit.</p>
  {pair('fn', 14)}
</section>

<section class="fam">
  <h2>Coordinate geometry <span class="chip open">Still open</span></h2>
  <p class="sub"><b>The job:</b> count lengths and identify named points. Here equal scales are
    mandatory and the grid is an instrument, not background — the opposite of the family above.</p>
  {pair('geo', 7)}
</section>

<section class="fam" id="data">
  <h2>Data and scatterplots <span class="chip">Decided</span></h2>
  <p class="sub"><b>The job:</b> locate one observation among several. Different quantities on the
    two axes, so nothing is squared and there is no coordinate plane to draw. <b>This family
    follows the Screen-native direction</b> &mdash; these figures are measured data, and on a
    digital test the screen is part of what the figure means rather than decoration on top of it.</p>
  {pair('stat', 21, decided=True)}
  {data_family()}
</section>

<section class="fam">
  <h2>Number lines <span class="chip open">Still open</span></h2>
  <p class="sub"><b>The job:</b> read one endpoint and decide open or closed. Every answer choice
    here differs <i>only</i> in that, which is as literal as a figure's job ever gets.</p>
  {pair('nl', 3)}
</section>

<section class="fam">
  <h2>Tables <span class="chip open">Still open</span></h2>
  <p class="sub"><b>The job:</b> find one cell fast and be certain of its row and its column, under
    time. A two-way table with a totals row is where that actually gets tested.</p>
  {pair('tbl', 18)}
</section>

<div class="close">
  <h3>What is shared, and what is not</h3>
  <p><b>Different per family, deliberately:</b> whether scales are equal, whether there is a grid
    and how dense, whether the axes carry arrowheads, whether gridlines run both ways or only
    across, and how much of the text measure the figure takes. Each of those follows from what the
    student has to <i>do</i> with the object, and forcing one answer on all five is what made the
    set look generic.</p>
  <p><b>Identical across all five:</b> the typeface and the numeral style, the tick treatment and
    where numerals sit, the ink the figure is drawn in, the space above and below a figure inside a
    question, the stem and choice typography, and the measure of the column itself. That shared
    layer is what makes a mixed set still read as one exam.</p>
  <p>This is still an exploration. If a family here is not yet excellent, the answer is another
    composition for that family — not the least bad of these. <b>Production is untouched: the
    renderer is not wired, no migration exists, and no content has been inserted.</b></p>
</div>
"""

HTML = f"""<!-- FIGURE-GRAMMAR-EXPLORATION — this page shows treatments that were considered and mostly NOT chosen, so its figure CSS is deliberately its own and is not figure-system.css. See the builder's header. -->
<title>Stimulus Composition Study</title>
{CSS}
<div class="wrap">
  <header class="mast">
    <p class="kick">Si Math AI &middot; exploration &middot; nothing wired</p>
    <h1>The figure is not the picture. The question is.</h1>
    <p class="lede">A student never sees a plate on a card. They see a stem, a figure and four
      choices in one column, and the figure has to do its job in that composition, at that measure,
      against that text.</p>
    <p class="lede">So every family below is a whole question at true exam measure — first as the
      renderer draws it today, then recomposed, with what changed and what it cost.</p>
  </header>
  {BODY}
</div>
<script>{R}</script>
<script>
const FIGS = {json.dumps(FIGS)};
const DATA = {json.dumps({k: {'kind': v['kind'], 'spec': v['spec'], 'opts': v['opts']}
                          for k, v in DATA_FIGS.items()})};
const {{drawPlot, drawNumberLine, drawChart}} = globalThis.SiExamStimulus;
for (const fam of Object.keys(FIGS)) {{
  for (const which of ['today', 'fixed']) {{
    const f = FIGS[fam][which];
    const host = document.getElementById('fig-' + fam + '-' + which);
    if (!host) throw new Error('missing host fig-' + fam + '-' + which);
    host.appendChild(fam === 'nl' ? drawNumberLine(f.spec, f.opts) : drawPlot(f.spec, f.opts));
  }}
}}
for (const k of Object.keys(DATA)) {{
  const d = DATA[k];
  const host = document.getElementById('dat-' + k);
  if (!host) throw new Error('missing host dat-' + k);
  host.appendChild(d.kind === 'chart' ? drawChart(d.spec, d.opts) : drawPlot(d.spec, d.opts));
}}
</script>
"""
io.open('exam-composition.html', 'w', encoding='utf-8').write(HTML)
print('written  exam-composition.html  %d chars' % len(HTML))
