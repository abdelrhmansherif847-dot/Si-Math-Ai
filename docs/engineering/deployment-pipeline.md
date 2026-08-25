# Deployment pipeline — what deploys, when, and what does not

**Status:** Current engineering baseline. Verified 2026-08-02 against the live
Vercel project, the live Supabase project, and the repository.
**Audience:** anyone about to merge, deploy, or claim that something is live.

Every fact here was measured, not recalled. Where a claim could not be verified,
it says so.

---

## 1. The one-paragraph version

Si Math AI has **three independent deployment surfaces** and only one of them is
automatic. Merging to `main` deploys the **static site** to Vercel production
immediately and without approval. It does **not** deploy the Edge Function and it
does **not** apply migrations — both of those are manual, and both require
explicit approval. The most common mistake this document exists to prevent is
assuming a merge shipped something it did not, or assuming a merge shipped
nothing at all.

| Surface | Trigger | Automatic? | Approval gate |
|---|---|---|---|
| **Static site** (46 root `*.html`, `assets/`, root `*.js`) | push/merge to `main` | ✅ **yes** | none |
| **Edge Functions** (`ai-tutor`, `admin-actions`) | manual CLI | ❌ no | `DEPLOY.md §4` + explicit approval |
| **Database migrations** | manual | ❌ no | `CLAUDE.md §3`, individually approved |

---

## 2. GitHub → Vercel

**Project:** `si-math-ai` (`prj_gPCJAUQahA2Ivz3n15JPl3gwshTC`)
**Team:** `abdelrhman-s-800` (`team_mISnA0pwIRDMjzD6SR5HdKUM`)
**Canonical domain:** `https://www.si-math-ai.com`

### 2.1 What triggers a production deployment

**Any commit landing on `main`.** The GitHub integration creates a production
deployment automatically — no approval, no manual step, no opt-out per merge.

Confirmed on the Phase V0 merge: commit `89fe0d91b7` produced deployment
`dpl_CZRYDG8tHrY1XyxjFDR6MSKP63AN`, `target: production`, `state: READY`,
`githubDeployment: 1`.

**This includes documentation-only merges.** A PR that changes nothing but
markdown still redeploys the production site. The deployment is a no-op in
substance — no served asset changed — but it is a real deployment event and it
appears in the deployment history.

### 2.2 Pull requests get preview deployments

Each PR gets its own preview deployment plus the *Vercel Preview Comments* check.
Previews never affect production.

### 2.3 Deployment protection — the asymmetry that matters

```
ssoProtection: { enabled: true, deploymentType: "all_except_custom_domains" }
passwordProtection: disabled
trustedIps: disabled
```

Read that carefully:

- `*.vercel.app` deployment URLs **are** SSO-protected. Fetching one anonymously
  redirects to Vercel SSO.
- **The custom domain is explicitly excluded.** `www.si-math-ai.com` is fully
  public, as it must be for a public product.

The consequence is in §5.1 and it is the main risk this document records.

### 2.4 What Vercel actually serves

`vercel.json` contains **only** `headers` — six rules covering CSP, HSTS and
related security headers. There is:

- no `buildCommand`, no `outputDirectory`, no `framework`
- no `rewrites`, `redirects`, `routes`, or `cleanUrls`
- **no `.vercelignore` anywhere in the repository**
- a `.gitignore` excluding only `.claude/worktrees/` and `logs/`

So the deployed artifact is **the entire repository tree**, served as static
files from the root. That includes `docs/`, `supabase/`, `tests/`, and
`scripts/` — none of which is part of the product.

**Verified:** `GET /docs/roadmap/v0-notes.md` on the deployment returns
**HTTP 200** with `content-type: text/markdown` and the full document body.

---

## 3. GitHub → Supabase

**Project:** `igvkyxkmjnkzscqgommj`

### 3.1 Nothing is automatic. There is no integration.

There is no Supabase GitHub integration, no branch-preview database, and no
CI step that touches Supabase. Merging to `main` changes nothing in the
database and nothing in the Edge Function runtime.

### 3.2 Edge Functions — manual, and deliberately constrained

`ai-tutor` deploys **only** via `DEPLOY.md §4 Path B`:

```
supabase functions deploy ai-tutor --project-ref igvkyxkmjnkzscqgommj
```

Three hard constraints, each written in blood:

1. **`mcp__Supabase__deploy_edge_function` is prohibited for `ai-tutor`.** The
   inline path caused two production outages on 2026-06-17 by deploying a
   truncated stub. Every student request returned 500 for the duration.
2. **`ai-tutor` is a multi-file bundle** since v83 — `index.ts` plus `_shared/`.
   Any path that ships only `index.ts` fails at cold start. The Dashboard
   copy-paste path is therefore disallowed.
