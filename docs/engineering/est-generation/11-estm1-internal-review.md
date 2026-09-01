# ESTM1-2026-A — internal content review

**Second-reader review of all 50 items.** Status of the form itself:
[STATUS-ESTM1-2026-A.md](STATUS-ESTM1-2026-A.md) — **DRAFT, INTERNAL REVIEW
ONLY**, unpublished, admin-only.

The question this review asks is not *does the validator pass*. It is:

> If a strong standardized-test item writer read this form, would they consider
> every item clear, fair, unambiguous, appropriately difficult, and
> authentically EST-like?

Every item was read against the sixteen criteria below. **Items were revised
only where there was a real quality problem.** Twenty-eight items are unchanged
because nothing was wrong with them; that is recorded here as a finding, not as
an absence of one.

| # | Criterion | # | Criterion |
|---|---|---|---|
| 1 | Mathematical correctness | 9 | Authenticity of the cognitive task |
| 2 | Unique correct answer | 10 | Authenticity of the context |
| 3 | Wording clarity | 11 | Authenticity of the stimulus |
| 4 | Unnecessary ambiguity | 12 | Reads as a real item, not a generated exercise |
| 5 | Unnecessary computation | 13 | Answer choices create no unintended clue |
| 6 | Difficulty appropriateness | 14 | No wording reveals the answer |
| 7 | Distractor plausibility | 15 | No visual communicates what the item did not intend |
| 8 | Distractor diagnostic value | 16 | Tests the intended skill, not an accidental one |

---

## 0. What the review found, in one table

| | Count |
|---|---:|
| Items reviewed | 50 |
| Items with a defect that was fixed | 22 |
| Items with a concern **recorded and deliberately not acted on** | 4 |
| Items unchanged, no concern | 24 |
| Defects a **rendered pixel** revealed that no property check could | 4 |
| Defects that **would have shipped** under the gates as they stood | 6 |
| New executable gates written **because of** this review | 3 |

**The most important finding is not any single item.** It is that six defects
sat inside a form that passed every gate, and four of them were only visible in
the rendered figure. Two of those six made an item **unanswerable as drawn**.

---

## 1. The serious findings

### F8 · Q19, Q20 — the bar chart could not be read at all

Both items ask the student to read exact values off `S2`. The renderer rules a
chart at `niceStep(max − min, 5)`; with a maximum of 240 that is a line every
**50**, and the ten plotted values were 120, 90, 60, 75, 130, 200, 240, 170, 225
and 80 — **not one of them on a ruled line**.

Q19 asks which day's evening figure is exactly three times its morning figure.
Q20 asks for a day's total. Neither is answerable by looking; both required the
student to guess a value between two rules and then do exact arithmetic on the
guess. **Criteria 2, 4, 11, 15.**

Fixed: every value replaced with a multiple of 50. Both keys unchanged (D, D).
The replacement also gave Q19 a better distractor — Monday now carries the
**inverted** ratio (150 morning, 50 evening), which artifact 4 §D3 names as a
corpus distractor for ratio items.

### F9 · Q29, Q30, Q31 — the same failure, plus two items collapsed into one

`S3`'s six rainfall values (42, 55, 38, 61, 24, 30) were ruled every **20**.
Same defect: Q29 (mean) and Q31 (range) both need exact values and none was on a
rule.

And a second, independent defect: the maximum (61, April) and the minimum (24,
May) were **adjacent months**, so the range and the greatest consecutive fall
were *the same subtraction*, 61 − 24 = 37. **Q30 and Q31 tested one skill
twice.** A student who did Q30 had Q31's answer already. **Criteria 8, 16.**

Fixed: values 20, 40, 100, 80, 60, 20 — all on rules, extremes two months apart,
and the greatest *change* on the chart is now a **rise** (+60), so reading the
steepest segment without regard to direction lands on a wrong option. Range 80,
greatest fall 40: different numbers, different work. Keys C, D, C.

### F10 · Q22 — the figure withheld the ruling the question needed

The item asks for the exact *x*-intercepts of a parabola, which is a **value**
read; `reading` was set to `'shape'`, and `gridPlan('graph', 'shape')` suppresses
the grid. Fixed: `reading` → `'value'`. The intercepts at −2 and 2 now sit on
drawn vertical rules.

The same pass also replaced option D, `x = 2 only` — the only option naming one
value where the other three named two, so it could be dismissed on shape alone
without looking at the graph (**criterion 13**). It is now `x = −2 and x = 4`.
Key B unchanged.

### F23 · Q37 — the answer sat exactly between two rules

