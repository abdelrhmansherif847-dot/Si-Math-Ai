# Mock Exam v2 — Implementation Plan (approved scope)

**Status:** PLAN — awaiting per-migration approval. No code written, no migration
created, no migration applied.
**Branch:** `claude/mock-exam-enhancement-nnwb48`
**Date:** 2026-08-23
**Supersedes nothing.** Companion to `mock-exam-v2-investigation.md`, which holds
the measured architecture findings and the Desmos licensing research.

## Authorisations recorded

| # | Decision | Effect on this plan |
|---|---|---|
| 1 | `mock-exam.html` unfrozen **for this project only** | The only frozen file touched. Minimal diffs; new logic in new modules |
| 2 | Project A + **Project B foundation**, smallest safe path | Question Engine = schema spine only. No delivery UI, no attempts table yet |
| 3 | Integrity split by confidence; 3 strikes → restrict + Admin review | Low-confidence events never strike. No irreversible automatic action |
| 4 | Saved Questions = **data architecture now, UI later** | Table + relationships. No bookmark control on the self-report flow |
| 5 | Both audio systems | One shared bus, two channels |
| 6 | Desmos = separately licensed provider; **never integrate unlicensed** | Provider socket only. Zero providers registered. Absence is a valid state |
| 7 | Expressive calculator policy model | `{allowed, provider, scope, byod}` replaces the boolean |
| — | EST renamed **Egyptian Scholastic Test (EST)** | Lands in Phase 1 with the registry |
| — | Ambient **off by default**; opt-in "Realistic Exam Environment" | Persistent in-exam mute; independent of announcements |
| — | Original audio recordings only | `.gitattributes` updated **before** any binary is committed |

**Unchanged and untouched:** `exam-mistakes-logger.js`, `regenerate-reports.js`,
`weakness.html`, `focus.html`, `taxonomy.js`, `taxonomy.core.js`. The Weakness
Analyzer pipeline is not modified in any phase. The Mock Exam continues to emit
evidence and nothing else.

---

## 1. Final recommended phases

Seven phases. Ordered by dependency, not by value — several can ship out of order
(§5).

### Phase 1 — Exam Registry (config as data)

The foundation everything else reads. A dependency-free module usable in the
browser and in Node under CI, following the established `taxonomy-compat.js`
precedent.

Carries per exam: identity and display, **module structure**, timing, score
range, **calculator policy**, **announcement schedule**, **ambience policy**.

Two commits, deliberately:

- **1a** — `exam-registry.js` + tests, consumed by nothing. Zero production risk.
- **1b** — `mock-exam.html` reads it. The registry exposes a **compat view whose
  shape is byte-compatible with today's `EXAM_CONFIGS`**, so the diff in the
  frozen file is *delete one object literal, add one script tag*. Existing code
  paths keep working unchanged.

Includes the **EST naming correction** — the registry becomes the single source
of the student-facing name, so the fix lands once and cannot drift.

### Phase 2 — DSAT module state machine

`SAT_FULL` becomes a genuine two-module session: 22 q / 35 min → module boundary
→ 22 q / 35 min, instead of one 70-minute countdown.

Preserved without modification: timer persistence, multi-tab ownership protocol
(`TAB_STALE_MS`), pause/resume with wall-clock `pausedAt`, the `23505`
idempotency recovery path, and the XP compare-and-set loop. These are ME-P1 /
ME-P3a / ME-P3b fixes made deliberately; **extend, never replace.**

⚠️ **Migration hazard with no database in it.** The timer blob in `localStorage`
(`simath_mock_timer`) changes shape. A student mid-exam when the deploy lands
holds the old shape. The restore path gets a schema version and falls back to
single-module behaviour for an unversioned blob, rather than throwing away a live
attempt.

### Phase 3 — Audio: one bus, two channels

```
exam-audio.js — one AudioContext, unlocked by the single Start Exam gesture
   ├── announcement channel   priority; always audible
   └── ambient channel        ducked/paused whenever an announcement plays
```

