# Phase 7 M2 — `platform_cost_entries` & Net Profit: Design Document

**Design only. No SQL executed, no migration prepared, no database object
changed, no implementation begun.** The DDL below is a **specification**, not a
migration file.

Awaiting full owner review and approval before any code.

---

## 0. Locked decisions this design must honour

| # | Ruling | How it binds this design |
|---|---|---|
| ① | Immutable financial records, no edit-in-place | §2, §5 — enforced by trigger, not convention |
| ② | **Audit Model = Alternative A** + 5 requirements | §3, §5, §6 |
| ③ | Strong CHECK constraints | §4 |
| ④ | **No currency shortcut** — no FX, stays blocked | §10, §12 |
| ⑤ | Net Profit **monthly only**, **no allocation of any kind** | §10 |
| ⑥ | Simulator out of scope | nothing simulator-related appears |
| ⑦ | Owner-only; no public / anon / authenticated | §5 |
| ⑧ | This document before any code | — |
| — | Extend `v_breakeven_inputs`, single source of truth | §9, §10 |
| — | New RPC for Net Profit + Net Margin, no client calculation | §10, §11 |
| — | **Strictly additive** — no existing name, type, value or behaviour changes | §8, §9 |
| — | **Block reasons: present alternatives, do not decide** | §12 |

---

## 1. Schema

```sql
-- SPECIFICATION — not a migration.
CREATE TABLE public.platform_cost_entries (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- what the cost is
  period_month      date        NOT NULL,
  category          text        NOT NULL,
  amount            numeric(12,2) NOT NULL,
  currency          text        NOT NULL DEFAULT 'USD',
  note              text        NULL,

  -- Alternative A: in-row supersede
  is_current        boolean     NOT NULL DEFAULT true,
  revision_number   integer     NOT NULL DEFAULT 1,
  supersedes_id     uuid        NULL REFERENCES public.platform_cost_entries(id),

  -- audit
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        NOT NULL REFERENCES public.profiles(id),
  superseded_at     timestamptz NULL,
  superseded_by     uuid        NULL REFERENCES public.profiles(id),
  change_reason     text        NULL
);
```

### Deviations from §9.4, and why

| §9.4 | Here | Reason |
|---|---|---|
| `UNIQUE (period_month, category)` | **removed**, replaced by a partial index (§4) | it forbids the second row a supersede requires — incompatible with Alternative A |
| no audit columns | 5 added | ruling ② |
| no revision tracking | 3 added | ruling ② |

`change_reason` is not in your list. It is proposed because `role_audit_log` —
the project's one human-action audit precedent — carries `reason`, and a
correction to a historical profit figure is exactly when "why" matters most.
**Flagged as an addition for you to accept or drop.**

---

## 2. Audit Model — Alternative A

One table holds both current state and full history. A correction never
overwrites: it **inserts a new row** and marks the old one superseded.

```
revision 1   amount 25.00   is_current=false  superseded_at=…  superseded_by=…
revision 2   amount 30.00   is_current=true   supersedes_id=<rev 1 id>
```

| Requirement (ruling ②) | Mechanism |
|---|---|
| 1. No history deletable | DELETE raises unconditionally (§5 trigger) |
| 2. Every revision fully traceable | `revision_number` + `supersedes_id` chain + `created_by`/`superseded_by`/`created_at`/`superseded_at` |
| 3. Clear current record, previous retained | `is_current` — exactly one true per `(period_month, category)`, enforced by partial unique index |
| 4. Default reports read current only | consumers read a **view that filters `is_current`**, never the table (§7) |
| 5. Double-counting risk called out | **§7 — dedicated section** |

---

## 3. Constraints (ruling ③)

```sql
-- SPECIFICATION — not a migration.
CONSTRAINT pce_period_is_first_of_month
  CHECK (period_month = date_trunc('month', period_month)::date),

CONSTRAINT pce_amount_positive
  CHECK (amount > 0),

CONSTRAINT pce_currency_known
  CHECK (currency IN ('USD','EGP')),

CONSTRAINT pce_category_nonempty
  CHECK (length(btrim(category)) > 0 AND category = lower(btrim(category))),

CONSTRAINT pce_revision_positive
  CHECK (revision_number >= 1),

-- supersede coherence: a current row is not superseded; a superseded row is complete
CONSTRAINT pce_supersede_coherent
  CHECK ( (is_current  AND superseded_at IS NULL AND superseded_by IS NULL)
       OR (NOT is_current AND superseded_at IS NOT NULL AND superseded_by IS NOT NULL) ),

CONSTRAINT pce_revision_1_has_no_parent
  CHECK ( (revision_number = 1 AND supersedes_id IS NULL)
       OR (revision_number > 1 AND supersedes_id IS NOT NULL) );

-- exactly one current row per (month, category)
CREATE UNIQUE INDEX pce_one_current
  ON public.platform_cost_entries (period_month, category)
  WHERE is_current;

-- a row may be superseded only once — prevents a forked history
CREATE UNIQUE INDEX pce_supersedes_once
  ON public.platform_cost_entries (supersedes_id)
  WHERE supersedes_id IS NOT NULL;
```

