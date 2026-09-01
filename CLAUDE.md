# Si Math AI — Claude Code Session Rules

**Baseline verified 2026-08-02**, after Truth System v2 Phase V0. Every number
below was measured against the live project or the repository at that date, not
recalled. When a number here disagrees with reality, reality is right and this
file is stale — fix it.

## ⛔ ABSOLUTE PROHIBITIONS (read before any tool call)

### 1. Never deploy ai-tutor via the inline MCP tool

`mcp__Supabase__deploy_edge_function` **must not be called for `ai-tutor`
under any circumstances.**

The inline deploy path has caused two production outages (2026-06-17) by
deploying a truncated stub instead of the real function. Students received 500
errors for the duration.

`supabase/functions/ai-tutor/index.ts` is **~233 KB / 4,240 lines** (measured
2026-08-02, after v96). An earlier version of this file said "~55 KB" — the
function has grown four-fold since, which makes this prohibition *more* binding,
not less. (The same entry previously read "~274 KB / 4,943 lines", which did not
match the file it described; the rule stands either way, and the point is the
order of magnitude, not the digits.)

`ai-tutor` is also a **multi-file bundle** since v83: `index.ts` imports from
`_shared/`. Any deploy path that ships only `index.ts` produces a function that
fails at cold start. **The only approved deploy paths are in DEPLOY.md §4.**
Read that section before touching the Edge Function.

### 2. Do not modify frozen files without explicit user approval

Frozen files — do not edit without the user explicitly unfreezing them:
- `regenerate-reports.js`
- `taxonomy.js` — **auto-generated**; see the transitive freeze below
- `exam-mistakes-logger.js`
- `mock-exam.html`
- `weakness.html`
- `focus.html`

**The freeze on `taxonomy.js` is transitive.** `taxonomy.js` is generated from
`taxonomy.core.js` by `scripts/sync-taxonomy.mjs`, and CI fails on drift. Editing
the authored source therefore regenerates a frozen file, so **`taxonomy.core.js`
is frozen in practice too.** Unfreezing the taxonomy is a deliberate decision to
take in advance, not something to discover mid-task.

### 3. Do not create new database migrations without explicit approval

Every migration must be individually approved before `apply_migration` is
called. Migrations are irreversible in production.

Writing a migration **file** is not applying it. The repo convention is
PREPARED → reviewed → explicitly approved → APPLIED, and a PREPARED file sitting
in `supabase/migrations/` is inert until someone runs it.

### 4. All development goes to the feature branch

Active branch: `claude/si-math-migration-strategy-dnrteg`

Never push to `main` directly. Never push to a different branch without
explicit permission.

### 5. The PUBLIC documentation is FROZEN (closed by audit, 2026-08-02)

**Do not add public documentation pages.** The knowledge layer is complete: 22
public pages, a knowledge graph, and a 3,110-check CI gate. Adding more would
restate what already exists, dilute the pages that matter, and give AI systems
more surface to retrieve inconsistently from.

**Documentation now changes only when the product changes.** The website evolves
because the platform evolves — never the other way around.

Three exceptions, and only these:

1. **A feature shipped.** Then follow the pipeline below, which starts in the
   knowledge graph and ends in evidence.
2. **Real data arrived.** Replacing a placeholder with verified evidence is the
   one addition always welcome — see `knowledge-base.md` §0.
3. **The layer says something wrong.** The freeze forbids *adding*, never
   *correcting* — otherwise it preserves errors. The test: does the change say
   something new, or fix something the site already says wrongly? If it is
   neither, and just says the existing thing more nicely, refuse it. See
   `knowledge-base.md` §0 and finding C-22.

If asked to "improve the documentation" with no product change behind it, say
this rule exists and ask what changed in the product instead.

**`docs/knowledge/governance.md` is the authority on whether a change belongs.**
Four gates — origin, novelty, placement, enforcement — and most proposals stop at
the first. `knowledge-base.md` §14 is the mechanics for a change that passed them.
The layer was closed by audit rather than by assertion: 22 of 22 crawler
questions answerable, no missing entities, one ambiguity found and fixed
(`consistency-audit.md` C-31).

