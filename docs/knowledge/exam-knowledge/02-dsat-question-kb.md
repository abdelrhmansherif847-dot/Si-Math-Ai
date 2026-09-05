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
twenty field names outright; `looksLikeSourceText()` catches prose smuggled into
a field that is allowed to hold a short label, at every nesting level; the CI
gate rescans the raw JSON for any string over 220 characters.

**The corpus boundary is enforced at ingestion time, not only in CI.**
`assertCorpusOutsideRepo()` runs in `ingest-dsat-pdf.mjs` before anything is
written — before a dry run even reports a path — and the same helper backs the CI
check, so there is one implementation rather than two. This closed a real hole:
CI reads the same `DSAT_CORPUS_ROOT` the pipeline does, so ingesting with it
pointed inside the tree and then running CI without it used to pass while the
corpus sat in the working tree. The earlier CI-only check also missed the case
of a corpus root *equal* to the repository root, because `startsWith(root + '/')`
is false for the root itself. `.gitignore` carries `/dsat-corpus*` and `/corpus*`
as a second net, never as the guard.

---

## 3. Files

| file | what it is |
|---|---|
| `scripts/dsat-kb/schema.mjs` | the canonical vocabulary — every enumeration, the record shape, the copyright guard |
| `scripts/dsat-kb/fingerprint.mjs` | structural and mathematical fingerprints, similarity, duplicate grouping |
| `scripts/dsat-kb/registry.mjs` | the four stores, id allocation, `CORPUS_ROOT` |
| `scripts/dsat-kb/validate-record.mjs` | per-record validation, shared by CI and the pipeline |
| `scripts/dsat-kb/gate.mjs` | the registry-level checks, each with a stable guard code |
| `scripts/dsat-kb/registry/sources.json` | one row per ingested PDF |
| `scripts/dsat-kb/registry/questions.json` | coded question records |
| `scripts/dsat-kb/registry/archetypes.json` | reusable constructions |
| `scripts/dsat-kb/registry/conflicts.json` | everything unresolved |
| `scripts/validate-dsat-kb.mjs` | the CI gate |
| `scripts/ingest-dsat-pdf.mjs` | the ingestion pipeline |
| `tests/dsat-kb.test.mjs` | 83 checks on schema, records and fingerprints |
| `tests/dsat-kb-registry.test.mjs` | 58 checks on the gate and the corpus boundary |

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

## 5. Provenance, use, and eligibility — four axes, not one

**The correction of 2026-09-05:** provenance is metadata, not a prohibition.
"Unofficial source" must never silently become "cannot be learned from". Four
independent axes replace the old accept/reject decision:

| axis | question it answers |
|---|---|
| `provenance` | where did it come from |
| `provenance_confidence` | how well is that established |
| `knowledge_use` | may the KB learn construction logic from it |
| `generation_eligibility` | may the generator draw on it, and how directly |

A record can be `provenance=recalled_unofficial`, `knowledge_use=REFERENCE`,
`generation_eligibility=EXCLUDED` — fully analysed, never a direct source. The
user controls eligibility; the system records it and never silently downgrades
learning because a source is unofficial.

`generation_eligibility` values: `EXCLUDED` · `NOT_DIRECT_SOURCE` · `APPROVED`.
Marking recalled material `APPROVED` requires a recorded decision, which the gate
checks.

### 5.1 The levels

Six levels, ranked, weakest first:

| level | rank | evidence required |
|---|--:|---|
| `unknown` | 0 | no |
| `third_party` | 1 | no |
| `recalled_unofficial` | 1 | no |
| `project_authored` | 1 | no |
| `real_released_practice` | 2 | **yes** |
| `official_college_board` | 3 | **yes** |

**`unknown` is the default and a legitimate resting state**, not a gap to be
filled. Claiming either of the top two without a written `provenance_evidence`
is refused by the pipeline before anything is written, and by CI afterwards.
Re-running ingestion on an already-registered file cannot raise its provenance:
that is a deliberate, evidenced edit, never a side effect.

**Exclusion is now by content signal and by hash, not by filename.** The pipeline
reads the file's own annotation URIs and text for signals — Telegram links,
per-administration tags, "Real" labelling, social handles, College Board
attribution — and each one *classifies* the source and suggests a provenance. It
never discards. The one hard block that survives is pinned by **sha256** to the
single artifact excluded by an earlier explicit instruction, so it cannot catch
anything else by accident.

The old filename-pattern guard is gone because the pilot proved it useless: the
first PDF's name was `Exponents_103_Questions.pdf` and matched nothing, while its
pages carried `https://t.me/satashkent` and fifteen administration tags.

---

## 5.2 Three names for a topic, kept apart

A question record carries a topic on **three separate axes**, and conflating any
two of them destroys the comparison the knowledge base exists to make.

| field | is | validated against | required |
|---|---|---|---|
| `source_label` | the source's **literal terminology**, verbatim, when it prints any | nothing — it is quoted, not interpreted | optional |
| `observed_topic` | a **normalised** form of what the source calls or tests | the `OBSERVED_TOPICS` vocabulary — **never** `taxonomy.core.js` | **required** |
| `topic` + `taxonomy_subtopics` | the **canonical** mapping into the project's frozen taxonomy | `taxonomy.core.js` and the published exam-topic map | **required** |

