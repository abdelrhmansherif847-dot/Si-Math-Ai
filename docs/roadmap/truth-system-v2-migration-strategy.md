# Si Math Truth System v2 — Engineering Migration Strategy

**Document type:** Migration blueprint. Not a design review, not an implementation request.
**Status:** Proposed. Nothing here is implemented. No migration is prepared. No deploy is made.
**Date:** 2026-08-02
**Reference architecture:** *Si Math Truth System v2 — Synthesized Architecture* (2026-08-02), treated
throughout as the North Star.
**Repository state analysed:** `claude/si-math-migration-strategy-dnrteg` @ `cbf2fea`
(Phase 7 M4 closed out).

---

## 0. How to read this document

This document answers one question: **how does the repository that exists today become the
architecture in Truth System v2, without breaking a live product used by real students during exam
prep?**

It is written from the position of the engineer who has to ship it, not the architect who designed
it. Where v2 and engineering reality disagree, engineering reality wins and the deviation is named
explicitly in **§7 — Amendments proposed to v2**. There are six of them. Every other part of v2 is
preserved.

Three facts about the repository shape everything below, and they should be read first.

**Fact 1 — there is no backend service tier.** The platform is a static site on Vercel (46 HTML
pages, no build step, no `package.json`, no bundler, CDN dependencies pinned with SRI), plus
Supabase Postgres, plus exactly two Edge Functions. There is no place today to put a Certification
Plane, a Bank pipeline, or an Assurance Plane. Standing up a service tier is the single most
expensive infrastructure move available to this team, and §7.1 argues Horizon 1 does not need it.

**Fact 2 — `ai-tutor/index.ts` is 4,627 lines and its deploy path is frozen after two outages.**
Every subsystem lives in that one file: personality, taxonomy, KB retrieval, worksheet navigation,
scope guardrails, difficulty detection, the L3 Shadow pipeline, telemetry, credits. `CLAUDE.md`
prohibits the inline MCP deploy path outright; `DEPLOY.md §4` restricts deployment to the CLI
bundle path. Adding six planes to this file is not a viable plan. The escape hatch already exists
in the repository and is already exercised in production (§3, Phase V1).

**Fact 3 — the hardest half of the Budget Governor is already built and is better than v2 asks
for.** `public.ai_model_calls` and the `cost_engine` schema (Phase 7) give per-call idempotent
telemetry, a two-clock economic model, and versioned dated rate cards carrying a
`price_confidence` discriminator (`list_price` vs `invoice_verified`). v2 §9.5 asks for "no
hardcoded price constants — prices live in dated config the Governor reads at runtime." That is
shipped. This is roughly six months of work that does not need doing.

---

## 1. Current Architecture Mapping

Every major v2 subsystem, mapped to what exists. Four dispositions: **Already exists**, **Partially
exists**, **Missing**, **Conflicts with v2**.

### 1.1 Intake Plane (v2 §5)

| v2 element | Disposition | Evidence and reasoning |
|---|---|---|
| **5.1 Transcription, single pass** | **Partially exists** | `extractMathTextFromImage()` (`index.ts:1920`) runs one `gpt-4o` vision pass with an explicit anti-autocomplete guard. But v2's economic point — *transcribe once, fan text out* — is **violated**: `runL3ShadowPipeline` passes `imageData` to both solvers (`index.ts:2427-2428`), so the image is decoded three to four times per item (extract + optional rerun + solver A + solver B). The comment at `index.ts:2213` says this was deliberate ("fixes the image-questions-not-verifiable bug"), which means text-only fan-out was tried and lost on accuracy. That is a real finding and it must be re-tested against the round-trip mechanism, not simply reverted. |
| **5.2 Round-trip confirmation** | **Missing** | Nothing re-renders the extracted LaTeX and asks a second model whether it matches. `ocrAmbiguityCheck()` is the nearest thing and it is not a round trip. |
| **5.3 Ill-posedness detection** | **Missing** | No `INCOMPLETE_CAPTURE` / `UNREADABLE` / `ILL_POSED` / `UNDER_DETERMINED` / `MULTIPLE_VALID` alphabet. The system answers everything. |
| **5.4 Canonicalisation** | **Missing** | No canonical AST, no α-renaming, no deterministic serialisation, no template slots. |
| Classification | **Already exists, and better than v2 assumes** | `taxonomy.core.js` is a single authored source synced to `taxonomy.js` and `_shared/taxonomy.core.js` with a CI drift gate (`scripts/sync-taxonomy.mjs`, `validate-taxonomy.mjs`). 5 topics, 33 subtopics. `DifficultyDetector` v1 is heuristic and zero-latency (`index.ts:1455`); Detector v2 is an LLM shadow classifier firing only on `default_medium` (~63% of traffic, `index.ts:1546`). Classification is already advisory and already non-blocking — exactly v2 §5.4's requirement. |
| **5.5 Answer Bank & Cache** | **Missing** | No canonical hash, no template hash, no near-duplicate retrieval. `sha256short()` exists (`index.ts:2384`) but hashes Zero's *answer* for dedup telemetry, not the item. `search_zero_knowledge` is prompt-splice RAG over a curated KB, not an answer cache. **This is the largest single cost lever in v2 and it is entirely absent.** |
| **5.6 Bank/Live split** | **Missing** | No offline batch pipeline, no Batch API usage. |

### 1.2 Claim Plane — the Verification IR (v2 §6)

**Missing in its entirety.** There is no formal assertion language anywhere in the repository. This
is v2's largest single addition and it has no antecedent here.

Two partial antecedents worth naming because they are the seeds:

- `normalizeFinalAnswer()` / `parseNumericAnswer()` / `answersEquivalent()` (`index.ts:1737-1779`)
  are a *proto-checker*: a fixed, closed vocabulary (integer, decimal, fraction, currency prefix,
  thousands separators) with an explicit fail-closed rule. The design instinct is exactly right.
  The soundness class is wrong (see §1.4).
- `detectQuestionsInImages()` (`index.ts:2037`) already produces a structured, typed extraction from
  an image with a strict JSON contract. The plumbing for "vision → typed structure" exists.

### 1.3 Hypothesis Plane (v2 §7)

| v2 tier | Disposition | Reasoning |
|---|---|---|
| **T1 primary solver** | **Already exists** | `runSolver()` at temp 0.1, `gpt-4o-mini`, with an enforced `Reasoning:` / `Final Answer:` output contract (`index.ts:2217`). |
| **T2 code-execution path** | **Missing** | No program-of-thought path, no executable witness. |
| **T3 alternate provider** | **Missing** | Single vendor (OpenAI) throughout. |
| **T4 human adjudication** | **Missing as a system** | Human support is referenced in `trust.html` and `ai-knowledge.html` as a product claim. There is no queue, no SLA, no routing rule, no unit cost in any budget, and no path from a human resolution into a label store. |
| **7.1 Ordered filtration** | **Conflicts with v2** | Solver B is *the same model at a different temperature* (`gpt-4o-mini` @ 0.1 and 0.3, `index.ts:2426-2429`). This is the maximally correlated two-producer configuration available — not a different prompt, not a different representation, not a different provider. Under v2 §7.1/§13, `solver_agreement` measured this way is close to uninformative, and it carries **40% of the weight** in `verification_quality_score` (`index.ts:2469`). |
| **7.3 Answer-blindness** | **Conflicts with v2, and this is the most consequential conflict in the repository** | `runJudge(questionText, zeroAnswer, solverA, solverB, ...)` (`index.ts:2316`) shows the judge Zero's explanation, Zero's extracted final answer, and both solvers' answers **before** it rules. This is precisely the answer-conditioned configuration v2 §7.3 measures at a false-positive rate of **0.719 versus 0.012** for the pre-committed alternative. Every `judge_verdict` row in production and every point on the AI Monitor's verdict distribution was produced under this configuration. |

### 1.4 Certification Plane (v2 §8)

**Missing, with one accidental and mislabelled member.**

`answersEquivalent()` is the repository's only checker. Its soundness class under v2 §8.1 is
`NUMERIC_TOLERANCE`, not `EXACT`: `parseNumericAnswer` evaluates `a/b` in IEEE-754 double
(`index.ts:1761`) and `answersEquivalent` compares with a relative tolerance of `1e-9`
(`index.ts:1778`). Per v2 §8.1, `NUMERIC_TOLERANCE` **may never settle an assertion**. Today it
settles `solver_agreement`, which is 40% of the quality score.

