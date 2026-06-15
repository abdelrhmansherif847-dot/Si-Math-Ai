# Architecture Snapshot — Chat → Weakness → Focus

**Status:** FROZEN
**Frozen at:** 2026-06-15
**Final commit on freeze:** `2c49f05` (branch `claude/busy-franklin-MxjoT`)
**Phases delivered:** Phase 2–10 (Analyzer), F1–F5 (Focus Practice + concurrency hardening), Cleanup Pass

Any modification to this subsystem requires: (1) explicit freeze break request, (2) architectural justification, (3) impact analysis, (4) regression plan, (5) re-freeze verification.

---

## 1. Database Tables

| Table | Purpose | Writers | Readers |
|---|---|---|---|
| `weakness_signals` | Raw signal stream from user activity | `chat.html`, `exam-mistakes-logger.js` | `regenerate-reports.js`, `weakness.html`, `focus.html` |
| `weakness_reports` | Derived per-(user, topic, subtopic) state — **SSOT** for mastery, severity, trend, recency, ranking | `regenerate-reports.js` only | `weakness.html`, `focus.html` |
| `analyzer_runs` | Analyzer execution telemetry (timings, dedup, outcome) | `regenerate-reports.js` only | Operational queries |
| `focus_plans` | Active and archived focus plans, one per (user, plan title) | `focus.html` (`upsertPlan`) | `focus.html` |
| `focus_tasks` | Tasks within a plan (9 per wave, max 27 active per plan) | `focus.html` (`upsertPlan`, status handlers) | `focus.html` |

### Key columns

**`weakness_signals`** — `user_id`, `source` (`AI_CHAT`/`MOCK_EXAM`), `topic`, `subtopic`, `signal_type`, `weight`, `created_at`, `source_question_id`, `source_session_id`

**`weakness_reports`** — `user_id`, `topic`, `subtopic`, `mastery_score`, `weakness_score`, `improvement_score`, `total_signals`, `severity_band`, `trend`, `recent7_count`, `recent14_count`, `last_signal_at`, `biggest_weakness`, `priority_rank`, `last_updated`, `created_at`

**`focus_plans`** — `id`, `user_id`, `title`, `status` (`ACTIVE`/`ARCHIVED`), `dominant_signal`, `last_referenced_at`, `generated_date`

**`focus_tasks`** — `id`, `plan_id`, `topic`, `subtopic`, `task_title`, `priority`, `estimated_minutes`, `status` (`NOT_STARTED`/`IN_PROGRESS`/`DONE`), `dominant_signal`, `archived_at`

### Indexes / Constraints (frozen)

- `idx_question_records_user_created (user_id, created_at)` — F4 query scaling
- `idx_focus_plans_user_status_ref (user_id, status, last_referenced_at)` — F4 lifecycle sweep
- `uniq_focus_plans_active_per_user_title (user_id, title) WHERE status='ACTIVE'` — F5 concurrency protection

---

## 2. Data Flow

```
┌──────────────┐    ┌──────────────────────────┐
│  chat.html   │    │ mock-exam.html           │
│              │    │   └─ exam-mistakes-      │
│  Taxonomy →  │    │       logger.js          │
│  normalize → │    │   Taxonomy → normalize   │
│  write       │    │            → write       │
└──────┬───────┘    └──────────┬───────────────┘
       │                       │
       ▼                       ▼
   ┌─────────────────────────────────────┐
   │         weakness_signals             │
   │  6 chat types + 3 exam types        │
   │  pre-normalized topic/subtopic       │
   └──────────────┬──────────────────────┘
                  │
                  ▼
       ┌──────────────────────────┐
       │  regenerate-reports.js    │
       │  (Analyzer — SOLE         │
       │   PRODUCER of derived     │
       │   fields, frozen)         │      ┌────────────────┐
       │                           │─────►│  analyzer_runs  │
       │  • mastery_score          │      │   telemetry     │
       │  • severity_band          │      └────────────────┘
       │  • trend                  │
       │  • recent7/14_count       │
       │  • priority_rank          │
       │  • weakness_score         │
       │  • improvement_score      │
       └──────────────┬───────────┘
                      ▼
           ┌────────────────────────┐
           │   weakness_reports     │  ← SSOT
           └─────┬──────────────┬───┘
                 │              │
                 ▼              ▼
         ┌──────────────┐  ┌──────────────┐
         │ weakness.html │  │  focus.html   │
         │  (consumer)   │  │  (consumer +  │
         │  spotlight,   │  │   focus_plans/│
         │  evidence,    │  │   focus_tasks)│
         │  deep-link    │  │  dominant     │
         │  → focus.html │  │  signal plan  │
         └──────────────┘  └──────┬───────┘
                                  ▼
                       ┌────────────────────┐
                       │  focus_plans /     │
                       │  focus_tasks       │  (Focus-owned)
                       │  archived_at,      │
                       │  last_referenced_at│
                       │  dominant_signal   │
                       └────────────────────┘
```

