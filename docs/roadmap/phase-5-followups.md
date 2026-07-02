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

## FU-2 — Canonical report aggregation
- **File:** `regenerate-reports.js`.
- **Current:** the canonical write path is already correct (stamps
  `topic_id/subtopic_id` via `TaxonomyWrite.canonical`, L378–401), but
  aggregation, ranking, and stale-row detection key off **raw** `topic|subtopic`
  strings (L97, L179–180, L314, L324, L339–340, L362, L373, L413).
- **Why deferred:** grouping by `topic_id|subtopic_id` would merge legacy-variant
  names into one report row — changing report contents, `total_signals`,
  `priority_rank` ordering, and stale-row cleanup. That is an analytics/report
  **behavior change**, not taxonomy consumption, and is outside Phase 5 scope.
- **Prerequisites:** historical `*_id` backfills complete; legacy `weakness_reports`
  rows migrated. Only then redesign aggregation / ranking / stale-row detection to
  key on canonical IDs.
