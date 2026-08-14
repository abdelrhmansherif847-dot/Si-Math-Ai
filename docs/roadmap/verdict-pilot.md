# Verdict Pilot — P1 foundation

> **Status:** P1 only. Offline, not deployed, not imported by the Edge Function.
> **Branch base:** `main@d995892`. **0 migrations. 0 deployment.**

## Naming

This is the **Verdict Pilot**, not "Phase 3". `docs/roadmap/phase-3-*.md` — five
documents — already mean **AI Economics Phase 3**, which shipped and was
deployed. Reusing that number would make the roadmap unreadable. The one file
that does carry the old name, `tests/fixtures/phase3-pilot-engines.json`, keeps
it because it was specified that way in the brief; nothing else does.

## The idea

Zero owns routing, evidence, verification and the verdict. Models are
interchangeable reasoning engines that supply evidence and nothing else.

P1 is the smallest foundation that makes that possible: a substitutable engine
contract, a deterministic replay engine, and one normalized output shape. It
decides nothing.

## The one property P1 exists to establish

**A mathematical value and a multiple-choice label are different facts.**

Q79 is the case that forced it:

```
|n - 1| < 4   ->   -4 < n - 1 < 4   ->   -3 < n < 5
n ∈ {-2, -1, 0, 1, 2, 3, 4}   ->   7 values
```

An engine can derive `7` perfectly and then publish the wrong letter:

```
CORRECT REASONING -> CORRECT RAW ANSWER -> WRONG CHOICE MAPPING -> WRONG FINAL ANSWER
```

Stored as one flat "final answer" string, that failure is **invisible** — the
answer looks stated, the reasoning looks sound, and the turn is wrong for a
reason nothing in the system can see. So the normalized output carries four
independent fields:

| field | what it is |
|---|---|
| `raw_answer` | the value the engine derived — `"7"`, `"26/5"` |
| `choice_letter` | the label it published — `"C"` |
| `choice_index` | that label's index, by pure syntax (`A`→0) — **never** derived from the value |
| `final_answer` | what it published, verbatim |

`choiceMappingConsistency(output, choices)` returns `consistent | mismatch |
unknown` and is what makes the Q79 mismatch **checkable** rather than merely
representable. `"7"` and `"C"` are never the same piece of information.

**`unknown` is not `consistent`.** When either fact is absent, or the item has
no choices, silence is reported as silence. Treating absence as agreement is how
a gap becomes a false confirmation.

## What P1 contains

```
supabase/functions/_shared/evidence.core.ts
  SolverInput · RawEngineResponse · SolverOutput · ReasoningEngine
  letterToIndex / indexToLetter        pure label syntax
  normalizeSolverOutput                one reply -> the normalized shape
  choiceMappingConsistency             the Q79 check
  createReplayEngine                   deterministic fixture replay
```

**Two enforced properties:**

- **Independence.** `solve(input)` takes the question and nothing else. There is
  no parameter through which one engine could see another's answer, so
  "models solve independently" is guaranteed by the type rather than by
  discipline. A later phase wanting cross-examination must add a parameter in
  the open.
- **Determinism.** No network, no clock, no randomness, no imports. Identical
  input yields byte-identical output, which is what lets every downstream suite
  be hermetic and free.

## What P1 deliberately does not contain

No Evidence Builder, Disagreement Analyzer, Verdict engine, routing, cache or
confidence — **not even as skeletons.** An empty container invites being filled
before its requirements are known. Each arrives in its own PR when what it must
do is actually understood.

**No voting.** Agreement is evidence, not proof. A deterministic result can
outweigh several correlated model answers. Nothing counts agreement.

**No correctness and no benchmark.** The module records what an engine said and
never judges whether it was right. The fixture is hand-written, encodes no score
and no "correct" engine, and the 106-question sheet's answer key is **not**
established ground truth — the repeated disagreement items (28, 39, 43, 48, 51)
may be a bad key, OCR damage, ambiguous wording or a shared misconception rather
than model failure. P1 encodes none of it.

**No live providers.** Only the replay engine. Adding a real provider is a
separate decision, one at a time.

## Offline by construction

The deployed bundle is exactly what `ai-tutor/index.ts` imports. It does not
import `evidence.core.ts`, and neither does `verification.core.ts`, so this
module is not in the four-file bundle and cannot change production behaviour.
`reasoning-engine-contract.test.mjs` §E7 asserts all three — "it doesn't today"
is an observation; a test is a guarantee.

