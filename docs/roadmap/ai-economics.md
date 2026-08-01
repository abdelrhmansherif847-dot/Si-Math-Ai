# AI Economics — Owner Dashboard Module

**Phase 1 deliverable: architecture only. No production logic is modified by this
document.**

| | |
|---|---|
| **Status** | Phase 1 — architecture **approved** and **FROZEN** at r4, 2026-07-28 (see §18) |
| **Scope** | New **section inside the Owner Dashboard** (`admin.html`), not a standalone page |
| **Posture** | Read-only. Consumes analytics. Never writes pricing, credits, or billing |
| **Date** | 2026-07-28 |
| **Production snapshot** | Project `igvkyxkmjnkzscqgommj`, read-only queries run 2026-07-28 |
| **Related** | `docs/roadmap/credits-operation-based.md`, `docs/roadmap/adaptive-verification.md`, `docs/audit/dashboard-metrics.md` |

**Revision history**

| Rev | Change |
|---|---|
| r1 | Approved architecture: telemetry → Economics, with cost stamped at telemetry write time |
| **r2** | Introduced the **Cost Engine** as the single source of truth for cost calculation. Telemetry became usage-only (no money); Economics became formula-free |
| **r3** | Introduced the **AI Service Catalog** as the canonical abstraction above providers. The Cost Engine now reasons about *capabilities* (Solver, Judge, OCR, Truth Engine…) and rolls cost up **Model → Provider → Service**. AI Economics is now provider- and model-independent: no provider or model name appears anywhere in the Economics layer or the dashboard |
| **r4** | Added the **Cost Allocation Engine** inside the Cost Engine (§8.8) — calls → canonical Question Cost, with deterministic shared-cost and parent/child attribution and a conservation law. Added **§17 Design Invariants** (the rules that may never be violated) and **§18 Architecture Freeze**. **The architecture is frozen as of this revision** |

Because Phase 2 has not been implemented, both refinements cost nothing to adopt.

---

## 0. Executive summary

AI Economics is the financial intelligence layer of Zero AI: cost, revenue,
profit, credits, and ROI for every AI capability. AI Monitor answers *"is the AI
healthy?"*; AI Economics answers *"is the AI profitable?"*.

The system is six layers, each with one job and a hard boundary:

```
                    ┌──────────────────────────────────────────────┐
                    │        AI SERVICE CATALOG (canonical)        │
                    │  solver · judge · ocr · truth_engine · …     │
                    │  binds a capability to a provider + model,   │
                    │  with effective dates                        │
                    └───────────────────┬──────────────────────────┘
                                        │ vocabulary + bindings
      ┌─────────────────────────────────┼─────────────────────────────────┐
      ▼                                 ▼                                 ▼
AI Services  ────────►  AI Telemetry  ────────►  Cost Engine  ────────►  AI Economics  ────────►  Owner Dashboard
 do the work            record usage             price it                 interpret it            render it
 tag each call          in units;                model → provider         revenue, profit,        service-keyed
 with a canonical       no money, ever           → SERVICE rollup         margin, break-even      views only
 service_code                                    immutable cost facts     no pricing formulas
```

The blocking finding of this phase is unchanged by either refinement:

> **The platform currently has no AI cost telemetry at all.**
> `ai_usage_logs` is a *credit ledger*, not a *cost ledger*. Across 1,134
> production rows, `estimated_cost_usd` is `0.00` in **100%** of rows,
> `prompt_tokens`/`completion_tokens` are `0` in **100%** of rows, and
> `model_name` is the string `claude-3-5-haiku` in **1,133 of 1,134** rows —
> a client-side hardcode in `chat.html:2399`, while the Edge Function actually
> calls OpenAI `gpt-4o` and `gpt-4o-mini` exclusively.

Every cost-side KPI is therefore **Blocked** today — not "approximate", but
unavailable from production data. The revenue side is largely **Actual** and can
be built immediately.

A second finding motivates r3. The platform already runs **seven distinct AI
capabilities** — tutor, solver, judge, OCR, vision, difficulty detector,
reference resolver — all behind a single provider. Reported by provider, that is
one number: *"OpenAI costs $X"*. Reported by service, it becomes actionable:
*"Solver costs $A, Judge costs $B, OCR costs $C"* — and only then can the Owner
answer **which capability to optimize**. (The original request's "Cost by AI
Model" list already mixed models with capabilities — `GPT-4o`, `GPT-4o mini`,
`OCR`, `Truth Engine`. The catalog is what separates those two axes cleanly.)

Document map:

| § | Contents |
|---|---|
| §1–§2 | What the module is; how it plugs into the Owner Dashboard |
| §3 | The read-only guarantee and where writes are permitted |
| §4 | Inventory of production data that exists today |
| §5 | Missing-telemetry register, with evidence |
| §6 | **AI Service Catalog** — canonical services, providers, bindings |
| §7 | **AI Telemetry layer** — usage capture (cost-free, service-tagged) |
| §8 | **Cost Engine layer** — pricing, the Model→Provider→Service hierarchy, the **Cost Allocation Engine**, facts, RPCs, extensibility |
| §9 | **AI Economics layer** — revenue, analytics views, RPC surface |
| §10 | KPI dictionary for all 12 requested sections (Actual/Derived/Modeled/Blocked) |
| §11–§12 | Pricing simulator; break-even analysis |
| §13 | Extensibility contract for future AI systems and providers |
| §14 | Phased roadmap and deployment order |
| §15–§16 | Open questions; what this document does not change |
| **§17** | **Design Invariants** — the rules that may never be violated |
| **§18** | **Architecture Freeze** — what is frozen, what is not, how to amend |

---

## 1. Position in the product

```
admin.html  (role=owner → "Owner Dashboard")
├─ Payment Requests      (admin+)
├─ Legacy Queue          (super_admin+)
├─ Users                 (admin+)
├─ Founders              (super_admin+)
├─ System Settings       (owner)
├─ Credits               (owner)   ← operational billing control (READ/WRITE)
└─ AI Economics          (owner)   ← NEW. financial intelligence (READ-ONLY)

ai-monitor.html          (super_admin+)  ← engineering & accuracy health, unchanged
```

**Boundary with the Credits tab.** Credits *manages* pricing:
`admin_set_credit_cost()` writes `credit_costs`. AI Economics never calls it and
never links to it as an action. Where a simulation implies a pricing change, the
module states the implication in text; the Owner applies it in the Credits tab.
This keeps a single write path for pricing.

**Boundary with AI Monitor.** AI Monitor owns accuracy, verification quality,
OCR health, failure triage. AI Economics reuses the same underlying facts but
reports them in currency. Latency and success/failure appear in both — in AI
Monitor as a reliability signal, in AI Economics as a cost-of-failure signal
(money spent on calls that produced nothing).

**Boundaries between the layers.** Each layer may read the layer directly above
it and nothing further up the stack:

| Layer | Owns | Must never |
|---|---|---|
| AI Service Catalog | Canonical service vocabulary; provider and model bindings over time | Know a price, a cost, or a revenue figure |
| AI Services | Doing the work; emitting usage tagged with a canonical `service_code` | Compute or store a cost |
| AI Telemetry | Immutable usage records in units | Know a price, a currency, or an FX rate |
| Cost Engine | Rate cards, FX, discounts, all cost math, immutable cost facts, the Model→Provider→Service rollup | Know revenue, credits, packages-as-revenue, or profit |
| AI Economics | Revenue, credits, profit, margin, packages, break-even — **keyed on canonical services** | Implement a pricing formula, read a rate card, or **name a provider or model** |
| Owner Dashboard | Rendering, filters, labelling | Compute anything material, or hardcode a service, provider, or model name |

---

## 2. Integration point (mechanics, for the dashboard phase)

`admin.html` gates tabs declaratively, so the module needs no new auth plumbing:

```html
<button class="tab" data-role-min="owner" onclick="switchTab('economics')">AI Economics</button>
...
<div id="tab-economics" style="display:none"> … </div>
```

```js
const TABS = ['payments','pending','users','founders','settings','credits','economics'];
if (name === 'economics') loadAiEconomics();
```

Two constraints inherited from the existing code:

- `switchTab()` matches `.tab` buttons to `TABS` **by index**
  (`admin.html:814`), so the new button must be appended in the same position in
  both the DOM and the `TABS` array.
- `applyRoleVisibility()` hides `[data-role-min]` elements below the caller's
  role level (`ROLE_LEVEL = { user:0, admin:1, super_admin:2, owner:3 }`). Client
  gating is cosmetic only — the server-side guard in §3 is the real control.

---

## 3. Read-only guarantee — how it is enforced, not just promised

### 3.1 Where writes are permitted at all

The stack contains exactly **two** writers, both outside AI Economics:

| Writer | Writes to | Volatility | Invoked by |
|---|---|---|---|
| AI Services telemetry hook | `ai_model_calls` (append-only) | n/a (Edge Function, `service_role`) | The Edge Function, fire-and-forget |
| `cost_engine.run_pricing()` | `cost_engine.cost_facts` (append-only) | `VOLATILE` | Scheduled job / `service_role` only |

Catalog and rate-card maintenance is a third, human-driven write path that lives
outside all of this (migration or a dedicated ops surface — §15 Q7). Neither
runtime writer can touch pricing, credits, or billing: they hold no grants on
`credit_costs`, `profiles`, `payment_requests`, or `plan_definitions`, and they
call none of the billing RPCs.

**AI Economics itself writes nothing at all.** Every economics and cost-read RPC
is `STABLE`.

### 3.2 The five enforcement layers

| # | Layer | Mechanism |
|---|---|---|
| 1 | **Function volatility** | Every economics and cost-read RPC is declared `STABLE`. PostgreSQL refuses `INSERT`/`UPDATE`/`DELETE` inside a non-volatile function and errors at runtime. A write cannot be added later without also flipping the volatility marker to `VOLATILE` — a visible, reviewable one-word diff. |
| 2 | **Authorization** | Each RPC begins with `IF NOT has_role_at_least('owner') THEN RETURN jsonb_build_object('ok', false, 'reason','forbidden')`. Reuses the existing role helper; financial data never reaches an `admin` or `super_admin`. |
| 3 | **Surface isolation** | Analytics views live in the `econ` schema, pricing in `cost_engine`, vocabulary in `ai_catalog`; **none is exposed to PostgREST**. The browser can only call owner-gated RPCs in `public`. |
| 4 | **Client isolation** | The module's JS may reference only `owner_econ_*` and `owner_cost_*` RPCs. It never imports `credit-config.js`, never calls `consume_credits`, `admin_set_credit_cost`, `admin_adjust_credits`, `approve_payment_request`, `reject_payment_request`, or `refund_ai_credit`. |
| 5 | **CI guard** | `scripts/verify-economics-readonly.sh` greps the `#tab-economics` block and the `econ`/`cost_engine` migrations for write verbs and forbidden RPC names, asserts every `owner_*` read RPC is `STABLE` + owner-gated, asserts **no object in `econ` references `cost_engine.rate_cards`, `rate_components`, `discount_rules`, or `fx_rates`** (§8.10 rule 8), and asserts **no provider or model literal appears in `econ` or in the dashboard tab** (§8.10 rule 10). |

### 3.3 Enforcing the Economics → Cost Engine boundary

Layer 5 above is a CI backstop. The boundary is additionally enforceable in the
database itself, and this is the recommended setup:

- The Cost Engine grants `SELECT` on its **output** views only
  (`cost_engine.v_cost_facts_current` and the `v_cost_by_*` rollups) to a
  dedicated `econ_reader` role.
- Rate cards, rate components, discount rules, and FX tables grant nothing to
  `econ_reader`.
- The `owner_econ_*` functions are `SECURITY DEFINER` **owned by `econ_reader`**,
  not by a superuser role.

An Economics function that tries to read a rate card then fails with
`permission denied` — the boundary becomes a privilege, not a convention. If the
owner role setup is deferred, the CI guard alone still catches it in review; the
document flags which mode is in force.

### 3.4 Honest-numbers rule

Every figure the module renders carries a confidence class (§10). A **Blocked**
KPI renders as `—` with a one-line reason. The module never substitutes an
assumption for a missing measurement, and never renders a **Modeled** number in
the same visual style as an **Actual** one.

This rule is enforced end-to-end rather than at the UI: when the Cost Engine
cannot price a call it writes `pricing_status = 'unpriced'` and a **NULL** cost —
never `0` (§8.6). A zero in this system always means "measured as free", never
"unknown".

---

## 4. Existing data sources (production inventory)

Verified by read-only introspection of `igvkyxkmjnkzscqgommj` on 2026-07-28.
Row counts are live values, not estimates.

### 4.1 Revenue & packages

| Table | Rows | What it gives AI Economics | Caveats |
|---|---|---|---|
| `payment_requests` | 8 (8 approved, 8,542 EGP) | **The revenue fact table.** `user_id, plan_code, amount_egp, status, created_at, reviewed_at` | Manual-payment flow. Approval, not payment, is the event that exists |
| `payments` | 5 (1,466 EGP, status `COMPLETED`) | Legacy/parallel ledger | **Disagrees with `payment_requests`.** Not used by `admin.html`'s revenue panel. Needs an authoritative-source ruling (§15 Q1) |
| `plan_definitions` | 7 | Package catalogue: `credits_granted, period_days, amount_egp, kind ∈ {subscription,pack}` | The join key for revenue → credits sold |
| `pricing_settings` | 6 | Display pricing + `daily_limit` (FREE = 15/day) | Second copy of price; must stay in lockstep with `plan_definitions` |
| `credit_packs` | 3 | Pack display catalogue (199/349/649 EGP) | Third copy of pack price |
| `subscriptions` | 7 | `current_period_end`, active flag | Needed for active-subscriber counts and deferred revenue |
| `profiles` | 19 | `plan_code, credits_balance, subscription_credits, pack_credits, is_admin, is_founder, subscription_expires_at` | Balance = outstanding credit liability |

Current catalogue: PRO_MONTHLY 349 · PRO_QUARTERLY 899 · PRO_ANNUAL 2999 ·
FOUNDER_ANNUAL 1499 · packs 199/349/649 EGP.

### 4.2 Credits & consumption

| Table | Rows | What it gives | Caveats |
|---|---|---|---|
| `credit_costs` | 16 | Per-operation credit price, `active`, `always_charge` | Already the extensibility model to copy (§13) |
| `ai_usage_logs` | 1,134 | One row per *charged* operation: `feature, credits_used, session_id, created_at` | Cost/token/model columns are unpopulated — see §5 |
| `credit_transactions` | 392 | `CONSUME −1,908` · `GRANT +77,500` · `ADMIN_ADJUST +17,000` · `REFUND +15` | **Grants and admin adjustments are not sales.** "Credits sold" must exclude them |

### 4.3 AI operations & taxonomy

| Table | Rows | What it gives | Caveats |
|---|---|---|---|
| `question_records` | 1,169 | The unit of work: `user_id, session_id, created_at, image/images, topic, topic_id, subtopic_id, difficulty, verification_*`, `oai_http_status/oai_error_code` | `topic_id` present on only **295/1,169 (25%)** — canonical-lesson economics is coverage-limited until backfill |
| `question_records.verification_meta` | 593 non-null | `solver_model`, `judge_model`, `pipeline_latency_ms`, `ocr_rerun_count`, `solver_max_tokens`, quality score | **Service→model attribution already exists here in embryonic form** — but no token counts, so it prices nothing |
| `chat_sessions` / `session_questions` | 278 / 477 | Session shape | — |
| `exam_practice_sessions`, `focus_plans`, `focus_tasks`, `study_plans`, `weakness_reports` | 19 / 17 / 316 / 1 / 197 | Volume of non-chat AI products | None of these emit usage or cost rows (§5.3) |
| `analyzer_runs` | 688 | Per-regeneration duration/outcome telemetry | Good precedent: aggregate-only, PII-free, fire-and-forget |
| `response_feedback` | 123 | Student-reported correctness | Feeds cost-of-rework analysis later |

### 4.4 What does **not** exist

- No views or materialized views in `public` — **zero**. The analytics layer is greenfield.
- No service catalog, no provider registry, no binding history.
- No table records an upstream call, its tokens, its latency, or its price.
- No rate card, no USD→EGP rate table (revenue is EGP, provider cost is USD).
- No infrastructure/fixed-cost table (Supabase, Vercel, domain) — so *net* profit has no inputs.

---

## 5. Missing telemetry register

Ordered by what they block.

### 5.1 GAP-1 — No cost or token telemetry *(blocks every cost KPI)*

`ai_usage_logs` has the columns `prompt_tokens`, `completion_tokens`,
`total_tokens`, `estimated_cost_usd`, `model_name`. All are populated by the
**client**, which does not know them:

```js
// chat.html:2396 — the only caller in the codebase
CreditConfig.charge(sb, { userId, op: _creditOp, model: 'claude-3-5-haiku', sessionId });
//                                               ^^^^^^^^^^^^^^^^^^^^^^^^ hardcoded, wrong
// tokens/cost omitted → consume_credits stores 0
```

Production consequence:

| Column | Production state (1,134 rows) |
|---|---|
| `estimated_cost_usd` | `0.00` in 1,134 rows (**0 rows with cost**) |
| `prompt_tokens` + `completion_tokens` | `0` in 1,134 rows |
| `model_name` | `claude-3-5-haiku` ×1,133, `study-planner` ×1 |

