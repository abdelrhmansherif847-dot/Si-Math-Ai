// AI Monitor record detail — mathematical content must reach KaTeX.
//
// The record-detail drawer renders every field through esc(), so a solver
// answer stored as `-\frac{5}{3}` is shown to the reviewer as the literal
// characters `-\frac{5}{3}`. Record f30d0e02 (2026-08-12) is the case that
// surfaced it: tutor, Solver A and Solver B all agreed on -5/3, and the drawer
// displayed three different-looking raw LaTeX strings, which is exactly the
// situation where a reviewer most needs to compare them by eye.
//
// The page already loads KaTeX and chat-renderer.js, and the FEEDBACK panel
// already renders Zero's response through window.renderMarkdown followed by
// window.renderMathInEl. The drawer simply never adopted that path.
//
// So this is not a request for a math renderer — the project has exactly one,
// and rules-rendering.test.mjs exists because a SECOND one was written here
// once already. These tests assert the drawer routes through the existing
// authority and nothing else.
//
// Like rules-rendering.test.mjs, this executes the REAL helpers sliced out of
// ai-monitor.html against the REAL shared renderer, and asserts on the math
// regions KaTeX's auto-render would find.
import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';
import vm from 'node:vm';

const t = suite('monitor-math-rendering');

const MON = read('ai-monitor.html');
const ESC      = slice(MON, 'function esc(s) {', '\n', 'esc');
const TEXTBLOCK = slice(MON, '// Renders a long-text block with collapse/expand',
                             'function qiToggle(', 'qiTextBlock');
const FIELD     = slice(MON, 'function qiField(label, val',
                             '// ── Evidence-derived findings', 'qiField');

// Shared renderer first, then ai-monitor's helpers on top — the load order the
// page uses (chat-renderer.js is a <script> in <head>, above the inline code).
const sandbox = { window: {}, console, document: { getElementById: () => null } };
vm.createContext(sandbox);
vm.runInContext(read('chat-renderer.js'), sandbox);
vm.runInContext(`
  var renderMarkdown = window.renderMarkdown, renderInline = window.renderInline,
      renderMathInEl = window.renderMathInEl;
  ${ESC}
  ${TEXTBLOCK}
  ${FIELD}
  window.__qiField = qiField;
  window.__qiTextBlock = qiTextBlock;
`, sandbox);
const qiField     = sandbox.window.__qiField;
const qiTextBlock = sandbox.window.__qiTextBlock;

// Finding a delimiter in the HTML is NOT sufficient evidence that math renders.
// esc() leaves `\(` and `\)` completely untouched, so the drawer's CURRENT
// output already contains well-formed delimiters — inside a .qi-pre that KaTeX
// is never run over. An assertion that only looks for delimiters therefore
// passes on the broken page: it cannot go red, so it is not evidence.
//
// Every math assertion below pairs katexMath() with renderedByShared(), which
// checks the block was built by the shared renderer rather than by esc(). That
// is the part the current code cannot satisfy.
const renderedByShared = (html) => /class="[^"]*\bai-md\b/.test(html);

// Visible text only. A rendered block carries the untouched source in data-raw
// for the Copy button, so testing the whole HTML string for "**" or "\frac"
// matches that attribute and reports a defect in markup the reader never sees.
const visible = (html) => html.replace(/<[^>]+>/g, '');

