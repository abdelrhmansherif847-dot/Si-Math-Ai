// Si Math AI — the L0 Meta connection check.
//
// READ-ONLY. This module issues GET requests and nothing else. It publishes
// nothing, creates no media container, calls no media_publish, creates no
// campaign, mutates no campaign, and spends nothing. That is enforced three
// ways, deliberately overlapping:
//
//   1. It is handed a client built with { readOnly: true }, whose post() and
//      del() throw ReadOnlyViolation rather than issuing a request.
//   2. It only ever calls client.get().
//   3. tests/meta-isolation.test.mjs records every request the real module
//      makes against a stub and fails if any method is not GET, and greps
//      these shipped bytes for write-shaped endpoints.
//
// Any one of those could be defeated on its own. Together they mean a write
// would have to be introduced past a type error, a runtime throw, and two
// independent tests.
//
// Specification: docs/engineering/meta-marketing-integration.md §10.0.
//
// =====================================================================
// WHY THIS FILE IS PURE
// =====================================================================
// No environment access, no printing, no filesystem, no database. It takes a
// client and a config and returns a report. scripts/meta-connection-check.mjs
// does the I/O. That split is what lets the suite execute THESE bytes with a
// stub fetch — the repo's standing rule that a test which paraphrases the code
// under test can pass while production is broken (tests/_source.mjs).
//
// =====================================================================
// THE FOUR BLOCKER CLASSES
// =====================================================================
// Every failure is classified, because the four have completely different
// owners and completely different lead times, and an operator staring at a red
// line needs to know which queue it belongs in:
//
//   A — META CONFIGURATION. The app, the token or the business setup itself is
//       wrong. Fixed in the App Dashboard or Business Settings. Usually fast.
//
//   B — MISSING PERMISSION. A scope was never granted. Fixed by App Review /
//       Advanced Access, which takes days to weeks and is the long pole.
//
//   C — MISSING ASSET ASSIGNMENT. The asset exists but this System User cannot
//       see it, or two assets are not linked to each other. Fixed in Business
//       Settings in minutes — and this is the class the spec predicts will
//       dominate the first run, because the Instagram account and the Ad
//       Account were never assigned.
//
//   D — CODE / CONFIGURATION on our side. A missing or wrong environment
//       variable. Fixed by us, immediately, and never by Meta.
//
// A check that cannot run because an earlier one failed is SKIPped and does
// NOT raise its own blocker. One root cause should produce one line of work,
// not a cascade that buries it.
// =====================================================================

import type { MetaClient } from './meta-graph.core.ts';
import { MetaError, isRateLimit, GRAPH_CODE } from './meta-graph.core.ts';

export type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
export type BlockerClass = 'A' | 'B' | 'C' | 'D';

export const BLOCKER_CLASS_LABEL: Record<BlockerClass, string> = {
  A: 'Meta configuration',
  B: 'Missing permission / scope',
  C: 'Missing asset assignment',
  D: 'Code / configuration (ours)',
};

export interface Blocker {
  class: BlockerClass;
  /** What is wrong, in one sentence, with no secret in it. */
  reason: string;
  /** What a human should DO. A blocker without an action is a complaint. */
  action: string;
}

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  blocker: Blocker | null;
}

export interface ConnectionConfig {
  appId: string;
  pageId: string;
  igUserId: string;
  adAccountId: string;
  businessId: string;
  systemUserId: string;
  /** Names of required env vars that were absent. Raised as class D here so
   *  that the report is the single place an operator has to read. */
  missingRequired?: string[];
  missingAssets?: string[];
  versionError?: string | null;
  graphVersion?: string;
}

export interface CapabilityState {
  id: string;
  label: string;
  ready: boolean;
  blockedBy: string[];
}

export interface ConnectionReport {
  checks: CheckResult[];
  blockers: Blocker[];
  capabilities: CapabilityState[];
  counts: { pass: number; fail: number; warn: number; skip: number };
  ok: boolean;
}

// ── scopes ─────────────────────────────────────────────────────────────────

export interface ScopeSpec {
  scope: string;
  capability: string;
  /** Advanced Access via App Review, as opposed to a scope that is available
   *  by default. Missing one of these is days-to-weeks of lead time, so the
   *  report says so rather than making it look like a checkbox. */
  advanced: boolean;
}

/** The scopes the six requested capabilities need. Names must be confirmed
 *  against Meta's live reference before they are relied on — the spec says so
 *  and so does this comment, because developers.facebook.com is egress-blocked
 *  from the environment this was written in. */
export const REQUIRED_SCOPES: ScopeSpec[] = [
  { scope: 'pages_show_list', capability: 'facebook-publish', advanced: false },
  { scope: 'pages_read_engagement', capability: 'facebook-publish', advanced: false },
  { scope: 'pages_manage_posts', capability: 'facebook-publish', advanced: true },
  { scope: 'instagram_basic', capability: 'instagram-publish', advanced: false },
  { scope: 'instagram_content_publish', capability: 'instagram-publish', advanced: true },
  { scope: 'ads_read', capability: 'ads-read', advanced: false },
  { scope: 'ads_management', capability: 'ads-manage', advanced: true },
  { scope: 'business_management', capability: 'assets', advanced: true },
  { scope: 'read_insights', capability: 'ads-read', advanced: false },
];

// ── error classification ───────────────────────────────────────────────────

/** Map a Graph failure onto a blocker class.
 *
 *  The interesting case is code 100 / HTTP 404. Meta answers "this object does
 *  not exist" and "this object exists but your token cannot see it" almost
 *  identically, because telling them apart would itself be an information
 *  leak. For an L0 check against an id the operator supplied, the overwhelmingly
 *  likely cause is the second — the asset was never assigned to the System
 *  User — so it is reported as class C with the assignment as the action, and
 *  the wording admits the other possibility rather than asserting. */
/** A safe one-word description of a thrown value.
 *
 *  MetaError's message is already a FIXED sentence chosen by
 *  metaErrorMessage(), so it is safe to print. Anything else is an arbitrary
 *  runtime error whose message we do not control — undici, for one, has been
 *  known to attach request context — so it is reduced to a constant rather
 *  than interpolated into a report an operator will paste somewhere. */
export function fbtrace(e: unknown): string {
  const id = (e as MetaError)?.fbtraceId;
  return typeof id === 'string' && id ? ` (fbtrace ${id})` : '';
}

export function errText(e: unknown): string {
  const status = (e as MetaError)?.status;
  return typeof status === 'number' ? String((e as MetaError).message) : 'transport_failure';
}