**Notes on two judgement calls, both flagged rather than assumed:**

- **`amount > 0`, not `>= 0`.** Per ruling ③ this excludes credit notes. A
  supplier refund would need either a negative amount (loosening this) or a
  dedicated `category`. **Recommend keeping `> 0`** and revisiting only when a
  real credit note exists — designing for a hypothetical invites the wrong shape.
- **`currency IN ('USD','EGP')`.** A CHECK is preferred over an FK to a currency
  table, which does not exist and is not worth creating for two values. Note this
  does **not** weaken ruling ④: EGP is permitted as a *currency of entry*, and
  §10 guarantees it is never used to bypass a missing FX rate.

---

## 4. RLS & Security (ruling ⑦)

### The finding that drives this design

Measured across the project:

- every sensitive `public` table grants `anon` and `authenticated` **`arwdm`**
  (INSERT/SELECT/UPDATE/DELETE/MAINTAIN) directly from `postgres` — Supabase's
  default for the `public` schema;
- **no table in the project uses `FORCE ROW LEVEL SECURITY`**;
- **tables and functions are both owned by `postgres`**.

That last fact is decisive. A `SECURITY DEFINER` function runs as `postgres`,
which **owns** the table, so **RLS does not apply to it** unless the table forces
RLS.

### Design

```sql
-- SPECIFICATION — not a migration.
REVOKE ALL ON public.platform_cost_entries FROM PUBLIC, anon, authenticated;
ALTER TABLE public.platform_cost_entries ENABLE ROW LEVEL SECURITY;
-- no policy granting anon or authenticated anything
-- no UPDATE policy, no DELETE policy
```

**Two independent protections, deliberately:**

| Layer | Protects against |
|---|---|
| **REVOKE** — no grant at all | the default-privilege exposure above; even with RLS disabled, no direct access exists |
| **RLS enabled, no permissive policy** | a future `GRANT` re-opening access by accident |

**Access path:** owner-gated `SECURITY DEFINER` RPCs only — identical to every
other economics surface. Since those run as `postgres`, they operate on the table
directly; **the RPC's `has_role_at_least('owner')` gate is the real boundary**,
and RLS + REVOKE ensure there is no *other* path.

### On `FORCE ROW LEVEL SECURITY` — recommended **against**, with reasoning

Forcing RLS would subject the `SECURITY DEFINER` RPCs to policy as well. That
sounds stronger, but it means the RPCs need their own permissive policy to
function — and that policy becomes the single point of failure, while adding a
mechanism no other table in this project uses. **The REVOKE already provides the
second layer**, without novelty.

**This is a recommendation, not a decision — it is exactly the kind of security
choice that should be yours.**

---

## 5. Lifecycle & immutability enforcement

```sql
-- SPECIFICATION — not a migration. Mirrors cost_engine.freeze_fact.
CREATE FUNCTION public.freeze_platform_cost_entry() RETURNS trigger AS $$
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
      'platform cost entries are immutable: only is_current/superseded_at/superseded_by may change'
      USING ERRCODE = '42501';
  END IF;

  -- supersede is one-way
  IF OLD.is_current = false AND NEW.is_current = true THEN
    RAISE EXCEPTION 'a superseded platform cost entry may not be reactivated'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
```

This is the `cost_facts_freeze` pattern, extended to allow the two extra
supersede columns and to make supersede irreversible. **Immutability is enforced
by the database, not by convention or by the RPC.**

### Lifecycle states

| State | `is_current` | `superseded_at` | Reachable from |
|---|---|---|---|
| Current | true | NULL | insert, or being the newest revision |
| Superseded | false | set | current (one-way) |
| Deleted | — | — | **unreachable by design** |

---

## 6. Revision Strategy

A correction is **one atomic operation** inside a single owner-gated
`SECURITY DEFINER` RPC:

