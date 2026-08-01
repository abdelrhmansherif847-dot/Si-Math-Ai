# Phase 6 M4.2 — Student Consumption: Implementation & Engineering Review

**Status: implementation complete, NOTHING APPLIED.** Both migrations are
prepared and unapplied; no Release Gate has begun. Per the owner's M4 workflow,
each milestone ends at implementation → engineering review → **stop**.

Branch `claude/phase6-m4-2-student-consumption`, cut clean from `main` at
`067d3c8` — the locked Phase 6 baseline.

| Scope | Section 8 — Student Consumption Analytics |
|---|---|
| Migrations | 2, both **not applied** |
| RPCs | 1 **extended** (`owner_econ_student_economics`, 10 → 19 cols), 1 **new** (`owner_econ_student_service_mix`) |
| New tables | 0 |
| New views | 0 |
| Existing views modified | **0** — `econ.v_student_economics` untouched |
| Frozen files touched | 0 |
| `admin.html` deployed | no |

M4.3 (AI Service & Model Analytics) has not been started.

---

## 1. The four locked decisions, and how each is implemented

### Decision 1 — no personally identifiable information

`owner_econ_student_economics()` and `owner_econ_student_service_mix()` expose
`user_id` and nothing else identifying. Verified mechanically:

| Check | Result |
|---|---|
| Tables read by both migrations | `public.credit_transactions`, `econ.v_student_economics`, `cost_engine.v_question_cost_current` — **`profiles` is not among them** |
| `full_name` / `email` / `rank_name` in the SQL | **0 field references** — the only occurrences are comments *stating the prohibition* |
| Fields read by the panel | 15, of which the only identifier is `user_id` |

The panel shortens the UUID to 8 characters for legibility and carries the full
value in a `title` attribute. That is display formatting, not identification.

### Decision 2 — the statistical anomaly ships blocked and unblocks itself

Two indicators, deliberately distinct:

| Indicator | Kind | State today |
|---|---|---|
| `cost_exceeds_revenue` | deterministic, exact | **ships now** — currently NULL only because cost itself is blocked, not because of population |
| `usage_anomaly` | statistical, >3σ | **blocked** — `insufficient_population`, confidence `blocked` |

The threshold is `n >= 30`, evaluated **from data on every call**, so the metric
unblocks with no code change once the population supports it (owner rule 4).
Measured today: n=7, mean 272.57, stddev 483.62, 3σ threshold 1,723 against an
observed max of 1,355 — the flag could never fire, which is exactly why it is
blocked rather than shipped as a KPI that looks rigorous and is not.

A second reason is also implemented: `no_variance_in_population`, for the case
where n is sufficient but every student consumed identically. A zero standard
deviation would otherwise make every student an infinite outlier.

### Decision 3 — extend, do not duplicate

`owner_econ_student_economics()` is extended from 10 to 19 columns via explicit
`DROP FUNCTION` + recreate, following the M2 discipline. `CREATE OR REPLACE`
**cannot widen a `RETURNS TABLE`**; without the DROP the migration reports
success while the RPC silently keeps its old shape — a failure this project has
hit twice.

Positions 1–10 keep their names, types, positions and meaning. Nothing consumes
the function today, so the DROP breaks no contract.

**On the second RPC:** `owner_econ_student_service_mix()` is a second RPC by
necessity of **grain** — one row per (student, service) — not a second
definition of student economics. It reports **no per-student total**, so it
cannot diverge from the canonical surface. The two do not overlap.

### Decision 4 — calendar-span denominator, documented in the migration

`avg_daily_usage` divides by `period_days` = the shared calendar span of the
ledger, **the same denominator for every student**, matching
`owner_econ_credit_summary().avg_daily_burn`.

Measured: the ledger spans **44 calendar days** while individual students were
active on **1–9 days**. Dividing by active days would report a burst rate that
flatters a student who used the product once and heavily; dividing by the
calendar span reports a sustained rate, which is what a burn figure means. The
migration header records this as locked, with the reasoning, so it is not
revisited later.

---

## 2. Pre-apply type probes — mandatory, and they caught a defect again

Run on both RPCs before commit.

**`owner_econ_student_economics` — first run FAILED at position 13:**

| Pos | Column | Body yielded | Declared | Result |
|---|---|---|---|---|
| 13 | `period_days` | **integer** | bigint | **FAIL — would raise 42804** |

`date - date` returns **`integer`** in PostgreSQL, not bigint, and `+ 1` keeps
it there. A new trap, distinct from the `sum(bigint) → numeric` family that
caught M2, M3 and M4.1 — and one no amount of reasoning by analogy would have
predicted.

Fixed with `::bigint` (widening integer → bigint is lossless, and bigint keeps
it consistent with the other count columns). **Re-probed: 19/19 match.**

**`owner_econ_student_service_mix` — 5/5 match** on the first run. No cast:
`count(*)` is already bigint, and a defensive cast would suppress the `42804`
that `P5-17` relies on if the expression ever became a `sum()`.

