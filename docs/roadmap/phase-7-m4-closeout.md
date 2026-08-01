# Phase 7 M4 — Final Closeout

**M4 is complete and frozen.** `owner_econ_simulate()` — the cost-side Section 10
simulator with profit correctly blocked — is applied, gate-verified and merged.

---

## Final state

| | |
|---|---|
| Milestone | M4 — `owner_econ_simulate()` + Section 10 (cost side) |
| Branch | `claude/phase7-simulator-breakeven` |
| Migrations applied | **1** — `20260801221950` `aiecon_p7_m4_econ_simulate` |
| Corrective migrations | **0** |
| Release Gate | **V1 … V15 — 15/15 PASS** |
| Pre-apply probe | **14/14 PASS** |
| Economics regression | **17 PASS + 1 VACUOUS** |
| Cost Engine regression | **25 PASS + 5 VACUOUS + 1 WARN** |
| New objects | **1 function** |
| Objects modified | **0** |
| Frozen files touched | **0** |
| `admin.html` / client files | **untouched** — RPC-only |
| Synthetic rows left in production | **0** |

---

## What M4 delivers

A working cost simulator with a real, actionable number:

```
gpt-4o -> gpt-4o-mini, include_internal
cost     actual=0.22961425  simulated=0.07730370  delta=-0.15231055  (-66.3332%)
profit   null  blocked  disjoint_cost_and_revenue_populations
revenue  null  blocked  revenue_simulation_not_implemented
```

A **66% cost reduction**, computed by re-pricing 76 actual calls from their raw
units — with profit blocked beside it and the reason stated in full.

---

## The owner's five instructions, discharged

