# Si Math Truth System v2 — Engineering Backlog

**Document type:** Execution backlog. Not architecture, not design, not implementation.
**Status:** Proposed. Nothing here is implemented. No migration is prepared. No deploy is made.
**Date:** 2026-08-02

**Frozen inputs** — this backlog executes them and does not renegotiate them:

| Frozen artefact | Version | Unfreeze requires |
|---|---|---|
| **Architecture** | *Si Math Truth System v2 — Synthesized Architecture* (2026-08-02), as amended by the six amendments in `truth-system-v2-migration-strategy.md §7` | An explicit written decision recorded as an amendment, with the engineering constraint that forced it |
| **Roadmap** | Phases V0–V8 as published in `truth-system-v2-migration-strategy.md §3` | The same |

**One change to the roadmap, adopted from review:** V4 ships **one** lesson family, not two or
three. Reasoning in §4.0 — it is a better decision than the one it replaces, and the reason is not
the obvious one.

---

## 1. How to use this document

### 1.1 Hierarchy and its tool mapping

```
PHASE      V0 … V8            program-level, ~1 quarter each
  EPIC     V0-E1 …            a shippable capability
    TASK   V0-T01 …           independently deployable unit of work
```

Milestones are **not** a separate level here. In the migration roadmap each phase already carries a
single exit gate, and inventing a middle tier between epic and task would add ceremony without
adding a decision. Where a phase genuinely has an internal checkpoint it is modelled as a **gate
task** (type `OPS`, complexity `XS`) that blocks everything after it — `V2-T23`, `V4-T58`. A gate
task is a milestone that can be assigned, tracked, and failed, which is what a milestone should have
been.

| This document | GitHub Projects | Linear | Jira |
|---|---|---|---|
| Phase | Iteration / custom `Phase` field | Project | Version / Fix Version |
| Epic | Issue with `epic` label; sub-issues linked | Project Milestone *or* parent issue | Epic |
| Task | Issue | Issue | Story / Task |
| `depends_on` | Task-list linkage | Blocked-by relation | "is blocked by" link |
| Gate task | Issue with `gate` label | Issue with `gate` label | Story with `gate` label |

`truth-system-v2-backlog.csv` accompanies this file for direct import. Column mapping in §8.

### 1.2 Field definitions

**`work_type`** — the field that decides what "done" means. Mixing these on one board is the most
common way a programme like this fails, because an engineering task and a measurement task look
identical in a tracker and are not.

| Type | Definition of done | Owner profile |
|---|---|---|
| `ENG` | Code merged, CI green, deployable | Engineer |
| `MEASURE` | **A number published with an interval and a method name.** No code required. A `MEASURE` task is not done when the script runs — it is done when the number is written down and someone has looked at it | Engineer or analyst |
| `OPS` | A decision recorded, a process running, or a person hired/contracted | Founder / ops |
| `RESEARCH` | A bet resolved: the kill criterion fired, or the approach cleared its gate | Funded separately from the platform budget |

**`complexity`**

| | Effort | |
|---|---|---|
| `XS` | ≤ 1 day | |
| `S` | 2–3 days | |
| `M` | ~1 week | |
| `L` | 2–3 weeks | |
| `XL` | > 3 weeks | **A planning defect. An `XL` in this backlog must be split before it is started.** Exactly one exists (`V2-T31`) and its split rule is stated inline |

**`deploy_surface`** — which artefact the task touches. This matters more than usual here: the
Edge Function deploy path is restricted after two outages (`DEPLOY.md §4`), and every migration
needs individual approval (`CLAUDE.md §3`).

`none` · `migration` · `edge-fn` · `frontend` · `ci` · `docs`

**Independently deployable** is a hard constraint on every task: each one must leave `main` green
and shippable on its own. In practice that means one of — behind a flag defaulted off, additive-only,
or behaviour-preserving. Where a task cannot satisfy that alone, it is merged with its neighbour
rather than sequenced behind it.

### 1.3 Standing rules

1. **`verification_meta` is append-only.** Keys are added, never renamed, never removed.
   `ai-monitor.html` reads its internal shape.
2. **Every migration is PREPARED, reviewed, approved, then APPLIED** — the existing Phase 6/7
   cadence, one approval per migration.
3. **No task in V0–V6 is student-visible.** V7 is the first, and it starts in
   `docs/knowledge/graph-data.mjs`.
4. **L3 Shadow keeps running, unchanged, throughout.**

---

## 2. Program view

### 2.1 The critical path does not run through engineering

```
   V2-T23 legal ──► V2-T25 store ──► V2-T31 authoring ──► V2-T32 μ ──► V4 gate ──► V5 ──► V8
                                          (longest lead, non-engineering)
```

Everything downstream of `μ` is gated on a workstream whose bottleneck is counsel, authors and
adjudicators. The engineering stream (V0 → V1 → V3) can run months ahead of it and then **wait**.
That is the single most important fact for scheduling this programme, and it argues for starting
`V2-T23` on day one alongside `V0-T01`.

