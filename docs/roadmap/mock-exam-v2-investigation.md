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

---
---

# Addendum — Spec §8 (Desmos Calculator) and §9 (Exam Hall Ambient Sound)

**Added:** 2026-08-23, same investigation, no code changed.
Both sections asked for research and limitations *before* implementation. This is
that research. §8 has a **hard legal blocker**; §9 has a content and
accessibility decision. Neither is primarily an engineering problem.

---

## 7. §8 — Desmos calculator: the licensing finding

### 7.1 The blocker, in Desmos's own words

The caution in the specification — *"do not assume that embedding the Desmos
website directly in an iframe is supported or permitted"* — is correct, and the
restriction is broader than iframes. From the Desmos Terms of Service
(last modified 2026-05-21), quoted verbatim:

> "You agree to use the Desmos Tools only (a) as an end user, for your personal,
> non-commercial use or (b) as a School, for academic use by you and your
> Students in individual classes."

> "You may not frame or mirror the Desmos Tools without our prior consent."

> "Desmos does, pursuant to a separate written agreement, permit certain third
> parties to integrate with the Desmos Tools for commercial use."

> "Please contact partnerships@desmos.com for more information about entering
> into a relationship with Desmos that would permit commercial use of the Desmos
> Tools."

**Si Math AI is a commercial platform.** It sells subscriptions in EGP, runs a
credit economy, and has paid Founder tiers. It is neither "an end user for
personal, non-commercial use" nor "a School … in individual classes". The Desmos
API Terms are described as covering *"paid partnerships with publishers,
assessment companies, educational institutions and other commercial partners."*

**Therefore: shipping Desmos inside Si Math AI requires a signed partnership
agreement with Desmos. There is no free or self-serve route for a commercial
exam-prep product.** This is a business action — an email to
partnerships@desmos.com — and it gates the entire feature. No amount of
engineering removes it.

Both routes are closed without the agreement:

- **Iframing desmos.com** → explicitly prohibited ("may not frame or mirror").
- **The JS API** (`https://www.desmos.com/api/v1.11/calculator.js?apiKey=…`,
  keys issued at desmos.com/my-api) → the key is issued under the agreement.

### 7.2 What the API gives you, once licensed

- Constructors: `Desmos.GraphingCalculator`, `Desmos.ScientificCalculator`,
  `Desmos.FourFunctionCalculator`, plus geometry/matrix/3D.
- **Access to four-function, scientific and geometry is enabled per API key** —
  readable at `Desmos.enabledFeatures`. Calling a constructor for a feature not
  enabled on your key is an error, so the exam registry must degrade gracefully
  rather than assume.
- `.destroy()` frees listeners and resources — essential here, because the panel
  will be opened and closed repeatedly inside a live exam.
- **Partners may self-host the API bundle on their own servers** instead of
  loading it from desmos.com. This matters a lot for us (§7.4).

### 7.3 Fidelity — which exams this is actually faithful to

The value of §8 is test-day realism, so faithfulness matters more than presence:

| Exam | Real test-day calculator | On-screen Desmos faithful? |
|---|---|---|
| **DSAT** | Desmos **built into Bluebook** — graphing *and* scientific, full-featured, on every math question | ✅ **Yes, exactly** |
| **ACT (online)** | Desmos graphing built into the online testing platform, Math section | ✅ **Yes** |
| **ACT (paper)** | Student **brings their own** device; 4-function/scientific/graphing allowed, **CAS banned** (TI-89, TI-Nspire CAS, HP Prime CAS) | ⚠️ Partially — no on-screen calculator exists on test day |
| **EST** | Student brings an approved calculator; **EST I Math Level 1 permits it in part 2 only**, EST II Math permits it throughout | ⚠️ Partially, and **not for all of EST I** |

Two consequences for the exam registry:

1. `calculator` cannot stay a single boolean. It needs at minimum
   `{ allowed, provider, scope }` — because EST I allows a calculator in *part 2
   only*, and today every config is flagged `calculator: true` unconditionally.
2. ACT paper and EST are cases where showing a calculator is *less* realistic
   than not showing one. The registry should be able to say "permitted on test
   day, but you bring it" — which is a third state, not a boolean.

### 7.4 The integrity tension nobody has named yet

§4 exists to protect proprietary question content. §8 proposes loading a
**third-party script with full DOM access into the exam page**. Those two goals
are in direct tension: once questions exist (Phase 5), any script running inline
in that document can read them.

