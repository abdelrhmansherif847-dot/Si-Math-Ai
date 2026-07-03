# Truth Engine RFC — Adversarial Review

**Status:** Adversarial architecture review. Attacking `truth-engine-architecture.md`, not defending it.
**Mandate:** Try to break the design across ten axes. Recommend changes before TE-1 if it doesn't hold.
**Method:** Every finding is `claim → concrete failure scenario → severity → fix`. Findings are IDed for traceability.
**Constraint honored:** review only — no code, no schema, no refactoring of the RFC.

---

## Verdict (stated up front, as required)

**The spine holds. The RFC as written does not.**

The four load-bearing ideas survive every attack I could mount:
1. **Mechanism/policy separation** (engine owns zero verification logic) — holds; it is the right seam.
2. **Evidence as typed tiers, not a scalar score** (proof dominates agreement) — the *principle* holds.
3. **Calibration against human ground truth, never self-labels** — the *principle* holds.
4. **Runtime-agnostic verifiers behind an async boundary** — holds; genuinely good.

But **five blockers are baked into the exact artifacts TE-1 builds** (the Combiner and the data contracts), so TE-1 must not start until they are resolved. There are also **five false/overstated claims in the doc** to correct, **five deferred risks** to put on the register, and **four component-boundary moves** that prevent the engine from becoming a god-object. None require abandoning the architecture. All five blockers are design decisions, not code.

**Recommendation: fix B1–B5 in the TE-0/TE-1 contracts before writing the engine core. Correct D1–D5 in the RFC text now. Log R1–R5 with owners. Make the O1–O4 boundary moves.**

### Severity map

| Class | IDs | Must resolve before… |
|---|---|---|
| **Blocker** (baked into TE-1 artifacts) | B1 B2 B3 B4 B5 | **TE-1 start** |
| **Doc correction** (claim is false/overstated) | D1 D2 D3 D4 D5 | TE-1 start (text), integration at TE-4 |
| **Logged risk** (real, lands later) | R1 R2 R3 R4 R5 | the phase named in each |
| **Boundary move** (component belongs elsewhere) | O1 O2 O3 O4 | TE-0 contract |

---

## 1. Hidden architectural assumptions

**H1 — The engine assumes a single, atomic candidate answer.** `verify(question, candidate, context)` and `EvidenceClaim.target` model one answer. Fails on: systems of equations ("find all x"), ordered pairs, intervals/domains, sets, "state domain AND range," multi-part items — a large fraction of SAT/EST/ACT. The combination rules, REJECTED logic, and calibration all key on one target. → escalated to **B3**.

**H2 — "Deterministic" Tier-1 checks assume a trustworthy canonical form.** Substitute-back needs the equation; a checker consumes whatever CANONICALIZE produced — and for a word problem that extraction is an **LLM (stochastic) step**. A "deterministic proof" computed over a mis-extracted equation is a proof about the *wrong problem*, yet the lattice grants it dispositive authority. → escalated to **B4** (this is also the top over-confidence mode, OC-1).

**H3 — Benchmark distribution ≈ production distribution.** Calibration is fit on a clean 1–2k benchmark; production is OCR'd images, real phrasings, and drifts over time. Conformal coverage assumes exchangeability, which drift breaks. → **R3**.

