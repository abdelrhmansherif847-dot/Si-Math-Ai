-- ===========================================================================
-- AI Economics · Phase 3 — AI model-call telemetry (usage ledger)
-- ===========================================================================
-- STATUS: APPLIED to project igvkyxkmjnkzscqgommj on 2026-07-28 (owner-approved,
-- CLAUDE.md §3). Migration version `aiecon_p3_model_call_telemetry`.
--
-- ⚠ THE TABLE HAS NO WRITER YET. ai-tutor v90 is NOT deployed — it is held
--   pending the Deployment Readiness Review
--   (docs/roadmap/phase-3-deployment-readiness.md). The table is inert until
--   then, which is the intended and safe intermediate state: applying the
--   schema first means the first v90 request has somewhere to write.
--
-- Verified after apply — 8 structural checks PASS, 1 expected WARN:
--   • P3-01 table present · P3-02 no client grants · P3-03 RLS enabled
--   • P3-04 no cost/price/currency column (INV-01)
--   • P3-05 service_role INSERT=true UPDATE=false DELETE=false (INV-15)
--   • P3-06 9 indexes · P3-16 call_uid UNIQUE enforced (F1 — retry is safe)
--   • P3-21 call_uid + started_at + client_request_id all present (F1/F2/F3)
--   • P3-07 WARN — no rows yet, expected until v90 ships.
--
-- Target project: igvkyxkmjnkzscqgommj
-- Architecture:   docs/roadmap/ai-economics.md §7 (frozen at r4, 2026-07-28)
-- Roadmap:        §14 Phase 3.
-- Depends on:     Phase 2 (ai_catalog) — applied 2026-07-28.
--
-- WHAT THIS IS
--   One row per upstream provider call: what capability did the work, what it
--   consumed, whether it succeeded, and how long it took. This is the fact
--   table that closes GAP-1, GAP-2 and GAP-7 — today the platform records
--   0 tokens and 0 cost for every AI call it makes.
--
-- WHAT THIS IS NOT
--   • Not money. No cost, price, currency or FX column exists here, and none
--     may ever be added (INV-01). Pricing is the Cost Engine's job in Phase 4.
--   • Not PII. No prompt or completion text is stored — only counts, outcome,
--     latency and model identity. Follows the analyzer_runs precedent.
--   • Not a dashboard. Nothing reads this table until Phase 4.
--
-- RISK
--   Additive only. One new table in `public`. Alters no existing table,
--   function, policy or grant. The only writer is the ai-tutor Edge Function
--   running as service_role, fire-and-forget. Rollback is one DROP TABLE.
--
-- VOLUME
--   ~4–6 rows per student question. At the current 404 questions/30d that is
--   ~70 rows/day. At 1,000 questions/day it is ~5,000 rows/day (~150k/month).
--   Rollups and retention are Phase 8 work, not needed at this scale.
--
-- TRANSACTION: no explicit BEGIN/COMMIT — applied through Supabase's migration
-- path, which wraps the script in one transaction. Applying by hand in the SQL
-- Editor? Wrap it yourself: BEGIN; <this file> COMMIT;
-- ===========================================================================

