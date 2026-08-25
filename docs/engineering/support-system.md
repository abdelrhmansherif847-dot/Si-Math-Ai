# Help & Support — architecture record

**Status as of 2026-08-25: LIVE.** The six forward migrations were applied on
2026-08-16 as versions `20260816150725` … `20260816155449`; `support-actions`
was deployed the same day and is ACTIVE at platform version 1
(2026-08-16T16:58:38Z); `support_meetings`, `support_meeting_slots`,
`support_tickets` and `system_settings` all exist. Both pages therefore run
against a real schema rather than the designed "not applied yet" state they
were built to degrade into. The seventh file, `20260815z`, is the ROLLBACK: it
is correctly unapplied and must stay that way — running it now destroys a live
support system and its data.

This banner read **"Status as of 2026-08-16: NOTHING IS LIVE"** until
2026-08-25 — nine days after everything went live, and after the six migration
files themselves had already been corrected to ✅ APPLIED. It is corrected in
place, with its own failure recorded, because that failure is the lesson: a
record asserting that a live system was never built is more dangerous than no
record at all.

This is an internal engineering record, not public documentation. It is not
covered by the knowledge-layer freeze (`CLAUDE.md` §5), which governs the public
pages under `docs/knowledge/` and the root marketing HTML.

---

## 1. What it is, and what it deliberately is not

Help & Support is the platform's channel for everything that is **not
mathematics**: logging in, payments, a mock exam that went wrong, something
broken. It has three parts — a help centre, ticket-scoped conversations with a
human, and meetings as an escalation.

**It is not Zero, and the separation is the point.** Zero is a maths tutor.
Support conversations live in their own tables, are answered by people, and
contribute nothing to what the platform believes about a student's mathematics.
Three rules the owner set, and where each is enforced:

| Rule | Enforced by |
|---|---|
| Support is not merged into Zero | Separate tables, separate page, separate function; `tests/support-isolation.test.mjs` fails on any AI marker in the support surface |
| Support data never mixes with academic data | No support table references an academic one; the test asserts twelve academic table names never appear in executable support SQL |
| No automatic AI handling of tickets | `support_sender_role` is `student \| agent \| system`; `'agent'` is written by exactly one function, `admin_support_reply()`, which requires a human agent role |

A support issue therefore cannot affect weakness analysis, focus practice or a
learning profile — not by convention, but because no path exists.

---

## 2. Component map

```
                    ┌───────────────────────────────────────────┐
  student  ────────▶│ support.html            "Get Help"        │
                    │  help centre · tickets · thread · booking │
                    └───────────┬───────────────────────────────┘
                                │  PostgREST + RLS  (anon key, user JWT)
                    ┌───────────▼───────────────────────────────┐
  agent    ────────▶│ admin-support.html      "Support Queue"   │
                    │  queue · thread · slots · articles        │
                    └───────────┬───────────────────────────────┘
                                │  RPC  (SECURITY DEFINER, support_require_agent)
                    ┌───────────▼───────────────────────────────┐
                    │ Postgres: 6 tables, 4 enums, 22 functions │
                    │           15 policies, 7 triggers          │
                    └───────────┬───────────────────────────────┘
                                │  booking commits with provider_ref = '{}'
                    ┌───────────▼───────────────────────────────┐
                    │ support-actions  (Deno Edge Function)     │
                    │  provision · sweep · release              │
                    └───────────┬───────────────────────────────┘
                                │  Server-to-Server OAuth, secrets in env only
                    ┌───────────▼───────────────────────────────┐
                    │ Zoom                                       │
                    └───────────────────────────────────────────┘
```

### Files

| Path | Lines | Role |
|---|---:|---|
| `support.html` | 1167 | Student page. Help centre, tickets, thread, escalation booking |
| `admin-support.html` | 1002 | Agent page. Queue, thread, meeting slots, article editor |
| `supabase/functions/support-actions/index.ts` | — | Provisioning boundary. **LIVE**, platform version 1 |
| `supabase/functions/_shared/support-provider.core.ts` | — | Provider contract + `redactProviderRef` |
| `supabase/functions/_shared/support-zoom.core.ts` | — | The only file that knows Zoom exists |
| `tests/support-isolation.test.mjs` | — | 139 checks across seven boundaries |
| `supabase/migrations/20260815{a..f}` | 2903 | The chain. **APPLIED** 2026-08-16 |
| `supabase/migrations/20260815z_support_rollback.sql` | 872 | Undoes the chain. Correctly **unapplied** — now destructive |

---

## 3. Data model

