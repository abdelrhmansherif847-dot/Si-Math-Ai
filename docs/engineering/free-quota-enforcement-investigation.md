# Free students were not blocked at the daily limit — investigation and fix

**Reported:** 2026-08-02 — "free users are not being blocked after reaching the
question limit; the backend keeps serving Zero responses."
**Status:** code fix complete (`ai-tutor` v96 + `chat.html`), **not yet
deployed**. One migration PREPARED and awaiting approval.
**Branch:** `claude/free-quota-enforcement-bug-satsry`

---

## 1. Finding, in one line

The Edge Function performed **no quota check at all**. The daily cap was
enforced in the browser, and the browser is not a place a cap can be enforced.

---

## 2. The path, traced end to end

The report named four stages — subscription lookup → usage counter → limit check
→ AI invocation. Three of them exist and are correct. They are just not on the
server's path.

### What actually ran, per request (pre-v96)

```
browser: chat.html sendMessage()
  └─ CreditConfig.charge()  →  RPC consume_credits()   ← the ONLY quota check
       ├─ subscription lookup   profiles → plan_code, credits, expiry
       ├─ usage counter         COUNT(ai_usage_logs WHERE created_at >= today)
       └─ limit check           pricing_settings.daily_limit for that plan
  └─ if ok → sb.functions.invoke('ai-tutor')
                 │
                 ▼
POST /functions/v1/ai-tutor
  1 preflight · 2 method · 3 origin · 4 content-type · 5 declared size
  6 auth              getUser() — is this a real, signed-in user?
  7 rate limit        20/min, 200/hr, in-isolate
  8 body parse + field bounds
    idempotency replay
    session resolution · profile fetch · reference resolution
    worksheet navigation guard
                 ▼
    ─── no subscription lookup ─── no usage counter ─── no limit check ───
                 ▼
    OpenAI  (question detection · main completion · classifier · L3 shadow)
```

Between an authenticated student and a paid provider call there were exactly two
controls: *are you signed in*, and *are you sending faster than 200/hour*. A
FREE plan allows **15 turns a day**. The rate limiter allows **4,800**.

### Why it looked enforced

`supabase/functions/ai-tutor/index.ts`, beside `RATE_LIMITS`:

> the durable per-user quota is the credits system (`consume_credits`) **which is
> already enforced server-side**.

`SECURITY.md` §5.2, layer 4 of the DDoS posture:

> **Credits system** — the durable per-user economic ceiling, **already enforced
> server-side** by `consume_credits`.

Both sentences name a real function that really is a correct server-side gate.
Neither was false about `consume_credits`. Both were false about the system,
because nothing on the server ever called it. The claim survived a security
audit (SEC-08) that examined the RPC's authorization in detail and concluded
"`consume_credits` authorization: correct" — which it is. Auditing an RPC
answers *may this caller do this*. It never asks *does anything make the caller
ask*.

---

## 3. What was NOT wrong

Worth stating plainly, because the instinct on a report like this is to go
looking for a broken comparison:

- **`consume_credits` is correct.** `SECURITY DEFINER`, `search_path` pinned,
  AUTHZ-01 dual-authorization guard, `FOR UPDATE` on the profile row, inline
  expiry enforcement, an admin short-circuit, and a FREE branch that spends the
  daily allowance first, then pack credits, then refuses.
- **The plan catalogue is correct.** `plan_definitions` (via the
  `pricing_settings` view) carries `FREE.daily_limit = 15`, active.
- **The counter is correct.** Production shows the FREE branch working whenever
  it was reached — user `68440e68` on 2026-06-18: ten rows at `credits_used = 0`
  (18:43→19:38), then fifteen at 5 credits (19:41→19:51). The free allowance was
  10 that day, it was spent, and the student paid from pack credits after it.
  That is the gate doing exactly its job.
- **The reported number.** The report says "10-question limit"; the live value
  is **15**, and 10 is what it was in June. `chat.html`'s upsell string carries
  `daily_limit || 10` as a fallback, which is where a stale 10 can still surface
  in the UI. Not a bug — but the limit is 15, and the fix does not change it.

The defect was the absence of a call, not the failure of a check.

---

## 4. Second hole, found on the same trace

