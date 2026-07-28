-- ===========================================================================
-- AI Economics · Phase 2 — AI Service Catalog
-- ===========================================================================
-- ⛔ NOT APPLIED. Requires explicit owner approval per CLAUDE.md §3.
--    To approve: review, move to supabase/migrations/, apply via the Dashboard
--    SQL Editor or `supabase db execute` (see docs/supabase-migrations.md —
--    `supabase db push` does not work on this project), then run
--    scripts/verify-ai-catalog.sql. Every row must read PASS.
--
-- Target project: igvkyxkmjnkzscqgommj
-- Architecture:   docs/roadmap/ai-economics.md §6 (frozen at r4, 2026-07-28)
-- Roadmap:        §14 Phase 2. Owner approved 2026-07-28, incl. Q9 decisions.
--
-- WHAT THIS IS
--   The canonical vocabulary of the platform's AI capabilities, and the
--   registry of which provider and model implements each one over time. It is
--   the abstraction that makes AI Economics provider-independent: a capability
--   ("OCR") is permanent, while its implementation ("openai/gpt-4o") is a
--   binding that may change at any time without changing the capability's
--   identity or breaking historical analytics.
--
-- WHAT THIS IS NOT
--   • Not a router. These tables DESCRIBE what ai-tutor already does; nothing
--     reads them at runtime. No production code path changes.
--   • Not pricing. No cost, price, currency, or FX lives here (INV-01/INV-02).
--     Rate cards arrive in Phase 4, keyed on provider+model, never on service.
--   • Not a dashboard. Nothing renders these tables until Phase 6.
--
-- RISK
--   Additive only. Creates one new schema and three new tables. Alters no
--   existing table, function, policy, or grant. Touches no student-facing path.
--   Rollback is a single DROP SCHEMA (see the end of this file).
--
-- IDEMPOTENT & CONVERGENT
--   Safe to run more than once. Tables use IF NOT EXISTS; every seed row is an
--   upsert on its natural key. Re-running converges to the same state and is a
--   no-op after the first successful apply.
--
-- ── Q9 decisions (owner, 2026-07-28) ──────────────────────────────────────
--   1. `tutor` stays a SINGLE canonical service. Main answer, follow-up, deep
--      explanation, and future tutoring stages are distinguished by `stage` on
--      the telemetry row, not by separate services. Preserving one business
--      capability avoids a premature split; if telemetry later shows the stages
--      need independent lifecycles they can be split without breaking
--      historical analytics (the service stays, stages become services and the
--      old rows keep resolving).
--   2. `vision` stays SEPARATE from `ocr`. Different capabilities, different
--      business value, different providers, different pricing models, and
--      different optimization paths — independent from the beginning.
-- ===========================================================================

BEGIN;

-- 1. SCHEMA ------------------------------------------------------------------
-- Deliberately NOT added to the PostgREST exposed-schema list. The browser must
-- never select from these tables; they are reached only through owner-gated
-- RPCs in `public` (Phase 4+). Architecture §3.2 layer 3.

CREATE SCHEMA IF NOT EXISTS ai_catalog;

COMMENT ON SCHEMA ai_catalog IS
  'AI Economics Phase 2 — canonical AI service catalog (capabilities, providers, bindings). Not exposed to PostgREST. Contains no pricing and no cost. See docs/roadmap/ai-economics.md §6.';

REVOKE ALL ON SCHEMA ai_catalog FROM PUBLIC;
REVOKE ALL ON SCHEMA ai_catalog FROM anon, authenticated;

-- 2. SERVICES — the canonical capability vocabulary ---------------------------
-- A service is a CAPABILITY, never a vendor. The test: if it could be served by
-- a different vendor tomorrow without the product changing meaning, it is a
-- service. `service_code` is permanent and is the identity the dashboard, the
-- Cost Engine, and every future analytic key on.

