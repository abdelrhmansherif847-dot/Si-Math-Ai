-- ===========================================================================
-- Truth System v2 — V0-T06: public.verification_decisions (the decision log)
-- ===========================================================================
-- STATUS: ⏳ PREPARED. **NOT APPLIED.**
--         Per CLAUDE.md §3 every migration is approved individually before
--         apply_migration is called. Approval to *implement* V0 is not approval
--         to apply this file to production. It applies on a separate go.
--
-- BLUEPRINT: docs/roadmap/truth-system-v2-migration-strategy.md §3 (Phase V0)
-- BACKLOG:   docs/roadmap/truth-system-v2-backlog.md — V0-T06, V0-T10, V0-T13
--
-- ── WHAT THIS IS ──────────────────────────────────────────────────────────
-- One row per L3 Shadow run, recording which VERSION of which POLICY decided,
-- and whether the item was selected for forced exploration. It is the audit
-- substrate of Truth System v2 (v2 §11) and the only verification store
-- intended to be retained permanently.
--
-- ── WHY A NEW TABLE AND NOT MORE COLUMNS ON question_records ──────────────
-- This is a compliance boundary, not an optimisation (v2 §23).
--
-- question_records holds `question`, `image`, `ai_response` and `user_id` on
-- the same row as the verification telemetry. v2 §11 requires the opposite for
-- the decision log: small, identifier-free, image-free, retained long-term —
-- while traces are sampled, TTL'd and separately consented.
--
-- The FTC v. Edmodo remedy included deletion of models and algorithms developed
-- from improperly collected data. A permanently-retained store of student
-- uploads keyed to user ids is that fact pattern. Splitting the two stores
-- while the decision log is still empty costs one migration. Splitting them
-- after it fills is a migration over children's personal data.
--
-- ── WHAT IS DELIBERATELY ABSENT, AND MUST STAY ABSENT ─────────────────────
-- No user_id. No session_id. No image. No question text. No answer text. No
-- solver output. No judge prose. No free text of any kind.
--
-- question_record_id is the ONLY link to the student-facing store. It is
-- nullable and ON DELETE SET NULL, so erasing a question_records row is never
-- blocked by this table and never orphans it — the decision survives as an
-- anonymous measurement, which is exactly what it is for.
--
-- Adding an identifier column here is not a schema change. It is a change to
-- what the platform retains about a child, and it needs the review the original
-- retention decision got. tests/verification-v0.test.mjs asserts the writer's
-- payload carries no identifier key, so the boundary fails loudly rather than
-- eroding quietly.
--
-- ── BACKWARD COMPATIBILITY ────────────────────────────────────────────────
-- Purely additive. No existing table, column, index, policy, grant, view or
-- function is touched. question_records is neither read nor written by this
-- file. Every existing consumer — chat.html, ai-monitor.html, admin.html, the
-- Cost Engine, the econ views — is unaffected, because nothing they query
-- changes. With the table present and the Edge Function not yet redeployed,
-- it simply stays empty. That is a valid, indefinitely stable state.
--
-- ── DEPLOY ORDER ──────────────────────────────────────────────────────────
-- This migration goes FIRST, the Edge Function second. Reversed, the insert
-- fails against a missing relation on every math question. That failure is
-- caught and swallowed by design — the decision log may never affect L3 Shadow
-- or the student — so the consequence is one log line per math question and no
-- rows. Noisy, not dangerous. The kill switch removes even the noise.
--
-- ── KILL SWITCH ───────────────────────────────────────────────────────────
-- VERIFICATION_DECISION_LOG_ENABLED=false stops all writing with no redeploy.
-- Default is on, matching AI_MODEL_TELEMETRY_ENABLED.
--
-- ── ROLLBACK ──────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.verification_decisions;
-- Safe unconditionally throughout V0, because nothing reads this table in V0.
-- The first reader arrives in V8 (Audit Engine).
-- ===========================================================================

