# Phase 7 M1 — Final Closeout

**M1 is complete and frozen.** The `owner_cost_reprice` refusal contract is
applied, gate-verified and merged.

---

## Final state

| | |
|---|---|
| Milestone | M1 — `owner_cost_reprice()` scenario grammar + refusal contract |
| Branch | `claude/phase7-simulator-breakeven` |
| Migrations applied | **2** — M1, plus one corrective |
| Release Gate | **V1 … V10 — 10/10 PASS** |
| Pre-apply probes | **35/35 PASS** (22 functional + 13 branch) |
| Economics regression | **17 PASS + 1 VACUOUS** |
| Cost Engine regression | **25 PASS + 5 VACUOUS + 1 WARN** |
| New objects | 2 functions, 1 replaced, 1 DROP+CREATE |
| Frozen files touched | **0** |
| `admin.html` / client files | **untouched** — RPC-only, no UI in M1 |
| Synthetic rows left in production | **0** |

---

## The defect is closed

| | Before M1 | After M1 |
|---|---|---|
| `actual_cost_usd` | `0.22961425` | — |
| `simulated_cost_usd` | **`0.06758175`** | — |
| `calls` | **76** | — |
| Result | fictional **70.6% saving** | **refused** — `no_rate_card_for_target`, `affected_calls=24`, `affected_cost_usd=0.16203250` |

`resolve_rate_card()` returned NULL for an unpriced target, `price_units()`
returned `gross_usd = NULL` with `bad_unit` set, and the outer **`sum()` skipped
those rows** — while still counting them in `calls`. The number looked
trustworthy *because the call count was right*. `price_units` had been reporting
the failure all along; the old function discarded the signal.

**Both halves are now refusals.** The second — a card that exists but lacks a
unit the call consumed — produced the identical silent NULL and was unreachable
through the old grammar. It is `unpriceable_units_for_target`.

---

## Applied migrations

| Version | Name | What |
|---|---|---|
| `20260801205515` | `aiecon_p7_m1_reprice_refusal_contract` | `cost_engine.apply_discounts()`, `cost_engine.price_units()` 3-arg overload, 2-arg entry point refactored to delegate, `public.owner_cost_reprice()` DROP+CREATE returning `jsonb` |
| `20260801211727` | `aiecon_p7_m1_fix_reprice_anon_revoke` | **fix** — revoke `EXECUTE` from `anon` after DROP+CREATE re-applied default ACLs |

**Six `aiecon_p7_*` migrations applied; six files in the repo.** Reconciled.

---

## Release Gate — 10/10

```
V1  applied-state              PASS  objects=4 returns=jsonb vol=s secdef=t 2arg_lang=sql
V2  identity-exact             PASS  act=0.22961425 sim=0.22961425 delta=0.00000000 calls=76 conf=modeled
V3  delegation-no-scenario     PASS  facts=76 gross_mismatches=0
V4  no-rate-card-REFUSED       PASS  reason=no_rate_card_for_target via=model_swap affected=24 cost=0.16203250
V5  missing-unit-REFUSED       PASS  reason=unpriceable_units_for_target unit=output_token svc=vision
V6  no-partial-cost            PASS  5 refusals carry no totals and no by_service
V7  call-count-stable          PASS  identity=76 swapped=76 facts=76
V8  population-conservation    PASS  parts=0.22961425 whole=0.22961425 calls=76/76
V9  refusal-reasons            PASS (16/16 as designed)
V10 security+write-safety      PASS  non-owner=42501 facts=76 sum=0.22961425 bindings=9
```

**V2 is not a tautology** — the simulated side never reads `net_cost_usd`; it
re-prices from raw `units` through the rate card. Reproducing `0.22961425` to
eight decimals proves the simulator reproduces the engine.

**V3 discharged the owner's Decision 1 condition:** re-pricing with no scenario
reproduces today's results exactly, so the `price_units` delegation is
behaviour-preserving and **one** implementation of unit pricing remains.

---

## Locked M1 decisions

- **Refusal replaces silent under-pricing (Decision B).** Any scenario that
  cannot be priced in full refuses, states the reason, and returns **no partial
  cost**. The old `TABLE(...)` signature had nowhere to put a refusal — it was
  the defect's *enabler*, not merely its container. The function now returns one
  `jsonb` document.

- **Strict refusal on unpriced facts (owner Decision 2).** One unpriced fact in
  the window refuses the whole simulation: no partial result, no skipped row, no
  estimated value. This closes the same error class M1 began with.

- **Refuse vs note.** REFUSE when the answer would be *wrong*; NOTE when the
  answer is *right* but the scenario was partly inert (a swap matching no row).
  Nothing is dropped, so nothing is hidden — `notes: ["model_swap_inert: …"]`.
  Refusing an inert-but-correct scenario would be false rigour; ignoring it
  silently is the failure class M1 exists to eliminate.

- **`routing` is refused, not ignored.** It is deferred out of M1, so a scenario
  carrying it would otherwise appear to have been honoured. The entire old
  grammar (`swap_model_from`, `swap_model_to`, `rate_multiplier`, flat
  `from`/`to`) likewise refuses — an old call cannot silently mean something new.

- **Single pricing implementation (owner Decision 1).** The 2-arg
  `price_units` delegates to the 3-arg overload. This is the one change that sits
  *under* `run_pricing`, which writes `cost_facts`; it was accepted deliberately
  to avoid a second copy of the pricing loop — the M4.2 divergence hazard.

- **Scenario `discounts` REPLACE the stored rules**; absent means "keep today's
  rules", `[]` means "no discounts". Discounts round **per row**, matching the
  engine, so a 10% scenario discount yields `0.20665270`, not exactly
  `0.9 × total` — correct, and stated rather than hidden.

