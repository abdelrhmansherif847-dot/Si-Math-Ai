-- ===========================================================================
-- AI Economics — Phase 4: Cost Engine
-- ===========================================================================
-- STATUS: ✅ APPLIED to igvkyxkmjnkzscqgommj on 2026-07-31 (owner-approved,
--         CLAUDE.md §3), with four locked business decisions — review §11.
--
-- NOTE ON MIGRATION HISTORY. Production received this file and then
-- 20260731_aiecon_p4_fix_work_item_spans_requests.sql, which replaced
-- allocate() after the first production run hit a case the local fixture did
-- not contain (a work item spanning two requests). That fix is folded into
-- allocate() BELOW, so a fresh deploy from this file alone is already correct
-- and the fix migration replays as a harmless CREATE OR REPLACE.
--
-- Architecture: docs/roadmap/ai-economics.md §8 (frozen, r4).
-- Review:       docs/roadmap/phase-4-implementation-review.md
-- Verification: scripts/verify-cost-engine.sql
-- Target project: igvkyxkmjnkzscqgommj
--
-- WHAT THIS IS
--   The Cost Engine: the single source of truth for all AI cost calculations
--   (§8). It reads immutable usage telemetry (public.ai_model_calls, Phase 3)
--   and the canonical service catalog (ai_catalog, Phase 2), and produces two
--   grains of immutable cost fact:
--
--     Cost Calculation (§8.4–§8.7)  →  cost_facts          (one per CALL)
--     Cost Allocation  (§8.8)       →  question_cost_facts (one per WORK ITEM)
--
--   Nothing else in the platform is permitted to multiply a quantity by a
--   price (§8.10 rule 1, INV-02).
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   • Touches no production table. `ai_model_calls`, `question_records`,
--     `profiles` and the whole `ai_catalog` schema are READ ONLY here.
--   • Adds no cost/price/currency column to telemetry (INV-01, §8.10 rule 2).
--   • Deploys no Edge Function. No production code path changes.
--   • Knows nothing about revenue, credits, packages-as-revenue, profit or
--     margin. That is Economics (Phase 5, §9).
--   • Is not exposed to PostgREST. The `cost_engine` schema must NOT be added
--     to the exposed-schema list; all owner access is via the public
--     `owner_cost_*` RPCs at the end of this file.
--
-- TWO OWNER INPUTS ARE REQUIRED — see §9 SEEDS
--   1. Rate-card prices are seeded from OpenAI's published list prices and
--      MUST be verified against a real invoice before any figure is trusted.
--   2. No FX rate is seeded. EGP stays NULL and reports `no_fx` until the
--      owner inserts a real rate. Inventing one would violate INV-22/INV-23.
--   Both are corrected by data + a recompute, never by editing this file.
--
-- ROLLBACK
--   DROP SCHEMA cost_engine CASCADE;
--   DROP FUNCTION IF EXISTS public.owner_cost_metrics(text,date,date,boolean,integer);
--   DROP FUNCTION IF EXISTS public.owner_cost_service_breakdown(text,date,date);
--   DROP FUNCTION IF EXISTS public.owner_cost_facts(date,date,jsonb,integer);
--   DROP FUNCTION IF EXISTS public.owner_cost_health();
--   DROP FUNCTION IF EXISTS public.owner_cost_rate_cards(timestamptz);
--   DROP FUNCTION IF EXISTS public.owner_cost_reprice(jsonb);
--   No production data is destroyed by the rollback: every input this engine
--   reads lives outside the schema it drops.
-- ===========================================================================

-- Transaction control is left to the migration runner, matching the Phase 2
-- and Phase 3 migrations. apply_migration wraps this file in a transaction;
-- an explicit BEGIN here would nest inside it.

-- ── 1. Schema and hardening ───────────────────────────────────────────────
-- Same posture as ai_catalog (Phase 2) and ai_model_calls (Phase 3):
-- service-role only, never exposed to PostgREST, RLS on with no policies.
CREATE SCHEMA IF NOT EXISTS cost_engine;

COMMENT ON SCHEMA cost_engine IS
  'AI Economics Cost Engine (§8). Single source of truth for AI cost. Not '
  'exposed to PostgREST — owner access is via public.owner_cost_* RPCs only. '
  'Never referenced by econ objects except through published v_cost_* views '
  '(§8.10 rule 8, INV-05).';

REVOKE ALL ON SCHEMA cost_engine FROM PUBLIC;
REVOKE ALL ON SCHEMA cost_engine FROM anon, authenticated;
GRANT USAGE ON SCHEMA cost_engine TO service_role;

-- ── 2. Billing unit vocabulary (§8.3) ─────────────────────────────────────
-- A new billing model is DATA, not code (§8.10 rule 3): adding a unit here
-- plus rate_components is the entire change.
CREATE TABLE IF NOT EXISTS cost_engine.billing_units (
  unit_code    text PRIMARY KEY,
  display_name text NOT NULL,
  description  text NULL
);

-- ── 3. Rate cards (§8.4) ──────────────────────────────────────────────────
-- Deliberately NOT keyed on service_code: a price is a property of the
-- vendor's SKU, not of the capability using it (INV-14). One gpt-4o price
-- serves tutor, judge, ocr and vision alike.
CREATE TABLE IF NOT EXISTS cost_engine.rate_cards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code  text NOT NULL REFERENCES ai_catalog.providers(provider_code),
  model          text NOT NULL,
  api_surface    text NOT NULL DEFAULT 'default',
  billing_model  text NOT NULL,
  currency       text NOT NULL DEFAULT 'USD',
  effective_from timestamptz NOT NULL,
  effective_to   timestamptz NULL,
  version        text NOT NULL,
  source_note    text NULL,
  -- Where this price CAME FROM, not just what it is (§3.4, INV-22).
  --   'list_price'       — read off the vendor's public price page. A number we
  --                        believe, not one we have reconciled. Confidence class
  --                        MODELED: it must never render like an Actual figure.
  --   'invoice_verified' — reconciled against a real provider invoice. ACTUAL.
  -- This is snapshotted onto every cost fact, so a figure's trustworthiness
  -- travels with it instead of living only in this table's source_note.
  price_confidence text NOT NULL DEFAULT 'list_price',
  amortization_basis text NULL,          -- 'calls' | 'units' — for flat_month (§8.7)
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_code, model, api_surface, effective_from),
  CONSTRAINT rate_cards_billing_model_chk CHECK (billing_model IN
    ('per_token','per_request','per_image','per_minute','fixed','hybrid')),
  CONSTRAINT rate_cards_price_confidence_chk CHECK (price_confidence IN
    ('list_price','invoice_verified')),
  CONSTRAINT rate_cards_window_chk CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT rate_cards_amortization_chk CHECK (
    amortization_basis IS NULL OR amortization_basis IN ('calls','units'))
);

CREATE INDEX IF NOT EXISTS rate_cards_lookup_idx
  ON cost_engine.rate_cards (provider_code, model, api_surface, effective_from DESC);

CREATE TABLE IF NOT EXISTS cost_engine.rate_components (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id  uuid NOT NULL REFERENCES cost_engine.rate_cards(id) ON DELETE CASCADE,
  unit_code     text NOT NULL REFERENCES cost_engine.billing_units(unit_code),
  unit_price    numeric(16,8) NOT NULL,
  per_qty       numeric(16,4) NOT NULL DEFAULT 1,
  tier_from     numeric(16,4) NULL,
  tier_to       numeric(16,4) NULL,
  min_qty       numeric(16,4) NOT NULL DEFAULT 0,
  UNIQUE (rate_card_id, unit_code, tier_from),
  CONSTRAINT rate_components_per_qty_chk CHECK (per_qty > 0),
  CONSTRAINT rate_components_price_chk   CHECK (unit_price >= 0),
  CONSTRAINT rate_components_tier_chk    CHECK (tier_to IS NULL OR tier_from IS NULL OR tier_to > tier_from)
);

CREATE INDEX IF NOT EXISTS rate_components_card_idx
  ON cost_engine.rate_components (rate_card_id, unit_code, tier_from NULLS FIRST);

-- ── 4. Discounts (§8.6) ───────────────────────────────────────────────────
-- A discount is data. Provider volume deals, negotiated rates, promotional
-- credits and free-tier allowances all land here with no Economics change.
CREATE TABLE IF NOT EXISTS cost_engine.discount_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label           text NOT NULL,
  scope_provider  text NULL,
  scope_service   text NULL,
  scope_model     text NULL,
  scope_operation text NULL,
  discount_type   text NOT NULL,
  value           numeric(14,6) NOT NULL,
  unit_code       text NULL REFERENCES cost_engine.billing_units(unit_code),
  effective_from  timestamptz NOT NULL,
  effective_to    timestamptz NULL,
  priority        smallint NOT NULL DEFAULT 100,
  note            text NULL,
  CONSTRAINT discount_rules_type_chk CHECK (discount_type IN ('percent','fixed_usd','free_units')),
  CONSTRAINT discount_rules_free_units_chk CHECK (discount_type <> 'free_units' OR unit_code IS NOT NULL),
  CONSTRAINT discount_rules_window_chk CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- ── 5. FX (§8.7) ──────────────────────────────────────────────────────────
-- Policy: month-of-occurrence (§15 Q2 recommendation). Every fact in a
-- calendar month converts at that month's rate, so intra-month comparisons
-- are not distorted by currency noise. The policy is recorded in
-- engine_version, so changing it requires a recompute to apply retroactively.
CREATE TABLE IF NOT EXISTS cost_engine.fx_rates (
  rate_date  date PRIMARY KEY,
  usd_to_egp numeric(10,4) NOT NULL,
  source     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fx_rates_positive_chk CHECK (usd_to_egp > 0)
);

-- ── 6. Cost runs and per-call cost facts (§8.5) ───────────────────────────
CREATE TABLE IF NOT EXISTS cost_engine.cost_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_version text NOT NULL,
  window_from    timestamptz NOT NULL,
  window_to      timestamptz NOT NULL,
  reason         text NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz NULL,
  calls_priced   integer NULL,
  calls_unpriced integer NULL
);

