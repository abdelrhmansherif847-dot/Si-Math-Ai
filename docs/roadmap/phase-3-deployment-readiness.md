# AI Economics · Phase 3 — Deployment Readiness Review

> **The Edge Function is NOT deployed.** `ai-tutor` remains at v89 / platform
> version 126. This document is the pre-flight checklist for deploying v90, and
> nothing in it has been executed beyond the database steps explicitly approved
> on 2026-07-28.

| | |
|---|---|
| **Deploying** | `ai-tutor` v89 → **v90** (AI model-call telemetry) |
| **Current live version** | code **v89**, platform version **126** |
| **Database** | ✅ **Already applied** — `public.ai_model_calls` exists and is verified, with no writer |
| **Validator ceiling** | ✅ Approved and in the repo (210 KB → 240 KB) |
| **Deploy path** | **DEPLOY.md §4 Path B (CLI) only** — unchanged, and mandatory |
| **Window** | Outside exam preparation, to be scheduled |
| **Status** | ✅ Approved 2026-07-28. Execution runbook: **`docs/roadmap/phase-3-deployment-runbook.md`** |

---

## 1. State right now

| Component | State |
|---|---|
| `ai_catalog` (Phase 2) | Applied, verified — 12 services, 1 provider, 9 bindings |
| `public.ai_model_calls` (Phase 3) | **Applied, verified, empty.** 8 structural checks PASS, P3-07 WARN (no rows — expected) |
| `ai-tutor` | **v89 in production.** v90 exists only on the branch |
| Repo gates | 18/18 green · parse OK · validator PASS (227,383 bytes, v90) |

The intermediate state is deliberate and safe: the schema is in place so the
first v90 request has somewhere to write, and until v90 ships the table is inert
— nothing reads it, nothing writes it, and no production code path touches it.

---

## 2. Pre-deployment baseline

**Captured 2026-07-28, before deployment.** Without these numbers, "no increase
in latency" and "no increase in failures" are unfalsifiable claims. They are
recorded here so the post-deploy comparison has something to compare against.

### 2.1 Student-visible latency — the honest position

Source: Supabase edge-function logs, `execution_time_ms` on `POST /ai-tutor`.
There is no historical latency record in the database, so this is the only
source, and it retains **24 hours**.

Successful POSTs in the last 24 h (platform version 126): **10,952 ms · 8,352 ms
· 2,774 ms · 4,723 ms** — four samples.

> ⚠ **Four samples is not a baseline, and this materially shapes the plan.**
> At current traffic a 48-hour post-deploy window will produce a similarly tiny
> sample. A statistical latency comparison is therefore **not possible** and must
> not be claimed. §7.5 replaces it with what is actually decidable.

### 2.2 Tutoring reliability

| Metric | 30 days | 7 days |
|---|---|---|
| Questions | 404 | 29 |
| Questions/day | 13.5 | **4.1** |
| Upstream errors (`oai_http_status` non-null) | 41 (**10.15%**) | **0 (0.00%)** |
| Empty answers | **0 (0.000%)** | **0 (0.000%)** |
| L3 pipeline runs | 334 | 3 |
| Pipeline latency p50 / p95 / max | 6,314 / 12,610 / 37,493 ms | 6,167 / 10,734 / 11,241 ms |

**The 30-day 10.15% error rate is misleading and must not be used as a
threshold.** Errors cluster entirely on burst days — 2026-07-14 (18 errors / 65
questions), 07-09 (10/26), 07-18 (11/130) — and are absent on every low-volume
day since. They are upstream rate-limit/quota behaviour under load, not a
baseline defect rate.

**The two usable reliability baselines are:**

- **Empty answers: 0 of 404 over 30 days.** Clean, stable, and the sharpest
  signal available. Any empty answer after deploy is a red flag.
- **Upstream errors on comparable low-volume days: 0.** Compare like with like.

### 2.3 Traffic reality

Daily questions over the last two weeks: 3, 10, 16, 5, 1, 37, 130, 2, 7, 65, 20,
16, 26, 3 — with **several zero-question days**. One to four active students per
day.

> ⚠ **A 48-hour window may capture as few as 5–10 student questions, and could
> capture zero.** Time-based success criteria alone would let the deployment be
> declared successful on no evidence. §8 makes the criteria volume-gated.

---

## 3. Expected database changes

**None. The database work is already done.** Deploying v90 changes no schema.

