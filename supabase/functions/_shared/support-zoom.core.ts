// Help & Support — the Zoom adapter.
//
// PREPARED. Depends on migrations 20260815a–20260815f, which are NOT applied.
//
// The ONLY file in this repository that knows Zoom exists. It implements
// MeetingProvider from support-provider.core.ts and nothing else imports it by
// name — support-actions/index.ts reaches it through the registry, keyed by the
// support.meeting_provider setting. Replacing Zoom is a sibling file plus an
// UPDATE on one settings row.
//
// =====================================================================
// CREDENTIALS NEVER LEAVE THIS BOUNDARY
// =====================================================================
// Server-to-Server OAuth (grant type account_credentials). Three secrets, all
// read from the Edge Function's environment, none of them ever placed in a
// response body, a database row, or a log line:
//
//   ZOOM_ACCOUNT_ID
//   ZOOM_CLIENT_ID
//   ZOOM_CLIENT_SECRET
//   ZOOM_USER_ID        the licensed host the meeting is created under
//
// Set them with, and only with:
//   supabase secrets set ZOOM_ACCOUNT_ID=... ZOOM_CLIENT_ID=... \
//                        ZOOM_CLIENT_SECRET=... ZOOM_USER_ID=...
//
// The browser has no path to any of them. It cannot: this module is server-only
// Deno, the frontend never calls Zoom, and the one field the student ends up
// seeing (join_url) is written by the caller AFTER redactProviderRef() drops
// everything else — including start_url, which is a host credential.
//
// THE ACCESS TOKEN IS CACHED IN MEMORY ONLY. Not in the database, not in a
// cookie, not returned. It lives for the lifetime of one warm Deno isolate and
// is re-fetched when it expires, which also means a rotated secret takes effect
// on the next cold start with no deploy.
// =====================================================================

import {
  MeetingProvider,
  MeetingRequest,
} from './support-provider.core.ts';

const ZOOM_OAUTH = 'https://zoom.us/oauth/token';
const ZOOM_API = 'https://api.zoom.us/v2';

/** Refresh this many seconds before the token actually expires, so a request
 *  that starts just under the wire does not finish just over it. */
const TOKEN_SKEW_SECONDS = 60;

export interface ZoomEnv {
  accountId: string;
  clientId: string;
  clientSecret: string;
  userId: string;                        // the default host
  hostMap: Record<string, string>;       // profile id → Zoom user id
}

/** Resolve a slot's host_id to a Zoom user.
 *
 *  20260815a gave support_meeting_slots a host_id column and nothing read it.
 *  This reads it, through an ENV map rather than a new column, so adding a
 *  second host is a secret update and not a migration:
 *
 *    supabase secrets set ZOOM_HOST_MAP='{"<profile-uuid>":"<zoom-user-id>"}'
 *
 *  An unmapped or absent host_id falls back to ZOOM_USER_ID, which is the
 *  single-host configuration the platform runs today. */
export function resolveHost(env: ZoomEnv, hostId: string | null | undefined): string {
  if (hostId && Object.prototype.hasOwnProperty.call(env.hostMap, hostId)) return env.hostMap[hostId];
  return env.userId;
}

/** Read the adapter's configuration. Returns null when it is not configured,
 *  rather than throwing: an unconfigured provider must degrade to "the link is
 *  pending" — a booked meeting with no link is recoverable, a 500 during
 *  booking is not. */
export function readZoomEnv(get: (k: string) => string | undefined): ZoomEnv | null {
  const accountId = get('ZOOM_ACCOUNT_ID') ?? '';
  const clientId = get('ZOOM_CLIENT_ID') ?? '';
  const clientSecret = get('ZOOM_CLIENT_SECRET') ?? '';
  const userId = get('ZOOM_USER_ID') ?? '';
  if (!accountId || !clientId || !clientSecret || !userId) return null;
  let hostMap: Record<string, string> = {};
  try {
    const parsed = JSON.parse(get('ZOOM_HOST_MAP') ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') hostMap[k] = v;
    }
  } catch (_e) {
    // A malformed map falls back to the single default host rather than
    // taking booking down. Logged without its contents.
    console.log('[support-actions] ZOOM_HOST_MAP is not valid JSON — using the default host only');
    hostMap = {};
  }
  return { accountId, clientId, clientSecret, userId, hostMap };
}

/** Everything a Zoom failure may say to the outside world.
 *
 *  Zoom's error bodies quote back request context and occasionally the account
 *  id. This maps a status to a fixed sentence so no upstream body is ever
 *  relayed to a caller or written to a row; the full body still reaches the
 *  function's own console for an operator, which is a different audience with
 *  a different threat model. */
