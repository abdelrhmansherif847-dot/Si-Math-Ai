# AI Economics · Phase 3 — Telemetry Integrity Review

> **Review only. Nothing applied, nothing deployed.** This document assesses
> whether `public.ai_model_calls` is fit to become the permanent, authoritative
> input to the Cost Engine.

| | |
|---|---|
| **Subject** | `ai_model_calls` (migration, not applied) + `ai-tutor` v90 (not deployed) |
| **Question** | Is this telemetry financially trustworthy as a single source of truth? |
| **Verdict** | **Qualified yes** — see §10. The design is sound; five cheap changes are needed before it can carry absolute financial totals, and all five are free to make now because nothing has shipped |
| **Date** | 2026-07-28 |
| **Method** | Line-by-line review of the emitter, plus read-only measurement against 30 days of production data |

**Six findings**, F1–F6 (§9). None is a design flaw in the frozen architecture;
all are implementation gaps in the Phase 3 emitter.

---

## 0. Method, and what makes this review checkable

Claims here are verified against the code and against production, not asserted:

- The emitter was re-read after implementation, specifically hunting for paths
  where a record could be written twice or not at all.
- The **completeness oracle** in §6 was executed against 30 days of live
  `question_records`. It reconstructs how many model calls *should* have
  happened — from data written independently of the telemetry — and therefore
  works before a single telemetry row exists.

### The measured shape of a 30-day window

| Quantity | Value |
|---|---|
| Questions | 404 |
| Expected model calls | **1,983** (~66/day) |
| — main-path sink (flushed at response) | 672 (33.9%) |
| — background sinks (flushed after response) | **1,311 (66.1%)** |
| Expensive-model (`gpt-4o`) calls | 911 |
| — of which in background sinks | **643 (70.6%)** |
| `difficulty_detector` calls | **0** — v2 has not fired once in 30 days |

Two facts drive most of this review. **Two thirds of all calls, and over 70% of
expensive-model calls, are emitted after the student's response has been sent** —
the sink most exposed to loss. And the difficulty detector currently emits
nothing, so its absence must not be read as missing telemetry.

---

## 1. Exactly-once guarantees

**The guarantee delivered is at-most-once, not exactly-once.** Stated plainly:
duplication is structurally prevented; loss is possible. That asymmetry is
deliberate and, for cost data, the right way round — but it is not what
"exactly-once" means, and the distinction matters for a financial source of
truth.

### 1.1 How duplicate writes are prevented

Four independent mechanisms:

| # | Mechanism | Prevents |
|---|---|---|
| D1 | **`recorded` flag** in `runSolver`, `runJudge`, `extractMathTextFromImage`, `detectQuestionsInImages` | A parse failure *after* a successful record re-recording the same call from the catch block. This was a real defect found during implementation |
| D2 | **`sink.splice(0, sink.length)`** at the top of `flushModelCalls`, before its first `await` | A second flush of the same sink writing the same rows. The drain is synchronous, so it cannot interleave |
| D3 | **One flush per sink, in a `finally`** | Both the "flushed twice" and "never flushed" cases on any given path |
| D4 | **No retry anywhere** — not in `recordModelCall`, not in `flushModelCalls`, and `fetch` is used raw with no retry wrapper | The classic at-least-once duplicate: a write that succeeded but whose acknowledgement was lost, then retried |

D4 is the load-bearing one. Because nothing is ever retried, a committed insert
is never re-attempted, so the database cannot receive the same row twice.

### 1.2 Scenarios where duplicates could still occur

Exhaustively, the remaining paths:

