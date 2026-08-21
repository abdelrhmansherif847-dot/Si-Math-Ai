#!/usr/bin/env node
// Ad account comparison — READ-ONLY.
//
//   node --env-file=.env scripts/meta-account-compare.mjs act_A act_B [act_C ...]
//
// Resolves which ad account is the real live one, from Meta rather than from
// memory or configuration. GET requests only, on a readOnly client: post(),
// del() and write() throw before reaching the network.
//
// It answers four questions the conversation could not:
//
//   1. What does META_AD_ACCOUNT_ID actually contain right now? Printed
//      verbatim, because two different ids have been described as "the live
//      account" and the file itself is the only authority on which one is
//      configured.
//   2. Which ad accounts does the Business Portfolio own or serve? That list
//      IS the set of live accounts — a sandbox is created under the App and is
//      not owned by the business.
//   3. For each id given: can the token read it, and what is it?
//   4. Which of them is the sandbox, and which is live?
//
// It changes nothing. Not .env, not the guards, not the tests.
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

const ids = process.argv.slice(2).filter((a) => !a.startsWith('-')).map(ADS.normalizeAccountId);
if (!ids.length) die('usage: node --env-file=.env scripts/meta-account-compare.mjs act_A act_B');

const read = readMetaEnv((k) => process.env[k]);
if (!read.env) die(`missing configuration: ${read.missingRequired.join(', ') || read.versionError}`);

const calls = { GET: 0, other: 0 };
const client = createMetaClient(read.env, {
  readOnly: true,
  fetchImpl: async (url, init) => {
    const m = (init?.method ?? 'GET').toUpperCase();
    if (m !== 'GET') { calls.other += 1; throw new Error(`refused ${m}`); }
    calls.GET += 1;
    return fetch(url, init);
  },
});

const configured = ADS.normalizeAccountId(read.env.adAccountId);

say('\n═══════════════════════════════════════════════════════════════');
say(' Ad account comparison — READ-ONLY');
say('═══════════════════════════════════════════════════════════════');
say('\n── question 1 · what is actually configured ──');
say(`  META_AD_ACCOUNT_ID = ${configured || '(unset)'}`);
say('  This is read from your environment, not from anything I remember.');

// ── question 2 · which accounts does the business own ──────────────────────
say('\n── question 2 · accounts owned or served by the Business Portfolio ──');
say(`  business: ${read.env.businessId || '(META_BUSINESS_ID unset)'}`);
let owned = [];
if (read.env.businessId) {
  for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
    try {
      const r = await client.get(`${read.env.businessId}/${edge}`, {
        fields: 'id,name,account_status,currency', limit: '200',
      });
      for (const row of r?.data ?? []) owned.push({ ...row, edge });
    } catch (e) {
      say(`  ${edge}: could not read — ${e?.message ?? e}`);
    }
  }
  if (owned.length) {
    for (const a of owned) {
      say(`    ${ADS.normalizeAccountId(a.id).padEnd(24)} ${a.name ?? '(unnamed)'}` +
          `  [${a.edge}]`);
    }
    say('  These ARE the live accounts. A sandbox is created under the App and');
    say('  does not appear here.');
  } else {
    say('    (none readable — the comparison below still works, but the');
    say('     business-ownership column will be inconclusive)');
  }
} else {
  say('  META_BUSINESS_ID is unset, so ownership cannot be determined.');
}

// ── question 3 · each id in turn ───────────────────────────────────────────
const FIELDS = 'id,account_id,name,account_status,currency,timezone_name,' +
  'amount_spent,spend_cap,balance,business,funding_source,is_personal';
const STATUS = { 1: 'ACTIVE', 2: 'DISABLED', 3: 'UNSETTLED', 7: 'PENDING_RISK_REVIEW',
  8: 'PENDING_SETTLEMENT', 9: 'IN_GRACE_PERIOD', 100: 'PENDING_CLOSURE', 101: 'CLOSED' };

