// Class-wide weakness aggregate — contract suite.
//
// Part 1 (this file today): the ONE backend change the aggregate needs, and
// why it is the smallest one. Decision (b) of teacher-intelligence-layer.md
// §15.11 keys the aggregate on the STORED weakness_reports.subtopic_id and
// forbids resolving labels to recover one — and no teacher read carried the
// stored id. 20260901h widens teacher_student_weaknesses() by two trailing
// columns and nothing else; 20260901t puts it back byte-for-byte.
//
// The checks below are what stop "and nothing else" from drifting: the body is
// asserted to differ from 20260830d's by exactly the two added select lines,
// the working numbers stay withheld, the three gates stay verbatim, and the
// rollback recreates the exact prosrc and asserts its way back to the
// pre-apply md5.
//
// Part 2 (the teacher.html card) is added when the read is live.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('teacher-class-patterns');
const D = read('supabase/migrations/20260830d_teacher_weakness_read.sql');
const H = read('supabase/migrations/20260901h_teacher_weakness_read_ids.sql');
const T = read('supabase/migrations/20260901t_teacher_weakness_read_ids_rollback.sql');

/* prosrc — what pg_get_functiondef() will show between the dollar quotes. */
const body = (src) => {
  const a = src.indexOf('as $$'), b = src.indexOf('\n$$;', a);
  if (a < 0 || b < 0) throw new Error('function body could not be located');
  return src.slice(a + 5, b);
};
const columns = (src) => {
  const a = src.indexOf('returns table ('), b = src.indexOf(')\nlanguage plpgsql', a);
  if (a < 0 || b < 0) throw new Error('returns block could not be located');
  return src.slice(a + 15, b).split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(/,$/, '').split(/\s+/)[0]);
};
const TEN = ['topic', 'subtopic', 'severity_band', 'priority_rank', 'trend', 'last_signal_at',
             'total_signals', 'signals_ai_chat', 'signals_mock_exam', 'signals_focus'];

// ══ 1 · TWO COLUMNS, AND NOTHING ELSE ═════════════════════════════════════
t.section('20260901h adds the two stored ids and changes nothing else');

t.is('20260830d declares the ten approved columns (the baseline is not vacuous)', columns(D), TEN);
t.is('20260901h declares those ten, then topic_id and subtopic_id, TRAILING',
  columns(H), TEN.concat(['topic_id', 'subtopic_id']));
t.ok('the two are typed text, as the columns they mirror are',
  /topic_id\s+text,\n\s+subtopic_id\s+text\n/.test(H));

/* The body diff must be exactly: a trailing comma on the focus line and the
   two added select lines. Anything else — a reordered gate, a changed join, a
   coalesce that manufactures an id — makes the reconstruction fail. */
const reconstructed = body(H)
  .replace('           coalesce(s.focus, 0),\n           r.topic_id,\n           r.subtopic_id\n',
           '           coalesce(s.focus, 0)\n');
