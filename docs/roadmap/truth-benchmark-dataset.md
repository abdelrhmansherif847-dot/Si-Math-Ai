# Truth Benchmark Dataset — Research & Architecture Proposal

**Status:** **FROZEN — Benchmark Architecture phase closed (2026-07-03).** Preserved
for historical context. **This proposal is _not_ the implementation specification.**
Where it conflicts with the Adversarial Review's Resolution Matrix
(`truth-benchmark-adversarial-review.md`), **the Resolution Matrix governs.** Revisit
only when **Benchmark R0** begins. No further architecture work.

Research + architecture proposal — no implementation (no code, database, migrations,
or AI Tutor changes); a design artifact only.

**Phase:** New, standalone. Opens the *evaluation* track. It does **not** reopen,
modify, or depend on the Truth Engine (Adaptive Verification) architecture, which
is frozen and closed.

**Author intent (frozen constraints for this phase):**

- The Truth Benchmark is **completely independent** from the Truth Engine
  implementation. It is a measuring instrument, not a component of the system it
  measures.
- It is **method-agnostic**: it must be able to score *any* current or future
  verification method — the current multi-solver/judge pipeline, a formal checker,
  a single-model judge, a symbolic checker, a human — on the same ground truth.
- Nothing here requires touching `taxonomy.js`, `kdg-representation.js`,
  `ai-tutor`, or any frozen file. Where this document references them, it is to
  *conform* to them, never to change them.

**Companion documents (context, not dependencies):**
`adaptive-verification.md` (the system under test), `phase-0-verification.md` (the
`question_records` verification columns already in production),
`kdg-multi-axis-architecture.md` and `kdg-representation-layer.md` (the axes every
benchmark item is labeled against).

---

## Table of contents

