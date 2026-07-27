# Production Readiness Report

**Date:** 2026-07-27 · **Branch:** `main` · **Scope:** full-platform audit
following the four-item production audit and the Phase 2/3 fix cycles.

Detailed root-cause write-ups for every fix are in
`docs/audit/production-audit-2026-07-26.md`.

---

## 1. Overall readiness

| | |
|---|---|
| **Code readiness** | **~97%** |
| **Deployed readiness** | **~60%** |
| **Recommendation** | **Do not release yet — one blocking step remains** |

The two numbers differ for one reason only: the `ai-tutor` Edge Function
(v87, the domain guardrail) **is written, tested and merged but not deployed**,
and the deployment cannot be performed from this environment. Everything else
is release-ready.

The ~3% of code readiness that is not complete is technical debt listed in §5
and §5b, none of which is student-facing or blocking.

---

## 2. Cross-system consistency — verified

Each system was checked for whether it reads from the same source of truth as
every other surface that displays the same fact.

| System | Source of truth | Status |
|---|---|---|
| **AI Tutor** | `ai-tutor` Edge Function v87 | Consistent. Code merged, **not deployed**. |
| **Zero Personality** | `zero_knowledge_entries.slug='zero_personality'` | Consistent. Priority 1 of the prompt, byte-identical through the guardrail change. Redirects carry the same voice. |
| **Study Planner** | `_shared/study-planner.core.js` → `study-planner.js` | Consistent, and the drift gate now actually works (§3.1). Never calls `ai-tutor`. |
| **Weakness Analyzer** | `weakness_signals` → `regenerate-reports.js` → `weakness_reports` | Consistent. Mock exam count now reads `exam_practice_sessions`; every source renders under its own name. |
| **Focus Practice** | `focus_plans` / `focus_tasks`, XP via `award_focus_xp` | Consistent. Counts toward the streak. XP is atomic. |
| **Mock Exams** | `exam_practice_sessions` (row written only on submit) | Consistent. Abandoned attempts never persist; deletes drop out naturally. |
| **Credits** | `public.credit_costs` (DB) | Consistent. `credit-config.js` reads the DB; the static table is a documented pre-load fallback. Charges are server-side in `consume_credits`. |
| **XP** | `profiles.xp` | Consistent **and now race-free on all three write paths**: chat (CAS), mock exam (CAS), focus (atomic RPC). Rank ladder consolidated into `assets/ranks.js`; the frozen `mock-exam.html` copy and the SQL `rank_for_xp` are held in line by a drift test. |
| **Streak** | `assets/streak.js` → `profiles.current_streak` | Consistent. Recomputed on both Dashboard and Progress. Cairo-pinned. |
| **Progress** | `profiles` + `weakness_reports` + `mastery_records` | Consistent with Dashboard after the streak and countdown fixes. |
| **Chat History** | `question_records` (by `session_id`) | Consistent. Out-of-scope turns write no row, so they cannot appear. |
| **AI Monitor** | `profiles`, `question_records`, `response_feedback`, `system_settings` | Consistent — all downstream of `question_records`. |
| **Owner Dashboard** | `credit_transactions`, `credit_costs`, admin RPCs | Consistent. Analytics day boundaries are device-local by design (owner-facing, not student-facing). |

### Timezone policy — now coherent

| Surface | Frame | Correct? |
|---|---|---|
| Streak + heatmap | Africa/Cairo | ✅ |
| Exam countdown | Africa/Cairo | ✅ (was off by +1 every day) |
| Dashboard week strip | Africa/Cairo | ✅ (was mixing two frames) |
| History relative labels | device-local | ✅ by design — "2 days ago" is from the viewer's perspective |
| Admin / AI Monitor analytics | device-local | ✅ by design — owner-facing |
| `ai-tutor` `daysUntilExam` | UTC (server) | ✅ — both operands normalised in-frame |

---

## 3. Issues found and fixed in this final audit

### 3.1 The study-planner drift gate could never fail *(fixed)*
`validate-study-planner.mjs` imports `BANNER` from `sync-study-planner.mjs`,
which performed its write at module top level. Importing it **regenerated**
`study-planner.js` before the validator compared it — so the gate repaired the
drift it was meant to catch, then reported "in sync". Proven by injecting a
line and watching the validator silently remove it and pass.

