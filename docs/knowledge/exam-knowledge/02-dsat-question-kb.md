# 02 — DSAT Question Knowledge Base: architecture

**Phase:** preparation only. No questions ingested, no questions generated, no
exams, no P4, no Forms 2–25. The generator, the blueprint, the difficulty model,
the allocation model and `taxonomy.core.js` are all untouched.

This describes the layer built *underneath* the generator to learn how authentic
DSAT Math items are constructed. It is ready; it is empty.

---

## 1. The idea in one paragraph

A question bank stores questions. This stores **how questions are built** — what
knowledge an item tests, how that knowledge is combined, what representation
carries it, what reasoning it demands, why its wrong answers are believable, and
what makes it hard. The items themselves stay outside the repository. What lives
here is the construction logic, in a form that can be counted, compared and
checked, so that later work can build genuinely new questions rather than
paraphrase old ones.

---

## 2. The split that everything else follows

```
  THIS REPOSITORY (public)              THE CORPUS (outside, keyed by sha256)
  ─────────────────────────             ────────────────────────────────────
  question records                      the PDFs themselves
  fingerprints                          page images
  archetypes                            extracted text / OCR
  taxonomy + KDG mappings               anything quotable
  provenance and page references
  conflicts
```

The sources are copyrighted and the repository is public. So a record holds
identifiers, structured metadata and fingerprints — never a stem, never an
option, never a solution. The two halves are joined by the source hash and a
page number, which is enough to find any item again and not enough to reproduce
one.

**This is enforced, not merely intended.** `FORBIDDEN_TEXT_FIELDS` refuses
nineteen field names outright; `looksLikeSourceText()` catches prose smuggled
into a field that is allowed to hold a short label; the CI gate rescans the raw
JSON for any string over 220 characters. `CORPUS_ROOT` is asserted to be outside
the repository tree.

---

## 3. Files

| file | what it is |
|---|---|
| `scripts/dsat-kb/schema.mjs` | the canonical vocabulary — every enumeration, the record shape, the copyright guard |
| `scripts/dsat-kb/fingerprint.mjs` | structural and mathematical fingerprints, similarity, duplicate grouping |
| `scripts/dsat-kb/registry.mjs` | the four stores, id allocation, `CORPUS_ROOT` |
| `scripts/dsat-kb/validate-record.mjs` | per-record validation, shared by CI and the pipeline |
| `scripts/dsat-kb/registry/sources.json` | one row per ingested PDF |
| `scripts/dsat-kb/registry/questions.json` | coded question records |
| `scripts/dsat-kb/registry/archetypes.json` | reusable constructions |
| `scripts/dsat-kb/registry/conflicts.json` | everything unresolved |
| `scripts/validate-dsat-kb.mjs` | the CI gate |
| `scripts/ingest-dsat-pdf.mjs` | the ingestion pipeline |
| `tests/dsat-kb.test.mjs` | 83 checks, mostly firing the guards |

Both `scripts/validate-*.mjs` and `tests/*.test.mjs` are auto-discovered by
`tests/run-all.mjs`, so this runs on every commit with no wiring.

---

## 4. What binds to what

The knowledge base defines **no vocabulary of its own** for topics or knowledge
nodes. It imports them:

- **Taxonomy** — `taxonomy.core.js`, 5 topics and 33 subtopics. **Frozen**
  (CLAUDE.md §2: `taxonomy.js` is generated from it and CI fails on drift). The
  KB reads it and never writes it.
- **KDG nodes** — the 35 nodes published in artifact 01
  (`exam-structure-and-kdg.mjs`).
- **Exam topics** — the 22 Digital SAT and 25 ST1 topic names from the same
  artifact.

A record naming a topic, subtopic or node that does not exist in those sources
fails CI. There is no second taxonomy, and there is no way to create one by
accident.

### 4.1 Two axes, because the brief needs both

The brief requires the dedicated topics — `Graphs`, `Tables`, `Mean`, `Median`,
`Mode`, `Interquartile Range`, `Asymptote` — to stay distinct, **and** requires
`taxonomy.core.js` to stay frozen. Those pull in opposite directions: the frozen
taxonomy has one subtopic `Mean, Median & Mode`.

Both hold, because a record carries **two mappings**:

```
topic:               "Median"        ← exam axis, stays distinct
taxonomy_subtopics:  ["STA_002"]     ← frozen axis, stays merged
```

Where the exam axis is finer than the taxonomy, the mapping row is flagged
`conflict: true` and a `TAXONOMY_CONFLICT` is **pre-registered**. Eight are open
already, before any PDF has arrived:

