// preflight-exam-form.mjs — the guard around the pre-flight query.
//
// The pre-flight exists because publish_exam_form() raises on the FIRST failure
// and publication is irreversible: without it, the only way to ask "is this
// form ready?" is to attempt the one action that cannot be undone.
//
// WHAT THIS SUITE CAN AND CANNOT DO
// ---------------------------------
// It cannot execute SQL — the repo has no package.json and no Postgres driver,
// deliberately. So it asserts the PROPERTIES of the emitted query that a wrong
// answer would violate: that it cannot write, that its expectation really came
// from the registry, that a hostile form code cannot escape its quotes, and
// that its checks read only the CTEs.
//
// The query's LOGIC was validated separately by substituting synthetic rows for
// the source CTEs and running the real checks against them — every check proven
// to fire, and a complete correct form proven to produce no false positives.
// That run is recorded in the Authoring Workflow v1 report; it is a one-time
// validation in the M1/M3 style, not something CI repeats.
//
// Every assertion here could fail. Per docs/roadmap/verification-framework-audit.md:
// a green check is only evidence if it could have gone red.
import { suite } from './_assert.mjs';
import { preflightSQL, sourceCTEs, CHECKS_SQL } from '../scripts/preflight-exam-form.mjs';
import { expectationFor } from '../scripts/gen-exam-expectation.mjs';

const t = suite('exam-preflight');

const SQL = preflightSQL('ESTM1-2026-A', 'EST_MATH_1');

/** Strip -- line comments so keyword checks read code, not prose. */
const stripComments = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

/**
 * Comments and string literals removed, leaving only SQL structure.
 *
 * Both removals are load-bearing. Several detail messages legitimately contain
 * a semicolon — "' min; found '", "' question row(s); question_count is '" —
 * so counting statements without stripping literals reports four statements for
 * a query that has one. (That was this suite's own first bug.) Stripping
 * literals also stops a keyword appearing in prose from reading as code.
 */
const skeleton = (sql) => stripComments(sql).replace(/'(?:[^']|'')*'/g, "''");

function threw(fn) {
  try { fn(); return null; } catch (e) { return e.message; }
}

// ── The property the whole design rests on ─────────────────────────────────
t.section('The emitted query cannot write');

// The header advertises "READ-ONLY ... Safe to run against production". An
// operator will trust that line and paste this into a production console. If a
// future edit introduced a write, the promise in the comment would still read
// exactly the same — which is precisely why the check belongs here.
const code = skeleton(SQL);
for (const kw of ['insert', 'update', 'delete', 'drop', 'alter', 'truncate',
                  'grant', 'revoke', 'create', 'merge']) {
  t.ok(`no ${kw.toUpperCase()} in the emitted SQL`,
    !new RegExp(`\\b${kw}\\b`, 'i').test(code));
}
t.ok('the query is a single statement', code.split(';').filter((s) => s.trim()).length === 1);

// The stripper must actually strip, or every check above passes vacuously.
t.ok('skeleton() removes string literals', !skeleton("select 'INSERT INTO t'").includes('INSERT'));
t.ok('skeleton() keeps code outside literals', skeleton("select 'x' from t").includes('from t'));

// ── The checks must be a pure function of the CTEs ─────────────────────────
t.section('The checks read the CTEs, never the tables');

// This is what makes the synthetic-data validation meaningful: if a check read
// public.exam_questions directly, the harness would silently measure the real
// (empty) table instead of the scenario, and every scenario would look clean.
// Two checks did exactly that before this suite existed.
for (const tbl of ['public.exam_forms', 'public.exam_form_sections',
                   'public.exam_questions', 'public.exam_stimuli']) {
  t.ok(`the checks half never touches ${tbl}`, !CHECKS_SQL.includes(tbl));
  t.ok(`the source half does touch ${tbl}`, sourceCTEs('X', 'EST_MATH_1').includes(tbl));
}

// ── The expectation is derived, not typed ──────────────────────────────────
t.section('The embedded expectation comes from the registry');

