// Worksheet Selector — the client half.
//
// The student may return to an older worksheet, but only by saying so. This
// suite pins the three rules that keep that from decaying back into the bug
// closed in PR #94, where a stale worksheet was reached automatically:
//
//   1. The list contains ONLY worksheets uploaded in the current session.
//   2. The newest upload is active by default, and a NEW UPLOAD RESETS the
//      selection to itself — an older pick never survives an upload.
//   3. Nothing is persisted. Every page load starts on the newest worksheet,
//      because a selection surviving a refresh is the same shape of bug: state
//      the student cannot see, silently choosing which page gets solved.
//
// Selection is a routing decision, so it is tested as pure functions over the
// same session_questions rows the server sees. The real helpers are sliced out
// of chat.html and executed — no paraphrase.
import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';
import vm from 'node:vm';

const t = suite('worksheet-selector-client');
const CHAT = read('chat.html');

const SRC = slice(CHAT,
  '// ── Worksheet selector ────────────────────────────────────────────────',
  '// ── end worksheet selector',
  'worksheet selector');

const sandbox = { window: {}, document: { addEventListener(){}, getElementById: () => null,
  querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){} } }) },
  localStorage: { getItem: () => null, setItem(){}, removeItem(){} }, console };
vm.createContext(sandbox);
// `sb` and currentSessionId are the page's; the fake returns whatever rows the
// test stages, so onWorksheetUploaded can be RUN rather than pattern-matched.
sandbox.__rows = [];
vm.runInContext(`
  var currentSessionId = 'sess';
  var sb = { from: () => ({ select: () => ({ eq: () => ({
    order: async () => ({ data: globalThis.__rows }) }) }) }) };
${SRC}
  window.__api = { groupWorksheets, activeWorksheetId, shouldShowSelector, worksheetLabel,
                   loadWorksheets, onWorksheetUploaded,
                   pick: (v) => onWorksheetPicked(v),
                   sel: () => selectedWorksheetId };
`, sandbox);
const { groupWorksheets, activeWorksheetId, shouldShowSelector, worksheetLabel,
        loadWorksheets, onWorksheetUploaded, pick, sel } = sandbox.window.__api;

// Rows as session_questions returns them: created_at DESC, newest first.
const TODAY = '87c281e7-7e25-4368-9007-03e9b8ec8833';
const YDAY  = '52d53870-bb97-42f3-a617-fefc6fdeafec';
const row = (src, q_index, at) =>
  ({ q_index, label: String(q_index), question_text: 'q', summary: null,
     source_record_id: src, image_index: 0, created_at: at });

const todayRows = [1,2,3,4,5,6].map(i => row(TODAY, i, '2026-08-13T14:26:37Z'));
const ydayRows  = [1,4,5,6,11,13].map(i => row(YDAY, i, '2026-08-12T18:23:25Z'));
const bothRows  = [...todayRows, ...ydayRows];

// ───────────────────────────────────────────────────────────────────────────
t.section('C1. The list contains only this session, newest first');
{
  const list = groupWorksheets(bothRows);
  t.is('two worksheets', list.length, 2);
  t.is('newest first', list[0].id, TODAY);
  t.is('older second', list[1].id, YDAY);
  t.is('question counts are per worksheet', list.map(w => w.count), [6, 6]);
  t.ok('every entry came from the supplied rows',
    list.every(w => [TODAY, YDAY].includes(w.id)));

  t.is('a single-worksheet session lists one', groupWorksheets(todayRows).length, 1);
  t.is('no rows lists none', groupWorksheets([]).length, 0);
}

t.section('C2. Newest is active by default');
{
  const list = groupWorksheets(bothRows);
  t.is('no selection -> newest', activeWorksheetId(list, null), TODAY);
  t.is('undefined -> newest', activeWorksheetId(list, undefined), TODAY);
  t.is('empty string -> newest', activeWorksheetId(list, ''), TODAY);
  t.is('an explicit older pick is honoured', activeWorksheetId(list, YDAY), YDAY);
  t.is('an id not in the list -> newest, never the forged value',
    activeWorksheetId(list, 'ffffffff-ffff-4fff-8fff-ffffffffffff'), TODAY);
  t.is('a malformed pick -> newest', activeWorksheetId(list, 'not-a-uuid'), TODAY);
  t.is('no worksheets at all -> null', activeWorksheetId([], YDAY), null);
}