| conflict | why |
|---|---|
| `TAX-0001` Graphs (Data) | no `Graphs` subtopic exists |
| `TAX-0002` Tables (Data) | no `Tables` subtopic exists |
| `TAX-0003/4/5` Mean, Median, Mode | three exam topics, one subtopic `STA_002` |
| `TAX-0006` Interquartile Range | only `Range & Interval` exists |
| `TAX-0007` Asymptote | **no counterpart at all**; lands on `Exponential Functions` |
| `TAX-0008` Word Problems / Mixed | a cross-topic skill used as a topic; no taxonomy home |

These are permanent and must not be "fixed" by editing either side. CI fails if
any is deleted or silently closed.

---

## 5. Provenance

Five levels, ranked, weakest first:

| level | rank | evidence required |
|---|--:|---|
| `unknown` | 0 | no |
| `third_party` | 1 | no |
| `project_authored` | 1 | no |
| `real_released_practice` | 2 | **yes** |
| `official_college_board` | 3 | **yes** |

**`unknown` is the default and a legitimate resting state**, not a gap to be
filled. Claiming either of the top two without a written `provenance_evidence`
is refused by the pipeline before anything is written, and by CI afterwards.
Re-running ingestion on an already-registered file cannot raise its provenance:
that is a deliberate, evidenced edit, never a side effect.

Some sources are excluded permanently and matched by pattern — leaked material,
recalled live exams. The pipeline refuses them by filename before hashing
finishes; this was tested against the actual leaked file in the uploads
directory, and it refused.

---

## 6. Confidence

Four levels, on every claim group independently:

| level | means |
|---|---|
| `SOURCE-STATED` | the source says it |
| `OBSERVED` | read off the item without judgement — option count, figure present |
| `INFERRED` | this ingestion's judgement about the item |
| `UNKNOWN` | not determinable |

`OBSERVED` is the level this phase adds to the project's existing three, and it
earns its place: "there are four options" and "this item is hard" are different
kinds of statement and should never carry the same grade.

---

## 7. Fingerprints

Two, because two different questions get asked of a corpus.

**Structural** — what *shape* is this item? Representation, what is asked, how it
is answered, what stimulus carries it, and **only the load-bearing** mechanisms.
Two items with the same structural fingerprint make the same kind of demand.

**Mathematical** — what *object* is this item about? The schematic relations with
their numerals erased, plus the roles of what is given and asked.

The second is the one that matters. **"Same construction with changed numbers" is
the commonest hidden repetition in an item bank, and no hash of the text can see
it.** Erasing numerals makes it visible: `3x + 7 = 22` and `5x + 2 = 17` both
become `#x + # = #` and collide, while `x² − 5x + 6` does not.

Numerals are erased on the way *in*, so the printed numbers of a copyrighted item
never enter the repository at all. A signature still carrying literal digits is
rejected.

Fingerprints answer "identical?". Near-duplicates need a distance, so each record
also stores a component set scored by Jaccard: ≥ 0.85 near-duplicate, ≥ 0.65 same
archetype family.

**Duplicates are grouped, never deleted.** Every copy's provenance is the evidence
for measuring source overlap later; dropping one destroys it.

---

## 8. Archetypes are constructions

An archetype is **not** a topic. "Solve a linear equation" is a topic label; an
archetype is how the item is built. Eight fields, all required:

`given` · `find` · `transformation` · `hidden_relationship` · `representation` ·
`wrong_route` · `distractor_basis` · `cognitive_demand`

An archetype missing any of them is rejected. So is one whose label equals an
exam topic, a taxonomy subtopic, or a KDG node name — a check that makes the
brief's central distinction mechanical rather than aspirational.

---

## 9. Reasoning mechanisms

Eleven: the brief's ten plus `trap_cost`.

`hidden_step` · `inference` · `multiconcept` · `nonobvious_relationship` ·
`representation_switch` · `abstraction` · `reversal` · `filtering` ·
`competing_interpretations` · `option_testing` · `trap_cost`

**Steps are deliberately not among them.** Step count is a time-budget
descriptor and lives in its own `step_count` field; `steps`, `many_steps` and
their kin are named in `NOT_MECHANISMS` so the mistake fails loudly instead of
passing quietly.

A mechanism marked **load-bearing** must carry a `counterfactual` saying what
changes if it is removed. Without one, "load-bearing" is an adjective; with one
it is a claim that can be wrong. This mirrors the contract the EST generator's
`assess()` already works under.

---

## 10. Distractors

Fourteen categories, the brief's thirteen plus `unknown`:

`arithmetic_slip` · `sign_error` · `wrong_equation_setup` · `wrong_interpretation`
· `wrong_representation` · `incomplete_reasoning` · `reversal_error` ·
`omitted_condition` · `wrong_endpoint` · `wrong_statistical_operation` ·
`plausible_competing_interpretation` · `common_misconception` · `weak_random` ·
`unknown`

Naming any category except `unknown` requires the `wrong_route` that produces it.
**`unknown` exists so a coder never has to invent a rationale** — it is the
correct answer when the distractor's logic cannot be determined, and it is
accepted with no explanation.