### 2.2 Three streams, run concurrently

| Stream | Phases | Blocking dependency on other streams |
|---|---|---|
| **A — Platform** | V0 → V1 → V3 → V4 → V5 → V6 → V7 | Needs B's labels at V4 |
| **B — Ground truth** | V2, continuous | Needs nothing. **Start first.** |
| **C — Research** | R1–R6 | Nothing. Funded separately. Never a dependency of A or B |

### 2.3 First ten tasks, in order

The answer to "what do we do Monday."

| # | Task | Why this one |
|---|---|---|
| 1 | `V2-T23` Legal review | Longest lead time in the programme. Blocks all of stream B |
| 2 | `V0-T01` Answer-blind judge | Cheapest correctness win in the repository. Every day it waits contaminates more shadow data |
| 3 | `V0-T06` Decision log schema | A compliance boundary that gets more expensive daily. A new table today; a migration over student PII later |
| 4 | `V0-T13` Forced-exploration sampler | **Free today, impossible later.** No early exit exists, so the fraction is trivially 1.0 |
| 5 | `V2-T30` Traffic query | Two days of work that decides V4's entire scope. Nothing downstream should be guessed until it lands |
| 6 | `V0-T02` Blind-judge guard test | Stops the constraint silently regressing the first time someone edits the prompt |
| 7 | `V0-T10` Policy identity | Every decision ever made is currently unattributable to a version |
| 8 | `V2-T35` Is T4 real? | Determines whether human adjudication is an integration or a build. Changes V2's size materially |
| 9 | `V0-T08` Decision-log writer | Turns 3 into data |
| 10 | `V1-T16` Shared-core extraction | Precondition for adding anything to a 4,627-line function with a restricted deploy path |

### 2.4 What is deliberately not decomposed

**V5–V8 are specified to epic level only, and that is a decision rather than an omission.**

Their task shapes depend on numbers that do not exist yet: `μ` (V2-T32), the checker's false-negative
rate (V2-T33), IR parse rate (V4-T56), faithfulness (V4-T57), and `ρ` (V4-T54). `α_ledger` is
*derived* from `μ` and coverage (v2 §16) — so the ledger's threshold work cannot be sized before
`μ` exists. The audit's sample size is set by the margin `x = r − ê`, so V8 cannot be sized before
`r` is set.

Decomposing them now would produce a plausible-looking task tree that is fiction with ID numbers
attached, and — in a repository whose stated rule is *"a green check is only evidence if it could
have gone red"* — a backlog whose estimates could not have been wrong is the same defect in a
different disguise.

**Decomposition rule:** a phase is broken into tasks when the measurements its design depends on
have been published. V5 decomposes when V2-T32 and V2-T33 land. V8 decomposes when `r` is set.

---

## 3. Phases V0–V4 — full task decomposition

### PHASE V0 — Observation surface

*Unblocked today. Nothing that follows can be retrofitted onto data collected without it.*

#### Epic `V0-E1` — Answer-blind judging

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V0-T01` | Split `runJudge` into pre-commit + ruling calls, behind `JUDGE_ANSWER_BLIND` (default off) | ENG | S | edge-fn | — | Flag off ⇒ `verification_meta` byte-identical to today. Flag on ⇒ both legacy and blind keys present |
| `V0-T02` | Guard test: the pre-commit payload contains no candidate | ENG | XS | ci | `V0-T01` | Test fails if `zeroAnswer`, `tutorFinalAnswer`, or either solver answer appears in the pre-commit message body |
| `V0-T03` | Record `judge_precommit_answer` / `judge_blind_verdict` / `judge_blind_confidence` (append-only) | ENG | XS | edge-fn | `V0-T01` | Keys present; no existing key renamed or removed; `ai-monitor.html` unaffected |
| `V0-T04` | Enable `JUDGE_ANSWER_BLIND` at 100% of shadow traffic | ENG | XS | edge-fn | `V0-T02`, `V0-T03` | Both verdicts written on every shadow run for 14 consecutive days |
| `V0-T05` | Publish the blind-vs-legacy 2×2 agreement matrix | MEASURE | S | none | `V0-T04` | Matrix published with `n`, plus ≥30 disagreement cases sampled and classified by hand |

> **Note on `V0-T05`.** v2 §7.3 predicts the two verdicts should differ substantially. If they agree
> on ≥95% of items, that is a finding, not a pass — it means either the pre-commitment is leaking
> or the judge was never the binding constraint. Either answer changes the plan, which is why this
> is a `MEASURE` task and not a checkbox.

#### Epic `V0-E2` — Decision log, identifier-free

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V0-T06` | `verification_decisions` table — no `user_id`, no image, no question text, no prose | ENG | M | migration | — | Column-level review confirms zero identifier columns; RLS denies every client role; PREPARED → approved → APPLIED |
| `V0-T07` | CI gate: decision-log DDL may not contain identifier column names | ENG | S | ci | `V0-T06` | Test fails if the DDL matches `user_id\|email\|image\|question_text\|ai_response` |
| `V0-T08` | Writer — one decision row per shadow run | ENG | M | edge-fn | `V0-T06` | Row count equals shadow-run count over 7 days; `question_records` write path unchanged |
| `V0-T09` | Fault isolation — a decision-write failure must not affect anything else | ENG | S | edge-fn | `V0-T08` | Fault-injection test: insert throws ⇒ `question_records` still updated, student response unaffected, `ai_model_calls` still flushed |

