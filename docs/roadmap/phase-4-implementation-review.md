# Phase 4 — Cost Engine: Implementation Review

**Status: PREPARED, NOT APPLIED.** The migration requires individual owner
approval before `apply_migration` (CLAUDE.md §3).

| | |
|---|---|
| Architecture | `docs/roadmap/ai-economics.md` §8 (frozen, r4) |
| Migration | `supabase/migrations/20260731_aiecon_p4_cost_engine.sql` |
| Verification | `scripts/verify-cost-engine.sql` — 28 checks, P4-01…P4-28 |
| Production code touched | **none** — no Edge Function, no frozen file, no existing table |
| Target project | `igvkyxkmjnkzscqgommj` |

---

## 1. What Phase 4 delivers

The Cost Engine: the single source of truth for all AI cost calculations
(§8). It reads Phase 3 telemetry and the Phase 2 catalog, and writes two
grains of immutable fact.

```
ai_catalog (P2) ──┐
                  ├──► run_pricing() ──► cost_facts          (one per CALL)
ai_model_calls ───┘                            │
     (P3)                                      ▼
                       allocate() ──► question_cost_facts    (one per WORK ITEM)
                                               │
                                               ▼
                             v_cost_by_* ──► owner_cost_*()  (STABLE, owner-gated)
```

| Component | Objects |
|---|---|
| Price book | `billing_units`, `rate_cards`, `rate_components`, `discount_rules`, `fx_rates` |
| Cost Calculation (§8.4–8.7) | `run_pricing()`, `resolve_rate_card()`, `price_units()`, `cost_runs`, `cost_facts` |
| Cost Allocation (§8.8) | `allocate()`, `allocation_runs`, `question_cost_facts` |
| Correction path | `recompute()` |
| Rollups (§8.9) | 15 `v_cost_*` views across both grains |
| Owner surface | 6 `owner_cost_*` RPCs |

---

## 2. Phase 3 exit — met, so Phase 4 is unblocked

Measured on production before building:

| Criterion | Required | Actual |
|---|---|---|
| Clean production emission | ≥ 48 h | **53.5 h** (2026-07-29 11:15 → 2026-07-31 16:43) |
| Volume gate | ≥ 20 student questions | **27 questions** |
| Per-service fan-out matches §5.2 | yes | 7 services, 8 stages, shape as designed |
| Every `service_code` resolves to a catalog row | yes | **9/9 combinations → exactly 1 registered binding (100%)** |
| Emission errors | — | **0 failures in 76 rows** |

---

## 3. Validation performed

The migration was executed end-to-end against a **local PostgreSQL 16.13
instance**, not against production. The harness recreates the production
dependencies (`ai_model_calls`, `question_records`, `profiles`, the
`ai_catalog` schema and its 9 real bindings), then loads telemetry covering
every case the engine must handle — **including the four production has zero
instances of today**.

| Case | In production? | In the harness |
|---|---|---|
| Ordinary question, 4-call fan-out | yes (28 requests) | R1 |
| Orphan request, no question record | yes (6 requests) | R4 |
| Internal (admin/owner) traffic | yes (100% of rows) | R7 |
| **One shared call producing N questions** | **no — 0 instances** | R2 (1 vision call → 3 questions) |
| **Follow-up / re-explanation child** | **no — 0 instances** | R3 |
| **A model with no rate card** | **no** | R5 (`gpt-5-turbo`) |
| **A unit code the rate card cannot price** | **no** | R6 (`audio_second`) |

### Results — 26 of 28 checks PASS

The two failures are the harness proving its own injected faults:

| Check | Harness | Why | Production expectation |
|---|---|---|---|
| P4-08 pricing coverage ≥ 99% | FAIL 85.71% | R5 + R6 are deliberately unpriceable (2 of 14 rows) | **PASS** — no unknown model or unit exists in the 76 live rows |
| P4-09 binding resolution ≥ 99% | FAIL 92.86% | R5 uses an unregistered model | **PASS** — 100% measured |

Everything else passed, including the criteria that define the Phase 4 exit:

| Exit criterion (§14) | Check | Evidence |
|---|---|---|
| Every row has one current fact or a stated reason | P4-07, P4-10 | 14/14 facts, 0 unpriced without a reason |
| Service totals reconcile to provider and model totals | P4-15 | `0.00428750` identical across all four rollups |
| Re-running `run_pricing` is a no-op | P4-24 | re-run wrote **0** new facts |
| **Allocation conserves cost exactly** | P4-16, P4-17 | **variance = 0.00000000** |
| **Allocation is byte-identical on re-run** | P4-25 | digest unchanged across two runs |
| Rate-card correction supersedes cleanly, priors intact | P4-26 | 14 current facts unchanged, 14 superseded rows retained, total `0.00428750 → 0.00680750` |
| Conservation survives the correction | P4-27 | holds at the new total |
| Shared parent call + follow-up child, no double count | P4-18, P4-20, P4-23 | split sums back exactly; excess call count = shared multiplicity exactly |
| No cost math outside the engine | P4-02, P4-03 | `rate_cards` has no `service_code`; telemetry has no money column |

**The largest-remainder split, verified by hand.** One vision call costing
`$0.00001750` shared across three questions:

```
0.00000584 + 0.00000583 + 0.00000583 = 0.00001750   exact, no drift
        ▲
        └── the single leftover ulp goes to the lowest work_item_id (§8.8.4)
```

### Two defects the harness caught before they shipped

1. **`owner_cost_metrics` failed at runtime on every call.** Its
   `RETURNS TABLE` column names (`total_cost_usd`, `calls`, …) are in scope as
   PL/pgSQL variables, so unqualified references inside the query were
   ambiguous. PostgreSQL accepts this at `CREATE FUNCTION` time and fails only
   when the function runs — it would have reached production as a dead RPC.
   Fixed by aliasing every internal column away from the output names.
2. **`sum(call_count)` double-counted shared calls in the verification.** The
   original P4-18 asserted work-item call counts equal fact counts, which is
   false by design once a call is shared. Rewritten to prove the excess equals
   the shared multiplicity exactly — a stronger check than the one it replaced.

---

## 4. Deviations from the frozen architecture

The architecture is frozen (§18); these are the three places the
implementation makes a decision the text left open or slightly
under-specified. None change a layer boundary or an invariant.

| # | §8 says | Implementation | Why |
|---|---|---|---|
| D1 | §8.6 step 3 resolves the rate card "against the call's own `created_at`" | Uses `coalesce(started_at, created_at)` | §8.5 defines `occurred_at` as "the economic date", and the Phase 3 integrity review established `started_at` as the economic clock and `created_at` as the write clock. Windowing still uses `created_at`, so late flushes are claimed exactly once. The two differ by milliseconds; only a rate-card boundary landing inside that gap could distinguish them. |
| D2 | §8.8.5 states conservation "for any window W" | `allocate()` asserts conservation over the **affected work items' full call set**, not over the window | A work item's calls can straddle a window boundary (late background calls). Asserting per-window would let a work item be written holding only part of its cost while the window arithmetic still balanced. P4-16 checks the literal §8.8.5 statement over all time, separately. |
| D3 | INV-15 verification is "CI: no `UPDATE`/`DELETE` on `cost_facts` anywhere" | A trigger permits **only** the `is_current` flip and refuses everything else | A blanket no-`UPDATE` rule would forbid the supersede mechanism §8.5 itself prescribes. The trigger states the rule precisely and holds against ad-hoc SQL, not just reviewed diffs — stronger than the grep it replaces. P4-28 proves it. |

---

## 5. Known gaps

| # | Gap | Impact | Resolution |
|---|---|---|---|
| **G1** | `question_records` carries no explicit parent link, so `parent_work_item_id` is always NULL | `thread_cost_usd` equals `total_cost_usd`. **No cost is misstated** — `inherited` moves no cost by design (§8.8.4), so this affects only the inclusive drill-down figure. | Populating it needs one column on `question_records` (a production table — separate approval). The resolver is already in place; the column is the only missing input. `follow_up_type` exists and signals intent, but inferring the parent from session order would be a guess, and a deterministic guess is still a guess. |
| **G2** | `discount_rules.discount_type = 'free_units'` is accepted and recorded but contributes 0 | No effect today — **zero discount rules exist**. `percent` and `fixed_usd` are fully implemented and applied sequentially in priority order. | Implement inside `price_units()` when a free-tier allowance is first negotiated. |
| **G3** | 5 of 10 priced operations still emit no telemetry (`MOCK_*`, `FOCUS_SESSION`, `WEAKNESS_ANALYSIS`) | Their cost is **absent, not wrong** — no fact claims to cover them. | GAP-3, Phase 8. The `work_item_type` enum already accepts them with no schema change. |
| **G4** | Amortization of `flat_month` rate cards is not implemented | No effect — no subscription-priced provider is in use. | `amortization_basis` column exists; implement when one appears. |