export function classifyError(e: unknown, what: string): Blocker {
  // A MetaError carries a numeric status because Meta answered. Anything else
  // reaching here means the request never completed: DNS, TLS, a proxy, no
  // network. Duck-typed rather than `instanceof`, which is unreliable across
  // module realms and would silently take the wrong branch.
  const status = (e as MetaError)?.status;
  if (typeof status !== 'number') {
    return {
      class: 'A',
      reason: `${what}: the request to Meta never completed (transport failure).`,
      action: 'This is a network problem on the machine running the check, not a ' +
        'Meta configuration problem. Confirm outbound HTTPS to graph.facebook.com ' +
        'is permitted, then re-run. Nothing about the Meta setup can be concluded ' +
        'from this run.',
    };
  }
  return classifyGraphError(e as MetaError, what);
}

export function classifyGraphError(err: MetaError, what: string): Blocker {
  if (err.code === GRAPH_CODE.TOKEN_INVALID) {
    return {
      class: 'A',
      reason: `${what}: the access token is invalid, expired or revoked (code 190).`,
      action: 'Re-issue the System User token in Business Settings → Users → ' +
        'System users → Generate new token, then update the META_SYSTEM_USER_TOKEN ' +
        'secret. Note a System User token is also invalidated by regenerating the ' +
        'app secret or by removing an asset assignment.',
    };
  }
  if (isRateLimit(err.code) || err.status === 429) {
    return {
      class: 'A',
      reason: `${what}: rate limited by Meta (code ${err.code}).`,
      action: 'Transient. Wait and re-run the check; do not retry in a loop.',
    };
  }
  if (err.code === GRAPH_CODE.TEMPORARILY_BLOCKED) {
    return {
      class: 'A',
      reason: `${what}: the app or account is temporarily blocked by Meta (code 368).`,
      action: 'Check the App Dashboard and Business Support Home for a policy notice.',
    };
  }
  // AN INTERMEDIARY, NOT META. Every genuine Graph application error carries a
  // numeric `code` in its body — an auth failure is code 190 or 200, never 0.
  // A 401/403/407 with NO Graph code did not come from Graph's application
  // layer at all: it is a proxy, a corporate egress filter, or a gateway.
  //
  // This branch exists because the first real run of this checker hit exactly
  // that: an egress proxy answered 403, the check reported "missing
  // permission", and the actionable next step it offered was App Review —
  // weeks of waiting for a problem that was one network rule. Reporting a
  // proxy as a permission failure is the same class of misdiagnosis as
  // reporting a transport failure as a missing asset assignment.
  if (err.code === 0 && (err.status === 401 || err.status === 403 || err.status === 407)) {
    return {
      class: 'A',
      reason: `${what}: HTTP ${err.status} with no Graph error code — the response did ` +
        'not come from the Graph API. This is characteristic of a proxy or egress filter, ' +
        'not of Meta refusing the call.',
      action: 'Confirm the machine running this check can reach graph.facebook.com ' +
        'directly. Nothing about the Meta permissions can be concluded from this ' +
        'run — a real Meta permission failure always carries a Graph error code ' +
        '(190 or 200).',
    };
  }

  if (err.code === GRAPH_CODE.PERMISSION_DENIED || err.code === GRAPH_CODE.PERMISSION_API ||
      err.status === 401 || err.status === 403) {
    return {
      class: 'B',
      reason: `${what}: the token lacks the permission for this call (code ${err.code}).`,
      action: 'Check the granted-scopes line above. A scope that needs Advanced ' +
        'Access must go through App Review before it is granted.',
    };
  }
  if (err.status >= 500) {
    return {
      class: 'A',
      reason: `${what}: Meta returned a server error (HTTP ${err.status}).`,
      action: 'Transient on Meta\'s side. Re-run the check.',
    };
  }
  return {
    class: 'C',
    reason: `${what}: not visible to this System User (HTTP ${err.status}, code ${err.code}). ` +
      'Most often the asset was never assigned; it can also mean the id is wrong.',
    action: 'Business Settings → Accounts → assign the asset to System User, ' +
      'then confirm the id in the corresponding environment variable.',
  };
}

// ── the check run ──────────────────────────────────────────────────────────

const ok = (id: string, label: string, detail: string): CheckResult =>
  ({ id, label, status: 'PASS', detail, blocker: null });

const bad = (id: string, label: string, detail: string, blocker: Blocker): CheckResult =>
  ({ id, label, status: 'FAIL', detail, blocker });

const warn = (id: string, label: string, detail: string, blocker: Blocker | null = null): CheckResult =>
  ({ id, label, status: 'WARN', detail, blocker });

const skip = (id: string, label: string, because: string): CheckResult =>
  ({ id, label, status: 'SKIP', detail: `skipped — ${because}`, blocker: null });

/** Compare two Graph ids safely.
 *
 *  `id` is ANNOTATED as string throughout this file, but a TypeScript
 *  annotation is erased at runtime and Graph is not obliged to honour it. When
 *  an id arrives as a JSON number, `61593218806694 === '61593218806694'` is
 *  false — identical values, failed comparison, and a check that reports a
 *  correct configuration as broken. That is exactly what happened here.
 *
 *  Both sides are coerced and trimmed. An absent id never equals anything. */
