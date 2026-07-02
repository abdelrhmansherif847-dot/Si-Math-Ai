# KDG Multi-Axis Architecture

**Status:** Architecture proposal — not implemented, nothing merged
**Supersedes framing of:** `kdg-representation-layer.md` (that module is now a
*candidate* Representation axis, not a finalized design)
**Companion:** `adaptive-verification.md` (difficulty-driven verification depth)

---

## 1. Problem statement

The KDG began as a single graph: lessons and their prerequisites. The
representation work exposed that we are really designing a **multi-axis model** of
a *question item*. The open question is not "how many layers" but, for each
dimension:

> Is it a **graph layer** (nodes + edges with real dependency/affordance
> semantics), a **derived bridge** (membership computed from other data), or
> **item metadata** (a flat, canonical attribute of a concrete item)?

Getting the *weight* of each axis right matters more than adding axes. Modeling an
edgeless attribute as a graph is over-engineering; modeling a genuinely relational
dimension as a flat tag throws away the diagnosis the platform sells.

### The item as a composition

A concrete question is a **coordinate** across the axes:

```
Item = Knowledge × Reasoning × Representation × Difficulty × Assessment
        └── deep / diagnostic ──┘   └──────── surface / logistical ────────┘
```

"Deep" axes are pedagogically invariant and carry edges (they answer *what* and
*why*). "Surface" axes are presentation/logistics and mostly carry attributes
(they answer *how shown*, *how hard*, *how answered*). The three concerns below
are really: **which axes are deep graph layers, and which are surface attributes?**

---

## 2. The three focused concerns

### 2.1 Representation — Capability vs Affinity

The universal-membership assumption in the current module is wrong, and the fix is
**not** "low affinity". "Order of Operations → Graph" and "Stem-and-Leaf →
Standard Equation" are not rare — they are **invalid**: there is no coherent
artifact to produce. So Representation needs **two distinct relations**:

| Relation | Type | Semantics | Source |
|---|---|---|---|
| **Capability** | boolean (hard gate) | Is this representation *valid* for this lesson at all? | **derived** from lesson structural-type tags |
| **Affinity** | continuous (soft rank) | Among capable reps, how natural / common / effective? | **learned** from performance (Dynamic-Weight rule) |

The key to scalability is that **capability is derived, not hand-wired per pair**.
Tag each lesson with a few structural flags, and derive capability by rule:

| Lesson structural type | Affords | Excludes |
|---|---|---|
| Procedural / arithmetic (`ALG_001` Order of Ops) | Word, Real-life, Simple Equation | Graph, Diagram |
| Functional / relational (`ALG_010` Quadratics, `ALG_006` Linear) | Graph, Table, Std/Simple Eq, Word, Real-life | — |
| Data / distribution (`STA_004` Stem-and-Leaf, `STA_002` MMM) | Table, Diagram (the plot), Word, Real-life | Standard Equation |
| Geometric (`GEO_002` Triangles, `GEO_007` Solids) | Diagram, Std Equation (formulas), Word, Real-life | (Table marginal) |
| Combinatorial (`PR_002` Perms) | Word, Real-life, Table | Graph |

This costs **O(lessons)** structural tags (~33 lessons × a handful of flags), not
**O(lessons × reps)** hand-curated cells, and a new lesson only declares its flags.
Capability hard-excludes nonsense structurally; affinity ranks what remains.

**Verdict:** Adopt Capability (derived, hard) **+** Affinity (learned, soft).
Reject universal membership.

### 2.2 Assessment — graph layer vs item metadata

**Verdict: first-class canonical *item metadata*, not a graph layer.**

Test for "is it a graph layer?": do its nodes have dependency/affordance edges?
Response formats (MC, Short Answer, Grid-in, Free Response) have **no** prerequisite
or affordance relationships — you do not "unlock" grid-in by mastering MC, and no
lesson *affords* a format. It is a property of the *response channel*, orthogonal
to knowledge.

The one genuinely valuable signal — a student correct as **MC** (elimination) but
wrong as **grid-in** on the *same* knowledge/reasoning — is computed by
**stratifying item outcomes by the assessment attribute** (a group-by on
`question_records`), which needs a recorded attribute, **not edges**. So even the
strongest pro-graph argument reduces to "record it as canonical metadata."

Nuance: make it *first-class* metadata — a normalized enum + resolver (the pattern
already built for representation), **not** a free-text field — so cross-format
diagnostics are reliable. "Metadata" here means *canonicalized attribute*, not
*afterthought string*.

### 2.3 Difficulty — independent axis, graph layer, or metadata?

**Verdict: calibrated metadata at two grains, doubling as a generation/sequencing
target. Not a graph layer, and not a fifth co-equal peer layer.**

Difficulty is **compositionally dependent** on the other axes — it is *emergent*,
not intrinsic. Item difficulty ≈ f(knowledge depth, reasoning demand,
representation, assessment format, item noise). A word problem is harder than the
bare equation; grid-in is harder than MC. Because the other axes *produce*
difficulty, placing it as an orthogonal peer in a linear pipeline
(`… → Representation → Difficulty → Assessment →`) misrepresents the dependency.

