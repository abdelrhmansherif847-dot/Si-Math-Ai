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

## FU-3 — Canonical weakness aggregation
- **File:** `weakness.html`.
- **Current:** client-side `weakness_score`, `priority_rank`, `biggest_weakness`,
  evidence buckets, and `renderBars` grouping all key off raw `topic|subtopic`
  (L1145, L1188–1192, L1303–1305, L1361, L1597–1600). `isAcademicRow` (L1094)
  already prefers `Taxonomy.isAcademicTopic`; `NON_ACADEMIC_RE` is a fallback.
- **Why deferred:** grouping by IDs merges legacy-variant rows → changes bars,
  weakness score, ranking, and the chosen "biggest weakness" (weakness/analytics
  behavior change). Depends on the historical `*_id` backfill.

## FU-4 — Dashboard canonical aggregation
- **File:** `dashboard.html` (corrected from M0 "Group D").
- **Current:** `topicMap` aggregation, weakness/`topTopic` selection, and
  related-subtopic filtering key off raw topic names (L1659, L1699–1723, L1815,
  L1957–1962); local `isAcademicDash` guard; `chat.html?topic=<raw>` link.
- **Why deferred:** same class as FU-3 — aggregation/ranking behavior change,
  backfill-dependent. Display-label canonicalization is entangled with grouping,
  so defer as a unit.

## FU-5 — History taxonomy cleanup
- **File:** `history.html`.
- **Current:** raw-name display (L461, L470) and a local `NON_ACAD` regex guard
  (L382) that does not delegate to `Taxonomy.isAcademicTopic`.
- **Why deferred:** bundle the display migration with the guard consolidation
  (FU-7); keep M2/M3 scope clean.

## FU-6 — Admin analytics canonicalization
- **File:** `admin.html`.
- **Current:** admin question-distribution counts keyed by raw topic/subtopic
  (L1379–1380).
- **Why deferred:** admin-internal analytics aggregation by raw names; low
  priority; canonical grouping depends on the backfill.

## FU-7 — Duplicated academic-guard consolidation
- **Files:** `progress.html` (`isAcademicProg`/`NON_ACAD_PROG`), `weakness.html`
  (`isAcademicRow`/`NON_ACADEMIC_RE`), `dashboard.html` (`isAcademicDash`),
  `history.html` (`NON_ACAD`).
- **Issue:** ≥4 local reimplementations of the academic-topic filter, divergent
  from canonical `Taxonomy.isAcademicTopic` / `SYSTEM_TOPICS`.
- **Why deferred:** consolidating changes filtering behavior (non-curriculum
  topics excluded). Umbrella item — **subsumes FU-1** (the progress.html instance);
  evaluate all guards together post-unification.