-- 1. TABLE --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_model_calls (
  id                 bigserial PRIMARY KEY,

  -- F1 (integrity review): the per-call identity. Minted in recordModelCall the
  -- moment the call is observed, so the SAME uuid is presented on a retry. With
  -- the UNIQUE constraint below this makes the write idempotent: a re-attempted
  -- flush commits only the rows that did not land, and can never double-count.
  -- Without it, at-most-once rested entirely on "we never retry" and every
  -- failed write was permanently lost.
  call_uid           uuid        NOT NULL,

  -- WHEN. Two clocks, deliberately:
  --   created_at — the WRITE clock (INSERT time). Monotonic with visibility, so
  --                the Cost Engine's "claim unpriced rows in [from,to)"
  --                anti-join can never skip a late arrival.
  --   started_at — F2: the ECONOMIC clock, the instant the provider call began.
  --                Background calls flush seconds later, so created_at alone
  --                would mis-attribute spend across day boundaries.
  -- The Cost Engine prices on started_at and windows on created_at.
  created_at         timestamptz NOT NULL DEFAULT now(),
  started_at         timestamptz NULL,

  -- correlation --------------------------------------------------------------
  request_id         uuid        NOT NULL,
  -- F3: one student intent, which may span several server attempts. Stamped on
  -- EVERY row at flush time (it was previously on 2 of 9 site types, inside
  -- meta), so retry cost analysis covers background calls too.
  client_request_id  uuid        NULL,
  question_record_id uuid        NULL REFERENCES public.question_records(id) ON DELETE SET NULL,
  session_id         uuid        NULL,
  user_id            uuid        NULL,

  -- WHAT capability did the work (canonical, provider-independent) -----------
  service_code       text        NOT NULL,
  stage              text        NOT NULL,
  operation          text        NULL,

  -- HOW it was served (physical, may change over time) -----------------------
  provider           text        NOT NULL,
  model              text        NOT NULL,
  api_surface        text        NOT NULL DEFAULT 'default',

  -- metered usage, in units — the Cost Engine's input ------------------------
  units              jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- convenience mirrors of the two hottest units (not authoritative) ---------
  prompt_tokens      integer     NOT NULL DEFAULT 0,
  completion_tokens  integer     NOT NULL DEFAULT 0,

  -- outcome ------------------------------------------------------------------
  success            boolean     NOT NULL,
  http_status        smallint    NULL,
  error_code         text        NULL,
  latency_ms         integer     NULL,

  meta               jsonb       NULL,

  -- Shape guards. Deliberately NOT foreign keys to ai_catalog: telemetry is
  -- fire-and-forget, so a service_code emitted before its catalog row exists
  -- must still be recorded, not rejected (architecture §7.1). Validation is a
  -- soft check surfaced by owner_cost_health() in Phase 4.
  CONSTRAINT ai_model_calls_service_code_nonempty CHECK (length(service_code) > 0),
  CONSTRAINT ai_model_calls_stage_nonempty        CHECK (length(stage) > 0),
  CONSTRAINT ai_model_calls_provider_nonempty     CHECK (length(provider) > 0),
  CONSTRAINT ai_model_calls_model_nonempty        CHECK (length(model) > 0),
  CONSTRAINT ai_model_calls_units_is_object       CHECK (jsonb_typeof(units) = 'object'),
  CONSTRAINT ai_model_calls_tokens_nonneg         CHECK (prompt_tokens >= 0 AND completion_tokens >= 0),
  CONSTRAINT ai_model_calls_latency_nonneg        CHECK (latency_ms IS NULL OR latency_ms >= 0),

  -- F1: the idempotency key. This single constraint is what lets a failed flush
  -- be retried safely — the retry presents the same call_uids and Postgres
  -- rejects the ones already committed (the writer uses ON CONFLICT DO NOTHING).
  CONSTRAINT ai_model_calls_call_uid_key UNIQUE (call_uid)
);

COMMENT ON TABLE public.ai_model_calls IS
  'AI Economics Phase 3 — one row per upstream AI provider call. Usage only: contains no cost, price, currency or FX value, by design (INV-01). PII-free. Append-only. See docs/roadmap/ai-economics.md §7.';
COMMENT ON COLUMN public.ai_model_calls.call_uid IS
  'F1 — per-call identity, minted when the call is observed and re-presented unchanged on a retry. The UNIQUE constraint makes the write idempotent; the writer uses ON CONFLICT DO NOTHING so a retried flush commits only what did not land.';
COMMENT ON COLUMN public.ai_model_calls.started_at IS
  'F2 — the ECONOMIC clock: when the provider call began. created_at is the WRITE clock and can be seconds later for background calls. Price on started_at; window on created_at.';
COMMENT ON COLUMN public.ai_model_calls.request_id IS
  'One server invocation = one id. The join spine the Cost Allocation Engine groups on (Phase 4).';
COMMENT ON COLUMN public.ai_model_calls.client_request_id IS
  'F3 — one student intent, which may span several server attempts (a retry reuses it deliberately). Stamped on every row so retry cost analysis covers background calls, not just the two main-path ones.';
COMMENT ON COLUMN public.ai_model_calls.service_code IS
  'Canonical capability from ai_catalog.services — the stable identity. No FK: an unregistered code is recorded and flagged, never rejected.';
COMMENT ON COLUMN public.ai_model_calls.stage IS
  'Sub-role within the service: solver_a | solver_b | extract | rerun | tutor_main | verdict | question_detect | classify | resolve.';
