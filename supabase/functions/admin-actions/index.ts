// admin-actions Edge Function
//
// Privileged owner/admin operations: payment approval, credit adjustment,
// founder slots, device revocation, system settings.
//
// PROVENANCE — read before editing.
// This function was created and edited outside version control; until now its
// source existed only on the Supabase platform (SECURITY.md SEC-11). What
// follows is the deployed v12 source, retrieved from the platform and committed
// verbatim except for the CORS change described below. It is the most
// privileged endpoint on the platform — it moves money and grants credits — so
// it being unreviewable was itself the finding.
//
// CHANGE FROM DEPLOYED v12: CORS only.
//   was:  const corsHeaders = { 'Access-Control-Allow-Origin': '*', ... }
//   now:  the shared allow-list in ../_shared/cors.ts
//
// A wildcard here let any website on the internet script this endpoint against
// a visiting *owner's* session — the browser attaches their token and hands the
// response back to the attacker's page. On an endpoint that approves payments
// and grants credits, that is the highest-value CORS hole on the platform.
//
// Nothing else is altered. The authorization logic is sound and is left exactly
// as deployed: the JWT is verified, then profiles.is_admin is read through the
// SERVICE client so RLS cannot be used to spoof it, and a non-admin gets 403.
//
// KNOWN GAPS NOT ADDRESSED HERE (deliberately — see SECURITY.md SEC-12).
// This function handles money, so it gets one reviewed change at a time rather
// than a sprawling rewrite:
//   • err() returns raw Postgres messages (rpcErr.message, insErr.message) to
//     the client — the same disclosure class fixed in ai-tutor v88.
//   • No rate limiting, no request-size cap, no Content-Type validation.
//   • create_and_approve_payment takes amount_egp and credits_to_grant straight
//     from the request body with no server-side check against plan_definitions.
//     Admin-gated, and that is the tool's purpose, but it means a compromised
//     admin account mints unlimited credits.
//
// DEPLOY: supabase functions deploy admin-actions --project-ref igvkyxkmjnkzscqgommj
// verify_jwt must remain TRUE (platform default; do not pass --no-verify-jwt).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, isBlockedOrigin } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') ?? '';
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (isBlockedOrigin(origin)) {
    console.log('[admin-actions] blocked-origin', JSON.stringify({ origin }));
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  const svc = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: profile } = await svc
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  function ok(data: Record<string, unknown>) {
    return new Response(JSON.stringify(data), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
  function err(msg: string, status = 500) {
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  // ── activate_subscription ──────────────────────────────────────────────
  if (action === 'activate_subscription') {
    const { payment_id } = body;
    if (!payment_id) return err('Missing payment_id', 400);

    // Mark payment COMPLETED (must be PENDING first)
    const { data: payment, error: pmtErr } = await svc
      .from('payments')
      .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
      .eq('id', payment_id)
      .eq('status', 'PENDING')
      .select('user_id')
      .single();
    if (pmtErr || !payment) return err('Payment not found or already processed');

    const { data: rpcData, error: rpcErr } = await svc.rpc('activate_subscription', { p_payment_id: payment_id });
    if (rpcErr) return err(rpcErr.message);

    // Clear upgrade_requested
    await svc.from('profiles').update({ upgrade_requested: false, upgrade_note: null }).eq('id', payment.user_id);

    return ok(rpcData ?? { ok: true });
  }

  // ── activate_credit_pack ───────────────────────────────────────────────
  if (action === 'activate_credit_pack') {
    const { payment_id } = body;
    if (!payment_id) return err('Missing payment_id', 400);

    const { data: payment, error: pmtErr } = await svc
      .from('payments')
      .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
      .eq('id', payment_id)
      .eq('status', 'PENDING')
      .select('user_id')
      .single();
    if (pmtErr || !payment) return err('Payment not found or already processed');

    const { data: rpcData, error: rpcErr } = await svc.rpc('activate_credit_pack', { p_payment_id: payment_id });
    if (rpcErr) return err(rpcErr.message);

    await svc.from('profiles').update({ upgrade_requested: false, upgrade_note: null }).eq('id', payment.user_id);

    return ok(rpcData ?? { ok: true });
  }

  // ── create_and_approve_payment ─────────────────────────────────────────
  // Single-step: create COMPLETED payment + run activation RPC + clear flag
  if (action === 'create_and_approve_payment') {
    const { target_user_id, payment_type, reference_id, amount_egp, credits_to_grant } = body;
    if (!target_user_id || !payment_type || !reference_id || amount_egp == null || credits_to_grant == null) {
      return err('Missing required fields: target_user_id, payment_type, reference_id, amount_egp, credits_to_grant', 400);
    }
    if (!['SUBSCRIPTION', 'CREDIT_PACK'].includes(payment_type)) {
      return err('payment_type must be SUBSCRIPTION or CREDIT_PACK', 400);
    }

    // Create payment directly as COMPLETED
    const { data: payment, error: insErr } = await svc
      .from('payments')
      .insert({
        user_id: target_user_id,
        payment_type,
        reference_id,
        amount_egp: Number(amount_egp),
        credits_to_grant: Number(credits_to_grant),
        provider: 'MANUAL',
        status: 'COMPLETED',
        metadata: { approved_by: user.id, approved_at: new Date().toISOString() }
      })
      .select('id')
      .single();
    if (insErr || !payment) return err(insErr?.message ?? 'Failed to create payment');

    const rpcName = payment_type === 'SUBSCRIPTION' ? 'activate_subscription' : 'activate_credit_pack';
    const { data: rpcData, error: rpcErr } = await svc.rpc(rpcName, { p_payment_id: payment.id });
    if (rpcErr) return err(rpcErr.message);

    await svc.from('profiles').update({ upgrade_requested: false, upgrade_note: null }).eq('id', target_user_id);

    return ok({ ok: true, payment_id: payment.id, ...(rpcData ?? {}) });
  }

  // ── claim_founder_slot ─────────────────────────────────────────────────
  if (action === 'claim_founder_slot') {
    const { target_user_id, payment_id } = body;
    if (!target_user_id || !payment_id) return err('Missing target_user_id or payment_id', 400);
    const { data, error } = await svc.rpc('claim_founder_slot', { p_user_id: target_user_id, p_payment_id: payment_id });
    if (error) return err(error.message);
    return ok(data);
  }

  // ── adjust_credits ─────────────────────────────────────────────────────
  if (action === 'adjust_credits') {
    const { target_user_id, amount, reason } = body;
    if (!target_user_id || amount === undefined || !reason) return err('Missing target_user_id, amount, or reason', 400);
    const { data, error } = await svc.rpc('admin_adjust_credits', {
      p_admin_id: user.id, p_user_id: target_user_id, p_amount: amount, p_reason: reason
    });
    if (error) return err(error.message);
    return ok(data);
  }

  // ── reject_payment ─────────────────────────────────────────────────────
  if (action === 'reject_payment') {
    const { payment_id, reason } = body;
    if (!payment_id) return err('Missing payment_id', 400);
    const { data, error } = await svc
      .from('payments')
      .update({ status: 'FAILED', metadata: { rejected_by: user.id, reason: reason || 'Admin rejected', rejected_at: new Date().toISOString() } })
      .eq('id', payment_id)
      .eq('status', 'PENDING')
      .select()
      .single();
    if (error) return err(error.message);
    if (data?.user_id) {
      await svc.from('profiles').update({ upgrade_requested: false, upgrade_note: null }).eq('id', data.user_id);
    }
    return ok({ ok: true });
  }

  // ── revoke_device ──────────────────────────────────────────────────────
  if (action === 'revoke_device') {
    const { device_id } = body;
    if (!device_id) return err('Missing device_id', 400);
    const { error } = await svc.from('user_devices').delete().eq('id', device_id);
    if (error) return err(error.message);
    return ok({ ok: true });
  }

  // ── update_system_setting ──────────────────────────────────────────────
  if (action === 'update_system_setting') {
    const { key, value } = body;
    if (!key || value === undefined) return err('Missing key or value', 400);
    const { error } = await svc.from('system_settings').upsert({ key, value: String(value) });
    if (error) return err(error.message);
    return ok({ ok: true });
  }

  return err('Unknown action', 400);
});