t.ok('the EST_MATH_1 expectation is embedded verbatim from the generator',
  SQL.includes(JSON.stringify(expectationFor('EST_MATH_1'))));
t.ok('a SAT_FULL pre-flight embeds the variant slots',
  preflightSQL('X', 'SAT_FULL').includes(JSON.stringify(expectationFor('SAT_FULL'))));

// The generator's two distinct failure modes must survive the extra layer
// rather than being flattened into one unhelpful message.
t.ok('an unknown exam code still fails as an unknown code',
  (threw(() => preflightSQL('X', 'NOPE')) || '').includes('unknown exam code'));
t.ok('a dynamic exam still fails as a dynamic exam',
  (threw(() => preflightSQL('X', 'PRACTICE')) || '').includes('dynamic exam has no fixed structure'));

// ── Quoting ────────────────────────────────────────────────────────────────
t.section('A form code cannot break out of its literal');

// Form codes are operator input. A stray apostrophe must produce valid SQL, not
// a syntax error the operator debugs by hand — and nothing worse than that.
const hostile = preflightSQL("O'Brien", 'EST_MATH_1');
t.ok('a quote in the form code is doubled', hostile.includes("'O''Brien'"));
t.ok('the quote does not terminate the literal early',
  !hostile.includes("select 'O'Brien'"));
const injected = preflightSQL("x'; drop table public.exam_forms; --", 'EST_MATH_1');
t.ok('an injection attempt stays inside the string literal',
  !new RegExp('\\bdrop\\b', 'i').test(skeleton(injected)));

// ── Eligibility semantics ──────────────────────────────────────────────────
t.section('ERROR blocks publication; WARNING never does');

// Every rule publish_exam_form() enforces needs a counterpart here, or the
// pre-flight quietly under-reports and an author believes a form is ready when
// the gate will reject it.
const EXPECTED_CHECKS = [
  'form-exists', 'form-status', 'exam-code',
  'slot-match', 'section-count', 'section-unexpected',
  'variant-mixing', 'variant-unknown',
  'question-count', 'question-ordinal-missing', 'question-ordinal-range',
  'question-status', 'question-difficulty', 'question-attestation',
  'question-explanation',
  'stimulus-orphan', 'stimulus-media-exception',
];
for (const c of EXPECTED_CHECKS) {
  t.ok(`the ${c} check is present`, CHECKS_SQL.includes(`'${c}'`));
}

// The WARNING set is pinned exactly. Each of these is something the database
// accepts and Si Math AI does not want: promoting any to ERROR would make the
// pre-flight refuse a form the gate would take, which is changing the M3 and
// M4 contracts from the outside. Adding one silently is just as wrong.
const warningChecks = [...CHECKS_SQL.matchAll(/'WARNING',\s*'([a-z-]+)'/g)].map((m) => m[1]);
t.is('the WARNING set is exactly these three', warningChecks.sort(),
  ['question-explanation', 'stimulus-media-exception', 'stimulus-orphan']);
for (const w of ['question-explanation', 'stimulus-orphan', 'stimulus-media-exception']) {
  t.ok(`${w} is never raised as an ERROR`,
    !new RegExp(`'ERROR',\\s*'${w}'`).test(CHECKS_SQL));
}
// The media exception is only narrow while someone reads the reasons.
t.ok('the media-exception warning prints the stated reason',
  CHECKS_SQL.includes('st.media_reason'));
t.ok('the WARNING says plainly that the gate does not enforce it',
  CHECKS_SQL.includes('publish_exam_form() does not check this'));

// The OK row must depend on ERRORs only — a WARNING-only form is still eligible.
t.ok('eligibility is decided by ERROR rows alone',
  CHECKS_SQL.includes("where not exists (select 1 from findings where severity = 'ERROR')"));
t.ok('WARNINGs sort last so the blocking rows are read first',
  CHECKS_SQL.includes("order by (r.severity = 'WARNING')"));

t.done();
