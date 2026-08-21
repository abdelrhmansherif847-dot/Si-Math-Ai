#!/usr/bin/env node
// L1-1 — ONE real Meta request: a campaign payload validation.
//
//   META_ENABLE_ADS=true node --env-file=.env \
//     scripts/meta-l1-1-validate.mjs --approve-single-validate-only
//
// Sends exactly ONE POST, carrying execution_options: ['validate_only'].
// Meta runs its validation rules and performs no mutation, so no campaign is
// created, no ad set, no ad, no creative, and nothing can spend.
//
// WHY THIS CANNOT SPEND, twice over:
//   1. validate_only means nothing is persisted at all.
//   2. Even if it were, a campaign alone has no delivery path: spend requires
//      an ACTIVE ad set with a budget and schedule, plus an ad and a creative.
//      This runner creates none of them and contains no endpoint that could.
//
// GUARDS, all of which must hold or the script exits before sending:
//   · an explicit --approve-single-validate-only flag
//   · META_ENABLE_ADS === 'true', supplied as a PROCESS-SCOPED override
//   · META_ENABLE_PUBLISH must NOT be enabled
//   · self-inspection: this file must contain no object-creating endpoint,
//     no DELETE, and exactly one client.write() call
//   · the built payload must carry validate_only and status PAUSED
//
// It counts every network call by method and fails if the totals are anything
// other than one POST and the verification GETs.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SELF), '..');
const load = (rel) => import(pathToFileURL(resolve(REPO, rel)).href);

const { readMetaEnv, createMetaClient, redactSecrets, SECRET_ENV } =
  await load('supabase/functions/_shared/meta-graph.core.ts');
const ADS = await load('supabase/functions/_shared/meta-ads.core.ts');

const SECRETS = SECRET_ENV.map((k) => (process.env[k] ?? '').trim()).filter(Boolean);
const safe = (s) => redactSecrets(String(s), SECRETS);
const say = (s = '') => console.log(safe(s));
const die = (msg, code = 2) => { say(`\n  ABORTED — ${msg}\n`); process.exit(code); };

say('\n═══════════════════════════════════════════════════════════════');
say(' L1-1 — single validate_only campaign request');
say('═══════════════════════════════════════════════════════════════');

// ── guard 1 · explicit approval flag ───────────────────────────────────────
if (!process.argv.includes('--approve-single-validate-only')) {
  die('missing --approve-single-validate-only. This script sends a real request ' +
      'to Meta and will not run without the flag.');
}

const read = readMetaEnv((k) => process.env[k]);
if (!read.env) die(`missing configuration: ${read.missingRequired.join(', ') || read.versionError}`);
if (!read.env.adAccountId) die('META_AD_ACCOUNT_ID is not set');

// ── guard 2 · the ads switch, and ONLY the ads switch ──────────────────────
if (!read.env.enableAds) {
  die('META_ENABLE_ADS is not "true". Supply it as a process-scoped override ' +
      'for this single run:  META_ENABLE_ADS=true node --env-file=.env ' +
      'scripts/meta-l1-1-validate.mjs --approve-single-validate-only');
}
if (read.env.enablePublish) {
  die('META_ENABLE_PUBLISH is enabled. L1-1 is an ads-only operation and refuses ' +
      'to run with the publishing switch on.');
}

