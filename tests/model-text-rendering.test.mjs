// Every model-generated string in chat.html goes through the shared renderer.
//
// The architecture inventory found four surfaces still rendering AI free-text
// with escapeHtml() alone: the hint ("Old Dragon Advice"), the concept tags,
// the detected-questions card, and the topic/subtopic/difficulty meta row.
//
// None of them was reported broken, and that is precisely why they are worth
// pinning. They worked by accident: escaping leaves LaTeX delimiters intact, and
// KaTeX auto-render picked them up because those spans sit inside the element
// passed to renderMathInEl(). But "escaped, then let KaTeX guess" is the exact
// arrangement that produced red LaTeX in Rules Used — a price like "$5 ... $2"
// or a stray \( inside a hint mis-renders the same way.
//
// One of the four was not merely exposed but genuinely broken:
// renderDetectedQuestions() never called renderMathInEl() at all, so maths in a
// worksheet's question labels never rendered anywhere.
//
// The goal these tests encode: AI -> renderInline/renderMarkdown -> KaTeX -> DOM,
// with no other route. Deterministic UI (Study Planner, taxonomy labels, static
// keyword tables) is deliberately NOT included — it is not model text.
import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';
import vm from 'node:vm';

const t = suite('model-text-rendering');

const CHAT = read('chat.html');
// The whole AI-meta building region of addAI, through to the KaTeX call.
const META = slice(CHAT, '// Build concept tags only for math messages', '// copy button', 'addAI meta blocks');
const DETECTED = slice(CHAT, 'function renderDetectedQuestions(list)', 'function addTyping()', 'detected card');

// ───────────────────────────────────────────────────────────────────────────
t.section('No model-generated field is rendered with escapeHtml alone');
for (const [label, pattern] of [
  ['hint (Old Dragon Advice)', /escapeHtml\(hint\)/],
  ['topic',                    /escapeHtml\(topic\)/],
  ['subtopic',                 /escapeHtml\(subtopic\)/],
  ['difficulty',               /escapeHtml\(difficulty\)/],
  ['concept tags',             /escapeHtml\(String\(c\)\)/],
]) {
  t.ok(`${label} no longer uses escapeHtml`, !pattern.test(META));
}
for (const [label, pattern] of [
  ['question label',   /escapeHtml\(lbl\)/],
  ['question summary', /escapeHtml\(q\.summary\)/],
]) {
  t.ok(`detected-questions ${label} no longer uses escapeHtml`, !pattern.test(DETECTED));
}

t.section('…they delegate to the shared renderer instead');
for (const [label, pattern] of [
  ['hint',        /renderInline\(hint\)/],
  ['topic',       /renderInline\(topic\)/],
  ['subtopic',    /renderInline\(subtopic\)/],
  ['difficulty',  /renderInline\(difficulty\)/],
  ['concept tag', /renderInline\(String\(c\)\)/],
]) {
  t.ok(`${label} calls renderInline`, pattern.test(META));
}
t.ok('detected-questions label calls renderInline', /renderInline\(lbl\)/.test(DETECTED));
t.ok('detected-questions summary calls renderInline', /renderInline\(q\.summary\)/.test(DETECTED));

t.section('The reference labels in the card hint are model text too');
// firstRef/lastRef are the same q.label field, quoted back inside an
// instructional sentence. Missing them would have left the claim "every
// model-generated string uses the shared renderer" false by two call sites.
t.ok('the first reference goes through renderInline', /renderInline\(String\(firstRef\)\)/.test(DETECTED));
t.ok('the last reference goes through renderInline', /renderInline\(String\(lastRef\)\)/.test(DETECTED));

