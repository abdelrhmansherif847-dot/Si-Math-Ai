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
| Migrations | **137 files** in `supabase/migrations/`, **190 applied** in the database (measured 2026-09-03). **H4 (`20260904a`, the student attach path) is LIVE — applied 2026-09-03 as version `20260903203209`**, with rollback `20260904z` PREPARED and unapplied. It adds TWO internal tables and five functions, and REDEFINES **three** live H3 functions — `teacher_homework_create`, `teacher_homework_rotate_code` and `teacher_homework_delete` — so it carries the `20260831e` warning and its rollback restores all three H3 bodies byte-for-byte. `teacher_homework_retired_codes` enforces the locked invariant **once a homework code has existed, it never becomes available again**: rotation retires the old code AND deleting a draft retires its code before the row goes, with no published/draft distinction and no TTL. It carries NO foreign key — a cascade would free the code when its draft was deleted, which is the hazard itself; the retired-code reuse was DEMONSTRATED on production before the fix was written. Both exits are atomic, so no instant exists where a code is neither live nor reserved. **The invariant is enforced in the DATABASE as well as the RPCs**: `teacher_homework_code_guard()`, a **`BEFORE INSERT OR UPDATE OF homework_code`** trigger on `teacher_homework`, refuses any write that would put a reserved code on a row. It exists because the dry-run measured a raw INSERT with a retired code being ACCEPTED — UNIQUE cannot see the reservation table and a CHECK may not subquery — and an invariant that holds only because nobody currently has a grant is an application rule wearing a database rule's clothes; re-measured on the live schema 2026-09-03, that raw INSERT is still accepted today. Definer + pinned `search_path` so RLS cannot blind it, callable by nobody, and it raises `22000` not `23505` because `teacher_homework_create()` catches `unique_violation` to retry. **BOTH write verbs, and no more than the code column** — an INSERT-only guard left the same hole behind a different door, and a bare `OR UPDATE` would fire on every title, due-date, status and reveal write H2 governs. The column scope was measured discriminating, not assumed: with a row's OWN live code planted in the reservation (a state the RPCs cannot produce) the title / `due_at` / publish / reveal writes were all ACCEPTED while naming the column with that same value was REFUSED `22000`. Rotation survives because the RPC installs the new code BEFORE retiring the old one — so rotating A→B→A is correctly refused. On a code update both triggers now fire, the code guard first (BEFORE ROW triggers fire in alphabetical name order — measured), and H2's own rules are unmoved: a raw code write on a CLOSED paper is still `42501`. `teacher_homework_attach_attempts` counts **every** code submission including failures, holding only who and when — never the code, never the outcome — because the exam limiter counts rows created and so never sees a guess. Neither table is client-readable: RLS on, no policy, no grant, the posture `ai_model_calls` and `platform_cost_entries` already use. **A probe caught the defect that would have made the limiter useless:** a row inserted by a function that then RAISES does not survive the raise (measured 0 rows vs 1 for a return), so every EXPECTED refusal now RETURNS `{ok:false, reason:…}` and only the rate limit still raises — deliberately, since discarding its own row stops a throttled caller growing the table. Attach order is the contract: signed in → rate limit → resolve a published homework in an ACTIVE class → not active staff → ACTIVE member → attach → audit once. A wrong code, a draft, a closed paper, a deactivated class and a real code held by a non-member all return the identical `no_match`. `teacher_homework_can_open()` takes **no student parameter**. Evidence, all aborting: **11/11 installed function bodies byte-identical to the repo file** (paste fidelity measured, the check the H3 apply lacked); 14 wrong codes → 10 accepted then `53400` with **10 attempt rows recorded** (the exam limiter would hold 0); the prune measured (5 stale rows → 1); removal, rejoin, rotation, retired code, deactivation, pending assistant, staff self-attach, duplicate attach (`23505`) and anon all as designed; analyzer unmoved. Also verified: a draft's code is unavailable while it lives, retired on deletion (with or without content), refused to a student as an indistinguishable `no_match`, and a REFUSED delete reserves nothing. Also verified, on BOTH write verbs: a raw INSERT with a retired code REFUSED `22000` (fresh code accepted, live code `23505` — the UNIQUE, a separate mechanism), and a raw UPDATE to a retired code REFUSED `22000` — including onto a DIFFERENT row, so it is the code that is refused and not the row that retired it — while an UPDATE to a fresh code is accepted, to a live code is `23505`, and to the row's own current value is accepted. H2's own trigger untouched at `19bbc18c…`. Rollback rehearsal 6,22,1 → 8,28,2 → 6,22,1 with **all eight hash families identical, 0 differing** — the guard is dropped by name, trigger before function, since it sits on a surviving H2 table — and the rollback's refusal exercised BOTH ways (0 reservations proceeds, 1 refuses). 352-check contract suite, 109-check access-scope suite, CI 66/66, **75/75 mutants killed**. **The re-run dry-run found a defect that meant the file could not install at all**: §7.8 read the raw `prosrc`, and the attach body writes the words `was_member_at_request` in a comment in order to say it does not use them — a check reading prose, which could ONLY ever raise. It is the mirror of H3's §6.8 finding. Every §7 source check now reads the body with `--` comments stripped, the raw `prosrc` is held in no variable at all, and two mutants plus a whole-§7 assertion pin it. **⚠️ The H4 rollback window is OPEN and closes at the FIRST code rotation OR the FIRST DRAFT DELETION** (releasing reserved codes is worse than never fixing the hazard, and deleting a draft is the ordinary authoring action of the two, so it closes early and by accident) and the H2 rollback closes at the first student attachment — all stated in `20260904z`'s header before any apply. **APPLIED and verified 2026-09-03 — accepted at commit `788927c`.** **`20260904z` is the ACTIVE rollback artifact and ITS WINDOW IS CURRENTLY OPEN** — re-measured at closeout: retired codes 0, attachments 0, attach attempts 0. It closes at the first rotation or the first draft deletion, so reversibility is a decision to take BEFORE a teacher touches the system. One file, one transaction, no enum migration — `homework_attached` was read back COMMITTED AND CASTABLE before the apply. Post-apply evidence: the trigger reads back `BEFORE INSERT OR UPDATE OF homework_code ON public.teacher_homework`; **all eleven installed bodies byte-identical to the repo file**, the three redefined H3 functions now at `4fca434e…` / `124b4acb…` / `f7f430e2…`; H2's guard still `19bbc18c…` and `teacher_homework_is_staff` still `63ef7fa2…`; both new tables RLS on with no policy and no client grant, the reservation with no foreign key. 43 behavioural checks on the LIVE functions, 0 failures: both retirement exits correct with provenance; raw INSERT and raw UPDATE of a rotated-away or deleted-draft code both refused `22000` (including onto a DIFFERENT row); a fresh code accepted on both verbs; a live code `23505`; the row's own value accepted; the column scope proven with the planted-code pair (title / `due_at` / publish / reveal accepted, the same value named in the column refused); a closed paper's code write `42501`; 14 wrong codes → 10 then `53400` with 10 attempt rows; the prune 5→1; attach, re-entry, `can_open` through removal / rejoin / deactivation / close; teacher and ACTIVE assistant identical on the roster; outsider, pending assistant and no-session all `42501`; exactly ONE `homework_attached` event with the student as actor and subject. Access scope driven as the real roles: both internal tables refuse `authenticated` SELECT and INSERT, `teacher_homework_code_available()` and the guard refuse `authenticated`, `anon` holds EXECUTE on 0 homework functions. Nothing survived: all EIGHT homework tables at **0 rows**, audit log 2 rows with 0 homework labels, analyzer unmoved at 893/11/24. New production baseline: 190 migrations, newest `20260903203209`, 84 tables / 209 functions / 138 policies / 22 enum labels, 8 homework tables / 28 homework functions / 9 homework policies / 2 triggers on `teacher_homework`; hashes constraints `26715f0c…`, policies `1480dd9e…` (BYTE-IDENTICAL to the pre-apply value — H4 adds no policy, measured), relations `01e30b21…`, triggers `59ba9b5a…`, grants `9642f485…`, homework bodies `189231ec…`, homework signatures `9ffa38a1…`. **There is still no way for a student to open, save or submit — only to be attached.** **H5 is AUDIT-ONLY and the audit is complete — `docs/roadmap/teacher-intelligence-layer.md` §15.18** (read-only, 2026-09-03; no SQL, no migration, no UI). It found **no defects** and eight decisions that must be settled BEFORE H5 is written. **D-1 and D-2 are now LOCKED (§15.19).** D-1: closing prevents new starts but an `in_progress` attempt may resume, answer and submit; close must not mutate the attempt; membership/workspace stay live-rechecked. **No schema change is needed and no guard conflicts** — measured, closing mutates nothing on the attempt and saving, grading and submitting after close are all ACCEPTED today. The one thing that must change is `student_my_homework()`, whose `can_open` column read FALSE after close with a sitting in progress; `teacher_homework_can_open()` is already exactly the new-start gate and is best left untouched. D-2: `reveal_answers` gates `correct_answer` + `explanation` only, never the student's own per-item verdict — **this needs NO policy change**, so the 0-rows urgency on D-2 is gone. **Two things it surfaced are NOT decided:** (i) a student removed MID-SITTING can never resume and their attempt can never be deleted (`42501`), so it sits `in_progress` on the roster forever; (ii) **reveal alone is not a sufficient read condition** — `teacher_homework_reveal_answers()` never consults attempts (measured) and works on a closed paper, so an H5 read gated only on the flag would hand the key to a student who has not submitted and can still edit answers; the read must also require the caller's attempt to be `submitted`. **D-3 is now a precondition of D-2, not a free choice**: `is_correct` is readable the instant it is written, so grading must happen at submit and never on save. Two of them are cheap only while every homework table holds 0 rows: **D-1** — `teacher_homework_can_open()` requires `status='published'`, so it goes false the moment a paper closes even for a sitting already in progress, while the responses guard consults only the ATTEMPT status and still accepts an answer (both measured); decide whether closing ends a sitting or `teacher_exam_start`'s resume-before-authorize pattern applies. **D-2** — `teacher_homework_responses_own_read` is attempt ownership and NOTHING else, so a student reads their own `is_correct` the instant it is written, with `reveal_answers=false` (measured); decide whether that flag gates the key only or the verdicts too, because narrowing the policy is cheap only at 0 rows. Also named: no INSERT guard exists on `teacher_homework_attempts` or `teacher_homework_responses` — a born-`submitted` attempt and a response marked correct carrying a wrong answer were both ACCEPTED as table owner, unreachable for clients (SELECT is their only grant) but the exact shape of the H4 code-guard finding. The analyzer boundary was PROVEN at the database layer: no function names both a homework and an analyzer table, **no database function writes `weakness_signals` at all**, only `exam_submit` writes `exam_mistakes`/`exam_practice_sessions`, no trigger sits on any analyzer table, and a full authored → answered → graded → submitted sitting moved 893/11/24 by zero — so H5's real boundary is the CLIENT guard `exam.html` already carries. **H3 is LIVE — applied 2026-09-03 as TWO files in a REQUIRED ORDER: `20260903a` (version `20260903175543`) then `20260903b` (version `20260903175957`)**, rollbacks `20260903z` and `20260903y` both PREPARED and unapplied. `20260903a` adds ONE `workspace_audit_action` label, `homework_answers_revealed`, and nothing else — separate for the same measured reason as `20260902a`/`20260901b`: a new enum label cannot be cast until the transaction that added it commits, so a migration that adds a label and then writes it cannot work as one unit (proved twice on production, `55P04` with the label added in-transaction and `22P02` without). Like every enum migration it is NOT cleanly reversible. `20260903b` (renamed from `20260903a`) is the thirteen client RPCs (create, update, set_due_at, reveal_answers, delete, save/delete stimulus, save/delete question, reorder, publish, close, rotate_code) plus two helpers granted to nobody. It adds **no table, policy or type** and reuses H2's `teacher_homework_is_staff()` rather than redefining it. `due_at` and `reveal_answers` each get their OWN RPC because their lifecycles differ from the paper's, and `teacher_homework_reveal_answers(uuid)` takes **no boolean** — un-revealing is not a call the API can express. **Five** audit labels are now writable, reveal included (`homework_attached` is still H4's); update, delete, content edits and reorder still log nothing. **A draft with content is now deletable** — the RPC deletes its questions and stimuli itself, in that order, while the parent row still exists, because PostgreSQL removes the parent BEFORE running the cascade and `teacher_homework_content_guard()` then reads a NULL status and fails closed. The guard is untouched. Anything a student holds still refuses, with a count. Evidence: 261-check contract suite, 109-check access-scope suite, CI 66/66, **73/73 mutants killed with none unapplied**, and five aborting production passes. **The dry-run found two defects no static test could have caught, both in the file's own verification block: §6.6 forbade the MENTION rather than the WRITE of the student tables (which the approved delete pre-check must do), and §6.8 compared `pg_get_function_identity_arguments()` against `'uuid'`, which that function never returns — it includes the parameter name — so the file could ONLY ever raise and could not install at all.** Both fixed; the second is the mirror of the vacuous-assertion rule (*a check that cannot go green is as useless as one that cannot go red*), and it means the 30-probe dry-run recorded for the original H3 commit did not exercise the file as committed. A third finding is user-facing: the delete refusal said *"close it, do not delete it"* for a CLOSED paper too — **inherited verbatim from `teacher_exam_delete()` in `20260901e`, which is LIVE and still says it**; H3 now gives each status its own message, and the exam RPC's wording is recorded as a separate defect, not fixed here. After the fixes: all 15 bodies installed byte-identical to the file, the delete truth table correct in all nine cases (empty draft and draft-with-content DELETED, attachment / attempt / graded-answer / published / closed / outsider REFUSED, assistant DELETED for parity, every student row untouched), and the reveal event proved with a shadow differing in exactly one label literal — one row per reveal, actor = the revealing staff member (teacher AND assistant), `subject_id` NULL, `meta` = `{"homework_id": …}`, timestamp from the column default, **+0 rows for a repeat and +0 for a refusal**, a CLOSED paper revealing and staying closed, and un-reveal refused even as the table owner. Rollback rehearsals: `20260903y` took the homework functions 7 → 22 → 7 with **all nine hashes identical to pre-install and 0 differing**, and only signatures/bodies/ACLs moved on install; `20260903z` returned the label list to the same md5, left the log byte-identical and back on the type, and refused correctly on a recorded label (rehearsed with a stand-in, since the real literal cannot be planted in the transaction that adds it). **APPLIED and verified 2026-09-03.** Between the two applies the label was read back COMMITTED AND CASTABLE — the one test `20260903a`'s own verification block says it cannot perform, and the whole reason the increment is two files. Post-apply evidence: all 15 bodies byte-identical to the file; 13 client RPCs definer + `search_path` pinned + `authenticated` EXECUTE; the two helpers callable by nobody and `anon` by nothing; `teacher_homework_is_staff` still `63ef7fa2…`; 22 enum labels with the new one at position 22 and the prior 21 in their original order, compared as one exact string. **The schema hashes did NOT move** — constraints `f0c920cc…`, policies `222a2ad9…`, relations `53ff18a8…`, triggers `e755accf…`, grants `2d610a2a…` are byte-identical to the values measured before the install during the rollback rehearsal, so "H3 adds no schema" is a measurement. Behavioural, on the live functions in an aborting transaction: the nine-case delete truth table exactly as designed (empty draft and draft-with-content DELETED; attachment / attempt / graded-answer / published / closed / outsider REFUSED; assistant DELETED for parity; student rows untouched), and the reveal driven by the REAL RPC — teacher +1 event with actor = the revealer, `subject_id` NULL, `meta` exactly `{homework_id}`, timestamp from the column default; two repeats +0; a refused reveal +0; assistant +1 with the assistant as actor; a CLOSED paper revealing, logging once and staying closed; un-reveal refused `22000` even as table owner. Pending assistant, student and outsider all refused `42501`; `anon` gets *permission denied for function* (the ACL, not the gate). Nothing survived: six homework tables back to **0 rows**, audit log 2 rows with no homework label, analyzer unmoved at 893/11/24, `homework_attached` still 0. New production baseline: 189 migrations, newest `20260903175957`, 22 homework functions (7 H2 + 15 H3), 201 public functions / 133 public policies / 82 tables / 22 enum labels, homework bodies `460b13a8…`, signatures `b49d7d17…`. **There is still no student write path — H4 has not started.** **`20260902a` (Teacher Homework H1) is LIVE** (applied 2026-09-02 as `20260902001047`): five `workspace_audit_action` labels (`homework_created/published/closed/code_rotated/attached`) at positions 17–21, appended, nothing else — the database can now NAME five homework events it still has no way to cause. Each label was written and read back for real in an aborting transaction after the apply. Its rollback posture `20260902z` is, like `20260901y`, NOT a clean undo (no `DROP VALUE`), refuses if any row records a homework label, and stays PREPARED and unapplied. **H2 (the homework schema) is LIVE — applied 2026-09-03 as versions `20260903123333` / `20260903123410` / `20260903123458`, in that order** — `20260902b` (five `teacher_homework*` tables, 28 named constraints, 9 foreign keys, 3 indexes, 5 guards on 6 triggers), `20260902c` (RLS, SELECT-only grants, the role-blind `teacher_homework_is_staff()`, 7 SELECT policies) and the undo `20260902y`. **Both holds were resolved on 2026-09-03 and H2 is now an ATOMIC THREE-FILE PACKAGE — `20260902b` + `20260902c` + `20260902d`, applied in that order or not at all, undone by `20260902y` alone (which is safe on a partial apply).** `20260902d` adds `teacher_homework_responses`, the per-item answer record H5 cannot save or grade without: eight columns, the three-valued `is_correct` (NULL = not answered, never wrong), **no timing or visit columns** (homework is untimed and resumable, so those numbers would only invite a pacing inference decision 2 forbids), and the same-homework rule expressed as **two COMPOSITE FOREIGN KEYS** onto new `unique (id, homework_id)` keys in `20260902b` — a constraint rather than a trigger a later migration could drop. `reveal_answers` is now a **ONE-WAY LATCH**: `false → true` in any status **including closed**, `true → false` refused everywhere. That closed-status exception exists because it was measured impossible before: a closed homework could never reveal its answers, which broke *close, then show the answers*; the closed gate now names every other column explicitly, and a statement revealing AND moving `due_at` is still refused. Evidence: 169-check contract suite, 33/33 mutants killed, a verbatim production dry-run of all three files with 37 probes and 0 unexpected results, and a rollback rehearsal that refused with student work planted then returned every hash to baseline. **APPLIED and verified 2026-09-03.** Post-apply evidence: all seven function BODIES are byte-identical to the repo files (`prosrc` md5 compared against values pre-computed from the files, so a paste that lost a comment would have failed); 6 tables, 51 constraints (36 named + 15 auto), 17 indexes, 7 BEFORE triggers, 9 SELECT-only policies, `SELECT`-to-`authenticated` the only client grant, `anon` nothing, every definer function's `search_path` pinned, and `teacher_homework_is_staff` the only function clients may EXECUTE. **21 behavioural checks on the live schema, 0 failures**, in an aborting transaction: both cross-homework FK violations refused `23503` naming the right constraint, the latch correct in all six status/direction combinations (including CLOSED `false → true` leaving `status` and `closed_at` untouched, and a reveal+`due_at` statement still refused), teacher = ACTIVE assistant, pending assistant and outsider see nothing, a member student sees only their own attachment/attempt/answers, all four client writes refused `42501`. Analyzer unmoved (`893/11/24`), audit log still 2 rows at md5 `9ff25122…`, all six homework tables at **0 rows** — there is no write path until H3. New production baseline: constraints `44e9608c…`, policies `370ff326…`, relations `a5e244f2…`, triggers `3da9d509…`, grants `e1f0bb57…`, counts 186 fn / 133 policies / 82 tables. `20260902y` stays PREPARED and unapplied. The retired-code hazard (a rotated-away code can be claimed by a new homework) is deliberately an H4 decision, not an H2 fix. It borrows exactly four things from the exam system, all by call: `exam_stimulus_shape_ok`, `exam_stimulus_spec_ok`, `exam_question_choices_ok`, `exam_question_answer_ok` — asserted character-for-character identical to 3b's own calls. It reuses **nothing** of the exam ACCESS model: `teacher_homework_access` has three columns and no `state`, because §15.14 gives homework no approval queue. Both files were run verbatim against production in an aborting transaction with **49 behavioural probes and 0 failures** — teacher and ACTIVE ASSISTANT read identically (the assistant was created and activated through the real staff RPCs in the same transaction), a member student sees no paper and no content, `anon` cannot call the staff helper, **every client write is refused with 42501 because no write path exists until H3**, a late submission is ACCEPTED and flagged, and `weakness_signals` / `exam_mistakes` / `exam_practice_sessions` moved by zero. `20260902y` is a CLEAN undo, unlike `20260902z`: rehearsed in an aborting transaction it refused while one planted attachment existed, then returned the constraint, policy, relation, trigger, grant and function hashes to their exact pre-H2 values. 34 of 34 mutants killed. **The per-item answer record H5 needs (the twin of `teacher_exam_responses`) is deliberately OUTSIDE this increment** — the approved scope named five tables — and must be prepared and approved separately before H5. **`20260901h` is LIVE** (applied 2026-09-01 as `20260901220926`): `teacher_student_weaknesses()` now carries two trailing columns, `topic_id` and `subtopic_id` — the STORED ids, for the class-wide weakness aggregate (§15.11 decision b: the aggregate keys on the stored id and must not resolve labels). Body otherwise byte-identical to `20260830d` (the suite asserts the diff is exactly the two added select lines); live md5 `5d69fc51…` equals the value pre-computed from the file; ACL identical to the other teaching reads; the `20260830d` contract suite re-run 10 of 10. Its rollback `20260901t` is PREPARED, unapplied and **rehearsed** (md5 back to `889dfaaa…`). **The class-patterns card is BUILT — in the repo, NOT deployed** (`teacher.html`, under Attention, hidden by default): stored `subtopic_id` only, 14-day window before counting, ≥3 distinct active students AND ≥20% of the active roster, null ids excluded and disclosed, no trend, `severeBands` declared once, teacher/assistant identical. The rule is a pure function lifted out of the page and RUN by `tests/teacher-class-patterns.test.mjs`; 21 of 21 mutants killed; five headless states. **Teacher Exams 3b is LIVE**: `20260901c` (six `teacher_exam*` tables, 40 named constraints, 7 guards) applied as `20260901161812`, `20260901d` (RLS, SELECT-only grants, 9 policies, `teacher_exam_is_staff()`) as `20260901161844`, and a verbatim re-apply of five guard bodies as `20260901162042` — the first paste had stripped their inline comments, and the file is the record of what is live. **Teacher Exams 3c is LIVE** (`20260901e`, applied as `20260901165317`): twelve functions — ten authoring RPCs plus two internal helpers — and no table, column, policy, grant or row. Teacher and **active assistant** have identical academic power, demonstrated rather than asserted: every authoring step, the publish and the close were driven end to end by the assistant in the post-apply suite. The publish gate is deliberately NOT `publish_exam_form()` and checks only what a CHECK constraint cannot express — no questions, ordinals not 1..n, a window already past, a window shorter than the paper's own duration. Exam codes get their **own** bounded retry wrapped around the INSERT (`workspace_new_code()`'s missing retry is still a separate, untouched increment), and `media_sha256` is computed server-side with any client value ignored. Rollback `20260901w` is PREPARED, unapplied and **rehearsed** — it returns the function-body, constraint and policy hashes to their exact pre-3c values. **Teacher Exams 3d is LIVE** (`20260901f`, applied as `20260901172530`): seven RPCs that give the exam code a meaning — it raises a REQUEST, and a request is not access. `teacher_exam_can_start()` is the sole authority and takes **no student parameter** (one would let any account probe another student's access). It re-reads five live conditions every call: approved, active membership, active workspace, published, inside the window. **An approved OUTSIDER still cannot start** — membership is a separate condition, proven rather than assumed. The rate limit fires **before** the code is resolved, so a throttled student gets the identical message for a valid and an invalid code; but note honestly that it counts ROWS, and a wrong code creates none, so it caps attachments per hour and does **not** count failed guesses — what defeats guessing is the 2^40 code space plus the single indistinguishable failure message. Rotation stops the old code and **revokes nothing**. Rollback `20260901v` is PREPARED, unapplied and rehearsed. **Teacher Exams 3e is LIVE** (`20260901g`, applied as `20260901174100`): six RPCs — start/resume, save, submit, the student's own result, and the two staff reads. `teacher_exam_start()` CALLS `teacher_exam_can_start()` rather than restating it, and `teacher_exam_submit()` grades through `exam_answer_matches()`, the platform's single grading rule — both asserted against the function source, with `--` comments stripped so the check tests code and not prose. **The resume lookup comes BEFORE any authorization**: a student whose class link is revoked mid-paper finishes the sitting they are in and cannot begin another, which is §15.14 and not a bug. Omission stays three-valued (`is_correct` NULL, never false). The submit payload deliberately returns **counts only** — no per-item breakdown, because an mcq marked wrong is a narrowed key on a paper the teacher may set again — and above all not the topic|subtopic `mistakes` shape `exam_submit()` returns, which would be an invitation to post it into the analyzer. Two full graded sittings moved `weakness_signals`, `exam_mistakes` and `exam_practice_sessions` by zero. Rollback `20260901u` is PREPARED, unapplied and rehearsed. **The backend is complete from code to grade.** **Teacher Exams 3f is LIVE IN THE REPO, NOT DEPLOYED** (`teacher-exams.html`, linked from `teacher.html`): the staff authoring surface — create/edit a draft, all six stimulus kinds through the SHARED `stimulus-view.js` renderer, preview, reorder, publish, close, code display and rotation, the access queue with approve/reject/revoke, and results. It added **no schema**: a read-only audit proved every authoring read is already served by 3b's staff-read policies, so the page reads tables directly and writes only through RPCs. It gates on `staff_status = 'active'` and **never on `staff_role`** — parity is locked, and the Partner link beside it is the deliberate contrast. 3g is the student player. Teacher-authored content is structurally outside the analyzer — a full graded sitting moved `weakness_signals`, `exam_mistakes` and `exam_practice_sessions` by zero, and each counter was separately proven able to move. Rollback `20260901x` is PREPARED, unapplied, **rehearsed** (it returns the constraint, function-signature, function-body and policy hashes to their exact pre-3b values) and refuses outright if any sitting exists. **Teacher Exams 3g is LIVE IN THE REPO, NOT DEPLOYED** (`exam.html`): the student player. It added **no schema, no RPC, no policy and no migration** — a read-only audit driven as a real signed-in student proved every screen is already served by 3d and 3e, and the production diff after the work shows the last applied migration still `20260901174100` and the six student-callable function bodies and ACLs unchanged. **One player serves both systems**: `api.start/save/submit` dispatch on `S.source`, and the localStorage resume key is namespaced (`exam_req_t_`) because a teacher exam id and a platform section id are both uuids and one key space would let a refresh resume the wrong sitting. The analyzer boundary is a guard in `finish()` that returns **before** every writer — measured, not asserted: a headless submit of a teacher paper called `ExamMistakesLogger.process`, `regenerateWeaknessReports` and `updateStreak` zero times, and the identical platform submit called all three. **The page never decides who may sit** — only `can_start` turns a row into a Start button, and the tile's own decision reads nothing else. Where a row is not startable and the page cannot see why (a class link revoked after approval, a deactivated workspace), it says *Ask your teacher* rather than naming a cause: `can_start` carries no reason, and the headless probe caught an earlier draft claiming "Not open yet" about an exam that was open. Read `docs/roadmap/teacher-intelligence-layer.md` §15.14 before touching any of it. `20260901b` (eight `workspace_audit_action` labels for Teacher Exams) applied 2026-09-01 as version `20260901153803`. **It adds enum labels and nothing else** — no table, RPC, policy or row — so the database can now NAME eight events it still has no way to cause. It is separate from the tables increment because of a measured PostgreSQL property, not a preference: `alter type ... add value` runs inside a transaction, but the new label **cannot be cast or inserted until that transaction commits** (`unsafe use of new value`), so a migration that adds a label and then writes it cannot work as one unit. **This migration is NOT cleanly reversible** — there is no `ALTER TYPE ... DROP VALUE`; its rollback `20260901y` drops and recreates the type around a live column, refuses if the log already records a new label, and stops being meaningful once any exam RPC ships. Treat the label set as permanent. `20260901a` (`exam_stimulus_shape_ok()`) applied 2026-09-01 as version `20260901150838`: a pure refactor that lifts the three-shape rule out of `exam_stimuli_shape_check` into a named function so a second table can share it. Semantics unchanged — a 48-case truth table shows 0 disagreements with the inline expression it replaced, and all 33 stored rows still pass. Its rollback `20260901z` is PREPARED, deliberately unapplied, and **rehearsed**: run in an aborting transaction it returns the whole-schema constraint md5 and the function-signature md5 to their exact pre-apply values, so it is a true undo rather than a hopeful one. The Teacher Partner Program backend `20260831b/c/d/e` applied 2026-08-31 (versions `20260831115804` / `120342` / `120608` / `152640`), plus the ACL fix `20260831f` (`153041`). **`20260831e` REDEFINES `approve_payment_request`, `activate_subscription` and `activate_credit_pack`** — never re-apply it without first diffing all three against production, or it silently reverts whatever changed. Its rollback `20260831y` is PREPARED and deliberately unapplied. `20260831a` (`teacher_attention()`) applied 2026-08-31 as version `20260831025024`; its rollback `20260831z` is PREPARED and deliberately unapplied — the gap between the two counts is now partly deliberate, not only historical. `20260830j` (the assistant re-application fix) and `20260830k` (workspace creation is now **platform Owner only** — `current_user_role() <> 'owner'`, not a rung comparison) applied 2026-08-30. Exam delivery `20260830e/f`, the intervention record `20260830g`, the `owner`→`teacher` rename `20260830h` and the routing function `20260830i` (`my_experience()`) applied 2026-08-30. The rollbacks `20260830u/v/w/x/y` are deliberately unapplied. Teacher foundation `20260830a…c` and the weakness read `20260830d` applied 2026-08-30 |
| Static site | **52** root `*.html` pages on Vercel (measured 2026-09-01). Teacher Exams (`teacher-exams.html`, `exam.html`) deployed at `a7c1136`. **The class-patterns card on `teacher.html` is in the repo and NOT deployed** — nothing reaches a teacher until this branch merges |
| CI | `node tests/run-all.mjs` — **64 checks** (measured 2026-09-01, after `teacher-exam-student`) |

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
  `teacher_student_weaknesses()` (live 2026-08-30; since 2026-09-01 it also returns the stored
  `topic_id`/`subtopic_id`), which withholds the
  analyzer's working numbers so no surface can. `weakness-view.js` shapes one
  row per role and derives nothing. The class-wide **aggregate** is a pure function in `teacher.html`
  over N of those per-student reads (§15.11): stored `subtopic_id`, 14 days, ≥3 AND ≥20%, exclusions
  disclosed — never a resolved label, never a trend. The class-wide read is `teacher_attention()`
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