export function normalizeId(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export function idsEqual(a: unknown, b: unknown): boolean {
  const x = normalizeId(a);
  return x !== '' && x === normalizeId(b);
}

/** True when an id survived JSON parsing intact.
 *
 *  A Graph id delivered as an unquoted JSON number larger than 2^53 is already
 *  corrupted by JSON.parse before any comparison happens — 18-digit ids are
 *  well past that, and the app-scoped id seen on this project's first real run
 *  (122105760657440626) is one. Graph sends ids as strings in practice, so
 *  this is a latent hazard rather than the present bug; it is detected and
 *  reported rather than silently compared, because a comparison against a
 *  corrupted value cannot be trusted in either direction. */
export function idIsPrecisionSafe(v: unknown): boolean {
  return typeof v !== 'number' || Number.isSafeInteger(v);
}

/** Ad account ids are `act_<digits>`. Operators paste them both ways, and the
 *  difference is a 404 that reads like a permission problem. Normalise rather
 *  than lecture. */
export function normalizeAdAccountId(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

/** Meta's ad account status codes. Only the ones worth naming. */
export const AD_ACCOUNT_STATUS: Record<number, string> = {
  1: 'ACTIVE',
  2: 'DISABLED',
  3: 'UNSETTLED',
  7: 'PENDING_RISK_REVIEW',
  8: 'PENDING_SETTLEMENT',
  9: 'IN_GRACE_PERIOD',
  100: 'PENDING_CLOSURE',
  101: 'CLOSED',
  201: 'ANY_ACTIVE',
  202: 'ANY_CLOSED',
};

interface SystemUserRow { id?: unknown; name?: unknown }

/** Read a business's System Users across pages.
 *
 *  The edge's default limit is 25 and it paginates with cursors, so reading
 *  page one and treating absence as proof — which the first version of this
 *  check did — is not a search, it is a sample. Bounded at MAX_PAGES so a
 *  misbehaving cursor cannot loop forever; when the bound is hit that is
 *  reported rather than passed off as a complete read. */
export async function listSystemUsers(
  client: MetaClient,
  businessId: string,
  maxPages = 5,
): Promise<{ rows: SystemUserRow[]; morePages: boolean; unsafe: boolean }> {
  const rows: SystemUserRow[] = [];
  let after = '';
  let morePages = false;
  let unsafe = false;

  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string> = { fields: 'id,name', limit: '100' };
    if (after) params.after = after;
    const r = await client.get<{
      data?: SystemUserRow[];
      paging?: { next?: string; cursors?: { after?: string } };
    }>(`${businessId}/system_users`, params);

    const batch = r.data ?? [];
    for (const row of batch) if (!idIsPrecisionSafe(row.id)) unsafe = true;
    rows.push(...batch);

    if (!r.paging?.next) return { rows, morePages: false, unsafe };
    after = r.paging.cursors?.after ?? '';
    // A next link with no cursor cannot be followed through this client, which
    // builds its own urls. Report the gap rather than pretending completeness.
    if (!after) return { rows, morePages: true, unsafe };
    morePages = true;
  }
  return { rows, morePages, unsafe };
}

/**
 * Run every L0 check. GET only.
 *
 * `client` must be read-only; this function does not construct one, so the
 * caller decides — and scripts/meta-connection-check.mjs constructs it with
 * readOnly: true. The first check asserts the flag, so a caller that passed a
 * writeable client is told, rather than being silently trusted.
 */
export async function runConnectionCheck(
  client: MetaClient,
  cfg: ConnectionConfig,
): Promise<ConnectionReport> {
  const checks: CheckResult[] = [];
  const push = (r: CheckResult) => { checks.push(r); return r; };

  // ══ 0 · our own configuration ════════════════════════════════════════════
  const missingRequired = cfg.missingRequired ?? [];
  const missingAssets = cfg.missingAssets ?? [];

  if (!client.readOnly) {
    push(bad('client.readonly', 'Client is read-only',
      'the client passed to the L0 check can issue writes', {
        class: 'D',
        reason: 'runConnectionCheck was handed a writeable client.',
        action: 'Construct it with createMetaClient(env, { readOnly: true }). ' +
          'L0 must be incapable of writing, not merely uninclined to.',
      }));
  } else {
    push(ok('client.readonly', 'Client is read-only',
      'post() and del() throw ReadOnlyViolation'));
  }

  if (cfg.versionError) {
    push(bad('env.version', 'META_GRAPH_VERSION is well-formed', cfg.versionError, {
      class: 'D',
      reason: cfg.versionError,
      action: 'Set META_GRAPH_VERSION to a pinned version such as v26.0 ' +
        '(current as of 2026-08-21). Never call the unversioned endpoint.',
    }));
  } else {
    push(ok('env.version', 'META_GRAPH_VERSION is well-formed',
      `pinned to ${cfg.graphVersion || '(unset)'}`));
  }

  if (missingRequired.length) {
    push(bad('env.required', 'Required environment variables present',
      `absent: ${missingRequired.join(', ')}`, {
        class: 'D',
        reason: `Required environment variables are not set: ${missingRequired.join(', ')}.`,
        action: 'Export them for a local run, or set them with `supabase secrets set` ' +
          'for the deployed function. Never commit them and never paste them into chat.',
      }));
    // Nothing below can run without credentials. Return early rather than
    // producing a screen of SKIPs that hide the one line that matters.
    return finish(checks);
  }
  push(ok('env.required', 'Required environment variables present',
    'all 4 set (values not shown)'));

  if (missingAssets.length) {
    push(warn('env.assets', 'Asset id environment variables present',
      `absent: ${missingAssets.join(', ')}`, {
        class: 'D',
        reason: `Asset ids not configured: ${missingAssets.join(', ')}.`,
        action: 'Set the ones for capabilities you intend to use. An absent id is ' +
          'not itself a Meta problem — the matching checks below are skipped, not failed.',
      }));
  } else {
    push(ok('env.assets', 'Asset id environment variables present', 'all 5 set'));
  }

  // ══ 1 · /debug_token — token validity, app identity, scopes ══════════════
  // The single most useful diagnostic on the whole ladder: one read answers
  // "is the token alive", "is it this app's", "does it expire" and "what was
  // actually granted".
  //
  // The token inspects ITSELF, via client.debugToken(). That method exists
  // precisely so this file never touches the token: /debug_token is the one
  // endpoint whose parameter IS the credential, and the substitution happens
  // inside the adapter. See MetaClient.debugToken() for why an app access
  // token is not used instead.
  interface DebugTokenBody {
    data?: {
      app_id?: string; is_valid?: boolean; expires_at?: number;
      data_access_expires_at?: number; scopes?: string[]; type?: string;
      user_id?: string; application?: string;
    };
  }

  let scopes: string[] = [];
  let tokenOk = false;

  try {
    const body = await client.debugToken<DebugTokenBody>();
    const d = body.data ?? {};
    tokenOk = d.is_valid === true;

    // 3 · token validity
    if (tokenOk) {
      push(ok('token.valid', 'System User token is valid', `type ${d.type ?? 'unknown'}`));

      // WHICH KIND of token. This replaces an identity comparison that could
      // never have been true — see the block at "/me" below. `type` is a
      // property of the token itself, in one namespace, so it can actually be
      // asserted on, and it rules out precisely what the owner said they did
      // not want: a Graph API Explorer token or a personal login.
      const tokenType = String(d.type ?? '').toUpperCase();
      if (tokenType === 'SYSTEM_USER') {
        push(ok('token.type', 'Token is a System User token',
          'debug_token reports type SYSTEM_USER'));
      } else if (tokenType === 'USER') {
        // Meta has not always distinguished the two here. A generic USER type
        // is NOT evidence of the wrong token, so it must not fail: combined
        // with expires_at = 0 and a successful asset read it is a System User
        // token. Reporting it as a failure would be the same false-negative
        // this whole block exists to remove.
        push(warn('token.type', 'Token is a System User token',
          'debug_token reports the generic type USER — Meta does not always distinguish ' +
          'a System User token here. Read it with the expiry check: a token that never ' +
          'expires and reads the configured assets is a System User token.'));
      } else if (!tokenType) {
        push(warn('token.type', 'Token is a System User token', 'debug_token returned no type'));
      } else {
        push(bad('token.type', 'Token is a System User token',
          `debug_token reports type ${tokenType}`, {
            class: 'D',
            reason: `The token is a ${tokenType} token, not a System User token.`,
            action: 'Generate it from Business Settings → Users → System users → ' +
              'Automation → Generate new token. A Page or app token cannot drive this ' +
              'integration.',
          }));
      }
    } else {
      push(bad('token.valid', 'System User token is valid', 'debug_token reports is_valid=false', {
        class: 'A',
        reason: 'Meta reports the token as not valid.',
        action: 'Re-issue the System User token in Business Settings → Users → ' +
          'System users, and update the META_SYSTEM_USER_TOKEN secret.',
      }));
    }

    // 2 · Meta App identity
    if (!d.app_id) {
      push(warn('app.identity', 'Token belongs to the configured Meta App',
        'debug_token returned no app_id'));
    } else if (d.app_id === cfg.appId) {
      push(ok('app.identity', 'Token belongs to the configured Meta App',
        `app_id matches META_APP_ID (${d.app_id})`));
    } else {
      push(bad('app.identity', 'Token belongs to the configured Meta App',
        `token app_id ${d.app_id} != META_APP_ID ${cfg.appId}`, {
          class: 'D',
          reason: 'The token was issued by a different Meta App than META_APP_ID names.',
          action: 'Either META_APP_ID is wrong, or the token came from the wrong app. ' +
            'appsecret_proof is computed with THIS app\'s secret, so a mismatch ' +
            'makes every call fail in a way that looks like a permission problem.',
        }));
    }

    // token expiry — the production-readiness question
    if (d.expires_at === 0) {
      push(ok('token.expiry', 'Token is non-expiring (System User token)',
        'expires_at = 0'));
    } else if (typeof d.expires_at === 'number') {
      const when = new Date(d.expires_at * 1000).toISOString();
      push(warn('token.expiry', 'Token is non-expiring (System User token)',
        `expires_at = ${d.expires_at} (${when})`, {
          class: 'A',
          reason: 'The token expires. That is the signature of a user or long-lived ' +
            'user token, not a System User token — it will fail unattended on that date.',
          action: 'Generate the token from Business Settings → Users → System users → ' +
            `${cfg.systemUserId || 'Automation'} → Generate new token, not from Graph API ` +
            'Explorer or a login flow.',
        }));
    } else {
      push(warn('token.expiry', 'Token is non-expiring (System User token)',
        'debug_token returned no expires_at'));
    }

    // data_access_expires_at is a separate, quieter clock and expires even on
    // System User tokens. Reported as information because it is a real future
    // outage that nobody looks for, but not a blocker today.
    if (typeof d.data_access_expires_at === 'number' && d.data_access_expires_at > 0) {
      push(warn('token.data_access', 'Data access window',
        `data_access_expires_at = ${new Date(d.data_access_expires_at * 1000).toISOString()} ` +
        '— a separate clock from token expiry; re-check before that date'));
    }

    // 8 · scopes actually granted
    scopes = Array.isArray(d.scopes) ? d.scopes : [];
  } catch (e) {
    push(bad('token.valid', 'System User token is valid',
      `debug_token failed: ${errText(e)}${fbtrace(e)}`,
      classifyError(e, '/debug_token')));
    push(skip('app.identity', 'Token belongs to the configured Meta App', 'debug_token failed'));
    push(skip('token.expiry', 'Token is non-expiring (System User token)', 'debug_token failed'));
  }

  // 8 · granted vs required scopes
  if (scopes.length) {
    const granted = new Set(scopes);
    const missing = REQUIRED_SCOPES.filter((s) => !granted.has(s.scope));
    if (!missing.length) {
      push(ok('scopes.granted', 'All required scopes granted',
        `${scopes.length} scopes: ${scopes.join(', ')}`));
    } else {
      const advanced = missing.filter((s) => s.advanced).map((s) => s.scope);
      const standard = missing.filter((s) => !s.advanced).map((s) => s.scope);
      push(bad('scopes.granted', 'All required scopes granted',
        `granted: ${scopes.join(', ') || '(none)'} — missing: ${missing.map((s) => s.scope).join(', ')}`, {
          class: 'B',
          reason: `Scopes not granted: ${missing.map((s) => s.scope).join(', ')}.` +
            (advanced.length ? ` Of these, ${advanced.join(', ')} need Advanced Access.` : ''),
          action: (advanced.length
            ? 'Submit the app for App Review for the Advanced Access scopes — this is ' +
              'the long pole, measured in days to weeks, so start it first. '
            : '') +
            (standard.length
              ? `Then re-generate the System User token with ${standard.join(', ')} ticked. `
              : '') +
            'Scopes are chosen when the token is generated: adding one later means a NEW token.',
        }));
    }
  } else if (tokenOk) {
    push(warn('scopes.granted', 'All required scopes granted',
      'debug_token returned no scope list — cannot verify'));
  } else {
    push(skip('scopes.granted', 'All required scopes granted', 'token could not be inspected'));
  }

  // ══ 2 · /me — the APP-SCOPED identity. Reported, never compared. ═════════
  //
  // THIS CHECK USED TO COMPARE `me.id` AGAINST META_SYSTEM_USER_ID AND FAIL ON
  // A MISMATCH. That assertion was invalid and could never have gone green for
  // a correctly configured System User token:
  //
  //   /me returns an APP-SCOPED id (an ASID) — unique to the (identity, app)
  //   pair, and the default since Graph API v2.0. Business Settings displays
  //   the BUSINESS-SCOPED System User id. They are different namespaces
  //   describing the same identity, so they do not match and are not meant to.
  //
  // It fired on the first real run: debug_token reported type SYSTEM_USER with
  // the right app_id, and the SAME token then read the configured Page and Ad
  // Account successfully — which a token belonging to some other identity
  // could not do. The evidence contradicted the assertion, so the assertion
  // was wrong.
  //
  // The repo's rule is that a green check is only evidence if it could have
  // gone red (docs/roadmap/verification-framework-audit.md). This is that rule
  // read the other way: A RED CHECK IS ONLY EVIDENCE IF IT COULD HAVE GONE
  // GREEN. This one could not, for any valid configuration.
  //
  // What replaced it is strictly stronger, because each part is comparable
  // within one namespace: token.type above (is this a System User token),
  // app.identity above (is it THIS app — app ids are global, not scoped),
  // systemuser.in_business below (is META_SYSTEM_USER_ID a real System User
  // here), and the asset reads (can it actually reach the Page and account).
  try {
    const me = await client.get<{ id?: string; name?: string }>('me', { fields: 'id,name' });
    push(ok('systemuser.identity', 'Token resolves to an identity',
      `app-scoped id ${me.id ?? '?'}${me.name ? ` (${me.name})` : ''}` +
      (cfg.systemUserId
        ? ` — the business-scoped id is ${cfg.systemUserId}; different namespaces, ` +
          'not expected to match'
        : '')));
  } catch (e) {
    push(bad('systemuser.identity', 'Token resolves to an identity',
      `/me failed: ${errText(e)}`, classifyError(e, '/me')));
  }

  // ══ 2b · does META_SYSTEM_USER_ID name a real System User? ═══════════════
  //
  // THIS CHECK CAN NO LONGER FAIL, AND THAT IS DELIBERATE.
  //
  // Its first version reported class D — "META_SYSTEM_USER_ID does not name a
  // System User in META_BUSINESS_ID" — for a configuration that was correct:
  // the same token passes debug_token as SYSTEM_USER, belongs to the right
  // app, and reads the configured Page and Ad Account. It was the second
  // false negative in this module in a row, and it was written as the FIX for
  // the first one.
  //
  // Three defects were found in it, all mine:
  //
  //   1. `r.id === cfg.systemUserId` is a strict comparison between values
  //      whose runtime types are not guaranteed to match. See idsEqual().
  //   2. It reported "not among the 2 System Users" WITHOUT LISTING THEM, so
  //      the one piece of data needed to judge the failure was withheld from
  //      the person being asked to act on it.
  //   3. It only ever read page one, and treated absence there as proof.
  //
  // And a fourth, which is why it now warns instead of failing: Meta's own
  // reference for this edge could not be reached to confirm its semantics —
  // whether it returns business-scoped ids for every System User, whether the
  // list is filtered by what the calling token may see, or whether a System
  // User appears in its own business's list at all. Without that, there is no
  // basis for deciding when a no-match is real.
  //
  // The repo rule this module produced applies to itself: A RED CHECK IS ONLY
  // EVIDENCE IF IT COULD HAVE GONE GREEN. Until the semantics are confirmed,
  // a no-match is "not verified", never "wrong" — and the raw ids are printed
  // so a human can make the call the code cannot.
  if (!cfg.systemUserId) {
    push(skip('systemuser.in_business', 'META_SYSTEM_USER_ID names a real System User',
      'META_SYSTEM_USER_ID is not set'));
  } else {
    const evidence: string[] = [];
    let confirmed = '';

    // ── probe A · read the node directly ──────────────────────────────────
    // Immune to list filtering, ordering and pagination, because it asks
    // about ONE id instead of searching a list for it. Strictly better
    // evidence than membership, and it should have been the primary probe
    // from the start.
    try {
      const node = await client.get<{ id?: unknown; name?: unknown }>(
        cfg.systemUserId, { fields: 'id,name' },
      );
      if (idsEqual(node.id, cfg.systemUserId)) {
        confirmed = `direct read: ${normalizeId(node.name) || '(unnamed)'}`;
      } else if (node.id !== undefined) {
        evidence.push(`direct read returned a different id (${normalizeId(node.id)})`);
      }
    } catch (e) {
      evidence.push(`direct read failed: ${errText(e)}`);
    }

    // ── probe B · the business list, paginated ────────────────────────────
    if (!confirmed && cfg.businessId) {
      try {
        const { rows, morePages, unsafe } = await listSystemUsers(client, cfg.businessId);
        const hit = rows.find((r) => idsEqual(r.id, cfg.systemUserId));
        if (hit) {
          confirmed = `business list: ${normalizeId(hit.name) || '(unnamed)'}`;
        } else {
          // THE EVIDENCE, SHOWN. Defect 2 above: a failure that withholds the
          // data needed to judge it is not a diagnostic.
          const listed = rows.map((r) => `${normalizeId(r.id)}${r.name ? ` (${normalizeId(r.name)})` : ''}`);
          evidence.push(`business list returned ${rows.length}: ${listed.join(', ') || '(none)'}`);
          if (morePages) evidence.push('more pages remained unread');
          if (unsafe) {
            evidence.push('at least one id arrived as an oversized JSON number and lost ' +
              'precision during parsing — comparison against it is unreliable');
          }
        }
      } catch (e) {
        evidence.push(`business list failed: ${errText(e)} (needs business_management)`);
      }
    } else if (!confirmed) {
      evidence.push('META_BUSINESS_ID is not set, so the business list was not read');
    }

    if (confirmed) {
      push(ok('systemuser.in_business', 'META_SYSTEM_USER_ID names a real System User',
        `${cfg.systemUserId} confirmed — ${confirmed}`));
    } else {
      push(warn('systemuser.in_business', 'META_SYSTEM_USER_ID names a real System User',
        `NOT VERIFIED for ${cfg.systemUserId} — ${evidence.join('; ')}. ` +
        'This does NOT mean the id is wrong: the token\'s own asset access is the ' +
        'authoritative signal, and this edge\'s semantics are unconfirmed. Change ' +
        'META_SYSTEM_USER_ID only if Business Settings shows a different id.'));
    }
  }

  // ══ 3 · Facebook Page ════════════════════════════════════════════════════
  let igFromPage = '';
  if (!cfg.pageId) {
    push(skip('page.access', 'Si Math Facebook Page is accessible', 'META_PAGE_ID is not set'));
    push(skip('page.ig_link', 'Page is linked to an Instagram Business account',
      'META_PAGE_ID is not set'));
  } else {
    try {
      const page = await client.get<{ id?: string; name?: string; category?: string }>(
        cfg.pageId, { fields: 'id,name,category' },
      );
      push(ok('page.access', 'Si Math Facebook Page is accessible',
        `${page.name ?? '(unnamed)'} — id ${page.id ?? cfg.pageId}` +
        (page.category ? `, category ${page.category}` : '')));

      // 5 · Page → Instagram Business Account linkage.
      // Read as its own request so a linkage failure is distinguishable from a
      // Page-access failure — they have different owners and different fixes.
      try {
        const link = await client.get<{ instagram_business_account?: { id?: string; username?: string } }>(
          cfg.pageId, { fields: 'instagram_business_account{id,username}' },
        );
        igFromPage = link.instagram_business_account?.id ?? '';
        if (igFromPage) {
          const uname = link.instagram_business_account?.username;
          push(ok('page.ig_link', 'Page is linked to an Instagram Business account',
            `linked to ig id ${igFromPage}${uname ? ` (@${uname})` : ''}`));
        } else {
          push(bad('page.ig_link', 'Page is linked to an Instagram Business account',
            'instagram_business_account is empty', {
              class: 'C',
              reason: 'The Si Math Page has no linked Instagram Professional account, ' +
                'or the account is not visible to this System User.',
              action: 'Convert the Si Math Instagram account to Professional ' +
                '(Business or Creator), link it to the Si Math Page, then assign it to ' +
                'the System User in Business Settings → Accounts → Instagram accounts. ' +
                'Instagram publishing is impossible until this reads a real id.',
            }));
        }
      } catch (e) {
        push(bad('page.ig_link', 'Page is linked to an Instagram Business account',
          `linkage read failed: ${errText(e)}`,
          classifyError(e, 'Page → instagram_business_account')));
      }
    } catch (e) {
      push(bad('page.access', 'Si Math Facebook Page is accessible',
        `page read failed: ${errText(e)}`, classifyError(e, 'Facebook Page')));
      push(skip('page.ig_link', 'Page is linked to an Instagram Business account',
        'the Page itself could not be read'));
    }
  }

  // ══ 4 · Instagram account ════════════════════════════════════════════════
  // Prefer the id the PAGE reports over the configured one: the Page is the
  // authority on what will actually publish. A configured id that disagrees is
  // a class D error worth catching now rather than at the first post.
  const igId = igFromPage || cfg.igUserId;

  if (cfg.igUserId && igFromPage && cfg.igUserId !== igFromPage) {
    push(bad('ig.config_match', 'META_IG_USER_ID matches the Page\'s linked account',
      `configured ${cfg.igUserId}, Page reports ${igFromPage}`, {
        class: 'D',
        reason: 'META_IG_USER_ID names a different Instagram account than the one linked ' +
          'to the Si Math Page.',
        action: `Set META_IG_USER_ID to ${igFromPage}, or link the intended account to ` +
          'the Page. Publishing uses the Page\'s linked account, so the configured value ' +
          'would silently be the wrong one.',
      }));
  } else if (cfg.igUserId && igFromPage) {
    push(ok('ig.config_match', 'META_IG_USER_ID matches the Page\'s linked account',
      `both ${igFromPage}`));
  }

  if (!igId) {
    push(skip('ig.identity', 'Instagram account is reachable', 'no Instagram account id available'));
    push(skip('ig.publishing_limit', 'Instagram publishing quota is readable',
      'no Instagram account id available'));
  } else {
    try {
      // account_type IS NOT A FIELD ON THIS NODE. Requesting it made Meta
      // reject the WHOLE request with "(#100) Tried accessing nonexisting
      // field (account_type)", so a perfectly healthy Instagram account
      // failed this check. The IG User node reached through the Page exposes
      // id, username, name, biography, followers_count, follows_count,
      // media_count, profile_picture_url and website — account_type belongs to
      // a different node type. Verified against this project's own account:
      // id, username, media_count and followers_count all succeed; adding
      // account_type is the only thing that fails.
      const igu = await client.get<{
        id?: unknown; username?: unknown;
        media_count?: unknown; followers_count?: unknown;
      }>(igId, { fields: 'id,username,media_count,followers_count' });

      // WHAT THIS CHECK CAN HONESTLY CLAIM.
      // Not "the account is Professional" — no field available here states
      // that, and inventing one from a successful read would be asserting
      // something the API never said. What a successful read DOES establish is
      // that the id resolves to a reachable Instagram account with this
      // token, which is what the label now says.
      //
      // Professional status is not unverified, it is just not verified HERE:
      // page.ig_link only returns instagram_business_account for a Professional
      // account connected to the Page, and ig.publishing_limit only answers for
      // one. Two independent checks already carry it, so this one does not need
      // to guess.
      push(ok('ig.identity', 'Instagram account is reachable',
        `@${normalizeId(igu.username) || '?'} — id ${normalizeId(igu.id) || igId}` +
        (typeof igu.media_count === 'number' ? `, ${igu.media_count} media` : '') +
        (typeof igu.followers_count === 'number' ? `, ${igu.followers_count} followers` : '')));
    } catch (e) {
      push(bad('ig.identity', 'Instagram account is reachable',
        `read failed: ${errText(e)}`, classifyError(e, 'Instagram account')));
    }

    // 6 · availability — the 50-posts-per-24h quota.
    // Read here rather than at publish time so the number is known before it
    // matters. Reading it also proves instagram_content_publish is genuinely
    // usable, which the scope list alone does not.
    try {
      const lim = await client.get<{ data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }> }>(
        `${igId}/content_publishing_limit`, { fields: 'config,quota_usage' },
      );
      const row = lim.data?.[0] ?? {};
      const used = typeof row.quota_usage === 'number' ? row.quota_usage : 0;
      const total = row.config?.quota_total ?? 50;
      push(ok('ig.publishing_limit', 'Instagram publishing quota is readable',
        `${used}/${total} used in the last 24h — ${Math.max(0, total - used)} remaining`));
    } catch (e) {
      push(bad('ig.publishing_limit', 'Instagram publishing quota is readable',
        `read failed: ${errText(e)}`,
        classifyError(e, 'content_publishing_limit')));
    }
  }

  // ══ 5 · Ad account ═══════════════════════════════════════════════════════
  const adId = normalizeAdAccountId(cfg.adAccountId);
  if (!adId) {
    push(skip('adaccount.access', 'Ad account is accessible', 'META_AD_ACCOUNT_ID is not set'));
    push(skip('adaccount.read', 'Ad account campaigns are readable',
      'META_AD_ACCOUNT_ID is not set'));
  } else {
    let accountReadable = false;
    try {
      const acct = await client.get<{
        id?: string; name?: string; account_status?: number;
        currency?: string; timezone_name?: string; spend_cap?: string; amount_spent?: string;
      }>(adId, { fields: 'id,name,account_status,currency,timezone_name,spend_cap,amount_spent' });

      accountReadable = true;
      const status = acct.account_status ?? 0;
      const statusName = AD_ACCOUNT_STATUS[status] ?? `UNKNOWN(${status})`;
      const detail = `${acct.name ?? '(unnamed)'} — ${statusName}` +
        (acct.currency ? `, ${acct.currency}` : '') +
        (acct.timezone_name ? `, ${acct.timezone_name}` : '') +
        `, spend cap ${acct.spend_cap ?? 'none'}`;

      if (status === 1) {
        push(ok('adaccount.access', 'Ad account is accessible', detail));
      } else {
        push(bad('adaccount.access', 'Ad account is accessible', detail, {
          class: 'A',
          reason: `The ad account is ${statusName}, not ACTIVE. Campaigns cannot run.`,
          action: statusName === 'UNSETTLED' || statusName === 'PENDING_SETTLEMENT'
            ? 'Settle the outstanding balance in Ads Manager → Billing.'
            : 'Open Ads Manager and resolve the account state before any ads work.',
        }));
      }
    } catch (e) {
      const blocker = classifyError(e, 'Ad account');
      // Sharpen the generic class C action: for an ad account the assignment
      // path is specific enough to name exactly.
      if (blocker.class === 'C') {
        blocker.reason = 'The ad account is not visible to this System User. Per the ' +
          'integration spec, no Ad Account was assigned to it.';
        blocker.action = 'Business Settings → Accounts → Ad accounts → select the ' +
          'account → Assign people → add the Automation System User with the ' +
          '"Manage campaigns" task. Then confirm META_AD_ACCOUNT_ID.';
      }
      push(bad('adaccount.access', 'Ad account is accessible',
        `read failed: ${errText(e)}`, blocker));
    }

    if (!accountReadable) {
      push(skip('adaccount.read', 'Ad account campaigns are readable',
        'the ad account itself could not be read'));
    } else {
      // 7 · a real ads_read exercise. Reading the campaign edge proves the
      // scope works, which reading the account object alone does not.
      try {
        const camps = await client.get<{ data?: unknown[] }>(
          `${adId}/campaigns`, { fields: 'id,name,status', limit: '1' },
        );
        const n = Array.isArray(camps.data) ? camps.data.length : 0;
        push(ok('adaccount.read', 'Ad account campaigns are readable',
          `ads_read works — ${n === 0 ? 'no existing campaigns' : 'at least one campaign'}`));
      } catch (e) {
        push(bad('adaccount.read', 'Ad account campaigns are readable',
          `campaign read failed: ${errText(e)}`,
          classifyError(e, 'Ad account campaigns')));
      }
    }
  }

  return finish(checks);
}

