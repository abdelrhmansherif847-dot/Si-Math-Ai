#!/usr/bin/env node
// First real write — ONE campaign, created and deleted, in a SANDBOX account.
//
//   META_ENABLE_ADS=true node --env-file=.env \
//     scripts/meta-sandbox-write.mjs act_1337142524853681 --approve-sandbox-write
//
// Sends exactly one POST and one DELETE, both against the sandbox account
// given on the command line. A Meta Sandbox Ad Account does not deliver ads
// and accumulates no impressions or spend, so this exercises the complete
// write path — auth, appsecret_proof, POST transport, error mapping, rollback
// — with no possibility of spend and nothing externally visible.
//
// IT DOES NOT USE validate_only. Support for execution_options on this exact
// endpoint at v26.0 could not be confirmed against Meta's own reference, so
// the integration does not depend on it. The sandbox provides the safety that
// the unverified parameter was going to.
//
// =====================================================================
// WHY THE LIVE-ACCOUNT GUARD IS NOT JUST "!= META_AD_ACCOUNT_ID"
// =====================================================================
// Two different ids have been described as "the live Si Math Ads account" in
// this project's history, and .env holds only one of them. A guard keyed on
// that single value therefore protects whichever id happens to be configured
// and leaves the other unguarded — which is the whole failure it exists to
// prevent.
//
// So the real guard is API-DERIVED and does not depend on resolving that
// question: a sandbox account is created under the APP, while every live
// account belongs to the BUSINESS PORTFOLIO. Before writing anything, this
// asks Meta which ad accounts the business owns or is a client of, and
// REFUSES if the target is among them. An account the business owns is a live
// account, whatever .env says about it.
// =====================================================================
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
const PUB = await load('supabase/functions/_shared/meta-publish.core.ts');

const SECRETS = SECRET_ENV.map((k) => (process.env[k] ?? '').trim()).filter(Boolean);
const say = (s = '') => console.log(redactSecrets(String(s), SECRETS));
const die = (m) => { say(`\n  ABORTED — ${m}\n`); process.exit(2); };

say('\n═══════════════════════════════════════════════════════════════');
say(' Sandbox write — one campaign, created then deleted');
say('═══════════════════════════════════════════════════════════════');

// ── guard 1 · explicit approval ────────────────────────────────────────────
if (!process.argv.includes('--approve-sandbox-write')) {
  die('missing --approve-sandbox-write. This sends real POST and DELETE requests.');
}
const arg = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? '';
if (!arg) die('usage: scripts/meta-sandbox-write.mjs act_<SANDBOX_ID> --approve-sandbox-write');
const target = arg.startsWith('act_') ? arg : `act_${arg}`;

const read = readMetaEnv((k) => process.env[k]);
if (!read.env) die(`missing configuration: ${read.missingRequired.join(', ') || read.versionError}`);
if (!read.env.enableAds) {
  die('META_ENABLE_ADS is not "true". Supply it as a process-scoped override for this ' +
      'single run — do not edit .env.');
}
if (read.env.enablePublish) die('META_ENABLE_PUBLISH is enabled. This is an ads-only operation.');

// ── guard 2 · not the configured live account ──────────────────────────────
const configured = read.env.adAccountId
  ? (read.env.adAccountId.startsWith('act_') ? read.env.adAccountId : `act_${read.env.adAccountId}`)
  : '';
if (configured && target === configured) {
  die(`${target} is META_AD_ACCOUNT_ID. This writes to a SANDBOX account only.`);
}

