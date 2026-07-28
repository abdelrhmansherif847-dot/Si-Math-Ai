# AI Economics — Owner Dashboard Module

**Phase 1 deliverable: architecture only. No production logic is modified by this
document.**

| | |
|---|---|
| **Status** | Phase 1 — architecture proposal, pending owner approval |
| **Scope** | New **section inside the Owner Dashboard** (`admin.html`), not a standalone page |
| **Posture** | Read-only. Consumes analytics. Never writes pricing, credits, or billing |
| **Date** | 2026-07-28 |
| **Production snapshot** | Project `igvkyxkmjnkzscqgommj`, read-only queries run 2026-07-28 |
| **Related** | `docs/roadmap/credits-operation-based.md`, `docs/roadmap/adaptive-verification.md`, `docs/audit/dashboard-metrics.md` |

---

## 0. Executive summary

AI Economics is the financial intelligence layer of Zero AI: cost, revenue,
profit, credits, and ROI for every AI operation. AI Monitor answers *"is the AI
healthy?"*; AI Economics answers *"is the AI profitable?"*.

The blocking finding of this phase:

> **The platform currently has no AI cost telemetry at all.**
> `ai_usage_logs` is a *credit ledger*, not a *cost ledger*. Across 1,134
> production rows, `estimated_cost_usd` is `0.00` in **100%** of rows,
> `prompt_tokens`/`completion_tokens` are `0` in **100%** of rows, and
> `model_name` is the string `claude-3-5-haiku` in **1,133 of 1,134** rows —
> a client-side hardcode in `chat.html:2399`, while the Edge Function actually
> calls OpenAI `gpt-4o` and `gpt-4o-mini` exclusively.

Every cost-side KPI in the request ("cost per question", "cost by AI model",
"profit margin", "break-even") is therefore **Blocked** today — not
"approximate", but unavailable from production data. The revenue side, by
contrast, is largely **Actual** and can be built immediately.

This document therefore delivers, in order:

1. what the module is and how it plugs into the Owner Dashboard (§1–§2),
2. the read-only guarantee and how it is *mechanically* enforced (§3),
3. an inventory of what production data exists today (§4),
4. the missing-telemetry register with evidence (§5),
5. the metering architecture that closes the gap (§6),
6. the analytics layer — schema, views, RPCs (§7),
7. the full KPI dictionary for all 12 dashboard sections, each labelled
   Actual / Derived / Modeled / Blocked (§8),
8. the pricing simulator and break-even design (§9–§10),
9. the extensibility contract for future AI systems (§11),
10. the phased roadmap with approval gates (§12),
11. risks and the decisions the Owner must make (§13).

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

---

## 2. Integration point (mechanics, for Phase 4)

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

The requirement "never modify production pricing / credits / billing" is
enforced at five independent layers. Any one of them failing still leaves the
module unable to write.

| # | Layer | Mechanism |
|---|---|---|
| 1 | **Function volatility** | Every economics RPC is declared `STABLE`. PostgreSQL refuses `INSERT`/`UPDATE`/`DELETE` inside a non-volatile function and errors at runtime. A write cannot be added later without also flipping the volatility marker to `VOLATILE` — a visible, reviewable one-word diff. |
| 2 | **Authorization** | Each RPC begins with `IF NOT has_role_at_least('owner') THEN RETURN jsonb_build_object('ok', false, 'reason','forbidden')`. Reuses the existing role helper; financial data never reaches an `admin` or `super_admin`. |
| 3 | **Surface isolation** | Analytics views live in a dedicated `econ` schema that is **not** exposed to PostgREST. The browser cannot select from them directly; it can only call the owner-gated RPCs. |
| 4 | **Client isolation** | The module's JS may reference only `owner_econ_*` RPCs. It never imports `credit-config.js`, never calls `consume_credits`, `admin_set_credit_cost`, `admin_adjust_credits`, `approve_payment_request`, `reject_payment_request`, or `refund_ai_credit`. |
| 5 | **CI guard** | `scripts/verify-economics-readonly.sh` (Phase 3) greps the `#tab-economics` block and the `econ` migrations for write verbs and the forbidden RPC names, and asserts every `owner_econ_*` function is `STABLE` + owner-gated. Mirrors the existing `scripts/verify-*.sh` pattern. |

