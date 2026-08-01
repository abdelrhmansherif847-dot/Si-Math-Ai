# Phase 7 — Simulator & Break-even: Investigation and Implementation Plan

**Status: investigation and plan only. No production code written, no migration
prepared, no database object changed.**

Branch `claude/phase7-simulator-breakeven`, cut from `main` at `eba9367`.

Scope per the roadmap §11–§12: **Section 10 (Pricing Simulator)** and
**Section 11 (Break-even Analysis)**.

---

## 1. Headline: a live defect found during investigation

**`owner_cost_reprice()` silently under-reports cost when a swap target has no
rate card.** This is not a theoretical gap — it is measurable today, and it
directly violates a Phase 7 exit criterion that was written before the function
was built.

The roadmap requires:

> a `service_swap` to an unpriced target **refuses** rather than costing zero

Measured against production:

| Scenario | Reported simulated cost |
|---|---|
| Actual cost, all 76 facts | `$0.22961425` |
| Swap `gpt-4o` → `gpt-4o-mini` (target **has** a card) | `$0.07730370` |
| Swap `gpt-4o` → **`claude-sonnet-4`** (target has **no** card) | **`$0.06758175`** |

**Root cause, confirmed by measurement.** `cost_engine.price_units()` returns
NULL when `resolve_rate_card()` finds no card. `sum()` ignores NULLs. So the 33
`gpt-4o` calls — worth exactly `$0.16203250` — priced to NULL and **vanished from
the total**. `0.22961425 − 0.16203250 = 0.06758175`, matching the returned figure
to the cent.

**Why this is worse than costing zero.** Costing zero would at least be visibly
absurd. Instead the function returns a plausible number that reads as a **70.6%
cost saving** from switching to Claude — a saving that is entirely fictional and
is in fact just the cost of the calls it failed to price. An owner acting on it
would be acting on nothing.

**Severity is contained, and I want to be precise about why.** It is *not*
reachable from the UI: `owner_cost_reprice` is called by **no client file** —
`admin.html` does not reference it, and neither does any other page. It is
owner-gated (`has_role_at_least('owner')`), `anon` cannot execute it, and it is
`STABLE` so it cannot write. The exposure is to a direct API caller holding an
owner session, not to the dashboard.

**This is the same defect class as INV-23 and INV-26** — an unknown value
silently becoming a smaller number instead of a refusal — which this project has
already ruled on twice. It should be fixed on that principle, not because Phase 7
happens to need it.

### A second, latent defect in the same function

`owner_cost_reprice` joins telemetry with `JOIN public.ai_model_calls`, not
`LEFT JOIN`. Impact **today is zero** — 0 facts lack telemetry. But §Phase 8
plans a retention policy for `ai_model_calls`, and on the day it prunes, this
function starts silently dropping historical cost. This is exactly the reasoning
that made M4.3 choose `LEFT JOIN` for `owner_cost_service_breakdown`. Recording
it now so the two are fixed together rather than rediscovered later.

---

## 2. What already exists

Phase 7 is less greenfield than the roadmap implies. Measured:

| Object | State |
|---|---|
| `owner_cost_reprice(jsonb)` | **exists** — STABLE, owner-gated, anon-denied, unreferenced by any client |
| `cost_engine.price_units()` | exists — STABLE |
| `cost_engine.resolve_rate_card()` | exists |
| `econ.v_breakeven_inputs` | **exists** — 14 monthly rows, and **already carries a `platform_cost_egp` column** |
| `econ.v_revenue_recognized_daily` | exists — 444 rows |
| `cost_engine.v_cost_by_student` | exists — 3 rows |
| `platform_cost_entries` | **does not exist** |
| `owner_econ_simulate()` | **does not exist** |
| `owner_econ_breakeven()` | **does not exist** |
| Sections 10–11 in `admin.html` | **do not exist** |

Phase 5 clearly anticipated Phase 7: `v_breakeven_inputs` already has the shape
break-even needs and already emits `block_reason`, all 14 months currently
`no_cost_in_period`.

### The existing scenario grammar does not match the spec

