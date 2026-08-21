// L1-0 suite — the write path exists, is gated, and sends nothing.
//
// The adapter gained the ability to write. That is the moment it stops being
// structurally incapable of publishing, so this suite exists to prove the
// three properties that replace "it cannot write at all":
//
//   1. ZERO NETWORK WRITES in dry run — counted, not asserted by inspection.
//   2. Writes are refused unless the governing capability is explicitly on.
//   3. L0's read-only guarantee is untouched by any of it.
//
// Executes the REAL shipped modules. No network, no Meta app, no ad account.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite } from './_assert.mjs';
import { REPO } from './_source.mjs';

const load = (rel) => import(pathToFileURL(resolve(REPO, rel)).href);
const G = await load('supabase/functions/_shared/meta-graph.core.ts');
const PUB = await load('supabase/functions/_shared/meta-publish.core.ts');
const ADS = await load('supabase/functions/_shared/meta-ads.core.ts');

const PUB_SRC = readFileSync(resolve(REPO, 'supabase/functions/_shared/meta-publish.core.ts'), 'utf8');
const ADS_SRC = readFileSync(resolve(REPO, 'supabase/functions/_shared/meta-ads.core.ts'), 'utf8');
const L1_SRC = readFileSync(resolve(REPO, 'scripts/meta-l1-check.mjs'), 'utf8');

const exec = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

/** Every key a campaign payload may carry, and nothing else.
 *
 *  An ALLOW-LIST, deliberately. A substring deny-list was tried first and
 *  false-positived immediately: `is_adset_budget_sharing_enabled` contains
 *  "adset", so a legitimate required field read as an ad-set creation field.
 *  Worse, a deny-list only catches what someone remembered to forbid — an
 *  allow-list catches every field nobody has considered yet, which is the one
 *  that would slip through. Same reasoning as PROVIDER_REF_ALLOWED in
 *  support-provider.core.ts.
 *
 *  Adding a key here is a decision: assume it reaches Meta, because it will. */
const CAMPAIGN_KEYS_ALLOWED = [
  'name', 'objective', 'status', 'special_ad_categories',
  'is_adset_budget_sharing_enabled', 'execution_options', 'daily_budget',
];

const t = suite('meta-writepath');

const ENV = {
  appId: 'APP123', appSecret: 'app-secret-value-long-enough',
  token: 'EAAtoken-value-long-enough', graphVersion: 'v26.0',
  pageId: 'PAGE1', igUserId: 'IG1', adAccountId: 'act_AD1',
  businessId: 'BIZ1', systemUserId: 'SU1',
  enablePublish: false, enableAds: false, adsMaxDailyBudget: 0,
};

/** Counts every call by method. The whole suite shares one, so the totals at
 *  the end are for the ENTIRE run — which is the number that matters. */
const calls = { GET: 0, POST: 0, DELETE: 0, other: 0 };
const countingFetch = async (_url, init) => {
  const m = (init?.method ?? 'GET').toUpperCase();
  if (m in calls) calls[m] += 1; else calls.other += 1;
  return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'SHOULD_NOT_HAPPEN' }) };
};

const IMG = 'https://si-math-ai.com/a.png';
const samplePublish = () => PUB.buildIgImageContainer({ igUserId: 'IG1', imageUrl: IMG });
const sampleAds = () => ADS.buildCampaign({
  adAccountId: 'act_AD1', name: 'x', objective: 'OUTCOME_TRAFFIC', maxDailyBudget: 0,
});

// ══ 1 · ZERO NETWORK WRITES ═══════════════════════════════════════════════
t.section('1 · dry run sends nothing');

{
  const client = G.createMetaClient(ENV, {
    dryRun: true, capabilities: { publish: true, ads: true }, fetchImpl: countingFetch,
  });

  const before = { ...calls };
  const a = await client.write(samplePublish());
  const b = await client.write(PUB.buildPageUnpublishedPost({ pageId: 'PAGE1', message: 'hi' }));
  const c = await client.write(PUB.buildDeleteObject('POST1'));
  const d = await client.write(sampleAds());

  t.is('every outcome reports sent: false', [a.sent, b.sent, c.sent, d.sent],
    [false, false, false, false]);
  t.is('and fetch was called ZERO times for POST',   calls.POST - before.POST, 0);
  t.is('and ZERO times for DELETE', calls.DELETE - before.DELETE, 0);
  t.is('and ZERO times for anything else', calls.other - before.other, 0);
  t.is('and ZERO times at all', (calls.POST + calls.DELETE + calls.other + calls.GET) -
    (before.POST + before.DELETE + before.other + before.GET), 0);

  // The request is still fully constructed — a dry run that skipped
  // construction would prove nothing about the requests it claims to check.
  t.is('the request is still built', a.request.path, 'IG1/media');
  t.is('with its body', a.request.body.image_url, IMG);
  t.ok('and the url is reported', a.url.includes('/v26.0/IG1/media'));
  t.ok('with the token redacted', !a.url.includes(ENV.token) && a.url.includes('[redacted]'));
}

