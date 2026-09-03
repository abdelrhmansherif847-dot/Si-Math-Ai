# Stage 4 — ESTM2-2026-P3 Validation

**STATUS: P3 MEASUREMENT PROTOTYPE — NOT APPROVED FOR SERIES SCALING**

One prototype, generated from the revised library on a seed never used in
calibration or gate development, frozen before coding, and blind-reviewed
end-to-end on the same frame as P1 and P2.

**Verdict: CONDITIONAL.** Every single-form gate passes and the difficulty
profile is unchanged from P2. The 25-form series-capacity analysis, run for the
first time in this programme, measures an **83% pairwise object overlap between
forms against a reference of about 2%**, and a library **16.3× too small** for
the series it is meant to produce. §8 sets that out.

No exam content is in this document or this repository. Forms 2–25 were not
generated.

---

## 1. Identity

| | |
|---|---|
| Form | `ESTM2-2026-P3` |
| Status | DRAFT — INTERNAL REVIEW ONLY. Not published, not exposed to students |
| Seed | **31400** |
| sha256 | `a1c0fce9e40ccfac6a9444e7847771c53ffafbc68aff8f3ae0a0803862e347f6` |
| Blueprint version | stage-3.5 signatures + core stream + form gates + coverage revision |
| Items | 50 / 50 |
| Answer key | `DBADCDBDBCDCABBBBCBDCADDCDADABABBAADBDAAAACACCCCBA` |
| Key counts | A 14 · B 13 · C 11 · D 12, longest run 4 |
| Streams | routine 17 · core 15 · mechanism 16 · composed 2 |
| Stimulus sets | 4 (bar-chart ×2, data-list, table) |