/** The math regions KaTeX auto-render would find in this HTML. */
function katexMath(html) {
  const v = html
    .replace(/<span[^>]*class="[^"]*no-katex[^"]*"[^>]*>[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const PAIRS = [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']];
  const found = [];
  for (let i = 0; i < v.length;) {
    let hit = null;
    for (const [o, c] of PAIRS) {
      if (v.startsWith(o, i)) {
        const e = v.indexOf(c, i + o.length);
        if (e !== -1) { hit = { body: v.slice(i + o.length, e), next: e + c.length }; break; }
      }
    }
    if (hit) { found.push(hit.body); i = hit.next; } else i++;
  }
  return found;
}

// The exact values stored on record f30d0e02-63fc-4d60-b053-d86595ae6a7b,
// verified byte-identical to the database by md5 (86464587… for ai_response).
const SOLVER_ANSWER = '-\\frac{5}{3}';
const TUTOR_FINAL   = '\\( m - \\frac{4}{3}n = -\\frac{5}{3} \\)';

// ───────────────────────────────────────────────────────────────────────────
t.section('A. Solver answer — a bare expression with no delimiters');
{
  const html = qiField('Solver A Answer', SOLVER_ANSWER, { math: true });
  t.is('the stored bare LaTeX reaches KaTeX as one expression',
    katexMath(html), ['-\\frac{5}{3}']);
  t.ok('the field was built by the shared renderer, not esc()', renderedByShared(html), html);
}

t.section('B. Tutor final answer — already delimited, must not be re-wrapped');
{
  const html = qiField('Tutor Final Answer', TUTOR_FINAL, { math: true });
  t.is('a \\(…\\) expression reaches KaTeX exactly as written',
    katexMath(html), [' m - \\frac{4}{3}n = -\\frac{5}{3} ']);
  t.ok('it is NOT double-wrapped into $\\( … \\)$', !/\$\\\(/.test(html), html);
  t.ok('the field was built by the shared renderer, not esc()', renderedByShared(html), html);
}

t.section('C. Display math');
{
  const html = qiTextBlock('Solver A Reasoning', 'Therefore:\n\\[ x^2 + y^2 = 1 \\]', { math: true });
  t.is('a \\[…\\] block reaches KaTeX as display math',
    katexMath(html), [' x^2 + y^2 = 1 ']);
  t.ok('the block was built by the shared renderer, not esc()', renderedByShared(html), html);
}

t.section('D. Mixed prose and inline math in solver reasoning');
{
  const src = 'Slope is \\( \\frac{3}{5-n} \\) for the first pair.\n'
            + 'Cross-multiplying gives \\( 3(5-m) = 4(5-n) \\).';
  const html = qiTextBlock('Solver B Reasoning', src, { math: true });
  t.is('every inline expression reaches KaTeX, prose untouched',
    katexMath(html), [' \\frac{3}{5-n} ', ' 3(5-m) = 4(5-n) ']);
  t.ok('the surrounding prose still renders as text',
    /Cross-multiplying gives/.test(html), html);
  t.ok('the block was built by the shared renderer, not esc()', renderedByShared(html), html);
}

t.section('E. Tutor ai_response — the full stored shape');
{
  const src = '✅ **Final Answer**  \n\\( m - \\frac{4}{3}n = -\\frac{5}{3} \\)  \n'
            + 'This matches none of the given options.';
  const html = qiTextBlock('ai_response', src, { math: true });
  t.is('the final-answer expression reaches KaTeX',
    katexMath(html), [' m - \\frac{4}{3}n = -\\frac{5}{3} ']);
  t.ok('the heading renders through the shared renderer, not as raw **',
    !/\*\*Final Answer\*\*/.test(visible(html)), visible(html));
  t.ok('the block was built by the shared renderer, not esc()', renderedByShared(html), html);
}

t.section('E2. Judge Reasoning — quotes answers, so it must render too');
{
  const src = 'Both solvers reach \\( -\\frac{5}{3} \\), matching the tutor.';
  const html = qiTextBlock('Judge Reasoning', src, { math: true });
  t.is('a quoted expression in judge prose reaches KaTeX',
    katexMath(html), [' -\\frac{5}{3} ']);
  t.ok('the block was built by the shared renderer, not esc()', renderedByShared(html), html);
  t.ok('the surrounding judgement text survives', /Both solvers reach/.test(html), html);
}

// All six surfaces the drawer must render as mathematics.
t.section('E3. Every one of the six surfaces is wired for math');
{
  const qiOpenSrc = slice(MON, 'function qiOpen(i) {', '\nfunction qiClose', 'qiOpen');
  const wired = (call) => new RegExp(
    call.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[^)]*\\{\\s*math:\\s*true\\s*\\}").test(qiOpenSrc);
  t.ok('1. ai_response',           wired("qiTextBlock('ai_response'"), qiOpenSrc.slice(0, 0));
  t.ok('2. Solver A Answer',       wired("qiField('Solver A Answer'"));
  t.ok('3. Solver A Reasoning',    wired("qiTextBlock('Solver A Reasoning'"));
  t.ok('4. Solver B Answer',       wired("qiField('Solver B Answer'"));
  t.ok('5. Solver B Reasoning',    wired("qiTextBlock('Solver B Reasoning'"));
  t.ok('6. Judge Reasoning',       wired("qiTextBlock('Judge Reasoning'"));
}

// ───────────────────────────────────────────────────────────────────────────
// Guard rails. These must hold BOTH before and after the change — they are the
// evidence that routing math through the renderer did not turn ordinary
// reviewer text into math, or open an injection path.
t.section('F. Non-math content is unchanged');
{
  const html = qiField('Verdict', 'agrees', { math: true });
  t.is('a plain word is not treated as an expression', katexMath(html), []);
  t.ok('the word still appears', /agrees/.test(html), html);
}
// Every one of these is a REAL stored solver_answers value. An earlier draft of
// this fix asked the renderer for mathIfBare unconditionally, which wrapped each
// of them in $…$ and would have handed KaTeX an English sentence to typeset as
// mathematics. These pin the routing rule that prevents it.
t.section('F2. Real non-mathematical solver answers must stay text');
for (const v of ['D', 'Decreasing linear', '21', 'N/A', '48',
                 'A) If the width of the rectangle is 14 ft, then the area of the rectangle is 1,176 ft².']) {
  const html = qiField('Solver A Answer', v, { math: true });
  t.is(`not math: ${JSON.stringify(v.slice(0, 34))}`, katexMath(html), []);
}
{
  const html = qiField('Solver A Answer',
    'A) If the width of the rectangle is 14 ft, then the area of the rectangle is 1,176 ft².', { math: true });
  t.ok('the sentence is still readable as a sentence',
    /If the width of the rectangle is 14 ft/.test(visible(html)), visible(html));
}
{
  const html = qiTextBlock('Judge Reasoning',
    'Both solvers reach the same final value as the tutor, -5/3.', { math: true });
  t.is('ordinary prose containing a slash is not math', katexMath(html), []);
}
{
  const html = qiField('Cost', 'The pack costs $5 and the refund is $3', { math: true });
  t.is('two dollar amounts are not paired into an expression', katexMath(html), []);
}

t.section('G. Escaping still holds — the drawer renders untrusted model output');
{
  const html = qiTextBlock('Solver A Reasoning', '<img src=x onerror=alert(1)>', { math: true });
  t.ok('a raw tag cannot reach the DOM as markup', !/<img/i.test(html), html);
}
{
  const html = qiField('Solver A Answer', '<script>alert(1)</script>', { math: true });
  t.ok('a script tag is escaped in a field', !/<script/i.test(html), html);
}

t.section('H. Fields NOT marked math keep byte-for-byte current behaviour');
{
  t.ok('an unmarked field still escapes its value',
    /&lt;b&gt;/.test(qiField('Pipeline Version', '<b>x</b>')), '');
  t.is('an unmarked field renders no math',
    katexMath(qiField('Pipeline Version', SOLVER_ANSWER)), []);
  t.ok('an unmarked text block still escapes',
    /&lt;b&gt;/.test(qiTextBlock('verification_reason', '<b>x</b>')), '');
}

t.section('I. Missing values still read as "not captured", not as empty math');
{
  t.ok('null field', /Not captured/.test(qiField('Solver A Answer', null, { math: true })));
  t.ok('empty field', /Not captured/.test(qiField('Solver A Answer', '', { math: true })));
  t.ok('null text block', /Not captured/.test(qiTextBlock('Solver A Reasoning', null, { math: true })));
}

t.section('J. Copy must yield the stored source, not KaTeX output');
{
  const html = qiTextBlock('Solver A Reasoning', SOLVER_ANSWER, { math: true });
  t.ok('the raw source is preserved on the element for the copy button',
    /data-raw="/.test(html), html);
}

// ───────────────────────────────────────────────────────────────────────────
// Layout. A CSS grid `1fr` track is minmax(auto, 1fr), and its `auto` floor is
// the item's min-content contribution. Plain text wraps, so that floor is one
// word wide; a KaTeX .katex-display block does NOT wrap, so its floor is the
// full width of the equation. Putting a reasoning block inside a two-column
// grid therefore lets the solver with display math claim the track and starve
// its sibling — measured on record 98fc58d2 at a 640px drawer: columns
// resolved to 424.078px and 128.922px, leaving 109px of usable width for
// Solver B's mathematics and 1297px of hidden vertical overflow.
//
// The answers stay side by side, because comparing them is the point of the
// block. The reasonings move out and take the full width.
//
// These assertions are structural because width is a browser property this
// suite cannot measure. Real geometry is verified separately in a browser
// against deliberately ASYMMETRIC fixtures — symmetric ones cannot expose this
// class of bug at all, which is exactly why the PR #91 pass missed it.
t.section('L. Reasoning blocks must not share a grid track with each other');
{
  const qiOpenSrc = slice(MON, 'function qiOpen(i) {', '\nfunction qiClose', 'qiOpen');
  // Anchor on the solver block. qiOpen contains more than one .qi-cols — the
  // Detector V2 panel has its own, and it comes first in the source.
  const solverBlock = slice(qiOpenSrc, 'Solver A ‖ Solver B', '<div class="qi-block-t">Judge',
    'solver block');
  const cols = slice(solverBlock, '<div class="qi-cols">', '\n      </div>', 'solver qi-cols');

  t.ok('both answers are inside .qi-cols',
    /qiField\('Solver A Answer'/.test(cols) && /qiField\('Solver B Answer'/.test(cols), cols);
  t.ok('Solver A Reasoning is NOT inside .qi-cols',
    !/qiTextBlock\('Solver A Reasoning'/.test(cols), cols);
  t.ok('Solver B Reasoning is NOT inside .qi-cols',
    !/qiTextBlock\('Solver B Reasoning'/.test(cols), cols);
  t.ok('both reasoning blocks are still rendered, outside the grid',
    /qiTextBlock\('Solver A Reasoning'/.test(qiOpenSrc) &&
    /qiTextBlock\('Solver B Reasoning'/.test(qiOpenSrc), '');

  const aAt = qiOpenSrc.indexOf("qiTextBlock('Solver A Reasoning'");
  const bAt = qiOpenSrc.indexOf("qiTextBlock('Solver B Reasoning'");
  t.ok('A reasoning is rendered before B reasoning', aAt !== -1 && bAt > aAt, `${aAt} ${bAt}`);
}
{
  // Defensive: without min-width:0 a grid item cannot shrink below its
  // min-content, so ONE long unbreakable answer could re-create the starvation
  // in the answers row even after the reasonings move out.
  t.ok('.qi-cols children are allowed to shrink below min-content',
    /\.qi-cols\s*>\s*\*\s*\{[^}]*min-width:\s*0/.test(MON), 'missing .qi-cols>*{min-width:0}');
}

// ───────────────────────────────────────────────────────────────────────────
// The root cause, and the one no string-inspection test above can reach.
//
// KaTeX only typesets when something calls renderMathInElement on a live node.
// The FEEDBACK panel does this (`container.querySelectorAll('.fb-text-md')
// .forEach(el => window.renderMathInEl(el))`). qiOpen does not — it assigns
// innerHTML and stops. Emitting perfect delimiters into a subtree nobody
// typesets renders exactly nothing, so this assertion is the difference
// between the math being correct and the math being visible.
t.section('K. The drawer must run the typesetting pass after inserting HTML');
{
  // Comments stripped first. The call sits under a comment that names
  // renderMathInElement, and a bare substring test matched that prose — so
  // deleting the call left the assertion green. Verified by mutation: it now
  // goes red.
  const qiOpenSrc = slice(MON, 'function qiOpen(i) {', '\nfunction qiClose', 'qiOpen')
    .replace(/\/\/[^\n]*/g, '');
  t.ok('qiOpen writes into qiDrawerBody', /qiDrawerBody/.test(qiOpenSrc));
  t.ok('qiOpen CALLS renderMathInEl after building the drawer',
    /renderMathInEl\s*\(/.test(qiOpenSrc), 'qiOpen never typesets — math stays raw');

  const bodyAt = qiOpenSrc.indexOf('qiDrawerBody');
  const mathAt = qiOpenSrc.search(/renderMathInEl\s*\(/);
  t.ok('the typesetting pass runs AFTER the innerHTML assignment, not before',
    mathAt > bodyAt && bodyAt !== -1, `innerHTML@${bodyAt} math@${mathAt}`);
}

t.done();
