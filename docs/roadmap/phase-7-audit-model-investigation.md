# D-D ②/⑦ — Audit Model & RLS Investigation

**Investigation only. Alternatives presented, none implemented.** No code, no
migration, no database object changed. Per your ruling: *"اعرض البدائل ولا تبدأ
تنفيذها"*.

Covers ruling **②** (best audit model for the whole project) and ruling **⑦**
(full RLS review before any implementation). Ruling **⑤** (Net Profit) is a
separate investigation and is **not** in this document.

---

## PART 1 — Audit model

### 1.1 What the project actually does today — measured, not assumed

Scanned every base table in `public`, `cost_engine` and `ai_catalog`:

| Column | Tables carrying it |
|---|---|
| `created_at` | 36 |
| `updated_at` | **5** (`profiles`, `users`, `payments`, `subscriptions`, `zero_knowledge_entries`) |
| `active` | 6 |
| `is_current` | **2** (`cost_facts`, `question_cost_facts`) |
| `effective_from` / `effective_to` | 3 (`rate_cards`, `service_bindings`, `discount_rules`) |
| **actor** (`created_by`/`actor_id`/`changed_by`) | **1** — `role_audit_log.actor_id` |
| **`superseded_at` / `superseded_by`** | **0 — none, anywhere** |
| **`revision_number`** | **0 — none, anywhere** |

**Two of the six columns you named do not exist anywhere in this project, and a
third exists exactly once.** Whatever is chosen here sets a new precedent rather
than following one — which is why it is worth doing deliberately.

### 1.2 The five patterns in production

| # | Pattern | Used by | Correction mechanism | Actor? |
|---|---|---|---|---|
| **P1** | **Immutable + `is_current`** | `cost_facts`, `question_cost_facts` | insert new row, flip flag | ✗ |
| **P2** | **Temporal validity** `effective_from`/`_to` | `rate_cards`, `service_bindings`, `discount_rules` | close old interval, open new | ✗ |
| **P3** | **Soft delete** `active` | `credit_costs`, `pricing_settings`, `credit_packs`, `services`, `providers` | flip `active` | ✗ |
| **P4** | **Separate audit log** | `role_audit_log` | log actor + before + after + reason | **✓** |
| **P5** | **Run-scoped provenance** | `cost_facts.run_id` → `cost_runs` | batch carries `reason`, `engine_version`, `started_at` | ✗ (machine) |

**P1 is enforced, not merely conventional.** `cost_facts` carries a
`cost_facts_freeze` trigger:

> *cost facts are immutable (INV-15): only `is_current` may change; supersede
> with a new run instead* — and **DELETE raises unconditionally**.

**The gap that matters.** P1/P2/P3/P5 record *what* changed. Only P4 records
*who*. And P4 is the only pattern applied to a **human-initiated privileged
change** (`change_user_role`).

`platform_cost_entries` is the project's first record that is **all four at
once**: financial, human-entered, immutable, and revisable. **No existing table
is more than two of those.** That is the real finding — the pattern has to be
composed, not copied.

### 1.3 Why `cost_facts` has no actor, and why that is correct

`cost_facts` is written by an automated engine. Its provenance question is *"which
run produced this, under which engine version, and why"* — answered by
`cost_runs (reason, engine_version, started_at)`. There is no person to record.

Platform costs invert this. The question becomes *"who typed this number, when,
and what did it replace"*. **Run-scoped provenance cannot answer it.** So P5 is
structurally unsuitable here despite being the most sophisticated pattern in the
project.

---

### 1.4 The alternatives

> ## ✅ DECIDED 2026-08-01 — **Alternative A (In-row Supersede / Immutable Records)**
>
> Owner's reasons, recorded verbatim: it matches the locked ruling that financial
> records are never edited in place; it preserves the full history; every change
> produces a new revision; both the creator and the superseder are identifiable;
> and no historical information can be lost.
>
> **Alternative B is REJECTED** — it relies on modifying the record itself, which
> contradicts Immutable Financial Records.
>
> ### Five additional requirements, binding on the design
>
> 1. **No history may be deletable.**
> 2. **Every revision must be fully traceable.**
> 3. **There must be a clear current record without losing previous records.**
> 4. **Any default financial report reads CURRENT records only**; history stays
>    available for review.
> 5. **Any query at risk of double-counting because multiple revisions exist must
>    be called out explicitly in the design, together with the means of
>    preventing that error.**
>
> Requirement 5 is the direct answer to Alternative A's one acknowledged
> weakness, and it is now a design obligation rather than a caveat.

