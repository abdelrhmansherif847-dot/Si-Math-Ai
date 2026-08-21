#!/usr/bin/env node
// L0 — the read-only Meta connection check.
//
//   node scripts/meta-connection-check.mjs             human report
//   node scripts/meta-connection-check.mjs --discover  list visible assets
//   node scripts/meta-connection-check.mjs --json      machine-readable
//
// --discover answers "what can this System User actually see", which is a
// different question from "is what I configured correct". Use it to obtain
// META_APP_ID / META_PAGE_ID / META_AD_ACCOUNT_ID / META_IG_USER_ID without
// hunting in Business Settings — and, more usefully, without the risk of
// copying an id for an asset that was never assigned to the System User.
// It needs only META_APP_ID's siblings: the two secrets, the graph version,
// and (for the business-owned ad account lists) META_BUSINESS_ID.
//
// READ-ONLY. Issues GET requests and nothing else. Publishes nothing, creates
// no media container, calls no media_publish, creates no campaign, mutates no
// campaign, spends nothing. The client is constructed with { readOnly: true },
// so post() and del() throw rather than issue a request — see
// supabase/functions/_shared/meta-connection.core.ts for the three overlapping
// enforcements and tests/meta-isolation.test.mjs for the ones that can go red.
//
// Safe to run repeatedly, and safe to run BEFORE App Review: its purpose is to
// tell you which of the four blocker classes are still open.
//
// =====================================================================
// SECRETS
// =====================================================================
// Read from the process environment. Never written to a file, never echoed,
// never included in --json output. The report prints variable NAMES only.
// Every line printed goes through redactSecrets() as a second, independent
// pass after redactUrl() — belt and braces, because the failure mode is a
// permanent credential in a terminal scrollback or a CI log.
//
//   export META_APP_ID=...            export META_PAGE_ID=...
//   export META_APP_SECRET=...        export META_IG_USER_ID=...
//   export META_SYSTEM_USER_TOKEN=... export META_AD_ACCOUNT_ID=...
//   export META_GRAPH_VERSION=v26.0   export META_BUSINESS_ID=...
//                                     export META_SYSTEM_USER_ID=61593218806694
//
// Exit codes: 0 all checks passed · 1 at least one FAIL · 2 could not run.
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// ── Node 22 needs --experimental-strip-types to import the .ts adapter ──────
// Type stripping is on by default from Node 23.6, and CI pins Node 22, so this
// re-execs itself once with the flag rather than making an operator remember
// it. The guard variable stops a loop if the flag is present but ineffective.
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
const { runConnectionCheck, discoverAssets, BLOCKER_CLASS_LABEL } =
  await load('supabase/functions/_shared/meta-connection.core.ts');

const JSON_OUT = process.argv.includes('--json');
const VERBOSE = process.argv.includes('--verbose');
const DISCOVER = process.argv.includes('--discover');

// Every secret VALUE currently in the environment. Anything about to be
// printed is passed through this, whatever produced it — an error message that
// quoted the request back, a stack trace, a field we did not anticipate.
const SECRETS = SECRET_ENV.map((k) => (process.env[k] ?? '').trim()).filter(Boolean);
const safe = (s) => redactSecrets(String(s), SECRETS);
const say = (s = '') => console.log(safe(s));

// ── configuration ──────────────────────────────────────────────────────────
const read = readMetaEnv((k) => process.env[k]);

if (!read.env) {
  // Cannot construct a client at all. Report it in the same shape as any other
  // class D blocker rather than dying with a stack trace: a missing env var is
  // the single most common first-run outcome and deserves a sentence.
  const missing = read.missingRequired.join(', ');
  if (JSON_OUT) {
    console.log(JSON.stringify({
      ok: false, checks: [], capabilities: [],
      counts: { pass: 0, fail: 1, warn: 0, skip: 0 },
      blockers: [{
        class: 'D',
        reason: read.versionError || `Required environment variables not set: ${missing}.`,
        action: 'Export them for a local run, or set them with `supabase secrets set` ' +
          'for the deployed function.',
      }],
    }, null, 2));
  } else {
    say('\n  L0 Meta connection check — CANNOT RUN\n');
    say(`  [D] ${read.versionError || `Required environment variables not set: ${missing}`}`);
    say('      Export them, or set them with `supabase secrets set`.');
    say('      Values are never printed and must never be pasted into chat.\n');
  }
  process.exit(2);
}

// readOnly: true is the load-bearing argument on this line.
const requests = [];
const client = createMetaClient(read.env, {
  readOnly: true,
  // The hook receives the REDACTED url — the adapter never offers the raw
  // form, so this recorder cannot capture a token even by accident.
  onRequest: (method, redactedUrl) => requests.push({ method, url: redactedUrl }),
});

