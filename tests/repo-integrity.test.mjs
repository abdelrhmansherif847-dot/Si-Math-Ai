// Repo-wide integrity: every shipped script must parse, and every defect fixed
// during the 2026-07 production audit must stay fixed.
//
// The parse check is the cheap guard that would have caught a broken edit to
// any of the large HTML pages; the assertions below pin each specific fix so a
// future refactor cannot quietly reintroduce it.
import { readdirSync } from 'node:fs';
import { suite } from './_assert.mjs';
import { REPO, read, inlineScripts, jsonLdBlocks, syntaxError } from './_source.mjs';

const t = suite('repo-integrity');

t.section('Every shipped script parses');
let bad = 0, count = 0;
for (const f of readdirSync(REPO).filter(x => x.endsWith('.js'))) {
  count++; const err = syntaxError(read(f), f);
  if (err) { bad++; t.ok(`${f}: ${err}`, false); }
}
for (const f of readdirSync(`${REPO}/assets`).filter(x => x.endsWith('.js'))) {
  count++; const err = syntaxError(read(`assets/${f}`), f);
  if (err) { bad++; t.ok(`assets/${f}: ${err}`, false); }
}
t.ok(`${count} standalone JS files parse`, bad === 0);

let inlineCount = 0, inlineBad = 0;
for (const f of readdirSync(REPO).filter(x => x.endsWith('.html'))) {
  for (const [i, code] of inlineScripts(read(f)).entries()) {
    inlineCount++;
    const err = syntaxError(code, `${f}#${i + 1}`);
    if (err) { inlineBad++; t.ok(`${f}#${i + 1}: ${err}`, false); }
  }
}
t.ok(`${inlineCount} inline scripts parse`, inlineBad === 0);

// Structured data is skipped by inlineScripts() because it is JSON, not code —
// but it still has to parse, or every search engine and AI crawler that reads
// the page silently gets nothing from it.
let ldCount = 0, ldBad = 0;
for (const f of readdirSync(REPO).filter(x => x.endsWith('.html'))) {
  for (const [i, block] of jsonLdBlocks(read(f)).entries()) {
    ldCount++;
    try { JSON.parse(block); }
    catch (e) { ldBad++; t.ok(`${f} ld+json#${i + 1}: ${e.message}`, false); }
  }
}
t.ok(`${ldCount} JSON-LD blocks parse`, ldBad === 0);

