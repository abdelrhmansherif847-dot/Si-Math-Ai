// assets/streak.js — daily learning streak.
//
// Regression target: the activity set was seeded with today unconditionally,
// and dashboard.html calls updateStreak() on every page load. Opening the
// dashboard therefore counted as a day of practice — but only in memory, so
// the streak climbed without practice and then collapsed a day or two later.
// Two further defects: a transient query failure overwrote a real streak with
// 1, and the backward walk started at today so a live streak read 0 every
// morning until the first question.
import { suite } from './_assert.mjs';
import { read, evalSnippet } from './_source.mjs';

const t = suite('streak');
const SRC = read('assets/streak.js');

const dayKey = d => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

// An instant that lands on `daysAgo` at `hourLocal` in Cairo.
function cairoInstant(daysAgo, hourLocal = 12) {
  const key = dayKey(new Date(Date.now() - daysAgo * 86400000));
  const [y, m, d] = key.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const off = (new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' })) -
               new Date(probe.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }))) / 3600000;
  return new Date(Date.UTC(y, m - 1, d, hourLocal + off)).toISOString();
}

function makeSb({ qrDays = [], examDays = [], focusDays = [], profile = {}, fail = {} }) {
  const writes = [];
  const rows = ds => ds.map(x => ({ created_at: typeof x === 'number' ? cairoInstant(x) : x }));
  const fRows = ds => ds.map(x => ({ completed_at: typeof x === 'number' ? cairoInstant(x) : x }));
  const chain = (table) => {
    const res = () => {
      if (fail[table]) return { data: null, error: { message: 'simulated failure' } };
      switch (table) {
        case 'question_records':       return { data: rows(qrDays), error: null };
        case 'exam_practice_sessions': return { data: rows(examDays), error: null };
        case 'focus_plans':            return { data: focusDays.length ? [{ id: 'p1' }] : [], error: null };
        case 'focus_tasks':            return { data: fRows(focusDays), error: null };
        case 'profiles':               return { data: profile, error: null };
        default:                       return { data: [], error: null };
      }
    };
    const self = {
      select: () => self, eq: () => self, in: () => self, gte: () => self,
      maybeSingle: () => Promise.resolve(res()),
      update(patch) { writes.push({ table, patch }); return { eq: () => Promise.resolve({ error: null }) }; },
      upsert: () => Promise.resolve({ error: null }),
      then: (ok, err) => Promise.resolve(res()).then(ok, err),
    };
    return self;
  };
  return { from: chain, _writes: writes };
}

async function run(fixture, opts) {
  const win = {};
  evalSnippet(SRC, { window: win }, []);
  const sb = makeSb(fixture);
  const out = await win.updateStreak(sb, 'u1', opts);
  const w = sb._writes.find(x => x.table === 'profiles');
  return { current: out.current_streak, best: out.best_streak, wrote: !!w,
           last: w?.patch?.last_active_date ?? null };
}

const today = dayKey(new Date());
const yday  = dayKey(new Date(Date.now() - 86400000));

t.section('The reported bug: page views must not build or break a streak');
t.is('no activity ever -> 0 (no phantom day)',
  (await run({ qrDays: [], profile: { current_streak: 0, best_streak: 0 } })).current, 0);
t.is('practised yesterday, only opens dashboard -> HELD at 1',
  (await run({ qrDays: [1], profile: { current_streak: 1, best_streak: 1 } })).current, 1);
t.is('5-day streak through yesterday, dashboard only -> 5 (not 0, not 6)',
  (await run({ qrDays: [1,2,3,4,5], profile: { current_streak: 5, best_streak: 5 } })).current, 5);
t.is('gap of 2 days -> broken, 0',
  (await run({ qrDays: [2,3,4], profile: { current_streak: 3, best_streak: 9 } })).current, 0);
t.is('best_streak preserved when broken',
  (await run({ qrDays: [2,3,4], profile: { current_streak: 3, best_streak: 9 } })).best, 9);

t.section('Multiple sessions per day, and midnight edges');
t.is('three sessions one day -> counts once',
  (await run({ qrDays: [cairoInstant(0,8), cairoInstant(0,13), cairoInstant(0,21)] })).current, 1);
t.is('00:05 today + 23:55 yesterday -> consecutive, 2',
  (await run({ qrDays: [cairoInstant(0,0), cairoInstant(1,23)] })).current, 2);
t.is('23:55 yesterday only, viewed 00:05 today -> held at 1',
  (await run({ qrDays: [cairoInstant(1,23)] })).current, 1);

t.section('Activity source union');
t.is('Focus Practice alone counts', (await run({ focusDays: [0,1,2] })).current, 3);
t.is('chat + exam + focus on consecutive days -> 3',
  (await run({ qrDays: [2], examDays: [1], focusDays: [0] })).current, 3);

t.section('best_streak semantics');
t.is('longer historical run in window sets best',
  (await run({ qrDays: [0,1,10,11,12,13,14] })).best, 5);
t.is('stored best beyond the window is preserved',
  (await run({ qrDays: [0], profile: { current_streak: 0, best_streak: 42 } })).best, 42);

t.section('Failure guard: a transient error must not wipe a streak');
const failed = await run({ qrDays: [0,1,2], profile: { current_streak: 3, best_streak: 7 },
                           fail: { question_records: true, exam_practice_sessions: true } });
t.is('no profile write attempted', failed.wrote, false);
t.is('stored current returned unchanged', failed.current, 3);
t.is('stored best returned unchanged', failed.best, 7);

t.section('last_active_date is the real last activity day');
t.is('active yesterday -> yesterday', (await run({ qrDays: [1] })).last, yday);
t.is('active today -> today', (await run({ qrDays: [0] })).last, today);

t.section('activityToday hint is opt-in and must never default on');
t.is('with hint, today counts even if the write is not yet visible',
  (await run({ qrDays: [1,2] }, { activityToday: true })).current, 3);
t.is('without hint, same fixture holds at 2', (await run({ qrDays: [1,2] })).current, 2);

t.done();