// ── guard 3 · self-inspection ──────────────────────────────────────────────
// "Verify that no object-creating follow-up endpoints exist in the runner",
// enforced against this file's own bytes rather than asserted in a comment.
// SELF-INSPECT-BEGIN — this region is excluded from its own scan.
// It has to name the strings it forbids, so scanning it would make the guard
// fire on its own needles. It did, on the first run: "this runner references
// /media", from the array below. The guard failed CLOSED, which is the right
// direction to fail, but it was still wrong — so the region is fenced off
// explicitly rather than the needles being obfuscated to slip past it.
{
  const raw = readFileSync(SELF, 'utf8');
  const fenceStart = raw.indexOf('// SELF-INSPECT-BEGIN');
  // lastIndexOf, NOT indexOf. The first occurrence of the closing marker in
  // this file is the string literal on this very line, which sits ABOVE the
  // forbidden-list array — so indexOf closed the fence early and the guard
  // scanned the array it was meant to skip. The real closing marker is the
  // last occurrence.
  const fenceEnd = raw.lastIndexOf('// SELF-INSPECT-END');
  if (fenceStart < 0 || fenceEnd < 0 || fenceEnd < fenceStart) {
    die('self-inspection: the exclusion fence is missing — cannot scan safely');
  }
  const src = (raw.slice(0, fenceStart) + raw.slice(fenceEnd))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  const FORBIDDEN = ['/media', '/feed', '/photos', '/videos', 'media_publish',
    '/adsets', '/adcreatives', '/ads', 'video_reels'];
  for (const needle of FORBIDDEN) {
    if (src.includes(needle)) die(`self-inspection: this runner references ${needle}`);
  }
  if (/['"]DELETE['"]/.test(src)) die('self-inspection: this runner names DELETE');
  const writes = (src.match(/client\.write\s*\(/g) ?? []).length;
  if (writes !== 1) die(`self-inspection: expected exactly 1 client.write() call, found ${writes}`);
  say('  PASS  self-inspection — no object-creating endpoint, no DELETE, one write');
}
// SELF-INSPECT-END

// ── the counter ────────────────────────────────────────────────────────────
const calls = { GET: 0, POST: 0, DELETE: 0, other: 0 };
const countingFetch = async (url, init) => {
  const m = (init?.method ?? 'GET').toUpperCase();
  if (m in calls) calls[m] += 1; else calls.other += 1;
  if (m === 'POST' && calls.POST > 1) throw new Error('refused: a SECOND POST was attempted');
  if (m !== 'GET' && m !== 'POST') throw new Error(`refused: unexpected method ${m}`);
  return fetch(url, init);
};

// capabilities: ads ONLY. publish is absent, so a publish write would be
// refused by the client even if this file somehow attempted one.
const client = createMetaClient(read.env, {
  dryRun: false,
  capabilities: { ads: true },
  fetchImpl: countingFetch,
});

// ── build the payload ──────────────────────────────────────────────────────
const req = ADS.buildCampaign({
  adAccountId: read.env.adAccountId,
  name: 'Si Math — L1-1 validation probe',
  objective: 'OUTCOME_TRAFFIC',
  maxDailyBudget: read.env.adsMaxDailyBudget,
  // no dailyBudget: an inert probe requests no budget at all
});

// ── guard 4 · pre-execution gate ───────────────────────────────────────────
say('\n── pre-execution gate ──');
say(`  endpoint : POST /${read.env.graphVersion}/${req.path}`);
say(`  capability: ${req.capability}`);
say('  payload  :');
for (const [k, v] of Object.entries(req.body)) say(`      ${k}: ${JSON.stringify(v)}`);
say('  (the access_token and appsecret_proof travel in the query string and are redacted)');

const eo = req.body.execution_options;
if (!Array.isArray(eo) || eo[0] !== 'validate_only' || eo.length !== 1) {
  die(`payload is not validate_only: execution_options = ${JSON.stringify(eo)}`);
}
if (req.body.status !== 'PAUSED') die(`payload status is ${req.body.status}, expected PAUSED`);
if (req.body.daily_budget !== undefined) die('payload carries a budget; an inert probe must not');
if (req.method !== 'POST') die(`unexpected method ${req.method}`);
say('  PASS  validate_only confirmed · status PAUSED · no budget · single POST');

// ── before ─────────────────────────────────────────────────────────────────
const account = req.path.split('/')[0];
async function campaignCount() {
  const r = await client.get(`${account}/campaigns`, { summary: 'total_count', limit: '1' });
  return r?.summary?.total_count ?? null;
}
async function spendSnapshot() {
  const r = await client.get(account, { fields: 'amount_spent,spend_cap,balance,account_status' });
  return { amount_spent: r?.amount_spent ?? null, spend_cap: r?.spend_cap ?? null,
           balance: r?.balance ?? null, account_status: r?.account_status ?? null };
}

say('\n── before ──');
let before, spendBefore;
try {
  before = await campaignCount();
  spendBefore = await spendSnapshot();
} catch (e) {
  die(`baseline read failed: ${e?.message ?? e}. Nothing was sent.`);
}
say(`  campaigns   : ${before}`);
say(`  amount_spent: ${spendBefore.amount_spent}`);
say(`  spend_cap   : ${spendBefore.spend_cap}`);

// ── THE ONE REQUEST ────────────────────────────────────────────────────────
say('\n── sending the single validate_only request ──');
let outcome = null;
let failure = null;
try {
  outcome = await client.write(req);
} catch (e) {
  failure = e;
}

if (failure) {
  say(`  Meta REJECTED the payload: ${failure.message}` +
      (failure.code ? ` (code ${failure.code}${failure.subcode ? `/${failure.subcode}` : ''})` : '') +
      (failure.fbtraceId ? ` fbtrace ${failure.fbtraceId}` : ''));
} else {
  say(`  sent: ${outcome.sent}`);
  say(`  url : ${outcome.url}`);
  say(`  Meta response: ${JSON.stringify(outcome.response)}`);
}

// ── after ──────────────────────────────────────────────────────────────────
say('\n── after ──');
let after, spendAfter;
try {
  after = await campaignCount();
  spendAfter = await spendSnapshot();
} catch (e) {
  say(`  verification read failed: ${e?.message ?? e}`);
}
say(`  campaigns   : ${after}   (before ${before})`);
say(`  amount_spent: ${spendAfter?.amount_spent}   (before ${spendBefore.amount_spent})`);

// ── verdict ────────────────────────────────────────────────────────────────
const countUnchanged = before !== null && after !== null && before === after;
const spendUnchanged = spendBefore.amount_spent === spendAfter?.amount_spent;
const onePost = calls.POST === 1;
const noDelete = calls.DELETE === 0 && calls.other === 0;

say('\n── network calls by method ──');
say(`  GET    ${calls.GET}`);
say(`  POST   ${calls.POST}`);
say(`  DELETE ${calls.DELETE}`);
say(`  other  ${calls.other}`);

say('\n── verification ──');
const line = (ok, label) => say(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
line(onePost, `exactly one POST was sent (${calls.POST})`);
line(noDelete, 'no DELETE and no other method');
line(countUnchanged, `campaign count unchanged (${before} → ${after})`);
line(spendUnchanged, `amount_spent unchanged (${spendBefore.amount_spent} → ${spendAfter?.amount_spent})`);
line(!failure, failure ? 'Meta rejected the payload — see the error above' : 'Meta accepted the payload');

if (!countUnchanged && before !== null && after !== null && after > before) {
  say('\n  ⚠ A CAMPAIGN APPEARS TO HAVE BEEN CREATED. This should be impossible with');
  say('    validate_only. It is PAUSED with no ad set, no ad and no budget, so it');
  say('    CANNOT spend and is safe to leave in place. Deliberately NOT deleted here:');
  say('    automatic deletion of an object we did not expect risks removing the wrong');
  say('    one. Inspect it in Ads Manager and remove it manually if it is ours:');
  say(`      GET /${read.env.graphVersion}/${account}/campaigns?fields=id,name,status`);
}

const green = onePost && noDelete && countUnchanged && spendUnchanged && !failure;
say('\n═══════════════════════════════════════════════════════════════');
say(green
  ? ' L1-1 GREEN — payload validated, nothing created, nothing spent.\n' +
    ' Restore META_ENABLE_ADS to false (it was a process-scoped override, so\n' +
    ' simply do not pass it again). L1-2 needs separate explicit approval.'
  : ' L1-1 RED — see the failures above. Do NOT proceed.');
say('═══════════════════════════════════════════════════════════════\n');
process.exit(green ? 0 : 1);
