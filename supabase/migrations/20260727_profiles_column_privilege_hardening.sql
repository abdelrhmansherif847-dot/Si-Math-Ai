-- ===========================================================================
-- SEC-01 (CRITICAL) — Profile privilege-escalation / billing-bypass closure
-- ===========================================================================
-- APPROVED BY OWNER 2026-07-27 (CLAUDE.md §3), after a full write-path trace.
-- Target project: igvkyxkmjnkzscqgommj
--
-- THE VULNERABILITY
-- -----------------
-- public.profiles carries the RLS policy "Users update own profile":
--
--     FOR ALL TO public USING (auth.uid() = id) WITH CHECK (auth.uid() = id)
--
-- RLS is *row*-level. It answers "which rows may I write?" — never "which
-- columns may I write?". The row test passes for a student writing their own
-- row, so column authority fell through to table grants — and `anon` +
-- `authenticated` held table-wide UPDATE/INSERT, i.e. every column including
-- the privilege and billing columns. No trigger intervened (profiles has only
-- set_updated_at).
--
-- Any signed-in student could therefore run, from the browser console:
--
--     await sb.from('profiles').update({
--       is_admin: true, role: 'owner', credits_balance: 999999,
--       plan_code: 'founder', subscription_expires_at: '2099-01-01'
--     }).eq('id', MY_OWN_ID);
--
-- Consequences: auth_is_admin() then returns true for that student, which is
-- the gate on admin_select_profiles, admin_select_payments, payment_requests
-- read/update, and pricing_settings / plan_definitions writes — i.e. every
-- other student's PII and the entire payment record set. Independently it
-- grants unlimited AI credits and a free perpetual subscription.
--
-- OWASP A01:2021 Broken Access Control.
-- CVSS 3.1 9.1 (AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N).
--
-- THE FIX — and why the obvious form of it does NOT work
-- -----------------------------------------------------
-- The intuitive fix is a column-level revoke:
--
--     REVOKE UPDATE (is_admin, ...) ON public.profiles FROM authenticated;
--
-- That is a NO-OP here, and silently so. PostgreSQL treats a table-level
-- UPDATE grant as covering all columns present and future; a column-level
-- REVOKE cannot carve a hole out of it. The privilege survives, and
-- information_schema.column_privileges keeps reporting every column as
-- granted (it expands the table-level grant per column). Verified against
-- this database: applying the column REVOKE changed nothing.
--
-- The correct form is to drop the table-wide privilege and re-grant an
-- explicit column allow-list:
--
--     REVOKE UPDATE ON public.profiles FROM authenticated;
--     GRANT  UPDATE (safe columns only) ON public.profiles TO authenticated;
--
-- This also makes the grant fail-closed for the future: a column added later
-- is NOT writable by clients until someone grants it deliberately.
--
-- `anon` is revoked outright. auth.uid() is NULL for an unauthenticated
-- caller, so `auth.uid() = id` can never hold and anon has no legitimate
-- write to this table at all.
--
-- WHY THIS IS SAFE — write-path trace performed before applying
-- -------------------------------------------------------------
-- Every legitimate writer of the denied columns runs as a role this migration
-- does not touch:
--
--   * approve_payment_request, reject_payment_request, change_user_role,
--     consume_credits, refund_ai_credit, admin_set_credit_cost,
--     enforce_my_subscription_expiry, delete_my_account, award_focus_xp,
--     handle_new_user — all SECURITY DEFINER, all owned by `postgres`.
--     SECURITY DEFINER executes with the *owner's* privileges, so a revoke
--     against anon/authenticated cannot affect them.
--   * the `admin-actions` Edge Function (credit grant/deduct,
--     create_and_approve_payment) — runs on SUPABASE_SERVICE_ROLE_KEY.
--   * the `ai-tutor` Edge Function — service role; writes only
--     language_preference, which is on the allow-list below.
--
-- And no client path writes them. Full trace of direct client writes to
-- public.profiles across the repo — every column below is on the allow-list:
--
--   pricing.html          upgrade_requested, upgrade_note, upgrade_requested_at
--   manual-payment.html   upgrade_requested, upgrade_note
--   settings.html         id, email, full_name, exam_type, target_score,
--                         exam_date, study_sessions_per_week, session_length,
--                         password_last_changed_at, upgrade_requested,
--                         upgrade_note
--   onboarding.html       id, email, full_name (+ onboarding fields)
--   admin.html            upgrade_requested, upgrade_note  (clearing the flag)
--   chat.html             xp, rank_name
--   mock-exam.html        xp, rank_name
--   assets/streak.js      current_streak, best_streak, last_active_date
--
-- NOT COVERED HERE (deliberate — see SECURITY.md SEC-09)
-- -----------------------------------------------------
-- xp, rank_name, current_streak, best_streak stay client-writable because the
-- gamification code above writes them straight from the browser. They carry no
-- monetary or authorization value, so they are a separate, lower-severity
-- finding with a separate fix (move to a SECURITY DEFINER RPC). Revoking them
-- here would break XP and streak awards.
--
-- REVERSIBILITY
-- -------------
-- Instantly reversible, no data involved:
--   GRANT UPDATE, INSERT ON public.profiles TO anon, authenticated;
-- ===========================================================================

