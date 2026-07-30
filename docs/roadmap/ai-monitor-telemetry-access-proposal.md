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

**Two questions, not one: which columns may be exposed, and by what mechanism.** §3 takes the
column question first, since it is a policy call rather than a technical one — and concludes that
it can be left open, because the recommendation in §7 holds either way. The mechanism question
turns on failure mode rather than on strength: all five options below correctly restrict access
to authorised roles, and they differ in what happens when the table gains a column, when an
unauthorised caller asks, and when someone refactors the gate.

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

## 3. Are token counts protected financial data?

This is the one question in the document that is a **policy call, not a technical finding**.
It is stated here as an open decision with the evidence on both sides, because an earlier draft
asserted it as settled and that overstated the case.

AI Monitor is reachable by **`super_admin`** as well as `owner` (`ai-monitor.html` gates on
`role === 'owner' || role === 'super_admin'`). The relevant frozen invariants:

- **INV-10** — *Financial data is owner-only. Cost, revenue, and profit are never exposed
  below role `owner`.*
- **INV-01** — *Telemetry never computes money.* `ai_model_calls` deliberately carries usage
  in units only — no cost, price, currency, or FX column.
- **INV-05** — *No layer reaches past the layer above it.* Economics itself reads engine
  outputs, **never raw telemetry**.
- **INV-04** — *Dashboard layers consume analytics only* — the UI's data surface is RPCs.

### 3.1 The case that tokens are protected

1. **Spend reconstruction is arithmetically trivial.** `prompt_tokens` and `completion_tokens`
   joined to `model`, multiplied by published OpenAI list prices, yields tutor-path spend.
   `units` even decomposes input into cached and uncached (`input_token` +
   `cached_input_token` = `prompt_tokens`), which makes the reconstruction *more* accurate than
   a naive estimate, because cached input is the cheaper tier and is billed separately.
2. **INV-10 says "exposed", which is an information word,** not a presentation word. On a
   secrecy reading, a figure you can compute in one multiplication has been exposed.
3. **Derived disclosure normally counts** in access review. Releasing hours and an hourly rate
   discloses salary.

### 3.2 The case against — which is stronger than the earlier draft allowed

1. **INV-01's own framing says usage is not money.** The table was deliberately designed to
   carry "usage in units only". Arguing that units *are* money-adjacent runs against the
   stated intent of the invariant being cited, and that tension should be resolved by the
   architecture owner rather than assumed.
2. **This codebase already exposes a cost column to a weaker role.** `public.ai_usage_logs`
   has `estimated_cost_usd`, `prompt_tokens`, `completion_tokens` and `total_tokens`, with
   policy `admin_select_ai_usage_logs` — `(user_id = auth.uid()) OR auth_is_admin()` — and a
   `SELECT` grant to `authenticated`. That is **any `is_admin` user**, a broader set than
   `super_admin`, reading a column literally named cost. Either that table is legacy which
   INV-10 now forbids and should be remediated, or admin-tier roles *are* trusted with AI cost
   — in which case withholding tokens from `super_admin` is stricter than the project's own
   practice. See §4 for the measured state.
3. **Scope is narrow.** Tokens reconstruct **tutor-path COGS only** — not revenue, not margin,
   not profit, not total company spend. INV-10 covers all three; this is a slice of the first.
4. **It sharpens precision rather than creating capability.** A `super_admin` can already bound
   spend from visible question volume × the known pipeline shape (2 solvers + 1 judge) ×
   public prices. Tokens move a rough estimate to a close one. Real, but a difference of
   degree.

### 3.3 Why the recommendation holds either way

**This question does not need to be resolved before approving §7,** which is the most useful
thing to say about it:

- **§2 shows no panel needs tokens.** The nine columns the dashboard actually wants do not
  include them. Excluding tokens costs zero functionality, so the strict choice is free.
- **The other three arguments for the RPC are independent of §3** — it fails closed as the
  table gains columns, it can distinguish *forbidden* from *no data*, and it matches INV-04
  and the 23 existing functions.
- If §3.1 is accepted, direct RLS is disqualified on exposure **and** on fail-open behaviour.
  If §3.2 prevails, direct RLS is disqualified on fail-open behaviour alone. **One row of the
  §6 table changes; the recommendation does not.**

So: treat §3.1 as a *sufficient* reason to project a fixed column set, never a *necessary*
one. The design should exclude tokens because nothing needs them and excluding them is free —
not because the invariant has been definitively interpreted here.

A second, milder point, independent of the above: `user_id` and `session_id` make the table
per-student attributable. AI Monitor is a platform-health surface with no per-student view, so
it has no reason to receive identifiers, and omitting them keeps the surface clear of an
access-review question later.

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

**The existing cost surface (`ai_usage_logs`), measured 2026-07-29.**

