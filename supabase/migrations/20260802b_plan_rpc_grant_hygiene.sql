-- =====================================================================
-- Plan RPCs — close the anon EXECUTE gap left by the consolidation
-- =====================================================================
-- STATUS: ✅ APPLIED to igvkyxkmjnkzscqgommj on 2026-08-02, owner-approved
--         individually (CLAUDE.md §3).
--
--         POST-APPLY VERIFICATION: 6/6 PASS — anon holds EXECUTE on neither
--         RPC, authenticated keeps EXECUTE on both (admin.html unaffected),
--         PUBLIC holds no implicit grant hiding behind the revoke, the trigger
--         function carries a pinned search_path and still fires under it, and
--         all 7 prices and credit grants are unchanged.
--
--         Advisor before → after: `anon_security_definer_function_executable`
--         2 → 0 (category gone), `function_search_path_mutable` 12 → 11,
--         81 → 78 findings total. The two remaining findings naming these
--         RPCs are `authenticated_security_definer_function_executable`,
--         which is the intended design shared by all 44 admin RPCs here.
--
-- WHY THIS EXISTS
-- ---------------
-- 20260802_plan_catalog_single_source.sql ended each RPC with
--
--     revoke all on function ... from public;
--     grant execute on function ... to authenticated;
--
-- which is the pattern the older admin RPCs use — and which is not enough.
-- Supabase ships a default privilege
--
--     alter default privileges in schema public
--       grant execute on functions to anon, authenticated, service_role;
--
-- so `anon` receives EXECUTE *directly* at CREATE time. `REVOKE ... FROM
-- PUBLIC` does not touch a direct grant to a named role, so both new
-- functions came out reachable by an unauthenticated caller.
--
-- Supabase's advisor confirmed it after the apply: admin_plan_catalog() and
-- admin_update_plan(...) were the ONLY two `anon_security_definer_function_
-- executable` findings in the project. Every other privileged RPC was already
-- hardened by 20260730_sec08a_rpc_grant_hygiene.sql; these two regressed
-- against that standard the moment they were created.
--
-- This was never a live bypass. Both functions open with
--
--     select is_admin into v_is_admin from profiles where id = auth.uid();
--     if not coalesce(v_is_admin, false) then ... 'forbidden'
--
-- and auth.uid() is NULL for anon, so an anonymous call already returned
-- {"ok": false, "reason": "forbidden"} and wrote nothing. The point is the one
-- SEC-08(a) made: the design has two independent layers — no EXECUTE at the
-- privilege level, AND a role gate in the body — and only the second was
-- present. A single refactor of that gate would have removed the only thing
-- standing in the way of an anonymous caller repricing every plan on the site.
--
-- Also fixes `function_search_path_mutable` on plan_definitions_touch(), the
-- updated_at trigger added by the same migration. A trigger function with a
-- mutable search_path resolves its references against whatever the calling
-- role's search_path happens to be.
--
-- SCOPE
-- -----
--   1. revoke execute on admin_plan_catalog()  from anon
--   2. revoke execute on admin_update_plan(...) from anon
--   3. plan_definitions_touch() gains `set search_path to ''`
--
-- BLAST RADIUS
-- ------------
--   client callers of either RPC ......... admin.html only, always as an
--                                          authenticated admin; both keep
--                                          authenticated EXECUTE
--   RLS policies calling either RPC ...... 0 (neither is referenced by a policy,
--                                          so no policy evaluation can break)
--   behaviour change for any real caller . none — an anon call already refused
--   trigger behaviour .................... unchanged; the body assigns now()
--                                          to a column and resolves no
--                                          unqualified object
-- =====================================================================

begin;

revoke execute on function public.admin_plan_catalog() from anon;
revoke execute on function public.admin_update_plan(text, text, numeric, integer) from anon;

-- The body touches no schema-qualified object, so the empty search_path is
-- safe and is the strictest available setting.
create or replace function public.plan_definitions_touch()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

commit;

-- =====================================================================
-- ROLLBACK (only if an anonymous caller must be able to reach these)
-- =====================================================================
-- begin;
--   grant execute on function public.admin_plan_catalog() to anon;
--   grant execute on function public.admin_update_plan(text, text, numeric, integer) to anon;
-- commit;
-- =====================================================================