---

## 3. Frozen Invariants

### Single producer / pure consumers
- `regenerate-reports.js` is the **sole writer** of `mastery_score`, `severity_band`, `trend`, `recent7_count`, `recent14_count`, `last_signal_at`, `priority_rank`, `weakness_score`, `improvement_score`, `biggest_weakness`, `total_signals`.
- `weakness.html` and `focus.html` are **pure consumers** of `weakness_reports`. They re-derive none of the above.

### Analyzer determinism (Phase 9)
- Frozen `runNow = Date.now()` per run, threaded through every age/decay calculation.
- Ranking tiebreaker: `mastery_score ASC, weakness_score DESC, topic||subtopic ASC` (lexicographic) — bit-identical re-runs on identical inputs.
- In-flight dedup + pending-rerun logic prevents interleaved reads.

### Thresholds (frozen)
- **Severity:** mastery `<30 critical`, `<50 high`, `<70 medium`, `≥70 low`.
- **Trend:** improvement `>+5 improving`, `<−5 declining`, otherwise `stable`; `null` if `total_signals < 5` or no 7–14d window data.
- **Recency:** counts use 7-day and 14-day windows from `runNow`; cover all signal types.

### Taxonomy
- `taxonomy.js` is the single normalization authority.
- All writers (`chat.html`, `exam-mistakes-logger.js`) normalize topic + subtopic before insert.
- All consumers read pre-normalized DB strings; no normalization on read.
- Coverage map (`subtopicsFor`) is exported from `taxonomy.js`.

### Focus Practice (F1–F5)
- **F1:** `reportToProfile` reads analyzer fields directly. No mastery/severity/trend/recency derivation on the SSOT path.
- **F2:** `isAcademicTopic`, `normalizeConcept`, `dedupeConceptList`, `subtopicsFor` live in `taxonomy.js`.
- **F3:** Dominant-signal detection: `total ≥ 5` AND candidate `count ≥ 3` AND candidate `share ≥ 40%` over `{exam_confused, hint_used, explanation_repeated, repeated}`. `dominant_signal` is insert-only on `focus_tasks`; never mutated.
- **F4:**
  - Query scaling: `question_records` filtered by `(user_id, created_at ≥ now−90d)`. No IN-list patterns.
  - Coverage map delegated to `Taxonomy.subtopicsFor`.
  - Lifecycle: inactivity-only archival (`last_referenced_at < now−30d`). NULL rows skipped. Topic shift never archives.
  - 27-task cap: wave-unit archival with `length === WAVE_SIZE` guard. `archived_at` is a timestamp flip, never DELETE. `DONE` stays `DONE`.
- **F5:**
  - Partial unique index `uniq_focus_plans_active_per_user_title` enforces "at most one ACTIVE plan per (user_id, title)".
  - `upsertPlan` handles `23505` by re-fetching and adopting the winning plan.
  - Taxonomy load-order guard: `[SI-DIAG]` console.error + `window.__siTaxonomyMissCount` on fallback.

