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

  // ══ 2 · /me — is this actually the System User we think it is ════════════
  try {
    const me = await client.get<{ id?: string; name?: string }>('me', { fields: 'id,name' });
    if (!cfg.systemUserId) {
      push(warn('systemuser.identity', 'Token resolves to the configured System User',
        `token resolves to id ${me.id ?? '?'} — META_SYSTEM_USER_ID unset, cannot compare`));
    } else if (me.id === cfg.systemUserId) {
      push(ok('systemuser.identity', 'Token resolves to the configured System User',
        `id ${me.id} matches META_SYSTEM_USER_ID`));
    } else {
      push(bad('systemuser.identity', 'Token resolves to the configured System User',
        `token resolves to id ${me.id ?? '?'}, expected ${cfg.systemUserId}`, {
          class: 'D',
          reason: 'The token belongs to a different identity than META_SYSTEM_USER_ID names.',
          action: 'Either the token came from the wrong System User (or from a personal ' +
            'login), or META_SYSTEM_USER_ID is wrong. Confirm in Business Settings → ' +
            'Users → System users.',
        }));
    }
  } catch (e) {
    push(bad('systemuser.identity', 'Token resolves to the configured System User',
      `/me failed: ${errText(e)}`, classifyError(e, '/me')));
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
    push(skip('ig.identity', 'Instagram account identity', 'no Instagram account id available'));
    push(skip('ig.publishing_limit', 'Instagram publishing quota is readable',
      'no Instagram account id available'));
  } else {
    try {
      const igu = await client.get<{
        id?: string; username?: string; account_type?: string;
        media_count?: number; followers_count?: number;
      }>(igId, { fields: 'id,username,account_type,media_count,followers_count' });

      const type = igu.account_type ?? '';
      const detail = `@${igu.username ?? '?'} — type ${type || 'unknown'}` +
        (typeof igu.media_count === 'number' ? `, ${igu.media_count} media` : '') +
        (typeof igu.followers_count === 'number' ? `, ${igu.followers_count} followers` : '');

      // account_type is not returned on every edge/version. Absent is reported
      // as WARN rather than FAIL: asserting a blocker on a field Meta may
      // simply not have sent would be a check that goes red for the wrong
      // reason, which is worse than one that says "could not verify".
      if (!type) {
        push(warn('ig.identity', 'Instagram account is Professional', detail +
          ' — account_type not returned, could not verify Professional status'));
      } else if (type === 'BUSINESS' || type === 'CREATOR' || type === 'MEDIA_CREATOR') {
        push(ok('ig.identity', 'Instagram account is Professional', detail));
      } else {
        push(bad('ig.identity', 'Instagram account is Professional', detail, {
          class: 'C',
          reason: `The Instagram account is ${type}, not a Professional ` +
            '(Business or Creator) account.',
          action: 'Convert it in the Instagram app: Settings → Account type and tools → ' +
            'Switch to professional account. The Content Publishing API refuses ' +
            'personal accounts.',
        }));
      }
    } catch (e) {
      push(bad('ig.identity', 'Instagram account is Professional',
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
