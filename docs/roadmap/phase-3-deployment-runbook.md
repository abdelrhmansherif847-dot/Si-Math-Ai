# RUNBOOK — Deploy `ai-tutor` v90 (AI Economics Phase 3)

**Operator document. Execute top to bottom. Do not skip steps.**

| | |
|---|---|
| **Deploying** | `ai-tutor` **v89 → v90** — AI model-call telemetry |
| **Deploy source** | branch `claude/ai-economics-dashboard-architecture-4uy8r4` · `index.ts` sha256 `6497f0d7…cacbcb` (v90 introduced in `4f91b28`) |
| **Deploy path** | **DEPLOY.md §4 Path B (CLI) ONLY** |
| **Current live** | code `v89`, platform version **126** |
| **After deploy** | code `v90`, platform version **127** |
| **Database** | ✅ already applied — no DB work in this window |
| **Active window** | **45–60 minutes** |
| **Monitoring after** | 48 h **or** 20 student questions, whichever is later |
| **Report template** | `docs/roadmap/phase-3-post-deployment-report.md` (blank, ready to fill) |
| **Data collection** | `scripts/phase3-postdeploy-report.sql` (R0–R12, one pass) |

> ⛔ **NEVER use `mcp__Supabase__deploy_edge_function` for `ai-tutor`.**
> Two production outages (2026-06-17). CLI only.
>
> ⛔ **The bundle must contain TWO files.** `index.ts` *and*
> `_shared/taxonomy.core.js`. One file = cold-start 500 for every student.

**Abort at any time:** `supabase secrets set AI_MODEL_TELEMETRY_ENABLED=false --project-ref igvkyxkmjnkzscqgommj` — takes seconds, no deploy, stops all telemetry, tutoring keeps running. **When in doubt, do this first.**

---

## 0 · Before you start (T-30) — 10 min

- [ ] Window confirmed **outside exam preparation**
- [ ] Second person available to observe (not required, recommended)
- [ ] Test student account credentials to hand — needed for step V2
- [ ] Browser logged in to Supabase Dashboard → Edge Functions
- [ ] Terminal at repo root, on the deploy branch (verified by hash below)

```bash
cd /path/to/Si-Math-Ai
git fetch origin claude/ai-economics-dashboard-architecture-4uy8r4
git checkout claude/ai-economics-dashboard-architecture-4uy8r4
git pull --ff-only
```

**Verify the artifacts you are about to ship** — not the branch tip. Later
documentation commits move `HEAD` without touching the function, so pin the two
files that actually get deployed:

```bash
sha256sum supabase/functions/ai-tutor/index.ts supabase/functions/_shared/taxonomy.core.js
```
**Expect exactly:**
```
6497f0d72da2c51598518fc0ea04fd1d8e6634ed5b37b58af1dae364e1cacbcb  supabase/functions/ai-tutor/index.ts
de016d1c8ce46da5e9ae2e1a82a798994c1e7c54b59292f19433b3c0e220a3b8  supabase/functions/_shared/taxonomy.core.js
```
**🛑 STOP IF:** either hash differs. The reviewed code is not what you have.

Environment:

```bash
export SUPABASE_ACCESS_TOKEN=<personal access token>   # required for deploy
export SUPABASE_PROJECT_REF=igvkyxkmjnkzscqgommj
export SUPABASE_DB_URL=<postgres connection string>    # for verification SQL
# Optional but recommended — enables the functional smoke layer:
export SUPABASE_TEST_JWT=<jwt for a test student>
export SUPABASE_ANON_KEY=<anon key>
```

---

## 1 · Pre-flight (T-15) — 10 min

### P1 · Repo gates — 2 min
```bash
node tests/run-all.mjs
```
**Expect:** `18/18 green` then `ALL GREEN`
**🛑 STOP IF:** anything other than 18/18. Do not deploy.

### P2 · Source validator — 10 sec
```bash
./scripts/validate-ai-tutor-source.sh
```
**Expect:** `validate-ai-tutor-source: PASS (227383 bytes, 4087 lines, version=v90)`
**🛑 STOP IF:** FAIL, or version is not `v90`.

### P3 · Confirm the bundle has two files locally — 10 sec
```bash
ls supabase/functions/ai-tutor/index.ts supabase/functions/_shared/taxonomy.core.js
```
**Expect:** both paths listed.
**🛑 STOP IF:** either is missing.