| Spec key (§11) | Supported today |
|---|---|
| `basis_window` | ✗ — uses flat `from` / `to` |
| `service_swap` | ✗ |
| `model_swap` | ~ — as `swap_model_from` / `swap_model_to`, single pair only |
| `rate_override` | ✗ — only a blunt global `rate_multiplier` |
| `routing` | ✗ |
| `discounts` | ✗ |
| `fx` | ✗ |
| `include_internal` | ✓ (not in the spec, but present) |

**And the return type cannot express a refusal.** `owner_cost_reprice` returns
`TABLE(service_code, actual_cost_usd, …)`. The spec's guardrails require
`{ ok: false, reason: 'no_rate_card_for_target', target: … }` and
`{ ok: false, reason: 'no_cost_facts_in_window' }`. **A row-set return has
nowhere to put a refusal** — which is precisely why the current function returns
a wrong number instead of refusing. The signature is the defect's enabler, not
just its container.

---

## 3. What Phase 7 will actually render on today's data

Measured, so the plan is not built on hope:

| Input | Value | Consequence |
|---|---|---|
| Priced facts (all) | 76 | simulator has a basis **only in diagnostic mode** |
| Priced facts, **external** | **0** | **business-mode simulator refuses on every window** |
| `fx_rates` rows | **0** | EGP conversion, profit, break-even all blocked |
| Rate cards | 2 — both `openai` (`gpt-4o`, `gpt-4o-mini`) | **no cross-provider `service_swap` target exists** |
| `platform_cost_entries` | absent | fixed costs blocked → Net Profit blocked |
| `v_breakeven_inputs` | 14 months, **all blocked** `no_cost_in_period` | Section 11 renders fully blocked |

**Blunt conclusion: if Phase 7 is built strictly to the business-metric rule, both
new sections render entirely blocked on current production data.** Section 11
will show 14 blocked months. Section 10 will refuse every scenario with
`no_cost_facts_in_window`, because every priced fact is internal and INV-25
excludes internal from business metrics.

The chain for Section 11, traced rather than assumed:
`v_breakeven_inputs` → `econ.v_pnl_daily` → business cost side (internal
excluded) → 0 external cost → `ai_cost_egp` NULL → `no_cost_in_period`.

This is **correct behaviour**, and it mirrors Sections 1–8. But it means Phase 7
ships with no populated output unless the owner rules otherwise — which is
decision **D-A** below.

---

## 4. Decisions I need from you before designing further

I am not deciding these alone; each changes the architecture.

### D-A — Does the simulator get a diagnostic mode?

Section 9's precedent: a **diagnostic** surface may include internal traffic if
it is labelled and never feeds a business KPI.

- **Option 1 — business-only.** Strictly INV-25. The simulator refuses on all
  current data and stays dark until external traffic exists. Honest, and
  useless today.
- **Option 2 — diagnostic mode, labelled** (mirrors Section 9). The simulator
  accepts `include_internal: true`, is banner-labelled, and its outputs never
  feed `owner_econ_*`. Usable today on 76 real facts.
- **My recommendation: Option 2**, because it is already the locked precedent for
  Section 9 and it makes the simulator testable against real data instead of
  shipping an unexercised code path — a hazard this project has hit repeatedly.

### D-B — How to fix `owner_cost_reprice`

The refusal contract needs a return shape that can carry `{ok:false, reason}`.

- **Option 1 — `DROP FUNCTION` + recreate** with a shape that carries a refusal,
  as M4.3 did for `owner_cost_service_breakdown`. Established pattern, needs the
  pre-apply type probe. Safe here because **nothing calls it**.
- **Option 2 — a second RPC**, leaving the broken one in place. Rejected on the
  M4.2 lesson: two overlapping definitions of the same grain diverge.
- **My recommendation: Option 1.**

### D-C — Is the reprice defect a Phase 7 item or a hotfix?

It is a live owner-callable RPC returning a materially wrong number. It is
unreachable from the UI, so it is not urgent — but it is not *nothing*.

- **Option 1 — fix it first**, as a small standalone change before Phase 7
  proper, exactly as the signup hotfix was handled.
