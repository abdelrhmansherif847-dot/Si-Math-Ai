# Closing the 5xx observability gap — design discussion

**Status:** steps 1 and 2 are implemented; steps 3–4 remain design only.
Prepared 2026-07-30 against `igvkyxkmjnkzscqgommj`.

- **Step 1 — done.** The smoke-test fail-open gate is closed.
- **Step 2 — half shipped.** `ai_tutor_failures` is **applied in production**
  (`20260730231948`, plus `20260730_ai_tutor_failures_grant_hardening.sql`). The writer is
  **written and committed as v92 (`b553cf3`) but NOT deployed** — it needs a CLI deploy per
  DEPLOY.md §4. Until that deploy happens the table exists and stays empty, which is the
  intended order: schema first, function second.
- **Steps 3–4 — design only.** The dashboard still shows the un-narrowed blind-spot notice, and
  there is no read RPC, so nothing consumes the table yet.

The gap: when `ai-tutor` returns 5xx before writing to `question_records` or `ai_model_calls`,
nothing is persisted anywhere. AI Monitor can honestly report "None recorded" while students were
getting errors. Confirmed live — two `POST 500` responses on 2026-07-29 left zero rows behind.

Four findings below. The first makes this cheaper than expected; the second settles where the data
goes; the third bounds what can be achieved; the fourth is the one I'd act on first, and it isn't
telemetry.

---

## 1. The mechanism already exists — this is a small change, not a new subsystem

`index.ts` already has everything needed:

| Line | What is already there |
|---|---|
| 2322 | `try {` — the top-level handler try block |
| 2327–2328 | `const sbAdmin = createClient(...)`, then `teleAdmin = sbAdmin` — *"the `finally` flush needs a client"* |
| 4070 | `} catch (err) {` — logs the error, returns `safeError(500, 'internal_error', …, { correlation_id: cid })`, **persists nothing** |
| 4088+ | `} finally {` — already flushes model-call telemetry **on every exit path, including the error path**, non-blocking, kept alive by `EdgeRuntime.waitUntil` |

So the hard parts are solved and in production: an admin client that is deliberately in scope on the
error path, a flush that already runs when the handler throws, a non-blocking write that does not
hold the student's response open, and a `waitUntil` keep-alive. The v90 telemetry work built this.

**What is missing is only the record itself.** The catch block knows `err`, `cid`, and (usually) the
user and request context; it just doesn't write them down.

That materially changes the cost/risk calculus: we are adding a row to an existing, exercised
error-path write, not introducing a new failure-time code path that has never run.

---

## 2. It must be a dedicated table — and that is forced, not a preference

`ai_model_calls` has four `NOT NULL` columns with **no default** that exist to describe a provider
call:

```
service_code   text   NOT NULL
stage          text   NOT NULL
provider       text   NOT NULL
model          text   NOT NULL
```

A 5xx thrown before any provider call has none of them. Writing there means **inventing a service, a
stage, a provider and a model for a call that never happened** — fabrication of exactly the kind this
engagement has spent its time removing. Worse, `prompt_tokens` and `completion_tokens` default to
`0`, so the row would read as *"a call that consumed no tokens"* rather than *"no call occurred"*.

It would also corrupt the RPCs applied last week. `ai_monitor_call_health` computes
`calls = count(*)` and a success rate over it; synthetic rows would inflate `calls` and depress the
success rate with events that were not calls. **My own reporting would start lying** — the precise
failure mode the audit removed.

Forward-looking: INV-16 plans `cost_facts.call_id → ai_model_calls.id`. No FK references the table
today (`cost_facts` does not exist yet), but synthetic rows would eventually flow into cost
allocation.

**Conclusion:** a dedicated table — `ai_tutor_failures` or similar — recording what is actually
known at throw time: correlation id, timestamp, error class and message, the stage reached, and
whether any provider call had been made. Nothing invented.

---

## 3. The gap narrows; it does not close. And the two worst outages stay invisible.

This is the part I want to be explicit about, because the temptation will be to delete the
dashboard's blind-spot notice once the table exists.

**What an in-function catch would catch.** Anything thrown after the handler is entered — including
v90. Its `ReferenceError` threw at `index.ts:2384`, *after* `teleAdmin` was assigned at 2328, so a
failure record could have been written. Layer 1 would have worked for the incident that prompted
this.

**What it structurally cannot catch:**

| Class | Why it is invisible |
|---|---|
| **Cold-start / bundle failure** | `serve()` never runs, so no handler code executes. **The 2026-06-17 truncated-stub incidents were exactly this** — DEPLOY.md §4: *"a partial or placeholder file was deployed, the `serve()` handler was absent, and every student request returned 500."* |
| Worker kill / OOM / wall-clock timeout | The isolate is terminated; no `catch` and no `finally` run |
| Throw between 2322 and 2327 | `sbAdmin` does not exist yet, so there is nothing to write with |
| Failure of the failure-write | If the database is the thing that is down, the record is lost too |

The two worst outages in this project's history are in the first row of that table. **No in-function
mechanism could have recorded them**, because the function never ran.

So: the notice must be **narrowed and kept**, not removed. Something like *"5xx failures that reach
the handler are now recorded; cold-start and worker-kill failures still are not — check Edge Function
logs."* Replacing it with silence would recreate the original defect one level down.

**Layer 2, if you want cold-start coverage:** an external probe — a scheduled job outside the
function that calls it and records the outcome. That is the only thing that observes a function which
isn't running. It would have caught both 2026-06-17 incidents and would have bounded v90's duration.
Worth a separate discussion; it needs a cron and a caller identity.

---

## 4. Prevention already exists and is switched off — I would do this first

From the v91 postmortem, verbatim:

> The smoke test's Layer 2 DOES execute it and would have caught this — but it is gated on
> `SUPABASE_TEST_JWT`, which was unset, so it was skipped. Layer 1 stops at the 401 auth gate,
> upstream of the fault, and passed while production was down.

I verified the mechanism rather than taking the postmortem's word for it.
`scripts/smoke-test-ai-tutor.sh`, lines 71–76:

```bash
if [ -z "${SUPABASE_TEST_JWT:-}" ]; then
  echo "→ Functional smoke: SKIPPED (SUPABASE_TEST_JWT not set)"
  echo ""
  echo "smoke-test-ai-tutor: heartbeat OK"
  exit 0
fi
```

**It does not merely skip — it prints a success line and exits `0`.** Any CI step or human reading the
exit code sees a pass, from a run that never executed the handler. That is a **fail-open gate**, and
it is the same shape as three other findings from this engagement: the direct-RLS option that would
expose future columns automatically, `ai_usage_logs` activating silently on backfill, and the alerts
that showed green on thresholds they could not evaluate. The default is "looks fine" when the truth
is "did not check".

So for the very failure class motivating this work, **a test that would have prevented the outage
already exists, did not run, and reported success.** The runbook has since been updated to call
Layer 2 required rather than optional, but "required" in prose is not the same as enforced in the exit
code.

The minimal fix is a few lines: when `SUPABASE_TEST_JWT` is absent, exit non-zero — or at least stop
printing a pass — so the gate fails closed. Whether a full deploy should be *blocked* on it is a
separate policy call, but a run that checked nothing should not exit 0.

Better telemetry tells you an outage happened. That test stops it shipping. I would rate ungating it
above both telemetry layers on value, and it costs no new code — only a secret and a gate that fails
closed when the secret is absent, rather than skipping.

> **✅ RESOLVED 2026-07-30.** Everything above describes the state as found; the fail-open gate is
> closed. A missing credential now exits 2 with no pass line, `deploy-ai-tutor.sh` demands both
> values before it deploys, and two further fail-open paths in the same script were closed —
> unreachable now exits 2 (unverified) rather than 1 (broken), and skipping the `question_records`
> check no longer prints `ALL CHECKS PASSED`. All four exit paths were exercised against a local
> stub. Findings 1–3 remain design only.

This does not replace the failure table: telemetry still matters for failures that are nobody's
regression. But if the goal is "fewer minutes of students seeing 500s", the cheapest large win is a
test that already exists.

---

## Proposed order

1. ✅ **DONE 2026-07-30 — the smoke test no longer reports success without executing the handler.**
   A missing `SUPABASE_TEST_JWT`/`SUPABASE_ANON_KEY` now exits 2 with no pass line, instead of
   printing `heartbeat OK` and exiting 0. `deploy-ai-tutor.sh` requires both *before* deploying, so
   a missing credential stops the run while production is untouched, and forwards them explicitly
   rather than relying on shell inheritance. Two further fail-open paths in the same script were
   closed: an unreachable endpoint now exits 2 (unverified) rather than 1 (broken), and a run that
   skipped the `question_records` write check no longer claims `ALL CHECKS PASSED`.
2. **`ai_tutor_failures` table + write from the existing catch** — reuses the proven `teleAdmin` /
   `finally` path. Migration + ai-tutor change.
   - ✅ **Migration applied 2026-07-30.** Post-apply verification found the schema exactly as
     designed and two privilege deviations, both closed by
     `20260730_ai_tutor_failures_grant_hardening.sql`: `service_role` had retained UPDATE and
     DELETE, and `anon`/`authenticated` had retained `rwU` on the owned sequence. Both came from
     the same cause — schema `public` grants ALL on new tables by default, so the migration's
     narrow-looking `GRANT` restricted nothing and only the missing `REVOKE` mattered.
   - ⏳ **ai-tutor v92 written and committed (`b553cf3`), not deployed.** CLI deploy only.
3. **Narrow the dashboard notice** and read the new table. Small UI change, after 2 is deployed and
   has produced a row.
4. **External probe for cold-start** — separate discussion; the only route to the class that stays
   invisible.
5. **Revisit F2** once real failure rows exist, as agreed.

---

## Deployment constraint — worth stating before anyone plans a date

Step 2 modifies `ai-tutor`. Per CLAUDE.md §1 and DEPLOY.md §4:

- `mcp__Supabase__deploy_edge_function` **must not** be used for `ai-tutor` under any circumstances.
- Since v83 the function is a **multi-file bundle** (`index.ts` + `_shared/taxonomy.core.js`), so the
  Dashboard copy-paste path is also disallowed — it ships only `index.ts` and the import would
  resolve to nothing, causing exactly a cold-start 500.
- **Path B (CLI) only**, with a post-deploy check that the bundle shows both files.

I can write and verify the code; the deploy itself has to go through the CLI path. Worth agreeing who
runs it before we schedule step 2 — the alternative is a finished change sitting unshipped.

---

## Open questions

1. **Table name and shape.** `ai_tutor_failures` recording `correlation_id`, `occurred_at`,
   `error_class`, `error_message`, `stage_reached`, `had_provider_call`, `user_id?` — is `user_id`
   wanted, or does it stay out on the same reasoning that kept it out of the monitor RPCs?
2. **Read path.** Another owner-gated RPC for consistency with the applied pattern, or is a plain
   RLS policy defensible here given the table would carry no financial columns?
3. **Retention.** Failure rows are operational, not historical facts. Do they need a TTL?
4. **Does step 1 change your ordering?** It is process rather than telemetry, so it sits slightly
   outside the framing of "improve the telemetry itself" — but it targets the same incidents.
