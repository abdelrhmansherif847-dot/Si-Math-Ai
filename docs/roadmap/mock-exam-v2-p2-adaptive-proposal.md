# P2 Adaptive — where the decision lives, and what it can decide with

**Status:** ✅ ACCEPTED and IMPLEMENTED as Option C (`b1bb7d5`). P2 is closed.
**Date:** 2026-08-23 · **Scope:** `SAT_FULL` only.

---

## 1. The blocking finding: there is no Module 1 performance to route on

Measured, not assumed. At the module boundary `finishCurrentModule()` can see
exactly these fields:

```
s.view  s.modulePlan  s.moduleOrdinal  s.moduleStartedAt
s.timerRunning  s.pausedAt  s.timerInterval  s.endedAt
```

`s.score`, `s.correct`, `s.wrong` and `s.omitted` are still `''` — their initial
values. They are populated **only** by `syncResults()`, called from two places
(`mock-exam.html:1217` and `:1226`), both inside `afterResults()`, which runs in
the **RESULTS view — after the entire exam has ended.** `s.mistakeRows` is still
`[]` and is typed by hand later still.

There is no per-question capture anywhere in the page, because the Mock Exam
delivers no questions. The Question Engine is Phase 6 and is unbuilt.

**So at the exact moment the routing decision must be made, the platform knows
how much time the student used and nothing else.** Time used is not performance:
a student who finishes in 20 minutes may have rushed and missed half of them.

Routing on time would be inventing a signal. Routing on nothing would be a coin
flip wearing a College Board badge.

---

## 2. What the real DSAT actually does — and the part nobody publishes

Researched rather than recalled:

* It is **multistage adaptive testing (MST)** — adaptive at the **module** level,
  never question by question.
* **Module 1 is mixed difficulty and identical for every student.** Only Module 2
  adapts.
* There are **two Module 2 forms.** Strong Module 1 performance routes *up*;
  weak performance routes *down*.
* The routing has a real scoring consequence: the lower path is widely reported
  to cap the section around 600.

**And the part that matters most for us:**

> **College Board does not publish the routing threshold.** Third-party estimates
> cluster around "roughly 70% of Module 1 correct routes up", but that is an
> estimate reverse-engineered by tutors, not a published rule, and it is not
> confirmed anywhere official. The score cap figure is unpublished too.

Any number we implement is therefore **Si Math AI's estimate, not the SAT's.**
It must be configurable and labelled as an estimate wherever a student can see
its effect. Hardcoding 70% as though it were the rule is exactly the guessing
this review asked to avoid.

---

## 3. Where the adaptive decision should live

Three layers, deliberately separated so nothing can become adaptive by accident.

### Layer 1 — the state machine stays completely ignorant

`finishCurrentModule()` keeps asking one question: *is this the last module?* It
must never learn what "adaptive" means. Every invariant P2 just tested — endedAt
only at the end, state not cleared at a boundary, ownership held across it — is
about module *transitions in general* and is unaffected by which module 2 runs.

**No change to this layer at all.**

### Layer 2 — the plan gains variants for one exam

`SAT_FULL`'s module 2 becomes a slot with two forms rather than one fixed
descriptor:

```js
{ ordinal: 2, label: 'Module 2', questions: 22, durationMinutes: 35,
  variants: [
    { id: 'standard', label: 'Module 2 — Standard' },
    { id: 'advanced', label: 'Module 2 — Advanced' },
  ] }
```

**Both variants are 22 questions and 35 minutes**, because on test day they are.
That has a valuable consequence: **routing changes no timing whatsoever**, so
none of P2's tested behaviour moves. The adaptive change is a label and a
recorded path, not a new clock.

Every other exam keeps modules with no `variants` key at all.

### Layer 3 — the selector: one gated pure function

New, in `exam-registry.js` beside the other pure decisions:

```js
selectNextModule(examCode, plan, currentOrdinal, performance) → { module, variantId, reason }
```

Its **first statement is the gate**, and it is a whitelist:

```js
if (examCode !== 'SAT_FULL') return { module: nextModule(plan, currentOrdinal),
                                      variantId: null, reason: 'not_adaptive' };
```

A whitelist, not a blacklist, is the whole point of requirement 5: a new exam
added to the registry in 2027 is non-adaptive by default and can only become
adaptive by someone editing this line on purpose.

**Called from exactly one place:** `afterTransition()`'s "Begin Module 2" click
handler — the single point that already decides which module starts. Not from
`finishCurrentModule()`, which stays generic.

`SAT_MODULE_1` and `SAT_MODULE_2` are separate exam codes, so the gate excludes
them automatically: they stay standalone non-adaptive practice, as required.

---

## 4. How Module 1 performance should be represented

**Not a bare number.** A bare `correct` count makes "we don't know" indistinguishable
from "they got zero", and a null coerced to 0 would route every student down —
silently, and in the punishing direction.

```js
{
  source:  'unavailable' | 'self_reported' | 'measured',
  correct: number | null,
  total:   number,
}
```

`source` is the load-bearing field. It makes absence a **first-class value the
selector must handle explicitly**, and it is what lets Phase 6 slot in real data
later without changing the selector's shape — `source: 'measured'` simply starts
appearing.

Selector behaviour per source:

| `source` | Route | Why |
|---|---|---|
| `unavailable` | **standard**, `reason: 'no_performance_source'` | Never route a student down on no evidence |
| `self_reported` | threshold applied, `reason: 'self_reported_above/below'` | Student's own count |
| `measured` | threshold applied, `reason: 'measured_above/below'` | Phase 6 |

**Defaulting to the standard path when we don't know is deliberate.** The
asymmetry matters: wrongly routing a strong student down would cap a practice
score and teach them something false about their level, while wrongly routing a
weaker student up costs them only a harder practice module. Unknown must fail
toward the neutral path, never the punishing one.

---

## 5. So what can actually ship, and when

Three honest options. **B is the only one that makes routing genuinely measured.**

**A — Ask the student at the transition.** One field: *"How many of the 22 did you
answer correctly?"* Consistent with the platform's self-report DNA — the whole
Mock Exam already works this way.
*Against it, and I think decisively:* a student working from a paper test usually
has no answer key open mid-exam, and stopping to grade 22 questions at the
boundary destroys the timing realism this entire phase exists to build. It also
makes the boundary screen an assessment, which decision 4 explicitly ruled out.

**B — Wait for the Question Engine (Phase 6).** Then the platform knows every
answer the instant the module ends, routing is measured, and the transition stays
a pure boundary. This is the real answer.

**C — Build the mechanism now, gated, inert.** Variants in the plan, the gated
selector, `source: 'unavailable'` → standard path. Nothing student-visible
changes today, and Phase 6 supplies `source: 'measured'` with **no rewrite** —
the same "build the socket, not the plug" shape already approved for the Desmos
calculator, and for the same reason.

### Recommendation: **C now, B when Phase 6 lands. A only if you want it live sooner and accept the trade.**

C is small, fully testable, and cannot mislead a student because it changes
nothing they see. It also forces the threshold to exist as configuration from day
one, so when real data arrives the argument is about the number, not the
architecture.

---

## 6. What this must not touch

* **The Weakness Analyzer** — untouched. No signal, no mistake, no mastery write.
* **The save pipeline** — untouched. `exam_type` stays `SAT_FULL`; a variant is
  **not** a different exam and must not become one.
* Recording *which* path a student took is genuinely useful data, but there is
  nowhere to put it without a schema change. **Not proposed here** — it would need
  its own migration and its own approval.
* **No migration. No other phase.**

---

## 7. Decisions needed before implementation

1. **A, B, or C?** (recommendation: C)
2. **If C or A: what threshold, and is it configurable?** Recommend a registry
   field defaulting to ~70% correct, documented as a Si Math AI estimate, since
   College Board publishes no figure.
3. **Two variants or three?** The evidence says two operational Module 2 forms.
   Recommend two.
4. **Should the transition screen say which path was chosen?** Recommend **no**
   for now — naming it makes the boundary evaluative, which decision 4 ruled out,
   and on an estimated threshold it would be asserting more confidence than we have.

---

# Closure — accepted 2026-08-23

Option C was approved and implemented. The agreed description, to be used
verbatim wherever this is written up:

> **DSAT is adaptive-ready, not yet adaptively routed.**
> The architecture supports Module 2 variants exclusively for `SAT_FULL`, but no
> performance-based routing occurs until Si Math has a legitimate measured
> Module 1 performance signal and an explicitly approved routing policy.

## Why the wording matters more than it looks

In six months the `variants` array will still be sitting in `exam-registry.js`,
and its presence will read as evidence that the College Board algorithm was
implemented. It was not. Nothing routes anyone anywhere, and the words above are
the only thing standing between that array and a false assumption. The same
paragraph is reproduced in the source file itself, because a reader who is about
to edit the selector lands there, not here.

## The four gates that must be passed before adaptive routing goes live

**A measured signal arriving with the Question Spine is a precondition, not a
decision.** `source: 'measured'` becoming available does not switch this on.
Each of these is a separate call, and none is answered by having data:

1. **What exactly is the performance metric?** A raw correct count, or something
   weighted by item difficulty? Module 1 is mixed-difficulty by design, so a raw
   count treats a hard item and an easy one as identical evidence.
2. **How is Module 1 calibrated?** Routing on an uncalibrated form measures our
   question-writing rather than the student.
3. **Is there a threshold or routing model we can defend?** College Board
   publishes none. Ours would be an approximation and has to be argued on its own
   merits, never on borrowed authority.
4. **How do we prevent it being presented as the College Board algorithm?** If it
   is our approximation, students must not be told otherwise — including by
   implication, which is why no path is named on screen today.

Until all four are settled, the default path is the correct behaviour, not a
limitation.

## P2 final scope

| | |
|---|---|
| Module state machine | ✅ complete — module vs exam termination separated |
| DSAT two-module timing | ✅ complete — 22q/35min × 2, no leakage |
| Transition screen | ✅ complete — manual, uncapped, timing only |
| Persistence + legacy blobs | ✅ complete |
| `duration_minutes` correction | ✅ complete — SAT_FULL saves 70 |
| Adaptive architecture | ✅ complete — gated, inert, no threshold |
| Adaptive **routing** | ⛔ **not implemented, by decision** |

**P2 is closed. No further modification without a new authorisation.**
