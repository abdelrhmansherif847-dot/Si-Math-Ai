# Dashboard Metrics Audit

> Inventory of every metric rendered on `admin.html` and `ai-monitor.html`, with
> its data source, query, formula, refresh behavior, and accuracy status.
>
> Status legend:
> - **Accurate** — direct DB COUNT/SUM/aggregate on real platform tables.
> - **Estimated** — derived from real data using a multiplier or cost model.
> - **Placeholder** — DOM exists but logic is not connected to data; shown only as `—`.
> - **Not wired** — code intentionally hidden / disabled until upstream data exists.
>
> Refresh: all metrics refresh on full page load. `ai-monitor.html` also refreshes
> when the user changes the date-range filter (Today / 7d / 30d). No background
> polling — reload to update.

---

## admin.html

### Header KPI strip (`loadStats`, admin.html:783–800)

| DOM id | Label | Source | Query / formula | Status |
|---|---|---|---|---|
| `statUsers` | Total Users | `profiles` | `SELECT COUNT(*) FROM profiles` | Accurate |
| `statPending` | Pending Payments | `payment_requests` | `SELECT COUNT(*) WHERE status='pending'` | Accurate |
| `statActive` | Paid Users | `profiles` | `SELECT COUNT(*) WHERE plan_code != 'FREE'` | Accurate |
| `statFounder` | Founder Slots Remaining | `system_settings` | `SELECT value WHERE key='founder_slots_remaining'` | Accurate (config-driven) |
| `statFounderSub` | Founder Slots Total | `system_settings` | `SELECT value WHERE key='founder_slots_total'` | Accurate (config-driven) |

### (1) Student Activity (`loadStudentActivity`)

| DOM id | Label | Source | Query / formula | Status |
|---|---|---|---|---|
| `actActiveToday` | Active students today | `question_records` | `SELECT COUNT(DISTINCT user_id) WHERE created_at >= today_00:00 UTC` | Accurate |
| `actActive7d` | Active students last 7d | `question_records` | `SELECT COUNT(DISTINCT user_id) WHERE created_at >= now() - 7d` | Accurate |
| `actQToday` | Questions asked today | `question_records` | `SELECT COUNT(*) WHERE created_at >= today_00:00` | Accurate |
| `actSessToday` | Tutor sessions today | `chat_sessions` | `SELECT COUNT(*) WHERE created_at >= today_00:00` | Accurate |
| `actAvgQ` | Avg questions / active student (7d) | derived | `questions_7d / distinct_active_users_7d` | Accurate (computed client-side from two real queries) |
| `actSpark` | 7-day sparkline | `question_records` | bucketed daily counts over last 7 days | Accurate |

### (2) Revenue & Payments (`loadRevenuePayments`)

| DOM id | Label | Source | Query / formula | Status |
|---|---|---|---|---|
| `revTotal` | Total revenue (EGP) | `payments` | `SUM(amount_egp) WHERE status='approved'` | Accurate |
| `revMonth` | This month | `payments` | `SUM(amount_egp) WHERE status='approved' AND created_at >= month_start` | Accurate |
| `revPending` | Pending count | `payment_requests` | `COUNT(*) WHERE status='pending'` | Accurate |
| `revApproved` | Approved count | `payment_requests` | `COUNT(*) WHERE status='approved'` | Accurate |
| `revRejected` | Rejected count | `payment_requests` | `COUNT(*) WHERE status='rejected'` | Accurate |
| `revAvg` | Avg ticket size | derived | `revTotal / approved_count` (EGP) | Accurate |
| `recentPaymentsBody` | Recent 20 payments | `payments` | `SELECT * ORDER BY created_at DESC LIMIT 20` | Accurate |

### (3) Plans & Conversion (`loadPlansConversion`)

| DOM id | Label | Source | Query / formula | Status |
|---|---|---|---|---|
| `planFree` | Free users | `profiles` | `COUNT(*) WHERE plan_code='FREE'` | Accurate |
| `planPaid` | Paid users | `profiles` | `COUNT(*) WHERE plan_code != 'FREE'` | Accurate |
| `planConv` | Free→Paid conversion % | derived | `paid / (paid + free) × 100` | Accurate |
| `planMix` / `planMixLegend` | Plan distribution donut | `profiles` | `COUNT(*) GROUP BY plan_code` | Accurate |

