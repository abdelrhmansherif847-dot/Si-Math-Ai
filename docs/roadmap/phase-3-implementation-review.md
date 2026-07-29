# AI Economics · Phase 3 — Implementation Review

> **NOTHING HAS BEEN DEPLOYED OR APPLIED.** No migration was run, no Edge
> Function was deployed, no production behaviour has changed. This document and
> the artifacts it describes exist for review only, and Phase 3 does not proceed
> without explicit approval.

| | |
|---|---|
| **Phase** | 3 — AI Telemetry (`docs/roadmap/ai-economics.md` §7, §14) |
| **Status** | Prepared, awaiting implementation-review approval |
| **Date** | 2026-07-28 |
| **Depends on** | Phase 2 (`ai_catalog`) — applied and verified 2026-07-28 |
| **Risk class** | ⚠ **The only phase that touches production request handling** |
| **Deploy window** | Outside an exam-preparation window (owner decision, §15 Q8) |
| **Integrity review** | `docs/roadmap/phase-3-telemetry-integrity-review.md` — **7 findings; F1/F2/F3/F5/F6 recommended before deploy** |

---

## 1. What Phase 3 is for

Today the platform spends real money on every student question and records none
of it. Across 1,134 `ai_usage_logs` rows: `estimated_cost_usd` = 0.00 in 100%,
tokens = 0 in 100%, and `model_name` says `claude-3-5-haiku` on 1,133 of them —
a client-side hardcode naming a model this function never calls.

Phase 3 makes one row appear for every upstream call, saying which capability
did the work and what it consumed. It closes three gaps from the architecture's
register:

| Gap | Closed how |
|---|---|
| **GAP-1** no token/cost/model telemetry | tokens read from the provider's own `usage` object, at the call site |
| **GAP-2** billing unit ≠ cost unit | one row per call, not per question — the 4-to-6 call fan-out becomes visible |
| **GAP-7** failure cost unmeasured | failed calls are recorded, not swallowed (`success = false`) |

It deliberately does **not** compute cost. Pricing is Phase 4's job; a cost
stamped in the service layer would be an unversioned pricing formula living in
the wrong place (INV-01, INV-02).

---

## 2. Artifacts prepared

| Artifact | Path | State |
|---|---|---|
| Migration | `supabase/migrations-pending/20260728_aiecon_p3_model_call_telemetry.sql` | **not applied** |
| Edge Function | `supabase/functions/ai-tutor/index.ts` (v89 → **v90**) | **not deployed** |
| Verification | `scripts/verify-ai-telemetry.sql` | 15 checks, ready |
| Validator bound | `scripts/validate-ai-tutor-source.mjs` | size ceiling 210 KB → 240 KB |

Diff: **415 insertions, 22 deletions** across two files. No frozen file
(CLAUDE.md §2) is touched. No existing table, RPC, policy, or grant is altered.

---

## 3. The telemetry schema

`public.ai_model_calls` — append-only, one row per upstream provider call,
implementing the frozen §7.1 schema exactly.

```
correlation   request_id (NOT NULL) · question_record_id → question_records
              session_id · user_id
capability    service_code · stage · operation
implementation provider · model · api_surface
usage         units jsonb · prompt_tokens · completion_tokens
outcome       success · http_status · error_code · latency_ms
              meta jsonb
```

Posture, matching the Phase 2 catalog:

- **No money column, ever.** Enforced by review and by check P3-04.
- **RLS on, no policies** — deny-all for every non-bypassing role.
- **No grants** to `anon` or `authenticated`.
- **Immutable to its own writer**: `service_role` holds `INSERT`/`SELECT`, and
  `UPDATE`/`DELETE` are revoked from it (INV-15). Phase 8 retention deletion
  runs as the table owner, which these grants do not restrict.
- **PII-free**: counts, outcome, latency, model identity. No prompt or
  completion text — the `analyzer_runs` precedent.
- **No FK on `service_code`.** Telemetry is fire-and-forget: a code emitted
  before its catalog row exists must be *recorded and flagged*, never rejected.
  Check P3-10 surfaces any such code.

### Token decomposition — the one subtle detail

OpenAI's `usage.prompt_tokens` **includes** the cached prefix, and
`prompt_tokens_details.cached_tokens` is the subset billed at the cheaper rate.
The units split them so a rate card can price each separately:

```
units.input_token        = prompt_tokens - cached_tokens
units.cached_input_token = cached_tokens
units.output_token       = completion_tokens

invariant: input_token + cached_input_token == prompt_tokens
```