BEGIN;

-- 1. Drop the table-wide write privileges that made column authority moot.
REVOKE UPDATE, INSERT ON public.profiles FROM anon, authenticated;

-- 2. Re-grant UPDATE on the student-owned columns only. Everything absent
--    here — is_admin, role, credits_balance, subscription_credits,
--    pack_credits, plan_code, plan, subscription_expires_at, is_founder,
--    founder_badge, id, created_at — is now server-authority only.
GRANT UPDATE (
  full_name, email, updated_at,
  exam_type, target_score, exam_date,
  study_sessions_per_week, session_length, study_availability,
  onboarding_completed, password_last_changed_at,
  language_preference, confidence_level, biggest_weakness,
  mastered_topics, improvement_trends, study_consistency, exam_mode,
  xp, rank_name, current_streak, best_streak, last_active_date,
  upgrade_requested, upgrade_note, upgrade_requested_at
) ON public.profiles TO authenticated;

-- 3. Re-grant INSERT on the same set plus `id`, which the self-healing
--    upserts in onboarding.html / settings.html must supply. RLS
--    (WITH CHECK auth.uid() = id) still pins the row to the caller.
GRANT INSERT (
  id, full_name, email, updated_at, created_at,
  exam_type, target_score, exam_date,
  study_sessions_per_week, session_length, study_availability,
  onboarding_completed, password_last_changed_at,
  language_preference, confidence_level, biggest_weakness,
  mastered_topics, improvement_trends, study_consistency, exam_mode,
  xp, rank_name, current_streak, best_streak, last_active_date,
  upgrade_requested, upgrade_note, upgrade_requested_at
) ON public.profiles TO authenticated;

-- 4. Defence in depth: strip privileges no client role should ever hold on
--    this table. DELETE is already denied by RLS (profiles has no DELETE
--    policy) and account deletion goes through the SECURITY DEFINER
--    delete_my_account() RPC. TRUNCATE is NOT subject to RLS at all — it is
--    unreachable through PostgREST today, but holding it is indefensible.
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.profiles FROM anon, authenticated;

COMMIT;

-- ===========================================================================
-- Post-apply verification
--
-- (a) No privileged column writable by a client role — expect ZERO rows:
--
--   SELECT grantee, column_name, privilege_type
--   FROM   information_schema.column_privileges
--   WHERE  table_schema = 'public' AND table_name = 'profiles'
--     AND  grantee IN ('anon','authenticated')
--     AND  privilege_type IN ('UPDATE','INSERT')
--     AND  column_name IN ('is_admin','role','credits_balance',
--                          'subscription_credits','pack_credits','plan_code',
--                          'plan','subscription_expires_at','is_founder',
--                          'founder_badge');
--
-- (b) Legitimate student writes still granted — expect the allow-list back:
--
--   SELECT privilege_type, string_agg(column_name, ', ' ORDER BY column_name)
--   FROM   information_schema.column_privileges
--   WHERE  table_schema = 'public' AND table_name = 'profiles'
--     AND  grantee = 'authenticated'
--   GROUP  BY privilege_type;
--
-- (c) service_role untouched — expect UPDATE + INSERT present:
--
--   SELECT privilege_type FROM information_schema.table_privileges
--   WHERE  table_schema='public' AND table_name='profiles'
--     AND  grantee='service_role';
-- ===========================================================================