1. Read the current row for `(period_month, category)`; if none, this is
   revision 1.
2. Insert the new row: `revision_number = old + 1`, `supersedes_id = old.id`,
   `created_by = auth.uid()`.
3. Update the old row: `is_current = false`, `superseded_at = now()`,
   `superseded_by = auth.uid()`.

Steps 2–3 are in one transaction. The partial unique index makes a half-completed
correction impossible: two current rows for the same key cannot exist.

**Note:** no column in this project currently defaults to `auth.uid()`. Here
`created_by` is set **explicitly by the RPC**, not by a column default — the RPC
already knows the caller, and a default would silently produce NULL if the table
were ever written outside it.

---

## 7. Double-counting — the risk, and how it is prevented (ruling ② requirement 5)

**The risk, stated plainly.** After any correction, the table holds more than one
row for the same `(period_month, category)`. A query that forgets `is_current`
does not error — it **silently returns inflated totals**:

```sql
-- WRONG: after one correction of July from 25 to 30, this returns 55
SELECT sum(amount) FROM public.platform_cost_entries WHERE period_month = '2026-07-01';
```

This is the same failure class as M4.2 (a query structurally unable to see the
truth) and is the single largest hazard in this design.

### Prevention — four layers, not one

| # | Control | Prevents |
|---|---|---|
| 1 | **No consumer ever reads the table.** All access is via a view/RPC that filters `is_current` | the mistake being *possible* in normal use |
| 2 | **REVOKE + RLS (§4)** — nothing outside the owner RPCs can read the table at all | the mistake being reachable from the client |
| 3 | **A dedicated verification check** asserting `sum(current) ≤ sum(all)` and that per-key current rows = 1 | the mistake surviving into a release |
| 4 | **Table comment states the hazard** verbatim at the object itself | the mistake in ad-hoc queries by a human |

**Control 1 is the structural one**: a proposed
`econ.v_platform_costs_current` (filtering `is_current`) is the only sanctioned
read surface. `v_breakeven_inputs` reads that view, never the table.

---

## 8. Dependencies

| This design depends on | Why |
|---|---|
| `public.profiles(id)` | `created_by` / `superseded_by` FKs |
| `public.has_role_at_least(user_role)` | owner gate in every RPC |
| `econ.platform_cost_available()` | **must be revised** — see below |
| `cost_engine.fx_rates` | USD → EGP conversion (currently empty) |

### The `platform_cost_available()` trap — and its fix

Today: `SELECT to_regclass('public.platform_cost_entries') IS NOT NULL`.

**Creating the table flips this to true even when empty**, removing the
`no_platform_cost_source` block reason while `platform_cost_egp` remains NULL —
break-even would claim a source exists while reporting nothing.

**Fix: the table and the view must change in the same migration**, and the
function must test for *usable data*, not mere existence. Its exact new
predicate depends on §12 and is therefore **not decided here**.

---

## 9. Consumers, and the strictly-additive guarantee

| Consumer | Change | Additive? |
|---|---|---|
| `econ.v_breakeven_inputs` | `platform_cost_egp` becomes real instead of `NULL::numeric`; net columns added | **column values change from NULL to a number — see below** |
| `econ.v_coverage` | `platform_costs` row unblocks when data exists | behavioural, by design |
| `owner_econ_pnl_summary` | **untouched** | ✓ |
| `owner_econ_pnl` | **untouched** | ✓ |
| `econ.v_pnl_daily` | **untouched — no net columns, no monthly data** | ✓ |
| New Net Profit RPC | new object | ✓ |

**One honest qualification on "strictly additive".** No column is renamed,
retyped or removed anywhere. But `v_breakeven_inputs.platform_cost_egp` is
*currently* a hardcoded `NULL`; making it real changes its **value** from NULL to
a number once data exists. That is the entire point of the change, and it cannot
be avoided — but your ruling said "no change to existing values", so I am
surfacing it rather than letting it pass as additive. **Everything else is
strictly additive.**

---

## 10. Net Profit design

**Monthly only. No allocation of any kind** — no equal, revenue-weighted, or
AI-cost-weighted distribution. Where data is not measured daily, no daily
measurement is invented.

Home: **extend `econ.v_breakeven_inputs`** (your single-source-of-truth ruling).

Proposed additional columns:

| Column | Meaning |
|---|---|
| `platform_cost_egp` | **existing column, made real** — sum of *current* entries for the month, converted to EGP |
| `net_profit_egp` | `revenue_egp − ai_cost_egp − platform_cost_egp` |
| `net_margin_pct` | see §11 |
| `net_block_reason` | why net is blocked, **separate** from the existing gross `block_reason` |
| `net_confidence` | `worst(revenue, ai_cost, platform_cost)` per INV-27 |

**Gross and net stay separately labelled and separately blocked**, per §9.4's
rule that the module must not silently report gross as net. `block_reason` and
`confidence` keep their current meaning untouched.

### FX behaviour (ruling ④), restated as a design guarantee

- A USD entry with no FX rate covering its month → `platform_cost_egp` is **NULL**
  and net profit is **blocked**.
- An EGP entry needs no conversion and contributes directly.
- **EGP entry is never offered as a workaround for missing FX.** If *any*
  contributing input is unconvertible, net profit is blocked for that month.
  Partial conversion is never performed — the same "no partial cost" principle
  as ruling D-B.

**Consequence, recorded deliberately:** with 0 FX rows, net profit stays blocked
on every month even after the table is fully populated. **Correct, not a bug.**

---

## 11. Net Margin design

`net_margin_pct = net_profit_egp / revenue_egp × 100`

**It cannot be derived in the client, and it cannot be derived from daily
margins.** M2 established this verbatim: *"a period margin is NOT the sum, mean,
or any other elementwise combination of daily margins."*

| Question | Answer |
|---|---|
| Separate RPC? | **No.** Net profit and net margin come from the same monthly row; splitting them invites divergence. |
| Extra columns? | One — `net_margin_pct`, beside `net_profit_egp`. |
| Different handling? | **Yes, one case:** `revenue_egp = 0` makes margin undefined. It must be **NULL with a reason**, never 0 (INV-23). Guarded by `NULLIF(revenue_egp, 0)`. |
| Blocked when profit is blocked? | Yes — margin can never be more confident than its numerator (INV-27). |

### The RPC

One new owner-gated `STABLE SECURITY DEFINER` RPC returning monthly rows with
net profit, net margin, their block reason and confidence. **No financial
arithmetic in the client** — every figure arrives as a typed column.

Whether it returns one row per month or a single summary row for a range is a
**design detail to confirm**; M2's `owner_econ_pnl_summary` precedent suggests a
period summary is what a headline needs, and a per-month series is what a chart
needs. Possibly both, which would argue for one RPC with a grain parameter.

---

## 12. Block reasons — **ALTERNATIVES ONLY, not decided** (your ruling)

Net profit needs reasons `econ.block_reason(revenue, ai_cost_usd, ai_cost_egp)`
cannot express — it takes three arguments and knows nothing about platform cost:

- `no_platform_cost_source` — table absent
- `no_platform_cost_in_period` — table exists, no current entry for that month
- `no_fx_for_platform_cost` — entry is USD, no rate covers its month

### Alternative 1 — extend `econ.block_reason()` with a 4th argument

| | |
|---|---|
| **Pros** | one resolver, one place to reason about blocking; automatically consistent |
| **Cons** | **four surfaces already call it** (`v_pnl_daily`, `v_breakeven_inputs`, `owner_econ_pnl`, `owner_econ_pnl_summary`). Adding a parameter with a default is backward-compatible in SQL, but every caller's behaviour must be re-verified. Highest blast radius. |
| **Risk** | changing a function the whole P&L depends on, to serve one new consumer |

### Alternative 2 — a sibling `econ.net_block_reason(...)`

| | |
|---|---|
| **Pros** | **zero blast radius** — no existing caller touched; gross and net blocking stay visibly distinct, matching §9.4's separation |
| **Cons** | two resolvers could drift; the gross reasons would be duplicated or delegated |
| **Mitigation** | have the sibling *call* `block_reason()` first and only add platform-specific reasons — composition, not duplication |

### Alternative 3 — resolve inline in the view

| | |
|---|---|
| **Pros** | no function change at all; matches how `no_platform_cost_source` is bolted on **today** |
| **Cons** | blocking logic leaks into a view, contradicting P5-15's principle that classes originate in functions; not reusable by the RPC |
| **Risk** | the precedent it follows is itself a shortcut |

**My reading: Alternative 2 with the composition mitigation** — it satisfies
"gross and net are separately blocked" structurally, and has no blast radius.
**But this is explicitly yours to decide, and nothing will be built until you do.**

---

## 13. Rollback Strategy

