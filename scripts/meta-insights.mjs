#!/usr/bin/env node
// Ads Insights — READ-ONLY.
//
//   node --env-file=.env scripts/meta-insights.mjs
//   node --env-file=.env scripts/meta-insights.mjs --preset=last_90d --probe
//
// GET requests only, on a readOnly client with NO write capability granted.
// post(), del() and write() throw before reaching the network. It needs no
// META_ENABLE_ADS and changes nothing.
//
// =====================================================================
// IT DISCOVERS THE METRIC NAMES RATHER THAN ASSUMING THEM
// =====================================================================
// Meta began retiring reach and impressions metrics in June 2026, replacing
// them with Media Views / Media Viewers and a Page Viewer metric. Which names
// survive on the AD ACCOUNT insights edge at v26.0 is not something this
// project has ever confirmed, and a reporting layer built on a guessed field
// list fails at the worst moment.
//
// So the probe is deliberately ordered from least assumption to most:
//
//   Step A  GET /act_<id>/insights with NO fields parameter. Meta returns its
//           own defaults. This assumes NOTHING about which metrics exist and
//           is therefore the most trustworthy evidence available.
//   Step B  the candidate batch from insightsParams(). If Meta accepts it,
//           every name in it is valid and no further probing is needed.
//   Step C  only if B is rejected: each candidate on its own, so a single bad
//           name is identified precisely instead of condemning the batch.
//
// A REJECTED METRIC IS REPORTED, NEVER REPLACED. Guessing a substitute is how
// a reporting layer ends up quietly measuring the wrong thing.
//
// =====================================================================
// EMPTY IS NOT FAILURE
// =====================================================================
// An account with no delivery in the window returns data: [] with HTTP 200.
// That is a successful read of an account that has not spent, and it is
// reported as such. Treating it as an error would repeat the mistake this
// project has made several times already: an absence of data read as a
// failure of the thing that produced it.
// =====================================================================
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

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel) => import(pathToFileURL(resolve(REPO, rel)).href);
const { readMetaEnv, createMetaClient, redactSecrets, SECRET_ENV } =
  await load('supabase/functions/_shared/meta-graph.core.ts');
const ADS = await load('supabase/functions/_shared/meta-ads.core.ts');

const SECRETS = SECRET_ENV.map((k) => (process.env[k] ?? '').trim()).filter(Boolean);
const say = (s = '') => console.log(redactSecrets(String(s), SECRETS));
const die = (m) => { say(`\n  ABORTED — ${m}\n`); process.exit(2); };

const argOf = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const PRESET = argOf('preset', 'last_30d');
const LEVEL = argOf('level', 'account');
const ALWAYS_PROBE = process.argv.includes('--probe');

const read = readMetaEnv((k) => process.env[k]);
if (!read.env) die(`missing configuration: ${read.missingRequired.join(', ') || read.versionError}`);
if (!read.env.adAccountId) die('META_AD_ACCOUNT_ID is not set');
const account = ADS.normalizeAccountId(read.env.adAccountId);

const calls = { GET: 0, other: 0 };
const client = createMetaClient(read.env, {
  readOnly: true,                 // no capabilities granted at all
  fetchImpl: async (url, init) => {
    const m = (init?.method ?? 'GET').toUpperCase();
    if (m !== 'GET') { calls.other += 1; throw new Error(`refused ${m}`); }
    calls.GET += 1;
    return fetch(url, init);
  },
});

const detailOf = (e) => {
  const d = e?.detail ?? null;
  const classification = `${e?.message ?? e}` +
    (e?.code ? ` (code ${e.code}${e.subcode ? `/${e.subcode}` : ''})` : '') +
    (e?.status ? ` [HTTP ${e.status}]` : '');
  if (!d) return classification;
  const parts = [d.message, d.userTitle, d.userMessage, d.type ? `type ${d.type}` : '',
    d.subcode ? `subcode ${d.subcode}` : '', d.fbtraceId ? `fbtrace ${d.fbtraceId}` : '']
    .filter(Boolean).join(' · ');
  // A detail object whose every field is empty — an HTTP failure carrying no
  // Graph error body, which is what a proxy or gateway produces — must not
  // render as an empty string. That is how an abort message ends up saying
  // "could not read the Page: ." and diagnosing nothing.
  return parts || classification;
};