**H4 — Ground truth is knowable and binary.** Answer keys have errata; some items are genuinely ambiguous. "Verified = 99% correct" is really "99% agreement with a possibly-wrong key." → **R1**/**R3**.

**H5 — `stakes` exists as an input.** §8.3 and `publish_threshold(stakes)` consume a stakes value that **no component produces**. Undefined origin. → fold into **B5** (context is produced upstream, and must include stakes or drop the dependency).

**H6 — `representation` is known and correct at verify time.** Trust Memory keys on `lesson × representation`, but representation is a classifier output that can be wrong/absent for images. Misclassification → wrong calibration cell. → **R3**.

---

## 2. Single-responsibility / single-producer violations

**V1 — The Canonicalizer is an unlisted 11th component AND a dual producer.** §5 calls `Canonicalizer.enrich(context)` to produce lesson/difficulty/checkability, but §2's component table has no Canonicalizer, and **difficulty is already owned by ai-tutor's DifficultyDetector**. Two producers of difficulty classification. → **B5** + **O3**.

**V2 — The engine is a macro-level god-object: it owns "decide" AND "quantify trust."** Components 5 (Calibration/Trust Memory) and 6 (Decider) are both "the engine." Policy and empirics are different responsibilities with different change-cadences and different consumers (the Analyzer and Learning Timeline may also want per-lesson reliability). → **O1**.

**V3 — The Ledger both stores raw bundles and derives Failure-DNA fields.** §10.4 has the Ledger computing "root cause / first-divergence step" — that is *analysis*, not *ledgering*. Two responsibilities in component 9. → **O4**.

**V4 — The engine becomes a third writer of `weakness_signals`.** §10.2 emits `source='VERIFICATION'` rows and calls it "honoring the freeze." **The frozen snapshot's operational checklist explicitly alerts on "No new writer of `weakness_signals` appears outside `chat.html` and `exam-mistakes-logger.js`."** This is a freeze *violation*, not freeze-honoring. → **D1** (the most concrete self-inflicted error in the RFC).

---

## 3. Circular dependencies

**Ci1 — Policy ⇄ calibration entanglement.** Calibration is observed only for evidence_states the policy actually produces. The Cost Engine (later) uses Trust Memory to decide which verifiers to run, which determines evidence_states, which is what calibration is fit on. You cannot safely change the policy to produce a new state (no calibration for it) and cannot calibrate a state the policy never produces. The RFC treats policy and calibration as cleanly separable layers; they are mutually recursive. → **R2**.

**Ci2 — The Cost Engine trains on data censored by its own past decisions.** "Trained on TE-2…6 logs" — but those logs only contain outcomes for stages the engine *chose to run*. It has no counterfactual data on what a skipped deep stage *would* have found on the easy questions it early-exited. Off-policy / censored-sampling. Without forced exploration it will confidently under-verify exactly where it historically under-verified. → **R2**.

**Ci3 — Trust Memory: static or self-referential, pick one.** §9.3 updates reliability from "successes/trials." Successes come from *labels* (then Trust Memory only moves on the tiny benchmark → the "continuous learning" claim is hollow) or from *verdicts* (then it is the self-labeling loop §9.5 forbids). The RFC wants continuous learning AND no self-labeling and never reconciles them. → **R2** + design note in **O1**.

---

## 4. Scalability to dozens of verifiers

**Sc1 — False-refute probability compounds and refutes bypass calibration.** With ~30 verifiers, P(*some* verifier emits a false REFUTE) → high. §5's loop returns REJECTED on the first deterministic refute, **before `decide()`/calibration ever runs**. So one flaky same-tier verifier confidently rejects correct answers, unmoderated by its own reliability. This is the single worst scaling failure. → **B2**.

**Sc2 — The calibration state space outruns the benchmark.** evidence_state = the tuple of which verifiers ran with which polarities. At dozens of verifiers the reachable-state count explodes; per-state cells starve; Beta-Binomial shrinkage sends starved cells to the global prior → calibration ≈ uninformative exactly where the combination is novel. → **R1**.

**Sc3 — The SRP seam is enforced by human PR review, not by structure.** §11 rule 1 ("reviewers reject a PR that branches on verifier_id") is a *hope about process*, not a property. At scale someone encodes verifier-specific ordering in the Planner's heuristics — branching on behavior in spirit. The design needs the seam to be structurally hard to violate, or it will leak. → note under **O1/O2**.

---

## 5. Calibration failure modes

**Ca1 — The benchmark is orders of magnitude too small to certify a 99% *per-lesson* marker.** 1–2k uniformly sampled, stratified by lesson×difficulty, over ~33 lessons × 4 difficulties = ~132 cells → ~8–15 items/cell. If Zero is ~95% accurate, that is **~0.5–1 labeled *error* per cell.** You cannot calibrate a 99% claim (which is a statement about the *error tail*) on ≤1 error per cell. The prior review's "start at 1–2k" is right for *coarse* calibration and wrong for the *per-lesson verified marker*. → **R1** (reconcile: 1–2k for gross signal; the 99% marker needs error-enriched/hard-negative mining, not uniform sampling).

**Ca2 — Base-rate masking.** With a 95%-correct prior, a *useless* verifier looks ~95% "calibrated." The reliability curve can look healthy while the verifier adds ~zero discriminative value. Calibration must be measured on **lift over the no-verification prior**, not raw accuracy. The RFC's §9.2 acceptance test ("VERIFIED hits 99%") doesn't measure lift. → **R1**.

**Ca3 — Covariate shift voids the conformal guarantee.** §9.4 sells "distribution-free coverage." Conformal coverage requires exchangeability between calibration and test data. Benchmark→production drift (H3) and per-cohort/per-exam-cycle drift break it. The guarantee is real *only* on the benchmark distribution; in production it is a heuristic. → **R3**.

**Ca4 — Adaptive selection breaks conformal too.** The "predictor" is *chosen adaptively* — escalation decides which evidence to trust based on the data seen. Standard split-conformal assumes a fixed predictor; a data-dependent one needs the far more delicate adaptive-conformal machinery. Naive coverage will not hold. → **R3**.

**Ca5 — Drift is detected only in a lagging audit.** §9.5 measures drift via a "held-out human-audited slice" — but by the time the audit surfaces drift, miscalibrated `VERIFIED` verdicts have already shipped for the audit-lag window. No online circuit breaker. → **R3**/**R5**.

