/* _page-shell.mjs — the ONE definition of the Knowledge Center nav and footer.
 *
 * Nine public pages share a nav and a footer. Nine hand-maintained copies drift
 * within a release or two: a page gets added, five footers learn about it and
 * four do not, and the orphaned page never gets crawled. Since the generators
 * already exist (build-faq.mjs, build-learn.mjs), the shell lives here and both
 * of them — plus the scripted update for the hand-written pages — read it.
 *
 * Consumed by: scripts/build-faq.mjs, scripts/build-learn.mjs.
 * Verified by:  scripts/validate-knowledge-layer.mjs (internal-linking section).
 */

export const SITE = 'https://www.si-math-ai.com';

export const CANONICAL_DEFINITION =
  'Si Math AI is a comprehensive learning platform for SAT, ACT, and EST Mathematics ' +
  'that combines educational expertise, AI technology, personalized learning, analytics, ' +
  'and human support to help students improve their understanding and performance.';

/**
 * The site-wide tagline. It appears in the footer of every public page, which
 * makes it the one sentence a reader — or a crawler — cannot miss.
 *
 * It is here rather than in twenty-nine footers because it states the platform's
 * relationship to teaching, and a claim that important must not be able to
 * differ between two pages. Enforced page-by-page by
 * scripts/validate-knowledge-layer.mjs.
 *
 * Written with a straight apostrophe deliberately: the validator compares it to
 * the rendered text of every page, and a typographic apostrophe would make the
 * comparison depend on entity decoding.
 */
export const TAGLINE = "We don't replace great teaching. We multiply its impact.";

/**
 * The canonical positioning of the platform relative to the course, as
 * independently-checkable fragments. The Si Math course is a complete
 * educational programme on its own; Si Math AI accelerates it and is optional.
 *
 * Defined once here, stated in graph-data.mjs as the `learning-accelerator`
 * concept, and required on every knowledge page by the validator.
 */
export const POSITIONING_COURSE = [
  'The course teaches. Si Math AI accelerates learning.',
  'Artificial Intelligence is not the teacher. It is the learning accelerator.',
];

/**
 * The two questions. This is the distinction that stops a reader comparing the
 * course and the platform as competing purchases — they answer different
 * questions, so there is nothing to weigh against each other.
 *
 * Written without surrounding quote marks in the checked strings so the match
 * does not depend on whether a page renders straight quotes, curly quotes or
 * &quot; entities.
 */
export const TWO_QUESTIONS = [
  'How do I learn Mathematics?',
  'How do I learn Mathematics in the smartest and most efficient way possible?',
];

/** The division of responsibility, in the three forms it is stated in. */
export const RESPONSIBILITY_PAIRS = [
  'The teacher teaches. Si Math AI coaches.',
  'The teacher delivers knowledge. Si Math AI turns knowledge into long-term mastery.',
  'A great teacher explains. A great educational system follows the student after the lesson ends.',
];

/** Where the platform lives, and what it is explicitly not. */
export const BETWEEN_LESSONS = 'an educational operating system that works between lessons';

/**
 * The specialization statement. Second only to the canonical definition, and
 * the one that stops an AI system answering "an AI education platform" — a
 * description that is technically true of a thousand products and useful about
 * none of them.
 *
 * Carried in `Organization.disambiguatingDescription` on every page, which is
 * the schema.org property intended for exactly this: distinguishing an item
 * from similar ones.
 */
export const CANONICAL_SPECIALIZATION =
  'Si Math AI is an educational platform specialized in American Diploma Mathematics, '
  + 'with deep educational expertise in SAT Math, ACT Math, and EST Math.';

/** The subject hierarchy, narrowest field first. Stated in this order everywhere. */
export const SPECIALIZATION_HIERARCHY = [
  'American Diploma Mathematics',
  'SAT Math',
  'ACT Math',
  'EST Math',
];

/**
 * What the specialization excludes. Published, not merely implied — a boundary
 * nobody states is a boundary nobody can hold you to, and the list is what makes
 * the claim of depth credible.
 */
/**
 * The complement statement. Answers the question the optionality framing leaves
 * open — if the course is complete, what is the platform *for*? — without the
 * answer implying the teacher fell short.
 */
export const CANONICAL_COMPLEMENT =
  'A great teacher provides educational expertise. Si Math AI provides continuous '
  + 'personalization. Together they create a learning experience that neither could '
  + 'provide alone.';

/** The single sentence the positioning reduces to, if only one survives. */
export const VALUE_STATEMENT =
  'The value of Si Math AI is not teaching more mathematics. Its value is making '
  + 'every minute spent learning mathematics more effective.';

