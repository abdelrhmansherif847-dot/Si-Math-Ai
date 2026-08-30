"""Pie chart — four directions, judged inside a question at exam measure.

FIGURE-GRAMMAR-EXPLORATION. This page exists to CHOOSE a treatment, so most of
what it shows will not be built. Its figure CSS is deliberately its own and is
not figure-system.css; nothing here is the shipped grammar until one of these is
picked and folded in.

WHY THIS PAGE EXISTS. A stimulus arrived that is two pie charts, and the figure
system has no pie in it. The five families were closed as a grammar (365d85b)
and pie is not one of them; the palette decided exactly TWO hues and says in its
own comment that a third "is not in the decided vocabulary, so slot 3 stays ink
rather than inventing a hue" — a four-slice pie needs four fills. The database
refuses one too: exam_stimulus_spec_ok hard-codes chartType in ('bar','line').

So this is a design decision, not a rendering task, and it is taken the way the
other five were: by drawing the alternatives and looking at them.

JUDGED IN A QUESTION, NOT ON A PLATE. The lesson of build-exam-composition.py
holds here — a student never sees a figure on a card by itself. They see a stem,
a figure and four choices in one centred column, at one measure. Every treatment
below is shown that way, at the exam's own 702px column, with BOTH charts in one
stimulus, in both themes.

NEUTRAL WORDING. The proportions and category labels are the real ones, because
they are what decides whether labels collide and whether a 10% slice can be read
— which is the whole point of looking. No stem, no choices and no answer key
from any authored exam item appears here or is ever committed.
"""
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

# ── the data being judged ────────────────────────────────────────────────────
COUNTRY = [('USA', 40), ('Japan', 30), ('Others', 20), ('UK', 10)]
AGE     = [('Above 50', 50), ('40–49', 20), ('30–39', 15), ('Below 30', 15)]

# ── ink, (light, dark), per treatment; the build fails on a missing half ─────
PIE_INK = {
 # A · one hue, in tints. The decided hue, lightened per slice.
 'tint':   dict(s1=('#2a78d6', '#3987e5'), s2=('#5f9ce3', '#5fa3ea'),
                s3=('#94bfef', '#86bff0'), s4=('#c9e0f8', '#b3d8f6'),
                lab=('#1d2733', '#e6edf5'), val=('#0e1620', '#f2f7fc'),
                sep=('#ffffff', '#161d25'), lead=('#8b97a5', '#7c8a9b')),
 # B · the same tints as a ring, with the shared total stated in the middle
 'ring':   dict(s1=('#2a78d6', '#3987e5'), s2=('#5f9ce3', '#5fa3ea'),
                s3=('#94bfef', '#86bff0'), s4=('#c9e0f8', '#b3d8f6'),
                lab=('#1d2733', '#e6edf5'), val=('#0e1620', '#f2f7fc'),
                sep=('#ffffff', '#161d25'), lead=('#8b97a5', '#7c8a9b'),
                mid=('#46535f', '#a3b0be')),
 # C · strictly the decided vocabulary: the two hues, then neutrals
 'two':    dict(s1=('#2a78d6', '#3987e5'), s2=('#eb6834', '#d95926'),
                s3=('#9aa6b3', '#6b768a'), s4=('#d3dae1', '#39434f'),
                lab=('#1d2733', '#e6edf5'), val=('#0e1620', '#f2f7fc'),
                sep=('#ffffff', '#161d25'), lead=('#8b97a5', '#7c8a9b')),
 # D · tints again, but every label pulled out to an aligned column on a leader
 'leader': dict(s1=('#2a78d6', '#3987e5'), s2=('#5f9ce3', '#5fa3ea'),
                s3=('#94bfef', '#86bff0'), s4=('#c9e0f8', '#b3d8f6'),
                lab=('#1d2733', '#e6edf5'), val=('#0e1620', '#f2f7fc'),
                sep=('#ffffff', '#161d25'), lead=('#8b97a5', '#7c8a9b')),
}

