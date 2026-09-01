# EST — Series diversity system

**Artifact 9.** Evidence tiers: [`01-est-exam-dna.md` §0](01-est-exam-dna.md).
Rule strengths: [`scripts/est-blueprint.mjs`](../../../scripts/est-blueprint.mjs) `RULES`.

> Artifacts 1–8 make **one** form authentic. This one makes **twenty-five**
> forms a series rather than a template with the numbers changed.

**Executable:** [`scripts/est-series-ledger.mjs`](../../../scripts/est-series-ledger.mjs)
is a pure auditor — it takes the forms and returns findings, stores nothing and
reaches nothing. [`tests/est-series-ledger.test.mjs`](../../../tests/est-series-ledger.test.mjs)
is what makes it fail out loud: 19 checks, each of which breaks one dimension of
a clean synthetic series and asserts the ledger catches it.

---

## 1. The problem this solves

Across 25 forms, **repeated skills are expected and correct.** A student should
meet the remainder theorem in several forms; that is what makes a series a
preparation programme rather than 25 unrelated papers.

**Repeated questions are not.** Neither are repeated contexts, repeated numeric
structures, repeated stimulus shapes, or a form whose skeleton is the previous
form's. And the damage is not aesthetic: a student who recognises a question
answers it from memory, and the score the platform reports back is then a
measurement of recall rather than of mathematics. **In a product whose entire
value is measurement, a recognised question is a measurement failure.**

The line, stated once:

| Expected across the series | Not acceptable |
|---|---|
| The same **skill** in many forms | The same **question**, however reworded |
| The same **archetype** in a few forms | The same archetype in most forms |
| The same **stimulus kind** in many forms | The same stimulus **shape** dominating |
| The same **domain mix** in every form | The same domain **sequence** |
| The same **difficulty character** | The same demand-band **pattern** |
| The same **distractor classes** | One class carrying a form |

---

## 2. The ten tracked dimensions

| Dimension | What is tracked | Series cap | Adjacent-form cap | Strength |
|---|---|---|---|---|
| **Archetype** | the question's shape | 3 uses | 4 shared | hard |
| **Context** | the scenario | 2 uses | **0 shared** | hard |
| **Numeric structure** | the item's parameter set | **1 use** | 0 shared | hard |
| **Stimulus shape** | kind + sub-kind + series count | ≤ max(25%, 2×uniform) of all stimuli | dominant shape must differ | range |
| **Distractor mechanism** | the nine classes | all 9 in every form; none > 30% | — | range |
| **Family mix** | per-form family counts | — | ≥ 3 families differ | soft |
| **Domain sequence** | the order domains appear in | — | not identical; ≤ 8 consecutive shared | soft |
| **Difficulty pattern** | demand band per position | — | not identical; ≤ 10 consecutive shared | soft |
| **Set pattern** | shared-set sizes and starts | — | not identical | soft |
| **Rotating devices** | `nts`, `objectOptions`, `rareStimulus`, `fourWay` | ≥ 1 form, ≤ 60% of forms | — | rare |

Three notes on why these numbers, rather than tighter ones:

**Archetype at 3 uses in 25 forms is generous by design.** The four reference
forms share only 7 of 191 archetypes *in total*. But 25 forms drawing from 18
families need to revisit archetypes, and forbidding it would push the generator
into inventing shapes the exam does not use — which is a worse failure than mild
repetition. The binding constraint is the **adjacent** cap of 4, because
adjacency is what a student actually experiences.

**Numeric structure is the one hard "never".** Everything else has a budget.

**The stimulus-shape cap scales with what is in play.** Uniform use of *S* shapes
is 1/*S* each; the cap is twice uniform, floored at 25%. With four renderable
kinds that is 50% — deliberately slack, because a four-kind renderer cannot do
better. When [R1](R1-figure-renderer-requirements.md) and
[R2](R2-answer-choice-schema.md) land and the vocabulary widens, the same rule
automatically tightens toward the 25% floor. **The rule does not need rewriting
when the platform improves.**

---

## 3. The numeric signature

The one hard "never" needs a definition that a paraphrase cannot escape.

```
numericSignature(item) =
  item.numbers, sorted            ← if the author declared them (exact)
  otherwise: every number scraped from prompt, options and stimulus, sorted
```

**Authored items must declare `numbers`** — their actual mathematical parameters.
That makes the check exact and order-insensitive, so a system of equations
written in the other order does not slip past.

The scraping fallback is **deliberately over-inclusive**: an incidental digit in
the wording changes the signature, so the fallback can *miss* a near-duplicate.
It never invents one. That asymmetry is the right way round — a false alarm costs
an author five minutes, a missed duplicate costs a student their score's meaning
— but it is the reason the declaration is not optional in practice.

---

## 4. Severity, and what a generator does with it

| Severity | Rules | Meaning |
|---|---|---|
| **error** | archetype, context, numeric structure, stimulus shape, distractor coverage | The series does not ship. Re-author. |
| **warning** | family mix, domain sequence, difficulty pattern, set pattern, rotating devices | The series ships **with the deviation recorded and a reason**. Warnings that accumulate silently are how a template reasserts itself. |

The split follows rule strength (blueprint `RULES`): `hard` and `range` rules
produce errors, `soft`, `tendency` and `rare` produce warnings. **A `soft` rule
is not a suggestion** — it is a rule whose violation needs a sentence, not a
rewrite.

---

## 5. How it is used

**During generation.** The ledger is the generator's memory. Before an
archetype, context or parameter set is used, it is checked against everything
already generated. This is cheaper than generating a form and auditing it
afterwards, and it is the only way the *adjacent-form* rules can be satisfied by
construction rather than by luck.

**After generation.** `auditSeries(forms)` runs over the whole series as a gate.
Its `summary` reports the counts that matter — forms, items, distinct
archetypes, distinct contexts, **distinct numeric signatures** — and distinct
signatures must equal total items. Anything less is a duplicate.

**As the series grows.** The ledger is a pure function of the forms, so adding
form 26 re-audits forms 1–25 for free. There is no stored state to drift.

---

## 6. What it does not do

- **It does not judge authenticity.** A series can pass every diversity rule and
  still consist of 25 forms of unconvincing items. Artifacts 5, 7 and 8 are what
  cover that, and none of them is automatable end to end.
- **It does not check mathematical correctness.** That is artifact 7 G1.
- **It does not know about students.** No item statistics exist (artifact 3
  preamble), so "these two feel similar to a student" is not something it can
  measure. It measures structure, which is a proxy.
- **It cannot see a paraphrase that changes every number.** Two items testing the
  same idea with entirely different parameters are, by every measure here,
  different items — and are also *legitimately* different items. The judgement
  about whether the series teaches the same thing twenty times belongs to a
  human reading it.
