# `ai_tutor_failures` — design

**Status:** design for review. **Nothing applied. `ai-tutor` is untouched.** A migration is staged
at `supabase/migrations-pending/20260730_ai_tutor_failures.sql`; the Edge Function change is
specified here but deliberately not written, because it needs its own approval and a CLI deploy.

Follows `docs/roadmap/ai-tutor-failure-observability.md`. Agreed going in: a dedicated table rather
than overloading `ai_model_calls`, and the dashboard's blind-spot notice narrowed rather than removed.

---

## 1. Two findings that shape the schema

### 1.1 There is exactly one 5xx path in the whole function

`grep` for every `safeError(5xx…)` in `index.ts` returns **one** hit: the top-level catch at 4070.
Every other guard returns 4xx. So this is a single instrumentation point, not a sweep — and any
future 5xx added elsewhere would bypass it, which is worth a review note rather than a mechanism.

### 1.2 The correlation id we give students is never persisted anywhere

Two different identifiers exist, and they are not the same value:

| Value | Line | Shape | Where it goes today |
|---|---|---|---|
| `cid` | 2260 | `crypto.randomUUID().slice(0, 8)` — 8 hex chars | Returned to the client as `correlation_id`, and logged. **Never written to any table.** |
| `requestId` | 2271 | full `crypto.randomUUID()` | Written to `ai_model_calls.request_id` |

So when a student reports *"I got an error, the code was `a3f9c1d2`"*, **that code cannot currently
be joined to anything.** It exists only in the response they saw and in a log line.

Storing both closes that loop: `cid` makes the row findable from a student report, `request_id`
joins it to whatever provider calls did happen. **That is the single most operationally useful thing
this table can do**, and it is nearly free.

One caveat to record: `cid` is 8 hex characters, so collisions become likely around ~65k rows by the
birthday bound. At ~400 requests/month it is fine for years, and it is a *lookup aid*, not a key —
`request_id` is the identity. Worth knowing before anyone treats `cid` as unique.

---

## 2. What is honestly known at throw time

The handler already maintains `teleCtx` (declared 2274, read by the `finally` at 4109). Every field
starts `null` and is filled in as the request progresses:

```ts
const teleCtx: {
  clientRequestId:  string | null;
  questionRecordId: string | null;
  sessionId:        string | null;
  userId:           string | null;
  operation:        string | null;
} = { clientRequestId: null, questionRecordId: null,
      sessionId: null, userId: null, operation: null };
```

**This means "how far did the request get" is already encoded, and needs no new bookkeeping.** A
hand-maintained `stage` marker would be one more thing to keep in sync with the code, and it would
drift. Deriving it cannot drift, because the fields are already load-bearing for the existing flush.

### 2.1 The vocabulary is a contract; the derivation is not

An earlier draft named the four values `pre_auth` / `pre_parse` / `pre_persist` / `post_persist`.
Those were named after *the mechanism that computes them* — which `teleCtx` field was still null —
and after internal steps (`parse`, `persist`). That is the wrong coupling: rename `teleCtx`,
restructure the handler, or move where the insert happens, and the vocabulary either breaks or
quietly starts meaning something else, with years of stored rows behind it.

**Two separate things, deliberately:**

**The vocabulary — stable, implementation-independent, and the thing stored.** Each value is a
milestone in the life of a tutoring request that any implementation has, phrased as *what was
achieved* rather than what had not happened yet. `stage_reached` records **the furthest milestone
reached before the failure**.

| Value | Milestone — what was true when it failed |
|---|---|
| `received` | The request arrived and was accepted. Nothing further was established — we do not even know who was asking. |
| `identified` | The caller is known. |
| `interpreted` | What is being asked is known. |
| `recorded` | The interaction has been persisted and is durable. |

Nothing there names a variable, a table, a framework or a function. A rewrite in another language
would still have all four. They are also ordered, so "failed before being recorded" is expressible
without enumerating the earlier values, and a new milestone can be inserted later without renaming
or re-meaning any existing one — the values are names, not positions.