What the deployment causes is the first rows to appear in an existing, empty
table:

| Object | Change on deploy |
|---|---|
| `public.ai_model_calls` | Begins receiving rows. No DDL |
| Every other table | **Unchanged.** v90 writes nothing new anywhere else |
| `question_records`, `ai_usage_logs`, `credit_*`, `profiles` | Untouched — same writes as v89 |

Expected first-hour volume at current traffic: **0–30 rows**, depending entirely
on whether a student asks anything.

---

## 4. Expected Edge Function changes

| Property | v89 → v90 |
|---|---|
| Code version header | `v89` → **`v90`** |
| Platform version | 126 → **127** |
| Source size | 205,792 → **227,383 bytes** |
| Bundle | `index.ts` + `_shared/taxonomy.core.js` — **must remain two files** |
| New env var | `AI_MODEL_TELEMETRY_ENABLED` (optional; defaults on) |
| Behaviour change | **None.** No prompt, model, temperature, token limit, routing decision, response field or existing DB write differs |
| New behaviour | One `ai_model_calls` row per upstream call, written off the response path |

New log lines to expect: `model-call-telemetry-error` (a flush attempt failed;
carries an attempt number) and `model-call-telemetry-lost` (both attempts
failed). **Neither should appear at all.** Every existing log line is unchanged.

---

## 5. Exact deployment steps

| # | Step | Command / action | Gate |
|---|---|---|---|
| 1 | Confirm window | Outside exam prep; owner Go | **Go/No-Go 1** |
| 2 | Confirm branch is the reviewed commit | `git log --oneline -1` | — |
| 3 | Run repo gates | `node tests/run-all.mjs` | Must be 18/18 |
| 4 | Run the source validator | `./scripts/validate-ai-tutor-source.sh` | Must PASS, version=v90 |
| 5 | Re-verify the database | `psql -f scripts/verify-ai-telemetry.sql` | Structural PASS, P3-07 WARN |
| 6 | Capture a fresh latency sample | Dashboard → Edge Functions → Logs, note `execution_time_ms` for recent 200s | Recorded, not gating |
| 7 | **Deploy** | `supabase functions deploy ai-tutor --project-ref igvkyxkmjnkzscqgommj` | **CLI only — never the inline MCP tool (CLAUDE.md §1)** |
| 8 | Confirm version | Function header reads `// ai-tutor Edge Function v90`; platform version = 127 | **Go/No-Go 2** |
| 9 | Confirm bundle | File list shows **both** `index.ts` and `_shared/taxonomy.core.js` | **Go/No-Go 2** |
| 10 | Smoke test | `./scripts/smoke-test-ai-tutor.sh` | Must pass |
| 11 | Seeded exercise | §6 — five operator questions covering every path | **Go/No-Go 3** |
| 12 | Full verification | `psql -f scripts/verify-ai-telemetry.sql` | All PASS |
| 13 | Watch logs 15 min | No `model-call-telemetry-*` lines; no new error signatures | **Go/No-Go 4** |
| 14 | Enter 48-hour monitoring | §7 | — |

---

## 6. The seeded exercise (step 11)

Because organic traffic cannot be relied on to exercise every path — the L3
pipeline ran **3 times in 7 days** — the operator drives a minimum sample
immediately after deploy. Five questions as a real signed-in student:

| # | Question type | Exercises | Expected rows |
|---|---|---|---|
| 1 | Plain text maths | `tutor/tutor_main` | 1 (+3 if the pipeline fires) |
| 2 | Single image | `tutor`, `vision/question_detect`, `ocr/extract` | 3+ |
| 3 | Image with unclear digits | `ocr/rerun` | 4+ |
| 4 | Follow-up ("explain again") on Q1 | `reference_resolver/resolve` | 1 |
| 5 | Repeat of Q1 verbatim | idempotency path — **expect 0 new rows** | 0 |

Question 5 is the important negative control: the idempotency-hit path must
produce **no** telemetry, because it makes no model call. Rows appearing there
would mean spend is being invented.

Together these must produce every one of the eight live `service_code`/`stage`
combinations except `difficulty_detector/classify`, which cannot be forced —
see §9.

---

## 7. Post-deployment validation

The eight checks requested, each with its query and its pass condition.

### 7.1 Successful telemetry insertion
```sql
SELECT count(*) AS rows, count(DISTINCT request_id) AS requests,
       min(created_at) AS first_row FROM public.ai_model_calls;
```
**Pass:** rows > 0 within 5 minutes of the seeded exercise. *(Check P3-07)*

