# AI Monitor → `ai_model_calls`: access architecture proposal

**Status:** proposal for review. **No migration has been created. No policy, grant, view,
function, or role has been added. The security model is unchanged.**

Prepared 2026-07-29 against project `igvkyxkmjnkzscqgommj` (PostgreSQL 17.6).

---

## 1. The decision in one paragraph

AI Monitor currently derives solver and judge call counts arithmetically (2 solvers + 1 judge
per L3 run) and detects provider failures by string-matching `ai_response`. `ai_model_calls`
now records the real thing: one row per provider call with `success`, `http_status`,
`error_code`, `latency_ms`, and per-model attribution. Reading it would replace derived
numbers with measured ones and give a failure signal that does not depend on
`question_records`. The table is service-role only, so the question is how to expose it.

**The mechanism is the second question. The first is which columns may be exposed at all** —
and that answer, argued in §3, disqualifies the most obvious option regardless of mechanism.

---

## 2. What AI Monitor needs

Five query shapes. None of them needs a raw row.

| # | Panel | Shape | Columns touched |
|---|---|---|---|
| Q1 | Pipeline Composition | calls grouped by `service_code`, `stage` over a window | `service_code`, `stage`, `started_at` |
| Q2 | Pipeline Composition | calls grouped by `provider`, `model` | `provider`, `model`, `started_at` |
| Q3 | OpenAI Health | success/failure counts + rate | `success`, `started_at` |
| Q4 | OpenAI Health | failure breakdown by `http_status` + `error_code`, with last-seen | `http_status`, `error_code`, `started_at` |
| Q5 | OpenAI Health / L3 | latency avg + p50 + p95, per `service_code` | `latency_ms`, `service_code`, `started_at` |

So the union of columns any panel needs is exactly nine: `service_code`, `stage`, `provider`,
`model`, `success`, `http_status`, `error_code`, `latency_ms`, `started_at`.

**Not needed by any panel** — the remaining fourteen: `id`, `call_uid`, `created_at`,
`request_id`, `client_request_id`, `question_record_id`, `session_id`, `user_id`, `operation`,
`api_surface`, `units`, `prompt_tokens`, `completion_tokens`, `meta`.

**9 of 23 columns needed. The 14 withheld include both token columns and every user
identifier** — which is the whole of §3.

---

## 3. The prior constraint: tokens must not reach AI Monitor

AI Monitor is reachable by **`super_admin`** as well as `owner` (`ai-monitor.html` gates on
`role === 'owner' || role === 'super_admin'`). The frozen AI Economics invariants say:

- **INV-10** — *Financial data is owner-only. Cost, revenue, and profit are never exposed
  below role `owner`.*
- **INV-01** — *Telemetry never computes money.* `ai_model_calls` deliberately carries no
  cost, price, or currency column.
- **INV-05** — *No layer reaches past the layer above it.* Economics itself reads engine
  outputs, **never raw telemetry**.
- **INV-04** — *Dashboard layers consume analytics only* — the UI's data surface is RPCs.

INV-01 keeps money out of the table, but it does not make the table non-financial to a
reader. `prompt_tokens` and `completion_tokens`, joined to `model`, are a **direct cost
proxy**: multiply by published OpenAI list prices and you have spend to within the margin of
whatever discount applies. Exposing token columns to a `super_admin` therefore discloses
financial information below `owner` by inference, which is an INV-10 violation in substance
even though no column is literally named `cost`.

**Consequence for this decision:** any option that exposes whole rows is out — not because of
how it authenticates, but because of what it returns. The chosen mechanism must project a
fixed, non-financial column set, and it should be one that **fails closed** when the base
table gains a column later.

A second, milder point: `user_id` and `session_id` make the table per-student attributable.
AI Monitor is a platform-health surface with no per-student view; it has no reason to receive
identifiers, and omitting them keeps the surface free of an access-review question later.

---

## 4. Facts this decision rests on

**Volume — small, and not the deciding factor.**