The actual models are OpenAI-only. The comment at `chat.html:2394` ("the edge
function logs actual token usage") describes intent that was never implemented —
`supabase/functions/ai-tutor/index.ts` never reads the OpenAI `usage` object and
never writes tokens or cost anywhere.

This gap is also why the client must never be a telemetry source: the browser
cannot know what the server spent, nor which capability served the request.

### 5.2 GAP-2 — The unit of billing ≠ the unit of cost *(blocks cost-per-question)*

One student question fans out to as many as **six upstream calls**, across
**seven distinct capabilities**. Every call site in `ai-tutor/index.ts`, mapped
to its canonical service (§6):

| Line | Canonical service | Stage | Provider / model today | `max_tokens` | Fires when |
|---|---|---|---|---|---|
| 3157 | `tutor` | `tutor_main` | openai / `gpt-4o` if image else `gpt-4o-mini` | 2800 | Every question |
| 929 | `difficulty_detector` | `classify` | openai / `gpt-4o-mini` | 10 | Background, when v2 enabled |
| 1274 | `ocr` | `extract` | openai / `gpt-4o` | 300 | Image questions |
| 1319 | `ocr` | `rerun` | openai / `gpt-4o` | 300 | OCR confidence < 0.85 |
| 1368 | `vision` | `question_detect` | openai / `gpt-4o` | 1800 | Multi-image uploads |
| 1528 (×2) | `solver` | `solver_a` / `solver_b` | openai / `gpt-4o-mini` @ temp 0.1 / 0.3 | 1200 each | L3 shadow pipeline |
| 1617 | `judge` | `verdict` | openai / `gpt-4o` | 500 | L3 shadow pipeline |
| 2497 | `reference_resolver` | `resolve` | openai / `gpt-4o` if parent had image else `gpt-4o-mini` | 2200 | Follow-ups referencing an earlier question |

In the last 30 days: **404** questions, **268 (66%)** with images, **334 (83%)**
through the L3 shadow pipeline. So the median question is *not* one call — it is
roughly four to six, spread across several capabilities and weighted toward the
expensive vision model. A single `ai_usage_logs` row per question can express
neither the fan-out nor the capability mix.

### 5.3 GAP-3 — Five priced operations emit nothing *(blocks 5 of 8 operation-cost rows)*

`credit_costs` prices ten operations. Only four ever produce a row:

| Operation | Priced | Rows in `ai_usage_logs` |
|---|---|---|
| `CHAT_TEXT` / `CHAT_IMAGE` / `CHAT_FOLLOWUP` | 5 / 8 / 2 | 18 / 3 / 0 (+1,112 legacy `AI_CHAT_MESSAGE`) |
| `STUDY_PLAN` | 20 | 1 |
| `CHAT_DEEP_EXPLAIN` | 10 | **0** — no trigger implemented |
| `MOCK_EXAM` / `MOCK_TIMER` / `MOCK_PRACTICE` | 40 / 10 / 10 | **0** |
| `FOCUS_SESSION` | 15 | **0** |
| `WEAKNESS_ANALYSIS` | 20 | **0** |

`chat.html` is the only page in the repository that calls `CreditConfig.charge`.
`mock-exam.html`, `focus.html`, and `weakness.html` never charge — and all three
are **frozen files** (CLAUDE.md §2), so wiring them is a separately-approved
change (already scoped in `docs/roadmap/credits-operation-based.md` §4.2). Until
then, Mock Exams / Focus Sessions / Weakness Analyses are invisible to both
revenue-side credit accounting and cost-side attribution.

### 5.4 GAP-4 — 86% of usage rows are internal traffic *(distorts every average)*

| Slice | Rows |
|---|---|
| Total `ai_usage_logs` | 1,134 |
| From accounts with `is_admin = true` | **975 (86%)** |
| Charged 0 credits (admin bypass or FREE daily allowance) | 764 (67%) |

Admins short-circuit `consume_credits` and are logged at `credits_used = 0`.
Any "average cost per student" computed over raw rows today is dominated by
owner/testing traffic. **Excluding internal accounts must be the default**, with
an explicit "include internal traffic" toggle.

### 5.5 GAP-5 — Refunds destroy history

`refund_ai_credit()` **deletes** the `ai_usage_logs` row
(`20260722_refund_ai_credit_race_fix.sql:45`). Deleting the usage fact to undo a
credit charge is correct for the *ledger*, but it erases the fact that money was
spent on the provider — the refund does not un-spend it. Both the telemetry
layer and the cost-fact layer are therefore **append-only and immutable**, with
refunds recorded as separate offsetting events.

### 5.6 GAP-6 — No currency bridge, no fixed costs

Revenue is EGP; provider cost is USD. There is no rate table, so "profit margin"
has no defined arithmetic today. There is also no record of Supabase / Vercel /
domain spend, so *gross* profit is computable once the Cost Engine lands but
*net* profit is not.

### 5.7 GAP-7 — Failure cost is unmeasured

`question_records.oai_http_status` is non-null on 41 rows (upstream errors — see
`docs/incidents/2026-06-23-openai-quota-exhaustion.md`). Failed calls can still
consume input tokens and always consume latency. Without per-call telemetry the
platform cannot report money spent on calls that returned nothing.

### 5.8 GAP-8 — No capability-level attribution *(blocks "which service is expensive?")*

Nothing in production identifies *which capability* did a piece of work.
`verification_meta` carries `solver_model` and `judge_model` for 593 rows, which
is the only trace of capability anywhere — and it is per-question metadata, not
a queryable dimension. Without a canonical service dimension, every cost question
can only be answered by vendor ("what does OpenAI cost?"), never by capability
("what does OCR cost, and would a cheaper provider do?"). §6 closes this.

### 5.9 Register summary

| ID | Gap | Severity | Unblocks |
|---|---|---|---|
| GAP-1 | No token/cost/model telemetry | **Blocker** | Sections 1, 2, 6, 7, 8, 9, 10, 11 |
| GAP-2 | Billing unit ≠ cost unit | **Blocker** | Cost per question, per lesson, per service |
| GAP-8 | No capability-level attribution | **Blocker** | Cost per service; optimization decisions; provider independence |
| GAP-3 | 5 operations never metered | High | Section 6 completeness, package economics |
| GAP-4 | Internal traffic dominates | High | All per-student and per-question averages |
| GAP-5 | Refund deletes usage row | Medium | Historical integrity |
| GAP-6 | No FX rate, no fixed costs | Medium | Margin, net profit, break-even |
| GAP-7 | Failure cost unmeasured | Medium | Cost-of-failure, waste analysis |

---

## 6. AI Service Catalog — the canonical abstraction above providers

**The catalog is the canonical vocabulary of the platform's AI capabilities, and
the registry of which provider and model implements each one over time.** It is
the abstraction that makes AI Economics provider-independent.

### 6.1 Why it exists

Without it, every cost question collapses to the vendor axis:

| Question | Provider-keyed answer | Service-keyed answer |
|---|---|---|
| How much does OCR cost? | *unanswerable* | $X/month, $Y per image question |
| How much does Truth Engine cost? | *unanswerable* | $X/month, trending +12% |
| Which capability is expensive? | *unanswerable* | Judge — 41% of AI spend on 8% of calls |
| Which service should be optimized? | *unanswerable* | Judge → try a cheaper model |
| What does GPT-4o cost? | $X | still available, as a drill-down |

Today the platform runs seven capabilities behind one provider (§5.2), so a
provider-keyed view returns exactly one number and hides everything actionable.

The catalog also makes provider migration a **measurement**, not a blind spot:
because the service identity is stable across a binding change, the Owner can see
"Solver cost per question fell 38% after the 2026-09 binding change" on a single
continuous series.

### 6.2 Core concepts

| Concept | Definition | Stability |
|---|---|---|
| **Service** | A canonical AI capability: `solver`, `judge`, `ocr`, `truth_engine`, `difficulty_detector`, `python`, `sympy`, `embedding`, `translation`, `vision`, `tutor`, `reference_resolver`, … | **Permanent.** The dashboard's vocabulary |
| **Provider** | A vendor or runtime: `openai`, `anthropic`, `google`, `azure`, `self_hosted` | Changes over years |
| **Model** | The vendor's SKU: `gpt-4o`, `gpt-4o-mini`, `claude-sonnet-4`, `vision-ocr-v2`, `n/a` | Changes over months |
| **Binding** | *service × provider × model*, valid over a time window, with a role (`primary`, `fallback`, `shadow`, `experiment`) | The thing that changes |
| **Stage** | A sub-role inside one service (`solver_a` vs `solver_b`) | Belongs to the service, not the provider |

The rule that keeps this clean: **a service is a capability, never a vendor.**
`ocr` is a service; `gpt-4o` is a model that currently implements it. If a
capability could be served by a different vendor tomorrow without the product
changing meaning, it is a service.

**Service ≠ credit operation.** `credit_costs.feature_name` (e.g. `CHAT_IMAGE`)
is what the *student is charged for*; `service_code` is what *did the work*. One
operation consumes many services — an image question consumes `ocr`, `tutor`,
`solver`×2, and `judge`. Both dimensions are first-class and independently
reportable.

### 6.3 Schema

All objects live in the `ai_catalog` schema, not exposed to PostgREST.

```sql
CREATE TABLE ai_catalog.services (
  service_code    text PRIMARY KEY,          -- 'solver' | 'judge' | 'ocr' | …
  display_name    text NOT NULL,             -- 'Solver' | 'Judge' | 'OCR'
  category        text NOT NULL,             -- 'reasoning'|'verification'|'perception'
                                             -- |'computation'|'language'|'retrieval'
  description     text NULL,
  unit_of_work    text NOT NULL,             -- 'call'|'question'|'image'|'page'|'document'
  cost_target_usd numeric(12,6) NULL,        -- owner-set optimization target per unit
  active          boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 100
);

CREATE TABLE ai_catalog.providers (
  provider_code   text PRIMARY KEY,          -- 'openai' | 'anthropic' | 'google' | …
  display_name    text NOT NULL,
  kind            text NOT NULL,             -- 'external_api' | 'self_hosted' | 'local_lib'
  default_currency text NOT NULL DEFAULT 'USD',
  active          boolean NOT NULL DEFAULT true
);

CREATE TABLE ai_catalog.service_bindings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code    text NOT NULL REFERENCES ai_catalog.services(service_code),
  provider_code   text NOT NULL REFERENCES ai_catalog.providers(provider_code),
  model           text NOT NULL,             -- 'n/a' for model-less providers
  api_surface     text NOT NULL DEFAULT 'default',
  binding_role    text NOT NULL DEFAULT 'primary',  -- 'primary'|'fallback'|'shadow'|'experiment'
  stage_filter    text NULL,                 -- bind only a specific stage, e.g. 'solver_b'
  effective_from  timestamptz NOT NULL,
  effective_to    timestamptz NULL,          -- NULL = current
  note            text NULL,
  UNIQUE (service_code, provider_code, model, api_surface, stage_filter, effective_from)
);

CREATE INDEX ON ai_catalog.service_bindings (service_code, effective_from DESC);
```

**Seed — today's platform, exactly as it runs** (§5.2):

| service_code | display_name | category | binding today |
|---|---|---|---|
| `tutor` | Tutor | reasoning | openai / `gpt-4o-mini`, `gpt-4o` (vision path) |
| `solver` | Solver | reasoning | openai / `gpt-4o-mini` (stages `solver_a`, `solver_b`) |
| `judge` | Judge | verification | openai / `gpt-4o` |
| `ocr` | OCR | perception | openai / `gpt-4o` (stages `extract`, `rerun`) |
| `vision` | Vision | perception | openai / `gpt-4o` (stage `question_detect`) |
| `difficulty_detector` | Difficulty Detector | reasoning | openai / `gpt-4o-mini` |
| `reference_resolver` | Reference Resolver | retrieval | openai / `gpt-4o-mini`, `gpt-4o` |

**Registered ahead of implementation** — these have catalog rows and no binding
yet, so the dashboard lists them at zero cost from day one and they light up
automatically when they ship: `truth_engine` (verification), `sympy`
(computation), `python` (computation), `embedding` (retrieval), `translation`
(language).

### 6.4 Binding resolution and validation

At pricing time the Cost Engine resolves each telemetry row's
`(service_code, provider, model, api_surface, stage, created_at)` against
`service_bindings`, choosing the row whose window contains the call, preferring a
`stage_filter` match over a general one. The resolved `binding_id` and a
`binding_status` are snapshotted onto the cost fact:

| `binding_status` | Meaning | Effect on cost |
|---|---|---|
| `registered` | Call matches a declared binding | none — normal |
| `unregistered` | Service/provider/model combination not in the catalog | **none — the call is still priced** |
| `retired` | Matches a binding whose window has closed | none — flagged only |

**Catalog hygiene never blocks pricing.** Cost is priced from the rate card,
which is keyed on provider + model (§8.4) — so an unregistered binding costs
correctly and merely raises a health warning. This is deliberate: an ops
oversight must not silently under-report spend.

### 6.5 Provider migration semantics

Swapping a service's implementation is two data rows and nothing else:

```
1. close the old binding      UPDATE … SET effective_to = '2026-09-01' WHERE id = <old>
2. open the new binding       INSERT … (service_code='solver', provider_code='anthropic',
                                        model='claude-sonnet-4', effective_from='2026-09-01')
3. ensure a rate card exists  (anthropic, claude-sonnet-4)   ← Cost Engine, §8.4
```

Consequences, by design:

- **Historical facts never move.** Calls before the cutover keep their old
  binding, provider, model, and price. The engine's temporal resolution (§8.4)
  guarantees this.
- **The service series is continuous.** `v_cost_by_service` shows one unbroken
  `solver` line across the change — that is the whole point.
- **Dashboard changes: none.** No provider or model name exists in Economics or
  the tab (§8.10 rule 10), so nothing needs editing, redeploying, or reviewing.
- **Simultaneous providers are supported.** `binding_role='shadow'` or
  `'experiment'` lets two implementations run for the same service; the engine
  reports cost per service *and* per binding, which is how an A/B is evaluated
  on cost as well as accuracy.

### 6.6 Multi-service and non-LLM capabilities

The catalog does not assume an LLM. `sympy` and `python` bind to a
`self_hosted` provider with `model='n/a'` and a zero or per-second rate card; they
still report volume, latency, success rate, and (zero) cost — measurable even
when free, which is exactly how you evaluate "should we move Solver to SymPy for
algebraic questions?"

A capability may also be served by a provider with no per-token pricing at all
(per-page OCR, per-request verifier, flat monthly service) — that is a rate-card
concern (§8.4), invisible to the catalog.

---

## 7. AI Telemetry — usage capture

Three principles:

1. **Meter where the work happens** — at the boundary with the provider, inside
   the Edge Function, never in the browser.
2. **Telemetry records usage, not money.** The row answers *"what was consumed?"*
   in provider-neutral units. No price, no currency, no FX rate, no cost column.
3. **Every call is tagged with a canonical service.** The row also answers
   *"which capability did this?"* — a stable identity that survives every future
   provider or model change.

### 7.1 `public.ai_model_calls` — the usage ledger

Append-only, one row per upstream call. Service-role write only; no user may
insert, update, or delete. It never blocks or slows a student response: writes
are batched into `EdgeRuntime.waitUntil()`, exactly like the existing
verification-shadow telemetry.

```sql
CREATE TABLE public.ai_model_calls (
  id                 bigserial PRIMARY KEY,
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- correlation ------------------------------------------------------------
  request_id         uuid        NOT NULL,   -- one student request = one id
  question_record_id uuid        NULL REFERENCES question_records(id) ON DELETE SET NULL,
  session_id         uuid        NULL,
  user_id            uuid        NULL,

  -- WHAT capability did the work (canonical, provider-independent) ---------
  service_code       text        NOT NULL,   -- 'solver'|'judge'|'ocr'|'truth_engine'
                                             -- |'difficulty_detector'|'tutor'|'vision'
                                             -- |'sympy'|'python'|'embedding'|'translation'…
  stage              text        NOT NULL,   -- sub-role WITHIN the service:
                                             -- 'solver_a'|'solver_b'|'extract'|'rerun'|…
  operation          text        NULL,       -- credit_costs.feature_name, when applicable

  -- HOW it was served (physical, may change over time) ---------------------
  provider           text        NOT NULL,   -- 'openai'|'anthropic'|'google'|'self_hosted'…
  model              text        NOT NULL,   -- 'gpt-4o'|'gpt-4o-mini'|'n/a'
  api_surface        text        NOT NULL DEFAULT 'default',  -- 'default'|'batch'|'realtime'

  -- metered usage, in units — the Cost Engine's input ----------------------
  units              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- e.g. {"input_token":5321,"output_token":842,"cached_input_token":2048,"image":1}
  --      {"request":1}   {"second":42}   {"page":3}
  -- Unit codes are validated against cost_engine.billing_units (§8.4).

  -- convenience mirrors of the two hottest units (indexed; not authoritative)
  prompt_tokens      integer     NOT NULL DEFAULT 0,
  completion_tokens  integer     NOT NULL DEFAULT 0,

  -- outcome ----------------------------------------------------------------
  success            boolean     NOT NULL,
  http_status        smallint    NULL,
  error_code         text        NULL,
  latency_ms         integer     NULL,

  meta               jsonb       NULL        -- temperature, max_tokens, tier, …
);

CREATE INDEX ON public.ai_model_calls (created_at DESC);
CREATE INDEX ON public.ai_model_calls (request_id);
CREATE INDEX ON public.ai_model_calls (question_record_id);
CREATE INDEX ON public.ai_model_calls (user_id, created_at DESC);
CREATE INDEX ON public.ai_model_calls (service_code, created_at DESC);
CREATE INDEX ON public.ai_model_calls (provider, model, created_at DESC);
-- The Cost Engine's work queue is an anti-join against cost_facts over a bounded
-- time window; it is served by (created_at DESC) here plus the partial unique
-- index on cost_facts(call_id) WHERE is_current (§8.5). No extra index needed.
```

Design notes:

- **`service_code` is the stable identity; `provider`/`model` are the volatile
  implementation.** Both are recorded. When Solver moves from `gpt-4o-mini` to
  another provider, the service series stays continuous and the change is
  visible *within* it — which is precisely the analysis the Owner wants.
- **No FK from `service_code` to the catalog.** Telemetry is fire-and-forget: a
  new service code emitted before its catalog row exists must still be recorded,
  not rejected. Validation is a soft check surfaced by
  `owner_cost_health()` (§8.9), never an insert failure.
- **No `cost_usd`, no `pricing_version`** *(r2)*. A cost stamped here would be a
  pricing formula living in the service layer, unversioned and impossible to
  correct. The Cost Engine derives it instead.
- **`units jsonb` is the billing-model hinge.** Per image, per minute, per page,
  per document, per GPU-second — a new unit code, not a schema migration.
- **No prompt or completion text.** PII-free by construction, following the
  `analyzer_runs` precedent. Content lives in `question_records`.
- **`request_id` is the join spine.** The Edge Function already generates a
  correlation id (`newCorrelationId()`, `index.ts:251`) and already receives
  `client_request_id` — one of the two becomes the canonical value.
- **Failures are rows too** (`success = false`) — that is how GAP-7 closes.
- **Immutability**: `REVOKE UPDATE, DELETE FROM PUBLIC`; no RPC ever mutates it.

Volume: ~4–6 rows per question. At today's 404 questions/30d that is ~70
rows/day; at 1,000 questions/day it is ~5,000 rows/day (~150k/month) — still
small, with daily rollups planned in the completeness phase.

### 7.2 Emission points

`ai-tutor/index.ts` gets one helper — `recordModelCall({...})` — invoked at each
of the eight call sites in §5.2, passing the canonical `service_code` and
`stage` from that table, and mapping `resp.usage` (`prompt_tokens`,
`completion_tokens`, `prompt_tokens_details.cached_tokens`) into `units`.
Fire-and-forget: a telemetry failure must never affect a student response, same
contract as `analyzer_runs`.

> ⚠ **Deployment constraint.** `ai-tutor/index.ts` is ~55 KB and
> `mcp__Supabase__deploy_edge_function` **must never** be used for it
> (CLAUDE.md §1 — two production outages on 2026-06-17). The telemetry phase
> deploys via **DEPLOY.md §4 only**, with `scripts/validate-ai-tutor-source.sh`
> and `scripts/smoke-test-ai-tutor.sh` as gates.

Other emitters, as they come online: `study-planner.js`, `admin-actions`, and
every future service (§13).

---

## 8. Cost Engine — the single source of cost truth

**The Cost Engine is the single source of truth for all AI cost calculations.**
Nothing else in the platform is permitted to multiply a quantity by a price.

### 8.1 Responsibilities

| # | Responsibility | Where it lives |
|---|---|---|
| R1 | Convert raw telemetry into **normalized cost records** | `cost_engine.run_pricing()` → `cost_facts` (§8.5) |
| R2 | Calculate provider cost using **temporal pricing** | `rate_cards.effective_from/to` resolved against the call's own timestamp (§8.4) |
| R3 | Handle **multiple providers behind canonical services** | Rate cards keyed on provider+model; bindings resolved from the catalog (§6.4) |
| R4 | Handle **different billing models** — per token, per request, per image, per minute, fixed, future | `billing_units` + `rate_components`, incl. tiered bands (§8.4) |
| R5 | Apply **FX conversion** | `fx_rates`, per the engine's stated policy; USD and EGP both stored (§8.7) |
| R6 | Support **discounts, provider-specific and promotional pricing** | `discount_rules`, applied in a fixed, recorded order (§8.6) |
| R7 | Compute **canonical metrics** (total, per request/question/student/lesson/subject/package/service) | `v_cost_by_*` rollups + one metric API (§8.9) |
| R8 | Produce **immutable cost facts** that downstream systems consume | append-only `cost_facts`, versioned by run (§8.5) |
| R9 | Report its own **coverage and health** | `v_pricing_coverage`, `owner_cost_health()` (§8.6, §8.9) |
| **R10** | Roll cost up the **Model → Provider → Service** hierarchy, so business questions are answered by capability | Hierarchical rollups (§8.9) |
| **R11** | Aggregate many calls into **one canonical Question Cost**, attributing shared and parent/child costs deterministically | **Cost Allocation Engine** → `question_cost_facts` (§8.8) |

Explicitly **not** the Cost Engine's job: revenue, credits, packages-as-revenue,
profit, margin, break-even. It knows what things cost and how to slice that cost;
it does not know whether that was a good deal. That judgement is Economics (§9).

The one deliberate exception is the `package` dimension: "cost per package" is a
cost sliced by the plan a student was on, which the engine can attribute without
knowing what the package sold for.

### 8.2 Data flow

```
 (0) AI Service Catalog                             [canonical vocabulary + bindings]
        │  service_code · provider · model · effective window
        │
 (1) AI Service makes a call, tagged service_code + stage
        │  usage in units, outcome, latency
        ▼
 (2) public.ai_model_calls                          [immutable usage fact, no money]
        │
        │  cost_engine.run_pricing(from, to)        ← scheduled; VOLATILE; service_role
        │     a. claim unpriced calls in window
        │     b. resolve BINDING     (catalog, at call time)      → binding_status
        │     c. resolve RATE CARD   (provider, api_surface, model, at call time)
        │     d. price each unit     (components, tier bands)     → gross_cost_usd
        │     e. apply discounts     (priority order)             → discount_usd
        │     f. net = gross − discount                           → net_cost_usd
        │     g. FX convert by policy                             → net_cost_egp
        │     h. snapshot dims (service, provider, model, user, plan, lesson, op…)
        │     i. write fact, or mark 'unpriced' with NULL cost
        ▼
 (3) cost_engine.cost_facts                         [immutable PER-CALL cost fact]
        │
        │  cost_engine.allocate(from, to)           ← COST ALLOCATION ENGINE (§8.8)
        │     j. group calls into work items        (request_id → question_record_id)
        │     k. split SHARED calls across the work items they produced
        │     l. link parent/child work items       (follow-ups, re-explanations)
        │     m. bucket orphans as 'unattributed'   (never dropped)
        │     n. assert CONSERVATION: Σ work-item cost ≡ Σ call cost
        ▼
 (4) cost_engine.question_cost_facts                [immutable PER-QUESTION cost fact]
        │
        ├─► call-grain rollups      ← from (3)
        │     SERVICE   v_cost_by_service                   ← what Economics reads
        │     PROVIDER  v_cost_by_provider, v_cost_by_service_provider
        │     MODEL     v_cost_by_model,    v_cost_by_service_model
        │     STAGE     v_cost_by_stage
        │
        └─► work-item rollups       ← from (4)
              v_cost_by_{question, request, student, lesson, subject,
                         package, operation, daily}
        │
        ▼
 (5) public.owner_cost_*()  RPCs                    [STABLE · owner-gated]
        │
        ▼
 (6) econ.* views + owner_econ_*()                  [revenue, profit, margin]
        │
        ▼
 (7) admin.html #tab-economics                      [service-keyed rendering]
```

**Timing.** Pricing is asynchronous and idempotent. `run_pricing` prices only
calls with no current fact, so it is safe to run every 5 minutes, hourly, or on
demand. A student request is never in the critical path of a cost calculation —
the engine can be down for a day and lose nothing but freshness.

**Backpressure and freshness.** `owner_cost_health()` reports the lag between the
newest telemetry row and the newest priced fact. The dashboard displays it
("costs current as of HH:MM") so a stale engine is visible rather than silently
under-reporting today's spend.

### 8.3 Schema — overview

All objects live in the `cost_engine` schema, not exposed to PostgREST.

| Object | Kind | Purpose |
|---|---|---|
| `billing_units` | table | Unit vocabulary: `input_token`, `output_token`, `cached_input_token`, `image`, `request`, `second`, `page`, `flat_month`, … |
| `rate_cards` | table | Temporal price header per `(provider, api_surface, model)` |
| `rate_components` | table | Per-unit prices for a rate card, with optional tier bands |
| `discount_rules` | table | Provider / promotional / commitment discounts |
| `fx_rates` | table | USD→EGP by date, with source |
| `cost_runs` | table | One row per pricing execution: version, window, counts, reason |
| `cost_facts` | table | **Immutable normalized cost record**, one per (call, run) |
| `allocation_runs` | table | One row per allocation execution: version, window, reason, conservation result (§8.8) |
| `question_cost_facts` | table | **Immutable canonical Question Cost**, one per (work item, allocation run) (§8.8) |
| `v_question_cost_current` | view | The current Question Cost fact per work item |
| `v_cost_facts_current` | view | The current fact per call |
| `v_cost_by_*` | views | Canonical metric rollups, service-first (§8.9) |
| `v_pricing_coverage` | view | Unpriced calls, unregistered bindings, missing rate cards, missing FX |
| `run_pricing()` / `recompute()` / `allocate()` | function | The only writers (VOLATILE, service_role) |

Provider and service registries live in `ai_catalog` (§6.3), not here — the
engine *reads* the catalog, it does not own it.

### 8.4 Rate cards — priced on the model, not the capability

```sql
CREATE TABLE cost_engine.billing_units (
  unit_code    text PRIMARY KEY,          -- 'input_token' | 'image' | 'request' | 'second' | …
  display_name text NOT NULL,
  description  text NULL
);

CREATE TABLE cost_engine.rate_cards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code  text NOT NULL REFERENCES ai_catalog.providers(provider_code),
  model          text NOT NULL,            -- 'n/a' for model-less providers
  api_surface    text NOT NULL DEFAULT 'default',   -- 'default'|'batch'|'realtime'
  billing_model  text NOT NULL,            -- 'per_token'|'per_request'|'per_image'
                                           -- |'per_minute'|'fixed'|'hybrid'
  currency       text NOT NULL DEFAULT 'USD',
  effective_from timestamptz NOT NULL,
  effective_to   timestamptz NULL,         -- NULL = current
  version        text NOT NULL,            -- e.g. 'openai-2026-06'
  source_note    text NULL,                -- provider page + date checked
  UNIQUE (provider_code, model, api_surface, effective_from)
);

CREATE TABLE cost_engine.rate_components (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id  uuid NOT NULL REFERENCES cost_engine.rate_cards(id) ON DELETE CASCADE,
  unit_code     text NOT NULL REFERENCES cost_engine.billing_units(unit_code),
  unit_price    numeric(16,8) NOT NULL,    -- price per `per_qty` units
  per_qty       numeric(16,4) NOT NULL DEFAULT 1,   -- 1_000_000 for $/1M tokens
  tier_from     numeric(16,4) NULL,        -- graduated pricing: lower bound (inclusive)
  tier_to       numeric(16,4) NULL,        -- upper bound (exclusive); NULL = ∞
  min_qty       numeric(16,4) NOT NULL DEFAULT 0,   -- minimum billable quantity
  UNIQUE (rate_card_id, unit_code, tier_from)
);
```

**Rate cards are deliberately *not* keyed on `service_code`.** A price is a
property of the vendor's SKU, not of the capability using it. Keying price by
service would mean re-registering the same model's price for every capability
that calls it, and re-registering everything again on a provider swap — exactly
the coupling r3 removes. One `gpt-4o` price serves `tutor`, `judge`, `ocr`, and
`vision` alike; the engine attributes the resulting cost to whichever service
made the call.

How this covers each billing model without new code:

| Billing model | Encoding |
|---|---|
| Per token | components for `input_token`, `output_token`, `cached_input_token` with `per_qty = 1_000_000` |
| Per request | one component `request`, `unit_price = X`, `per_qty = 1` |
| Per image | one component `image` (add `input_token` too for vision models that bill both) |
| Per minute / second | one component `second`, priced per 60 |
| Per page (OCR) | one component `page` |
| Fixed / subscription | component `flat_month`; the engine amortizes per §8.7 |
| Hybrid | any combination — components simply sum |
| Tiered / graduated | multiple components on the same `unit_code` with `tier_from`/`tier_to` bands |
| Free / self-hosted | a rate card whose components price at `0` — **measured as free**, distinct from unpriced |

**Temporal resolution.** For a call at time `T`, the engine selects the rate card
where `effective_from ≤ T AND (effective_to IS NULL OR T < effective_to)`,
choosing the most specific match (exact model+surface > model default) and, on
ties, the latest `effective_from`. A mid-month provider price change is two rows;
nothing historical is rewritten.

### 8.5 Cost facts — normalized and immutable

```sql
CREATE TABLE cost_engine.cost_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_version text NOT NULL,          -- bumped when a formula changes
  window_from    timestamptz NOT NULL,
  window_to      timestamptz NOT NULL,
  reason         text NOT NULL,          -- 'scheduled'|'backfill'|'rate_card_correction'|…
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz NULL,
  calls_priced   integer NULL,
  calls_unpriced integer NULL
);

CREATE TABLE cost_engine.cost_facts (
  id                 bigserial PRIMARY KEY,
  run_id             uuid NOT NULL REFERENCES cost_engine.cost_runs(id),
  call_id            bigint NOT NULL REFERENCES public.ai_model_calls(id),
  is_current         boolean NOT NULL DEFAULT true,

  occurred_at        timestamptz NOT NULL,   -- copied from the call: the economic date

  -- CAPABILITY dimension (canonical, snapshotted) --------------------------
  service_code       text NOT NULL,
  service_category   text NULL,
  stage              text NOT NULL,
  binding_id         uuid NULL REFERENCES ai_catalog.service_bindings(id),
  binding_status     text NOT NULL,          -- 'registered'|'unregistered'|'retired'

  -- IMPLEMENTATION dimension (physical, snapshotted) -----------------------
  provider_code      text NOT NULL,
  model              text NOT NULL,
  api_surface        text NOT NULL,

  -- BUSINESS dimensions, SNAPSHOT at pricing time (never re-derived) -------
  request_id         uuid NOT NULL,
  question_record_id uuid NULL,
  user_id            uuid NULL,
  is_internal        boolean NOT NULL,       -- admin/owner account at time of call
  plan_code          text NULL,              -- the student's package at time of call
  topic_id           text NULL,
  subtopic_id        text NULL,
  operation          text NULL,
  success            boolean NOT NULL,

  -- money ------------------------------------------------------------------
  pricing_status     text NOT NULL,          -- 'priced'|'unpriced'|'zero_rated'
  gross_cost_usd     numeric(14,8) NULL,
  discount_usd       numeric(14,8) NULL,
  net_cost_usd       numeric(14,8) NULL,     -- NULL when unpriced — never 0
  net_cost_egp       numeric(14,4) NULL,
  fx_rate            numeric(10,4) NULL,
  fx_rate_date       date NULL,

  -- provenance -------------------------------------------------------------
  rate_card_id       uuid NULL REFERENCES cost_engine.rate_cards(id),
  applied_discounts  uuid[] NULL,
  engine_version     text NOT NULL,
  computed_at        timestamptz NOT NULL DEFAULT now(),
  unpriced_reason    text NULL               -- 'no_rate_card'|'unknown_unit'|'no_fx'|…
);

CREATE UNIQUE INDEX ON cost_engine.cost_facts (call_id) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (service_code, occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (provider_code, model, occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (user_id, occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (question_record_id) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (plan_code, occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (topic_id, occurred_at DESC) WHERE is_current;
```

Four properties make these facts trustworthy:

1. **Immutable.** A fact is never updated. Correcting a rate card or a binding
   produces a *new run* whose facts supersede the old ones (`is_current` flips on
   the previous row); the superseded row stays for audit. The partial unique
   index guarantees exactly one current fact per call.
2. **Self-describing.** Every fact records the binding, rate card, discounts, FX
   rate, and engine version that produced it. Any number on the dashboard traces
   to the exact price list and implementation behind it.
3. **Attribution frozen at the time of the call.** `service_code`,
   `provider_code`, `model`, `plan_code`, `is_internal`, `topic_id` are
   snapshotted. A provider swap, a plan upgrade, or a taxonomy remap next month
   does not rewrite last month's economics.
4. **Two independent axes.** Capability (`service_code`) and implementation
   (`provider_code`/`model`) are separate columns, so either can be aggregated
   without the other — and the hierarchy in §8.9 falls out for free.

### 8.6 Pricing algorithm, discounts, and unpriced handling

`run_pricing(p_from, p_to, p_reason)` — deterministic, in this order:

1. **Claim.** Select `ai_model_calls` in `[from, to)` with no current fact.
2. **Resolve binding** from the catalog at the call's timestamp (§6.4) →
   `binding_id`, `binding_status`. Never blocking.
3. **Resolve rate card** by `(provider_code, api_surface, model)` against the
   call's own `created_at` (§8.4). No match → fact with
   `pricing_status='unpriced'`, `unpriced_reason='no_rate_card'`, costs NULL.
4. **Price units.** For each `unit_code` in `units`: find its component(s), apply
   `min_qty`, walk tier bands if present, add `qty × unit_price / per_qty`.
   Unknown unit code → `unpriced`, `unpriced_reason='unknown_unit'` (never
   silently skipped — an unpriced unit would understate cost).
   Sum → `gross_cost_usd`. A card pricing everything at 0 yields
   `pricing_status='zero_rated'`, `net_cost_usd = 0` — an explicit
   *measured-free*, not a missing value.
5. **Apply discounts** from `discount_rules`, in ascending `priority`, each rule
   scoped by provider / service / model / operation / date window and typed as
   `percent`, `fixed_usd`, or `free_units`. Applied rule ids are stored on the
   fact. → `discount_usd`.
6. **Net** = `gross − discount`, floored at 0.
7. **FX** per §8.7 → `net_cost_egp`, `fx_rate`, `fx_rate_date`. No rate for the
   period → EGP stays NULL with `unpriced_reason='no_fx'`; USD remains valid.
8. **Snapshot all dimensions** (§8.5) and write the fact.

```sql
CREATE TABLE cost_engine.discount_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label           text NOT NULL,
  scope_provider  text NULL,   -- NULL = any
  scope_service   text NULL,   -- discounts may be scoped by capability too
  scope_model     text NULL,
  scope_operation text NULL,
  discount_type   text NOT NULL,          -- 'percent' | 'fixed_usd' | 'free_units'
  value           numeric(14,6) NOT NULL,
  unit_code       text NULL,              -- for 'free_units'
  effective_from  timestamptz NOT NULL,
  effective_to    timestamptz NULL,
  priority        smallint NOT NULL DEFAULT 100,
  note            text NULL
);
```

This covers provider volume discounts, negotiated rates, promotional credits, and
free-tier allowances without any change to Economics — a discount is data.

**The unpriced rule is the engine's contribution to honest numbers.** A brand-new
model appearing in telemetry before its rate card is registered does not silently
cost $0: it lands as `unpriced`, `owner_cost_health()` raises it, and every
affected KPI reports its coverage percentage. Cost is either measured or declared
unknown — never assumed.

### 8.7 FX policy and amortized fixed costs

```sql
CREATE TABLE cost_engine.fx_rates (
  rate_date  date PRIMARY KEY,
  usd_to_egp numeric(10,4) NOT NULL,
  source     text NOT NULL      -- 'manual' | 'cbe' | …
);
```

- **Policy (recommended, §15 Q2):** month-of-occurrence rate — every fact in a
  calendar month converts at that month's rate, so intra-month comparisons are
  not distorted by currency noise. Alternative (per-day rate) is a one-line
  change in the resolver, and the choice is recorded in `engine_version`.
- Both `net_cost_usd` and `net_cost_egp` are stored. USD is the provider truth;
  EGP is the reporting currency alongside revenue. Any mixed-currency figure the
  dashboard shows names its rate and date.
- **Fixed / subscription-priced services** (`flat_month`) are amortized by the
  engine across the month's calls for that provider+model, so a flat-rate
  verifier still produces a per-question and per-service cost. The amortization
  basis (`calls` or `units`) is a property of the rate card and is recorded on
  each fact.

Platform infrastructure spend (Supabase, Vercel, domain, payment fees) is *not* a
per-call cost and stays out of the engine. It lives in
`public.platform_cost_entries` and is applied by Economics at the P&L level
(§9.4).

### 8.8 Cost Allocation Engine — from calls to Question Cost

The Cost Engine has two internal stages. **Cost Calculation** (§8.4–§8.7) prices
one upstream call. **Cost Allocation** turns those per-call facts into the unit
the business actually reasons about: the cost of *one question*.

The Cost Allocation Engine is an **internal component of the Cost Engine** — not
a separate service, not a dashboard, not addressable from the UI, and not
something AI Economics can invoke. Its only outputs are immutable facts.

#### 8.8.1 Why it is a distinct stage

A per-question cost is not a `SUM` of per-call costs, and the gap is not
cosmetic:

| Situation | In this platform today | Why a plain SUM fails |
|---|---|---|
| **Fan-out** | 4–6 calls per question (§5.2) | the easy case — grouping by `request_id` is correct |
| **Shared cost** | `detectQuestionsInImages` (line 1368) analyses one image and yields *several* questions | one call's cost belongs to N questions; the split must be deterministic and lossless |
| **Parent / child** | follow-ups, re-explanations, `reference_resolver` (line 2497) resolving against an earlier question | a child's cost must not be double-counted into its parent, yet the thread total must remain answerable |
| **Late background work** | difficulty detector and the L3 shadow pipeline run in `EdgeRuntime.waitUntil()` *after* the response | calls land after the question fact was first computed; allocation must be re-runnable without mutating anything |
| **Orphans** | calls with no resolvable `question_record_id` (failed insert, session indexing, study-plan generation) | silently dropping them understates total cost |
| **Partial pricing** | one contributing call is `unpriced` (§8.6) | the question's cost is *incomplete* and must say so rather than under-report |

#### 8.8.2 Responsibilities

| # | Responsibility |
|---|---|
| A1 | Aggregate multiple AI calls into a single **Question Cost** |
| A2 | Attribute **shared costs** consistently across the work items that caused them |
| A3 | Handle **parent/child AI operations** without double counting |
| A4 | Allocate cost **across AI services deterministically**, preserving the service mix |
| A5 | Produce canonical **Question Cost facts** consumed by AI Economics |
| A6 | Prove **conservation** — allocated cost equals priced cost, exactly, every run |

It performs **no pricing math**. It never multiplies a quantity by a price; it
only distributes amounts the Cost Calculation stage already computed. That
separation is what keeps §8.9's rollups reconcilable at both grains.

#### 8.8.3 Work items — the canonical unit

A **work item** is one unit of student-visible work. "Question" is the canonical
and by far the most common case; the same fact table generalizes so that Mock
Exams, Study Plans, Focus Sessions, and Weakness Analyses land in the same
structure when GAP-3 closes (Phase 8), with no schema change.

| `work_item_type` | Identified by | Status |
|---|---|---|
| `question` | `question_records.id` | live at Phase 3 |
| `study_plan` | `study_plans.id` | when metered |
| `mock_exam` / `focus_session` / `weakness_report` | respective ids | after GAP-3 |
| `unattributed` | synthetic key (`request_id`, else session+day) | always available — the orphan bucket |

#### 8.8.4 Allocation methods — deterministic by construction

Every allocated amount records the method that produced it:

| Method | When it applies | Rule |
|---|---|---|
| `direct` | the call maps to exactly one work item | the whole cost goes to that work item |
| `shared_equal` | one call produced N work items | split equally; **largest-remainder** distribution so the parts sum to the original exactly; remainder assigned by ascending work-item id |
| `shared_weighted` | reserved for future signals (e.g. per-question token share) | weights must be declared on the rule and stored on the fact — never inferred at read time |
| `inherited` | parent/child threads | **no cost moves.** A child's calls stay on the child; the parent's `thread_cost` rolls descendants up separately |
| `unattributed` | no resolvable work item | full cost to the orphan bucket, reported and never dropped |

**Determinism requirement.** Given the same call facts and the same
`allocation_version`, the output must be byte-identical: no randomness, no
dependence on execution or join order, exact `numeric` arithmetic (never float
accumulation), and a deterministic remainder tie-break. Re-running allocation
over an untouched window must produce an identical result — this is asserted,
not assumed (§14, Phase 4 exit).

**Parent/child, stated precisely.** Every work-item fact carries two measures
that are never added together:

- `total_cost_usd` — cost incurred by *this* work item's own calls (direct +
  its share of shared calls). This is the default everywhere in Economics.
