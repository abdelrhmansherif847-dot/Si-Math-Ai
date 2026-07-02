# ADR — Phase 5: Taxonomy Unification

Status: **Accepted** · Scope: taxonomy consumption across the platform ·
Supersedes M0 audit with `phase-5-audit.md`.

## Context
The platform had multiple representations of "topic/subtopic": a canonical
resolver, legacy name-based APIs, hardcoded lesson lists, and analytics that
grouped by raw names. Phase 5's goal was **one taxonomy, one resolver, one
canonical ID system, one source of truth** — consumed identically everywhere.

A key discovery during the audit: two distinct categories of work were tangled
together.
- **Category 1 — Taxonomy Unification** (this phase): canonical IDs, shared
  resolver/display, removal of legacy taxonomy consumers.
- **Category 2 — Canonical Analytics** (future phase): aggregation, ranking,
  priority calculation, evidence grouping — currently keyed off raw names.
Phase 5 owns Category 1 only.

## Decisions

### D1 — Canonical IDs are the only permanent identifiers
`topic_id` / `subtopic_id` are permanent, opaque DB keys. Names, aliases, and
taxonomy versions may change; IDs may not. All joins, grouping, analytics,
reports, and business logic must key on IDs. **Why:** names drift (casing,
language, misspellings, curriculum renames); only stable IDs give durable,
mergeable identity.

### D2 — Lesson names are presentation-only
Names exist solely for human display, produced only via `displayName(id)`. They
must never drive logic. **Why:** decouples what a lesson *is* (ID) from what it
is *called* (name), so display can evolve without breaking data or logic.

### D3 — Temporary Migration Compatibility Layer
A single, isolated, platform-neutral module (`taxonomy-compat.js`,
`Taxonomy.compat.displayForRecord`) translates legacy records for **display
only** while some rows still have NULL `*_id`. No writes, no grouping, no
business logic. **Why:** lets consumers adopt canonical display now without
blocking on the historical backfill. It is explicitly temporary — its removal is
a Phase 5 completion criterion.

### D4 — Analytics migrations are intentionally deferred
FU-2 (reports), FU-3 (weakness), FU-4 (dashboard) migrate aggregation/ranking
from raw names to IDs. These are **deferred**, not done in Phase 5. **Why:**
regrouping by ID merges legacy-variant rows and changes report/analytics output —
a behavior change, not unification — and it depends on the historical `*_id`
backfill (several tables are only partially canonical, some have no `*_id` at
all).

### D5 — Behavior preservation over aggressive refactoring
Every consumer change preserved runtime behavior; anything that would alter
filtering, grouping, ranking, or output was stopped and deferred (e.g. FU-1,
FU-7 academic guards; FU-2/3/4 analytics). **Why:** this is a live exam-prep
platform with real students and prior incident history; correctness and trust
outweigh doing more per step.

### D6 — Legacy name-API removal is scheduled for M5 (last)
`normalizeTopic` / `normalizeSubtopic` / `subtopicsFor` / `_*Aliases` and their
passthrough fallbacks are removed from `taxonomy.core.js` only after all
consumers migrate. **Why:** removing the API before every caller is migrated
would break consumers; doing it last, behind a proven-complete audit, makes it
safe.

### D7 — Canonical Analytics is a future independent phase
Category 2 (FU-2/3/4 and related) becomes its own dedicated phase, not an
expansion of Phase 5. **Why:** it is analytics redesign gated on the historical
backfill; conflating it with taxonomy unification would blur scope and risk
behavior changes under a "unification" banner.

## Consequences
- Phase 5 can pause at a safe checkpoint with **no unknown taxonomy issues** —
  everything is either compliant, no-change, or a tracked follow-up (FU-1..FU-7).
- Future features (Truth Engine, Root Cause Analyzer, Failure DNA, Learning
  Timeline) must consume the shared ID-first taxonomy per this ADR.
- The compatibility layer and any migration scaffolding must be removed once the
  historical backfills complete.

## References
- `phase-5-architecture.md` — the contract.
- `phase-5-audit.md` — authoritative consumer inventory.
- `phase-5-followups.md` — FU-1..FU-7 deferred items.