### 7.2 No duplicate `call_uid`
```sql
SELECT count(*) FROM (SELECT call_uid FROM public.ai_model_calls
                      GROUP BY call_uid HAVING count(*) > 1) d;
```
**Pass: exactly 0.** The UNIQUE constraint makes a non-zero result impossible;
this proves it empirically and would catch the constraint being dropped.
*(P3-16, P3-17)*

### 7.3 100% service resolution
```sql
SELECT t.service_code, t.model, count(*) AS calls,
       (s.service_code IS NOT NULL) AS in_catalog,
       EXISTS (SELECT 1 FROM ai_catalog.service_bindings b
                WHERE b.service_code = t.service_code AND b.model = t.model
                  AND b.provider_code = t.provider AND b.effective_to IS NULL) AS bound
FROM public.ai_model_calls t
LEFT JOIN ai_catalog.services s ON s.service_code = t.service_code
GROUP BY 1,2,4 ORDER BY 3 DESC;
```
**Pass:** every row `in_catalog = true` AND `bound = true`. *(P3-10, P3-11)*

### 7.4 `started_at` / `created_at` validation
```sql
SELECT count(*) FILTER (WHERE started_at IS NULL)               AS missing,
       count(*) FILTER (WHERE started_at > created_at)          AS impossible,
       round(percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (created_at - started_at)))::numeric, 2) AS median_skew_s,
       round(max(EXTRACT(EPOCH FROM (created_at - started_at)))::numeric, 2)  AS max_skew_s
FROM public.ai_model_calls;
```
**Pass:** `missing = 0`, `impossible = 0`. Skew is informational — expect ~0–1 s
on main-path rows and several seconds on background rows, which is precisely why
F2 exists. *(P3-18, P3-19)*

### 7.5 No increase in student-visible latency

**What is decidable, and what is not.** With four pre-deploy samples and
similar volume expected after, a statistical comparison is impossible. Claiming
one would be false precision. Two things *are* decidable:

1. **Structural.** No telemetry work is awaited on the response path. The
   handler's flush creates a promise, hands it to `waitUntil`, and returns; the
   synchronous cost is an array splice and a query-object construction. This is
   the primary assurance and it is verified by code reading, not by sampling.
2. **Gross regression.** Compare `execution_time_ms` for successful POSTs before
   and after. **Fail if any successful request exceeds 30,000 ms, or if the
   median of the post-deploy sample exceeds ~2× the pre-deploy median (≈6.5 s)**
   — a threshold set to catch a blocking bug, not a statistical drift it cannot
   resolve.

Recorded honestly: latency is validated as *"no gross regression, and none
structurally possible"*, not as *"measured equivalent"*.

### 7.6 No increase in tutoring failures
```sql
SELECT count(*) AS questions,
       count(*) FILTER (WHERE oai_http_status IS NOT NULL) AS upstream_errors,
       count(*) FILTER (WHERE ai_response IS NULL OR length(trim(ai_response))=0) AS empty_answers
FROM question_records WHERE created_at >= '<deploy-time>';
```
**Pass:** `empty_answers = 0` (baseline: 0 of 404 over 30 days) and no HTTP 5xx
from the function in the logs. Upstream errors are compared against
**comparable-volume days**, not the burst-inflated 30-day rate (§2.2).

### 7.7 Telemetry completeness by service
```sql
SELECT service_code, stage, count(*) AS calls,
       count(*) FILTER (WHERE success)                       AS ok,
       count(*) FILTER (WHERE NOT success)                   AS failed,
       count(*) FILTER (WHERE success AND prompt_tokens > 0) AS with_tokens,
       sum(prompt_tokens) AS p_tok, sum(completion_tokens) AS c_tok,
       round(avg(latency_ms)) AS avg_ms
FROM public.ai_model_calls GROUP BY 1,2 ORDER BY 1,2;
```
**Pass:** every successful row carries non-zero tokens *(P3-08 — the single most
important check; a telemetry table recording zeros would reproduce the exact
defect Phase 3 exists to fix)*, and `input_token + cached_input_token =
prompt_tokens` on every row *(P3-09)*.

**Reported per service, never as one aggregate** — 66% of calls and 71% of
expensive-model calls land in the background sink, so an aggregate figure would
hide loss exactly where the money is.

