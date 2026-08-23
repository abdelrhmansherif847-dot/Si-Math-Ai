# Mock Exam v2 — Investigation and Implementation Plan

**Status:** INVESTIGATION — no code changed, no migration written, no migration applied.
**Branch:** `claude/mock-exam-enhancement-nnwb48`
**Date:** 2026-08-23
**Trigger:** "Si Math AI — Mock Exam Enhancement Specification" (DSAT / ACT / EST
simulation, proctor audio, integrity system, saved questions, exam→module→question
architecture).

Every claim below was measured against the working tree at `f875ae4` or queried
against the live database (`igvkyxkmjnkzscqgommj`) on 2026-08-23. Where the
specification and reality disagree, this document records reality.

---

## 0. The one finding that reshapes the whole specification

**The Mock Exam does not deliver questions. It never has.**

`mock-exam.html` is a **timer plus a self-report form**. The student takes a real
exam on paper or in another app, uses Si Math AI to time themselves, then types in
their score and lists the topics they got wrong. The platform stores the
*self-reported outcome*, not the exam.

Verified two ways:

- No question content exists anywhere in `mock-exam.html`. `EXAM_CONFIGS`
  (line 401) carries `duration`, `questions`, `calculator`, `scoreMin`,
  `scoreMax` — counts and metadata only, zero question bodies.
- No question bank exists in production. The `public` schema has 53 tables;
  none of them stores exam questions. There is no `exam_questions`,
  `question_bank`, `saved_questions`, or equivalent.

`exam_mistakes.question_id` looks like a reference but is **`text`, nullable, with
no foreign key** — a free-text label the student may type, not a pointer into a
bank.

### What this does to the specification

Four of the seven sections assume a question-delivery engine that does not exist:

| Spec section | Assumes | Exists today |
|---|---|---|
| §3 Audio announcements | A timed exam session | ✅ yes — timer is real |
| §4 Integrity ("protect proprietary questions") | Proprietary questions on screen | ❌ **nothing on screen to protect** |
| §5 Saved Questions ("next to every exam question") | Questions are rendered | ❌ no questions are rendered |
| §6 Exam → Section/Module → Question | A question entity | ❌ no question entity |

§4 in particular is designed to protect an asset the platform does not yet own.
Building the lock before the vault is not automatically wrong — but it should be a
decision, not an accident.

---

## 1. Current architecture, as measured

### 1.1 The flow

```
SELECT ──▶ TIMER ──▶ RESULTS ──▶ MISTAKES ──▶ SAVING ──▶ SUCCESS
(pick     (count    (student    (student     (writes)   (XP,
 exam)     down)     types       types                   rank)
                     score)      topics)
```

`VIEW_STEP` (line 574) and `render()` (line 588) are a plain string-keyed state
machine over one `<div id="pageContent">`. There is no router and no framework —
each view is an `html*()` function returning a template string plus an `after*()`
function that binds listeners.

### 1.2 What the timer already does well

The timer is more robust than its size suggests, and this is production behaviour
worth preserving:

- **Persistence** — `saveTimerState()` / `restoreTimerState()` (lines 517–573)
  survive a refresh or tab close mid-exam.
- **Multi-tab ownership** — `claimActiveTab()` / heartbeat / `TAB_STALE_MS = 15000`
  (lines 466–515) stop two tabs double-counting one exam.
- **Pause/resume** with wall-clock `pausedAt` so a close-during-pause restores
  correctly.
- **Idempotency** — `ensureIdempotencyKey()` plus a `23505` recovery path in
  `doSave()` that adopts the winning row and *skips all downstream side effects*
  (mistakes, signals, mastery, XP, achievement). Backed by
  `20260616_exam_sessions_idempotency.sql`.
- **XP compare-and-set** — a 5-attempt CAS loop on `profiles.xp` so a concurrent
  award from chat cannot clobber the exam award.

