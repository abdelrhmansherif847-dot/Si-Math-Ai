# Zero Personalized Study Planner — Architecture

**Status:** LIVE (Phases 1–3). Engine + adapter + persistence + chat wiring are
delivered, and the `study_plans` / `STUDY_PLAN` migration is applied and verified
in production (`igvkyxkmjnkzscqgommj`, 2026-07-21). Phase 4 (server-side
generation) stays deferred.
**Owner surfaces:** `supabase/functions/_shared/study-planner.core.js` (engine,
authored) · `study-planner.js` (generated browser copy) ·
`study-planner-client.js` (platform adapter) · `chat.html` (interface).
**RFC:** "Zero Personalized Study Planner" (product spec this document realizes).

> **Generation runs client-side (in chat.html).** The `ai-tutor` Edge Function
> cannot be deployed from this workflow (DEPLOY.md §4 / CLAUDE.md §1), so the
> planner runs in the browser: it reuses the same client-side `consume_credits`
> gate the chat already uses for every message, reads the student's data via
> RLS, runs the pure engine, and persists the plan. This matches the app's
> existing trust model. Moving generation into the Edge Function for server-side
> credit enforcement is Phase 4 (deploy-gated), not required for the MVP.

---

## 1. Overview

The Study Plan is a **personalized planning engine**, not a generic AI-generated
schedule. It converts the student's real learning history across the whole Si
Math platform into a clear, prioritized, continuously-updated plan that tells the
student exactly **what to study next, why, and in what order**.

Four hard product invariants drive the design:

1. **The primary deliverable is a 7-day execution plan.** Organized by day
   (Sunday, Monday, …), never by clock time — each day is a concrete checklist
   of exactly what to complete. Study hours and unit estimates are used *only
   internally* to balance the week; **no duration is ever shown** (no minutes on
   tasks/days, no "7:00 PM" slots). The student sees *what* to do, not *how
   long*. The long-term roadmap still exists but as a **secondary** section.
2. **Maximize score, not just fix weakness.** Ranking combines weakness
   severity, mastery, recent performance, remaining Focus work, mock mistakes,
   and tutor confusion **with an Exam-Importance weight** — how heavily the real
   SAT/EST/ACT leans on each topic. So a high-frequency weak topic (Linear
   Functions) outranks a rare one (Complex Numbers) at equal weakness. This is a
   core differentiator vs. a generic AI schedule.
3. **Never generic.** Every task and goal is derived from the student's own data.
4. **Focus Practice owns unit content and order.** The planner only decides
   *which* Focus plan and *which remaining units* come next, spreading them one
   per study day — day counts scale with each plan's remaining work — and it
   never invents a lesson sequence.

---

## 2. Engine ⁄ Interface separation (why a dedicated module)

The RFC's Implementation Note requires the planning logic to be independent and
reusable. So the logic lives in a **pure, I/O-free UMD engine** —
`study-planner.core.js` — with the exact same portability contract as
`taxonomy.core.js` and `focus-templates.js`:

```
                        ┌──────────────────────────────────────────┐
   Zero Chat  ─────────▶│  gatherStudentState(supabase, userId)     │  (adapter,
   (interface)          │    reads: weakness_reports, focus_plans,   │   per surface)
   "Create a Study      │    focus_tasks, exam_practice_sessions,    │
    Plan."              │    question_records, profiles              │
                        └───────────────────┬──────────────────────┘
                                            │ StudentLearningState (normalized)
                                            ▼
                        ┌──────────────────────────────────────────┐
                        │  StudyPlanner.buildStudyPlan(state)       │  ← PURE ENGINE
                        │    prioritize → today → week → roadmap    │    (this module,
                        │    deterministic, no DB / clock / network │     no I/O)
                        └───────────────────┬──────────────────────┘
                                            │ StudyPlan
                                            ▼
                     render in chat  ·  persist to study_plans  ·  notify
```

Because the engine is pure and deterministic (the caller passes `state.now`;
nothing inside reads the clock), the **same** module is reusable by the ai-tutor
Edge Function, a future owner/teacher dashboard, notifications, or a mobile app
— no rewrite. This mirrors the analyzer's frozen `runNow` determinism discipline.

---

## 3. Data sources → normalized `StudentLearningState`

