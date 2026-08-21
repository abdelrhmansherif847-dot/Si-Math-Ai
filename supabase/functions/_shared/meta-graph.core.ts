// Si Math AI — the Meta Graph API adapter.
//
// The ONLY file in this repository that knows Meta's HTTP shape exists.
// Everything above it (the L0 connection checker today, marketing-actions
// later) talks to `MetaClient` and never to graph.facebook.com directly.
//
// Specification: docs/engineering/meta-marketing-integration.md §2.3, §9.
//
// =====================================================================
// WHY NOT facebook-nodejs-business-sdk
// =====================================================================
// It is npm-only, and this repository deliberately has no package.json, no
// bundler and no build step (CLAUDE.md, "Repository shape"). The same bytes
// have to run in Deno (the Edge Function), in Node under CI, and be readable
// by a test that executes the real source. A ~200-line fetch client satisfies
// all three; an npm dependency satisfies none of them.
//
// =====================================================================
// CREDENTIALS NEVER LEAVE THIS BOUNDARY
// =====================================================================
// Four values are secret, all read from the environment, none of them ever
// placed in a response body, a database row, a report, or a log line:
//
//   META_APP_SECRET            used only to compute appsecret_proof
//   META_SYSTEM_USER_TOKEN     permanent, publishing + ads_read
//   META_ADS_TOKEN             optional, ads_management only
//   (and appsecret_proof itself, which is derived from the two above)
//
// Set them with, and only with:
//   supabase secrets set META_APP_SECRET=... META_SYSTEM_USER_TOKEN=...
//
// THE TOKEN TRAVELS IN THE QUERY STRING. That is Meta's design, not ours, and
// it is the reason redactUrl() exists and is mandatory: a Graph URL is itself
// a credential. Nothing in this repository may log, return, or persist a Graph
// URL that has not been through it. The `onRequest` hook is handed the
// REDACTED url for exactly this reason — a caller cannot opt out of redaction
// by observing requests, because the un-redacted form is never offered.
//
// =====================================================================
// appsecret_proof IS NOT OPTIONAL
// =====================================================================
// A System User token never expires (see §9.1 of the spec). "Never expires"
// means a leaked token is a permanent credential, so the single most valuable
// hardening available is proving the call came from a server that also holds
// the app secret. Every request below carries appsecret_proof, and the App
// Dashboard setting "Require app secret proof for server API calls" should be
// ON so that a call missing it is refused by Meta rather than merely
// discouraged by us.
// =====================================================================

// ── environment ────────────────────────────────────────────────────────────

/** Without these nothing can be attempted at all. Missing one is a class D
 *  (code/configuration) blocker, never a Meta-side problem. */
export const REQUIRED_ENV = [
  'META_APP_ID',
  'META_APP_SECRET',
  'META_SYSTEM_USER_TOKEN',
  'META_GRAPH_VERSION',
] as const;

/** Asset ids. Absent means "that capability cannot be checked", which is a
 *  different and much less alarming thing than a broken credential. */
export const ASSET_ENV = [
  'META_PAGE_ID',
  'META_IG_USER_ID',
  'META_AD_ACCOUNT_ID',
  'META_BUSINESS_ID',
  'META_SYSTEM_USER_ID',
] as const;

/** Every environment variable whose VALUE is a secret. Used by redactSecrets()
 *  and asserted over by tests/meta-isolation.test.mjs. */
export const SECRET_ENV = [
  'META_APP_SECRET',
  'META_SYSTEM_USER_TOKEN',
  'META_ADS_TOKEN',
] as const;

export interface MetaEnv {
  appId: string;
  appSecret: string;
  token: string;
  graphVersion: string;
  pageId: string;
  igUserId: string;
  adAccountId: string;
  businessId: string;
  systemUserId: string;
  /** Capability switches. Both default to FALSE when unset.
   *
   *  NOTE THE INVERSION relative to ALLOWED_ORIGINS in _shared/cors.ts. There,
   *  unset means permissive, because a fail-closed default would take the
   *  tutor down for every student. Here, unset means INERT, because the
   *  failure mode is a public post or real money. Different blast radius,
   *  opposite default. Do not "fix" this to match cors.ts. */
  enablePublish: boolean;
  enableAds: boolean;
  /** Hard ceiling on any daily budget, in the account's minor units. 0 = unset,
   *  which the ads builder treats as "refuse every budget". */
  adsMaxDailyBudget: number;
}

