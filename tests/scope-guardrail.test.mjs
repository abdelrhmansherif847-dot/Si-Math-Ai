// ai-tutor v87 domain scope guardrail (supabase/functions/ai-tutor/index.ts).
//
// Regression target: before v87 the tutor had NO domain restriction at all —
// is_math was a recording classifier, not a gate, so Zero would answer
// politics, programming, medical and legal questions. The guardrail must block
// those while leaving the coaching conversations (exam anxiety, confidence,
// motivation, study habits) fully answerable, and must FAIL OPEN so it can
// never refuse a real math question.
//
// The helpers are pulled straight out of the TypeScript source; Node strips the
// types, so there is no build step and no risk of testing a stale copy.
import { suite } from './_assert.mjs';
import { read, slice, importTS } from './_source.mjs';

const t = suite('scope-guardrail');
const ts = slice(read('supabase/functions/ai-tutor/index.ts'),
                 'type ScopeLabel', '// Derive a concise tutor FINAL-answer', 'scope helpers');
const { parseScopeLabel, resolveScope } = await importTS(ts,
  ['parseScopeLabel', 'resolveScope', 'scopeRedirectMessage', 'SCOPE_REDIRECTS']);

const plain = { hasImage: false, hasRef: false };
const blocked = (label, opts = plain) => resolveScope(label, opts).blocked;

t.section('Coaching MUST be answered (the brief\'s allowed examples)');
for (const q of [
  '"I\'m afraid I won\'t get an 800."',
  '"I\'m stressed about tomorrow\'s math exam."',
  '"I failed my last mock exam."',
  '"I don\'t feel confident in algebra."',
  '"How should I study this week?"',
  '"I\'m losing motivation."',
]) t.is(q, blocked('coaching'), false);

t.section('Math MUST be answered');
t.is('a plain math turn', blocked('math'), false);
t.is('image upload mislabelled out_of_scope is still answered',
  blocked('out_of_scope', { hasImage: true, hasRef: false }), false);
t.is('worksheet reference mislabelled out_of_scope is still answered',
  blocked('out_of_scope', { hasImage: false, hasRef: true }), false);

t.section('Off-domain MUST be redirected (the brief\'s refused list)');
for (const c of ['politics','religion','medical advice','legal advice','programming',
                 'unrelated science','history','geography','entertainment'])
  t.is(c, blocked('out_of_scope'), true);

t.section('Fail-open: a broken label must never refuse a student');
for (const bad of [undefined, null, '', '   ', 'banana', 42, {}, [], true, 'MATHS?'])
  t.is(`scope=${JSON.stringify(bad)} is allowed`, blocked(bad), false);

t.section('Label normalisation');
t.is('"Math"',        parseScopeLabel('Math'), 'math');
t.is('"MATHEMATICS"', parseScopeLabel('MATHEMATICS'), 'math');
t.is('" Coaching "',  parseScopeLabel(' Coaching '), 'coaching');
t.is('"out of scope"',parseScopeLabel('out of scope'), 'out_of_scope');
t.is('"OUT-OF-SCOPE"',parseScopeLabel('OUT-OF-SCOPE'), 'out_of_scope');
t.is('"off_topic"',   parseScopeLabel('off_topic'), 'out_of_scope');
t.is('"nonsense"',    parseScopeLabel('nonsense'), null);

t.section('hint_mode must NOT be an exemption (it is client-supplied)');
t.is('a crafted {"hint_mode":true} payload cannot walk the guard',
  blocked('out_of_scope', plain), true);

t.done();
