// Isolation suite for the L0 Meta connection check.
//
// L0's whole justification is that it is READ-ONLY: it inspects a production
// marketing configuration and cannot publish, cannot create, cannot mutate and
// cannot spend. Read-only is easy to assert in a document and easy to lose in
// a diff, so this suite asserts it against the real shipped bytes — the adapter
// and the check module imported and EXECUTED, and their source inspected.
//
// FOUR BOUNDARIES, and what would breach each:
//
//   1. WRITE       any request that is not a GET; any call to post()/del();
//                  any write-shaped endpoint reachable from the check module
//   2. CREDENTIAL  a token, app secret or appsecret_proof reaching the report,
//                  the request recorder, or anything an operator can print
//   3. TUTOR       an import, symbol or reference that couples marketing code
//                  to ai-tutor or to the student record
//   4. DIAGNOSIS   a blocker that is unclassified, or classified into the
//                  wrong queue — a class B (weeks of App Review) reported as a
//                  class D (a one-line env fix) sends an operator to the wrong
//                  place for days
//
// Every check is written so it COULD go red: the credential tests drive the
// real client with real secret-shaped values and assert absence, rather than
// asserting that a clean report stays clean.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite } from './_assert.mjs';
import { REPO } from './_source.mjs';

const load = (rel) => import(pathToFileURL(resolve(REPO, rel)).href);
const G = await load('supabase/functions/_shared/meta-graph.core.ts');
const C = await load('supabase/functions/_shared/meta-connection.core.ts');

const GRAPH_SRC = readFileSync(resolve(REPO, 'supabase/functions/_shared/meta-graph.core.ts'), 'utf8');
const CHECK_SRC = readFileSync(resolve(REPO, 'supabase/functions/_shared/meta-connection.core.ts'), 'utf8');
const SCRIPT_SRC = readFileSync(resolve(REPO, 'scripts/meta-connection-check.mjs'), 'utf8');

const t = suite('meta-isolation');

/** Executable code only. Both modules carry long design essays that
 *  legitimately NAME the write endpoints while explaining why they are never
 *  called; asserting over raw text would fail on the prose that documents the
 *  property being checked. Same approach as support-isolation.test.mjs. */
const exec = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const CHECK_EXEC = exec(CHECK_SRC);
const GRAPH_EXEC = exec(GRAPH_SRC);
const SCRIPT_EXEC = exec(SCRIPT_SRC);

// ── the scenario harness ───────────────────────────────────────────────────
// Drives the REAL runConnectionCheck through the REAL client with a stub
// fetch. Nothing here paraphrases the code under test.

const TOKEN = 'EAAsystemusertokenverylongsecret';
const APP_SECRET = 'appsecretvalueverylongsecret';

const ENV = {
  appId: 'APP123', appSecret: APP_SECRET, token: TOKEN, graphVersion: 'v26.0',
  pageId: 'PAGE1', igUserId: '', adAccountId: 'act_AD1',
  businessId: 'BIZ1', systemUserId: 'SU61593218806694',
};

const ALL_SCOPES = C.REQUIRED_SCOPES.map((s) => s.scope);

const res = (body, status = 200) => ({
  ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body),
});
const graphErr = (code, status = 400) =>
  res({ error: { message: 'upstream detail', code, fbtrace_id: 'Atrace' } }, status);

const HEALTHY = {
  debug_token: () => res({ data: {
    app_id: 'APP123', is_valid: true, expires_at: 0, type: 'SYSTEM_USER', scopes: ALL_SCOPES,
  } }),
  me: () => res({ id: 'SU61593218806694', name: 'Automation' }),
  page: () => res({ id: 'PAGE1', name: 'Si Math', category: 'Education' }),
  igLink: () => res({ instagram_business_account: { id: 'IG1', username: 'simath' } }),
  ig: () => res({ id: 'IG1', username: 'simath', account_type: 'BUSINESS', media_count: 12 }),
  igLimit: () => res({ data: [{ quota_usage: 3, config: { quota_total: 50 } }] }),
  systemUsers: () => res({ data: [
    { id: 'SU61593218806694', name: 'Automation' },
  ] }),
  adAccount: () => res({
    id: 'act_AD1', name: 'Si Math Ads', account_status: 1,
    currency: 'EGP', timezone_name: 'Africa/Cairo',
  }),
  campaigns: () => res({ data: [] }),
};

/** Route a Graph url to a fixture. Page access and the Instagram linkage read
 *  hit the SAME path and differ only by `fields`, which is exactly why the
 *  check module issues them as two requests. */
