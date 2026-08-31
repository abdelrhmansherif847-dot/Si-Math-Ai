// The class-wide attention list — an attention budget, not a feed.
//
// The risk here is not a wrong pixel. It is a teacher's minute spent on the
// wrong student, or a student marked as struggling who was not
// (teacher-intelligence-layer.md §6.4). So this suite is built around the three
// ways this feature could quietly lie:
//
//   1. by using a signal that does not mean what its name says
//   2. by presenting an ABSENCE of evidence as an academic weakness
//   3. by presenting STALE evidence as a present-tense fact
//
// Each has a section below. The unreliable-signal list is not decoration: all
// three were measured against production before the design was written, and two
// of them look perfectly usable until you check.

import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('teacher-attention');

const MIG  = read('supabase/migrations/20260831a_teacher_attention.sql');
const BACK = read('supabase/migrations/20260831z_teacher_attention_rollback.sql');
const PAGE = read('teacher.html');
const exec = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const SQL  = exec(MIG);
/** The function body only, so a check cannot be satisfied by the header essay. */
const BODY = slice(SQL, 'create or replace function teacher_attention', 'comment on function', 'attention body');

// ══ 1 · ACCESS SCOPE ══════════════════════════════════════════════════════
t.section('The narrowest safe scope, and no wider');

t.ok('the read exists', /create or replace function teacher_attention\(p_workspace uuid\)/.test(SQL));
t.ok('it is gated on ACTIVE staff of THIS workspace',
  /if not workspace_is_active_staff\(p_workspace\) then/.test(BODY));
t.ok('and refuses with 42501, like every other teaching read',
  /teacher_attention: not staff of this workspace[\s\S]{0,60}42501/.test(BODY));
t.ok('security definer with a pinned search_path',
  /security definer/.test(SQL) && /set search_path = pg_catalog, public/.test(SQL));
t.ok('stable — it reads and never writes', /\bstable\b/.test(SQL));
for (const verb of ['insert into', 'update ', 'delete from']) {
  t.ok(`the body never does: ${verb.trim()}`, !new RegExp(`\\n\\s*${verb}`, 'i').test(BODY));
}
t.ok('revoked from public/anon/authenticated, then granted deliberately',
  /revoke all on function teacher_attention\(uuid\) from public, anon, authenticated/.test(SQL));
t.is('granted to authenticated and nobody else',
  (SQL.match(/grant execute on function teacher_attention\(uuid\) to (\w+)/g) || []),
  ['grant execute on function teacher_attention(uuid) to authenticated']);

/* It must return strictly LESS than the per-student read that is already
   approved: aggregates only, never the per-topic list, never the analyzer's
   withheld working numbers. */
t.is('the analyzer working scores never appear',
  ['weakness_score', 'mastery_score', 'improvement_score', 'biggest_weakness']
    .filter((c) => new RegExp(`\\b${c}\\b`).test(BODY)), []);
t.ok('no per-topic detail is returned',
  !/\btopic\b\s+text/.test(SQL.slice(SQL.indexOf('returns table'), SQL.indexOf('language plpgsql'))));
t.is('nothing commercial or contactable crosses over',
  ['email', 'plan_code', 'credits_balance', 'is_founder', 'xp']
    .filter((c) => new RegExp(`\\b${c}\\b`).test(BODY)), []);

// ══ 2 · ACTIVE LINKS ONLY ═════════════════════════════════════════════════
t.section('Only students actually connected right now');

t.ok('the roster CTE filters to active links', /ws\.status\s*=\s*'active'/.test(BODY));
t.ok('and honours link expiry', /ws\.expires_at is null or ws\.expires_at\s*>\s*now\(\)/.test(BODY));
t.ok('it is scoped to the requested workspace', /ws\.workspace_id\s*=\s*p_workspace/.test(BODY));

// ══ 3 · THE UNRELIABLE SIGNALS ════════════════════════════════════════════
t.section('Three signals that look usable and are not');

/* trend: 20 of 225 rows (9%).
   recent7/14_count: frozen at report-generation time, not "the last N days" —
     one student carries 205 "recent 7-day" signals while 43 days silent.
   priority_rank: ranks within ONE student, so every student has a rank 1. */
for (const bad of ['trend', 'recent7_count', 'recent14_count', 'priority_rank']) {
  t.ok(`${bad} is never read`, !new RegExp(`\\b${bad}\\b`).test(BODY));
}
t.ok('the page never reads them either',
  !/\.trend\b|recent7_count|recent14_count|priority_rank/.test(
    slice(PAGE, 'function renderAttention', 'function renderNeedsYou', 'attention renderer')));
/* And the reasons are recorded, so a future reader does not "restore" them. */
t.ok('the migration records WHY each is excluded',
  /frozen at generation/i.test(MIG) && /9%/.test(MIG) && /WITHIN one student/i.test(MIG));

// ══ 4 · ABSENCE OF EVIDENCE IS NOT A WEAKNESS ═════════════════════════════
t.section('A student we know nothing about is not a struggling student');

t.ok('a student with no report still appears (LEFT JOIN, not INNER)',
  /left join weakness_reports/.test(BODY));
