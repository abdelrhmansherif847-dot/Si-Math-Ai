# P2 — DSAT Module State Machine: investigation and design

**Status:** ✅ **IMPLEMENTED.** P2 shipped — `987ce21` separated "module ended"
from "exam ended", `9820c24` closed the phase as adaptive-ready-but-not-adaptively-routed,
and `mock-exam.html`'s `finishCurrentModule()` carries the routing;
`tests/exam-timer-modules.test.mjs` covers it (102 checks).

This line read *"DESIGN — no code written. Awaiting review"* until 2026-08-25,
while its own companion `mock-exam-v2-p2-adaptive-proposal.md` said "P2 is
closed" — two documents in one roadmap disagreeing about whether the phase had
happened. The design below is kept as written.
**Date:** 2026-08-23 · **Depends on:** P1 (complete), M1 (applied, unrelated)
**Database changes: NONE.** P2 needs no migration.

---

## 1. What the timer actually is today

Measured against `mock-exam.html` at `f965d99`, not recalled.

### 1.1 The view machine

`s.view ∈ {SELECT, TIMER, RESULTS, MISTAKES, SAVING, SUCCESS}`, dispatched by
`render()` into one `<div id="pageContent">`. There is no framework: each view is
an `html*()` returning a template string plus an `after*()` that binds listeners.

### 1.2 The four guarantees that must survive P2

These are deliberate fixes (ME-P1, ME-P3a, ME-P3b), not incidental behaviour:

1. **Persistence.** `saveTimerState()` writes `simath_mock_timer` on every tick:
   `{examCode, timerTotal, timerSec, startedAt, practiceQuestions, savedAt,
   timerRunning, pausedAt}`. 24-hour expiry. On restore, a *running* clock has
   real elapsed wall-time subtracted so a student cannot bank time by closing the
   tab; a *paused* clock is frozen exactly.
2. **Multi-tab ownership.** `simath_mock_active_tab` holds `{tabId, examCode,
   lastBeat}`, heartbeat every 2 s, `TAB_STALE_MS = 15000`. A second tab finding
   a live owner offers "Take Over Here". A `storage` event pauses the losing tab
   and shows a "Take Back" banner. `beforeunload` releases ownership.
3. **Pause/resume** with wall-clock `pausedAt`, and a "Paused Exam Found" restore
   dialog.
4. **Idempotent save** — `ensureIdempotencyKey()` plus the 23505 recovery path in
   `doSave()` that adopts the winning row and skips every downstream side effect,
   and the XP compare-and-set loop.

### 1.3 The exact end-of-exam sequence, which P2 has to split apart

`tickTimer()` at zero does **five** things in one place:

```js
s.timerRunning = false;  s.pausedAt = null;
clearInterval(s.timerInterval);
stopHeartbeat();          // ME-P3b
releaseActiveTab();       // ME-P3b
clearTimerState();
setTimeout(() => { s.endedAt = …; s.view = 'RESULTS'; render(); }, 900);
```

`btnEnd` ("End Exam") does the same minus the clock-expiry path.

**Every one of those five is correct for the END OF AN EXAM and wrong for the end
of a module.** Releasing tab ownership, clearing persisted state, and stamping
`endedAt` at a module boundary would respectively: let another tab silently steal
the session, lose the whole exam on a refresh during the transition, and record a
finish time 35 minutes early. Separating "module ended" from "exam ended" is the
substance of P2, far more than adding a screen.

### 1.4 What the save flow reads

`doSave()` uses `s.exam.code` → `exam_type`, `s.startedAt`, `s.endedAt`, and:

```js
duration_minutes: Math.round(s.timerTotal / 60)
```

**This is a live data-corruption hazard the moment modules exist.** With
`timerTotal` meaning "the current module", a completed full DSAT would record
**35** minutes instead of 70, silently, into `exam_practice_sessions`. §4.3
addresses it.

---

## 2. Proposed state model — minimal

Two new pieces of state and one new view. Nothing else.

```js
s.modulePlan    // [{ordinal, label, questions, durationSec}] — frozen at start
s.moduleOrdinal // 1-based, which module is running
```

`s.timerTotal` / `s.timerSec` keep their exact current meaning — the clock of
whatever is running now. For a single-module exam that is the whole exam, so
**their meaning is unchanged for every non-DSAT exam.**

New view: **`TRANSITION`**.

> Deliberately *not* called `BREAK`. The Digital SAT's 10-minute break sits
> between Reading/Writing and Math — there is **no scheduled break between Math
> Module 1 and Module 2**, which advance directly. Calling this a break would
> teach students an exam structure that does not exist. It is a boundary screen,
> not a rest period.

### Transitions

