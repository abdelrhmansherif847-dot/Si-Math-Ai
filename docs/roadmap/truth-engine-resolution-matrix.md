# Truth Engine — Resolution Matrix (v1 → v2 decision document)

**Status:** Architecture decision document. Resolves the objections in `truth-engine-adversarial-review.md` against `truth-engine-architecture.md` (RFC **v1**).
**Output:** one recommended resolution per finding + a dependency graph. **No RFC edits, no code, no rewritten sections.** RFC v2 is produced only after this matrix is approved.
**Per-finding template:** root cause · why it exists · trade-off · options (adv/disadv) · recommendation · why the rejected options are weaker · principle impact · ADR impact · phase.

### ADR landscape (what "changing an ADR" means here)

| Ref | Doc | Status | Relationship |
|---|---|---|---|
| **ADR-P5** | `phase-5-adr.md` | Accepted | ID-first taxonomy. Explicitly binds Truth Engine / Analyzer / Failure DNA / Learning Timeline. Resolutions are **governed by** it; none change it. |
| **FROZEN-CWF** | `ARCHITECTURE_SNAPSHOT_CHAT_WEAKNESS_FOCUS.md` | Frozen | Single-producer weakness pipeline. **D1** must respect it (a future integration = governed freeze-break, not an edit here). |
| **SETTLED** | `truth-system-rfc-review.md` §0.5 | Accepted | Calibration-first + hybrid execution. Resolutions **reinforce** it; none contradict. |
| **RFC-v1** | `truth-engine-architecture.md` | Draft (v1) | Not an ADR. Its implicit decisions (§4 combination, §9 calibration) are what this matrix revises; the revisions become **new** ADR-TE-0x records that v2 encodes. |

Seven new ADRs are proposed (mapping at the end). No existing ADR requires modification.

---

# Part I — Blockers (must resolve before TE-1)

## B1 — Tier-stratified refute-dominance

- **Root cause.** §4.4 evaluates "any Tier-0/1 REFUTES → REJECTED" (rule 2) *before* "highest consistent support" (rule 3). A refute at a low tier preempts a support at a higher tier.
- **Why it exists.** The combination rules were authored as a flat imperative checklist optimizing the common case (a deterministic refute should beat consensus), without modeling the rare cross-tier conflict (a formal proof vs. a buggy CAS refute).
- **Trade-off.** Simplicity of a flat rule order vs. correctness on cross-tier conflicts.

| Option | Adv | Disadv |
|---|---|---|
| **1. Tier-stratified: a refute at tier T dominates only if no strictly-higher tier supports** | correct; preserves "proof dominates"; local rule change | slightly more complex join |
| 2. Highest-tier-claim-wins (discard all lower tiers) | trivially simple | loses corroboration + within-tier combination |
| 3. Weighted cross-tier vote | flexible | **reintroduces the additive score** — the exact anti-pattern v1 rejects |
| 4. Escalate on any cross-tier contradiction | safe | expensive; undefined at the top tier (formal proof has nothing to escalate to) |
- **Recommendation.** **Option 1**, with Option 4 as a *fallback only when the top available tier is internally conflicted* (e.g., two Tier-1 checks disagree and no Tier-0 exists).
- **Why rejected are weaker.** 2 throws away signal the lattice exists to combine; 3 is the anti-pattern; 4 alone is too costly and has no terminus at the apex.
- **Principle impact.** None new — it makes "typed evidence / proof dominates" *internally consistent*. Refinement of the combination rule.
- **ADR impact.** New **ADR-TE-01** (Evidence Combination & Decision). No existing ADR touched.
- **Phase.** **TE-1** (Combiner logic).

## B2 — Refutes are reliability-gated, not short-circuited

- **Root cause.** §5's loop does `return REJECTED` on the first deterministic refute, *before* `decide()`/calibration. The "pure" Combiner emits a terminal verdict.
- **Why it exists.** I modeled a deterministic refute as absolute truth and wanted a fast exit, forgetting real verifiers carry a nonzero false-refute rate (bugs, edge cases, mis-canonicalization → B4).
- **Trade-off.** Latency of early-exit-on-refute vs. correctness (a false refute *blocks a correct answer*, the worst outcome); Combiner purity vs. reliability-awareness.