---

## 6. Evidence-lattice edge cases

**L1 — Rule ordering is buggy: a lower-tier refute preempts a higher-tier support.** §4.4 checks rule 2 (any Tier-0/1 REFUTES → REJECTED) *before* rule 3 (highest consistent support). So a **Tier-0 machine-checked Lean proof that SUPPORTS is overridden by a Tier-1 CAS that REFUTES** (CAS had a domain-assumption bug). The design rejects a formally-proven-correct answer. Refute-dominance must be *tier-stratified*: a refute at tier T is dominant only if **no strictly-higher tier supports**. → **B1**.

**L2 — It is not a lattice.** The tiers form a *total* order (0>1>2>3>4); INPUT_INTEGRITY and HISTORICAL_RELIABILITY are declared "outside the order." A lattice needs defined join/meet; none exist. It is a **priority ranking + two side-channels**, which is fine — but calling it a lattice implies algebra that isn't specified and invites wrong intuitions. → **D5** (reframe honestly).

**L3 — INCONCLUSIVE has no calibration home.** When most verifiers return INCONCLUSIVE (not applicable / timed out), §8.1 `sufficient()` returns true ("nothing left to learn"), and `decide()` runs on a near-empty state. All such questions collapse into one giant "mostly-inconclusive" bucket mixing wildly different items → that bucket is intrinsically miscalibrated. INCONCLUSIVE is neither a tier nor a modeled state. → **D5**.

**L4 — Within-tier partial disagreement is unhandled.** Eight Tier-1 verifiers: random-point SUPPORTS, CAS INCONCLUSIVE (timeout), unit-checker REFUTES. §4.4 gives the refute dispositive power regardless of the unit-checker's reliability vs. substitute-back's. The Combiner has no within-tier reliability weighting because it is defined as *pure* (calibration applied after). → **B2** (same root as Sc1).

**L5 — Agreement via a shared fallacy is invisible.** Polarity is measured on the *final answer*, not the reasoning. Two solvers reaching the same wrong answer by the same wrong method register as agreement. The Evidence-Builder (reasoning-tree comparison) that would catch this was deferred to research in the prior review — so for the un-checkable subset the lattice inherits exactly the correlated-error blindness it was meant to fix. → **R4**.

---

## 7. Over-confidence failure scenarios

**OC1 — Mis-canonicalization → confident REJECTED/VERIFIED of the wrong problem.** (H2.) The deterministic tier's dispositive authority is applied to an LLM-extracted statement. A dropped minus sign in extraction → substitute-back "proves" the correct student answer wrong → confident false REJECTED. Worst possible outcome (block a right answer) at maximum authority. → **B4**.

**OC2 — Cross-provider correlation on trick/misconception items.** Tier-2 assumes independence. GPT/Claude/Gemini share web-scale training data and fail *together* on questions where the common misconception is what's in the corpus (classic "trap" items). Provider diversity decorrelates *model-specific* errors, not *shared-data* errors — and Tier-2 is labeled "strong corroboration." → **R4**.

**OC3 — The verified marker amplifies the cost of residual error (automation bias).** A `verified ✓` marker suppresses the student's own skepticism. A miscalibrated VERIFIED is therefore *more* harmful than an unmarked wrong answer. The RFC never states the **asymmetric loss**: a false-VERIFIED must cost far more than a false-UNVERIFIED, which should drive the publish threshold. → **R5**.