t.ok("they are labelled 'no_evidence'", /when s\.last_sig is null\s+then 'no_evidence'/.test(BODY));
const R = slice(PAGE, 'function renderAttention', 'function renderNeedsYou', 'attention renderer');
t.ok('the page says it is an absence, in words',
  /absence of evidence, not a weakness/.test(R));
t.ok('and shows no severity for them',
  /headline = 'No learning activity recorded yet'/.test(R));
t.ok('the SQL gives them no severity band and no count to display',
  /case when s\.last_sig is null then s\.jat end/.test(BODY));

// ══ 5 · STALE EVIDENCE IS NEVER A PRESENT-TENSE FACT ══════════════════════
t.section('Freshness decides the tier, not just the caption');

/* weakness_reports is a snapshot as of the student's LAST SIGNAL, so three
   high-severity topics can be a month old. Ranking those above one fresh topic
   by count alone would state something false. */
t.ok('a freshness threshold exists and is named', /FRESH_DAYS constant int := 14/.test(BODY));
t.ok("stale evidence classifies as 'quiet', never 'struggling'",
  /when s\.quiet_days\s*>\s*FRESH_DAYS\s+then 'quiet'/.test(BODY));
t.ok("'struggling' requires BOTH current evidence and severity",
  /when s\.hc\s*>\s*0\s+then 'struggling'/.test(BODY)
  && BODY.indexOf("then 'quiet'") < BODY.indexOf("then 'struggling'"));
t.ok('the tier is the first sort key, so position and reason agree',
  /order by[\s\S]{0,220}?quiet_days\s*<=\s*FRESH_DAYS and s\.hc\s*>\s*0 then 1/.test(BODY));
/* Not a count — a count survives one branch losing its date. Every branch that
   states something about a student must date what it states. */
const DATED = R.match(/dated = [\s\S]*?;\n/g) || [];
t.is('there are exactly three reason branches', DATED.length, 3);
t.is('every one of them dates what it claims', DATED.filter((d) => !/when\(r\./.test(d)), []);
t.ok('the quiet row without severity still carries its date',
  /: 'Last signal ' \+ when\(r\.last_signal_at\)/.test(R));
t.ok('the quiet row dates the severity it mentions',
  /when they stopped, on ' \+ when\(r\.last_signal_at\)/.test(R));

// ══ 6 · THE BUDGET ════════════════════════════════════════════════════════
t.section('An attention budget, not a feed');

t.ok('the cap is five, and it lives in SQL where no caller can widen it',
  /limit 5;/.test(BODY));
t.ok('the page does not re-slice or paginate', !/slice\(0,|\.length > 5/.test(R));
t.ok('an empty result hides the section rather than filling it',
  /if \(!rows \|\| !rows\.length\) \{ \$\('attention'\)\.style\.display = 'none'; return; \}/.test(R));

/* Ordering must be identical between loads or the list cannot be trusted. */
t.ok('ties break on a stable key, never something arbitrary', /s\.nm asc, s\.sid asc/.test(BODY));

/* The list names people. Removing one of them must not leave their name on the
   page — the server would drop them on the next read, but the page has to ask. */
t.ok('removing a student re-reads the attention list, not just the roster',
  /await Promise\.all\(\[loadRoster\(\), loadAttention\(\)\]\);[\s\S]{0,80}renderAttention\(\);/.test(PAGE));

/* The preview is the only place this section can be seen without real students,
   so it has to be a faithful rehearsal: every tier shown, every row clickable,
   and no name that could be mistaken for somebody real. */
const FIX = slice(PAGE, '  attention: [', '  ws: {', 'attention fixture');
const ROSTER = slice(PAGE, '  roster: [', '  ],', 'roster fixture');
t.is('every previewed reason is one the renderer can draw',
  [...FIX.matchAll(/reason: '(\w+)'/g)].map((m) => m[1]).sort(),
  ['no_evidence', 'quiet', 'struggling']);
t.is('every previewed row points at a student the preview can actually open',
  [...FIX.matchAll(/student_id: '(\w+)'/g)].map((m) => m[1])
    .filter((id) => !new RegExp(`student_id: '${id}'`).test(ROSTER)), []);
t.is('and carries that student\'s own placeholder name',
  [...FIX.matchAll(/student_id: '(\w+)', full_name: '([^']+)'/g)]
    .filter(([, id, nm]) => !new RegExp(`student_id: '${id}', full_name: '${nm}'`).test(ROSTER)), []);

// ══ 7 · DEPLOY ORDER AND THE ROLLBACK ═════════════════════════════════════
t.section('Safe in either deploy order');

t.ok('a failed read hides the section instead of breaking the page',
  /if \(error\) return null;/.test(slice(PAGE, 'async attention(ws)', 'async roster(ws)', 'attention read')));
t.ok('the loader treats an unavailable read as null',
  /catch \(_\) \{ S\.attention = null; \}/.test(PAGE));
t.is('the rollback drops only this function',
  (exec(BACK).match(/\bdrop [\s\S]*?;/g) || []).map((d) => d.replace(/\s+/g, ' ').trim()),
  ['drop function if exists teacher_attention(uuid);']);
t.is('the migration creates exactly one function',
  (SQL.match(/create or replace function (\w+)/g) || []),
  ['create or replace function teacher_attention']);
t.ok('no table, policy or trigger is touched',
  !/\b(alter table|create table|create policy|drop policy|create trigger)\b/i.test(SQL));

t.done();