This is a small, cheap, high-value fix — the same function over `BigInt` rationals is `EXACT` and
is the first brick of the trusted core (§3, Phase V3).

Everything else in §8 is absent: no exact rational kernel, no ball arithmetic, no exact geometric
predicates, no SMT with checked proofs, no statistics kernel, no option-set checks, no soundness
lattice, no witness, no TCB.

There is **no Python anywhere in the repository** and no CAS. §7.1 argues this is an advantage, not
a gap.

### 1.5 Adjudication Plane — the Court (v2 §9)

| v2 element | Disposition | Reasoning |
|---|---|---|
| **9.1 Evidence Ledger (e-process)** | **Missing** | No e-values, no ledger, no conditioning sets, no merge modes. |
| **9.2 Risk Model (calibrated `q̂`, Bayes-factor bridge)** | **Conflicts with v2** | `verification_quality_score = 0.40·solver_agreement + 0.30·reasoningCompleteness + 0.30·judge.confidence` (`index.ts:2468`) is **exactly v1's Phase 6 Evidence Score**, which v2 Fork 2 rejects as "unfalsifiable; drifts silently on every model bump." It is uncalibrated, has never been fit against labels, and its three weights were chosen by hand. It is also **live on the AI Monitor dashboard** (`ai-monitor.html:482`, `:1264`), which makes it a coupling problem as well as a correctness problem. |
| **9.3 Decision Policy** | **Partially exists, in the weakest possible form** | The "policy" is a hardcoded straight-line sequence in `runL3ShadowPipeline` with no branching, no early exit, no budget, and no version field. v2 H1.4 asks for exactly a fixed per-lesson-family plan — so the *shape* is right and the *identity* is missing: there is no `policy_version`, no plan registry, and no propensity. |
| **9.4 Truth Engine (sole publish authority)** | **Missing** | There is no publish decision. The pipeline is shadow-only and double-gated (`VERIFICATION_ENABLED` && `VERIFICATION_SHADOW_ONLY`, `index.ts:4488`); the student receives Zero's answer regardless of the verdict. The output alphabet `PUBLISH_VERIFIED · PUBLISH_WITH_CAVEAT · ABSTAIN_INSUFFICIENT · DEFER_HUMAN · ILL_POSED · REFUTED_STUDENT_ANSWER` does not exist in any form. |
| **9.5 Budget Governor — money** | **Already exists, and exceeds v2's requirement** | `ai_model_calls` carries `call_uid` (idempotent write), `started_at` (economic clock) separate from `created_at` (write clock), `request_id`, `client_request_id`, `question_record_id`, `service_code`, `stage`, `provider`, `model`, `api_surface`, a `units` decomposition that splits `input_token` from `cached_input_token`, latency, and error codes. `cost_engine.rate_cards` carries `effective_from`/`effective_to`, `version`, `source_note`, and `price_confidence ∈ {list_price, invoice_verified}`. v2 §9.5's "no hardcoded price constants" requirement is **already satisfied**, and the `price_confidence` discriminator is a refinement v2 does not ask for. |
| **9.5 Budget Governor — latency** | **Partially exists, as an architectural accident that happens to be correct** | The entire L3 pipeline runs in `EdgeRuntime.waitUntil()` after `Response()` is returned. Student-perceived latency is zero. v2 §9.5's "budget time-to-first-useful-output and stream" is *trivially satisfied today* — but only because verification never affects the answer. The moment verification gates publication, this collapses and the streaming architecture becomes load-bearing. |
| **9.5 Budget Governor — risk** | **Missing** | No `α_ledger`, no `r`, no threshold of any kind. |

### 1.6 Assurance Plane (v2 §10)

| v2 element | Disposition | Reasoning |
|---|---|---|
| **10.1 Audit Engine** | **Missing** | No RLA, no assorters, no risk limit, no escalation branch. |
| **10.2 Reliability Model** | **Missing** | No per-lesson reliability estimation of any kind. |
| **10.3 Failure Genome** | **Partially exists** | `verification_meta` stores solver answers, reasonings, raw outputs, lengths, flags, latency and tier per record — a rich per-item failure record. What it lacks is a *key*: no canonical hash, no assertion-level disagreement, no distractor matching. `ai_tutor_failures` and `analyzer_runs` exist for operational failures, which is a different thing. |
| **10.4 Label Factory** | **Missing** | **There is no ground truth anywhere in this repository.** No gold set, no adjudication store, no label versioning. This is the true critical path (§3, Phase V2). |
| **10.5 Replay & OPE** | **Missing, and currently impossible** | The logging policy is deterministic and unlogged, so IPS/DR/HCOPE are inapplicable by absolute continuity (v2 §10.5). This cannot be retrofitted onto historical data. |
| **10.6 Calibration & Promotion Gate** | **Missing** | Model version changes are not tracked as calibration-invalidating events. `constants-drift.test.mjs` guards constant drift, not model drift. |
| **10.7 Forced exploration** | **Missing — but currently free, and it will never be cheaper** | The pipeline has no early exit: it runs the full plan on every math question. The effective exploration fraction is **100% today**. The moment a Decision Policy with early exit ships, it drops to whatever the policy chooses. **The cheapest possible moment to install P7 is before the policy exists**, and that moment is now. v2 does not make this observation and it is the single best piece of timing available in this migration. |

### 1.7 Data contracts (v2 §11) and compliance (v2 §23)

| v2 object | Disposition | Reasoning |
|---|---|---|
| `CanonicalItem` | **Missing** | — |
| `Assertion` / `Candidate` / `Certificate` / `Verdict` / `LedgerEntry` | **Missing** | — |
| `Decision` | **Conflicts with v2** | Verification state lives in nine nullable columns plus a `verification_meta` jsonb **on `question_records`** — the same row that carries `question`, `image`, `user_id`, and `ai_response`. v2 §11's retention split and §23's compliance boundary require the decision log to carry **no student identifiers and no images** so it can be retained permanently, while traces are sampled and TTL'd. Today they are the same row. Under the *FTC v. Edmodo* fact pattern v2 §23 cites, a permanently-retained store of student uploads keyed to user ids is the exposure. **This coupling gets more expensive to unwind every day it stands.** |
| `AuditRecord` | **Missing** | No ground truth channel exists. |

### 1.8 Development process — the strongest existing asset

Not a v2 subsystem, but it determines whether any of this is deliverable, so it is mapped.

The repository has a working, disciplined delivery pipeline: per-milestone
*investigation → engineering review → PREPARED migration → APPLIED migration → release report →
closeout*, visible across 60 files in `docs/roadmap/`. CI runs dependency-free suites that
**extract and execute the real shipped bytes** rather than paraphrasing them (`tests/_source.mjs`).
And `verification-framework-audit.md` states the exact epistemic rule Law 4 needs:

> **A green check is only evidence if it could have gone red.**

That document audits 49 SQL checks and finds one that cannot fail under any data and six that are
vacuous today because their candidate population is zero. A team that audits its own assertions for
vacuity is a team that can be handed a risk-limiting audit. **This culture is the highest-value
asset in the repository for this migration, and it should be the model for how the TCB is
reviewed.**

---

## 2. Gap Analysis

Complexity is engineer-months for this team, assuming the existing review cadence.
"Recommended Home" answers *where the code lives*, which for this repository is the binding
question.

### 2.1 Intake Plane

| Component | Current Status | Complexity | Dependencies | Recommended Home |
|---|---|---|---|---|
| Single-pass transcription | Partial (fan-out violated) | S (0.5) | Round-trip confirmation must land first, or accuracy regresses | Existing module — `ai-tutor/index.ts` |
| Round-trip confirmation (§5.2) | Missing | S (0.5–1) | Transcription | Existing module — `ai-tutor/index.ts`, background |
| Ill-posedness alphabet (§5.3) | Missing | M (2–3) | Student-facing recovery flows; `chat.html` UX | Edge Function + `chat.html` |
| Canonicaliser designed for hashing (§5.4) | Missing | **L (4–6)** | Nothing. Highest-leverage unblocked item | **Shared library** — `_shared/canonical.core.js` |
| Answer Bank + 3-tier cache (§5.5) | Missing | **L (5–8)** | Canonicaliser; new tables | **Database schema** + shared library |
| Bank offline pipeline (§5.6) | Missing | **XL (8–12)** | Bank; Batch API; Label Factory | **Offline pipeline** — new repo area, not the Edge Function |

