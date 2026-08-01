# Phase 6 M4.3 — Final Closeout

**M4.3 is complete and frozen. Phase 6 is complete and frozen.**

Section 9 — AI Service & Model Analytics — is the last panel of the Owner
Dashboard. Sections 1–9 are all implemented, applied and gate-verified.

---

## Final state

| | |
|---|---|
| Milestone | M4.3 — AI Service & Model Analytics (Section 9) |
| Branch | `claude/phase6-m4-3-service-model-analytics` |
| Migration applied | `20260801135335` — `aiecon_p6_m4_3_service_quality` |
| Release Gate | **M4.3-V1 … V8 — 8/8 PASS** |
| Economics regression | **18/18 PASS** |
| Cost Engine regression | **25 PASS, 1 WARN** (`P4-31`, pre-existing) |
| RPCs | 1 **extended** — `owner_cost_service_breakdown`, 8 → 22 columns |
| New RPCs / tables / views | 0 / 0 / 0 |
| **`econ` objects touched** | **0** |
| Frozen files touched | **0** |
| `admin.html` deployed | **no** |

---

## Applied migrations

M4.3 contributed exactly one migration, and it is recorded correctly:

| Version | Name | Repo file |
|---|---|---|
| `20260801135335` | `aiecon_p6_m4_3_service_quality` | `20260801_aiecon_p6_m4_3_service_quality.sql` |

**Migration record verified at closeout.** Sixteen `aiecon` migrations are
applied across Phases 2–6; the repo holds fifteen `aiecon` files. The difference
is not a gap: M4.2's gate fix (`20260801130230`) was folded into its parent file
`20260801_aiecon_p6_m4_2_student_consumption.sql` at the M4.2 closeout rather
than kept as a separate file. Every applied version is accounted for.

**No migration file anywhere in the repo still carries a stale `PREPARED` /
`NOT APPLIED` / `PENDING OWNER` marker.**

---

## Production state at Phase 6 close

| Measure | Value |
|---|---|
| `owner_econ_*` RPCs | 12 |
| `owner_cost_*` RPCs | **6** — extended, not added |
| `econ` views / functions | 11 / 7 |
| `aiecon` migrations applied | **16** |
| Priced cost facts | 76, **$0.22961425**, 100% internal |
| Distinct services / providers / models | 7 / 1 / 2 |
| Pricing coverage | 100.00% |
| Revenue events | 8, EGP 8,542.00 |
| Students in Section 8 | 9, 1,908 credits over a 44-day span |
| P&L days | 383, all blocked `no_cost_in_period` |

**Verification**

| Suite | Result |
|---|---|
| M4.3-V1…V8 | **8/8 PASS** |
| `scripts/verify-economics.sql` | **18/18 PASS** |
| `scripts/verify-cost-engine.sql` read-only | **25 PASS, 1 WARN** (`P4-31`) |
| `scripts/verify-cost-engine.sql` `P4-24…P4-28` | not run — write-path |

Backward compatibility: `owner_cost_service_breakdown` columns 1–8 verified
identical in **shape, values and call-site resolution** across the DROP.

---

## The locked architectural decision

> **Section 9 is a diagnostic surface, served only by `owner_cost_*` RPCs.**

Recorded here so it is not re-litigated:

1. **It reports all observed AI telemetry, including internal traffic.** Its
   panel passes `p_include_internal := true` and says so on screen, stating that
   its totals deliberately differ from Sections 1–8.
2. **Its numbers never feed any `owner_econ_*` business KPI.** INV-25 continues
   to govern business metrics only. INV-25 is a *default*, not a suggestion —
   `p_include_internal` still defaults to `false`, so Section 9 opts in
   explicitly rather than changing what every other caller sees.
3. **It is served through `owner_cost_*` because it exposes `provider_code` and
   `model`, which INV-13 / P5-02 forbid inside `econ`.** This is not a
   workaround: `owner_cost_facts` and `owner_cost_service_breakdown` already
   exposed both from `public` before M4.3.