`consume_credits` computes daily usage by **counting rows**:

```sql
SELECT COUNT(*) INTO v_daily_used FROM ai_usage_logs
 WHERE user_id = p_user_id
   AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
```

`refund_ai_credit` **deletes** one:

```sql
DELETE FROM ai_usage_logs
 WHERE id = p_log_id AND user_id = auth.uid()
RETURNING user_id, credits_used INTO v_user_id, v_credits;
```

So a refund rewinds the daily counter. `refund_ai_credit` is granted to
`authenticated` (measured: `has_function_privilege('authenticated', …) = true`)
and its only check is that the row belongs to the caller — so a student can
refund their own turns from the browser console and never reach the cap. FREE
rows are the easiest target: they carry `credits_used = 0`, and the function has
a branch that returns `ok: true, refunded: 0, reason: 'no_credits_were_charged'`
**after** the row is already gone. Nothing to restore is true about the credits
and false about the quota. 807 of 1,177 `ai_usage_logs` rows are zero-credit
rows — that is what the FREE cap is made of.

This one would have survived a fix that only added a server-side charge.

---

## 5. The fix

### 5.1 `ai-tutor` v96 — the entitlement gate

A gate that calls `consume_credits` with the **service-role** client, placed
after the idempotency replay and the 0-token worksheet guard, and before every
provider call. AUTHZ-01 already provides for this: a caller with no JWT
(`auth.uid() IS NULL`) may consume on behalf of any user.

**It fails closed.** RPC error, thrown RPC, `null`/malformed result, a `feature_not_found`
that survives the legacy-feature retry — every one denies. The defect was a path
that reached OpenAI without a decision; no way of failing to reach one may
resemble permission. A student sees a retryable 503, never a free answer.

**402 vs 503.** A decided "no" is 402 with the RPC's own reason
(`daily_limit_reached`, `insufficient_credits`, …) plus `daily_used`,
`daily_limit`, `balance`, `required`. An undecidable outcome is 503. Conflating
them either hides an outage behind an upsell or tells a paying student to
upgrade because a socket dropped.

**The charged operation is derived, not received** — image → `CHAT_IMAGE`,
explicit follow-up → `CHAT_FOLLOWUP`, else `CHAT_TEXT`. A client that could name
its operation could name the cheapest one. `teleCtx.operation` now calls the same
`creditFeatureFor()` the gate bills with, so cost reporting cannot drift from
billing; it used to be an inline copy kept in agreement by a comment.

### 5.2 Refunds moved to the party that observes the failure

- **Handler threw** → full refund. The student got a 500 and no answer, so they
  pay neither credits nor a daily slot.
- **Out-of-scope turn** (v87 scope guard) → refund **only if credits were
  actually spent**. v87's rule stands — a redirect is not tutoring, so credits
  come back — but a zero-credit FREE turn has nothing to refund, and "refunding"
  it would only delete the row and rewind the cap. The gpt-4o call was made; the
  slot it was made against stays spent. Without this, a student sending nothing
  but off-topic messages would never reach the cap while costing a real call
  every turn.
- `refundEntitlement()` tries the service-role client first and falls back to the
  user's JWT, so it works both before and after §5.4 is applied. That is what
  lets the code and the migration ship independently.

### 5.3 `chat.html` — stops charging, stops refunding

The page no longer calls `consume_credits` for chat sends (the Study Planner
still does — see §7) and no longer calls `refund_ai_credit` on any chat path.
`askAI()` translates the server's 402 into a typed quota error carrying the
verdict; the send path renders the same upsell copy it always did. The refund
queue is now a one-shot legacy drain for queues written by pre-v96 clients.

### 5.4 No client path to `refund_ai_credit` remains

Asserted in CI over every root `*.html` and `*.js`, not just the page that used
to call it. Two call sites were removed rather than grandfathered:

- **`drainRefundQueue()`** replayed a pre-v96 `localStorage` queue through the
  RPC on every page load. Now `discardLegacyRefundQueue()`, which deletes the
  queue and calls nothing. A "legacy" call site is still a live one, and its
  input was client-controlled storage — i.e. whatever the caller decided.