- [Part I — Research: how world-class benchmarks are designed](#part-i--research-how-world-class-benchmarks-are-designed)
- [Part II — Design principles for the Truth Benchmark](#part-ii--design-principles-for-the-truth-benchmark)
- [Part III — The proposal (the 20 requested items)](#part-iii--the-proposal)
  1. [Purpose](#1-purpose-of-the-benchmark)
  2. [Success metrics](#2-success-metrics)
  3. [Dataset size per phase (pilot → production)](#3-dataset-size-per-phase-pilot--production)
  4. [Data sources](#4-data-sources)
  5. [Labeling methodology](#5-labeling-methodology)
  6. [Ground-truth creation process](#6-ground-truth-creation-process)
  7. [Quality-control pipeline](#7-quality-control-pipeline)
  8. [Human review workflow](#8-human-review-workflow)
  9. [Versioning strategy](#9-versioning-strategy)
  10. [Dataset schema](#10-dataset-schema-logical-design-only)
  11. [Relationship with the taxonomy](#11-relationship-with-the-taxonomy)
  12. [Relationship with KDG Representation](#12-relationship-with-kdg-representation)
  13. [Difficulty distribution](#13-difficulty-distribution)
  14. [Representation distribution](#14-representation-distribution)
  15. [Common error categories](#15-common-error-categories)
  16. [Gold / Silver / Bronze confidence levels](#16-gold--silver--bronze-confidence-levels)
  17. [Train / Validation / Benchmark splits](#17-train--validation--benchmark-splits)
  18. [Long-term maintenance](#18-long-term-maintenance)
  19. [Benchmark governance](#19-benchmark-governance)
  20. [Roadmap](#20-roadmap)
- [Appendix A — Glossary](#appendix-a--glossary)
- [Appendix B — Open questions](#appendix-b--open-questions)
- [Sources](#sources)

---

## Executive summary

The Truth Engine decides, for a given question and a candidate answer, whether the
answer is correct — and, when it can, *where* the reasoning went wrong. We are
about to invest heavily in improving that decision (Levels 1–4, multi-solver
consensus, judges). **We cannot improve what we cannot measure**, and today we have
no independent ground truth against which to score a verification method. Every
claim of "the new pipeline is more accurate" is currently unfalsifiable.

The **Truth Benchmark** is that ground truth. Crucially, it is **not another
math-solving benchmark** (GSM8K, MATH, FrontierMath already measure whether a model
can *solve* a problem). It is a **verification benchmark**: a curated set of
`(question, candidate answer, ground-truth verdict, error label)` instances where
we know the right answer *and* have deliberately paired it with realistic wrong
answers, so we can measure whether a verification method **catches wrong answers,
localizes the error, and reports calibrated confidence** — on Si Math AI's actual
domain (SAT / EST / ACT, the 5-topic / 33-subtopic taxonomy, the 7 representations,
the 4 difficulty tiers).

Its nearest relatives in the literature are **PRM800K / "Let's Verify Step by
Step"** (step-level correctness labels, process vs. outcome supervision) and the
**human-validated curation of GPQA-Diamond and SWE-bench Verified** (expert
authoring, multi-reviewer agreement, aggressive filtering). Its integrity
discipline is borrowed from **FrontierMath** (peer-reviewed items, automated
answer-checking, a published label-error rate) and **LiveBench** (a living,
contamination-resistant held-out split).

---

# Part I — Research: how world-class benchmarks are designed

Before proposing our own, here is what the current state of the art actually does.
The table is a synthesis; the principles we adopt follow it.

### Comparative survey

| Benchmark | Size | Who authors | What is graded | How it's checked | Key idea we borrow |
|---|---|---|---|---|---|
| **GSM8K** | 8.5K (7.5K train / 1K test) | Human contractors | Final numeric answer to grade-school word problems (2–8 steps) | Exact-match on the answer after a `####` delimiter | Clean **final-answer canonicalization**; explicit train/test split |
| **MATH** (Hendrycks) | 12.5K (7.5K / 5K) | Sourced from competitions (AMC/AIME…) | Final answer + step-by-step solution | Exact-match on `\boxed{}` answer | **5 difficulty levels** × 7 subjects; difficulty is a first-class axis |
| **PRM800K** ("Let's Verify Step by Step") | 800K **step-level** labels over MATH solutions | Human labelers | *Every reasoning step* graded good/neutral/bad | Human step labels; trains a process reward model | **Process supervision > outcome supervision**; label the *reasoning*, not just the answer. **This is the closest analog to our benchmark.** |
| **GPQA** | 448 main / **198 Diamond** | Domain-expert PhDs only | Multiple-choice graduate science | Expert-written key; **Diamond** = both experts correct *and* majority of skilled non-experts wrong | **Google-proof** authoring; objectivity measured by **inter-expert agreement** (65% raw → 74% adjusted); a high-agreement "Diamond" subset |
| **AIME** (as a benchmark) | 15 problems/contest | Competition committee | Integer answer 0–999 | Exact integer match | **Guessing resistance** via a 1000-way answer space (no multiple choice) |
| **FrontierMath** | ~295 (Tiers 1–3) + ~43–50 (Tier 4) | Research mathematicians | Closed-form research-level answers | **Automated verification code** per problem (CAS/numeric) | **Peer review of every item** (statement, solution, checker, difficulty, tags); a **published error rate** (~1 in 20, ImageNet-comparable); **tiers** |
| **SWE-bench** | 2,294 real GitHub issues | Mined from 12 repos | A code patch | **Unit tests**: `FAIL_TO_PASS` + `PASS_TO_PASS` | Ground truth = **an executable test**, not an opinion |
| **SWE-bench Verified** | 500 | 93 developers, **3 independent reviewers each** | Same, human-screened | Same tests, after filtering | **68.3% of candidates discarded** (38.3% underspecified, 61.1% unfair tests); severity labels 0–3. **Filtering rate is high and honest** |
| **LiveBench / LiveMathBench** | Rolling | Refreshed from new contests/preprints | Objective tasks | Automated, ground-truth scoring; **G-Pass@k** (accuracy *and* consistency) | **Living, contamination-free** design; rotate items to defeat memorization |
| **AlphaProof / Harmonic Aristotle** | IMO-scale | DeepMind / Harmonic | Formal proofs | **Lean 4 formal verification** — 100% machine-checked, no human in the loop | The **gold standard of verification**: a proof that *type-checks* is correct by construction |

### Ten principles extracted

1. **Ground truth must be defensible, ideally executable.** The strongest
   benchmarks reduce "is this correct?" to something mechanical — a unit test
   (SWE-bench), a symbolic check (FrontierMath), a Lean proof (AlphaProof/Aristotle).
   Opinion-based grading is the weakest link and is used only where nothing
   executable exists (and then behind multi-reviewer agreement).
2. **Expert authoring + independent multi-review.** GPQA is written *only* by
   in-field PhDs; SWE-bench Verified used 3 reviewers per item; FrontierMath
   peer-reviews every problem. One author is never enough.
3. **Objectivity is a measured quantity, not an assumption.** GPQA publishes
   inter-expert agreement and builds a high-agreement "Diamond" subset. Agreement
   (κ) is reported, not assumed.
4. **Expect to throw most candidates away.** SWE-bench Verified kept ~31%. A high,
   *published* rejection rate is a sign of quality, not failure.
5. **Difficulty is a first-class, stratified axis.** MATH (5 levels), FrontierMath
   (4 tiers). The benchmark reports per-tier scores; a single aggregate hides where
   methods break.
6. **Guessing resistance.** Large answer spaces (AIME 0–999; FrontierMath
   closed-form) beat multiple choice, which leaks signal and rewards elimination.
7. **Label the process, not just the outcome, when you evaluate reasoning.**
   PRM800K's central finding — process supervision beats outcome supervision — is
   *the* reason a verification benchmark needs step-level labels and first-error
   localization, not just a final-answer key.
8. **Contamination is the default failure mode.** Canary strings (BIG-bench UUIDs),
   sealed held-out splits, and *living* rotation (LiveBench) exist because
   string-match decontamination is trivially defeated by paraphrase/translation.
9. **Your labels are not perfect — measure and publish their error rate.** MMLU's
   label errors spawned MMLU-Pro/MMLU-Redux; FrontierMath states ~5%. A known,
   bounded error rate is required for the benchmark to be trusted.
10. **Benchmarks decay; plan for it.** OpenAI publicly *retired* SWE-bench Verified
    once it saturated. Versioning, refresh, and a retirement policy are part of the
    design from day one, not an afterthought.

These ten principles are the acceptance criteria for our own design. Every section
in Part III is traceable to one or more of them.

---

# Part II — Design principles for the Truth Benchmark

Six principles specialize the ten above to *our* situation (a verification
benchmark for an exam-prep platform).

- **P1 — It measures verification, not solving.** The unit of evaluation is a
  `(question, candidate answer)` pair with a known verdict, not a bare question.
  Half the pairs are wrong-on-purpose. A method that only ever says "correct" must
  score near-zero.
- **P2 — Independence / firewall from the Truth Engine.** The benchmark's ground
  truth is established by processes that are **independent of any verification
  method under test**. Production traces from the Truth Engine (`verification_meta`,
  `judge_verdict`, …) may *seed* candidate items but can **never** confer
  ground-truth status. Letting the system grade its own homework is the one failure
  that invalidates everything. (Formalized in §6 and §19.)
- **P3 — Native to Si Math AI's ontology.** Every item is a coordinate across the
  KDG axes (Knowledge × Reasoning × Representation × Difficulty × Assessment),
  tagged with the *frozen* taxonomy IDs and representation IDs. The benchmark
  consumes those modules read-only; it never mutates them.
- **P4 — Tiered trust (Gold/Silver/Bronze).** Not all labels are equal. The
  headline benchmark is Gold-only; weaker labels power training and analysis but
  never the scoreboard. (§16.)
- **P5 — Living + sealed.** A permanently **sealed** held-out core for
  comparability over time, *plus* a **rotating** fresh slice for contamination
  resistance. (§9, §18.)
- **P6 — Safety-asymmetric scoring.** Passing a wrong answer to a student
  (false-accept) is worse than escalating a correct one (false-block). This is the
  *same* asymmetry the KDG capability policy already encodes ("false allow is
  catastrophic when producing; false block is catastrophic when consuming"). Our
  metrics weight the two errors differently rather than reporting a symmetric
  accuracy. (§2.)

---

# Part III — The proposal

## 1. Purpose of the benchmark

**One sentence:** *The Truth Benchmark is the independent ground truth that lets us
measure, compare, and regression-test any verification method on Si Math AI's
domain — the standard every future change to the Truth Engine (or its replacement)
must be scored against before it ships.*

Concretely it exists to answer four questions about *any* verification method
`M`:

1. **Detection** — Given a `(question, candidate answer)`, does `M` correctly
   decide *correct vs incorrect*? (Especially: does it catch wrong answers?)
2. **Localization** — When the answer is wrong, does `M` identify *where* (the
   first faulty step) and *what kind* of error (the error category)?
3. **Calibration** — Is `M`'s confidence trustworthy? When it says 0.9, is it right
   ~90% of the time?
4. **Escalation** — Does difficulty-driven escalation (L1→L4) fire *when needed and
   only when needed*? (Is the extra L3/L4 cost buying real accuracy?)

**Non-goals (explicitly out of scope):**

- It is **not** a leaderboard for solving math (that is a *solver* benchmark, a
  possible sibling, not this).
- It does **not** define or change verification thresholds, tiers, or policy —
  those live in the (frozen) Truth Engine. It only *measures*.
- It is **not** a training set for the AI Tutor. (A training *split* exists for
  verification methods — §17 — but the Tutor is out of scope for this phase.)
- It is **not** a database or a feature. It is a versioned dataset + a scoring
  protocol.

**Why now / why independent.** `adaptive-verification.md` proposes spending up to
~167× baseline cost on L4. That investment is only justifiable if we can prove the
accuracy gain. Because the Truth Engine will itself be the primary thing measured,
the measuring instrument must be built and owned separately (P2).

---

## 2. Success metrics

Two distinct question sets: *is the benchmark itself good?* and *what does it report
about a method?*

### 2A. Metrics for the benchmark (quality gates on the instrument)

Borrowed from principles 3, 4, 9. A release is blocked unless it clears these.

| Metric | Definition | Target (production) |
|---|---|---|
| **Label error rate** (Gold) | Fraction of Gold items later found mis-labeled on audit | **< 2%** (FrontierMath is ~5%; we aim tighter because our domain is easier) |
| **Inter-annotator agreement** (Gold) | Cohen's/Fleiss κ across independent expert labelers on verdict + error category | **κ ≥ 0.8** on verdict; **κ ≥ 0.6** on error category |
| **Coverage** | % of (subtopic × capable-representation × difficulty-tier) cells with ≥ *N* items | ≥ 90% of high-weight cells at N≥5 |
| **Discrimination** | Spread of method scores across a reference panel of methods | No cell where all reference methods score >0.95 or <0.05 (dead cells) |
| **Guessing resistance** | Accuracy of a trivial "always-correct" and a random baseline | "Always-correct" ≤ 0.55 balanced-accuracy; random ≈ chance |
| **Contamination exposure** | % of Gold items with a public web duplicate (n-gram + embedding search) | Sealed core: **0** known public duplicates |
| **Firewall integrity** | % of Gold ground-truth labels traceable to a Truth-Engine output | **0%** (P2) |

### 2B. Metrics the benchmark reports about a method `M`

These are the outputs a method gets scored on. All are reported **per difficulty
tier, per topic, and per representation** — never as a single aggregate (principle
5).

**Detection (the core).** Treat "answer is *incorrect*" as the positive class
(catching errors is the job).

- **Recall on wrong answers** (a.k.a. error-catch rate) — *the headline number.*
  Of all genuinely wrong answers, how many did `M` flag?
- **Precision on wrong answers** — of everything `M` flagged, how many were truly
  wrong? (Low precision = annoying false blocks.)
- **F1 / Matthews correlation coefficient (MCC)** — single robust summary on the
  imbalanced 2-class problem.
- **Balanced accuracy** — mean of per-class recall, so a "flag everything" method
  does not win.

**Safety-asymmetric view (P6).** Report the confusion matrix as two named,
separately-weighted rates:

| | Ground truth: correct | Ground truth: wrong |
|---|---|---|
| `M` says correct | ✅ true accept | ⚠️ **false accept** (wrong answer reaches student — *worst*) |
| `M` says wrong | 🟡 **false block** (correct answer withheld/escalated — costs UX/$) | ✅ true reject |

- **False-Accept Rate (FAR)** — primary safety metric, minimize hard.
- **False-Block Rate (FBR)** — primary UX/cost metric.
- **Cost-weighted error** = `w_FA·FAR + w_FB·FBR` with `w_FA ≫ w_FB` (weights set by
  governance, §19; not by this doc).

**Localization (process supervision, principle 7).**

- **First-error-step accuracy** — for wrong answers with step labels, does `M` point
  at the correct first faulty step (±0 or ±1 step)?
- **Error-category accuracy** — does `M` name the right error category (§15)?

**Calibration.**

- **Expected Calibration Error (ECE)** and **Brier score** on `M`'s confidence.
- **Reliability diagram** (reported as an artifact, not a scalar).
- **Selective risk–coverage / AURC** — if `M` only answers when confident, what is
  the risk at each coverage level? (Directly informs the auto-accept vs. escalate
  threshold the Truth Engine uses.)

**Escalation efficiency (ties to `adaptive-verification.md`).**

- **Accuracy-per-dollar** and **accuracy-per-second** at each level (does L3/L4 earn
  its cost from §Cost/Latency of the Truth Engine doc?).
- **Escalation appropriateness** — on items where L1 is already correct, how often
  did the router needlessly escalate (waste) or fail to escalate a hard item it got
  wrong (miss)?

**Consistency (from LiveBench's G-Pass@k).**

- **Stability** — run `M` k times; report variance of the verdict. A verifier that
  flip-flops is not trustworthy even if its mean accuracy is high.

---

## 3. Dataset size per phase (pilot → production)

Sizing is driven by two facts: (a) a *verification* item carries **multiple
candidate solutions** (≥1 correct, ≥1 wrong), so *instances* ≫ *questions*; and (b)
we need enough per-cell density to report the per-tier/topic/representation
breakdowns of §2B. Reference anchors: GPQA-Diamond 198, SWE-bench Lite 300 /
Verified 500, MATH test 5,000, FrontierMath ~300.

| Phase | Questions (Gold) | Candidate solutions total | Purpose | Analogy |
|---|---|---|---|---|
| **P0 — Pilot / seed** | **300–500** | ~1,200–2,000 (≈4 per question: 1–2 correct, 2–3 wrong) | Prove the pipeline end-to-end; calibrate labeler instructions; first read on discrimination | GPQA-Diamond / SWE-bench Lite scale |
| **P1 — Alpha** | **~1,000 Gold** + ~2,000 Silver | ~4,000 Gold instances | First usable scoreboard; per-topic breakdowns become stable; publish v0.1 internally | FrontierMath launch scale |
| **P2 — Production** | **~2,500–3,000 Gold** (sealed core) + 8–12K Silver/Bronze (train/val) | ~10–12K Gold instances | The standing benchmark; stable per-cell density; regression gate for Truth Engine releases | MATH-test / SWE-bench scale |
| **Living refresh** | **+~400–500 fresh Gold / quarter**, rotating an equal number out of the "open" set | ~2K new instances/quarter | Contamination resistance; track drift as new exam years appear | LiveBench cadence |

**Density rationale.** With ~33 subtopics × 4 difficulty tiers, even ignoring
representation there are ~132 primary cells. To report a per-cell error-catch rate
with a usable confidence interval (~±10%), we want ≥ ~25 wrong-answer instances per
*reported* cell. We do **not** fill every (subtopic × representation × tier ×
error-category) micro-cell — that combinatorial space is ~thousands and most cells
are low-value or capability-invalid (§12). Coverage targets are prioritized by exam
weight (§13, §14).

**Minimum viable benchmark.** P1 (~1,000 Gold questions) is the smallest set that
supports headline detection + calibration numbers with per-topic (not yet
per-micro-cell) breakdowns. P0 is for pipeline validation only and must not be used
to make method decisions.

---

## 4. Data sources

Ranked by ground-truth strength (principle 1). A healthy benchmark blends all five;
the **sealed Gold core must not depend on any single source** and must avoid
publicly-memorized items.

| # | Source | Ground-truth strength | Contamination risk | Role |
|---|---|---|---|---|
| **S1. Commissioned expert-authored items** | Egyptian SAT/EST/ACT tutors author original questions + full solutions + curated *wrong* variants | **Highest** (born-labeled, born-private) | **Lowest** (never published) | Backbone of the sealed Gold core |
| **S2. Past official/public exam items** (released SAT/EST/ACT, competition banks) | High (official keys) | **High** (models have seen them) | Silver/Bronze + *open* practice set; **excluded from sealed core** unless heavily transformed & re-verified |
| **S3. Textbook / curriculum problems** (with worked solutions) | High | Medium–High | Silver; representation diversity |
| **S4. Production mining** — real student questions from `question_records` (question text + image only) | *Unlabeled* until adjudicated | Low (private) but **P2-sensitive** | Realism + hard/edge cases; enters only via human adjudication (§6); **never auto-labeled from `verification_meta`** |
| **S5. Synthetic wrong-answer generation** | N/A (produces *candidates*, not truth) | N/A | Generates realistic distractors/error-injected solutions to pair with S1–S3 correct answers |

**Key sourcing rules:**

- **Firewall (P2):** S4 items may be *selected* for the benchmark (e.g. "items where
  solvers disagreed" are valuable hard cases) but the Truth Engine's verdict is
  **stripped** before adjudication. Humans/independent checkers assign truth. The
  fact that the pipeline found an item interesting is a *sampling* signal, never a
  *labeling* signal.
- **Real images.** Because ~a meaningful fraction of student questions are photos,
  the benchmark deliberately includes an image/diagram subset (S4 realism) to
  exercise the `ocr_confidence` path (§14).
- **Wrong answers are a first-class asset (P1).** Every correct-answer item needs
  realistic wrong companions. Preferred provenance, best first: (a) *real* student
  wrong answers mined from S4; (b) expert-authored plausible distractors tied to a
  known misconception (§15); (c) error-injected model solutions (S5), each with the
  injected error category recorded.
- **Language.** Items carry a locale tag (EN / AR / mixed) — Si Math AI serves
  Egyptian students; Arabic and code-switched stems must be represented so
  verification is tested on the real input distribution.

---

## 5. Labeling methodology

Each benchmark **instance** = one `(question, candidate solution)` pair. Labeling
produces a structured record, not a single bit. Layers, from cheapest to richest
(principle 7 — we label the *process*, not only the outcome):

**Layer 0 — Item metadata (per question).**
- Canonical **taxonomy** IDs: `topic_id`, `subtopic_id` via the frozen resolver
  (§11).
- **Representation** ID via the frozen resolver, validated against **capability**
  (§12).
- **Assessment** format (MC / short-answer / grid-in / free-response).
- **Difficulty**: authored tier (`easy/medium/hard/expert`) *and*, once response
  data exists, a calibrated item difficulty (IRT-style; §13).
- **Locale**, **source** (S1–S5), **exam board** (SAT/EST/ACT).

**Layer 1 — Canonical answer (per question).**
- The **normalized final answer** in a canonical form (the value + an equivalence
  class: e.g. `1/2 ≡ 0.5 ≡ 50%`, `π/2` symbolic). Includes the accepted-alternates
  set and the checker recipe (exact / numeric-tolerance / symbolic-equivalence) —
  this is what makes outcome-checking *mechanical* (principle 1).

**Layer 2 — Verdict (per candidate solution).**
- `is_correct ∈ {true, false}` for this candidate's final answer against Layer 1.

**Layer 3 — Process labels (per *wrong* candidate; optional-but-valued on correct).**
- **Step segmentation** of the candidate solution.
- **First-error step index** (the PRM800K-style signal).
- **Error category** (§15), and a free-text rationale.
- Whether the error is **outcome-affecting** (wrong final answer) or
  **benign** (a slip that self-corrects / doesn't change the answer) — this
  distinction matters for scoring a process-verifier fairly.

**Labeling instruments (adopted from GPQA/SWE-bench Verified):**

- **Written labeler handbook** with worked examples and hard cases (iterated during
  P0). Ambiguity in instructions is the top source of low κ.
- **Severity scale 0–3** on "is this item fit for the benchmark?" (0–1 keep, 2–3
  discard) exactly like SWE-bench Verified's underspecification/unfair-test scale —
  used to filter out ambiguous or ill-posed questions (§7).
- **Two independent labelers minimum** on every Gold instance; disagreements go to
  adjudication (§8). Agreement (κ) tracked continuously (§2A).

---

## 6. Ground-truth creation process

The pipeline that turns a raw candidate into a trusted labeled instance. Nine
stages; an item can exit (be rejected) at any stage. Modeled on FrontierMath
(per-item peer review + automated checker) and SWE-bench Verified (multi-reviewer
filtering).

```
 (1) INTAKE            raw question from S1–S5, deduplicated, PII/identity stripped
        │
 (2) NORMALIZE         canonical stem; taxonomy + representation + assessment + difficulty tags (Layer 0)
        │
 (3) CANONICAL ANSWER  independent solve → normalized answer + equivalence class + checker recipe (Layer 1)
        │                    ⟵ must be produced WITHOUT any Truth-Engine output (P2 firewall)
 (4) CANDIDATE ASSEMBLY attach 1–2 correct + 2–3 wrong candidate solutions (real > distractor > injected)
        │
 (5) VERDICT + PROCESS  each candidate labeled correct/incorrect; wrong ones get first-error + category (Layers 2–3)
        │
 (6) DUAL REVIEW        second independent expert re-labels blind; κ computed
        │
 (7) ADJUDICATION       disagreements resolved by a third senior reviewer (§8); or item dropped
        │
 (8) AUTOMATED CHECK    checker recipe run against the canonical answer; contamination + capability + schema lint (§7)
        │
 (9) TIERING + SEAL     assign Gold/Silver/Bronze (§16); assign split (§17); sealed items get canary + hash, then frozen
```

**Independence controls (P2), stated explicitly:**

- Stage 3 (canonical answer) and Stage 5 (verdicts) are produced by humans and/or an
  **independent checker that is not a verification method under test**. Acceptable
  independent checkers: a computer-algebra system for symbolic/numeric equivalence,
  a formal checker where a problem admits one, or an expert. **The Truth Engine's
  own solvers/judge are never an authority here.**
- If a future verification method *is* a CAS or formal checker, and we want to
  *also* use a CAS in ground-truthing, they must be **different implementations**
  and the item is flagged so scoring can note the shared-tool dependency (avoids a
  method scoring well merely because it shares our checker).
- Provenance for every Gold label records *who/what* established it; a label whose
  provenance traces to any evaluated method is rejected by the Stage-8 firewall lint
  (§2A "firewall integrity = 0%").

---

## 7. Quality-control pipeline

Automated + human gates, run at Stage 8 and continuously on the corpus. Anything
that fails is quarantined, not silently dropped (auditability).

**Automated lints (cheap, every item, every build):**

1. **Schema lint** — every required field present, enum values legal, IDs resolve
   against the frozen taxonomy/representation modules (a bad `subtopic_id` fails the
   build).
2. **Capability lint** — the `(subtopic_id, representation_id)` pair is not
   `capable=false` (§12). An invalid pairing (e.g. Stem-and-Leaf as Standard
   Equation) is a labeling bug.
3. **Answer-checker lint** — the checker recipe actually accepts the canonical
   answer and *rejects* a set of known-wrong controls (guards against a checker that
   accepts everything).
4. **Guessing-resistance lint** — flag MC-heavy cells; ensure non-MC answer spaces
   are large; flag items where the answer is trivially the only "nice" number.
5. **Contamination scan** — n-gram + embedding near-duplicate search against (a)
   known public benchmarks/exam banks and (b) the rest of the corpus (dedup). Sealed
   core: any public hit → demote out of sealed core.
6. **Duplication/leakage scan** — no near-duplicate spans a split boundary
   (train↔benchmark leakage is fatal, principle 8).
7. **Balance report** — recompute the §13/§14 distributions; flag cells below quota.

**Human QC (sampled, periodic):**

8. **Blind re-audit** — a rotating random 5% of Gold is re-labeled cold each cycle;
   the disagreement rate *is* the published label-error rate (§2A). Modeled on
   FrontierMath's random-subsample review.
9. **Adversarial "always-correct" probe** — periodically score a dummy verifier that
   says "correct" always, and a random one; if they score well, the wrong-answer
   distribution is too easy (principle 6).
10. **Discrimination probe** — score the reference method panel; dead cells
    (everyone ~100% or ~0%) are flagged for replacement with harder/easier items.

**Quarantine, not deletion.** Failing items move to a `quarantine` state with the
failing gate recorded, so QC itself is measurable and reversible.

---

## 8. Human review workflow

Roles, routing, and SLAs. Deliberately mirrors the platform's existing curation
loop (the KDG docs describe `unmapped_detection` logs feeding human curation rather
than auto-mutation) so this is culturally familiar.

**Roles.**

- **Author** (S1) — writes/sources items and solutions.
- **Labeler** — assigns verdicts, first-error, error category (≥2 independent per
  Gold instance).
- **Adjudicator** (senior, in-field) — resolves labeler disagreements; final say on
  verdict/category.
- **Benchmark Steward** — owns the corpus, runs QC builds, assigns tiers/splits,
  guards the firewall and the seal. (Governance, §19.)
- **Domain Authority** (per topic) — signs off difficulty tiers and thorny
  edge-cases; the analog of the "capability-authority sign-off" the KDG docs already
  require.

**Routing (a labeled instance's path):**

```
Labeler A ─┐
           ├─ agree ─────────────────────────────► auto-accept → QC lint → tier/seal
Labeler B ─┘
     │ disagree (verdict OR first-error OR category)
     ▼
 Adjudicator ── resolvable ─► accept with recorded rationale → QC
     │
     └─ ill-posed / ambiguous / unfair ─► severity 2–3 ─► DISCARD (recorded, like SWE-bench Verified)
```

**Disagreement is signal, not noise.** Persistent low κ on a cell means either the
labeler handbook is unclear (fix instructions) or the item is genuinely ambiguous
(discard). Both are logged; κ trends are a governance KPI (§19).

**SLAs / practicalities (targets, tunable):** dual-label turnaround ≤ 1 week;
adjudication ≤ 3 days; a standing weekly triage on quarantined items and low-κ
cells. Tooling can be as light as a spreadsheet + scripts in P0 (no product build —
this phase ships no code); a purpose-built labeling UI is a *later, separately
approved* consideration, not part of this proposal.

---

## 9. Versioning strategy

Benchmarks decay and get gamed (principle 10). The scheme has to make results
**comparable across time** while staying **contamination-resistant**.

**Two-part corpus (P5):**

- **Sealed core (`benchmark` split).** Frozen at each release, never edited
  in-place. This is what headline scores are computed on and compared across model
  versions. Kept **private** (access-controlled), carries a **canary UUID** and per-
  item content hashes.
- **Open/rotating set.** A published practice slice (from S2/S3 public sources) for
  external transparency and method development, expected to become contaminated over
  time — and therefore *never* the headline number.

**Semantic-ish versioning `TB-vMAJOR.MINOR`:**

- **MAJOR** — breaking change to schema, scoring protocol, or the sealed-core
  composition (distributions in §13/§14). Old and new scores are *not* directly
  comparable; a bridging study is published.
- **MINOR** — additive items, error-fixes from re-audit, a new rotating slice. Scores
  remain broadly comparable; changelog notes deltas.
- Every release is an **immutable snapshot** (content-addressed hash manifest) so any
  past score is exactly reproducible. Nothing is ever edited in place; corrections
  create a new version and the old item is *tombstoned* with the reason (this is how
  MMLU-Redux-style fixes are handled without rewriting history).

**Living refresh (LiveBench-style).** Each quarter, a fresh Gold slice (new exam
year, new authored items) is added and an equal-size oldest slice is *retired* from
the sealed core into the open set. Report both a **frozen-core score** (comparability)
and a **fresh-slice score** (contamination-free signal); divergence between them is
an early contamination alarm.

**What is versioned:** the item set, the labels, the checker recipes, the scoring
protocol, and the distribution targets — as one coherent manifest. A method's result
is always cited as `score @ TB-vX.Y (split)`.

---

## 10. Dataset schema (logical design only)

**This is a logical data model for the proposal — not a migration, not a table, not
a file to be created in this phase.** It describes the fields a benchmark record
*would* carry. Two entities: **Item** (a question) and **Instance** (a
question+candidate pair, the unit of scoring). Field names are illustrative.

**Item** (one per question):

| Field | Type | Notes |
|---|---|---|
| `item_id` | opaque id | permanent, e.g. `TBM-000123` |
| `stem` | text | question text; LaTeX/Unicode normalized |
| `image_ref` | ref \| null | for photo/diagram items (drives `ocr_confidence` eval) |
| `locale` | enum | `en` / `ar` / `mixed` |
| `exam_board` | enum | `SAT` / `EST` / `ACT` (metadata; KDG §5) |
| `topic_id` | enum | frozen taxonomy topic (`ALGEBRA`…) — §11 |
| `subtopic_id` | enum | frozen taxonomy subtopic (`ALG_006`…) — §11 |
| `representation_id` | enum | frozen KDG representation (`WORD_PROBLEM`…) — §12; must be `capable≠false` |
| `assessment_format` | enum | `mc` / `short_answer` / `grid_in` / `free_response` |
| `difficulty_tier` | enum | `easy` / `medium` / `hard` / `expert` (aligns with `verification_tier`) |
| `difficulty_b` | number \| null | calibrated IRT-style difficulty once response data exists — §13 |
| `canonical_answer` | struct | normalized value + equivalence class + accepted alternates |
| `checker_recipe` | enum+params | `exact` / `numeric(tol)` / `symbolic` / `set-match` — how outcome is auto-verified |
| `source` | enum | S1–S5 (§4) |
| `provenance` | struct | who/what established the canonical answer (firewall audit, P2) |
| `confidence_tier` | enum | `gold` / `silver` / `bronze` — §16 |
| `split` | enum | `train` / `val` / `benchmark` — §17 |
| `tb_version_added` | string | `TB-vX.Y` |
| `content_hash` | hash | for the immutable manifest (§9) |

**Instance** (one per candidate solution; the scored unit):

| Field | Type | Notes |
|---|---|---|
| `instance_id` | opaque id | |
| `item_id` | ref | parent question |
| `candidate_solution` | text/struct | the full worked solution + final answer being judged |
| `candidate_final_answer` | struct | normalized, for outcome checking against `Item.canonical_answer` |
| `is_correct` | bool | **ground-truth verdict** (Layer 2) |
| `candidate_provenance` | enum | `real_student` / `expert_distractor` / `error_injected` / `correct_reference` |
| `steps` | array \| null | segmented reasoning steps (Layer 3) |
| `first_error_step` | int \| null | index of first faulty step; null if correct |
| `error_category` | enum \| null | §15; null if correct |
| `error_is_outcome_affecting` | bool \| null | benign slip vs. answer-changing error |
| `label_provenance` | struct | labelers, adjudicator, κ, review timestamps (firewall audit) |

**Deliberate schema choices:**

- **Item/Instance split** is what makes this a *verification* benchmark: many
  instances per item, mixed correct/incorrect (P1).
- Field names intentionally **echo** the production `question_records` verification
  columns (`verification_tier`, `ocr_confidence`, `judge_verdict`) so that, in a
  *future* approved phase, a method's *outputs* can be joined against benchmark
  *ground truth* with no impedance mismatch — **but this phase introduces no columns
  and no tables.**
- Everything reads the frozen taxonomy/representation IDs; the benchmark stores the
  *ID*, never a re-definition of the concept.

---

## 11. Relationship with the taxonomy

The benchmark is a **read-only consumer** of the frozen taxonomy (`taxonomy.js` /
`taxonomy.core.js`); it is the *labeling vocabulary*, never modified by this work.

- **Every item is tagged** with a canonical `topic_id` (one of the 5:
  `ALGEBRA`, `FUNCTIONS`, `GEOMETRY`, `STATISTICS`, `PROBABILITY_RATIOS`) and
  `subtopic_id` (one of the ~33: `ALG_001…ALG_012`, `FUN_001…002`, `GEO_001…008`,
  `STA_001…005`, `PR_001…006`) via the taxonomy's **strict resolver** (the same
  no-passthrough contract described in the KDG docs — an unmapped label resolves to
  `null` and blocks the build, never a guess).
- **Coverage is measured against the taxonomy** (§2A, §13): the benchmark reports a
  per-subtopic coverage grid, weighted by each subtopic's exam importance. This makes
  "which parts of the curriculum are we *not* testing verification on?" a first-class,
  visible number.
- **Alias curation stays where it belongs.** If a benchmark item surfaces a stem
  whose label doesn't resolve, that is logged as an `unmapped_detection`-style signal
  for the taxonomy's *existing* human curation loop — the benchmark never coins a new
  topic/alias itself.
- **Firewall from taxonomy churn.** Because IDs are permanent and opaque, benchmark
  labels are stable even if display names change. If the taxonomy is ever unfrozen
  and extended (e.g. Phase 5 unification), the benchmark re-validates its IDs against
  the new module in a versioned MINOR bump; no item is silently re-pointed.

The benchmark is therefore also a **downstream test of the taxonomy's usefulness**:
if verification methods systematically fail on a subtopic, that is evidence either
about the methods *or* about a taxonomy boundary that doesn't carve reality at the
joints — surfaced, not acted on, by this phase.

---

## 12. Relationship with KDG Representation

Representation is a labeled axis on every item, consumed **read-only** through the
frozen `kdg-representation.js` API — and it is where the benchmark does something the
generic math benchmarks cannot: **test verification across formats of the same
lesson.**

- **Every item carries a `representation_id`** (one of the 7: `WORD_PROBLEM`,
  `STANDARD_EQUATION`, `SIMPLE_EQUATION`, `GRAPH`, `TABLE`, `DIAGRAM`, `REAL_LIFE`)
  assigned via `resolveRepresentation` (strict, no guess).
- **Capability is a hard QC gate (§7 lint 2).** A `(subtopic, representation)` pair
  that is `capabilityOf(...) === false` is an **invalid item** and is rejected — the
  benchmark must never contain "Order of Operations as a Graph." This uses the module
  exactly as its `README`/architecture intend: *consumption* reads (the benchmark is
  reading existing artifacts) do not *gate*, but the **authoring** of a benchmark
  item is a *production* act, so we apply the fail-closed / surface-`null` policy the
  KDG doc prescribes for producers (invalid → reject; `null`/unknown → route to the
  Domain Authority, don't silently include).
- **Affinity informs sampling, not validity.** Where §14 sets representation quotas,
  `rankedRepresentations` (natural → stretch) helps ensure we test both the *common*
  presentation of a lesson and a *stretch* one, since verification difficulty often
  lives in the less-natural representation (translating a word problem, reading a
  graph).
- **Representation-shift as an evaluation dimension.** Because "the same lesson in a
  different representation is the same lesson node," the benchmark can hold
  `subtopic_id` fixed and vary `representation_id` to ask: *does the verifier's
  error-catch rate drop when the linear-equation is shown as a graph vs. an
  equation?* This is a uniquely KDG-enabled diagnostic and a headline breakdown in
  §2B.
- **No new column.** Per the KDG docs, persisting representation IDs in production is
  a separate, future, approved migration. The benchmark stores the representation ID
  in its *own* dataset schema (§10) only; it introduces nothing in `question_records`.

---

## 13. Difficulty distribution

Difficulty is **calibrated metadata** in the KDG model (emergent from the other
axes), so the benchmark treats it exactly that way: an authored tier now, a
calibrated `difficulty_b` later.

- **Tiers align with the Truth Engine.** Use the *same* four tiers the
  DifficultyDetector and `verification_tier` already use: `easy / medium / hard /
  expert`. This is deliberate — it lets escalation-appropriateness (§2B) be scored on
  the same axis the router uses.
- **Two published distribution profiles**, reported side by side (never blended into
  one number):

| Profile | easy | medium | hard | expert | Why |
|---|---|---|---|---|---|
| **Exam-faithful** | ~30% | ~45% | ~20% | ~5% | Mirrors the real SAT/EST/ACT difficulty mix; supports "representative accuracy" reporting |
| **Stress (sealed-core default)** | ~15% | ~30% | ~40% | ~15% | Over-samples hard/expert on purpose — verification errors and the L3/L4 cost decisions concentrate there; maximizes discrimination |

- **Rationale for over-sampling the tail.** On easy items almost any verifier is
  ~correct (a dead cell — principle 5). The benchmark's job is to discriminate
  methods *where they differ*, which is on hard/expert items — precisely the items
  the Truth Engine spends 60×–167× more to verify. The **stress** profile is the
  sealed-core default; the **exam-faithful** slice exists so we can also state
  "expected accuracy on a real student's next question."
- **Calibrated difficulty later.** Once (and only once) real response data exists,
  add an IRT-style `difficulty_b` / observed p-value per item (the same
  "Continuous-Update" philosophy the KDG doc describes for item difficulty).
  Authored tier and calibrated value can disagree; the KDG doc already flags
  reconciling them as an open question (Appendix B) — the benchmark records both and
  does not force one to win.
- **Difficulty is never a solo axis.** Because difficulty is compositionally produced
  by knowledge/reasoning/representation, per-tier scores are always *also* broken
  down by topic and representation, so "hard" doesn't smuggle in a topic confound.

---

## 14. Representation distribution

Coverage across the 7 representations, with **minimum-cell quotas** so no capable
format is untested, weighted toward what actually appears on the target exams.

- **Weighting principle:** exam-common representations get the most items, but every
  *capable* representation for a high-exam-weight subtopic has a **floor** (≥ N
  items) so verification is never blind to a format. Guided by
  `capableRepresentations` (the valid set) and `rankedRepresentations` (natural →
  stretch).

| Representation | Indicative share | Floor? | Notes |
|---|---|---|---|
| `WORD_PROBLEM` | ~25% | yes | The dominant exam format; also the hardest *translation* verification |
| `STANDARD_EQUATION` | ~20% | yes | Symbolic manipulation errors |
| `SIMPLE_EQUATION` | ~15% | yes | Procedural/arithmetic error surface |
| `GRAPH` | ~12% | yes | Reading-from-graph errors; only where capable (functional/data lessons) |
| `TABLE` | ~10% | yes | Data/statistics; extraction errors |
| `DIAGRAM` | ~10% | yes | Geometry/figures; pairs with the image subset |
| `REAL_LIFE` | ~8% | yes | Modeling/interpretation errors |

- **Capability first.** Shares are *targets over capable cells only*. We do not (and
  cannot) put Stem-and-Leaf into `STANDARD_EQUATION`; §7 lint 2 enforces this. Where a
  subtopic affords few representations, its items concentrate in those.
- **Image/OCR subset.** ~15–20% of items are real photo/diagram inputs (from S4) so
  the `ocr_confidence` verification path is exercised; a verifier that is great on
  clean text but fails on a photographed question must score visibly worse here.
- **Representation-controlled pairs.** A deliberate sub-collection holds `subtopic_id`
  constant and varies `representation_id` across an item family (§12) to isolate the
  representation effect on verification accuracy.

---

## 15. Common error categories

The **error taxonomy** — the vocabulary for *what went wrong* in a wrong candidate
(Layer 3). This is the benchmark's projection of the KDG **Reasoning** axis
(misconceptions / error mechanisms). It is intentionally seeded from, and kept
consistent with, the Reasoning-axis vocabulary the KDG docs envision (e.g. the
"drops ±" misconception example) so that if/when the Reasoning graph is built, the
benchmark's categories map onto it rather than fork from it.

| id | Category | Description | Canonical example | Which verification signal *should* catch it |
|---|---|---|---|---|
| `E01` | **Arithmetic / computation slip** | Correct method, wrong calculation | `7×8 = 54` | Independent re-solve; solver disagreement |
| `E02` | **Sign error** | Dropped/flipped sign (the KDG "drops ±") | `√ ⇒ +k only` | Alternative-method solver; symbolic check |
| `E03` | **Algebraic manipulation** | Invalid symbolic step | distributing wrong, illegal cancel | Symbolic-equivalence checker |
| `E04` | **Conceptual / misconception** | Wrong rule/formula/theorem applied | area vs perimeter; wrong SOHCAHTOA leg | Judge with concept grounding; consensus |
| `E05` | **Misread / misinterpret stimulus** | Solved a different question than asked | ignores "not", solves for x not 2x | Restating the ask; answer-format check |
| `E06` | **Representation / translation** | Word↔equation↔graph translation error | mis-models a rate word problem | Representation-aware verification (§12) |
| `E07` | **Units / conversion** | Wrong or missing unit conversion | cm vs m; % vs proportion | Dimensional/unit check |
| `E08` | **Domain / constraint violation** | Ignores a validity constraint | extraneous root; ÷0; out-of-domain | Constraint re-check on the solution |
| `E09` | **Rounding / precision** | Premature/incorrect rounding | rounds mid-solution → wrong final | Numeric-tolerance checker |
| `E10` | **Incomplete / stops early** | Right so far, never reaches the asked quantity | finds x, question wants area | Answer-completeness check |
| `E11` | **Answer-format / extraction** | Correct work, wrong final form | `1/2` when grid-in needs `.5`; wrong rounding to spec | Format normalization (Assessment axis) |
| `E12` | **OCR / transcription** | Misread the photographed problem | `6` read as `b`, exponent lost | `ocr_confidence` path; image re-read |
| `E13` | **Fabricated / unfaithful reasoning** | Right answer via wrong/hallucinated steps | correct number, invalid justification | **Process** verification (outcome check alone misses this) |

**Design notes:**

- `E13` is why a verification benchmark needs **process** labels (principle 7): an
  outcome-only checker scores a right-answer/wrong-reasoning solution as "correct,"
  which is exactly the failure a good verifier must catch for a *tutoring* product.
- Categories are **not mutually exclusive**; the schema records a primary category +
  optional secondaries. κ on category is expected to be lower than on verdict (§2A
  target κ≥0.6), which is normal and why category has a softer gate than verdict.
- The taxonomy of errors is **versioned with the benchmark** (§9); adding a category
  is a MINOR bump with a back-fill of affected items.

---

## 16. Gold / Silver / Bronze confidence levels

Tiered trust in the **label** (P4). This is about how much we trust the ground truth,
and it gates what each tier is *allowed to be used for*. Directly analogous to
GPQA-Diamond (highest-agreement subset), FrontierMath peer review, and SWE-bench
Verified.

| Tier | How the label is established | Trust | Allowed use |
|---|---|---|---|
| **🥇 Gold** | Independent expert authoring **or** ≥2 independent labelers in agreement (κ high), **and** a passing automated checker (symbolic/numeric), **and** clean firewall provenance (P2). For a subset, a formal/CAS-independent proof of the answer. | Highest | The **sealed benchmark** (headline scores); regression gate |
| **🥈 Silver** | Single expert **or** a public official key **or** LLM-assisted labeling **with** human spot-check; automated checker passes; not double-blind reviewed | Medium | **Validation** split; method development; *not* headline |
| **🥉 Bronze** | Weakly/auto-labeled — e.g. mined from production with strong independent-signal agreement, or synthetic error-injected (the injected error *is* its label) | Low | **Training** split; data augmentation; analysis only |

**Rules:**

- **Only Gold is the scoreboard.** No Silver/Bronze item ever contributes to a
  published headline number (mirrors GPQA reporting on Diamond).
- **Promotion is possible, demotion is automatic.** A Bronze item can be *promoted*
  to Silver/Gold by passing the full §6 pipeline. Any item that fails a re-audit
  (§7.8) is *demoted* and pulled from the sealed core in the next version.
- **Firewall applies most strictly to Gold (P2).** A production-mined candidate
  (Bronze provenance) can only become Gold after independent human/independent-checker
  adjudication that *ignores* the Truth Engine's verdict.
- **A "Diamond"-equivalent.** The highest-agreement, hardest, cleanest Gold items form
  an optional **`TB-Core`** subset (our Diamond) for the most-scrutinized head-to-head
  method comparisons.

---

## 17. Train / Validation / Benchmark splits

Three splits, hard-separated to prevent leakage (principle 8). Note: this is for
developing/tuning *verification methods*, and is entirely separate from any AI-Tutor
training (out of scope).

| Split | Tier mix | Size (P2) | Purpose | Access |
|---|---|---|---|---|
| **Train** | Bronze + Silver | ~8–12K instances | Fit/tune a verification method (e.g. a learned judge, a reward model, thresholds) | Open to method developers |
| **Validation** | Silver + some Gold | ~2K instances | Model selection, hyperparameters, threshold setting, calibration fitting | Open to method developers |
| **Benchmark** (test) | **Gold only, sealed** | ~10–12K Gold instances (~2.5–3K items) | The **held-out scoreboard**; run rarely, never tuned against | **Access-controlled**; canary-guarded |

**Separation rules:**

- **No item family crosses a split.** All instances of one `item_id` — and any
  near-duplicate items (dedup at §7 lint 6) — live in exactly one split. Otherwise a
  method "verifies" a benchmark item it effectively trained on.
- **Benchmark is sealed and rarely touched.** Modeled on held-out best practice:
  results on the benchmark split are for reporting, not iteration. Frequent probing of
  a held-out set silently turns it into a validation set (overfitting to the
  benchmark).
- **Stratified, not random.** Split assignment preserves the §13/§14 distributions
  within each split, so per-tier/representation reporting is valid on each.
- **Canary + leakage monitoring.** The benchmark split carries a canary UUID; if a
  method's provider ever reproduces canaried content, contamination is presumed and
  that result is void (principle 8).
- **The living-refresh fresh slice** (§9) is always benchmark-tier and is the
  contamination-free signal when the frozen core's age becomes a concern.

---

## 18. Long-term maintenance

A benchmark is a **product with an owner and a lifecycle**, not a one-time drop
(principle 10; cf. OpenAI publicly retiring SWE-bench Verified at saturation).

**Cadence.**

- **Quarterly:** living-refresh (+~400–500 Gold, retire an equal slice to the open
  set); re-run the full QC suite; publish the label-error rate from the 5% blind
  re-audit; recompute distribution/coverage; refresh the reference-method panel.
- **On each Truth Engine release:** run the benchmark as a **regression gate** — a
  release that lowers error-catch rate or raises false-accept rate on the sealed core
  is flagged (governance decides ship/hold, §19).
- **Continuously:** contamination monitoring (frozen-core vs. fresh-slice divergence);
  discrimination monitoring (dead cells); κ trend.

**Decay signals & responses.**

| Signal | Meaning | Response |
|---|---|---|
| Frozen-core score ≫ fresh-slice score | Contamination/overfitting of the core | Accelerate rotation; investigate leakage |
| A cell's methods all ~100% | Saturated / too easy | Replace with harder items; consider retiring the cell |
| κ drifting down on a topic | Ambiguous items or unclear handbook | Re-train labelers or discard items |
| Label-error rate > 2% | Ground-truth quality slipping | Halt promotion; deep re-audit of affected cells |

**Ownership.** A named **Benchmark Steward** (§8) owns the manifest, the seal, the
firewall, and the release notes. Bus-factor mitigation: the dataset is a
content-addressed, versioned artifact reproducible from the manifest, independent of
any individual.

**Retirement.** When the sealed core saturates against frontier methods, it is
**retired to the open set** (published, honored as historical) and a new MAJOR core is
commissioned — the SWE-bench Verified → "we no longer evaluate it" arc, planned in
advance rather than improvised.

---

## 19. Benchmark governance

Who decides what, and the rules that keep the instrument trustworthy. Governance is
lightweight but explicit, because a benchmark everyone can quietly edit measures
nothing.

**Decision rights.**

| Decision | Owner | Rule |
|---|---|---|
| Admit/reject an item; assign tier/split | Benchmark Steward | Per §6–§8 pipeline; logged |
| Resolve a label dispute | Adjudicator / Domain Authority | Recorded rationale; κ tracked |
| Set the scoring protocol & metric weights (`w_FA`, `w_FB`) | Governance (user + steward) | Versioned with the benchmark; **not** set inside this doc |
| Cut a release / MAJOR vs MINOR | Governance | Changelog + manifest hash |
| Change §13/§14 distributions or §15 error taxonomy | Governance | MAJOR bump; bridging study |
| Declare a Truth Engine release "passes" | Governance | Against pre-registered thresholds |

**Non-negotiable invariants (the constitution of the benchmark):**

1. **Firewall (P2):** no ground-truth label may derive from a verification method
   under test. Enforced by lint (§2A) *and* policy.
2. **Independence of the sealed core:** headline scores come only from sealed Gold;
   the sealed core is never tuned against.
3. **Immutability + provenance:** no in-place edits; every item has traceable
   who/what provenance; corrections create versions and tombstones (§9).
4. **Pre-registration:** metrics, weights, and pass thresholds are fixed *before* a
   method is scored, so results can't be reverse-justified.
5. **Conflict-of-interest separation:** the people/teams *building* a verification
   method do not have write access to Gold labels or the seal for the items they'll
   be judged on.
6. **Transparency of quality:** the label-error rate, κ, coverage, and contamination
   status are published with every release — the benchmark reports its own limits
   (principle 9).

**Analogy to existing platform culture.** These mirror rules the codebase already
lives by — additive/reversible changes, human-in-the-loop curation over silent
auto-mutation, IDs permanent and opaque, "no hidden defaults." The benchmark's
governance is the same philosophy applied to evaluation.

---

## 20. Roadmap

Sequenced, each stage gated on the previous; **no build work is requested by this
document** — this is the plan a future, separately-approved phase would follow.

| Stage | Name | Goal | Exit criteria |
|---|---|---|---|
| **R0** | **Ratify this proposal** | Agree purpose, principles, schema, distributions, governance | Sign-off on §1, §2, §16, §19; metric weights (`w_FA`,`w_FB`) chosen |
| **R1** | **Pilot (P0)** | 300–500 Gold items; validate the §6 pipeline + labeler handbook end-to-end; first κ and label-error read | κ ≥ 0.8 on verdict; pipeline produces a clean manifest; discrimination sanity-checked on a small reference panel |
| **R2** | **Alpha benchmark `TB-v0.1` (P1)** | ~1,000 Gold + ~2,000 Silver; first usable scoreboard with per-topic breakdowns; wire the reference-method panel | Stable per-topic detection + calibration numbers; coverage ≥ target on high-weight subtopics; contamination scan clean on sealed core |
| **R3** | **Production benchmark `TB-v1.0` (P2)** | ~2.5–3K Gold sealed core (~10–12K instances); full §13/§14 distributions; regression-gate integration | All §2A quality gates green; governance/pre-registration in place; frozen-core + fresh-slice both reported |
| **R4** | **Living operation** | Quarterly refresh; ongoing QC; use as the standing gate for Truth Engine changes | Sustained cadence; decay signals monitored; steward + authorities named |
| **R5** | **(Optional) Public open set + siblings** | Publish the open/rotating slice for transparency; consider a *solver* sibling benchmark and a *formal-verification* extension for lessons that admit it | Separate approval; out of scope here |

**Dependencies & sequencing notes.**

- R0–R2 need **no** production data and **no** code — spreadsheets + scripts suffice.
  They are pure content + protocol work.
- Calibrated difficulty (§13) and heavy S4 mining (§4) depend on real response data;
  they enter at R2–R3, not before.
- Any later step that would *touch production* (persisting IDs, joining method outputs
  to benchmark truth, a labeling UI) is its **own** approved phase — flagged here,
  not requested here. This document changes nothing in the running system.

---

## Appendix A — Glossary

- **Item** — a question (stem + metadata + canonical answer).
- **Instance** — a `(question, candidate solution)` pair; the unit that gets scored.
- **Outcome verification** — checking the final answer only.
- **Process verification** — checking the reasoning steps (first-error localization).
- **False accept** — verifier passes a wrong answer as correct (safety-critical).
- **False block** — verifier rejects a correct answer (UX/cost cost).
- **Gold/Silver/Bronze** — trust tiers of the *label* (§16).
- **Sealed core** — the frozen, private, Gold-only benchmark split.
- **Firewall (P2)** — the rule that no ground truth derives from a method under test.
- **Canary** — a unique string embedded to detect training-data contamination.
- **κ (kappa)** — inter-annotator agreement coefficient.
- **ECE / Brier** — calibration error metrics.
- **G-Pass@k** — consistency-aware pass metric (accuracy *and* stability over k runs).
- **TB-Core** — our GPQA-Diamond analog: the highest-agreement Gold subset.

## Appendix B — Open questions (for R0 ratification)

1. **Metric weights.** What is `w_FA : w_FB`? (How many false-blocks equal one
   false-accept for a tutoring product?) Governance must set this before scoring.
2. **Formal-verification scope.** Which subtopics (if any) admit a Lean/CAS-style
   *formal* ground truth (AlphaProof/Aristotle model), vs. expert+checker only?
3. **Authoring capacity.** How many in-field SAT/EST/ACT authors/labelers can we
   sustainably staff? This paces R1→R3 more than anything technical.
4. **Arabic/locale share.** What EN/AR/mixed split reflects the real student input
   distribution? Needs a look at production locale stats (read-only, later phase).
5. **Difficulty reconciliation.** When authored tier and calibrated `difficulty_b`
   disagree, which governs reporting? (Mirrors the KDG open question.)
6. **Open-set publication.** Do we publish an open slice at all (transparency) given
   the competitive value of a private benchmark?
7. **Solver-sibling.** Is a companion *solving* benchmark in scope later, or do we
   stay strictly on verification?

---

## Sources

Research grounding for Part I (accessed July 2026):

- FrontierMath — [Epoch AI: the benchmark](https://epoch.ai/frontiermath/tiers-1-4/the-benchmark) · [arXiv 2411.04872](https://arxiv.org/html/2411.04872) · [tiers/about](https://epoch.ai/frontiermath/tiers-1-4/about)
- GPQA — [arXiv 2311.12022](https://arxiv.org/abs/2311.12022)
- SWE-bench Verified — [OpenAI: Introducing SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/) · [swebench.com/verified](https://www.swebench.com/verified.html) · [OpenAI: why we no longer evaluate SWE-bench Verified](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/)
- Let's Verify Step by Step / PRM800K — [arXiv 2305.20050](https://arxiv.org/abs/2305.20050) · [openai/prm800k](https://github.com/openai/prm800k)
- MATH & GSM8K — MATH ([arXiv 2103.03874](https://arxiv.org/abs/2103.03874)); GSM8K ([arXiv 2110.14168](https://arxiv.org/abs/2110.14168))
- LiveBench / LiveMathBench & G-Pass@k — [LiveBench paper](https://livebench.ai/livebench.pdf) · [Are Your LLMs Capable of Stable Reasoning? (ACL 2025 Findings)](https://aclanthology.org/2025.findings-acl.905.pdf)
- AlphaProof (DeepMind) & Harmonic Aristotle (Lean 4 formal verification) — [Aristotle: IMO-level Automated Theorem Proving, arXiv 2510.01346](https://arxiv.org/abs/2510.01346)
- Benchmark contamination & inflation — [From Static to Dynamic Evaluation, arXiv 2502.17521](https://arxiv.org/pdf/2502.17521) · [Benchmark Inflation / Retro-Holdouts, arXiv 2410.09247](https://arxiv.org/pdf/2410.09247)

Internal context (this repo, read-only): `docs/roadmap/adaptive-verification.md`,
`docs/roadmap/phase-0-verification.md`, `docs/roadmap/kdg-multi-axis-architecture.md`,
`docs/roadmap/kdg-representation-layer.md`, `taxonomy.core.js`.
