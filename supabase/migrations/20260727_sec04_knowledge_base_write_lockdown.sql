-- ===========================================================================
-- SEC-04 (CRITICAL) — Cross-user prompt injection via the Zero Knowledge Base
-- ===========================================================================
-- APPROVED BY OWNER 2026-07-27 ("fully investigate and eliminate any
-- possibility of cross-user prompt injection through the Zero Knowledge Base").
-- Target project: igvkyxkmjnkzscqgommj.
--
-- SEVERITY RAISED from HIGH to CRITICAL after tracing the injection path.
-- The initial assessment said "student-authored text reaches other students'
-- prompts". That understated it. The actual path is:
--
--   ai-tutor/index.ts get_zero_personality()
--     → SELECT body FROM zero_knowledge_entries WHERE slug = 'zero_personality'
--     → const personality = (personalityRaw || DEFAULT_PERSONALITY) + NAME_BLOCK
--     → spliced VERBATIM into the system prompt under
--       "## ZERO PERSONALITY (Priority 1 — MUST APPLY TO EVERY RESPONSE)"
--
-- That is not "influence". Whoever can UPDATE one row — a row reachable, before
-- this migration, by any authenticated student — *is* the author of the system
-- prompt for every conversation on the platform, cached and re-served for ten
-- minutes at a time. On a product used by children preparing for exams, that is
-- the highest-impact finding in the codebase after SEC-01.
--
-- The second path is broader but shallower: search_zero_knowledge() retrieves
-- up to 5 entries by relevance to the student's question and splices them under
-- "Relevant Knowledge Base". Any student could plant entries tuned to match
-- common queries.
--
-- THE HOLE
-- --------
-- All three tables carried a single policy of the form
--
--     FOR ALL  USING (true)
--
-- with no WITH CHECK, plus Supabase's default table-wide grants. FOR ALL with a
-- `true` qualifier authorises SELECT, INSERT, UPDATE and DELETE for every role
-- the policy targets. Nothing else stood in the way.
--
-- OWASP A01:2021 Broken Access Control; OWASP LLM01 Prompt Injection.
--
-- THE FIX — read stays open, writes become admin-only
-- ---------------------------------------------------
-- The knowledge base is editorial content: students read it, admins curate it.
-- This migration installs exactly that, at BOTH gates that matter (the SEC-01
-- lesson: a policy and a grant are independent, and relying on one is how the
-- critical finding happened).
--
-- Policy names are NOT hardcoded. The existing policies were created outside
-- this repo and their names could not be read from this environment, so the
-- DO block below drops whatever is present by introspection. That is also more
-- robust than a guessed DROP POLICY IF EXISTS list, which would silently leave
-- a permissive policy in place if the name did not match.
--
-- DEFENCE IN DEPTH ALREADY SHIPPED IN CODE (ai-tutor v89)
-- ------------------------------------------------------
-- This migration is the primary control, not the only one. Independently of
-- what the database allows, the retrieval layer now treats every byte from
-- these tables as hostile: injection-pattern neutralisation, length caps,
-- an explicit REFERENCE_DATA fence that content cannot close, a prompt-level
-- instruction that fenced content carries no authority, and an optional
-- ZERO_PERSONALITY_SHA256 integrity pin that fails back to the built-in
-- personality if the row does not hash as expected.
-- ===========================================================================

BEGIN;

-- 1. Remove every existing policy on the three tables, whatever it is called.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename IN ('zero_knowledge_categories',
                         'zero_knowledge_subcategories',
                         'zero_knowledge_entries')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    RAISE NOTICE 'SEC-04: dropped policy % on %', r.policyname, r.tablename;
  END LOOP;
END $$;

-- 2. Public read. The knowledge base is not secret — it is curriculum content,
--    and the tutor reads it on the service-role key regardless.
CREATE POLICY zk_categories_public_read
  ON public.zero_knowledge_categories FOR SELECT USING (true);
CREATE POLICY zk_subcategories_public_read
  ON public.zero_knowledge_subcategories FOR SELECT USING (true);
CREATE POLICY zk_entries_public_read
  ON public.zero_knowledge_entries FOR SELECT USING (true);

-- 3. Writes: admins only. auth_is_admin() is SECURITY DEFINER owned by postgres
--    and reads profiles.is_admin — which SEC-01 made server-authority-only, so
--    this gate can no longer be opened by the caller.
CREATE POLICY zk_categories_admin_write
  ON public.zero_knowledge_categories FOR ALL TO authenticated
  USING (auth_is_admin()) WITH CHECK (auth_is_admin());
CREATE POLICY zk_subcategories_admin_write
  ON public.zero_knowledge_subcategories FOR ALL TO authenticated
  USING (auth_is_admin()) WITH CHECK (auth_is_admin());
CREATE POLICY zk_entries_admin_write
  ON public.zero_knowledge_entries FOR ALL TO authenticated
  USING (auth_is_admin()) WITH CHECK (auth_is_admin());

-- 4. Second gate — grants. anon has no business writing curriculum content at
--    all; authenticated keeps the grant because admin curation runs through
--    admin.html as `authenticated`, and the policies above are what restrict
--    it to admins.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.zero_knowledge_categories,
     public.zero_knowledge_subcategories,
     public.zero_knowledge_entries
  FROM anon, authenticated;

GRANT INSERT, UPDATE, DELETE
  ON public.zero_knowledge_categories,
     public.zero_knowledge_subcategories,
     public.zero_knowledge_entries
  TO authenticated;

COMMIT;

-- ===========================================================================
-- Post-apply verification
--
-- (a) Policy shape — expect one public-read + one admin-write per table:
--   SELECT tablename, policyname, cmd, roles::text, qual, with_check
--   FROM   pg_policies WHERE schemaname='public' AND tablename LIKE 'zero_knowledge%'
--   ORDER  BY tablename, policyname;
--
-- (b) A non-admin must be refused. Run as a real non-admin student's JWT, or:
--   SET ROLE authenticated;
--   UPDATE public.zero_knowledge_entries SET body = 'pwned'
--    WHERE slug = 'zero_personality';
--   -- expect: 0 rows updated (RLS filters the row out of the UPDATE)
--   RESET ROLE;
--
-- (c) anon must hold no write grant — expect zero rows:
--   SELECT privilege_type FROM information_schema.table_privileges
--   WHERE  table_schema='public' AND table_name='zero_knowledge_entries'
--     AND  grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE');
--
-- (d) The tutor must still read the personality. Smoke-test per DEPLOY.md §6
--     and confirm the response is in Zero's voice, not the flat fallback.
-- ===========================================================================
