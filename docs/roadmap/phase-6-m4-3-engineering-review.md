# Phase 6 M4.3 — AI Service & Model Analytics: Implementation & Engineering Review

**Status: implementation complete, NOTHING APPLIED.** The migration is prepared
and unapplied; no Release Gate has begun.

Branch `claude/phase6-m4-3-service-model-analytics`, cut clean from `main` at
`e6abc2b`.

| Scope | Section 9 — AI Service & Model Analytics |
|---|---|
| Migration | 1 — `20260801_aiecon_p6_m4_3_service_quality.sql` (**not applied**) |
| RPCs | 1 **extended** — `owner_cost_service_breakdown`, 8 → 22 cols |
| New RPCs / tables / views | 0 / 0 / 0 |
| **`econ` objects touched** | **0** |
| Frozen files touched | 0 |
| `admin.html` deployed | no |

This completes Phase 6's dashboard. Sections 1–9 are now implemented.

---

## 1. Section 9 is the first fully-populated panel

Every other section renders blocked, because business metrics exclude internal
traffic (INV-25) and 100% of telemetry is internal. Section 9 is a **diagnostic**
surface by owner decision, so that condition does not apply to it.

Measured, and this is what the panel will show:

| Service | Cost USD | Share | Calls | Requests | Tokens | Avg Latency | Success |
|---|---|---|---|---|---|---|---|
| tutor | 0.13585640 | 59.17% | 33 | 33 | 230,410 | 4,835 ms | 100.00% |
| solver | 0.04005330 | 17.44% | 18 | 9 | 260,131 | 2,881 ms | 100.00% |
| judge | 0.02307750 | 10.05% | 9 | 9 | 7,449 | 1,355 ms | 100.00% |
| vision | 0.01645500 | 7.17% | 5 | 5 | 5,208 | 2,327 ms | 100.00% |
| ocr | 0.01377500 | 6.00% | 5 | 5 | 4,550 | 1,367 ms | 100.00% |
| reference_resolver | 0.00027720 | 0.12% | 1 | 1 | 1,272 | 2,632 ms | 100.00% |
| difficulty_detector | 0.00011985 | 0.05% | 5 | 5 | 784 | 675 ms | 100.00% |

Shares sum to **100.00%**; cost sums to **`0.22961425`** — conservation holds
through the telemetry join.

---

## 2. The migration

`owner_cost_service_breakdown()` extended from 8 to 22 columns via explicit
`DROP FUNCTION` + recreate, and `p_service_code` made optional.

### Why extend rather than add

It already produces the exact service → provider → model grain Section 9 needs;
it simply exposed no quality measures and required a service code. Adding a
second RPC would create two overlapping definitions of the same grain — the
hazard M4.2 hit. One canonical surface, per the owner's M4.2 Decision 3.

`CREATE OR REPLACE` cannot widen a `RETURNS TABLE`, so the `DROP` is required.

**Safety of the DROP:** verified nothing consumes it. `admin.html` references
only `owner_cost_metrics` among the `owner_cost_*` RPCs, and is not deployed.
Positions 1–8 keep their names, types, positions and meaning.

### The parameter change is a widening, never a narrowing

`p_service_code` becomes `DEFAULT NULL`, where NULL means all services. Existing
call sites that pass a code behave identically; the default only **adds** the
overview case.

`p_include_internal` keeps its `false` default deliberately. Section 9's panel
passes `true`, but changing the *default* would silently make every other caller
start counting internal traffic. **INV-25 is a default, not a suggestion.**

---

## 3. The locked decisions, and how each is enforced

### Section 9 is diagnostic, served only through `owner_cost_*`

| Check | Result |
|---|---|
| RPCs the panel calls | `owner_cost_service_breakdown`, `owner_cost_health` — **`owner_cost_*` only** |
| `owner_econ_*` references in the panel | 2, **both comments stating the prohibition** |
| Tables the migration reads | `cost_engine.cost_facts`, `public.ai_model_calls` — **no `econ` object** |
| Executable `econ.` reference in the migration | **none** — the only one is inside the `COMMENT` text |