This is not an accusation about Desmos — it is a structural point about
third-party scripts on a page whose stated purpose is content protection.

**Recommended mitigation, available only under the partnership:** take the
self-hosting option, serve the bundle from our own origin, and render the
calculator inside a **sandboxed iframe we control** rather than inline in the
exam DOM. That gives content isolation, removes a cross-origin dependency from
the critical exam path, and works offline. Note this is *self-hosting the
licensed API* — categorically different from "framing the Desmos Tools", which
the ToS forbids.

### 7.5 It also breaks this repo's SRI rule

`CLAUDE.md` records that CDN dependencies are pinned with SRI via
`scripts/pin-cdn-sri.sh`. Reading that script, it deliberately computes hashes
**from the npm registry tarball**, because jsdelivr is a pass-through CDN and the
tarball is the authoritative, independently-checkable source.

The Desmos API **is not on npm.** It is served from `www.desmos.com` behind a
query-string API key, and Desmos patches the `v1.x` file in place. So:

- It **cannot be pinned by the existing method** (no tarball to hash).
- A hash pinned against the live URL would **break when Desmos ships a patch**,
  taking the calculator — and, if the script tag is blocking, possibly the exam
  page — down with it.

Self-hosting the bundle (§7.4) resolves this too: a file in our own repo or
storage can be hashed and pinned like anything else. **Absent self-hosting, §8
requires an explicit, documented exception to the SRI rule.** That is a decision
for the user, not something to slip past a security gate.

### 7.6 Recommended approach — build the socket, not the plug

Do not block the whole feature on a legal negotiation, and do not ship an
unlicensed integration. Split it:

**Now (no license needed):**
- Extend the Phase 1 exam registry with a calculator descriptor:
  `calculator: { allowed: true, provider: 'desmos-graphing', scope: 'all' }`,
  supporting `scope: 'section:2'` for EST I and `provider: 'byod'` for
  bring-your-own exams.
- Build `exam-calculator.js` — the **panel host and provider abstraction**: a
  draggable/resizable in-exam panel, open/close, focus management, and a
  provider interface (`mount`, `unmount`, `isAvailable`). Timer untouched;
  answers untouched; the panel is pure UI.
- Ship a **legally clean default provider** so the feature works on day one.
  Candidates, all permissively licensed: `math.js` (Apache-2.0) for evaluation,
  `JSXGraph` (LGPL) or `function-plot` (MIT) for plotting, `MathLive` (MIT) for
  input. This gives a real scientific/graphing calculator — but see the honesty
  note below.

**When the agreement is signed:** register the `desmos` provider, prefer
self-hosting, add the SRI pin, flip the registry config. **No rewrite** — that is
the point of the abstraction.

**Honesty note to carry into the product copy:** a non-Desmos calculator is *not*
the DSAT experience. Different keystrokes, different regression behaviour,
different graphing feel. For DSAT specifically, practising on a substitute builds
partly-wrong muscle memory. Until the agreement exists, the honest options are a
clearly-labelled "practice calculator (not the official DSAT tool)" or pointing
students at the public desmos.com in their own tab — which is lawful (linking is
not framing) but breaks the §8 UX requirement on purpose.

### 7.7 A likely factual error found on the way

`EXAM_CONFIGS` labels both EST entries `org: 'Emirates Standardized Test'`.
Every Egyptian source consulted calls **EST the "Egyptian Scholastic Test"** — the
SAT/ACT-equivalent used for admission to Egyptian universities. Given Si Math AI
prices in EGP, supports Arabic, and targets Egyptian exam candidates, "Emirates"
appears to be simply wrong, and it is **displayed to students on the exam card**.

Flagging rather than fixing: it lives in a frozen file, and a correction to
student-facing copy should be confirmed by the user, not assumed. If confirmed,
this is a *correction*, which the documentation freeze explicitly permits.

---

## 8. §9 — Exam hall ambient sound

### 8.1 Starting position

There is **no audio anywhere in this project today.** No `.mp3`, `.ogg`, `.wav`
or `.m4a` in the repository; `assets/` holds JS, CSS and one JPG. `.gitattributes`
declares `*.png` and `*.jpg` binary and nothing else, so audio extensions need a
binary declaration added or Git will treat them as text and corrupt them under
`text=auto eol=lf`. Small thing, but it will bite on the first commit of an
`.mp3` if missed.

