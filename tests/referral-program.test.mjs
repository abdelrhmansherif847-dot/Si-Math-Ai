// The Teacher Partner Program — a commission layer on the existing classroom.
//
// This is money, so the suite is built around the five ways it could quietly
// pay the wrong amount to the wrong person:
//
//   1. by computing a payout from a number the payer typed
//   2. by awarding twice for one purchase, or once for a renewal
//   3. by depending on which of the two payment paths was used
//   4. by rewriting history when a teacher crosses a tier
//   5. by showing a teacher's earnings to somebody who is not that teacher
//
// Every section below is one of those. The constraint checks are not a
// restatement of the schema: they assert that the RULE is carried by the
// constraint rather than by code that a future function could forget.

import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('referral-program');

const TABLES = read('supabase/migrations/20260831b_referral_tables.sql');
const ENGINE = read('supabase/migrations/20260831c_referral_engine.sql');
const RPCS   = read('supabase/migrations/20260831d_referral_rpcs.sql');
const HOOKS  = read('supabase/migrations/20260831e_referral_payment_hooks.sql');
const BACK   = read('supabase/migrations/20260831y_referral_rollback.sql');

/** Executable SQL only. These files carry long headers that legitimately NAME
 *  the things they promise not to do. */
const exec = (s) => s.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
                     .replace(/\/\*[\s\S]*?\*\//g, '');
const X = { TABLES: exec(TABLES), ENGINE: exec(ENGINE), RPCS: exec(RPCS), HOOKS: exec(HOOKS) };
const ALL = X.TABLES + '\n' + X.ENGINE + '\n' + X.RPCS;

// ══ 1 · THE PAYOUT BASE IS NEVER CLIENT INPUT ═════════════════════════════
t.section('The payer cannot type their own commission');

/* payment_requests.amount_egp is a direct client insert: no trigger, no CHECK,
   and an RLS WITH CHECK of only auth.uid() = user_id. A commission computed
   from it would be a payout amount the student sets. */
t.ok('the price is resolved from the catalogue',
  /select \* into v_plan from plan_definitions where plan_code = p_plan_code/.test(X.ENGINE));
t.is('no referral SQL ever reads a request or payment amount',
  [...ALL.matchAll(/(payment_requests|payments)\.amount_egp/g)].map((m) => m[0]), []);
/* Not enough on its own: an unqualified amount_egp inside `from
   payment_requests` reads the same client-typed number. The two functions that
   decide money may not reference either payment table AT ALL. (The historical
   backfill legitimately does, and is a separate top-level statement.) */
const fnBody = (src, name) => {
  const i = src.indexOf(`function ${name}(`);
  return src.slice(i, src.indexOf('$$;', i));
};
for (const fn of ['record_purchase_event', 'referral_award_from_event']) {
  t.is(`${fn} never reaches into a payment table`,
    [...fnBody(X.ENGINE, fn).matchAll(/\b(payment_requests|payments)\b/g)].map((m) => m[0]), []);
}
t.ok('record_purchase_event takes NO amount parameter, so no caller can pass one',
  /create or replace function record_purchase_event\(\s*p_source_kind text, p_source_id uuid, p_user_id uuid, p_plan_code text\)/.test(X.ENGINE));
t.ok('and the award reads the price off the event, not off its caller',
  /v_amount := round\(new\.gross_egp \* v_rate\.rate_bps \/ 10000\.0, 2\)/.test(X.ENGINE));

// ══ 2 · THE RULES ARE CONSTRAINTS, NOT CODE ═══════════════════════════════
t.section('Rules a future function cannot forget');

t.ok('one first purchase per student, ever',
  /student_user_id\s+uuid not null unique references auth\.users/.test(X.TABLES));
t.ok('one award per payment, however often the engine fires',
  /unique \(source_kind, source_id\)[\s\S]{0,200}?\);\s*$/m.test(X.TABLES)
  && (X.TABLES.match(/unique \(source_kind, source_id\)/g) || []).length === 2);
t.ok('one teacher per student, as a primary key',
  /student_user_id uuid primary key references auth\.users/.test(X.TABLES));
