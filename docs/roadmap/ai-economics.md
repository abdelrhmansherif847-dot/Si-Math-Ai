# AI Economics — Owner Dashboard Module

**Phase 1 deliverable: architecture only. No production logic is modified by this
document.**

| | |
|---|---|
| **Status** | Phase 1 — architecture **approved** 2026-07-28; revised same day to add the Cost Engine layer |
| **Scope** | New **section inside the Owner Dashboard** (`admin.html`), not a standalone page |
| **Posture** | Read-only. Consumes analytics. Never writes pricing, credits, or billing |
| **Date** | 2026-07-28 |
| **Production snapshot** | Project `igvkyxkmjnkzscqgommj`, read-only queries run 2026-07-28 |
| **Related** | `docs/roadmap/credits-operation-based.md`, `docs/roadmap/adaptive-verification.md`, `docs/audit/dashboard-metrics.md` |

**Revision note (r2).** The approved architecture had AI Economics computing cost
directly from telemetry, and had the Edge Function stamping `cost_usd` onto each
telemetry row at write time. Both are superseded here by a dedicated **Cost
Engine** layer (§7) that is the single source of truth for every AI cost
calculation. Telemetry now records *usage only* — no money. Economics now
consumes *cost facts only* — no formulas. Because Phase 2 has not been
implemented, this refinement costs nothing to adopt.

---

## 0. Executive summary

AI Economics is the financial intelligence layer of Zero AI: cost, revenue,
profit, credits, and ROI for every AI operation. AI Monitor answers *"is the AI
healthy?"*; AI Economics answers *"is the AI profitable?"*.

The system is built as five layers, each with one job and a hard boundary:

```
AI Services          emit work        — ai-tutor, OCR, Truth Engine, SymPy, future services
      │
      ▼
AI Telemetry         record usage     — WHAT happened, in units. No money, ever.
      │
      ▼
Cost Engine          price it         — the ONLY place cost is calculated.
      │                                 Produces immutable cost facts.
      ▼
AI Economics         interpret it     — revenue, profit, margin, packages, break-even.
      │                                 Consumes cost facts. Implements no pricing formula.
      ▼
Owner Dashboard      render it        — owner-gated tab in admin.html. Read-only.
```

The blocking finding of this phase is unchanged by the refinement:

> **The platform currently has no AI cost telemetry at all.**
> `ai_usage_logs` is a *credit ledger*, not a *cost ledger*. Across 1,134
> production rows, `estimated_cost_usd` is `0.00` in **100%** of rows,
> `prompt_tokens`/`completion_tokens` are `0` in **100%** of rows, and
> `model_name` is the string `claude-3-5-haiku` in **1,133 of 1,134** rows —
> a client-side hardcode in `chat.html:2399`, while the Edge Function actually
> calls OpenAI `gpt-4o` and `gpt-4o-mini` exclusively.

Every cost-side KPI ("cost per question", "cost by AI model", "profit margin",
"break-even") is therefore **Blocked** today — not "approximate", but
unavailable from production data. The revenue side, by contrast, is largely
**Actual** and can be built immediately.

Document map:

| § | Contents |
|---|---|
| §1–§2 | What the module is; how it plugs into the Owner Dashboard |
| §3 | The read-only guarantee and where writes are permitted |
| §4 | Inventory of production data that exists today |
| §5 | Missing-telemetry register, with evidence |
| §6 | **AI Telemetry layer** — usage capture (cost-free) |
| §7 | **Cost Engine layer** — responsibilities, flow, schema, RPCs, extensibility |
| §8 | **AI Economics layer** — revenue, analytics views, RPC surface |
| §9 | KPI dictionary for all 12 requested sections (Actual/Derived/Modeled/Blocked) |
| §10–§11 | Pricing simulator; break-even analysis |
| §12 | Extensibility contract for future AI systems |
| §13 | Phased roadmap and deployment order |
| §14–§15 | Open questions; what this document does not change |

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

**Boundary between the layers.** Each layer may read the layer directly above it
and nothing further up the stack:

| Layer | Owns | Must never |
|---|---|---|
| AI Services | Doing the work; emitting usage | Compute or store a cost |
| AI Telemetry | Immutable usage records in units | Know a price, a currency, or an FX rate |
| Cost Engine | Rate cards, FX, discounts, all cost math, immutable cost facts | Know revenue, credits, packages-as-revenue, or profit |
| AI Economics | Revenue, credits, profit, margin, packages, break-even | Implement a pricing formula, or read a rate card |
| Owner Dashboard | Rendering, filters, labelling | Compute anything material |

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

Neither writer can touch pricing, credits, or billing: they hold no grants on
`credit_costs`, `profiles`, `payment_requests`, or `plan_definitions`, and they
call none of the billing RPCs.

**AI Economics itself writes nothing at all.** Every economics and cost-read RPC
is `STABLE`.

### 3.2 The five enforcement layers

| # | Layer | Mechanism |
|---|---|---|
| 1 | **Function volatility** | Every economics and cost-read RPC is declared `STABLE`. PostgreSQL refuses `INSERT`/`UPDATE`/`DELETE` inside a non-volatile function and errors at runtime. A write cannot be added later without also flipping the volatility marker to `VOLATILE` — a visible, reviewable one-word diff. |
| 2 | **Authorization** | Each RPC begins with `IF NOT has_role_at_least('owner') THEN RETURN jsonb_build_object('ok', false, 'reason','forbidden')`. Reuses the existing role helper; financial data never reaches an `admin` or `super_admin`. |
| 3 | **Surface isolation** | Analytics views live in the `econ` schema and cost logic in the `cost_engine` schema; **neither is exposed to PostgREST**. The browser cannot select from them and can only call owner-gated RPCs in `public`. |
| 4 | **Client isolation** | The module's JS may reference only `owner_econ_*` and `owner_cost_*` RPCs. It never imports `credit-config.js`, never calls `consume_credits`, `admin_set_credit_cost`, `admin_adjust_credits`, `approve_payment_request`, `reject_payment_request`, or `refund_ai_credit`. |
| 5 | **CI guard** | `scripts/verify-economics-readonly.sh` greps the `#tab-economics` block and the `econ`/`cost_engine` migrations for write verbs and forbidden RPC names, asserts every `owner_*` read RPC is `STABLE` + owner-gated, and asserts that **no object in `econ` references `cost_engine.rate_cards`, `rate_components`, `discount_rules`, or `fx_rates`** (the layer boundary of §7.9). |

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

Every figure the module renders carries a confidence class (§9). A **Blocked**
KPI renders as `—` with a one-line reason. The module never substitutes an
assumption for a missing measurement, and never renders a **Modeled** number in
the same visual style as an **Actual** one.

This rule is now enforced end-to-end rather than at the UI: when the Cost Engine
cannot price a call it writes `pricing_status = 'unpriced'` and a **NULL** cost —
never `0` (§7.6). A zero in this system always means "measured as free", never
"unknown".

---

## 4. Existing data sources (production inventory)

Verified by read-only introspection of `igvkyxkmjnkzscqgommj` on 2026-07-28.
Row counts are live values, not estimates.