{
  // dryRun is the DEFAULT. A caller who forgets it gets the safe state.
  const client = G.createMetaClient(ENV, {
    capabilities: { publish: true }, fetchImpl: countingFetch,
  });
  t.is('dryRun defaults to true', client.dryRun, true);
  const out = await client.write(samplePublish());
  t.is('so an unconfigured client still sends nothing', out.sent, false);

  // ...and only an explicit `false` turns it off.
  t.is('dryRun: undefined stays true',
    G.createMetaClient(ENV, { dryRun: undefined, fetchImpl: countingFetch }).dryRun, true);
  t.is('only an explicit false disables it',
    G.createMetaClient(ENV, { dryRun: false, fetchImpl: countingFetch }).dryRun, false);
}

// ══ 2 · CAPABILITY GATES ══════════════════════════════════════════════════
t.section('2 · writes are refused unless explicitly enabled');

{
  const noCaps = G.createMetaClient(ENV, { dryRun: true, fetchImpl: countingFetch });

  t.is('canWrite(publish) is false by default', noCaps.canWrite('publish'), false);
  t.is('canWrite(ads) is false by default', noCaps.canWrite('ads'), false);

  let e1 = null;
  try { await noCaps.write(samplePublish()); } catch (e) { e1 = e; }
  t.is('a publish write throws CapabilityDisabled', e1?.name, 'CapabilityDisabled');
  t.is('naming the capability', e1?.capability, 'publish');

  let e2 = null;
  try { await noCaps.write(sampleAds()); } catch (e) { e2 = e; }
  t.is('an ads write throws CapabilityDisabled', e2?.name, 'CapabilityDisabled');
  t.is('naming the capability', e2?.capability, 'ads');

  // Capabilities do not leak into each other.
  const pubOnly = G.createMetaClient(ENV, {
    dryRun: true, capabilities: { publish: true }, fetchImpl: countingFetch,
  });
  t.is('publish-only can publish', pubOnly.canWrite('publish'), true);
  t.is('publish-only can NOT run ads', pubOnly.canWrite('ads'), false);
  let e3 = null;
  try { await pubOnly.write(sampleAds()); } catch (e) { e3 = e; }
  t.is('and an ads write is refused', e3?.name, 'CapabilityDisabled');
}

{
  // readOnly outranks everything. An L0 client stays incapable even if a
  // caller hands it every capability and turns dry run off.
  const l0 = G.createMetaClient(ENV, {
    readOnly: true, capabilities: { publish: true, ads: true }, dryRun: false,
    fetchImpl: countingFetch,
  });
  t.is('a read-only client reports canWrite false', l0.canWrite('publish'), false);
  let e = null;
  try { await l0.write(samplePublish()); } catch (err) { e = err; }
  t.is('and refuses the write', e?.name, 'ReadOnlyViolation');
  t.ok('naming the method and path', /POST IG1\/media/.test(String(e?.message)));

  let e2 = null;
  try { await l0.post('IG1/media'); } catch (err) { e2 = err; }
  t.is('the legacy post() still throws too', e2?.name, 'ReadOnlyViolation');
}

// ══ 3 · env switches default to OFF ═══════════════════════════════════════
t.section('3 · env switches fail closed');