The module also imports nothing, which keeps it free of
`verification.core.ts`'s module-scope `Deno.env` read and keeps its tests
runnable under plain Node.

## Reuse, when the time comes

P1 needs a narrow operation — splitting one published answer into its value and
its label — which is why it is separate rather than duplicated. When the
Evidence Builder needs to compare two answers for **equivalence**, it should
reuse `answersEquivalent` from `verification.core.ts` (already tested, already
in production) instead of reinventing it.

## Relationship to RC2

None, and deliberately so. RC2's R9 evidence record is live in production at
platform version 144; PR2 (R1 admissibility) and PR3 (the Verdict Envelope)
are unstarted. This pilot touches none of it — no RC2 file is modified, and the
RC2/R9 evidence contract is untouched.

## Tests

| suite | covers |
|---|---|
| `tests/evidence-normalizer.test.mjs` | the four-field separation, Q79, partial statements, prose, absence, determinism, malformed input |
| `tests/reasoning-engine-contract.test.mjs` | contract shape, independence, replay determinism, substitutability, the offline guard, no-voting/no-ranking |

Mutations proving they bite — collapse `raw_answer` into the published string;
derive the index from the value; report `consistent` when a fact is missing;
invent a label; let a bare letter count as a value; add a peer-output parameter
to `solve()` — each turns the suites red.

---

# P2 — Evidence Builder

> **Status:** complete, offline, not deployed, not imported by the Edge Function.
> **0 migrations. 0 deployment.**

P2 answers one question: **what evidence exists in the submitted independent
outputs?** It does not decide truth, publish an answer, pick a winner, score
anything, or hold a verdict.

## The inference that cannot exist here

```
A says 7 · B says 7 · C says 7   ->   "therefore 7 is true"
```

Agreement may *be* evidence; agreement is never proof. `UNANIMOUS-WRONG-1` in
the fixture is three engines agreeing on a wrong value — a correlated error,
which is exactly what a majority vote would promote to truth. B14 proves P2
records the agreement and cannot mark it verified.

## Count-agnostic — the part that was easy to get wrong

Future routing starts with one cheap engine and escalates only when evidence is
insufficient, so P2 is correct at N = 0, 1, 2, 5 and the count never means
anything:

- **One engine is not agreement.** Absence of divergence is not agreement.
  Agreement requires **≥ 2 engines that actually stated the field**. A lone
  engine recorded as "agreeing" would be corroborated by nobody.
- **`MISSING_OBSERVATION` is about fields, not engines.** It marks a field absent
  inside a submitted output. P2 has no notion of a missing *engine*, no expected
  count and no minimum — "how many engines are enough" is a routing decision,
  and encoding it here would put escalation policy in the evidence layer.
- **Count is not quality.** No sufficiency, confidence, strength or escalation
  signal emerges from more engines. Every record exposes the same fields at N=1
  and N=5.

`buildEvidence` is a pure function of the **current** set. The router escalates
by calling it again with more outputs; the builder never learns that happened,
holds no accumulator, and has no prior-evidence parameter.

## Schema

```
EvidenceRecord { type · engines · fields · observed · basis }
```

`engines` is who produced it, `fields` is which normalized field it came from,
`basis` is the deterministic comparison that produced it — so a later resolver
can always ask *why does this evidence exist?* and recover the answer.

There is deliberately **no strength or weight**. A number here would be summable,
and summable is one refactor away from a vote. Weighting is a resolver policy,
not an observation.

Types, in the exported `TYPE_ORDER` that also fixes output ordering:
`ENGINE_OBSERVATION · ENGINE_IDENTITY_CONFLICT · MISSING_OBSERVATION ·
MAPPING_CONSISTENCY · RAW_ANSWER_AGREEMENT · RAW_ANSWER_DIVERGENCE ·
CHOICE_AGREEMENT · CHOICE_DIVERGENCE`.

Raw answer and choice label are compared **separately and never merged** — a
value and a label are different facts, and an engine can be right about one and
wrong about the other. That is Q79, carried from P1 into cross-engine evidence.

## Comparison is literal

Two engines saying `9/4` and `2.25` are recorded as **divergent**, with both
values preserved. Deciding those are the same answer is interpretation, and
interpretation belongs to a later stage. Nothing is lost — the raw values sit in
`observed`, so a semantic pass can run later without re-running this one. When
that pass is built it should reuse `answersEquivalent` from
`verification.core.ts`, which is deliberately **not** imported here: that module
reads `Deno.env` at module scope, which would make this file unloadable under
plain Node and drag the offline pilot toward the deployed runtime.

