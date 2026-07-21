# Phase B — Critical Security & Authorization

Goal: secure the data layer before building any adaptive logic on top of it.
Everything here is derived from the Supabase **security advisor** against
project `igvkyxkmjnkzscqgommj`, cross-checked against real call sites.

Status legend: ⏳ pending apply · ✅ applied & verified · 🔒 held for review

Applied & verified against the security advisor on 2026-07-21
(project `igvkyxkmjnkzscqgommj`):

| ID | Item | Fix | Migration file | Status |
|----|------|-----|----------------|--------|
| SEC-01 | MIG-B1 leftover tables | RLS default-deny (secure-in-place, no drop) | `20260721_secB01_mig_b1_leftover_tables.sql` | ✅ |
| SEC-02 | `analyzer_runs` exposed | Enable RLS (own-insert / admin-read) | `20260721_secB02_analyzer_runs_rls.sql` | ✅ |
| SEC-03 | taxonomy registry exposed | Enable RLS (public read / admin write) | `20260721_secB03_taxonomy_registry_rls.sql` | ✅ |
| SEC-04 | `plan_definitions` exposed | Enable RLS (public read / admin write) | `20260721_secB04_plan_definitions_rls.sql` | ✅ |
| SEC-05 | mutable `search_path` (11 of 12) | `SET search_path = public` | `20260721_secB05_function_search_path.sql` | ✅ |
| AUTHZ-01a | definer fns anon/PUBLIC-executable | Least-privilege EXECUTE grants | `20260721_secB_authz01a_function_execute_grants.sql` | ✅ |
| AUTHZ-01b | `consume_credits` owner guard + grants + search_path | CREATE OR REPLACE + grant lockdown | `20260721_secB_authz01b_consume_credits_owner_guard.sql` | ✅ |
| AUTH-01 | leaked-password protection off | **Dashboard toggle (below)** | _n/a — not SQL_ | ⏳ |

**Advisor delta (2026-07-21, final):** `rls_disabled_in_public` **6 → 0** (all
ERRORs cleared); `anon_security_definer_function_executable` **19 → 0** (fully
cleared); `function_search_path_mutable` **12 → 0** (fully cleared). Residual:
15 `authenticated_security_definer_function_executable` (by design — see
AUTHZ-01), 7 `rls_enabled_no_policy` INFO (2 = SEC-01 secure-in-place; 5
pre-existing/out-of-scope, default-deny), and `auth_leaked_password_protection`
until AUTH-01 is toggled.

### AUTHZ-01b review evidence (before apply)

`consume_credits` touches live credit balances, so it was reviewed
independently before applying:

- **Body integrity:** `md5(deployed_body)` = `md5(migration_body)` =
  `b8ddc1a5063663fd0ab99e593dae94db`; `md5(body − guard)` = `md5(prior live
  body)` = `ad3ecb85…d8a28f`. The guard block is the *only* change; no
  credit/accounting logic altered. Verified again in-transaction via an MD5
  self-guard that would have rolled the apply back on any byte drift.
- **Behavioral battery** (rolled-back tx, synthetic users): paid consume,
  repeat, insufficient, cross-user block (`forbidden_user_mismatch` with victim
  balance untouched), refund round-trip, FREE daily-limit path, admin bypass,
  and service_role-acts-for-any-user — all passed.
- **Guard semantics:** end user (JWT) may spend only their own credits;
  `service_role` (auth.uid() NULL) may act for any user. `chat.html` always
  passes `currentUser.id` (= `auth.uid()`), so no client flow is blocked.

---

## SEC-01 — MIG-B1 leftover tables

`mig_b1_map` (69) and `weakness_signals_bak_mig_b1_20260702` (476) are
unreferenced leftovers from the completed 2026-07-02 backfill. The backup holds
real user weakness data readable by anon (RLS off → ERROR).

- **Secure-in-place** (committed default): enable RLS, no policy → default-deny.
  Reversible, no data loss; downgrades the lint to INFO (`rls_enabled_no_policy`).
- **Drop** (recommended cleanup): removes the exposed data at rest and clears
  the lint entirely. Irreversible → needs explicit approval.

## SEC-02 — `analyzer_runs`

