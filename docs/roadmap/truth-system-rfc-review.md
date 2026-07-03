# Truth System — Architecture Review (RFC Response)

**Status:** Design review. Not an implementation authorization.
**Reviewer stance:** Aggressive technical critique, as requested.
**Scope:** The "Si Math Truth System" 16-phase proposal + Cost Engine + Evidence-Driven Execution model.
**Grounding:** Reviewed against the live system — `ai-tutor` v84, the L3 shadow pipeline (`l3-shadow-v3`), the DifficultyDetector (v1 + v2 shadow), the Phase 0 verification columns, the existing `adaptive-verification.md` roadmap, the taxonomy (~33 canonical lessons / 5 topics), and the 2026-06-23 OpenAI quota incident.

---

## 0. One-paragraph verdict

The **philosophy is right and the architecture is wrong-sized.** "Truth from evidence, not from any single component" is the correct north star, and you have already built the hard part of it (a shadow multi-solver + judge pipeline that writes structured traces without touching the student path). But the 16-phase proposal is *three ideas wearing sixteen hats*: (1) a cheap→expensive **escalation cascade**, (2) a **deterministic-checker layer**, and (3) a **calibration/decision policy**. Everything else is those three renamed. The single most dangerous assumption is that **agreement is evidence** — it is not, and the places where it is weakest are exactly the hard questions where you need it most. The single most dangerous *omission* is that **your runtime cannot run the deterministic verifiers the whole thesis depends on** (Deno edge, no Python, no SymPy). Fix those two things, collapse 16 phases into ~3 tiers, build the benchmark *first* instead of last, and this becomes buildable. Keep it as written and you will spend two years building a cathedral whose foundation (the evidence score) is un-calibrated.

---

## 1. What you already have (so the roadmap connects to reality)

Before critiquing, the honest starting line — because the RFC talks as if from zero, and you are not:

| Capability | RFC phase it maps to | Status in code |
|---|---|---|
| OCR extraction + ambiguity re-run (gpt-4o) | Phase 0 (Input Integrity) | **Built** — `extractMathTextFromImage`, `ocrAmbiguityCheck`, confidence + flags |
| Difficulty classification (easy/med/hard/expert) | Phase 1 + Phase 7 routing | **Built, shadow** — `DifficultyDetector` v1 heuristic + v2 LLM |
| 2 parallel solvers + judge | Phase 2 (Solver Farm) + Phase 10 (Court) | **Built, gated off** — `runSolver` ×2 (gpt-4o-mini @ temp 0.1/0.3) → judge (gpt-4o) |
| Deterministic numeric equivalence | Phase 4 (Domain Verification), partial | **Built** — `answersEquivalent` / `parseNumericAnswer` (string → numeric, fail-closed) |
| Structured trace persistence | Phase 13 (Failure DNA) + Phase 15 (Replay) | **Built** — Phase 0 nullable columns incl. `verification_meta` jsonb |
| Background execution, zero student latency | (Enables the whole thing) | **Built** — `EdgeRuntime.waitUntil()`, double-gated `VERIFICATION_ENABLED` + `VERIFICATION_SHADOW_ONLY` |
| Cost/latency model, isolation into a sibling fn | Phase 12 (Truth Budget) + Cost Engine | **Designed** — `adaptive-verification.md` (L1–L4, `ai-tutor-premium`) |

**Implication:** the Truth System is not a new program. It is the *productization and calibration* of the shadow pipeline you already run. That reframing matters for every cost and risk estimate below.

---

## 2. The five load-bearing critiques

### 2.1 "Evidence" is under-defined, and **agreement ≠ correctness**

The RFC says "solver agreement is not the truth" — then Phase 6 reintroduces "Solver Agreement" as an evidence dimension summed into a scalar Evidence Score. That is the same mistake wearing a new coat.

Your two solvers are `gpt-4o-mini` at temperature 0.1 and 0.3. **They are not independent.** Same weights, same tokenizer, same training corpus, same failure modes. Two samples from one model at different temperatures are *correlated*, and their correlation is highest on exactly the questions that trip the shared prior — the hard/adversarial ones. So "solver agreement" is:

- **Well-calibrated on easy questions** (where you didn't need it), and
- **Systematically overconfident on hard questions** (where you did).

This is the deep flaw. An Evidence Score that treats "two mini-solvers agreed" as comparable to "SymPy substituted the root back and it satisfied the equation" is **summing incommensurable things**. Deterministic evidence is a *proof of consistency*; consensus evidence is a *correlation*. They must not live on the same additive axis.

**Fixes (do all three):**
1. **Make evidence types a lattice, not a sum.** A single passing deterministic check should *dominate* any quantity of LLM agreement. Rank: `machine-checked proof > deterministic domain check > cross-provider agreement > same-model agreement > single-model confidence`. The Truth Engine picks the *highest tier of evidence available*, it does not average tiers.
2. **The real fix for correlated overconfidence is provider diversity, not temperature diversity.** Two temperatures of one model ≈ one opinion. GPT-4o + Claude + Gemini is *three priors*. This is the highest-value change to your current pipeline and it is a config change, not a research project.
3. **Calibrate against ground truth, not against itself.** "Agreement 0.94" means nothing until you have measured, on a labeled set, that "agreement ≥ 0.94 ⇒ correct X% of the time." Without that measurement (§6), every threshold in the system is a guess.

### 2.2 Your runtime **cannot run the deterministic layer the thesis rests on**

The entire differentiator — "prefer SymPy / Python / geometry validators / statistics engines over LLM calls" — assumes those tools are available and cheap. In `ai-tutor` (Supabase Edge = Deno) **they are neither present nor importable.** There is no Python, no SymPy, no CAS. `answersEquivalent` is the *only* deterministic math in the codebase, and it is string/number normalization, not symbolic verification.

The RFC treats SymPy as a free primitive. It is a **new infrastructure surface**. Your options, with honest costs:

| Option | What it buys | Real cost the RFC ignores |
|---|---|---|
| Random-point numeric verification in pure JS | Expression/function/identity equivalence, **today, in Deno** | None — this is the win (see §8) |
| Pyodide/WASM SymPy in-edge | Full CAS in the function | ~10 MB+ payload, cold-start seconds, edge memory/time limits |
| External Python microservice (Cloud Run/Fly/Lambda) | Full CAS + numpy/scipy | New deploy surface, network hop, cold starts, a *new* single point of failure and bill |

None of these is a blocker forever. But "deterministic tools are cheaper than LLMs" is only true *per call* — they carry fixed infra cost, cold-start latency, and (for the microservice) a new outage class. **The cost argument in the RFC quietly assumes the expensive part is free.** Correct the model: deterministic ≠ free, it's *cheap-marginal, real-fixed*.

### 2.3 **Verification is easier than solving — make "propose-and-check" the spine, not a phase**

The RFC's best latent insight is buried in Phase 4: for most SAT/EST/ACT items you can *check* a candidate answer far more cheaply and reliably than you can *produce* one. Substitute the root back. Plug the point into the constraint. Recompute the mean. For multiple-choice (most of your test formats) you can often verify all five options deterministically.

This inverts the whole architecture. The RFC's default is **"many solvers vote, judge breaks ties"** (expensive, and trusts correlation). The right default is:

> **Propose (1 good solver) → Check (deterministic) → Corroborate (extra solvers) only when the answer type can't be checked.**

The 2021 GSM8K result is the canonical evidence: a *verifier* beat a much larger *generator*. Checking > scaling generation. The solver farm should be your **fallback for un-checkable questions** (proof-style, open word problems), not the front door. This alone cuts the median question from "N solver calls + judge" to "1 solver + a free check."

### 2.4 The publish philosophy needs a **checkable / un-checkable** distinction and **calibrated abstention**

"Every answer supported by sufficient mathematical evidence" is achievable for the **checkable subset** and *impossible* for the **un-checkable subset** without formal proof (§7). If you don't make this distinction first-class, one of two failures is guaranteed:

- You over-promise on un-checkable questions (the "100% accuracy" trap you explicitly reject), or
- You block/deep-verify forever on questions that can never reach deterministic sufficiency, burning the budget.

The honest architecture has **three publish outcomes, not one:**
1. **Verified** — a deterministic check (or proof) passed. Publish with a "verified" marker.
2. **Corroborated** — no deterministic check exists, but independent (cross-provider) solvers agree at a calibrated threshold. Publish, *without* a verified marker.
3. **Abstain / hedge** — evidence insufficient and no cheap path to more. Present as a worked solution explicitly labeled *not independently verified*, or defer.

This is the **selective-prediction / reject-option** framing, and it is what makes "never knowingly publish without sufficient evidence" a *true* statement rather than marketing. **Conformal prediction** gives this a distribution-free error-rate guarantee: publish only when the calibrated confidence set is a singleton at level α. That is a far better backbone for your "publish threshold" than a hand-summed Evidence Score.

### 2.5 **Synchronous verify-before-publish vs. background shadow is an unresolved product contradiction**

The Truth Budget (3s → 30s, student waits) implies **synchronous** verification. Your live pipeline is **background** (`waitUntil`, shadow, zero latency). These are different products:

- **Verify-before-publish (sync):** you can *withhold* a wrong answer — this is the stated philosophy — but you pay latency on every question and need the streaming/progress UX `adaptive-verification.md` already flagged.
- **Verify-after-publish (async):** cheap perceived latency, but you've *already shown* a possibly-wrong answer, then must post-correct ("we double-checked — it's actually X"). This **violates** "never publish without evidence."

The RFC states the sync philosophy and describes the async mechanism, and never reconciles them. **Resolve it explicitly as a hybrid:** sub-second deterministic checks run *inline* and can gate publish; heavy verification runs *async* and can post-correct. Write down which checks are allowed in the inline budget (answer: only the deterministic ones and at most one fast independent solver).

---

## 3. Phase-by-phase feasibility

Realistic-now = fits current arch, months. Medium = needs new infra, quarters. Research = multi-year / may not land for this distribution.

| Phase | Verdict | Notes |
|---|---|---|
| 0 Input Integrity | **Now (have it)** | Extend existing OCR confidence; add a cheap completeness check. Keep it *always-on* — solving a corrupted question wastes everything downstream. |
| 1 Canonical Understanding | **Now (have it)** | DifficultyDetector + taxonomy already classify. Don't gold-plate; classification only needs to be good enough to *route*. |
| 2 Solver Farm ("no privileged Zero") | **Now, but demote it** | You have 2 solvers. Add provider diversity (§2.1). But per §2.3, the farm is the *fallback*, not the default. "All solvers equal" is philosophically clean and operationally wasteful — Zero already carries personality/KB/pedagogy; keep Zero as the student-facing generator and run *naked* solvers only for verification. |
| 3 Evidence Builder (reasoning/equation trees) | **Research** | Aligning reasoning trees to "find where disagreement begins" is step-level verification (process supervision) — an open problem. Approximate it (the step where a deterministic check first fails, or where solvers diverge); do **not** build automation that assumes you can truly localize the first wrong step. |
| 4 Domain Verification Layer | **Split** | The *general* checks (symbolic/numeric equivalence, stats recompute, unit/ratio sanity) are Now via random-sampling (§8). The *per-lesson tool zoo* is a Medium/never trap (§5). |
| 5 Evidence Collector | **Now (have it)** | `verification_meta` already collects per-solver/timing/error traces. |
| 6 Evidence Score | **Now, but redesign** | Do **not** sum incommensurable dimensions (§2.1). Make it a lattice + a calibrated per-tier probability. |
| 7 Adaptive Verification (route by evidence) | **Now** | This is a cascade policy (§4). You have the difficulty signal to seed it. |
| 8 Fast Verification | **Now** | = the deterministic checks, inline, sub-second. The core of the whole thing. |
| 9 Deep Verification | **Medium** | CAS/multi-provider/deep search need infra (§2.2) + a queue (§9 perf). |
| 10 Mathematical Court | **Reframe** | Strip the metaphor. The implementable core is *a trained/prompted verifier + a decision policy*. "Court" ≠ a new component; it's the judge you have, calibrated. |
| 11 Truth Engine | **Now (thin)** | Keep it a *thin policy layer* (mechanism vs. policy separation is good). Not a heavy service. |
| 12 Truth Budget | **Now (static) → Medium (learned)** | Static per-tier budgets now; learned budgets later (§4, Cost Engine). |
| 13 Failure DNA | **Now (log it) — but noisy labels** | Cheap to store in `verification_meta`. "Root cause / first wrong step" fields are *noisy* (§Phase 3); treat as signal, not truth. Don't automate hard decisions off them. |
| 14 Trust Memory | **Medium** | Per-lesson reliability is right granularity, but has three traps: circular ground truth, feedback-loop entrenchment, thin per-cell samples. Needs Bayesian shrinkage + anchoring to labeled data (§5). |
| 15 Truth Replay | **Now-ish (good news)** | Because you already persist traces, offline replay against a stronger model is *more* realistic than the RFC assumes. High-value, low-risk. Build the replay harness early — it's how you validate everything else. |
| 16 Continuous Learning | **Medium/Research** | Feasible *only* after the benchmark + calibration exist. Guardrail: never let the loop define its own ground truth (§5). |

---

## 4. The Cost Engine and the Evidence-Driven Execution model

You asked five specific questions about cost + adaptive verification, and the evidence-gate model is the same mechanism, so I'll answer them together.

### Is the Cost Engine architecturally sound?
**Yes as a framework, no as a day-1 build.** "Estimate expected evidence gain, latency, and cost before running a stage; run it only if the gain justifies the spend" is textbook **value-of-information / expected value of computation** (Russell & Wefald). It is rigorous decision theory. But:

1. **The "expected evidence gain" term is not free — it's the hard part.** Estimating the probability that a stage will *change the decision*, given everything seen, is nearly as hard as verification itself. If you could estimate it perfectly you'd almost have the answer. So it must be **learned from logged outcomes**, which means the Cost Engine is a *late* capability, not a foundational one. **The RFC has the bootstrapping order backwards** — it presents the Cost Engine as an upfront design choice. You cannot build it until you have a corpus of (question features → which stage flipped the decision), which only exists after months of shadow logging + a benchmark.
2. **The meta-decision must be cheap.** If the Cost Engine is an LLM call, it can cost more than the stage it's avoiding — you've added a tax to every question to *maybe* save money on some. It must be a **learned tree / logistic regression on cheap features** (difficulty tier, question type, answer-checkability, OCR confidence, historical per-lesson reliability), evaluated in microseconds.
3. **Until it's learned, use static policy.** Route by difficulty tier + answer-checkability. You already have the difficulty signal live. This captures 80% of the benefit with none of the risk.

The literature now studies this directly — *"When Does Verification Pay Off?"* (2512.02304) and training-free lightweight verifiers (LiLaVe, Referi) that cut best-of-n / majority-vote compute. This is a live research area, which both validates the instinct and warns you it's not a solved commodity.

### How to implement adaptive verification *without hurting accuracy*
The trap is early-exiting on the wrong evidence. The safe rule is **asymmetric**:

- ✅ You may skip *corroborating* stages when you already hold *deterministic* evidence (a passed check). Deterministic sufficiency is real sufficiency.
- ✅ You may early-exit on **easy tier + high cross-provider agreement**.
- ❌ You may **never** early-exit on **same-model agreement**, because that's least reliable exactly on hard questions (§2.1).
- ❌ You may **never** skip the input-integrity check or the deterministic check *to save money*. Those are the cheap, high-value stages; cutting them is the one place adaptive-cost logic destroys accuracy.

In one line: **cost-cut the expensive corroboration, never the cheap verification.**

### Which stages **always** run
- **Input integrity** (OCR confidence / completeness for image Qs). Garbage-in poisons everything; it's cheap.
- **Classification** (topic/lesson/difficulty/checkability). Cheap; it routes everything.
- **One primary solve.**
- **A deterministic check *iff the answer type admits one*.** (This is a predicate, not a phase — "is this answer checkable?" gates whether the check runs.)

### Which stages are **conditional**
- Second/third solver → only if no deterministic check exists, or the check was ambiguous, or high-stakes tier.
- Judge/verifier → only on disagreement or low evidence.
- Deep CAS / multi-provider / olympiad budget → only on persistent disagreement, hard/expert tier, or high-value user.

### Additional OpenAI-cost reductions that preserve reliability
1. **Answer cache / dedup by question hash — your single biggest lever.** Exam prep is *massively* repetitive: thousands of students hit the same past-paper items. A `question_hash → verified_result` cache (you already have `client_request_id` idempotency infra to model it on) can collapse a large fraction of verification spend to zero. The `adaptive-verification.md` open question #5 already flagged this — promote it to a headline optimization.
2. **Prompt caching on the ~6K-token system prompt.** Repeated structural prefix → cache it; material input-token savings on every call.
3. **Deterministic-first early-exit** (§2.3) — the check is free after infra; it removes solver calls entirely for the checkable majority.
4. **Difficulty routing** (have it) — easy tier gets deterministic-only or no verification.
5. **Cheap model for solving, expensive only for the ambiguous minority** — you already do this for OCR/judge (gpt-4o-mini vs gpt-4o). Extend the pattern.
6. **Per-user/day deep-verification cap** (roadmap open question #4) — bounds tail cost against abuse and pathological questions.
7. **Provider diversity doubles as reliability insurance.** The 2026-06-23 outage was a *single-provider* quota failure at -$0.09. A system that *multiplies* OpenAI calls per question makes that failure mode worse. Multi-provider isn't only an accuracy play — it's the fix for your existing outage class.

### Verdict on the Evidence-Driven Execution model
**Endorse the principle, reject the over-formalization.** "Each phase is an entry/exit gate; the Truth Engine decides whether more evidence is worth collecting" is a **cascade with early exit** — Viola-Jones (2001) in vision, model cascades / FrugalGPT (2023) in LLMs, speculative decoding, learning-to-defer. Sound and well-trodden. But:

- **16 gated phases → ~3 escalation tiers.** Nobody can tune 16 thresholds. `T0: deterministic check only. T1: +1 independent (cross-provider) solver. T2: +CAS / multi-provider / deep search.` Three decision points, not sixteen.
- **The gate needs a *checkability* predicate, not just an evidence-threshold predicate.** For un-checkable questions the evidence never becomes deterministically sufficient; without a checkability gate the cascade loops to the max budget every time (§2.4).
- **"Truth Engine as sole controller" is good** — it's mechanism/policy separation. Keep it a thin policy object. The moment it becomes a heavy service with its own model calls, it's another cost center and another thing that can be wrong.

---

## 5. The per-lesson verifier zoo is the wrong shape

Phase 4 wants "dedicated verification tools for every lesson." Grounded scale: **~33 canonical lessons across 5 topics** (ALG/FUN/GEO/STA/PR), plus two cross-cutting categories the RFC lists that **aren't even in your taxonomy** (Logical Reasoning, Word Problems). At the ~6 tools/domain the RFC sketches, that's **dozens to ~200 verifiers** to build, test, calibrate, and maintain.

Three problems:
1. **A buggy verifier is worse than no verifier.** A tool that flags *correct* answers as wrong (false negative) destroys trust and blocks publishing — the opposite of the goal. 200 hand-built tools = 200 false-negative sources.
2. **Most questions don't need bespoke tools.** A handful of *general* capabilities cover the large majority: symbolic/numeric equivalence, random-point function/identity equality, statistics recompute, unit/ratio/percentage sanity, constraint satisfaction.
3. **Thin coverage per tool.** 200 tools each exercised rarely never get enough traffic to calibrate.

**Recommendation: coverage over count.** Build **4–6 general deterministic capabilities**, not a per-lesson zoo. Map lessons → capabilities (a table), not lessons → bespoke code. Add a bespoke verifier only when logs prove a specific lesson is both high-volume *and* poorly served by the general checks.

---

## 6. Build the benchmark **first**, and make it 10× smaller to start

The RFC lists the Gold Benchmark *last* (Validation Strategy) and sizes it at **10k–50k expert-verified problems.** Both are backwards.

- **It's the foundation, not the finale.** Every threshold, every evidence weight, every calibration curve, every Trust-Memory number is meaningless without labeled ground truth to fit against and measure against. "Evidence ≥ threshold ⇒ 99% correct" is unfalsifiable until you have a labeled set to compute the 99% on. **Build it in the first quarter.**
- **50k expert-verified is a multi-person-year annotation project.** Don't gate the program on it. **Start at 1–2k, stratified by lesson × difficulty.** That's enough to *measure calibration per stage* — which is all you need to decide what to build next. Grow it via the shadow-audit / replay loop (your Phase 15 makes this cheap).
- **IP flag:** "50k SAT/ACT/EST problems with expert solutions" implies sourcing real past papers at scale — copyright-sensitive. Factor licensing/originality into the plan.

The **per-lesson accuracy** idea (§Validation) is excellent and under-resourced by the rest of the RFC — it's the right granularity and it feeds Trust Memory directly. Keep it. But note: **blind eval vs GPT/Claude/Gemini needs a grading harness** (answer normalization) — you have the seed of one in `answersEquivalent`; it needs to grow to handle expressions, sets, and units.

---

## 7. Prior art (you asked explicitly)

This concept space is active and, in 2025, moved fast. Nothing here is disqualifying — but you are *adopting* known techniques, and the novelty must be the **taxonomy-scoped orchestration + calibration for exam prep**, not the primitives.

**Academic / method:**
- **Self-consistency** (Wang et al., 2022) — sample N chains, majority-vote. Literally your "solver farm + consensus," with the known correlated-error ceiling.
- **Verifier models beat bigger generators** (Cobbe et al., GSM8K, 2021) — the empirical basis for "check, don't just scale" (§2.3).
- **Process reward / step-level verification** ("Let's Verify Step by Step," 2023; CompassVerifier; process-reward RLVR, 2025) — the "find the first wrong step" dream (Phase 3), still hard.
- **Program-Aided LMs / Program-of-Thoughts** (2022) — LLM emits code, executes it deterministically. This *is* "prefer SymPy over LLM." Standard practice, not novel.
- **Model cascades / FrugalGPT** (2023) + cascade classifiers (Viola-Jones, 2001) — your Cost Engine / evidence gates, with published cost-accuracy curves.
- **Selective prediction / reject option + conformal prediction** — the rigorous version of "don't publish without sufficient evidence" (§2.4).
- **Deep ensembles as uncertainty** (2017) — disagreement ≈ uncertainty *only under independence*; correlated ensembles are overconfident (§2.1).
- **2025 frontier:** **DeepSeekMath-V2** (self-verifiable reasoning, IMO-2025-gold-level); **Solve-Detect-Verify / FlexiVe, RL Tango**; training-free lightweight verifiers (**LiLaVe, Referi**) that cut best-of-n compute; and **"When Does Verification Pay Off?"** — directly your Cost-Engine question. Your architecture is a *product* wrapper around this research; track it, don't re-derive it.

**Industrial / the "truth" north star:**
- **Wolfram\|Alpha / Symbolab / Photomath** — CAS *is* the answer engine or step-checker. Proves "CAS-verified math answers" for the checkable subset industrially. This is your realistic core, not a moonshot.
- **Formal proof (the only literal "truth"):** **AlphaProof** (silver IMO 2024, *Nature* 2025) and **Harmonic's Aristotle** (IMO-2025 gold, **public API**) produce **machine-checked Lean 4 proofs** — no human verification needed. This is genuine "truth from evidence." **But** it works only where problems can be *autoformalized* cheaply, which SAT/EST/ACT word problems mostly cannot. Relevance: it's the correct **north star for your expert/olympiad tier** and the **reality check** for everything else — real certainty = machine-checked proof, out of reach for the general exam distribution *today*. Aristotle's public API makes a formalizable-subset experiment a Year-3 bet rather than pure fantasy.

**The uncomfortable strategic truth:** frontier LLMs are already *very* good at SAT/ACT final answers. Beating GPT-5 / Claude on raw accuracy is a coin-flip differentiator. **Si Math's defensible moat is calibration and selective reliability — knowing when it's right and abstaining honestly when it isn't — not accuracy supremacy.** Build the trust story on *verified-ness and honest abstention*, which you can win, not on a leaderboard you might not.

---

## 8. The simpler alternatives (you asked)

1. **Random-point numeric verification — the single highest-leverage simplification.** To test "are these two expressions/functions/identities equal?", evaluate both at ~20 pseudo-random points (fixed seed). If they *ever* differ → provably unequal. If they *always* agree → overwhelming evidence of equality. This **collapses several per-domain tools into one technique** (algebra identities, function equivalence, trig identities), runs in **pure Deno today** (no Python), and sidesteps §2.2 for a large question class. Start here.
2. **Propose-and-check over farm-and-vote** (§2.3) — 1 solver + free check beats 4 solvers + judge for the checkable majority.
3. **Three tiers, not sixteen phases** (§4).
4. **Conformal prediction** for the publish gate instead of a hand-summed Evidence Score (§2.4) — a real, tunable error-rate guarantee.
5. **Static difficulty routing now, learned Cost Engine later** (§4) — don't build the VoI model before you have data to fit it.
6. **Answer cache / dedup** (§4) — biggest cost win, near-free given existing idempotency infra.
7. **Deterministic pre-filter** — if the question is pure arithmetic, compute it; don't LLM it at all.

---

## 9. Performance & operational concerns

- **Edge runtime limits.** Supabase Edge (Deno) has CPU/wall-time and memory ceilings. A 30s olympiad budget of sequential LLM calls risks function timeouts. **Heavy verification cannot live in one edge invocation** — it needs a queue + worker (a jobs table + Supabase cron, or an external worker). The shadow pipeline gets away with `waitUntil` because it's fire-and-forget; a *budgeted, resumable* deep verification does not.
- **Do not grow `ai-tutor` into the Truth System.** It is a 55 KB / ~2,800-line function that has already caused **two truncation outages** and now ships as a multi-file bundle deployable **only via CLI (Path B)**. Every kilobyte you add raises deploy risk on the one function with no health-gate in front of it. The `adaptive-verification.md` instinct — isolate into `ai-tutor-premium` and separate services — is correct; hold that line hard.
- **Single-provider fragility is already proven** (2026-06-23, full outage at -$0.09). A verifier that multiplies OpenAI calls *amplifies* that risk. Multi-provider is a *reliability* requirement, not just accuracy polish.
- **Tail latency stacks in the sequential stages.** Solvers parallelize (`Promise.all`, good); judge/court/deep are sequential. Budget the *tail*, not the mean.

---

## 10. Proposed multi-year roadmap (preserves L3 shadow)

**Invariant across all phases:** never touch `ai-tutor`'s student answer path; keep the double-gate; keep verification isolated (`ai-tutor-premium` + services). Every phase is gated on a *measured* result on the benchmark — mirroring your existing "gate on milestones" discipline.

**Year 0 · H1 — Foundation (no student-facing change).**
Build the **gold benchmark (1–2k, stratified)** and a **calibration harness**. Add **deterministic checkers that run in Deno today** — numeric substitute-back, **random-point equivalence** (§8), stats recompute, unit/ratio sanity — running in *shadow* beside the existing solvers. Expand `verification_meta` with **Failure DNA** fields (noisy-label caveat). Build the **Truth Replay** harness (cheap — traces already persist).
**Deliverable:** one measured number — *"when the deterministic check passes, accuracy is X%; when same-model solvers agree but no check exists, accuracy is Y%."* That number decides everything downstream.

**Year 0 · H2 — First real verification (premium-gated, checkable subset only).**
Turn on **inline deterministic checks to gate publish** for the checkable subset (**propose-and-check**). Ship the **answer cache/dedup**. Static **difficulty routing**. This is your first "Truth Engine" — tiny, deterministic, cheap — in the `ai-tutor-premium` sibling. Three publish outcomes (verified / corroborated / abstain).

**Year 1 — Infra + escalation.**
Stand up **CAS** (Pyodide-WASM or a Python microservice) for symbolic checks where random-sampling is insufficient. Add **cross-provider solvers** (Claude/Gemini) for genuine independence on the hard subset. **3-tier escalation policy.** **Conformal-prediction publish gate.** **Trust Memory v1** — per lesson, Bayesian-shrunk, measured *against the benchmark*, not against pipeline agreement.

**Year 2 — Learned optimization.**
**Cost Engine** as a *learned* VoI model (cheap tree/logistic) trained on Year 0–1 logged outcomes. Mature the **continuous-learning loop** with the anti-feedback guardrail: always re-anchor to a *growing human-labeled* benchmark slice; never let the loop define its own ground truth.

**Year 3+ — Research bets.**
**Autoformalization + Lean-checked proofs** for the *formalizable* subset (expert/olympiad tier) — now plausible as a bounded experiment thanks to public Lean-proof APIs (Aristotle). Literal "truth" for the subset that admits it; calibrated selective reliability for everything else.

---

## 11. The three things to change *today*

If you do nothing else from this review:
1. **Kill the additive Evidence Score. Make evidence a lattice** where a deterministic check dominates any amount of LLM agreement (§2.1).
2. **Add random-point numeric verification in Deno** — your deterministic layer, with zero new infra, this quarter (§8).
3. **Start the benchmark at 1–2k now** — because every threshold in the Truth System is a guess until it exists (§6).

Everything else is sequencing.
