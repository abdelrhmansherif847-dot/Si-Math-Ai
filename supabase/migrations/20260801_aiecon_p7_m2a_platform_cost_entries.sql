-- ===========================================================================
-- Phase 7 M2a — public.platform_cost_entries: immutable owner-entered fixed cost
-- ===========================================================================
-- STATUS: ✅ APPLIED 2026-08-01 as version 20260801182954, on owner approval of
--         the M2 engineering review. SUPERSEDED IN PART by two follow-ups, both
--         applied — this file is the historical record of the original.
--
--         The M2 Release Gate FAILED at V4: owner_econ_set_platform_cost raised
--         42702 (ambiguous column), because RETURNS TABLE output names are
--         PL/pgSQL variables and the body's column references were unqualified.
--         → fixed by M2c (qualification only). The body below carries the fix.
--
--         The gate's regression suite then failed P5-04: this file's writer is
--         VOLATILE inside the read-only owner_econ_* namespace.
--         → fixed by M2d. owner_econ_set_platform_cost is DROPPED and replaced
--           by public.owner_write_platform_cost with an identical body.
--
--         ⚠ THE WRITER DEFINED IN §6 BELOW NO LONGER EXISTS. Read M2d for the
--         live definition. Everything else in this file is current.
--
-- DESIGN OF RECORD: docs/roadmap/phase-7-m2-design-document.md
-- Owner decisions closed 2026-08-01 (D1–D6) are encoded here; where this file
-- makes a choice, the decision that forced it is named.
--
-- WHY THIS TABLE EXISTS (§9.4)
--   Platform spend — Supabase, Vercel, domains, payment fees — cannot be
--   attributed to any ai_model_calls row, so the Cost Engine correctly refuses
--   to hold it. It is a P&L input only. Gross profit needs only the engine;
--   NET profit needs this. Nothing in cost_engine may ever read this table, or
--   the layer boundary (INV-05, §8.10 rule 8) inverts.
--
-- WHY THE §9.4 UNIQUE CONSTRAINT IS NOT USED
--   §9.4 specifies UNIQUE (period_month, category). That forbids the second row
--   an immutable supersede requires, so it is replaced by a PARTIAL unique
--   index over is_current. This is not a deviation for convenience: owner
--   ruling ① forbids edit-in-place outright, and Alternative A was chosen
--   precisely so a corrected figure never overwrites the original.
--
-- THE DOUBLE-COUNTING HAZARD — READ THIS BEFORE QUERYING
--   After any correction this table holds MORE THAN ONE row per
--   (period_month, category). A query that omits `is_current` does not error —
--   it silently returns inflated totals. Correcting July from 25 to 30 and then
--   running `SELECT sum(amount) ... WHERE period_month = '2026-07-01'` returns
--   55, not 30.
--
--   NOTHING SHOULD EVER READ THIS TABLE DIRECTLY. Read
--   econ.v_platform_costs_current, which filters is_current. Owner ruling ②
--   requirement 5 makes stating this a design obligation, not a courtesy.
--
-- SECURITY (owner decision D2)
--   REVOKE ALL + RLS enabled with no permissive policy + SECURITY DEFINER RPCs
--   + owner gate. FORCE ROW LEVEL SECURITY is deliberately NOT used: functions
--   and tables are both owned by postgres, so forcing RLS would subject the
--   owner RPCs to policy and make that policy a single point of failure, while
--   introducing a mechanism no other table in this project uses.
--
--   Measured 2026-08-01: every sensitive public table in this project grants
--   anon/authenticated arwdm by Supabase default and is protected by RLS ALONE.
--   This table gets two independent protections instead, because it holds
--   supplier invoice figures.
--
-- ROLLBACK
--   DROP TRIGGER platform_cost_entries_freeze ON public.platform_cost_entries;
--   DROP FUNCTION public.freeze_platform_cost_entry();
--   DROP FUNCTION public.owner_econ_set_platform_cost(date,text,numeric,text,text,text);
--   DROP VIEW econ.v_platform_costs_current;
--   CREATE OR REPLACE FUNCTION econ.platform_cost_available() ... (prior body:
--     SELECT to_regclass('public.platform_cost_entries') IS NOT NULL)
--   DROP TABLE public.platform_cost_entries;
--
--   ⚠ THE ROLLBACK WINDOW CLOSES ONCE REAL DATA IS ENTERED. Dropping the table
--   after an owner has recorded real invoices destroys financial history. Apply
--   this migration and populate it as two separate, deliberate steps.
-- ===========================================================================