**No provider or model identifier enters `econ`.** INV-13 / P5-02 hold by
construction, not by promise. The panel also states on screen that it is
diagnostic and that its totals deliberately differ from Sections 1–8.

### Confidence is mapped inline, and that duplication is deliberate

The `CASE` mapping `invoice_verified → actual`, `list_price → modeled`
duplicates `econ.cost_confidence()`. That is **not** an oversight: the cost layer
must not depend on `econ`, and `owner_cost_metrics()` already carries the same
inline mapping. Calling into `econ` from a cost-facing RPC would invert the layer
dependency the architecture is built on.

`max()`, not `min()` — `invoice_verified` sorts before `list_price`, so `min()`
would report the best card and overstate the book.

### The internal/external split, implemented as approved

`internal_calls` and `external_calls` are returned per row, so a reader sees that
100% of today's traffic is internal without leaving the panel — the pattern the
Coverage board already uses.

---

## 4. The telemetry join — LEFT, and it is load-bearing

The join runs **from the money record outward**: `cost_facts LEFT JOIN
ai_model_calls`.

| Check | Result |
|---|---|
| `ai_model_calls.id` is PRIMARY KEY | **yes** — join cannot fan out and inflate cost |
| Calls with >1 current fact | **0** |
| Facts whose telemetry is missing | **0 today** |

`LEFT` is not defensive habit here. `cost_facts` is the money record;
`ai_model_calls` is telemetry, and §Phase 8 plans a **retention policy** for it.
The moment telemetry is pruned, an `INNER` join would start silently dropping
historical cost from a health panel — the M4.1/M4.2 failure mode exactly.

**Consequence, handled deliberately:** a fact with no telemetry row has NULL
`success`. It is counted in **neither** `success_calls` nor `failed_calls`, and
`success_rate_pct` divides by calls whose outcome is **known**, not by all calls.
Unknown is not failure (INV-26).

---

## 5. Deliberately omitted — cost per question at model grain

§Section 9 lists *"Avg cost per request / per question"* at service → provider →
model grain.

**Cost per request is provided** — a call belongs to exactly one request, so the
figure is well defined at every level.

**Cost per question is omitted, and deliberately not blocked.** The distinction:

> a **blocked** metric says "not computable *yet*" and implies it will resolve
> an **omitted** metric says "not meaningful at this grain" and never will

Work items carry `service_mix` keyed by **service code**, and a question spans
several models. No allocation of a question's cost to a specific model exists, so
a per-model cost-per-question is **undefined, not data-limited**. Shipping it
blocked would promise a resolution the architecture cannot deliver — the inverse
of the M3 §5a ADR, where the metric *was* data-limited and blocking was correct.

The panel states this on screen. Cost per question remains available where it is
defined: per service, and per work item.

---

## 6. Pre-apply type probe — mandatory

Run on all 22 columns before commit.

**22/22 match.** No cast anywhere in this function, and that is deliberate:
every declared type is exactly what the body yields, so a future change that
alters a type raises `42804` and `P5-17` catches it, rather than a defensive cast
truncating silently. Same rule as `owner_econ_operation_mix()`.

The one real trap was anticipated and avoided: `success_rate_pct` multiplies by
`100.0` **before** dividing, so the expression is `numeric` before the division —
`bigint / bigint` would have truncated a percentage to a whole number.

---

## 7. Invariants — verified, not asserted

| Invariant | Evidence |
|---|---|
| No client-side financial calculation (INV-03) | `reduce`, `+=`, `-=`, `*=`, `/=`, `Math.*`, `parseFloat`, `parseInt`: **0 matches**. See the note below on the 2 generic-pattern hits. |
| Every number traces to a typed column | 19 fields read, all declared columns of the two RPCs |
| **INV-13 / P5-02** | no `econ` object read or modified; provider/model stay in `public` via `owner_cost_*` |
| INV-25 | `p_include_internal` default unchanged at `false`; Section 9 opts in explicitly and labels itself diagnostic |
| Owner gate (INV-10) | `has_role_at_least('owner')`, `REVOKE` from PUBLIC/anon |
| Read-only (INV-07) | `STABLE` + `SECURITY DEFINER` |
| INV-26 | unknown outcome excluded from the success rate rather than counted as failure |
| No PII | 0 references to `full_name` / `email` / `profiles` |
| JS validity | inline script parses under `node --check` |

