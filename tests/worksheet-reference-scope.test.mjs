// Question references resolve inside the CURRENT worksheet only.
//
// Production incident, session 393c2193 (2026-08-13 17:26-17:27 Cairo).
// The session had been alive ~20 hours and held two uploads:
//
//   52d53870  08-12 21:23  4 images, questions indexed with labels "1." .. "13."
//   87c281e7  08-13 17:26  1 image,  questions indexed with labels "1","2","3"
//                                     and THREE rows with label = null (q_index 4,5,6)
//
// The student uploaded the second worksheet and asked for Q4, Q5, Q6. Every one
// of them was answered from YESTERDAY'S worksheet, and yesterday's FOUR images
// were re-attached to the vision call (tutor_main meta image_count = 4 on all
// three records, against image_count = 1 on the upload itself).
//
// The mechanism was `byNumber`:
//
//   rows.find(r => (r.label||'').replace(/\D/g,'') === String(n))   // whole session
//   || rows.find(r => r.q_index === n)                              // whole session
//
// Newest-first ordering only helps when BOTH worksheets carry the label. Today's
// set had labels 1,2,3 and nulls, so 4/5/6 found nothing current and fell
// straight through to yesterday's "4.", "5.", "6.".
//
// The rule this suite pins: after a worksheet becomes current, NO automatic
// resolver path — numeric or semantic — may reach an older source_record_id.
// Older worksheets stay stored; they are simply unreachable until an explicit
// Switch Worksheet feature exists. An unresolvable reference must stop, not
// degrade into a stale image, a bare "Q4" to the tutor, or a history guess.
import { suite } from './_assert.mjs';
import { read, slice, importTS } from './_source.mjs';

const t = suite('worksheet-reference-scope');
const SRC = read('supabase/functions/ai-tutor/index.ts');

// The helpers read ORD_EN / ORD_AR / REF_STOP, which are declared above them.
// Hoisting covers that in production; the slice has to carry both regions.
const consts = slice(SRC, 'const ORD_EN: Record<string, number> = {',
  '// Answer when a question number was asked for', 'ref constants');
const fns = slice(SRC,
  '// ── Worksheet scoping for automatic question resolution ──────────────────',
  '// ── Repeat Question Detection',
  'worksheet scoping helpers');
const { currentWorksheetRows, resolveWithinRows, referencedQuestionNumber,
        resolveQuestionReference, worksheetRowsFor } =
  await importTS(consts + '\n' + fns,
    ['currentWorksheetRows', 'resolveWithinRows', 'referencedQuestionNumber',
     'resolveQuestionReference', 'worksheetRowsFor']);

/** Minimal stand-in for the Supabase query builder the resolver uses. */
const fakeSb = (rows) => ({
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: rows }) }) }) }),
});

// ── Fixtures built from the real two generations in session 393c2193 ────────
// Ordered newest-first, exactly as the resolver's query returns them.
const TODAY = '87c281e7';
const YESTERDAY = '52d53870';

const mk = (src, q_index, label, question_text, image_index) =>
  ({ id: `${src}-${q_index}`, q_index, label, question_text, summary: null,
     source_record_id: src, image_index });