The `prompt_tokens` column keeps the provider's raw figure as a convenience
mirror; `units` is authoritative for pricing. Getting this wrong would silently
overstate cost by double-counting the cached prefix, so check **P3-09** asserts
the invariant on live rows.

---

## 4. The Edge Function changes (v90)

### 4.1 New block: `recordModelCall` / `flushModelCalls`

~130 lines added after `newCorrelationId()`. `recordModelCall` buffers one row
into a request-scoped array — no network, no await, wrapped in try/catch so it
can never throw into a tutoring path. `flushModelCalls` writes the batch and
never rejects: an error logs one line and is swallowed.

A **kill switch** disables both without a redeploy:

```bash
supabase secrets set AI_MODEL_TELEMETRY_ENABLED=false --project-ref igvkyxkmjnkzscqgommj
```

Default is on. With it off, `recordModelCall` returns immediately and no insert
is ever attempted.

### 4.2 The eight instrumented call sites

Every OpenAI call in the function, mapped to the canonical service seeded in
Phase 2:

| # | Call site | service_code | stage | Model | Sink |
|---|---|---|---|---|---|
| 1 | main tutor answer | `tutor` | `tutor_main` | gpt-4o / gpt-4o-mini | request |
| 2 | reference / re-explain | `reference_resolver` | `resolve` | gpt-4o / gpt-4o-mini | request |
| 3 | multi-question detect | `vision` | `question_detect` | gpt-4o | request |
| 4 | OCR extract | `ocr` | `extract` | gpt-4o | pipeline |
| 5 | OCR rerun | `ocr` | `rerun` | gpt-4o | pipeline |
| 6 | solver A | `solver` | `solver_a` | gpt-4o-mini | pipeline |
| 7 | solver B | `solver` | `solver_b` | gpt-4o-mini | pipeline |
| 8 | judge | `judge` | `verdict` | gpt-4o | pipeline |
| 9 | difficulty detector v2 | `difficulty_detector` | `classify` | gpt-4o-mini | detector |

Counted as 8 call sites because solver A and B are the same site invoked twice.
14 `recordModelCall` invocations cover them, because most sites record on both
the success and the failure path.

### 4.3 Three sinks, three flushes

Work happens in three lifetimes, so buffering is per-lifetime:

| Sink | Flushed | Covers |
|---|---|---|
| request | `finally` on the handler's main `try` | sites 1–3 |
| pipeline | `finally` inside `runL3ShadowPipeline` | sites 4–8 |
| detector | `finally` inside the detector-v2 background task | site 9 |

The handler-level flush is in a **`finally`** specifically so it runs on every
exit path — the worksheet guard, the scope guard, the repeat path, the
idempotency hit, and the error path included. Instrumenting the four `return`
sites individually would have left spend unreported wherever a future edit adds
a fifth.

**The flush is not awaited.** Awaiting in `finally` would hold the student's
response open for the duration of an INSERT. `flushModelCalls` drains the sink
synchronously before its first await, so rows are captured even though the
promise settles in the background, and `EdgeRuntime.waitUntil` keeps the isolate
alive for it — the same pattern the shadow pipeline already uses.

### 4.4 Two defects found and fixed during implementation

Recording these because both would have corrupted cost data quietly:

1. **Double-counting on post-record parse failure.** In `detectQuestionsInImages`,
   `JSON.parse` runs *after* the call is recorded. A well-formed HTTP response
   carrying malformed content would throw into the catch, which recorded the
   same call a second time as a failure — one unit of real spend counted twice.
   Fixed with a `recorded` flag, and the same guard applied to `runSolver`,
   `extractMathTextFromImage`, and `runJudge`, which share the shape.

2. **Session id recorded on only one branch.** The first version set
   `teleCtx.sessionId` inside the new-session branch only, so every call on an
   *existing* session — the overwhelming majority — would have recorded a null
   session. Moved to after the if/else so both branches record identically.

### 4.5 What did not change

No prompt, model, temperature, token limit, `response_format`, routing decision,
response field, or existing database write. The `question_records` contract,
hints, taxonomy, personality, KB retrieval, scope guard, and CORS/rate-limit
layers are untouched. Every edit is either additive or a mechanical extraction
(`model: solveImages.length ? … ` became `const tutorModel = …` so the value
could be recorded, with identical behaviour).

---

## 5. Production risks

Ordered by expected impact. "Blast radius" is what a student would experience.

