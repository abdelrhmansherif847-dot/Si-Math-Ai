# Platform audit — 2026-08-03

An end-to-end QA and engineering pass over the whole platform: all 46 root pages,
the shared client modules, both Edge Functions, and the client↔database contract.

**Method.** Sixteen parallel domain auditors reading the real source, plus a
headless-Chromium pass that loaded every page and recorded uncaught errors,
console errors, failed local resources and horizontal overflow at 360px. Every
finding below was re-verified against the running page, the extracted function,
or the live database before being recorded — several auditor claims did not
survive that step and are marked accordingly.

**Outcome.** 76 raw findings. 24 fixed and verified across five commits;
CI 27/27 green throughout. The rest are recorded here, grouped by *why* they were
not fixed: the file is frozen, the fix needs a deploy, the fix needs a migration,
or the change is a product decision rather than a defect.

**What this document is not.** It is not a plan. Nothing here is scheduled. It
exists so the next person does not have to rediscover any of it.

---

## 1. What was fixed

| Area | Defect | Commit |
|---|---|---|
| `devices.html` | `buildHTML` referenced an out-of-scope `planLabel`; page stuck on its loading spinner, so a device-limit block could not be cleared from any device | `f32fea3` |
| `profile.html` | Bare `RANKS` reference threw; page never rendered | `f32fea3` |
| `chat-renderer.js` | Stored XSS — HTML inside `$…$` math restored unescaped into `innerHTML` | `f32fea3` |
| `admin.html` | Stored XSS — student `full_name` / `upgrade_note` interpolated into an `onclick` | `f32fea3` |
| `chat.html` | Delete/Rename chat never persisted | `f32fea3` |
| `chat.html` | `studyPlanIntent` charged 20 credits for ordinary math phrasings ("a plane through points A and B") | `f32fea3` |
| `settings.html` | Preferred Exam Type could not be saved without also filling the Goals form | `3e4e06d` |
| `settings.html` | Delete Account reported success unconditionally | `3e4e06d` |
| `admin.html` | Payment Details modal permanently broke Create & Approve | `3e4e06d` |
| `admin.html` | Approval review showed only the spoofable label, not the granting `plan_code` | `3e4e06d` |
| `assets/knowledge.css` | Two mobile overflows (291px on knowledge-graph.html, 7px on evidence.html) | `3e4e06d` |
| `progress.html` | "Biggest Improvement" and "Topic Mastered" permanently dead | `532e129` |
| `history.html` | Every ACT score coloured red (hardcoded /800 scale) | `532e129` |
| `assets/streak.js` | A single failed read could wipe and persist a real streak as 0 | `532e129` |
| `study-planner-client.js` | Superseded the old plan before inserting the new one; a failed insert destroyed a paid-for plan | `532e129` |
| `chat.html` | Daily-cap denial pitched credits that cannot lift the cap | `532e129` |
| `pricing.html` | Never called `PlanCatalog.load()`, so the FREE allowance figure never rendered | `532e129` |
| `dashboard.html`, `progress.html` | Six unescaped sinks for owner-writable topic/subtopic/achievement values | `1b76214` |
| `settings.html` | Six buttons with no handler; four notification toggles with no storage or delivery | `1b76214` |
| `login.html` | A failed `can_register_device` RPC shown as a definitive "Too Many Devices" wall | `e2de44e` |
| `onboarding.html` | Today could not be chosen as the exam date (UTC-midnight parse) | `e2de44e` |
| `signup.html` | An already-registered address was told "Account created!" | `e2de44e` |
| `login.html` | "Remember me" promised a security behaviour it never delivered | `e2de44e` |
| `dashboard.html` | "This Month" stat rendered lifetime XP | `e2de44e` |

Then the diff was reviewed against itself, and four defects it had *introduced*
were fixed in `8d3777d`: an export naming a `question_records` column that does
not exist (PostgREST rejects the whole request, so the feature would have errored
for everyone), a `textContent` round-trip that deleted each export tile's icon on
first click, a too-aggressive intent rule that turned "show my plan" into a
charged chat turn, and rename/delete reporting success on a write that matched no
row. The same pass fixed the Arabic intent branch — which had exactly the bug the
English branch was fixed for, and matters more, since that branch exists for the
students the platform is built for — and one `exam_type` sink the escaping pass
had missed.