- **Option 2 — fold it into Phase 7 M1**, since M1 rebuilds that function anyway.
- **My recommendation: Option 2**, since M1 must recreate the function regardless
  and a separate fix would be immediately superseded. Flagging so the choice is
  yours, not assumed.

### D-D — `platform_cost_entries` crosses this module's read-only boundary

Every AI-Economics object so far is `STABLE` and read-only (INV-07). Fixed costs
and FX need an **owner write path** — the first in this module. The roadmap
already calls this out ("writes cost *inputs*, never product pricing"), but it
needs an explicit ruling on:

- table shape and whether entries are immutable-with-supersede (like
  `cost_facts`) or editable in place;
- whether the write RPC is `owner_`-prefixed and owner-gated only, or admin-gated;
- whether FX rates are entered through the same surface or separately, given
  `cost_engine.fx_rates` already exists and is empty.

**I have not designed this yet** — it is the largest architectural question in
Phase 7 and I would rather have your ruling than guess.

### D-E — Cross-provider `service_swap` cannot be tested on real data

Only `openai` has rate cards. Any swap to another provider correctly hits
`no_rate_card_for_target` — so the *success* path of a cross-provider swap has
**no production data to exercise it**. Options: register a real second provider's
card, or accept synthetic-fixture testing only, stated as a limitation.

---

## 5. Proposed milestone split

Small, individually reviewable, in dependency order. **Not started.**

| Milestone | Scope | Migrations |
|---|---|---|
| **M1** | Rebuild `owner_cost_reprice`: refusal contract, spec scenario grammar (`basis_window`, `service_swap`, `model_swap`, `rate_override`, `discounts`, `fx`), `LEFT JOIN` telemetry, **fixes the defect in §1** | 1 (DROP + recreate) |
| **M2** | `platform_cost_entries` + owner write path (pending **D-D**) | 1–2 |
| **M3** | `owner_econ_breakeven()` + Section 11 panel | 1 |
| **M4** | `owner_econ_simulate()` + Section 10 panel, `SIMULATION — NO PRODUCTION EFFECT` banner, no Apply button | 1 |

`routing` is deliberately deferred out of M1: it requires per-question
`verification_tier` joins and is the least-specified part of §11. It gets its own
milestone once M1 is proven, or is dropped if you'd rather not carry it.

Each milestone follows the established discipline: implementation → engineering
review → your approval → apply → release gate → release report → closeout.

---

## 6. Verification plan

Carrying forward what Phase 6 learned:

- **Mandatory pre-apply type probe** on every new or modified RPC. It has caught
  a real defect in five consecutive milestones.
- **Negative controls on every guardrail.** Each refusal must be driven to fire:
  `no_cost_facts_in_window`, `no_rate_card_for_target`, and the swap-with-missing-card
  case must be proven to **refuse**, not to return `$0.06758175`. The regression
  test for §1 is that exact scenario.
- **Conservation:** an identity scenario (no overrides) must reproduce actual
  cost **exactly** — `$0.22961425`.
- **Write-safety:** prove `cost_facts` and `service_bindings` row counts and
  digests are unchanged after every simulation. `STABLE` makes writes impossible,
  but the exit criterion says to prove it.
- **Population conservation** — the check class held back from the verification
  framework cycle. Phase 7 is where it earns its place, since a simulator that
  silently drops rows is the exact failure mode already found.
- **`VACUOUS` verdicts** where a population is legitimately empty, per the new
  suite convention.

---

## 7. Risks

| Risk | Assessment |
|---|---|
| Both sections render blocked on current data | **High likelihood**, resolved by D-A |
| Cross-provider swap success path untestable | **Certain** on today's data (D-E) |
| `platform_cost_entries` breaks the read-only posture | **Design risk** — needs D-D before any code |
| Rebuilding `owner_cost_reprice` breaks a caller | **Low** — no client calls it; verified across all `.html`/`.js` |
| Simulation contaminating facts | **Low** — `STABLE` forbids writes; still explicitly verified |

---

## 8. Stop

Investigation and plan complete. **No production code, no migration, no database
change, no `admin.html` change.** `main` untouched.

**Awaiting your rulings on D-A through D-E before any implementation begins.**
