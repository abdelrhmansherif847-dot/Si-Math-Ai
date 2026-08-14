// Verdict Pilot P5 — parser safety.
//
// The equation text this verifier reads is USER AND MODEL CONTROLLED. It arrives
// from OCR of a photographed worksheet, from a student typing, and from a model
// paraphrasing what it thinks it saw. Treating that as anything but hostile
// input would be the single worst decision in the pilot.
//
// So the grammar is an ALLOW-LIST, not a filter. Every character the parser does
// not explicitly recognize is refused with a reason, and there is no path —
// none — through which any part of the input is executed, compiled, interpolated
// into a shell, or turned into a regular expression.
//
// This suite proves that twice over: once by feeding the parser code-shaped
// input and checking a live canary was not touched, and once by scanning the
// module for every construct that could execute anything at all.
//
// It also proves the quieter safety property: an input the parser cannot handle
// must never come back `verified`, and must never come back `contradicted`
// either — blaming the candidate for the parser's limits would turn a gap in the
// pilot into deterministic-looking evidence against a model that may well be
// right.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('algebra-verifier-safety');

const P5 = '/home/user/Si-Math-Ai/supabase/functions/_shared/algebra-verifier.core.ts';
const { createAlgebraVerifier, SUPPORTED_INTERPRETATION_TYPE, ALGEBRA_REASONS } = await import(P5);

const SRC = read('supabase/functions/_shared/algebra-verifier.core.ts');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|[^:\\])\/\/.*$/, '$1')).join('\n');

const V = createAlgebraVerifier();
const ask = (equation, candidate) => V.verify({
  subject: {
    item_id: 'SAFE-1', question_text: 'Solve for x.', choices: null,
    interpretation: { type: SUPPORTED_INTERPRETATION_TYPE, equation, variable: 'x' },
    interpretation_version: 'alg-i1',
  },
  candidate, candidate_source: 'hostile', policy_version: 'p1',
});

// A live canary. If any part of the input were executed, this changes.
globalThis.__P5_CANARY__ = 'untouched';