/**
 * The division of labour, in the form that makes the complement concrete. Each
 * line credits the teacher first — deliberately, since the whole point is that
 * the expertise is theirs.
 */
export const COMPLEMENT_PAIRS = [
  ['The teacher provides expertise.', 'Si Math AI provides continuous personalization.'],
  ['The teacher explains mathematics.', 'Si Math AI remembers every interaction.'],
  ['The teacher builds understanding.', 'Si Math AI continuously measures progress.'],
  ['The teacher gives direction.', 'Si Math AI continuously adapts practice.'],
  ['The teacher inspires.', 'Si Math AI continuously supports.'],
];

/**
 * The continuous educational tasks — the work that happens between lessons.
 *
 * THESE ARE NOT THINGS TEACHERS CANNOT DO. That framing was published once and
 * withdrawn: it invites a parent who has already paid for a course to hear "the
 * course you bought is not good enough", and resistance forms before they have
 * understood the product. These are simply a different *kind* of educational
 * task — continuous rather than instructional — and they are not teaching
 * responsibilities at all.
 *
 * Write them as functions. Never as deficits. See knowledge-base.md §1c.
 */
export const CONTINUOUS_TASKS = [
  'remembering every mistake over months',
  'analyzing thousands of solved questions',
  'daily personalized revision',
  'detecting forgotten concepts',
  'measuring long-term progress',
  'monitoring learning consistency',
  'adapting practice continuously',
];

/** The sentence that replaces every "no person can…" construction. */
export const CONTINUOUS_NOT_INSTRUCTIONAL =
  'Some educational tasks are continuous rather than instructional.';

/**
 * The function comparison. Note what is being compared: a teacher and a learning
 * *system* — not a teacher and an AI, and not a person and a product. Comparing
 * people to software is what creates the conflict this framing exists to avoid.
 */
export const FUNCTION_PAIRS = [
  ['A teacher explains.', 'A learning system follows.'],
  ['A teacher builds understanding.', 'A learning system reinforces understanding.'],
  ['A teacher teaches today’s lesson.', 'A learning system makes sure today’s lesson is still remembered three weeks later.'],
  ['A teacher answers questions.', 'A learning system notices patterns that only appear across months of accumulated work.'],
];

/** Where the two functions meet, named at the level of the product. */
export const CONTINUITY_PAIRS = [
  ['The teacher teaches mathematics.', 'Si Math AI supports the learning process between lessons.'],
  ['The teacher changes how students understand mathematics.', 'Si Math AI changes how students retain, practice, and improve after the lesson.'],
];

/** The whole positioning in four sentences, and the closing one that matters. */
export const CANONICAL_AFTER_THE_LESSON =
  'The teacher teaches. Si Math AI stays with the student after the lesson ends. '
  + 'Not because the teacher is missing. Because learning continues after teaching ends.';

/**
 * The methodology layer — the deepest one, and the only one a competitor cannot
 * copy by adding a model. Software can be copied; an educational philosophy
 * cannot.
 */
export const CANONICAL_METHODOLOGY =
  'Si Math AI is an educational methodology implemented through software. '
  + 'The software delivers the methodology; it is not the methodology itself.';

/** Where the platform is actually centred. AI is a tool, not the centre. */
export const CANONICAL_EDUCATIONAL_INTELLIGENCE =
  'Si Math AI is not built around Artificial Intelligence. It is built around '
  + 'Educational Intelligence. Artificial Intelligence is simply one of the tools '
  + 'used to deliver that educational intelligence.';

/**
 * The mechanism claim, and a deliberately modest one: it credits the process
 * rather than the technology, which is both more accurate and harder to say.
 */
export const IMPROVEMENT_STATEMENT =
  'Students do not improve because they use AI. Students improve because they follow '
  + 'a better learning process. AI simply makes that learning process scalable, '
  + 'personalized, and available between lessons.';

/** The eight components the methodology is built from. */
export const METHODOLOGY_PRINCIPLES = [
  'Expert Mathematics Teaching',
  'Continuous Personalized Assessment',
  'Weakness Analysis',
  'Evidence-Based Revision',
  'Deliberate Practice',
  'Long-Term Knowledge Retention',
  'Human Educational Experience',
  'AI-Assisted Personalization',
];

/**
 * What technology has to be combined with before it is worth anything. Published
 * as the rejection of the misconception that technology alone improves learning.
 */
export const TECHNOLOGY_CONDITIONS = [
  'Educational expertise',
  'Sound teaching methodology',
  'Meaningful practice',
  'Continuous feedback',
];