// ── roll-up ────────────────────────────────────────────────────────────────

/** The six capabilities the owner asked for, and the checks each depends on.
 *  A capability is ready only when every check it names passed — which is what
 *  turns a list of green ticks into an answer to "can we publish yet". */
export const CAPABILITY_CHECKS: Array<{ id: string; label: string; needs: string[] }> = [
  { id: 'facebook-publish', label: 'Publish / manage Facebook Page content',
    needs: ['token.valid', 'scopes.granted', 'page.access'] },
  { id: 'instagram-publish', label: 'Publish / manage Instagram content',
    needs: ['token.valid', 'scopes.granted', 'page.ig_link', 'ig.identity', 'ig.publishing_limit'] },
  { id: 'ads-manage', label: 'Create and manage Meta ads',
    needs: ['token.valid', 'scopes.granted', 'adaccount.access'] },
  { id: 'ads-read', label: 'Read ad performance',
    needs: ['token.valid', 'adaccount.access', 'adaccount.read'] },
];

function finish(checks: CheckResult[]): ConnectionReport {
  const byId = new Map(checks.map((c) => [c.id, c]));

  const capabilities: CapabilityState[] = CAPABILITY_CHECKS.map((cap) => {
    const blockedBy = cap.needs.filter((id) => {
      const c = byId.get(id);
      return !c || c.status === 'FAIL' || c.status === 'SKIP';
    });
    return { id: cap.id, label: cap.label, ready: blockedBy.length === 0, blockedBy };
  });

  const counts = {
    pass: checks.filter((c) => c.status === 'PASS').length,
    fail: checks.filter((c) => c.status === 'FAIL').length,
    warn: checks.filter((c) => c.status === 'WARN').length,
    skip: checks.filter((c) => c.status === 'SKIP').length,
  };

  // Blockers in class order — D first, because our own configuration is the
  // only class we can fix without waiting for anyone, and a wrong env var can
  // masquerade as any of the other three.
  const order: BlockerClass[] = ['D', 'C', 'B', 'A'];
  const blockers = checks
    .map((c) => c.blocker)
    .filter((b): b is Blocker => b !== null)
    .sort((a, b) => order.indexOf(a.class) - order.indexOf(b.class));

  return { checks, blockers, capabilities, counts, ok: counts.fail === 0 };
}

