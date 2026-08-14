// ═══════════════════════════════════════════════════════════════════════════
// evidence.core.ts — Verdict Pilot, P1 foundation
// ═══════════════════════════════════════════════════════════════════════════
// Zero owns the verdict. Models are interchangeable reasoning engines whose
// only job is to supply evidence. This module is the smallest foundation that
// makes that possible: a substitutable engine contract, a deterministic replay
// engine, and one normalized output shape.
//
// OFFLINE BY CONSTRUCTION. Nothing here is imported by ai-tutor/index.ts, so it
// is not part of the deployed four-file bundle and cannot change production
// behaviour. It imports nothing, performs no I/O, reads no clock and draws no
// randomness — every result is reproducible from committed inputs.
// reasoning-engine-contract.test.mjs asserts each of those, because "it doesn't
// today" is an observation and a test is a guarantee.
//
// ───────────────────────────────────────────────────────────────────────────
// THE ONE IDEA IN P1: A VALUE AND A LABEL ARE DIFFERENT FACTS
//
// Q79 is the case that forced it. |n - 1| < 4 gives -3 < n < 5, so n is one of
// {-2,-1,0,1,2,3,4} — seven values. An engine can derive 7 perfectly and then
// publish the wrong letter:
//
//   CORRECT REASONING -> CORRECT RAW ANSWER -> WRONG CHOICE MAPPING -> WRONG FINAL ANSWER
//
// Stored as one flat "final answer" string, that failure is invisible: the
// answer looks stated and the reasoning looks sound. So `raw_answer`,
// `choice_index`, `choice_letter` and `final_answer` are four separate fields,
// and `choiceMappingConsistency` makes the mismatch checkable rather than
// merely representable. "7" and "C" are never the same piece of information.
//
// ───────────────────────────────────────────────────────────────────────────
// WHAT P1 DELIBERATELY DOES NOT CONTAIN
//
// No Evidence Builder, no Disagreement Analyzer, no Verdict engine, no routing,
// no cache, no confidence. Not even as skeletons — an empty container invites
// being filled before its requirements are known. Those arrive in their own
// PRs, when what they must do is actually understood.
//
// No voting. Agreement is evidence, not proof, and a deterministic result can
// outweigh several correlated model answers. Nothing here counts agreement.
//
// No correctness. This module records what an engine said; it never judges
// whether it was right. No score, no accuracy, no ranking, no "best model".
//
// FOR LATER: when the Evidence Builder needs to compare two answers for
// equivalence, it should reuse `answersEquivalent` from verification.core.ts
// rather than reinvent it. P1 needs a narrower operation — splitting one
// published answer into its value and its label — which is why it is separate
// rather than duplicated.

/** What an engine is given. The question and nothing else.
 *
 *  There is deliberately no field for another engine's answer, no peer output
 *  and no prior verdict: independence is enforced by this type, not by
 *  convention. A later phase that wants cross-examination must add a parameter
 *  here, visibly, rather than quietly passing one through. */
export interface SolverInput {
  question_text: string;
  /** Multiple-choice options in presentation order, or null when the item is
   *  free-response. Needed to check a label against a value, never to guess
   *  one from the other. */
  choices?: string[] | null;
  image_data?: string | null;
}

/** An engine's unparsed reply, before normalization. */
export interface RawEngineResponse {
  provider: string;
  model: string;
  text: string;
}

/** The normalized shape every engine is reduced to.
 *
 *  The four answer fields are independent on purpose. Any of them may be null:
 *  an engine that stated only a letter has no value, and one that stated only a
 *  value has no label. Absent is recorded as absent — nothing is inferred to
 *  fill a gap, because an inferred mapping is exactly the error Q79 describes. */
export interface SolverOutput {
  provider: string;
  model: string;
  /** The mathematical value the engine derived: "7", "26/5", "x = 3". */
  raw_answer: string | null;
  /** 0-based index of the published label, derived from choice_letter by pure
   *  syntax (A->0). Never derived from raw_answer. */
  choice_index: number | null;
  /** The option label the engine published: "C". */
  choice_letter: string | null;
  /** What the engine actually published, verbatim, minus the marker. */
  final_answer: string | null;
  reasoning: string;
  raw_response: string;
}

/** A substitutable reasoning engine. Providers differ; this does not. */
export interface ReasoningEngine {
  id: string;
  solve(input: SolverInput): Promise<SolverOutput>;
}

const LETTERS = 'ABCDE';

/** "C" -> 2. Pure syntax; returns null for anything that is not a valid label. */
export function letterToIndex(letter: unknown): number | null {
  if (typeof letter !== 'string' || letter.length !== 1) return null;
  const i = LETTERS.indexOf(letter.toUpperCase());
  return i === -1 ? null : i;
}