**On the two INV-03 hits.** The generic pattern flagged 2 lines. Both are
**string concatenation of three `text` columns** to build a display label
(`tutor → gpt-4o`); the pattern cannot distinguish `+` as concatenation from `+`
as addition. A targeted check across **all 17 numeric and count columns** returns
**zero** matches. Reported this way rather than as a clean "0 matches", because
the generic check genuinely did fire.

---

## 8. Risk assessment — **LOW-MEDIUM**

Higher than M4.1 for one structural reason: this **drops and recreates a live
function signature and changes a parameter's arity**. Everything else is
additive.

1. **Nothing is applied.**
2. **Zero data risk.** No `INSERT`/`UPDATE`/`DELETE`/`ALTER TABLE`.
3. **The DROP is safe** — verified unconsumed; positions 1–8 preserved, so even a
   caller written against the old shape keeps working.
4. **The parameter change only widens accepted input.**
5. **Type-validated before apply** — 22/22.
6. **Fan-out ruled out by primary-key evidence**, not assumption.
7. **No `econ` dependency**, verified by reading the migration's actual FROM/JOIN
   list rather than trusting the prose.
8. **Rollback is one statement**, then re-apply the 8-column form:
   `DROP FUNCTION IF EXISTS public.owner_cost_service_breakdown(text,date,date,boolean);`

**Residual risks, stated:**

- **`success_rate_pct` is 100% and `failed_calls` is 0** across every row, because
  production has 76 successes and 0 failures. The failure path is therefore
  **unexercised** — correct today, but untested against real failures.
- **Provider concentration is trivially 100%** — one provider registered. A real
  measurement of a real state, not a placeholder.
- **"Over cost target" cannot be reported yet, and the gap is architectural.**
  0 of 12 services have a `cost_target_usd`. `owner_cost_health()` emits a
  `service_over_budget` row only when a target is breached — so "no targets set"
  and "targets set, none breached" are **indistinguishable** from its output. The
  panel therefore renders health rows faithfully and claims neither state. See
  the open question below.

---

## 9. Proposed M4.3 Release Gate (for after approval — NOT run)

| # | Validation | Method |
|---|---|---|
| M4.3-V1 | Existing surfaces unchanged | digests vs the M4.2 closeout |
| M4.3-V2 | **No `econ` object modified**; `P5-02`/`P5-02b` green with Section 9 live | catalog + suite |
| M4.3-V3 | Positions 1–8 preserved through the DROP | column-by-column vs pre-migration |
| M4.3-V4 | RPC callable; **cost reconciles to `0.22961425`**; shares sum to 100% | invoke as owner |
| M4.3-V5 | Join safety — no fan-out, row count matches distinct facts | catalog + count |
| M4.3-V6 | Owner gate fires `42501`; `anon` denied | impersonation |
| M4.3-V7 | No client-side calculation; every number a typed column | static + `proargnames` |
| M4.3-V8 | Regression — economics 18/18, cost engine 25 + 1 WARN (`P4-05` still 6 functions) | both suites |

---

## Open question for the owner

**Should "over cost target" be reportable before any target exists?** Today it
cannot be distinguished from "no target breached". Resolving it would mean
`owner_cost_health()` emitting a row when **zero** services have a target — a
second RPC change, outside this milestone's approved scope. Flagged rather than
silently absorbed.

---

## Stop point

Implementation and this review are complete. **Awaiting owner review before
applying the migration or beginning the M4.3 Release Gate.** No Phase 7 work.