| # | Instruction | Evidence |
|---|---|---|
| **1** | Profit gates on **external** overlap only | V3: `shared_all=1` (the owner's account) but `shared_EXT=0` → `disjoint_cost_and_revenue_populations` |
| **2** | Profit never computed, estimated or approximated | V10: **0 of 6** successful runs emitted a numeric profit, margin or revenue |
| **3** | Preserve the measured transition | V12: one fact flipped to external → `shared_EXT=1`, reason flips, profit still `null` |
| **4** | `owner_cost_reprice()` stays the single source of pricing | V11: simulator `0.07730370` = reprice `0.07730370` |
| **5** | Full sequence, stop on any failure | All ran; nothing failed; nothing skipped |

---

## Locked M4 decisions

- **Profit is structurally unable to be computed.** `profit.value` and
  `profit.margin_pct` are `NULL` on **every** return path — there is no branch
  that computes them. This is not a runtime guard that could be bypassed; it is
  the shape of the function.

- **The block reason is MEASURED, never hardcoded.** The function measures the
  overlap between the cost and revenue populations in the window and reports the
  reason that is actually true. It will transition on its own when real traffic
  arrives; no edit is required.

- **The gating overlap is the EXTERNAL one.** Profit is a business metric and
  INV-25 excludes internal traffic from business metrics. Both numbers are
  measured and both are returned in `basis`, so neither is hidden.

- **Cost is delegated, never re-implemented.** §11 is explicit that "Economics
  never re-implements provider pricing to run a scenario". A cost refusal is
  **propagated with its full payload**, not swallowed — V8 confirms
  `no_rate_card_for_target` arrives intact with `affected_calls: 24`.

- **Deferred knobs refuse, they do not silently no-op.** `packages` and
  `operations` refuse with `revenue_simulation_not_implemented`; `routing`
  refuses as `unsupported_scenario_key`; a non-zero `demand.elasticity` refuses
  with `elasticity_unsupported`. The M1 precedent, applied consistently.

- **INV-25 default preserved.** `include_internal` defaults to `false`, so an
  unqualified call refuses with `no_cost_facts_in_window`. Correct, not a defect.
  A diagnostic run opts in explicitly — the Section 9 precedent from M4.3.

---

## The M4 lesson — recorded as permanent

> **5. A business metric must gate on the EXTERNAL population, not the total
> population — and the overlap must be MEASURED, never inferred.**
>
> M4's first probe run failed on exactly this. The cost and revenue populations
> *appear* to overlap: `shared_users = 1`. That single shared user is the
> **owner's own account**, which has both internal cost telemetry and a real
> recognized subscription. Gating profit on the total overlap would have declared
> the two populations economically connected on the strength of internal testing
> traffic, and would have made `disjoint_cost_and_revenue_populations`
> **unreachable** — silently contradicting the ruling it was built to honour.
>
> The measured external overlap is `0`. That is the number that gates profit.
>
> The second half matters as much as the first: the M4 **investigation** asserted
> "0 shared users, 0 shared days" from a query that compared *all* cost users
> against *external-only* credit-transaction users, on transaction dates rather
> than recognition spans. It reached the right conclusion by the wrong
> arithmetic. Only the probe — which measures what the function measures —
> established the true figures.

**The cumulative lesson chain:**

| Learned at | Lesson |
|---|---|
| Phase 6 | A green check is only evidence **if it could have gone red**. |
| Phase 7 M2 | A check that was **never run** is not evidence at all. |
| Phase 7 M2 | Every new **JOIN** must be checked against the dependency boundaries. |
| Phase 7 M1 | Every `DROP`+`CREATE` needs **privilege verification after apply**. |
| **Phase 7 M4** | **A number in a design document is not evidence — only a measurement is. And a business metric gates on the external population, not the total one.** |

Four consecutive milestones in which a pre-apply probe caught something a written
analysis had asserted.

---

## Housekeeping sweep

| Check | Result |
|---|---|
| Phase 7 migration files vs applied | **7 files ↔ 7 applied** — reconciled |
| Frozen files (CLAUDE.md §2) | all **6 untouched** |
| Client / public files (`.html`/`.js`/`.ts`/`.mjs`) | **0 changed** |
| Public documentation layer (CLAUDE.md §5) | **untouched** — no page, no knowledge-graph entry |
| Working tree | clean, nothing untracked |
| Diff vs `main` | 6 files — 1 migration, 5 docs |
| Corrective migrations needed | **0** |
| Synthetic production rows | **0** |
| Edge Function deploys | **none** |

Final production state:

```
production state    facts=76 sum=0.22961425 superseded=0 cards=2 components=6 runs=2 alloc=2
grants              simulate: anon=f authenticated=t | reprice: anon=f
internal-only flag  is_internal true=76 false=0 (unchanged by M4)
```

Every negative control — the flipped `is_internal` flag, the doubled-price
correction card — lived inside a rolled-back transaction. `superseded=0` and
`true=76 / false=0` confirm nothing survived.

---

## Notable: no corrective migration

M1 required a second migration because `DROP`+`CREATE` re-granted `EXECUTE` to
`anon`. **M4 applied that lesson at write time** — the migration revokes from
`PUBLIC` *and* `anon`, so `anon` was already denied when the gate first ran.

A lesson recorded in one milestone and paid off in the next is the point of
recording it.

---

## Carried forward

- **M5** — revenue-side simulation (credit consumption, allowance exhaustion,
  package re-pricing). Its conservation check must be that re-charging at
  *current* prices reproduces recognized revenue exactly, the way M1's identity
  scenario reproduced `$0.22961425`.
- **Profit stays blocked after M5.** M5 implements the revenue *simulation*; it
  does not create the external cost population profit needs. Profit unblocks when
  external traffic is priced — and the function detects that itself.
- **M3 — break-even**, deferred by ruling; the `future_period` decision is
  binding whenever it is built.
- **VF-1 / VF-2** — Verification Framework enhancements, outside Phase 7 by
  ruling.

---

## Documents

`docs/roadmap/phase-7-m4-investigation.md`,
`phase-7-m4-engineering-review.md`,
`phase-7-m4-release-report.md`,
`phase-7-m4-closeout.md` (this file).

---

## Status

**M4: COMPLETE AND FROZEN.** Phase 7 is now M1 ✅ · M2 ✅ · M3 ⏸ deferred ·
M4 ✅ · **M5 next**.

M5 has not begun.
