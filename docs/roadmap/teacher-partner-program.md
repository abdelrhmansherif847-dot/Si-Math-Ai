# Teacher Partner Program — architecture findings and implementation plan

**Status: PROPOSED. Nothing built, nothing applied.** Written 2026-08-31 against
the live project (`igvkyxkmjnkzscqgommj`) and the branch
`claude/teacher-intelligence-layer-8e66b0`. Every figure below was measured, not
recalled.

This extends the existing Teacher system. It introduces no second teacher
architecture, no second role system, and no duplicate student relationship.

---

## A · Current architecture findings

### A0 · The "prepared referral migrations" do not exist

`docs/engineering/pricing-financial-model-2026-08.md` §"Prepared, not applied"
describes three files as sitting in the branch:

- `20260830a_teacher_referral_commissions.sql`
- `20260830b_approve_payment_awards_commission.sql`
- `20260830z_teacher_referral_rollback.sql`

**None of them were ever committed, on any branch.**
`git log --all --diff-filter=A -- '*referral*' '*commission*'` returns nothing;
`grep -rin "\breferral\b"` over the repo returns nothing outside that one
document. They existed in an earlier session's container, which was reclaimed.

Worse, two of the three names are now **taken by applied migrations**:
`20260830a_teacher_foundation_tables.sql` and
`20260830b_teacher_foundation_rls.sql`, both live since 2026-08-30. Recreating
them under those names would collide. This plan uses fresh names, and the
pricing document should be corrected to say the files are gone.

The *design* in that document is sound and is largely carried forward here —
particularly the decision to carry the business rules in constraints rather than
in application code.

### A1 · A teacher is a relationship, not a role — reuse it

`user_role` is `user < admin < super_admin < owner`. There is **no teacher
rung, by design**. A teacher is the owner of a `teacher_workspaces` row;
`workspace_staff.staff_role` is `teacher | assistant`.

`my_experience()` (live 2026-08-30) already returns, per membership,
`{workspace_id, name, staff_role, status}`. **The client can already tell a
teacher from an assistant with no new RPC and no schema change.** Use it.

This matters more than it looks: `nav.js` currently gates the Teaching section
on `can_staff`, which is **true for assistants**. An assistant must never see
commission figures, so the Partner surfaces cannot reuse that flag — they need
`staff_role === 'teacher'`, which `my_experience()` already supplies.

### A2 · One teacher may own several workspaces

`teacher_workspaces` has unique constraints on `student_join_code` and
`staff_join_code` only — **none on `owner_id`**. A referral code therefore
belongs to the **teacher (a user)**, not to a workspace.

### A3 · Joining a classroom is not a referral, and there is no link flow at all

Students join by typing an 8-character `student_join_code` (sample: `X7Z7DT2Y`)
into `settings.html`, which calls `student_join_workspace(p_code)`.

`signup.html` contains **no** `URLSearchParams`, no `localStorage`, no
`sessionStorage`. Nothing anywhere captures a URL parameter. A `?ref=CODE` link
today is silently discarded. **Attribution capture is entirely greenfield on the
client** — which is convenient, because it means nothing existing has to be
unpicked.

### A4 · `payment_requests.amount_egp` is student-controlled — do not pay commission on it

`manual-payment.html:873` inserts the row straight from the browser:

```js
sb.from('payment_requests').insert({ user_id, plan_code, plan_label,
                                     amount_egp: selectedPlan.amount, ... })
```

The INSERT policy's entire WITH CHECK is `auth.uid() = user_id`. There is **no
trigger** on the table (verified) and the only CHECK constraints are on `method`
and `status`. Nothing validates `amount_egp`, `plan_code` or `plan_label`.

Measured: **0 of 17** payment requests disagree with the catalogue price, so
this is a latent hole, not a live leak. But a commission computed from that
column would be **a payout amount the payer can type**. The admin reviewing the
request approves a *plan*, and `approve_payment_request` grants by `plan_code`
alone — the amount is never re-checked.

**Consequence: the commission base must be `plan_definitions.amount_egp`,
resolved server-side at approval time.** Never the request's own figure.

### A5 · There are TWO approval paths, not one

