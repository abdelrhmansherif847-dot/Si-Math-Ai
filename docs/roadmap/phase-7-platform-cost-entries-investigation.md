# D-D — `platform_cost_entries`: Investigation

**Investigation only. No design committed, no code written, no migration
prepared, no database object changed.** Per your ruling: *"لا تصمم أي شيء حتى
الآن"* — the design follows in a separate deliverable, after you review this.

Branch `claude/phase7-simulator-breakeven`.

---

## 0. The headline finding

**This table is already specified in the architecture, and the codebase already
contains a working seam waiting for it.** Phase 7 is not designing this from
scratch — it is completing something Phase 5 deliberately left open.

Three pieces already exist in production:

| Artefact | What it does |
|---|---|
| `docs/roadmap/ai-economics.md` **§9.4** | gives a full `CREATE TABLE` for `public.platform_cost_entries` |
| `econ.platform_cost_available()` | `SELECT to_regclass('public.platform_cost_entries') IS NOT NULL` |
| `econ.v_breakeven_inputs` | emits `platform_cost_egp` as a hardcoded `NULL`, and blocks with `no_platform_cost_source` |

**And that seam contains a trap.** Availability is detected by **table existence
alone**. The moment `public.platform_cost_entries` is created — even completely
empty — `platform_cost_available()` flips to `true` and the
`no_platform_cost_source` block reason **disappears**. But `platform_cost_egp` is
hardcoded `NULL::numeric` in the view, so break-even would then report *"platform
cost source available"* while showing no platform cost at all.

> **Creating the table and updating `v_breakeven_inputs` must happen in the same
> migration.** Creating the table alone produces a silently wrong state — a
> metric that stops saying why it is blocked without becoming computable.

This is the single most important constraint found, and it is not written down
anywhere today.

---

## 1. Purpose

From §9.4, verbatim intent:

> Owner-entered, applied by Economics at the P&L level only — deliberately
> outside the Cost Engine, because it is not attributable to a call. Gross profit
> needs only the engine; **net** profit needs this. Until it is populated, Net
> Profit and Net Margin render as **Blocked** — the module must not silently
> report gross as net.

Restated as the requirement it imposes: this table is the **sole source of
non-AI fixed cost**. It exists because a Supabase or Vercel invoice cannot be
attributed to any `ai_model_calls` row, so the Cost Engine — whose entire model
is per-call attribution — correctly refuses to hold it.

**It is a P&L input, never a cost-engine input.** Nothing in `cost_engine` may
read it, or the layer boundary (INV-05, §8.10 rule 8) inverts.

---

## 2. Schema — already specified

§9.4 gives this:

```sql
CREATE TABLE public.platform_cost_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,       -- first day of month
  category     text NOT NULL,       -- 'supabase'|'vercel'|'domain'|'payment_fees'|…
  amount       numeric(12,2) NOT NULL,
  currency     text NOT NULL DEFAULT 'USD',
  note         text NULL,
  UNIQUE (period_month, category)
);
```

**What the specified schema does not carry**, measured against the rest of this
codebase:

| Missing | Why it matters |
|---|---|
| `created_at` / `updated_at` | every comparable table has at least `created_at` (`credit_costs`, `fx_rates`, `role_audit_log`) |
| `created_by` / `updated_by` | no way to attribute an owner-entered financial figure to a person |
| Any supersede/versioning column | `UNIQUE (period_month, category)` forces **edit-in-place**, which conflicts with `cost_facts`' immutability posture — see §6 |
| Any `active` / soft-delete flag | `credit_costs` has `active`; deletion here would erase financial history |
| CHECK constraints | `amount` may be negative; `period_month` need not be the first of a month; `currency` is unconstrained free text |

---

## 3. Required columns — derived from the consumers

Working backwards from what actually reads it:

| Consumer | Needs |
|---|---|
| `econ.v_breakeven_inputs.platform_cost_egp` | a **monthly** total, **in EGP** |
| Net Profit / Net Margin (§9.4, does not exist yet) | monthly total, EGP, per P&L period |
| Section 11 break-even `fixed_costs` | monthly total, EGP |
| Coverage board `platform_costs` | existence + populated-ness, to unblock |

So the minimum viable column set is `period_month`, `amount`, `currency`, plus
whatever the category breakdown is for. **Category is not required by any current
consumer** — no reader groups by it. It earns its place for owner comprehension
("what am I actually paying for"), not for any computation. Worth confirming you
want it, since it also drives the `UNIQUE` constraint and therefore the whole
CRUD model.

### The currency problem is the real blocker

| Fact | Consequence |
|---|---|
| §9.4 defaults `currency` to `'USD'` | entries will typically be USD |
| Every consumer wants **EGP** (`platform_cost_egp`) | conversion is mandatory |
| `cost_engine.fx_rates` has **0 rows** | **no conversion is possible today** |
| Revenue is EGP-only; AI cost USD-only | this is the same currency bridge already blocking P&L |

