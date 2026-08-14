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

*(P4 landed after this section was written and delivered the first three items
as CONTRACTS ONLY — see below. Everything else in the list still stands.)*

---

# P4 — Verifier contract · verdict state contract · item cache key

> **Status:** complete, offline, not deployed, not imported by the Edge Function.
> **0 migrations. 0 deployment. 0 production changes.**

P4 defines **how a future deterministic mathematics tool supplies evidence**, and
how the result of that is represented and identified. It supplies no evidence and
decides nothing.

There is **no SymPy, no CAS, no Python, no subprocess, no container and no
external service**, and no dependency was installed. What exists is the shape
those will fill.

## Three modules, one-way dependencies

```
deterministic-verifier.core.ts        ← base: contract, canonicalization, table stub
        ↑                       ↑
verification-cache-key.core.ts   verdict-state.core.ts
```

The separation is structural, not stylistic. **The verifier module does not
contain the verdict vocabulary and does not import the module that does**, so a
verifier cannot name a verdict — let alone assign one. A test asserts that edge
in both directions rather than trusting the layering to hold by habit.

Canonicalization lives in the base module and is used by all three, so P4 has
**one** definition of "the same string". If a cache key and a dispute comparison
ever disagreed about that, a stored result would be served for an item the
dispute logic considers different. That is deliberately *not* a fourth copy of
P2/P3's `literalKey`, and it required no change to P2 or P3.

## A. The deterministic verifier contract

```
CANDIDATE ANSWER + ORIGINAL QUESTION / STRUCTURED PROBLEM
                        ↓
                DETERMINISTIC VERIFIER
                        ↓
                VERIFICATION EVIDENCE
```

**The sentence the whole phase turns on:** a verifier reporting `verified` means
**one deterministic check succeeded for one candidate**. It does not mean the
item's verdict is `VERIFIED`. Those are different words in different modules on
purpose — lowercase outcome here, uppercase verdict state there.

**Support and outcome are two axes, and that is the safety property.** The
dangerous failure is a verifier that *could not run* being read as a verifier
that *agreed*. `buildVerificationResult` enforces the relationship instead of
documenting it:

| situation | forced result |
|---|---|
| `unsupported` | `not_attempted`, evidence dropped, reason required |
| supported, reported nothing | `inconclusive` — silence is not success |
| supported, unrecognized outcome | `inconclusive` — never a pass |
| no candidate | `insufficient_information` |
| no subject | `insufficient_information` |

No path through the constructor turns an absent check into `verified`, **including
one that explicitly asks for it** — a report of `{support: 'unsupported', outcome:
'verified'}` is corrected, because the absent check is the fact and the claim is
not. Every non-decisive outcome carries a reason.

**Independence is enforced by the type.** The request carries the question and
the candidate. There is no field for what other models said, how many there were,
or what they agreed on. A verifier that could see those would be contaminated by
them, and "the verifier contradicts every model" would stop being evidence and
become an echo. A later phase wanting cross-examination must add a parameter in
the open.

`createTableVerifier` **performs no mathematics.** It replays a committed table
exactly as P1's replay engine replays fixture text. A supported item with no row
is `inconclusive` with a stated reason: absence of an entry is absence of
evidence, never agreement.

## B. The verdict state contract

Six states are representable — `VERIFIED`, `HIGH_CONFIDENCE`, `LOW_CONFIDENCE`,
`AMBIGUOUS`, `INSUFFICIENT_INFORMATION`, `ITEM_DISPUTED` — and **nothing decides
which one applies.**

`createVerdictEnvelope` is a recorder whose `state` is always `null`; it has no
branch that can produce any other value. `withVerdictState` carries a state a
later phase has already chosen and chooses nothing itself — but it **refuses an
assignment whose author is not named**, so "who decided this, and on what basis"
can never be lost.

### The case the contract exists for

A deterministic verifier contradicts a candidate **every model agreed on**.

A majority vote resolves that by promoting the models — precisely how a
correlated error becomes truth, which is what P3's `UNANIMOUS-WRONG-1` exists to
show. A verifier-always-wins rule resolves it the other way, assuming the
verifier read the problem correctly; a verifier checking a misread question is
confidently wrong in exactly the same way.