Four enums, six tables. Full definitions in `20260815a`.

```
support_articles     help-centre content, editable by agents at runtime
support_tickets      one issue. status + meeting_granted live here
  └─ support_messages        the conversation
       └─ support_attachments  screenshot rows, pointing into storage
support_meeting_slots  candidate windows an agent opens
  └─ support_meetings   a booking. provider_ref carries the join link
```

**Enums.** `support_category` (6), `support_ticket_status` (5),
`support_sender_role` (3), `support_meeting_status` (4).

**Two decisions worth carrying forward:**

- **The ticket holds a boolean grant; the meeting row holds the meeting state.**
  An earlier revision had an `escalation_state` enum on the ticket *and* a
  status on the meeting — two authorities that could disagree. The enum was
  deleted. `support_tickets.meeting_granted` means only "an agent has authorised
  a meeting for this ticket"; everything about a booking is
  `support_meetings.status`.
- **Slot occupancy is derived, never stored.** No `claimed_by`/`claimed_at`
  columns to go stale. A slot is taken iff a non-cancelled meeting references
  it, enforced by
  `support_meetings_one_per_slot_idx … where status <> 'cancelled'`.

---

## 4. Roles and permissions

Roles come from the existing `user_role` enum: `user < admin < super_admin <
owner`. Support treats **`admin` and above as "agent"**, via
`has_role_at_least('admin')`.

| Actor | Articles | Tickets | Messages | Attachments | Slots | Meetings |
|---|---|---|---|---|---|---|
| anon | — | — | — | — | — | — |
| student | read published | read/insert **own** | read/insert own, lifecycle-gated | read own, insert gated | read bookable | read own, book if granted |
| agent | all | all | all | all | all | all |

**A student holds no UPDATE verb on `support_tickets` at all.** This is the
carry-forward condition Migration A was approved under. `meeting_granted` is not
merely protected — it is unreachable. Status changes happen as a *consequence*
of the conversation (`support_touch_ticket()`), never as a field a client sets.

Every agent RPC begins `perform public.support_require_agent()`. The isolation
suite asserts this for all nine `admin_support_*` functions individually, in the
first 600 characters of each body — a check that goes red if one is ever added
without the guard.

---

## 5. Ticket lifecycle

```
      open ──────────────▶ in_progress ──────▶ resolved ──────▶ closed
       │                    ▲   │   │            │  ▲              ▲
       │                    │   │   └────────────┼──┘              │
       └────────────────────┼───┼────────────────┼─────────────────┘
                            │   ▼                │
                            └ awaiting_student ──┘
```

Legal edges, enforced by `support_tickets_guard()`:

| From | To |
|---|---|
| `open` | `in_progress`, `closed` |
| `in_progress` | `awaiting_student`, `resolved`, `closed` |
| `awaiting_student` | `in_progress`, `resolved`, `closed` |
| `resolved` | `in_progress`, `closed` |
| `closed` | — terminal |

**`closed` is terminal.** Reopening is not a legal edge; a recurrence needs a
new ticket. `resolved` is *not* terminal — a student replying reopens it, which
is why the reopen path exists without any UPDATE grant.

**Derived transitions** (`support_touch_ticket()`, AFTER INSERT on
`support_messages`):

- student writes on `awaiting_student` or `resolved` → `in_progress`, and
  `resolved_at` is cleared
- agent writes on `open` → `in_progress`
- everything else leaves status alone; `last_message_at` always advances via
  `greatest(...)` so the sort key cannot move backwards

**This makes the agent UI's two lists differ, and `admin-support.html` mirrors
it.** `admin_support_reply()` is two writes: the trigger promotes `open` →
`in_progress` first, *then* `p_set_status` applies from the new status. So a
reply on an `open` ticket may set `awaiting_student`, which is illegal as a
direct transition. Conversely `awaiting_student` is absent from a `resolved`
ticket's options in both lists, because the guard forbids that edge.

---

## 6. Meeting escalation

**Booking is escalation-only.** The ladder, and no step is skippable:

```
1. student opens a ticket
2. agent reads it and decides a call is warranted
3. agent calls admin_support_grant_meeting(ticket)   → meeting_granted = true
4. student sees a booking panel for the first time
5. student books a slot   (or the agent books for them)
6. support_meetings_consume_grant() spends the grant  → meeting_granted = false
7. support-actions provisions the Zoom link
```

Until step 3 the student sees **no mention of meetings at all** — no button, no
explanation. That is deliberate: the panel's absence is the enforcement, so a
student never sees a control the database would refuse.

