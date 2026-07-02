# Phase 5 — Taxonomy Unification Architecture

Status: **design approved (M1)** — no implementation yet. This document is the
contract every consumer (existing and future) must follow.

## 1. Single Source of Truth
`taxonomy.core.js` is the **only** authoritative source of the taxonomy.
Everything else is **generated from it** and may never be hand-edited or
independently maintained:
- `taxonomy.js` (browser)
- `supabase/functions/_shared/taxonomy.core.js` (Edge)
- `taxonomy_subtopics` registry (DB)
- the curriculum tree (Edge prompt)
- **any future generated asset**

No component may become an independent source of taxonomy data. Drift is
enforced by `scripts/validate-taxonomy.mjs`.

## 2. Canonical IDs — the only permanent identifiers
`topic_id` / `subtopic_id` are the sole permanent identifiers in the platform.
Lesson **names are presentation only**. Names must **never** be used for:
joins · grouping · analytics · reports · business logic · recommendations.
Names exist only for human display, produced solely via `displayName(id)`.

## 3. Allowed shared API (the entire permitted surface)
| Need | API | Notes |
|---|---|---|
| Write (detection → record) | `TaxonomyWrite.build()` → `resolve()` → `{topic_id, subtopic_id, problem_type, taxonomy_version}` | Sole write path. Persist IDs; raw text = provenance only. |
| Display (id → name) | `Taxonomy.displayName(id)` | Only place an ID becomes a name. |
| Enumerate / build UI | `Taxonomy.TOPICS`, `Taxonomy.subtopicIdsForTopic(topicId)`, `Taxonomy.SUBTOPICS` | Dropdowns/datalists/curriculum built from these + `displayName`. |
| Classify / validate | `Taxonomy.resolveTopicId`, `resolveSubtopicId`, `isAcademicTopic`, `normalizeKey` | Raw input → IDs. |
| Unmapped | `log_unmapped_detection` RPC | Log + reject; never invent. |

## 4. Deprecated API — removed in M5
`normalizeTopic`, `normalizeSubtopic`, `subtopicsFor`, `_topicAliases`,
`_subtopicAliases`, and the name→name passthrough fallbacks (`taxonomy.core.js`
§9). No consumer may call these after M2–M4.

## 5. Read contract
- Records are keyed and grouped by `topic_id`/`subtopic_id` — never by text.
- Any lesson shown to a human = `displayName(topic_id | subtopic_id)`.
- All UI lists derive from `TOPICS` + `subtopicIdsForTopic` → `displayName`.

## 6. Write contract
- Every writer calls `TaxonomyWrite` (wraps `resolve()`) and stores the IDs.
- Already true for `taxonomy-write.js`, `mastery-updater.js`, `chat.html`,
  `exam-mistakes-logger.js`, `regenerate-reports.js` — they need only drop
  their remaining **reads** of the legacy API.

## 7. Temporary Migration Compatibility Layer
**Not part of the permanent architecture.** It exists only until all historical
migrations are complete; **its removal is a required Phase completion criterion.**
- **Scope:** display-only bridge for rows whose `*_id` is still NULL (partial +
  legacy-only tables), pending the remaining historical migrations. Never on the
  write path; never for keying/grouping.
- **Shape:** one named, dated helper — `Taxonomy.compat.displayForRecord(rec)` =
  `displayName(rec.subtopic_id) ?? displayName(resolve(rec.topic, rec.subtopic).subtopicId)`.
  Every fallback funnels through this single function.
- **Isolation:** its own file/namespace, feature-flagged (`TAXONOMY_COMPAT_ENABLED`),
  grep-able by name, never inlined.
- **Removal trigger:** a guard test asserting zero NULL `*_id` across all tables →
  delete the helper; call sites collapse to pure `displayName(id)`.

## 8. Consumer Rule (global)
Every consumer must use the shared taxonomy API. No consumer may maintain:
local lesson names · alias dictionaries · curriculum trees · topic mappings.
Everything comes from the shared taxonomy layer.

## 9. Future features must follow this contract
All future platform features consume the shared taxonomy exactly like existing
pages — including **Truth Engine, Root Cause Analyzer, Failure DNA, Learning
Timeline**. No feature may introduce its own names, aliases, or hierarchy.

## 10. End-state architecture (after legacy removed)
```
taxonomy.core.js  ── generates ──▶ taxonomy.js · _shared/taxonomy.core.js
   (single source)                  · taxonomy_subtopics · curriculum tree · future assets
        │                                   (drift-guarded: validate-taxonomy)
        ▼
   ID-first API only:  resolve()→IDs (write) · displayName(id) (read) · TOPICS/subtopicIdsForTopic (UI)
        ▼
   Every record keyed by topic_id/subtopic_id.  No name-based API. No hardcoded
   lessons. No local mappings. Compatibility layer removed.
```

## 11. Phase 5 Success Criteria
Phase 5 is complete only when:
1. Zero legacy taxonomy APIs remain.
2. Zero duplicated lesson mappings remain.
3. Zero local alias dictionaries remain.
4. Zero hardcoded lesson hierarchies remain.
5. Every consumer uses the shared ID-first taxonomy API.
6. The temporary compatibility layer has been removed.
7. `taxonomy.core.js` remains the single source of truth.