Regression guards added, each verified to fail against the pre-fix source:
27 phrasings in `validate-study-plan-intent.mjs` (English and Arabic false
charges, plus the free-view phrasings), 8 single-source failure cases in
`streak.test.mjs`, and a failed-insert case in
`validate-study-planner-client.mjs`.

`scripts/smoke-pages.mjs` was added as an opt-in browser gate — deliberately not
in `tests/run-all.mjs`, which is dependency-free by design. It loads every root
page in Chromium and fails on any uncaught error or overflow at 360px. Read its
header before using it: it stubs Supabase rather than blocking the CDN, because a
blocked CDN aborts every page at `createClient`, leaving pages half-initialised
(function declarations hoist, `var` assignments do not) and masking every error
further down. Run against the pre-fix pages it reproduces both crashes this audit
opened with and exits 1; against the branch it reports 46/46 clean.

---

## 2. Blocked on the taxonomy freeze

### AUD-1 — `Stem-and-Leaf Plots` cannot be written at all — **highest-severity open item**

**Status:** `PROPOSED` — needs the taxonomy unfrozen. One line.

`taxonomy.core.js` is frozen in practice (it generates the frozen `taxonomy.js`,
and CI fails on drift), so this was not touched.

**Verified behaviour.** Of all 33 canonical subtopics, exactly one fails to
resolve by its own canonical display name:

```
node -e "const A=require('./taxonomy.core.js');
  for (const s of A.SUBTOPICS)
    if (!A.resolve({topic: A.displayName(s.topicId), subtopic: s.displayName}))
      console.log('UNRESOLVED:', s.id, s.displayName);"
→ UNRESOLVED: STA_004 Stem-and-Leaf Plots
```

`resolve()` returns `null`, and `taxonomy-write.js` documents `null` as
"unmapped → caller logs via `logUnmapped` and **SKIPS the write**". So a mistake
recorded against this subtopic is not written at all.

**Root cause.** `normalizeKey('Stem-and-Leaf Plots')` produces
`'stem-and-leaf plots'`. The alias table holds `'stem and leaf'`,
`'stem-and-leaf'` and `'stem and leaf plot'` — every variant except the
plural-with-hyphens form that the canonical display name itself normalises to.

**Why it matters.** `mock-exam.html` builds its subtopic datalist from
`Taxonomy.subtopicsFor()`, so the value the UI *suggests* is the exact string
that cannot be written. A student who picks the suggested option has that mistake
silently dropped, and Stem-and-Leaf Plots can therefore never appear in weakness
analysis or Focus Practice for anyone.

**Fix.** Add `'stem-and-leaf plots'` (and `'stem and leaf plots'`) to the
`SUBTOPIC_ALIASES` entries for `STA_004`, then re-run `scripts/sync-taxonomy.mjs`.
Worth adding a CI assertion that every canonical `displayName` resolves to its own
id — that check would have caught this and is the reason it is worth doing once.

---

## 3. Blocked on the frozen page freeze

`mock-exam.html`, `weakness.html` and `focus.html` are frozen. 27 findings landed
in them. The ones that would change what a student experiences:

**`focus.html`**
- **High — paywall bypass (`:1377`).** Free users can complete Pro-locked Day 2/3
  tasks through the Today's Mission card, which does not apply the lock the plan
  view applies.
- **High — wrong subtopic on "Switch" (`:1933`).** Selecting another weakness
  matches on topic, so whenever two weaknesses share a topic the wrong subtopic is
  chosen and the student practises something they did not pick.
- **High — 5-task Advanced append (`:1159`)** permanently misaligns the 9-task
  wave / Mastery Rounds structure once a plan is "near done".
- **Medium — bricked plan (`:1202`).** If the initial `focus_tasks` insert fails,
  progress never persists again for that plan.
- **Medium — fire-and-forget status writes (`:1596`).** On a failed write the UI
  shows DONE while XP, streak and signals still emit — the student is credited for
  work the database did not record.
- Medium: dead round-clear guard (`:1110`); D1 resolution signals polluting the
  dominant-signal denominator (`:1981`). Low: unescaped `err.message` in the global
  error handler (`:2019`); `completed_at` not cleared on DONE→NOT_STARTED (`:1594`);
  `#0` rank badge (`:1563`).

