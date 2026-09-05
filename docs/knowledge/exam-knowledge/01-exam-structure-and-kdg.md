# 01 — Exam Structure and Knowledge Dependency Graph

**Phase:** knowledge ingestion only. No generator change, no blueprint change, no
difficulty-calibration change, no allocation change, no question or exam
generation, no P4, no Forms 2–25. Nothing in this file instructs the generator.

**Companion:** `01-exam-knowledge-ingestion.md` ingests a third source — a
handwritten notebook — and is referenced here as **artifact 01N**. Both carry the
`01-` prefix because both are foundational; they do not supersede each other.

---

## 0. What these two sources are

Both are **infographics authored by this project**, supplied as inline images.
That matters twice over.

**They are not external evidence.** Unlike the EST practice-guide extracts or the
notebook of 01N, neither carries a publisher, an author, a date, or a citation.
`S-EXAM` says its orders are "the typical order used in official practice tests"
but names no test. So these documents record **what this project believes**, at
the moment they were drawn. They are authoritative about the intended model and
carry no independent weight about the real exams.

**Neither can be hashed.** They arrived as images in conversation, not as files.
There is no sha256, no byte count, nothing to re-open and re-read. **This
transcription is the only record**, which is why every table below carries a
confidence grade and why the arithmetic was recomputed rather than trusted.

That recomputation immediately earned its keep: the question ranges sum exactly
to 44 and 50 (§7), and two internal disagreements fell out that a reader would
not catch by eye (§17.1, §17.2).

---

## 1. Source inventory

| | `S-EXAM` | `S-KDG` |
|---|---|---|
| Title | Digital SAT – Math / ST1 Math (EST I) – Current Format | SI MATH – KNOWLEDGE DEPENDENCY GRAPH (KDG) |
| Kind | infographic | infographic |
| Medium | inline image | inline image |
| Received | 2026-09-05 | 2026-09-05 |
| Hashable | **no** | **no** |
| Authority | project-authored summary | project-authored product architecture |
| Scope | counts, timing, modules, topic order, question ranges, dedicated topics | knowledge nodes, four edge kinds, cross-topic skills, representations, lesson metadata, system flow |
| Panels read | 6 | 12 (numbered 1–9, 11, 12, 12 — see §17.6) |

**`S-KDG` is a product architecture document, not exam knowledge.** Half of it
describes Si Math's own machinery — Truth Engine, Weakness Analyzer, Root Cause
Analyzer, Focus Practice, Learning Timeline. That content is recorded in §9.6–9.8
because it is what the graph is *for*, but it says nothing about any exam.

---

## 2. Digital SAT architecture

| | |
|---|---|
| Exam | `Digital SAT – Math` |
| Format label | `Current Format (Adaptive)` |
| Total questions | **44** |
| Total time | **70 minutes** |
| Structure | `2 Modules (22 + 22)` |
| Calculator | `Allowed (built-in)` |

| Module | Questions | Time | Notes |
|---|---|---|---|
| `Module 1` | 22 | 35 minutes | `Same for all students` |
| `Module 2` | 22 | 35 minutes | `Adaptive (easier or harder based on Module 1)` |
| **Total** | **44** | **70 minutes** | — |

- `EK-DSAT-01` — 44 questions, 70 minutes, two modules of 22 at 35 minutes each. — **SOURCE-STATED**, thrice: header, module table, and key notes
- `EK-DSAT-02` — Module 1 is identical for all students; Module 2 is adaptive on Module 1 performance. — **SOURCE-STATED**
- `EK-DSAT-03` — Calculator allowed, built in. — **SOURCE-STATED**
- `EK-DSAT-04` — What the adaptive branch changes beyond "easier or harder" — how many branches, at what thresholds, whether topic order changes. — **NOT SPECIFIED**

This supersedes nothing in the repository and **replaces the paper-SAT format
wherever it survives in older material**. Artifact 01N's notebook independently
recorded `22`, `22`, `Mod 1, 2`, `Adaptive` — two sources of different kinds
agreeing, which is the strongest structural claim across all three documents.

**One inconsistency inside `S-EXAM` is recorded rather than smoothed.** The
topic table's drawn module boundary does not fall where 22 + 22 requires. See
§17.1; it does not disturb `EK-DSAT-01`.

---

## 3. ST1 Math (EST I) architecture

| | |
|---|---|
| Exam | `ST1 Math (EST I)` |
| Format label | `Current Format` |
| Total questions | **50** |
| Total time | **75 minutes** |
| Structure | `Single Section (no modules)` |
| Calculator | `Allowed` |

- `EK-ST1-01` — 50 questions, 75 minutes, single section, no modules. — **SOURCE-STATED**
- `EK-ST1-02` — Calculator allowed. — **SOURCE-STATED**
- `EK-ST1-03` — ST1 is **not adaptive**: it has no modules to adapt between. — **INFERRED** (from "single section, no modules"; never stated as a negative)
- `EK-ST1-04` — Section timing internal structure, breaks, or per-question pacing. — **NOT SPECIFIED**

