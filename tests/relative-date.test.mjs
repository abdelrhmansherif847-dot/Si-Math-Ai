// history.html relDate() — relative date labels on History cards.
//
// Regression target: diffDay was Math.floor((now - d) / 86400000) — elapsed
// 24-hour periods — while every label it feeds is a calendar-day concept.
// Viewed at 08:00, a session from 23:00 yesterday was 9 hours old, floored to
// 0, and rendered the nonsensical "0 days ago"; one from 23:00 two days back
// rendered as "Yesterday".
import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('relative-date');

// Extract the shipped function, injecting an overridable "now" so the suite is
// deterministic rather than dependent on the wall clock.
const src = slice(read('history.html'), 'function relDate(', '\n}', 'relDate') + '\n}';
const relDate = new Function('return ' + src.replace('const now = new Date();', 'const now = arguments[1];'))();

const NOW = new Date(2026, 6, 27, 8, 0, 0);   // Mon 27 Jul 2026, 08:00 local

t.section('Calendar days, not elapsed hours (the defect)');
t.is('yesterday 23:00 -> Yesterday (was "0 days ago")', relDate(new Date(2026,6,26,23,0), NOW), 'Yesterday');
t.is('2 days ago 23:00 -> 2 days ago (was "Yesterday")', relDate(new Date(2026,6,25,23,0), NOW), '2 days ago');
t.is('6 days ago 23:00 -> 6 days ago (was "5 days ago")', relDate(new Date(2026,6,21,23,0), NOW), '6 days ago');
t.ok('"0 days ago" is no longer producible', ![
  new Date(2026,6,26,23,0), new Date(2026,6,26,9,0), new Date(2026,6,26,0,30),
].some(d => relDate(d, NOW) === '0 days ago'));

t.section('Both sides of midnight');
t.is('today 00:01', relDate(new Date(2026,6,27,0,1), NOW), 'Today');
t.is('today 07:00', relDate(new Date(2026,6,27,7,0), NOW), 'Today');
t.is('yesterday 00:30', relDate(new Date(2026,6,26,0,30), NOW), 'Yesterday');
t.is('yesterday 09:00', relDate(new Date(2026,6,26,9,0), NOW), 'Yesterday');

t.section('Week and month boundaries');
t.is('6 days ago 00:10', relDate(new Date(2026,6,21,0,10), NOW), '6 days ago');
t.is('8 days ago',  relDate(new Date(2026,6,19,12,0), NOW), '1 week ago');
t.is('20 days ago', relDate(new Date(2026,6,7,12,0), NOW),  '2 weeks ago');
t.is('45 days ago', relDate(new Date(2026,5,12,12,0), NOW), '1 month ago');

t.section('Edge cases');
t.is('future timestamp (clock skew) -> Today', relDate(new Date(2026,6,28,9,0), NOW), 'Today');
t.is('empty input -> empty string', relDate('', NOW), '');
t.is('invalid date -> empty string (was "NaN days ago")', relDate('not-a-date', NOW), '');

t.done();