**Simulation containment.** The pricing simulator (§9) is a pure function of
(historical facts × scenario parameters). It writes nothing, and its outputs are
rendered inside a persistently visible `SIMULATION — NO PRODUCTION EFFECT`
banner. Saved scenarios, if ever added, live in an owner-scoped `econ.scenarios`
table that no production code path reads.

**Honest-numbers rule.** Every figure the module renders carries a confidence
class (§8). A **Blocked** KPI renders as `—` with a one-line reason ("no model
call telemetry before 2026-08-xx"). The module never substitutes an assumption
for a missing measurement, and never renders a **Modeled** number in the same
visual style as an **Actual** one.

---

## 4. Existing data sources (production inventory)

Verified by read-only introspection of `igvkyxkmjnkzscqgommj` on 2026-07-28.
Row counts are live values, not estimates.

### 4.1 Revenue & packages

| Table | Rows | What it gives AI Economics | Caveats |
|---|---|---|---|
| `payment_requests` | 8 (8 approved, 8,542 EGP) | **The revenue fact table.** `user_id, plan_code, amount_egp, status, created_at, reviewed_at` | Manual-payment flow. Approval, not payment, is the event that exists |
| `payments` | 5 (1,466 EGP, status `COMPLETED`) | Legacy/parallel ledger | **Disagrees with `payment_requests`.** Not used by `admin.html`'s revenue panel. Needs an authoritative-source ruling (§13 Q1) |
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
| `credit_costs` | 16 | Per-operation credit price, `active`, `always_charge` | Already the extensibility model to copy (§11) |
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
- No USD→EGP rate table (revenue is EGP, provider cost is USD).
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
spent on the provider — the refund does not un-spend it. The cost ledger must be
**append-only and immutable**, with refunds recorded as a separate offsetting
event.

### 5.6 GAP-6 — No currency bridge, no fixed costs

Revenue is EGP; provider cost is USD. There is no rate table, so "profit margin"
has no defined arithmetic today. There is also no record of Supabase / Vercel /
domain spend, so *gross* profit is computable once §6 lands but *net* profit is
not.

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

## 6. Metering architecture (Phase 2)

One principle: **meter where the money is actually spent** — at the boundary
with the provider, inside the Edge Function, not in the browser.

### 6.1 `public.ai_model_calls` — the cost ledger

Append-only, one row per upstream model call. Service-role write only; no user
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
  service            text        NOT NULL,   -- 'openai' | 'ocr' | 'truth_engine' | 'sympy' | …
  model              text        NOT NULL,   -- 'gpt-4o' | 'gpt-4o-mini' | …
  stage              text        NOT NULL,   -- 'tutor_main'|'solver_a'|'solver_b'|'judge'
                                             -- |'ocr_extract'|'ocr_rerun'|'image_detect'
                                             -- |'difficulty_v2'|'reference_resolve'
  operation          text        NULL,       -- credit_costs.feature_name, when applicable

  -- usage ------------------------------------------------------------------
  prompt_tokens      integer     NOT NULL DEFAULT 0,
  completion_tokens  integer     NOT NULL DEFAULT 0,
  cached_tokens      integer     NOT NULL DEFAULT 0,
  total_tokens       integer     NOT NULL DEFAULT 0,
  image_count        smallint    NOT NULL DEFAULT 0,

  -- outcome ----------------------------------------------------------------
  success            boolean     NOT NULL,
  http_status        smallint    NULL,
  error_code         text        NULL,
  latency_ms         integer     NULL,

  -- money (snapshot at write time; recomputable from the price book) --------
  cost_usd           numeric(12,6) NOT NULL DEFAULT 0,
  pricing_version    text        NULL,

  meta               jsonb       NULL        -- temperature, max_tokens, tier, …
);

