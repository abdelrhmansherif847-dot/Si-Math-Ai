-- ============================================================================
-- D3 — Focus Practice XP
-- Atomic, idempotent XP awards for Focus Practice task/day/round/Legend events.
-- Additive & non-destructive: no existing column/table is altered.
-- XP writes profiles.xp only; mastery_records is never touched here.
-- Applied to project igvkyxkmjnkzscqgommj on 2026-06-24.
-- ============================================================================

-- 1. Idempotency ledger — one row per awarded XP event, forever.
--    PK (user_id, event_key) is the once-only guarantee and the race serializer.
CREATE TABLE IF NOT EXISTS public.focus_xp_log (
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id     uuid,
  event_key   text        NOT NULL,
  xp_awarded  integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_key)
);

CREATE INDEX IF NOT EXISTS focus_xp_log_user_plan_idx
  ON public.focus_xp_log (user_id, plan_id);

ALTER TABLE public.focus_xp_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS focus_xp_log_self ON public.focus_xp_log;
CREATE POLICY focus_xp_log_self ON public.focus_xp_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Rank helper — single source of truth, mirrors the client RANK_THRESHOLDS.
CREATE OR REPLACE FUNCTION public.rank_for_xp(p_xp integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_xp >= 2500 THEN 'Elite Scholar'
    WHEN p_xp >= 1500 THEN 'Master'
    WHEN p_xp >= 1000 THEN 'Expert'
    WHEN p_xp >=  600 THEN 'Scholar'
    WHEN p_xp >=  300 THEN 'Solver'
    WHEN p_xp >=  100 THEN 'Learner'
    ELSE 'Beginner'
  END
$$;

-- 3. Atomic + idempotent award. Caller can only award XP to themselves
--    (auth.uid()); no user id crosses from the browser. The ledger insert gates
--    the profile update, so a duplicate event is a guaranteed no-op.
CREATE OR REPLACE FUNCTION public.award_focus_xp(
  p_plan      uuid,
  p_event_key text,
  p_delta     integer
) RETURNS TABLE(new_xp integer, new_rank text, awarded boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_xp  integer;
BEGIN
  IF v_uid IS NULL OR p_delta IS NULL OR p_delta <= 0
     OR p_event_key IS NULL OR length(p_event_key) = 0 THEN
    RETURN QUERY SELECT NULL::integer, NULL::text, false;
    RETURN;
  END IF;

  INSERT INTO public.focus_xp_log(user_id, plan_id, event_key, xp_awarded)
  VALUES (v_uid, p_plan, p_event_key, p_delta)
  ON CONFLICT (user_id, event_key) DO NOTHING;

  IF NOT FOUND THEN
    SELECT xp INTO v_xp FROM public.profiles WHERE id = v_uid;
    RETURN QUERY SELECT v_xp, rank_for_xp(COALESCE(v_xp,0)), false;
    RETURN;
  END IF;

  UPDATE public.profiles
     SET xp        = COALESCE(xp,0) + p_delta,
         rank_name = rank_for_xp(COALESCE(xp,0) + p_delta)
   WHERE id = v_uid
   RETURNING xp INTO v_xp;

  RETURN QUERY SELECT v_xp, rank_for_xp(v_xp), true;
END $$;

GRANT EXECUTE ON FUNCTION public.award_focus_xp(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rank_for_xp(integer) TO authenticated;

-- ── Rollback (manual) ─────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.award_focus_xp(uuid, text, integer);
-- DROP FUNCTION IF EXISTS public.rank_for_xp(integer);
-- DROP INDEX   IF EXISTS public.focus_xp_log_user_plan_idx;
-- DROP TABLE   IF EXISTS public.focus_xp_log;
