# AI Economics · Phase 3 — Post-Deployment Report

> ## ⬜ TEMPLATE — NOT YET EXECUTED
>
> **`ai-tutor` is at v89 / platform version 126. `ai_model_calls` is empty.**
>
> Every result field below is **intentionally blank**. Nothing in this document
> may be filled from expectation, from the runbook's "expected" column, or from
> a previous run. A field is completed only from an observed value — the output
> of a query, a log line, or a screen the operator actually looked at.
>
> If a step was not performed, the honest entry is **NOT RUN**, not a guess.

| | |
|---|---|
| **Phase** | 3 — AI Telemetry |
| **Deploying** | `ai-tutor` v89 → v90 |
| **Runbook** | `docs/roadmap/phase-3-deployment-runbook.md` |
| **Data collection** | `scripts/phase3-postdeploy-report.sql` — validated against production 2026-07-28 |
| **Window date** | ⬜ _______________ |
| **Operator** | ⬜ _______________ |
| **Reviewer** | Claude (checkpoint validation and interpretation) |
| **Report status** | ⬜ DRAFT / ⬜ COMPLETE |

---

## 0 · How this report gets filled

| Who | Does what |
|---|---|
| **Operator** | Runs the runbook. Reports each checkpoint result — pass/fail, plus the actual output seen. Performs the browser steps (V2) that cannot be automated |
| **Reviewer (Claude)** | Runs the read-only verification SQL, interprets every result against its pass condition, rules GO or NO-GO at each checkpoint, and writes §7's recommendation |

**One rule governs the whole document:** a checkpoint is PASS only when an
observed value satisfies its stated condition. "It looked fine" is not a
result. If a value cannot be obtained, the entry is **UNKNOWN** and the
checkpoint cannot be PASS.

---

## 1 · Deployment summary

| Item | Planned | Actual |
|---|---|---|
| Window start (UTC) | ⬜ | ⬜ |
| Window end (UTC) | ⬜ | ⬜ |
| Active duration | 45–60 min | ⬜ |
| Deploy path | DEPLOY.md §4 Path B (CLI) | ⬜ |
| Deploy command | `supabase functions deploy ai-tutor --project-ref igvkyxkmjnkzscqgommj` | ⬜ |
| `index.ts` sha256 verified | `6497f0d7…cacbcb` | ⬜ |
| `_shared/taxonomy.core.js` sha256 verified | `de016d1c…e220a3b8` | ⬜ |
| Platform version before | 126 | ⬜ |
| Platform version after | 127 | ⬜ |
| Code header after | `// ai-tutor Edge Function v90` | ⬜ |
| Bundle file count | **2** | ⬜ |
| Database changes | **none** (applied 2026-07-28) | ⬜ |
| Rollbacks performed | none expected | ⬜ |
| Outcome | — | ⬜ SUCCESS / ⬜ ROLLED BACK / ⬜ PARTIAL |

**Narrative** — what actually happened, in a few sentences. Include anything
surprising, even if harmless.

> ⬜ _______________________________________________________________________

---

## 2 · Checkpoint log

Record the observed result for every step. `—` means not applicable.

### Pre-flight

| Step | Check | Expected | Actual | Verdict |
|---|---|---|---|---|
| P0 | Artifact hashes match | both match | ⬜ | ⬜ |
| P1 | `node tests/run-all.mjs` | `18/18 green` | ⬜ | ⬜ |
| P2 | `validate-ai-tutor-source.sh` | PASS, 227383 bytes, v90 | ⬜ | ⬜ |
| P3 | Both bundle files present | both listed | ⬜ | ⬜ |
| P4 | DB pre-state verification | structural PASS, P3-07 WARN | ⬜ | ⬜ |
| P5 | Latency baseline recorded | values written down | ⬜ | ⬜ |
| P6 | Platform version noted | 126 | ⬜ | ⬜ |

### 🚦 GO / NO-GO 1 — proceed to deploy?  ⬜ GO / ⬜ NO-GO

> Reviewer note: ⬜ ___________________________________________________

### Deploy

| Step | Check | Expected | Actual | Verdict |
|---|---|---|---|---|
| D1 | CLI deploy | `Deployed Function ai-tutor` | ⬜ | ⬜ |
| D2 | Platform version | 127 | ⬜ | ⬜ |
| D2 | Code header | `v90` | ⬜ | ⬜ |
| D3 | Bundle lists **two** files | `index.ts` + `_shared/taxonomy.core.js` | ⬜ | ⬜ |