**The grant is spent by booking and never returned by cancellation.** Owner
decision: every meeting must be preceded by a deliberate support decision, so a
student whose meeting is called off needs a fresh grant.

**Two doors, one rule.** `support_book_meeting()` (student) and
`admin_support_schedule_for_student()` (agent) both call
`support_assert_meeting_capacity()`, which takes
`pg_advisory_xact_lock(20260815, hashtext(user))` before counting — so the count
and the INSERT are one critical section and concurrent bookings queue rather
than slipping past the cap. An earlier revision enforced the cap on the student
door only; an agent could exceed it without even racing.

**Two unique indexes catch the rest:** one live meeting per slot, one scheduled
meeting per ticket. Both booking functions translate the violation into a
sentence a student can act on (`slot_unavailable`, `meeting_already_scheduled`)
via `GET STACKED DIAGNOSTICS … = CONSTRAINT_NAME`.

---

## 7. Storage boundaries

Bucket `support-attachments`, **private**, 5 MB, `image/png|jpeg|webp` — the
same limits `support_attachments`' CHECK constraints impose on the row, because
a row and an object are two resources and gating one says nothing about the
other.

**Path convention is load-bearing, not documentation:**

```
${user_id}/${ticket_id}/${timestamp}.${ext}
```

An upload must name, in segment 2, a ticket that
`support_student_can_post()` accepts: owned by the caller, not closed, and
inside the reopen window if one is ever configured. Segment 1 must be the
caller's own id.

> **What revision 1 got wrong, recorded because the class of mistake recurs.**
> The original policy checked only `(storage.foldername(name))[1] = auth.uid()`.
> `storage.foldername('uid/anything.png')` is `{uid}` — so that path *satisfied*
> the policy, and no ticket was required at all. Every authenticated student
> could upload unlimited objects into their own folder: an open image host
> attached to the product, not a lifecycle leak. The reasoning that produced it
> was "the attachment ROW is the real gate", which was true and irrelevant.

**Reads are deliberately not lifecycle-bound** — a closed ticket's screenshots
must stay viewable, or the record evaporates when the ticket settles. **Deletion
is agent-only.** There is no UPDATE policy: an object here is written once.

**Still unbounded, stated rather than left to be discovered:** a student with
one live ticket may upload many objects into that ticket's folder. The gate
bounds *when* and *where*, not *how many*.

**Agents cannot attach.** The upload policy requires the caller to be the ticket
owner, and an agent is not. This is a schema-level consequence, never an
explicit decision — see §11.

---

## 8. RPC contracts

All `SECURITY DEFINER`, `search_path` pinned, granted to `authenticated`, each
enforcing its own role rule internally.

**Student doors**

| Function | Returns | Raises |
|---|---|---|
| `support_book_meeting(ticket, slot)` | `uuid` | `slot_unavailable`, `meeting_already_scheduled`, `slot_not_found`, `not_granted` |
| `support_cancel_meeting(meeting)` | `void` | ownership failure |

**Agent doors** — all preceded by `support_require_agent()`

| Function | Returns | Notes |
|---|---|---|
| `admin_support_reply(ticket, body, set_status?)` | `uuid` | the only writer of `sender_role = 'agent'` |
| `admin_support_set_status(ticket, status)` | `void` | stamps `resolved_at` / `closed_at` |
| `admin_support_assign(ticket, agent?)` | `void` | `null` unassigns; target must be an agent |
| `admin_support_grant_meeting(ticket)` | `void` | refuses if granted or a meeting is scheduled |
| `admin_support_revoke_meeting(ticket)` | `void` | withdraws an *unspent* grant only |
| `admin_support_schedule_for_student(ticket, slot)` | `uuid` | same cap and lock as the student door |
| `admin_support_upsert_slot(jsonb)` | `uuid` | `{starts_at, ends_at, provider, active, id?}` |
| `admin_support_cancel_slot(slot)` | `void` | refuses if a meeting is booked against it |
| `admin_support_upsert_article(jsonb)` | `uuid` | `{slug, category, question, answer_md, sort_order, published}`; slug is the identity |

**Internal, not client-callable:** `support_require_agent()`,
`support_assert_meeting_capacity(uuid)`, and the four trigger functions.

**Helpers granted to `authenticated`** because RLS evaluates policy expressions
with the caller's privileges: `support_student_can_post(uuid)`,
`support_slot_is_open(uuid)`. `support_setting_int(text)` is revoked from
`public, anon, authenticated` — it reads `system_settings` by arbitrary key with
owner rights.

---