t.ok('the body differs from 20260830d by exactly the two added select lines', reconstructed === body(D));
t.ok('the ids are read from the row as stored — never resolved or coalesced from a label',
  /^\s+r\.topic_id,\n\s+r\.subtopic_id\n/m.test(body(H)) && !/resolve|coalesce\(r\.(topic|subtopic)_id/.test(body(H)));

t.is('the analyzer\'s working numbers stay withheld from the signature',
  ['weakness_score', 'mastery_score', 'improvement_score', 'recent7_count', 'recent14_count', 'biggest_weakness']
    .filter((c) => columns(H).includes(c)), []);
for (const gate of ['not staff of this workspace', 'no active link to this student', 'that student is not in this workspace']) {
  t.ok(`the gate "${gate}" is still raised`, body(H).includes(`raise exception 'teacher_student_weaknesses: ${gate}' using errcode = '42501'`));
}

// ══ 2 · WHY A DROP, AND THE POSTURE AFTER IT ══════════════════════════════
t.section('A return-type change is a DROP, so posture and ACL are re-stated');

const dropAt = H.indexOf('drop function if exists teacher_student_weaknesses(uuid, uuid);');
const createAt = H.indexOf('create function teacher_student_weaknesses(p_workspace uuid, p_student uuid)');
t.ok('the function is dropped before it is created', dropAt > 0 && createAt > dropAt);
t.ok('and created with CREATE, not CREATE OR REPLACE (the drop is load-bearing)',
  !/create or replace function teacher_student_weaknesses/.test(H));
for (const [name, re] of [
  ['security definer', /\nsecurity definer\n/],
  ['search_path pinned to pg_catalog, public', /\nset search_path = pg_catalog, public\n/],
  ['stable', /\nstable\n/],
  ['the default ACL stripped', /revoke all on function teacher_student_weaknesses\(uuid, uuid\) from public, anon, authenticated;/],
  ['EXECUTE granted to authenticated only', /grant execute on function teacher_student_weaknesses\(uuid, uuid\) to authenticated;/],
  ['the comment re-stated (a DROP discards it)', /comment on function teacher_student_weaknesses\(uuid, uuid\) is/],
]) t.ok(name, re.test(H));
/* Statement lines only: the prose "then grant deliberately" sits a few words
   before "from public, anon" in the revoke, and an unanchored match trips on it. */
t.ok('no grant reaches anon or public', !/^\s*grant\b[^;]*\b(anon|public)\b/im.test(H));

/* The file must be able to fail on apply. */
t.ok('the in-file verification pins the exact twelve-column signature',
  /if v_sig <> 'TABLE\(topic text, [^']*signals_focus integer, topic_id text, subtopic_id text\)' then/.test(H));
t.ok('and refuses anon, public, a non-definer, and an unpinned search_path',
  ["has_function_privilege('anon', v_oid, 'EXECUTE')", "has_function_privilege('public', v_oid, 'EXECUTE')",
   'not security definer', 'search_path is not pinned'].every((s) => H.includes(s)));

// ══ 3 · THE ROLLBACK IS A TRUE UNDO ═══════════════════════════════════════
t.section('20260901t restores 20260830d byte-for-byte and proves it');

t.ok('the rollback recreates the EXACT 20260830d body', body(T) === body(D));
t.is('with the ten columns and no ids', columns(T), TEN);
t.ok('it asserts the pre-apply md5 of pg_get_functiondef()',
  /md5\(pg_get_functiondef\(v_oid\)\) <> '889dfaaa49437d18fcdeae095be5c47d'/.test(T));
t.ok('it re-states the ACL for the same reason the forward file does',
  /revoke all on function teacher_student_weaknesses\(uuid, uuid\) from public, anon, authenticated;/.test(T)
  && /grant execute on function teacher_student_weaknesses\(uuid, uuid\) to authenticated;/.test(T));
t.ok('the forward file records its apply (version 20260901220926) and the rollback stays PREPARED',
  /STATUS: ✅ APPLIED 2026-09-01[\s\S]{0,200}20260901220926/.test(H) && /STATUS: 🟡 PREPARED/.test(T));
t.ok('the forward file records the verified live md5, and it is the file\'s own',
  /5d69fc5116d3f78416b30d68714c752a/.test(H));

// ══ 4 · NOTHING ELSE IS TOUCHED ═══════════════════════════════════════════
t.section('Neither file touches any other object or any row');

for (const [label, src] of [['20260901h', H], ['20260901t', T]]) {
  t.is(`${label} creates or alters no table, policy, trigger, type or other function`,
    [...src.matchAll(/^\s*(create|alter|drop)\s+(table|policy|trigger|type|index|view|schema|role)\b[^\n]*/gim)].map((m) => m[0].trim()), []);
  t.is(`${label} writes no row`, [...src.matchAll(/^\s*(insert|update|delete|truncate)\s+[^\n]*/gim)].map((m) => m[0].trim()), []);
  t.is(`${label} names no function but the one it widens`,
    [...new Set([...src.matchAll(/(?:create|drop)\s+function(?: if exists)?\s+([a-z_]+)/gi)].map((m) => m[1]))]
      .filter((f) => f !== 'teacher_student_weaknesses'), []);
}

