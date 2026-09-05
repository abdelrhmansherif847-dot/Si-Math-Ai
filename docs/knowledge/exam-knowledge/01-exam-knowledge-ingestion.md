# 01 — Exam Knowledge Ingestion

**Phase:** knowledge ingestion only. No generator change, no blueprint change, no
question or exam generation, no difficulty-model change. Nothing in this file is
an instruction to the generator; it is a record of what one source document says.

**Status:** complete for the source named below. Every one of its 24 pages was
read and is accounted for in §1.3.

---

## 0. The finding that governs everything below

**The source is a handwritten personal notebook, photographed with CamScanner.**
It is not a published specification, not a publisher document, and not a
psychometric blueprint. It carries no author attribution, no date, no title page,
no page numbers of its own, and no statement of authority.

This matters for how every later artifact must treat it. A specification states
rules; a notebook records one practitioner's observations and opinions. The
ingestion brief asked for rules classified HARD RULE / RANGE / PATTERN /
PREFERENCE / EXAMPLE / UNKNOWN. Applied honestly to this document, **almost
nothing lands in HARD RULE**, because the document never asserts that anything
must be so. It reports what its author has seen and believes.

That is not a defect in the document — a working notebook is exactly the right
place for observations. It is a defect only if the observations are promoted to
rules they were never claimed to be. §11 keeps that line explicit.

A second consequence: **the document is mostly not about exam structure at all.**
Of 24 pages, 7 carry item-level exam data, 3 carry the test-type taxonomy, 2
carry topic lists, and **11 are teaching notes** — student misconceptions,
score-band advice, study-method arguments, and one line of social-media content
planning. §1.3 gives the page-by-page split.

---

## 1. Source inventory

### 1.1 The artefact

| | |
|---|---|
| File as received | `Exams_Knowledge_compressed.pdf` |
| Size | 5,871,907 bytes |
| md5 | `5a12df07daf5962b3212df60d88545da` |
| sha256 | `b56e34e6140df8986a2022b3f7b6880fc3f93e476637e432ecf3b3af17983c27` |
| Received | 2026-09-05, session upload |
| PDF version | 1.7, single revision (one xref, one trailer, one `%%EOF`), not linearized |
| **Pages** | **24** |
| Text layer | **None.** 24 of 24 pages are image-only; extracted text length is 0 characters |
| Page images | One full-page JPEG per page, extracted losslessly from the PDF |
| Scanner | CamScanner (watermark present on every page) |

**Page count discrepancy, resolved.** The harness announced this file as 58
pages. The PDF's own page tree says otherwise: `/Type/Pages` carries
`/Count 24` with 24 `/Kids`, and a raw scan of the file finds 25 `/Type/Page`
occurrences (24 leaves + the root node, which matches exactly). The file has a
single revision, so there is no earlier generation holding other pages. **The
document is 24 pages.** The 58 figure is wrong and was not used.

### 1.2 Reading method, and its limits

No text layer means every word here was read from an image of handwriting. That
places a real and unavoidable error bar on this ingestion, and it is recorded
rather than hidden:

- Pages were read at full size; 12 regions were re-cropped and enlarged 1.8–2.6×
  where a reading was load-bearing (module boundaries, the four-type table, the
  difficulty braces).
- Page 19 is written sideways. It was rotated 90° and re-read.
- The paper is thin and every page carries **show-through** from its reverse.
  Faint mirrored text in the margins of pp. 1–9 is show-through, not content, and
  was excluded.
- The hand is fast and irregular; several letters are systematically ambiguous
  (`eq`/`ea`, `Nor`/`Nr`/`N`, `silly`/`selly`). The author's own spelling is
  inconsistent and non-standard throughout. **Verbatim spelling is preserved
  everywhere in this file, including errors** — normalising it would destroy the
  ability to check this transcription against the page.
- Every transcribed item carries a confidence grade. Of 87 item rows: **59 high,
  21 medium, 7 low.**

Anything graded low should be treated as a lead, not a fact.

### 1.3 Page-by-page inventory — all 24 pages accounted for

| Page | Content class | What is on it |
|---|---|---|
| 1 | Topic list + difficulty banding | `EST → Focus`: two columns of topic names; sweeping braces labelled `HarD ParT` and `Mid` |
| 2 | Topic list + banding + SAT structure | `Easy` band (3 topics); the SAT structure box (`22`, `22`, `Mod 1,2`, `Adaptive`); `The Hardest in? / Famous` topic list |
| 3 | Item-topic log | `Sat (12) D.S` — Module 1, items 1–15 |
| 4 | Item-topic log | Module 1 items 16–22; `Mod 2 (H)` begins, items 1–8 |
| 5 | Item-topic log | Module 2, items 10–21 |
| 6 | Item-topic log | Module 2 item 22; `Nov SAT → D.S.` begins, `Mod ①` items 1–9 |
| 7 | Item-topic log | `Mod ①` items 10–22 |
| 8 | Item-topic log | `Mod ② Hard`, items 1–12 |
| 9 | Item-topic log | `Mod ②` items 13–22 |
| 10 | Topic-mixing map | `EST for SAT most tricky Questions`: `mixing of Hard topics`, arrow diagram, `also Question can be 2-3 topics this is famous in D.SAT` |
| 11 | Teaching notes | `IMP — Student main/famous problems`, list begins. Also a box: `30 Instagram + tiktok Reels` |
| 12 | Teaching notes | student misconceptions (score-chasing, repetition without error review) |
| 13 | Teaching notes | same-topic re-failure; `Fraid from tables / word problem / graph / probability` |
| 14 | Teaching notes | timing, calculator use, "not born knowing math"; one Arabic line |
| 15 | Teaching notes | resource breadth, post-exam error review |
| 16 | Teaching notes | ignoring lucky-correct answers; `selly mistake is the biggest enemy`; `pure 800 → 58 Q true` |
| 17 | Score-band progression | `400→500`, `500→600`, `600→700`, `700→750`, `750→800` braced to `IS NOT THE SAME WORK` |
| 18 | Teaching notes | retake expectations; Arabic-background belief rejected as `wrong` |
| 19 | Topic-depth principle *(written sideways)* | `the work for each topic is not the same` |
| 20 | Teaching notes + procedure | `there is no Hard Question`; a numbered 5-step solving procedure |
| 21 | Teaching notes | lesson ≠ mastery; `min 80%`; eliminating `2-choices` |
| 22 | **Exam-profile taxonomy** | `Tests Types` — the four profiles ①–④, then detail on ① |
| 23 | **Exam-profile detail** | profile ② and profile ③ |
| 24 | **Exam-profile detail** | profile ④ `(Real Simulation) Perfect test`; the four-column `5 / 5 / 5 / 5` table |

