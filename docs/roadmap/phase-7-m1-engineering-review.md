# Phase 7 M1 — `owner_cost_reprice` Refusal Contract: Engineering Review

**Migration prepared, nothing applied.** Awaiting approval.

> **Resolved since — note added 2026-08-25; the status line above is kept as
> written, because it was true when written.** It was approved and applied:
> `aiecon_p7_m1_reprice_refusal_contract`, production version `20260801205515`.

`supabase/migrations/20260801_aiecon_p7_m1_reprice_refusal_contract.sql`

| | |
|---|---|
| Objects | 4 — 2 new, 1 replaced, 1 DROP+CREATE |
| Pre-apply probe | **35/35 PASS** (22 functional + 13 branch) |
| Direct execution probe | **yes** — every assertion calls the RPC itself |
| Frozen files touched | **0** |
| `admin.html` | untouched — no UI in M1 |
| Fake/mock data added to production | **none** (ruling D-E) |

---

## 1. The defect, measured before and after

```
owner_cost_reprice('{"include_internal":true,
                     "swap_model_from":"gpt-4o",
                     "swap_model_to":"claude-sonnet-4"}')
```

| | Today (live) | After M1 |
|---|---|---|
| `actual_total` | `0.22961425` | — |
| `simulated_total` | **`0.06758175`** | — |
| `calls` | **76** | — |
| Result | a fictional **70.6% saving** | **`{ok:false, reason:"no_rate_card_for_target", affected_calls:24, affected_cost_usd:0.16203250}`** |

**Mechanism.** `resolve_rate_card()` returns NULL for an unpriced target →
`price_units(NULL, units)` finds no component, sets `bad_unit`, returns
`gross_usd = NULL` → the outer **`sum()` skips those NULLs**. The 24 `gpt-4o`
rows worth `$0.16203250` disappear from the total *while still being counted in
`calls`*.

> The number looked trustworthy **because the call count was right.** That is
> what made it dangerous rather than merely wrong.

`price_units` was already reporting the failure through `bad_unit`. The old
function discarded that signal. M1 stops discarding it.

**There are two halves to this defect, not one.** The second — a card that
exists but lacks a unit the call consumed — produces the identical silent NULL
and was never reachable through the old grammar. Both are now refusals
(`no_rate_card_for_target`, `unpriceable_units_for_target`).

---

## 2. What changes

| # | Object | Operation | Risk |
|---|---|---|---|
| 1 | `cost_engine.apply_discounts(numeric, jsonb)` | **NEW** | none — nothing else calls it |
| 2 | `cost_engine.price_units(uuid, jsonb, jsonb)` | **NEW** overload | none — new signature |
| 3 | `cost_engine.price_units(uuid, jsonb)` | **REPLACE** → delegates to #2 | **the one real risk — see §7** |
| 4 | `public.owner_cost_reprice(jsonb)` | **DROP + CREATE**, `TABLE(...)` → `jsonb` | none — 0 callers |

**Blast radius for #4, measured not assumed:** 0 references in any `.html`/`.js`,
0 in verification scripts, 0 `pg_depend` dependents, 0 rows ever written
(`STABLE`).

---

## 3. The refusal contract

Return shape is now a single document. `{ok:true, basis, scenario_echo, notes,
totals, by_service}` or `{ok:false, reason, …}`. A row set had nowhere to put a
refusal — **the old signature was the defect's enabler, not just its container.**

Thirteen refusal reasons, **every one driven to fire in the probe**:

| Reason | Fires when | Probe |
|---|---|---|
| `no_rate_card_for_target` | swap target has no card | T2, T8 |
| `unpriceable_units_for_target` | card exists, lacks a consumed unit | B10 |
| `no_cost_facts_in_window` | empty basis | T5 |
| `unpriced_facts_in_window` | any fact has no actual cost | B11 |
| `telemetry_missing_for_facts` | a fact's units are gone | B12 |
| `unsupported_scenario_key` | unknown key, incl. `routing` and the old grammar | T3, T4 |
| `unknown_service_in_swap` | `service_swap` names a non-service | T9 |
| `invalid_service_swap` | entry missing provider or model | B02 |
| `invalid_model_swap` | empty target model | B03 |
| `invalid_rate_override_key` | not `provider:model:unit` | T12 |
| `invalid_rate_override_value` | negative or non-numeric | B04, B05 |
| `rate_override_unknown_unit` | override names a unit the card lacks | T11 |
| `invalid_discount_type` / `invalid_discount_value` / `invalid_discounts` | malformed discounts | T13, B06, B07 |
| `invalid_fx` / `invalid_basis_window` / `invalid_scenario` | malformed input | B08, T17, B09, B01 |

