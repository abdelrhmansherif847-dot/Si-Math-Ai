# Phase 0 Verification — Adaptive Verification Architecture

Status: **Applied** to production (`igvkyxkmjnkzscqgommj`) on 2026-06-17.
Migration file: `supabase/migrations/20260617_question_records_verification_columns.sql`

---

## 1. Exact Migration SQL

```sql
ALTER TABLE public.question_records
  ADD COLUMN IF NOT EXISTS verification_tier        text,
  ADD COLUMN IF NOT EXISTS verification_path        text,
  ADD COLUMN IF NOT EXISTS verification_status      text,
  ADD COLUMN IF NOT EXISTS verification_confidence  numeric(4,3),
  ADD COLUMN IF NOT EXISTS solver_count             smallint,
  ADD COLUMN IF NOT EXISTS solver_agreement         numeric(4,3),
  ADD COLUMN IF NOT EXISTS judge_verdict            text,
  ADD COLUMN IF NOT EXISTS ocr_confidence           numeric(4,3),
  ADD COLUMN IF NOT EXISTS verification_meta        jsonb;
```

All columns are nullable. No defaults. No indexes. No constraints. No RLS changes.

---

## 2. New `question_records` Schema (post-migration)

Pre-existing columns (unchanged): `id`, `session_id`, `user_id`, `question`, `ai_response`, `topic`, `subtopic`, `difficulty`, `concepts`, `rules`, `confidence_before`, `confidence_after`, `resolution`, `weakness_signal`, `help_request`, `explanation_request`, `repeated_question`, `created_at`, `hint`, `image`, `follow_up_type`, `client_request_id`.

New columns appended:

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `verification_tier` | `text` | YES | Difficulty tier assigned by DifficultyDetector: `easy` / `medium` / `hard` / `expert` |
| `verification_path` | `text` | YES | Pipeline path taken: `skipped` / `single_solver` / `consensus` / `judge` / `expert` / `consensus_override` |
| `verification_status` | `text` | YES | Outcome: `verified` / `failed` / `timeout` / `skipped` |
| `verification_confidence` | `numeric(4,3)` | YES | Final confidence score `0.000`–`1.000` |
| `solver_count` | `smallint` | YES | Number of solvers that ran for this question |
| `solver_agreement` | `numeric(4,3)` | YES | Fraction of solvers that agreed `0.000`–`1.000` |
| `judge_verdict` | `text` | YES | Judge outcome: `agree` / `disagree` / `blocked` / `skipped` |
| `ocr_confidence` | `numeric(4,3)` | YES | OCR Validator confidence for image questions `0.000`–`1.000` |
| `verification_meta` | `jsonb` | YES | Full pipeline trace: per-solver answers, timings, errors, retries |

---

## 3. Storage Impact

**Phase 0 (now):** Zero bytes per row. All values are NULL; Postgres stores NULLs in the existing row null-bitmap, which is already allocated for the other nullable columns. No table rewrite. No bloat. `ALTER TABLE … ADD COLUMN` with no default and no NOT NULL is metadata-only and executes in milliseconds.

**Phase 2+ (once `VERIFICATION_ENABLED=true`):** Estimated per-verified-row overhead:

- 4 short text fields (`tier`, `path`, `status`, `judge_verdict`): ~40–60 bytes total
- 3 `numeric(4,3)` fields: ~18 bytes total
- 1 `smallint`: 2 bytes
- 1 `jsonb` trace: ~250–600 bytes typical (compact JSON)
- **Total per verified row: ~300–700 bytes**

At a hypothetical 1 M verified questions: ~300–700 MB added to the table. Acceptable for the value of full pipeline observability.

`verification_meta` is the only field at risk of growth — Phase 2 implementation will cap its serialized size at 4 KB and truncate the trace if it exceeds.

---

## 4. Consumer Dependency Audit

Every code site that reads from `question_records` was inspected. The new columns are referenced by **zero** consumers.