This agrees with the repository's existing EST Math form (`50 questions /
75 minutes`, task E3), and it is the **first structural statement about the EST
in any ingested source** — 01N's notebook, despite its title, described only the
SAT.

### 3.1 The relationship between the two exams

`S-EXAM` prints the two topic tables side by side, and **rows 1–22 are the same
topics with the same question ranges in both.** ST1 then continues with three
further rows:

| # | Topic | Notes | Q # |
|---|---|---|---|
| 23 | `Trigonometry` | Right triangle trigonometry, special angles, trig ratios (basic) | 45–47 |
| 24 | `Asymptote` | Horizontal/vertical/slant asymptotes (under exponential functions) | 48 |
| 25 | `Word Problems / Mixed` | Multi-step problems, real-world applications | 49–50 |

- `EK-REL-01` — For questions 1–44 the two exams are given the same topic sequence and the same question ranges; ST1 extends with `Trigonometry`, `Asymptote` and `Word Problems / Mixed` over questions 45–50. — **SOURCE-STATED**
- `EK-REL-02` — Three ST1 rows carry slightly shorter wording than their Digital SAT twins: rows 8, 15 and 20 drop `compound events`, `(basic)` and `(basic)` respectively. The topics and ranges are unchanged. — **SOURCE-STATED**
- `EK-REL-03` — That two different exams should share an identical 44-question topic-to-number mapping is **more plausibly an artefact of how the document was drawn** — one table copied and extended — than a claim about the real instruments. — **INFERRED**, and flagged in §17.3

`EK-REL-03` is a caution, not a correction. The brief says not to assume the two
exams use identical allocations; the source shows them identical, and the honest
record is that the source shows it *and* that this is the kind of identity that
usually indicates a shared template.

---

## 4. Topic taxonomy

### 4.1 The exam topic list

25 topic names across the two exams (22 shared, 3 ST1-only), in source order and
source spelling:

`Data Analysis (Basics)` · `Graphs (Data)` · `Tables (Data)` · `Mean` · `Median`
· `Mode` · `Interquartile Range` · `Probability` · `Ratios, Rates, Percent`
· `Units and Rates` · `Linear Equations` · `Linear Inequalities`
· `Linear Functions` · `Systems of Equations` · `Polynomials`
· `Quadratic Equations` · `Exponential Functions` · `Absolute Value`
· `Geometry (Lines & Angles)` · `Triangles` · `Polygons` · `Circle`
· `Trigonometry` · `Asymptote` · `Word Problems / Mixed`

### 4.2 Dedicated topics

`S-EXAM` boxes seven names under **`Dedicated Topics (Separate Topics)`**:

`Graphs` · `Tables` · `Mean` · `Median` · `Mode` · `Interquartile Range` · `Asymptote`

- `EK-TOPIC-01` — These seven are topics in their own right and are **not** to be folded into a generic `Data Analysis` or `Statistics` topic. — **SOURCE-STATED**, and stated twice (the box, and the key notes)

This is a real modelling decision with consequences, and §17.4 records where it
collides with both `S-KDG` and the live production taxonomy.

### 4.3 Hierarchy

`S-EXAM` has **no topic hierarchy** — it is a flat ordered list. The `Notes`
column names subtopics (`IQR, box plots, spread`) but never declares them
children of anything.

- `EK-TOPIC-02` — Topic hierarchy or parent/child structure in `S-EXAM`. — **NOT SPECIFIED**

One exception is stated inline: `Asymptote`'s note reads
`(under exponential functions)`.

- `EK-TOPIC-03` — `Asymptote` sits under `Exponential Functions` while remaining a dedicated topic. A topic can be both nested and dedicated. — **SOURCE-STATED**

---

## 5. Topic ordering

- `EK-ORDER-01` — Topics appear in a fixed printed order, numbered 1–22 (Digital SAT) and 1–25 (ST1). — **SOURCE-STATED**
- `EK-ORDER-02` — That order is `the typical order used in official practice tests`. — **SOURCE-STATED**, and it is a claim about typicality, not a rule
- `EK-ORDER-03` — **`Exact order can vary slightly between forms.`** — **SOURCE-STATED**

`EK-ORDER-03` is load-bearing and easy to skip. The document's own key notes say
the order is **variable**, so the sequence in §7 is a **PATTERN**, never a HARD
RULE, and no generator may treat position as fixed on this evidence.

The shape of the order, described rather than prescribed: data and statistics
first (rows 1–7), then probability and proportional reasoning (8–10), then
algebra from linear to quadratic to exponential (11–18), then geometry (19–22),
then — on ST1 only — trigonometry, asymptotes and mixed word problems (23–25).

- `EK-ORDER-04` — Whether that data → algebra → geometry progression is intentional design or observed convention. — **UNKNOWN**

---

## 6. Question numbering

- `EK-NUM-01` — Digital SAT questions are numbered **1–44 continuously across both modules**; the numbering does not restart at Module 2. — **SOURCE-STATED**, from the `Q #` column running 1–44 against a two-module structure
- `EK-NUM-02` — ST1 questions are numbered **1–50** in one sequence. — **SOURCE-STATED**
- `EK-NUM-03` — Each topic occupies a **contiguous** question range. — **SOURCE-STATED**, true of every row in both tables
- `EK-NUM-04` — Ranges are printed as `1 – 2`, `7`, `37 – 40`: an interval for multi-question topics, a bare number for single-question topics. — **SOURCE-STATED**

`EK-NUM-01` **contradicts artifact 01N**, whose notebook item logs restart at 1
for module 2. Recorded in §17.5; neither is silently preferred.

---

## 7. Topic distribution

Every range below was summed, not trusted.

### 7.1 Digital SAT — 22 topics, 44 questions

| # | Topic | Q # | n |
|---|---|---|--:|
| 1 | Data Analysis (Basics) | 1 – 2 | 2 |
| 2 | Graphs (Data) | 3 – 4 | 2 |
| 3 | Tables (Data) | 5 – 6 | 2 |
| 4 | Mean | 7 | 1 |
| 5 | Median | 8 | 1 |
| 6 | Mode | 9 | 1 |
| 7 | Interquartile Range | 10 | 1 |
| 8 | Probability | 11 – 12 | 2 |
| 9 | Ratios, Rates, Percent | 13 – 14 | 2 |
| 10 | Units and Rates | 15 – 16 | 2 |
| 11 | Linear Equations | 17 – 18 | 2 |
| 12 | Linear Inequalities | 19 – 20 | 2 |
| 13 | Linear Functions | 21 – 22 | 2 |
| 14 | Systems of Equations | 23 – 24 | 2 |
| 15 | Polynomials | 25 – 26 | 2 |
| 16 | Quadratic Equations | 27 – 28 | 2 |
| 17 | Exponential Functions | 29 – 30 | 2 |
| 18 | Absolute Value | 31 – 32 | 2 |
| 19 | Geometry (Lines & Angles) | 33 – 34 | 2 |
| 20 | Triangles | 35 – 36 | 2 |
| 21 | Polygons | 37 – 40 | 4 |
| 22 | Circle | 41 – 44 | 4 |
| | | | **44** ✓ |

### 7.2 ST1 Math — 25 topics, 50 questions

Rows 1–22 as above (44 questions), then:

| # | Topic | Q # | n |
|---|---|---|--:|
| 23 | Trigonometry | 45 – 47 | 3 |
| 24 | Asymptote | 48 | 1 |
| 25 | Word Problems / Mixed | 49 – 50 | 2 |
| | | | **50** ✓ |

### 7.3 Shape of the distribution

| n per topic | Digital SAT | ST1 |
|---|--:|--:|
| 1 question | 4 topics | 5 topics |
| 2 questions | 16 topics | 17 topics |
| 3 questions | 0 | 1 |
| 4 questions | 2 topics | 2 topics |