say('\n═══════════════════════════════════════════════════════════════');
say(' Ads Insights — READ-ONLY (no writes, no capabilities, no spend)');
say('═══════════════════════════════════════════════════════════════');
say(` account     : ${account}`);
say(` date_preset : ${PRESET}`);
say(` level       : ${LEVEL}`);
say(` client      : readOnly=${client.readOnly}`);

// ── Step A · no fields at all — Meta's own defaults ────────────────────────
say('\n── step A · Meta\'s default field set (no `fields` parameter) ──');
let defaults = null;
try {
  const r = await client.get(`${account}/insights`, { date_preset: PRESET, level: LEVEL });
  defaults = r;
  const rows = Array.isArray(r?.data) ? r.data : [];
  if (!rows.length) {
    say('  HTTP 200, data: []');
    say('  The read SUCCEEDED. The account simply has no delivery in this window —');
    say('  expected for an account that has not run ads. This is not a failure, and');
    say('  it means step A cannot reveal field names. Steps B and C still can.');
  } else {
    say(`  ${rows.length} row(s). Fields Meta returned by default:`);
    for (const k of Object.keys(rows[0])) say(`    ${k}`);
    say('\n  raw first row:');
    say(`    ${JSON.stringify(rows[0])}`);
  }
} catch (e) {
  say(`  REJECTED: ${e?.message ?? e}`);
  say(`  ${detailOf(e)}`);
  die('the account insights edge could not be read at all. Nothing further attempted.');
}

// ── Step B · the candidate batch ───────────────────────────────────────────
const params = ADS.insightsParams({ datePreset: PRESET, level: LEVEL });
const CANDIDATES = params.fields.split(',');
say(`\n── step B · candidate batch (${CANDIDATES.length}) ──`);
say(`  ${CANDIDATES.join(', ')}`);

let batchOk = false;
let batchErr = null;
try {
  const r = await client.get(`${account}/insights`, params);
  batchOk = true;
  const rows = Array.isArray(r?.data) ? r.data : [];
  say('  ACCEPTED — every name in the batch is valid at this version.');
  if (!rows.length) {
    say('  data: [] — valid fields, no delivery in the window.');
  } else {
    say(`  ${rows.length} row(s):`);
    for (const row of rows.slice(0, 3)) say(`    ${JSON.stringify(row)}`);
  }
} catch (e) {
  batchErr = e;
  say(`  REJECTED: ${e?.message ?? e}`);
  say(`  ${detailOf(e)}`);
}

// ── Step C · isolate, only when needed ─────────────────────────────────────
const accepted = [];
const rejected = [];
if (!batchOk || ALWAYS_PROBE) {
  say(`\n── step C · probing each candidate individually ──`);
  for (const field of CANDIDATES) {
    try {
      await client.get(`${account}/insights`, { fields: field, date_preset: PRESET, level: LEVEL });
      accepted.push(field);
      say(`  ACCEPTED  ${field}`);
    } catch (e) {
      rejected.push({ field, detail: detailOf(e) });
      say(`  REJECTED  ${field}`);
      say(`            ${detailOf(e)}`);
    }
  }
}

// ── report ─────────────────────────────────────────────────────────────────
say('\n── network calls by method ──');
say(`  GET    ${calls.GET}`);
say(`  POST   0   (no write capability was granted to this client)`);
say(`  DELETE 0`);
say(`  other  ${calls.other}`);

say('\n── accepted metric names ──');
if (batchOk && !ALWAYS_PROBE) {
  for (const f of CANDIDATES) say(`  ${f}`);
} else if (accepted.length) {
  for (const f of accepted) say(`  ${f}`);
} else {
  say('  (none confirmed)');
}

if (rejected.length) {
  say('\n── REJECTED metric names ──');
  for (const r of rejected) {
    say(`  ${r.field}`);
    say(`      ${r.detail}`);
  }
  say('\n  NOT replaced. A substitute chosen without evidence is a reporting layer');
  say('  that quietly measures the wrong thing. Report these and decide from the');
  say('  Meta reference before anything is changed.');
}

say('\n═══════════════════════════════════════════════════════════════');
say(rejected.length
  ? ' INSIGHTS PARTIAL — some metric names were refused. Nothing changed.'
  : ' INSIGHTS GREEN — read succeeded, every candidate metric accepted.');
say(' Read-only throughout. No POST, no DELETE, no .env change.');
say('═══════════════════════════════════════════════════════════════\n');
process.exit(rejected.length ? 1 : 0);
