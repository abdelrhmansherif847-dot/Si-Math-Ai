# `teacher_attention()` — access verification

**Status: LIVE.** Applied 2026-08-31 as `20260831025024` (`20260831a_teacher_attention.sql`).
Rollback `20260831z` is written and deliberately unapplied.

This is the record for the class-wide attention read: what it is allowed to
show, to whom, and the evidence that it does. It sits beside
`weakness-evidence-audit.md`, which inventories what the platform can honestly
say about a student at all.

---

## 1 · What is live

One function. No table, no policy, no trigger, no column.

```
teacher_attention(p_workspace uuid) returns table (
  student_id, full_name, reason, high_or_critical,
  top_severity, last_signal_at, days_quiet, joined_at)
```

Verified against the repo at apply time:

| | |
|---|---|
| body | **3541 bytes**, md5 `ddbcc6cd54086ef6da8f68a49f5125ae` — identical to `20260831a` |
| `security definer` | yes |
| volatility | `stable` (reads, never writes) |
| `search_path` | `pg_catalog, public`, pinned |
| ACL | `postgres=X \| service_role=X \| authenticated=X` — **no `anon`, no `PUBLIC`** |

That ACL is byte-identical to `teacher_roster`, `teacher_student_card`,
`teacher_student_weaknesses` and `my_experience`. This project's default ACL
grants new functions to `anon` and `authenticated` unless revoked, so the
`revoke … then grant` pair in the migration is what produces that row — not
luck.

## 2 · Who may call it

Access derives from `workspace_is_active_staff(p_workspace)` and nothing else,
which is the same gate `teacher_roster()` uses. Being a teacher is holding an
active staff row in a workspace; there is still no teacher `user_role`, by
design (`teacher-intelligence-layer.md` §8).

Verified against the **deployed** function on 2026-08-31, seeded and rolled
back inside one transaction. 11/11:

| caller | result |
|---|---|
| signed-in account in no workspace | refused `42501` |
| **enrolled student of this very class** | refused `42501` |
| **removed** assistant | refused `42501` |
| **pending** assistant | refused `42501` |
| teacher of a **different** workspace | refused `42501` |
| `anon` | refused `42501` *permission denied for function* — stopped by the ACL, before the gate |
| the teacher | served |
| the **active** assistant | served — payload identical to the teacher's, byte for byte |

A pending assistant being refused matters: routing is not a security boundary
(`experience-routing-verification.md`), so the read has to refuse them itself,
and it does.

## 3 · What it may show

Strictly less than `teacher_student_weaknesses()`, which is already approved:
aggregates only — a count, a band, two dates. Verified live that the returned
keys are exactly:

```
student_id, full_name, reason, high_or_critical,
top_severity, last_signal_at, days_quiet, joined_at
```

No `weakness_score`, `mastery_score`, `improvement_score` or `biggest_weakness`
— the analyzer's working numbers stay withheld exactly as `20260830d` withholds
them. No per-topic list. Nothing commercial or contactable.

## 4 · Freshness is structural, and this is the proof

`weakness_reports` is a snapshot of a student **as of their last signal**, so a
high-severity count can be a month old. The tier is therefore chosen by
freshness first (`FRESH_DAYS = 14`), severity second:

```
last_sig is null        → 'no_evidence'   an ABSENCE, never a weakness
quiet_days > FRESH_DAYS → 'quiet'         severity still shown, always dated
hc > 0                  → 'struggling'    current evidence
```

Live, on seeded data:

```
Amal:struggling/hc3/q2   Basma:struggling/hc1/q1
Carim:quiet/hc4/q40      Dina:quiet/hc0/q20      Eslam:no_evidence/hc0/q-
```

Carim carries **four** high-severity topics and still ranks below Amal's three,
because Carim has been silent 40 days. Change one constant — `FRESH_DAYS :=
99999`, i.e. ignore freshness — and the same data returns:

```
Carim:struggling/hc4/q40   Amal:struggling/hc3/q2   Basma:struggling/hc1/q1
```

A student silent for forty days, first on the list, labelled *struggling*. That
is the false statement this design exists to prevent, and it is why the check is
evidence rather than decoration: it could have gone red, and under the mutant it
did.

## 5 · Three signals deliberately unread

Measured on production before the design was written. Each looks usable:

| field | why not |
|---|---|
| `trend` | populated on 20 of 225 reports (9%) |
| `recent7_count` / `recent14_count` | **frozen at analyzer run time**, not "the last N days". One student carries 205 "recent 7-day" signals while 43 days silent — the UI would print *"31 signals this week"* beside *"quiet for 24 days"* |
| `priority_rank` | ranks **within one student**, so every student is rank 1. Cannot order a class |

The reasons live in the migration header so a future reader does not "restore"
them, and `tests/teacher-attention.test.mjs` fails if any of the four names
appears in the function body or the renderer.

## 6 · The budget

`limit 5` is in SQL, not in the page, so no caller can turn the budget into a
feed. An empty result is a valid answer: the section hides rather than fills
itself. Order is tier → the fact that set the tier → `nm asc, sid asc`, so two
consecutive calls return the identical list (verified) and a row's position
always agrees with the reason printed on it.

## 7 · Deploy order

Irrelevant in both directions. The page treats a failed call as *unavailable*
and hides the section, which is exactly how it looked before the read existed.
The static site deploys on merge; this function was applied by hand first.

## 8 · What this does NOT establish

- **No outcome evidence.** The list says who to look at. Whether looking helped
  is not measurable: `weakness_reports` is current-state with no history, so
  intervention measurement remains impossible (`weakness-evidence-audit.md`).
- **`no_evidence` is not a diagnosis.** It means the platform knows nothing yet.
  The page says so in those words, and shows no severity for that row.
- **Untested at class scale.** One real workspace exists, with one active
  student. The qualification rules are verified on seeded data and sound on
  paper; whether `FRESH_DAYS = 14` and a cap of five are the *right* numbers is
  a question only real classes can answer. Revisit once real rosters exist.