- `EK-DIST-01` — The default allocation is **2 questions per topic**; 16 of 22 Digital SAT topics and 17 of 25 ST1 topics take exactly two. — **SOURCE-STATED** (by arithmetic on the printed ranges)
- `EK-DIST-02` — The four single-question topics on both exams are `Mean`, `Median`, `Mode`, `Interquartile Range` — the finest-grained topics get the smallest allocation. — **SOURCE-STATED**
- `EK-DIST-03` — The two four-question topics on both exams are `Polygons` and `Circle`. — **SOURCE-STATED**
- `EK-DIST-04` — No percentage-based distribution, weight, or allowed range is given anywhere. The distribution is a fixed count per topic in this printing, and `EK-ORDER-03` says printings vary. — **NOT SPECIFIED**

`EK-DIST-02` is worth pausing on. Splitting central tendency into three dedicated
topics of one question each, rather than one topic of three, is a **taxonomy
decision that does not change the exam** — the same three questions either way.
It changes what a diagnosis can say.

---

## 8. The four exam strategies

**Neither of these two sources defines four exam strategies.** `S-EXAM` describes
two exams and one adaptive mechanism; `S-KDG` describes a knowledge graph.
Neither contains a strategy taxonomy.

The brief's §7 is conditional — *"If the exam-knowledge document defines four
exam/form strategies"* — and for these two documents the condition is not met.
Inventing four here would be fabrication.

**The four already exist, from a different source.** Artifact 01N extracted four
**exam profiles**, `EP-1`..`EP-4`, from the handwritten notebook, and its §7.0
records the source owner's correction that they are profiles rather than a test
schedule. They are not restated here. Their identifiers are stable and this
artifact cross-links to them.

- `EK-STRAT-01` — Four exam strategies in `S-EXAM` or `S-KDG`. — **NOT SPECIFIED**
- `EK-STRAT-02` — Whether `EP-1`..`EP-4` are meant to apply to the Digital SAT, to ST1, or to both. — **UNKNOWN**. 01N's notebook was almost entirely about the SAT; `S-EXAM` covers both; nothing connects them.

### 8.1 One structural difference the sources *do* state

| | Digital SAT | ST1 Math |
|---|---|---|
| structure | 2 modules | single section |
| adaptive | **yes**, Module 2 on Module 1 | no (`EK-ST1-03`, inferred) |
| questions | 44 | 50 |
| minutes | 70 | 75 |
| minutes per question | 1.59 | 1.50 |
| topics | 22 | 25 |
| numbering | 1–44 continuous | 1–50 |

- `EK-STRAT-03` — The Digital SAT allows marginally more time per question than ST1 (1.59 vs 1.50 minutes). — **INFERRED** (arithmetic; neither document states a pacing figure)

---

## 9. The Knowledge Dependency Graph

### 9.1 Clusters

| id | name | colour |
|---|---|---|
| `ALG` | Algebra & Functions | blue |
| `GEO` | Geometry & Trigonometry | green |
| `DATA` | Data, Probability & Statistics | purple |
| `XT` | Cross-Topic Skills | orange |

### 9.2 Nodes — 35 in total

**Algebra & Functions (14).** `Order of Operations` (Operations) ·
`Exponents` (Powers & Roots) · `Factors & Multiples` (Prime, GCF, LCM) ·
`Polynomials` (Expressions) · `Linear Equations` (One Variable) ·
`Systems of Equations` (Two Variables) · `Inequalities` (Linear) ·
`Absolute Value` (Equations & Inequalities) ·
`Quadratic Equations` (Factoring / Formula / Graphing) ·
`Rational Expressions` (Operations & Simplification) ·
`Radicals & Rational Exponents` (Simplify & Solve) ·
`Exponential & Logarithmic Functions` (Growth, Decay, Models) ·
`Advanced Topics` (Sequences, Series, Complex, Matrices, etc.) ·
`FUNCTIONS (All forms)` — the box lists Linear, Quadratic, Polynomial, Rational,
Exponential, Absolute Value, Piecewise, Etc.

**Geometry & Trigonometry (9).** `Lines & Angles` (Basics) ·
`Polygons` (Properties) · `Triangles` (Congruence, Properties) ·
`Similarity` (Similar Figures) · `Trigonometry` (Ratios, Identities) ·
`Circles` (Angles, Arcs, Chords, Tangent, Theorems) ·
`Coordinate Geometry` (Distance, Midpoint, Slope, Equations) ·
`Solid Geometry` (3D Shapes, Surface Area, Volume) ·
`Advanced Geometry` (Proofs, Transformations, Constructions)

**Data, Probability & Statistics (8).** `Data Representation` (Tables, Charts,
Graphs) · `Measures of Central Tendency` (Mean, Median, Mode) ·
`Data Spread` (Range, IQR, Variance, Std. Dev.) ·
`Probability Basics` (Events, Rules) ·
`Percentage` (Percent, Percent Change, Percent of a Number) ·
`Probability` (Conditional, Independent, Combinations, Permutations) ·
`Distributions` (Discrete, Normal, Binomial) ·
`Statistical Inference` (Sampling, Estimates, Hypothesis)

**Cross-Topic Skills (4).** `Word Problems` (Translation & Modeling) ·
`Units & Rates` (Conversions, Rate Problems) ·
`Logic & Reasoning` (Patterns, Sequences, Logical Thinking) ·
`Time & Work` (Work, Speed, Time Problems)

### 9.3 Edges — 53 recorded

53 edges were read and encoded: **35 prerequisite, 12 supporting, 5 unlocks,
1 strong**. They come from three places in the graphic — the three cluster
spines, the high-level map of panel 5, and the metadata example of panel 8, which
states its prerequisite and unlock sets in words rather than arrows.

Confidence is recorded per edge. The spines and panel 8 are high confidence; six
panel-5 cross-cluster edges are medium, because the lines cross a dense region.

### 9.4 What could not be read

Panel 1 draws a bundle of dashed connectors from several algebra nodes into the
`FUNCTIONS (All forms)` box. **The exact membership is not readable** at the
resolution supplied: the lines converge and overlap.

- `EK-KDG-01` — Multiple Algebra & Functions nodes connect into `FUNCTIONS (All forms)` by supporting/related edges. — **SOURCE-STATED**
- `EK-KDG-02` — Which nodes, exactly. — **UNKNOWN**. Recorded as `FUNCTIONS_BUNDLE.memberList = 'UNREADABLE'` rather than guessed.