4. **No provider or model identifier entered `econ`, and this holds by
   construction.** The migration reads only `cost_engine.cost_facts` and
   `public.ai_model_calls`; its function body contains **zero** executable
   `econ.` references.
5. **Confidence is mapped inline, duplicating `econ.cost_confidence()`, and that
   duplication is deliberate** — the cost layer must not depend on `econ`, and
   `owner_cost_metrics()` already carries the same inline mapping. Reaching into
   `econ` from a cost-facing RPC would invert the layer dependency the
   architecture is built on.

### The second locked decision — omitted, not blocked

**Cost per question is omitted at model grain, and deliberately not blocked.**

> a **blocked** metric says "not computable *yet*" and implies it will resolve
> an **omitted** metric says "not meaningful at this grain" and never will

Work items are keyed by **service code** and a question spans several models, so
no allocation of a question's cost to a specific model exists. The figure is
**undefined, not data-limited**. Shipping it blocked would promise a resolution
the architecture cannot deliver — the inverse of the M3 §5a decision, where the
metric genuinely *was* data-limited and blocking was correct. Cost per **request**
is provided at every level; cost per question remains available per service and
per work item.

---

## What the gate caught, and what it could not

**V4e reported FAIL on first run, and the defect was in the check.** The
assertion compared the model-level row count against distinct model *names* (2)
when that branch groups by *(service, provider, model)* — 8 combinations.
Verified directly: 7 services, 7 service+provider pairs, 8 triples. **No code or
migration was changed**; the assertion was corrected and re-run.

Worth recording because the milestone's honest outcome is *"my check was wrong"*,
not *"the code was wrong"*. Reporting it the other way would have been easier and
false.

**`P5-02b` passes vacuously, and always has.** It reads
`econ.v_service_economics`, which holds **0 rows** — that view excludes internal
traffic and 100% of telemetry is internal. A check over an empty relation cannot
fail. This is **pre-existing since Phase 5**, not introduced by M4.3.

A non-vacuous form was run in its place: every value of all 8 **populated** econ
views, flattened via `jsonb`, matched against every provider code and model name
in production — **890 rows, 3 tokens, 0 leaks.** That is what the V2 verdict
rests on.

**The LEFT-join path is unexercised by production.** With 0 orphaned facts and 0
failures, both the telemetry-pruned case and the failure case were proven on a
synthetic read-only fixture instead: an unknown outcome keeps its money and is
counted as neither success nor failure, giving 66.67% = 2/3 known — not 50%
(unknown as failure), not 75% (unknown as success). INV-26 holds.

### The generalised lesson from M4.3

> **A green check is only evidence if it could have gone red.**

M4.1 caught a vacuous pass in V3b, M4.2 caught a check structurally blind to an
absent row, and M4.3 caught a check that cannot fail because its input is empty.
Three consecutive milestones, three different shapes of the same defect. The
pre-apply type probe and `P5-17` defend against *type* drift; nothing defends
against a vacuous assertion except reading it and asking what would make it fail.

---

## Housekeeping performed at closeout

Scoped to M4.3, as instructed.

| File | Correction |
|---|---|
| `20260801_aiecon_p6_m4_3_service_quality.sql` | `⛔ PREPARED, NOT APPLIED` → `✅ APPLIED as 20260801135335`, with gate results (done with the release report; re-verified here) |
| `phase-6-m4-3-engineering-review.md` | marked **superseded**, not rewritten; scope row annotated *"not applied at time of writing; applied `20260801135335`"*; §9 marked executed 8/8; **stop point retained and marked historical** |
| `phase-6-m4-3-engineering-review.md` §9 | corrected one wrong claim: the expected Cost Engine WARN is **`P4-31`**, not `P4-05` — `P4-05` passed at 6/6 |
| `ai-economics.md` | Phase 6 status → **M4.3 ✅, Phase 6 COMPLETE**; migration table extended; Section 9 locked decision and the omitted-vs-blocked rule recorded |