| # | Risk | Likelihood | Blast radius | Mitigation |
|---|---|---|---|---|
| R1 | **Deploy truncation / stub** — the 2026-06-17 outage class | Low | Total: every request 500s | Deploy via **DEPLOY.md §4 Path B (CLI) only**; the inline MCP deploy tool is prohibited (CLAUDE.md §1). `validate-ai-tutor-source` runs before and after. Post-deploy version header check + smoke test |
| R2 | **Multi-file bundle mis-deploy** — v83+ imports `_shared/taxonomy.core.js`; Dashboard copy-paste ships only `index.ts` and the function 500s at cold start | Low | Total | Path B bundles the directory tree. Post-deploy, confirm the file list shows **both** `index.ts` and `_shared/taxonomy.core.js` |
| R3 | **Telemetry insert fails** (migration not applied, table renamed, grant missing) | Low | **None** — caught and logged; tutoring unaffected | Apply the migration first. Failures log `model-call-telemetry-error`, one line per request. Kill switch stops the noise instantly |
| R4 | **Added latency** | Very low | None measurable | No telemetry work is awaited on the response path. `recordModelCall` is an in-memory push; the flush runs in `waitUntil` after the response |
| R5 | **Isolate torn down before the flush completes** — rows lost | Medium | None to students; a small under-count | `waitUntil` is the mitigation where the runtime provides it. Some loss under aggressive recycling is accepted: this is telemetry, and P3-13/P3-15 make coverage visible rather than assumed |
| R6 | **Unhandled throw inside telemetry** reaching a student | Very low | Would surface as a 500 | Every entry point is wrapped in try/catch; `flushModelCalls` cannot reject. No telemetry value is read by tutoring logic |
| R7 | **Volume growth** | Low | None near-term | ~4–6 rows/question ⇒ ~70 rows/day today, ~5k/day at 1,000 questions/day. Rollups and retention are Phase 8 |
| R8 | **`operation` is derived, not received** — a wrong guess mis-attributes cost per operation | Medium | None to students; analytical only | The rule mirrors `chat.html:2395` exactly. Documented as derived in the column comment and the architecture; a later phase can have the client send the charged operation |
| R9 | **Network-level throw on sites 1–2 goes unrecorded** — those two calls are not individually wrapped, so a socket/DNS failure propagates to the existing handler instead of recording | Low | None | Accepted deliberately: wrapping them would change an existing error path. The failure that matters — an HTTP error like the 2026-06-23 quota 429 — **is** captured, because that still returns a parseable response |
| R10 | **Validator ceiling raised** 210 KB → 240 KB, weakening a stub-deploy guard slightly | Low | None directly | The ceiling is a ballooning sanity check, not the stub guard — the `serve()` handler and pillar-pattern checks are. v89 was already at 206 KB with 4 KB of headroom; the bump follows the same documented pattern as the previous four |

### Explicitly out of scope for this phase

- No cost, price, or currency is computed anywhere (Phase 4).
- The five unmetered operations (`MOCK_EXAM`, `MOCK_TIMER`, `MOCK_PRACTICE`,
  `FOCUS_SESSION`, `WEAKNESS_ANALYSIS`) stay unmetered — those pages are frozen
  and their wiring is Phase 8 (GAP-3).
- No historical backfill. Pre-v90 periods stay **Blocked**, never estimated.

---

## 6. Deploy plan

**Order matters.** Migration first, then function.

| Step | Action | Gate |
|---|---|---|
| 1 | Confirm the deploy window is outside exam prep | Owner |
| 2 | `node tests/run-all.mjs` → ALL GREEN | 18/18 |
| 3 | Apply `20260728_aiecon_p3_model_call_telemetry.sql` | CLAUDE.md §3 — individual approval |
| 4 | `psql -f scripts/verify-ai-telemetry.sql` — structural checks PASS, data checks WARN (no rows yet) | — |
| 5 | Move the migration file to `supabase/migrations/` with an APPLIED header | — |
| 6 | `./scripts/validate-ai-tutor-source.sh` → PASS | Pre-deploy gate |
| 7 | Deploy v90 via **DEPLOY.md §4 Path B**: `supabase functions deploy ai-tutor --project-ref igvkyxkmjnkzscqgommj` | CLAUDE.md §1 — CLI only |
| 8 | Confirm version header reads `v90` and the bundle lists **both** files | R1, R2 |
| 9 | `./scripts/smoke-test-ai-tutor.sh` | Must pass before declaring done |
| 10 | Ask one text question and one image question as a real student | — |
| 11 | Re-run `verify-ai-telemetry.sql` — every row PASS | Phase 3 exit |
| 12 | Watch logs ~15 min for `model-call-telemetry-error` | — |