### 7.8 First-day reconciliation report

The completeness oracle, run against the first day's traffic. It derives the
expected call count per question from `question_records.verification_meta` —
data written independently of the telemetry — and subtracts what actually
arrived:

```sql
WITH q AS (
  SELECT id,
    (image IS NOT NULL OR (images IS NOT NULL AND jsonb_array_length(images) > 0)) AS has_image,
    (verification_meta ? 'pipeline_version')                  AS l3_ran,
    (verification_meta ? 'v2_version')                        AS v2_ran,
    COALESCE((verification_meta->>'ocr_rerun_count')::int, 0) AS ocr_reruns,
    (verification_status = 'ocr_uncertain')                   AS judge_short
  FROM question_records WHERE created_at >= '<deploy-time>'
), expected AS (
  SELECT id,
    1 + (CASE WHEN has_image THEN 1 ELSE 0 END)
      + (CASE WHEN l3_ran AND has_image THEN 1 ELSE 0 END)
      + (CASE WHEN l3_ran THEN ocr_reruns ELSE 0 END)
      + (CASE WHEN l3_ran THEN 2 ELSE 0 END)
      + (CASE WHEN l3_ran AND NOT judge_short THEN 1 ELSE 0 END)
      + (CASE WHEN v2_ran THEN 1 ELSE 0 END) AS expected_calls
  FROM q
)
SELECT sum(e.expected_calls)                       AS expected,
       count(t.id)                                 AS actual,
       round(100.0*count(t.id)/nullif(sum(e.expected_calls),0), 2) AS coverage_pct
FROM expected e LEFT JOIN public.ai_model_calls t ON t.question_record_id = e.id;
```

**Pass: coverage ≥ 95%**, with any shortfall attributable per service.
Reference: the same oracle over the last 30 days of v89 traffic predicts **1,983
calls across 404 questions**, so its arithmetic is already validated against
production.

---

## 8. Success and failure criteria

### 8.1 Success — all must hold

| # | Criterion | Threshold |
|---|---|---|
| S1 | Function serving | Platform version 127, header v90, bundle = 2 files |
| S2 | Smoke test | Passes |
| S3 | Telemetry inserting | Rows appear within 5 min of the seeded exercise |
| S4 | Uniqueness | 0 duplicate `call_uid` |
| S5 | Service resolution | **100%** in catalog and bound |
| S6 | Clocks | 0 missing / 0 impossible `started_at` |
| S7 | Tokens | Every successful row has `prompt_tokens > 0`; units reconcile |
| S8 | Negative control | The idempotency-hit repeat produces **0** rows |
| S9 | Tutoring intact | 0 empty answers; no function 5xx |
| S10 | Latency | No successful request > 30 s; no gross median regression |
| S11 | Clean logs | No `model-call-telemetry-error` or `-lost` |
| S12 | Coverage | ≥ 95% on the first-day reconciliation |

**Volume gate.** S3–S8 and S12 are only meaningful over a real sample.
Declare success at **48 hours OR 20 student questions, whichever comes later** —
with the seeded exercise counting toward neither, since it is operator traffic.
At ~4 questions/day this may mean a **5-day** observation window, and that is the
correct answer rather than declaring victory on five data points.

### 8.2 Failure — any one triggers rollback

| # | Trigger | Action |
|---|---|---|
| F-1 | Any HTTP 5xx from `ai-tutor` attributable to v90 | **Rollback level 2 immediately** |
| F-2 | Empty answers appear (baseline 0) | **Rollback level 2** |
| F-3 | Successful request > 30 s, or clear median regression | **Rollback level 2** |
| F-4 | Duplicate `call_uid` | Level 1, then investigate — indicates a constraint or emitter defect |
| F-5 | Repeated `model-call-telemetry-lost` | **Level 1** — stop the noise, investigate |
| F-6 | Successful rows with 0 tokens | **Level 1** — the defect Phase 3 exists to fix has reproduced |
| F-7 | Rows on the idempotency-hit path (S8 fails) | **Level 1** — spend is being invented |
| F-8 | Bundle shows only `index.ts` | **Redeploy via Path B immediately** — cold-start 500 class |
| F-9 | Coverage < 80% | Do not roll back; investigate per service before Phase 4 |

---

## 9. Known and accepted before deploy

Documented so none is mistaken for a fault during monitoring:

1. **`difficulty_detector` will emit nothing.** Detector v2 has not fired once in
   30 days — it needs `DIFFICULTY_DETECTOR_V2_ENABLED` **and** a v1
   `default_medium` classification. Zero rows for this service is expected and is
   **not** missing telemetry. The reconciliation handles it correctly, because
   `v2_ran` is false for those questions.
2. **The upsert path is unexercised against the live table.** F1's
   `ON CONFLICT DO NOTHING` write has been reviewed and dry-run but never
   executed against `ai_model_calls`. The seeded exercise is its first real test;
   S3 is precisely that check.
3. **The retry path may never fire**, and its absence proves nothing. It is
   exercised only by a flush failure.
4. **Latency cannot be validated statistically** at this traffic (§7.5).
5. **The first 48 hours of data are provisional**, per the integrity review, until
   verification returns all-PASS on live rows.

---

## 10. Rollback procedure

| Level | Trigger | Action | Effect | Time |
|---|---|---|---|---|
| **1** | Telemetry misbehaving; tutoring fine | `supabase secrets set AI_MODEL_TELEMETRY_ENABLED=false --project-ref igvkyxkmjnkzscqgommj` | Recording and flushing stop. Function keeps serving v90. Collected rows preserved for diagnosis | **Seconds, no deploy** |
| **2** | Any tutoring impact | Redeploy v89 via **Path B** from the previous commit | Telemetry writer gone; table inert. Full behavioural revert | Minutes |
| **3** | Schema removal needed | `DROP TABLE public.ai_model_calls;` | Removes the table | Minutes |

**Level 1 first, almost always.** It stops the behaviour in seconds without a
deploy and keeps the evidence. Level 3 is safe only before Phase 4, after which
`cost_engine.cost_facts` references `ai_model_calls(id)`.

Rolling back does **not** require reverting the migration: an empty, unwritten
table is inert and harmless.

---

## 11. Live monitoring plan — first 48 hours

| Window | Cadence | Watch | Act if |
|---|---|---|---|
| **0–15 min** | Continuous | Function logs; smoke test; seeded exercise | Any 5xx, any telemetry error line → **Go/No-Go 4 fails** |
| **15–60 min** | Every 15 min | `verify-ai-telemetry.sql`; row counts; `execution_time_ms` | Any FAIL check → level 1 |
| **1–6 h** | Hourly | Per-service completeness (§7.7); log scan for telemetry lines | Zero-token rows, duplicates → level 1 |
| **6–24 h** | Every 4 h | Reconciliation (§7.8); empty-answer count | Coverage < 80%, any empty answer → investigate / level 2 |
| **24–48 h** | Twice daily | Full 20-check verification; latency spot-check | Any FAIL → assess against §8.2 |
| **At the volume gate** | Once | Full verification + first-day reconciliation report | Declare success or extend the window |

**Log queries to keep to hand:**
```
model-call-telemetry-error      -- a flush attempt failed (carries attempt number)
model-call-telemetry-lost       -- both attempts failed; rows are gone
oai-no-content                  -- pre-existing upstream failure signal
unhandled-error                 -- pre-existing; must not increase
```

---

## 12. Go / No-Go decision points

| # | Point | Question | No-Go action |
|---|---|---|---|
| **1** | Before deploy | Is the window outside exam prep? Are gates 18/18 and the validator PASS? Is the DB verification green? | Postpone |
| **2** | Immediately after deploy | Platform version 127, header v90, bundle = **two files**? | **Redeploy via Path B at once** — this is the outage class the runbook exists to prevent |
| **3** | After the seeded exercise | Rows inserted? Services 100% resolved? Tokens non-zero? Repeat produced 0 rows? | Level 1, investigate before student traffic |
| **4** | After 15 minutes | Any 5xx, empty answer, or telemetry error line? | Level 2 |
| **5** | At the volume gate | All 12 success criteria met? | Extend the window, or level 1 and reassess |

---

## 13. Approval requested

1. **Go for the v90 deployment** via DEPLOY.md §4 Path B, in a nominated window.
2. **Acceptance of the volume-gated success criteria** — 48 hours *or* 20 student
   questions, whichever is later, which at current traffic likely means ~5 days.
3. **Acknowledgement of §7.5** — student-visible latency will be validated as "no
   gross regression, none structurally possible", not as a measured statistical
   equivalence, because the traffic does not support the latter.

Nothing is deployed until this review is approved and a window is set.