### 4.1 Revenue & packages

| Table | Rows | What it gives AI Economics | Caveats |
|---|---|---|---|
| `payment_requests` | 8 (8 approved, 8,542 EGP) | **The revenue fact table.** `user_id, plan_code, amount_egp, status, created_at, reviewed_at` | Manual-payment flow. Approval, not payment, is the event that exists |
| `payments` | 5 (1,466 EGP, status `COMPLETED`) | Legacy/parallel ledger | **Disagrees with `payment_requests`.** Not used by `admin.html`'s revenue panel. Needs an authoritative-source ruling (§14 Q1) |
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
| `credit_costs` | 16 | Per-operation credit price, `active`, `always_charge` | Already the extensibility model to copy (§12) |
| `ai_usage_logs` | 1,134 | One row per *charged* operation: `feature, credits_used, session_id, created_at` | Cost/token/model columns are unpopulated — see §5 |
| `credit_transactions` | 392 | `CONSUME −1,908` · `GRANT +77,500` · `ADMIN_ADJUST +17,000` · `REFUND +15` | **Grants and admin adjustments are not sales.** "Credits sold" must exclude them |

### 4.3 AI operations & taxonomy

| Table | Rows | What it gives | Caveats |
|---|---|---|---|
| `question_records` | 1,169 | The unit of work: `user_id, session_id, created_at, image/images, topic, topic_id, subtopic_id, difficulty, verification_*`, `oai_http_status/oai_error_code` | `topic_id` present on only **295/1,169 (25%)** — canonical-lesson economics is coverage-limited until backfill |
| `question_records.verification_meta` | 593 non-null | `solver_model`, `judge_model`, `pipeline_latency_ms`, `ocr_rerun_count`, `solver_max_tokens`, quality score | **Model attribution exists here** — but no token counts, so it prices nothing |
| `chat_sessions` / `session_questions` | 278 / 477 | Session shape | — |
| `exam_practice_sessions`, `focus_plans`, `focus_tasks`, `study_plans`, `weakness_reports` | 19 / 17 / 316 / 1 / 197 | Volume of non-chat AI products | None of these emit usage or cost rows (§5.3) |
| `analyzer_runs` | 688 | Per-regeneration duration/outcome telemetry | Good precedent: aggregate-only, PII-free, fire-and-forget |
| `response_feedback` | 123 | Student-reported correctness | Feeds cost-of-rework analysis later |

### 4.4 What does **not** exist

- No views or materialized views in `public` — **zero**. The analytics layer is greenfield.
- No table records an upstream model call, its tokens, its latency, or its price.
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

This gap is also the reason the client must never be a telemetry source: the
browser cannot know what the server spent. Under the layered architecture, usage
is recorded only where the provider call is made (§6).

### 5.2 GAP-2 — The unit of billing ≠ the unit of cost *(blocks cost-per-question)*

One student question fans out to as many as **six upstream model calls**. Every
call site in `ai-tutor/index.ts`:

| Stage | Line | Model | `max_tokens` | Fires when |
|---|---|---|---|---|
| Main tutor answer | 3157 | `gpt-4o` if image else `gpt-4o-mini` | 2800 | Every question |
| Difficulty detector v2 | 929 | `gpt-4o-mini` | 10 | Background, when v2 enabled |
| OCR extraction | 1274 | `gpt-4o` | 300 | Image questions |
| OCR ambiguity rerun | 1319 | `gpt-4o` | 300 | OCR confidence < 0.85 |
| Multi-question image detect | 1368 | `gpt-4o` | 1800 | Multi-image uploads |
| Solver A + Solver B | 1528 (×2) | `gpt-4o-mini` @ temp 0.1 / 0.3 | 1200 each | L3 shadow pipeline |
| Judge | 1617 | `gpt-4o` | 500 | L3 shadow pipeline |
| Reference/repeat resolution | 2497 | `gpt-4o` if parent had image else `gpt-4o-mini` | 2200 | Follow-ups referencing an earlier question |

In the last 30 days: **404** questions, **268 (66%)** with images, **334 (83%)**
through the L3 shadow pipeline. So the median question is *not* one model call —
it is roughly four to six, weighted toward the expensive vision model. A single
`ai_usage_logs` row per question can never express this.

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

### 5.8 Register summary

| ID | Gap | Severity | Unblocks |
|---|---|---|---|
| GAP-1 | No token/cost/model telemetry | **Blocker** | Sections 1, 2, 6, 7, 8, 9, 10, 11 |
| GAP-2 | Billing unit ≠ cost unit | **Blocker** | Cost per question, per lesson, per model |
| GAP-3 | 5 operations never metered | High | Section 6 completeness, package economics |
| GAP-4 | Internal traffic dominates | High | All per-student and per-question averages |
| GAP-5 | Refund deletes usage row | Medium | Historical integrity |
| GAP-6 | No FX rate, no fixed costs | Medium | Margin, net profit, break-even |
| GAP-7 | Failure cost unmeasured | Medium | Cost-of-failure, waste analysis |

---

## 6. Layer 2 — AI Telemetry

One principle: **meter where the work actually happens** — at the boundary with
the provider, inside the Edge Function, never in the browser.

Second principle, new in r2: **telemetry records usage, not money.** The
telemetry row answers *"what was consumed?"* in provider-neutral units. It
contains no price, no currency, no FX rate, and no cost column. Pricing is the
Cost Engine's job, and keeping it out of here is what makes historical
re-pricing, multi-provider support, and discount handling possible at all.

### 6.1 `public.ai_model_calls` — the usage ledger