- **The Study Planner** charged first and refunded from the browser if its local
  engine threw. It now **builds the plan first and charges after**, so the
  failure it was refunding cannot happen after a charge. The planner makes no
  provider call, so ordering the work before the paywall costs nothing. The
  residual window is a throw in `saveStudyPlan` after the charge; the plan is
  still rendered (with `saved: false`), so the student gets what they paid for.

### 5.5 Third hole: the charge was not idempotent

**Found by the pre-deployment idempotency check, and it is a regression v96
introduced.** Moving the charge server-side means every HTTP request that
reaches the gate charges. `askAI()` retries **once, automatically**, on a
transport-only failure (the cold-start / preflight class that surfaces with no
HTTP status), reusing the same payload and therefore the same
`client_request_id`. Before v96 that was safe: the browser charged once and
retried only the invocation.

The existing CAI-P1 pre-flight cannot absorb it — it reads `question_records`,
which is not written until *after* the model call. So for the 10–30 seconds a
completion takes, a retry finds nothing and charges again.

Measured 2026-08-02:

| Table | Idempotency key |
|---|---|
| `question_records` | `uniq_question_records_user_request` UNIQUE `(user_id, client_request_id)` WHERE not null |
| `ai_usage_logs` | **none** — no column, no index beyond the PK |

The *answer* was deduplicated and the *charge* was not, because until v96 the
charge did not happen here.

Fix: `supabase/migrations-pending/20260802_consume_credits_idempotency.sql` adds
`ai_usage_logs.client_request_id` + a partial unique index mirroring the one
`question_records` already has, and gives `consume_credits` a
`p_client_request_id` parameter (DEFAULT NULL) that returns the **existing**
charge — same `log_id`, same credits, `idempotent_replay: true` — instead of
making a second one.

The replay check sits *after* the `FOR UPDATE` on `profiles`, because that lock
is the serialization point for a student: a duplicate blocks there until the
winner commits, so the winner's row is visible by the time the check runs.
Checking before the lock lets both callers past. The unique index is the
guarantee behind that reasoning rather than a second copy of it — on
`unique_violation` the handler reverses the deduction this call made and returns
the winner's decision.

`chargeEntitlement` passes the key and falls back to the unkeyed call if the
parameter does not exist yet (PostgREST `PGRST202`, which rejects at the schema
cache before any SQL runs — so nothing was charged and the retry is safe). The
fallback is deliberately **not cached**: a cached "unsupported" would keep
charging unkeyed for the life of the isolate after the migration landed, which
is the exact failure the change exists to prevent. `keyed: false` is logged so
an unprotected request is greppable.

### 5.6 PREPARED, not applied

Two migrations, both requiring explicit approval (CLAUDE.md §3):

| File | What it closes | When |
|---|---|---|
| `20260802_consume_credits_idempotency.sql` | §5.5 — duplicate charge on retry | **First**, before the deploy — additive and backward-compatible |
| `20260802_refund_ai_credit_server_only.sql` | §4 — client-callable quota reset | **Last**, after the site is live |

---

## 6. Verification

`tests/entitlement-gate.test.mjs` — 79 checks, slicing the real shipped bytes out
of `index.ts` and executing them, per the house rule that a suite must not
paraphrase the code under test.

Behaviour: every deny reason, every fail-closed path, `ok` compared with `===
true` so a truthy value from a changed contract is not permission, and the
legacy-feature retry bounded at exactly one attempt.

Wiring — the checks that would have caught the shipped bug, and the reason the
suite is not just unit tests:

- the handler calls the gate;
- the gate precedes **every** provider call in the handler — the direct OpenAI
  fetch, `detectQuestionsInImages`, `detectorV2Classify`, `runL3ShadowPipeline`;
- the idempotency replay and the 0-token worksheet guard precede the gate, so
  neither is billed;
- both deny branches `return`;
- the browser's send path charges nothing and refunds nothing.

**Mutation-checked**, per `docs/roadmap/verification-framework-audit.md` — a
green check is only evidence if it could have gone red:

| Mutation | Result |
|---|---|
| `chargeEntitlement` returns `ok` on RPC error (fail open) | 2 checks red |
| gate moved after the main OpenAI call (the shipped bug's shape) | 2 checks red |

Full suite: **27/27 green**, up from 26 (baseline re-run before any edit).

---

## 7. Deliberately out of scope

- **The Study Planner still charges from the browser** (`chat.html`, 20 credits,
  `always_charge`). It makes **no provider call** — the engine is pure
  client-side computation — so skipping it costs no money and cannot touch the
  FREE cap. It is a client-enforced paywall, which is a revenue question, not
  the reported cost/quota one. `INFRA-5` in the infrastructure backlog, with two
  options and a recommendation.
- **`mock-exam.html`, `focus.html`, `weakness.html`** charge from the browser
  too. All three are FROZEN (CLAUDE.md §2) and all three use `always_charge`
  features, so the FREE daily branch never applies to them.
- **The FREE limit itself** (15/day) is unchanged. Fixing enforcement and
  changing the number are separate decisions and should not arrive together.

---

## 8. Deployment — order matters, and it is not symmetric

Recorded in full at `docs/engineering/deployment-pipeline.md` §5.6.

1. **Apply `20260802_consume_credits_idempotency.sql`.** Additive: the new
   parameter has a default, so today's seven-argument callers are untouched and
   behave exactly as now. Safe against the currently-live v95 + old client, which
   is why it goes first rather than last — it means the gate is protected against
   duplicate charging from its very first request.
2. **Deploy `ai-tutor` v96** (DEPLOY.md §4 — never the inline MCP tool; Path B
   CLI only, four-file bundle).
3. **Verify** platform version + sha256 + all four bundle files.
4. **Merge `chat.html`** to `main`.
5. **Apply `20260802_refund_ai_credit_server_only.sql`.**
6. **Run the end-to-end verification** in §10.

Between 2 and 4 both halves charge — students are billed twice per turn (free
students under the cap: two daily slots, zero credits). Visible, bounded,
refundable. The reverse order charges *nobody* for the length of the window,
which is the bug this work exists to remove. Do not reverse it, and do not do
both in one breath — verify between.

Step 1 does not shrink that window (the old client and the new function use
different `client_request_id` values for the same turn — the old client does not
send one to `consume_credits` at all). It is first because it is free to do
first and because it means step 2 lands already protected.

---

## 10. End-to-end verification

To run **after** step 5, against production. Each check names what would make it
fail, so a pass means something.

| # | Check | Method | Pass |
|---|---|---|---|
| 1 | Free user at the cap gets 402 | Test account on FREE, 15 turns, then one more | HTTP 402, `reason: daily_limit_reached`, `daily_used: 15`; the upsell renders; **no `ai_model_calls` row for the blocked turn** |
| 2 | Paid user unaffected | PRO account, several turns | 200 each, `credits_balance` falls by the per-operation cost, no 402 |
| 3 | RPC failure fails closed | Rename `consume_credits` in a transaction and roll back, or point the gate at a missing feature | HTTP 503 `entitlement_unavailable`, **not** 402, and no OpenAI call |
| 4 | Refunds are server-only | As a signed-in student: `select public.refund_ai_credit('<own log id>')` | `permission denied for function refund_ai_credit` |
| 5 | No duplicate charge on retry | Two invocations with the same `client_request_id` | One `ai_usage_logs` row; second reply carries `idempotent_replay: true` with the same `log_id` |

Check 1's "no `ai_model_calls` row" clause is the one that actually proves the
gate is *before* the provider call rather than merely present — a gate that
denies after the completion would pass every other clause.

Check 3 must distinguish 503 from 402. A fail-closed path that reports "out of
credits" would send a paying student to the pricing page during an outage, and
would look identical to check 1 in the logs.

---

## 9. What this should change about how the codebase is read

The bug was not hard to see once looked for; it was hard to look for, because
two documents and one code comment said it was already handled. Each was written
in good faith, each named a real and correct component, and each described the
intended architecture in the present tense.

**A control is enforced where it is called, not where it is implemented.** When
a comment or an audit says something is "enforced server-side", the check is:
which server-side line calls it? If the answer is "the browser does", the
sentence is wrong however correct the implementation is.

Corrected in place: the `RATE_LIMITS` comment in `index.ts`, `SECURITY.md` §5.2
layer 4, and the SEC-08 audit conclusion — each now records what was wrong about
the old wording, not just the new fact.