export function zoomErrorMessage(status: number): string {
  if (status === 401 || status === 403) return 'provider_auth_failed';
  if (status === 404) return 'provider_meeting_not_found';
  if (status === 429) return 'provider_rate_limited';
  if (status >= 500) return 'provider_unavailable';
  return 'provider_rejected_request';
}

export class ZoomError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(zoomErrorMessage(status));
    this.name = 'ZoomError';
    this.status = status;
  }
}

/** The adapter. `fetchImpl` is injectable so the isolation suite can drive it
 *  with a stub and assert on the exact requests made — no network, no account. */
export function createZoomProvider(
  env: ZoomEnv,
  fetchImpl: typeof fetch = fetch,
  now: () => number = () => Date.now(),
): MeetingProvider {
  let token = '';
  let tokenExpiresAtMs = 0;

  async function accessToken(): Promise<string> {
    if (token && now() < tokenExpiresAtMs) return token;

    const basic = btoa(`${env.clientId}:${env.clientSecret}`);
    const res = await fetchImpl(
      `${ZOOM_OAUTH}?grant_type=account_credentials&account_id=${encodeURIComponent(env.accountId)}`,
      { method: 'POST', headers: { Authorization: `Basic ${basic}` } },
    );
    if (!res.ok) {
      // The body may echo the account id. Log the status only.
      console.log('[support-actions] zoom oauth failed', JSON.stringify({ status: res.status }));
      throw new ZoomError(res.status);
    }
    const body = await res.json() as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new ZoomError(502);
    token = body.access_token;
    const ttl = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    tokenExpiresAtMs = now() + Math.max(0, ttl - TOKEN_SKEW_SECONDS) * 1000;
    return token;
  }

  return {
    name: 'zoom',

    async create(req: MeetingRequest): Promise<Record<string, unknown>> {
      const jwt = await accessToken();
      const host = resolveHost(env, req.hostId);
      const res = await fetchImpl(`${ZOOM_API}/users/${encodeURIComponent(host)}/meetings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: req.topic.slice(0, 200),
          type: 2,                       // scheduled
          start_time: req.startsAt,
          duration: Math.max(1, Math.min(1440, Math.round(req.durationMinutes))),
          agenda: (req.agenda ?? '').slice(0, 2000),
          settings: {
            // WAITING ROOM ON — owner decision, recorded because it is a
            // deliberate trade against convenience. A support call discusses a
            // student's account and payments, and join_url is a field the
            // student can read and forward. Without a waiting room the link is
            // the ONLY access control, so anyone holding it drops straight into
            // someone else's billing conversation. join_before_host is set
            // false because Zoom ignores it once a waiting room exists, and a
            // contradictory pair reads as an accident to the next person.
            waiting_room: true,
            join_before_host: false,
            approval_type: 2,            // no registration
            auto_recording: 'none',      // a support call is not recorded
          },
        }),
      });
      if (!res.ok) {
        console.log('[support-actions] zoom create failed', JSON.stringify({ status: res.status }));
        throw new ZoomError(res.status);
      }
      const raw = await res.json() as Record<string, unknown>;
      // Returned RAW on purpose. Redaction is the caller's single
      // responsibility — an adapter that redacted its own output would be a
      // second place to forget, and start_url is what gets forgotten.
      // RAW FIRST, mapping LAST. The previous order put ...raw last, which
      // worked only because Zoom happens not to return 'meeting_id',
      // 'passcode', 'starts_at' or 'provider' — the day it returns one, the
      // explicit mapping would have been silently overridden. Everything Zoom
      // sent is still carried through so redactProviderRef() has something to
      // drop and the isolation suite can prove the drop happens.
      return {
        ...raw,
        provider: 'zoom',
        meeting_id: raw.id,
        join_url: raw.join_url,
        passcode: raw.password,
        starts_at: raw.start_time,
      };
    },

    async release(providerMeetingId: string): Promise<void> {
      const jwt = await accessToken();
      const res = await fetchImpl(`${ZOOM_API}/meetings/${encodeURIComponent(providerMeetingId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jwt}` },
      });
      // 404 means it is already gone, which is the goal. 204 is the success.
      if (res.status === 404 || res.ok) return;
      console.log('[support-actions] zoom release failed', JSON.stringify({ status: res.status }));
      throw new ZoomError(res.status);
    },
  };
}