Append-only, one row per upstream service call. Service-role write only; no user
may insert, update, or delete. It never blocks or slows a student response:
writes are batched into `EdgeRuntime.waitUntil()`, exactly like the existing
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

  -- what was invoked -------------------------------------------------------
  provider           text        NOT NULL,   -- 'openai' | 'anthropic' | 'self_hosted' | …
  service            text        NOT NULL,   -- 'ai_tutor' | 'ocr' | 'truth_engine' | 'sympy' | …
  model              text        NOT NULL,   -- 'gpt-4o' | 'gpt-4o-mini' | 'n/a'
  stage              text        NOT NULL,   -- 'tutor_main'|'solver_a'|'solver_b'|'judge'
                                             -- |'ocr_extract'|'ocr_rerun'|'image_detect'
                                             -- |'difficulty_v2'|'reference_resolve'
  operation          text        NULL,       -- credit_costs.feature_name, when applicable

  -- metered usage, in units — the Cost Engine's input ----------------------
  units              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- e.g. {"input_token":5321,"output_token":842,"cached_input_token":2048,"image":1}
  --      {"request":1}                       ← per-request billing
  --      {"second":42}                       ← per-minute/second billing
  --      {"page":3}                          ← per-page OCR
  -- Unit codes are validated against cost_engine.billing_units (§7.4).

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
CREATE INDEX ON public.ai_model_calls (provider, model, created_at DESC);
CREATE INDEX ON public.ai_model_calls (service, stage, created_at DESC);
-- The Cost Engine's work queue is an anti-join against cost_facts over a bounded
-- time window; it is served by (created_at DESC) here plus the partial unique
-- index on cost_facts(call_id) WHERE is_current (§7.5). No extra index needed.
```

Design notes:

- **No `cost_usd`, no `pricing_version`.** *(Changed in r2.)* A cost stamped here
  would be a pricing formula living in the service layer, unversioned and
  impossible to correct. The Cost Engine derives it instead.
- **`units jsonb` is the extensibility hinge.** A new billing model — per image,
  per minute, per page, per document, per GPU-second — is a new unit code, not a
  schema migration and not a code change in Economics.
- **No prompt or completion text.** PII-free by construction, following the
  `analyzer_runs` precedent. Content lives in `question_records`.
- **`request_id` is the join spine.** Cost per question = cost facts grouped by
  `request_id`. The Edge Function already generates a correlation id
  (`newCorrelationId()`, `index.ts:251`) and already receives
  `client_request_id` — one of the two becomes the canonical value.
- **Failures are rows too** (`success = false`) — that is how GAP-7 closes. A
  failed call still reports whatever units the provider billed.
- **Immutability**: `REVOKE UPDATE, DELETE FROM PUBLIC`; no RPC ever mutates it.

Volume: ~4–6 rows per question. At today's 404 questions/30d that is ~70
rows/day; at 1,000 questions/day it is ~5,000 rows/day (~150k/month) — still
small, with daily rollups planned in the completeness phase.

### 6.2 Emission points

`ai-tutor/index.ts` gets one helper — `recordModelCall({...})` — invoked at each
of the eight call sites in §5.2, reading `resp.usage` from the OpenAI response
(`prompt_tokens`, `completion_tokens`, `prompt_tokens_details.cached_tokens`)
and mapping it into `units`. Fire-and-forget: a telemetry failure must never
affect a student response, same contract as `analyzer_runs`.

> ⚠ **Deployment constraint.** `ai-tutor/index.ts` is ~55 KB and
> `mcp__Supabase__deploy_edge_function` **must never** be used for it
> (CLAUDE.md §1 — two production outages on 2026-06-17). The telemetry phase
> deploys via **DEPLOY.md §4 only**, with `scripts/validate-ai-tutor-source.sh`
> and `scripts/smoke-test-ai-tutor.sh` as gates.

Other emitters, as they come online: `study-planner.js` (STUDY_PLAN),
`admin-actions`, and future services (§12).

---

## 7. Layer 3 — Cost Engine

**The Cost Engine is the single source of truth for all AI cost calculations.**
Nothing else in the platform is permitted to multiply a quantity by a price.

### 7.1 Responsibilities

| # | Responsibility | Where it lives |
|---|---|---|
| R1 | Convert raw telemetry into **normalized cost records** | `cost_engine.run_pricing()` → `cost_facts` (§7.5) |
| R2 | Calculate provider cost using **temporal pricing** | `rate_cards.effective_from/to` resolved against the call's own timestamp (§7.4) |
| R3 | Handle **multiple providers** | `(provider, service, model)` rate-card key; provider-neutral units (§7.4) |
| R4 | Handle **different billing models** — per token, per request, per image, per minute, fixed, future | `billing_units` + `rate_components`, incl. tiered/graduated bands (§7.4) |
| R5 | Apply **FX conversion** | `fx_rates`, resolved by the engine's stated policy; USD and EGP both stored (§7.7) |
| R6 | Support **discounts, provider-specific and promotional pricing** | `discount_rules`, applied in a fixed, recorded order (§7.6) |
| R7 | Compute **canonical metrics** (total, per request/question/student/lesson/subject/package/service) | `v_cost_by_*` rollups + one metric API (§7.8) |
| R8 | Produce **immutable cost facts** that downstream systems consume | append-only `cost_facts`, versioned by run (§7.5) |
| R9 | Report its own **coverage and health** | `v_pricing_coverage`, `owner_cost_health()` (§7.6, §7.8) |

Explicitly **not** the Cost Engine's job: revenue, credits, packages-as-revenue,
profit, margin, break-even. It knows what things cost and how to slice that cost;
it does not know whether that was a good deal. That judgement is Economics (§8).

The one deliberate exception is the `package` dimension: "cost per package" is a
cost sliced by the plan a student was on, which the engine can attribute without
knowing what the package sold for. The engine reports the cost; Economics joins
the revenue.

### 7.2 Data flow

```
 (1) AI Service makes a provider call
        │  usage in units, outcome, latency
        ▼
 (2) public.ai_model_calls                          [immutable usage fact]
        │
        │  cost_engine.run_pricing(from, to)        ← scheduled; VOLATILE; service_role
        │     a. claim unpriced calls in window
        │     b. resolve rate card   (provider, service, model, call timestamp)
        │     c. price each unit     (components, tier bands)  → gross_cost_usd
        │     d. apply discounts     (priority order)          → discount_usd
        │     e. net = gross − discount                        → net_cost_usd
        │     f. FX convert by policy                          → net_cost_egp
        │     g. snapshot attribution dims (user, plan, lesson, operation…)
        │     h. write fact, or mark 'unpriced' with NULL cost
        ▼
 (3) cost_engine.cost_facts                         [immutable cost fact]
        │
        ├─► cost_engine.v_cost_facts_current        (latest run per call)
        └─► cost_engine.v_cost_by_{request, question, student, lesson,
                                   subject, package, service, model,
                                   stage, operation, daily}
        │
        ▼
 (4) public.owner_cost_*()  RPCs                    [STABLE · owner-gated]
        │
        ▼
 (5) econ.* views + owner_econ_*()                  [revenue, profit, margin]
        │
        ▼
 (6) admin.html #tab-economics
```

**Timing.** Pricing is asynchronous and idempotent. `run_pricing` prices only
calls with no current fact, so it is safe to run every 5 minutes, hourly, or
on demand. A student request is never in the critical path of a cost
calculation — the engine can be down for a day and lose nothing but freshness.

**Backpressure and freshness.** `owner_cost_health()` reports the lag between the
newest telemetry row and the newest priced fact. The dashboard displays it
("costs current as of HH:MM") so a stale engine is visible rather than silently
under-reporting today's spend.

### 7.3 Schema — overview

All objects live in the `cost_engine` schema, which is **not** exposed to
PostgREST.

| Object | Kind | Purpose |
|---|---|---|
| `providers` | table | Provider registry: display name, default currency, active |
| `services` | table | AI service registry: `ai_tutor`, `ocr`, `truth_engine`, `sympy`, `python`, … |
| `billing_units` | table | Unit vocabulary: `input_token`, `output_token`, `cached_input_token`, `image`, `request`, `second`, `page`, `flat_month`, … |
| `rate_cards` | table | Temporal price header per `(provider, service, model, billing_model)` |
| `rate_components` | table | Per-unit prices for a rate card, with optional tier bands |
| `discount_rules` | table | Provider / promotional / commitment discounts |
| `fx_rates` | table | USD→EGP by date, with source |
| `cost_runs` | table | One row per pricing execution: version, window, counts, reason |
| `cost_facts` | table | **Immutable normalized cost record**, one per (call, run) |
| `v_cost_facts_current` | view | The current fact per call |
| `v_cost_by_*` | views | Canonical metric rollups (§7.8) |
| `v_pricing_coverage` | view | Unpriced calls, missing rate cards, missing FX |
| `run_pricing()` / `recompute()` | function | The only writers (VOLATILE, service_role) |

### 7.4 Rate cards — temporal, multi-provider, multi-billing-model

```sql
CREATE TABLE cost_engine.billing_units (
  unit_code    text PRIMARY KEY,          -- 'input_token' | 'image' | 'request' | 'second' | …
  display_name text NOT NULL,
  description  text NULL
);