| Measure | Value |
|---|---|
| Rows in `ai_model_calls` today | 9 (writer went live 2026-07-29) |
| Calls per tutor request | 3.00 (solver_a, solver_b, judge) |
| `question_records` all-time | 1,172 |
| Recent traffic | 405 requests / 30 days |
| Projected steady state | **~1,200 calls/month, ~15k/year** |

At this size every option below performs identically. Performance arguments should not decide
this; a design that only pays off at 10⁷ rows is premature. Revisit if calls/month exceeds
roughly 500k.

**Indexes already present (10).** Relevant: `(created_at DESC)`, `(started_at DESC)`,
`(service_code, created_at DESC)`, `(provider, model, created_at DESC)`.
Q1, Q2 and windowing are covered. **No index on `success` or `http_status`** — Q4 scans. That
is free at 15k rows; a partial index `WHERE success = false` is the fix if it ever matters.

**Precedent in this codebase.**

- **0 views and 0 materialized views** exist in `public`. A view would be the first.
- **23 `SECURITY DEFINER` functions**, all owned by `postgres`, all with
  `SET search_path = public`. This is the established house pattern.
- `has_role_at_least(p_min user_role)` is the canonical role gate and is itself
  `SECURITY DEFINER`.
- PostgreSQL **17.6**, so `CREATE VIEW … WITH (security_invoker = true)` is available —
  which, as §5.2 shows, changes the view analysis materially.

**Live linter findings that bear on this.**

- `ai_model_calls` is flagged `rls_enabled_no_policy` (INFO) — today's state.
- Two `SECURITY DEFINER` functions are flagged **anon-executable** via
  `/rest/v1/rpc/…`: `admin_credits_overview()` and `admin_set_credit_cost(...)`. Both hold
  `anon:EXECUTE`.

  I checked both bodies. Each begins with an `is_admin` lookup on `auth.uid()` and returns
  `{"ok":false,"reason":"forbidden"}` when it fails; for `anon`, `auth.uid()` is `NULL`, so
  the gate holds. **This is not a live bypass** — but only one of the two intended layers is
  present, and it is precisely the failure mode option 3 must not repeat. Any new
  `SECURITY DEFINER` function in `public` is exposed through PostgREST to `anon` **by
  default**; the `REVOKE` is not optional. Worth fixing on those two functions separately from
  this work.

---

## 5. Options

### 5.1 Direct `SELECT` with an RLS policy on the base table

`CREATE POLICY … FOR SELECT TO authenticated USING (has_role_at_least('super_admin'))`
plus `GRANT SELECT ON public.ai_model_calls TO authenticated`.

**Security — the weakest, and disqualifying.** RLS filters *rows*, not *columns*. A table-wide
grant exposes all 23 columns including both token columns and `user_id` — the §3 violation, in
full. Column-scoped grants (`GRANT SELECT (started_at, success, …)`) can narrow this, but they
interact badly with PostgREST: `select=*` errors, every client query must enumerate columns,
and the grant list is invisible from the application code that depends on it. Row filtering is
also doing no real work here, since an authorised admin is entitled to every row — the policy
is an on/off switch wearing an RLS costume.

**Performance — worst in practice.** The browser pulls raw rows and aggregates client-side: at
3 calls per request that is roughly triple the `question_records` volume the dashboard already
pages through, to compute five aggregates. All five collapse to a handful of numbers server-side.

**Maintenance — fails open.** This is the decisive flaw. With a table-level grant, **every
column added to `ai_model_calls` in future is exposed automatically**, the moment it is added,
with no review step. Phase 3's own header anticipates the table growing. A future
`meta`-adjacent or prompt-excerpt column would leak by default.

**Suitability — poor.** Rejected.

### 5.2 A secure SQL view

Two genuinely different mechanisms share this name, and on PG 17 the difference decides it.

**5.2a — `WITH (security_invoker = true)`.** The view executes with the *caller's* privileges,
so the base table's RLS applies. `ai_model_calls` has no SELECT policy, so the view returns
**zero rows** to everyone. To make it work you must also add the §5.1 policy — at which point
you have option 1 plus a projection layer, inheriting option 1's grant question. Not a
standalone answer.