Plus `internal_pricing_gap` — **deliberately unreachable.** It exists so that if
a future edit reintroduces a NULL pricing path, the function *refuses* rather
than quietly summing around it the way the original did.

### Refuse vs note — the line M1 draws

- **REFUSE when the answer would be wrong** — a row cannot be priced, a baseline
  cannot be stated, a knob cannot be honoured.
- **NOTE when the answer is right but the scenario was partly inert** — e.g. a
  `model_swap` for a model absent from the window. Nothing is dropped, so
  nothing is hidden, but it is said out loud (`notes: ["model_swap_inert: …"]`).

Refusing an inert-but-correct scenario would be false rigour; ignoring it
silently is the failure class this milestone exists to eliminate. The note is
the honest middle.

**`routing` is refused, not ignored.** It is deferred out of M1, and a scenario
carrying it would otherwise appear to have been honoured.

---

## 4. Grammar, against the §11 spec

| Spec key | Before | After |
|---|---|---|
| `basis_window` | ✗ flat `from`/`to` | ✓ half-open `[from, to)` |
| `service_swap` | ✗ | ✓ |
| `model_swap` | ~ single pair | ✓ full map |
| `rate_override` | ✗ blunt `rate_multiplier` | ✓ `provider:model:unit` |
| `discounts` | ✗ | ✓ |
| `fx` | ✗ | ✓ |
| `routing` | ✗ | **refused** (deferred) |
| `include_internal` | ✓ | ✓ |

Precedence: **`service_swap` > `model_swap` > identity**, per row. The old keys
(`swap_model_from`, `swap_model_to`, `rate_multiplier`, flat `from`/`to`) now
**refuse**, so an old call cannot silently mean something different.

---

## 5. Pre-apply probe — 35/35

Run in a transaction against production data, rolled back via `RAISE EXCEPTION`.
Verified afterwards that nothing persisted.

**Conservation (T1) — the one that matters most.** Identity scenario re-prices
every row from raw units and must reproduce the recorded actual:

```
act = 0.22961425   sim = 0.22961425   calls = 76   services = 7
```

This is a *real* test, not a tautology: the simulated side never reads
`net_cost_usd`, it re-prices from `units` through the rate card. It agreeing to
the eighth decimal proves the simulator reproduces the engine.

**Population conservation (T19):** `by_service` parts sum to the whole —
`0.22961425 = 0.22961425`, `76 = 76` calls.

**Delegation identity (T0):** all 76 facts re-priced through the refactored
2-arg `price_units` — **0 gross mismatches, 0 bad_unit**.

**Security (T21):** non-owner → `42501`. **Write safety (T20):** facts still 76 /
`0.22961425`; `provolatile = 's'`.

Full probe output is reproduced in the release report when M1 is applied.

---

## 6. Decisions I made that you should see