> **Why `V0-T07` exists.** The compliance boundary of v2 §23 is only real if it cannot erode. A
> reviewer will eventually be asked to "just join `user_id` for one dashboard." A CI gate is the
> answer that survives that conversation, and it is the same idiom `repo-integrity.test.mjs`
> already uses.

#### Epic `V0-E3` — Policy identity and propensity

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V0-T10` | `policy_version` / `plan_id` / `pipeline_version` on every decision row | ENG | S | edge-fn + migration | `V0-T06` | No decision row may be written with a null policy identity — enforced by `NOT NULL`, not convention |
| `V0-T11` | `actions_taken[]` with per-action `action_propensity`, joined to `ai_model_calls` by `call_uid` | ENG | S | edge-fn | `V0-T10` | Every action carries a propensity (1.0 under V0's deterministic plan) and resolves to its real spend row |
| `V0-T12` | Name the current straight-line pipeline as a versioned plan (`l3-linear-v1`) | ENG | XS | edge-fn | `V0-T10` | Plan registry exists with one entry; adding a plan requires no code change to the writer |

> `V0-T11` is small only because `ai_model_calls.call_uid` already exists. Without that field this
> would be a `L`. It is the clearest example of Phase 7's telemetry work paying for itself here.

#### Epic `V0-E4` — Forced exploration

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V0-T13` | `forced_exploration` flag + sampler, fraction as config, default 1.0 | ENG | S | edge-fn + migration | `V0-T06` | Flag non-null on every decision row; fraction readable from config without a deploy |
| `V0-T14` | Propensity floor per comparable action | ENG | XS | edge-fn | `V0-T11`, `V0-T13` | Floor enforced at the sampling point; inert at fraction 1.0 but exercised by a unit test at fraction 0.05 |
| `V0-T15` | CI invariant: the exploration fraction may not be set to 0 | ENG | S | ci | `V0-T13` | A config setting the fraction to 0 fails CI with a message naming the risk it protects |

> **Why `V0-T15` is not paranoia.** v2's risk register rates *"forced exploration gets removed to
> save cost"* as **Medium, and the one to watch**, with the consequence that audit, calibration and
> OPE all silently invalidate at once. The mitigation v2 names is that the exploration fraction is
> owned by whoever owns the reliability claim. A CI gate is that ownership, written down.

**Phase V0 exit gate.** 14 consecutive days with: a decision row for 100% of shadow runs, non-null
policy identity and propensity on every row, `forced_exploration` recorded, the blind-vs-legacy
matrix published, and zero change to any existing column or dashboard panel.

---

### PHASE V1 — Shared-core extraction

*Behaviour-preserving. Makes the Edge Function survivable before anything is added to it.*

#### Epic `V1-E1` — Extract the verification core

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V1-T16` | Move solvers / judge / OCR check / normalisation / meta assembly to `_shared/verification.core.js` | ENG | M | edge-fn | V0 complete | Extraction is mechanical; no logic edited in the same commit |
| `V1-T17` | Sync + drift validator for the new shared module | ENG | S | ci | `V1-T16` | CI fails on drift, in the `sync-taxonomy.mjs` / `validate-taxonomy.mjs` idiom |
| `V1-T18` | Suite executing the extracted module against captured pre-refactor fixtures | ENG | M | ci | `V1-T16` | Byte-equal `verification_meta` for ≥200 captured historical inputs |
| `V1-T19` | Deploy via `DEPLOY.md` Path B; record post-deploy bundle file list | OPS | S | edge-fn | `V1-T18` | `get_edge_function` shows every bundle file; smoke test per `DEPLOY.md §6` green; both recorded in the release report |

> `V1-T19` is an `OPS` task on purpose. The risk in this epic is not the refactor — the suite covers
> that. It is the deploy, on a function whose two outages both came from a bundle that shipped
> incomplete.

#### Epic `V1-E2` — TCB perimeter

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V1-T20` | Declare the TCB directory and its line budget; gate in CI | ENG | S | ci | `V1-T16` | Budget published as a number; CI fails when exceeded |
| `V1-T21` | TCB hand-review checklist | ENG | XS | docs | `V1-T20` | Checklist exists and names the specific traps: sound-vs-unsound predicate pairs, scores leaking out of a `Verdict`, and case-lists standing in for structure |