### (4) Subscription Growth (`loadSubscriptionGrowth`)

| DOM id | Label | Source | Query / formula | Status |
|---|---|---|---|---|
| `growNewMonth` | New paid this month | `profiles` | `COUNT(*) WHERE plan_code != 'FREE' AND created_at >= month_start` | Accurate |
| `growNew30d` | New paid last 30d | `profiles` | `COUNT(*) WHERE plan_code != 'FREE' AND created_at >= now() - 30d` | Accurate |
| `growMonthly` | Monthly active paid (proxy) | `profiles` ⋈ `question_records` | distinct paid users who created a `question_records` row in last 30d | Estimated (activity proxy — no explicit "active subscription" flag yet) |
| `growChurned` | Churned (30d) | `profiles` | paid users whose last `question_records.created_at < now() - 30d` | Estimated (inactivity proxy, not billing-event-driven) |

### (5) Weakness Analyzer (`loadWeaknessOverview`)

| DOM id | Label | Source | Query / formula | Status |
|---|---|---|---|---|
| `wReports` | Weakness reports | `weakness_reports` | `COUNT(*)` | Accurate |
| `wPlans` | Focus plans | `focus_plans` | `COUNT(*)` | Accurate |
| `wSignals` | Weakness signals | `weakness_signals` | `COUNT(*)` | Accurate |
| `wTopTopicsBody` | Top weak topics | `weakness_signals` | `GROUP BY topic ORDER BY COUNT DESC LIMIT 15` | Accurate |
| `wTopSubtopicsBody` | Top weak subtopics | `weakness_signals` | `GROUP BY subtopic ORDER BY COUNT DESC LIMIT 15` | Accurate |
| `wTopMistakesBody` | Top mistake types | `exam_mistakes` | `GROUP BY error_type ORDER BY COUNT DESC LIMIT 15` | Accurate |

### (6) Platform Health — **HIDDEN**

| DOM id | Label | Status |
|---|---|---|
| `phErrs` | Edge errors (24h) | **Not wired** — Edge logs ingestion not built. Section hidden in UI. |
| `phFailed` | Failed verifications | **Not wired** — same. |
| `phAvgRt` | Avg L3 latency | **Not wired** — `verification_meta.l3_latency_ms` is not consistently populated; section hidden. |
| `phP95Rt` | P95 L3 latency | **Not wired** — same. |

Section will return when Edge Function metrics pipeline ships.

### (7) Admin Alerts (`loadAdminAlerts`)

| DOM id | Label | Source | Query / formula | Status |
|---|---|---|---|---|
| `adminAlerts` | Threshold banners | `payment_requests`, `profiles` | banners for: >10 pending payments, founder slots <5, new signups in last 24h | Accurate (rule-based on real counts) |

### (8) Role Management (owner only, `loadRoleManagement`)

| DOM id | Source | Query / formula | Status |
|---|---|---|---|
| `roleOwners` / `roleSuperAdmins` / `roleAdmins` / `roleUsers` | `profiles` | `COUNT(*) GROUP BY role` | Accurate |
| `roleAuditBody` | `role_audit_log` | `SELECT * ORDER BY created_at DESC LIMIT 50` | Accurate |

---

## ai-monitor.html