Panel 3 outlines `Percentage` and `Statistical Inference` in red and draws a red
connector between them. **Red is not in the relation legend.**

- `EK-KDG-03` — The meaning of the red outlines and the red connector. — **UNKNOWN**

### 9.5 Graph rules

| # | Rule | Text |
|---|---|---|
| 1 | `Prerequisite Rule` | You must master the prerequisites before moving forward. |
| 2 | `Root Cause Rule` | If a student is weak in a lesson, the system checks prerequisites to find the true gap. |
| 3 | `Recovery Path Rule` | Focus Practice builds a personalized path starting from the root cause and moving forward. |
| 4 | `Dynamic Weight Rule` | Percent contributions are not fixed. They are learned from real student performance. |
| 5 | `Continuous Update Rule` | The graph improves as more students solve questions. |

- `EK-KDG-04` — Rule 4 says the percent contributions of §9.7 are **learned, not authored**. The numbers printed are therefore an illustration of a mechanism, not constants. — **SOURCE-STATED**

Rule 4 is the most consequential line in `S-KDG`. It means the whole weighting
layer is a **runtime artefact of student data that does not exist yet**, and no
number in panel 6 or panel 8 may be treated as a fact about mathematics.

### 9.6 System flow

`Student Solves Question` → `Truth Engine Verifies Answer` →
`Weakness Analyzer Finds Weak Lesson` →
`Root Cause Analyzer Finds True Cause (Using KDG)` →
`Focus Practice Builds Recovery Path (Following KDG)` →
`Learning Timeline Tracks Progress Over Time` → `Improvement & Mastery`

- `EK-KDG-05` — The KDG is consumed by the Root Cause Analyzer and by Focus Practice. — **SOURCE-STATED**
- `EK-KDG-06` — Whether these components exist, and in what state. — **NOT SPECIFIED** by the document, and **out of scope** for this ingestion.

### 9.7 Lesson metadata template

Ten columns per node: `Basic Info` · `Prerequisites (Must Know Before)` ·
`Unlocks (Enables)` · `Related Lessons (Supporting)` · `Skills Required` ·
`Common Root Causes` · `Common Mistakes` · `Skill Tags (Type)` ·
`Percent Contributions (Example)` · `Appears As (Representations)`

The single worked node is `Quadratic Equations`:

| field | value |
|---|---|
| Basic Info | Type: `Concept + Calculation`; Difficulty `3 / 5`; Exam Weight SAT `High`, ACT `High`, EST `High` |
| Prerequisites | Order of Operations · Exponents · Polynomials · Linear Equations · Factoring · Fractions & Decimals · Absolute Value |
| Unlocks | Functions · Parabola · Systems of Equations · Inequalities · Exponential Functions · Advanced Algebra |
| Related Lessons | Rational Expressions · Inequalities · Absolute Value · Systems of Equations · Functions |
| Skills Required | Factoring · Equation Solving · Graph Reading · Algebraic Manipulation · Logic & Reasoning |
| Common Root Causes | Factoring Errors · Sign Errors · Misapplying Formula · Arithmetic Errors · Dropping Solutions |
| Common Mistakes | Incorrect Factoring · Wrong Discriminant · Forgetting ± in Formula · Calculation Mistakes · Dropping Solutions |
| Skill Tags | Calculation · Algebraic · Concept · Logic · Reasoning |
| Appears As | all five representations |

- `EK-KDG-07` — The metadata template is populated for **one node of 35**. — **SOURCE-STATED**
- `EK-KDG-08` — Its `Prerequisites` list names `Factoring` and `Fractions & Decimals`, and its `Unlocks` list names `Parabola` and `Advanced Algebra` — **four names that are not nodes anywhere in the graph.** — **SOURCE-STATED**, and a real gap: the template references a finer vocabulary than the graph defines.
- `EK-KDG-09` — `Common Root Causes` and `Common Mistakes` are given as separate columns but their example values overlap in three of five entries. The distinction between them is **UNKNOWN**.

### 9.8 Key benefits and key idea

Seven claimed benefits: finds the real root cause of weakness · builds the
shortest recovery path · works for all question types & representations ·
personalizes learning for every student · improves accuracy of diagnosis · saves
time and increases mastery · works for all subjects and exams.

> `Si Math connects concepts, skills, and representations in one intelligent
> graph. It does not just tell students where they are weak, but why, and how to
> fix it in the most efficient path.`

These are **product claims, not evidence.** They are recorded as stated and
carry no verification.

---

## 10. Dependency types

The legend defines four relation kinds. They are kept distinct throughout; a
generic "depends on" would erase the graph's entire content.

| type | legend wording | glyph | directed | encoded |
|---|---|---|:--:|--:|
| `prerequisite` | `Prerequisite (Must know before)` | solid arrow | yes | 35 |
| `supporting` | `Supporting / Related` | dashed arrow | yes | 12 |
| `unlocks` | `Enables / Unlocks` | dotted arrow | yes | 5 |
| `strong` | `Strong Relationship (Both ways)` | double arrow | **no** | 1 |

- `EK-EDGE-01` — Four distinct relation kinds exist and are visually distinguished. — **SOURCE-STATED**
- `EK-EDGE-02` — `prerequisite` and `unlocks` are **converse but not redundant**: panel 8 lists both for `Quadratic Equations`, and its unlock set (`Parabola`, `Advanced Algebra`) is not the inverse of anyone's prerequisite set. — **SOURCE-STATED**
- `EK-EDGE-03` — Whether `supporting` implies any ordering, or is purely associative. — **UNKNOWN**
- `EK-EDGE-04` — Whether an edge carries a weight. Panel 6's percentages attach to prerequisite pairs, so arguably yes — but they are learned (`EK-KDG-04`), not authored. — **UNKNOWN**

---

## 11. Topic ↔ knowledge-node mapping

**Every row of this mapping is INFERRED.** The two documents never reference each
other: `S-EXAM` names topics, `S-KDG` names nodes, and nothing states which is
which. What follows is this ingestion's alignment, offered so future material can
attach — not either document's claim.

The mapping is many-to-many by necessity, and it runs in **both** directions.

### 11.1 Exam topics that span several nodes — the exam is coarser

Seven of 25: `Probability` · `Ratios, Rates, Percent` · `Linear Functions` ·
`Polynomials` · `Exponential Functions` · `Triangles` · `Circle`

