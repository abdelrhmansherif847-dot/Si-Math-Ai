-- ===========================================================================
-- SEC-04 (HIGH) — Zero knowledge base is world-writable
-- ===========================================================================
-- ⛔ NOT APPLIED. Requires explicit owner approval per CLAUDE.md §3.
--    Filename is prefixed PENDING_ so it is not picked up as an applied
--    migration. Rename to 20260727_sec04_knowledge_base_write_lockdown.sql
--    when approving.
--
-- FINDING
-- -------
-- All three knowledge-base tables carry a single policy:
--
--   zero_knowledge_categories      FOR ALL  USING (true)
--   zero_knowledge_subcategories   FOR ALL  USING (true)
--   zero_knowledge_entries         FOR ALL  USING (true)
--
-- `FOR ALL USING (true)` with no WITH CHECK means INSERT, UPDATE and DELETE
-- are unrestricted for every role the policy applies to. Combined with the
-- table-wide grants Supabase issues by default, any authenticated student —
-- and, depending on grants, any anonymous caller — can rewrite or delete the
-- 138 knowledge entries, 48 subcategories and 11 categories.
--
-- WHY THIS IS WORSE THAN IT LOOKS
-- -------------------------------
-- These rows are not inert content. search_zero_knowledge() retrieves them and
-- the ai-tutor Edge Function splices the result into Zero's system prompt. A
-- student who writes a crafted entry is therefore writing text that will be
-- executed as instructions in *other students'* tutoring sessions — a stored
-- prompt-injection with platform-wide reach, delivered by a trusted channel.
-- Two concrete outcomes: the tutor can be made to emit arbitrary content to
-- minors, or the KB can simply be deleted, degrading answer quality platform
-- wide with no alarm.
--
-- OWASP A01:2021 Broken Access Control (and LLM01 Prompt Injection).
--
-- FIX
-- ---
-- The knowledge base is editorial content: students read it, admins curate it.
-- Split the single ALL policy into a public read and an admin-only write, and
-- drop the table-wide write grants so the policy is not the only thing
-- standing between a student and the tutor's prompt.
--
-- BEFORE APPLYING — verify no client path writes these tables:
--   grep -rn "zero_knowledge" --include=*.html --include=*.js .
-- At the time of writing, the only writer is admin.html (curation UI) and the
-- only reader is the search_zero_knowledge() RPC, which is SECURITY DEFINER
-- and therefore unaffected by the grant changes below.
-- ===========================================================================

BEGIN;

-- ── categories ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "zero_knowledge_categories_all"    ON public.zero_knowledge_categories;
DROP POLICY IF EXISTS "Enable all access for all users"  ON public.zero_knowledge_categories;

CREATE POLICY zk_categories_public_read
  ON public.zero_knowledge_categories
  FOR SELECT USING (true);

CREATE POLICY zk_categories_admin_write
  ON public.zero_knowledge_categories
  FOR ALL TO authenticated
  USING (auth_is_admin()) WITH CHECK (auth_is_admin());

-- ── subcategories ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "zero_knowledge_subcategories_all" ON public.zero_knowledge_subcategories;
DROP POLICY IF EXISTS "Enable all access for all users"  ON public.zero_knowledge_subcategories;

CREATE POLICY zk_subcategories_public_read
  ON public.zero_knowledge_subcategories
  FOR SELECT USING (true);

CREATE POLICY zk_subcategories_admin_write
  ON public.zero_knowledge_subcategories
  FOR ALL TO authenticated
  USING (auth_is_admin()) WITH CHECK (auth_is_admin());

-- ── entries ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "zero_knowledge_entries_all"       ON public.zero_knowledge_entries;
DROP POLICY IF EXISTS "Enable all access for all users"  ON public.zero_knowledge_entries;

CREATE POLICY zk_entries_public_read
  ON public.zero_knowledge_entries
  FOR SELECT USING (true);

CREATE POLICY zk_entries_admin_write
  ON public.zero_knowledge_entries
  FOR ALL TO authenticated
  USING (auth_is_admin()) WITH CHECK (auth_is_admin());

-- Defence in depth: remove the table-wide write grants, so a future permissive
-- policy cannot on its own re-open the hole (this is the same lesson as
-- SEC-01 — a policy and a grant are two independent gates, and both matter).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.zero_knowledge_categories,
     public.zero_knowledge_subcategories,
     public.zero_knowledge_entries
  FROM anon, authenticated;

-- Admin curation runs through admin.html as `authenticated`, so the write
-- grant has to come back — the RLS policies above are what restrict it to
-- admins. Read stays open to everyone.
GRANT INSERT, UPDATE, DELETE
  ON public.zero_knowledge_categories,
     public.zero_knowledge_subcategories,
     public.zero_knowledge_entries
  TO authenticated;

COMMIT;

-- ===========================================================================
-- IMPORTANT: replace the DROP POLICY names above with the real ones first.
--   SELECT tablename, policyname, cmd, roles::text, qual, with_check
--   FROM   pg_policies
--   WHERE  schemaname = 'public' AND tablename LIKE 'zero_knowledge%';
--
-- Post-apply verification — a non-admin must be denied:
--   SET ROLE authenticated;
--   INSERT INTO public.zero_knowledge_entries (title) VALUES ('pwned');
--   -- expect: new row violates row-level security policy
--   RESET ROLE;
-- ===========================================================================