| # | Scenario | Possible? | Why |
|---|---|---|---|
| 1 | Same call recorded on both success and failure path | **No** | D1 |
| 2 | Same sink flushed twice | **No** | D2 — the second flush finds an empty array |
| 3 | Two sinks holding the same row | **No** | The three sinks are distinct arrays in distinct function scopes; `runL3ShadowPipeline` does not close over the handler's array. *(Both are named `teleSink` — see F7)* |
| 4 | Insert commits, response lost, client retries | **No** | D4 — no retry exists |
| 5 | Student retries a send with the same `client_request_id`, and the first attempt already produced a record | **No** | The idempotency-hit path returns the stored record without making any model call, so no rows are emitted |
| 6 | Student retries and the race is lost — the second invocation does not see the first's record | **Yes, and correct** | Two full sets of calls really were issued to OpenAI. Two sets of rows under two `request_id`s is the truthful record. Not a duplicate: it is two events. §4 covers how to tell them apart |
| 7 | A future edit adds a second `recordModelCall` to one path | **Yes** | Not prevented by code. Detected by check **P3-13** (`> 10 calls per request`) and by the §6 reconciliation, both of which would show an overcount |
| 8 | Supabase client-library internal retry on `insert` | **No, as configured** | `supabase-js` v2 performs no automatic retry on a failed POST. If this ever changes, scenario 4 reopens — which is precisely what F1 would neutralise |

**Conclusion.** Within the emitter, duplication requires a future code change
(scenario 7) or a library behaviour change (scenario 8). Neither is possible
today, but neither is *structurally* prevented — there is no key the database
could reject a duplicate on. **F1** closes that.

---

## 2. Loss scenarios

Loss is the real exposure. Every scenario, classified:

| # | Scenario | Rows lost | Likelihood | Class | Financial impact |
|---|---|---|---|---|---|
| L1 | Isolate torn down before a background flush completes | 1–5 per affected question | **Medium** | Acceptable **only if measured** | Understates cost, **biased toward expensive calls** — see below |
| L2 | Flush fails (network, DB error, timeout); no retry exists | 1–6 per affected request | Low | Acceptable if measured | Understates cost |
| L3 | Migration not applied / table dropped / grant missing | All | Low | **Unacceptable, but loud** | Total blackout, logged once per request as `model-call-telemetry-error` |
| L4 | Kill switch `AI_MODEL_TELEMETRY_ENABLED=false` | All while off | Operator choice | Acceptable — intentional | Known blackout window |
| L5 | Network-level throw on the two unwrapped call sites (`tutor`, `reference_resolver`) | 1 | Low | Acceptable | The failing call is unrecorded. Its *upstream* cost is near zero (no completion), so financial impact ≈ 0; the loss is analytical |
| L6 | `EdgeRuntime.waitUntil` unavailable, floating promise dropped | 1–3 | Low | Acceptable | Supabase provides `waitUntil`; the fallback is best-effort |
| L7 | Deploy gap — migration applied, v90 not yet live | All in window | Certain, planned | Acceptable | Known, bounded, reported as WARN by verification |
| L8 | Rollback to v89 | All after rollback | Operator choice | Acceptable | Known blackout |
| L9 | Row written but pipeline errors before its `finally` | **None** | — | — | `finally` covers throw and early return alike |

### The non-obvious risk: loss is not uniform

The intuitive model — "if we lose 1% of rows we understate cost by 1%" — is
**wrong here**, and the production numbers show why.

- Main-path rows flush at response time, when the isolate is certainly alive.
- Background rows flush seconds later, after the student has their answer.
- **66.1% of calls are background**, and **70.6% of expensive `gpt-4o` calls are
  background** (OCR extract, OCR rerun, judge).

So loss concentrates in the sink that carries the costly work. A 1% background
loss rate is worth materially more than 1% of spend. The exact multiplier cannot
be stated until tokens are actually measured — that is what Phase 3 is for — but
the direction is certain and the design consequence is immediate:

> **Completeness must be measured per service and per sink, never only in
> aggregate.** An aggregate coverage figure would look reassuring while hiding
> loss precisely where the money is.

§6 measures it that way.

### Unacceptable-loss threshold

Only **L3** is unacceptable, and it is self-announcing: every request logs a
telemetry error, and check P3-07 reports zero rows. There is no silent-total-loss
mode.

---

## 3. Ordering guarantees

**Records can and will arrive out of order**, in two distinct senses.

### 3.1 Between requests

Two requests running concurrently flush independently. Request B (short, text)
may commit before request A (long, image + pipeline) that started earlier. Row
`id` order therefore does not follow call order across requests.