CREATE INDEX ON public.ai_model_calls (created_at DESC);
CREATE INDEX ON public.ai_model_calls (request_id);
CREATE INDEX ON public.ai_model_calls (question_record_id);
CREATE INDEX ON public.ai_model_calls (user_id, created_at DESC);
CREATE INDEX ON public.ai_model_calls (model, created_at DESC);
CREATE INDEX ON public.ai_model_calls (stage, created_at DESC);
```

Design notes:

- **No prompt or completion text.** PII-free by construction, following the
  `analyzer_runs` precedent. Content lives in `question_records`.
- **`request_id` is the join spine.** Cost per question = `SUM(cost_usd) GROUP BY
  request_id`. The Edge Function already generates a correlation id
  (`newCorrelationId()`, `index.ts:251`) and already receives
  `client_request_id` — one of the two becomes the canonical value.
- **`cost_usd` is a snapshot**, priced at write time from the price book, so a
  later price change never silently rewrites history. `pricing_version` makes it
  auditable, and the price book allows recomputation for what-if analysis.
- **Failures are rows too** (`success = false`) — that is how GAP-7 closes.
- **Immutability**: `REVOKE UPDATE, DELETE FROM PUBLIC`; no RPC ever mutates it.
  A refund appends a compensating `credit_transactions` row; it does not delete
  the cost fact.

Volume: ~4–6 rows per question. At today's 404 questions/30d that is ~70
rows/day; at 1,000 questions/day it is ~5,000 rows/day (~150k/month) — still
small, with daily rollups planned in Phase 6.

### 6.2 `public.ai_model_pricing` — the price book

```sql
CREATE TABLE public.ai_model_pricing (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service                  text NOT NULL,
  model                    text NOT NULL,
  input_usd_per_1m         numeric(12,4) NOT NULL,
  cached_input_usd_per_1m  numeric(12,4) NULL,
  output_usd_per_1m        numeric(12,4) NOT NULL,
  per_call_usd             numeric(12,6) NOT NULL DEFAULT 0,  -- non-token services
  effective_from           timestamptz NOT NULL,
  effective_to             timestamptz NULL,                  -- NULL = current
  pricing_version          text NOT NULL,
  source_note              text NULL,                         -- provider page + date
  UNIQUE (service, model, effective_from)
);
```

Temporal by design: a mid-month provider price change splits into two rows, and
historical rows keep costing at the price that actually applied. This table is
maintained by the Owner (Credits-tab-style editor or migration) — AI Economics
only reads it.

### 6.3 `public.fx_rates` — the currency bridge

```sql
CREATE TABLE public.fx_rates (
  rate_date  date PRIMARY KEY,
  usd_to_egp numeric(10,4) NOT NULL,
  source     text NOT NULL     -- 'manual' | 'cbe' | …
);
```

Provider cost is USD, revenue is EGP. Every mixed-currency figure names its
basis: *"Margin computed at 1 USD = X.XX EGP (rate of YYYY-MM-DD)"*. Without a
rate for a period, margin renders as **Blocked**, not guessed.

### 6.4 `public.platform_cost_entries` — fixed costs (for *net* profit)

```sql
CREATE TABLE public.platform_cost_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,       -- first day of month
  category    text NOT NULL,        -- 'supabase' | 'vercel' | 'domain' | 'payment_fees' | …
  amount      numeric(12,2) NOT NULL,
  currency    text NOT NULL DEFAULT 'USD',
  note        text NULL,
  UNIQUE (period_month, category)
);
```

Owner-entered. Gross profit needs only §6.1–§6.3; **net** profit needs this.
Until it is populated, Net Profit and Net Margin render as **Blocked** — the
module must not silently report gross as net.

### 6.5 Emission points

`ai-tutor/index.ts` gets one helper — `recordModelCall({...})` — invoked at each
of the eight call sites in §5.2, reading `resp.usage` from the OpenAI response
(`prompt_tokens`, `completion_tokens`, `prompt_tokens_details.cached_tokens`).
It is fire-and-forget: a telemetry failure must never affect a student response,
same contract as `analyzer_runs`.

> ⚠ **Deployment constraint.** `ai-tutor/index.ts` is ~55 KB and
> `mcp__Supabase__deploy_edge_function` **must never** be used for it
> (CLAUDE.md §1 — two production outages on 2026-06-17). Phase 2 deploys via
> **DEPLOY.md §4 only**, with `scripts/validate-ai-tutor-source.sh` and
> `scripts/smoke-test-ai-tutor.sh` as gates.

Other emitters, as they come online: `study-planner.js` (STUDY_PLAN),
`admin-actions`, and future services (§11).

---

## 7. Analytics layer

### 7.1 Schema layout

```
public.ai_model_calls          ← facts (append-only)
public.ai_model_pricing        ← price book
public.fx_rates                ← currency
public.platform_cost_entries   ← fixed costs
        │
        ▼
