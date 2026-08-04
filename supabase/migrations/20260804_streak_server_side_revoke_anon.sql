-- APPLIED 2026-08-04, immediately after 20260804_streak_server_side.sql.
--
-- Caught by that migration's own verification checklist, which is the reason the
-- checklist exists. The migration ran `revoke all on function ... from public`
-- expecting that to keep the function away from `anon`. It does not: this
-- project has ALTER DEFAULT PRIVILEGES granting EXECUTE on new functions to
-- anon, authenticated and service_role, so `anon` received an EXPLICIT grant at
-- creation time, and revoking from PUBLIC does not touch it.
--
-- Verified after applying: an anon call raises 42501 and
-- information_schema.routine_privileges no longer lists anon.
--
-- Not an open door before this ran — recompute_streak()'s authorisation block
-- fails closed for a caller with no auth.uid() whose current_user is not a
-- trusted backend role, which is exactly what anon is. This closes it at the
-- privilege layer too, so that guard is not the only thing between an anonymous
-- caller and a SECURITY DEFINER function that bypasses RLS.

revoke all on function public.recompute_streak(uuid, text) from anon;