#### Epic `V1-E3` — Background budget

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V1-T22` | Measure `waitUntil()` CPU and wall headroom at current pipeline depth | MEASURE | S | none | `V1-T19` | Headroom published with P50 and P95, plus the depth at which the window would be exceeded |

**Phase V1 exit gate.** Byte-equal pipeline outputs, bundle verified in production, TCB budget
published and gated, background headroom measured.

---

### PHASE V2 — Label Factory

*Start on day one, in parallel with V0. It is the critical path and its bottleneck is not
engineering.*

#### Epic `V2-E1` — Legal gate **(blocks everything else in V2)**

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V2-T23` | **GATE** — legal review of item provenance and student-data retention, before first ingestion | OPS | L | none | — | Written counsel opinion covering: clean-room authoring requirements, COPPA posture on uploaded photos, and retention limits on traces |
| `V2-T24` | Written positioning decision: general-audience test prep vs school-purposed K-12 | OPS | M | none | `V2-T23` | Decision recorded in writing, with the regime it selects (SOPIPA in / out) named explicitly |

> `V2-T24` looks like marketing and is not. v2 §23: positioning as a school-purposed K-12 tool pulls
> in SOPIPA and its state analogues; general-audience test prep keeps them out and leaves COPPA and
> CCPA/CPRA. The choice determines what the Assurance Plane is permitted to store, which means it
> is a schema input.

#### Epic `V2-E2` — Label store

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V2-T25` | `labels` schema — versioned gold store, per-item provenance, adjudicator ids, consensus flag, `label_version` | ENG | M | migration | `V2-T23` | Label versions frozen on publish; a write to a published version is rejected by constraint |
| `V2-T26` | Cross-version replay guard | ENG | S | ci | `V2-T25` | Any comparison spanning a `label_version` boundary fails loudly rather than returning a number |

#### Epic `V2-E3` — Human adjudication loop

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V2-T27` | Adjudication queue in `admin.html` — route, claim, resolve, double-mark | ENG | L | frontend | `V2-T25`, `V2-T35` | Two adjudicators can independently mark the same item and the disagreement is visible |
| `V2-T28` | Register per-adjudication unit cost in `cost_engine` | ENG | S | migration | `V2-T27` | Human adjudication appears on the economics dashboard beside model spend, priced per resolution |
| `V2-T29` | Path from a resolution into the label store, with provenance | ENG | M | edge-fn | `V2-T27` | Every resolution produces exactly one label row carrying its adjudicator ids and date |

#### Epic `V2-E4` — First gold tranche and the two numbers

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V2-T30` | Traffic query: rank all 33 subtopics by volume | MEASURE | S | none | — | Ranking published. **This decides V4's scope and must precede `V4-T49`** |
| `V2-T31` | Author + double-mark 300–500 clean-room items | OPS | **XL → split** | none | `V2-T23`, `V2-T27` | **Split rule: one task per ~100-item tranche per subtopic, in `V2-T30` rank order.** Done per tranche when double-marked with provenance |
| `V2-T32` | **Measure `μ`** — base error rate of the current candidate stream, per lesson family | MEASURE | M | none | `V2-T31` | `μ` published per family with an interval and a method name |
| `V2-T33` | **Measure the checker's own false-negative rate on the gold set** | MEASURE | M | none | `V2-T31` | Rate published. **A high value invalidates every other risk number in the programme and halts V5** |
| `V2-T34` | Measure expert non-consensus rate on the hard tail | MEASURE | S | none | `V2-T31` | Rate published; compared against the ~30% v2 budgets for |

> **`V2-T33` is the most under-rated task in this backlog.** v2 §16 cites a measured **38.5%**
> false-negative rate for a comparable rule-based math verifier — responses marked incorrect that
> were actually correct. At that rate a 0.5% selective-risk target is not merely unmet, it is
> *unmeasurable*. This task can invalidate V5 before V5 is built, which is exactly why it runs
> before V5 rather than during it.

#### Epic `V2-E5` — Establish whether T4 exists

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V2-T35` | Determine whether human tutor support is a staffed routable queue or a claim in `trust.html` | OPS | XS | none | — | Answer recorded. Integration ⇒ `V2-T27` shrinks to `M`. Build ⇒ it stays `L` and the SLA is a new task |

**Phase V2 exit gate.** ≥300 double-marked items in a frozen `label_version`; a human loop with
measured throughput and cost per adjudication; `μ` and the checker false-negative rate published.

---

### PHASE V3 — Exact rational trusted core

