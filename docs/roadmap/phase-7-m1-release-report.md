# Phase 7 M1 — Release Report

**Status: APPLIED to production** · 2026-08-01 · Supabase `igvkyxkmjnkzscqgommj`

| | |
|---|---|
| Migrations applied | **2** — M1, plus one corrective |
| Release Gate | **10 / 10 PASS** |
| Economics regression | **17 PASS + 1 VACUOUS** (baseline, unchanged) |
| Cost Engine regression | **25 PASS + 5 VACUOUS + 1 WARN** (baseline, unchanged) |
| Defects found by the gate | **1 — found, fixed, re-verified** |
| Frozen files touched | 0 |
| Edge Function deployed | none |
| Synthetic rows left in production | **0** |

---

## 1. Applied

| Version | Migration |
|---|---|
| `20260801205515` | `aiecon_p7_m1_reprice_refusal_contract` |
| *(follow-on)* | `aiecon_p7_m1_fix_reprice_anon_revoke` |

Confirmed applied state: `owner_cost_reprice` returns `jsonb`, is `STABLE` +
`SECURITY DEFINER`; `cost_engine.price_units` has 2 overloads with the 2-arg
entry point now `LANGUAGE sql` (delegating); `cost_engine.apply_discounts`
present. 21 `aiecon` migrations total.

---

## 2. The seven confirmations you asked for

Every one measured against the **applied** function, not a probe copy.

| # | You asked | Result |
|---|---|---|
| 1 | Identity scenario returns exactly `0.22961425` | ✅ `act=0.22961425 sim=0.22961425 delta=0.00000000` |
| 2 | Any target without a rate card is refused | ✅ `no_rate_card_for_target`, `affected_calls=24`, `affected_cost_usd=0.16203250` |
| 3 | Any missing unit is refused | ✅ `unpriceable_units_for_target`, `unit_code=output_token` |
| 4 | No partial cost | ✅ 5 distinct refusals carry **no `totals` and no `by_service` key at all** |
| 5 | Call count does not change | ✅ identity `76`, swapped `76`, facts `76` |
| 6 | Population conservation preserved | ✅ parts `0.22961425` = whole `0.22961425`, calls `76/76`; also holds on the swapped scenario |
| 7 | All refusal reasons return as designed | ✅ **16 / 16** in exact expected order |

The 16 reasons, in the order returned:
`invalid_scenario`, `unsupported_scenario_key` (×2 — `routing` and the old
grammar), `invalid_basis_window` (×2 — inverted and unparseable),
`unknown_service_in_swap`, `invalid_service_swap`, `invalid_model_swap`,
`invalid_rate_override_key`, `invalid_rate_override_value`,
`invalid_discounts`, `invalid_discount_type`, `invalid_discount_value`,
`invalid_fx`, `no_cost_facts_in_window`, `rate_override_unknown_unit`.

Plus, proven separately: `unpriceable_units_for_target`,
`unpriced_facts_in_window`, `telemetry_missing_for_facts`,
`no_rate_card_for_target`.

---

## 3. Release Gate — 10 / 10

```
V1  applied-state              PASS  objects=4 returns=jsonb vol=s secdef=t 2arg_lang=sql
V2  identity-exact             PASS  act=0.22961425 sim=0.22961425 delta=0.00000000 calls=76 conf=modeled
V3  delegation-no-scenario     PASS  facts=76 gross_mismatches=0  (2-arg path == recorded)
V4  no-rate-card-REFUSED       PASS  ok=false reason=no_rate_card_for_target via=model_swap affected=24 cost=0.16203250
V5  missing-unit-REFUSED       PASS  reason=unpriceable_units_for_target unit=output_token svc=vision
V6  no-partial-cost            PASS  5 refusals carry no totals and no by_service
V7  call-count-stable          PASS  identity=76 swapped=76 facts=76
V8  population-conservation    PASS  parts=0.22961425 whole=0.22961425 calls=76/76 swapped_parts_ok=0.07730370
V9  refusal-reasons            PASS (16/16 as designed)
V10 security+write-safety      PASS  non-owner=42501 facts=76 sum=0.22961425 bindings=9
```

**V3 is your Decision 1 condition, discharged.** You required the gate to prove
that re-pricing with no scenario reproduces today's results. All 76 production
facts were re-priced through the refactored 2-arg `price_units` and compared
against the recorded `gross_cost_usd`: **0 mismatches.** The delegation is
behaviour-preserving, and there is now exactly one implementation of unit
pricing.

**V2 is not a tautology.** The simulated side never reads `net_cost_usd`; it
re-prices from raw `units` through the rate card. Reproducing `0.22961425` to
the eighth decimal proves the simulator reproduces the engine.

---

## 4. The defect this milestone existed to kill

| | Before M1 | After M1 |
|---|---|---|
| `actual_cost_usd` | `0.22961425` | — |
| `simulated_cost_usd` | **`0.06758175`** | — |
| `calls` | **76** | — |
| Result | fictional **70.6% saving** | **refused**, with `affected_calls=24`, `affected_cost_usd=0.16203250` |

