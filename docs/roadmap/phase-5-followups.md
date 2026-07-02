# Phase 5 — Deferred Follow-ups

Items intentionally deferred out of the taxonomy-unification (M2) scope because
they change **application behavior**, not just taxonomy consumption. Evaluate
after Phase 5 unification is complete.

## FU-1 — progress.html local academic guard
- **File:** `progress.html` (~L454–455).
- **Duplication:** local `NON_ACAD_PROG` regex + `isAcademicProg()` reimplements
  the canonical academic-topic filter (`Taxonomy.isAcademicTopic` / `SYSTEM_TOPICS`).
- **Why deferred:** replacing it changes filtering — canonical `isAcademicTopic`
  excludes non-curriculum topics (Calculus, Physics, Number Theory, Finance,
  Interest, generic "Math"/"Arithmetic") that the local regex currently lets
  through, so some Topic Mastery tiles would disappear.
- **Resolution when addressed:** replace with `Taxonomy.isAcademicTopic`; confirm
  the filtering change is acceptable product behavior.
