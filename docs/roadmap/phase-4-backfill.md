# Phase 4 — Legacy Taxonomy Backfill (Approved Execution Plan)

Status: **approved 2026-06-29**. Phase 3 (canonical taxonomy, ID-backed writes,
reject-on-unmapped) is live in production. Phase 4 canonicalizes the **existing
legacy rows** — both canonical display **names** and stable **IDs** — so legacy
data matches what Phase 3 produces for new data, and re-keys mastery to the
`(topic_id, subtopic_id, problem_type)` triple with zero progress loss.

> Execution discipline: every write step is an individually-approved, reversible
> migration with backups, batching, and parity checks — the same gates used in
> Phase 3. Nothing runs without explicit per-step approval.

## Objectives & success criteria
- 0 academic non-canonical names in student-facing tables (`weakness_reports`,
  `mastery_records`, `focus_tasks`, active `weakness_signals`).
- 100% of CONFIDENT rows carry `topic_id` (+ `subtopic_id` where it resolves).
- `mastery_records` re-keyed to `(user_id, topic_id, subtopic_id, problem_type)`,
  per-user aggregate parity preserved (no progress loss).
- Active `focus_plans` keep working; XP / streak / achievements unchanged.
- Phase-3 regressions ① (Focus Coverage Map) and ⑨ (focus legacy writes) eliminated.

## Scope
- **Write tables:** `weakness_signals`, `weakness_reports` (via regenerate),
  `mastery_records`, `focus_tasks`, `question_records`.
- **Code:** `taxonomy.core.js` aliases (Step 0); `scripts/phase4-wordproblems-override.js`;
  MIG-B generator + generated SQL migrations; `mastery-updater.js` re-key; bulk
  regenerate driver.
- **Out of scope (Phase 5):** consumer read-side name→ID migration, dead-code cleanup.

## MIG-A classification (read-only, current production)
| Bucket | qr | ws | wr | mr | ft | total |
|---|--:|--:|--:|--:|--:|--:|
| CONFIDENT (topic resolves → MIG-B updates) | 314 | 357 | 101 | 140 | 212 | **1,124** |
| NON_ACADEMIC (left as-is) | 441 | 47 | 37 | 18 | 14 | **557** |
| NEEDS_REVIEW ("Word Problems") | 16 | 16 | 9 | 10 | 0 | **51** |

## Curation decisions (approved)
1. **Word Problems** → deterministic override (`scripts/phase4-wordproblems-override.js`):
   7 of 8 variants mapped to `(canonical topic, lesson, problem_type='word_problem')`;
   blank-subtopic (4 rows) left NEEDS_REVIEW. No heuristics at migration time.
2. **Aliases** (~28, in `taxonomy.core.js`) map educationally-equivalent legacy
   subtopics to existing lessons (~340 rows regain `subtopic_id`). **Age Problems
   → `ALG_006`, `problem_type='concept'`** (historical text inconclusive — no
   `word_problem` assumption).
3. **Topic-only** (~65 rows): `topic_id` only, `subtopic_id=NULL` (cross-topic
   mismatch / too generic — avoid content re-classification).
4. **`weakness_reports`:** regenerate from canonicalized `weakness_signals`
   (derived table — auto-merges, stays consistent, no bespoke dedup).

## Execution sequence (gated)
- **Step 0** — encode aliases + Word-Problems override + tests (isolated PR);
  re-sync copies; deploy **edge v84 via DEPLOY.md §4 CLI** + client assets.
- **Step 0.5 — production verification gate** (before any backfill): aliases
  resolve on fresh requests; canonical response fields correct; no rise in
  `unmapped_detections`; new `question_records` / `weakness_signals` /
  `weakness_reports` written correctly; short soak under observation.
- **Step 1** — MIG-A re-run (read-only) post-alias; review refreshed buckets.
- **Step 2** — backups (`taxbk_*` per table; full `mastery_records` snapshot).
- **Step 3** — MIG-B generated SQL, batched (≤500), idempotent, per table:
  `weakness_signals → focus_tasks → mastery_records → question_records`. Per-table
  parity + active-feature smoke. (`weakness_reports` not backfilled here.)
- **Step 4** — `problem_type` normalize (`NULL → 'concept'`) on `mastery_records`.
- **Step 5** — mastery MERGE on the canonical key (sum counts, max scores),
  **parity-gated** (per-user Σ unchanged; row delta = logged merges).
- **Step 6** — M4b: `CREATE UNIQUE INDEX CONCURRENTLY … (user_id, topic_id,
  subtopic_id, problem_type) NULLS NOT DISTINCT`; drop old `(topic, subtopic)` index.
- **Step 7** — `mastery-updater.js` re-key to the triple (activates concept vs
  word-problem mastery); one-time **bulk regenerate** of `weakness_reports`
  (batched, off-peak) — also fixes ①/⑨ for legacy users.
- **Step 8** — final verification: MIG-A = 0 academic non-canonical; ①/⑨ verified;
  XP/streak/achievements snapshots unchanged; per-user mastery parity.

## Rollback
- MIG-B: `UPDATE … FROM taxbk_<table>`. problem_type/merge: restore full
  `mastery_records` backup (only step that deletes rows). M4b: drop new index,
  recreate old. Code: `git revert` + redeploy prior edge/client.

## Dependency graph
```
Step 0 (aliases + edge v84 + client)
  └─► Step 0.5 PRODUCTION VERIFY GATE
        └─► Step 1 MIG-A re-run
              └─► Step 2 Backups
                    └─► Step 3 MIG-B (signals→focus_tasks→mastery→question_records)
                          └─► Step 4 problem_type normalize
                                └─► Step 5 mastery MERGE (parity gate)
                                      └─► Step 6 M4b (CONCURRENTLY)
                                            └─► Step 7 mastery re-key + bulk regenerate
                                                  └─► Step 8 final verification
```
Hard orderings: 0.5 before any write · backups before any UPDATE ·
problem_type-normalize → merge → M4b · mastery re-key only after M4b.