#### Epic `V3-E1` — The kernel

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V3-T36` | `_shared/exact.core.js` — `BigInt` rationals: construct, normalise, `+ − × ÷`, compare, exact equality | ENG | M | ci | `V1-T20` | Zero dependencies; identical bytes execute in Deno, Node and the browser |
| `V3-T37` | Property tests + line-budget assertion | ENG | S | ci | `V3-T36` | Properties cover associativity, normalisation idempotence, and exact zero-testing; budget gate green |
| `V3-T38` | Publish the TCB line count; record the hand review | ENG | XS | docs | `V3-T37` | Line count published; review signed off line-by-line and recorded in the release report |

#### Epic `V3-E2` — Upgrade the existing checker

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V3-T39` | `parseNumericAnswer` / `answersEquivalent` over exact rationals — `NUMERIC_TOLERANCE` → `EXACT` | ENG | S | edge-fn | `V3-T36` | No float division anywhere in the comparison path; the fail-closed contract preserved verbatim |
| `V3-T40` | Differential test vs legacy over ≥10,000 historical solver-answer pairs | MEASURE | M | none | `V3-T39` | Every divergence classified by hand. **Per the function's own contract divergences may only be `0 → 1`; any `1 → 0` is a latent production bug and is this task's most valuable output** |

#### Epic `V3-E3` — The cheap checkers

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V3-T41` | Option-set membership; completeness and pairwise distinctness | ENG | S | ci | `V3-T36` | Distinctness decided over exact rationals; result is a precondition witness for `exhaustion` |
| `V3-T42` | Answer-form / significant-figure / units as a surface-form family, separate from value equality | ENG | S | ci | `V3-T36` | A malformed answer is distinguishable from a wrong answer at the interface — the weak/strong certification split of v2 Law 1(b) |
| `V3-T43` | Exact geometric predicates over ℚ, squared-distance discipline, exact constructions | ENG | M | ci | `V3-T36` | Perpendicularity as a zero dot product, equidistance as equal squared distances; no constructed point is ever approximate |

#### Epic `V3-E4` — Soundness lattice at the interface

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V3-T44` | `Verdict` type: `{PROVED, REFUTED, UNDETERMINED}` + `soundness_class` + witness. Never a score | ENG | S | ci | `V3-T41` | Only `EXACT` and `MODEL_OPINION` implemented; the enum is extensible without touching call sites |
| `V3-T45` | Interface test: a checker that returns a score fails validation | ENG | XS | ci | `V3-T44` | Test fails if any checker's return type admits a numeric confidence |

> **Why only two soundness classes.** `CERTIFIED_ENCLOSURE` needs ball arithmetic that needs a
> service tier; `CHECKED_PROOF` needs cvc5; `RANDOMIZED_EXACT` needs the independent-repetition
> discipline. Building four dead enum members buys nothing for eighteen months. The lattice is
> preserved as a *shape*; only the two classes that carry Horizon 1's weight are implemented.

**Phase V3 exit gate.** TCB published, under budget and hand-reviewed; differential test complete
with every divergence classified; `verification_quality_score`'s formula unchanged so the AI Monitor
series stays comparable.

---

### PHASE V4 — Verification IR, one lesson family

#### 4.0 Why one family and not three

The review's correction is adopted, and its strongest justification is not the obvious one.

The obvious argument — *"three families is more work"* — is weak, because the families share the
canonicaliser and the kernel.

**The real argument is that the IR's predicate vocabulary is shaped by the family it serves.**
Designing a vocabulary for three families simultaneously means generalising across three shapes
before knowing whether it works for one. That is premature generalisation, and its failure mode is
the expensive kind: a vocabulary that fits nothing well, discovered at month nine.

One family gives a vocabulary that has been *proven* on real traffic. Family two then tells you
which parts of it were general and which were incidental — which is information you cannot buy any
other way, and which three-at-once destroys by construction.

Two supporting reasons:

- **The ≥75% parse-rate gate is an average, and an average hides a failure.** Three families at
  80% / 78% / 68% averages 75.3% and passes the gate while one family sits at 68%. One family makes
  the gate binary.
- **Human-judged faithfulness is the scarcest resource in the programme.** Spreading the same
  adjudicator hours across three families thirds the sample per family and widens every interval —
  on the number v2's risk register rates highest-consequence in the entire system.

**Which family is decided by `V2-T30`, not here.** The selection criterion is *traffic × checker
coverage per unit of work*, and v2 H1.2 nominates linear algebra, ratio/percentage and coordinate
geometry as the candidates. Backsolve-by-substitution is a *complete decision procedure* on
multiple-choice linear items, which makes that family the likely winner on both axes — but the
traffic query decides, and guessing it here would be the exact failure this architecture exists to
prevent.