### 2.2 Claim Plane

| Component | Current Status | Complexity | Dependencies | Recommended Home |
|---|---|---|---|---|
| Verification IR, top-5 families (§6.2) | Missing | **XL (10–14)** | Canonicaliser; checker kernel; taxonomy (frozen — see §4.4) | **Shared library** — `_shared/ir.core.js` |
| Assorter maps per assertion kind (§9.1 iii) | Missing | M (2) | IR | Shared library |
| `exhaustion` assertion kind (§9.1 ii) | Missing | M (1–2) | IR; option-set parsing | Shared library |
| Intensionality check (§6.3) | Missing | M (2–3) | IR; must be in the *trusted checker*, not the producer | Shared library (TCB) |
| Back-translation check (§6.5) | Missing | S (1) | IR | Edge Function, background |
| **IR parse rate + faithfulness measurement (H1.2b)** | Missing | M (2–3) | IR; Label Factory; human adjudication | **Offline pipeline** + admin UI |

### 2.3 Hypothesis Plane

| Component | Current Status | Complexity | Dependencies | Recommended Home |
|---|---|---|---|---|
| **Answer-blind judging (§7.3)** | **Conflicts** | **XS (0.25)** | **None** | Existing module — `runJudge` |
| T2 code-execution path (§7.2) | Missing | M (2–3) | Checker kernel (the evaluator *is* the kernel — §7.1) | Shared library + Edge Function |
| T3 alternate provider (§7.2) | Missing | M (2) | Second vendor account; `ai_catalog.providers` already models this | Edge Function |
| T4 human adjudication (§7.4) | Missing | **L (4–6)** | Queue, SLA, routing, unit cost, Label Factory | **Database schema** + `admin.html` + Edge Function |
| Filtration index on candidates (§13) | Missing | S (0.5) | Decision log | Database schema |

### 2.4 Certification Plane

| Component | Current Status | Complexity | Dependencies | Recommended Home |
|---|---|---|---|---|
| **Exact rational kernel over ℚ (§8.2)** | Missing | **M (2–3)** | **None — `BigInt` is native to Deno, Node and the browser** | **Shared library** — `_shared/exact.core.js` (TCB) |
| Option-set / answer-form checks (§8.6c) | Missing | S (1) | Option-set parsing in intake | Shared library (TCB) |
| Substitution / backsolve (§8.2) | Missing | M (2) | Exact kernel; IR | Shared library (TCB) |
| Exhaustion witness validation (§9.1 ii) | Missing | S (1) | Above | Shared library (TCB) |
| Exact geometric predicates, EPECK-class (§8.4) | Missing | M (2–3) | Exact kernel; squared-distance discipline | Shared library (TCB) |
| Randomised identity testing (§8.2) | Missing | M (2) | Exact kernel; independent-repetition discipline | Shared library (TCB) |
| Ball arithmetic for refutation (§8.3) | Missing | **L (4–6)** | Arbitrary-precision substrate; no JS equivalent of FLINT | **Backend service** — defer to H2 |
| Statistics kernel (§8.6b) | Missing | M (2–3) | Exact kernel; explicit convention parameter | Shared library (TCB) |
| SMT + checked proofs, cvc5 (§8.6) | Missing | **XL** | A service tier; cvc5 binary; `incomplete` = rejection | **Backend service** — H2/H3 |
| **TCB line budget + hand review (Law 1a)** | Missing | S (0.5) | Kernel exists | **CI gate** — `tests/tcb-budget.test.mjs`, existing idiom |

### 2.5 Adjudication Plane

| Component | Current Status | Complexity | Dependencies | Recommended Home |
|---|---|---|---|---|
| Evidence Ledger, e-process (§9.1) | Missing | **L (4–6)** | Verdicts; assorters; decision log | **Database schema** + shared library |
| Bounded-mean betting test (Law 2 r5) | Missing | M (2–3) | Ledger | Shared library |
| Risk Model `q̂` + Bayes-factor bridge (§9.2) | Missing (heuristic conflicts) | **L (4–6)** | **Labels.** Cannot be fit without them | **Offline pipeline** (fit) + shared library (apply) |
| Decision Policy v1 — named, versioned plans (H1.4) | Partial (unnamed straight line) | M (2) | Plan registry; decision log | Shared library + database schema |
| **Propensity logging (§9.3)** | **Missing — cannot be retrofitted** | **S (0.5)** | Decision log | Edge Function + database schema |
| Truth Engine + output alphabet (§9.4) | Missing | **L (4–6)** | Ledger; **product decision on abstention** (§7.4) | Edge Function + `chat.html` |
| Budget Governor — money | **Already exists** | — | — | `cost_engine` (built) |
| Budget Governor — risk (`α_ledger` from `r`, §16) | Missing | M (2) | Measured `μ`; measured coverage; labels | Database schema (config) + shared library |
| BMDP policy, offline λ (§9.3, H2.2) | Missing | **XL (10+)** | Propensity log; OPE; segments | **Offline pipeline** — H2 |

### 2.6 Assurance Plane

| Component | Current Status | Complexity | Dependencies | Recommended Home |
|---|---|---|---|---|
| **Label Factory + gold store (§10.4)** | **Missing — critical path** | **L (5–8)** | Human adjudication; **legal review before first ingestion (§23)** | **Database schema** + `admin.html` |
| Gold benchmark ~2,000 clean-room items (H1.6) | Missing | **XL (12+, mostly non-engineering)** | Counsel; authors; double-marking; ~30% non-consensus budget | Offline pipeline + database schema |
| **Forced exploration (§10.7)** | **Missing — free today, expensive later** | **S (1)** | Decision log; propensity | Edge Function |
| Audit Engine, ALPHA-style (§10.1) | Missing | **L (4–6)** | Decision log; labels; assorters | **Background worker** (pg_cron) + `ai-monitor.html` |
| Reliability Model (§10.2) | Missing | M (3–4) at Si Math's scale — see §7.5 | Labels; decision log | Offline pipeline |
| Failure Genome (§10.3) | Partial (unkeyed) | M (2) | Canonical hash; IR; distractor sets | Database schema |
| Replay & OPE (§10.5) | Missing | **L (6–8)** | Propensity log with a floor; two-store split | Offline pipeline |
| Calibration & promotion gate (§10.6) | Missing | M (3) | Calibrator; frozen gold set in CI | CI gate + offline pipeline |
| **Recalibration trigger on model change (H1.7b)** | Missing | S (1) | Calibrator | Edge Function + CI |

### 2.7 Cross-cutting

| Component | Current Status | Complexity | Dependencies | Recommended Home |
|---|---|---|---|---|
| **Decision log with the two-store split (§11, §23)** | **Conflicts — coupling grows daily** | **M (2–3)** | Nothing blocking | **Database schema** — new table, `question_records` untouched |
| Legibility Contract (§14) | Missing | **XL (10+)** | Certificates; translator; faithfulness verifier | H2 — Edge Function + offline |
| Streaming / TTFUO (§9.5) | Not needed today; load-bearing later | **L (5–7)** | Only once verification gates publication | `chat.html` + Edge Function |
| Compliance two-store split (§23) | **Conflicts** | Included above | Counsel | Database schema |
| Clean-room item provenance (§23) | Missing | M (2) engineering | Counsel first | Database schema |

---

## 3. Migration Roadmap

**Governing constraints, non-negotiable:**

1. **L3 Shadow stays in production, unchanged in behaviour, throughout.** Every phase is additive.
   The existing `runL3ShadowPipeline` keeps writing the same nine columns and the same
   `verification_meta` keys for as long as `ai-monitor.html` reads them.
2. **`verification_meta` is append-only.** Fields are added, never renamed, never removed. The AI
   Monitor already handles version skew via `pipeline_version` (`ai-monitor.html:452`); that is the
   compatibility mechanism and it must be honoured.