econ.*  (views — NOT exposed to PostgREST)
        │
        ▼
public.owner_econ_*()          ← SECURITY DEFINER · STABLE · owner-gated RPCs
        │
        ▼
admin.html #tab-economics      ← render only
```

### 7.2 Views

| View | Grain | Purpose |
|---|---|---|
| `econ.v_model_calls_costed` | model call | Facts joined to the effective price row; the base every other view builds on |
| `econ.v_cost_daily` | day | Today's / this month's AI cost, trend series |
| `econ.v_cost_by_model` | model × day | Section 9 (requests, tokens, avg cost, latency, success/failure) |
| `econ.v_cost_by_stage` | stage × day | Where money goes inside the pipeline (solver vs judge vs OCR) |
| `econ.v_cost_by_operation` | `credit_costs.feature_name` | Section 6 — cost per operation type |
| `econ.v_question_cost` | `question_record_id` | Cost per question, the atom of sections 2, 7, 8 |
| `econ.v_lesson_economics` | `topic_id` / `subtopic_id` | Section 7 — canonical-lesson cost (coverage-flagged, §4.3) |
| `econ.v_student_economics` | `user_id` | Section 8 — credits, cost, revenue, profit, daily usage; internal accounts flagged |
| `econ.v_revenue_events` | approved payment | Normalized revenue fact: user, plan, amount, kind, credits granted |
| `econ.v_revenue_recognized_daily` | day | Deferred revenue spread across `period_days` (§7.4) |
| `econ.v_credit_flow` | day / lifetime | Sold vs granted vs consumed vs refunded vs outstanding |
| `econ.v_package_economics` | `plan_code` | Section 5 — revenue, cost, margins, avg usage, break-even |
| `econ.v_breakeven_inputs` | month | Section 11 inputs |

All views default to `WHERE NOT is_internal_account` (see §7.5); an
`include_internal` RPC parameter flips it.

### 7.3 RPC surface (the module's entire API)

| RPC | Returns |
|---|---|
| `owner_econ_overview(p_from date, p_to date, p_include_internal bool)` | Sections 1–4 in one round-trip: financial overview, cost analytics, revenue analytics, credits analytics |
| `owner_econ_packages(p_from, p_to)` | Section 5 |
| `owner_econ_operations(p_from, p_to)` | Sections 6 + 7 |
| `owner_econ_students(p_from, p_to, p_limit)` | Section 8 |
| `owner_econ_models(p_from, p_to)` | Section 9 |
| `owner_econ_simulate(p_scenario jsonb)` | Section 10 |
| `owner_econ_breakeven(p_from, p_to)` | Section 11 |
| `owner_econ_coverage()` | Telemetry-coverage report: which KPIs are Actual vs Blocked *right now*, and why |

Every one: `SECURITY DEFINER`, `STABLE`, `SET search_path = public, econ`,
owner-gated, `REVOKE ALL FROM public` + `GRANT EXECUTE TO authenticated`.
`owner_econ_coverage()` is what makes the honest-numbers rule self-maintaining:
the UI asks the database which numbers it is allowed to trust, rather than
hardcoding the answer.

### 7.4 Revenue recognition model

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

### 7.5 Attribution and exclusion rules

| Rule | Definition |
|---|---|
| **Internal account** | `profiles.is_admin = true` OR role ≥ `admin`. Excluded by default (GAP-4) |
| **Cost atom** | `request_id`. Per-question cost = `SUM(cost_usd)` over its model calls |
| **Question → lesson** | `question_records.topic_id` / `subtopic_id`; rows without it are bucketed as `unmapped` and the coverage % is shown beside the chart (currently 25%) |
| **Question → operation** | `ai_model_calls.operation`, falling back to the `ai_usage_logs` row for the same session/time window for pre-Phase-2 rows |
| **Background cost** | Detector v2, shadow-pipeline, and OCR-rerun calls are attributed to the question that triggered them, never dropped — they are real spend |
| **Failed calls** | Counted in cost, excluded from "avg cost per successful question", reported separately as waste |

---

## 8. KPI dictionary

Confidence classes — extends the legend already used in
`docs/audit/dashboard-metrics.md`:

- **Actual** — direct aggregate over production facts.
- **Derived** — arithmetic over Actual values, using a stated, deterministic rule.
- **Modeled** — depends on an assumption (FX rate, recognition schedule, price book). Rendered with the assumption inline.
- **Blocked** — no data source exists yet. Renders `—` plus a reason.

"After Phase 2" = once `ai_model_calls` is emitting.

### Section 1 — Financial Overview

| KPI | Formula | Source | Now | After Ph2 |
|---|---|---|---|---|
| Today's AI Cost | `SUM(cost_usd) WHERE created_at ≥ today` | `ai_model_calls` | Blocked | Actual |
| Monthly AI Cost | same, month-to-date | `ai_model_calls` | Blocked | Actual |
| Total Revenue (collected) | `SUM(amount_egp) WHERE status='approved'` | `payment_requests` | **Actual** | Actual |
| Recognized Revenue | straight-line over `period_days` | `payment_requests` × `plan_definitions` | Derived | Derived |
| Gross Profit | `recognized_revenue_EGP − ai_cost_USD × fx` | above + `fx_rates` | Blocked | Modeled (FX stated) |
| Net Profit | `gross − platform_costs − payment_fees` | + `platform_cost_entries` | Blocked | Modeled |
| Profit Margin | `gross_profit / recognized_revenue` | derived | Blocked | Modeled |
| Active Subscribers | `COUNT(*) WHERE plan_code≠'FREE' AND subscription_expires_at > now()` | `profiles`/`subscriptions` | **Actual** | Actual |

### Section 2 — AI Cost Analytics

| KPI | Formula | Now | After Ph2 |
|---|---|---|---|
| Cost per Question | `SUM(cost_usd) / COUNT(DISTINCT request_id)` | Blocked | Actual |
| Cost per Student | `SUM(cost_usd) / COUNT(DISTINCT user_id)` (internal excluded) | Blocked | Actual |
| Cost per Lesson | group by `topic_id`/`subtopic_id` | Blocked | Actual (25% coverage flag) |
| Cost per Subject | group by `topic_id` | Blocked | Actual |
| Cost per Package | student cost rolled up by `plan_code` | Blocked | Derived |
| Cost by AI Model | group by `model` | Blocked | Actual |

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

### Section 5 — Package Profitability

| KPI | Formula | Now | After Ph2 |
|---|---|---|---|
| Revenue per package | group by `plan_code` | **Actual** | Actual |
| AI cost per package | cost of that package's students in period | Blocked | Derived |
| Gross / Net margin | revenue − cost (− fixed costs) | Blocked | Modeled |
| Average usage | credits + questions per subscriber | **Actual** | Actual |
| Break-even point | `price / avg_cost_per_credit` → credits a subscriber may burn before the package loses money | Blocked | Derived |

### Section 6 — Question Cost Analytics

Operation types: Text, Image, OCR, Long Explanation, Mock Exam, Study Plan,
Truth Engine, future features.

| KPI | Now | After Ph2 |
|---|---|---|
| Avg cost per operation type | Blocked | Actual for chat/study-plan; **still Blocked for Mock/Focus/Weakness until GAP-3 closes** |
| Cost split by pipeline stage (main / solver / judge / OCR) | Blocked | Actual |
| Cost of failed calls | Blocked | Actual |

### Section 7 — Lesson Economics

| KPI | Now | After Ph2 |
|---|---|---|
| Most expensive lessons (Functions, Geometry, Statistics, Probability, Algebra…) | Blocked | Actual, coverage-flagged |
| Avg AI cost per canonical lesson | Blocked | Actual (rises with `topic_id` backfill) |
| Question volume by lesson | **Actual today** — 90-day: Algebra 289, Geometry 88, Statistics 68, Probability & Ratios 55, Functions 32 | Actual |

### Section 8 — Student Consumption Analytics

| KPI | Now | After Ph2 |
|---|---|---|
| Credits used per student | **Actual** | Actual |
| AI cost per student | Blocked | Actual |
| Revenue per student | **Actual** | Actual |
| Profit per student | Blocked | Modeled (FX) |
| Avg cost per question | Blocked | Actual |
| Avg daily usage | **Actual** | Actual |
| Abnormal-usage flag (e.g. > 3σ, or cost > revenue) | Partial | Derived |

### Section 9 — AI Model Analytics

| KPI | Now | After Ph2 |
|---|---|---|
| Requests, prompt/completion/total tokens, avg tokens per request | Blocked | Actual |
| Avg cost per request / per question | Blocked | Actual |
| Avg latency | Partial — `verification_meta.pipeline_latency_ms` is pipeline-level, not per model call | Actual per call |
| Success / failure rate | Partial — `question_records.oai_http_status` (41 error rows) | Actual per call |

### Sections 10–11 — Simulator & Break-even

All outputs **Modeled** by definition; see §9 and §10.

---

## 9. Pricing Simulator (Section 10)

A pure function over history. Never writes; never reads live pricing as an
output target.

**Inputs**

```jsonc
{
  "basis_window": { "from": "2026-06-01", "to": "2026-06-30" },
  "packages":   { "PRO_MONTHLY": 450, "PACK_VALUE": 399 },      // EGP overrides
  "operations": { "CHAT_TEXT": 8, "MOCK_EXAM": 35 },            // credit-cost overrides
  "model_swap": { "gpt-4o": "gpt-4.1" },                        // priced from ai_model_pricing
  "routing":    { "solver_b": "hard_only" },                    // stage-level policy
  "fx":         { "usd_to_egp": 48.5 },
  "demand":     { "elasticity": 0.0 }                           // 0 = volume held constant
}
```

**Engine.** Replays the basis window's real facts:

1. Take every `ai_model_calls` row in the window (real tokens, real stages).
2. Apply `model_swap` by re-pricing those tokens with the target model's price
   book row. *Token counts are held constant* — a different model may produce
   different token counts, and that is stated as a limitation, not silently
   modelled.
3. Apply `routing` by dropping/adding stage rows per the policy (e.g.
   `solver_b: hard_only` removes `stage='solver_b'` rows whose question's
   `verification_tier ≠ 'hard'`).
4. Re-charge every question at the scenario's `operations` credit costs; recompute
   credit consumption and how many students would exhaust their allowance.
5. Re-price purchases at the scenario's `packages` prices, holding purchase
   volume constant unless `elasticity ≠ 0`.

**Outputs**: Revenue, AI Cost, Profit, Profit Margin, Credits Consumed, plus a
side-by-side delta vs actuals for the same window, and a plain-language basis
line: *"Simulated on 404 questions / 8 purchases from 2026-06-01 to 2026-06-30.
Token counts held constant across model swaps. Demand held constant."*

**Guardrails**

- Function is `STABLE`; no writes possible (§3).
- Persistent `SIMULATION — NO PRODUCTION EFFECT` banner; no "Apply" button
  anywhere in the module.
- Refuses to run if the basis window has no cost telemetry, rather than
  simulating on zeros: `{ ok: false, reason: 'no_cost_telemetry_in_window' }`.
- Every scenario output is stamped **Modeled**.

---

## 10. Break-even Analysis (Section 11)

| Output | Formula |
|---|---|
| Current AI Cost | `SUM(cost_usd) × fx` for the month |
| Current Revenue | recognized revenue for the month |
| Fixed Costs | `platform_cost_entries` for the month |
| Required Revenue | `fixed_costs / (1 − variable_cost_ratio)`, where `variable_cost_ratio = ai_cost / revenue` |
| Break-even Point | subscribers needed at current ARPU and current cost-per-subscriber |
| Expected Monthly Profit | `revenue − ai_cost − fixed_costs` at current run-rate |
| Expected Annual Profit | monthly run-rate × 12, labelled a projection, with the trailing window named |

Per-package break-even (Section 5) is the more actionable number:
`break_even_credits = package_price_EGP / (avg_cost_per_credit_USD × fx)` — the
credits a subscriber can burn before that package stops making money. All
outputs **Modeled**, with the FX rate and window shown inline.

---

## 11. Extensibility — a generic AI economics platform

The module must never need a code change to see a new AI system. It doesn't,
because nothing in it is keyed to today's architecture: it groups by `service`,
`model`, `stage`, and `operation` — all data, never enumerated in code. This is
the same pattern `credit_costs` already proves in production (a new row appears
in the Credits tab automatically).

**Integration contract for any future AI system** — Truth Engine, OCR, SymPy,
Python execution, Cost Engine, new verifiers, new models:

1. **Register the price** — one row in `ai_model_pricing`
   (`service`, `model`, per-token or `per_call_usd`, `effective_from`).
2. **Emit the call** — one `recordModelCall({ service, model, stage, request_id, … })`
   per upstream invocation.
3. *(Only if it charges students)* **Register the operation** — one row in
   `credit_costs`, exactly as today.

That is the whole contract. With those three, the new system appears
automatically in Financial Overview, Cost by Model, Question Cost Analytics,
Model Analytics, Student Consumption, and the Simulator's `model_swap` options.

Non-token services fit too: OCR-per-page or a SymPy call priced at
`per_call_usd` costs correctly with `prompt_tokens = 0`. A local/self-hosted
verifier registers at `per_call_usd = 0` and still shows up in volume, latency,
and success-rate reporting — measurable even when free.

A small `ai_service_registry` (display name, category, colour) is optional
polish; absent a row, the UI humanizes the raw `service`/`model` string, exactly
as the Credits tab does for `feature_name` today.

---

## 12. Phased roadmap

Every phase ends at an explicit gate. Nothing proceeds without approval.

### Phase 1 — Architecture *(this document)*

Deliverable: this file. No code, no schema, no deploy.
**Exit:** Owner approves the architecture and answers §13.

### Phase 2 — Metering foundation ⚠ *the only phase that touches production code*

- Migration: `ai_model_calls`, `ai_model_pricing` (seeded with current OpenAI
  prices), `fx_rates`. Additive; no existing table altered.
- `ai-tutor/index.ts`: add `recordModelCall()` and call it at the eight sites in
  §5.2. Fire-and-forget; zero added student latency.
- Backfill: **none.** Historical rows have no token data; inventing it would
  violate the honest-numbers rule. Pre-Phase-2 periods stay **Blocked**.

**Gates:** CLAUDE.md §3 (migration approved individually) · CLAUDE.md §1 +
DEPLOY.md §4 (Edge Function deploy path — never the inline MCP tool) ·
`validate-ai-tutor-source.sh` + `smoke-test-ai-tutor.sh` before and after.
**Exit:** ≥ 48 h of clean production emission; row counts per stage match
expected fan-out; p95 response latency unchanged.

### Phase 3 — Analytics layer (read-only)

- `econ` schema + the views in §7.2, not exposed to PostgREST.
- `owner_econ_*` RPCs (`STABLE`, owner-gated), including `owner_econ_coverage()`.
- `scripts/verify-economics-readonly.sh` CI guard.

**Gate:** migration approval. **Exit:** every RPC returns `forbidden` for
`admin`/`super_admin`; a write attempt inside any RPC fails at runtime by
construction; guard script green.

### Phase 4 — Dashboard sections 1–9

- `#tab-economics` in `admin.html` — owner-gated tab, render-only.
- Confidence-class badges everywhere; **Blocked** KPIs show `—` + reason from
  `owner_econ_coverage()`.