Content class totals: item-topic logs **7** (pp. 3–9), test-type taxonomy **3**
(pp. 22–24), topic lists/maps **3** (pp. 1, 2, 10), teaching notes **11**
(pp. 11–21).

### 1.4 What is deliberately not in this repository

The per-item ordered topic sequences for the two named live administrations are
**not reproduced here**. They are a per-question map of specific administered
forms, and this repository is public. This follows the standing rule the
reference corpus already obeys: fingerprints and aggregate statistics in the
repo, the item-level corpus outside it.

What is in the repo: the structural shape, the aggregate statistics, the
taxonomy, and the rules. What is outside it, in the session corpus keyed to the
sha256 above: `ek/item-log.tsv`, 87 rows, each with a confidence grade.

Every aggregate in §4 was computed from that file, not asserted.

---

## 2. Exam structure

### 2.1 What the document states about the SAT

Page 2 carries a boxed diagram. Read verbatim: the word `SAT`, then a box
containing two struck-through numbers replaced by **`22`** and **`22`**, then a
second box reading **`Mod 1 , 2`** and **`Adaptive`**.

- `SK-STRUCT-01` — SAT is delivered in **two modules**, `Mod 1` and `Mod 2`. — **SOURCE-STATED**
- `SK-STRUCT-02` — Each module carries **22** questions. — **SOURCE-STATED**
- `SK-STRUCT-03` — The delivery is **`Adaptive`**. The document uses the word and does not define it. — **SOURCE-STATED** (term), **UNKNOWN** (mechanism)

**Independent corroboration inside the document.** The four module logs on
pp. 3–9 run 1–22, 1–22, 1–22, 1–22. The 22-per-module figure is therefore
stated on p. 2 *and* borne out by four separate item lists elsewhere in the same
notebook. This is the single strongest structural claim in the document.

### 2.2 Module labelling

Both logged forms mark their second module as harder: `Mod 2 (H)` (p. 4) and
`Mod ② Hard` (p. 8). The first module is never given a difficulty label.

- `SK-STRUCT-04` — The second module is labelled hard; the first is not labelled. — **SOURCE-STATED**
- `SK-STRUCT-05` — Whether `(H)` denotes the adaptive *hard branch* of module 2, or merely that this sitting's module 2 felt hard, is **not stated**. — **UNKNOWN**

`SK-STRUCT-05` is not a quibble. Under adaptive delivery those are different
claims: one is a property of the instrument, the other of one test-taker's path
through it. The document does not distinguish them, so neither can this record.

### 2.3 Timing

**Nothing.** The document states no section duration, no per-question time
allowance, no total test length in minutes, and no break structure.

Time appears only as *pressure* — `Time is runing`, `Tests take more the normal
time`, `waste time`, `focus on time while solving`. Those are experiential
descriptions in the test-type taxonomy (§7), not timing data.

- `SK-TIME-01` — Exam timing. — **NOT SPECIFIED**

### 2.4 EST structure

**Nothing.** Despite `EST` appearing in the document's two topic lists (pp. 1,
10) and in the header of p. 11, **the document states no EST structure at all** —
no section count, no question count, no module model, no timing.

Every structural statement in the document is about the SAT.

- `SK-STRUCT-06` — EST exam structure. — **NOT SPECIFIED**

This is the largest single gap relative to what the ingestion brief anticipated,
and §14 returns to it.

---

## 3. Topic taxonomy

The document uses topic names in four places, with no single master list and no
hierarchy. What follows preserves its spelling exactly; a normalised
identifier is attached in §13 so later documents can attach to it.

### 3.1 Page 1 — `EST → Focus`

Left column, in document order:
`Data analysis` · `word problem` · `Probability` · `Percent` · `per and comp`
· `Logic` · `exponent` · `system of eq.` · `inqu` · `Absolute value`
· `Qaudratic / Prapola` · `Trindles` [triangles] · `Geometry` · `exponential`
· `Function`

Right column, in document order:
`exp + comp. in` · `Ratio / prop` · `solid geo` · `similarity` · `time/work/s.`
· `graphes` · `tables` · `scatter plot` · `Linear Function` · `circle`
· `trigonometry`

Bottom line, spanning: `Geometry word problem → Length / area / perimeter`

### 3.2 Page 2 — `The Hardest in? / Famous`

`Data analysis` · `word problem → story` · `Qaudratic equation / Prabola`
· `works / time / speed / distance` · `graphs / tables` · `Solid Geometry [Not sure]`
· `probability` · `Comp / Per [Not sure]` · `circle` · `exponent + comp. int`
· `Geometry word problem → Length / area / perimeter` · `Scatter Plot`
· `percent word problem`

Two entries are explicitly marked `Not sure` **by the author**. Those two are
recorded as the author's own uncertainty, not this ingestion's.

### 3.3 Page 10 — the mixing map

Page 10 is headed `EST for SAT most tricky Questions` and `* mixing of Hard
topics`. It is an arrow diagram, not a list. Two hubs:

**Hub `word problem`** radiates to: `Data analysis` (annotated `margin of error`)
· `Geometry` · `Qaudratic` · `Logic` · `Rates` · `Ratio / proportional`
· `work / time` · `Percent` · `Ratio Proportional` · `Exponential` · `Circle or eq.5`
· `Probability`

**Hub `GRAPHS / TABLES`** radiates to: `word problem` · `Scatter Plot`
· `Exponential / Linear / Function / inquality` · `Data Analysis`
· `margin of ERRORS` · `Percent` · `Rates` · `Ratio / Proportional` · `Probability`

Side box: `also Question can be 2-3 TOPICS / this is famous in D.SAT /
From this paper`

- `SK-TOPIC-01` — Two topics act as **carriers** that other topics are delivered through: `word problem` and `GRAPHS / TABLES`. — **SOURCE-STATED** (as structure of the diagram)
- `SK-TOPIC-02` — A single question may span **2–3 topics**, and this is characteristic of the digital SAT. — **SOURCE-STATED**