**Downstream correctness is unaffected**: every analytic groups by
`request_id`, `question_record_id`, `service_code`, or a time bucket. None
depends on insertion order, and the Cost Engine's allocation stage (§8.8 of the
architecture) is explicitly order-independent and deterministic (INV-19).

### 3.2 Within a request — and a real fidelity gap

`created_at DEFAULT now()` is the **INSERT** time, not the call time. A pipeline
call issued at T+0.5s but flushed at T+8s carries `created_at = T+8s`.

This has one virtue and one cost:

- **Virtue.** A row's `created_at` can never precede its own visibility, so the
  Cost Engine's "claim unpriced calls in `[from, to)`" anti-join can never skip a
  late arrival — the row simply lands in a later window. Ordering is *safe by
  construction* for the engine's windowing.
- **Cost.** `created_at` is a write timestamp being used as an economic one.
  Effects: calls near midnight can be attributed to the following day, and
  latency analysis mixes call duration with flush delay.

At current volume the day-boundary population is negligible, but "negligible" is
not "defined", and this is a permanent fact table. **F2** fixes it by recording
the true start time alongside the write time — keeping the safe windowing
property *and* an exact economic timestamp.

---

## 4. Retry behaviour

The question is whether telemetry can distinguish **one logical request retried**
from **two independent requests**. Today: partially.

| Case | What happens | Distinguishable? |
|---|---|---|
| Retry hits the idempotency path (record already exists) | Edge Function returns the stored answer; **no model call, no telemetry row** | Yes — nothing to confuse |
| Retry races the first attempt and both do real work | Two `request_id`s, two full sets of rows. Both are truthful: OpenAI was billed twice | **Only on `tutor` and `reference_resolver` rows**, which carry `meta.client_request_id` |
| Two genuinely independent questions | Two `request_id`s, two `client_request_id`s | Yes |

### The gap

`client_request_id` — the only identifier that ties two server attempts to one
student intent — is recorded on **2 of the 9 site types** (`tutor`,
`reference_resolver`), and only inside `meta`. Solver, judge, OCR, vision and
detector rows carry none.

Consequence: a query for "what did this student's retried question really cost?"
can group the two tutor calls but not the ten background calls that accompanied
them. Retry cost analysis would be structurally incomplete — and duplicate-charge
investigation is exactly the kind of question a financial source of truth must
answer. **F3** fixes it by stamping `client_request_id` at flush time, so every
row carries it uniformly.

---

## 5. Idempotency strategy — the identifier inventory

Every identifier on a telemetry row, and what it can and cannot do:

| Identifier | Generated by | Scope | Globally unique? | Deduplicates? |
|---|---|---|---|---|
| `id` (bigserial) | Postgres, at insert | Table | **Yes** | No — assigned *after* the duplicate would exist |
| `request_id` (uuid) | Edge Function, `crypto.randomUUID()` per invocation | One handler invocation | **Yes** | No — groups, does not deduplicate. Many rows share one |
| `client_request_id` | Browser, per logical send | One student intent, spans retries | No, by design — retries reuse it deliberately | No. Identifies *logical* identity, which is its job |
| `question_record_id` | Postgres, on the question row | One work item | Yes as a row id | No — many calls per question |
| `session_id` / `user_id` | Existing platform ids | Session / student | Yes as row ids | No |
| `(request_id, service_code, stage)` | Composite, implicit | — | **No** — `ocr/extract` and `ocr/rerun` differ, but two solver calls differ only by the `stage` argument we pass, and a future service could legitimately call twice in one stage | Not reliably |

**There is no identifier that uniquely names a single upstream call.** That is
the structural finding of this review: the database has no key on which to
reject a duplicate, and no key on which a retry could be made safe. Everything in
§1 rests on "we never retry" — a behavioural guarantee, not a schema one.

**F1** adds one: a `call_uid uuid` minted in `recordModelCall` at the moment the
call is observed, with a `UNIQUE` constraint. It converts the write from
"at-most-once because we dare not retry" into "idempotent, therefore safely
retryable", which simultaneously hardens §1 and shrinks §2.