### P4 · Database pre-state — 1 min
```bash
psql "$SUPABASE_DB_URL" -f scripts/verify-ai-telemetry.sql
```
**Expect:** all structural checks `PASS`; `P3-07 WARN — no rows yet`.
**🛑 STOP IF:** any `FAIL`.

### P5 · Record the latency baseline — 3 min

Dashboard → Edge Functions → `ai-tutor` → Logs. Filter `POST` + status `200`.
Write down `execution_time_ms` for the most recent successful requests.

**Reference (2026-07-28):** `10952 · 8352 · 2774 · 4723` ms — four samples.

> Sample size is tiny by nature of the traffic. This is a **gross-regression
> tripwire**, not a statistical baseline. See readiness review §7.5.

_Recorded values: _______________________________________________

### P6 · Note the current platform version — 1 min

Dashboard → Edge Functions → `ai-tutor`. Read the version number.
**Expect:** `126`

_Recorded: ___________

---

## ✅ GO / NO-GO 1 — proceed to deploy?

| Check | Required |
|---|---|
| Window outside exam prep | ✔ |
| P1 tests 18/18 | ✔ |
| P2 validator PASS, v90 | ✔ |
| P3 both bundle files present | ✔ |
| P4 DB structural checks PASS | ✔ |
| P5, P6 recorded | ✔ |

**All ✔ → GO.** Any ✘ → **postpone**. Nothing has changed in production yet.

---

## 2 · Deploy (T+0) — 5 min

### D1 · Deploy — 2–4 min
```bash
supabase functions deploy ai-tutor --project-ref igvkyxkmjnkzscqgommj
```
**Expect:** bundling output, then `Deployed Function ai-tutor`.
**🛑 IF THIS FAILS:** nothing shipped, v89 still live. Read the error, fix, restart at P1. **No rollback needed.**

### D2 · Confirm version — 1 min

Dashboard → Edge Functions → `ai-tutor`.

**Expect:**
- Platform version = **127** (was 126)
- Code header first line = `// ai-tutor Edge Function v90`

### D3 · Confirm the bundle — 1 min

Same screen, file list.

**Expect BOTH:**
- `index.ts`
- `_shared/taxonomy.core.js`

---

## 🚦 GO / NO-GO 2 — THE CRITICAL CHECKPOINT

| Check | Required | If wrong |
|---|---|---|
| Platform version = 127 | ✔ | Deploy did not land — re-run D1 |
| Header reads `v90` | ✔ | Wrong source — re-check the P0 hashes, then re-run D1 |
| Bundle lists **two** files | ✔ | **🔴 REDEPLOY IMMEDIATELY via D1.** A one-file bundle 500s at cold start for every student |

**This is the outage class the runbook exists to prevent. Do not proceed past this line until all three are correct.**

---

## 3 · Immediate verification (T+5) — 20 min

### V1 · Smoke test — 1 min
```bash
SUPABASE_PROJECT_REF=igvkyxkmjnkzscqgommj EXPECTED_VERSION=v90 \
  ./scripts/smoke-test-ai-tutor.sh
```
**Expect (no JWT):**
```
→ Heartbeat: POST https://igvkyxkmjnkzscqgommj.functions.supabase.co/ai-tutor (no auth)
  PASS: serve() handler is running, auth gate engaged (HTTP 401)
→ Functional smoke: SKIPPED (SUPABASE_TEST_JWT not set)
smoke-test-ai-tutor: heartbeat OK
```
**Expect (with JWT):** additionally a 200 chat response with `version=v90`.

**🔴 ROLLBACK LEVEL 2 IF:** heartbeat returns 500/502/503/000, or version mismatch.

### V2 · Seeded exercise — 12 min

Log in as a **real test student** in the browser and ask, in order:

| # | Ask | Exercises | Expect |
|---|---|---|---|
| 1 | A plain text maths question | `tutor/tutor_main` | Normal answer |
| 2 | Upload a maths image | `tutor`, `vision`, `ocr/extract` | Normal answer |
| 3 | Upload an image with unclear digits | `ocr/rerun` | Normal answer |
| 4 | "explain again" on Q1 | `reference_resolver/resolve` | Normal answer |
| 5 | **Re-send Q1 verbatim** | idempotency path | Normal answer, **and 0 new telemetry rows** |

