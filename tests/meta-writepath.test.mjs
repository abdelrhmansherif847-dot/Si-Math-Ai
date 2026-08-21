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
const L11_PATH = resolve(REPO, 'scripts/meta-l1-1-validate.mjs');
const L11_RAW = readFileSync(L11_PATH, 'utf8');

const exec = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

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
    adAccountId: '3317656315040315', name: 'test',
    objective: 'OUTCOME_TRAFFIC', maxDailyBudget: 5000,
  });
  t.is('the ad account gets its act_ prefix', r.path, 'act_3317656315040315/campaigns');
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

// ══ 5b · L1-1 · the single validate_only runner ═══════════════════════════
t.section('5b · L1-1 runner');

{
  // Source, EXCLUDING the self-inspection fence — that region has to name the
  // endpoints it forbids, exactly as the runner's own guard does.
  const fs = L11_RAW.indexOf('// SELF-INSPECT-BEGIN');
  const fe = L11_RAW.lastIndexOf('// SELF-INSPECT-END');
  t.ok('the runner carries a self-inspection fence', fs >= 0 && fe > fs);
  const outside = exec(L11_RAW.slice(0, fs) + L11_RAW.slice(fe));

  for (const needle of ['/media', '/feed', '/photos', '/videos', 'media_publish',
    '/adsets', '/adcreatives', 'video_reels']) {
    t.ok(`the runner references no ${needle}`, !outside.includes(needle));
  }
  t.ok('the runner names no DELETE', !/['"]DELETE['"]/.test(outside));
  t.is('and contains EXACTLY one client.write() call',
    (outside.match(/client\.write\s*\(/g) ?? []).length, 1);

  // Ads capability only — a publish write would be refused by the client even
  // if the runner somehow attempted one.
  t.ok('the runner grants only the ads capability',
    /capabilities:\s*\{\s*ads:\s*true\s*\}/.test(outside));
  t.ok('and never grants publish', !/publish:\s*true/.test(outside));
  t.ok('it sets dryRun: false for this one operation', /dryRun:\s*false/.test(outside));
}

{
  // The guards, exercised by actually running the script. No network is
  // reached: both aborts happen before any request is built.
  const run = (env) => spawnSync(process.execPath, [L11_PATH], {
    cwd: REPO, encoding: 'utf8',
    env: { ...process.env, __META_CHECK_REEXEC: '', ...env },
  });

  const noFlag = run({});
  t.is('without the approval flag it exits 2', noFlag.status, 2);
  t.ok('naming the flag', /--approve-single-validate-only/.test(noFlag.stdout));

  const withFlag = spawnSync(process.execPath, [L11_PATH, '--approve-single-validate-only'], {
    cwd: REPO, encoding: 'utf8',
    env: {
      ...process.env, META_APP_ID: '1', META_APP_SECRET: 'x',
      META_SYSTEM_USER_TOKEN: 'y', META_GRAPH_VERSION: 'v26.0',
      META_AD_ACCOUNT_ID: 'act_1', META_ENABLE_ADS: 'false',
    },
  });
  t.is('with the flag but ads disabled it still exits 2', withFlag.status, 2);
  t.ok('naming the switch', /META_ENABLE_ADS/.test(withFlag.stdout));

  const bothOn = spawnSync(process.execPath, [L11_PATH, '--approve-single-validate-only'], {
    cwd: REPO, encoding: 'utf8',
    env: {
      ...process.env, META_APP_ID: '1', META_APP_SECRET: 'x',
      META_SYSTEM_USER_TOKEN: 'y', META_GRAPH_VERSION: 'v26.0',
      META_AD_ACCOUNT_ID: 'act_1', META_ENABLE_ADS: 'true', META_ENABLE_PUBLISH: 'true',
    },
  });
  t.is('with publishing also enabled it refuses', bothOn.status, 2);
  t.ok('because L1-1 is ads-only', /META_ENABLE_PUBLISH is enabled/.test(bothOn.stdout));
}

{
  // The payload the runner will send: inert in every dimension.
  const req = ADS.buildCampaign({
    adAccountId: 'act_3317656315040315',
    name: 'Si Math — L1-1 validation probe',
    objective: 'OUTCOME_TRAFFIC',
    maxDailyBudget: 0,
  });
  t.is('validate_only, and only validate_only', req.body.execution_options, ['validate_only']);
  t.is('status PAUSED', req.body.status, 'PAUSED');
  t.ok('no budget field at all', req.body.daily_budget === undefined);
  t.is('the payload has exactly five keys', Object.keys(req.body).sort(),
    ['execution_options', 'name', 'objective', 'special_ad_categories', 'status']);
  t.ok('no ad set, ad or creative field is present',
    !/adset|adcreative|creative|bid_amount|targeting/i.test(JSON.stringify(req.body)));
  t.is('it targets the campaigns edge only', req.path, 'act_3317656315040315/campaigns');
}

{
  // With dryRun FALSE — the L1-1 configuration — exactly one POST leaves the
  // client, and it carries validate_only.
  const local = { GET: 0, POST: 0, DELETE: 0, other: 0 };
  const bodies = [];
  const client = G.createMetaClient(ENV, {
    dryRun: false,
    capabilities: { ads: true },
    fetchImpl: async (_url, init) => {
      const m = (init?.method ?? 'GET').toUpperCase();
      if (m in local) local[m] += 1; else local.other += 1;
      if (init?.body) bodies.push(JSON.parse(init.body));
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
    },
  });

  const out = await client.write(sampleAds());
  t.is('the write reports sent: true', out.sent, true);
  t.is('exactly one POST left the client', local.POST, 1);
  t.is('no DELETE', local.DELETE, 0);
  t.is('no other method', local.other, 0);
  t.is('and the sent body carried validate_only',
    bodies[0]?.execution_options, ['validate_only']);
  t.is('and status PAUSED', bodies[0]?.status, 'PAUSED');

  // Publish stays refused on this very client.
  let e = null;
  try { await client.write(samplePublish()); } catch (err) { e = err; }
  t.is('a publish write on the L1-1 client is refused', e?.name, 'CapabilityDisabled');
  t.is('and issued no further request', local.POST, 1);

  // These POSTs are counted separately and never added to the suite total,
  // which must stay at zero — see section 6.
}

// ══ 6 · the whole-run total ═══════════════════════════════════════════════
t.section('6 · total network writes across this entire suite');

t.is('POST requests sent',   calls.POST, 0);
t.is('DELETE requests sent', calls.DELETE, 0);
t.is('other writes sent',    calls.other, 0);
t.note(`GET requests sent: ${calls.GET} (this suite performs no reads either)`);

t.done();
