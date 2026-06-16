// ai-tutor Edge Function v65
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
const AI_TUTOR_VERSION = 'v65';

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
    // Use language_preference from profile; fall back to question script detection.
    // For image-only questions (empty text), default to 'ar' since this platform targets Arabic-speaking students.
    const langPref = profile?.language_preference || null;
    const lang: string = langPref === 'en' ? 'en'
      : langPref === 'ar' ? 'ar'
      : /[؀-ۿ]/.test(question) ? 'ar'
      : (imageData && !question.trim()) ? 'ar'
      : 'en';

    // Days until exam (used by Zero for personalised responses)
    let daysUntilExam: number | null = null;
    if (examDateRaw) {
      const today   = new Date(); today.setHours(0,0,0,0);
      const examDay = new Date(examDateRaw); examDay.setHours(0,0,0,0);
      daysUntilExam = Math.ceil((examDay.getTime() - today.getTime()) / 86_400_000);
    }

    // ── Context retrieval ─────────────────────────────────────────────────────
    const [personalityRaw, knowledge] = await Promise.all([
      get_zero_personality(sbAdmin),
      search_zero_knowledge(sbAdmin, question + ' ' + topic + ' ' + subtopic),
    ]);
    // Always have a personality even if the DB table is empty
    const DEFAULT_PERSONALITY = `## Zero's Core Identity
You are Zero — not a chatbot, not a template engine. You are the student's personal math coach and the coolest older sibling who happens to be amazing at math. You genuinely care whether they pass this exam.

## Name Usage (CRITICAL)
- ALWAYS use the student's actual first name: ${studentName}
- NEVER say "يا Student" or "Dear Student" or any placeholder — the name is right there
- Weave the name naturally: "يا ${studentName}, فكر معايا..." / "Good catch, ${studentName}!"
- If you don't address them by name for 2+ messages in a row, use it in the next one

## Tone & Style
- Warm, direct, occasionally funny — like a smart friend, not a formal tutor
- In Arabic: Egyptian dialect mixed with English math terms naturally (e.g. "الـ equation دي...", "solve الـ x")
- In English: casual but focused — "Let's break this down" not "We shall proceed to analyze"
- Use encouragement that feels REAL: "والله ده تفكير ممتاز!" / "That's exactly the right instinct!"
- When confused: "مفيش مشكلة خالص، ده normal — خطوة خطوة 😊" / "Totally normal to find this tricky — let's slow down"
- Celebrate progress explicitly: mention what they got right before addressing what's wrong

## Anti-Robotic Rules
- NEVER start a response with a list of bullet points for a casual message
- NEVER say "Certainly!" / "Of course!" / "Great question!" — these are bot phrases
- NEVER ignore the student's emotional state if they express stress or frustration
- ALWAYS respond to "فاضل قد ايه؟" with the actual days count from the profile + a motivating comment
- ALWAYS respond to "مبسوط/حاسس بـ/خايف من" with empathy first, strategy second`;
    const personality = personalityRaw || DEFAULT_PERSONALITY;

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
| ACT Math | 60 Q / 60 min | 1–10 · 11–20 · 21–30 · 31–40 · 41–50 · 51–60 |

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
Language: ${lang === 'ar' ? 'Arabic — respond entirely in Arabic, warm Egyptian dialect welcome for greetings/chitchat' : 'English'}

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
- When is_math = false: set topic="General", subtopic="Conversation", difficulty="", rules=[], concepts=[], weakness_signal=false
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
Language: ${lang === 'ar' ? 'Arabic — warm Egyptian dialect welcome' : 'English'}

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

    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-10),
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

    // ── Persist question_record (synchronous — record_id returned to client) ──
    // CAI-P1: include client_request_id; on 23505 (unique_violation) the winning
    // row was committed by a concurrent retry — re-SELECT and return it.
    const insertRes = await sbAdmin.from('question_records').insert({
      session_id:        resolvedSessionId,
      user_id:           user.id,
      question:          question,
      image:             imageData,
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
      client_request_id: clientRequestId,
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
      version:         AI_TUTOR_VERSION,
      idempotency_recovered: idempotencyRecovered,
      degraded:        degraded,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    console.error('ai-tutor error:', err);
    console.log('[ai-tutor] unhandled-error', JSON.stringify({
      msg: (err instanceof Error ? err.message : String(err)),
    }));
    return new Response(JSON.stringify({ error: String(err), version: AI_TUTOR_VERSION }), { status: 500 });
  }
});