CREATE TABLE cost_engine.rate_cards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       text NOT NULL,
  service        text NOT NULL,
  model          text NOT NULL,            -- 'n/a' for model-less services
  billing_model  text NOT NULL,            -- 'per_token'|'per_request'|'per_image'
                                           -- |'per_minute'|'fixed'|'hybrid'
  currency       text NOT NULL DEFAULT 'USD',
  effective_from timestamptz NOT NULL,
  effective_to   timestamptz NULL,         -- NULL = current
  version        text NOT NULL,            -- e.g. 'openai-2026-06'
  source_note    text NULL,                -- provider page + date checked
  UNIQUE (provider, service, model, effective_from)
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

How this covers each billing model without new code:

| Billing model | Encoding |
|---|---|
| Per token | components for `input_token`, `output_token`, `cached_input_token` with `per_qty = 1_000_000` |
| Per request | one component `request`, `unit_price = X`, `per_qty = 1` |
| Per image | one component `image` (add `input_token` too for vision models that bill both) |
| Per minute / second | one component `second`, priced per 60 |
| Per page (OCR) | one component `page` |
| Fixed / subscription | component `flat_month`; the engine amortizes per §7.7 |
| Hybrid | any combination — components simply sum |
| Tiered / graduated | multiple components on the same `unit_code` with `tier_from`/`tier_to` bands |
| Free / self-hosted | a rate card whose components price at `0` — **measured as free**, distinct from unpriced |

**Temporal resolution.** For a call at time `T`, the engine selects the rate card
where `effective_from ≤ T AND (effective_to IS NULL OR T < effective_to)`,
choosing the most specific match (exact model > service default > provider
default) and, on ties, the latest `effective_from`. A mid-month provider price
change is two rows; nothing historical is rewritten.

### 7.5 Cost facts — normalized and immutable

```sql
CREATE TABLE cost_engine.cost_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_version text NOT NULL,          -- bumped when a formula changes
  window_from    timestamptz NOT NULL,
  window_to      timestamptz NOT NULL,
  reason         text NOT NULL,          -- 'scheduled' | 'backfill' | 'rate_card_correction' | …
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

  -- attribution, SNAPSHOT at pricing time (never re-derived later) ----------
  request_id         uuid NOT NULL,
  question_record_id uuid NULL,
  user_id            uuid NULL,
  is_internal        boolean NOT NULL,       -- admin/owner account at time of call
  plan_code          text NULL,              -- the student's package at time of call
  topic_id           text NULL,
  subtopic_id        text NULL,
  operation          text NULL,
  provider           text NOT NULL,
  service            text NOT NULL,
  model              text NOT NULL,
  stage              text NOT NULL,
  success            boolean NOT NULL,

  -- money ------------------------------------------------------------------
  pricing_status     text NOT NULL,          -- 'priced' | 'unpriced' | 'zero_rated'
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
  unpriced_reason    text NULL               -- 'no_rate_card' | 'unknown_unit' | 'no_fx' | …
);

CREATE UNIQUE INDEX ON cost_engine.cost_facts (call_id) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (user_id, occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (question_record_id) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (provider, model, occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (service, occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (plan_code, occurred_at DESC) WHERE is_current;
CREATE INDEX ON cost_engine.cost_facts (topic_id, occurred_at DESC) WHERE is_current;
```

Three properties make these facts trustworthy:

1. **Immutable.** A fact is never updated. Correcting a rate card produces a *new
   run* whose facts supersede the old ones (`is_current` flips on the previous
   row); the superseded row stays for audit. The partial unique index guarantees
   exactly one current fact per call.
2. **Self-describing.** Every fact records the rate card, discounts, FX rate, and
   engine version that produced it. Any number on the dashboard can be traced to
   the exact price list that generated it.
3. **Attribution frozen at the time of the call.** `plan_code`, `is_internal`,
   `topic_id` are snapshotted. A student upgrading next month does not silently
   rewrite last month's package economics.

### 7.6 Pricing algorithm, discounts, and unpriced handling

`run_pricing(p_from, p_to, p_reason)` — deterministic, in this order:

1. **Claim.** Select `ai_model_calls` in `[from, to)` with no current fact.
2. **Resolve rate card** by `(provider, service, model)` against the call's own
   `created_at` (§7.4). No match → write fact with
   `pricing_status='unpriced'`, `unpriced_reason='no_rate_card'`, costs NULL.
3. **Price units.** For each `unit_code` in `units`: find its component(s), apply
   `min_qty`, walk tier bands if present, add
   `qty × unit_price / per_qty`. Unknown unit code → `unpriced`,
   `unpriced_reason='unknown_unit'` (never silently skipped — an unpriced unit
   would understate cost).
   Sum → `gross_cost_usd`. A card that prices everything at 0 yields
   `pricing_status='zero_rated'` with `net_cost_usd = 0` — an explicit
   *measured-free*, not a missing value.
4. **Apply discounts** from `discount_rules`, in ascending `priority`, each rule
   scoped by provider / service / model / operation / date window and typed as
   `percent`, `fixed_usd`, or `free_units`. Rules compose in recorded order and
   each applied rule id is stored on the fact. → `discount_usd`.
5. **Net** = `gross − discount`, floored at 0.
6. **FX** per §7.7 → `net_cost_egp`, `fx_rate`, `fx_rate_date`. No rate for the
   period → EGP stays NULL with `unpriced_reason='no_fx'`; the USD figure remains
   valid and usable.
7. **Snapshot attribution** (§7.5) and write the fact.

```sql
CREATE TABLE cost_engine.discount_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label          text NOT NULL,
  scope_provider text NULL,   -- NULL = any
  scope_service  text NULL,
  scope_model    text NULL,
  scope_operation text NULL,
  discount_type  text NOT NULL,           -- 'percent' | 'fixed_usd' | 'free_units'
  value          numeric(14,6) NOT NULL,
  unit_code      text NULL,               -- for 'free_units'
  effective_from timestamptz NOT NULL,
  effective_to   timestamptz NULL,
  priority       smallint NOT NULL DEFAULT 100,
  note           text NULL
);
```

This covers provider volume discounts, negotiated rates, promotional credits,
and free-tier allowances without any change to Economics — a discount is data.