`study-planner.js` ships to the browser, so engine/browser divergence could
have reached production with CI green. Fixed with a direct-invocation guard;
the gate now exits 1 on drift and leaves the drift in place.

### 3.2 Dashboard week strip mixed two timezone frames *(fixed)*
Built from a device-local midnight while each cell was labelled with a Cairo
day key. On a device far from Cairo the strip could shift a day and "today"
could land on the wrong cell. Now derived entirely from the Cairo key; verified
byte-identical across Cairo, Los Angeles, Kiritimati (UTC+14), Tokyo and UTC.

### 3.3 Profile stats would have frozen at 1000 *(fixed)*
`profile.html` counted `question_records` and `exam_practice_sessions` by
fetching every row and taking `.length`. PostgREST caps result sets at 1000, so
"Questions Solved" would silently stop moving. **The heaviest active student is
at 722 — 72% of the way there.** Now counted server-side with
`{ count: 'exact', head: true }`, which also stops shipping the rows.

### Audited, no defect found
- **Dead / unreachable code** — none remaining (the two found earlier are gone).
- **`deviceGuard()`** — all 8 copies verified logically identical; no drift.
- **HTML-escape helpers** — the two that omit `"` are used only in text
  contexts, never inside an attribute, so there is no XSS exposure.
- **Duplicate constants** — rank thresholds were identical across all 5
  implementations; three have since been consolidated (§5). Credit costs have
  documented DB precedence.
- **Duplicate implementations** — `taxonomy` and `study-planner` copies are
  generated and gated; verified byte-identical modulo their banners.
- **Race conditions** — all XP paths now atomic; credit mutations are
  server-side RPCs; remaining `profiles` writes are field writes, not
  read-modify-write counters.
- **Duplicated queries** — two redundant ones removed (Progress 500-row
  `chat_sessions`, Dashboard 14-day `question_records`).

---

## 4. Remaining known issues

| # | Issue | Severity | Why not fixed |
|---|---|---|---|
| 1 | **`ai-tutor` v87 not deployed** | **Blocking** | No `SUPABASE_ACCESS_TOKEN`. See §6. |
| 2 | `progress.html` distinct-topic count reads at most 1000 `question_records` rows | Low | The *count* is server-side and correct; only "topics studied" could undercount above 1000 rows. A correct fix needs a `DISTINCT` RPC, i.e. a migration — which requires separate approval. |
| 3 | `worksheet_guard` charges 5 credits for a zero-token refusal | Low | Pre-existing; owner deferred it as an independent product decision. |
| 4 | `focus.html` has a dead `daysUntilExam` variable | Cosmetic | Assigned, never read. No user impact; file is frozen. |

---

## 5. Duplication pass — consolidated and remaining

A dedicated pass was made for duplicated business logic. Behaviour was not
changed anywhere; every consolidation is covered by an equivalence test.

### Consolidated

| Duplicate | Before | After |
|---|---|---|
| **Rank ladder** | 4 hand-authored JS tables + SQL | `assets/ranks.js` is the single client source. `chat.html`, `progress.html`, `profile.html` consume it. Equivalence asserted against the removed implementations across every boundary value (`tests/ranks.test.mjs`). |
| **Exam countdown** | 4 divergent implementations | `assets/exam-days.js` (done in Phase 2). |
| **Streak** | recomputed only on the dashboard | `assets/streak.js`, consumed by dashboard and progress (Phase 2). |
| **Heatmap day-set** | rebuilt independently | Reuses the set `updateStreak()` returns (Phase 2). |

### Remaining, with reasons