// ── asset discovery ────────────────────────────────────────────────────────
// READ-ONLY, like everything else in this file. GET only.
//
// WHY THIS EXISTS, when the ids are all visible in Business Settings
// -----------------------------------------------------------------
// Because the UI answers a different question. Business Settings shows what
// the BUSINESS owns; this shows what the SYSTEM USER can see. Those differ
// exactly when an asset was never assigned — which is the single most likely
// misconfiguration for this integration, and the one the spec predicts.
//
// An id copied from the UI for an unassigned asset looks perfectly valid, gets
// pasted into META_AD_ACCOUNT_ID, and then fails as "not visible to this
// System User" with no indication that the id itself was fine. Discovering
// through the token means an id that appears here is, by construction, an id
// the token can use.

export interface DiscoveredPage {
  id: string; name: string; category: string;
  igId: string; igUsername: string;
}

export interface DiscoveredAdAccount {
  id: string; name: string; status: string; currency: string;
  /** Which edge produced it — an account reachable only via /me/adaccounts but
   *  absent from the business's owned list is shared in from elsewhere, which
   *  is worth seeing rather than flattening away. */
  source: string;
}

export interface DiscoveryReport {
  appId: string | null;
  scopes: string[];
  pages: DiscoveredPage[];
  adAccounts: DiscoveredAdAccount[];
  /** What could not be read, and what that means. Same four classes. */
  notes: Array<{ class: BlockerClass; text: string }>;
  /** Ready-to-paste env lines for anything unambiguous. */
  suggested: Record<string, string>;
}