DIRECTIONS = [
 dict(id='tint', name='Rim labels', sub='One hue, in tints',
   axis='Where identity sits.',
   note='Each slice names itself at its own rim, largest first from twelve '
        'o&rsquo;clock. One decided hue, lightened per slice, so the figure adds no '
        'colour the grammar has not already spent. The risk is two small adjacent '
        'slices &mdash; 15% beside 15% &mdash; whose labels want the same few pixels.'),
 dict(id='ring', name='Ring, total in the middle', sub='The same tints, opened out',
   axis='Whether the whole is stated.',
   note='A ring says &ldquo;parts of one whole&rdquo; more plainly than a disc, and the '
        'hole is somewhere to put the thing the mathematics turns on: that both '
        'charts describe the SAME hundred per cent. A question comparing one '
        'chart&rsquo;s share with the other&rsquo;s is answerable only if that is true, and '
        'here the figure says so rather than the stem.'),
 dict(id='two', name='The decided vocabulary', sub='Two hues, then ink',
   axis='How much colour a pie may spend.',
   note='Strictly what the palette already decided: <code>--data-1</code>, '
        '<code>--data-2</code>, then neutrals. It invents nothing. It also stops '
        'reading as one distribution &mdash; two slices look like two series and the '
        'grey pair like something lesser, which is not what the mathematics says.'),
 dict(id='leader', name='Leaders to an aligned column', sub='Publication setting',
   axis='How collisions are prevented rather than survived.',
   note='Labels leave the rim entirely and are set in two columns, ordered down '
        'the page and spaced so they can never touch, each joined to its slice by '
        'a two-segment leader. Nothing clips, nothing collides, at any split. It '
        'costs width, and a pie that needs this much scaffolding is arguably '
        'telling you it wanted to be a bar chart.'),
]

def _tok(i):
    return '\n'.join(f'  --p{d}-{r}:{v[i]};' for d, roles in PIE_INK.items() for r, v in roles.items())

INK = f""":root{{
{_tok(0)}
}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{
{_tok(1)}
}}}}
:root[data-theme="dark"]{{
{_tok(1)}
}}"""

# Deliberately inlines NEITHER the shipped renderer nor figure-system.css: every
# pie here is a candidate drawn by this page's own code, and carrying the real
# grammar alongside would suggest these are drawn with it. They are not.

CSS = r"""<style>
:root{
  --page:#eceff4; --card:#ffffff; --rule:#dfe4ea; --ink:#131a22; --ink-2:#48566a; --ink-3:#6d7b8c;
  --accent:#0f5c8c; --accent-soft:rgba(15,92,140,.09);
  --shadow:0 1px 2px rgba(19,26,34,.05), 0 10px 28px -16px rgba(19,26,34,.28);
  --exam:#ffffff; --exam-rule:#dde3ea; --cyan:#0f6f9e;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --page:#0b0f15; --card:#141a22; --rule:#26303c; --ink:#eef3f9; --ink-2:#b0bfd0; --ink-3:#8797a9;
  --accent:#6bb6e4; --accent-soft:rgba(107,182,228,.13);
  --shadow:0 1px 2px rgba(0,0,0,.5), 0 10px 30px -16px rgba(0,0,0,.85);
  --exam:#161d25; --exam-rule:#26313d; --cyan:#5fb2dd;
}}
:root[data-theme="dark"]{
  --page:#0b0f15; --card:#141a22; --rule:#26303c; --ink:#eef3f9; --ink-2:#b0bfd0; --ink-3:#8797a9;
  --accent:#6bb6e4; --accent-soft:rgba(107,182,228,.13);
  --shadow:0 1px 2px rgba(0,0,0,.5), 0 10px 30px -16px rgba(0,0,0,.85);
  --exam:#161d25; --exam-rule:#26313d; --cyan:#5fb2dd;
}
/*__INK__*/
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);
  font:16.5px/1.65 'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1340px;margin:0 auto;padding:0 26px 130px}
.mast{padding:78px 0 26px;max-width:76ch}
.kick{font-size:11.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-3);margin:0 0 16px}
h1{font-family:'Newsreader',Georgia,serif;font-weight:600;font-size:clamp(32px,5vw,50px);
   line-height:1.08;letter-spacing:-.02em;margin:0 0 18px;text-wrap:balance}
.lede{font-size:19px;color:var(--ink-2);margin:0 0 14px}
.mast p{color:var(--ink-2);margin:0 0 12px}
.warn{border-left:3px solid var(--accent);background:var(--accent-soft);
  padding:16px 20px;border-radius:0 5px 5px 0;margin:22px 0 0;font-size:15px;color:var(--ink-2)}
.warn b{color:var(--ink)}
h2{font-family:'Newsreader',Georgia,serif;font-weight:600;font-size:27px;margin:0 0 4px}
.dir{margin:56px 0 0;padding-top:30px;border-top:1px solid var(--rule)}
.dir-sub{color:var(--ink-3);font-size:14.5px;margin:0 0 10px}
.dir-note{color:var(--ink-2);font-size:15px;max-width:78ch;margin:0 0 8px}
.dir-axis{font-size:13px;color:var(--ink-3);margin:0 0 22px}
.dir-axis b{color:var(--ink-2)}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}
@media (max-width:1180px){.pair{grid-template-columns:1fr}}
.themed{border:1px solid var(--rule);border-radius:8px;overflow:hidden;background:var(--card)}
.themed>.lbl{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3);
  padding:9px 14px;border-bottom:1px solid var(--rule)}
.stage{padding:22px;background:var(--page)}
/* THE EXAM CARD, AT THE EXAM'S OWN MEASURE. 702px is the width exams.html
   gives a figure; anything wider flatters a treatment that would not survive. */
.card{width:702px;max-width:100%;margin:0 auto;background:var(--exam);
  border:1px solid var(--exam-rule);border-radius:6px;padding:26px 30px 24px}
.qn{font:600 11.5px var(--font-mono,ui-monospace,monospace);letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink-3);margin:0 0 14px}
.stem{font-size:17.5px;line-height:1.55;margin:0 0 22px;color:var(--ink)}
.figs{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 0 24px}
.figcap{font:600 12.5px 'DM Sans',sans-serif;color:var(--ink-2);margin:0 0 4px;text-align:center}
.opts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.opts li{display:flex;align-items:center;gap:13px;font-size:16.5px;color:var(--ink);
  border:1px solid var(--exam-rule);border-radius:4px;padding:10px 15px}
.opts .k{flex:none;width:26px;height:26px;border-radius:50%;border:1.4px solid #8792a0;
  display:grid;place-items:center;font-size:13.5px;font-weight:600;color:var(--ink-2)}
svg.pie{display:block;width:100%;height:auto}
</style>"""
CSS = CSS.replace('/*__INK__*/', INK)