export interface MetaEnvRead {
  env: MetaEnv | null;
  /** Required names that are absent. Names only — never values. */
  missingRequired: string[];
  /** Asset names that are absent. Names only — never values. */
  missingAssets: string[];
  /** Set when META_GRAPH_VERSION is present but malformed. */
  versionError: string | null;
}

/** Meta versions expire on roughly a two-year clock, so an unversioned or
 *  floating call is a silent behaviour change waiting to happen. The version
 *  lives in an env var rather than a constant so a bump is a secret change and
 *  a smoke test, not a code deploy. */
export const GRAPH_VERSION_RE = /^v\d+\.\d+$/;

/** Read configuration. Returns what is missing rather than throwing, because
 *  the whole job of the L0 checker is to REPORT a missing variable as an
 *  actionable line — a thrown error at import time would tell an operator
 *  strictly less than a checklist does. */
export function readMetaEnv(get: (k: string) => string | undefined): MetaEnvRead {
  const val = (k: string) => (get(k) ?? '').trim();

  const missingRequired = REQUIRED_ENV.filter((k) => !val(k));
  const missingAssets = ASSET_ENV.filter((k) => !val(k));

  const graphVersion = val('META_GRAPH_VERSION');
  let versionError: string | null = null;
  if (graphVersion && !GRAPH_VERSION_RE.test(graphVersion)) {
    // The value is NOT quoted into the message. A malformed version is not a
    // secret, but the habit of echoing env values into logs is the thing that
    // eventually echoes the wrong one.
    versionError = 'META_GRAPH_VERSION must look like v26.0';
  }

  if (missingRequired.length || versionError) {
    return { env: null, missingRequired, missingAssets, versionError };
  }

  // "true" only. Not "1", not "yes", not "TRUE ". A switch that opens the
  // publish path deserves an unambiguous value, and a typo must fail closed.
  const flag = (k: string) => get(k)?.trim() === 'true';
  const budget = Number.parseInt(val('META_ADS_MAX_DAILY_BUDGET') || '0', 10);

  return {
    env: {
      enablePublish: flag('META_ENABLE_PUBLISH'),
      enableAds: flag('META_ENABLE_ADS'),
      adsMaxDailyBudget: Number.isFinite(budget) && budget > 0 ? budget : 0,
      appId: val('META_APP_ID'),
      appSecret: val('META_APP_SECRET'),
      token: val('META_SYSTEM_USER_TOKEN'),
      graphVersion,
      pageId: val('META_PAGE_ID'),
      igUserId: val('META_IG_USER_ID'),
      adAccountId: val('META_AD_ACCOUNT_ID'),
      businessId: val('META_BUSINESS_ID'),
      systemUserId: val('META_SYSTEM_USER_ID'),
    },
    missingRequired,
    missingAssets,
    versionError,
  };
}

// ── redaction ──────────────────────────────────────────────────────────────

/** Query parameters that are credentials in their own right. `input_token` is
 *  on this list because /debug_token carries the token being INSPECTED in the
 *  URL — the one call whose whole subject matter is a secret. */
export const SECRET_QUERY_PARAMS = [
  'access_token',
  'input_token',
  'appsecret_proof',
  'client_secret',
] as const;

export const REDACTED = '[redacted]';

/** Strip credential-bearing query parameters from a Graph URL.
 *
 *  Implemented by rebuilding the query string rather than by regex-replacing
 *  the token value: a regex over the value only redacts secrets we remembered
 *  to pass in, and would silently miss a parameter added later. Redacting by
 *  PARAMETER NAME means an unknown token-shaped value in `access_token` is
 *  still removed. */
export function redactUrl(url: string): string {
  const cut = url.indexOf('?');
  if (cut < 0) return url;
  const base = url.slice(0, cut);
  const secret = new Set<string>(SECRET_QUERY_PARAMS as readonly string[]);
  const parts = url.slice(cut + 1).split('&').filter(Boolean).map((pair) => {
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    return secret.has(decodeURIComponent(key)) ? `${key}=${REDACTED}` : pair;
  });
  return parts.length ? `${base}?${parts.join('&')}` : base;
}

