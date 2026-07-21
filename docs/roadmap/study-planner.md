# Zero Personalized Study Planner — Architecture

**Status:** Phase 1 delivered (engine + tests + this blueprint). Phases 2–4 are
approval-gated (schema migration, chat wiring, server enforcement).
**Owner surface:** `supabase/functions/_shared/study-planner.core.js`
**RFC:** "Zero Personalized Study Planner" (product spec this document realizes).

---

## 1. Overview

The Study Plan is a **personalized planning engine**, not a generic AI-generated
schedule. It converts the student's real learning history across the whole Si
Math platform into a clear, prioritized, continuously-updated roadmap that tells
the student exactly **what to study next, why, and in what order**.

Two hard product invariants drive the design:

1. **Never generic.** Every task, goal, and roadmap week is derived from the
   student's own data (weakness, focus, mocks, tutor history, progress).
2. **Focus Practice owns lesson content and order.** The planner only decides
   *which* Focus plan and *which remaining lessons* come next — it never invents
   a lesson sequence.

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
| 2. Focus Practice | `focus_plans` + `focus_tasks` | `state.focus[]` — `{ id, title, status, dominantSignal, lessons:[{ id, title, order, status, estimatedMinutes }] }` (lessons in `order`) |
| 3. Mock Exams | `exam_practice_sessions` (+ mistakes) | `state.mocks[]` — `completedAt`, `score`, `avgSecondsPerQuestion`, `hadTimePressure`, `weakLessons:[{ topic, subtopic, missCount }]` |
| 4. AI Tutor History | `question_records` (aggregated) | `state.tutor.topics[]` — `askCount`, `explanationRepeats`, `deepExplains`, `lastAskedAt` |
| 5. Student Progress | `profiles` (`xp`, `rank_name`, `current_streak`) | `state.progress` / `state.student` |
| 6. Student Availability | `profiles.exam_date`, availability prefs | `state.student.availability` — `hoursPerDay`, `studyDays[]` |

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
         + masteryGap  = (100 − mastery)·0.5  // more to gain when mastery is low
         + trendAdj    = declining +15 · improving −10
         + confusion   = min(30, repeats·8 + deepExplains·5 + asks·1)   // RFC: repeated confusion ↑ priority
         + mockMisses  = min(30, missCount·10)                          // RFC: repeated mistakes ↑ priority
         + recency     = min(15, recent7·3) )
         × examProximityMultiplier(severity)   // near exam → concentrate on critical/high (triage)
```

Ordering is deterministic: `impact DESC, mastery ASC, key ASC` (mirrors the
analyzer's frozen tiebreaker). Each priority carries a human-readable `reasons[]`
list ("You asked Zero to re-explain this 5×", "Missed in mock exams (3×)") that
the UI surfaces as the "why".

### Output — `StudyPlan`

- `priorities[]` — ranked, high-impact first, each linked to its Focus plan +
  `remainingLessons` (in Focus's own order) + `progressPct`.
- `today` — concrete tasks that fit `hoursPerDay` (next Focus lesson → targeted
  practice → review recent mistakes; diagnostic step if the student is new).
- `week` — measurable goals (finish plan, reach mastery target, one mock).
- `roadmap[]` — one high-impact topic per week to the exam date (or a default
  4-week horizon), distinct topics, consolidation weeks past the known set.
- `rationale[]`, `examCountdown`, `availability`, `meta` (credit cost + source
  counts + watched triggers).

See `node scripts/validate-study-planner.mjs --demo` for a full sample.

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

## 7. Persistence & schema (PROPOSED — approval-gated)

Proposed DDL lives in `docs/roadmap/study-planner.schema.sql`. It is **not** a
migration yet and has **not** been applied — per `CLAUDE.md` §3 every migration
needs individual approval before `apply_migration`. On approval it moves to
`supabase/migrations/` and is applied **before** any code that reads it ships
(DEPLOY.md migration-first rule).

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
| `mock_completed` | a new `exam_practice_sessions` row appears |
| `focus_completed` | more `focus_tasks` reach `DONE` |
| `weakness_updated` | `weakness_reports` regenerated (newer `last_updated`) |
| `new_major_weakness` | a new topic enters `high`/`critical` severity |
| `significant_improvement` | best mastery jumps ≥ 15 points |

When `shouldRegenerate` is true the interface can prompt "Your plan is out of
date — regenerate? (20 credits)" or, for premium tiers, auto-refresh. Regenerate
is a **new** paid generation; a passive "your plan may be stale" banner is free.

---

## 9. Phased delivery

| Phase | Scope | Touches frozen / deploy-gated? |
|---|---|---|
| **1 — DONE** | Pure engine `study-planner.core.js` + `scripts/validate-study-planner.mjs` + this doc + proposed schema | No |
| **2** | `gatherStudentState` adapter (DB reads) + apply `study_plans` migration + `STUDY_PLAN` credit cost | Migration approval (§3) |
| **3** | `chat.html` intent gate + credit gate + render + persist | `chat.html` is **not** frozen; change is additive and must not touch the signal pipeline (snapshot §6) |
| **4** | Move engine into the `ai-tutor` bundle (`import '../_shared/study-planner.core.js'`) for server-side generation + credit enforcement | Edge Function deploy is **CLI-only** (DEPLOY.md §4) — never the inline MCP path |
| **5** | Future extensions (§11) | — |

Phase 1 is intentionally self-contained: it ships real, tested logic while
touching zero frozen files and requiring zero production deploy.

---

## 10. Compliance with session rules

- **No frozen files modified** — `regenerate-reports.js`, `taxonomy.js`,
  `exam-mistakes-logger.js`, `mock-exam.html`, `weakness.html`, `focus.html`
  are untouched. The engine is a new, additive `_shared` module.
- **No migration created or applied** — schema is a *proposal* under `docs/`;
  it is not in `supabase/migrations/` and `apply_migration` was not called.
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
