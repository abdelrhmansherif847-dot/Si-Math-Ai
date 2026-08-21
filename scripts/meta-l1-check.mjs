#!/usr/bin/env node
// L1-0 — the write-path dry run.
//
//   node --env-file=.env scripts/meta-l1-check.mjs
//
// CONSTRUCTS AND VALIDATES EVERY L1 WRITE REQUEST AND SENDS NONE OF THEM.
// Zero POST requests. Zero DELETE requests. No Instagram container, no
// Facebook post, no campaign, no validate_only call, no spend, no deletion.
//
// This is not a promise, it is arithmetic: the fetch implementation handed to
// the client below COUNTS every call by method and this script exits non-zero
// if that count is anything but zero for POST and DELETE. A future edit that
// starts sending writes fails the script that is supposed to prove it doesn't.
//
// WHAT IT IS FOR
// --------------
// The adapter gained a write path. That is the moment it stops being
// structurally incapable of publishing, and it deserves to be proven in
// isolation before a single byte reaches Meta. This exercises the gates, the
// builders and the request shapes with nothing at risk.
//
// L1-1 (a real validate_only round-trip) is a SEPARATE, separately-approved
// step. This script cannot perform it: it hardcodes dryRun: true.
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

if (!process.env.__META_CHECK_REEXEC && !process.execArgv.some((a) => a.includes('strip-types'))) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, __META_CHECK_REEXEC: '1' } },
  );
  process.exit(r.status ?? 2);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const load = (rel) => import(pathToFileURL(resolve(REPO, rel)).href);

const { readMetaEnv, createMetaClient, redactSecrets, SECRET_ENV } =
  await load('supabase/functions/_shared/meta-graph.core.ts');
const PUB = await load('supabase/functions/_shared/meta-publish.core.ts');
const ADS = await load('supabase/functions/_shared/meta-ads.core.ts');

const SECRETS = SECRET_ENV.map((k) => (process.env[k] ?? '').trim()).filter(Boolean);
const safe = (s) => redactSecrets(String(s), SECRETS);
const say = (s = '') => console.log(safe(s));

const read = readMetaEnv((k) => process.env[k]);
if (!read.env) {
  say(`\n  L1-0 cannot run — missing: ${read.missingRequired.join(', ') || read.versionError}\n`);
  process.exit(2);
}

// ── the counter that makes the guarantee checkable ─────────────────────────
const calls = { GET: 0, POST: 0, DELETE: 0, other: 0 };
const countingFetch = async (_url, init) => {
  const m = (init?.method ?? 'GET').toUpperCase();
  if (m in calls) calls[m] += 1; else calls.other += 1;
  // A write reaching here is already a failure of the design. Refuse it
  // outright rather than letting it proceed, so this script cannot become the
  // thing that performs the first real write by accident.
  if (m !== 'GET') throw new Error(`L1-0 refused a ${m} that reached the network layer`);
  throw new Error('L1-0 performs no network reads either');
};

// dryRun: true is hardcoded. It is not read from the environment, so no
// env edit can turn this script into a live writer.
const client = createMetaClient(read.env, {
  dryRun: true,
  capabilities: { publish: true, ads: true },
  fetchImpl: countingFetch,
});

say('\n═══════════════════════════════════════════════════════════════');
say(' L1-0 — write-path dry run (CONSTRUCTS ONLY, SENDS NOTHING)');
say('═══════════════════════════════════════════════════════════════');
say(` Graph version   : ${read.env.graphVersion}`);
say(` dryRun          : ${client.dryRun}`);
say(` publish enabled : ${client.canWrite('publish')}   (client capability, not the env switch)`);
say(` ads enabled     : ${client.canWrite('ads')}`);
say(` env switches    : META_ENABLE_PUBLISH=${read.env.enablePublish} ` +
    `META_ENABLE_ADS=${read.env.enableAds}`);
say(` ads budget cap  : ${read.env.adsMaxDailyBudget || '(unset — every budget refused)'}`);

// A placeholder that is deliberately NOT a real asset: nothing here is sent,
// and pointing at a real image would suggest otherwise.
const SAMPLE_IMAGE = 'https://si-math-ai.com/assets/example-creative.png';