// ── discovery mode ─────────────────────────────────────────────────────────
if (DISCOVER) {
  let d;
  try {
    d = await discoverAssets(client, { businessId: read.env.businessId });
  } catch (e) {
    say(`\n  discovery could not complete: ${e?.message ?? e}\n`);
    process.exit(2);
  }

  if (JSON_OUT) {
    console.log(safe(JSON.stringify({ ...d, requests }, null, 2)));
    process.exit(0);
  }

  say('\n═══════════════════════════════════════════════════════════════');
  say(' Assets visible to this System User (READ-ONLY)');
  say('═══════════════════════════════════════════════════════════════');
  say(` System User : ${read.env.systemUserId || '(unset)'}`);
  say(` Business    : ${read.env.businessId || '(META_BUSINESS_ID unset)'}`);

  say('\n── Meta App ──');
  say(d.appId ? `  ${d.appId}   (read from the token via /debug_token)`
              : '  could not read — see notes below');
  if (d.scopes.length) say(`  scopes: ${d.scopes.join(', ')}`);

  say(`\n── Pages (${d.pages.length}) ──`);
  if (!d.pages.length) say('  none visible');
  for (const p of d.pages) {
    say(`  ${p.id}  ${p.name}${p.category ? `  [${p.category}]` : ''}`);
    say(p.igId ? `      instagram: ${p.igId} (@${p.igUsername})`
               : '      instagram: NOT LINKED');
  }

  say(`\n── Ad accounts (${d.adAccounts.length}) ──`);
  if (!d.adAccounts.length) say('  none visible');
  for (const a of d.adAccounts) {
    say(`  ${a.id}  ${a.name}  ${a.status}${a.currency ? `  ${a.currency}` : ''}`);
    say(`      ${a.source}`);
  }

  if (d.notes.length) {
    say('\n── notes ──');
    for (const n of d.notes) say(`  [${n.class}] ${n.text}`);
  }

  const lines = Object.entries(d.suggested);
  if (lines.length) {
    say('\n── paste into .env ──');
    for (const [k, v] of lines) say(`${k}=${v}`);
    // Anything ambiguous is deliberately absent above: choosing between two
    // Pages for an operator is how the wrong one gets published to.
    const ambiguous = [
      d.pages.length > 1 ? 'META_PAGE_ID (several Pages visible — pick one)' : null,
      d.adAccounts.length > 1 ? 'META_AD_ACCOUNT_ID (several ad accounts visible — pick one)' : null,
    ].filter(Boolean);
    if (ambiguous.length) {
      say('\n  not suggested, because more than one candidate exists:');
      for (const a of ambiguous) say(`    ${a}`);
    }
  }

  say('\n  Discovery makes no assertion that the setup is correct.');
  say('  Run without --discover for the actual L0 checks.\n');
  process.exit(0);
}

let report;
try {
  report = await runConnectionCheck(client, {
    appId: read.env.appId,
    pageId: read.env.pageId,
    igUserId: read.env.igUserId,
    adAccountId: read.env.adAccountId,
    businessId: read.env.businessId,
    systemUserId: read.env.systemUserId,
    graphVersion: read.env.graphVersion,
    missingRequired: read.missingRequired,
    missingAssets: read.missingAssets,
    versionError: read.versionError,
  });
} catch (e) {
  // runConnectionCheck catches per-check failures itself, so reaching here
  // means something structural — a DNS failure, a proxy, no network.
  say(`\n  L0 check could not complete: ${e?.message ?? e}`);
  say('  This is a transport-level failure, not a Meta configuration problem.\n');
  process.exit(2);
}

// ── output ─────────────────────────────────────────────────────────────────
if (JSON_OUT) {
  console.log(safe(JSON.stringify({ ...report, requests }, null, 2)));
  process.exit(report.ok ? 0 : 1);
}

const MARK = { PASS: 'PASS', FAIL: 'FAIL', WARN: 'WARN', SKIP: 'SKIP' };

say('\n═══════════════════════════════════════════════════════════════');
say(' L0 — Meta connection check (READ-ONLY: no writes, no spend)');
say('═══════════════════════════════════════════════════════════════');
say(` Graph version : ${read.env.graphVersion}`);
say(` System User   : ${read.env.systemUserId || '(META_SYSTEM_USER_ID unset)'}`);
say('');

for (const c of report.checks) {
  say(`  ${MARK[c.status]}  ${c.label}`);
  if (c.detail) say(`        ${c.detail}`);
}

say('\n── capabilities ──');
for (const cap of report.capabilities) {
  say(`  ${cap.ready ? 'READY    ' : 'BLOCKED  '} ${cap.label}`);
  if (!cap.ready) say(`        blocked by: ${cap.blockedBy.join(', ')}`);
}

if (report.blockers.length) {
  say('\n── blockers, by class ──');
  // Grouped so the classes stay visually distinct: D is ours and immediate,
  // C is minutes in Business Settings, B is App Review and measured in weeks.
  for (const cls of ['D', 'C', 'B', 'A']) {
    const group = report.blockers.filter((b) => b.class === cls);
    if (!group.length) continue;
    say(`\n  [${cls}] ${BLOCKER_CLASS_LABEL[cls]}`);
    for (const b of group) {
      say(`      • ${b.reason}`);
      say(`        → ${b.action}`);
    }
  }
}

if (VERBOSE) {
  say('\n── requests issued (urls redacted) ──');
  for (const r of requests) say(`  ${r.method} ${r.url}`);
}

const { pass, fail, warn, skip } = report.counts;
say('\n═══════════════════════════════════════════════════════════════');
say(` ${pass} passed · ${fail} failed · ${warn} warnings · ${skip} skipped`);
say(report.ok
  ? ' L0 GREEN — read-only connection verified. L1 needs explicit approval.'
  : ' L0 RED — resolve the blockers above, then re-run. Do NOT proceed to L1.');
say('═══════════════════════════════════════════════════════════════\n');

process.exit(report.ok ? 0 : 1);