```
SELECT ──start──▶ TIMER(m=1)                       [startedAt stamped ONCE here]
                     │
     time expires OR "End Module"
                     │
            ┌────────┴────────┐
      isLast(m)?          not last?
            │                 │
            ▼                 ▼
        RESULTS          TRANSITION(m → m+1)
   [endedAt stamped]           │
   [clearTimerState]     "Begin Module m+1"
   [releaseActiveTab]           │
                                ▼
                          TIMER(m+1)  [fresh clock]

RESULTS ─▶ MISTAKES ─▶ SAVING ─▶ SUCCESS      (entirely unchanged)
```

### Five invariants

1. **`endedAt` is stamped only on the terminal transition to RESULTS.** Never at
   a module boundary.
2. **`clearTimerState()` and `releaseActiveTab()` run only on the terminal
   transition.** A module boundary keeps both, so a refresh mid-transition
   resumes correctly and no sibling tab can steal the session.
3. **No timer leakage.** Each module begins at `timerSec = durationSec` from the
   plan. Time unused in module 1 is discarded, matching test day — finishing
   early does not buy time later.
4. **`startedAt` is stamped once**, at module 1's start.
5. **`plan.length === 1` takes today's code path exactly.** Every non-DSAT exam,
   including PRACTICE, is byte-for-byte unchanged in behaviour.

Invariant 5 is the one to hold the implementation to: the module machinery must
be a *superset*, reachable only when a plan has more than one entry.

---

## 3. Persistence strategy

### 3.1 Blob v2

`simath_mock_timer` gains three fields and a version:

```js
{
  v: 2,                       // absent on every blob written before P2
  examCode, timerTotal, timerSec, startedAt, practiceQuestions,
  savedAt, timerRunning, pausedAt,          // unchanged
  modulePlan: [{ordinal,label,questions,durationSec}, …],
  moduleOrdinal: 1,
  phase: 'MODULE' | 'TRANSITION'
}
```

Storing the **plan itself** rather than only an index makes the blob
self-describing: restore does not have to re-derive structure from the registry
and cannot disagree with it if the registry later changes.

### 3.2 The in-flight-student problem, and the rule for it

A student mid-exam when P2 deploys holds a **v1 blob with no plan**. The rule:

> **A legacy blob finishes under the rules it started under.**

On restore, a blob without `v` synthesises a single-module plan from its own
`timerTotal` — so a student who began a 70-minute Full SAT keeps their
70-minute session and is never teleported into a two-module structure that did
not exist when they started. No retro-fitting.

### 3.3 One extra thing that must be persisted

`saveTimerState()` currently early-returns unless `s.view === 'TIMER'`. It must
also persist during `TRANSITION`, or a refresh on the boundary screen loses the
exam. This is the single most likely bug in the whole phase and is called out
here so the implementation cannot forget it.

### 3.4 Restore behaviour

| Saved phase | Restore |
|---|---|
| `MODULE`, running | Absorb wall-clock drift into the **current module's** remaining — the existing formula, unchanged |
| `MODULE`, paused | Frozen exactly; existing "Paused Exam Found" dialog, unchanged |
| `TRANSITION` | No clock is running, so no drift to absorb — restore straight to the boundary screen |
| legacy (no `v`) | Synthesise a one-module plan; behaves exactly as today |

### 3.5 Multi-tab

**No change to the ownership protocol.** It keys on `examCode`, which does not
change across modules, so take-over, the heartbeat, the storage event and
`beforeunload` all keep working untouched.

One cosmetic addition: the take-over prompt currently says *"your Full SAT Math
(12:34 remaining)"*. With modules that should read *"Module 2 of 2, 12:34
remaining"*, since 12:34 is now module-scoped and would otherwise be read as the
whole exam.

One known small gap, recorded rather than fixed: the `storage` handler returns
early unless `s.view === 'TIMER'`, so a sibling claiming ownership while this tab
sits on the TRANSITION screen shows no banner. Nothing is lost — no clock is
running to pause — and the next module start re-claims ownership. Not worth
complicating the handler for.

---

## 4. Exactly what changes

### 4.1 `exam-registry.js` — the decisions, as pure functions

The state machine's *logic* goes here, not into the page, so it can be unit
tested without a DOM. This is the same split that made P1 safe.

```
buildModulePlan(code, practiceQuestions) → [{ordinal,label,questions,durationSec}]
moduleAt(plan, ordinal)                  → module | null
isLastModule(plan, ordinal)              → boolean
restoreModulePlan(savedBlob, cfg)        → {plan, ordinal, phase}   // legacy-aware
```

`buildModulePlan` returns a one-entry plan for every fixed single-module exam and
for PRACTICE (whose single module is `practiceDurationMinutes(q)` long), and a
two-entry plan for `SAT_FULL`. The registry already carries the module data from
P1 — this only exposes it in the shape the timer wants.

### 4.2 `mock-exam.html` — wiring only

