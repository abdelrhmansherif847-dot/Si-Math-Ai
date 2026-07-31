# Design note — coverage board scope (internal vs external cost)

**Status: decision note only. Nothing implemented. Awaiting owner lock before
Phase 6.**

## The observation

`econ.v_coverage` reports `ai_cost = available, USD 0.22961425`.
`econ.v_pnl_daily` simultaneously reports `no_cost_in_period` on all 383 rows.

Both are correct. Coverage counts every cost fact; the P&L excludes internal
traffic (INV-25, owner rule 3). Today 100% of cost is internal, so the two
disagree completely.

## The question underneath

The two surfaces answer **different questions**, and that is the root of the
apparent contradiction:

| Surface | Question it answers | Natural scope |
|---|---|---|
| `v_coverage` | *Does the data exist, and can it be used?* | everything that exists |
| `v_pnl_daily` | *What did the business earn and spend?* | business traffic only |

The contradiction is not that the totals differ. It is that coverage never
**says** why they differ.

---

## Option A — coverage reports total, with internal and external separated

Coverage keeps counting all cost, but splits it explicitly:

```
ai_cost   available   USD 0.22961425 total — external USD 0.00000000,
                      internal USD 0.22961425 (excluded from P&L per INV-25)
```

**Advantages**

- Coverage stays good at its actual job. A health board must show that
  telemetry is flowing regardless of who generated the traffic.
- It explains the P&L. `no_cost_in_period` stops looking like a fault the
  moment the same screen says "cost exists, all of it internal".
- It preserves the finding. The single most consequential fact of Phases 3–5 —
  that 100% of traffic is internal — is visible rather than filtered away.
- Failure mode is mild: a reader misreads a **labelled** number.

**Disadvantages**

- Two numbers where there was one; more to render and more to read.
- If Phase 6 renders the split poorly, it relocates the confusion instead of
  removing it. The option is only as good as its labelling.
- Coverage and P&L still show different totals — now explained, but still
  requiring a reader to hold two scopes in mind.

**Consistency with INV-25**

Compliant, and this is the important nuance. INV-25 says internal traffic is
"excluded by default and **never silently included**". The prohibition is on
*silence*, not on inclusion. Option A includes internal traffic and names it,
which is exactly the shape INV-25 permits. INV-25 also governs **metrics**;
coverage is a data-availability report, not a metric — it has no money figure
that feeds a business decision.

---

## Option B — coverage adopts the P&L's filter, external only

```
ai_cost   blocked   no external cost in any period
```

**Advantages**

- One rule everywhere: everything on the screen excludes internal traffic.
- Simplest mental model; nothing to reconcile between panels.
- Zero chance a reader folds internal cost into a business figure.

**Disadvantages**

- **Coverage goes blind exactly when it is most needed.** Today it would
  report zero external cost — indistinguishable from "telemetry has stopped".
  A health board that cannot tell "working, all internal" from "broken" is
  failing at its one job, and it would fail that way silently.
- It would have concealed the 100%-internal finding entirely.
- It breaks the diagnostic chain. The P&L says `no_cost_in_period`; coverage
  would agree; neither would say why, and the owner would have to go to SQL to
  find out.
- Sits badly with INV-26 — "catalog or price-book gaps degrade loudly, never
  silently". Cost that exists but is filtered out would be invisible, which is
  the same class of silent gap INV-26 exists to prevent.

**Consistency with INV-25**

Strictly compliant — it excludes internal by default. But it over-applies a
**metric** rule to a **diagnostic** surface, buying consistency at the cost of
observability.

---

## Recommendation — Option A

Three reasons, in order of weight:

1. **The failure modes are not symmetric.** Option A's worst case is a reader
   misinterpreting a labelled number. Option B's worst case is the owner not
   noticing that telemetry has stopped, because a dead pipeline and a
   fully-internal one both render as `0`. For a system whose entire purpose is
   honest numbers, silently hiding a working pipeline is far worse than
   showing one extra labelled figure.

2. **It fixes the actual defect.** The problem you spotted is missing
   explanation, not a wrong total. Option A adds the explanation. Option B
   removes the symptom by removing information — the two numbers agree because
   one of them stopped saying anything.

3. **It matches what each surface is for.** Forcing a business filter onto a
   data-availability board makes it worse at answering its own question.
   Coverage should describe the data; the P&L should describe the business.

**If Option A is locked, Phase 6 carries one obligation:** the split must be
rendered as a split, not as a single total with a footnote. Coverage should
lead with the external figure — the one that feeds business metrics — and show
the internal figure beside it, marked as excluded. Done that way, the panel
reads as an explanation of the empty P&L rather than a contradiction of it.

**If Option B is preferred instead**, I would want to add a separate
`telemetry_health` line to coverage that counts all cost facts regardless of
scope, so the "is it flowing?" question still has an answer somewhere. Without
that, Option B removes a safety property the platform currently has.

No code changes accompany this note.
