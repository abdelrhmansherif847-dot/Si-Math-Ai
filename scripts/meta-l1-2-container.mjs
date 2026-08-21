#!/usr/bin/env node
// L1-2 — ONE Instagram media container. Created, never published.
//
//   $env:META_ENABLE_PUBLISH='true'
//   node --env-file=.env scripts/meta-l1-2-container.mjs --approve-single-container
//
// Sends exactly one POST to /{ig-user-id}/media and nothing else. Every other
// Meta call is a GET. There is no media_publish anywhere in this file, in the
// modules it imports, or in the repository.
//
// =====================================================================
// THIS WRITE IS IRREVERSIBLE. SAY IT PLAINLY.
// =====================================================================
// Meta documents DELETE /<IG_MEDIA_ID> for PUBLISHED media. No delete endpoint
// for an UNPUBLISHED container was found on any route available to this
// project — which is "not found in the documentation we could reach", not
// "Meta says it is unsupported". Either way there is no rollback: the only
// documented end state for an unpublished container is expiry.
//
// So this runner does NOT pretend to roll back. What makes that acceptable is
// the container's nature, not a cleanup path:
//
//   Meta's own status_code vocabulary distinguishes FINISHED ("ready to be
//   published") from PUBLISHED ("has been published"), and defines EXPIRED as
//   "not published within 24 hours and has expired". A container therefore
//   sits in a not-published state until media_publish is called, and this file
//   cannot call it.
//
// =====================================================================
// WHAT IS AND IS NOT ESTABLISHED
// =====================================================================
//   VERIFIED AGAINST META BY THIS PROJECT
//     the IG user id, via the Page's instagram_business_account edge
//     the account is reachable and its publishing quota readable (0/100)
//   META DOCUMENTATION, REACHED VIA SEARCH INDEX RATHER THAN THE PAGE
//     status_code values and their meanings; the 24-hour expiry; polling once
//     per minute for at most five minutes; the publish limit being enforced on
//     media_publish rather than on container creation
//   INFERENCE
//     that "not published" means "not externally visible". Meta never writes
//     the words "not visible"; on Instagram, publishing IS the act that makes
//     content visible, so the step is short — but it is a step.
//
// A `status` field is NOT polled. Only status_code has evidence behind it.
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
const PUB = await load('supabase/functions/_shared/meta-publish.core.ts');
const CONN = await load('supabase/functions/_shared/meta-connection.core.ts');

const SECRETS = SECRET_ENV.map((k) => (process.env[k] ?? '').trim()).filter(Boolean);
const say = (s = '') => console.log(redactSecrets(String(s), SECRETS));
const die = (m) => { say(`\n  ABORTED — ${m}\n`); process.exit(2); };

const argOf = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

/** Meta recommends polling once per minute for no more than five minutes. */
const POLL_INTERVAL_MS = 60_000;
const POLL_MAX = 5;

const IMAGE_URL = argOf('image', 'https://www.si-math-ai.com/assets/si-math-ai-logo.jpg');
const CAPTION = argOf('caption', 'Si Math AI — API connection test. This container is not published.');

say('\n═══════════════════════════════════════════════════════════════');
say(' L1-2 — one Instagram media container (NOT published)');
say('═══════════════════════════════════════════════════════════════');

// ── guard 1 · explicit approval ────────────────────────────────────────────
if (!process.argv.includes('--approve-single-container')) {
  die('missing --approve-single-container. This sends a real POST to Instagram.');
}

const read = readMetaEnv((k) => process.env[k]);
if (!read.env) die(`missing configuration: ${read.missingRequired.join(', ') || read.versionError}`);
if (!read.env.igUserId) die('META_IG_USER_ID is not set');
if (!read.env.pageId) die('META_PAGE_ID is not set — it is needed for the runtime cross-check');

// ── guard 2 · publish switch on, ads switch off ────────────────────────────
if (!read.env.enablePublish) {
  die('META_ENABLE_PUBLISH is not "true". Supply it as a process-scoped override for ' +
      'this single run — do not edit .env.');
}
if (read.env.enableAds) {
  die('META_ENABLE_ADS is enabled. L1-2 is a publish-only operation and refuses to run ' +
      'with the ads switch on.');
}

