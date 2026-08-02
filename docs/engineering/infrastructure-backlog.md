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

**Problem.** Nothing makes it visible that the repository is ahead of production.
`main` currently contains an `ai-tutor` that is not deployed, and the only way to
know is to compare the live platform version and bundle sha256 against the source
by hand. The same applies to migrations: 68 files in the repo, 133 applied in the
database, and the two counts drift independently.

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

## Note: migrations applied without a committed file

Observed 2026-08-02: `plan_catalog_single_source` (03:56 UTC-equivalent
`20260802025651`) and `plan_rpc_grant_hygiene` (`20260802030156`) are applied in
production and absent from `supabase/migrations/`.

This is the pre-existing parity gap (`scripts/check-migration-parity.sh` exists
for it) and it is recorded here only because it widened during the baseline work
and is the direct motivation for INFRA-3. **No action taken and none proposed
here** — whether to backfill the files is the owner's call.