`Triangles` is the widest: one exam topic (`Triangle properties, similarity,
congruence, trigonometric ratios`) covering `Triangles`, `Similarity` and
`Trigonometry` — three nodes the graph separates by two prerequisite steps.

### 11.2 Nodes carrying several exam topics — the exam is finer

Seven nodes:

| node | exam topics landing on it |
|---|---|
| `Data Representation` | Data Analysis (Basics), Graphs (Data), Tables (Data) |
| `Measures of Central Tendency` | **Mean, Median, Mode** |
| `Units & Rates` | Ratios Rates Percent, Units and Rates |
| `Functions` | Linear Functions, Exponential Functions |
| `Coordinate Geometry` | Linear Functions, Circle |
| `Exponential & Logarithmic Functions` | Exponential Functions, Asymptote |
| `Trigonometry` | Triangles, Trigonometry |

**The `Measures of Central Tendency` row is the collision the brief warned
about.** `S-EXAM` insists Mean, Median and Mode are three dedicated topics;
`S-KDG` gives them one node. Both are this project's own documents. Neither is
wrong; they are modelling different things — an exam blueprint and a
prerequisite graph — and §17.4 records it rather than resolving it.

### 11.3 Nodes no exam topic reaches — 11 of 35

`Order of Operations` · `Exponents` · `Rational Expressions` ·
`Radicals & Rational Exponents` · `Advanced Topics` · `Solid Geometry` ·
`Advanced Geometry` · `Distributions` · `Statistical Inference` ·
`Logic & Reasoning` · `Time & Work`

- `EK-MAP-01` — 24 of 35 nodes are reached by at least one exam topic; **11 are not.** — **INFERRED** (computed from the mapping)
- `EK-MAP-02` — Two of the eleven, `Order of Operations` and `Exponents`, are the graph's most foundational algebra nodes. They are never an exam topic **because they are prerequisites** — which is precisely what a dependency graph is for. Their absence from the blueprint is a feature, not a gap. — **INFERRED**
- `EK-MAP-03` — Two others, `Logic & Reasoning` and `Time & Work`, are cross-topic skills, which by `S-KDG`'s own statement are not tied to any lesson (§14). Their absence is also expected. — **INFERRED**
- `EK-MAP-04` — The remaining seven (`Rational Expressions`, `Radicals`, `Advanced Topics`, `Solid Geometry`, `Advanced Geometry`, `Distributions`, `Statistical Inference`) are **genuinely out of blueprint scope**: neither exam tests them. — **INFERRED**

`EK-MAP-04` matters for scope. Seven nodes of a 35-node graph model content
neither exam covers.

---

## 12. Topic coverage matrix

Columns as the brief specifies. `Prerequisites` gives the immediate prerequisite
nodes of the mapped nodes. `Representations` is `all five` for every row —
`S-KDG` panel 7 asserts it universally (§15), so the column carries no
discriminating information and is stated once here rather than repeated.
`Cross-Topic Skills` names those the graph connects to that topic's nodes;
`Word Problems` reaches everything by `S-KDG`'s own statement.

### 12.1 Digital SAT Math — 44 questions / 70 minutes / 22 + 22

| Topic | Q # | Knowledge nodes | Immediate prerequisites | Cross-topic |
|---|---|---|---|---|
| Data Analysis (Basics) | 1–2 | Data Representation | — (foundational) | Word Problems |
| Graphs (Data) | 3–4 | Data Representation | — | Word Problems |
| Tables (Data) | 5–6 | Data Representation | — | Word Problems |
| Mean | 7 | Measures of Central Tendency | Data Representation | Word Problems |
| Median | 8 | Measures of Central Tendency | Data Representation | Word Problems |
| Mode | 9 | Measures of Central Tendency | Data Representation | Word Problems |
| Interquartile Range | 10 | Data Spread | Measures of Central Tendency | Word Problems |
| Probability | 11–12 | Probability Basics, Probability | Data Spread, Percentage | Word Problems |
| Ratios, Rates, Percent | 13–14 | Percentage, Units & Rates | Probability Basics | Units & Rates, Time & Work |
| Units and Rates | 15–16 | Units & Rates | — (cross-topic) | Units & Rates, Time & Work |
| Linear Equations | 17–18 | Linear Equations | Polynomials | Word Problems |
| Linear Inequalities | 19–20 | Inequalities | — (supporting from Systems) | Word Problems |
| Linear Functions | 21–22 | Functions, Coordinate Geometry | Linear Equations; Circles | Word Problems |
| Systems of Equations | 23–24 | Systems of Equations | Linear Equations | Word Problems |
| Polynomials | 25–26 | Polynomials, Factors & Multiples | Exponents, Order of Operations, Factors & Multiples | Word Problems |
| Quadratic Equations | 27–28 | Quadratic Equations | Systems of Eq., Polynomials, Linear Eq., Order of Ops, Exponents, Absolute Value | Word Problems, Logic & Reasoning |
| Exponential Functions | 29–30 | Exponential & Log Functions, Functions | Radicals & Rational Exponents | Word Problems |
| Absolute Value | 31–32 | Absolute Value | — | Word Problems |
| Geometry (Lines & Angles) | 33–34 | Lines & Angles | — (foundational) | Word Problems |
| Triangles | 35–36 | Triangles, Similarity, Trigonometry | Polygons; Triangles; Similarity | Word Problems |
| Polygons | 37–40 | Polygons | Lines & Angles | Word Problems |
| Circle | 41–44 | Circles, Coordinate Geometry | Trigonometry; Circles | Word Problems |

### 12.2 ST1 Math (EST I) — 50 questions / 75 minutes / single section

Rows 1–22 exactly as §12.1 (`EK-REL-01`), then:

| Topic | Q # | Knowledge nodes | Immediate prerequisites | Cross-topic |
|---|---|---|---|---|
| Trigonometry | 45–47 | Trigonometry | Similarity | Word Problems |
| Asymptote | 48 | Exponential & Logarithmic Functions | Radicals & Rational Exponents | Word Problems |
| Word Problems / Mixed | 49–50 | Word Problems | — (cross-topic hub) | all four |

- `EK-COV-01` — ST1's three extra topics add **one** node the Digital SAT blueprint does not already reach (`Word Problems`, as a topic in its own right); `Trigonometry` and `Exponential & Logarithmic Functions` are already reached via `Triangles` and `Exponential Functions`. — **INFERRED**

