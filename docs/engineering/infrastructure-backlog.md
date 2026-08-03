# Engineering infrastructure backlog

**Scope:** platform and deployment infrastructure. **Not Truth System work.**
Truth System execution lives in `docs/roadmap/truth-system-v2-backlog.md` and is
a frozen baseline; these items are deliberately kept out of it so neither track
distorts the other.

**Status key:** `APPROVED` — agreed, awaiting scheduling · `DEFERRED` — agreed in
principle, deliberately not now · `PROPOSED` — not yet decided.

---

## INFRA-1 — `.vercelignore`

**Status:** `DEFERRED` — approved in principle, **own PR, after a scoping
discussion.** Explicitly not to be combined with V1 or any other work.

**Problem.** `vercel.json` carries only headers and there is no `.vercelignore`,
so the production deployment ships the entire repository tree — `docs/`,
`supabase/migrations/`, `tests/`, `scripts/`. Verified: `GET
/docs/roadmap/v0-notes.md` returns HTTP 200. `ssoProtection` is
`all_except_custom_domains`, so the custom domain is public, and `robots.txt` is
`Allow: /` for every major AI crawler.

The repository is public, so nothing is secret. The concern is that ungoverned
internal roadmap documents share a crawl surface with the knowledge layer built
specifically to keep AI systems accurate about the platform — and that if the
repository ever goes private, this becomes a live exposure with no code change to
notice.

**Open question for the discussion, and the reason this is not a one-liner:**
exactly what should and should not be exposed. `SECURITY.md`, `DEPLOY.md` and
`llms-full.txt` are arguably three different answers, and `docs/knowledge/` may
belong on the public side deliberately.

**Reference:** `deployment-pipeline.md §5.1`

---

## INFRA-2 — Approval gate on root `*.html` deployments

**Status:** `DEFERRED` — current behaviour documented; revisit **after V1 has
started.** No workflow change yet.

**Problem.** Merging to `main` deploys the static site to Vercel production
immediately, with no approval step. Every other production change in this project
is gated: Edge Function deploys need explicit approval plus `DEPLOY.md §4`, and
migrations are approved individually. Root `*.html` is the only unapproved path
to a live student-facing change.

**Documented current behaviour:** `deployment-pipeline.md §2.1` and `§5.2`.

**Options when revisited:** a Vercel deploy-approval setting, or a CI gate scoped
to the served paths. Not decided.

---

## INFRA-3 — Deployed-vs-`main` drift check

**Status:** `APPROVED` as engineering infrastructure work. Not scheduled.

**Problem.** Nothing makes it visible whether the repository is ahead of
production. The only way to know is to compare the live platform version and
bundle sha256 against the source by hand. The same applies to migrations: 73
files in the repo, 137 applied in the database, and the two counts drift
independently.

**Demonstrated again on 2026-08-02.** `main` and the deployed `ai-tutor` are in
sync right now (v96 / platform version 135) — but establishing that took a
manual four-file byte comparison, and the same exercise found `CLAUDE.md`
recording platform version 133 while production ran 134. A stale figure in the
one file that claims to be the measured baseline is exactly the failure this
item removes.

"Is it live?" is currently a question you can only answer by querying, and
nothing prompts you to ask it.

**Sketch, not a design.** A check that reports, without failing a build:

- live Edge Function platform version + `ezbr_sha256` vs the current `main` source
- applied migrations (`supabase_migrations.schema_migrations`) vs
  `supabase/migrations/*.sql`, in both directions
- the env flags actually set on the function vs their documented defaults

**Where it belongs is an open question.** CI cannot reach production credentials
today, so this is more likely a panel on `ai-monitor.html` or a manual script in
`scripts/`, not a GitHub Actions step. Decide before building.

**Reference:** `deployment-pipeline.md §5.3`

---

## INFRA-4 — `CLAUDE.md` records counts that go stale by design

**Status:** `PROPOSED`

**Problem, demonstrated.** `CLAUDE.md` was refreshed on 2026-08-02 recording
"131 migrations applied". Within roughly one hour it was **133** — two migrations
(`plan_catalog_single_source`, `plan_rpc_grant_hygiene`) were applied to
production out-of-band, and neither has a committed file.

The dated-verification header worked exactly as intended: the file says reality
wins where it disagrees. But recording a fast-moving count in a rules file
guarantees it is wrong most of the time, and a stale rule is worse than an absent
one because it is believed.