---

## 6. Data completeness

### 6.1 Definition

> **100% telemetry coverage** = every upstream provider call actually issued by
> the platform in a period has exactly one row in `ai_model_calls`, with a
> non-zero token count when the provider returned usage.

Two halves matter equally. "Exactly one" excludes both loss and duplication.
"Non-zero tokens" excludes the failure mode that motivated the entire project:
`ai_usage_logs` has 1,134 rows and records zero tokens on every one. A telemetry
table that exists but records zeros is the same failure with a new name.

### 6.2 How completeness is measured — the independent oracle

Coverage cannot be measured from the telemetry itself; you cannot count what you
failed to record. It needs a witness written independently.

**`question_records.verification_meta` is that witness.** It already records, per
question and independently of `ai_model_calls`, whether the L3 pipeline ran
(`pipeline_version`), whether the detector ran (`v2_version`), how many OCR
reruns fired (`ocr_rerun_count`), and whether the judge short-circuited
(`verification_status = 'ocr_uncertain'`). From those, the expected call count is
derivable exactly:

```
expected =  1                                          -- tutor
          + (has_image                        ? 1 : 0) -- vision/question_detect
          + (l3_ran AND has_image             ? 1 : 0) -- ocr/extract
          + (l3_ran                           ? ocr_rerun_count : 0)
          + (l3_ran                           ? 2 : 0) -- solver_a + solver_b
          + (l3_ran AND NOT judge_short_circuit ? 1 : 0)
          + (v2_ran                           ? 1 : 0) -- difficulty_detector
```

**This was executed against the last 30 days of production** and produces a
clean, plausible distribution:

| expected calls | questions | shape |
|---|---|---|
| 1 | 70 | text, no pipeline |
| 4 | 62 | text + pipeline (tutor, 2 solvers, judge) |
| 5 | 4 | as above + one rerun |
| 6 | 231 | image + pipeline |
| 7 | 37 | image + pipeline + rerun |
| **total** | **404** | **1,983 expected calls** |

So on day one after deploy, coverage is a subtraction, not a guess:

```sql
-- Per-question coverage. Any row with actual < expected is lost telemetry.
SELECT service_code, sum(expected) AS expected, count(actual) AS actual,
       round(100.0 * count(actual) / nullif(sum(expected),0), 2) AS coverage_pct
FROM ( … expected-vs-actual join on question_record_id … )
GROUP BY service_code;   -- PER SERVICE, never only in aggregate (§2)
```

### 6.3 The external oracle — the one that settles it

The reconciliation above proves internal consistency. It cannot prove the token
*counts* are right, because both sides come from us.

**The provider invoice is the external truth.** OpenAI reports authoritative
per-day token totals per model. A monthly reconciliation of
`sum(prompt_tokens + completion_tokens) GROUP BY model` against the provider's
own figures is what converts "self-consistent" into "financially verified", and
it is the control that would catch a systematic emitter bug that the internal
oracle shares. **F4** proposes it as a standing Phase 4 control.

### 6.4 How missing telemetry is detected

| Signal | Catches |
|---|---|
| Per-question expected-vs-actual (§6.2), per service | Loss in any sink, attributable to a capability |
| Check **P3-07** rows exist | Total blackout (L3, L4, L7) |
| Check **P3-08** successful calls carry tokens | The zero-token failure mode |
| Check **P3-09** `input_token + cached_input_token = prompt_tokens` | Emitter arithmetic drift |
| Check **P3-13** > 10 calls per request | Double recording (§1 scenario 7) |
| Check **P3-15** attribution rates | Rows landing without a question or student |
| Log line `model-call-telemetry-error` | Every flush failure, one per occurrence |
| Provider invoice reconciliation (F4) | Systematic under-capture invisible to all of the above |

**Caveat to record now:** `difficulty_detector` has emitted zero calls in 30 days
because detector v2 never fired. Its absence is expected and must not be read as
missing telemetry — the reconciliation above handles this correctly, because
`v2_ran` is false for those questions.

---

## 7. Performance validation

### 7.1 Telemetry cannot increase student-visible latency

