// Regression suite for the ai-tutor v96 server-side entitlement gate.
//
// THE DEFECT THIS GUARDS
// ----------------------
// Free students were served past their daily limit because the Edge Function
// performed no quota check at all. The cap was enforced in chat.html, which
// called consume_credits() in the browser and then invoked the function; a
// caller who skipped that step was never metered. The RPC was correct. Nothing
// server-side ever asked it.
//
// So the checks below come in two kinds, and both have to be here:
//
//   1. BEHAVIOUR — the real chargeEntitlement/refundEntitlement bytes are
//      sliced out of supabase/functions/ai-tutor/index.ts and executed against
//      a fake Supabase client. Every deny reason, every failure mode, and the
//      fallback retry are exercised.
//
//   2. WIRING — that the gate is actually CALLED, before every provider call,
//      and that the browser no longer charges. A gate with perfect internals
//      that nothing invokes is exactly the bug that was shipped, and no amount
//      of unit-testing chargeEntitlement in isolation would have caught it.
//
// Per docs/roadmap/verification-framework-audit.md: a green check is only
// evidence if it could have gone red. Each wiring assertion below fails if the
// call it names is removed or moved after a provider call.
import { readdirSync } from 'node:fs';
import { suite } from './_assert.mjs';
import { read, slice, importTS, REPO } from './_source.mjs';

const t = suite('entitlement-gate');

const SRC = read('supabase/functions/ai-tutor/index.ts');
const CHAT = read('chat.html');

const GATE_BLOCK = slice(
  SRC,
  '// ENTITLEMENT GATE  (v96)',
  'serve(async (req) => {',
  'ai-tutor entitlement gate',
);

const { creditFeatureFor, chargeEntitlement, refundEntitlement, ENTITLEMENT_FALLBACK_FEATURE } =
  await importTS(GATE_BLOCK, [
    'creditFeatureFor', 'chargeEntitlement', 'refundEntitlement', 'ENTITLEMENT_FALLBACK_FEATURE',
  ]);

/** A Supabase-shaped stub that replays scripted rpc results and records calls. */
function fakeClient(script) {
  const calls = [];
  return {
    calls,
    rpc(fn, args) {
      calls.push({ fn, args });
      const next = typeof script === 'function' ? script(fn, args, calls.length) : script;
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve(next);
    },
  };
}
const ok = (data) => ({ data, error: null });

// ── The charged operation is derived, never received ────────────────────────
t.section('Operation derivation');

t.is('plain text turn charges CHAT_TEXT', creditFeatureFor(false, null), 'CHAT_TEXT');
t.is('image turn charges CHAT_IMAGE', creditFeatureFor(true, null), 'CHAT_IMAGE');
t.is('explicit follow-up charges CHAT_FOLLOWUP', creditFeatureFor(false, 'simpler'), 'CHAT_FOLLOWUP');
t.is('an image with a follow-up still charges the image rate',
  creditFeatureFor(true, 'simpler'), 'CHAT_IMAGE');

