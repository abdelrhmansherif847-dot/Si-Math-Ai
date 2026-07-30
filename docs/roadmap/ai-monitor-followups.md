# AI Monitor follow-ups F2–F6 — status

Opened from `docs/roadmap/ai-monitor-telemetry-access-proposal.md` §11 after the owner-gated
call-telemetry RPCs were applied (2026-07-30). F1 is closed and shipped.

Security hardening and feature work are being run as **two separate phases**. Phase 1 (hardening) is
under way; phase 2 (features) is paused until it completes.

**Applied to the database:** sec08 sections (a) and (b), on 2026-07-30 — see F6.
**Not applied:** F2 and F5 are staged in `supabase/migrations-pending/`, as is sec08 section (c),
each awaiting individual owner approval per CLAUDE.md §3.

| | Item | State | Needs |
|---|---|---|---|
| **F1** | `owner` floor vs page gate | ✅ **Shipped** | — |
| **F2** | Per-request model attribution | 📝 **Migration staged** | Owner approval, then UI wiring |
| **F3** | Partial index on failures | ⏸️ **Deferred by decision** | Nothing — revisit at a stated threshold |
| **F4** | Token sensitivity (Appendix A) | 🔓 **No longer blocking** | Owner's policy call, at leisure |
| **F5** | `ai_usage_logs` governance | 📝 **Migration staged** | **Governance decision**, then approval |
| **F6** | `anon:EXECUTE` hardening | ✅ **Applied 2026-07-30** | — (sec08 (c) still pending) |

---

## F2 — Per-request provider-call attribution

**Staged:** `supabase/migrations-pending/20260730_f2_ai_monitor_request_calls.sql`

Adds `ai_monitor_request_calls(uuid[])`, owner-gated, same pattern as the two applied RPCs.

Why it is worth doing: the audit deleted a "model (inferred)" column that guessed the serving
model from whether the question had an image. `ai_model_calls` now records the truth. Measured
2026-07-30 — **5 tutor calls, 5 distinct question records, 0 with a NULL record id, and models
spanning both `gpt-4o` and `gpt-4o-mini`.** The model genuinely varies per request, so the deleted
column was guessing at something real; this replaces the guess with the fact.

**This is the one item that needs its own review rather than an amendment**, because it widens the
grain from aggregate to per-row. The migration header argues the case: bounded by an explicit id
list the caller already holds, a hard 100-id cap enforced in-function, a fixed typed column set
with no tokens and no user identifiers, and the same 403 refusal semantics.

UI wiring is deliberately **not** written yet. Shipping a client that calls a non-existent function
would fire a failing RPC on every 60-second refresh; the graceful `NO_FIELD` handling exists, but
there is no reason to lean on it. Wire after apply.

---

## F3 — Partial index on failed calls — deferred, with a threshold

`ai_monitor_call_failures` filters `success IS NOT TRUE`, and there is no index on `success`, so it
sequential-scans.

**Deferred deliberately.** At the projected ~20k rows/year a 20k-row scan is nothing, and the
proposal rejected the pre-aggregated rollup option for being premature at this volume — adding a
speculative index here would be the same mistake in miniature.

**Revisit when** `ai_model_calls` exceeds roughly **500k rows** (about 25 years at current traffic,
or immediately if traffic grows an order of magnitude), or if the Failed provider calls panel
becomes visibly slow. The fix, when needed:

```sql
CREATE INDEX ai_model_calls_failures_idx
  ON public.ai_model_calls (started_at DESC) WHERE success IS NOT TRUE;
```

No action now. This entry exists so the decision is recorded rather than rediscovered.

---

## F4 — Token sensitivity — no longer blocking anything

The open question from Appendix A: are `prompt_tokens` / `completion_tokens` protected financial
data under INV-10, given they permit spend reconstruction against public list prices?

**Status changed from "open question" to "open question with nothing waiting on it."** The applied
RPCs return a fixed operational column set that structurally excludes both token columns, so:

- No panel needs the answer in order to work.
- No migration is blocked on it.
- Resolving it either way requires no code change today.

It still matters for **F5**, and it would matter again if someone proposed surfacing tokens in AI
Monitor. Worth deciding when convenient; not worth blocking on.

---

## F5 — `ai_usage_logs` — a governance decision, now with evidence

**Staged:** `supabase/migrations-pending/20260730_f5_ai_usage_logs_narrow_admin_read.sql`

Policy `admin_select_ai_usage_logs` — `(user_id = auth.uid() OR auth_is_admin())` — lets **every
`is_admin` user** read `estimated_cost_usd` across all rows. That is broader than `super_admin`, and
broader than INV-10 permits.