So a single item reads:

```
source_label        "Negative Exponents"      what the page says
observed_topic      negative_exponents        normalised, still the source's idea
topic               Exponential Functions     canonical
taxonomy_subtopics  ALG_002                   canonical
conflicts           TOPIC_CLASSIFICATION_CONFLICT, KDG_MAPPING_CONFLICT
```

**`observed_topic` is deliberately not checked against the taxonomy.** Binding
them would make every record agree with itself and the comparison would return
nothing. A validator instead refuses an `observed_topic` that *is* a taxonomy
subtopic id, and the gate keeps the two vocabularies disjoint.

`OBSERVED_TOPICS` is a **closed list**, so a source using a word not yet in it
fails validation and the new vocabulary becomes visible rather than accumulating
silently as free text. **Adding an entry is not a taxonomy change**: it records
somebody else's terminology and creates no canonical node.

`UNKNOWN` is a member. A source that names no topic is still recordable, and no
value is invented for it.

### What the pilot shows

| observed topic | n | canonical mapping |
|---|--:|---|
| `exponential_functions` | 43 | Exponential Functions / ALG_011 |
| `exponential_models` | 29 | Exponential Functions / ALG_011 |
| `exponents` | 15 | four different canonical mappings |
| `rational_exponents` | 8 | Exponential Functions / ALG_002+ALG_003 |
| `negative_exponents` | 4 | Exponential Functions / ALG_002 |
| `exponent_rules` | 3 | Exponential Functions / ALG_002(+ALG_003) |
| `scientific_notation` | 1 | Exponential Functions / ALG_002 |

31 of 103 records diverge and say so. **Nothing is resolved by this** — it is the
evidence to accumulate across sources before any taxonomy question is asked.

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

**Both numbers are provisional, and that is machine-readable.**
`SIMILARITY.provisional` lists every threshold that has not been measured and
`SIMILARITY.fittedOn` is `null`; the gate fails if a numeric threshold is neither
listed as provisional nor recorded as fitted. They were chosen by judgement, not
fitted — there are no records yet to fit them against — and this stops them
hardening quietly into settled constants.

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

Two suites, 141 checks:

- `tests/dsat-kb.test.mjs` (83) fires each record-level guard against a record
  built to trip exactly it. **It found two real validator bugs on its first
  run:** a required field explicitly set to `undefined` passed, because
  `hasOwnProperty` is true for it.
- `tests/dsat-kb-registry.test.mjs` (58) covers the registry gate and the corpus
  boundary, asserting on **stable guard codes** rather than message prose — so a
  test says which protection it proves, and cannot pass because a different guard
  fired. **It caught that too:** its own question fixture carried hardcoded
  fingerprints, so every rejection was firing on a fingerprint mismatch instead
  of the thing under test. The suite now proves its baseline fixture is clean
  before relying on it.

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
2. **The near-duplicate threshold (0.85) is unvalidated**, and now says so in
   code (`SIMILARITY.provisional`, `fittedOn: null`), enforced by the gate. It
   should be re-fitted once a few hundred records exist and its false-positive
   rate can be measured. Nothing here claims it has been fitted.
3. **`looksLikeSourceText()` is blunt on purpose.** It will occasionally
   complain about a long legitimate note. That is the right direction to fail.
4. **Mechanism assignment is a judgement.** Nothing automates it, and two coders
   will disagree. Load-bearing counterfactuals exist so the disagreement is
   visible and arguable rather than silent.
5. **Record-level tests still assert on message prose** (38 of them), so
   rewording a validator message breaks a test. The registry suite already uses
   stable codes; extending them to `validate-record.mjs` is a known,
   non-blocking improvement, deliberately not done here.

---

---

## 16. Pilot: the exponents corpus

The first ingestion, 2026-09-05. One PDF, **two source blocks**, 103 records.

| | block A | block B |
|---|---|---|
| pages | 1–4 | 5–86 |
| questions | 15 | 88 |
| provenance | `recalled_unofficial` / OBSERVED | `unknown` / UNKNOWN |
| evidence | per-question administration tags, section titled *Real*, Telegram link on every page | none — the layout resembles a question bank, which is not evidence |
| knowledge_use | REFERENCE | REFERENCE |
| generation_eligibility | EXCLUDED | NOT_DIRECT_SOURCE |

**Neither block is a direct generation source, and both were fully analysed.**
That is the correction working: the recalled block contributes construction
knowledge without ever becoming a template.

What the pilot changed in the layer itself:

- **D-1** filename patterns → content signals plus one hash-pinned block.
- **D-2** page counting through inflated object streams. The pilot file reported
  `?` before; it is 86 pages.
- **D-3** a source row is a *block* of a file, not a file.
- The numeral guard now permits standalone `0` and `1`: the strict form rejected
  the standard growth schematic `(1 + p)^x` itself.
- An **unknown construction is never grouped as a duplicate** — two items whose
  content did not survive extraction were being called the same question.

Three defects the manual audit caught, all fixed:

1. **The key was recorded as a distractor.** Option letters are gone entirely: a
   distractor is a wrong route, and naming letters both mislabelled the key and
   leaked it by omission.
2. **One item was mis-archetyped** — a Roman-numeral range question filed as an
   exponent evaluation.
