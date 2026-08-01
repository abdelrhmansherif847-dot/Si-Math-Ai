# Phase 6 M4.3 — AI Service & Model Analytics: Release Report

**Status: APPLIED. Release Gate PASSED.** Not closed out, not merged, not
deployed.

Branch `claude/phase6-m4-3-service-model-analytics`.

| | |
|---|---|
| Migration applied | `20260801135335` — `aiecon_p6_m4_3_service_quality` |
| Release Gate | **M4.3-V1 … V8 — 8/8 PASS** |
| Economics regression | **18/18 PASS** |
| Cost Engine regression | **25 PASS, 1 WARN** (`P4-31`, pre-existing) |
| `econ` objects modified | **0** |
| `admin.html` deployed | **no** |
| Frozen files touched | 0 |

This completes Phase 6's dashboard. Sections 1–9 are implemented.

---

## The three owner-required confirmations

| Confirmation | Result |
|---|---|
| **No `econ` object modified; `P5-02` / `P5-02b` green** | **Confirmed.** econ view definitions, econ function definitions and all 12 `owner_econ_*` signatures are **bit-identical** pre/post. `P5-02` PASS, `P5-02b` PASS. |
| **Cost reconciles to exactly `$0.22961425`; shares total exactly `100.00%`** | **Confirmed at all three levels** — service, provider and model each sum to `0.22961425` and `100.00`. Tested with `=` on `numeric`, not a rounded comparison. |
| **Columns 1–8 backward compatible** | **Confirmed three ways** — declared shape identical, *values* bit-identical, and a caller written against the old 4-argument form still resolves and returns the same 4 rows. |

---

## M4.3-V1 — existing surfaces unchanged · **PASS**

| Digest | Pre | Post | Verdict |
|---|---|---|---|
| econ view definitions (11) | `cf0e0b09…` | identical | PASS |
| econ function definitions (7) | `8d3cc786…` | identical | PASS |
| `owner_econ_*` signatures (12) | `ac91f5d7…` | identical | PASS |
| `owner_cost_*` signatures (6) | `65ae8f1e…` | **changed** | PASS — expected |
| `cost_engine` objects (26) | `06b0777f…` | identical | PASS |

**The `owner_cost_*` digest was expected to change, so on its own it proves
nothing.** An aggregate hash cannot show *which* member changed. Reverting only
`owner_cost_service_breakdown`'s entry to its old result type reproduced
`65ae8f1e414615163c127c0beebf610f` exactly — so the other five functions are
byte-identical by construction, not by inspection.

## M4.3-V2 — no `econ` object modified · **PASS**

| Sub-check | Result |
|---|---|
| `P5-02` — no provider/model identifier column in `econ` | **PASS** |
| `P5-02b` — no provider code emitted as data | **PASS**, but see below |
| Executable `econ.` references in the function body | **0** |

**`P5-02b` as written is vacuous, and this report will not pretend otherwise.**
It reads only `econ.v_service_economics`, which holds **0 rows** — that view
excludes internal traffic and 100% of telemetry is internal. A check over an
empty relation cannot fail. This is **pre-existing since Phase 5**, not
introduced by M4.3.

A non-vacuous form was therefore run: every value of every **populated** econ
view, flattened via `jsonb`, matched against every provider code and every model
name in production.

| Measure | Value |
|---|---|
| econ views with rows | 8 of 11 |
| Rows scanned | **890** |
| Identifier tokens searched | 3 |
| Leaks found | **0** |

That is the result the V2 verdict rests on.

## M4.3-V3 — columns 1–8 preserved through the DROP · **PASS**

| Sub-check | Result |
|---|---|
| V3a declared shape, position by position | **8/8 identical** in name, type and ordinal |
| V3b **values** vs the pre-migration baseline | **bit-identical** — 0 rows differ either way |
| V3c old 4-argument call site | **resolves, 4 rows, unchanged** |

The pre-migration signature and its output were captured **before** the DROP;
afterwards the old definition is unrecoverable, so a baseline taken later would
have made V3 unverifiable.

## M4.3-V4 — callable and reconciling · **PASS** (one corrected assertion)

| Level | Cost sum | Source | Exact? | Share sum | Calls | Int+Ext |
|---|---|---|---|---|---|---|
| service | `0.22961425` | `0.22961425` | **yes** | `100.00` | 76 | 76 |
| provider | `0.22961425` | `0.22961425` | **yes** | `100.00` | 76 | 76 |
| model | `0.22961425` | `0.22961425` | **yes** | `100.00` | 76 | 76 |