-- ── 1. The table ──────────────────────────────────────────────────────────
CREATE TABLE public.platform_cost_entries (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- what the cost is
  period_month      date          NOT NULL,
  category          text          NOT NULL,
  amount            numeric(12,2) NOT NULL,
  currency          text          NOT NULL DEFAULT 'USD',
  note              text          NULL,

  -- Alternative A — in-row supersede (owner ruling ②)
  is_current        boolean       NOT NULL DEFAULT true,
  revision_number   integer       NOT NULL DEFAULT 1,
  supersedes_id     uuid          NULL REFERENCES public.platform_cost_entries(id),

  -- audit (owner ruling ② + decision D3)
  created_at        timestamptz   NOT NULL DEFAULT now(),
  created_by        uuid          NOT NULL REFERENCES public.profiles(id),
  superseded_at     timestamptz   NULL,
  superseded_by     uuid          NULL REFERENCES public.profiles(id),
  change_reason     text          NULL,

  -- ── constraints (owner ruling ③) ────────────────────────────────────────

  -- a period is a MONTH, never an arbitrary day. Without this, '2026-07-17'
  -- would silently create a second July bucket beside '2026-07-01'.
  CONSTRAINT pce_period_is_first_of_month
    CHECK (period_month = date_trunc('month', period_month)::date),

  -- owner decision D4: strictly positive. Credit notes and negative amounts
  -- are NOT supported in Phase 7; if needed they become their own phase.
  CONSTRAINT pce_amount_positive
    CHECK (amount > 0),

  -- free-text currency would let 'usd' and 'USD' both exist while only one
  -- matches an FX lookup.
  CONSTRAINT pce_currency_known
    CHECK (currency IN ('USD','EGP')),

  -- same reasoning for category: 'Vercel' and 'vercel' would become two rows
  -- past the partial unique index.
  CONSTRAINT pce_category_normalised
    CHECK (length(btrim(category)) > 0 AND category = lower(btrim(category))),

  CONSTRAINT pce_revision_positive
    CHECK (revision_number >= 1),

  -- a current row is not superseded; a superseded row records who and when
  CONSTRAINT pce_supersede_coherent
    CHECK ( (is_current      AND superseded_at IS NULL     AND superseded_by IS NULL)
         OR (NOT is_current  AND superseded_at IS NOT NULL AND superseded_by IS NOT NULL) ),

  -- revision 1 is an original; anything later must name what it replaced
  CONSTRAINT pce_revision_chain_coherent
    CHECK ( (revision_number = 1 AND supersedes_id IS NULL)
         OR (revision_number > 1 AND supersedes_id IS NOT NULL) ),

  -- owner decision D3: no financial figure is corrected without a stated reason
  CONSTRAINT pce_supersede_has_reason
    CHECK (revision_number = 1 OR change_reason IS NOT NULL)
);

-- exactly ONE current row per (month, category). This is what makes
-- econ.v_platform_costs_current safe to sum.
CREATE UNIQUE INDEX pce_one_current
  ON public.platform_cost_entries (period_month, category)
  WHERE is_current;