### 8.2 One audio bus, not two systems

§3 (proctor announcements) and §9 (ambient) are both audio, and §9 requires
ambient to **duck while announcements play**. Building them separately guarantees
they will fight. Build one `exam-audio.js` bus:

```
exam-audio.js  (single AudioContext, unlocked by the Start Exam click)
   ├── channel: announcement   priority — always audible
   └── channel: ambient        background — ducked/paused during announcements
```

Design rules that fall out of the spec:

- **Non-overlap by construction** — one ambient source node at a time. Not "check
  whether something is playing", but structurally incapable of two.
- **Ducking is the bus's job**, not the caller's. The ambient channel subscribes
  to announcement start/end.
- **One unlock point.** Browsers block audio before a user gesture; the "Start
  Exam" click is that gesture, and it unlocks the shared context for both
  channels. This is also why the calculator panel and ambient sound must not
  each try to unlock separately.

### 8.3 Scheduling with controlled randomness

Spec: every 8–12 minutes, random pick, no consecutive repeat, never overlapping.

- After each clip finishes, schedule the next at `now + uniform(8min, 12min)`.
  Interval-from-completion, not from start, so a long clip cannot compress the gap.
- Pick uniformly from the pool **excluding the previous clip id** — that is the
  "no consecutive repeat" rule, and it is one line, not a shuffle bag.
- If an announcement is playing or due within a few seconds, **defer** the ambient
  clip rather than duck-then-play; announcements are the point, ambience is not.
- On a 35-minute DSAT module that is roughly **3 clips per module** — deliberately
  sparse, which matches "subtle" far better than a busy loop would.

### 8.4 The timer must remain untouchable

Same rule as §3: **audio observes the timer, never drives it.** Ambient
scheduling runs on its own timeout, every entry point is wrapped so a decode
failure, a blocked context, or a missing asset can only log — never throw into
the tick path, never touch `s.timerSec`, never touch `saveTimerState()`. A silent
exam is a working exam; a broken timer is a ruined attempt.

### 8.5 Asset budget and delivery

- **Preload on exam start**, decode once into `AudioBuffer`s, reuse for the whole
  session. That is one network round per clip per exam, which answers the spec's
  "avoid excessive network requests" without a service worker.
- Keep the whole library **under ~500 KB**. Roughly 6–8 clips of 1–3 seconds at a
  modest bitrate — mono is fine and halves the size; these are background textures,
  not music.
- `.mp3` alone is sufficient — universally supported across current browsers, and
  a second format is bytes for no gain.
- Serve from `assets/exam-ambience/`, static on Vercel, alongside everything else.

### 8.6 Where the sounds come from — a content decision, again

Exactly like the exam questions in §5–6, **this is a licensing question, not an
engineering one.** Pencil-writing and page-turn recordings are owned by whoever
recorded them. Three lawful routes:

1. **CC0 / public domain** (e.g. Freesound CC0, Pixabay) — free, but each file's
   licence must be individually verified and recorded, not assumed from the site.
2. **Purchased royalty-free** — a clean paper trail, small cost.
3. **Record them.** A pencil on paper and a page turn are trivially recordable in
   a quiet room, they cost nothing, and the provenance is unimpeachable. For a
   library this small this is genuinely the best option.

Whichever route, record the source and licence per file in the repo, the way
`pin-cdn-sri.sh` records where each pin came from.

### 8.7 Accessibility — the part that needs care

The specification names accessibility, correctly. The concerns are real:

- **WCAG 2.1 SC 1.4.2 (Audio Control)** requires a mechanism to pause or stop any
  audio that plays automatically for more than 3 seconds. A persistent, visible
  mute control in the exam chrome satisfies this. A setting buried in
  `settings.html` does **not** — it must be reachable *during* the exam.
- **Screen-reader users:** ambient audio competes directly with speech output.
  For these students it is not atmosphere, it is interference.
- **ADHD, autism, sensory processing differences, auditory processing disorders,
  anxiety:** background noise during a timed high-stakes task is actively harmful
  for a meaningful share of students — plausibly a larger share among exam-prep
  users than in the general population.

**Recommendation:** default **off** globally; offer it prominently at exam start
as an explicit "Realistic exam hall" choice; default it **on only when the
student has chosen Realistic Simulation Mode**, which is a deliberate opt-in. Keep
a persistent mute in the exam chrome regardless. This honours the spec's
"realistic simulation may enable this by default" while making the default path
safe for the students most at risk. It is also the cheaper mistake to undo — a
student who wants ambience will turn it on; a student harmed by it may just lose
the attempt.