const todayRows = [
  mk(TODAY, 1, '1', 'Which of the following equations best expresses the population, P, of bacteria culture A, as a function of t', 0),
  mk(TODAY, 2, '2', 'Which of the following equations best expresses the population, P, of bacteria culture B, as a function of t', 0),
  mk(TODAY, 3, '3', 'After 2 minutes, the population of culture A is what percent greater than the population of culture B?', 0),
  mk(TODAY, 4, null, 'Mark goes for 40-minute jog every morning. Today Mark average speed for the first 5 minutes was 6 miles per hour', 0),
  mk(TODAY, 5, null, 'If f(x) = sqrt(x2 - x - 6), which of the following indicates the set of all values of x at which the function is not defined', 0),
  mk(TODAY, 6, null, '8 people locked in a room take turns holding hands with each person only once. How many hand holdings take place', 0),
];
const yesterdayRows = [
  mk(YESTERDAY, 1,  '1.',  'In the figure above, if line m has a slope -2, what is the y-intercept of m?', 0),
  mk(YESTERDAY, 4,  '4.',  'In the figure above, if line m has a slope -2, what is the y-intercept of m? (A) 10 (B) 15', 1),
  mk(YESTERDAY, 5,  '5.',  'In the xy-plane, points (2, 1) and (4, 3) define a line, and points (-2, -3) and (-4, -2) define another line', 1),
  mk(YESTERDAY, 6,  '6.',  'In the xy-plane, find the slope of the line described by the equation 2x = -1. Undefined', 1),
  mk(YESTERDAY, 11, '11.', 'In the xy-coordinate system above, which of the following line segments has a slope less than -4? A circle', 3),
  mk(YESTERDAY, 13, '13.', 'If the graph of a linear function passes through the points (p, 1), (q, 5) and (3, 2), what is the value of 3p', 3),
];
const bothRows = [...todayRows, ...yesterdayRows];       // newest first, as queried

const scoped = (rows, text) => resolveWithinRows(currentWorksheetRows(rows), text);

// ───────────────────────────────────────────────────────────────────────────
t.section('A. The exact production bug: Q4 must not reach yesterday');
{
  // Yesterday's row for "4." is the y-intercept question with image_index 1.
  // That is what production returned. Scoped, Q4 can only ever land on today's
  // worksheet — here via q_index, since today's 4th row carries label:null.
  const hit = scoped(bothRows, 'Q4');
  t.ok('Q4 resolves somewhere', hit !== null);
  t.is('and it is TODAY\'s worksheet', hit?.source_record_id, TODAY);
  t.ok('never yesterday\'s Q4', hit?.source_record_id !== YESTERDAY, JSON.stringify(hit));
  t.ok('so the y-intercept question is unreachable',
    !/y-intercept/.test(hit?.question_text || ''), hit?.question_text);
  t.is('and the image index is today\'s, not yesterday\'s image 1', hit?.image_index, 0);
}

t.section('B. Q5 and Q6 — same shape, same verdict');
{
  // Yesterday holds "5." (two-line slope) and "6." (2x = -1). Production served
  // exactly those. Every phrasing must now stay on today's worksheet.
  for (const q of ['Q5', 'Q6', 'solve Q6', 'question 5', 'SOLVE Q4']) {
    const hit = scoped(bothRows, q);
    t.is(`${JSON.stringify(q)} stays on today's worksheet`, hit?.source_record_id, TODAY);
  }
  t.ok('the 2x = -1 slope question is unreachable',
    !/2x = -1/.test(scoped(bothRows, 'Q6')?.question_text || ''));
}

t.section('B2. A number NO worksheet row has is honestly unresolved');
{
  // Yesterday has 11 and 13; today has only six rows. These must not be found.
  t.is('Q11 is unresolved even though yesterday has it', scoped(bothRows, 'Q11'), null);
  t.is('Q13 likewise', scoped(bothRows, 'Q13'), null);
  t.is('Q99 exists nowhere', scoped(bothRows, 'Q99'), null);
}

t.section('C. A number the CURRENT worksheet does have still resolves');
{
  const hit = scoped(bothRows, 'Q1');
  t.ok('Q1 resolves', hit !== null);
  t.is('to TODAY, not yesterday', hit?.source_record_id, TODAY);
  t.is('and carries today\'s image_index', hit?.image_index, 0);
  t.ok('the text is the bacteria question, not the y-intercept one',
    /bacteria culture A/.test(hit?.question_text || ''), hit?.question_text);
}
{
  const hit = scoped(bothRows, 'question 3');
  t.is('Q3 also resolves to today', hit?.source_record_id, TODAY);
}