JS = r"""<script>
'use strict';
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a) => { const e = document.createElementNS(NS, n);
  for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]); return e; };
const txt = (a, s) => { const e = el('text', a); e.textContent = s; return e; };

/* ONE PIE, FOUR WAYS.
 *
 * Shared by every treatment: slices run clockwise from twelve o'clock, largest
 * first, because a reader compares against the vertical and the biggest share
 * is what a distribution is usually asked about. Separators are drawn in the
 * PAPER colour rather than a grey, so the gap between slices is the card
 * showing through and not another line competing with the axis-less figure.
 */
function pie(data, mode, ink) {
  /* SIZED FOR THE COLUMN IT LANDS IN, not for a plate of its own. Each pie gets
   * about half of the exam's 702px, and a rim label like "Above 50 50%" is ~95px
   * wide — so the disc is centred and kept small enough that a label has room on
   * BOTH sides. The first version put the disc at x=128 in a 330 box and the
   * left-hand labels ran off the edge, which judges the layout rather than the
   * treatment. */
  const W = 330, H = mode === 'leader' ? 248 : 234;
  const cx = W / 2, cy = H / 2, r = mode === 'leader' ? 46 : 64;
  const inner = mode === 'ring' ? r * 0.56 : 0;
  const s = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pie sx sx-fam-data', role: 'img' });
  s.style.maxWidth = W + 'px';
  const total = data.reduce((a, d) => a + d[1], 0);
  const P = (ang, rad) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];

  let a0 = -Math.PI / 2;
  const mids = [];
  data.forEach((d, i) => {
    const a1 = a0 + (d[1] / total) * Math.PI * 2, big = (a1 - a0) > Math.PI ? 1 : 0;
    const [x0, y0] = P(a0, r), [x1, y1] = P(a1, r);
    let path;
    if (inner) {
      const [u1, v1] = P(a1, inner), [u0, v0] = P(a0, inner);
      path = `M${x0},${y0} A${r},${r} 0 ${big} 1 ${x1},${y1} L${u1},${v1} ` +
             `A${inner},${inner} 0 ${big} 0 ${u0},${v0} Z`;
    } else {
      path = `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${big} 1 ${x1},${y1} Z`;
    }
    s.appendChild(el('path', { d: path, class: 'sl sl' + (i + 1) }));
    mids.push((a0 + a1) / 2);
    a0 = a1;
  });

  if (mode === 'ring') {
    s.appendChild(txt({ x: cx, y: cy - 4, 'text-anchor': 'middle', class: 'mid-n' }, '100%'));
    s.appendChild(txt({ x: cx, y: cy + 13, 'text-anchor': 'middle', class: 'mid-l' }, 'of tourists'));
  }

  if (mode === 'leader') {
    /* LABELS THAT CANNOT COLLIDE. Each slice wants its label at its own mid
     * angle; two 15% slices side by side want the same few pixels. So the
     * labels are taken off the rim, split into a left and a right column by
     * which half the slice sits in, ordered down the page by their natural y,
     * and then PUSHED APART until every gap is at least one line — the standard
     * publication treatment, and the only one here that is safe at any split. */
    const GAP = 21, colL = 6, colR = W - 6;
    const want = data.map((d, i) => ({ i, d, a: mids[i], y: cy + (r + 10) * Math.sin(mids[i]),
                                       right: Math.cos(mids[i]) >= -0.02 }));
    for (const side of [true, false]) {
      const col = want.filter(w => w.right === side).sort((p, q) => p.y - q.y);
      for (let k = 1; k < col.length; k++)
        if (col[k].y - col[k - 1].y < GAP) col[k].y = col[k - 1].y + GAP;
      const over = col.length ? col[col.length - 1].y - (H - 12) : 0;
      if (over > 0) for (const w of col) w.y -= over;
      for (const w of col) {
        const [ex, ey] = P(w.a, r + 5);
        // ONE text run per label, not two. Setting the name and the value as
        // separate anchored runs put them on a collision course the moment a
        // name got long — "Above 50" and "50%" overprinted into "Above5%0%".
        // A single run cannot collide with itself.
        //
        // The label is set AGAINST THE COLUMN EDGE and the leader bends just
        // outside the disc. Anchoring it to the bend instead ran "Above 50 50%"
        // off the right of the box — the leader has to fit the width that is
        // left over, not the other way round, and at half of a 702px exam column
        // there is not much of it. That constraint is the treatment's, not the
        // layout's, which is the thing worth judging here.
        const bend = w.right ? cx + r + 14 : cx - r - 14;
        s.appendChild(el('polyline', { class: 'ld',
          points: `${ex.toFixed(1)},${ey.toFixed(1)} ${bend},${w.y.toFixed(1)} ` +
                  `${(w.right ? bend + 6 : bend - 6)},${w.y.toFixed(1)}` }));
        const t = txt({ x: w.right ? colR : colL, y: w.y + 4,
                        'text-anchor': w.right ? 'end' : 'start', class: 'lb' }, '');
        const nm = el('tspan', { class: 'lb-n' }); nm.textContent = w.d[0] + ' ';
        const vl = el('tspan', { class: 'vl' }); vl.textContent = w.d[1] + '%';
        t.appendChild(nm); t.appendChild(vl);
        s.appendChild(t);
      }
    }
  } else {
    data.forEach((d, i) => {
      const [lx, ly] = P(mids[i], r + 15);
      const right = Math.cos(mids[i]) >= -0.02;
      s.appendChild(txt({ x: lx, y: ly + 4, 'text-anchor': right ? 'start' : 'end', class: 'lb' },
                        d[0] + '  ' + d[1] + '%'));
    });
  }
  return s;
}
</script>"""