3. **Family-level signatures made the mathematical fingerprint a restatement of
   the archetype id.** Every item in a family collided; the detector reported 21
   groups covering nearly the whole corpus. Per-item structural constraints
   brought it to 8 defensible groups.

*Prepared 2026-09-05; reviewed, hardened and first-ingested the same day.
Generator frozen, taxonomy frozen, 103 reference records.*

---

## 17. Second ingestion: the polynomials corpus

`Polynomial_Part_1.pdf`, 2026-09-05, sha256 `339cbbe7c9f0…bdbdf`, 55 pages,
**two source blocks**, 77 records. The corpus is now 180.

| | block A (S-003) | block B (S-004) |
|---|---|---|
| pages | 1–5, key on 6 | 7–55, one item per page |
| questions | 28 | 49 |
| provenance | `recalled_unofficial` / OBSERVED | `unknown` / UNKNOWN |
| evidence | 28 per-question administration tags across 15 named administrations, August US 2023 → June US 2025 | none — a question-bank field layout is not attribution |
| knowledge_use | REFERENCE | REFERENCE |
| generation_eligibility | EXCLUDED | NOT_DIRECT_SOURCE |
| answer key | printed on page 6 for all 28 | **none** |
| difficulty | not printed | field printed, **value empty on all 49** |

The structure is the twin of the pilot's, which is worth saying plainly: two
compilations from different hands, bound into one PDF, with one block evidenced
and one not. The D-3 block model was built for the first file and needed no
change for the second.

### The pipeline defect this file exposed

**Four of the five D-1 provenance signals were dead code.** `provenanceScan`
reads text; `ingest-dsat-pdf.mjs` passed it `text: ''`. The only test covering
those signals handed the scanner the text it was checking for, so it passed
while the caller supplied nothing — a green check that could not have gone red.

The cost was concrete. Block A announces its own provenance 28 times, and the
first run reported *no signals at all*.

Three changes, each mutation-tested:

1. **`contentText(buf)`** — a best-effort text probe, explicitly not an
   extractor. It harvests the literal strings from page content streams and
   keeps only runs that are already legible; a subset font with a shifted code
   table yields bytes that are not text, and those are **dropped rather than
   guessed at**. It returns `{streams, legible, ratio}`, and the pipeline prints
   the ratio, so an under-read is visible instead of silent. On this file:
   **6 of 55 streams legible**, which is exactly the six LaTeX pages.
2. **`administration_tag` no longer requires whitespace.** PDF text loses the
   inter-word spacing that lives in the kerning array, so a real tag arrives as
   `[AugustUS2023]`. The `\s+` pattern matched none of the 28.
3. **The show-text operator test was wrong.** `/\bTJ?\b/` matches neither `Tj`
   nor `TJ` when a letter follows. Found by the new test's synthetic PDF, not by
   either real file — and fixing it took the pilot file from 12 content streams
   seen to 93.

A caller-side assertion now reads the shipped pipeline and fails if it ever
passes the empty string again.

### What the source says about itself, kept apart from what it is

Five `SOURCE_CONFLICT` rows, all open, none resolved:

- **SRC-0001** — block B prints Domain *Advanced Math* and Skill *Equivalent
  expressions* on all 49 pages. 8 items test exponent rules or radicals, 7
  manipulate rational expressions, 3 are one- or two-step linear collections.
- **SRC-0002** — 7 items say "the expression above" / "the polynomial above",
  the pre-2024 paper layout in which a stimulus sat above the stem. The Digital
  SAT wording is "the given expression". The metadata (`Assessment: SAT`) does
  not separate the two tests, and the wording points the other way for part of
  the block. **Provenance therefore stays `unknown`.**
- **SRC-0003** — block A is headed *Polynomials*; item 2 is an exponential model
  recovered from a three-row table.
- **SRC-0004** — item 12's stem names three constants and the printed function
  carries two. The parallel item on page 4 prints the third. **The item is not
  repaired**: a silent correction would erase the evidence that this source can
  drop a symbol.
- **SRC-0005** — item 27's answer depends on a multiplicity the source never
  states.

20 of the 77 records carry `SOURCE_CONFLICT`, 8 `TOPIC_CLASSIFICATION_CONFLICT`,
15 `KDG_MAPPING_CONFLICT`. `observed_topic` records the source's own words —
`polynomials`, `equivalent_expressions` — and is not checked against anything.

### What the duplicate detector found

15 groups across the whole 180-record corpus, 7 of them new. Two are
**cross-block**: the same construction appears in the administration-tagged
block and in the unattributed one, with different numbers —

- a trinomial with a symbolic constant term and a stated parameterised factor
  (A item 6 ↔ B page 44),
- "which expression is a factor", where three options are terms of the
  expression (A item 11 ↔ B page 49).

Five more are internal to block A: the intercept-truth construction twice, the
point-evaluation twice, the conjugate-pair product twice, the factorability
bound twice, and the smallest-factor cubic twice — the last pair sharing the
*same quadratic* under a different monomial coefficient.

**This is the finding, not a defect in the detector.** A set compiled from
fifteen administrations repeats constructions because the administrations do.
Items that were genuinely different did *not* group: three intercepts rather
than two, a negated leading coefficient, a printed leading scalar — each kept
its pair apart.

