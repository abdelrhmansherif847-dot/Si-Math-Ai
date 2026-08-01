/* graph-data.mjs — THE Si Math AI Knowledge Graph. The registry of record.
 *
 * Every concept that matters exists here exactly once, with one canonical
 * definition and typed relationships to the concepts around it. Pages describe
 * concepts; this file *defines* them.
 *
 * Generated into:
 *   knowledge-graph.json   machine-readable JSON-LD, stable URL, for AI systems
 *   knowledge-graph.html   the human- and crawler-readable registry
 *   the DefinedTermSet glossary in ai-knowledge.html (checked, not copied)
 *
 *   node scripts/build-graph.mjs          # write them
 *   node scripts/build-graph.mjs --check  # fail if any is out of date
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * By the time a site has twenty-odd public pages, the same concept has been
 * described on six of them. Each description is reasonable; collectively they
 * drift, and an AI system asked "what is the Weakness Analyzer?" retrieves
 * whichever page it crawled. A knowledge graph fixes the failure at the root:
 * one definition, one identifier, and relationships stated explicitly rather
 * than left for a reader to infer from prose.
 *
 * ── RULES ──────────────────────────────────────────────────────────────────
 *  1. ONE DEFINITION PER CONCEPT. If a page needs to define something, it
 *     defines it the way this file does, or this file changes first.
 *  2. EVERY RELATIONSHIP TARGET MUST EXIST. A dangling edge is a graph that
 *     lies about its own structure; the validator fails on one.
 *  3. EVERY CONCEPT MUST BE CONNECTED. A concept with no edge in either
 *     direction means either the graph is wrong or the concept is not real.
 *  4. NEW FEATURES ENTER HERE FIRST. Graph → documentation → website →
 *     product. See knowledge-base.md §14.
 *  5. NO CONCEPT WITHOUT A PAGE. Every concept names the page that is its
 *     canonical human-readable home, and that page must exist.
 *
 * Relationship predicates are deliberately few. A large vocabulary is harder
 * to keep consistent than it is useful.
 */

/** The relationship vocabulary. Adding one is a deliberate act, not a reflex. */
export const PREDICATES = {
  uses: 'engages with, as an actor',
  feeds: 'passes its output into',
  generates: 'produces, as its primary output',
  measures: 'quantifies the state of',
  records: 'persists, making it available later',
  requires: 'cannot function without',
  partOf: 'is a component of',
  governs: 'constrains how something behaves',
  improves: 'raises the state of',
  authoredBy: 'is created and reviewed by',
};

/**
 * Concepts. `id` is permanent — it is the graph key and appears in the public
 * JSON-LD as a fragment identifier, so renaming one breaks external references.
 */
