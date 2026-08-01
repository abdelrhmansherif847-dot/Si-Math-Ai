# Phase 6 M3 — Implementation & Engineering Review

**Status: implementation complete, NOTHING APPLIED.** Both migrations are
prepared and unapplied; the Release Gate has not begun. Per the owner's M3 workflow:
implementation → engineering review → owner approval → apply + gate.

Branch `claude/phase6-m3-economics-sections-4-6`, cut clean from `main` at
`197a0b3`.

| Scope | Sections 4, 5, 6 |
|---|---|
| Migrations | 2, both **not applied** — `..._m3_operation_mix.sql`, `..._m3_credit_summary.sql` |
| New RPCs | 2 — `owner_econ_operation_mix()`, `owner_econ_credit_summary()` |
| New tables | 0 |
| New views | 0 |
| Existing objects modified | 0 |
| Frozen files touched | 0 |
| `admin.html` deployed | no |

**Revision 2 (2026-08-01).** The owner reviewed r1 and required the Section 4
KPI headline to ship rather than be deferred, approving one additional owner
RPC. `owner_econ_credit_summary()` was added, the Credits panel now renders its
headline server-side, and §5 below records the finding as resolved. Kept as two
migration files so each RPC's rationale stays self-contained; both land in the
same gate.

---

## 1. What was built

| Section | Panel | Data source | Renders today |
|---|---|---|---|
| **4** | Credits Analytics | `owner_econ_credit_summary()` + `owner_econ_credit_flow()` | **live** — full headline + 26 rows |
| **5** | Package Profitability | `owner_econ_package_economics()` | **live revenue**, per-row blocked profit/margin — 2 rows |
| **6** | Question Cost Analytics | `owner_cost_metrics('operation')`, `owner_cost_metrics('stage')`, `owner_econ_operation_mix()` | **fully blocked, with reasons** |

Section 6 is blocked because every figure it wants is cost-derived, and
external cost is zero: 100% of telemetry is internal, which business metrics
exclude (INV-25). The owner approved building it anyway so the dashboard is
structurally complete and unblocks with no code change when external traffic
arrives.

---

## 2. The migrations

### 2a. `owner_econ_operation_mix()` — Section 6

One owner-gated read RPC publishing
`econ.v_operation_service_mix`, which has existed since Phase 5 with no RPC.
The `econ` schema is deliberately unreachable from PostgREST (INV-05, P5-03),
so a view without a wrapper is invisible to the dashboard.

Audited at planning; three econ views lack an RPC:

| View | Disposition |
|---|---|
| `v_operation_service_mix` | **published here** (Section 6) |
| `v_lesson_economics` | Section 7 → M4 |
| `v_breakeven_inputs` | Phase 7 (break-even) |

### The type decision, stated explicitly

M2's gate failed because three RPCs declared `bigint` for a column their view
produced as `numeric` — `sum(bigint)` widens to `numeric`, and a count starts
as `count(*)`, which is `bigint`.

Here `v_operation_service_mix.work_items` is `count(*)`, already `bigint`, so
this RPC declares `bigint` **with no cast — deliberately**.

A defensive `::bigint` would be *actively harmful*: if the view later changed
to `sum(...)` and began yielding `numeric`, the cast would silently truncate
instead of raising `42804`, and **P5-17 would no longer catch it**. Cast only
when the source type genuinely differs and the cast is provably exact — M2's
situation, not this one. Declaring the honest type and letting the descriptor
check fail loudly is the safer engineering choice.

### Pre-apply type validation — the M2 lesson applied

The migration's body query was executed standalone (read-only, nothing
applied) and its output types compared against the declared `RETURNS TABLE`:

| Pos | Body column | Body type | RPC declares | Result |
|---|---|---|---|---|
| 1 | `operation` | text | text | PASS |
| 2 | `service_code` | text | text | PASS |
| 3 | `cost_usd` | numeric | numeric | PASS |
| 4 | `work_items` | bigint | bigint | PASS |
| 5 | `confidence` | text | text | PASS |

This is the exact check that would have caught the M2 defect at authoring time
rather than at the release gate.

### 2b. `owner_econ_credit_summary()` — Section 4

One owner-gated read RPC returning exactly one row of 16 typed columns: the
Section 4 period headline. It reads `econ.v_credit_flow` (the same view the
panel tabulates), `econ.v_revenue_events` for purchased credits,
`public.profiles` for the outstanding-liability snapshot, and
`cost_engine.v_cost_daily` for cost-per-credit. No new view; no new table.

Design decisions are recorded in §5 with the production values.

### The same probe on `owner_econ_credit_summary()` — it caught four real defects

Run against the credit summary's body, the probe **failed on four of sixteen
columns** before anything was applied:

| Pos | Column | Body yields | Declared | First result |
|---|---|---|---|---|
| 4 | `credits_granted` | numeric | bigint | **FAIL** |
| 5 | `credits_refunded` | numeric | bigint | **FAIL** |
| 6 | `credits_consumed` | numeric | bigint | **FAIL** |
| 7 | `net_change` | numeric | bigint | **FAIL** |