**`mock-exam.html`**
- **High — the exam clock pauses in a backgrounded tab (`:886`).** Timers driven by
  `setInterval` are throttled or suspended when the tab is hidden, so switching away
  and back grants extra time on a timed exam without a reload. This one undermines
  the integrity of the mock exam as a measurement.
- **Medium — multi-tab state (`:517`, `:1676`).** A single shared `TIMER_KEY` means
  starting a second exam in another tab destroys the first exam's saved state, and
  "Take Back" can resume a stale clock that rolls the timer backwards.
- **Medium — the free-plan "1 mock exam per week" gate is client-side only** and
  fails open when its query errors (`:772`).
- **Medium — no error path on start (`:744`):** the button sticks on "Starting…"
  forever if the auth lookup stalls.
- Low: `duration_minutes` stores planned, not actual, length (`:1253`); negative
  mistake counts reach `exam_mistakes.mistake_count` and subtract from study-planner
  weakness aggregation (`:1175`).

**`weakness.html` / `regenerate-reports.js`**
- **Medium — three unescaped `innerHTML` sinks (`:1720`)** for the same
  owner-writable topic/subtopic values that were escaped on `dashboard.html` in this
  pass. The frozen pages are now the only remaining instances.
- **Medium — `renderBiggest()` is not idempotent (`:1788`):** every re-render
  duplicates the stats strip and its action buttons.
- **Medium — stale-report regen can recurse without backoff (`:1138`).**
- **Medium — the `buildFromSignals()` fallback omits severity/trend/recency**, so
  every weakness displays as a green "Low" priority (`:1192`).
- Medium: concurrent regens can insert duplicate `weakness_reports` rows that are
  never cleaned up (`regenerate-reports.js:442`). Low: four display/labelling defects
  (`:1125`, `:1498`, `:1315`, `:1595`) and a `computeMastery` divergence from
  `weakness.html` at `weight === 0` despite a stated "must match" contract
  (`regenerate-reports.js:69`).

---

## 4. Blocked on an Edge Function deploy

Nothing deploys the Edge Functions automatically, and `ai-tutor` may only be
deployed via `DEPLOY.md §4`. These were found by reading the source in `main`;
confirm against the deployed bundle sha256 before acting.

- **High — a degraded or empty answer still charges (`ai-tutor:3712`).** On the
  graceful-degradation path the function returns 200 with no usable answer after
  `consume_credits` has already charged the credit and consumed the daily slot, and
  no refund is issued. The student pays a message for nothing. `refund_ai_credit` is
  service_role-only, so the function is the only party that can put it right.
- **Medium — `messages[].content` arrays bypass the inline-image SSRF guard**
  and input sanitisation before reaching the provider (`:2378`).
- **Medium — the 402 denial always reads "You have used your free questions for
  today"** regardless of plan or actual reason (`:2748`) — the server-side twin of
  the `chat.html` copy fixed in `532e129`.
- **Medium — `admin-actions` enforces only `is_admin`**, not the
  owner/super_admin/admin hierarchy the UI presents (`admin-actions:240`). Any admin
  can invoke actions the UI shows only to an owner.
- **Medium — lost-update race on `verification_meta`** between the detector-v2 and
  L3 shadow background writes (`verification.core.ts:804`).
- **Medium — the study planner builds its week on UTC weekdays**
  (`_shared/study-planner.core.js:616`), so for a student in Cairo a plan generated
  after 22:00 local starts on "yesterday". Note this file is synced — fix the
  authored copy and re-run the sync script, do not edit one side.
- **Low — an exam date in the past renders as "SAT in 0 days" indefinitely**
  (`:569`).

---

## 5. Blocked on a migration

Migrations are individually approved and none was written for this pass.

- **AUD-2 — `approve_payment_request` never checks the submitted amount.**
  `payment_requests.plan_code`, `plan_label` and `amount_egp` are all client-supplied
  (the RLS insert policy checks only `auth.uid() = user_id`), and approval grants
  whatever `plan_code` says — credits, period, founder flag and founder-slot
  decrement — without comparing the submitted `amount_egp` or `plan_label` to
  `plan_definitions`. A student can submit a founder plan_code with any label and
  price. `admin.html` now shows the granting `plan_code` and the catalogue price and
  flags a mismatch (`3e4e06d`), so an admin can *see* it — but the server should
  re-derive the amount rather than trust the row.

