// Drift guard for business constants that exist in more than one place.
//
// Full consolidation is not possible today: two of the four rank tables live in
// mock-exam.html and focus.html, which are FROZEN. This suite is the safe
// alternative — it cannot remove the duplication, but it makes any future
// divergence fail loudly instead of silently showing a student a different rank
// on different pages. See PRODUCTION-READINESS.md §5.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('constants-drift');

// ── Rank thresholds ────────────────────────────────────────────────────────
function ranksFromJs(file, re) {
  const m = read(file).match(re);
  if (!m) return null;
  return [...m[0].matchAll(/name:\s*'([^']+)'[^}]*?min:\s*(\d+)|min:\s*(\d+)[^}]*?name:\s*'([^']+)'/g)]
    .map(x => ({ name: x[1] ?? x[4], min: +(x[2] ?? x[3]) }))
    .sort((a, b) => a.min - b.min)
    .map(r => `${r.min}:${r.name}`).join(' | ');
}
const tables = {
  'chat.html':      ranksFromJs('chat.html',      /const RANK_THRESHOLDS = \[[\s\S]*?\];/),
  'mock-exam.html': ranksFromJs('mock-exam.html', /const RANK_THRESHOLDS = \[[\s\S]*?\];/),
  'progress.html':  ranksFromJs('progress.html',  /var RANKS = \[[\s\S]*?\];/),
  'profile.html':   ranksFromJs('profile.html',   /(?:const|var) RANKS\s*=\s*\[[\s\S]*?\];/),
};
const sqlSrc = read('supabase/migrations/20260624_focus_xp.sql');
tables['rank_for_xp (SQL)'] = [...sqlSrc.matchAll(/WHEN p_xp >=\s*(\d+) THEN '([^']+)'/g)]
  .map(m => ({ min: +m[1], name: m[2] }))
  .concat([{ min: 0, name: 'Beginner' }])
  .sort((a, b) => a.min - b.min).map(r => `${r.min}:${r.name}`).join(' | ');

t.section('Rank thresholds agree across every implementation');
const CANONICAL = '0:Beginner | 100:Learner | 300:Solver | 600:Scholar | 1000:Expert | 1500:Master | 2500:Elite Scholar';
for (const [where, val] of Object.entries(tables)) {
  t.ok(`${where} extracted`, val !== null);
  t.is(`${where} matches canonical`, val, CANONICAL);
}

// ── Generated-copy drift ───────────────────────────────────────────────────
t.section('Generated copies are byte-identical to their source');
const TAX_BANNER = '/* AUTO-GENERATED from taxonomy.core.js by scripts/sync-taxonomy.mjs — DO NOT EDIT. */\n';
const taxSrc = read('taxonomy.core.js');
for (const copy of ['taxonomy.js', 'supabase/functions/_shared/taxonomy.core.js'])
  t.ok(`${copy} in sync with taxonomy.core.js`, read(copy) === TAX_BANNER + taxSrc);

const SP_BANNER = '/* AUTO-GENERATED from supabase/functions/_shared/study-planner.core.js by scripts/sync-study-planner.mjs — DO NOT EDIT. */\n';
t.ok('study-planner.js in sync with the engine',
  read('study-planner.js') === SP_BANNER + read('supabase/functions/_shared/study-planner.core.js'));

t.section('The drift gate itself cannot self-repair');
// sync-study-planner.mjs used to write at module load, so importing it from the
// validator regenerated the file before the comparison — a gate that could
// never fail. The write must stay behind a direct-invocation guard.
const sync = read('scripts/sync-study-planner.mjs');
t.ok('sync write is guarded by a direct-invocation check', /const isMain =|if \(isMain\)/.test(sync));
t.ok('no unguarded top-level writeFileSync', !/^writeFileSync\(/m.test(sync));

// ── Credit cost fallback ───────────────────────────────────────────────────
t.section('Credit config keeps the DB authoritative');
const cc = read('credit-config.js');
t.ok('static costs are documented as a fallback only', /fallback used only before the live|DB is always authoritative/i.test(cc));
t.ok('a live config loader exists', /credit_costs/.test(cc));

t.done();