## Engine identity

`SolverOutput` carries `provider` and `model` but no identity of its own, and
provider+model cannot distinguish two engines that differ only by temperature —
which is exactly the current production configuration. So P2 takes
`{ engine_id, output }` submissions: the caller (the future router) knows which
engine it called. P1 is unchanged.

## Permutation-invariant

Output is sorted by an explicit key, so submission order cannot change it — which
also means **no engine can become implicitly authoritative by being passed
first**. Submission order stays recoverable from the `ENGINE_OBSERVATION`
records, so nothing is lost.

## Tests and mutations

`tests/evidence-builder.test.mjs` — **112 assertions**, B1–B21. All 14 planned
mutations killed, source restored byte-identically (sha256) after each:

| | mutation | | mutation |
|---|---|---|---|
| M1 | drop minority engines | M8 | input order leaks into ordering |
| M2 | collapse raw_answer and choice_letter | M9 | suppress the Q79 mismatch |
| M3 | unanimity becomes VERIFIED | M10 | merge duplicate engine ids |
| M4 | `>= 2` adds a verdict field | M11 | agreement from ONE engine |
| M5 | strip provenance | M12 | `MISSING_OBSERVATION` for "too few engines" |
| M6 | emit in insertion order | M13 | confidence derived from count |
| M7 | stop recording missing fields | M14 | require N ≥ 2 |

Loading note: this module has a real relative import, and `importTS` writes
source to a temp directory where `./evidence.core.ts` would not resolve — so its
suite imports the module by real path instead.

## Still not built

No P3 disagreement classification, no P4 verifier logic, no verdict, no
`VERIFIED` state, no voting, no winner selection, no confidence, no routing, no
escalation, no cost or latency policy, no model ranking, no live providers, no
production integration.

*(P3 landed after this section was written; the rest of the list still stands.)*

---

# P3 — Disagreement Analyzer + correlated-error metrics

> **Status:** complete, offline, not deployed, not imported by the Edge Function.
> **0 migrations. 0 deployment. 0 production changes.**

P3 adds two pure capabilities: a classifier for **why** outputs differ, and
metrics for **how far engines fail together**. It classifies and measures. It
decides nothing.

## The honesty rule that shaped the classifier

Most disagreement causes cannot be derived from the evidence P1 and P2 actually
produce. Deciding that two engines differ because of an ALGEBRA slip rather than
an ARITHMETIC one means reading their prose and judging it — a model's opinion,
not a deterministic fact. A classifier that guessed would emit confident labels
with nothing behind them, which is **worse than no label**: it would look like
evidence.

So the vocabulary is deliberately wider than what this module will ever assign.
Four categories have a deterministic basis today:

| category | the rule that assigns it |
|---|---|
| `CHOICE_MAPPING` | an engine's own label does not point at its own value, **or** engines that agree on the value publish different labels |
| `ANSWER_EXTRACTION` | an engine published a final answer from which no value could be recovered |
| `MISSING_INFORMATION` | a field is absent inside a submitted output |
| `MODEL_DISAGREEMENT` | values genuinely diverge and nothing deterministic explains it |

`INTERPRETATION`, `ARITHMETIC`, `ALGEBRA`, `GEOMETRY` and `TRANSCRIPTION` are
**RESERVED**: named in the type and exported in `RESERVED_CATEGORIES`, never
assigned. They need a verifier or a reasoning analysis that does not exist yet.
They are listed so a later phase with a real basis has a name to use — and so
the suite can prove none is emitted rather than trust a comment.

**`MODEL_DISAGREEMENT` is the honest unresolved bucket**, not a fallback that
hides a guess. Its `basis` says so verbatim:
`raw_answers_diverge_no_deterministic_cause`.

**Cross-engine `CHOICE_MAPPING` is the point of the classifier.** When engines
derived the same value and published different labels, the value is *not* in
dispute — the mapping is. Calling that a model disagreement would misattribute
it, and would send a router escalating to more models over a bug that more
models cannot fix. That is Q79 again, now visible across engines.

Every finding carries `basis`, so a reader can always ask *why does this label
exist?* and get an answer that is not "a model thought so".

## The two rules that keep the metrics honest

