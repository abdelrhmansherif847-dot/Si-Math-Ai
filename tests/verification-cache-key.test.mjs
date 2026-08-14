// Verdict Pilot P4 — the item cache key foundation.
//
// A content-addressed key for future item-level verification caching. No table,
// no migration, no persistence — only the deterministic key contract, so that
// when caching is built the identity question is already settled.
//
// THE ASYMMETRY THAT DECIDES EVERY DESIGN CHOICE HERE
// ──────────────────────────────────────────────────
// Over-splitting costs a cache miss. Under-splitting serves a stale
// verification for a DIFFERENT item, which is a wrong answer delivered to a
// student with a verifier's authority behind it. So every doubt resolves toward
// splitting: case is preserved in the question (X and x can be different
// variables), choice ORDER is part of the key (reordering changes what "C"
// means), and the verifier's version is in the key (a fixed verifier must not
// serve its old bug from cache).
//
// WHAT THE KEY MUST NOT SEE
// ─────────────────────────
// Timestamps, student identity, session identity, request metadata, engine
// count, model execution order, randomness. These are enforced structurally
// rather than by care: the key is built from an EXPLICIT ALLOW-LIST of declared
// fields (CACHE_KEY_FIELDS), so an undeclared property on the input object is
// not ignored by accident — it is never read at all. §K7 passes a request stuffed
// with exactly the forbidden fields and requires the material to be unchanged
// byte for byte.
//
// Engine count and submission order need no defending: there is no engine input.
// The key describes the ITEM AND THE VERIFIER, not the models — which is why it
// is valid at N = 0 and at N = 5 without either being mentioned.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('verification-cache-key');

const P4K = '/home/user/Si-Math-Ai/supabase/functions/_shared/verification-cache-key.core.ts';
const { CACHE_KEY_FIELDS, cacheKeyMaterial, verificationCacheKey, stableStringify } = await import(P4K);

const SRC = read('supabase/functions/_shared/verification-cache-key.core.ts');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|[^:\\])\/\/.*$/, '$1')).join('\n');

const VERIFIER = { verifier_id: 'table-stub', version: 'v1', method: 'fixture_table_lookup' };
const BASE = {
  source_id: 'worksheet-7/Q79',
  question_text: 'How many integer values of n satisfy |n - 1| < 4 ?',
  choices: ['6', '7', '8', '9'],
  interpretation: null,
  interpretation_version: null,
  verifier: VERIFIER,
  policy_version: 'p1',
};
const k = (over) => verificationCacheKey({ ...BASE, ...(over ?? {}) });
const m = (over) => cacheKeyMaterial({ ...BASE, ...(over ?? {}) });

// ───────────────────────────────────────────────────────────────────────────
t.section('K1. Stable for identical inputs');
{
  t.is('the same input yields the same key', k(), k());
  t.is('and the same material', m(), m());
  t.is('a rebuilt input object is still the same key', k({ verifier: { ...VERIFIER } }), k());
  t.ok('the key has a versioned, fixed-width shape', /^vk1_[0-9a-f]{16}$/.test(k()), k());
  t.ok('the material is inspectable text, not a digest', m().includes('question='), m().slice(0, 120));
}