t.ok('one code per teacher, as a primary key',
  /teacher_user_id uuid primary key references auth\.users/.test(X.TABLES));
t.ok('a teacher cannot refer themselves, in the schema',
  /check \(teacher_user_id <> student_user_id\)/.test(X.TABLES));
t.is('money records are never destroyed by a cascade',
  [...X.TABLES.matchAll(/on delete cascade/g)].map((m) => m[0]), []);
t.ok('they are pinned with RESTRICT instead',
  (X.TABLES.match(/on delete restrict/g) || []).length >= 6);

// ══ 3 · RATES ARE INTEGERS, AND THE LADDER IS WHOLE ═══════════════════════
t.section('Basis points, and a ladder with no gaps');

t.ok('rates are integer basis points', /rate_bps\s+integer not null check \(rate_bps between 0 and 10000\)/.test(X.TABLES));
t.is('the seeded ladder is exactly 10 / 12.5 / 15 per cent',
  [...X.TABLES.matchAll(/\((\d+),\s*(\d+),\s*(\d+|null),\s*(\d+), '([^']+)'\)/g)].map((m) => m.slice(2, 6).join('|')),
  ['1|9|1000|10%', '10|29|1250|12.5%', '30|null|1500|15%']);
/* A float percentage is the failure that makes a payout un-arguable-about.
   Two ways in: a decimal literal, or a rate column with a fractional type. */
t.is('no rate is ever written as a decimal fraction',
  [...ALL.matchAll(/rate\w*\s*(?:[:=]|default)\s*0?\.\d+/gi)].map((m) => m[0]), []);
t.is('and no rate column is numeric, real or double',
  [...ALL.matchAll(/^\s*\w*rate\w*\s+(numeric|real|double precision|float\d*)/gim)].map((m) => m[0].trim()), []);
t.ok('the ladder is validated as a SET, not row by row',
  /must be contiguous from 1/.test(TABLES) && /exactly one referral rate band must be open-ended/.test(TABLES));
t.ok('and that validation is a constraint trigger', /create constraint trigger referral_rates_guard_trg/.test(X.TABLES));

// ══ 4 · ONE MECHANISM ACROSS BOTH PAYMENT PATHS ═══════════════════════════
t.section('A commission cannot depend on which path was used');

t.ok('only ONE thing in the whole system creates a commission',
  (ALL.match(/insert into referral_commissions/g) || []).length === 1);
t.ok('and it hangs off the canonical event, not off a payment function',
  /create trigger referral_award_trg\s+after insert on purchase_events/.test(X.ENGINE));

const hooked = [...X.HOOKS.matchAll(/(?:perform|PERFORM) public\.record_purchase_event\('(\w+)'/g)].map((m) => m[1]);
t.is('all four successful returns announce the purchase', hooked,
  ['payment_request', 'payment_request', 'payment', 'payment']);
t.is('the hooks redefine exactly the three payment functions',
  [...X.HOOKS.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map((m) => m[1]).sort(),
  ['activate_credit_pack', 'activate_subscription', 'approve_payment_request']);

/* Each added line must sit AFTER the state change and BEFORE the success
   return — never on a path that returns ok:false. */
for (const fn of X.HOOKS.split(/CREATE OR REPLACE FUNCTION/).slice(1)) {
  const name = (fn.match(/public\.(\w+)/) || [])[1];
  const added = fn.split('\n').map((l, i) => [l, i]).filter(([l]) => /record_purchase_event/.test(l));
  for (const [, i] of added) {
    const after = fn.split('\n').slice(i + 1).join('\n');
    t.ok(`${name}: the announcement is followed by a SUCCESS return`,
      /^\s*(return|RETURN)[\s\S]{0,80}?'ok',\s*(true|\n\s*true)/m.test(after));
  }
}
t.is('no early failure path announces anything',
  X.HOOKS.split('\n').filter((l) => /record_purchase_event/.test(l) && /'ok', false/.test(l)), []);
/* An announcement wrapped in a condition is an announcement that can be
   skipped, which is exactly the "depends on the path" failure this design
   exists to remove. Each added line must be a bare statement. */
t.is('every announcement is unconditional',
  X.HOOKS.split('\n').filter((l) => /record_purchase_event/.test(l))
    .filter((l) => !/^\s*(perform|PERFORM) public\.record_purchase_event\([^;]*\);\s*(--.*)?$/.test(l)), []);

// ══ 5 · HISTORY IS FROZEN ═════════════════════════════════════════════════
t.section('Crossing a tier never rewrites what was already earned');

for (const col of ['gross_egp', 'rate_bps', 'tier_label', 'paid_count_at_award', 'commission_egp']) {
  t.ok(`${col} is stored on the award, not derived later`,
    new RegExp(`^\\s{2}${col}\\s`, 'm').test(X.TABLES));
}
/* Existing as a column is not the same as being frozen. The guard has to name
   each one, or a tier change could rewrite what was already earned. */
const GUARD = X.TABLES.slice(X.TABLES.indexOf('function referral_commissions_guard'),
                             X.TABLES.indexOf('referral_commissions_guard_trg'));
t.is('the guard names every frozen column',
  ['gross_egp', 'rate_bps', 'tier_label', 'paid_count_at_award', 'commission_egp',
   'student_user_id', 'teacher_user_id']
    .filter((c) => !new RegExp(`new\\.${c}\\s*<>\\s*old\\.${c}`).test(GUARD)), []);
t.ok('and says so when it refuses',
  /the award is frozen; only status and payout fields may change/.test(X.TABLES));
t.ok('a reversal excludes the row from future tier counts',
  /where teacher_user_id = v_attr\.teacher_user_id and status <> 'reversed'/.test(X.ENGINE));
t.ok('an accounting row is never deleted',
  /accounting rows are never deleted/.test(X.TABLES));

// ══ 6 · WHO MAY SEE EARNINGS ══════════════════════════════════════════════
t.section('A teacher, and nobody standing next to them');

/* can_staff is TRUE for assistants. Gating a partner surface on it would show
   one teacher's commissions to their assistant. */
t.is('no referral function is gated on can_staff or workspace_is_active_staff',
  [...X.RPCS.matchAll(/can_staff|workspace_is_active_staff/g)].map((m) => m[0]), []);
t.ok('eligibility is the existing teacher relationship',
  /s\.staff_role = 'teacher'\s+and s\.status = 'active' and w\.is_active/.test(X.RPCS));
t.is('and no new role is invented anywhere',
  [...ALL.matchAll(/create type\s+\w*role|alter type user_role/gi)].map((m) => m[0]), []);

for (const fn of ['teacher_referral_code\\(\\)', 'teacher_referral_summary\\(\\)', 'teacher_referral_students\\(\\)']) {
  t.ok(`${fn.replace(/\\/g, '')} refuses anyone who is not an active teacher`,
    new RegExp(`create or replace function ${fn}[\\s\\S]{0,900}?not is_active_teacher\\(v_uid\\)`).test(X.RPCS));
}
t.ok('the student list carries nothing sensitive',
  !/email|screenshot_url|reference_note|\bmethod\b/.test(
    X.RPCS.slice(X.RPCS.indexOf('function teacher_referral_students'),
                 X.RPCS.indexOf('admin_set_commission_status'))));

// ══ 7 · PRIVILEGES ════════════════════════════════════════════════════════
t.section('The default ACL is revoked, then granted deliberately');

const created = [...X.RPCS.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]);
t.ok('functions are created (not vacuous)', created.length >= 8);
t.is('every one is revoked from public, anon and authenticated',
  created.filter((f) => !new RegExp(`revoke all on function ${f}\\(`).test(X.RPCS)), []);
t.is('nothing is granted to anon',
  [...X.RPCS.matchAll(/grant execute on function [^;]*? to (\w+)/g)].map((m) => m[1])
    .filter((r) => r !== 'authenticated'), []);
t.ok('is_active_teacher stays internal — it is a helper, not a surface',
  !/grant execute on function is_active_teacher/.test(X.RPCS));
t.ok('every table has RLS on', (X.TABLES.match(/enable row level security/g) || []).length === 7);
t.is('and no client write policy exists on any of them',
  [...X.TABLES.matchAll(/create policy [^;]*? for (insert|update|delete)/g)].map((m) => m[0]), []);

// ══ 8 · THE PAYOUT GATE ═══════════════════════════════════════════════════
t.section('Nothing is paid before the tax treatment is known');

/* Reading the setting is not the gate. The comparison is. */
t.ok('marking a commission paid reads the setting',
  /if p_status = 'paid' then[\s\S]{0,400}?referral_payouts_enabled/.test(X.RPCS));
t.ok('and refuses unless it is exactly true',
  /if coalesce\(v_payouts_on, 'false'\) <> 'true' then\s*\n\s*raise exception/.test(X.RPCS));
t.ok('and that setting ships OFF',
  /insert into system_settings \(key, value\)\s*\n\s*values \('referral_payouts_enabled', 'false'\)/.test(X.RPCS));
t.ok('gross commission and withholding are separate columns',
  /withholding_egp\s+numeric/.test(X.TABLES) && /net_payable_egp\s+numeric/.test(X.TABLES));
t.is('no VAT or withholding rate is guessed at anywhere',
  [...ALL.matchAll(/vat[_\s]*(rate|bps|percent)|withholding[_\s]*(rate|bps|percent)/gi)].map((m) => m[0]), []);
t.ok('a reversal must carry a reason', /a reversal needs a reason/.test(X.RPCS));
t.ok('every admin write is audited',
  (X.RPCS.match(/insert into referral_audit_log/g) || []).length >= 2);

// ══ 9 · THE FOUND TRAP ════════════════════════════════════════════════════
t.section('A bug the dry run caught, kept caught');

/* PERFORM resets FOUND. Without capturing it first, the first attribution
   takes the UPDATE branch, updates zero rows, and reports success while
   binding nobody. Both functions that mix SELECT INTO with set_config were
   affected. */
for (const fn of ['attribute_referral', 'admin_reassign_referral']) {
  const body = X.RPCS.slice(X.RPCS.indexOf(`function ${fn}(`));
  const upto = body.slice(0, body.indexOf('$$;'));
  t.ok(`${fn} captures FOUND before any PERFORM`, /v_had_row := found;/.test(upto));
  t.is(`${fn} never tests FOUND after one`,
    [...upto.matchAll(/perform set_config[\s\S]{0,300}?\bif (not )?found\b/g)].map((m) => m[0].slice(0, 40)), []);
}

// ══ 10 · ROLLBACK ═════════════════════════════════════════════════════════
t.section('A way back that cannot destroy the ledger');

t.ok('the rollback refuses to drop a ledger that has rows',
  /refusing to drop: % commission rows exist/.test(BACK));
t.ok('and it unhooks the payment paths before dropping what they call',
  BACK.indexOf('STEP 1') < BACK.indexOf('STEP 2')
  && BACK.indexOf('STEP 2') < BACK.indexOf('drop function if exists record_purchase_event'));
t.is('every table the migrations create is dropped by it',
  [...X.TABLES.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1])
    .concat([...X.ENGINE.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]))
    .filter((tbl) => !new RegExp(`drop table if exists ${tbl};`).test(BACK)), []);
t.is('every function they create is dropped by it',
  created.concat(['record_purchase_event', 'referral_award_from_event'])
    .filter((f) => !new RegExp(`drop function if exists ${f}\\(`).test(BACK)), []);

// ══ 11 · SCOPE ════════════════════════════════════════════════════════════
t.section('It extends the classroom system; it does not fork it');

t.is('no teacher, classroom or student table is altered',
  [...ALL.matchAll(/alter table (teacher_workspaces|workspace_staff|workspace_students|profiles)/g)]
    .map((m) => m[0]), []);
t.is('no second payment table is created',
  [...ALL.matchAll(/create table if not exists (payments|payment_requests|subscriptions)\b/g)].map((m) => m[0]), []);
t.ok('the classroom join is untouched — joining is not being referred',
  !/student_join_workspace|workspace_students/.test(X.ENGINE + X.RPCS.replace(/is_active_teacher[\s\S]{0,400}?\$\$;/, '')));

t.done();