| Option | Adv | Disadv |
|---|---|---|
| **1. Combiner produces state (incl. refutes); `decide()` owns REJECTED as a calibrated decision, weighting the refuter's false-refute rate** | no unmoderated single-verifier rejects; unifies publish + reject under calibration | loses the "instant reject" micro-optimization |
| 2. Keep short-circuit but gate on a per-verifier "trusted-refuter" reliability floor | fast exit for known-solid checks | the floor is set from calibration → can't exist at TE-1 before data |
| 3. Require ≥2 independent refutes to reject | reduces single-verifier error | doubles refute cost; deterministic independence is illusory (two substitute-backs of the same mis-canonicalized form both refute) |
| 4. Re-verify every REJECTED before acting | catches false rejects | adds a stage; just relocates the problem |
- **Recommendation.** **Option 1** as the model; Option 2's fast-exit is *earned* within it — a verifier whose measured false-refute rate ≈ 0 over a *high-confidence canonical form* (B4) may be granted fast-exit, but that authority comes from calibration data, never by assumption.
- **Why rejected are weaker.** 3's "independence" is fake for deterministic checks and doubles cost; 4 adds latency without changing the root; 2-alone can't bootstrap.
- **Principle impact.** **Refines a principle:** *"The Combiner produces a state; every terminal decision — publish AND reject — is calibrated."* (v1 implied reject was pre-calibration.) Mechanism/policy separation is unchanged.
- **ADR impact.** New **ADR-TE-01** (with B1).
- **Phase.** **TE-1** (Combiner/Decider contract).

## B3 — Structured answer target

- **Root cause.** `EvidenceClaim.target` models one scalar/expression. Compound answers (systems, ordered pairs, intervals, sets, domain-and-range, multi-part) don't fit; all combination + REJECTED logic is per-single-target.
- **Why it exists.** The live L3 shadow models `final_answer` as one string (`normalizeFinalAnswer`); I inherited that shape without generalizing.
- **Trade-off.** Scalar simplicity (existing `answersEquivalent` works on scalars) vs. coverage of the large compound-answer share of real exams.

| Option | Adv | Disadv |
|---|---|---|
| **1. Typed answer object `{kind: scalar\|set\|tuple\|interval\|relation\|proof, components[]}`; verdict composes per component with a declared conjunction/disjunction rule from question type** | covers real exams; keeps joint constraints; one place to reason about structure | richer contract; verifiers declare which kinds they handle |
| 2. Keep scalar; decompose multi-part upstream into N `verify()` calls | tiny engine | loses joint constraints (ordered pair must satisfy *both* equations); composition logic leaks upstream |
| 3. Opaque compound string; each verifier parses | no schema change | every verifier reinvents parsing → inconsistency; violates the uniform interface |
- **Recommendation.** **Option 1.** The answer object is part of the TE-0 data contract; verifier `applicability` already gates which kinds each handles.
- **Why rejected are weaker.** 2 discards joint constraints and leaks composition; 3 pushes parsing into N verifiers (DRY + uniformity violation).
- **Principle impact.** No new principle; *extends* the data contract and reinforces "structure as authority" (ADR-P5 ID-first spirit).
- **ADR impact.** New **ADR-TE-02** (Answer Representation).
- **Phase.** **TE-1** (EvidenceClaim/Verdict schema — expensive to retrofit later).

## B4 — Deterministic authority conditioned on canonicalization confidence

- **Root cause.** The lattice grants Tier-1 dispositive authority assuming the canonical form is ground truth — but for word/image problems that form is an **LLM extraction** (stochastic). A mis-extraction makes a "proof" about the wrong problem (OC1).
- **Why it exists.** I modeled OCR/input-integrity as a confidence source but treated the *extracted equation* as trustworthy once OCR passed — an unmodeled stochastic step.
- **Trade-off.** The deterministic layer's whole value is being dispositive; capping its authority reduces false-REJECTED but also lowers how often questions reach VERIFIED.

