# Engineering review — M2 migration (`aiecon_p6_m2_pnl_summary`)

**Scope:** one migration. Extends `econ.v_pnl_daily` with two appended columns
(`revenue_confidence`, `cost_confidence`) and creates one RPC,
`public.owner_econ_pnl_summary(date,date)`. Nothing applied; every claim below
is measured, not asserted.

---

## 1. Backward compatibility — CONFIRMED, by digest

The strongest available proof: on a local database carrying the full applied
stack (P4 + P5 + P6-coverage) and production-shaped data, every existing
consumer surface was digested **before and after** applying this migration:

| Surface | Before | After |
|---|---|---|
| `owner_econ_pnl()` full output | `2bc7cfe5…` | **identical** |
| `v_pnl_daily` first 9 columns | `5bfdf4cc…` | **identical** |
| `v_breakeven_inputs` full output | `c4866516…` | **identical** |
| `v_coverage` full output | `4e2f6137…` | **identical** |

Byte-identical on all four. Column shape after: positions 1–9 unchanged in
name, type and expression; `revenue_confidence`, `cost_confidence` appended at
10–11.

**Positional assumptions.** Checked every consumer class:
- `owner_econ_pnl()` selects named columns and its `RETURNS TABLE` is
  unchanged — its callers cannot observe the view change at all.
- `v_breakeven_inputs` and `v_coverage` reference named columns; neither uses
  `SELECT *` in a way that captures the column list (and even a stored `*`
  expansion would keep the old list, which is safe).
- Phase 5's verification suite (17 checks) re-run after the change: **17/17**.
- No dashboard consumes `v_pnl_daily` positionally — the only UI consumer is
  the unreleased M2 code, which selects by name.

*(A first attempt at this proof compared two empty files because the local
server had not started — caught because the "before" file had zero lines. The
digests above are from the corrected run, with line counts checked.)*

## 2. Dependency impact — from `pg_depend`, production

**`econ.v_pnl_daily`** — three dependents, no more:

| Dependent | Effect |
|---|---|
| `econ.v_breakeven_inputs` | reads named columns; output digest identical |
| `econ.v_coverage` | references it in `EXISTS` only; digest identical |
| `public.owner_econ_pnl()` | fixed named projection; digest identical |

**`public.owner_econ_pnl_summary()`** — does not exist in production yet
(verified). Post-migration it will have **zero** dependents; its only consumer
is the unreleased M2 frontend.

**Known-latent, out of scope:** `v_breakeven_inputs` aggregates the daily
*composite* confidence, so it carries the same granularity-conflation defect
fixed here for the summary. It is unreachable today (break-even is blocked on
`no_platform_cost_source`) and this migration does not touch it — the digest
proves that. It should be fixed with the same component-confidence approach in
the milestone that builds break-even. Flagged now so it is a decision, not a
discovery.

## 3. Migration safety

- **Transactional:** `apply_migration` wraps the file; it lands whole or not
  at all.
- **Additive:** no `DROP` of any existing object, no data touched, no table
  DDL, no lock beyond the momentary `ACCESS EXCLUSIVE` on the two *view*
  relations being replaced — views hold no data, so this is milliseconds and
  cannot block writers to any table.
- **Idempotent:** both statements are `CREATE OR REPLACE`; a second apply was
  run locally and is clean. (The M1 `DROP FUNCTION` trap does not apply here:
  the summary RPC is new, and the view change appends — the one shape
  `CREATE OR REPLACE VIEW` permits.)
- **Rollback:** two tiers.
  - *Realistic:* `DROP FUNCTION public.owner_econ_pnl_summary(date,date);` —
    one statement. The two appended view columns are inert without it and can
    stay.
  - *Full revert of the view:* `CREATE OR REPLACE VIEW` cannot remove columns,
    so restoring the 9-column shape means dropping `v_coverage` and
    `v_breakeven_inputs` first, recreating `v_pnl_daily` from the Phase 5
    definition, then replaying those two views' current definitions. Scripted
    in the migration header; ~5 statements, no data at risk at any point.

