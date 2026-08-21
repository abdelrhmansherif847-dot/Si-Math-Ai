#!/usr/bin/env node
// Sandbox ad account — READ-ONLY verification.
//
//   node --env-file=.env scripts/meta-sandbox-verify.mjs act_<SANDBOX_ID>
//
// GET requests only. No POST, no DELETE, no campaign, no spend. The client is
// built readOnly, so post()/del()/write() throw before reaching the network —
// the same guarantee L0 carries.
//
// The account id is taken as a COMMAND-LINE ARGUMENT, deliberately, not from
// META_AD_ACCOUNT_ID. Nothing in .env changes to run this, and the live
// account keeps its place in the configuration untouched.
//
// SAFETY GUARD: this script REFUSES to run when the id it is given is the one
// in META_AD_ACCOUNT_ID. The whole point of the exercise is to leave the live
// Si Math Ads account alone, and a copy-paste slip is the likeliest way to
// break that.
//
// =====================================================================
// WHAT THIS CAN AND CANNOT PROVE
// =====================================================================
// It CAN prove: the id resolves, the System User token can read it, and what
// its currency, status, funding and capabilities are.
//
// It CANNOT prove the account is a sandbox. No documented AdAccount field
// marking an account as sandbox could be found, and asserting on a field whose
// existence is unverified is the exact mistake that made an earlier check
// request account_type on a node that has no such field. So this prints the
// account's full readable shape and asks YOU to confirm provenance — you
// created it under Sandbox Ad Account Management, and that is the
// authoritative fact. The read is corroboration, not proof.
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

const SECRETS = SECRET_ENV.map((k) => (process.env[k] ?? '').trim()).filter(Boolean);
const say = (s = '') => console.log(redactSecrets(String(s), SECRETS));
const die = (m) => { say(`\n  ABORTED — ${m}\n`); process.exit(2); };

const arg = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? '';
if (!arg) die('usage: node --env-file=.env scripts/meta-sandbox-verify.mjs act_<SANDBOX_ID>');
const sandboxId = arg.startsWith('act_') ? arg : `act_${arg}`;

const read = readMetaEnv((k) => process.env[k]);
if (!read.env) die(`missing configuration: ${read.missingRequired.join(', ') || read.versionError}`);

// ── the guard that keeps the live account out of this entirely ─────────────
const live = read.env.adAccountId
  ? (read.env.adAccountId.startsWith('act_') ? read.env.adAccountId : `act_${read.env.adAccountId}`)
  : '';
if (live && sandboxId === live) {
  die(`${sandboxId} is META_AD_ACCOUNT_ID — the LIVE Si Math Ads account. This script ` +
      'verifies a SANDBOX account and refuses to touch the live one. Pass the sandbox id.');
}

const calls = { GET: 0, other: 0 };
const countingFetch = async (url, init) => {
  const m = (init?.method ?? 'GET').toUpperCase();
  if (m === 'GET') calls.GET += 1; else { calls.other += 1; throw new Error(`refused ${m}`); }
  return fetch(url, init);
};

const client = createMetaClient(read.env, { readOnly: true, fetchImpl: countingFetch });

say('\n═══════════════════════════════════════════════════════════════');
say(' Sandbox ad account — READ-ONLY verification');
say('═══════════════════════════════════════════════════════════════');
say(` sandbox id : ${sandboxId}`);
say(` live id    : ${live || '(META_AD_ACCOUNT_ID unset)'}   ← untouched by this script`);
say(` client     : readOnly=${client.readOnly}`);