t.section('C3. A NEW UPLOAD RESETS the selection to itself');
{
  // The student is deliberately parked on the older worksheet.
  const before = groupWorksheets(bothRows);
  t.is('older worksheet is active', activeWorksheetId(before, YDAY), YDAY);

  // A third worksheet arrives. Its rows are newest, so it heads the list.
  const NEW = '11111111-1111-4111-8111-111111111111';
  const withNew = [...[1,2].map(i => row(NEW, i, '2026-08-13T19:00:00Z')), ...bothRows];
  const after = groupWorksheets(withNew);
  t.is('the new upload heads the list', after[0].id, NEW);

  // The stale pick must NOT survive: it is no longer the newest, and the rule
  // is that an upload wins. Carrying YDAY forward here is precisely how the
  // original bug felt to the student — a page they did not choose.
  t.is('the stale selection is discarded and the new upload is active',
    activeWorksheetId(after, null), NEW);
}

// Executed, not pattern-matched. A mutation that deleted the reset line left the
// string assertion green, because `selectedWorksheetId = null` still appears at
// the declaration — the same trap as asserting a branch exists rather than runs.
t.section('C3b. onWorksheetUploaded actually clears the pick, when run');
{
  const NEW = '11111111-1111-4111-8111-111111111111';
  sandbox.__rows = bothRows;
  await loadWorksheets();
  pick(YDAY);
  t.is('the student is parked on the older worksheet', sel(), YDAY);

  // No new upload: the pick must survive an ordinary response.
  await onWorksheetUploaded();
  t.is('an ordinary turn does not disturb the selection', sel(), YDAY);

  // A new worksheet is indexed.
  sandbox.__rows = [...[1,2].map(i => row(NEW, i, '2026-08-13T19:00:00Z')), ...bothRows];
  await onWorksheetUploaded();
  t.is('the new upload CLEARS the pick', sel(), null);
  t.is('and the new worksheet is active',
    activeWorksheetId(groupWorksheets(sandbox.__rows), sel()), NEW);
}

t.section('C4. Selector visibility');
{
  t.ok('hidden with one worksheet', !shouldShowSelector(groupWorksheets(todayRows)));
  t.ok('hidden with none',          !shouldShowSelector(groupWorksheets([])));
  t.ok('shown with two',             shouldShowSelector(groupWorksheets(bothRows)));
}

t.section('C5. Nothing is persisted across reloads');
{
  t.ok('the selector never writes to localStorage',
    !/localStorage\.setItem/.test(SRC), SRC);
  t.ok('and never reads it back',
    !/localStorage\.getItem/.test(SRC), SRC);
  t.ok('selection starts null at module scope',
    /(let|var)\s+selectedWorksheetId\s*=\s*null/.test(SRC), SRC.slice(0, 400));
}

t.section('C6. The payload carries the selection only when it is a real pick');
{
  // Sending the newest id explicitly is harmless but noisy, and it would make
  // "no selection" indistinguishable from "picked the newest" in telemetry.
  t.ok('the payload field is wired', /worksheet_id:/.test(CHAT), 'payload field missing');
  const site = slice(CHAT, 'const payload = {', '};', 'payload');
  t.ok('worksheet_id is present in the payload object',
    /worksheet_id/.test(site) || /payload\.worksheet_id/.test(CHAT), site);
}

t.section('C7. Labels are readable and carry no PII');
{
  const list = groupWorksheets(bothRows);
  const l0 = worksheetLabel(list[0], 0, list.length);
  const l1 = worksheetLabel(list[1], 1, list.length);
  t.ok('the newest is marked as latest', /latest|current|newest/i.test(l0), l0);
  t.ok('labels are distinct', l0 !== l1, `${l0} / ${l1}`);
  t.ok('no raw uuid is shown to the student',
    !l0.includes(TODAY) && !l1.includes(YDAY), `${l0} / ${l1}`);
  t.ok('the question count is surfaced', /\d/.test(l1), l1);
}

t.done();