`sum()` was skipping the 24 rows whose target had no rate card, while still
counting them in `calls`. The number looked trustworthy because the call count
was right. It now refuses and names the cost you would otherwise have lost.

---

## 5. A defect the gate caught in my own migration

**`P4-06 | FAIL | 1 owner_cost_* function(s) executable by anon — must be 0`**

`DROP FUNCTION` + `CREATE FUNCTION` re-applies Supabase's default privileges,
which grant `EXECUTE` to `anon` **directly**. My migration revoked only
`FROM PUBLIC`, and `REVOKE … FROM PUBLIC` does not remove a direct role grant.
So `anon` kept `EXECUTE` on `owner_cost_reprice`.

- **Impact:** not exploitable for data — the function's first statement is the
  owner gate, so an `anon` caller still gets `42501`. But it broke the Phase 4
  defense-in-depth invariant, and P4-06 was right to fail it.
- **Cause:** the Phase 4 migration revokes from `PUBLIC` *and* `anon` for every
  other `owner_cost_*` function. I mirrored only half the pattern.
- **Fix:** `20260801b_aiecon_p7_m1_fix_reprice_anon_revoke` — applied, and
  folded into the M1 migration file so a replay from scratch is correct in one
  pass.
- **Re-verified:** `P4-06 PASS (0 executable by anon)`, `P4-05 PASS`, and
  `authenticated` still holds `EXECUTE`.

I ran 35 pre-apply probes and none of them checked the grant. The probes tested
the function's *behaviour*; the regression was in its *privileges*. Worth
recording as the reason the post-apply gate is not redundant with a pre-apply
probe.

---

## 6. Economics regression — 17 PASS + 1 VACUOUS

Unchanged from the Phase 5 baseline. M1 touches no `econ` object.

P5-01…P5-16 as recorded; **P5-02b VACUOUS** (no econ view emits a `service_code`
row — pre-existing, documented); **P5-17 PASS** (15 `owner_econ_*` RPCs invoked,
0 raised; 5 return 0 rows — sound but empty, the known Phase 5 data state).

---

## 7. Cost Engine regression — 25 PASS + 5 VACUOUS + 1 WARN

**Sections A–D (26):** 20 PASS, 5 VACUOUS (`P4-10`, `P4-11`, `P4-20`, `P4-22`,
`P4-30`), 1 WARN (`P4-31`). Exactly the documented baseline.

The two that matter most for M1:

```
P4-15  PASS  facts=0.22961425 service=0.22961425 provider=0.22961425 model=0.22961425
P4-16  PASS  allocated=0.22961425 priced=0.22961425 variance=0.00000000
```

**Section E (5, transactional, rolled back):** all PASS.

```
P4-24 idempotence   PASS  re-run wrote 0 new fact(s) (76 -> 76)
P4-25 determinism   PASS  digest 15e6944a6ef4
P4-26 correction    PASS  model=gpt-4o-mini current=76 superseded=76 total 0.22961425 -> 0.29719600
P4-27 conservation  PASS  allocated=0.29719600 priced=0.29719600
P4-28 immutability  PASS  update=blocked delete=blocked
```

`P4-31 WARN` is the standing, correct warning that 100% of cost is list-priced
rather than invoice-verified. Not an M1 regression.

---

## 8. Final production state

```
identity            ok=true act=0.22961425 sim=0.22961425 calls=76 services=7
the-defect-scenario ok=false reason=no_rate_card_for_target affected=24 cost=0.16203250
production state    facts=76 sum=0.22961425 telemetry=76 superseded=0 runs=2 alloc_runs=2
rate cards          cards=2 components=6 (no synthetic rows left behind)
grants              anon=f authenticated=t
```

Every synthetic object used in a negative control (partial rate card, unpriced
fact, dropped FK, doubled-price correction) lived inside a transaction that was
rolled back. `superseded=0` and `cards=2 / components=6` confirm nothing
survived.

---

## 9. Recorded, not done

Per your Decision 3, **`P4-32` and `P4-33` were NOT added.** Logged as an
independent Verification Framework enhancement to be taken up **after Phase 7**:

> **VF-1** — add `P4-32` (reprice must refuse an unpriceable swap target) and
> `P4-33` (identity reprice conserves exactly) to `verify-cost-engine.sql`.
> M1 fixed a defect that survived six milestones because no check would have
> caught it, and no check would catch its return today.

Also carried forward from the engineering review:

> **VF-2** — `run_pricing` still carries its own inline copy of the discount
> fold that `cost_engine.apply_discounts` now duplicates. Refactoring the writer
> onto the helper is the right end state; it widens the blast radius into
> `cost_facts` and was kept out of M1.

---

## Stop

M1 is applied and verified. No closeout, no roadmap update, no M3.

Awaiting your review of these results.
