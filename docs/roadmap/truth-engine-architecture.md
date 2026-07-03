# Truth Engine — Architecture RFC

**Status:** Architecture RFC. Design only. No implementation, no code, no schema applied, no deployment, no change to `ai-tutor`.
**Purpose:** Define the orchestration + decision layer (the "Truth Engine") *before* any individual verifier is built. This is the foundation every verifier plugs into.
**Builds on:** `truth-system-rfc-review.md` (the review + the two settled decisions), `adaptive-verification.md` (L1–L4 + isolation), `phase-0-verification.md` (the nullable `question_records` columns), `ARCHITECTURE_SNAPSHOT_CHAT_WEAKNESS_FOCUS.md` (the frozen Analyzer/Focus subsystem), `kdg-*` (Knowledge × Representation axes).
**Non-goals:** No verifier logic (Random Point, CAS, geometry, etc. are out of scope here — they come *after* this is finalized). No behavior change to the live answer path.

---

## 0. The one-paragraph mental model

**The Truth Engine owns no verification logic.** It is a pure *policy + evidence-combination + calibration* layer. Verifiers are pluggable strategies behind one uniform interface; they produce **evidence** and know nothing about each other, about publishing, or about the student. The engine reads each verifier's *declared metadata* (what evidence type it emits, what it costs, whether it applies) and its *EvidenceClaim* outputs, combines them through an **Evidence Lattice** (a partial order by epistemic strength — never an additive score), looks up a **calibrated probability of correctness**, and emits a single **Verdict**: verified / corroborated / unverified-publish / abstain / rejected. This mirrors the codebase's existing discipline — single-producer/pure-consumer, SSOT, determinism, shadow-first, additive schema, taxonomy-as-authority — so the engine reads as a native Si Math component, not a foreign architecture.

---

## 1. Overall architecture

### 1.1 The four layers (strict dependency direction, top depends on bottom)

```
┌──────────────────────────────────────────────────────────────────────┐
│  DELIVERY            AI Tutor (Zero) · inline lane · async lane        │
│                      publishes / abstains / post-corrects              │
└───────────────────────────────▲──────────────────────────────────────┘
                                 │ Verdict
┌───────────────────────────────┴──────────────────────────────────────┐
│  POLICY (Truth Engine core)                                            │
│    Planner → Evidence Loop → Decider        Cost Engine (advisory)     │
│    "which verifiers, in what order, when to stop, publish/abstain"     │
└──────────▲───────────────────────────────────────────▲───────────────┘
           │ EvidenceClaim[]                            │ P(correct)
┌──────────┴───────────────┐                 ┌──────────┴───────────────┐
│  MECHANISM (Verifiers)   │                 │  EMPIRICS                 │
│   behind ONE interface    │                 │  Evidence Lattice (pure) │
│   InputIntegrity, Solvers │                 │  Calibration Store       │
│   RandomPoint, CAS, …     │                 │  Trust Memory            │
│   (each emits evidence)   │                 │  (learned from benchmark)│
└───────────────────────────┘                 └──────────────────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    │  LEDGER (durable trace)  │
                    │  verification_meta ·      │
                    │  Failure DNA · Replay     │
                    └──────────────────────────┘
```

**The load-bearing boundary:** POLICY never imports MECHANISM. The Decider is written against `EvidenceClaim` + verifier *declarations*, never against a concrete verifier. That single rule is what makes §11 (extensibility) true: a new verifier is a new registry row + calibration data, never an engine edit.

### 1.2 Three inviolable separations

| Concern | Owned by | Must NOT |
|---|---|---|
| *Produce* evidence | Verifiers | decide to publish; read another verifier; write the ledger |
| *Decide* on evidence | Truth Engine core | contain math/verification logic; know how any verifier works internally |
| *Quantify* trust | Calibration Store / Trust Memory | be hand-tuned; be fit from the system's own verdicts (only from ground truth) |

This is the same "single producer / pure consumers" instinct the frozen Analyzer subsystem already enforces — applied to verification.

---

## 2. Components and responsibilities

Ten components, each single-responsibility (mirroring `regenerate-reports.js` being the sole producer of its fields):