#### Epic `V4-E1` — Canonicaliser

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V4-T46` | `_shared/canonical.core.js` — canonical AST, α-renaming, deterministic serialisation, sorted option set, template slots | ENG | L | ci | `V3-T44` | Designed for hashing: the same item serialises identically across processes and runs |
| `V4-T47` | Emit `canonical_hash` and `template_hash` | ENG | S | edge-fn | `V4-T46` | Both hashes on every decision row; template hash ignores numeric literals |
| `V4-T48` | Hash stability measurement | MEASURE | S | none | `V4-T47` | Identical items hash identically across ≥3 independent transcription runs; the collision and instability rates published |

> `V4-T48` is a `MEASURE` task because the interesting output is the *instability* rate. A
> canonicaliser that is 97% stable is a cache that serves the wrong answer 3% of the time, and V6
> depends on this number.

#### Epic `V4-E2` — The IR

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V4-T49` | Fixed closed predicate vocabulary + typed sorts, for the family selected by `V2-T30` | ENG | L | ci | `V4-T46`, `V2-T30` | Vocabulary is closed: an unrecognised identifier is a parse failure, never a passthrough |
| `V4-T50` | Dependency graph + assorter map per assertion kind | ENG | M | ci | `V4-T49` | Each assertion kind supplies a bounded non-negative assorter; the generic test is not modified to add one |
| `V4-T51` | `exhaustion` assertion kind + witness validation | ENG | M | ci | `V4-T50`, `V3-T41` | Settles at `EXACT` from K−1 refutations plus a completeness/distinctness witness |
| `V4-T52` | Intensionality check inside the trusted checker | ENG | M | ci | `V4-T50` | `Verdict.intensionality_checked` is the checker's finding; a producer's `claimed_intensional` cannot influence it |

> `V4-T51` is not optional and is easy to drop. Without an `exhaustion` assertion the system can
> deductively determine a multiple-choice answer by eliminating every distractor and **still abstain
> for want of a ledger entry.** On a four-option SAT item this is the most common route to the
> CERTIFIED tier.

#### Epic `V4-E3` — T2, and the first real decorrelation

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V4-T53` | T2 code-execution path: an IR expression as witness, evaluated by the exact kernel. Replaces Solver B's temperature twin | ENG | M | edge-fn | `V4-T49`, `V3-T36` | Solver B is no longer the same model at a different temperature; the witness is executable and checked |
| `V4-T54` | **Measure `ρ`** for the selected family — `P(both wrong ∧ same wrong \| both wrong)` | MEASURE | M | none | `V4-T53`, `V2-T31` | `ρ` published per family. **Determines whether conditional filtration (R1) is urgent or can wait** |

> **`V4-T54` could not be run before now, and v2's month-3 schedule for it is not achievable here.**
> It needs two genuinely different producers (which arrives with `V4-T53`) and ground truth (which
> arrives with `V2-T31`). v2 calls this "the cheapest way to de-risk the entire programme" and it
> is — but its prerequisites are real and are not named in the source document.

#### Epic `V4-E4` — Faithfulness, the number everything rests on

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V4-T55` | Back-translation check as a Risk Model feature | ENG | S | edge-fn | `V4-T49` | Contributes a feature; **gates nothing**; reaches the ledger only through the Risk Model's single Bayes factor |
| `V4-T56` | **Measure IR parse rate** on the selected family | MEASURE | M | none | `V4-T49` | Rate published on live shadow traffic. **Gate: ≥75%** |
| `V4-T57` | **Measure human-judged IR faithfulness** on the selected family | MEASURE | L | none | `V4-T49`, `V2-T27` | Rate published with an interval. This is the number the entire CERTIFIED tier's risk claim rests on |

#### Epic `V4-E5` — The gate

| ID | Title | Type | Cx | Deploy | Depends | Definition of done |
|---|---|---|---|---|---|---|
| `V4-T58` | **GATE** — family-1 review | OPS | XS | none | `V4-T56`, `V4-T57` | Pass ⇒ family 2 is scoped and the vocabulary's general parts are identified. Fail ⇒ **narrow the IR; do not add a family** |

**Phase V4 exit gate.** Parse rate ≥75% on one family; faithfulness measured with an interval; hash
stability published; `ρ` published; `V4-T58` decided in writing.

---

## 4. Phases V5–V8 — epic level

*Not decomposed into tasks. See §2.4 for why, and for the rule that decomposes them.*

### PHASE V5 — Evidence Ledger and the CERTIFIED tier (shadow only)

*Decomposes when `V2-T32` (`μ`) and `V2-T33` (checker FNR) land.*

| Epic | Title | Cx | Depends |
|---|---|---|---|
| `V5-E1` | `verification_ledger` — append-only e-process with `conditioning_set`, `block_id`, `merge_mode`, `merge_weights_version` | L | V4 |
| `V5-E2` | Generic bounded-mean betting test over the assorter reduction | L | `V5-E1`, `V4-T50` |
| `V5-E3` | `REFUTED` short-circuit | S | `V5-E1` |
| `V5-E4` | `α_ledger` derived from `r`, measured `μ`, and coverage — per segment, versioned | M | `V2-T32` |
| `V5-E5` | Risk Model v1 + the calibrated Bayes-factor bridge | L | `V2-T31` |
| `V5-E6` | Truth Engine → decision log only; full §9.4 output alphabet computed, nothing student-visible | L | `V5-E2`, `V5-E4` |
| `V5-E7` | Head-to-head: ledger vs `verification_quality_score` on the gold set | M | `V5-E6` |