- **`rate_override` on a tiered card flattens tier prices** for that unit,
  preserving `per_qty` and boundaries. Exact on every card in production today
  (all single-band). A stated modelling choice.

- **No FX shortcut, again.** A scenario rate is a hypothesis and may be used; a
  missing real rate is never invented — EGP returns `NULL` with
  `egp_blocked_reason`.

---

## The privilege regression — recorded as a standing requirement, not a cleanup

**`P4-06 | FAIL | 1 owner_cost_* function(s) executable by anon — must be 0`**

`DROP FUNCTION` + `CREATE FUNCTION` re-applies Supabase's default privileges,
which grant `EXECUTE` to `anon` **directly**. The M1 migration revoked only
`FROM PUBLIC` — and **`REVOKE … FROM PUBLIC` does not remove a direct role
grant.** Only half the Phase 4 pattern was mirrored.

- **Impact:** not exploitable for data — the owner gate is the function's first
  statement, so an `anon` caller still receives `42501`. But it broke the Phase 4
  defense-in-depth invariant, and P4-06 was right to fail it.
- **Closed by correcting the code, not the check.** `P4-06` stands unmodified.
- **Re-verified:** `P4-06 PASS` (0 executable by anon), `P4-05 PASS`, and
  `authenticated` still holds `EXECUTE`.

**35 pre-apply probes did not catch it.** They tested the function's
*behaviour*; the regression was in its *privileges*. This is the concrete reason
a post-apply gate is not redundant with a pre-apply probe.

---

## Regression suites — both at baseline

**Economics — 17 PASS + 1 VACUOUS.** M1 touches no `econ` object. `P5-02b`
VACUOUS is the pre-existing, documented empty-input case. `P5-17` PASS: 15
`owner_econ_*` RPCs invoked, 0 raised.

**Cost Engine — 25 PASS + 5 VACUOUS + 1 WARN.** Sections A–D: 20 PASS, 5 VACUOUS
(`P4-10`, `P4-11`, `P4-20`, `P4-22`, `P4-30`), 1 WARN (`P4-31`, the standing
list-price warning — not an M1 regression). Section E (transactional, rolled
back): 5/5 PASS — idempotence, determinism, correction/supersede, conservation
after correction, immutability.

The two that matter most for M1:

```
P4-15  PASS  facts=0.22961425 service=0.22961425 provider=0.22961425 model=0.22961425
P4-16  PASS  allocated=0.22961425 priced=0.22961425 variance=0.00000000
```

---

## Housekeeping sweep

| Check | Result |
|---|---|
| Phase 7 migration files vs applied | **6 files ↔ 6 applied** — reconciled |
| Frozen files (CLAUDE.md §2) | all **6 untouched** |
| `admin.html` / any `.html`/`.js`/`.ts` | **0 changed** on this branch |
| Working tree | clean, no untracked files |
| Diff vs `main` | 4 files, +984 lines — 2 migrations, 2 docs |
| `owner_cost_reprice` client references | **0** |
| Synthetic production rows | **0** — `superseded=0`, `cards=2`, `components=6` |
| Edge Function deploys | **none** |

Final production state:

```
identity            ok=true act=0.22961425 sim=0.22961425 calls=76 services=7
the-defect-scenario ok=false reason=no_rate_card_for_target affected=24 cost=0.16203250
production state    facts=76 sum=0.22961425 telemetry=76 superseded=0 runs=2 alloc_runs=2
grants              anon=f authenticated=t
```

---

## Known limitations, carried forward

1. **The cross-provider swap *success* path has no production data.** Only
   `openai` has rate cards. The refusal path was proven on real data; the success
   path only inside a rolled-back transaction. **No fake provider, model or rate
   card was added to production**, per the owner's ruling.

2. **`telemetry_missing_for_facts` cannot fire today.** `cost_facts.call_id` has
   a FK to `ai_model_calls(id)` (NO ACTION) and `units` is `NOT NULL`. The branch
   guards the **Phase 8 `ai_model_calls` retention policy**, which must relax that
   FK. Proven to fire by dropping the FK inside the probe — the exact future
   condition it guards.

3. **`internal_pricing_gap` is deliberately unreachable.** It exists so a future
   edit that reintroduces a NULL pricing path *refuses* rather than quietly
   summing around it, as the original did.

4. **Row-by-row pricing.** 76 rows today; O(n) function calls. Consistent with
   `run_pricing`, but not built for millions of rows.

5. **No UI.** M1 is RPC-only. Section 10 is a later milestone.

---

## Deferred by owner ruling — not M1 scope

- **VF-1** — add `P4-32` (reprice must refuse an unpriceable swap target) and
  `P4-33` (identity reprice conserves exactly) to `verify-cost-engine.sql`. M1
  fixed a defect that survived six milestones because no check would have caught
  it, and no check would catch its return today.
- **VF-2** — `run_pricing` still carries its own inline copy of the discount fold
  that `cost_engine.apply_discounts()` now duplicates. Refactoring the writer
  onto the helper is the right end state; it widens the blast radius into
  `cost_facts`.

Both were explicitly ruled **outside Phase 7**.

---

## Documents

`docs/roadmap/phase-7-m1-engineering-review.md`,
`docs/roadmap/phase-7-m1-release-report.md`,
`docs/roadmap/phase-7-m1-closeout.md` (this file).

---

## Status

**M1: COMPLETE AND FROZEN.** Phase 7 is now M1 ✅ · M2 ✅ · M3 not started.

M3 has not begun.
