// XP awards — profiles.xp compare-and-set, in chat.html and mock-exam.html.
//
// Regression target: both were read-modify-writes. In chat.html the defect was
// deterministic, not a rare race: awardChatXP() and drillOnQuestionAnswered()
// are both called unawaited in the same tick, and on the last question of a
// drill the latter calls awardChatXP(DRILL_BONUS_XP). Both read the same xp and
// the later write discarded the other award, so EVERY drill completion lost
// either the +5 or the +30.
//
// Both CAS blocks are extracted from the shipped pages, and the cross-file test
// races them against each other over one row — an earlier hand-rolled stand-in
// for the chat loop produced a false failure, which is exactly why these suites
// use the real bytes.
import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('xp-concurrency');

const CHAT = slice(read('chat.html'), 'const delta = base + bonus;', 'if (bonus > 0) {', 'chat CAS');
const EXAM = slice(read('mock-exam.html'), 'let currentXP = 0, newXP = null;', 'const newRank = getRankName(', 'mock-exam CAS');

// Mock client with real PostgREST filter semantics: an .eq() on a stale value
// matches zero rows rather than overwriting.
function makeDb(xp0, opts = {}) {
  const row = { xp: xp0, rank_name: 'Beginner' };
  return { row, client: { from: () => ({
    select() { return this; }, eq() { return this; },
    single() { return Promise.resolve(opts.readFails
      ? { data: null, error: { message: 'boom' } }
      : { data: { xp: row.xp }, error: null }); },
    update(patch) { return { _p: patch, _f: [],
      eq(c, v) { this._f.push([c, v]); return this; },
      select() {
        if (opts.noWrite) throw new Error('must not write after a failed read');
        const ok = this._f.every(([c, v]) => c === 'id' || row[c] === v);
        if (!ok) return Promise.resolve({ data: [], error: null });
        Object.assign(row, this._p);
        return Promise.resolve({ data: [{ xp: row.xp }], error: null });
      } }; },
  })}};
}
const getRankName = () => 'Beginner';
const runChat = (sb, base, bonus) => new Function('sb','currentUser','base','bonus','getRankName','console',
  `return (async()=>{ ${CHAT} return newXP; })();`)(sb, {id:'u1'}, base, bonus, getRankName, {warn(){}});
const runExam = (sb, xpGain) => new Function('sb','user','xpGain','getRankName','console',
  `return (async()=>{ ${EXAM} return newXP; })();`)(sb, {id:'u1'}, xpGain, getRankName, {warn(){}});

t.section('chat.html — drill completion (the deterministic loss)');
{
  const db = makeDb(100);
  await Promise.all([runChat(db.client, 5, 0), runChat(db.client, 0, 30)]);
  t.is('both awards land: 100 + 5 + 30 = 135', db.row.xp, 135);
}
{
  // The old algorithm, for contrast: two reads of the same value, later write wins.
  const db = makeDb(100);
  const old = async (delta) => { const cur = db.row.xp; await new Promise(r => setTimeout(r, 5)); db.row.xp = cur + delta; };
  await Promise.all([old(5), old(30)]);
  t.ok(`old read-modify-write lost an award (gave ${db.row.xp})`, db.row.xp !== 135);
}
{
  const db = makeDb(0);
  await Promise.all([0,1,2,3,4].map(() => runChat(db.client, 5, 0)));
  t.is('5 concurrent +5 awards all land', db.row.xp, 25);
}

t.section('mock-exam.html — exam save racing a chat award (second tab)');
{
  const db = makeDb(200);
  const [examXP, chatXP] = await Promise.all([runExam(db.client, 50), runChat(db.client, 5, 0)]);
  t.is('both land: 200 + 50 + 5 = 255', db.row.xp, 255);
  t.ok('each side reports its own distinct total', examXP !== chatXP);
}

t.section('Uncontended paths unchanged');
{
  const db = makeDb(42);
  t.is('chat +5: 42 -> 47', await runChat(db.client, 5, 0), 47);
}
{
  const db = makeDb(100);
  t.is('exam +25: 100 -> 125', await runExam(db.client, 25), 125);
}
{
  const db = makeDb(0);
  t.is('first exam +50 from 0', await runExam(db.client, 50), 50);
}

t.section('A failed read must not clobber xp');
// The two abort differently ON PURPOSE, so assert the invariant that matters
// (no write, xp untouched) rather than a sentinel value:
//   chat.html   `return`s — the whole award is abandoned, skipping the
//               achievement checks that follow, because XP never landed.
//   mock-exam   `break`s  — the exam save must still complete (achievements,
//               success screen), so it falls through with newXP === null.
{
  const db = makeDb(777, { readFails: true, noWrite: true });
  // makeDb throws from update().select() if a write is attempted at all.
  let chatWrote = false, examWrote = false;
  try { await runChat(db.client, 5, 0); } catch { chatWrote = true; }
  try { await runExam(db.client, 25); }  catch { examWrote = true; }
  t.ok('chat attempted no write after a failed read', !chatWrote);
  t.ok('exam attempted no write after a failed read', !examWrote);
  t.is('xp untouched', db.row.xp, 777);
}
{
  const db = makeDb(500, { readFails: true, noWrite: true });
  t.is('mock-exam falls through with null so the save still completes',
    await runExam(db.client, 25), null);
}

t.done();
