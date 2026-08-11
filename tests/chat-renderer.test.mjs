// chat-renderer.js — Markdown + LaTeX protection.
//
// Regression target: the intermittent "some answers render as raw Markdown"
// bug. renderMarkdown protected math by substituting \x01M<n>\x01 placeholders
// in FOUR SEQUENTIAL regex passes ($$, then \[, then $, then \(). Two defects
// followed from that shape, and between them they produced every reported
// symptom:
//
//   1. A later pass could match ACROSS an earlier pass's placeholder and save
//      it inside its own block. restoreMath ran a single String.replace, whose
//      replacement text is never rescanned, so the inner placeholder reached
//      the DOM verbatim — the "▯M0▯" students saw (▯ is U+0001 with no glyph).
//
//   2. The delimiter patterns were unanchored with [\s\S]*?, so ONE unbalanced
//      \( matched forward to the next \) anywhere later — swallowing headings
//      and **bold** into a "math" block that never reached inlineFmt. Two
//      dollar signs on a line ("costs $5 ... $2") did the same to prose.
//
// Everything swallowed was restored as literal delimited text, so KaTeX
// auto-render then tried to parse prose as math and, with throwOnError:false,
// printed the source in red.
//
// The contract these tests pin:
//   A. No placeholder ever reaches the output. Not one, under any input.
//   B. Markdown OUTSIDE math is always processed; markdown INSIDE math is not.
//   C. A saved math block is byte-identical to its source (HTML-escaped).
//   D. A delimiter that is NOT math must be neutralised so KaTeX cannot pair
//      it — otherwise the corruption simply moves from renderMarkdown to KaTeX.
//   E. The XSS escape on restore survives. See chat-renderer.js: restoring raw
//      source made `$<img src=x onerror=...>$` execute in the reader's session
//      AND in an admin's review panel, since admin/ai-monitor share this module.
//
// The real shipped module is executed, per tests/_source.mjs.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';
import vm from 'node:vm';

const t = suite('chat-renderer');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(read('chat-renderer.js'), sandbox);
const md = sandbox.window.renderMarkdown;

// ── helpers ────────────────────────────────────────────────────────────────

/** Any leaked placeholder, shown the way a student sees it. */
const leaked = (html) => (html.match(/\x01M?\d*\x01?/g) || []).map(s => s.replace(/\x01/g, '▯'));

/**
 * The text KaTeX auto-render would actually scan: elements marked as
 * ignored are dropped (auto-render's ignoredClasses never descends into them),
 * remaining tags stripped, entities decoded back to characters as the DOM does.
 * Contract D is asserted against this view rather than the raw HTML, so it
 * holds however the renderer chooses to neutralise a stray delimiter.
 */
