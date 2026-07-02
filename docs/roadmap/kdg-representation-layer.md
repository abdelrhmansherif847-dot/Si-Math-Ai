# KDG Representation Layer

**Status:** Implemented (layer + API); consumer integration incremental
**Source of truth:** `kdg-representation.js`
**Validator:** `scripts/validate-kdg-representation.mjs`

---

## Why

The Knowledge Dependency Graph (KDG) modelled only *lesson dependencies* — what
a student must know before something else. It did not model **how** a lesson is
presented. That gap made the diagnostic systems conflate two different things:

- A student who fails "Quadratic Equations **as a word problem**" but succeeds at
  "Quadratic Equations **as a graph**" does not have a Quadratics gap — they have
  a *translation* gap. The old graph could not express this.

The representation layer separates the two so the Root Cause Analyzer, Focus
Practice, AI Chat, and the Truth Engine can reason about the **concept**
independently from its **presentation format**.

---

## The two independent layers

| Layer | Answers | Source | Node kind |
|---|---|---|---|
| **Knowledge** | *What* is the student learning? | `taxonomy.core.js` | Topic / Subtopic (lesson) |
| **Representation** | *How* is that lesson presented? | `kdg-representation.js` | Representation |

**Design principle:** changing the representation of a question never changes the
underlying lesson node. `Linear Equations` shown as `x + 3 = 7`, as a graph of
`y = 2x + 1`, as a table of values, or as a word problem is the **same lesson**
(`ALG_006`) in four representations.

The layers are independent modules. `kdg-representation.js` has **no hard
dependency** on the taxonomy; a few enrichment helpers read a global `Taxonomy`
when present and degrade gracefully when it is absent.

---

## The universal representation layer

Every lesson can appear in **any** representation. Rather than wire each lesson to
each representation by hand, the mapping is **global**:

```
                         ┌── Word Problem
                         ├── Standard Equation
                         ├── Simple Equation
   ALL LESSONS  ──▶      ├── Graph
   (every topic)         ├── Table
                         ├── Diagram / Figure
                         ├── Real-life Scenario
                         ├── Multiple Choice
                         └── Short Answer
```

Consequences:

- `representationsForLesson(anyLesson)` returns **all** representation ids.
- `canRepresent(anyLesson, anyValidRepresentation)` is always **true**.
- A newly added lesson is automatically representable in every form — there is no
  per-lesson representation table to maintain.

## The nine representations

| id | Display name | Legacy `problem_type` |
|---|---|---|
| `WORD_PROBLEM` | Word Problem | `word_problem` |
| `STANDARD_EQUATION` | Standard Equation | `concept` |
| `SIMPLE_EQUATION` | Simple Equation | `concept` |
| `GRAPH` | Graph | `concept` |
| `TABLE` | Table | `concept` |
| `DIAGRAM` | Diagram / Figure | `concept` |
| `REAL_LIFE` | Real-life Scenario | `word_problem` |
| `MULTIPLE_CHOICE` | Multiple Choice | `concept` |
| `SHORT_ANSWER` | Short Answer | `concept` |

Ids are **permanent, opaque UPPER_SNAKE** constants (a representation id may be
persisted on a record, so it must never change). Display names are
presentation-only.

---

## Relationship to the existing `problem_type`

Every taxonomy record already carries a **binary** proto-representation:
`problem_type ∈ { concept, word_problem }`. The representation layer is the
generalisation of that binary into nine representations. The two coexist through
bridges, so no schema change is required to adopt the richer vocabulary:

- `fromProblemType('word_problem') → 'WORD_PROBLEM'` (the only lossless direction).
  `fromProblemType('concept') → null` — `concept` is the "not a word problem"
  bucket and spans several representations, so the bridge refuses to guess.
- `toProblemType('WORD_PROBLEM') → 'word_problem'`; every other representation
  collapses to `'concept'`. A consumer that detects a rich representation can
  therefore still write the existing `problem_type` column correctly.

**No new database column is introduced.** Persisting a representation id is a
future, separately-approved migration (see Follow-ups).

---

## API (`window.KDGRepresentation` / `require`)

```
REPRESENTATION_LAYER_VERSION            // 1
REPRESENTATIONS                         // [{ id, displayName, description, legacyProblemType }]
REPRESENTATION                          // enum: REPRESENTATION.GRAPH === 'GRAPH'
REPRESENTATION_IDS                      // ['WORD_PROBLEM', …]

resolveRepresentation(raw) -> id | null // normalise any raw label (aliases, id, display name, Arabic)
isRepresentation(raw) -> bool
isRepresentationId(id) -> bool
displayName(id) -> string | null
describe(id) -> { id, displayName, description } | null
normalizeKey(s) -> string               // same normalisation as taxonomy.core.js

representationIds() -> [ids]
representationsForLesson(lessonId?) -> [ids]     // universal ⇒ all ids
canRepresent(lessonId, representationId) -> bool  // universal ⇒ true for any valid id
representationEdges(lessonId) -> [{ from, to, relation:'CAN_BE_REPRESENTED_AS' }]

fromProblemType(problem_type) -> id | null
toProblemType(representationId) -> 'word_problem' | 'concept'

lessonIds() -> [taxonomy subtopic ids]           // [] if Taxonomy absent
describeNode({ lessonId, representationId }) -> { knowledge, representation, problemType, version }
allEdges() -> [ every lesson × every representation ]   // [] if Taxonomy absent
```

`resolveRepresentation` rejects unmapped input (returns `null`, never a guess),
matching the taxonomy resolver's strict, no-passthrough contract.

---

## How the platform will use it

| System | Use of the representation layer |
|---|---|
| **AI Chat** | Classify the representation of the current question (`resolveRepresentation`) so hints match the format the student is stuck on. |
| **Root Cause Analyzer** | Distinguish a concept gap from a *representation/translation* gap on the same lesson node. |
| **Focus Practice** | Build recovery paths that vary the representation of the weak lesson (e.g. graph → table → word problem). |
| **Truth Engine** | Tag verified answers with their representation without changing the lesson id. |
| **Mock Exams / Question Generation** | Request "lesson X in representation Y" from one lesson node instead of a separate per-representation lesson. |
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

1. **Edge Function integration.** `ai-tutor` does not import this file yet.
   Wiring it in requires a byte-identical `supabase/functions/_shared` copy with a
   drift guard (the taxonomy pattern) and a deploy via **DEPLOY.md §4 (CLI only)**.
   This file deliberately does not touch `_shared`, so the current ai-tutor
   deploy bundle is unchanged.
2. **Persisting representation ids.** Optionally add a nullable
   `representation` column (additive, RLS-neutral) to `question_records` /
   `weakness_signals` so a detected representation can be stored alongside
   `problem_type`. Requires an approved migration.
3. **Detector wiring.** Have the edge detector emit a raw representation label
   that `resolveRepresentation` canonicalises, mirroring the topic/subtopic path.