The caller (adapter) is responsible for reading each system and normalizing it
into the shape below. Field mapping to the live schema:

| RFC source | Live table(s) | Normalized into |
|---|---|---|
| 1. Weakness Analyzer | `weakness_reports` (SSOT) | `state.weakness[]` — `masteryScore`, `severityBand`, `trend`, `recent7`, `priorityRank`, `totalSignals`, `lastUpdatedAt` |
| 2. Focus Practice | `focus_plans` + `focus_tasks` | `state.focus[]` — `{ id, title, status, dominantSignal, lessons:[{ id, title, order, status, estimatedMinutes }] }` (lessons in `order`; `estimatedMinutes` is **internal only** — used to balance days, never output) |
| 3. Mock Exams | `exam_practice_sessions` (+ mistakes) | `state.mocks[]` — `completedAt`, `score`, `avgSecondsPerQuestion`, `hadTimePressure`, `weakLessons:[{ topic, subtopic, missCount }]` |
| 4. AI Tutor History | `question_records` (aggregated) | `state.tutor.topics[]` — `askCount`, `explanationRepeats`, `deepExplains`, `lastAskedAt` |
| 5. Student Progress | `profiles` (`xp`, `rank_name`, `current_streak`) | `state.progress` / `state.student` |
| 6. Student Availability | `profiles.exam_date`, availability prefs | `state.student.availability` — `hoursPerDay`, `studyDays[]` (internal) |
| 7. Exam Importance | config/taxonomy-backed frequency table (per exam type) | `state.examImportance` — map `topic`→`0..1`. Engine ships a tunable **starter** table (`DEFAULT_EXAM_IMPORTANCE`); caller overrides win; unknown topics resolve to `0.5` (neutral) |

`normalizeState()` inside the engine is defensive: any missing field is coerced
to a safe default, so a brand-new student with almost no history still gets a
valid plan (a diagnostic first step) rather than an error.

> **Availability gap.** `hoursPerDay` and `studyDays` are not stored today. The
> interface either (a) asks the student in chat when a plan is first requested,
> or (b) reads a new `profiles.study_availability` JSON column (see §7). Until
> then the engine defaults to 1h/day, 7 days — documented, not silent.

---

## 4. Engine contract

```js
const SP = require('_shared/study-planner.core.js'); // UMD → globalThis.StudyPlanner in Deno/browser

SP.buildStudyPlan(state)                       // → StudyPlan
SP.planSignature(state)                        // → compact invalidation signature
SP.detectRegenerationTriggers(prevSig, state)  // → { shouldRegenerate, reasons[] }
SP.STUDY_PLAN_CREDIT_COST                       // → 20
SP.VERSION                                      // → 'study-planner-v1'
```

### Prioritization model (`impactScore`)

Every candidate `(topic, subtopic)` is merged across all sources and scored:

```
impact = ( severityBase                       // critical 100 / high 70 / medium 40 / low 15
         + masteryGap    = (100 − mastery)·0.5 // more to gain when mastery is low
         + trendAdj      = declining +15 · improving −10
         + confusion     = min(30, repeats·8 + deepExplains·5 + asks·1)  // repeated confusion ↑ priority
         + mockMisses    = min(30, missCount·10)                         // repeated mistakes ↑ priority
         + recency       = min(15, recent7·3)
         + focusBacklog  = min(12, remainingUnits·2) )                   // barely-started work ↑ priority
         × examProximityMultiplier(severity)   // near exam → concentrate on critical/high (triage)
         × importanceMult = 0.7 + 0.6·examImportance   // 0.7 (rare) … 1.3 (high-frequency)
```

The **importance multiplier** is the score-leverage differentiator: at equal
weakness, a topic the real exam weights heavily is ranked materially higher.
`focusBacklog` folds in remaining Focus work, and the same remaining-units count
drives **proportional day allocation** in the weekly plan (a plan with 5 unfinished
rounds occupies ~5 study days; one with a single round occupies one).