Rewritten 2026-07-28. Architecture: **one fetch → one computation → one validation pass → pure rendering.**
`loadAll()` pages the entire selected window into memory (`fetchAllRows`, 1000-row pages — a single
un-paged read silently truncates at PostgREST's cap), hands it to `computeStats()`, and every panel
renders from that one `STATS` object. Two cards cannot disagree about the same quantity because they
read the same field.

**Financial metrics were removed from this page.** Spend, cost-per-question, monthly projections and
the cost-spike alert now belong exclusively to AI Economics in the Owner Dashboard.

### Data-availability model

Every metric is a tagged value `{state, value}` where state is `ok` / `no_data` / `no_field` /
`not_deployed`. `put()` is the only path to the DOM and prints a number **only** for `ok`; every other
state prints an explicit reason. This is what prevents absent telemetry from rendering as a real `0`.

### Verdict vocabulary

`question_records.judge_verdict` stores **`agrees` / `disagrees` / `inconclusive` / `ocr_uncertain`**
(plural). Matching the singular forms classifies every record as "other" — the previous build did this,
reporting 0 disagreements against 94 real ones and a green "Judge disagreement: 0.0%" alert.

### Request Volume & Pipeline Coverage

| DOM id | Label | Source | Query / formula | Status |
|---|---|---|---|---|
| `cTotalReq` | Total requests (window) | `question_records` | `COUNT(*) WHERE created_at >= since` | Accurate |
| `cToday` / `cWeek` / `cMonth` | Fixed rolling windows | `question_records` | head COUNT at 00:00 / −7d / −30d | Accurate — deliberately independent of the period selector |
| `cL3Count` / `cNoL3Count` / `cL3Rate` | L3 coverage | `question_records` | rows with `verification_meta.pipeline_version` vs the rest | Accurate |
| `cLastL3` | Most recent L3 run | derived | `MAX(created_at)` over L3 rows | Accurate |
| Token / cost | — | — | — | **Not displayed.** No `*_prompt_tokens`, `*_completion_tokens` or `*_tokens_in/out` key exists on any row; the panel states this rather than rendering `0` / `$0`. |

### Pipeline Composition

Rows are labelled **measured** (counted per record) or **derived** (exact structural multiple of an L3 run).

| DOM id | Label | Query / formula | Status |
|---|---|---|---|
| `mL3Runs` / `mJudgeTop` / `mJudge` | L3 runs, judge invocations | `COUNT(L3 rows)` — 1 judge call per run | Derived (exact, labelled) |
| `mSolvers` | Solver invocations | `COUNT(L3 rows) × 2` | Derived (exact, labelled) |
| `mOcr` | OCR extractions | `COUNT WHERE verification_meta.solver_sees_image = true` | Measured |
| `mOcrRerun` | OCR reruns | `SUM(verification_meta.ocr_rerun_count)` | Measured |
| `mOcrChanged` | Reruns that changed text | `COUNT WHERE ocr_rerun_changed = true` | Measured |
| `mDetV2` | Detector v2 invocations | rows with `v2_tier` | `not_deployed` — no row has ever carried one |

### L3 Pipeline

An L3 run is a row carrying `verification_meta.pipeline_version`. This is broader than
`verification_status='pipeline_complete'`: runs ending as `ocr_uncertain` carry that value in
`verification_status`, so filtering on `pipeline_complete` made the `ocr_uncertain` verdict
**structurally unreachable** — the filter dropped exactly the rows the counter was meant to show.

| DOM id | Label | Query / formula | Status |
|---|---|---|---|
| `l3Total` / `l3Rate` | L3 runs, coverage | `COUNT(L3 rows)`, ÷ window total | Accurate |
| `l3Agree` | **Solver ↔ solver** agreement | `AVG(solver_agreement) × 100` over rows carrying it | Accurate |
| `l3JudgeAgree` / `l3JudgeDisagree` / `l3Inconclusive` / `l3JudgeOcr` | **Solvers ↔ tutor** verdict | `COUNT WHERE judge_verdict = <value>` ÷ L3 total | Accurate — mutually exclusive, sums to `l3Total` (asserted) |
| `l3QualScore` | Avg quality score | `AVG(verification_quality_score)` over **scored** rows | Accurate — denominator shown in sub-label |
| `l3QHigh` / `l3QMed` / `l3QLow` | Quality buckets | over scored rows only | Accurate |
| `l3QNone` | No score recorded | L3 rows lacking the field | Accurate — previously bucketed as "low quality" |
| `l3Latency` / `l3LatencyP95` | Avg / p95 latency | `verification_meta.pipeline_latency_ms` | Accurate — p95 is nearest-rank, matching SQL `percentile_disc` |

> `l3Agree` and the judge verdicts measure **different axes** and routinely differ. 57 production
> records have both solvers agreeing *and* a `disagrees` verdict. Neither is wrong; the UI now says so.

### Difficulty Monitor

| DOM id | Label | Query / formula | Status |
|---|---|---|---|
| `dV1Total` | v1 tier assignments | `COUNT WHERE verification_tier IS NOT NULL` | Accurate |
| `dV1GptAgree` | v1 / GPT agree rate | `verification_tier = verification_meta.gpt_tier`, over rows where `gpt_tier` is **non-null** | Accurate — cross-checked against the stored `agrees_with_gpt` flag; divergence raises the integrity banner |
| `dDefaultMed` / `dV1DefMedPct` | v1 fallback rate | `reasons` contains `default_medium` | Accurate |
| `dV2Total` / `dV2GptAgree` / `dV2AvgLatency` | Detector v2 | rows with `v2_tier` | `not_deployed` |
| `dCmpBody` | v1 vs v2 comparison | pairs each record's **real** `verification_tier` with its `v2_tier` | Accurate — the v1 side was previously hard-coded to `medium` |

### Detector v2 Shadow Monitor

Detector v2 has essentially never run in production. **Re-measured 2026-08-25:
exactly one** `question_records` row of 1,428 carries `v2_tier`, created 2026-08-13 —
so "zero rows", as this said until then, is no longer literally true, and "has *never* run"
is now "ran once and has not run since". The distinction matters only because it is the
difference between *not wired up* and *wired up and idle*; the panel's behaviour is
unaffected. The page states **"Not deployed"** rather than showing a progress bar implying
collection is under way, which remains the right presentation for a single row.

| DOM id | Label | Query / formula | Status |
|---|---|---|---|
| `sV2Count` | v2 rows captured | all-time COUNT where `v2_tier` is not null | Accurate (all-time — checkpoints are absolute) |
| `sNoV2Count` | default_medium records | all-time COUNT — the v2 target set | Accurate — previously an unrelated subtraction labelled "without v2" |
| `sV2Coverage` | v2 coverage % | `v2Count ÷ defMedCount`, both all-time | Accurate |

### Recent Quality Failures

| DOM id | Label | Query | Status |
|---|---|---|---|
| `rvfBody` | Recent judge disagreements | `WHERE judge_verdict = 'disagrees'` (plural) ORDER BY created_at DESC LIMIT 10 | Accurate — also shows the solver axis per row, and flags a mismatch if the count disagrees with the panel above |
| `rofBody` | Recent OCR issues | union of (`ocr_confidence < 0.5` OR `judge_verdict='ocr_uncertain'`) and (`ocr_rerun_count <> '0'`), de-duplicated | Accurate — the previous `ocr_rerun_used` predicate matched no rows because that key does not exist |

### OpenAI Operational Health

| DOM id | Label | Source | Status |
|---|---|---|---|
| `oaiStatusVal` / `oaiFailCount` / `oaiLastFail` / `oaiLastOk` | Guard-fire telemetry | `ai_response` matched against the three `safeNoAnswerMessage` strings | Accurate |
| `oaiFeedBody` | Live OpenAI service status | `status.openai.com/api/v2/summary.json` (public, no credentials) | Accurate when reachable; strict shape check, and reports **"feed unreachable"** rather than assuming operational |
| `oaiCodeBreakdown` | Failures by provider status | `oai_http_status` / `oai_error_code` from the same rows as `STATS` | Accurate — a `4xx` other than 401/403/429 is labelled a defect in *our* request, not an OpenAI fault |
| `oaiRecentBody` | Recent failures | real status code per row | Accurate — the "model (inferred)" column was removed; the serving model is not persisted |

### Feedback (`loadFeedback`)

| DOM id | Label | Source | Status |
|---|---|---|---|
| `fbHelpful` | Helpful count | `response_feedback WHERE feedback_type='helpful'` (head COUNT) | Accurate |
| `fbIncorrect` | Incorrect count | `response_feedback WHERE feedback_type='incorrect'` (head COUNT) | Accurate |
| `fbErrorTypesBody` | Error-type breakdown | `response_feedback GROUP BY error_type WHERE feedback_type='incorrect'` | Accurate |
| `fbTopicsBody` | Topic breakdown | `response_feedback GROUP BY topic WHERE feedback_type='incorrect'` | Accurate |
| `fbRecentBody` | Recent 20 feedback rows with original question, image, and Zero response | `response_feedback` ⋈ `profiles(id, full_name, email)` ⋈ `question_records(id, question, ai_response, image)` on `record_id` | Accurate |

### AI Alerts (`renderAlerts`)

Every alert reads `STATS` — the same numbers the panels above display — so an alert cannot contradict
the card it summarises. An alert whose metric could not be evaluated renders **grey ("not evaluated")**,
never green: a green badge on an unmeasured threshold is worse than no badge.

| Alert | Threshold | Source |
|---|---|---|
| Judge disagreement | > 15% red | `judge_verdict='disagrees'` ÷ L3 runs |
| OCR issue rate | > 10% amber | `ocr_confidence < 0.5` ÷ rows carrying `ocr_confidence` |
| Verification confidence | < 0.50 amber | `AVG(verification_confidence)` |
| L3 latency p95 | > 8s red, > 5s amber | `pipeline_latency_ms` |
| Low-quality solver output | > 10% amber | `low_quality_solver` ÷ L3 runs |
| Pipeline activity | red when requests exist but zero L3 runs | liveness check invisible to every rate-based alert above |

The cost-spike alert was removed with the rest of the financial metrics.

### Internal consistency (`validateStats`)

Assertions run on every load; any violation renders a red banner at the top of the page instead of
letting two panels disagree silently:

- judge verdict counts sum to the L3 run total, with no unrecognised verdict value
- quality buckets sum to the scored-record count, and scored + unscored sum to the L3 total
- L3 + non-L3 rows sum to the window total
- computed v1/GPT agreement equals the stored `agrees_with_gpt` count
- the v1 tier distribution sums to the v1 record count

Verified against production on 2026-07-28: all 1167 rows replayed through `computeStats`, 22 metrics
matched independent SQL, 0 assertion failures.

---

## Refresh behavior summary

| Page | Refresh trigger |
|---|---|
| admin.html | Full page load only. No background polling. |
| ai-monitor.html | Full page load and date-range filter change (Today / 7d / 30d). No background polling. |

---

## Estimation / Not-wired summary

| Metric | Page | Why flagged |
|---|---|---|
| `growMonthly`, `growChurned` | admin | Activity proxy, not billing-event-driven |
| `mSolvers`, `mJudge` | ai-monitor | **Derived, not measured** — exact structural multiples of an L3 run (2 solver calls, 1 judge call each), labelled `derived` in the UI. Not per-call telemetry. |
| Detector v2 metrics | ai-monitor | **Not deployed** — no row has ever carried `v2_tier` |
| `phErrs`, `phFailed`, `phAvgRt`, `phP95Rt` | admin | **Not wired** — section hidden |

Removed from ai-monitor (moved to AI Economics): `cPromptTok`, `cCompTok`, `cEstCost`, `cMonthCost`,
`cAvgCost`, `bkSolver`–`bkTotal`, the cost-spike alert, and the Billing & Usage Health section.

## Signals requiring new infrastructure

| Signal | Requirement |
|---|---|
| Rate-limit headroom, token usage | ai-tutor must persist the `x-ratelimit-remaining-*` / `x-ratelimit-reset-*` response headers and the `usage` object per call. Code change + new columns. **No new credentials.** |
| Model availability / deprecations | `GET /v1/models` needs a standard API key; it cannot be called from the browser without exposing it. Requires a server-side Edge Function proxy. |
| Org-level usage & rate-limit config | OpenAI **Admin API key** (`sk-admin-…`) + **Organization ID** (`org-…`) + **Project ID** (`proj_…`), called server-side, plus a scheduled snapshot job. |
| Account balance / credit remaining | **No OpenAI API exists.** Only a dashboard usage limit + billing alert can provide this. No balance figure will ever be shown here. |