## 9. Edge Function — `support-actions`

**Why it exists.** `support_book_meeting()` commits a meeting with
`provider_ref = '{}'` — "link pending". Postgres cannot call Zoom, and holding a
transaction open across a network round-trip would be worse than the problem it
solves. So booking and provisioning are two steps, and a failure of the second
degrades to "the joining link is being created" rather than a lost booking.

### Actions

| Action | Who | Effect |
|---|---|---|
| `provision` | meeting owner **or** agent | Creates the provider meeting for one scheduled meeting with no link yet. **Called by both pages immediately after a booking**, with the sweep as the safety net |
| `sweep` | agent | Drains `support_meetings_pending_link_idx`, capped at 25 and **reports the cap** |
| `release` | meeting owner **or** agent | Deletes the provider meeting for one the database already considers over; refuses while `status = 'scheduled'`. **Called by both cancel paths**, so a cancelled call stops existing at the provider too |

Every response is `{ok, status}`. **The provider payload — even redacted — is
never returned.** The client re-reads `support_meetings` through RLS, so what a
student may see is decided by `20260815b`'s policies in one place.

### Concurrency

The write-back is a compare-and-swap: `UPDATE … WHERE id = ? AND status =
'scheduled' AND provider_ref->>join_url IS NULL`. If it matches zero rows,
another caller won, and the loser **deletes the provider meeting it just
created** — so the provider is left with exactly one meeting, matching the one
row that references it.

It does not prevent the duplicate *creation*. Doing so needs either a
`provisioning` state or an advisory-lock RPC, both a seventh migration. The
residual cost is one wasted API round trip in a rare race — never an orphan,
never a wrong link.

---

## 10. Credential isolation

**The threat.** `support_meetings.provider_ref` is readable by the meeting's
owner (`support_meetings_read_own`), and `support.html` reads
`provider_ref.join_url` from it. So `provider_ref` is a **public field with
extra steps**.

Zoom's create-meeting response contains `start_url`, which is a bearer
credential: anyone holding it joins **as the host**, with host controls, no
further authentication. Persisting the raw response would hand every student
host rights over their own support call, and a durable token they keep
afterwards.

**Four layers:**

1. **Secrets live only in the function's environment.** `ZOOM_ACCOUNT_ID`,
   `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_USER_ID`, read via
   `Deno.env.get` inside `support-zoom.core.ts` and named nowhere else. The
   access token is cached in the isolate's memory — never a row, never a cookie,
   never a response.
2. **`redactProviderRef()` is an allow-list**, not a deny-list:
   `provider, meeting_id, join_url, passcode, starts_at`. A field Zoom adds in
   2027 cannot leak by default, and nested objects are dropped rather than
   recursed into.
3. **`isSafeProviderRef()` re-checks the result** before the write. If the
   redactor is ever edited into something leaky, the write is still refused —
   and a meeting with no link beats a link that is a host credential.
4. **The function returns no payload at all**, so it cannot become a second
   leak path.

**Error bodies are never relayed.** `zoomErrorMessage(status)` maps a status to
a fixed word (`provider_auth_failed`, `provider_rate_limited`, …); the full body
reaches the function's console, which is an operator audience with a different
threat model.

**Provider-agnostic by construction.** The adapter is loaded by name from
`system_settings('support.meeting_provider')`. Swapping Zoom is a sibling file
plus an UPDATE on one row — no migration, no client change, which is what
`provider_ref` being `jsonb` was for.

---

## 11. Dependency on migrations A–F

Nothing in this system works until the chain is applied, **in order**:

| Migration | Rev | Provides | Without it |
|---|---|---|---|
| `20260815a` | 4 | 4 enums, 6 tables, 4 trigger functions, 6 triggers, 13 indexes | nothing exists |
| `20260815b` | 4 | 3 predicates, 15 RLS policies | tables exist but nobody may read them |
| `20260815c` | 3 | `support_touch_ticket()` + trigger | status never derives; the queue sort key rots |
| `20260815d` | **6** | 13 RPCs | agents cannot reply, assign, grant or schedule |
| `20260815e` | 2 | bucket, upload predicate, 3 storage policies | no screenshots |
| `20260815f` | 2 | 6 articles, 4 settings keys | empty help centre; no provider selected |

**Both pages and the Edge Function survive a partial or absent chain** by
design: they probe for `42P01` / `PGRST202` and show a "being set up" state. The
site deploys automatically on merge while migrations are applied by hand, so
"the page exists before its tables do" is a state that *will* occur.