const checks = [];
const record = (ok, label, detail = '') => {
  checks.push({ ok, label });
  say(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (detail) say(`        ${detail}`);
};

// ── 1 · the account resolves and the token can read it ─────────────────────
const FIELDS = [
  'id', 'account_id', 'name', 'account_status', 'disable_reason', 'currency',
  'timezone_name', 'amount_spent', 'spend_cap', 'balance', 'is_personal',
  'capabilities', 'funding_source', 'business', 'created_time', 'owner',
].join(',');

let acct = null;
say('\n── account ──');
try {
  acct = await client.get(sandboxId, { fields: FIELDS });
  record(true, 'the System User token can read the account',
    `${acct.name ?? '(unnamed)'} — id ${acct.id ?? sandboxId}`);
} catch (e) {
  record(false, 'the System User token can read the account',
    `${e?.message ?? e}${e?.code ? ` (code ${e.code})` : ''}`);
  say('\n  A sandbox account is created under the APP, not the Business Portfolio, so the');
  say('  Automation System User has no access to it by default. If this failed with a');
  say('  permission or not-found error, that is the likely cause — link the sandbox');
  say('  account to the Business Portfolio, or assign it to the System User, then re-run.');
}

if (acct) {
  say('\n── every field the token can read ──');
  for (const [k, v] of Object.entries(acct)) {
    say(`  ${k.padEnd(18)} ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }

  const STATUS = { 1: 'ACTIVE', 2: 'DISABLED', 3: 'UNSETTLED', 7: 'PENDING_RISK_REVIEW',
    8: 'PENDING_SETTLEMENT', 9: 'IN_GRACE_PERIOD', 100: 'PENDING_CLOSURE', 101: 'CLOSED' };
  const st = acct.account_status;
  say('\n── interpretation ──');
  record(st === 1, `account_status is ACTIVE`, `${st} = ${STATUS[st] ?? 'UNKNOWN'}`);
  record(!!acct.currency, 'currency is set', String(acct.currency ?? '(none)'));
  record(acct.id !== live, 'this is NOT the live Si Math Ads account', `${acct.id} ≠ ${live || 'n/a'}`);

  // Reported, never asserted on: no documented field marks an account as a
  // sandbox, so these are signals for a human to weigh, not a verdict.
  say('\n  signals worth reading, none of them conclusive:');
  say(`    funding_source : ${acct.funding_source ?? '(none)'}  ` +
      '— a sandbox typically has no real funding source');
  say(`    amount_spent   : ${acct.amount_spent ?? '?'}  — a fresh sandbox should be 0`);
  say(`    business       : ${acct.business ? JSON.stringify(acct.business) : '(not linked to a business)'}`);
  say(`    capabilities   : ${JSON.stringify(acct.capabilities ?? [])}`);
}

// ── 2 · it is empty ────────────────────────────────────────────────────────
if (acct) {
  say('\n── contents ──');
  try {
    const c = await client.get(`${sandboxId}/campaigns`, { summary: 'total_count', limit: '1' });
    const n = c?.summary?.total_count ?? null;
    record(n === 0, 'the sandbox has no campaigns yet', `campaign count: ${n}`);
  } catch (e) {
    record(false, 'campaigns are readable', `${e?.message ?? e}`);
  }
}

// ── verdict ────────────────────────────────────────────────────────────────
say('\n── network calls by method ──');
say(`  GET    ${calls.GET}`);
say(`  other  ${calls.other}   (any non-GET is refused before it is sent)`);

const failed = checks.filter((c) => !c.ok);
say('\n═══════════════════════════════════════════════════════════════');
say(` ${checks.length - failed.length}/${checks.length} checks passed · 0 writes`);
if (!failed.length) {
  say(' SANDBOX READ-ONLY VERIFICATION GREEN.');
  say('');
  say(' NOT PROVEN HERE: that this is a sandbox account. No documented AdAccount');
  say(' field marks one, so confirm provenance yourself — you created it under');
  say(' Sandbox Ad Account Management, which is the authoritative fact.');
  say(' The live Si Math Ads account was not contacted by this script.');
} else {
  say(' RED — see the failures above.');
}
say('═══════════════════════════════════════════════════════════════\n');
process.exit(failed.length ? 1 : 0);