// ══ 5 · THE RULE, RUN ═════════════════════════════════════════════════════
// Part 2. The rule lives in teacher.html between two markers as a PURE
// function, so this suite can lift it out and run it rather than pattern-
// match its source. Every rule below is the §15.11 one, exercised on data.
const TP = read('teacher.html');
const blockOf = (src, a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('teacher.html: block ' + a + ' could not be located');
  return src.slice(i, j);
};
const PURE = blockOf(TP, '/* ── class patterns · pure ── */', '/* ── end class patterns · pure ── */');
const PAGE_BLK = blockOf(TP, '/* ── class patterns · page ── */', '/* ── end class patterns · page ── */');
const { PATTERN_RULES, classPatterns } = new Function(PURE + '\nreturn { PATTERN_RULES, classPatterns };')();
/* The bans below are on CODE. The block's comments say "outside the window" and
   "never resolved here", and a ban that trips on its own explanation is a ban
   that gets deleted — so comments are stripped before scanning. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const PURE_CODE = code(PURE), PAGE_CODE = code(PAGE_BLK);

t.section('The rule is the pre-registered one, and it is pure');
t.is('the three numbers are inherited — 14 days, 3 students, 20%',
  [PATTERN_RULES.freshDays, PATTERN_RULES.minStudents, PATTERN_RULES.minSharePct], [14, 3, 20]);
t.ok('and frozen', Object.isFrozen(PATTERN_RULES) && Object.isFrozen(PATTERN_RULES.severeBands));
t.is('"high or critical" is the set teacher_attention() counts, declared once', PATTERN_RULES.severeBands, ['high', 'critical']);
/* teacher-surface pins the whole page against `severity_band <>=`: the page
   must never shape a band of its own. The count reads the STORED band against
   the declared set and compares nothing. */
