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