t.section('D. A session with only ONE worksheet is unchanged');
{
  t.is('Q4 in a single-worksheet session still resolves by q_index',
    scoped(yesterdayRows, 'Q4')?.source_record_id, YESTERDAY);
  t.is('Q11 resolves', scoped(yesterdayRows, 'Q11')?.q_index, 11);
  t.is('a number nobody has is still unresolved', scoped(yesterdayRows, 'Q99'), null);
}

t.section('E. No rows at all');
{
  t.is('empty index resolves nothing', scoped([], 'Q4'), null);
}

t.section('F. label:null must not silently reach back to yesterday');
{
  // Today's q_index 4 exists but has label null. The old code found no current
  // label "4", fell to the whole-session q_index scan, and yesterday's row —
  // being a label match first — won. Scoped, q_index within TODAY is allowed;
  // what must never happen is crossing into YESTERDAY.
  const hit = scoped(bothRows, 'Q4');
  t.ok('Q4 never resolves to yesterday, whatever the local policy',
    hit === null || hit.source_record_id === TODAY, JSON.stringify(hit));
  t.ok('today\'s unlabelled rows are still present in the current set',
    currentWorksheetRows(bothRows).some(r => r.q_index === 4 && r.label === null));
  t.is('the current set is exactly today\'s six rows',
    currentWorksheetRows(bothRows).length, 6);
  t.ok('and contains no yesterday row',
    currentWorksheetRows(bothRows).every(r => r.source_record_id === TODAY));
}

t.section('G. The semantic matcher is scoped identically');
{
  // "the circle problem" appears ONLY in yesterday's Q11 text. Before scoping,
  // keyword overlap would return it — with yesterday's images.
  t.is('a keyword unique to yesterday resolves to nothing',
    scoped(bothRows, 'explain the circle problem'), null);
  t.is('another yesterday-only phrase is unreachable',
    scoped(bothRows, 'the y-intercept question'), null);
  t.is('a slope phrase does not cross worksheets',
    scoped(bothRows, 'the slope of the line question'), null);

  // Semantic matching still works INSIDE the current worksheet.
  const hit = scoped(bothRows, 'the bacteria culture question');
  t.is('a current-worksheet phrase still resolves', hit?.source_record_id, TODAY);
  const jog = scoped(bothRows, 'the jog question about average speed');
  t.is('an unlabelled current row is semantically reachable', jog?.source_record_id, TODAY);
  t.is('and it is the jog row', jog?.q_index, 4);

  // In a single-worksheet session the semantic path is untouched.
  t.is('semantic still reaches yesterday when yesterday IS current',
    scoped(yesterdayRows, 'explain the circle problem')?.q_index, 11);
}

t.section('H. referencedQuestionNumber — the guard trigger');
{
  t.is('Q4', referencedQuestionNumber('Q4'), 4);
  t.is('bare 4', referencedQuestionNumber('4'), 4);
  t.is('question 12', referencedQuestionNumber('question 12'), 12);
  t.is('Arabic', referencedQuestionNumber('سؤال 7'), 7);
  t.is('Franco', referencedQuestionNumber('so2al 9'), 9);
  t.is('ordinal word', referencedQuestionNumber('the fourth one'), 4);
  t.is('no number at all', referencedQuestionNumber('explain this again'), null);
  t.is('empty', referencedQuestionNumber(''), null);
}