Ordering is deterministic: `impact DESC, mastery ASC, key ASC` (mirrors the
analyzer's frozen tiebreaker). Each priority carries a human-readable `reasons[]`
list ("High exam frequency — strong score leverage", "You asked Zero to re-explain
this 5×", "Missed in mock exams (3×)") that the UI surfaces as the "why", plus the
resolved `examImportance` (0..1) and `focusRemaining` count.

### Output — `StudyPlan`

- **`week` (PRIMARY)** — the 7-day execution plan:
  - `week.days[]` — 7 entries, each `{ day: 'Sunday'…, date, weekdayIndex,
    isStudyDay, tasks[] }` — **no minute/duration field**. Study days carry an
    ordered checklist: an **anchor** (the next Focus unit, e.g. `"Circle →
    Round 1"`, or the single weekly mock) followed by rotating, data-derived
    support tasks (`Solve N Practice Questions`, `Review previous mistakes`,
    `AI Tutor Review`, `Timed Practice`). Days are sized to `hoursPerDay`
    *internally*; non-study days are `Rest day`. Tasks carry no `estimatedMinutes`.
  - `week.goals[]` — measurable outcomes summary (finish plan, mastery target,
    one mock). `week.regeneratesOn` — the end-of-week re-evaluation date.
- `today` — convenience pointer to `week.days[0]` (may be a rest day).
- `priorities[]` — ranked, high-impact first, each linked to its Focus plan +
  `remainingLessons` (in Focus's own order, no durations) + `progressPct` +
  `examImportance` + `focusRemaining`.
- **`roadmap[]` (SECONDARY)** — one high-impact topic per week to the exam date
  (or a default 4-week horizon), distinct topics, consolidation weeks past the
  known set.
- `rationale[]`, `examCountdown`, `availability`, `meta` (credit cost + source
  counts + watched triggers).

Run `node scripts/validate-study-planner.mjs --demo` for a full sample — it
prints the day-by-day plan (Sunday → Saturday) and the JSON envelope.

---

## 5. Intent detection (Zero Chat as the interface)

Zero must recognize "Create a Study Plan" and invoke the engine **instead of
answering with the LLM**. `chat.html` already routes study-planning phrases out
of the math-signal pipeline (`isMathMessage()` skip-patterns include
`study plan`, `study schedule`, `plan my`). The planner intent gate reuses the
same phrase family plus explicit triggers:

```
/\b(create|make|build|generate|update|regenerate)\b.{0,20}\b(study plan|plan)\b/i
/\bمخطط\s?(مذاكرة|دراسة)\b/   // Arabic
```

On a match, the interface runs the credit gate (§6) → `gatherStudentState` →
`buildStudyPlan` → render + persist. A message that merely *asks about* an
existing plan ("what's my week 2?") is **not** a generate intent and stays in
normal chat pricing.

**As implemented (Phase 2/3, `chat.html`):** `studyPlanIntent(text)` classifies
a message as `generate` (create / make / build / generate / regenerate / update
+ "plan", or a standalone "study plan", plus Arabic `خطة مذاكرة/دراسة`), `view`
(show / see / "my current study plan" — **free**), or `null` (normal chat). The
gate sits at the top of `send()` and returns before the signal pipeline is
touched, so weakness-signal emission is unchanged (snapshot §6 compliant). To
avoid accidental 20-credit charges, loose phrases like "how should I study" do
**not** trigger generation.

---

## 6. Credits

- Creating or regenerating a plan costs **20 credits** (RFC). Single source of
  truth: `StudyPlanner.STUDY_PLAN_CREDIT_COST`.
- Enforced through the existing `consume_credits(p_feature => 'STUDY_PLAN')`
  RPC — the same atomic, `SECURITY DEFINER`, expiry-aware path the chat message
  gate uses. Requires one new `credit_costs` row (see §7).
- Follow-up questions about an existing plan are **not** charged here; they are
  ordinary `AI_CHAT_MESSAGE` turns.

---

## 7. Persistence & schema (APPLIED)

The migration `supabase/migrations/20260721_study_planner_persistence.sql` was
individually approved (CLAUDE.md §3) and applied to production on 2026-07-21,
then verified (DEPLOY.md §3: table, RLS policy, partial index, credit-cost row,
and column all confirmed present).

It adds, additively (no existing column/table altered):

- `study_plans` — latest plan per student (`user_id`, `plan_json`,
  `plan_signature`, `generated_at`, `credits_charged`, `superseded_at`). RLS:
  self-only, matching `focus_xp_log`.
- `credit_costs` seed row: `('STUDY_PLAN', 20, true)`.
- (optional) `profiles.study_availability jsonb` for `hoursPerDay` / `studyDays`.

`plan_signature` (from `SP.planSignature`) is stored so the next learning event
can call `detectRegenerationTriggers` cheaply without re-running the full engine.

---

## 8. Dynamic updates (regeneration triggers)

The plan is not static. The engine centralizes the trigger policy so callers
don't re-implement it. A caller stores `planSignature(state)` with each plan and,
on any learning event, calls `detectRegenerationTriggers(storedSig, freshState)`.
Triggers (RFC "Dynamic Updates"):

| Trigger code | Fires when |
|---|---|
| `week_elapsed` | a full week has passed since the plan was generated — the primary weekly cadence; Zero re-reads the latest data and builds a fresh 7-day plan |
| `mock_completed` | a new `exam_practice_sessions` row appears |
| `focus_completed` | more `focus_tasks` reach `DONE` |
| `weakness_updated` | `weakness_reports` regenerated (newer `last_updated`) |
| `new_major_weakness` | a new topic enters `high`/`critical` severity |
| `significant_improvement` | best mastery jumps ≥ 15 points |

`planSignature(state)` records `generatedAt`, so the week-boundary check is a
cheap timestamp comparison. When `shouldRegenerate` is true the interface can
prompt "Your plan is out of date — regenerate? (20 credits)" or, for premium
tiers, auto-refresh at week's end. Regenerate is a **new** paid generation; a
passive "your plan may be stale" banner is free.

---

## 9. Phased delivery

| Phase | Scope | Touches frozen / deploy-gated? |
|---|---|---|
| **1 — DONE** | Pure engine `study-planner.core.js` + `scripts/validate-study-planner.mjs` + this doc + proposed schema | No |
| **2 — DONE** | `gatherStudentState` + persistence adapter (`study-planner-client.js`) + generated browser copy (`study-planner.js`) + adapter tests (`validate-study-planner-client.mjs`) | No (reads/writes only) |
| **3 — DONE** | `chat.html` intent gate + credit gate + gather → engine → persist + native plan rendering | `chat.html` is **not** frozen; change is additive and does not touch the signal pipeline (snapshot §6) |
| **2b — DONE** | Applied + verified the `study_plans` table + `STUDY_PLAN` credit-cost migration (`supabase/migrations/20260721_study_planner_persistence.sql`) | Approved individually (§3), applied 2026-07-21 |
| **4** | Move engine into the `ai-tutor` bundle (`import '../_shared/study-planner.core.js'`) for server-side generation + credit enforcement | Edge Function deploy is **CLI-only** (DEPLOY.md §4) — never the inline MCP path |
| **5** | Future extensions (§11) | — |

Phases 1–3 touch zero frozen files. The migration was applied migration-first
(DEPLOY.md §2) — because the client degrades gracefully when the credit-cost row
is absent, the client assets and schema could land in either order without a
student-facing 500.

---

## 10. Compliance with session rules

- **No frozen files modified** — `regenerate-reports.js`, `taxonomy.js`,
  `exam-mistakes-logger.js`, `mock-exam.html`, `weakness.html`, `focus.html`
  are untouched. The engine is a new, additive `_shared` module.
- **Migration applied only with individual approval (§3)** — the schema change
  was presented, explicitly approved, applied, verified, and recorded in
  `supabase/migrations/`.
- **No `ai-tutor` deploy** — Phase 4 explicitly routes through the CLI path only.
- **Feature branch** — all work on `claude/zero-study-planner-rfc-0ghtli`.
- **Analyzer boundary preserved** — the planner is a pure **consumer** of
  `weakness_reports`; it writes none of the analyzer-owned derived fields.

---

## 11. Future extensions (architecture already supports)

The engine takes a normalized state and returns a plan, so these are additive:

- **Parent / Teacher plans** — same engine, a different `state.student` scope
  and a role-aware render.
- **Exam Countdown Mode** — `examProximityMultiplier` already tightens triage
  near the exam; expose it as a dedicated view.
- **Adaptive Daily Goals** — regenerate `today` on each login from fresh state.
- **Smart Rescheduling** — feed missed-day signals into `availability`.
- **Motivation & Habit Tracking** — combine `progress.streak` + XP into the
  daily render; no engine change required.