3. **Every phase ends deployable.** Each ships behind its own env gate, defaulting off, in the
   established `VERIFICATION_ENABLED` / `VERIFICATION_SHADOW_ONLY` style.
4. **Every phase follows the existing cadence**: investigation → engineering review → PREPARED
   migration → explicit approval → APPLIED → release report → closeout. Per `CLAUDE.md §3`, each
   migration is approved individually.
5. **Nothing student-visible ships before the knowledge graph is updated.** Per `CLAUDE.md`, the
   pipeline is Knowledge Graph → Documentation → Website → Implementation. Phases V0–V6 are
   invisible to students and therefore not gated on it. **Phase V7 is the first that is**, and it
   must start in `docs/knowledge/graph-data.mjs`.

Phases are labelled **V0–V8** to avoid colliding with the repository's existing Phase 1–7
(economics/taxonomy) numbering.

---

### Phase V0 — Freeze the observation surface

**Nothing that follows can be retrofitted onto data collected without this.** Ship it first, before
anything reads it. v2 H1.4 says the same; the repository makes it more urgent, because forced
exploration is free *today* and will not be free once a policy exists.

**Objectives**
- **Answer-blind judging.** Restructure `runJudge` into two calls: (1) the judge model solves the
  item with no candidate visible and its answer is recorded as a pre-commitment; (2) it is then
  shown the candidates and rules. Per v2 §7.3 this is a prompt-ordering constraint, it is nearly
  free, and it yields Si Math's first genuine assorter — *1 if the pre-committed answer matches the
  candidate, ½ if it abstained, 0 otherwise* (§9.1).
- **Dual-write, never replace.** The legacy answer-conditioned verdict keeps being computed and
  written to `judge_verdict` exactly as today. The blind verdict is written to new
  `verification_meta` keys. The AI Monitor is untouched.
- **Decision log table** (`verification_decisions`): no `user_id`, no image, no question text, no
  prose. `question_record_id` as a nullable FK for joining during the shadow period only.
  Long-retention by construction (§11, §23).
- **Propensity and identity fields from day one**: `policy_version`, `plan_id`,
  `actions_taken[]` with `action_propensity` (all `1.0` under the deterministic V0 plan — the
  *field* is what cannot be added later), `forced_exploration` boolean, `mixing_arm` (null),
  `pipeline_version`.
- **Forced-exploration sampler**, live at 100% (the current behaviour), with the fraction as
  config. Installing the mechanism while the fraction is trivially 1.0 is what makes it survivable
  when the fraction later drops to 0.02–0.05.

**Affected**
`supabase/functions/ai-tutor/index.ts` (`runJudge`, `runL3ShadowPipeline`); one new migration;
one new test suite; no frontend; no student-visible change.

**Risks**
- One extra background model call per math item. Priced automatically by `ai_model_calls`; the
  spend is visible on the economics dashboard from the first day.
- The blind judge's verdict distribution will differ materially from the legacy one. That is the
  point — but it means the AI Monitor's verdict panel must keep reading the legacy field until an
  explicit cutover.
- Edge Function CPU/wall budget in `waitUntil()` tightens. Measure `pipeline_latency_ms`, which is
  already recorded.

**Dependencies** None. This phase is unblocked today.

**Exit criteria**
- A `verification_decisions` row for 100% of shadow runs, for 14 consecutive days.
- Blind and legacy verdicts both recorded for ≥14 days, with the **2×2 agreement matrix published**
  in a release report. If the two verdicts agree on ≥95% of items, that is itself a finding worth
  recording, because v2 §7.3 predicts they should not.
- `forced_exploration` and `action_propensity` present and non-null on every row.
- No change to any existing column, key, or dashboard panel.

---

### Phase V1 — Extract the pipeline into a shared, testable core

**Objective:** make the Edge Function survivable before anything is added to it. This phase changes
no behaviour whatsoever.

The repository already solved this problem once. `taxonomy.core.js` is authored in one place, synced
by `scripts/sync-taxonomy.mjs` to both `taxonomy.js` and `supabase/functions/_shared/taxonomy.core.js`,
and CI fails on drift. `DEPLOY.md` confirms the multi-file bundle path has been in production since
v83. **That pattern is the entire escape route from Fact 2, and it is already proven.**

**Objectives**
- Move the L3 pipeline — solvers, judge, OCR check, normalisation, agreement, meta assembly — into
  `supabase/functions/_shared/verification.core.js`, as a mechanical, byte-equivalent extraction.
- Add a test suite that executes the extracted module directly (the `tests/_source.mjs` machinery
  already does exactly this for shipped bytes).
- Establish the **TCB directory** and the line-budget CI gate that Law 1(a) requires, in the idiom
  of `repo-integrity.test.mjs`.

**Affected** `ai-tutor/index.ts` (shrinks by ~700 lines), new `_shared/verification.core.js`,
`scripts/` sync + validator, `tests/`.

**Risks**
- **This is a deploy-path risk, not a logic risk.** The bundle gains a file. `DEPLOY.md` requires
  Path B (CLI) and a post-deploy check that the bundle lists every file. That check must be run and
  recorded.
- Refactor drift. Mitigation: the extraction is behaviour-preserving and the new suite runs against
  the real bytes on both sides.

**Dependencies** V0 should land first so the extraction moves settled code, not code about to change.

**Exit criteria**
- `ai-tutor` deployed via Path B; `get_edge_function` confirms every bundle file present.
- Smoke test per `DEPLOY.md §6` green.
- Byte-level equality of pipeline outputs against a captured pre-refactor sample.
- TCB line budget published and gated in CI.

---

### Phase V2 — The Label Factory, and the first ground truth

**This is the critical path, and v2 under-weights it.** §10.4 is listed as an Assurance Plane
subsystem, but *every* downstream number — `μ`, `α_ledger`, `ρ`, calibration, the audit, the risk
model, IR faithfulness — is gated on labels, and Si Math has none. Nothing about the CERTIFIED tier
can be *stated*, let alone claimed, until this exists.

**Objectives**
- `labels` schema: versioned gold store with per-item provenance, adjudicator ids, consensus flag,
  adjudication date, `label_version`. Frozen versions; cross-version replay comparisons rejected.
- **Legal review before the first item is ingested** (v2 §23). College Board and ACT materials are
  not licensable for commercial test prep; the deliverable is clean-room authored items with
  per-item provenance from item one. This is a gate, not a step.
- Human adjudication queue in `admin.html` — the console already exists and already reads
  `question_records`. Routing rule, SLA, per-adjudication unit cost registered in `cost_engine`
  alongside model spend.
- First tranche: **300–500 items across the top-5 subtopics by measured traffic.** The traffic query
  is available today against `question_records.topic/subtopic` and should be run in the
  investigation document, not guessed.
- Budget ~30% expert non-consensus on the hard tail (v2 §10.4).

**Affected** New migration (labels schema); `admin.html`; no Edge Function change.

**Risks**
- Non-engineering critical path: counsel, authors, adjudicators. It will slip, and everything
  downstream slips with it. This is the strongest argument for starting it in parallel with V0
  rather than after V1.
- Adjudicator disagreement on the tail is not a defect; budgeting for it as one causes schedule
  failure.

**Dependencies** Legal review. Otherwise none.

**Exit criteria**
- ≥300 double-marked items with provenance, in a frozen `label_version`.
- Adjudication queue serving a real human loop, with measured throughput and cost per adjudication.
- **`μ` — the base error rate of the current candidate stream — measured per lesson family and
  published.** This is the number that determines whether any risk target is feasible (v2 §16).
- **The checker's own false-negative rate on the gold set, measured.** v2 §16 and the risk register
  both flag ~38.5% false-negative rates in comparable rule-based verifiers; a high value here
  invalidates every other risk number and must be found before it is depended on.

---

### Phase V3 — The exact-rational trusted core

**Objectives**
- `_shared/exact.core.js`: rational arithmetic over `BigInt` — construction, normalisation, the four
  operations, comparison, exact equality. No dependencies (v2 §8.4 confirms SAT/ACT coordinate
  inputs are small integers or rationals, so bit growth is bounded).
- Replace `parseNumericAnswer`'s float division with exact rational comparison. `answersEquivalent`
  moves from `NUMERIC_TOLERANCE` to `EXACT`. **`solver_agreement` becomes a sound quantity.**
