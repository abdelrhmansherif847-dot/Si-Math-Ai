# Phase 4 — Cost Engine: Implementation Review

**Status: PREPARED, NOT APPLIED.** The migration requires individual owner
approval before `apply_migration` (CLAUDE.md §3).

| | |
|---|---|
| Architecture | `docs/roadmap/ai-economics.md` §8 (frozen, r4) |
| Migration | `supabase/migrations/20260731_aiecon_p4_cost_engine.sql` |
| Verification | `scripts/verify-cost-engine.sql` — 31 checks, P4-01…P4-31 |
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

### Results — 28 of 31 checks PASS

(Checks P4-29…P4-31 were added in the second review round; see §10.)

The two failures are the harness proving its own injected faults, and P4-31
WARNs by design for as long as prices remain unverified:

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

### 6.0 How provisional prices are prevented from becoming "trusted numbers"

Rate cards carry `price_confidence` — `list_price` or `invoice_verified` —
and it is **snapshotted onto every cost fact and every work-item fact**, so a
figure's trustworthiness travels with it instead of living only in a
`source_note` nobody joins to.

| Layer | Behaviour while prices are provisional |
|---|---|
| `cost_facts.price_confidence` | `list_price` on every priced fact |
| `question_cost_facts.price_confidence` | worst confidence among contributing calls — one list-priced call taints the whole work item |
| `owner_cost_metrics().confidence` | **`modeled`** — never `actual` |
| `owner_cost_health()` | `price_confidence_list_price = N` |
| `owner_cost_facts()` | returns `price_confidence` per row |
| P4-31 | **WARNs** with the share of total cost that is modeled |

Per §3.4 and INV-22 a `modeled` figure must never render in the same visual
style as an `actual` one — so Phase 6 is obliged to distinguish them, and the
obligation is carried in the data rather than in a comment.

Verified end to end: flipping **only** the `gpt-4o` card to
`invoice_verified` and recomputing moves `judge` and `vision` to
`confidence = actual` while `tutor` and `solver` stay `modeled`, with health
reporting `invoice_verified = 2, list_price = 10`.

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

---

## 10. Second review round — owner questions, 2026-07-31

Four clarifications were requested before approval. Two were answered from
evidence; two exposed real defects, both now fixed and re-validated.

### Q1 — Why a sequential scan on the claim query?

**It was my harness's fault, not the planner's.** The fixture created
`ai_model_calls` with only a primary key and omitted all eight Phase 3
indexes, so no `created_at` index existed to choose. With the real indexes
present the plan is:

```
Index Scan using ai_model_calls_created_idx   (bounded by the window)
  └─ Index Scan using cost_facts_current_call_uidx   (bounded per row)
```

Per-tick cost tracks **new rows, not table size**. Re-timing the same
1,000-call window dropped it from 237 ms to **8.8 ms**. There is no scaling
watch item here, and the earlier caution in §8 of the first review is
withdrawn.

### Q2 — Is the raw `user_id` necessary for the student dimension?

**Yes, and an opaque identifier would not reduce real risk.** Three reasons:

1. Phase 5 must join cost to revenue per student; an opaque key would need
   the same mapping to exist anyway, moving the exposure rather than removing it.
2. Section 8's *abnormal-usage flag* (`cost > revenue`, `> 3σ`) is only
   actionable if the owner can identify who to act on.
3. The consumer is the owner, who already holds full `profiles` access. A
   stable pseudonym is still a stable linkable identifier, so it defends
   against almost nothing while breaking the join.

It remains the only PII-adjacent value the engine returns, reachable solely
through the owner gate. Recorded here as a deliberate decision rather than an
oversight.

### Q3 — How is `cost_target_usd` interpreted? *(defect found and fixed)*

Phase 2 defines it as *"Owner-set optimization target **per `unit_of_work`**"*.
The original implementation compared it against a **cumulative total** — a
total measured against a per-unit rate. All targets are NULL today so nothing
fired, but §15 Q10 directs setting them from measured baselines immediately
after Phase 4, at which point it would have flagged nearly every service.

Now compared as cost-per-unit with the denominator taken from
`services.unit_of_work`:

| `unit_of_work` | Denominator | Services in production |
|---|---|---|
| `question` | distinct `question_record_id` | tutor, solver, judge, difficulty_detector, reference_resolver, truth_engine |
| `call` | call count | sympy, python, embedding, translation |
| `image` / `page` / `document` | **none available in Phase 3 telemetry** | ocr, vision |

An unevaluable target is reported as `service_target_not_evaluable` — never
compared wrongly, never silently skipped. Verified: a `question` target below
actual fires, one above it does not, and an `image` target reports as
unevaluable.

### Q4 — How does the system behave on provisional prices? *(gap found and closed)*

