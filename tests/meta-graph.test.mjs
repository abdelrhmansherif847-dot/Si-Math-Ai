// Unit suite for the Meta Graph adapter.
//
// Executes the REAL shipped source at its real path — not a temp copy and not
// a paraphrase (tests/_source.mjs explains why that distinction matters). No
// network: the client is constructed with an injected fetch stub, so this suite
// needs no Meta app, no token and no ad account, and is safe in CI.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite } from './_assert.mjs';
import { REPO } from './_source.mjs';

const G = await import(pathToFileURL(
  resolve(REPO, 'supabase/functions/_shared/meta-graph.core.ts')).href);

const t = suite('meta-graph');

const ENV = {
  appId: 'APP123', appSecret: 'app-secret-value-long-enough',
  token: 'EAAtoken-value-long-enough', graphVersion: 'v26.0',
  pageId: 'PAGE1', igUserId: '', adAccountId: '', businessId: '', systemUserId: 'SU1',
};

const res = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

// ══ 1 · environment ═══════════════════════════════════════════════════════
t.section('environment');

{
  const full = {
    META_APP_ID: 'a', META_APP_SECRET: 'b', META_SYSTEM_USER_TOKEN: 'c',
    META_GRAPH_VERSION: 'v26.0', META_PAGE_ID: 'p', META_IG_USER_ID: 'i',
    META_AD_ACCOUNT_ID: 'act_1', META_BUSINESS_ID: 'biz', META_SYSTEM_USER_ID: 'su',
  };
  const r = G.readMetaEnv((k) => full[k]);
  t.ok('a complete environment yields an env object', r.env !== null);
  t.is('nothing reported missing', [r.missingRequired, r.missingAssets], [[], []]);

  const partial = { ...full };
  delete partial.META_APP_SECRET;
  delete partial.META_IG_USER_ID;
  const r2 = G.readMetaEnv((k) => partial[k]);
  t.ok('a missing required var yields env === null', r2.env === null);
  t.is('the missing required var is NAMED', r2.missingRequired, ['META_APP_SECRET']);
  t.is('the missing asset var is named separately', r2.missingAssets, ['META_IG_USER_ID']);

  // Whitespace-only is absent, not present. An operator who exported an empty
  // string should be told the variable is missing, not handed a broken client.
  const blank = G.readMetaEnv((k) => (k === 'META_APP_ID' ? '   ' : full[k]));
  t.ok('a whitespace-only value counts as missing',
    blank.env === null && blank.missingRequired.includes('META_APP_ID'));

  const badVer = G.readMetaEnv((k) => (k === 'META_GRAPH_VERSION' ? '26' : full[k]));
  t.ok('a malformed META_GRAPH_VERSION is refused', badVer.versionError !== null);
  t.ok('and refusing it yields no env', badVer.env === null);
  // The whole point of pinning: an unversioned or floating call is a silent
  // behaviour change when Meta sunsets a version.
  t.ok('the version error does not quote the bad VALUE back',
    !String(badVer.versionError).includes('26"') && !/\b26\b/.test(String(badVer.versionError).replace('v26.0', '')));
}

// ══ 2 · appsecret_proof ═══════════════════════════════════════════════════
t.section('appsecret_proof');

{
  // Verified against `openssl dgst -sha256 -hmac` on 2026-08-21. A hand-checked
  // vector, not a self-consistent round-trip: a round-trip passes even if both
  // sides are wrong in the same way.
  const proof = await G.appSecretProof('tok', 'sec');
  t.is('matches the openssl HMAC-SHA256 vector', proof,
    'b13512356d1403d2449aa2e7369214f0459f0d3c08cb742b0aff4fe57aae36f5');
  t.ok('is 64 hex characters', /^[0-9a-f]{64}$/.test(proof));

  const other = await G.appSecretProof('tok', 'different-secret');
  t.ok('a different app secret produces a different proof', other !== proof);
}

// ══ 3 · redaction ═════════════════════════════════════════════════════════
t.section('redaction');