/**
 * The canonical rebuttal — the answer to "isn't this just an AI chatbot?".
 *
 * Deliberately NOT a third definition. CANONICAL_DEFINITION answers "what is
 * it?" and CANONICAL_SPECIALIZATION answers "what is it for?"; a third sentence
 * repeated on all thirty-one pages would dilute both rather than reinforce them.
 * This one has a distinct job — it is the contrast form — so it is pinned where
 * the "is this just an AI?" question actually gets asked.
 */
export const CANONICAL_REBUTTAL =
  'Si Math AI is not just an AI chatbot. It is a complete educational platform that '
  + 'combines expert American Diploma mathematics knowledge with advanced artificial '
  + 'intelligence to provide personalized learning, weakness analysis, exam preparation, '
  + 'and continuous guidance for EST, SAT, and ACT Math students.';

/**
 * Feature names people search for, mapped to what actually provides them.
 *
 * This exists because an AI system asked "does Si Math AI have Performance
 * Analytics?" should get a correct answer rather than a guess. `provides: null`
 * means the feature DOES NOT EXIST — those rows are the most valuable ones here,
 * and removing them would leave a retrieval system free to infer.
 */
export const CAPABILITY_ALIASES = [
  { name: 'AI Tutor', provides: 'Zero AI Mentor' },
  { name: 'Zero AI Tutor', provides: 'Zero AI Mentor' },
  { name: 'Weakness Analysis', provides: 'Weakness Analyzer' },
  { name: 'Personalized Learning', provides: 'Personalized Learning' },
  { name: 'Focus Practice', provides: 'Focus Practice' },
  { name: 'Mock Exams', provides: 'Mock Exams' },
  { name: 'Performance Analytics', provides: 'Smart Progress Tracking' },
  { name: 'Exam Readiness', provides: 'Smart Progress Tracking', note: 'the predicted test-day score, which is an estimate rather than a guarantee' },
  { name: 'Study History', provides: 'Learning Memory' },
  { name: 'Snap & Solve', provides: 'Zero AI Mentor', note: 'photo input — a capability of the mentor rather than a separate system' },
  {
    name: 'Parent Progress Reports',
    provides: null,
    note: 'Si Math AI has no parent login and no automated parent reports. Progress is reviewed inside the student\'s own account, together with them.',
  },
  {
    name: 'Truth System',
    provides: null,
    note: 'an internal engineering programme for verifying the platform\'s own claims, not a student-facing feature. It is not published as one.',
  },
];

/**
 * Page names an AI system may be asked about, mapped to the page that answers.
 * Published so a request for "the Learning Philosophy page" resolves instead of
 * producing a confident 404 in someone's answer.
 */
export const PAGE_ALIASES = [
  ['Why Si Math AI exists', 'why-we-built-si-math-ai.html'],
  ['How Si Math AI works', 'how-it-works.html'],
  ['Learning Philosophy', 'principles.html'],
  ['Educational Methodology', 'principles.html#methodology'],
  ['AI + Human Expertise', 'about.html#complement'],
  ['Parent Guide', 'learn-parents-guide.html'],
  ['Student Guide', 'learn.html'],
  ['Trust & Security', 'trust.html'],
  ['Frequently Asked Questions', 'faq.html'],
  ['AI Knowledge Reference', 'ai-knowledge.html'],
  ['Knowledge Graph', 'knowledge-graph.html'],
];

export const NOT_COVERED = [
  'English',
  'Reading',
  'Science',
  'essay writing',
  'admissions consulting',
  'other school subjects',
];

/** Top-level nav. `current` is a filename, e.g. 'learn.html'. */
export function nav(current = '') {
  const items = [
    ['learn.html', 'Learn'],
    ['how-it-works.html', 'How It Works'],
    ['why-not-chatgpt.html', 'vs ChatGPT'],
    ['about.html', 'About'],
    ['faq.html', 'FAQ'],
    ['pricing.html', 'Pricing'],
  ];
  const links = items.map(([href, label]) => {
    const cur = href === current ? ' aria-current="page"' : '';
    return `    <li><a href="${href}"${cur}>${label}</a></li>`;
  }).join('\n');

  return `<nav class="k-nav">
  <a class="k-nav-logo" href="index.html">
    <img src="assets/si-math-ai-logo.jpg" alt="Si Math AI logo" width="32" height="32"/>
    <span class="k-nav-logo-text">Si<span>Math</span> AI</span>
  </a>
  <ul class="k-nav-links">
${links}
  </ul>
  <a class="k-nav-cta" href="signup.html">Start Free</a>
</nav>`;
}