**Historical record preserved.** The engineering review was annotated, never
rewritten — its pre-apply claims stand as written, with the outcome noted
alongside. Two of its figures were *sharpened* rather than corrected: §7's "2
generic INV-03 hits" and §3's "2 `owner_econ_*` references" both count the whole
M4.3 addition; inside `loadEconServices()` itself both counts are 0.

**Sweep result:** no stale `PREPARED` / `NOT APPLIED` / `PENDING` marker remains
in any M4.3 file, and none in any `aiecon` migration repo-wide.

---

## Remaining known issues

Carried forward into Phase 7 — none blocks Phase 6 closure.

1. **`P4-31` WARN** — 76 of 76 priced facts use unverified list prices; 100% of
   cost is modeled, not actual. The direct consequence of the owner's Phase 4
   decision to treat OpenAI list prices as provisional. Resolves when an invoice
   is loaded, with **no code change**.
2. **`P5-02b` is vacuous as written.** The non-vacuous form proven in V2 is not
   yet part of `verify-economics.sql`. Recommended, deliberately **not done** —
   outside M4.3's approved scope.
3. **Sections 1–8 render blocked** because 100% of telemetry is internal and
   business metrics exclude internal traffic (INV-25). Correct behaviour, not a
   defect. They unblock automatically when external traffic appears — no code
   change required.
4. **`avg_credits_per_question` is blocked by design** (M3 decision) pending the
   canonical external-cost-work-item denominator.
5. **The statistical usage anomaly ships blocked** — `insufficient_population`
   until n ≥ 30, evaluated from data so it unblocks with no code change.
6. **Profit is blocked in any currency** — revenue is EGP-only, cost USD-only,
   and no FX rate exists.
7. **"Over cost target" is unreportable.** 0 of 12 services carry a
   `cost_target_usd`, and `owner_cost_health()` emits `service_over_budget` only
   on breach — so "no targets set" and "none breached" are indistinguishable.
   **Open question for the owner**, unchanged by M4.3.
8. **The failure path and provider concentration are unexercised** — 76
   successes / 0 failures, one registered provider. Correct measurements of a
   real state, proven synthetically where production cannot reach.

---

## Standing constraints, all honoured

- `mcp__Supabase__deploy_edge_function` was **never called for `ai-tutor`**.
- **No frozen file was touched**: `regenerate-reports.js`, `taxonomy.js`,
  `exam-mistakes-logger.js`, `mock-exam.html`, `weakness.html`, `focus.html`.
- Every migration was **individually owner-approved** before `apply_migration`.
- **`admin.html` was not deployed.**
- No new investigation, no Phase 7 implementation, no Phase 7 migration.
- One feature at a time. No hidden fixes. No scope creep.

---

## Phase 6 — complete and frozen

| Milestone | Scope | Status |
|---|---|---|
| **M1** | Dashboard shell + Coverage board | ✅ closed 2026-08-01 |
| **M2** | P&L summary (Sections 1–3) | ✅ closed 2026-08-01 |
| **M3** | Operation mix + credit summary (4–6) | ✅ closed 2026-08-01 |
| **M4.1** | Lesson Economics (7) | ✅ closed 2026-08-01 |
| **M4.2** | Student Consumption (8) | ✅ closed 2026-08-01 |
| **M4.3** | AI Service & Model Analytics (9) | ✅ **closed 2026-08-01** |

**Sections 1–9 are implemented, applied and gate-verified. Phase 6 is frozen.**

Phase 6 delivered 9 dashboard sections, 12 `owner_econ_*` RPCs, 6 `owner_cost_*`
RPCs and 9 migrations, with every displayed number traceable to a named RPC or
view and no client-side financial calculation anywhere.

---

## Stop

`main` fast-forwarded to the approved M4.3 state. The Phase 7 branch is created
**empty** from that `main`.

**No Phase 7 work has begun** — no code, no migration, no planning, no
investigation. `admin.html` remains undeployed and awaits a separate owner
decision.