**Net Profit will stay blocked after this table is populated, unless FX is
populated too.** Populating `platform_cost_entries` alone does not unblock
break-even. That needs saying plainly now, because the roadmap's phrasing
("Until it is populated, Net Profit … render as Blocked") reads as though the
table is the only obstacle. It is not.

An alternative worth your ruling: allow `currency = 'EGP'` entries to bypass FX
entirely, so an owner paying an Egyptian invoice in EGP can produce a real net
profit figure without an FX rate ever existing.

---

## 4. Ownership

| Question | Evidence |
|---|---|
| Who may write? | §9.4 says "Owner-entered". `change_user_role` shows the strict precedent — `role IS DISTINCT FROM 'owner' → RAISE EXCEPTION` |
| Who may read? | every other economics surface is owner-gated via `has_role_at_least('owner')` |
| Which schema? | **`public`** — forced, not chosen. `platform_cost_available()` hardcodes `to_regclass('public.platform_cost_entries')` |

The schema choice is already made and cannot be revisited without also changing
`platform_cost_available()`.

**This is the module's first write surface.** Every AI-Economics object to date
is `STABLE` and read-only (INV-07). A write path does not break INV-07 — that
invariant governs *reporting* functions — but it is a genuine boundary crossing
and needs its own guardrail so a reporting RPC can never become a writer by
accident.

---

## 5. Permissions

Two viable patterns already exist in this codebase, and they differ:

| Pattern | Example | Shape |
|---|---|---|
| **RLS + direct table access** | `credit_costs` — RLS on, one policy `credit_costs_public_read (r)` | client reads the table directly; writes go through a `SECURITY DEFINER` RPC |
| **RPC-only, no direct grant** | every `owner_econ_*` / `owner_cost_*` | schema not reachable; all access via owner-gated RPC |

Note `credit_costs` is **publicly readable** — deliberately, since students see
credit prices. **Platform costs are the opposite**: supplier invoices are among
the most sensitive figures in the business. They must not inherit the
`credit_costs` pattern.

Constraint worth stating: because the table must live in `public` (§4), it is in
a PostgREST-reachable schema — unlike `econ`, which is protected by having
`USAGE` revoked wholesale. **RLS is therefore mandatory here**, not optional; it
is the only thing standing between `authenticated` and the invoice figures.

---

## 6. Lifecycle — the sharpest unresolved conflict

`UNIQUE (period_month, category)` means one row per category per month, which
implies **UPDATE in place** when a figure is corrected.

That directly contradicts the posture of the adjacent financial table:

```
cost facts are immutable (INV-15): only is_current may change;
supersede with a new run instead
```

`cost_engine.cost_facts` carries a `cost_facts_freeze` trigger that **raises on
any DELETE** and on any UPDATE other than `is_current`.

So the project holds two incompatible models for financial rows:

| Model | Used by | Correction mechanism |
|---|---|---|
| **Immutable + supersede** | `cost_facts`, `question_cost_facts` | write a new row, flip `is_current` |
| **Mutable + unique key** | `credit_costs`, `system_settings` | UPDATE in place |

**§9.4 specifies the mutable model. I am not going to assume that is right.**
An owner correcting last month's Supabase bill from $25 to $30 changes a
*historical financial figure*, and under the mutable model the original value is
gone — no audit trail, no way to explain why last month's net profit changed.

This is the decision that most needs your ruling, and I have deliberately not
made it.

---

## 7. CRUD model

Follows directly from §6 and is unresolved with it:

| Operation | Under mutable model | Under immutable model |
|---|---|---|
| Create | INSERT | INSERT |
| Read | owner-gated RPC | owner-gated RPC |
| Update | UPDATE in place (history lost) | INSERT superseding row, flip `is_current` |
| Delete | DELETE (history erased) | forbidden — supersede with `amount = 0`, or an `active` flag |

**Recommendation deferred to the design step**, but the evidence points one way:
this table holds figures that feed a reported profit number, and every *other*
table feeding a reported profit number in this project is immutable.

---

## 8. Validation — nothing is specified today

§9.4 has no CHECK constraints. Gaps found:

| Rule | Currently possible | Should it be? |
|---|---|---|
| `amount >= 0` | a negative platform cost is accepted | is a credit/refund a legitimate negative, or an error? |
| `period_month` is the 1st of a month | any date accepted; `2026-07-17` would silently create a second "July" bucket alongside `2026-07-01` | almost certainly must be constrained |
| `currency` ∈ known set | free text; `'usd'`, `'US$'`, `'Usd'` all accepted and would not match a conversion lookup | needs a CHECK or FK |
| `category` ∈ known set | free text; `'vercel'` and `'Vercel'` become two rows past the UNIQUE key | needs a decision: free text vs enumerated |

The `period_month` and `currency` gaps are the dangerous ones — both silently
produce wrong totals rather than errors.

---

## 9. Audit trail

**No audit exists in the §9.4 schema.** The codebase precedent is
`public.role_audit_log`:

```
id bigint, changed_at timestamptz, actor_id uuid,
target_id uuid, old_role, new_role, reason text
```