Two grains, both metadata:

- **Lesson difficulty** — a static-ish *node attribute* on Knowledge (the
  infographic already carries "Difficulty 3/5" + per-exam weights). Curricular.
- **Item difficulty** — a *calibrated* per-item value (IRT b-parameter / observed
  p-value), **learned from responses**, exactly the platform's
  Continuous-Update philosophy.

As a *control input*, "target difficulty" is achieved by turning the other axes'
knobs (harder reasoning, harder representation), which reconfirms it is a target,
not an ontological layer.

**Verdict recap:** Difficulty = Knowledge-node attribute + calibrated item
attribute + generation target. No nodes, no edges → not a graph layer.

---

## 3. Candidate architectures

Four candidates span the spectrum from item-centric/flat to graph-centric/full.
Each is evaluated on advantages, disadvantages, scalability, and impact on the five
consuming systems.

### Candidate A — Flat multi-tag item model

*Knowledge stays the only graph; Representation, Reasoning, Difficulty, Assessment
are all flat canonical enums on the item.*

- **Advantages:** trivial to ship; cheap; excellent for stratified analytics
  (group-by any tag); no new graph machinery.
- **Disadvantages:** no capability gate (invalid rep combos allowed); no reasoning
  chains; no representation affordance; diagnosis is correlation-only.
- **Scalability:** operationally excellent; **semantically poor** — cannot express
  *why*, only *what*.

| System | Impact |
|---|---|
| Truth Engine | Adequate answer-checking; difficulty tag available for escalation; no structural sanity on the item. |
| Root Cause | Weak — flat-tag correlation only; cannot traverse to a mechanism or separate invalid-rep from translation-gap. |
| Focus Practice | Weak — can filter, cannot *sequence* a recovery path; may assign invalid representations. |
| AI Chat | Adequate — tags are enough to tailor a single hint. |
| Question Generation | Risky — nothing forbids `Order-of-Ops-as-Graph`; safety depends on the LLM self-censoring. |

### Candidate B — Full multi-layer graph

*Every axis is a node layer with inter-layer edges (capability, difficulty, format
all as edges).*

- **Advantages:** maximally expressive; every relation explicit and traversable.
- **Disadvantages:** severe over-engineering for edgeless axes (Assessment,
  Difficulty); combinatorial edge maintenance; an ontology no consumer fully uses;
  slow to build; diagnosis quality bounded by hand-curated edge freshness.
- **Scalability:** **poor** — O(edges) curation across every axis pair.

| System | Impact |
|---|---|
| Truth Engine | Over-served; verification never needs reasoning/format edges. |
| Root Cause | Powerful in theory, brittle in practice — stale/wrong edges silently degrade diagnosis. |
| Focus Practice | Rich traversal but heavy; paths drift from reality as edges age. |
| AI Chat | Graph load/traversal cost for a real-time hint is overkill. |
| Question Generation | Capability-as-edges helps, but format/difficulty-as-edges add constraint-solving cost for no gain. |

### Candidate C — Hybrid: deep graph layers + surface metadata + capability bridge  ★

*Graph only where edges are real; attributes where they are not.*

- **Knowledge** — graph layer (existing prerequisites). Deep.
- **Reasoning** — graph layer (sub-skills + error taxonomy, edges into Knowledge).
  Deep; built last.
- **Representation** — *derived bridge*: representation vocabulary + **capability**
  (derived from lesson structural tags, hard) + **affinity** (learned, soft).
- **Difficulty** — calibrated metadata (lesson node attr + item calibration) +
  generation target.
- **Assessment** — first-class canonical item metadata (resolver + enum).

- **Advantages:** each axis modeled at the right weight; capability structurally
  blocks invalid items; affinity/difficulty learned (fits platform philosophy);
  incremental (Representation capability now, Reasoning later); low maintenance via
  *derived* capability.
- **Disadvantages:** two mental models (layers vs attributes); requires the
  lesson structural-type tagging pass.
- **Scalability:** **best** — curation is O(lessons) via structural tags; metadata
  axes are effectively free; graph curation confined to Knowledge + Reasoning.

| System | Impact |
|---|---|
| Truth Engine | Clean — representation drives stimulus parsing, assessment drives answer-format normalization, calibrated difficulty drives verification escalation (per `adaptive-verification.md`); reasoning later validates the solution path. |
| Root Cause | **Strongest fit** — reasoning graph gives the mechanism; capability separates *invalid representation* from a real *translation gap*; difficulty isolates "fails only when hard"; assessment stratifies cross-format signal. |
| Focus Practice | Strong — traverse Knowledge+Reasoning for the path; capability guarantees valid practice reps; affinity orders the ramp (natural → stretch); difficulty ramps; degrades gracefully before Reasoning ships. |
| AI Chat | Good — canonical Representation/Assessment detection tailors hints now; difficulty calibrates hint depth; surface axes are cheap lookups (no graph load); Reasoning later sharpens misconception targeting. |
| Question Generation | **Best fit** — capability hard-gates invalid combos; affinity + target difficulty are generation controls; assessment format is a simple pick; safe and composable. |