CREATE TABLE IF NOT EXISTS cost_engine.cost_facts (
  id                 bigserial PRIMARY KEY,
  run_id             uuid NOT NULL REFERENCES cost_engine.cost_runs(id),
  call_id            bigint NOT NULL REFERENCES public.ai_model_calls(id),
  is_current         boolean NOT NULL DEFAULT true,

  occurred_at        timestamptz NOT NULL,

  -- CAPABILITY dimension (canonical, snapshotted)
  service_code       text NOT NULL,
  service_category   text NULL,
  stage              text NOT NULL,
  binding_id         uuid NULL REFERENCES ai_catalog.service_bindings(id),
  binding_status     text NOT NULL,

  -- IMPLEMENTATION dimension (physical, snapshotted)
  provider_code      text NOT NULL,
  model              text NOT NULL,
  api_surface        text NOT NULL,

  -- BUSINESS dimensions, SNAPSHOT at pricing time (never re-derived, INV-21)
  request_id         uuid NOT NULL,
  question_record_id uuid NULL,
  user_id            uuid NULL,
  is_internal        boolean NOT NULL,
  plan_code          text NULL,
  topic_id           text NULL,
  subtopic_id        text NULL,
  operation          text NULL,
  success            boolean NOT NULL,

  -- money
  pricing_status     text NOT NULL,
  gross_cost_usd     numeric(14,8) NULL,
  discount_usd       numeric(14,8) NULL,
  net_cost_usd       numeric(14,8) NULL,
  net_cost_egp       numeric(14,4) NULL,
  fx_rate            numeric(10,4) NULL,
  fx_rate_date       date NULL,

  -- provenance (INV-17)
  rate_card_id       uuid NULL REFERENCES cost_engine.rate_cards(id),
  -- Snapshotted from the rate card that priced this call. A fact carries its
  -- own trustworthiness so no consumer has to join back to the price book to
  -- discover that a number came from a list page rather than an invoice.
  price_confidence   text NULL,
  applied_discounts  uuid[] NULL,
  engine_version     text NOT NULL,
  computed_at        timestamptz NOT NULL DEFAULT now(),
  unpriced_reason    text NULL,

  CONSTRAINT cost_facts_pricing_status_chk CHECK (pricing_status IN ('priced','unpriced','zero_rated')),
  CONSTRAINT cost_facts_binding_status_chk CHECK (binding_status IN ('registered','unregistered','retired')),
  -- INV-23: unknown is NULL, never 0. An unpriced fact carries no USD figure.
  CONSTRAINT cost_facts_unpriced_null_chk CHECK (
    pricing_status <> 'unpriced' OR (net_cost_usd IS NULL AND gross_cost_usd IS NULL)),
  CONSTRAINT cost_facts_priced_notnull_chk CHECK (
    pricing_status = 'unpriced' OR net_cost_usd IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS cost_facts_current_call_uidx
  ON cost_engine.cost_facts (call_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS cost_facts_service_idx
  ON cost_engine.cost_facts (service_code, occurred_at DESC) WHERE is_current;
CREATE INDEX IF NOT EXISTS cost_facts_provider_model_idx
  ON cost_engine.cost_facts (provider_code, model, occurred_at DESC) WHERE is_current;
CREATE INDEX IF NOT EXISTS cost_facts_occurred_idx
  ON cost_engine.cost_facts (occurred_at DESC) WHERE is_current;
CREATE INDEX IF NOT EXISTS cost_facts_user_idx
  ON cost_engine.cost_facts (user_id, occurred_at DESC) WHERE is_current;
CREATE INDEX IF NOT EXISTS cost_facts_question_idx
  ON cost_engine.cost_facts (question_record_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS cost_facts_plan_idx
  ON cost_engine.cost_facts (plan_code, occurred_at DESC) WHERE is_current;
CREATE INDEX IF NOT EXISTS cost_facts_topic_idx
  ON cost_engine.cost_facts (topic_id, occurred_at DESC) WHERE is_current;
CREATE INDEX IF NOT EXISTS cost_facts_request_idx
  ON cost_engine.cost_facts (request_id) WHERE is_current;

-- ── 7. Allocation runs and per-work-item cost facts (§8.8.6) ──────────────
CREATE TABLE IF NOT EXISTS cost_engine.allocation_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_version text NOT NULL,
  window_from        timestamptz NOT NULL,
  window_to          timestamptz NOT NULL,
  reason             text NOT NULL,
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz NULL,
  work_items_written integer NULL,
  calls_allocated    integer NULL,
  conserved          boolean NULL,
  variance_usd       numeric(14,8) NULL
);

CREATE TABLE IF NOT EXISTS cost_engine.question_cost_facts (
  id                   bigserial PRIMARY KEY,
  allocation_run_id    uuid NOT NULL REFERENCES cost_engine.allocation_runs(id),
  is_current           boolean NOT NULL DEFAULT true,

  -- identity
  work_item_type       text NOT NULL DEFAULT 'question',
  work_item_id         text NOT NULL,
  parent_work_item_id  text NULL,
  request_id           uuid NULL,
  occurred_at          timestamptz NOT NULL,

  -- business dimensions, inherited from the contributing cost facts
  user_id              uuid NULL,
  is_internal          boolean NOT NULL,
  plan_code            text NULL,
  topic_id             text NULL,
  subtopic_id          text NULL,
  operation            text NULL,

  -- money
  direct_cost_usd      numeric(14,8) NULL,
  shared_cost_usd      numeric(14,8) NULL,
  total_cost_usd       numeric(14,8) NULL,
  total_cost_egp       numeric(14,4) NULL,
  thread_cost_usd      numeric(14,8) NULL,

  -- composition
  service_mix          jsonb NOT NULL,
  call_count           integer NOT NULL,
  priced_call_count    integer NOT NULL,
  unpriced_call_count  integer NOT NULL,
  cost_completeness    text NOT NULL,
  -- Worst price_confidence among the contributing cost facts. One list-priced
  -- call makes the whole work item's cost MODELED — confidence degrades to the
  -- weakest input, exactly as cost_completeness does (INV-22, INV-24).
  price_confidence     text NULL,

  -- provenance
  allocation_method    text NOT NULL,
  allocation_version   text NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT qcf_completeness_chk CHECK (cost_completeness IN ('complete','partial','unknown')),
  CONSTRAINT qcf_method_chk CHECK (allocation_method IN
    ('direct','shared_equal','shared_weighted','inherited','unattributed')),
  CONSTRAINT qcf_type_chk CHECK (work_item_type IN
    ('question','study_plan','mock_exam','focus_session','weakness_report','unattributed')),
  -- INV-23/INV-24: an item with nothing priced reports NULL, never 0.
  CONSTRAINT qcf_unknown_null_chk CHECK (
    cost_completeness <> 'unknown' OR total_cost_usd IS NULL),
  CONSTRAINT qcf_counts_chk CHECK (
    call_count = priced_call_count + unpriced_call_count)
);

CREATE UNIQUE INDEX IF NOT EXISTS qcf_current_item_uidx
  ON cost_engine.question_cost_facts (work_item_type, work_item_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS qcf_occurred_idx
  ON cost_engine.question_cost_facts (occurred_at DESC) WHERE is_current;
CREATE INDEX IF NOT EXISTS qcf_user_idx
  ON cost_engine.question_cost_facts (user_id, occurred_at DESC) WHERE is_current;
CREATE INDEX IF NOT EXISTS qcf_topic_idx
  ON cost_engine.question_cost_facts (topic_id, occurred_at DESC) WHERE is_current;
CREATE INDEX IF NOT EXISTS qcf_plan_idx
  ON cost_engine.question_cost_facts (plan_code, occurred_at DESC) WHERE is_current;
CREATE INDEX IF NOT EXISTS qcf_parent_idx
  ON cost_engine.question_cost_facts (parent_work_item_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS qcf_request_idx
  ON cost_engine.question_cost_facts (request_id) WHERE is_current;

-- ── 8. Immutability enforcement (INV-15) ──────────────────────────────────
-- §8.5 and §8.8.7 mandate that a fact is NEVER updated: corrections are new
-- runs, and `is_current` flips on the superseded row. That flip is itself an
-- UPDATE, so a blanket "no UPDATE" rule would forbid the mechanism the
-- architecture prescribes. This trigger states the rule precisely: is_current
-- may be flipped; every other column is frozen; nothing may be deleted.
--
-- This is a stronger guarantee than the CI grep INV-15 asks for, because it
-- holds against ad-hoc SQL and future code alike, not just reviewed diffs.
CREATE OR REPLACE FUNCTION cost_engine.freeze_fact()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'cost facts are immutable (INV-15): % rows may not be deleted; supersede with a new run instead',
      TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  -- Compare the OLD and NEW rows with is_current normalised to the same value.
  -- Any surviving difference is a mutation of a frozen column.
  IF to_jsonb(NEW) - 'is_current' IS DISTINCT FROM to_jsonb(OLD) - 'is_current' THEN
    RAISE EXCEPTION
      'cost facts are immutable (INV-15): only is_current may change on %; supersede with a new run instead',
      TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cost_facts_freeze ON cost_engine.cost_facts;
CREATE TRIGGER cost_facts_freeze
  BEFORE UPDATE OR DELETE ON cost_engine.cost_facts
  FOR EACH ROW EXECUTE FUNCTION cost_engine.freeze_fact();

DROP TRIGGER IF EXISTS question_cost_facts_freeze ON cost_engine.question_cost_facts;
CREATE TRIGGER question_cost_facts_freeze
  BEFORE UPDATE OR DELETE ON cost_engine.question_cost_facts
  FOR EACH ROW EXECUTE FUNCTION cost_engine.freeze_fact();

-- ── 9. SEEDS ──────────────────────────────────────────────────────────────

-- 9a. Billing units. The three token units are what Phase 3 telemetry emits
-- today; the rest are registered ahead so a new billing model needs no DDL.
INSERT INTO cost_engine.billing_units (unit_code, display_name, description) VALUES
  ('input_token',        'Input token',        'Uncached prompt tokens. With cached_input_token these sum to the provider''s prompt_tokens.'),
  ('cached_input_token', 'Cached input token', 'Prompt tokens served from the provider''s cached prefix, billed at a reduced rate.'),
  ('output_token',       'Output token',       'Completion tokens.'),
  ('image',              'Image',              'One image processed. For vision models that also bill tokens, add both components.'),
  ('request',            'Request',            'One API call, for per-request billing.'),
  ('second',             'Second',             'Audio/video duration. Price per 60 for per-minute vendors.'),
  ('page',               'Page',               'One page processed, for per-page OCR vendors.'),
  ('flat_month',         'Flat month',         'Subscription price amortized across the month per rate_cards.amortization_basis (§8.7).')
ON CONFLICT (unit_code) DO NOTHING;

-- 9b. Rate cards for the two models in production telemetry.
--
-- ⚠ OWNER VERIFICATION REQUIRED ⚠
-- These are OpenAI's PUBLISHED LIST PRICES. They are not read from an
-- invoice, and this engine has no way to confirm them. Before any figure
-- produced here is treated as financial truth, the owner must check them
-- against a real OpenAI bill. If they differ, the correction is data plus a
-- recompute — never an edit to this file:
--
--   UPDATE cost_engine.rate_cards SET effective_to = <when the old price ended>
--    WHERE version = 'openai-list-2026-07';
--   -- insert the corrected card + components, then:
--   SELECT cost_engine.recompute(<from>, <to>, 'rate_card_correction');
--
-- effective_from is the first Phase 3 telemetry row (2026-07-29 11:15 UTC),
-- rounded down to the hour. No call exists before it, so no call can fall
-- outside a rate window and become spuriously unpriced.
DO $seed$
DECLARE
  v_from   timestamptz := timestamptz '2026-07-29 11:00:00+00';
  v_4o     uuid;
  v_4omini uuid;
BEGIN
  -- gpt-4o
  SELECT id INTO v_4o FROM cost_engine.rate_cards
   WHERE provider_code='openai' AND model='gpt-4o' AND api_surface='default'
     AND effective_from = v_from;
  IF v_4o IS NULL THEN
    INSERT INTO cost_engine.rate_cards
      (provider_code, model, api_surface, billing_model, currency,
       effective_from, effective_to, version, price_confidence, source_note)
    VALUES
      ('openai','gpt-4o','default','per_token','USD',
       v_from, NULL, 'openai-list-2026-07', 'list_price',
       'OpenAI published list price. UNVERIFIED against an invoice — see the '
       'OWNER VERIFICATION block in 20260731_aiecon_p4_cost_engine.sql. '
       'price_confidence=list_price makes every fact priced from this card '
       'report confidence=modeled, so it can never render as an Actual figure.')
    RETURNING id INTO v_4o;

    INSERT INTO cost_engine.rate_components (rate_card_id, unit_code, unit_price, per_qty) VALUES
      (v_4o, 'input_token',        2.50000000, 1000000),
      (v_4o, 'cached_input_token', 1.25000000, 1000000),
      (v_4o, 'output_token',      10.00000000, 1000000);
  END IF;

  -- gpt-4o-mini
  SELECT id INTO v_4omini FROM cost_engine.rate_cards
   WHERE provider_code='openai' AND model='gpt-4o-mini' AND api_surface='default'
     AND effective_from = v_from;
  IF v_4omini IS NULL THEN
    INSERT INTO cost_engine.rate_cards
      (provider_code, model, api_surface, billing_model, currency,
       effective_from, effective_to, version, price_confidence, source_note)
    VALUES
      ('openai','gpt-4o-mini','default','per_token','USD',
       v_from, NULL, 'openai-list-2026-07', 'list_price',
       'OpenAI published list price. UNVERIFIED against an invoice — see the '
       'OWNER VERIFICATION block in 20260731_aiecon_p4_cost_engine.sql. '
       'price_confidence=list_price makes every fact priced from this card '
       'report confidence=modeled, so it can never render as an Actual figure.')
    RETURNING id INTO v_4omini;

    INSERT INTO cost_engine.rate_components (rate_card_id, unit_code, unit_price, per_qty) VALUES
      (v_4omini, 'input_token',        0.15000000, 1000000),
      (v_4omini, 'cached_input_token', 0.07500000, 1000000),
      (v_4omini, 'output_token',       0.60000000, 1000000);
  END IF;
END
$seed$;

-- 9c. FX — DELIBERATELY NOT SEEDED.
-- No USD→EGP rate is inserted because this engine has no trustworthy source
-- for one, and a guessed rate would be an invented financial figure
-- (INV-22). Until the owner inserts a real rate, net_cost_egp is NULL,
-- unpriced_reason is 'no_fx', and owner_cost_health() reports the missing
-- month. USD figures are unaffected and fully valid. To enable EGP:
--
--   INSERT INTO cost_engine.fx_rates (rate_date, usd_to_egp, source)
--   VALUES (date_trunc('month', now())::date, <real rate>, 'cbe');
--   SELECT cost_engine.recompute(<from>, <to>, 'fx_backfill');

-- ── 10. Pricing helpers (§8.6 steps 3–4) ──────────────────────────────────

-- Temporal rate-card resolution (§8.4). For a call at time T, choose the card
-- whose window contains T, preferring an exact api_surface match over the
-- 'default' surface, and on ties the latest effective_from.
CREATE OR REPLACE FUNCTION cost_engine.resolve_rate_card(
  p_provider    text,
  p_model       text,
  p_api_surface text,
  p_at          timestamptz
)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT rc.id
    FROM cost_engine.rate_cards rc
   WHERE rc.provider_code = p_provider
     AND rc.model         = p_model
     AND rc.api_surface  IN (p_api_surface, 'default')
     AND rc.effective_from <= p_at
     AND (rc.effective_to IS NULL OR p_at < rc.effective_to)
   ORDER BY (rc.api_surface = p_api_surface) DESC,
            rc.effective_from DESC,
            rc.id
   LIMIT 1;
$$;

-- Price one call's units against one rate card.
--
-- Returns gross cost, whether every component used priced at zero (which is
-- `zero_rated` — measured-free, NOT unknown), and the first unit code that
-- had no component (which forces `unpriced`, never a silent skip: an
-- unpriced unit would understate cost — §8.6 step 4).
--
-- Tier bands are graduated: the portion of the quantity inside each band is
-- priced at that band's rate. A card with a single NULL-tier component is
-- the ordinary flat case and falls out of the same expression.
--
-- All arithmetic is `numeric`. No float ever touches a money value (INV-19).
CREATE OR REPLACE FUNCTION cost_engine.price_units(
  p_rate_card_id uuid,
  p_units        jsonb,
  OUT gross_usd  numeric,
  OUT all_zero   boolean,
  OUT bad_unit   text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  r_unit     record;
  r_band     record;
  v_qty      numeric;
  v_billable numeric;
  v_unit_sum numeric;
  v_portion  numeric;
  v_min_qty  numeric;
  v_found    boolean;
BEGIN
  gross_usd := 0;
  all_zero  := true;
  bad_unit  := NULL;

  -- Deterministic order: unit codes ascending, bands ascending (INV-19).
  FOR r_unit IN
    SELECT key AS unit_code, (value #>> '{}')::numeric AS qty
      FROM jsonb_each(COALESCE(p_units, '{}'::jsonb))
     ORDER BY key
  LOOP
    v_qty := COALESCE(r_unit.qty, 0);

    SELECT COALESCE(max(rc.min_qty), 0), count(*) > 0
      INTO v_min_qty, v_found
      FROM cost_engine.rate_components rc
     WHERE rc.rate_card_id = p_rate_card_id
       AND rc.unit_code    = r_unit.unit_code;

    IF NOT v_found THEN
      -- §8.6 step 4: never silently skipped.
      bad_unit  := r_unit.unit_code;
      gross_usd := NULL;
      all_zero  := false;
      RETURN;
    END IF;

    v_billable := greatest(v_qty, v_min_qty);
    v_unit_sum := 0;

    FOR r_band IN
      SELECT rc.unit_price, rc.per_qty, rc.tier_from, rc.tier_to
        FROM cost_engine.rate_components rc
       WHERE rc.rate_card_id = p_rate_card_id
         AND rc.unit_code    = r_unit.unit_code
       ORDER BY COALESCE(rc.tier_from, 0), rc.id
    LOOP
      v_portion := greatest(
        0,
        least(v_billable, COALESCE(r_band.tier_to, v_billable))
          - COALESCE(r_band.tier_from, 0)
      );
      v_unit_sum := v_unit_sum + (v_portion * r_band.unit_price / r_band.per_qty);
      IF r_band.unit_price <> 0 THEN
        all_zero := false;
      END IF;
    END LOOP;

    gross_usd := gross_usd + v_unit_sum;
  END LOOP;

  gross_usd := round(gross_usd, 8);
END;
$$;

-- ── 11. run_pricing (§8.6) ────────────────────────────────────────────────
-- Deterministic, idempotent, asynchronous. Claims only calls with no CURRENT
-- fact, so re-running over the same window writes no new fact.
--
-- TWO CLOCKS (Phase 3 integrity review):
--   • WINDOWING uses created_at — the write clock. A call that started before
--     the window but landed inside it is still claimed exactly once, so late
--     background flushes are never skipped.
--   • PRICING and occurred_at use started_at — the economic clock, i.e. when
--     the money was actually spent (§8.5 "the economic date"). It is nullable
--     in Phase 3, so it falls back to created_at.
CREATE OR REPLACE FUNCTION cost_engine.run_pricing(
  p_from   timestamptz,
  p_to     timestamptz,
  p_reason text DEFAULT 'scheduled'
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = cost_engine, public, ai_catalog
AS $$
DECLARE
  c_engine_version constant text := 'ce-1.0.0';
  v_run_id   uuid;
  r          record;
  v_at       timestamptz;
  v_card     uuid;
  v_gross    numeric;
  v_zero     boolean;
  v_bad      text;
  v_status   text;
  v_reason   text;
  v_disc     numeric;
  v_disc_ids uuid[];
  v_running  numeric;
  v_step     numeric;
  r_disc     record;
  v_net      numeric;
  v_fx       numeric;
  v_fx_date  date;
  v_egp      numeric;
  v_conf     text;
  v_binding  uuid;
  v_bstatus  text;
  v_priced   integer := 0;
  v_unpriced integer := 0;
BEGIN
  INSERT INTO cost_engine.cost_runs (engine_version, window_from, window_to, reason)
  VALUES (c_engine_version, p_from, p_to, p_reason)
  RETURNING id INTO v_run_id;

  FOR r IN
    SELECT c.*,
           COALESCE(c.started_at, c.created_at) AS economic_at,
           s.category                           AS service_category,
           q.topic_id                           AS q_topic_id,
           q.subtopic_id                        AS q_subtopic_id,
           COALESCE(p.role IN ('admin','super_admin','owner'), false)
             OR COALESCE(p.is_admin, false)     AS is_internal,
           p.plan_code                          AS plan_code
      FROM public.ai_model_calls c
      LEFT JOIN cost_engine.cost_facts f
             ON f.call_id = c.id AND f.is_current
      LEFT JOIN ai_catalog.services s   ON s.service_code = c.service_code
      LEFT JOIN public.question_records q ON q.id = c.question_record_id
      LEFT JOIN public.profiles p       ON p.id = c.user_id
     WHERE c.created_at >= p_from
       AND c.created_at <  p_to
       AND f.id IS NULL
     ORDER BY c.id
  LOOP
    v_at := r.economic_at;

    -- (b) Resolve binding from the catalog AT THE CALL'S TIME (§6.4).
    -- Never blocking: an unregistered binding still prices (INV-26).
    SELECT b.id INTO v_binding
      FROM ai_catalog.service_bindings b
     WHERE b.service_code  = r.service_code
       AND b.provider_code = r.provider
       AND b.model         = r.model
       AND b.api_surface   = r.api_surface
       AND (b.stage_filter IS NULL OR b.stage_filter = r.stage)
       AND b.effective_from <= v_at
       AND (b.effective_to IS NULL OR v_at < b.effective_to)
     ORDER BY (b.stage_filter IS NOT NULL) DESC, b.effective_from DESC, b.id
     LIMIT 1;

    IF v_binding IS NOT NULL THEN
      v_bstatus := 'registered';
    ELSIF EXISTS (
      SELECT 1 FROM ai_catalog.service_bindings b
       WHERE b.service_code = r.service_code AND b.provider_code = r.provider
         AND b.model = r.model AND b.api_surface = r.api_surface
         AND b.effective_to IS NOT NULL AND b.effective_to <= v_at
    ) THEN
      v_bstatus := 'retired';
    ELSE
      v_bstatus := 'unregistered';
    END IF;

    -- (c) Resolve rate card.
    v_card    := cost_engine.resolve_rate_card(r.provider, r.model, r.api_surface, v_at);
    v_conf    := NULL;
    v_gross   := NULL; v_zero := false; v_bad := NULL;
    v_disc    := NULL; v_disc_ids := NULL; v_net := NULL;
    v_fx      := NULL; v_fx_date := NULL; v_egp := NULL;
    v_reason  := NULL;

    IF v_card IS NULL THEN
      v_status := 'unpriced';
      v_reason := 'no_rate_card';
    ELSE
      SELECT rc.price_confidence INTO v_conf
        FROM cost_engine.rate_cards rc WHERE rc.id = v_card;

      -- (d) Price units.
      SELECT pu.gross_usd, pu.all_zero, pu.bad_unit
        INTO v_gross, v_zero, v_bad
        FROM cost_engine.price_units(v_card, r.units) pu;

      IF v_bad IS NOT NULL THEN
        v_status := 'unpriced';
        v_reason := 'unknown_unit';
        v_gross  := NULL;
      ELSE
        -- (e) Discounts, applied SEQUENTIALLY in ascending priority (§8.6
        -- step 5). Order matters and is recorded: a 10% rule followed by a
        -- $1 rule is not the same money as the reverse, so this is a loop
        -- over the running remainder, not a sum of independent reductions.
        v_disc     := 0;
        v_disc_ids := NULL;
        v_running  := v_gross;

        FOR r_disc IN
          SELECT d.id, d.discount_type, d.value
            FROM cost_engine.discount_rules d
           WHERE (d.scope_provider  IS NULL OR d.scope_provider  = r.provider)
             AND (d.scope_service   IS NULL OR d.scope_service   = r.service_code)
             AND (d.scope_model     IS NULL OR d.scope_model     = r.model)
             AND (d.scope_operation IS NULL OR d.scope_operation = r.operation)
             AND d.effective_from <= v_at
             AND (d.effective_to IS NULL OR v_at < d.effective_to)
           ORDER BY d.priority, d.id
        LOOP
          v_step := CASE r_disc.discount_type
                      WHEN 'percent'   THEN v_running * r_disc.value / 100
                      WHEN 'fixed_usd' THEN r_disc.value
                      ELSE 0   -- 'free_units' is applied inside pricing; see G2
                    END;
          v_step     := least(greatest(v_step, 0), v_running);   -- never negative, never below zero net
          v_running  := v_running - v_step;
          v_disc     := v_disc + v_step;
          v_disc_ids := array_append(COALESCE(v_disc_ids, ARRAY[]::uuid[]), r_disc.id);
        END LOOP;

        v_disc := round(v_disc, 8);

        -- (f) Net, floored at 0.
        v_net    := greatest(round(v_gross - v_disc, 8), 0);
        v_status := CASE WHEN v_zero THEN 'zero_rated' ELSE 'priced' END;

        -- (g) FX — month-of-occurrence policy (§8.7).
        SELECT fx.usd_to_egp, fx.rate_date
          INTO v_fx, v_fx_date
          FROM cost_engine.fx_rates fx
         WHERE fx.rate_date = date_trunc('month', v_at)::date;

        IF v_fx IS NULL THEN
          v_reason := 'no_fx';          -- USD stays valid; EGP is NULL (§8.6 step 7)
        ELSE
          v_egp := round(v_net * v_fx, 4);
        END IF;
      END IF;
    END IF;

    IF v_status = 'unpriced' THEN
      v_unpriced := v_unpriced + 1;
    ELSE
      v_priced := v_priced + 1;
    END IF;

    -- (h)+(i) Snapshot every dimension and write the fact.
    INSERT INTO cost_engine.cost_facts (
      run_id, call_id, occurred_at,
      service_code, service_category, stage, binding_id, binding_status,
      provider_code, model, api_surface,
      request_id, question_record_id, user_id, is_internal, plan_code,
      topic_id, subtopic_id, operation, success,
      pricing_status, gross_cost_usd, discount_usd, net_cost_usd,
      net_cost_egp, fx_rate, fx_rate_date,
      rate_card_id, price_confidence, applied_discounts, engine_version, unpriced_reason
    ) VALUES (
      v_run_id, r.id, v_at,
      r.service_code, r.service_category, r.stage, v_binding, v_bstatus,
      r.provider, r.model, r.api_surface,
      r.request_id, r.question_record_id, r.user_id, r.is_internal, r.plan_code,
      r.q_topic_id, r.q_subtopic_id, r.operation, r.success,
      v_status, v_gross, v_disc, v_net,
      v_egp, v_fx, v_fx_date,
      v_card, v_conf, v_disc_ids, c_engine_version, v_reason
    );
  END LOOP;

  UPDATE cost_engine.cost_runs
     SET finished_at = now(), calls_priced = v_priced, calls_unpriced = v_unpriced
   WHERE id = v_run_id;

  RETURN v_run_id;
END;
$$;

-- ── 12. allocate (§8.8) — the Cost Allocation Engine ──────────────────────
-- Performs NO pricing math (INV-06, §8.10 rule 14). It only redistributes
-- amounts run_pricing already computed.
--
-- WORK-ITEM RESOLUTION
--   The work items of a request are the distinct question_record_ids among
--   its calls. Then:
--     • a call tagged with a question       → `direct` to that work item
--     • an untagged call, request has N≥2   → `shared_equal` across the N
--     • an untagged call, request has N=1   → the whole cost to that one item
--     • an untagged call, request has N=0   → `unattributed` bucket keyed by
--                                             request_id, never dropped
--
-- WHOLE-WORK-ITEM RECOMPUTE
--   The window selects which work items are AFFECTED, but each affected item
--   is then recomputed from ALL of its current cost facts, not just those
--   inside the window. Without this, a late background call would produce a
--   work-item fact holding only part of the item's cost. This makes the
--   conservation assertion a statement about the affected items' full call
--   set — a strictly stronger claim than §8.8.5's per-window equality, which
--   verify-cost-engine.sql checks separately over all time.
--
-- LARGEST REMAINDER
--   A shared amount is split into N parts at 1e-8 granularity: each part gets
--   floor(total/N), and the leftover ulps go to the lowest work_item_ids.
--   The parts therefore sum to the original EXACTLY, with no float drift and
--   a deterministic tie-break (§8.8.4, INV-19).
CREATE OR REPLACE FUNCTION cost_engine.allocate(
  p_from   timestamptz,
  p_to     timestamptz,
  p_reason text DEFAULT 'scheduled'
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = cost_engine, public, ai_catalog
AS $$
DECLARE
  -- 1.0.1: a work item is a QUESTION and may span requests (see the fix
  -- migration 20260731_aiecon_p4_fix_work_item_spans_requests.sql).
  c_alloc_version constant text := 'alloc-1.0.1';
  v_run_id    uuid;
  v_items     integer := 0;
  v_calls     integer := 0;
  v_allocated numeric;
  v_priced    numeric;
  v_variance  numeric;
BEGIN
  INSERT INTO cost_engine.allocation_runs
    (allocation_version, window_from, window_to, reason)
  VALUES (c_alloc_version, p_from, p_to, p_reason)
  RETURNING id INTO v_run_id;

  -- ON COMMIT DROP is not enough: the determinism proof calls allocate()
  -- twice inside ONE transaction, and the second call would collide with the
  -- first call's still-live temp tables.
  DROP TABLE IF EXISTS _alloc_reqs;
  DROP TABLE IF EXISTS _alloc_scope;
  DROP TABLE IF EXISTS _alloc_items;
  DROP TABLE IF EXISTS _alloc_shared;
  DROP TABLE IF EXISTS _alloc_ranked;

  -- A WORK ITEM CAN SPAN REQUESTS. `reference_resolver` resolves a follow-up
  -- against an EARLIER question (§8.8.1), so one question_record_id legitimately
  -- accumulates cost from several request_ids, minutes apart. Scoping by the
  -- window's requests alone would therefore recompute a work item from only
  -- part of its calls.
  --
  -- So the scope is the TRANSITIVE CLOSURE: start from the requests the window
  -- touched, pull in every request that shares a work item with them, and
  -- repeat to a fixed point. UNION (not UNION ALL) terminates the recursion.
  -- This makes each affected work item whole, which is what the conservation
  -- assertion below is a statement about.
  CREATE TEMP TABLE _alloc_reqs ON COMMIT DROP AS
  WITH RECURSIVE seed AS (
    SELECT DISTINCT f.request_id
      FROM cost_engine.cost_facts f
      JOIN public.ai_model_calls c ON c.id = f.call_id
     WHERE f.is_current
       AND c.created_at >= p_from
       AND c.created_at <  p_to
  ),
  closure AS (
    SELECT s.request_id FROM seed s
    UNION
    SELECT f2.request_id
      FROM closure cl
      JOIN cost_engine.cost_facts f1
        ON f1.is_current AND f1.request_id = cl.request_id
       AND f1.question_record_id IS NOT NULL
      JOIN cost_engine.cost_facts f2
        ON f2.is_current AND f2.question_record_id = f1.question_record_id
  )
  SELECT DISTINCT request_id FROM closure;

  CREATE TEMP TABLE _alloc_scope ON COMMIT DROP AS
  SELECT f.*
    FROM cost_engine.cost_facts f
   WHERE f.is_current
     AND f.request_id IN (SELECT request_id FROM _alloc_reqs);

  -- Work items per request, and each request's shared (untagged) cost.
  CREATE TEMP TABLE _alloc_items ON COMMIT DROP AS
  SELECT DISTINCT
         s.request_id,
         s.question_record_id::text AS work_item_id
    FROM _alloc_scope s
   WHERE s.question_record_id IS NOT NULL;

  CREATE TEMP TABLE _alloc_shared ON COMMIT DROP AS
  SELECT s.request_id,
         round(COALESCE(sum(s.net_cost_usd), 0), 8) AS shared_usd,
         round(COALESCE(sum(s.net_cost_egp), 0), 4) AS shared_egp,
         count(*)                                   AS shared_calls,
         count(*) FILTER (WHERE s.pricing_status = 'unpriced') AS shared_unpriced,
         max(s.price_confidence)                    AS shared_conf
    FROM _alloc_scope s
   WHERE s.question_record_id IS NULL
   GROUP BY s.request_id;

  -- Rank work items within a request so the largest-remainder tie-break is
  -- deterministic: ascending work_item_id, exactly as §8.8.4 requires.
  CREATE TEMP TABLE _alloc_ranked ON COMMIT DROP AS
  SELECT i.request_id,
         i.work_item_id,
         row_number() OVER (PARTITION BY i.request_id ORDER BY i.work_item_id) AS rn,
         count(*)     OVER (PARTITION BY i.request_id)                          AS n_items
    FROM _alloc_items i;

  -- ── Supersede the previous facts for every item this run rewrites ───────
  UPDATE cost_engine.question_cost_facts q
     SET is_current = false
   WHERE q.is_current
     AND (
       (q.work_item_type = 'question'
        AND q.work_item_id IN (SELECT work_item_id FROM _alloc_ranked))
       OR
       (q.work_item_type = 'unattributed'
        AND q.work_item_id IN (
              SELECT sh.request_id::text FROM _alloc_shared sh
               WHERE NOT EXISTS (SELECT 1 FROM _alloc_ranked r WHERE r.request_id = sh.request_id)))
     );

  -- ── Question work items: direct cost + share of the request's shared cost ─
  WITH direct AS (
    -- Grouped by question ALONE. A question is the work item; the request that
    -- happened to carry a given call is not part of its identity. Grouping by
    -- (question, request) emitted one row per request and collided with the
    -- one-current-fact-per-work-item unique index the moment a follow-up
    -- resolved against an earlier question.
    SELECT s.question_record_id::text                        AS work_item_id,
           -- The ORIGINATING request: earliest call, ties broken by id so the
           -- pick is deterministic. v_cost_by_request therefore attributes a
           -- work item to the request that created it, not to every request
           -- that later touched it.
           (array_agg(s.request_id ORDER BY s.occurred_at, s.id))[1] AS request_id,
           min(s.occurred_at)                                AS occurred_at,
           round(COALESCE(sum(s.net_cost_usd), 0), 8)        AS direct_usd,
           round(COALESCE(sum(s.net_cost_egp), 0), 4)        AS direct_egp,
           count(*)                                          AS call_count,
           count(*) FILTER (WHERE s.pricing_status <> 'unpriced') AS priced_count,
           count(*) FILTER (WHERE s.pricing_status =  'unpriced') AS unpriced_count,
           count(*) FILTER (WHERE s.net_cost_usd IS NOT NULL)     AS costed_count,
           -- Business dimensions inherited from the contributing facts. min()
           -- over a single work item's calls is a stable pick, and every call
           -- of one question carries the same user/plan/topic by construction.
           min(s.user_id::text)::uuid                        AS user_id,
           bool_or(s.is_internal)                            AS is_internal,
           min(s.plan_code)                                  AS plan_code,
           min(s.topic_id)                                   AS topic_id,
           min(s.subtopic_id)                                AS subtopic_id,
           min(s.operation)                                  AS operation,
           -- max() picks the WORST confidence: 'list_price' > 'invoice_verified'
           -- alphabetically, so one unverified price taints the work item.
           max(s.price_confidence)                           AS price_confidence
      FROM _alloc_scope s
     WHERE s.question_record_id IS NOT NULL
     GROUP BY s.question_record_id
  ),
  direct_mix AS (
    SELECT s.question_record_id::text AS work_item_id,
           jsonb_object_agg(s.service_code, s.c ORDER BY s.service_code) AS mix
      FROM (
        SELECT s2.question_record_id, s2.service_code,
               round(sum(s2.net_cost_usd), 8) AS c
          FROM _alloc_scope s2
         WHERE s2.question_record_id IS NOT NULL
         GROUP BY s2.question_record_id, s2.service_code
      ) s
     GROUP BY s.question_record_id
  ),
  -- Per (request, work item): this item's share of THAT request's shared cost,
  -- by largest remainder. Unchanged in substance — the split is still a
  -- property of one request.
  per_request_share AS (
    SELECT r.work_item_id,
           r.rn,
           r.n_items,
           COALESCE(sh.shared_calls, 0)   AS shared_calls,
           COALESCE(sh.shared_unpriced,0) AS shared_unpriced,
           sh.shared_conf                 AS shared_conf,
           -- floor to 8dp, then hand out the remaining ulps to the lowest ids
           trunc(COALESCE(sh.shared_usd, 0) / r.n_items, 8)
             + CASE WHEN r.rn <= round((COALESCE(sh.shared_usd, 0)
                       - trunc(COALESCE(sh.shared_usd, 0) / r.n_items, 8) * r.n_items)
                       / 0.00000001)::bigint
                    THEN 0.00000001 ELSE 0 END               AS share_usd,
           trunc(COALESCE(sh.shared_egp, 0) / r.n_items, 4)
             + CASE WHEN r.rn <= round((COALESCE(sh.shared_egp, 0)
                       - trunc(COALESCE(sh.shared_egp, 0) / r.n_items, 4) * r.n_items)
                       / 0.0001)::bigint
                    THEN 0.0001 ELSE 0 END                   AS share_egp
      FROM _alloc_ranked r
      LEFT JOIN _alloc_shared sh ON sh.request_id = r.request_id
  ),
  -- Rolled up to the WORK ITEM. A question touched by two requests receives a
  -- share from each, so these must be summed rather than joined 1:1.
  split AS (
    SELECT p.work_item_id,
           sum(p.share_usd)       AS share_usd,
           sum(p.share_egp)       AS share_egp,
           sum(p.shared_calls)    AS shared_calls,
           sum(p.shared_unpriced) AS shared_unpriced,
           max(p.shared_conf)     AS shared_conf,
           max(p.n_items)         AS n_items
      FROM per_request_share p
     GROUP BY p.work_item_id
  )
  INSERT INTO cost_engine.question_cost_facts (
    allocation_run_id, work_item_type, work_item_id, parent_work_item_id,
    request_id, occurred_at, user_id, is_internal, plan_code, topic_id,
    subtopic_id, operation,
    direct_cost_usd, shared_cost_usd, total_cost_usd, total_cost_egp,
    thread_cost_usd, service_mix, call_count, priced_call_count,
    unpriced_call_count, cost_completeness, price_confidence,
    allocation_method, allocation_version
  )
  SELECT
    v_run_id,
    'question',
    d.work_item_id,
    -- parent_work_item_id: question_records carries no explicit parent link
    -- today, so this stays NULL rather than being guessed. `inherited` moves
    -- no cost (§8.8.4), so a NULL parent affects thread_cost only — never
    -- total_cost and never conservation. See the review doc, "Known gap G1".
    NULL,
    d.request_id,
    d.occurred_at,
    d.user_id,
    d.is_internal,
    d.plan_code,
    d.topic_id,
    d.subtopic_id,
    d.operation,
    CASE WHEN d.costed_count = 0 THEN NULL ELSE d.direct_usd END,
    CASE WHEN COALESCE(sp.shared_calls, 0) = 0 THEN NULL ELSE sp.share_usd END,
    CASE WHEN d.costed_count = 0 AND COALESCE(sp.shared_calls,0) = 0 THEN NULL
         ELSE round(d.direct_usd + COALESCE(sp.share_usd, 0), 8)
    END,
    CASE WHEN d.direct_egp IS NULL THEN NULL
         ELSE round(d.direct_egp + COALESCE(sp.share_egp, 0), 4)
    END,
    -- thread_cost = own cost until a parent link exists (G1). Recomputed as a
    -- descendant rollup the moment parent_work_item_id is populated.
    CASE WHEN d.costed_count = 0 AND COALESCE(sp.shared_calls,0) = 0 THEN NULL
         ELSE round(d.direct_usd + COALESCE(sp.share_usd, 0), 8)
    END,
    COALESCE(dm.mix, '{}'::jsonb),
    d.call_count + COALESCE(sp.shared_calls, 0),
    d.priced_count + COALESCE(sp.shared_calls, 0) - COALESCE(sp.shared_unpriced, 0),
    d.unpriced_count + COALESCE(sp.shared_unpriced, 0),
    CASE
      WHEN d.priced_count + COALESCE(sp.shared_calls,0) - COALESCE(sp.shared_unpriced,0) = 0 THEN 'unknown'
      WHEN d.unpriced_count + COALESCE(sp.shared_unpriced,0) > 0 THEN 'partial'
      ELSE 'complete'
    END,
    greatest(d.price_confidence, sp.shared_conf),
    CASE WHEN COALESCE(sp.n_items, 1) > 1 AND COALESCE(sp.shared_calls, 0) > 0
         THEN 'shared_equal' ELSE 'direct' END,
    c_alloc_version
  FROM direct d
  LEFT JOIN split      sp ON sp.work_item_id = d.work_item_id
  LEFT JOIN direct_mix dm ON dm.work_item_id = d.work_item_id;

  GET DIAGNOSTICS v_items = ROW_COUNT;

  -- ── Orphan bucket: requests that produced no work item ──────────────────
  -- Never dropped (§8.8.4 `unattributed`); silently discarding these would
  -- understate total cost.
  INSERT INTO cost_engine.question_cost_facts (
    allocation_run_id, work_item_type, work_item_id, parent_work_item_id,
    request_id, occurred_at, user_id, is_internal, plan_code, topic_id,
    subtopic_id, operation,
    direct_cost_usd, shared_cost_usd, total_cost_usd, total_cost_egp,
    thread_cost_usd, service_mix, call_count, priced_call_count,
    unpriced_call_count, cost_completeness, price_confidence,
    allocation_method, allocation_version
  )
  SELECT
    v_run_id, 'unattributed', s.request_id::text, NULL,
    s.request_id, min(s.occurred_at),
    min(s.user_id::text)::uuid, bool_or(s.is_internal), min(s.plan_code),
    min(s.topic_id), min(s.subtopic_id), min(s.operation),
    CASE WHEN count(*) FILTER (WHERE s.net_cost_usd IS NOT NULL) = 0
         THEN NULL ELSE round(COALESCE(sum(s.net_cost_usd), 0), 8) END,
    NULL,
    CASE WHEN count(*) FILTER (WHERE s.net_cost_usd IS NOT NULL) = 0
         THEN NULL ELSE round(COALESCE(sum(s.net_cost_usd), 0), 8) END,
    CASE WHEN count(*) FILTER (WHERE s.net_cost_egp IS NOT NULL) = 0
         THEN NULL ELSE round(COALESCE(sum(s.net_cost_egp), 0), 4) END,
    CASE WHEN count(*) FILTER (WHERE s.net_cost_usd IS NOT NULL) = 0
         THEN NULL ELSE round(COALESCE(sum(s.net_cost_usd), 0), 8) END,
    COALESCE(jsonb_object_agg(s.service_code, s.svc_cost ORDER BY s.service_code)
      FILTER (WHERE s.svc_cost IS NOT NULL), '{}'::jsonb),
    count(*),
    count(*) FILTER (WHERE s.pricing_status <> 'unpriced'),
    count(*) FILTER (WHERE s.pricing_status =  'unpriced'),
    CASE
      WHEN count(*) FILTER (WHERE s.pricing_status <> 'unpriced') = 0 THEN 'unknown'
      WHEN count(*) FILTER (WHERE s.pricing_status =  'unpriced') > 0 THEN 'partial'
      ELSE 'complete'
    END,
    max(s.price_confidence),
    'unattributed',
    c_alloc_version
  FROM (
    SELECT s2.*,
           sum(s2.net_cost_usd) OVER (PARTITION BY s2.request_id, s2.service_code) AS svc_cost
      FROM _alloc_scope s2
     WHERE s2.question_record_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM _alloc_ranked r WHERE r.request_id = s2.request_id)
  ) s
  GROUP BY s.request_id;

  GET DIAGNOSTICS v_calls = ROW_COUNT;
  v_items := v_items + v_calls;

  SELECT count(*) INTO v_calls FROM _alloc_scope;

  -- ── §8.8.5 CONSERVATION ASSERTION ───────────────────────────────────────
  -- Allocation may move cost between work items; it may never create or
  -- destroy it (INV-20). A mismatch RAISEs, the transaction rolls back, and
  -- the previous allocation stays current — fail-closed, so the dashboard
  -- shows slightly stale but internally consistent numbers rather than fresh
  -- inconsistent ones.
  SELECT COALESCE(sum(q.total_cost_usd), 0) INTO v_allocated
    FROM cost_engine.question_cost_facts q
   WHERE q.allocation_run_id = v_run_id;

  SELECT COALESCE(sum(s.net_cost_usd), 0) INTO v_priced
    FROM _alloc_scope s;

  v_variance := round(v_allocated - v_priced, 8);

  UPDATE cost_engine.allocation_runs
     SET finished_at = now(),
         work_items_written = v_items,
         calls_allocated = v_calls,
         conserved = (v_variance = 0),
         variance_usd = v_variance
   WHERE id = v_run_id;

  IF v_variance <> 0 THEN
    RAISE EXCEPTION
      'allocation conservation failed (INV-20): allocated % <> priced %, variance % USD',
      v_allocated, v_priced, v_variance
      USING ERRCODE = 'data_exception';
  END IF;

  RETURN v_run_id;
END;
$$;

-- ── 13. recompute (§8.6, §8.8.7) ──────────────────────────────────────────
-- Owner-initiated correction. Supersedes the current facts in the window and
-- reprices them under today's rate cards, discounts and FX, then re-allocates
-- the affected work items. Prior facts are never deleted — they stay for
-- audit with is_current = false.
CREATE OR REPLACE FUNCTION cost_engine.recompute(
  p_from   timestamptz,
  p_to     timestamptz,
  p_reason text DEFAULT 'rate_card_correction'
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = cost_engine, public, ai_catalog
AS $$
DECLARE
  v_run_id uuid;
BEGIN
  UPDATE cost_engine.cost_facts f
     SET is_current = false
   WHERE f.is_current
     AND f.call_id IN (
       SELECT c.id FROM public.ai_model_calls c
        WHERE c.created_at >= p_from AND c.created_at < p_to
     );

  v_run_id := cost_engine.run_pricing(p_from, p_to, p_reason);
  PERFORM cost_engine.allocate(p_from, p_to, 'reallocation');

  RETURN v_run_id;
END;
$$;

-- ── 14. Published views (§8.9) ────────────────────────────────────────────
-- Every rollup returns the SAME measure set, so the dashboard renders every
-- dimension with one component (§8.10 rule 11).

CREATE OR REPLACE VIEW cost_engine.v_cost_facts_current AS
  SELECT * FROM cost_engine.cost_facts WHERE is_current;

CREATE OR REPLACE VIEW cost_engine.v_question_cost_current AS
  SELECT * FROM cost_engine.question_cost_facts WHERE is_current;

-- Call-grain rollups — anything keyed on HOW the work was served.
CREATE OR REPLACE VIEW cost_engine.v_cost_by_service AS
  SELECT f.service_code                                        AS dimension_key,
         COALESCE(s.display_name, f.service_code)               AS display_name,
         COALESCE(f.service_category, s.category)               AS category,
         f.is_internal,
         f.occurred_at::date                                    AS occurred_on,
         sum(f.net_cost_usd)                                    AS total_cost_usd,
         sum(f.net_cost_egp)                                    AS total_cost_egp,
         count(*)                                               AS calls,
         count(DISTINCT f.request_id)                           AS requests,
         sum(COALESCE((c.units->>'input_token')::bigint,0)
           + COALESCE((c.units->>'cached_input_token')::bigint,0)
           + COALESCE((c.units->>'output_token')::bigint,0))    AS units,
         count(*) FILTER (WHERE f.pricing_status <> 'unpriced') AS priced_calls,
         count(*) FILTER (WHERE f.pricing_status =  'unpriced') AS unpriced_calls,
         round(100.0 * count(*) FILTER (WHERE f.pricing_status <> 'unpriced')
               / NULLIF(count(*),0), 2)                         AS coverage_pct,
         round(avg(c.latency_ms) FILTER (WHERE f.success))::integer AS avg_latency_ms,
         round(100.0 * count(*) FILTER (WHERE f.success)
               / NULLIF(count(*),0), 2)                         AS success_rate,
         sum(f.net_cost_usd) FILTER (WHERE NOT f.success)       AS failed_cost_usd,
         -- The target itself, NOT an over_target flag. This view is daily-grain,
         -- and comparing one day's spend to a target of unstated period would be
         -- a meaningless number. owner_cost_health() does the comparison over a
         -- summed window, where it means something.
         s.cost_target_usd
    FROM cost_engine.cost_facts f
    JOIN public.ai_model_calls c ON c.id = f.call_id
    LEFT JOIN ai_catalog.services s ON s.service_code = f.service_code
   WHERE f.is_current
   GROUP BY f.service_code, s.display_name, f.service_category, s.category,
            f.is_internal, f.occurred_at::date, s.cost_target_usd;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_provider AS
  SELECT f.provider_code AS dimension_key, f.is_internal, f.occurred_at::date AS occurred_on,
         sum(f.net_cost_usd) AS total_cost_usd, sum(f.net_cost_egp) AS total_cost_egp,
         count(*) AS calls, count(DISTINCT f.request_id) AS requests,
         count(*) FILTER (WHERE f.pricing_status <> 'unpriced') AS priced_calls,
         count(*) FILTER (WHERE f.pricing_status =  'unpriced') AS unpriced_calls,
         round(100.0 * count(*) FILTER (WHERE f.pricing_status <> 'unpriced')
               / NULLIF(count(*),0), 2) AS coverage_pct,
         round(100.0 * count(*) FILTER (WHERE f.success) / NULLIF(count(*),0), 2) AS success_rate
    FROM cost_engine.cost_facts f WHERE f.is_current
   GROUP BY f.provider_code, f.is_internal, f.occurred_at::date;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_model AS
  SELECT f.model AS dimension_key, f.provider_code, f.is_internal,
         f.occurred_at::date AS occurred_on,
         sum(f.net_cost_usd) AS total_cost_usd, sum(f.net_cost_egp) AS total_cost_egp,
         count(*) AS calls, count(DISTINCT f.request_id) AS requests,
         count(*) FILTER (WHERE f.pricing_status <> 'unpriced') AS priced_calls,
         count(*) FILTER (WHERE f.pricing_status =  'unpriced') AS unpriced_calls,
         round(100.0 * count(*) FILTER (WHERE f.pricing_status <> 'unpriced')
               / NULLIF(count(*),0), 2) AS coverage_pct,
         round(100.0 * count(*) FILTER (WHERE f.success) / NULLIF(count(*),0), 2) AS success_rate
    FROM cost_engine.cost_facts f WHERE f.is_current
   GROUP BY f.model, f.provider_code, f.is_internal, f.occurred_at::date;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_service_provider AS
  SELECT f.service_code, f.provider_code, f.is_internal, f.occurred_at::date AS occurred_on,
         sum(f.net_cost_usd) AS total_cost_usd, count(*) AS calls,
         count(*) FILTER (WHERE f.pricing_status <> 'unpriced') AS priced_calls,
         count(*) FILTER (WHERE f.pricing_status =  'unpriced') AS unpriced_calls
    FROM cost_engine.cost_facts f WHERE f.is_current
   GROUP BY f.service_code, f.provider_code, f.is_internal, f.occurred_at::date;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_service_model AS
  SELECT f.service_code, f.provider_code, f.model, f.is_internal,
         f.occurred_at::date AS occurred_on,
         sum(f.net_cost_usd) AS total_cost_usd, count(*) AS calls,
         count(*) FILTER (WHERE f.pricing_status <> 'unpriced') AS priced_calls,
         count(*) FILTER (WHERE f.pricing_status =  'unpriced') AS unpriced_calls
    FROM cost_engine.cost_facts f WHERE f.is_current
   GROUP BY f.service_code, f.provider_code, f.model, f.is_internal, f.occurred_at::date;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_stage AS
  SELECT f.service_code, f.stage AS dimension_key, f.is_internal,
         f.occurred_at::date AS occurred_on,
         sum(f.net_cost_usd) AS total_cost_usd, count(*) AS calls,
         count(*) FILTER (WHERE f.pricing_status <> 'unpriced') AS priced_calls,
         count(*) FILTER (WHERE f.pricing_status =  'unpriced') AS unpriced_calls
    FROM cost_engine.cost_facts f WHERE f.is_current
   GROUP BY f.service_code, f.stage, f.is_internal, f.occurred_at::date;

CREATE OR REPLACE VIEW cost_engine.v_cost_daily AS
  SELECT f.occurred_at::date AS occurred_on, f.is_internal,
         sum(f.net_cost_usd) AS total_cost_usd, sum(f.net_cost_egp) AS total_cost_egp,
         count(*) AS calls, count(DISTINCT f.request_id) AS requests,
         count(*) FILTER (WHERE f.pricing_status <> 'unpriced') AS priced_calls,
         count(*) FILTER (WHERE f.pricing_status =  'unpriced') AS unpriced_calls,
         round(100.0 * count(*) FILTER (WHERE f.pricing_status <> 'unpriced')
               / NULLIF(count(*),0), 2) AS coverage_pct
    FROM cost_engine.cost_facts f WHERE f.is_current
   GROUP BY f.occurred_at::date, f.is_internal;

-- Work-item-grain rollups — anything keyed on WHOSE work it was. These read
-- question_cost_facts because only those carry correctly-attributed shared
-- and parent/child cost (§8.9).
CREATE OR REPLACE VIEW cost_engine.v_cost_by_question AS
  SELECT q.work_item_id AS dimension_key, q.work_item_type, q.is_internal,
         q.occurred_at::date AS occurred_on,
         q.total_cost_usd, q.total_cost_egp, q.thread_cost_usd,
         q.service_mix, q.call_count, q.priced_call_count, q.unpriced_call_count,
         q.cost_completeness, q.topic_id, q.subtopic_id, q.plan_code,
         q.user_id, q.operation
    FROM cost_engine.question_cost_facts q WHERE q.is_current;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_request AS
  SELECT q.request_id AS dimension_key, q.is_internal, q.occurred_at::date AS occurred_on,
         sum(q.total_cost_usd) AS total_cost_usd, sum(q.total_cost_egp) AS total_cost_egp,
         sum(q.call_count) AS calls, count(*) AS work_items,
         sum(q.unpriced_call_count) AS unpriced_calls,
         -- max(), not min(): 'complete' < 'partial' < 'unknown' alphabetically,
         -- so max() surfaces the WORST completeness in the group. An aggregate
         -- containing one unpriced call must never render as complete (INV-24).
         max(q.cost_completeness) AS cost_completeness
    FROM cost_engine.question_cost_facts q WHERE q.is_current
   GROUP BY q.request_id, q.is_internal, q.occurred_at::date;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_student AS
  SELECT q.user_id AS dimension_key, q.is_internal, q.occurred_at::date AS occurred_on,
         sum(q.total_cost_usd) AS total_cost_usd, sum(q.total_cost_egp) AS total_cost_egp,
         count(*) AS work_items, sum(q.call_count) AS calls,
         sum(q.unpriced_call_count) AS unpriced_calls,
         -- max(), not min(): 'complete' < 'partial' < 'unknown' alphabetically,
         -- so max() surfaces the WORST completeness in the group. An aggregate
         -- containing one unpriced call must never render as complete (INV-24).
         max(q.cost_completeness) AS cost_completeness
    FROM cost_engine.question_cost_facts q WHERE q.is_current
   GROUP BY q.user_id, q.is_internal, q.occurred_at::date;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_lesson AS
  SELECT q.subtopic_id AS dimension_key, q.is_internal, q.occurred_at::date AS occurred_on,
         sum(q.total_cost_usd) AS total_cost_usd, count(*) AS work_items,
         sum(q.call_count) AS calls, sum(q.unpriced_call_count) AS unpriced_calls,
         -- max(), not min(): 'complete' < 'partial' < 'unknown' alphabetically,
         -- so max() surfaces the WORST completeness in the group. An aggregate
         -- containing one unpriced call must never render as complete (INV-24).
         max(q.cost_completeness) AS cost_completeness
    FROM cost_engine.question_cost_facts q WHERE q.is_current
   GROUP BY q.subtopic_id, q.is_internal, q.occurred_at::date;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_subject AS
  SELECT q.topic_id AS dimension_key, q.is_internal, q.occurred_at::date AS occurred_on,
         sum(q.total_cost_usd) AS total_cost_usd, count(*) AS work_items,
         sum(q.call_count) AS calls, sum(q.unpriced_call_count) AS unpriced_calls,
         -- max(), not min(): 'complete' < 'partial' < 'unknown' alphabetically,
         -- so max() surfaces the WORST completeness in the group. An aggregate
         -- containing one unpriced call must never render as complete (INV-24).
         max(q.cost_completeness) AS cost_completeness
    FROM cost_engine.question_cost_facts q WHERE q.is_current
   GROUP BY q.topic_id, q.is_internal, q.occurred_at::date;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_package AS
  SELECT q.plan_code AS dimension_key, q.is_internal, q.occurred_at::date AS occurred_on,
         sum(q.total_cost_usd) AS total_cost_usd, count(*) AS work_items,
         sum(q.call_count) AS calls, sum(q.unpriced_call_count) AS unpriced_calls,
         -- max(), not min(): 'complete' < 'partial' < 'unknown' alphabetically,
         -- so max() surfaces the WORST completeness in the group. An aggregate
         -- containing one unpriced call must never render as complete (INV-24).
         max(q.cost_completeness) AS cost_completeness
    FROM cost_engine.question_cost_facts q WHERE q.is_current
   GROUP BY q.plan_code, q.is_internal, q.occurred_at::date;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_operation AS
  SELECT q.operation AS dimension_key, q.is_internal, q.occurred_at::date AS occurred_on,
         sum(q.total_cost_usd) AS total_cost_usd, count(*) AS work_items,
         sum(q.call_count) AS calls, sum(q.unpriced_call_count) AS unpriced_calls,
         -- max(), not min(): 'complete' < 'partial' < 'unknown' alphabetically,
         -- so max() surfaces the WORST completeness in the group. An aggregate
         -- containing one unpriced call must never render as complete (INV-24).
         max(q.cost_completeness) AS cost_completeness
    FROM cost_engine.question_cost_facts q WHERE q.is_current
   GROUP BY q.operation, q.is_internal, q.occurred_at::date;

-- Engine self-report (§8.6 R9, INV-26).
CREATE OR REPLACE VIEW cost_engine.v_pricing_coverage AS
  SELECT
    (SELECT count(*) FROM public.ai_model_calls)                                    AS telemetry_calls,
    (SELECT count(*) FROM cost_engine.cost_facts WHERE is_current)                  AS current_facts,
    (SELECT count(*) FROM public.ai_model_calls c
       WHERE NOT EXISTS (SELECT 1 FROM cost_engine.cost_facts f
                          WHERE f.call_id = c.id AND f.is_current))                 AS unpriced_missing_fact,
    (SELECT count(*) FROM cost_engine.cost_facts
      WHERE is_current AND pricing_status = 'unpriced')                             AS unpriced_calls,
    (SELECT count(*) FROM cost_engine.cost_facts
      WHERE is_current AND binding_status <> 'registered')                          AS unregistered_bindings,
    (SELECT count(*) FROM cost_engine.cost_facts
      WHERE is_current AND unpriced_reason = 'no_fx')                               AS missing_fx_facts,
    (SELECT round(100.0 * count(*) FILTER (WHERE pricing_status <> 'unpriced')
                  / NULLIF(count(*),0), 2)
       FROM cost_engine.cost_facts WHERE is_current)                                AS coverage_pct,
    (SELECT round(100.0 * count(*) FILTER (WHERE binding_status = 'registered')
                  / NULLIF(count(*),0), 2)
       FROM cost_engine.cost_facts WHERE is_current)                                AS binding_resolution_pct;

-- ── 15. Owner-gated read RPCs (§8.9) ──────────────────────────────────────
-- All STABLE (INV-07: PostgreSQL refuses data modification inside them), all
-- SECURITY DEFINER, all gated at role `owner` (INV-10), all revoked from
-- PUBLIC so PostgREST cannot expose them to anon.
--
-- Internal traffic is EXCLUDED BY DEFAULT and never silently included
-- (INV-25): p_include_internal defaults to false on every function that has
-- the parameter.

CREATE OR REPLACE FUNCTION public.owner_cost_metrics(
  p_dimension        text    DEFAULT 'service',
  p_from             date    DEFAULT NULL,
  p_to               date    DEFAULT NULL,
  p_include_internal boolean DEFAULT false,
  p_limit            integer DEFAULT 100
)
RETURNS TABLE (
  dimension_key   text,
  display_name    text,
  total_cost_usd  numeric,
  total_cost_egp  numeric,
  calls           bigint,
  requests        bigint,
  work_items      bigint,
  priced_calls    bigint,
  unpriced_calls  bigint,
  coverage_pct    numeric,
  cost_share_pct  numeric,
  -- Confidence class of the MONEY in this row (§3.4, INV-22). 'actual' only
  -- when every contributing call was priced from an invoice-verified rate
  -- card; 'modeled' the moment any list price is involved. A consumer that
  -- renders 'modeled' identically to 'actual' is violating INV-22.
  confidence      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cost_engine, ai_catalog
AS $$
DECLARE
  v_from timestamptz := COALESCE(p_from, '-infinity'::date)::timestamptz;
  v_to   timestamptz := COALESCE(p_to + 1, 'infinity'::date)::timestamptz;
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_cost_metrics requires role owner'
      USING ERRCODE = '42501';
  END IF;

  IF p_dimension NOT IN ('daily','service','provider','model','service_provider',
                         'service_model','stage','request','question','student',
                         'lesson','subject','package','operation') THEN
    RAISE EXCEPTION 'unknown dimension: %', p_dimension USING ERRCODE = '22023';
  END IF;

  -- NOTE ON NAMING: every internal alias below is deliberately NOT one of this
  -- function's RETURNS TABLE column names, and every column reference is
  -- qualified. In PL/pgSQL the output column names are in scope as variables,
  -- so an unqualified `total_cost_usd` or `calls` inside the query resolves
  -- ambiguously and the function fails at runtime, not at creation time.
  RETURN QUERY
  WITH call_grain AS (
    SELECT CASE p_dimension
             WHEN 'daily'            THEN f.occurred_at::date::text
             WHEN 'service'          THEN f.service_code
             WHEN 'provider'         THEN f.provider_code
             WHEN 'model'            THEN f.model
             WHEN 'service_provider' THEN f.service_code || ' / ' || f.provider_code
             WHEN 'service_model'    THEN f.service_code || ' / ' || f.model
             WHEN 'stage'            THEN f.service_code || ' / ' || f.stage
           END              AS k,
           f.net_cost_usd     AS c_usd,
           f.net_cost_egp     AS c_egp,
           f.request_id       AS c_req,
           f.pricing_status   AS c_status,
           f.price_confidence AS c_conf
      FROM cost_engine.cost_facts f
     WHERE f.is_current
       AND f.occurred_at >= v_from AND f.occurred_at < v_to
       AND (p_include_internal OR NOT f.is_internal)
       AND p_dimension IN ('daily','service','provider','model',
                           'service_provider','service_model','stage')
  ),
  item_grain AS (
    SELECT CASE p_dimension
             WHEN 'request'   THEN q.request_id::text
             WHEN 'question'  THEN q.work_item_id
             WHEN 'student'   THEN q.user_id::text
             WHEN 'lesson'    THEN q.subtopic_id
             WHEN 'subject'   THEN q.topic_id
             WHEN 'package'   THEN q.plan_code
             WHEN 'operation' THEN q.operation
           END                   AS k,
           q.total_cost_usd      AS i_usd,
           q.total_cost_egp      AS i_egp,
           q.call_count          AS i_calls,
           q.priced_call_count   AS i_priced,
           q.unpriced_call_count AS i_unpriced,
           q.price_confidence    AS i_conf
      FROM cost_engine.question_cost_facts q
     WHERE q.is_current
       AND q.occurred_at >= v_from AND q.occurred_at < v_to
       AND (p_include_internal OR NOT q.is_internal)
       AND p_dimension IN ('request','question','student','lesson',
                           'subject','package','operation')
  ),
  unioned AS (
    SELECT cg.k                                                         AS u_key,
           sum(cg.c_usd)                                                AS u_usd,
           sum(cg.c_egp)                                                AS u_egp,
           count(*)::bigint                                             AS u_calls,
           count(DISTINCT cg.c_req)::bigint                             AS u_reqs,
           0::bigint                                                    AS u_items,
           count(*) FILTER (WHERE cg.c_status <> 'unpriced')::bigint     AS u_priced,
           count(*) FILTER (WHERE cg.c_status =  'unpriced')::bigint     AS u_unpriced,
           max(cg.c_conf)                                               AS u_conf
      FROM call_grain cg GROUP BY cg.k
    UNION ALL
    SELECT ig.k,
           sum(ig.i_usd),
           sum(ig.i_egp),
           sum(ig.i_calls)::bigint,
           0::bigint,
           count(*)::bigint,
           sum(ig.i_priced)::bigint,
           sum(ig.i_unpriced)::bigint,
           max(ig.i_conf)
      FROM item_grain ig GROUP BY ig.k
  )
  SELECT u.u_key,
         CASE WHEN p_dimension = 'service'
              THEN COALESCE(s.display_name, u.u_key) ELSE u.u_key END,
         u.u_usd, u.u_egp, u.u_calls, u.u_reqs, u.u_items, u.u_priced, u.u_unpriced,
         round(100.0 * u.u_priced / NULLIF(u.u_priced + u.u_unpriced, 0), 2),
         round(100.0 * u.u_usd / NULLIF(sum(u.u_usd) OVER (), 0), 2),
         CASE u.u_conf
           WHEN 'invoice_verified' THEN 'actual'
           WHEN 'list_price'       THEN 'modeled'
           ELSE NULL
         END
    FROM unioned u
    LEFT JOIN ai_catalog.services s
           ON p_dimension = 'service' AND s.service_code = u.u_key
   WHERE u.u_key IS NOT NULL
   ORDER BY u.u_usd DESC NULLS LAST, u.u_key
   LIMIT COALESCE(p_limit, 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_cost_service_breakdown(
  p_service_code     text,
  p_from             date    DEFAULT NULL,
  p_to               date    DEFAULT NULL,
  p_include_internal boolean DEFAULT false
)
RETURNS TABLE (
  level          text,
  service_code   text,
  provider_code  text,
  model          text,
  total_cost_usd numeric,
  calls          bigint,
  priced_calls   bigint,
  unpriced_calls bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cost_engine, ai_catalog
AS $$
DECLARE
  v_from timestamptz := COALESCE(p_from, '-infinity'::date)::timestamptz;
  v_to   timestamptz := COALESCE(p_to + 1, 'infinity'::date)::timestamptz;
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_cost_service_breakdown requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT f.* FROM cost_engine.cost_facts f
     WHERE f.is_current
       AND f.service_code = p_service_code
       AND f.occurred_at >= v_from AND f.occurred_at < v_to
       AND (p_include_internal OR NOT f.is_internal)
  )
  SELECT 'service'::text, s.service_code, NULL::text, NULL::text,
         sum(s.net_cost_usd), count(*)::bigint,
         count(*) FILTER (WHERE s.pricing_status <> 'unpriced')::bigint,
         count(*) FILTER (WHERE s.pricing_status =  'unpriced')::bigint
    FROM scoped s GROUP BY s.service_code
  UNION ALL
  SELECT 'provider'::text, s.service_code, s.provider_code, NULL::text,
         sum(s.net_cost_usd), count(*)::bigint,
         count(*) FILTER (WHERE s.pricing_status <> 'unpriced')::bigint,
         count(*) FILTER (WHERE s.pricing_status =  'unpriced')::bigint
    FROM scoped s GROUP BY s.service_code, s.provider_code
  UNION ALL
  SELECT 'model'::text, s.service_code, s.provider_code, s.model,
         sum(s.net_cost_usd), count(*)::bigint,
         count(*) FILTER (WHERE s.pricing_status <> 'unpriced')::bigint,
         count(*) FILTER (WHERE s.pricing_status =  'unpriced')::bigint
    FROM scoped s GROUP BY s.service_code, s.provider_code, s.model
  ORDER BY 1, 3 NULLS FIRST, 4 NULLS FIRST;
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_cost_facts(
  p_from    date    DEFAULT NULL,
  p_to      date    DEFAULT NULL,
  p_filters jsonb   DEFAULT '{}'::jsonb,
  p_limit   integer DEFAULT 200
)
RETURNS TABLE (
  call_id         bigint,
  occurred_at     timestamptz,
  service_code    text,
  stage           text,
  provider_code   text,
  model           text,
  operation       text,
  is_internal     boolean,
  pricing_status  text,
  gross_cost_usd  numeric,
  discount_usd    numeric,
  net_cost_usd    numeric,
  net_cost_egp    numeric,
  fx_rate         numeric,
  binding_status  text,
  rate_card_id    uuid,
  rate_card_ver   text,
  price_confidence text,
  applied_discounts uuid[],
  engine_version  text,
  unpriced_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cost_engine, ai_catalog
AS $$
DECLARE
  v_from timestamptz := COALESCE(p_from, '-infinity'::date)::timestamptz;
  v_to   timestamptz := COALESCE(p_to + 1, 'infinity'::date)::timestamptz;
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_cost_facts requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT f.call_id, f.occurred_at, f.service_code, f.stage, f.provider_code,
         f.model, f.operation, f.is_internal, f.pricing_status,
         f.gross_cost_usd, f.discount_usd, f.net_cost_usd, f.net_cost_egp,
         f.fx_rate, f.binding_status, f.rate_card_id, rc.version,
         f.price_confidence,
         f.applied_discounts, f.engine_version, f.unpriced_reason
    FROM cost_engine.cost_facts f
    LEFT JOIN cost_engine.rate_cards rc ON rc.id = f.rate_card_id
   WHERE f.is_current
     AND f.occurred_at >= v_from AND f.occurred_at < v_to
     AND (NOT (p_filters ? 'service_code')   OR f.service_code   = p_filters->>'service_code')
     AND (NOT (p_filters ? 'provider_code')  OR f.provider_code  = p_filters->>'provider_code')
     AND (NOT (p_filters ? 'model')          OR f.model          = p_filters->>'model')
     AND (NOT (p_filters ? 'pricing_status') OR f.pricing_status = p_filters->>'pricing_status')
     AND (COALESCE((p_filters->>'include_internal')::boolean, false) OR NOT f.is_internal)
   ORDER BY f.occurred_at DESC, f.call_id DESC
   LIMIT COALESCE(p_limit, 200);
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_cost_health()
RETURNS TABLE (
  metric text,
  value  text,
  detail text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_cost_health requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  -- Freshness: the lag the dashboard renders as "costs current as of HH:MM".
  SELECT 'freshness_lag'::text,
         COALESCE((
           SELECT to_char(
             (SELECT max(c.created_at) FROM public.ai_model_calls c)
             - (SELECT max(f2.occurred_at) FROM cost_engine.cost_facts f2 WHERE f2.is_current),
             'HH24:MI:SS')
         ), 'no facts'),
         'newest telemetry row minus newest priced fact'
  UNION ALL
  SELECT 'calls_awaiting_pricing',
         (SELECT count(*)::text FROM public.ai_model_calls c
           WHERE NOT EXISTS (SELECT 1 FROM cost_engine.cost_facts f
                              WHERE f.call_id = c.id AND f.is_current)),
         'telemetry rows with no current cost fact'
  UNION ALL
  -- Only facts that are ACTUALLY unpriced. A priced fact carrying
  -- unpriced_reason='no_fx' has a valid USD cost and merely lacks an EGP
  -- presentation figure (OWNER DECISION 2: USD is canonical, EGP is
  -- presentation only). Counting it here would report a presentation gap as a
  -- pricing failure and make coverage look broken when it is not.
  SELECT 'unpriced_' || COALESCE(f.unpriced_reason, 'none'),
         count(*)::text,
         'current facts by unpriced_reason (pricing failures only)'
    FROM cost_engine.cost_facts f
   WHERE f.is_current
     AND f.pricing_status = 'unpriced'
     AND f.unpriced_reason IS NOT NULL
   GROUP BY f.unpriced_reason
  UNION ALL
  -- Presentation-only gap, reported separately so it is never mistaken for a
  -- pricing failure. USD is unaffected.
  SELECT 'egp_unavailable_facts', count(*)::text,
         'priced facts with valid USD but no EGP (no FX rate for the month)'
    FROM cost_engine.cost_facts f
   WHERE f.is_current AND f.pricing_status <> 'unpriced' AND f.net_cost_egp IS NULL
  HAVING count(*) > 0
  UNION ALL
  SELECT 'binding_' || f.binding_status, count(*)::text, 'current facts by binding status'
    FROM cost_engine.cost_facts f WHERE f.is_current
   GROUP BY f.binding_status
  UNION ALL
  -- Services registered in the catalog with no active binding.
  SELECT 'service_no_active_binding', s.service_code, 'catalog service with no current binding'
    FROM ai_catalog.services s
   WHERE s.active
     AND NOT EXISTS (SELECT 1 FROM ai_catalog.service_bindings b
                      WHERE b.service_code = s.service_code
                        AND (b.effective_to IS NULL OR b.effective_to > now()))
  UNION ALL
  -- Models seen in telemetry with no rate card covering them.
  SELECT 'missing_rate_card', f.provider_code || '/' || f.model,
         'telemetry model with no rate card at call time'
    FROM cost_engine.cost_facts f
   WHERE f.is_current AND f.unpriced_reason = 'no_rate_card'
   GROUP BY f.provider_code, f.model
  UNION ALL
  -- Months with facts but no FX rate (§8.7). EGP is NULL for these.
  SELECT 'missing_fx_month',
         to_char(date_trunc('month', f.occurred_at), 'YYYY-MM'),
         'facts exist for this month but no usd_to_egp rate is registered'
    FROM cost_engine.cost_facts f
   WHERE f.is_current
     AND NOT EXISTS (SELECT 1 FROM cost_engine.fx_rates fx
                      WHERE fx.rate_date = date_trunc('month', f.occurred_at)::date)
   GROUP BY date_trunc('month', f.occurred_at)
  UNION ALL
  -- OWNER DECISION (2026-07-31, locked): services.cost_target_usd is a
  -- MONTHLY BUDGET per service, in USD. One row per breached calendar month.
  --
  -- The column comment on ai_catalog.services.cost_target_usd was corrected to
  -- match (20260731_aiecon_p4_cost_target_comment.sql), so the documentation
  -- carried in the database agrees with this implementation.
  --
  -- Internal traffic is INCLUDED here, deliberately. Decision 3 excludes
  -- internal traffic from reported metrics, but a budget measures money
  -- actually owed to the provider, and admin/owner calls cost exactly as much
  -- as student calls. Excluding them would under-report the bill.
  SELECT 'service_over_budget', t.service_code || ' ' || t.month,
         'spend ' || round(t.spend, 6) || ' USD exceeds monthly budget '
           || t.cost_target_usd || ' USD (all traffic, internal included)'
    FROM (
      SELECT s.service_code,
             to_char(date_trunc('month', f.occurred_at), 'YYYY-MM') AS month,
             sum(f.net_cost_usd) AS spend,
             s.cost_target_usd
        FROM ai_catalog.services s
        JOIN cost_engine.cost_facts f
          ON f.service_code = s.service_code AND f.is_current
       WHERE s.cost_target_usd IS NOT NULL
       GROUP BY s.service_code, date_trunc('month', f.occurred_at), s.cost_target_usd
    ) t
   WHERE t.spend > t.cost_target_usd
  UNION ALL
  -- §3.4 / INV-22: how much of the priced cost rests on unverified prices.
  SELECT 'price_confidence_' || COALESCE(f.price_confidence, 'none'),
         count(*)::text,
         'current priced facts by rate-card price confidence'
    FROM cost_engine.cost_facts f
   WHERE f.is_current AND f.pricing_status <> 'unpriced'
   GROUP BY f.price_confidence
  UNION ALL
  SELECT 'last_pricing_run',
         COALESCE((SELECT to_char(max(started_at), 'YYYY-MM-DD HH24:MI:SS')
                     FROM cost_engine.cost_runs), 'never'),
         COALESCE((SELECT 'priced=' || COALESCE(calls_priced,0)
                          || ' unpriced=' || COALESCE(calls_unpriced,0)
                     FROM cost_engine.cost_runs ORDER BY started_at DESC LIMIT 1), '')
  UNION ALL
  SELECT 'last_allocation_run',
         COALESCE((SELECT to_char(max(started_at), 'YYYY-MM-DD HH24:MI:SS')
                     FROM cost_engine.allocation_runs), 'never'),
         COALESCE((SELECT 'conserved=' || COALESCE(conserved::text,'?')
                          || ' variance=' || COALESCE(variance_usd::text,'?')
                     FROM cost_engine.allocation_runs ORDER BY started_at DESC LIMIT 1), '');
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_cost_rate_cards(
  p_at timestamptz DEFAULT now()
)
RETURNS TABLE (
  provider_code  text,
  model          text,
  api_surface    text,
  billing_model  text,
  currency       text,
  version        text,
  price_confidence text,
  effective_from timestamptz,
  effective_to   timestamptz,
  unit_code      text,
  unit_price     numeric,
  per_qty        numeric,
  tier_from      numeric,
  tier_to        numeric,
  source_note    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_cost_rate_cards requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT rc.provider_code, rc.model, rc.api_surface, rc.billing_model,
         rc.currency, rc.version, rc.price_confidence,
         rc.effective_from, rc.effective_to,
         co.unit_code, co.unit_price, co.per_qty, co.tier_from, co.tier_to,
         rc.source_note
    FROM cost_engine.rate_cards rc
    LEFT JOIN cost_engine.rate_components co ON co.rate_card_id = rc.id
   WHERE rc.effective_from <= p_at
     AND (rc.effective_to IS NULL OR p_at < rc.effective_to)
   ORDER BY rc.provider_code, rc.model, rc.api_surface, co.unit_code;
END;
$$;

-- Pure what-if (§11, INV-09). Re-prices a historical window under hypothetical
-- rate multipliers or a model swap. WRITES NOTHING: it is STABLE, so
-- PostgreSQL refuses any data modification inside it, and every returned row
-- carries simulated = true with run_id = NULL.
CREATE OR REPLACE FUNCTION public.owner_cost_reprice(
  p_scenario jsonb
)
RETURNS TABLE (
  service_code       text,
  actual_cost_usd    numeric,
  simulated_cost_usd numeric,
  delta_usd          numeric,
  calls              bigint,
  simulated          boolean,
  run_id             uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cost_engine, ai_catalog
AS $$
DECLARE
  v_from timestamptz := COALESCE((p_scenario->>'from')::timestamptz, '-infinity'::timestamptz);
  v_to   timestamptz := COALESCE((p_scenario->>'to')::timestamptz,   'infinity'::timestamptz);
  v_mult numeric     := COALESCE((p_scenario->>'rate_multiplier')::numeric, 1);
  v_swap_from text   := p_scenario->>'swap_model_from';
  v_swap_to   text   := p_scenario->>'swap_model_to';
  v_incl boolean     := COALESCE((p_scenario->>'include_internal')::boolean, false);
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_cost_reprice requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT f.service_code, f.model, f.api_surface, f.provider_code,
           f.net_cost_usd, f.occurred_at, c.units
      FROM cost_engine.cost_facts f
      JOIN public.ai_model_calls c ON c.id = f.call_id
     WHERE f.is_current
       AND f.occurred_at >= v_from AND f.occurred_at < v_to
       AND (v_incl OR NOT f.is_internal)
  ),
  simulated AS (
    SELECT s.service_code,
           s.net_cost_usd AS actual_usd,
           CASE
             WHEN v_swap_from IS NOT NULL AND s.model = v_swap_from THEN
               (SELECT pu.gross_usd * v_mult
                  FROM cost_engine.price_units(
                         cost_engine.resolve_rate_card(s.provider_code, v_swap_to,
                                                       s.api_surface, s.occurred_at),
                         s.units) pu)
             ELSE s.net_cost_usd * v_mult
           END AS sim_usd
      FROM scoped s
  )
  SELECT sm.service_code,
         round(sum(sm.actual_usd), 8),
         round(sum(sm.sim_usd), 8),
         round(sum(sm.sim_usd) - sum(sm.actual_usd), 8),
         count(*)::bigint,
         true,
         NULL::uuid
    FROM simulated sm
   GROUP BY sm.service_code
   ORDER BY 2 DESC NULLS LAST;
END;
$$;

-- ── 16. Grants ────────────────────────────────────────────────────────────
-- Tables: RLS on with no policies, and no grants to anon/authenticated. The
-- engine's writers are SECURITY DEFINER functions owned by the migration
-- role, so service_role never needs direct write access to the fact tables.
-- Revoking UPDATE/DELETE from service_role means the immutability trigger is
-- not the only thing standing between an ad-hoc client and a rewritten fact.
DO $grants$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'billing_units','rate_cards','rate_components','discount_rules','fx_rates',
    'cost_runs','cost_facts','allocation_runs','question_cost_facts'
  ] LOOP
    EXECUTE format('ALTER TABLE cost_engine.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON cost_engine.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON cost_engine.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON cost_engine.%I TO service_role', t);
  END LOOP;
END
$grants$;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA cost_engine FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA cost_engine FROM anon, authenticated;

-- Engine writers: service_role may run them (scheduled job); nobody else.
REVOKE ALL ON FUNCTION cost_engine.run_pricing(timestamptz,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cost_engine.allocate(timestamptz,timestamptz,text)    FROM PUBLIC;
REVOKE ALL ON FUNCTION cost_engine.recompute(timestamptz,timestamptz,text)   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cost_engine.run_pricing(timestamptz,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION cost_engine.allocate(timestamptz,timestamptz,text)    TO service_role;
GRANT EXECUTE ON FUNCTION cost_engine.recompute(timestamptz,timestamptz,text)   TO service_role;

-- Owner RPCs: revoke from PUBLIC first (PostgreSQL grants EXECUTE to PUBLIC on
-- creation, and PostgREST publishes every public-schema function), then grant
-- to authenticated. The in-body owner gate is the second layer.
REVOKE ALL ON FUNCTION public.owner_cost_metrics(text,date,date,boolean,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_cost_metrics(text,date,date,boolean,integer) FROM anon;
REVOKE ALL ON FUNCTION public.owner_cost_service_breakdown(text,date,date,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_cost_service_breakdown(text,date,date,boolean) FROM anon;
REVOKE ALL ON FUNCTION public.owner_cost_facts(date,date,jsonb,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_cost_facts(date,date,jsonb,integer) FROM anon;
REVOKE ALL ON FUNCTION public.owner_cost_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_cost_health() FROM anon;
REVOKE ALL ON FUNCTION public.owner_cost_rate_cards(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_cost_rate_cards(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.owner_cost_reprice(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_cost_reprice(jsonb) FROM anon;

GRANT EXECUTE ON FUNCTION public.owner_cost_metrics(text,date,date,boolean,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_cost_service_breakdown(text,date,date,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_cost_facts(date,date,jsonb,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_cost_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_cost_rate_cards(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_cost_reprice(jsonb) TO authenticated;

-- Internal helpers are never callable from the API surface.
REVOKE ALL ON FUNCTION cost_engine.resolve_rate_card(text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION cost_engine.price_units(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION cost_engine.freeze_fact() FROM PUBLIC;

-- ── 17. Documentation carried in the database ─────────────────────────────
COMMENT ON TABLE cost_engine.cost_facts IS
  'Immutable per-CALL cost fact (§8.5). One current row per call, guaranteed '
  'by the partial unique index. Never updated except to flip is_current when '
  'a new run supersedes it (INV-15, enforced by the cost_facts_freeze '
  'trigger). net_cost_usd NULL means unpriced — never 0 (INV-23).';

COMMENT ON TABLE cost_engine.question_cost_facts IS
  'Immutable per-WORK-ITEM cost fact (§8.8.6) — the canonical Question Cost. '
  'total_cost_usd is this item''s own cost; thread_cost_usd is inclusive of '
  'descendants. The two are never added together (§8.8.4).';

COMMENT ON FUNCTION cost_engine.run_pricing(timestamptz,timestamptz,text) IS
  'Cost Calculation stage (§8.6). Prices telemetry rows with no current fact. '
  'Idempotent: re-running over the same window writes no new fact. Windows on '
  'created_at (write clock); prices and stamps occurred_at from started_at '
  '(economic clock).';

COMMENT ON FUNCTION cost_engine.allocate(timestamptz,timestamptz,text) IS
  'Cost Allocation stage (§8.8). Redistributes already-priced amounts into '
  'work items; performs no pricing math (INV-06). Asserts conservation '
  '(INV-20) and RAISEs on any variance, leaving the previous allocation '
  'current.';

COMMENT ON FUNCTION public.owner_cost_metrics(text,date,date,boolean,integer) IS
  'The single cost metric API (§8.9). Requires role owner (raises SQLSTATE '
  '42501 otherwise). p_dimension selects the rollup; capability dimensions '
  'read call facts, business dimensions read Question Cost facts. Internal '
  'traffic is excluded unless p_include_internal is true (INV-25).';