1. **`unpriced_facts_in_window` is strict.** *One* unpriced fact in the window
   refuses the whole simulation. This follows D-B literally ("cannot be priced
   in full → refuse"). It is stricter than the spec's wording and would block a
   simulation that a looser reading would allow. Say the word and I will
   downgrade it to a note that states the excluded count — but silence plus a
   partial total is exactly the original defect, so I did not choose that.

2. **Scenario `discounts` REPLACE the stored rules**; absent means "keep
   today's rules", `[]` means "no discounts". The distinction is meaningful and
   is documented in the migration.

3. **Discounts round per row, matching the engine.** So a 10% scenario discount
   yields `0.20665270`, not exactly `0.9 × 0.22961425 = 0.20665283` — a
   `1.3e-7` difference from 76 per-row roundings. This is *correct* (it is how
   `run_pricing` rounds) but the total will not be exactly `pct × total`.

4. **`rate_override` on a tiered card flattens the tier prices** for that unit,
   preserving `per_qty` and boundaries. Exact on every card in production today
   (all single-band). Stated as a modelling choice, not hidden.

5. **A scenario FX rate is used; a missing real rate is never invented.** With
   no `fx.usd_to_egp` and no `fx_rates` row, EGP is `NULL` with
   `egp_blocked_reason: "no_fx_rate"` — your no-shortcut ruling, applied to the
   simulator.

---

## 7. The one change that carries real risk, stated plainly

**Replacing the 2-arg `cost_engine.price_units`.** It is called by
`run_pricing`, which **writes `cost_facts`**. Everything else in M1 is additive
or has zero callers; this one sits under the pricing writer.

- It is a pure delegation — same signature, same OUT names and types, body
  becomes a one-line call to the 3-arg overload with `'{}'` overrides.
- Probe T0 re-priced **all 76 production facts** through it and compared against
  the recorded `gross_cost_usd`: **0 mismatches**.
- `run_pricing` itself is **not modified**.

**The alternative**, if you would rather not touch it: leave the 2-arg function
alone and let the 3-arg overload carry its own copy of the pricing loop. That
removes this risk entirely and buys a second copy of the pricing logic — which
is the M4.2 divergence hazard that has already cost this project one gate
failure. **I recommend the delegation**, but the choice is yours and I will
implement either.

**Related, and not fixed here:** `run_pricing` still carries its own inline copy
of the *discount* fold, which `cost_engine.apply_discounts` now duplicates.
Refactoring the writer to use the helper is the right end state; it widens the
blast radius further into `cost_facts` and I kept it out of M1. Recorded as a
follow-up.

---

## 8. Limitations, honestly

1. **The cross-provider swap *success* path has no production data** (your D-E).
   Only `openai` has rate cards. I proved the **refusal** path on real data, and
   the `unpriceable_units` path with a synthetic card created **inside the
   rolled-back probe transaction**. **No fake provider, model, or rate card was
   added to production**, per your ruling.

2. **`telemetry_missing_for_facts` cannot fire today.** `cost_facts.call_id` has
   a FK to `ai_model_calls(id)` with NO ACTION, and `units` is `NOT NULL`. The
   branch guards the Phase 8 `ai_model_calls` retention policy, which will have
   to relax that FK. I proved it fires by dropping the FK inside the probe
   transaction — i.e. under exactly the future condition it guards.

   *(Correction to something I said earlier in this session: I first reported
   that no such FK existed. That was wrong — I read an empty result slot from a
   two-statement query whose first result was discarded. The FK exists.)*

3. **Row-by-row pricing.** 76 rows today; the loop is O(n) function calls. This
   is an owner-only analytical RPC and `run_pricing` is row-by-row too, so it is
   consistent — but it is not built for millions of rows.

4. **`by_service` reports 7 services, not 8 rows.** `tutor` spans two models and
   groups to one service row. Service is the grain the spec asks for.

5. **No UI.** M1 is RPC-only. Section 10 is a later milestone.

---

## 9. Recommendation: a permanent regression check

M1 fixes a defect that shipped and survived six milestones **because nothing
tested it.** Nothing in `verify-cost-engine.sql` would catch its return.

I propose adding **`P4-32`** — assert that a swap to an unpriced target refuses:

```sql
-- P4-32: reprice must refuse an unpriceable swap, never under-report
SELECT 'P4-32' AS check,
       CASE WHEN r->>'reason' = 'no_rate_card_for_target' THEN 'PASS'
            WHEN (r->>'ok')::boolean THEN 'FAIL'
            ELSE 'FAIL' END AS result, …
FROM public.owner_cost_reprice(
  '{"include_internal":true,"model_swap":{"gpt-4o":"__no_such_model__"}}'::jsonb) r;
```

plus **`P4-33`** for identity conservation (`simulated = actual` exactly).

**This is a change to the verification framework**, which you have treated as
its own workstream — so I have **not** written it. Tell me to include it in M1
or to defer it, and I will follow either.

---

## 10. Rollback

```sql
-- restore the previous definition verbatim from
-- supabase/migrations/20260731_aiecon_p4_cost_engine.sql
DROP FUNCTION IF EXISTS public.owner_cost_reprice(jsonb);
CREATE FUNCTION public.owner_cost_reprice(p_scenario jsonb) RETURNS TABLE(...) …;

-- restore the 2-arg pricing loop, drop the additions
CREATE OR REPLACE FUNCTION cost_engine.price_units(uuid, jsonb, OUT …) … ;  -- plpgsql body
DROP FUNCTION IF EXISTS cost_engine.price_units(uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS cost_engine.apply_discounts(numeric, jsonb);
```

**Rollback restores the silent under-reporting defect**, so it is a last resort.

---

## 11. Proposed sequence, on your approval

1. Apply the M1 migration.
2. Stop; confirm applied state.
3. Release Gate — re-run all 35 probe assertions **against the applied
   function**, individually reported.
4. Economics regression suite (expect 17 PASS + 1 VACUOUS, unchanged — M1
   touches no `econ` object).
5. Cost Engine regression suite (expect 20 PASS + 5 VACUOUS + 1 WARN, and
   `P4-15`/`P4-16` still reconciling to `0.22961425`).
6. Release Report.
7. Closeout, roadmap update, merge to `main`.

---

## Stop

**Nothing applied.** Awaiting your approval of this review, and your answers on
§7 (delegation vs duplicate loop), §6.1 (strict unpriced refusal), and §9
(regression checks in M1 or deferred).