-- a row may be superseded at most once, so revision history is a chain and
-- never a fork. Without this, two corrections of the same row would both claim
-- to replace it and the history would be ambiguous.
CREATE UNIQUE INDEX pce_supersedes_once
  ON public.platform_cost_entries (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE INDEX pce_period_month ON public.platform_cost_entries (period_month);

COMMENT ON TABLE public.platform_cost_entries IS
  'Owner-entered non-AI platform cost (§9.4). IMMUTABLE: rows are never updated '
  'or deleted — a correction inserts a new revision and marks the old row '
  'is_current=false. ⚠ DO NOT QUERY THIS TABLE DIRECTLY: after any correction it '
  'holds multiple rows per (period_month, category) and a query omitting '
  'is_current silently returns inflated totals. Read '
  'econ.v_platform_costs_current instead. Never read from cost_engine — this is '
  'a P&L input only and is not attributable to a call.';

-- ── 2. Immutability, enforced by the database (owner ruling ①) ────────────
-- Modelled on cost_engine.freeze_fact, extended for the two supersede columns
-- and to make supersede one-way. Enforcement lives here, not in the RPC, so a
-- future writer cannot bypass it.
CREATE OR REPLACE FUNCTION public.freeze_platform_cost_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'platform cost entries are immutable: rows may not be deleted; supersede with a new revision instead'
      USING ERRCODE = '42501';
  END IF;

  -- only the supersede columns may ever change
  IF to_jsonb(NEW) - 'is_current' - 'superseded_at' - 'superseded_by'
     IS DISTINCT FROM
     to_jsonb(OLD) - 'is_current' - 'superseded_at' - 'superseded_by' THEN
    RAISE EXCEPTION
      'platform cost entries are immutable: only is_current, superseded_at and superseded_by may change'
      USING ERRCODE = '42501';
  END IF;

  -- supersede is one-way: a superseded figure can never be resurrected
  IF OLD.is_current = false AND NEW.is_current = true THEN
    RAISE EXCEPTION 'a superseded platform cost entry may not be reactivated'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_cost_entries_freeze
  BEFORE UPDATE OR DELETE ON public.platform_cost_entries
  FOR EACH ROW EXECUTE FUNCTION public.freeze_platform_cost_entry();

-- ── 3. Security (owner decision D2, owner ruling ⑦) ───────────────────────
REVOKE ALL ON public.platform_cost_entries FROM PUBLIC;
REVOKE ALL ON public.platform_cost_entries FROM anon;
REVOKE ALL ON public.platform_cost_entries FROM authenticated;

ALTER TABLE public.platform_cost_entries ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policy is created. With RLS enabled and no permissive policy,
-- every non-owner role is denied even if a GRANT is later added by accident.
-- FORCE ROW LEVEL SECURITY is deliberately NOT set — see the header.

-- ── 4. The ONLY sanctioned read surface ───────────────────────────────────
-- Every consumer reads this, never the table. Filtering is_current here is the
-- structural control against the double-counting hazard (ruling ② req. 5).
CREATE VIEW econ.v_platform_costs_current AS
SELECT e.period_month,
       e.category,
       e.amount,
       e.currency,
       e.note,
       e.revision_number,
       e.created_at,
       e.created_by
  FROM public.platform_cost_entries e
 WHERE e.is_current;

COMMENT ON VIEW econ.v_platform_costs_current IS
  'Current platform cost entries only — the sanctioned read surface for '
  'public.platform_cost_entries. Filters is_current, so summing it cannot '
  'double-count superseded revisions. History remains readable from the table '
  'through an owner RPC.';

-- ── 5. Close the availability trap ────────────────────────────────────────
-- WAS: SELECT to_regclass('public.platform_cost_entries') IS NOT NULL
--
-- That tested EXISTENCE, so creating this table — even empty — would have
-- flipped it true and removed the no_platform_cost_source block reason while
-- platform_cost_egp was still NULL. Break-even would have claimed a source
-- existed while reporting nothing.
--
-- It now tests for USABLE DATA. An empty table keeps break-even honestly
-- blocked, and it unblocks automatically the moment a real entry is recorded —
-- with no code change, per the Phase 5 unblocking principle.
CREATE OR REPLACE FUNCTION econ.platform_cost_available()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = econ, public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_cost_entries WHERE is_current);
$$;

COMMENT ON FUNCTION econ.platform_cost_available() IS
  'True when at least one CURRENT platform cost entry exists. Tests for usable '
  'data, not table existence — creating the table empty must not unblock a '
  'metric that still has nothing to report.';