3. **There is no health-check gate in front of the function.** A bad deploy is
   live immediately. Post-deploy verification is manual, per `DEPLOY.md §6`.

**Two version axes, never one number.** `AI_TUTOR_VERSION` is a constant in the
source. The *platform version* is Supabase's deploy counter. They move
independently. The only unambiguous identity for what is running is **platform
version + bundle sha256**.

Read 2026-08-25: source `v101`, platform version `145`, bundle sha256
`efedd0f8…`, and the deployed source's own constant confirmed as `'v101'` by
`get_edge_function` — so the two axes happen to agree today. **These figures are
a dated observation, not a fact this document can keep true.** They read `v95` /
`133` here until 2026-08-25, six source versions and twelve deploys behind, for
the same reason every other copy of them goes stale: nothing updates a number in
a file when a deploy happens.

### 3.3 Migrations — manual and individually approved

A file in `supabase/migrations/` is **inert**. It becomes real only when someone
runs `apply_migration`, and `CLAUDE.md §3` requires that each one be approved on
its own. The repo convention is PREPARED → reviewed → approved → APPLIED, with a
release report and a closeout.

**The file count and the applied count differ**: 95 files in the repo, 152
migrations applied in the database (counted 2026-08-25; this read 68 / 131
until then). Early migrations were applied without a
committed file. `scripts/check-migration-parity.sh` exists for this. Never treat
the directory listing as the applied state — query
`supabase_migrations.schema_migrations`.

---

## 4. Which changes do not affect production

Merging any of these to `main` triggers a Vercel deployment that changes nothing
a student can reach:

| Path | Reaches students? |
|---|---|
| `supabase/functions/**` | ❌ not until a manual CLI deploy |
| `supabase/migrations/**` | ❌ not until a manual apply |
| `tests/**`, `scripts/**` | ❌ CI and tooling only |
| `docs/**` | ❌ not part of the product — **but see §5.1** |
| `CLAUDE.md`, `DEPLOY.md`, `SECURITY.md` | ❌ |
| root `*.html`, `assets/`, root `*.js`, `vercel.json` | ✅ **live on merge** |

**Phase V0 is the worked example.** It merged as `89fe0d9`, Vercel redeployed,
and *nothing about the running system changed*: `ai-tutor` stayed at platform
version 133 with an identical sha256, and `verification_decisions` still does not
exist. The code is in `main`; it is not in production.

---

## 5. Risks and recommended changes

### 5.1 The deployment ships the whole repository — recommend a `.vercelignore`

**Established by measurement:** no `.vercelignore` exists, `vercel.json` has no
ignore or output configuration, the custom domain is excluded from SSO
protection, and `robots.txt` is `Allow: /` for every crawler with disallows on
only 13 specific `.html` paths. `docs/` and `supabase/` are not among them.

So internal engineering records and migration DDL are served from the product
domain and are crawlable.

**Mitigating:** the GitHub repository is public (`githubRepoVisibility: "public"`),
so none of this content is secret today. This is not a leak.

**Why it still matters, and it is sharper than it looks.** `robots.txt` explicitly
invites GPTBot, ClaudeBot, PerplexityBot, Google-Extended and a dozen others with
`Allow: /`. The knowledge layer exists precisely so *"AI systems describe the
platform accurately rather than inferring it."* Serving internal roadmap
documents into that same crawl surface works directly against it: an AI crawler
can ingest a planning document and surface an unbuilt target or an internal
caveat as though it were product truth. The knowledge layer is carefully
governed; `docs/roadmap/` is not, and is not written for that audience.

And if the repository is ever made private, this becomes a live exposure
silently, with no code change to notice.

**Recommendation:** add a `.vercelignore` covering `docs/`, `supabase/`,
`tests/`, `scripts/`, `.github/` and `*.md` outside the served set. One file, no
behaviour change to the product.
*Not done here — this PR is documentation-only and that is a production change.*

### 5.2 Merging to `main` is an unapproved production deploy path

Every other production change in this project is gated. The static site is not:
any merge ships it. For a documentation merge that is harmless. For a merge that
happens to touch a root `*.html`, it is a live student-facing change with no
approval step and no staging gate.

**Recommendation:** decide deliberately whether root `*.html` changes should
require the same explicit approval that Edge Function deploys do. If yes, the
mechanism is either a Vercel deploy-approval setting or a CI gate on those paths.

### 5.3 The repository is routinely ahead of production

`main` and the deployed `ai-tutor` are in sync as of 2026-08-25 (v101 / platform
version 145, all four bundle files sha256-identical to `main`), as they were on
2026-08-02 (v96 / platform version 135). **That is the unusual state, not the
normal one** — merging publishes the site automatically while nothing publishes
the function. Nothing in the repository or on any dashboard makes the difference
visible: you have to compare the source against the live platform version and
sha256 by hand.