**The unpriced rule is the engine's contribution to honest numbers.** A brand-new
model appearing in telemetry before its rate card is registered does not silently
cost $0: it lands as `unpriced`, `owner_cost_health()` raises it, and every
affected KPI reports its coverage percentage. Cost is either measured or
declared unknown — never assumed.

### 7.7 FX policy and amortized fixed costs

```sql
CREATE TABLE cost_engine.fx_rates (
  rate_date  date PRIMARY KEY,
  usd_to_egp numeric(10,4) NOT NULL,
  source     text NOT NULL      -- 'manual' | 'cbe' | …
);
```

- **Policy (recommended, §14 Q2):** month-of-occurrence rate — every fact in a
  calendar month converts at that month's rate, so intra-month comparisons are
  not distorted by currency noise. Alternative (per-day rate) is a one-line
  change in the resolver, and the choice is recorded in `engine_version`.
- Both `net_cost_usd` and `net_cost_egp` are stored. USD is the provider truth;
  EGP is the reporting currency alongside revenue. Any mixed-currency figure
  the dashboard shows names its rate and date.
- **Fixed / subscription-priced services** (`flat_month`) are amortized by the
  engine across the month's calls for that service, so a flat-rate verifier still
  produces a per-question cost. The amortization basis (`calls` or `units`) is a
  property of the rate card and is recorded on each fact.

Platform infrastructure spend (Supabase, Vercel, domain, payment fees) is *not* a
per-call cost and stays out of the engine. It lives in
`public.platform_cost_entries` and is applied by Economics at the P&L level
(§8.4).

### 7.8 Canonical metrics and the Cost Engine API

The engine publishes one rollup view per canonical dimension. Each returns the
same measure set — `total_cost_usd`, `total_cost_egp`, `calls`, `requests`,
`units`, `priced_calls`, `unpriced_calls`, `coverage_pct`, `avg_latency_ms`,
`success_rate`, `failed_cost_usd` — so the dashboard renders every dimension
with one component.

| Canonical metric | View | Grain |
|---|---|---|
| Total Cost | `v_cost_daily` | day |
| Cost per Request | `v_cost_by_request` | `request_id` |
| Cost per Question | `v_cost_by_question` | `question_record_id` |
| Cost per Student | `v_cost_by_student` | `user_id` |
| Cost per Lesson | `v_cost_by_lesson` | `subtopic_id` (canonical lesson) |
| Cost per Subject | `v_cost_by_subject` | `topic_id` |
| Cost per Package | `v_cost_by_package` | `plan_code` (snapshotted) |
| Cost per AI Service | `v_cost_by_service` | `service` |
| *(supporting)* Cost per Model / Stage / Operation | `v_cost_by_model`, `v_cost_by_stage`, `v_cost_by_operation` | model / pipeline stage / `feature_name` |

Public RPC surface — all `SECURITY DEFINER`, `STABLE`, owner-gated,
`SET search_path = public, cost_engine`:

| RPC | Purpose |
|---|---|
| `owner_cost_metrics(p_dimension text, p_from date, p_to date, p_include_internal bool, p_limit int)` | The single metric API. `p_dimension ∈ {daily, request, question, student, lesson, subject, package, service, model, stage, operation}`. Returns the uniform measure set above |
| `owner_cost_facts(p_from, p_to, p_filters jsonb, p_limit)` | Fact-level drill-down for a single question/student/model — every row carries its rate card and discounts |
| `owner_cost_health()` | Freshness lag, unpriced counts by reason, missing rate cards, missing FX months, last run summary |
| `owner_cost_rate_cards(p_at timestamptz)` | The price book in force at a moment (read-only; the Owner edits rate cards by migration or a dedicated Cost Engine admin surface, never from AI Economics) |
| `owner_cost_reprice(p_scenario jsonb)` | **Pure what-if.** Re-prices a historical window under hypothetical rate cards / model substitutions / routing policies and returns totals. Writes nothing. This is what the simulator calls (§10) |

Internal, not exposed to PostgREST:

| Function | Volatility | Caller |
|---|---|---|
| `cost_engine.run_pricing(p_from, p_to, p_reason)` | `VOLATILE` | Scheduled job / `service_role` |
| `cost_engine.recompute(p_from, p_to, p_reason)` | `VOLATILE` | Owner-initiated correction; supersedes facts in a new run |

### 7.9 Extensibility rules (Cost Engine)

These are the rules that keep the layering true over time:

1. **All cost math lives in the Cost Engine.** No pricing formula may exist in an
   AI service, in telemetry, in `econ`, in an RPC outside `cost_engine`, or in
   dashboard JavaScript. A multiplication of quantity by price anywhere else is a
   defect.
2. **Telemetry never carries money.** No cost, price, currency, or FX column may
   be added to `ai_model_calls`. If a provider returns a cost directly, it is
   stored in `meta` as a *reconciliation input*, and the engine still computes
   the authoritative figure.
3. **A new billing model is data, not code.** Add a `billing_units` row and
   `rate_components`; do not add a column, a branch, or a special case.
4. **A new provider is a registry row + a rate card.** No engine change.
5. **Never price by omission.** An unresolvable rate card, unit, or FX yields
   `unpriced` with NULL cost. Zero means measured-free (`zero_rated`).
6. **Facts are immutable; corrections are new runs.** Never `UPDATE cost_facts`.
   Any formula change bumps `engine_version` and requires a recompute run to
   apply retroactively — leaving the old facts auditable.
7. **Attribution is snapshotted, never re-derived.** Historical cost attribution
   must not shift when a student changes plan or a taxonomy row is remapped.
8. **Economics reads outputs only.** `econ` objects may reference
   `v_cost_facts_current` and `v_cost_by_*`. Referencing `rate_cards`,
   `rate_components`, `discount_rules`, or `fx_rates` from `econ` is a CI failure
   (§3.2 layer 5) and a permission error under the role setup in §3.3.
9. **One measure set.** Every canonical rollup returns the same measures, so a
   new dimension is a new view plus one enum value in `owner_cost_metrics` — the
   dashboard needs no new rendering code.

---

## 8. Layer 4 — AI Economics

Economics answers the business question. It consumes Cost Engine outputs for
everything cost-shaped, and owns everything revenue-shaped.

### 8.1 Schema layout

```
public.ai_model_calls              ← telemetry facts (append-only, no money)
        │
        ▼
cost_engine.*                      ← rate cards · FX · discounts · cost_facts
        │   (private: rate cards, components, discounts, fx)
        │   (published: v_cost_facts_current, v_cost_by_*)
        ▼
econ.*                             ← revenue views + joins to published cost views
        │   (schema NOT exposed to PostgREST)
        ▼
public.owner_econ_*()              ← SECURITY DEFINER · STABLE · owner-gated
public.owner_cost_*()              ← SECURITY DEFINER · STABLE · owner-gated
        │
        ▼
admin.html #tab-economics          ← render only
```

### 8.2 Views (Economics)