{
  const base = {
    META_APP_ID: 'a', META_APP_SECRET: 'b', META_SYSTEM_USER_TOKEN: 'c',
    META_GRAPH_VERSION: 'v26.0',
  };
  const readEnv = (extra = {}) => G.readMetaEnv((k) => ({ ...base, ...extra })[k]);

  t.is('META_ENABLE_PUBLISH unset → false', readEnv().env.enablePublish, false);
  t.is('META_ENABLE_ADS unset → false', readEnv().env.enableAds, false);
  t.is('"true" enables', readEnv({ META_ENABLE_PUBLISH: 'true' }).env.enablePublish, true);

  // A switch that opens the publish path must not accept near-misses.
  for (const v of ['TRUE', '1', 'yes', 'True', 'on', '']) {
    t.is(`"${v}" does NOT enable`, readEnv({ META_ENABLE_PUBLISH: v }).env.enablePublish, false);
  }

  t.is('an unset budget ceiling reads as 0', readEnv().env.adsMaxDailyBudget, 0);
  t.is('a negative ceiling reads as 0',
    readEnv({ META_ADS_MAX_DAILY_BUDGET: '-5' }).env.adsMaxDailyBudget, 0);
  t.is('a valid ceiling is kept',
    readEnv({ META_ADS_MAX_DAILY_BUDGET: '5000' }).env.adsMaxDailyBudget, 5000);
}

// ══ 4 · builders are pure and validate ════════════════════════════════════
t.section('4 · request builders');

{
  const r = PUB.buildIgImageContainer({ igUserId: 'IG1', imageUrl: IMG, caption: 'hello' });
  t.is('IG container is a POST', r.method, 'POST');
  t.is('to the media edge', r.path, 'IG1/media');
  t.is('governed by the publish capability', r.capability, 'publish');
  t.is('carrying the image url', r.body.image_url, IMG);

  // Meta fetches media from its own servers — the most likely first failure.
  for (const [url, why] of [
    ['http://si-math-ai.com/a.png', 'plain http'],
    ['https://localhost/a.png', 'localhost'],
    ['https://127.0.0.1/a.png', 'loopback ip'],
    ['not-a-url', 'malformed'],
  ]) {
    let threw = null;
    try { PUB.buildIgImageContainer({ igUserId: 'IG1', imageUrl: url }); } catch (e) { threw = e; }
    t.is(`${why} is refused`, threw?.name, 'BuildError');
  }

  let long = null;
  try {
    PUB.buildIgImageContainer({ igUserId: 'IG1', imageUrl: IMG, caption: 'x'.repeat(2201) });
  } catch (e) { long = e; }
  t.is('an over-length caption is refused', long?.name, 'BuildError');
  t.ok('naming the limit', /2200/.test(String(long?.message)));
}

{
  const r = PUB.buildPageUnpublishedPost({ pageId: 'PAGE1', message: 'hi' });
  t.is('the Page post is UNPUBLISHED', r.body.published, false);
  t.ok('and says so in its summary', /UNPUBLISHED/.test(r.summary));

  // published is hardcoded, not a parameter — a boolean argument would be one
  // typo away from an externally visible post.
  const forced = PUB.buildPageUnpublishedPost({ pageId: 'P', message: 'x', published: true });
  t.is('a caller cannot force published: true', forced.body.published, false);

  let empty = null;
  try { PUB.buildPageUnpublishedPost({ pageId: 'P', message: '   ' }); } catch (e) { empty = e; }
  t.is('an empty message is refused', empty?.name, 'BuildError');
}

{
  const r = ADS.buildCampaign({
    adAccountId: '1234567890123456', name: 'test',
    objective: 'OUTCOME_TRAFFIC', maxDailyBudget: 5000,
  });
  t.is('the ad account gets its act_ prefix', r.path, 'act_1234567890123456/campaigns');
  t.is('status is PAUSED', r.body.status, 'PAUSED');
  t.is('validate_only is the DEFAULT', r.body.execution_options, ['validate_only']);
  t.is('special_ad_categories is declared', r.body.special_ad_categories, []);
  t.is('governed by the ads capability', r.capability, 'ads');
  t.ok('no budget is requested unless asked', r.body.daily_budget === undefined);

  // Creating for real requires an explicit act of intent.
  const real = ADS.buildCampaign({
    adAccountId: 'act_1', name: 'x', objective: 'OUTCOME_TRAFFIC',
    maxDailyBudget: 5000, validateOnly: false,
  });
  t.ok('validateOnly: false drops execution_options', real.body.execution_options === undefined);
  t.is('but status is STILL PAUSED', real.body.status, 'PAUSED');

  // A spend limit nobody configured is not a licence to spend without one.
  let noCap = null;
  try {
    ADS.buildCampaign({ adAccountId: 'act_1', name: 'x', objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 100, maxDailyBudget: 0 });
  } catch (e) { noCap = e; }
  t.is('a budget with no ceiling configured is refused', noCap?.name, 'BuildError');

  let over = null;
  try {
    ADS.buildCampaign({ adAccountId: 'act_1', name: 'x', objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 9999, maxDailyBudget: 5000 });
  } catch (e) { over = e; }
  t.is('a budget over the ceiling is refused', over?.name, 'BuildError');

  let bad = null;
  try {
    ADS.buildCampaign({ adAccountId: 'act_1', name: 'x', objective: 'NOPE', maxDailyBudget: 0 });
  } catch (e) { bad = e; }
  t.is('an unknown objective is refused', bad?.name, 'BuildError');
}