const planned = [
  ['L1-2  Instagram container', () => PUB.buildIgImageContainer({
    igUserId: read.env.igUserId || '<META_IG_USER_ID unset>',
    imageUrl: SAMPLE_IMAGE,
    caption: 'Si Math AI — dry-run sample caption.',
  })],
  ['L1-3  Page unpublished post', () => PUB.buildPageUnpublishedPost({
    pageId: read.env.pageId || '<META_PAGE_ID unset>',
    message: 'Si Math AI — dry-run sample post. Not published.',
  })],
  ['L1-3  rollback delete', () => PUB.buildDeleteObject('<post-id-from-previous-step>')],
  ['L1-1  campaign validate-only', () => ADS.buildCampaign({
    adAccountId: read.env.adAccountId || '<META_AD_ACCOUNT_ID unset>',
    name: 'Si Math — dry run',
    objective: 'OUTCOME_TRAFFIC',
    maxDailyBudget: read.env.adsMaxDailyBudget,
  })],
];

let built = 0;
let failed = 0;

say('\n── requests that WOULD be sent ──');
for (const [label, build] of planned) {
  let req;
  try {
    req = build();
  } catch (e) {
    failed++;
    say(`\n  BUILD-FAIL  ${label}`);
    say(`        ${e?.message ?? e}`);
    continue;
  }
  const outcome = await client.write(req);
  built++;
  say(`\n  ${outcome.sent ? 'SENT!!' : 'DRYRUN'}  ${label}`);
  say(`        ${req.method} ${req.path}   [capability: ${req.capability}]`);
  say(`        ${req.summary}`);
  say(`        body: ${JSON.stringify(req.body)}`);
  if (outcome.sent) failed++;   // must never happen
}

// ── the gates, exercised rather than described ─────────────────────────────
say('\n── gate checks ──');
// AWAITED. client.write() is async, so it REJECTS rather than throwing
// synchronously — a try/catch around a non-awaited call catches nothing and
// reports every gate as unenforced while leaving an unhandled rejection
// behind. The first run of this script did exactly that.
const gate = async (label, fn) => {
  let threw = null;
  try { await fn(); } catch (e) { threw = e; }
  const ok = threw !== null;
  say(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? ` (${threw.name})` : ''}`);
  return ok;
};

const readOnlyClient = createMetaClient(read.env, {
  readOnly: true, capabilities: { publish: true, ads: true }, dryRun: false,
  fetchImpl: countingFetch,
});
const noCapsClient = createMetaClient(read.env, { dryRun: true, fetchImpl: countingFetch });

let gatesOk = 0;
const sample = PUB.buildPageUnpublishedPost({ pageId: 'P', message: 'x' });
gatesOk += await gate('a read-only client refuses a write even with capabilities on',
  () => readOnlyClient.write(sample)) ? 1 : 0;
gatesOk += await gate('a client with no capabilities refuses a publish write',
  () => noCapsClient.write(sample)) ? 1 : 0;
gatesOk += await gate('a client with no capabilities refuses an ads write',
  () => noCapsClient.write(ADS.buildCampaign({
    adAccountId: 'act_1', name: 'x', objective: 'OUTCOME_TRAFFIC', maxDailyBudget: 0,
  }))) ? 1 : 0;
say(`  ..    canWrite('publish') on a capability-less client: ${noCapsClient.canWrite('publish')}`);

// ── the arithmetic ─────────────────────────────────────────────────────────
const writes = calls.POST + calls.DELETE + calls.other;
say('\n── network calls actually made ──');
say(`  GET    ${calls.GET}`);
say(`  POST   ${calls.POST}`);
say(`  DELETE ${calls.DELETE}`);
say(`  other  ${calls.other}`);

const green = writes === 0 && failed === 0 && gatesOk === 3;
say('\n═══════════════════════════════════════════════════════════════');
say(` ${built} request(s) constructed · ${writes} network write(s) sent · ${gatesOk}/3 gates enforced`);
say(green
  ? ' L1-0 GREEN — write path built and gated. ZERO writes sent to Meta.\n' +
    ' L1-1 (a real validate_only round-trip) needs separate explicit approval.'
  : ' L1-0 RED — see above. Do NOT proceed.');
say('═══════════════════════════════════════════════════════════════\n');
process.exit(green ? 0 : 1);