Any rewrite that loses these regresses fixes that were made deliberately (ME-P1,
ME-P3a, ME-P3b).

### 1.3 Gating already in place, before the exam starts

`afterSelect()` → `#btnStart` (line 738 onward) runs, in order:

1. **Auth** — `getCurrentUser()` with a 10 s timeout, redirect to `login.html`.
2. **Device guard** — a DJB2-ish fingerprint over UA + screen + language + TZ,
   checked against `user_devices`; three legacy fingerprint shapes are tried and
   migrated before blocking to `devices.html?blocked=1`. Admins bypass.
3. **Plan gate** — `enforce_my_subscription_expiry()`, then FREE plans get
   **1 non-PRACTICE mock exam per rolling 7 days**; `showExamPaywall()` otherwise.
   Admin / founder / any non-FREE `plan_code` bypasses. `PRACTICE` is always free.

Note this is a **plan gate, not a credit charge** — the Mock Exam does not call
`consume_credits`. It costs no credits and is not subject to `daily_limit`.

### 1.4 Exam configurations — already correct

This is the part of the specification that is **already implemented**:

| Code | Spec asks | `EXAM_CONFIGS` has | Match |
|---|---|---|---|
| `SAT_MODULE_1` | 22 q / 35 min | 22 q / 35 min | ✅ |
| `SAT_MODULE_2` | 22 q / 35 min | 22 q / 35 min | ✅ |
| `SAT_FULL` | 44 q / 70 min | 44 q / 70 min | ✅ |
| `ACT_MATH` | 45 q / 50 min | 45 q / 50 min | ✅ |
| `EST_MATH_1` | supported | 50 q / 75 min | ✅ |
| `EST_MATH_2_L1` | supported | 40 q / 60 min | ✅ |
| `PRACTICE` | — | n × 1.5 min | ✅ |

**The numbers are not the gap.** Three real gaps remain:

1. The config is a hardcoded object literal inside a 101 KB frozen HTML file, so
   adding an exam means editing a frozen file. The spec's "do not hardcode the
   system in a way that makes future exam configurations difficult to add" is a
   fair criticism of *where* the config lives, not of *what it says*.
2. `SAT_FULL` is modelled as **one 70-minute countdown**, not as two 35-minute
   modules with a boundary between them. The spec's "DSAT module timing must be
   handled correctly as separate modules" is therefore a genuine behavioural
   change to the timer state machine, not a config edit.
3. Every exam is flagged `calculator: true`, including modules where that is not
   universally true across all three exam families.

### 1.5 The Weakness Analyzer boundary — clean today, and must stay clean

This is the architecture the specification explicitly asks to preserve, and it is
correctly separated already:

```
mock-exam.html doSave()
   ├─▶ exam_practice_sessions  (the attempt)
   ├─▶ exam_mistakes           (canonicalised via TaxonomyWrite)
   └─▶ ExamMistakesLogger.process()        [exam-mistakes-logger.js]
          ├─▶ weakness_signals  source='MOCK_EXAM'
          │     • topic          weight 1.5–4.0, compounded by prior sessions
          │     • repeated       when seen in ≥1 prior session
          │     • exam_confused  when seen in ≥2 prior sessions
          ├─▶ MasteryEngine.onExamMistake()      [mastery-updater.js]
          └─▶ regenerateWeaknessReports()        [regenerate-reports.js]
                 └─▶ weakness_reports  (severity_band, trend, priority_rank)
```