**5.2b — default (`security_invoker = false`).** The view runs as its owner (`postgres`) and
bypasses the base table's RLS. This works: grant `SELECT` on the view only, and the view body
does the column projection.

**Security — good on exposure, weaker on gating.** Projection is structural: tokens cannot be
returned because they are not in the select list. But the *role check* has to live inside the
view body as a predicate (`WHERE has_role_at_least('super_admin')`), which is easy to drop in a
refactor and silently turns the view into an open read for anyone holding the grant. A view
also cannot raise a distinguishable error — a non-admin gets an empty result, indistinguishable
from "no calls in window", which is exactly the ambiguity the dashboard work just spent effort
eliminating. And it introduces the `security_definer_view` lint class into a project that
currently has zero views and no such warnings.

**Performance — good.** Aggregation server-side, small payload, indexes usable when the client
filters on `started_at`. Not parameterised, so the time window arrives as a client-side filter;
fine here, but the client can always ask for all-time.

**Maintenance — fails closed.** The column list is explicit, so new base columns do **not**
appear automatically. A real advantage over option 1, and the reason this option is respectable
rather than merely tolerable.

**Suitability — workable, second choice.** Correct on the exposure question, weaker on gating,
and stylistically novel for this codebase.

### 5.3 `SECURITY DEFINER` RPC

A `STABLE SECURITY DEFINER` function per query shape (or one returning a composite), owned by
`postgres`, `SET search_path = public`, gated on `has_role_at_least`, with `EXECUTE` revoked
from `public` and `anon` and granted to `authenticated`.

**Security — strongest, on every axis that matters here.**
- The gate is an explicit first statement that **raises**, so a refused call is distinguishable
  from an empty window — no silent-empty ambiguity.
- The return type is a declared `TABLE(...)`. Token columns are not merely unselected, they are
  **unreturnable**; a future base-table column cannot reach the client without editing the
  signature. Fails closed, structurally.
- The window is a **parameter**, so the function — not the client — decides the shape and bounds
  of what can be asked for.
- Matches the house pattern exactly (23 such functions, same `search_path` discipline, same
  `has_role_at_least` gate), and matches **INV-04**: dashboards consume RPCs, not tables.
- **Mandatory:** `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon;`. Without it PostgREST
  publishes the RPC to unauthenticated callers — the exact state the linter flags on two
  existing functions (§4). The internal gate must also be present; the two together are the
  point, and the existing pair has only one.

**Performance — best.** Five aggregates computed in-database, one round trip per panel, payload
in bytes. `STABLE` lets the planner cache within a statement. Uses the existing
`(service_code, created_at DESC)` and `(provider, model, created_at DESC)` indexes.

**Maintenance — explicit, slightly more ceremony.** One function is one reviewed contract; a
change to what the dashboard sees is a visible signature change. Cost: adding a metric means a
migration rather than a client-side edit. At the rate this dashboard changes, that is a feature.

**Suitability — best fit. Recommended.**

### 5.4 Other architectures considered

**5.4a — Dedicated `monitor` schema with a reader role.** The RPC of 5.3, but in its own schema
with a `monitor_reader` role, mirroring the `econ_reader` layering INV-05 already mandates.
Architecturally the cleanest and the natural end state if a second consumer ever appears.
Deferred for now: it requires adding a schema to PostgREST's exposed list (project
configuration, not just a migration), which is more moving parts than one dashboard justifies
today. **Promote 5.3 → 5.4a when a second consumer appears.**

**5.4b — Pre-aggregated rollup table** (`ai_call_health_5min`) written by `pg_cron`, read with
ordinary RLS. Raw telemetry never leaves service-role, reads are trivially cheap, exposure is
inherently non-financial. **Rejected as premature:** it adds a scheduled job and a second
schema object to serve ~1,200 rows/month, and its 5-minute granularity fights the dashboard's
60-second refresh. Reconsider only past ~500k calls/month.

**5.4c — Edge Function proxy** holding `service_role`, gated on role. No database surface change
at all. **Rejected:** it duplicates authorisation logic outside the database, adds a deploy
target to a project that has had two ai-tutor deploy incidents, and gives up the planner. The
database already has a safe way to do this.