function katexView(html) {
  return html
    .replace(/<span[^>]*class="[^"]*no-katex[^"]*"[^>]*>[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

/**
 * The math regions KaTeX auto-render would actually find and try to typeset,
 * in document order — modelling its scan faithfully, INCLUDING the fact that it
 * is permissive: it pairs across newlines and does not care whether the content
 * is mathematics or prose.
 *
 * Asserting on this rather than on "are the delimiters balanced" matters. A
 * swallowed region IS balanced — that is the whole defect — so a balance check
 * passes on broken output. What must hold is that the regions KaTeX finds are
 * exactly the expressions the author wrote, and nothing else.
 */
function katexMath(html) {
  const v = katexView(html);
  const PAIRS = [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']];
  const found = [];
  for (let i = 0; i < v.length;) {
    let hit = null;
    for (const [open, close] of PAIRS) {
      if (v.startsWith(open, i)) {
        const end = v.indexOf(close, i + open.length);
        if (end !== -1) { hit = { content: v.slice(i + open.length, end), next: end + close.length }; break; }
      }
    }
    if (hit) { found.push(hit.content); i = hit.next; } else i++;
  }
  return found;
}

const strong = (html, word) => html.includes('<strong>' + word + '</strong>');
const rawBold = (html) => /\*\*[^*\n]+\*\*/.test(html);

// ───────────────────────────────────────────────────────────────────────────
t.section('A · No placeholder ever reaches the output');

const LEAK_CASES = [
  ['$$ inside \\(...\\) — the exact ▯M0▯ students reported',
   'Since \\( the term $$a+b$$ matters \\) we continue.'],
  ['$$ used twice, the second inside \\(...\\)',
   'Given $$a+b$$ we get \\( the value $$a+b$$ again \\).'],
  ['$$ inside \\[...\\]',
   'Start $$k$$ then \\[ recall $$k$$ here \\] end.'],
  ['\\[...\\] inside \\(...\\)',
   'See \\[x=1\\] and \\( note \\[x=1\\] again \\).'],
  ['$...$ inside \\(...\\)',
   'Take $n$ then \\( for each $n$ we sum \\) done.'],
  ['$$ inside $...$',
   'Let $$q$$ hold, so $a $$q$$ b$ follows.'],
  ['a realistic mixed-delimiter answer',
   '**Strategy**\nSubstitute \\( x = 2 \\).\n\n$$ f(x) = x^2 + 3x $$\n\n**Final Answer**\nThe value is \\( f(2) = $$10$$ \\).'],
];
for (const [label, input] of LEAK_CASES) {
  const out = md(input);
  t.is(label, leaked(out), []);
}

// The full swallow matrix: every ordered pair of delimiter styles.
{
  const D = [['$$', '$$'], ['\\[', '\\]'], ['$', '$'], ['\\(', '\\)']];
  const leaks = [];
  for (const [ol, or_] of D) {
    for (const [il, ir] of D) {
      const out = md(`${ol} pre ${il}x${ir} post ${or_}`);
      if (leaked(out).length) leaks.push(`${ol}…${or_} containing ${il}…${ir}`);
    }
  }
  t.is('no combination of nested delimiters leaks a placeholder', leaks, []);
}

// ───────────────────────────────────────────────────────────────────────────
t.section('B · Markdown outside math is always processed');
{
  const out = md('We know \\( a = 2 and the cost rises.\n**Strategy**\nSubstitute into \\( a + b \\).\n**Final Answer**\n42');
  t.ok('an unmatched \\( does not swallow a later **Strategy**', strong(out, 'Strategy'));
  t.ok('nor **Final Answer**', strong(out, 'Final Answer'));
  t.ok('no raw ** survives anywhere', !rawBold(out));
}
{
  const out = md('If $5 is the **base** price then $2 more.');
  t.ok('two currency amounts on one line do not swallow the bold between them',
    strong(out, 'base'));
  t.ok('and leave no raw **', !rawBold(out));
}
{
  const out = md('\\[ \\begin{aligned} x &= 1\n**Strategy**\n**Final Answer** \\( z \\)');
  t.ok('an unclosed \\[ does not swallow **Strategy**', strong(out, 'Strategy'));
  t.ok('nor **Final Answer**', strong(out, 'Final Answer'));
}
{
  const out = md('**Strategy**\nUse \\( x^2 \\) here.\n**Final Answer**\n\\( x = 3 \\)');
  t.ok('bold before math is processed', strong(out, 'Strategy'));
  t.ok('bold after math is processed', strong(out, 'Final Answer'));
}

t.section('B2 · Markdown INSIDE math is left alone');
{
  const out = md('Compare $$ a ** b ** c $$ carefully.');
  t.ok('asterisks inside display math are not turned into <strong>', !/<strong>/.test(out));
  t.ok('the math keeps its asterisks verbatim', out.includes('a ** b ** c'));
}
{
  const out = md('Inline \\( x_1 * x_2 \\) product.');
  t.ok('a single asterisk inside math is not turned into <em>', !/<em>/.test(out));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('C · Math survives byte-identical');
{
  const src = '$$\n\\begin{aligned}\nx &= 1 \\\\\ny &= 2\n\\end{aligned}\n$$';
  const out = md(src);
  t.ok('multi-line display math keeps its newlines', out.includes('\\begin{aligned}') && out.includes('\\end{aligned}'));
  t.ok('and its alignment ampersands (escaped, decoding back in the DOM)',
    out.includes('&amp;= 1'));
  t.is('no placeholder', leaked(out), []);
}
{
  const out = md('First \\( a^2 \\), second \\( b^2 \\), third \\( c^2 \\).');
  t.ok('three inline expressions all survive',
    out.includes('a^2') && out.includes('b^2') && out.includes('c^2'));
  t.is('and none leaks', leaked(out), []);
}
{
  const out = md('Mix $x$ and \\( y \\) and $$ z $$ and \\[ w \\] together.');
  t.ok('all four delimiter styles survive in one response',
    ['x', 'y', 'z', 'w'].every(v => out.includes(v)));
  t.is('with no leakage', leaked(out), []);
}

// ───────────────────────────────────────────────────────────────────────────
t.section('D · KaTeX must find exactly the expressions the author wrote');
{
  const out = md('We know \\( a = 2 and the cost rises.\n**Strategy**\nSubstitute into \\( a + b \\).');
  t.is('a stray \\( is neutralised — KaTeX sees only the real expression',
    katexMath(out), [' a + b ']);
}
{
  const out = md('The book costs $5 and the pen costs $2 total.');
  t.is('two currency amounts are not offered to KaTeX as math', katexMath(out), []);
}
{
  const out = md('An unclosed \\[ display start\nand later a real \\( x \\).');
  t.is('an unclosed \\[ cannot capture the real inline math after it',
    katexMath(out), [' x ']);
}
{
  const out = md('Well-formed \\( x \\) and $$ y $$ only.');
  t.is('well-formed math is passed through untouched', katexMath(out), [' x ', ' y ']);
}
{
  const out = md('**Strategy**\nSubstitute \\( x = 2 \\).\n\n$$ f(x) = x^2 + 3x $$\n\n**Final Answer**\nThe value is \\( f(2) = $$10$$ \\).');
  t.is('a mixed-delimiter answer yields exactly its three expressions',
    katexMath(out), [' x = 2 ', ' f(x) = x^2 + 3x ', ' f(2) = $$10$$ ']);
}

// ───────────────────────────────────────────────────────────────────────────
t.section('E · XSS protection is preserved');
const XSS = [
  ['inline $…$',      '$<img src=x onerror=alert(1)>$'],
  ['inline \\(…\\)',  '\\( <img src=x onerror=alert(1)> \\)'],
  ['display $$…$$',   '$$ <script>alert(1)</script> $$'],
  ['display \\[…\\]', '\\[ <img src=x onerror=alert(1)> \\]'],
  ['unbalanced \\(',  '\\( <img src=x onerror=alert(1)>'],
  ['plain prose',     'Look at <img src=x onerror=alert(1)> here.'],
  ['inside bold',     '**<img src=x onerror=alert(1)>**'],
];
for (const [label, input] of XSS) {
  const out = md(input);
  t.ok(`${label}: no live <img> or <script> reaches the DOM`,
    !/<img/i.test(out) && !/<script/i.test(out));
}
{
  const out = md('$<img src=x onerror=alert(1)>$');
  t.ok('the payload is present but escaped as text', out.includes('&lt;img'));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('F · Behaviour that was already correct is unchanged');
{
  // The healthy control from the investigation: balanced math, bold around it.
  // Nothing here is ambiguous, so the output must be exactly what shipped.
  const out = md('**Strategy**\nUse the quadratic formula \\( x = \\frac{-b}{2a} \\).\n**Final Answer**\n\\( x = 3 \\)');
  t.is('a well-formed answer renders exactly as before', out,
    '<div class="ai-md">' +
    '<p dir="auto"><strong>Strategy</strong></p>' +
    '<p dir="auto">Use the quadratic formula \\( x = \\frac{-b}{2a} \\).</p>' +
    '<p dir="auto"><strong>Final Answer</strong></p>' +
    '<p dir="auto">\\( x = 3 \\)</p></div>');
}
{
  t.is('headings still render', md('## Heading'), '<div class="ai-md"><h4 dir="auto">Heading</h4></div>');
  t.is('ordered lists still render', md('1. one'),
    '<div class="ai-md"><ol dir="auto"><li dir="auto">one</li></ol></div>');
  t.is('bullet lists still render', md('- one'),
    '<div class="ai-md"><ul dir="auto"><li dir="auto">one</li></ul></div>');
  t.is('blank lines still become spacers', md(''), '');
  t.is('inline code still renders', md('use `x` now'),
    '<div class="ai-md"><p dir="auto">use <code>x</code> now</p></div>');
}
{
  const out = md('```js\nconst a = 1 < 2;\n```');
  t.ok('fenced code blocks still render and stay escaped',
    out.includes('<pre class="ai-md"') && out.includes('1 &lt; 2'));
}
{
  const out = md('A paragraph with $x + 1$ inline math.');
  t.ok('ordinary inline $…$ math still round-trips', out.includes('$x + 1$'));
  t.is('with no leakage', leaked(out), []);
}

// ───────────────────────────────────────────────────────────────────────────
t.section('G2 · renderInline — the same math authority, without block wrappers');
// Rules Used renders into inline <span>s in a flex column, so it cannot use
// renderMarkdown's <div class="ai-md"><p> output. renderInline exists so that
// consumer can reuse the SAME tokenizer instead of growing a second one — which
// is exactly how normalizeRuleFormula came to double-wrap `\( p/q \)` as
// `$\( p/q \)$` and hand KaTeX something it cannot parse.
const inline = sandbox.window.renderInline;
{
  t.ok('renderInline is exported', typeof inline === 'function');
}
{
  t.is('plain text passes through', inline('hello'), 'hello');
  t.is('no block wrappers are emitted', /<div|<p[ >]/.test(inline('a\nb')), false);
  t.is('bold still works', inline('**b**'), '<strong>b</strong>');
  t.is('html is escaped', inline('<img src=x>'), '&lt;img src=x&gt;');
}
{
  // The reported defect, at the renderer level.
  t.is('already-delimited math is NOT re-wrapped', inline('\\( p/q \\)'), '\\( p/q \\)');
  t.is('…not even when asked to treat a bare string as math',
    inline('\\( p/q \\)', { mathIfBare: true }), '\\( p/q \\)');
  t.is('…and the same for \\[…\\]',
    inline('\\[ x^2 \\]', { mathIfBare: true }), '\\[ x^2 \\]');
  t.is('…and for $…$', inline('$p/q$', { mathIfBare: true }), '$p/q$');
}
{
  // The behaviour that must be preserved: a bare formula still becomes math.
  t.is('a delimiter-free formula is treated as one expression',
    inline('ax^2 + bx + c = 0', { mathIfBare: true }), '$ax^2 + bx + c = 0$');
  t.is('without the flag it stays prose',
    inline('ax^2 + bx + c = 0'), 'ax^2 + bx + c = 0');
}
{
  // mathIfBare must not wrap a string that carries stray delimiters — wrapping
  // "costs $5 and $2" would rebuild the very bug this replaces.
  const out = inline('costs $5 and $2', { mathIfBare: true });
  t.ok('a string with stray dollars is not wrapped as math', !/^\$/.test(out), out);
  t.is('and its dollars are neutralised', katexMath(out), []);
}
{
  t.is('inline mode leaks no placeholder', leaked(inline('\\( a $$b$$ c \\)')), []);
  t.is('inline mode neutralises an unbalanced \\(', katexMath(inline('\\( a = 2 and more')), []);
  t.ok('inline mode escapes XSS', !/<img/i.test(inline('$<img src=x onerror=1>$')));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('G · Property sweep — the invariants hold for inputs nobody listed');
// The cases above are the ones that were observed. This generates delimiter
// soup instead, because the defect was a whole CLASS of input rather than a
// list: any arrangement the model can emit must satisfy the same invariants.
// Deterministic (seeded LCG) so a failure is reproducible in CI.
{
  let seed = 20260806;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  const TOKENS = [
    '$', '$$', '\\(', '\\)', '\\[', '\\]', ' x ', '\n', '**bold**', ' 5 ',
    'costs $5', 'text', ' & ', '<img src=x onerror=alert(1)>', '*i*', '`c`',
    '\\frac{a}{b}', ' &= ', '## H', '- item', '1. one',
  ];
  let placeholderLeaks = 0, liveMarkup = 0, mathWithPlaceholder = 0, threw = 0;
  const samples = 4000;
  for (let n = 0; n < samples; n++) {
    let doc = '';
    for (let k = 0, len = 3 + rnd(12); k < len; k++) doc += TOKENS[rnd(TOKENS.length)];
    let out;
    try { out = md(doc); } catch { threw++; continue; }
    if (/\x01/.test(out)) { placeholderLeaks++; continue; }
    if (/<img/i.test(out) || /<script/i.test(out)) { liveMarkup++; continue; }
    if (katexMath(out).some(m => /\x01/.test(m))) mathWithPlaceholder++;
  }
  t.is(`${samples} generated documents: none threw`, threw, 0);
  t.is('none leaked a placeholder', placeholderLeaks, 0);
  t.is('none emitted live <img>/<script>', liveMarkup, 0);
  t.is('none handed KaTeX a region containing a placeholder', mathWithPlaceholder, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// H · Zero's section headings are structural, not a bold run-on
//
// Zero does not emit markdown headings. Every section arrives as ONE line
// carrying the heading AND its body, separated by two spaces:
//
//   📖 **Understand the Problem**  We need to interpret the equation: \( F = … \)
//   🎯 **Strategy — Identify the Components**  The equation represents …
//   **📐 Step 1 — Analyze the Components**  The term \( 7.00y \) indicates …
//   ✅ **Final Answer**  The best interpretation is: **B) …**
//
// The renderer has no branch for that shape, so each section falls through to
// the generic `<p>` case and the heading becomes inline bold at the start of a
// sentence. Every section then renders as an identical flat paragraph, the
// step-by-step structure disappears, and .ai-md h3/h4/h5 — which exist and are
// styled in chat.html:414-416 — are never applied to a tutor response.
//
// Verified against the stored ai_response of record be82f8a5 (2026-08-09).
//
// The heading-only shape (`**Strategy**` alone on its line, body beneath) is
// DELIBERATELY NOT changed here: section F pins it as a paragraph, and this
// fix is scoped to the inline-body shape only.
t.section('H · Zero section headings become real headings');
{
  t.is('leading emoji + bold heading + body → h5 then p',
    md('📖 **Understand the Problem**  We need to interpret the equation: \\( F = 2.50x + 7.00y \\).'),
    '<div class="ai-md">' +
    '<h5 dir="auto">📖 Understand the Problem</h5>' +
    '<p dir="auto">We need to interpret the equation: \\( F = 2.50x + 7.00y \\).</p></div>');

  t.is('an em-dash inside the heading stays in the heading',
    md('🎯 **Strategy — Identify the Components**  The equation represents total money.'),
    '<div class="ai-md">' +
    '<h5 dir="auto">🎯 Strategy — Identify the Components</h5>' +
    '<p dir="auto">The equation represents total money.</p></div>');

  t.is('emoji INSIDE the bold is still a heading',
    md('**📐 Step 1 — Analyze the Components**  The term \\( 7.00y \\) indicates the cost.'),
    '<div class="ai-md">' +
    '<h5 dir="auto">📐 Step 1 — Analyze the Components</h5>' +
    '<p dir="auto">The term \\( 7.00y \\) indicates the cost.</p></div>');

  t.is('bold inside the BODY still becomes strong, not a second heading',
    md('✅ **Final Answer**  The best interpretation is: **B) The price of one salad.**'),
    '<div class="ai-md">' +
    '<h5 dir="auto">✅ Final Answer</h5>' +
    '<p dir="auto">The best interpretation is: <strong>B) The price of one salad.</strong></p></div>');

  // The whole shape, as one document — four sections must yield four headings.
  const doc = [
    '📖 **Understand the Problem**  Interpret the equation.',
    '',
    '🎯 **Strategy**  Identify the components.',
    '',
    '**📐 Step 1**  Analyze them.',
    '',
    '✅ **Final Answer**  Option B.',
  ].join('\n');
  const hOut = md(doc);
  t.is('four sections produce four headings', (hOut.match(/<h5\b/g) || []).length, 4);
  t.is('and four body paragraphs',            (hOut.match(/<p\b/g)  || []).length, 4);
  t.ok('no section is left as a flat bold paragraph',
    !/<p dir="auto">(?:📖|🎯|✅)?\s*<strong>/.test(hOut));
}
{
  // Guard rails — shapes that must NOT be reinterpreted as headings.
  t.is('heading-only line is unchanged (section F contract)',
    md('**Strategy**'),
    '<div class="ai-md"><p dir="auto"><strong>Strategy</strong></p></div>');

  t.is('bold mid-sentence is not a heading',
    md('The answer is **B** in this case.'),
    '<div class="ai-md"><p dir="auto">The answer is <strong>B</strong> in this case.</p></div>');

  t.is('a real markdown heading still wins',
    md('## Heading'), '<div class="ai-md"><h4 dir="auto">Heading</h4></div>');

  // Trailing whitespace is preserved today; this guard is about NOT promoting
  // the line to a heading, so it pins the current output verbatim.
  t.is('bold followed by only whitespace is not a heading',
    md('**Strategy**   '),
    '<div class="ai-md"><p dir="auto"><strong>Strategy</strong>   </p></div>');

  t.is('a list item that happens to start bold is still a list',
    md('- **Rule**  apply it'),
    '<div class="ai-md"><ul dir="auto"><li dir="auto"><strong>Rule</strong>  apply it</li></ul></div>');
}

t.done();
