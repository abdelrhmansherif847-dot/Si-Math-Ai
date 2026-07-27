// dashboard.html — the Mon–Sun activity strip.
//
// Regression target: the strip was built from a device-local midnight while
// each cell was labelled with a Cairo day key. On a device far from Cairo the
// two frames disagreed, shifting the strip by a day and mis-marking "today" —
// the same device-timezone nondeterminism assets/streak.js documents.
import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('week-strip');
const BLOCK = slice(read('dashboard.html'), 'var pad2 = function(n)', 'var weekActive', 'week strip');

const build = (todayStr, actSet) => new Function('todayStr', 'actSet', 'Array', 'Date', 'String',
  `${BLOCK} return weekData.map(function(d){ return {
      l: d.label, today: d.isToday, done: d.isDone, fut: d.isFuture, dom: d.date.getDate() }; });`
)(todayStr, actSet, Array, Date, String);

t.section('Monday-anchored, correct "today"');
let w = build('2026-07-27', new Set());          // a Monday
t.is('today is cell 0 on a Monday', w.map(d => d.today), [true,false,false,false,false,false,false]);
t.is('labels are M..S', w.map(d => d.l), ['M','T','W','T','F','S','S']);
t.is('week starts on the 27th', w[0].dom, 27);
t.is('week ends on Aug 2nd', w[6].dom, 2);
t.is('only future days flagged', w.map(d => d.fut), [false,true,true,true,true,true,true]);

w = build('2026-07-26', new Set());              // a Sunday
t.is('today is cell 6 on a Sunday', w.map(d => d.today), [false,false,false,false,false,false,true]);
t.is('that week starts Mon 20th', w[0].dom, 20);

t.section('Activity marking uses Cairo day keys');
w = build('2026-07-27', new Set(['2026-07-29','2026-07-27','2026-07-22']));
t.is('this week\'s Mon+Wed marked; prior-week day ignored',
  w.map(d => d.done), [true,false,true,false,false,false,false]);

t.section('Device timezone independence (the defect)');
const ORIGINAL_TZ = process.env.TZ;
const ref = JSON.stringify(build('2026-07-27', new Set(['2026-07-27'])));
let stable = true;
for (const tz of ['Africa/Cairo','America/Los_Angeles','Pacific/Kiritimati','Asia/Tokyo','UTC']) {
  process.env.TZ = tz;
  if (JSON.stringify(build('2026-07-27', new Set(['2026-07-27']))) !== ref) stable = false;
}
process.env.TZ = ORIGINAL_TZ;
t.ok('identical strip in Cairo / LA / Kiritimati(UTC+14) / Tokyo / UTC', stable);

t.done();
