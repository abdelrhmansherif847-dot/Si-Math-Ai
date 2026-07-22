# Zero AI — Operation-Based Credits & Subscription System

**Status:** Phase 1 delivered on branch `claude/zero-credits-subscription-system-6yqklw`.
Phase 2 items below are **gated on explicit owner approval** (frozen files —
CLAUDE.md §2; production DB migration — CLAUDE.md §3).

This is the official long-term billing architecture for Zero AI. Credits
represent **AI computation**, not page access. The subscription unlocks the AI
pages; credits are spent per **operation**, priced by computational cost. Every
future AI feature (Truth Engine, Teacher AI, Essay Review, OCR Premium, …)
registers a new operation in this system instead of adding page-specific billing.

---

## 1. Architecture

```
 page  ──charge('op')──►  credit-config.js  ──consume_credits(feature)──►  Postgres
 (chat/mock/…)            (CreditConfig)        RPC (SECURITY DEFINER)      credit_costs
                              │                        │                    profiles
                       reads credit_costs        deduct sub → pack          ai_usage_logs
                       (single source of         log usage + txn            credit_transactions
                        truth for costs)
```

- **Single source of truth for costs:** `public.credit_costs`
  (`feature_name`, `credit_cost`, `active`, `always_charge`). Costs are **never
  hardcoded** in a page. Change a value here (or in Owner → Credits) and the
  whole platform updates.
- **Client resolver:** `credit-config.js` exposes `CreditConfig`:
  - `CreditConfig.load(sb)` — load the catalogue once at page init.
  - `CreditConfig.charge(sb, { userId, op, sessionId, model })` — charge one
    operation; returns the `consume_credits` result (`{ ok, credits_used,
    balance_after, reason, … }`).
  - `CreditConfig.cost('op')` — the numeric cost, for UI copy.
  - Migration-tolerant: if a granular chat feature isn't live yet (or
    `credit_costs` isn't client-readable), chat ops fall back to the legacy
    `AI_CHAT_MESSAGE` feature so a student is **never blocked**.
- **Server RPC:** `public.consume_credits(...)` — unchanged. Deducts
  **subscription credits first, then pack credits** (RFC consumption order),
  logs `ai_usage_logs` + `credit_transactions`, enforces subscription expiry,
  admins free, `always_charge` bypasses the FREE daily allowance.

### `always_charge` semantics (important)

- `always_charge = false` → the operation is covered by the FREE plan's daily
  free allowance (freemium funnel) before it starts spending credits.
- `always_charge = true` → the operation **always** deducts its cost, even for a
  FREE user with daily-free slots remaining. This mirrors the existing
  `STUDY_PLAN` precedent (`20260721_study_plan_always_charge.sql`): heavy
  "generate/create" operations cost the same for every tier.

**Free-tier decision (Phase 1):** the existing 15/day FREE allowance is kept as
an acquisition funnel (least disruptive to current free users). The chat family
stays freemium (`always_charge = false`); every generate/create operation
(`STUDY_PLAN`, `MOCK_*`, `FOCUS_SESSION`, `WEAKNESS_ANALYSIS`) is
`always_charge = true`. To hard-gate all AI behind a subscription instead
(literal RFC reading), flip the chat rows to `always_charge = true` and/or drop
the FREE `daily_limit` — no code change required.

---

## 2. Operation catalogue