`EK-COV-01` is a useful result: ST1's extra six questions are **mostly more of
the same knowledge**, re-tested at greater length, plus one topic
(`Word Problems / Mixed`) that the Digital SAT table never names as a topic even
though the graph says it reaches everything.

---

## 13. Dependency-depth analysis

Computed from the 35 encoded prerequisite edges. **This is a knowledge dependency
model, not a psychometric one** — nothing here is a difficulty score.

`depth` is the longest prerequisite chain ending at a node. `downstream` counts
nodes for which it is an immediate prerequisite. `unlocks` counts explicit
`Enables / Unlocks` edges. `cross` counts distinct other clusters it touches.

### 13.1 Classification

| class | n | members |
|---|--:|---|
| foundational | 5 | Order of Operations, Inequalities, Absolute Value, Lines & Angles, Data Representation |
| intermediate | 11 | Exponents, Factors & Multiples, Systems of Equations, Polygons, Triangles, Similarity*, Trigonometry, Circles, Measures of Central Tendency, Data Spread, Percentage, Probability |
| high-dependency | 7 | Quadratic Equations, Rational Expressions, Radicals & Rational Exponents, Exponential & Log Functions, Coordinate Geometry, Solid Geometry, Distributions |
| terminal / specialized | 4 | Advanced Topics, Advanced Geometry, Statistical Inference, Functions |
| cross-topic hub | 8 | Word Problems, Units & Rates, Logic & Reasoning, Time & Work, Linear Equations, Polynomials, Similarity, Probability Basics |

\* `Similarity` and `Probability Basics` appear as hubs by cross-cluster degree.

### 13.2 The deepest chains

| node | depth | prerequisites |
|---|--:|--:|
| Advanced Topics | 10 | 1 |
| Exponential & Logarithmic Functions | 9 | 1 |
| Radicals & Rational Exponents | 8 | 1 |
| Advanced Geometry | 8 | 1 |
| Rational Expressions | 7 | 1 |
| Solid Geometry | 7 | 1 |
| Statistical Inference | 7 | 1 |
| Quadratic Equations | 6 | **6** |

- `EK-DEP-01` — Maximum prerequisite depth is **10**, at `Advanced Topics`. — **INFERRED** (computed)
- `EK-DEP-02` — `Quadratic Equations` is the only node with more than three direct prerequisites — it has **six** — because panel 8 states its prerequisite set explicitly while every other node's is drawn as a single spine arrow. — **INFERRED**
- `EK-DEP-03` — The depth figures are a property of **how the graphic draws its clusters**: three long single-file spines. A spine is a layout convention as much as a claim, and one node with a stated prerequisite set already has six. **Depth here should be treated as provisional** and is likely to fall sharply once other nodes get their real prerequisite sets. — **INFERRED**

`EK-DEP-03` is the caveat that keeps this section honest. The apparent depth of
10 is an artefact of drawing algebra as one column; it is not a measured property
of mathematics.

- `EK-DEP-04` — Four cross-topic skills have **no edges at all** in the encoded graph except `Word Problems`, which has four. `Units & Rates`, `Logic & Reasoning` and `Time & Work` are drawn inside the cross-topic panel with no connectors. — **SOURCE-STATED** (the drawing), and see §14

---

## 14. Cross-topic skill model

`S-KDG` panel 4 carries four skills around a dashed hub reading
**`Can be related to ALL topics`**, with the note:

> `These skills are not tied to one lesson. They are cross-topic and essential
> for all problem types.`

| id | skill | sub |
|---|---|---|
| `N-WORD` | Word Problems | Translation & Modeling |
| `N-UNITS` | Units & Rates | Conversions, Rate Problems |
| `N-LOGIC` | Logic & Reasoning | Patterns, Sequences, Logical Thinking |
| `N-TIMEWORK` | Time & Work | Work, Speed, Time Problems |

- `EK-XT-01` — Four cross-topic skills exist and are explicitly **not tied to one lesson**. — **SOURCE-STATED**
- `EK-XT-02` — They relate to **all** topics. — **SOURCE-STATED**
- `EK-XT-03` — This is preserved structurally: cross-topic skills are held in their own register with a universal-reach flag, and are **never** given a parent topic in the taxonomy of §16.1. Forcing them into the `Exam → Section → Topic → Node` hierarchy would contradict the source. — **INFERRED** (a design decision of this ingestion, stated as such)

### 14.1 The tension with `S-EXAM`

Two of the four are also **exam topics**: `Units and Rates` is Digital SAT topic
10 and ST1 topic 10; `Word Problems / Mixed` is ST1 topic 25.

- `EK-XT-04` — A cross-topic skill can also be a numbered exam topic with its own question range. Being cross-topic does not prevent being examined directly. — **SOURCE-STATED** (by both documents together)

This is the sharpest reason to keep the two layers separate. `Units & Rates` is
simultaneously a skill that reaches everything and a topic occupying questions
15–16. Collapsing skills into topics would lose the first; ignoring the exam
table would lose the second.

---

## 15. Representation model

Panel 7 — `ALL TOPICS CAN APPEAR IN ALL REPRESENTATION TYPES`, subtitled
`Every math concept can be represented in multiple forms.`

| id | representation | form | example |
|---|---|---|---|
| `R-WORD` | Word Problem | Real Life | — |
| `R-TABLE` | Table | Data Form | — |
| `R-GRAPH` | Graph | Visual Form | — |
| `R-NEQ` | Normal Equation | Symbolic Form | `ax + by = c` |
| `R-SEQ` | Small Equation | Simple Form | `x + 3 = 7` |

Six topic families are listed — Algebra, Geometry, Trigonometry,
Data / Statistics, Probability, All Other Math Topics — and **every one carries a
tick in every column**: 30 of 30.

> `The same concept may look different, but the underlying math is the same.
> Si Math connects all representations to the same knowledge.`

- `EK-REP-01` — Five representation forms are named, with two given symbolic examples. — **SOURCE-STATED**
- `EK-REP-02` — Every topic family can appear in every representation. — **SOURCE-STATED**
- `EK-REP-03` — Because the matrix is universally true, it **carries no discriminating information**: it cannot say which representation a given topic *tends* to use, only that all are possible. A representation model useful for generation would need observed frequencies, which no source supplies. — **INFERRED**
- `EK-REP-04` — `Normal Equation` versus `Small Equation` is distinguished only by the two examples (`ax + by = c` against `x + 3 = 7`). No criterion separates them. — **UNKNOWN**