**As originally built, it did not behave well enough.** A fact priced from a
list page was indistinguishable from one priced from an invoice: same
`pricing_status='priced'`, same full numbers. The caveat lived only in
`rate_cards.source_note`, which nothing downstream reads. §3.4 and INV-22
require that a Modeled figure never render like an Actual one, and the
implementation had no way to honour that.

Closed by `price_confidence` — see §6.0. Rate cards declare
`list_price` | `invoice_verified`; it is snapshotted onto every cost fact and
degrades to the weakest input on every work item; `owner_cost_metrics` returns
`confidence` = `modeled` | `actual`; health counts both; P4-31 warns with the
modeled share of total cost.

**Correction propagation**, proven by P4-26 and the verification test:

1. Close the current card at the **start of the affected calls** — not at
   `now()`. This is the counter-intuitive part: closing at `now()` only
   changes future pricing, because §8.4 deliberately never rewrites historical
   prices. My first attempt at this test failed for exactly that reason.
2. Insert the corrected card with `effective_from` at that boundary.
3. `SELECT cost_engine.recompute(from, to, 'rate_card_correction');`
4. Prior facts flip `is_current = false` and are **retained for audit**; new
   facts are written under a new `cost_run`; allocation re-runs and
   re-asserts conservation.

Measured: correcting one model's price rewrote 14 current facts, retained 14
superseded rows, moved the total `0.00428750 → 0.00680750`, and conservation
held exactly. Flipping only `gpt-4o` to `invoice_verified` moved `judge` and
`vision` to `confidence = actual` while `tutor` and `solver` stayed `modeled`.

### Defect found while fixing the above

Adding `shared_conf` to the allocation's shared-cost temp table without
projecting it through the `split` CTE broke `allocate()` outright. It was
masked for two runs because I was redirecting stderr to `/dev/null` while
checking results — the pricing stage still succeeded, so the output looked
plausible. Caught, fixed, and re-validated with errors visible.

**Verification is now 31 checks; 28 pass, P4-08/P4-09 fail by fixture design
(deliberately unpriceable rows), P4-31 warns by design while prices remain
unverified.**

---

## 11. Locked business decisions (owner, 2026-07-31)

Approved with four decisions locked. Three matched the implementation as
built; **decision 4 did not, and the code was changed to match it.**

| # | Decision | Status |
|---|---|---|
| 1 | OpenAI's official published prices are the initial production rate cards; provisional, updatable via `recompute` | **As built.** Seeded as `price_confidence='list_price'`, so every figure reports `confidence='modeled'` until verified (§6.0) |
| 2 | **USD is the canonical accounting currency.** EGP is presentation only, from a configurable rate | **As built**, plus one fix — see below |
| 3 | Internal/admin/owner traffic excluded by default, with an explicit include option | **As built.** `p_include_internal` defaults to `false` on every RPC that has it (INV-25) |
| 4 | **`services.cost_target_usd` is a MONTHLY budget per service** | **CHANGED.** Was implemented as a per-`unit_of_work` target |

### Decision 4 — what changed, and a documentation conflict

The previous round corrected `cost_target_usd` from a cumulative total to a
per-`unit_of_work` target, following the Phase 2 column comment. The owner has
now defined it as a **monthly budget in USD**, which supersedes that reading.

`owner_cost_health()` now emits `service_over_budget` with one row per
breached calendar month per service. The `service_target_not_evaluable`
branch is gone — a monthly budget needs no denominator, so the
`image`/`page`/`document` limitation no longer applies.

**Internal traffic is included in the budget check, deliberately.** Decision 3
excludes internal traffic from *reported metrics*, but a budget measures money
actually owed to the provider, and admin calls cost exactly what student calls
cost. Excluding them would under-report the bill.

> ⚠ **Documentation conflict.** `ai_catalog.services.cost_target_usd` carries a
> Phase 2 `COMMENT ON COLUMN` reading *"Owner-set optimization target per
> unit_of_work"*. That comment is now stale and contradicts decision 4. It is
> metadata only — no behaviour depends on it — but it lives in the applied
> Phase 2 migration, so correcting it is a separate one-line change awaiting
> approval rather than something folded in here silently.

### Decision 2 — one fix it exposed

Making USD canonical and EGP presentation-only means a missing FX rate is a
**presentation gap, not a pricing failure**. `owner_cost_health()` was
grouping `unpriced_reason` over all facts carrying one, which swept in fully
priced facts whose only issue was `no_fx` — reporting a presentation gap as a
pricing failure.

Now the `unpriced_*` breakdown counts only facts with
`pricing_status='unpriced'`, and the EGP gap is reported separately as
`egp_unavailable_facts`. Coverage percentages were never affected (they always
keyed on `pricing_status`); only the health readout was misleading.

---

## 12. Applied to production — 2026-07-31

