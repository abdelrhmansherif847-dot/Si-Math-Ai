// Contract suite for the Teacher Exam authoring surface (3f).
//
// 3f added no schema at all — the live audit proved every authoring read is
// already served by 3b's staff-read policies. So what there is to check is not
// a migration but a PAGE, and specifically the four ways a page like this goes
// wrong quietly:
//
//   1. it calls an RPC nobody wrote, or reaches a table outside this system;
//   2. it writes through a table instead of an RPC, which would need a grant
//      that deliberately does not exist;
//   3. it gates on the wrong thing — teacher-only, when assistants have locked
//      academic parity;
//   4. it draws stimuli itself instead of using the shipped renderer, so what a
//      teacher previews stops being what a student will see.
//
// Every check below is written so it COULD go red: each names the exact string
// whose absence would be the breach, against a page that really does contain
// the other strings around it.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('teacher-exam-ui');

const PAGE = read('teacher-exams.html');
const TEACHER = read('teacher.html');
const MIG = {
  b: read('supabase/migrations/20260901d_teacher_exam_rls.sql'),
  c: read('supabase/migrations/20260901e_teacher_exam_authoring.sql'),
  d: read('supabase/migrations/20260901f_teacher_exam_access.sql'),
  e: read('supabase/migrations/20260901g_teacher_exam_sitting.sql'),
  f: read('supabase/migrations/20260907a_teacher_exam_reads.sql'),
};
const exec = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const DEFINED = Object.values(MIG).map(exec).join('\n');

// Tables this page may touch. The six teacher-exam tables and nothing else —
// notably not profiles, not weakness_*, not the platform exam catalogue.
const OWN = ['teacher_exams', 'teacher_exam_stimuli', 'teacher_exam_questions',
             'teacher_exam_access', 'teacher_exam_attempts', 'teacher_exam_responses'];

// ══ 1 · PROVENANCE ════════════════════════════════════════════════════════
t.section('Every call the page makes is one somebody wrote');

