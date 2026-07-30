# AI Monitor follow-ups F2–F6 — status

Opened from `docs/roadmap/ai-monitor-telemetry-access-proposal.md` §11 after the owner-gated
call-telemetry RPCs were applied (2026-07-30). F1 is closed and shipped.

**Nothing in this document has been applied to the database.** Two migrations are staged in
`supabase/migrations-pending/` awaiting individual owner approval per CLAUDE.md §3.

| | Item | State | Needs |
|---|---|---|---|
| **F1** | `owner` floor vs page gate | ✅ **Shipped** | — |
| **F2** | Per-request model attribution | 📝 **Migration staged** | Owner approval, then UI wiring |
| **F3** | Partial index on failures | ⏸️ **Deferred by decision** | Nothing — revisit at a stated threshold |
| **F4** | Token sensitivity (Appendix A) | 🔓 **No longer blocking** | Owner's policy call, at leisure |
| **F5** | `ai_usage_logs` governance | 📝 **Migration staged** | **Governance decision**, then approval |
| **F6** | `anon:EXECUTE` hardening | 📝 **Already staged (sec08)** | Owner approval — do not rewrite |

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

## F6 — `anon:EXECUTE` hardening — already staged, do not rewrite

**Already covered by:** `supabase/migrations-pending/20260727_sec08_rpc_grant_hygiene.sql`

That file predates this follow-up list and is **broader** than the F6 note. It covers the two admin
RPCs *and* twelve other privileged RPCs, TRUNCATE grants, and two leftover migration tables. Writing
a second migration for the two functions would duplicate approved-and-waiting work.

**Measured 2026-07-30 — none of it is applied:**

| sec08 section | State |
|---|---|
| (a) SECURITY DEFINER functions `anon` can execute | **2 remaining** — `admin_credits_overview`, `admin_set_credit_cost` |
| (b) TRUNCATE grants held by `anon` / `authenticated` | **70 remaining** |
| (c) `weakness_signals_bak_…`, `mig_b1_map` readable | Already unreadable (RLS on, no policy) — so (c) is defence-in-depth |

**Section (b) is the significant one, and it is not an AI Monitor concern** — 70 tables still grant
TRUNCATE to `anon`/`authenticated`, and **TRUNCATE ignores RLS entirely**. It is unreachable through
PostgREST today, so latent rather than live, but it is the largest single item in that file and
worth prioritising above anything in this list.

**One open question in sec08 is now closed.** The file asked whether the deployed `consume_credits`
carries its dual-authorization guard, since the repo file being present does not prove it was
applied. Verified 2026-07-30: `pg_get_functiondef(...) LIKE '%forbidden_user_mismatch%'` returns
**true**. The guard is live, the reasoning in that file holds, and `consume_credits` needs no change.
Recorded in the file itself.

**Also worth knowing:** five other functions are `anon`-executable but are **`SECURITY INVOKER`** —
`rank_for_xp`, `set_updated_at`, `sync_device_last_seen`, `sync_subscription_status`,
`user_role_level`. They run with the caller's privileges, so RLS applies and they cannot escalate.
Three appear to be trigger functions, which do not need a caller EXECUTE grant to fire. Low-value
hygiene, deliberately left alone to keep sec08's blast radius small.

---

## Suggested order

1. **sec08 section (b)** — 70 TRUNCATE grants. Largest latent risk, unrelated to AI Monitor.
2. **F6 / sec08 section (a)** — two admin RPCs. Small, safe, closes the advisor warning.
3. **F2** — approve, apply, then wire the UI. Delivers the visible improvement.
4. **F4 → F5** — decide the token-sensitivity reading, then apply the narrowing it implies.
5. **F3** — nothing, until the threshold above.
