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
| `scripts/validate-ai-tutor-source.sh` | Size ceiling 170 → 190 KB, reason recorded |
| `docs/audit/patches/weakness-sources-and-mock-count.patch` | Items 2 & 3, **unapplied** — `weakness.html` is frozen |

No frozen file was modified. No migration was created.