{
  // Fed a URL carrying EVERY credential-bearing parameter at once, and each is
  // asserted absent — rather than checking that a clean URL stays clean.
  const dirty = 'https://graph.facebook.com/v26.0/debug_token' +
    '?input_token=EAAsecretA&access_token=EAAsecretB&appsecret_proof=deadbeef' +
    '&client_secret=shhh&fields=id,name';
  const clean = G.redactUrl(dirty);

  for (const leak of ['EAAsecretA', 'EAAsecretB', 'deadbeef', 'shhh']) {
    t.ok(`redactUrl removes ${leak}`, !clean.includes(leak));
  }
  t.ok('redactUrl keeps the non-secret query intact', clean.includes('fields=id,name'));
  t.ok('redactUrl keeps the path intact', clean.startsWith('https://graph.facebook.com/v26.0/debug_token?'));

  t.ok('a url with no query is returned unchanged',
    G.redactUrl('https://graph.facebook.com/v26.0/me') === 'https://graph.facebook.com/v26.0/me');

  // Redaction is by PARAMETER NAME, so a value we never anticipated is still
  // removed. A value-matching implementation would pass the test above and
  // fail this one.
  t.ok('an unanticipated token value is still removed',
    !G.redactUrl('https://x/y?access_token=NEVER_SEEN_BEFORE').includes('NEVER_SEEN_BEFORE'));

  const text = 'error contacting api with EAAtoken-value-long-enough and app-secret-value-long-enough';
  const scrubbed = G.redactSecrets(text, [ENV.token, ENV.appSecret]);
  t.ok('redactSecrets removes the token value', !scrubbed.includes(ENV.token));
  t.ok('redactSecrets removes the app secret value', !scrubbed.includes(ENV.appSecret));
  t.ok('redactSecrets leaves surrounding text readable', scrubbed.includes('error contacting api'));
  // A 1-2 char "secret" would match everywhere and destroy the output.
  t.ok('redactSecrets ignores implausibly short values',
    G.redactSecrets('a cat sat', ['a']) === 'a cat sat');
}

// ══ 4 · error mapping ═════════════════════════════════════════════════════
t.section('error mapping');

{
  t.is('code 190 → token_invalid_or_revoked', G.metaErrorMessage(400, 190), 'token_invalid_or_revoked');
  t.is('code 200 → permission_denied', G.metaErrorMessage(403, 200), 'permission_denied');
  t.is('code 4 → rate_limited', G.metaErrorMessage(400, 4), 'rate_limited');
  t.is('code 613 → rate_limited', G.metaErrorMessage(400, 613), 'rate_limited');
  t.is('code 368 → temporarily_blocked', G.metaErrorMessage(400, 368), 'temporarily_blocked');
  t.is('HTTP 404 → object_not_found', G.metaErrorMessage(404, 0), 'object_not_found');
  t.is('HTTP 500 → meta_unavailable', G.metaErrorMessage(500, 0), 'meta_unavailable');
  t.is('an unmapped failure gets a generic sentence', G.metaErrorMessage(418, 999), 'meta_rejected_request');

  const e = new G.MetaError(400, 190, 460, 'Atrace123');
  t.is('MetaError carries the fbtrace id', e.fbtraceId, 'Atrace123');
  t.is('MetaError message is the FIXED sentence, not Meta\'s body', e.message, 'token_invalid_or_revoked');
  t.ok('MetaError is an Error', e instanceof Error);
}

// ══ 5 · the client ════════════════════════════════════════════════════════
t.section('client');

{
  const seen = [];
  const stub = async (url, init) => {
    seen.push({ url, method: init?.method });
    return res({ id: 'PAGE1', name: 'Si Math' });
  };
  const client = G.createMetaClient(ENV, { fetchImpl: stub, readOnly: true });
  const body = await client.get('PAGE1', { fields: 'id,name' });

  t.is('get() returns the parsed body', body, { id: 'PAGE1', name: 'Si Math' });
  t.is('get() issues exactly one request', seen.length, 1);
  t.is('get() uses the GET method', seen[0].method, 'GET');
  t.ok('the url is pinned to the configured version',
    seen[0].url.startsWith('https://graph.facebook.com/v26.0/PAGE1?'));
  t.ok('the url carries access_token', seen[0].url.includes('access_token='));
  t.ok('the url carries appsecret_proof', seen[0].url.includes('appsecret_proof='));
  t.ok('the caller\'s fields survive', seen[0].url.includes('fields=id%2Cname'));

  // A doubled slash is a 404 that reads like a permission problem — the worst
  // kind of diagnostic on a checker whose whole job is diagnosis.
  const seen2 = [];
  const c2 = G.createMetaClient(ENV, {
    fetchImpl: async (url) => { seen2.push(url); return res({}); }, readOnly: true,
  });
  await c2.get('/PAGE1');
  t.ok('a leading slash does not produce a doubled slash',
    !seen2[0].replace('https://', '').includes('//'));

  // debugToken() exists so the token is substituted INSIDE the adapter.
  const seen3 = [];
  const c3 = G.createMetaClient(ENV, {
    fetchImpl: async (url) => { seen3.push(url); return res({ data: { is_valid: true } }); },
    readOnly: true,
  });
  await c3.debugToken();
  t.ok('debugToken() calls /debug_token', seen3[0].includes('/v26.0/debug_token?'));
  t.ok('debugToken() supplies input_token itself', seen3[0].includes('input_token='));
}