// ── guard 3 · self-inspection ──────────────────────────────────────────────
// SELF-INSPECT-BEGIN — excluded from its own scan; it must name what it forbids.
{
  const raw = readFileSync(SELF, 'utf8');
  const a = raw.indexOf('// SELF-INSPECT-BEGIN');
  // lastIndexOf: the first occurrence of the closing marker is the literal on
  // the line below, which sits ABOVE the forbidden list.
  const b = raw.lastIndexOf('// SELF-INSPECT-END');
  if (a < 0 || b <= a) die('self-inspection: exclusion fence missing');
  const src = (raw.slice(0, a) + raw.slice(b))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

  for (const n of ['media_publish', '/feed', '/photos', '/videos', 'video_reels',
    'adcreatives', '/adsets', '/campaigns']) {
    if (src.includes(n)) die(`self-inspection: this runner references ${n}`);
  }
  if (/['"]DELETE['"]/.test(src)) die('self-inspection: this runner names DELETE');
  if (/ads:\s*true/.test(src)) die('self-inspection: this runner grants the ads capability');
  const writes = (src.match(/writer\.write\s*\(/g) ?? []).length;
  if (writes !== 1) die(`self-inspection: expected exactly 1 write, found ${writes}`);
  if (!/const reader = createMetaClient\([^)]*readOnly: true/.test(src.replace(/\n/g, ' '))) {
    die('self-inspection: the reader client is not readOnly');
  }
  say('  PASS  self-inspection — no media_publish, no second write, readOnly reader');
}
// SELF-INSPECT-END

const calls = { GET: 0, POST: 0, other: 0 };
const countingFetch = async (url, init) => {
  const m = (init?.method ?? 'GET').toUpperCase();
  if (m === 'GET') calls.GET += 1;
  else if (m === 'POST') {
    calls.POST += 1;
    if (calls.POST > 1) throw new Error('refused: a SECOND POST was attempted');
  } else {
    calls.other += 1;
    throw new Error(`refused: method ${m} is not permitted in L1-2`);
  }
  return fetch(url, init);
};

const reader = createMetaClient(read.env, { readOnly: true, fetchImpl: countingFetch });
// publish capability ONLY. No ads. dryRun off for this approved operation.
const writer = createMetaClient(read.env, {
  dryRun: false, capabilities: { publish: true }, fetchImpl: countingFetch,
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

// ── guard 4 · the target must be the Page's own linked account ─────────────
say('\n── runtime cross-check ──');
let linkedId = '';
try {
  const link = await reader.get(read.env.pageId, { fields: 'instagram_business_account{id,username}' });
  linkedId = CONN.normalizeId(link?.instagram_business_account?.id);
  const uname = link?.instagram_business_account?.username ?? '';
  say(`  Page ${read.env.pageId} → instagram_business_account ${linkedId || '(none)'}${uname ? ` (@${uname})` : ''}`);
} catch (e) {
  die(`could not read the Page's linked Instagram account: ${detailOf(e)}. Failing closed.`);
}
if (!linkedId) die('the Page reports no linked Instagram account. Nothing to post to.');
if (!CONN.idsEqual(linkedId, read.env.igUserId)) {
  die(`META_IG_USER_ID (${read.env.igUserId}) does not match the account the Page publishes ` +
      `to (${linkedId}). Failing closed rather than posting to the wrong account.`);
}
say(`  PASS  META_IG_USER_ID matches the Page-linked account`);
const igId = CONN.normalizeId(read.env.igUserId);

// ── guard 5 · quota pre-check ──────────────────────────────────────────────
say('\n── quota before ──');
const quota = async () => {
  const r = await reader.get(`${igId}/content_publishing_limit`, { fields: 'config,quota_usage' });
  const row = r?.data?.[0] ?? {};
  return { used: row.quota_usage ?? 0, total: row.config?.quota_total ?? null };
};
let qBefore;
try { qBefore = await quota(); } catch (e) { die(`quota read failed: ${detailOf(e)}. Nothing sent.`); }
say(`  ${qBefore.used}/${qBefore.total} used`);
if (qBefore.total !== null && qBefore.used >= qBefore.total) {
  die('the publishing quota is exhausted. Refusing rather than sending a request that ' +
      'would fail — and rather than consuming the last slot.');
}

// ── build and gate ─────────────────────────────────────────────────────────
let req;
try {
  req = PUB.buildIgImageContainer({ igUserId: igId, imageUrl: IMAGE_URL, caption: CAPTION });
} catch (e) {
  die(`payload rejected before sending: ${e?.message ?? e}`);
}

say('\n── pre-execution gate ──');
say(`  endpoint  : POST /${read.env.graphVersion}/${req.path}`);
say(`  capability: ${req.capability}`);
say(`  image_url : ${IMAGE_URL}`);
say(`  caption   : ${CAPTION}`);
say(`  caption len: ${CAPTION.length}/2200`);
if (req.method !== 'POST') die(`unexpected method ${req.method}`);
if (!req.path.endsWith('/media')) die(`unexpected path ${req.path}`);
// KEYS, not the serialised body. Scanning the whole payload for "publish"
// matched the CAPTION — which says "This container is not published" — and
// would have aborted the real run on its own safety text. Third time a
// substring scan has fired on the words describing the correct behaviour;
// the fix each time is to assert the structure instead of the vocabulary.
const bodyKeys = Object.keys(req.body);
const ALLOWED_BODY_KEYS = ['image_url', 'caption'];
const unexpected = bodyKeys.filter((k) => !ALLOWED_BODY_KEYS.includes(k));
if (unexpected.length) die(`payload carries unexpected key(s): ${unexpected.join(', ')}`);
if (IMAGE_URL.includes('?')) {
  // NOT a refusal. The earlier claim that robots.txt forbids query-string urls
  // was inference, not evidence, and has been retracted. A clean path is
  // simply one fewer variable when diagnosing a fetch failure.
  say('  NOTE  the image url carries a query string. Permitted — but a clean path is');
  say('        one fewer variable if Meta cannot fetch it.');
}
say('  PASS  single POST to the media edge · no publish step exists in this runner');

// ── the one write ──────────────────────────────────────────────────────────
say('\n── creating the container ──');
let containerId = null;
let createErr = null;
try {
  const out = await writer.write(req);
  containerId = out?.response?.id ?? null;
  say(`  Meta response: ${JSON.stringify(out.response)}`);
} catch (e) {
  createErr = e;
  say(`  Meta REJECTED: ${e?.message ?? e}`);
  say(`  ── what Meta said (scrubbed) ──`);
  say(`    ${detailOf(e)}`);
}

// ── verification, all GET ──────────────────────────────────────────────────
let finalStatus = null;
if (containerId) {
  say('\n── polling status_code (once per minute, max 5) ──');
  for (let i = 1; i <= POLL_MAX; i++) {
    try {
      const r = await reader.get(containerId, { fields: 'status_code' });
      finalStatus = r?.status_code ?? null;
      say(`  attempt ${i}: status_code = ${finalStatus}`);
      if (finalStatus === 'FINISHED' || finalStatus === 'ERROR' || finalStatus === 'EXPIRED') break;
    } catch (e) {
      say(`  attempt ${i}: read failed — ${detailOf(e)}`);
      break;
    }
    if (i < POLL_MAX) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

let qAfter = null;
if (containerId) {
  say('\n── quota after ──');
  try {
    qAfter = await quota();
    say(`  ${qAfter.used}/${qAfter.total} used   (before ${qBefore.used}/${qBefore.total})`);
  } catch (e) { say(`  read failed — ${detailOf(e)}`); }
}

let inMediaList = null;
if (containerId) {
  say('\n── is the container in the published media list? ──');
  try {
    const r = await reader.get(`${igId}/media`, { fields: 'id', limit: '25' });
    const ids = (r?.data ?? []).map((m) => CONN.normalizeId(m.id));
    inMediaList = ids.includes(CONN.normalizeId(containerId));
    say(`  ${ids.length} published media read; container present: ${inMediaList}`);
  } catch (e) { say(`  read failed — ${detailOf(e)}`); }
}

// ── verdict ────────────────────────────────────────────────────────────────
say('\n── network calls by method ──');
say(`  GET    ${calls.GET}`);
say(`  POST   ${calls.POST}`);
say(`  other  ${calls.other}   (DELETE and every other method are refused before sending)`);

const line = (ok, label) => { say(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); return ok; };
say('\n── verification ──');
const r1 = line(!createErr && !!containerId, `container created${containerId ? ` (${containerId})` : ''}`);
const r2 = line(finalStatus === 'FINISHED', `status_code reached FINISHED (${finalStatus ?? 'unknown'})`);
const r3 = line(qAfter !== null && qAfter.used === qBefore.used,
  `publishing quota unchanged (${qBefore.used} → ${qAfter?.used ?? '?'}) — nothing was published`);
const r4 = line(inMediaList === false, 'container is ABSENT from the published media list');
const r5 = line(calls.POST === 1 && calls.other === 0, `exactly one POST, no other method (${calls.POST})`);

const green = r1 && r2 && r3 && r4 && r5;
say('\n═══════════════════════════════════════════════════════════════');
say(green
  ? ' L1-2 GREEN — container created and NOT published.\n' +
    ' It will expire on its own; there is no delete endpoint and none was used.\n' +
    ' Restore nothing: META_ENABLE_PUBLISH was a process-scoped override.'
  : ' L1-2 RED — see the failures above.');
say('═══════════════════════════════════════════════════════════════\n');
process.exit(green ? 0 : 1);