// ───────────────────────────────────────────────────────────────────────────
// The sections above exercise the helpers. This one exercises the REAL
// resolver, so that rewiring it to the unscoped rows fails here and not only in
// a string assertion — a mutation that reverted the composition passed every
// behavioural test until this section existed.
t.section('H2. The real resolveQuestionReference, composed end to end');
{
  const r1 = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'Q4');
  t.is('Q4 resolves inside today', r1.hit?.source_record_id, TODAY);
  t.ok('and never yesterday', r1.hit?.source_record_id !== YESTERDAY, JSON.stringify(r1.hit));
  t.is('the current worksheet id is reported', r1.currentWorksheetId, TODAY);

  const r2 = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'Q11');
  t.is('Q11 — present only in yesterday — is unresolved', r2.hit, null);
  t.is('but the caller still learns a worksheet exists', r2.currentWorksheetId, TODAY);

  const r3 = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'explain the circle problem');
  t.is('a yesterday-only phrase is unresolved through the real resolver', r3.hit, null);

  const r4 = await resolveQuestionReference(fakeSb([]), 'sess', 'Q4');
  t.is('no rows — no hit', r4.hit, null);
  t.is('and no current worksheet', r4.currentWorksheetId, null);

  const r5 = await resolveQuestionReference(fakeSb(yesterdayRows), 'sess', 'Q11');
  t.is('single-worksheet sessions still resolve', r5.hit?.q_index, 11);
}