// ══ 6 · read-only enforcement ═════════════════════════════════════════════
t.section('read-only enforcement');

{
  let fetched = 0;
  const client = G.createMetaClient(ENV, {
    fetchImpl: async () => { fetched++; return res({}); }, readOnly: true,
  });

  t.ok('client reports itself read-only', client.readOnly === true);

  let threw = null;
  try { await client.post('PAGE1/feed', { message: 'x' }); } catch (e) { threw = e; }
  t.ok('post() throws', threw !== null);
  t.is('post() throws ReadOnlyViolation', threw?.name, 'ReadOnlyViolation');
  t.ok('post() names the refused path', String(threw?.message).includes('PAGE1/feed'));

  let threw2 = null;
  try { await client.del('POST1'); } catch (e) { threw2 = e; }
  t.is('del() throws ReadOnlyViolation', threw2?.name, 'ReadOnlyViolation');

  // The property that matters: a refused write reached no network at all.
  t.is('no write ever reached fetch', fetched, 0);
}

// ══ 7 · error surfacing ═══════════════════════════════════════════════════
t.section('error surfacing');

{
  const client = G.createMetaClient(ENV, {
    fetchImpl: async () => res({
      error: {
        message: 'Invalid OAuth access token for EAAtoken-value-long-enough',
        code: 190, error_subcode: 460, fbtrace_id: 'Atrace',
      },
    }, 400),
    readOnly: true,
  });

  let err = null;
  try { await client.get('me'); } catch (e) { err = e; }
  t.ok('a Graph error body throws', err !== null);
  t.is('the code is preserved', err?.code, 190);
  t.is('the subcode is preserved', err?.subcode, 460);
  t.is('the fbtrace id is preserved', err?.fbtraceId, 'Atrace');
  // Meta's body quoted the token back. Relaying it would put a permanent
  // credential into every log line that prints an error.
  t.ok('Meta\'s message is NOT relayed', !String(err?.message).includes(ENV.token));
  t.is('a fixed sentence is used instead', err?.message, 'token_invalid_or_revoked');

  // A 200 carrying an error object is still an error — Graph does this.
  const c2 = G.createMetaClient(ENV, {
    fetchImpl: async () => res({ error: { message: 'nope', code: 100 } }, 200),
    readOnly: true,
  });
  let err2 = null;
  try { await c2.get('me'); } catch (e) { err2 = e; }
  t.ok('an error object in a 200 response still throws', err2 !== null);
}

// ══ 7b · the error DETAIL is surfaced, and scrubbed ═══════════════════════
t.section('error detail');