Harmless today: 1,138 rows, and every token column and `estimated_cost_usd` sums to exactly **0**.

The reason it is worth acting on rather than filing: **it activates silently.** The moment anything
backfills those columns — and `ai_model_calls` now holds the real figures a backfill would draw
from — the exposure changes with no migration, no schema change, and nothing to review. It is the
same fail-open shape the proposal rejected for direct RLS, on a different table.

**What depends on it, checked before proposing anything:**

| Caller | Query | Affected? |
|---|---|---|
| `chat.html:1081` | per-user `count` of own rows | No |
| `pricing.html:487` | per-user `count` of own rows | No |
| `admin.html`, `dashboard.html`, `ai-monitor.html` | **no references at all** | No |

So the `auth_is_admin()` clause is **used by no code in this repository.** Three options are in the
migration header; it implements **narrow to owner**, the smallest change that makes exposure match
the stated invariant while leaving a working path for owner-facing cost tooling.

**This needs a decision, not just an approval** — it turns on how INV-10 is read (F4).

---

## F6 — `anon:EXECUTE` hardening — ✅ applied 2026-07-30

Turned out to be already written as `20260727_sec08_rpc_grant_hygiene.sql`, which predated this
list and was **broader** than the F6 note. Rather than duplicate it, its state was measured and it
was approved and applied in the two phases the owner sequenced. Recorded as:

| Applied file | Effect (measured) |
|---|---|
| `20260730_sec08b_revoke_truncate_grants.sql` | TRUNCATE / TRIGGER / REFERENCES revoked from `anon` + `authenticated` on all 35 public tables — **210 grants removed**. SELECT (78) and write (219) grants untouched. |
| `20260730_sec08a_rpc_grant_hygiene.sql` | `anon` EXECUTE revoked on 12 privileged RPCs. **SECURITY DEFINER functions executable by `anon`: 2 → 0.** Supabase advisor `anon_security_definer_function_executable`: 2 WARN → none. |

Section (b) was the larger item and was not an AI Monitor concern at all: **TRUNCATE is not subject
to RLS**, so no policy could have stopped it. It was unreachable through PostgREST, so latent rather
than live — but one SQL-executing RPC away from total data loss.

**Two findings from the dependency review worth keeping:**

1. **The revoke mechanism could have been a silent no-op.** `REVOKE ... FROM anon` does nothing if
   the grant is held by `PUBLIC`. Checked `aclexplode(proacl)` first: `PUBLIC` held EXECUTE on none
   of the twelve, so the revokes were real. Had it held them, the migration would have appeared to
   succeed while changing nothing.
2. **Revoking could have broken RLS.** `has_role_at_least`, `current_user_role` and `auth_is_admin`
   are called from inside **28 RLS policies**, and a policy expression is evaluated with the querying
   role's privileges — so revoking EXECUTE from a role that evaluates such a policy breaks every
   query on that table. All 28 apply to `{authenticated}` only; not one to `{public}`/`{anon}`. Safe,
   but only because it was checked.

Also measured: only 2 of the 12 revokes changed anything — the pair the advisor flagged. The other
ten were already satisfied and are kept for idempotence.

**Still pending: sec08 section (c)** — `weakness_signals_bak_mig_b1_20260702` and `mig_b1_map`.
Deliberately excluded from the approval rather than bundled in. Both are **already unreadable** by
`authenticated` (RLS on, no policy), so it is defence-in-depth against a future policy, not a live
fix. The file now notes a stronger alternative worth deciding between: revoking grants leaves the
tables discoverable in `public`, whereas `SET SCHEMA private` or dropping them removes them from the
API surface entirely.

**Five functions remain `anon`-executable and are correctly left alone** — `rank_for_xp`,
`set_updated_at`, `sync_device_last_seen`, `sync_subscription_status`, `user_role_level`. All are
`SECURITY INVOKER`, so they run with the caller's privileges and RLS applies; they cannot escalate.

---

## Order — where we are

Security hardening and feature work are being kept as two separate phases.

**Phase 1 — security hardening (in progress)**
1. ✅ sec08 (b) — TRUNCATE / TRIGGER / REFERENCES grants. Applied 2026-07-30.
2. ✅ sec08 (a) — `anon` EXECUTE on privileged RPCs. Applied 2026-07-30.
3. ⏳ sec08 (c) — leftover backup tables. Needs a decision between revoking grants and removing the
   tables from the API surface; not a live exposure either way.

**Phase 2 — feature work (paused until phase 1 completes)**
4. F2 — approve, apply, then wire the UI. The next functional enhancement.
5. F4 → F5 — settle the INV-10 interpretation, then apply the narrowing it implies.
6. F3 — nothing until the ~500k-row threshold.