t.ok('the stored band is never compared, only looked up', !/severity_band\s*[<>=!]/.test(PURE_CODE) && /severeBands\.indexOf\(r\.severity_band\)/.test(PURE_CODE));
t.is('the pure block reaches no DOM, network, page state or role',
  [...PURE_CODE.matchAll(/\b(document|window|sb|fetch|isTeacher)\b|\$\(|\bS\./g)].map((m) => m[0]), []);
t.is('it never resolves a label — no taxonomy, no resolver, no canonicalFor',
  [...PURE_CODE.matchAll(/Taxonomy|resolve|canonicalFor|normalize/gi)].map((m) => m[0]), []);
t.ok('trend is neither read nor emitted', !/trend/.test(PURE_CODE));

const NOW = Date.parse('2026-09-01T12:00:00Z');
const at = (days) => new Date(NOW - days * 86400000).toISOString();
const row = (o) => Object.assign({ topic: 'Algebra', subtopic: 'Linear', severity_band: 'medium', priority_rank: 1,
  trend: null, last_signal_at: at(3), total_signals: 1, signals_ai_chat: 1, signals_mock_exam: 0, signals_focus: 0,
  topic_id: 'ALGEBRA', subtopic_id: 'ALG_006' }, o);
const stu = (id, rows) => ({ student_id: 's' + id, full_name: 'Student ' + id, rows });
const filler = (k, from) => Array.from({ length: k }, (_, i) => stu(from + i, []));
const run = (per) => classPatterns(per, NOW);
const names = (res) => res.patterns.map((p) => p.subtopic_id + ':' + p.n + '/' + p.m);

t.section('Identity: the stored subtopic_id, and nothing else');
t.is('four spellings of one stored id are one pattern',
  names(run([stu(1, [row({ subtopic: 'Linear' })]), stu(2, [row({ subtopic: 'Linear Equations' })]),
             stu(3, [row({ subtopic: 'Slope & Rate of Change' })]), stu(4, [row({ subtopic: 'solving linear equations' })])])),
  ['ALG_006:4/4']);
t.is('one label under three stored ids is no pattern',
  names(run([stu(1, [row({ subtopic_id: 'ALG_006' })]), stu(2, [row({ subtopic_id: 'ALG_007' })]), stu(3, [row({ subtopic_id: 'ALG_008' })])])), []);
const nulls = run([stu(1, [row({ subtopic_id: null, topic_id: null })]), stu(2, [row({ subtopic_id: null })]), stu(3, [row({ subtopic_id: null })])]);
t.is('rows without a stored id form no pattern, however many students share the label', names(nulls), []);
t.is('and every one of them is counted as excluded', nulls.excluded, 3);
const blanks = run([stu(1, [row({ subtopic_id: '' })]), stu(2, [row({ subtopic_id: '' })]), stu(3, [row({ subtopic_id: '' })])]);
t.is('an empty-string id is a missing id', [names(blanks), blanks.excluded], [[], 3]);
t.is('a null-id row outside the window is not "excluded" — it is simply outside',
  run([stu(1, [row({ subtopic_id: null, last_signal_at: at(20) })])]).excluded, 0);

t.section('Freshness: 14 days, applied before counting');
t.is('a signal exactly 14 days old still counts',
  names(run([stu(1, [row({ last_signal_at: at(14) })]), stu(2, [row({ last_signal_at: at(14) })]), stu(3, [row({ last_signal_at: at(14) })])])), ['ALG_006:3/3']);
t.is('a signal 15 days old does not',
  names(run([stu(1, [row({ last_signal_at: at(15) })]), stu(2, [row()]), stu(3, [row()])])), []);
t.is('an undated row is neither counted nor excluded',
  (() => { const r = run([stu(1, [row({ last_signal_at: null })])]); return [r.fresh, r.excluded]; })(), [0, 0]);

t.section('Counting: distinct students, both thresholds, integer arithmetic');
const split = run([stu(1, [row({ subtopic: 'a' }), row({ subtopic: 'b' }), row({ subtopic: 'c' })]), stu(2, [row()])]);
t.is('a student with three rows on one id counts once (2 students, so no pattern)', names(split), []);
t.is('3 of 5 qualifies (60%)', names(run([stu(1, [row()]), stu(2, [row()]), stu(3, [row()])].concat(filler(2, 4)))), ['ALG_006:3/5']);
t.is('2 of 5 does not — fewer than 3 students', names(run([stu(1, [row()]), stu(2, [row()])].concat(filler(3, 3)))), []);
t.is('3 of 20 does not — 15% is under a fifth', names(run([stu(1, [row()]), stu(2, [row()]), stu(3, [row()])].concat(filler(17, 4)))), []);
t.is('3 of 15 qualifies — exactly 20% is enough',
  names(run([stu(1, [row()]), stu(2, [row()]), stu(3, [row()])].concat(filler(12, 4)))), ['ALG_006:3/15']);
t.is('4 of 20 qualifies', names(run([stu(1, [row()]), stu(2, [row()]), stu(3, [row()]), stu(4, [row()])].concat(filler(16, 5)))), ['ALG_006:4/20']);
const unread = run([stu(1, [row()]), stu(2, [row()]), stu(3, [row()]), stu(4, null)]);
t.is('a refused read stays in the denominator and is reported, never guessed', [unread.unreadable, names(unread)], [1, ['ALG_006:3/4']]);

t.section('What is disclosed, as stored');
const dis = run([stu(1, [row({ severity_band: 'high', signals_ai_chat: 5, signals_mock_exam: 1 }), row({ subtopic: 'b', severity_band: 'low', signals_focus: 2, last_signal_at: at(1) })]),
                 stu(2, [row({ severity_band: 'critical' })]), stu(3, [row({ severity_band: 'medium' })]), stu(4, [row({ severity_band: 'low' })])]);
const P0 = dis.patterns[0];
t.is('high and critical students are counted once each; medium and low are not', P0.severe, 2);
t.is('the source mix sums every contributing row (5+1, 1, 1, 1 conversation signals)', P0.sources, { ai_chat: 9, mock_exam: 1, focus: 2 });
t.is('the freshest signal is the newest contributing date', P0.freshest, at(1));
t.is('the students behind the pattern are listed, for the drawer',
  P0.students.map((x) => x.student_id), ['s1', 's2', 's3', 's4']);
t.ok('the pattern carries no trend', !('trend' in P0));
const two = run([stu(1, [row(), row({ subtopic_id: 'GEO_006', subtopic: 'Circles', topic_id: 'GEOMETRY' })]),
                 stu(2, [row(), row({ subtopic_id: 'GEO_006' })]), stu(3, [row(), row({ subtopic_id: 'GEO_006' })]), stu(4, [row()])]);
t.is('patterns are ordered by students first, then by id — never by anything arbitrary', names(two), ['ALG_006:4/4', 'GEO_006:3/4']);

// ══ 6 · THE CARD ══════════════════════════════════════════════════════════
t.section('The card: under Attention, silent by default, parity, drawer');

const iAtt = TP.indexOf('<div id="attention" style="display:none">');
const iPat = TP.indexOf('<div id="patterns" style="display:none">');
const iNeed = TP.indexOf('<div id="needsYou" style="display:none">');
t.ok('the block sits directly under Attention and above Needs you', iAtt > 0 && iPat > iAtt && iNeed > iPat);
t.ok('it ships hidden', iPat > 0);
t.ok('and is hidden again whenever there is nothing to say',
  /if \(!P \|\| \(!P\.patterns\.length && !P\.excluded && !P\.unreadable\)\) \{ \$\('patterns'\)\.style\.display = 'none'; return; \}/.test(PAGE_BLK));
t.ok('the page block never tests the role — teacher and assistant see the same card', !/isTeacher/.test(PAGE_BLK));
t.ok('it reads through the existing gated per-student read, per active student',
  /S\.roster\.filter\(\(r\) => r\.status === 'active'\)/.test(PAGE_BLK)
  && /api\.weaknesses\(S\.ws\.workspace_id, r\.student_id\)/.test(PAGE_BLK));
t.is('it adds no RPC and no table read', [...PAGE_BLK.matchAll(/rpc\(|\.from\(/g)].map((m) => m[0]), []);
t.ok('a refused read becomes rows: null, not a guess', /catch \(_\) \{ return \{ student_id: r\.student_id, full_name: r\.full_name, rows: null \}; \}/.test(PAGE_BLK));
t.ok('names are looked up BY ID for display, and nothing is resolved',
  /_subtopicById\[p\.subtopic_id\]/.test(PAGE_CODE) && /_topicById\[p\.topic_id\]/.test(PAGE_CODE) && !/resolve|canonicalFor/.test(PAGE_CODE));
t.ok('every student behind a pattern opens the existing drawer',
  /data-sid="' \+ esc\(x\.student_id\)/.test(PAGE_BLK) && /openCard\(el\.dataset\.sid\)/.test(PAGE_BLK));
t.ok('the basis is stated: weakness evidence, not exam correctness', /<strong>not from exam correctness<\/strong>/.test(PAGE_BLK));
t.ok('the exclusion is disclosed as unmapped evidence', /could not be counted — unmapped topics/.test(PAGE_BLK));
t.ok('an unreadable student is disclosed too', /could not be read and/.test(PAGE_BLK));
t.ok('copy takes its numbers from the rule, so copy and rule cannot drift',
  /R\.freshDays/.test(PAGE_BLK) && /R\.minStudents/.test(PAGE_BLK) && /R\.minSharePct/.test(PAGE_BLK)
  && !/\b14 days\b|\b20%|at least 3 /.test(PAGE_BLK));
t.ok('trend is never rendered', !/trend/.test(PAGE_CODE));
t.ok('patterns load after the roster and render after Attention',
  /loadRoster\(\)\.then\(loadPatterns\)/.test(TP) && /renderAttention\(\);\n  renderPatterns\(\);/.test(TP));
t.ok('removing a student recomputes the class patterns', /renderAttention\(\);\n      await loadPatterns\(\);\n      renderPatterns\(\);/.test(TP));
const SCOPE = blockOf(TP, "$('scopeNote').innerHTML", 'renderIntervention');
t.is('the scope note tells BOTH roles how class patterns are counted', (SCOPE.match(/\+ patternsSentence\(\)/g) || []).length, 2);
t.ok('and that sentence says never from exam correctness', /never from exam correctness/.test(PAGE_BLK));

t.done();
