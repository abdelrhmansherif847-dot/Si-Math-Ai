# Phase 6 M3 — Implementation & Engineering Review

**Status: implementation complete, NOTHING APPLIED.** The migration is prepared
and unapplied; the Release Gate has not begun. Per the owner's M3 workflow:
implementation → engineering review → owner approval → apply + gate.

Branch `claude/phase6-m3-economics-sections-4-6`, cut clean from `main` at
`197a0b3`.

| Scope | Sections 4, 5, 6 |
|---|---|
| Migration | 1 — `20260801_aiecon_p6_m3_operation_mix.sql` (**not applied**) |
| New tables | 0 |
| New views | 0 |
| Existing objects modified | 0 |
| Frozen files touched | 0 |
| `admin.html` deployed | no |

---

## 1. What was built

| Section | Panel | Data source | Renders today |
|---|---|---|---|
| **4** | Credits Analytics | `owner_econ_credit_flow()` | **live** — 26 rows |
| **5** | Package Profitability | `owner_econ_package_economics()` | **live revenue**, per-row blocked profit/margin — 2 rows |
| **6** | Question Cost Analytics | `owner_cost_metrics('operation')`, `owner_cost_metrics('stage')`, `owner_econ_operation_mix()` | **fully blocked, with reasons** |

Section 6 is blocked because every figure it wants is cost-derived, and
external cost is zero: 100% of telemetry is internal, which business metrics
exclude (INV-25). The owner approved building it anyway so the dashboard is
structurally complete and unblocks with no code change when external traffic
arrives.

---

## 2. The migration

`public.owner_econ_operation_mix()` — one owner-gated read RPC publishing
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

---

## 3. Invariants — verified, not asserted

| Invariant | Evidence |
|---|---|
| No client-side financial calculation (INV-03) | `reduce`, `+=`, `Math.*`, `parseFloat`, `parseInt`, arithmetic on any RPC field: **0 matches** across the new code |
| Every number traces to a typed column | **28/28** consumed fields verified against `pg_proc.proargnames` |
| Client isolation (INV-04) | no reference to `consume_credits`, `admin_set_credit_cost`, `admin_adjust_credits`, `approve_payment_request`, `reject_payment_request`, `refund_ai_credit` |
| No provider/model literal (§8.10 rule 10) | 0 matches |
| Internal traffic excluded (INV-25) | `owner_cost_metrics.p_include_internal` defaults to `false`; the panels never override it |
| Owner gate (INV-10) | new RPC gated on `has_role_at_least('owner')`, `REVOKE` from PUBLIC/anon |
| Read-only (INV-07) | new RPC is `STABLE` |
| Confidence propagation (INV-27) | badges render the RPC's own `confidence`; never recomputed |
| JS validity | inline script parses cleanly under `node --check` |

---

## 4. Blocked-state behaviour

Every blocked state carries an explicit reason, and no reason is invented in
the client.

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

## 5. Finding: Section 4 cannot show its KPI headline

**This is the one place M3 delivers less than the architecture specifies, and
it is a deliberate stop rather than an oversight.**

§Section 4 lists period KPIs — Credits Sold, Credits Granted, Credits Consumed,
Remaining Credits (liability), Avg per Student, Avg per Question, burn rate /
runway. All are **period aggregates over the daily flow**.

`owner_econ_credit_flow()` returns daily × transaction-type rows. Producing the
headline would mean summing those rows in JavaScript — a financial calculation
in the client, which INV-03 forbids and which is exactly what M2's
`owner_econ_pnl_summary()` was created to avoid.

The consistent fix is a second RPC, `owner_econ_credit_summary()`. The owner
constrained M3 to **one migration only**, so I did not write it. The panel
therefore renders the flow table and states plainly that period totals are not
shown because they must be aggregated server-side.

**Recommendation:** authorise `owner_econ_credit_summary()` as a second M3
migration, or schedule it for M4. Either is fine; silently summing in the
client is not.

---

## 6. Risk assessment — **LOW**

1. **Nothing is applied.** The migration is prepared only.
2. **Zero data risk when applied.** No `INSERT`/`UPDATE`/`DELETE`/`ALTER`; one
   `CREATE OR REPLACE FUNCTION` on an object that does not yet exist.
3. **Zero dependents.** `owner_econ_operation_mix()` does not exist in
   production; its only consumer is the M3 panel, which is not deployed.
4. **No existing object touched** — no view, no table, no grant, no signature.
5. **Type-validated before apply**, so the M2 failure class cannot recur here.
6. **Covered by existing verification** — `P5-17` discovers `owner_econ_*` from
   the catalog, so the new RPC is checked the moment it exists, with no
   verification change needed.
7. **Rollback is one statement**: `DROP FUNCTION IF EXISTS
   public.owner_econ_operation_mix();`

**Residual risks, accepted and stated:**

- Section 6 renders entirely blocked on today's data. Correct, but it means the
  panel ships without ever having displayed a populated table in production.
  The blocked path is verified; the populated path is not exercisable until
  external traffic exists.
- Section 4's headline gap (§5 above).

---

## 7. Proposed Release Gate (for after approval — NOT run)

| # | Validation | Method |
|---|---|---|
| M3-V1 | Existing surfaces unchanged | digests of `owner_econ_pnl()`, `v_breakeven_inputs`, `v_coverage`, `v_pnl_daily[1-9]` vs the M2 closeout values |
| M3-V2 | New RPC callable and correct | invoke as owner; compare to `econ.v_operation_service_mix` |
| M3-V3 | Owner gate holds | `anon` cannot execute; non-owner gets `42501` |
| M3-V4 | No client-side calculation | static scan of the three new panels |
| M3-V5 | Every number is a typed column | field-to-`proargnames` check |
| M3-V6 | Blocked states carry reasons | Section 5 per-row, Section 6 empty-state |
| M3-V7 | INV-25 upheld | panels exclude internal; coverage split intact |
| M3-V8 | No regression | `verify-economics.sql` (19 checks incl. P5-17 covering the new RPC) + `verify-cost-engine.sql` read-only |

---

## Stop point

Implementation and this review are complete. **Awaiting owner review before
applying the migration or beginning the Release Gate.** M4 not started.