| path | writes | activation | still wired? |
|---|---|---|---|
| `approve_payment_request(request_id, admin_note)` | `payment_requests` | inline | **yes** — `admin.html:3355`; last request 2026-08-23 |
| `admin-actions` → `create_and_approve_payment` | legacy `payments` | `activate_subscription()` / `activate_credit_pack()` | **yes** — `admin.html:2212`; table has 5 rows, last written 2026-06-19 |

A hook on only the first leaks any purchase granted through the second. The
legacy path is dormant but reachable, and it is the path an admin uses to grant
a plan manually.

`approve_payment_request` is `security definer`, gated on `profiles.is_admin`,
`search_path=public`, granted to `authenticated`. It handles `kind='pack'` with
an early return, then subscriptions.

### A6 · No refund or reversal exists anywhere

`payment_requests_status_check` permits `pending | approved | rejected` only.
`reject_payment_request` moves pending → rejected. **Once approved, there is no
mechanism to reverse a payment.**

So "no commission on refunded / reversed payments" cannot be *enforced* by
reacting to a refund event — there are no refund events. It can only be
*provided for*: a `reversed` commission status an admin sets, which is what this
plan does.

### A7 · Two admin systems coexist

`approve_payment_request` gates on `profiles.is_admin` (boolean). The teacher and
support stacks gate on `profiles.role` through `current_user_role()` /
`has_role_at_least()`. Measured, they agree exactly today:

| role | is_admin | accounts |
|---|---|---|
| owner | true | 1 |
| super_admin | true | 2 |
| user | false | 34 |

They are independent columns and could diverge. New referral RPCs should gate on
`has_role_at_least('admin')` — the newer, ordered system — and this divergence
should be noted, not silently inherited.

### A8 · Packs are purchases too

The live catalogue carries four packs alongside seven subscription plans:

| packs | | subscriptions | |
|---|--:|---|--:|
| PACK_STARTER | 199 | PRO_MONTHLY | 349 |
| PACK_VALUE | 349 | PRO_QUARTERLY | 899 |
| PACK_POWER | 599 | SAT_EXAM_NIGHT | 1,000 |
| PACK_ULTRA | 1,299 | FOUNDER_ANNUAL | 1,499 (sold out) |
| | | HERO | 1,949 |
| | | PRO_ANNUAL | 2,999 |

The brief names only the four subscription prices. Whether a pack purchase earns
commission is **a business decision, not a technical one** — see §D5.

### A9 · Scale reality: there are no teachers yet

