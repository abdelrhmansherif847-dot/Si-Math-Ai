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

## Executable parts

- [`scripts/est-blueprint.mjs`](../../../scripts/est-blueprint.mjs) — the blueprint as data.
- [`scripts/validate-est-blueprint.mjs`](../../../scripts/validate-est-blueprint.mjs) — the gate. Auto-discovered by `tests/run-all.mjs`; CI fails if the blueprint stops satisfying its own rules. Mutation-tested before commit.

## Two rules that govern the whole set

**No exam content in this repository.** It is public. The corpus lives outside
it; archetypes are described structurally and every illustration is our own.

**Evidence tiers on every finding.** T1 publisher-authoritative, T2 strongly
supported across all four forms, T3 inferred, T4 low confidence. **A pattern
becomes a hard generation rule only at T1 or T2.** Artifact 1 §0.

## Known consequence for shipped work

`ESTM1-2026-A` fails two Tier 1 gates — 8 grid-ins where the exam is 100%
multiple choice, and roughly 30% geometry against a published 8–13%. It is DRAFT
and admin-only, so no student has seen it. The rebuild is the next piece of work
and is deliberately not begun in these documents.