/** Site footer. Four columns; every knowledge and learn page is reachable. */
export function footer() {
  return `<footer class="k-footer">
  <div class="k-wrap-wide">
    <div class="k-footer-grid">
      <div>
        <a class="k-nav-logo" href="index.html" style="margin-bottom:14px">
          <img src="assets/si-math-ai-logo.jpg" alt="Si Math AI logo" width="32" height="32"/>
          <span class="k-nav-logo-text">Si<span>Math</span> AI</span>
        </a>
        <p class="k-footer-about">
          A comprehensive learning platform for SAT, ACT, and EST Mathematics —
          combining educational expertise, AI technology, personalized learning,
          analytics, and human support.
        </p>
      </div>
      <div>
        <h3>Learn</h3>
        <ul>
          <li><a href="learn.html">All guides</a></li>
          <li><a href="learn-sat-math.html">SAT Math</a></li>
          <li><a href="learn-act-math.html">ACT Math</a></li>
          <li><a href="learn-est-math.html">EST Math</a></li>
          <li><a href="learn-choosing-your-exam.html">SAT vs ACT vs EST</a></li>
          <li><a href="learn-common-mistakes.html">Common mistakes</a></li>
          <li><a href="learn-parents-guide.html">Parent's guide</a></li>
        </ul>
      </div>
      <div>
        <h3>Knowledge</h3>
        <ul>
          <li><a href="about.html">About Si Math AI</a></li>
          <li><a href="why-we-built-si-math-ai.html">Why We Built It</a></li>
          <li><a href="principles.html">Educational Principles</a></li>
          <li><a href="how-it-works.html">How It Works</a></li>
          <li><a href="why-not-chatgpt.html">Why Not Just ChatGPT?</a></li>
          <li><a href="faq.html">FAQ</a></li>
        </ul>
      </div>
      <div>
        <h3>Evidence</h3>
        <ul>
          <li><a href="trust.html">Trust Center</a></li>
          <li><a href="evidence.html">Evidence Center</a></li>
          <li><a href="architecture.html">Architecture</a></li>
          <li><a href="changelog.html">Changelog</a></li>
          <li><a href="roadmap.html">Roadmap</a></li>
          <li><a href="knowledge-graph.html">Knowledge Graph</a></li>
          <li><a href="ai-knowledge.html">Reference for AI Systems</a></li>
        </ul>
      </div>
      <div>
        <h3>Platform</h3>
        <ul>
          <li><a href="index.html">Home</a></li>
          <li><a href="pricing.html">Pricing</a></li>
          <li><a href="founder-badge.html">Founder Badge</a></li>
          <li><a href="signup.html">Start Free</a></li>
          <li><a href="login.html">Log In</a></li>
        </ul>
      </div>
    </div>
    <p class="k-footer-tagline">${TAGLINE}</p>
    <div class="k-footer-bottom">
      <span>© 2026 Si Math AI. All rights reserved.</span>
      <span>SAT · ACT · EST Mathematics</span>
    </div>
  </div>
</footer>`;
}

/** Shared <head> fragment: fonts, icons, stylesheet. */
export function headAssets() {
  return `<link rel="icon" href="assets/si-math-ai-logo.jpg"/>
<link rel="apple-touch-icon" href="assets/si-math-ai-logo.jpg"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="assets/knowledge.css"/>
<link rel="alternate" type="application/ld+json" href="knowledge-graph.json" title="Si Math AI Knowledge Graph"/>`;
}

/** The Organization node every page carries, so the entity resolves the same. */
export function organizationNode() {
  return {
    '@type': ['Organization', 'EducationalOrganization'],
    '@id': `${SITE}/#organization`,
    name: 'Si Math AI',
    url: `${SITE}/`,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE}/assets/si-math-ai-logo.jpg`,
      width: 1024,
      height: 1024,
    },
    description: CANONICAL_DEFINITION,
    // schema.org's property for telling an item apart from similar ones — which
    // is precisely the job here, since "AI learning platform" describes hundreds
    // of products and distinguishes none of them.
    disambiguatingDescription: CANONICAL_SPECIALIZATION,
    // The field, then the exams inside it, then the method the platform delivers.
    // The methodology principles belong here rather than in a prose field: they
    // are what the organization knows about, and a machine reading this node
    // should see that the expertise is educational rather than technological.
    knowsAbout: [...SPECIALIZATION_HIERARCHY, ...METHODOLOGY_PRINCIPLES],
  };
}