### The manual audit

All 16 block-A items whose answers can be re-derived independently were
re-derived and checked against the printed key. **16 of 16 agree.** Four coding
errors were found and fixed:

1. **The symmetry in the shifted-square pair was stated backwards.** It is not
   that the two asked inputs mirror each other; each asked input mirrors one
   *supplied point* about the shift — so both values are already printed and no
   constant is ever needed. The archetype claimed simultaneous equations that
   nobody has to solve.
2. One distractor was called a transposition when the option is a **root with
   its sign flipped**.
3. "Three options are terms of the expression" was true of two of them.
4. A shared three-distractor fixture was papering over two items whose option
   sets are individually informative. Both were re-coded from their printed
   options and the shared fixture was deleted rather than left unused.

### Standing state

CI **84/84 green**. 4 sources, 180 questions, 41 archetypes, 13 conflicts
(8 taxonomy + 5 source, all open). Longest string in `questions.json`: 171
characters. `taxonomy.core.js`, the KDG, the generator, the EST system and every
exam artifact are untouched; ESTM1's payload md5 is unchanged.

*Second ingestion, 2026-09-05. Further parts of this set are expected and will
join the same file and block model.*

---

## 18. Third ingestion: the polynomials corpus, part 2

`Polynomial_2.pdf`, 2026-09-05, sha256 `9396add0ba2a…be7e6`, 56 pages, 53
records. The corpus is now **233**.

**This file is not a new source. It is the rest of one that was already here.**
Pages 1–53 carry the same layout, the same uniform `Skill: Equivalent
expressions`, the same empty `Difficulty` field as `Polynomial_Part_1`'s block B
— and pages 54–56 carry a **single answer key for 102 items**: the 49 of
Part 1's block B first, then these 53, by Question ID, in exact page order.

So a source *block* can span files. `sources.json` records that directly —
S-005 `continues: S-004`, S-004 `continued_by: S-005` — rather than pretending
the second half is an independent source. Nothing else in the D-3 model changed.

| | S-004 (part 1) | S-005 (part 2) |
|---|---|---|
| pages | 7–55 | 1–53, key on 54–56 |
| questions | 49 | 53 |
| provenance | `unknown` / UNKNOWN | `unknown` / UNKNOWN |
| eligibility | REFERENCE / NOT_DIRECT_SOURCE | REFERENCE / NOT_DIRECT_SOURCE |

**The key does not change the provenance.** It is not attribution: it says what
the answers are, not who wrote the questions. SRC-0002 — the pre-2024 paper
phrasing on part of the block — stays open, and both rows stay `unknown`.

### What the key was worth: 102 of 102

The key arrived *after* 49 of these items were already coded and committed
blind. That makes it an independent check on work already done, which is rarer
and more useful than a check run before.

- **All 102 items re-derived and compared. 102 agree.** Nothing in the coding
  had to be revised.
- The **13 student-produced-response items** across both files are machine-
  checked with exact rational arithmetic: 13/13. The other 89 were derived by
  hand against the printed options.

No answer is stored. The KB records constructions, not keys, and the pilot's
rule stands: naming an option letter both mislabels the key and leaks it by
omission.

### The key is machine-mangled (SRC-0006)

The key was produced through a spreadsheet, and it shows:

- Question ID `70482e20` is stored as **`7.05E+24`**. A hex id that reads as a
  number was reformatted into scientific notation and destroyed.
- Two answers are truncated to a bare `.`.

The row is recoverable only by page position. **No id is corrected anywhere**,
the key is not stored, and nothing joins on it — the finding is recorded so that
a later reader does not assume this source's identifiers are reliable.

### The defect this file exposed: the fingerprint read the source's letters

`eraseNumerals` erases the numbers a source happens to pick. It did not erase
the **letters**. Two literal equations differing only in `r = sqrt(a*w - b)`
versus `p = sqrt(a*c - b)` scored 0.87 and were filed as *same shape, different
mathematics* — when the mathematics is identical. That pair has been sitting in
the committed pilot corpus since the first ingestion.

`eraseNames` renames single-letter identifiers positionally, first appearance
first; multi-letter names (`sqrt`, `root`, `log`) survive so the operators still
discriminate. **Measured before adopting**, across all 233 records: it merges
exactly **two** groups, both true duplicates, and splits none.

| | before | after |
|---|---|---|
| mathematical-fingerprint collision groups | 18 | 20 |
| false positives introduced | — | 0 |

219 of 233 mathematical fingerprints changed value; **no structural fingerprint
did**, which is the right shape for a change to the mathematical erasure only.
Three mutations of the fix go red.

### Duplicates across the whole corpus

17 groups. Two are **cross-file** and two are **cross-block** — the same
construction reappearing in a different file, or under different provenance:

- the "smallest constant in a linear factor of a cubic" item appears **three
  times**: twice in the administration-tagged block and once here. Two of the
  three share the *same quadratic* under a different monomial coefficient.
- "combine two like monomials" repeats across the two files.

One pair the fix newly relates — the two literal equations — is classified
`same_construction_different_shape` rather than grouped, because their option
sets encode different wrong routes. That distinction is the point of having two
fingerprints.

### Standing state