/** Second, independent line of defence: remove known secret VALUES from any
 *  text about to be printed or persisted.
 *
 *  redactUrl() covers the URL we built. This covers everything else — an error
 *  message that quoted the request back, a stack trace, a report field. Short
 *  values are skipped: a one- or two-character "secret" would match everywhere
 *  and turn readable output into noise, and a secret that short is not one. */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) {
    if (!s || s.length < 8) continue;
    out = out.split(s).join(REDACTED);
  }
  return out;
}

// ── appsecret_proof ────────────────────────────────────────────────────────

/** HMAC-SHA256 of the access token, keyed with the app secret, hex-encoded.
 *
 *  crypto.subtle is present in both Deno and Node 18+, so this needs no
 *  dependency and no build step — the same property that let us decline the
 *  official SDK. */
export async function appSecretProof(token: string, appSecret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(token));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── errors ─────────────────────────────────────────────────────────────────

/** Graph error codes worth naming. Everything else falls through to a generic
 *  sentence — a code we have not reasoned about should not get a confident
 *  explanation. */
export const GRAPH_CODE = {
  TOKEN_INVALID: 190,
  PERMISSION_DENIED: 200,
  PERMISSION_API: 10,
  UNSUPPORTED_GET: 100,
  RATE_LIMIT_APP: 4,
  RATE_LIMIT_USER: 17,
  RATE_LIMIT_PAGE: 32,
  RATE_LIMIT_CUSTOM: 613,
  TEMPORARILY_BLOCKED: 368,
} as const;

export function isRateLimit(code: number): boolean {
  return code === GRAPH_CODE.RATE_LIMIT_APP || code === GRAPH_CODE.RATE_LIMIT_USER ||
    code === GRAPH_CODE.RATE_LIMIT_PAGE || code === GRAPH_CODE.RATE_LIMIT_CUSTOM;
}

/** Everything a Meta failure may say to the outside world.
 *
 *  Meta's error bodies quote back request context and have been observed to
 *  echo identifiers. This maps a status and code to a FIXED sentence so no
 *  upstream body is ever relayed to a caller or written to a row. The same
 *  reasoning, and the same shape, as zoomErrorMessage() in
 *  support-zoom.core.ts. */
export function metaErrorMessage(status: number, code = 0): string {
  if (code === GRAPH_CODE.TOKEN_INVALID) return 'token_invalid_or_revoked';
  if (isRateLimit(code)) return 'rate_limited';
  if (code === GRAPH_CODE.TEMPORARILY_BLOCKED) return 'temporarily_blocked';
  if (code === GRAPH_CODE.PERMISSION_DENIED || code === GRAPH_CODE.PERMISSION_API) {
    return 'permission_denied';
  }
  if (status === 401 || status === 403) return 'permission_denied';
  if (status === 404) return 'object_not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'meta_unavailable';
  return 'meta_rejected_request';
}

export class MetaError extends Error {
  readonly status: number;
  readonly code: number;
  readonly subcode: number;
  /** Meta's trace id. Safe to log and the only thing worth quoting in a
   *  support case — it identifies the request without describing it. */
  readonly fbtraceId: string;

  constructor(status: number, code = 0, subcode = 0, fbtraceId = '') {
    super(metaErrorMessage(status, code));
    this.name = 'MetaError';
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.fbtraceId = fbtraceId;
  }
}

/** Raised when a read-only client is asked to write. This is a programming
 *  error, not a runtime condition — it means a write path reached a client
 *  that was constructed to be incapable of writing. */
export class ReadOnlyViolation extends Error {
  constructor(method: string, path: string) {
    super(`read-only client refused ${method} ${path}`);
    this.name = 'ReadOnlyViolation';
  }
}

// ── client ─────────────────────────────────────────────────────────────────

export const GRAPH_HOST = 'https://graph.facebook.com';

// ── the write contract ────────────────────────────────────────────────────
//
// EVERY write is a WriteRequest built by a pure function and handed to the
// client. It is never assembled inside the client, and never assembled inline
// at a call site. Two reasons:
//
//   1. A pure builder is exhaustively testable with no network anywhere near
//      it, so "is the request correct" and "is it safe to send" are separate
//      questions answered by separate tests.
//   2. `capability` is a REQUIRED field. A write cannot be expressed without
//      naming the switch that governs it, so no write can be added that
//      silently escapes the gates.

