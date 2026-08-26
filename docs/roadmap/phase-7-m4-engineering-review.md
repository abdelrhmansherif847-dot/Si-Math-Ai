# Phase 7 M4 — `owner_econ_simulate()`: Engineering Review

**Migration prepared, nothing applied.** Awaiting approval.

> **Resolved since — note added 2026-08-25; the status line above is kept as
> written, because it was true when written.** It was approved and applied:
> `aiecon_p7_m4_econ_simulate`, production version `20260801221950`, and
> `public.owner_econ_simulate` exists in production (verified 2026-08-25).

`supabase/migrations/20260801c_aiecon_p7_m4_econ_simulate.sql`

| | |
|---|---|
| Objects | **1** — `public.owner_econ_simulate(jsonb)`, new |
| Pre-apply probe | **14 / 14 PASS** |
| Direct execution probe | **yes** — every assertion calls the RPC itself |
| Objects modified | **0** — `owner_cost_reprice` is *called*, not changed |
| Frozen files touched | **0** |
| `admin.html` / client files | untouched — RPC-only, no UI |
| Synthetic rows left in production | **0** |

---

## 1. What this implements

Your three rulings, literally:

| Ruling | Implementation |
|---|---|
| **1.** Profit blocked, never computed | `profit.value` and `profit.margin_pct` are `NULL` on **every** return path. There is no branch that computes them. Verified by T9. |
| **2.** M4 = cost side only; revenue → M5 | `packages` / `operations` **refuse** with `revenue_simulation_not_implemented` rather than being silently accepted and ignored. |
| **3.** Non-zero elasticity refused | `elasticity_unsupported`, with the value echoed. `elasticity: 0` is accepted (volume held constant, which is what actually happens). |

And the governing rule — *every computed value backed by real data, every
unsupported scenario failing explicitly* — is what shaped the one design
decision worth your attention, below.

**Cost is delegated, never re-implemented.** §11 is explicit that "Economics
never re-implements provider pricing to run a scenario". `owner_econ_simulate`
calls `owner_cost_reprice()` and composes its answer. A cost refusal is
**propagated with its full payload**, not swallowed — T7 confirms
`no_rate_card_for_target` arrives intact with `affected_calls: 24`.

---

## 2. The one decision that needs your eye: the block reason is *measured*

It would have been shorter to hardcode "profit is blocked". That becomes a lie
the moment the data changes. Instead the function **measures** the overlap
between the cost and revenue populations in the same window and reports the
reason that is actually true:

```
0 shared EXTERNAL users, or 0 shared external days
                          -> disjoint_cost_and_revenue_populations
external overlap exists   -> revenue_simulation_not_implemented   (M5 fills it)
```

**The overlap that gates profit is the EXTERNAL one**, because profit is a
business metric and INV-25 excludes internal traffic from business metrics.
That distinction is not academic — measured on production:

| | |
|---|---|
| cost users | **1** — of which **0 external** |
| revenue users in window | **7** |
| shared users, **all** | **1** ← the **owner's own account** |
| shared users, **external** | **0** ← what gates profit |

Gating on the all-users overlap would have reported the two populations as
connected when the only thing connecting them is your own testing traffic — and
would have made `disjoint_cost_and_revenue_populations` **unreachable**, quietly
contradicting your Ruling 1. Both numbers are returned in `basis`, so neither is
hidden.

**Both branches are proven reachable.** T11 flips one fact to external inside the
probe: the reason correctly becomes `revenue_simulation_not_implemented` with
`shared_ext = 1`, and profit stays `NULL`. Nothing is hardcoded, and the function
will transition by itself when real traffic arrives — no edit required.

---

## 3. A correction I owe you

**My M4 investigation published "shared users: 0, shared days: 0". That
arithmetic was wrong.** It compared *all* cost users against *external-only*
users drawn from `credit_transactions` — two different populations, and a
transaction date instead of a recognition span.

The pre-apply probe caught it, because the probe measures what the function
measures. The corrected reading is in §2.

**The conclusion survives; the arithmetic did not.** Profit still cannot be
computed honestly, and the corrected reading makes the case sharper: the only
link between cost and revenue is your internal account. But the error was real,
it was mine, and it would have shipped a subtly wrong gate condition had the
probe not been mandatory.