**OC4 — Post-correction can move a student from right to wrong, with authority.** §7 fires a correction when async "dominates" inline. If async mis-canonicalized (OC1) or is itself miscalibrated, it overwrites a correct inline answer with a confident wrong one. A wrong correction is worse than none. The "lattice-dominant" guard is insufficient because a mis-canonicalized deterministic refute *is* lattice-dominant. → **R5** (post-correction needs a much higher, reliability-gated bar).

---

## 8. Shadow-mode rollout risks

**SM1 — "Shadow" is not side-effect-free for the signal path.** Emitting a VERIFICATION `weakness_signal` (§10.2) flows Analyzer → `weakness_reports` → Focus → **what the student sees**. So the §10.2 integration cannot be shadow-tested without affecting students, contradicting §11 rule 6 (shadow-first). Verdict-shadow and signal-emission must be *separately* gated. → **D4**.

**SM2 — Shadow calibration doesn't transfer to inline because the budget changes.** Shadow runs in background with generous timeouts; inline runs sub-second. The *same* verifiers time out more inline → higher INCONCLUSIVE rate → a **different evidence_state distribution** than the one calibrated in shadow. You calibrate under generous budgets and deploy under tight ones. → **R3** (recalibrate under the inline budget before TE-4 acts).

**SM3 — Aggregate shadow metrics mask tail catastrophes.** In shadow nothing acts, so a verifier that is 99% right but *confidently wrong* on the 1% produces a healthy-looking reliability curve while hiding the exact catastrophic-verified cases that will bite at TE-4. Shadow yields calibration data but weak correctness pressure on the tail. → **R5** (add targeted adversarial/tail auditing, not just aggregate curves, as a promotion gate).

**SM4 — Promotion is gated on the wrong distribution.** Promoting a verifier needs its reliability curve, which needs *labeled* outcomes — available only on the benchmark, not on unlabeled production-shadow traffic. So promotion certifies *benchmark* calibration and infers production calibration (H3). → **R1/R3**.

---

## 9. Database ownership boundaries

**DB-1 — `weakness_signals` third-writer.** (V4/D1.) Frozen invariant violated.

**DB-2 — `verification_meta` dual-writer during transition.** The existing L3 shadow code writes it; the new engine (Appendix A) also writes it. Two writers of one jsonb column → clobber risk, unclear ownership across TE-2…TE-4. → **D3**.

**DB-3 — "No new schema needed" is false.** Appendix A maps the "full evidence bundle" onto `verification_meta`, which Phase 0 **capped at 4 KB**. A multi-verifier bundle (dozens of rationales + traces) blows 4 KB immediately. You need the `verification_runs` table that `adaptive-verification.md` already proposed. → **D2**.

**DB-4 — Calibration/Trust Memory have two touching writers.** Component 5 updates from labels; component 10 (Outcome Ingest) also writes calibration. Single-producer for the calibration SSOT is not established. → **O1** (make it a standalone service with one writer).

**DB-5 — `verification_jobs` retention is unowned.** New queue table (§7) holding question payloads (large rows). `analyzer_runs` already flagged retention as unmanaged debt; this repeats it at higher volume. Not addressed. → operational note under **R2/O2**.

**DB-6 — Learning-Timeline cross-domain join.** §10.5 keeps mastery in the Analyzer domain and verified-ness in an engine store, so the timeline must join two ownership domains at read time. Under-specified: who owns the join, and does it create a de-facto new consumer coupling? → **O1** (a standalone reliability service both can read cleanly).

---

## 10. What belongs OUTSIDE the Truth Engine

