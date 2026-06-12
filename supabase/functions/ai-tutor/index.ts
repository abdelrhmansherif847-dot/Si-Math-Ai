// ai-tutor Edge Function v47
// Fixes: math intent classifier (no rules/difficulty on non-math), session column name (started_at -> created_at)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_KEY  = Deno.env.get('OPENAI_API_KEY')  ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')    ?? '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

// ── fallbackRules: topic-keyed educational rule dictionary ──────────────────
function fallbackRules(topic: string, subtopic: string): Array<{name:string;formula:string;desc:string}> {
  const t = (topic + ' ' + subtopic).toLowerCase();
  const map: Array<[string, Array<{name:string;formula:string;desc:string}>]> = [
    ['linear equation', [
      { name: 'Linear Equation Rule', formula: 'ax + b = c → x = (c - b) / a', desc: 'Isolate x by moving constants to the other side and dividing by the coefficient.' }
    ]],
    ['quadratic', [
      { name: 'Quadratic Formula', formula: 'x = (-b ± √(b²-4ac)) / 2a', desc: 'Use when factoring is not obvious. a, b, c are coefficients from ax²+bx+c=0.' },
      { name: 'Factoring Rule', formula: '(x + p)(x + q) = 0 → x = -p or x = -q', desc: 'Find two numbers that multiply to c and add to b.' }
    ]],
    ['system', [
      { name: 'Substitution Method', formula: 'Solve one equation for x, substitute into the other', desc: 'Express one variable in terms of the other to reduce to a single equation.' },
      { name: 'Elimination Method', formula: 'Add/subtract equations to cancel a variable', desc: 'Multiply equations so one variable cancels when added or subtracted.' }
    ]],
    ['percent', [
      { name: 'Percent Formula', formula: 'Percent = (Part / Whole) × 100', desc: 'Express a quantity as parts per hundred.' },
      { name: 'Percent Change', formula: 'Change% = ((New - Old) / Old) × 100', desc: 'Measures relative increase or decrease between two values.' }
    ]],
    ['ratio', [
      { name: 'Ratio Rule', formula: 'a : b = a/b', desc: 'A ratio compares two quantities. Convert to fractions to calculate.' }
    ]],
    ['probability', [
      { name: 'Probability Formula', formula: 'P(E) = Favorable Outcomes / Total Outcomes', desc: 'Always between 0 (impossible) and 1 (certain).' },
      { name: 'Complement Rule', formula: 'P(not E) = 1 - P(E)', desc: 'The probability that an event does NOT occur equals 1 minus its probability.' }
    ]],
    ['statistic', [
      { name: 'Mean Formula', formula: 'Mean = Σx / n', desc: 'Sum all values then divide by the count.' },
      { name: 'Median Rule', formula: 'Middle value when data is sorted', desc: 'For even count: average of two middle values.' }
    ]],
    ['circle', [
      { name: 'Circumference', formula: 'C = 2πr', desc: 'Distance around the circle.' },
      { name: 'Area of Circle', formula: 'A = πr²', desc: 'Space enclosed within the circle.' }
    ]],
    ['triangle', [
      { name: 'Triangle Angle Sum', formula: 'A + B + C = 180°', desc: 'The three interior angles of any triangle sum to 180 degrees.' },
      { name: 'Area of Triangle', formula: 'A = ½ × base × height', desc: 'Height must be perpendicular to the base.' },
      { name: 'Pythagorean Theorem', formula: 'a² + b² = c²', desc: 'Only for right triangles: c is the hypotenuse.' }
    ]],
    ['function', [
      { name: 'Function Notation', formula: 'f(x) = expression in x', desc: 'f(x) means "evaluate the expression at x". Replace x with the given value.' },
      { name: 'Domain & Range', formula: 'Domain: valid inputs; Range: valid outputs', desc: 'Domain restrictions include division by zero and even roots of negatives.' }
    ]],
    ['slope', [
      { name: 'Slope Formula', formula: 'm = (y₂ - y₁) / (x₂ - x₁)', desc: 'Measures steepness of a line. Positive = rises right; negative = falls right.' },
      { name: 'Slope-Intercept Form', formula: 'y = mx + b', desc: 'm is slope, b is y-intercept (where line crosses y-axis).' }
    ]],
    ['exponent', [
      { name: 'Product Rule', formula: 'aᵐ × aⁿ = aᵐ⁺ⁿ', desc: 'When multiplying same base, add exponents.' },
      { name: 'Power Rule', formula: '(aᵐ)ⁿ = aᵐⁿ', desc: 'When raising a power to a power, multiply exponents.' }
    ]],
    ['inequalit', [
      { name: 'Inequality Rule', formula: 'Flip sign when multiplying/dividing by negative', desc: 'ax > b → x < b/a when a is negative.' }
    ]],
    ['algebra', [
      { name: 'Distributive Property', formula: 'a(b + c) = ab + ac', desc: 'Multiply the term outside the parentheses by each term inside.' }
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
let _personalityCache: string | null = null;
let _personalityCachedAt = 0;
async function get_zero_personality(sb: ReturnType<typeof createClient>): Promise<string> {
  const now = Date.now();
  if (_personalityCache && now - _personalityCachedAt < 600_000) return _personalityCache;
  const { data } = await sb.from('zero_knowledge_entries')
    .select('body')
    .eq('slug', 'zero_personality')
    .limit(32);
  if (data && data.length > 0) {
    _personalityCache = data.map((r: {body:string}) => r.body).join('\n');
    _personalityCachedAt = now;
    return _personalityCache;
  }
  return '';
}

// ── Knowledge search ──────────────────────────────────────────────────────────
async function search_zero_knowledge(sb: ReturnType<typeof createClient>, query: string): Promise<string> {
  const { data } = await sb.rpc('search_zero_knowledge', { query, max_results: 5 });
  if (!data || data.length === 0) return '';
  return data.map((r: {title:string;body:string;category_name:string;subcategory_name:string}) =>
    `[${r.category_name} > ${r.subcategory_name}] ${r.title}: ${r.body}`
  ).join('\n');
}

const HINT_MODE_OVERRIDE = `
CRITICAL OVERRIDE — HINT MODE ACTIVE:
Your answer must contain ONLY: one Socratic hint (1–2 sentences) that guides the student toward the answer, followed by one guiding question.
MUST NOT contain: the final numerical answer, step-by-step labels (Step 1/2/3), completed calculations, or any full solution.
End your hint with: "What do you think the next step is?"
`;

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
    const messages:    Array<{role:string;content:string}> = Array.isArray(body.messages) ? body.messages : [];
    const topic:       string  = body.topic || '';
    const subtopic:    string  = body.subtopic || '';
    const lang:        string  = /[؀-ۿ]/.test(question) ? 'ar' : 'en';

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
      if (sessErr) console.error('chat_sessions insert failed:', sessErr);
      resolvedSessionId = sess?.id ?? null;
    } else {
      // Touch last_message_at on existing session
      await sbAdmin.from('chat_sessions')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', resolvedSessionId);
    }

    // ── Context retrieval ─────────────────────────────────────────────────────
    const [personality, knowledge] = await Promise.all([
      get_zero_personality(sbAdmin),
      search_zero_knowledge(sbAdmin, question + ' ' + topic + ' ' + subtopic),
    ]);

    // ── Profile fetch ─────────────────────────────────────────────────────────
    const { data: profile } = await sbAdmin.from('profiles').select('name, exam_type, exam_date, language').eq('id', user.id).single();
    const studentName = profile?.name || 'Student';
    const examType    = profile?.exam_type || 'SAT';

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
- Time: 60 minutes
- Questions: 60 multiple-choice questions
- Format: digital on computer
- Calculator: allowed
- Pace: exactly 1 minute per question — tightest of all three exams

⚠️ CRITICAL: If you state any exam timing, question count, or format that contradicts the above, you are wrong. Always return one of the exact values above. Never say "SAT has 20 questions in no-calculator section" or "EST Math 1 is 60 minutes" — those are wrong.
`;

    let systemPrompt = `You are Zero, an elite math tutor AI for ${examType} exam preparation.
Student name: ${studentName}
Language: ${lang === 'ar' ? 'Arabic (respond in Arabic)' : 'English'}

${EXAM_FACTS}
${personality ? `## Zero Personality\n${personality}\n` : ''}
${knowledge ? `## Relevant Knowledge\n${knowledge}\n` : ''}

## Response Format
You MUST respond with valid JSON only. No markdown fences. No extra text.
{
  "answer": "your explanation in markdown",
  "hint": "one Socratic hint (1-2 sentences, no full solution)",
  "topic": "detected math topic",
  "subtopic": "specific subtopic",
  "difficulty": "Easy|Medium|Hard",
  "concepts": ["concept1", "concept2"],
  "rules": [{"name":"Rule Name","formula":"formula","desc":"short explanation"}],
  "weakness_signal": false,
  "attention_marker": "key concept or common mistake to highlight"
}

## Rules for Rules field
Always include at least 1-2 rules for math questions. Rules must have: name (rule name), formula (mathematical formula or statement), desc (1-sentence explanation).

## Attention Markers
ALWAYS include attention_marker for math questions. Common examples: "Watch sign changes", "Don't forget to distribute", "Check both solutions".
`;

    if (hintMode) {
      systemPrompt = HINT_MODE_OVERRIDE + '\n' + systemPrompt;
    }

    // ── OpenAI call ───────────────────────────────────────────────────────────
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-10),
      { role: 'user', content: question },
    ];

    const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: openaiMessages,
        response_format: { type: 'json_object' },
        max_tokens: 1200,
        temperature: 0.4,
      }),
    });

    const oaiData = await oaiRes.json();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(oaiData.choices?.[0]?.message?.content || '{}');
    } catch {
      parsed = {};
    }

    // ── Post-process rules + difficulty (math-intent classifier) ─────────────
    const finalTopic    = String(parsed.topic || topic || '');
    const finalSubtopic = String(parsed.subtopic || subtopic || '');
    const isMath = isMathTopic(finalTopic, finalSubtopic);

    let rules = normalizeRules(parsed.rules);
    if (isMath && rules.length === 0) {
      const fb = fallbackRules(finalTopic, finalSubtopic);
      if (fb.length > 0) rules = fb;
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
    }

    // ── Persist question_record (synchronous — record_id returned to client) ──
    const { data: newRecord } = await sbAdmin.from('question_records').insert({
      session_id:        resolvedSessionId,
      user_id:           user.id,
      question:          question,
      ai_response:       String(parsed.answer || ''),
      topic:             finalTopic,
      subtopic:          finalSubtopic,
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
    }).select('id').single();

    // ── Build response ────────────────────────────────────────────────────────
    return new Response(JSON.stringify({
      answer:          parsed.answer || '',
      hint,
      topic:           finalTopic,
      subtopic:        finalSubtopic,
      difficulty:      finalDifficulty,
      concepts:        Array.isArray(parsed.concepts) ? parsed.concepts : [],
      rules,
      weakness_signal: parsed.weakness_signal === true,
      attention_marker: String(parsed.attention_marker || ''),
      session_id:      resolvedSessionId,
      record_id:       newRecord?.id ?? null,
      hint_mode:       hintMode,
      is_math:         isMath,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    console.error('ai-tutor error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