## 4. Performance — measured, not estimated

**Production, today's volume** (`EXPLAIN ANALYZE` of the summary aggregation
over `econ.v_pnl_daily`): **13.2 ms execution, 54 shared buffers, zero disk
reads.** Revenue rows resolve via `payment_requests_status_idx` and
`idx_payments_user_status` (both already exist); cost resolves via a seq scan
of the 76-row `cost_facts` table, which is correct at that size.

**Does the summary scan more than the existing implementation?** No. It reads
`econ.v_pnl_daily` exactly once — the same single pass `owner_econ_pnl()`
makes — plus one aggregate over ≤ number-of-days rows and two `array_agg`
calls of the same cardinality.

**Scale test** (local, 1,000 annual subscriptions ≈ 365,000 generated
recognition rows, ~190× today's expansion):

| Query | Time |
|---|---|
| existing `owner_econ_pnl()` (full read) | 689 ms |
| new `owner_econ_pnl_summary()` | 1,329 ms |

Same order of magnitude; the growth driver is shared. Which surfaces the one
real scalability item, and it is **pre-existing, not introduced here**:
`v_revenue_recognized_daily` expands `generate_series` per event × period-days
on every evaluation (an annual subscription = 365 rows), and `v_pnl_daily`
evaluates that expansion twice (once for its day spine, once for the revenue
aggregate). At ~10,000 annual subscriptions this reaches seconds per load. The
remedy — materialising the recognition view on a refresh schedule, or
date-bounding the default window — is explicitly §18.2 implementation tuning,
not architecture, and is not needed at current or near-term volume.

## 5. Production validation plan (after apply)

| # | Check | Method | Expected |
|---|---|---|---|
| V1 | Existing dashboards unaffected | `owner_econ_pnl()`, `owner_econ_coverage()` digests vs pre-apply capture | identical output |
| V2 | Existing RPC results identical | re-run the four-surface digest against production | identical |
| V3 | Overview is server-side only | re-run the INV-03 scan over the tab (no money arithmetic, no reduce/sum) | NONE |
| V4 | Confidence correct | `owner_econ_pnl_summary()` → `confidence='blocked'` while blocked; local State-B proof already shows `modeled` when computable | matches |
| V5 | Blocked-state unchanged | summary returns `block_reason='no_fx_rate'`, profit/margin NULL, never 0 | matches |
| V6 | AI Cost panel INV-25 | `owner_econ_service_economics()` returns 0 rows (all cost internal); panel renders the explicit INV-25 reason, not an empty grid | matches |
| V7 | Phase 5 regression | all 17 P5 checks against production | 17/17 |
| V8 | Summary agrees with dailies | `days_total` = row count of `owner_econ_pnl()`; revenue/cost totals equal the view's sums computed server-side | exact |

## 6. Risk rating — **LOW**

Justification, in evidence order:

1. **Byte-identical digests** on every existing surface — backward
   compatibility is measured, not argued.
2. **Complete dependency graph** (3 dependents, all verified unaffected;
   the new RPC has none).
3. **Additive + transactional + idempotent + trivially rollbackable** — no
   data is touched at any point, so the worst case of any failure mode is
   "the new RPC doesn't exist yet".
4. **13 ms in production; 1.3 s at 190× volume** — no plausible near-term
   load makes this migration the bottleneck, and the one long-run concern is
   pre-existing and documented with its remedy.
5. The only defect class this migration *could* introduce — wrong confidence
   on the new surface — is exactly the thing it was rewritten to fix, and both
   states (blocked / computable) are proven locally with no code change
   between them.

**Unresolved concerns: none.** Two items flagged for later, neither blocking:
the latent composite-confidence aggregation in `v_breakeven_inputs` (fix when
break-even is built), and the recognition-view expansion at ~10k-subscription
scale (§18.2 tuning when volume warrants).