**O1 — Calibration Store + Trust Memory → standalone Trust/Reliability service.** It is a cross-cutting *data asset* (the Analyzer's weakness scoring and the Learning Timeline both plausibly consume per-lesson reliability). Keeping it inside makes the engine own both policy *and* empirics (V2) and forces cross-domain reach-ins (DB-6). Move it out; the engine *consumes* P(correct), it does not *own* the trust model. Single writer = Outcome Ingest.

**O2 — Cost Engine → external advisory policy, and deferred entirely to TE-7.** Its concerns (budget) are orthogonal to correctness; embedding it risks cost logic contaminating correctness decisions. For TE-1…TE-6 it should not exist (static routing). List it as an *external* policy the Decider optionally queries, not component 7.

**O3 — Canonicalizer + difficulty/lesson classification → upstream ingestion (shared with ai-tutor).** The engine must *receive* a canonical context (lesson, representation, difficulty, checkability, stakes, **and a canonicalization-confidence score**), not produce it. This removes the dual-producer (V1), fixes the undefined `stakes` origin (H5), and — critically — makes canonicalization confidence an explicit input the lattice can condition on (B4).

**O4 — Failure-DNA *derivation* → offline analyzer over a pure append-only Ledger.** Split component 9 into (a) a pure append-only evidence store and (b) an offline job that derives root-cause/first-divergence (noisy) fields. The live path never does analysis.

**O5 — Input Integrity → stays in ingestion (it already partly lives in `ai-tutor` as `ocrAmbiguityCheck`).** The engine should consume an integrity score, not re-own OCR. Otherwise two systems own OCR.

---

## Required changes before TE-1 (the actionable list)

TE-1 builds the **Combiner** and the **data contracts** (`EvidenceClaim`, `Verdict`, calibration schema). These findings are baked into exactly those artifacts and cannot be retrofitted cheaply later:

- **B1 — Tier-stratify refute-dominance.** A refute at tier T is dominant only if no strictly-higher tier supports. Rewrite §4.4 rule ordering. *(Combiner logic.)*
- **B2 — Refutes must be reliability-gated, not short-circuited.** Remove the in-loop `return REJECTED`. A REJECTED is a *calibrated decision*: require the refute to come from a verifier above a false-refute-rate floor (or ≥2 independent refutes). The Combiner produces a *state*; `decide()` — with calibration — owns REJECTED. *(Combiner + Decider contract.)*
- **B3 — Make `target` a structured answer.** Support multi-part / set / interval / ordered-pair answers; the verdict composes per-component. Decide the answer-object schema in the TE-0 data contract. *(EvidenceClaim/Verdict schema.)*
- **B4 — Condition the deterministic tier on canonicalization confidence.** The deterministic tier is dispositive *only* when the canonical form is high-confidence/verified; otherwise its authority is capped and calibration keys must include canonicalization confidence. *(Lattice semantics + calibration keys.)*
- **B5 — The engine receives context; it does not classify.** Canonicalization, difficulty, representation, stakes, integrity, and canonicalization-confidence are produced upstream (O3/O5). The engine's input contract is a *finished* canonical context. *(Input contract — the first thing TE-1 touches.)*

**Correct in the RFC text now:** D1 (weakness_signals is a freeze-break, not freeze-honoring — route via the standalone Trust/signal store or file a freeze-break), D2 (evidence bundle needs `verification_runs`; "no new schema" is false), D3 (resolve `verification_meta` ownership across the transition), D4 (gate signal-emission separately from verdict-shadow), D5 (reframe "lattice" as a priority order + side-channels; give INCONCLUSIVE an explicit modeled state).

**Log with owners:** R1 (error-enriched benchmark for the 99% marker; measure lift not raw accuracy), R2 (forced-exploration sampling so the Cost Engine sees unconfounded data), R3 (online drift monitor + circuit breaker; recalibrate under the inline budget; treat conformal as heuristic in production), R4 (down-rate Tier-2 on trick/misconception items; reasoning-level checks are the real fix, still research), R5 (asymmetric false-VERIFIED loss in the publish threshold; conservative reliability-gated post-correction bar; tail/adversarial auditing as a promotion gate).

**Boundary moves (TE-0 contract):** O1–O4 above.

---

## What genuinely holds, and why (as required)

Not everything broke. The parts that survived every attack:

- **Engine-owns-no-verification-logic.** I could not construct a scenario where this seam causes a failure — every failure above is in the *rules*, the *data model*, the *boundaries*, or the *empirics*, never in the mechanism/policy split itself. Keep it exactly as is.
- **Typed evidence over a scalar score.** The *principle* is what saved the design from the correlated-agreement trap; the bugs (B1/B2/L1) are in the *combination rules layered on top*, not in the idea of tiers. Fix the rules; keep the tiers.
- **Calibrate against human ground truth; never self-label.** The §9.5 guardrail is correct and load-bearing. The failures (R1–R3) are about *sufficiency and drift of the data*, not about the principle — which, if anything, the review makes more important.
- **Runtime-agnostic verifiers behind async.** This is what lets CAS/Lean join later without touching the core; no attack landed on it.

The architecture is **sound in its bones and wrong in five specific joints.** Fix the joints (B1–B5), correct the overstated claims (D1–D5), move four components to where they belong (O1–O4), and carry five risks forward with owners — then TE-1 is safe to start. Do **not** begin TE-1 with the current §4.4 combination rules or the current single-target contract; those are the two that are cheapest to fix now and most expensive to fix after the engine exists.