const rows = [];
say('\n── question 3 · each disputed id ──');
for (const id of ids) {
  say(`\n  ${id}`);
  const row = { id, readable: false };
  try {
    const a = await client.get(id, { fields: FIELDS });
    row.readable = true;
    row.name = a.name ?? '(unnamed)';
    row.status = a.account_status;
    row.currency = a.currency ?? '';
    row.business = a.business ?? null;
    row.spent = a.amount_spent;
    row.funding = a.funding_source ?? null;
    say(`    token access : YES`);
    say(`    name         : ${row.name}`);
    say(`    status       : ${row.status} = ${STATUS[row.status] ?? 'UNKNOWN'}`);
    say(`    currency     : ${row.currency || '(none)'}`);
    say(`    amount_spent : ${row.spent ?? '?'}`);
    say(`    funding      : ${row.funding ?? '(none)'}`);
    say(`    business     : ${row.business ? JSON.stringify(row.business) : '(not linked to a business)'}`);
  } catch (e) {
    say(`    token access : NO — ${e?.message ?? e}${e?.code ? ` (code ${e.code})` : ''}`);
    row.error = e?.message ?? String(e);
  }
  row.businessOwned = owned.length ? ADS.isBusinessOwned(id, owned) : null;
  row.isConfigured = configured !== '' && id === configured;
  say(`    business-owned: ${row.businessOwned === null ? 'unknown' : row.businessOwned ? 'YES → LIVE' : 'no → consistent with a sandbox'}`);
  say(`    is META_AD_ACCOUNT_ID: ${row.isConfigured ? 'YES' : 'no'}`);
  rows.push(row);
}

// ── question 4 · the reading ───────────────────────────────────────────────
say('\n── summary ──');
say(`  ${'account'.padEnd(24)} ${'read'.padEnd(5)} ${'status'.padEnd(10)} ${'owned'.padEnd(8)} ${'in .env'.padEnd(8)} name`);
for (const r of rows) {
  say(`  ${r.id.padEnd(24)} ${(r.readable ? 'yes' : 'NO').padEnd(5)} ` +
      `${(r.readable ? (STATUS[r.status] ?? '?') : '-').padEnd(10)} ` +
      `${(r.businessOwned === null ? '?' : r.businessOwned ? 'LIVE' : 'no').padEnd(8)} ` +
      `${(r.isConfigured ? 'YES' : 'no').padEnd(8)} ${r.readable ? r.name : r.error ?? ''}`);
}

const liveCandidates = rows.filter((r) => r.readable && r.businessOwned === true);
say('\n── reading ──');
if (liveCandidates.length === 1) {
  say(`  Exactly one of the ids given is owned by the Business Portfolio:`);
  say(`      ${liveCandidates[0].id}  (${liveCandidates[0].name})`);
  say('  That is the canonical LIVE ad account.');
} else if (liveCandidates.length > 1) {
  say('  MORE THAN ONE of the ids given is business-owned:');
  for (const c of liveCandidates) say(`      ${c.id}  (${c.name})`);
  say('  Both are live accounts. Which one the automation should target is a');
  say('  business decision, not something this script can settle — pick the one');
  say('  Si Math actually advertises from.');
} else if (owned.length) {
  say('  NONE of the ids given is owned by the Business Portfolio, yet the');
  say('  business owns the accounts listed under question 2. Compare against');
  say('  that list — the live account may be one not supplied here.');
} else {
  say('  Business ownership could not be read, so no id can be called live on');
  say('  this evidence. Grant business_management or supply META_BUSINESS_ID');
  say('  and re-run before changing any configuration.');
}

say('\n── network calls by method ──');
say(`  GET    ${calls.GET}`);
say(`  other  ${calls.other}   (any non-GET is refused before it is sent)`);
say('\n  Nothing was changed. No .env write, no guard change, no POST, no DELETE.\n');
