# Production Audit — 2026-07-26

Audit of four reported issues. Every finding below was reproduced against the
code or the live database (project `igvkyxkmjnkzscqgommj`) before a fix was
written — none are speculative.

| # | Item | Status |
|---|------|--------|
| 1 | Streak calculation | **Fixed** — `assets/streak.js`, `dashboard.html` |
| 2 | Mock exam count in Weakness Analyzer | **Patch ready, not applied** — `weakness.html` is frozen |
| 3 | Weakness signal source attribution | **Patch ready, not applied** — `weakness.html` is frozen |
| 4 | AI chat domain restriction | **Fixed in source, NOT DEPLOYED** — `ai-tutor` v87 |

---

## 1. Streak calculation — root cause found and fixed

### The bug

`assets/streak.js` seeded its activity set with today unconditionally:

```js
const dateSet = new Set([todayStr]);   // ← today is always "active"
```

`dashboard.html` calls `updateStreak()` on **every page load**, whether or not
the student practised. So merely opening the dashboard counted as a day of
practice — but only in memory, for that one render. Nothing was written to
`question_records`, so the next recompute could not see it.

That produces exactly the reported symptom — increments, then an unexplained
reset a day or two later:

| Day | Student action | Streak shown | Why |
|-----|----------------|--------------|-----|
| Mon | Solves questions | 1 | Real record on Mon |
| Tue | Opens dashboard only | **2** | Phantom Tue + real Mon |
| Wed | Opens dashboard only | **1** | Phantom Wed; Tue has no record → chain breaks |

The student sees 1 → 2 → 1 without doing anything differently.

### Second, worse failure path

The same seed made a transient query failure destructive. If
`question_records` and `exam_practice_sessions` both failed (offline, RLS
hiccup, transient 5xx), the recompute saw an empty history, the seed supplied
today, and the function wrote `current_streak = 1` over a legitimate streak of
any length. A page load that had nothing to do with practising could silently
truncate a 40-day streak.

### Third: the streak died at midnight

Even with the seed removed, the original walk started at today and stopped
immediately if today had no activity. A student who practised for five days
through yesterday and opened the app on the sixth morning would read **0**,
then jump back to 6 after one question. A streak must survive the whole of the
day after the last activity.

### What changed

`assets/streak.js`:

- **No phantom day.** Today is counted only when there is real activity. An
  optional `updateStreak(sb, uid, { activityToday: true })` hint remains for
  callers that write-then-recompute; it must never default to true.
- **Anchor rule.** Count back from today if active today, else from yesterday
  if active yesterday, else the streak is genuinely 0. This is the correct
  midnight behaviour.
- **Failure guard.** If both primary activity sources error, the function logs
  and returns the stored values **without writing**. A transient failure can no
  longer wipe a streak.
- **Honest `last_active_date`.** Now the real last day of activity, not
  `today` stamped on every call.
- **`best_streak` is a true high-water mark:** `max(window best, current,
  stored best)`.
- **Window widened by one day** so the oldest Cairo day in range isn't
  half-truncated by the UTC lower bound (Cairo is UTC+2/+3).

`dashboard.html`:

- Passes no `activityToday` hint — opening the dashboard is not practising.
- The weekly heatmap now consumes the `active_days` set that `updateStreak`
  already computed, instead of rebuilding it from `question_records ∪ exams`.
  The old local rebuild **omitted Focus Practice**, so a Focus-only day lit the
  streak counter but left the heatmap cell dark. The two are now derived from
  one computation and cannot disagree. The local rebuild is retained as the
  degraded path.

### Timezone handling — audited, no change needed

Day boundaries were already pinned to `Africa/Cairo` via `Intl.DateTimeFormat`
with `en-CA`, in both `streak.js` and the dashboard heatmap. This is correct
and deliberate: using the device timezone made the same student compute
different day splits on a Cairo device vs. a VPN/UTC device. Day arithmetic
maps each Cairo day-key to a UTC-midnight epoch, so DST transitions cannot
introduce 23/25-hour drift. Verified by test, including activity at 23:55 and
00:05 Cairo local.

### Verification

16 scenarios covering every case in the brief — timezone, UTC vs local,
multiple sessions per day, missed days, midnight edges. All pass on the fixed
code; **8 of the 16 fail on the pre-fix code**, including all four that
reproduce the reported symptom.