**The derivation — implementation-specific, expected to change, and not a contract.** For the current
handler:

| Milestone | Current condition |
|---|---|
| `received` | `teleCtx.userId` is null |
| `identified` | `userId` set, `operation` null |
| `interpreted` | `operation` set, `questionRecordId` null ← **the invisible class this work is about** |
| `recorded` | `questionRecordId` set |

This table may be rewritten whenever the handler changes. The one above it may not. If a future
version has no `teleCtx` at all, only the derivation is rewritten and every stored row keeps its
meaning.

Note that "did we reach the provider" is deliberately **not** a milestone: it is orthogonal to the
lifecycle and already captured by the `provider_calls` column. Folding it in would make the stage
vocabulary depend on how many upstream calls a given implementation happens to make.

`teleSink.length` additionally gives the number of provider calls recorded for the request, so
"did we reach OpenAI at all" is known rather than inferred.

**Nothing in the proposed schema is invented.** Every column is a value already in scope at 4070.

---

## 3. Proposed schema

```sql
CREATE TABLE public.ai_tutor_failures (
  id                 bigserial   PRIMARY KEY,
  occurred_at        timestamptz NOT NULL DEFAULT now(),

  correlation_id     text        NOT NULL,   -- cid; what the student was shown
  request_id         uuid        NOT NULL,   -- joins ai_model_calls.request_id
  client_request_id  uuid,
  question_record_id uuid,                   -- NULL = failed before the insert
  session_id         uuid,
  user_id            uuid,

  operation          text,
  stage_reached      text        NOT NULL,   -- derived, see §2
  error_class        text        NOT NULL,   -- e.g. 'ReferenceError'
  error_message      text,                   -- truncated, see §5
  provider_calls     integer     NOT NULL DEFAULT 0
);
```

Deliberately **not** included: `prompt_tokens`, `completion_tokens`, anything cost-shaped, the
question text, the image, and the stack trace (§5).

Indexes: `(occurred_at DESC)` for the dashboard window, `(correlation_id)` for the student-report
lookup, `(request_id)` for the join.

---

## 4. Where the write goes

**In the existing `finally`, not a new code path.** The catch sets a local; the `finally` block that
already flushes model calls also enqueues the failure insert, inside the same
`EdgeRuntime.waitUntil` and the same `try { … } catch { /* telemetry must never fail a request */ }`.

Reasons:

- `waitUntil` keep-alive, non-blocking write, and swallow-all error handling are already there and
  already exercised on the error path. One place manages isolate lifetime rather than two.
- The existing block is guarded so telemetry cannot fail a tutoring request. A failure-recording
  path that could itself throw would be a poor trade.
- It is a handful of lines inside a block that already runs on every exit.

**The write must never await before the response returns.** The student is already receiving a 500;
holding it open to record that fact would make a bad experience worse.

---

## 5. `error_message` — resolved: optional diagnostic metadata, never depended upon

**Decided 2026-07-30 (owner): stay conservative.** `error_message` is optional metadata. The primary
operational signals are `error_class` and `stage_reached`, and **no dashboard panel may depend on the
message being present, populated, or well-formed.**

The reasoning that led there. The existing catch already logs `err.message` and `err.stack` to the
console, but persisting them is a different exposure — console logs age out, table rows do not. There
is direct precedent for caution in this exact function; the catch carries the comment:

> *Echoing `String(err)` previously leaked Postgres constraint/column names and Deno stack frames to
> anyone who could make the function throw.*

That was about the **client response** and was fixed. Storing server-side for owner-only reading is a
weaker concern but the same class: a Postgres error can embed column values, and column values can be
student data.

**What this means concretely:**

| | |
|---|---|
| Stored | Yes — nullable, truncated to 500 chars by the writer |
| Stack trace | **Never stored.** Stays in Edge Function logs, findable by `correlation_id` |
| Returned by the operational RPC | **No** — see §6 |
| May a panel depend on it | **No.** A panel that breaks or misleads when it is `NULL` is a defect |

This is the same store-vs-expose split already agreed for `user_id`: keeping a value for ad-hoc
investigation is a different decision from putting it on an operational surface, and they should be
made separately.