CI **84/84 green**. 5 sources, 233 questions, 46 archetypes, 14 conflicts
(8 taxonomy + 6 source, all open). 42 records carry `SOURCE_CONFLICT`, 46
`TOPIC_CLASSIFICATION_CONFLICT`, 57 `KDG_MAPPING_CONFLICT`. Longest string in
`questions.json`: 149 characters — the copyright guard fired twice during this
ingestion, both times on my own note prose, and both times the prose was
shortened rather than the guard loosened. `taxonomy.core.js`, the KDG, the
generator, the EST system and every exam artifact are untouched; ESTM1's payload
md5 is unchanged.

*Third ingestion, 2026-09-05.*

---

## 19. Closeout: the polynomials corpus

Two files, three source rows, **130 records** — which is exactly the number the
set was named for. 28 + 49 + 53 = 130, and the arithmetic is the completeness
evidence: the answer key covers only the 102 question-bank items, so the "130"
in the set's name counts the administration-tagged block too. Nothing is
outstanding.

| | S-003 | S-004 | S-005 |
|---|---|---|---|
| file | part 1, pp 1–6 | part 1, pp 7–55 | part 2, pp 1–56 |
| questions | 28 | 49 | 53 |
| block | A | B | B *(continues S-004)* |
| provenance | `recalled_unofficial` / OBSERVED | `unknown` | `unknown` |
| eligibility | REFERENCE / **EXCLUDED** | REFERENCE / **NOT_DIRECT_SOURCE** | REFERENCE / **NOT_DIRECT_SOURCE** |

**No polynomial record is a generation source.** All 130 are reference
knowledge, which is the corrected model working exactly as specified: the
material is analysed in full and never becomes a template.

### What the source calls it, and what it is

`observed_topic` holds the source's own words for all 130 — `polynomials` (28),
`equivalent_expressions` (102). The coded topic disagrees for 27 of them, and
that disagreement is recorded rather than resolved:

| coded topic | records | frozen subtopics reached |
|---|---|---|
| Polynomials | 103 | ALG_004 |
| Exponential Functions | 17 | ALG_002, ALG_003, ALG_011 |
| Linear Equations | 10 | ALG_006 |

Eight KDG nodes are reached: N-POLY and N-FACTOR (93 each), then N-RADICAL (12),
N-LINEQ and N-RATEXP (10 each), N-EXPON (4), N-EXPLOG and N-FUNC (1). **The
taxonomy was not touched and the KDG was not touched.** 42 records carry
`SOURCE_CONFLICT`, 26 `KDG_MAPPING_CONFLICT`, 16 `TOPIC_CLASSIFICATION_CONFLICT`;
80 carry none.

### Six source conflicts, all open

`SRC-0001` a uniform Skill label over a block that is 36% something else ·
`SRC-0002` pre-2024 paper phrasing on 17 items, which is why provenance stays
`unknown` · `SRC-0003` a *Polynomials* heading over an exponential model ·
`SRC-0004` a stem naming a constant its printed function does not carry ·
`SRC-0005` an answer depending on an unstated multiplicity · `SRC-0006` an
answer key mangled by a spreadsheet.

None is resolved. **Nothing was silently repaired** — the item with the dropped
symbol still has it dropped, because correcting it would erase the evidence that
this source drops symbols.

### What 130 items were worth

**33 constructions.** The head is thin and the tail is long: the top five
archetypes cover 70 of 130 records, while 11 constructions appear once and 8
appear twice. A corpus this size buys breadth of *shape*, not depth per shape.

Load-bearing mechanisms are dominated by `trap_cost` (82) — in this material the
option set is usually where the difficulty lives — then `filtering` (20),
`multiconcept` (18), `reversal` (17), `hidden_step` (15).

Step counts run 1–5 (median 2). **`step_count` is a time-budget descriptor and
not a difficulty claim**: `difficulty_confidence` is UNKNOWN for all 130, because
the one source that printed a Difficulty field left it empty on every page.

Diversity, measured: 119 distinct mathematical fingerprints and 72 distinct
structural fingerprints across 130 records. 19 records (14%) sit inside a
duplicate group — 9 groups, of which **2 are cross-file and 2 cross-block**. The
"smallest constant in a linear factor of a cubic" construction appears three
times across two files and two provenance blocks, twice on the same quadratic.

### What the two files changed in the layer itself

Each file exposed one defect, both of the same species — a check that could not
have gone red:

1. **Part 1: four of five D-1 provenance signals were dead code.** The pipeline
   passed `provenanceScan` an empty string; the only test covering them handed
   the scanner its own answer. A file announcing its provenance 28 times scanned
   as carrying none. Fixed with a text probe that *reports how much it could
   read* rather than reporting silence.
2. **Part 2: the fingerprint read the source's letters.** `eraseNumerals`
   erased the numbers a source picks and not the symbols. Two identical literal
   equations had been filed as different mathematics since the pilot. Fixed with
   `eraseNames`, measured across all 233 records before adopting: two groups
   merged, both true, none split.

Plus one model extension, forced by the material and no wider: **a source block
can span files** (`continues` / `continued_by`). The second half of a
compilation is not a new source.

### The audit

