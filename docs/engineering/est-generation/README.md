# EST I Math — generation specification

Eight artifacts that reverse-engineer EST I Mathematics from a four-form,
200-item corpus of the publisher's own preparation material, so that authentic
forms can be generated and gated.

**Status: specification complete, generation not started.** No form has been
generated from this specification, and none should be until the specification has
been reviewed.

| # | Artifact | What it decides |
|---|---|---|
| 1 | [Exam DNA](01-est-exam-dna.md) | Structure, domains, KAR, difficulty shape, stimulus inventory, answer keys, item independence. Defines the evidence tiers used by all eight. |
| 2 | [Question Archetype Library](02-est-archetype-library.md) | 18 families with quantified frequencies; 191 archetypes; the cross-cutting devices. |
| 3 | [Difficulty Model](03-est-difficulty-model.md) | The seven levers, the demand score, and how demand is placed. |
| 4 | [Distractor Model](04-est-distractor-model.md) | Nine distractor classes, the structural rules for option sets, the authoring procedure. |
| 5 | [Authenticity Model](05-est-authenticity-model.md) | Register, people, contexts, units, layout and chart conventions. |
| 6 | [Generation Blueprint](06-est-generation-blueprint.md) | The executable spec: 50 slots, quotas, device budgets, anti-repetition. |
| 7 | [Question QA Specification](07-est-question-qa-spec.md) | Per-item gates, and the KAR rubric. |
| 8 | [Exam QA Specification](08-est-exam-qa-spec.md) | Form and series gates, and what none of it can check. |
| 9 | [Series Diversity](09-est-series-diversity.md) | Ten tracked dimensions across 25 forms, audited as a pure function. |
| R1 | [Figure renderer requirements](R1-figure-renderer-requirements.md) | The not-to-scale contract. A capability gap, not an exclusion. |
| R2 | [Answer-choice schema](R2-answer-choice-schema.md) | Graphical and object-valued options. A capability gap, not an exclusion. |
| 10 | [ESTM1-2026-A rebuild](10-estm1-2026-a-rebuild.md) | The first form built from this specification, and what building it proved about the specification. |
| 11 | [ESTM1-2026-A internal review](11-estm1-internal-review.md) | The second-reader content review of all 50 items: what was defective, what was left alone, and the three gates it produced. |
| — | [ESTM1-2026-A status](STATUS-ESTM1-2026-A.md) | **DRAFT — INTERNAL REVIEW ONLY.** The restrictions, the KAR position, the difficulty label, and the R1/R2 gaps. Enforced in CI. |

## Executable parts

- [`scripts/est-blueprint.mjs`](../../../scripts/est-blueprint.mjs) — the blueprint as data, including `RULES` (rule strengths), `KAR_CALIBRATION` and `RENDERING_CAPABILITY`.
- [`scripts/validate-est-blueprint.mjs`](../../../scripts/validate-est-blueprint.mjs) — the gate. Auto-discovered by `tests/run-all.mjs`. Mutation-tested.
- [`scripts/est-series-ledger.mjs`](../../../scripts/est-series-ledger.mjs) — the series auditor, a pure function.
- [`tests/est-series-ledger.test.mjs`](../../../tests/est-series-ledger.test.mjs) — 19 checks, each breaking one diversity dimension.
- [`scripts/validate-est-form-status.mjs`](../../../scripts/validate-est-form-status.mjs) — the gate on the status above: the five restrictions, the difficulty label, the KAR flags, and that no scaled-score conversion exists anywhere.
- [`scripts/audit-est-form.mjs`](../../../scripts/audit-est-form.mjs) — the form gates, run against an authored payload held OUTSIDE this repository. Deliberately not named `validate-*`, which `tests/run-all.mjs` runs with no arguments.

## Three rules that govern the whole set

**No exam content in this repository.** It is public. The corpus lives outside
it; archetypes are described structurally and every illustration is our own.

**Evidence tiers on every finding.** T1 publisher-authoritative, T2 strongly
supported across all four forms, T3 inferred, T4 low confidence. **A pattern
becomes a hard generation rule only at T1 or T2.** Artifact 1 §0.

**The published specification outranks our measurement.** Where the two disagree
— as they do on KAR — the specification is the target and the disagreement is
recorded, never resolved by moving the specification to fit us. Artifact 6 §0b.

## Known consequence for shipped work

`ESTM1-2026-A` fails two Tier 1 gates — 8 grid-ins where the exam is 100%
multiple choice, and roughly 30% geometry against a published 8–13%. It is DRAFT
and admin-only, so no student has seen it. The rebuild is the next piece of work
and is deliberately not begun in these documents.