This is the **fourth consecutive milestone** where a pre-apply probe caught
something a written analysis asserted. Phase 6 learned *a green check is only
evidence if it could have gone red*; M2 added *a check that was never run is not
evidence at all*. M4 adds the third: **a number in a design document is not
evidence either — only a measurement is.**

---

## 4. Pre-apply probe — 14/14

```
T1  identity-costside      PASS  ok=true act=0.22961425 sim=0.22961425 calls=76
T2  profit-blocked         PASS  value=null margin=null conf=blocked
                                 reason=disjoint_cost_and_revenue_populations
    measured:              cost_users=1 (ext 0) rev_users=7
                           shared_all=1 shared_ext=0 shared_days=0
T3  revenue-blocked        PASS  value=null conf=blocked events=8 users=7
T4  revenue-keys-REFUSED   PASS  2/2  (packages, operations)
T5  elasticity             PASS  3/3  (0.5 & -1 refused, 0 accepted)
T6  routing-REFUSED        PASS  reason=unsupported_scenario_key
T7  cost-refusal-propagated PASS ok=false stage=cost
                                 reason=no_rate_card_for_target affected=24
T8  INV-25-default         PASS  ok=false stage=cost reason=no_cost_facts_in_window
T9  never-emits-profit     PASS  0 of 5 successful runs emitted a profit/revenue number
T10 no-drift-from-engine   PASS  simulate=0.07730370 reprice=0.07730370
T11 other-branch-reachable PASS  reason=revenue_simulation_not_implemented shared_ext=1
T12 grants                 PASS  anon=f authenticated=t
T13 write-safety           PASS  facts=76 sum=0.22961425 vol=s secdef=t
T14 security               PASS  non-owner -> 42501
```

**T9 is the load-bearing one for Ruling 1**: five different successful scenarios,
and not one emits a numeric profit, margin, or revenue. **T10 proves no drift** —
the cost figure the simulator reports is byte-identical to what
`owner_cost_reprice` returns for the same scenario, so there is no second
pricing path to diverge.

**T12 applies the M1 lesson at write time.** A newly created function receives
Supabase's default ACLs, which grant `EXECUTE` to `anon` directly. The migration
revokes from `PUBLIC` **and** `anon`. This is exactly the defect P4-06 caught
after M1 was applied — caught here before apply instead.

---

## 5. Behaviour you should expect

**An unqualified call refuses.** `owner_econ_simulate('{}')` returns
`{ok:false, stage:'cost', reason:'no_cost_facts_in_window'}` because
`include_internal` defaults to `false` and there is no external cost. That is
correct and honest, not a defect — the same INV-25 default every business
surface uses. A diagnostic run passes `include_internal: true` explicitly, the
Section 9 precedent from Phase 6 M4.3.

**The usable output today is the cost delta.** For example, `gpt-4o → gpt-4o-mini`
returns `simulated_usd = 0.07730370` against `actual_usd = 0.22961425`. That is a
real, actionable number backed by real telemetry. Profit is blocked beside it,
with the reason stated.

---

## 6. Limitations, stated

1. **Revenue is not simulated at all** — deferred to M5 by your ruling. The
   `revenue` block always reports `blocked` with
   `revenue_simulation_not_implemented`, and carries the in-window event and user
   counts so the surface is not empty.
2. **Profit will remain blocked after M5** until external traffic is priced. M5
   implements the revenue *simulation*; it does not create the external cost
   population that profit needs.
3. **No UI.** RPC-only, consistent with M1 and M2.
4. **`routing` still refused** — deferred at the engine level, so refused here.

---

## 7. Rollback

```sql
DROP FUNCTION IF EXISTS public.owner_econ_simulate(jsonb);
```

Clean: the function is new, nothing depends on it, and it writes nothing.

---

## 8. Proposed sequence, on your approval

1. Apply the M4 migration.
2. Stop; confirm applied state **including grants** (the M1 lesson).
3. Release Gate — re-run all 14 probe assertions against the applied function.
4. Economics regression (expect 17 PASS + 1 VACUOUS).
5. Cost Engine regression (expect 25 PASS + 5 VACUOUS + 1 WARN).
6. Release Report.
7. Closeout, roadmap update, merge to `main`.

---

## Stop

**Nothing applied.** Awaiting your approval — and specifically your view on §2,
the choice to gate the block reason on the **external** overlap rather than the
all-users overlap.