PII-free per-user telemetry. The **frozen** `regenerate-reports.js` inserts the
current user's own row client-side, so RLS keeps: `INSERT` where
`user_id = auth.uid()` (or admin), `SELECT` for admins only. `service_role`
bypasses RLS for retention.

## SEC-03 / SEC-04 — taxonomy registry & `plan_definitions`

Reference/catalog tables, no user data. Matched to the existing reference-table
pattern (`credit_costs` / `credit_packs` / `pricing_settings`): **public read,
admin write**. The SECURITY DEFINER functions that read them
(`approve_payment_request`, `log_unmapped_detection`) bypass RLS and are
unaffected.

## SEC-05 — mutable `search_path`

12 functions had no pinned `search_path` (privilege-escalation vector on
definer functions). Pinned to `public` via `ALTER FUNCTION` — matches the
convention already used by the other ~13 definer functions; bodies unchanged.

## AUTHZ-01 — dual authorization model

Every `SECURITY DEFINER` function ran with PUBLIC EXECUTE and/or an explicit
`anon` grant. Enforcement is now applied at **two layers**:

1. **Grant layer** (`…authz01a`): revoke `PUBLIC` + `anon` from every definer
   function; grant EXECUTE only to the role(s) that legitimately call it.
2. **In-body layer** (`…authz01b`): `consume_credits` gained an owner-identity
   guard — an end user (JWT present) may spend only their own credits;
   `service_role` (auth.uid() NULL) may act for anyone.

Grant matrix (verified against call sites):

| Function(s) | anon | authenticated | service_role | Why |
|---|:---:|:---:|:---:|---|
| `activate_subscription`, `activate_credit_pack`, `activate_pro_subscription`, `claim_founder_slot` | ✗ | ✗ | ✓ | legacy/unused; superseded by `approve_payment_request` |
| `handle_new_user` | ✗ | ✗ | ✗ | trigger-only (EXECUTE not checked when a trigger fires) |
| `consume_credits`, `refund_ai_credit`, `award_focus_xp`, `delete_my_account`, `enforce_my_subscription_expiry`, `can_register_device` | ✗ | ✓ | ✓ | client self-service; in-body `auth.uid()` guard |
| `change_user_role`, `approve_payment_request`, `reject_payment_request` | ✗ | ✓ | ✓ | admin.html; in-body admin/owner check |
| `get_zero_personality`, `search_zero_knowledge` | ✗ | ✓ | ✓ | Edge Function (service_role); read-only |
| `auth_is_admin`, `current_user_role`, `has_role_at_least` | ✗ | ✓ | ✓ | RLS predicates; reveal only caller's own role |
| `log_unmapped_detection` | ✗ | ✓ | ✓ | already correct; re-asserted |

**Expected residual advisor state (by design, not a gap):**
`anon_security_definer_function_executable` → **0**.
`authenticated_security_definer_function_executable` remains for the functions
authenticated is *designed* to call — each protected by an in-body identity/role
check. That is the intended dual model.

---

## AUTH-01 — Leaked password protection (manual — not SQL/MCP)

This is a **GoTrue auth setting**, not a database object, so it cannot be set
via a migration or the Supabase MCP tools. Enable it one of two ways:

**Dashboard:** Authentication → **Sign In / Providers** → Password settings →
enable **"Leaked password protection"** (checks new passwords against the
HaveIBeenPwned k-anonymity API). Save.

**Management API** (if a `SUPABASE_ACCESS_TOKEN` PAT is available):

```bash
curl -X PATCH \
  "https://api.supabase.com/v1/projects/igvkyxkmjnkzscqgommj/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password_hibp_enabled": true}'
```

Verify: re-run the security advisor — `auth_leaked_password_protection` clears.
Ref: <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>

---

## Out of Phase B scope (observed, not addressed here)

`rls_enabled_no_policy` (INFO) on `goal_history`, `resources`,
`study_consistency`, `unmapped_detections`, `users` — RLS is ON so these are
default-deny (not an exposure). Flagged for a later pass, not part of Phase B.

## Apply order & workflow

Per `CLAUDE.md`, each migration is applied only after explicit approval, then
verified with the security advisor. Migrations are self-contained DDL with no
dependent code shipping, so there is no migration/code ordering race
(`scripts/check-migration-parity.sh` stays green — no new columns).