| Measure | Value |
|---|---|
| Rows | 1,138 (2026-06-09 → 2026-07-29) |
| `SUM(prompt_tokens)` / `SUM(completion_tokens)` / `SUM(total_tokens)` | **0 / 0 / 0** |
| `SUM(estimated_cost_usd)` | **$0.0000** — zero on all 1,138 rows |
| Read policy | `(user_id = auth.uid()) OR auth_is_admin()` |
| Client grant | `SELECT` to `authenticated` |

This is the "0 tokens and 0 cost for every AI call" state the Phase 3 migration header
describes, now confirmed empirically. Two things follow:

1. **No information is disclosed there today.** The columns are a hollow shell, so §3 is not
   already moot in practice.
2. **The schema-level precedent nonetheless runs against a strict §3 reading.** A column named
   `estimated_cost_usd` is readable by every `is_admin` user. `ai_usage_logs` predates the
   AI Economics architecture freeze (first row 2026-06-09; architecture frozen 2026-07-28), so
   INV-10 is the newer rule and this is plausibly legacy. **Worth an explicit decision either
   way** — if INV-10 is meant strictly, this table is a live exception to it that will start
   disclosing real figures the moment anything backfills those columns.

**Live linter findings that bear on this.**

- `ai_model_calls` is flagged `rls_enabled_no_policy` (INFO) — today's state.
- Two `SECURITY DEFINER` functions are flagged **anon-executable** via
  `/rest/v1/rpc/…`: `admin_credits_overview()` and `admin_set_credit_cost(...)`. Both hold
  `anon:EXECUTE`.

  I read both bodies. Each begins with an `is_admin` lookup on `auth.uid()` and returns
  `{"ok":false,"reason":"forbidden"}` when it fails. For `anon`, `auth.uid()` is `NULL`, so
  `COALESCE(v_is_admin, false)` is false and the call is refused.

  **This is not a live vulnerability. Anonymous access is prevented today by the
  `auth.uid()` gate, which is working as designed.** The point is defense-in-depth: the
  intended design has two independent layers — no `EXECUTE` for `anon` at the privilege level,
  *and* a role gate in the body — and only the second is currently present. A single
  refactor of that gate would remove the only thing standing between an anonymous caller and
  the function.

  The generalisation that matters for this proposal: any new `SECURITY DEFINER` function in
  `public` is published through PostgREST to `anon` **by default**. **`REVOKE EXECUTE` should
  therefore be treated as mandatory for every new `SECURITY DEFINER` function**, not as
  belt-and-braces. Bringing these two existing functions in line is worthwhile hardening,
  tracked separately from this work.

---

## 5. Options

### 5.1 Direct `SELECT` with an RLS policy on the base table

`CREATE POLICY … FOR SELECT TO authenticated USING (has_role_at_least('super_admin'))`
plus `GRANT SELECT ON public.ai_model_calls TO authenticated`.

**Security — sound for row isolation, insufficient for column exposure.** To be precise about
what RLS does and does not do: RLS is the correct, robust mechanism for **row** access control,
and a policy gated on `has_role_at_least` would enforce row visibility exactly as intended.
There is nothing weak about RLS here. The gap is that **RLS governs rows, not columns** — it has
no opinion on *which* of the 23 columns a permitted row reveals. Combined with a table-wide
`GRANT SELECT`, an authorised reader receives every column, including both token columns and
`user_id`.

Note also that row filtering does no useful work in this particular case: an authorised admin is
entitled to every row, so the policy is functioning as an on/off switch rather than as row
isolation. That is not a criticism of RLS — it is a sign that the access question here is
column-shaped, and RLS is the wrong tool for a column-shaped question.

Column-scoped grants (`GRANT SELECT (started_at, success, …)`) *can* narrow the surface and are
a legitimate mechanism. The practical objection is operational: `select=*` then errors, every
client query must enumerate columns explicitly, and the authoritative column list lives in
catalog grants that are invisible from the application code depending on them.

**Performance — weakest in practice.** The browser pulls raw rows and aggregates client-side: at
3 calls per request that is roughly triple the `question_records` volume the dashboard already
pages through, to compute five aggregates. All five collapse to a handful of numbers server-side.

**Maintenance — fails open. This is the decisive flaw, and it is independent of §3.** With a
table-level grant, **every column added to `ai_model_calls` in future becomes visible
automatically**, the moment it is added, with no review step and no code change to notice.
Phase 3's own header anticipates the table growing. A future prompt-excerpt or `meta`-adjacent
column would be exposed by default rather than by decision.

**Suitability — not recommended,** on the fail-open property alone even if §3 is set aside.

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

**To be clear at the outset: a view here is not insecure.** A `security_definer`-semantics view
with an explicit column list and an in-body role predicate is a legitimate, widely-used pattern
that would correctly restrict both columns and rows. The reservations below are
**architectural and operational**, not claims of a security hole.

**Security — correct on exposure; the concern is where the authorization lives.** Projection is
structural: tokens cannot be returned because they are not in the select list. The reservation is
that the role check must live inside the view body as a predicate
(`WHERE has_role_at_least('super_admin')`). That distributes authorization logic across a new
surface — an in-body predicate in a view, rather than the gate-at-entry convention the 23
existing functions follow. It is not weaker in principle; it is one more place authorization
lives, and a predicate is easier to lose in a refactor than a guard clause that raises.