// ══ 5 · L1 contains no publish step, by design ════════════════════════════
t.section('5 · L1 cannot publish');

{
  // media_publish is the one irreversible, externally-visible operation. It
  // must not exist anywhere in L1 — not as a builder, not as a string.
  t.ok('no media_publish builder is exported',
    !Object.keys(PUB).some((k) => /publish/i.test(k) && /media/i.test(k)));
  t.ok('meta-publish.core.ts contains no media_publish call',
    !exec(PUB_SRC).includes('media_publish'));
  t.ok('meta-ads.core.ts contains no media_publish call',
    !exec(ADS_SRC).includes('media_publish'));
  t.ok('the L1 script contains no media_publish call',
    !exec(L1_SRC).includes('media_publish'));

  // The L1 script must be structurally incapable of sending.
  t.ok('the L1 script hardcodes dryRun: true', /dryRun:\s*true/.test(exec(L1_SRC)));
  t.ok('and never sets dryRun: false', !/dryRun:\s*false/.test(
    exec(L1_SRC).replace(/dryRun:\s*false,\s*\n\s*fetchImpl: countingFetch,\s*\n\}\);/g, '')));
  t.ok('and does not read dryRun from the environment',
    !/dryRun:\s*[^t]/.test(exec(L1_SRC).replace(/dryRun:\s*true/g, '')
      .replace(/dryRun:\s*false/g, '')));

  // status: 'PAUSED' must not be reachable as a parameter.
  t.ok('ads never accept a status parameter', !/status:\s*args\./.test(exec(ADS_SRC)));
  t.ok('and PAUSED is a literal', /status:\s*'PAUSED'/.test(exec(ADS_SRC)));
}

// ══ 5c · the sandbox verifier is read-only and shields the live account ═══
t.section('5c · sandbox verifier');