`f(0) = −3`, on a plane whose window spanned 12 units of *y* and was therefore
ruled every **2**: −6, −4, −2, 2, 4. The value asked for fell precisely halfway
between two lines, **and distractor A (−4) was the next line down.** A student
reading carefully and a student reading carelessly could not be told apart.
**Criteria 2, 4, 15.**

Fixed by narrowing the window to `yRange [−5, 2]` (span 7 → ruled every 1). The
function is unchanged: `f(x) = x² − 2x − 3`. Now −3, the minimum −4 and both
*x*-intercepts all land on drawn lines.

### F13 · Q35 — a distractor that needed two errors, described as needing one

Option D was `40.5 cm` and the explanation said it came from scaling by the
ratio of the areas instead of its square root. That error gives `AB = 40.5` —
but the question asks for `DB`, so reaching 40.5 also required *not* subtracting.
Two errors, one named. Fixed: D is `32.5 cm`, where the named error actually
lands. **Criterion 8.**

### F16 · Q40 — a throwaway option

Option A was `0` asymptotes, which traces to no error a student makes. Artifact
4 §3 records as T2 that the corpus contains **no option a student with partial
understanding can dismiss without doing mathematics**, and calls that the highest
bar an authored item must clear. `0` failed it. Fixed: A is `1` — the count from
finding the horizontal asymptote and stopping. **Criteria 7, 8.**

### F18 · Q49 — two of three distractors were arithmetic slips

Artifact 4 §D7's authoring rule: *at most one purely-slip distractor per item,
and never all three; an item whose distractors are three arithmetic slips is the
clearest signature of a synthetic question.* Q49 had two. Fixed: D `10` → `9`,
which is `P(0)` — the remainder on dividing by `x` rather than by `x + 1`. The
three distractors are now a slip, a sign error and a substitution error.
**Criterion 12.**

### F7 · Q16 — the item could be answered without solving it

`2n + 3p` differs from the given `3n + 2p = $17` by only `p − n = $1`, so the
answer had to be near 17 — and **18 was the only option anywhere near it.** A
student who noticed that never had to solve the system. **Criteria 13, 16.**

Fixed: distractor C `$14` → `$17`. The same estimate now lands on a wrong
option, which converts the clue into a trap.

---

## 2. Explanations that named the wrong thing

Four explanations described a distractor's origin incorrectly. None changes an
answer; all are corrections of record, and each was found by re-deriving the
named error rather than by reading the prose.

| Item | Said | Actually |
|---|---|---|
| **Q7** | choice A (20%) counts "the 2 row" | the 2 row is 6 of 20 = 30%. 20% is the **1 row** |
| **Q14** | choice A (10) is "the mean of the parallel sides" | the mean is 5. 10 is their **sum** |
| **Q15** | choice A (−2) "composes the two functions in the wrong order" | `g(f(2)) = −3`. −2 is simply **`f(2)`** |
| **Q36** | choice A (0.5) is `y − x` | `y − x = −0.5`. 0.5 is **`x − y`** |

One more was incomplete rather than wrong: **Q41**'s four options are the four
cells of a 2×2 grid (replaced or not × doubled or not) — a structure artifact 4
praises — and the explanation described only one axis of it. Rewritten to say so.

---

## 3. Option-set defects

### F2 · Q3 — the key letter was chosen, not determined

Artifact 4 §3, T2: *options are ordered by magnitude … the key letter is
therefore determined by the answer's magnitude, **not chosen**.* Q3's four model
expressions stood in an author-chosen order, which means the author picked the
key letter. Fixed by ordering them by their value at `k = 0` — the cost of
driving no kilometers — a rule a student can perceive and an author cannot bend.
**Key moved C → D as a consequence, which is the point.**

### F1, F15 · Q1, Q39 — mixed option formats

Artifact 4 §3, T3: option *format* is uniform inside an item, and a mixed set
"reads as synthetic".

- **Q1** offered `1`, `4.5`, `9`, `18` — one non-integer, and its named error
  ("writing 4x = 18") has no coherent origin. Replaced with `5`: subtract `3x`
  from both sides and leave the `−8` where it is.
- **Q39** offered `−5.5`, `−3`, `6`, `7`. Moving the given point from `(6, −1)`
  to `(12, −1)` makes every option an integer and leaves all three distractor
  stories exactly as they were. Options `−10, −3, 12, 15`; key D unchanged.

### F3 · Q5 — a `core` item with nothing to compute

