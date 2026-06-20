// ai-tutor Edge Function v72
// Phase 1 of Adaptive Verification: independent DifficultyDetector runs in
// shadow mode on every math question and records verification_tier +
// verification_meta on question_records. The verification pipeline itself
// (solvers/judge/escalator) is NOT activated. Detector is gated by
// DIFFICULTY_DETECTOR_ENABLED (default true). Pipeline is gated separately
// by VERIFICATION_ENABLED (default false). Detector failures are swallowed
// — they never affect answer generation, hints, personality, KB retrieval,
// or the existing question_records contract.
// CAI-P1: client_request_id idempotency. Pre-flight SELECT returns the
// existing row when the same key arrives twice; 23505 on INSERT triggers
// re-SELECT and returns the winner row instead of creating a duplicate.
// Observability (C1+C2): structured [ai-tutor] console.log tags at key
// decision points; response envelope carries `version`, `idempotency_recovered`,
// and `degraded` flags. Additive only — no behavior change.
// Increase max_tokens 1400→2800 to prevent JSON truncation on longer system prompts (v60-v63 additions)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_KEY  = Deno.env.get('OPENAI_API_KEY')  ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')    ?? '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const AI_TUTOR_VERSION = 'v79';

// ── Taxonomy guard (synced from taxonomy.js — that file remains canonical) ───
// Must stay in sync with SYSTEM_TOPICS, TOPIC_ALIASES, and SUBTOPIC_MAP in taxonomy.js.
// Deno cannot import the browser script, so this is the necessary duplicate.
const SYSTEM_TOPICS = new Set([
  'conversation','other','none','chat','general','meta','system',
  'unknown','n/a','na','null','undefined','','coaching','planning',
  'study planning','study coaching','exam strategy','motivation',
  'confidence','mindset','scheduling','out_of_scope','greeting',
  'math','mathematics','maths','general math','basic math',
  'miscellaneous','intro','introduction','review','hint','hints',
]);
const TOPIC_ALIASES: Record<string, string> = {
  'geometry':'Geometry','algebra':'Algebra','trigonometry':'Trigonometry',
  'trig':'Trigonometry','statistics':'Statistics','probability':'Probability',
  'calculus':'Calculus','number theory':'Number Theory','word problems':'Word Problems',
  'linear equations':'Linear Equations','quadratic equations':'Quadratic Equations',
  'order of operations':'Order of Operations','complex numbers':'Complex Numbers',
  'functions':'Functions','inequalities':'Inequalities',
};
const SUBTOPIC_MAP: Record<string, string[]> = {
  'Algebra': ['Linear Equations','Systems of Equations','Quadratic Equations','Polynomials','Inequalities','Absolute Value','Exponents & Radicals','Functions','Sequences & Patterns'],
  'Geometry': ['Triangles','Circles','Angles & Lines','Coordinate Geometry','Area & Volume','Similar Figures','Transformations','3D Shapes'],
  'Word Problems': ['Linear Word Problems','Percent Problems','Ratio Problems','Rate & Work Problems','Mixture Problems','Distance & Speed Problems','Statistics Word Problems'],
  'Statistics': ['Mean, Median, Mode','Standard Deviation','Data Tables','Scatter Plots','Probability','Sampling Methods','Survey Design'],
  'Trigonometry': ['Sin, Cos, Tan','Unit Circle','Trig Identities','Radian Measure','Inverse Trig','Law of Sines & Cosines'],
  'Number Theory': ['Integers','Fractions & Decimals','Percentages','Ratios & Proportions','Prime Numbers','Factors & Multiples'],
  'Calculus': ['Limits','Derivatives','Chain Rule','Product Rule','Integration','Optimization Problems'],
  'Probability': ['Basic Probability','Compound Events','Conditional Probability','Combinations','Permutations'],
  'Linear Equations': ['One-Variable Equations','Two-Variable Equations','Slope & Rate of Change','Intercepts','Parallel & Perpendicular Lines'],
  'Quadratic Equations': ['Factoring','Quadratic Formula','Completing the Square','Vertex Form','Discriminant'],
  'Complex Numbers': ['Imaginary Numbers','Operations with Complex Numbers','Complex Conjugates','Modulus & Argument'],
};
function isAcademicTopic(t: string): boolean {
  const s = (t || '').trim().toLowerCase();
  return s.length >= 2 && !SYSTEM_TOPICS.has(s);
}
function normalizeTopicCanonical(s: string): string {
  if (!s) return '';
  const t = s.trim();
  const lower = t.toLowerCase();
  return TOPIC_ALIASES[lower] || (t.charAt(0).toUpperCase() + t.slice(1));
}
function subtopicsForCanonical(topic: string): string[] {
  return SUBTOPIC_MAP[normalizeTopicCanonical(topic)] || [];
}
// Positive allowlist: returns canonical subtopic if it matches a known subtopic
// for the given topic (case-insensitive), or '' if not.
function canonicalSubtopic(topic: string, sub: string): string {
  if (!sub) return '';
  const list = subtopicsForCanonical(topic);
  if (list.length === 0) return sub.trim(); // Topic has no curated subtopic list — accept as-is
  const lower = sub.trim().toLowerCase();
  return list.find(s => s.toLowerCase() === lower) || '';
}
// Pre-built curriculum tree string for the system prompt.
const CURRICULUM_TREE_TEXT = Object.keys(SUBTOPIC_MAP)
  .map(t => `  - ${t}: ${SUBTOPIC_MAP[t].join(', ')}`)
  .join('\n');
const DIFFICULTY_DETECTOR_VERSION = 'detector-v1';
const L3_PIPELINE_VERSION = 'l3-shadow-v3';

// ── Tone detection (v78) ─────────────────────────────────────────────────────
// Sliding 3-turn classifier returning band 0–4 (0=formal, 4=hype).
// Vocab lists are curated v1 — small on purpose. Expand only with usage data.
// NEVER cross-pollinate languages: ar vocab matches AR turns, en matches EN, etc.
const TONE_VOCAB_AR = ['عاش','اشطا','تمام','يلا بينا','يا بطل','يا صاحبي','جامد'];
const TONE_VOCAB_EN = ["let's go",'lets go','nice catch','nice one','good job','we got this','huge w'];
const TONE_VOCAB_FR = ['3ash','yalla bina','tmam','gamed','ya sa7by','ya batal'];

// Confusion / frustration markers — when present in CURRENT student turn we
// cap the tone band at 2 (Adjustment 1). Warmth > hype.
function detectConfusionOrError(text: string): boolean {
  const t = (text || '').toLowerCase();
  return (
    /مش\s*فاهم|مش\s*عارف|مفهمتش|تايه|مش\s*شغال|غلط|ليه\s*كده|محبطة?|مفيش\s*فايدة/.test(t) ||
    /\b(i\s+(?:still\s+)?don'?t\s+(?:get|understand)|i'?m\s+(?:still\s+)?(?:lost|confused|stuck)|why\s+(?:isn'?t|is)\s+this\s+wrong|i\s+(?:can'?t|cant)\s+(?:do|figure))\b/.test(t) ||
    /msh\s*fahem|msh\s*3aref|mosh\s*3aref|lost|tay7|tayh|frustrated/.test(t)
  );
}

// Score a single message on its tone vocab. Returns 0–4.
function scoreToneSingle(text: string, lang: string): number {
  const t = (text || '').trim();
  if (!t) return 1;
  const lower = t.toLowerCase();
  const vocab = lang === 'ar' ? TONE_VOCAB_AR : lang === 'franco' ? TONE_VOCAB_FR : TONE_VOCAB_EN;
  const slangHits = vocab.reduce((n, w) => n + (lower.includes(w.toLowerCase()) ? 1 : 0), 0);

  // Hype markers (cross-language but tone-language-agnostic): emoji, repeated chars, all-caps, !!!
  const emojiHits   = (t.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}🔥😂✨🎯🙌💪]/gu) || []).length;
  const repeatedCh  = /([a-zا-ي])\1{2,}/i.test(lower);                     // "loool", "بمووووت"
  const allCapsFrag = /\b[A-Z]{3,}\b/.test(t);                              // "LETS GO"
  const exclamChain = /!{2,}/.test(t);

  let score = 1; // neutral baseline
  if (slangHits >= 1)                 score += 1;
  if (slangHits >= 2 || emojiHits >= 2 || repeatedCh || allCapsFrag || exclamChain) score += 1;
  if (slangHits >= 2 && (emojiHits >= 2 || repeatedCh || allCapsFrag))               score += 1;

  // Formality dampeners pull us toward 0:
  const polite = /(please|could you|would you|kindly|أرجوك|من فضلك|لو سمحت)/i.test(t);
  const longClean = t.length > 80 && !slangHits && !emojiHits && !exclamChain;
  if (polite || longClean) score = Math.max(0, score - 1);
  if (polite && longClean) score = 0;

  return Math.max(0, Math.min(4, score));
}

// Sliding window: average the last 3 student messages (rounded). Defaults to 1.
function detectTone(
  currentText: string,
  priorMessages: Array<{role:string;content:string}>,
  lang: string,
): { band: number; capped: boolean } {
  const userTurns = priorMessages.filter(m => m.role === 'user').slice(-2).map(m => m.content);
  const window = [...userTurns, currentText].filter(s => typeof s === 'string' && s.trim().length > 0);
  if (window.length === 0) return { band: 1, capped: false };
  const scores = window.map(s => scoreToneSingle(s, lang));
  let band = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  // Cap at 2 on confusion/frustration in CURRENT turn (Adjustment 1).
  let capped = false;
  if (detectConfusionOrError(currentText) && band > 2) {
    band = 2;
    capped = true;
  }
  return { band, capped };
}

// ── Tone detection (v78) ─────────────────────────────────────────────────────
// Sliding 3-turn classifier returning band 0–4 (0=formal, 4=hype).
// Vocab lists are curated v1 — small on purpose. Expand only with usage data.
// NEVER cross-pollinate languages: ar vocab matches AR turns, en matches EN, etc.
const TONE_VOCAB_AR = ['عاش','اشطا','تمام','يلا بينا','يا بطل','يا صاحبي','جامد'];
const TONE_VOCAB_EN = ["let's go",'lets go','nice catch','nice one','good job','we got this','huge w'];
const TONE_VOCAB_FR = ['3ash','yalla bina','tmam','gamed','ya sa7by','ya batal'];

// Confusion / frustration markers — when present in CURRENT student turn we
// cap the tone band at 2 (Adjustment 1). Warmth > hype.
function detectConfusionOrError(text: string): boolean {
  const t = (text || '').toLowerCase();
  return (
    /مش\s*فاهم|مش\s*عارف|مفهمتش|تايه|مش\s*شغال|غلط|ليه\s*كده|محبطة?|مفيش\s*فايدة/.test(t) ||
    /\b(i\s+(?:still\s+)?don'?t\s+(?:get|understand)|i'?m\s+(?:still\s+)?(?:lost|confused|stuck)|why\s+(?:isn'?t|is)\s+this\s+wrong|i\s+(?:can'?t|cant)\s+(?:do|figure))\b/.test(t) ||
    /msh\s*fahem|msh\s*3aref|mosh\s*3aref|lost|tay7|tayh|frustrated/.test(t)
  );
}

// Score a single message on its tone vocab. Returns 0–4.
function scoreToneSingle(text: string, lang: string): number {
  const t = (text || '').trim();
  if (!t) return 1;
  const lower = t.toLowerCase();
  const vocab = lang === 'ar' ? TONE_VOCAB_AR : lang === 'franco' ? TONE_VOCAB_FR : TONE_VOCAB_EN;
  const slangHits = vocab.reduce((n, w) => n + (lower.includes(w.toLowerCase()) ? 1 : 0), 0);

  // Hype markers (cross-language but tone-language-agnostic): emoji, repeated chars, all-caps, !!!
  const emojiHits   = (t.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}🔥😂✨🎯🙌💪]/gu) || []).length;
  const repeatedCh  = /([a-zا-ي])\1{2,}/i.test(lower);                     // "loool", "بمووووت"
  const allCapsFrag = /\b[A-Z]{3,}\b/.test(t);                              // "LETS GO"
  const exclamChain = /!{2,}/.test(t);

  let score = 1; // neutral baseline
  if (slangHits >= 1)                 score += 1;
  if (slangHits >= 2 || emojiHits >= 2 || repeatedCh || allCapsFrag || exclamChain) score += 1;
  if (slangHits >= 2 && (emojiHits >= 2 || repeatedCh || allCapsFrag))               score += 1;

  // Formality dampeners pull us toward 0:
  const polite = /(please|could you|would you|kindly|أرجوك|من فضلك|لو سمحت)/i.test(t);
  const longClean = t.length > 80 && !slangHits && !emojiHits && !exclamChain;
  if (polite || longClean) score = Math.max(0, score - 1);
  if (polite && longClean) score = 0;

  return Math.max(0, Math.min(4, score));
}

// Sliding window: average the last 3 student messages (rounded). Defaults to 1.
function detectTone(
  currentText: string,
  priorMessages: Array<{role:string;content:string}>,
  lang: string,
): { band: number; capped: boolean } {
  const userTurns = priorMessages.filter(m => m.role === 'user').slice(-2).map(m => m.content);
  const window = [...userTurns, currentText].filter(s => typeof s === 'string' && s.trim().length > 0);
  if (window.length === 0) return { band: 1, capped: false };
  const scores = window.map(s => scoreToneSingle(s, lang));
  let band = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  // Cap at 2 on confusion/frustration in CURRENT turn (Adjustment 1).
  let capped = false;
  if (detectConfusionOrError(currentText) && band > 2) {
    band = 2;
    capped = true;
  }
  return { band, capped };
}

// ── Language detection — Arabic / English / Franco (Arabizi) ──────────────────
// Franco = Egyptian Arabic written in Latin letters + digits (3=ع, 7=ح, 2=ء, 5=خ).
// We detect by (a) Latin words containing 2/3/5/7/8 (the distinctive digit-letters),
// or (b) a hit on common Franco function words. Arabic-script messages are never
// classified as Franco.
function detectFranco(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  if (/[؀-ۿ]/.test(t)) return false;
  if (/[a-z]*[23578][a-z]+|[a-z]+[23578][a-z]*/i.test(t)) return true;
  const words = t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const FRANCO_WORDS = new Set([
    'msh','mesh','ezayak','ezzayak','ezay','izay','keda','kda','delwa2ty','dlw2ty',
    'fahem','fahma','m3aya','ma3aya','m3ak','ma3ak','ma3lesh','ma3lish','sa7','sah',
    'b2a','ba2a','yala','yalla','3awz','3awez','3ayz','3andy','3andi','3ayza',
    '5alas','5las','tb','tab','7aga','7d','7add','sho2l','shar7','msh3arf'
  ]);
  return words.some(w => FRANCO_WORDS.has(w));
}

