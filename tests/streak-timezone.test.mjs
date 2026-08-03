// assets/streak.js — day boundaries, midnight rollover and timezone behaviour.
//
// Regression target: day keys were computed in a FIXED Africa/Cairo zone on
// every device rather than in the student's own. That single decision produced
// three separately-reported bugs, and each one is pinned below:
//
//   1. the day did not start at 00:00 local (Dubai 01:00/02:00, Tokyo
//      06:00/07:00, New York 17:00 the previous day — and Cairo's own DST moved
//      the boundary twice a year, so Riyadh was right in summer, wrong in winter)
//   2. practising just after local midnight was filed under YESTERDAY, so
//      today's Weekly Progress square stayed a placeholder dot
//   3. a real streak BROKE while the student practised every day, because two
//      consecutive local days can map to non-consecutive Cairo days
//
// These tests execute the REAL shipped source (no paraphrase), and every one of
// them fails against the pre-fix file.
import { suite } from './_assert.mjs';
import { read, evalSnippet } from './_source.mjs';

const t = suite('streak-timezone');
const SRC = read('assets/streak.js');

/* Load the shipped source once and take the day module it exports. */
function loadSiDay() {
  const win = {};
  const g = evalSnippet(SRC, { window: win }, ['SiDay']);
  return g.SiDay;
}
const SiDay = loadSiDay();

/* The local wall-clock time at which the day key flips, for a given zone.
 * Scans a 48h window minute by minute around a fixed UTC date. */
function rolloverLocalTime(tz, baseISODate) {
  let prev = null;
  for (let m = 0; m < 60 * 48; m++) {
    const inst = new Date(Date.parse(baseISODate + 'T00:00:00Z') + m * 60000);
    const k = SiDay.dayKey(inst, tz);
    if (prev && k !== prev) {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(inst);
    }
    prev = k;
  }
  return null;
}

const ZONES = ['Africa/Cairo', 'Asia/Dubai', 'Asia/Riyadh', 'Europe/London',
               'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati'];

t.section('A new day begins at 00:00 in the student\'s own timezone');
// Two base dates so Cairo's DST cannot make this pass by luck: under the old
// Cairo pin, Riyadh rolled at 00:00 in July and 01:00 in January.
for (const base of ['2026-07-15', '2026-01-15']) {
  for (const tz of ZONES) {
    t.is(`${tz} rolls over at local midnight (${base})`, rolloverLocalTime(tz, base), '00:00');
  }
}

t.section('Midnight rollover: 23:59 and 00:01 are different days, 00:00 is the new one');
for (const tz of ['Asia/Dubai', 'America/New_York', 'Pacific/Kiritimati']) {
  // Build instants at exact local wall-clock times by searching for them. The
  // window must span a full day either side of UTC midnight: zones run from
  // UTC-11 to UTC+14, so local 00:01 can sit ~14h BEFORE the UTC date starts.
  const localAt = (dateKey, hh, mm) => {
    const want = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    for (let m = 0; m < 60 * 72; m++) {
      const inst = new Date(Date.parse(dateKey + 'T00:00:00Z') - 86400000 + m * 60000);
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(inst);
      if (parts === want && SiDay.dayKey(inst, tz) === dateKey) return inst;
    }
    throw new Error(`no instant found for ${tz} ${dateKey} ${want}`);
  };
  const late = localAt('2026-07-14', 23, 59);
  const justAfter = localAt('2026-07-15', 0, 1);
  t.is(`${tz}: 23:59 belongs to that day`, SiDay.dayKey(late, tz), '2026-07-14');
  t.is(`${tz}: 00:01 belongs to the NEXT day`, SiDay.dayKey(justAfter, tz), '2026-07-15');
  t.is(`${tz}: they are consecutive`, SiDay.diffDays('2026-07-14', '2026-07-15'), 1);
}

t.section('The reported break: consecutive LOCAL days stay consecutive');
// New York. Mon 15:00 local and Tue 20:00 local — two consecutive days of real
// practice. Under the Cairo pin these became 2026-07-13 and 2026-07-15: a gap,
// so the streak was recomputed as 1 instead of 2.
{
  const tz = 'America/New_York';
  const monAfternoon = new Date('2026-07-13T19:00:00Z'); // 15:00 EDT Mon
  const tueEvening   = new Date('2026-07-15T00:00:00Z'); // 20:00 EDT Tue
  const kA = SiDay.dayKey(monAfternoon, tz);
  const kB = SiDay.dayKey(tueEvening, tz);
  t.is('Monday afternoon is Monday', kA, '2026-07-13');
  t.is('Tuesday evening is Tuesday (was Wednesday under the Cairo pin)', kB, '2026-07-14');
  t.is('and the two days are consecutive, so the streak holds', SiDay.diffDays(kA, kB), 1);
}

t.section('Timezone resolution: preferred -> device -> Cairo, never throws');
t.is('a valid explicit zone wins', SiDay.resolveTimeZone('Asia/Tokyo'), 'Asia/Tokyo');
t.ok('an invalid zone falls back rather than throwing',
  SiDay.isValidTimeZone(SiDay.resolveTimeZone('Not/AZone')));
t.ok('undefined resolves to something usable', SiDay.isValidTimeZone(SiDay.resolveTimeZone(undefined)));
t.is('garbage input is rejected by the validator', SiDay.isValidTimeZone('Not/AZone'), false);
t.is('empty string is rejected', SiDay.isValidTimeZone(''), false);
t.is('Cairo remains the last-resort constant', SiDay.FALLBACK_TZ, 'Africa/Cairo');

t.section('Day arithmetic is calendar-exact across DST');
// Europe/London springs forward on 2026-03-29. Adding a day must not be
// "+24h on a local Date", which lands on the wrong calendar date.
t.is('across the spring-forward boundary', SiDay.addDays('2026-03-28', 1), '2026-03-29');
t.is('and the day after that', SiDay.addDays('2026-03-29', 1), '2026-03-30');
t.is('across the autumn-back boundary', SiDay.addDays('2026-10-24', 1), '2026-10-25');
t.is('month rollover', SiDay.addDays('2026-07-31', 1), '2026-08-01');
t.is('year rollover', SiDay.addDays('2026-12-31', 1), '2027-01-01');
t.is('leap day forward', SiDay.addDays('2028-02-28', 1), '2028-02-29');
t.is('backwards a day', SiDay.addDays('2026-01-01', -1), '2025-12-31');
t.is('diffDays across a month', SiDay.diffDays('2026-07-31', '2026-08-02'), 2);

t.section('The same instant is one day-key per zone — and stable on re-read');
{
  const inst = new Date('2026-07-15T02:30:00Z');
  const first = ZONES.map(z => SiDay.dayKey(inst, z));
  const second = ZONES.map(z => SiDay.dayKey(inst, z));
  t.is('repeated computation is identical (idempotent)', first, second);
  // The device's own TZ env must not leak into an explicit-zone computation:
  // that leak is what made two devices disagree in the first place.
  const ORIGINAL_TZ = process.env.TZ;
  let stable = true;
  for (const deviceTz of ['Africa/Cairo', 'America/Los_Angeles', 'Asia/Tokyo', 'UTC']) {
    process.env.TZ = deviceTz;
    const again = loadSiDay().dayKey(inst, 'Asia/Dubai');
    if (again !== SiDay.dayKey(inst, 'Asia/Dubai')) stable = false;
  }
  process.env.TZ = ORIGINAL_TZ;
  t.ok('an explicit zone gives the same key on any device', stable);
}

t.done();