/** 2 -> "C". Inverse of the above, for the same restricted alphabet. */
export function indexToLetter(index: unknown): string | null {
  if (typeof index !== 'number' || !Number.isInteger(index)) return null;
  return index >= 0 && index < LETTERS.length ? LETTERS[index] : null;
}

const FINAL_RE = /^\s*final\s*answer\s*[:=]\s*(.+?)\s*$/im;

/** The label a published answer states, if it states one.
 *
 *  Matches only label-shaped contexts — "C)", "(C)", "C.", or a bare single
 *  letter — so a stray capital inside prose cannot be read as a choice. */
function labelFrom(published: string): string | null {
  const m = /^\(?([A-E])\)?[.:)]?\s|^\(?([A-E])\)?$/.exec(published.trim());
  const hit = m && (m[1] || m[2]);
  return hit ? hit.toUpperCase() : null;
}

/** The mathematical value a published answer states, if it states one.
 *
 *  Fractions are read before bare integers so "26/5" does not become "26".
 *  A lone option letter is a label, not a value, and yields null here — which
 *  is the whole point: the two facts are extracted by separate rules. */
function valueFrom(published: string): string | null {
  const text = published
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1/$2')
    .replace(/\\[()[\]]/g, ' ')
    .replace(/\$+/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[−–—]/g, '-');
  const frac = /-?\d+(?:\.\d+)?\s*\/\s*-?\d+(?:\.\d+)?/.exec(text);
  if (frac) return frac[0].replace(/\s+/g, '');
  const num = /-?\d[\d,]*(?:\.\d+)?/.exec(text);
  if (num) return num[0].replace(/,/g, '');
  return null;
}

/** Reduce one engine reply to the normalized shape.
 *
 *  Total and side-effect free: malformed input yields an output with absent
 *  answers rather than throwing, so one bad reply cannot take down a batch. */
export function normalizeSolverOutput(
  raw: RawEngineResponse | null | undefined,
  _input?: SolverInput | null,
): SolverOutput {
  const provider = (raw && typeof raw.provider === 'string') ? raw.provider : '';
  const model    = (raw && typeof raw.model === 'string')    ? raw.model    : '';
  const text     = (raw && typeof raw.text === 'string')     ? raw.text     : '';

  const m = FINAL_RE.exec(text);
  const published = m ? m[1].trim() : null;

  const reasoning = (m ? text.slice(0, m.index) : text)
    .replace(/^\s*reasoning\s*[:=]\s*/i, '')
    .trim();

  if (published === null) {
    return {
      provider, model,
      raw_answer: null, choice_index: null, choice_letter: null, final_answer: null,
      reasoning, raw_response: text,
    };
  }

  const choice_letter = labelFrom(published);
  return {
    provider, model,
    raw_answer:    valueFrom(published),
    choice_index:  letterToIndex(choice_letter),
    choice_letter,
    final_answer:  published,
    reasoning,
    raw_response:  text,
  };
}

/** Does the published label point at the derived value?
 *
 *  'mismatch' is the Q79 signature — a correct value published under a label
 *  that maps to something else. 'unknown' when either fact is absent or the
 *  item has no choices: silence is not agreement, and must never be reported as
 *  'consistent'. */
export function choiceMappingConsistency(
  out: SolverOutput | null | undefined,
  choices: string[] | null | undefined,
): 'consistent' | 'mismatch' | 'unknown' {
  if (!out || !Array.isArray(choices)) return 'unknown';
  const { raw_answer, choice_index } = out;
  if (raw_answer === null || choice_index === null) return 'unknown';
  if (choice_index < 0 || choice_index >= choices.length) return 'unknown';
  const at = valueFrom(String(choices[choice_index] ?? ''));
  if (at === null) return 'unknown';
  return at === valueFrom(raw_answer) ? 'consistent' : 'mismatch';
}

interface ReplayFixture {
  items: Array<{
    id: string;
    question_text: string;
    choices?: string[] | null;
    engines: Record<string, RawEngineResponse>;
  }>;
}

/** A deterministic engine that replays committed fixture text.
 *
 *  No network, no clock, no randomness — the same input always yields the same
 *  bytes, which is what lets every downstream suite be hermetic and free. An
 *  item the engine has no entry for yields an output with absent answers, never
 *  a fabricated one. */
export function createReplayEngine(id: string, fixture: ReplayFixture): ReasoningEngine {
  return {
    id,
    solve(input: SolverInput): Promise<SolverOutput> {
      const q = (input && typeof input.question_text === 'string') ? input.question_text : '';
      const items = (fixture && Array.isArray(fixture.items)) ? fixture.items : [];
      const item = items.find((it) => it && it.question_text === q);
      const entry = item && item.engines ? item.engines[id] : undefined;
      return Promise.resolve(normalizeSolverOutput(entry ?? null, input));
    },
  };
}