// Explicit "switch to Franco" request — persistent until student explicitly
// switches to English or Arabic (see detectors below). Persistence is enforced
// via profile.language_preference = 'franco' so it survives reloads and long
// conversations beyond the message-window stickiness.
function detectExplicitFrancoRequest(text: string): boolean {
  const t = (text || '').toLowerCase();
  if (!t) return false;
  // Latin variants: verb + (in) + franco/arabizi, "in franco", "franco please",
  // "switch to franco", "bel franco", "bel araby franco", "arabizi", "3arabizi",
  // "3arabi franco". Verb list expanded with "explain".
  if (/(speak|talk|reply|respond|answer|write|use|explain)\s+(in\s+|with\s+)?(franco|arabizi|3arabizi)/i.test(t)) return true;
  if (/(in|bel|bil|b)\s+(araby\s+)?(franco|arabizi|3arabizi)/i.test(t)) return true;
  if (/(franco|arabizi|3arabizi)\s+(please|plz|pls)/i.test(t)) return true;
  if (/switch\s+to\s+(franco|arabizi|3arabizi)/i.test(t)) return true;
  if (/\b3arabi\s+franco\b/i.test(t)) return true;
  if (/\barabizi\b|\b3arabizi\b/i.test(t)) return true;
  // Arabic-script Franco requests
  if (/(اكتب(لي)?|كلمني|اتكلم|رد(لي)?|جاوب(ني)?|تكلم|قول(لي)?)\s*(لي\s*)?(فرانكو|الفرانكو)/i.test(t)) return true;
  if (/بال?فرانكو/i.test(t)) return true;
  return false;
}

// Explicit "switch to English" request — flips the persistent preference back.
function detectExplicitEnglishRequest(text: string): boolean {
  const t = (text || '').toLowerCase();
  if (!t) return false;
  // Do NOT match if franco/arabizi is in the same phrase
  if (/(franco|arabizi|3arabizi)/i.test(t)) return false;
  if (/(speak|talk|reply|respond|answer|write|use|explain)\s+(in\s+|with\s+)?english/i.test(t)) return true;
  if (/\bin\s+english\b/i.test(t)) return true;
  if (/\benglish\s+(please|plz|pls)\b/i.test(t)) return true;
  if (/switch\s+to\s+english/i.test(t)) return true;
  if (/(اكتب(لي)?|كلمني|اتكلم|رد(لي)?|جاوب(ني)?|قول(لي)?)\s*(لي\s*)?(انجلش|انجليزي|إنجليزي|بالإنجليزي|بالانجليزي)/i.test(t)) return true;
  return false;
}

// Explicit "switch to Arabic" request — flips the persistent preference back.
function detectExplicitArabicRequest(text: string): boolean {
  const t = (text || '').toLowerCase();
  if (!t) return false;
  if (/(franco|arabizi|3arabizi)/i.test(t)) return false;
  if (/(speak|talk|reply|respond|answer|write|use|explain)\s+(in\s+|with\s+)?arabic/i.test(t)) return true;
  if (/\bin\s+arabic\b/i.test(t)) return true;
  if (/\barabic\s+(please|plz|pls)\b/i.test(t)) return true;
  if (/switch\s+to\s+arabic/i.test(t)) return true;
  // Arabic-script requests for Arabic explicitly
  if (/(اكتب(لي)?|كلمني|اتكلم|رد(لي)?|جاوب(ني)?|قول(لي)?)\s*(لي\s*)?(عربي|بالعربي|بالعربية|العربية)/i.test(t)) return true;
  return false;
}

// ── Fallback hint dictionary (topic keyword → AR/EN Socratic hint) ──────────
function fallbackHint(topic: string, subtopic: string, lang: string): string {
  const t = (topic + ' ' + subtopic).toLowerCase();
  const hints: Record<string, { ar: string; en: string }> = {
    algebra:    { ar: 'عزل المتغير هو الخطوة الأولى. فكّر: ما العملية التي تحصر x؟', en: 'What operation isolates x on one side?' },
    equation:   { ar: 'جرّب طرح الثوابت من الطرفين أولاً.', en: 'Try eliminating constants from both sides first.' },
    geometry:   { ar: 'ارسم الشكل وعلّم القيم المعطاة — أين تخفي المعلومات المفيدة؟', en: 'Draw and label the figure — what hidden relationship does the shape suggest?' },
    circle:     { ar: 'هل تعرف نصف القطر؟ كل قوانين الدائرة تبدأ منه.', en: 'Do you know the radius? All circle formulas start there.' },
    triangle:   { ar: 'تذكّر: مجموع زوايا المثلث = 180°. ما الزاوية المجهولة؟', en: 'Angles in a triangle sum to 180°. Which angle is unknown?' },
    function:   { ar: 'جرّب تعويض قيمة x وانظر ماذا يحدث بـ f(x).', en: 'Try substituting a value for x and observe what f(x) does.' },
    percent:    { ar: 'النسبة المئوية = (الجزء ÷ الكل) × 100. ما الكل هنا؟', en: 'Percent = (part ÷ whole) × 100. What is the whole here?' },
    ratio:      { ar: 'حوّل النسبة إلى كسر واجمع الأجزاء — ما المجموع الكلي؟', en: 'Convert the ratio to fractions — what does the total represent?' },
    probability:{ ar: 'الاحتمال = (الحالات المواتية ÷ الحالات الكلية). عدّ الحالات أولاً.', en: 'Probability = favorable / total outcomes. Count outcomes first.' },
    statistic:  { ar: 'المتوسط = مجموع القيم ÷ عددها. هل لديك مجموع القيم؟', en: 'Mean = sum of values ÷ count. Do you have the sum?' },
    calculus:   { ar: 'المشتقة تقيس معدّل التغيير. ما القاعدة المناسبة للدالة؟', en: 'Derivative measures rate of change. Which rule fits this function?' },
    quadratic:  { ar: 'حاول تحليل المعادلة أو استخدم القانون العام. ما معاملات a,b,c؟', en: 'Try factoring or use the quadratic formula. What are a, b, c?' },
  };
  const key = Object.keys(hints).find(k => t.includes(k));
  if (!key) return lang === 'ar'
    ? 'فكّر في الخطوة الأولى: ماذا تعرف؟ ماذا تريد أن تجد؟'
    : 'Think about step one: what do you know, and what are you trying to find?';
  return lang === 'ar' ? hints[key].ar : hints[key].en;
}

// ── fallbackRules: topic-keyed educational rule dictionary (LaTeX formulas) ──
function fallbackRules(topic: string, subtopic: string): Array<{name:string;formula:string;desc:string}> {
  const t = (topic + ' ' + subtopic).toLowerCase();
  const map: Array<[string, Array<{name:string;formula:string;desc:string}>]> = [
    ['linear equation', [
      { name: 'Linear Equation', formula: '$ax + b = c \\Rightarrow x = \\frac{c-b}{a}$', desc: 'Isolate x by moving constants to the right side, then divide by the coefficient.' },
      { name: 'Balance Rule', formula: 'Same operation on both sides keeps equality', desc: 'Whatever you do to one side, do to the other.' },
    ]],
    ['quadratic', [
      { name: 'Quadratic Formula', formula: '$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$', desc: 'Solves any quadratic — use when factoring is not obvious.' },
      { name: 'Factoring', formula: '$(x+p)(x+q)=0 \\Rightarrow x=-p \\text{ or } x=-q$', desc: 'Find two numbers that multiply to c and add to b.' },
      { name: 'Vertex Form', formula: '$f(x)=a(x-h)^2+k$, vertex at $(h,k)$', desc: 'Use to find the vertex (maximum/minimum) directly.' },
      { name: 'Discriminant', formula: '$\\Delta = b^2 - 4ac$', desc: 'Δ>0: two real roots; Δ=0: one root; Δ<0: no real roots.' },
    ]],
    ['system', [
      { name: 'Substitution', formula: 'Solve one for $x$, substitute into the other', desc: 'Express one variable in terms of the other to get one equation.' },
      { name: 'Elimination', formula: 'Multiply then add/subtract to cancel a variable', desc: 'Scale equations so one variable cancels when you add them.' },
    ]],
    ['percent', [
      { name: 'Percent Formula', formula: '$\\text{Percent} = \\frac{\\text{Part}}{\\text{Whole}} \\times 100$', desc: 'Expresses a quantity as parts per hundred.' },
      { name: 'Percent Change', formula: '$\\%\\Delta = \\frac{\\text{New}-\\text{Old}}{\\text{Old}} \\times 100$', desc: 'Measures relative increase or decrease between two values.' },
      { name: 'Percent of a Number', formula: '$x\\% \\text{ of } n = \\frac{x}{100} \\times n$', desc: 'Convert percent to decimal then multiply.' },
    ]],
    ['ratio', [
      { name: 'Ratio as Fraction', formula: '$a:b = \\frac{a}{b}$', desc: 'A ratio compares two quantities — convert to fractions to calculate.' },
      { name: 'Proportion', formula: '$\\frac{a}{b} = \\frac{c}{d} \\Rightarrow ad = bc$', desc: 'Cross-multiply to solve for an unknown in a proportion.' },
    ]],
    ['probability', [
      { name: 'Basic Probability', formula: '$P(E) = \\frac{\\text{Favorable}}{\\text{Total}}$', desc: 'Always between 0 (impossible) and 1 (certain).' },
      { name: 'Complement Rule', formula: '$P(\\text{not }E) = 1 - P(E)$', desc: 'The probability an event does NOT occur.' },
      { name: 'Independent Events', formula: '$P(A \\cap B) = P(A) \\times P(B)$', desc: 'Multiply probabilities when events do not affect each other.' },
    ]],
    ['statistic', [
      { name: 'Mean', formula: '$\\bar{x} = \\frac{\\sum x}{n}$', desc: 'Sum all values then divide by the count.' },
      { name: 'Median', formula: 'Middle value when data is sorted', desc: 'For even count: average of the two middle values.' },
      { name: 'Range', formula: '$\\text{Range} = \\text{Max} - \\text{Min}$', desc: 'Measures spread of the data set.' },
    ]],
    ['circle', [
      { name: 'Circumference', formula: '$C = 2\\pi r = \\pi d$', desc: 'Distance around the circle.' },
      { name: 'Area', formula: '$A = \\pi r^2$', desc: 'Space enclosed within the circle.' },
      { name: 'Arc Length', formula: '$L = \\frac{\\theta}{360} \\times 2\\pi r$', desc: 'Portion of the circumference, where θ is the central angle in degrees.' },
      { name: 'Sector Area', formula: '$A_{\\text{sector}} = \\frac{\\theta}{360} \\times \\pi r^2$', desc: 'Slice of the circle, proportional to the central angle.' },
      { name: 'Diameter & Radius', formula: '$d = 2r$', desc: 'Diameter is twice the radius.' },
    ]],
    ['triangle', [
      { name: 'Angle Sum', formula: '$A + B + C = 180°$', desc: 'The three interior angles of any triangle always sum to 180°.' },
      { name: 'Area', formula: '$A = \\frac{1}{2} \\times b \\times h$', desc: 'Height must be perpendicular to the base.' },
      { name: 'Pythagorean Theorem', formula: '$a^2 + b^2 = c^2$', desc: 'Only for right triangles — c is the hypotenuse (longest side).' },
      { name: 'Exterior Angle', formula: 'Exterior $= $ sum of two non-adjacent interior angles', desc: 'An exterior angle equals the sum of the two opposite interior angles.' },
    ]],
    ['function', [
      { name: 'Function Notation', formula: '$f(x)$ — evaluate by substituting $x$', desc: 'Replace x with the given value to find the output.' },
      { name: 'Domain & Range', formula: 'Domain: valid inputs; Range: valid outputs', desc: 'Avoid division by zero and square roots of negatives.' },
      { name: 'Composition', formula: '$(f \\circ g)(x) = f(g(x))$', desc: 'Apply g first, then apply f to the result.' },
    ]],
    ['slope', [
      { name: 'Slope Formula', formula: '$m = \\frac{y_2 - y_1}{x_2 - x_1}$', desc: 'Rise over run between two points.' },
      { name: 'Slope-Intercept', formula: '$y = mx + b$', desc: 'm is slope, b is y-intercept.' },
      { name: 'Point-Slope Form', formula: '$y - y_1 = m(x - x_1)$', desc: 'Use when you have a point and the slope.' },
    ]],
    ['exponent', [
      { name: 'Product Rule', formula: '$a^m \\times a^n = a^{m+n}$', desc: 'Same base: add exponents when multiplying.' },
      { name: 'Power Rule', formula: '$(a^m)^n = a^{mn}$', desc: 'Raise a power to a power: multiply exponents.' },
      { name: 'Quotient Rule', formula: '$\\frac{a^m}{a^n} = a^{m-n}$', desc: 'Same base: subtract exponents when dividing.' },
      { name: 'Zero & Negative Exponents', formula: '$a^0 = 1$, $a^{-n} = \\frac{1}{a^n}$', desc: 'Any non-zero base to the 0 power equals 1.' },
    ]],
    ['inequalit', [
      { name: 'Inequality Flip Rule', formula: 'Multiply/divide by negative → flip $<$ to $>$', desc: 'The direction reverses when both sides are multiplied or divided by a negative.' },
      { name: 'Interval Notation', formula: '$(a,b)$ open; $[a,b]$ closed', desc: 'Parentheses exclude endpoints; brackets include them.' },
    ]],
    ['algebra', [
      { name: 'Distributive Property', formula: '$a(b+c) = ab + ac$', desc: 'Multiply the outside term by each term inside the parentheses.' },
      { name: 'FOIL', formula: '$(a+b)(c+d) = ac+ad+bc+bd$', desc: 'First, Outer, Inner, Last — for expanding two binomials.' },
    ]],
  ];
  const match = map.find(([key]) => t.includes(key));
  return match ? match[1] : [];
}

// ── isMathTopic: strict classifier — only real math content gets rules/difficulty ──
function isMathTopic(topic: string, subtopic: string): boolean {
  const t = ((topic || '') + ' ' + (subtopic || '')).toLowerCase().trim();
  if (!t) return false;

  // Explicit NON-math topics (do NOT show rules/difficulty)
  const nonMathPatterns = [
    'coaching', 'study planning', 'study strategy', 'motivation', 'mindset',
    'exam preparation', 'exam structure', 'exam format', 'exam day',
    'time management', 'study schedule', 'answer sheet', 'bubble sheet',
    'study methods', 'study habits', 'tips', 'advice', 'general',
    'الاستعداد', 'نصائح', 'إدارة', 'دراسة', 'تخطيط', 'معنويات',
    'word problems', // generic — actual word problem solving will have algebra/percent/etc
  ];
  if (nonMathPatterns.some(p => t.includes(p))) {
    // Exception: if it ALSO contains a real math keyword, allow it
    const mathKw = ['algebra', 'geometry', 'equation', 'function', 'percent', 'ratio',
                    'probability', 'statistic', 'trig', 'polynomial', 'quadratic',
                    'circle', 'triangle', 'slope', 'exponent', 'inequality',
                    'الجبر', 'هندسة', 'معادل', 'دالة', 'نسبة', 'دائرة', 'مثلث'];
    return mathKw.some(k => t.includes(k));
  }

  // Explicit math keywords
  const mathPatterns = [
    'algebra', 'geometry', 'math', 'equation', 'function', 'percent', 'ratio',
    'probability', 'statistic', 'trig', 'polynomial', 'quadratic', 'circle',
    'triangle', 'slope', 'exponent', 'inequality', 'arithmetic', 'fraction',
    'decimal', 'integer', 'mean', 'median', 'mode', 'graph', 'coordinate',
    'system', 'expression', 'simplify', 'factor', 'radical', 'absolute value',
    'الرياضيات', 'الجبر', 'هندسة', 'معادل', 'دالة', 'نسبة', 'احتمال',
    'إحصاء', 'مثلث', 'دائرة', 'كسر', 'عدد',
  ];
  return mathPatterns.some(p => t.includes(p));
}

