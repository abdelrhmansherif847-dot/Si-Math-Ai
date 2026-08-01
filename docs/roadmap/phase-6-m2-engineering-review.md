# Phase 6 M2 — Final Engineering Review

**Status: ✅ SUPERSEDED BY APPLICATION.** This was a pre-application review;
the migration it reviews was subsequently owner-approved and applied to
`igvkyxkmjnkzscqgommj` on 2026-08-01 as version `20260801103847`. The review
text below is preserved as written — it describes the state *before* the
migration was applied.

The V1–V8 plan in §5 was executed on 2026-08-01. Seven passed on the first
run; **V7 failed** and uncovered a pre-existing Phase 5 defect (three owner
RPCs declaring `bigint` for a column their view produces as `numeric`), which
was fixed under separate approval by version `20260801105710`. All eight then
passed. See the M2 Final Closeout in `docs/roadmap/phase-6-m2-closeout.md`.

Artifact under review: `supabase/migrations/20260731_aiecon_p6_m2_pnl_summary.sql`
at commit `ac42876`.

Every claim below is measured, not asserted. Measurements come from a local
PostgreSQL 16.13 instance carrying the production schema and migration
sequence; dependency facts come from production's own catalog.

---

## 1. Backward compatibility

**Confirmed: 100% backward compatible.**

The migration changes `econ.v_pnl_daily` from 9 to 11 columns. The two new
columns are appended; nothing else moves.

| Position | Column | Status |
|---|---|---|
| 1–9 | `pnl_on` … `confidence` | unchanged in name, type, position, meaning |
| 10 | `revenue_confidence` | **new** |
| 11 | `cost_confidence` | **new** |

### Proof by output digest

The strongest available evidence is that every existing consumer produces
**bit-identical output** before and after. Measured on the same dataset:

| Consumer | Before | After |
|---|---|---|
| `owner_econ_pnl()` | `3421323eca7d3d6facf037c7ca93ebf5` | **identical** |
| `econ.v_breakeven_inputs` | `db3ba4166d7edeb643645105c779f7c2` | **identical** |
| `econ.v_coverage` | `b254aab27a11bf5cbfa1bbe7d67e9ef9` | **identical** |

Digests cover the money columns, block reasons and confidence classes — the
values that would change if the rewrite altered semantics.

### Positional / column-count assumptions

Audited every consumer, plus a database-wide scan:

| Object | Access pattern |
|---|---|
| `public.owner_econ_pnl` | named columns only |
| `econ.v_breakeven_inputs` | named columns only |
| `econ.v_coverage` | named columns only |
| **Database-wide `SELECT * FROM v_pnl_daily`** | **NONE** |

No consumer depends on column count or ordinal position. The one `*` in
`v_coverage` is `count(*)`, not a star-select.

**Future Phase 5 components**: none exist beyond those listed — the Phase 5
surface is complete and closed. Any future consumer would be written against
the 11-column shape.

**Dashboards**: `admin.html` calls RPCs exclusively and never reads a view
(INV-04, verified by grep in M1 and M2). It is structurally incapable of
depending on view shape.

---

## 2. Dependency impact

### `econ.v_pnl_daily` — 3 dependents, all internal

From production `pg_depend` and a `prosrc` scan:

| Dependent | Kind | Impact |
|---|---|---|
| `econ.v_breakeven_inputs` | view | none — digest identical |
| `econ.v_coverage` | view | none — digest identical |
| `public.owner_econ_pnl` | function | none — digest identical |

`CREATE OR REPLACE VIEW` succeeds with dependents present precisely because
the change is append-only; PostgreSQL rejects any replacement that would
alter an existing column. **The database itself enforces the compatibility
claim** — if this migration applies at all, backward compatibility held.

### `public.owner_econ_pnl_summary()` — 0 dependents

Confirmed against production: the function **does not exist**. It is a new
object with no callers other than the M2 dashboard code, which is not yet
deployed. There is no hidden downstream effect because there is no downstream.

---

## 3. Migration safety

**Safe to run on production.**

- **No data is touched.** The migration contains no `INSERT`, `UPDATE`,
  `DELETE`, `TRUNCATE`, or `ALTER TABLE`. It replaces one view definition and
  creates one function. Zero rows are read or written during application.
- **No table is locked.** `CREATE OR REPLACE VIEW` takes a brief
  `ACCESS EXCLUSIVE` lock on the view only — not on `cost_facts`,
  `question_cost_facts`, or any base table. Nothing blocks the Edge Function,
  student traffic, or the pricing engine.
- **No student-facing path is involved.** No Edge Function, no frozen file.
- **Fail-safe.** The migration runner wraps it in a transaction; a failure
  leaves the previous definitions intact.

**Fully idempotent — measured.** Applied three times consecutively:
`v_pnl_daily` remained at 11 columns, `owner_econ_pnl_summary` remained at
exactly 1 function. `CREATE OR REPLACE` on both objects is naturally
repeatable.

**Rollback is straightforward — rehearsed.**

```sql
DROP FUNCTION IF EXISTS public.owner_econ_pnl_summary(date,date);
-- then re-apply the Phase 5 v_pnl_daily definition from
-- 20260731_aiecon_p5_economics.sql
```