{
  // THE REGRESSION FIXTURE. The first real sandbox write returned code 100 and
  // the runner reported "meta_rejected_request (code 100)" and nothing else —
  // the failure was named but not diagnosed. Modelled on that exact response,
  // including its fbtrace id.
  const CODE_100 = {
    error: {
      message: '(#100) Tried accessing nonexisting field on node type',
      type: 'OAuthException',
      code: 100,
      error_subcode: 1487390,
      error_user_title: 'Invalid Special Ad Category',
      error_user_msg: 'You must provide special_ad_categories for this campaign.',
      fbtrace_id: 'A-UvrB0-PuhQcJG_XjkQ3D_',
    },
  };

  const client = G.createMetaClient(ENV, {
    fetchImpl: async () => res(CODE_100, 400), readOnly: true,
  });
  let err = null;
  try { await client.get('act_1/campaigns'); } catch (e) { err = e; }

  t.ok('a code-100 rejection throws', err !== null);
  t.is('the classification stays a fixed sentence', err?.message, 'meta_rejected_request');
  t.is('the code is preserved', err?.code, 100);
  t.is('the subcode is preserved', err?.subcode, 1487390);
  t.is('the fbtrace id is preserved', err?.fbtraceId, 'A-UvrB0-PuhQcJG_XjkQ3D_');

  // What was missing before: the actual reason.
  t.ok('detail is present', !!err?.detail);
  t.is('Meta\'s message is surfaced', err.detail.message,
    '(#100) Tried accessing nonexisting field on node type');
  t.is('the error type is surfaced', err.detail.type, 'OAuthException');
  t.is('error_user_title is surfaced', err.detail.userTitle, 'Invalid Special Ad Category');
  t.is('error_user_msg is surfaced', err.detail.userMessage,
    'You must provide special_ad_categories for this campaign.');
  t.ok('describe() reads as one line', /Invalid Special Ad Category/.test(err.describe()) &&
    /fbtrace A-UvrB0-PuhQcJG_XjkQ3D_/.test(err.describe()));

  // An error body with only a code still yields a usable, empty-ish detail.
  const bare = G.createMetaClient(ENV, {
    fetchImpl: async () => res({ error: { code: 100 } }, 400), readOnly: true,
  });
  let e2 = null;
  try { await bare.get('x'); } catch (e) { e2 = e; }
  t.is('a bare error body still yields a detail', typeof e2?.detail, 'object');
  t.is('with empty strings rather than undefined', e2.detail.message, '');
  t.is('and describe() is empty rather than noise', e2.describe(), '');
}

{
  // SURFACING MUST NOT LEAK. Meta quoting credentials back is the exact reason
  // the message was suppressed in the first place; the fix is scrubbing, not
  // silence. Fed a body containing this client's own token, this client's app
  // secret, a DIFFERENT token it has never seen, a proof-shaped hex value and
  // a Bearer header — every one must be gone.
  const OTHER = 'EAAsomeOtherTokenValueThatIsLongEnough123456';
  const PROOF = 'a'.repeat(64);
  const client = G.createMetaClient(ENV, {
    readOnly: true,
    fetchImpl: async () => res({ error: {
      message: `Invalid OAuth token ${ENV.token} secret ${ENV.appSecret} ` +
        `other ${OTHER} access_token=${OTHER} appsecret_proof=${PROOF} ` +
        `Authorization: Bearer ${OTHER}`,
      error_user_msg: `also here: ${ENV.token} and ${OTHER}`,
      code: 190, fbtrace_id: 'Atrace',
    } }, 400),
  });
  let err = null;
  try { await client.get('me'); } catch (e) { err = e; }

  const all = JSON.stringify(err.detail) + err.describe();
  t.ok('this client\'s own token is gone', !all.includes(ENV.token));
  t.ok('this client\'s app secret is gone', !all.includes(ENV.appSecret));
  t.ok('a token it has NEVER held is gone', !all.includes(OTHER));
  t.ok('a proof-shaped hex value is gone', !all.includes(PROOF));
  t.ok('no Bearer header survives', !/Bearer\s+[A-Za-z0-9]/.test(all));
  t.ok('and something readable remains', all.includes('[redacted]'));

  // The pattern layer must work with no known secrets at all — the value layer
  // is not a precondition for it.
  t.ok('pattern scrubbing works with an empty secret list',
    !G.scrubUpstreamText(`token ${OTHER} here`, []).includes(OTHER));
  t.is('and plain text is left alone',
    G.scrubUpstreamText('the objective field is invalid', []),
    'the objective field is invalid');
}

// ══ 8 · the onRequest hook cannot leak ════════════════════════════════════
t.section('onRequest hook');

{
  const urls = [];
  const client = G.createMetaClient(ENV, {
    fetchImpl: async () => res({}),
    readOnly: true,
    onRequest: (_m, url) => urls.push(url),
  });
  await client.debugToken();
  await client.get('me');

  // debugToken() is the sharpest case: BOTH input_token and access_token are
  // the credential. If the hook ever saw a raw url, an observer — a log, a
  // test recorder, a --verbose flag — would capture a permanent token.
  for (const u of urls) {
    t.ok('the hook never sees the raw token', !u.includes(ENV.token));
    t.ok('the hook never sees the app secret', !u.includes(ENV.appSecret));
    t.ok('the hook sees a redacted marker instead', u.includes('[redacted]'));
  }
  t.is('the hook observed both requests', urls.length, 2);
}

t.done();