| Site | Change |
|---|---|
| exam start | build the plan, set `moduleOrdinal = 1`, clock from module 1 |
| `tickTimer()` at zero | route to TRANSITION or RESULTS; move the four terminal side effects into the RESULTS branch only |
| `btnEnd` | same routing; label becomes "End Module" when not last |
| `saveTimerState()` | persist `v/modulePlan/moduleOrdinal/phase`; allow the TRANSITION view |
| `restoreTimerState()` | read them; synthesise for legacy blobs |
| `render()` | one new case: `TRANSITION` |
| `htmlTimer()` | show "Module 1 of 2"; `qCount` from the **module** (22), not the exam (44) |
| new `htmlTransition()` / `afterTransition()` | the boundary screen + "Begin Module 2" |
| `VIEW_STEP` | map `TRANSITION` to the same step as `TIMER` so the progress dots do not jump |
| `doSave()` | **one line** — see §4.3 |

### 4.3 The one save-pipeline change, and why it is genuinely required

```js
- duration_minutes: Math.round(s.timerTotal / 60)
+ duration_minutes: window.SiExamRegistry.totalDurationMinutes(s.exam.code)
+                     ?? Math.round(s.timerTotal / 60)
```

| Exam | Today | Naive module change | With this fix |
|---|---|---|---|
| `SAT_FULL` | 70 | **35 — wrong** | **70** ✅ |
| single-module | 35/50/60/75 | same | **identical** ✅ |
| `PRACTICE` | computed | computed | registry returns null → **identical fallback** ✅ |

Without it, every completed full DSAT would silently record half its duration.
Nothing else in the save pipeline is touched: `exam_type` stays `s.exam.code`
(`SAT_FULL`, not a per-module code), and the mistakes → `ExamMistakesLogger` →
`weakness_signals` → `MasteryEngine` → `regenerateWeaknessReports` chain is not
modified in any way. **The Weakness Analyzer boundary is not approached, let
alone crossed** — the Mock Exam still emits one session plus mistakes and nothing
else, and still determines no weakness itself.

### 4.4 Tests

* `tests/exam-registry.test.mjs` — extend for the new pure functions.
* `tests/exam-timer-modules.test.mjs` — **new.** The state machine as pure
  transitions, the persistence round-trip, and the legacy-blob path. Every
  assertion must be able to go red; the P1 mutation discipline applies.

Named cases to cover, each of which is a real failure mode:
no time carried from module 1 into module 2 · `endedAt` unset at the boundary and
set at the end · timer state *not* cleared at the boundary and cleared at the end
· a v1 blob restoring as a single 70-minute block · a v2 blob restoring to module
2 with the right remaining · single-module exams producing a one-entry plan and
never reaching TRANSITION · `duration_minutes` = 70 for SAT_FULL and unchanged
elsewhere.

### 4.5 Files NOT touched

`exam-mistakes-logger.js`, `regenerate-reports.js`, `mastery-updater.js`,
`weakness.html`, `focus.html`, `taxonomy*.js` — all frozen, all unrelated, none
needed.

---

## 5. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | An in-flight exam breaks at deploy | **High** | §3.2 — legacy blobs finish under old rules |
| R2 | `clearTimerState`/`releaseActiveTab` fire at a module boundary → exam lost on refresh, or stolen by a sibling tab | **High** | Invariant 2; explicit test |
| R3 | `endedAt` stamped at module 1's end | Medium | Invariant 1; explicit test |
| R4 | `duration_minutes` records 35 instead of 70 | **High — silent** | §4.3; explicit test |
| R5 | `saveTimerState` skips the TRANSITION view | **High** | §3.3; explicit test |
| R6 | A non-DSAT exam changes behaviour | **High** | Invariant 5 — one-entry plans take today's path |
| R7 | Timer drift maths applied to the wrong module | Medium | Restore is plan-scoped; explicit test |

---

## 6. Open questions for review

1. **Should the transition auto-advance, or wait for a click?** Bluebook advances
   automatically. But a Si Math AI student is working on paper and needs a moment
   to turn the page, so this proposes **a manual "Begin Module 2"**. Auto-advance
   with a countdown is the alternative.
2. **Should the transition be time-capped?** Proposed: **no** — the student may
   pause between modules, and an uncapped boundary cannot leak time into module
   2 (invariant 3). It does mean total wall-time can exceed 70 minutes, which is
   less realistic. A cap is easy to add later via a registry field.
3. **Should `SAT_MODULE_1` / `SAT_MODULE_2` stay as separate selectable exams?**
   They are one-entry plans and unaffected either way. Keeping them is proposed —
   drilling a single module is a legitimate study choice.
4. **Should the transition screen show module 1's elapsed time?** Useful pacing
   feedback, but the platform does not know the student's answers, so it can
   report only time. Proposed: show time used, nothing more.