`error_class` plus `stage_reached` identifies a regression like v90 unambiguously on their own — the
message only shortens the diagnosis. Treating it as an accelerant rather than a dependency means the
column could later be dropped, redacted, or left permanently `NULL` without any panel changing.

---

## 6. Read path

An owner-gated `SECURITY DEFINER` RPC, consistent with `ai_monitor_call_health` / `_call_failures`:
`REVOKE EXECUTE … FROM PUBLIC, anon`, guard raising `42501`, fixed typed return, and the table itself
service-role with **no RLS policy and no client grant** — the same shape as `ai_model_calls`.

**Two columns are stored but not returned: `user_id` and `error_message`.**

`user_id` — storing it is operationally necessary: it is the difference between *"one student is
hitting a bad input"* and *"everyone is down"*, which is the first question during an incident.
Returning it is not. The RPC returns a **distinct-user count** per failure group, which answers that
question without putting identifiers on a platform-health surface.

`error_message` — excluded per §5, so the operational contract cannot come to depend on it.

Proposed return, for review — the operational signals only:

```
ai_monitor_tutor_failures(p_since timestamptz DEFAULT NULL)
  RETURNS TABLE (
    error_class     text,
    stage_reached   text,
    operation       text,
    failures        bigint,
    distinct_users  bigint,   -- count, never the ids
    first_seen      timestamptz,
    last_seen       timestamptz
  )
```

Grouped rather than row-level, matching the aggregate posture of the two applied RPCs. Finding an
individual failure from a student's `correlation_id` is a distinct need with a distinct shape, and if
it is wanted it should be its own reviewed function rather than a widening of this one — the same
conclusion F2 reached about per-row grain.

---

## 7. What this does and does not close

**Closes:** every 5xx that reaches the handler, including v90 — its `ReferenceError` threw at 2384,
after `teleAdmin` was assigned at 2328, so the row would have been written. Those failures currently
leave no trace at all.

**Does not close:** cold-start and bundle failures, where `serve()` never runs — which is what both
2026-06-17 truncated-stub incidents were. Also worker kill, OOM, wall-clock timeout, a throw between
2322 and 2327 before the admin client exists, and a failure of the failure-write itself.

So the dashboard notice **narrows, it does not go away**. Proposed wording once this ships:

> 5xx failures that reach the handler are now recorded here. Failures where the function never
> started — a bad deploy, a bundle error, a worker kill — still write nothing anywhere, because no
> code inside the function runs. For those, check Edge Function logs.

Deleting the notice on the strength of this table would recreate the original defect one level down.

---

## 8. Open questions

1. ~~**`error_message` at all?**~~ **Resolved 2026-07-30** — stored, truncated, no stack trace,
   excluded from the operational RPC, and no panel may depend on it. See §5.
2. **Retention.** These are operational rows, not historical facts. A TTL — 90 days? — or keep
   indefinitely given the volume is tiny? Note the §5 decision makes this easier: since nothing
   depends on `error_message`, a retention policy could redact just that column on an older window
   while keeping the counts, rather than deleting whole rows.
3. ~~**`stage_reached` values.**~~ **Resolved 2026-07-30** — `received` / `identified` /
   `interpreted` / `recorded`, as milestones rather than checkpoints, with the derivation held
   separate and explicitly non-contractual. See §2.1.
4. **Should a 5xx added elsewhere later be caught?** Today there is exactly one 5xx path. A CI grep
   asserting that stays true would keep this table honest; without it, a future `safeError(503, …)`
   would silently bypass the recording.

---

## 9. Sequencing note

The Edge Function change requires **Path B (CLI) only** per DEPLOY.md §4 — the inline deploy tool is
prohibited for `ai-tutor` and the multi-file bundle rules out Dashboard copy-paste. The migration can
land first and independently: an unused table is harmless, and it means the function change ships
into a schema that already exists rather than the two having to be simultaneous.

Worth doing in that order, and worth confirming who runs the CLI deploy before the function change is
written.