**That is four consecutive milestones in which the probe caught a real defect
before apply.**

---

## 3. Verified behaviour against production data

| Field | Observed |
|---|---|
| Students | 7, revenue EGP 349–1,499 |
| `credits_consumed` | 0–1,355 |
| `active_days` | 0–9 |
| `period_days` | **44** — identical for every student, as designed |
| `avg_daily_usage` | 0.00–30.80 |
| `cost_usd`, `profit_egp` | NULL — blocked, no external cost |
| `cost_exceeds_revenue` | NULL — blocked with the row's own reason |
| `usage_anomaly` | **NULL** |
| `usage_anomaly_reason` | **`insufficient_population`** |
| `usage_anomaly_confidence` | **`blocked`** |
| `owner_econ_student_service_mix` | 0 rows — external-only, correct |

---

## 4. Invariants — verified, not asserted

| Invariant | Evidence |
|---|---|
| No client-side financial calculation (INV-03) | `reduce`, `+=`, `-=`, `*=`, `/=`, `Math.*`, `parseFloat`, `parseInt`, arithmetic on any RPC field: **0 matches** |
| Every number traces to a typed column | 15/15 fields read are declared columns |
| **No PII** | `profiles` not read; 0 references to `full_name`/`email`/`rank_name` outside prose |
| INV-25 | cost side inherits the view's external-only filter; the service-mix RPC filters `NOT is_internal` explicitly. The **credits** side has no internal/external notion — it is student billing, not AI traffic — and that distinction is documented |
| INV-27 | `credits_confidence` is independent of cost confidence: a missing FX rate must not make a counted credit less certain (owner rule 1) |
| INV-13 / P5-02 | no provider or model identifier involved |
| Owner gate (INV-10) | both `has_role_at_least('owner')`, `REVOKE` from PUBLIC/anon |
| Read-only (INV-07) | both `STABLE` + `SECURITY DEFINER` |
| Existing view unmodified | `econ.v_student_economics` untouched — gate will prove byte-identical |
| JS validity | inline script parses under `node --check` |

---

## 5. Risk assessment — **LOW-MEDIUM**

Higher than M4.1 for one structural reason: this milestone **drops and
recreates a live function signature**. Everything else is additive.

1. **Nothing is applied.** Both migrations are prepared only.
2. **Zero data risk.** No `INSERT`/`UPDATE`/`DELETE`/`ALTER TABLE`.
3. **The DROP is safe** — nothing consumes `owner_econ_student_economics()`
   today; Section 8 is its first consumer and `admin.html` is not deployed.
   Positions 1–10 are preserved exactly, so even a future consumer written
   against the old shape would keep working.
4. **Type-validated before apply**, and one real defect was caught and fixed.
5. **No PII surface introduced** — verified at both the SQL and panel layers.
6. **Rollback is two statements**, and the first must be followed by restoring
   the 10-column definition:
   ```sql
   DROP FUNCTION IF EXISTS public.owner_econ_student_economics(integer);
   -- then re-apply the 10-column form from
   -- 20260801_aiecon_p5_fix_rpc_count_types.sql
   DROP FUNCTION IF EXISTS public.owner_econ_student_service_mix(integer);
   ```

**Residual risks, accepted and stated:**

- The cost half of Section 8 ships having only exercised its **blocked** path.
- `usage_anomaly`'s *unblocked* branch is unexercised by construction — it
  cannot run until n ≥ 30. The blocked branch and the threshold logic are
  verified; the outlier arithmetic itself is not.
- `cost_exceeds_revenue` is implemented and correct but currently always NULL,
  because it depends on cost. It is blocked by missing cost, **not** by
  population — a distinction worth keeping clear when reading the panel.

---

## 6. Proposed M4.2 Release Gate (for after approval — NOT run)

| # | Validation | Method |
|---|---|---|
| M4.2-V1 | Existing surfaces unchanged | digests vs the M4.1 closeout |
| M4.2-V2 | `econ.v_student_economics` unchanged | definition digest + column shape |
| M4.2-V3 | Extended RPC — positions 1–10 preserved | column-by-column vs the pre-migration signature |
| M4.2-V4 | Both RPCs callable; totals reconcile with sources | credits vs `credit_transactions`, cost vs the view |
| M4.2-V5 | Owner gate fires `42501`; `anon` denied | both RPCs |
| M4.2-V6 | **No PII exposed** | RPC output columns contain no name/email; `profiles` not in either function body |
| M4.2-V7 | Blocked states carry reasons | `usage_anomaly` = NULL / `insufficient_population` / `blocked`; credits stay `actual` |
| M4.2-V8 | No regression | `verify-economics.sql` (`P5-04`/`P5-17` → 12) + `verify-cost-engine.sql` read-only |

---

## Stop point

Implementation and this review are complete. **Awaiting owner review before
applying either migration or beginning the M4.2 Release Gate.** M4.3 not
started.