// ── normalizeRules ────────────────────────────────────────────────────────────
function normalizeRules(raw: unknown): Array<{name:string;formula:string;desc:string}> {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: unknown) => {
    if (typeof r === 'string') return { name: r, formula: '', desc: '' };
    if (r && typeof r === 'object') {
      const o = r as Record<string, unknown>;
      return {
        name:    String(o.name || o.title || '').trim(),
        formula: String(o.formula || '').trim(),
        desc:    String(o.desc || o.description || '').trim(),
      };
    }
    return { name: '', formula: '', desc: '' };
  }).filter(r => r.name.length > 0);
}

// ── Zero personality cache ────────────────────────────────────────────────────
// DB is the source of truth (slug='zero_personality'). Cache for 10 min to avoid
// a round-trip on every request. Returns '' on miss so caller can fall back.
let _personalityCache: string | null = null;
let _personalityCachedAt = 0;
async function get_zero_personality(sb: ReturnType<typeof createClient>): Promise<string> {
  const now = Date.now();
  if (_personalityCache !== null && now - _personalityCachedAt < 600_000) return _personalityCache;
  const { data, error } = await sb.from('zero_knowledge_entries')
    .select('body')
    .eq('slug', 'zero_personality')
    .eq('is_active', true)
    .maybeSingle();
  if (error) console.warn('[ai-tutor] get_zero_personality error:', error.message);
  _personalityCache = data?.body ?? '';
  _personalityCachedAt = now;
  return _personalityCache;
}

// ── Knowledge search ──────────────────────────────────────────────────────────
async function search_zero_knowledge(sb: ReturnType<typeof createClient>, query: string): Promise<string> {
  const { data } = await sb.rpc('search_zero_knowledge', { search_query: query, max_results: 5 });
  if (!data || data.length === 0) return '';
  return data.map((r: {title:string;body:string;category_name:string;subcategory_name:string}) =>
    `[${r.category_name} > ${r.subcategory_name}] ${r.title}: ${r.body}`
  ).join('\n');
}


// ── Phase 1 DifficultyDetector ────────────────────────────────────────────────
// Independent heuristic classifier. No LLM call, no extra latency. Runs in
// shadow mode: classification is stored on question_records.verification_tier
// but does NOT influence the response. Goal of Phase 1 is to gather a
// production difficulty distribution so we can calibrate tier thresholds
// before activating the verification pipeline in Phase 2.
type DifficultyTier = 'easy' | 'medium' | 'hard' | 'expert';

interface DetectorFeatures {
  has_image: boolean;
  char_length: number;
  word_count: number;
  sentence_count: number;
  equation_count: number;
  multi_step_count: number;
  proof_keyword: boolean;
  expert_topic_keyword: boolean;
  hard_topic_keyword: boolean;
  topic_keyword_count: number;
  word_problem: boolean;
}

function detectorExtractFeatures(question: string, hasImage: boolean): DetectorFeatures {
  const raw = (question || '').toString();
  const q = raw.toLowerCase();
  const wordCount = q.split(/\s+/).filter(Boolean).length;
  const sentenceCount = Math.max(1, q.split(/[.!?؟](?:\s|$)/).filter(s => s.trim().length > 0).length);
  const equationCount = (q.match(/[=≤≥<>]/g) || []).length;
  const multiStepCount = (q.match(/\b(then|after that|next|finally|first|second|third|step)\b/g) || []).length
    + (q.match(/(بعد ذلك|ثم|أولاً|ثانياً|ثالثاً|الخطوة)/g) || []).length;
  const proofKeyword = /\b(prove|show that|demonstrate|derive)\b/.test(q) || /(أثبت|برهن|اشتق)/.test(q);
  const expertTopicKeyword = /\b(matrix|matrices|eigen\w*|partial derivative|laplace|fourier|differential equation|vector field|parametric)\b/.test(q);
  const hardTopicKeyword = /\b(derivative|integral|limit|calculus|logarithm|exponential growth|complex number|imaginary unit|trigonometric identity)\b/.test(q);
  const topicKeywords = [
    'equation','triangle','circle','probability','percent','ratio','function','derivative',
    'integral','vector','matrix','polynomial','quadratic','linear','inequality','sequence',
    'logarithm','exponent','trig','sine','cosine','tangent','statistics','median','mean',
  ];
  let topicKeywordCount = 0;
  for (const k of topicKeywords) if (q.includes(k)) topicKeywordCount++;
  const wordProblem = /\b(if |how many|what is|find |determine|calculate)\b/.test(q) && wordCount >= 12
    || /(إذا|كم |ما هو|أوجد|احسب)/.test(q) && wordCount >= 8;
  return {
    has_image: hasImage,
    char_length: raw.length,
    word_count: wordCount,
    sentence_count: sentenceCount,
    equation_count: equationCount,
    multi_step_count: multiStepCount,
    proof_keyword: proofKeyword,
    expert_topic_keyword: expertTopicKeyword,
    hard_topic_keyword: hardTopicKeyword,
    topic_keyword_count: topicKeywordCount,
    word_problem: wordProblem,
  };
}

function detectorClassify(f: DetectorFeatures): { tier: DifficultyTier; reasons: string[] } {
  const reasons: string[] = [];
  // Expert
  if (f.proof_keyword)              { reasons.push('proof_keyword');         return { tier: 'expert', reasons }; }
  if (f.expert_topic_keyword)       { reasons.push('expert_topic_keyword');  return { tier: 'expert', reasons }; }
  if (f.has_image && f.topic_keyword_count >= 3) { reasons.push('image_and_multi_topic'); return { tier: 'expert', reasons }; }
  // Hard
  if (f.hard_topic_keyword)         { reasons.push('hard_topic_keyword');    return { tier: 'hard', reasons }; }
  if (f.multi_step_count >= 2)      { reasons.push('multi_step');            return { tier: 'hard', reasons }; }
  if (f.has_image && f.word_problem){ reasons.push('image_word_problem');    return { tier: 'hard', reasons }; }
  if (f.topic_keyword_count >= 3)   { reasons.push('multi_concept');         return { tier: 'hard', reasons }; }
  if (f.char_length > 400)          { reasons.push('long_question');         return { tier: 'hard', reasons }; }
  // Easy
  if (!f.has_image && f.char_length < 80 && !f.word_problem && f.multi_step_count === 0 && f.topic_keyword_count <= 1) {
    reasons.push('short_single_concept'); return { tier: 'easy', reasons };
  }
  if (!f.has_image && f.equation_count <= 1 && f.char_length < 120 && f.multi_step_count === 0 && !f.word_problem) {
    reasons.push('simple_single_equation'); return { tier: 'easy', reasons };
  }
  // Default
  reasons.push('default_medium');
  return { tier: 'medium', reasons };
}

function detectorGptTier(s: string | null | undefined): DifficultyTier | null {
  if (!s) return null;
  const lower = String(s).toLowerCase();
  if (lower.includes('expert')) return 'expert';
  if (lower.includes('hard'))   return 'hard';
  if (lower.includes('easy'))   return 'easy';
  if (lower.includes('medium')) return 'medium';
  return null;
}

// ── Worksheet Navigation Guard ────────────────────────────────────────────────
// Prevents Zero from confidently solving or inventing a worksheet question when
// the student references a question number but provides neither the image nor
// the actual problem text. Returns null when the guard should not fire.
// Gated by WORKSHEET_GUARD_ENABLED env var (default true).

interface WorksheetGuardResult {
  answer: string;
  q_number: string;
  lang: string;
}