### 🚦 GO / NO-GO 2 — THE CRITICAL CHECKPOINT  ⬜ GO / ⬜ NO-GO

**A one-file bundle is the cold-start 500 class. If D3 shows one file, redeploy
immediately — do not proceed.**

> Reviewer note: ⬜ ___________________________________________________

### Immediate verification

| Step | Check | Expected | Actual | Verdict |
|---|---|---|---|---|
| V1 | Smoke test | heartbeat 401 PASS; version v90 if JWT set | ⬜ | ⬜ |
| V2.1 | Text question | normal answer | ⬜ | ⬜ |
| V2.2 | Image question | normal answer | ⬜ | ⬜ |
| V2.3 | Unclear-digit image | normal answer | ⬜ | ⬜ |
| V2.4 | Follow-up "explain again" | normal answer | ⬜ | ⬜ |
| V2.5 | **Repeat verbatim** | normal answer, **0 new rows** | ⬜ | ⬜ |
| V3 | Telemetry landed | rows across services, tokens non-zero | ⬜ | ⬜ |
| V4 | Negative control | 0 rows for the repeat | ⬜ | ⬜ |
| V5 | Full 20-check verification | all PASS | ⬜ | ⬜ |
| V6 | Log scan, 15 min | no telemetry errors, no 5xx | ⬜ | ⬜ |

### 🚦 GO / NO-GO 3 — release to student traffic?  ⬜ GO / ⬜ NO-GO

> Reviewer note: ⬜ ___________________________________________________

---

## 3 · Verification results

Source: `scripts/phase3-postdeploy-report.sql` (sections R0–R12) and
`scripts/verify-ai-telemetry.sql` (20 checks). Both are read-only.

### 3.1 The eight required verifications

| # | Verification | Query | Pass condition | Result | Verdict |
|---|---|---|---|---|---|
| 1 | Successful telemetry insertion | R1 | rows > 0 | ⬜ | ⬜ |
| 2 | No duplicate `call_uid` | R2 | **exactly 0** | ⬜ | ⬜ |
| 3 | 100% service resolution | R3 / R3b | every group in catalog **and** bound | ⬜ | ⬜ |
| 4 | `started_at` / `created_at` | R4 | missing = 0, impossible = 0 | ⬜ | ⬜ |
| 5 | No latency increase | §5 | no request > 30 s; no gross median regression | ⬜ | ⬜ |
| 6 | No tutoring-failure increase | R11 | **empty answers = 0**; no function 5xx | ⬜ | ⬜ |
| 7 | Completeness by service | R6 | `with_tokens` = `ok` on every row | ⬜ | ⬜ |
| 8 | First-day reconciliation | R10 | coverage ≥ 95% | ⬜ | ⬜ |

### 3.2 Supporting checks

| Check | Query | Pass condition | Result | Verdict |
|---|---|---|---|---|
| Units reconcile with mirrors | R5 | 0 unreconciled rows | ⬜ | ⬜ |
| `client_request_id` completeness | R8b | 0 partial requests | ⬜ | ⬜ |
| Fan-out sanity | R9b | 0 requests > 10 calls | ⬜ | ⬜ |
| Attribution rate | R8 | majority carry a question id | ⬜ | ⬜ |
| Failure capture (GAP-7) | R7 | informational | ⬜ | ⬜ |

### 3.3 Full verification script

`scripts/verify-ai-telemetry.sql` — paste the result table.

> ⬜
> ```
>
> ```

---

## 4 · Telemetry coverage

### 4.1 By service (R6) — never report this as a single aggregate

66% of calls and 71% of expensive `gpt-4o` calls flush **after** the student's
response, in the sink most exposed to loss. An aggregate figure would hide loss
exactly where the money is.

| service_code | stage | model | calls | ok | failed | with_tokens | prompt_tok | completion_tok | avg ms |
|---|---|---|---|---|---|---|---|---|---|
| `tutor` | tutor_main | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `reference_resolver` | resolve | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `vision` | question_detect | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `ocr` | extract | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `ocr` | rerun | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `solver` | solver_a | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `solver` | solver_b | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `judge` | verdict | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `difficulty_detector` | classify | — | **0 expected** | — | — | — | — | — | — |