| Sub-check | Result |
|---|---|
| V4e population at each level's own grain | **7 / 7 / 8** — matches source exactly |
| V4f token conservation through the LEFT JOIN | **509,804 = 509,804** |
| V4g unknown outcome never inflates a counter | 76 known of 76 |
| V4h **INV-25 default unchanged** | defaulted call returns **0 rows** — internal still excluded |

**V4e reported FAIL on first run. The defect was in the check, not the code.**
It compared the `model` row count against the number of distinct *model names*
(2) when that branch groups by *(service, provider, model)* — 8 combinations.
Verified directly against `cost_facts`: 7 services, 7 service+provider pairs, 8
service+provider+model triples, which is exactly what the RPC returns. **No
migration or code change was made**; the assertion was corrected and re-run.

Reconciliation here is against **source totals**, not against rows already
present in the output — so a missing service would surface as a cost mismatch.
That is the strong form the M4.2 V4 failure taught, where comparing only present
rows was structurally blind to an absent one.

## M4.3-V5 — join safety · **PASS**

| Sub-check | Result |
|---|---|
| `ai_model_calls.id` is PRIMARY KEY | **yes** — fan-out impossible |
| Joined row count = fact count | **76 = 76** |
| Facts with missing telemetry | **0** |
| Calls carrying >1 current fact | **0** |

**0 orphans means the LEFT join's protective behaviour is unexercised by
production data**, so the claim was proven on a synthetic four-row case instead
— read-only, no writes:

| Input | Reported |
|---|---|
| 2 success, 1 failure, 1 **unknown** (telemetry pruned) | cost `1.00` — the unknown row's money **not dropped** |
| | `success_calls` 2, `failed_calls` 1 — unknown counted as **neither** |
| | `success_rate_pct` **66.67** = 2/3 known |

Not 50% (unknown treated as failure), not 75% (unknown treated as success).
INV-26 holds. This also exercises the **failure** path, which production cannot
— it has 76 successes and 0 failures.

## M4.3-V6 — owner gate · **PASS**

| Sub-check | Result |
|---|---|
| Non-owner JWT | **`42501`** — `forbidden: owner_cost_service_breakdown requires role owner` |
| No JWT at all | **`42501`** |
| `anon` EXECUTE | **revoked** |
| `authenticated` EXECUTE | granted (the in-function gate does the rest) |
| Volatility / security | **STABLE + SECURITY DEFINER** |

The grant check matters specifically here: `DROP FUNCTION` discards privileges,
so grants had to be re-established by the migration rather than inherited.

## M4.3-V7 — no client-side calculation · **PASS**

| Sub-check | Result |
|---|---|
| `reduce(`, `+=`, `-=`, `*=`, `/=`, `Math.`, `parseFloat`, `parseInt`, `Number(`, `toFixed` | **0 matches, all ten** |
| Every rendered numeric column wrapped in a formatter | **11 / 11** |
| Panel fields that are declared RPC columns | **19 / 19** |
| RPCs called | `owner_cost_service_breakdown`, `owner_cost_health` — **`owner_cost_*` only** |
| PII tokens | **0** |
| Inline script parses (`node --check`) | **PASS** |

The two `+` operators in the panel concatenate `service_code`, `provider_code`
and `model` — all `text` — into display labels. The targeted check confirms no
`+` touches any of the 17 numeric or count columns.

## M4.3-V8 — no regression · **PASS**

Executed via the two full suites below.

---

## Economics regression suite — **18/18 PASS**

`P5-01` `P5-02` `P5-02b` `P5-03` `P5-04` `P5-05` `P5-06` `P5-07` `P5-08` `P5-09`
`P5-10` `P5-11` `P5-12` `P5-13` `P5-14` `P5-15` `P5-16` `P5-17` — all PASS.

| Notable | Value |
|---|---|
| `P5-04` | 12 functions, 12 STABLE+SECDEF, 12 owner-gated |
| `P5-17` | **12 `owner_econ_*` RPCs invoked, 0 raised** |
| `P5-14` | 3 blocked metrics, every one with a stated reason |