**Watch that every answer is normal.** Content, speed and formatting must be indistinguishable from v89.

**🔴 ROLLBACK LEVEL 2 IF:** any question errors, returns an empty answer, or is visibly slower than usual.

### V3 · Telemetry landed — 2 min
```sql
SELECT service_code, stage, count(*) AS calls,
       count(*) FILTER (WHERE success) AS ok,
       count(*) FILTER (WHERE success AND prompt_tokens > 0) AS with_tokens,
       sum(prompt_tokens) AS p_tok, sum(completion_tokens) AS c_tok,
       round(avg(latency_ms)) AS avg_ms
FROM public.ai_model_calls GROUP BY 1,2 ORDER BY 1,2;
```
**Expect:** rows for `tutor/tutor_main`, `vision/question_detect`, `ocr/extract`,
`ocr/rerun`, `solver/solver_a`, `solver/solver_b`, `judge/verdict`,
`reference_resolver/resolve`.
**Every `ok` row must have `with_tokens` = `ok`.** Token sums must be non-zero.

**Not expected:** `difficulty_detector/classify` — v2 has not fired in 30 days. Its absence is normal.

**🟠 LEVEL 1 IF:** successful rows show 0 tokens — the exact defect Phase 3 exists to fix has reproduced.

### V4 · Negative control — 1 min
```sql
SELECT count(*) AS rows_for_repeat
FROM public.ai_model_calls
WHERE client_request_id = '<client_request_id of question 5>';
```
**Expect:** `0` — or only the rows from the original Q1, none new.
The idempotency path makes no model call, so it must record no spend.

**🟠 LEVEL 1 IF:** new rows appeared. Spend is being invented.

### V5 · Full verification — 2 min
```bash
psql "$SUPABASE_DB_URL" -f scripts/verify-ai-telemetry.sql
```
**Expect:** every row `PASS`. Acceptable `WARN` only on checks needing more volume.

Key checks: **P3-08** tokens non-zero · **P3-09** units reconcile ·
**P3-16/17** no duplicate `call_uid` · **P3-18** `started_at` sane ·
**P3-10/11** 100% service resolution · **P3-20** `client_request_id` complete.

**🟠 LEVEL 1 IF:** any `FAIL`.

### V6 · Log scan — 15 min (runs alongside V3–V5)

Dashboard → Edge Functions → `ai-tutor` → Logs.

**Must NOT appear:**
```
model-call-telemetry-error     ← a flush attempt failed
model-call-telemetry-lost      ← both attempts failed, rows gone
```
**Must not increase:** `unhandled-error`, `oai-no-content`
**Must be zero:** any HTTP 5xx

**🔴 ROLLBACK LEVEL 2 IF:** any 5xx. **🟠 LEVEL 1 IF:** repeated telemetry-lost lines.

---

## ✅ GO / NO-GO 3 — release to student traffic?

| Check | Required |
|---|---|
| V1 smoke passed | ✔ |
| V2 all five questions normal | ✔ |
| V3 telemetry with non-zero tokens | ✔ |
| V4 repeat produced no new rows | ✔ |
| V5 verification all PASS | ✔ |
| V6 no 5xx, no telemetry errors | ✔ |

**All ✔ → GO.** Enter monitoring.
**Any ✘ → rollback per that step's trigger, then stop and diagnose.**

---

## 4 · Monitoring

| Window | Cadence | Do | Escalate if |
|---|---|---|---|
| 0–1 h | every 15 min | V5 + log scan | any FAIL → Level 1 |
| 1–6 h | hourly | V3 per-service + log scan | 0-token rows, duplicates → Level 1 |
| 6–24 h | every 4 h | Reconciliation (§5) + empty-answer count | coverage < 80% or any empty answer → investigate / Level 2 |
| 24–48 h | twice daily | Full V5 + latency spot-check | any FAIL → assess |
| At volume gate | once | Full V5 + reconciliation report | declare success or extend |

**Volume gate:** 48 h **or** 20 student questions, whichever is **later**. At ~4 questions/day this is likely **~5 days**. The seeded exercise does not count toward it.

---