| Option | Adv | Disadv |
|---|---|---|
| **1. `canonicalization_confidence` is an explicit context field; deterministic authority = min(verifier reliability, canon-confidence); calibration keys include a canon-confidence band** | principled; lets high-confidence forms stay dispositive, caps shaky ones | needs a real confidence source (see mechanism below) |
| 2. Round-trip check (re-render canonical form → NL/image, compare to original) | strong extra signal | LLM round-trip cost; can share the extractor's blind spot |
| 3. Multi-extraction consensus (N independent extractions; trust only on agreement) | directly *produces* a defensible confidence | added extraction cost |
| 4. Deterministic checks only on student-typed structured input, never on extractions | fully safe | kills the deterministic layer for image/word problems = most traffic |
- **Recommendation.** **Option 1 as the framework**, with **Option 3 as the mechanism that earns** a high `canonicalization_confidence` (agreement across independent extractions), reserved for hard/high-stakes tiers. Option 2 is an optional additional signal. So confidence is *measured*, not assumed.
- **Why rejected are weaker.** 4 destroys coverage exactly where help is needed; 2-alone is a single point sharing the extractor's error; 3-alone doesn't tell the lattice *how to use* the number (needs 1).
- **Principle impact.** **NEW PRINCIPLE:** *"No deterministic verdict is stronger than the confidence in the problem statement it verifies."* This is a genuine addition and should anchor v2 §4.
- **ADR impact.** New **ADR-TE-03** (Canonicalization Trust & Input Contract, with B5). Refines RFC-v1 §4's informal "deterministic dominates."
- **Phase.** **TE-1** (lattice semantics + calibration keys). Depends on **B5**.

## B5 — The engine receives a finished canonical context; it does not classify

- **Root cause.** §5's in-engine CANONICALIZE produces lesson/difficulty/checkability, but difficulty is already produced by ai-tutor's `DifficultyDetector` → dual producer; `stakes` has no producer at all (H5).
- **Why it exists.** I described a self-contained lifecycle without checking that classification already has an upstream owner.
- **Trade-off.** Engine self-containment/portability vs. single-producer discipline.

| Option | Adv | Disadv |
|---|---|---|
| **1. Engine input = `CanonicalContext` produced upstream (ingestion/ai-tutor): lesson_id, representation, difficulty, checkability, stakes, integrity, canon-confidence** | clean single-producer; satisfies B4 (canon-confidence upstream) + O3/O5; engine stays pure consumer | engine coupled to an upstream context shape (versioned contract) |
| 2. Engine owns canonicalization; migrate `DifficultyDetector` into it | one home for classification | **requires touching `ai-tutor`** (forbidden) + over-centralizes |
| 3. Thin in-engine adapter that *delegates* to upstream classifiers | engine orchestrates without reimplementing | blurs ownership of the adapter's failures; risks the engine slowly re-owning classification |
- **Recommendation.** **Option 1.** Upstream produces `CanonicalContext` (ID-first per **ADR-P5**); the engine consumes it and classifies nothing.
- **Why rejected are weaker.** 2 violates the "don't modify ai-tutor" freeze and centralizes too much; 3's ownership blur is exactly the drift single-producer exists to prevent.
- **Principle impact.** No new principle; **applies** single-producer to the engine boundary (strengthens it). Governed by **ADR-P5** (IDs).
- **ADR impact.** New **ADR-TE-03** (shared with B4). No existing ADR changed.
- **Phase.** **TE-1** (input contract — the first thing the engine touches). **Prerequisite for B4.**

---

# Part II — Design debt (doc corrections)

## D1 — `weakness_signals` third-writer (freeze violation, mislabeled)

- **Root cause.** §10.2 makes the engine a third writer of `weakness_signals` and calls it "freeze-honoring." FROZEN-CWF's checklist explicitly forbids new writers.
- **Why it exists.** I reused the existing signal→Analyzer→reports→Focus path for reach, not noticing the freeze forbids new *writers*.
- **Trade-off.** Reuse the proven weakness pipeline vs. respect the freeze.