`P5-17` reports 4 RPCs returning 0 rows — `lesson_economics`, `operation_mix`,
`service_economics`, `student_service_mix`. Sound but empty: `RETURN QUERY`
validates the tuple descriptor up front, so a 0-row return still proves the RPC
is callable. They are empty because every one depends on external traffic.

## Cost Engine regression suite — **25 PASS, 1 WARN**

`P4-01`…`P4-23`, `P4-29`, `P4-30` — **PASS**.

**`P4-31` — WARN:** *76 of 76 priced facts use unverified list prices; 100.00%
of total cost is modeled, not actual.* Pre-existing and expected: it is the
direct consequence of the owner's Phase 4 decision to treat OpenAI list prices
as provisional. It resolves when an invoice is loaded, with no code change.
Identical to the M4.2 baseline.

| Notable | Value |
|---|---|
| `P4-05` | **6/6 `owner_cost_*` functions**, 6 STABLE+SECDEF — the DROP+recreate left the count and properties intact |
| `P4-15` | facts = service = provider = model = `0.22961425` |
| `P4-16` | allocated = priced, variance `0.00000000` |
| `P4-18` | work-item call_count 76 = 76 current facts |

**`P4-24`…`P4-28` were not run.** They are write-path checks containing
`INSERT` / `UPDATE` / `DELETE`. Consistent with every prior milestone, they are
not executed against production. Stated rather than silently omitted.

---

## What Section 9 now shows

The first fully-populated panel in the dashboard. Every other section renders
blocked, because business metrics exclude internal traffic (INV-25) and 100% of
telemetry is internal; Section 9 is a **diagnostic** surface by owner decision,
so that condition does not apply.

| Service | Cost USD | Share | Calls | Requests | Tokens | Avg Latency | Success |
|---|---|---|---|---|---|---|---|
| tutor | 0.13585640 | 59.17% | 33 | 33 | 230,410 | 4,835 ms | 100.00% |
| solver | 0.04005330 | 17.44% | 18 | 9 | 260,131 | 2,881 ms | 100.00% |
| judge | 0.02307750 | 10.05% | 9 | 9 | 7,449 | 1,355 ms | 100.00% |
| vision | 0.01645500 | 7.17% | 5 | 5 | 5,208 | 2,327 ms | 100.00% |
| ocr | 0.01377500 | 6.00% | 5 | 5 | 4,550 | 1,367 ms | 100.00% |
| reference_resolver | 0.00027720 | 0.12% | 1 | 1 | 1,272 | 2,632 ms | 100.00% |
| difficulty_detector | 0.00011985 | 0.05% | 5 | 5 | 784 | 675 ms | 100.00% |

Confidence is `modeled` on every row, correctly — all pricing is list-price.

---

## Production state after M4.3

| Measure | Value |
|---|---|
| `owner_econ_*` RPCs | 12 (unchanged) |
| `owner_cost_*` RPCs | 6 (unchanged — extended, not added) |
| `aiecon` migrations applied | **16** |
| `econ` views / functions | 11 / 7 (unchanged) |
| Priced cost facts | 76, **$0.22961425**, all internal |
| Distinct services / providers / models | 7 / 1 / 2 |
| Telemetry rows | 76, pricing coverage 100.00% |

---

## Known issues carried forward

1. **`P4-31` WARN** — 100% of cost is list-priced, not invoice-verified.
   Resolves when an invoice is loaded. No code change needed.
2. **`P5-02b` is vacuous as written** — it reads a view that is empty and will
   stay empty while all traffic is internal. The non-vacuous form run in V2 is
   not yet part of `verify-economics.sql`. Recommend folding it in; **not done
   here**, as it is outside M4.3's approved scope.
3. **The failure path is unexercised in production** — 76 successes, 0 failures,
   so `failed_calls` and any sub-100% success rate are correct-by-construction
   and proven only synthetically (V5).
4. **Provider concentration is trivially 100%** — one provider registered. A
   real measurement of a real state, not a placeholder.
5. **"Over cost target" remains unreportable.** 0 of 12 services have a
   `cost_target_usd`, and `owner_cost_health()` emits a `service_over_budget`
   row only on breach — so "no targets set" and "none breached" are
   indistinguishable from its output. Unchanged by M4.3; still open (see the
   engineering review's open question).

---

## Stop point

The Release Gate is complete and green. **No closeout, no merge to `main`, no
`admin.html` deployment, and no Phase 7 work has been performed.** Awaiting
owner instruction.