| Duplicate | Copies | Why it remains |
|---|---|---|
| **Rank table in `mock-exam.html`** | 1 | **Frozen file.** Guarded by `tests/constants-drift.test.mjs`, which fails if it diverges from `assets/ranks.js`. Fold in when the freeze lifts. |
| **`rank_for_xp()` in SQL** | 1 | Intentional — it is authoritative for server-side writes and cannot import a browser module. Guarded by the same drift test. |
| **`deviceGuard()`** | 8 pages | Verified **logically identical** across all eight (normalised comparison — the differing hashes were indentation and comments only), so there is no drift today. Consolidating requires editing `weakness.html` and `focus.html`, which are **frozen**. |
| **XP compare-and-set block** | 2 | `chat.html` and `mock-exam.html`. The latter is **frozen**. The two also differ deliberately on failure — chat `return`s, mock-exam `break`s so the exam save still completes — so a shared helper would need a parameter for that. Both covered by `tests/xp-concurrency.test.mjs`. |
| **HTML-escape helpers** | ~14 | Deliberately **not** consolidated. They escape different character sets, and each is correct for its own call sites: the two that omit `"` are used only in text contexts, never inside an attribute (verified). Unifying them would change output in fourteen files for no behavioural gain, days before a release. |
| **`STUDY_PLAN_CREDIT_COST`** | 1 + DB | A last-resort fallback; `studyPlanCost()` already prefers the DB value. |
| **`credit-config.js` static costs** | 1 + DB | Documented pre-load fallback; the DB is authoritative once loaded. |

## 5b. Remaining technical debt

- **No `package.json`.** The test suites are deliberately dependency-free, but
  there is no dependency manifest or lockfile for the repo as a whole.
- **`progress.html` distinct-topic count** reads at most 1000 `question_records`
  rows. The count itself is server-side and correct; only "topics studied"
  could undercount above 1000 rows. A correct fix needs a `DISTINCT` RPC, i.e.
  a migration requiring separate approval.
- **`validate-study-planner.mjs` still imports from the sync script.** The
  write is now guarded, so it is safe, but the coupling is fragile enough that
  it produced a silent gate failure once already.

## 6. Blocked by deployment

**One item, and it blocks release.**

`supabase/functions/ai-tutor/index.ts` is at **v87** in `main`. Production is
still running the build deployed **2026-07-19** — i.e. without the domain
guardrail. Until it is deployed:

- Zero has **no domain restriction** in production and will still answer
  politics, programming, medical and legal questions.
- The client-side refund for blocked turns is inert (`scope_guard` is absent
  from v86 responses) — harmless, but the credit refund does not apply either.

Deploy is **Path B only** (`DEPLOY.md` §4 — the function imports `_shared/`, so
the Dashboard copy-paste path would ship a broken bundle):

```bash
supabase functions deploy ai-tutor --project-ref igvkyxkmjnkzscqgommj

SUPABASE_PROJECT_REF=igvkyxkmjnkzscqgommj \
SUPABASE_ANON_KEY=... SUPABASE_TEST_JWT=... \
SUPABASE_DB_URL=... SUPABASE_TEST_USER_ID=... \
  ./scripts/verify-scope-guardrail.sh
```

The verifier covers all seven acceptance scenarios plus the persistence,
chat-history and credit-policy proofs. **Exit 1 means not verified.**

---

## 7. Frozen items

| File | State |
|---|---|
| `weakness.html` | **Frozen.** Repaired 2026-07-27 under explicit unfreeze, then re-frozen. |
| `mock-exam.html` | **Frozen.** Repaired 2026-07-27 under explicit unfreeze, then re-frozen. |
| `regenerate-reports.js` | **Frozen.** Never unfrozen, unchanged. |
| `taxonomy.js` | **Frozen.** Never unfrozen, unchanged (generated from `taxonomy.core.js`). |
| `exam-mistakes-logger.js` | **Frozen.** Never unfrozen, unchanged. |
| `focus.html` | **Frozen.** Never unfrozen, unchanged. |

No further changes to any of these without an explicit new unfreeze.

---

## 8. Recommendation

**Hold the release until `ai-tutor` v87 is deployed and
`scripts/verify-scope-guardrail.sh` passes.**

Everything else is release-ready. The client-side work — streak, exam
countdown, XP, History, Progress, Profile stats, Weakness Analyzer — is merged,
regression-tested and safe to ship independently of the Edge Function; none of
it depends on v87, and the one piece that references it degrades to a no-op.

Once the guardrail is deployed and verified, the platform is ready for release.

**Ship order:**
1. Client assets (already in `main`) — safe now.
2. `ai-tutor` v87 via Path B.
3. Run `verify-scope-guardrail.sh`; all seven scenarios must pass.
4. `DEPLOY.md` §8 — watch Edge Function logs for 30 minutes.

No migration is required for any change in this cycle.
