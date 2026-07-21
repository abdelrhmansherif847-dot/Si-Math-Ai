-- ============================================================================
-- Phase B · AUTHZ-01 (part a) — Dual authorization model: EXECUTE least-privilege
--
-- Advisors:
--   anon_security_definer_function_executable          (WARN ×19)
--   authenticated_security_definer_function_executable (WARN ×19)
--
-- Every SECURITY DEFINER function ran with PUBLIC EXECUTE (the Postgres
-- default) and/or an explicit anon grant, so ANY caller — including anonymous
-- ones — could invoke privileged, elevated-rights routines. Most dangerous:
--   • activate_pro_subscription  — granted arbitrary PRO to any user_id (anon!)
--   • activate_subscription / activate_credit_pack — replayable credit grants
--   • claim_founder_slot         — arbitrary founder grant + slot decrement
--   • consume_credits            — could charge ANOTHER user's credits
--
-- The "dual authorization model": each function is protected at BOTH layers —
--   (1) the GRANT/EXECUTE layer (this migration): revoke PUBLIC + anon
--       everywhere; grant EXECUTE only to the role(s) that legitimately call it.
--   (2) the in-body layer: the function itself verifies identity/role
--       (auth.uid(), auth_is_admin(), owner checks). Part (b) closes the one
--       remaining in-body gap (consume_credits owner guard).
--
-- Call sites were verified before choosing each grant (see docs/roadmap/
-- phase-b-security.md). service_role has BYPASSRLS and is the Edge Function /
-- server identity.
--
-- Idempotent & rerunnable (REVOKE/GRANT are declarative). Ordering-independent
-- vs part (b): CREATE OR REPLACE preserves a function's ACL.
-- ============================================================================

-- ── Group 1: Legacy / server-only. No client call site. Superseded by the
-- manual-payments flow (approve_payment_request, which grants inline). Lock to
-- service_role only. ───────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.activate_subscription(uuid)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_credit_pack(uuid)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_pro_subscription(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_founder_slot(uuid, uuid)         FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription(uuid)             TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_credit_pack(uuid)             TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_pro_subscription(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_founder_slot(uuid, uuid)         TO service_role;

-- ── Group 2: Trigger-only. handle_new_user fires from the auth.users INSERT
-- trigger; Postgres does NOT check EXECUTE privilege when firing triggers, so
-- revoking direct EXECUTE from everyone is safe and blocks direct invocation
-- (which could forge profile rows). ─────────────────────────────────────────
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ── Group 3: End-user self-service RPCs. Called client-side with the user's
-- JWT; each is guarded in-body by auth.uid(). authenticated + service_role,
-- never anon. ───────────────────────────────────────────────────────────────
-- NOTE: consume_credits is deliberately NOT touched here. ALL of its hardening
-- (grant lockdown + owner guard + search_path pin) is consolidated into the
-- review-gated 20260721_secB_authz01b_consume_credits_owner_guard.sql, so this
-- applied migration changes no credit-consumption surface. Until authz01b is
-- applied, consume_credits remains anon/PUBLIC-executable (residual risk noted
-- in docs/roadmap/phase-b-security.md).
REVOKE ALL ON FUNCTION public.refund_ai_credit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_ai_credit(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.award_focus_xp(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_focus_xp(uuid, text, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_my_subscription_expiry() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_my_subscription_expiry() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_register_device(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_register_device(uuid, text) TO authenticated, service_role;

-- ── Group 4: Admin/owner RPCs (admin.html). Each raises unless the caller is
-- admin/owner in-body. authenticated + service_role, never anon. ────────────
REVOKE ALL ON FUNCTION public.change_user_role(uuid, public.user_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_user_role(uuid, public.user_role, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.approve_payment_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_payment_request(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reject_payment_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_payment_request(uuid, text) TO authenticated, service_role;

-- ── Group 5: Read-only Zero helpers. Called by the Edge Function (service_role);
-- keep authenticated for safety, drop anon. ─────────────────────────────────
REVOKE ALL ON FUNCTION public.get_zero_personality() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_zero_personality() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.search_zero_knowledge(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_zero_knowledge(text, integer) TO authenticated, service_role;

-- ── Group 6: Role predicates used inside RLS policies. Verified that NO
-- anon/public policy references them, so dropping anon EXECUTE is safe. They
-- only ever reveal the caller's OWN role / a boolean. authenticated +
-- service_role. ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.auth_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_role_at_least(public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role_at_least(public.user_role) TO authenticated, service_role;

-- ── Group 7: Already correct (authenticated + service_role, no anon).
-- Re-asserted defensively so the desired end-state is explicit. ─────────────
REVOKE ALL ON FUNCTION public.log_unmapped_detection(text, text, text, text, uuid, text, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_unmapped_detection(text, text, text, text, uuid, text, smallint) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Residual advisor state after this migration (EXPECTED / by design):
--   • anon_security_definer_function_executable          → 0 (fully cleared)
--   • authenticated_security_definer_function_executable → remains for the
--     functions authenticated is DESIGNED to call (groups 3–7). These are safe:
--     each enforces identity/role in-body. This is the intended dual model,
--     not an outstanding vulnerability.
-- ----------------------------------------------------------------------------
