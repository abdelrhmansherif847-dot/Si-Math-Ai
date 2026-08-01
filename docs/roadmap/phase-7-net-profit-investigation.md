# D-D ⑤ — Net Profit: Investigation

**Investigation only. No design committed, no code, no migration, no database
object changed.** Per your ruling: *"لا تضفه الآن. أريد أولًا Investigation
كاملة"*.

Answers the five questions you set: **best grain**, **daily or monthly**, **new
view?**, **new RPC?**, **impact on the current P&L**.

---

## 1. The measurement that decides the grain

Every input to net profit, at its **native** grain:

| Input | Native grain | Extent measured |
|---|---|---|
| Revenue (recognized) | **daily** | 444 rows over **383 distinct days**, 2026-06-20 → 2027-07-07 |
| AI cost (`cost_facts`) | **per call**, timestamped | 76 facts across **3 days**, 2026-07-29 → 07-31 |
| **Platform cost** (§9.4) | **monthly** — `period_month`, first of month | table absent; would cover **14 months** |

*(444 rows vs 383 days is not a discrepancy — several revenue events are
recognized on the same day.)*

**Gross profit is daily because both its inputs are daily. Net profit is not,
because one of its inputs is monthly and cannot be made daily without
inventing.**

### Why apportioning a monthly invoice to days is invention, not measurement

A Supabase or Vercel invoice covers a month. To place it on a day you must
choose a rule:

| Candidate rule | What it silently asserts |
|---|---|
| equal share per day | the platform costs the same on a day with zero traffic as on peak day |
| weighted by AI cost | platform cost scales with AI usage — **it does not**, that is why §9.4 puts it outside the Cost Engine |
| weighted by revenue | platform cost is driven by revenue — no evidence for this |

**Every rule is a modelling choice; none is a measurement.** Any of them would
produce a "daily net profit" that is an artefact of the chosen rule, and INV-26
forbids exactly this class of quiet fabrication. §9.4 is explicit that platform
cost is *"not attributable to a call"* — apportioning it to a day is the same
error one level up.

> **Finding: the correct grain for net profit is MONTHLY. Daily net profit is
> not computable from the available inputs without fabricating an allocation.**

---

## 2. Daily or monthly — the answer, and the precedent that supports it

**Monthly.** Beyond the grain argument above, M2 already resolved the same class
of question and its reasoning is recorded verbatim in
`20260731_aiecon_p6_m2_pnl_summary.sql`:

> *Margin is the decisive case: a period margin is **NOT** the sum, mean, or any
> other elementwise combination of daily margins. It can only be computed from
> period totals.*

**Net margin inherits this exactly.** A monthly net margin cannot be assembled
from daily net margins even if daily net profit existed. So the figure has to be
produced at the grain it is consumed at — and that grain is monthly, because that
is the grain of the fixed cost.

There is also a consumer already waiting at that grain: **`econ.v_breakeven_inputs`
is monthly (14 rows) and already carries a `platform_cost_egp` column.**

---

## 3. Does it need a new view?

**Probably not — and I want to be precise about why, because the tempting answer
is wrong in both directions.**

| Option | Assessment |
|---|---|
| **Add net columns to `econ.v_pnl_daily`** | **Rejected.** It is *daily*; putting a monthly figure there forces the fabricated allocation of §1. It would also make every daily row carry a value that only means something when summed to a month. |
| **Extend `econ.v_breakeven_inputs`** | **Strong candidate.** Already monthly, already has `platform_cost_egp`, already emits `block_reason` and `confidence`. Net profit is arguably what this view exists to feed. |
| **New `econ.v_pnl_monthly`** | **Viable alternative.** Cleaner separation: break-even *inputs* vs monthly *P&L*. Costs one more object and risks two overlapping monthly surfaces — the divergence hazard M4.2 hit. |

**My reading of the evidence favours extending `v_breakeven_inputs`** rather than
adding a third monthly surface, on the M4.2 lesson that two overlapping
definitions of the same grain eventually diverge. But this is a design judgement
and it is **explicitly yours to make** in the design document.

### The blast radius, measured

`econ.v_pnl_daily` has **four dependents**:

| Dependent | Type |
|---|---|
| `econ.v_breakeven_inputs` | view |
| `econ.v_coverage` | view |
| `public.owner_econ_pnl` | RPC (daily grain — **not called by `admin.html`**) |
| `public.owner_econ_pnl_summary` | RPC — **this is the one the dashboard calls** |

This is not speculative risk: **M2 already extended `v_pnl_daily` from 9 to 11
columns** and its header records verifying that all three dependent digests
stayed bit-identical afterwards. The precedent for safely touching it exists —
but so does the reason it needed verifying.

---

## 4. Does it need a new RPC?

**Yes — and the M2 precedent settles the shape.**

M2 faced the identical problem and chose:

> *One owner-gated RPC returning exactly ONE row. It reads `econ.v_pnl_daily` —
> **no new view, no new table, no change to any existing object**.*

and rejected computing the headline in the client because summing days in
JavaScript and recomputing margin from those sums is *"a financial calculation
outright, not an aggregation"* (INV-03).

