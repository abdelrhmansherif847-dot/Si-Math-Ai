/* learn-data.mjs — the SINGLE AUTHORED SOURCE for the Educational Knowledge Hub.
 *
 * learn.html and every learn-*.html page are GENERATED from this file by
 * scripts/build-learn.mjs. Never hand-edit the generated pages.
 *
 *   node scripts/build-learn.mjs            # write the hub + all guides
 *   node scripts/build-learn.mjs --check    # fail if any page is out of date
 *
 * ── EDITORIAL RULES ────────────────────────────────────────────────────────
 * These pages exist to TEACH, not to advertise. A student who never signs up
 * should still leave better prepared. That is the whole strategy: trust before
 * conversion. Concretely:
 *
 *   1. No selling inside the body. Each guide gets exactly one restrained
 *      `softCta` line at the end, and nothing else.
 *   2. No invented statistics — no "students improve by X points", no score
 *      averages, no success rates. See knowledge-base.md §12.
 *   3. NO UNVERIFIED EXAM FORMAT SPECIFICS. Question counts, section timings,
 *      and calculator policies are set by the examination boards and change
 *      (the SAT moved to a digital adaptive format; the ACT has been revised; EST
 *      format details are set by its own administrators and change too).
 *      Content here teaches METHOD — strategy, error patterns, psychology,
 *      pacing principles — which does not go stale. Where a format detail is
 *      genuinely needed, express it as a principle ("budget your time by
 *      section length") rather than a number, and rely on the standing verify
 *      note that build-learn.mjs adds to every exam guide.
 *      See consistency-audit.md C-13.
 *   4. Teach the mistake, not just the fix. The catalogue of errors students
 *      actually make is where educational expertise is visible.
 *
 * Body HTML may use: <p> <h3> <ul> <ol> <li> <strong> <em> <a>.
 */

/** Groups render as sections on the hub index, in this order. */
export const GROUPS = [
  {
    id: 'exams',
    title: 'Exam guides',
    sub: 'What each examination asks of you, and how to prepare for it specifically.',
  },
  {
    id: 'method',
    title: 'Study method',
    sub: 'How to practise so that practice actually raises a score.',
  },
  {
    id: 'mindset',
    title: 'Mindset & performance',
    sub: 'The part of exam performance that is not mathematics.',
  },
  {
    id: 'guidance',
    title: 'For parents & planning',
    sub: 'Supporting a student, and understanding how scores are used.',
  },
];

