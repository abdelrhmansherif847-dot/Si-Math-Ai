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
public pages, a knowledge graph, and a 3,107-check CI gate. Adding more would
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
| Edge Functions | `ai-tutor` (platform version **136**, ACTIVE) · `admin-actions` (platform version **15**, ACTIVE) |
| `ai-tutor` source version in `main` | `AI_TUTOR_VERSION = 'v98'` — **DEPLOYED.** Production runs v98 at platform version 136 (deployed 2026-08-03T19:38:52Z), and the deployed bundle is byte-for-byte identical to `main` across all four files. v97 (L3 Shadow routing gate) and v98 (conversational-turn demotion) shipped together as ONE deploy, so only `v98` appears on the wire |
| `daily_limit` semantics | **A maximum per day, never a free allowance.** PAID plans: two INDEPENDENT checks — the operation's `credit_costs` price is charged from message #1, AND the request is refused at `daily_limit` whatever the balance (`20260802192644`). ZERO-PRICE tier only (`amount_egp = 0 AND credits_granted = 0`): `daily_limit` IS the free allowance, and purchased credits carry the student past it |
| FREE plan daily limit | **15/day** (`plan_definitions.FREE.daily_limit`). Enforced by `consume_credits`, charged by the `ai-tutor` entitlement gate from v96 onward — **before v96 nothing server-side enforced it**; see `docs/engineering/free-quota-enforcement-investigation.md` |
| Quota gate | **LIVE.** `ai-tutor` v96 charges `consume_credits` before any provider call and fails closed. Both supporting migrations are applied. Full trace and verification: `docs/engineering/free-quota-enforcement-investigation.md` |
| `consume_credits` | 8 args since `20260802173710` — `p_client_request_id` (DEFAULT NULL) makes one logical send charge once. Seven-argument callers still resolve |
| `subscriptions.plan_type` | A legacy CATEGORY column, not a plan code, and read by nothing — `plan_code` on the same row is authoritative. `subscriptions_plan_type_check` permits six values only, so every writer maps through `legacy_plan_type()` (`20260802184704`). Never write a raw `plan_code` into it |
| `refund_ai_credit` | **service_role only** since `20260802174206`. It DELETEs the `ai_usage_logs` row `consume_credits` counts, so a client-callable refund is a client-callable quota reset |
| `ai-tutor` deployed bundle | `ezbr_sha256` `2ebb41bc5924abcc83b49b9721c10bb15432ac685d3384343d98f7bf0629498a`, deployed 2026-08-03T19:38:52Z. Four files: `index.ts` + `_shared/{telemetry.core.ts, verification.core.ts, taxonomy.core.js}` — verified present and byte-identical to `main`. **Re-read this row from `list_edge_functions` rather than trusting it.** It has now been found stale in BOTH directions: on 2026-08-02 it understated the version (133 while 134 ran), and on 2026-08-03 it overstated the gap (it said v97/v98 were unshipped for the ~30 minutes between the deploy and this correction) |
| L3 Shadow pipeline | `l3-shadow-v3` |
| Difficulty detector | `detector-v1` (heuristic) + LLM shadow classifier v2 |
| Taxonomy | version 1 — **5 topics, 33 subtopics** |
| Plan catalogue | **Plan Catalog V2** — `plan_definitions` is the sole catalogue; `pricing_settings` and `credit_packs` are views over it. Plans are authored from the Owner Dashboard |
| Migrations | **75 files** in `supabase/migrations/`, **139 applied** in the database |
| Static site | 46 root `*.html` pages on Vercel |
| CI | `node tests/run-all.mjs` — 21 test suites + 7 validators = **28 checks** |

**Source version and platform version are different axes and must never be
written as one figure.** `AI_TUTOR_VERSION` is a constant in the source;
platform version is Supabase's deploy counter. An earlier version of this file
recorded "v69 / platform version 78" as if the two moved together; they do not.
The only unambiguous identity for what is *running* is the platform version plus
the bundle sha256.

**`main` and the deployed function are in sync right now** (verified
2026-08-03T20:10Z by comparing all four bundle files byte for byte): `main`
carries v98, production runs v98 at platform version 136. **This is the
exception, not the rule** — the repo is *routinely* ahead of production, because
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