## 5 · Final production verification sequence

Run once at the volume gate. All must pass to declare success.

```sql
-- 1 · Insertion + spread
SELECT count(*) rows, count(DISTINCT request_id) requests,
       count(DISTINCT question_record_id) questions, min(created_at) first_row
FROM public.ai_model_calls;

-- 2 · No duplicate call_uid  → must be 0
SELECT count(*) FROM (SELECT call_uid FROM public.ai_model_calls
                      GROUP BY call_uid HAVING count(*) > 1) d;

-- 3 · 100% service resolution → in_catalog and bound must both be true on every row
SELECT t.service_code, t.model, count(*) calls,
       (s.service_code IS NOT NULL) in_catalog,
       EXISTS (SELECT 1 FROM ai_catalog.service_bindings b
               WHERE b.service_code=t.service_code AND b.model=t.model
                 AND b.provider_code=t.provider AND b.effective_to IS NULL) bound
FROM public.ai_model_calls t
LEFT JOIN ai_catalog.services s ON s.service_code=t.service_code
GROUP BY 1,2,4 ORDER BY 3 DESC;

-- 4 · Clocks → missing and impossible must both be 0
SELECT count(*) FILTER (WHERE started_at IS NULL) missing,
       count(*) FILTER (WHERE started_at > created_at) impossible,
       round(percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (created_at-started_at)))::numeric,2) median_skew_s,
       round(max(EXTRACT(EPOCH FROM (created_at-started_at)))::numeric,2) max_skew_s
FROM public.ai_model_calls;

-- 5 · Tutoring health → empty_answers must be 0 (baseline: 0 of 404 over 30d)
SELECT count(*) questions,
       count(*) FILTER (WHERE oai_http_status IS NOT NULL) upstream_errors,
       count(*) FILTER (WHERE ai_response IS NULL OR length(trim(ai_response))=0) empty_answers
FROM question_records WHERE created_at >= '<deploy-time>';

-- 6 · Completeness BY SERVICE (never aggregate — 66% of calls are background)
SELECT service_code, stage, count(*) calls,
       count(*) FILTER (WHERE NOT success) failed,
       count(*) FILTER (WHERE success AND prompt_tokens>0) with_tokens,
       sum(prompt_tokens+completion_tokens) total_tokens
FROM public.ai_model_calls GROUP BY 1,2 ORDER BY 1,2;

-- 7 · First-day reconciliation → coverage_pct must be >= 95
WITH q AS (
  SELECT id,
    (image IS NOT NULL OR (images IS NOT NULL AND jsonb_array_length(images)>0)) has_image,
    (verification_meta ? 'pipeline_version') l3_ran,
    (verification_meta ? 'v2_version') v2_ran,
    COALESCE((verification_meta->>'ocr_rerun_count')::int,0) ocr_reruns,
    (verification_status='ocr_uncertain') judge_short
  FROM question_records WHERE created_at >= '<deploy-time>'
), expected AS (
  SELECT id, 1 + (CASE WHEN has_image THEN 1 ELSE 0 END)
    + (CASE WHEN l3_ran AND has_image THEN 1 ELSE 0 END)
    + (CASE WHEN l3_ran THEN ocr_reruns ELSE 0 END)
    + (CASE WHEN l3_ran THEN 2 ELSE 0 END)
    + (CASE WHEN l3_ran AND NOT judge_short THEN 1 ELSE 0 END)
    + (CASE WHEN v2_ran THEN 1 ELSE 0 END) expected_calls
  FROM q
)
SELECT sum(e.expected_calls) expected, count(t.id) actual,
       round(100.0*count(t.id)/nullif(sum(e.expected_calls),0),2) coverage_pct
FROM expected e LEFT JOIN public.ai_model_calls t ON t.question_record_id=e.id;
```

Plus: **8 · Latency** — Dashboard logs, compare `execution_time_ms` for successful POSTs against the P5 values.

---

## 6 · Rollback cards

### 🟠 LEVEL 1 — stop telemetry, keep v90 — **seconds**
```bash
supabase secrets set AI_MODEL_TELEMETRY_ENABLED=false --project-ref igvkyxkmjnkzscqgommj
```
**Use when:** telemetry misbehaves, tutoring is fine (0-token rows, duplicates, repeated telemetry-lost, verification FAIL).
**Effect:** recording and flushing stop immediately. Function keeps serving. **Collected rows are preserved for diagnosis.**
**Verify:** no new rows in `ai_model_calls`; no telemetry log lines.
**Re-enable:** same command with `=true`.