---

## 6. Two owner inputs required

These are the only places an external fact enters the system, and neither can
be established by the engine.

### 6.1 ⚠ Rate-card prices are UNVERIFIED

The seeded prices are OpenAI's **published list prices**:

| Model | input | cached input | output |
|---|---|---|---|
| `gpt-4o` | $2.50 / 1M | $1.25 / 1M | $10.00 / 1M |
| `gpt-4o-mini` | $0.15 / 1M | $0.075 / 1M | $0.60 / 1M |

They were not read from an invoice, and the engine has no way to confirm
them. **Until they are checked against a real OpenAI bill, every figure the
engine produces is arithmetically sound but resting on an unverified input.**

Correcting them is data plus a recompute, never an edit to the migration —
and P4-26 proves that path works end to end.

### 6.2 No FX rate is seeded — deliberately

`fx_rates` ships **empty**. Inventing a USD→EGP rate would be an invented
financial figure (INV-22). The consequences are contained and loud:

- `net_cost_usd` is fully valid.
- `net_cost_egp` is NULL, and each fact records `unpriced_reason = 'no_fx'`.
- `owner_cost_health()` reports `missing_fx_month` for every affected month.

To enable EGP:

```sql
INSERT INTO cost_engine.fx_rates (rate_date, usd_to_egp, source)
VALUES (date_trunc('month', now())::date, <real rate>, 'cbe');
SELECT cost_engine.recompute('-infinity','infinity','fx_backfill');
```

---

## 7. What the numbers will actually show on day one

**100% of the 76 live telemetry rows are internal traffic** — one user, an
admin/owner account. This is not a defect, but it determines what the engine
reports the moment it is applied:

- `owner_cost_metrics()` excludes internal traffic by default (INV-25), so the
  **default response will be empty**.
- `owner_cost_metrics('service', …, p_include_internal := true)` will show the
  real spend — all of it yours, from testing v91–v95.
- Student-attributable cost stays at zero until students hit v95 in volume.

An empty default panel is the honest answer here, not a bug to work around.
Estimated total priced spend across all 76 rows, at list prices, is on the
order of **a few cents** — the exact figure lands when the engine runs.

---

## 8. Risks and rollback

| Risk | Severity | Mitigation |
|---|---|---|
| Migration fails midway | low | Single `BEGIN…COMMIT`; a failure leaves nothing behind. Validated end-to-end on PG 16.13. |
| Locks on production tables | low | Only FK references to `ai_model_calls` and `ai_catalog.service_bindings` (brief `ACCESS SHARE`); no existing table is altered, no data rewritten. |
| Wrong prices reach the dashboard | **medium** | §6.1 above. No dashboard exists yet (Phase 6), so nothing renders these numbers before the owner verifies them. |
| Engine writes to production data | none | It only ever reads outside its own schema. |
| Student impact | none | No Edge Function deploy, no request path touched. |
| PG version skew (validated 16.13, production 17.6) | low | No 17-only or 15+-only syntax is used. |

**Rollback** — one statement plus six function drops, listed at the top of the
migration. No production data is destroyed: every input the engine reads lives
outside the schema it drops.

---

## 9. Apply plan

Nothing below has been executed.

1. Owner approves the migration individually (CLAUDE.md §3).
2. `apply_migration` with `20260731_aiecon_p4_cost_engine.sql`.
3. `SELECT cost_engine.run_pricing('-infinity','infinity','initial');`
4. `SELECT cost_engine.allocate('-infinity','infinity','initial');`
5. `psql -f scripts/verify-cost-engine.sql` — expect **28/28 PASS**
   (P4-08 and P4-09 should reach 100%, unlike the harness).
6. Owner verifies the rate cards against a real OpenAI invoice (§6.1).
7. Owner supplies an FX rate if EGP reporting is wanted (§6.2).
8. Scheduling (`run_pricing` + `allocate` every N minutes) is **not** included
   here — it is an operational decision for after the first manual run.

**Phase 5 (AI Economics analytics) stays blocked** until the exit criteria are
confirmed against production data.