// The whole point of deriving rather than receiving: a client cannot name the
// cheapest operation. This is a source assertion because the read is in the
// handler, not in the gate helpers.
t.ok('the gate is never handed an operation by the request body',
  !/p_feature:\s*(?:body\.|cleanStr\(body|String\(body)/.test(SRC));
t.ok('telemetry reports the same derivation it bills',
  /teleCtx\.operation = creditFeatureFor\(/.test(SRC));

// ── The allow path ──────────────────────────────────────────────────────────
t.section('Allowing a request');

const allowed = await chargeEntitlement(
  fakeClient(ok({ ok: true, credits_used: 0, log_id: 'log-1', balance_after: 0 })),
  'user-1', 'CHAT_TEXT', 'sess-1');
t.ok('a permitted turn is allowed', allowed.ok);
t.is('the refund handle is carried out of the gate', allowed.logId, 'log-1');
t.is('a free in-cap turn reports zero credits spent', allowed.creditsUsed, 0);
t.is('the charged feature is reported back', allowed.feature, 'CHAT_TEXT');

const paid = await chargeEntitlement(
  fakeClient(ok({ ok: true, credits_used: 8, log_id: 'log-2', balance_after: 92 })),
  'user-1', 'CHAT_IMAGE', null);
t.is('a paid turn reports the credits it actually spent', paid.creditsUsed, 8);
t.is('the balance after the charge is surfaced', paid.balance, 92);

const sent = fakeClient(ok({ ok: true, log_id: 'log-3', credits_used: 0 }));
await chargeEntitlement(sent, 'user-9', 'CHAT_TEXT', 'sess-9');
t.is('exactly one RPC per allowed turn', sent.calls.length, 1);
t.is('the RPC charged is consume_credits', sent.calls[0].fn, 'consume_credits');
t.is('the charge is attributed to the authenticated user',
  sent.calls[0].args.p_user_id, 'user-9');
t.is('the session is carried through for per-session cost attribution',
  sent.calls[0].args.p_session_id, 'sess-9');

// ── The deny paths ──────────────────────────────────────────────────────────
t.section('Denying a request');

const capped = await chargeEntitlement(
  fakeClient(ok({ ok: false, reason: 'daily_limit_reached', daily_used: 15, daily_limit: 15, pack_credits: 0 })),
  'user-1', 'CHAT_TEXT', null);
t.ok('a student over the daily cap is denied', !capped.ok);
t.is('the deny reason is preserved verbatim', capped.reason, 'daily_limit_reached');
t.is('daily usage is surfaced for the upsell', capped.dailyUsed, 15);
t.is('the daily limit is surfaced for the upsell', capped.dailyLimit, 15);
t.ok('a cap hit is a decision, not an outage', !capped.unavailable);
t.is('a denied turn holds no refund handle', capped.logId, null);

const broke = await chargeEntitlement(
  fakeClient(ok({ ok: false, reason: 'insufficient_credits', balance: 3, required: 8 })),
  'user-1', 'CHAT_IMAGE', null);
t.ok('a student without the credits is denied', !broke.ok);
t.is('the balance is surfaced', broke.balance, 3);
t.is('the price of the operation is surfaced', broke.required, 8);
t.ok('an empty balance is a decision, not an outage', !broke.unavailable);

const mismatch = await chargeEntitlement(
  fakeClient(ok({ ok: false, reason: 'forbidden_user_mismatch' })),
  'user-1', 'CHAT_TEXT', null);
t.ok('the AUTHZ-01 refusal denies the turn', !mismatch.ok);
t.is('the AUTHZ-01 reason is preserved', mismatch.reason, 'forbidden_user_mismatch');

const noUser = await chargeEntitlement(
  fakeClient(ok({ ok: false, reason: 'user_not_found' })), 'ghost', 'CHAT_TEXT', null);
t.ok('an unknown user is denied', !noUser.ok);

// ── Fail closed ─────────────────────────────────────────────────────────────
// The defect was a path that reached OpenAI without a decision. Every way of
// failing to reach one must deny.
t.section('Every undecidable outcome fails CLOSED');

const rpcErr = await chargeEntitlement(
  fakeClient({ data: null, error: { message: 'connection reset' } }), 'u', 'CHAT_TEXT', null);
t.ok('an RPC error denies the turn', !rpcErr.ok);
t.ok('an RPC error is reported as undecidable, not as "out of credits"', rpcErr.unavailable);

const thrown = await chargeEntitlement(
  fakeClient(new Error('socket hang up')), 'u', 'CHAT_TEXT', null);
t.ok('a thrown RPC denies the turn', !thrown.ok);
t.ok('a thrown RPC is undecidable', thrown.unavailable);

// A result whose shape is unrecognised has not granted permission — and it is
// reported as undecidable, not as an upsell. Telling a paying student to buy
// credits because the RPC contract changed is a different bug, quietly shipped.
for (const [label, body] of [
  ['null', null], ['undefined', undefined], ['a bare string', 'yes'],
  ['a number', 1], ['an array', []], ['an object with no ok field', { reason: 'x' }],
]) {
  const junk = await chargeEntitlement(fakeClient(ok(body)), 'u', 'CHAT_TEXT', null);
  t.ok(`a result of ${label} denies the turn`, !junk.ok);
  t.ok(`a result of ${label} is reported as undecidable`, junk.unavailable);
}

// ok is checked as a boolean, and against true, on purpose: a truthy-but-not-true
// value from a changed RPC contract must not read as permission.
for (const [label, truthy] of [['"true"', 'true'], ['1', 1], ['{}', {}]]) {
  const soft = await chargeEntitlement(fakeClient(ok({ ok: truthy })), 'u', 'CHAT_TEXT', null);
  t.ok(`ok:${label} is not treated as permission`, !soft.ok);
}

// ── The catalogue fallback ──────────────────────────────────────────────────
// credit-config.js falls back to the legacy flat feature in the browser so a
// not-yet-migrated operation cannot lock a student out. The server mirrors it —
// but it is a fallback to a DIFFERENT CHARGE, never to no charge.
t.section('Missing-feature fallback');

t.is('the fallback target is the legacy flat feature',
  ENTITLEMENT_FALLBACK_FEATURE, 'AI_CHAT_MESSAGE');

const fbClient = fakeClient((fn, args) =>
  args.p_feature === 'CHAT_TEXT'
    ? ok({ ok: false, reason: 'feature_not_found' })
    : ok({ ok: true, credits_used: 5, log_id: 'log-fb' }));
const fellBack = await chargeEntitlement(fbClient, 'u', 'CHAT_TEXT', null);
t.ok('an unknown operation falls back rather than locking the student out', fellBack.ok);
t.is('the fallback charged the legacy feature', fellBack.feature, 'AI_CHAT_MESSAGE');
t.is('the fallback costs a real charge', fellBack.creditsUsed, 5);
t.is('the fallback is attempted exactly once', fbClient.calls.length, 2);
t.is('the retry targets the legacy feature', fbClient.calls[1].args.p_feature, 'AI_CHAT_MESSAGE');

const noCat = fakeClient(ok({ ok: false, reason: 'feature_not_found' }));
const dead = await chargeEntitlement(noCat, 'u', 'CHAT_TEXT', null);
t.ok('an empty catalogue denies rather than allowing', !dead.ok);
t.ok('an empty catalogue is an operator outage, not an upsell', dead.unavailable);
t.is('the fallback never recurses past one retry', noCat.calls.length, 2);

const alreadyLegacy = fakeClient(ok({ ok: false, reason: 'feature_not_found' }));
await chargeEntitlement(alreadyLegacy, 'u', 'AI_CHAT_MESSAGE', null);
t.is('a missing legacy feature does not retry itself', alreadyLegacy.calls.length, 1);

// ── Idempotency ─────────────────────────────────────────────────────────────
// Moving the charge server-side means every HTTP request that reaches the gate
// charges — including askAI()'s automatic retry on a transport-only failure,
// which re-sends the same payload and the same client_request_id. The CAI-P1
// pre-flight cannot absorb that (it reads question_records, written only after
// the model call), so the key has to reach consume_credits.
t.section('One logical send is charged once');

const KEY = '11111111-1111-4111-8111-111111111111';

const keyed = fakeClient(ok({ ok: true, credits_used: 5, log_id: 'log-k' }));
const first = await chargeEntitlement(keyed, 'u', 'CHAT_TEXT', 's', KEY);
t.is('the idempotency key is passed to the RPC',
  keyed.calls[0].args.p_client_request_id, KEY);
t.ok('a keyed charge reports itself as keyed', first.keyed);
t.ok('a first charge is not a replay', !first.replay);

const replayed = await chargeEntitlement(
  fakeClient(ok({ ok: true, credits_used: 5, log_id: 'log-k', idempotent_replay: true })),
  'u', 'CHAT_TEXT', 's', KEY);
t.ok('a replay is allowed through', replayed.ok);
t.ok('a replay is reported as a replay', replayed.replay);
t.is('a replay returns the ORIGINAL log id, so the refund handle stays correct',
  replayed.logId, 'log-k');

const unkeyed = fakeClient(ok({ ok: true, log_id: 'log-u', credits_used: 0 }));
await chargeEntitlement(unkeyed, 'u', 'CHAT_TEXT', 's', null);
t.ok('no key means the argument is omitted, not sent as null',
  !('p_client_request_id' in unkeyed.calls[0].args));

// Pre-migration: consume_credits has no p_client_request_id yet. PostgREST
// rejects at the schema cache, so no SQL runs and nothing was charged — the
// unkeyed retry is safe rather than merely convenient.
const preMigration = fakeClient((fn, args) =>
  'p_client_request_id' in args
    ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.consume_credits(...) in the schema cache' } }
    : ok({ ok: true, credits_used: 5, log_id: 'log-fb' }));
const fellThrough = await chargeEntitlement(preMigration, 'u', 'CHAT_TEXT', 's', KEY);
t.ok('a missing key parameter does not deny the student', fellThrough.ok);
t.is('the fallback drops the key and charges', preMigration.calls.length, 2);
t.ok('the retry carries no key', !('p_client_request_id' in preMigration.calls[1].args));
t.ok('an unkeyed charge says so, so the gap is greppable', !fellThrough.keyed);

// A real RPC error must NOT be mistaken for a missing signature — that would
// turn a fail-closed outage into a silent unkeyed charge.
const realError = fakeClient({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
const notSignature = await chargeEntitlement(realError, 'u', 'CHAT_TEXT', 's', KEY);
t.is('a genuine RPC error is not retried as a signature problem', realError.calls.length, 1);
t.ok('a genuine RPC error still fails closed', !notSignature.ok && notSignature.unavailable);

// feature_not_found charges nothing, so the key is still unused and the
// legacy-feature retry has to stay idempotent too.
const fbKeyed = fakeClient((fn, args) =>
  args.p_feature === 'CHAT_TEXT'
    ? ok({ ok: false, reason: 'feature_not_found' })
    : ok({ ok: true, credits_used: 5, log_id: 'log-fbk' }));
await chargeEntitlement(fbKeyed, 'u', 'CHAT_TEXT', 's', KEY);
t.is('the legacy-feature retry keeps the idempotency key',
  fbKeyed.calls[1].args.p_client_request_id, KEY);

// ── Refunds ─────────────────────────────────────────────────────────────────
t.section('Refunding an unused entitlement');

const admin1 = fakeClient(ok({ ok: true, refunded: 5 }));
const user1  = fakeClient(ok({ ok: true, refunded: 5 }));
t.ok('a service-role refund succeeds', await refundEntitlement(admin1, user1, 'log-1'));
t.is('the admin client is tried first', admin1.calls.length, 1);
t.is('the user client is not touched when the admin refund worked', user1.calls.length, 0);

// Pre-migration state: refund_ai_credit scopes its DELETE by auth.uid(), which
// is NULL for service_role, so the admin attempt finds no row.
const admin2 = fakeClient(ok({ ok: false, reason: 'log_not_found' }));
const user2  = fakeClient(ok({ ok: true, refunded: 8 }));
t.ok('the user-JWT fallback covers the pre-migration RPC',
  await refundEntitlement(admin2, user2, 'log-2'));
t.is('the fallback is used exactly once', user2.calls.length, 1);
t.is('the refund RPC is refund_ai_credit', user2.calls[0].fn, 'refund_ai_credit');
t.is('the refund names the log row to reverse', user2.calls[0].args.p_log_id, 'log-2');

const admin3 = fakeClient(new Error('boom'));
const user3  = fakeClient(ok({ ok: true, refunded: 2 }));
t.ok('a thrown admin refund still falls back', await refundEntitlement(admin3, user3, 'log-3'));

const admin4 = fakeClient({ data: null, error: { message: 'denied' } });
const user4  = fakeClient({ data: null, error: { message: 'denied' } });
t.ok('a refund that fails everywhere reports failure rather than throwing',
  (await refundEntitlement(admin4, user4, 'log-4')) === false);

const admin5 = fakeClient(new Error('x'));
const user5  = fakeClient(new Error('y'));
t.ok('a refund never rejects', (await refundEntitlement(admin5, user5, 'log-5')) === false);

// ── WIRING: the gate is called, before anything that costs money ────────────
t.section('The gate is wired into the handler');

const HANDLER = SRC.slice(SRC.indexOf('serve(async (req) => {'));
const gateAt = HANDLER.indexOf('await chargeEntitlement(');

t.ok('the handler calls the gate', gateAt > 0);

// The positional checks are the ones that would have caught the shipped bug.
const PROVIDER_CALLS = [
  ["fetch('https://api.openai.com", 'a direct OpenAI call'],
  ['detectQuestionsInImages(',      'vision question detection'],
  ['detectorV2Classify(',           'the v2 difficulty classifier'],
  ['runL3ShadowPipeline(',          'the L3 shadow pipeline'],
];
for (const [needle, what] of PROVIDER_CALLS) {
  const at = HANDLER.indexOf(needle);
  t.ok(`${what} is reached only after the gate`, at > gateAt);
}

// The idempotency replay returns a stored answer with no provider call, so it
// must sit BEFORE the gate or a retry is billed twice for one logical send.
t.ok('an idempotency replay is not charged',
  HANDLER.indexOf('idempotency-hit') < gateAt);
// The worksheet guard is declared "0 tokens" and returns before any model call.
t.ok('a 0-token worksheet-navigation turn is not charged',
  HANDLER.indexOf('worksheet-guard-fired') < gateAt);

t.ok('a denied turn returns 402 and does not fall through',
  /return safeError\(\s*402, 'quota_exhausted'/.test(SRC));
t.ok('an undecidable turn returns 503 and does not fall through',
  /return safeError\(\s*503, 'entitlement_unavailable'/.test(SRC));
t.ok('the deny branch returns before the charge handle is stored',
  HANDLER.indexOf("'quota_exhausted'") < HANDLER.indexOf('creditLogId  = entitlement.logId'));

t.section('Refunds are issued by the server, on outcomes the server observed');

t.ok('a failed request hands the entitlement back',
  /refundEntitlement\(teleAdmin, sbUserForRefund/.test(SRC));
// The hole this closes: refund_ai_credit DELETEs the ai_usage_logs row and
// consume_credits COUNTs those rows for the daily cap, so refunding a
// zero-credit free turn rewinds the counter. Out-of-scope turns cost a real
// provider call, so they keep their slot.
t.ok('an out-of-scope turn refunds credits but keeps its free daily slot',
  /if \(creditLogId && creditsSpent > 0\)/.test(SRC));

t.section('The browser no longer holds the gate');

// Scoped to the chat send path on purpose. The Study Planner on the same page
// legitimately still charges from the browser: it runs a pure client-side
// engine (window.StudyPlanner.buildStudyPlan) and makes no provider call, so
// its charge is a paywall on a local computation rather than a gate in front of
// spend. Asserting over the whole file would fail on that and teach the next
// reader that the assertion is noise.
const SEND_PATH = slice(
  CHAT,
  '// ── v96: the quota gate is SERVER-SIDE',
  '// Rank ladder lives in assets/ranks.js',
  'chat.html send path',
);

t.ok('the send path does not charge before invoking the tutor',
  !/CreditConfig\.charge\(/.test(SEND_PATH));
// Matches the RPC CALL, not the name: the send path carries a comment
// explaining why refund_ai_credit is dangerous from the client, and a bare
// name match would be satisfied by deleting the explanation.
t.ok('the send path issues no refunds of its own',
  !/\.rpc\(\s*'refund_ai_credit'/.test(SEND_PATH));
t.ok('the send path renders the upsell from the server verdict',
  /err\.quota/.test(SEND_PATH) && /daily_limit_reached/.test(SEND_PATH));
t.ok('askAI translates the server 402 into a quota verdict',
  /status === 402/.test(CHAT) && /qErr\.quota = \{/.test(CHAT));
t.ok('askAI distinguishes "could not check" from "no"',
  /status === 503/.test(CHAT));
t.ok('the page enqueues no new refunds', !/enqueueRefund\(/.test(CHAT));
t.ok('the client still sends the idempotency key the gate needs',
  /client_request_id:\s*pendingRequestId/.test(CHAT) || /client_request_id/.test(CHAT));

// ── The invariant, across every shipped page ────────────────────────────────
// refund_ai_credit deletes the ai_usage_logs row that consume_credits counts
// for the FREE daily cap, so ANY authenticated client path to it is a
// client-callable quota reset. This is checked over every page rather than over
// chat.html, because the next one to reintroduce it will not be chat.html.
t.section('No shipped page can invoke refund_ai_credit');

const PAGES = readdirSync(REPO)
  .filter(f => /\.(html|js)$/.test(f))
  .filter(f => f !== 'knowledge-graph.json');

const refunders = PAGES.filter(f => /\.rpc\(\s*['"]refund_ai_credit['"]/.test(read(f)));
t.is('no root page or script calls refund_ai_credit', refunders, []);

// Study Planner: the charge moved AFTER the plan is built, so a throw in
// gather/build costs the student nothing and needs no refund to undo.
const PLANNER = slice(
  CHAT,
  'async function generateStudyPlan(uid){',
  'function send(){',
  'chat.html generateStudyPlan',
);
t.ok('the planner builds the plan before charging',
  PLANNER.indexOf('buildStudyPlan(') < PLANNER.indexOf('CreditConfig.charge('));
t.ok('the planner issues no refund',
  !/\.rpc\(\s*['"]refund_ai_credit['"]/.test(PLANNER));
t.ok('the planner tells the student they were not charged',
  /not charged/i.test(PLANNER));

t.done();