| Path | Work done | On the response path? |
|---|---|---|
| `recordModelCall` | One in-memory array push; no I/O, no await; runs after the provider response is already parsed | Yes, but O(1) and non-blocking — microseconds |
| Handler flush | **Not awaited.** The `finally` creates the promise, hands it to `EdgeRuntime.waitUntil`, and returns | No |
| Pipeline / detector flush | `await`ed — but inside tasks that already run in `waitUntil`, after the response was sent | No |

The one subtlety worth stating precisely: the handler's `finally` runs *before*
the response is delivered, so whatever it does synchronously is on the critical
path. That synchronous work is `splice` + `map` + building a `supabase-js` query
object. The network call begins at the first `await`, inside the promise, off the
path. Microseconds, not milliseconds.

**Verified by construction, not by benchmark.** A load test would be a better
proof and is not available pre-deploy; step 12 of the deploy plan (watch p95 for
15 minutes) is the empirical check.

### 7.2 Telemetry failure cannot fail a tutoring request

| Surface | Protection |
|---|---|
| `recordModelCall` | Entire body in `try/catch`; returns void; nothing reads its result |
| `flushModelCalls` | `async`, so it cannot throw synchronously; internal `try/catch` around the insert; **never rejects** |
| Pipeline / detector `finally` | Awaits a promise that cannot reject |
| Tutoring logic | Reads no telemetry value. Removing the telemetry block entirely would not change a single tutoring decision |

**One unguarded surface found.** In the handler's `finally`, the calls to
`flushModelCalls(...)` and `EdgeRtT.waitUntil(flushTask)` are not themselves
wrapped. `flushModelCalls` cannot throw synchronously, but `waitUntil` is a
runtime-provided function: if it ever threw, the exception would propagate out of
`finally` and **replace the response with a 500**. The probability is very low;
the cost of eliminating it is one `try/catch`. **F5**.

---

## 8. Future compatibility

Assessed against the frozen extensibility contract (architecture §13).

| Future change | Schema redesign needed? | Why |
|---|---|---|
| New provider (Anthropic, Google, Azure) | **No** | `provider` is free text; no enum, no FK |
| New capability (Truth Engine, SymPy, embeddings) | **No** | `service_code` is free text with no FK — deliberately, so an unregistered code is recorded and flagged rather than rejected |
| New billing model (per page, per minute, per document, tiered) | **No** | `units jsonb` is the hinge — a new unit code, not a column |
| Non-token services (per-request verifier, flat-rate) | **No** | `units` may hold `{"request":1}` or `{"second":42}`; the token mirrors simply stay 0 |
| Non-HTTP runtimes (local SymPy, in-process Python) | **No** at the schema level | `http_status` is nullable; `success`, `latency_ms`, `units` all apply |
| Batch / realtime API surfaces | **No** | `api_surface` column already present |
| Multi-modal billing (image + tokens) | **No** | Multiple unit codes on one row |

**Schema verdict: no redesign required.** The table is provider-agnostic,
service-agnostic and billing-model-agnostic, as designed.

**The emitter is less future-proof than the schema.** `recordModelCall` hardcodes
`provider: 'openai'` and `api_surface: 'default'`. A second provider would
require editing that function — small, but it contradicts the promise that adding
a provider is a data change (INV-12). **F6** parameterises both, with `'openai'`
and `'default'` as defaults so no call site changes.

---

## 9. Findings