Four candidates. **None implemented; recommendation stated, decision yours.**

---

#### Alternative A — In-row supersede *(extends P1 with an actor)*

One table. A correction inserts a new row and flips the old one's flag.

```
id, period_month, category, amount, currency, note,
is_current  boolean not null default true,
revision_number  integer not null default 1,
supersedes_id    uuid null references platform_cost_entries(id),
created_at, created_by,
superseded_at, superseded_by
```

| | |
|---|---|
| **Strengths** | Extends the project's existing enforced-immutability pattern (P1). History and current state in one place — one query answers "what is July's cost" (`is_current`) and "what did July ever say" (all rows). The freeze trigger is directly reusable. Satisfies **every** column you listed. |
| **Weaknesses** | `UNIQUE (period_month, category)` from §9.4 **must be dropped** — it forbids the second row a supersede requires. Replaced by a partial unique index `WHERE is_current`. Readers must remember `WHERE is_current`; forgetting it double-counts money. |
| **Precedent** | Strongest — P1 is already enforced by trigger on the two adjacent financial tables |

---

#### Alternative B — Table + separate audit log *(P3 + P4)*

Mutable current-state table, every change mirrored into `platform_cost_audit`.

| | |
|---|---|
| **Strengths** | Current-state table stays trivially simple; `UNIQUE (period_month, category)` survives unchanged. Directly mirrors `role_audit_log`, the project's one human-action precedent. Reads need no `is_current` filter. |
| **Weaknesses** | **The base table is still mutable.** The audit log is a *record* of the change, not a *constraint* on it — if the log write is ever skipped, bypassed, or the trigger dropped, history is gone with no trace. This is exactly the property your ruling ① rejects: *"لا نريد أن تتغير أرقام الأرباح التاريخية بدون Trace واضح"*. Two objects to keep consistent. |
| **Precedent** | `role_audit_log` |

---

#### Alternative C — Temporal validity *(P2)*

`effective_from` / `effective_to` per entry, as `rate_cards` does.

| | |
|---|---|
| **Strengths** | Matches how the Cost Engine already versions prices. Natural for "this figure was believed true between X and Y". |
| **Weaknesses** | **Conceptually wrong here.** `rate_cards` uses temporal validity because a *price genuinely changes over time*. A platform cost for July 2026 does not change over time — the **belief about it** is corrected. Conflating "when the cost applied" (`period_month`) with "when we believed it" (`effective_from`) invites exactly the double-counting §9.4 was written to avoid. |
| **Precedent** | `rate_cards` — but for a different problem |

---

#### Alternative D — Append-only ledger, no current flag

Only inserts. Current value = latest row per `(period_month, category)` by
`created_at`. Corrections are deltas or full restatements.

| | |
|---|---|
| **Strengths** | Simplest possible integrity story: nothing is ever updated, so nothing can be lost. No flag to forget. |
| **Weaknesses** | Every read needs a window function (`DISTINCT ON`/`row_number()`), which is easy to get wrong and easy to forget — a plain `SUM` over the table silently double-counts every correction. Has no natural place for `superseded_by`. |
| **Precedent** | None in this project |

---

### 1.5 Comparison against your ruling

| Requirement (ruling ① and ②) | A | B | C | D |
|---|---|---|---|---|
| No edit-in-place | **✓** | ✗ | ✓ | **✓** |
| Full history retained | **✓** | ~ | ✓ | **✓** |
| Historical profit cannot change without trace | **✓** | ✗ | ~ | ✓ |
| `created_at` / `created_by` | ✓ | ✓ | ✓ | ✓ |
| `superseded_at` / `superseded_by` | **✓** | ~ | ~ | ✗ |
| `revision_number` | **✓** | ✓ | ~ | ~ |
| `active`/current flag | **✓** | n/a | ~ | ✗ |
| Mis-read cannot double-count | ✗ | ✓ | ✗ | ✗ |

**Recommendation: Alternative A**, for three evidenced reasons:

1. It is the **only** option satisfying every column you named.
2. It extends P1 — the project's one *enforced* immutability pattern — so the
   existing `freeze` trigger design carries over rather than being invented.
3. B is disqualified by your own ruling: a mutable base table means history
   *can* change without trace, whatever the log says.

**Its one real weakness is honest and must be designed against:** a reader who
forgets `WHERE is_current` double-counts money. Mitigations exist (expose only a
view that filters, never the table) and belong in the design document, not here.

---

## PART 2 — RLS review (ruling ⑦)

### 2.1 The finding that matters most

Your ruling: **no public read, no anonymous, no authenticated — owner only.**

Measured across the project's sensitive tables:

| Table | RLS | Policies | `anon` base grant |
|---|---|---|---|
| `payments` | on | 4 | **arwdm** |
| `payment_requests` | on | 3 | **arwdm** |
| `role_audit_log` | on | 1 | **arwdm** |
| `system_settings` | on | 4 | **arwdm** |
| `credit_costs` | on | 1 | **arwdm** |
| `pricing_settings` | on | 2 | **arwdm** |

`arwdm` = INSERT, SELECT, UPDATE, DELETE, MAINTAIN — granted **directly to
`anon` and `authenticated` by `postgres`** on every one of them. This is
Supabase's default-privilege behaviour for the `public` schema.

> **Every sensitive table in this project is protected by RLS *alone*. The
> underlying grants are wide open.**

That is not a defect I am reporting in those tables — RLS is doing its job. But
it is the decisive constraint for **this** table: if `platform_cost_entries` is
created normally in `public`, `anon` will hold INSERT/SELECT/UPDATE/DELETE on
supplier-invoice data, and a single mis-specified or accidentally-disabled policy
exposes it. `econ` does not have this problem because `USAGE` is revoked on the
whole schema — but §9.4 forces this table into `public`.

**Therefore, for this table specifically, RLS alone is not sufficient.** The
design must additionally `REVOKE ALL … FROM anon, authenticated`, so the table is
protected by **two independent mechanisms**. Defense in depth, deviating from the
project norm deliberately and only here.

### 2.2 What the design must specify

Not designed yet — enumerated so nothing is missed:

1. `REVOKE ALL ON platform_cost_entries FROM PUBLIC, anon, authenticated`
2. `ENABLE ROW LEVEL SECURITY` **and** `FORCE ROW LEVEL SECURITY` — without
   `FORCE`, the table owner bypasses RLS entirely
3. Owner-only policies for SELECT / INSERT; **no** UPDATE policy except the
   narrow `is_current` flip; **no** DELETE policy at all
4. Whether reads go through an owner-gated `SECURITY DEFINER` RPC (consistent
   with every other economics surface) rather than direct table access — **my
   expectation is yes**, making the RLS policy a second line rather than the only one
5. Verification that `anon` and `authenticated` are denied **by grant and by
   policy independently**, each proven separately

### 2.3 An open question for the design

`SECURITY DEFINER` functions run as their owner. If that owner also owns the
table, `FORCE ROW LEVEL SECURITY` is what stops the RPC from silently bypassing
RLS. **This interaction needs to be verified against the live database rather
than assumed** — it is the kind of detail that looks correct in review and fails
in production. I will measure it as part of the design work.

---

## What is still outstanding before any code

| Ruling | Status |
|---|---|
| ① Immutable + audit mandatory | **locked** — drives Alternative A |
| ② Audit model alternatives | **this document** — awaiting your choice |
| ③ Strong CHECK constraints | to be enumerated in the design document |
| ④ No currency shortcut — blocked stays blocked | **locked** — EGP entry will *not* be offered as an FX bypass |
| ⑤ Net Profit investigation | **not started** — separate deliverable, next |
| ⑥ Simulator out of scope for M2 | **locked** — nothing simulator-related in this document |
| ⑦ Full RLS review | **Part 2 above** |
| ⑧ Full design document | **blocked** on ② and ⑤ |

---

## Stop

Investigation complete. **Alternatives presented, nothing implemented. No code,
no migration, no database change.** `main` untouched.

**Awaiting your choice of audit model (A/B/C/D) before the Net Profit
investigation and the design document proceed.**