export type WriteCapability = 'publish' | 'ads';

export interface WriteRequest {
  method: 'POST' | 'DELETE';
  /** Graph path, no leading slash, no version — the client adds both. */
  path: string;
  body: Record<string, unknown>;
  /** Which env switch must be true for this to leave the process. */
  capability: WriteCapability;
  /** One line for the dry-run log. Must contain no secret. */
  summary: string;
}

export interface WriteOutcome {
  /** FALSE in dry run. The single field that answers "did this touch Meta". */
  sent: boolean;
  request: WriteRequest;
  /** The url that was, or would have been, called. REDACTED. */
  url: string;
  /** Present only when sent === true. */
  response?: unknown;
}

/** Raised when a write is attempted while its capability switch is off. */
export class CapabilityDisabled extends Error {
  readonly capability: WriteCapability;
  constructor(capability: WriteCapability) {
    super(`write refused: capability '${capability}' is not enabled`);
    this.name = 'CapabilityDisabled';
    this.capability = capability;
  }
}

export interface MetaClientOptions {
  /** Injectable so the suites can drive the REAL client with a stub and assert
   *  on the exact requests made — no network, no app, no ad account. */
  fetchImpl?: typeof fetch;
  /** Construct requests, validate them, log them — and DO NOT SEND.
   *
   *  DEFAULTS TO TRUE. A caller must opt in to sending writes, rather than opt
   *  out of it. Every other default in this file is chosen the same way: the
   *  state you get by forgetting to think about it is the state that cannot
   *  cause a public post or a charge. */
  dryRun?: boolean;
  /** Which write capabilities this client may exercise. Absent = none. */
  capabilities?: { publish?: boolean; ads?: boolean };
  /** When true, post() and del() throw instead of issuing a request. The L0
   *  checker constructs its client this way, which is what makes "read-only"
   *  a property of the code rather than a promise in a comment. */
  readOnly?: boolean;
  /** Observation hook. Receives the REDACTED url — see the header. */
  onRequest?: (method: string, redactedUrl: string) => void;
}

export interface MetaClient {
  readonly readOnly: boolean;
  readonly dryRun: boolean;
  /** Gate check WITHOUT performing anything. Lets a caller — or a test — ask
   *  "would this be refused" without constructing a send. */
  canWrite(capability: WriteCapability): boolean;
  /** The one entry point for every write. Runs the gates, then either returns
   *  a dry-run outcome or sends. There is no other write path. */
  write(req: WriteRequest): Promise<WriteOutcome>;
  get<T = Record<string, unknown>>(path: string, params?: Record<string, string>): Promise<T>;
  /** Inspect this client's OWN token via /debug_token.
   *
   *  A dedicated method rather than a get() call, because /debug_token is the
   *  one endpoint whose *parameter* is the credential: `input_token` carries
   *  the token being inspected. Letting a caller build that call would mean
   *  handing the caller the token, and the whole point of this boundary is
   *  that nothing above it ever holds one. The token inspects itself and the
   *  secret never leaves this file.
   *
   *  Note this deliberately does NOT use an app access token
   *  (`{app-id}|{app-secret}`), which is the other documented way to call
   *  /debug_token: that form puts META_APP_SECRET on the wire as a query
   *  parameter, and this adapter's posture is that the app secret leaves the
   *  process only as an HMAC. */
  debugToken<T = Record<string, unknown>>(): Promise<T>;
  post(path: string, body?: Record<string, unknown>): Promise<never>;
  del(path: string): Promise<never>;
}

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
}