- `thread_cost_usd` — `total_cost` plus all descendants, via
  `parent_work_item_id`. Shown on drill-down, labelled as inclusive.

So a follow-up that cost $0.004 appears as $0.004 of its own, and the original
question's thread total rises by $0.004 — with the platform-wide sum unchanged.

#### 8.8.5 Conservation law

For any window `W`, over current facts:

```
Σ question_cost_facts.total_cost_usd   ≡   Σ cost_facts.net_cost_usd
   (all work items, including the             (all priced calls in W)
    'unattributed' bucket)
```

`allocate()` asserts this at the end of every run. **A mismatch fails the run**
and leaves the previous allocation current — fail-closed, so the dashboard shows
slightly stale but internally consistent numbers rather than fresh inconsistent
ones. The result is stored on `allocation_runs` for audit.

This is the property that makes the two rollup grains in §8.9 trustworthy: a
service-grain total and a question-grain total for the same window are equal by
construction, not by coincidence.

#### 8.8.6 Schema

```sql
CREATE TABLE cost_engine.allocation_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_version  text NOT NULL,        -- bumped when an allocation rule changes
  window_from         timestamptz NOT NULL,
  window_to           timestamptz NOT NULL,
  reason              text NOT NULL,        -- 'scheduled'|'late_calls'|'reallocation'|…
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz NULL,
  work_items_written  integer NULL,
  calls_allocated     integer NULL,
  conserved           boolean NULL,         -- §8.8.5 assertion result
  variance_usd        numeric(14,8) NULL    -- must be 0 when conserved
);

CREATE TABLE cost_engine.question_cost_facts (
  id                   bigserial PRIMARY KEY,
  allocation_run_id    uuid NOT NULL REFERENCES cost_engine.allocation_runs(id),
  is_current           boolean NOT NULL DEFAULT true,

  -- identity ---------------------------------------------------------------
  work_item_type       text NOT NULL DEFAULT 'question',
  work_item_id         text NOT NULL,        -- question_records.id, or synthetic
  parent_work_item_id  text NULL,            -- follow-ups / re-explanations
  request_id           uuid NULL,
  occurred_at          timestamptz NOT NULL,

  -- business dimensions, inherited from the contributing cost facts --------
  user_id              uuid NULL,
  is_internal          boolean NOT NULL,
  plan_code            text NULL,
  topic_id             text NULL,
  subtopic_id          text NULL,
  operation            text NULL,

  -- money ------------------------------------------------------------------
  direct_cost_usd      numeric(14,8) NULL,   -- from calls owned solely by this item
  shared_cost_usd      numeric(14,8) NULL,   -- this item's share of shared calls
  total_cost_usd       numeric(14,8) NULL,   -- direct + shared. NULL when unknown
  total_cost_egp       numeric(14,4) NULL,
  thread_cost_usd      numeric(14,8) NULL,   -- inclusive of descendants

  -- composition ------------------------------------------------------------
  service_mix          jsonb NOT NULL,       -- {"solver":0.00021,"judge":0.00043,…}
  call_count           integer NOT NULL,
  priced_call_count    integer NOT NULL,
  unpriced_call_count  integer NOT NULL,
  cost_completeness    text NOT NULL,        -- 'complete'|'partial'|'unknown'

  -- provenance -------------------------------------------------------------
  allocation_method    text NOT NULL,        -- dominant method for this item
  allocation_version   text NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON cost_engine.question_cost_facts (work_item_type, work_item_id)
  WHERE is_current;
CREATE INDEX ON cost_engine.question_cost_facts (occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.question_cost_facts (user_id, occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.question_cost_facts (topic_id, occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.question_cost_facts (plan_code, occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.question_cost_facts (parent_work_item_id) WHERE is_current;
```