CREATE TABLE IF NOT EXISTS ai_catalog.services (
  service_code    text PRIMARY KEY,
  display_name    text        NOT NULL,
  category        text        NOT NULL,
  description     text        NULL,
  unit_of_work    text        NOT NULL,
  cost_target_usd numeric(12,6) NULL,
  active          boolean     NOT NULL DEFAULT true,
  sort_order      integer     NOT NULL DEFAULT 100,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_code_shape CHECK (service_code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT services_category_valid CHECK (category IN
    ('reasoning', 'verification', 'perception', 'computation', 'language', 'retrieval')),
  CONSTRAINT services_unit_valid CHECK (unit_of_work IN
    ('call', 'question', 'image', 'page', 'document')),
  CONSTRAINT services_cost_target_nonneg CHECK (cost_target_usd IS NULL OR cost_target_usd >= 0)
);

COMMENT ON TABLE  ai_catalog.services IS
  'Canonical AI capabilities. Permanent identities; implementations change via service_bindings.';
COMMENT ON COLUMN ai_catalog.services.service_code IS
  'Permanent capability id. Never renamed — every cost fact and analytic keys on this.';
COMMENT ON COLUMN ai_catalog.services.unit_of_work IS
  'The natural denominator for this capability''s cost-per-unit metric.';
COMMENT ON COLUMN ai_catalog.services.cost_target_usd IS
  'Owner-set optimization target per unit_of_work. NULL = no target (§15 Q10 — set from measured baselines after Phase 4, not from guesses).';
COMMENT ON COLUMN ai_catalog.services.active IS
  'False only when a capability is RETIRED. A registered-but-not-yet-implemented service stays active with no current binding; owner_cost_health() reports it as such (Phase 4).';

-- 3. PROVIDERS — vendors and runtimes ----------------------------------------

CREATE TABLE IF NOT EXISTS ai_catalog.providers (
  provider_code    text PRIMARY KEY,
  display_name     text        NOT NULL,
  kind             text        NOT NULL,
  default_currency text        NOT NULL DEFAULT 'USD',
  active           boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT providers_code_shape CHECK (provider_code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT providers_kind_valid CHECK (kind IN ('external_api', 'self_hosted', 'local_lib')),
  CONSTRAINT providers_currency_shape CHECK (default_currency ~ '^[A-Z]{3}$')
);

COMMENT ON TABLE ai_catalog.providers IS
  'Vendors and runtimes that can implement a capability. Registered on first use; adding one is a data change, never an architecture change (§18.3).';

-- 4. SERVICE BINDINGS — capability × implementation, over time ----------------
-- The thing that changes. Swapping a provider is: close the old binding
-- (effective_to), open a new one. Historical facts never move, and the
-- service-level cost series stays continuous across the swap — which is the
-- entire point of the catalog (§6.5).

CREATE TABLE IF NOT EXISTS ai_catalog.service_bindings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code    text        NOT NULL REFERENCES ai_catalog.services(service_code),
  provider_code   text        NOT NULL REFERENCES ai_catalog.providers(provider_code),
  model           text        NOT NULL,
  api_surface     text        NOT NULL DEFAULT 'default',
  binding_role    text        NOT NULL DEFAULT 'primary',
  stage_filter    text        NULL,
  effective_from  timestamptz NOT NULL,
  effective_to    timestamptz NULL,
  note            text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bindings_role_valid CHECK (binding_role IN
    ('primary', 'fallback', 'shadow', 'experiment')),
  CONSTRAINT bindings_window_sane CHECK (effective_to IS NULL OR effective_to > effective_from),
  -- Natural key. NULLS NOT DISTINCT (PG15+; this project runs 17.6) makes a NULL
  -- stage_filter collide with another NULL, so the upserts below are convergent
  -- instead of inserting a duplicate on every run.
  CONSTRAINT service_bindings_natural_key
    UNIQUE NULLS NOT DISTINCT
    (service_code, provider_code, model, api_surface, stage_filter, effective_from)
);

CREATE INDEX IF NOT EXISTS service_bindings_service_from_idx
  ON ai_catalog.service_bindings (service_code, effective_from DESC);
CREATE INDEX IF NOT EXISTS service_bindings_current_idx
  ON ai_catalog.service_bindings (service_code) WHERE effective_to IS NULL;

COMMENT ON TABLE  ai_catalog.service_bindings IS
  'Which provider + model implements a capability, over a time window. Descriptive in Phase 2 — nothing reads this at runtime.';
COMMENT ON COLUMN ai_catalog.service_bindings.stage_filter IS
  'Bind only a specific stage of the service (e.g. solver_b). NULL = applies to every stage.';
COMMENT ON COLUMN ai_catalog.service_bindings.binding_role IS
  'primary | fallback | shadow | experiment. Shadow/experiment let two implementations run for one capability and be compared on cost as well as accuracy.';
COMMENT ON COLUMN ai_catalog.service_bindings.effective_to IS
  'NULL = current. Closing a binding never rewrites history: facts keep the binding that was in force when the call happened.';

-- 5. ACCESS CONTROL — defence in depth ---------------------------------------
-- The schema is not exposed to PostgREST, so these tables are already
-- unreachable from the browser. RLS with no policies denies every non-bypassing
-- role as well, so a future accidental exposure fails closed rather than
-- leaking the catalog. Table owner and service_role are unaffected.

ALTER TABLE ai_catalog.services         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_catalog.providers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_catalog.service_bindings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA ai_catalog FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA ai_catalog FROM anon, authenticated;

-- 6. SEED — providers ---------------------------------------------------------
-- Only what the platform actually calls today. A new provider is one row, added
-- when it is first used (§13.2).

INSERT INTO ai_catalog.providers (provider_code, display_name, kind, default_currency, active)
VALUES ('openai', 'OpenAI', 'external_api', 'USD', true)
ON CONFLICT (provider_code) DO UPDATE
  SET display_name     = EXCLUDED.display_name,
      kind             = EXCLUDED.kind,
      default_currency = EXCLUDED.default_currency,
      active           = EXCLUDED.active;

-- 7. SEED — services ----------------------------------------------------------
-- Seven capabilities the platform runs today (sort_order 10–70), then five
-- registered ahead of implementation (100+). The registered-ahead rows are the
-- point of the catalog being data: they appear at zero cost from day one and
-- light up automatically when their telemetry arrives — no schema change, no
-- dashboard change.

INSERT INTO ai_catalog.services
  (service_code, display_name, category, unit_of_work, sort_order, description)
VALUES
  -- ── live today (see ai-tutor/index.ts call sites, architecture §5.2) ──────
  ('tutor',               'Tutor',               'reasoning',    'question', 10,
   'Generates the student-facing tutored answer. Stages: tutor_main, follow_up, deep_explain (Q9: one capability, many stages).'),
  ('solver',              'Solver',              'reasoning',    'question', 20,
   'Independent problem solvers used by the L3 verification pipeline. Stages: solver_a, solver_b.'),
  ('judge',               'Judge',               'verification', 'question', 30,
   'Adjudicates solver disagreement and confirms the tutored answer. Stage: verdict.'),
  ('ocr',                 'OCR',                 'perception',   'image',    40,
   'Extracts mathematical text from an uploaded image. Stages: extract, rerun (low-confidence second pass).'),
  ('vision',              'Vision',              'perception',   'image',    50,
   'Detects and separates multiple questions within an uploaded image. Stage: question_detect. Kept independent of OCR by owner decision (Q9).'),
  ('difficulty_detector', 'Difficulty Detector', 'reasoning',    'question', 60,
   'Classifies question difficulty tier. Runs in the background; adds no student latency. Stage: classify.'),
  ('reference_resolver',  'Reference Resolver',  'retrieval',    'question', 70,
   'Resolves a follow-up that refers to an earlier question in the session. Stage: resolve.'),

  -- ── registered ahead of implementation: no binding yet, zero cost ────────
  ('truth_engine',        'Truth Engine',        'verification', 'question', 100,
   'Future independent verification service. Registered ahead of implementation.'),
  ('sympy',               'SymPy',               'computation',  'call',     110,
   'Future symbolic-mathematics verification. Registered ahead of implementation.'),
  ('python',              'Python',              'computation',  'call',     120,
   'Future sandboxed numeric execution. Registered ahead of implementation.'),
  ('embedding',           'Embedding',           'retrieval',    'call',     130,
   'Future vector embeddings for retrieval. Registered ahead of implementation.'),
  ('translation',         'Translation',         'language',     'call',     140,
   'Future translation / localisation service. Registered ahead of implementation.')
ON CONFLICT (service_code) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      category     = EXCLUDED.category,
      unit_of_work = EXCLUDED.unit_of_work,
      sort_order   = EXCLUDED.sort_order,
      description  = EXCLUDED.description;
      -- cost_target_usd and active are deliberately NOT overwritten: they are
      -- owner-managed state, not seed data.

-- 8. SEED — bindings as production runs today --------------------------------
-- Source of truth: supabase/functions/ai-tutor/index.ts, call sites enumerated
-- in architecture §5.2. Nine bindings for seven services.
--
-- Two services carry TWO current primary bindings each. That is not a conflict:
-- ai-tutor picks the model by input modality at call time —
--   tutor              index.ts:3161  solveImages.length ? 'gpt-4o' : 'gpt-4o-mini'
--   reference_resolver index.ts:2501  parentHasImage    ? 'gpt-4o' : 'gpt-4o-mini'
-- Binding resolution matches on the model actually recorded in telemetry, so
-- each call resolves to exactly one binding (§6.4).
--
-- effective_from is the catalog creation date, not an invented historical date.
-- These bindings describe production as observed on 2026-07-28. Pre-catalog
-- history is deliberately not modelled: telemetry begins in Phase 3 and
-- pre-Phase-3 periods stay Blocked rather than estimated (INV-22/INV-23).

INSERT INTO ai_catalog.service_bindings
  (service_code, provider_code, model, api_surface, binding_role, stage_filter,
   effective_from, note)
VALUES
  ('tutor',               'openai', 'gpt-4o-mini', 'default', 'primary', NULL,
   TIMESTAMPTZ '2026-07-28 00:00:00+00', 'index.ts:3161 — text path (no images attached).'),
  ('tutor',               'openai', 'gpt-4o',      'default', 'primary', NULL,
   TIMESTAMPTZ '2026-07-28 00:00:00+00', 'index.ts:3161 — vision path (images attached).'),
  ('solver',              'openai', 'gpt-4o-mini', 'default', 'primary', NULL,
   TIMESTAMPTZ '2026-07-28 00:00:00+00', 'index.ts:1532 — both solver_a (temp 0.1) and solver_b (temp 0.3).'),
  ('judge',               'openai', 'gpt-4o',      'default', 'primary', NULL,
   TIMESTAMPTZ '2026-07-28 00:00:00+00', 'index.ts:1621 — upgraded from gpt-4o-mini in ai-tutor v80.'),
  ('ocr',                 'openai', 'gpt-4o',      'default', 'primary', NULL,
   TIMESTAMPTZ '2026-07-28 00:00:00+00', 'index.ts:1278 (extract) and :1323 (rerun). gpt-4o-mini dropped digits; vision accuracy required.'),
  ('vision',              'openai', 'gpt-4o',      'default', 'primary', NULL,
   TIMESTAMPTZ '2026-07-28 00:00:00+00', 'index.ts:1372 — multi-question image detection.'),
  ('difficulty_detector', 'openai', 'gpt-4o-mini', 'default', 'primary', NULL,
   TIMESTAMPTZ '2026-07-28 00:00:00+00', 'index.ts:933 — detector v2, background, max_tokens 10.'),
  ('reference_resolver',  'openai', 'gpt-4o-mini', 'default', 'primary', NULL,
   TIMESTAMPTZ '2026-07-28 00:00:00+00', 'index.ts:2501 — parent question had no image.'),
  ('reference_resolver',  'openai', 'gpt-4o',      'default', 'primary', NULL,
   TIMESTAMPTZ '2026-07-28 00:00:00+00', 'index.ts:2501 — parent question had an image.')
ON CONFLICT (service_code, provider_code, model, api_surface, stage_filter, effective_from)
DO UPDATE
  SET binding_role = EXCLUDED.binding_role,
      note         = EXCLUDED.note;
      -- effective_to is NOT overwritten: closing a binding is an owner action,
      -- and re-running this migration must never reopen a retired binding.

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--   psql "$SUPABASE_DB_URL" -f scripts/verify-ai-catalog.sql
-- Every row must read PASS. That script encodes the Phase 2 exit criteria from
-- architecture §14: every call site in §5.2 maps to exactly one seeded service
-- and exactly one current binding.
--
-- Quick look:
--   SELECT s.sort_order, s.service_code, s.display_name, s.category,
--          count(b.id) FILTER (WHERE b.effective_to IS NULL) AS current_bindings
--     FROM ai_catalog.services s
--     LEFT JOIN ai_catalog.service_bindings b USING (service_code)
--    GROUP BY 1,2,3,4 ORDER BY 1;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- Nothing outside this schema references it in Phase 2, so the rollback is
-- total and safe:
--
--   DROP SCHEMA ai_catalog CASCADE;
--
-- After Phase 4 this is no longer true — cost_engine.cost_facts references
-- service_bindings(id) — and a rollback would need to drop the dependent
-- objects first. Roll back before Phase 4 or not at all.
-- ===========================================================================