`SK-TOPIC-01` is the most structurally useful idea in the document. It is not a
flat topic list — it separates *what is being tested* from *the vehicle it
arrives in*. That distinction is already load-bearing in this project's existing
work, and the document arrives at it independently.

### 3.4 Hierarchy

The document has **no topic hierarchy**. No topic is stated to contain another.
The columns on p. 1 are not labelled and carry no stated meaning. Groupings
exist only as the difficulty braces of §9.

- `SK-TOPIC-03` — Topic hierarchy, parent/child relations, subtopics. — **NOT SPECIFIED**

Some names are plainly narrower than others (`vertex quadratic eq` vs
`Qaudratic`), but the document never says so, and inferring a tree from that
would be exactly the silent gap-filling the brief forbids.

---

## 4. Topic distribution

### 4.1 What the document states

**No percentages. No counts. No ranges. No quotas.**

The document contains no statement of the form "topic X receives N questions" or
"topic X is Y% of the test". Pages 1 and 2 are unordered lists with no
frequencies attached.

- `SK-DIST-01` — Stated topic distribution. — **NOT SPECIFIED**

### 4.2 What can be counted from the item logs

Distribution can be *computed* from pp. 3–9. This is **INFERRED** — derived by
this ingestion from the source, not stated by it — and it passes through a
handwriting transcription, so it inherits the confidence grades of §1.2.

Corpus: 4 modules, 87 item rows, 85 with a topic written (2 left blank by the
author).

Most frequent terms across all 85 items:

| term | mentions | | term | mentions |
|---|---|---|---|---|
| word problem | 11 | | quadratic | 4 |
| function | 10 | | poly | 4 |
| table | 9 | | geometry | 4 |
| percent | 9 | | triangle | 3 |
| linear | 9 | | expression | 3 |
| system of eq | 7 | | circle | 3 |
| angle | 6 | | median | 3 |
| graph | 5 | | scatter plot | 2 |
| exponential | 5 | | transformation | 2 |

These are *term mentions*, not question counts — a composite item contributes to
several rows. They must not be read as a blueprint.

### 4.3 Composite items — the one measurable pattern

Counting items whose label joins two or more topics with `+`:

| module | composite | of | rate |
|---|---|---|---|
| Form 1, Module 1 | 2 | 22 | 9% |
| Form 1, Module 2 | 2 | 19 | 11% |
| Form 2, Module 1 | 4 | 22 | 18% |
| Form 2, Module 2 (`Hard`) | 8 | 22 | 36% |
| **all** | **16** | **85** | **19%** |

Aggregated by module position: **Module 1 = 6/44 (14%), Module 2 = 10/41 (24%)**.

This is consistent with the document's own claim `SK-TOPIC-02` — that
topic-mixing is characteristic, and (by the placement of `mixing of Hard topics`
on p. 10) associated with difficulty. But it must be stated with its limits:
**n = 85, two forms, one transcriber, and the trend rests substantially on a
single module.** It is a hypothesis worth testing against a real corpus, not a
measured rate.

- `SK-DIST-02` — Composite-topic items are more frequent in module 2 than module 1. — **INFERRED**, weak evidence, **PATTERN** at most

---

## 5. Ordering rules

**The document states no ordering rule.** It never says a topic tends to appear
early or late, never describes a progression, never uses the words easy-to-hard
in a positional sense, and gives no beginning/middle/end structure — **except
inside the test-type taxonomy**, where two types are *defined* by their ordering:

- Type ③ (p. 23): `Qeustions → first to is Hard` … `and after question get easy at last`
- Type ④ (p. 24): `Normal arrange`, with `Easy end fast`

- `SK-ORDER-01` — General question-ordering rule. — **NOT SPECIFIED**
- `SK-ORDER-02` — A test in which the **first questions are hard and later ones get easier** is one recognised profile (`EP-3`). — **SOURCE-STATED**, as a *profile definition*
- `SK-ORDER-03` — `Normal arrange` is a named property of `EP-4` and is left **undefined**. It is the document's implicit baseline ordering, never described. — **UNKNOWN**

`SK-ORDER-03` is a genuine hole. The taxonomy's anchor type is defined partly by
having "normal" ordering, and "normal" is never said.

The item logs of pp. 3–9 do record positions, so an ordering *could* be derived
from them — but from two forms, and by a transcription with 7 low-confidence
rows, any positional rule drawn from them would be noise. None is offered here.

---

## 6. Numbering rules

- `SK-NUM-01` — Questions are numbered **1..22 within each module**, restarting at 1 for module 2 rather than continuing to 44. — **SOURCE-STATED** (by the structure of all four logs)
- `SK-NUM-02` — Numbering is sequential integers with no gaps and no letter suffixes. — **SOURCE-STATED**
- `SK-NUM-03` — No relationship between question number and topic is stated. — **NOT SPECIFIED**

One artefact of the notebook, not of any exam: **item 9 of Form 1's module 2 is
absent** — p. 4 ends at 8, p. 5 opens at 10. The neighbouring numbers are clear.
This is the author skipping a line, not a numbering rule; it is why §4.2 counts
85 topics across 87 rows in 4×22 = 88 slots.

---

## 7. Exam profiles / test types

**Located: pages 22–24, headed `Tests Types`.**

### 7.0 Correction of 2026-09-05, from the source owner

This section originally read these entries as a **series design — five tests of
each of four types, twenty in all, difficulty ascending.** That reading is
**withdrawn.** It was an inference of this ingestion, not a statement of the
source, and the source owner has ruled it out.

The correction, recorded as given:

> The cases in the notebook are NOT five tests of each type. They represent
> different possible **EXAM PROFILES / TEST TYPES** that a student may
> encounter. The important dimension is the relationship between test length /
> step burden / time pressure, question difficulty, trap density, number
> ugliness / computational burden, and overall pressure — for example a longer
> test with easier questions, a shorter test with harder questions, and other
> combinations.

This is authoritative in a way the ingestion is not: it comes from the owner of
the source, about what the source means. It is recorded here as an attributed,
dated gloss rather than folded silently into the text, so that a later reader can
see which claims come from the page and which from this correction.

Three consequences carried through this file:

- The entries are **exam profiles**, identified `EP-1`..`EP-4`, not a schedule.
- **No 20-exam series rule exists here**, and none may be reconstructed from
  these numbers. `SK-SERIES-02` is retired to UNKNOWN and `SK-CR-11` with it.