---

## 6. Comparison

| | 1. Direct RLS | 2b. View | **3. RPC** | 4a. `monitor` schema | 4b. Rollup |
|---|---|---|---|---|---|
| Token columns reachable | **yes** ✗ | no | **no** | no | no |
| New base column exposed automatically | **yes** ✗ | no | **no** | no | no |
| Refusal distinguishable from empty | no | **no** ✗ | **yes** | yes | no |
| Gate can be silently dropped | n/a | **yes** ✗ | no | no | n/a |
| Window bounded server-side | no | no | **yes** | yes | yes |
| Matches house style | partly | **no** (0 views) | **yes** (23 fns) | yes | no |
| Matches INV-04 / INV-05 | **no** ✗ | partly | **yes** | **yes** | yes |
| Payload to browser | ~3× rows ✗ | small | **bytes** | bytes | bytes |
| New lint class introduced | no | **yes** ✗ | no | no | no |
| Moving parts added | 1 policy | 1 view | **1 function** | schema + role + config | table + cron |
| Verdict | reject | acceptable | **recommend** | later | premature |

---

## 7. Recommendation

**Option 3 — a `STABLE SECURITY DEFINER` RPC in `public`, gated on
`has_role_at_least('super_admin')`, with `EXECUTE` revoked from `PUBLIC` and `anon`.**

It is the only option that is simultaneously correct on the §3 exposure question, fails closed
as the table evolves, can distinguish "forbidden" from "no data", and matches both the codebase's
established pattern and the frozen architecture's own rule that dashboards consume RPCs.

Proposed contract, for review — **not created**:

```
public.ai_monitor_call_health(p_since timestamptz DEFAULT NULL)
  RETURNS TABLE (
    service_code   text,
    stage          text,
    provider       text,
    model          text,
    calls          bigint,
    successes      bigint,
    failures       bigint,
    latency_avg_ms integer,
    latency_p50_ms integer,
    latency_p95_ms integer
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public

public.ai_monitor_call_failures(p_since timestamptz DEFAULT NULL)
  RETURNS TABLE (
    http_status smallint,
    error_code  text,
    service_code text,
    model       text,
    failures    bigint,
    last_seen   timestamptz
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
```

Two functions rather than one: they have different natural grains, and Q4 is the only shape that
would benefit from the partial index on `success`. Neither returns a token column, a user
identifier, or a row-level record.

Accompanying non-negotiables, all in the same migration:

1. `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon;` then `GRANT EXECUTE … TO authenticated;`
2. The role gate as the first statement, raising rather than returning empty.
3. No change to `ai_model_calls` itself — no policy, no grant. It stays service-role only, and
   `rls_enabled_no_policy` remains its correct steady state.
4. A CI assertion that neither function's return type mentions a token column, mirroring the
   existing INV-01 check.

---

## 8. What this unlocks, and what it does not

**Unlocks:** measured call counts replacing the `derived` labels in Pipeline Composition;
per-model and per-stage latency; and a provider-failure signal independent of
`question_records` — which is the closest available answer to the reported "OpenAI Health didn't
show the error".

**Does not unlock:** failures where ai-tutor returns 5xx before writing anything. Those write no
`question_records` row *and* no `ai_model_calls` row, so no read path can surface them. That
still requires the ai-tutor change already noted in the dashboard's own coverage panel. The
in-page notice stays regardless of which option is chosen here.

**Does not change:** spend, cost, and projections remain exclusively AI Economics. Nothing in
this proposal puts a currency figure in AI Monitor.

---

## 9. For the review

1. Confirm the §3 reading — that token columns are financial-by-inference under INV-10 and must
   not reach a `super_admin` surface. Everything downstream follows from it.
2. Confirm `super_admin` is the right floor, or raise it to `owner`.
3. Confirm two functions rather than one.
4. Should the linter finding on `admin_credits_overview` / `admin_set_credit_cost` be tracked as
   separate hardening work? It is pre-existing and not exploitable, but it is the same class of
   gap.