**Operational — "empty" and "forbidden" become indistinguishable.** A view cannot raise a
role-specific error, so an unauthorised caller receives an empty result set identical to a
genuinely quiet window. That is precisely the ambiguity this dashboard's recent work went to
some length to remove: the whole point of the availability-state model is that "no data" and
"cannot see" must never render the same way. A view reintroduces that conflation at the data
layer, where the client cannot tell the two apart.

**Consistency — it diverges from the established pattern.** `public` currently has **zero
views** and 23 `SECURITY DEFINER` functions. Introducing the first view means two different
idioms for the same job, and it adds the `security_definer_view` lint class to a project whose
advisor output is presently clean of it. That is a maintenance-surface argument, not a
correctness one.

**Performance — good.** Aggregation server-side, small payload, indexes usable when the client
filters on `started_at`. Not parameterised, so the window arrives as a client-side filter; fine
at this volume, though the client can always ask for all-time.

**Maintenance — fails closed.** The column list is explicit, so new base columns do **not**
appear automatically. A genuine advantage over option 1 and the reason this option is a real
contender.

**Suitability — viable second choice.** Correct on exposure and fail-closed; set below option 3
on distributed authorization, empty-vs-forbidden semantics, and divergence from the existing RPC
pattern — all architectural, none of them a security defect.

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

All five options are *secure* in the sense of correctly restricting access to authorised roles.
The table compares them on exposure surface, failure mode, and fit — not on whether they work.

| | 1. Direct RLS | 2b. View | **3. RPC** | 4a. `monitor` schema | 4b. Rollup |
|---|---|---|---|---|---|
| Correct **row** isolation | **yes** | yes | yes | yes | yes |
| Restricts **columns** | **no** ✗ | yes | **yes** | yes | yes |
| New base column exposed automatically | **yes** ✗ | no | **no** | no | no |
| Refusal distinguishable from empty | no | no ✗ | **yes** | yes | no |
| Authorization located at entry point | n/a | in-body predicate | **guard clause** | guard clause | n/a |
| Window bounded server-side | no | no | **yes** | yes | yes |
| Matches house style | partly | no (0 views) | **yes** (23 fns) | yes | no |
| Matches INV-04 / INV-05 | no | partly | **yes** | **yes** | yes |
| Payload to browser | ~3× rows ✗ | small | **bytes** | bytes | bytes |
| Adds a lint class | no | yes | no | no | no |
| Moving parts added | 1 policy | 1 view | **1 function** | schema + role + config | table + cron |
| Verdict | not recommended | viable | **recommend** | later | premature |

Rows that survive rejecting §3 entirely: *restricts columns* becomes a non-issue, but
**new base column exposed automatically**, **refusal distinguishable from empty**, **window
bounded server-side** and **payload** are all unchanged — and they still separate option 3
from option 1.

---

## 7. Recommendation

**Option 3 — a `STABLE SECURITY DEFINER` RPC in `public`, gated on
`has_role_at_least('super_admin')`, with `EXECUTE` revoked from `PUBLIC` and `anon`.**

It is the only option that simultaneously fails closed as the table evolves, can distinguish
"forbidden" from "no data", bounds the query window server-side, keeps authorization at a single
entry point, and matches both the codebase's established pattern and the frozen architecture's
own rule that dashboards consume RPCs.

**This recommendation does not depend on §3.** If token counts are ruled non-financial, the
reasoning above is unchanged — see §3.3.

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

**Q1 — the §3 policy call.** Are `prompt_tokens` / `completion_tokens` protected financial data
under INV-10, on the grounds that they permit spend reconstruction against public list prices?

- If **yes**: §7 proceeds as written, and `ai_usage_logs` (§4) is a live exception to INV-10
  needing separate remediation before anything backfills its zeroed cost column.
- If **no**: §7 still proceeds as written — see §3.3. The RPC keeps tokens out anyway, because
  no panel needs them (§2) and excluding them is free. Only one row of the §6 table changes.

Either way the recommendation stands, so **this question does not block approval.** It does
determine whether `ai_usage_logs` needs follow-up work, which is the more consequential half.

**Q2 —** is `super_admin` the right floor for the operational RPC, or should it be `owner`?

**Q3 —** two functions or one? Two is proposed because Q1/Q2/Q5 and Q4 have different natural
grains, and only Q4 would benefit from a partial index on `success`.

**Q4 —** track the `admin_credits_overview` / `admin_set_credit_cost` `anon:EXECUTE` grants as
separate hardening? Not a live vulnerability — the `auth.uid()` gate prevents anonymous access
today — but it is a missing layer of the intended two, and the same class of gap the new
function must avoid.

**Q5 —** is `ai_usage_logs` legacy that should be narrowed or retired now that `ai_model_calls`
is the telemetry ledger? It currently carries 1,138 rows of zeros behind an `is_admin` read
policy, so it discloses nothing today but would begin to if populated.