- The organising idea is the **relationship between five dimensions**, not a
  ranking. §7.2 tabulates each profile on all five.

### 7.1 What a profile is, and what it is not

A profile describes **what kind of exam a student may receive**. Explicitly, and
because none of these is supported by the source, a profile is **not**:

| not a… | because |
|---|---|
| assembly blueprint | no profile is given a construction procedure |
| topic distribution | no profile is given any topic content at all (`SK-TYPE-03`) |
| fixed question order | only `EP-3` states an order; `EP-4` names `Normal arrange` and never defines it |
| separate exam form | no profile is tied to a form, a sitting, or a count |
| difficulty band | the bands are `DB-EASY`/`DB-MID`/`DB-HARD` over *topics* (§9.1) — a different axis |

### 7.2 The four profiles

The source numbers **four** profiles, ①–④ on p. 22, each with an empty box
beside it. Each is recorded below on the five dimensions of the correction, in
the notebook's own words. `—` means the source says nothing on that dimension
for that profile: those cells are **NOT SPECIFIED**, not defaults.

#### `EP-1` — `Tests take more the normal time`

| dimension | source wording | class |
|---|---|---|
| length / step burden | `Tests take more the normal time` · `Large steps more than normal` | SOURCE-STATED |
| difficulty | `Qeustion most Easy and medium` | SOURCE-STATED |
| trap density | — | NOT SPECIFIED |
| number / computation | `Numbers is complicated` | SOURCE-STATED |
| time pressure | `the easy question can take alot of time from you if you don't focus on time while solving` | SOURCE-STATED |
| stated relationship | `More risk than Hard Qeustion` · `need organize not smart` · failure is `waste alot of time in easy questions`, explicitly **not** `He is not understand` | SOURCE-STATED |

**The relationship is the point.** Easy-to-medium difficulty, long steps and ugly
numbers together produce *more* risk than hard questions do. Difficulty and cost
are separated, and the demand is organisation rather than cleverness.

#### `EP-2` — `Tests have a Easy, but tricky Qeustion` · `[selly mistakes is high]`

| dimension | source wording | class |
|---|---|---|
| length / step burden | — | NOT SPECIFIED |
| difficulty | `Easy` | SOURCE-STATED |
| trap density | `[selly mistakes is high]` · `because have a clear trap` · `small change in a word of question` | SOURCE-STATED |
| number / computation | — | NOT SPECIFIED |
| time pressure | self-inflicted: `Student solve fast and wrong` | SOURCE-STATED |
| stated relationship | `need to read well not calculate or solve fast`; being caught by it is `the strongest Lesson and better than any explain` | SOURCE-STATED |

**The trap sits in the wording, and the defence is reading, not computation.**
Trap density is this profile's defining dimension; difficulty is deliberately low.

#### `EP-3` — `Tests make the student so stressfull while solving` · `Like in the trail`

| dimension | source wording | class |
|---|---|---|
| length / step burden | — | NOT SPECIFIED |
| difficulty | `Qeustions → first to is Hard` … `and after question get easy at last` | SOURCE-STATED |
| trap density | — | NOT SPECIFIED |
| number / computation | — | NOT SPECIFIED |
| time pressure | `Like in the trail` — the pressure of the real sitting | SOURCE-STATED |
| stated relationship | front-loaded difficulty produces the stress; what it trains is recovery — `student Learn How to don't enhar at the first of test and How to kaml even if el start wa7sh` | SOURCE-STATED |

Arrangement is noted as `Like graphs / tables`. The Arabic-English clause reads:
*don't collapse at the start of the test, and continue even if the start was
bad.* This profile exists to train **recovery**, and the ordering is the
instrument for it.

#### `EP-4` — `Perfect Normal test` · `(Real Simulation) Perfect test`

| dimension | source wording | class |
|---|---|---|
| length / step burden | `Normal arrange` (never defined — `SK-ORDER-03`) | UNKNOWN |
| difficulty | `Hard → clear and not alot` · `medium → need foucs` · `Easy end fast` | SOURCE-STATED |
| trap density | `less in tricky` | SOURCE-STATED |
| number / computation | — | NOT SPECIFIED |
| time pressure | normal; `Easy end fast` | SOURCE-STATED |
| stated relationship | `student get out of it this is near to his score` · `real score predictor` | SOURCE-STATED |

Its diagnostic aim is stated separately: `Let student discover:` `where your time
waste` · `where and why you solve this wrong` · `when you need rule and when you
need to think well and when you need to skip`.

**Hard questions are bounded in quantity, not removed** (`clear and not alot`).
This is the only profile the source connects to a real score.

### 7.3 The dimension matrix

Every profile against every dimension, so the gaps are visible rather than
implied. `●` stated, `○` named but undefined, `—` not specified.

| dimension | `EP-1` | `EP-2` | `EP-3` | `EP-4` |
|---|:--:|:--:|:--:|:--:|
| length / step burden | ● | — | — | ○ |
| difficulty | ● | ● | ● | ● |
| trap density | — | ● | — | ● |
| number / computation | ● | — | — | — |
| time pressure | ● | ● | ● | ● |
| *stated relationship* | ● | ● | ● | ● |

The five dimensions are those of the correction, in its order. **Overall
pressure** is not given a row of its own: the source never states it as a
property, only as an *outcome* of the other four interacting — so it lives in
the relationship row, which is where the document actually puts it.

Two readings of this matrix:

- **Difficulty and time pressure are the only dimensions specified for all
  four profiles.** Every profile is placed on those two axes and on no other
  two.
- **Of the 20 dimension cells, 7 are empty**, and number/computational burden
  is specified for `EP-1` alone. The five-dimension frame is the organising
  idea; the source does not complete it.

`EP-4`'s length cell is `○` rather than `●` because `Normal arrange` is named
and never defined (`SK-ORDER-03`) — the taxonomy's anchor profile is partly
specified by a baseline the document never describes.

### 7.4 The page-24 columns

Below `EP-4`, four columns, each headed by a circled phrase and each carrying a
large **`5`**. A bracket spans them reading `Hard Level increase well`.

