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

All ai-monitor metrics scope to the active date-range filter (Today / 7d / 30d, default 7d). Filter changes re-run all loaders.

### Cost & Usage (`loadCostUsage`)

| DOM id | Label | Source | Query / formula | Status |
|---|---|---|---|---|
| `cTotalReq` | Total requests (window) | `question_records` | `COUNT(*) WHERE created_at >= since` | Accurate |
| `cToday` | Today's requests | `question_records` | `COUNT(*) WHERE created_at >= today_00:00` | Accurate |
| `cWeek` | This week's requests | `question_records` | `COUNT(*) WHERE created_at >= now() - 7d` | Accurate |
| `cMonth` | This month's requests | `question_records` | `COUNT(*) WHERE created_at >= now() - 30d` | Accurate |
| `cPromptTok` / `cCompTok` | Prompt / completion tokens (window) | `question_records.verification_meta` | sum of `solver_*`, `judge_*`, `ocr_*` token fields | Estimated — only captures tokens for fields ai-tutor currently emits; v82 will add per-role fields. Real but **partial**. |
| `cEstCost` | Estimated cost (window) | derived | `Σ(tokens × per-model price)` using OpenAI list pricing (gpt-4o-mini in 0.15 / out 0.60; gpt-4o in 2.50 / out 10.00 per 1M) | Estimated — same caveat as tokens, plus list-price model (real billing may differ with discounts) |
| `cMonthCost` | Est. monthly cost | derived | extrapolation of last-30d cost / 30 × 30 | Estimated |
| `cL3Count` / `cNoL3Count` / `cL3Rate` | L3 pipeline runs | `question_records` | `verification_status='pipeline_complete'` vs everything else in window | Accurate |

### Cost Breakdown by Role (`renderCostBreakdown`) — **AWAITING v82**

| DOM id | Status |
|---|---|
| `bkSolver`, `bkJudge`, `bkOcr`, `bk4o`, `bkMini`, `bkTotal` | **Not wired** — per-role token capture ships with ai-tutor v82. Card stays in DOM with notice banner "Awaiting v82 token tracking". Values fixed at `—` until v82 deploys. |

### Model Usage (`loadModelUsage`)

| DOM id | Label | Source | Query / formula | Status |
|---|---|---|---|---|
| `mMini` | gpt-4o-mini calls | `question_records.verification_meta` | rows where solver fields present × 2 (one per solver) | Estimated — counts L3 runs as 2 calls each; doesn't measure actual API call count. |
| `mFull` | gpt-4o calls | `question_records.verification_meta` | rows where `judge_*` fields present + rows where `ocr_rerun_*` fields present | Estimated — same caveat. |
| `mDetV2` | Detector v2 invocations | `question_records.verification_meta` | rows where `v2_tier` is not null | Accurate (boolean presence) |

### L3 Pipeline (`loadL3Pipeline`)

| DOM id | Label | Source | Query / formula | Status |
|---|---|---|---|---|
| `l3Total` | Total L3 runs | `question_records` | `COUNT WHERE verification_status='pipeline_complete'` | Accurate |
| `l3Rate` | L3 pipeline rate | derived | `l3_total / total_requests × 100` | Accurate |
| `l3Agree` | Judge agreement rate | `question_records` | `COUNT WHERE judge_verdict='agree' / COUNT WHERE judge_verdict IS NOT NULL × 100` | Accurate |
| `l3QualScore` | Avg verification confidence | `question_records` | `AVG(verification_confidence) WHERE verification_status='pipeline_complete'` | Accurate |

### Difficulty Monitor (`loadDifficultyMonitor`)

| DOM id | Label | Source | Status |
|---|---|---|---|
| `dV1Total` | v1 tier assignments | `question_records.verification_tier` | Accurate |
| `dV2Total` | v2 tier assignments | `question_records.verification_meta.v2_tier` | Accurate |
| `dDefaultMed` | % defaulted to MEDIUM | `question_records` | Accurate |

### Detector v2 Shadow Monitor (`loadShadowMonitor`)

| DOM id | Label | Source | Status |
|---|---|---|---|
| `sV2Count` | v2 rows captured | `question_records` where `verification_meta->>'v2_tier' IS NOT NULL` | Accurate |
| `sNoV2Count` | v2 misses | inverse of above in window | Accurate |
| `sV2Coverage` | v2 coverage % | derived | Accurate |

### Recent Quality Failures (`loadRecentFailures`)

| DOM id | Label | Source | Status |
|---|---|---|---|
| `rvfBody` | Recent judge-disagree rows | `question_records WHERE judge_verdict='disagree' ORDER BY created_at DESC LIMIT 20` | Accurate |
| `rofBody` | Recent OCR issues | `question_records WHERE ocr_confidence < 0.6 ORDER BY created_at DESC LIMIT 20` | Accurate |

### Feedback (`loadFeedback`)

| DOM id | Label | Source | Status |
|---|---|---|---|
| `fbHelpful` | Helpful count | `response_feedback WHERE feedback_type='helpful'` (head COUNT) | Accurate |
| `fbIncorrect` | Incorrect count | `response_feedback WHERE feedback_type='incorrect'` (head COUNT) | Accurate |
| `fbErrorTypesBody` | Error-type breakdown | `response_feedback GROUP BY error_type WHERE feedback_type='incorrect'` | Accurate |
| `fbTopicsBody` | Topic breakdown | `response_feedback GROUP BY topic WHERE feedback_type='incorrect'` | Accurate |
| `fbRecentBody` | Recent 20 feedback rows with original question, image, and Zero response | `response_feedback` ⋈ `profiles(id, full_name, email)` ⋈ `question_records(id, question, ai_response, image)` on `record_id` | Accurate |

### AI Alerts (`loadAlerts`)

| DOM id | Label | Source | Status |
|---|---|---|---|
| `aiAlerts` | Threshold banners | live window aggregates | Estimated — banners use the same token/cost data as `cEstCost`, so the cost-spike banner inherits the v82 "partial token capture" caveat. All other banners (judge disagreement, OCR low-confidence, latency) compute against real fields. |

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
| `cPromptTok`, `cCompTok`, `cEstCost`, `cMonthCost` | ai-monitor | Partial token capture (v82 will complete it); list pricing |
| `mMini`, `mFull` | ai-monitor | Inferred from `verification_meta` field presence, not actual API call counts |
| `aiAlerts` (cost-spike banner only) | ai-monitor | Inherits `cEstCost` caveat |
| `bkSolver`–`bkTotal` | ai-monitor | **Not wired** until v82 |
| `phErrs`, `phFailed`, `phAvgRt`, `phP95Rt` | admin | **Not wired** — section hidden |
