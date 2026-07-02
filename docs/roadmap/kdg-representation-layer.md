# KDG Representation Layer — module reference

**Status:** Implemented, **un-merged** — pending review before merge
**Module:** `kdg-representation.js` · **Validator:** `scripts/validate-kdg-representation.mjs`
**Architecture (source of truth):** `kdg-multi-axis-architecture.md`

This page documents what the Representation **axis** module does. The full
rationale — why capability vs affinity, why Assessment is a separate axis, the
layer-classification gate — lives in the architecture doc; this reference conforms
to it.

---

## The two independent layers

| Layer | Answers | Source | Node kind |
|---|---|---|---|
| **Knowledge** | *What* is the student learning? | `taxonomy.core.js` | Topic / Subtopic (lesson) |
| **Representation** | *How* may that lesson be presented? | `kdg-representation.js` | Representation |

**Design principle:** changing the representation of a question never changes the
underlying lesson node. `Linear Equations` shown as `x + 3 = 7`, as a graph of
`y = 2x + 1`, or as a word problem is the **same lesson** (`ALG_006`). The module
has **no hard dependency** on the taxonomy; enrichment helpers read a global
`Taxonomy` when present and degrade gracefully when absent.

---

## Capability + affinity (NOT universal membership)

A lesson is representable only in its **capable** representations, ranked by
**affinity**. "Order of Operations → Graph" and "Stem-and-Leaf → Standard
Equation" are **invalid**, not merely rare.

- **Capability** (hard gate, boolean) is **hybrid**: a rule baseline derived from
  the lesson's structural-type tag, corrected by a small expert exception table.
  Precedence **expert override > rule**. Encoded as `RULE_AFFORDS` +
  `LESSON_STRUCTURAL_TYPE` + `EXPERT_CAPABILITY_OVERRIDES`.
- **Affinity** (soft rank, `[0,1]`) orders the capable representations. Learned
  from performance data; currently a cold-start default (`0.5`) with a
  `LEARNED_AFFINITY` injection hook. **Learning tunes affinity only — it never
  silently flips capability** (capability changes go to human review).

Structural type → afforded representations (initial baseline; architecture §2.1):

| Structural type | Affords |
|---|---|
| `PROCEDURAL` | Word, Real-life, Simple Equation |
| `FUNCTIONAL` | Word, Real-life, Simple/Standard Equation, Graph, Table |
| `DATA` | Word, Real-life, Table, Diagram, Graph |
| `GEOMETRIC` | Word, Real-life, Diagram, Standard Equation |
| `COMBINATORIAL` | Word, Real-life, Table, Standard Equation |

Untagged lesson → capability *unknown* (`null`), treated permissively so a new
lesson never hard-breaks a consumer before it is tagged. Example expert override:
`ALG_005` Complex Numbers is `PROCEDURAL` (rule excludes Graph) but Graph-capable
via the Argand plane.

---

## The seven representations

| id | Display name | Legacy `problem_type` |
|---|---|---|
| `WORD_PROBLEM` | Word Problem | `word_problem` |
| `STANDARD_EQUATION` | Standard Equation | `concept` |
| `SIMPLE_EQUATION` | Simple Equation | `concept` |
| `GRAPH` | Graph | `concept` |
| `TABLE` | Table | `concept` |
| `DIAGRAM` | Diagram / Figure | `concept` |
| `REAL_LIFE` | Real-life Scenario | `word_problem` |

Ids are **permanent, opaque UPPER_SNAKE** (a representation id may be persisted, so
it must never change). Display names are presentation-only.

### Not here: Assessment

Multiple Choice / Short Answer / Grid-in are **response formats** — an orthogonal
**Assessment** axis (item metadata), not content representations. They are
intentionally absent; a separate Assessment vocabulary will own them (architecture
§2.2). Removed labels now correctly resolve to `null`.

### Prepared, not built: Reasoning

A future deep graph layer (sub-skills + error mechanisms) sits between Knowledge
and the surface axes (architecture §5). Not implemented here;
`describeNode().knowledge` is shaped so a Reasoning block can sit beside it without
an API change.

---

## Relationship to the existing `problem_type` (bridge unchanged)

Every record carries a **binary** proto-representation `problem_type ∈
{ concept, word_problem }`. The representation axis generalises it; the two coexist
through bridges, so no schema change is needed:

- `fromProblemType('word_problem') → 'WORD_PROBLEM'` (the only lossless direction);
  `fromProblemType('concept') → null` (spans several representations; no guess).
- `toProblemType('WORD_PROBLEM' | 'REAL_LIFE') → 'word_problem'`; every other
  representation → `'concept'`.

**No new database column is introduced.** Persisting a representation id is a
future, separately-approved migration.

---

## API (`window.KDGRepresentation` / `require`)

```
REPRESENTATION_LAYER_VERSION            // 2
REPRESENTATIONS                         // 7 × { id, displayName, description, legacyProblemType }
REPRESENTATION / REPRESENTATION_IDS     // enum + id list
STRUCTURAL_TYPE                         // { PROCEDURAL, FUNCTIONAL, DATA, GEOMETRIC, COMBINATORIAL }

resolveRepresentation(raw) -> id | null // normalise a raw label (alias / id / display name / Arabic)
isRepresentation / isRepresentationId / displayName / describe / normalizeKey / representationIds

// capability (hybrid: rule baseline + expert override)
structuralTypeOf(lessonId) -> type | null
capabilityOf(lessonId, repId) -> true | false | null     // null = untagged lesson (unknown)
canRepresent(lessonId, repId) -> bool                    // false only when explicitly not-capable
capableRepresentations(lessonId) -> [ids]                // capable subset (all if untagged)

// affinity (learned; cold-start default, never flips capability)
affinity(lessonId, repId) -> number[0,1] | null          // null when not capable
rankedRepresentations(lessonId) -> [ids]                 // capable, most-natural first
representationEdges(lessonId) -> [{ from, to, relation:'CAN_BE_REPRESENTED_AS', weight }]

// legacy problem_type bridge (unchanged)
fromProblemType(problem_type) -> id | null
toProblemType(representationId) -> 'word_problem' | 'concept'

// optional knowledge-layer bridge
lessonIds() -> [taxonomy subtopic ids]                   // [] if Taxonomy absent
describeNode({ lessonId, representationId })
    -> { knowledge:{ lessonId, lessonName, structuralType }, representation, capable, affinity, problemType, version }
allEdges() -> [ capable, affinity-weighted edges ]       // [] if Taxonomy absent
```

`resolveRepresentation` rejects unmapped input (`null`, never a guess), matching
the taxonomy resolver's strict, no-passthrough contract.

---

## How the platform will use it

| System | Use of the representation axis |
|---|---|
| **AI Chat** | Classify the current question's representation (`resolveRepresentation`) so hints match the format the student is stuck on. |
| **Root Cause Analyzer** | Separate a concept gap from a *representation/translation* gap on the same lesson; `capabilityOf` distinguishes an *invalid* pairing from a real gap. |
| **Focus Practice** | Vary representation along a recovery path via `rankedRepresentations` (natural → stretch); `canRepresent` guarantees valid practice. |
| **Truth Engine** | Tag verified answers with their representation without changing the lesson id. |
| **Mock Exams / Question Generation** | Request "lesson X in representation Y" from one lesson node; capability hard-blocks invalid combos. |
| **Taxonomy Intelligence** | Reason about a concept independently from its presentation format. |

---

## Loading

Browser (after `taxonomy.js` so the optional bridge sees `window.Taxonomy`):

```html
<script src="taxonomy.js"></script>
<script src="kdg-representation.js"></script>
```

Node / Deno: `const R = require('./kdg-representation.js');` (set
`globalThis.Taxonomy` first if the enrichment bridge is needed).

---

## Follow-ups (each separately approved)

1. **Capability-authority sign-off** — ratify the structural-type tags + afford
   sets + expert overrides (architecture §7.1) before wiring into consumers.
2. **Learned-affinity wiring** — populate `LEARNED_AFFINITY` from real performance
   data; add the review queue that promotes/demotes *capability* candidates.
3. **Assessment vocabulary** — the sibling axis for MC / Short Answer / Grid-in
   (item metadata + resolver).
4. **Edge Function integration** — `ai-tutor` does not import this file yet.
   Requires a byte-identical `supabase/functions/_shared` copy + drift guard and a
   deploy via **DEPLOY.md §4 (CLI only)**. This file does not touch `_shared`, so
   the ai-tutor deploy bundle is unchanged.
5. **Persisting representation ids** — optional nullable column (additive,
   RLS-neutral) alongside `problem_type`. Requires an approved migration.