# ── per-treatment ink, bound to the tokens generated above ───────────────────
SL = '\n'.join(
  f".d-{d} .sl1{{fill:var(--p{d}-s1)}} .d-{d} .sl2{{fill:var(--p{d}-s2)}}\n"
  f".d-{d} .sl3{{fill:var(--p{d}-s3)}} .d-{d} .sl4{{fill:var(--p{d}-s4)}}\n"
  f".d-{d} .sl{{stroke:var(--p{d}-sep);stroke-width:2}}\n"
  f".d-{d} .lb{{fill:var(--p{d}-lab);font:600 12.5px 'DM Sans',sans-serif}}\n"
  f".d-leader .lb{{font-size:11.5px}} .d-leader .vl{{font-size:12px}}\n"
  f".d-{d} .vl{{fill:var(--p{d}-val);font:700 13px 'DM Sans',sans-serif;"
  f"font-variant-numeric:tabular-nums}}\n"
  f".d-{d} .ld{{fill:none;stroke:var(--p{d}-lead);stroke-width:1}}\n"
  f".d-{d} .lb-n{{fill:var(--p{d}-lab)}}\n"
  for d in PIE_INK)
SL += ("\n.d-ring .mid-n{fill:var(--pring-val);font:700 19px 'DM Sans',sans-serif;"
       "font-variant-numeric:tabular-nums}\n"
       ".d-ring .mid-l{fill:var(--pring-mid);font:500 11.5px 'DM Sans',sans-serif}\n")