t.section('I. Wiring — the handler must use the scoped path and stop on failure');
{
  t.ok('the resolver scopes to the current worksheet',
    /currentWorksheetRows\s*\(/.test(SRC), 'resolver not scoped');
  const resolverFn = slice(SRC, 'async function resolveQuestionReference(',
                                '\n// ── Repeat Question Detection', 'resolver fn');
  t.ok('the scoped set is computed from the queried rows',
    /currentWorksheetRows\(rows\)/.test(resolverFn), resolverFn);
  t.ok('an explicit selection is consulted first',
    /worksheetRowsFor\(rows, worksheetId\)/.test(resolverFn), resolverFn);
  t.ok('an unknown selection degrades to the newest, not to the requested id',
    /selected \?\? currentWorksheetRows\(rows\)/.test(resolverFn), resolverFn);
  t.ok('resolution runs against that single scope, never `rows`',
    /resolveWithinRows\(scope,/.test(resolverFn) &&
    !/resolveWithinRows\(rows/.test(resolverFn), resolverFn);
  t.ok('the reported active worksheet comes from the same scope',
    /currentWorksheetId: scope\[0\]/.test(resolverFn), resolverFn);

  // No automatic fallback to older rows may remain anywhere in the resolver.
  const resolver = slice(SRC, 'async function resolveQuestionReference(',
                              '\n// ── Repeat Question Detection', 'resolver');
  t.ok('the resolver never scans the unscoped row set after scoping',
    !/\?\?\s*resolveWithinRows\s*\(\s*rows\s*\)/.test(resolver), resolver);

  // The guard must fire when a number was requested, a current worksheet
  // exists, and it could not be resolved — even though a recent turn carried an
  // image, which is exactly when worksheetGuardCheck bails out.
  // Assert the branch is WIRED, not merely defined. A mutation that deleted the
  // branch while leaving the helper and the const in place passed until this.
  const guardSite = slice(SRC, 'const refNumber = (!imageData',
                               'if (worksheetGuard) {', 'guard call site');
  t.ok('the guard selects the not-found message when unresolved in current',
    /unresolvedInCurrentWorksheet[\s\S]*worksheetQuestionNotFoundMessage/.test(guardSite),
    guardSite);
  t.ok('and still falls back to the original guard otherwise',
    /worksheetGuardCheck\(question, imageData, messages, lang\)/.test(guardSite), guardSite);
  t.ok('the condition requires a current worksheet to exist',
    /currentWorksheetId/.test(guardSite), guardSite);

  const msg = slice(SRC, 'function worksheetQuestionNotFoundMessage(',
                         '\n// ── Worksheet scoping', 'not-found message');
  t.ok('it does not tell the student to re-attach a worksheet they just sent',
    !/re-attach/i.test(msg), msg);
  t.ok('it does not mention or imply an older worksheet',
    !/(older|previous|earlier|last worksheet|yesterday)/i.test(msg), msg);
  t.ok('English variant offers check-number / clearer image / paste text',
    /number/i.test(msg) && /image/i.test(msg) && /paste|type|text/i.test(msg), msg);
  t.ok('Arabic and Franco variants exist', /ar:/.test(msg) && /franco:/.test(msg), msg);

  // The original guard text must be untouched for the existing cases.
  t.ok('the original re-attach guard message is still present for no-worksheet cases',
    /Could you re-attach the worksheet image/.test(SRC), '');
}

t.section('J. No stale images can reach the vision call when unresolved');
{
  // solveImages falls back to refImages ONLY when resolvedRef is truthy, and
  // refImages is only populated from a resolved hit. Unresolved => [].
  t.ok('solveImages is gated on resolvedRef',
    /const solveImages = imagesData\.length \? imagesData : \(resolvedRef \? refImages : \[\]\)/.test(SRC),
    'solveImages gating changed');
}

// ═══════════════════════════════════════════════════════════════════════════
// Explicit worksheet selection (Worksheet Selector).
//
// Older worksheets become reachable ONLY when the student names one. The
// scope is still exactly one worksheet per request — newest by default, or the
// explicit pick. There is no third state and no fallback between them.
// S0 is the property that lets the server ship AHEAD of the client. The
// Edge Function is deployed manually and the page deploys itself on merge, so
// for a while production runs this code while every browser still sends no
// `worksheet_id` at all. That window is only safe if the new parameter is
// inert when absent — not "close to" today's behaviour, identical to it.
//
// Omitting the argument is tested rather than passing undefined, because the
// call the old client produces is a 3-argument one. It can go red: give the
// parameter a default other than "newest", or make it required, and the
// identity below breaks.
t.section('S0. A client that never sends worksheet_id is completely unaffected');
{
  const refs = ['Q1','Q2','Q4','Q5','Q6','Q11','Q13','Q99','1','question 5',
                'explain the circle problem','the bacteria culture question',
                'the y-intercept question','the jog question about average speed'];
  const divergent = [], escaped = [];
  for (const q of refs) {
    const bare = await resolveQuestionReference(fakeSb(bothRows), 'sess', q);        // 3 args
    const withNull = await resolveQuestionReference(fakeSb(bothRows), 'sess', q, null);
    if (JSON.stringify(bare) !== JSON.stringify(withNull)) divergent.push(q);
    if (bare.hit && bare.hit.source_record_id !== TODAY) escaped.push(q);
    if (bare.currentWorksheetId !== TODAY) escaped.push(`${q} (active=${bare.currentWorksheetId})`);
  }
  t.is('omitting the argument is identical to passing null, for every reference',
    divergent, []);
  t.is('and an absent selection never escapes the newest worksheet', escaped, []);
  t.is('the whole battery ran', refs.length, 14);
}

t.section('S1. An explicit older selection makes that worksheet the scope');
{
  const r = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'Q11', YESTERDAY);
  t.is('Q11 now resolves', r.hit?.q_index, 11);
  t.is('inside the SELECTED worksheet', r.hit?.source_record_id, YESTERDAY);
  t.is('and the active worksheet is reported as the selection', r.currentWorksheetId, YESTERDAY);
  t.ok('it is the circle question from that page',
    /line segments has a slope less than -4/.test(r.hit?.question_text || ''), r.hit?.question_text);
  t.is('its image_index comes from that worksheet', r.hit?.image_index, 3);
}

t.section('S2. Selected worksheet lacks the number -> honest stop, no reach elsewhere');
{
  // Today's worksheet has no q_index 11 and no label 11. Selecting TODAY and
  // asking for Q11 must NOT walk to yesterday, which does have it.
  const r = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'Q11', TODAY);
  t.is('Q11 is unresolved under an explicit TODAY selection', r.hit, null);
  t.is('the active worksheet is still the selection', r.currentWorksheetId, TODAY);
  // And the mirror: yesterday selected, a number only today has.
  const r2 = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'Q2', YESTERDAY);
  t.ok('a number absent from the selected older sheet does not reach today',
    r2.hit === null || r2.hit.source_record_id === YESTERDAY, JSON.stringify(r2.hit));
}