- `exam-proctor.js` — schedule-driven announcements, per exam config, **per DSAT
  module**. Final warnings carry the required guidance: check unanswered
  questions, best guess rather than leaving blanks.
- `exam-ambience.js` — controlled randomness: interval measured **from clip end**
  (a long clip cannot compress the gap), uniform 8–12 min, pool minus
  `lastPlayedId` for no consecutive repeat, one source node so non-overlap is
  structural rather than checked. Defers rather than ducks when an announcement
  is imminent.
- **Ambient is OFF by default.** Enabled only inside an explicitly chosen
  *Realistic Exam Environment*. Persistent mute in the exam chrome (WCAG 2.1
  SC 1.4.2 requires the control to be reachable *during* the exam, not buried in
  settings). Independent of the announcements setting.

**The engine ships before the sounds.** With an empty library it simply never
schedules — inert, not broken. That decouples the code from the recording
session entirely.

Every audio entry point is wrapped: a blocked context, a decode failure or a
missing asset can only log. **Silence is a valid state; a broken timer is a
ruined attempt.**

### Phase 4 — Calculator provider architecture (socket only)

`exam-calculator.js`: an in-exam panel host plus a provider registry with a
`{ mount, unmount, isAvailable }` interface.

**Zero providers are registered.** Per decision 2, no Desmos and no substitute.
`provider: null` is a **first-class valid configuration**, not an error path —
the registry's `calculator.note` drives an honest disclosure instead of a
calculator (for DSAT: that test day uses Desmos inside Bluebook, which Si Math AI
does not include).

Registering a licensed Desmos provider later is a config flip plus one file. No
rewrite. That is the entire point.

The panel never touches timer state, answer state, session state, integrity
logging, or the analyzer feed — it is pure UI over a provider.

### Phase 5 — Integrity events and Mock-Exam-scoped restriction

`exam-integrity.js` — detectors classified by confidence:

| Confidence | Events | Counts as a strike? |
|---|---|---|
| **High** | `copy`, `print`, `fullscreen_exit` | ✅ yes |
| **Low** | `visibility_hidden`, `window_blur`, `context_menu` | ❌ **never** — logged for audit only |

Enforcement: 1st → warning · 2nd → stronger warning · 3rd → **Mock Exam access
restricted and flagged `review_status = 'pending'` for Admin review.** Admin can
restore or uphold. Scoped to Mock Exams only — never the account.

Thresholds live in the existing **`system_settings`** key-value table and are
edited through the existing `admin-actions` → `update_system_setting` path.
**No migration is needed for policy configuration.**

⚠️ **Stated plainly in the product and the Admin view: these events are
client-reported and therefore not proof.** A determined student can suppress or
forge them. This is an audit trail and a deterrent. It is exactly why the third
strike routes to a human rather than to a permanent ban.

### Phase 6 — Question Engine foundation (schema spine only)

The smallest safe path: **the content spine, and nothing else.**

`exam_forms` → `exam_form_sections` → `exam_questions`, linked to the existing
`taxonomy_topics` / `taxonomy_subtopics` registry (both keyed by `text` ids) —
**not** a parallel taxonomy.

Deliberately **out of scope for now**: `exam_attempts`, `attempt_answers`,
delivery UI, auto-scoring, review policy. Questions without attempts are still
useful — authoring can begin. Attempts without questions are useless. So the
spine comes first and the delivery engine is a separate, later decision.

**No student access at all** in this phase — admin/service only, nothing
published. Students gain a read path only when the delivery engine ships, and
only for published forms during an active attempt.

**The editorial rule is encoded in the schema, not just in policy:**
`content_origin` carries a CHECK constraint permitting the single value
`'original_si_math'`. The database will physically refuse to store a row claiming
third-party provenance. Licensing content legitimately later means adding a value
by migration — a deliberate, reviewable act, never an accident.

### Phase 7 — Saved Questions data architecture

