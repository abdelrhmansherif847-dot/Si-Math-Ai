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

**The recommendation rests on the properties of the interface, not on a judgement about how
sensitive the data is.** All five options in §5 correctly restrict access to authorised roles;
none of them is insecure. They differ in what happens *when something changes* — when the table
gains a column, when an unauthorised caller asks, when someone refactors the gate, when a second
consumer appears. §3 states those five properties and is the load-bearing argument.

A separate question — whether token counts are protected financial data under INV-10 — was
considered and is recorded in **Appendix A**. It is a policy interpretation, the current schema
does not make it obvious, and **the conclusion does not depend on it**. It is a supporting
argument, not a prerequisite.

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

**9 of 23 columns needed.** The 14 withheld are withheld because **nothing needs them** — a
minimal surface, not a policy judgement. That happens to include both token columns and every
user identifier, which is why Appendix A exists; but the reason to omit them here is simply that
no panel reads them, and adding one later is a single reviewed change to the contract (property
**P1**).

---

## 3. The architectural case: five properties of the interface

This is the load-bearing argument, and it is deliberately independent of any question about
whether token counts are sensitive. Every property below would matter identically if tokens were
ruled perfectly acceptable for a `super_admin` to read.

The question is not "which mechanism is secure?" — all of the options in §5 correctly restrict
access to authorised roles. The question is **what each interface does when something changes**:
when the table gains a column, when an unauthorised caller asks, when someone refactors the
gate, when a second consumer appears. Those are properties of the API surface, not of its
strength.

**P1 — Explicit return type.** The interface declares exactly what it returns. Consumers cannot
receive a column the contract does not name, so the exposed surface is a reviewed artefact rather
than a consequence of the table's current shape.

**P2 — Fails closed as the schema evolves.** A column added to `ai_model_calls` tomorrow does
not reach any client until someone edits the contract. This is the single most durable
property in the list: it converts "what does the dashboard see?" from a question you must
re-answer after every migration into an invariant you can read off the signature. Phase 3's own
migration header anticipates the table growing.

**P3 — Explicit `forbidden` semantics.** An unauthorised caller gets a distinguishable error,
not an empty result. This matters more here than it would in most systems, because the AI
Monitor work immediately preceding this proposal was largely about eliminating exactly this
conflation — the dashboard now models data availability as an explicit state so that "no data"
and "cannot see" never render the same way. An interface that returns `[]` to both a
non-admin and a genuinely quiet window pushes that ambiguity back down into the data layer,
where the client has no way to tell them apart.

**P4 — Centralised authorization.** The role check sits at one entry point, as a guard clause
that raises, matching the convention the 23 existing `SECURITY DEFINER` functions already
follow. Authorization that lives in one place is auditable in one place; authorization
distributed across predicates in view bodies is not weaker in principle but is one more surface
to keep correct, and a predicate is easier to lose in a refactor than a guard clause.

**P5 — Consistency with the existing dashboard architecture.** `public` currently has 23
`SECURITY DEFINER` functions and **zero views**. The frozen architecture's own **INV-04** says
dashboard layers consume analytics — RPCs — rather than tables. Choosing the RPC means one idiom
for this job across the codebase; choosing anything else means two.

**Only the RPC options (§5.3, §5.4a) satisfy all five.** That is the whole recommendation. §5
evaluates each candidate against these properties plus performance and maintenance; Appendix A
records a supporting argument about token sensitivity that is *not* required for the conclusion.

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

**Maintenance — fails open. This is the decisive flaw, and it is a violation of P1 and P2.**
With a table-level grant, **every column added to `ai_model_calls` in future becomes visible
automatically**, the moment it is added, with no review step and no code change to notice.
Phase 3's own header anticipates the table growing. A future prompt-excerpt or `meta`-adjacent
column would be exposed by default rather than by decision.

**Suitability — not recommended.** Fails P1, P2 and P3 (and P5 in part). This holds regardless of
how Appendix A is resolved: even if every column in the table were considered freely shareable
with a `super_admin` today, the interface would still expose tomorrow's columns without anyone
deciding to.

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

**Suitability — viable second choice.** Satisfies P1 and P2; set below option 3 because it misses
**P3** (empty and forbidden are indistinguishable), **P4** (authorization distributed into a view
predicate) and **P5** (a second idiom alongside 23 functions). All three are architectural
properties, none of them a security defect.

### 5.3 `SECURITY DEFINER` RPC

