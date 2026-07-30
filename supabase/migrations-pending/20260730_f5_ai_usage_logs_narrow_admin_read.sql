-- ===========================================================================
-- AI Monitor F5 — narrow admin read access to ai_usage_logs cost columns
-- ===========================================================================
-- ⛔ NOT APPLIED. Requires explicit owner approval per CLAUDE.md §3.
--
-- ⚠ THIS ONE IS A GOVERNANCE DECISION, NOT JUST AN APPROVAL. It changes who can
--   read a cost column. Read §"The decision" before applying — the technical
--   change is trivial and safe; whether you *want* it depends on how INV-10 is
--   meant to be read, which is still open (proposal Appendix A).
--
-- Proposal: docs/roadmap/ai-monitor-telemetry-access-proposal.md, Appendix B
-- ===========================================================================
--
-- THE SITUATION, MEASURED 2026-07-30
--
--   public.ai_usage_logs carries estimated_cost_usd, prompt_tokens,
--   completion_tokens and total_tokens. Its policies are:
--
--     ai_usage_logs_user_read_own   SELECT  {public}         (auth.uid() = user_id)
--     admin_select_ai_usage_logs    SELECT  {authenticated}  (user_id = auth.uid() OR auth_is_admin())
--
--   So EVERY is_admin user can read a column named estimated_cost_usd across
--   all rows. That is a broader set than super_admin, and INV-10 says financial
--   data is owner-only.
--
--   Currently harmless: 1,138 rows, and SUM of every token column and of
--   estimated_cost_usd is exactly 0. Nothing is disclosed today.
--
--   The risk is that it activates silently. The moment anything backfills those
--   columns — and ai_model_calls now records the real figures that a backfill
--   would draw from — the exposure changes with no migration, no schema change,
--   and nothing to review. Same fail-open shape as the direct-RLS option the
--   proposal rejected, on a different table.
--
-- WHAT DEPENDS ON THIS TABLE — checked before proposing any change
--
--   Client reads (grep over *.html, *.js, *.ts, *.mjs):
--     chat.html:1081     sb.from('ai_usage_logs').select('id', {count, head})
--     pricing.html:487   sb.from('ai_usage_logs').select('id', {count, head})
--
--   Both are per-user COUNTS of the caller's own rows. Neither reads a cost or
--   token column. Both are served by ai_usage_logs_user_read_own and are
--   unaffected by anything below.
--
--   Admin reads: NONE. admin.html, dashboard.html and ai-monitor.html contain
--   zero references to ai_usage_logs. The auth_is_admin() clause in
--   admin_select_ai_usage_logs is therefore not used by any code in this
--   repository.
--
-- THE DECISION
--
--   Option A — narrow to owner (this file). Keeps an admin path but raises its
--     floor to owner, matching INV-10. Nothing breaks: no code uses the clause.
--   Option B — drop the admin clause entirely. Simpler, and equally safe today,
--     but removes the path rather than raising it, so a future owner-facing
--     tool would need a new policy.
--   Option C — record as an intentional exception and leave it. Requires
--     accepting that is_admin users may read AI cost, which contradicts INV-10
--     as written.
--
--   Option A is implemented below because it is the smallest change that makes
--   the table's exposure match the stated invariant, and because it leaves a
--   working path for the owner-facing cost tooling AI Economics will need.
--
-- Target project: igvkyxkmjnkzscqgommj
-- ===========================================================================

-- Replace the admin all-rows clause with an owner-gated one. The user-own
-- policy is left untouched — chat.html and pricing.html depend on it.
DROP POLICY IF EXISTS admin_select_ai_usage_logs ON public.ai_usage_logs;

CREATE POLICY owner_select_ai_usage_logs
  ON public.ai_usage_logs
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR COALESCE(public.has_role_at_least('owner'::public.user_role), false)
  );

COMMENT ON POLICY owner_select_ai_usage_logs ON public.ai_usage_logs IS
  'Own rows always; all rows only at role owner. Replaces '
  'admin_select_ai_usage_logs, which allowed every is_admin user to read '
  'estimated_cost_usd across all rows — broader than INV-10 permits. No code '
  'used that clause (verified 2026-07-30).';

-- ===========================================================================
-- Post-apply verification
--   -- 1. exactly one admin-ish policy, gated on owner
--   SELECT policyname, qual FROM pg_policies
--    WHERE schemaname='public' AND tablename='ai_usage_logs' ORDER BY policyname;
--   -- expect: ai_usage_logs_user_read_own, owner_select_ai_usage_logs
--
--   -- 2. the per-user count paths still work — check as a normal signed-in user
--   --    in the browser: chat.html usage count and pricing.html usage count
--   --    must both still render a number.
-- ===========================================================================