`saved_questions` — the student ↔ question ↔ saved-state relationship, with a
uniqueness constraint so saving twice is idempotent.

**No UI.** Per decision 4, building a bookmark control on a flow that renders no
questions would be misleading. The control ships with the delivery engine, at
which point the table is already there and populated-ready.

---

## 2. Proposed migrations — individually, for individual approval

Four migrations. Each would be written to `supabase/migrations-pending/` per the
README convention there, reviewed, approved individually, and only then moved to
`supabase/migrations/` and applied. **None is written yet.**

---

### ⬜ Migration 1 — `exam_integrity_events`

**Purpose:** an append-only audit log of integrity events during a mock exam,
classified by confidence, readable by Admin.

**Tables created:** `exam_integrity_events`
**Table altered:** `exam_practice_sessions` — **one additive nullable column**, `attempt_id uuid`

> **Why an existing table is touched.** `exam_practice_sessions` rows are
> INSERTed only in `doSave()`, at the *end* of the flow. During the exam — when
> integrity events actually happen — **no session row exists yet**, so there is
> nothing to reference. The fix is a client-minted `attempt_id` at exam start,
> written on both the events and (at save time) the session row, so the two can
> be joined afterwards. The alternative — letting students UPDATE their own
> event rows to backfill `session_id` — would destroy append-only. The column is
> nullable and additive: no rewrite, no backfill, no behaviour change for
> existing rows.