A `STABLE SECURITY DEFINER` function per query shape (or one returning a composite), owned by
`postgres`, `SET search_path = public`, gated on `has_role_at_least`, with `EXECUTE` revoked
from `public` and `anon` and granted to `authenticated`.

**Interface properties — satisfies all five of §3.**
- **P1** — the return type is a declared `TABLE(...)`. A column the signature does not name is
  not merely unselected, it is **unreturnable**.
- **P2** — consequently a future base-table column cannot reach the client without an edit to
  the signature. Fails closed, structurally rather than by convention.
- **P3** — the gate is a first statement that **raises**, so a refused call is distinguishable
  from an empty window.
- **P4** — that gate is the single entry point, in the same guard-clause form the 23 existing
  functions use.
- **P5** — same `SECURITY DEFINER` / `search_path` discipline, same `has_role_at_least` gate, and
  it satisfies **INV-04**: dashboards consume RPCs, not tables.

Additionally the window is a **parameter**, so the function rather than the client bounds what
can be asked for.

**One non-negotiable in the implementation.** `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon;`
must be in the same migration. Without it PostgREST publishes the RPC to unauthenticated callers
— the state the linter flags on two existing functions (§4). The in-body gate must be present
*as well*: the two layers together are the design, and the existing pair has only the second.

**Performance — best.** Five aggregates computed in-database, one round trip per panel, payload
in bytes. `STABLE` lets the planner cache within a statement. Uses the existing
`(service_code, created_at DESC)` and `(provider, model, created_at DESC)` indexes.

**Maintenance — explicit, slightly more ceremony.** One function is one reviewed contract; a
change to what the dashboard sees is a visible signature change. Cost: adding a metric means a
migration rather than a client-side edit. At the rate this dashboard changes, that is a feature —
it is P2 expressed as a workflow.

**Suitability — recommended.** The only option in `public` satisfying P1–P5.

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

Mapping to §3: *restricts columns* is **P1**, *new base column exposed automatically* is **P2**,
*refusal distinguishable from empty* is **P3**, *authorization located at entry point* is **P4**,
and *matches house style / INV-04* is **P5**.

If Appendix A is resolved in favour of tokens being freely readable, only the **P1 row** softens
— and P2, P3, P4 and P5 are untouched. The RPC still wins on four of five.

---

## 7. Recommendation

**Option 3 — a `STABLE SECURITY DEFINER` RPC in `public`, gated on
`has_role_at_least('super_admin')`, with `EXECUTE` revoked from `PUBLIC` and `anon`.**

**It is the only option in `public` that satisfies all five properties in §3** — explicit return
type (P1), fails closed as the schema evolves (P2), explicit `forbidden` semantics (P3),
centralised authorization (P4), and consistency with the existing RPC-based dashboard
architecture (P5). It additionally bounds the query window server-side and returns bytes rather
than rows.

**The recommendation stands on those interface properties alone.** It does not rest on any
judgement about token sensitivity: assume tokens are perfectly acceptable for a `super_admin` to
read and every one of P1–P5 still holds, and still separates this option from the alternatives.
Appendix A is supporting material, deliberately not a premise.

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

### Blocking — needed before a migration is written

**Q1 — approve the architecture.** Adopt option 3 (§7) on the strength of properties P1–P5,
independent of Appendix A?

**Q2 — the role floor.** Is `super_admin` right for an operational RPC, or should it be `owner`?
This is the one open question that changes the migration itself.

**Q3 — one function or two?** Two is proposed: Q1/Q2/Q5 and Q4 have different natural grains, and
only Q4 would benefit from a partial index on `success`.

**Q4 — the column set.** Confirm the nine columns in §2 are the right surface. Tokens are omitted
because nothing reads them; if a panel is wanted that does, say so now and it becomes a
ten-column contract rather than a later amendment.

### Non-blocking — track separately

**Q5 — Appendix A.** Are token counts protected financial data under INV-10? A policy
interpretation that the current schema does not settle. **It does not gate Q1.** Its real
consequence is Q6.

**Q6 — Appendix B: `ai_usage_logs`.** Legacy to retire, surface to narrow, or intentional
exception to record? It carries 1,138 rows of zeros behind an `is_admin` read policy, so it
discloses nothing today but would begin to on backfill. Worth resolving before anything populates
those columns.

**Q7 — `anon:EXECUTE` hardening.** Track the `admin_credits_overview` /
`admin_set_credit_cost` grants as separate work? Not a live vulnerability — the `auth.uid()` gate
prevents anonymous access today — but it is a missing layer of the intended two, and the same
class of gap the new function must avoid.

---

## Appendix A — Token sensitivity: a supporting argument, not a prerequisite