The two points gave a slope of exactly **1**, so the item asked for no real
slope computation, and the "slope taken as −1" distractor was indistinguishable
from a sign slip. New points `(−2, 2)` and `(1, 8)`: slope 2, intercept 6. Key D.
**Criteria 6, 8.**

### F12 · Q33 — an option with no story

Option D was `4`, described as "the coefficient of `x`". The coefficient of `x`
in that product is **7**. Fixed: D is `7`, and the description is now true.

---

## 4. Register

**The form mixed British and American spelling.** Seven places: `centre` (Q45,
Q47), `colour` (Q48), `kilometre` (Q3, Q43), `metre` (Q17, Q27) and `trapezium`
(Q35). Everything else on the form was American.

Corrected to American throughout — `center`, `color`, `kilometer`, `meter`,
`trapezoid`.

**Evidence tier: T3, and stated as such.** The corpus working notes carry no
direct spelling evidence; the one recorded quotation is artifact 5 §1's
"the curve **admits** a center of symmetry", which is American. Internal
consistency does the rest of the work: whatever the live exam does, a form that
spells one way in Q17 and the other in Q27 is wrong on its own terms. If the
published exam turns out to use British forms, this is a one-line reversal.

**What was checked and left alone**, because the corpus attests it:

- **"unit squared"** for area (Q14) — artifact 5 §109 records this as T2: the
  corpus writes "22.5 unit squared", not "square units". Kept.
- **"admits"** (Q47) — artifact 5 §1, the corpus's own register. Kept.
- **"Which student could be right?"** (Q47) — artifact 2 §241 quotes this
  phrasing from the corpus directly. Kept.
- **Three-decimal probabilities** (Q41, Q48) and **`1.03⁶`** (Q34) — the EST
  Math test is calculator-allowed, graphing calculator expected
  (publisher-authoritative, artifact 1 §1). Not an unreasonable computation.

---

## 5. Internal bookkeeping corrected

These change no item a student sees. They are recorded because a record that is
wrong is worse than no record.

**Distractor classes.** Seven distractors were relabelled after re-deriving what
each actually encodes, using a rule stated once and applied consistently:
**D1 = the work is incomplete, a step remains; D5 = the work is complete and the
wrong element was reported.** Reporting a data value where a subtraction or an
average was asked is therefore D1, not D5 (Q31, Q43); repeating a given length
where a derived one was asked is D5, not D1 (Q27). Q50's option C was labelled
D4, which artifact 4 reserves for structurally wrong *expressions*; it is D5.

After relabelling, the form's largest class is **D1 at 12 of 50 items (24%)** on
the corpus-measured per-item basis, inside the 30% cap.

**The `offsheet` device.** It was applied inconsistently: Q25 (exponent laws)
carried it while Q9, an item of the same kind, did not. The criterion is now
stated explicitly:

> `offsheet` marks an item whose difficulty lever is recall of a **named rule
> the reference sheet withholds and for which no elementary substitute exists**.

The corpus supports the narrow reading: form T1 carries **zero** `recall` tags
while certainly containing coordinate items. Midpoint is halving; the distance
formula is Pythagoras, which the reference sheet **does** give; a
without-replacement probability can be counted. Exponent laws, the sum and
product of roots, and the perpendicular-slope relation have no such substitute.

Applied consistently: `offsheet` is now Q9, Q25, Q28, Q39 — four items, against
a corpus range of 0–5 per form.

---

## 6. Concerns recorded and deliberately **not** acted on

Four. Each was considered and left alone, because changing it would have been
rewriting an item to make it different rather than to make it better.

| Item | The concern | Why no change |
|---|---|---|
| **Q12** | The second divisibility condition is redundant — `P(1) = 0` alone gives `a + b`. The elegant route is two steps while the slot is `stretch`. | The redundancy **is** the item: spotting that only one condition is needed is the reasoning being tested. The explanation shows the second condition agrees, so a student who uses both is not penalised. |
| **Q26** | Options A + B + C sum to exactly 1.00, which is a mild structural hint. | The reasoning that hint enables — each option is one colour's share — **is** the intended reasoning. Removing it would make the item worse. |
| **Q30** | Two of four options are rises, and a student who understands "fall" eliminates them at a glance. | Real chart items are built this way, and after F9 the largest *change* on the chart is a rise, so choice B is now a genuine trap rather than a throwaway. |
| **Q48** | "not one of each colour" is slightly awkward phrasing. | It is standard, and unambiguous. Rewording would be cosmetic. |

---

## 7. What this review says about the process

**Three new executable gates were written because a human read the form and the
machines had not.** Each is mutation-tested — reverted to the defective state,
confirmed red, restored.