t.section('HTML ATTRIBUTES must keep escapeHtml — renderInline would break them');
// The opposite failure mode, and the reason "migrate everything" is wrong:
// renderInline emits tags (<strong>, <span class="no-katex">), which inside an
// attribute value corrupts the markup and can break out of the quoting. Element
// content takes renderInline; attribute values take escapeHtml. A future edit
// that "finishes the migration" by converting these must fail here.
{
  const RES = slice(CHAT, '<div class="res-opts"', '</div>', 'resolution attrs');
  t.ok('data-topic stays escapeHtml', /data-topic="'\+escapeHtml\(topic\|\|''\)/.test(RES), RES);
  t.ok('data-sub stays escapeHtml',   /data-sub="'\+escapeHtml\(subtopic\|\|''\)/.test(RES), RES);
  t.ok('no renderInline inside an attribute value', !/="'\+renderInline/.test(CHAT));
}

t.section('The detected-questions card completes the pipeline');
// It built its element and appended it without ever invoking KaTeX, so maths in
// a worksheet index rendered as literal \( … \). Delegating to renderInline
// alone would not have fixed that — renderInline emits delimiters for KaTeX to
// pick up, and nothing was picking them up.
t.ok('renderDetectedQuestions now runs KaTeX over its element',
  /renderMathInEl\(el\)/.test(DETECTED), DETECTED.slice(-400));

// ───────────────────────────────────────────────────────────────────────────
t.section('The detected card, executed');
{
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(read('chat-renderer.js'), sandbox);
  const built = [];
  let katexCalls = 0;
  vm.runInContext(`
    var renderInline = window.renderInline;
    var renderMathInEl = function () { __katex(); };
    var PROF = 'zero.png';
    var escapeHtml = function (s) { return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    var scrollDown = function () {};
    var inner = { appendChild: function (el) { __built(el.innerHTML); } };
    var document = { createElement: function () { return { className: '', innerHTML: '' }; } };
    ${DETECTED}
    window.__render = renderDetectedQuestions;
  `, Object.assign(sandbox, { __built: (h) => built.push(h), __katex: () => { katexCalls++; } }));
  const render = sandbox.window.__render;

  render([
    { index: 1, label: 'Q1', summary: ' — solve \\( x^2 + 1 = 0 \\)' },
    { index: 2, label: 'Q2', summary: ' — the price is $5 and $2' },
  ]);
  const html = built[0] || '';
  t.is('KaTeX ran over the card exactly once', katexCalls, 1);
  t.ok('the question label is present', /Q1/.test(html), html);
  t.ok('the maths in a summary survives intact for KaTeX',
    html.includes('\\( x^2 + 1 = 0 \\)'), html);
  t.ok('a price in a summary is neutralised, not offered to KaTeX as maths',
    /no-katex/.test(html), html);
  t.ok('no placeholder leaks', !/\x01/.test(html), JSON.stringify(html));
}
{
  // Escaping must survive the migration — renderInline escapes, escapeHtml did.
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(read('chat-renderer.js'), sandbox);
  const built = [];
  vm.runInContext(`
    var renderInline = window.renderInline;
    var renderMathInEl = function () {};
    var PROF = 'zero.png';
    var escapeHtml = function (s) { return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    var scrollDown = function () {};
    var inner = { appendChild: function (el) { __built(el.innerHTML); } };
    var document = { createElement: function () { return { className: '', innerHTML: '' }; } };
    ${DETECTED}
    window.__render = renderDetectedQuestions;
  `, Object.assign(sandbox, { __built: (h) => built.push(h) }));
  sandbox.window.__render([
    { index: 1, label: '<img src=x onerror=alert(1)>', summary: '<script>alert(1)</script>' },
    { index: 2, label: 'Q2' },
  ]);
  const html = built[0] || '';
  // Two traps here, both hit while writing this. The card's own avatar is an
  // <img>, so a bare /<img/ check can never pass; and once the payload IS
  // escaped its text still contains the substring "onerror=", inert, inside
  // &lt;…&gt;. So assert on the only thing that matters: no LIVE tag, and the
  // payload present in escaped form.
  t.ok('XSS via a question label is escaped, not injected',
    html.includes('&lt;img src=x onerror=') &&
    !/<img src=x/.test(html) && !/<script/i.test(html), html);
}

// ───────────────────────────────────────────────────────────────────────────
t.section('Deterministic UI is deliberately NOT migrated');
// Scope guard in both directions. These are not model output, so routing them
// through a maths renderer would be wrong, not merely unnecessary — and a future
// edit that "finishes the job" by migrating them should fail here instead.
{
  const PLAN = slice(CHAT, 'function renderStudyPlan(plan, meta)', 'async function getStudyAvailability', 'study plan');
  t.ok('the Study Planner card still escapes rather than rendering maths',
    !/renderInline|renderMarkdown/.test(PLAN));
  t.ok('and still does not invoke KaTeX', !/renderMathInEl/.test(PLAN));
}
{
  const SIG = slice(CHAT, '// concept tags', '// signal strength', 'signal engine tags');
  t.ok('SignalEngine concept tags (a static keyword table) are untouched',
    !/renderInline/.test(SIG));
}

t.done();
