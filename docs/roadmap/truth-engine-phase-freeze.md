# Truth Engine — Architecture Phase: FROZEN

**Status:** FROZEN · architecture phase closed.
**Frozen at:** 2026-07-03, by user direction.
**Branch:** `claude/si-math-architecture-rfc-mi35ea`
**Authoritative change list:** `truth-engine-resolution-matrix.md`.

The Truth Engine architecture phase is complete and frozen exactly as it stands.
No RFC v2, no ADR-TE records, and no further reviews are to be produced now.
This work reopens **only when TE-1 actually begins.**

---

## Canonical artifact set (frozen, in order)

| # | Artifact | What it is |
|---|---|---|
| 1 | `truth-system-rfc-review.md` | Review of the original 16-phase "Truth System" vision + the two settled decisions (calibration-first; hybrid execution). |
| 2 | `truth-engine-architecture.md` | **RFC v1** — the orchestration-layer design (engine = policy; verifiers = pluggable mechanism). |
| 3 | `truth-engine-adversarial-review.md` | Red-team of RFC v1 across ten axes: verdict "spine holds, RFC as written does not." |
| 4 | `truth-engine-resolution-matrix.md` | **Authoritative** decision record — one recommended resolution per finding + the TE-1 dependency graph. |
| — | this file | The freeze marker + reopen procedure. |

(The vision itself is the originating request that produced artifact 1.)

All artifacts are committed and pushed to the branch above.

---

## What the freeze means

- **Frozen:** all five documents above, as-is. Do not edit them to "improve" the design during the freeze.
- **Authoritative:** the **Resolution Matrix** is the list of required changes RFC v2 will incorporate. Where RFC v1 and the Resolution Matrix disagree, the Resolution Matrix wins.
- **Do NOT implement from RFC v1 directly.** The adversarial review found load-bearing defects in v1 (see blockers B1–B5). Freezing "as it stands" preserves v1 for the record; it does **not** bless v1 as buildable. Implementation is governed by RFC v2, which does not exist yet.

## Explicitly not to be done now
- No RFC v2.
- No new ADR-TE documents.
- No further architecture reviews or refinements.

---

## Reopen procedure (when TE-1 begins)

1. Read the **Resolution Matrix** first — it is the authoritative change list.
2. Produce **RFC v2** as a mechanical encoding of the matrix (seven proposed `ADR-TE-0x` records; a corrected §4 as a priority-order with calibrated terminal decisions; a structured answer contract; an upstream `CanonicalContext`; a standalone Reliability Service; an error-enriched benchmark).
3. Resolve the **TE-1 gate** set before writing engine code: **B1, B2, B3, B4, B5, D5, O1, O3, O5**, plus the *design* of **R1, R2, R3, D2**.
4. Start at the two critical-path roots — **B5** (engine input contract) and **O1** (standalone Reliability Service) — everything else on the gate hangs off them.
5. Everything else defers to its phase (TE-2…TE-7) per the Resolution Matrix dependency graph.

Constraints that remain in force at reopen: `ai-tutor`'s answer path stays untouched; ADR-P5 (ID-first taxonomy) governs all keys; the FROZEN Chat→Weakness→Focus snapshot is respected (any Focus integration = a governed freeze-break); the settled calibration-first + hybrid-execution decisions hold.