1 workspace, 1 owner (the platform owner's own account), 1 active student link.
37 accounts, 12 paying, 13 approved payments, 17 payment requests.

**The program will launch with zero participants.** That argues for building the
accounting spine exactly right and the UI minimally — and against building a
payout engine, a click-tracking table, or a batch payout table before anything
needs one.

### A10 · Patterns to reuse

- **Tokens:** `assets/tokens.core.css` plus each page's own `:root` block.
- **Admin tabs:** `<button class="tab" data-role-min="owner" onclick="switchTab('x')">`
  plus `<div id="tab-x">`. Adding a tab is ~10 lines.
- **Audit:** `workspace_audit_log(id, workspace_id, actor_id, action, subject_id,
  created_at, meta jsonb)` and `role_audit_log(id, changed_at, actor_id,
  target_id, old_role, new_role, reason)`. Mirror this shape; do not invent one.
- **Teacher page:** `S.isTeacher`, `api.X()` / `loadX()` / `renderX()`, `.card`,
  `.row`, `.pill`, `.sec-label`, and the existing copy-button pattern
  (`#copyStaffBtn`).
- **Access:** clients hold SELECT only; every write is a SECURITY DEFINER RPC
  with the default ACL revoked and `authenticated` granted deliberately.

### A11 · One nav trap

`nav.js` calls `hasOwnTeacherLink(slot)` and **suppresses the entire Teaching
block** if the page already carries its own `teacher.html` link — which
`teacher.html` does. A Partner link injected only by `nav.js` would therefore be
missing on the Teacher Workspace page itself. `STAFF_NAV_KEEP` also needs the
new page, or the staff-nav filter will hide it.

---

## B · Proposed database model

Four new tables. **Nothing existing is altered** except two `perform` lines added
inside the approval paths (§D2). Clients hold SELECT only; every write is a
SECURITY DEFINER RPC.

### B1 · `referral_commission_rates` — the one configurable source

```
id                smallint PRIMARY KEY
min_paid_students integer  NOT NULL
max_paid_students integer                 -- NULL = open-ended top band
rate_bps          integer  NOT NULL CHECK (rate_bps between 0 and 10000)
label             text     NOT NULL
active            boolean  NOT NULL DEFAULT true
```

Seed: `(1, 9, 1000, '10%')`, `(10, 29, 1250, '12.5%')`, `(30, NULL, 1500, '15%')`.

**Basis points, never a float.** 12.5% is `1250`, exactly. A `numeric` or `real`
percentage invites a rounding argument nobody can win. Bands are constrained
non-overlapping and gap-free so a student count can never fall between two rates
or match two.

Changing a rate is one UPDATE — no schema change, no deploy. Historic rows are
unaffected because each freezes its own rate (§B3).

### B2 · `referral_attributions` — first-touch, immutable

```
student_user_id  uuid PRIMARY KEY REFERENCES auth.users(id)   -- the rule, as a constraint
teacher_user_id  uuid NOT NULL   REFERENCES auth.users(id)
code             text NOT NULL
source           text NOT NULL CHECK (source in ('signup_link','code_entry','admin'))
attributed_at    timestamptz NOT NULL DEFAULT now()
locked_at        timestamptz                                   -- set when a commission is awarded
CHECK (teacher_user_id <> student_user_id)
```

`PRIMARY KEY(student_user_id)` is the whole "one teacher per student, first
touch wins" rule. A second attribution is not refused by code — it is
**impossible**. A trigger permits UPDATE only from the admin reassignment RPC,
and never once `locked_at` is set without an explicit force flag and a reason.

### B3 · `referral_commissions` — the money

```
id                   uuid PRIMARY KEY
student_user_id      uuid NOT NULL UNIQUE REFERENCES auth.users(id)  -- one first purchase, ever
teacher_user_id      uuid NOT NULL
source_kind          text NOT NULL CHECK (source_kind in ('payment_request','payment'))
source_id            uuid NOT NULL
plan_code            text NOT NULL
gross_egp            numeric(12,2) NOT NULL CHECK (gross_egp > 0)
rate_bps             integer NOT NULL          -- frozen
tier_label           text    NOT NULL          -- frozen
paid_count_at_award  integer NOT NULL          -- frozen: what the tier was computed from
commission_egp       numeric(12,2) NOT NULL    -- frozen
status               text NOT NULL DEFAULT 'pending'
                     CHECK (status in ('pending','approved','paid','reversed'))
awarded_at, approved_at/by, paid_at/by, reversed_at/by, reversal_reason
UNIQUE (source_kind, source_id)               -- double-award impossible
```

Two constraints carry the two rules the brief calls structural:

- `UNIQUE(student_user_id)` — a teacher can never be paid twice for one student.
- `UNIQUE(source_kind, source_id)` — one approval can never award twice, however
  many times the hook fires.

**Everything rate-related is frozen into the row.** When a teacher crosses from
10% to 12.5%, history does not restate itself: `rate_bps`, `tier_label`,
`paid_count_at_award` and `commission_egp` say what was true at award. Storing
`gross_egp` and `rate_bps` alongside the computed figure means any disputed
number is recomputable from the row alone.

### B4 · `referral_codes`

```
teacher_user_id uuid PRIMARY KEY REFERENCES auth.users(id)   -- one code per teacher
code            text NOT NULL UNIQUE
active          boolean NOT NULL DEFAULT true
created_at      timestamptz NOT NULL DEFAULT now()
```

Same 8-character unambiguous alphabet as the existing join codes, and generated
the same way. A **separate** namespace from `student_join_code`: reusing the
classroom code would make every classroom join look like a referral, which is
exactly the conflation the brief rules out.

### B5 · `referral_audit_log`

Mirrors `workspace_audit_log`: `(id, actor_id, action, subject_id, created_at,
meta jsonb)`. Every admin write — approve, mark paid, reverse, reassign — leaves
a row. Nothing in the referral system is silently mutable.

### B6 · Deliberately NOT built

- **No click table.** There is no traffic to record and a click is not evidence
  of anything. Attribution is recorded at binding.
- **No `referral_payouts` batch table.** The brief defers the payout mechanism;
  `status` plus its timestamps is the accounting spine. Add the batch table when
  a payout method exists and it can be modelled against the real thing.
- **No new role, no new user table, no duplicate student relationship.**

---

## C · Attribution rules

**The rule, in one sentence: the first teacher a student is bound to keeps them,
permanently, and only an explicit audited admin action can change it.**

### C1 · Two layers, deliberately different

| layer | rule | why |
|---|---|---|
| browser (`localStorage`, one key) | **last code seen wins** while unbound | a pending code has no weight; the teacher who actually walked the student to registration is the one who converted them |
| database (`referral_attributions`) | **first binding wins, forever** | it is a PRIMARY KEY; nothing can silently overwrite it |

This is the one genuine business choice inside attribution. The alternative —
first-click-wins in the browser too — rewards whoever got a click first even if a
second teacher did the actual work. **Recommendation: last-touch pending,
first-touch binding**, as above. Say the word and it becomes first-touch
throughout; it is a one-line change in the client and no schema difference.

### C2 · When binding happens

At the **earliest** of:

1. Registration completes while a pending code is held → `source='signup_link'`.
2. The student enters a referral code explicitly → `source='code_entry'`.
3. An admin attributes them → `source='admin'`.

**Never on classroom join.** Joining a teacher's classroom does not attribute a
student, because the brief is explicit that a classroom student is not
automatically commission-eligible — and because the two acts mean different
things. A teacher who wants both hands the student both codes, or one link that
carries both.

### C3 · Who may be attributed

An account may be attributed only if it has **no existing attribution** *and*
**no prior successful purchase**. The second half matters: without it, a teacher
could collect commission on a customer the platform had already won by handing
their code to an existing paying student.

### C4 · The edge cases, decided

| situation | outcome |
|---|--:|
| clicks link, registers later, same browser | bound at registration |
| clicks link, clears storage / different device, registers | **not bound** — the fallback is the code, which is why teachers get both |
| logs in from another device after binding | attribution is a row keyed by user; device-independent |
| pays months later | fine. Binding and award are independent events; **no expiry in v1** — `attributed_at` is recorded so a window can be added later without a migration |
| account existed before clicking | may be bound *if* never purchased (§C3) |
| two teachers' links used before registering | the later one is pending; the binding is the first to reach the DB, and is then permanent |
| tries to bind a second time | refused. The message says "already attributed" and **does not name the teacher** — that would leak which students belong to whom |
| teacher uses own code | refused by CHECK `teacher <> student` |
| code deactivated after binding | binding stands; the row recorded the code text |
| teacher stops being a teacher | commissions already earned stand; new attributions refuse |
| admin reassignment | `admin_reassign_referral(student, teacher, reason)`. Refuses once `locked_at` is set unless forced with a reason. Always audited. **Never silent.** |

---

## D · Commission calculation rules

### D1 · Base

`plan_definitions.amount_egp` for the approved `plan_code`, read server-side at
approval. **Not** `payment_requests.amount_egp` — see §A4.

### D2 · Trigger

Inside the same transaction as a successful approval, in **both** paths (§A5):

- `approve_payment_request` — add `perform award_referral_commission('payment_request', request_id);`
- `activate_subscription` / `activate_credit_pack` — the same, with `'payment'`.

Never on request creation. If the award raises, the approval must still stand:
the hook catches and logs rather than blocking a student's plan over an
accounting row. `UNIQUE(source_kind, source_id)` makes a later replay safe.

Any change to `approve_payment_request` must **reproduce the live 4,409-byte
body verbatim** with only the added line, and be diffed against production before
applying. It is the function that grants every plan.

### D3 · Eligibility — all must hold

1. The student has a `referral_attributions` row.
2. The student has no `referral_commissions` row (the UNIQUE also enforces).
3. This is the student's **first** successful purchase — no earlier approved
   purchase exists in either payment table.
4. `gross_egp > 0`.
5. The attributed teacher is not the student.

### D4 · Tier

`n = (this teacher's non-reversed commissions) + 1`, then the band containing
`n`. So the 10th paid student is charged at 12.5%, matching "10–29 → 12.5%".
The chosen `rate_bps`, label and `n` are frozen into the row.

### D5 · Two decisions that need your answer

**(a) Do packs count?** The brief says "the student's FIRST successful paid
purchase" and "GROSS successful purchase amount" without limiting to
subscriptions, and a pack is real revenue the teacher generated.
**Recommendation: yes — any approved purchase with gross > 0, packs included.**
The alternative (subscriptions only) is defensible but means a student whose
first purchase is a 1,299 Ultra Pack earns the teacher nothing, and then you must
also decide whether that pack consumed the one-purchase slot.

**(b) Rounding.** EGP 349 at 12.5% is exactly 43.625.
**Recommendation: store `numeric(12,2)`, half-up → 43.63**, because that is what
you actually pay, and `gross_egp` + `rate_bps` on the row keep the exact figure
recomputable forever. The alternative is `numeric(12,4)`, exact storage, rounded
only at payout.

### D6 · Reversal

`admin_reverse_commission(id, reason)` sets `status='reversed'`, writes an audit
row, and **excludes the row from future tier counts** — so a reversal genuinely
un-does the tier progress it created. It does not delete: reversed rows stay
visible in the teacher's history with their reason, because a number that
silently disappears from someone's earnings is worse than a number marked
withdrawn.

---

## E · Teacher Dashboard additions

A new section in `teacher.html`, rendered **only when `S.isTeacher`** — assistants
see nothing, and the RPC refuses them independently, so hiding it is not the
security boundary.

- **Overview** — code, link, copy buttons (reuse the `#copyStaffBtn` pattern),
  referred count, paid count, current tier and percentage.
- **Earnings** — gross generated, commission earned, pending, approved, paid,
  available balance (approved and not yet paid).
- **Referred students** — display name, status, whether the first purchase
  landed, its date, plan, amount, commission. **Nothing else**: no email, no
  screenshot, no reference note, no payment method.
- **Tier progress** — "7 paid students · 3 more to reach 12.5%", with a bar. At
  the top band it says so instead of inventing a next target.

Two RPCs, matching the granularity the teaching surfaces already use:
`teacher_referral_summary()` and `teacher_referral_students()`. Both are
caller-scoped — a teacher passes no id and can read only their own.

Deploy-order safe, like the attention list: a failed read hides the section.

## F · Teacher Partner Program page

New root page `partner.html`, in the existing visual language — same tokens, same
`.card` / `.sec-label` / `.pill`, same sidebar. Not a generic SaaS landing page.

Sections: what the program is · your link and code · how commission works · the
three tiers · worked examples at 349 / 899 / 1,949 / 2,999 · what does not
qualify (renewals, failed, cancelled, refunded, reversed) · what the four payout
statuses mean · FAQ.

**No internal financials** — no AI cost, no margin, no CAC, no credit
economics.

Navigation: add to the `nav.js` Teaching block **gated on
`staff_role === 'teacher'`, not `can_staff`** (§A1), add `partner.html` to
`STAFF_NAV_KEEP`, and handle the `hasOwnTeacherLink` suppression (§A11) so the
link also appears on `teacher.html`.

## G · Admin integration

One new tab in `admin.html`, reusing the existing mechanism:

```html
<button class="tab" data-role-min="admin" onclick="switchTab('referrals')">Referrals</button>
<div id="tab-referrals" style="display:none"> … </div>
```

Contents: teachers with code, referred / paid counts, earned / pending / paid ·
commission records with status filters · per-row actions (approve, mark paid,
reverse) · attribution lookup by student · reassignment with a reason. Every
action is a SECURITY DEFINER RPC gated on `has_role_at_least('admin')` that
writes a `referral_audit_log` row.

No new admin page. No new dashboard.

## H · Edge cases

Attribution cases are in §C4. The rest:

| case | handling |
|---|---|
| approval fires twice | `UNIQUE(source_kind, source_id)` — second is a no-op |
| student's plan later upgraded | no second commission: `UNIQUE(student_user_id)` |
| renewal | not a first purchase — §D3.3 excludes it |
| rejected request later approved | only the approval path awards; a rejection never does |
| award raises inside approval | caught and logged; the plan still activates |
| teacher deleted | commissions are keyed by `teacher_user_id`; `ON DELETE` must be RESTRICT, not CASCADE — money records must not vanish with an account |
| tier crossed after award | history frozen; nothing restates |
| commission reversed | excluded from tier counts; row kept, visible, with its reason |
| rate table edited | future awards only |
| two workspaces, one teacher | code is per teacher, so it does not matter |
| FREE plan approved | `gross_egp > 0` excludes it |
| FOUNDER_ANNUAL | slots are 0, so no new purchase is possible |
| legacy `payments` path used | hooked too (§D2), or commission is silently skipped |
| student is themselves staff elsewhere | allowed, unless they are the referring teacher |

## I · Testing plan

Following the conventions already in the repo: suites execute the **real shipped
source** (`tests/_source.mjs`), every check is mutation-tested, and migrations are
dry-run inside a rolled-back transaction against production before being
proposed for approval.

1. **`tests/referral-model.test.mjs`** — constraints are present and are the
   rule: `UNIQUE(student_user_id)`, `UNIQUE(source_kind, source_id)`,
   `PRIMARY KEY(student_user_id)`, the `teacher <> student` CHECK, rate bands
   non-overlapping and gap-free, `rate_bps` integer.
2. **`tests/referral-access.test.mjs`** — default ACL revoked then granted;
   `search_path` pinned; clients hold SELECT only; an **assistant** is refused
   every teacher RPC; a teacher reads only their own; a student reads nothing.
3. **`tests/referral-commission.test.mjs`** — tier boundaries at 9/10 and 29/30;
   rounding at each of the four prices; the base is the catalogue, not the
   request; frozen fields survive a tier change; reversal removes tier progress.
4. **`tests/referral-attribution.test.mjs`** — every row of §C4.
5. **`tests/referral-surface.test.mjs`** — the page never renders email,
   screenshot, reference note or method; the section hides on a failed read;
   assistants get no Partner link; students get no Partner link.
6. **Dry runs, rolled back**: double approval awards once · a second attribution
   is impossible · `amount_egp` tampering does not change the commission ·
   the legacy path awards identically · reversal arithmetic.
7. **Mutation checks**, each of which must go red: drop the UNIQUE; use the
   request amount as the base; unfreeze `rate_bps`; count reversed rows in the
   tier; let `can_staff` gate the Partner page.
8. **Payment-path diff gate** — a test that fails if the shipped
   `approve_payment_request` body differs from production by anything other than
   the added hook.

---

## Decisions — answered by the owner, 2026-08-31

| # | Question | Answer |
|---|---|---|
| 1 | Do credit packs count? | **Yes.** Any approved purchase with gross > 0 |
| 2 | Rounding | **2 decimals, half-up.** 349 x 12.5% = 43.63 |
| 3 | Pending attribution | **Last touch while unpaid**, then permanently bound by the first successful purchase |
| 4 | Attribution expiry | **None in v1** |
| 5 | Commission basis | **Gross**, from `plan_definitions.amount_egp`, never from the client |
| 6 | VAT / withholding | **Guess nothing.** Structure for it, and pay nobody until the treatment is confirmed |
| 7 | Partner eligibility | **`staff_role = 'teacher'`.** No new role |

Answer 3 changed the model: attribution is no longer immutable from the moment
it is written. It is a mutable pointer that the first purchase **locks**, which
is why `locked_at` exists and why the guard trigger permits an update only
while it is null.

Answer 6 is enforced rather than noted: `admin_set_commission_status` refuses to
mark anything `paid` while `system_settings.referral_payouts_enabled` is not
`'true'`, and that setting ships `false`. `commission_egp` (gross commission),
`withholding_egp` and `net_payable_egp` are separate columns, so a withholding
rule can be applied later without touching a single earned figure.

---

## What was built, and what the dry runs proved

Five migration files, **all PREPARED and NOT APPLIED**:

| file | what it is |
|---|---|
| `20260831b_referral_tables.sql` | 7 tables, RLS, the guards, the seeded ladder |
| `20260831c_referral_engine.sql` | `purchase_events`, the award trigger, the historical backfill |
| `20260831d_referral_rpcs.sql` | attribution, the teacher reads, the admin writes |
| `20260831e_referral_payment_hooks.sql` | the three payment functions, verbatim + 4 lines |
| `20260831y_referral_rollback.sql` | unhook first, and refuse to drop a ledger with rows |

### One mechanism, because two would drift

Both payment paths write one canonical `purchase_events` row; a trigger on that
table is the only thing in the system that creates a commission. The three
payment functions gain **one line each** (two for `approve_payment_request`,
which returns separately for packs) and compute nothing. `record_purchase_event`
takes no amount parameter, by design, so no caller can pass a wrong one.

`purchase_events` also gives the platform something it did not have: a single
answer to "has this student ever bought anything?" across two tables with
different status vocabularies. The migration backfills it from history —
**18 rows, 13 approved requests and 5 legacy payments** — which is what stops a
teacher earning a first-purchase commission on a customer the platform already
had.

### The bug the dry run caught

`attribute_referral` and `admin_reassign_referral` both did

```sql
select * into v_existing from referral_attributions where student_user_id = v_uid;
...
perform set_config('si.referral_rpc', 'on', true);
if found then update ... else insert ... end if;
```

**`PERFORM` resets `FOUND`.** So `found` was always true, the first attribution
took the UPDATE branch, updated zero rows, and returned `{"ok": true}` while
binding nobody. Every student would have gone unattributed and no commission
would ever have been awarded — a silent, total failure that no amount of reading
had caught. Both functions now capture `v_had_row := found` immediately, and
`tests/referral-program.test.mjs` fails if either regresses.

### Dry-run evidence, all inside rolled-back transactions

| run | result |
|---|---|
| Engine | **18/18** — the full ladder at 349 (#1 and #9 at 10% = 34.90, #10 and #29 at 12.5% = **43.63**, #30 at 15% = 52.35), replay awards once, a second purchase never awards, packs award, an unpriceable legacy plan awards nothing and says why, a non-teacher earns nothing, an unreferred student is silent, reversing three drops the teacher out of 15%, a gap in the ladder is refused |
| Payment hooks | **6/6** — a request whose `amount_egp` said **99,999** produced a commission on the catalogue's **349**; the approval itself still granted 1,000 credits and set the status; the pack branch awards; a rejected request awards nothing; a student cannot approve their own payment |
| Attribution | **7/7** — first code attributes, a second re-points an unpaid student, once paid a later code cannot move it, an existing paying customer can never be attributed, direct writes and deletes are refused, a locked row cannot be unlocked |
| Access & admin | **8/8** — an active assistant and a student are both refused the earnings read, the payout gate holds, approving is audited, a teacher cannot approve their own commission |

Nothing leaked: 0 referral tables, 0 functions and 0 settings exist in
production, `approve_payment_request` is still `md5 d1dd67130e32a31866738bf9b674bd09`,
and all 13 approved payments are untouched.

`tests/referral-program.test.mjs` — **69 checks, 27/27 mutants killed.** Four of
those checks were vacuous when first written (a float rate slipped past, a hook
wrapped in `IF false` still counted as hooked, the frozen-column check only
proved the columns existed, and the payout gate matched its own lookup rather
than its comparison) and were rewritten until each could go red.

## Still open, and not ours to close

1. **Commission on gross or net** is answered — gross — but the *margin*
   consequence is not. On Pro Annual, 15% of 2,999 is 449.85.
2. **VAT and withholding.** Nothing is encoded, by instruction. Payouts stay
   disabled until it is.
3. **`admin-actions` is an Edge Function.** Hooking `activate_subscription` and
   `activate_credit_pack` covers it without redeploying the function — but if a
   future action activates a plan by writing `profiles` directly instead of
   calling those RPCs, it will not announce a purchase. There is no such action
   today.
4. **The client work is designed and not built** — sections E, F and G above.
   It is deliberately a separate increment: the ledger can be applied and
   verified with no user-visible change at all.