- Option-set membership; option-set completeness and pairwise distinctness (the precondition of
  `exhaustion`); answer-form and significant-figure checks as a *surface-form* family separate from
  value equality, per the STACK factoring (v2 §8.6c).
- Exact geometric predicates over ℚ with the squared-distance discipline (§8.4), including exact
  *constructions* — EPECK-class, not EPICK.
- The soundness lattice enforced at the interface: every checker declares its class, the class
  travels with the verdict, and a `Verdict` never carries a score.
- **TCB line count published, hand-reviewed line-by-line, and gated in CI.**

**Affected** New `_shared/exact.core.js` + TCB tests; `verification.core.js` calls it; no schema
change; no student-visible change.

**Risks**
- Scope creep into a general CAS. The counter is the line budget: if the TCB grows past its stated
  bound, the scope is wrong, not the bound.
- Deno/Node/browser `BigInt` parity. Mitigated by running the same bytes in both CI and the Edge
  Function, which the `_shared` pattern already guarantees.

**Dependencies** V1 (the shared-core pattern).

**Exit criteria**
- TCB line count published and under budget; hand-review recorded in the release report.
- Differential test: exact vs legacy `answersEquivalent` over ≥10,000 historical
  `verification_meta.solver_answers` pairs, with every divergence classified by hand. Per the
  function's own fail-closed contract, divergences should only ever be `0 → 1`; any `1 → 0` is a
  latent production bug and is the most valuable thing this phase can find.
- No change to `verification_quality_score`'s formula (only to the soundness of one input), so the
  AI Monitor series stays comparable.

---

### Phase V4 — The Verification IR, narrow scope

**Objectives**
- `_shared/canonical.core.js` — canonical AST, α-renamed variables, deterministic serialisation,
  sorted option set, numeric literals lifted to template slots. **Designed for hashing**, which is a
  stricter spec than designed for cleanliness. Emits `canonical_hash` and `template_hash`.
- `_shared/ir.core.js` — fixed, closed predicate vocabulary; typed sorts; dependency graph; assorter
  map per assertion kind; the `exhaustion` assertion kind.
- **Scope: the top five subtopics by measured traffic, and no others.** Si Math has 33 subtopics
  total, so five is ~15% of the taxonomy — a far better ratio than v2 assumes for a 500-lesson
  platform.
- Intensionality checked *by the trusted checker*, recorded in `Verdict.intensionality_checked`,
  never taken on the producer's word.
- Back-translation check (§6.5) as a Risk Model feature, not a gate.
- **T2 code-execution path**: the "program" is an IR expression evaluated by the exact kernel. This
  collapses the program-of-thought tier and the checker into one build and removes the sandbox
  requirement entirely (§7.1).

**Affected** Two new `_shared` modules; `verification.core.js`; no schema change beyond additive
`verification_meta` keys and decision-log columns.

**Risks**
- **This is the phase most likely to fail, and v2 says so.** The IR faithfulness gap is the top
  entry in the v2 risk register: wrong answers *inside* the tier being marketed.
- Parse-rate collapse on real traffic. The v2 gate applies: **if parse rate on the top five families
  is below 75%, narrow the scope before adding families.**
- `taxonomy.js` is frozen and auto-generated from `taxonomy.core.js`, so the freeze transitively
  freezes the source. **The IR must map to existing subtopic ids only** — see §4.4.

**Dependencies** V2 (faithfulness cannot be judged without human labels), V3 (assertions need a
checker).

**Exit criteria**
- **IR parse rate ≥75%** on the top five families, measured on live shadow traffic.
- **Human-judged IR faithfulness rate measured per family and published.** Not optional
  instrumentation — it is the only number that says whether a CERTIFIED tier would be trustworthy.