const rpcs = [...new Set([...PAGE.matchAll(/\.rpc\('([a-z_]+)'/g)].map((m) => m[1]))];
t.ok('the page calls RPCs (not vacuous)', rpcs.length >= 12);
t.is('every RPC is defined by an applied teacher-exam migration',
  rpcs.filter((fn) => !new RegExp(`create or replace function ${fn}\\s*\\(`, 'i').test(DEFINED)
                   && fn !== 'teacher_my_workspaces'), []);

const TABLE_RE = /\.from\('([a-z_]+)'\)/g;
const tables = [...new Set([...PAGE.matchAll(TABLE_RE)].map((m) => m[1]))];
/* Until the I-2a page switch this read `tables.length >= 3`. The page now
   reaches the database ONLY through RPCs, so the claim inverts. OWN is kept
   because it still names what a table read would have to be if one came back. */
t.is('the page reads NO table directly — every read is an RPC', tables, []);
t.ok('…and the detector can still find a table read when there is one',
  [...`sb.from('teacher_exams').select('*')`.matchAll(TABLE_RE)].map((m) => m[1])
    .filter((x) => OWN.includes(x)).length === 1);

// ══ 2 · WRITES GO THROUGH RPCs, NEVER THROUGH A TABLE ═════════════════════
t.section('No client write path — there is no grant for one');
for (const verb of ['insert', 'update', 'upsert', 'delete']) {
  t.ok(`the page never calls .${verb}( on a table`,
    !new RegExp(`\\.from\\('[a-z_]+'\\)[\\s\\S]{0,80}\\.${verb}\\(`).test(PAGE));
}

// ══ 3 · THE GATE ══════════════════════════════════════════════════════════
t.section('Gated on ACTIVE staff — teacher and assistant alike');

t.ok('it gates on staff_status active', /staff_status === 'active'/.test(PAGE));
// The breach this names: gating on the ROLE would lock assistants out of a
// surface a locked decision gives them.
t.ok('it does NOT gate the page on staff_role',
  !/staff_role\s*===\s*'teacher'/.test(PAGE) && !/isTeacherRole/.test(PAGE));
t.ok('a denial state exists for everyone else', /id="denyState"/.test(PAGE));
t.ok('signed-out visitors are sent to login', /location\.href = 'login\.html'/.test(PAGE));

t.ok('teacher.html links to the page', /href="teacher-exams\.html"/.test(TEACHER));
// The contrast that makes the parity check meaningful: the Partner link IS
// role-gated in the same file, so an unguarded reveal here is a choice.
t.ok('the Teaching link is revealed without a role test',
  /^\s*\$\('sideExamsLink'\)\.style\.display = '';/m.test(TEACHER));
t.ok('and the Partner link still IS role-gated (the check is not vacuous)',
  /if \(S\.isTeacher\) \$\('sidePartnerLink'\)\.style\.display = '';/.test(TEACHER));

// ══ 4 · ONE RENDERER ══════════════════════════════════════════════════════
t.section('Preview uses the shipped renderer, not a second one');

t.ok('the page loads stimulus-view.js', /<script src="stimulus-view\.js">/.test(PAGE));
t.ok('preview goes through window.StimulusView.render',
  (PAGE.match(/window\.StimulusView\s*\n?\s*\?\s*window\.StimulusView\.render|window\.StimulusView\.render\(/g) || []).length >= 2);
// A second implementation would look like the renderer's own internals turning
// up here: an <svg> being built by hand, or a <table> assembled from a spec.
t.ok('the page builds no SVG of its own', !/<svg[^>]*viewBox[^>]*>\s*<(?:polyline|path d="M)/.test(
  PAGE.replace(/<svg viewBox="0 0 24 24"[\s\S]*?<\/svg>/g, '')));
t.ok('the page does not read spec.headers or spec.rows itself',
  !/spec\.headers|spec\.rows|\.spec\['headers'\]/.test(PAGE));

// ══ 5 · ALL SIX STIMULUS KINDS ════════════════════════════════════════════
t.section('Every kind the renderer supports is offerable');
for (const kind of ['text', 'table', 'chart', 'plot', 'number_line', 'figure']) {
  t.ok(`the kind picker offers ${kind}`, new RegExp(`<option value="${kind}"`).test(PAGE));
}
t.ok('a figure is uploaded as SVG and base64-encoded', /readAsText|btoa\(/.test(PAGE));
t.ok('a non-SVG upload is refused client-side', /<svg\/i\.test\(txt\)|\/<svg\/i/.test(PAGE));

// ══ 6 · EVERY LIFECYCLE STATE IS RENDERED ═════════════════════════════════
t.section('Empty, draft, published, closed — and every request state');

t.ok('an empty exam list says so', /No exams yet/.test(PAGE));
t.ok('an empty request queue says so', /No requests yet/.test(PAGE));
t.ok('an empty results table says so', /Nobody has sat this yet/.test(PAGE));
for (const st of ['draft', 'published', 'closed']) {
  t.ok(`the ${st} status is styled`, new RegExp(`\\.pill\\.${st}\\{`).test(PAGE));
}
for (const st of ['pending', 'approved', 'rejected', 'revoked']) {
  t.ok(`the ${st} request state is styled`, new RegExp(`\\.pill\\.[a-z,.]*${st}`).test(PAGE));
}
t.ok('an outsider is visibly marked in the queue',
  /pill outsider">not in this class</.test(PAGE));
t.ok('editing is shut off once the exam leaves draft',
  /\$\('stimCard'\)\.classList\.toggle\('hide', !draft\)/.test(PAGE)
  && /\$\('qCard'\)\.classList\.toggle\('hide', !draft\)/.test(PAGE));
t.ok('the code panel only appears once published', /\$\('codeCard'\)\.classList\.toggle\('hide', draft\)/.test(PAGE));
t.ok('rotate is offered only while published',
  /\$\('btnRotate'\)\.classList\.toggle\('hide', e\.status !== 'published'\)/.test(PAGE));

// ══ 7 · THE THINGS A UI IS MOST LIKELY TO GET WRONG ═══════════════════════
t.section('Bulk approve, reorder, and the answer key');

// §15.14: bulk approval must never sweep in an outsider. The RPC enforces it;
// the page must not hand it outsiders and hope.
t.ok('approve-all sends only current members',
  /filter\(\(r\) => r\.state === 'pending' && r\.is_member_now\)/.test(PAGE));
t.ok('and it reports whoever was skipped', /data\.skipped/.test(PAGE));

// The reorder RPC refuses a partial list; sending one would be a runtime error
// on every move.
t.ok('reorder sends the whole ordered list', /S\.questions\.map\(\(q\) => q\.id\)/.test(PAGE));

// This page is staff-only, so it SHOWS the key — that is correct and is what
// makes the student-side absence meaningful. What must never happen is the
// page treating the key as something to render for a learner.
t.ok('the preview says the key is never shown to a student',
  /answer key is never shown to a student/.test(PAGE));

// ══ 8 · ESCAPING ══════════════════════════════════════════════════════════
t.section('Author text can never become markup');
t.ok('the page defines esc()', /const esc = \(s\) =>/.test(PAGE));
const TEXTY = 'title|full_name|label|prompt|kind|exam_code|state|status|text|name';
t.ok('escaped interpolations exist (not vacuous)',
  new RegExp(`\\+ esc\\([a-z]\\.(?:${TEXTY})\\b`).test(PAGE));
const raw = [...PAGE.matchAll(new RegExp(`\\+\\s*(?!esc\\()[a-z]\\.(?:${TEXTY})\\b`, 'g'))]
  .map((m) => m[0].trim());
t.is('no author-controlled field is concatenated into HTML without esc()', raw, []);

// ══ 9 · THE I-2a PAGE SWITCH ══════════════════════════════════════════════
t.section('Reads go through the two staff RPCs, not the tables');

/* I-2a installed teacher_exam_list and teacher_exam_paper; this increment
   moved the page onto them. The grants the page used to rely on are still in
   place — I-2b takes them, and only once this is live. */
t.ok('the page calls teacher_exam_list', /sb\.rpc\('teacher_exam_list', \{ p_workspace: ws \}\)/.test(PAGE));
t.ok('the page calls teacher_exam_paper', /sb\.rpc\('teacher_exam_paper', \{ p_exam: id \}\)/.test(PAGE));
t.is('and the four table-read api entries are gone',
  ['exams:', 'exam:', 'questions:', 'stimuli:'].filter((k) => PAGE.includes(`  ${k}`)), []);

/* The id is called exam_id by the RPC and homework_id by H6's twin. The page
   follows the RPC rather than keeping a local alias, so a reader greps the
   function and finds the field. */
t.is('no S.exam.id survives the rename', (PAGE.match(/S\.exam\.id\b/g) || []), []);
t.ok('S.exam.exam_id is used throughout (not vacuous)',
  (PAGE.match(/S\.exam\.exam_id\b/g) || []).length >= 15);
t.ok('the list tile keys on exam_id', /data-exam="' \+ esc\(e\.exam_id\)/.test(PAGE));

/* Every field the page reads off S.exam must be one teacher_exam_paper
   actually returns, or the screen renders undefined. Checked against the
   migration's own jsonb_build_object rather than a list retyped here. */
const PAPER_SQL = read('supabase/migrations/20260907a_teacher_exam_reads.sql')
  .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const headerKeys = [...PAPER_SQL.slice(PAPER_SQL.indexOf('jsonb_build_object'),
                                       PAPER_SQL.indexOf("'stimuli'"))
  .matchAll(/'(\w+)',/g)].map((m) => m[1]);
t.ok('the paper header keys were located (not vacuous)', headerKeys.length >= 13);
const examReads = [...new Set([...PAGE.matchAll(/S\.exam\.(\w+)/g)].map((m) => m[1]))];
t.ok('S.exam reads were located (not vacuous)', examReads.length >= 3);
t.is('every S.exam field is one the paper returns',
  examReads.filter((f) => !headerKeys.includes(f)), []);

/* Same claim for the list, against its returns-table. */
const listCols = [...PAPER_SQL.slice(PAPER_SQL.indexOf('returns table ('),
                                     PAPER_SQL.indexOf('language plpgsql'))
  .matchAll(/^\s{2}(\w+)\s+\w/gm)].map((m) => m[1]);
t.ok('the list columns were located (not vacuous)', listCols.length === 15);
const tileReads = [...new Set([...PAGE.slice(PAGE.indexOf("$('examList').innerHTML = rows.map"),
                                             PAGE.indexOf("$('examList').querySelectorAll"))
  .matchAll(/\be\.(\w+)/g)].map((m) => m[1]))];
t.ok('the tile field reads were located (not vacuous)', tileReads.length >= 4);
t.is('every field the tile reads is a column the list returns',
  tileReads.filter((f) => !listCols.includes(f)), []);

/* media_sha256 was shipped to this page by the old select('*') and is not in
   the RPC. Its absence is the read-boundary narrowing I-2a exists for. */
t.is('media_sha256 reaches the page nowhere', (PAGE.match(/media_sha256/g) || []), []);

/* openExam fetches the paper ONCE and hands it to both loaders — three reads
   became one. The loaders still re-read when called with nothing, which is
   what the five content handlers do. */
t.ok('openExam passes its fetched paper to both loaders',
  /await Promise\.all\(\[loadStimuli\(e\), loadQuestions\(e\)\]\)/.test(PAGE));
for (const fn of ['loadStimuli', 'loadQuestions']) {
  t.ok(`${fn} re-reads through api.paper when called with nothing`,
    new RegExp(`async function ${fn}\\(paper\\) \\{\\s*const p = paper \\|\\| \\(await api\\.paper\\(S\\.exam\\.exam_id\\)\\)\\.data;`).test(PAGE));
}

/* The five content handlers must NOT refresh through openExam(): it clears
   stimMsg and qMsg, and each of them has just written a success message
   there. teacher-homework.html can reload the whole screen because it shows
   no success message at all; this page shows five. */
for (const [label, msg] of [['Figure updated.', 'stimMsg'], ['Figure deleted.', 'stimMsg'],
                            ['Question updated.', 'qMsg'],
                            ['Question deleted, and the numbering closed up.', 'qMsg']]) {
  t.ok(`"${label}" is still written to ${msg}`,
    new RegExp(`say\\(\\$\\('${msg}'\\),[^;]*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(PAGE));
}
const handlers = PAGE.slice(PAGE.indexOf('async function saveStimulus'),
                            PAGE.indexOf('/* ── publish / close / rotate'));
t.ok('the content handlers were located (not vacuous)', handlers.length > 2000);
t.is('and none of them refreshes through openExam()',
  (handlers.match(/openExam\(/g) || []), []);

t.done();