> **`difficulty_detector` emitting nothing is expected, not a gap.** Detector v2
> has not fired once in 30 days — it requires `DIFFICULTY_DETECTOR_V2_ENABLED`
> *and* a v1 `default_medium` classification. The reconciliation accounts for
> this correctly, because `v2_ran` is false for those questions.

### 4.2 Reconciliation (R10)

| Metric | Value |
|---|---|
| Questions since deploy | ⬜ |
| Expected calls (oracle) | ⬜ |
| Actual calls recorded | ⬜ |
| **Coverage %** | ⬜ |
| Verdict | ⬜ PASS ≥95 / ⬜ INVESTIGATE 80–95 / ⬜ FAIL <80 |

Reference: the same oracle over the 30 days before v90 predicts **1,983 calls
across 404 questions**, so its arithmetic is already validated against
production.

**If coverage < 95%, where did the shortfall land?** (R10b, per service)

> ⬜ _______________________________________________________________________

### 4.3 Volume gate (R12)

| Condition | Required | Actual | Met |
|---|---|---|---|
| Hours since deploy | ≥ 48 | ⬜ | ⬜ |
| Student questions since deploy | ≥ 20 | ⬜ | ⬜ |

**Both must hold.** At ~4 questions/day this may take ~5 days. Declaring success
on the clock alone would be declaring it on no evidence. The seeded exercise is
operator traffic and does **not** count toward the 20.

---

## 5 · Performance observations

### 5.1 Student-visible latency

**Method is structural, not statistical**, and this is a deliberate limitation
recorded before deployment (readiness review §7.5). The pre-deploy sample was
four requests; the post-deploy sample will be similarly small. A statistical
comparison is not possible and must not be claimed.

| | Pre-deploy (v89, platform 126) | Post-deploy (v90, platform 127) |
|---|---|---|
| Samples | 4 | ⬜ |
| Values (ms) | 10,952 · 8,352 · 2,774 · 4,723 | ⬜ |
| Median (ms) | ~6,500 | ⬜ |
| Max (ms) | 10,952 | ⬜ |

**Pass conditions:**
- No successful request exceeds **30,000 ms** → ⬜
- Post-deploy median not grossly above ~2× pre-deploy (~13,000 ms) → ⬜

**Structural assurance** (the primary basis): no telemetry work is awaited on
the response path. The handler's flush creates a promise, hands it to
`EdgeRuntime.waitUntil`, and returns. Verified by code reading, not sampling.

### 5.2 Telemetry write latency

| Metric | Value |
|---|---|
| Median write skew, main-path rows (R4b) | ⬜ |
| Median write skew, background rows (R4b) | ⬜ |
| Max skew | ⬜ |

Expect near-zero on main-path rows and several seconds on background rows.
**That divergence is why `started_at` exists (F2)** — it is the expected shape,
not a defect.

### 5.3 Tutoring health (R11)

| Metric | Baseline (30 d pre-deploy) | Since deploy | Verdict |
|---|---|---|---|
| Questions | 404 | ⬜ | — |
| Empty answers | **0 (0.000%)** | ⬜ | ⬜ |
| Upstream errors | 41 total, but **0 on comparable low-volume days** | ⬜ | ⬜ |
| Function 5xx | 0 | ⬜ | ⬜ |

> The 30-day upstream error rate of 10.15% is **not** a threshold. Those errors
> cluster entirely on burst days (18/65 on 07-14, 10/26 on 07-09, 11/130 on
> 07-18). Compare against comparable-volume days, and treat any *new* error
> signature as the real signal.

---

## 6 · Incidents and rollbacks

⬜ **None.** / ⬜ Incidents recorded below.

| # | Time (UTC) | What was observed | Trigger matched | Action taken | Level | Resolved |
|---|---|---|---|---|---|---|
| 1 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

**Rollback levels, for reference:**

| Level | Action | Effect |
|---|---|---|
| 1 | `AI_MODEL_TELEMETRY_ENABLED=false` | Telemetry stops in seconds, no deploy, rows preserved |
| 2 | Redeploy v89 from `20be116` (hash `388f683b…35d14b`) | Full behavioural revert |
| 3 | `DROP TABLE public.ai_model_calls` | Schema removal; safe only before Phase 4 |

If any incident occurred, record **why the documented procedure was followed**,
or — if it was not — exactly what was done instead and why. An ad-hoc fix during
a window is itself a finding worth recording.

