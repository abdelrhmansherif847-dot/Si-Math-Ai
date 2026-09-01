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
t.ok('both files are marked PREPARED, not applied',
  /STATUS: 🟡 PREPARED/.test(H) && /STATUS: 🟡 PREPARED/.test(T));

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

t.done();
