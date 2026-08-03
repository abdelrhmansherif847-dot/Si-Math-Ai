// assets/streak.js — end-to-end streak behaviour through updateStreak().
//
// The timezone unit tests live in streak-timezone.test.mjs. This file drives
// the REAL writer against a stubbed Supabase and covers the scenarios the bug
// report named: first activity after midnight, consecutive days, missed days,
// and the consistency guarantees (refresh, second device, delayed sync).
//
// Day keys here are built with a SEPARATE Intl call rather than the module
// under test, so a bug in the module cannot make its own tests agree with it.
import { suite } from './_assert.mjs';
import { read, evalSnippet } from './_source.mjs';

const t = suite('streak-rollover');
const SRC = read('assets/streak.js');

/* Independent day-key implementation — deliberately not SiDay. */
const keyIn = (date, tz) => new Intl.DateTimeFormat('en-CA', {
  timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

/* An instant at `hourLocal` on the day `daysAgo` days before now, in `tz`. */
function instantIn(tz, daysAgo, hourLocal = 12) {
  const dayKey = keyIn(new Date(Date.now() - daysAgo * 86400000), tz);
  const [y, m, d] = dayKey.split('-').map(Number);
  // Solve for the UTC instant whose local wall-clock hour in tz is hourLocal.
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const off = (new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' })) -
               new Date(probe.toLocaleString('en-US', { timeZone: tz }))) / 3600000;
  return new Date(Date.UTC(y, m - 1, d, hourLocal + off)).toISOString();
}

function makeSb({ qr = [], exams = [], focus = [], profile = {} } = {}) {
  const writes = [];
  const queries = [];            // records order/limit so the fix can be pinned
  const chain = (table) => {
    const res = () => {
      switch (table) {
        case 'question_records':       return { data: qr.map(c => ({ created_at: c })), error: null };
        case 'exam_practice_sessions': return { data: exams.map(c => ({ created_at: c })), error: null };
        case 'focus_plans':            return { data: focus.length ? [{ id: 'p1' }] : [], error: null };
        case 'focus_tasks':            return { data: focus.map(c => ({ completed_at: c })), error: null };
        case 'profiles':               return { data: profile, error: null };
        default:                       return { data: [], error: null };
      }
    };
    const self = {
      select: () => self, eq: () => self, in: () => self, gte: () => self,
      order(col, o) { queries.push({ table, order: col, ascending: o && o.ascending }); return self; },
      limit(n) { queries.push({ table, limit: n }); return self; },
      maybeSingle: () => Promise.resolve(res()),
      // The persist step is a compare-and-set: .update().eq().eq().select().
      // This stub always reports the write as won, which is the uncontended
      // case every test in this file except the concurrency section models.
      update(patch) {
        writes.push({ table, patch });
        const q = { eq: () => q, select: () => Promise.resolve({ data: [{ id: 'u1' }], error: null }),
                    then: (ok, err) => Promise.resolve({ error: null }).then(ok, err) };
        return q;
      },
      upsert: () => Promise.resolve({ error: null }),
      then: (ok, err) => Promise.resolve(res()).then(ok, err),
    };
    return self;
  };
  return { from: chain, _writes: writes, _queries: queries };
}

async function run(fixture, opts) {
  const win = {};
  evalSnippet(SRC, { window: win }, []);
  const sb = makeSb(fixture);
  const out = await win.updateStreak(sb, 'u1', opts);
  const w = sb._writes.find(x => x.table === 'profiles');
  return { ...out, wrote: !!w, patch: w ? w.patch : null, queries: sb._queries };
}

const TZ = 'Asia/Dubai';   // UTC+4 — one of the zones the Cairo pin broke
const todayKey = keyIn(new Date(), TZ);
const dayBefore = (k, n) => {
  const [y, m, d] = k.split('-').map(Number);
  const t2 = new Date(Date.UTC(y, m - 1, d) - n * 86400000);
  const p = x => String(x).padStart(2, '0');
  return `${t2.getUTCFullYear()}-${p(t2.getUTCMonth() + 1)}-${p(t2.getUTCDate())}`;
};

t.section('First qualifying activity after midnight');
{
  // 00:30 local, today. Under the Cairo pin this instant belonged to YESTERDAY,
  // so today's Weekly Progress square stayed a placeholder dot.
  const r = await run({ qr: [instantIn(TZ, 0, 0.5)] }, { timezone: TZ });
  t.is('streak counts today', r.current_streak, 1);
  t.ok('today is in active_days -> the square lights immediately',
    r.active_days.includes(todayKey));
  t.is('today_key is reported for the renderer', r.today_key, todayKey);
  t.is('and the timezone used travels with it', r.timezone, TZ);
}
{
  // 23:30 local yesterday must NOT count as today.
  const r = await run({ qr: [instantIn(TZ, 1, 23.5)] }, { timezone: TZ });
  t.ok('late-yesterday activity is not today', !r.active_days.includes(todayKey));
  t.is('but the streak is still alive (anchor = yesterday)', r.current_streak, 1);
}

t.section('Consecutive days');
t.is('three consecutive days ending today -> 3',
  (await run({ qr: [0, 1, 2].map(d => instantIn(TZ, d)) }, { timezone: TZ })).current_streak, 3);
t.is('seven consecutive days -> 7',
  (await run({ qr: [0,1,2,3,4,5,6].map(d => instantIn(TZ, d)) }, { timezone: TZ })).current_streak, 7);
t.is('streak through yesterday, nothing today yet -> held, not reset',
  (await run({ qr: [1,2,3].map(d => instantIn(TZ, d)),
               profile: { current_streak: 3, best_streak: 3 } }, { timezone: TZ })).current_streak, 3);

t.section('Missed days break the streak');
t.is('gap of one full day -> broken',
  (await run({ qr: [2, 3, 4].map(d => instantIn(TZ, d)),
               profile: { current_streak: 3, best_streak: 9 } }, { timezone: TZ })).current_streak, 0);
t.is('best_streak survives the break',
  (await run({ qr: [2, 3, 4].map(d => instantIn(TZ, d)),
               profile: { current_streak: 3, best_streak: 9 } }, { timezone: TZ })).best_streak, 9);
t.is('activity today only, after a long gap -> 1',
  (await run({ qr: [instantIn(TZ, 0), instantIn(TZ, 9)] }, { timezone: TZ })).current_streak, 1);

t.section('All three activity sources feed one day-set');
t.is('chat + exam + focus on three consecutive days -> 3',
  (await run({ qr: [instantIn(TZ, 0)], exams: [instantIn(TZ, 1)], focus: [instantIn(TZ, 2)] },
             { timezone: TZ })).current_streak, 3);

t.section('Delayed synchronisation: the just-written row is not visible yet');
{
  // The activity row exists server-side but the follow-up SELECT cannot see it.
  // Without the hint today is missing; with it, today counts. This is the case
  // chat.html now passes activityToday for.
  const blind = await run({ qr: [instantIn(TZ, 1)] }, { timezone: TZ });
  t.ok('without the hint, today is absent', !blind.active_days.includes(todayKey));
  const hinted = await run({ qr: [instantIn(TZ, 1)] }, { timezone: TZ, activityToday: true });
  t.ok('with the hint, today is present', hinted.active_days.includes(todayKey));
  t.is('and the streak includes today', hinted.current_streak, 2);
}

t.section('Refresh and second device produce identical state');
{
  const fixture = { qr: [0, 1, 2].map(d => instantIn(TZ, d)) };
  const a = await run(fixture, { timezone: TZ });
  const b = await run(fixture, { timezone: TZ });          // refresh
  t.is('refresh: same streak', b.current_streak, a.current_streak);
  t.is('refresh: same day-set', b.active_days, a.active_days);

  // A second device whose OS clock is in a different zone, but the student's
  // timezone is supplied explicitly — the case the stored profile timezone
  // covers. The result must not move.
  const ORIGINAL_TZ = process.env.TZ;
  let same = true;
  for (const deviceTz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
    process.env.TZ = deviceTz;
    const c = await run(fixture, { timezone: TZ });
    if (c.current_streak !== a.current_streak ||
        JSON.stringify(c.active_days) !== JSON.stringify(a.active_days)) same = false;
  }
  process.env.TZ = ORIGINAL_TZ;
  t.ok('second device, explicit student timezone -> identical streak and day-set', same);
}

t.section('The counter, the day-set and the write all agree');
{
  const r = await run({ qr: [0, 1].map(d => instantIn(TZ, d)) }, { timezone: TZ });
  t.is('persisted current_streak matches the returned one', r.patch.current_streak, r.current_streak);
  t.is('persisted best_streak matches the returned one', r.patch.best_streak, r.best_streak);
  t.is('last_active_date is the newest active day', r.patch.last_active_date,
    r.active_days[r.active_days.length - 1]);
  t.is('active_days has no duplicates', r.active_days.length, new Set(r.active_days).size);
  t.ok('active_days is sorted ascending',
    r.active_days.every((k, i) => i === 0 || k > r.active_days[i - 1]));
  t.is('today_key equals the last active day when active today',
    r.today_key, r.active_days[r.active_days.length - 1]);
}

t.section('Activity reads are ordered newest-first and capped');
{
  // PostgREST truncates at max-rows SILENTLY. Unordered, the rows it keeps are
  // arbitrary, so a busy student could lose their most RECENT days — the exact
  // set the backward walk needs — and a current_streak of 0 would be persisted
  // over a real streak. Newest-first means truncation costs only old history,
  // which best_streak's stored floor already covers.
  const r = await run({ qr: [0, 1].map(d => instantIn(TZ, d)), focus: [instantIn(TZ, 2)] }, { timezone: TZ });
  for (const table of ['question_records', 'exam_practice_sessions', 'focus_tasks']) {
    const ord = r.queries.find(q => q.table === table && q.order);
    const lim = r.queries.find(q => q.table === table && q.limit);
    t.ok(`${table} is ordered`, !!ord);
    t.is(`${table} is ordered NEWEST first`, ord && ord.ascending, false);
    t.ok(`${table} is capped`, !!lim && lim.limit > 0);
  }
}

t.section('A streak longer than the fetch window is not reported as shorter');
{
  // The walk can only see as far back as the window. Running out of DATA is not
  // the same as finding a GAP, and reporting the truncated number would drop a
  // 130-day streak to 120 — a reset the student did not earn.
  const everyDay = Array.from({ length: 125 }, (_, d) => instantIn(TZ, d));
  const r = await run({ qr: everyDay, profile: { current_streak: 130, best_streak: 130 } },
                      { timezone: TZ });
  t.ok('the stored longer streak is kept, not truncated', r.current_streak >= 130);
  // ...but a genuine gap INSIDE the window must still break it, so the guard
  // cannot be used to mask a real reset.
  const withGap = [0, 1, 2].map(d => instantIn(TZ, d));
  const r2 = await run({ qr: withGap, profile: { current_streak: 130, best_streak: 130 } },
                       { timezone: TZ });
  t.is('a real gap inside the window still breaks the streak', r2.current_streak, 3);
}

t.section('Concurrency: a stale run must not clobber a fresher one');
{
  // The reproduced race. Two overlapping recomputes against ONE profiles row:
  //   A (laptop) reads before today's activity commits  -> computes 5
  //   B (phone)  reads after it commits, writes         -> 6
  //   A's UPDATE lands LAST
  // Blind last-writer-wins persisted A's stale 5 over B's correct 6.
  const row = { current_streak: 5, best_streak: 9, last_active_date: null };
  const mkSb = (activity) => {
    const chain = (table) => {
      const res = () => {
        switch (table) {
          case 'question_records':       return { data: activity.map(c => ({ created_at: c })), error: null };
          case 'exam_practice_sessions': return { data: [], error: null };
          case 'focus_plans':            return { data: [], error: null };
          case 'profiles':               return { data: { ...row }, error: null };
          default:                       return { data: [], error: null };
        }
      };
      let guard;                        // the .eq('current_streak', N) filter
      const self = {
        select: () => self, in: () => self, gte: () => self, order: () => self, limit: () => self,
        eq(col, val) { if (col === 'current_streak') guard = val; return self; },
        maybeSingle: () => Promise.resolve(res()),
        update(patch) {
          const q = {
            eq(col, val) { if (col === 'current_streak') guard = val; return q; },
            select() {
              // Compare-and-set: apply only if the guard still matches.
              if (guard !== undefined && guard !== row.current_streak) {
                return Promise.resolve({ data: [], error: null });      // lost
              }
              Object.assign(row, patch);
              return Promise.resolve({ data: [{ id: 'u1' }], error: null });
            },
            then: (ok, err) => { Object.assign(row, patch); return Promise.resolve({ error: null }).then(ok, err); },
          };
          return q;
        },
        upsert: () => Promise.resolve({ error: null }),
        then: (ok, err) => Promise.resolve(res()).then(ok, err),
      };
      return self;
    };
    return { from: chain };
  };

  const yesterdayActivity = [1, 2, 3, 4, 5].map(d => instantIn(TZ, d));
  const withToday = [instantIn(TZ, 0), ...yesterdayActivity];

  const winA = {}; evalSnippet(SRC, { window: winA }, []);
  const winB = {}; evalSnippet(SRC, { window: winB }, []);

  // B (fresher: sees today) writes first and wins.
  const bOut = await winB.updateStreak(mkSb(withToday), 'u1', { timezone: TZ });
  t.is('the fresher run computes 6', bOut.current_streak, 6);
  t.is('and persists it', row.current_streak, 6);

  // A (stale: never saw today) now tries to write its 5, landing last.
  const aOut = await winA.updateStreak(mkSb(yesterdayActivity), 'u1', { timezone: TZ });
  t.is('the stale run must NOT overwrite the fresher 6', row.current_streak, 6);
  // It also must not RENDER its stale 5: it returns the stored truth and flags
  // skipped, so a page that lost the race still shows the right number.
  t.is('and it reports the fresher value, not its own stale 5', aOut.current_streak, 6);
  t.ok('flagged skipped so callers fall back rather than trust it', aOut.skipped === true);
  t.is('and last_active_date keeps the newer day', String(row.last_active_date), todayKey);
}
{
  // The guard must not make a GENUINE break unpersistable: a real break lowers
  // the streak, and that run holds the newest activity there is, so it writes.
  const row = { current_streak: 7, best_streak: 9, last_active_date: dayBefore(todayKey, 5) };
  const mkSb = () => ({ from: (table) => {
    const res = () => table === 'profiles'
      ? { data: { ...row }, error: null }
      : { data: table === 'question_records' ? [3, 4].map(d => ({ created_at: instantIn(TZ, d) })) : [], error: null };
    let guard;
    const self = {
      select: () => self, in: () => self, gte: () => self, order: () => self, limit: () => self,
      eq(col, val) { if (col === 'current_streak') guard = val; return self; },
      maybeSingle: () => Promise.resolve(res()),
      update(patch) {
        const q = { eq(col, val) { if (col === 'current_streak') guard = val; return q; },
          select() {
            if (guard !== undefined && guard !== row.current_streak) return Promise.resolve({ data: [], error: null });
            Object.assign(row, patch);
            return Promise.resolve({ data: [{ id: 'u1' }], error: null });
          },
          then: (ok, err) => Promise.resolve({ error: null }).then(ok, err) };
        return q;
      },
      upsert: () => Promise.resolve({ error: null }),
      then: (ok, err) => Promise.resolve(res()).then(ok, err),
    };
    return self;
  } });
  const win = {}; evalSnippet(SRC, { window: win }, []);
  const out = await win.updateStreak(mkSb(), 'u1', { timezone: TZ });
  t.is('a genuinely broken streak computes 0', out.current_streak, 0);
  t.is('and IS persisted — the guard does not block a real break', row.current_streak, 0);
}

t.section('A read failure never overwrites a real streak');
{
  const win = {};
  evalSnippet(SRC, { window: win }, []);
  const sb = makeSb({ qr: [instantIn(TZ, 0)], profile: { current_streak: 5, best_streak: 8 } });
  const orig = sb.from;
  sb.from = (table) => {
    if (table === 'question_records') {
      const bad = { select: () => bad, eq: () => bad, in: () => bad, gte: () => bad,
                    order: () => bad, limit: () => bad,
                    then: (ok) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(ok) };
      return bad;
    }
    return orig(table);
  };
  const out = await win.updateStreak(sb, 'u1', { timezone: TZ });
  t.is('stored streak returned unchanged', out.current_streak, 5);
  t.ok('flagged as skipped', out.skipped === true);
  t.ok('no profile write attempted', !sb._writes.some(w => w.table === 'profiles'));
  t.is('the frame is still reported so the UI stays in one zone', out.timezone, TZ);
}

t.done();