t.section('K1b. Stable across VERSIONS of this code, not merely within one run');
{
  // Everything else in this suite is relative — "these two differ", "these two
  // match" — and every relative assertion survives a changed hash function or a
  // reordered material, because both sides move together. A persisted cache does
  // not have that luxury: silently re-keying invalidates every stored entry, and
  // a relative suite reports green while it happens. So the contract is pinned.
  //
  // Changing either value below is a real decision — it discards the cache — and
  // must be made by editing this test on purpose, never as a side effect.
  t.is('the canonical material is pinned', m(),
    ['vk1',
      'policy=2:p1',
      'verifier_id=10:table-stub',
      'verifier_version=2:v1',
      'verifier_method=20:fixture_table_lookup',
      'source_id=15:worksheet-7/Q79',
      'question=50:How many integer values of n satisfy |n - 1| < 4 ?',
      'choices=12:1:61:71:81:9',
      'interpretation_version=0:',
      'interpretation=0:'].join('\n'));
  t.is('and so is the digest over it', k(), 'vk1_2262d72a969eab66');
  t.is('an empty input has a pinned key too', verificationCacheKey({}), 'vk1_f048278523da76d3');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('K2. Changes when the question or its source changes');
{
  t.ok('a different question is a different key', k({ question_text: 'How many integer values of n satisfy |n - 1| < 5 ?' }) !== k());
  t.ok('a different source is a different key', k({ source_id: 'worksheet-8/Q79' }) !== k());
  t.ok('an absent source is a different key', k({ source_id: null }) !== k());

  // Presentation noise is not identity: the same question re-wrapped is the
  // same verification.
  t.is('leading/trailing space does not split the key', k({ question_text: `  ${BASE.question_text}  ` }), k());
  t.is('collapsed inner whitespace does not either',
    k({ question_text: BASE.question_text.replace(/ /g, '   ') }), k());

  // ...but case does. X and x may be different variables, and a cache miss is
  // cheaper than verifying the wrong item.
  t.ok('case is part of the question identity', k({ question_text: BASE.question_text.toUpperCase() }) !== k());
}

// ───────────────────────────────────────────────────────────────────────────
t.section('K3. Changes when the choice mapping changes');
{
  t.ok('a different choice set is a different key', k({ choices: ['6', '7', '8', '10'] }) !== k());
  t.ok('REORDERING the same choices is a different key — "C" now means something else',
    k({ choices: ['7', '6', '8', '9'] }) !== k());
  t.ok('dropping a choice is a different key', k({ choices: ['6', '7', '8'] }) !== k());
  t.ok('free-response is a different key from multiple choice', k({ choices: null }) !== k());
  t.ok('and an empty choice list is distinct from no choice list',
    k({ choices: [] }) !== k({ choices: null }));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('K4. Changes when the verifier identity or version changes');
{
  t.ok('a different verifier is a different key',
    k({ verifier: { ...VERIFIER, verifier_id: 'other-stub' } }) !== k());
  t.ok('A NEW VERSION OF THE SAME VERIFIER IS A DIFFERENT KEY',
    k({ verifier: { ...VERIFIER, version: 'v2' } }) !== k());
  t.ok('a different method is a different key',
    k({ verifier: { ...VERIFIER, method: 'symbolic_substitution' } }) !== k());
  t.ok('the version is present in the material by name',
    /verifier_version=/.test(m()) && m().includes('v1'), m().slice(0, 200));

  // The reason this matters more than the others: without the version, a fixed
  // verifier serves its own old bug out of cache forever.
  t.ok('a missing verifier does not silently collapse to the same key',
    k({ verifier: null }) !== k());
}

// ───────────────────────────────────────────────────────────────────────────
t.section('K5. Changes when policy or interpretation changes');
{
  t.ok('a different policy/schema version is a different key', k({ policy_version: 'p2' }) !== k());
  t.ok('adding a structured interpretation is a different key',
    k({ interpretation: { form: 'abs_inequality', lhs: 'n-1', bound: 4 } }) !== k());
  t.ok('a different interpretation is a different key',
    k({ interpretation: { form: 'abs_inequality', lhs: 'n-1', bound: 5 } })
    !== k({ interpretation: { form: 'abs_inequality', lhs: 'n-1', bound: 4 } }));
  t.ok('a different interpretation version is a different key',
    k({ interpretation_version: 'i2' }) !== k({ interpretation_version: 'i1' }));

  // Key order inside the interpretation is not information.
  t.is('object key order does not change the key',
    k({ interpretation: { a: 1, b: { c: 2, d: 3 } } }),
    k({ interpretation: { b: { d: 3, c: 2 }, a: 1 } }));
  t.is('stableStringify sorts keys recursively',
    stableStringify({ b: { d: 3, c: 2 }, a: 1 }), stableStringify({ a: 1, b: { c: 2, d: 3 } }));
  t.ok('but array order IS information', stableStringify([1, 2]) !== stableStringify([2, 1]));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('K6. Unforgeable field separation');
{
  // Without length-prefixed encoding, ['a','b'] and ['a|b'] (or ['ab']) collapse
  // into the same concatenation and two different items share one cache entry.
  t.ok('["a","b"] and ["a|b"] are different keys', k({ choices: ['a', 'b'] }) !== k({ choices: ['a|b'] }));
  t.ok('["a","b"] and ["ab"] are different keys', k({ choices: ['a', 'b'] }) !== k({ choices: ['ab'] }));
  t.ok('["a","b"] and ["a", "", "b"] are different keys', k({ choices: ['a', 'b'] }) !== k({ choices: ['a', '', 'b'] }));

  // A value that looks like the encoding cannot climb out of its own field.
  t.ok('a question containing the field syntax cannot forge another field',
    k({ question_text: 'x' }) !== k({ question_text: 'x", policy_version="p9' }));
  t.ok('every field is length-prefixed in the material',
    m().split('\n').slice(1).every((l) => /^[a-z_]+=\d+:/.test(l)), m().slice(0, 200));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('K7. Ignores timestamps, identity, session and request metadata');
{
  const POISON = {
    timestamp: 1723600000000,
    created_at: '2026-08-14T00:00:00Z',
    request_id: 'req_abc',
    student_id: 'stu_123',
    user_id: 'usr_456',
    session_id: 'sess_789',
    chat_session_id: 'cs_1',
    engine_count: 5,
    engines: ['engine_alpha', 'engine_beta'],
    submission_order: ['b', 'a'],
    nonce: 'zzzz',
    attempt: 3,
    ip: '1.2.3.4',
    locale: 'ar-EG',
  };
  t.is('a request stuffed with forbidden fields yields the same material',
    cacheKeyMaterial({ ...BASE, ...POISON }), m());
  t.is('and therefore the same key', verificationCacheKey({ ...BASE, ...POISON }), k());
  t.ok('none of them appears anywhere in the material',
    !/timestamp|student|session|request_id|nonce|engine|ip|locale|attempt/i.test(m()), m().slice(0, 300));

  // Two different students, two different sessions, two different moments — one
  // cache entry, because none of that changes what verification is being asked.
  t.is('two students share the key',
    verificationCacheKey({ ...BASE, student_id: 'a' }), verificationCacheKey({ ...BASE, student_id: 'b' }));

  // Structural, not incidental: the builder reads a declared allow-list.
  t.ok('the source never stringifies the whole input object',
    !/JSON\.stringify\(\s*(input|in|raw)\s*\)/.test(CODE), CODE.slice(0, 300));
  t.ok('and reads no clock, randomness or environment',
    !/Date\.now|new Date|Math\.random|randomUUID|Deno\.env|process\.env/.test(CODE), CODE.slice(0, 300));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('K8. The key inputs are declared, not incidental');
{
  t.is('the allow-list is exactly the verification-relevant fields', CACHE_KEY_FIELDS,
    ['policy', 'verifier_id', 'verifier_version', 'verifier_method', 'source_id',
      'question', 'choices', 'interpretation_version', 'interpretation']);

  const lines = m().split('\n');
  t.is('the material declares its own format version first', lines[0], 'vk1');
  t.is('and then exactly those fields, in that order',
    lines.slice(1).map((l) => l.slice(0, l.indexOf('='))), CACHE_KEY_FIELDS);
  t.is('no field is silently dropped', lines.length, CACHE_KEY_FIELDS.length + 1);

  // Every declared field must actually move the key, or it is decoration that
  // will later be mistaken for protection.
  const movers = {
    policy: { policy_version: 'zzz' },
    verifier_id: { verifier: { ...VERIFIER, verifier_id: 'zzz' } },
    verifier_version: { verifier: { ...VERIFIER, version: 'zzz' } },
    verifier_method: { verifier: { ...VERIFIER, method: 'zzz' } },
    source_id: { source_id: 'zzz' },
    question: { question_text: 'zzz' },
    choices: { choices: ['zzz'] },
    interpretation_version: { interpretation_version: 'zzz' },
    interpretation: { interpretation: { zzz: 1 } },
  };
  for (const [field, over] of Object.entries(movers)) {
    t.ok(`${field} changes the key when it changes`, k(over) !== k(), field);
  }
}

// ───────────────────────────────────────────────────────────────────────────
t.section('K9. No engine input exists — N=0 through N=5 are indistinguishable');
{
  // The strongest form of "model execution order and engine count cannot affect
  // the key": they are not parameters. There is nothing to pass.
  t.ok('the input type declares no engine channel',
    !/engine|submission|solver|model_?output|n_?engines/i.test(CODE), CODE.slice(0, 300));
  for (let n = 0; n <= 5; n++) {
    const withEngines = { ...BASE, engines: Array.from({ length: n }, (_, i) => `engine_${i}`), engine_count: n };
    t.is(`N=${n} produces the identical key`, verificationCacheKey(withEngines), k());
  }
  t.ok('and the module imports nothing but the verifier identity type',
    (CODE.match(/^\s*import\s[^\n]*/gm) ?? []).every((l) => /deterministic-verifier\.core\.ts/.test(l)),
    (CODE.match(/^\s*import\s[^\n]*/gm) ?? []).join('\n'));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('K10. Total, and safe on malformed input');
{
  let threw = null;
  const keys = [];
  for (const bad of [undefined, null, {}, { verifier: null }, { question_text: 5, choices: 'x', verifier: 7 }]) {
    try { keys.push(verificationCacheKey(bad)); } catch (e) { threw = String(e); break; }
  }
  t.is('nothing throws', threw, null);
  t.is('every malformed input still yields a key', keys.length, 5);
  t.ok('all well-formed', keys.every((x) => /^vk1_[0-9a-f]{16}$/.test(x)), JSON.stringify(keys));
  t.ok('and they are not all the same key', new Set(keys).size > 1, JSON.stringify(keys));
  t.is('stableStringify tolerates cycles-free odd values', stableStringify(undefined), 'null');
}

// ───────────────────────────────────────────────────────────────────────────
t.section('K11. No verdict, no caching, no storage — and offline');
{
  t.ok('no verdict vocabulary', !/\bVERIFIED\b|HIGH_CONFIDENCE|ITEM_DISPUTED|verdict/i.test(CODE), CODE.slice(0, 300));
  t.ok('no confidence or voting', !/confidence|majority|vote|consensus/i.test(CODE), CODE.slice(0, 300));
  t.ok('no persistence — this is a key, not a cache',
    !/\bcache\.(get|set)|localStorage|Map\(\)\.set|supabase|insert|upsert|from\(/i.test(CODE), CODE.slice(0, 300));
  t.ok('no table or migration reference', !/create table|migration|\.sql/i.test(CODE), CODE.slice(0, 300));

  const INDEX = read('supabase/functions/ai-tutor/index.ts');
  const VC = read('supabase/functions/_shared/verification.core.ts');
  const TC = read('supabase/functions/_shared/telemetry.core.ts');
  t.ok('index.ts does not import the cache key', !/verification-cache-key/.test(INDEX));
  t.ok('verification.core.ts does not either', !/verification-cache-key/.test(VC));
  t.ok('telemetry.core.ts does not either', !/verification-cache-key/.test(TC));

  t.ok('the scanned source is substantial', CODE.length > 1200, String(CODE.length));
  t.ok('and still contains the code under test',
    /export function cacheKeyMaterial/.test(CODE) && /export function verificationCacheKey/.test(CODE));
}

t.done();