| # | circled label | descriptors |
|---|---|---|
| 1 | `Done ✓` (`clean firm reas` · `well(fast)`) | `waste time` · `easy tricky` · `not much stress` |
| 2 | `solve under small stress` | `stress` · `mor easy they` · `Time is runing` |
| 3 | `Broke test fair` | `stress strong` · `hard and time runing` · `arrange` |
| 4 | `I can Do it` (`avg`) | `Perfect exams` · `normal arrange` · `less in tricky` · `real score predictor` |

- `SK-SERIES-01` — the four columns correspond to the four profiles: column 4's descriptors reproduce `EP-4` almost word for word, and column 3's `stress strong` reproduces `EP-3`'s. Column 2's correspondence is the weakest. — **INFERRED**
- `SK-SERIES-02` — **the meaning of the four `5` entries is UNKNOWN.** They are unlabelled. This ingestion proposed "five tests per profile"; the source owner ruled that out on 2026-09-05 (§7.0), and it must not be reintroduced. No replacement reading is offered, because none is supported. — **UNKNOWN**
- `SK-SERIES-03` — `Hard Level increase well` spans the columns. — **SOURCE-STATED** (the phrase); what it orders is **INFERRED**
- `SK-SERIES-04` — the circled labels are the intended student reaction under each profile: `Done ✓` → `solve under small stress` → `Broke test fair` → `I can Do it`. — **INFERRED**

### 7.5 Four or five?

The correction asks for **five** profiles. **The source shows four**, and this
was checked rather than assumed:

- **p. 22**, re-read at 2.4×: the heading `Tests Types`, then exactly four
  bullets, each with an empty box and a circled numeral — ①②③④. No fifth bullet;
  the page continues directly into the `①` detail.
- **p. 24**, re-read at 2.6×: exactly four columns, four circled labels, four
  `5`s. The right edge of the table is clear, with only the `avg` annotation
  trailing off column 4. No fifth column.
- No other page carries a profile. §1.3's inventory accounts for all 24.

So a fifth profile is **not in this document.** It may exist in the author's
model without having been written down, or the count may refer to the `5`
entries themselves. This ingestion records four and does not invent a fifth —
adding one would be exactly the fabrication the brief forbids.

- `SK-PROFILE-01` — the source names four profiles. — **SOURCE-STATED**
- `SK-PROFILE-02` — whether a fifth profile exists outside this document. — **UNKNOWN**

If there is a fifth, naming it is question 1 of §14.2 and the register is shaped
to take it: `EP-5`, with the same six rows.

## 8. Question-type architecture

The document does not classify question *formats*. It never mentions multiple
choice, student-produced response, grid-in, option counts, or answer choices —
with one oblique exception (`SK-QT-05`).

What it does name, as recurring stimulus vehicles:

- `SK-QT-01` — `GRAPHS / TABLES` is a top-level carrier through which many topics arrive (p. 10). — **SOURCE-STATED**
- `SK-QT-02` — `word problem` is the other carrier. — **SOURCE-STATED**
- `SK-QT-03` — Named stimulus objects: `scatter plot`, `tables`, `graphs`, `Linear graph`, `function graph`, `Table Linear`, `Table Percent`. — **SOURCE-STATED**, as topic-log vocabulary
- `SK-QT-04` — Geometry figures are implied by `solid geo`, `Triangle perimeter`, `Triangle angles`, `Polygon`, but **no figure convention is described**. — **NOT SPECIFIED**
- `SK-QT-05` — `eliminate 2-choices` (p. 21) implies a multiple-choice format with more than two options. This is an implication of a strategy remark, not a statement of format. — **INFERRED**, weak
- `SK-QT-06` — Multi-question stimuli (one shared stimulus serving several questions). — **NOT SPECIFIED**. Never mentioned; no log entry pairs two items to one stimulus.

`SK-QT-06` matters because it is a real structural feature of some exams. The
document's silence is not evidence of absence.

---

## 9. Difficulty architecture

### 9.1 Topic difficulty bands (pp. 1–2)

Page 1 draws two large braces across the topic lists, labelled `HarD ParT` and
`Mid`. Page 2 opens with three topics braced to `Easy`.

| Band | Topics unambiguously enclosed |
|---|---|
| `Easy` (p. 2) | `Polynomial` · `Complex` · `calc.` |
| `Mid` (p. 1) | `Linear Function` · `circle` · `trigonometry` · `Qaudratic / Prapola` |
| `HarD ParT` (p. 1) | `exp + comp. in` · `Ratio / prop` · `solid geo` · `similarity` · `time/work/s.` · `graphes` · `tables` (+ `scatter plot` annotation) |

- `SK-DIFF-01` — Topics are sorted into **three named difficulty bands**: `Easy`, `Mid`, `HarD ParT`. — **SOURCE-STATED**
- `SK-DIFF-02` — Exact membership of each band. — **AMBIGUOUS.** The braces are freehand curves sweeping across two columns; the topics above are those clearly inside, but several on p. 1 sit under or beside a brace with no determinable side. The table is a floor, not a complete partition.

### 9.2 The `Hardest` / `Famous` list (p. 2)

A separate list headed `The Hardest in?` with `Famous` boxed beside it —
overlapping but **not identical** to the `HarD ParT` brace of p. 1. See §12.1.

### 9.3 Difficulty as a property of the test, not the item

The test-type taxonomy (§7) places difficulty in the *test's* profile — time
pressure, trap density, step length, number ugliness, ordering. This is a
different axis from the topic bands of §9.1 and the document never reconciles
them.

- `SK-DIFF-03` — Difficulty has (at least) two independent axes here: **topic difficulty** (§9.1) and **test-experience difficulty** (§7). — **INFERRED**
- `SK-DIFF-04` — Question-level difficulty labels appear sporadically in the logs (`medium` on one item, `Hard` on another, `easy` on a third). No scale is defined and most items carry no label. — **SOURCE-STATED** (the labels), **UNKNOWN** (the scale)
- `SK-DIFF-05` — Difficulty *distribution* — how many easy/medium/hard per module. — **NOT SPECIFIED**
- `SK-DIFF-06` — Difficulty *progression within a module*. — **NOT SPECIFIED**, except `EP-3`'s reversed ordering (`SK-ORDER-02`)

### 9.4 Score-band effort (p. 17)

`400→500` · `500→600` · `600→700` · `700→750` · `750→800`, braced to
`IS NOT THE SAME WORK`.

- `SK-DIFF-07` — Score gains at different bands require different work; the five bands named are the author's units. — **SOURCE-STATED**. This is a claim about *studying*, not about exam construction.

