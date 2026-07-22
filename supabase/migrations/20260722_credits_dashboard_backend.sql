-- ===========================================================================
-- Owner → Credits control center — backend (RPCs + operation display names)
-- ===========================================================================
-- STATUS: PENDING OWNER APPROVAL (CLAUDE.md §3). Target igvkyxkmjnkzscqgommj.
--
-- Makes the Credits dashboard a complete, data-driven billing control center
-- without touching the ai-tutor / admin-actions Edge Functions and without
-- granting the client broad table privileges. Two SECURITY DEFINER RPCs (each
-- gated on profiles.is_admin) do all the work server-side, so the dashboard is
-- RLS-independent:
--
--   • admin_credits_overview()  — read: every row of credit_costs joined with
--       its per-operation analytics (usage count, credits consumed, last used)
--       plus the whole-platform summary (operation counts, credits consumed,
--       credits sold, and revenue split into subscription vs pack). Fully
--       data-driven: a new credit_costs row appears automatically, no code
--       change. Revenue is NOT attributed per consumption-operation (credits
--       are sold up front) — that's a summary-level figure only.
--
--   • admin_set_credit_cost(...) — write: update one operation's cost / active /
--       always_charge. is_admin-guarded, validated, version-controlled.
--
-- Also seeds credit_costs.display_name (nullable, already present) with
-- user-friendly names for the current catalogue. New operations without a
-- display_name are humanized client-side from the feature_name.
-- ===========================================================================

-- 1. Friendly display names for the current operation catalogue -------------
UPDATE public.credit_costs c
SET display_name = v.dn
FROM (VALUES
  ('CHAT_TEXT',          'Text Question'),
  ('CHAT_IMAGE',         'Image Question'),
  ('CHAT_FOLLOWUP',      'Follow-up'),
  ('CHAT_DEEP_EXPLAIN',  'Deep Explanation'),
  ('STUDY_PLAN',         'Generate Study Plan'),
  ('MOCK_EXAM',          'Full Mock Exam'),
  ('MOCK_TIMER',         'Mock Timer'),
  ('MOCK_PRACTICE',      'Mock Practice'),
  ('FOCUS_SESSION',      'Create Focus Practice Session'),
  ('WEAKNESS_ANALYSIS',  'Generate Analysis'),
  ('AI_CHAT_MESSAGE',    'Chat Message (legacy)')
) AS v(fn, dn)
WHERE c.feature_name = v.fn;

-- 2. READ RPC — everything the dashboard needs, in one round-trip -----------
CREATE OR REPLACE FUNCTION public.admin_credits_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin BOOLEAN;
  v_ops      jsonb;
  v_summary  jsonb;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- Operations joined with per-feature usage analytics.
  SELECT COALESCE(jsonb_agg(row_to_json(o) ORDER BY o.feature_name), '[]'::jsonb)
    INTO v_ops
  FROM (
    SELECT c.feature_name,
           c.display_name,
           c.credit_cost,
           c.active,
           c.always_charge,
           COALESCE(u.usage_count, 0)      AS usage_count,
           COALESCE(u.credits_consumed, 0) AS credits_consumed,
           u.last_used
    FROM credit_costs c
    LEFT JOIN (
      SELECT feature,
             COUNT(*)           AS usage_count,
             SUM(credits_used)  AS credits_consumed,
             MAX(created_at)    AS last_used
      FROM ai_usage_logs
      GROUP BY feature
    ) u ON u.feature = c.feature_name
  ) o;

  -- Whole-platform summary.
  SELECT jsonb_build_object(
    'total_operations',       (SELECT COUNT(*) FROM credit_costs),
    'active_operations',      (SELECT COUNT(*) FROM credit_costs WHERE active),
    'inactive_operations',    (SELECT COUNT(*) FROM credit_costs WHERE NOT active),
    'total_credits_consumed', (SELECT COALESCE(SUM(credits_used), 0) FROM ai_usage_logs),
    'total_credits_sold',     (SELECT COALESCE(SUM(pd.credits_granted), 0)
                                 FROM payment_requests pr
                                 JOIN plan_definitions pd ON pd.plan_code = pr.plan_code
                                WHERE pr.status = 'approved'),
    'total_revenue',          (SELECT COALESCE(SUM(amount_egp), 0)
                                 FROM payment_requests WHERE status = 'approved'),
    'subscription_revenue',   (SELECT COALESCE(SUM(amount_egp), 0)
                                 FROM payment_requests
                                WHERE status = 'approved' AND plan_code NOT LIKE 'PACK\_%'),
    'pack_revenue',           (SELECT COALESCE(SUM(amount_egp), 0)
                                 FROM payment_requests
                                WHERE status = 'approved' AND plan_code LIKE 'PACK\_%')
  ) INTO v_summary;

  RETURN jsonb_build_object('ok', true, 'operations', v_ops, 'summary', v_summary);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_credits_overview() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_credits_overview() TO authenticated;

-- 3. WRITE RPC — update one operation's cost / flags ------------------------
CREATE OR REPLACE FUNCTION public.admin_set_credit_cost(
  p_feature       text,
  p_credit_cost   integer,
  p_active        boolean DEFAULT NULL,
  p_always_charge boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin BOOLEAN;
  v_row      credit_costs%rowtype;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF p_credit_cost IS NULL OR p_credit_cost < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_cost');
  END IF;

  UPDATE credit_costs
     SET credit_cost   = p_credit_cost,
         active        = COALESCE(p_active, active),
         always_charge = COALESCE(p_always_charge, always_charge)
   WHERE feature_name = p_feature
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'feature_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'feature_name',  v_row.feature_name,
    'credit_cost',   v_row.credit_cost,
    'active',        v_row.active,
    'always_charge', v_row.always_charge
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_credit_cost(text, integer, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_credit_cost(text, integer, boolean, boolean) TO authenticated;