`service_mix` is what lets a lesson, student, or package rollup break down by
capability without re-joining call facts — the per-question cost carries its own
service composition.

`cost_completeness` extends the honest-numbers rule to the aggregate:

| Value | Meaning | How Economics renders it |
|---|---|---|
| `complete` | every contributing call was priced | normal |
| `partial` | some contributing calls are `unpriced` | value shown with an explicit "≥" / incomplete marker and a count |
| `unknown` | no contributing call could be priced | `—`, never `0` |

#### 8.8.7 Immutability and re-allocation

Identical model to Cost Calculation (§8.5): facts are never updated. Late
background calls, a rate-card correction, or an allocation-rule change produce a
**new allocation run** whose facts supersede the previous ones (`is_current`
flips); superseded rows remain for audit. The partial unique index guarantees
exactly one current fact per work item.

Because allocation is derived from cost facts, a recompute of pricing
(§8.6) always triggers a re-allocation of the affected window — the two stages
are versioned independently but advanced together.

#### 8.8.8 What it is not

- **Not a dashboard.** It has no UI, no tab, no owner-facing RPC of its own; its
  outputs reach the Owner only through `owner_cost_metrics()` and Economics.
- **Not revenue-aware.** It never sees a package price, a credit, or a payment.
- **Not a pricing stage.** It redistributes already-priced amounts; it cannot
  create or destroy cost — §8.8.5 enforces that arithmetically.
- **Not a mutation of `cost_facts`.** Call-grain facts are read-only inputs.

### 8.9 Canonical metrics — the Service → Provider → Model hierarchy

The engine publishes rollups at three levels of the implementation hierarchy plus
the business dimensions. Every rollup returns the **same measure set** —
`total_cost_usd`, `total_cost_egp`, `calls`, `requests`, `units`, `priced_calls`,
`unpriced_calls`, `coverage_pct`, `avg_latency_ms`, `success_rate`,
`failed_cost_usd`, `cost_share_pct` — so the dashboard renders every dimension
with one component.

**Implementation hierarchy** (the r3 requirement):

```
SERVICE          v_cost_by_service            ← the business view. Economics reads this.
   ↓             "OCR costs $X/month"
PROVIDER         v_cost_by_service_provider   ← vendor split within a capability
   ↓             "OCR: openai $X, google $Y"
MODEL            v_cost_by_service_model      ← SKU detail for engineering
                 "OCR/openai: gpt-4o $X"

cross-cutting:   v_cost_by_provider  (vendor concentration across all services)
                 v_cost_by_model     (SKU totals across all services)
```

**Canonical metrics**:

| Canonical metric | View | Grain | Derived from |
|---|---|---|---|
| Total Cost | `v_cost_daily` | day | either — equal by conservation (§8.8.5) |
| **Cost per AI Service** | `v_cost_by_service` | `service_code` | call facts |
| Cost per Provider | `v_cost_by_provider` | `provider_code` | call facts |
| Cost per Model | `v_cost_by_model` | `model` | call facts |
| *(supporting)* Cost per Stage | `v_cost_by_stage` | pipeline stage | call facts |
| **Cost per Question** | `v_cost_by_question` | work item | **Question Cost facts** |
| Cost per Request | `v_cost_by_request` | `request_id` | Question Cost facts |
| Cost per Student | `v_cost_by_student` | `user_id` | Question Cost facts |
| Cost per Lesson | `v_cost_by_lesson` | `subtopic_id` | Question Cost facts |
| Cost per Subject | `v_cost_by_subject` | `topic_id` | Question Cost facts |
| Cost per Package | `v_cost_by_package` | `plan_code` (snapshotted) | Question Cost facts |
| *(supporting)* Cost per Operation | `v_cost_by_operation` | `feature_name` | Question Cost facts |

**Which grain feeds which rollup is a deliberate rule, not an implementation
detail.** Anything keyed on *how the work was served* (service, provider, model,
stage) reads call facts. Anything keyed on *whose work it was* (question,
student, lesson, subject, package, operation) reads Question Cost facts, because
only those carry correctly-attributed shared and parent/child costs. The two
grains reconcile exactly for any window, by the conservation law in §8.8.5 —
which is what makes it safe to mix them on one screen.

Each service-level row also carries `display_name`, `category`, and
`over_target` (against `services.cost_target_usd`, when set) — denormalized from
the catalog by the engine, so **Economics never needs a catalog grant** and the
dashboard never needs a service name in its code.

Each work-item rollup additionally carries `service_mix` (the per-capability
split, from §8.8.6) and `cost_completeness`, so any business dimension can be
broken down by service and correctly labelled when some contributing calls are
unpriced.

Public RPC surface — all `SECURITY DEFINER`, `STABLE`, owner-gated,
`SET search_path = public, cost_engine, ai_catalog`:

| RPC | Purpose |
|---|---|
| `owner_cost_metrics(p_dimension text, p_from date, p_to date, p_include_internal bool, p_limit int)` | The single metric API. `p_dimension ∈ {daily, service, provider, model, service_provider, service_model, request, question, student, lesson, subject, package, stage, operation}`. **Defaults to `service`.** Returns the uniform measure set |
| `owner_cost_service_breakdown(p_service_code text, p_from, p_to)` | One call returns a service's full Service → Provider → Model tree, for the dashboard's expand-row UX |
| `owner_cost_facts(p_from, p_to, p_filters jsonb, p_limit)` | Fact-level drill-down — every row carries its binding, rate card, and discounts |
| `owner_cost_health()` | Freshness lag; unpriced counts by reason; **unregistered/retired bindings**; services with no active binding; services over cost target; missing rate cards; missing FX months; last run summary |
| `owner_cost_rate_cards(p_at timestamptz)` | The price book in force at a moment (read-only) |
| `owner_cost_reprice(p_scenario jsonb)` | **Pure what-if.** Re-prices a historical window under hypothetical bindings / rate cards / routing. Writes nothing. What the simulator calls (§11) |

Internal, not exposed to PostgREST:

| Function | Volatility | Caller |
|---|---|---|
| `cost_engine.run_pricing(p_from, p_to, p_reason)` | `VOLATILE` | Scheduled job / `service_role` |
| `cost_engine.recompute(p_from, p_to, p_reason)` | `VOLATILE` | Owner-initiated correction; supersedes facts in a new run |

### 8.10 Extensibility rules

These keep the layering true over time:

1. **All cost math lives in the Cost Engine.** No pricing formula may exist in an
   AI service, in telemetry, in `econ`, in an RPC outside `cost_engine`, or in
   dashboard JavaScript. A multiplication of quantity by price anywhere else is a
   defect.
2. **Telemetry never carries money.** No cost, price, currency, or FX column may
   be added to `ai_model_calls`. If a provider returns a cost directly, store it
   in `meta` as a *reconciliation input*; the engine still computes the
   authoritative figure.
3. **A new billing model is data, not code.** Add a `billing_units` row and
   `rate_components`; do not add a column, a branch, or a special case.
4. **A new provider is a catalog row + a binding + a rate card.** No engine
   change, no Economics change, no dashboard change.
5. **A new capability is a `services` row.** It may be registered before it is
   implemented; it appears at zero cost and lights up when telemetry arrives.
6. **Never price by omission.** An unresolvable rate card, unit, or FX yields
   `unpriced` with NULL cost. Zero means measured-free (`zero_rated`).
7. **Facts are immutable; corrections are new runs.** Never `UPDATE cost_facts`.
   A formula change bumps `engine_version` and requires a recompute to apply
   retroactively — leaving old facts auditable.
8. **Economics reads engine outputs only.** `econ` objects may reference
   `v_cost_facts_current` and `v_cost_by_*`. Referencing `rate_cards`,
   `rate_components`, `discount_rules`, or `fx_rates` from `econ` is a CI failure
   (§3.2 layer 5) and a permission error under §3.3.
9. **Attribution is snapshotted, never re-derived** — including the service,
   provider, and model that served the call.
10. **No provider or model literal above the engine.** No `econ` view, no
    `owner_econ_*` function, and no line of the dashboard tab may contain a
    provider or model name. Providers and models reach the UI only as *data* in
    an engine drill-down. This is what makes a provider swap a zero-code change,
    and it is CI-checked.
11. **One measure set.** Every canonical rollup returns the same measures, so a
    new dimension is a new view plus one enum value in `owner_cost_metrics` — the
    dashboard needs no new rendering code.
12. **Allocation conserves cost exactly.** Allocation may move cost between work
    items; it may never create or destroy it. Every run asserts §8.8.5 and fails
    closed on variance.
13. **Allocation is deterministic.** Same inputs + same `allocation_version` ⇒
    byte-identical output. No randomness, no order dependence, no float
    accumulation, deterministic remainder tie-break.
14. **Allocation never prices.** The Cost Allocation Engine redistributes amounts
    the pricing stage already computed; a rate lookup inside allocation is a
    defect.

---

## 9. AI Economics — business interpretation

Economics answers the business question. It consumes Cost Engine outputs for
everything cost-shaped, and owns everything revenue-shaped. **It is keyed on
canonical services and contains no provider or model name anywhere.**

### 9.1 Schema layout

```
ai_catalog.*                       ← services · providers · bindings (vocabulary)
        │
public.ai_model_calls              ← telemetry facts (append-only, no money)
        │
        ▼
cost_engine.*                      ← rate cards · FX · discounts · cost_facts
        │   (private:   rate cards, components, discounts, fx)
        │   (published: v_cost_facts_current, v_cost_by_* — service names included)
        ▼
econ.*                             ← revenue views + joins to published cost views
        │   (schema NOT exposed to PostgREST; no provider/model columns)
        ▼
public.owner_econ_*()              ← SECURITY DEFINER · STABLE · owner-gated
public.owner_cost_*()              ← SECURITY DEFINER · STABLE · owner-gated
        │
        ▼
admin.html #tab-economics          ← render only, service-keyed
```

### 9.2 Views (Economics)