| Option | Adv | Disadv |
|---|---|---|
| **1. Engine writes a NEW engine-owned store (`verification_signals`); Analyzer consumes it later via a governed freeze-break, only once value is proven** | respects FROZEN-CWF; defers coupling; shadow-measure first | Focus integration deferred |
| 2. File a formal freeze-break now to add the engine as a third writer | legitimate, direct | premature coupling of the engine to a frozen subsystem; heavyweight process |
| 3. Route via an existing writer (chat.html emits verification signals) | no new writer | wrong layer; chat.html would need engine data |
| 4. Never integrate with weakness/Focus | maximal isolation | permanently loses a valuable "verification found a weakness → Focus plan" loop |
- **Recommendation.** **Option 1 now → Option 2 later.** Isolate in an engine-owned store; earn the Focus integration through the governed freeze-break when TE-4+ proves the signal's worth. (Note ADR-P5 D4/D7: analytics regrouping is itself a deferred phase — another reason not to entangle now.)
- **Why rejected are weaker.** 3 is the wrong layer; 4 forfeits real value; 2-now is premature.
- **Principle impact.** None new — **reaffirms** the freeze/single-producer principle I had violated.
- **ADR impact.** **Respects FROZEN-CWF (no change).** A future Focus integration = a freeze-break amendment to FROZEN-CWF, not to this matrix.
- **Phase.** Text correction **now**; integration **TE-4+**.

## D2 — Evidence bundle exceeds the 4 KB `verification_meta` cap

- **Root cause.** Appendix A maps the full bundle onto a Phase-0 column capped at 4 KB.
- **Why it exists.** I over-claimed "no new schema" to minimize migration surface.
- **Trade-off.** Minimize schema surface vs. store full traces.

| Option | Adv | Disadv |
|---|---|---|
| **1. `verification_runs` table (already proposed in `adaptive-verification.md`) holds the bundle; `verification_meta` keeps a ≤4 KB summary + `run_id`** | reuses a sanctioned design; keeps the hot table lean | one new table (already planned) |
| 2. Raise/remove the 4 KB cap | trivial | bloats the hottest table (row size, TOAST, vacuum); reverses a deliberate Phase-0 decision |
| 3. Bundles in object storage + pointer | scales large | new infra + fetch hop for replay |
- **Recommendation.** **Option 1** (Option 3 only if bundle volume later explodes).
- **Why rejected are weaker.** 2 harms the busiest table and undoes a Phase-0 choice; 3 is premature infra.
- **Principle impact.** None — reaffirms additive-schema + lean-hot-table.
- **ADR impact.** Aligns with `adaptive-verification.md`. Correct Appendix A in v2.
- **Phase.** Decision **now**; table built **TE-2**.

## D3 — `verification_meta` dual-writer during transition

- **Root cause.** Existing L3 shadow writes it; the new engine also would.
- **Recommendation.** **Subsumption:** promoting L3 shadow into the engine as its first registered verifiers (already the TE-2 plan) means the engine *replaces* the standalone shadow writer — single-writer holds throughout; gate the brief overlap so only one path writes. Rejected: jsonb namespacing (permanent mess) / engine-writes-only-new-table (loses column integration).
- **Principle impact.** None — applies single-producer to the column.
- **ADR impact.** None; clarifies the TE-2 migration.
- **Phase.** **TE-2**.

## D4 — Signal emission isn't shadow-safe