- Date-range filter (Today / 7d / 30d / custom) matching AI Monitor's UX.

**Gate:** none beyond normal review — `admin.html` is not frozen.
**Exit:** every rendered number traces to a named view; no write RPC referenced
anywhere in the tab.

### Phase 5 — Simulator + Break-even (sections 10–11)

- `owner_econ_simulate()`, `owner_econ_breakeven()`.
- `platform_cost_entries` + an owner editor for fixed costs and FX (that editor
  writes cost *inputs*, never product pricing — it lives outside this module's
  read-only boundary and is called out as such).

**Exit:** simulator refuses to run on windows with no telemetry; Net Profit
stays **Blocked** until fixed costs exist.

### Phase 6 — Completeness & scale

- Close GAP-3: wire `MOCK_EXAM`, `MOCK_TIMER`, `MOCK_PRACTICE`, `FOCUS_SESSION`,
  `WEAKNESS_ANALYSIS` — **requires CLAUDE.md §2 unfreeze** of `mock-exam.html`,
  `focus.html`, `weakness.html` (already scoped in
  `credits-operation-based.md` §4.2).
- Close GAP-5: make refunds append a compensating event instead of deleting the
  usage row.
- Backfill `question_records.topic_id` to raise lesson-economics coverage above
  25%.
- Daily rollup table + retention policy for `ai_model_calls`.
- Optional: cost-of-rework (join `response_feedback` — money spent on answers
  students reported wrong).