### Status-machine integrity
- `focus_tasks` UPDATEs (3 inline handlers + `cycleTask` removed in cleanup) write **only** `{status: next}` and a sibling `focus_plans.last_referenced_at` stamp.
- Execution state (`status`) is independent from archival state (`archived_at`).

---

## 4. Accepted Technical Debt

| ID | Description | Severity |
|---|---|---|
| M1 | Legacy `weakness_reports` rows pre-dating Phase 2/3/4 may carry `null` severity/trend/recency until next analyzer regeneration. No backfill approved. | Medium |
| M2 | Legacy `focus_plans.last_referenced_at = NULL` rows opt into the 30-day sweep only on first interaction. Abandoned legacy plans never expire. No backfill approved. | Medium |
| M3 | `weakness_reports.improvement_score` written by analyzer but read by no consumer. Used internally to derive `trend`. Documented; deprecation timeline not scheduled. | Medium |
| L1 | Fallback normalization wrappers in `chat.html` and `exam-mistakes-logger.js` duplicate `Taxonomy` behavior as load-order safety. Now guarded by `[SI-DIAG]` telemetry. | Low |
| L2 | `focus_plans.biggest_weakness_topic` column remains in schema; writes were removed in cleanup. Column kept for forward compatibility. | Low |
| L3 | `last_referenced_at` stamping in inline task handlers is unthrottled — one extra `focus_plans` UPDATE per checkbox click. Small payload, indexed. | Low |
| L4 | `weakness.html` evidence query on `weakness_signals` is unbounded by date. Acceptable at current scale; mirror F4's 90-day filter if growth becomes an issue. | Low |

---

## 5. Operational Monitoring Checklist

### Analyzer health
- [ ] `analyzer_runs.outcome != 'success'` rate — alert on >1% over rolling 24h
- [ ] `analyzer_runs.duration_ms` p95 — alert on >10s
- [ ] `analyzer_runs.pending_rerun_triggered` rate — informational; spikes indicate write storms
- [ ] `analyzer_runs.dedup_collapsed` rate — informational

### Signal integrity
- [ ] `window.__siTaxonomyMissCount` in production session telemetry — alert on **any** non-zero value (indicates load-order regression)
- [ ] `[SI-DIAG]` console errors — surface via frontend error logging if available
- [ ] `weakness_signals` rows with NULL `source_question_id` or `source_session_id` — informational; should stay near zero for new rows

### Focus Practice integrity
- [ ] `focus_plans` rows where `status='ACTIVE'` AND duplicate `(user_id, title)` — must be **zero** (enforced by unique index; alert on insert error rate)
- [ ] `focus_tasks` rows with `archived_at IS NOT NULL` AND `status != 'DONE'` — informational; archived in-progress tasks indicate a race condition
- [ ] `focus_plans` rows with `last_referenced_at < now() - interval '60 days'` AND `status='ACTIVE'` AND `last_referenced_at IS NOT NULL` — should self-archive on next page load; alert if it persists

### Schema drift
- [ ] Migrations folder vs production schema parity — diff weekly
- [ ] Verify `uniq_focus_plans_active_per_user_title` index present
- [ ] Verify `idx_question_records_user_created` index present
- [ ] Verify `idx_focus_plans_user_status_ref` index present

### Pipeline boundary
- [ ] `weakness_reports` columns written but never read — currently only `improvement_score`; any new such column indicates drift
- [ ] No new writer of `weakness_reports`-owned columns appears outside `regenerate-reports.js`
- [ ] No new writer of `weakness_signals` appears outside `chat.html` and `exam-mistakes-logger.js`

---

## 6. Freeze Boundary

**In scope (frozen):** all files listed in the data flow diagram, all migrations through `20260616_focus_plans_unique_active.sql`, all indexes listed in §1, all invariants in §3.

**Out of scope (changeable):** UI styling, copy text in `renderEmpty`, sidebar navigation, unrelated entry pages. Changes to these may not alter signal emission, normalization, analyzer formulas, or Focus Practice behavior.

**Freeze break process:** open a freeze-break ticket citing this document, deliver §2–§5 of a new architectural review, obtain explicit approval before any change to a file or column listed here.