| Object | Rollback |
|---|---|
| `platform_cost_entries` | `DROP TABLE` — but **only while empty**. Once an owner has entered real invoice data, dropping destroys financial history; rollback then means reverting the *consumers*, not the table |
| Freeze trigger + function | `DROP TRIGGER` / `DROP FUNCTION` |
| `econ.v_platform_costs_current` | `DROP VIEW` |
| `v_breakeven_inputs` changes | `CREATE OR REPLACE VIEW` back to the prior definition — **note: cannot change a column's type, so if any existing column's type changes the rollback needs DROP + recreate**; the current design changes no types |
| `platform_cost_available()` | `CREATE OR REPLACE FUNCTION` back |
| New Net Profit RPC | `DROP FUNCTION` |

**The rollback window closes once real data is entered.** This should be stated
in the release report, and argues for applying the migration and *then* entering
data as a separate deliberate step.

---

## 14. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Double-counting across revisions** | **High** | §7 — four layers; no consumer reads the table |
| 2 | `platform_cost_available()` unblocking on an empty table | **High** | §8 — table + view + function change together |
| 3 | Modifying `v_breakeven_inputs`, which has consumers | Medium | digest verification, as M2 did for `v_pnl_daily` |
| 4 | Net profit blocked indefinitely (no FX) read as a bug | Medium | documented in §10 and in the release report as correct behaviour |
| 5 | `REVOKE` omitted → invoice data exposed to `anon` | **High** | explicit verification that `anon`/`authenticated` are denied by grant *and* by policy, proven separately |
| 6 | Freeze trigger too strict, blocking legitimate supersede | Medium | negative controls proving supersede succeeds and every other mutation fails |
| 7 | Rollback after real data entered | Medium | §13 — apply and populate as separate steps |

---

## 15. Verification Plan

Carrying forward Phase 6's discipline.

| # | Check | Method |
|---|---|---|
| V1 | Pre-apply **type probe** on every new/modified RPC and view | TEMP VIEW vs declared types — caught a real defect in 5 consecutive milestones |
| V2 | **Immutability**: DELETE refused; UPDATE of `amount`/`period_month`/`category`/`currency` refused; supersede columns permitted | negative controls, each driven to fire |
| V3 | **Supersede is one-way**: reactivating a superseded row refused | negative control |
| V4 | **Exactly one current row** per `(period_month, category)`; a second insert refused | negative control against the partial index |
| V5 | **Double-counting**: `sum(current)` ≠ `sum(all)` after a correction, and every consumer reports `sum(current)` | positive + negative |
| V6 | **Security**: `anon` and `authenticated` denied **by grant** and **by policy**, proven independently; owner RPC succeeds | impersonation |
| V7 | **All CHECK constraints fire**: non-first-of-month date, `amount <= 0`, unknown currency, uppercase category, incoherent supersede | one negative control per constraint |
| V8 | **`platform_cost_available()` does not lie**: with the table present but empty, break-even still blocks with a truthful reason | the §8 trap, tested directly |
| V9 | **FX guarantee**: USD entry + no FX ⇒ net profit blocked, never partially converted | negative control |
| V10 | **Strictly additive**: `v_pnl_daily`, `owner_econ_pnl`, `owner_econ_pnl_summary` digests **bit-identical**; existing `v_breakeven_inputs` columns unchanged in name and type | digest comparison, as M2 did |
| V11 | **Net margin undefined at zero revenue** ⇒ NULL with a reason, never 0 | negative control |
| V12 | **Regression**: Economics 17 PASS + 1 VACUOUS; Cost Engine 20 PASS + 5 VACUOUS + 1 WARN | both suites |

**Population-conservation checks** — the class held back from the verification
framework cycle — apply directly here and are proposed as part of V5.

---

## 16. Open questions requiring your decision

1. **§12 — which block-reason alternative** (1, 2 or 3)?
2. **§4 — `FORCE ROW LEVEL SECURITY`**: accept my recommendation against, or force it?
3. **§1 — keep `change_reason`?**
4. **§3 — `amount > 0`** confirmed, with credit notes deferred?
5. **§11 — RPC grain**: per-month series, period summary, or one RPC with a grain parameter?
6. **§9 — the `platform_cost_egp` NULL→value qualification**: accepted as intended?

---

## Stop

Design complete. **No SQL executed, no migration prepared, no database object
changed, no implementation begun.** `main` untouched; all work on
`claude/phase7-simulator-breakeven`.

**Awaiting your full review and approval, plus decisions on §16, before any
code.**