**Columns:** `id`, `user_id` → `auth.users` ON DELETE CASCADE, `attempt_id`,
`session_id` (nullable), `exam_code`, `event_type` (CHECK'd enum),
`confidence` (CHECK `'high'|'low'`), `occurred_at`, `client_reported_at`,
`metadata jsonb` (bounded), `counted_as_strike`, `action_taken`.

**Data minimisation — enforced, not promised:** no keystrokes, no screen content,
no clipboard *contents*, no camera, no microphone. `metadata` carries event
shape only.

**RLS:**
- Student `INSERT` own rows only (`with check user_id = auth.uid()`)
- Student `SELECT` — **none** (see approval gate G4)
- Admin `SELECT` all
- No `UPDATE` / `DELETE` for anyone but `service_role` → append-only

**Indexes:** `(user_id, occurred_at DESC)`, `(attempt_id)`, partial on `confidence = 'high'`

**Rollback:** paired `*_rollback.sql`, per the `20260804_streak_server_side_rollback.sql` precedent.

---

### ⬜ Migration 2 — `mock_exam_restrictions`

**Purpose:** Mock-Exam-scoped access restriction with mandatory Admin review.
**Never account-wide.**

**Tables created:** `mock_exam_restrictions`
**Function created:** an `AFTER INSERT` trigger on `exam_integrity_events`

**Columns:** `id`, `user_id`, `status` (`'active'|'lifted'`), `reason`,
`triggered_by` (`'auto_threshold'|'admin'`), `strike_count`,
`review_status` (`'pending'|'upheld'|'overturned'`, default `'pending'`),
`created_at`, `lifted_at`, `lifted_by`, `admin_note`.

**Unique partial index:** one `status='active'` restriction per user.

**How the automatic strike works, and why it is a trigger:** an `AFTER INSERT`
trigger on `exam_integrity_events` counts that user's **high-confidence** events
and opens a restriction at the threshold read from `system_settings`. Server-side
evaluation means a client cannot skip enforcement by simply not calling an RPC.
It cannot fix the deeper limit — a client that reports nothing is not detected —
and this plan does not pretend otherwise.

**Reversibility, per the "no irreversible automatic action" requirement:** the
automatic path only ever creates a row with `review_status='pending'`. It never
deletes, never touches `profiles`, and never affects any surface other than the
Mock Exam. Admin restores by lifting; upholding is an explicit act with a note.

**RLS:**
- Student `SELECT` own — required, so the page can tell them they are restricted
- No student `INSERT` / `UPDATE` / `DELETE`
- Admin `SELECT` all; writes via `service_role` (`admin-actions`)

**Seeds:** default thresholds into `system_settings` via `INSERT … ON CONFLICT DO NOTHING` — additive, non-destructive.

**Rollback:** paired file, dropping the trigger before the table.

---

### ⬜ Migration 3 — Question Engine spine

**Purpose:** the content architecture for originally authored Si Math exams. No
delivery, no attempts, no student access.

**Tables created:** `exam_forms`, `exam_form_sections`, `exam_questions`

- **`exam_forms`** — `id`, `code` UNIQUE, `exam_code`, `title`,
  `status` (`'draft'|'review'|'published'|'retired'`), `taxonomy_version`,
  `created_by`, `created_at`, `published_at`
- **`exam_form_sections`** — `id`, `form_id` FK CASCADE, `ordinal`, `label`,
  `question_count`, `duration_minutes`, `calculator_allowed`; UNIQUE `(form_id, ordinal)`
- **`exam_questions`** — `id`, `section_id` FK CASCADE, `ordinal`, `prompt`,
  `question_format` (`'mcq'|'grid_in'`), `choices jsonb`, `correct_answer`,
  `explanation`, `difficulty`, `topic_id` FK → `taxonomy_topics(id)`,
  `subtopic_id` FK → `taxonomy_subtopics(id)`, `skill`,
  `status` (`'draft'|'review'|'approved'|'retired'`);
  UNIQUE `(section_id, ordinal)`

**Originality, enforced in the schema:**
`content_origin text NOT NULL CHECK (content_origin = 'original_si_math')`, plus
`authored_by`, `originality_attested_at`, `originality_attested_by`.

**RLS:** **no student policy of any kind.** Admin `SELECT`; writes `service_role`
only. This is the "smallest safe path" — the schema exists and authoring can
start, while students cannot reach it until a later, separately approved phase
opens a published-only read path.

**Rollback:** paired file, dropping in FK order.

---

### ⬜ Migration 4 — `saved_questions`

**Purpose:** the student's persistent personal collection. Data architecture
only; the save control ships with the delivery engine.

**Depends on Migration 3** — the FK target must exist first.

**Tables created:** `saved_questions`

**Columns:** `id`, `user_id` → `auth.users` CASCADE, `question_id` →
`exam_questions(id)` CASCADE, `saved_at`, `note`, `source_context jsonb`
(exam code, form, attempt — the context they saved it *from*).

**UNIQUE `(user_id, question_id)`** — saving twice is idempotent, unsave is a delete.

**No content duplication.** The row is a reference; question text lives once in
`exam_questions`, per the specification's own instruction.

**RLS:** student full CRUD on own rows only; admin `SELECT`. Answer/explanation
visibility is *not* decided here — that is the review policy, and it belongs with
the delivery engine.

**Rollback:** paired file.

---

## 3. Exact existing files to modify

| File | Phase | Change | Notes |
|---|---|---|---|
| `mock-exam.html` | 1b, 2, 3, 4, 5 | Consume registry; module state machine; mount audio/calculator/integrity; restriction check | ⚠️ **The one unfrozen file.** Minimal diffs only |
| `.gitattributes` | 3 | Declare audio extensions binary | **Must land before any binary.** `text=auto eol=lf` would corrupt an `.mp3` |
| `settings.html` | 3 | Announcements toggle; Realistic Exam Environment | Not frozen |
| `admin.html` | 5 | Integrity review tab; restriction management | Not frozen; follows the existing `id="tab-*"` pattern |
| `supabase/functions/admin-actions/index.ts` | 5 | Add `restore_mock_exam_access`, `uphold_mock_exam_restriction` | ⚠️ **Manual Edge Function deploy — `DEPLOY.md` §4 only.** Never the inline MCP deploy tool |
| `CLAUDE.md` | 1 | Record the scoped unfreeze and its boundary | So the next session knows what was authorised, and what was not |

**`tests/run-all.mjs` needs no change** — it globs `readdirSync(HERE).filter(f => f.endsWith('.test.mjs'))`, so new suites are picked up automatically.

**Files explicitly NOT touched:** `exam-mistakes-logger.js`, `regenerate-reports.js`,
`weakness.html`, `focus.html`, `taxonomy.js`, `taxonomy.core.js`, `mastery-updater.js`.

---

## 4. New modules and files to create

**Runtime modules** — all dependency-free, browser + Node, no build step:

| File | Phase | Responsibility |
|---|---|---|
| `exam-registry.js` | 1 | Exam configs as data: modules, timing, calculator policy, schedules |
| `exam-audio.js` | 3 | The shared bus: context, unlock, channels, ducking |
| `exam-proctor.js` | 3 | Announcement schedules; TTS with visual fallback |
| `exam-ambience.js` | 3 | Randomised scheduler; no-repeat, no-overlap |
| `exam-calculator.js` | 4 | Panel host + provider registry (zero providers) |
| `exam-integrity.js` | 5 | Detectors, confidence classification, reporting |

**Assets** (Phase 3, after `.gitattributes`): `assets/exam-ambience/*.mp3` —
**originally recorded**, ~6–8 clips, 1–3 s, mono, total under ~500 KB, each with
its provenance recorded in a sibling `LICENCE.md`.

**Tests** (one per module, in the existing style — real shipped source via `tests/_source.mjs`):
`exam-registry.test.mjs`, `exam-proctor.test.mjs`, `exam-ambience.test.mjs`,
`exam-calculator.test.mjs`, `exam-integrity.test.mjs`, `exam-timer-modules.test.mjs`.

Per `verification-framework-audit.md`: *a green check is only evidence if it
could have gone red.* Each suite asserts real behaviour — schedule boundaries,
no-consecutive-repeat, confidence classification, the module state machine —
never mere presence.

**PREPARED migrations** (unapplied, in `supabase/migrations-pending/`): four
`.sql` files plus four `*_rollback.sql`.

**Documents:** `docs/roadmap/mock-exam-v2-desmos-partnership-brief.md` (§7 below).

---

## 5. Dependencies, and what ships independently

```
P1 Registry ──┬──▶ P2 DSAT modules ──▶ P3 Audio (proctor per module)
              ├──▶ P4 Calculator socket
              └──▶ P5 Integrity            [M1 → M2]

P6 Question spine [M3] ──▶ P7 Saved Questions [M4]
```

**Genuinely independent — shippable alone, in any order:**

- **P1a** (registry + tests, consumed by nothing) — zero production risk
- **P4** (calculator socket) — needs P1; touches nothing else. No DB
- **P5** (integrity) — needs M1 + M2 + an Edge deploy; independent of all audio and calculator work
- **P6** (question spine) — needs M3 only. **Completely invisible to students** — no read path exists
- **P7** (saved questions) — needs M3 then M4. Also invisible; no UI by decision

**Hard orderings:**

- **M3 before M4** — the FK target must exist
- **M1 before M2** — the trigger attaches to the events table
- **P1 before P2/P3/P4** — all three read their config from the registry
- **P2 before P3's DSAT announcements** — per-module scheduling needs module boundaries
- **`.gitattributes` before any audio binary** — otherwise the first `.mp3` is corrupted on commit

**Decoupled on purpose:** the ambience *engine* (P3 code) ships before the
ambience *assets*. An empty library is inert, not broken — so the recording
session never blocks the release.

---

## 6. Remaining approval gates

| Gate | What is being asked | Blocks |
|---|---|---|
| **G1** | Approve **Migration 1** (`exam_integrity_events` + additive `attempt_id` column) | P5 |
| **G2** | Approve **Migration 2** (`mock_exam_restrictions` + enforcement trigger) | P5 |
| **G3** | Approve **Migration 3** (question engine spine) | P6, then P7 |
| **G4** | Approve **Migration 4** (`saved_questions`) | P7 |
| **G5** | **Student visibility of their own integrity events** — the plan proposes no student read path; disclosure happens via the pre-exam notice and warnings. Data-protection practice often favours a subject-access route. Your call | M1 RLS |
| **G6** | **Pre-exam integrity disclosure copy** — students must be told what is recorded before it is recorded. Needs your wording, or approval of mine | P5 |
| **G7** | **`admin-actions` redeploy** — manual, `DEPLOY.md` §4 only | P5 |
| **G8** | **Ambient recording session** — who records the 6–8 clips | P3 assets only |
| **G9** | Confirm **"Egyptian Scholastic Test (EST)"** is the exact student-facing string | P1 |

**Not a gate, but flagged:** `main` and the deployed `ai-tutor` Edge Function
were already out of sync before this work (`CLAUDE.md` records v101 merged and
undeployed). None of this plan touches `ai-tutor`, but P5 does require an
`admin-actions` deploy, and that deploy must not be used as an opportunity to
ship anything else.

---

## 7. Desmos partnership brief — what to ask for

Prepared per decision 1, for the conversation with `partnerships@desmos.com`.
**Si Math AI has no permission from Desmos, and nothing here implies otherwise.**
Nothing Desmos-related gets built until a written agreement exists.

### Who is asking

Si Math AI — an Egyptian exam-preparation platform for Digital SAT, ACT and EST
mathematics. Commercial: paid subscriptions in EGP. Students are Egyptian
secondary candidates, many of them minors.

### Why Desmos specifically

The Digital SAT delivers Desmos **inside Bluebook**, and the online ACT delivers
Desmos in its Math section. For DSAT preparation there is no substitute: a
different calculator teaches different muscle memory. This is a fidelity
requirement, not a preference — which is exactly why the interim decision is to
ship *no* calculator rather than a look-alike.

### What we would need to ask for

1. **A commercial integration agreement** — Si Math AI is neither "an end user
   for personal, non-commercial use" nor "a School … in individual classes", the
   only two uses the public ToS permits.
2. **An API key**, with the features enabled that we need: **graphing** and
   **scientific** at minimum (matching what Bluebook offers). Feature enablement
   is per key and readable at `Desmos.enabledFeatures`.
3. **Self-hosting rights**, if available under the agreement. Two concrete
   reasons, both worth stating plainly:
   - Our security policy pins every third-party script with Subresource
     Integrity computed from an npm tarball. The Desmos API is not distributed
     that way and is patched in place, so we cannot pin it as delivered.
   - Our exam pages are being built to protect proprietary question content; we
     would prefer to isolate any third-party code rather than run it inline in
     that document.
4. **Written confirmation of the permitted embedding model** — we will implement
   exactly what the agreement and the official integration documentation
   specify, and nothing beyond it.
5. **Commercial terms** — pricing basis, term, student-volume tiers, territory
   (Egypt / MENA), and any attribution or branding requirements.

### What we will not do meanwhile

No embedding. No iframing, framing or mirroring of the Desmos tools. No
presenting any other calculator as a Desmos or DSAT equivalent. No implication of
partnership or endorsement.

### Engineering position

The provider architecture is being built now so that a licensed integration is a
**registration plus a config change**, not a rewrite. Whenever the agreement
lands, integration is small. If it never lands, nothing is stranded — the socket
simply stays empty, which is a supported configuration by design.

---

## 8. What happens on approval

1. Phase 1a — `exam-registry.js` + tests. Nothing consumes it; nothing can break.
2. Phase 1b — the minimal `mock-exam.html` diff.
3. Phases 2–4 in order; each with tests, each keeping CI green.
4. Migrations written to `supabase/migrations-pending/` **for review** —
   presented individually, applied only on individual approval.
5. Phase 5 last of Project A, because it is the only one needing an Edge deploy.
6. Phases 6–7 whenever their migrations are approved; both invisible to students.

Engineering records continue per convention: investigation → engineering review →
release report → closeout, under `docs/roadmap/`. The public knowledge layer stays
frozen; if any of this reaches students, the
Knowledge Graph → Documentation → Website pipeline applies then, and not before.