interface EdgeBody<T> { data?: T[]; paging?: { next?: string } }

/** Enumerate what this System User's token can actually see.
 *
 *  Every edge is optional and failure-tolerant: a token without
 *  business_management cannot read the business's owned lists but can still
 *  read /me/accounts, and a partial answer is far more useful than a stack
 *  trace. Each failure becomes a classified note rather than an exception. */
export async function discoverAssets(
  client: MetaClient,
  cfg: { businessId?: string },
): Promise<DiscoveryReport> {
  const notes: DiscoveryReport['notes'] = [];
  const pages: DiscoveredPage[] = [];
  const adAccounts: DiscoveredAdAccount[] = [];
  const seenAd = new Set<string>();
  let appId: string | null = null;
  let scopes: string[] = [];

  // "Empty" and "unread" are different answers, and conflating them is how a
  // network failure becomes "the asset was never assigned". These record that
  // an edge actually ANSWERED — the emptiness conclusions below are gated on
  // it. The same mistake was made twice before in this file (a transport
  // failure filed as a missing assignment, a proxy 403 filed as a missing
  // permission); this is the third instance of the same shape.
  let pagesRead = false;
  let adAccountsRead = false;

  // Deduplicated by text. A single proxy outage otherwise emits one identical
  // paragraph per edge, and five copies of the same sentence bury the one line
  // that differs.
  const seenNote = new Set<string>();
  const addNote = (cls: BlockerClass, text: string) => {
    if (seenNote.has(text)) return;
    seenNote.add(text);
    notes.push({ class: cls, text });
  };
  const note = (e: unknown, what: string) => {
    const b = classifyError(e, what);
    // The REASON is per-edge and the ACTION is shared, so dedupe on the action:
    // one proxy failure yields one instruction, not one per endpoint.
    addNote(b.class, b.action);
  };

  // ── the app, from the token itself ───────────────────────────────────────
  try {
    const d = await client.debugToken<{ data?: { app_id?: string; scopes?: string[] } }>();
    appId = d.data?.app_id ?? null;
    scopes = Array.isArray(d.data?.scopes) ? d.data.scopes : [];
  } catch (e) {
    note(e, '/debug_token');
  }

  // ── Pages, with their Instagram linkage in the same call ─────────────────
  // The nested field is why this is one request rather than 1+N: the Instagram
  // id that matters is the one the PAGE reports, and asking for it here means
  // an operator never has to guess it.
  try {
    const r = await client.get<EdgeBody<{
      id?: string; name?: string; category?: string;
      instagram_business_account?: { id?: string; username?: string };
    }>>('me/accounts', {
      fields: 'id,name,category,instagram_business_account{id,username}',
      limit: '100',
    });
    for (const p of r.data ?? []) {
      pages.push({
        id: p.id ?? '', name: p.name ?? '(unnamed)', category: p.category ?? '',
        igId: p.instagram_business_account?.id ?? '',
        igUsername: p.instagram_business_account?.username ?? '',
      });
    }
    pagesRead = true;
    if (r.paging?.next) {
      addNote('D', 'More Pages exist than were listed (paging.next set). ' +
        'Only the first 100 are shown.');
    }
  } catch (e) {
    note(e, 'Pages (/me/accounts)');
  }

  // ── ad accounts, from every edge that can produce one ────────────────────
  const addAccounts = (rows: Array<Record<string, unknown>>, source: string) => {
    for (const a of rows) {
      const id = String(a.id ?? '');
      if (!id || seenAd.has(id)) continue;
      seenAd.add(id);
      const st = typeof a.account_status === 'number' ? a.account_status : 0;
      adAccounts.push({
        id,
        name: String(a.name ?? '(unnamed)'),
        status: AD_ACCOUNT_STATUS[st] ?? `UNKNOWN(${st})`,
        currency: String(a.currency ?? ''),
        source,
      });
    }
  };

  const AD_FIELDS = 'id,name,account_status,currency,timezone_name';

  if (cfg.businessId) {
    for (const [edge, label] of [
      ['owned_ad_accounts', 'owned by the business'],
      ['client_ad_accounts', 'shared with the business'],
    ] as const) {
      try {
        const r = await client.get<EdgeBody<Record<string, unknown>>>(
          `${cfg.businessId}/${edge}`, { fields: AD_FIELDS, limit: '100' },
        );
        addAccounts(r.data ?? [], label);
        adAccountsRead = true;
      } catch (e) {
        note(e, `Ad accounts (${edge})`);
      }
    }
  } else {
    addNote('D', 'META_BUSINESS_ID is not set, so the business-owned ad account lists ' +
      'were not read. Only accounts reachable via /me/adaccounts appear.');
  }

  // Always try the direct edge too: it catches an account assigned straight to
  // the System User without going through a business list.
  try {
    const r = await client.get<EdgeBody<Record<string, unknown>>>(
      'me/adaccounts', { fields: AD_FIELDS, limit: '100' },
    );
    addAccounts(r.data ?? [], 'assigned to this System User');
    adAccountsRead = true;
  } catch (e) {
    note(e, 'Ad accounts (/me/adaccounts)');
  }

  // ── suggestions, only where there is no ambiguity ────────────────────────
  // A single candidate is proposed; several are listed but never guessed
  // between. Picking one for the operator is how the wrong Page gets published
  // to, and the cost of asking is one line of output.
  const suggested: Record<string, string> = {};
  if (appId) suggested.META_APP_ID = appId;
  if (pages.length === 1) {
    suggested.META_PAGE_ID = pages[0].id;
    if (pages[0].igId) suggested.META_IG_USER_ID = pages[0].igId;
  }
  if (adAccounts.length === 1) suggested.META_AD_ACCOUNT_ID = adAccounts[0].id;

  // Every conclusion below is gated on the edge having ANSWERED. An unread
  // edge supports no conclusion at all — see the comment on pagesRead.
  if (pagesRead && !pages.length) {
    addNote('C', 'No Page is visible to this System User. Business Settings → Accounts → ' +
      'Pages → select the Page → Assign people → add the Automation System User.');
  }
  if (adAccountsRead && !adAccounts.length) {
    addNote('C', 'No ad account is visible to this System User. Business Settings → ' +
      'Accounts → Ad accounts → select the account → Assign people → add the Automation ' +
      'System User with the "Manage campaigns" task. If no ad account exists yet, create ' +
      'one first — ads cannot be checked until one does.');
  }
  if (pagesRead && pages.length && !pages.some((p) => p.igId)) {
    addNote('C', 'No visible Page has a linked Instagram Professional account. Instagram ' +
      'publishing is blocked until one is linked to the Page and assigned to the System User.');
  }
  if (!pagesRead && !adAccountsRead) {
    addNote('A', 'Nothing could be read. This run says NOTHING about which assets are ' +
      'assigned — resolve the errors above and re-run before drawing any conclusion.');
  }

  return { appId, scopes, pages, adAccounts, notes, suggested };
}