function route(url, fx) {
  const u = new URL(url);
  const path = u.pathname.replace(/^\/v\d+\.\d+\//, '');
  const fields = u.searchParams.get('fields') ?? '';
  if (path === 'debug_token') return fx.debug_token();
  if (path === 'me') return fx.me();
  if (path === 'PAGE1') return fields.includes('instagram_business_account') ? fx.igLink() : fx.page();
  if (path === 'IG1' || path === 'IGOTHER') return fx.ig();
  if (path.endsWith('/content_publishing_limit')) return fx.igLimit();
  if (path.endsWith('/system_users')) return fx.systemUsers();
  if (path === 'act_AD1') return fx.adAccount();
  if (path.endsWith('/campaigns')) return fx.campaigns();
  return res({ error: { message: 'unrouted', code: 100 } }, 404);
}

async function run(overrides = {}, cfgOverrides = {}, envOverrides = {}) {
  const fx = { ...HEALTHY, ...overrides };
  const requests = [];
  const env = { ...ENV, ...envOverrides };
  const client = G.createMetaClient(env, {
    readOnly: true,
    onRequest: (method, url) => requests.push({ method, url }),
    fetchImpl: async (url, init) => {
      requests.push({ rawMethod: init?.method ?? 'GET', rawUrl: url });
      return route(url, fx);
    },
  });
  const report = await C.runConnectionCheck(client, {
    appId: env.appId, pageId: env.pageId, igUserId: env.igUserId,
    adAccountId: env.adAccountId, businessId: env.businessId,
    systemUserId: env.systemUserId, graphVersion: env.graphVersion,
    missingRequired: [], missingAssets: [], versionError: null,
    ...cfgOverrides,
  });
  return { report, requests, client };
}

const find = (report, id) => report.checks.find((c) => c.id === id);
const blockersOfClass = (report, cls) => report.blockers.filter((b) => b.class === cls);

// ══ 1 · WRITE BOUNDARY ════════════════════════════════════════════════════
t.section('1 · write boundary — L0 cannot write');

{
  const { report, requests, client } = await run();

  const methods = [...new Set(requests.filter((r) => r.rawMethod).map((r) => r.rawMethod))];
  t.is('every request the real check issues is a GET', methods, ['GET']);
  t.ok('the check actually issued requests (not a vacuous pass)',
    requests.filter((r) => r.rawMethod).length >= 8);
  t.ok('the client it ran on is read-only', client.readOnly === true);
  t.ok('a healthy fixture reports ok', report.ok === true);

  // The client L0 runs on is incapable of writing, not merely uninclined to.
  let posted = null;
  try { await client.post('PAGE1/feed'); } catch (e) { posted = e; }
  t.is('post() on that same client throws', posted?.name, 'ReadOnlyViolation');

  // ...and the check module notices if it is ever handed a writeable one.
  const writeable = G.createMetaClient(ENV, { readOnly: false, fetchImpl: async () => res({}) });
  const guard = await C.runConnectionCheck(writeable, { appId: 'APP123', pageId: '', igUserId: '', adAccountId: '', businessId: '', systemUserId: '' });
  const gc = find(guard, 'client.readonly');
  t.is('a writeable client FAILS the first check', gc?.status, 'FAIL');
  t.is('and is classified as our own configuration error (D)', gc?.blocker?.class, 'D');
}

{
  // Source-level: no write-shaped endpoint is reachable from the check module.
  // Comments are stripped first — both files name these endpoints in prose
  // while explaining that they are never called.
  const FORBIDDEN = [
    'media_publish', 'video_reels', '/feed', '/photos', '/videos',
    'execution_options', 'adcreatives', '/adsets', 'creation_count',
  ];
  for (const needle of FORBIDDEN) {
    t.ok(`executable check source never references ${needle}`, !CHECK_EXEC.includes(needle));
  }
  t.ok('the check module never calls client.post', !/client\.post\s*\(/.test(CHECK_EXEC));
  t.ok('the check module never calls client.del', !/client\.del\s*\(/.test(CHECK_EXEC));
  t.ok('the check module never names a non-GET method',
    !/method\s*:\s*['"](POST|DELETE|PUT|PATCH)['"]/.test(CHECK_EXEC));
  t.ok('the operator script never calls post or del',
    !/\.(post|del)\s*\(/.test(SCRIPT_EXEC));
  t.ok('the operator script constructs its client read-only',
    /readOnly\s*:\s*true/.test(SCRIPT_EXEC));

  // The adapter is allowed to DEFINE post/del — they throw. It must not have
  // a code path that issues one.
  t.ok('the adapter issues no non-GET fetch',
    !/method\s*:\s*['"](POST|DELETE|PUT|PATCH)['"]/.test(GRAPH_EXEC));
  t.ok('the adapter\'s only fetch method is GET',
    (GRAPH_EXEC.match(/method:\s*'GET'/g) ?? []).length >= 1);
}

// ══ 2 · CREDENTIAL BOUNDARY ═══════════════════════════════════════════════
t.section('2 · credential boundary — no secret escapes');

{
  const { report, requests } = await run();
  const serialised = JSON.stringify(report);

  t.ok('the report contains no access token', !serialised.includes(TOKEN));
  t.ok('the report contains no app secret', !serialised.includes(APP_SECRET));
  t.ok('the report contains no appsecret_proof value', !/[0-9a-f]{64}/.test(serialised));

  // The recorder is what --verbose prints. It must be safe to print.
  const observed = requests.filter((r) => r.url);
  t.ok('the recorder captured the requests', observed.length >= 8);
  for (const r of observed) {
    if (r.url.includes(TOKEN) || r.url.includes(APP_SECRET)) {
      t.ok(`recorded url leaks a secret: ${r.url.slice(0, 60)}`, false);
    }
  }
  t.ok('no recorded url contains a secret',
    observed.every((r) => !r.url.includes(TOKEN) && !r.url.includes(APP_SECRET)));
  t.ok('recorded urls are redaction-marked', observed.every((r) => r.url.includes('[redacted]')));

  // The /debug_token call is the sharpest case — its PARAMETER is the token.
  const dbg = observed.find((r) => r.url.includes('debug_token'));
  t.ok('the debug_token request was recorded', !!dbg);
  t.ok('and its input_token is redacted', dbg && !dbg.url.includes(TOKEN));
}

{
  // Meta quoting the token back in an error body must not put it in the report.
  const { report } = await run({
    me: () => res({ error: {
      message: `Invalid OAuth access token ${TOKEN} for app ${APP_SECRET}`,
      code: 190, fbtrace_id: 'Atrace',
    } }, 400),
  });
  const s = JSON.stringify(report);
  t.ok('a token quoted back by Meta does not reach the report', !s.includes(TOKEN));
  t.ok('an app secret quoted back by Meta does not reach the report', !s.includes(APP_SECRET));
  t.ok('the failure is still reported', find(report, 'systemuser.identity')?.status === 'FAIL');
}

{
  // The script's second, independent pass. If redactUrl were ever weakened,
  // this still scrubs the printed line.
  const line = `GET https://graph.facebook.com/v26.0/me?access_token=${TOKEN}`;
  t.ok('redactSecrets catches what redactUrl would have missed',
    !G.redactSecrets(line, [TOKEN, APP_SECRET]).includes(TOKEN));
  t.ok('the script routes its output through redactSecrets',
    /redactSecrets/.test(SCRIPT_EXEC) && /const safe\s*=/.test(SCRIPT_EXEC));
  t.ok('the script never prints an env VALUE for a secret',
    !new RegExp(`process\\.env\\.(${G.SECRET_ENV.join('|')})\\s*\\)?\\s*\\}?\\s*\``).test(SCRIPT_EXEC));
}

// ══ 3 · TUTOR / STUDENT BOUNDARY ══════════════════════════════════════════
t.section('3 · tutor boundary — marketing is isolated');

{
  // A marketing bug must not be able to 500 a student. The structural half of
  // that is that nothing here imports, or is imported by, the tutor.
  const ACADEMIC = [
    'ai-tutor', 'question_records', 'mastery_records', 'weakness_', 'focus_',
    'study_plans', 'session_questions', 'chat_sessions', 'consume_credits',
    'AI_TUTOR_VERSION', 'taxonomy.core', 'verification.core', 'telemetry.core',
  ];
  for (const needle of ACADEMIC) {
    t.ok(`the adapter never references ${needle}`, !GRAPH_EXEC.includes(needle));
    t.ok(`the check module never references ${needle}`, !CHECK_EXEC.includes(needle));
  }

  // ...and the tutor does not reach back. If ai-tutor ever imports a marketing
  // module, the isolation is gone in the direction that actually hurts.
  const TUTOR = readFileSync(resolve(REPO, 'supabase/functions/ai-tutor/index.ts'), 'utf8');
  t.ok('ai-tutor imports no marketing module', !/meta-(graph|connection|publish|ads)/.test(TUTOR));

  t.ok('the check module reaches no database', !/supabase-js|createClient|from\(/.test(CHECK_EXEC));
  t.ok('the adapter reaches no database', !/supabase-js|createClient/.test(GRAPH_EXEC));
}

// ══ 4 · DIAGNOSIS — every failure lands in the right queue ════════════════
t.section('4 · diagnosis — blockers are classified and actionable');

{
  // Class D — ours, immediate.
  const missing = await C.runConnectionCheck(
    G.createMetaClient(ENV, { readOnly: true, fetchImpl: async () => res({}) }),
    { appId: 'APP123', pageId: '', igUserId: '', adAccountId: '', businessId: '', systemUserId: '',
      missingRequired: ['META_APP_SECRET'] },
  );
  t.is('a missing env var is class D', find(missing, 'env.required')?.blocker?.class, 'D');
  t.ok('and names the variable', find(missing, 'env.required')?.blocker?.reason.includes('META_APP_SECRET'));
  t.ok('and stops early rather than cascading',
    missing.checks.filter((c) => c.status === 'SKIP').length === 0 && missing.checks.length <= 4);

  const badVer = await C.runConnectionCheck(
    G.createMetaClient(ENV, { readOnly: true, fetchImpl: async () => res({}) }),
    { appId: 'APP123', pageId: '', igUserId: '', adAccountId: '', businessId: '', systemUserId: '',
      versionError: 'META_GRAPH_VERSION must look like v26.0' },
  );
  t.is('a malformed graph version is class D', find(badVer, 'env.version')?.blocker?.class, 'D');
}

{
  // Class A — the token itself.
  const { report } = await run({ debug_token: () => graphErr(190) });
  t.is('a revoked token FAILS the validity check', find(report, 'token.valid')?.status, 'FAIL');
  t.is('and is class A (Meta configuration)', find(report, 'token.valid')?.blocker?.class, 'A');
  t.ok('and the action says how to re-issue it',
    /System users/.test(find(report, 'token.valid')?.blocker?.action ?? ''));
  t.is('dependent checks SKIP rather than FAIL', find(report, 'app.identity')?.status, 'SKIP');
  t.ok('a skipped check raises no blocker of its own',
    find(report, 'app.identity')?.blocker === null);
}

{
  // A token that expires is the signature of the WRONG TOKEN TYPE — the exact
  // "temporary Graph API Explorer setup" the owner said they did not want.
  const soon = Math.floor(Date.now() / 1000) + 5_184_000;
  const { report } = await run({ debug_token: () => res({ data: {
    app_id: 'APP123', is_valid: true, expires_at: soon, scopes: ALL_SCOPES,
  } }) });
  t.is('an expiring token is a WARN, not a silent pass', find(report, 'token.expiry')?.status, 'WARN');
  t.is('and raises a class A blocker', find(report, 'token.expiry')?.blocker?.class, 'A');
  t.ok('and names System users as the fix',
    /System users/.test(find(report, 'token.expiry')?.blocker?.action ?? ''));
}

{
  // Class B — App Review. The long pole, and it must not be mistaken for a
  // one-line env fix.
  const partial = ALL_SCOPES.filter((s) => s !== 'instagram_content_publish' && s !== 'ads_management');
  const { report } = await run({ debug_token: () => res({ data: {
    app_id: 'APP123', is_valid: true, expires_at: 0, scopes: partial,
  } }) });
  const b = find(report, 'scopes.granted');
  t.is('missing scopes FAIL', b?.status, 'FAIL');
  t.is('and are class B (permission)', b?.blocker?.class, 'B');
  t.ok('the missing scopes are named', b?.blocker?.reason.includes('instagram_content_publish'));
  t.ok('Advanced Access is called out as the long pole',
    /Advanced Access/.test(b?.blocker?.reason ?? '') && /App Review/.test(b?.blocker?.action ?? ''));
  t.ok('and it explains that adding a scope means a NEW token',
    /NEW token/.test(b?.blocker?.action ?? ''));
}

{
  // Class C — the state the spec predicts for Si Math today: Page assigned,
  // Instagram never linked, ad account never assigned.
  const { report } = await run({
    igLink: () => res({ id: 'PAGE1' }),
    adAccount: () => graphErr(100, 404),
  });

  t.is('an unlinked Instagram account FAILS', find(report, 'page.ig_link')?.status, 'FAIL');
  t.is('and is class C (asset assignment)', find(report, 'page.ig_link')?.blocker?.class, 'C');
  t.ok('the action names Business Settings',
    /Business Settings/.test(find(report, 'page.ig_link')?.blocker?.action ?? ''));

  t.is('an unassigned ad account FAILS', find(report, 'adaccount.access')?.status, 'FAIL');
  t.is('and is class C', find(report, 'adaccount.access')?.blocker?.class, 'C');
  t.ok('with the exact assignment path spelled out',
    /Assign people/.test(find(report, 'adaccount.access')?.blocker?.action ?? ''));
  t.is('the campaign read SKIPs rather than repeating the failure',
    find(report, 'adaccount.read')?.status, 'SKIP');

  // The Page half still works — a partial failure must not read as total.
  t.is('the Facebook Page still passes', find(report, 'page.access')?.status, 'PASS');

  const caps = Object.fromEntries(report.capabilities.map((c) => [c.id, c.ready]));
  t.is('facebook-publish is READY', caps['facebook-publish'], true);
  t.is('instagram-publish is BLOCKED', caps['instagram-publish'], false);
  t.is('ads-manage is BLOCKED', caps['ads-manage'], false);
  t.is('ads-read is BLOCKED', caps['ads-read'], false);
  t.ok('the Instagram capability names its blocking check',
    report.capabilities.find((c) => c.id === 'instagram-publish').blockedBy.includes('page.ig_link'));
  t.ok('the report is not ok', report.ok === false);
}

{
  // A personal Instagram account is a class C the Content Publishing API
  // refuses outright — distinct from "not linked".
  const { report } = await run({ ig: () => res({
    id: 'IG1', username: 'simath', account_type: 'PERSONAL',
  }) });
  t.is('a PERSONAL Instagram account FAILS', find(report, 'ig.identity')?.status, 'FAIL');
  t.is('and is class C', find(report, 'ig.identity')?.blocker?.class, 'C');
  t.ok('with the conversion path named',
    /Switch to professional/.test(find(report, 'ig.identity')?.blocker?.action ?? ''));
}

{
  // An absent account_type must not be reported as a personal account. A check
  // that goes red for the wrong reason is worse than one that says "unverified".
  const { report } = await run({ ig: () => res({ id: 'IG1', username: 'simath' }) });
  t.is('an absent account_type is WARN, not FAIL', find(report, 'ig.identity')?.status, 'WARN');
}

{
  // Class D hiding as a Meta problem: the configured Instagram id disagrees
  // with the one the Page will actually publish to.
  const { report } = await run({}, {}, { igUserId: 'IGOTHER' });
  const m = find(report, 'ig.config_match');
  t.is('a mismatched META_IG_USER_ID FAILS', m?.status, 'FAIL');
  t.is('and is class D, not a Meta problem', m?.blocker?.class, 'D');
  t.ok('and names the id the Page actually reports', m?.blocker?.action.includes('IG1'));
}

{
  // Same shape for the app: appsecret_proof is computed with THIS app's
  // secret, so a mismatch makes every call look like a permission problem.
  const { report } = await run({ debug_token: () => res({ data: {
    app_id: 'OTHERAPP', is_valid: true, expires_at: 0, scopes: ALL_SCOPES,
  } }) });
  t.is('an app_id mismatch FAILS', find(report, 'app.identity')?.status, 'FAIL');
  t.is('and is class D', find(report, 'app.identity')?.blocker?.class, 'D');
}

{
  // ══ REGRESSION · the app-scoped id must never be compared ═══════════════
  // The first real L0 run failed `systemuser.identity` because /me returned
  // 122105760657440626 while META_SYSTEM_USER_ID was 61593218806694. Those are
  // an APP-SCOPED id and a BUSINESS-SCOPED id: two namespaces for one
  // identity. The old check compared them directly, so it could never have
  // gone green for a correct token — a red result that carried no information.
  //
  // Fixtures below use the REAL ids from that run.
  const APP_SCOPED = '122105760657440626';
  const BUSINESS_SCOPED = 'SU61593218806694';

  const { report } = await run({ me: () => res({ id: APP_SCOPED, name: 'Automation' }) });
  const id = find(report, 'systemuser.identity');

  t.is('an app-scoped /me id does NOT fail the identity check', id?.status, 'PASS');
  t.ok('and raises no blocker', id?.blocker === null);
  t.ok('the app-scoped id is still reported', id?.detail.includes(APP_SCOPED));
  t.ok('and the report explains the two namespaces',
    /different namespaces, not expected to match/.test(id?.detail ?? ''));

  // The decisive evidence from the real run: the same token reads the
  // configured assets. A token belonging to another identity could not.
  t.is('the Page still passes on that same token', find(report, 'page.access')?.status, 'PASS');
  t.is('the ad account still passes', find(report, 'adaccount.access')?.status, 'PASS');
  t.is('the whole run is green', report.ok, true);
  t.is('no class D blocker is invented', blockersOfClass(report, 'D').length, 0);

  // What the comparison was reaching for, done in the right namespace.
  t.is('META_SYSTEM_USER_ID is verified against the business list',
    find(report, 'systemuser.in_business')?.status, 'PASS');
  t.ok('and names the System User', /Automation/.test(find(report, 'systemuser.in_business')?.detail ?? ''));

  // ...and it must still be able to FAIL, or the fix would just have deleted
  // the diagnosis rather than relocating it.
  const wrong = await run({ systemUsers: () => res({ data: [{ id: 'SOMEONE_ELSE', name: 'Other' }] }) });
  const w = find(wrong.report, 'systemuser.in_business');
  t.is('an id absent from the business list FAILS', w?.status, 'FAIL');
  t.is('and is class D', w?.blocker?.class, 'D');
  t.ok('and warns that the two id kinds differ',
    /not the app-scoped id/.test(w?.blocker?.action ?? ''));

  // A truncated first page proves nothing either way.
  const paged = await run({ systemUsers: () => res({
    data: [{ id: 'OTHER', name: 'X' }], paging: { next: 'https://next' },
  }) });
  t.is('an unmatched id with more pages is WARN, not FAIL',
    find(paged.report, 'systemuser.in_business')?.status, 'WARN');

  // Missing business_management must not manufacture a blocker.
  const noPerm = await run({ systemUsers: () => graphErr(200, 403) });
  t.is('an unreadable System User list is WARN',
    find(noPerm.report, 'systemuser.in_business')?.status, 'WARN');
  t.ok('and raises no blocker', find(noPerm.report, 'systemuser.in_business')?.blocker === null);
}

{
  // ══ token.type — the assertion that replaced the invalid one ════════════
  const sys = await run();
  t.is('type SYSTEM_USER passes', find(sys.report, 'token.type')?.status, 'PASS');

  // Meta has not always distinguished the two. A generic USER must NOT fail —
  // that would reintroduce a false negative of exactly the kind just removed.
  const generic = await run({ debug_token: () => res({ data: {
    app_id: 'APP123', is_valid: true, expires_at: 0, type: 'USER', scopes: ALL_SCOPES,
  } }) });
  t.is('a generic USER type is WARN, not FAIL', find(generic.report, 'token.type')?.status, 'WARN');
  t.ok('and raises no blocker', find(generic.report, 'token.type')?.blocker === null);
  t.is('so the run is still green', generic.report.ok, true);

  // A genuinely wrong KIND of token must still fail.
  const page = await run({ debug_token: () => res({ data: {
    app_id: 'APP123', is_valid: true, expires_at: 0, type: 'PAGE', scopes: ALL_SCOPES,
  } }) });
  t.is('a PAGE token FAILS', find(page.report, 'token.type')?.status, 'FAIL');
  t.is('and is class D', find(page.report, 'token.type')?.blocker?.class, 'D');
  t.ok('and says where to generate the right one',
    /System users/.test(find(page.report, 'token.type')?.blocker?.action ?? ''));
}

{
  // An ad account that exists but cannot run ads is class A, not C —
  // assigning it again would not help.
  const { report } = await run({ adAccount: () => res({
    id: 'act_AD1', name: 'Si Math Ads', account_status: 3, currency: 'EGP',
  }) });
  t.is('an UNSETTLED ad account FAILS', find(report, 'adaccount.access')?.status, 'FAIL');
  t.is('and is class A (Meta configuration), not C', find(report, 'adaccount.access')?.blocker?.class, 'A');
  t.ok('with billing named as the fix',
    /Billing/.test(find(report, 'adaccount.access')?.blocker?.action ?? ''));
}

{
  // Rate limiting is transient, not a configuration blocker. Classifying it as
  // C would send an operator to Business Settings to fix nothing.
  const { report } = await run({ me: () => graphErr(4) });
  t.is('a rate limit is class A', find(report, 'systemuser.identity')?.blocker?.class, 'A');
  t.ok('and is described as transient',
    /Transient|wait/i.test(find(report, 'systemuser.identity')?.blocker?.action ?? ''));
}

{
  // Every blocker anywhere must carry a class, a reason and an action.
  // A blocker without an action is a complaint.
  const scenarios = await Promise.all([
    run({ debug_token: () => graphErr(190) }),
    run({ igLink: () => res({ id: 'PAGE1' }), adAccount: () => graphErr(100, 404) }),
    run({ me: () => graphErr(200, 403) }),
    run({ campaigns: () => graphErr(200, 403) }),
    run({ igLimit: () => graphErr(200, 403) }),
  ]);
  let total = 0;
  const complete = scenarios.every(({ report }) => report.blockers.every((b) => {
    total++;
    return ['A', 'B', 'C', 'D'].includes(b.class) &&
      typeof b.reason === 'string' && b.reason.length > 20 &&
      typeof b.action === 'string' && b.action.length > 20;
  }));
  t.ok(`every blocker across ${scenarios.length} failure scenarios is complete`, complete);
  t.ok('and there were blockers to check (not a vacuous pass)', total >= 5);

  // No blocker may quote Meta's raw upstream text back at the operator.
  const noEcho = scenarios.every(({ report }) =>
    report.blockers.every((b) => !b.reason.includes('upstream detail')));
  t.ok('no blocker relays Meta\'s raw error body', noEcho);
}

{
  // Ordering: D first. Our own configuration is the only class we can fix
  // without waiting for anyone, and a wrong env var can masquerade as any of
  // the other three.
  const { report } = await run(
    { igLink: () => res({ id: 'PAGE1' }), debug_token: () => res({ data: {
      app_id: 'OTHERAPP', is_valid: true, expires_at: 0,
      scopes: ALL_SCOPES.filter((s) => s !== 'ads_management'),
    } }) },
  );
  const classes = report.blockers.map((b) => b.class);
  t.ok('blockers are ordered D, C, B, A', classes.join('') ===
    [...classes].sort((a, b) => ['D', 'C', 'B', 'A'].indexOf(a) - ['D', 'C', 'B', 'A'].indexOf(b)).join(''));
  t.ok('the scenario produced more than one class', new Set(classes).size > 1);
}

{
  // A TRANSPORT failure — no network, DNS, a proxy — must not be reported as a
  // missing asset assignment. It was, until running the checker on a machine
  // with no route to Meta produced "not visible to this System User → go to
  // Business Settings", which is the precise misdiagnosis this module exists
  // to prevent: an operator would have gone looking for a Meta problem that
  // does not exist.
  const dead = G.createMetaClient(ENV, {
    readOnly: true,
    fetchImpl: async () => { throw new TypeError('fetch failed'); },
  });
  const report = await C.runConnectionCheck(dead, {
    appId: 'APP123', pageId: 'PAGE1', igUserId: '', adAccountId: 'act_AD1',
    businessId: 'BIZ1', systemUserId: 'SU61593218806694',
  });

  const b = find(report, 'token.valid')?.blocker;
  t.is('a transport failure is class A, not C', b?.class, 'A');
  t.ok('and says the network is the problem, not Meta',
    /transport failure/.test(b?.reason ?? ''));
  t.ok('and says nothing can be concluded about the Meta setup',
    /Nothing about the Meta setup can be concluded/.test(b?.action ?? ''));
  t.ok('no transport failure is misfiled as an asset assignment',
    report.blockers.every((x) => x.class !== 'C'));

  // An arbitrary runtime error's message is not ours to trust, so it is
  // reduced to a constant rather than interpolated into a pasteable report.
  t.ok('the raw thrown message is not relayed',
    !JSON.stringify(report).includes('fetch failed'));
  t.ok('a fixed sentence is used instead',
    /transport_failure/.test(find(report, 'token.valid')?.detail ?? ''));

  t.is('errText passes a MetaError\'s fixed sentence through',
    C.errText(new G.MetaError(400, 190)), 'token_invalid_or_revoked');
  t.is('errText reduces anything else to a constant',
    C.errText(new Error('undici: connect ECONNREFUSED 1.2.3.4:443 for https://x?access_token=T')),
    'transport_failure');
}

{
  // A proxy answering 403 must not be reported as a missing permission. Found
  // the same way as the transport bug above: by running the real checker from
  // a machine behind an egress filter and reading what it claimed.
  const proxied = { ok: false, status: 403, text: async () => 'Forbidden by proxy' };
  const { report } = await run({
    debug_token: () => proxied, me: () => proxied,
    page: () => proxied, adAccount: () => proxied,
  });

  const b = find(report, 'token.valid')?.blocker;
  t.is('a 403 with no Graph error code is class A, not B', b?.class, 'A');
  t.ok('and names a proxy or egress filter as the likely cause',
    /proxy or egress filter/.test(b?.reason ?? ''));
  t.ok('and refuses to conclude anything about permissions',
    /Nothing about the Meta permissions can be concluded/.test(b?.action ?? ''));
  t.ok('no proxy failure is misfiled as a missing permission',
    report.blockers.every((x) => x.class !== 'B'));

  // ...while a REAL Meta permission denial still lands in class B. Without
  // this the fix above would simply have moved the misdiagnosis.
  const real = await run({ me: () => graphErr(200, 403) });
  t.is('a Graph-coded 403 is still class B',
    find(real.report, 'systemuser.identity')?.blocker?.class, 'B');
  const real190 = await run({ debug_token: () => graphErr(190, 403) });
  t.is('a Graph-coded 190 is still class A with the re-issue action',
    find(real190.report, 'token.valid')?.blocker?.class, 'A');
  t.ok('and still names System users',
    /System users/.test(find(real190.report, 'token.valid')?.blocker?.action ?? ''));
}

// ══ 5 · the healthy path is genuinely reachable ═══════════════════════════
t.section('5 · a fully-configured account passes');

{
  const { report } = await run();
  const failed = report.checks.filter((c) => c.status === 'FAIL');
  t.is('no check fails on a healthy fixture', failed.map((c) => c.id), []);
  t.ok('all four capabilities are READY', report.capabilities.every((c) => c.ready));
  t.is('no blockers are raised', report.blockers.length, 0);
  t.ok('the publishing quota is reported', /47 remaining/.test(find(report, 'ig.publishing_limit')?.detail ?? ''));
  t.ok('the ad account currency is reported', /EGP/.test(find(report, 'adaccount.access')?.detail ?? ''));
}

// ══ 6 · DISCOVERY — read-only, and concludes nothing it did not read ══════
t.section('6 · asset discovery');

const DISCOVERY_FX = {
  debug_token: () => res({ data: { app_id: 'APP123', is_valid: true, scopes: ALL_SCOPES } }),
  accounts: () => res({ data: [
    { id: 'PAGE1', name: 'Si Math', category: 'Education',
      instagram_business_account: { id: 'IG1', username: 'simath' } },
  ] }),
  ownedAds: () => res({ data: [
    { id: 'act_AD1', name: 'Si Math Ads', account_status: 1, currency: 'EGP' },
  ] }),
  clientAds: () => res({ data: [] }),
  meAds: () => res({ data: [
    { id: 'act_AD1', name: 'Si Math Ads', account_status: 1, currency: 'EGP' },
  ] }),
};

function routeDiscovery(url, fx) {
  const u = new URL(url);
  const path = u.pathname.replace(/^\/v\d+\.\d+\//, '');
  if (path === 'debug_token') return fx.debug_token();
  if (path === 'me/accounts') return fx.accounts();
  if (path.endsWith('/owned_ad_accounts')) return fx.ownedAds();
  if (path.endsWith('/client_ad_accounts')) return fx.clientAds();
  if (path === 'me/adaccounts') return fx.meAds();
  return res({ error: { message: 'unrouted', code: 100 } }, 404);
}

async function discover(overrides = {}, businessId = 'BIZ1') {
  const fx = { ...DISCOVERY_FX, ...overrides };
  const requests = [];
  const client = G.createMetaClient(ENV, {
    readOnly: true,
    onRequest: (method, url) => requests.push({ method, url }),
    fetchImpl: async (url, init) => {
      requests.push({ rawMethod: init?.method ?? 'GET', rawUrl: url });
      return routeDiscovery(url, fx);
    },
  });
  return { d: await C.discoverAssets(client, { businessId }), requests };
}

{
  const { d, requests } = await discover();

  const methods = [...new Set(requests.filter((r) => r.rawMethod).map((r) => r.rawMethod))];
  t.is('discovery issues only GETs', methods, ['GET']);
  t.ok('discovery actually issued requests', requests.filter((r) => r.rawMethod).length >= 4);

  t.is('the app id is read from the token', d.appId, 'APP123');
  t.is('the Page is found', d.pages.map((p) => p.id), ['PAGE1']);
  t.is('the Page\'s Instagram link comes with it', d.pages[0].igId, 'IG1');
  t.is('the Instagram username comes with it', d.pages[0].igUsername, 'simath');
  t.is('the ad account is found', d.adAccounts.map((a) => a.id), ['act_AD1']);
  t.is('the ad account is not duplicated across edges', d.adAccounts.length, 1);
  t.is('the ad account status is decoded', d.adAccounts[0].status, 'ACTIVE');

  t.is('an unambiguous app id is suggested', d.suggested.META_APP_ID, 'APP123');
  t.is('an unambiguous Page is suggested', d.suggested.META_PAGE_ID, 'PAGE1');
  t.is('the Instagram id is suggested from the Page', d.suggested.META_IG_USER_ID, 'IG1');
  t.is('an unambiguous ad account is suggested', d.suggested.META_AD_ACCOUNT_ID, 'act_AD1');
  t.is('a healthy discovery raises no notes', d.notes, []);

  const s = JSON.stringify(d);
  t.ok('the discovery report carries no token', !s.includes(TOKEN));
  t.ok('the discovery report carries no app secret', !s.includes(APP_SECRET));
  t.ok('recorded discovery urls are redacted',
    requests.filter((r) => r.url).every((r) => !r.url.includes(TOKEN)));
}

{
  // THE GATING BUG, third instance of its shape in this file. When every edge
  // fails, discovery must not conclude "no Page is assigned" — that is a
  // network failure being reported as a Meta misconfiguration, and it sends an
  // operator into Business Settings to fix something that is not broken.
  const dead = () => ({ ok: false, status: 403, text: async () => 'Forbidden by proxy' });
  const { d } = await discover({
    debug_token: dead, accounts: dead, ownedAds: dead, clientAds: dead, meAds: dead,
  });

  t.is('nothing is discovered', [d.pages.length, d.adAccounts.length], [0, 0]);
  t.ok('NO class C assignment note is raised',
    d.notes.every((n) => n.class !== 'C'));
  t.ok('and it says explicitly that nothing can be concluded',
    d.notes.some((n) => /says NOTHING about which assets are assigned/.test(n.text)));

  // Deduplicated: one proxy outage is one instruction, not one per endpoint.
  const texts = d.notes.map((n) => n.text);
  t.is('notes are deduplicated', texts.length, new Set(texts).size);
  t.ok('and the five failing edges collapsed to a short list', d.notes.length <= 3);
}

{
  // ...but a successful read that genuinely returns nothing MUST still raise
  // the class C note. Without this, the gating fix above would simply have
  // deleted the diagnosis instead of qualifying it.
  const { d } = await discover({
    accounts: () => res({ data: [] }),
    ownedAds: () => res({ data: [] }),
    meAds: () => res({ data: [] }),
  });
  t.ok('an empty-but-READ Page list still raises class C',
    d.notes.some((n) => n.class === 'C' && /No Page is visible/.test(n.text)));
  t.ok('an empty-but-READ ad account list still raises class C',
    d.notes.some((n) => n.class === 'C' && /No ad account is visible/.test(n.text)));
  t.ok('and no "nothing could be read" note is raised',
    !d.notes.some((n) => /says NOTHING/.test(n.text)));
}

{
  // A Page with no Instagram link is a distinct, real class C.
  const { d } = await discover({
    accounts: () => res({ data: [{ id: 'PAGE1', name: 'Si Math', category: 'Education' }] }),
  });
  t.ok('an unlinked Page raises the Instagram class C note',
    d.notes.some((n) => n.class === 'C' && /No visible Page has a linked Instagram/.test(n.text)));
  t.ok('and no META_IG_USER_ID is suggested', d.suggested.META_IG_USER_ID === undefined);
  t.is('but the Page itself is still suggested', d.suggested.META_PAGE_ID, 'PAGE1');
}

{
  // Ambiguity is never resolved for the operator. Guessing between two Pages
  // is how the wrong one gets published to.
  const { d } = await discover({
    accounts: () => res({ data: [
      { id: 'PAGE1', name: 'Si Math' }, { id: 'PAGE2', name: 'Si Math Test' },
    ] }),
    ownedAds: () => res({ data: [
      { id: 'act_A', name: 'One', account_status: 1 },
      { id: 'act_B', name: 'Two', account_status: 1 },
    ] }),
    meAds: () => res({ data: [] }),
  });
  t.is('both Pages are listed', d.pages.length, 2);
  t.ok('but no META_PAGE_ID is suggested', d.suggested.META_PAGE_ID === undefined);
  t.is('both ad accounts are listed', d.adAccounts.length, 2);
  t.ok('and no META_AD_ACCOUNT_ID is suggested', d.suggested.META_AD_ACCOUNT_ID === undefined);
  t.is('the app id is still suggested (it is unambiguous)', d.suggested.META_APP_ID, 'APP123');
}

{
  // Without META_BUSINESS_ID the business-owned edges are not read, and the
  // report must say so rather than implying the account does not exist.
  const { d, requests } = await discover({}, '');
  const paths = requests.filter((r) => r.rawUrl).map((r) => new URL(r.rawUrl).pathname);
  t.ok('no business edge is called', !paths.some((p) => /owned_ad_accounts|client_ad_accounts/.test(p)));
  t.ok('and the omission is stated', d.notes.some((n) => /META_BUSINESS_ID is not set/.test(n.text)));
  t.is('the direct edge still finds the account', d.adAccounts.map((a) => a.id), ['act_AD1']);
}

{
  // Partial permission: business_management missing, so the owned lists 403
  // while /me/accounts works. A partial answer beats an exception.
  const { d } = await discover({
    ownedAds: () => graphErr(200, 403), clientAds: () => graphErr(200, 403),
  });
  t.is('the Page is still discovered', d.pages.map((p) => p.id), ['PAGE1']);
  t.is('the ad account is still found via the direct edge', d.adAccounts.map((a) => a.id), ['act_AD1']);
  t.ok('and the permission gap is noted as class B',
    d.notes.some((n) => n.class === 'B'));
}

t.done();
