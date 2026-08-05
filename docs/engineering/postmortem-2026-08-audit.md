# Engineering postmortem — platform audit, streak rearchitecture, release sprint

**Period:** 2026-08-03 → 2026-08-05
**Final production status:** all work live and verified.
`ai-tutor` platform version **137** (`v99`), static site deployed, two migrations
applied. CI **31/31**, page smoke **46/46**, zero `ai_tutor_failures` since deploy.

Every number below was measured against production or executed against the
shipped source. Where something could not be verified from this environment, it
says so rather than claiming success.

---

## 1. Original problems

Reported by the owner, in the order they surfaced:

1. **Platform-wide audit requested** — unknown defects across 46 pages, auth, chat,
   mock exams, weakness analyzer, focus practice, admin, payments, mobile.
2. **Daily Streak was wrong** — it "occasionally breaks or resets"; a new day did
   not begin at local midnight; today's square stayed a placeholder dot after
   practising; Current Streak, Weekly Progress and Achievements drifted apart.
3. **Zero refused identity questions** — "Who created you?", "مين صنعك؟" were
   answered with an off-domain redirect. A regression.
4. **Study Planner returned generic plans** — no personalisation, no reading of
   real performance, and credits not deducted correctly. Critical.
5. **Branding inconsistency** across pages.

---

## 2. Root causes

### 2.1 Streak — one decision behind three symptoms

Day keys were computed in a **fixed `Africa/Cairo` timezone on every device**
rather than the student's own. Measured against the shipped code, the day began
at 01:00/02:00 local in Dubai, 06:00/07:00 in Tokyo, **17:00 the previous day**
in New York — and Cairo observes DST, so the boundary also moved twice a year.

That single fact produced all three reported symptoms, the worst being a streak
that **broke while the student practised every day**: two consecutive *local*
days map to non-consecutive Cairo days when the sessions straddle the Cairo
boundary (New York Mon 15:00 → Cairo Mon; Tue 20:00 → Cairo **Wed**), and the
wrong value was persisted.

Two independent amplifiers were found alongside it:

* **Silent row-cap truncation.** The activity `SELECT`s had no `ORDER BY` and no
  `LIMIT`. PostgREST truncates at `max-rows` silently, and unordered the retained
  rows are arbitrary — a busy student could lose their most recent days and have
  `current_streak = 0` written over a real streak. The busiest live account was
  at **755 rows** against a 1000 cap.
* **A blind last-writer-wins write.** `profiles.update` had no compare-and-set, so
  two overlapping recomputes resolved by whichever HTTP response landed last.

### 2.2 Zero's identity — a guard with no exemption, and a prompt with no rules

The scope guard **replaces the model's text** with a canned redirect whenever the
model labels a turn `out_of_scope`. So a single mislabel was enough to tell a
student their question about Zero was "not my world". Three compounding gaps:

* nothing server-side protected identity turns — it rested entirely on a model
  judgement call;
* `HINT_SYSTEM_PROMPT`, which classifies scope too, **never listed identity
  questions as in-scope and carried no identity rules at all**;
* `tests/scope-guardrail.test.mjs` had **zero** identity coverage, so nothing
  could catch it.

### 2.3 Study Planner — my own regression

Earlier in this audit I tightened the intent rule to stop "make a plane through
points A and B" being charged 20 credits. I **over-corrected into requiring the
literal word "study"**. The phrasings students actually use — "make me a plan",
"create a plan for me", "I need a plan", "plan my studies", and in Arabic "اعمل
خطة" / "عايز خطة" / "محتاج خطة" — all fell through to the LLM, which wrote a
**generic** plan from no student data and charged **chat** credits instead of the
20-credit `study_plan` operation.

Generic plans, no personalisation and the wrong charge were all that one gap. The
pipeline beneath it was never broken: every column `study-planner-client.js`
reads exists in the live schema, with 204 `weakness_reports` and 770
`weakness_signals` available. The personalisation was starved of *input*, not of
data.

### 2.4 Branding

The logo itself was already consistent — all 54 `<img>` occurrences byte-identical.
The real gap was structural: **all 29 public pages declared a favicon and none of
the 17 app pages did**, so the pages students live in showed a blank browser tab.

---

## 3. Fixes implemented

| # | Fix | Where |
|---|---|---|
| 1 | Day boundary = student's local midnight; `SiDay` as the single day authority | `assets/streak.js` |
| 2 | Streak computation moved **into Postgres** (`recompute_streak`) | migration |
| 3 | Streak columns **revoked** from `authenticated` | migration |
| 4 | Ordered + capped activity reads; truncation-aware horizon | `assets/streak.js` |
| 5 | Compare-and-set + row lock on the streak write | migration / client |
| 6 | Counter, Weekly strip and achievements from one computation | `dashboard.html`, `progress.html` |
| 7 | `getStreakSnapshot` closes the last raw column reader | `study-planner-client.js` |
| 8 | `isIdentityQuestion()` exemption inside `resolveScope` | `ai-tutor/index.ts` |
| 9 | Identity rules + scope entry added to `HINT_SYSTEM_PROMPT` | `ai-tutor/index.ts` |
| 10 | Planner intent repaired — object-based disambiguation | `chat.html` |
| 11 | Favicon added to every editable app page | 14 pages |
| 12 | Exam countdown moved to local midnight | `assets/exam-days.js` |