- **G4.1** — every value an item must read exactly off a **chart** must land on
  a drawn gridline. Reproduces the renderer's own `niceStep` arithmetic rather
  than describing it, so the two cannot drift. Reverting `S2` or `S3` turns it
  red with the offending values named.
- **G4.2** — for a **plot** read for value, the item declares the coordinates it
  makes the student read (`reads`), and each must sit on a rule. No gate can
  infer this: a curve passes through every value between its samples, and only
  the question knows which one is the answer. Reverting Q37's window, or
  deleting its declaration, turns it red.
- **Two visual baselines** — `data-3`, a **two-series bar chart**, and `data-4`,
  a **line chart**. The specimen suite had neither. Every chart baseline was a
  single-series bar or a pie, which is precisely why the label collision below
  shipped twice and why the line branch had never been compared to anything.

### The renderer defect this review found

A bar chart's direct label was centred above its own bar, and collided with
whichever sibling bar in the last group happened to be taller — the word
"Morning" printed across the Wednesday evening bar with a halo cut out of it.

**This had been fixed once before, in the data**, by reshaping the numbers so the
labels landed clear. It came straight back the moment the numbers changed for
F8. The fix was in the wrong place: the defect is in the drawing, so the labels
now sit to the **right** of the last group, each on its own bar's top — the
placement the line branch always used — with `PAD.r` reserving the width and a
14px nudge separating two series that end level. All fourteen pre-existing
baselines are **byte-identical** after the change; single-series charts do not
draw direct labels at all.

The per-character estimate reserving that width was also wrong: 7.2px, against a
measured 8.4px for the bold label face. A seven-character series name cleared
the frame by three pixels and a longer one would not have cleared it.

### Two readings I got wrong, corrected by measurement

Worth recording, because they are the reason measurement is in the loop and not
only the eye:

- I read the specimen's "Tuesday"/"Wednesday" axis labels as colliding. Measured:
  a 12.8px gap. **No defect.** No change made.
- I read Q14's `3` axis numeral as crossed by segment `AD`. Measured across all
  fourteen stimulus-bearing items: **no text box is crossed by any stroke.** The
  renderer appends tick labels after the series for exactly this reason. No
  change made.

The Morning-label collision, by contrast, measured as a real overlap. The rule
that follows: **look at the pixels to find candidates, measure to confirm them.**

---

## 8. Verification after the revisions

| Check | Result |
|---|---|
| `node tests/run-all.mjs` | **65/65 green** |
| `node scripts/check-visual-fidelity.cjs` | **32/32**, up from 30 — two new baselines |
| `node scripts/audit-est-form.mjs` | **PASS**, every form gate met |
| Independent answer re-solve (`verify.py`) | **50/50**, computed from the stems |
| Stimulus re-entry cross-check | **clean** |
| Database ↔ reviewed payload | **byte-identical** — 50 prompt and 50 explanation md5s, both character totals, every key and every `reading` |
| All 50 items re-rendered and looked at | **done**, no remaining visual defect |

The independent verifier gained a cross-check of its own during this review. Its
stimulus tables are re-entered by hand so that the re-solve is independent of the
payload — and that independence had let an **earlier copy carry a wrong Wednesday
pair with nothing noticing**. The re-entry is now compared with the payload
loudly: a mismatch is reported and exits non-zero, never silently absorbed.

**Key letters after revision:** A=11, B=13, C=13, D=13; longest run 2. Inside the
11–14 budget. Three keys moved (Q3 C→D, Q29 A→C, Q31 B→C) and every one moved
because the option order is determined by the mathematics, not chosen.

---

## 9. The standing conclusion

The form now meets, as far as a second reading can establish:

**VALID · MATHEMATICALLY CORRECT · ORIGINAL · CLEAR · DIAGNOSTIC · AUTHENTIC ·
VISUALLY CORRECT · SERIES-DIVERSE**

with these limits stated rather than hidden:

- **No KAR claim.** The published bands are the target; our classification is
  diagnostic only and this form does not claim to satisfy the percentages.
- **Difficulty is a design-based estimate — not psychometrically calibrated.**
- **Two items (Q10, Q35) carry prose in place of a not-to-scale figure**, pending
  R1. Temporary, not accepted as permanent, and the budget stays in the
  blueprint.
- **Graph- and number-line-valued answer choices remain unbuildable**, pending
  R2. The budget stays in the blueprint.

**`ESTM1-2026-A` remains DRAFT — INTERNAL REVIEW ONLY. It is not published, not
student-visible, and not part of production exam inventory.** Forms 2–25 are not
to be generated until it is approved.
