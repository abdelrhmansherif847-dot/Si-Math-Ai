// Verdict Pilot P4 — the deterministic verifier contract.
//
// P4 defines HOW a future deterministic mathematics tool supplies evidence. It
// does not supply any. There is no SymPy, no CAS, no Python, no subprocess and
// no external service here — only the contract those will implement, plus a
// table-lookup stub that performs no mathematics whatsoever and exists solely to
// prove the contract carries the shape.
//
// THE SENTENCE THE WHOLE PHASE TURNS ON
// ────────────────────────────────────
// A verifier reporting `verified` means ONE DETERMINISTIC CHECK SUCCEEDED FOR
// ONE CANDIDATE. It does not mean the item's verdict is VERIFIED. Those are
// different words in different modules on purpose: the lowercase outcome lives
// here, the uppercase verdict state lives in verdict-state.core.ts, and this
// module does not import it — so a verifier cannot name a verdict even by
// accident. §V9 asserts that.
//
// FIVE STATES, AND `unsupported` IS NOT ONE OF THE SUCCESSES
// ──────────────────────────────────────────────────────────
// supported/unsupported is a separate axis from the outcome, because the
// dangerous failure is a verifier that could not run being read as a verifier
// that agreed. buildVerificationResult enforces the invariant rather than
// documenting it: unsupported forces `not_attempted` and a reason, and no path
// through the constructor can turn an absent check into `verified`.
//
// INDEPENDENCE, ENFORCED BY THE TYPE
// ──────────────────────────────────
// The request carries the question and the candidate. There is no field for
// peer model outputs, engine count or agreement statistics, so a verifier
// cannot be contaminated by what the models said — which is precisely what
// makes "the verifier contradicts unanimous models" meaningful evidence rather
// than an echo. A later phase wanting that must add a parameter in the open.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('deterministic-verifier');

const P4V = '/home/user/Si-Math-Ai/supabase/functions/_shared/deterministic-verifier.core.ts';
const {
  VERIFIER_OUTCOMES, VERIFIER_SUPPORT,
  canonicalizeText, canonicalizeAnswer,
  buildVerificationResult, createTableVerifier,
} = await import(P4V);

const SRC = read('supabase/functions/_shared/deterministic-verifier.core.ts');
// Strip comments before every negative scan. A negative regex run over raw
// source matches the module's own explanatory prose and reports a false green —
// which has happened once per phase in this pilot. The two anchors below make a
// vacuous pass impossible: if stripping ever eats the code, they go red.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|[^:\\])\/\/.*$/, '$1')).join('\n');

const IDENT = { verifier_id: 'table-stub', version: 'v1', method: 'fixture_table_lookup' };
const subject = (over) => ({
  item_id: 'Q79',
  question_text: 'How many integer values of n satisfy |n - 1| < 4 ?',
  choices: ['6', '7', '8', '9'],
  interpretation: null,
  interpretation_version: null,
  ...(over ?? {}),
});
const request = (over) => ({
  subject: subject(over && over.subject),
  candidate: '7',
  candidate_source: 'engine_alpha',
  policy_version: 'p1',
  ...(over ?? {}),
  ...(over && over.subject ? { subject: subject(over.subject) } : {}),
});

const TABLE = [
  { item_id: 'Q79', candidate: '7', outcome: 'contradicted', evidence: { checked: '|n-1|<4', enumerated: 7, expected: '6' } },
  { item_id: 'Q79', candidate: '6', outcome: 'verified', evidence: { checked: '|n-1|<4', enumerated: 6 } },
  { item_id: 'PROSE-1', candidate: '12', outcome: 'inconclusive', reason: 'ambiguous_problem_statement' },
];
const SUPPORTED = ['Q79', 'PROSE-1', 'UNANIMOUS-WRONG-1', 'SWEEP-1'];
const V = createTableVerifier(IDENT, TABLE, { supported_items: SUPPORTED });

// ───────────────────────────────────────────────────────────────────────────
t.section('V1. Contract shape — a verifier is substitutable and its result is total');
{
  t.is('the outcome vocabulary is exactly the five required states plus not_attempted',
    VERIFIER_OUTCOMES,
    ['verified', 'contradicted', 'inconclusive', 'insufficient_information', 'not_attempted']);
  t.is('support is a separate two-value axis', VERIFIER_SUPPORT, ['supported', 'unsupported']);

  t.ok('a verifier carries an identity', V.identity && typeof V.identity.verifier_id === 'string');
  t.ok('and a verify() entry point', typeof V.verify === 'function');
  t.ok('verify takes exactly one argument — the request', V.verify.length <= 1, String(V.verify.length));

  const r = await V.verify(request());
  const keys = Object.keys(r).sort();
  t.is('the result shape is fixed and complete', keys,
    ['candidate', 'candidate_source', 'evidence', 'method', 'outcome', 'policy_version',
      'reason', 'subject', 'support', 'verifier'].sort());
  t.ok('the result is a plain object, not a class instance',
    Object.getPrototypeOf(r) === Object.prototype);
}

