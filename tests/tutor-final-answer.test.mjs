// deriveTutorFinalAnswer — the string the judge receives as "Tutor final answer".
//
// RC1. The extractor scans bottom-up for a final-answer marker and returns the
// text that follows it ON THE SAME LINE. Zero does not write it that way: it
// emits the marker as a markdown heading with the value on the NEXT line —
//
//     ✅ **Final Answer**
//     The maximum possible present age of this family is 110 years.
//
// On that shape the capture is "**". The guard tests the RAW capture, which is
// truthy, so the loop commits; the return value then strips markdown and yields
// "". The function returns empty for a response that plainly states its answer,
// and `runJudge` omits the "Tutor final answer:" line entirely when it does —
// leaving the judge to rule on a 600-char truncated excerpt that stops before
// the answer.
//
// Measured over every l3-shadow-v3 record on 2026-08-08: 6.3% reach the intended
// path, 65.5% carry this signature, 27.7% have no marker at all and fall back to
// the last line (that fallback's correctness is NOT measured, and this suite does
// not assert it — it only pins the behaviour so the fix cannot silently move it).
//
// The suite executes the real shipped function; `slice` throws if a marker stops
// matching, so a restructure fails loudly instead of passing vacuously.
import { suite } from './_assert.mjs';
import { read, slice, importTS } from './_source.mjs';

const t = suite('tutor-final-answer');
const SRC = read('supabase/functions/ai-tutor/index.ts');

const fn = slice(SRC,
  '// Derive a concise tutor FINAL-answer string from the full explanation so the',
  '// ── Multi-question detection / segmentation (Issue #4, Phase B)',
  'deriveTutorFinalAnswer');
const { deriveTutorFinalAnswer } = await importTS(fn, ['deriveTutorFinalAnswer']);

// ── The RC1 shape: marker as a heading, value on the following line ──────────
t.section('Marker on its own line — the value is on the next line');

const headingForm = [
  '📖 **Understand the Problem**',
  'We need the maximum possible present age of the family.',
  '',
  '✅ **Final Answer**',
  'The maximum possible present age of this family is \\( 110 \\) years.',
  '',
  '⚠️ **Common Mistake**',
  'Not accounting for the 9 years that have passed.',
].join('\n');

t.is('heading form returns the value, not an empty string',
  deriveTutorFinalAnswer(headingForm),
  'The maximum possible present age of this family is \\( 110 \\) years.');

const headingMCQ = [
  '📐 **Step 1**',
  'f(14) = 6(14)² = 1,176',
  '',
  '✅ **Final Answer**',
  'A) If the width of the rectangle is 14 ft, then the area of the rectangle is 1,176 ft².',
  '',
  '💡 **Zero Tip**',
  'Read the function definition before choosing.',
].join('\n');

t.is('heading form preserves a multiple-choice option label',
  deriveTutorFinalAnswer(headingMCQ),
  'A) If the width of the rectangle is 14 ft, then the area of the rectangle is 1,176 ft².');

t.ok('heading form is never the bare marker residue',
  !['', '**', '*'].includes(deriveTutorFinalAnswer(headingForm)));

// ── Behaviour that must NOT change ──────────────────────────────────────────
t.section('Inline form — unchanged');

t.is('marker and value on one line still extracts the value',
  deriveTutorFinalAnswer('Steps ...\n✅ **Final Answer** x = 5\n⚠️ **Common Mistake** ...'),
  'x = 5');

t.is('"The answer is" marker still works',
  deriveTutorFinalAnswer('Working ...\nThe answer is 42'),
  '42');

t.is('a colon after the marker is still consumed',
  deriveTutorFinalAnswer('Working ...\nFinal Answer: 7'),
  '7');

t.section('No marker — the fallback path is pinned, not asserted correct');

t.is('with no marker at all, the last non-empty line is returned',
  deriveTutorFinalAnswer('Some working\nAnother line\n\n  42  '),
  '42');

t.section('Degenerate input');

t.is('empty string returns empty', deriveTutorFinalAnswer(''), '');
t.is('whitespace only returns empty', deriveTutorFinalAnswer('   \n  \n'), '');
t.is('null returns empty', deriveTutorFinalAnswer(null), '');
t.is('undefined returns empty', deriveTutorFinalAnswer(undefined), '');

t.is('a trailing marker with nothing after it does not return marker residue',
  deriveTutorFinalAnswer('Working steps here\n✅ **Final Answer**'),
  '');

t.section('Formatting and bounds — unchanged');

t.is('markdown is stripped from the returned value',
  deriveTutorFinalAnswer('Final Answer: **`x = 5`**'),
  'x = 5');

t.is('the value is capped at 120 characters',
  deriveTutorFinalAnswer(`Final Answer: ${'9'.repeat(200)}`).length,
  120);

t.is('the cap also applies on the heading form',
  deriveTutorFinalAnswer(`✅ **Final Answer**\n${'9'.repeat(200)}`).length,
  120);

t.done();