### What "working" looks like after step 10

A text question should produce **1** row (`tutor/tutor_main`), plus
`difficulty_detector/classify` when the detector fires. An image question with
the L3 pipeline on should produce **5–6**: `tutor`, `ocr/extract`, optionally
`ocr/rerun`, `solver_a`, `solver_b`, `judge` — and `vision/question_detect` when
multiple images are attached. Every successful row must carry non-zero
`prompt_tokens`.

---

## 7. Verification

`scripts/verify-ai-telemetry.sql` — 15 checks, every row must read PASS.
WARN means "not enough data yet" and is expected between step 3 and step 10.

| Group | Checks |
|---|---|
| Structure | P3-01 table exists · P3-02 no client grants · P3-03 RLS on · P3-06 indexes |
| Posture | P3-04 no money column (INV-01) · P3-05 immutable to its writer (INV-15) |
| **Truth** | **P3-08 successful calls carry non-zero tokens** · P3-09 units reconcile with the mirrors |
| Consistency | P3-10 service codes registered · P3-11 service/model pairs match catalog bindings · P3-12 stage vocabulary |
| Sanity | P3-13 no request emits > 10 calls (double-record detector) · P3-14 failure capture visible · P3-15 attribution landing |

P3-08 is the one that matters most. Phase 3 exists because `ai_usage_logs`
"works" while recording zeros; a telemetry table that exists but records zeros
would be the same failure with a new name.

**Pre-flight already done.** The check logic was dry-run against production with
two fixtures: a realistic 6-call request (all checks PASS) and a deliberately
broken one — zero tokens, units that don't reconcile, an unregistered service,
an unknown stage. The broken fixture tripped four distinct checks, so they are
sensitive rather than vacuous. The good fixture's service/model pairs also
resolved against the **real** Phase 2 catalog, confirming the emitter and the
catalog agree.

---

## 8. Rollback

Three levels, cheapest first. All are safe at any time.

| Level | Action | Effect | Reverses |
|---|---|---|---|
| **1 — instant, no deploy** | `supabase secrets set AI_MODEL_TELEMETRY_ENABLED=false` | Recording and flushing stop; the function keeps serving | Any telemetry misbehaviour |
| **2 — function** | Redeploy v89 via DEPLOY.md §4 Path B | No writer remains; the table goes inert | Any code concern |
| **3 — schema** | `DROP TABLE public.ai_model_calls;` | Removes the table entirely | Everything |

Level 1 is almost always the right first move: it stops the behaviour in
seconds without a deploy, and preserves the rows already collected for
diagnosis. Level 3 is only safe before Phase 4 — after that,
`cost_engine.cost_facts` references `ai_model_calls(id)`.

Phase 2's catalog is unaffected by any level; it holds no telemetry.

---

## 9. Test evidence

| Check | Result |
|---|---|
| `node tests/run-all.mjs` | **18/18 green** (12 suites + 6 validators) |
| `node --check` type-strip parse | **PARSE OK** |
| `validate-ai-tutor-source` | **PASS** — 223,283 bytes, 4,018 lines, version=v90 |
| Call-site coverage audit | 8 OpenAI call sites, 14 record points, 3 flush points — all accounted for |
| Verification-logic dry run | Good fixture all-clear; bad fixture trips 4 checks |

The baseline before any edit was also 18/18, so nothing regressed.

---

## 10. What we are asking approval for

> ⚠ **Superseded in part by the Telemetry Integrity Review**
> (`phase-3-telemetry-integrity-review.md`, 2026-07-28), which recommends five
> emitter/schema hardening changes — F1 (per-call unique id), F2 (true economic
> timestamp), F3 (client_request_id on every row), F5 (guard the handler
> `finally`), F6 (parameterise provider) — **before** this migration is applied.
> All five touch unshipped artifacts only. Approve those first, or explicitly
> waive them, before the items below.

1. Apply `20260728_aiecon_p3_model_call_telemetry.sql` (CLAUDE.md §3).
2. Deploy `ai-tutor` **v90** via DEPLOY.md §4 Path B, in a window you nominate.
3. Accept the validator size-ceiling bump (210 KB → 240 KB).

Nothing proceeds until all three are approved. If you want the migration applied
now and the deploy held until a specific window, that split is safe — the table
is inert with no writer, and step 4's verification will simply report WARN on
the data checks until v90 ships.