| # | Component | Responsibility | Reads | Writes |
|---|---|---|---|---|
| 1 | **Verifier Registry** | Holds each verifier's static declaration (evidence type, cost/latency class, lane eligibility, applicability predicate, polarity semantics, version). | — | — (config) |
| 2 | **Planner** | Pure function `(context) → ordered candidate verifier steps`. Encodes "which methods, in what order" for this lesson/difficulty/representation/checkability. | Registry, context | — |
| 3 | **Verifier Runtime (Adapter)** | Executes one verifier (sync inline or enqueue async), enforces its timeout/budget, normalizes output to an `EvidenceClaim`, captures actual cost/latency. **Isolation boundary:** any verifier fault becomes an `INCONCLUSIVE` claim — never an engine failure. | Verifier | Ledger (trace) |
| 4 | **Evidence Lattice (Combiner)** | Pure function `EvidenceClaim[] → combined evidence state + strongest-consistent tier`. No calibration, no side effects, deterministic. | claims | — |
| 5 | **Calibration Store + Trust Memory** | Maps `(evidence pattern, lesson, difficulty) → P(correct)`; supplies per-(lesson×verifier) reliability priors. The empirical layer. | Ledger, benchmark labels | its own store |
| 6 | **Truth Engine Core (Decider)** | The policy loop: `sufficient()?` (stop), escalation control, `decide()` (Verdict). The *only* component that publishes/abstains/escalates. Thin. | 2,4,5,7 | Verdict |
| 7 | **Cost Engine** | Advisory: estimates expected evidence gain vs. cost/latency for the next step. Day-1 a static policy table; later a learned VoI model. | Trust Memory, context | — |
| 8 | **Async Orchestrator + Job Queue** | Durable async lane; runs deep verifiers beyond the edge invocation; emits **post-corrections**. | job queue | Ledger, post-correction |
| 9 | **Evidence Ledger** | Durable, PII-conscious trace: full evidence bundle → `verification_meta`, Failure DNA, Trust Memory deltas, Replay substrate. The write side. | Verdict, claims | its own store |
| 10 | **Outcome / Feedback Ingest** | Closes the loop: when *ground truth* arrives (benchmark label; later human audit), updates Calibration + Trust Memory. **Never auto-labels from the engine's own verdicts.** | labels | Calibration store |

Notice what is **not** a component: there is no "Court," no "Truth Budget service," no per-phase object. The RFC's Phases 5/6/10/11/12 collapse into components 4, 5, 6, and 7 — the sixteen phases were three ideas renamed (see the prior review §0).

---

## 3. Verification lifecycle

A single request's journey as a state machine. Terminal states are **bold**.

```
INTAKE
  │  (question, candidate answer from Zero, context)
  ▼
CANONICALIZE ───────────────► [context: lesson_id, representation, difficulty,
  │  taxonomy-normalized        answer_type, checkability, stakes, lane]
  ▼
INPUT-INTEGRITY GATE ── refutes ─►  **ABSTAIN (corrupt_input)**
  │  (always runs, cheap)
  ▼
PLAN  ── (Planner: ordered verifier steps for this context)
  ▼
┌────────── EVIDENCE LOOP ───────────────────────────────┐
│  next step? ── none ─────────────────────────────► DECIDE│
│     │                                                    │
│     ▼  CostEngine.worth_running?  ── no ─► skip step ───┘
│     │ yes
│     ▼
│  RUN verifier → EvidenceClaim → append to bundle
│     │
│     ├─ deterministic REFUTE ───────────────► **REJECTED**
│     │                                         (candidate provably wrong)
│     ▼
│  Combine bundle → sufficient()? ── yes ──► DECIDE
│     │ no
│     └──────────────► (loop)
└──────────────────────────────────────────────────────────┘
  ▼
DECIDE  (Lattice join → strongest consistent tier → Calibration lookup → Verdict)
  │
  ├─ **VERIFIED**            (deterministic/formal support ≥ calibrated threshold)
  ├─ **CORROBORATED**        (independent consensus ≥ threshold, no det. check possible)
  ├─ **UNVERIFIED_PUBLISH**  (below corroboration, above abstain floor → honest label)
  └─ **ABSTAIN**             (below floor, no affordable escalation)
  ▼
LEDGER WRITE  (bundle → verification_meta + Failure DNA; Trust Memory delta staged)
  ▼
[async worthwhile?] ─ yes ─► ENQUEUE ASYNC ─► … ─► POST-CORRECTION (may supersede)
  ▼
[later] OUTCOME INGEST (ground-truth label arrives) ─► update Calibration + Trust Memory
```

Two properties to note:
- **The loop, not a fixed sequence.** Per the settled evidence-driven decision, the engine expands only as far as evidence is insufficient. Easy + deterministic-support terminates after one or two steps.
- **REJECTED is a first-class outcome.** A deterministic counterexample (e.g., substituting the candidate root fails the equation) *proves* wrongness. That must beat any amount of solver agreement and route back to re-solve — it is not "low confidence," it is "wrong."