### 9.5 The accuracy target (p. 16)

`selly mistake is the biggest enemy for Any one want to get pure 800 → 58 Q true`

- `SK-DIFF-08` — A `pure 800` requires **58 questions correct**. — **SOURCE-STATED**

This does not reconcile with `SK-STRUCT-02`. Two modules of 22 is 44 questions,
not 58. See §12.2.

---

## 10. Construction rules

Every candidate rule in the document, classified as the brief requires. The
grades are deliberately conservative: **the document asserts no obligations, so
nothing is graded HARD RULE.**

| ID | Rule as the document has it | Class | Basis |
|---|---|---|---|
| `SK-CR-01` | Each module holds 22 questions | **PATTERN** | Stated p. 2, borne out by 4 logs. The closest thing to a hard rule here; still an observation of the SAT, not a rule imposed on construction |
| `SK-CR-02` | Numbering restarts at 1 in each module | **PATTERN** | All four logs |
| `SK-CR-03` | A question may combine 2–3 topics | **PATTERN** | Stated p. 10; measured at 19% (§4.3) |
| `SK-CR-04` | `word problem` and `GRAPHS/TABLES` carry other topics | **PATTERN** | The p. 10 diagram |
| `SK-CR-05` | Topic mixing concentrates in the harder module | **PATTERN** | Weak: `SK-DIST-02` |
| `SK-CR-06` | `EP-1` — long steps, complicated numbers, mostly easy/medium, more risk than hard | **PATTERN** | Profile definition |
| `SK-CR-07` | `EP-2` — traps in wording; `small change in a word` | **PATTERN** | Profile definition |
| `SK-CR-08` | `EP-3` — hard first, easing toward the end | **PATTERN** | Profile definition |
| `SK-CR-09` | `EP-4` — hard `clear and not alot`; `less in tricky`; `normal arrange` | **PATTERN** | Profile definition |
| `SK-CR-10` | Topics sit in three difficulty bands | **PREFERENCE** | Membership ambiguous (`SK-DIFF-02`) |
| `SK-CR-11` | the meaning of the four `5` entries on p. 24 | **UNKNOWN** | The "five tests per profile" reading is **withdrawn** (§7.0). Unlabelled, and no supported replacement |
| `SK-CR-12` | Easy questions carry more time-risk than hard ones | **PREFERENCE** | An argued opinion, and a good one, but an opinion |
| `SK-CR-13` | 58 questions correct for a `pure 800` | **EXAMPLE** | Conflicts with `SK-CR-01`; §12.2 |
| `SK-CR-14` | Topics differ in required depth — some need rules only, others need rules + skills + strategy + volume (p. 19) | **PREFERENCE** | A study-design claim |
| `SK-CR-15` | 5-step solving procedure: scan/check topic → write given → check what he want → make your equation → solve it, find answer (p. 20) | **PREFERENCE** | Student technique, not construction |
| `SK-CR-16` | Eliminating 2 choices raises the odds (p. 21) | **PREFERENCE** | Student technique; source of `SK-QT-05` |

**Nothing above is executable by the generator as it stands.** `SK-CR-01` and
`SK-CR-02` describe the SAT, which this generator does not build. The four type
profiles (`SK-CR-06`–`09`) are the only items with real generative content, and
each would need quantitative definition — how long is `Large steps`, how ugly is
`complicated`, how dense is `not alot` — before it could be built to.

---

## 11. Evidence classification summary

| Class | Count | Meaning |
|---|---|---|
| **SOURCE-STATED** | 20 | Written on the page, read at the confidence stated in §1.2 |
| **INFERRED** | 5 | Derived by this ingestion; the document does not say it |
| **NOT SPECIFIED** | 11 | The brief asked; the document is silent |
| **UNKNOWN / AMBIGUOUS** | 6 | The document gestures at it without determining it |
| | **42** | claims, plus the 16 construction rules of §10 |

These counts are not typed by hand. `scripts/validate-exam-knowledge.mjs` derives
them from the register and fails if this table drifts from it — which it already
caught once: this table first read 21/9/12/5, numbers written from the prose
lists below rather than counted, and no reader would have spotted it.

Full register, by class:

**SOURCE-STATED (20)** — `SK-STRUCT-01`, `SK-STRUCT-02`, `SK-STRUCT-03`,
`SK-STRUCT-04`, `SK-TOPIC-01`, `SK-TOPIC-02`, `SK-ORDER-02`, `SK-NUM-01`,
`SK-NUM-02`, `SK-TYPE-01`, `SK-TYPE-02`, `SK-TYPE-03`, `SK-SERIES-03`,
`SK-QT-01`, `SK-QT-02`, `SK-QT-03`, `SK-DIFF-01`, `SK-DIFF-07`, `SK-DIFF-08`, `SK-PROFILE-01`

**INFERRED (5)** — `SK-DIST-02`, `SK-SERIES-01`, `SK-SERIES-04`,
`SK-QT-05`, `SK-DIFF-03`

**NOT SPECIFIED (11)** — `SK-STRUCT-06`, `SK-TIME-01`, `SK-TOPIC-03`,
`SK-DIST-01`, `SK-ORDER-01`, `SK-NUM-03`, `SK-TYPE-04`, `SK-QT-04`, `SK-QT-06`,
`SK-DIFF-05`, `SK-DIFF-06`

**UNKNOWN / AMBIGUOUS (6)** — `SK-STRUCT-05`, `SK-ORDER-03`, `SK-DIFF-02`,
`SK-DIFF-04`, `SK-SERIES-02`, `SK-PROFILE-02`

Construction rules (§10) carry the brief's other scale: **9 PATTERN, 5
PREFERENCE, 1 EXAMPLE, 1 UNKNOWN, 0 HARD RULE, 0 RANGE.** The two zeros are the
result, not an omission — see §0.

Two entries are split claims, and each is registered exactly once so the counts
never double-count. `SK-STRUCT-03` is registered **SOURCE-STATED**: the word
`Adaptive` is on the page, and the undefined mechanism is carried in the claim's
own text. `SK-DIFF-04` is registered **UNKNOWN**: the per-item `easy`/`medium`/
`Hard` labels are on the page, but the scale behind them is what a later
document would need, and that is absent.

---

## 12. Conflicts and ambiguities

Both statements are recorded in full. Neither is resolved.

