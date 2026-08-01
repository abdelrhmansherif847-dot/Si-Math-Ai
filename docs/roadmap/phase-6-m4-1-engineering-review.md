# Phase 6 M4.1 — Lesson Economics: Implementation & Engineering Review

**Status: implementation complete, NOTHING APPLIED.** The migration is prepared
and unapplied; no Release Gate has begun. Per the owner's M4 workflow, each
milestone ends at implementation → engineering review → **stop**, with no apply
until that milestone is individually approved.

Branch `claude/phase6-m4-economics-sections-7-9`, cut clean from `main` at
`44b2175`.

| Scope | Section 7 — Lesson Economics |
|---|---|
| Migration | 1 — `20260801_aiecon_p6_m4_lesson_economics.sql` (**not applied**) |
| New RPCs | 1 — `owner_econ_lesson_economics()` |
| New tables | 0 |
| New views | 0 |
| **Existing objects modified** | **0 — `econ.v_lesson_economics` untouched, per owner decision** |
| Frozen files touched | 0 |
| `admin.html` deployed | no |

M4.2 (Student Consumption) and M4.3 (AI Service & Model) have not been started.

---

## 1. What was built

Section 7 renders cost per canonical lesson: lesson name, parent topic, cost in
USD and EGP, question count, cost per question, completeness and confidence.

**It renders blocked today.** `econ.v_lesson_economics` excludes internal
traffic (INV-25) and all telemetry is internal, so it returns 0 rows. The panel
shows a blocked state whose reason is grounded in `owner_econ_coverage()`'s
typed `value_external` / `value_internal` columns — not a sentence invented in
the client. It unblocks with no code change when external traffic is priced.

The engine-side view `cost_engine.v_cost_by_lesson` does have 7 rows, all
internal. That data is reachable today through `owner_cost_metrics('lesson')`,
which is a diagnostic path, not this business panel.

---

## 2. The migration

`public.owner_econ_lesson_economics()` — one owner-gated read RPC publishing
`econ.v_lesson_economics`, which has existed since Phase 5 with no RPC. The
`econ` schema is deliberately unreachable from PostgREST (INV-05, P5-03), so a
view without a wrapper is invisible to the dashboard.

This closes the last unpublished econ view except `v_breakeven_inputs`, which
stays unpublished until Phase 7 (break-even).

### Owner decision — display names live in the RPC

The view exposes only `subtopic_id`. Rendering "Functions" instead of a raw key
needs taxonomy. The owner ruled (2026-08-01): **do not modify
`econ.v_lesson_economics`**; join `public.taxonomy_subtopics` inside the RPC and
expose the name from there.

Implemented exactly as specified. The economics view is untouched — the digest
check in the gate will prove it — and a presentation concern stays at the
presentation boundary: the view reports money, the RPC decorates it.

**On CLAUDE.md §2:** the frozen artifact is `taxonomy.js`, the application's
taxonomy authority. `public.taxonomy_subtopics` / `taxonomy_topics` are database
tables, read here and never written. Nothing frozen is touched.

### The join is LEFT, and that is load-bearing

`LEFT JOIN`, never `INNER`. A lesson key with no taxonomy row must still appear
with its cost — dropping it would silently lose money from a financial panel,
which INV-26 forbids. `subtopic_name` is NULL for an unmapped key, and the panel
renders the raw key plus an explicit `· unmapped` marker rather than hiding the
gap behind a fallback label.

**Fan-out ruled out by measurement, not assumption.** A duplicate taxonomy id
would multiply rows and inflate cost. Verified 2026-08-01:

| Check | Result |
|---|---|
| `taxonomy_subtopics.id` | **PRIMARY KEY** — join cannot fan out |
| `taxonomy_topics.id` | **PRIMARY KEY** — join cannot fan out |
| Engine lesson keys | 4, **0 unmapped** to taxonomy |

---

## 3. Pre-apply type probe — mandatory, and it was load-bearing again

Run before commit, per the owner's standing instruction.

| Pos | Column | Body yields | Declared | Result |
|---|---|---|---|---|
| 1 | `subtopic_id` | text | text | PASS |
| 2 | `subtopic_name` | text | text | PASS |
| 3 | `topic_id` | text | text | PASS |
| 4 | `topic_name` | text | text | PASS |
| 5 | `cost_usd` | numeric | numeric | PASS |
| 6 | `cost_egp` | numeric | numeric | PASS |
| 7 | `questions` | **bigint** | bigint | PASS |
| 8 | `cost_per_question_usd` | numeric | numeric | PASS |
| 9 | `cost_completeness` | text | text | PASS |
| 10 | `confidence` | text | text | PASS |

**10/10 match — but only because of one cast, and that was verified directly.**
The same probe run *without* `::bigint` on `questions` yields `numeric` against
a `bigint` declaration:

> CONFIRMED: without the cast this RPC would raise `42804` — the cast is
> load-bearing.

`econ.v_lesson_economics.questions` is `sum(work_items)` where `work_items` is
`bigint`, so it widens to `numeric` — the exact defect class that made three
RPCs un-callable in M2.

### The casting rule, applied consistently for the third time

| RPC | Source type | Cast? | Why |
|---|---|---|---|
| `owner_econ_operation_mix()` | `count(*)` → bigint | **no** | already correct; a cast would suppress a future `42804` |
| `owner_econ_credit_summary()` | `sum(bigint)` → numeric | **yes** | source differs; a credit count is integral so the cast is exact |
| `owner_econ_lesson_economics()` | `sum(bigint)` → numeric | **yes** | same as above |

One rule — *cast only when the source type genuinely differs and the cast
cannot lose information* — producing three different correct answers.

---

## 4. Invariants — verified, not asserted

| Invariant | Evidence |
|---|---|
| No client-side financial calculation (INV-03) | `reduce`, `+=`, `-=`, `*=`, `/=`, `Math.*`, `parseFloat`, `parseInt`, arithmetic on any RPC field: **0 matches**. `cost_per_question_usd` is computed in the view, never divided in the client. |
| Every number traces to a typed column | 9/9 rendered fields declared in the `RETURNS TABLE` |
| No provider/model literal (§8.10 rule 10) | 0 matches |
| Internal traffic excluded (INV-25) | inherited from `econ.v_lesson_economics`; the RPC adds no traffic filter of its own |
| Owner gate (INV-10) | `has_role_at_least('owner')`, `REVOKE` from PUBLIC/anon |
| Read-only (INV-07) | `STABLE` + `SECURITY DEFINER` |
| Confidence (INV-27) | passthrough of the view's derived class; never recomputed or assigned |
| INV-13 / P5-02 | no provider or model identifier introduced; the taxonomy join adds lesson names only |
| No existing object modified | `econ.v_lesson_economics` untouched by design |
| JS validity | inline script parses under `node --check` |

---

## 5. Risk assessment — **LOW**

1. **Nothing is applied.** The migration is prepared only.
2. **Zero data risk when applied.** No `INSERT`/`UPDATE`/`DELETE`/`ALTER`; one
   `CREATE OR REPLACE FUNCTION` on an object that does not yet exist.
3. **Zero dependents.** The function does not exist in production; its only
   consumer is the Section 7 panel, which is not deployed.
4. **No existing object touched** — no view, no table, no grant, no signature.
   In particular `econ.v_lesson_economics` is unchanged, so nothing downstream
   of it can shift.
5. **Type-validated before apply**, and the one risky column was proven to need
   its cast.
6. **Fan-out ruled out** by primary-key evidence, not by assumption.
7. **Covered by existing verification** — `P5-17` discovers `owner_econ_*` from
   the catalog, so this RPC is checked the moment it exists.
8. **Rollback is one statement**:
   `DROP FUNCTION IF EXISTS public.owner_econ_lesson_economics();`

**Residual risks, accepted and stated:**

- Section 7 ships having only ever exercised its **blocked** path. The populated
  path is not exercisable until external traffic exists. The blocked path is
  verified; the populated path is not.
- The unmapped-lesson branch is likewise unexercised: 0 of 4 engine lesson keys
  are currently unmapped. The `LEFT JOIN` guarantees the row survives, but no
  production row has yet taken that branch.

---

## 6. Proposed M4.1 Release Gate (for after approval — NOT run)

| # | Validation | Method |
|---|---|---|
| M4.1-V1 | Existing surfaces unchanged | digests of `owner_econ_pnl()`, `v_breakeven_inputs`, `v_coverage`, `v_pnl_daily[1-9]` vs the M3 closeout |
| M4.1-V2 | **`econ.v_lesson_economics` unchanged** | view definition and column list identical to pre-migration — the owner decision, proven |
| M4.1-V3 | New RPC callable and correct | invoke as owner; compare cost columns to the view; confirm row count matches |
| M4.1-V4 | Owner gate | `anon` denied; gate fires `42501` for a real non-owner |
| M4.1-V5 | No client-side calculation | static scan of the Section 7 panel |
| M4.1-V6 | Every number a typed column | field-to-`proargnames` check |
| M4.1-V7 | Blocked state carries a reason | zero rows → reason grounded in coverage's typed columns |
| M4.1-V8 | No regression | `verify-economics.sql` (18 checks; `P5-04` → 11 functions, `P5-17` → 11 invoked) + `verify-cost-engine.sql` read-only |

---

## Stop point

Implementation and this review are complete. **Awaiting owner review before
applying the migration or beginning the M4.1 Release Gate.** M4.2 not started.