t.section('S3. No selection behaves exactly as before');
{
  for (const sel of [null, undefined, '']) {
    const r = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'Q4', sel);
    t.is(`selection ${JSON.stringify(sel)} -> newest`, r.hit?.source_record_id, TODAY);
    t.is('active id is the newest', r.currentWorksheetId, TODAY);
  }
  const r = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'Q11', null);
  t.is('and Q11 is still unresolved without a selection', r.hit, null);
}

t.section('S4. A forged id from ANOTHER session is ignored, never honoured');
{
  const FOREIGN = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const r = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'Q4', FOREIGN);
  t.is('an id absent from this session falls back to newest', r.currentWorksheetId, TODAY);
  t.is('and resolution stays inside the newest', r.hit?.source_record_id, TODAY);
  const r2 = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'Q11', FOREIGN);
  t.is('a forged id cannot unlock a number the newest lacks', r2.hit, null);
  t.ok('the forged id is never returned as the active worksheet',
    r.currentWorksheetId !== FOREIGN && r2.currentWorksheetId !== FOREIGN, '');
}

t.section('S5. Cross-user safety is still enforced downstream');
{
  // worksheetRowsFor can only ever select from rows the session query returned,
  // and that query is .eq(session_id). The image fetch keeps its own owner check.
  t.is('an id not among the rows yields null, not a partial set',
    worksheetRowsFor(bothRows, 'ffffffff-ffff-4fff-8fff-ffffffffffff'), null);
  t.ok('the image fetch still filters by user_id',
    /\.eq\('id', resolvedRef\.source_record_id\)[\s\S]{0,200}\.eq\('user_id', user\.id\)/.test(SRC),
    'owner guard on the image fetch is missing or moved');
}

t.section('S6. Malformed selections are ignored safely');
{
  for (const bad of ['not-a-uuid', '../../etc/passwd', '   ', 12345, {}, []]) {
    const r = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'Q4', bad);
    t.is(`malformed ${JSON.stringify(bad)} -> newest`, r.currentWorksheetId, TODAY);
  }
}

t.section('S7. The semantic matcher obeys the selection too');
{
  const r = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'explain the circle problem', YESTERDAY);
  t.is('a phrase resolves under an explicit older selection', r.hit?.q_index, 11);
  t.is('inside the selected worksheet', r.hit?.source_record_id, YESTERDAY);

  const r2 = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'explain the circle problem', null);
  t.is('and remains unreachable without one', r2.hit, null);

  const r3 = await resolveQuestionReference(fakeSb(bothRows), 'sess', 'the bacteria culture question', YESTERDAY);
  t.ok('a today-only phrase does not leak in under a yesterday selection',
    r3.hit === null || r3.hit.source_record_id === YESTERDAY, JSON.stringify(r3.hit));
}

t.section('S8. ANTI-FALLBACK PROPERTY — the invariant, over every combination');
{
  // For every (selection, reference) pair the answer is either inside the
  // scope that was asked for, or nothing. A third worksheet is never reachable.
  // This is the property that must survive any future refactor of the matchers.
  const refs = ['Q1','Q2','Q4','Q5','Q6','Q11','Q13','Q99','1','question 5',
                'explain the circle problem','the bacteria culture question',
                'the y-intercept question','the jog question about average speed'];
  const sels = [null, TODAY, YESTERDAY];
  let checked = 0, violations = [];
  for (const sel of sels) {
    const expected = sel ?? TODAY;                      // null => newest
    for (const q of refs) {
      const r = await resolveQuestionReference(fakeSb(bothRows), 'sess', q, sel);
      checked++;
      if (r.hit && r.hit.source_record_id !== expected) {
        violations.push(`${JSON.stringify(q)} under ${sel ?? 'newest'} -> ${r.hit.source_record_id}`);
      }
    }
  }
  t.is('every combination was exercised', checked, refs.length * sels.length);
  t.is('no reference ever escaped its scope', violations, []);
}

t.done();