| View | Grain | Purpose |
|---|---|---|
| `econ.v_revenue_events` | approved payment | Normalized revenue fact: user, plan, amount, kind, credits granted |
| `econ.v_revenue_recognized_daily` | day | Deferred revenue spread across `period_days` (§9.3) |
| `econ.v_credit_flow` | day / lifetime | Sold vs granted vs consumed vs refunded vs outstanding |
| `econ.v_pnl_daily` | day | Recognized revenue ⋈ `v_cost_daily` ⋈ platform costs → gross/net profit, margin |
| `econ.v_service_economics` | `service_code` | Cost share, trend, cost per unit of work, over-target flag — **the "which capability should we optimize?" view** |
| `econ.v_package_economics` | `plan_code` | Revenue ⋈ `v_cost_by_package` → margins, avg usage, break-even; expandable by service |
| `econ.v_student_economics` | `user_id` | Revenue attribution ⋈ `v_cost_by_student` → profit, abnormal-usage flags |
| `econ.v_lesson_economics` | `topic_id`/`subtopic_id` | Volume + `v_cost_by_lesson`, with coverage flag |
| `econ.v_operation_service_mix` | `operation` × `service_code` | Which capabilities a charged operation actually consumes — the bridge between what a student pays for and what it costs to serve |
| `econ.v_breakeven_inputs` | month | Section 11 inputs |

Every one joins to a **published** cost view. None contains a price, a rate, an
FX multiplication, a provider, or a model — and none re-aggregates raw call
facts: question, student, lesson, subject, and package figures all come from the
Cost Allocation Engine's Question Cost facts (§8.8), so shared and parent/child
costs are attributed once, consistently, everywhere.

All views default to excluding internal accounts (using the engine's snapshotted
`is_internal` flag); an `include_internal` RPC parameter flips it.

### 9.3 Revenue recognition model

Credits are sold up front and consumed later, so "revenue" is ambiguous unless
defined. Three distinct measures, each labelled in the UI:

1. **Collected revenue** *(Actual)* — `SUM(amount_egp)` of approved
   `payment_requests` in the window. Cash in.
2. **Recognized revenue** *(Derived)* — a subscription is spread straight-line
   across `period_days`; a pack is recognized as its credits are consumed. This
   is the figure that belongs next to AI cost in a P&L, because cost accrues
   daily while cash arrives in lumps.
3. **Credit-attributed revenue** *(Derived)* — for per-question, per-lesson,
   per-service, and per-student profit:
   `revenue_per_credit = amount_egp / credits_granted` at purchase, then
   `question_revenue = credits_charged × revenue_per_credit`.

Excluded from all three: `GRANT` (+77,500) and `ADMIN_ADJUST` (+17,000) credit
transactions, and founder/admin comps. They are cost without revenue and are
reported separately as **Internal / promotional cost**.

### 9.4 Platform (non-AI) costs

```sql
CREATE TABLE public.platform_cost_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,       -- first day of month
  category     text NOT NULL,       -- 'supabase'|'vercel'|'domain'|'payment_fees'|…
  amount       numeric(12,2) NOT NULL,
  currency     text NOT NULL DEFAULT 'USD',
  note         text NULL,
  UNIQUE (period_month, category)
);
```

Owner-entered, applied by Economics at the P&L level only — deliberately outside
the Cost Engine, because it is not attributable to a call. Gross profit needs
only the engine; **net** profit needs this. Until it is populated, Net Profit and
Net Margin render as **Blocked** — the module must not silently report gross as
net.

### 9.5 RPC surface (Economics)

| RPC | Returns |
|---|---|
| `owner_econ_overview(p_from, p_to, p_include_internal)` | Sections 1–4 in one round-trip: financial overview, cost analytics (via engine, service-keyed), revenue analytics, credits analytics |
| `owner_econ_services(p_from, p_to)` | **Service economics** — cost share, trend, cost per unit of work, over-target flags |
| `owner_econ_packages(p_from, p_to)` | Section 5 |
| `owner_econ_operations(p_from, p_to)` | Sections 6 + 7, including the operation × service mix |
| `owner_econ_students(p_from, p_to, p_limit)` | Section 8 |
| ~~`owner_econ_models(p_from, p_to)`~~ | Section 9 — **never built, by locked decision (M4.3).** Section 9 exposes `provider_code` and `model`, which INV-13 / P5-02 forbid in `econ`, so it is served **directly** by `owner_cost_service_breakdown()` + `owner_cost_health()` with no `econ` wrapper. See the M4.3 closeout. |
| `owner_econ_simulate(p_scenario jsonb)` | Section 10 — calls `owner_cost_reprice()` for the cost side |
| `owner_econ_breakeven(p_from, p_to)` | Section 11 |
| `owner_econ_coverage()` | Which KPIs are Actual vs Blocked right now, and why — merges telemetry coverage with `owner_cost_health()` |

`owner_econ_coverage()` is what makes the honest-numbers rule self-maintaining:
the UI asks the database which numbers it is allowed to trust, rather than
hardcoding the answer.

### 9.6 Attribution and exclusion rules

| Rule | Definition | Owner |
|---|---|---|
| **Capability attribution** | `service_code` snapshotted on every fact; provider/model recorded separately and never surfaced by Economics | Cost Engine |
| **Internal account** | `profiles.is_admin = true` OR role ≥ `admin`, snapshotted at call time. Excluded by default (GAP-4) | Engine snapshots; Economics filters |
| **Cost atom** | `request_id`. Per-question cost = `v_cost_by_question` | Cost Engine |
| **Question → lesson** | `topic_id`/`subtopic_id` snapshotted; rows without it bucket as `unmapped`, with coverage % shown beside the chart (currently 25%) | Cost Engine |
| **Background cost** | Difficulty detector, shadow-pipeline, OCR-rerun calls attribute to the question that triggered them, never dropped — real spend, correctly charged to their own services | Cost Engine |
| **Failed calls** | Counted in total cost, excluded from "avg cost per successful question", surfaced as `failed_cost_usd` per service | Cost Engine |
| **Revenue attribution** | §9.3 | Economics |
| **Promotional/internal cost** | Cost with no matching revenue, reported separately | Economics |

---

## 10. KPI dictionary

Confidence classes — extends the legend already used in
`docs/audit/dashboard-metrics.md`:

- **Actual** — direct aggregate over production facts.
- **Derived** — arithmetic over Actual values, using a stated, deterministic rule.
- **Modeled** — depends on an assumption (FX rate, recognition schedule, rate card). Rendered with the assumption inline.
- **Blocked** — no data source exists yet. Renders `—` plus a reason.

"After CE" = once telemetry is emitting **and** the Cost Engine is pricing it.
Cost KPIs cite the engine view that produces them, not a formula.

### Section 1 — Financial Overview

| KPI | Source / formula | Now | After CE |
|---|---|---|---|
| Today's AI Cost | `owner_cost_metrics('daily')` → today | Blocked | Actual |
| Monthly AI Cost | `owner_cost_metrics('daily')` → MTD | Blocked | Actual |
| Total Revenue (collected) | `SUM(amount_egp) WHERE status='approved'` | **Actual** | Actual |
| Recognized Revenue | `econ.v_revenue_recognized_daily` | Derived | Derived |
| Gross Profit | `recognized_revenue_EGP − cost_egp` (engine-converted) | Blocked | Modeled (FX stated) |
| Net Profit | `gross − platform_costs − payment_fees` | Blocked | Modeled |
| Profit Margin | `gross_profit / recognized_revenue` | Blocked | Modeled |
| Active Subscribers | `COUNT(*) WHERE plan_code≠'FREE' AND subscription_expires_at > now()` | **Actual** | Actual |

### Section 2 — AI Cost Analytics

Every row is a direct read of a canonical engine metric — Economics performs no
arithmetic here.

| KPI | Engine view | Now | After CE |
|---|---|---|---|
| **Cost per AI Service** | `v_cost_by_service` | Blocked | Actual |
| Cost per Question | `v_cost_by_question` | Blocked | Actual |
| Cost per Student | `v_cost_by_student` | Blocked | Actual |
| Cost per Lesson | `v_cost_by_lesson` | Blocked | Actual (25% coverage flag) |
| Cost per Subject | `v_cost_by_subject` | Blocked | Actual |
| Cost per Package | `v_cost_by_package` | Blocked | Actual |
| Cost per Provider *(drill-down)* | `v_cost_by_provider` | Blocked | Actual |
| Cost per Model *(drill-down)* | `v_cost_by_model` | Blocked | Actual |

### Section 3 — Revenue Analytics

| KPI | Formula | Now |
|---|---|---|
| Revenue by billing cycle (monthly/quarterly/yearly) | `payment_requests` ⋈ `plan_definitions.period_days` (30/91/365) | **Actual** |
| Pack vs subscription revenue | `plan_definitions.kind` | **Actual** |
| Revenue growth over time | monthly series + MoM % | **Actual** |
| ARPU / ARPPU | revenue ÷ active (paying) users | Derived |

### Section 4 — Credits Analytics

| KPI | Formula | Now |
|---|---|---|
| Credits Sold | `SUM(credits_granted)` over approved purchases | **Actual** (excludes grants/adjustments — stated) |
| Credits Granted (non-revenue) | `credit_transactions` `GRANT` + `ADMIN_ADJUST` | **Actual** |
| Credits Consumed | `SUM(credits_used)` | **Actual** (understated by GAP-3 — flagged) |
| Remaining Credits (liability) | `SUM(credits_balance)` | **Actual** |
| Avg Credits per Student | consumed ÷ active students | Derived |
| Avg Credits per Question | consumed ÷ questions | Derived |
| Credit burn rate / runway | 30-day consumption trend vs balance | Derived |
| Cost per Credit | `v_cost_daily.total_cost` ÷ credits consumed (input to package break-even) | Blocked → Derived after CE |

### Section 5 — Package Profitability

| KPI | Source | Now | After CE |
|---|---|---|---|
| Revenue per package | `econ.v_revenue_events` | **Actual** | Actual |
| AI cost per package | `v_cost_by_package` | Blocked | Actual |
| **Package cost split by service** | `v_cost_by_package` × `service` | Blocked | Actual |
| Gross / Net margin | revenue − cost (− fixed costs) | Blocked | Modeled |
| Average usage | credits + questions per subscriber | **Actual** | Actual |
| Break-even point | `price ÷ cost_per_credit` → credits a subscriber may burn before the package loses money | Blocked | Derived |

### Section 6 — Question Cost Analytics

Operation types: Text, Image, OCR, Long Explanation, Mock Exam, Study Plan,
Truth Engine, future features. *(Note: with the catalog, "OCR" and "Truth Engine"
are **services**, while "Text/Image/Mock Exam" are **operations** — both are now
first-class and separately reportable.)*

| KPI | Source | Now | After CE |
|---|---|---|---|
| Avg cost per operation type | `v_cost_by_operation` | Blocked | Actual for chat/study-plan; **still Blocked for Mock/Focus/Weakness until GAP-3 closes** |
| Operation → service mix | `econ.v_operation_service_mix` | Blocked | Actual |
| Cost split by pipeline stage | `v_cost_by_stage` | Blocked | Actual |
| Cost of failed calls, by service | `failed_cost_usd` measure | Blocked | Actual |

### Section 7 — Lesson Economics

| KPI | Now | After CE |
|---|---|---|
| Most expensive lessons (Functions, Geometry, Statistics, Probability, Algebra…) | Blocked | Actual, coverage-flagged |
| Avg AI cost per canonical lesson | Blocked | Actual (rises with `topic_id` backfill) |
| Lesson cost split by service | Blocked | Actual |
| Question volume by lesson | **Actual today** — 90-day: Algebra 289, Geometry 88, Statistics 68, Probability & Ratios 55, Functions 32 | Actual |

### Section 8 — Student Consumption Analytics

| KPI | Now | After CE |
|---|---|---|
| Credits used per student | **Actual** | Actual |
| AI cost per student | Blocked | Actual (`v_cost_by_student`) |
| Revenue per student | **Actual** | Actual |
| Profit per student | Blocked | Modeled (FX) |
| Avg cost per question | Blocked | Actual |
| Avg daily usage | **Actual** | Actual |
| Student cost split by service | Blocked | Actual |
| Abnormal-usage flag (> 3σ, or cost > revenue) | Partial | Derived |

### Section 9 — AI Service & Model Analytics

*Renamed from "AI Model Analytics" in r3.* The dashboard leads with services and
drills down through provider to model. **No model name is hardcoded** — the table
is a pass-through of `owner_cost_service_breakdown()`.

> **Delivered in M4.3, closed 2026-08-01.** Section 9 is a **diagnostic surface
> served only by `owner_cost_*` RPCs** — it includes internal traffic, says so on
> screen, and never feeds an `owner_econ_*` business KPI. It is the **only fully
> populated panel**, precisely because Sections 1–8 exclude internal traffic
> (INV-25) and 100% of telemetry is currently internal.

| KPI | Grain | Status |
|---|---|---|
| Requests, prompt/completion/total tokens, avg tokens per call | service → provider → model | ✅ **Actual** |
| Avg cost per **request** | service → provider → model | ✅ **Actual** |
| Avg cost per **question** | service → provider → model | ⛔ **OMITTED, not blocked** — work items are keyed by service and a question spans several models, so the figure is *undefined at this grain*, not data-limited. Available per service and per work item. |
| Avg latency | service → provider → model | ✅ **Actual per call** |
| Success / failure rate | service → provider → model | ✅ **Actual per call** — denominator is calls whose outcome is *known*; unknown is excluded, never counted as failure (INV-26) |
| **Cost share by service** | service | ✅ **Actual** — totals exactly 100.00% |
| **Most expensive capability** | service | ✅ **Actual** — `tutor`, 59.17% |
| **Over cost target** | service | ⚠️ **Still unreportable.** 0 of 12 services carry a `cost_target_usd`, and `owner_cost_health()` emits `service_over_budget` only on breach — so "no targets set" and "none breached" are indistinguishable. **Open question for the owner.** |
| **Provider concentration** | provider | ✅ **Actual** — trivially 100%, one provider registered |
| Pricing coverage %; unregistered bindings | — | ✅ **Actual** — engine health, 100.00% |

### Sections 10–11 — Simulator & Break-even

All outputs **Modeled** by definition; see §11 and §12.

---

## 11. Pricing Simulator (Section 10)

The simulator asks two independent questions, and each goes to the layer that
owns it:

| Question | Answered by |
|---|---|
| "What would this have **cost** under a different implementation, price, or routing?" | `owner_cost_reprice()` — Cost Engine |
| "What would that mean for **revenue, profit, and margin**?" | `owner_econ_simulate()` — Economics |

Economics never re-implements provider pricing to run a scenario.

**Inputs** — scenarios are now expressed at the *service* level, which is how the
Owner actually thinks about the decision:

```jsonc
{
  "basis_window": { "from": "2026-06-01", "to": "2026-06-30" },

  // ── Cost Engine handles these ──────────────────────────────────────────
  "service_swap": {                                    // rebind a capability
    "solver": { "provider": "anthropic", "model": "claude-sonnet-4" },
    "ocr":    { "provider": "google",    "model": "vision-ocr-v2"   }
  },
  "model_swap":   { "gpt-4o": "gpt-4.1" },             // lower-level escape hatch
  "rate_override": { "openai:gpt-4o:output_token": 8.0 },
  "routing":      { "solver.solver_b": "hard_only",    // stage-level policy
                    "judge": "image_questions_only" },
  "discounts":    [ { "scope_provider": "openai", "discount_type": "percent", "value": 10 } ],
  "fx":           { "usd_to_egp": 48.5 },

  // ── Economics handles these ────────────────────────────────────────────
  "packages":     { "PRO_MONTHLY": 450, "PACK_VALUE": 399 },  // EGP overrides
  "operations":   { "CHAT_TEXT": 8, "MOCK_EXAM": 35 },        // credit-cost overrides
  "demand":       { "elasticity": 0.0 }                       // 0 = volume held constant
}
```

**Cost side (engine).** `owner_cost_reprice()` replays the window's real
telemetry:

1. Take every `ai_model_calls` row in the window (real units, real services, real
   stages).
2. Apply `routing` by dropping/adding rows per the policy (e.g.
   `solver.solver_b: hard_only` removes `stage='solver_b'` rows whose question's
   `verification_tier ≠ 'hard'`).
3. Apply `service_swap` / `model_swap` / `rate_override` by re-pricing those
   units against the target rate card. *Unit quantities are held constant* — a
   different model may produce different token counts, and that is stated as a
   limitation, not silently modelled.
4. Apply scenario `discounts` and `fx`.
5. Return totals in the same canonical measure set, at every hierarchy level,
   flagged `simulated: true`.

**Revenue side (Economics).** Re-charges every question at the scenario's
`operations` credit costs, recomputes credit consumption and allowance
exhaustion, re-prices purchases at the scenario's `packages` prices holding
volume constant unless `elasticity ≠ 0`.

**Outputs**: Revenue, AI Cost, Profit, Profit Margin, Credits Consumed, a
per-service cost delta (which capability the change actually moved), and a
plain-language basis line: *"Simulated on 404 questions / 8 purchases from
2026-06-01 to 2026-06-30. Unit quantities held constant across swaps. Demand held
constant."*

**Guardrails**

- Both functions are `STABLE`; no writes possible (§3).
- `owner_cost_reprice()` reads facts, catalog, and rate cards but **never writes
  a `cost_fact`** — a simulation can never contaminate the fact table. Simulated
  results carry `run_id = NULL` and `simulated = true`.
- A `service_swap` to a provider/model with no rate card returns
  `{ ok: false, reason: 'no_rate_card_for_target', target: … }` rather than
  costing it at zero.
- Persistent `SIMULATION — NO PRODUCTION EFFECT` banner; no "Apply" button
  anywhere in the module. A simulated rebinding never writes `service_bindings`.
- Refuses to run if the basis window has no priced telemetry:
  `{ ok: false, reason: 'no_cost_facts_in_window' }`.
- Every scenario output is stamped **Modeled**.

---

## 12. Break-even Analysis (Section 11)

| Output | Formula | Cost input |
|---|---|---|
| Current AI Cost | month total | `owner_cost_metrics('daily')` |
| Current Revenue | recognized revenue for the month | `econ.v_revenue_recognized_daily` |
| Fixed Costs | month total | `platform_cost_entries` |
| Required Revenue | `fixed_costs / (1 − variable_cost_ratio)`, `variable_cost_ratio = ai_cost / revenue` | engine |
| Break-even Point | subscribers needed at current ARPU and current cost-per-subscriber | `v_cost_by_student` |
| Expected Monthly Profit | `revenue − ai_cost − fixed_costs` at current run-rate | engine |
| Expected Annual Profit | monthly run-rate × 12, labelled a projection, with the trailing window named | engine |