// ── guard 3 · self-inspection ──────────────────────────────────────────────
// SELF-INSPECT-BEGIN — excluded from its own scan; it must name what it forbids.
{
  const raw = readFileSync(SELF, 'utf8');
  const a = raw.indexOf('// SELF-INSPECT-BEGIN');
  const b = raw.lastIndexOf('// SELF-INSPECT-END');
  if (a < 0 || b <= a) die('self-inspection: exclusion fence missing');
  const src = (raw.slice(0, a) + raw.slice(b))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  for (const n of ['/media', '/feed', '/photos', '/videos', 'media_publish', 'video_reels']) {
    if (src.includes(n)) die(`self-inspection: references ${n}`);
  }
  if (/publish:\s*true/.test(src)) die('self-inspection: grants the publish capability');
  // Counts writer.write(, which is what this file actually calls. An earlier
  // version counted client.write( — a name that appears nowhere here — so it
  // found zero and aborted. It failed CLOSED, which is the right direction,
  // but a guard that cannot see the calls it governs is not a guard.
  const writes = (src.match(/writer\.write\s*\(/g) ?? []).length;
  if (writes !== 2) die(`self-inspection: expected exactly 2 writer.write() calls (create + delete), found ${writes}`);
  // Reads must go through a client that cannot write, so a verification path
  // can never become a write path.
  if (!/const reader = createMetaClient\([^)]*\{[^}]*readOnly: true/.test(src.replace(/\n/g, ' '))) {
    die('self-inspection: the reader client is not readOnly');
  }
  say('  PASS  self-inspection — ads only, no content endpoints, readOnly reader, one create + one delete');
}
// SELF-INSPECT-END

const calls = { GET: 0, POST: 0, DELETE: 0, other: 0 };
const countingFetch = async (url, init) => {
  const m = (init?.method ?? 'GET').toUpperCase();
  if (m in calls) calls[m] += 1; else calls.other += 1;
  if (calls.POST > 1) throw new Error('refused: a second POST was attempted');
  if (calls.DELETE > 1) throw new Error('refused: a second DELETE was attempted');
  if (!['GET', 'POST', 'DELETE'].includes(m)) throw new Error(`refused: method ${m}`);
  return fetch(url, init);
};

// Read-only client for every verification read, so a read path cannot write.
const reader = createMetaClient(read.env, { readOnly: true, fetchImpl: countingFetch });
// Write client: ads capability only, dry run OFF for this approved operation.
const writer = createMetaClient(read.env, {
  dryRun: false, capabilities: { ads: true }, fetchImpl: countingFetch,
});

// ── guard 4 · the API-derived live-account check ───────────────────────────
say('\n── live-account guard ──');
if (!read.env.businessId) {
  die('META_BUSINESS_ID is not set. The live-account guard reads the business\'s own ' +
      'ad accounts and cannot run without it. Refusing rather than writing unguarded.');
}
let businessAccounts = [];
try {
  for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
    const r = await reader.get(`${read.env.businessId}/${edge}`, { fields: 'id,name', limit: '200' });
    for (const row of r?.data ?? []) businessAccounts.push(row);
  }
} catch (e) {
  die(`could not read the business's ad accounts: ${e?.message ?? e}. The guard cannot be ` +
      'evaluated, so nothing is written. This needs business_management.');
}
say(`  business owns/clients ${businessAccounts.length} ad account(s)`);
for (const row of businessAccounts) {
  const id = ADS.normalizeAccountId(row?.id);
  say(`    ${id}${row?.name ? `  ${row.name}` : ''}${id === target ? '   ← TARGET' : ''}`);
}

// The decision is made by a PURE function in meta-ads.core.ts, unit-tested
// against numeric ids, missing act_ prefixes and padded values. It used to be
// an inline `businessAccounts.includes(target)` on raw strings, which both
// missed those cases and could be neutered by an edit no test would catch.
if (ADS.isBusinessOwned(target, businessAccounts)) {
  die(`${target} belongs to the Business Portfolio, which means it is a LIVE ad account. ` +
      'A sandbox account is created under the App and is not owned by the business. ' +
      'Refusing to write.');
}
say(`  PASS  ${target} is NOT owned by the business — consistent with a sandbox account`);

// ── the payload ────────────────────────────────────────────────────────────
const createReq = ADS.buildCampaign({
  adAccountId: target,
  name: 'Si Math — sandbox write probe',
  objective: 'OUTCOME_TRAFFIC',
  maxDailyBudget: read.env.adsMaxDailyBudget,
  validateOnly: false,          // deliberate: we do not depend on execution_options
});