-- ── 1. The table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.verification_decisions (
  id                   bigserial   PRIMARY KEY,

  -- Idempotency, mirroring ai_model_calls.call_uid (Phase 3 F1). Minted when
  -- the decision is made, so a retried write commits only what did not land and
  -- can never double-count. The pipeline writes once today; the field is what
  -- makes a retry safe to add later without revisiting this decision.
  decision_uid         uuid        NOT NULL,

  -- Two clocks, same reasoning as ai_model_calls (Phase 3 F2):
  --   created_at — the WRITE clock. Monotonic with visibility, so a future
  --                "claim rows in [from,to)" scan cannot skip a late arrival.
  --   decided_at — the DECISION clock, the instant the pipeline concluded.
  --                The L3 pipeline runs in the background after the student
  --                response, so created_at alone would mis-attribute decisions
  --                across day boundaries.
  created_at           timestamptz NOT NULL DEFAULT now(),
  decided_at           timestamptz NOT NULL,

  -- ── correlation ────────────────────────────────────────────────────────
  -- The ONLY link to student-facing data. Nullable and SET NULL on delete:
  -- an erasure request must never be blocked by this table.
  question_record_id   uuid        NULL REFERENCES public.question_records(id) ON DELETE SET NULL,
  -- Joins to ai_model_calls, which is how a decision resolves to the exact
  -- provider spend that produced it. Neither column identifies a student.
  request_id           uuid        NULL,
  client_request_id    uuid        NULL,

  -- ── V0-T10: policy identity ────────────────────────────────────────────
  -- NOT NULL by design. Today's pipeline is a fixed straight line with no
  -- branching and no early exit; it has always been a policy and has never had
  -- a version, so no decision it ever made is attributable to the logic that
  -- made it. A nullable column here would let that state return by accident.
  pipeline_version     text        NOT NULL,
  policy_version       text        NOT NULL,
  plan_id              text        NOT NULL,

  -- ── segment keys ───────────────────────────────────────────────────────
  -- Canonical taxonomy subtopic id (e.g. ALG_006) and difficulty tier. Not
  -- identifiers; both already exist on question_records and in
  -- verification_meta. Present because per-lesson and per-segment is the grain
  -- every downstream consumer works at — the audit's margin (v2 Law 4), the
  -- per-segment α_ledger derivation (v2 §16), and the reliability model.
  -- Nullable: classification is advisory and may be absent (v2 §5.4).
  lesson_id            text        NULL,
  difficulty_bin       text        NULL,

  -- ── V0-T13: forced exploration (v2 §10.7, principle P7) ────────────────
  -- The pipeline has no early exit, so every math question is already verified
  -- past the point of sufficiency and the effective fraction is 1.0. Recording
  -- it now costs nothing; once a policy with early exit exists the fraction
  -- drops, and these two columns are what keep the audit sample, the
  -- calibration set and off-policy evaluation possible.
  --
  -- exploration_fraction stores the fraction IN FORCE when the decision was
  -- made, not the current config. Without it, a fraction changed in April makes
  -- every March decision uninterpretable.
  forced_exploration   boolean     NOT NULL,
  exploration_fraction numeric(5,4) NOT NULL,

  -- ── V0-T01: answer-blind judging (v2 §7.3) ─────────────────────────────
  -- judge_answer_blind records whether the pre-committed judge ran for this
  -- decision, so the comparison window is separable from the rows that predate
  -- it. blind_verdict/blind_assorter are NULL when it did not.
  --
  -- blind_assorter is the MODEL_OPINION assorter of v2 §9.1 verbatim: 1 if the
  -- pre-committed answer matches the candidate, 1/2 if it abstained, 0 if it
  -- disagrees. It is stored, not consumed — nothing reads it until V5.
  judge_answer_blind   boolean     NOT NULL,
  blind_verdict        text        NULL,
  blind_assorter       numeric(4,3) NULL,

  -- ── the legacy verdict, for the comparison ─────────────────────────────
  -- The answer-conditioned judge's verdict, computed and written exactly as
  -- before. Deliberately NOT constrained to an enum: it mirrors a column whose
  -- value set the Edge Function owns, and because a failed insert here is
  -- swallowed by design, a constraint violation would be silent data loss
  -- rather than a loud error.
  legacy_judge_verdict text        NULL,
  solver_agreement     numeric(4,3) NULL,
  pipeline_latency_ms  integer     NULL,

  CONSTRAINT verification_decisions_blind_verdict_chk
    CHECK (blind_verdict IS NULL OR blind_verdict IN ('agrees','disagrees','abstained')),
  CONSTRAINT verification_decisions_blind_assorter_chk
    CHECK (blind_assorter IS NULL OR (blind_assorter >= 0 AND blind_assorter <= 1)),
  CONSTRAINT verification_decisions_exploration_fraction_chk
    CHECK (exploration_fraction >= 0 AND exploration_fraction <= 1),
  -- A blind verdict without the blind judge having run is incoherent, and would
  -- silently corrupt the comparison window.
  CONSTRAINT verification_decisions_blind_coherence_chk
    CHECK (judge_answer_blind OR (blind_verdict IS NULL AND blind_assorter IS NULL))
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────
-- Idempotency support for the ON CONFLICT write.
CREATE UNIQUE INDEX IF NOT EXISTS verification_decisions_decision_uid_key
  ON public.verification_decisions (decision_uid);

-- The decision clock is how every future consumer windows this table.
CREATE INDEX IF NOT EXISTS verification_decisions_decided_at_idx
  ON public.verification_decisions (decided_at DESC);

-- The shadow-window join back to question_records. Partial, because the column
-- is nullable and a null carries no join value.
CREATE INDEX IF NOT EXISTS verification_decisions_question_record_id_idx
  ON public.verification_decisions (question_record_id)
  WHERE question_record_id IS NOT NULL;

-- ── 3. Security ───────────────────────────────────────────────────────────
-- Two independent protections, matching the platform_cost_entries pattern
-- (Phase 7 M2a): explicit REVOKE *and* RLS with no permissive policy. Every
-- sensitive public table in this project is protected by RLS alone and relies
-- on Supabase's default grants; this table gets both, because it is the store
-- that is meant to outlive everything else.
REVOKE ALL ON public.verification_decisions FROM PUBLIC;
REVOKE ALL ON public.verification_decisions FROM anon;
REVOKE ALL ON public.verification_decisions FROM authenticated;
REVOKE ALL ON SEQUENCE public.verification_decisions_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.verification_decisions_id_seq FROM anon;
REVOKE ALL ON SEQUENCE public.verification_decisions_id_seq FROM authenticated;

ALTER TABLE public.verification_decisions ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policy. With RLS on and no permissive policy, every non-owner
-- role is denied even if a GRANT is later added by accident. The Edge Function
-- writes with the service role, which bypasses RLS.

-- ── 4. Documentation that travels with the schema ─────────────────────────
COMMENT ON TABLE public.verification_decisions IS
  'Truth System v2 decision log (V0-T06). One row per L3 Shadow run: which '
  'version of which policy decided, and whether the item was forced-explored. '
  'Identifier-free and image-free BY DESIGN so it can be retained permanently '
  '(v2 §11, §23) — adding a student identifier here is a retention decision, '
  'not a schema change. Nothing reads this table until V8 (Audit Engine).';

COMMENT ON COLUMN public.verification_decisions.decided_at IS
  'The decision clock — when the pipeline concluded. created_at is the write '
  'clock. The pipeline runs in the background after the student response, so '
  'the two differ and only this one is meaningful for measurement.';

COMMENT ON COLUMN public.verification_decisions.exploration_fraction IS
  'The forced-exploration fraction IN FORCE for this decision, not the current '
  'config value. Without it, changing the fraction makes every earlier decision '
  'uninterpretable.';

COMMENT ON COLUMN public.verification_decisions.blind_assorter IS
  'MODEL_OPINION assorter (v2 §9.1): 1 if the pre-committed answer matched the '
  'candidate, 0.5 if the judge abstained, 0 if it disagreed. Stored, not '
  'consumed — the Evidence Ledger that reads it arrives in V5.';

COMMENT ON COLUMN public.verification_decisions.question_record_id IS
  'The ONLY link to student-facing data. Nullable and ON DELETE SET NULL so an '
  'erasure request is never blocked by this table.';