| View | Grain | Purpose |
|---|---|---|
| `econ.v_revenue_events` | approved payment | Normalized revenue fact: user, plan, amount, kind, credits granted |
| `econ.v_revenue_recognized_daily` | day | Deferred revenue spread across `period_days` (§8.3) |
| `econ.v_credit_flow` | day / lifetime | Sold vs granted vs consumed vs refunded vs outstanding |
| `econ.v_pnl_daily` | day | Recognized revenue ⋈ `cost_engine.v_cost_daily` ⋈ platform costs → gross/net profit, margin |
| `econ.v_package_economics` | `plan_code` | Revenue ⋈ `cost_engine.v_cost_by_package` → margins, avg usage, break-even |
| `econ.v_student_economics` | `user_id` | Revenue attribution ⋈ `cost_engine.v_cost_by_student` → profit, abnormal-usage flags |
| `econ.v_lesson_economics` | `topic_id`/`subtopic_id` | Volume + `cost_engine.v_cost_by_lesson`, with coverage flag |
| `econ.v_breakeven_inputs` | month | Section 11 inputs |

Every one of these joins to a **published** cost view. None contains a price, a
rate, or an FX multiplication.

All views default to excluding internal accounts (using the engine's snapshotted
`is_internal` flag); an `include_internal` RPC parameter flips it.

### 8.3 Revenue recognition model

Credits are sold up front and consumed later, so "revenue" is ambiguous unless
defined. Three distinct measures, each labelled in the UI:

1. **Collected revenue** *(Actual)* — `SUM(amount_egp)` of approved
   `payment_requests` in the window. Cash in.
2. **Recognized revenue** *(Derived)* — a subscription is spread straight-line
   across `period_days`; a pack is recognized as its credits are consumed. This
   is the figure that belongs next to AI cost in a P&L, because cost accrues
   daily while cash arrives in lumps.
3. **Credit-attributed revenue** *(Derived)* — for per-question, per-lesson, and
   per-student profit: `revenue_per_credit = amount_egp / credits_granted` at
   purchase, then `question_revenue = credits_charged × revenue_per_credit`.

Excluded from all three: `GRANT` (+77,500) and `ADMIN_ADJUST` (+17,000) credit
transactions, and founder/admin comps. They are cost without revenue and are
reported separately as **Internal / promotional cost**.

### 8.4 Platform (non-AI) costs