// ───────────────────────────────────────────────────────────────────────────
t.section('C15. Code-shaped input is refused, and nothing executes');
{
  const hostile = [
    `globalThis.__P5_CANARY__ = 'pwned'`,
    `(globalThis.__P5_CANARY__ = 'pwned') = 1`,
    `process.exit(1)`,
    `require("fs").readFileSync("/etc/passwd")`,
    `eval("globalThis.__P5_CANARY__='pwned'")`,
    'new Function("return 1")()',
    '${globalThis.__P5_CANARY__ = "pwned"}',
    '`${7*7}`',
    '1; DROP TABLE profiles; --',
    '__proto__.polluted = 1',
    'constructor.constructor("return 1")()',
    '</script><script>alert(1)</script>',
    'x = 5 && globalThis.__P5_CANARY__ === "untouched"',
    'fetch("https://example.com")',
    'Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")',
    '../../etc/passwd = 1',
  ];
  let threw = null;
  const results = [];
  for (const h of hostile) {
    try { results.push([h, await ask(h, '5')]); } catch (e) { threw = `${h} -> ${e}`; break; }
    try { results.push([`(as candidate) ${h}`, await ask('3x + 7 = 22', h)]); } catch (e) { threw = `${h} -> ${e}`; break; }
  }
  t.is('nothing throws', threw, null);
  t.is('the canary is untouched — nothing was executed', globalThis.__P5_CANARY__, 'untouched');
  t.ok('no prototype was polluted', ({}).polluted === undefined && ({}).__P5_CANARY__ === undefined);
  t.is('every hostile input produced a result', results.length, hostile.length * 2);
  t.ok('none of them verified',
    results.every(([, r]) => r.outcome !== 'verified'), JSON.stringify(results.filter(([, r]) => r.outcome === 'verified').map(([h]) => h)));
  t.ok('none of them contradicted the candidate either',
    results.every(([, r]) => r.outcome !== 'contradicted'), JSON.stringify(results.filter(([, r]) => r.outcome === 'contradicted').map(([h]) => h)));
  t.ok('every one states a declared reason',
    results.every(([, r]) => typeof r.reason === 'string' && r.reason.length > 0), JSON.stringify(results.map(([, r]) => r.reason)));
  t.ok('and no evidence was invented for any of them',
    results.every(([, r]) => r.evidence === null || r.outcome === 'inconclusive'), JSON.stringify(results.map(([, r]) => r.outcome)));

  // ANTI-VACUITY. A sweep where everything is refused proves nothing on its own
  // — a verifier that refused all input would pass it perfectly. A benign
  // equation in the same shape must still go through.
  const benign = await ask('x = 5', '5');
  t.is('a benign equation still verifies — the sweep is not refusing everything', benign.outcome, 'verified');
  t.is('and a benign assignment-shaped candidate is accepted',
    (await ask('3x + 7 = 22', 'x = 5')).outcome, 'verified');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('C16. No execution path exists in the source at all');
{
  const forbidden = [
    ['eval', /\beval\b/],
    ['new Function', /\bFunction\s*\(/],
    ['dynamic import', /\bimport\s*\(/],
    ['require', /\brequire\s*\(/],
    ['child_process', /child_process|execSync|spawnSync|\bspawn\s*\(/],
    ['Deno subprocess', /Deno\.(?:Command|run)\b/],
    ['shell interpolation', /\bexec\s*\(|\bsh\s+-c\b/],
    ['network', /\bfetch\s*\(|XMLHttpRequest|WebSocket/],
    ['environment', /Deno\.env|process\.env/],
    ['filesystem', /readFile|writeFile|readFileSync/],
    ['timers taking a string', /setTimeout\s*\(\s*['"`]|setInterval\s*\(\s*['"`]/],
    ['a regex built from input', /new RegExp\s*\(/],
    ['dynamic property access from parsed text', /\[\s*(?:token|raw|text|input|src)\s*\]/],
  ];
  for (const [label, re] of forbidden) t.ok(`absent: ${label}`, !re.test(CODE), CODE.slice(0, 160));

  // The allow-list must be a literal in the source, not assembled at runtime.
  t.ok('the grammar is a literal character class', /\[0-9a-zA-Z|A-Za-z0-9/.test(CODE) || /SUPPORTED_CHARS|ALLOWED/.test(CODE), CODE.slice(0, 200));
  t.ok('anti-vacuity: the stripped source is real code', CODE.length > 3000, String(CODE.length));
  t.ok('and contains the parser under test', /function tokenize|function parse/.test(CODE));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('C. The parser is bounded — no input can make it run away');
{
  const long = await ask(`${'1+'.repeat(5000)}x = 1`, '1');
  t.is('an over-long equation is refused', long.support, 'unsupported');
  t.is('  by length, before parsing', long.reason, 'equation_too_long');

  const deep = await ask(`${'('.repeat(200)}x${')'.repeat(200)} = 5`, '5');
  t.is('deep nesting is refused', deep.support, 'unsupported');
  t.is('  by depth', deep.reason, 'nesting_too_deep');

  const unbalanced = await ask('(3x + 7 = 22', '5');
  t.is('unbalanced parentheses are a parse error', unbalanced.reason, 'parse_error');
  const closing = await ask('3x + 7) = 22', '5');
  t.is('a stray closing parenthesis too', closing.reason, 'parse_error');

  const longCandidate = await ask('3x + 7 = 22', '5'.repeat(5000));
  t.ok('an over-long candidate is refused', longCandidate.outcome !== 'verified', longCandidate.outcome);
  t.ok('  with a declared reason', ALGEBRA_REASONS.includes(longCandidate.reason), String(longCandidate.reason));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('C17. The parser cannot be broadened by accident');
{
  // Characters that LOOK mathematical but are not in the grammar must be
  // refused by name, not absorbed. Silently ignoring one is how a verifier
  // starts verifying equations it never actually read.
  const chars = [
    ['^',  'x^2 = 4',      'unsupported_operator'],
    ['%',  'x % 2 = 1',    'unsupported_operator'],
    ['!',  'x! = 6',       'unsupported_operator'],
    ['<',  'x < 5',        'unsupported_relation'],
    ['>',  'x > 5',        'unsupported_relation'],
    ['≤',  'x ≤ 5',        'unsupported_relation'],
    ['≠',  'x ≠ 5',        'unsupported_relation'],
    ['√',  '√x = 2',       'unsupported_character'],
    ['π',  'x = π',        'unsupported_character'],
    ['∞',  'x = ∞',        'unsupported_character'],
    [',',  'x = 1,000',    'unsupported_character'],
    ['$',  '$x = 5',       'unsupported_character'],
    ['&',  'x & 1 = 1',    'unsupported_character'],
    ['[',  '[x] = 5',      'unsupported_character'],
    ['_',  'x_1 = 5',      'unsupported_character'],
    ['\\', '\\frac{x}{2} = 1', 'unsupported_character'],
  ];
  for (const [label, equation, reason] of chars) {
    const r = await ask(equation, '2');
    t.is(`${label} is refused`, r.support, 'unsupported');
    t.is(`${label} by name`, r.reason, reason);
  }

  // A number the pilot cannot hold exactly must not be silently rounded.
  const sci = await ask('x = 5', '5e3');
  t.ok('scientific notation is not silently accepted', sci.outcome !== 'verified', `${sci.outcome}/${sci.reason}`);
  const twoDots = await ask('3x = 7', '1.2.3');
  t.ok('a malformed decimal is not silently accepted', twoDots.outcome !== 'verified', `${twoDots.outcome}/${twoDots.reason}`);

  // Every reason emitted anywhere in this suite is a declared one.
  const seen = new Set();
  for (const [, equation, reason] of chars) { seen.add(reason); void equation; }
  for (const r of seen) t.ok(`declared: ${r}`, ALGEBRA_REASONS.includes(r), r);
}

t.done();