**The Mock Exam page contributes evidence and nothing else.** It never computes
severity, priority, or a study plan. `regenerate-reports.js` is documented as the
*sole* authority for `severity_band` and `trend` ("consumers must not re-derive
from mastery_score"), and `weakness.html` only reads `weakness_reports` /
`weakness_signals` and triggers regeneration — it does not classify.

Every mistake is forced through `window.TaxonomyWrite.canonical()`. Unmapped
topics are logged via `logUnmapped()` and **dropped**, never stored as raw text.
That boundary must survive any change here.

---

## 2. Conflicts with current Si Math AI architecture

These are blocking. They are project rules, not preferences.

### 2.1 Five of the files this work touches are FROZEN

`CLAUDE.md` §2 freezes, and requires explicit user unfreezing for:

- `mock-exam.html` — **the primary target of the entire specification**
- `exam-mistakes-logger.js` — the analyzer feed
- `regenerate-reports.js` — the analyzer itself
- `weakness.html`
- `focus.html`

Essentially no part of the specification can be implemented without unfreezing
`mock-exam.html`. Sections 1–7 all land in it.

The plan below is deliberately built so that **only `mock-exam.html` needs
unfreezing** — new behaviour goes into new dependency-free modules that it
`<script src>`s, leaving the analyzer files untouched.

### 2.2 Migrations require individual approval

`CLAUDE.md` §3: every migration is individually approved before `apply_migration`.
Writing the file is not applying it — the convention is
PREPARED → reviewed → approved → APPLIED. This plan proposes migrations; it does
not write or apply them.

### 2.3 The three gate questions

`CLAUDE.md` requires every feature to answer yes to at least one of: does this
improve learning, understanding, or long-term retention? Applied honestly:

| Feature | Learning | Understanding | Retention | Verdict |
|---|---|---|---|---|
| Modular DSAT timing | ✅ test-day transfer | — | — | passes |
| Proctor announcements | ✅ pacing skill | — | — | passes |
| Saved Questions | ✅ | ✅ | ✅ retrieval practice | passes strongly |
| Question bank + review | ✅ | ✅ | ✅ | passes strongly |
| **Integrity / anti-copy** | ❌ | ❌ | ❌ | **fails all three** |

The integrity system is **IP and business protection, not pedagogy.** That is a
legitimate reason to build it, but it should be named as such rather than counted
as a learning feature — and per §7 of `governance.md` it is the one item here that
the gate questions do not justify on their own.

### 2.4 Documentation freeze

`CLAUDE.md` §5 freezes the **public** knowledge layer. This document lives in
`docs/roadmap/`, which is explicitly *not* covered — internal engineering records
are written continuously. No public page is touched by this plan. If the feature
ships, the pipeline (Knowledge Graph → Documentation → Website) applies then, and
only then.

---

## 3. Browser and privacy reality for the Integrity system (§4)

The specification asks not to claim a browser can reliably detect every
screenshot. Correct — and the honest table is wider than that.

| Event | Detectable in a browser? | Confidence | Notes |
|---|---|---|---|
| **Screenshot** | ❌ **No** | — | No web API exists on any platform. OS-level capture is invisible to JS. Cannot be detected, cannot be blocked. |
| **Phone camera photographing the screen** | ❌ **No** | — | The realistic bulk-copy threat, and completely undetectable. |
| Fullscreen exit | ✅ Yes | **High** | `fullscreenchange`. Reliable and intentional. |
| Copy | ✅ Yes | **High** | `copy` event; also preventable. |
| Print | ⚠️ Mostly | Medium | `beforeprint` fires for menu-initiated print in Chrome/Firefox/Safari; not guaranteed on every path. |
| Tab hidden | ✅ Yes | **Low as evidence** | `visibilitychange` also fires on notifications, incoming calls, screen lock, OS updates. |
| Window blur | ✅ Yes | **Very low as evidence** | Fires for a second monitor, an OS dialog, a calculator app. |
| DevTools open | ⚠️ Heuristic only | **Do not use** | Every known method is a false-positive generator. |
| Right-click | ✅ Yes | Low | Trivially bypassed; blocking it mostly annoys honest students. |

**Conclusion:** an integrity system here is a **deterrent and an audit trail**, not
a prevention mechanism. It should be described that way to students and to the
Admin, and the product should not promise protection it cannot deliver.

### Privacy

The students are Egyptian exam candidates, a large share of them minors. Logging
focus and visibility events is behavioural monitoring and needs care:

- **Disclose before the exam starts**, on the start screen, in plain language:
  what is recorded, why, and what happens on a violation.
- **Minimise** — event type, timestamp, attempt id. Never keystrokes, never screen
  content, never camera or microphone, never clipboard *contents*.
- **Retain for a bounded period** and delete after it, unless a restriction is
  open on the account.
- The 3-strikes rule in the specification, with a restriction that does not expire,
  means **a false positive can permanently remove paid functionality from a
  minor's account**. `visibilitychange` fires when a phone rings. This is the
  single highest-risk element of the specification.

### Recommended integrity policy (safer than literal 3-strikes)

1. **Classify by confidence, not by count.** Only `fullscreen_exit`, `copy`, and
   `print` count toward restriction. `visibility_hidden` and `blur` are *logged
   for the audit trail* and shown to the Admin, but never auto-restrict.
2. **Escalate visibly:** 1st → in-exam warning; 2nd → stronger warning naming the
   consequence; 3rd → attempt flagged and **queued for Admin review**.
3. **Restriction is Admin-applied, not automatic.** Automatic permanent loss of a
   paid feature on browser events that have known benign causes is not defensible.
   If the user wants full automation, make the threshold configurable and default
   it to review.
4. **Scope the restriction to the Mock Exam only** — as the spec requires. A
   dedicated table, never a profile-wide flag, so nothing else can read it as a
   general ban.
5. **Admin restore is a first-class action** with an audit row recording who
   restored and why.

---

## 4. Recommended plan

The specification is really two projects. Separating them is the main
recommendation of this document.

- **Project A — enhance what exists.** Works on the self-report model, needs no
  question content, ships incrementally. Phases 1–4 below.
- **Project B — build a question-delivery engine.** A new subsystem: schema,
  authoring, delivery, auto-scoring, review. Phase 5+.

**Project B's true constraint is content, not code.** Real SAT / ACT / EST
questions are the copyrighted property of College Board and ACT Inc. and cannot be
reproduced. A bank means *originally authored* questions — an editorial programme
(44 DSAT + 45 ACT + 50 EST per form, times however many forms), not an engineering
task. That is the decision to take before any of Phase 5 is worth starting.

### Phase 1 — Exam Registry (config as data)

Extract `EXAM_CONFIGS` into a new dependency-free `exam-registry.js` following the
established `_shared` single-source pattern. Carries per-exam module structure,
timing, calculator policy, score range, and the announcement schedule.

- New: `exam-registry.js`
- Modified: `mock-exam.html` (consume the registry) ⚠️ frozen
- DB: none · Risk: **low**

### Phase 2 — Modular DSAT timing + Proctor announcements

Make `SAT_FULL` a genuine two-module session (35 + 35 with a module boundary),
and add a schedule-driven announcement layer.

- New: `exam-proctor.js` — announcements as **observers** of timer state. The
  timer stays the single source of truth; a failed or blocked announcement can
  never stall or skew it.
- Delivery: `speechSynthesis` first; on failure or autoplay block, a visual banner
  fallback. Browsers block audio before a user gesture — the "Start Exam" click is
  that gesture, so the audio context is unlocked there.
- Schedules are per-config (spec requirement), e.g. halfway, 5 min, 3 min, 1 min,
  time-up — with DSAT scheduling **per module**, not per session.
- Student setting to disable, defaulting to on for realism.
- New: `exam-proctor.js` · Modified: `mock-exam.html` ⚠️ frozen, `settings.html`
- DB: none (setting in `localStorage`, or `profiles` if it must sync) · Risk: **medium** (timer state machine)

### Phase 3 — Integrity events + Mock-Exam-scoped restriction

- New table `exam_integrity_events` — `user_id`, `session_id`, `event_type`,
  `severity`, `occurred_at`, `metadata jsonb`, `action_taken`. RLS: student
  inserts own, reads none; admin reads all.
- New table `mock_exam_restrictions` — scoped to the Mock Exam only, no auto-expiry,
  admin restore, audit columns.
- Admin surface: a new tab in `admin.html`; restore action through
  `admin-actions` (already service-role) rather than a client-callable RPC.
- New: `exam-integrity.js` · Modified: `mock-exam.html` ⚠️ frozen, `admin.html`,
  `supabase/functions/admin-actions/`
- DB: **2 migrations, each needing explicit approval** · Risk: **high** (fairness, privacy, and an Edge Function deploy)

### Phase 4 — Saved Questions

With no question bank, a saved question is a **student-authored reference** —
exam context + question number + the student's note + topic. That is still a real
retrieval-practice tool, and it is forward-compatible.

- New table `saved_questions` with a **nullable `question_id` FK** left ready for
  the future bank, alongside the text fields used today. When Phase 5 lands, rows
  can be upgraded to point at real questions without a rewrite.
- New page `saved-questions.html` (student's personal collection), plus a save
  control in the Mock Exam flow.
- New: `saved-questions.html`, `saved-questions.js` · Modified: `mock-exam.html` ⚠️ frozen, `nav.js`
- DB: **1 migration, needing explicit approval** · Risk: **low–medium**

### Phase 5+ — Question bank and delivery engine (needs a separate decision)

`exam_forms` → `exam_sections` → `exam_questions`, and
`exam_attempts` → `attempt_answers`, with question metadata (exam type, domain,
topic, skill, difficulty, source/status) linked to the existing
`taxonomy_topics` / `taxonomy_subtopics` registry rather than a parallel taxonomy.

Auto-scoring then replaces self-reported scores, and the analyzer feed gets
*stronger* — real per-question evidence instead of student recall — while the
boundary stays exactly as it is: the Mock Exam emits `weakness_signals`, and
`regenerate-reports.js` remains the only authority on weakness.

- DB: **~5 migrations** · Risk: **high** · Blocked on the content decision above.

---

## 5. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Editing frozen `mock-exam.html` | **Blocking** | Explicit unfreeze required before any code |
| R2 | False-positive permanent restriction of a minor's paid feature | **High** | Confidence-classified events; Admin-in-the-loop restriction |
| R3 | Rewriting the timer breaks ME-P1/P3a/P3b (idempotency, multi-tab, persistence) | **High** | Extend, never replace; keep the CAS and 23505 paths byte-identical |
| R4 | Announcements interfering with the timer | Medium | Observer pattern; announcements never write timer state |
| R5 | Weakness Analyzer boundary erosion | **High** | No changes to the analyzer files; Mock Exam stays evidence-only |
| R6 | Audio blocked by autoplay policy | Medium | Unlock on the Start click; visual banner fallback |
| R7 | Integrity theatre — promising protection the web cannot give | Medium | Describe as deterrent + audit trail, never as prevention |
| R8 | Phase 5 blocked on copyright | **High** | Originally authored content only; decide before building |
| R9 | Migration applied without approval | **Blocking** | PREPARED files only; explicit approval per migration |
| R10 | Admin-actions redeploy | Medium | `DEPLOY.md` §4 only; never the inline MCP deploy tool |

---

## 6. Decisions needed before any code is written

1. **Unfreeze `mock-exam.html`?** Nothing in the specification can ship without it.
2. **Project A only, or A + B?** Is the goal to enhance the self-report simulator,
   or to build a real question-delivery engine? They are very different sizes.
3. **If B: where does the content come from?** Original authorship is the only
   lawful route. Who writes it, and how many forms per exam?
4. **Automatic restriction, or Admin review?** This document recommends review;
   the specification says automatic. The user's call, but the risk is real.
5. **Migration approval** — per file, per §3.