**The seed was chosen before the form was seen.** Ten seeds are burned —
4100/5200/6300/7400/8500 (the validator's five), 9600 (P2), and
10700/11800/12900/13000 (the coverage revision's sweep). 31400 had never been
run.

`ESTM2-2026-P2` (sha256 `ae55f23c…`), `ESTM2-2026-P1` and `ESTM1-2026-A` are all
untouched.

---

## 2. Mechanical QA

All 50 keys were recomputed by hand from the rendered form **before any coding**
and all 50 match the generator.

| check | result |
|---|---|
| `node tests/run-all.mjs` | **74 / 74 green** |
| `est-primitives` mutations | 261 pass |
| `est-fingerprint` | 64 pass |
| `est-compose` | 39 pass |
| `est-blueprint-gates` | 37 pass |
| `est-assembly-gates` | 40 pass |
| `est-form-gates` | 69 pass |
| `verify(P3)` | OK |
| stream contracts re-checked per item | **50 / 50 hold** |
| mechanism items load-bearing under `assess()` | **16 / 16** |
| anti-clone collisions | **0** |
| content-reuse collisions (equation, tuple, constants, option grid) | **0** |
| object diversity | **49 / 50 distinct**, one repeat — inside the reference allowance |
| key balance | A14 B13 C11 D12, longest run 4 — inside 11–14 and the observed max of 5 |
| step-span overlap | **100%** of non-Entry items sit inside the Entry span |
| families inside their reference per-form range | **18 / 18** |

Two open measurements, carried forward from Stage 3.5 and unchanged: `band Entry
17` against a drift-corrected per-form range of 6–16, and `band Peak 10` against
11–24.

---

## 3. The `P-COMBINATION/sum-difference` repair, re-verified in the P3 population

| check | result |
|---|---|
| sum-difference candidates in the P3 pool | 222 |
| candidates whose collapse route reaches the key | **0** |
| candidates missing the enumerated collapse route | **0** |
| candidates load-bearing under `assess()` | **222 / 222** |
| 2000-seed sweep from 31400 | **103 degenerate rejected at construction**, 723 built |
| construction guard bypassed, item assessed anyway | **refused** — `bypass: read-the-target-off-the-first-relation@1` |
| P3's own sum-difference item (Q36) | collapse route −20 against key −17 — **not degenerate** |

Both halves hold. The degenerate `m === n` case cannot be built, and if the
construction guard were removed the general contract still refuses every one of
the 103.

---

## 4. Blind forensic profile

All 50 items coded on the 14-dimension frame from the rendered form only — no
band, stream, object id, mechanism map, routes or solution paths.

| | P1 | P2 | **P3** | reference T3+T4, per 50 |
|---|---:|---:|---:|---:|
| mean RLx | 10.30 | 12.12 | **11.66** | **13.01** |
| Entry | 29 | 16 | **16** | 12.5 |
| Core | 5 | 13 | **14** | 11.5 |
| Stretch | 9 | 11 | **11** | 12 |
| Peak | 7 | 10 | **9** | 14 |
| `opacity` | 0.40 | 1.70 | **1.66** | 1.79 |
| generator/blind band agreement | 25/50 | 26/50 | **27/50** | — |

**P3 is P2 within noise.** The RLx difference is −0.46 against a standard error
of about 0.60 on n=50, so the coverage revision did not move difficulty in
either direction — which is what it was supposed to do, and what "do not
maximise difficulty" asked for. The remaining distance to the reference is
concentrated in one band: **Peak 9 against 14**.

### 4.1 By stream

| stream | n | mean RLx | blind bands |
|---|---:|---:|---|
| routine | 17 | 7.71 | Entry 13 · Core 3 · Stretch 1 |
| core | 15 | 11.80 | Entry 2 · Core 8 · Stretch 5 |
| mechanism | 16 | 15.06 | Peak 8 · Stretch 4 · Core 3 · Entry 1 |
| composed | 2 | 17.00 | Peak 1 · Stretch 1 |

The streams are ordered as designed and the Core stream sits where the corpus
puts Core. The mechanism stream is the one that leaks downward — §7 R6.

### 4.2 Per-dimension against T3+T4

Largest gaps: `multiconcept` −0.48, `hidden_step` −0.31, `approaches` −0.27,
`inference` −0.26. `trap_cost` is +0.14 and `filtering` +0.05; `opacity` is
−0.13, essentially closed. Mechanisms that bite: `repr_switch` 26%,
`multiconcept` 22%, `hidden_step` 18%, `nonobvious_rel` 18%, `inference` 16%,
`filtering` 16%, `abstraction` 16%, `competing_interp` 4%, `reversal` 4%.

### 4.3 Steps against difficulty

Spearman r(steps, blind band) **+0.528** against a reference per-form range of
+0.128 to +0.474 and P1's Pearson +0.835. Mean steps 2.54 against the
reference's 3.64 (T4) and 4.76 (T3): **generated items remain systematically
shorter than real ones**, and the correlation sits just outside the reference
range for that reason.

---

## 5. Targets and objects

| | P2 | **P3** | reference |
|---|---:|---:|---:|
| value-targeted | 80% | **80%** | 64–76% |
| selection | 8% | **14%** | 16% |
| expression | 2% | **2%** | 8% |
| **equation** | 2% | **0%** | 4% |
| interpretation | 2% | **2%** | 2% |
| non-value total | 20% | **20%** | **29%** |

**Zero equation-targeted items reached the form**, although the library now has
`P-SELECT-OBJECT/which_equation`: it serves A05, and A05's three slots went to
other constructs. A capability that exists in the library and never reaches a
form is not coverage in practice, and this is the clearest instance of it.

| | value |
|---|---|
| distinct mathematical objects in the form | **49 / 50** |
| objects repeated | 1 (`bar-compare-single`, Q29 and Q37) |
| distinct sub-forms | 50 / 50 |
| objects the pool could build but the form did not use | 41 of 90 (**46% free**) |
| structures available / used / unused | 112 / 50 / 62 |
| repeated option grids | 0 |
| repeated stem numeric tuples | 0 |

---

## 6. Stimulus and family distribution

Six distinct displays carry 11 items: one data-list (2 items), two tables (2 and
1), three bar charts (3, 2 and 1). **Bar charts carry 6 of the 50 items** and
every one opens with the same sentence — see §7 R1.

All **18 families sit inside their reference per-form range**, including the
tight ones (A14 exactly 3, A13 8 against 6–10).

---

## 7. Second-reader review, as structural measurements

**R1 — repeated opening clauses.** Six items open "The bar chart shows the number
of items sold on four days" (Q29, Q30, Q31, Q37, Q43, Q44) across three separate
charts. Four open "If ⟨equation⟩, what is the value of" (Q13, Q25, Q40, Q50).
Six further pairs share an opening. **12% of the form opens with one sentence.**

**R2 — the same function definition twice.** Q15 and Q47 both define
`f(x) = 2x + 4`. This is defect D3 from P2, recurring: the content detector
compares math spans of 12 characters or more and this one normalises to nine.
The threshold exists so that `y = mx + b` is never compared; it is now measured
to be one character too generous in the other direction.

**R3 — repeated mathematical objects.** One (`bar-compare-single`, Q29 and Q37),
inside the reference allowance of one repeat per form. P2 had two.

**R4 — three readings of one display.** Q29, Q30, Q31 read the same bar chart at
depths 2, 2 and 2. The distinct-depth rule is a preference, not a requirement —
enforced hard it starved three of fifty slots — so a repeat at one depth is
permitted. This is a weakened form of P2's D9.

**R5 — no repeated option grids and no repeated numeric tuples.** The content
detector holds on everything it covers.

**R6 — a mechanism that exists only nominally, in 4 of 16 mechanism items.**

| item | sub-form | blind RLx | blind band | generator said |
|---|---|---:|---|---|
| Q2 | `P-SCOPE/residual_referent` | 7 | **Entry** | Stretch |
| Q4 | `P-NORMALISE/vertex_form` | 11 | Core | Stretch |
| Q8 | `P-DECOY/shared_terms_cancel` | 11 | Core | Stretch |
| Q11 | `P-CLASSIFY/inequality-direction` | 11 | Core | Peak |

All four are load-bearing under `assess()` — a mechanism-blind route does land
on a printed distractor and the counterfactual does move the key. They are
nonetheless *easy items*, and Q2 at RLx 7 is an Entry item occupying a Stretch
slot. **`assess()` proves a mechanism is present; it does not prove the item is
hard**, and that gap is the single largest contributor to Peak 9 against 14.

**R7 — routine items above Entry, in 4 of 17.** Q22 (sum of roots) Core, Q32
(absolute-value interval) Stretch, Q43 (claim about a chart) Core, Q49 (expand
and collect) Core. This is the desirable direction and it is what the corpus
does; recorded for symmetry with R6.

**R8 — the artificial target multiplier persists.** Q05 asks for
`−2(a/b)`. P2's D8, unchanged.

**R9 — one option set renders with mixed math delimiters.** Q32's interval
option prints `x < -2$ or $x > 10`, the standard LaTeX idiom for prose inside
math mode. Consistent with the file's existing convention; noted, not a defect.

---

## 8. Series capacity — the decisive measurement

The Coverage Revision recorded that the library covers 40.7% of the reference
vocabulary and said the series question needed its own evidence. This is that
evidence: **25 forms were assembled** — not published, not frozen, not written
anywhere — and the mathematical objects each one asks were compared.

### 8.1 What was measured

| | measured | reference |
|---|---:|---:|
| forms that filled 50/50 | **23 of 25** | — |
| distinct objects the pool can build | 90 | — |
| distinct objects used across 25 forms | **74** | — |
| object-slots the series needs | 1,250 | 200 for four forms |
| distinct objects per item-slot | **0.059** | **0.945** |
| mean uses per object across the series | **16.9** | ~1.05 |
| objects appearing in **every** one of the 25 forms | **32 of 74** | — |
| objects appearing in more than one form | **71 of 74 (96%)** | **7 of 191 (3.7%)** |
| **pairwise object overlap between two forms** | **41.7 of 50 (83%)**, min 35, max 49 | **~1 of 50 (~2%)** |

### 8.2 What that means for a student

A student sitting any two forms of this series meets, on average, **41.7 of the
same 50 mathematical objects** — the same theorem, the same configuration, the
same decision — in a different set of numbers. Across the four reference forms
the same student meets about one.

Thirty-two objects appear in **all twenty-five forms**, among them
`no-solution-parameter`, `special-triangle-45`, `remainder-theorem-composite`,
`vertex-form-complete-square`, `parallel-parameters-composite` and
`exponent-common-base`. Every form in the series contains each of them.

### 8.3 The ceiling

- **Forms before any object must repeat across the series: one.** 74 usable
  objects against 50 slots per form.
- **Objects needed for 25 forms at the corpus's own reuse rate: about 1,206.**
- **The library has 74. Shortfall: 16.3×.**

### 8.4 The direct answers to the question as asked

> *maximum number of forms before meaningful structural reuse becomes
> unavoidable*

**One.** The second form necessarily repeats objects from the first, and at 25
forms every object is used about seventeen times.

> *expected object/archetype reuse across 25 forms*

**16.9 uses per object.** 96% of objects appear in more than one form; 43% appear
in all of them.

> *whether object-level diversity is merely an individual-form gate*

**It is exactly that, and nothing more.** `objectDiversity()` polices repetition
*inside* one form and is silent across forms. P3 scores 49/50 on it while
sharing 83% of its objects with the next form in the series. The per-form gate
and the series question are different measurements, and only the first exists.

> *whether the same mathematical species will recur too frequently across the
> series*

**Yes, by a factor of about sixteen.** Not marginally, and not fixable by
tuning: it needs an order-of-magnitude larger object library.

---

## 9. Verdict

### PASS / **CONDITIONAL** / FAIL

**CONDITIONAL — another library revision is required before series scaling.**

**Why not PASS.** Every single-form gate passes and every mechanical check is
clean, but the brief's own rule applies exactly: *"If P3 passes the single-form
gates but the 25-form series-capacity analysis shows substantial structural reuse
risk, classify it CONDITIONAL, not PASS."* An 83% pairwise overlap against a
reference of 2% is not a marginal risk; it is the central finding of this stage.

**Why not FAIL.** Nothing here is a fundamental generator problem. The
architecture holds: three streams with three contracts, 50/50 on 23 of 25
arbitrary seeds, every mechanism item load-bearing, every stream contract
re-checked per item, zero clone and zero content collisions, and the one
confirmed correctness defect fixed and re-verified in a fresh population. The
difficulty profile is stable at RLx 11.66 against a reference 13.01 and moving in
the right direction across three prototypes. What is missing is **capacity**, and
capacity has a known shape and a known size.

### 9.1 What must change before a PASS is possible

1. **The object library must grow by roughly an order of magnitude.** 74 usable
   objects support one form. Supporting 25 at the corpus's reuse rate needs
   ~1,200; supporting 25 at a defensible relaxation — say each object in at most
   3 of 25 forms — needs ~420. Either number is a different scale of work from
   anything in this programme so far, and it is the only thing that moves the
   series measurement.
2. **A series-level object ledger.** Nothing currently records what earlier forms
   asked. Per-form diversity is enforced; cross-form diversity is not measured,
   let alone constrained.
3. **The Peak shortfall (9 against 14) and the mechanism items that code Entry
   or Core** (§7 R6). `assess()` proves a mechanism is present, not that the item
   is hard; a second, difficulty-facing check is needed for the mechanism stream.
4. **The equation target, which exists in the library and reached no slot**, and
   the residual 80% value share against 64–76%.
5. **The content detector's 12-character equation threshold**, which let
   `f(x) = 2x + 4` through twice.

### 9.2 What this stage does NOT authorise

Forms 2–25 were not generated and are not authorised. P3 is a measurement
prototype: it is not published, not exposed to students, and a passing set of
single-form gates is explicitly not production approval.

**Stop here.**

---

## Artefacts

| what | where |
|---|---|
| P3 payload, identity, blind render, blind codes, analysis, series study | outside this repository |
| the generator, gates and object layer | `scripts/est-*.mjs` |
| mutation suites | `tests/est-*.test.mjs` |

Committed as `27fe881`.