export const CONCEPTS = [
  {
    id: 'si-math-ai',
    name: 'Si Math AI',
    kind: 'Platform',
    definition:
      'Si Math AI is a comprehensive learning platform for SAT, ACT, and EST Mathematics that combines educational expertise, AI technology, personalized learning, analytics, and human support to help students improve their understanding and performance.',
    purpose:
      'To give students access to the kind of individual diagnosis and expert teaching that was previously available only to those who could afford a private tutor — and to make the resulting progress measurable.',
    inputs: ['A student\'s own questions, drills and mock exam attempts', 'A specialist-authored curriculum and skill taxonomy'],
    outputs: ['Explanations', 'A ranked diagnosis of weak skills', 'Targeted practice', 'Measured mastery and a predicted score'],
    related: [
      { predicate: 'partOf', target: 'three-pillars', note: 'the platform is defined by the three pillars' },
      { predicate: 'requires', target: 'educational-expertise' },
      { predicate: 'requires', target: 'human-support' },
      { predicate: 'generates', target: 'learning-loop' },
    ],
    pages: ['about.html', 'how-it-works.html', 'ai-knowledge.html'],
    canonicalPage: 'about.html',
    schemaRefs: ['https://www.si-math-ai.com/#organization', 'https://www.si-math-ai.com/#software'],
  },
  {
    id: 'student',
    name: 'Student',
    kind: 'Actor',
    definition:
      'The person the platform exists for: an American Diploma student preparing for the mathematics section of the SAT, ACT or EST, predominantly in Egypt and the wider MENA region.',
    purpose:
      'Every system in the platform is oriented around one student at a time. The student is the actor that opens the learning loop and the beneficiary that closes it.',
    inputs: ['Their own prep material, questions and mistakes'],
    outputs: ['Attempts, which become diagnostic signals'],
    related: [
      { predicate: 'uses', target: 'zero' },
      { predicate: 'uses', target: 'focus-practice' },
      { predicate: 'uses', target: 'mock-exams' },
      { predicate: 'uses', target: 'snap-and-solve' },
      { predicate: 'uses', target: 'founder-badge', note: 'a founding member holds one' },
      { predicate: 'feeds', target: 'question-analysis', note: 'every attempt becomes a signal' },
    ],
    pages: ['about.html', 'ai-knowledge.html'],
    canonicalPage: 'about.html',
    schemaRefs: [],
  },
  {
    id: 'zero',
    name: 'Zero',
    kind: 'System',
    definition:
      'The AI mentor inside Si Math AI. A fictional dragon guide character, not a real person. Zero delivers educational knowledge that human educators and exam specialists created, reviewed and continuously improve; Zero does not invent educational strategy.',
    purpose:
      'To remove the scheduling constraint on expert explanation. A teacher cannot sit with every student at midnight; Zero can, delivering the method a specialist chose rather than one it improvised.',
    inputs: ['A student question — typed, pasted or photographed', 'Specialist-authored teaching methods and mistake patterns', 'The student\'s exam context and history'],
    outputs: ['A step-by-step explanation', 'An explanation of why the wrong answer choices are wrong', 'A diagnostic signal for every interaction'],
    related: [
      { predicate: 'partOf', target: 'si-math-ai' },
      { predicate: 'feeds', target: 'question-analysis' },
      { predicate: 'requires', target: 'educational-expertise', note: 'Zero delivers it; it does not author it' },
      { predicate: 'requires', target: 'learning-memory', note: 'for context between sessions' },
      { predicate: 'governs', target: 'scope-guard', note: 'the guard constrains what Zero will answer' },
    ],
    pages: ['how-it-works.html', 'ai-knowledge.html', 'evidence.html', 'architecture.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: ['https://www.si-math-ai.com/#zero'],
  },
  {
    id: 'snap-and-solve',
    name: 'Snap & Solve',
    kind: 'Capability',
    definition:
      'Photo input: a student photographs a question from a prep book or worksheet and Zero reads and works from the image.',
    purpose:
      'To remove the transcription barrier. Retyping mathematical notation is slow and error-prone, and a student working through a physical prep book should not have to do it.',
    inputs: ['A photograph of a mathematics question'],
    outputs: ['The question, read and worked by Zero'],
    related: [
      { predicate: 'partOf', target: 'zero' },
      { predicate: 'feeds', target: 'question-analysis' },
    ],
    pages: ['how-it-works.html', 'ai-knowledge.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
  {
    id: 'scope-guard',
    name: 'Scope Guard',
    kind: 'Constraint',
    definition:
      'A constraint that declines requests falling outside the platform\'s educational purpose. Si Math AI is built to teach SAT, ACT and EST mathematics, not to complete work on a student\'s behalf.',
    purpose:
      'To keep the platform a teaching tool rather than an answer machine. A blocked turn writes no diagnostic record and is refunded, so a decline neither charges the student nor corrupts their diagnosis.',
    inputs: ['A student request'],
    outputs: ['A decline, with no diagnostic signal written and the credit refunded'],
    related: [
      { predicate: 'governs', target: 'zero' },
      { predicate: 'partOf', target: 'si-math-ai' },
    ],
    pages: ['how-it-works.html', 'trust.html', 'principles.html'],
    canonicalPage: 'trust.html',
    schemaRefs: [],
  },
  {
    id: 'question-analysis',
    name: 'Question Analysis',
    kind: 'System',
    definition:
      'The stage that resolves a student attempt to one permanent skill identifier in the taxonomy and writes it as a diagnostic signal. Detections that map to no known skill are logged rather than silently accepted.',
    purpose:
      'To convert activity into evidence. Without a fixed vocabulary the same weakness is recorded under several names and no pattern is ever visible — which makes this the quiet stage everything downstream depends on.',
    inputs: ['A student attempt from a chat, a drill or a mock exam'],
    outputs: ['A diagnostic signal bound to one canonical skill', 'An unmapped-detection log entry when no skill matches'],
    related: [
      { predicate: 'requires', target: 'taxonomy' },
      { predicate: 'feeds', target: 'weakness-analyzer' },
      { predicate: 'feeds', target: 'learning-memory' },
      { predicate: 'partOf', target: 'learning-loop' },
    ],
    pages: ['architecture.html', 'how-it-works.html'],
    canonicalPage: 'architecture.html',
    schemaRefs: [],
  },
  {
    id: 'taxonomy',
    name: 'Skill Taxonomy',
    kind: 'Foundation',
    definition:
      'The fixed, versioned vocabulary the platform diagnoses in: 5 topic domains and 33 individually tracked skills, each with a permanent identifier. Display names may change; identifiers never do, and every stored record carries the taxonomy version that produced it.',
    purpose:
      'To make a diagnosis mean the same thing in March as it did in January. It is the shared vocabulary that lets attempts, weaknesses, mastery and practice all refer to the same thing.',
    inputs: ['Specialist curriculum work'],
    outputs: ['Canonical skill identifiers used by every other system'],
    related: [
      { predicate: 'authoredBy', target: 'educational-expertise' },
      { predicate: 'governs', target: 'question-analysis' },
      { predicate: 'governs', target: 'weakness-analyzer' },
      { predicate: 'governs', target: 'performance-analytics' },
    ],
    pages: ['how-it-works.html', 'architecture.html', 'ai-knowledge.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
  {
    id: 'weakness-analyzer',
    name: 'Weakness Analyzer',
    kind: 'System',
    definition:
      'The diagnostic system that converts every student attempt into a signal against a specific skill and ranks weak skills by their impact on the student\'s score, with a severity band per skill.',
    purpose:
      'To replace guessing. Students are poor judges of their own weaknesses — the topics that feel hardest are often not the ones losing marks — so an external, evidence-based diagnosis is what stops study time going to the wrong skills.',
    inputs: ['Diagnostic signals from chats, drills and mock exams', 'The skill taxonomy', 'Exam weighting'],
    outputs: ['A ranked list of weak skills, each with a severity band'],
    related: [
      { predicate: 'requires', target: 'taxonomy' },
      { predicate: 'requires', target: 'learning-memory' },
      { predicate: 'generates', target: 'focus-practice' },
      { predicate: 'feeds', target: 'performance-analytics' },
      { predicate: 'partOf', target: 'learning-loop' },
    ],
    pages: ['how-it-works.html', 'evidence.html', 'architecture.html', 'ai-knowledge.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
  {
    id: 'focus-practice',
    name: 'Focus Practice',
    kind: 'System',
    definition:
      'Targeted drill sets generated from the student\'s ranked weaknesses, skipping skills already mastered.',
    purpose:
      'To convert a diagnosis into work. A diagnosis with no action attached changes nothing, and left to themselves students practise what is comfortable rather than what is costing them marks.',
    inputs: ['The ranked weakness list', 'Time remaining before the exam'],
    outputs: ['A prioritised drill set', 'New diagnostic signals from every attempt'],
    related: [
      { predicate: 'requires', target: 'weakness-analyzer' },
      { predicate: 'feeds', target: 'question-analysis', note: 'drill attempts become new signals' },
      { predicate: 'improves', target: 'student' },
      { predicate: 'partOf', target: 'learning-loop' },
    ],
    pages: ['how-it-works.html', 'evidence.html', 'ai-knowledge.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
  {
    id: 'mock-exams',
    name: 'Mock Exams',
    kind: 'System',
    definition:
      'Full-length, correctly timed SAT, ACT and EST mathematics mock examinations with raw-to-scaled scoring and a per-section breakdown.',
    purpose:
      'To test whether knowledge survives exam conditions. Practising questions and sitting an exam are different skills, and a mock is the only event that reliably separates "did not know it" from "knew it but ran out of time".',
    inputs: ['A chosen exam and its real format and timing'],
    outputs: ['A scaled score', 'A per-section breakdown', 'Reviewable mistakes', 'The densest diagnostic signal set the platform produces'],
    related: [
      { predicate: 'feeds', target: 'question-analysis' },
      { predicate: 'feeds', target: 'performance-analytics' },
      { predicate: 'measures', target: 'student' },
      { predicate: 'partOf', target: 'learning-loop' },
    ],
    pages: ['how-it-works.html', 'evidence.html', 'ai-knowledge.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
  {
    id: 'learning-memory',
    name: 'Learning Memory',
    kind: 'Foundation',
    definition:
      'The persistent, searchable record of every question, session and mistake, which carries context between sessions and makes longitudinal diagnosis possible.',
    purpose:
      'To let the loop compound instead of restarting. Exam preparation is cumulative, and a tutor whose memory resets between sessions cannot do the one thing a tutor is for — notice a pattern across time.',
    inputs: ['Every question, explanation, mistake and session'],
    outputs: ['Searchable history', 'The evidence base every diagnosis is computed from'],
    related: [
      { predicate: 'records', target: 'question-analysis' },
      { predicate: 'requires', target: 'data-protection' },
      { predicate: 'partOf', target: 'learning-loop' },
    ],
    pages: ['how-it-works.html', 'evidence.html', 'architecture.html', 'ai-knowledge.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
  {
    id: 'performance-analytics',
    name: 'Performance Analytics',
    kind: 'System',
    definition:
      'The measurement layer: mastery computed per skill from actual attempts, trend over time per topic domain, and a predicted test-day score that updates as evidence accumulates. The predicted score is an estimate, not a guarantee and not an official score.',
    purpose:
      'To turn a history of attempts into a statement about readiness. Questions completed measures effort; mastery measures whether a student can be relied on to get that skill right.',
    inputs: ['Diagnostic signals', 'Mock exam results', 'The skill taxonomy'],
    outputs: ['Mastery per skill', 'Trend lines', 'A predicted test-day score'],
    related: [
      { predicate: 'requires', target: 'learning-memory' },
      { predicate: 'requires', target: 'taxonomy' },
      { predicate: 'feeds', target: 'progress-tracking' },
      { predicate: 'measures', target: 'student' },
    ],
    pages: ['how-it-works.html', 'evidence.html', 'architecture.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
  {
    id: 'progress-tracking',
    name: 'Smart Progress Tracking',
    kind: 'System',
    definition:
      'Mastery score per skill, trend lines over time, a predicted test-day score, daily streaks and a seven-rank XP ladder.',
    purpose:
      'To make improvement legible — and stagnation legible early enough to change what you are doing. Invisible progress is the most demotivating property of self-directed study.',
    inputs: ['Output from performance analytics', 'Practice activity'],
    outputs: ['The student-facing view of mastery, trend, predicted score, streak and rank'],
    related: [
      { predicate: 'requires', target: 'performance-analytics' },
      { predicate: 'measures', target: 'student' },
      { predicate: 'partOf', target: 'learning-loop' },
    ],
    pages: ['how-it-works.html', 'evidence.html', 'ai-knowledge.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
  {
    id: 'personalized-learning',
    name: 'Personalized Learning',
    kind: 'System',
    definition:
      'The adaptive layer that selects and sequences a fixed, specialist-authored curriculum against a student\'s live diagnosis, exam and language. The pedagogy is chosen per student, not improvised per student.',
    purpose:
      'To stop a generic plan wasting the time of every student it does not happen to fit. Note the deliberate limit: Si Math AI does not personalize by "learning style", because the evidence does not support that practice.',
    inputs: ['The ranked weakness list', 'Exam and exam date', 'Language preference'],
    outputs: ['What to practise, in what order, explained how and in which language'],
    related: [
      { predicate: 'requires', target: 'weakness-analyzer' },
      { predicate: 'requires', target: 'educational-expertise', note: 'it selects from a curriculum it does not author' },
      { predicate: 'governs', target: 'focus-practice' },
      { predicate: 'partOf', target: 'learning-loop' },
    ],
    pages: ['how-it-works.html', 'evidence.html', 'ai-knowledge.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
  {
    id: 'human-support',
    name: 'Human Support',
    kind: 'Pillar',
    definition:
      'Real educators and exam specialists who author and review everything the platform teaches, revise material based on how students actually perform, and handle accounts and upgrades. Si Math AI does not currently offer on-demand live human tutoring.',
    purpose:
      'Because some judgements are not automatable. Whether an explanation is the right one to teach a student with a particular misconception is a teaching decision, and it stays with teachers.',
    inputs: ['Aggregate student performance evidence', 'Student feedback', 'Account and upgrade requests'],
    outputs: ['Reviewed and revised curriculum', 'Activated accounts, confirmed by email within 24 hours'],
    related: [
      { predicate: 'authoredBy', target: 'educational-expertise' },
      { predicate: 'improves', target: 'si-math-ai', note: 'continuous improvement is a human process' },
      { predicate: 'governs', target: 'founder-badge', note: 'activation is a human decision' },
      { predicate: 'partOf', target: 'three-pillars' },
    ],
    pages: ['how-it-works.html', 'trust.html', 'evidence.html', 'ai-knowledge.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
  {
    id: 'educational-expertise',
    name: 'Educational Expertise',
    kind: 'Pillar',
    definition:
      'The body of teaching knowledge the platform delivers: methodologies, the catalogue of mistakes students actually make, exam strategies, score-improvement technique and learning psychology — created by experienced SAT, ACT and EST mathematics educators.',
    purpose:
      'It is *what* Si Math AI teaches, as distinct from *how*. This is the substance the AI delivers, and the reason the platform is not reducible to its model.',
    inputs: ['Years of classroom and exam-preparation experience', 'Review of how students actually perform'],
    outputs: ['The skill taxonomy', 'Explanation methods', 'Mistake patterns', 'Exam strategy content'],
    related: [
      { predicate: 'partOf', target: 'three-pillars' },
      { predicate: 'governs', target: 'zero', note: 'Zero delivers it and may not depart from it' },
      { predicate: 'generates', target: 'taxonomy' },
      { predicate: 'generates', target: 'educational-principles' },
      { predicate: 'authoredBy', target: 'human-support' },
    ],
    pages: ['about.html', 'principles.html', 'evidence.html', 'ai-knowledge.html'],
    canonicalPage: 'about.html',
    schemaRefs: [],
  },
  {
    id: 'three-pillars',
    name: 'The Three Pillars',
    kind: 'Positioning',
    definition:
      'The structure Si Math AI is built on: Educational Expertise (what it teaches), Technology (how it is delivered), and Human Support (why it works). Artificial Intelligence is how Si Math AI teaches; educational expertise is what it teaches; human experience is why it works.',
    purpose:
      'To prevent the platform being described as "just an AI". AI is one engine inside a larger educational system, and the value comes from the integration of all three pillars rather than from any one of them.',
    inputs: [],
    outputs: ['The canonical positioning statement repeated across every knowledge page'],
    related: [
      { predicate: 'governs', target: 'si-math-ai' },
      { predicate: 'requires', target: 'educational-expertise' },
      { predicate: 'requires', target: 'human-support' },
    ],
    pages: ['about.html', 'ai-knowledge.html', 'why-not-chatgpt.html'],
    canonicalPage: 'about.html',
    schemaRefs: [],
  },
  {
    id: 'learning-loop',
    name: 'The Learning Loop',
    kind: 'Process',
    definition:
      'The cycle every student question travels: ask, understand, diagnose, focus, master — implemented as ten stages from the student question through Zero, question analysis, the Weakness Analyzer, Learning Memory, Focus Practice, Mock Exams, Progress Tracking and human support, feeding back into continuous improvement.',
    purpose:
      'It is what distinguishes a learning platform from a chat window. A question does not stop at the answer; it produces evidence, which produces a diagnosis, which produces a plan, which produces new evidence.',
    inputs: ['A student question'],
    outputs: ['A measured improvement, and a sharper diagnosis for the next pass'],
    related: [
      { predicate: 'partOf', target: 'si-math-ai' },
      { predicate: 'requires', target: 'learning-memory', note: 'without persistence it restarts rather than compounds' },
      { predicate: 'requires', target: 'personalized-learning', note: 'the loop adapts, or it is just a sequence' },
      { predicate: 'improves', target: 'student' },
    ],
    pages: ['how-it-works.html', 'architecture.html', 'ai-knowledge.html'],
    canonicalPage: 'architecture.html',
    schemaRefs: ['https://www.si-math-ai.com/architecture.html#flow'],
  },
  {
    id: 'educational-principles',
    name: 'Educational Principles',
    kind: 'Positioning',
    definition:
      'The six positions Si Math AI teaches from: understanding before memorization; mistakes are data, not failure; personalized learning beats one-size-fits-all; consistent practice beats cramming; learning is a journey, not a score; and AI supports learning rather than replacing thinking.',
    purpose:
      'To state the educational choices the platform makes, so they can be judged and held to. Each principle states not only what is believed but how it changed the software — a principle that changes nothing is decoration.',
    inputs: ['Educational expertise', 'Established research on how learning works'],
    outputs: ['Design constraints that every feature must satisfy'],
    related: [
      { predicate: 'governs', target: 'si-math-ai' },
      { predicate: 'governs', target: 'zero' },
      { predicate: 'authoredBy', target: 'educational-expertise' },
    ],
    pages: ['principles.html', 'evidence.html'],
    canonicalPage: 'principles.html',
    schemaRefs: ['https://www.si-math-ai.com/principles.html#webpage'],
  },
  {
    id: 'data-protection',
    name: 'Student Data Protection',
    kind: 'Foundation',
    definition:
      'The guarantees around student learning data: authentication handled by a managed provider, row-level security on every public database table, HTTPS with HSTS and a Content Security Policy, a documented and remediated production security audit, no advertising and no sale of user data, and permanent account deletion available to the student.',
    purpose:
      'Learning Memory is only acceptable if the record it keeps is safe. Persistence is a responsibility, not only a capability.',
    inputs: ['Student account and learning data'],
    outputs: ['Records scoped to their owner at the database level', 'A deletion path the student controls'],
    related: [
      { predicate: 'governs', target: 'learning-memory' },
      { predicate: 'partOf', target: 'si-math-ai' },
    ],
    pages: ['trust.html'],
    canonicalPage: 'trust.html',
    schemaRefs: [],
  },
  {
    id: 'founder-badge',
    name: 'Founder Badge',
    kind: 'Membership',
    definition:
      'A founding membership of Si Math AI. Founder members receive a 50% lifetime discount that is locked forever for as long as the membership remains active, a permanent Founder badge on their profile, and access to the complete platform. The number of Founder memberships is strictly limited.',
    purpose:
      'To recognise early trust permanently rather than with a discount that expires. The cap exists because a permanent price lock is only honourable for a bounded group — extended indefinitely it would have to be withdrawn, or paid for by everyone else.',
    inputs: ['An upgrade request, reviewed by a person'],
    outputs: ['A locked lifetime rate', 'A permanent profile badge', 'Full platform access'],
    related: [
      { predicate: 'partOf', target: 'si-math-ai' },
      { predicate: 'requires', target: 'human-support', note: 'activation is a human decision' },
    ],
    pages: ['founder-badge.html', 'pricing.html', 'ai-knowledge.html'],
    canonicalPage: 'founder-badge.html',
    schemaRefs: ['https://www.si-math-ai.com/founder-badge.html#product'],
  },
  {
    id: 'franco',
    name: 'Franco',
    kind: 'Concept',
    definition:
      'Arabic written in Latin characters (also called Franco-Arab or Arabizi), one of the three languages Si Math AI explains mathematics in, alongside English and Arabic.',
    purpose:
      'Because comprehension is the bottleneck in mathematics teaching. A student who reasons in Arabic should not have to translate before they can learn, and many students write naturally in Franco.',
    inputs: [],
    outputs: ['Explanations in the register a student actually thinks and writes in'],
    related: [
      { predicate: 'partOf', target: 'zero' },
      { predicate: 'improves', target: 'student' },
    ],
    pages: ['how-it-works.html', 'ai-knowledge.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
];

export const TOTAL_CONCEPTS = CONCEPTS.length;