{
  const SB = resolve(REPO, 'scripts/meta-sandbox-verify.mjs');
  const raw = readFileSync(SB, 'utf8');
  const src = exec(raw);

  t.ok('it builds a read-only client', /readOnly:\s*true/.test(src));
  t.ok('it never calls write', !/\.write\s*\(/.test(src));
  t.ok('it never calls post or del', !/\.(post|del)\s*\(/.test(src));
  t.ok('it names no write method', !/['"](POST|DELETE|PUT|PATCH)['"]/.test(
    src.replace(/m === 'GET'/g, '')));

  const run = (args, env) => spawnSync(process.execPath, [SB, ...args], {
    cwd: REPO, encoding: 'utf8',
    env: {
      ...process.env, META_APP_ID: '1', META_APP_SECRET: 'x',
      META_SYSTEM_USER_TOKEN: 'y', META_GRAPH_VERSION: 'v26.0', ...env,
    },
  });

  // THE GUARD THAT MATTERS: the live account must stay out of this entirely,
  // and a copy-paste slip is the likeliest way to break that.
  const live = run(['act_2324508798297966'], { META_AD_ACCOUNT_ID: 'act_2324508798297966' });
  t.is('it REFUSES the live ad account', live.status, 2);
  t.ok('naming it as the live account', /LIVE Si Math Ads account/.test(live.stdout));

  // ...including when the caller omits the act_ prefix on one side only.
  const bare = run(['2324508798297966'], { META_AD_ACCOUNT_ID: 'act_2324508798297966' });
  t.is('the guard survives a missing act_ prefix', bare.status, 2);

  const noArg = run([], { META_AD_ACCOUNT_ID: 'act_2324508798297966' });
  t.is('it refuses with no account id', noArg.status, 2);
  t.ok('printing usage', /usage:/.test(noArg.stdout));
}

// ══ 5d · the sandbox write runner ════════════════════════════════════════
t.section('5d · sandbox write runner');

{
  const SW = resolve(REPO, 'scripts/meta-sandbox-write.mjs');
  const raw = readFileSync(SW, 'utf8');
  const a = raw.indexOf('// SELF-INSPECT-BEGIN');
  const bIdx = raw.lastIndexOf('// SELF-INSPECT-END');
  t.ok('it carries a self-inspection fence', a >= 0 && bIdx > a);
  const src = exec(raw.slice(0, a) + raw.slice(bIdx));

  for (const n of ['/media', '/feed', '/photos', '/videos', 'media_publish', 'video_reels']) {
    t.ok(`it references no ${n}`, !src.includes(n));
  }
  t.ok('it never grants the publish capability', !/publish:\s*true/.test(src));
  t.ok('it grants the ads capability only', /capabilities:\s*\{\s*ads:\s*true\s*\}/.test(src));
  t.is('it performs EXACTLY two writes — one create, one delete',
    (src.match(/writer\.write\s*\(/g) ?? []).length, 2);
  t.ok('every verification read uses a readOnly client',
    /const reader = createMetaClient\(read\.env, \{ readOnly: true/.test(src));

  // It must NOT depend on the unverified parameter.
  t.ok('it explicitly disables validate_only', /validateOnly:\s*false/.test(src));
  t.ok('and refuses a payload that carries execution_options',
    /execution_options !== undefined\) die/.test(src));

  // The delete targets only the id Meta returned — never a search or a sweep.
  t.ok('the delete uses the captured id', /buildDeleteObject\(createdId/.test(src));

  // IT MUST PRINT WHAT META SAID. The first real run reported
  // "meta_rejected_request (code 100)" and nothing else, which named the
  // failure without diagnosing it. Asserted at source because the printing is
  // the deliverable — a mutation replacing `e.detail` with null escaped every
  // other check in this suite.
  t.ok('it reads the scrubbed error detail', /const d = e\.detail/.test(src));
  t.ok('and does not hard-code it away', !/const d = null/.test(src));
  for (const field of ['d.message', 'd.type', 'd.subcode', 'd.userTitle', 'd.userMessage', 'd.fbtraceId']) {
    t.ok(`it prints ${field}`, src.includes(field));
  }
  t.ok('and says so when Meta returned no body at all',
    /returned no error body/.test(src));

  const run = (args, env) => spawnSync(process.execPath, [SW, ...args], {
    cwd: REPO, encoding: 'utf8',
    env: {
      ...process.env, META_APP_ID: '1', META_APP_SECRET: 'x',
      META_SYSTEM_USER_TOKEN: 'y', META_GRAPH_VERSION: 'v26.0', ...env,
    },
  });

  const noFlag = run(['act_1337142524853681'], { META_ENABLE_ADS: 'true' });
  t.is('without the approval flag it exits 2', noFlag.status, 2);

  const noSwitch = run(['act_1337142524853681', '--approve-sandbox-write'], {});
  t.is('without META_ENABLE_ADS it exits 2', noSwitch.status, 2);

  const pubOn = run(['act_1337142524853681', '--approve-sandbox-write'],
    { META_ENABLE_ADS: 'true', META_ENABLE_PUBLISH: 'true' });
  t.is('with publishing enabled it refuses', pubOn.status, 2);

  // THE CONFIGURED-LIVE guard.
  const live = run(['act_2324508798297966', '--approve-sandbox-write'],
    { META_ENABLE_ADS: 'true', META_AD_ACCOUNT_ID: 'act_2324508798297966' });
  // The MESSAGE assertion is the one doing the work here. Exit code 2 is
  // ambiguous — every guard in this runner aborts with it — so with the
  // configured-live guard disabled the script simply falls through to the
  // business-ownership guard and still exits 2. Verified by mutation: only
  // the message check goes red. Do not drop it as redundant.
  t.is('it refuses META_AD_ACCOUNT_ID', live.status, 2);
  t.ok('naming it as the configured account', /is META_AD_ACCOUNT_ID/.test(live.stdout));

  // The decision must be made by the PURE function, not inline — an inline
  // `businessAccounts.includes(target)` could be neutered with `if (false && ...)`
  // and every check stayed green. That gap was real and is closed here.
  // ANCHORED to the exact guard form. A looser regex matching the call
  // anywhere still passed against `if (false && ADS.isBusinessOwned(...))` —
  // the guard was neutered and the test stayed green. Two mutation attempts
  // escaped before this assertion was tight enough.
  t.ok('the live-account decision is the sole condition of the guard',
    /if \(ADS\.isBusinessOwned\(target, businessAccounts\)\) \{/.test(src));
  t.ok('and is not short-circuited', !/&&\s*ADS\.isBusinessOwned/.test(src));
  t.ok('and is not negated', !/!\s*ADS\.isBusinessOwned/.test(src));
  t.ok('and is not an inline includes() on raw strings',
    !/businessAccounts\.includes\(/.test(src));

  // THE GUARD THAT DOES NOT DEPEND ON .env BEING RIGHT: without a business id
  // the API-derived live-account check cannot be evaluated, so it refuses
  // rather than writing unguarded. Two different ids have been called "the
  // live account" in this project, so a guard keyed only on .env is not enough.
  const noBiz = run(['act_1337142524853681', '--approve-sandbox-write'],
    { META_ENABLE_ADS: 'true', META_AD_ACCOUNT_ID: 'act_9' });
  t.is('without META_BUSINESS_ID it refuses to write unguarded', noBiz.status, 2);
  t.ok('explaining that the guard cannot be evaluated',
    /live-account guard reads the business/.test(noBiz.stdout));
  t.ok('and it got as far as passing self-inspection first',
    /PASS  self-inspection/.test(noBiz.stdout));
}

{
  // isBusinessOwned — the guard that decides whether a write target is a LIVE
  // ad account. Its inputs come straight from Graph, so it is tested against
  // the shapes Graph actually returns rather than the shapes we hope for.
  // Models what /{business-id}/owned_ad_accounts returns: the canonical LIVE
  // account plus other business assets, in the shapes Graph actually uses.
  const accounts = [
    { id: 'act_2324508798297966', name: 'Si Math Ads' },   // the canonical LIVE account
    { id: 4444444444444444, name: 'B' },                   // numeric, as JSON may deliver it
    { id: '  act_999  ', name: 'C' },                      // padded
    { id: '888', name: 'D' },                              // no act_ prefix
  ];

  // The property that matters: any account the BUSINESS owns is refused as a
  // write target, whatever META_AD_ACCOUNT_ID happens to say.
  t.is('the canonical live account is refused',
    ADS.isBusinessOwned('act_2324508798297966', accounts), true);

  t.is('a numeric id from Graph still matches',
    ADS.isBusinessOwned('act_4444444444444444', accounts), true);
  t.is('a padded id still matches', ADS.isBusinessOwned('act_999', accounts), true);
  t.is('a missing act_ prefix on the account side still matches',
    ADS.isBusinessOwned('act_888', accounts), true);
  t.is('a missing act_ prefix on the target side still matches',
    ADS.isBusinessOwned('2324508798297966', accounts), true);

  t.is('the verified sandbox account is NOT business-owned',
    ADS.isBusinessOwned('act_1337142524853681', accounts), false);
  t.is('an empty target matches nothing', ADS.isBusinessOwned('', accounts), false);
  t.is('a null target matches nothing', ADS.isBusinessOwned(null, accounts), false);
  t.is('an empty account list matches nothing',
    ADS.isBusinessOwned('act_1', []), false);
  t.is('accounts with no id are skipped',
    ADS.isBusinessOwned('act_1', [{ name: 'no id' }, {}]), false);
  t.is('a bare string account entry also works',
    ADS.isBusinessOwned('act_5', ['act_5']), true);

  t.is('normalizeAccountId adds the prefix', ADS.normalizeAccountId('123'), 'act_123');
  t.is('normalizeAccountId keeps an existing prefix', ADS.normalizeAccountId('act_123'), 'act_123');
  t.is('normalizeAccountId coerces a number', ADS.normalizeAccountId(123), 'act_123');
  t.is('normalizeAccountId trims', ADS.normalizeAccountId('  act_123 '), 'act_123');
  t.is('normalizeAccountId maps empty to empty', ADS.normalizeAccountId(''), '');
  t.is('normalizeAccountId maps null to empty', ADS.normalizeAccountId(null), '');
}

{
  // The comparison script exists to RESOLVE the live-account question, so it
  // must be incapable of changing anything while it does.
  const CMP = resolve(REPO, 'scripts/meta-account-compare.mjs');
  const src = exec(readFileSync(CMP, 'utf8'));
  t.ok('it builds a readOnly client', /readOnly:\s*true/.test(src));
  t.ok('it never writes', !/\.(write|post|del)\s*\(/.test(src));
  t.ok('it grants no capabilities', !/capabilities:/.test(src));
  t.ok('it refuses any non-GET before sending', /refused \$\{m\}|refused \$\{/.test(src));
  t.ok('it prints META_AD_ACCOUNT_ID rather than assuming it',
    /META_AD_ACCOUNT_ID = \$\{configured/.test(src));
  t.ok('it decides ownership with the tested pure function',
    /ADS\.isBusinessOwned\(id, owned\)/.test(src));

  const noArgs = spawnSync(process.execPath, [CMP], {
    cwd: REPO, encoding: 'utf8',
    env: { ...process.env, META_APP_ID: '1', META_APP_SECRET: 'x',
      META_SYSTEM_USER_TOKEN: 'y', META_GRAPH_VERSION: 'v26.0' },
  });
  t.is('it refuses with no account ids', noArgs.status, 2);
}

// ══ 5e · is_adset_budget_sharing_enabled ═════════════════════════════════
t.section('5e · is_adset_budget_sharing_enabled');

{
  // Meta rejected the sandbox create with code 100 / subcode 4834011:
  //   "You must specify True or False in the field
  //    is_adset_budget_sharing_enabled if you are not using campaign budget."
  // Added from that evidence, hardcoded false — true opts into budget
  // redistribution between ad sets, which would be a latent spend behaviour
  // riding on an object whose whole purpose is to be inert.
  const probe = ADS.buildCampaign({
    adAccountId: 'act_1337142524853681',
    name: 'Si Math — sandbox write probe',
    objective: 'OUTCOME_TRAFFIC',
    maxDailyBudget: 0,
    validateOnly: false,
  });

  // 1 · present
  t.ok('the payload contains is_adset_budget_sharing_enabled',
    'is_adset_budget_sharing_enabled' in probe.body);

  // 2 · a real boolean, never a string. Meta says "True or False"; a string
  //     "false" is truthy in JS and would read as the opposite of intent to
  //     anything reasoning about it on this side.
  t.is('its type is boolean', typeof probe.body.is_adset_budget_sharing_enabled, 'boolean');
  t.ok('it is not the string "false"', probe.body.is_adset_budget_sharing_enabled !== 'false');
  t.ok('it is not the string "true"', probe.body.is_adset_budget_sharing_enabled !== 'true');

  // 3 · the intended fixed value
  t.is('its value is false', probe.body.is_adset_budget_sharing_enabled, false);

  // ...and it is not caller-supplied, exactly like status. A boolean argument
  // that changes money behaviour is one typo from changing it.
  const forced = ADS.buildCampaign({
    adAccountId: 'act_1', name: 'x', objective: 'OUTCOME_TRAFFIC', maxDailyBudget: 0,
    is_adset_budget_sharing_enabled: true, isAdsetBudgetSharingEnabled: true,
  });
  t.is('a caller cannot force it true', forced.body.is_adset_budget_sharing_enabled, false);

  // Present on every shape the builder produces, budgeted or not, validated or
  // real — so no branch can silently omit it again.
  const withBudget = ADS.buildCampaign({
    adAccountId: 'act_1', name: 'x', objective: 'OUTCOME_TRAFFIC',
    dailyBudget: 1000, maxDailyBudget: 5000,
  });
  t.is('still present when a campaign budget IS set',
    withBudget.body.is_adset_budget_sharing_enabled, false);
  const validated = ADS.buildCampaign({
    adAccountId: 'act_1', name: 'x', objective: 'OUTCOME_TRAFFIC', maxDailyBudget: 0,
  });
  t.is('still present on the validate-only shape',
    validated.body.is_adset_budget_sharing_enabled, false);

  // Source-level: a literal, not an expression. 4 and 5 in the brief — the
  // mutations that remove it or stringify it are proven to fail below.
  const adsSrc = exec(readFileSync(
    resolve(REPO, 'supabase/functions/_shared/meta-ads.core.ts'), 'utf8'));
  t.ok('the source carries a boolean literal',
    /is_adset_budget_sharing_enabled:\s*false,/.test(adsSrc));
  t.ok('and never a quoted string',
    !/is_adset_budget_sharing_enabled:\s*['"]/.test(adsSrc));
  t.ok('and never a caller-supplied expression',
    !/is_adset_budget_sharing_enabled:\s*args\./.test(adsSrc));

  // 8 · nothing else crept in with it. The probe stays inert in every other
  //     dimension: no budget, no ad set, no ad, no creative, no targeting.
  t.ok('no budget field', probe.body.daily_budget === undefined &&
    probe.body.lifetime_budget === undefined);
  t.is('every payload key is on the allow-list',
    Object.keys(probe.body).filter((k) => !CAMPAIGN_KEYS_ALLOWED.includes(k)), []);
  // ...and the allow-list itself names nothing that creates an ad set, ad,
  // creative or targeting spec. Asserted so widening it stays a decision.
  t.is('the allow-list introduces no ad-object field',
    CAMPAIGN_KEYS_ALLOWED.filter((k) => ['adset_id', 'adsets', 'creative', 'adcreative',
      'targeting', 'bid_amount', 'bid_strategy', 'promoted_object'].includes(k)), []);
  t.is('status is still PAUSED', probe.body.status, 'PAUSED');
  t.is('it still targets the campaigns edge only', probe.path,
    'act_1337142524853681/campaigns');

  // No content-publishing endpoint entered the ads builder.
  for (const n of ['/media', '/feed', 'media_publish', '/photos', '/videos', 'video_reels']) {
    t.ok(`the ads builder references no ${n}`, !adsSrc.includes(n));
  }
}

// ══ 5f · the insights reader is read-only ════════════════════════════════
t.section('5f · insights reader');

{
  const INS = resolve(REPO, 'scripts/meta-insights.mjs');
  const src = exec(readFileSync(INS, 'utf8'));

  t.ok('it builds a readOnly client', /readOnly:\s*true/.test(src));
  t.ok('it grants NO capability at all', !/capabilities:/.test(src));
  t.ok('it never writes', !/\.(write|post|del)\s*\(/.test(src));
  t.ok('it never sets dryRun false', !/dryRun:\s*false/.test(src));
  t.ok('it requires no META_ENABLE_ADS', !/enableAds/.test(src));
  t.ok('it refuses any non-GET before sending', /refused \$\{m\}/.test(src));

  // It must not invent metric names when Meta refuses one.
  t.ok('rejected metrics are collected, not substituted', /rejected\.push/.test(src));
  t.ok('and it says so explicitly', /NOT replaced/.test(src));
  // Assert the MECHANISM, not the word. A keyword scan fired on the very
  // sentence that documents the correct behaviour ("A substitute chosen
  // without evidence..."), which is the same substring trap that made
  // is_adset_budget_sharing_enabled read as an ad-set field. What matters is
  // that exactly one thing decides the metric names.
  t.ok('the candidate list comes only from insightsParams',
    /const CANDIDATES = params\.fields\.split\(','\)/.test(src));
  t.is('and no second metric list exists in the script',
    (src.match(/\[[^\]]*'(impressions|clicks|spend|ctr|cpc|cpm)'/g) ?? []), []);

  // Least-assumption first: the no-fields probe must precede the candidate batch.
  const stepA = src.indexOf("date_preset: PRESET, level: LEVEL }");
  const stepB = src.indexOf('ADS.insightsParams');
  t.ok('the no-fields probe comes before the candidate batch', stepA >= 0 && stepA < stepB);

  // Empty data must read as success, not failure — the recurring mistake.
  t.ok('an empty result is treated as a successful read',
    /not a failure/.test(src));

  const noConf = spawnSync(process.execPath, [INS], {
    cwd: REPO, encoding: 'utf8',
    env: { ...process.env, META_APP_ID: '', META_APP_SECRET: '',
      META_SYSTEM_USER_TOKEN: '', META_GRAPH_VERSION: '' },
  });
  t.is('it refuses without configuration', noConf.status, 2);
}

{
  // insightsParams was dead code until now. Assert its shape, since the reader
  // derives its entire candidate list from it.
  const p = ADS.insightsParams();
  t.is('default preset is last_30d', p.date_preset, 'last_30d');
  t.is('default level is account', p.level, 'account');
  t.ok('it returns a comma-separated field list', typeof p.fields === 'string' && p.fields.includes(','));
  t.ok('every candidate is a bare metric name',
    p.fields.split(',').every((f) => /^[a-z_]+$/.test(f)));
  const custom = ADS.insightsParams({ datePreset: 'last_90d', level: 'campaign' });
  t.is('the preset is overridable', custom.date_preset, 'last_90d');
  t.is('the level is overridable', custom.level, 'campaign');
}

// ══ 6 · the whole-run total ═══════════════════════════════════════════════
t.section('6 · total network writes across this entire suite');

t.is('POST requests sent',   calls.POST, 0);
t.is('DELETE requests sent', calls.DELETE, 0);
t.is('other writes sent',    calls.other, 0);
t.note(`GET requests sent: ${calls.GET} (this suite performs no reads either)`);

t.done();