That is the shape used for the one other owner-only privileged mutation
(`change_user_role`). It records **actor, before, after, and reason**.

If platform costs are mutable (§6), an equivalent log is not optional — it is the
only way to answer *"why did last month's net profit change?"*. If they are
immutable-with-supersede, the table **is** its own audit trail and a separate log
is redundant.

**The lifecycle ruling in §6 therefore determines the audit design.** They cannot
be decided independently.

---

## 10. Effect on the Simulator (Section 10)

**Measured: none, under the current specification.**

§11's scenario grammar contains no platform-cost key — the simulator's scope is
`service_swap`, `model_swap`, `rate_override`, `routing`, `discounts`, `fx`,
`packages`, `operations`, `demand`. Platform cost is not among them, and
`owner_cost_reprice` operates on `cost_facts`, which by §1 must never see this
table.

Two consequences worth confirming:

1. The simulator can answer *"what happens to **AI cost** and **gross** profit"*
   but **not** *"what happens to **net** profit"*, since net needs fixed costs.
2. If you ever want a "what if we move off Vercel" scenario, that is a **new
   scenario key** and a scope change — not something this table gives for free.

**Assumption stated explicitly:** I am treating the simulator as out of scope for
platform costs unless you say otherwise.

---

## 11. Effect on Break-even (Section 11)

This is the table's primary consumer. §12's formula:

```
Required Revenue = fixed_costs / (1 − variable_cost_ratio)
variable_cost_ratio = ai_cost / revenue
```

`fixed_costs` **is** this table. Without it, §12 computes nothing — which is why
all 14 months currently block.

Measured chain, traced rather than assumed:

```
v_breakeven_inputs → econ.v_pnl_daily → business cost side (internal excluded)
                   → 0 external cost → ai_cost NULL → 'no_cost_in_period'
```

**Break-even is blocked twice over**, and this table fixes only one of them:

| Blocker | Fixed by this table? |
|---|---|
| `no_platform_cost_source` | **yes** |
| `no_cost_in_period` — 0 external priced facts | **no** |
| `ai_cost_egp` NULL — 0 FX rates | **no** |

So: **populating `platform_cost_entries` will not, by itself, produce a single
unblocked break-even month.** Stating this now to prevent the expectation that
M2 lights up Section 11.

---

## 12. Effect on P&L

| Surface | Today | After this table |
|---|---|---|
| `econ.v_pnl_daily` | has `gross_profit_egp`, `gross_margin_pct` — **no net columns at all** | net profit requires **new columns**, i.e. modifying a Phase 5 view |
| Coverage `platform_costs` | `blocked` — *"no source table for platform spend (§9.4); net profit and break-even cannot be computed"* | unblocks on table existence |
| Net Profit / Net Margin | **do not exist anywhere** | must be created |

Two structural notes:

1. **Net profit is monthly; `v_pnl_daily` is daily.** Fixed costs have no daily
   grain — apportioning a monthly invoice across days would be an invention.
   Net profit likely belongs at the **monthly** grain, not in `v_pnl_daily` at
   all. Where it lives is a design decision, not a detail.
2. §9.4's rule is absolute and must be enforced, not just documented: *"the
   module must not silently report gross as net"*. Gross and net must remain
   visibly distinct labels wherever both appear.

---

## Summary of what this investigation found

| # | Finding |
|---|---|
| 1 | **The table is pre-specified** in §9.4 and a seam already exists — this is completion, not greenfield design |
| 2 | **Creating the table alone silently breaks break-even's block reason.** Table + `v_breakeven_inputs` must change together |
| 3 | **The specified schema has no audit, no timestamps, no actor, no CHECK constraints** |
| 4 | **`UNIQUE (period_month, category)` forces edit-in-place**, contradicting `cost_facts`' immutability — unresolved |
| 5 | **Currency is the real blocker.** USD entries + 0 FX rows = net profit still blocked. EGP entries could bypass it |
| 6 | **The table must live in `public`** — forced by `platform_cost_available()` — so **RLS is mandatory**, unlike `econ` |
| 7 | **It must not follow the `credit_costs` pattern**, which is publicly readable |
| 8 | **Populating it unblocks nothing on its own** — break-even is blocked three ways, this fixes one |
| 9 | **Net profit columns do not exist** and probably belong at monthly grain, not in `v_pnl_daily` |
| 10 | **No simulator impact** under the current spec — stated as an assumption for you to confirm |

## Questions the design step needs answered

1. **Mutable or immutable?** (§6) — this determines the audit design too.
2. **Is `category` required?** No consumer reads it; it drives the UNIQUE key.
3. **Is a negative `amount` legitimate** (credit note) or an error?
4. **Should EGP entries bypass FX**, so net profit is reachable without an FX rate?
5. **Where does net profit live** — new monthly view, or new columns on an
   existing one?
6. **Confirm the simulator is out of scope** for platform costs.

---

## Stop

Investigation complete. **No design committed, no code, no migration, no database
change.** Awaiting your review before I present the design.