| File | Columns selected from `question_records` | Touches new columns? |
|---|---|---|
| `weakness.html:1269` | `id, question, session_id` | No |
| `chat.html:957` | (insert path — writes columns) | No |
| `chat.html:1100` | (insert path — writes columns) | No |
| `chat.html:1895` | update `confidence_after`, `resolution` | No |
| `chat.html:2182` | `count(*)` only | No |
| `progress.html:424` | `topic` (with `count: exact`) | No |
| `profile.html:262` | `id` | No |
| `assets/streak.js:16` | `created_at` | No |
| `dashboard.html:1576` | `created_at, topic` | No |
| `dashboard.html:1579` | `created_at` | No |
| `focus.html:1239` | (last-90d profile build) — explicit column list | No |
| `history.html:383` | `session_id` | No |
| `admin.html:911` | `id, question, ai_response, image, created_at` | No |

**`select('*')` audit:** `grep` confirms there are zero `select('*')` calls against `question_records` anywhere in the repo. All consumers use explicit column lists, which means the new fields are invisible to every read path.

**Insert path audit:** The only writer is `supabase/functions/ai-tutor/index.ts`. It inserts an explicit column list; the new columns will receive NULL until Phase 2 wires them up. No insert will fail because of the schema change.

**Other systems checked:**

- **Mastery Engine** (`mastery-updater.js`, `chat.html:2104`) — reads/writes `mastery_records`. Does not touch `question_records` columns. ✅
- **Drill Mode** (`chat.html:841` `drillQuestionMatchesActiveTopic`) — operates on in-memory `_respTopic`/`_respSub`. Does not query `question_records`. ✅
- **Weakness Reports** (`weakness.html`, `regenerate-reports.js`) — read from `weakness_reports` and `weakness_signals`. The `question_records` read at `weakness.html:1269` is limited to `id, question, session_id` for evidence display. ✅
- **Focus Plans** (`focus.html`) — reads `topic, subtopic, weakness_signal, confidence_*, resolution`. New columns not referenced. ✅
- **Streak Recompute** (`assets/streak.js`) — selects only `created_at`. ✅
- **History Page** (`history.html`) — selects only `session_id`. ✅
- **Admin Console** (`admin.html`) — explicit small column list. ✅
- **Analytics / RPCs** — `search_zero_knowledge` and the streak RPC do not project `question_records.*`. ✅
- **PostgREST cache** — schema reload is automatic on next request; new columns become queryable but are not queried by any client.

---

## 5. Rollback

- **Soft rollback (no action needed):** Columns remain NULL. Zero behavioral impact. This is the default state until Phase 2 ships.
- **Hard rollback (physical removal):** Single statement:

  ```sql
  ALTER TABLE public.question_records
    DROP COLUMN IF EXISTS verification_tier,
    DROP COLUMN IF EXISTS verification_path,
    DROP COLUMN IF EXISTS verification_status,
    DROP COLUMN IF EXISTS verification_confidence,
    DROP COLUMN IF EXISTS solver_count,
    DROP COLUMN IF EXISTS solver_agreement,
    DROP COLUMN IF EXISTS judge_verdict,
    DROP COLUMN IF EXISTS ocr_confidence,
    DROP COLUMN IF EXISTS verification_meta;
  ```

  Safe because no rows hold non-NULL values for these columns yet.

---

## 6. Verification Result

Schema check on production:

```
verification_tier        text          nullable
verification_path        text          nullable
verification_status      text          nullable
verification_confidence  numeric(4,3)  nullable
solver_count             smallint      nullable
solver_agreement         numeric(4,3)  nullable
judge_verdict            text          nullable
ocr_confidence           numeric(4,3)  nullable
verification_meta        jsonb         nullable
```

All 9 columns present, all nullable, types match the spec. Phase 0 is complete.

**Phase 1 implementation is gated on explicit user approval and will not begin until that approval is given.**