export function createMetaClient(env: MetaEnv, opts: MetaClientOptions = {}): MetaClient {
  const doFetch = opts.fetchImpl ?? fetch;
  const readOnly = opts.readOnly === true;
  // Fail closed: only an explicit `false` disables dry run.
  const dryRun = opts.dryRun !== false;
  const capabilities = {
    publish: opts.capabilities?.publish === true,
    ads: opts.capabilities?.ads === true,
  };

  // Computed once per client and reused. It is a pure function of two values
  // that do not change for the client's lifetime, and recomputing an HMAC per
  // request would buy nothing.
  let proofPromise: Promise<string> | null = null;
  const proof = () => (proofPromise ??= appSecretProof(env.token, env.appSecret));

  function buildUrl(path: string, params: Record<string, string>): string {
    // A caller passing a leading slash and a caller not passing one must land
    // on the same URL; a doubled slash is a 404 that reads like a permission
    // problem, which is the worst kind of diagnostic.
    const clean = path.replace(/^\/+/, '');
    const qs = new URLSearchParams(params).toString();
    return `${GRAPH_HOST}/${env.graphVersion}/${clean}${qs ? `?${qs}` : ''}`;
  }

  async function request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = buildUrl(path, {
      ...params,
      access_token: env.token,
      appsecret_proof: await proof(),
    });

    // REDACTED before it is offered to anyone. The caller never sees the raw
    // form, so a caller cannot leak it.
    opts.onRequest?.('GET', redactUrl(url));

    const res = await doFetch(url, { method: 'GET' });
    const text = await res.text();

    let body: unknown = null;
    try { body = JSON.parse(text); } catch { body = null; }

    if (!res.ok || (body as GraphErrorBody)?.error) {
      const e = (body as GraphErrorBody)?.error ?? {};
      throw new MetaError(
        res.status,
        typeof e.code === 'number' ? e.code : 0,
        typeof e.error_subcode === 'number' ? e.error_subcode : 0,
        typeof e.fbtrace_id === 'string' ? e.fbtrace_id : '',
      );
    }
    return body as T;
  }

  /** THE GATES, in order, all fail-closed.
   *
   *  1. readOnly       an L0 client can never write, whatever else is set.
   *  2. capability     the env switch for THIS write must be true.
   *
   *  Dry run is deliberately NOT here: it is not an authorisation question but
   *  a delivery one, and it is enforced at the send site below so that a
   *  dry run still exercises every gate a real send would. */
  function assertWritable(req: WriteRequest): void {
    if (readOnly) throw new ReadOnlyViolation(req.method, req.path);
    if (!capabilities[req.capability]) throw new CapabilityDisabled(req.capability);
  }

  return {
    readOnly,
    dryRun,

    canWrite(capability: WriteCapability): boolean {
      return !readOnly && capabilities[capability] === true;
    },

    async write(req: WriteRequest): Promise<WriteOutcome> {
      assertWritable(req);

      const url = buildUrl(req.path, {
        access_token: env.token,
        appsecret_proof: await proof(),
      });
      const redacted = redactUrl(url);

      // THE DRY-RUN RETURN. Everything above ran; nothing below does. This is
      // the line that makes "zero network writes" a property of the code
      // rather than a promise in a comment, and tests count fetch calls across
      // a whole run to prove it.
      if (dryRun) {
        opts.onRequest?.(`DRYRUN-${req.method}`, redacted);
        return { sent: false, request: req, url: redacted };
      }

      opts.onRequest?.(req.method, redacted);
      const res = await doFetch(url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
      });
      const text = await res.text();
      let body: unknown = null;
      try { body = JSON.parse(text); } catch { body = null; }
      if (!res.ok || (body as GraphErrorBody)?.error) {
        const e = (body as GraphErrorBody)?.error ?? {};
        throw new MetaError(
          res.status,
          typeof e.code === 'number' ? e.code : 0,
          typeof e.error_subcode === 'number' ? e.error_subcode : 0,
          typeof e.fbtrace_id === 'string' ? e.fbtrace_id : '',
        );
      }
      return { sent: true, request: req, url: redacted, response: body };
    },

    get<T = Record<string, unknown>>(path: string, params: Record<string, string> = {}) {
      return request<T>(path, params);
    },

    debugToken<T = Record<string, unknown>>() {
      // input_token is the secret. It is supplied here, inside the adapter,
      // and redactUrl() lists input_token precisely so this call's URL is not
      // itself a credential when it reaches onRequest or a log.
      return request<T>('debug_token', { input_token: env.token });
    },

    // Present so that a write path COMPILES against this client and then fails
    // loudly at runtime, rather than being absent and failing at import with a
    // less specific message. L0 never calls either.
    post(path: string, _body: Record<string, unknown> = {}): Promise<never> {
      throw new ReadOnlyViolation('POST', path);
    },

    del(path: string): Promise<never> {
      throw new ReadOnlyViolation('DELETE', path);
    },
  };
}