**All 130 polynomial records have an independently checked answer, and every one
agrees.** Block A's 28 against its own printed key (16 of them re-derived
symbolically, the rest against the printed options); all 102 question-bank items
against the key that arrived with part 2 — 49 of them *after* they had been coded
and committed blind. 13 student-produced-response items are machine-checked with
exact rational arithmetic. Nothing in the coding had to be revised as a result.

**The exponents pilot's 103 records are NOT in that figure**, and this closeout
is where that becomes visible. No key was used for them. S-002's own block label
is *"Questions / Answer Key"*, so a key may well sit in that file unread — which
would make the same after-the-fact check available for the pilot corpus that
part 2's key made available here. Recorded as open, not done: it is a separate
piece of work on a closed ingestion, and inventing a verification claim for it
would be worse than naming the gap.

Six coding errors were found by hand-audit and fixed across the two ingestions,
the largest being a symmetry stated backwards in an archetype that claimed
simultaneous equations nobody has to solve.

### Standing state at closeout

CI **84/84 green** · 5 sources, 233 questions, 46 archetypes, 14 conflicts
(8 taxonomy + 6 source, **all open**) · longest string in `questions.json` 149
characters · no question text, no answer key and no option letter in this
repository. `taxonomy.core.js`, the KDG, the generator, the EST system and every
exam artifact are untouched; ESTM1's payload md5 is unchanged.

*Polynomials closed 2026-09-05. The next topic starts from this state.*

---

## 20. Fourth ingestion: the linear-systems corpus

`System_of_Equation_86_Real_Questions.pdf`, 2026-09-05, sha256
`0dcfc1c66fdd…0c711`, 19 pages, **86 records**. The corpus is now **319**.

One block, not two: 86 administration-tagged items on pages 1–17, the answer key
for all 86 on pages 18–19. Guide pages **52–70**.

| | S-006 |
|---|---|
| questions | 86, every one administration-tagged |
| administrations | 22 named, March US 2023 → June US 2025 |
| provenance | `recalled_unofficial` / **OBSERVED** |
| eligibility | REFERENCE / **EXCLUDED** |
| answer key | printed, all 86 |
| difficulty | not printed |

### Provenance read from content, not from the filename

The file is *named* "86 Real Questions". **That is not what classified it** — D-1
was rewritten during the pilot precisely to stop filename patterns being taken
as evidence, and `real_labelling` did not fire, because the scan reads the
document and the word "Real" is not in it.

What did fire, from the bytes: `administration_tag` ×86, `telegram_channel` ×1
(`https://t.me/satashkent` in the annotations), `social_handle` ×19 (one
watermark per page). The text probe read **19 of 19** content streams.

That channel and that guide are the **same as the exponents pilot** — S-001 is
pages 154–155 of it, this is pages 52–70. The two files have one compiler, which
`sources.json` now records (`same_compiler_as`). It is still not attribution and
the provenance is still `recalled_unofficial`.

### Verification: 19 of 21, and two I am not claiming

All 21 student-produced-response items were re-derived independently. **19 agree
with the printed key**, checked with exact rational arithmetic. The remaining
two ask for a constant recoverable only by reading a plotted line, and the plot
is drawn with path operators this pass did not reduce to coordinates. **They are
recorded as unverified rather than counted as agreeing** — the arithmetic would
have been a guess dressed as a check.

The 65 multiple-choice items were derived against the printed options by hand.

### This set repeats itself, heavily

**41 of 86 records (48%) sit inside a duplicate group** — 16 groups, against 14%
for the polynomials. 61 distinct mathematical fingerprints for 86 items.

The largest families: the dependent-system parametric point **six** times, the
two-lines-through-the-origin item **four** times, the inconsistent-partner
construction **four** times, and one parameter-for-infinitely-many item **three**
times. One pair (items 10 and 12) is the *same question printed twice*, four
pages apart, options included.

**The detector found that pair on its own.** It did not at first — because I had
written `repeats_an_earlier_item_verbatim` into item 12's signature, which is me
doing the detector's job inside the data it consumes. Removing the label made
the check real, and it passed.

### Three ways I leaked source accidents into the numeral-erased signature

The same mistake three times, each one suppressing a true duplicate:

1. **Typography** — `option_letters_A_B_C_E`, `option_letters_parenthesised`.
   How a source prints its choices is not mathematics.
2. **A hand-written duplicate label** — see above.
3. **Numerals** — `scale_factor_three`/`four`/`five`/`six` and
   `large_coefficients`. The literal multiple between two proportional equations
   is a *source number*, and the mathematical fingerprint exists to see past
   those. Encoding it split one six-item family into three and one four-item
   family into two.

All are now in `observed_notes`, where they belong. `scale_factor_from_the_y_terms`
was kept: it names *which* terms fix the scale, which is structure.

The lesson generalises past this file: **the erasure only works on what is given
to it.** `eraseNumerals` and `eraseNames` cannot erase a number I have spelled
out in words inside a constraint.

### What 86 items were worth

**20 constructions**, and unlike the polynomials the head is heavy: the top five
cover 45 of 86. Load-bearing mechanisms lean on `trap_cost` (37) and `filtering`
(27) — this material's difficulty is mostly in *what is asked* rather than in the
algebra, which is why "solve, then evaluate a stated combination" is the single
commonest shape (15 items).

Two constructions are worth naming because they are pedagogy, not arithmetic:

- **`A-SYS-COMPOUND-UNKNOWN`** (6 items) — the system and the question are both
  built on a grouped expression, so the individual variables never need solving
  and solving for them is the long way round.
- **`A-SYS-DEPENDENT-FEATURE`** (4 items) — infinitely many solutions means one
  line, so the asked slope or intercept is *copied* from the printed equation.
  Every one of these prints the negative reciprocal as a distractor: the item
  exists to catch a student reaching for the perpendicular rule.

All 86 map to `Systems of Equations` / ALG_007 / N-SYSEQ. 16 records reach a node
outside that mapping (N-WORD, N-COORD, N-QUAD) and declare the conflict; 70 carry
no conflict at all.

### Two source conflicts, both open

- **SRC-0007** — the section is headed *Linear System of Equations*; three items
  pair a line with a parabola.
- **SRC-0008** — one item's options run **A) B) C) E)**, with no D, and two items
  parenthesise the letters. Nothing is corrected: the KB stores no option letters
  at all, and repairing the source would hide that this compiler mis-transcribes.

### Standing state

CI **84/84 green** · 6 sources, 319 questions, 66 archetypes, 16 conflicts
(8 taxonomy + 8 source, all open) · 33 duplicate groups covering 85 of 319
records · longest string in `questions.json` 192 characters. The copyright guard
fired once more, on my own provenance-evidence string; the string was shortened.
`taxonomy.core.js`, the KDG, the generator, the EST system and every exam
artifact are untouched; ESTM1's payload md5 is unchanged.

*Fourth ingestion, 2026-09-05.*

---

## 21. Fifth ingestion: the circles corpus

`Circles_50_REAL_QUESTION_WITH_ANS_KEY.pdf`, 2026-09-05, sha256
`0f40d5e89f34…b910e`, 14 pages, **47 records**. The corpus is now **366**.

One block: 47 administration-tagged items on pages 1–12, the answer key for all
47 on pages 13–14. Same compiler as the exponents pilot and the linear systems —
same Telegram annotation, same per-page watermark. Text probe: **14 of 14**.

### The filename says 50. The document has 47.

The items are numbered **1 to 47** and the printed key has **47 rows**. That is
recorded as `SRC-0009` and on the source row as `filename_claims: 50` /
`questions_found: 47`.

It is worth setting against the polynomials, where the set was named "130
Questions" and the coded total came to exactly 130 — that agreement was
*evidence of completeness*. Here the same kind of claim is simply wrong, which is
the point of never letting a filename classify anything: **D-1 reads the
document, and so does the count.**

### Verification: 16 of 16

Every student-produced-response item was re-derived and checked against the
printed key with exact rational arithmetic. **16 of 16 agree.** The 31
multiple-choice items were derived against the printed options by hand.

One is worth naming. Item 33 gives a figure marked *not drawn to scale*, two
perpendicular chords, one half-chord length and "the diameter of the circle is
175" — without saying **which** segment is the diameter. The answer follows only
if the perpendicular chord `AC` is it, in which case the chords theorem gives
`AD·DC = BD²` with `AD + DC = 175`, a quadratic whose roots are 2 and 173 and
whose ratio is the key's `173/2`. **The key confirms an inference the stem does
not state**, and the archetype records the dependence.

### What 47 items were worth

**25 constructions** — the widest spread per item of any ingestion so far, and
the reason is that "circles" is not one topic. The records reach four subtopics
(GEO_006 throughout, then GEO_008 coordinate geometry ×28, GEO_005 trigonometry
×5, GEO_002 triangles ×2) and four KDG nodes. Seven records declare both a
topic and a KDG conflict; 40 carry none.

Three constructions are worth naming because they are about *where the trap
lives* rather than about circles:

- **`A-CIRC-SCALE-RADIUS`** — the printed constant is the radius **squared**, so
  doubling the radius multiplies it by four. Every item in this family prints the
  linear scaling as a distractor.
- **`A-CIRC-EQN-READ-FEATURE`** — nothing is computed; the printed shift is the
  *negative* of the coordinate, and the option set is exactly the four sign
  combinations. An item that looks like a reading is two independent sign
  decisions.
- **`A-CIRC-TRANSLATE`** at item 40 — the circle is *plotted*, translated 91
  units, and the asked constant is the radius squared, which a translation leaves
  alone. **The graph and the translation are both decoys.**

Load-bearing mechanisms lean on `trap_cost` (28 of 47), then `abstraction` (11).

### The most repetitive set yet

**28 of 47 records (60%) sit inside a duplicate group** — 13 groups, 31 distinct
mathematical fingerprints for 47 items.

| ingestion | records in a duplicate group |
|---|---|
| polynomials | 14% |
| linear systems | 48% |
| circles | **60%** |

The largest family is the "complete the square, then find the perimeter of the
circumscribing square" item, **four times**; two of those four (items 7 and 11)
are the same question printed twice, options included, six pages apart. So is the
unit-circle angle pair (items 18 and 19), which share a stem verbatim and differ
only in their option sets.

That trend across three compiled sets from one compiler is now the most useful
thing this corpus knows about its own sources: **a topic extract from this guide
repeats roughly half its own constructions**, and the rate rises as the topic
narrows.

### Standing state