Net profit and net margin are the same case. They must arrive as **typed columns
from a named source**, so a new owner-gated RPC is required. Whether it is a new
function or an extension of `owner_econ_pnl_summary` is a design question —
noting that extending it would change a signature the dashboard actively calls,
which is a heavier operation than adding one.

**Blocking and confidence must not be reimplemented.** M2's rule applies: reuse
`econ.block_reason()` and `econ.worst_confidence()` so owner rules 2–4 and INV-27
hold by construction. Net profit's confidence is `worst(revenue, ai_cost,
platform_cost)` — and per INV-27 it can never be better than its worst input.

---

## 5. Impact on the current P&L

### 5.1 What exists today — measured

| Column | Present in `v_pnl_daily`? | Populated? |
|---|---|---|
| `gross_profit_egp` | yes | **0 of 383 rows** |
| `gross_margin_pct` | yes | 0 of 383 rows |
| **any net column** | **no — none exist** | n/a |

Also measured: `cost_usd` is **NULL on all 383 rows**, and `revenue_net_egp` is
populated on all 383.

**Gross profit is already blocked on 100% of days**, because the business cost
side excludes internal traffic and all 76 facts are internal.

### 5.2 What adding net profit changes

**Nothing about gross profit** — that is the critical property. §9.4's rule is
absolute:

> *the module must not silently report gross as net*

Gross and net must remain **separately labelled and separately blocked**. Net
profit is strictly additive; no existing column changes name, type, or value.

### 5.3 Net profit will be blocked harder than gross profit

This is the honest headline for expectations:

| Blocker | Blocks gross? | Blocks net? |
|---|---|---|
| No external cost in period (all traffic internal) | **yes** | yes |
| No FX rate → `ai_cost_egp` NULL | **yes** | yes |
| **No platform cost source** | no | **yes** |
| **Platform cost in USD with no FX** (your ruling ④) | no | **yes** |

**Net profit will be blocked on every month even after `platform_cost_entries`
exists and is populated**, until FX rates exist. Your ruling ④ — *"لن نسمح بإدخال
EGP لتجاوز غياب الـ FX"* — means this is deliberate and correct, and I am
recording it so no one later reads a persistently blocked Net Profit as a defect.

### 5.4 A new block reason is needed

`econ.block_reason(revenue, ai_cost_usd, ai_cost_egp)` takes three arguments and
knows nothing about platform cost. `v_breakeven_inputs` currently bolts on
`no_platform_cost_source` with a `CASE` **outside** the function.

Net profit needs reasons the existing resolver cannot produce:

- `no_platform_cost_source` — table absent
- `no_platform_cost_in_period` — table exists, no entry for that month
- `no_fx_for_platform_cost` — entry is USD, no rate covers its month

**Whether `econ.block_reason()` is extended or a sibling resolver added is a
design decision.** Extending it changes a function four surfaces already call —
heavier than it looks.

---

## 6. Answers to your five questions

| Question | Answer |
|---|---|
| **Best grain** | **Monthly.** Fixed cost is monthly and cannot be apportioned to days without fabricating an allocation rule (INV-26). |
| **Daily or monthly** | **Monthly.** Reinforced by M2's finding that a period margin cannot be assembled from daily margins. |
| **New view?** | **Probably not.** Extending the existing monthly `v_breakeven_inputs` is favoured over a third monthly surface (M4.2 divergence lesson). Final call is yours. |
| **New RPC?** | **Yes.** M2's precedent: headline financial figures arrive as typed columns from an owner-gated RPC, never summed in the client (INV-03). |
| **Impact on current P&L** | **Strictly additive.** No existing column changes. Gross stays separately labelled and separately blocked, per §9.4. But `v_pnl_daily` has 4 dependents, so any change to it needs the same digest verification M2 performed. |

---

## 7. Open questions for the design document

1. Extend `v_breakeven_inputs`, or create `v_pnl_monthly`?
2. New RPC, or extend `owner_econ_pnl_summary` (which the dashboard calls)?
3. Extend `econ.block_reason()`, or add a platform-aware sibling?
4. Does Net Profit get its own dashboard section, or join Section 11?
5. Is **Net Margin** in scope alongside Net Profit? (M2's argument says it cannot
   be derived client-side, so it needs the same treatment.)

---

## Status of all D-D rulings

| Ruling | Status |
|---|---|
| ① Immutable + audit mandatory | locked |
| ② Audit model | **Alternative A approved**, with 5 additional requirements |
| ③ Strong CHECK constraints | to be enumerated in the design document |
| ④ No currency shortcut | locked — and its consequence is recorded in §5.3 above |
| ⑤ **Net Profit investigation** | **this document — complete** |
| ⑥ Simulator out of scope | locked — nothing simulator-related here |
| ⑦ Full RLS review | delivered in the audit-model investigation |
| ⑧ Full design document | **now unblocked** — ② and ⑤ are both complete |

---

## Stop

Investigation complete. **No design committed, no code, no migration, no
database change.** `main` untouched.

Per your sequence, the **full design document** is the next deliverable — Schema,
Audit Model (Alternative A), Constraints, RLS, Revision Strategy, Lifecycle,
Dependencies, Consumers, Risks, Rollback, Verification Plan — after which I stop
again for your review before any code.