Setting is independent of the announcements setting, per the spec.

### 8.8 Limitations to state plainly

| Limitation | Effect |
|---|---|
| Autoplay policy | No audio before the Start click. Unlock there; never assume. |
| Backgrounded tab | Mobile/desktop suspend audio and throttle timers when hidden. Ambience stops; that is acceptable, and it must not be read as an integrity event (§4 already logs `visibility_hidden` separately). |
| iOS silent switch | Physical mute silences Web Audio on iOS regardless of app state. Nothing to be done — do not "fix" it by routing through a video element hack. |
| Bluetooth latency | Ducking may be audibly late on some Bluetooth stacks. Prefer pausing ambience over cross-fading it. |
| Battery | Continuous `AudioContext` costs a little power. Sparse clips + suspending the context between them keeps it negligible. |

---

## 9. Revised phase plan

§8 and §9 slot into the existing plan rather than extending it sideways.

| Phase | Adds | DB | Blocked on |
|---|---|---|---|
| 1 — Exam Registry | calculator descriptor `{allowed, provider, scope}`; announcement + ambience schedules per config | none | unfreeze `mock-exam.html` |
| 2 — Modular DSAT + **audio bus** | `exam-audio.js` (both channels), `exam-proctor.js`, **§9 ambient scheduler** | none | ambient **asset licensing** |
| 3 — Integrity | unchanged | 2 migrations | policy decision |
| 4 — Saved Questions | unchanged | 1 migration | — |
| **4.5 — Calculator panel** | `exam-calculator.js` host + provider abstraction + clean-licence default provider | none | — |
| 5+ — Question bank | unchanged | ~5 migrations | content decision |
| **— Desmos provider** | register provider, self-host, SRI pin, flip config | none | **signed Desmos partnership** |

§9 lands inside Phase 2 because it shares the audio bus — building it later would
mean building the bus twice. The calculator is 4.5 because the panel is
independent of everything else and can ship whenever, while the *Desmos* provider
is unscheduled by design: it is gated on a signature, not on engineering.

## 10. Risk register — additions

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R11 | Shipping Desmos without a partnership agreement | **Blocking / legal** | Provider abstraction; Desmos disabled until signed |
| R12 | Desmos script unpinnable under the SRI rule | **High** | Self-host under the agreement, or an explicit documented exception |
| R13 | Third-party script with DOM access on the page §4 exists to protect | **High** | Sandboxed same-origin iframe, self-hosted bundle |
| R14 | A substitute calculator taught as if it were the DSAT tool | Medium | Label it plainly as a practice calculator |
| R15 | Ambient audio harming students with sensory/attention differences | **High** | Default off; opt-in; persistent in-exam mute; WCAG 1.4.2 |
| R16 | Ambient assets used without a verified licence | Medium | Record source + licence per file; recording them is cheapest |
| R17 | Audio failure taking down the exam | **High** | Observer pattern; every audio path wrapped; silence is a valid state |
| R18 | `calculator: true` on exams where it is not universally permitted | Medium | `scope` in the descriptor; EST I is part-2-only |
| R19 | EST mislabelled "Emirates Standardized Test" to students | Low | Confirm with user, then correct |

## 11. Decisions needed — updated

Carried forward: unfreeze `mock-exam.html`? Project A only or A+B? Content source
for a question bank? Automatic restriction or Admin review? Migration approval.

New:

6. **Will you contact partnerships@desmos.com?** Nothing Desmos-branded can ship
   until that agreement exists. Everything else in §8 can be built now.
7. **Interim calculator: clean-licence substitute, or none at all?** A substitute
   is useful for ACT/EST practice but is not the DSAT tool, and mislabelling it
   would teach the wrong muscle memory.
8. **If the agreement lands: self-host the bundle?** Recommended — it satisfies
   the SRI rule and the §4 isolation concern at once.
9. **Ambient sounds: record, buy, or curate CC0?** Recording ~8 clips is the
   cheapest and the only route with unimpeachable provenance.
10. **Ambient default state?** This document recommends off globally, on only
    inside an explicitly chosen Realistic Simulation Mode.
11. **Is EST "Egyptian Scholastic Test"?** If yes, the exam card is wrong today.
