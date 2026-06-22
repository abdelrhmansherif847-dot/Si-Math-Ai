-- Migration: create shadow_runs table for durable L3 verification audit
--
-- Captures Solver A/B + Judge output per L3 shadow run for post-mortem
-- inspection. All of this data is already written to question_records and
-- verification_meta by the L3 pipeline; this table is a denormalized,
-- indexed snapshot that persists beyond edge-function log retention so any
-- question_records.id can be inspected weeks later with a single SQL query.
--
-- Design notes:
--   - No FK on record_id. This is an observability log, not transactional
--     state — a missing or later-purged parent row must never block an audit
--     write. The logical link is enforced at the application layer only.
--   - RLS enabled with no policies. Effectively service_role-only. Solver
--     and judge reasoning may contain student answers verbatim and must
--     never be readable by anon/authed roles.
--   - No ON CONFLICT constraint. Every pipeline invocation gets its own row.
--     If the same record_id runs twice (retry, manual rerun), both rows
--     persist — that is the desired behaviour for auditability.

CREATE TABLE public.shadow_runs (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id                  uuid        NOT NULL,
  uid                        uuid        NOT NULL,
  verification_tier          text,
  pipeline_version           text,
  solver_a_answer            text,
  solver_a_reasoning         text,
  solver_b_answer            text,
  solver_b_reasoning         text,
  judge_reasoning            text,
  judge_verdict              text,
  final_answer               text,
  verification_confidence    numeric,
  verification_quality_score numeric,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shadow_runs_record_id_idx  ON public.shadow_runs (record_id);
CREATE INDEX shadow_runs_uid_idx        ON public.shadow_runs (uid);
CREATE INDEX shadow_runs_created_at_idx ON public.shadow_runs (created_at DESC);

ALTER TABLE public.shadow_runs ENABLE ROW LEVEL SECURITY;
-- No policies defined → service_role only. Anon and authed roles cannot read.

COMMENT ON TABLE public.shadow_runs IS
  'Durable audit log of every L3 verification pipeline run. Denormalized snapshot of solver + judge output for SQL inspection beyond edge-function log retention. Written by ai-tutor Edge Function via service_role. No FK on record_id (observability, not transactional).';

COMMENT ON COLUMN public.shadow_runs.record_id IS 'question_records.id (loose link, no FK)';
COMMENT ON COLUMN public.shadow_runs.uid IS 'auth.users.id of the student whose turn was verified';
COMMENT ON COLUMN public.shadow_runs.final_answer IS 'Zero''s final answer shown to the student (mirrors question_records.ai_response at write time)';
