// "Rules Used" in chat.html — one math authority, not two.
//
// Regression target. normalizeRuleFormula() carried its own idea of what math
// looks like:
//
//     if (s.indexOf('$') !== -1) return escapeHtml(s);   // has $ -> leave alone
//     return '$' + escapeHtml(s) + '$';                  // otherwise wrap
//
// It guarded for `$` and never for `\(` or `\[`, so a model formula of
// `\( p/q \)` — which contains no `$` — was wrapped into `$\( p/q \)$`. KaTeX
// then matched the outer $…$ and failed on the inner delimiter with
// "Can't use function '\(' in math mode", printing the source in red. The
// student saw literal `\( p/q \)`.
//
// That is the SAME class of defect as the four-pass placeholder bug in
// chat-renderer.js, in a second place, for the same reason: more than one piece
// of code deciding what counts as math. The fix removes the duplicate rather
// than teaching it about two more delimiters, so the class cannot recur here.
//
// These tests execute the REAL helpers and the REAL rules-block builder sliced
// out of chat.html, against the REAL shared renderer.
import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';
import vm from 'node:vm';

const t = suite('rules-rendering');

const CHAT = read('chat.html');
const HELPERS = slice(CHAT, 'function escapeHtml(s)',
  '// Markdown + KaTeX rendering moved to chat-renderer.js', 'rule helpers');
const BUILDER = slice(CHAT, '    // Build Rules Used block ONLY if the Edge Function returned rules',
  '    // Optional difficulty meta tag', 'rules block builder');

// Shared renderer first, then chat.html's helpers on top — the load order the
// page itself uses (chat-renderer.js is a <script> above the inline code).
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(read('chat-renderer.js'), sandbox);
vm.runInContext(`
  var renderMarkdown = window.renderMarkdown, renderInline = window.renderInline,
      renderMathInEl = window.renderMathInEl;
  ${HELPERS}
  window.__buildRules = function (rules) { ${BUILDER} return rulesBlock; };
  window.__formula = typeof normalizeRuleFormula === 'function' ? normalizeRuleFormula : null;
`, sandbox);
const buildRules = sandbox.window.__buildRules;
const formula = sandbox.window.__formula;

/** The math regions KaTeX auto-render would find in the built block. */
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
const rule = (o) => buildRules([o]);

