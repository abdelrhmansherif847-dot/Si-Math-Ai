// =====================================================================
// support-actions — the meeting-provisioning boundary for Help & Support
// =====================================================================
// STATUS: ⛔ PREPARED — NOT DEPLOYED, and it cannot usefully be deployed yet:
//         it reads support_meetings, support_meeting_slots and system_settings,
//         none of which exist until migrations 20260815a–20260815f are applied.
//         Migration A is not approved. Deploying this early is harmless (every
//         action returns schema_not_ready) but pointless.
//
// DEPLOY: DEPLOY.md §4, same manual CLI path as every other function. Nothing
//         deploys an Edge Function automatically.
//
// =====================================================================
// WHY A FUNCTION AT ALL — WHY NOT BOOK STRAIGHT FROM THE CLIENT
// =====================================================================
// 20260815a's header settled this: "An EMPTY provider_ref means 'link pending':
// booking commits in Postgres, and the provider API call happens immediately
// afterwards from the Edge Function. Postgres cannot make that call, and
// holding a transaction open across a network round-trip would be worse than
// the problem it solves."
//
// So booking and provisioning are two steps by design. support_book_meeting()
// commits a meeting with provider_ref = '{}'. This function turns that into a
// join link. If it never runs, the student sees "the joining link is being
// created" and support still has a booked slot with a student attached —
// degraded, not broken.
//
// THREE REASONS IT MUST BE A SERVER BOUNDARY, not client code:
//   1. Zoom Server-to-Server OAuth needs a client secret. A secret in a browser
//      is not a secret; it is a published credential with extra steps.
//   2. Zoom's create-meeting response contains start_url, which is a HOST
//      credential. It must be dropped before anything reaches a row a student
//      can read, and the only way to guarantee that is to never let the raw
//      response near the client.
//   3. The provider is chosen by a database setting. A client that picked its
//      own provider would be a client that could pick 'none'.
//
// =====================================================================
// WHAT THE CLIENT IS ALLOWED TO LEARN
// =====================================================================
// Almost nothing. Every action returns {ok, status} and NEVER the provider
// payload — not even the redacted one. The client re-reads support_meetings
// through RLS afterwards, so what a student can see is decided by
// 20260815b's policies in one place rather than by this function's response
// shape in a second place. support.html already works exactly that way.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, isBlockedOrigin } from '../_shared/cors.ts';
import {
  MeetingProvider,
  MissingProviderError,
  isSafeProviderRef,
  isValidProviderName,
  redactProviderRef,
} from '../_shared/support-provider.core.ts';
import { createZoomProvider, readZoomEnv } from '../_shared/support-zoom.core.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

/** Provisioning is best-effort by design; a sweep exists precisely so a failed
 *  attempt is retried rather than lost. Bounded so one invocation cannot run
 *  long enough to be killed mid-write. */
const SWEEP_LIMIT = 25;

// ── provider registry ──────────────────────────────────────────────────────
// Keyed by the exact string in system_settings('support.meeting_provider').
// Adding a provider is a line here and a sibling adapter file — no migration,
// no client change, which is the whole point of provider_ref being jsonb.
function loadProvider(name: string): MeetingProvider {
  if (name === 'zoom') {
    const env = readZoomEnv((k) => Deno.env.get(k));
    if (!env) throw new MissingProviderError('zoom (secrets not set)');
    return createZoomProvider(env);
  }
  throw new MissingProviderError(name);
}