```sql
CREATE TABLE public.platform_cost_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,       -- first day of month
  category     text NOT NULL,       -- 'supabase' | 'vercel' | 'domain' | 'payment_fees' | …
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

### 8.5 RPC surface (Economics)

| RPC | Returns |
|---|---|
| `owner_econ_overview(p_from, p_to, p_include_internal)` | Sections 1–4 in one round-trip: financial overview, cost analytics (via engine), revenue analytics, credits analytics |
| `owner_econ_packages(p_from, p_to)` | Section 5 |
| `owner_econ_operations(p_from, p_to)` | Sections 6 + 7 |
| `owner_econ_students(p_from, p_to, p_limit)` | Section 8 |
| `owner_econ_models(p_from, p_to)` | Section 9 *(thin pass-through of `owner_cost_metrics('model', …)` plus revenue context)* |
| `owner_econ_simulate(p_scenario jsonb)` | Section 10 — calls `owner_cost_reprice()` for the cost side |
| `owner_econ_breakeven(p_from, p_to)` | Section 11 |
| `owner_econ_coverage()` | Which KPIs are Actual vs Blocked right now, and why — merges telemetry coverage with `owner_cost_health()` |

`owner_econ_coverage()` is what makes the honest-numbers rule self-maintaining:
the UI asks the database which numbers it is allowed to trust, rather than
hardcoding the answer.

### 8.6 Attribution and exclusion rules

| Rule | Definition | Owner |
|---|---|---|
| **Internal account** | `profiles.is_admin = true` OR role ≥ `admin`, snapshotted at call time. Excluded by default (GAP-4) | Cost Engine snapshots; Economics filters |
| **Cost atom** | `request_id`. Per-question cost = `v_cost_by_question` | Cost Engine |
| **Question → lesson** | `topic_id`/`subtopic_id` snapshotted on the fact; rows without it bucket as `unmapped`, with coverage % shown beside the chart (currently 25%) | Cost Engine |
| **Background cost** | Detector v2, shadow-pipeline, OCR-rerun calls attribute to the question that triggered them, never dropped — real spend | Cost Engine |
| **Failed calls** | Counted in total cost, excluded from "avg cost per successful question", surfaced as `failed_cost_usd` | Cost Engine |
| **Revenue attribution** | §8.3 | Economics |
| **Promotional/internal cost** | Cost with no matching revenue, reported separately | Economics |

---

## 9. KPI dictionary

Confidence classes — extends the legend already used in
`docs/audit/dashboard-metrics.md`:

- **Actual** — direct aggregate over production facts.
- **Derived** — arithmetic over Actual values, using a stated, deterministic rule.
- **Modeled** — depends on an assumption (FX rate, recognition schedule, rate card). Rendered with the assumption inline.
- **Blocked** — no data source exists yet. Renders `—` plus a reason.

"After CE" = once telemetry is emitting **and** the Cost Engine is pricing it.
Cost KPIs now cite the engine view that produces them, not a formula.

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
| Cost per Question | `v_cost_by_question` | Blocked | Actual |
| Cost per Student | `v_cost_by_student` | Blocked | Actual |
| Cost per Lesson | `v_cost_by_lesson` | Blocked | Actual (25% coverage flag) |
| Cost per Subject | `v_cost_by_subject` | Blocked | Actual |
| Cost per Package | `v_cost_by_package` | Blocked | Actual |
| Cost by AI Model | `v_cost_by_model` | Blocked | Actual |
| Cost by AI Service | `v_cost_by_service` | Blocked | Actual |

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
| **Cost per Credit** | `v_cost_daily.total_cost` ÷ credits consumed (the input to package break-even) | Blocked → Derived after CE |

### Section 5 — Package Profitability

| KPI | Source | Now | After CE |
|---|---|---|---|
| Revenue per package | `econ.v_revenue_events` | **Actual** | Actual |
| AI cost per package | `v_cost_by_package` | Blocked | Actual |
| Gross / Net margin | revenue − cost (− fixed costs) | Blocked | Modeled |
| Average usage | credits + questions per subscriber | **Actual** | Actual |
| Break-even point | `price ÷ cost_per_credit` → credits a subscriber may burn before the package loses money | Blocked | Derived |

### Section 6 — Question Cost Analytics

Operation types: Text, Image, OCR, Long Explanation, Mock Exam, Study Plan,
Truth Engine, future features.

| KPI | Source | Now | After CE |
|---|---|---|---|
| Avg cost per operation type | `v_cost_by_operation` | Blocked | Actual for chat/study-plan; **still Blocked for Mock/Focus/Weakness until GAP-3 closes** |
| Cost split by pipeline stage (main / solver / judge / OCR) | `v_cost_by_stage` | Blocked | Actual |
| Cost of failed calls | `failed_cost_usd` measure | Blocked | Actual |

### Section 7 — Lesson Economics

| KPI | Now | After CE |
|---|---|---|
| Most expensive lessons (Functions, Geometry, Statistics, Probability, Algebra…) | Blocked | Actual, coverage-flagged |
| Avg AI cost per canonical lesson | Blocked | Actual (rises with `topic_id` backfill) |
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
| Abnormal-usage flag (e.g. > 3σ, or cost > revenue) | Partial | Derived |

### Section 9 — AI Model Analytics

| KPI | Now | After CE |
|---|---|---|
| Requests, prompt/completion/total tokens, avg tokens per request | Blocked | Actual |
| Avg cost per request / per question | Blocked | Actual |
| Avg latency | Partial — `verification_meta.pipeline_latency_ms` is pipeline-level, not per model call | Actual per call |
| Success / failure rate | Partial — `question_records.oai_http_status` (41 error rows) | Actual per call |
| Pricing coverage % (priced vs unpriced calls) | n/a | Actual — engine health |

### Sections 10–11 — Simulator & Break-even

All outputs **Modeled** by definition; see §10 and §11.

---

## 10. Pricing Simulator (Section 10)

The simulator asks two independent questions, and each goes to the layer that
owns it:

| Question | Answered by |
|---|---|
| "What would this have **cost** under different prices / models / routing?" | `owner_cost_reprice()` — Cost Engine |
| "What would that mean for **revenue, profit, and margin**?" | `owner_econ_simulate()` — Economics |

Economics never re-implements provider pricing to run a scenario. It passes the
scenario to the engine and does business arithmetic on the returned totals.

**Inputs**

```jsonc
{
  "basis_window": { "from": "2026-06-01", "to": "2026-06-30" },

  // ── Cost Engine handles these ──────────────────────────────────────────
  "model_swap": { "gpt-4o": "gpt-4.1" },                 // priced from rate cards
  "rate_override": { "openai:gpt-4o:output_token": 8.0 },// hypothetical price/1M
  "routing":    { "solver_b": "hard_only" },             // stage-level policy
  "discounts":  [ { "scope_provider": "openai", "discount_type": "percent", "value": 10 } ],
  "fx":         { "usd_to_egp": 48.5 },

  // ── Economics handles these ────────────────────────────────────────────
  "packages":   { "PRO_MONTHLY": 450, "PACK_VALUE": 399 },  // EGP overrides
  "operations": { "CHAT_TEXT": 8, "MOCK_EXAM": 35 },        // credit-cost overrides
  "demand":     { "elasticity": 0.0 }                       // 0 = volume held constant
}
```

**Cost side (engine).** `owner_cost_reprice()` replays the window's real
telemetry:

1. Take every `ai_model_calls` row in the window (real units, real stages).
2. Apply `routing` by dropping/adding stage rows per the policy (e.g.
   `solver_b: hard_only` removes `stage='solver_b'` rows whose question's
   `verification_tier ≠ 'hard'`).
3. Apply `model_swap` / `rate_override` by re-pricing those units against the
   target rate card. *Unit quantities are held constant* — a different model may
   produce different token counts, and that is stated as a limitation, not
   silently modelled.
4. Apply scenario `discounts` and `fx`.
5. Return totals and the same canonical measure set, flagged `simulated: true`.

**Revenue side (Economics).** Re-charges every question at the scenario's
`operations` credit costs, recomputes credit consumption and allowance
exhaustion, re-prices purchases at the scenario's `packages` prices holding
volume constant unless `elasticity ≠ 0`.

**Outputs**: Revenue, AI Cost, Profit, Profit Margin, Credits Consumed, plus a
side-by-side delta vs actuals for the same window, and a plain-language basis
line: *"Simulated on 404 questions / 8 purchases from 2026-06-01 to 2026-06-30.
Unit quantities held constant across model swaps. Demand held constant."*

**Guardrails**

- Both functions are `STABLE`; no writes possible (§3).
- `owner_cost_reprice()` reads facts and rate cards but **never writes a
  `cost_fact`** — a simulation can never contaminate the fact table. Simulated
  results carry `run_id = NULL` and `simulated = true`.
- Persistent `SIMULATION — NO PRODUCTION EFFECT` banner; no "Apply" button
  anywhere in the module.
- Refuses to run if the basis window has no priced telemetry, rather than
  simulating on zeros: `{ ok: false, reason: 'no_cost_facts_in_window' }`.
- Every scenario output is stamped **Modeled**.

---

## 11. Break-even Analysis (Section 11)

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

---

## 12. Extensibility — a generic AI economics platform

The module never needs a code change to see a new AI system, because nothing in
it is keyed to today's architecture: the engine groups by `provider`, `service`,
`model`, `stage`, and `operation`, and Economics groups by engine dimensions —
all data, never enumerated in code. This is the same pattern `credit_costs`
already proves in production (a new row appears in the Credits tab
automatically).

**Integration contract for any future AI system** — Truth Engine, OCR, SymPy,
Python execution, new providers, new verifiers, new models:

| Step | Where | What |
|---|---|---|
| 1 | `cost_engine.providers` / `services` | Register the provider and service (one row each, first time only) |
| 2 | `cost_engine.rate_cards` + `rate_components` | Register the price with its billing model and `effective_from`. Free/self-hosted services register at price `0` |
| 3 | The service's code | Emit `ai_model_calls` rows with `provider`, `service`, `model`, `stage`, and `units` |
| 4 | *(only if it charges students)* `credit_costs` | Register the operation, exactly as today |

**Changes required in AI Economics: none.** With those steps the new system
appears automatically in Financial Overview, Cost by Service, Cost by Model,
Question Cost Analytics, Model Analytics, Student Consumption, Package
Profitability, and the Simulator's `model_swap` options.

Worked examples:

| Future system | Billing model | Encoding |
|---|---|---|
| Truth Engine (LLM verifier) | per token | `provider='openai'`, units `{input_token, output_token}` |
| OCR service | per page | unit `page`, one rate component |
| SymPy / Python sandbox | per second or free | unit `second`, or a zero-priced card → `zero_rated` |
| A new provider's model | per token, different rates | new provider row + rate card |
| A flat-rate managed verifier | fixed monthly | unit `flat_month`, amortized per §7.7 |
| A vision model billing images *and* tokens | hybrid | components for `image` + `input_token` + `output_token` |

If a service is deployed before its rate card exists, its calls land as
`unpriced` and appear in `owner_cost_health()` — visible, quantified, and
correctable by registering the card and running a recompute. The system degrades
loudly, never silently.

---

## 13. Phased roadmap and deployment order

Deployment order follows the data flow — each layer ships only after the layer
it consumes is proven in production:

```
Phase 1  Architecture            (this document)                  ✔ approved
Phase 2  AI Telemetry            ai_model_calls + emission        ⚠ touches ai-tutor
Phase 3  Cost Engine             rate cards · FX · cost facts     ← NEW LAYER
Phase 4  AI Economics analytics  econ views + owner_econ_*
Phase 5  Owner Dashboard         #tab-economics, sections 1–9
Phase 6  Simulator + Break-even  sections 10–11
Phase 7  Completeness & scale    close GAP-3/GAP-5, rollups, backfills
```

Every phase ends at an explicit gate. Nothing proceeds without approval.

### Phase 1 — Architecture *(this document)*

Deliverable: this file. No code, no schema, no deploy.
**Exit:** Owner approves the architecture and answers §14. *(Approved 2026-07-28;
revised same day to add the Cost Engine layer.)*

### Phase 2 — AI Telemetry ⚠ *the only phase that touches production code*

- Migration: `ai_model_calls` (usage only — no cost columns). Additive; no
  existing table altered.
- `ai-tutor/index.ts`: add `recordModelCall()` and call it at the eight sites in
  §5.2, mapping `resp.usage` into `units`. Fire-and-forget; zero added student
  latency.
- Backfill: **none.** Historical rows have no usage data; inventing it would
  violate the honest-numbers rule. Pre-Phase-2 periods stay **Blocked**.

**Gates:** CLAUDE.md §3 (migration approved individually) · CLAUDE.md §1 +
DEPLOY.md §4 (Edge Function deploy path — never the inline MCP tool) ·
`validate-ai-tutor-source.sh` + `smoke-test-ai-tutor.sh` before and after.
**Exit:** ≥ 48 h of clean production emission; row counts per stage match the
expected fan-out in §5.2; p95 response latency unchanged.

### Phase 3 — Cost Engine *(new)*

- Migration: `cost_engine` schema — `providers`, `services`, `billing_units`,
  `rate_cards`, `rate_components`, `discount_rules`, `fx_rates`, `cost_runs`,
  `cost_facts` + indexes. Not exposed to PostgREST.
- Seed the current OpenAI rate cards (`gpt-4o`, `gpt-4o-mini`, with
  `effective_from` set to the Phase 2 go-live date) and the first FX rate.
- `run_pricing()` / `recompute()`, plus scheduling (pg_cron or an equivalent
  trigger) and the published views `v_cost_facts_current`, `v_cost_by_*`,
  `v_pricing_coverage`.
- Owner-gated read RPCs: `owner_cost_metrics`, `owner_cost_facts`,
  `owner_cost_health`, `owner_cost_rate_cards`, `owner_cost_reprice`.
- `econ_reader` role and grants (§3.3), if adopted.

**Gate:** migration approval (CLAUDE.md §3).
**Exit:** every Phase 2 telemetry row has exactly one current cost fact or a
stated `unpriced_reason`; pricing coverage ≥ 99%; re-running `run_pricing` is a
no-op (idempotence proven); a deliberate rate-card correction produces a new run
that supersedes cleanly and leaves the prior facts intact; no cost math exists
outside the engine.

### Phase 4 — AI Economics analytics

- `econ` schema + the views in §8.2, joining published engine views only.
- `owner_econ_*` RPCs (`STABLE`, owner-gated), including `owner_econ_coverage()`.
- `scripts/verify-economics-readonly.sh` CI guard, including the §7.9 rule 8
  boundary check.

**Gate:** migration approval. **Exit:** every RPC returns `forbidden` for
`admin`/`super_admin`; no `econ` object references a rate card, discount rule, or
FX table; guard script green.

### Phase 5 — Owner Dashboard, sections 1–9

- `#tab-economics` in `admin.html` — owner-gated tab, render-only.
- Confidence-class badges everywhere; **Blocked** KPIs show `—` + reason from
  `owner_econ_coverage()`; engine freshness ("costs current as of HH:MM") in the
  header.