**Phase 4 is APPLIED and VERIFIED.** Migration history on
`igvkyxkmjnkzscqgommj`: `aiecon_p4_cost_engine`, then
`aiecon_p4_fix_work_item_spans_requests`.

### The production-only defect

The first production allocation run failed. `allocate()` grouped work items by
`(question_record_id, request_id)`, assuming a question belongs to exactly one
request. Production disproved it within 76 rows: `reference_resolver` resolved
a follow-up **against an earlier question, in a different request, 26 seconds
later** — the exact case architecture §8.8.1 lists. The grouping emitted two
rows for one work item and hit `qcf_current_item_uidx`.

**It failed closed, exactly as designed:** 0 work-item facts, 0 allocation
runs, no partial state, pricing untouched. That is the fail-closed contract in
§8.8.5 doing its job on its first real test.

**Why the harness could not catch it.** Every fixture question belonged to a
single request. R2 modelled *one request → many questions*; the inverse —
*one question ← many requests* — was absent, so the resolver's assumption was
never exercised. The fixture now contains the production case (R8).

**The fix** (`alloc-1.0.0` → `alloc-1.0.1`): a work item is a **question**,
full stop; scope is the transitive closure of requests sharing a work item;
the shared split stays per-request but is summed per work item. `request_id`
on a work-item fact is now the **originating** request, so
`v_cost_by_request` attributes an item to the request that created it.

`P4-19` was rewritten as a consequence: comparing request_id *sets* was a
false premise once a work item can span requests. It now proves every cost
fact is represented by the resolver's own rules, which is the property that
actually matters.

### Verification results — production

| Check | Result | Detail |
|---|---|---|
| P4-01…P4-06 structure & posture | **PASS** | 9/9 tables; no `service_code` on rate_cards; no money column on telemetry; anon/authenticated denied; 6/6 RPCs STABLE+SECURITY DEFINER; 0 executable by anon |
| P4-07 every row has a fact | **PASS** | 76 telemetry rows, 76 current facts, 0 missing |
| P4-08 pricing coverage | **PASS** | **100.00%** |
| P4-09 binding resolution | **PASS** | **100.00%** registered |
| P4-10…P4-14 fact integrity | **PASS** | every unpriced fact states why; unknown is NULL not 0; every priced fact traces to a rate card; every fact traces to telemetry; exactly one current fact per call |
| P4-15 hierarchy reconciliation | **PASS** | facts = service = provider = model = **$0.22961425** |
| P4-16 conservation (all time) | **PASS** | allocated = priced = $0.22961425, **variance 0.00000000** |
| P4-17 run-level conservation | **PASS** | conserved=true, variance 0 |
| P4-18 no call double-counted | **PASS** | 76 = 76, excess 0 |
| P4-19 every call reaches a work item | **PASS** | 0 unrepresented facts |
| P4-20 shared split lossless | **PASS** | 0 requests with shared cost (none exist yet) |
| P4-21…P4-23 completeness & thread | **PASS** | no mislabelled aggregates; no `unknown` reporting a number; thread ≥ total everywhere |
| P4-24 idempotence | **PASS** | re-run wrote **0** new facts |
| P4-25 determinism | **PASS** | allocation byte-identical on re-run; 2 runs, all conserved |
| P4-28 immutability | **PASS** | money-column UPDATE and DELETE both refused; 76 facts intact, sum unchanged |
| P4-29 / P4-30 price confidence | **PASS** | every priced fact carries confidence; no item overclaims `invoice_verified` |
| P4-31 unverified prices | **WARN** *(by design)* | **76 of 76 priced facts use list prices — 100% of cost is `modeled`, not `actual`** |
| P4-26 / P4-27 rate-card correction | **not run in production** | Proven locally twice. Running it against production would rewrite all 76 facts and double the table to re-prove identical code. Available on request. |

### First production numbers

**Total AI spend: $0.2296** across 76 calls, 33 work items (27 questions +
6 orphan buckets), **all `complete`**.

| Service | USD | Calls | Share |
|---|---|---|---|
| tutor | 0.13585640 | 33 | 59.2% |
| solver | 0.04005330 | 18 | 17.4% |
| judge | 0.02307750 | 9 | 10.0% |
| vision | 0.01645500 | 5 | 7.2% |
| ocr | 0.01377500 | 5 | 6.0% |
| reference_resolver | 0.00027720 | 1 | 0.1% |
| difficulty_detector | 0.00011985 | 5 | 0.1% |

Average cost per question **$0.00831**; most expensive work item **$0.04027**.

**All 76 facts are internal traffic; 0 external.** So
`owner_cost_metrics()` with its default `p_include_internal := false` returns
an empty set — correct behaviour under decision 3, not a fault. Student-
attributable cost begins accruing when students hit v95 in volume.