Per-package break-even (Section 5) is the more actionable number:
`break_even_credits = package_price_EGP / cost_per_credit_EGP`, where
`cost_per_credit` comes from the engine. All outputs **Modeled**, with the FX
rate and window shown inline.

A service-level companion answers the optimization question directly: *"Judge is
41% of AI cost; halving it moves gross margin from X% to Y%"* — computed from
`v_cost_by_service` shares against the same P&L.

---

## 13. Extensibility — a generic AI economics platform

The module never needs a code change to see a new AI system **or a new
provider**, because nothing above the engine is keyed to an implementation: the
catalog defines capabilities, the engine groups by service/provider/model, and
Economics groups by service. All data, never enumerated in code — the same
pattern `credit_costs` already proves in production.

### 13.1 Adding a new AI capability

| Step | Where | What |
|---|---|---|
| 1 | `ai_catalog.services` | Register the capability (`truth_engine`, `sympy`, `translation`, …) with its category and unit of work |
| 2 | `ai_catalog.providers` | Register the provider, if new |
| 3 | `ai_catalog.service_bindings` | Bind service → provider + model, with `effective_from` |
| 4 | `cost_engine.rate_cards` + `rate_components` | Register the price and billing model. Free/self-hosted registers at `0` |
| 5 | The service's code | Emit `ai_model_calls` rows tagged with `service_code`, `stage`, and `units` |
| 6 | *(only if it charges students)* `credit_costs` | Register the operation, exactly as today |

**Changes required in AI Economics or the dashboard: none.** The capability
appears automatically in Financial Overview, Cost per Service, Service &
Model Analytics, Question Cost Analytics, Package Profitability, Student
Consumption, Lesson Economics, and the Simulator's `service_swap` options.

### 13.2 Changing the provider behind an existing capability

| Step | Where | What |
|---|---|---|
| 1 | `ai_catalog.service_bindings` | Close the old binding (`effective_to`), open the new one |
| 2 | `cost_engine.rate_cards` | Ensure a card exists for the new provider+model |
| 3 | The service's code | Point the call at the new provider — `service_code` **does not change** |

**Changes required in AI Economics or the dashboard: none.** History is
preserved, the service series stays continuous, and the cost impact of the swap
is immediately visible on that series. This is the r3 requirement, discharged.

### 13.3 Worked examples

| Future system | Canonical service | Billing model | Encoding |
|---|---|---|---|
| Truth Engine (LLM verifier) | `truth_engine` | per token | binding → openai/anthropic; units `{input_token, output_token}` |
| Google Vision OCR | `ocr` *(existing)* | per page | new binding → google/`vision-ocr-v2`; unit `page` |
| Azure OCR | `ocr` *(existing)* | per request | new binding → azure; unit `request` |
| SymPy / Python sandbox | `sympy` / `python` | per second or free | provider `self_hosted`, model `n/a`, zero-priced card → `zero_rated` |
| Claude Sonnet as Solver | `solver` *(existing)* | per token | new binding → anthropic/`claude-sonnet-4` + its rate card |
| Embeddings for retrieval | `embedding` | per token | provider + card; unit `input_token` |
| A flat-rate managed verifier | `truth_engine` | fixed monthly | unit `flat_month`, amortized per §8.7 |
| A vision model billing images *and* tokens | `vision` | hybrid | components `image` + `input_token` + `output_token` |

If a service or binding is deployed before its catalog row exists, its calls are
still **priced correctly** (rate cards key on provider+model) and appear in
`owner_cost_health()` as `unregistered` — visible, quantified, correctable by
adding the row. The system degrades loudly, never silently, and never
under-reports spend.

---

## 14. Phased roadmap and deployment order

Deployment order follows the data flow — each layer ships only after the layer it
consumes is proven in production. **The catalog ships first**: it is the
vocabulary every later layer uses, and it is the lowest-risk migration in the
plan (pure schema + seed data, zero production code touched).

```
Phase 1  Architecture             (this document)                    ✔ approved
Phase 2  AI Service Catalog       services · providers · bindings    ← NEW, zero-risk
Phase 3  AI Telemetry             ai_model_calls + emission          ⚠ touches ai-tutor
Phase 4  Cost Engine              rate cards · FX · cost facts · hierarchy
Phase 5  AI Economics analytics   econ views + owner_econ_*
Phase 6  Owner Dashboard          #tab-economics, sections 1–9
Phase 7  Simulator + Break-even   sections 10–11
Phase 8  Completeness & scale     close GAP-3/GAP-5, rollups, backfills
```

Every phase ends at an explicit gate. Nothing proceeds without approval.

### Phase 1 — Architecture *(this document)*

Deliverable: this file. No code, no schema, no deploy.
**Exit:** Owner approves the architecture and answers §15. *(Approved
2026-07-28; revised same day — r2 Cost Engine, r3 Service Catalog.)*

### Phase 2 — AI Service Catalog *(new in r3)*

**Status: ✅ COMPLETE — applied to `igvkyxkmjnkzscqgommj` on 2026-07-28 and
verified (owner-approved, CLAUDE.md §3).**

| Artifact | Path |
|---|---|
| Migration (applied) | `supabase/migrations/20260728_aiecon_p2_service_catalog.sql` |
| Verification | `scripts/verify-ai-catalog.sql` — 14 PASS, 1 WARN (P2-14, see below) |

Live state: 12 services · 1 provider · 9 current bindings. Re-running the seed
is a proven no-op. The only non-PASS is **P2-14**, which cannot be checked from
SQL on this project (the PostgREST exposed-schema list is not in the
authenticator role settings) — confirm by hand in Dashboard → Settings → API →
Exposed schemas that `ai_catalog` is absent.

- Migration: `ai_catalog` schema — `services`, `providers`, `service_bindings`.
  Not exposed to PostgREST; RLS enabled with no policies; no grants to `anon` or
  `authenticated`.
- Seeds the seven services the platform runs today with their nine current
  bindings (§6.3), plus the five registered-ahead services at zero cost, and
  `openai` as the only provider in use.
- No production code is touched. No Edge Function deploy. Nothing reads these
  tables until Phase 3. Rollback is a single `DROP SCHEMA ai_catalog CASCADE`
  (true only until Phase 4 adds a foreign key to `service_bindings`).

**Gate:** CLAUDE.md §3 (migration approved individually) — **met 2026-07-28**.
**Exit:** met — every call site in §5.2 maps to exactly one seeded service and
binding (`verify-ai-catalog.sql` check P2-09 PASS); service list reviewed and
confirmed by the Owner (§15 Q9 — decided 2026-07-28).

**Phase 3 is unblocked.**

### Phase 3 — AI Telemetry ⚠ *the only phase that touches production code*

**Status: ✅ COMPLETE — database applied 2026-07-28; Edge Function deployed and
emitting in production since 2026-07-29. Exit criteria met 2026-07-31.**

Deployment history: v90 was deployed and immediately rolled forward to **v91**
after a Temporal Dead Zone `ReferenceError` (`imagesData` read before its
declaration) broke every request; the telemetry block itself was never at
fault and wrote no partial rows. Later tutor work has since carried the
function to **v95**, with the Phase 3 telemetry path unchanged throughout.

Exit measured over 2026-07-29 11:15 → 2026-07-31 16:43 UTC:

| Criterion | Required | Actual |
|---|---|---|
| Clean production emission | ≥ 48 h | **53.5 h** |
| Volume gate | ≥ 20 student questions | **27** |
| Every `service_code` resolves to a catalog row | yes | **9/9 combinations, 100% registered** |
| Emission errors | — | **0 of 76 rows** |
| p95 response latency | unchanged | no regression observed |

One caveat carried into Phase 4: **100% of those 76 rows are internal
(admin/owner) traffic.** The pipeline is proven; the business numbers are not
yet student numbers.
Reviews: **`phase-3-implementation-review.md`** (plan, risks, rollback),
**`phase-3-telemetry-integrity-review.md`** (7 findings, verdict unqualified),
**`phase-3-deployment-readiness.md`** (checklist, baselines, Go/No-Go),
**`phase-3-deployment-runbook.md`** (the operator runbook for the window),
**`phase-3-post-deployment-report.md`** (report template, blank until executed).

| Artifact | Path |
|---|---|
| Migration | ✅ applied — `supabase/migrations/20260728_aiecon_p3_model_call_telemetry.sql` |
| Edge Function (**not deployed**) | `supabase/functions/ai-tutor/index.ts` — v89 → v90 |
| Verification | `scripts/verify-ai-telemetry.sql` — 15 checks |
| Integrity review | `docs/roadmap/phase-3-telemetry-integrity-review.md` — 7 findings; F1/F2/F3/F5/F6 closed, verdict unqualified |

- Migration: `ai_model_calls` (usage only — no cost columns, `service_code` +
  `stage` + `provider`/`model`). Additive; no existing table altered.
- `ai-tutor/index.ts`: add `recordModelCall()` and call it at the eight sites in
  §5.2, passing the canonical service codes seeded in Phase 2 and mapping
  `resp.usage` into `units`. Fire-and-forget; zero added student latency.
- Backfill: **none.** Historical rows have no usage data; inventing it would
  violate the honest-numbers rule. Pre-Phase-3 periods stay **Blocked**.

**Gates:** CLAUDE.md §3 (migration) · CLAUDE.md §1 + DEPLOY.md §4 (Edge Function
deploy path — never the inline MCP tool) · `validate-ai-tutor-source.sh` +
`smoke-test-ai-tutor.sh` before and after.
**Exit:** ≥ 48 h of clean production emission; per-service row counts match the
expected fan-out in §5.2; every emitted `service_code` resolves to a Phase 2
catalog row; p95 response latency unchanged.

### Phase 4 — Cost Engine

**Status: ✅ COMPLETE — applied to `igvkyxkmjnkzscqgommj` on 2026-07-31 and
verified against production (owner-approved, CLAUDE.md §3).**
Review: **`docs/roadmap/phase-4-implementation-review.md`** (§12 carries the
full production verification results).

| Artifact | Path |
|---|---|
| Migration (applied) | `supabase/migrations/20260731_aiecon_p4_cost_engine.sql` |
| Allocator fix (applied) | `supabase/migrations/20260731_aiecon_p4_fix_work_item_spans_requests.sql` |
| Metadata fix (applied) | `supabase/migrations/20260731_aiecon_p4_cost_target_comment.sql` |
| Verification | `scripts/verify-cost-engine.sql` — 31 checks (P4-01…P4-31), 26 read-only + 5 write-path |

> **Reading the totals after 2026-08-01.** The read-only suite now reports
> **20 PASS + 5 VACUOUS + 1 WARN**, not 25 PASS + 1 WARN. `VACUOUS` means a
> check examined **zero candidate rows** — it is not a failure and nothing
> regressed. `P4-10`, `P4-11`, `P4-20`, `P4-22` and `P4-30` all assert over
> populations that are legitimately empty today (no unpriced facts, no
> shared-cost requests, no `unknown` work items, no `invoice_verified` items).
> Each returns to PASS automatically once its population is non-empty. See
> `verification-framework-closeout.md`.

**Exit criteria — all met against production:**

| Criterion | Result |
|---|---|
| Every telemetry row has one current fact or a stated reason | 76/76, 0 missing |
| Pricing coverage ≥ 99% | **100.00%** |
| Binding resolution ≥ 99% `registered` | **100.00%** |
| Re-running `run_pricing` is a no-op | **0** new facts |
| Service totals reconcile to provider and model totals | all four rollups = **$0.22961425** |
| **Allocation conserves cost exactly (variance = 0)** | **variance 0.00000000** |
| **Allocation byte-identical on re-run** | digest unchanged |
| Rate-card correction supersedes cleanly, priors intact | proven locally (not re-run in production) |
| Shared parent call + follow-up child, no double counting | proven; the follow-up case was found *in production* |
| No cost math outside the engine | `rate_cards` has no `service_code`; telemetry has no money column |

**First production numbers: $0.2296 total** over 76 calls and 33 work items,
all `complete`. tutor 59.2%, solver 17.4%, judge 10.0%, vision 7.2%, ocr 6.0%.
Average **$0.00831 per question**. Verification (solver + judge) accounts for
**27.4%** of spend — the measurable price of the correctness pipeline.

**The first production allocation run failed and failed closed** — zero
work-item facts, zero allocation runs, no partial state. `allocate()` assumed
a question belongs to one request; `reference_resolver` had resolved a
follow-up against an earlier question in a different request, the case §8.8.1
lists. Fixed in `alloc-1.0.1`: a work item is a **question**, and scope is the
transitive closure of requests sharing one.

**Locked business decisions (2026-07-31):** ① OpenAI published prices as
provisional initial rate cards; ② **USD canonical, EGP presentation-only** from
a configurable rate; ③ internal traffic excluded by default with an explicit
include option; ④ `services.cost_target_usd` is a **monthly budget** per
service.

**One input still outstanding:** the rate cards are OpenAI **list prices,
unverified against an invoice**, so every figure reports
`confidence = 'modeled'` and P4-31 WARNs at 100%. No FX rate is seeded, so
EGP is NULL by design. Both are corrected by data plus a `recompute`.

**Phase 5 is unblocked.**

- Migration: `cost_engine` schema — `billing_units`, `rate_cards`,
  `rate_components`, `discount_rules`, `fx_rates`, `cost_runs`, `cost_facts`,
  `allocation_runs`, `question_cost_facts` + indexes. Not exposed to PostgREST.
- Seed the current OpenAI rate cards (`gpt-4o`, `gpt-4o-mini`, `effective_from`
  = Phase 3 go-live) and the first FX rate.
- `run_pricing()` / `recompute()`, scheduling, and the published views:
  `v_cost_facts_current`, the Service → Provider → Model hierarchy, the business
  dimensions, `v_pricing_coverage`.
- **Cost Allocation Engine** (§8.8): `allocate()`, the work-item resolver, the
  five allocation methods, `v_question_cost_current`, and the conservation
  assertion. Allocation runs immediately after each pricing run.
- Owner-gated read RPCs: `owner_cost_metrics`, `owner_cost_service_breakdown`,
  `owner_cost_facts`, `owner_cost_health`, `owner_cost_rate_cards`,
  `owner_cost_reprice`.
- `econ_reader` role and grants (§3.3), if adopted.

**Gate:** migration approval (CLAUDE.md §3).
**Exit:** every Phase 3 telemetry row has exactly one current cost fact or a
stated `unpriced_reason`; pricing coverage ≥ 99%; binding resolution ≥ 99%
`registered`; re-running `run_pricing` is a no-op (idempotence proven); a
deliberate rate-card correction produces a new run that supersedes cleanly and
leaves prior facts intact; service totals reconcile exactly to provider totals
and to model totals; **allocation conserves cost exactly (variance = 0) and is
byte-identical on re-run**; a question with a shared parent call and a follow-up
child allocates without double counting; no cost math exists outside the engine.

### Phase 5 — AI Economics analytics

- `econ` schema + the views in §9.2, joining published engine views only.
- `owner_econ_*` RPCs (`STABLE`, owner-gated), including `owner_econ_coverage()`.
- `scripts/verify-economics-readonly.sh` CI guard, including the §8.10 rule 8
  boundary check and the rule 10 no-provider/model-literal check.

**Gate:** migration approval. **Exit:** every RPC returns `forbidden` for
`admin`/`super_admin`; no `econ` object references a rate card, discount rule, FX
table, provider, or model; guard script green.

### Phase 5 status — ✅ COMPLETE

**Applied to `igvkyxkmjnkzscqgommj` on 2026-07-31 and verified 17/17 at the
Phase 5 gate.** The suite has since grown to 18 checks — P5-17 was added on
2026-08-01 during the Phase 6 M2 closeout.

> **Reading the totals after 2026-08-01.** The suite now reports
> **17 PASS + 1 VACUOUS**, not 18 PASS. `VACUOUS` means a check examined **zero
> candidate rows** and therefore proved nothing — it is not a failure, and
> nothing regressed to cause it. `P5-02b` reads `econ.v_service_economics`,
> which is empty while all telemetry is internal; it printed PASS before and now
> says so honestly. It returns to PASS automatically once that view has rows.
> See `verification-framework-closeout.md`.

| Artifact | Path |
|---|---|
| Migration (applied) | `supabase/migrations/20260731_aiecon_p5_economics.sql` |
| Defect fix (applied) | `supabase/migrations/20260801_aiecon_p5_fix_rpc_count_types.sql` |
| Verification | `scripts/verify-economics.sql` — 18 checks (P5-01…P5-17) |

Exit criteria met: every `owner_econ_*` RPC is `STABLE`, `SECURITY DEFINER`
and owner-gated (7/7); no `econ` object references a rate card, discount rule,
FX table, provider or model — proven from PostgreSQL's dependency graph, not a
grep; and every blocked metric states an explicit reason derived from data.

**Production-only finding: every cost-consuming econ view is currently empty.**
All 76 cost facts are internal, and the econ layer excludes internal traffic by
default (INV-25, decision 3). So `v_service_economics` returns 0 rows and all
383 `v_pnl_daily` rows are blocked with `no_cost_in_period` — even though
$0.2296 of cost exists. Correct under the locked rules, but it means Economics
reports nothing cost-shaped until student traffic arrives.

### Phase 6 — Owner Dashboard, sections 1–9

**Presentation decision LOCKED 2026-07-31** —
`docs/roadmap/phase-6-coverage-scope-decision.md`. The coverage board is a
*diagnostic* surface and reports all observed data; *business* metrics exclude
internal traffic (INV-25). The AI Cost panel renders external first, internal
second as explanatory metadata, total observed last:

```
AI Cost
  External:                                   $X
  Internal (excluded from business metrics):  $Y
  Total Observed:                             $Z
```

Internal is never a KPI — not trended, targeted, ranked, or surfaced in any
`owner_econ_*` figure. `External: $0.00` renders as a measured zero, not `—`.

- `#tab-economics` in `admin.html` — owner-gated tab, render-only, **service-first
  with provider/model as engine-provided drill-down**.
- Confidence-class badges everywhere; **Blocked** KPIs show `—` + reason from
  `owner_econ_coverage()`; engine freshness ("costs current as of HH:MM") in the
  header.
- Date-range filter (Today / 7d / 30d / custom) matching AI Monitor's UX.

**Gate:** none beyond normal review — `admin.html` is not frozen.
**Exit:** every rendered number traces to a named engine or econ view; no write
RPC referenced anywhere in the tab; **grep proves no provider or model literal in
the tab**; adding a service or swapping a provider in the catalog changes the
rendered dashboard with no code edit (verified once, in staging or by review).

