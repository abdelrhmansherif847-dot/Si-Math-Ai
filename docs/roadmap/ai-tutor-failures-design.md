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

**This means "how far did the request get" is already encoded, and needs no new bookkeeping.** It can
be derived from which fields are populated rather than maintained by hand:

| Derived stage | Condition |
|---|---|
| `pre_auth` | `userId` is null |
| `pre_parse` | `userId` set, `operation` null |
| `pre_persist` | `operation` set, `questionRecordId` null ← **the invisible class this work is about** |
| `post_persist` | `questionRecordId` set |

A hand-maintained `stage` marker would be one more thing to keep in sync with the code, and it would
drift. Deriving it cannot drift, because the fields are already load-bearing for the existing flush.

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

## 5. `error_message` — the one judgement call

The existing catch already logs `err.message` and `err.stack` to the console. Persisting them is a
different exposure: console logs age out, table rows do not.

There is direct precedent for caution in this exact function. The catch carries the comment:

> *Echoing `String(err)` previously leaked Postgres constraint/column names and Deno stack frames to
> anyone who could make the function throw.*

That was about the **client response**, and was fixed. Storing server-side for owner-only reading is
a weaker concern, but the same class: a Postgres error can embed column values, and column values
can be student data.

**Proposal:** store `error_class` always; store `error_message` **truncated to 500 characters**; do
**not** store the stack trace — it stays in the logs, where the correlation id can find it. If even
the message is judged too risky, `error_class` plus `stage_reached` still identifies a regression
like v90 unambiguously, so the message is an accelerant rather than a requirement.

---

## 6. Read path

An owner-gated `SECURITY DEFINER` RPC, consistent with `ai_monitor_call_health` / `_call_failures`:
`REVOKE EXECUTE … FROM PUBLIC, anon`, guard raising `42501`, fixed typed return, and the table itself
service-role with **no RLS policy and no client grant** — the same shape as `ai_model_calls`.

**`user_id` is stored but not returned.** Storing it is operationally necessary: it is the difference
between *"one student is hitting a bad input"* and *"everyone is down"*, which is the first question
during an incident. Returning it is not — the RPC can return a **distinct-user count** per failure
group, which answers that question without putting identifiers on a platform-health surface. Store
and expose are separate decisions, and this is the case where they should differ.

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

1. **`error_message` at all?** §5 proposes truncated-to-500 with no stack. The conservative
   alternative is `error_class` only.
2. **Retention.** These are operational rows, not historical facts. A TTL — 90 days? — or keep
   indefinitely given the volume is tiny?
3. **`stage_reached` values.** Are the four in §2 the right vocabulary, or is `pre_persist` worth
   splitting further?
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