---

## 13. Open questions for the Owner

1. **Revenue source of truth** — `payment_requests` (8 rows / 8,542 EGP, what
   the Owner Dashboard shows today) vs `payments` (5 rows / 1,466 EGP,
   status `COMPLETED`). They disagree. **Recommendation: `payment_requests` is
   authoritative; `payments` is treated as legacy and excluded**, with a
   reconciliation note in the module. Confirm?
2. **FX policy** — manual monthly rate, or a rate per transaction date?
   **Recommendation: manual monthly**, entered by the Owner, displayed inline
   with every mixed-currency figure.
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
   an estimate can never be mistaken for a measurement.
6. **Phase 2 scheduling** — the Edge Function deploy is the only student-facing
   risk in this plan. Deploy outside an exam-prep window?

---

## 14. What this document does not change

No production behaviour was modified, and nothing was deployed. Specifically:

- No migration was created or applied (CLAUDE.md §3).
- No Edge Function was deployed (CLAUDE.md §1 / DEPLOY.md §4).
- No frozen file was touched (CLAUDE.md §2).
- No pricing, credit cost, package price, or billing path was altered.
- Production access during authoring was **read-only introspection only**
  (`information_schema`, `pg_policies`, `pg_proc`, and aggregate `SELECT`s used
  for the evidence in §4 and §5).