#### Phase 6 status — **COMPLETE AND FROZEN** (M1 ✅ M2 ✅ M3 ✅ M4.1 ✅ M4.2 ✅ M4.3 ✅)

Phase 6 was delivered one owner-approved milestone at a time. **All nine
dashboard sections are implemented, applied and gate-verified.** Closed
2026-08-01; see `phase-6-m4-3-closeout.md`.

| Milestone | Scope | Status |
|---|---|---|
| **M1** | Tab shell, owner gate, read-only RPCs, Coverage panel, locked AI Cost presentation, confidence badges, blocked-state rendering | ✅ closed 2026-07-31 |
| **M2** | Financial Overview (1), AI Cost Analytics (2), Revenue Analytics (3) | ✅ closed 2026-08-01 |
| **M3** | Credits Analytics (4), Package Profitability (5), Question Cost Analytics (6) | ✅ closed 2026-08-01 |
| **M4.1** | Lesson Economics (7) | ✅ closed 2026-08-01 |
| **M4.2** | Student Consumption (8) | ✅ closed 2026-08-01 |
| **M4.3** | AI Service & Model Analytics (9) | ✅ closed 2026-08-01 — **final section** |

**Applied migrations**

| Version | Migration | Milestone |
|---|---|---|
| `20260731190337` | `aiecon_p6_coverage_cost_split` | M1 |
| `20260801103847` | `aiecon_p6_m2_pnl_summary` | M2 |
| `20260801105710` | `aiecon_p5_fix_rpc_count_types` | M2 (defect fix) |
| `20260801114601` | `aiecon_p6_m3_operation_mix` | M3 |
| `20260801114637` | `aiecon_p6_m3_credit_summary` | M3 |
| `20260801121050` | `aiecon_p6_m4_lesson_economics` | M4.1 |
| `20260801124707` | `aiecon_p6_m4_2_student_consumption` | M4.2 |
| `20260801124835` | `aiecon_p6_m4_2_student_service_mix` | M4.2 |
| `20260801130230` | `aiecon_p6_m4_2_student_consumption_full_join_fix` | M4.2 (gate fix) |
| `20260801135335` | `aiecon_p6_m4_3_service_quality` | **M4.3** |

**Sixteen `aiecon` migrations applied across Phases 2–6.** The repo holds fifteen
`aiecon` files: M4.2's gate fix was folded into its parent file at the M4.2
closeout rather than kept separate. Every applied version is accounted for.

**M2 release gate.** V1–V8 executed 2026-08-01. V7 failed and uncovered a
**pre-existing Phase 5 defect**: three `owner_econ_*` RPCs declared `bigint`
for a column their view produces as `numeric`, because `sum(bigint)` widens to
`numeric` and a count begins as `count(*)`, which is `bigint`. plpgsql
validates `RETURN QUERY` against `RETURNS TABLE` only at execution, so all
three shipped un-callable on 2026-07-31 and stayed that way until M2's AI Cost
panel became their first consumer. Fixed by casting in the function bodies;
all eight validations then passed. `verify-economics.sql` gained **P5-17**, a
smoke test that *invokes* every `owner_econ_*` RPC — the gap that let this
escape, since the prior checks tested views and function metadata only.

**`admin.html` is built but NOT deployed** — deferred by the owner to a larger
UI milestone. The economics tab exists in the repo and is unreachable in
production until that deploy happens.

**M3 release gate.** V1–V8 executed 2026-08-01; **all eight passed on the first
run**, both regression suites clean. The pre-apply type probe introduced after
M2 caught four instances of the same `sum(bigint) → numeric` defect class in
`owner_econ_credit_summary()` *before* anything was applied, and `P5-17` picked
up both new RPCs automatically because it discovers them from the catalog — two
defences added after one failure, both demonstrably working.

**Locked M3 decision.** `avg_credits_per_question` is **blocked by design**, not
unfinished. The Economics layer has exactly one definition of a question — the
external cost work item — and `public.question_records` must never be used as
its denominator. Full ADR in `phase-6-m3-engineering-review.md` §5a.

**M4.1 release gate.** V1–V8 executed 2026-08-01; all eight passed on the first
run, both regression suites clean. The pre-apply type probe was load-bearing for
the third milestone running — `v_lesson_economics.questions` is `sum(bigint)`,
which widens to `numeric`, so without its `::bigint` cast the RPC would have
raised `42804`.

**Locked M4 decisions (2026-08-01).**
- **Section 9 is a diagnostic surface, not a business metric.** It shows all
  observed AI telemetry including internal traffic, is labelled diagnostic, and
  its numbers never feed any `owner_econ_*` business KPI. INV-25 continues to
  apply to business metrics only. Same principle as the Coverage panel.
- **Lesson display names live in the RPC, not the view.**
  `econ.v_lesson_economics` is not modified; `owner_econ_lesson_economics()`
  joins `taxonomy_subtopics` and exposes the name. Verified byte-identical at
  the gate. The join is `LEFT`, so an unmapped lesson keeps its cost.

**M4.2 release gate — the first gate since M2 to fail, and the lesson is
architectural.** V4 caught that Section 8's row set was driven by
`econ.v_student_economics`, which is itself *revenue FULL JOIN cost*. A student
who consumed credits but had neither revenue nor cost did not exist in it, so a
panel about consumption was hiding 2 of 9 consumers and 4.2% of consumption.

The generalised rule, now twice-learned (M4.1's `LEFT JOIN`, M4.2's
`FULL JOIN`): **a panel's population must be the union of every population it
reports on, never one contributing surface.** Driving a row set off a single
view silently drops whoever that view omits.

It also marks the limit of the pre-apply type probe, which passed cleanly here:
a probe verifies **types, not semantics**. Type checking and reconciliation
checking are separate defences and both are required.

**Locked M4.2 decisions.**
- **No PII in the economics layer.** Student surfaces expose `user_id` only —
  never `full_name` or `email`, and neither function body reads `profiles`.
  Identifying a student belongs in a separate drill-down outside economics.
- **The statistical usage anomaly ships blocked** with
  `insufficient_population` until n ≥ 30, evaluated from data so it unblocks
  with no code change. The deterministic `cost_exceeds_revenue` ships now.
- **One canonical per-student surface.** `owner_econ_student_economics()` was
  extended rather than duplicated; `owner_econ_student_service_mix()` is a
  separate *grain*, not a second definition, and reports no per-student total.
- **`avg_daily_usage` divides by the shared calendar span**, matching
  `owner_econ_credit_summary().avg_daily_burn` — not per-student active days.

**M4.3 release gate.** V1–V8 executed 2026-08-01; **8/8 PASS**. Cost reconciles
to exactly `$0.22961425` and shares total exactly `100.00%` at all three levels;
`owner_cost_service_breakdown` columns 1–8 verified identical in **shape, values
and call-site resolution** across the required `DROP FUNCTION`.

V4e reported FAIL on first run and **the defect was in the assertion, not the
code** — it compared the model-level row count against distinct model *names*
(2) when that branch groups by *(service, provider, model)* (8). No code was
changed.

The gate also found that **`P5-02b` passes vacuously**: it reads
`econ.v_service_economics`, which holds 0 rows because it excludes internal
traffic. Pre-existing since Phase 5. A non-vacuous form was run instead — every
value of all 8 populated econ views vs every provider code and model name,
**890 rows, 0 leaks**. Folding it into `verify-economics.sql` is recommended and
deliberately left out of M4.3's scope.

> **The generalised lesson, now three times learned: a green check is only
> evidence if it could have gone red.** M4.1 caught a vacuous pass, M4.2 a check
> blind to an absent row, M4.3 a check whose input is empty. The pre-apply probe
> and `P5-17` defend against *type* drift; nothing defends against a vacuous
> assertion except reading it and asking what would make it fail.

**Locked M4.3 decisions.**
- **Section 9 is a diagnostic surface, served only by `owner_cost_*` RPCs.** It
  reports all observed telemetry **including internal traffic**, labels itself
  diagnostic on screen, and **its numbers never feed any `owner_econ_*` business
  KPI**. INV-25 governs business metrics only — and remains a *default*, not a
  suggestion: `p_include_internal` still defaults to `false`, so Section 9 opts
  in explicitly rather than changing what every other caller sees.
- **No provider or model identifier enters `econ`, by construction.** Section 9
  exposes `provider_code` and `model`, which INV-13 / P5-02 forbid in `econ`, so
  it is served from `public`. The migration reads only `cost_engine.cost_facts`
  and `public.ai_model_calls`; its body contains **zero** executable `econ.`
  references.
- **Confidence is mapped inline, duplicating `econ.cost_confidence()`,
  deliberately.** The cost layer must not depend on `econ`;
  `owner_cost_metrics()` already carries the same inline mapping. Calling into
  `econ` from a cost-facing RPC would invert the layer dependency.
- **Cost per question is OMITTED at model grain, not blocked.** Work items are
  keyed by service and a question spans several models, so the figure is
  **undefined, not data-limited**. A *blocked* metric promises it will resolve;
  an *omitted* one never will. The inverse of the M3 §5a decision, where the
  metric genuinely was data-limited and blocking was correct.
- **One canonical service-grain surface.** `owner_cost_service_breakdown()` was
  extended 8 → 22 columns rather than duplicated, so no second overlapping
  definition can diverge — the hazard M4.2 hit.

Closeouts: `docs/roadmap/phase-6-m2-closeout.md`,
`docs/roadmap/phase-6-m3-closeout.md`,
`docs/roadmap/phase-6-m4-1-closeout.md`,
`docs/roadmap/phase-6-m4-2-closeout.md`,
`docs/roadmap/phase-6-m4-3-closeout.md`.

### Phase 7 — Simulator + Break-even (sections 10–11)

- `owner_cost_reprice()` scenario support including `service_swap` (engine),
  `owner_econ_simulate()` and `owner_econ_breakeven()` (Economics).
- `platform_cost_entries` + an owner editor for fixed costs and FX (that editor
  writes cost *inputs*, never product pricing — outside this module's read-only
  boundary and called out as such).

**Exit:** simulator refuses to run on windows with no priced facts; a
`service_swap` to an unpriced target refuses rather than costing zero; no
simulated result is ever written to `cost_facts` or `service_bindings`; Net
Profit stays **Blocked** until fixed costs exist.

#### Phase 7 status — **IN PROGRESS** (M1 ❌ **not started** · M2 ✅ complete)

| Milestone | Scope | Status |
|---|---|---|
| **M1** | `owner_cost_reprice()` scenario grammar — `service_swap`, refusal contract | ❌ **NOT IMPLEMENTED** |
| **M2** | `platform_cost_entries` + Net Profit / Net Margin | ✅ **COMPLETE** — 4 migrations, gate 9/9 |
| M3 | Simulator / Break-even RPCs | not started |

##### ⚠ M1 was never implemented — correction to the milestone record

An interim status summary recorded M1 as complete. **It was not started**, and
this was verified against production at the M2 closeout:

| Evidence | Finding |
|---|---|
| Applied `aiecon_p7_*` migrations | **only M2a, M2b, M2c, M2d** — no M1 migration exists |
| `owner_cost_reprice` scenario grammar | still `swap_model_from` / `swap_model_to`; **no `service_swap`, no refusal contract** |
| The M1 defect, re-measured | a swap to a model with **no rate card** still returns **`$0.06758175`** against an actual **`$0.22961425`** |

**The reprice defect is live in production** — it under-reports by 70.6% on an
unpriced swap target, presenting a fictional saving as real. **Contained:**
`owner_cost_reprice` is called by **no client file**, is owner-gated,
`anon`-denied and `STABLE`, so exposure is limited to a direct API caller holding
an owner session. **M1 remains open and is the recommended next milestone.**

##### M2 — applied migrations

| Version | Name | What |
|---|---|---|
| `20260801182954` | `aiecon_p7_m2a_platform_cost_entries` | `public.platform_cost_entries` (8 CHECKs, 2 partial unique indexes, freeze trigger, `REVOKE ALL` + RLS with zero policies), `econ.v_platform_costs_current`, `platform_cost_available()` rewrite |
| `20260801183045` | `aiecon_p7_m2b_net_profit` | `econ.net_block_reason()`, `v_breakeven_inputs` 8 → 12 columns, `owner_econ_net_profit_series/summary()` |
| `20260801183733` | `aiecon_p7_m2c_fix_set_platform_cost_ambiguity` | **fix** — `42702`, qualification only |
| `20260801185207` | `aiecon_p7_m2d_restore_layer_boundary` | **fix** — `cost_engine.to_egp()`; econ stops reading `fx_rates`; writer renamed out of `owner_econ_*` |

**M2 release gate.** V1–V9 executed 2026-08-01; **9/9 PASS** after two defects
were found and fixed. Economics regression **17 PASS + 1 VACUOUS**; Cost Engine
**20 PASS + 5 VACUOUS + 1 WARN** — identical to the M4.3 baseline, no regression.
`platform_cost_entries` holds **0 rows**; every test rolled back. Net Profit is
**blocked on all 14 months**, three ways over — no external AI cost, no FX rate,
no platform data. That is the ruling working, not a defect.

**Locked M2 decisions.**
- **Immutable financial records, Audit Model = Alternative A** (in-row
  supersede). A correction inserts a new revision and marks the previous row
  `is_current = false`; the freeze trigger raises on DELETE unconditionally,
  permits only the supersede columns to change, and makes supersede one-way.
  **`change_reason` is mandatory on every correction**, enforced by CHECK *and*
  by the RPC. `CHECK (amount > 0)` — credit notes are out of scope.
- **The default financial read is the sanctioned view, never the raw table.**
  Measured at the gate: after one correction, `sum(amount)` on the table returns
  an inflated **55.00** while `econ.v_platform_costs_current` returns the correct
  **30.00** from **1** row.
- **Net Profit is MONTHLY only, with no allocation of any kind** — not equal,
  revenue-weighted or AI-cost-weighted. Where data is not measured daily, no
  daily measurement is invented; `v_pnl_daily` is untouched. Two explicit RPCs,
  no grain parameter.
- **No FX shortcut.** A USD entry with no rate makes the whole month NULL and
  blocked; an EGP entry is never offered as a workaround.
- **Namespace rule, now without exception:** `owner_econ_*` (15) and
  `owner_cost_*` (6) are **read-only**; `owner_write_*` (1) mutates.
  `owner_write_platform_cost` is the project's only writer, and its name says so.
- **FX policy lives in `cost_engine`, not `econ`.** `cost_engine.to_egp()` owns
  the rate lookup and the §8.7 month-of-occurrence match; econ consumes a
  converted number and holds no `fx_rates` reference — the same relationship it
  already has with `v_cost_daily.total_cost_egp`.
- **Sibling resolver, not an extension.** `econ.net_block_reason()` composes
  `econ.block_reason()` rather than changing a function four surfaces call.

**The two permanent process lessons M2 earned.** Both are now **standing
requirements**, alongside the pre-apply type probe:

> **1. Every new RPC requires a direct execution probe.** The M2 probe exercised
> the table, the freeze trigger, all eight constraints, the sanctioned view, the
> resolver and both net-profit RPCs — and still shipped a function that raised
> `42702` on every call, because **it never called that function**. Testing the
> tables, triggers and views *around* a function proves nothing about the
> function; `42702`, like `42804`, is raised only at execution.

> **2. Every new JOIN must be checked against the architectural dependency
> boundaries.** `econ.v_breakeven_inputs` joined `cost_engine.fx_rates`, inside
> INV-05's forbidden set — and worse than the edge, **econ was implementing FX
> policy**. The design document, the engineering review *and* the pre-apply probe
> all missed it, because every one of them asked about types and behaviour and
> none asked whether a new JOIN **crossed a forbidden edge**. A dependency edge is
> as much a contract as a column type.

Phase 6 learned that *a green check is only evidence if it could have gone red*.
M2 adds the complement: **a check that was never run is not evidence at all.**

**Both M2 regressions were closed by correcting the architecture, not the
checks** — `P5-01` and `P5-04` stand unmodified.

**Carried forward.** `P5-01` inspects **view → relation** edges, so an econ
object calling a `cost_engine` *function* that touches the price book would not
be caught. Real, and ruled a **separate Verification Framework Enhancement**
rather than M2 scope. There is **no UI for platform cost entry** — RPC-only, by
ruling; the admin interface is a later milestone.

Docs: `docs/roadmap/phase-7-investigation-and-plan.md`,
`phase-7-platform-cost-entries-investigation.md`,
`phase-7-audit-model-investigation.md`, `phase-7-net-profit-investigation.md`,
`phase-7-m2-design-document.md`, `phase-7-m2-engineering-review.md`,
`phase-7-m2d-fix-engineering-review.md`, `phase-7-m2-release-report.md`,
`phase-7-m2-closeout.md`.

### Phase 8 — Completeness & scale

- Close GAP-3: wire `MOCK_EXAM`, `MOCK_TIMER`, `MOCK_PRACTICE`, `FOCUS_SESSION`,
  `WEAKNESS_ANALYSIS` — **requires CLAUDE.md §2 unfreeze** of `mock-exam.html`,
  `focus.html`, `weakness.html` (already scoped in
  `credits-operation-based.md` §4.2).
- Close GAP-5: make refunds append a compensating event instead of deleting the
  usage row.
- Backfill `question_records.topic_id` to raise lesson-economics coverage above
  25%.
- Daily rollup tables for `cost_facts` + retention policy for `ai_model_calls`.
- Optional: cost-of-rework (join `response_feedback` — money spent on answers
  students reported wrong), reported per service.

### Future (not scoped here)

The binding table is descriptive in this design — it records which
provider/model serves each capability. A natural later step is to make it
**prescriptive**: have the AI services *read* their binding at call time, so
switching a provider becomes a data change with no code deploy at all. That is a
runtime-routing change to `ai-tutor` with its own risk profile and approval, and
it is deliberately out of scope until the measurement layer is proven.

---

## 15. Open questions for the Owner

1. **Revenue source of truth** — `payment_requests` (8 rows / 8,542 EGP, what the
   Owner Dashboard shows today) vs `payments` (5 rows / 1,466 EGP, status
   `COMPLETED`). They disagree. **Recommendation: `payment_requests` is
   authoritative; `payments` is legacy and excluded**, with a reconciliation note
   in the module. Confirm?
2. **FX policy** — month-of-occurrence rate (recommended, §8.7) or per-day?
   Either is one resolver line; the choice is recorded in `engine_version`.
