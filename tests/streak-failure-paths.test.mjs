// Verify each regression fix against the REAL shipped assets/streak.js.
/* Relative, like every other suite. This was an absolute path into one
   machine's home directory, so the suite could only ever run there: on GitHub's
   runner, on a fresh clone, and on any other checkout it died at import with
   ERR_MODULE_NOT_FOUND before a single assertion ran — and run-all reported it
   as one red suite among fifty green ones rather than as a suite that has never
   executed anywhere but its author's laptop. Found by running the suite on a
   fresh clone; it is on main too. */
import { read, evalSnippet } from './_source.mjs';
const SRC = read('assets/streak.js');
const TZ = 'Asia/Dubai';
const keyIn = (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const today = keyIn(new Date(), TZ);
const shift = (k, n) => { const [y,m,d]=k.split('-').map(Number); const t=new Date(Date.UTC(y,m-1,d)+n*86400000); const p=x=>String(x).padStart(2,'0'); return `${t.getUTCFullYear()}-${p(t.getUTCMonth()+1)}-${p(t.getUTCDate())}`; };
function instAt(key, hour = 12) {
  const [y,m,d] = key.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m-1, d, 12));
  const off = (new Date(probe.toLocaleString('en-US',{timeZone:'UTC'})) - new Date(probe.toLocaleString('en-US',{timeZone:TZ})))/3600000;
  return new Date(Date.UTC(y, m-1, d, hour+off)).toISOString();
}
const load = () => { const w = {}; evalSnippet(SRC, { window: w }, []); return w; };

// Configurable stub. `casWins` decides whether an UPDATE matches.
function mkSb({ qr = [], row = {}, profileErr = null, casWins = () => true, onWrite = () => {} }) {
  const state = { ...row };
  const from = (table) => {
    const res = () => {
      if (table === 'question_records') return { data: qr.map(c => ({ created_at: c })), error: null };
      if (table === 'profiles') return profileErr ? { data: null, error: profileErr } : { data: { ...state }, error: null };
      return { data: [], error: null };
    };
    let g = {};
    const self = {
      select: () => self, in: () => self, gte: () => self, order: () => self, limit: () => self,
      eq(c, v) { g[c] = v; return self; },
      maybeSingle: () => Promise.resolve(res()),
      update(patch) {
        const q = { eq(c, v) { g[c] = v; return q; },
          select() {
            const ok = casWins(g, state, patch);
            if (ok) { Object.assign(state, patch); onWrite(patch); return Promise.resolve({ data: [{ id: 'u1' }], error: null }); }
            return Promise.resolve({ data: [], error: null });
          },
          then: (r) => Promise.resolve({ error: null }).then(r) };
        return q;
      },
      upsert: () => Promise.resolve({ error: null }),
      then: (ok, err) => Promise.resolve(res()).then(ok, err),
    };
    return self;
  };
  return { from, state };
}
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

// 1. CAS loser must return skipped:true and the LIVE values, not its own stale ones.
{
  const w = load();
  const sb = mkSb({
    qr: [1,2,3].map(n => instAt(shift(today, -n))),          // stale run: no activity today
    row: { current_streak: 6, best_streak: 9, last_active_date: today },  // winner saw today
    casWins: () => false,
  });
  const out = await w.updateStreak(sb, 'u1', { timezone: TZ });
  check('CAS/stale run flags skipped', out.skipped === true, `skipped=${out.skipped}`);
  check('CAS/stale run reports the live value not its own', out.current_streak === 6, `got ${out.current_streak}, want 6`);
  check('CAS/stale run does not publish a snapshot', w.getStreakSnapshot('u1') === null);
}
// 2. best_streak must never regress.
{
  const w = load();
  let wrote = null;
  const sb = mkSb({
    qr: [0,1].map(n => instAt(shift(today, -n))),
    row: { current_streak: 2, best_streak: 12, last_active_date: today },
    onWrite: p => { wrote = p; },
  });
  const out = await w.updateStreak(sb, 'u1', { timezone: TZ });
  check('best_streak floored, never rolled back', (wrote ? wrote.best_streak : out.best_streak) >= 12,
    `wrote best=${wrote && wrote.best_streak}`);
}
// 3. A failed profiles read must bail without writing.
{
  const w = load();
  let wrote = null;
  const sb = mkSb({ qr: [instAt(today)], profileErr: { message: 'boom' }, onWrite: p => { wrote = p; } });
  const out = await w.updateStreak(sb, 'u1', { timezone: TZ });
  check('profiles read failure bails', out.skipped === true, `skipped=${out.skipped}`);
  check('profiles read failure writes nothing', wrote === null, `wrote=${JSON.stringify(wrote)}`);
}
// 4. ROW_CAP truncation must not persist a shortened streak.
{
  const w = load();
  let wrote = null;
  const qr = Array.from({ length: 1000 }, (_, i) => instAt(shift(today, -Math.floor(i / 10))));  // 1000 rows ≈ 100 days
  const sb = mkSb({ qr, row: { current_streak: 140, best_streak: 140, last_active_date: today }, onWrite: p => { wrote = p; } });
  const out = await w.updateStreak(sb, 'u1', { timezone: TZ });
  check('row-cap truncation keeps the longer stored streak', out.current_streak >= 140,
    `got ${out.current_streak}, stored 140`);
}
// 5. A future last_active_date must not freeze the streak forever.
{
  const w = load();
  let wrote = null;
  const sb = mkSb({
    qr: [0,1,2].map(n => instAt(shift(today, -n))),
    row: { current_streak: 99, best_streak: 99, last_active_date: shift(today, +5) },  // impossible future date
    onWrite: p => { wrote = p; },
  });
  const out = await w.updateStreak(sb, 'u1', { timezone: TZ });
  check('future last_active_date is ignored, run proceeds', wrote !== null, `wrote=${JSON.stringify(wrote)}`);
  check('and the real streak (3) is persisted', wrote && wrote.current_streak === 3, `got ${wrote && wrote.current_streak}`);
}
// 6. A lapsed student with an EMPTY window must still reset to 0.
{
  const w = load();
  let wrote = null;
  const sb = mkSb({
    qr: [],                                                        // nothing in the window at all
    row: { current_streak: 8, best_streak: 12, last_active_date: shift(today, -400) },
    onWrite: p => { wrote = p; },
  });
  const out = await w.updateStreak(sb, 'u1', { timezone: TZ });
  check('lapsed student resets to 0', out.current_streak === 0 && wrote && wrote.current_streak === 0,
    `returned ${out.current_streak}, wrote ${wrote && wrote.current_streak}`);
  check('and best_streak survives the reset', wrote && wrote.best_streak >= 12, `best=${wrote && wrote.best_streak}`);
}
console.log(`\n${results.filter(r => r.pass).length}/${results.length} checks passed`);
process.exit(results.every(r => r.pass) ? 0 : 1);