### 12.1 Two different "hard topic" lists

- **Statement A**, p. 1: the `HarD ParT` brace, enclosing `exp + comp. in`, `Ratio / prop`, `solid geo`, `similarity`, `time/work/s.`, `graphes`, `tables`.
- **Statement B**, p. 2: `The Hardest in? / Famous`, listing `Data analysis`, `word problem → story`, `Qaudratic equation / Prabola`, `works / time / speed / distance`, `graphs / tables`, `Solid Geometry [Not sure]`, `probability`, `Comp / Per [Not sure]`, `circle`, `exponent + comp. int`, `Geometry word problem`, `Scatter Plot`, `percent word problem`.

They overlap but disagree: `Qaudratic` is `Mid` under A and appears in B;
`circle` is `Mid` under A and appears in B; `Data analysis` and `probability`
are in B but not clearly braced in A.

**Unresolved.** The lists may answer different questions — "hard to learn"
versus "frequently hard on the test" — but the document never says so, and
choosing that reading would be invention.

### 12.2 44 questions versus 58

- **Statement A**, p. 2: `22` + `22` across `Mod 1, 2`, corroborated by four logs → **44 questions**.
- **Statement B**, p. 16: `pure 800 → 58 Q true` → **58 questions**.

**Unresolved.** 58 exceeds 44, so the two cannot both describe the same
instrument's math section. Possible readings — a different exam, both sections
combined, an older format, a slip — are all available and the document
distinguishes none of them. Recorded as a conflict.

### 12.3 `Mod 2 (H)` — instrument or experience

`SK-STRUCT-05`. Under adaptive delivery, "module 2 is hard" may name the
instrument's hard branch or one sitting's path. Not determinable.

### 12.4 The four `5`s

`SK-SERIES-02`. Unlabelled. The "five tests per profile" reading was proposed by
this ingestion and **withdrawn on 2026-09-05** at the source owner's correction
(§7.0). No replacement reading is supported, so the entries stay UNKNOWN.

### 12.5 Brace membership

`SK-DIFF-02`. Freehand braces across two columns; several topics have no
determinable side.

### 12.6 The `✱` / `✗` marks

Most log lines carry a star or crossed-circle, sometimes several under different
parts of a composite label with arrows pointing down at each component. Candidate
meanings: items answered wrongly, items judged important, or the specific
component carrying the difficulty. **The document never defines the symbol.**
Recorded as UNKNOWN and excluded from every count in §4.

### 12.7 Language

Pages 14, 22, 23, 24 mix Arabic into English mid-sentence
(`don't enhar`, `kaml`, `el start wa7sh`, `arrange` + Arabic, three Arabic
clauses). Translations in §7 are this ingestion's, marked as such. The Arabic
lines on pp. 14 and 23 are marginal glosses; they are noted but not translated
here, because their reading is not confident enough to record as evidence.

---

## 13. Canonical taxonomy for future documents

Stable identifiers so later PDFs attach rather than fork. **These are labels, not
definitions** — this document did not define its topics, so neither can these
IDs. A later source that defines them properly should fill them in, keeping the
identifier.

### 13.1 Topic identifiers

| ID | Canonical name | Document spellings seen |
|---|---|---|
| `T-ALG-LIN` | Linear equations & functions | `Linear Function`, `Linear`, `normal eq - linear`, `Linear graph`, `Linear table` |
| `T-ALG-SYS` | Systems of equations | `system of eq.`, `system of linear equation` |
| `T-ALG-INEQ` | Inequalities | `inqu`, `inquality`, `inequality`, `inq. graph` |
| `T-ALG-ABS` | Absolute value | `Absolute value`, `N. eq absolute solution` |
| `T-ALG-QUAD` | Quadratics & parabolas | `Qaudratic / Prapola`, `Qaudratic equation / Prabola`, `vertex quadratic eq` |
| `T-ALG-POLY` | Polynomials | `Polynomial`, `Poly`, `Poly Func` |
| `T-ALG-EXPR` | Expressions & factoring | `N. expression`, `expression factor` |
| `T-ALG-EXP` | Exponents & exponentials | `exponent`, `exponential`, `exp` |
| `T-ALG-COMPINT` | Compound interest | `comp. in`, `comp. int`, `compound interest` |
| `T-FUN-GEN` | Functions (general) | `Function`, `func`, `N. func - eq`, `function graph` |
| `T-FUN-RAT` | Rational functions | `rational func table` |
| `T-FUN-TRANS` | Transformations | `transformation` |
| `T-NUM-PCT` | Percent | `Percent`, `percent word problem` |
| `T-NUM-RATIO` | Ratio & proportion | `Ratio / prop`, `Ratio Proportional` |
| `T-NUM-RATE` | Rates | `Rates`, `Speed / dist`, `works / time / speed / distance`, `time/work/s.` |
| `T-STA-DATA` | Data analysis | `Data analysis`, `Data / mean / median / mode / range` |
| `T-STA-CENTRE` | Mean / median / mode / range | `mean / mod / median`, `Table median` |
| `T-STA-MOE` | Margin of error | `margin of error`, `margin of ERRORS` |
| `T-STA-SCATTER` | Scatter plots | `Scatter Plot` |
| `T-STA-PROB` | Probability | `Probability`, `PRObability` |
| `T-CMB-PERCOMB` | Permutations & combinations | `per and comp`, `Comp / Per` |
| `T-GEO-GEN` | Geometry (general) | `Geometry`, `Geometry word problem` |
| `T-GEO-TRI` | Triangles | `Trindles`, `Triangle angles`, `Triangle perimeter`, `graph triangle` |
| `T-GEO-ANG` | Angles & lines | `Angles`, `angles / lines` |
| `T-GEO-POLY` | Polygons | `Polygon` |
| `T-GEO-CIRC` | Circles | `circle`, `eq. of circle`, `circle eq` |
| `T-GEO-SOLID` | Solid geometry | `solid geo`, `Solid Geometry` |
| `T-GEO-SIM` | Similarity | `similarity` |
| `T-GEO-TRIG` | Trigonometry | `trigonometry` |
| `T-LOG-GEN` | Logic | `Logic` |
| `T-CPX-GEN` | Complex numbers | `Complex` |

### 13.2 Carrier identifiers (§3.3)