**Both are decisions, and P4 makes neither.** It records a dispute holding both
sides in full, with `resolution: null` and `resolved_by: null`. Nothing in the
structure privileges either side — no weight, no precedence, no flag — and the
suite scans the serialized envelope for `winner`, `prevail`, `authoritative`,
`override` and finds none.

**A dispute is observed, never inferred.** Only an explicit `contradicted`
outcome creates one, and only when some model actually stated the candidate that
was contradicted. "The verifier verified X, therefore Y is wrong" is an inference
this layer must not make: X and Y may be two renderings of one answer.

The model side collects aggregate agreement records **and** individual
observations with no branch between them. Preferring one when the other exists
would be a branch on how many models there were — and the count is not allowed to
change what gets recorded.

## C. The item cache key

A deterministic, content-addressed key. **No table, no migration, no persistence**
— nothing reads or writes anything.

**The asymmetry that decides every choice:** over-splitting costs a cache miss;
under-splitting serves a stale verification for a *different* item — a wrong
answer delivered with a verifier's authority behind it. So every doubt resolves
toward splitting:

- **Case is part of the question.** `X` and `x` can be different variables.
- **Choice order is part of the key.** Reordering options changes what "C" means —
  Q79's failure mode reaching the cache layer.
- **The verifier's version is in the key.** Without it, a verifier that has been
  fixed serves its own old defect out of cache forever.
- **The policy version is in the key.** Changing what verification *means* must
  invalidate what it previously concluded.

**What the key cannot see, structurally rather than carefully:** the material is
assembled from `CACHE_KEY_FIELDS`, an explicit allow-list. An undeclared property
is not filtered out — it is never read, and nothing stringifies the input object.
The suite passes an input stuffed with `timestamp`, `student_id`, `session_id`,
`request_id`, `nonce`, `attempt`, `engine_count` and submission order, and
requires the material to be **unchanged byte for byte**.

Engine count and execution order need no defending at all: **there is no such
input.** The key describes the item and the verifier, never the models, which is
why it is equally valid at N = 0 and N = 5 without mentioning either.

**The material is the contract; the digest is a handle.** `cacheKeyMaterial`
returns the inspectable canonical pre-image; every field is length-prefixed, so
no value can impersonate a field boundary — without that, `["a","b"]` and
`["a|b"]` are one cache entry. The digest is FNV-1a/64, a content-addressing
function and explicitly not a security primitive.

## Count-agnostic, inherited and re-proven

N = 0, 1, 2, 3, 4, 5 all produce the same envelope key set, no verdict, and no
count-derived field. **N = 1 against a verifier is still a dispute** — the
contract is about sides, not counts. The engine count is provenance (who observed
what) and never becomes confidence, sufficiency, quality or truth.

## Tests and mutations

Tests were written **before** the modules and confirmed to fail with
`ERR_MODULE_NOT_FOUND` on the three P4 files — the contract did not exist.

| suite | assertions | covers |
|---|---|---|
| `tests/deterministic-verifier.test.mjs` | 93 | V1–V11: contract shape, each of the five states explicit, provenance on every path, determinism, independence, totality, offline |
| `tests/verdict-state-contract.test.mjs` | 119 | W1–W9: six states representable, no selection, the unanimous-contradiction case, dispute never inferred, N=0–5, permutation invariance, one-way layering |
| `tests/verification-cache-key.test.mjs` | 77 | K1–K11: stability, every relevant input moves the key, forbidden metadata ignored, unforgeable field separation, declared allow-list, N-blindness |

**26 mutations, all killed**, source restored byte-identically (sha256) after
each:

| | | | |
|---|---|---|---|
| M1 unsupported → verified | M8 unsupported keeps evidence | M15 unanimity suppresses dispute | M22 length prefixes dropped |
| M2 silence → verified | M9 missing row → verified | M16 unnamed assigner defaulted | M23 whole input stringified |
| M3 unrecognized → verified | M10 interpretation always present | M17 any string is a state | M24 policy version omitted |
| M4 no candidate → verified | M11 unanimity → `VERIFIED` | M18 verifier version omitted | M25 digest silently changed |
| M5 verifier version dropped | M12 verifier wins the dispute | M19 timestamp in the key | M26 format marker changed |
| M6 candidate provenance dropped | M13 models win, verifier dropped | M20 student/session in the key | |
| M7 non-deterministic method | M14 confidence from count | M21 choice order ignored | |

### What mutation testing found

All 26 killed on the first pass — which is exactly when a harness deserves least
trust, so two **control** mutations were run to prove it can report a survivor at
all. It can, and one of them exposed a real gap:

**C2 — changing the FNV offset basis survived.** Every other assertion in the
cache-key suite is *relative* ("these two differ", "these two match"), and every
relative assertion survives a changed hash function because both sides move
together. A persisted cache does not have that luxury: silently re-keying
invalidates every stored entry while the suite reports green. Fixed by pinning the
canonical material and the digest to golden values (§K1b), which makes the key a
**cross-version** contract rather than an intra-run one. Re-running turned C2 red;
it and the format-marker mutation became M25 and M26.

**C1 — renaming an internal local — still survives, deliberately.** It is a pure
refactor, and it is the control that proves the other 26 kills are real rather
than an artifact of a harness that reports everything as dead.

## Boundaries held

`index.ts`, `verification.core.ts`, `telemetry.core.ts` and `taxonomy.core.js` are
unchanged and none imports any pilot module. No P1/P2/P3 source file was modified
— the STOP-and-report clause was never triggered. No fixture changed. No
migration. No deployment. No production behaviour touched.

## Still not built after P4

No real verifier — no SymPy, CAS, Python, subprocess or service. No verdict
selection, no truth authority, no evidence sufficiency, no confidence scoring, no
voting, no winner selection, no escalation, no routing, no cost or latency policy,
no model ranking, no live providers, no persistent cache, no production
integration.

*(P5 landed after this section was written and supplied one narrow real verifier.
Everything else in the list still stands.)*

---

# P5 — the first real deterministic algebra verifier

> **Status:** complete, offline, not deployed, not imported by the Edge Function.
> **0 migrations. 0 deployment. 0 production changes.**

P1–P4 built contracts. P5 actually verifies something: it substitutes a rational
candidate into a linear equation in one variable and compares both sides in exact
arithmetic.

**And it is still only evidence.** A `verified` here means one deterministic check
succeeded for one candidate. It is not a verdict, not truth, and not authority
over the models.

## There is no CAS, and nothing pretends there is

Checked rather than assumed, before any code was written:

| | |
|---|---|
| `python3` | present |
| **`sympy`** | **not installed** |
| CI | `setup-node` → `node tests/run-all.mjs`. **No install step at all** |
| Dependencies | no `package.json`, no `deno.json`, no import map — dependency-free by design |
| Deployed runtime | Supabase **Deno** Edge Function — cannot spawn a Python process |

A SymPy-backed verifier would fail in CI even if installed locally, and could
never run where verification eventually needs to run. So there is no symbolic
algebra system here and **nothing is labelled as though there were**. What exists
instead: a hand-written recursive-descent parser over a deliberately tiny grammar,
and exact rational arithmetic in `BigInt`. Narrow and genuinely deterministic
beats broad and pretending.

## The problem arrives structured — this verifier never reads the prose

The equation comes from P4's `subject.interpretation`:

```
{ type: 'linear_equation', equation: '3x + 7 = 22', variable: 'x' }
```

Deciding what a photographed, OCR'd, model-paraphrased question *means* is a
different problem — and it is the one this product actually gets wrong. Handing a
verifier a guess to check would launder that guess into a deterministic result,
which is worse than not checking at all. A test asserts that changing
`question_text` while holding the interpretation fixed changes nothing.

## The supported subset, exactly