Plus, from the initial audit: a device-management page that never rendered
(`planLabel` ReferenceError), a profile page dead on load (bare `RANKS`), a
stored-XSS vector in the admin dashboard, a chat delete that never deleted, and
several others.

**The key design decision** was choosing Postgres over an Edge Function for the
streak. Every bug in this saga — clobbering, `best_streak` regressing, stale
reads, read-after-write seeds — was a symptom of read-compute-write not being
atomic. An Edge Function would have had to *rebuild* the compensating machinery;
Postgres made it atomic by construction and **deleted ~200 lines** of it.

---

## 4. Refactoring summary

Deliberately controlled, per the brief — no rewrite.

* **Removed:** `assets/dragon-mentor.png` + `-sm.png` (**320 KB**), referenced by
  nothing. Verified by grepping every file type before and after.
* **Collapsed:** three independent day-key implementations into one `SiDay`; then
  the entire client-side streak computation into one Postgres function.
* **Kept, with reasons recorded** rather than rediscovered later:
  `focus-templates.js` and `kdg-representation.js` (deliberate scaffolding, one
  with its own CI validator), `taxonomy.core.js` (**the** authored source of truth,
  loaded by zero pages *by design*), `assets/instapay-qr.png` (optional drop-in,
  hidden via `onerror`).
* **Accepted debt, measured:** `esc()` is defined in 10 files, `fmtDate()` in 3.
  Consolidating means adding a shared `<script>` to ten pages — two of them frozen
  — in a repo whose no-bundler architecture is deliberate. That is a rewrite
  wearing a refactor's clothes.

---

## 5. Security improvements

1. **Streak forgery closed.** `current_streak`, `best_streak` and
   `last_active_date` were `UPDATE`-granted to `authenticated`; a student could
   edit their own row and mint achievements. Now revoked — `recompute_streak()`
   is the only writer. Verified live: `UPDATE profiles SET current_streak = 999`
   as the authenticated role → **refused, 42501**.
2. **`SECURITY DEFINER` hardened before it shipped.** The review found the
   authorisation check **failed open** — a caller with no resolvable JWT subject
   could recompute *and read back* any student's streak. Fixed to fail closed.
3. **`search_path` hardened.** `pg_temp` was searchable, letting a caller shadow
   an unqualified name and run it as the owner. Now `pg_catalog, public`.
4. **`anon` execute revoked.** `REVOKE … FROM public` does **not** remove the
   explicit grant Supabase's default privileges give `anon`. Caught by the
   post-deploy checklist and closed.
5. **Stored XSS fixed** in the admin dashboard (student `full_name` /
   `upgrade_note` injected into an `onclick`).
6. **RLS reality recorded:** every table is owned by `postgres` with
   `relforcerowsecurity = false`, so a `SECURITY DEFINER` function is **not**
   constrained by RLS. The `auth.uid()` check is the entire boundary — now stated
   in the function's own comment so nobody later assumes otherwise.

---

## 6. Performance improvements

* **Two missing indexes added.** `EXPLAIN ANALYZE` on the busiest live account
  showed `exam_practice_sessions` and `focus_tasks` **both seq-scanning** —
  O(table), not O(user), on a function that runs on every dashboard load and
  every answered question. Baseline 26.8 ms / 212 buffers.
* **Steady-state writes eliminated.** The recompute wrote the profile row on every
  call; it now writes only on a real change, so ordinary read traffic performs
  **zero** writes (proved via `xmin` staying constant across two calls).
* **Payload bounded.** `active_days` was unbounded; the streak is still computed
  over all history but only 180 days are returned.
* **320 KB** of dead image assets removed from a repo that ships raw files.
* **Query count reduced:** one RPC replaces four client round trips.

---

## 7. Regression tests added

CI went **27 → 31 checks**. New/extended:

| Suite | Assertions | Covers |
|---|---|---|
| `streak-timezone.test.mjs` | 42 | rollover at local midnight in 7 zones × 2 DST seasons, 23:59/00:01 boundaries, the New York consecutive-days case, DST/leap/month/year arithmetic |
| `streak-rollover.test.mjs` | 71 | first activity after midnight, consecutive/missed days, all three sources, delayed sync, refresh & second-device idempotence, ordered/capped reads, window-edge guard, concurrency (stale run must not clobber), RPC-preferred/absent/failing |
| `streak-failure-paths.test.mjs` | 11 | CAS loss, best-streak floor, profiles-read failure, row-cap truncation, future `last_active_date`, lapsed reset |
| `scope-guardrail.test.mjs` | +41 | 30 identity phrasings (EN/AR/Franco) + 11 that must **not** match |
| `validate-study-plan-intent.mjs` | 79 | every reported phrasing, plus the maths/non-study boundary |