`EK-REP-03` is the honest reading. Panel 7 establishes a *vocabulary* of five
representations — genuinely useful, and it aligns with the repository's existing
stimulus model — but its matrix is a statement of possibility, not distribution.

---

## 16. Canonical taxonomy

### 16.1 The hierarchy, and where it deliberately breaks

```
Exam                    DSAT | ST1
 └─ Section / Module    M1, M2 (DSAT only; ST1 has none)
     └─ Topic           the 25 names of §4.1, with question ranges
         └─ Knowledge Node   N-* (many-to-many with Topic — §11)
             ├─ Prerequisites    prerequisite edges
             ├─ Related Nodes    supporting + strong edges
             └─ Unlocks          unlocks edges

Cross-Topic Skills      N-WORD, N-UNITS, N-LOGIC, N-TIMEWORK
                        attach to ALL topics — NOT under any one (EK-XT-03)

Representations         R-WORD, R-TABLE, R-GRAPH, R-NEQ, R-SEQ
                        orthogonal to everything above (EK-REP-02)
```

Three places the hierarchy is not a tree, kept as explicit cross-links:

1. **Topic ↔ Node is many-to-many in both directions** (§11.1, §11.2). A node is
   not a subtopic of a topic.
2. **Cross-topic skills have no parent** (§14). Two of them are *also* topics,
   which a tree cannot express.
3. **Representations are orthogonal.** Any node in any representation.

### 16.2 Identifier scheme

| prefix | space | count |
|---|---|--:|
| `DSAT` / `ST1` | exams | 2 |
| `M1` / `M2` | Digital SAT modules | 2 |
| `N-*` | knowledge nodes | 35 |
| `R-*` | representations | 5 |
| `EP-*` | exam profiles (artifact 01N) | 4 |
| `T-*` | notebook topic labels (artifact 01N §13.1) | 31 |
| `EK-*` | claims in this artifact | 60 |

`T-*` and `N-*` are **deliberately not merged.** `T-*` records what one notebook
called things; `N-*` records what the KDG calls things. A later document may
align them; this one does not, because nothing in either source does.

---

## 17. Conflicts and ambiguities

Both statements are recorded in every case. None is resolved.

### 17.1 The Digital SAT module boundary

- **A** — `2 Modules (22 + 22)`, and the module table's `22 / 22`, and the key note `22 in Module 1, 22 in Module 2`. Three statements, agreeing.
- **B** — In the topic table, the `Module 1` label and the dashed rule fall after row 11 (`Linear Equations`, Q 17–18), which would make Module 1 **18** questions and Module 2 **26**.

Arithmetic favours **A**: 22 questions ends after row 13 (`Linear Functions`,
Q 21–22), so the boundary should sit between rows 13 and 14. Statement A is also
independently corroborated by artifact 01N's notebook.

**Recorded as a drawing error in B, not resolved by deletion.** My reading of the
rule's position is graded **medium** confidence — it is a thin dashed line on an
infographic. `EK-DSAT-01` stands on A.

### 17.2 The percent-contribution example, printed twice and disagreeing

The same example — target lesson `Quadratic Equations` — appears in panel 6 as a
bar chart and in panel 8 as a metadata column.

| prerequisite | panel 6 | panel 8 |
|---|--:|--:|
| Polynomials | 24% | 24% |
| Linear Equations | 20% | 20% |
| Factoring | 16% | 16% |
| Order of Operations | 12% | 12% |
| Exponents | 8% | 8% |
| Fractions & Decimals | 6% | 6% |
| Inequalities | 4% | — |
| Absolute Value | 3% | — |
| Other / Minor Skills | 1% | — |
| Others | — | 14% |
| **sum** | **94%** | **100%** |

Panel 6 prints `Total 100%` beneath a column that sums to 94. Panel 8's tail is
`Others 14%` where panel 6's tail is `4 + 3 + 1 = 8`.

Either a bar label was misread here, or the two panels genuinely disagree. My
reading is graded **medium** — these are small numbers on an infographic.
**Recorded, not corrected.** By `EK-KDG-04` these weights are learned from student
data anyway, so nothing should be built on either column.

### 17.3 Two exams, one topic table

`S-EXAM` gives the Digital SAT and ST1 identical topics and identical question
ranges for all 44 shared questions, differing only in three trailing words
(§`EK-REL-02`). For two separately administered exams this is implausible as a
factual claim and likely a template artefact (`EK-REL-03`). The key note
`Exact order can vary slightly between forms` sits in tension with printing the
order as exact.

### 17.4 Three incompatible granularities for central tendency

| source | model |
|---|---|
| `S-EXAM` | `Mean`, `Median`, `Mode` — **three dedicated topics**, one question each |
| `S-KDG` | `Measures of Central Tendency` — **one node** |
| live `taxonomy.core.js` | `Mean, Median & Mode` — **one subtopic** |

The same split recurs for spread (`Interquartile Range` / `Data Spread` /
`Range & Interval`) and for data display (`Graphs` + `Tables` /
`Data Representation` / `Data Analysis` + `Scatter Plots` + `Stem-and-Leaf Plots`),
and `Asymptote` is a dedicated topic in `S-EXAM` with no counterpart in either
of the others.

**All three are this project's own artefacts, and all three disagree.** They are
not wrong — an exam blueprint, a prerequisite graph and a diagnostic taxonomy
have different reasons to split or merge. But any future work that assumes one
mapping cleanly onto another will break.

**`taxonomy.core.js` is frozen in practice** (CLAUDE.md §2: `taxonomy.js` is
generated from it and CI fails on drift). Moving the live taxonomy toward either
new model is a deliberate unfreeze decision. **Nothing here proposes one.**

### 17.5 Question numbering across modules

- **A**, `S-EXAM`: the Digital SAT `Q #` column runs 1–44 continuously across both modules.
- **B**, artifact 01N: the notebook's item logs restart at 1 for module 2, twice, across two different sittings.

Both are recorded. They may both be true of different things — the instrument's
numbering versus a note-taker's convention — but neither document says so.

### 17.6 `S-KDG` panel numbering

Panels are numbered 1, 2, 3, 4, 5, 6, 7, 8, 9, **12**, 11, **12**. There is no
panel 10 and there are two panel 12s (`KEY BENEFITS` and `EXAMPLE FLOW`).