| RFC operation      | `feature_name`      | Credits | `always_charge` | Wired in |
|--------------------|---------------------|:------:|:---------------:|----------|
| chat_text          | `CHAT_TEXT`         | 5      | false | chat.html ✅ |
| chat_image         | `CHAT_IMAGE`        | 8      | false | chat.html ✅ |
| chat_followup      | `CHAT_FOLLOWUP`     | 2      | false | chat.html ✅ |
| chat_deep_explain  | `CHAT_DEEP_EXPLAIN` | 10     | false | (register; trigger TBD) |
| study_plan         | `STUDY_PLAN`        | 20     | true  | chat.html / study-planner ✅ (already live) |
| mock_exam          | `MOCK_EXAM`         | 40     | true  | mock-exam.html ⏳ (frozen) |
| mock_timer         | `MOCK_TIMER`        | 10     | true  | mock-exam.html ⏳ (frozen) |
| mock_practice      | `MOCK_PRACTICE`     | 10     | true  | mock-exam.html ⏳ (frozen) |
| focus_session      | `FOCUS_SESSION`     | 15     | true  | focus.html ⏳ (frozen) |
| weakness_analysis  | `WEAKNESS_ANALYSIS` | 20     | true  | weakness.html ⏳ (frozen) |

`AI_CHAT_MESSAGE` (5) is kept **active** as the back-compat fallback used until
the migration is applied. `FOCUS_PLAN` is retired (superseded by
`FOCUS_SESSION`).

### Pack repricing (credits unchanged)

| Pack         | Old EGP | New EGP | Credits |
|--------------|:------:|:------:|:------:|
| Starter Pack | 69     | **199** | 500  |
| Value Pack   | 129    | **349** | 1000 |
| Power Pack   | 249    | **649** | 2000 |

Subscription prices already match the RFC (Monthly 349 / Quarterly 899 /
Yearly 2999) — no change.

---

## 3. Phase 1 — delivered on this branch

- `supabase/migrations/20260722_credits_operation_based_v1.sql` — the cost
  catalogue + pack repricing (**written, NOT applied** — see §4.1).
- `credit-config.js` — the centralized client resolver.
- `chat.html` — loads `credit-config.js`; charges `chat_image` (attachment),
  `chat_followup` (explicit "explain again/simpler" actions), else `chat_text`,
  all resolved from config. (Typed questions stay at 5 → revenue-neutral.)
- `admin.html` — **Owner → Credits** tab: live KPIs (credits in circulation,
  consumed, sold, revenue) + view/edit tables for operation costs, subscription
  plans, and packs. Edits route through the `admin-actions` Edge Function
  (see §4.3).

---

## 4. Phase 2 — gated on approval

### 4.1 Apply the migration (CLAUDE.md §3)

Review `20260722_credits_operation_based_v1.sql`, then apply to project
`igvkyxkmjnkzscqgommj` (idempotent, non-destructive; only reprices packs and
registers/activates operations). Verify afterwards:

```sql
SELECT feature_name, credit_cost, active, always_charge FROM credit_costs ORDER BY feature_name;
SELECT name, price_egp, credits FROM credit_packs ORDER BY sort_order;
SELECT plan_code, amount_egp FROM plan_definitions WHERE kind='pack';
```

Once live, `credit-config.js` picks up the granular chat costs automatically
(image → 8, follow-up → 2). Until then, chat falls back to the flat 5.