---

## 4. Evidence model (the core)

This is the intellectual center. The prior review's #1 critique — *agreement is not evidence, and evidence types are incommensurable* — is encoded here structurally.

### 4.1 The EvidenceClaim (what every verifier returns)

| Field | Meaning |
|---|---|
| `verifier_id`, `verifier_version` | provenance (Trust Memory keys on this) |
| `evidence_type` | which **lattice tier** this claim belongs to |
| `polarity` | `SUPPORTS` \| `REFUTES` \| `INCONCLUSIVE` \| `ABSTAINS` (verifier declined / not applicable) |
| `target` | the exact candidate answer evaluated (normalized) |
| `strength` | *within-tier* strength — optional `[0,1]`; NOT comparable across tiers |
| `determinism` | `DETERMINISTIC` \| `STOCHASTIC` |
| `rationale` | structured trace (counterexample point, failing step, sub-result) → feeds Failure DNA |
| `cost_actual`, `latency_actual` | measured, for Cost Engine learning |

### 4.2 The Evidence Lattice (a partial order, never a sum)

Evidence **types** are ranked by epistemic strength. Higher tiers *dominate* lower tiers; tiers are **never averaged**.

```
Tier 0  FORMAL_PROOF            machine-checked (Lean/Coq)          dispositive
Tier 1  DETERMINISTIC_CHECK     substitute-back, random-point,      near-dispositive
                                CAS equivalence, stats recompute    (see 4.3 asymmetry)
Tier 2  CROSS_PROVIDER_CONSENSUS independent models agree           strong corroboration
Tier 3  SAME_MODEL_CONSENSUS    self-consistency / temperature      weak corroboration
Tier 4  SINGLE_MODEL_CONFIDENCE one solver's self-report            prior only
```

Two things sit **outside** the tier order (they are not standalone evidence):
- **INPUT_INTEGRITY** — a *gate*. If it refutes, the target is invalid and every tier below is meaningless (you cannot verify a corrupted question). Always evaluated first.
- **HISTORICAL_RELIABILITY (Trust Memory)** — a *prior/weight modifier* on the calibration lookup, never a claim that stands alone.

### 4.3 The confirm/refute asymmetry (subtle, critical)

For most deterministic checks, **refutation is stronger than confirmation**:
- A random-point evaluation that ever differs → the expressions are **provably unequal** (a counterexample). Dispositive.
- A random-point evaluation that always agrees → **overwhelming evidence** of equality, but not a proof (measure-zero coincidences, domain edge cases).
- Substitute-back that fails → **provably** not a root. Substitute-back that passes → confirms *this* candidate is *a* root, not that it is *the* required/complete answer (extraneous-root and "necessary-not-sufficient" cases).

The lattice therefore stores polarity-aware strength: `REFUTES@Tier1` is treated as proof; `SUPPORTS@Tier1` is treated as strong-but-calibrated. This asymmetry is why the Decider can *reject* on a single deterministic refute but requires calibration before it *publishes* on a deterministic support.

### 4.4 Combination rule (lattice join)

Deterministic, pure, order-independent:

1. **Integrity gate.** Any `INPUT_INTEGRITY.REFUTES` ⇒ evidence state = `INVALID_TARGET` ⇒ ABSTAIN. Stop.
2. **Refutation dominance.** Any `REFUTES` at Tier 0–1 ⇒ evidence state = `REFUTED` ⇒ REJECTED. Stop. (A proof of wrongness outranks all support.)
3. **Highest consistent support.** Take the **strongest tier** with a `SUPPORTS` and no same-tier `REFUTES`. The verdict's *evidence tier* = that tier. Lower-tier claims do **not** raise it and do **not** average into it.
4. **Cross-tier contradiction.** If a lower tier supports but a higher tier is `INCONCLUSIVE` (e.g., consensus says X, deterministic check couldn't run) → the verdict tier is the *consensus* tier, and confidence is calibrated *for that tier* (lower). Consensus never gets promoted to "verified."
5. **Same-model cap.** `SAME_MODEL_CONSENSUS` alone can never satisfy the publish threshold for `hard`/`expert` difficulty — the tier where correlated errors are worst (prior review §2.1). It may support only `easy`/`medium`, and only up to the calibrated ceiling.

### 4.5 From evidence state → confidence

The lattice yields a *state* (tier + polarities), **not** a probability. The probability comes from the Calibration Store (§9): `P(correct | evidence_state, lesson_id, difficulty)`. This is the seam where "structural strength" becomes "empirical trust." An additive Evidence Score is explicitly rejected because it silently makes Tier-3 agreement fungible with Tier-1 proof — the exact error the philosophy warns against.

---

## 5. Orchestration pipeline

Illustrative **control flow** (not implementation) of the Decider's loop. Every branch names a real decision the engine owns.

```
Decider.verify(question, candidate, context):
    bundle ← []

    # (A) ALWAYS — integrity gate
    ic ← Runtime.run(InputIntegrity, …)
    if ic.polarity = REFUTES:  return Verdict(ABSTAIN, reason=corrupt_input)

    # (B) ALWAYS — canonicalize + plan (both cheap)
    context ← Canonicalizer.enrich(context)          # lesson, difficulty, checkability, lane
    plan    ← Planner.plan(context)                   # ordered, lane-eligible verifier steps

    # (C) EVIDENCE LOOP — expand only while insufficient
    while true:
        state ← Lattice.combine(bundle)
        if TruthEngine.sufficient(state, context):  break
        step ← plan.next(bundle)
        if step = ∅:                                  break     # nothing affordable/applicable left
        if not CostEngine.worth_running(step, state, context):  # advisory; static day-1
            plan.skip(step); continue
        claim ← Runtime.run(step.verifier, question, candidate, context)
        bundle.append(claim)
        if claim.polarity = REFUTES and step.tier ≤ DETERMINISTIC:
            return Verdict(REJECTED, bundle)                    # provably wrong — halt

    # (D) DECIDE — lattice state + calibrated probability → verdict
    state ← Lattice.combine(bundle)
    p     ← Calibration.lookup(state, context.lesson, context.difficulty)
    verdict ← TruthEngine.decide(state, p, context)            # VERIFIED / CORROBORATED / …

    # (E) ASYNC HANDOFF — inline budget spent but escalation still valuable
    if verdict.decision ∈ {CORROBORATED, UNVERIFIED_PUBLISH}
       and AsyncOrchestrator.worthwhile(state, context):
        AsyncOrchestrator.enqueue(question, candidate, context, bundle)

    Ledger.write(verdict, bundle)
    return verdict
```

Three decision points are the whole engine:
- `sufficient(state, context)` — the **stop gate** (§8).
- `worth_running(step, …)` — the **spend gate** (Cost Engine, §9 / prior review §4).
- `decide(state, p, context)` — the **publish gate** (§4.5 + §9 conformal).

---

## 6. The Verifier interface (the extensibility contract)

Every verifier — present and future — implements exactly this. Expressed as a **declarative contract** (design artifact), deliberately language-neutral.

### 6.1 Declaration (static, read once at registration)

| Field | Purpose | Example |
|---|---|---|
| `id`, `version` | identity; Trust Memory & Replay key on it | `random-point`, `v1` |
| `evidence_type` | the lattice tier it emits | `DETERMINISTIC_CHECK` |
| `applicability(context) → bool` | can it run here? gates the Planner | random-point ⇒ true iff answer is expression/function-valued |
| `polarity_semantics` | what SUPPORT vs REFUTE *mean* for this verifier (§4.3) | refute=proof-of-inequality; support=strong-not-proof |
| `determinism` | reproducibility class | `DETERMINISTIC` (with fixed seed) |
| `cost_class`, `latency_class` | Planner ordering + Cost Engine input | `cheap`, `sub-100ms` |
| `lane_eligibility` | `INLINE` \| `ASYNC` \| `BOTH` (§7) | random-point ⇒ `BOTH`; CAS ⇒ `ASYNC` |
| `runtime` | where it executes | `deno-native` \| `wasm` \| `service` |

### 6.2 Execution (the one method)

```
verify(canonical_question, candidate_answer, context, budget) → EvidenceClaim
```

Contract rules the runtime enforces (a verifier that violates any is rejected at registration review):

1. **Pure w.r.t. declared inputs.** No side effects except the returned claim. It does not write the ledger, does not emit signals, does not call another verifier.
2. **Fault-closed.** Any internal error, timeout, or unhandled case ⇒ return `INCONCLUSIVE`, never throw across the boundary. (Mirrors ai-tutor's "detector failures are swallowed — they never affect the answer path.")
3. **Budget-respecting, not budget-owning.** It receives a budget and must honor it; it does *not* decide whether it was worth running (that's the Cost Engine).
4. **Deterministic verifiers are reproducible under frozen inputs** — fixed random seed, no wall-clock, no ambient state. (Mirrors the Analyzer's frozen `runNow` determinism invariant.)
5. **Publishing-blind.** It returns evidence about a candidate; it never sees or influences the publish decision.
6. **Shadow-first.** A newly registered verifier emits claims that the engine *records but does not act on* until its calibration curve is measured on the benchmark (§9, §11). (Mirrors L3-shadow and detector-v2-shadow discipline.)

This contract is the open/closed seam: the engine programs against `EvidenceClaim` + declaration. It has no compile-time or run-time knowledge of any specific verifier.

---

## 7. Sync vs. async execution (one engine, two budgets)

Per settled decision **B (hybrid)**. There is exactly one engine; the lanes differ only by *which verifiers are eligible* and *what budget applies*.

| | **Inline lane** | **Async lane** |
|---|---|---|
| Runs | inside the request (sub-second budget) | background: `EdgeRuntime.waitUntil` + a durable **`verification_jobs`** queue for work exceeding the edge wall-clock |
| Eligible verifiers | `lane_eligibility ∈ {INLINE, BOTH}` — InputIntegrity, deterministic checks, ≤1 fast independent solver | `{ASYNC, BOTH}` — CAS, cross-provider ensemble, judge, deep search |
| Can reach | **VERIFIED**, **REJECTED**, **ABSTAIN**, or hand off | any verdict; may **post-correct** a prior inline publish |
| Publish authority | gates the answer + sets the trust marker | cannot un-show an answer; emits a *correction event* if it contradicts inline |
| Relationship to today | new (small, deterministic) | **is the existing L3 shadow pipeline, promoted** from write-only to post-correcting — so `ai-tutor`'s answer path is untouched |

**Post-correction contract** (the one genuinely new user-facing surface, flagged in the review): the async lane may attach a correction to an already-published answer (*"we double-checked — the answer is actually X"*). It is an **append**, never a silent mutation; the original answer + its inline verdict remain in the ledger for calibration and Replay. Correction is only emitted when the async verdict *dominates* the inline one on the lattice (e.g., async deterministic REFUTE over inline same-model CORROBORATED) — never on a mere confidence wobble.

---

## 8. Escalation policy

Three tiers (the prior review rejected sixteen). Escalation is *pull-based*: the Decider's `sufficient()` predicate pulls the next tier only when the current evidence state is inadequate.

| Tier | Verifiers | Lane | Entry condition | Exit / stop condition |
|---|---|---|---|---|
| **T0 Deterministic** | InputIntegrity + deterministic checks | inline | always | SUPPORT@Tier1 ≥ threshold → publish; REFUTE → reject; not-applicable → fall through |
| **T1 Corroboration** | ≤1 independent (cross-provider) solver + agreement | inline or async | T0 inconclusive or not applicable | independent SUPPORT ≥ calibrated threshold → corroborated |
| **T2 Deep** | CAS, multi-provider ensemble, judge, deep search, formal-proof (far) | async only | T1 below threshold, OR difficulty ∈ {hard, expert}, OR high-stakes, OR bundle contradiction | evidence sufficient, budget spent, or Cost Engine says gain < cost |

### 8.1 The `sufficient()` predicate

`sufficient(state, context)` returns true iff **any** of:
- state = `REFUTED` or `INVALID_TARGET` (a terminal negative is "enough" — stop and reject/abstain), **or**
- state's strongest-consistent tier's calibrated `P(correct) ≥ publish_threshold(context.stakes)`, **or**
- no eligible verifier remains that could change the tier (nothing left to learn affordably).

### 8.2 Asymmetric early-exit (the accuracy guardrail)

The one rule that keeps cost-cutting from hurting accuracy (prior review §4):

- ✅ May early-exit on **deterministic sufficiency** (a passed Tier-1 check).
- ✅ May early-exit on **easy tier + cross-provider (Tier-2) agreement**.
- ❌ **Never** early-exit on **same-model (Tier-3) agreement** — least reliable exactly on hard questions.
- ❌ **Never** skip InputIntegrity or an *applicable* deterministic check to save money — those are the cheap, high-value stages.

In one line: **cost-cut the expensive corroboration, never the cheap verification.**

### 8.3 Abstention policy

Abstain when: input corrupt (integrity gate), **or** evidence below floor AND no affordable escalation remains AND stakes are high. For low-stakes/un-checkable questions, prefer **UNVERIFIED_PUBLISH** (an honest "not independently verified" label) over hard abstain — over-blocking is its own failure mode. This makes "never knowingly publish without sufficient evidence" *true* (the label tells the truth) rather than absolute (which is unachievable for the un-checkable subset without formal proof).

---

## 9. Calibration model

This is what makes a "verified" marker mean something. Without it, every threshold is a guess (prior review §6).

### 9.1 Calibration Store

An empirical map fit on the **gold benchmark** (start 1–2k, stratified by lesson × difficulty) plus accumulated *labeled* outcomes:

```
Calibration:  (evidence_state, lesson_id, difficulty)  →  P(correct)
```

`evidence_state` = the lattice tuple (tier reached, polarities, contributing verifier ids). The store is queried at DECIDE time; it is refreshed offline. **Calibration is data, not code** — refitting it never touches the engine (this is the continuous-learning hook, §11).

### 9.2 Reliability curves (the acceptance test)

For each decision bucket, measure observed accuracy on held-out labeled data. **The contract:** the `VERIFIED` bucket must empirically hit its promised floor (e.g., ≥ 99%) or the marker is a lie and must not ship. This is the gate on going live (TE-3), mirroring `adaptive-verification.md`'s milestone-gating.

### 9.3 Trust Memory (per-lesson × verifier reliability)

The per-`(lesson_id × representation × verifier_version)` slice of the calibration store. Because per-cell counts get thin (33 lessons × representations × verifiers × difficulty), raw frequencies lie. Use **Beta-Binomial shrinkage**:

```
reliability(cell) = (α₀ + successes) / (α₀ + β₀ + trials)      # posterior mean
```

- Thin cells shrink toward the global prior `(α₀,β₀)`; thick cells trust their own data.
- **Keyed by verifier *version*** — a new version starts cold and re-earns trust (mirrors detector-v1 → v2).
- **Keyed by taxonomy lesson id and KDG representation** — so it composes with the Knowledge × Representation axes, not with free-text topic names.

### 9.4 The publish gate — conformal, not hand-tuned

Rather than a hand-set threshold, use **conformal prediction**: given a target error rate α, publish `VERIFIED` only when the calibrated confidence set is a singleton at level 1−α. This gives a *distribution-free coverage guarantee* — a real, tunable error rate — as the backbone for the publish decision. `publish_threshold(stakes)` becomes a conformal α per stakes level, not a magic number.

### 9.5 Feedback-loop guardrail (non-negotiable)

Ground truth for calibration comes **only** from human-labeled data (the benchmark, and later human audits). The engine's own verdicts may grow the *unlabeled* Replay corpus but must **never silently become labels** — otherwise Trust Memory entrenches whatever bias the pipeline started with (prior review §5, Simpson/feedback traps). A held-out, human-audited slice continuously measures calibration drift.

---

## 10. Integration with existing systems

The engine must plug into five existing/emerging systems **without violating their invariants** — especially the frozen single-producer rules.

### 10.1 AI Tutor (`ai-tutor`, live)
- The engine is invoked **after** Zero produces a candidate answer, in the two lanes (§7). It **never** touches Zero's generation, personality, KB retrieval, or hints.
- The **inline lane** may set the trust marker / gate publish; the **async lane** is the promoted L3 shadow pipeline.
- The Verdict **serializes into the existing Phase 0 nullable columns** — no new schema needed for the core path (Appendix A). The engine is a *new writer of already-nullable columns*, exactly the additive contract Phase 0 was designed for.
- Isolation: lives in the `ai-tutor-premium` sibling per `adaptive-verification.md`. Free tier keeps hitting `ai-tutor` unchanged. **`ai-tutor/index.ts` is not modified** — honoring both the freeze and the 55 KB deploy-fragility constraint.

### 10.2 Root Cause Analyzer (`regenerate-reports.js`, **FROZEN**, sole producer)
- **Hard rule:** the engine is **not** a second writer of `weakness_reports` or any Analyzer-owned derived field. That would break the frozen single-producer invariant.
- The engine feeds the Analyzer **only through the signal layer**: it emits new `weakness_signals` rows with a **new `source = 'VERIFICATION'`** and new `signal_type`s (e.g., `verification_refuted`, `solver_disagreement`, `first_divergence_step`). The Analyzer aggregates them exactly as it aggregates `AI_CHAT`/`MOCK_EXAM` signals today.
- The engine **normalizes topic/subtopic via the taxonomy authority before emitting** — mirroring `chat.html` / `exam-mistakes-logger.js`. No unnormalized writes.
- Net effect: a verification-surfaced weakness flows into mastery/severity/trend **without any change to the frozen Analyzer** — it just sees new signals.

### 10.3 Focus Practice (`focus.html`, pure consumer)
- Reached **transitively only**: signals → Analyzer → `weakness_reports` (SSOT) → Focus. The engine **never** writes `focus_plans` / `focus_tasks`.
- Because a verification weakness lands in the reports SSOT, it becomes eligible for dominant-signal focus plans through the *existing* F3 logic — zero coupling, zero Focus change.

### 10.4 Failure DNA (**new, engine-owned**)
- The Evidence Ledger is the **writer**. Each verification that surfaced an error stores a structured record: approximate root cause, first-divergence step (**noisy label** — treat as signal, per review §Phase 3), failing verifier, lesson_id, representation, difficulty, full evidence bundle.
- **PII-conscious** like `analyzer_runs` (aggregate shapes; no raw student text beyond what `question_records` already holds).
- Failure DNA is three things at once: (a) raw material for Trust Memory/calibration, (b) an aggregatable **source of `weakness_signals`** (via 10.2), (c) the substrate for **Truth Replay**.
- Keyed on lesson_id × representation so it composes with KDG.

### 10.5 Learning Timeline (`progress.html` "Achievement Timeline" + `mastery_records` + KDG)
- The engine emits **verified events** (verdict, tier, lesson, representation, timestamp) that enrich the timeline with a **trust dimension** — "verified ✓" vs "unverified" entries, and failure→recovery arcs.
- It **contributes verified-ness**; it does **not** own `mastery_records` (that is the `mastery-updater.js` / Analyzer domain). It adds a lens, not a new producer of mastery.
- Because verdicts key on `lesson_id × representation`, they slot directly into the KDG multi-axis model as a third lens (Knowledge × Representation × Verification). Trust Memory can surface as *"Si is highly reliable on ALG_006 for you."*

### 10.6 Integration invariants (summary)
| System | Engine's role | Invariant honored |
|---|---|---|
| AI Tutor | new writer of Phase-0 nullable cols; sibling fn | additive-only; `ai-tutor` unmodified |
| Analyzer | signal *producer* (new source), never report writer | frozen single-producer |
| Focus | none direct (transitive via SSOT) | pure-consumer boundary |
| Failure DNA | sole writer (new store) | PII-free, taxonomy-keyed |
| Learning Timeline | verified-event contributor | mastery ownership unchanged |

---

## 11. Extensibility rules (so new verifiers need zero engine change)

The open/closed contract, stated as enforceable rules:

1. **The engine depends only on `EvidenceClaim` + the Verifier declaration + the Lattice types.** It contains no reference to any concrete verifier. (Enforced by review: a PR that makes the Decider branch on a specific `verifier_id` is rejected.)
2. **Adding a verifier = (a) implement the §6 interface, (b) add a Registry declaration, (c) accumulate calibration data.** No edit to Planner / Combiner / Decider / Cost Engine code.
3. **Adding a new `evidence_type` is allowed only if it slots into the existing lattice partial order** — you declare its tier and polarity semantics. *Adding a new tier* is the one governed change that touches the Lattice; it is rare and requires re-deriving the combination rule (§4.4).
4. **Calibration and Trust Memory are data.** Refitting them on new labels never changes engine code — this is how the system improves without redeploying logic.
5. **Every verifier is versioned; Trust Memory keys on version.** A new version cold-starts and re-earns trust (detector-v1/v2 precedent).
6. **Shadow-first is mandatory.** A new verifier ships emitting claims the engine records but does not act on, until its reliability curve is measured on the benchmark. Promotion to "acting" is a data-driven gate, not a code toggle.
7. **Runtime isolation.** A verifier needing a non-Deno runtime (CAS/Python/Lean) lives behind the Async Orchestrator as a service; the engine sees only its `EvidenceClaim`. **The engine is runtime-agnostic** — this is what lets the deterministic layer (which today cannot run in Deno, review §2.2) join later without touching the core.

**Test of the design:** "Can Random Point, then CAS, then a geometry validator, then a Lean prover each be added without editing the Decider?" If yes for all four, the seam holds. This RFC's §4/§6/§11 are constructed so the answer is yes.

---

## 12. Phase roadmap (engine-first; no verifier until the engine exists)

Each phase is gated on a *measured* result, mirrors the codebase's shadow-first discipline, and touches `ai-tutor`'s answer path in **none** of TE-0…TE-2.

| Phase | Deliverable | Student impact | Gate to advance |
|---|---|---|---|
| **TE-0** | This RFC finalized. Frozen contracts: `EvidenceClaim`, `Verdict`, Verifier interface, Lattice partial order, Verdict→Phase-0 column mapping. | none | contracts reviewed & accepted |
| **TE-1** | Engine core as a **pure library** (Planner/Combiner/Decider) with **zero registered verifiers** → provably inert (always ABSTAIN, "no evidence"). Calibration Store schema (additive/nullable). Gold benchmark (1–2k). | none (inert) | engine returns correct ABSTAIN on empty registry; benchmark stratified & labeled |
| **TE-2** | Register the **existing L3 shadow solvers + judge** as the *first* verifiers (they already exist). Engine, in **shadow**, combines them into Verdicts and records them — acting on nothing. First calibration curve of `SAME_MODEL_CONSENSUS`. | none (shadow) | measured reliability curve for Tier-3 consensus |
| **TE-3** | Implement the **first deterministic verifier (Random Point)** behind the §6 interface — plugs in with **zero engine change** (proves the seam). Shadow-measure its calibration. | none (shadow) | Random-Point reliability curve; extensibility seam validated |
| **TE-4** | **Inline lane live** (premium, checkable subset): deterministic `VERIFIED` gates publish + trust marker. Answer cache. Conformal publish gate. | first trust marker | `VERIFIED` bucket meets its promised accuracy floor on held-out labels |
| **TE-5** | **Async lane + post-correction**: promote L3 shadow to the Async Orchestrator; `verification_jobs` queue for durability. | post-corrections appear | post-correction only fires on lattice-dominant contradictions; measured false-correction rate ≈ 0 |
| **TE-6** | **Cross-provider solvers + CAS** behind the async lane (new verifiers, no engine change). Trust Memory v1 (Bayesian, benchmark-anchored). | higher corroboration quality | cross-provider independence improves calibration vs Tier-3 |
| **TE-7** | **Learned Cost Engine** (VoI model trained on TE-2…6 logs) + **Truth Replay** + continuous calibration with the feedback guardrail. Formal-proof experiment for the formalizable tier (far horizon). | lower cost at equal accuracy | evidence-gain-per-dollar improves without accuracy regression |

The user's stated next step — *"implement the first verifier"* — is **TE-3**, and it only happens after the engine (TE-0/1) and the reuse of existing solvers (TE-2) prove the contracts hold.

---

## Appendix A — Verdict → existing `question_records` columns

The core path needs **no new schema** — the Verdict maps onto the Phase-0 nullable columns:

| Verdict field | Existing column |
|---|---|
| `decision` (VERIFIED/…) | `verification_status` (+ `verification_path` for the tier route) |
| `evidence_tier_reached` | encoded in `verification_path` / `verification_meta` |
| `calibrated_confidence` | `verification_confidence` |
| solver participation | `solver_count`, `solver_agreement` |
| judge participation | `judge_verdict` |
| integrity result | `ocr_confidence` |
| full evidence bundle | `verification_meta` (jsonb; 4 KB cap per Phase 0) |

New stores (Calibration, Trust Memory, Failure DNA, `verification_jobs`) are **separate additive tables**, introduced only at the phase that needs them, each with its own approval per the migration rule.

## Appendix B — Native-conventions honored (so this reads as Si Math, not foreign)

- Single-producer / pure-consumer (engine = sole decider; verifiers = pure producers).
- SSOT (Calibration Store is the single source of "how trustworthy").
- Determinism (deterministic verifiers reproducible under frozen inputs; Lattice pure).
- Shadow-first + double-gating (every verifier and the engine itself ship inert first).
- Additive-only schema (Verdict rides Phase-0 nullable columns).
- Taxonomy-as-authority (all signals/keys normalized to lesson ids; Trust Memory keyed on KDG axes).
- Isolation (sibling function; runtime-agnostic verifier services; `ai-tutor` untouched).
- Freeze respect (Analyzer fed via signals only; Focus reached transitively; frozen files unmodified).

---

## The one thing to get right first

Everything hinges on **§4 (the Evidence Lattice) + §9 (calibration)**. If evidence stays a *lattice* (proof dominates agreement) and "verified" is *empirically calibrated* against human-labeled ground truth, the rest is plumbing. If either collapses back into an additive score or a hand-tuned threshold, the engine becomes a confident liar. Finalize §4 and §9 before writing a single verifier.