say('\n── pre-execution gate ──');
say(`  target   : ${target}   (sandbox)`);
say(`  endpoint : POST /${read.env.graphVersion}/${createReq.path}`);
say('  payload  :');
for (const [k, v] of Object.entries(createReq.body)) say(`      ${k}: ${JSON.stringify(v)}`);
if (createReq.body.status !== 'PAUSED') die(`status is ${createReq.body.status}, expected PAUSED`);
if (createReq.body.daily_budget !== undefined) die('payload carries a budget');
if (createReq.body.execution_options !== undefined) die('payload carries execution_options');
say('  PASS  status PAUSED · no budget · no execution_options · single create');

// ── baseline ───────────────────────────────────────────────────────────────
const count = async () => {
  const r = await reader.get(`${target}/campaigns`, { summary: 'total_count', limit: '1' });
  return r?.summary?.total_count ?? null;
};
say('\n── before ──');
let before;
try { before = await count(); } catch (e) { die(`baseline read failed: ${e?.message ?? e}. Nothing written.`); }
say(`  campaigns: ${before}`);

// ── the create ─────────────────────────────────────────────────────────────
say('\n── create ──');
let createdId = null;
let createErr = null;
try {
  const out = await writer.write(createReq);
  createdId = out?.response?.id ?? null;
  say(`  Meta response: ${JSON.stringify(out.response)}`);
} catch (e) {
  createErr = e;
  say(`  Meta REJECTED: ${e.message}${e.code ? ` (code ${e.code})` : ''}` +
      `${e.fbtraceId ? ` fbtrace ${e.fbtraceId}` : ''}`);
}

// ── verify + delete ────────────────────────────────────────────────────────
let verified = null;
let deleted = false;
if (createdId) {
  try {
    verified = await reader.get(createdId, { fields: 'id,name,status,objective' });
    say(`  created campaign: ${JSON.stringify(verified)}`);
  } catch (e) { say(`  verification read failed: ${e?.message ?? e}`); }

  say('\n── delete (rollback) ──');
  try {
    // Deletes ONLY the id Meta just returned. Never a search, never a sweep.
    const out = await writer.write(PUB.buildDeleteObject(createdId, 'ads'));
    deleted = true;
    say(`  deleted ${createdId}: ${JSON.stringify(out.response)}`);
  } catch (e) {
    say(`  DELETE FAILED for ${createdId}: ${e?.message ?? e}`);
    say(`  Remove it manually in Ads Manager for ${target}.`);
  }
}

say('\n── after ──');
let after = null;
try { after = await count(); } catch (e) { say(`  read failed: ${e?.message ?? e}`); }
say(`  campaigns: ${after}   (before ${before})`);

// ── verdict ────────────────────────────────────────────────────────────────
say('\n── network calls by method ──');
for (const k of ['GET', 'POST', 'DELETE', 'other']) say(`  ${k.padEnd(6)} ${calls[k]}`);

const line = (ok, label) => { say(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); return ok; };
say('\n── verification ──');
const r1 = line(!createErr && !!createdId, `campaign created in the sandbox${createdId ? ` (${createdId})` : ''}`);
const r2 = line(verified?.status === 'PAUSED', `created campaign is PAUSED (${verified?.status ?? 'unknown'})`);
const r3 = line(deleted, 'campaign deleted again');
const r4 = line(before !== null && after === before, `campaign count returned to baseline (${before} → ${after})`);
const r5 = line(calls.POST === 1 && calls.DELETE === 1 && calls.other === 0,
  `exactly one POST and one DELETE (${calls.POST}/${calls.DELETE})`);

const green = r1 && r2 && r3 && r4 && r5;
say('\n═══════════════════════════════════════════════════════════════');
say(green
  ? ' SANDBOX WRITE GREEN — the write path works end to end, and rolls back.\n' +
    ' No spend, nothing externally visible, live account never contacted.\n' +
    ' Restore nothing: META_ENABLE_ADS was a process-scoped override.'
  : ' RED — see the failures above.');
say('═══════════════════════════════════════════════════════════════\n');
process.exit(green ? 0 : 1);