---

## 2 & 3. Weakness Analyzer — sources and mock exam count

> ⚠️ **Not applied.** Both bugs are in `weakness.html`, a frozen file. The fix
> is written, syntax-checked and behaviour-tested, and is supplied as
> `docs/audit/patches/weakness-sources-and-mock-count.patch`
> (`git apply` — verified to apply cleanly against current `weakness.html`).

### Root cause — one line, both bugs

```js
function renderSources(signals){
  const chatSigs=signals.filter(s=>s.source==='AI_CHAT').length;
  const examSigs=signals.filter(s=>s.source&&s.source!=='AI_CHAT').length;  // ← everything else
```

The "Mock Exams" figure is **not a count of mock exams**. It is a count of
weakness *signals* whose source is anything other than `AI_CHAT`. It never
queries `exam_practice_sessions` at all.

Live source distribution in `weakness_signals`:

| source | rows |
|---|---|
| `AI_CHAT` | 634 |
| `FOCUS_PRACTICE` | 111 |
| `MOCK_EXAM` | 10 |

So 111 Focus Practice signals are being displayed to students as mock exams.

### Per-student impact (live data)

| user | "Mock Exams" shown today | actual completed mock exams |
|---|---|---|
| `e5570d10` | **117** | 12 |
| `bfc32020` | 2 | 3 |
| `0469b960` | 1 | 2 |
| `b38a191c` | 1 | **0** |
| `831ba31b` | 0 | **1** |

Every student with data sees a wrong number. One sees 117 for 12 exams; one
sees a mock exam count of 1 having never completed a mock exam.

### Which table is authoritative — verified

`exam_practice_sessions` is correct for "completed mock exams":

- A row is inserted **only on submit**, from the grading path in
  `mock-exam.html`. Abandoned or in-progress attempts never insert.
- All 18 live rows have `ended_at` set — confirmed, no partial rows.
- There is no soft-delete column, so deleted exams are hard deletes and drop
  out on their own.

The patch counts with `{ count: 'exact', head: true }` (server-side count, so
the displayed value always equals the table and never hits the 1000-row
PostgREST cap) and adds `.not('ended_at','is',null)` so the count stays
"completed only" even if a future change starts writing a row at exam start.

### Source attribution (item 3)

The section had exactly **two hardcoded boxes**. Focus Practice, Study Planner
and Manual Practice had nowhere to appear, so they were absorbed into "Mock
Exams". The patch generates one box per source actually present, and an
unrecognised source renders under a readable form of its own key
(`FUTURE_ENGINE` → "Future Engine") rather than being folded into another
bucket — so a new AI system added later cannot be silently misattributed.

Three further attribution bugs fixed by the same patch:

- **`NULL`-source signals were invisible.** `renderSources` counted them in
  neither box (`s.source==='AI_CHAT'` excludes null; `s.source && …` also
  excludes null). They now appear as "Unknown Source".
- **The same signal was attributed two different ways on one page.**
  `renderSignalCols` treated a null source as chat (`!s.source||…`) while
  `renderSources` counted it as neither.
- **Per-weakness evidence rows had no source.** `loadEvidenceBatched` handled
  only `AI_CHAT` and `MOCK_EXAM`; every Focus Practice signal fell to a generic
  branch rendering "Earlier signal" with a raw lowercase `focus_practice` key
  clipped inside a 42px box. They now carry a real label, a description of the
  signal, and a link to Focus Practice.

Also in the patch: the "Exam Practice Signals" column header becomes "Practice
& Exam Signals" with a per-row source tag (it never contained exams only), and
`row.src` is now passed through `esc()` like every other interpolated field.

---

## 4. AI chat domain restriction — `ai-tutor` v87

> ⚠️ **Source changed, NOT DEPLOYED.** Per `DEPLOY.md` §4 the function must be
> deployed via Path B (Supabase CLI) only — it is a multi-file bundle and the
> inline MCP deploy path is prohibited. See "Deploying" below.

### Finding: there was no domain restriction at all