- **Agreement is not correctness.** Engines agreeing tells you they agree.
  `pairwiseAgreement` needs no reference and uses none; it never produces an
  error count.
- **An error requires an independent reference.** "Wrong" is undefined without a
  separately verified answer. Items with no reference contribute to agreement
  statistics and are **excluded from every error statistic** — not counted as
  correct, not counted as incorrect, simply not counted, and reported in
  `excluded_no_reference`.

**Undefined is reported, not invented.** `phi` is the 2×2 correlation of
(*a* wrong, *b* wrong) and returns `null` **with a reason** whenever the data
cannot support it — `no_paired_items_with_reference`, `sample_too_small`,
`degenerate_margin_zero_variance`. Returning `0` there would read as
"uncorrelated", a claim the sample does not make.

`sharedErrorPatterns` surfaces the items where engines failed **together** —
precisely the pattern a majority vote would promote to truth. `UNANIMOUS-WRONG-1`
in the fixture is exactly that shape.

## No benchmark score is encoded

The preliminary per-model figures from the 106-question sheet are **not** ground
truth and appear nowhere in the module, the fixture or the tests. No model name,
no provider name, no ranking. `BenchmarkItem.reference` is supplied by the
caller when an independent verifier produced one, and is absent otherwise.

## Offline by construction

Both imports are `import type`, so they are erased at runtime and the module
pulls in nothing. No clock, no randomness, no I/O, no throw. Nothing in the
deployed bundle imports it: `evidence.core`, `evidence-builder.core` and
`disagreement.core` each have **zero** references in `index.ts` and
`verification.core.ts`, asserted rather than observed.

`literalKey` duplicates three lines of P2's normalizer rather than exporting it
from there. Modifying a P2 source file for a trivial helper is a worse trade
than a small self-contained copy — and P3's notion of "same string" may
legitimately diverge from P2's later.

## Tests and mutations

| suite | assertions | covers |
|---|---|---|
| `tests/disagreement-analyzer.test.mjs` | 81 | D1–D12: the four assignable categories, the reserved five never emitted, cross-engine vs own-engine mapping, N=1 has nothing to classify, ordering, purity, offline |
| `tests/correlated-error-metrics.test.mjs` | 61 | C1–C10: agreement without reference, error only with reference, exclusion accounting, phi and each null reason, unanimous/shared wrong, N=1/2/5, purity |

**All 15 mutations killed** (N1–N15), source restored byte-identically after
each: emit a reserved category · guess a cause from prose · treat cross-engine
mapping as model disagreement · drop `basis` · classify at N=1 · read silence as
disagreement · emit in construction order · count an unreferenced item as
correct · count it as wrong · return `phi = 0` instead of `null` · drop the
exclusion counters · let an abstention count as disagreement · hard-code an
engine count · promote unanimous-wrong to a verdict · derive confidence from
agreement.

**Mutation testing found three genuine test gaps**, which is the point of doing
it — the suites were green before and would have stayed green:

- **N1** (an extra field smuggling a guessed category) survived because no
  single fixture item produced `MODEL_DISAGREEMENT`. Fixed by adding a
  mixed-case sweep item.
- **N8** (unsorted output) survived because construction order coincidentally
  matched declared order. Fixed by adding three letter-only engines submitted in
  reverse.
- **N13** (a hard-coded count of 3 engines) survived because the fixture had
  exactly 3. Fixed by adding N=2, N=5 and N=1 unanimous-wrong cases.

Two further mutations were broken rather than surviving — one missed its anchor,
one was a no-op — and were rewritten before being counted. All 15 then killed.

## One thing found and deliberately not fixed

P3's D9c originally compared a **flat** sort key `` `${engines}|${fields}|${observed}` ``
against the module's component-wise ordering. Those disagree: `|` (124) sorts
after `,` (44), so a flat key can order two records differently from comparing
their components in sequence. The module's ordering was verified correct and the
**test** was fixed.

**P2's B8 carries the same latent fragility.** It is not failing today, and
fixing it would mean editing an existing P2 test file, which the P3 brief put
out of scope. Recorded here so it is fixed deliberately rather than discovered
during an unrelated change.

## Still not built after P3

No P4 verifier logic, no verdict, no `VERIFIED` state, no voting, no winner
selection, no confidence, no sufficiency, no routing, no escalation, no cost or
latency policy, no model ranking, no live providers, no production integration.