The 2026-08-25 check is the sharper argument for the recommendation below.
`CLAUDE.md` had recorded, in writing, that v101 was merged-but-undeployed. It had
in fact been deployed on 2026-08-15, an hour after the merge, and the note stood
for ten days. **A session that trusted it and redeployed from a branch predating
v101 would have reverted a live fix.** The same file had been wrong in the
opposite direction three weeks earlier. Reading the repository cannot answer
"is it live?" in either direction.

**Recommendation:** a small CI or dashboard check that compares the deployed
bundle identity against `main` and reports the drift. Until it exists, treat
"is it live?" as a question to answer by querying, never by reading the repo.

### 5.4 No health-check gate on the Edge Function

A bad `ai-tutor` deploy is immediately live for every student, and this has
happened twice. `DEPLOY.md §6` prescribes a manual smoke test, which depends on
the person remembering.

**Recommendation:** treat the smoke test as a required, recorded step in the
release report — as Phase V0's `V1-T19` already does — rather than as a habit.

### 5.5 `ai-tutor` is at its structural limit

274 KB, 4,943 lines, single file, restricted deploy path, two prior outages, and
a size guard that has been raised five times. This is not a deployment risk in
itself; it is what makes every deployment riskier than it needs to be.

**Recommendation:** `V1-T16` — extract the L3 pipeline into
`_shared/verification.core.js`, following the `taxonomy.core.js` single-source
pattern already in production. After it, the size bound should go *down*.

---

### 5.6 A change split across both surfaces has an ORDER, and the order is not symmetric

The two surfaces deploy independently — a merge publishes the site, a CLI step
publishes the function — so any change that spans both has a window where one
half is live and the other is not. §5.3 records that the repo runs ahead of
production; this is the case where *which* half runs ahead decides whether the
window is an annoyance or an outage.

The rule: **ship the half that fails safe first.** Work out what each ordering
does during the window and pick the one whose failure mode you would accept for
an hour.

The worked example is the v96 quota gate, and it is worth keeping because the
asymmetry is stark:

| Order | During the window | Verdict |
|---|---|---|
| Edge Function first | Both halves charge → students billed twice per turn (free students under the cap: two daily slots, zero credits) | Accept — visible, bounded, refundable |
| `chat.html` first | Neither half charges → **nobody is metered at all** | Never — this is the bug being fixed, restored on purpose |

So: deploy `ai-tutor` v96, verify the platform version and sha256, *then* merge
the site. Not the other way round, and not in the same breath — verify between.

The generalisable form: when a responsibility MOVES from one surface to the
other, the receiving surface must be live before the sending surface stops. A
gate is the clearest case, but the same holds for a write path, a schema
contract, or a header the other side has begun to require.

**Migrations take a side in this too.** A migration is backward-compatible or it
is not, and that decides whether it goes first or last:

- **Additive and defaulted → apply FIRST.** `20260802_consume_credits_idempotency.sql`
  adds a parameter with a `DEFAULT`, so every existing caller keeps resolving and
  keeps its current behaviour. Applying it ahead of the deploy means the new code
  lands already protected instead of running unprotected until someone gets to
  step 5.
- **Removes a capability → apply LAST.** `20260802_refund_ai_credit_server_only.sql`
  revokes `EXECUTE` from `authenticated`. Applied before the site ships, it breaks
  the refund path the *currently live* page still uses.

The test is not "is it a migration", it is **"does anything live today stop
working the moment this lands"**. If yes, it goes after the thing that replaces
it. If no, put it first and reduce the window.

---

## 6. Manual approval points, in order

1. **Merge to `main`** → deploys the static site. *No approval gate today* (§5.2).
2. **Apply a migration** → explicit per-migration approval, `CLAUDE.md §3`.
3. **Deploy an Edge Function** → explicit approval + `DEPLOY.md §4 Path B` +
   post-deploy bundle verification + smoke test.
4. **Change env/config** (`JUDGE_ANSWER_BLIND`, `VERIFICATION_EXPLORATION_FRACTION`,
   `VERIFICATION_DECISION_LOG_ENABLED`, `ALLOWED_ORIGINS`, kill switches) → takes
   effect without a redeploy, so it is a production change with the lowest
   friction and the least visibility. Treat a flag flip as a deploy.

---

## 7. Checklist before claiming something is live

- [ ] Merged to `main`? → the static site is live. Nothing else is.
- [ ] Edge Function: compare live **platform version + sha256** against expectation.
- [ ] Migration: query `supabase_migrations.schema_migrations`, not the file list.
- [ ] Env flags: confirm the values actually set on the function.
- [ ] "No deployment occurred" is almost always **false** after a merge — the
      Vercel deploy fires. Say which surface you mean.