### 🔴 LEVEL 2 — revert to v89 — **~5 min**
```bash
git checkout 20be116 -- supabase/functions/ai-tutor/index.ts
sha256sum supabase/functions/ai-tutor/index.ts
#   expect 388f683bbb839e34e84f041533a188694647b971697234f80a97b28db735d14b
./scripts/validate-ai-tutor-source.sh          # expect version=v89
supabase functions deploy ai-tutor --project-ref igvkyxkmjnkzscqgommj
```
**Use when:** ANY student impact — 5xx, empty answers, visible slowdown, or a failed GO/NO-GO 2.
**Effect:** full behavioural revert. Telemetry writer gone; table inert and harmless.
**Verify:** platform version increments; header reads `v89`; smoke test with `EXPECTED_VERSION=v89` passes.
**Then:** `git checkout HEAD -- supabase/functions/ai-tutor/index.ts` to restore the working tree.

### ⚫ LEVEL 3 — drop the table — rarely needed
```sql
DROP TABLE public.ai_model_calls;
```
**Use when:** the schema itself must go. **Safe only before Phase 4** — after that `cost_engine.cost_facts` references it.
**Note:** not required for a code rollback. An empty unwritten table is inert.

> **Reach for Level 1 first, almost always.** It stops the behaviour in seconds without a deploy and keeps the evidence.

---

## 7 · Declaring success

At the volume gate, all twelve must hold:

- [ ] **S1** Platform version 127, header v90, bundle = 2 files
- [ ] **S2** Smoke test passed
- [ ] **S3** Telemetry rows present, spread across services
- [ ] **S4** 0 duplicate `call_uid`
- [ ] **S5** 100% service resolution (in catalog **and** bound)
- [ ] **S6** 0 missing / 0 impossible `started_at`
- [ ] **S7** Every successful row has `prompt_tokens > 0`; units reconcile
- [ ] **S8** Repeat question produced 0 new rows
- [ ] **S9** 0 empty answers; no function 5xx
- [ ] **S10** No successful request > 30 s; no gross median regression vs P5
- [ ] **S11** No `model-call-telemetry-error` / `-lost` lines
- [ ] **S12** Reconciliation coverage ≥ 95%
- [ ] **Volume gate met:** ≥ 48 h **and** ≥ 20 student questions

**All ✔ → Phase 3 COMPLETE.** Record the result, mark Phase 3 done in
`docs/roadmap/ai-economics.md`, and Phase 4 (Cost Engine) is unblocked.

**Any ✘ → not complete.** Extend monitoring or roll back. Do not begin Phase 4.

---

## 8 · Quick reference card

```bash
# ABORT — telemetry off, seconds, no deploy
supabase secrets set AI_MODEL_TELEMETRY_ENABLED=false --project-ref igvkyxkmjnkzscqgommj

# DEPLOY
supabase functions deploy ai-tutor --project-ref igvkyxkmjnkzscqgommj

# ROLLBACK to v89
git checkout 20be116 -- supabase/functions/ai-tutor/index.ts && \
  supabase functions deploy ai-tutor --project-ref igvkyxkmjnkzscqgommj

# SMOKE
SUPABASE_PROJECT_REF=igvkyxkmjnkzscqgommj EXPECTED_VERSION=v90 ./scripts/smoke-test-ai-tutor.sh

# VERIFY
psql "$SUPABASE_DB_URL" -f scripts/verify-ai-telemetry.sql
```

| Fact | Value |
|---|---|
| Deploy source hash | `6497f0d7…cacbcb` (index.ts, v90) |
| Rollback commit (v89) | `20be116` · hash `388f683b…35d14b` |
| Project ref | `igvkyxkmjnkzscqgommj` |
| Version before → after | 126 → 127 |
| Log lines that must not appear | `model-call-telemetry-error`, `model-call-telemetry-lost` |
| Expected to emit nothing | `difficulty_detector` — normal |
| Latency baseline (P5) | 10952 · 8352 · 2774 · 4723 ms |