// PostgREST answers an absent relation with 42P01 and an absent function with
// PGRST202. Both mean the chain has not been applied here, which is a state
// this function must report calmly rather than crash on — the same contract
// support.html and admin-support.html implement in the browser.
function schemaMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const msg = error.message ?? '';
  return code === '42P01' || code === 'PGRST202' || code === 'PGRST205' ||
    /does not exist|schema cache/i.test(msg);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') ?? '';
  const cors = corsHeaders(origin);
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (isBlockedOrigin(origin)) {
    console.log('[support-actions] blocked-origin', JSON.stringify({ origin }));
    return json({ error: 'Origin not allowed' }, 403);
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing_authorization' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: 'unauthorized' }, 401);

  const svc = createClient(SUPABASE_URL, SERVICE_KEY);

  // Role is read with service rights and compared here, exactly as
  // admin-actions does. This is the function's own gate; it does NOT replace
  // support_require_agent(), which still guards every RPC in 20260815d.
  const { data: profile } = await svc
    .from('profiles').select('is_admin, role').eq('id', user.id).maybeSingle();
  const role = (profile?.role as string) ?? (profile?.is_admin ? 'admin' : 'user');
  const isAgent = !!profile && (profile.is_admin === true ||
    ['admin', 'super_admin', 'owner'].includes(role));

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === 'string' ? body.action : '';
  const meetingId = typeof body.meeting_id === 'string' ? body.meeting_id : '';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if ((action === 'provision' || action === 'release') && !UUID_RE.test(meetingId)) {
    return json({ error: 'bad_meeting_id' }, 400);
  }

  // ── which provider ───────────────────────────────────────────────────────
  async function currentProviderName(): Promise<string | null> {
    const { data, error } = await svc
      .from('system_settings').select('value').eq('key', 'support.meeting_provider').maybeSingle();
    if (error) { if (schemaMissing(error)) return null; throw error; }
    const v = (data?.value ?? '').trim();
    return isValidProviderName(v) ? v : null;
  }

  // ── provision one meeting ────────────────────────────────────────────────
  //
  // THE WRITE-BACK IS A COMPARE-AND-SWAP, and the compensating delete is the
  // part that matters. Two callers can reach the provider concurrently — the
  // student's own booking call and a sweep, say — and both would create a real
  // meeting at Zoom. Only one write can win, because the UPDATE is an
  // optimistic lock on updated_at (see the write itself). The loser then DELETES the
  // meeting it just created, so the provider is left with exactly one, matching
  // the one row that references it.
  //
  // What this does NOT do is prevent the duplicate creation itself. Doing that
  // properly needs either a 'provisioning' state or an advisory-lock RPC, and
  // both are a seventh migration — out of scope while the chain is frozen at
  // six and A is unapproved. The residual cost is one extra API round trip in a
  // rare race, never an orphaned meeting and never a wrong link.
  async function provisionOne(row: {
    id: string; ticket_id: string; slot_id: string; provider: string; updated_at: string;
  }): Promise<'provisioned' | 'skipped' | 'no_adapter' | 'provider_failed' | 'host_busy'> {
    const providerName = await currentProviderName();
    if (!providerName) return 'no_adapter';

    let provider: MeetingProvider;
    try { provider = loadProvider(providerName); }
    catch (_e) { return 'no_adapter'; }

    const { data: slot } = await svc
      .from('support_meeting_slots').select('starts_at, ends_at, host_id').eq('id', row.slot_id).maybeSingle();
    if (!slot) return 'skipped';

    // ── Q4 · ONE HOST CANNOT RUN TWO MEETINGS AT ONCE ────────────────────
    // A single Zoom licence hosts one live meeting. Two overlapping slots
    // would therefore collide at meeting time, and the collision surfaces to
    // two students rather than to us.
    //
    // THIS IS A GUARD, NOT A CONSTRAINT, and the difference is worth stating:
    // real prevention is an exclusion constraint over a tstzrange, which is a
    // migration, and no seventh migration was written. What this does is
    // refuse to CREATE the colliding provider meeting — the moment the clash
    // becomes real — so the worst case is a booked slot with no link and a
    // 'host_busy' status an agent can see, never two calls on one host.
    const { data: siblings } = await svc
      .from('support_meetings')
      .select('id, slot_id, status, provider_ref')
      .eq('status', 'scheduled')
      .neq('id', row.id);

    const wantStart = new Date(slot.starts_at as string).getTime();
    const wantEnd = new Date(slot.ends_at as string).getTime();
    const liveSlotIds = (siblings ?? [])
      .filter((m) => (m.provider_ref as Record<string, unknown> | null)?.join_url)
      .map((m) => m.slot_id as string);

    if (liveSlotIds.length) {
      const { data: liveSlots } = await svc
        .from('support_meeting_slots')
        .select('id, starts_at, ends_at, host_id')
        .in('id', liveSlotIds);
      const sameHost = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
      const clash = (liveSlots ?? []).some((s2) =>
        sameHost(s2.host_id, slot.host_id) &&
        new Date(s2.starts_at as string).getTime() < wantEnd &&
        new Date(s2.ends_at as string).getTime() > wantStart);
      if (clash) {
        console.log('[support-actions] host_busy', JSON.stringify({ meeting: row.id, slot: row.slot_id }));
        return 'host_busy';
      }
    }

    const minutes = Math.max(
      1,
      Math.round((new Date(slot.ends_at as string).getTime() -
                  new Date(slot.starts_at as string).getTime()) / 60000),
    );

    let raw: Record<string, unknown>;
    try {
      raw = await provider.create({
        // No student name, no email, no ticket subject. The provider is a third
        // party and gets the minimum that makes the meeting findable.
        topic: 'Si Math AI — support call',
        startsAt: slot.starts_at as string,
        endsAt: slot.ends_at as string,
        durationMinutes: minutes,
        agenda: `Support ticket ${row.ticket_id}`,
        hostId: (slot.host_id as string | null) ?? null,
      });
    } catch (_e) {
      return 'provider_failed';
    }

    // TWO INDEPENDENT GATES before anything is persisted. redactProviderRef is
    // the allow-list; isSafeProviderRef re-checks the result. If the first is
    // ever edited into something leaky the second still refuses the write, and
    // a meeting with no link beats a meeting whose link is a host credential.
    const ref = redactProviderRef(raw);
    if (!isSafeProviderRef(ref) || !ref.join_url) {
      console.log('[support-actions] refusing unsafe provider_ref', JSON.stringify({
        meeting: row.id, keys: Object.keys(ref),
      }));
      try { if (raw.id) await provider.release(String(raw.id)); } catch (_e) { /* best effort */ }
      return 'provider_failed';
    }

    // OPTIMISTIC LOCK ON updated_at, not a JSON-path filter.
    //
    // The first version filtered on `provider_ref->>join_url is null`, which
    // assumed PostgREST accepts a JSON path in an `is.null` filter — an
    // assumption never verified, and unverifiable here without a live
    // PostgREST. Had it been wrong, every provision would have failed while
    // the whole test suite stayed green.
    //
    // updated_at is a plain timestamptz and `eq` on it is bog-standard
    // PostgREST. It is also a STRONGER guard: support_meetings_set_updated_at
    // is a BEFORE UPDATE trigger, so ANY concurrent modification — a second
    // provision, a cancellation, an agent edit — moves the value and this
    // update matches nothing.
    const { data: won, error: upErr } = await svc
      .from('support_meetings')
      .update({ provider_ref: ref })
      .eq('id', row.id)
      .eq('status', 'scheduled')
      .eq('updated_at', row.updated_at)
      .select('id');

    if (upErr) { console.log('[support-actions] write-back failed', JSON.stringify({ meeting: row.id })); return 'provider_failed'; }

    if (!won || won.length === 0) {
      // Someone else won the race, or the meeting was cancelled between the
      // read and the write. Either way this provider meeting now belongs to
      // nobody, so it is removed rather than left orphaned in the Zoom account.
      try { if (raw.id) await provider.release(String(raw.id)); } catch (_e) { /* best effort */ }
      return 'skipped';
    }
    return 'provisioned';
  }

  try {
    // ── provision ──────────────────────────────────────────────────────────
    // Callable by the meeting's OWNER or an agent. Ownership is checked against
    // the row rather than trusted from the request, and a student may only ever
    // reach their own meeting: support_meetings.user_id is the whole test.
    if (action === 'provision') {
      const { data: m, error } = await svc
        .from('support_meetings')
        .select('id, ticket_id, slot_id, user_id, status, provider, provider_ref, updated_at')
        .eq('id', meetingId).maybeSingle();
      if (error) {
        if (schemaMissing(error)) return json({ ok: false, status: 'schema_not_ready' }, 503);
        throw error;
      }
      if (!m) return json({ ok: false, status: 'not_found' }, 404);
      if (m.user_id !== user.id && !isAgent) return json({ error: 'forbidden' }, 403);
      if (m.status !== 'scheduled') return json({ ok: false, status: 'not_scheduled' });

      const existing = (m.provider_ref ?? {}) as Record<string, unknown>;
      if (existing.join_url) return json({ ok: true, status: 'already_provisioned' });

      const outcome = await provisionOne(m as never);
      return json({ ok: outcome === 'provisioned', status: outcome },
        outcome === 'provider_failed' ? 502 : 200);
    }

    // ── sweep ──────────────────────────────────────────────────────────────
    // Agents only. Drains support_meetings_pending_link_idx — the partial index
    // 20260815a created for exactly this: status 'scheduled' and provider_ref
    // still '{}'. Safe to run repeatedly; a provisioned meeting no longer
    // matches, so a second sweep is a no-op rather than a duplicate.
    if (action === 'sweep') {
      if (!isAgent) return json({ error: 'forbidden' }, 403);
      const { data: rows, error } = await svc
        .from('support_meetings')
        .select('id, ticket_id, slot_id, user_id, status, provider, provider_ref, updated_at')
        .eq('status', 'scheduled')
        .order('created_at', { ascending: true })
        .limit(SWEEP_LIMIT * 4);
      if (error) {
        if (schemaMissing(error)) return json({ ok: false, status: 'schema_not_ready' }, 503);
        throw error;
      }
      // "Has no link yet" is decided here rather than in a PostgREST filter,
      // for the same reason the compare-and-swap moved off the JSON path: a
      // filter this whole action depends on must be one we are certain of.
      // The candidate set is small by construction — it is the set of
      // scheduled meetings, which is bounded by open slots.
      const pending = (rows ?? []).filter(
        (m) => !((m.provider_ref as Record<string, unknown> | null)?.join_url),
      ).slice(0, SWEEP_LIMIT);

      const tally: Record<string, number> = {};
      for (const row of pending) {
        const outcome = await provisionOne(row as never);
        tally[outcome] = (tally[outcome] ?? 0) + 1;
      }
      // The cap is reported, never silently applied: a sweep that stopped at 25
      // with more waiting must say so, or "swept" reads as "finished".
      return json({ ok: true, status: 'swept', pending: pending.length, scanned: (rows ?? []).length, capped: SWEEP_LIMIT, tally });
    }

    // ── release ────────────────────────────────────────────────────────────
    // Agents only, and only for a meeting the DATABASE already considers over.
    // This function never cancels anything itself: support_cancel_meeting() in
    // 20260815d owns the lifecycle, and this tidies up at the provider
    // afterwards. Refusing while the row still says 'scheduled' is what keeps
    // the two from disagreeing about what is booked.
    if (action === 'release') {
      const { data: m, error } = await svc
        .from('support_meetings').select('id, user_id, status, provider_ref').eq('id', meetingId).maybeSingle();
      if (error) {
        if (schemaMissing(error)) return json({ ok: false, status: 'schema_not_ready' }, 503);
        throw error;
      }
      if (!m) return json({ ok: false, status: 'not_found' }, 404);

      // Q2 · OWNER OR AGENT, matching provision. A student who cancels must be
      // able to make the Zoom meeting actually go away; agent-only meant a
      // cancelled call left a live room and a working link in the student's own
      // hands, which is the opposite of what cancelling means.
      if (m.user_id !== user.id && !isAgent) return json({ error: 'forbidden' }, 403);

      // Still refuses while the database says the meeting is on. This function
      // never cancels anything — support_cancel_meeting() in 20260815d owns the
      // lifecycle and must run first — so the two cannot disagree about what is
      // booked.
      if (m.status === 'scheduled') return json({ ok: false, status: 'still_scheduled' }, 409);

      const ref = (m.provider_ref ?? {}) as Record<string, unknown>;
      const pid = ref.meeting_id;
      if (!pid) return json({ ok: true, status: 'nothing_to_release' });

      const providerName = await currentProviderName();
      if (!providerName) return json({ ok: false, status: 'no_adapter' });

      let provider: MeetingProvider;
      try { provider = loadProvider(providerName); }
      catch (_e) { return json({ ok: false, status: 'no_adapter' }); }

      // D2 · AWAITED, and the clear happens ONLY on success.
      //
      // The previous version called release() without awaiting it: the
      // try/catch caught only the synchronous loadProvider, a provider failure
      // became an unhandled rejection, and provider_ref was cleared and
      // 'released' returned regardless. The database then said released while
      // the Zoom meeting was still live and its id no longer recorded anywhere
      // — an orphan nobody could find again.
      //
      // Now a failure leaves provider_ref intact, so the id survives and a
      // retry is possible. The adapter treats 404 as success, so a meeting
      // already gone at the provider still clears.
      try {
        await provider.release(String(pid));
      } catch (e) {
        console.log('[support-actions] release failed at provider', JSON.stringify({
          meeting: meetingId, message: String(e),
        }));
        return json({ ok: false, status: 'provider_failed' }, 502);
      }

      // provider_ref is cleared only now, so the row stops advertising a link
      // that no longer resolves.
      const { error: clearErr } = await svc
        .from('support_meetings').update({ provider_ref: {} }).eq('id', meetingId);
      if (clearErr) {
        // The provider meeting IS gone; only the bookkeeping failed. Say so
        // rather than claim a clean release.
        console.log('[support-actions] released at provider but could not clear provider_ref',
          JSON.stringify({ meeting: meetingId }));
        return json({ ok: true, status: 'released_ref_not_cleared' });
      }
      return json({ ok: true, status: 'released' });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    // Never relay an upstream body. The operator gets the detail in the
    // function log; the caller gets a word.
    console.log('[support-actions] unhandled', JSON.stringify({ action, message: String(e) }));
    return json({ error: 'internal_error' }, 500);
  }
});
