// assets/exam-days.js — days until the student's exam.
//
// Regression target: the countdown was implemented four times and all four
// disagreed. exam_date is a Postgres DATE, so new Date('YYYY-MM-DD') parses it
// as UTC midnight; every client copy subtracted that from a LOCAL midnight and
// Math.ceil'd the leftover offset into a whole extra day. In Cairo the
// dashboard read +1 every day of the year — a student whose exam was TODAY was
// told "1 day left" while Zero correctly said 0.
import { suite } from './_assert.mjs';
import { read, evalSnippet } from './_source.mjs';

const t = suite('exam-days');
const win = {};
evalSnippet(read('assets/exam-days.js'), { window: win }, []);
const { examDaysRemaining: days, examDaysRemainingClamped: clamped } = win;

// Fixed reference instant: 2026-07-27 11:29 Cairo (EEST, UTC+3).
const NOW = new Date('2026-07-27T08:29:00Z');

t.section('Core arithmetic (reference day: 2026-07-27 in Cairo)');
t.is('exam today      -> 0',   days('2026-07-27', NOW), 0);
t.is('exam tomorrow   -> 1',   days('2026-07-28', NOW), 1);
t.is('exam in 30 days -> 30',  days('2026-08-26', NOW), 30);
t.is('exam yesterday  -> -1',  days('2026-07-26', NOW), -1);
t.is('clamped past exam -> 0', clamped('2026-07-26', NOW), 0);

t.section('Stable across time of day (the Progress-page drift)');
// progress.html measured from Date.now(), so its answer changed through the day.
const sameDay = ['2026-07-27T00:30:00Z', '2026-07-27T08:29:00Z', '2026-07-27T20:59:00Z']
  .map(s => days('2026-08-15', new Date(s)));
t.is('same Cairo day gives one answer at 00:30/08:29/20:59Z', new Set(sameDay).size, 1);

t.section('Device timezone independence (Cairo-pinned)');
const ORIGINAL_TZ = process.env.TZ;
const ref = days('2026-08-15', NOW);
let stable = true;
for (const tz of ['Africa/Cairo', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Tokyo', 'UTC']) {
  process.env.TZ = tz;
  if (days('2026-08-15', NOW) !== ref) stable = false;
}
// Restore: the assertions below are timezone-sensitive BY DESIGN (they
// demonstrate a device-local bug), so leaving TZ=UTC here would silently
// invert their meaning.
process.env.TZ = ORIGINAL_TZ;
t.ok('identical in Cairo / LA / Kiritimati(UTC+14) / Tokyo / UTC', stable);

t.section('Input shapes and invalid input');
t.is('ISO timestamp accepted', days('2026-07-28T00:00:00+00:00', NOW), 1);
t.is('null    -> null', days(null, NOW), null);
t.is('empty   -> null', days('', NOW), null);
t.is('garbage -> null', days('not-a-date', NOW), null);
t.is('clamped null -> null', clamped(null, NOW), null);

t.section('The original defect must not reappear (shown in Cairo)');
process.env.TZ = 'Africa/Cairo';
const buggy = (s, now) => { const e = new Date(s); const t0 = new Date(now); t0.setHours(0,0,0,0);
  return Math.max(0, Math.ceil((e - t0) / 86400000)); };
t.is('old dashboard formula returned 1 on exam day', buggy('2026-07-27', NOW), 1);
t.is('helper returns 0 on exam day', days('2026-07-27', NOW), 0);

t.done();
