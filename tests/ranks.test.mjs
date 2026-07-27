// assets/ranks.js — the consolidated XP → rank ladder.
//
// This suite is the safety net for a maintainability change: the same table was
// authored four times, and three non-frozen copies were replaced by this
// module. Equivalence is asserted against the ORIGINAL implementations (kept
// verbatim below) across every boundary value, so the consolidation cannot have
// altered what a student sees. mock-exam.html keeps its own copy because that
// file is frozen; constants-drift.test.mjs holds it in line.
import { suite } from './_assert.mjs';
import { read, evalSnippet } from './_source.mjs';

const t = suite('ranks');
const root = {};
evalSnippet(read('assets/ranks.js'), { globalThis: root, window: root }, []);
const SiRanks = root.SiRanks;

// ── The pre-consolidation implementations, verbatim ────────────────────────
const OLD_CHAT_THRESHOLDS = [
  { name: 'Elite Scholar', min: 2500 }, { name: 'Master', min: 1500 },
  { name: 'Expert', min: 1000 }, { name: 'Scholar', min: 600 },
  { name: 'Solver', min: 300 }, { name: 'Learner', min: 100 }, { name: 'Beginner', min: 0 },
];
const oldGetRankName = xp => { for (const r of OLD_CHAT_THRESHOLDS) if (xp >= r.min) return r.name; return 'Beginner'; };
const OLD_RANKS = [
  { name: 'Beginner', min: 0 }, { name: 'Learner', min: 100 }, { name: 'Solver', min: 300 },
  { name: 'Scholar', min: 600 }, { name: 'Expert', min: 1000 }, { name: 'Master', min: 1500 },
  { name: 'Elite Scholar', min: 2500 },
];
const oldGetRank = xp => { let r = OLD_RANKS[0]; for (const x of OLD_RANKS) if (xp >= x.min) r = x; return r; };
const oldGetNext = xp => { for (const x of OLD_RANKS) if (xp < x.min) return x; return null; };

// Every boundary, either side of it, plus extremes.
const XPS = [];
for (const b of [0, 100, 300, 600, 1000, 1500, 2500]) XPS.push(b - 1, b, b + 1);
XPS.push(-50, 0, 42, 999, 2499, 2500, 99999);

t.section('Equivalence with the removed implementations');
let nameOk = true, rankOk = true, nextOk = true;
for (const xp of XPS) {
  if (SiRanks.nameForXp(xp) !== oldGetRankName(Math.max(xp, 0))) {
    if (xp >= 0) { nameOk = false; t.ok(`nameForXp(${xp}) matches old chat.html`, false); }
  }
  if (SiRanks.forXp(xp).name !== oldGetRank(xp).name) { rankOk = false; t.ok(`forXp(${xp}) matches old progress/profile`, false); }
  const a = SiRanks.nextForXp(xp), b = oldGetNext(xp);
  if ((a?.name ?? null) !== (b?.name ?? null)) { nextOk = false; t.ok(`nextForXp(${xp}) matches old`, false); }
}
t.ok(`nameForXp matches old chat.html across ${XPS.length} values`, nameOk);
t.ok(`forXp matches old progress/profile across ${XPS.length} values`, rankOk);
t.ok(`nextForXp matches old across ${XPS.length} values`, nextOk);

t.section('Ladder shape');
t.is('seven ranks', SiRanks.RANKS.length, 7);
t.is('ascending by min', SiRanks.RANKS.map(r => r.min), [0,100,300,600,1000,1500,2500]);
t.is('floors at Beginner below zero', SiRanks.forXp(-1).name, 'Beginner');
t.is('top rank has no next', SiRanks.nextForXp(2500), null);
t.is('next above Beginner is Learner', SiRanks.nextForXp(0).name, 'Learner');
t.ok('every rank carries colour and icon', SiRanks.RANKS.every(r => r.color && r.icon));
t.ok('every rank carries bg (profile.html needs it)', SiRanks.RANKS.every(r => r.bg));

t.section('Pages consume the shared module, not a local copy');
for (const f of ['chat.html', 'progress.html', 'profile.html']) {
  const src = read(f);
  t.ok(`${f} loads assets/ranks.js`, /assets\/ranks\.js/.test(src));
  t.ok(`${f} no longer declares its own table`, !/RANK_THRESHOLDS = \[|RANKS = \[/.test(src));
}

t.done();