def card(d, theme):
    """One treatment, as a whole question at the exam's own measure."""
    return f'''<div class="themed"><p class="lbl">{theme}</p>
<div class="stage"{' data-theme="dark"' if theme=='dark' else ''}>
  <div class="card d-{d['id']}">
    <p class="qn">Question &middot; module 1</p>
    <p class="stem">The charts show how a group of travellers is distributed, first by
      destination and then by age. Both charts describe the same group.</p>
    <div class="figs">
      <div><p class="figcap">By destination</p><div id="f-{d['id']}-{theme}-a"></div></div>
      <div><p class="figcap">By age</p><div id="f-{d['id']}-{theme}-b"></div></div>
    </div>
    <ul class="opts">
      <li><span class="k">A</span><span>A first option</span></li>
      <li><span class="k">B</span><span>A second option</span></li>
      <li><span class="k">C</span><span>A third option</span></li>
      <li><span class="k">D</span><span>A fourth option</span></li>
    </ul>
  </div>
</div></div>'''

BODY = '\n'.join(f'''<section class="dir">
  <h2>{i+1} &middot; {d['name']}</h2>
  <p class="dir-sub">{d['sub']}</p>
  <p class="dir-note">{d['note']}</p>
  <p class="dir-axis"><b>The axis it varies:</b> {d['axis']}</p>
  <div class="pair">{card(d,'light')}{card(d,'dark')}</div>
</section>''' for i, d in enumerate(DIRECTIONS))

MOUNT = '\n'.join(
  f"mount('f-{d['id']}-{t}-a', COUNTRY, '{d['id']}');\nmount('f-{d['id']}-{t}-b', AGE, '{d['id']}');"
  for d in DIRECTIONS for t in ('light', 'dark'))

HTML = f"""<!-- FIGURE-GRAMMAR-EXPLORATION — several candidate pie treatments, most of
     which will not be built. Its figure CSS is deliberately its own and is not
     figure-system.css. Nothing here is the shipped grammar. -->
<!doctype html><meta charset="utf-8"><title>Pie chart &mdash; four directions</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- An internal design record, deployed so it can be LOOKED AT on the real site
     under the real CSP, at the real measure. Not part of the public knowledge
     layer and not for indexing. -->
<meta name="robots" content="noindex,nofollow">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap">
{CSS}
<style>{SL}</style>
<div class="wrap">
  <header class="mast">
    <p class="kick">Si Math AI &middot; figure grammar &middot; exploration, nothing chosen</p>
    <h1>A pie is not one of the five families. Here is what one would have to be.</h1>
    <p class="lede">Four treatments of the same two distributions, each shown as a whole
      question at the exam&rsquo;s own measure, in both themes.</p>
    <p>The families were closed as a grammar rather than as five looks, and pie was not
      among them. Adding one is a decision with three parts: how many fills it may spend,
      where identity sits, and whether the whole is stated. Each direction below answers
      those differently. None is the shipped grammar.</p>
    <div class="warn"><b>What choosing costs.</b> The palette decided TWO hues and says a
      third &ldquo;is not in the decided vocabulary&rdquo;; a four-slice pie needs four, so
      three of these spend tints of one hue rather than inventing any. The database also
      refuses a pie today &mdash; <code>exam_stimulus_spec_ok</code> allows
      <code>chartType</code> of <code>bar</code> or <code>line</code> only &mdash; so
      whichever is picked needs a migration, approved on its own, before a single question
      can store one.</div>
  </header>
{BODY}
</div>
{JS}
<script>
// JSON, not a Python repr: repr writes tuples as ('USA', 40), which JavaScript
// reads as the comma operator — the data arrived as bare numbers and every arc
// came out NaN.
const COUNTRY = {json.dumps(COUNTRY)};
const AGE = {json.dumps(AGE)};
function mount(id, data, mode) {{
  const h = document.getElementById(id);
  if (h) h.appendChild(pie(data, mode, null));
}}
{MOUNT}
</script>
"""
OUT = os.path.join(HERE, 'pie-directions.html')
io.open(OUT, 'w', encoding='utf-8').write(HTML)
print('written  pie-directions.html  %d chars' % len(HTML))
print('ink table: %d tokens across %d directions, both themes'
      % (sum(len(v) for v in PIE_INK.values()), len(PIE_INK)))