**The M2 mechanism reproducing itself.** `econ.v_credit_flow.net_credits` is
already `sum(integer) → bigint`; summing it a second time is `sum(bigint)`,
which widens to `numeric`. `credits_sold` and `liability_credits_now` passed
because they sum `integer` columns directly.

Left unfixed, `owner_econ_credit_summary()` would have been un-callable in
production and the release gate would have failed exactly as M2's did — on a
function written *by* the person who had just fixed that class of bug.

Fixed with `::bigint` on those four columns — and this **is** the case where
casting is correct, by the same rule that says it is wrong in
`owner_econ_operation_mix()`: the source type genuinely differs, and a credit
count is integral so the cast is exact. The two migrations landing in the same
gate, one casting and one deliberately not, is the rule applied consistently
rather than a contradiction.

Re-probed after the fix: **16/16 columns match.**

### A second trap the probe surfaced: integer division

`credits`, `credits_balance` and `credits_granted` are all `integer`, so every
sum is `bigint` — and in PostgreSQL `bigint / bigint` truncates. Written
naively, avg-per-student would have returned **272** instead of **272.57**: a
plausible wrong number rather than an error, which is worse than a crash.

Every ratio therefore casts its numerator to `numeric` first. Verified against
production: `avg_credits_per_user` returns `272.57`.

---

## 3. Invariants — verified, not asserted

| Invariant | Evidence |
|---|---|
| No client-side financial calculation (INV-03) | `reduce`, `+=`, `Math.*`, `parseFloat`, `parseInt`, arithmetic on any RPC field: **0 matches** across the new code |
| Every number traces to a typed column | **28/28** existing-RPC fields verified against `pg_proc.proargnames`; the 16 credit-summary fields verified against the declared `RETURNS TABLE` (16/16) |
| Client isolation (INV-04) | no reference to `consume_credits`, `admin_set_credit_cost`, `admin_adjust_credits`, `approve_payment_request`, `reject_payment_request`, `refund_ai_credit` |
| No provider/model literal (§8.10 rule 10) | 0 matches |
| Internal traffic excluded (INV-25) | `owner_cost_metrics.p_include_internal` defaults to `false`; the panels never override it |
| Owner gate (INV-10) | both new RPCs gated on `has_role_at_least('owner')`, `REVOKE` from PUBLIC/anon |
| Read-only (INV-07) | both new RPCs are `STABLE` + `SECURITY DEFINER` |
| Confidence propagation (INV-27) | badges render each RPC's own `confidence`; never recomputed. `owner_econ_credit_summary` derives its classes from `econ.ledger_confidence` / `econ.cost_confidence` via `worst_confidence`, never assigned |
| JS validity | inline script parses cleanly under `node --check` |

---

## 4. Blocked-state behaviour

Every blocked state carries an explicit reason, and no reason is invented in
the client.

**Section 4** blocks only its one cost-derived figure. `cost_per_credit_usd`
is NULL with `cost_block_reason = 'no_external_ai_cost_in_period'` and its own
`blocked` badge, while every credit metric beside it stays `actual`. A missing
FX rate must not make a counted credit less certain — owner rule 1, revenue and
cost display independently. A ratio with a zero denominator is undefined, not
zero (INV-23).

**Section 5** blocks *per row*: a plan with revenue but no cost shows its
revenue and blocks only profit and margin, printing that row's own
`block_reason` from the RPC. Never a zero.

**Section 6** returns zero rows rather than a `block_reason` — an empty
period, not a blocked computation. Rule 3 still requires it to say why, so the
reason is grounded in `owner_econ_coverage()`'s **typed** `value_external` /
`value_internal` columns:

> no external AI cost to attribute — external is `$0.00000000` while
> `$0.22961425` of internal cost is excluded from business metrics (INV-25)

Both figures are rendered through `ecUsd()` from typed columns. The sentence is
explanatory copy; the numbers in it are not derived.

### One shared helper changed

`ecRpc()` gained a `missing` flag (PostgREST `PGRST202`) so an unapplied
migration renders "Pending migration" rather than a red error — the same
principle as the existing `denied` flag: never let one failure mode wear
another's clothes. M3 ships a panel whose migration is deliberately unapplied,
so this state is real, not hypothetical. The change is additive; existing M1/M2
panels are unaffected.

---

## 5. Section 4's KPI headline — RESOLVED in r2

r1 shipped Section 4 without its headline, because Credits Sold / Granted /
Consumed / liability / burn rate / runway are all **period aggregates over a
daily ledger**, and summing them in JavaScript would violate INV-03. The owner
approved the architecturally correct fix: aggregate on the server.

`owner_econ_credit_summary(p_from, p_to)` returns exactly one row, 16 typed
columns. Values measured against production:

| KPI | Value |
|---|---|
| Period | 2026-06-09 → 2026-07-22 |
| Credits sold (purchased) | 220,500 |
| Credits granted (non-revenue) | 94,500 |
| Credits refunded | 15 |
| Credits consumed | 1,908 |
| Net change | 92,607 |
| Outstanding credits (snapshot) | 236,142 |
| Active students | 7 |
| Avg per student | 272.57 |
| Avg daily burn | 43.36 |
| Runway | 5,445.6 days |
| Cost per credit | **blocked** — `no_external_ai_cost_in_period` |
| Confidence (credits) | `actual` |
| Confidence (cost per credit) | `blocked` |

