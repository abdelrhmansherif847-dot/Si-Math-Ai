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
const { scopeRedirectMessage, SCOPE_REDIRECTS, zeroIdentityAnswer } = await importTS(ts,
  ['parseScopeLabel', 'resolveScope', 'scopeRedirectMessage', 'SCOPE_REDIRECTS',
   'zeroIdentityAnswer', 'ZERO_IDENTITY_ANSWER_EN', 'ZERO_IDENTITY_ANSWER_AR']);

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

// ── Zero's identity answer (v101) ───────────────────────────────────────────
// The redirect above is deliberately varied; this one is deliberately NOT. Who
// Zero is has one approved wording, and before v101 the model wrote it fresh
// every turn under a prompt rule that asked it to vary — so no two students got
// the same answer and nothing stopped a generic "AI Math Tutor" self-description.
//
// The approved copy is written out in full here rather than compared against
// itself: this test IS the spec, so any edit to the shipped string fails until
// the copy is changed here too, on purpose, in review.
const APPROVED_EN = `I’m Zero. 🐉

I’m the little dragon behind Si Math.

I’m here to help you solve problems, understand the concepts, learn from your mistakes, and become better at math.

And who created me?

Si Math.

I was built to be more than just an answer machine — I’m here to help you Try. Learn. Rise.

— Zero 🐉`;

t.section('Identity answer — the approved copy, character for character');
t.is('English matches the approved wording exactly', zeroIdentityAnswer('en'), APPROVED_EN);
t.is('an unknown language falls back to the approved English',
  zeroIdentityAnswer('xx'), APPROVED_EN);
t.is('Franco gets the English original', zeroIdentityAnswer('franco'), APPROVED_EN);

t.section('Identity answer — fixed, never generated, never varied');
t.is('exactly two wordings exist across every language',
  new Set(['en', 'ar', 'franco', 'xx'].map(zeroIdentityAnswer)).size, 2);
for (const lang of ['en', 'ar']) {
  const m = zeroIdentityAnswer(lang);
  t.ok(`${lang}: never calls itself an AI tutor / assistant / language model`,
    !/AI\s+Math\s+Tutor|AI\s+tutor|AI\s+assistant|chatbot|language model|as an AI/i.test(m));
  t.ok(`${lang}: keeps the 🐉 anchor`, m.includes('🐉'));
  t.ok(`${lang}: names Zero`, m.includes('Zero'));
  t.ok(`${lang}: credits Si Math as the creator`, m.includes('Si Math'));
  t.ok(`${lang}: carries the Try. Learn. Rise. motto`, m.includes('Try. Learn. Rise.'));
  t.ok(`${lang}: signs off as Zero`, /—\s*Zero\s*🐉\s*$/.test(m));
  t.ok(`${lang}: no banned bot phrase`, !BANNED.test(m));
  t.ok(`${lang}: no leftover template interpolation`, !m.includes('${'));
}

t.section('The Arabic mirror carries the same content in Egyptian dialect');
const arId = zeroIdentityAnswer('ar');
t.ok('written in Arabic, not English', /[؀-ۿ]/.test(arId));
t.ok('dialect markers present (أنا / اللي / عشان / ورا)', /اللي|عشان|ورا/.test(arId));
t.ok('says Zero is the little dragon behind Si Math', /التنين\s+الصغير/.test(arId));
t.ok('answers who created him', /عملني|صنعني/.test(arId));
t.ok('no formal MSA refusal phrasing', !/لا أستطيع|لا يمكنني|عذراً، أنا نموذج/.test(arId));

t.section('The identity answer is what the server actually returns');
const src = read('supabase/functions/ai-tutor/index.ts');
t.ok('a server-side guard answers identity turns from the fixed text',
  /isIdentityQuestion\(question\)\) \{[\s\S]{0,1200}?answer:\s*zeroIdentityAnswer\(lang\)/.test(src));
t.ok('the guard marks the turn identity_response', /identity_response:\s*true/.test(src));
t.ok('the identity turn is returned as non-math coaching',
  /subtopic:\s*'Identity',[\s\S]{0,400}?is_math:\s*false,\s*\n\s*scope:\s*'coaching'/.test(src));
t.ok('the answer takes the language and nothing else — no name, no seed, no variants',
  /function zeroIdentityAnswer\(lang: string\): string \{/.test(src));
// resolveScope ranks an upload above the identity check; the guard must too, or
// a photographed question captioned "esmak eh" returns Zero's biography and the
// model's real solution is discarded.
t.ok('an image or worksheet-ref turn is never answered with the identity text',
  /if \(!imageData && !resolvedRef && isIdentityQuestion\(question\)\)/.test(src));
t.ok('both system prompts carry the same fixed text as fallback',
  (src.match(/\$\{zeroIdentityAnswer\(lang\)\}/g) || []).length >= 2);
t.ok('the old "vary the response each time" identity rule is gone',
  !/Vary the response naturally each time/.test(src));
t.ok('the prompts ban the generic AI self-description',
  /NEVER describe yourself as an "AI Math Tutor"/.test(src));

t.section('The personality layer itself is still wired in');
const idx = read('supabase/functions/ai-tutor/index.ts');
t.ok('personality sits at Priority 1 of the prompt', /## 🐉 ZERO PERSONALITY \(Priority 1/.test(idx));
t.ok('it is interpolated from the DB entry, not hardcoded', /\$\{personality\}/.test(idx));
t.ok('the generic-AI self-check survives', /Does this response sound like Zero or a generic AI/.test(idx));
t.ok('coaching is explicitly in scope in the prompt', /scope = "coaching"/.test(idx));

t.done();