- `EK-CONF-01` — Whether a panel 10 exists and was omitted, or the numbering simply slipped. — **UNKNOWN**

### 17.7 Vocabulary the metadata template uses but the graph lacks

`Factoring`, `Fractions & Decimals`, `Parabola` and `Advanced Algebra` appear in
the `Quadratic Equations` metadata but are not nodes (`EK-KDG-08`). Either the
node list is incomplete or the metadata uses an informal vocabulary. **UNKNOWN.**

### 17.8 Cross-topic skills without edges

Three of four cross-topic skills — `Units & Rates`, `Logic & Reasoning`,
`Time & Work` — are drawn with **no connectors at all**, while the panel states
they relate to all topics. The claim is textual, the graph is empty
(`EK-DEP-04`). Whether that means "connects to everything, too many lines to
draw" or "not yet modelled" is **UNKNOWN**.

---

## 18. Evidence classification

| class | count | meaning |
|---|--:|---|
| **SOURCE-STATED** | 32 | printed on one of the two images |
| **INFERRED** | 13 | derived by this ingestion; neither document says it |
| **NOT SPECIFIED** | 6 | the brief asked; both documents are silent |
| **UNKNOWN** | 9 | gestured at without being determined |
| | **60** | claims |

These counts are derived from the register in `exam-structure-and-kdg.mjs` by
`scripts/validate-exam-kdg.mjs`, which fails if this table drifts from it. That
check earned itself immediately: this table first read **47**, a number typed
from the prose rather than counted. The register holds 60.

**SOURCE-STATED (32)** — `EK-DSAT-01`, `EK-DSAT-02`, `EK-DSAT-03`, `EK-ST1-01`,
`EK-ST1-02`, `EK-REL-01`, `EK-REL-02`, `EK-TOPIC-01`, `EK-TOPIC-03`,
`EK-ORDER-01`, `EK-ORDER-02`, `EK-ORDER-03`, `EK-NUM-01`, `EK-NUM-02`,
`EK-NUM-03`, `EK-NUM-04`, `EK-DIST-01`, `EK-DIST-02`, `EK-DIST-03`,
`EK-KDG-01`, `EK-KDG-04`, `EK-KDG-05`, `EK-KDG-07`, `EK-KDG-08`, `EK-EDGE-01`,
`EK-EDGE-02`, `EK-DEP-04`, `EK-XT-01`, `EK-XT-02`, `EK-XT-04`, `EK-REP-01`,
`EK-REP-02`

**INFERRED (13)** — `EK-ST1-03`, `EK-REL-03`, `EK-STRAT-03`, `EK-MAP-01`,
`EK-MAP-02`, `EK-MAP-03`, `EK-MAP-04`, `EK-COV-01`, `EK-DEP-01`, `EK-DEP-02`,
`EK-DEP-03`, `EK-XT-03`, `EK-REP-03`

**NOT SPECIFIED (6)** — `EK-DSAT-04`, `EK-ST1-04`, `EK-TOPIC-02`, `EK-DIST-04`,
`EK-STRAT-01`, `EK-KDG-06`

**UNKNOWN (9)** — `EK-ORDER-04`, `EK-STRAT-02`, `EK-KDG-02`, `EK-KDG-03`,
`EK-KDG-09`, `EK-EDGE-03`, `EK-EDGE-04`, `EK-REP-04`, `EK-CONF-01`

### 18.1 Reading the distribution

**Roughly half the register is not a fact about the exams.** 28 of 60 claims are
inferred, unspecified or unknown — and that is with two documents whose whole
purpose is to state the model. The gap is concentrated in three places: the KDG's
edge semantics (§10), its unreadable regions (§9.4), and everything about
distribution beyond the one printed allocation (§7).

**The inferred claims cluster in the mapping.** Nine of the 13 come from §11–13,
the topic↔node mapping and the depth analysis — work this ingestion did because
neither document does it. Those nine are the most useful claims here and the
least evidenced, and both facts should travel together.

## 19. Future-resource integration schema

The next sources will carry real exam questions organised by topic. The chain
they should attach to:

```
Real Question
 ├─ exam            DSAT | ST1
 ├─ module          M1 | M2 | null (ST1)
 ├─ questionNumber  1..44 | 1..50
 ├─ topic           one of the 25 names of §4.1
 ├─ nodes           N-* (many, via §11 — NOT one-to-one with topic)
 ├─ prerequisites   derived from the node's prerequisite edges
 ├─ reasoningSkills cross-topic skills exercised (N-WORD, N-UNITS, N-LOGIC, N-TIMEWORK)
 ├─ representation  R-WORD | R-TABLE | R-GRAPH | R-NEQ | R-SEQ
 ├─ archetype       ← NOT YET DEFINABLE
 └─ difficultyEvidence ← NOT YET DEFINABLE
```

Two fields are deliberately empty:

- **`archetype`** — **no archetype may be created from these two sources.**
  Neither contains a single worked question. The repository's existing archetype
  library was derived from 200 coded reference items, and that is the standard
  any new archetype must meet.
- **`difficultyEvidence`** — `S-KDG` gives `Quadratic Equations` a difficulty of
  `3 / 5` and exam weights of `High` for one node of 35, with no scale defined.
  That is an illustration, not a difficulty model. The repository's difficulty
  calibration is untouched.

Three rules for whatever attaches next:

1. **A question attaches to a topic AND to nodes, separately.** They are not the
   same thing (§11), and a question that reduces to one topic may exercise three
   nodes.
2. **Cross-topic skills attach in their own field**, never as the topic. A word
   problem about circles is topic `Circle`, skill `Word Problems`.
3. **Representation is orthogonal.** Recording it as a topic variant would
   contradict `EK-REP-02`.

### 19.1 What is still missing to make this usable

- **Observed representation frequencies.** §15 says all combinations are
  possible; generation needs to know which are common.
- **Real prerequisite sets per node.** 34 of 35 nodes have a single spine
  arrow; the one node with a stated set has six prerequisites (`EK-DEP-03`).
- **Percent contributions from data.** By the graph's own Rule 4 these must be
  learned, and no student data exists yet.
- **A decision on granularity.** Three incompatible models are live (§17.4).
- **Anything at all about the EST beyond structure.** `EK-ST1-01` is the whole
  of it.

---

*Ingested 2026-09-05 from two inline images, neither hashable. 60 claims
registered. No generator, blueprint, difficulty-model, allocation or EST artifact
was modified.*