After dropping the function in rehearsal, `owner_econ_pnl()` still returned
864 rows and `v_breakeven_inputs` 29 rows — dependents unaffected. Reverting
`v_pnl_daily` to 9 columns is equally safe because the two appended columns
have no dependents of their own.

---

## 4. Performance

Measured with `EXPLAIN (ANALYZE)`.

### Small dataset (31 P&L days — production's current scale)

| Operation | Rows returned | Execution |
|---|---|---|
| `owner_econ_pnl()` | 31 | 7.5 ms |
| `owner_econ_pnl_summary()` | 1 | 9.5 ms |

### Scaled dataset (501 revenue events, 500 of them 365-day annual plans)

| Operation | Execution |
|---|---|
| `owner_econ_pnl()` | 334 ms |
| **`owner_econ_pnl_summary()`** | **313 ms** |
| `econ.v_revenue_recognized_daily` alone | 765 ms |

### Does the summary scan more data than the existing implementation?

**No.** It reads exactly the same source — `econ.v_pnl_daily` — and aggregates
it. At scale it is marginally **faster** than `owner_econ_pnl()` (313 ms vs
334 ms) because it returns 1 row instead of 864, saving serialisation. The
~2 ms penalty on the tiny dataset is aggregation overhead that disappears
once row count matters.

### Indexes involved

None are added, and none are needed. The query path runs over views whose
base tables already carry the Phase 4 index set (`cost_facts_occurred_idx`,
`cost_facts_current_call_uidx`, `qcf_occurred_idx`, and seven others). The
dominant cost is not index lookup.

### Future scalability concern — pre-existing, not introduced here

The dominant cost is `econ.v_revenue_recognized_daily`, which expands each
revenue event into one row per day of its plan period via `generate_series`.
500 annual subscriptions generate **182,500 intermediate rows** before
grouping — that is the 765 ms above.

Projected: ~5,000 annual subscribers would generate ~1.8M intermediate rows
per query, likely several seconds.

**This is a Phase 5 characteristic that M2 inherits, not one it creates** —
`owner_econ_pnl()` already pays exactly the same cost today. The eventual fix
is a materialised recognition table refreshed on payment approval, which is a
Phase 7/8 concern. **It is not a reason to block M2**, and M2 marginally
improves the situation by returning 1 row instead of N.

---

## 5. Production validation plan (V1–V8)

To be executed after the migration, before M2 is called complete.

| # | Validation | Method | Pass criterion |
|---|---|---|---|
| **V1** | Existing dashboards still work | Compare `owner_econ_pnl()` digest against the pre-migration value captured immediately before applying | digest identical |
| **V2** | Existing RPCs return identical results | Digest `econ.v_breakeven_inputs` and `econ.v_coverage` before/after | both identical |
| **V3** | Shape is additive | `information_schema.columns` for `v_pnl_daily` | positions 1–9 unchanged; 10–11 new, both `text` |
| **V4** | Financial Overview uses only server-side calculation | Grep the tab for arithmetic on money and for `reduce`/`sum` | zero matches |
| **V5** | Confidence values correct | `owner_econ_pnl_summary()` confidence vs the worst contributing component | equal, and never better than worst input (INV-27) |
| **V6** | Blocked-state behaviour unchanged | Every blocked row carries a reason, NULL profit, `confidence='blocked'` | zero violations |
| **V7** | AI Cost panel still follows INV-25 | `owner_econ_service_economics()` excludes internal; Coverage still shows the labelled split | external-only in metrics; split intact |
| **V8** | No Phase 5 regression | `scripts/verify-economics.sql` | 17/17 PASS |

Each will be reported individually as PASS or FAIL — no summarising.

---

## 6. Risk assessment

### **LOW**

Justification:

1. **The database enforces the central claim.** `CREATE OR REPLACE VIEW`
   physically cannot alter an existing column. If the migration applies, the
   compatibility guarantee held — this is not a promise requiring trust.
2. **Zero data risk.** No `INSERT`/`UPDATE`/`DELETE`/`ALTER TABLE`. No base
   table is locked. Not one row is modified.
3. **Compatibility proven by output, not inspection.** Three consumer digests
   are bit-identical across the change.
4. **Zero dependents on the new object**, confirmed against production.
5. **Idempotency measured** (three consecutive applies) and **rollback
   rehearsed** with dependents verified intact afterwards.
6. **No student-facing surface.** No Edge Function, no frozen file, no write
   path. The worst realistic failure is an owner-only dashboard panel failing
   to render — visible immediately, reversible in one statement.

**Residual risks, both accepted and stated:**

- The revenue-recognition scaling ceiling (§4) is real but **pre-existing**;
  M2 neither creates nor worsens it.
- All cost remains list-priced, so every M2 figure reports `modeled`. This is
  correct behaviour under INV-27, not a defect.

**No unresolved concerns.**

---

## Known issue deliberately left unfixed

`econ.v_breakeven_inputs` still reports `no_platform_cost_source` because
`public.platform_cost_entries` does not exist (§9.4). That is documented and
**out of M2 scope**. It is left alone rather than opportunistically fixed —
no hidden fixes, no scope creep.