**What this freeze does NOT cover.** It governs the **public knowledge layer** —
the root `*.html` pages, `docs/knowledge/`, `llms.txt`, `sitemap.xml`, structured
data. It does **not** govern internal engineering records under `docs/roadmap/`
and `docs/engineering/`, which are written continuously as work happens
(investigation → engineering review → release report → closeout). Those are how
the project stays legible to its future self, and they are not public surface.

### The pipeline — nothing skips it

```
Knowledge Graph → Documentation → Website → Implementation
    → Real Student Usage → Outcome Evidence
```

`docs/knowledge/graph-data.mjs` first, always. CI rejects a half-specified
concept, so the graph cannot accept one.

### The questions that gate every feature

> 1. **Does this improve learning?**
> 2. **Does this improve understanding?**
> 3. **Does this improve long-term retention?**

**If the answer to any is "no", the feature should not exist** — however
impressive the technology is. The educational methodology is the primary product;
the software is its delivery system. See `governance.md` §7.

---

## Project context

Si Math AI is a live Egyptian exam-prep platform (SAT / EST / ACT). The AI
tutor "Zero" is used by real students. Production incidents have direct
student impact during exam-prep windows.

### Live system (verified 2026-08-03T20:10Z)

| | |
|---|---|
| Supabase project | `igvkyxkmjnkzscqgommj` |
| Edge Functions | `ai-tutor` (platform version **144**, ACTIVE, deployed 2026-08-13T20:38:11Z) · `admin-actions` (platform version **16**, ACTIVE) — read from `list_edge_functions` on 2026-08-15 |
| `ai-tutor` source version in `main` | `AI_TUTOR_VERSION = 'v101'` (merged 2026-08-15, commit `eebdce5`). **UNDEPLOYED as of that merge** — the merge is a repository event and does not touch the Edge Function. v101 makes Zero's identity answer a fixed string the server returns verbatim instead of a model generation, and adds the name / reversed-word-order patterns (`what's your name`, `اسمك إيه؟`, `مين أنت؟`, `esmak eh`) that `isIdentityQuestion()` did not match at all before it. **Which source version platform 144 is actually running was never verified** — only the platform version and the sha below were read. Do not infer it from this table |
| `daily_limit` semantics | **A maximum per day, never a free allowance.** PAID plans: two INDEPENDENT checks — the operation's `credit_costs` price is charged from message #1, AND the request is refused at `daily_limit` whatever the balance (`20260802192644`). ZERO-PRICE tier only (`amount_egp = 0 AND credits_granted = 0`): `daily_limit` IS the free allowance, and purchased credits carry the student past it |
| FREE plan daily limit | **15/day** (`plan_definitions.FREE.daily_limit`). Enforced by `consume_credits`, charged by the `ai-tutor` entitlement gate from v96 onward — **before v96 nothing server-side enforced it**; see `docs/engineering/free-quota-enforcement-investigation.md` |
| Quota gate | **LIVE.** `ai-tutor` v96 charges `consume_credits` before any provider call and fails closed. Both supporting migrations are applied. Full trace and verification: `docs/engineering/free-quota-enforcement-investigation.md` |
| `consume_credits` | 8 args since `20260802173710` — `p_client_request_id` (DEFAULT NULL) makes one logical send charge once. Seven-argument callers still resolve |
| `subscriptions.plan_type` | A legacy CATEGORY column, not a plan code, and read by nothing — `plan_code` on the same row is authoritative. `subscriptions_plan_type_check` permits six values only, so every writer maps through `legacy_plan_type()` (`20260802184704`). Never write a raw `plan_code` into it |
| `refund_ai_credit` | **service_role only** since `20260802174206`. It DELETEs the `ai_usage_logs` row `consume_credits` counts, so a client-callable refund is a client-callable quota reset |
| `ai-tutor` deployed bundle | `ezbr_sha256` `2c91aa15a8138064833e73c405522f66448bafac41c01c082bec79313d002d55`, platform version 144, deployed 2026-08-13T20:38:11Z (read 2026-08-15). The four-file shape is unchanged: `index.ts` + `_shared/{telemetry.core.ts, verification.core.ts, taxonomy.core.js}`. **The bundle was NOT compared against the tree this time** — the sha is recorded so the next session can tell whether anything moved, not as proof of parity. **Re-read this row from `list_edge_functions` rather than trusting it.** It has now been found stale in BOTH directions: on 2026-08-02 it understated the version (133 while 134 ran), and on 2026-08-03 it overstated the gap (it said v97/v98 were unshipped for the ~30 minutes between the deploy and this correction) |
| L3 Shadow pipeline | `l3-shadow-v3` |
| Difficulty detector | `detector-v1` (heuristic) + LLM shadow classifier v2 |
| Taxonomy | version 1 — **5 topics, 33 subtopics** |
| Plan catalogue | **Plan Catalog V2** — `plan_definitions` is the sole catalogue; `pricing_settings` and `credit_packs` are views over it. Plans are authored from the Owner Dashboard |
| Migrations | **123 files** in `supabase/migrations/`, **182 applied** in the database (measured 2026-09-01). **Teacher Exams 3b is LIVE**: `20260901c` (six `teacher_exam*` tables, 40 named constraints, 7 guards) applied as `20260901161812`, `20260901d` (RLS, SELECT-only grants, 9 policies, `teacher_exam_is_staff()`) as `20260901161844`, and a verbatim re-apply of five guard bodies as `20260901162042` — the first paste had stripped their inline comments, and the file is the record of what is live. **Teacher Exams 3c is LIVE** (`20260901e`, applied as `20260901165317`): twelve functions — ten authoring RPCs plus two internal helpers — and no table, column, policy, grant or row. Teacher and **active assistant** have identical academic power, demonstrated rather than asserted: every authoring step, the publish and the close were driven end to end by the assistant in the post-apply suite. The publish gate is deliberately NOT `publish_exam_form()` and checks only what a CHECK constraint cannot express — no questions, ordinals not 1..n, a window already past, a window shorter than the paper's own duration. Exam codes get their **own** bounded retry wrapped around the INSERT (`workspace_new_code()`'s missing retry is still a separate, untouched increment), and `media_sha256` is computed server-side with any client value ignored. Rollback `20260901w` is PREPARED, unapplied and **rehearsed** — it returns the function-body, constraint and policy hashes to their exact pre-3c values. **Teacher Exams 3d is LIVE** (`20260901f`, applied as `20260901172530`): seven RPCs that give the exam code a meaning — it raises a REQUEST, and a request is not access. `teacher_exam_can_start()` is the sole authority and takes **no student parameter** (one would let any account probe another student's access). It re-reads five live conditions every call: approved, active membership, active workspace, published, inside the window. **An approved OUTSIDER still cannot start** — membership is a separate condition, proven rather than assumed. The rate limit fires **before** the code is resolved, so a throttled student gets the identical message for a valid and an invalid code; but note honestly that it counts ROWS, and a wrong code creates none, so it caps attachments per hour and does **not** count failed guesses — what defeats guessing is the 2^40 code space plus the single indistinguishable failure message. Rotation stops the old code and **revokes nothing**. Rollback `20260901v` is PREPARED, unapplied and rehearsed. **Teacher Exams 3e is LIVE** (`20260901g`, applied as `20260901174100`): six RPCs — start/resume, save, submit, the student's own result, and the two staff reads. `teacher_exam_start()` CALLS `teacher_exam_can_start()` rather than restating it, and `teacher_exam_submit()` grades through `exam_answer_matches()`, the platform's single grading rule — both asserted against the function source, with `--` comments stripped so the check tests code and not prose. **The resume lookup comes BEFORE any authorization**: a student whose class link is revoked mid-paper finishes the sitting they are in and cannot begin another, which is §15.14 and not a bug. Omission stays three-valued (`is_correct` NULL, never false). The submit payload deliberately returns **counts only** — no per-item breakdown, because an mcq marked wrong is a narrowed key on a paper the teacher may set again — and above all not the topic|subtopic `mistakes` shape `exam_submit()` returns, which would be an invitation to post it into the analyzer. Two full graded sittings moved `weakness_signals`, `exam_mistakes` and `exam_practice_sessions` by zero. Rollback `20260901u` is PREPARED, unapplied and rehearsed. **The backend is now complete from code to grade**; 3f/3g are the UI. Teacher-authored content is structurally outside the analyzer — a full graded sitting moved `weakness_signals`, `exam_mistakes` and `exam_practice_sessions` by zero, and each counter was separately proven able to move. Rollback `20260901x` is PREPARED, unapplied, **rehearsed** (it returns the constraint, function-signature, function-body and policy hashes to their exact pre-3b values) and refuses outright if any sitting exists. Read `docs/roadmap/teacher-intelligence-layer.md` §15.14 before touching any of it. `20260901b` (eight `workspace_audit_action` labels for Teacher Exams) applied 2026-09-01 as version `20260901153803`. **It adds enum labels and nothing else** — no table, RPC, policy or row — so the database can now NAME eight events it still has no way to cause. It is separate from the tables increment because of a measured PostgreSQL property, not a preference: `alter type ... add value` runs inside a transaction, but the new label **cannot be cast or inserted until that transaction commits** (`unsafe use of new value`), so a migration that adds a label and then writes it cannot work as one unit. **This migration is NOT cleanly reversible** — there is no `ALTER TYPE ... DROP VALUE`; its rollback `20260901y` drops and recreates the type around a live column, refuses if the log already records a new label, and stops being meaningful once any exam RPC ships. Treat the label set as permanent. `20260901a` (`exam_stimulus_shape_ok()`) applied 2026-09-01 as version `20260901150838`: a pure refactor that lifts the three-shape rule out of `exam_stimuli_shape_check` into a named function so a second table can share it. Semantics unchanged — a 48-case truth table shows 0 disagreements with the inline expression it replaced, and all 33 stored rows still pass. Its rollback `20260901z` is PREPARED, deliberately unapplied, and **rehearsed**: run in an aborting transaction it returns the whole-schema constraint md5 and the function-signature md5 to their exact pre-apply values, so it is a true undo rather than a hopeful one. The Teacher Partner Program backend `20260831b/c/d/e` applied 2026-08-31 (versions `20260831115804` / `120342` / `120608` / `152640`), plus the ACL fix `20260831f` (`153041`). **`20260831e` REDEFINES `approve_payment_request`, `activate_subscription` and `activate_credit_pack`** — never re-apply it without first diffing all three against production, or it silently reverts whatever changed. Its rollback `20260831y` is PREPARED and deliberately unapplied. `20260831a` (`teacher_attention()`) applied 2026-08-31 as version `20260831025024`; its rollback `20260831z` is PREPARED and deliberately unapplied — the gap between the two counts is now partly deliberate, not only historical. `20260830j` (the assistant re-application fix) and `20260830k` (workspace creation is now **platform Owner only** — `current_user_role() <> 'owner'`, not a rung comparison) applied 2026-08-30. Exam delivery `20260830e/f`, the intervention record `20260830g`, the `owner`→`teacher` rename `20260830h` and the routing function `20260830i` (`my_experience()`) applied 2026-08-30. The rollbacks `20260830u/v/w/x/y` are deliberately unapplied. Teacher foundation `20260830a…c` and the weakness read `20260830d` applied 2026-08-30 |
| Static site | **51** root `*.html` pages on Vercel (measured 2026-08-31, after `partner.html`) |
| CI | `node tests/run-all.mjs` — **62 checks** (measured 2026-09-01, after `stimulus-view`) |

**Source version and platform version are different axes and must never be
written as one figure.** `AI_TUTOR_VERSION` is a constant in the source;
platform version is Supabase's deploy counter. An earlier version of this file
recorded "v69 / platform version 78" as if the two moved together; they do not.
The only unambiguous identity for what is *running* is the platform version plus
the bundle sha256.

**`main` and the deployed function are NOT in sync as of 2026-08-15.** `main`
carries v101, merged at `eebdce5`, and no Edge Function deploy was performed with
that merge — so whatever platform version 144 contains, it does not contain v101.
What production IS running was not verified: the last byte-for-byte comparison in
this file was 2026-08-03 (v98 at platform version 136), the counter has since
moved to 144, and no session has recorded a comparison since. Treat the gap as
known and its size as unknown. Being in sync was **the exception, not the rule**
anyway — the repo is
*routinely* ahead of production, because
merging deploys the site automatically and nothing deploys the Edge Function.
Phase V0 sat merged-but-undeployed for exactly this reason until v96 shipped
with it, and v97/v98 sat that way for about six hours on 2026-08-03.
**Never infer "live" from "merged"** — compare the platform version and bundle
sha256, which is a query, not a read.

That cuts both ways, and this file has now been wrong in both directions within
24 hours. On 2026-08-03 at 19:33 it recorded v97/v98 as unshipped; they were
deployed five minutes later and the row was not updated, so a session reading it
at 20:00 would have concluded a deploy was still owed and could have redeployed
from a branch that did not contain them — which would have *reverted* v97/v98 in
production. **Before deploying anything, check whether the deploy you are about
to perform is already done, and whether your working tree is behind `main`.**

**The migration file count and the applied count differ** (73 vs 137): early
migrations were applied without a committed file. `scripts/check-migration-parity.sh`
exists for this. Do not treat the file list as the applied list.

### Key tables

- **Student data:** `question_records`, `mastery_records`, `weakness_reports`,
  `weakness_signals`, `profiles`, `chat_sessions`, `session_questions`,
  `focus_plans`, `focus_tasks`, `study_plans`, `exam_mistakes`
- **AI economics:** `ai_model_calls` (per-call telemetry), `platform_cost_entries`,
  plus the `cost_engine` (9 tables), `ai_catalog` (3 tables) and `econ` schemas
- **Operations:** `ai_tutor_failures`, `analyzer_runs`, `unmapped_detections`
- **Taxonomy:** `taxonomy_topics`, `taxonomy_subtopics`
- **Teacher foundation** (live 2026-08-30, all four empty): `teacher_workspaces`,
  `workspace_staff`, `workspace_students`, `workspace_audit_log`.
  **`workspace_staff.staff_role` is `teacher` | `assistant`** — it said `owner`
  until `20260830h` renamed it, because that word belongs to the PLATFORM owner
  (`user_role.owner`) alone. Never reintroduce it here. **A teacher is
  not a `user_role`** — being a teacher is owning a workspace, and seeing a
  student is holding an active link to them. All teacher visibility derives from
  `teacher_can_see_student()` and nothing else; it currently guards no academic
  table, by design. Clients hold SELECT only — every write is a SECURITY DEFINER
  RPC. Read `docs/roadmap/teacher-intelligence-layer.md` §8 before touching
  anything teacher-, class- or cohort-shaped
- **Exam delivery** (live 2026-08-30, both tables empty): `exam_attempts`,
  `exam_responses`. Per-item response, correctness, time and revisit count — the
  evidence the weakness pipeline was missing. `is_correct` is THREE-valued:
  true answered right, false answered wrong, **NULL not answered**. An omission
  is recorded and is deliberately NOT a weakness signal; collapsing the two
  turns a pacing problem into a topic weakness. The answer key never reaches the
  browser: students hold no privilege on `exam_questions`, `exam_start()` selects
  a named list excluding `correct_answer`, and `exam_submit()` grades
  server-side. **Nothing is published** — all 3 forms and 161 questions are
  `draft`, so nothing is sittable. Read
  `docs/engineering/exam-delivery-verification.md` before touching delivery
- **Weakness reads** are canonical: `weakness_reports` is the single weakness,
  and `regenerate-reports.js` is the SOLE authority for `severity_band` and
  `trend` — **no consumer re-derives either**. The teacher/assistant read is
  `teacher_student_weaknesses()` (live 2026-08-30), which withholds the
  analyzer's working numbers so no surface can. `weakness-view.js` shapes one
  row per role and derives nothing. The class-wide read is `teacher_attention()`
  (live 2026-08-31), which answers "who should I look at first" with at most
  **five** students and never a score: the tier is chosen by **freshness first**,
  so a student silent for a month is `quiet` and never `struggling`, however
  severe their last snapshot was. `trend`, `recent7_count`, `recent14_count` and
  `priority_rank` are measured unreliable and are read by nothing. Evidence
  inventory and what is still impossible:
  `docs/engineering/weakness-evidence-audit.md`; access proof:
  `docs/engineering/teacher-attention-verification.md`
- **Teacher Partner Program** (backend live 2026-08-31, no UI): `referral_codes`,
  `referral_attributions`, `referral_commissions`, `referral_commission_rates`,
  `purchase_events`, `referral_award_skips`, `referral_audit_log`. The rules are
  **constraints, not code**: `UNIQUE(student_user_id)` on commissions is
  "one first purchase ever", `UNIQUE(source_kind, source_id)` is "one award per
  payment", and `PRIMARY KEY(student_user_id)` on attributions is "one teacher
  per student". Rates are **integer basis points** (12.5% = `1250`) in one table
  whose bands are validated as a set; every rate is **frozen into its award**, so
  crossing a tier never restates history. **`purchase_events` is the canonical
  purchase ledger** — both payment paths write it, a trigger on it is the ONLY
  thing that creates a commission, and it is the single answer to "has this
  student ever bought anything?". **Commission base is
  `plan_definitions.amount_egp`, NEVER `payment_requests.amount_egp`**, which is
  a direct client insert with no trigger and no CHECK. `record_purchase_event()`
  takes no amount and **no client role holds EXECUTE on it** — it takes a
  target user_id, so a grant would let anyone fabricate a purchase (fixed by
  `20260831f`; the first version shipped granted to `anon`). Payouts are
  **disabled** (`system_settings.referral_payouts_enabled = 'false'`) until the
  VAT/withholding treatment is confirmed. A teacher is still just an active
  `staff_role = 'teacher'` row — **no new role**. Read
  `docs/roadmap/teacher-partner-program.md` before touching any of it.
  **Teacher UI live in the repo, NOT yet deployed** (2026-08-31): the
  "Referrals & earnings" section on `teacher.html` and the new `partner.html`.
  Both gate on `staff_role = 'teacher'` — **never on `can_staff`, which is true
  for an assistant**. Neither surface offers a payout control, because
  `admin_set_commission_status` refuses to mark anything paid. **The student
  capture is `referral.js`** (loaded by `index`, `pricing`, `signup`, `login`,
  `onboarding`, `dashboard`): it reads `?ref=` into `localStorage`, strips it
  from the URL, and calls `attribute_referral()` at the first page load that
  has a session — `signUp()` requires an email confirmation, so there is NO
  session at registration and nothing can be attributed there. localStorage
  carries a PENDING INTENT only; the attribution is the database row. A student
  cannot name a teacher: `attribute_referral(p_code, p_source)` has no user
  parameter to forge and binds `auth.uid()`
- **Intervention record** (live 2026-08-30, empty): `class_interventions` — a
  teacher's record of something they already did about a difficulty. It computes
  nothing, is never a recommendation, and is never an input to the learning
  profile; it holds no foreign key into any academic table, for the same reason
  `support_tickets` does not. **Append-only: never deleted, and the only
  permitted UPDATE is a first withdrawal that changes nothing else** — enforced
  by `class_interventions_append_only_trg`, not by convention. Clients hold
  SELECT only; writes go through SECURITY DEFINER RPCs, and the student named on
  a row can read it. Read `docs/roadmap/teacher-intelligence-layer.md` §10 T1.6
  and `docs/engineering/teacher-intervention-verification.md` before touching it

### Repository shape

No `package.json`, no bundler, no build step — deliberately. The same bytes run
in Deno, in Node under CI, and in the browser, and CDN dependencies are pinned
with SRI (`scripts/pin-cdn-sri.sh`). Test suites execute the **real shipped
source** rather than a paraphrase of it (`tests/_source.mjs`). Do not introduce
a build step to solve a problem that a dependency-free module would solve.

**The `_shared/` single-source pattern** (`taxonomy.core.js` authored once,
synced to the browser copy and the Edge Function bundle, CI failing on drift) is
the established way to share code between the site, the function and the tests.
Prefer it over duplicating logic.

### Deployment, in one line each

- **Merging to `main` deploys the static site to Vercel production, automatically.**
  Confirmed again 2026-08-30: `72aa7fb` (the teacher/exam merge) was READY on
  production minutes after the push, and `nav.js`, `login.html` and
  `settings.html` were served byte-for-byte as committed.
- **Nothing deploys the Edge Function automatically.** It is a manual CLI step.
- **Nothing applies migrations automatically.** They are manual and individually approved.

Full detail, including what does and does not reach students:
`docs/engineering/deployment-pipeline.md`. Read it before assuming a merge is
safe or that a merge is sufficient.

## Architecture references

**Deployment and engineering baseline**
- `DEPLOY.md` — deployment runbook (read §4 before any Edge Function work)
- `docs/engineering/deployment-pipeline.md` — what deploys, when, and what does not
- `docs/engineering/v0-lessons-learned.md` — rules carried forward from Phase V0
- `docs/engineering/infrastructure-backlog.md` — platform/deployment work, kept
  deliberately separate from the Truth System backlog
- `docs/engineering/experience-routing-verification.md` — `my_experience()`,
  the single caller-scoped answer to "which product does this account belong
  in?". **LIVE 2026-08-30**, body verified byte-for-byte against the repo. Read
  it before touching `login.html`'s post-auth routing or `nav.js`'s Teaching
  link. Routing is not a security boundary; a pending assistant is not staff
- `docs/engineering/teacher-attention-verification.md` — `teacher_attention()`,
  the class-wide "who needs the first look" read. **LIVE 2026-08-31**, body
  verified byte-for-byte and ACL matched against the four teaching reads already
  in production. Read it before changing the qualification rules, the cap, or
  `FRESH_DAYS` — §4 records, with the mutant that proves it, why freshness
  outranks severity, and §8 records what the list still cannot establish
- `docs/engineering/subscription-writer-backlog.md` — open defects in the
  functions that write `subscriptions` (SUB-1 renewal INSERT vs UPSERT, live;
  SUB-2 missing `plan_code`, dead code). Read before touching
  `activate_subscription` or `activate_pro_subscription`

**Knowledge layer (public, frozen)**
- `docs/knowledge/knowledge-base.md` — **authoritative source of truth for how
  Si Math AI is described anywhere** (positioning, three pillars, canonical
  definition, taxonomy numbers, Founder terms). Read before writing any public
  copy, meta tag or structured data. Enforced by
  `scripts/validate-knowledge-layer.mjs` in CI.
- `docs/knowledge/seo-implementation.md` — per-page SEO / AI-search implementation
- `docs/knowledge/consistency-audit.md` — knowledge contradictions found and their status

**Truth System v2 — the verification programme**
- `docs/roadmap/truth-system-v2-migration-strategy.md` — **frozen baseline.**
  Current architecture mapping, gap analysis, phased roadmap V0–V8, risk
  assessment. §7 records the six amendments to the v2 specification
- `docs/roadmap/truth-system-v2-backlog.md` + `.csv` — **frozen baseline.**
  47 epics, 58 tasks; V0–V4 decomposed, V5–V8 at epic level by design
- `docs/roadmap/v0-notes.md` — Phase V0 assumptions, deviations and deferred work

**Product direction — adopted, deliberately unbuilt**
- `docs/roadmap/teacher-intelligence-layer.md` — the teacher-facing layer the
  platform will eventually grow: what it is for, the four gates any teacher
  feature must pass, the anti-goals, and the staged admission criteria. **It
  authorizes nothing** — no schema, no role, no surface, no public copy — and the
  Mock Experience is its prerequisite. Read it before proposing anything
  teacher-, class- or cohort-shaped; §5 records, measured, why a teacher
  dashboard cannot honestly be built yet

**Earlier architecture records**
- `docs/roadmap/adaptive-verification.md` — the original L1–L4 blueprint (superseded
  in approach by Truth System v2; retained as the historical record)
- `docs/roadmap/phase-0-verification.md` — the nullable verification columns on
  `question_records`. **Its consumer audit is stale** — `ai-monitor.html` was built
  afterwards and now reads `verification_meta`'s internal shape
- `docs/roadmap/ai-economics.md` — AI Economics (Owner Dashboard) architecture
- `docs/roadmap/plan-catalog-v2.md` — **the plan catalogue.** `plan_definitions`
  is the single source of truth for what a plan is called, costs, grants and
  looks like; plans are authored from the Owner Dashboard and need no code
  change. Read §11 before touching plans, pricing, checkout or entitlements
- `docs/roadmap/verification-framework-audit.md` — the vacuous-assertion audit and
  the rule it produced: *a green check is only evidence if it could have gone red*