3. **Revenue basis for the headline P&L** — collected (cash) or recognized
   (accrual)? **Recommendation: recognized for profit/margin, collected shown
   beside it**, since AI cost accrues daily.
4. **Internal traffic** — confirm admin/owner accounts are excluded by default
   (86% of current usage rows). Founder comps: cost-only, no revenue — report as
   promotional cost?
5. **Historical estimate view** — ~14 months of pre-telemetry questions exist.
   Offer an explicitly-labelled **Modeled** backfill (per-question cost estimated
   from the §5.2 call graph + `adaptive-verification.md`'s per-level estimates),
   or leave pre-Phase-3 periods **Blocked**? **Recommendation: Blocked**, with an
   opt-in "show modeled history" toggle. If adopted, modeled rows are written as
   a separate `cost_run` with `reason='modeled_backfill'` and
   `engine_version='modeled-v1'`, filterable and never mixed with measured facts.
6. **Pricing cadence** — **Recommendation: hourly `run_pricing`**, keeping the
   dashboard within an hour of live at negligible cost. Every-5-minutes is
   available if you want near-real-time.
7. **Rate-card and catalog maintenance surface** — migration-only (auditable,
   slower) or a small owner-editable ops surface (faster, needs its own write
   path outside AI Economics)? **Recommendation: migration-only initially**,
   since provider prices and bindings change a few times a year.
8. **Phase 3 scheduling** — the Edge Function deploy is the only student-facing
   risk in this plan. Deploy outside an exam-prep window?
9. ~~**Service list and granularity**~~ — **DECIDED by the Owner, 2026-07-28.**
   The canonical set is confirmed as `tutor`, `solver`, `judge`, `ocr`,
   `vision`, `difficulty_detector`, `reference_resolver` (live today) plus
   `truth_engine`, `sympy`, `python`, `embedding`, `translation` (registered
   ahead of implementation).
   - **`tutor` stays a single canonical service.** Main answer, follow-up, deep
     explanation, and future tutoring stages are distinguished by `stage`, not
     by separate services. Owner's rationale: preserve one business capability
     rather than splitting it prematurely; if future telemetry shows the stages
     need independent lifecycle management, they can evolve later without
     breaking historical analytics.
   - **`vision` stays separate from `ocr`.** Owner's rationale: different
     capabilities, different business value, different providers, different
     pricing models, and different optimization paths — independent canonical
     services from the beginning.

   *This decision closes the Phase 2 gate. Seeded in
   `supabase/migrations-pending/20260728_aiecon_p2_service_catalog.sql`.*
10. **Cost targets** *(new in r3)* — do you want to set
    `services.cost_target_usd` now (enabling "over target" flags from day one),
    or wait until real per-service costs are visible?
    **Recommendation: wait one month after Phase 4**, then set targets from
    measured baselines rather than guesses.

---

## 16. What this document does not change

No production behaviour was modified, and nothing was deployed. Specifically:

- No migration was created or applied (CLAUDE.md §3).
- No Edge Function was deployed (CLAUDE.md §1 / DEPLOY.md §4).
- No frozen file was touched (CLAUDE.md §2).
- No pricing, credit cost, package price, or billing path was altered.
- No provider, model, or routing decision in `ai-tutor` was changed — the catalog
  in §6 *describes* today's implementation; it does not yet drive it.
- Production access during authoring was **read-only introspection only**
  (`information_schema`, `pg_policies`, `pg_proc`, and aggregate `SELECT`s used
  for the evidence in §4 and §5).

---

## 17. Design Invariants

These are the architectural rules that must hold regardless of how the system is
implemented, extended, or refactored. They are **not** style preferences and
**not** phase-specific. A violation is an architectural defect, not a bug: the
correct response is to change the code back, not to document an exception.

Each invariant states what must be true, what mechanism upholds it, and how a
reviewer or CI job can verify it. Invariants marked *(owner #N)* correspond to
the numbered list in the owner's r4 request; the rest emerged from the design and
are listed for completeness.

### A. Layer boundaries

| ID | Invariant | Enforcement | Verification |
|---|---|---|---|
| **INV-01** | **Telemetry never computes money.** `ai_model_calls` carries usage in units only — no cost, price, currency, or FX column, and no code path in an AI service multiplies a quantity by a price. *(owner #1)* | Column set of `ai_model_calls` (§7.1); rule 2 of §8.10 | CI: assert no `cost`/`price`/`usd`/`egp` column on `ai_model_calls`; grep Edge Function sources for arithmetic on a rate |
| **INV-02** | **The Cost Engine is the single source of truth for all AI cost calculations.** No other component may derive a cost from a rate. *(owner #2)* | `cost_engine` schema owns rate cards, FX, discounts, and both fact tables (§8) | CI: no rate-card or FX reference outside `cost_engine`; review checklist |
| **INV-03** | **Dashboards never implement pricing formulas.** The tab renders values returned by RPCs; it performs no cost arithmetic beyond display formatting. *(owner #4)* | §3.2 layer 4; rule 1 of §8.10 | CI: grep `#tab-economics` for rate/price arithmetic; review |
| **INV-04** | **Dashboard layers consume analytics only.** The UI's entire data surface is `owner_econ_*` and `owner_cost_*`. *(owner #13)* | §3.2 layers 3–4 | CI: the tab references no other RPC, table, or view |
| **INV-05** | **No layer reaches past the layer above it.** Economics reads engine outputs, never rate cards, discounts, FX, or raw telemetry. | `econ_reader` grants (§3.3); rule 8 of §8.10 | Privilege check (permission denied) + CI grep |
| **INV-06** | **Allocation never prices, and pricing never allocates.** The two Cost Engine stages stay separable. | §8.8.2, §8.8.8; rule 14 of §8.10 | Review: no rate lookup inside `allocate()`; no work-item grouping inside `run_pricing()` |

### B. Read-only posture

| ID | Invariant | Enforcement | Verification |
|---|---|---|---|
| **INV-07** | **AI Economics is read-only.** Every Economics and cost-read RPC is `STABLE`; PostgreSQL refuses data modification inside them. *(owner #3)* | §3.2 layer 1 | CI: every `owner_econ_*` / `owner_cost_*` function is `STABLE` and owner-gated |
| **INV-08** | **AI Economics never modifies production state** — not pricing, not credits, not billing, not the catalog, not bindings. *(owner #14)* | §3.1 writer inventory; §3.2 layer 4 | CI: the module references none of the billing/catalog write RPCs |
| **INV-09** | **Simulation never touches production state.** A scenario writes no cost fact, no binding, no rate card, and has no "Apply" path. | §11 guardrails; `STABLE` volatility | CI + review: simulated results carry `run_id = NULL`, `simulated = true` |
| **INV-10** | **Financial data is owner-only.** Cost, revenue, and profit are never exposed below role `owner`. | `has_role_at_least('owner')` in every RPC (§3.2 layer 2) | Test: each RPC returns `forbidden` for `admin` and `super_admin` |

### C. Provider independence

| ID | Invariant | Enforcement | Verification |
|---|---|---|---|
| **INV-11** | **Services are provider-independent.** A canonical service is a capability; its provider and model are a binding that may change at any time without changing the service's identity. *(owner #5)* | `ai_catalog.services` vs `service_bindings` (§6.2–§6.3) | Review: no service code names a vendor |
| **INV-12** | **Provider changes never require dashboard changes.** Swapping a provider is two catalog rows plus a rate card. *(owner #12)* | §6.5; rule 4 of §8.10 | Test: rebinding a service in staging changes the rendered dashboard with zero code edits |
| **INV-13** | **No provider or model literal exists above the Cost Engine.** Not in `econ`, not in an `owner_econ_*` function, not in the dashboard tab. They reach the UI only as data. | Rule 10 of §8.10 | CI: literal grep over `econ` migrations and `#tab-economics` |
| **INV-14** | **Prices attach to models, not capabilities.** Rate cards are keyed on `(provider, api_surface, model)` so one price serves every service that calls it. | §8.4 | Schema: `rate_cards` has no `service_code` column |

### D. Immutability, provenance, reproducibility

| ID | Invariant | Enforcement | Verification |
|---|---|---|---|
| **INV-15** | **Historical costs are immutable.** No fact is ever updated or deleted; corrections are new runs that supersede. *(owner #6)* | `is_current` + partial unique indexes (§8.5, §8.8.7); no `UPDATE` path | CI: no `UPDATE`/`DELETE` on `cost_facts` or `question_cost_facts` anywhere; audit trail present |
| **INV-16** | **Every cost fact traces back to immutable telemetry.** `cost_facts.call_id` → `ai_model_calls.id`, and every Question Cost fact decomposes into the call facts that produced it. *(owner #10)* | FKs + `allocation_runs` provenance (§8.5, §8.8.6) | Test: any fact can be walked back to its source calls |
| **INV-17** | **Every financial metric has explicit data provenance.** Each fact records its binding, rate card, discounts, FX rate and date, engine version, and allocation version. *(owner #15)* | Provenance columns (§8.5, §8.8.6) | Test: `owner_cost_facts()` returns provenance for every row |
| **INV-18** | **Every displayed KPI is reproducible from immutable production data.** Given the same facts and the same versions, the same number results — no hidden state, no client-side derivation, no ad-hoc adjustment. *(owner #9)* | Views + RPCs are pure reads over versioned facts | Test: recompute a rendered KPI from SQL and match exactly |
| **INV-19** | **Cost attribution is deterministic and reproducible.** No randomness, no execution-order dependence, exact `numeric` arithmetic, deterministic remainder assignment. *(owner #11)* | §8.8.4; rule 13 of §8.10 | Test: re-run allocation over an untouched window; output is byte-identical |
| **INV-20** | **Allocation conserves cost exactly.** Σ work-item cost ≡ Σ priced call cost for any window; a mismatch fails the run and keeps the previous allocation current. | §8.8.5; rule 12 of §8.10 | Assertion inside `allocate()`, recorded on `allocation_runs.conserved` |
| **INV-21** | **Attribution is snapshotted at the time of the call** — service, provider, model, plan, internal flag, lesson. Later changes never rewrite past economics. | Snapshot columns (§8.5) | Test: change a student's plan; prior-month package economics is unchanged |

### E. Honest numbers

| ID | Invariant | Enforcement | Verification |
|---|---|---|---|
| **INV-22** | **Actual metrics are never mixed with estimates.** Every figure carries a confidence class (Actual / Derived / Modeled / Blocked) and Modeled values are visually distinct. *(owner #7)* | §3.4; `owner_econ_coverage()` | Review: every rendered KPI has a class; modeled backfills live in a separate `cost_run` |
| **INV-23** | **Unknown values are never displayed as zero.** Unpriced cost is NULL and renders `—` with a reason; `0` means measured-free (`zero_rated`). *(owner #8)* | §8.6 pricing statuses; §3.4 | CI/test: no `COALESCE(cost, 0)` in `econ` or the dashboard |
| **INV-24** | **Incomplete aggregates are labelled, never silently completed.** A Question Cost with any unpriced contributing call is `partial`; with none priced it is `unknown`. | `cost_completeness` (§8.8.6) | Test: unprice one call; the question renders as incomplete, not lower |
| **INV-25** | **Internal traffic is excluded by default and never silently included.** Admin/owner accounts are flagged at call time and filtered unless explicitly requested. | `is_internal` snapshot; `p_include_internal` (§9.6) | Test: default responses exclude internal; the toggle is visible when on |
| **INV-26** | **Catalog or price-book gaps degrade loudly, never silently.** An unregistered binding still prices; a missing rate card yields `unpriced` and a health alert. Neither ever reports `0`. | §6.4, §8.6, `owner_cost_health()` | Test: emit an unknown model; verify unpriced + health surfaces it |
| **INV-27** | **Confidence propagates monotonically downward and is never upgraded by aggregation.** *(owner-locked 2026-07-31, added after the r4 freeze — see §18.)* Every derived figure — cost, revenue, profit, margin, ROI, break-even, any simulator output — carries a confidence class equal to the **worst** class among its inputs. A metric is `actual` only if **every** contributing cost fact is `invoice_verified`; a single `list_price` input makes the whole aggregate `modeled`, at every level, forever upward. | Ordered lattice `blocked < modeled < derived < actual`; combination is `min()` over inputs. Enforced in the data: `cost_facts.price_confidence` → `question_cost_facts.price_confidence` (worst of contributors) → `owner_cost_metrics().confidence` → every `econ` view and `owner_econ_*` RPC | CI: every `econ` view exposing a money column also exposes a confidence column; test: flip one contributing rate card to `list_price` and assert every downstream metric degrades to `modeled`; assert no aggregate reports a class better than its worst input |

### Applying these invariants

- **In review.** A change that touches any layer is checked against this list
  before it is checked against the phase plan.
- **In CI.** `scripts/verify-economics-readonly.sh` mechanizes INV-01, 03, 04,
  05, 07, 08, 13, 15, and 23. The remainder are covered by targeted tests
  introduced with their phase.
- **On conflict.** If an implementation cannot satisfy an invariant, that is a
  signal to stop and escalate under §18 — not to weaken the invariant in passing.

---

## 18. Architecture Freeze

**As of revision r4 (2026-07-28), this architecture is frozen.**

> **Amendment r4.1 — 2026-07-31, owner-locked.** One invariant was added after
> the freeze: **INV-27, confidence propagation**. It was raised by the owner at
> the Phase 4 → Phase 5 boundary, on the evidence that Phase 4 shipped with
> 100% of its cost on unverified list prices. It tightens an existing rule
> (INV-22) rather than changing any layer boundary, responsibility, fact model,
> or public contract, so §18.1 is otherwise untouched. Amending the freeze is
> the escalation path §17 prescribes — "stop and escalate, not weaken the
> invariant in passing" — used here as intended.

The design has been reviewed and approved three times — the base architecture,
the Cost Engine layer, and the Service Catalog abstraction — and now carries an
explicit invariant set. Further architectural iteration has reached diminishing
returns; the remaining risk is in implementation, and the remaining value is in
shipping Phase 2.

### 18.1 What "frozen" covers

| Frozen | Meaning |
|---|---|
| **Layer topology** | AI Service Catalog · AI Telemetry · Cost Engine (Calculation + Allocation) · AI Economics · Owner Dashboard, and the boundaries between them (§1) |
| **Design invariants** | All 27 rules in §17 |
| **Component responsibilities** | What each layer owns and what it must never do |
| **Fact model** | Usage facts, per-call cost facts, and Question Cost facts; their immutability, provenance, and versioning semantics |
| **Public contracts** | The shape of the `owner_econ_*` / `owner_cost_*` surface: owner-gated, `STABLE`, one uniform measure set |
| **Phase order** | Catalog → Telemetry → Cost Engine → Economics → Dashboard → Simulator → Completeness (§14) |

### 18.2 What remains open to implementation judgement

Freezing the architecture does not freeze the code. The following are expected
to be decided, tuned, or changed during implementation without amending this
document:

- Exact column names, types, and precisions; index selection and tuning.
- View and function bodies; query plans; materialization and rollup strategy.
- Scheduling cadence, batch sizes, retention windows.
- Dashboard layout, charting, copy, and interaction design.
- Seed values: which services, providers, bindings, rate cards, FX rates,
  discounts, and cost targets exist — **all of these are data by design**.
- The answers to the ten open questions in §15, which are configuration and
  policy choices, not architecture.

### 18.3 What is explicitly *not* a reason to amend

The architecture was designed so that ordinary growth costs no design work.
None of the following is an architectural change:

| Change | How it is absorbed |
|---|---|
| A new AI provider | catalog row + binding + rate card (§13.2) |
| A new model | binding + rate card |
| A new AI capability (Truth Engine, SymPy, Python, embeddings, translation…) | `services` row + binding + rate card + tagged telemetry (§13.1) |
| A new billing model (per page, per minute, per document, tiered, hybrid) | `billing_units` + `rate_components` (§8.4) |
| A discount, promotion, or negotiated rate | `discount_rules` row (§8.6) |
| A new package, price, or credit operation | existing `plan_definitions` / `credit_costs` paths |
| A new KPI or dashboard section over existing facts | a view + an enum value (§8.10 rule 11) |
| A new cost dimension | a rollup view + an enum value |

If a request can be satisfied by inserting a row, the freeze is working as
intended.

### 18.4 What counts as a fundamental architectural issue

Only these justify reopening the design:

1. **An invariant cannot be upheld** by any reasonable implementation.
2. **A required business question is unanswerable** within the current topology —
   not merely inconvenient, but structurally impossible.
3. **A layer boundary forces a correctness failure** — for example, conservation
   (INV-20) cannot hold for a legitimate cost shape.
4. **A performance or cost characteristic makes a layer unviable** at realistic
   production volume, after the obvious tuning in §18.2 has been tried.
5. **An external constraint invalidates a premise** — a provider billing model
   the unit/rate-component model genuinely cannot express, or a platform change
   that removes a mechanism the design depends on.

Discovering that something is *harder than expected* is not one of these.

### 18.5 Amendment procedure

1. **Stop and document** the issue against the specific invariant or section it
   breaks — with production evidence, in the style of §5.
2. **Propose the minimal amendment** that resolves it, and state which
   invariants it changes, removes, or adds.
3. **Owner approval** is required before any implementation proceeds on the
   affected layer.
4. **Record it** as a new revision (r5…) in the revision-history table at the top
   of this document, and update §17 in the same change.
5. **Re-verify** the CI guards and phase exit criteria the amendment touches.

Work that does not touch the frozen surface continues unblocked during any
amendment discussion.

### 18.6 Effect on the roadmap

The freeze **starts** Phase 2 rather than pausing it. From here the work is:

| Phase | Nature |
|---|---|
| 2 — AI Service Catalog | implementation (pure schema + seed, zero production code) — **✅ complete, applied and verified 2026-07-28** |
| 3 — AI Telemetry | implementation ⚠ the only phase touching the Edge Function — **DB applied 2026-07-28; v90 deployment awaiting Go** |
| 4 — Cost Engine + Allocation | implementation |
| 5 — AI Economics analytics | implementation |
| 6 — Owner Dashboard | implementation |
| 7 — Simulator + Break-even | implementation |
| 8 — Completeness & scale | implementation + the two approvals already identified (CLAUDE.md §2 unfreeze, GAP-5 refund change) |

Nothing above requires further architectural decisions. Phase 2 is ready to
begin on approval, subject to the open questions in §15 — of which only Q9
(service list and granularity) gates Phase 2 itself.