Arithmetic reconciles: granted 77,500 (`GRANT`) + 17,000 (`ADMIN_ADJUST`) =
94,500; net change 77,500 + 17,000 + 15 − 1,908 = 92,607.

### Three design decisions worth recording

**1. "Credits Sold" cannot come from the credit ledger.** Measured: the ledger
carries exactly four types — `CONSUME`, `ADMIN_ADJUST`, `GRANT`, `REFUND`.
There is **no purchase type**. Credits bought with money are not written to it
as a distinct kind, so `credits_sold` reads `econ.v_revenue_events.credits_granted`,
the approved-payment surface, while `credits_granted` reads the ledger. They are
different columns from different sources, exactly as §Section 4 specifies.

**2. The headline reads the same view the table does.** Totals come from
`econ.v_credit_flow` — what the panel tabulates below — so the headline and the
table reconcile *by construction*, not by coincidence. Only the distinct-user
count reads `credit_transactions` directly, because summing daily distinct users
would double-count anyone active on more than one day.

**3. `liability_credits_now` is deliberately named.** It is
`sum(profiles.credits_balance)`, a point-in-time snapshot that **ignores
`p_from`/`p_to`** — there is no historical balance ledger to reconstruct it per
period. Conflating a snapshot with a period aggregate is precisely the error M2
found in `v_pnl_daily`'s composite confidence, so the column name carries the
distinction rather than relying on documentation, and the panel states it too.

### Still not delivered: avg credits per question

§Section 4 also lists "Avg Credits per Question". It is **deliberately omitted**.
The econ layer's canonical question count is the cost work item, which is
external-only and therefore zero today. The only populated alternative is
`public.question_records` (1,196 rows), and adopting it would put **two
different "questions" denominators on the same dashboard** — the one Section 4
divides by, and the one Sections 5–8 report. That inconsistency is worse than
the missing KPI. It unblocks on its own when external traffic exists. Raised
for the owner rather than resolved unilaterally.

---

## 6. Risk assessment — **LOW**

1. **Nothing is applied.** Both migrations are prepared only.
2. **Zero data risk when applied.** No `INSERT`/`UPDATE`/`DELETE`/`ALTER`; one
   `CREATE OR REPLACE FUNCTION` on an object that does not yet exist.
3. **Zero dependents.** Neither `owner_econ_operation_mix()` nor
   `owner_econ_credit_summary()` exists in production; their only consumers are
   the M3 panels, which are not deployed.
4. **No existing object touched** — no view, no table, no grant, no signature.
5. **Type-validated before apply**, so the M2 failure class cannot recur here.
6. **Covered by existing verification** — `P5-17` discovers `owner_econ_*` from
   the catalog, so the new RPC is checked the moment it exists, with no
   verification change needed.
7. **Rollback is two statements**, neither touching anything else:
   `DROP FUNCTION IF EXISTS public.owner_econ_operation_mix();`
   `DROP FUNCTION IF EXISTS public.owner_econ_credit_summary(date,date);`

**Residual risks, accepted and stated:**

- Section 6 renders entirely blocked on today's data. Correct, but it means the
  panel ships without ever having displayed a populated table in production.
  The blocked path is verified; the populated path is not exercisable until
  external traffic exists.
- Section 4's "avg credits per question" KPI remains undelivered by choice (§5).
- `runway_days` divides a point-in-time liability by a period burn rate. That
  is the standard definition, but it mixes two clocks; the panel labels the
  liability as a snapshot so the mix is visible rather than implied.

---

## 7. Proposed Release Gate (for after approval — NOT run)

| # | Validation | Method |
|---|---|---|
| M3-V1 | Existing surfaces unchanged | digests of `owner_econ_pnl()`, `v_breakeven_inputs`, `v_coverage`, `v_pnl_daily[1-9]` vs the M2 closeout values |
| M3-V2 | New RPCs callable and correct | invoke both as owner; compare `owner_econ_operation_mix()` to `econ.v_operation_service_mix`, and `owner_econ_credit_summary()` totals to `econ.v_credit_flow` |
| M3-V3 | Owner gate holds | `anon` cannot execute either RPC; non-owner gets `42501` |
| M3-V4 | No client-side calculation | static scan of the three new panels |
| M3-V5 | Every number is a typed column | field-to-`proargnames` check |
| M3-V6 | Blocked states carry reasons | Section 4 `cost_block_reason`, Section 5 per-row, Section 6 empty-state |
| M3-V7 | INV-25 upheld | panels exclude internal; coverage split intact |
| M3-V8 | No regression | `verify-economics.sql` (18 checks; P5-17 auto-covers both new RPCs, so its invoked count rises 8 → 10) + `verify-cost-engine.sql` read-only |

---

## Stop point

Implementation and this review are complete. **Awaiting owner review before
applying the migration or beginning the Release Gate.** M4 not started.
