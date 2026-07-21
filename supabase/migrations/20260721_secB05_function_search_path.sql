-- ============================================================================
-- Phase B · SEC-05 — Pin search_path on functions with a mutable search_path
--
-- Advisor: function_search_path_mutable (WARN) for 12 functions that have no
-- `SET search_path`. A role-mutable search_path on a SECURITY DEFINER function
-- is a privilege-escalation vector (a caller can shadow an unqualified object).
--
-- Fix = pin an explicit search_path. We use `public` to match this codebase's
-- existing convention (the other ~13 definer functions already use
-- `SET search_path TO 'public'`) so behaviour is unchanged — every referenced
-- object already resolves in `public` — while removing the mutable-path lint.
--
-- ALTER FUNCTION ... SET search_path only changes the setting; it does not
-- touch the function body. Idempotent & rerunnable.
--
-- NOTE: consume_credits is INTENTIONALLY EXCLUDED here. Pinning its search_path
-- is folded into 20260721_secB_authz01b_consume_credits_owner_guard.sql (which
-- re-declares the function with `SET search_path TO 'public'` + the owner
-- guard). That migration is held back for independent review because it touches
-- credit-consumption logic, so this migration deliberately does not alter the
-- consume_credits object at all. Its search_path lint clears when authz01b is
-- approved and applied.
--
-- ── Rollback ──  ALTER FUNCTION public.<fn>(<args>) RESET search_path;  (per function)
-- ============================================================================

-- SECURITY DEFINER functions
ALTER FUNCTION public.get_zero_personality()                                            SET search_path = public;
ALTER FUNCTION public.activate_pro_subscription(uuid, integer)                          SET search_path = public;
ALTER FUNCTION public.activate_subscription(uuid)                                       SET search_path = public;
ALTER FUNCTION public.activate_credit_pack(uuid)                                        SET search_path = public;
ALTER FUNCTION public.refund_ai_credit(uuid)                                            SET search_path = public;
ALTER FUNCTION public.search_zero_knowledge(text, integer)                              SET search_path = public;

-- SECURITY INVOKER helper / trigger functions
ALTER FUNCTION public.set_updated_at()                                                  SET search_path = public;
ALTER FUNCTION public.sync_device_last_seen()                                            SET search_path = public;
ALTER FUNCTION public.sync_subscription_status()                                         SET search_path = public;
ALTER FUNCTION public.user_role_level(public.user_role)                                  SET search_path = public;
ALTER FUNCTION public.rank_for_xp(integer)                                               SET search_path = public;