One `=` · the grammar `{ + - * / ( ) digits . single-letter variables }` ·
implicit multiplication (`3x`, `2(x+1)`) · exactly one variable matching the
declared one · degree ≤ 1 in it · never in a denominator · candidate a rational
(`5`, `-3`, `2.5`, `5/2`, `x = 5`, `5 = x`).

Everything else is **explicitly unsupported with a named reason**, from an
exported `ALGEBRA_REASONS` list: `unsupported_operator`, `unsupported_relation`,
`multiple_variables`, `nonlinear_not_supported`, `variable_in_denominator`,
`multiple_equals`, `parse_error`, `candidate_variable_mismatch` and the rest.

Nothing outside the subset may come back `verified` — and nothing may come back
`contradicted` either. **Blaming the candidate for the parser's limits would turn
a gap in this pilot into deterministic-looking evidence against a model that may
well be right.** A sweep asserts both, over every unsupported shape.

## The degenerate cases, and why they are inconclusive

After reduction the equation is `A·x = B`:

| | |
|---|---|
| `A ≠ 0` | well posed. `verified` / `contradicted` are decisive, and a passing substitution really does mean this candidate is *the* answer |
| `A = 0, B = 0` | an identity (`2x+3 = 2x+3`). Substitution succeeds for **every** value, so success says nothing about this candidate → **`inconclusive`** |
| `A = 0, B ≠ 0` | no solution (`2x+3 = 2x+5`). Substitution fails for every value, so `contradicted` would blame the candidate for what is almost certainly a misread or OCR-damaged equation → **`inconclusive`** |

Both carry the fact in their evidence. Never a decisive result the mathematics
does not support.

## Two independent walks

`evaluateAt` substitutes and computes both sides; `reduceLinear` reduces the same
tree to `A·x + B`. They are separate on purpose, they must agree, and a guard
refuses to conclude anything if they ever do not. That is what makes "ignore one
side of the equation" a detectable change rather than a silent one.

## Safety: the input is hostile and the grammar is an allow-list

This text comes from OCR, from students typing, and from models paraphrasing.
Nothing compiles, executes, interpolates or evaluates any part of it — no dynamic
code, no shell, no regular expression built from input, no property lookup keyed
by parsed text. Every unrecognized character is refused **by name**; length (512)
and nesting (32) are bounded.

The safety suite proves it twice: it feeds the parser 16 code-shaped inputs — as
equations *and* as candidates — against a **live canary**, and asserts the canary
is untouched, no prototype polluted, nothing verified, nothing contradicted; then
it scans the source for thirteen constructs (`eval`, `Function(`, dynamic
`import(`, `require(`, `child_process`, `Deno.Command`, `fetch(`, `Deno.env`,
filesystem, string-taking timers, `new RegExp(`, shell exec, dynamic property
access from parsed text) and finds none.

**Anti-vacuity:** a verifier that refused *everything* would pass that sweep
perfectly, so a benign equation of the same shape is asserted to still verify.

## The evidence boundary, now with real mathematics behind it

> Three models agree the answer is 9. The verifier proves `3(9) + 7 = 34`, not 22.

Until now that conflict was representable with a stub. Here one side is an actual
exact-arithmetic result, and the requirement is unchanged: both survive, neither
wins. P5 does not get to declare the models wrong because it did real
mathematics, and the models do not get to outvote it because there are three of
them — a verifier can be checking a misread equation, and three models can share
one misconception.

The envelope holds `resolution: null`, `state: null`, no winner, no confidence, no
vote, at N = 0, 1 and 3, in either submission order.

**One consequence worth stating for a future router.** P4 records a dispute only
when the verifier *explicitly contradicted* the candidate the models stated.
Proving `x = 5` is the unique solution while the models said 9 produces **no**
dispute, because "verified X therefore Y is wrong" is an inference this layer must
not make. So to see the conflict, a router must ask the verifier about **the
models' candidate**, not only about its own. That is tested.

The submissions in that suite are hand-built rather than taken from the P3
fixture: `UNANIMOUS-WRONG-1` is an absolute-value inequality, which this pilot
genuinely does not support, and pairing it with an unrelated equation would be
dressing up a stub as a real check.

## Tests and mutations

