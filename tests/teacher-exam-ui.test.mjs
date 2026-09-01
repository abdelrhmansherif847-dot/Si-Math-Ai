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

const tables = [...new Set([...PAGE.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]))];
t.ok('the page reads tables directly (not vacuous)', tables.length >= 3);
t.is('every table it touches is one of this system\'s own', tables.filter((x) => !OWN.includes(x)), []);

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

t.done();
