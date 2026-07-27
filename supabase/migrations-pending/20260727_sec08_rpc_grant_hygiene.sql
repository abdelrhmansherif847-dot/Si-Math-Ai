-- ===========================================================================
-- SEC-08 (LOW / defence in depth) — RPC and table grant hygiene
-- ===========================================================================
-- ⛔ NOT APPLIED. Requires explicit owner approval per CLAUDE.md §3.
--    Rename off the PENDING_ prefix when approving.
--
-- These are hardening items, not live exploits. Each is a case where the only
-- thing preventing abuse is a check *inside* the function, with no outer gate.
-- That is one refactor away from being a real finding, and costs nothing to
-- close now.
--
-- ── (a) Admin RPCs are callable by `anon` ──────────────────────────────────
-- Supabase's advisor flags admin_credits_overview() and admin_set_credit_cost()
-- as executable by the anon role. Both are safe today because each begins with
--
--     SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
--     IF NOT COALESCE(v_is_admin, false) THEN ... forbidden
--
-- and auth.uid() is NULL for anon, so COALESCE(NULL,false) rejects. The risk
-- is entirely about the future: an unauthenticated caller should not be able
-- to reach a SECURITY DEFINER function that reads billing data at all, and the
-- internal guard should be the second line of defence rather than the only one.
REVOKE EXECUTE ON FUNCTION public.admin_credits_overview()        FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_credit_cost(text, integer, boolean, boolean) FROM anon;

-- Same reasoning for every other privileged or user-scoped RPC: none of them
-- has a meaning for an unauthenticated caller.
REVOKE EXECUTE ON FUNCTION public.approve_payment_request(uuid, text)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_payment_request(uuid, text)   FROM anon;
REVOKE EXECUTE ON FUNCTION public.change_user_role(uuid, public.user_role, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_my_account()                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_my_subscription_expiry()     FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_ai_credit(uuid)               FROM anon;
REVOKE EXECUTE ON FUNCTION public.auth_is_admin()                      FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role_at_least(public.user_role)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_role()                  FROM anon;

-- consume_credits() is deliberately NOT revoked from `authenticated`.
-- credit-config.js charge() calls it straight from the browser, so revoking it
-- would break charging for every paid operation on the platform.
--
-- It takes p_user_id as a parameter rather than deriving it from auth.uid(),
-- which looks like a cross-tenant credit-drain primitive — but the current
-- definition (20260721_study_plan_always_charge.sql, "Dual-authorization guard
-- Phase B · AUTHZ-01") already closes it:
--
--     IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid()
--     THEN RETURN jsonb_build_object('ok', false, 'reason',
--                                    'forbidden_user_mismatch');
--
-- A browser caller (auth.uid() present) may spend only their own credits; the
-- Edge Functions run as service_role (auth.uid() IS NULL) and may act for any
-- user. That is the correct shape and needs no change.
--
-- CONFIRM the deployed function actually carries the guard — the repo file
-- being present does not prove it was applied:
--   SELECT pg_get_functiondef(oid) LIKE '%forbidden_user_mismatch%'
--   FROM pg_proc WHERE proname = 'consume_credits';
--   -- expect: true. If false, apply 20260721_study_plan_always_charge.sql.
REVOKE EXECUTE ON FUNCTION public.consume_credits(uuid, text, text, integer, integer, numeric, uuid)
  FROM anon;

-- ── (b) TRUNCATE on user data tables ───────────────────────────────────────
-- anon and authenticated hold TRUNCATE on essentially every table, from
-- Supabase's default `GRANT ALL`. TRUNCATE is NOT subject to RLS — a row-level
-- policy cannot stop it. It is unreachable through PostgREST today (the REST
-- API never emits TRUNCATE), so this is latent rather than live, but a single
-- SQL-executing RPC added later would turn it into instant total data loss.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT format('%I.%I', schemaname, tablename) AS t
    FROM   pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON %s FROM anon, authenticated', r.t);
  END LOOP;
END $$;

-- ── (c) Backup table left in the live schema ───────────────────────────────
-- weakness_signals_bak_mig_b1_20260702 (476 rows) is a pre-migration snapshot
-- that is still exposed through the API with RLS enabled but NO policies. It
-- currently returns nothing to clients, which is the correct outcome by
-- accident rather than by design. Move it out of the API's reach.
REVOKE ALL ON public.weakness_signals_bak_mig_b1_20260702 FROM anon, authenticated;

-- Same for the migration mapping table.
REVOKE ALL ON public.mig_b1_map FROM anon, authenticated;

-- ===========================================================================
-- Post-apply verification:
--   SELECT p.proname, r.rolname
--   FROM   pg_proc p
--   JOIN   pg_namespace n ON n.oid = p.pronamespace
--   CROSS  JOIN LATERAL (VALUES ('anon'),('authenticated')) AS r(rolname)
--   WHERE  n.nspname = 'public'
--     AND  has_function_privilege(r.rolname, p.oid, 'EXECUTE')
--     AND  p.proname LIKE 'admin%';
--   -- expect: no anon rows
-- ===========================================================================