-- ── 6. The owner write path (the module''s first writer) ──────────────────
-- Every other AI-Economics function is STABLE and read-only (INV-07). This one
-- writes, and is therefore VOLATILE. INV-07 governs REPORTING surfaces; a
-- deliberate, owner-gated cost-input writer is the documented exception (§9.4:
-- "writes cost inputs, never product pricing").
--
-- A correction is ONE atomic operation: insert the new revision, then mark the
-- old row superseded. The partial unique index makes a half-completed
-- correction impossible — two current rows for one key cannot coexist.
CREATE OR REPLACE FUNCTION public.owner_econ_set_platform_cost(
  p_period_month  date,
  p_category      text,
  p_amount        numeric,
  p_currency      text DEFAULT 'USD',
  p_note          text DEFAULT NULL,
  p_change_reason text DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  period_month    date,
  category        text,
  amount          numeric,
  currency        text,
  revision_number integer,
  superseded_id   uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, econ
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old   public.platform_cost_entries%rowtype;
  v_new   public.platform_cost_entries%rowtype;
  v_cat   text := lower(btrim(p_category));
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_set_platform_cost requires role owner'
      USING ERRCODE = '42501';
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'owner_econ_set_platform_cost requires an authenticated actor'
      USING ERRCODE = '42501';
  END IF;

  -- EVERY column reference is qualified with the alias `e`. In PL/pgSQL the
  -- RETURNS TABLE output names (id, period_month, category, amount, currency,
  -- revision_number, superseded_id) are VARIABLES in scope, so an unqualified
  -- `WHERE period_month = ...` is ambiguous and raises 42702 at execution.
  --
  -- Found by the M2 Release Gate on 2026-08-01, AFTER apply: the pre-apply
  -- probe exercised the table, trigger, constraints, view, resolver and both
  -- net-profit RPCs, but never called THIS function, so its body never ran.
  -- 42702, like 42804, is raised only at execution.
  SELECT e.* INTO v_old
    FROM public.platform_cost_entries e
   WHERE e.period_month = p_period_month AND e.category = v_cat AND e.is_current;

  -- A correction must state why (owner decision D3). Enforced here as well as
  -- by CHECK, so the caller gets a clear error rather than a constraint name.
  IF v_old.id IS NOT NULL AND p_change_reason IS NULL THEN
    RAISE EXCEPTION
      'correcting an existing platform cost requires p_change_reason: financial figures are not changed without a recorded reason'
      USING ERRCODE = '23514';
  END IF;

  -- ORDER IS LOAD-BEARING: supersede the old row BEFORE inserting the new one.
  --
  -- The partial unique index pce_one_current is enforced immediately, not at
  -- commit — a partial UNIQUE INDEX cannot be DEFERRABLE. Inserting first would
  -- momentarily leave two rows with is_current = true for the same
  -- (period_month, category) and raise 23505, so every correction would fail.
  --
  -- Found by the mandatory pre-apply probe on 2026-08-01; the original design
  -- (§6 of the design document) specified insert-then-supersede and could not
  -- execute. Both were corrected.
  --
  -- Safe in this order: the two statements share one transaction, so if the
  -- INSERT fails the supersede is rolled back with it. The table can never be
  -- left with a superseded row and no replacement.
  IF v_old.id IS NOT NULL THEN
    UPDATE public.platform_cost_entries e
       SET is_current = false, superseded_at = now(), superseded_by = v_actor
     WHERE e.id = v_old.id;
  END IF;

  INSERT INTO public.platform_cost_entries
    (period_month, category, amount, currency, note,
     revision_number, supersedes_id, created_by, change_reason)
  VALUES
    (p_period_month, v_cat, p_amount, p_currency, p_note,
     COALESCE(v_old.revision_number, 0) + 1, v_old.id, v_actor, p_change_reason)
  RETURNING * INTO v_new;

  RETURN QUERY
  SELECT v_new.id, v_new.period_month, v_new.category, v_new.amount,
         v_new.currency, v_new.revision_number, v_old.id;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_econ_set_platform_cost(date,text,numeric,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_set_platform_cost(date,text,numeric,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_set_platform_cost(date,text,numeric,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.owner_econ_set_platform_cost(date,text,numeric,text,text,text) IS
  'Record or correct a platform cost for a month. Requires role owner. A '
  'correction never overwrites: it inserts a new revision and marks the previous '
  'row is_current=false, and must state p_change_reason. VOLATILE by necessity — '
  'the one deliberate writer in AI Economics, writing a cost INPUT and never '
  'product pricing (§9.4).';

-- ── 7. Owner read path for HISTORY (current state is read via the view) ───
CREATE OR REPLACE FUNCTION public.owner_econ_platform_cost_history(
  p_period_month date DEFAULT NULL,
  p_category     text DEFAULT NULL
)
RETURNS TABLE (
  period_month    date,
  category        text,
  amount          numeric,
  currency        text,
  is_current      boolean,
  revision_number integer,
  change_reason   text,
  note            text,
  created_at      timestamptz,
  created_by      uuid,
  superseded_at   timestamptz,
  superseded_by   uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, econ
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_platform_cost_history requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.period_month, e.category, e.amount, e.currency, e.is_current,
         e.revision_number, e.change_reason, e.note,
         e.created_at, e.created_by, e.superseded_at, e.superseded_by
    FROM public.platform_cost_entries e
   WHERE (p_period_month IS NULL OR e.period_month = p_period_month)
     AND (p_category     IS NULL OR e.category     = lower(btrim(p_category)))
   ORDER BY e.period_month DESC, e.category, e.revision_number DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_econ_platform_cost_history(date,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_platform_cost_history(date,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_platform_cost_history(date,text) TO authenticated;

COMMENT ON FUNCTION public.owner_econ_platform_cost_history(date,text) IS
  'Full revision history including superseded rows. Requires role owner. This is '
  'the audit surface — it deliberately returns non-current rows, so it must NEVER '
  'be summed for reporting. Financial reports read econ.v_platform_costs_current.';