**`20260815d` is at revision 6 for a reason worth remembering.** Revisions 2–5
wrote `get stacked diagnostics v_constraint = pg_exception_constraint`, and
`PG_EXCEPTION_CONSTRAINT` is not a diagnostics item — the item is
`CONSTRAINT_NAME`. PL/pgSQL validates a body at `CREATE FUNCTION` time, so this
was never a latent bug: **the migration failed to apply outright**. Five review
passes read past it because both handlers read correctly in English. It was
found the first time the chain was actually executed, against a throwaway
PostgreSQL 16 instance. *A migration reviewed but never run is a migration whose
syntax nobody has checked.*

**Rollback.** `20260815z_support_rollback.sql` undoes the whole chain inside one
transaction, behind a five-gate preflight that verifies all 62 objects by exact
name and identity signature, recognises only the six valid prefixes
(A, A+B, … A–F), and walks `pg_depend` to refuse if anything outside the chain
depends on what it would drop. It has never been run against production.

---

## 12. Test coverage

`tests/support-isolation.test.mjs` — **139 checks**, auto-discovered by
`node tests/run-all.mjs`. The per-boundary counts below were measured by running
the suite on 2026-08-25, not tallied by hand; the table previously summed to 121
and had drifted in five of its seven rows.

One earlier check was **deleted rather than repaired**: it read `A === G - (G - A)`,
which reduces to `A === A` and could never have failed. A check that cannot go
red is not evidence — `docs/roadmap/verification-framework-audit.md` is explicit
about this — and the nine per-function guards that replaced it each can.

| Boundary | Checks | Method |
|---|---:|---|
| Academic | 15 | twelve academic table names absent from executable SQL; no FK; function untouched |
| Zero | 22 | ten AI-marker **tripwires** (grep, not proof — a differently-named provider would pass); `sender_role` enum; single `'agent'` writer |
| Tenant | 20 | RLS predicates; **no student UPDATE policy**; exact ticket-policy list; nine `support_require_agent()` guards |
| Credential | 31 | **executes the real `redactProviderRef`** against a realistic Zoom payload |
| Storage | 8 | two-segment requirement; owner segment; shared lifecycle predicate; no UPDATE policy |
| Chain invariants | 19 | each forward migration recorded **APPLIED** with its production version, and its executable SQL md5 pinned so an edit after the fact cannot pass silently; the rollback correctly unapplied; advisory lock on both doors; no `pg_exception_constraint`; settings ship unset |
| Meeting lifecycle | 24 | one per defect found in review: provisioning is wired, release is awaited and conditional, cancel releases, no JSON-path filter, owner-or-agent release, waiting room on, host-overlap refused, link redraws, `raw` spread first |

The credential checks are the ones designed hardest to be falsifiable: the
payload contains `start_url` with a host token, `access_token`,
`encrypted_password`, `host_email` and a nested `settings` object, and each is
asserted **absent** — while `join_url` and `passcode` are asserted **present**,
so a redactor that returned `{}` would fail too.

**What these tests do not do:** they do not execute SQL. Behavioural
verification of the migrations was done separately by applying the chain to a
throwaway PostgreSQL 16 instance — which is how the Migration D defect and the
rollback's policy-cycle defect were found. That harness is not committed; it
needed a stub `auth`/`storage` schema that would rot next to the real one.

---

## 13. Open decisions

Nothing below is blocking; each is recorded so the absence reads as a decision.

| # | Item | Status |
|---|---|---|
| 1 | **Migration A execution** | Not approved. Separate explicit decision |
| 2 | **Unread indicator** | Deferred. Correct cross-device unread needs a `last_seen` data contract; a `localStorage` workaround was explicitly rejected |
| 3 | **Agent attachments** | Blocked at schema level (§7). Would need a seventh migration. Not an explicit decision yet |
| 4 | **Seventh help-centre article** on meeting escalation | Declined for now: a student sees no mention of meetings until one is granted, so documenting the ladder would advertise a door most cannot open. Addable later from the admin editor with no migration |
| 5 | **`reopen_window_days`, `auto_close_after_resolved_days`, `max_active_meetings_per_student`** | Ship **UNSET**. No interval was invented. Setting one is an UPDATE on one row |
| 6 | **Auto-close job** | Does not exist. Setting the key alone would not enable it |
| 7 | **Get Help nav on frozen pages** | `mock-exam.html`, `weakness.html`, `focus.html` are frozen; no sidebar route from them. All three carry "Back to Dashboard" |
| 8 | **`CLAUDE.md` migration count** | Records 78; the directory now holds 85 |
