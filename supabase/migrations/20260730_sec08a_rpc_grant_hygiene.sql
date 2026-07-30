-- ===========================================================================
-- SEC-08 (a) — no privileged RPC reachable by an unauthenticated caller
-- ===========================================================================
-- STATUS: APPLIED 2026-07-30 to igvkyxkmjnkzscqgommj. Owner-approved
--   individually (CLAUDE.md §3), conditional on the dependency review below.
--
-- Split out of supabase/migrations-pending/20260727_sec08_rpc_grant_hygiene.sql.
-- Section (b) shipped alongside as 20260730_sec08b_revoke_truncate_grants.sql;
-- section (c) remains unapplied.
--
-- WHY
--   Supabase's advisor flagged admin_credits_overview() and
--   admin_set_credit_cost() as executable by `anon` while being
--   SECURITY DEFINER. Both were safe: each begins with
--
--       SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
--       IF NOT COALESCE(v_is_admin, false) THEN ... forbidden
--
--   and auth.uid() is NULL for anon, so the internal gate rejected. This was
--   never a live bypass. The point is that the intended design has two
--   independent layers — no EXECUTE at the privilege level, AND a role gate in
--   the body — and only the second was present. One refactor of that gate
--   would have removed the only thing standing in the way.
--
-- DEPENDENCY REVIEW (completed before applying, 2026-07-30)
--
--   1. The revoke mechanism is correct, not silently defeated.
--      PUBLIC holds EXECUTE on none of these functions (checked via
--      aclexplode(proacl) for grantee = 0), so `REVOKE ... FROM anon` actually
--      removes access rather than leaving an implicit PUBLIC grant behind. Had
--      PUBLIC held it, every statement here would have been a no-op that
--      looked like a fix.
--
--   2. Revoking cannot break RLS policy evaluation.
--      has_role_at_least, current_user_role and auth_is_admin are called from
--      inside 28 RLS policies, and a policy expression is evaluated with the
--      querying role's privileges — so revoking EXECUTE from a role that
--      evaluates such a policy would break every query on that table. All 28
--      policies apply to {authenticated} only; not one applies to {public} or
--      {anon}. anon therefore never evaluates a policy that calls them.
--
--   3. No caller is affected.
--      • No client code calls these helpers via sb.rpc() (grep).
--      • admin.html calls admin_credits_overview / admin_set_credit_cost as an
--        authenticated admin; both retain authenticated EXECUTE.
--      • credit-config.js charge() calls consume_credits from the browser as
--        authenticated; it is revoked from anon ONLY and retains authenticated.
--
--   4. Measured effect before applying: only admin_credits_overview and
--      admin_set_credit_cost actually held anon EXECUTE. The other ten
--      statements were already satisfied. They are kept because REVOKE on an
--      unheld privilege is not an error, and because the file should stay
--      idempotent if a future grant reintroduces one.
--
-- RESULT (measured after applying)
--   SECURITY DEFINER functions executable by anon:  2  →  0
--   Supabase advisor `anon_security_definer_function_executable`: 2 WARN → none
--   All authenticated paths verified intact (admin RPCs, consume_credits, the
--   three RLS helpers, and the ai_monitor_* RPCs).
-- ===========================================================================

REVOKE EXECUTE ON FUNCTION public.admin_credits_overview()        FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_credit_cost(text, integer, boolean, boolean) FROM anon;

REVOKE EXECUTE ON FUNCTION public.approve_payment_request(uuid, text)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_payment_request(uuid, text)   FROM anon;
REVOKE EXECUTE ON FUNCTION public.change_user_role(uuid, public.user_role, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_my_account()                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_my_subscription_expiry()     FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_ai_credit(uuid)               FROM anon;
REVOKE EXECUTE ON FUNCTION public.auth_is_admin()                      FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role_at_least(public.user_role)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_role()                  FROM anon;

-- anon ONLY. authenticated is deliberately retained — see review note 3.
REVOKE EXECUTE ON FUNCTION public.consume_credits(uuid, text, text, integer, integer, numeric, uuid)
  FROM anon;

-- ===========================================================================
-- Verification
--   -- expect 0
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.prosecdef
--      AND has_function_privilege('anon', p.oid, 'EXECUTE');
--
--   -- expect true for every one of these
--   SELECT has_function_privilege('authenticated','public.admin_credits_overview()','EXECUTE'),
--          has_function_privilege('authenticated','public.has_role_at_least(public.user_role)','EXECUTE'),
--          has_function_privilege('authenticated',
--            'public.consume_credits(uuid,text,text,integer,integer,numeric,uuid)','EXECUTE');
--
-- NOTE ON THE REMAINING ADVISOR WARNINGS
--   `authenticated_security_definer_function_executable` still fires for these
--   and for every other RPC, including ai_monitor_call_health/_failures. That
--   lint flags any SECURITY DEFINER function a signed-in user can call, which
--   is what an RPC *is*. Each of these gates on role internally. Not actionable.
-- ===========================================================================