> `V5-E7` is how `verification_quality_score` gets retired — **by evidence, not by fiat.** It is
> live on `ai-monitor.html`, so it keeps being computed and written until this comparison says the
> ledger is better.

### PHASE V6 — Answer Bank and cache

*Decomposes when `V4-T48` (hash stability) lands.*

| Epic | Title | Cx | Depends |
|---|---|---|---|
| `V6-E1` | Exact-hash tier | M | `V4-T47` |
| `V6-E2` | Template tier — same structure, new numbers, re-run the deterministic evaluator only | L | `V6-E1` |
| `V6-E3` | Near-duplicate tier with **mandatory** deterministic confirmation before serving | L | `V6-E2` |
| `V6-E4` | Offline Bank pipeline on the Batch API | XL → split | `V6-E1`, `V2-T25` |
| `V6-E5` | Invalidation on `label_version` and `tcb_revision` | M | `V6-E1` |

> `V6-E5` is not housekeeping. A cached answer produced under a TCB revision that was later found
> wrong is a *systematic* error that repeats, which is worse than a fresh wrong answer. Invalidation
> is designed in, not added.

### PHASE V7 — First student-visible change: the verified badge

*Decomposes when `V4-T57` (faithfulness) has an interval and V5 has run in shadow.*

| Epic | Title | Cx | Depends |
|---|---|---|---|
| `V7-E1` | Knowledge graph + `knowledge-base.md` entries — **first, per `CLAUDE.md`; nothing skips the pipeline** | M | `V5-E6` |
| `V7-E2` | Stratified public claim on `trust.html` / `evidence.html`, with intervals | M | `V7-E1` |
| `V7-E3` | Badge in `chat.html`, with the §6.4 semantic gap disclosed | M | `V7-E2` |
| `V7-E4` | CI: coverage and risk may not be released separately | S | `V7-E3` |

> `V7-E4` enforces the pairing rule mechanically. v2 §18: every mechanism that grows CERTIFIED
> coverage enlarges the surface on which faithfulness can fail, and none reduces it — so a roadmap
> organised around coverage can be executed perfectly while total published error rises. A CI gate
> that refuses a coverage number without its risk number is that rule, made unavoidable.

### PHASE V8 — Audit Engine

*Decomposes when `r` is set (which follows `V2-T32`).*

| Epic | Title | Cx | Depends |
|---|---|---|---|
| `V8-E1` | ALPHA-style sequential test over the forced-exploration stream | L | `V0-T13`, `V5-E1` |
| `V8-E2` | Comparison assorter against the logged machine verdict | M | `V8-E1`, `V0-T08` |
| `V8-E3` | Per-lesson margin `x = r − ê` on the AI Monitor | M | `V8-E2` |
| `V8-E4` | **Escalation branch — implemented and exercised in anger** | L | `V8-E3` |

> `V8-E4` is the deliverable, not `V8-E1`. v2 Law 4(d): an audit without a definitive fallback is
> decoration. The exit criterion is a deliberately chosen lesson routed to full human verification
> and conservative-policy traffic, and the drill recorded.

---

## 5. Research track

Funded separately from the platform budget. **None is a dependency of any phase.** Each carries a
kill criterion, and a research task is done when the bet resolves — including when it resolves
against.

| ID | Title | Gate to start | Kill criterion |
|---|---|---|---|
| `R1` | Conditional filtration (v2 §13) | `V4-T54` shows high `ρ` on Si Math traffic | Not applicable — if `ρ` is low, R1 is simply not started |
| `R2` | Ball arithmetic + certification service tier | A checker genuinely needs refutation-by-enclosure | Never started if exact rationals and real-algebraic arithmetic cover the corpus |
| `R3` | Legibility Contract — decoupled translator + faithfulness verifier | V5 shipped; certificates exist to translate from | — |
| `R4` | BMDP decision policy, offline λ | Propensity log has usable OPE diagnostics (ESS, inner-CI) | — |
| `R5` | Diagram understanding | Watch item — no start gate | None. Interim policy stands until published parse rates clear ~95% |
| `R6` | Multidimensional IRT | Taxonomy exceeds ~150 lessons, **or** hierarchical Beta-Binomial is measurably mis-ranking solvers | If neither trigger fires, IRT is never built |

> **`R6`'s trigger is the amendment in `§7.5` of the migration strategy, made operational.** v2
> builds the IRT case on a 500-lesson platform. Si Math has 33 subtopics, so hierarchical
> Beta-Binomial — v2's own Horizon-1 fallback — may be sufficient permanently. This is how that
> decision gets revisited automatically rather than by memory.

---

## 6. Risk register → task traceability

Every risk in v2 §25 maps to the task that mitigates it. A risk with no task is an unowned risk.