- **AUD-3 — no service-role path to delete a user.** `delete_my_account` removes
  every row of personal data across 22 tables, but GoTrue has no self-service user
  delete (`auth.admin.deleteUser` requires the service_role key), so the sign-in
  record survives. `settings.html` now says so honestly (`3e4e06d`) instead of
  claiming full deletion; closing it properly needs an `admin-actions` action that
  deletes the authenticated caller.

---

## 6. Product decisions, deliberately not made here

- **Contradictory mastery thresholds on `progress.html`.** The "Topics Mastered"
  counter uses `>= 70` (matching `profile.html`), while the badge on the same page
  awards the word "Mastered" only at `>= 80`. A topic at 72 is counted as mastered
  and simultaneously labelled "Strong". Both numbers are defensible and the choice
  is pedagogical, not technical — per `CLAUDE.md`, the methodology is the product.
  Left alone on purpose.
- **`pricing.html` credit-pack purchase collects no payment.** The flow promises
  the payment was processed without creating a `payment_requests` row. Whether packs
  should route through the same manual-payment flow as plans is a commerce decision.
- **Founder slots default to 50 on a failed read** (`pricing.html:681`), advertising
  a plan the server may refuse to approve. The safe default is 0, but that hides a
  live offer on a network blip; which way to fail is a business call.
- **`chat.html` records the configured cost in `study_plans.credits_charged`,
  not the amount actually charged** (`:2494`). Cosmetic today because the two agree;
  worth aligning when the charge path is next touched.

---

## 7. Systemic, no owner yet

- **A CDN failure hard-crashes every app page.** Every page builds its Supabase
  client from the jsdelivr bundle; if that script fails to load, the page throws
  (`supabase is not defined` / `reading 'createClient'`) with no user-facing error
  state at all — observed on all 18 app pages in the smoke harness. The scripts are
  SRI-pinned, so a tampered file fails closed, which is right; what is missing is a
  visible "couldn't load — retry" state instead of a blank page. Fixing it touches
  every page including the frozen ones, which is why it is recorded rather than
  attempted.
- **`login.html`'s "Remember me" needs a shared auth-storage adapter.** Removed in
  `e2de44e` rather than left lying. Honouring it means every page's client agreeing
  on where the session lives — a session `login.html` alone put in `sessionStorage`
  is invisible to the client each other page constructs.

---

## 8. Auditor claims that did NOT survive verification

Recorded so nobody re-files them.

- **"`taxonomy-compat` silently drops Stem-and-Leaf mistakes on display."** The
  display path (`displaySubtopic`) falls back to the raw string, so the name still
  renders. The real damage is at the *write* boundary (§2), which is a different
  and more serious mechanism than the one originally reported.
- **"Colour ACT scores by `exam_type === 'ACT'`."** The suggested fix would not
  have worked: `exam_practice_sessions.exam_type` stores the exam *code*
  (`ACT_MATH`, `EST_MATH_1`, `SAT_MODULE_1`), with some legacy rows holding the bare
  family. Verified against the live table before fixing by prefix instead.

- **"`deleteChat` claims a cascade to `question_records` that does not exist,
  because no migration declares it."** The constraint is real:
  `question_records_session_id_fkey`, `ON DELETE CASCADE`, confirmed by querying
  `pg_constraint` in production. **The migration files are not the applied list** —
  a known gap that `scripts/check-migration-parity.sh` exists for, and the exact
  trap `CLAUDE.md` warns about. Grepping `supabase/migrations/` is not sufficient
  evidence that a database object is absent.

- **"`study plane geometry` still misroutes to the paid planner."** It does not;
  it returns `null` both before and after. Checked directly against the extracted
  function.

- **"`isFreeTierQuota` can never return true."** True of the first version and
  fixed in `63c9535` before this review landed — the reviewer was reading the
  superseded diff. The underlying observation was correct and important, and it is
  why the tier test now falls back to the catalogue: `ai-tutor` collapses
  `pack_credits` into `balance` before the client ever sees the verdict.
