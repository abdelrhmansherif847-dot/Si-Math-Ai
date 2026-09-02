// Teacher Homework — contract suite.
//
// Part 1 (this file today): increment H1, the five audit labels. Enum labels
// are the one thing in this project that cannot be undone cleanly, so the
// checks below are about the label SET being exactly the five approved names
// in the approved order, appended rather than positioned, with nothing else
// riding along — and about the rollback posture telling the truth about what
// it can and cannot do. Parts 2+ (tables, RPCs, surfaces) follow their own
// increments.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('teacher-homework');
const F = read('supabase/migrations/20260902a_workspace_audit_homework_actions.sql');
const R = read('supabase/migrations/20260902z_workspace_audit_homework_actions_rollback.sql');
const B = read('supabase/migrations/20260901b_workspace_audit_exam_actions.sql');   // the type as 3a left it

/* Code, not prose: every ban below is applied with comments stripped, so a
   header that EXPLAINS why there is no 'homework_deleted' cannot trip a check
   that forbids one. */
const code = (s) => s.replace(/--[^\n]*/g, '');
const FC = code(F), RC = code(R);
const constant = (src, name) => {
  const m = src.match(new RegExp(name + ' constant text :=\\s*((?:\\s*\'[^\']*\')+)\\s*;'));
  if (!m) throw new Error(name + ' not found');
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).join('');
};

const SIXTEEN = ['workspace_created', 'join_code_rotated', 'student_joined', 'student_left',
  'student_removed', 'staff_joined', 'staff_activated', 'staff_removed',
  'exam_created', 'exam_published', 'exam_closed', 'exam_code_rotated',
  'exam_access_requested', 'exam_access_approved', 'exam_access_rejected', 'exam_access_revoked'];
const FIVE = ['homework_created', 'homework_published', 'homework_closed', 'homework_code_rotated', 'homework_attached'];

// ══ 1 · FIVE LABELS, APPENDED, AND NOTHING ELSE ═══════════════════════════
t.section('H1 adds exactly the five approved labels, appended');

const added = [...FC.matchAll(/alter type workspace_audit_action add value if not exists '([a-z_]+)';/g)].map((m) => m[1]);
t.is('the five labels, in the approved order', added, FIVE);
t.ok('each is IF NOT EXISTS (a run that dies mid-way must be re-runnable)',
  (FC.match(/add value if not exists/g) || []).length === 5 && !/add value '(?!if)/.test(FC));
t.ok('appended, never positioned', !/\b(before|after)\s+'/i.test(FC));
t.is('no other object rides along: no table, column, policy, function, trigger, grant',
  [...FC.matchAll(/^\s*(create|alter|drop)\s+(table|policy|function|trigger|index|view|schema|role)\b|^\s*(grant|revoke)\b/gim)].map((m) => m[0].trim()), []);
t.is('no row is written', [...FC.matchAll(/^\s*(insert|update|delete|truncate)\s/gim)].map((m) => m[0].trim()), []);
t.is('the type is the only thing altered', [...new Set([...FC.matchAll(/alter type ([a-z_]+)/g)].map((m) => m[1]))], ['workspace_audit_action']);

// ══ 2 · THE VERIFICATION COULD GO RED ═════════════════════════════════════
t.section('The in-file verification asserts the whole ordered list');

t.is('expected = the sixteen labels 3a left, then the five, in order',
  constant(F, 'v_expected').split(','), SIXTEEN.concat(FIVE));
t.ok('it compares the whole ordered string, not a count', /string_agg\(e\.enumlabel, ',' order by e\.enumsortorder\)/.test(FC) && /is distinct from v_expected/.test(FC));
/* The stored-row invariant names the labels that HAVE writers today. 3a listed
   eight because the exam labels had none yet; now they do, so all sixteen. */
const invariant = (() => {
  const m = FC.match(/action::text <> all \(array\[([\s\S]*?)\]\)/);
  return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null;
})();
t.is('the stored-row invariant lists exactly the sixteen labels with writers', invariant, SIXTEEN);
t.ok('and it is an invariant, not a pinned row count', !/count\(\*\)\s*(=|<>)\s*\d/.test(FC));
t.ok('it records what it cannot check: a write test must run post-apply, in an aborting transaction',
  /CANNOT check/.test(F) && /post-apply/.test(F) && /abort/.test(F));

// ══ 3 · THE FILE TELLS THE TRUTH ABOUT ITSELF ═════════════════════════════
t.section('Irreversibility, the PG property, and the writing convention are recorded');

t.ok('marked PREPARED, not applied', /STATUS: 🟡 PREPARED, not applied/.test(F));
t.ok('says it is not cleanly reversible and why (no DROP VALUE)', /NOT CLEANLY REVERSIBLE/.test(F) && /no ALTER TYPE \.\.\. DROP VALUE/.test(F));
t.ok('records the measured property that forces the split', /unsafe use of new value/.test(F) && /cannot work as one unit/.test(F));
t.ok('records why exactly five — no deleted, no opened/submitted, no access family (no queue)',
  /homework_deleted/.test(F) && /homework_submitted/.test(F) && /no approval queue/.test(F));
t.ok('records the subject_id convention for every label',
  /homework_created \/ homework_published \/ homework_closed \/ homework_code_rotated[\s\S]{0,120}subject_id NULL/.test(F)
  && /homework_attached[\s\S]{0,120}subject_id = the STUDENT/.test(F));
t.ok('points at the decisions it implements', /§15\.14/.test(F) && /§15\.15/.test(F));

// ══ 4 · THE ROLLBACK POSTURE ══════════════════════════════════════════════
t.section('20260902z refuses to destroy history and rebuilds the exact pre-H1 type');

const refuse = (() => { const m = RC.match(/action::text = any \(array\[([\s\S]*?)\]\)/); return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null; })();
t.is('it refuses if ANY of the five labels is already recorded', refuse, FIVE);
t.ok('the refusal precedes the drop', RC.indexOf('rollback H1 refused') < RC.indexOf('drop type workspace_audit_action'));
const recreated = (() => { const m = RC.match(/create type workspace_audit_action as enum \(([\s\S]*?)\);/); return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null; })();
t.is('it recreates exactly the sixteen pre-H1 labels, in PostgreSQL\'s order', recreated, SIXTEEN);
t.is('which equals the forward file\'s list minus the five', recreated, constant(F, 'v_expected').split(',').slice(0, 16));
t.ok('it widens the column to text, then narrows it back onto the type',
  /alter column action type text/.test(RC) && /alter column action type workspace_audit_action\s+using action::workspace_audit_action/.test(RC));
t.is('its verification expects the sixteen', constant(R, 'v_expected').split(','), SIXTEEN);
t.ok('and checks the column is back ON the type, not left as text', /format_type\(a\.atttypid, a\.atttypmod\)/.test(RC) && /not workspace_audit_action/.test(RC));
t.ok('it is marked PREPARED and unpleasant, and records that its window closes with the first homework RPC',
  /STATUS: 🔴 PREPARED/.test(R) && /no ALTER TYPE \.\.\. DROP VALUE/.test(R) && /closes the moment/.test(R));
t.ok('the sixteen it rebuilds are exactly what 3a\'s own verification expected',
  constant(B, 'v_expected').split(',').join() === SIXTEEN.join());

// ══ 5 · SCOPE ══════════════════════════════════════════════════════════════
t.section('Nothing else moved');
t.is('no homework table, RPC or policy is smuggled in with the labels',
  [...(FC + RC).matchAll(/teacher_homework[a-z_]*/g)].map((m) => m[0]), []);

t.done();