function worksheetGuardCheck(
  question: string,
  imageData: string | null,
  messages: Array<{role: string; content: string}>,
  lang: string,
): WorksheetGuardResult | null {
  // Kill switch
  const guardEnabled = (Deno.env.get('WORKSHEET_GUARD_ENABLED') ?? 'true') !== 'false';
  if (!guardEnabled) return null;

  // Guard never fires when an image is attached — student has provided the worksheet
  if (imageData) return null;

  const text = question.trim();
  if (!text) return null;

  // ── Step 1: Detect question-number reference ────────────────────────────────
  // English: Q9, Question 9, question number 9, problem 9, #9, solve question 9
  const EN_Q_REF = /\b(?:Q|question|prob(?:lem)?|number|num|#)\s*\.?\s*#?\s*(\d{1,3}|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i;
  // Arabic: سؤال 9, السؤال رقم 9, مسألة 9, رقم 9, ordinals
  const AR_Q_REF = /(?:سؤال|السؤال|مسألة|المسألة|رقم|نمرة)\s*(?:رقم\s*)?([٠-٩]{1,3}|\d{1,3}|الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|واحد|اتنين|اثنين|تلاتة|ثلاثة|أربعة|خمسة|ستة|سبعة|ثمانية|تسعة|عشرة)/;
  // Franco: so2al 9, rakam 9, nemrit 9
  const FR_Q_REF = /\b(?:so2al|so2aal|s2al|rakam|ra2m|nemra|nemrit)\s*\.?\s*(\d{1,3})\b/i;
  // Bare digit/ordinal alone (e.g. student sends just "9" or "Q9")
  const BARE_Q = /^(?:Q\s*\.?\s*)?(\d{1,3})$/i;

  let qMatch = EN_Q_REF.exec(text) || AR_Q_REF.exec(text) || FR_Q_REF.exec(text) || BARE_Q.exec(text);
  if (!qMatch) return null;
  const q_number = qMatch[1] || qMatch[0];

  // ── Step 2: Skip when explanation/meta intent is present ───────────────────
  // Student is discussing prior work, not asking Zero to identify a new question
  const SKIP_EN = /\b(?:why|how come|what does|explain|clarify|step\s*\d|your|you did|makes sense|i got|my answer|i solved|i got it|i answered)\b/i;
  const SKIP_AR = /ليه|ازاي|إزاي|يعني|وضح|اشرح|حليت|إجابتي|اجابتي|طلعتلي|جبت/;
  const SKIP_FR = /\b(?:leeh|ezay|ya3ni|ana gbt|ana 7alit|gawabi)\b/i;
  if (SKIP_EN.test(text) || SKIP_AR.test(text) || SKIP_FR.test(text)) return null;

  // ── Step 3: Skip when the student provided substantial problem content ──────
  // Strip the question-reference span and check remaining text
  const stripped = text
    .replace(EN_Q_REF, '').replace(AR_Q_REF, '').replace(FR_Q_REF, '').replace(BARE_Q, '')
    .trim();
  const hasEquation    = /[=≤≥≠]/.test(stripped) || /\d+\s*[+\-×÷*/^]\s*\d+/.test(stripped);
  const hasLatex       = /\\\(|\\\[|\$/.test(stripped);
  const hasFuncNotation = /[fg]\s*\(/.test(stripped);
  const hasSubstantialText = stripped.length >= 80;
  if (hasEquation || hasLatex || hasFuncNotation || hasSubstantialText) return null;

  // ── Step 4: Skip if Zero already solved this exact question number ──────────
  // Scan last 10 user turns. If user sent an image alongside a reference to this
  // same Q-number, Zero already has the real context — safe to continue.
  // Per user decision (adjustment #5): history inference alone is NOT enough.
  // Guard fires unless the *current* turn has an image — checked above.
  // This step only checks for prior direct solves to avoid pestering on follow-ups.
  const prior10 = messages.slice(-10);
  for (let i = 0; i < prior10.length - 1; i++) {
    const uTurn = prior10[i];
    const aTurn = prior10[i + 1];
    if (uTurn?.role !== 'user' || aTurn?.role !== 'assistant') continue;
    const uText = typeof uTurn.content === 'string' ? uTurn.content : '';
    // Prior user turn referenced this same Q-number AND the assistant gave a
    // full math answer (heuristic: answer is long and contains step markers)
    const priorRefSame = EN_Q_REF.exec(uText)?.[1] === q_number ||
                         AR_Q_REF.exec(uText)?.[1] === q_number ||
                         FR_Q_REF.exec(uText)?.[1] === q_number;
    const aText = typeof aTurn.content === 'string' ? aTurn.content : '';
    const priorSolved  = aText.length > 200 && /step|خطوة|📐/.test(aText);
    if (priorRefSame && priorSolved) return null;
  }

  // ── Guard fires ─────────────────────────────────────────────────────────────
  const GUARD_MSGS: Record<string, string> = {
    en: `I want to make sure I solve the exact question ${q_number} from your worksheet, not a similar problem I've guessed. Could you re-attach the worksheet image (or paste the question text)? That way I won't risk explaining a completely different problem.`,
    ar: `عشان أحل سؤال ${q_number} بالظبط من ورقتك ومش سؤال شبيه اخترعته، ممكن ترفع صورة الورقة تاني (أو تكتب نص السؤال)؟ كده مش هاكون في خطر إني أشرح مسألة مختلفة خالص.`,
    franco: `3ashan a7el so2al ${q_number} bel zabt mn waraqtak msh so2al shabeeh ana fakarto, mumken terfa3 el sora tani (aw tekteb nas el so2al)? keda msh hakoun fi khatar enni ashra7 mas2ala mokhtelfa khales.`,
  };

  return {
    answer: GUARD_MSGS[lang] ?? GUARD_MSGS['en'],
    q_number: String(q_number),
    lang,
  };
}

// ── L3 Shadow Verification Pipeline (Phase 2A) ───────────────────────────────
// Level 3 architecture: OCR ambiguity check → 2 parallel solvers (gpt-4o-mini,
// temperatures 0.1 + 0.3) → judge (gpt-4o-mini, temp 0). OCR disambiguation
// rerun uses gpt-4o for higher vision accuracy.
// Runs entirely in background via EdgeRuntime.waitUntil() — zero student latency.
// Double-gated: VERIFICATION_ENABLED=true AND VERIFICATION_SHADOW_ONLY=true.
// Never modifies student answer, hint, personality, or KB behavior.
// All columns written are the Phase 0 nullable columns — no schema change.
// Pipeline version: l3-shadow-v1

interface OcrAmbiguityResult {
  confidence: number;
  flags: string[];
  rerun_count: number;
  rerun_changed: boolean;
  final_text: string;
}
interface SolverResult {
  answer: string;        // legacy: equals final_answer (kept for back-compat)
  final_answer: string;  // extracted final answer only
  reasoning: string;     // multi-line derivation (everything before "Final Answer:")
  raw_output: string;    // full unparsed model output
}
interface JudgeResult {
  verdict: 'agrees' | 'disagrees' | 'ocr_uncertain' | 'inconclusive';
  confidence: number;
  reasoning: string;
}

// Normalize a final-answer string for equality comparison. Strips wrapper
// prefixes ("answer:", "final answer:", "the answer is"), markdown bold,
// trailing punctuation, and whitespace; case-insensitive.
function normalizeFinalAnswer(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/^\s*(final\s+answer|answer|the\s+answer\s+is)\s*[:=]\s*/i, '')
    .replace(/[*_`]/g, '')
    .replace(/[.\s]+$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

// For image questions: extract the math problem as plain text (pre-solver step).
// Uses gpt-4o-mini — cheap extraction, not solving.
async function extractMathTextFromImage(imageData: string, studentText: string): Promise<string> {
  const prompt = studentText
    ? `The student sent this image with the message: "${studentText.slice(0, 200)}". Extract the specific math question they are asking about as plain text. Preserve all numbers, operators, signs (especially negative/minus signs), and mathematical notation exactly. Return ONLY the extracted math question.`
    : 'Extract the math question shown in this image as plain text. Preserve all numbers, operators, signs (especially negative/minus signs), and mathematical notation exactly. Return ONLY the extracted math question.';
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 300, temperature: 0,
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageData, detail: 'high' } },
        ]}],
      }),
    });
    const json = await res.json();
    return String(json.choices?.[0]?.message?.content || '').trim();
  } catch { return studentText; }
}

// Scan extracted text for OCR ambiguity signals; optionally run disambiguation rerun.
// OCR rerun uses gpt-4o (higher vision accuracy) when confidence < 0.85.
async function ocrAmbiguityCheck(extractedText: string, imageData: string | null): Promise<OcrAmbiguityResult> {
  const flags: string[] = [];
  let confidence = 1.0;

  if (imageData && extractedText) {
    if (/[–—]/.test(extractedText))                                           flags.push('dash_lookalike');
    if (/[a-zA-Z]\d/.test(extractedText) && !/\^/.test(extractedText))        flags.push('implicit_exponent');
    if (/\d\s*\/\s*\d/.test(extractedText) && !/\\frac/.test(extractedText))  flags.push('fraction_ambiguity');
    // Coarse: operators present but zero minus signs — possible sign loss
    if (/[+×÷*]/.test(extractedText) && !/-/.test(extractedText) && extractedText.length > 5)
      flags.push('no_operator_sign');

    const structural = flags.filter(f => f !== 'no_operator_sign').length;
    const coarse     = flags.includes('no_operator_sign') ? 1 : 0;
    confidence = Math.max(0, 1.0 - structural * 0.25 - coarse * 0.15);
  }

  let rerun_count = 0, rerun_changed = false, final_text = extractedText;
  if (imageData && confidence < 0.85 && extractedText) {
    try {
      const rerunRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o', max_tokens: 300, temperature: 0,
          messages: [{ role: 'user', content: [
            { type: 'text', text: `Re-extract this math expression from the image very carefully. Pay specific attention to:\n- Negative/minus signs before numbers or expressions (−3, −x)\n- Exponents written as superscripts (x², x³)\n- Fraction bars vs division signs\n- Any dashes that might be minus signs\n\nOriginal extraction: "${extractedText}"\n\nReturn ONLY the corrected mathematical expression.` },
            { type: 'image_url', image_url: { url: imageData, detail: 'high' } },
          ]}],
        }),
      });
      const rerunJson = await rerunRes.json();
      const rerunText = String(rerunJson.choices?.[0]?.message?.content || '').trim();
      rerun_count = 1;
      if (rerunText && rerunText !== extractedText) { rerun_changed = true; final_text = rerunText; }
    } catch { /* rerun failure is non-fatal */ }
  }
  return { confidence, flags, rerun_count, rerun_changed, final_text };
}

// Single solver pass. Model: gpt-4o-mini. Returns structured reasoning + final_answer.
// If imageData provided, solver sees the image directly (vision) — fixes the
// image-questions-not-verifiable bug where solvers relied only on mini-OCR text.
// v80: enforces "Reasoning:" / "Final Answer:" markers so the judge can evaluate
// the actual derivation, not just the choice letter.
const SOLVER_SYSTEM_PROMPT =
  'You are a precise math solver. You MUST respond in this exact format and nothing else:\n\n' +
  'Reasoning:\n' +
  '<step-by-step derivation across multiple lines>\n\n' +
  'Final Answer: <single value, expression, or option letter>\n\n' +
  'Rules:\n' +
  '- The "Reasoning:" block must contain the actual mathematical steps, not a restatement of the problem.\n' +
  '- "Final Answer:" must appear exactly once, on its own line, at the very end.\n' +
  '- No markdown formatting, no commentary outside this structure.';

async function runSolver(
  questionText: string, temperature: number, imageData: string | null = null,
): Promise<SolverResult> {
  try {
    const userContent: unknown = imageData
      ? [
          { type: 'text', text: `Solve this math problem. Extracted text (may be partial): "${questionText.slice(0, 800)}"` },
          { type: 'image_url', image_url: { url: imageData, detail: 'high' } },
        ]
      : questionText.slice(0, 1500);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 1200, temperature,
        messages: [
          { role: 'system', content: SOLVER_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
    });
    const json = await res.json();
    const raw_output = String(json.choices?.[0]?.message?.content || '').trim();

    // Split into reasoning + final_answer using "Final Answer:" marker (case-insensitive).
    // Fallback: legacy "Answer:" marker. Last fallback: last non-empty line.
    let reasoning = '';
    let final_answer = '';
    const finalMatch = /^\s*final\s*answer\s*[:=]\s*(.+?)\s*$/im.exec(raw_output);
    const legacyMatch = !finalMatch && /^\s*answer\s*[:=]\s*(.+?)\s*$/im.exec(raw_output);
    if (finalMatch) {
      final_answer = finalMatch[1].trim();
      reasoning = raw_output.slice(0, finalMatch.index).replace(/^\s*reasoning\s*[:=]\s*/i, '').trim();
    } else if (legacyMatch) {
      final_answer = legacyMatch[1].trim();
      reasoning = raw_output.slice(0, legacyMatch.index).replace(/^\s*reasoning\s*[:=]\s*/i, '').trim();
    } else {
      const lines = raw_output.split('\n').map(l => l.trim()).filter(Boolean);
      final_answer = (lines.at(-1) ?? raw_output).trim();
      reasoning = lines.slice(0, -1).join('\n').replace(/^\s*reasoning\s*[:=]\s*/i, '').trim();
    }

    return { answer: final_answer, final_answer, reasoning, raw_output };
  } catch {
    return { answer: 'solver_error', final_answer: 'solver_error', reasoning: '', raw_output: '' };
  }
}

// Judge: compares Zero's answer against two solver derivations on three axes:
//   (1) final-answer agreement
//   (2) reasoning quality (steps present, not a bare letter / restatement)
//   (3) logical consistency (reasoning actually supports the stated final answer)
//
// v80: model upgraded gpt-4o-mini → gpt-4o. A weaker judge evaluating GPT-4o
// tutor output produces false disagreements; upgrading just the judge gives the
// largest verification-quality win per cost dollar.
//
// Hard rule retained: OCR confidence < 0.75 locks verdict to 'ocr_uncertain' —
// solver consensus cannot override OCR uncertainty.
const JUDGE_SYSTEM_PROMPT =
  'You are a strict math verification judge. You are given a math question, the tutor\'s explanation, ' +
  'and two independent solver derivations (each with reasoning and a final answer).\n\n' +
  'Evaluate on three axes:\n' +
  '  1. Final-answer agreement — does the tutor\'s final value match what the solvers derived (formatting differences OK)?\n' +
  '  2. Reasoning quality — do the solver derivations contain real mathematical steps, or just a restated problem / a bare letter?\n' +
  '  3. Logical consistency — does each solver\'s reasoning actually justify its stated final answer?\n\n' +
  'Respond with JSON only:\n' +
  '{"verdict":"agrees"|"disagrees"|"inconclusive","confidence":0.0-1.0,"reasoning":"two short sentences covering the three axes"}\n\n' +
  '- "agrees": both solvers reach the same final value as the tutor AND at least one solver shows valid reasoning that justifies it.\n' +
  '- "disagrees": solvers agree with each other on a final value but it differs from the tutor.\n' +
  '- "inconclusive": solvers disagree with each other, OR neither solver shows real reasoning (e.g. both returned only a letter), OR the reasoning contradicts the stated final answer.\n' +
  '- confidence reflects evidence strength: high when both solvers show genuine derivations that converge, low when reasoning is missing or shallow even if labels match.';

async function runJudge(
  questionText: string, zeroAnswer: string,
  solverA: SolverResult, solverB: SolverResult, ocrConfidence: number,
): Promise<JudgeResult> {
  if (ocrConfidence < 0.75) {
    return {
      verdict: 'ocr_uncertain', confidence: ocrConfidence,
      reasoning: `OCR confidence ${ocrConfidence.toFixed(2)} below 0.75 — verdict locked; solver agreement does not override.`,
    };
  }
  try {
    const userContent =
      `Question:\n${questionText.slice(0, 500)}\n\n` +
      `Tutor explanation (excerpt):\n${zeroAnswer.slice(0, 600)}\n\n` +
      `Solver A reasoning:\n${(solverA.reasoning || '(none)').slice(0, 700)}\n` +
      `Solver A final answer: ${solverA.final_answer.slice(0, 120)}\n\n` +
      `Solver B reasoning:\n${(solverB.reasoning || '(none)').slice(0, 700)}\n` +
      `Solver B final answer: ${solverB.final_answer.slice(0, 120)}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 500, temperature: 0,
        messages: [
          { role: 'system', content: JUDGE_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
    });
    const json = await res.json();
    const raw = String(json.choices?.[0]?.message?.content || '{}');
    const p = JSON.parse(raw.replace(/^```(?:json)?\n?|```$/gm, '').trim());
    const validVerdicts = ['agrees', 'disagrees', 'inconclusive'];
    return {
      verdict: validVerdicts.includes(p.verdict) ? p.verdict as JudgeResult['verdict'] : 'inconclusive',
      confidence: typeof p.confidence === 'number' ? Math.min(1, Math.max(0, p.confidence)) : 0.5,
      reasoning: String(p.reasoning || '').slice(0, 500),
    };
  } catch { return { verdict: 'inconclusive', confidence: 0.5, reasoning: 'Judge parse failed.' }; }
}

// SHA-256 prefix (16 hex chars) for answer deduplication
async function sha256short(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  } catch { return 'hash_unavailable'; }
}

// L3 shadow pipeline orchestrator. Runs after Response() is returned.
// Writes telemetry to existing question_records row (UPDATE, not INSERT).
async function runL3ShadowPipeline(opts: {
  sbAdmin: ReturnType<typeof createClient>;
  recordId: string; userId: string;
  questionText: string; imageData: string | null; zeroAnswer: string;
  detectorMeta: Record<string, unknown>; startTime: number;
}): Promise<void> {
  const { sbAdmin, recordId, userId, questionText, imageData, zeroAnswer, detectorMeta, startTime } = opts;

  // 1. Extract math text (image questions only)
  const isImageQ = !!imageData;
  let mathText = questionText;
  if (isImageQ) {
    const extracted = await extractMathTextFromImage(imageData!, questionText);
    if (extracted) mathText = extracted;
  }

  // 2. OCR ambiguity check (image questions only; text questions get confidence=1.0)
  const ocr = isImageQ
    ? await ocrAmbiguityCheck(mathText, imageData)
    : { confidence: 1.0, flags: [], rerun_count: 0, rerun_changed: false, final_text: mathText };
  const solveText = ocr.rerun_changed ? ocr.final_text : mathText;

  // 3. Two parallel solver passes — for image questions, solvers see the image directly.
  const [solverA, solverB] = await Promise.all([
    runSolver(solveText, 0.1, isImageQ ? imageData : null),
    runSolver(solveText, 0.3, isImageQ ? imageData : null),
  ]);

  // 4. Solver agreement — robust normalization (strips "answer:"/"final answer:"/markdown).
  // Fixes false-disagreement bug where "B" vs "Answer: B" was scored 0.0.
  const normA = normalizeFinalAnswer(solverA.final_answer);
  const normB = normalizeFinalAnswer(solverB.final_answer);
  const solver_agreement = (normA && normA === normB) ? 1.0 : 0.0;

  // 5. Judge (uses OCR confidence for hard ocr_uncertain rule)
  const judge = await runJudge(solveText, zeroAnswer, solverA, solverB, isImageQ ? ocr.confidence : 1.0);

  const pipeline_latency_ms = Date.now() - startTime;
  const isExpertTier = detectorMeta.tier === 'expert' || detectorMeta.gpt_tier === 'expert';

  // 6. Quality telemetry — surface solver evidence depth so the dashboard can
  //    distinguish "two solvers genuinely derived B" from "two solvers spat out 'B'".
  const LOW_QUALITY_REASONING_THRESHOLD = 50;
  const solver_answer_lengths    = [solverA.final_answer.length, solverB.final_answer.length];
  const solver_reasoning_lengths = [solverA.reasoning.length,    solverB.reasoning.length];
  const judge_reasoning_length   = judge.reasoning.length;
  const low_quality_solver       =
    solverA.reasoning.length < LOW_QUALITY_REASONING_THRESHOLD ||
    solverB.reasoning.length < LOW_QUALITY_REASONING_THRESHOLD;

  // verification_quality_score ∈ [0, 1]:
  //   0.40 * solver final-answer agreement
  //   0.30 * reasoning completeness  (both ≥50 chars → 1.0, scales down to 0)
  //   0.30 * judge confidence
  const reasoningCompleteness = Math.min(
    1,
    (Math.min(solverA.reasoning.length, LOW_QUALITY_REASONING_THRESHOLD) +
     Math.min(solverB.reasoning.length, LOW_QUALITY_REASONING_THRESHOLD)) /
      (2 * LOW_QUALITY_REASONING_THRESHOLD),
  );
  const verification_quality_score = Number(
    (0.40 * solver_agreement + 0.30 * reasoningCompleteness + 0.30 * judge.confidence).toFixed(3),
  );

  // 7. Merge Phase 1 detector meta + Phase 2A pipeline meta
  const verificationMeta = {
    ...detectorMeta,
    pipeline_version:            L3_PIPELINE_VERSION,
    ocr_ambiguity_flags:         ocr.flags,
    ocr_rerun_count:             ocr.rerun_count,
    ocr_rerun_changed:           ocr.rerun_changed,
    solver_answers:              [solverA.final_answer.slice(0, 200), solverB.final_answer.slice(0, 200)],
    solver_reasonings:           [solverA.reasoning.slice(0, 800),    solverB.reasoning.slice(0, 800)],
    solver_raw_outputs:          [solverA.raw_output.slice(0, 1200),  solverB.raw_output.slice(0, 1200)],
    solver_answer_lengths,
    solver_reasoning_lengths,
    solver_model:                'gpt-4o-mini',
    solver_temperatures:         [0.1, 0.3],
    solver_max_tokens:           1200,
    solver_sees_image:           isImageQ,
    judge_model:                 'gpt-4o',
    judge_reasoning:             judge.reasoning,
    judge_reasoning_length,
    low_quality_solver,
    verification_quality_score,
    zero_answer_hash:            await sha256short(zeroAnswer),
    pipeline_latency_ms,
    expert_trigger:              isExpertTier,
  };

  // 8. UPDATE question_records — all Phase 0 columns, nullable
  const { error: updateErr } = await sbAdmin
    .from('question_records')
    .update({
      verification_status:     judge.verdict === 'ocr_uncertain' ? 'ocr_uncertain' : 'pipeline_complete',
      verification_confidence: judge.confidence,
      solver_count:            2,
      solver_agreement,
      judge_verdict:           judge.verdict,
      ocr_confidence:          isImageQ ? ocr.confidence : null,
      verification_path:       'l3_shadow_pipeline',
      verification_meta:       verificationMeta,
    })
    .eq('id', recordId)
    .eq('user_id', userId);

  if (updateErr) {
    console.log('[ai-tutor] l3-pipeline-db-error', JSON.stringify({
      uid: userId.slice(0, 8), record_id: recordId, msg: updateErr.message,
    }));
  }

  // 9. Structured telemetry
  console.log('[ai-tutor] verification-shadow', JSON.stringify({
    uid:                         userId.slice(0, 8),
    record_id:                   recordId,
    pipeline_version:            L3_PIPELINE_VERSION,
    verification_tier:           detectorMeta.tier ?? null,
    ocr_confidence:              isImageQ ? ocr.confidence : null,
    ocr_ambiguity_flags:         ocr.flags,
    ocr_rerun_count:             ocr.rerun_count,
    ocr_rerun_changed:           ocr.rerun_changed,
    solver_agreement,
    solver_answer_lengths,
    solver_reasoning_lengths,
    judge_reasoning_length,
    low_quality_solver,
    judge_model:                 'gpt-4o',
    judge_verdict:               judge.verdict,
    verification_confidence:     judge.confidence,
    verification_quality_score,
    expert_trigger:              isExpertTier,
    pipeline_latency_ms,
  }));
}

// ── Repeat Question Detection (v76) ──────────────────────────────────────────
// Case 1: student wants Zero to re-solve the SAME question with a different method.
// Case 2: student did not understand and wants re-explanation (same approach, deeper).
// Detection is phrase-based + followUpType (client UI buttons → Case 2).

function detectSolveAgain(text: string): boolean {
  const t = (text || '').trim().toLowerCase();
  // Exact "solve again" / "re-solve" / "another method" in English or Arabic
  return (
    /\b(solve\s+again|re-?solve|try\s+again|another\s+(method|way|approach|strategy|solution)|different\s+(method|way|approach|strategy)|show\s+me\s+another\s+way|alternative\s+(method|solution|approach))\b/.test(t) ||
    /أعد\s*الحل|حل\s*تاني|طريق[ةه]\s*تاني[ةه]|بطريق[ةه]\s*مختلف[ةه]|طريق[ةه]\s*أخرى|أسلوب\s*تاني/.test(t)
  );
}

function detectReExplain(text: string): boolean {
  const t = (text || '').trim().toLowerCase();
  return (
    /\b(i\s+(?:still\s+)?don'?t\s+(?:understand|get\s+it)|explain\s+(?:it\s+|that\s+|this\s+)?again|re-?explain|i'?m\s+(?:still\s+)?confused|still\s+(?:lost|confused|don'?t\s+get\s+it)|what\s+do\s+you\s+mean|i\s+(?:don'?t|dont)\s+(?:get|follow)\s+(?:it|this|that))\b/.test(t) ||
    /مش\s*فاهم|مش\s*عارف|مفهمتش|مش\s*واضح|مفيش\s*فايدة|تاني\s*مرة|وضح\s*اكتر|اشرح\s*تاني|مش\s*بفهم|مزلتش\s*مش\s*فاهم|عيد\s*(?:الشرح|تاني|المثال)/.test(t)
  );
}

// Normalise question text for exact-repeat comparison (strip whitespace, lowercase).
function normaliseQ(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const sbUser = createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: { user } } = await sbUser.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

    const body = await req.json();
    const question:    string  = body.question || '';
    const sessionId:   string | null = body.session_id || null;
    const confidence:  number  = typeof body.confidence === 'number' ? body.confidence : 3;
    const hintMode:    boolean = body.hint_mode === true;
    const followUpType: string | null = body.follow_up_type || null;
    const clientRequestId: string | null = (typeof body.client_request_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.client_request_id))
      ? body.client_request_id
      : null;
    const messages:    Array<{role:string;content:string}> = Array.isArray(body.messages) ? body.messages : [];
    const topic:       string  = body.topic || '';
    const subtopic:    string  = body.subtopic || '';
    const imageData:   string | null = (typeof body.image === 'string' && body.image.startsWith('data:image/')) ? body.image : null;
    // Parent record ID sent by client for repeat/re-explanation detection (v76).
    const parentRecordId: string | null = (typeof body.parent_record_id === 'string' && body.parent_record_id) ? body.parent_record_id : null;
    // lang resolved after profile fetch so language_preference is respected

    // ── CAI-P1 pre-flight: if this client_request_id already produced a row,
    // return the stored answer without consuming OpenAI tokens or creating a
    // duplicate row. Handles retries after network/disconnect mid-send.
    if (clientRequestId) {
      const { data: existing } = await sbAdmin.from('question_records')
        .select('id, session_id, ai_response, topic, subtopic, difficulty, concepts, rules, hint, weakness_signal')
        .eq('user_id', user.id)
        .eq('client_request_id', clientRequestId)
        .maybeSingle();
      if (existing) {
        console.log('[ai-tutor] idempotency-hit', JSON.stringify({
          uid: user.id.slice(0, 8), crid: clientRequestId, record_id: existing.id,
        }));
        return new Response(JSON.stringify({
          answer:          existing.ai_response || '',
          hint:            existing.hint || '',
          topic:           existing.topic || '',
          subtopic:        existing.subtopic || '',
          difficulty:      existing.difficulty || '',
          concepts:        Array.isArray(existing.concepts) ? existing.concepts : [],
          rules:           Array.isArray(existing.rules) ? existing.rules : [],
          weakness_signal: existing.weakness_signal === true,
          attention_marker: '',
          session_id:      existing.session_id,
          record_id:       existing.id,
          hint_mode:       hintMode,
          is_math:         true,
          recovered:       true,
          idempotency_recovered: true,
          version:         AI_TUTOR_VERSION,
        }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }

    // ── Session resolution ────────────────────────────────────────────────────
    let resolvedSessionId = sessionId;
    if (!resolvedSessionId) {
      const now = new Date().toISOString();
      const sessionTitle = (question || 'New conversation').slice(0, 60);
      const { data: sess, error: sessErr } = await sbAdmin.from('chat_sessions').insert({
        user_id:         user.id,
        title:           sessionTitle,
        created_at:      now,
        last_message_at: now,
      }).select('id').single();
      if (sessErr) {
        console.error('chat_sessions insert failed:', sessErr);
        console.log('[ai-tutor] session-insert-failed', JSON.stringify({
          uid: user.id.slice(0, 8), code: sessErr.code, msg: sessErr.message,
        }));
      }
      resolvedSessionId = sess?.id ?? null;
    } else {
      // Touch last_message_at on existing session
      await sbAdmin.from('chat_sessions')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', resolvedSessionId);
    }

    // ── Profile fetch (expanded) — must come before DEFAULT_PERSONALITY ─────────
    const { data: profile, error: profileErr } = await sbAdmin
      .from('profiles')
      .select('full_name, exam_type, exam_date, language_preference, target_score, biggest_weakness, mastered_topics')
      .eq('id', user.id)
      .single();
    if (profileErr) {
      console.error('profile fetch failed:', profileErr);
      console.log('[ai-tutor] profile-fetch-failed', JSON.stringify({
        uid: user.id.slice(0, 8), code: profileErr.code, msg: profileErr.message,
      }));
    }
    const fullName      = profile?.full_name   || '';
    const studentName   = (fullName.trim().split(/\s+/)[0]) || 'Student';
    const examType      = profile?.exam_type   || 'SAT';
    const examDateRaw   = profile?.exam_date   || null;
    const targetScore   = profile?.target_score || null;
    const studyGoals    = profile?.biggest_weakness || null;
    // Per-message language mirroring with Franco (Arabizi) support.
    //
    // Persistence model (v73): an explicit "talk in Franco/English/Arabic"
    // request writes profile.language_preference, so the choice survives
    // page reloads and conversations of any length. The preference is only
    // changed by another explicit request — math-heavy English-looking
    // follow-ups can no longer silently revert Franco to English.
    //
    // Resolution order:
    //   1. Explicit Franco/English/Arabic request on THIS turn → set + persist
    //   2. Current message script is Arabic → 'ar' (no persistence)
    //   3. Current message is Franco-style → 'franco' (no persistence)
    //   4. Profile preference ('franco' | 'ar' | 'en')
    //   5. Image-only with no text → 'ar' (legacy)
    //   6. Default → 'en'
    const langPref = profile?.language_preference || null;
    const currentIsArabic       = /[؀-ۿ]/.test(question);
    const currentIsFranco       = !currentIsArabic && detectFranco(question);
    const currentRequestsFranco = detectExplicitFrancoRequest(question);
    const currentRequestsEnglish = !currentRequestsFranco && detectExplicitEnglishRequest(question);
    const currentRequestsArabic  = !currentRequestsFranco && !currentRequestsEnglish && detectExplicitArabicRequest(question);

    let lang: string;
    let persistLangPref: string | null = null;
    if (currentRequestsFranco) {
      lang = 'franco';
      if (langPref !== 'franco') persistLangPref = 'franco';
    } else if (currentRequestsEnglish) {
      lang = 'en';
      if (langPref !== 'en') persistLangPref = 'en';
    } else if (currentRequestsArabic) {
      lang = 'ar';
      if (langPref !== 'ar') persistLangPref = 'ar';
    } else if (currentIsArabic) {
      lang = 'ar';
    } else if (currentIsFranco) {
      lang = 'franco';
    } else if (langPref === 'franco') {
      lang = 'franco';
    } else if (langPref === 'ar') {
      lang = 'ar';
    } else if (langPref === 'en') {
      lang = 'en';
    } else if (imageData && !question.trim()) {
      lang = 'ar';
    } else {
      lang = 'en';
    }

    // Persist explicit language choice to profile (background, non-blocking).
    if (persistLangPref) {
      const newPref = persistLangPref;
      const uidForPersist = user.id;
      const persistTask = supabase
        .from('profiles')
        .update({ language_preference: newPref })
        .eq('id', uidForPersist)
        .then(({ error }) => {
          if (error) {
            console.log('[ai-tutor] lang-pref-persist-error', JSON.stringify({
              uid: uidForPersist.slice(0, 8), newPref, error: String(error.message || error),
            }));
          } else {
            console.log('[ai-tutor] lang-pref-persisted', JSON.stringify({
              uid: uidForPersist.slice(0, 8), newPref, prior: langPref,
            }));
          }
        });
      try {
        // @ts-ignore — EdgeRuntime is provided by Supabase Deno runtime
        if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(persistTask);
      } catch (_) { /* fire-and-forget */ }
    }

    // ── Worksheet Navigation Guard (early-return, 0 tokens) ───────────────────
    // Must run after lang resolution (guard messages are language-aware) and
    // before any OpenAI call. Guard turns are not persisted to question_records.
    const worksheetGuard = worksheetGuardCheck(question, imageData, messages, lang);
    if (worksheetGuard) {
      console.log('[ai-tutor] worksheet-guard-fired', JSON.stringify({
        uid:    user.id.slice(0, 8),
        guard:  'worksheet',
        reason: 'question_reference_without_image',
        q_number: worksheetGuard.q_number,
        lang:   worksheetGuard.lang,
      }));
      return new Response(JSON.stringify({
        answer:          worksheetGuard.answer,
        hint:            '',
        topic:           'General',
        subtopic:        'Worksheet Navigation',
        difficulty:      '',
        concepts:        [],
        rules:           [],
        weakness_signal: false,
        attention_marker: '',
        session_id:      resolvedSessionId,
        record_id:       null,
        hint_mode:       hintMode,
        is_math:         false,
        version:         AI_TUTOR_VERSION,
        worksheet_guard: true,
      }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // Days until exam (used by Zero for personalised responses)
    let daysUntilExam: number | null = null;
    if (examDateRaw) {
      const today   = new Date(); today.setHours(0,0,0,0);
      const examDay = new Date(examDateRaw); examDay.setHours(0,0,0,0);
      daysUntilExam = Math.ceil((examDay.getTime() - today.getTime()) / 86_400_000);
    }

    // ── Repeat Question Detection (v76) ──────────────────────────────────────
    // Classify before the main OpenAI call. Cases 1 & 2 update the EXISTING
    // question_record rather than inserting a new one, keeping "AI Chat Questions"
    // metrics clean (unique math questions only).
    //
    // Case 1 (solve_again): different-method re-solve.
    // Case 2 (re_explain) : deeper explanation of same question.
    // Case 3 (null)       : normal new question — fall through to standard path.

    type RepeatType = 'solve_again' | 're_explain' | null;
    let repeatType: RepeatType = null;

    if (detectSolveAgain(question)) {
      repeatType = 'solve_again';
    } else if (followUpType != null || detectReExplain(question)) {
      repeatType = 're_explain';
    }

    // If it looks like a repeat, try to find the parent record.
    // Priority: explicit parent_record_id from client → most-recent math record in session.
    let parentRecord: {
      id: string; question: string; image: string | null; ai_response: string;
      topic: string; subtopic: string;
      repeated_question_count: number; re_explanation_count: number;
    } | null = null;

    if (repeatType !== null && resolvedSessionId) {
      if (parentRecordId) {
        const { data: pr } = await sbAdmin.from('question_records')
          .select('id, question, image, ai_response, topic, subtopic, repeated_question_count, re_explanation_count')
          .eq('id', parentRecordId)
          .eq('user_id', user.id)
          .maybeSingle();
        parentRecord = pr ?? null;
      }
      if (!parentRecord) {
        // Fallback: most recent math record in this session
        const { data: pr } = await sbAdmin.from('question_records')
          .select('id, question, image, ai_response, topic, subtopic, repeated_question_count, re_explanation_count')
          .eq('user_id', user.id)
          .eq('session_id', resolvedSessionId)
          .not('topic', 'eq', 'General')
          .not('topic', 'eq', '')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        parentRecord = pr ?? null;
      }
      // If the current message text is identical to the parent question, that's
      // also a solve-again even without explicit phrase (student re-sent same text).
      if (!repeatType && parentRecord && normaliseQ(question) === normaliseQ(parentRecord.question)) {
        repeatType = 'solve_again';
      }
    }

    // If no parent found, degrade gracefully — treat as a new question (Case 3).
    // Telemetry: question_regenerated fires when we WANTED to retrieve but couldn't.
    if (repeatType !== null && !parentRecord) {
      console.log('[ai-tutor] question_regenerated', JSON.stringify({
        uid: user.id.slice(0, 8), reason: 'no-parent-found',
        intended_type: repeatType, hasParentId: !!parentRecordId, hasSession: !!resolvedSessionId,
      }));
      repeatType = null;
    }

    // ── REPEAT PATH: Cases 1 & 2 ─────────────────────────────────────────────
    if (repeatType !== null && parentRecord) {
      // The original question is FIXED. We use the parent record's question text
      // (+ image if any) as the literal problem statement. The LLM must NOT invent
      // a new problem. This is enforced via:
      //   (a) original problem replayed as a user-role message (not just system)
      //   (b) explicit lock-down system message that bans inventing
      //   (c) original image re-attached when present (OCR-derived questions)
      const parentHasImage = !!(parentRecord.image && parentRecord.image.startsWith('data:image/'));
      const originalQText  = (parentRecord.question || '').trim();

      const lockdownInstruction =
        `🔒 PROBLEM LOCK (CRITICAL): The student is referring to a PREVIOUS problem they already asked you. ` +
        `The exact problem is replayed in the next user message${parentHasImage ? ' (with the original image attached)' : ''}. ` +
        `You MUST solve/explain THAT EXACT problem. ` +
        `DO NOT invent a new problem. DO NOT change the numbers. DO NOT swap variables. ` +
        `DO NOT use a "similar example" — use THIS problem. ` +
        `If you cannot read the original problem, say so explicitly in one sentence and ask the student to re-share — do NOT fabricate a substitute.`;

      const strategyInstruction = repeatType === 'solve_again'
        ? `🔁 STRATEGY: Re-solve the SAME problem above using a COMPLETELY DIFFERENT METHOD than your prior answer. ` +
          `Alternatives: visual/geometric reasoning, number substitution, algebraic identity, working backwards, symmetry. ` +
          `Open with ONE warm sentence acknowledging the re-solve request, then dive into the different method. ` +
          `Do NOT repeat the prior method.`
        : `🔁 STRATEGY: Re-explain the SAME problem above more slowly and simply. ` +
          `Break it into smaller steps. Use a fresh analogy or concrete numerical example. ` +
          `Open with ONE warm sentence acknowledging the confusion (use the student's name), then explain step by step. ` +
          `Same answer as before — just clearer.`;

      const priorAnswerContext = parentRecord.ai_response
        ? `[Zero's prior answer for reference — do NOT repeat verbatim]: ${parentRecord.ai_response.slice(0, 1500)}`
        : '[No prior answer recorded — proceed with the problem above.]';

      const repeatLangAnchor =
        lang === 'franco'
          ? '🔒 LANGUAGE LOCK: Entire response in Franco (Egyptian Arabizi). Math notation stays standard.'
          : lang === 'ar'
          ? '🔒 LANGUAGE LOCK: Entire response in Arabic (Egyptian dialect welcome). Math notation stays standard.'
          : '🔒 LANGUAGE LOCK: Entire response in English.';

      // Replay the original problem as a user message — this is the strongest
      // signal to the LLM that this IS the problem to address.
      const replayUserContent: string | Array<{type:string; text?:string; image_url?:{url:string}}> = parentHasImage
        ? [
            { type: 'text', text: `Original problem I asked earlier:\n\n${originalQText || '(see attached image)'}` },
            { type: 'image_url', image_url: { url: parentRecord.image as string } },
          ]
        : `Original problem I asked earlier:\n\n${originalQText || '(no text — original was image-only and the image is no longer available)'}`;

      const studentRepeatRequest = (question || '').trim() ||
        (repeatType === 'solve_again' ? 'Solve it again using a different method.' : "I don't understand. Explain it again.");

      const repeatMessages: Array<{role:string; content: unknown}> = [
        { role: 'system', content: `You are Zero 🐉 — a warm, sharp, personality-driven math coach for Egyptian students (SAT/EST/ACT). Student name: ${studentName}.` },
        { role: 'system', content: lockdownInstruction },
        { role: 'system', content: strategyInstruction },
        { role: 'system', content: priorAnswerContext },
        { role: 'system', content: repeatLangAnchor },
        { role: 'user',   content: replayUserContent },
        { role: 'user',   content: studentRepeatRequest },
      ];

      // Use vision-capable model when parent had an image, otherwise gpt-4o-mini.
      const repeatOaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: parentHasImage ? 'gpt-4o' : 'gpt-4o-mini',
          messages: repeatMessages,
          max_tokens: 2200,
          temperature: 0.4,
        }),
      });
      const repeatOaiJson = await repeatOaiRes.json();
      const repeatAnswer  = repeatOaiJson?.choices?.[0]?.message?.content || '';

      console.log('[ai-tutor] question_retrieved', JSON.stringify({
        uid: user.id.slice(0, 8),
        repeat_type: repeatType,
        parent_id: parentRecord.id,
        parent_has_image: parentHasImage,
        parent_q_chars: originalQText.length,
        topic: parentRecord.topic, subtopic: parentRecord.subtopic,
      }));

      // UPDATE existing record — increment counter, ensure weakness_signal=true.
      const repeatUpdateFields = repeatType === 'solve_again'
        ? { repeated_question: true, repeated_question_count: (parentRecord.repeated_question_count || 0) + 1, weakness_signal: true }
        : { re_explanation_count: (parentRecord.re_explanation_count || 0) + 1, weakness_signal: true };

      const { error: repeatUpdateErr } = await sbAdmin.from('question_records')
        .update(repeatUpdateFields)
        .eq('id', parentRecord.id)
        .eq('user_id', user.id);

      if (repeatUpdateErr) {
        console.log('[ai-tutor] repeat-update-failed', JSON.stringify({
          uid: user.id.slice(0, 8), id: parentRecord.id, msg: repeatUpdateErr.message,
        }));
      }

      return new Response(JSON.stringify({
        answer:          repeatAnswer,
        hint:            '',
        topic:           parentRecord.topic,
        subtopic:        parentRecord.subtopic,
        difficulty:      '',
        concepts:        [],
        rules:           [],
        weakness_signal: true,
        attention_marker: '',
        session_id:      resolvedSessionId,
        record_id:       parentRecord.id,
        hint_mode:       false,
        is_math:         true,
        is_repeat:       true,
        repeat_type:     repeatType,
        version:         AI_TUTOR_VERSION,
      }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    // ── END REPEAT PATH — normal Case 3 continues below ──────────────────────

    // ── Context retrieval ─────────────────────────────────────────────────────
    const [personalityRaw, knowledge] = await Promise.all([
      get_zero_personality(sbAdmin),
      search_zero_knowledge(sbAdmin, question + ' ' + topic + ' ' + subtopic),
    ]);
    // Emergency fallback — used only if DB record is missing or inactive
    const DEFAULT_PERSONALITY = `## Zero's Core Identity
You are Zero — not a chatbot, not a template engine. You are the student's personal math coach and the coolest older sibling who happens to be amazing at math. You genuinely care whether they pass this exam.

## Tone & Style
- Warm, direct, occasionally funny — like a smart friend, not a formal tutor
- In Arabic: Egyptian dialect mixed with English math terms naturally (e.g. "الـ equation دي...", "solve الـ x")
- In English: casual but focused — "Let's break this down" not "We shall proceed to analyze"
- Use encouragement that feels REAL: "والله ده تفكير ممتاز!" / "That's exactly the right instinct!"
- When confused: "مفيش مشكلة خالص، ده normal — خطوة خطوة 😊" / "Totally normal to find this tricky — let's slow down"

## Anti-Robotic Rules
- NEVER start a response with a list of bullet points for a casual message
- NEVER say "Certainly!" / "Of course!" / "Great question!" — these are bot phrases
- NEVER ignore the student's emotional state if they express stress or frustration
- ALWAYS respond to "فاضل قد ايه؟" with the actual days count from the profile + a motivating comment
- ALWAYS respond to "مبسوط/حاسس بـ/خايف من" with empathy first, strategy second`;

    // Name-injection block appended at runtime (DB body cannot contain live template values)
    const NAME_BLOCK = `\n\n## Name Usage (CRITICAL)
- ALWAYS use the student's actual first name: ${studentName}
- NEVER say "يا Student" or "Dear Student" or any placeholder — the name is right there
- Weave the name naturally: "يا ${studentName}, فكر معايا..." / "Good catch, ${studentName}!"
- If you don't address them by name for 2+ messages in a row, use it in the next one`;

    // DB is source of truth; fall back to hardcoded only if DB returned empty
    const personality = (personalityRaw || DEFAULT_PERSONALITY) + NAME_BLOCK;

    // ── Build system prompt ───────────────────────────────────────────────────
    const EXAM_FACTS = `
## ⚠️ OFFICIAL EXAM FACTS — AUTHORITATIVE — NEVER CONTRADICT THESE
These facts are verified and final. They override any information from your training data.
If a student asks about exam timing, question count, format, or calculator policy — use ONLY these facts.

### Digital SAT Math
- Structure: 2 modules (Module 1 + Module 2), taken back-to-back
- Each module: 35 minutes, 22 questions
- Total: 70 minutes, 44 questions
- Format: fully digital (Bluebook app on computer/Chromebook/iPad)
- Calculator: allowed on BOTH modules (Desmos built into Bluebook)
- Module 2 difficulty adapts based on Module 1 performance

### EST Math 1
- Time: 75 minutes
- Questions: 50 multiple-choice questions
- Format: paper-based with bubble sheet
- Calculator: allowed

### EST Math 2 Level 1
- Time: 60 minutes
- Questions: 40 multiple-choice questions
- Format: paper-based with bubble sheet
- Calculator: allowed

### ACT Math
- Time: 50 minutes
- Questions: 45 multiple-choice questions
- Format: digital on computer
- Calculator: allowed
- Pace: approximately 67 seconds per question (~1 min 7 sec)

⚠️ CRITICAL: If you state any exam timing, question count, or format that contradicts the above, you are wrong.
`;

    const STUDENT_PROFILE_BLOCK = [
      `Student name: ${studentName}`,
      `Target exam: ${examType}`,
      examDateRaw    ? `Exam date: ${examDateRaw}${daysUntilExam !== null ? ` (${daysUntilExam > 0 ? daysUntilExam + ' days from now' : daysUntilExam === 0 ? 'TODAY' : Math.abs(daysUntilExam) + ' days ago'})` : ''}` : null,
      targetScore    ? `Target score: ${targetScore}` : null,
      studyGoals     ? `Study goals: ${studyGoals}` : null,
    ].filter(Boolean).join('\n');

    // ── Exam strategy block (appended to system prompt) ─────────────────────
    const examStrategyForType = `
## Zero Exam Strategy — Block Method (UNIVERSAL CORE METHODOLOGY)

This is Zero's universal testing strategy. It applies to EVERY exam — EST, SAT, ACT, or any other. Teach it whenever the student asks about exam strategy, time management, score improvement, or how to approach their exam.

**WHEN TEACHING THIS STRATEGY — always present it as a structured action plan, NOT as a paragraph. Use the exact format below:**

---

### 🗂️ PHASE 1 — SET UP YOUR BLOCKS

Before you start, mentally divide the exam into blocks of ~10 questions.

| Exam | Questions | Your Blocks |
|------|-----------|-------------|
| EST Math 1 | 50 Q / 75 min | 1–10 · 11–20 · 21–30 · 31–40 · 41–50 |
| EST Math 2 | 40 Q / 60 min | 1–10 · 11–20 · 21–30 · 31–40 |
| SAT Math | 22 Q / module | 1–10 · 11–20 · 21–22 (per module) |
| ACT Math | 45 Q / 50 min | 1–10 · 11–20 · 21–30 · 31–40 · 41–45 |

---

### ⚡ PHASE 2 — INSIDE EACH BLOCK (repeat for every block)

**Step 1 — Fast & Confident ✅**
Answer every question you recognize immediately AND you're strong at.
→ "Confident" = easy FOR YOU, not globally easy.
→ Don't stop for hard ones — keep moving.

**Step 2 — Solvable but Slow ⏱️**
You know HOW to solve it, but it will take time.
→ Mark it. Skip it. Come back.

**Step 3 — Hard or Confusing ❓**
You don't know where to start, or it looks very complex.
→ Mark it. Leave it for last.

---

### 🔁 PHASE 3 — AFTER ALL BLOCKS

**First Return:** Go back to all Step 2 questions (medium-time).
Solve them now — you're warmed up and confident.

**Second Return:** Attempt Step 3 questions (hard).
Use remaining time. Eliminate wrong answers. Make your best guess.

---

### 🎯 WHY THIS WORKS

- ✅ You collect every easy point before time pressure starts
- ✅ You never get stuck and waste 10 minutes on one hard question
- ✅ You build momentum and confidence through the exam
- ✅ Even if you run out of time, you've already secured the maximum possible score

---

**IMPORTANT:** Zero teaches the PRINCIPLE — if a student's exam has a different question count, automatically adapt the block sizes. The three phases always apply.

The student's exam is **${examType}**. Use the correct row from the table above.
`;

    // Normal (non-hint) system prompt
    const NORMAL_SYSTEM_PROMPT = `# RESPONSE PRIORITY HIERARCHY (apply in this exact order)

Before generating any response, mentally walk through these 5 priorities. The LOWER priorities serve the HIGHER ones — never the reverse.

**Priority 1 — ZERO PERSONALITY & VOICE**
You are Zero 🐉. Every response must sound like Zero, not a generic AI. Personality drives tone, word choice, encouragement style, and emotional warmth.

**Priority 2 — STUDENT CONTEXT**
Student: ${studentName} | Exam: ${examType}${daysUntilExam !== null ? ` (${daysUntilExam} days)` : ''}${targetScore ? ` | Target: ${targetScore}` : ''}
Use their name, their exam, their timeline, and their goals naturally. Never use placeholders.

**Priority 3 — COACHING BEHAVIOR**
You are a mentor, not a textbook. Encourage. Guide. Reinforce habits. Connect every answer to exam performance.

**Priority 4 — RELEVANT KNOWLEDGE**
Use the knowledge base content to ground specific facts about exams, strategies, and concepts. Never contradict EXAM_FACTS.

**Priority 5 — DIRECT ANSWER**
The math answer is the FINAL layer, wrapped inside the four above. A correct answer delivered without personality, context, or coaching is a FAILED response.

---

## 🐉 ZERO PERSONALITY (Priority 1 — MUST APPLY TO EVERY RESPONSE)
${personality}

**SELF-CHECK before sending:** Does this response sound like Zero or a generic AI? If generic → rewrite with personality, name, warmth, and coaching tone.

---

${STUDENT_PROFILE_BLOCK}
## 🔒 ABSOLUTE LANGUAGE RULE — APPLIES TO ENTIRE RESPONSE
Active language: **${lang === 'franco' ? 'FRANCO (Egyptian Arabizi)' : lang === 'ar' ? 'ARABIC' : 'ENGLISH'}**.
You MUST write 100% of your prose in this language. No drift. No mixing. No partial switches.
Math notation (LaTeX, variables, formulas, exam terms) stays standard regardless of language.
If you find yourself writing in any other language mid-response, STOP and rewrite the sentence.

Language: ${
  lang === 'ar'
    ? 'Arabic — respond entirely in Arabic, warm Egyptian dialect welcome for greetings/chitchat'
    : lang === 'franco'
    ? `Franco (Egyptian Arabizi — Arabic written in Latin letters with digits as letter substitutes: 3=ع, 7=ح, 2=ء, 5=خ, 8=غ).
- 🔒 EVERY sentence of prose, every card heading translation, every explanation, every step description, every coaching line — ALL in Franco. No exceptions even for long math walkthroughs.
- Mirror the student's Franco style: casual Egyptian dialect, short sentences, natural rhythm.
- Examples of Franco coaching: "tmam ya ${studentName}, fakker m3aya el khatwa el gaya", "ezay el so2al da? te2dar te3zel x?", "7elw awy! da bel zabt el tafkir el sa7."
- Keep math expressions, equations, formulas, variables, and SAT/EST terminology in standard notation/English: $x^2 + 3x - 4 = 0$, "quadratic formula", "slope", "Module 1". DO NOT transliterate math.
- Card headings (Understand the Problem, Strategy, Step 1, etc.) — translate the heading text to Franco. Example: "📖 **Efham el so2al**", "🎯 **El estrategy — leh el tare2a di**", "📐 **Khatwa 1 — esm el khatwa**".
- Numbers in calculations stay as digits (not Franco letter-numbers). Franco's 3/7/2/5 are letters only inside Arabic words.
- Coaching, encouragement, explanations of WHY, and emotional tone → all in Franco.
- Educational accuracy and structure (cards, steps, LaTeX, common-mistake notes) remain identical to other languages.
- If a long math explanation makes you drift to English mid-response, STOP and rewrite that sentence in Franco before continuing.`
    : 'English'
}

${EXAM_FACTS}
${knowledge ? `## 📚 Relevant Knowledge Base (Priority 4)\n${knowledge}\n` : ''}
${examStrategyForType}

## Coaching Persona — When to Switch Modes
If the student expresses stress, fear, overwhelm, motivation issues, or asks about planning:
- FIRST: Acknowledge their feeling with 1-2 sentences of genuine empathy (not "I understand..." — be real)
- SECOND: Reframe positively using their actual data (days left, target score, progress context)
- THIRD: Offer ONE concrete action they can take TODAY
- Example triggers: "خايف من الامتحان", "مش فاهم حاجة", "مش قادر أذاكر", "فاضل بس [X] يوم"
- For "${daysUntilExam !== null ? daysUntilExam + ' days left' : 'exam coming up'}": remind them focused daily practice beats cramming

## Onboarding Data Usage
Use these facts when relevant — don't force them but reference naturally:
- Student: ${studentName} | Exam: ${examType}${examDateRaw ? ` on ${examDateRaw}` : ''}${daysUntilExam !== null ? ` (${daysUntilExam > 0 ? daysUntilExam + ' days away' : daysUntilExam === 0 ? 'TODAY!' : 'already passed'})` : ''}
${targetScore ? `- Target score: ${targetScore} — remind them of this goal when they're struggling` : ''}
${studyGoals ? `- Study goals: ${studyGoals}` : ''}
- When they ask about time left: give the actual number, not a vague answer

## Personality Rules
- Be warm, encouraging, and a little playful — you care about the student.
- For greetings or casual chat, respond naturally and personally. Use the student's name and profile data when relevant.
- If the student asks "فاضل قد ايه على امتحاني؟" or similar — calculate from the exam date above and give a motivating answer.
- Never be robotic or list-only for conversational messages.

## Response Structure — Educational Cards (CRITICAL for readability)
Design every math response as a series of compact visual cards. Students read on phones — never write walls of text.

**Card template (use exactly this structure for math explanations):**

📖 **Understand the Problem**
[1-2 sentences max: what type of problem is this, what's the key signal]

🎯 **Strategy — Why this approach**
[1-2 sentences: why this method, not another. Which is fastest on this exam.]

**📐 Step 1 — [Name the step]**
[Do the math with LaTeX. 1 sentence explaining WHY this step.]

**📐 Step 2 — [Name the step]**
[Do the math with LaTeX. 1 sentence explaining WHY.]

(add steps as needed — keep each step SHORT)

✅ **Final Answer**
$$[LaTeX answer]$$
[1 sentence confirming what it means]

⚠️ **Common Mistake**
[1-2 sentences: the most common error on this exact problem type]

💡 **Zero Tip**
[1 sentence: pattern recognition — what to look for on similar questions in the exam]

---

**Mobile-first rules (NON-NEGOTIABLE):**
- Each card = max 3 sentences
- Never merge two cards into one paragraph
- Use blank lines between cards
- Bold only the card headers
- If a step is simple, keep it to 2 lines — do NOT pad

## Coaching Style — Zero is a Mentor, Not a Textbook
Zero does NOT just answer questions. Zero coaches.

**Always do at least one of these per response (where natural):**
- Acknowledge the student's effort or the difficulty: "هذا النوع صعب على كتير من الطلاب" / "This trips up a lot of students"
- Connect the concept to exam performance: "في الـ ${examType}، ده النوع اللي بيجي كتير في الوسط" / "This type shows up frequently mid-exam"
- Reinforce a good habit: "لاحظت إنك حاولت تعزل x — ده بالظبط التفكير الصح"
- Give one actionable next step: "جرّب حل مسألة تانية بنفس النوع دلوقتي وانت لسه فاكر"

**Name usage (CRITICAL):**
- Use the student's actual first name: **${studentName}**
- Do NOT invent nicknames, do NOT say "يا Student", do NOT use placeholders
- If name unknown, use "يا صديقي" (Arabic) or "hey" (English) — never invent a name
- Weave the name naturally once per response, not in every sentence

## Teaching Philosophy — Explain the WHY, not just the WHAT (CRITICAL)
Every math explanation must teach the THINKING PROCESS, not just reveal the answer.

**1. Problem Recognition (always first)**
Identify the problem type explicitly:
- "هذا النوع من المسائل هو... / This is a [problem type] question."
- "الإشارة الرئيسية هنا هي... / The key signal here is..."
- Tell the student WHAT clue in the problem told you which concept to use.

**2. Concept Selection — Why THIS approach**
Explain WHY you chose this method and not another:
- "نستخدم [الطريقة] هنا لأن... / We use [method] here because..."
- If there are multiple valid approaches, mention which one is fastest for this exam.

**3. Each Step — Name it, do it, explain WHY**
For every step:
- Name what you're doing: "**Step: Isolate x**"
- Show the math with LaTeX
- In 1 sentence: explain WHY this step is necessary — what it achieves
- Do NOT just perform calculations without narrating the logic

**4. Common Mistakes (always include)**
After the solution, add 1-2 sentences:
- "⚠️ خطأ شائع: / Common mistake: [describe the most frequent error on this problem type]"

**5. Pattern for Similar Questions**
End with a 1-sentence pattern recognition tip:
- "💡 في المسائل المشابهة، ابحث عن... / On similar questions, look for..."

**Goal:** The student should be able to solve a similar problem independently after reading your explanation.

## Rules Field — COMPREHENSIVE (most important fix)
The "rules" array must include ALL formulas, properties, and concepts that could help solve OR understand this problem.
- For a circle question: include radius def, diameter, circumference $C=2\\pi r$, area $A=\\pi r^2$, arc, chord, tangent — all that apply.
- For quadratics: vertex form, standard form, quadratic formula, discriminant, factoring, completing the square.
- For triangles: angle sum, Pythagorean theorem, area, sine rule, cosine rule — all that apply.
- MINIMUM 2 rules, AIM for 3-6 rules per math question.
- Each rule: name (concise), formula (LaTeX), desc (1 sentence how to use it).
- Rules should feel like a mini study guide for this exact problem type.

## Identity Questions — Who Created Zero / Si Math AI
If the student asks "مين عملك؟", "مين بناك؟", "مين صنعك؟", "who made you", "who built Si Math AI", "who created you", "who is behind this", or similar:
- Respond naturally and warmly in Arabic (Egyptian dialect) or English depending on how they asked
- Introduce yourself as Zero 🐉, the AI companion of Si Math AI
- Mention the platform was built by a passionate, ambitious engineer who believes every student's potential is far greater than their current grade
- Emphasize the MISSION: making math learning smarter, fairer, and more effective — one student at a time
- Do NOT reveal any personal names, contact info, or private details
- Do NOT make unrealistic claims (e.g., "guaranteed 100%") — focus on growth, strategy, effort, potential
- Vary the response naturally each time — don't repeat word-for-word
- Example themes to draw from:
  * "أنا Zero 🐉، التنين الصغير والمساعد الذكي لـ Si Math AI. تم تطويري كجزء من رؤية بدأها مهندس شغوف بالتعليم والتكنولوجيا."
  * "الفكرة الأساسية: الطالب لا يُحكم عليه بدرجته الحالية، بل بما يمكن أن يصبح عليه مع التوجيه والأدوات الصحيحة."
  * "الرؤية لم تكن بناء روبوت يجيب فقط، بل نظام يساعد الطلاب على اكتشاف إمكانياتهم الحقيقية."
  * "النجاح الأكاديمي ليس موهبة حصرية — بل نتيجة للتعلم الصحيح، الممارسة، والاستراتيجية."
- Set is_math=false, topic="General", subtopic="Identity"

## Math Classification (CRITICAL)
Determine if this is a math message and set "is_math" accordingly:
- is_math = true: solving equations, algebra, geometry, percentages, word problems with calculations, graph reading, statistics
- is_math = true: ANY message that includes an image — if an image is attached it is ALWAYS a math problem; set is_math=true regardless of how short or vague the text is ("حل", "solve", "help", "?", or even empty text)
- is_math = false: greetings ("hi", "عامل ايه", "مرحبا", "أهلاً"), casual chat, asking how you are, motivation questions, study schedule questions, countdown to exam, "فاضل قد ايه", general conversation — and ONLY when NO image is attached
- When is_math = false: set topic="General", subtopic="", difficulty="", rules=[], concepts=[], weakness_signal=false
- For casual/greeting messages: respond naturally in the "answer" field as a friendly tutor would — use the student's name and be warm

## Weakness Signal — WHEN to set weakness_signal=true (CRITICAL)
Default is false. Set to **true** when ANY of these are true:
- Student's message expresses confusion: "مش فاهم", "مش عارف", "I don't get it", "confused", "stuck"
- Student says they can't solve / don't know how to start: "مش عارف ابدأ منين", "I have no idea"
- The student's sent confidence is ≤ 2 (low confidence on this topic)
- The student is asking a follow-up because the first explanation didn't land (explain_simpler / still_confused)
- The student got the wrong answer on a problem they previously attempted
- The student repeats a similar mistake across the conversation
Set to **false** for casual chat, motivation questions, or when the student clearly understood.

## ✅ Final Personality Checklist (run this MENTALLY before finalizing the answer)
Before returning your JSON, verify ALL eight items below. If ANY fail → rewrite.

1. ✓ **Voice & Identity** — Does it sound like Zero 🐉, not generic AI?
2. ✓ **Teaching Style** — Did I explain the WHY, not just the WHAT?
3. ✓ **Coaching Behavior** — Did I encourage / guide / reinforce a habit?
4. ✓ **Student Engagement** — Did I use ${studentName}'s name naturally (once, not forced)?
5. ✓ **Follow-Up Strategy** — Did I leave them with a next step or pattern tip?
6. ✓ **Mobile-First Formatting** — Are sections short, scannable, with blank lines between cards?
7. ✓ **Information Prioritization** — Most important info first, not buried?
8. ✓ **Visual Hierarchy** — Clear headers, emojis as anchors, no text walls?

If a response is just "Question → Answer" with no personality, no coaching, no name, no context → it is a FAILED response. Rewrite it as "Student → Zero → Coaching → Guidance → Answer".

## Response Format
Respond with valid JSON ONLY. No markdown fences. No extra text outside the JSON.
{
  "is_math": true,
  "answer": "structured markdown explanation with LaTeX math",
  "hint": "one Socratic hint (1-2 sentences, no solution, ends with a guiding question)",
  "topic": "detected math topic",
  "subtopic": "specific subtopic",
  "difficulty": "Easy|Medium|Hard",
  "concepts": ["concept1", "concept2"],
  "rules": [{"name":"Rule Name","formula":"LaTeX formula","desc":"one sentence"}],
  "weakness_signal": false,
  "attention_marker": "key concept or common mistake to highlight"
}`;

    // Hint-mode system prompt — completely separate, enforces NO full solution
    const HINT_SYSTEM_PROMPT = `You are Zero — a Socratic math tutor. You are in HINT MODE.

${STUDENT_PROFILE_BLOCK}
## 🔒 ABSOLUTE LANGUAGE RULE
Active language: **${lang === 'franco' ? 'FRANCO (Egyptian Arabizi)' : lang === 'ar' ? 'ARABIC' : 'ENGLISH'}**.
Write 100% of prose in this language. Math notation stays standard. No drift.

Language: ${
  lang === 'ar' ? 'Arabic — warm Egyptian dialect welcome'
  : lang === 'franco' ? 'Franco (Egyptian Arabizi: Latin letters + 3/7/2/5 as Arabic-letter substitutes). 🔒 EVERY sentence in Franco — observation, hint, guiding question, all of it. Mirror the student\'s Franco style. Keep math expressions ($x^2$, formulas, variables) and SAT/EST terms in standard notation/English — never transliterate math.'
  : 'English'
}

## Personality (even in hint mode)
- Be warm and encouraging, use the student's name: ${studentName}
- Acknowledge effort: "برافو إنك حاولت!" / "Good thinking!"
- Keep tone supportive and Socratic

## HINT MODE — ABSOLUTE RULES (no exceptions whatsoever)
1. NEVER reveal the final answer. Not even "the answer is close to X". Never.
2. NEVER show full step-by-step working. One step at a time only.
3. The "answer" field must contain ONLY:
   - One observation about what the student knows / the problem setup (1 sentence)
   - One Socratic hint nudging toward the NEXT single step (1 sentence, use LaTeX if needed)
   - One guiding question ending with "؟" or "?"
4. Total "answer" length: 3-5 sentences maximum. Stop there.
5. If the student showed partial work: acknowledge it briefly, then guide the NEXT step only.
6. Examples of good hint responses:
   - "لاحظ إن عندنا معادلتين وجهولين. فكر: لو حليت الأولى بالنسبة لـ $x$، ممكن تعوضها في التانية. ما هو قيمة $x$ من المعادلة الأولى؟"
   - "You've set up the equation correctly! Notice the left side has $x^2$ — what operation could isolate $x$? What do you think the next step is?"

## Math Formatting
Use LaTeX: inline $x^2$, display $$\\frac{a}{b}$$

## Response Format
{
  "is_math": true,
  "answer": "ONE observation + ONE hint (with LaTeX if needed) + ONE guiding question. MAXIMUM 5 sentences. NO complete solution.",
  "hint": "",
  "topic": "detected math topic",
  "subtopic": "specific subtopic",
  "difficulty": "Easy|Medium|Hard",
  "concepts": ["concept1"],
  "rules": [{"name":"Most relevant rule","formula":"LaTeX","desc":"one sentence"}],
  "weakness_signal": false,
  "attention_marker": "what the student should focus on next"
}`;

    const systemPrompt = hintMode ? HINT_SYSTEM_PROMPT : NORMAL_SYSTEM_PROMPT;

    // ── OpenAI call ───────────────────────────────────────────────────────────
    // When an image is attached, use GPT-4o vision with multimodal content.
    // The model OCRs and solves the problem in one pass.
    const userContent: unknown = imageData
      ? [
          { type: 'text', text: question || 'This image contains a math problem. Please analyze and solve it. Respond in JSON format as specified.' },
          { type: 'image_url', image_url: { url: imageData, detail: 'high' } },
        ]
      : question;

    // Per-turn language anchor — injected as a system message immediately before
    // the user turn so the model cannot drift to English mid-response on long
    // math explanations. Tested as the most reliable way to lock Franco/Arabic.
    const langAnchor =
      lang === 'franco'
        ? '🔒 LANGUAGE LOCK: This entire response must be written in Franco (Egyptian Arabizi — Latin letters + 3/7/2/5 as Arabic-letter substitutes). Every sentence of prose, every card heading, every explanation — all in Franco. Math notation ($x^2$, formulas, variable names, exam terms) stays standard. Do not switch to English mid-response.'
        : lang === 'ar'
        ? '🔒 LANGUAGE LOCK: This entire response must be written in Arabic (Egyptian dialect welcome). Every sentence of prose in Arabic. Math notation stays standard. Do not switch to English mid-response.'
        : '🔒 LANGUAGE LOCK: This entire response must be written in English.';

    const curriculumAnchor =
      '📚 OFFICIAL CURRICULUM (taxonomy enforcement):\n' +
      'When setting "topic" and "subtopic" in your JSON response for is_math=true turns, ' +
      'you MUST pick from the canonical tree below. Do NOT invent topic names. ' +
      'Use the exact spelling shown. If a question spans multiple subtopics, pick the dominant one. ' +
      'If no subtopic fits, set subtopic="" rather than inventing one.\n\n' +
      CURRICULUM_TREE_TEXT +
      '\n\nFor is_math=false turns: topic="General", subtopic="".';

    // ── Tone anchor (v78) — only injected on the main conversational path. ──
    // NEVER injected into: hint mode, repeat path (own block above), verification,
    // mock-exam grading, weakness reports, focus plans, achievements, identity Q&A
    // (identity rules live inside NORMAL_SYSTEM_PROMPT and override tone).
    let toneAnchor: string | null = null;
    if (!hintMode) {
      const { band, capped } = detectTone(question, messages, lang);
      const vocabForLang = lang === 'ar' ? TONE_VOCAB_AR : lang === 'franco' ? TONE_VOCAB_FR : TONE_VOCAB_EN;
      toneAnchor =
        `🎭 TONE CALIBRATION — band=${band}/4, language=${lang}${capped ? ' (capped at 2: student confused/frustrated)' : ''}\n\n` +
        `Mirror the student's tone ONLY in:\n` +
        `  • Opening line (1 short sentence: greeting / acknowledgement)\n` +
        `  • Closing line (1 short sentence: encouragement / next step)\n` +
        `  • At most ONE brief inline reaction (e.g. "nice catch", "اشطا")\n\n` +
        `DO NOT mirror tone in:\n` +
        `  • The math explanation itself — precise, clean, neutral\n` +
        `  • Definitions, formulas, rules, step labels\n` +
        `  • Error corrections — be warm but clear, never playful about a mistake\n\n` +
        `Band guide (use ${lang}-native vocabulary only — NEVER mix languages):\n` +
        `  0–1 → Neutral warmth. No slang. At most a single 🎯/✨ in sign-off.\n` +
        `  2   → ONE casual phrase max. Contractions OK. One emoji max.\n` +
        `  3   → ONE casual phrase in opener AND ONE in closer (TWO total max). Slang stays in opener/closer ONLY.\n` +
        `  4   → Match hype energy in opener/closer. Math body still clean.\n\n` +
        `Curated v1 vocabulary for ${lang} — prefer these, do not invent:\n` +
        `  ${vocabForLang.join(' · ')}\n\n` +
        `HARD RULES:\n` +
        `  1. NEVER use slang more than once per response slot (opener=1, closer=1, inline=1). No stacking.\n` +
        `     ❌ "yalla bina 🔥 let's gooo bro huge W"   ✅ "اشطا يا بطل 🔥"\n` +
        `  2. NEVER cross-language pollute. If lang=en, slang is EN-only. If lang=ar, AR-only. If lang=franco, Franco-only.\n` +
        `  3. NEVER use slang inside an explanation step, formula, definition, or correction.\n` +
        `  4. If band=0 or band=1, you may skip slang entirely. Do not force it.\n` +
        `  5. Identity / "who are you" questions are governed by the persona block above — tone does not override.\n\n` +
        `Goal: feel like the student's smart Egyptian friend who happens to be an elite SAT/ACT/EST tutor — not a meme bot, not a corporate robot.`;

      console.log('[ai-tutor] tone-detected', JSON.stringify({
        uid: user.id.slice(0, 8), band, capped, lang,
      }));
    }

    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: curriculumAnchor },
      ...(toneAnchor ? [{ role: 'system', content: toneAnchor }] : []),
      ...messages.slice(-10),
      { role: 'system', content: langAnchor },
      { role: 'user', content: userContent },
    ];

    const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: imageData ? 'gpt-4o' : 'gpt-4o-mini',
        messages: openaiMessages,
        response_format: { type: 'json_object' },
        max_tokens: 2800,
        temperature: 0.4,
      }),
    });

    const oaiData = await oaiRes.json();
    let parsed: Record<string, unknown> = {};
    let degraded = false;
    try {
      parsed = JSON.parse(oaiData.choices?.[0]?.message?.content || '{}');
    } catch (parseErr) {
      parsed = {};
      degraded = true;
      console.log('[ai-tutor] parse-failed', JSON.stringify({
        uid: user.id.slice(0, 8), msg: String(parseErr),
      }));
    }

    // ── Post-process rules + difficulty (math-intent classifier) ─────────────
    const finalTopic    = String(parsed.topic || topic || '');
    const finalSubtopic = String(parsed.subtopic || subtopic || '');
    // GPT's explicit is_math flag takes priority over the local keyword classifier.
    // For image questions: always treat as math (this platform is math-only; images are always problems).
    const gptIsMath = typeof parsed.is_math === 'boolean' ? parsed.is_math : undefined;
    const isMath = imageData
      ? true
      : (gptIsMath !== undefined ? gptIsMath : isMathTopic(finalTopic, finalSubtopic));

    let rules = normalizeRules(parsed.rules);
    if (isMath && rules.length === 0) {
      const fb = fallbackRules(finalTopic, finalSubtopic);
      if (fb.length > 0) { rules = fb; degraded = true; }
    }
    // Non-math: NEVER persist rules or difficulty
    if (!isMath) {
      rules = [];
    }
    const finalDifficulty = isMath ? String(parsed.difficulty || 'Medium') : '';

    // ── Post-process hint ─────────────────────────────────────────────────────
    let hint = String(parsed.hint || '').trim();
    if (isMath && hint.length === 0) {
      hint = fallbackHint(finalTopic, finalSubtopic, lang);
      degraded = true;
    }
    // Hint mode safety: if GPT returned empty answer (parse failure or refusal),
    // populate with the hint so the student always gets a useful response.
    if (hintMode && !String(parsed.answer || '').trim()) {
      parsed.answer = hint || fallbackHint(finalTopic, finalSubtopic, lang);
    }

    // ── Phase 1 DifficultyDetector (shadow) ──────────────────────────────────
    // Runs only on math questions. Writes verification_tier + verification_meta.
    // Wrapped in try/catch — detector failures must never break the response.
    let verificationFields: Record<string, unknown> = {};
    try {
      const detectorOn = (Deno.env.get('DIFFICULTY_DETECTOR_ENABLED') ?? 'true') !== 'false';
      if (detectorOn && isMath) {
        const features = detectorExtractFeatures(question, !!imageData);
        const { tier, reasons } = detectorClassify(features);
        const gptTier = detectorGptTier(finalDifficulty);
        verificationFields = {
          verification_tier:   tier,
          verification_status: 'shadow',
          verification_meta: {
            detector_version: DIFFICULTY_DETECTOR_VERSION,
            features,
            reasons,
            gpt_difficulty: finalDifficulty || null,
            gpt_tier: gptTier,
            agrees_with_gpt: gptTier === tier,
          },
        };
      }
    } catch (detectorErr) {
      console.log('[ai-tutor] detector-error', JSON.stringify({
        uid: user.id.slice(0, 8), msg: String(detectorErr),
      }));
    }

    // ── Taxonomy gate (v75): positive allowlist via canonical curriculum tree ─
    // - Non-math turns: topic="General", subtopic="" (never "Conversation" etc).
    // - Math turns: normalize topic via TOPIC_ALIASES; if not academic, reject.
    //   Subtopic must appear in subtopicsForCanonical(topic) — otherwise blank.
    //   Topics with no curated subtopic list accept the raw subtopic as-is.
    let safeInsertTopic    = finalTopic;
    let safeInsertSubtopic = finalSubtopic;
    if (!isMath) {
      safeInsertTopic    = 'General';
      safeInsertSubtopic = '';
    } else {
      const canonTopic = normalizeTopicCanonical(finalTopic);
      if (!isAcademicTopic(canonTopic)) {
        console.log('[ai-tutor] taxonomy-reject', JSON.stringify({
          uid: user.id.slice(0, 8), reason: 'non-academic',
          topic: finalTopic, subtopic: finalSubtopic,
        }));
        safeInsertTopic    = '';
        safeInsertSubtopic = '';
      } else {
        safeInsertTopic = canonTopic;
        const canonSub  = canonicalSubtopic(canonTopic, finalSubtopic);
        if (finalSubtopic && !canonSub) {
          console.log('[ai-tutor] taxonomy-reject', JSON.stringify({
            uid: user.id.slice(0, 8), reason: 'unknown-subtopic',
            topic: canonTopic, subtopic: finalSubtopic,
          }));
        }
        safeInsertSubtopic = canonSub;
      }
    }

    // ── Persist question_record (synchronous — record_id returned to client) ──
    // CAI-P1: include client_request_id; on 23505 (unique_violation) the winning
    // row was committed by a concurrent retry — re-SELECT and return it.
    const insertRes = await sbAdmin.from('question_records').insert({
      session_id:        resolvedSessionId,
      user_id:           user.id,
      question:          question,
      image:             imageData,
      ai_response:       String(parsed.answer || ''),
      topic:             safeInsertTopic,
      subtopic:          safeInsertSubtopic,
      difficulty:        finalDifficulty,
      concepts:          Array.isArray(parsed.concepts) ? parsed.concepts : [],
      rules:             rules,
      confidence_before: confidence,
      weakness_signal:   parsed.weakness_signal === true,
      help_request:      false,
      explanation_request: followUpType != null,
      repeated_question: false,
      hint:              hint,
      follow_up_type:    followUpType,
      client_request_id: clientRequestId,
      ...verificationFields,
    }).select('id').single();
    let newRecord = insertRes.data;
    let idempotencyRecovered = false;
    if (insertRes.error && insertRes.error.code === '23505' && clientRequestId) {
      console.log('[ai-tutor] 23505-conflict-recovery', JSON.stringify({
        uid: user.id.slice(0, 8), crid: clientRequestId,
      }));
      const { data: winner } = await sbAdmin.from('question_records')
        .select('id')
        .eq('user_id', user.id)
        .eq('client_request_id', clientRequestId)
        .maybeSingle();
      newRecord = winner ?? null;
      idempotencyRecovered = true;
    } else if (insertRes.error) {
      console.log('[ai-tutor] qr-insert-failed', JSON.stringify({
        uid: user.id.slice(0, 8), code: insertRes.error.code, msg: insertRes.error.message,
      }));
    }

    // ── Build response — returned to student immediately ──────────────────────
    const zeroAnswer  = parsed.answer || '';
    const recordId    = newRecord?.id ?? null;

    // Telemetry: question_regenerated fires on every new math record creation,
    // symmetric to question_retrieved on the repeat path. Lets us measure the
    // retrieval-vs-fresh ratio in logs.
    if (isMath && recordId) {
      console.log('[ai-tutor] question_regenerated', JSON.stringify({
        uid: user.id.slice(0, 8), record_id: recordId,
        topic: safeInsertTopic, subtopic: safeInsertSubtopic,
        had_image: !!imageData, q_chars: question.length,
      }));
    }
    const studentResponse = new Response(JSON.stringify({
      answer:          zeroAnswer,
      hint,
      topic:           finalTopic,
      subtopic:        finalSubtopic,
      difficulty:      finalDifficulty,
      concepts:        Array.isArray(parsed.concepts) ? parsed.concepts : [],
      rules,
      weakness_signal: parsed.weakness_signal === true,
      attention_marker: String(parsed.attention_marker || ''),
      session_id:      resolvedSessionId,
      record_id:       recordId,
      hint_mode:       hintMode,
      is_math:         isMath,
      version:         AI_TUTOR_VERSION,
      idempotency_recovered: idempotencyRecovered,
      degraded:        degraded,
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

    // ── L3 Shadow Pipeline (background — never blocks student response) ───────
    // Double gate: VERIFICATION_ENABLED=true AND VERIFICATION_SHADOW_ONLY=true.
    // Runs only on math questions that produced a persisted record.
    const verificationEnabled  = (Deno.env.get('VERIFICATION_ENABLED')   ?? 'false') === 'true';
    const verificationShadowOnly = (Deno.env.get('VERIFICATION_SHADOW_ONLY') ?? 'true')  !== 'false';
    if (verificationEnabled && verificationShadowOnly && isMath && recordId) {
      const pipelineStart = Date.now();
      const detectorMeta: Record<string, unknown> = {
        tier: verificationFields.verification_tier as string ?? null,
        ...((verificationFields.verification_meta as Record<string, unknown>) ?? {}),
      };
      const pipelineTask = runL3ShadowPipeline({
        sbAdmin,
        recordId,
        userId:       user.id,
        questionText: question,
        imageData,
        zeroAnswer,
        detectorMeta,
        startTime:    pipelineStart,
      }).catch(err => {
        console.log('[ai-tutor] l3-pipeline-error', JSON.stringify({
          uid: user.id.slice(0, 8), record_id: recordId,
          msg: err instanceof Error ? err.message : String(err),
        }));
      });
      const EdgeRt = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
      if (EdgeRt?.waitUntil) EdgeRt.waitUntil(pipelineTask);
    }

    return studentResponse;

  } catch (err) {
    console.error('ai-tutor error:', err);
    console.log('[ai-tutor] unhandled-error', JSON.stringify({
      msg: (err instanceof Error ? err.message : String(err)),
    }));
    return new Response(JSON.stringify({ error: String(err), version: AI_TUTOR_VERSION }), { status: 500 });
  }
});