---

## 7 · Open issues

### 7.1 Known before deployment — carried forward, not defects

| # | Item | Status |
|---|---|---|
| **F4** | Provider-invoice reconciliation — monthly comparison of summed tokens against OpenAI's billed totals. Owner-adopted as standing governance **after Phase 4** | 📌 Scheduled |
| **F7** | Two sinks share the name `teleSink` in separate scopes. Cosmetic; correct today | 📌 Open, cosmetic |
| — | `difficulty_detector` emits nothing (detector v2 dormant) | Expected |
| — | The upsert path is unexercised until the first real write | Resolved by this deployment → ⬜ |
| — | First 48 h of data treated as provisional | ⬜ Resolved at volume gate |

### 7.2 New issues found during deployment

⬜ **None.** / ⬜ Listed below.

| # | Issue | Severity | Impact on Phase 4 | Action |
|---|---|---|---|---|
| 1 | ⬜ | ⬜ | ⬜ | ⬜ |

---

## 8 · Final recommendation

### 8.1 Success criteria

| # | Criterion | Met |
|---|---|---|
| S1 | Platform version 127, header v90, bundle = 2 files | ⬜ |
| S2 | Smoke test passed | ⬜ |
| S3 | Telemetry rows present, spread across services | ⬜ |
| S4 | 0 duplicate `call_uid` | ⬜ |
| S5 | 100% service resolution | ⬜ |
| S6 | 0 missing / 0 impossible `started_at` | ⬜ |
| S7 | Every successful row has tokens; units reconcile | ⬜ |
| S8 | Repeat question produced 0 new rows | ⬜ |
| S9 | 0 empty answers; no function 5xx | ⬜ |
| S10 | No request > 30 s; no gross median regression | ⬜ |
| S11 | No `model-call-telemetry-error` / `-lost` | ⬜ |
| S12 | Reconciliation coverage ≥ 95% | ⬜ |
| **Gate** | ≥ 48 h **and** ≥ 20 student questions | ⬜ |

### 8.2 Recommendation

⬜ **CLOSE PHASE 3** — all criteria met, volume gate satisfied. Phase 4 (Cost
Engine) is unblocked.

⬜ **EXTEND MONITORING** — no failures, but the volume gate is not yet met.
Re-run §3 and §4 at: ⬜ _____________

⬜ **DO NOT CLOSE** — one or more criteria failed. Detail:
> ⬜ _______________________________________________________________________

**Reviewer statement:**
> ⬜ _______________________________________________________________________

**Owner approval:** ⬜ Approved ______________  Date ______________

---

## 9 · Reviewer decision matrix

How each result will be ruled, fixed in advance so interpretation cannot drift
under time pressure.

| Observation | Ruling | Action |
|---|---|---|
| Bundle shows 1 file | **NO-GO 2** | Redeploy via Path B immediately |
| Platform version ≠ 127 or header ≠ v90 | **NO-GO 2** | Re-check hashes, redeploy |
| Smoke heartbeat 5xx/000 | **NO-GO** | 🔴 Rollback Level 2 |
| Any student-visible error or empty answer | **NO-GO** | 🔴 Rollback Level 2 |
| Successful request > 30 s | **NO-GO** | 🔴 Rollback Level 2 |
| Successful rows with 0 tokens | **NO-GO** | 🟠 Level 1, investigate |
| Duplicate `call_uid` | **NO-GO** | 🟠 Level 1 — constraint or emitter defect |
| Rows on the idempotency-hit path | **NO-GO** | 🟠 Level 1 — spend is being invented |
| Repeated `model-call-telemetry-lost` | **NO-GO** | 🟠 Level 1 |
| Unregistered service code | **INVESTIGATE** | No rollback; add the catalog row |
| Coverage 80–95% | **INVESTIGATE** | No rollback; locate the shortfall per service before Phase 4 |
| Coverage < 80% | **DO NOT CLOSE** | No rollback; diagnose before Phase 4 |
| `difficulty_detector` absent | **PASS** | Expected — not a gap |
| Skew of seconds on background rows | **PASS** | Expected — this is why F2 exists |
| Volume gate unmet, nothing failing | **EXTEND** | Keep monitoring; do not declare success |

**The standing rule:** on any failure, execute the documented rollback first and
diagnose afterwards. No ad-hoc fixes during the window.