---

## 11. Difficulty

Three sources of evidence, kept apart:

| kind | requires |
|---|---|
| `SOURCE-STATED` | the source's own statement, quoted |
| `OBSERVED` | something read off the item |
| `INFERRED` | a `structural_basis` — which mechanisms make it demanding |
| `UNKNOWN` | nothing; and no band may be asserted |

Asserting a band on `UNKNOWN` evidence is refused. So is an `INFERRED` band with
no structural basis, because the point is to answer *what makes this question
hard*, not to relabel it.

---

## 12. The pipeline

```
node scripts/ingest-dsat-pdf.mjs <file.pdf> --provenance=<id> [--evidence=..] [--title=..] [--topic=..] [--dry-run]
```

It does the **mechanical** half of the seventeen-step workflow: inspect, hash
(sha256 + md5), check the exclusion patterns, enforce the provenance rules, read
the page count from the PDF's own page tree, probe for a text layer, create the
corpus directory outside the repository, and emit a coding manifest with one
uncoded row per page.

It does **not** code questions. Topic, KDG nodes, representation, archetype,
mechanisms, distractors and difficulty are judgements about mathematics, and a
script that guessed them would manufacture exactly the confident nonsense this
layer exists to prevent. The manifest is a worklist, not a result.

`--dry-run` inspects and writes nothing.

---

## 13. What CI enforces

`scripts/validate-dsat-kb.mjs` runs on every commit, **including now, with the
registries empty** — most of what can go wrong here is structural, and structure
can be checked before there is data.

Missing provenance · missing source page · invalid topic · invalid taxonomy node
· invalid KDG node · **invented KDG relationships** · missing confidence labels ·
malformed fingerprints · fingerprints that do not recompute · duplicate ids ·
broken question→topic mapping · broken question→KDG mapping · unsupported
difficulty claims · unsupported archetype claims · archetypes that are topic
labels · `steps` as a mechanism · load-bearing without a counterfactual ·
distractor categories without a route · provenance upgrades without evidence ·
excluded sources · **question text in any field** · the eight taxonomy conflicts
being deleted or silently closed.

`tests/dsat-kb.test.mjs` fires each guard against a record built to trip exactly
it — 83 checks. **The test suite found two real bugs in the validator on its
first run:** a required field explicitly set to `undefined` passed, because
`hasOwnProperty` is true for it.

---

## 14. The record

```
question_id  source_id  source_file  source_page  source_question_number
provenance  provenance_confidence  provenance_evidence
exam  topic  taxonomy_subtopics  knowledge_nodes  secondary_knowledge_nodes
prerequisite_nodes  kdg_confidence
representation  representation_transition  target_type
archetype  archetype_confidence
reasoning_mechanisms[{id, load_bearing, counterfactual}]  step_count
distractor_logic[{option, category, wrong_route}]
difficulty_evidence{kind, band, structural_basis|source_statement}  difficulty_confidence
answer_structure  stimulus_type  stimulus_id
mathematical_signature  structural_fingerprint  mathematical_fingerprint
fingerprint_components  duplicate_group  near_duplicate_group
conflicts[]  source_notes  observed_notes  inference_notes  unknown_notes
```

A question maps to **many** nodes, and a node carries **many** questions. Nothing
is forced one-to-one.

---

## 15. What is ready, and what is not

**Ready.** Schema, registries, provenance model, confidence model, both
fingerprint models, the duplicate model, the archetype and mechanism registries,
the distractor taxonomy, the topic↔KDG mapping, the conflict register, the
validators, CI, and the pipeline. Eight conflicts are pre-registered. Zero
questions are ingested.

**Deliberately not built.** No archetype exists yet: archetypes must come from
observed items, and inventing a starter set would seed the corpus with this
project's assumptions rather than the exam's construction. The registry is empty
on purpose.

**Known limits, before the first PDF.**

1. **The `Asymptote` collision cannot be resolved by mapping.** A dedicated exam
   topic with no taxonomy counterpart will always land on `Exponential
   Functions`, so a diagnosis cannot distinguish them. That needs a taxonomy
   decision, and the taxonomy is frozen.
2. **The near-duplicate threshold (0.85) is unvalidated.** It is a starting
   value; it should be re-fitted once a few hundred records exist and its
   false-positive rate can be measured.
3. **`looksLikeSourceText()` is blunt on purpose.** It will occasionally
   complain about a long legitimate note. That is the right direction to fail.
4. **Mechanism assignment is a judgement.** Nothing automates it, and two coders
   will disagree. Load-bearing counterfactuals exist so the disagreement is
   visible and arguable rather than silent.

---

*Prepared 2026-09-05. Generator frozen, taxonomy frozen, corpus empty.*