- **Root cause.** §11 rule 6 (shadow-first: record, don't act) is contradicted by §10.2 signal emission, which *acts* (feeds Focus → student).
- **Recommendation.** **Per-channel gates** — `verdict_shadow`, `signal_emission`, `publish_gating`, `post_correction` independently flagged, default off. This mirrors ai-tutor's existing `DIFFICULTY_DETECTOR_ENABLED` / `VERIFICATION_ENABLED` / `VERIFICATION_SHADOW_ONLY` taxonomy. Rejected: "no writes at all = shadow" (contradicts working L3 shadow, which writes nullable cols) / one global flag (loses signal-quality shadow measurement).
- **Principle impact.** **Refines:** *"Shadow is per-side-effect-channel, not global."*
- **ADR impact.** New **ADR-TE-07** (Gating). Amends RFC-v1 §11 rule 6 in v2.
- **Phase.** Gate taxonomy **TE-1**; signal gate matters **TE-4**.

## D5 — "Lattice" misnomer + INCONCLUSIVE has no calibration home

- **Root cause.** A priority-order-with-side-channels was named a "lattice" (no defined join/meet); INCONCLUSIVE was treated as absence, so it collapses heterogeneous questions into one miscalibrated bucket.
- **Recommendation.** Rename to **"Evidence Priority Order"** + model **INCONCLUSIVE as a first-class per-verifier outcome carrying *why*** (not-applicable vs. timeout vs. low-signal — they calibrate differently). Rejected: keep the name (leaves the calibration hole) / force SUPPORT-or-REFUTE only (fabricates signal; a timeout ≠ a weak refute).
- **Principle impact.** None; naming + state-model accuracy.
- **ADR impact.** Folds into **ADR-TE-01** (state model) + **ADR-TE-04** (calibration of INCONCLUSIVE states).
- **Phase.** **TE-1** (Combiner + calibration schema).

---

# Part III — Open concerns (over-confidence scenarios)

## OC1 — Mis-canonicalization → confident REJECTED/VERIFIED of the wrong problem
**Fully resolved by B4** (canonicalization-confidence caps deterministic authority). No separate decision. Phase **TE-1**.

## OC2 — Cross-provider correlation on trick/misconception items
**Handled under R4.** Decision preview: Tier-2 (cross-provider) **caps at CORROBORATED, never VERIFIED**, and is down-rated on trick-flagged questions. Phase **TE-6**.

## OC3 — Verified-marker automation bias (asymmetric cost)
**Handled under R5.** Decision preview: an **asymmetric loss** governs the marker (false-VERIFIED ≫ false-UNVERIFIED). Phase **TE-4**.

## OC4 — False post-correction (right → wrong with authority)
**Handled under R5.** Decision preview: post-correction requires a **strictly higher, reliability-gated bar** than the original publish, and only on deterministic/formal contradictions — never consensus-vs-consensus. Phase **TE-5**.

---

# Part IV — Risks

## R1 — Benchmark too thin to certify a 99% *per-lesson* marker

- **Root cause.** ~1–2k uniform over ~132 (lesson×difficulty) cells → ~8–15 items/cell; at a ~95% prior that is **≤1 labeled *error* per cell** — you cannot calibrate a tail claim on it. Base-rate masking (Ca2) also makes useless verifiers look ~95% "calibrated."
- **Trade-off.** Cheap/fast benchmark vs. a certifiable tail claim.

| Option | Adv | Disadv |
|---|---|---|
| **1. Two-tier benchmark: small uniform *calibration* set + large *error-enriched* set (hard-negative mining: solver disagreements, deterministic refutes, student-reported errors). Metric = *lift over the no-verification prior*. Certify at *topic* granularity first, coarsen to lesson as data accrues (Bayesian shrinkage)** | statistically sound; populates the tail; honest granularity | curation effort; needs a mining pipeline |
| 2. Build 50k uniform (original RFC) | more data | multi-person-year; IP exposure; still only ~19 errors/cell |
| 3. Drop the per-lesson claim; global marker only | cheap, honest | weaker product claim |
- **Recommendation.** **Option 1.** Error-enriched benchmark + lift metric + granularity that follows the data.
- **Why rejected are weaker.** 2 is slow/expensive/IP-risky and still tail-thin; 3 forfeits product value unnecessarily.
- **Principle impact.** **Refines:** *"Certify calibration at the granularity the data supports; coarsen when thin."*
- **ADR impact.** New **ADR-TE-04** (Ground-Truth, Calibration & Benchmark).
- **Phase.** **Design at TE-1** (it shapes the benchmark you build); **gate at TE-4**.

## R2 — Cost Engine censored data + Trust Memory static-vs-circular

- **Root cause.** Logs contain only stages the policy ran (censored); Trust Memory needs labels but labels are scarce → either static (labels-only) or self-referential (verdicts).
- **Trade-off.** Learn cheaply from observational logs vs. collect unconfounded data.

| Option | Adv | Disadv |
|---|---|---|
| **1. ε-exploration: on a random fraction of traffic run the *full* pipeline regardless of early-exit; use it for Cost-Engine training + Trust Memory. Trust Memory updates from (a) benchmark labels and (b) *passed deterministic/formal checks as ground truth* — never from unproven LLM verdicts** | unconfounded data; scales Trust Memory via proofs; threads the §9.5 guardrail | a small exploration cost budget |
| 2. Inverse-propensity weighting on observational logs | no exploration cost | needs known propensities; high variance; fragile |
| 3. Never learn the Cost Engine (static routing forever) | simplest, safe | caps the entire cost-optimization thesis |
- **Recommendation.** **Option 1.** The key move: *a passed deterministic/formal check is a label*; an unproven verdict is not. This lets Trust Memory learn at scale (from proofs) without self-labeling — resolving the static-vs-circular dilemma.
- **Why rejected are weaker.** 2 is statistically fragile; 3 forfeits the cost thesis the user explicitly wants.
- **Principle impact.** **NEW PRINCIPLE:** *"A passed deterministic/formal check is ground truth for calibration; an unproven LLM verdict never is."*
- **ADR impact.** New **ADR-TE-04** (with R1). Amends RFC-v1 §9.5.
- **Phase.** Cost Engine **TE-7**; but the **"proof = label" rule and the ε-exploration hook are designed at TE-1** (they shape the ledger + calibration schema).

## R3 — Covariate shift + adaptive conformal + shadow→inline budget shift

- **Root cause.** Benchmark ≠ production; data-dependent escalation breaks split-conformal exchangeability; shadow (generous timeouts) ≠ inline (sub-second) → different INCONCLUSIVE distribution.
- **Recommendation.** **Online calibration circuit breaker:** track realized accuracy of VERIFIED verdicts on a rolling human-audited sample; auto-**demote the marker** (stop showing "verified") if it drops below the promised floor, until recalibrated. **Recalibrate under the inline budget before TE-4 acts.** Frame conformal honestly as a *benchmark-distribution* property, not a production guarantee. (Explore Mondrian/adaptive conformal for the gate, but the breaker is the real safety net.) Rejected: rely on periodic manual recalibration (Ca5 lag) / adaptive-conformal-only (doesn't handle drift).
- **Principle impact.** **Refines:** *"Conformal coverage holds on the benchmark distribution; production safety is an online circuit breaker."*
- **ADR impact.** New **ADR-TE-04** (with R1/R2).
- **Phase.** Recalibration design **TE-1**; breaker **TE-4**.

## R4 — Cross-provider correlation on trick items

- **Root cause.** Tier-2 assumes independence; frontier models share training data and fail together on misconception/trap items.
- **Recommendation.** **Cap cross-provider consensus at CORROBORATED (never VERIFIED)** — already the lattice intent (only deterministic/formal reach VERIFIED); make it explicit — and **down-rate Tier-2 on questions flagged trick/misconception-prone** (a question feature). The true fix (reasoning-level divergence) stays research. Rejected: accept-and-document (leaves the tail exposed); "add an independent non-LLM solver" only helps checkable questions (where you'd use the deterministic check anyway).
- **Principle impact.** None new — reaffirms *"only deterministic/formal evidence reaches VERIFIED; consensus caps at CORROBORATED."*
- **ADR impact.** Minor amendment to **ADR-TE-01**.
- **Phase.** **TE-6** (when cross-provider is added).

## R5 — Verified-marker automation bias + asymmetric cost + false post-correction

- **Root cause.** The marker suppresses student skepticism, so residual error is more costly; post-correction can move a student right → wrong; v1 models no asymmetric loss.
- **Trade-off.** Show a strong trust marker (product value) vs. the amplified liability of a false marker.

| Option | Adv | Disadv |
|---|---|---|
| **1. Asymmetric loss sets the VERIFIED threshold (false-VERIFIED ≫ false-UNVERIFIED); post-correction requires a strictly higher, reliability-gated, deterministic/formal-only bar; tail/adversarial auditing as a promotion gate; stakes-dependent flag-vs-correct (high-stakes: flag; low-stakes: correct)** | keeps the moat while pricing liability; resolves the earlier open post-correction question | more calibration machinery |
| 2. Show no verified marker; publish silently | removes automation bias | discards the trust differentiator (the moat) |
| 3. Never post-correct; only flag | safest against right→wrong | loses the ability to fix a wrong published answer |
- **Recommendation.** **Option 1**, adopting Option 3's *flag-instead-of-correct* as the **high-stakes mode** of the stakes-dependent knob.
- **Why rejected are weaker.** 2 discards the product's reason to exist; 3-always forfeits the fix-it capability that a hybrid async lane is *for*.
- **Principle impact.** **NEW PRINCIPLE:** *"The verified marker is governed by an asymmetric loss; a false VERIFIED is the most expensive error in the system."* Anchors the threshold/calibration design.
- **ADR impact.** New **ADR-TE-05** (Marker Governance & Publish Loss).
- **Phase.** Marker **TE-4**; post-correction **TE-5**.

---

# Part V — Component boundary moves

| ID | Move | Recommendation | Why the alternative (keep inside) is weaker | Principle | ADR | Phase |
|---|---|---|---|---|---|---|
| **O1** | Calibration + Trust Memory → **standalone Reliability Service** (single writer: Outcome Ingest; readers: engine, later Analyzer/Timeline) | **Extract.** | Keeping inside makes the engine a god-object owning policy *and* empirics (V2), and forces cross-domain read joins (DB-6). | Applies single-responsibility at macro scale | **ADR-TE-06** | **TE-1** (schema + boundary) |
| **O2** | Cost Engine → **external advisory, deferred to TE-7** | **Defer + externalize.** | Embedding cost logic risks contaminating correctness decisions; not needed before TE-7. | None (defers a component) | ADR-TE-06 | **TE-7** |
| **O3** | Canonicalizer + classification → **upstream ingestion** | **Move upstream** (= B5). | Dual-producer of difficulty; undefined `stakes` origin. | Single-producer | ADR-TE-03 | **TE-1** |
| **O4** | Failure-DNA *derivation* → **offline job over an append-only ledger** | **Split store from derive.** | The Ledger doing root-cause analysis is two responsibilities on the live path. | Single-responsibility | ADR-TE-06 | shape **TE-1**, build **TE-5** |
| **O5** | Input Integrity → **stays in ingestion**; engine consumes a score | **Keep upstream** (= B5). | Re-owning OCR means two systems own OCR. | Single-producer | ADR-TE-03 | **TE-1** |

---

# Part VI — Principle-change summary

| Change | Type | Source | Statement |
|---|---|---|---|
| P-α | **NEW** | B4 | No deterministic verdict is stronger than the confidence in the problem statement it verifies. |
| P-β | **NEW** | R2 | A passed deterministic/formal check is ground truth for calibration; an unproven LLM verdict never is. |
| P-γ | **NEW** | R5 | The verified marker is governed by an asymmetric loss; a false VERIFIED is the most expensive error in the system. |
| P-δ | Refine | B2 | The Combiner produces a state; every terminal decision — publish AND reject — is calibrated. |
| P-ε | Refine | D4 | Shadow is per-side-effect-channel, not global. |
| P-ζ | Refine | R1/R3 | Certify calibration at the granularity the data supports; conformal holds on the benchmark distribution, with an online circuit breaker in production. |

**Unchanged (survived the review):** mechanism/policy separation; typed evidence over a scalar score; runtime-agnostic verifiers; isolation/additive-schema; ID-first taxonomy (ADR-P5); calibration-first + hybrid execution (SETTLED). The three *new* principles all **sharpen** the existing ones — none reverse a prior decision.

---

# Part VII — ADR impact summary

No existing ADR is modified. Seven new ADRs are proposed for RFC v2:

| New ADR | Covers | Depends on |
|---|---|---|
| **ADR-TE-01** Evidence Combination & Decision | B1, B2, D5-state, R4-cap | — |
| **ADR-TE-02** Answer Representation | B3 | — |
| **ADR-TE-03** Canonicalization Trust & Engine Input Contract | B4, B5, O3, O5, H5 | ADR-P5 (IDs) |
| **ADR-TE-04** Ground-Truth, Calibration & Benchmark | R1, R2, R3, D5-calib, P-β | ADR-TE-06 (reliability svc) |
| **ADR-TE-05** Marker Governance & Publish Loss | R5, OC3, OC4, P-γ | ADR-TE-04 |
| **ADR-TE-06** Component Boundaries & Ownership | O1, O2, O4, D2, D3 | — |
| **ADR-TE-07** Gating & Integration Discipline | D4, D1 (freeze-respect) | FROZEN-CWF (respect) |

---

# Part VIII — Dependency graph & TE-1 gate

```
                         ┌─────────────────────────────────────────────┐
                         │  FOUNDATION (no dependencies of their own)    │
                         │                                               │
   ADR-TE-03 ───────────►│  B5 CanonicalContext (engine consumes)        │
   (input/canon trust)   │  O3 · O5 (classification/integrity upstream)  │
                         └───────────────┬───────────────┬──────────────┘
                                         │               │
                 B5 enables B4           │               │  O1 enables all
                 ▼                       ▼               ▼  calibration work
        ┌────────────────┐   ┌────────────────────┐  ┌──────────────────────┐
        │ ADR-TE-03: B4  │   │ ADR-TE-01: B1 · B2 │  │ ADR-TE-06: O1        │
        │ canon-conf     │   │ D5-state · R4-cap  │  │ Reliability Service  │
        │ caps det. auth │   │ (Combiner/Decider) │  │ (standalone schema)  │
        └───────┬────────┘   └─────────┬──────────┘  └──────────┬───────────┘
                │                       │                        │
        ┌───────┴───────┐              │            ┌────────────┴─────────────┐
        │ ADR-TE-02: B3 │              │            │ ADR-TE-04: R1 · R2 · R3  │
        │ answer schema │              │            │ D5-calib · P-β           │
        └───────┬───────┘              │            │ (benchmark+calib design) │
                │                      │            └────────────┬─────────────┘
                └──────────┬───────────┴──────────────┬──────────┘
                           ▼                          ▼
      ═══════════════════ TE-1 GATE (all of the above must be resolved) ═══════════════════
                           │
        Engine core (pure, inert) · EvidenceClaim/Verdict contracts · calibration schema ·
        error-enriched benchmark · per-channel gate taxonomy (ADR-TE-07 skeleton)
                           │
      ─────────────────────┼──────────────────  SAFE TO DEFER  ──────────────────────────────
                           │
   TE-2 ── D3 (meta single-writer via L3 subsumption) · D2 (verification_runs table built)
   TE-4 ── R3-breaker · R5-marker (ADR-TE-05) · D4-signal-gate live · R1-gate (99% cert)
   TE-5 ── OC4/R5 post-correction bar · O4 Failure-DNA offline derivation
   TE-6 ── R4/OC2 cross-provider cap + trick down-rating
   TE-7 ── O2 Cost Engine (external, learned; ε-exploration data from TE-1 hook)

   D1 (weakness_signals): text correction NOW; engine-owned store NOW; Focus integration
       TE-4+ via governed FROZEN-CWF freeze-break.
```

### Must-resolve-before-TE-1 (baked into TE-1 artifacts)
**B1, B2, B3, B4, B5, D5, O1, O3, O5** — and the *design* (not build) of **R1, R2, R3, D2** (they shape the benchmark, ledger, and calibration schema TE-1 creates). Rationale: each defines the Combiner, the data contract, the input contract, or the calibration schema — the exact things TE-1 builds. Retrofitting any of them after the engine exists means rewriting the core.

### Safe-to-defer (later phase, no TE-1 artifact dependency)
**D1-integration** (TE-4+ freeze-break), **D3** (TE-2), **D4-signal-gate** (TE-4), **R3-breaker** (TE-4), **R4/OC2** (TE-6), **R5/OC3/OC4-marker+post-correction** (TE-4/TE-5), **O2** (TE-7), **O4-derivation** (TE-5). Rationale: these attach to integration surfaces or verifiers that do not exist at TE-1; deferring them costs nothing and keeps TE-1 minimal.

### Critical path to TE-1
`ADR-TE-03 (B5 input contract)` → unlocks `B4` and `ADR-TE-06 (O1 reliability service)` → unlocks `ADR-TE-04 (calibration/benchmark)`. In parallel, `ADR-TE-01 (B1/B2)` and `ADR-TE-02 (B3)` have no prerequisites and can be settled immediately. **B5 and O1 are the two roots** — resolve them first; everything else on the TE-1 gate hangs off them.

---

## Bottom line

Twenty-four findings, one recommended resolution each, zero requiring an existing-ADR change and zero reversing a prior decision — the three new principles all sharpen what v1 already stood for. Nine items (plus four designs) gate TE-1; the rest defer cleanly to the phases where their surfaces first exist. **Approve this matrix and RFC v2 becomes a mechanical encoding of it: seven ADR-TE records, a corrected §4 (priority order + calibrated terminal decisions), a structured answer contract, an upstream `CanonicalContext`, a standalone Reliability Service, and an error-enriched benchmark — after which the first verifier (Random Point, TE-3) plugs into a spec with no known load-bearing defects.**