`NORMAL_SYSTEM_PROMPT` contained **no scope constraint of any kind**. Nothing
in the prompt or the handler prevented Zero from answering politics, religion,
programming, medical or legal questions. The existing `is_math` flag is a
*recording* classifier — it decides whether a turn is written to
`question_records` and mastery — not a gate; `is_math: false` turns were
answered normally. There was nothing to tighten; the guardrail did not exist.

### What was added

**Prompt layer.** A `## 🎯 DOMAIN SCOPE` section high in the priority
hierarchy, defining three labels:

- `math` — mathematics, SAT / EST / ACT / American Diploma math.
- `coaching` — **in scope, answered warmly.** Exam anxiety, fear of failing,
  confidence, motivation, study habits, time management, burnout, stress before
  exams, test-taking mindset, encouragement after poor scores, goal setting,
  productivity for studying math. Every example in the brief ("I'm afraid I
  won't get an 800", "I failed my last mock exam", "I'm losing motivation")
  lands here and is answered with empathy plus one concrete action.
- `out_of_scope` — politics, religion, medical, legal, programming, non-math
  science, history, geography, entertainment, unrelated personal opinions,
  other subjects' homework.

Borderline cases are resolved **toward answering**: a physics or finance
problem that is really a math problem is math; a message mixing math with
something off-domain gets the math answered and the rest ignored; when unsure,
the model must pick `math` or `coaching`. A self-harm or crisis message
explicitly overrides the redirect and is handled as coaching.

**Server layer.** The model returns `scope` in its JSON. The handler
re-decides via `resolveScope()` and, on `out_of_scope`, **discards the model's
drafted answer** and substitutes a canonical redirect in the student's language
(English / Arabic / Franco). Classifying a turn out-of-scope and then answering
it anyway is the failure mode this makes impossible.

The redirect is warm, not a wall: it names what Zero does specialise in and
offers a concrete way back in ("send me a problem, or tell me what's worrying
you about the exam"). It never lectures and never says "as an AI language
model".

**Fail-open by design.** Wrongly refusing a student mid-revision is far worse
than answering one stray off-domain question, so the guard allows the turn
whenever there is any doubt:

- an image upload → always in scope (an upload here is always a problem)
- a resolved worksheet reference → always in scope
- a missing, empty, malformed or unrecognised `scope` → in scope

`hint_mode` is deliberately **not** an exemption: it arrives on the request
body, so exempting it would let a crafted `{"hint_mode": true}` payload walk
the guard. `HINT_SYSTEM_PROMPT` classifies scope too, so hint turns are covered
by the same check.

**No data pollution.** An out-of-scope turn early-returns before persistence:
no `question_records` row, no weakness signal, no mastery movement, no taxonomy
entry. Verified that the client's mastery path also skips it —
`TaxonomyWrite.canonical({topic:'General'})` resolves to `null`, and
`logUnmapped` short-circuits on non-academic topics, so
`unmapped_detections` is not polluted either.

**Observability.** `[ai-tutor] scope-guard-fired` logs the raw label, language,
and whether the model had drafted an answer. The response envelope gains
additive `scope` and `scope_guard` fields.

### Verification

46 assertions pass, covering all six "should be allowed" examples, all nine
"should not be answered" categories, ten malformed-label fail-open cases, label
normalisation, and redirect-message quality in all three languages.

---

## 4a. Zero personality — regression check

Requested check: the guardrail must control **what** Zero talks about, never
**how** Zero talks.

### The personality layer is untouched

The full diff of `supabase/functions/ai-tutor/index.ts` removes exactly **two
lines** — the two version strings:

```
-// ai-tutor Edge Function v86
-const AI_TUTOR_VERSION = 'v86';
```

Everything else is an addition. `${personality}` still sits at Priority 1 of
`NORMAL_SYSTEM_PROMPT`, loaded from `zero_knowledge_entries` slug
`zero_personality`. The SELF-CHECK line, the eight-point Final Personality
Checklist, the Coaching Persona section, the Identity Q&A block, the
name-usage rules, the language locks and the v78 tone anchor are all
byte-identical. Nothing was replaced or reordered.

### Greetings and coaching still reach the model

Greetings, small talk and every coaching case classify as `coaching`, which is
**not blocked**. Those turns flow through the unchanged `NORMAL_SYSTEM_PROMPT`
with the full personality at Priority 1 and the tone anchor applied, exactly as
before. The DOMAIN SCOPE section explicitly lists greetings and identity
questions under `coaching` so they cannot drift into a redirect.

### One real regression found — and fixed

The first version of the redirect was a **single hardcoded string per
language**. Because the server discards the model's text on an out-of-scope
turn, that string *is* Zero for that turn — and it bypassed the personality
layer: same sentence every time, no catchphrase, no variation. The
`zero_personality` entry explicitly asks Zero to vary his phrasing.

Rewritten to the personality entry's own spec: **three variants per language**
(English / Arabic / Franco), selected by a djb2 hash of the student's message,
so a student who wanders off-topic twice does not get the identical sentence
back. Each variant carries the 🐉 anchor, the student's first name, an emoji,
warm older-sibling phrasing, Egyptian dialect in the Arabic set, and a concrete
way back into math. None contains a phrase the personality entry bans
("Certainly!", "Of course!", "Great question!", "as an AI language model").
The `Student` fallback placeholder is never spoken aloud.

64 assertions cover this, including dialect markers, emoji presence, variant
distinctness, and absence of stiff MSA refusal phrasing in Arabic.

---

## 4b. Server-side override — persistence audit

Requested check: on `out_of_scope`, confirm the model's generated response is
discarded and never persisted anywhere.

### Where an AI response can be stored — full schema sweep

An `information_schema` sweep of every column in `public` matching
`response|answer|content|message|body|transcript|completion|output|reply|text`,
plus every table matching `log|telemetry|analytic|monitor|audit|event`, returns
exactly **one** column that stores a model-generated answer:

> `question_records.ai_response`

Nothing else in the schema holds AI response text. `ai_usage_logs` stores token
counts and cost only. `response_feedback` stores a `record_id` and a feedback
label. `unmapped_detections.context_excerpt` is written only via
`log_unmapped_detection`, downstream of the guard.

### Every write path, relative to the guard

The guard early-returns at line 2683, immediately after the JSON parse. Every
write that could carry response text happens **after** it:

| Write | Line | Relative to guard | Carries AI text? |
|---|---|---|---|
| `question_records` insert | 2880 | after — never reached | **yes** (`ai_response`) |
| `log_unmapped_detection` | 2852 | after — never reached | no |
| `session_questions` insert | 2948 | after — never reached | no (image path only) |
| `verification_meta` update | 3023 | after — never reached | no |
| `chat_sessions` insert/update | 1596/1612 | before | no (session metadata only) |
| `profiles.language_preference` | 1705 | before | no |

The three earlier early-returns (idempotency recovery, worksheet guard, repeat
path) all precede the guard and none of them can carry an out-of-scope draft:
the repeat path only runs when a parent `question_records` row already matched,
i.e. the student is following up on a math question they already asked.

### Downstream surfaces

- **Chat history** — reconstructed from `question_records` (`openSession()`
  selects by `session_id`). No row means the turn never appears in history.
- **AI Monitor** — `ai-monitor.html` reads only `profiles`,
  `question_records`, `response_feedback`, `system_settings`. All downstream of
  `question_records`; invisible without a row.
- **`weakness_signals`** — written client-side from the SignalEngine buffer,
  gated on `is_math`/topic. The guard returns `is_math:false`,
  `weakness_signal:false`, `topic:'General'`, so no signal is emitted.
- **Mastery / taxonomy** — `TaxonomyWrite.canonical({topic:'General'})`
  resolves to `null`, so the mastery write is skipped, and `logUnmapped`
  short-circuits on non-academic topics, so `unmapped_detections` is not
  touched either. Verified directly against `taxonomy.js`.
- **Client-side storage** — `chat.html` writes only drill state, an inflight
  request id and a refund queue to local/session storage. No response text is
  cached.
- **Logs** — `[ai-tutor] scope-guard-fired` records the raw scope label,
  language, question length and a `had_answer` **boolean**. The drafted text is
  never logged. `parse-failed` (which can echo a JSON fragment) cannot co-occur
  with a fired guard: a turn can only be classified out-of-scope if its JSON
  parsed successfully.

### Conclusion

The model's drafted answer for an out-of-scope turn exists only as a local
variable and is discarded when the handler returns. The only text that leaves
the function is `scopeRedirectMessage(...)`, and because no row is written,
nothing is persisted at all — not the redirect either. This matches the
existing worksheet-guard behaviour.

---

## 4c. Deployment status — BLOCKED, not deployed, NOT VERIFIED

The Edge Function has **not** been deployed, and the seven production
scenarios have **not** been run. Nothing in this document should be read as
production verification of item 4.

Evidence the guardrail is not live:

- The `ai-tutor` function was last deployed **2026-07-19 14:35 UTC**
  (platform version 114). The v87 commits are dated **2026-07-26 / 27** —
  eight days later.
- The branch `claude/production-audit-verification-3j1chx` is not merged;
  `origin/main` is still at `be10c26`.

`DEPLOY.md` §4 requires Path B (Supabase CLI) for any version importing
`_shared/`, and this environment has neither the `supabase` CLI nor
`SUPABASE_ACCESS_TOKEN`, nor a test JWT to run the verifier against. The
prohibited MCP deploy path was not used.

Deploy, then verify:

```bash
supabase functions deploy ai-tutor --project-ref igvkyxkmjnkzscqgommj

SUPABASE_PROJECT_REF=igvkyxkmjnkzscqgommj \
SUPABASE_ANON_KEY=... SUPABASE_TEST_JWT=... \
SUPABASE_DB_URL=postgres://... \
  ./scripts/verify-scope-guardrail.sh
```

`scripts/verify-scope-guardrail.sh` runs all seven requested scenarios against
the deployed function and asserts both halves of the contract:

| # | Scenario | Asserted |
|---|---|---|
| 1 | Math question | `scope_guard=false`, `is_math=true`, `version=v87` |
| 2 | "I'm afraid I won't get 800" | `scope_guard=false`, substantive reply, emoji tone, no banned bot phrase |
| 3 | Programming | `scope_guard=true`, `record_id=null`, redirect keeps 🐉 |
| 4 | Politics | same |
| 5 | History | same |
| 6 | Image worksheet | `scope_guard=false`, `is_math=true` |
| 7 | Follow-up in the same session | `scope_guard=false`, non-trivial answer |

It also proves the negative when `SUPABASE_DB_URL` is supplied: zero
`question_records` rows for the blocked turns, zero rows with
`subtopic='Out of Scope'`, and zero out-of-scope `weakness_signals`. Exit 1
means the guardrail is not verified.

---

## 4d. Credits on blocked requests — changed to refund

**Finding.** A blocked turn cost the student **5 credits** (`AI_CHAT_MESSAGE`,
from `credit_costs`) and was **not** refunded. `chat.html` pre-authorises via
`CreditConfig.charge()` → `consume_credits` *before* calling the function, and
the only refund path is the `.catch()` on AI failure. The guard returns HTTP
200, so that path never fired and the student paid for a refusal. On the free
tier two stray off-topic questions burned 10 credits.

**Decision (approved):** refund blocked turns. A redirect is not a tutoring
service.

**Implementation** — `chat.html`, in the `askAI()` success handler:

```js
if (response && response.scope_guard === true) {
  SignalEngine.discardBuffer();
  if (creditLogId) { sb.rpc('refund_ai_credit', { p_log_id: creditLogId }) … }
  …
  return;   // .finally() clears inflight + re-enables the composer
}
```

It reuses the existing `refund_ai_credit` RPC and the `enqueueRefund` retry
queue, so a transient refund failure is retried on the next page load rather
than lost — identical to the AI-failure path. The early return also discards
the signal buffer and skips the detected-questions, mastery and taxonomy
blocks, which is belt-and-braces: the server already returns `is_math:false`
and `topic:'General'`, so none of them would have emitted anything.

Note this leaves a pre-existing inconsistency untouched: `worksheet_guard` also
returns 200 without a refund, and it fires *before* any OpenAI call, so it
charges 5 credits for zero AI cost. Out of scope for this audit — flagging it
as a candidate for the same treatment.

The verifier asserts the policy via `EXPECT_CREDIT_REFUND` (default `true`).

---

## 4e. Regression risk for existing math features

These are **structural guarantees read from the code**, not production
observations. Scenarios 1, 6 and 7 of the verifier confirm the first three
against the live function once deployed.

| Feature | Why the guard cannot regress it |
|---|---|
| **AI Tutor (math)** | The guard fails open on every axis. A math turn is labelled `math`; a missing or malformed label is also treated as in scope. |
| **Follow-up / re-explain** | The repeat path early-returns at line 2018, **before** the guard at 2683. It only runs when a parent `question_records` row already matched, so a follow-up is structurally unreachable by the guard. |
| **Image solving** | `hasImage` is an unconditional in-scope bypass, evaluated before the label is even read. An uploaded worksheet cannot be refused. |
| **Study Planner** | **Never calls `ai-tutor`.** `studyPlanIntent(text)` intercepts in `chat.html:send()` and routes to the local `window.StudyPlanner.buildStudyPlan()` engine — a deterministic, non-LLM path. The guard is not in its call graph. |
| **Weakness Analyzer** | Reads `weakness_signals` / `weakness_reports`. Blocked turns write neither, so no new rows appear and no existing row changes. `regenerate-reports.js` is untouched. |

The one behaviour that does change for in-scope turns is the additive `scope`
and `scope_guard` fields on the response envelope. No client reads them except
the new refund branch, and unknown fields are ignored elsewhere.

Type-check is clean: `tsc --noEmit` reports only the 10 pre-existing
`Deno`/remote-import errors that `tsc` cannot resolve by design.
`scripts/validate-ai-tutor-source.sh` passes.

### Deploying

Not deployed by this change. Per `DEPLOY.md` §4:

```bash
supabase functions deploy ai-tutor --project-ref igvkyxkmjnkzscqgommj
```

Path B (CLI) is **required** — the function imports `_shared/taxonomy.core.js`
and the Dashboard copy-paste path would ship `index.ts` alone and 500 on cold
start. After deploying, confirm the bundle lists both `index.ts` and
`_shared/taxonomy.core.js`, then run the §6 smoke test.

No migration is required for any item in this audit.

### Note on the size validator

`scripts/validate-ai-tutor-source.sh` failed after this change: the source grew
to ~176 KB against a 170 KB ceiling. The ceiling is a sanity check against
truncation and ballooning, previously bumped 150 → 170 KB at v82. It is raised
to 190 KB here with the reason recorded inline. All structural checks — the
`serve()` handler guard that exists to catch the 2026-06-17 stub incidents —
pass unchanged.

---

## Files changed

| File | Change |
|---|---|
| `assets/streak.js` | Streak recompute correctness (item 1) |
| `dashboard.html` | No phantom-activity hint; heatmap shares the streak's day set (item 1) |
| `supabase/functions/ai-tutor/index.ts` | Domain scope guardrail, v86 → v87 (item 4) |
| `chat.html` | Refund the credit on a blocked (out-of-scope) turn (item 4d) |
| `scripts/validate-ai-tutor-source.sh` | Size ceiling 170 → 190 KB, reason recorded |
| `scripts/verify-scope-guardrail.sh` | New — post-deploy verification of the seven scenarios |
| `docs/audit/patches/weakness-sources-and-mock-count.patch` | Items 2 & 3, **unapplied** — `weakness.html` is frozen |

No frozen file was modified. No migration was created. The Edge Function is not
deployed.

---

# Phase 2 — continued audit of non-frozen production issues

Merged to `main` as `024d2ae`; Phase 2 work continues on the feature branch.
Every issue below was reproduced before a fix was written, and each fix has a
regression test that fails against the old code.

## P2-1. Progress page showed a stale streak

`progress.html` rendered `current_streak` / `best_streak` straight from
`profiles` and never recomputed them — `assets/streak.js` was not even loaded.
The recompute ran only on the dashboard and at the three activity call sites.

Once a student broke their streak, `profiles` kept the last written value until
something recomputed it. A student who missed two days and opened Progress
without passing through the Dashboard saw the old non-zero streak while the
Dashboard showed 0 — two pages disagreeing about the same number, for the same
student, at the same moment.

**Fixed:** load `assets/streak.js`, call `updateStreak` before the profile read,
mirroring dashboard.html. No `activityToday` hint — viewing a page is not
practising.

## P2-2. Dead 500-row query on every Progress load

`results[3]` fetched up to 500 `chat_sessions` rows, commented "for streak
calculation". The result was assigned to `chatSess` and never read again — the
streak had moved to the profiles columns and the query was left behind.

**Fixed:** removed and the `Promise.all` indices renumbered. Verified by
extracting the array and asserting all 7 `results[N]` usages still resolve to
their intended table.

## P2-3. Exam countdown was off by one, every day

The countdown was implemented **four times** (dashboard, progress, focus,
ai-tutor) and all four disagreed.

`exam_date` is a Postgres DATE, so it arrives as `'YYYY-MM-DD'`, and
`new Date('YYYY-MM-DD')` parses that as **UTC midnight** — not local midnight.
Every client copy subtracted that UTC instant from a local midnight (or from
`Date.now()`) and rounded up with `Math.ceil`, turning the leftover UTC offset
into a whole extra day.

In Cairo (UTC+2/+3) `dashboard.html` was off by exactly **+1 every day**: a
student whose exam was TODAY was shown "1 day left" while Zero, which
normalises both operands, correctly said 0. `progress.html` had a second
variant that measured from `Date.now()`, so its answer **drifted with the time
of day** — "1 day" in the afternoon, "2 days" just after midnight, for an
unchanged exam date.

**Fixed:** new `assets/exam-days.js` is the single source of truth. It never
parses the date as an instant; both sides reduce to a calendar day key, which
is exact, DST-proof and device-timezone independent. Pinned to Africa/Cairo,
matching `assets/streak.js`. 17 assertions, including a direct assertion that
the old formula returns 1 on exam day where the helper returns 0.

`focus.html` holds a fourth variant, but it is **dead code** — `daysUntilExam`
is assigned and never read — so there is no user impact and no patch is needed.

## P2-4. Every drill completion silently lost an XP award

`awardChatXP()` is a read-modify-write on `profiles.xp`. In the `askAI` success
handler, `chat.html` calls `awardChatXP()` and then `drillOnQuestionAnswered()`,
neither awaited; on the last question of a drill the latter synchronously calls
`awardChatXP(DRILL_BONUS_XP)`. Both start in the same tick, both read the same
pre-award `xp`, and whichever UPDATE lands second overwrites the first.

This was not an occasional race — it happened on **every** drill completion,
losing either the +5 per-question award or the +30 drill bonus.

**Fixed:** the UPDATE is filtered on the `xp` that was read, so a stale write
matches zero rows instead of clobbering; on a miss the loop re-reads and retries
(max 5). Read/write errors now abort rather than falling through and writing a
value derived from a failed read. Verified by racing the CAS block — extracted
from `chat.html` itself — against a mock client with real PostgREST filter
semantics: the drill pair now sums to 135 where the old code gave 130.

`mock-exam.html` has the same read-modify-write but is **frozen**, and has no
concurrent award path, so impact is limited to multi-tab use.

## P2-5. History rendered "0 days ago" and mislabelled dates

`relDate()` computed `Math.floor((now - d) / 86400000)` — elapsed 24-hour
periods — but every label it feeds is a calendar-day concept. Viewed at 08:00:
a session from 23:00 yesterday was 9 hours old, floored to 0, and rendered the
nonsensical **"0 days ago"**; a session from 23:00 two days back rendered as
"Yesterday"; everything older was undercounted by one for most of the day.

**Fixed:** both operands snap to local midnight before subtracting, so the
result is a true calendar-day count; `Math.round` absorbs DST. `diffDay <= 0`
collapses to "Today", which also handles clock skew. Invalid dates return `''`
instead of "NaN days ago". 14 assertions against a pinned `now`.

## P2-6. Redundant query on every dashboard load

`updateStreak()` already returns the full activity day-set, but the dashboard
still issued a 14-day `question_records` query to rebuild the same set for its
heatmap fallback.

**Fixed:** the query is now issued only when the streak recompute could not
supply its day-set — the same condition under which the local rebuild is used.

## Audited, no defect found

- **Rank thresholds.** All five implementations (`chat.html`,
  `mock-exam.html`, `progress.html`, `profile.html`, and the SQL
  `rank_for_xp`) agree exactly: 0/100/300/600/1000/1500/2500 with identical
  names. Verified by extracting and diffing all five tables.
- **Timestamp parsing elsewhere.** Every other `new Date(...)` on a DB value
  operates on a `timestamptz` (`created_at`, `subscription_expires_at`,
  `upgrade_requested_at`, `current_period_end`), which parses correctly. The
  DATE-column trap was confined to `exam_date`.

---

# Phase 3 — approved frozen-file fixes (freeze temporarily lifted, now restored)

The owner lifted the freeze for the specific verified fixes only. Two files
qualified. The other four frozen files — `regenerate-reports.js`,
`taxonomy.js`, `exam-mistakes-logger.js`, `focus.html` — had **no verified
defect**, were not unfrozen, and are byte-identical to `main` (verified).

`focus.html` holds a fourth exam-countdown variant, but `daysUntilExam` there is
assigned and never read. Dead code, no user impact, so it did not qualify as a
verified issue and was left alone.

**Both files below are frozen again as of commit `7126657`.**

## P3-1. `weakness.html` — Mock Exam count and source attribution

**Root cause.** `renderSources()` had two hardcoded boxes and bucketed by
`source !== 'AI_CHAT'`, so the box labelled "Mock Exams" counted non-chat
weakness *signals* rather than mock exams. It never queried
`exam_practice_sessions`. With 634 AI_CHAT / 111 FOCUS_PRACTICE / 10 MOCK_EXAM
live, Focus Practice was being shown to students as mock exams. NULL-source
signals were counted in neither box, while `renderSignalCols` counted the same
NULL signal as chat — two answers on one page.

**Why necessary.** Every student with data saw a wrong number: 117 against 12
completed exams; 1 having completed none; 0 having completed 1. The section
also could not represent Focus Practice, Study Planner or Manual Practice.

**Sections changed** — 6 functions changed, 1 added, 40 untouched:
`renderSources` (rewritten), `sourceLabel` (added), `loadData` (count query),
`renderAll` (argument), `renderSignalCols` (NULL handling + per-row source tag),
`loadEvidenceBatched` (real source names), `evidenceRowsHTML` (`srcClass`,
`esc`), plus CSS `.ev-src` 42px → 86px so the real names do not clip and the
column header no longer claims "Exam Practice" for non-exam sources.

**Regression tests.** Inline scripts parse clean. `renderSources` replayed
against the three real production users: 117 → 12, 1 → 0 (box correctly
hidden), 0 → 1. NULL sources surface as "Unknown Source"; an exam with zero
signals still shows; an unknown future source renders under its own name.

**Proof nothing else changed.** All 47 top-level functions hashed before and
after — 40 byte-identical. The 7 flagged were diffed individually; `renderWhy`
proved identical (its hash boundary had absorbed an adjacent new comment),
leaving exactly the 6 intended plus 1 addition.

## P3-2. `mock-exam.html` — XP lost update

**Root cause.** The XP award was a read-modify-write on `profiles.xp`. Any XP
write landing between the SELECT and the UPDATE — `chat.html` awards +5 per
question — was silently overwritten.

**Why necessary.** A student with chat open in a second tab loses one of the two
awards. The same defect class was already fixed in `chat.html`; leaving it here
kept a known lost-update path in production.

**Sections changed** — 1 function changed, 38 untouched: `doSave`, where the
SELECT/UPDATE pair became a compare-and-set loop filtered on the `xp` that was
read. `newRank` is still defined for the success screen; on total failure it
falls back to the rank for the last `xp` actually read, and the exam save still
completes exactly as before.

**Regression tests.** The CAS block was extracted from `mock-exam.html` and
raced against the real `chat.html` CAS block over one shared row:
200 + 50 + 5 = 255, both awards land. Uncontended saves unchanged (100 → 125,
first exam 0 → 50). A failed read now aborts without writing.

**Proof nothing else changed.** All 39 top-level functions hashed before and
after — 38 byte-identical, `doSave` the only change. Grading, idempotency
recovery, mistake logging, achievements and the success screen are untouched.

## Freeze status

| File | Status |
|---|---|
| `weakness.html` | **Re-frozen** — fixed under approval, `7126657` |
| `mock-exam.html` | **Re-frozen** — fixed under approval, `7126657` |
| `regenerate-reports.js` | Frozen, never unfrozen, unchanged |
| `taxonomy.js` | Frozen, never unfrozen, unchanged |
| `exam-mistakes-logger.js` | Frozen, never unfrozen, unchanged |
| `focus.html` | Frozen, never unfrozen, unchanged |

No further changes to any of these without an explicit new unfreeze.