**Status: optional. Nothing in §3, §5, §6 or §7 depends on how this is resolved.** It is recorded
because it was raised during review and because it has a bearing on Appendix B, not because the
recommendation needs it. An earlier draft of this proposal made it the load-bearing argument;
that was wrong, and the correction is the reason §3 now exists.

### A.1 The question

AI Monitor is reachable by **`super_admin`** as well as `owner` (`ai-monitor.html` gates on
`role === 'owner' || role === 'super_admin'`). Do `prompt_tokens` and `completion_tokens` count
as protected financial data under **INV-10** (*financial data is owner-only; cost, revenue and
profit are never exposed below role `owner`*), on the grounds that they permit spend
reconstruction?

### A.2 The case that they are protected

1. **Spend reconstruction is arithmetically trivial.** Tokens joined to `model`, multiplied by
   published OpenAI list prices, yields tutor-path spend. `units` even decomposes input into
   cached and uncached (`input_token` + `cached_input_token` = `prompt_tokens`), which makes the
   reconstruction *more* accurate than a naive estimate, since cached input is billed at a
   different rate.
2. **INV-10 says "exposed", which is an information word.** On a secrecy reading, a figure
   obtainable in one multiplication has been exposed.
3. **Derived disclosure normally counts** in access review — releasing hours and an hourly rate
   discloses salary.

### A.3 The case that they are not

1. **INV-01's own framing says usage is not money.** The table was deliberately designed to carry
   "usage in units only". Arguing that units *are* money-adjacent runs against the stated intent
   of the invariant being cited.
2. **The codebase already exposes a cost column to a weaker role** — see Appendix B. Withholding
   tokens from `super_admin` would be stricter than the project's own current practice.
3. **Scope is narrow.** Tokens reconstruct tutor-path COGS only — not revenue, not margin, not
   profit. INV-10 covers all three; this is a slice of the first.
4. **It sharpens precision rather than creating capability.** A `super_admin` can already bound
   spend from visible question volume × the known pipeline shape (2 solvers + 1 judge) × public
   prices. Tokens move a rough estimate to a close one — a difference of degree.

### A.4 Why it does not matter for this decision

The proposed contract excludes tokens either way, and the reason is **§2, not INV-10**: no panel
needs them. Nine of 23 columns are required and tokens are not among them, so the minimal surface
is free — it costs no functionality to omit them.

If tokens are later judged acceptable *and* a panel is found that genuinely wants them, adding
them is one reviewed signature change to the RPC. That is precisely property **P1**: the exposed
set is a decision, made once, visible in the contract — not a side effect of the table's shape.

A separate and milder point, independent of the financial question: `user_id` and `session_id`
make the table per-student attributable. AI Monitor is a platform-health surface with no
per-student view, so it has no reason to receive identifiers, and omitting them keeps the surface
clear of an access-review question later.

---

## Appendix B — `ai_usage_logs`: a separate policy question

**Out of scope for this proposal.** It is recorded here because it surfaced while checking
Appendix A, and it should be resolved independently of the AI Monitor access mechanism. Nothing
in §7 depends on it.

Measured 2026-07-29:

| Measure | Value |
|---|---|
| Rows | 1,138 (2026-06-09 → 2026-07-29) |
| `SUM(prompt_tokens)` / `SUM(completion_tokens)` / `SUM(total_tokens)` | **0 / 0 / 0** |
| `SUM(estimated_cost_usd)` | **$0.0000** — zero on all 1,138 rows |
| Read policy | `admin_select_ai_usage_logs` — `(user_id = auth.uid()) OR auth_is_admin()` |
| Client grant | `SELECT` to `authenticated` |

So a column literally named `estimated_cost_usd`, plus token columns, is readable by **every
`is_admin` user** — a broader set than `super_admin`. This is the "0 tokens and 0 cost for every
AI call" state the Phase 3 migration header describes, now confirmed empirically.

Two observations:

1. **Nothing is disclosed today.** The columns are a hollow shell. There is no live exposure.
2. **It will begin disclosing the moment anything populates them.** If INV-10 is intended
   strictly, this is a standing exception to it that activates silently on backfill.

`ai_usage_logs` predates the AI Economics architecture freeze (first row 2026-06-09; frozen
2026-07-28), so INV-10 is the newer rule and this is plausibly legacy superseded by
`ai_model_calls`. Whether it is legacy to retire, a surface to narrow, or an intentional
exception to record is a policy decision for the architecture owner — and it wants deciding
before anything backfills those columns, not after.