- Date-range filter (Today / 7d / 30d / custom) matching AI Monitor's UX.

**Gate:** none beyond normal review — `admin.html` is not frozen.
**Exit:** every rendered number traces to a named engine or econ view; no write
RPC referenced anywhere in the tab.

### Phase 6 — Simulator + Break-even (sections 10–11)

- `owner_cost_reprice()` scenario support (engine), `owner_econ_simulate()` and
  `owner_econ_breakeven()` (Economics).
- `platform_cost_entries` + an owner editor for fixed costs and FX (that editor
  writes cost *inputs*, never product pricing — it lives outside this module's
  read-only boundary and is called out as such).

**Exit:** simulator refuses to run on windows with no priced facts; no simulated
result is ever written to `cost_facts`; Net Profit stays **Blocked** until fixed
costs exist.

### Phase 7 — Completeness & scale

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
  students reported wrong).

---

## 14. Open questions for the Owner

1. **Revenue source of truth** — `payment_requests` (8 rows / 8,542 EGP, what
   the Owner Dashboard shows today) vs `payments` (5 rows / 1,466 EGP,
   status `COMPLETED`). They disagree. **Recommendation: `payment_requests` is
   authoritative; `payments` is treated as legacy and excluded**, with a
   reconciliation note in the module. Confirm?
2. **FX policy** — month-of-occurrence rate (recommended, §7.7) or a per-day
   rate? Either is one resolver line; the choice is recorded in
   `engine_version` and shown beside every mixed-currency figure.
3. **Revenue basis for the headline P&L** — collected (cash) or recognized
   (accrual)? **Recommendation: recognized for profit/margin, collected shown
   beside it**, since AI cost accrues daily.
4. **Internal traffic** — confirm admin/owner accounts are excluded by default
   (86% of current usage rows). Founder comps: cost-only, no revenue — report
   them as promotional cost?
5. **Historical estimate view** — the platform has ~14 months of pre-telemetry
   questions. Offer an explicitly-labelled **Modeled** backfill (per-question
   cost estimated from the §5.2 call graph + `adaptive-verification.md`'s
   per-level estimates), or leave pre-Phase-2 periods **Blocked** entirely?
   **Recommendation: Blocked**, with an opt-in "show modeled history" toggle so
   an estimate can never be mistaken for a measurement. If adopted, modeled rows
   are written as a separate `cost_run` with `reason='modeled_backfill'` and
   `engine_version='modeled-v1'`, so they are filterable and never mixed with
   measured facts.
6. **Pricing cadence** — how fresh must cost figures be? **Recommendation:
   hourly `run_pricing`**, which keeps the dashboard within an hour of live at
   negligible cost. Every-5-minutes is available if you want near-real-time.
7. **Rate-card maintenance surface** — provider prices change. Migration-only
   (auditable, slower) or a small owner-editable Cost Engine admin surface
   (faster, needs its own write path outside AI Economics)?
   **Recommendation: migration-only initially**, since prices change a few times
   a year.
8. **Phase 2 scheduling** — the Edge Function deploy is the only student-facing
   risk in this plan. Deploy outside an exam-prep window?

---

## 15. What this document does not change

No production behaviour was modified, and nothing was deployed. Specifically:

- No migration was created or applied (CLAUDE.md §3).
- No Edge Function was deployed (CLAUDE.md §1 / DEPLOY.md §4).
- No frozen file was touched (CLAUDE.md §2).
- No pricing, credit cost, package price, or billing path was altered.
- Production access during authoring was **read-only introspection only**
  (`information_schema`, `pg_policies`, `pg_proc`, and aggregate `SELECT`s used
  for the evidence in §4 and §5).