// ───────────────────────────────────────────────────────────────────────────
t.section('The reported defect: a delimited formula must not be re-wrapped');
{
  const html = rule({ name: 'Rational Root Theorem', formula: '\\( p/q \\)' });
  t.ok('the block no longer contains $\\( … \\)$', !/\$\\\(/.test(html), html);
  t.is('KaTeX is offered exactly the expression the model wrote',
    katexMath(html), [' p/q ']);
}
{
  const html = rule({ name: 'Quadratic', formula: '\\( ax^2 + bx + c = 0 \\)' });
  t.is('a full \\(…\\) formula reaches KaTeX intact',
    katexMath(html), [' ax^2 + bx + c = 0 ']);
}
{
  const html = rule({ name: 'Sum', formula: '\\[ \\sum_{i=1}^{n} i \\]' });
  t.is('a display \\[…\\] formula reaches KaTeX intact',
    katexMath(html), [' \\sum_{i=1}^{n} i ']);
}

t.section('Behaviour that already worked is preserved');
{
  const html = rule({ name: 'Quadratic', formula: 'ax^2 + bx + c = 0' });
  t.is('a bare formula is still treated as one expression',
    katexMath(html), ['ax^2 + bx + c = 0']);
}
{
  const html = rule({ name: 'Quadratic', formula: '$ax^2 + bx + c = 0$' });
  t.is('a $-delimited formula is still passed through once',
    katexMath(html), ['ax^2 + bx + c = 0']);
}
{
  const html = rule({ name: 'Root', formula: 'sqrt(x+1)' });
  t.ok('plain-text sqrt() is still converted to LaTeX', /\\sqrt\{x\+1\}/.test(html), html);
}
{
  const html = rule({ name: 'Bound', formula: 'x <= 5' });
  t.ok('plain-text <= is still converted to \\le', /\\le/.test(html), html);
  t.ok('and no raw < survives into the HTML', !/[^&]<=/.test(html), html);
}
{
  const html = rule({ name: 'Circle', formula: 'A = pi r^2' });
  t.ok('bare greek words are still converted', /\\pi/.test(html), html);
}
{
  const html = rule({ name: 'Rational Root', formula: '\\( p/q \\)',
    desc: 'Where \\( p \\) divides the constant and \\( q \\) divides the leading coefficient.' });
  t.is('a description keeps its inline math', katexMath(html), [' p/q ', ' p ', ' q ']);
}
{
  const html = buildRules(['\\( p/q \\) is the candidate root']);
  t.is('legacy plain-string rules still render their math', katexMath(html), [' p/q ']);
}
{
  t.is('an empty rules array produces no block', buildRules([]), '');
  t.ok('a rule with no name is skipped', !/rule-item/.test(buildRules([{ formula: 'x' }])));
}
{
  const html = rule({ name: 'A', formula: 'x', desc: 'y' });
  t.ok('the UI structure is unchanged: head, count, body, item, icon',
    /rules-used-head/.test(html) && /ru-count/.test(html) && /rules-used-body collapsed/.test(html) &&
    /rule-item/.test(html) && /rule-icon/.test(html) && /rule-text/.test(html), html);
  t.ok('formula and desc keep their spans', /class="rule-formula"/.test(html) && /class="rule-desc"/.test(html));
  t.ok('no block-level wrapper leaked into the inline spans', !/<p[ >]|ai-md/.test(html), html);
}

t.section('The math-processing class of bug cannot recur here');
{
  const html = rule({ name: 'Price', formula: '\\( p \\)', desc: 'The book costs $5 and the pen costs $2.' });
  t.is('currency in a description is not mis-paired as math', katexMath(html), [' p ']);
}
{
  const html = rule({ name: 'X', desc: 'An unbalanced \\( opener and then \\( x \\) later.' });
  t.is('an unbalanced opener in a description cannot swallow the real math',
    katexMath(html), [' x ']);
}
{
  const html = rule({ name: 'X', formula: '\\( a $$b$$ c \\)', desc: 'and \\( d $$e$$ f \\)' });
  t.ok('no placeholder leaks from either field', !/\x01/.test(html), JSON.stringify(html));
}
for (const [label, payload] of [
  ['formula', { name: 'X', formula: '$<img src=x onerror=alert(1)>$' }],
  ['desc',    { name: 'X', desc: '<img src=x onerror=alert(1)>' }],
  ['name',    { name: '<img src=x onerror=alert(1)>' }],
]) {
  const html = rule(payload);
  t.ok(`XSS via ${label}: no live markup`, !/<img/i.test(html) && !/<script/i.test(html), html);
}

t.section('There is one math authority, and chat.html is not it');
// The guard that makes the choice stick. If a future edit reintroduces
// delimiter-guessing in chat.html, this fails rather than waiting for a student
// to report red LaTeX in some third component.
{
  const helpers = HELPERS;
  t.ok('normalizeRuleFormula no longer wraps a string in $…$ itself',
    !/'\$'\s*\+/.test(helpers) && !/\+\s*'\$'/.test(helpers), helpers.slice(0, 400));
  t.ok('and no longer guesses from the presence of a $',
    !/indexOf\('\$'\)/.test(helpers));
  t.ok('the rules path delegates to the shared renderer',
    /renderInline\s*\(/.test(helpers), helpers.slice(0, 400));
}
{
  // chat-renderer.js must remain the only file that tokenises math delimiters.
  const others = ['chat.html', 'ai-monitor.html'];
  const offenders = others.filter(f => /\\\\\[\[\\s\\S\]\*\?\\\\\]|delimiters:\s*\[/.test(read(f)));
  t.is('no page carries its own delimiter table', offenders, []);
}

t.done();
