# Phase 7 M2 — Final Closeout

**M2 is complete and frozen.** Platform cost entries, Net Profit and Net Margin
are applied, gate-verified and merged.

---

## Final state

| | |
|---|---|
| Milestone | M2 — `platform_cost_entries` + Net Profit / Net Margin |
| Branch | `claude/phase7-simulator-breakeven` |
| Migrations applied | **4** — M2a, M2b, M2c *(fix)*, M2d *(fix)* |
| Release Gate | **M2-V1 … V9 — 9/9 PASS** |
| Economics regression | **17 PASS, 1 VACUOUS** |
| Cost Engine regression | **20 PASS, 5 VACUOUS, 1 WARN** |
| New objects | 1 table, 1 view, 6 functions |
| Frozen files touched | **0** |
| `admin.html` | **untouched** — RPC-only entry, by ruling |
| Rows in `platform_cost_entries` | **0** — every test rolled back |

---

## ⚠ Correction to the milestone record: **M1 was never implemented**

The Phase 7 status was summarised as *"M1 complete, M2 complete"*. **M1 has not
been started.** Verified against production at closeout:

| Evidence | Finding |
|---|---|
| `aiecon_p7_*` migrations applied | **only M2a, M2b, M2c, M2d** — no M1 migration exists |
| `owner_cost_reprice` scenario grammar | still `swap_model_from` / `swap_model_to`; **no `service_swap`, no `rate_override`, no refusal contract** |
| The M1 defect, re-measured | swapping to a model with **no rate card** still returns **`$0.06758175`** against an actual `$0.22961425` |

**The reprice defect is live in production.** It silently under-reports cost by
70.6% when a swap target has no rate card, presenting a fictional saving as a
real one.

**Containment, unchanged since it was found:** `owner_cost_reprice` is called by
**no client file**, is owner-gated, `anon`-denied and `STABLE`. Exposure is to a
direct API caller holding an owner session — the feature is misleading, not
dangerous, and no dashboard surfaces it.

**M1 remains open and is the natural next milestone.** Recording this here so the
roadmap does not carry a milestone marked complete that was never built.

---

## Applied migrations

| Version | Name | What |
|---|---|---|
| `20260801182954` | `aiecon_p7_m2a_platform_cost_entries` | table, 8 CHECKs, 2 partial unique indexes, freeze trigger, REVOKE + RLS, sanctioned view, `platform_cost_available()` rewrite, writer + history RPCs |
| `20260801183045` | `aiecon_p7_m2b_net_profit` | `net_block_reason()`, extended `v_breakeven_inputs` (8 → 12 cols), 2 net-profit RPCs |
| `20260801183733` | `aiecon_p7_m2c_fix_set_platform_cost_ambiguity` | **fix** — `42702`, qualification only |
| `20260801185207` | `aiecon_p7_m2d_restore_layer_boundary` | **fix** — `cost_engine.to_egp()`; econ stops reading `fx_rates`; writer renamed out of `owner_econ_*` |

**Twenty `aiecon` migrations applied** across Phases 2–7. Repo files and applied
migrations reconcile: 4 Phase 7 files, 4 applied.

---

## Production state

| Measure | Value |
|---|---|
| `owner_econ_*` RPCs | **15** — all STABLE, SECDEF, owner-gated |
| `owner_cost_*` RPCs | 6 — all read-only |
| **`owner_write_*` RPCs** | **1** — the only writer |
| `econ` views / functions | 12 / 9 |
| `platform_cost_entries` rows | **0** |
| Months in `v_breakeven_inputs` | 14, **all net-blocked** |
| Priced cost facts | 76, `$0.22961425`, all internal |

---

## The two lessons this milestone earned

Both are now **standing requirements**, alongside the pre-apply type probe.

### 1. Every new RPC requires a **direct execution probe**

The M2 pre-apply probe exercised the table, the freeze trigger, all eight
constraints, the sanctioned view, the resolver and **both** net-profit RPCs — and
still shipped a function that raised `42702` on every call, because **it never
called that function**. It inserted into the table directly and performed the
supersede by hand.

> **Testing the tables, triggers and views *around* a function proves nothing
> about the function.** `42702`, like `42804`, is raised only at execution.

This is the same lesson `P5-17` exists to enforce, applied one level down: to new
RPCs at authoring time, not only to the catalogue at regression time.

### 2. Every new JOIN must be checked against the **architectural dependency boundaries**

`econ.v_breakeven_inputs` joined `cost_engine.fx_rates` — inside INV-05's
forbidden set. Worse than the edge: **econ was implementing FX policy**, which
belongs to the engine. The correct pattern already existed and was not followed —
`v_pnl_daily` never touches `fx_rates`, it consumes
`cost_engine.v_cost_daily.total_cost_egp`.