| v2 risk | Likelihood / consequence | Mitigating tasks |
|---|---|---|
| **IR faithfulness gap** | High / worst possible — wrong answers inside the marketed tier | `V4-T55`, `V4-T56`, `V4-T57`, `V4-T58`, `V7-E4` |
| Cross-solver `ρ` high on real traffic | Med-high / Hypothesis Plane over-built | `V4-T54` (and `R1` conditional on it) |
| CERTIFIED coverage plateaus below 50% | Medium / claim stays weak | `V3-E3`, `V4-T51`, `V6-E2` |
| **Ground-truth channel error swamps the target** | High initially / risk becomes unmeasurable | **`V2-T33`** |
| Distribution shift invalidates the calibrator | High / silent risk-target violation | `V5-E5`, recalibration trigger (V5 decomposition), `V8-E1` |
| Traffic-mix shift makes the policy infeasible | Medium / constraint violated silently | `R4`, `V5-E4` per-segment |
| **Forced exploration removed to save cost** | Medium — *the one to watch* | **`V0-T13`, `V0-T14`, `V0-T15`** |
| Legal exposure on provenance or retention | Medium / existential | `V0-T06`, `V0-T07`, `V2-T23`, `V2-T24` |
| RLA cross-domain port doesn't hold | Low-med / audit guarantee weaker than claimed | `V8-E1` (fallback recorded), `V7-E2` (claim states its method) |
| Checker-gaming once training closes on the IR | Medium, only if `H3.5` proceeds | `V4-T52` — precondition, not mitigation |

Two additional risks found in the repository and absent from v2's register:

| Repository risk | Mitigating tasks |
|---|---|
| `ai-monitor.html` is an undeclared consumer of `verification_meta`'s internal shape | Standing rule §1.3(1); `V0-T03`; `V5-E7` |
| `taxonomy.js` is frozen *and* auto-generated, transitively freezing `taxonomy.core.js` | `V4-T49` scoped to existing subtopic ids; unfreeze is a separate explicit decision |

---

## 7. Backlog summary

| Phase | Epics | Tasks | ENG | MEASURE | OPS | Decomposed |
|---|---|---|---|---|---|---|
| V0 | 4 | 15 | 14 | 1 | — | ✅ |
| V1 | 3 | 7 | 5 | 1 | 1 (deploy) | ✅ |
| V2 | 5 | 13 | 5 | 4 | 4 | ✅ |
| V3 | 4 | 10 | 9 | 1 | — | ✅ |
| V4 | 5 | 13 | 8 | 4 | 1 | ✅ |
| V5–V8 | 20 | — | — | — | — | ⏳ epic level |
| Research | 6 | — | — | — | — | Separate budget |
| **Total** | **47** | **58** | **41** | **11** | **6** | |

Counts are generated from `truth-system-v2-backlog.csv`, which is the source of truth for this
table. Complexity distribution across the 58 tasks: `XS` 10 · `S` 24 · `M` 18 · `L` 5 · `XL` 1.
The single `XL` is `V2-T31` and it carries its split rule inline.

**Eleven of fifty-eight tasks are `MEASURE`.** That ratio is the point. A programme whose product is
trustworthiness and whose backlog contains no measurement tasks is a programme that will ship a
claim it cannot support.

---

## 8. CSV import mapping

`truth-system-v2-backlog.csv` — one row per epic and per task.

| CSV column | GitHub Projects | Linear | Jira |
|---|---|---|---|
| `id` | Title prefix | Title prefix | Custom field / Title prefix |
| `title` | Title | Title | Summary |
| `level` (`epic` / `task`) | `epic` label | Issue vs sub-issue | Issue Type |
| `phase` | `Phase` single-select | Project | Fix Version |
| `epic_id` | Parent task-list ref | Parent issue | Epic Link |
| `work_type` | `type:*` label | Label | Component |
| `complexity` | `cx:*` label | Estimate | Story Points |
| `deploy_surface` | `deploy:*` label | Label | Label |
| `depends_on` | Task-list reference | Blocked-by | "is blocked by" |
| `gate` | `gate` label | Label | Label |
| `definition_of_done` | Body | Description | Description |

**Suggested label taxonomy:** `phase:V0…V8` · `type:eng|measure|ops|research` ·
`cx:xs|s|m|l|xl` · `deploy:none|migration|edge-fn|frontend|ci|docs` · `gate` · `critical-path`

Complexity → points, if points are used: `XS=1 · S=2 · M=5 · L=13 · XL=split`.

---

## 9. What this backlog does not do

- **It does not authorise anything.** Every migration is still PREPARED → reviewed → approved →
  APPLIED individually, per `CLAUDE.md §3`.
- **It does not pick the lesson family.** `V2-T30` does.
- **It does not set `r`.** The product does, and `α_ledger` is then derived from measured `μ` and
  coverage — never the reverse.
- **It does not decompose V5–V8.** It states the condition under which they decompose, which is a
  more useful thing to have written down than a task tree built on numbers that do not exist.