| ID | Name | Note |
|---|---|---|
| `C-WORD` | `word problem` | Named hub, p. 10 |
| `C-GRAPHTAB` | `GRAPHS / TABLES` | Named hub, p. 10 |

Carriers are deliberately kept separate from topics. Conflating them would lose
`SK-TOPIC-01`, which is the document's best structural idea.

### 13.3 Test-type identifiers (§7)

| ID | Document name | defining dimension |
|---|---|---|
| `EP-1` | `Tests take more the normal time` | length / step burden, with complicated numbers |
| `EP-2` | `Tests have a Easy, but tricky Qeustion` | trap density |
| `EP-3` | `Tests make the student so stressfull while solving` | pressure, via hard-first ordering |
| `EP-4` | `Perfect Normal test` / `(Real Simulation) Perfect test` | balance — the score-predicting profile |

`EP-5` is deliberately unallocated. The source shows four (§7.5); if a fifth
profile exists in the author's model, it takes this identifier and the same six
dimension rows.

### 13.4 Difficulty-band identifiers (§9.1)

| ID | Document name |
|---|---|
| `DB-EASY` | `Easy` |
| `DB-MID` | `Mid` |
| `DB-HARD` | `HarD ParT` |

### 13.5 Form-level DNA

The brief asked for
`Exam → Strategy → Section/Module → Question Number → Topic → Subtopic → Question Type → Structural Role`.

That chain **cannot be completed from this document**, and the machine-readable
representation records the break rather than papering over it:

| Level | Status |
|---|---|
| Exam | Partial — `SAT` structurally; `EST` named but never described |
| Strategy | **Present** as exam profiles — `EP-1`..`EP-4` |
| Section/Module | Present for SAT — `MOD1`, `MOD2`, 22 each |
| Question Number | Present — 1..22 per module |
| Topic | Present as labels — §13.1 |
| Subtopic | **Absent** — no hierarchy exists (`SK-TOPIC-03`) |
| Question Type | **Absent** — no format taxonomy (§8) |
| Structural Role | **Absent** — never discussed |

Machine-readable form: `docs/knowledge/exam-knowledge/exam-knowledge-01.mjs`,
validated by `scripts/validate-exam-knowledge.mjs` in CI. The validator asserts
page coverage is 24/24, that identifiers are unique, that every claim carries an
evidence class, and that the two recorded conflicts stay recorded — so this
ingestion cannot be quietly edited into agreement with itself.

---

## 14. What this document does NOT establish

Stated plainly, because the next phase depends on knowing where the floor is.

**It does not establish the EST.** Not its structure, section count, question
count, timing, topic distribution, ordering, or numbering. `EST` appears as a
label on two topic lists and one page header. Every structural claim in the
document is about the **SAT**. For a project whose object is EST Mathematics,
this is the headline result.

**It does not establish timing.** No duration appears anywhere.

**It does not establish topic distribution.** No percentage, count, quota or
range. §4.2's frequencies were computed here from 85 hand-transcribed items
across two forms; they are not the document's claims and are far too thin to
blueprint against.

**It does not establish question formats.** Multiple choice is never named; the
option count is inferred from one strategy remark (`SK-QT-05`). Grid-ins,
multi-question stimuli and figure conventions are absent.

**It does not establish four form-assembly strategies.** It establishes four
**exam profiles**, which is a different thing — they describe what kind of exam a
student may receive, varying step burden, difficulty, trap density, number
ugliness and pressure over a content model they share (`SK-TYPE-03`, §7.1). It
gives no profile a construction procedure, a topic distribution, a question
count, or a form.

**It does not populate its own dimensions evenly.** Of the 20 dimension cells in
§7.3, **7 are empty**, and number/computational burden is specified for one
profile only. The five-dimension frame is the organising idea, not a completed
table.

**It does not establish a topic hierarchy**, so it cannot supply the
subtopic level the DNA chain needs.

**It does not establish difficulty distribution or within-module progression**,
beyond type ③'s reversed ordering.

**It does not resolve its own two conflicts** (§12.1, §12.2).

### 14.1 What it does contribute

Three things, and they are worth having:

1. **A four-profile taxonomy of what kind of exam a student may receive**, each
   with a defining dimension and a named failure mode, and a claim that only
   `EP-4` predicts a real score. This project has no such taxonomy anywhere in
   its existing artifacts — its difficulty work has been about items, not about
   the shape of a whole sitting.
2. **The carrier/topic distinction** (`SK-TOPIC-01`) and the 2–3-topic composite
   claim (`SK-TOPIC-02`) — arrived at independently, and consistent with what the
   generator already models.
3. **The relationship claims inside the profiles** — that easy-and-long carries
   *more* risk than hard (`EP-1`), that a wording trap defeats speed rather than
   ability (`EP-2`), that front-loaded difficulty trains recovery (`EP-3`). These
   are causal statements about how a sitting goes wrong, and they are the part of
   the document with the most content per line.

### 14.2 Questions for the author, in priority order

1. **Is there a fifth exam profile?** The correction of §7.0 asks for five;
   pp. 22 and 24 show four, re-checked at high magnification (§7.5). If a fifth
   exists it takes `EP-5` and the six dimension rows.
2. **What do the four `5` entries on p. 24 mean?** The "five tests per profile"
   reading is withdrawn; nothing supported has replaced it (`SK-SERIES-02`).
3. **Is `58 Q true` the same exam as `22 + 22`?** (§12.2)
4. **Which topics fall inside the `HarD ParT` and `Mid` braces on p. 1?** (§12.5)
5. **What do the `✱` / `✗` marks in the item logs mean?** (§12.6)
6. **Does `Mod 2 (H)` name the adaptive hard branch, or how that sitting felt?** (§12.3)
7. **Is any of this intended to apply to the EST, or is it all SAT?**

### 14.3 Standing instruction for later documents

This document is **one source, of notebook authority**. Its identifiers are
stable so later material can attach to them; its evidence classes are not.
A later source of higher authority — a publisher specification, an official
guide — **supersedes** anything here that conflicts, and the conflict is to be
recorded in this file rather than resolved by deletion.

Nothing in this file may be promoted from PATTERN or PREFERENCE to HARD RULE by a
later document that merely repeats it. Promotion requires a source that states
the obligation.

---

*Ingested 2026-09-05. Source sha256 `b56e34e6…83c27`, 24 pages, all read.
No generator, blueprint, difficulty-model, allocation or EST artifact was
modified in this phase.*
