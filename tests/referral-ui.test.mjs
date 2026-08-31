// The teacher-facing referral surfaces — the Referrals & earnings section on
// teacher.html, and partner.html.
//
// The money is already safe: the ledger's rules are constraints, and the three
// RPCs behind these screens refuse anybody who is not an active teacher. So
// this suite is about the other half — what a teacher is TOLD, and who is
// shown it:
//
//   1. an assistant must not be offered a page about somebody else's earnings
//   2. no payment paperwork may cross into a teacher's view of a student
//   3. no control may promise money that cannot move
//   4. no price may be written down here, ever
//   5. an empty account must say "nothing yet", not render blank

import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('referral-ui');

const TEACH   = read('teacher.html');
const PARTNER = read('partner.html');
const NAV     = read('nav.js');
const SECTION = slice(TEACH, 'async function loadReferrals', 'function renderNeedsYou', 'referrals region');
/** The api method lives in the shared `api` object, not in the region above. */
const API = slice(TEACH, '  async referral()', '  async attention(ws)', 'referral api');

// ══ 1 · WHO IS OFFERED IT ═════════════════════════════════════════════════
t.section('A teacher, and not the person who assists them');

t.ok('the section is loaded only for a teacher', /S\.isTeacher \? loadReferrals\(\)/.test(TEACH));
t.ok('loadReferrals refuses to run for anyone else',
  /async function loadReferrals\(\)\s*\{\s*\n\s*if \(!S\.isTeacher\) \{ S\.ref = null; return; \}/.test(TEACH));
t.ok('the sidebar Partner link starts hidden', /id="sidePartnerLink" style="display:none"/.test(TEACH));
t.ok('and is revealed only for a teacher',
  /if \(S\.isTeacher\) \$\('sidePartnerLink'\)\.style\.display = ''/.test(TEACH));
t.ok('nav.js draws it only for a teacher, not for staff generally',
  /if \(isTeacher\) \{[\s\S]{0,300}?href="partner\.html"/.test(NAV));

/* partner.html gates on the RPC, which raises 42501 for a non-teacher. The
   deny state is a courtesy; the database is the boundary. */
t.ok('partner.html gates on the RPC, not on a client-side guess',
  /const \{ data: code, error \} = await sb\.rpc\('teacher_referral_code'\)/.test(PARTNER)
  && /if \(error \|\| !code\) \{ \$\('denyState'\)\.style\.display = ''; return; \}/.test(PARTNER));
t.ok('a non-teacher gets an explanation, not a broken page',
  /This page is for teachers/.test(PARTNER) && /id="denyState"/.test(PARTNER));
t.ok('and the page body starts hidden', /id="pageState" style="display:none"/.test(PARTNER));

// ══ 2 · WHAT A TEACHER MAY SEE ABOUT A STUDENT ════════════════════════════
t.section('A commission, not their student\'s payment paperwork');

t.is('no payment identifier or contact detail is rendered',
  ['email', 'screenshot_url', 'reference_note', 'provider_transaction_id', 'payment_id', 'source_id']
    .filter((f) => new RegExp(`\\b${f}\\b`).test(SECTION)), []);
t.is('and none on the partner page either',
  ['email', 'screenshot_url', 'reference_note', 'amount_egp'].filter((f) => new RegExp(`r\\.${f}\\b`).test(PARTNER)), []);
t.ok('the student rows render the approved fields only',
  /r\.full_name/.test(SECTION) && /r\.purchase_at/.test(SECTION)
  && /r\.plan_code/.test(SECTION) && /r\.commission_egp/.test(SECTION));

// ══ 3 · NO PROMISE OF MONEY THAT CANNOT MOVE ══════════════════════════════
t.section('Payouts are disabled, so nothing offers one');

/* admin_set_commission_status() refuses to mark anything paid while
   referral_payouts_enabled is false. A button that always fails is worse than
   no button, so there is none. */
const controls = (src) => [...new Set(
  [...src.matchAll(/<button[^>]*>([^<']*)/g)].map((m) => m[1].trim()).filter(Boolean))];
t.is('the referrals section offers only the two copy actions',
  controls(SECTION).sort(), ['Copy code', 'Copy link']);
t.is('no surface contains a payout CONTROL',
  [...controls(SECTION), ...controls(PARTNER)]
    .filter((c) => /withdraw|payout|cash ?out|request pay|claim/i.test(c)), []);
t.ok('and both say plainly that payouts are not open',
  /Payouts are not open yet/.test(SECTION) && /Payouts are not open yet/.test(PARTNER));
t.ok('the four states are reported as states, not as a balance',
  ['Earned', 'Pending', 'Paid', 'Reversed'].every((k) => SECTION.includes(k)));

// ══ 4 · NO PRICE IS WRITTEN DOWN ══════════════════════════════════════════
t.section('plan_definitions is the only place a price lives');

/* A hardcoded 349 in a page is the defect that put "Unlimited AI messages" on
   a metered checkout. partner.html shows worked examples, which makes it
   exactly the page most tempted to keep its own copy. */
t.ok('the partner page reads the live catalogue through PlanCatalog',
  /await PlanCatalog\.load\(sb\)/.test(PARTNER) && /PlanCatalog\.subscriptions\(\)/.test(PARTNER));
/* Quoted OR bare: `const FALLBACK = { PRO_MONTHLY: 349 }` is a hardcoded price
   list that a check looking only for quoted strings walks straight past. The
   page needs no plan code at all, so the honest assertion is that it contains
   none in any form. */
t.is('and names no plan code at all, quoted or bare',
  [...PARTNER.matchAll(/\b(PRO_MONTHLY|PRO_QUARTERLY|PRO_ANNUAL|PACK_\w+|FOUNDER_\w+|SAT_EXAM_NIGHT)\b/g)]
    .map((m) => m[1]), []);
/* Executable code only. The comment above this rule in partner.html names 349
   as the example of what not to do, and an assertion that fails on its own
   documentation is not measuring the page. */
const PARTNER_CODE = PARTNER.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
t.is('and writes down no plan price',
  [...PARTNER_CODE.matchAll(/\b(349|899|1949|2999|1499|1299|599|199)\b/g)].map((m) => m[0]), []);
t.ok('a failed catalogue read says so rather than inventing figures',
  /Plan prices could not be loaded/.test(PARTNER));
t.ok('a free plan is excluded from an earnings table',
  /Number\(pl\.amount_egp\) > 0/.test(PARTNER));

// ══ 5 · THE LADDER, AND WHERE THE TEACHER STANDS ══════════════════════════
t.section('The tier a teacher is on, decided by the server');

/* The three bands are copy; which one is lit is the server's answer. Deriving
   it from paid_count here would let the page and the ledger disagree about
   what somebody earns. */
for (const src of [SECTION, PARTNER]) {
  t.ok('the highlighted band matches the server tier_label',
    /=== (sum\.tier_label|current)/.test(src));
}
t.is('the ladder states all three bands', (PARTNER.match(/paid students'/g) || []).length, 3);
t.ok('the boundaries are the ones the database holds',
  /1–9 paid students/.test(PARTNER) && /10–29 paid students/.test(PARTNER) && /30\+ paid students/.test(PARTNER));
t.ok('progress is measured against the next tier, not from zero',
  /paid \/ Number\(sum\.next_tier_at \|\| 1\)/.test(SECTION));
t.ok('the top tier says so instead of inventing a next target',
  /top tier/.test(SECTION) || /You are on the top tier/.test(SECTION));
t.ok('the example arithmetic rounds half-up, like the server',
  /Math\.round\(price \* bps \/ 100 \+ 1e-9\) \/ 100/.test(PARTNER));

// ══ 6 · THE EMPTY ACCOUNT ═════════════════════════════════════════════════
t.section('A teacher with nothing yet');

t.ok('an unavailable read hides the section rather than breaking the page',
  /if \(!R \|\| !R\.summary\) \{ \$\('referrals'\)\.style\.display = 'none'; return; \}/.test(SECTION));
t.ok('the loader treats a failure as null', /catch \(_\) \{ S\.ref = null; \}/.test(TEACH));
t.ok('no referred students yet is a sentence, not a blank table',
  /No referred students yet/.test(SECTION));
t.ok('and it says what to do about it', /Share your code or link/.test(SECTION));

// ══ 7 · THE HONEST STATUS ═════════════════════════════════════════════════
t.section('It does not claim to work before it does');

/* Nothing student-facing calls attribute_referral() yet: sign-up does not read
   ?ref= and there is nowhere to type a code. A teacher told to "share your
   link" today would be told something false. Both surfaces say so, and these
   checks are what force them to be removed together when it ships. */
t.ok('teacher.html says the code is not shareable yet', /Not shareable yet/.test(SECTION));
t.ok('partner.html says the same', /Not shareable yet/.test(PARTNER));
t.is('no student-facing surface captures a referral yet — so the notice must stay',
  ['signup.html', 'login.html', 'settings.html', 'onboarding.html']
    .filter((f) => /attribute_referral/.test(read(f))), []);

// ══ 8 · NOTHING ELSE MOVED ════════════════════════════════════════════════
t.section('The existing workspace is untouched');

t.ok('the roster, attention, staff and activity loads all still run',
  /loadRoster\(\)/.test(TEACH) && /loadAttention\(\)/.test(TEACH)
  && /loadStaff\(\)/.test(TEACH) && /loadActivity\(\)/.test(TEACH));
t.ok('and still render', ['renderStats', 'renderNeedsYou', 'renderAttention']
  .every((f) => new RegExp(`${f}\\(\\);`).test(TEACH)));
t.is('the referral surfaces call only the three approved RPCs',
  [...new Set([...API.matchAll(/rpc\('(\w+)'/g), ...SECTION.matchAll(/rpc\('(\w+)'/g),
              ...PARTNER.matchAll(/rpc\('(\w+)'/g)].map((m) => m[1]))].sort(),
  ['teacher_referral_code', 'teacher_referral_students', 'teacher_referral_summary']);
t.is('and touch no table directly',
  [...PARTNER.matchAll(/\.from\('(\w+)'\)/g)].map((m) => m[1])
    .concat([...SECTION.matchAll(/\.from\('(\w+)'\)/g)].map((m) => m[1]))
    .concat([...API.matchAll(/\.from\('(\w+)'\)/g)].map((m) => m[1])), []);

t.done();