// ───────────────────────────────────────────────────────────────────────────
t.section('V2. A supported verification returns deterministic evidence');
{
  const r = await V.verify(request({ candidate: '6' }));
  t.is('support is stated', r.support, 'supported');
  t.is('the outcome is stated', r.outcome, 'verified');
  t.is('the deterministic result is preserved verbatim', r.evidence,
    { checked: '|n-1|<4', enumerated: 6 });
  t.is('the method that produced it is named', r.method, 'fixture_table_lookup');
  t.is('a decisive outcome needs no excuse', r.reason, null);

  const c = await V.verify(request({ candidate: '7' }));
  t.is('a contradiction is equally explicit', c.outcome, 'contradicted');
  t.ok('and carries its own evidence', c.evidence && c.evidence.expected === '6', JSON.stringify(c.evidence));
  t.is('contradiction is still `supported` — the check ran', c.support, 'supported');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('V3. Unsupported is explicit, and can never read as success');
{
  const r = await V.verify(request({ subject: { item_id: 'NOANSWER-1' } }));
  t.is('support is stated as unsupported', r.support, 'unsupported');
  t.is('the outcome is not_attempted — never verified', r.outcome, 'not_attempted');
  t.ok('with a reason', typeof r.reason === 'string' && r.reason.length > 0, String(r.reason));
  t.is('and no evidence is invented', r.evidence, null);

  // The invariant is enforced, not merely observed: a verifier that reports
  // BOTH unsupported and verified is corrected by the constructor, because the
  // absent check is the fact and the claim is not.
  const forced = buildVerificationResult(IDENT, request(), { support: 'unsupported', outcome: 'verified', evidence: { any: 1 } });
  t.is('an unsupported verifier claiming `verified` is corrected', forced.outcome, 'not_attempted');
  t.is('its claimed evidence is dropped', forced.evidence, null);
  t.ok('and the correction is recorded as a reason', /unsupported/.test(String(forced.reason)), String(forced.reason));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('V4. Inconclusive is explicit, and is not a quiet success');
{
  const r = await V.verify(request({ subject: { item_id: 'PROSE-1', choices: null }, candidate: '12' }));
  t.is('the outcome is inconclusive', r.outcome, 'inconclusive');
  t.is('the check was supported — it ran and did not conclude', r.support, 'supported');
  t.is('and it says why', r.reason, 'ambiguous_problem_statement');

  // A supported verifier that reports nothing is inconclusive. Silence must
  // never fall through to `verified` — that is the whole failure mode.
  const silent = buildVerificationResult(IDENT, request(), { support: 'supported' });
  t.is('a supported verifier reporting no outcome is inconclusive', silent.outcome, 'inconclusive');
  t.ok('with a stated reason', /no_outcome/.test(String(silent.reason)), String(silent.reason));

  const nonsense = buildVerificationResult(IDENT, request(), { support: 'supported', outcome: 'probably_right' });
  t.is('an unrecognized outcome is inconclusive, never verified', nonsense.outcome, 'inconclusive');
  t.ok('and says the outcome was not recognized',
    /unrecognized/.test(String(nonsense.reason)), String(nonsense.reason));

  const miss = await V.verify(request({ subject: { item_id: 'SWEEP-1', choices: ['10', '11', '12', '13'] }, candidate: '11' }));
  t.is('a supported item with nothing to look up is inconclusive', miss.outcome, 'inconclusive');
  t.ok('and names the gap', /no_table_entry/.test(String(miss.reason)), String(miss.reason));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('V5. Insufficient information is explicit');
{
  const r = await V.verify(request({ candidate: null }));
  t.is('no candidate means nothing could be checked', r.outcome, 'insufficient_information');
  t.ok('and it says so', /candidate/.test(String(r.reason)), String(r.reason));
  t.is('no evidence is fabricated', r.evidence, null);

  const blank = await V.verify(request({ candidate: '   ' }));
  t.is('a blank candidate is treated the same', blank.outcome, 'insufficient_information');

  const noq = buildVerificationResult(IDENT, request({ subject: { question_text: '' } }), { support: 'supported', outcome: 'verified' });
  t.is('an empty subject means insufficient information, not verified', noq.outcome, 'insufficient_information');
  t.ok('with a reason naming the missing input',
    /subject|question/.test(String(noq.reason)), String(noq.reason));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('V6. Every required provenance fact survives');
{
  const r = await V.verify(request());
  t.is('verifier identity', r.verifier.verifier_id, 'table-stub');
  t.is('verifier version', r.verifier.version, 'v1');
  t.is('declared method', r.verifier.method, 'fixture_table_lookup');
  t.is('the candidate that was checked', r.candidate, '7');
  t.is('where the candidate came from', r.candidate_source, 'engine_alpha');
  t.is('the policy/schema version in force', r.policy_version, 'p1');
  t.is('the item identity', r.subject.item_id, 'Q79');
  t.is('the canonical question that was verified against',
    r.subject.question_text_canonical, canonicalizeText(subject().question_text));
  t.is('the choices as they were presented', r.subject.choices_canonical, ['6', '7', '8', '9']);
  t.is('whether a structured interpretation existed', r.subject.interpretation_present, false);
  t.is('and its version when one does', r.subject.interpretation_version, null);

  const withInterp = await V.verify(request({
    subject: { interpretation: { form: 'abs_inequality', lhs: 'n-1', bound: 4 }, interpretation_version: 'i2' },
  }));
  t.is('a structured interpretation is recorded as present', withInterp.subject.interpretation_present, true);
  t.is('with its version', withInterp.subject.interpretation_version, 'i2');

  // Provenance is not optional. Every field above must be non-undefined even on
  // the paths where verification did not happen, or a caller reading an
  // unsupported result cannot tell what was not checked.
  const un = await V.verify(request({ subject: { item_id: 'NOANSWER-1' } }));
  for (const k of ['verifier', 'candidate', 'candidate_source', 'policy_version', 'subject', 'method']) {
    t.ok(`preserved on the unsupported path: ${k}`, un[k] !== undefined, JSON.stringify(un[k]));
  }
  t.is('including the verifier version', un.verifier.version, 'v1');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('V7. Same inputs, byte-identical result');
{
  const a = JSON.stringify(await V.verify(request()));
  const b = JSON.stringify(await V.verify(request()));
  t.is('two runs agree byte for byte', a, b);

  const V2 = createTableVerifier(IDENT, TABLE, { supported_items: SUPPORTED });
  const c = JSON.stringify(await V2.verify(request()));
  t.is('a freshly constructed verifier agrees too', a, c);

  t.ok('no clock', !/Date\.now|new Date|performance\.now/.test(CODE), CODE.slice(0, 200));
  t.ok('no randomness', !/Math\.random|crypto\.getRandomValues|randomUUID/.test(CODE), CODE.slice(0, 200));
  t.ok('no I/O or network', !/fetch\(|XMLHttpRequest|WebSocket|Deno\.(?:readFile|writeFile|run|Command)/.test(CODE));
  t.ok('no environment read', !/Deno\.env|process\.env/.test(CODE), CODE.slice(0, 200));

  // Canonicalization is deterministic and case-aware in the right direction: a
  // question's identity is NOT case-insensitive (X and x can be different
  // variables), while an answer's literal comparison is.
  t.is('question canonicalization collapses whitespace only', canonicalizeText('  a   B \n c '), 'a B c');
  t.is('and preserves case', canonicalizeText('X + x'), 'X + x');
  t.is('answer canonicalization folds case and trailing stops', canonicalizeAnswer(' Seven. '), 'seven');
  t.is('canonicalization is idempotent', canonicalizeText(canonicalizeText(' a  b ')), canonicalizeText(' a  b '));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('V8. Independence — a verifier cannot see what the models said');
{
  const r = await V.verify(request());
  const json = JSON.stringify(r);
  t.ok('no engine identity leaks into the result beyond the named candidate source',
    !/engine_beta|engine_gamma|engine_delta/.test(json), json.slice(0, 200));

  // Enforced by the type, not by discipline: there is no request field through
  // which peer outputs, an engine count or agreement statistics could arrive.
  t.ok('the request type declares no peer-output channel',
    !/peer_?outputs?|other_?answers?|submissions|model_?outputs?|engine_?count|agreement/i.test(CODE),
    CODE.slice(0, 300));
  t.ok('and the module never imports the evidence layers',
    !/evidence(-builder)?\.core|disagreement\.core/.test(CODE), CODE.slice(0, 200));

  // Passing peers anyway changes nothing — an undeclared field is not read.
  const withPeers = { ...request(), peer_outputs: [{ engine: 'x', answer: '999' }], engine_count: 5 };
  t.is('an undeclared peer field is ignored entirely',
    JSON.stringify(await V.verify(withPeers)), JSON.stringify(await V.verify(request())));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('V9. No verdict, no confidence, no winner — the vocabulary is absent');
{
  const r = await V.verify(request({ candidate: '6' }));
  const keys = new Set(Object.keys(r).concat(Object.keys(r.subject)));
  t.ok('no verdict-bearing key on the result',
    ![...keys].some((k) => /verdict|confidence|score|winner|truth|authoritative|final/i.test(k)),
    [...keys].join(','));

  // Case matters here, and deliberately: the lowercase outcome `verified` is
  // this module's, the uppercase verdict state VERIFIED belongs to another. A
  // verifier that cannot name a verdict cannot assign one.
  t.ok('the uppercase verdict vocabulary appears nowhere',
    !/\bVERIFIED\b|HIGH_CONFIDENCE|LOW_CONFIDENCE|ITEM_DISPUTED|\bAMBIGUOUS\b|INSUFFICIENT_INFORMATION/.test(CODE),
    CODE.slice(0, 200));
  t.ok('the verdict module is not imported', !/verdict-state/.test(CODE), CODE.slice(0, 200));
  t.ok('no confidence arithmetic', !/confidence|probability|likelihood|weight/i.test(CODE), CODE.slice(0, 200));
  t.ok('no voting', !/majority|vote|voting|consensus|quorum/i.test(CODE), CODE.slice(0, 200));
  t.ok('no winner selection', !/winner|select_?best|pick_?answer|override/i.test(CODE), CODE.slice(0, 200));
  t.ok('no routing, escalation or cost policy', !/escalat|routing|route\(|budget|latency|\bcost\b/i.test(CODE), CODE.slice(0, 200));
  t.ok('no ranking of verifiers or models', !/rank|leaderboard|best_?model|accuracy/i.test(CODE), CODE.slice(0, 200));

  // And no real provider or CAS has crept in under the contract.
  t.ok('no provider names', !/openai|anthropic|gemini|kimi|claude|gpt-|deepseek|mistral/i.test(CODE), CODE.slice(0, 200));
  t.ok('no CAS or subprocess implementation', !/sympy|wolfram|docker|child_process|subprocess|python/i.test(CODE), CODE.slice(0, 200));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('V10. Total — malformed input is recorded, never thrown');
{
  const bad = [null, undefined, {}, { subject: null, candidate: null }, { subject: { question_text: 5 }, candidate: 7 }];
  let threw = null;
  const outs = [];
  for (const b of bad) {
    try { outs.push(await V.verify(b)); } catch (e) { threw = String(e); break; }
  }
  t.is('nothing throws', threw, null);
  t.is('every malformed request still yields a result', outs.length, bad.length);
  t.ok('and none of them is `verified`',
    outs.every((o) => o.outcome !== 'verified'), JSON.stringify(outs.map((o) => o.outcome)));
  t.ok('every one states a reason',
    outs.every((o) => typeof o.reason === 'string' && o.reason.length > 0),
    JSON.stringify(outs.map((o) => o.reason)));
  t.is('canonicalization tolerates non-strings', canonicalizeText(null), '');
  t.is('and so does answer canonicalization', canonicalizeAnswer(undefined), '');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('V11. Offline and unreachable from production');
{
  const INDEX = read('supabase/functions/ai-tutor/index.ts');
  const VC = read('supabase/functions/_shared/verification.core.ts');
  const TC = read('supabase/functions/_shared/telemetry.core.ts');
  t.ok('index.ts does not import the verifier contract', !/deterministic-verifier/.test(INDEX));
  t.ok('verification.core.ts does not either', !/deterministic-verifier/.test(VC));
  t.ok('telemetry.core.ts does not either', !/deterministic-verifier/.test(TC));
  t.ok('and the module imports nothing at all',
    (CODE.match(/^\s*import\s[^\n]*/gm) ?? []).length === 0, (CODE.match(/^\s*import\s[^\n]*/gm) ?? []).join('\n'));

  // Anti-vacuity: if comment stripping ever removed the code, every negative
  // scan above would pass on an empty string. These two make that impossible.
  t.ok('the scanned source is substantial', CODE.length > 2000, String(CODE.length));
  t.ok('and still contains the code under test',
    /export function buildVerificationResult/.test(CODE) && /export function createTableVerifier/.test(CODE));
}

t.done();