COMMENT ON COLUMN public.ai_model_calls.operation IS
  'credit_costs.feature_name. DERIVED by the Edge Function from the request shape (image → CHAT_IMAGE, follow-up → CHAT_FOLLOWUP, else CHAT_TEXT); the function is not told which operation the client charged.';
COMMENT ON COLUMN public.ai_model_calls.units IS
  'Metered quantities by unit code: input_token, cached_input_token, output_token, and later image/request/second/page. The billing-model hinge — a new pricing shape is a new unit code, not a schema change.';
COMMENT ON COLUMN public.ai_model_calls.prompt_tokens IS
  'The provider''s raw prompt_tokens, which INCLUDES the cached prefix. units splits it: input_token + cached_input_token = prompt_tokens. units is authoritative for pricing.';
COMMENT ON COLUMN public.ai_model_calls.success IS
  'False rows are kept deliberately — a failed call still spends input tokens and latency (GAP-7). The 2026-06-23 OpenAI 429 outage produced exactly this shape.';

-- 2. INDEXES ------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS ai_model_calls_created_idx      ON public.ai_model_calls (created_at DESC);
-- F2: the Cost Engine prices on the economic clock, so it needs its own index.
CREATE INDEX IF NOT EXISTS ai_model_calls_started_idx      ON public.ai_model_calls (started_at DESC);
CREATE INDEX IF NOT EXISTS ai_model_calls_request_idx      ON public.ai_model_calls (request_id);
-- F3: retry analysis groups server attempts by student intent.
CREATE INDEX IF NOT EXISTS ai_model_calls_client_req_idx   ON public.ai_model_calls (client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_model_calls_question_idx     ON public.ai_model_calls (question_record_id);
CREATE INDEX IF NOT EXISTS ai_model_calls_user_created_idx ON public.ai_model_calls (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_model_calls_service_idx      ON public.ai_model_calls (service_code, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_model_calls_model_idx        ON public.ai_model_calls (provider, model, created_at DESC);

-- 3. ACCESS CONTROL + IMMUTABILITY --------------------------------------------
-- RLS on with no policies denies every non-bypassing role, matching the posture
-- chosen for ai_catalog in Phase 2. service_role (the Edge Function) and the
-- table owner bypass RLS, so the writer is unaffected.
--
-- Immutability (INV-15): UPDATE and DELETE are revoked from every client role
-- AND from service_role. A cost fact must never be rewritten by the same
-- credentials that write it. Retention deletion in Phase 8 runs as the table
-- owner, which these grants do not restrict.

ALTER TABLE public.ai_model_calls ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_model_calls FROM PUBLIC;
REVOKE ALL ON public.ai_model_calls FROM anon, authenticated;

GRANT INSERT, SELECT ON public.ai_model_calls TO service_role;
REVOKE UPDATE, DELETE ON public.ai_model_calls FROM service_role;

-- bigserial: the writer needs the sequence too.
GRANT USAGE, SELECT ON SEQUENCE public.ai_model_calls_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.ai_model_calls_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.ai_model_calls_id_seq FROM anon, authenticated;

-- ── Verification ────────────────────────────────────────────────────────────
--   psql "$SUPABASE_DB_URL" -f scripts/verify-ai-telemetry.sql
-- Every row must read PASS (one WARN is expected before the first student
-- question lands — see P3-08).
--
-- Quick look after the v90 deploy:
--   SELECT service_code, stage, provider, model, count(*),
--          sum(prompt_tokens) AS p_tok, sum(completion_tokens) AS c_tok,
--          count(*) FILTER (WHERE NOT success) AS failures,
--          round(avg(latency_ms)) AS avg_ms
--     FROM public.ai_model_calls
--    GROUP BY 1,2,3,4 ORDER BY 1,2;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- Nothing references this table in Phase 3:
--
--   DROP TABLE public.ai_model_calls;
--
-- Deploying v89 over v90 stops the writes without dropping anything, and is the
-- preferred first step — the table is inert when nothing writes to it. After
-- Phase 4 this is no longer true: cost_engine.cost_facts references
-- ai_model_calls(id), so drop the dependent objects first or roll back before
-- Phase 4.
-- ===========================================================================