| # | Finding | Severity | Fix cost | Blocks trust? |
|---|---|---|---|---|
| **F1** | **No per-call unique identifier.** Nothing lets the database reject a duplicate or make a retry safe. At-most-once rests entirely on "we never retry" | **High** | 1 column + `UNIQUE` + one `crypto.randomUUID()` | **Yes** — for absolute totals |
| **F2** | **`created_at` is write time, used as economic time.** Background calls are timestamped seconds late; day-boundary attribution is approximate | **Medium** | 1 nullable column + 1 line in the emitter | **Yes** — for period-accurate reporting |
| **F3** | **`client_request_id` on 2 of 9 site types**, and only in `meta`. Retry cost analysis is structurally incomplete | **Medium** | 1 column, stamped at flush from context | Partially |
| **F4** | **No external reconciliation.** Internal consistency cannot detect a systematic emitter bug | **Medium** | A monthly Phase 4 control, not code | **Yes** — for verified totals |
| **F5** | **Handler `finally` body unguarded.** A throw from `waitUntil` would become a student-visible 500 | **Low** | One `try/catch` | No, but trivial to close |
| **F6** | **`provider` / `api_surface` hardcoded** in the emitter, contradicting INV-12's "adding a provider is a data change" | **Low** | Two optional parameters with defaults | No |
| **F7** | Both the handler sink and the pipeline sink are named `teleSink` in different scopes. Correct today; an invitation to a future mistake | **Cosmetic** | Rename one | No |

**F1, F2, F3, F5, F6 are all changes to files that have not been applied or
deployed.** They cost nothing to make now and become expensive after the table
carries production data. F4 is a Phase 4 operating control.

### The exact deltas, for approval in one word

```sql
-- F1: idempotent, safely retryable writes
call_uid uuid NOT NULL,
CONSTRAINT ai_model_calls_call_uid_key UNIQUE (call_uid),
-- F2: the true economic timestamp, keeping created_at as the safe write clock
started_at timestamptz NULL,
-- F3: logical-request identity on every row
client_request_id uuid NULL,
```

```ts
// F1/F2 in recordModelCall: call_uid: crypto.randomUUID(),
//                           started_at: new Date(args.started).toISOString(),
// F3 in flushModelCalls ctx: clientRequestId, stamped like session_id/user_id
// F5: wrap the handler's finally body in try { … } catch { /* never fail a request */ }
// F6: provider = 'openai', apiSurface = 'default' become optional args
```

---

## 10. Verdict

**Is the telemetry design financially trustworthy enough to be the Cost Engine's
single source of truth?**

**Yes — the design. Not yet the current implementation, by a margin of five small
changes.**

What the review establishes as solid:

- **Duplication is structurally prevented.** Four independent mechanisms, and the
  only remaining paths require a future code change or a library behaviour
  change. The failure mode is loss, not inflation — the safer direction for cost
  data, and the one that measurement can bound.
- **No scenario exists in which telemetry can degrade or fail a student
  request.** One theoretical hole (F5) is one `try/catch` from closed.
- **The schema needs no redesign** for any future provider, capability, billing
  model, or runtime.
- **Loss is detectable**, because an independent oracle already exists in
  production and was proven to work against 30 days of real data before a single
  telemetry row has been written.

What stands between this and unconditional trust:

- **F1.** With no per-call key, the database cannot reject a duplicate and a
  failed write can never be safely retried. Every loss is permanent by
  construction. This is the single most important change, and it is one column.
- **F2.** A fact table for financial reporting should not use its write clock as
  its economic clock.
- **F4.** Self-consistency is not verification. Until summed tokens are
  reconciled against the provider's own invoice, the totals are *internally*
  credible rather than *externally* confirmed.

And one operational truth the numbers make unavoidable: **two thirds of calls and
over 70% of expensive-model calls flush after the response**, so loss is biased
toward the costly half of the workload. Coverage must therefore be reported per
service, never as a single reassuring aggregate.

### Recommendation

**Approve Phase 3 with F1, F2, F3, F5 and F6 applied first.** They touch only
unshipped artifacts, they take one pass, and they change the guarantee from
"at-most-once, loss unbounded and unrecoverable" to "idempotent, retryable,
period-accurate, and measurable per service" — which is the standard a permanent
financial fact table should meet on the day it is created, not after it has
accumulated a year of data that cannot be retrofitted.

Adopt **F4** as a standing Phase 4 control before any figure from this table is
used to make a pricing decision.

With those in place, this telemetry is a sound single source of truth for the
Cost Engine. Without F1 and F2 specifically, it remains trustworthy for
**direction and comparison** — which service is expensive, which lesson costs
most, whether a model swap helped — but should not be presented as an **absolute
financial total** without the caveat that it is a measured floor, not a verified
sum.