Tests were written **before** the module and confirmed to fail with
`ERR_MODULE_NOT_FOUND`.

| suite | assertions | covers |
|---|---|---|
| `tests/algebra-verifier.test.mjs` | 220 | verified/contradicted, candidate normalization, whitespace, negatives, decimals, fractions, parentheses, degenerate equations, 15 unsupported shapes, P4 contract conformance, determinism, totality |
| `tests/algebra-verifier-safety.test.mjs` | 71 | hostile input against a live canary, source scan for execution paths, length/nesting bounds, 16 refused characters, anti-vacuity control |
| `tests/algebra-evidence-boundary.test.mjs` | 43 | unanimous models vs deterministic contradiction, no winner, no state, no confidence, dispute never inferred, N = 0/1/3, order invariance |

**27 mutations run, 25 killed**, source restored byte-identically (sha256) after
each — including three run against `verdict-state.core.ts`, so the P5 suite itself
proves the verdict boundary rather than leaning on P4's suite.

| | | | |
|---|---|---|---|
| A1 failed substitution → verified | A8 method dropped | A15 multiple `=` accepted | A22 parsing depends on model count |
| A2 verified/contradicted swapped | A9 degenerate → decisive | A16 mismatched candidate variable | A23 verifier wins the dispute |
| A3 one side ignored (substitution) | A10 degenerate branch skipped | A17 length bound removed | A24 confidence from model count |
| A4 one side ignored (reduction) | A11 refused operators accepted | A18 nesting bound removed | A25 success assigns `VERIFIED` |
| A5 unsupported → verified | A12 unknown chars skipped | A19 candidate stored as float | |
| A6 unsupported → contradicted | A13 nonlinear accepted | A20 rationals rendered as floats | |
| A7 verifier version dropped | A14 variable in denominator | A21 unsafe construct introduced | |

### What mutation testing found

**A20 survived the first pass, and it was a real gap.** Every fractional
assertion compared two results that would move together if the renderer started
emitting floats, and the only *pinned* rational strings were integers — so
`candidate_normalized: '2.5'` could quietly replace `'5/2'` in the record with the
suite still green. Exactly the class of gap P4's C2 exposed. Fixed by pinning the
rendering at all three sites a rational appears (candidate, unique solution,
substitution value) plus a no-decimal-point sweep over the evidence. A20 now dies
with 7 assertions red.

### Two survivors, both deliberate and both disclosed

- **C1 — renaming an internal local.** A pure refactor. It is the control that
  proves the harness can report a survivor, so the other 25 kills are real rather
  than an artifact of a harness that calls everything dead.
- **C2 — removing the internal-consistency guard.** It survives *by construction*:
  the guard is unreachable while both walks are correct, so nothing observes its
  absence on its own. It is a safety net, not a tested behaviour, and it is kept
  deliberately — a future edit that breaks one walk would trip it. Recorded here
  rather than quietly dropped from the list.

## One test-infrastructure fix worth carrying forward

The import scan in the P5 suite originally used the line-anchored
`/^\s*import\s[^\n]*/gm` pattern the P3/P4 suites use, and it **missed a
multi-line `import type { … } from '…'` entirely** — capturing only `import
type {`, which contains no module specifier. It now matches through to the
specifier instead. P1–P4's imports are all single-line so their scans are correct
today, but the pattern is latent there. Same class as P2's B8 flat sort key: noted,
not silently fixed in another phase's tests.

## Boundaries held

`index.ts`, `verification.core.ts`, `telemetry.core.ts` and `taxonomy.core.js` are
unchanged and import no pilot module. No P1–P4 source file was modified — the
STOP-and-report clause was never triggered. No fixture changed. No migration. No
deployment. RC2 and `v1-t16-golden.json` untouched.

## Still not built after P5

No geometry, statistics, probability or word-problem verification. No graph
sampling, no CAS, no quadratics, no inequalities, no systems, no radicals, no
logs. No live model routing, no verdict selection, no Truth Engine, no truth
authority, no sufficiency, no confidence, no escalation, no persistent cache, no
production integration.