CI **84/84 green** · 7 sources, 366 questions, 91 archetypes, 17 conflicts
(8 taxonomy + 9 source, all open) · 46 duplicate groups covering 113 of 366
records · longest string in `questions.json` 192 characters. Two validator
catches during this ingestion — a missing source hash and a literal `2` inside a
circumference formula — were fixed in the data, not waived.
`taxonomy.core.js`, the KDG, the generator, the EST system and every exam
artifact are untouched; ESTM1's payload md5 is unchanged.

*Fifth ingestion, 2026-09-05.*

---

## 22. Sixth ingestion: the areas-and-volumes corpus

`Solid_Geomtry_71_Real_Question.pdf`, 2026-09-05, sha256 `18c7134f010d…b706b50`,
20 pages, **72 records**. The corpus is now **438**.

One block: 72 administration-tagged items on pages 1–18, the answer key for all
72 on pages 19–20. Fourth file from the same compiler. Text probe: **20 of 20**.

### The exam-topic axis has no Solid Geometry row (TAX-0009)

`taxonomy.core.js` has **GEO_007 Solid Geometry** and the KDG has **N-SOLID**.
No exam topic in artifact 01 maps to either. **43 of these 72 items are
three-dimensional and have no exam-topic home.**

This is the *opposite* of the eight taxonomy conflicts already on file. Those are
the exam axis being **finer** than the frozen taxonomy — Mean, Median and Mode as
separate topics where the taxonomy has one. This is the axis missing a row the
taxonomy has. Neither side is edited: `taxonomy.core.js` is frozen, and
artifact 01 records what its source said.

**The gate had to be fixed to let this be recorded at all.** `CONF-TAX-COUNT`
compared the *total* of open `TAXONOMY_CONFLICT` rows against the number of
flagged mapping rows, so it could not tell "each flagged row has an open
conflict" from "eight taxonomy conflicts exist" — and it rejected a ninth of a
different origin. It now checks **per flagged row**, which is the invariant it
was always meant to hold. Closing one of the eight still fires it, a ninth no
longer does, and a ninth cannot substitute for a missing one. All three are
asserted in the registry suite.

*A gate that forbids recording a real conflict is worse than one that counts
loosely.*

### The filename undercounts by one

The items are numbered **1 to 72** with no gap or repeat and the key has 72 rows;
the filename says 71. That is the **second filename in two files** to disagree
with its document, and in the opposite direction from the circles file, which
overcounted by three. Recorded as `SRC-0010`.

`SRC-0011` records a third labelling problem in the same file: the section
carries **two** headings — *Areas&Volumes* and *Solid Geomtry* (sic) — and the
answer key repeats only the first. The two describe different scopes: 28 of the
72 items are plane areas and perimeters, not solids at all.

### Verification: 24 of 24

Every student-produced-response item was re-derived and checked against the
printed key with exact rational arithmetic. **24 of 24 agree**, including the
rectangular pyramid whose two distinct slant heights round to the key's value,
and the regular tetrahedron the stem never names — it identifies the solid only
as "a right triangular pyramid with exactly six edges, each 96 cm". The 48
multiple-choice items were derived against the printed options by hand.

### What 72 items were worth

**29 constructions.** The load-bearing mechanisms are `trap_cost` (43) then
`abstraction` (20) — and in this material "abstraction" almost always means one
specific thing: **knowing which power a given quantity carries.**

That is the corpus's own lesson, repeated in five separate families:

- area scales by the **square** of a linear factor (9 items),
- a percentage rise in two dimensions **compounds** rather than doubling (3),
- surface-area ratio is the **square** of an edge ratio, volume ratio the **cube** (3),
- a tabulated **area** ratio must be rooted before it touches a perimeter (1),
- and a volume ratio reaches a surface area only through a **cube root and then a
  square** (2).

Every one of these prints the un-powered scaling as a distractor. Six further
items bury a single division under a paragraph about sampling trees for leaf
water potential — where the tree count is prominent, irrelevant, and different in
every one of the six.

### Repetition, across four sets from one compiler

| ingestion | records in a duplicate group |
|---|---|
| polynomials, block A | 43% |
| linear systems | 48% |
| circles | 60% |
| areas & volumes | **51%** |

The largest single family here is the similar-figures-area item, **eight times**.
46 distinct mathematical fingerprints for 72 items.

Four sets now put the rate between **43% and 60%**, which is a narrower band than
three sets justified claiming. The earlier reading — that the rate rises as the
topic narrows — is **not supported** by this file: areas-and-volumes is a wider
topic than circles and repeats less, but more than the linear systems, which are
narrower still. The honest statement is the range, not a trend.

### Standing state

CI **84/84 green** · 8 sources, 438 questions, 120 archetypes, 20 conflicts
(**9** taxonomy + 11 source, all open) · 59 duplicate groups covering 150 of 438
records · longest string in `questions.json` 192 characters. Nine validator
catches during this ingestion — a missing source hash, numeric subscripts in
signature names, and structural halvings written as literals — were all fixed in
the data. **The numeral guard has now asked three times for a fraction to be
written symbolically, and three times the answer was to write it out rather than
waive the guard.** `taxonomy.core.js`, the KDG, the generator, the EST system and
every exam artifact are untouched; ESTM1's payload md5 is unchanged.

*Sixth ingestion, 2026-09-05.*