> If `credit_costs` is **not** client-readable under RLS, the loader can't see
> the granular rows and chat stays on the legacy `AI_CHAT_MESSAGE` fallback
> (safe, but images/follow-ups won't reprice on the client). Add a read policy
> if you want the client to resolve granular chat costs:
> ```sql
> ALTER TABLE public.credit_costs ENABLE ROW LEVEL SECURITY;
> CREATE POLICY "credit_costs readable by authenticated"
>   ON public.credit_costs FOR SELECT TO authenticated USING (true);
> ```
> (The actual charge is server-authoritative via `consume_credits` regardless.)

### 4.2 Wire the frozen pages (CLAUDE.md §2 — needs unfreeze)

`mock-exam.html`, `focus.html`, `weakness.html` are frozen. Each needs the
`credit-config.js` include + a load at init, then a single `CreditConfig.charge`
at its generate/create entry point. These pages charge **nothing** today.

**Common setup (all three):** add near the other `<script src=…>` includes:
```html
<script src="credit-config.js"></script>
```
and after the Supabase client (`sb`) is created:
```js
try { if (window.CreditConfig) CreditConfig.load(sb); } catch (_) {}
```

#### mock-exam.html — `btnStart` handler (~line 731), after plan-gating

Charge by selected mode, right after the weekly-limit gate passes and before the
session renders:
```js
// Resolve the mock operation from the selected config.
const _mockOp = s.exam.code === 'PRACTICE' ? 'mock_practice'
              : s.exam.code === 'TIMER'    ? 'mock_timer'
              : 'mock_exam';
const _cr = await CreditConfig.charge(sb, { userId: user.id, op: _mockOp });
if (!_cr.ok) {
  if (btn) { btn.disabled = false; btn.textContent = 'Start'; }
  // reuse the page's existing upsell/insufficient-credits UI:
  //   insufficient_credits → balance too low; daily_limit_reached → free cap hit
  showMockError(_cr.reason, _cr);   // implement with the page's toast/modal
  return;
}
```
(Full Mock = 40, Timer = 10, Practice = 10. The existing Free weekly-mock gate
can stay or be replaced by the credit charge — product call.)

#### focus.html — `upsertPlan(...)` (~line 1083), on NEW session creation

Charge once when a **new** focus session is generated (not on task toggles /
reloads / XP awards):
```js
const _cr = await CreditConfig.charge(sb, { userId: user.id, op: 'focus_session' });
if (!_cr.ok) { /* surface insufficient_credits; abort creation */ return null; }
// …proceed to build & upsert the plan…
```

#### weakness.html — manual Regenerate handler (~line 1814 → `loadData(true)`)

Charge **only** the manual regeneration; the automatic post-workflow paths
(`loadData()` without `forceRegen`, and the missing-report auto-regen) stay
free per the RFC:
```js
// inside the Regenerate button click, BEFORE calling loadData(true):
const _cr = await CreditConfig.charge(sb, { userId: uid, op: 'weakness_analysis' });
if (!_cr.ok) { /* surface insufficient_credits; keep old report */ return; }
await loadData(true);
```

### 4.3 `admin-actions` Edge Function handlers (owner editing)

The Owner → Credits tab reads live but its **Save** buttons POST to the
`admin-actions` Edge Function (same pattern as `update_system_setting`). Add
three action handlers so edits persist (service-role validated as admin/owner):

| action                | payload                                                        | writes |
|-----------------------|---------------------------------------------------------------|--------|
| `update_credit_cost`  | `{ feature_name, credit_cost, active, always_charge }`         | `credit_costs` |
| `update_pricing_plan` | `{ plan_code, price_egp, credits_granted, active }`           | `pricing_settings` |
| `update_credit_pack`  | `{ pack_id, pack_name, price_egp, credits, active }`         | `credit_packs` **and** `plan_definitions` (keep in lockstep) |

Until these exist, Save shows *"action not available yet"* — the tab still
displays everything correctly. (`admin-actions` source is not in this repo;
add the handlers wherever it is maintained. Do **not** touch `ai-tutor` —
CLAUDE.md §1.)

### 4.4 `chat_deep_explain` trigger (optional)

`CHAT_DEEP_EXPLAIN` (10) is registered but has no UI trigger yet. When a
"Deep Explanation" action is added to chat, charge it with
`CreditConfig.charge(sb, { op: 'chat_deep_explain', … })`.

---

## 5. Test checklist (after §4.1 + §4.2)

- [ ] FREE user, first 15/day: `chat_text` still free (daily allowance).
- [ ] `chat_image` charges 8 (or 5 via fallback if migration not yet live).
- [ ] `chat_followup` ("explain simpler") charges 2.
- [ ] `mock_exam` 40 / `mock_timer` 10 / `mock_practice` 10 deduct for every tier.
- [ ] `focus_session` 15 on new session; task toggles free.
- [ ] `weakness_analysis` 20 on manual regen; auto-regen free.
- [ ] Subscription credits spent before pack credits.
- [ ] Admin/Founder unaffected (admin free; founder no expiry).
- [ ] Owner → Credits shows costs/plans/packs + KPIs; edits persist once §4.3 ships.