t.section('Audit fixes are still in place');
const fixes = [
  ['streak: no unconditional today-seed',        () => !/const dateSet = new Set\(\[todayStr\]\)/.test(read('assets/streak.js'))],
  ['streak: anchor falls back to yesterday',     () => /dateSet\.has\(yesterdayStr\)/.test(read('assets/streak.js'))],
  // Was `qrsRes.error && examsRes.error` — requiring BOTH primaries to fail.
  // A student's activity usually lives in one source, so losing just that one
  // computed 0 from the other's empty-but-successful result and persisted it.
  // Any source failing must now bail; behaviour is covered by streak.test.mjs.
  ['streak: bails when any source fails',        () => /qrsRes\.error \|\| examsRes\.error \|\| plansRes\.error/.test(read('assets/streak.js'))],
  ['streak: bails when focus_tasks fails',       () => /focusRes\.error\)\s*\{[\s\S]{0,400}?skipped: true/.test(read('assets/streak.js'))],
  ['dashboard: heatmap reuses the streak set',   () => /streakRes\.active_days/.test(read('dashboard.html'))],
  ['dashboard: week strip is Cairo-derived',     () => /keyToUTC\(todayStr\)/.test(read('dashboard.html'))],
  ['progress: recomputes the streak',            () => /window\.updateStreak\(sb, user\.id\)/.test(read('progress.html'))],
  ['progress: dead chat_sessions query gone',    () => !/chatSess/.test(read('progress.html'))],
  ['countdown: shared helper exists',            () => read('assets/exam-days.js').includes('examDaysRemaining')],
  ['countdown: dashboard uses it',               () => /examDaysRemainingClamped/.test(read('dashboard.html'))],
  ['countdown: progress uses it',                () => /examDaysRemaining/.test(read('progress.html'))],
  ['countdown: old ceil formula gone',           () => !/Math\.ceil\(\(examDate - today0\)/.test(read('dashboard.html'))],
  ['xp: chat.html uses compare-and-set',         () => /\.eq\('xp', currentXP\)/.test(read('chat.html'))],
  ['xp: mock-exam.html uses compare-and-set',    () => /\.eq\('xp', currentXP\)/.test(read('mock-exam.html'))],
  ['history: calendar-day difference',           () => /const startOf = x =>/.test(read('history.html'))],
  ['history: old elapsed-ms formula gone',       () => !/Math\.floor\(\(now - d\) \/ 86400000\)/.test(read('history.html'))],
  ['profile: counts server-side (1000-row cap)', () => /count: 'exact', head: true/.test(read('profile.html'))],
  ['weakness: counts completed exams',           () => /exam_practice_sessions'\)\.select\('id',\{count:'exact',head:true\}\)/.test(read('weakness.html'))],
  ['weakness: old non-AI_CHAT bucket gone',      () => !/const examSigs=signals\.filter\(s=>s\.source&&s\.source!=='AI_CHAT'\)\.length/.test(read('weakness.html'))],
  ['weakness: per-source labels',                () => /SOURCE_LABELS/.test(read('weakness.html'))],
  ['ai-tutor: scope guard present',              () => /scope-guard-fired/.test(read('supabase/functions/ai-tutor/index.ts'))],
  ['ai-tutor: out-of-scope writes no record',    () => /record_id:       null,[\s\S]{0,400}scope_guard:     true/.test(read('supabase/functions/ai-tutor/index.ts'))],
  ['chat: refunds blocked turns',                () => /scope_guard === true/.test(read('chat.html'))],
];
for (const [label, fn] of fixes) { let ok = false; try { ok = fn(); } catch {} t.ok(label, ok); }

// ── SEC-07: CDN supply chain ───────────────────────────────────────────────
// Offline counterpart to scripts/pin-cdn-sri.sh --check. That script proves
// the committed hashes match the real packages but needs network; this proves
// no page can regress to a floating or unhashed CDN reference, and runs
// everywhere.
t.section('CDN pinning (SEC-07)');

const pages = readdirSync(REPO).filter(f => f.endsWith('.html'));

const unhashed = [];
const floating = [];
for (const p of pages) {
  const html = read(p);
  for (const tag of html.match(/<(script|link)[^>]*(src|href)="https:\/\/cdn\.jsdelivr\.net[^"]*"[^>]*>/g) || []) {
    if (!tag.includes('integrity='))   unhashed.push(`${p}: ${tag.slice(0, 70)}`);
    if (!tag.includes('crossorigin='))  unhashed.push(`${p}: missing crossorigin — SRI will not be enforced`);
  }
  // A live tag (not a comment) pointing at an unpinned major range.
  for (const tag of html.match(/<script[^>]*src="[^"]*supabase-js@\d+["/][^"]*"[^>]*>/g) || []) floating.push(`${p}: ${tag.slice(0, 70)}`);
  if (/<script[^>]*supabase-js\/\+esm/.test(html)) floating.push(`${p}: unpinned +esm import`);
}

t.is('every jsdelivr tag carries integrity + crossorigin', unhashed, []);
t.is('no page loads a floating supabase-js range', floating, []);
t.ok('supabase-js is pinned to an exact version somewhere',
  pages.some(p => /supabase-js@\d+\.\d+\.\d+\//.test(read(p))));
t.ok('no page pins the CDN-generated supabase.min.js (no stable hash exists)',
  !pages.some(p => read(p).includes('umd/supabase.min.js')));

t.done();
