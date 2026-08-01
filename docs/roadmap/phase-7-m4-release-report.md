# Phase 7 M4 — Release Report

**Status: APPLIED to production** · 2026-08-01 · Supabase `igvkyxkmjnkzscqgommj`

| | |
|---|---|
| Migration applied | **1** — `20260801221950` `aiecon_p7_m4_econ_simulate` |
| Release Gate | **15 / 15 PASS** |
| Pre-apply probe | **14 / 14 PASS** |
| Economics regression | **17 PASS + 1 VACUOUS** (baseline) |
| Cost Engine regression | **25 PASS + 5 VACUOUS + 1 WARN** (baseline) |
| Defects found by the gate | **0** |
| Objects modified | **0** — `owner_cost_reprice` called, not changed |
| Frozen files touched | 0 |
| Synthetic rows left in production | **0** |

**One migration, no corrective.** The M1 privilege lesson was applied at write
time rather than caught after apply — `anon` was already denied when the gate
first ran.

---

## 1. Your five instructions, discharged

| # | Instruction | Evidence |
|---|---|---|
| **1** | Profit gating uses **external** overlap only; internal traffic never satisfies it | V3: `shared_all=1` (the owner account) but `shared_EXT=0` → blocks with `disjoint_cost_and_revenue_populations` |
| **2** | Profit permanently blocked; never computed, estimated or approximated | V10: **0 of 6** successful runs emitted a numeric profit, margin or revenue. `profit.value` is `NULL` on every return path |
| **3** | Preserve the measured transition | V12: flipping one fact to external gives `shared_EXT=1` and the reason flips to `revenue_simulation_not_implemented`, profit still `null` |
| **4** | `owner_cost_reprice()` remains the single source of pricing | V11: simulator `0.07730370` = reprice `0.07730370`, identical. No second pricing implementation exists |
| **5** | Normal apply sequence, gate, full regressions; stop on any failure | All ran; nothing failed; nothing was skipped |

---

## 2. Release Gate — 15/15

```
V1  applied-state          PASS  returns=jsonb vol=s secdef=t owner_econ=16
V2  identity-costside      PASS  ok=true act=0.22961425 sim=0.22961425 calls=76
V3  profit-blocked         PASS  value=null margin=null conf=blocked
                                 reason=disjoint_cost_and_revenue_populations
    RULING-1 measured:     cost_users=1 (ext 0) rev_users=7
                           shared_all=1 shared_EXT=0 shared_days=0
V4  revenue-blocked        PASS  value=null conf=blocked events=8 users=7
V5  RULING-2 rev-REFUSED   PASS  2/2 (packages, operations)
V6  RULING-3 elasticity    PASS  3/3 (0.5 & -1 refused, 0 accepted)
V7  routing-REFUSED        PASS  reason=unsupported_scenario_key
V8  cost-refusal-propagated PASS ok=false stage=cost
                                 reason=no_rate_card_for_target affected=24
V9  INV-25-default         PASS  ok=false stage=cost reason=no_cost_facts_in_window
V10 RULING-1 never-profit  PASS  0 of 6 successful runs emitted a profit/revenue number
V11 RULING-4 no-drift      PASS  simulate=0.07730370 reprice=0.07730370
V12 measured-transition    PASS  reason=revenue_simulation_not_implemented
                                 shared_EXT=1 days=1 profit=null
V13 grants                 PASS  anon=f authenticated=t
V14 write-safety           PASS  facts=76 sum=0.22961425 bindings=9
V15 security               PASS  non-owner -> 42501
```

**V3 is the line you drew.** `shared_all = 1` — the owner's own account has both
cost and a recognized subscription — but `shared_EXT = 0`. Gating on the
all-users number would have declared the populations connected on the strength of
internal testing traffic and made `disjoint_cost_and_revenue_populations`
unreachable. It gates on the external number, so the block fires truthfully.

**V12 is the proof it is not hardcoded.** One fact flipped to external inside the
gate transaction, and the reason changes by itself — with profit still `null`.
The function will make that transition on its own when real traffic arrives; no
edit is required.

---

## 3. Regression suites — both at baseline

**Economics — 17 PASS + 1 VACUOUS.** The two checks M4 moves:

```
P5-04  PASS  16 functions, 16 STABLE+SECDEF, 16 owner-gated   (was 15)
P5-05  PASS  0 of 16 owner_econ_* function(s) executable by anon
P5-17  PASS  16 owner_econ_* RPC(s) invoked, 0 raised
```

`P5-17` invoked the new RPC through the generic path and it returned a row —
the direct-execution requirement satisfied by the suite itself, not only by my
probe. `P5-02b` VACUOUS is the pre-existing documented empty-input case.

**Cost Engine — 25 PASS + 5 VACUOUS + 1 WARN.** Untouched by M4, and confirmed:

```
P4-15  PASS  facts=0.22961425 service=0.22961425 provider=0.22961425 model=0.22961425
P4-16  PASS  allocated=0.22961425 priced=0.22961425 variance=0.00000000
P4-06  PASS  0 owner_cost_* function(s) executable by anon
```

Section E (transactional, rolled back): 5/5 PASS — idempotence, determinism,
correction/supersede, conservation after correction, immutability.

`P4-31 WARN` is the standing list-price warning, not an M4 regression.

---

## 4. What the simulator actually returns today

```
scenario: gpt-4o -> gpt-4o-mini, include_internal

cost     actual=0.22961425  simulated=0.07730370  delta=-0.15231055  (-66.3332%)
profit   null   confidence=blocked  reason=disjoint_cost_and_revenue_populations
revenue  null   confidence=blocked  reason=revenue_simulation_not_implemented
```

**That cost delta is a real number backed by real telemetry** — a 66% reduction,
computed by re-pricing 76 actual calls from their raw units. It is the
actionable output of this milestone.

**An unqualified call refuses**: `owner_econ_simulate('{}')` returns
`{ok:false, stage:'cost', reason:'no_cost_facts_in_window'}` because
`include_internal` defaults to `false` and there is no external cost. Correct
under INV-25, not a defect.

---

## 5. Final production state

```
production state    facts=76 sum=0.22961425 superseded=0 cards=2 components=6 runs=2 alloc=2
grants              simulate: anon=f authenticated=t | reprice: anon=f
internal-only flag  is_internal true=76 false=0 (unchanged by M4)
```

Every synthetic object used in a negative control — the flipped `is_internal`
flag, the doubled-price correction card — lived inside a transaction that was
rolled back. `superseded=0`, `cards=2`, `components=6` and `true=76 / false=0`
confirm nothing survived.

---

## 6. Carried forward

- **M5** — revenue-side simulation (credit consumption, allowance exhaustion,
  package re-pricing). Its conservation check must be that re-charging at
  *current* prices reproduces recognized revenue exactly, the way M1's identity
  scenario reproduced `$0.22961425`.
- **Profit stays blocked after M5.** M5 implements the revenue *simulation*; it
  does not create the external cost population profit needs. Profit unblocks when
  external traffic is priced — and the function will detect that itself.
- **M3** — break-even, deferred, with the `future_period` ruling binding.
- **VF-1 / VF-2** — outside Phase 7 by ruling.

---

## Stop

M4 is applied and verified. No closeout, no roadmap update, no M5.

Awaiting your review.
