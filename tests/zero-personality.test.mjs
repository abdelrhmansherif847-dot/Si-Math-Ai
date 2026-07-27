// Zero's personality, as it survives the v87 domain guardrail.
//
// Regression target: the guardrail must control WHAT Zero talks about, never
// HOW Zero talks. Because the server discards the model's draft on an
// out-of-scope turn, the canned redirect IS Zero for that turn — the first
// version was a single hardcoded string per language that bypassed the
// personality layer entirely (identical wording every time, no catchphrase).
//
// The spec asserted here comes from the zero_personality knowledge entry:
// warm older-sibling voice, Egyptian dialect in Arabic, the dragon anchor, the
// student's name, an emoji, and none of its banned bot phrases.
import { suite } from './_assert.mjs';
import { read, slice, importTS } from './_source.mjs';

const t = suite('zero-personality');
const ts = slice(read('supabase/functions/ai-tutor/index.ts'),
                 'type ScopeLabel', '// Derive a concise tutor FINAL-answer', 'scope helpers');
const { scopeRedirectMessage, SCOPE_REDIRECTS } = await importTS(ts,
  ['parseScopeLabel', 'resolveScope', 'scopeRedirectMessage', 'SCOPE_REDIRECTS']);

// Straight from the zero_personality entry's Tone Rules, plus generic filter-speak.
const BANNED = /certainly!|of course!|great question!|as an AI|language model|I cannot assist|I am unable to/i;
const EMOJI  = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

for (const lang of ['en', 'ar', 'franco']) {
  t.section(`Redirect voice — ${lang}`);
  const all = SCOPE_REDIRECTS[lang].map(f => f('Omar'));
  t.is('three distinct variants (no word-for-word repetition)', new Set(all).size, 3);
  all.forEach((m, i) => {
    t.ok(`v${i+1}: keeps the 🐉 identity anchor`, m.includes('🐉'));
    t.ok(`v${i+1}: carries an emoji beyond the dragon`, EMOJI.test(m.replace(/🐉/g, '')));
    t.ok(`v${i+1}: uses the student's name`, m.includes('Omar'));
    t.ok(`v${i+1}: no banned bot phrase`, !BANNED.test(m));
    t.ok(`v${i+1}: names the exams Zero covers`, /SAT/.test(m) && /ACT/.test(m));
    t.ok(`v${i+1}: offers a concrete way back into math`, m.length > 120);
  });
}

t.section('Arabic is Egyptian dialect, not stiff MSA');
const ar = SCOPE_REDIRECTS['ar'].map(f => f('Omar')).join(' ');
t.ok('dialect markers present (ده / دي / دلوقتي / بجد / يلا / عشان)', /ده|دي|دلوقتي|بجد|يلا|بره|عشان/.test(ar));
t.ok('no formal MSA refusal phrasing', !/لا أستطيع|لا يمكنني|عذراً، أنا نموذج/.test(ar));

t.section('Variant selection');
const a = scopeRedirectMessage('en','Omar','who is the president of egypt');
const b = scopeRedirectMessage('en','Omar','write me a python script');
const c = scopeRedirectMessage('en','Omar','what happened in world war 2');
t.ok('different questions can draw different wording', new Set([a,b,c]).size > 1);
t.is('the same question is stable across calls',
  scopeRedirectMessage('en','Omar','x'), scopeRedirectMessage('en','Omar','x'));

t.section('Name handling');
t.ok('the "Student" placeholder is never spoken aloud',
  !scopeRedirectMessage('en','Student','q').includes('Student,'));
t.ok('a missing name leaves no stray leading punctuation',
  !/^\s*[,،]/.test(scopeRedirectMessage('en','','q')));
t.ok('an unknown language falls back to the English variants',
  SCOPE_REDIRECTS['en'].some(f => f('Omar') === scopeRedirectMessage('xx','Omar','q')));

t.section('The personality layer itself is still wired in');
const idx = read('supabase/functions/ai-tutor/index.ts');
t.ok('personality sits at Priority 1 of the prompt', /## 🐉 ZERO PERSONALITY \(Priority 1/.test(idx));
t.ok('it is interpolated from the DB entry, not hardcoded', /\$\{personality\}/.test(idx));
t.ok('the generic-AI self-check survives', /Does this response sound like Zero or a generic AI/.test(idx));
t.ok('coaching is explicitly in scope in the prompt', /scope = "coaching"/.test(idx));

t.done();