- Canonical hash stability: identical items hash identically across ≥3 transcription runs.
- Template-tier hit rate measured (input to V6's cost case).

---

### Phase V5 — Evidence Ledger and the CERTIFIED tier, shadow only

**Objectives**
- `verification_ledger` table implementing `LedgerEntry` (§11), including `conditioning_set`,
  `block_id`, `merge_mode`, `merge_weights_version`, `running_e_process`.
- Bounded-mean betting test over the SHANGRLA assorter reduction — **one generic test, per-assertion
  assorter maps**, so new checkers plug in without touching the Court (§9.1 iii).
- `REFUTED` short-circuit (§9.1 i).
- `α_ledger` **derived from** the product's target `r`, measured `μ` (V2), and coverage — never set
  equal to `r` (§16). The derivation recorded and versioned.
- Risk Model v1: global calibrator with shrunk slice offsets, bridged to the ledger by the
  **calibrated Bayes factor against the segment base rate**, not a p-to-e calibrator (§9.2).
- Truth Engine computing the §9.4 output alphabet **into the decision log only**. Nothing reaches a
  student.
- **`verification_quality_score` keeps being computed and written, unchanged.** It is deprecated by
  evidence, not by fiat: it is retired only when the audit shows the ledger outperforms it.

Per v2 H1.7, in this horizon **the CERTIFIED tier publishes on a single conclusive certificate** and
**the CALIBRATED tier does not publish at all** — averaging dilutes and cannot cross the threshold.
The ledger's first job is therefore not accumulation; it is recording that one certificate settled
the item, and auditing the checker across many items.

**Affected** New migration; `verification.core.js`; `ai-monitor.html` gains a read-only panel.

**Risks**
- Two evidence systems running side by side is genuinely more code and more confusion. It is also
  the only way to change the meaning of "verified" on a live product without a flag day.
- The Bayes-factor bridge is easy to implement wrongly in exactly the way v2's Appendix C names. It
  belongs in the TCB review.

**Dependencies** V2 (calibration needs labels), V3, V4.

**Exit criteria**
- **CERTIFIED-tier coverage measured on the top five families** — the north-star metric — reported
  **only alongside** its risk estimate. Per v2 §18, coverage without risk is not a result.
- `α_ledger` derivation recorded per segment.
- Ledger and legacy quality score compared head-to-head on the gold set; the comparison published.

---

### Phase V6 — Answer Bank and cache

Placed here rather than earlier because it depends on a hash-stable canonicaliser (V4). It is the
dominant cost lever in v2 (§15) and it pays for the phases that follow.

**Objectives** Three lookup tiers — exact hash → template match → near-duplicate confirmed by a
deterministic check before serving. Bank populated offline over the curriculum via the Batch API at
the vendor 50% discount. Cache hit rate onto the same dashboard as accuracy.

**Affected** New migration; new offline pipeline area; `verification.core.js`.

**Risks** Serving a stale or wrong cached answer is a *worse* failure than a fresh wrong answer,
because it is systematic and repeats. The deterministic confirmation before serving is not optional.
Cache invalidation on `label_version` and TCB revision must be designed in, not added.

**Dependencies** V4.

**Exit criteria** Exact + template hit rate measured; cost-per-answered-item published; zero cached
answers served without a deterministic confirmation.

---

### Phase V7 — First student-visible change: the verified badge

**The first phase that touches a student, and the first gated on the documentation pipeline.**

**Objectives**
- CERTIFIED-tier items carry a "verified" indicator with a plain-language explanation of what was
  and was not verified — including the §6.4 semantic gap, disclosed rather than papered over.
- Everything else keeps today's behaviour exactly. **No abstention in this phase** (see §7.4).
- The stratified public claim of §16 published on `trust.html` / `evidence.html` with intervals.

**Affected** `docs/knowledge/graph-data.mjs` **first**, then `knowledge-base.md`, then the public
pages, then `chat.html`. Per `CLAUDE.md`, nothing skips the pipeline, and CI rejects a
half-specified concept.

**Risks**
- **A verified badge is a promise.** Its floor is TCB correctness *plus* IR faithfulness, and v2 §25
  rates the faithfulness gap High/severe. The badge must not ship before V4's faithfulness number
  is measured and inside its stated interval.
- The 2,030-check knowledge-layer CI gate will reject an under-specified concept. Budget for that.

**Dependencies** V5, V6, and V8's audit at least in read-only form.

**Exit criteria** Knowledge graph updated and CI green; claim published with intervals and a method
name; badge coverage and badge risk released as a pair.

---

### Phase V8 — Audit Engine

**Objectives** ALPHA-style predictable estimation; comparison-style assertions against the logged
machine verdict (which is why V0's decision log is what makes the audit affordable — `1/x` rather
than `1/x²`, v2 §4c); per-lesson and per-segment margins `x = r − ê` on the dashboard; **the
escalation branch implemented, not merely documented** — on failure to confirm, that lesson's bank
goes to full human verification and its live traffic routes to the conservative policy.

**Affected** Background worker (pg_cron); `ai-monitor.html`; no Edge Function change.

**Risks** v2 records the RLA port as a bet: no published work applies SHANGRLA to an ML pipeline.
The fallback is the supermartingale machinery that *has* been applied to ML auditing. An audit
without the escalation branch is decoration — that branch is the deliverable.

**Dependencies** V0 (decision log + forced exploration), V2 (labels), V5 (ledger).

**Exit criteria** Audit running continuously against the forced-exploration stream; per-lesson
margin published; **escalation branch exercised at least once in anger, deliberately, on a lesson
chosen for the test.**

---

### Sequencing summary

```
V0 Observation surface  ├──────┤                     unblocked today, ~3 weeks
V2 Label Factory        ├──────────────────────┤     start in parallel; legal is the gate
V1 Shared-core extract      ├────┤                   behaviour-preserving
V3 Exact TCB                   ├──────┤              needs V1
V4 Verification IR                  ├────────────┤   needs V2 + V3 — the hard one
V5 Ledger / CERTIFIED                     ├───────┤  needs V2 + V4
V6 Answer Bank                       ├────────┤      needs V4; pays for the rest
V7 Verified badge  (student-visible)              ├────┤  needs V5 + V6 + knowledge graph
V8 Audit Engine                                ├──────┤  needs V0 + V2 + V5
```

V0 and V2 start together. V2's non-engineering dependencies are the schedule's real risk, and
starting it last would serialise the entire programme behind it.

---

## 4. Repository Risk Assessment

### 4.1 Architectural bottlenecks

**B1 — `ai-tutor/index.ts` is a 4,627-line single point of failure with a restricted deploy path and
no health-check gate.** Two production outages (2026-06-17) came from a truncated deploy of this
file; the inline MCP path is now prohibited outright. Every additional plane placed in this file
raises the probability of the next outage. *Mitigation:* Phase V1's `_shared` extraction, using the
pattern already proven in production by `taxonomy.core.js` since v83.

**B2 — there is no service tier, and creating one is the most expensive move available.** v2 §8.8
mandates CAS execution in a separate service with process isolation, CPU/memory caps, an
independent autoscaling profile and its own SLO. For a team of this size that is a new deployment
target, a new on-call surface, and a new failure mode. §7.1 argues Horizon 1 avoids it entirely.

**B3 — the `EdgeRuntime.waitUntil()` background window is a shared, unmetered budget.** The L3
pipeline already spends four to five model calls there. V0 adds one, V4 adds more. The window has a
platform CPU and wall bound that nothing currently asserts against. *Mitigation:* `pipeline_latency_ms`
is already recorded; add an explicit budget assertion before the window is a problem rather than
after.

### 4.2 Technical debt with direct v2 consequences

**D1 — `verification_quality_score` is v1's rejected Evidence Score, and it is load-bearing on a
live dashboard.** Uncalibrated, hand-weighted, never fit against labels, and 40% of its weight comes
from a solver-agreement number produced by two instances of the same model. It cannot simply be
deleted: `ai-monitor.html:482` and `:1264` render it. *Treatment:* freeze the formula, keep writing
it, add the ledger beside it, retire it only on audit evidence.

**D2 — OCR confidence is a regex heuristic that hard-gates a verdict.** Five regex flags with
hand-picked weights (0.25 structural / 0.15 coarse / 0.20 long-number) produce a number that locks
`judge_verdict` to `ocr_uncertain` below 0.75 (`index.ts:2321`). It has never been calibrated against
anything. v2 §5.2 is explicit that round-trip confirmation **lowers `q̂`, it does not reject** — a
soft signal must not be a gate, and it must reach the ledger only through the Risk Model's single
Bayes factor, never directly.

**D3 — the image is decoded three to four times per item.** Against v2 §5.1's transcribe-once
principle. Worth ~2–3× the vision spend on image items. The code comment says text-only fan-out lost
on accuracy, so the fix is round-trip confirmation first, then re-test — not a revert.

**D4 — no `policy_version` on anything.** Every verification decision ever made is unattributable to
a version of the logic that made it. Fixed in V0; historical data cannot be recovered.

### 4.3 Hidden coupling

**C1 — `ai-monitor.html` is a live, undeclared consumer of `verification_meta`'s internal shape.**
It reads `pipeline_version`, `verification_quality_score`, `v2_tier`, `reasons`, `tier`,
`pipeline_latency_ms`, plus four columns. The Phase 0 audit correctly found zero consumers *at the
time*; the dashboard was built afterwards. **The Phase 0 conclusion is stale and must not be
re-used.** *Mitigation:* `verification_meta` is append-only from now on, and the dashboard's existing
version-skew handling is the compatibility contract.

**C2 — `question_records` couples student PII to verification telemetry.** One row holds `question`,
`image`, `user_id`, `ai_response`, and now nine verification columns plus a trace blob. v2 §11's
retention split and §23's compliance boundary require the opposite: a small, identifier-free,
image-free decision log retained permanently, and a sampled, TTL'd, separately-consented trace
store. **Every day this stands, the eventual separation gets more expensive**, because it becomes a
migration over student data rather than a new table.

**C3 — `taxonomy.js` is frozen *and* auto-generated, which transitively freezes `taxonomy.core.js`.**
Editing the authored source regenerates a frozen file. Any IR work that would need a new subtopic is
therefore blocked on an explicit unfreeze. *Mitigation:* scope the Horizon-1 IR to the existing 33
subtopic ids. If that proves impossible, the unfreeze is a decision to take deliberately and in
advance, not to discover mid-phase.

**C4 — `_shared/` files are deploy-coupled to the Edge Function bundle.** Adding a module to
`_shared` changes the bundle and forbids the Dashboard copy-paste path. Already true since v83 and
already documented, but every phase that adds a module must run the post-deploy bundle verification.

### 4.4 Scalability risks

- **Storage.** `verification_meta` caps at ~4 KB (Phase 0 §3) and holds solver reasonings and raw
  outputs. Against v2 §24's 50–200 KB traces reaching terabytes per month, the current cap is
  conservative — but it is on the *wrong table*, which is C2.
- **The reliability-table combinatorial trap is much smaller here than v2 assumes.** v2 §24 warns
  about 500 lessons × 5 solvers × 8 checkers. Si Math has **33 subtopics**. 33 × 4 difficulty bins ×
  a handful of solvers is a few hundred cells, not tens of thousands. See §7.5.
- **Human adjudication does not scale and is not meant to.** It is the label factory and the only
  decorrelated evidence source. Its throughput sets the pace of V2, V4 and V8, and it should be
  planned as a fixed-rate resource rather than an elastic one.

### 4.5 Components that should NOT be rewritten

| Component | Why it stays |
|---|---|
| **`ai_model_calls` + `cost_engine`** | Already exceeds v2 §9.5. Idempotent per-call identity, dual clocks, dated versioned rate cards, and a `price_confidence` discriminator v2 does not even ask for. The Budget Governor's money arithmetic is **done**. |
| **`taxonomy.core.js` + the sync/validate pattern** | The single-source-with-CI-drift-gate pattern is exactly the discipline the TCB needs. Copy it; do not disturb it. |
| **`tests/_source.mjs`** | Executes the real shipped bytes instead of paraphrasing them. This is what will make a hand-reviewable trusted core actually verifiable. |
| **`normalizeFinalAnswer` / `answersEquivalent`** | Correct instinct, fail-closed contract, wrong soundness class. Upgrade the arithmetic underneath; keep the interface and the contract. |
| **The `EdgeRuntime.waitUntil()` shadow architecture** | Zero student latency for arbitrary verification depth. This is a genuinely good decision and the whole migration depends on it. |
| **The vacuity-audit discipline** | "A green check is only evidence if it could have gone red" is the audit culture Law 4 requires, already in place. |
| **The dependency-free, build-step-free constraint** | It is why the same bytes run in CI, Deno, and the browser. Introducing a bundler to get a math library would cost more than writing the kernel — and `BigInt` is native. |

### 4.6 Components that should remain frozen, and until when

| Frozen | Until |
|---|---|
| `regenerate-reports.js`, `exam-mistakes-logger.js`, `mock-exam.html`, `weakness.html`, `focus.html` | Indefinitely. None is on the verification path. |
| `taxonomy.js` / `taxonomy.core.js` | Through V4 at least. If the IR needs new subtopics, unfreeze deliberately and in advance (C3). |
| The public documentation layer | Until V7. Phases V0–V6 are invisible to students and must not touch it. |
| `verification_quality_score`'s formula | Until the audit (V8) shows the ledger outperforms it on the gold set. Freezing it is what keeps the AI Monitor's historical series comparable. |
| The `question_records` verification columns | Permanently, as a compatibility surface. New state goes to new tables. |

---

## 5. Implementation Priorities

Ordered by engineering ROI — value delivered per unit of risk and effort, given what is already
built.

### Build immediately

**1. Answer-blind judging (V0).** A prompt-ordering change against a measured false-positive rate of
0.719 vs 0.012. It is the cheapest correctness win available anywhere in the repository, and every
day it is not made produces more shadow data that cannot be used to fit anything. *This is the
single highest-ROI item in the document.*

**2. Propensity logging and forced exploration (V0).** Not because they are useful now — they are
not — but because they are **free today and impossible later**. The pipeline currently has no early
exit, so it already verifies beyond sufficiency on 100% of traffic. Installing P7's machinery while
its cost is zero is a timing advantage that expires the moment a Decision Policy ships.

**3. The decision log with the two-store split (V0).** A compliance boundary, not an optimisation
(v2 §23). It is a new table today; it becomes a migration over student PII later.

**4. Start the Label Factory and legal review (V2).** Longest lead time, hardest non-engineering
dependencies, and everything downstream is gated on it. Starting it last would serialise the
programme behind it.

**5. The `μ` and checker-false-negative measurements (V2).** v2 §16 is unambiguous: a ground-truth
channel with a high false-negative rate makes any risk target *unmeasurable*. Comparable rule-based
verifiers have been measured at 38.5%. Find this number before depending on anything built on top
of it.

**6. The `_shared` extraction (V1).** Not a feature. It is the precondition for adding features
without raising outage probability on a function that has already caused two.

### Build after L3 Shadow is decorrelated and instrumented

**7. The exact-rational TCB (V3).** Small, dependency-free, high-confidence, and it converts the
repository's only checker from `NUMERIC_TOLERANCE` to `EXACT`. It is also the T2 evaluator, so it is
paid for twice.

**8. The T2 code-execution path (V4).** The only cheap decorrelation available. v2 §7.2 reports a
published CoT-vs-PoT cascade reaching GPT-4-comparable performance at ~40% of the cost. Because the
IR evaluator *is* the checker, this tier costs almost nothing beyond V3 and V4.

**9. `ρ` measurement.** v2 H1.5 calls this "the cheapest way to de-risk the entire programme" and
schedules it at month 3. **It cannot be run today**: both producers are the same model at two
temperatures, so there is no pair to correlate, and it needs ground truth that does not exist. It
becomes possible only after V2 (labels) and a genuinely different second producer (V4's T2 or a T3
vendor). Sequence it accordingly rather than treating month 3 as achievable.

**10. The Verification IR, five families (V4).** The largest single build and the highest-consequence
risk. It is what makes a CERTIFIED tier possible at all, and it is where Si Math's real errors will
live.

### Build after production stabilisation

**11. Answer Bank and cache (V6).** The dominant cost lever, deliberately *not* first — a cache keyed
on an unstable canonical form is a systematic-error amplifier, and canonical stability is a V4
output.

**12. Evidence Ledger and Truth Engine (V5).** Cannot precede labels, and cannot precede certificates
that produce conclusive verdicts.

**13. Audit Engine (V8).** Requires forced exploration to have been running long enough to have a
sample, and labels to compare against.

**14. Abstention and the ill-posedness alphabet.** A *product* change, sequenced separately from any
verification milestone (§7.4).

**15. Streaming / time-to-first-useful-output.** Only becomes load-bearing when verification gates
publication. Until then it is a solution to a problem the shadow architecture already solves.

### Long-term research only

**16. The Legibility Contract (v2 §14).** The real differentiator, and correctly placed in Horizon 2.
It needs certificates to translate from, which means it cannot start before V4/V5.

**17. Ball arithmetic, SMT with checked proofs, Lean certificates, sum-of-squares.** All require a
service tier (B2) and all are bets with kill criteria in v2 §20. None is a dependency of anything in
Horizon 1.

**18. BMDP decision policy with offline λ.** Requires a propensity log with a floor, usable OPE, and
segment definitions. The V0 log is what makes it *evaluable* later; building the policy before the
log has data would be building it blind.

**19. Multidimensional IRT.** See §7.5 — at 33 subtopics the case for it is materially weaker than
v2 assumes.

**20. Checkability-aware training of a tier-1 solver.** Explicitly gated in v2 §H3.5 on the IR being
intensional and adversarially tested first. Not before that.

---

## 6. Reality Check

### What is realistically implementable in the next 12 months

With the caveat that the binding constraint is **human adjudication throughput and legal review**,
not engineering capacity:

- **V0, V1, V3 — high confidence.** Roughly three months of engineering. All are small, additive,
  well-understood, and fit the repository's existing patterns exactly.
- **V2, first tranche — likely, with real schedule risk.** 300–500 double-marked items is
  achievable; 2,000 clean-room authored items (v2 H1.6) in twelve months is not, unless authoring is
  resourced as a separate workstream with its own budget.
- **V4 at reduced scope — plausible.** Two to three lesson families, not five. v2's own gate
  (parse rate ≥75% or narrow the scope) makes reduced scope the *expected* outcome rather than a
  failure. Committing to five families up front is the more likely way to miss.
- **V5 in shadow — plausible.** Ledger, e-process, and `α_ledger` derivation recorded to the decision
  log only. Publishing on it is not a twelve-month item.
- **V6 exact + template tiers — plausible**, and the strongest candidate for pulling forward if cost
  pressure arrives, since it is the one item that pays for the rest.
- **V7 — possible at the end of the window, and it should not be forced.** A verified badge is a
  promise whose floor is IR faithfulness, and faithfulness will still be a young number at month
  twelve.

**Honest expected twelve-month position:** a repository where every verification decision is logged
with propensities to an identifier-free store; where the judge is answer-blind; where a small,
hand-reviewed exact-rational trusted core settles option-set, substitution and exhaustion assertions
on two or three lesson families; where a few hundred gold-labelled items exist and `μ` is known;
and where the CERTIFIED tier is *measured in shadow* rather than shipped. That is a strong year. It
is materially less than v2's Horizon 1 acceptance table, and the gap is almost entirely the label
supply.

### What is 2–3 year engineering work

- The IR across all major lesson families, with faithfulness holding as coverage grows. v2's own
  pairing rule makes this harder than it sounds: **every coverage gain enlarges the surface on which
  faithfulness can fail, and none reduces it.**
- Conditional filtration (§13) and the CALIBRATED tier going live. This is the phase where total
  coverage actually moves, and it cannot precede a fitted conditional betting strategy per source.
- The Legibility Contract. The genuine differentiator, and genuinely multi-year.
- The BMDP decision policy with per-segment feasibility checks.
- A certification service tier, once ball arithmetic or SMT is actually needed.
- The 2,000-item clean-room gold benchmark with per-item provenance.
- Replay and OPE with doubly-robust cross-fitted estimation.
- Streaming TTFUO with designed retraction UX — the moment verification gates publication, this
  becomes a first-order product surface.

### What remains a research project rather than an engineering task

- **Diagram understanding.** v2 §H3.4 is right to make it a watch item with no kill criterion. The
  best published parser has a 72.8% perfect-parsing rate — one diagram in four misparsed. The
  interim policy (explicit extraction, abstain when uncertain, route high-value items to humans) is
  the *permanent* policy until parse rates clear ~95%.
- **Lean-checked certificates**, even for the final algebraic claim only. Compile rates of 11.4–24.2%
  per prediction and $6.89/statement through an expert-verified funnel are research economics.
- **Sum-of-squares certificates.** Pre-release, v0.1.0, not in Mathlib, blocked upstream.
- **Checkability-aware training.** Measured shortcut rates of 33% and 74% against extensional
  verifiers make this dangerous before the IR is provably intensional.
- **Item authoring from a verified formal core** (§H3.7). Possibly the highest-value Horizon-3 item —
  it solves provenance and correctness with one mechanism — and still research.
- **The RLA cross-domain port itself.** v2 records it as a bet, and it is. The fallback is the
  supermartingale machinery that has been applied to ML auditing.

### What to postpone even though it is architecturally elegant

**1. The full soundness lattice, all six classes, before any checker exists.** Horizon 1 needs
`EXACT` and `MODEL_OPINION`. `CERTIFIED_ENCLOSURE` needs ball arithmetic that needs a service tier;
`RANDOMIZED_EXACT` needs the independent-repetition discipline; `CHECKED_PROOF` needs cvc5. Build
the two classes that carry Horizon 1's weight and leave the enum extensible. The lattice is elegant;
four-sixths of it is dead code for eighteen months.

**2. Conditional filtration (§13) before `ρ` is measured.** It is the most intellectually satisfying
idea in v2 and it prices correlation instead of assuming it away. It is also only worth its cost if
`ρ` is high on *Si Math's* traffic — which no one knows, because no published number exists for
curriculum-level math items. Measure first. v2 agrees; the temptation to build it early is the risk.

**3. Multidimensional IRT (§10.2).** See §7.5. At 33 subtopics the hierarchical Beta-Binomial that
v2 itself nominates as the Horizon-1 fallback may be sufficient permanently.

**4. The per-segment BMDP with the mixing coin.** Elegant, well-founded, and it optimises a cost
frontier that does not bind yet — because with 33 subtopics, no early exit, and background
execution, Si Math's verification spend is small and its latency is zero. Optimise it when it binds.

**5. Abstention as a Horizon-1 deliverable.** v2 treats abstention as arriving with the ledger. For
a live product with a paying cohort that today receives an answer for every question, withdrawing
answers is a product regression that must be earned. Ship the badge first (additive), then abstain
where the evidence genuinely does not support an answer (subtractive), on its own timeline with its
own evidence.

**6. The ill-posedness alphabet's full six-way recovery UX.** The *detection* is valuable
immediately; six distinct student-facing flows in `chat.html` is a large front-end build against
unmeasured frequencies. Detect and log all six from V0; build the flows in frequency order once the
distribution is known.

---

## 7. Amendments proposed to v2

Six places where engineering reality argues for changing the specification. Everything else in v2 is
preserved as written.

**7.1 — The Certification Plane does not need a separate service in Horizon 1.**
v2 §8.8 mandates a separate service tier because SymPy is CPython, has no internal timeout, and can
hang on ordinary input. That reasoning is correct **for SymPy** and does not transfer. Horizon 1's
checkers — option-set membership, substitution, exhaustion, exact geometric predicates over ℚ,
polynomial identity testing — need exact rational arithmetic and a fixed predicate vocabulary. They
do not need a CAS. `BigInt` is native to Deno, Node and the browser; the kernel is a few hundred
dependency-free lines; and v2 §8.4 itself notes SAT/ACT coordinates are small integers or rationals
with bounded bit growth and "no performance argument for floating point at all."
*Recommendation:* build the Horizon-1 Certification Plane as a `_shared` module inside the existing
bundle, using the proven `taxonomy.core.js` pattern. Defer the service tier to whenever ball
arithmetic or SMT is genuinely required. **This removes the single most expensive infrastructure
item from Horizon 1 and is the largest schedule saving in this document.**

**7.2 — T2 and the checker are the same build.**
v2 §7.2 treats the code-execution path as a Hypothesis Plane tier and §8 treats checkers separately.
If T2's "program" is an expression in the Verification IR evaluated by the exact kernel, the two
collapse into one artefact. This buys representational decorrelation *and* an executable witness at
almost no marginal cost, and it eliminates the code-sandbox requirement — which for a Deno Edge
Function would otherwise be a blocker.

**7.3 — the Label Factory is a Horizon-1 critical-path item, not an Assurance Plane subsystem.**
v2 §10.4 sits inside the offline plane and H1.6 schedules the gold benchmark at months 3–8. But
`μ`, `α_ledger`, `ρ`, calibration, IR faithfulness and the audit are all gated on labels, and v2's
own §16 states that a ground-truth channel with a high false-negative rate makes the risk target
unmeasurable. *Recommendation:* promote label production to the first workstream started, in
parallel with the observation surface. It has the longest lead time and the hardest non-engineering
dependencies.

**7.4 — abstention is a product decision sequenced separately from the ledger.**
v2 H1.7 has the Truth Engine, the output alphabet, and the abstention UI arriving together. Si Math
has a live paying cohort that receives an answer for every question. *Recommendation:* split them.
The Truth Engine computes the full alphabet into the decision log from V5 (invisible). The badge
ships in V7 (additive). Abstention ships later, on its own evidence, with its own product decision.
v2's philosophy is preserved — abstention remains first-class and never a failure — but the
*sequencing* respects a system that is already live.

**7.5 — multidimensional IRT is weaker here than v2 assumes, because Si Math has 33 lessons.**
v2 §10.2 and §24 build the case on a 500-lesson platform where per-cell tables produce ~183 spurious
"100.00%" cells and the reliability table is a combinatorial trap. Si Math's taxonomy is 5 topics
and **33 subtopics**. At 33 × 4 difficulty bins the table is a few hundred cells, and v2's own
binding objection to IRT applies with full force here — *persons are solvers*, published IRT-for-LLM
work used 90 to 395 subjects, and Si Math will have a handful. *Recommendation:* adopt hierarchical
Beta-Binomial (v2's own Horizon-1 fallback) as the **default**, and move IRT to Horizon 3 as a
research item with an explicit trigger: only if the taxonomy grows past ~150 lessons, or if
per-subtopic shrinkage is measurably mis-ranking solvers.

**7.6 — record forced exploration's timing advantage explicitly.**
v2 §10.7 correctly identifies P7 as the defence against a self-confirming loop and names its removal
as the risk to watch. What it does not say is that **the cheapest moment to install it is before a
decision policy exists.** Si Math is in that moment right now: with no early exit, the effective
exploration fraction is 100% and installing the machinery costs nothing. *Recommendation:* add to
v2 §10.7 that P7's mechanism ships before the first escalation policy, not alongside it.

---

## 8. What this document does not decide

- **Whether to proceed.** This is a blueprint, not an approval. Per `CLAUDE.md`, each migration is
  approved individually and no schema change is prepared here.
- **The top five lesson families.** The traffic query against `question_records.topic/subtopic` is
  available and should be run in V4's investigation document. Guessing it here would be exactly the
  kind of unmeasured assumption this architecture exists to eliminate.
- **The target selective risk `r`.** v2 §16 is explicit: set `r` from the product commitment, then
  derive `α_ledger` from measured `μ` and coverage — never the reverse. `μ` is unknown until V2.
- **Whether human adjudication is a real channel today.** `trust.html` and `ai-knowledge.html`
  reference human support. Whether that is a staffed, routable queue or a product claim determines
  whether T4 is an integration or a build, and it should be answered before V2 is scoped.

---

## 9. The question that gates all of it

`CLAUDE.md` states the gate for every feature:

> **"Will this genuinely help students learn better?"**

For this programme the answer is yes, and specifically: a student who is told *"this one is fully
verified"*, *"this is our best answer and here is our confidence"*, or *"this is going to a human
tutor"* — and for whom those three statements are **true and audited** — learns better than a
student handed a confident answer of unknown quality. That is the whole product thesis, and it is
what the CERTIFIED tier buys.

The corollary is the discipline that makes the roadmap honest: **a verified badge on an unfaithful
assertion is worse than no badge at all.** It is the one failure mode that damages the thing being
sold. Which is why coverage and risk are released as a pair, every time, and why V7 does not ship
until V4's faithfulness number exists and holds.
