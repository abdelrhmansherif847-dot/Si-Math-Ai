# Truth Benchmark Dataset — Adversarial Review

**Status:** Adversarial architecture review — **no implementation.** No code, no
database, no AI Tutor changes. Reviews `truth-benchmark-dataset.md` (the proposal)
before it is frozen.

**Mandate:** Break it. This document does **not** defend the proposal. Where it
records a resolution, that is the *output* of the attack (what would have to change),
not a rebuttal of it. Findings that cannot be fully resolved are marked **Accepted
risk** or **Open** — honestly, not explained away.

**Verdict (summary):** **Do not freeze as-is.** The proposal is directionally
sound but rests on **6 Must-Fix design flaws** that can produce *confidently wrong
ship decisions* (students receiving wrong answers because the benchmark said the
verifier was safe). Beyond those, **6 Accepted residual risks** should be documented
in the proposal, and **5 Open questions** need a decision at R0. The single most
dangerous property: **the benchmark's quality-control and balancing choices
systematically make the measured world *cleaner and more balanced* than production,
so a method can pass the benchmark and still fail real students.**

Finding IDs are grouped by attack surface (HA/DB/CT/LC/MT/SC/HR/GV/GM/MC) and
resolved in the [Resolution Matrix](#resolution-matrix).

---

## Part 1 — The ten attack surfaces

### 1. Hidden assumptions (HA)

**HA-1 — "We can produce ground truth more reliable than the thing we're grading."
Probably false on exactly the items that matter.** The stress profile (§13)
*over-samples* hard/expert items because that's where methods differ. But hard items
are also where **human experts + CAS are least reliable** — FrontierMath, peer-
reviewed by professional mathematicians, still ships ~5% label errors, concentrated
in its hard tiers. Our §2A target of **<2% Gold error is stated as uniform** but
label error is *correlated with difficulty*. So the benchmark is **least trustworthy
precisely where it does its only real discriminating work**. Failure scenario: an
expert-tier item has a subtly wrong "canonical answer"; a genuinely superior verifier
correctly flags the reference solution as wrong; the benchmark scores it as a
*false-block* and we reject the better method.

**HA-2 — "Correct answer" is assumed binary and checkable.** The Item/Instance schema
requires a `canonical_answer` + `checker_recipe`. Every item that lacks a clean
checkable final answer — proofs, "explain/justify," multi-part, modeling with a range
of acceptable answers — is silently excluded at intake. That is a **selection bias
toward exactly the items the current outcome-checker already handles well**, and away
from the graded/open items where verification is hardest and most valuable. The
benchmark will look better than the system deserves because it can't even represent
the hard-to-verify cases.

**HA-3 — "Manufactured wrong answers resemble real wrong answers."** Wrong candidates
come from real-student (best), expert-distractor, or error-injected (S5) provenance.
Injected and distractor errors are drawn from *our model of how students err*, not the
true error distribution. A verifier can learn the manufacturing distribution. (See
MC-3.)

**HA-4 — "Difficulty is a stable, shared notion."** The proposal tags difficulty with
the same four tiers the DifficultyDetector uses — but that detector is *itself under
shadow evaluation* (v1 vs v2 disagree materially, per `detector-v2-review-report.md`).
If we hand-tag benchmark difficulty, it won't match what the production router sees →
the "escalation-appropriateness" metric (§2B) measures against a *different* difficulty
than the router uses. If we auto-tag with the detector, we bake the detector's errors
into ground truth. Either way the escalation metric is on sand.

**HA-5 — "The benchmark team and the verifier team are independent."** In a small
Egyptian exam-prep org, the people authoring items, the people labeling, and the people
building the verifier **overlap or share training, conventions, and blind spots.** True
independence requires *disjoint expertise*, which the org does not have. The firewall
(P2) prevents the *machine* from grading itself; it does nothing about **correlated
human blind spots** (see MC-4). This is the deepest hidden assumption and it is
structurally, not procedurally, false.

### 2. Dataset bias (DB)

**DB-1 — Stress-profile headline optimizes the tail, hides the common-case
regression.** The **sealed-core default is the stress profile** (§13), and the sealed
core is the *release regression gate*. So the number that gates ships is dominated by
hard/expert items. A method that quietly regresses on **easy/medium — which is the
bulk of real student traffic** — can pass the gate. Failure scenario: a refactor makes
the verifier wrongly reject "2 + 2 = 4"-class confirmations 3% of the time; easy cells
are near-saturated and down-weighted in the stress core; the regression ships and
annoys the majority of users.

**DB-2 — Survivorship bias from QC.** SWE-bench Verified discarded ~68% of candidates
for being underspecified or ambiguous; §7 proudly imports that filter. But **the
discarded class — ambiguous, underspecified, typo-ridden, badly-photographed — is the
real production distribution.** The benchmark measures verification on the *clean
survivors*. The very process that guarantees label quality **removes the hardest real
cases**, producing systematic optimism. This is the most important bias in the whole
design.

**DB-3 — Author/source monoculture.** S1 is "a handful of Egyptian tutors." Their
topic emphases, phrasings, and notions of "important" dominate the corpus. The long
tail of *what students actually ask* (weird, off-syllabus, mis-stated) is
under-represented. Embedding-dedup makes this *worse*, not better: it removes
near-duplicates, concentrating the corpus on the authors' distinct stylistic modes.

**DB-4 — Wrong-answer coverage is uneven by construction.** Real-student wrongs (the
best provenance) only exist for questions students actually asked, which correlates
with topic and difficulty. So the richest error labels **cluster**, and the
error-catch metric is measured with wildly different statistical power across cells —
strong where students struggle, weak elsewhere — while being *reported* as if uniform.

**DB-5 — Locale/OCR under-stress.** If authoring is EN-first and images are
*tutor-photographed* (clean, well-lit, typed), the AR/code-switched and
messy-handwritten-photo cases — plausibly a large share of real Egyptian student input
— are under-tested. The `ocr_confidence` path gets a gentle test and a false pass.

### 3. Benchmark contamination (CT)

**CT-1 — Evaluation itself leaks the sealed core to model vendors.** This is the big
one the proposal misses. The Truth Engine's own roadmap contemplates GPT-4o / Claude /
Gemini solvers and judges. **Every eval run of a cloud-LLM-based verifier sends sealed
benchmark items to a third-party API**, which may log/retain/train on them. Canary
strings detect *verbatim regurgitation*; they do nothing to stop this exfiltration.
Over a few years of evaluations, **the seal is gone simply by using the benchmark for
its intended purpose.** The proposal has no eval-protocol answer (no-retention
endpoints, local models, or "burn the slice after cloud exposure").

**CT-2 — "Original" commissioned items are often near-duplicates of web-ubiquitous
templates.** Exam-prep problems are highly templated; an author's "original" linear-
system word problem is structurally identical to thousands online that every frontier
model trained on. Corpus-internal and known-bank dedup **cannot detect similarity to
the models' actual (unknowable) training sets.** "0 known public duplicates" (§2A) is a
guarantee about *what we can search*, which is a small fraction of what matters.

**CT-3 — Living-refresh retirement conflicts with comparability.** §9 retires old Gold
into the *public* open set while still wanting a "frozen-core score" for cross-version
comparability. Once retired items are public, methods can train on them; if they still
count toward the comparable score, the comparison is contaminated; if they don't,
comparability breaks. The two goals (comparable-over-time vs. contamination-free) are
in direct tension and the proposal doesn't pick.

### 4. Labeling consistency (LC)

**LC-1 — Error-category κ≥0.6 is both a low bar and probably unmet.** With 13
*non-mutually-exclusive* categories (§15), primary-category agreement will be poor: a
dropped sign is legitimately `E01` (arithmetic), `E02` (sign), or `E03` (algebraic); a
mis-answered question is `E05` (misread) or `E10` (incomplete). The **entire
error-localization metric (§2B) rests on labels humans can't reliably assign**, so the
metric is too noisy to rank methods — yet it will be reported as if it discriminates.

**LC-2 — "First-error step" is not well-defined.** It depends on step segmentation
granularity. Two labelers who agree *what* is wrong disagree on the *index* because
they segmented differently. ±1 tolerance is an arbitrary patch that also lets a verifier
be "right" while pointing at the wrong step.

**LC-3 — Longitudinal label drift.** Across quarterly refreshes the handbook evolves and
labelers turn over. A "Gold" verdict from TB-v0.1 and one from TB-v2.0 embody different
standards. Multi-year method-improvement curves will **conflate real progress with
labeling-standard drift**, and there's no anchor set held constant to separate them.

**LC-4 — Silver single-labeling poisons threshold-setting.** Validation (threshold and
calibration fitting) runs on Silver, which is single-expert. One expert's idiosyncrasies
become the thresholds, which are then judged on Gold — surfacing as a *method* problem
when it's a *label* problem.

### 5. Long-term maintenance (MT)

**MT-1 — A rotting benchmark is worse than none.** The whole scheme demands *permanent*
expert labeling (+400–500 Gold/quarter forever) plus a 5% re-audit forever. The parent
`adaptive-verification.md` is itself gated behind "do not implement until 5 milestones"
— i.e., this org deprioritizes. When attention lapses, the benchmark doesn't fail
loudly; it **silently goes stale** (drifts from the current exam, accumulates
contamination) while still being quoted with confidence. False confidence from a stale
benchmark can cause a bad ship that a *missing* benchmark never would.

**MT-2 — Reference-method-panel treadmill.** Discrimination (§2A) and "dead-cell"
detection depend on a reference panel. As methods improve, the panel saturates and the
probe stops meaning anything; refreshing the panel silently redefines "dead cell." The
instrument's own health metric has a moving zero.

**MT-3 — Steward single point of failure.** One Benchmark Steward owns the seal, the
firewall, the tiering, and the logs that audit all three. The content-addressed manifest
preserves *reproducibility*, not *judgment continuity* or *trust* — the auditor audits
their own work.

### 6. Scalability 500 → 10,000+ (SC)

**SC-1 — Quality and scale are in direct contradiction as staffed.** §8 mandates ≥2
independent expert labelers + adjudication + expert authoring per Gold instance. §3
wants ~10–12K Gold *instances*. SWE-bench Verified needed **93 developers for 1,699
samples** — a one-time push by a large, well-funded org. At small-team scale you can
have rigorous multi-review **or** 10K instances, **not both**. The sizing table and the
labor model contradict each other and the proposal never reconciles them.

**SC-2 — Targeted tail-filling doesn't scale.** Maintaining §13/§14 per-cell density as
n grows requires *commissioning specific cells* ("15 more hard STA_004 graphs"), which
is far harder to source than random items. The tail cells — the ones that carry the
discrimination value — stay under-filled, so the per-cell breakdowns that are the whole
value proposition remain statistically underpowered exactly where they're needed.

**SC-3 — Human adjudication of near-duplicate flags scales badly.** Automated dedup is
cheap; *deciding* whether a flagged pair is truly redundant is expert time, and flags
grow with corpus size.

### 7. Human-review bottlenecks (HR)

**HR-1 — The adjudicator is the throughput ceiling.** Every verdict/category/first-error
disagreement routes to a scarce senior in-field adjudicator. Given LC-1/LC-2, a *large*
fraction of instances disagree → the adjudicator is a hard bottleneck and R2/R3
timelines are labor-bound, not design-bound.

**HR-2 — Re-audit competes with growth and loses.** The 5% blind re-audit is *additional*
expert load on top of new authoring. Under pressure it's the first thing cut — and when
it's cut, the label-error rate goes *unmeasured*, so the §2A quality gate becomes
unenforceable without anyone deciding to disable it.

**HR-3 — COI separation is unstaffable.** §19 invariant 5 says verifier-builders must not
have write access to Gold labels for items they're judged on. In a team where the same
few people do everything, this is **physically impossible to staff** and will be quietly
ignored, meaning the governance document asserts a control that does not exist.

### 8. Governance failures (GV)

**GV-1 — Self-governance has no teeth.** Thresholds, metric weights (w_FA, w_FB), and
"pass" verdicts are all set by "Governance (user + steward)" — the same party that owns
the product and wants to ship. GPQA/SWE-bench used *independent* annotators precisely
because a benchmark judged by the team it measures is structurally weak. Nothing here
prevents post-hoc weight-tuning to make the current system pass.

**GV-2 — Pre-registration is unenforceable internally.** "Fix metrics before scoring"
(invariant 4) has no external referee. The same people can redefine "we meant p95" after
seeing results. Pre-registration without an independent registry is a norm, not a
control.

**GV-3 — The firewall leaks through humans.** If benchmark authors *use the AI Tutor*
(their own product) while drafting solutions — entirely natural — Truth-Engine reasoning
enters ground truth with no explicit provenance trace, and the Stage-8 lint (which only
catches *declared* derivation) passes it. "Independent" is a spectrum the boolean lint
can't police.

**GV-4 — A benchmark with no veto power is theater.** If the benchmark says "hold" but
business pressure says "ship," and both are the same user, the benchmark loses. Its
authority is assumed, never secured.

### 9. Gameable metrics (GM)

**GM-1 — Headline "error-catch rate" rewards trigger-happiness.** Recall-on-wrong as the
quoted number is maximized by flagging more, trading away precision and inflating
false-blocks. Unless the *cost-weighted* metric is the **only** headline (and it isn't
clearly mandated as such), teams optimize the single number that gets quoted.

**GM-2 — Calibration is gamed by base-rate matching.** The benchmark is ~50/50 correct/
wrong *by construction* (paired candidates). A method that emits confidences matching a
50% base rate scores great ECE **on the benchmark** while being **miscalibrated in
production**, where ~80–90% of answers are correct. Good benchmark calibration can
*guarantee* production miscalibration. (Becomes MC-1.)

**GM-3 — Instrument-health metrics are self-reported.** Coverage %, κ, contamination
status are reported by the steward on the steward's own work → incentive to report
green. "Discrimination" can be *optimized* by selecting spread-maximizing items, which
makes the benchmark less representative — gaming the instrument by improving its
headline stat.

**GM-4 — Accuracy-per-dollar pushes toward cheap-and-clean-only verifiers.** Optimizing
cost-efficiency on the *filtered clean* distribution selects methods that are cheap and
adequate on easy inputs and brittle on the messy production tail that was filtered out.

### 10. Failure cases → misleading conclusions (MC)

**MC-1 — Calibration-transfer failure (Critical).** Benchmark reports "well-calibrated"
(ECE low on 50/50 set); production base rate is ~85% correct; the shipped verifier is
overconfident on wrong answers in the wild. **A wrong answer reaches a student wearing a
high-confidence badge, *because* the benchmark blessed the calibration.** This is the
worst-case: the benchmark's own construction causes the harm it exists to prevent.

**MC-2 — Clean-distribution optimism (Critical).** Verifier scores 95% error-catch on
the benchmark; production is full of the ambiguous/underspecified items QC removed (DB-2);
real error-catch is far lower. The QC that makes the benchmark *trustworthy* makes it
*unrepresentative*, and the gap is invisible from inside the benchmark.

**MC-3 — Synthetic-artifact overfit (High).** Verifier learns the signature of S5
error-injection (e.g., injected errors perturb one operation cleanly) rather than
reasoning about correctness; scores high; fails on novel real errors that have no such
signature.

**MC-4 — Shared-blind-spot false pass (High).** Author and verifier share a misconception
(a locale-specific notation convention, an ambiguous rounding rule). The benchmark labels
the *wrong* answer correct; the verifier agrees; the benchmark concludes "verifier
correct." **The benchmark cannot detect any error in its ground truth that the verifier
happens to share** — and shared training makes exactly those errors likely (HA-5).

**MC-5 — Representation/difficulty confound (Medium).** The §12 "hold subtopic, vary
representation" diagnostic assumes only representation changes — but per the KDG model,
difficulty is *emergent from* representation. A measured drop across representations
conflates a representation effect with a difficulty effect → misattributed conclusion
("verifier is representation-blind" when it's just difficulty-sensitive).

**MC-6 — Goodhart saturation over time (High).** Once the benchmark gates releases, method
selection implicitly fits it; the seal erodes (CT-1); within ~a year the benchmark
measures "fit to benchmark," not "real-world verification," while still being quoted with
its original authority.

---

## Part 2 — The four pointed questions

### Does this benchmark actually measure what we care about?

**Partially — it is a necessary screen, not a sufficient guarantee, and it is
systematically optimistic.** What we *care about*: in production, does the Truth Engine
protect real students from wrong answers, at acceptable cost, on the real (messy,
Arabic-inflected, photographed, ambiguous, ~85%-correct) input stream? What it
*measures*: error-catch on a filtered, ~50/50-balanced, tutor-authored, stress-weighted,
slowly-contaminating set. The three gaps that matter most — **base-rate mismatch
(MC-1)**, **QC survivorship (MC-2)**, and **manufactured errors (MC-3)** — all push the
*same* direction: the benchmark flatters the system. Correct reading: **a method that
fails here will fail in production (good screen); a method that passes here may still
fail in production (weak guarantee).** Use it to *reject*, never alone to *bless*.

### What could a verification system optimize for while still performing poorly in the real world?

- **Synthetic-error signatures** instead of correctness reasoning (MC-3).
- **The benchmark's 50/50 base rate**, achieving good ECE while being production-
  miscalibrated (MC-1).
- **Clean, well-posed, typed items**, excelling on survivors while failing on the
  ambiguous/photographed tail QC removed (MC-2, DB-2, DB-5).
- **Trigger-happy flagging** to max the recall headline at the cost of real-world
  false-blocks (GM-1).
- **The frozen sealed core / fixed ~132 cells**, overfitting an increasingly leaked,
  static distribution (CT-1, MC-6).
- **Agreeing with the reference solutions**, including where those are wrong or reflect a
  shared blind spot (HA-1, MC-4).

### Which metrics are most likely to become Goodhart targets?

Ranked:
1. **Error-catch rate (recall-on-wrong)** — single, quoted, directly gameable by
   over-flagging. #1.
2. **The headline scalar "score @ TB-vX.Y"** — any one number people cite in a ship
   meeting.
3. **ECE / calibration** — gamed by base-rate matching (GM-2).
4. **Coverage % and κ** — self-reported instrument health (GM-3).
5. **Discrimination** — optimizing it de-representativizes the set (GM-3).

### Which assumptions will probably fail within five years?

- **"The exam is stable."** SAT is already digital/adaptive; EST/ACT evolve; the taxonomy
  will be unfrozen (Phase 5). The frozen §13/§14 distributions will measure a defunct
  exam. **Fails.**
- **"We can keep the sealed core private."** Eval-time cloud exposure (CT-1) plus template
  ubiquity (CT-2) mean frontier models will have effectively seen most of it. **Fails.**
- **"Human experts + CAS are the reliable judge."** As verifiers approach/surpass human
  tutors on SAT-level math, human ground truth becomes the *weaker* signal and **caps the
  measurable ceiling** — grading a better judge with a worse one. **Likely fails at the
  top tier.**
- **"Verification is binary correct/incorrect + a first-error step."** Future proof-
  carrying / probabilistic / formal methods won't fit the verdict/step schema, which will
  feel like MMLU's multiple-choice straitjacket. **Likely fails.**
- **"A small team sustains quarterly expert labeling + COI separation forever."** Org-scale
  assumption under real resource limits. **Probably fails** (MT-1, HR-3).

---

## Resolution Matrix

Severity: **C**ritical (can cause a student-harming wrong ship) · **H**igh (materially
misleads or blocks scale) · **M**edium · **L**ow.
Status: **Must-Fix** (blocks freeze) · **Mitigated** (design change adopted into the
proposal) · **Accepted** (documented residual risk, not fully resolvable) · **Open**
(needs an R0 decision / research).

| ID | Finding (short) | Sev | Blocker | Resolution / decision | Residual risk | Status |
|---|---|---|---|---|---|---|
| **MC-1 / GM-2** | 50/50 construction breaks calibration transfer; benchmark ECE ≠ production ECE | C | ✅ | Report calibration **only** on a **production-base-rate slice** (re-weight to ~85% correct or hold a separate representative calibration set). Never quote ECE on the balanced set. | Real base rate drifts; must be re-estimated | **Must-Fix** |
| **MC-2 / DB-2** | QC discards ambiguous/underspecified items = the real failure mode | C | ✅ | Add an **"ill-posed / ambiguous" stratum** kept *on purpose* with a distinct label; the correct verifier behavior is *abstain / flag-uncertain*, and that is scored. Report a headline **"messy-slice" error-catch** separately from clean. | Can't fully label ambiguous items' truth | **Must-Fix** |
| **HA-1** | Label error correlated with difficulty; <2% is not uniform | C@expert | ✅ | Report **per-tier label-error rate**; attach a **ground-truth-confidence** to each item; on expert tier require a *stronger* independent check (2 experts + CAS) or mark the item "reference-uncertain" and exclude from false-block scoring. | Expert-tier truth stays partly uncertain | **Must-Fix** |
| **CT-1** | Eval-time cloud-LLM exposure exfiltrates the sealed core | H | ✅ | Define an **eval protocol**: sealed-core runs use no-retention/zero-log endpoints or local models; any cloud-exposed run **burns that slice** (rotates it to open). Track "seal exposure" per item. | No-retention promises are trust-based | **Must-Fix** |
| **MC-3 / HA-3** | Verifier overfits synthetic error-injection artifacts | H | ✅ | Cap S5 share; hold a **real-error-only** benchmark slice (S4 student wrongs) as the authoritative detection score; injected errors used for train only. | Real wrongs cluster by topic (DB-4) | **Must-Fix** |
| **GM-1** | Recall-on-wrong headline rewards over-flagging | H | ✅ | Mandate the **cost-weighted (w_FA·FAR + w_FB·FBR)** as the *sole* headline, always shown with paired FAR **and** FBR. Forbid a single bare accuracy/recall number in reports. | Weights themselves are a target (GV-1) | **Must-Fix** |
| **HA-5 / MC-4 / GV-3** | Human independence is structurally false; shared blind spots evade the firewall | H | — | Compensate for unattainable independence: **blind + time-separated** labeling, **external spot-review** contract (even part-time), forbid AI-Tutor use during ground-truthing, and add **provenance attestation**. Accept that residual correlation remains. | Cannot achieve true independence in a small org | **Accepted** (+partial Mitigation) |
| **SC-1 / HR-1** | Rigorous multi-review vs. 10K instances is contradictory at team scale | H | ✅ | Reconcile §3↔§8: **tiered review depth** — full dual-review only on the sealed **TB-Core (~500–1,000)**; lighter single-review+audit on the rest. Re-scope §3 sizes to the *actual* labor budget, stated explicitly. | Smaller Gold = weaker per-cell power | **Must-Fix** |
| **DB-1** | Stress-profile gate hides common-case (easy/medium) regressions | H | — | Gate on **both** profiles: a release must pass stress **and** a "no-regression on exam-faithful easy/medium" check. Easy-cell floor with anti-saturation minimums. | Easy cells saturate; small regressions still hard to see | **Mitigated** |
| **MC-6 / CT-3** | Goodhart saturation + retire-to-public breaks comparability vs. contamination | H | — | Pick explicitly: keep a **small permanent "anchor" set never published** for longitudinal comparability; everything else rotates and, once public, is *excluded* from headline. Publish frozen-core **and** fresh-slice; divergence = alarm. | Anchor set slowly leaks too (CT-1) | **Mitigated** |
| **LC-1** | Error-category κ low + 13 overlapping categories | H | — | Collapse to a **small MECE top-level set** (≈5) with optional sub-tags; report category metric **only** where κ clears bar per cell; treat localization as *secondary*, never a headline. | Category signal stays noisy | **Mitigated** |
| **MT-1** | Silent staleness → false confidence worse than no benchmark | H | ✅ | Add a **freshness contract**: every result cites `age`; past a staleness threshold the benchmark auto-labels results **"STALE — not decision-grade"**; define an explicit **dormant mode**. | Requires someone to honor the labels | **Must-Fix** |
| **HA-2** | Only checkable-answer items admitted → excludes hard-to-verify | M | — | Add a **graded/open stratum** (rubric-scored) reported separately; acknowledge outcome-checkable ≠ representative. | Graded truth is subjective | **Mitigated** |
| **HA-4** | Difficulty tag mismatches the router's notion | M | — | Record **both** an authored tier **and** the production detector's tier per item; score escalation-appropriateness against the **router's own** tier; report the disagreement. | Detector v-drift | **Mitigated** |
| **DB-3 / DB-4** | Author monoculture; uneven wrong-answer power | M | — | Diversify S1 authors; **report per-cell statistical power (n)** alongside every rate; never present an underpowered cell as equal. | Sourcing diversity is slow | **Accepted** |
| **DB-5** | AR / messy-photo under-tested | M | — | Set explicit **locale and photo-quality quotas** from real production stats; include deliberately degraded images. | Needs production stats (later phase) | **Open** |
| **LC-2 / LC-3** | First-error ill-defined; longitudinal label drift | M | — | Publish a **canonical step-segmentation rule**; keep a **frozen anchor label set** re-scored each version to separate label drift from method progress. | Segmentation still partly arbitrary | **Mitigated** |
| **LC-4** | Silver single-labeling poisons thresholds | M | — | Fit thresholds/calibration on a **Gold** validation slice, not Silver; Silver for augmentation only. | Shrinks Gold available for test | **Mitigated** |
| **MT-2** | Reference-panel treadmill moves the "dead-cell" zero | M | — | Version the panel with the benchmark; report discrimination **relative to a fixed historical panel** as well as the current one. | Panel curation overhead | **Mitigated** |
| **MT-3 / HR-3 / GV-1/2/4** | Steward SPOF; unstaffable COI; toothless self-governance | H | ✅ | Add **external/independent review** (even minimal, contracted); split steward duties (author ≠ sealer ≠ auditor); **pre-register** metrics with a dated, immutable manifest; give the benchmark a **written veto charter** the user signs. | Small org limits true independence | **Must-Fix** (governance) |
| **SC-2 / SC-3** | Tail-cell filling and dup-adjudication scale poorly | M | — | Prioritize cells by **exam weight × current statistical power**; accept sparse low-value cells and mark them "indicative only." | Tail stays thin | **Accepted** |
| **HR-2** | Re-audit is first cut under load | M | — | Make re-audit a **release-blocking gate** (no re-audit ⇒ no new version), so skipping it *stops* releases rather than silently degrading quality. | Adds friction to releases | **Mitigated** |
| **GM-3 / GM-4** | Self-reported health; cost-eff. favors clean-only | M | — | Instrument-health metrics **externally spot-checked**; report accuracy-per-dollar **on the messy slice** too. | External check is light | **Mitigated** |
| **CT-2** | "Original" items ≈ web-ubiquitous templates | M | — | Prefer **novel structures / unusual parameterizations**; treat "0 known duplicates" as *"0 found,"* never *"0 exist,"* in all reporting language. | Can't scan model training sets | **Accepted** |
| **MC-5** | Representation/difficulty confound in §12 diagnostic | M | — | When varying representation, **hold calibrated difficulty fixed** (match `difficulty_b`) or report the representation effect *conditioned on* difficulty. | Needs calibration data | **Open** |
| **HA-2b** | 5-year schema rigidity (binary verdict + step) | M | — | Design the schema **extensibly** now (verdict is one *view*; allow proof/probabilistic outputs) even though only binary is used at launch. | Future methods still may not fit | **Open** |

**Tally:** 6 Must-Fix (+1 governance Must-Fix) · 7 Mitigated · 4 Accepted · 3 Open.

---

## Part 3 — What must change before the Benchmark architecture is frozen

**Must-Fix (freeze-blocking).** The proposal cannot be frozen until it incorporates:

1. **Calibration on a production-base-rate slice** (MC-1) — the balanced set may never be
   used to claim calibration.
2. **A deliberate ambiguous/ill-posed stratum** with abstain-scoring, plus a separate
   **messy-slice** headline (MC-2/DB-2).
3. **Per-tier label-error reporting + per-item ground-truth-confidence**, and stronger
   expert-tier checks (HA-1).
4. **An eval protocol that contains cloud-exposure** and burns exposed slices (CT-1).
5. **A real-error-only authoritative detection slice**; S5 confined to training (MC-3).
6. **Cost-weighted metric as the sole headline** with mandatory paired FAR/FBR (GM-1);
   and a **freshness/staleness contract** (MT-1).
7. **Governance with real independence and teeth**: external spot-review, split steward
   duties, immutable pre-registration, a signed veto charter, and a re-scoped §3↔§8 labor
   reconciliation (MT-3/HR-3/GV-*, SC-1).

**Accepted residual risks (document in the proposal, do not pretend to solve).** True
human independence in a small org (HA-5/MC-4); template/web contamination of "original"
items (CT-2); author monoculture and uneven cell power (DB-3/DB-4); sparse low-value tail
cells (SC-2). These are honestly-bounded, not fixed.

**Open (decide at R0).** Locale/photo-quality quotas from real stats (DB-5); controlling
the representation/difficulty confound (MC-5); schema extensibility for post-binary
verification methods (HA-2b).

**The one-sentence reframing this review forces onto the proposal:** *the Truth Benchmark
is a **rejection filter and an early-warning instrument**, not a certificate of
production safety — and every construction choice that makes it a clean, balanced,
high-quality dataset is the same choice that makes it optimistic, so the design must
report its own optimism (messy-slice, real-error-slice, production-base-rate calibration,
per-tier ground-truth confidence, staleness) rather than a single flattering score.*

---

## Sources / basis

Attacks are grounded in the same literature the proposal cites (accessed July 2026),
read here for *failure modes* rather than best practices:

- QC-driven survivorship & the honest 68% discard — [SWE-bench Verified (OpenAI)](https://openai.com/index/introducing-swe-bench-verified/); benchmark saturation & retirement — [Why we no longer evaluate SWE-bench Verified](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/).
- Difficulty-correlated label error (~5%) — [FrontierMath, arXiv 2411.04872](https://arxiv.org/html/2411.04872).
- Contamination via paraphrase/exposure; string-match decontamination is weak — [From Static to Dynamic Evaluation, arXiv 2502.17521](https://arxiv.org/pdf/2502.17521); benchmark inflation vs. held-outs — [Retro-Holdouts, arXiv 2410.09247](https://arxiv.org/pdf/2410.09247).
- Ground-truth label errors even in flagship benchmarks (MMLU → MMLU-Pro/Redux) — surveyed in the contamination literature above.
- Process-vs-outcome and the fragility of step labels — [PRM800K / Let's Verify Step by Step, arXiv 2305.20050](https://arxiv.org/abs/2305.20050).
- Internal context (read-only): `truth-benchmark-dataset.md`, `adaptive-verification.md`, `detector-v2-review-report.md`, `kdg-multi-axis-architecture.md`.