The design document, the engineering review **and** the pre-apply probe all
missed it, because every one of them asked about **types and behaviour** and none
asked whether a new JOIN **crossed a forbidden edge**.

> **A dependency edge is as much a contract as a column type**, and nothing in
> the authoring workflow was checking it.

### The shape both share

Phase 6 learned that *a green check is only evidence if it could have gone red*.
M2 adds the complement: **a check that was never run is not evidence at all.**
Both defects were invisible to review and visible only to execution.

---

## Locked M2 decisions

Recorded so they are not re-litigated:

- **Immutable financial records.** No edit-in-place. A correction inserts a new
  revision and marks the previous row `is_current = false`, enforced by a freeze
  trigger — DELETE raises unconditionally, only the supersede columns may change,
  and supersede is one-way.
- **Audit Model = Alternative A** (in-row supersede), with `created_by`,
  `superseded_by`, `revision_number`, `change_reason` and a supersede chain.
- **`change_reason` is mandatory on every correction** — enforced by CHECK *and*
  by the RPC, so the caller sees a readable error.
- **`amount > 0`.** Credit notes and negative amounts are out of scope for
  Phase 7; if needed they become their own phase.
- **Two explicit RPCs, no grain parameter** — `owner_econ_net_profit_series()`
  and `owner_econ_net_profit_summary()`.
- **Net Profit is MONTHLY only.** No allocation of any kind — not equal,
  revenue-weighted or AI-cost-weighted. Where data is not measured daily, no
  daily measurement is invented. `v_pnl_daily` is untouched.
- **No FX shortcut.** A USD entry with no rate makes the whole month NULL and
  blocked. EGP entry is never offered as a workaround.
- **Namespace rule, now without exception:** `owner_econ_*` and `owner_cost_*`
  are read-only; `owner_write_*` mutates.
- **Sibling resolver, not an extension.** `econ.net_block_reason()` composes
  `econ.block_reason()` rather than changing a function four surfaces call.

---

## Housekeeping performed at closeout

| File | Correction |
|---|---|
| `20260801_aiecon_p7_m2a_...sql` | header said the fix was *"PREPARED AND NOT YET APPLIED"* — stale once M2c/M2d applied. Now records both follow-ups and warns that **the writer defined in §6 no longer exists** |
| `20260801_aiecon_p7_m2b_...sql` | `⛔ PREPARED` → applied, with post-apply verification |
| `20260801_aiecon_p7_m2c_...sql` | applied status + the probe lesson |
| `20260801_aiecon_p7_m2d_...sql` | applied status + 11/11 pre-apply result |
| `ai-economics.md` | Phase 7 status, applied migrations, the two lessons, and the M1 correction |

**Sweep result:** no stale `PREPARED` / `NOT APPLIED` / `PENDING OWNER` marker
remains in any Phase 7 file. Repo files reconcile with applied migrations 4 = 4.

---

## Known issues carried forward

1. **M1 is not implemented and its defect is live** — `owner_cost_reprice`
   under-reports by 70.6% on a swap to an unpriced target. Unreachable from any
   UI. **The most significant open item.**
2. **`P5-01` has a blind spot** — it inspects view→relation edges, so an econ
   object calling a `cost_engine` *function* touching the price book would not be
   caught. Real; ruled a **separate Verification Framework Enhancement**, not M2
   scope.
3. **`P5-02b` is vacuous** — pre-existing since Phase 5.
4. **`P4-31` WARN** — 100% of cost is list-priced.
5. **Net Profit blocked on all 14 months** — three ways: no external AI cost, no
   FX rate, no platform data. **Correct behaviour**, by ruling.
6. **No UI for platform cost entry** — RPC-only via
   `owner_write_platform_cost(...)`, by ruling. The admin interface is a later
   milestone.
7. **The rollback window closes once real invoice data is entered.** Applying and
   populating remain deliberately separate steps.

---

## Standing constraints, all honoured

- `mcp__Supabase__deploy_edge_function` **never called for `ai-tutor`**.
- **No frozen file touched.**
- Every migration **individually owner-approved** before `apply_migration`.
- **`admin.html` not deployed and not modified.**
- **No verification check was changed to accommodate code.** Both regressions
  were closed by correcting the architecture.
- No M3 work started.

---

## Stop

M2 is closed. `main` fast-forwarded; the Phase 7 branch re-levelled.

**M3 has not begun.** The recommended next milestone is **M1**, which remains
unimplemented and carries the live reprice defect.