**Proposal.** Keep slow-moving facts (project ref, taxonomy shape, repository
shape). Replace fast-moving counts with **the method for obtaining them** — for
migrations, "query `supabase_migrations.schema_migrations`; do not trust the file
listing." Largely obviated if INFRA-3 ships.

---

## INFRA-5 — Study Planner still charges from the browser

**Status:** `PROPOSED` — raised by the v96 quota-enforcement fix.

**Context.** v96 moved the chat quota gate out of `chat.html` and into the
`ai-tutor` Edge Function, because a gate the client decides whether to open is
not a gate. The same pattern still exists on one other path: `chat.html`'s Study
Planner charges `STUDY_PLAN` (20 credits, `always_charge`) via
`CreditConfig.charge()` in the browser, and refunds via `refund_ai_credit()` in
the browser if generation throws.

**Why it was left alone, and why that is not "fine".** The Study Planner makes
**no provider call** — `window.StudyPlanner.buildStudyPlan()` is a pure
client-side computation over data the student already has. So the charge is a
paywall on a local feature, not a gate in front of spend: skipping it costs the
platform no money and does not touch the FREE daily cap (`always_charge` rows
never take the free branch). That is why it was correctly out of scope for a fix
whose defect was "free students get unmetered LLM calls".

It is still a client-enforced paywall. A student who skips the charge gets the
feature for free. That is a revenue question rather than a cost or quota one,
which is why it is here rather than in the fix.

**Its refund is already gone (v96).** The path used to charge first and refund
from the browser if the local engine threw — the last authenticated client route
to `refund_ai_credit`. Rather than break it when
`20260802_refund_ai_credit_server_only.sql` lands, the order was inverted: the
plan is **built first and charged after**, so the failure the refund existed to
undo can no longer happen after a charge. The planner makes no provider call, so
doing the work before the paywall costs nothing.

Residual: a throw in `saveStudyPlan` after the charge leaves the student charged
with no persisted plan. The plan is still rendered (`saved: false`), so they get
what they paid for; only persistence is lost.

**What remains for this item** is only that the charge is client-side and
therefore skippable.

**Options.**
  (a) Move the charge server-side, as v96 did for chat. Needs a server-side
      entry point for the planner, which does not exist today — it is deliberately
      a client engine (`_shared/study-planner.core.js` runs in the browser).
  (b) Charge through a narrow `SECURITY DEFINER` RPC that also writes the plan,
      so the paywall and the persistence commit together.

Neither blocks the migration any more. This is a revenue question, not a cost or
quota one — nothing here can run up a provider bill or touch the FREE daily cap
(`STUDY_PLAN` is `always_charge`, so it never takes the free branch).

---

## Note: migrations applied without a committed file

Observed 2026-08-02: `plan_catalog_single_source` (03:56 UTC-equivalent
`20260802025651`) and `plan_rpc_grant_hygiene` (`20260802030156`) are applied in
production and absent from `supabase/migrations/`.

This is the pre-existing parity gap (`scripts/check-migration-parity.sh` exists
for it) and it is recorded here only because it widened during the baseline work
and is the direct motivation for INFRA-3. **No action taken and none proposed
here** — whether to backfill the files is the owner's call.

---

## Note: platform audit, 2026-08-03

An end-to-end QA pass over all 46 pages, the shared client modules, both Edge
Functions and the client↔database contract produced 76 findings. 24 were fixed
and verified; the remainder are recorded in
`docs/engineering/platform-audit-2026-08-03.md`, grouped by what blocks them —
the taxonomy freeze, the frozen pages, an Edge Function deploy, a migration, or
a product decision.

**Two items from it belong to this backlog's scope**, and are written up in full
in that document rather than duplicated here:

- **AUD-2** — `approve_payment_request` grants by a client-supplied `plan_code`
  without ever checking the submitted `amount_egp` or `plan_label` against
  `plan_definitions`. The admin UI now surfaces the granting field and flags a
  mismatch, but the server still trusts the row. Needs a migration.
- **AUD-3** — there is no service-role path to delete a user. `delete_my_account`
  clears every row of personal data; the GoTrue sign-in record survives, because
  `auth.admin.deleteUser` requires the service_role key. `settings.html` now
  reports this honestly instead of claiming the account was fully removed.
  Closing it needs an `admin-actions` action plus a deploy.

The single highest-severity open item from that audit is **AUD-1**, which is not
infrastructure: one canonical subtopic (`STA_004 Stem-and-Leaf Plots`) cannot be
written to the database at all, because the alias table is missing the exact key
its own display name normalises to. The fix is one line in a frozen file.