All build expectations with an **independent** `Intl` call, so a bug in the module
cannot make its own tests agree with it.

---

## 8. Remaining technical debt

1. **Streak self-inflation is not fully closed.** The columns are revoked, but a
   student can still influence their own numbers via activity rows. Bounded — own
   account only, no cross-user exposure, no billing impact.
2. **Study Planner credit gate is client-side.** A determined caller can skip it.
   It is a paywall on a *local* computation — nothing there can run up a provider
   bill. Tracked as INFRA-5; a revenue question, not a cost one.
3. **Three frozen pages still lack a favicon** (`focus.html`, `mock-exam.html`,
   `weakness.html`) — one line each, needs unfreezing.
4. **App sidebars use a CSS wordmark** while public pages use the `<img>`. A
   coherent compact design, not a defect; swapping 17 sidebars is a visual
   redesign and was raised rather than taken unilaterally.
5. **`esc()` × 10, `fmtDate()` × 3** — accepted, reasoned above.
6. **Frozen-file bugs remain documented but unfixed** in `mock-exam.html`,
   `weakness.html`, `focus.html` (timer pause in background tabs, a paywall
   bypass on Day 2/3 focus tasks, non-idempotent renderers).
7. **CLI version is unpinned.** `scripts/deploy-ai-tutor.sh` falls back to
   `npx supabase` unpinned, so every deploy uses whatever is latest that day.

---

## 9. Final production status

| Component | State | Evidence |
|---|---|---|
| `ai-tutor` | **v99, platform 137, ACTIVE** | `list_edge_functions` |
| Bundle integrity | **4/4 files, not truncated** | 265,058 / 9,385 / 59,591 / 30,314 bytes, byte-identical to `main` |
| Identity fix live | **confirmed by a real student turn** | "مين صنعك" 11:14:43 → configured identity, not the redirect |
| Math routing | **unaffected** | "2X+18=100" 11:15:15 → full structured solution |
| Out-of-domain | **still rejected** | verified against the deployed source |
| Streak (server-side) | **live** | `recompute_streak` present; forgery refused 42501 |
| Failures since deploy | **0** | `ai_tutor_failures` |
| Data integrity | **intact** | `sum_best_streak` 44, achievements 17 — unchanged |
| CI / smoke | **31/31, 46/46** | local |

**Not verified from this environment:** a browser-level walkthrough by a signed-in
student (egress to the Supabase host and the site is blocked here, and a blocked
request is indistinguishable from a rejection). The two live turns above are
stronger evidence than any simulation, but they cover identity and math — not the
Study Planner or credit deduction end to end, which still deserve one manual pass.

---

## 10. Lessons learned

**A green check is only evidence if it could have gone red.** `exam-days.test.mjs`
asserted device-timezone independence at an instant where all five sampled zones
share a calendar date — it could not have failed whatever the module did. The
streak tests passed throughout because their stubs always reported the CAS as
*won*. Adding the CAS broke 20 of them, which was the reassuring part.

**Fixing a bug is when you are most likely to write one.** Of the defects found by
adversarial testing, **five of six were introduced by my own fix** — a `persisted`
flag set and never read, a retry loop that was last-write-wins wearing a guard, an
unguarded `best_streak`, an unbounded staleness check that froze streaks forever,
and a row-cap change that made a 107-day streak read 37. Every one passed CI.

**Idempotence is not concurrency safety.** I wrote in a code comment that
"refreshes, extra tabs and late-arriving rows are safe by construction" and used
it to dismiss a race as low risk. Two runs straddling a commit do not read the
same rows. The comment was the false premise the missing guard hid behind.

**Verify the layer you are claiming, not a nearby one.** The first production
smoke script "passed" two checks purely because the egress proxy returned 403 —
a blocked request looks exactly like a refusal.

**Fix the architecture, not the symptom.** ~200 lines of compensating machinery
dissolved when the computation moved next to the data. Each line had been a real
fix for a real bug; all of them existed because the work was in the wrong place.

**"Merged" is not "deployed", and the reverse is just as dangerous.** The identity
fix was on a branch and not on `main`; deploying from `main` would have shipped
the unchanged bundle and reported success. Checking cost one `grep`.

**Broadening and narrowing both have an expensive direction.** Tightening the
planner rule to stop a 20-credit overcharge silently broke every unqualified
request. The fix was to stop guessing from the verb and read the *object*.