### Candidate D — Uniform typed-axis / item-centric model

*The item is the first-class entity; every axis is a uniform plug-in declaring its
own type (`graph | derived | metadata`), resolver, and optional edges. Same API
across axes.*

- **Advantages:** elegant, uniform; the item-as-coordinate contract is the cleanest
  possible generation interface; new axes plug in without bespoke wiring.
- **Disadvantages:** abstraction cost before any consumer exists; tends to
  *under-invest* in the one axis where edges matter most (Reasoning) by treating it
  like the edgeless ones; flattening Knowledge into "just an axis" loses the
  ergonomic prerequisite traversal today's code relies on.
- **Scalability:** good engineering scalability; risk is building framework ahead of
  need.

| System | Impact |
|---|---|
| Truth Engine | Ergonomic uniform axis access; minor loss of easy Knowledge-prerequisite context. |
| Root Cause | Works *only if* the axis-type genuinely supports reasoning edges — otherwise it silently regresses to Candidate A for diagnosis. |
| Focus Practice | Recovery-path sequencing still needs privileged Knowledge/Reasoning traversal; uniform API can express it but usually under-models it. |
| AI Chat | Clean uniform detection across axes; good. |
| Question Generation | Very clean — item-as-coordinate is the natural contract; capability/affinity attach per axis. Its best system. |

---

## 4. Recommendation

**Adopt Candidate C, using Candidate D's *item-composition contract* as the API
shape.** Concretely: keep Knowledge and Reasoning as true graph layers (deep,
edge-bearing, diagnostic), treat Representation as a derived capability+affinity
bridge, and treat Difficulty and Assessment as canonical item metadata — while
exposing all of them through one uniform "item = typed coordinate" interface so
Question Generation and the resolvers stay consistent.

This wins because it **matches modeling weight to reality**: graph machinery lives
only where edges have meaning (prerequisites, reasoning dependencies, representation
affordance), and the edgeless dimensions (format, difficulty) stay cheap attributes.
It is the only candidate that is simultaneously honest (capability blocks nonsense),
learnable (affinity + difficulty from data), diagnostic (reasoning graph), and
incremental.

### Decisions on the three concerns

1. **Representation** = **Capability (derived, hard gate) + Affinity (learned,
   soft rank)**. Not universal. Invalid (lesson, representation) pairs are
   structurally excluded via lesson structural-type tags.
2. **Assessment** = **first-class canonical item metadata**, not a graph layer.
   Cross-format diagnosis is a stratified group-by, which needs a recorded
   attribute, not edges.
3. **Difficulty** = **calibrated metadata** (lesson node attribute + item
   calibration) that doubles as a **generation/sequencing target**. Not a graph
   layer and not a co-equal peer, because it is compositionally produced by the
   other axes.

### Reframing the proposed pipeline

The linear `Knowledge → Reasoning → Representation → Difficulty → Assessment` is
better read as **two tiers composed onto an item**, not five equal peers:

```
        DEEP (graph, edges, diagnostic)
        ┌───────────────┐      ┌───────────────┐
        │   KNOWLEDGE   │◀────▶│   REASONING   │
        └───────┬───────┘      └───────┬───────┘
                │  capability(derived) + affinity(learned)
                ▼
        SURFACE (attributes, no edges)
        ┌───────────────┬───────────────┬───────────────┐
        │ REPRESENTATION│  DIFFICULTY    │  ASSESSMENT   │
        │ (bridge)      │ (calibrated)   │ (metadata)    │
        └───────────────┴───────────────┴───────────────┘
                         ▼
                     ITEM (coordinate across all axes)
```

### Consequence for the un-merged Representation module

Do not merge it as-is. It becomes the **Representation axis** with: MC/Short Answer
removed (→ Assessment metadata), universal membership replaced by
capability+affinity, and lesson structural-type tags introduced as the capability
source. `problem_type` bridges stay valid.

### Sequencing (delivery order, not a build request)

1. Split Assessment out; formalize Representation capability (structural tags) +
   affinity placeholder. *(surface, cheap)*
2. Difficulty calibration hook (lesson attr now; item calibration once data exists).
3. Reasoning graph **last**, seeded from `CONCEPT_CANON` + infographic root-cause
   vocabulary, gated on real usage data (per `adaptive-verification.md`).

---

## 5. Open questions

1. **Capability authority** — are structural-type tags author-curated, or partly
   inferred from the taxonomy topic? Who signs off on a lesson's affordances?
2. **Affinity cold-start** — before performance data exists, is affinity uniform
   over capable reps, or seeded from the infographic's contribution weights?
3. **Difficulty source of truth** — reconcile authored "Difficulty 3/5" with a
   learned item calibration when they disagree.
4. **Reasoning node granularity** — misconception-level ("drops ±") vs
   strategy-level ("algebraic / plug-in / working-backwards") vs both.
5. **Persistence** — which axes get columns on `question_records` (additive,
   approved migration) vs stay derived at read time? Representation/Assessment/
   Difficulty are candidates; Reasoning likely a separate relation.