export const GUIDES = [
  /* ═══════════════════════════════════════════════════════════════════════
     EXAM GUIDES
     ═══════════════════════════════════════════════════════════════════════ */
  {
    slug: 'sat-math',
    group: 'exams',
    topic: 'SAT',
    icon: '📘',
    examGuide: true,
    title: 'How to Prepare for SAT Math',
    metaTitle: 'How to Prepare for SAT Math — A Complete Study Guide',
    metaDescription:
      'A practical guide to preparing for SAT Mathematics: how to build a baseline, which content areas to weight, the three types of error that cost marks, and how to structure a preparation timeline.',
    summary: 'Building a baseline, weighting the content areas, and the three error types that decide an SAT Math score.',
    lead: 'Most SAT Math preparation fails in the same way: the student practises broadly, feels busy, and plateaus. The fix is not more questions. It is knowing which specific skills are costing marks, and working on those.',
    teaches: ['SAT Mathematics preparation', 'Exam strategy', 'Diagnostic practice'],
    takeaways: [
      'Start with a full, timed baseline — a plan built without one is guesswork.',
      'Sort every error into content, process or careless. The three need different fixes.',
      'Weight your practice by where marks are actually lost, not by what feels hard.',
      'Practise under real timing early, not only in the final weeks.',
      'Re-test after fixing something. A weakness is not closed until later evidence says so.',
    ],
    sections: [
      {
        h: 'What SAT Math actually tests',
        body: `<p>SAT Mathematics is less about advanced content than most students expect. The material sits largely within a standard secondary syllabus — linear relationships, functions and advanced algebra, data and problem solving, and geometry with some trigonometry. Very little of it is unfamiliar.</p>
<p>What the exam actually tests is <strong>reliability under constraint</strong>: whether you can execute familiar mathematics accurately, quickly, and under pressure, while reading carefully enough not to answer a slightly different question from the one asked.</p>
<p>That distinction matters enormously for how you prepare. A student who believes their problem is content will go back and re-learn quadratics. A student who has actually diagnosed their errors often discovers that they understand quadratics perfectly well and are losing marks to sign handling and misread questions. Those need completely different work.</p>`,
      },
      {
        h: 'Build a baseline before you build a plan',
        body: `<p>Before deciding what to study, sit a full, properly timed practice section. Not a casual set of questions — a real one, in one sitting, without pausing, without checking answers as you go.</p>
<p>It will be uncomfortable, and that is the point. You are not measuring your knowledge; you are measuring your performance, which is a different and more useful quantity. A baseline gives you three things a syllabus cannot:</p>
<ul>
<li><strong>Where marks are actually lost</strong>, by topic and by question position.</li>
<li><strong>How your accuracy changes under time pressure</strong> — many students are reliable at question 5 and unreliable at question 25 for reasons that have nothing to do with difficulty.</li>
<li><strong>A number to improve against.</strong> Without a starting measurement you cannot tell whether six weeks of work did anything.</li>
</ul>
<p>Sit another full section every few weeks. Between them, work on what the last one revealed.</p>`,
      },
      {
        h: 'The three error types — and why they need different fixes',
        body: `<p>This is the single most useful habit in exam preparation. After every practice set, sort each wrong answer into exactly one of three categories.</p>
<h3>1. Content errors</h3>
<p>You did not know the mathematics, or knew it incompletely. You could not have got it right with more time or more care.</p>
<p><em>Fix:</em> learn the concept properly, then drill it until it is automatic. This is the only error type where "study the topic" is the right response.</p>
<h3>2. Process errors</h3>
<p>You knew the mathematics but chose an inefficient or wrong route: you set up the equation incorrectly, translated the word problem badly, or took a long path when a short one existed.</p>
<p><em>Fix:</em> study worked solutions for the <strong>approach</strong>, not the answer. Ask why the efficient method was available, and what in the question signalled it.</p>
<h3>3. Careless errors</h3>
<p>You knew it, chose correctly, and still got it wrong — a dropped sign, a transcription slip, solving for <em>x</em> when the question asked for <em>2x</em>.</p>
<p><em>Fix:</em> not more content work. Careless errors respond to process changes: writing intermediate steps rather than doing them mentally, circling what the question asks for before solving, and a deliberate final check that you answered the actual question.</p>
<p>Students who skip this classification almost always over-invest in content and under-invest in the other two, because content feels like real studying. For many students at a mid-to-high score, careless and process errors are the larger share of lost marks.</p>`,
      },
      {
        h: 'Weight your practice by impact, not by discomfort',
        body: `<p>The topics that feel hardest are frequently not the ones costing you the most marks. A skill you find unpleasant but that appears rarely is worth less attention than a skill you find tolerable but get wrong a third of the time on questions that appear constantly.</p>
<p>Rank your weak areas by <strong>frequency on the exam × your failure rate</strong>, and work down that list. This single reordering is often worth more than any additional study hours, because it changes where the hours go.</p>
<p>It also protects against the most comfortable failure mode in preparation: practising what you are already good at. Doing thirty questions on a topic you have mastered feels productive and moves nothing.</p>`,
      },
      {
        h: 'Practise the exam, not just the mathematics',
        body: `<p>Answering questions correctly with unlimited time is a different skill from answering them correctly in the time available. Both matter, and the second is trained separately.</p>
<ul>
<li><strong>Time your practice from early on.</strong> Leaving timed work until the final fortnight means discovering pacing problems too late to fix them.</li>
<li><strong>Practise the skip decision.</strong> Knowing when to abandon a question and move on is a skill. Spending four minutes on one question to protect three marks elsewhere is a bad trade you can train yourself out of.</li>
<li><strong>Simulate the whole section.</strong> Fatigue is real, and errors cluster late. You cannot see that in ten-question sets.</li>
<li><strong>Confirm the current format before test day.</strong> Structure, timing and calculator policy are set by the board and do change.</li>
</ul>`,
      },
      {
        h: 'A realistic timeline',
        body: `<p>There is no single correct schedule, but the shape is consistent:</p>
<ul>
<li><strong>Early phase</strong> — baseline, then content repair on genuine gaps. This is where "learning the topic" belongs.</li>
<li><strong>Middle phase</strong> — targeted practice on ranked weaknesses, mixed rather than blocked by topic, with regular timed sections to keep pacing honest.</li>
<li><strong>Late phase</strong> — full timed sections, error-log review, and process fixes for careless mistakes. Content work at this stage has low return unless a genuine gap remains.</li>
</ul>
<p>Consistency beats intensity throughout. Short daily sessions produce more durable recall than occasional long ones, and they keep the diagnostic picture current. See <a href="learn-study-strategies.html">study strategies</a> for why this is true rather than merely encouraging.</p>`,
      },
    ],
    faqs: [
      {
        q: 'How long should I prepare for SAT Math?',
        a: '<p>It depends entirely on the gap between where you are and where you want to be, which is why a baseline comes first. A student closing a small gap in specific skills may need weeks; a student rebuilding foundations needs months. What is consistent is that spread-out preparation outperforms compressed preparation for the same total hours.</p>',
      },
      {
        q: 'Should I memorise formulas for SAT Math?',
        a: '<p>Know the common ones well enough that recall is instant, because hesitation costs time. But memorisation is not the bottleneck for most students — recognising which tool a question calls for is. A student who knows every formula and cannot tell which applies will still lose marks.</p>',
      },
      {
        q: 'Why has my SAT Math score stopped improving?',
        a: '<p>Usually one of three reasons: you are practising broadly rather than against a diagnosis, you are practising what you already know because it is comfortable, or your remaining errors are careless and process errors that content study does not touch. See <a href="learn-score-improvement.html">how to improve a math score</a>.</p>',
      },
      {
        q: 'Is it worth reviewing questions I got right?',
        a: '<p>Yes, selectively — specifically the ones you got right slowly, or by a long route, or by guessing. A correct answer reached inefficiently is a pacing problem waiting to appear under pressure, and a lucky guess is a weakness the score did not reveal.</p>',
      },
    ],
    softCta:
      'Si Math AI automates the error classification described above: every attempt is recorded against a specific skill, and weaknesses are ranked by impact on your score rather than by how hard they felt.',
  },

  {
    slug: 'act-math',
    group: 'exams',
    topic: 'ACT',
    icon: '⏱️',
    examGuide: true,
    title: 'How to Prepare for ACT Math',
    metaTitle: 'How to Prepare for ACT Math — Pacing, Triage and Content Breadth',
    metaDescription:
      'A practical guide to ACT Mathematics preparation: why pacing is the dominant constraint, how to triage questions, handling the breadth of content, and training speed without losing accuracy.',
    summary: 'Why pacing dominates on the ACT, how to triage, and how to train speed without trading away accuracy.',
    lead: 'ACT Mathematics rewards a different profile from the SAT. The content is broad but rarely deep, and the binding constraint for most students is not difficulty — it is time.',
    teaches: ['ACT Mathematics preparation', 'Exam pacing', 'Question triage'],
    takeaways: [
      'Pacing is usually the limiting factor, not content difficulty.',
      'Learn to triage: solve, defer, or abandon — decided in seconds, not minutes.',
      'The content range is wide, so gaps hide in corners you rarely practise.',
      'Train speed and accuracy together; speed alone just produces faster mistakes.',
      'Never leave a blank where there is no penalty for a wrong answer.',
    ],
    sections: [
      {
        h: 'The ACT rewards speed and breadth',
        body: `<p>Comparing the exams in one line: the SAT tends to test fewer ideas more deeply, the EST sits close to the SAT in shape, and the ACT tends to test more ideas more quickly. Neither is harder in the abstract — they suit different students, which is the entire basis for <a href="learn-choosing-your-exam.html">choosing between them</a>.</p>
<p>For ACT Mathematics, this has two direct consequences. First, your <strong>average time per question is short</strong>, so efficiency is a scored skill rather than a nicety. Second, the <strong>content range is wide</strong> — including topics that appear rarely enough that students never get around to practising them, and then meet them cold on test day.</p>`,
      },
      {
        h: 'Triage: the most valuable ACT skill',
        body: `<p>Under tight timing, the decision of <em>which</em> questions to spend time on is worth more than raw ability on any single question. Train an explicit triage habit: within a few seconds of reading a question, place it in one of three buckets.</p>
<ul>
<li><strong>Solve now</strong> — you recognise the route immediately. Do it and move.</li>
<li><strong>Defer</strong> — you can do it, but it will take a while. Mark it, move on, return if time allows.</li>
<li><strong>Abandon</strong> — you do not see a route. Make your best answer choice and move on without hesitation.</li>
</ul>
<p>The failure mode this prevents is the single most expensive habit in timed mathematics: sinking four minutes into one hard question and running out of time on three easy ones later in the section. All questions are worth the same. Spending disproportionate time on a hard one is a bad trade regardless of whether you eventually solve it.</p>
<p>Triage feels wrong at first because abandoning a solvable question feels like giving up. It is not — it is protecting marks elsewhere. Practise it deliberately until the decision is automatic.</p>`,
      },
      {
        h: 'The two-pass approach',
        body: `<p>A practical implementation of triage: work the section in two passes.</p>
<p><strong>First pass</strong> — move through from the start, answering everything you can do confidently and quickly. Mark anything deferred. Do not linger anywhere.</p>
<p><strong>Second pass</strong> — return to the marked questions with whatever time remains, working in order of how close you felt to a route.</p>
<p>This guarantees you have seen every question in the section. The alternative — grinding strictly in order — risks never reaching questions at the end that you could have answered in thirty seconds.</p>`,
      },
      {
        h: 'Cover the corners',
        body: `<p>Because ACT Mathematics ranges widely, the gaps that cost marks are often not in the major topics you practise constantly. They hide in the corners: a less common geometry relationship, a trigonometric identity, a probability or counting setup, a sequence, a matrix or logarithm question that appears infrequently enough to feel unfamiliar.</p>
<p>A student who practises only the high-frequency material can plateau simply because the same handful of unpractised corners keep appearing. Audit your coverage deliberately: list the topics in scope, mark the ones you have genuinely practised recently, and work the unmarked ones. Rare topics deserve proportionate — not zero — attention.</p>`,
      },
      {
        h: 'Training speed without buying it with accuracy',
        body: `<p>The obvious way to get faster is to rush, and it does not work — it converts slow correct answers into fast wrong ones. Real speed comes from three places:</p>
<ul>
<li><strong>Automaticity.</strong> Fluency in routine manipulation frees attention for the actual problem. This comes from repetition of fundamentals, not from hurrying.</li>
<li><strong>Route selection.</strong> Frequently there is a short path — testing answer choices, using a value, recognising a structure — and the time saved comes from choosing it, not from executing faster.</li>
<li><strong>Not re-reading.</strong> Much lost time is spent reading a question two or three times. Reading once, carefully, is faster than reading three times quickly.</li>
</ul>
<p>Practise with a per-question target rather than only a total section time. It makes pacing failures visible while you can still fix them.</p>`,
      },
      {
        h: 'Answer everything',
        body: `<p>Where an exam applies no penalty for a wrong answer — which is the standard arrangement on these tests — a blank and a wrong answer score identically, so a blank is strictly worse. Never leave one.</p>
<p>Build the habit into your pacing: reserve a few seconds at the end to fill anything unanswered. If you can eliminate even one option first, a guess is better than a coin flip.</p>`,
      },
    ],
    faqs: [
      {
        q: 'Is ACT Math harder than SAT Math?',
        a: '<p>Neither is harder in general — they are differently shaped. The ACT tends to test a wider range of content at a faster pace; the SAT tends to test fewer ideas with more layered reasoning. Students who are fluent and quick often prefer the ACT; students who prefer time to think through a problem often prefer the SAT.</p>',
      },
      {
        q: 'How do I stop running out of time on ACT Math?',
        a: '<p>Almost always by triaging rather than by rushing. Most students who run out of time did not work too slowly overall — they spent too long on a small number of hard questions. Practise the two-pass approach and the abandon decision until both are automatic.</p>',
      },
      {
        q: 'Should I guess on ACT Math?',
        a: '<p>Yes, on anything you cannot answer, since there is no penalty for a wrong answer on these exams. Eliminate what you can first, then choose. Leaving a blank forfeits a chance at the mark for nothing.</p>',
      },
      {
        q: 'How much of ACT Math is geometry and trigonometry?',
        a: '<p>Enough that neglecting them is costly, and the exact weighting is set by the board and can change — confirm current content proportions from the official source. What is stable is the advice: audit your coverage across the full content range rather than assuming the topics you practise most are the ones being tested most.</p>',
      },
    ],
    softCta:
      'Si Math AI generates timed practice from your own weak skills and runs full mock exams, so pacing problems surface in practice rather than on test day.',
  },

  {
    slug: 'est-math',
    group: 'exams',
    topic: 'EST',
    icon: '🇪🇬',
    examGuide: true,
    title: 'How to Prepare for EST Math',
    metaTitle: 'How to Prepare for EST Math — A Guide for American Diploma Students',
    metaDescription:
      'A guide to EST Mathematics preparation for American Diploma students in Egypt: what the EST is, how preparation overlaps with the SAT, and how to study effectively for it.',
    summary: 'What the EST is, how preparation overlaps with the SAT, and how to prepare for it specifically.',
    lead: 'The EST matters enormously to American Diploma students in Egypt, and is served by far less preparation material than the SAT or ACT. That gap is not a reflection of the exam\'s importance.',
    teaches: ['EST Mathematics preparation', 'American Diploma pathway', 'Exam strategy'],
    takeaways: [
      'The EST is a standardised admission examination used in the Egyptian context; treat it as seriously as any other admission test.',
      'Preparation overlaps substantially with SAT Mathematics — the underlying skills are largely shared.',
      'Scarce official material makes disciplined self-diagnosis more important, not less.',
      'Confirm current structure, timing and calculator policy from the official source.',
      'Language flexibility genuinely helps: understand the mathematics in whichever language you reason in.',
    ],
    sections: [
      {
        h: 'What the EST is, and why it matters here',
        body: `<p>The EST (Egyptian Scholastic Test) is a standardised admission examination used within the Egyptian educational context, and for a great many American Diploma students it is the examination that most directly affects university admission at home.</p>
<p>Despite that, it receives a fraction of the preparation attention that the SAT and ACT receive internationally, simply because the global preparation industry is not oriented around it. Students frequently find themselves preparing for a consequential exam with thin material and second-hand advice.</p>
<p>The practical implication: you will need to be more self-directed. Where an SAT student can lean on an enormous body of published material, an EST student benefits disproportionately from a disciplined personal process — baseline, error classification, targeted practice, re-test.</p>`,
      },
      {
        h: 'The overlap with SAT Mathematics',
        body: `<p>The good news is that the underlying mathematics is largely shared. Algebra and linear relationships, functions, geometry and measurement, data interpretation, ratio and probability — these are the same skills tested in different clothes.</p>
<p>This means two things:</p>
<ul>
<li><strong>SAT-oriented material is useful practice</strong> for EST content, even where question style and format differ. Skill-level practice transfers well.</li>
<li><strong>Format familiarity does not transfer,</strong> and must be built separately. Knowing the mathematics is not the same as knowing how this particular exam asks about it, how it is timed, or how it is scored.</li>
</ul>
<p>Use broad material for skill building; use official or format-faithful material for exam familiarity. Do not confuse the two.</p>`,
      },
      {
        h: 'Preparing without abundant material',
        body: `<p>When practice material is limited, waste becomes expensive. Two habits matter more than usual:</p>
<h3>Extract more from every question</h3>
<p>A student with unlimited questions can afford to answer and move on. With limited material, each question should yield more: classify the error, identify the skill behind it, note the approach you should have taken, and return to it later. One question studied properly is worth more than five answered casually.</p>
<h3>Keep an error log</h3>
<p>Write down every mistake, the skill it belongs to, and why it happened. Reviewing that log weekly reveals patterns that no single practice session shows — and it is entirely free, which matters when material is not.</p>`,
      },
      {
        h: 'The language question',
        body: `<p>Many American Diploma students in Egypt reason most naturally in Arabic, or in Franco, while sitting an examination written in English. That is not a weakness, but it does add a step: reading a question in one language and thinking about it in another consumes working memory that would otherwise go to the mathematics.</p>
<p>Two things help. First, <strong>learn the mathematics in whichever language you actually think in</strong> — comprehension is the goal, and forcing yourself to learn a new concept in a second language slows understanding for no benefit. Second, <strong>practise reading questions in English</strong> so that the exam's phrasing is familiar even when your reasoning happens elsewhere. Separating those two needs is more effective than trying to do everything in one language.</p>`,
      },
      {
        h: 'Build format familiarity deliberately',
        body: `<p>Whatever the current structure of the exam, treat familiarity with it as a separate objective from mathematical skill:</p>
<ul>
<li>Sit at least one full, timed practice under realistic conditions before test day — ideally several.</li>
<li>Know in advance how long you have per section and what your pacing checkpoints are.</li>
<li>Know the calculator policy for each part of the exam, and practise accordingly.</li>
<li>Know how the exam is scored, so you can decide correctly whether to guess.</li>
</ul>
<p>Confirm all of these from the official source rather than from a forum, a tutor's recollection, or an older student's experience. Exam formats change, and out-of-date information about a consequential exam is worse than none.</p>`,
      },
    ],
    faqs: [
      {
        q: 'Is EST Math similar to SAT Math?',
        a: '<p>The underlying mathematical skills overlap substantially — algebra, functions, geometry, data and probability. Question style, structure, timing and scoring are the exam\'s own, so use broad material for skill building and format-faithful material for exam familiarity.</p>',
      },
      {
        q: 'Can I prepare for the EST and the SAT at the same time?',
        a: '<p>Yes, and many students do, because the skill work largely serves both. Keep the format practice separate: alternating skill sessions with exam-specific timed practice for whichever exam is next works better than trying to blend them.</p>',
      },
      {
        q: 'Where should I check the current EST format?',
        a: '<p>Always the official source for the examination. Structure, timing and calculator policy are set by the administering body and can change; second-hand descriptions go out of date quickly and are a common source of avoidable surprises on test day.</p>',
      },
      {
        q: 'Does studying mathematics in Arabic hurt my English exam performance?',
        a: '<p>No — understanding the mathematics is the harder half, and doing that in the language you reason in is more efficient. Pair it with deliberate practice reading questions in English so the exam\'s phrasing is familiar. Treat comprehension and exam-language familiarity as two separate objectives.</p>',
      },
    ],
    softCta:
      'Si Math AI covers EST Mathematics at the same depth as the SAT and ACT, and explains in English, Arabic or Franco — which is part of why it was built here.',
  },

  {
    slug: 'choosing-your-exam',
    group: 'exams',
    topic: 'Planning',
    icon: '🧭',
    examGuide: true,
    title: 'SAT vs ACT vs EST: Choosing Your Exam',
    metaTitle: 'SAT vs ACT vs EST — How to Choose Which Exam to Take',
    metaDescription:
      'How to decide between the SAT, ACT and EST: what genuinely differs between them, which student profile suits each, and how to make the decision with evidence rather than reputation.',
    summary: 'What genuinely differs between the three exams, and how to decide with evidence rather than hearsay.',
    lead: 'Choose the exam that fits how you work — but choose it from evidence, not from reputation. The most reliable method takes one afternoon.',
    teaches: ['Choosing a standardised examination', 'SAT vs ACT vs EST comparison', 'Admission planning'],
    takeaways: [
      'Start from where you are applying — that constrains the choice before preference does.',
      'The SAT tends to reward depth of reasoning; the ACT tends to reward speed and breadth; the EST sits closest to the SAT in shape.',
      'The EST is the exam most directly relevant to Egyptian university admission for many students.',
      'Sit a timed section of each and compare. Two afternoons beats months of speculation.',
      'Choose one and commit. Splitting preparation across two exams usually costs more than it gains.',
    ],
    sections: [
      {
        h: 'Start with where you are applying',
        body: `<p>Preference matters less than requirement. Before comparing exam styles, find out what the institutions you are actually considering accept and expect. Requirements vary by country, by university and sometimes by faculty, and they change.</p>
<p>For many American Diploma students in Egypt, this immediately narrows the field: if your primary applications are to Egyptian universities, the EST is likely central to your plans regardless of how you feel about its style. If you are applying abroad, the SAT or ACT is likely relevant, and many institutions accept either without preference.</p>
<p>Confirm requirements directly with each institution rather than relying on general advice — including this page. Admission policy is the one area where second-hand information is most often out of date.</p>`,
      },
      {
        h: 'What genuinely differs',
        body: `<p>Setting aside the details of format, which change, the durable differences in <em>character</em> are these:</p>
<h3>The SAT</h3>
<p>Tends to test a narrower set of ideas with more layered reasoning. Questions more often require unpacking — reading carefully, translating a situation into mathematics, and working through more than one step. Students who like time to think generally find it more comfortable.</p>
<h3>The ACT</h3>
<p>Tends to test a wider range of content at a faster pace, with questions that are more often direct. Fluency and speed are rewarded; deep reasoning on any single question is less often required. Students who are quick and confident across many topics generally find it more comfortable.</p>
<h3>The EST</h3>
<p>Occupies its own position, oriented to the Egyptian admission context. For many American Diploma students it is the most consequential of the three, and preparation overlaps substantially with SAT skills — see the <a href="learn-est-math.html">EST guide</a>.</p>
<p>Notice that none of this is about difficulty. They are differently shaped, and the right question is which shape fits you.</p>`,
      },
      {
        h: 'The one-afternoon decision method',
        body: `<p>Students spend months speculating about which exam suits them. There is a far better method, and it takes two afternoons.</p>
<ol>
<li><strong>Sit a timed mathematics section of one exam</strong> under realistic conditions. Score it.</li>
<li><strong>Sit a timed section of the other</strong> on a different day, in the same conditions. Score it.</li>
<li><strong>Compare more than the scores.</strong> Where did you run out of time? Which felt like it was testing something you could improve? Where were your errors careless rather than content-based?</li>
</ol>
<p>Direct evidence about your own performance beats any general description — including the descriptions on this page. A student who "should" prefer the SAT by temperament sometimes performs markedly better on the ACT, and only a timed comparison reveals it.</p>
<p>If the scores are close, weight the decision toward the exam where your errors look most fixable. A score limited by pacing is often easier to move than one limited by content gaps.</p>`,
      },
      {
        h: 'Then commit',
        body: `<p>Once you have chosen, commit. Preparing seriously for two exams at once usually costs more than it gains: skill work transfers between them, but format familiarity, pacing instincts and strategy do not, and those take real time to build.</p>
<p>The exception is where you genuinely need two — most commonly an EST for local admission alongside an SAT or ACT for applications abroad. In that case, sequence them rather than blending them: build shared mathematical skill continuously, and concentrate exam-specific format practice on whichever test is next.</p>`,
      },
      {
        h: 'Questions that should not drive the decision',
        body: `<ul>
<li><strong>"Which is easier?"</strong> Neither. They are differently shaped, and the answer is personal.</li>
<li><strong>"Which do universities prefer?"</strong> Most institutions accepting both state no preference — but verify for the specific universities you care about rather than assuming.</li>
<li><strong>"Which did my friend do better on?"</strong> Their evidence is about them. Yours takes an afternoon to collect.</li>
<li><strong>"Which has better preparation material?"</strong> A real consideration, but a minor one next to which exam your applications actually require.</li>
</ul>`,
      },
    ],
    faqs: [
      {
        q: 'Should I take the SAT, the ACT or the EST?',
        a: '<p>Start from where you are applying: for many Egyptian universities the EST is the directly relevant exam, while applications abroad more commonly ask for the SAT or ACT. Once the destination has narrowed the field, sit a timed mathematics section of each remaining option under realistic conditions and compare — not just the scores, but where time ran out and what kind of errors you made. Direct evidence about your own performance is far more reliable than any general description of the three exams.</p>',
      },
      {
        q: 'Can I take more than one of these exams?',
        a: '<p>Yes, and some students need to — commonly an EST for local admission plus an SAT or ACT for applications abroad. Sequence them rather than preparing for both simultaneously: shared skill work continuously, exam-specific format practice concentrated on whichever comes next.</p>',
      },
      {
        q: 'Do universities prefer the SAT, the ACT or the EST?',
        a: '<p>Institutions that accept more than one generally state no preference between them, but which exams are accepted at all varies a great deal — the EST is widely recognised for Egyptian admission and much less so outside the region, while the SAT and ACT travel further. This is exactly the kind of policy that varies and changes, so verify with the specific universities you are applying to rather than relying on general advice.</p>',
      },
      {
        q: 'When should I decide which exam to take?',
        a: '<p>Early enough that your preparation is not split. The comparison itself takes two afternoons, so there is little reason to delay it — and deciding late means weeks of preparation spent hedging rather than building exam-specific fluency.</p>',
      },
    ],
    softCta:
      'Si Math AI supports SAT, ACT and EST Mathematics at equal depth, so the comparison above can be run inside one platform — and your diagnosis carries across whichever you choose.',
  },

  /* ═══════════════════════════════════════════════════════════════════════
     STUDY METHOD
     ═══════════════════════════════════════════════════════════════════════ */
  {
    slug: 'study-strategies',
    group: 'method',
    topic: 'Method',
    icon: '🎯',
    title: 'Study Strategies That Actually Raise a Math Score',
    metaTitle: 'Study Strategies That Actually Raise a Math Score',
    metaDescription:
      'Evidence-informed study strategies for exam mathematics: retrieval practice, spacing, interleaving, error logs, and why re-reading worked solutions feels productive but does not work.',
    summary: 'Retrieval practice, spacing, interleaving and error logs — and why reviewing solutions feels productive but is not.',
    lead: 'Some study methods feel productive and do very little. Others feel harder and work. The difference is well understood, and knowing it is worth more than extra hours.',
    teaches: ['Study strategy', 'Retrieval practice', 'Spaced practice', 'Learning psychology'],
    takeaways: [
      'Retrieve, do not review. Recalling something is what strengthens it; re-reading it is not.',
      'Space your practice. The same hours spread out produce more durable recall.',
      'Interleave topics. Mixed practice is harder and transfers better than blocked practice.',
      'Keep an error log. Patterns across weeks are invisible in any single session.',
      'Difficulty during practice is often a sign it is working, not a sign it is not.',
    ],
    sections: [
      {
        h: 'The comfortable methods that do not work',
        body: `<p>Three habits dominate most students' preparation, and all three are weak:</p>
<ul>
<li><strong>Re-reading worked solutions.</strong> Following a solution you are shown produces a strong feeling of understanding, because the reasoning is right there and nothing is difficult. That feeling is not learning — it is recognition, and it disappears when the scaffolding is removed.</li>
<li><strong>Highlighting and note-copying.</strong> Almost entirely passive. It occupies time and attention while requiring nothing to be retrieved from memory.</li>
<li><strong>Practising what you are good at.</strong> Comfortable, satisfying, and close to useless. Marks are lost where you are weak.</li>
</ul>
<p>These persist because they feel productive. Effective study usually feels worse in the moment — a well-documented and deeply unhelpful property of how learning works.</p>`,
      },
      {
        h: 'Retrieve, do not review',
        body: `<p>The single most valuable change most students can make: <strong>test yourself instead of reviewing.</strong></p>
<p>The act of pulling something out of memory is what strengthens it. Putting it back in — by reading it again — does very little. So when you sit down with a topic, do not re-read the method. Attempt a question cold, from memory, and only then check.</p>
<p>Applied to worked solutions, the discipline is: read the question, close the solution, attempt it yourself, and only then compare. If you cannot attempt it, read one line of the solution, close it, and try again from there. That is retrieval. Reading the whole solution and nodding is not.</p>
<p>This is uncomfortable — being unable to recall something feels like failure. It is the mechanism working.</p>`,
      },
      {
        h: 'Space it out',
        body: `<p>The same total study time produces substantially more durable recall when it is distributed rather than concentrated. Four sessions of thirty minutes across a week beat one two-hour session, for the same two hours.</p>
<p>The reason is the same as above: each time you return after a gap, the material has partially faded, so retrieving it requires effort — and that effort is what consolidates it. Practising something twice in a row is easy the second time and therefore does little.</p>
<p>This is the honest argument against cramming. Cramming does work for a day or two, which is why students keep doing it; it simply does not survive to test day, and it builds nothing you can reason from under pressure.</p>`,
      },
      {
        h: 'Mix your practice',
        body: `<p>Most practice is <em>blocked</em>: twenty quadratics questions, then twenty geometry questions. It feels efficient and produces good session performance.</p>
<p><em>Interleaved</em> practice — mixing topics within a session — feels worse and transfers better. The reason is directly relevant to exams: in blocked practice you already know which method applies before you read the question, so you never practise the hardest step. On the exam, nothing tells you which tool to reach for. That selection is a skill, and only mixed practice trains it.</p>
<p>A practical compromise: block when first learning something genuinely new, then move to mixed practice as soon as the method is understood.</p>`,
      },
      {
        h: 'Keep an error log',
        body: `<p>For every question you get wrong, record four things:</p>
<ol>
<li>The question, or enough of it to recognise.</li>
<li>The skill it actually tested.</li>
<li><strong>Why you got it wrong</strong> — content, process, or careless (see the <a href="learn-common-mistakes.html">common mistakes guide</a>).</li>
<li>What you should have done instead.</li>
</ol>
<p>Then review the log weekly. Its value is not in any single entry — it is in the pattern. Nobody notices that eleven of their last fourteen errors were sign handling while making them one at a time, weeks apart. Written down, it is obvious in a minute, and it turns a vague sense of "I'm bad at algebra" into a specific, fixable behaviour.</p>`,
      },
      {
        h: 'Practise at the edge of what you can do',
        body: `<p>Useful practice is difficult but achievable. Questions you can already do reliably build nothing. Questions far beyond you build frustration.</p>
<p>The productive zone is questions you can attempt but do not reliably get right — where you have to think, and where you fail sometimes. If you are getting nearly everything right, the practice is too easy to be improving you.</p>
<p>Two habits keep you in that zone: work from a current diagnosis rather than a fixed syllabus, and re-test previously weak skills rather than assuming a fix held.</p>`,
      },
    ],
    faqs: [
      {
        q: 'How many hours a day should I study for a math exam?',
        a: '<p>Consistency matters more than volume. Regular, focused daily sessions outperform occasional long ones for the same total hours, because spacing and retrieval do the work rather than time spent. A shorter session done every day is a better plan than a longer one done sometimes.</p>',
      },
      {
        q: 'Is it better to do many questions or study a few deeply?',
        a: '<p>Depth, especially when material is limited. A question studied properly — attempted cold, classified when wrong, revisited later — is worth several answered casually. Volume without diagnosis mostly reinforces what you already do.</p>',
      },
      {
        q: 'Why do I understand the solution but still get it wrong next time?',
        a: '<p>Because understanding a solution you are shown is recognition, not recall. The fix is retrieval: close the solution and reproduce it yourself, then attempt a similar question cold a few days later. If you cannot, you had not learned it — you had followed it.</p>',
      },
      {
        q: 'Does cramming work?',
        a: '<p>For a day or two, which is why it persists. It does not survive to test day and it builds nothing you can reason from under pressure. The same hours spread across weeks produce substantially more durable recall.</p>',
      },
    ],
    softCta:
      'Si Math AI applies these principles automatically — spacing what you revisit, mixing topics in Focus Practice, and maintaining the error log for you as a ranked list of weaknesses.',
  },

  {
    slug: 'time-management',
    group: 'method',
    topic: 'Method',
    icon: '⌛',
    title: 'Time Management in Exam Mathematics',
    metaTitle: 'Time Management in Exam Mathematics — Pacing, Triage and Checkpoints',
    metaDescription:
      'How to manage time in a timed mathematics exam: setting a per-question budget, pacing checkpoints, the skip decision, and what to do when you fall behind.',
    summary: 'Per-question budgets, pacing checkpoints, the skip decision, and recovering when you fall behind.',
    lead: 'Most students who "run out of time" did not work slowly. They spent too long on a small number of questions, and it cost them easy marks elsewhere.',
    teaches: ['Exam time management', 'Pacing strategy', 'Question triage'],
    takeaways: [
      'Know your average seconds per question before test day, and practise against it.',
      'Use two or three pacing checkpoints rather than watching the clock constantly.',
      'Every question is worth the same. Time spent is a trade, not a commitment.',
      'Decide to skip within seconds of getting stuck, not minutes.',
      'Falling behind is recoverable if you notice it early — which is what checkpoints are for.',
    ],
    sections: [
      {
        h: 'Know your budget',
        body: `<p>Before test day, work out the average time available per question for your exam: total section time divided by number of questions. Then practise against that number.</p>
<p>The average is a guide rather than a rule — easy questions should take well under it, banking time for harder ones. But knowing it converts a vague anxiety about time into a concrete target you can train against, and it makes pacing failures visible in practice rather than on the day.</p>
<p>Confirm the current timing and question count for your specific exam from the official source; both are set by the board and can change.</p>`,
      },
      {
        h: 'Use checkpoints, not constant clock-watching',
        body: `<p>Checking the clock after every question is a distraction that costs both time and concentration. Checking it never means discovering a problem too late.</p>
<p>The middle path is two or three <strong>checkpoints</strong>: predetermined points in the section where you know roughly where you should be. Roughly a third of the way through the time, you should be roughly a third of the way through the questions.</p>
<p>At each checkpoint you make one decision — on pace, ahead, or behind — and adjust. Between checkpoints, you do not think about time at all. This is far less draining than continuous monitoring and catches problems while they are still fixable.</p>`,
      },
      {
        h: 'The skip decision',
        body: `<p>The most expensive habit in timed mathematics is refusing to abandon a question. It usually comes from a reasonable-sounding thought — <em>I've already spent two minutes on this, I can't waste that</em> — which is precisely backwards. The two minutes are gone either way. The only question is what the <em>next</em> two minutes are worth, and they are almost always worth more spent on questions you can actually do.</p>
<p>A workable rule: if you have not identified a route within a short, fixed interval of starting, mark it and move on. Do not negotiate with yourself in the moment — decide the rule in advance and follow it mechanically. Decisions made under time pressure are exactly the decisions you should not be improvising.</p>
<p>Skipping is not giving up. You will return if time allows, and you will have banked marks that would otherwise have been lost.</p>`,
      },
      {
        h: 'Every question is worth the same',
        body: `<p>On these exams, a hard question and an easy question score identically. This has an immediate consequence that students consistently fail to act on: <strong>time spent on a hard question is time taken from an easy one.</strong></p>
<p>Four minutes on a difficult question that you eventually solve is a poor trade if it costs you three straightforward questions later in the section. The instinct to prove you can solve the hard one is real, and on a timed exam it is expensive. Save it for practice.</p>`,
      },
      {
        h: 'When you fall behind',
        body: `<p>If a checkpoint tells you that you are behind, do not accelerate uniformly — rushing every question converts slow correct answers into fast wrong ones. Instead:</p>
<ul>
<li><strong>Raise your skip threshold.</strong> Be quicker to abandon anything that does not resolve immediately.</li>
<li><strong>Take the guaranteed marks first.</strong> Scan ahead for questions you can do quickly and take them, rather than working strictly in order.</li>
<li><strong>Protect your accuracy on what you do attempt.</strong> Half-attempted questions score nothing; finish what you start.</li>
<li><strong>Reserve the final seconds to fill every blank.</strong> Where there is no penalty for a wrong answer, a blank is strictly worse than a guess.</li>
</ul>`,
      },
      {
        h: 'Train pacing separately',
        body: `<p>Pacing is a skill, and it is trained by practising under real conditions — not by intending to be faster.</p>
<p>Practise full timed sections regularly rather than only in the final weeks. Time individual questions occasionally to find where you are slow. And review the questions you got <em>right slowly</em>, not only the ones you got wrong: a correct answer that took three times your budget is a pacing problem that has not yet cost you a mark, but will.</p>`,
      },
    ],
    faqs: [
      {
        q: 'How do I stop running out of time on math exams?',
        a: '<p>Usually by triaging rather than by working faster. Most students who run out of time did not work slowly overall — they overspent on a few hard questions. Set a fixed skip rule, use two or three pacing checkpoints, and practise full timed sections so the habit is automatic.</p>',
      },
      {
        q: 'How long should I spend on one question?',
        a: '<p>Less than your average budget on easy ones, more on hard ones, and never so long that it costs you questions you could have answered. Set a fixed interval after which you mark and move on, and decide it before the exam rather than in the moment.</p>',
      },
      {
        q: 'Should I answer questions in order?',
        a: '<p>Broadly yes, but with a two-pass approach: take everything you can do confidently on the first pass, mark and defer the rest, then return with the time remaining. Working strictly in order risks never reaching easy questions at the end.</p>',
      },
      {
        q: 'Is it worth checking my answers if I finish early?',
        a: '<p>Yes — but check strategically rather than re-solving everything. Revisit anything you were unsure of, anything where you rushed, and confirm you answered the quantity actually asked for. That last check catches one of the most common careless errors there is.</p>',
      },
    ],
    softCta:
      'Full timed mock exams inside Si Math AI reproduce real conditions, so pacing problems appear in practice — where they are still fixable.',
  },

  {
    slug: 'common-mistakes',
    group: 'method',
    topic: 'Diagnosis',
    icon: '🔍',
    title: 'The Most Common Mistakes in Exam Mathematics',
    metaTitle: 'The Most Common Mistakes in Exam Mathematics — and How to Fix Them',
    metaDescription:
      'The errors students actually make in SAT, ACT and EST Mathematics: answering the wrong quantity, sign handling, misread conditions, distractor traps, and the process fixes for each.',
    summary: 'The errors students actually make — answering the wrong quantity, sign slips, misread conditions — and the process fix for each.',
    lead: 'Ask a student why they lost marks and they will usually say "careless mistakes", as though that were one thing. It is not. It is a small number of specific, recurring, fixable behaviours.',
    teaches: ['Common student mistakes', 'Error analysis', 'Exam technique'],
    takeaways: [
      'Answering a different question from the one asked is the single most common avoidable error.',
      'Sign errors cluster in a few predictable places — distributing, moving terms, squaring.',
      'Wrong answer choices are engineered around specific mistakes, not chosen randomly.',
      '"Careless" is not a diagnosis. Name the exact behaviour and the fix becomes obvious.',
      'Most careless errors are fixed by process changes, not by more content study.',
    ],
    sections: [
      {
        h: 'Answering the wrong quantity',
        body: `<p>The most common avoidable error in exam mathematics, by a wide margin. The question asks for <em>2x</em>; you solve correctly for <em>x</em> and stop. It asks for the perimeter; you find the area. It asks how many did <em>not</em> pass; you give how many did.</p>
<p>This is not a mathematical failure — the mathematics was right. It is a reading failure under time pressure, and it is almost entirely eliminable by one habit:</p>
<p><strong>Before you start solving, underline or circle exactly what the question asks for. When you finish, look at it again before selecting.</strong></p>
<p>It costs a couple of seconds and it is probably the highest-return habit on this page. Exam writers know this error is common, and the value of your intermediate result — the <em>x</em> when they asked for <em>2x</em> — is very often available as an answer choice.</p>`,
      },
      {
        h: 'Sign errors',
        body: `<p>Sign errors are not random. They cluster in a few predictable places:</p>
<ul>
<li><strong>Distributing a negative</strong> across a bracket — the second and later terms are where it goes wrong.</li>
<li><strong>Moving a term across an equals sign</strong> and forgetting to flip its sign.</li>
<li><strong>Squaring a negative</strong>, or losing a negative under a root.</li>
<li><strong>Subtracting an expression</strong> rather than a single term.</li>
<li><strong>Inequalities</strong> — multiplying or dividing by a negative without reversing the direction.</li>
</ul>
<p>Because the failure points are predictable, so is the fix: slow down deliberately at those specific moments rather than trying to be generally more careful. "Be careful" is not actionable. "Write the expanded bracket out rather than doing it mentally" is.</p>`,
      },
      {
        h: 'Misreading a condition',
        body: `<p>Questions carry conditions that change the answer entirely: <em>positive</em> integers, <em>distinct</em> values, <em>at least</em> rather than <em>more than</em>, results to the nearest whole number, values excluded from a domain.</p>
<p>Students under time pressure read for the mathematics and skim the qualifiers. The fix is a reading habit rather than a mathematical one: read the question once slowly and completely before writing anything. Reading once carefully is faster than reading three times quickly, and it catches the qualifier that would otherwise cost the mark.</p>`,
      },
      {
        h: 'Walking into engineered distractors',
        body: `<p>On multiple-choice mathematics, wrong answer choices are not filler. They are constructed to match the results of specific, predictable mistakes: the answer you get if you drop a sign, if you solve for the intermediate variable, if you use the wrong formula, if you forget to convert units.</p>
<p>This has a practical consequence students underuse: <strong>finding your answer among the choices is not confirmation that it is right.</strong> It very often means you have made exactly the mistake the writer anticipated.</p>
<p>It also means reviewing wrong answers is unusually informative. When you get a question wrong, work out <em>which</em> distractor you chose and what mistake produces it. That tells you your error precisely — far more precisely than "got it wrong".</p>`,
      },
      {
        h: 'Units, labels and conversions',
        body: `<p>A quiet, steady source of lost marks. The question gives minutes and asks for hours. It gives a rate per week and asks about a month. It mixes centimetres and metres in one diagram.</p>
<p>The fix is mechanical: <strong>write units next to your numbers</strong> as you work. Most students drop units to save time, then lose marks that cost far more time than they saved. Carrying units also catches setup errors early — if your working produces a quantity in the wrong units, the setup was wrong.</p>`,
      },
      {
        h: 'Mental arithmetic that should have been written down',
        body: `<p>Skipping intermediate steps to save time is a false economy. Steps done in your head cannot be checked, and when the final answer is wrong you have no way to locate the error short of redoing everything.</p>
<p>Write the intermediate step. It costs seconds, it makes errors findable, and it substantially reduces the arithmetic slips that come from holding too much in working memory while also thinking about the problem.</p>`,
      },
      {
        h: 'Stop saying "careless"',
        body: `<p>"Careless mistakes" is not a diagnosis — it is a way of not making one, and it leads nowhere because there is no action attached to it.</p>
<p>Replace it with the specific behaviour. Instead of <em>"I made careless mistakes"</em>, name it:</p>
<ul>
<li><em>"I solved for x when it asked for 2x — three times this month."</em></li>
<li><em>"I dropped a negative distributing across a bracket."</em></li>
<li><em>"I missed the word 'positive' in the condition."</em></li>
</ul>
<p>Each of those has an obvious fix. "Careless" has none. This is what an <a href="learn-study-strategies.html">error log</a> is for: it converts a vague feeling into a specific, countable, fixable behaviour — and specificity is what makes an error stop recurring.</p>`,
      },
    ],
    faqs: [
      {
        q: 'What is the most common mistake in SAT, ACT and EST Math?',
        a: '<p>Answering a different question from the one asked — solving for x when the question asks for 2x, or giving area when it asks for perimeter. The mathematics is right and the mark is lost. Circling what is asked before solving, and re-reading it before selecting, largely eliminates it.</p>',
      },
      {
        q: 'How do I stop making careless mistakes in math?',
        a: '<p>Stop calling them careless and name the specific behaviour instead — "I drop negatives when distributing", "I miss qualifying words". Each named behaviour has an obvious process fix. Vague self-criticism has none, which is why the errors keep recurring.</p>',
      },
      {
        q: 'Why is my answer always one of the options even when I am wrong?',
        a: '<p>Because wrong answer choices are engineered from predictable mistakes — dropping a sign, solving for the intermediate variable, forgetting a conversion. Seeing your answer among the choices is not confirmation. It often means you made exactly the error the question anticipated.</p>',
      },
      {
        q: 'Should I write out every step even when I can do it in my head?',
        a: '<p>For anything beyond the trivial, yes. Steps done mentally cannot be checked, and when the answer is wrong you cannot locate the error. Writing the intermediate step costs seconds and saves both marks and time.</p>',
      },
    ],
    softCta:
      'The Weakness Analyzer in Si Math AI does this classification continuously — recording which specific skill each error belongs to, so patterns surface without you having to spot them yourself.',
  },

  {
    slug: 'calculator-use',
    group: 'method',
    topic: 'Technique',
    icon: '🧮',
    title: 'Using a Calculator Well in Exam Mathematics',
    metaTitle: 'Calculator Strategy for Exam Mathematics — When to Use It, When Not To',
    metaDescription:
      'How to use a calculator well in SAT, ACT and EST Mathematics: when it saves time, when it costs time, common calculator-induced errors, and how to prepare with the tool you will actually use.',
    summary: 'When a calculator saves time, when it costs time, and the errors it introduces.',
    lead: 'A calculator is a tool for arithmetic, not for thinking. Students who reach for it reflexively are usually slower, not faster.',
    teaches: ['Calculator strategy', 'Exam technique', 'Mental arithmetic'],
    takeaways: [
      'Reaching for the calculator by reflex costs time on simple arithmetic.',
      'It is most valuable for messy arithmetic, checking work, and graphical verification.',
      'It cannot tell you what to compute — setup errors survive any amount of computation.',
      'Practise with the exact tool you will use on test day.',
      'Confirm the calculator policy for your exam, and for each section of it, from the official source.',
    ],
    sections: [
      {
        h: 'The reflex problem',
        body: `<p>Watch a student work through a timed section and you will often see the same pattern: a calculator picked up for arithmetic that would have been faster mentally. Multiplying by ten. Adding two small numbers. Halving something.</p>
<p>Each instance costs only a few seconds, but the pattern repeats dozens of times across a section, and the total is significant. Worse, it breaks concentration — each pick-up moves attention from the problem to the device and back.</p>
<p>The habit worth building is a brief pause: <em>can I do this faster in my head?</em> For a large proportion of exam arithmetic the answer is yes.</p>`,
      },
      {
        h: 'Where a calculator genuinely earns its place',
        body: `<ul>
<li><strong>Messy arithmetic</strong> — awkward decimals, large numbers, roots that are not clean. Doing these by hand invites exactly the slips that cost marks.</li>
<li><strong>Checking a result</strong> when you have time and doubt an answer. Verification is a good use of a calculator; it is also the use students neglect most.</li>
<li><strong>Graphical verification</strong>, where the tool allows it — confirming an intersection, a root, or the shape of a function you have found algebraically.</li>
<li><strong>Testing answer choices.</strong> Sometimes substituting the options is faster than solving forwards, and a calculator makes that route cheap.</li>
</ul>
<p>Notice the pattern: it is most valuable for <em>execution</em> and <em>verification</em>, and least valuable for <em>deciding what to do</em>.</p>`,
      },
      {
        h: 'What a calculator cannot do',
        body: `<p>It cannot tell you what to compute. This sounds obvious and is the source of most calculator-related lost marks.</p>
<p>If you set up the wrong equation, the calculator will solve the wrong equation flawlessly and hand you a confident wrong answer — one that frequently appears among the answer choices, because the exam writer anticipated that setup error. The device removes arithmetic risk while doing nothing about reasoning risk, and it can make a wrong answer feel more trustworthy than it is.</p>
<p>The corollary: time invested in <em>setting up</em> the problem correctly is worth far more than time saved computing it.</p>`,
      },
      {
        h: 'Errors the calculator introduces',
        body: `<p>A calculator does not only remove errors — it adds its own:</p>
<ul>
<li><strong>Mistyping.</strong> A transposed digit produces a plausible wrong answer with no warning. Anything important is worth entering twice.</li>
<li><strong>Bracket errors.</strong> Omitting brackets around a numerator or an exponent silently changes the expression. This is one of the most common calculator errors there is.</li>
<li><strong>Mode errors.</strong> Degrees versus radians will quietly ruin every trigonometric question in a section. Check the mode before you start, not after a wrong answer.</li>
<li><strong>Premature rounding.</strong> Rounding an intermediate value and carrying it forward introduces error that can push a final answer past the rounding boundary. Keep full precision until the final step.</li>
<li><strong>Misplaced trust.</strong> An answer from a device feels authoritative. Sense-check it — if a length comes out negative or a probability exceeds one, something is wrong upstream.</li>
</ul>`,
      },
      {
        h: 'Practise with the tool you will actually use',
        body: `<p>Fluency with a specific calculator is a real skill and it does not transfer between models. Students who practise on one device and sit the exam with another lose time hunting for functions and make entry errors under pressure.</p>
<p>Decide early which calculator you will use — subject to the rules for your exam — and use that one for all your practice. Know how to enter fractions, powers, roots and brackets without thinking, how to switch modes, and how to recall a previous answer.</p>`,
      },
      {
        h: 'Know the policy — and verify it',
        body: `<p>Calculator rules differ between examinations, can differ between sections of the same examination, and change over time. Permitted models are also restricted, and the restrictions are enforced.</p>
<p>Two things follow. First, <strong>confirm the current policy for your exam from the official source</strong> — not from a forum, a tutor's recollection, or an older sibling's experience. Second, <strong>practise under the policy that applies.</strong> If any part of your exam restricts calculator use, practise that part without one; arriving with rusty mental arithmetic is a self-inflicted problem.</p>`,
      },
    ],
    faqs: [
      {
        q: 'Should I use a calculator on every question?',
        a: '<p>No. For simple arithmetic it is usually slower than doing it mentally, and each pick-up breaks concentration. Reserve it for messy computation, verification, graphical checks and testing answer choices.</p>',
      },
      {
        q: 'Which calculator should I use?',
        a: '<p>One permitted for your exam that you know fluently. The specific model matters less than practising with it exclusively — familiarity prevents the time loss and entry errors that come from using an unfamiliar device under pressure. Check the permitted-model list from the official source.</p>',
      },
      {
        q: 'What are the most common calculator mistakes?',
        a: '<p>Mistyping, missing brackets around a numerator or exponent, being in the wrong angle mode, rounding intermediate values too early, and trusting an answer that does not make sense. All five are habits rather than knowledge gaps.</p>',
      },
      {
        q: 'Do all these exams allow calculators?',
        a: '<p>Policies differ by examination, can differ between sections of the same examination, and change over time. Confirm the current rule for your specific exam from the official source, and practise under whatever policy applies to you.</p>',
      },
    ],
    softCta:
      'When you work through a problem with Zero in Si Math AI, the explanation focuses on setting the problem up correctly — the part a calculator cannot help with.',
  },

  {
    slug: 'score-improvement',
    group: 'method',
    topic: 'Method',
    icon: '📈',
    title: 'How to Improve a Math Score',
    metaTitle: 'How to Improve a Math Score — What Works at Each Score Band',
    metaDescription:
      'What actually raises a mathematics exam score: diagnosing before studying, why the right strategy differs by score band, why plateaus happen, and how to measure progress honestly.',
    summary: 'Why the right strategy differs by score band, what causes plateaus, and how to measure progress honestly.',
    lead: 'The advice that raises a low score is not the advice that raises a high one. Applying the wrong one is the most common reason preparation stalls.',
    teaches: ['Score improvement', 'Diagnostic assessment', 'Study planning'],
    takeaways: [
      'Diagnose before you study. A plan without a baseline is guesswork.',
      'What works depends on your current score band — the bottleneck is different.',
      'Plateaus usually mean your practice no longer matches your remaining weaknesses.',
      'Measure with timed sections, not with how much study you have done.',
      'A weakness is closed when later evidence confirms it, not when you understand the fix.',
    ],
    sections: [
      {
        h: 'Diagnose first — always',
        body: `<p>The most common preparation mistake is studying before diagnosing. A student decides they are "bad at math", buys a book, and works through it from the beginning. Weeks later the score has barely moved, because most of that work was spent on material they already knew.</p>
<p>Preparation should start with a full, timed baseline, and every subsequent decision should follow from it. You are looking for three things: which skills you get wrong, how often, and how heavily those skills are tested. The product of those is what should order your study, not the order of chapters in a book.</p>`,
      },
      {
        h: 'What works depends on where you are',
        body: `<p>Score-improvement advice is usually written as though every student has the same problem. They do not. The bottleneck changes as the score rises.</p>
<h3>From a low score</h3>
<p>The bottleneck is usually genuine content gaps, often in foundations rather than in advanced material — fractions, negatives, basic manipulation, translating words into equations. Progress here comes from rebuilding those foundations properly. It feels slow and pays the largest dividends, because everything else rests on them. Speed work at this stage is wasted; accuracy comes first.</p>
<h3>From a middle score</h3>
<p>Usually a mix: some real content gaps, plus a substantial share of process errors — inefficient setups, wrong route selection, mistranslated word problems. This is where diagnosis pays most, because the remaining gaps are specific and scattered rather than general. Broad practice is inefficient here; targeted practice is transformative.</p>
<h3>From a high score</h3>
<p>The content is largely known. What remains is careless error, pacing, and a small number of genuinely hard question types. Additional content study returns almost nothing. Progress comes from process discipline — checking that you answered the right quantity, writing intermediate steps, eliminating the specific recurring slips in your error log — and from sitting enough full timed sections that fatigue and pressure stop producing mistakes.</p>
<p>The practical implication: a high-scoring student who responds to a plateau by studying more content is doing the wrong work, and a low-scoring student who responds by drilling speed is doing the wrong work too.</p>`,
      },
      {
        h: 'Why plateaus happen',
        body: `<p>A plateau almost always means one of four things:</p>
<ul>
<li><strong>Your practice no longer matches your weaknesses.</strong> You are working through material that no longer contains what you get wrong. This is the most common cause by far.</li>
<li><strong>You are practising what is comfortable.</strong> Marks are lost where you are weak, and weak areas are unpleasant to work on.</li>
<li><strong>Your remaining errors are not content errors.</strong> Careless and pacing errors do not respond to content study, and a student can add many hours without touching them.</li>
<li><strong>You are not practising under real conditions.</strong> Untimed accuracy improves while timed accuracy does not, and only the second is measured on test day.</li>
</ul>
<p>Note that "not enough hours" is not on that list. Plateaus are usually a targeting problem, not a volume problem — which is fortunate, because targeting is easier to fix than finding more time.</p>`,
      },
      {
        h: 'Measure honestly',
        body: `<p>Study time is not progress. Questions completed is not progress. The only measurement that matters is performance under exam conditions.</p>
<ul>
<li><strong>Sit full timed sections regularly</strong> and track the results. Fewer, more honest measurements beat frequent casual ones.</li>
<li><strong>Track by skill, not just by total.</strong> A flat total can hide real movement — one area improving while another slips.</li>
<li><strong>Re-test what you fixed.</strong> Understanding a fix is not evidence that it held. A weakness is closed when a later attempt confirms it, not when the explanation made sense.</li>
<li><strong>Expect noise.</strong> Single-session results vary. Look at the trend across several, not at any one.</li>
</ul>`,
      },
      {
        h: 'What does not work',
        body: `<ul>
<li><strong>Doing more questions without diagnosis.</strong> Volume reinforces what you already do, including the mistakes.</li>
<li><strong>Reviewing solutions passively.</strong> Feels productive, teaches recognition rather than recall. See <a href="learn-study-strategies.html">study strategies</a>.</li>
<li><strong>Cramming.</strong> Works for a day, does not survive to test day.</li>
<li><strong>Studying only what is enjoyable.</strong> Comfortable and close to useless.</li>
<li><strong>Waiting for a "system" to fix it.</strong> No platform, book or tutor substitutes for the work — they can only make sure the work is aimed at the right target.</li>
</ul>`,
      },
      {
        h: 'A note on expectations',
        body: `<p>We publish no average improvement figures, and you should be sceptical of anyone who does. How much a score moves depends on the starting point, the time available, the quality of the targeting and — most of all — the work actually done. Any single number offered as a guarantee is either unverifiable or true only of a selected group.</p>
<p>What can be said honestly is this: a student who diagnoses accurately, practises against the diagnosis rather than around it, works consistently, and measures under real conditions is doing everything within their control. That is the method. The outcome follows from it, and no honest source will promise the number.</p>`,
      },
    ],
    faqs: [
      {
        q: 'How can I improve my SAT Math score quickly?',
        a: '<p>Diagnose first, then target. Most rapid improvement comes from discovering that a handful of specific skills — or a specific recurring careless error — account for a large share of lost marks. Practising broadly is the slowest route, because most of that time is spent on material you already know.</p>',
      },
      {
        q: 'Why has my score stopped improving?',
        a: '<p>Usually because your practice no longer matches your remaining weaknesses, or because your remaining errors are careless and pacing errors that content study does not address. Plateaus are almost always a targeting problem rather than a volume problem.</p>',
      },
      {
        q: 'How much can I improve my math score?',
        a: '<p>We do not publish improvement figures, because any honest answer depends on your starting point, the time you have and the work you do. Be sceptical of anyone offering a guaranteed number — what you can control is the method: diagnose, target, practise consistently, measure under real conditions.</p>',
      },
      {
        q: 'Is it too late to improve before my exam?',
        a: '<p>Rarely, though what to do changes. Late in preparation, a timed section plus a ranked weakness list is a rational use of remaining time — fixing two or three high-frequency errors is achievable in a short window. Broad content review at that stage is not.</p>',
      },
    ],
    softCta:
      'Si Math AI is built around this loop: diagnose from real attempts, rank weaknesses by score impact, generate practice from that ranking, and re-measure to confirm the fix held.',
  },

  /* ═══════════════════════════════════════════════════════════════════════
     MINDSET
     ═══════════════════════════════════════════════════════════════════════ */
  {
    slug: 'exam-psychology',
    group: 'mindset',
    topic: 'Mindset',
    icon: '🧠',
    title: 'Exam Psychology: Performing Under Pressure',
    metaTitle: 'Exam Psychology — Managing Pressure in Mathematics Examinations',
    metaDescription:
      'The psychology of mathematics exam performance: why anxiety costs marks, how to build a pre-exam routine, recovering after a bad question, and what to do the night before.',
    summary: 'Why anxiety costs marks mechanically, how to recover mid-exam, and what actually helps the night before.',
    lead: 'Anxiety does not only feel bad. It occupies the same working memory the mathematics needs, which is why a student who knows the material can still underperform.',
    teaches: ['Exam psychology', 'Test anxiety management', 'Performance under pressure'],
    takeaways: [
      'Anxiety competes for working memory — the resource multi-step mathematics depends on.',
      'Familiarity is the most effective anxiety reduction available: rehearse the real conditions.',
      'One bad question is only expensive if you carry it into the next five.',
      'Have a rehearsed reset for when you freeze, decided before the exam.',
      'The night before is for sleep and logistics, not for new material.',
    ],
    sections: [
      {
        h: 'Why anxiety costs marks',
        body: `<p>Exam anxiety is not simply unpleasant — it has a mechanism, and understanding it makes it easier to manage.</p>
<p>Multi-step mathematics leans heavily on <strong>working memory</strong>: holding intermediate values, tracking what you have done, keeping the goal in view. Anxious thoughts — <em>I'm running out of time, everyone else is finishing, I can't do this</em> — occupy exactly that resource. The capacity spent on worry is not available for the problem.</p>
<p>This explains something students find bewildering: knowing the material and still performing worse than in practice. The knowledge is intact; the capacity to deploy it is reduced. It also explains why "just relax" is useless advice, and why reducing the demands on working memory — writing steps down, using a rehearsed routine — helps even when the anxiety itself does not fully subside.</p>`,
      },
      {
        h: 'Familiarity is the most effective intervention',
        body: `<p>The single most effective way to reduce exam anxiety is to make the exam unsurprising.</p>
<p>Much of the pressure on test day comes from novelty: an unfamiliar format, uncertainty about pacing, not knowing how it will feel to be forty minutes in and behind. Every one of those can be rehearsed in advance.</p>
<ul>
<li>Sit full, timed sections under realistic conditions — not shortened sets.</li>
<li>Practise at a similar time of day to your exam, if you can.</li>
<li>Practise the situations you fear: falling behind, meeting a question you cannot do, having to guess.</li>
<li>Know the format, timing, materials and rules in advance so none of it is new.</li>
</ul>
<p>A student who has already experienced being behind at the halfway point — in practice, where it was safe — responds very differently when it happens for real. They have a rehearsed response instead of a panic.</p>`,
      },
      {
        h: 'Recovering from a bad question',
        body: `<p>One difficult question costs one mark. Carrying it into the next five costs five, and this cascade is one of the most common ways a good student underperforms.</p>
<p>The failure sequence is predictable: a question goes badly, attention stays on it, the next question is read while still thinking about the last one, that one goes badly too, and the spiral confirms itself.</p>
<p>Break it mechanically rather than emotionally. Decide in advance on a physical reset: put the pen down, take one slow breath, sit up, and read the next question aloud in your head from the first word. It takes a few seconds and it interrupts the loop. The point is not that breathing is calming — it is that the routine occupies attention and gives it somewhere to go other than the question you have left behind.</p>
<p>Frame it plainly: <strong>the previous question is over, and its mark is already decided. The only question that can still be affected is this one.</strong></p>`,
      },
      {
        h: 'When you freeze completely',
        body: `<p>Occasionally a student goes blank — reads a question and nothing comes. It is frightening and it is recoverable. Have a rehearsed sequence:</p>
<ol>
<li><strong>Stop reading it again.</strong> Re-reading the same question while frozen rarely helps and consumes time.</li>
<li><strong>Write something down.</strong> Any given value, any labelled diagram. Physical action restarts engagement more reliably than staring does.</li>
<li><strong>Move on if it does not resolve quickly.</strong> Mark it, take an easier question, and let the reset happen naturally. Answering something you can do restores function faster than forcing the one you cannot.</li>
<li><strong>Return later.</strong> Questions that were impenetrable often open up on a second visit, which is a genuinely reliable effect and worth relying on.</li>
</ol>`,
      },
      {
        h: 'The night before and the morning of',
        body: `<p>Preparation is finished by the night before. What remains is protecting the performance.</p>
<ul>
<li><strong>Sleep is the highest-value action available.</strong> Working memory and attention degrade measurably with poor sleep, and both are exactly what you need. Late revision that costs sleep is a bad trade.</li>
<li><strong>Do not start new material.</strong> Nothing learned that night will be reliable under pressure, and failing to grasp it creates anxiety you carry into the exam.</li>
<li><strong>Light review only, if any.</strong> Skim your error log or a formula sheet — familiar, confidence-supporting, low-effort.</li>
<li><strong>Sort logistics the night before</strong> — documents, calculator, batteries, route, timing. Morning stress is avoidable stress.</li>
<li><strong>Eat something.</strong> A long exam on no food is an unnecessary handicap.</li>
</ul>`,
      },
      {
        h: 'Keep the exam in proportion',
        body: `<p>A final point, meant sincerely. An examination measures a specific set of skills on a specific morning. It is worth preparing for properly and worth taking seriously — and it is not a measurement of your intelligence, your worth, or the shape of your life.</p>
<p>Students who hold an exam as a verdict on themselves carry more anxiety into the room, and typically perform worse than students who hold it as a task to be executed. The proportionate view is not only healthier; it is also, usefully, the one that scores better.</p>`,
      },
    ],
    faqs: [
      {
        q: 'How do I deal with math test anxiety?',
        a: '<p>The most effective intervention is familiarity: rehearse full timed sections under realistic conditions, including the situations you fear, so test day is unsurprising. Beyond that, reduce the load on working memory by writing steps down, and have a rehearsed physical reset for when a question goes badly.</p>',
      },
      {
        q: 'What should I do if I panic during the exam?',
        a: '<p>Use a rehearsed reset rather than trying to reason yourself calm: put the pen down, one slow breath, sit up, re-read the next question from the first word. If you have frozen on a question, write down any given value or move on and return later — action restarts engagement more reliably than staring.</p>',
      },
      {
        q: 'Should I study the night before the exam?',
        a: '<p>Not new material. Sleep is worth more than late revision, because working memory and attention degrade with poor sleep and both are exactly what the exam demands. Light review of an error log or formula sheet is fine; learning something new is counterproductive.</p>',
      },
      {
        q: 'I know the material but perform badly in exams. Why?',
        a: '<p>Most often because anxiety occupies the working memory that multi-step mathematics needs — the knowledge is intact but the capacity to deploy it is reduced. That responds to rehearsal under real conditions far more than to additional content study.</p>',
      },
    ],
    softCta:
      'Full timed mock exams inside Si Math AI exist partly for this reason: rehearsing real conditions is the most effective way to make test day unsurprising.',
  },

  /* ═══════════════════════════════════════════════════════════════════════
     GUIDANCE
     ═══════════════════════════════════════════════════════════════════════ */
  {
    slug: 'parents-guide',
    group: 'guidance',
    topic: 'Parents',
    icon: '👪',
    title: "A Parent's Guide to SAT, ACT and EST Math",
    metaTitle: "A Parent's Guide to SAT, ACT and EST Mathematics",
    metaDescription:
      'A guide for parents supporting a student through SAT, ACT or EST Mathematics preparation: what the exams involve, how to help without adding pressure, what real progress looks like, and warning signs.',
    summary: 'What the exams involve, how to help without adding pressure, and what genuine progress looks like.',
    lead: 'The most common way a supportive parent accidentally hurts a student\'s preparation is by measuring the wrong thing.',
    teaches: ['Parent guidance', 'Supporting exam preparation', 'Understanding standardised exams'],
    takeaways: [
      'Hours studied is a poor measure. Ask what changed, not how long they sat.',
      'Pressure raises anxiety, and anxiety directly reduces mathematics performance.',
      'Real progress looks like specific weaknesses closing, not a rising study-hour count.',
      'A plateau usually means mistargeted practice, not laziness.',
      'Practical support — logistics, sleep, a quiet space — is genuinely valuable.',
    ],
    sections: [
      {
        h: 'What these exams are',
        body: `<p>The SAT, ACT and EST are standardised admission examinations. Their mathematics sections test material that mostly sits inside a normal secondary syllabus — the difficulty comes from executing it accurately, quickly, and under time pressure, rather than from advanced content.</p>
<p>Which exam matters depends on where your child is applying. For many American Diploma students in Egypt, the EST is central to local university admission, while the SAT or ACT matters for applications abroad. Requirements vary by institution and change, so confirm them directly with the universities concerned. A short guide to the decision is in <a href="learn-choosing-your-exam.html">choosing your exam</a>.</p>`,
      },
      {
        h: 'Measure the right thing',
        body: `<p>The most natural question — <em>"how long did you study today?"</em> — is unfortunately the least informative, and it quietly pushes a student toward the appearance of work rather than its substance.</p>
<p>Hours spent is a weak indicator. A student can spend three hours re-reading solutions to topics they already know and learn almost nothing; another can spend forty focused minutes on their three weakest skills and move the score more.</p>
<p>Better questions:</p>
<ul>
<li><em>"What did you get wrong this week, and why?"</em></li>
<li><em>"Which topics are you weakest in right now?"</em></li>
<li><em>"Has anything moved since your last practice test?"</em></li>
</ul>
<p>These ask about substance. They also model the diagnostic thinking that makes preparation work — a student who can answer them is preparing well, whatever the hour count.</p>`,
      },
      {
        h: 'Pressure is counterproductive, mechanically',
        body: `<p>This is not a soft point. Multi-step mathematics depends on working memory, and anxiety consumes working memory. A student carrying significant pressure into an exam has measurably less capacity available for the problems, regardless of how well they know the material.</p>
<p>So pressure intended to increase effort frequently reduces performance instead. It also encourages the least useful behaviours — long visible study sessions, avoiding practice tests because a low score would disappoint, and hiding difficulties rather than naming them.</p>
<p>The most useful stance is steady interest rather than intensity: take the preparation seriously, ask substantive questions, and make it safe to report a bad practice score. A student who can say "I did badly and here's what I got wrong" is in a far better position than one who cannot.</p>`,
      },
      {
        h: 'What real progress looks like',
        body: `<p>Progress in exam preparation is not linear and it is not primarily visible in total scores, which are noisy from session to session. What to look for instead:</p>
<ul>
<li><strong>Specific weaknesses closing.</strong> A topic that produced consistent errors last month no longer does.</li>
<li><strong>Improving accuracy under timed conditions</strong>, specifically — untimed improvement is easier and matters less.</li>
<li><strong>Better self-diagnosis.</strong> A student who can name what they get wrong and why has developed the skill that drives everything else.</li>
<li><strong>Fewer repeated errors.</strong> The same mistake recurring is the clearest sign practice is not targeted.</li>
<li><strong>Consistency.</strong> Regular short sessions predict outcomes better than occasional long ones.</li>
</ul>
<p>Expect fluctuation. A single lower practice score is normal noise; a flat trend over many weeks is worth investigating.</p>`,
      },
      {
        h: 'Warning signs worth acting on',
        body: `<ul>
<li><strong>Studying a lot with no movement.</strong> Almost always mistargeted practice rather than insufficient effort — the fix is diagnosis, not more hours.</li>
<li><strong>Avoiding practice tests.</strong> Usually fear of a bad result. Since timed practice is the most valuable activity available, this is worth addressing gently and directly.</li>
<li><strong>The same mistakes recurring for weeks.</strong> A sign that errors are not being analysed, only repeated.</li>
<li><strong>Only ever studying comfortable topics.</strong> Very common, entirely human, and the reason many plateaus happen.</li>
<li><strong>Anxiety that persists outside study time.</strong> Worth taking seriously in its own right, not only for exam reasons.</li>
</ul>`,
      },
      {
        h: 'Practical support that genuinely helps',
        body: `<p>Some of the most valuable support has nothing to do with mathematics:</p>
<ul>
<li><strong>Protect sleep,</strong> especially in the final weeks. It is not a soft factor — attention and working memory degrade measurably without it.</li>
<li><strong>Provide a quiet, consistent place to work</strong>, and protect the time.</li>
<li><strong>Handle logistics</strong> — registration deadlines, documents, the route on test day. Removing administrative worry is real help.</li>
<li><strong>Keep the exam in proportion.</strong> Students who experience an exam as a verdict on themselves carry more anxiety and typically perform worse than those who experience it as a task.</li>
<li><strong>Let them own it.</strong> Preparation a student directs themselves is more effective than preparation imposed on them, and the self-direction is itself a skill worth having by university.</li>
</ul>`,
      },
    ],
    faqs: [
      {
        q: 'How can I tell if my child is preparing effectively?',
        a: '<p>Ask what they got wrong and why, rather than how long they studied. A student who can name their weakest topics and explain their recent errors is preparing well. One who reports many hours but cannot say what changed is probably practising what they already know.</p>',
      },
      {
        q: 'My child studies a lot but the score is not moving. What is wrong?',
        a: '<p>Usually targeting, not effort. Practice that does not match the student\'s actual weaknesses reinforces what they can already do. The fix is a timed baseline followed by practice aimed at the specific skills losing marks — not more hours.</p>',
      },
      {
        q: 'Should I push my child harder?',
        a: '<p>Pressure tends to reduce performance rather than increase it, because anxiety consumes the working memory that multi-step mathematics needs. Steady interest, substantive questions and making it safe to report a bad practice score are more effective than intensity.</p>',
      },
      {
        q: 'How much should we spend on exam preparation?',
        a: '<p>That is your decision, but be sceptical of anything promising a guaranteed score increase — no honest provider can promise one, since the outcome depends on the student\'s starting point and the work they do. Look for something that diagnoses specific weaknesses rather than delivering generic content, and prefer trying it before committing.</p>',
      },
    ],
    softCta:
      'Si Math AI reports progress as mastery per skill rather than hours studied, which is also the more useful thing for a parent to be able to see.',
  },

  {
    slug: 'university-admission',
    group: 'guidance',
    topic: 'Admissions',
    icon: '🎓',
    title: 'How SAT, ACT and EST Scores Are Used in Admission',
    metaTitle: 'How SAT, ACT and EST Scores Are Used in University Admission',
    metaDescription:
      'How standardised mathematics scores fit into university admission: what a score does and does not decide, planning a test timeline, retaking, and why you must verify policy with each institution.',
    summary: 'What a score does and does not decide, how to plan a testing timeline, and why policy must be verified per institution.',
    lead: 'A score is one input among several, and admission policy varies more — and changes more often — than almost any other part of this process.',
    teaches: ['University admission', 'Standardised test planning', 'Application strategy'],
    takeaways: [
      'Verify requirements with each institution directly. Policies vary and change.',
      'A score is one input among several, not a verdict on an application.',
      'Plan your test dates backwards from application deadlines, leaving room to retake.',
      'Many students improve on a second sitting, particularly with a diagnosis from the first.',
      'Which exam matters depends on where you are applying — decide that first.',
    ],
    sections: [
      {
        h: 'Verify everything with the institution',
        body: `<p>This guide describes how standardised scores generally function in admission. It is not a substitute for the actual requirements of the universities you are applying to, and you should not treat it as one.</p>
<p>Admission policy varies by country, by institution, sometimes by faculty within an institution, and it changes — including which tests are accepted, whether they are required at all, how multiple sittings are treated, and what deadlines apply.</p>
<p><strong>Confirm the current requirements directly with each university you are considering, from their official admissions materials.</strong> This is the single most important sentence on this page. Second-hand information about admission policy is common, confidently stated, and frequently out of date.</p>`,
      },
      {
        h: 'What a score does and does not do',
        body: `<p>A standardised test score is one input among several. Depending on the institution, an application may also be assessed on school results, the strength of the curriculum taken, subject-specific requirements, personal statements, references, interviews, and portfolios or auditions where relevant.</p>
<p>Two practical consequences follow:</p>
<ul>
<li><strong>A strong score does not by itself secure admission,</strong> and a weaker one does not by itself prevent it. Both are weighed alongside everything else.</li>
<li><strong>The score's importance varies enormously.</strong> Some institutions weight it heavily, some lightly, some do not require it. Where it matters most is usually where a specific threshold applies — which is exactly the kind of detail to verify rather than assume.</li>
</ul>
<p>It is worth holding this in proportion during preparation. The exam deserves serious work; it does not deserve to be treated as the sole determinant of a future.</p>`,
      },
      {
        h: 'Which exam, for where',
        body: `<p>Start by establishing which examination is relevant to your actual plans, because this determines everything downstream.</p>
<ul>
<li><strong>Applying within Egypt.</strong> For many American Diploma students the EST is central to local university admission. Confirm what the specific universities require.</li>
<li><strong>Applying abroad.</strong> The SAT or ACT is more commonly relevant. Institutions accepting both usually state no preference — but verify.</li>
<li><strong>Both.</strong> Common, and it means planning two testing timelines rather than blending preparation. See <a href="learn-choosing-your-exam.html">choosing your exam</a>.</li>
</ul>
<p>Deciding this early prevents the most wasteful outcome in exam preparation: months of work aimed at the wrong test.</p>`,
      },
      {
        h: 'Planning your timeline backwards',
        body: `<p>Work backwards from your application deadlines, not forwards from today.</p>
<ol>
<li><strong>Find your application deadlines</strong> for each institution.</li>
<li><strong>Work back to the last usable test date,</strong> allowing for score release and reporting time — both take longer than students expect.</li>
<li><strong>Plan a first sitting earlier than that,</strong> leaving room for at least one retake.</li>
<li><strong>Work back further</strong> to set your preparation start, allowing enough time for diagnosis and targeted work rather than a compressed rush.</li>
</ol>
<p>The most common planning error is leaving only one possible test date. It removes the option to retake, and it converts an ordinary bad morning into an unrecoverable one. A schedule with room for a second sitting is worth considerably more than a few extra weeks of preparation.</p>`,
      },
      {
        h: 'Retaking',
        body: `<p>Many students score better on a second sitting, and there are unremarkable reasons why: the format is familiar, the conditions are no longer novel, pacing instincts are established, and — most usefully — the first sitting is itself an extremely good diagnostic.</p>
<p>To make a retake worthwhile, treat the first result as data. What went wrong: content, process, pacing, or nerves? Preparing again in the same way that produced the first score is unlikely to produce a different one.</p>
<p>Check how each institution treats multiple sittings before planning around it, since practice varies — some consider the highest single result, some consider all results, some combine section bests. This is institution-specific and worth confirming rather than assuming.</p>`,
      },
      {
        h: 'Keeping it in proportion',
        body: `<p>Admission processes are stressful, and a great deal of that stress comes from treating a single number as a verdict. It is not one. It is one input, in one process, at one moment — and students arrive at good universities through many different routes and with a wide range of scores.</p>
<p>Prepare seriously, plan the timeline properly, leave room to retake, and verify every requirement at the source. Those four things are within your control, and they are most of what matters.</p>`,
      },
    ],
    faqs: [
      {
        q: 'How important is the math score for university admission?',
        a: '<p>It varies enormously by institution — some weight standardised scores heavily, some lightly, some do not require them. It is one input alongside school results, curriculum strength, statements and references. Verify the weighting with the specific universities you are applying to.</p>',
      },
      {
        q: 'When should I take the exam?',
        a: '<p>Plan backwards from your application deadlines, allowing for score release and reporting, and schedule your first sitting early enough to leave room for a retake. Leaving only one possible test date removes your ability to recover from a bad morning.</p>',
      },
      {
        q: 'Should I retake the exam?',
        a: '<p>Often worthwhile — many students improve on a second sitting, helped by familiarity and by treating the first result as a diagnostic. It is only worthwhile if you prepare differently in response to what the first sitting revealed. Check how each institution treats multiple sittings first.</p>',
      },
      {
        q: 'Do universities require the SAT, ACT or EST?',
        a: '<p>It depends entirely on the institution and the country, and requirements change. This is the area where second-hand information is most often out of date — confirm directly from each university\'s official admissions materials rather than relying on general advice.</p>',
      },
    ],
    softCta:
      'Si Math AI covers SAT, ACT and EST Mathematics at equal depth, so a change of plan does not mean starting your preparation over.',
  },
];

export const TOTAL_GUIDES = GUIDES.length;
