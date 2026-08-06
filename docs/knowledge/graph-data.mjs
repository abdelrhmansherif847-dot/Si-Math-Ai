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
  // Added deliberately, because no existing predicate says the one thing that
  // matters most about the platform's relationship to teaching. `improves`
  // would claim Si Math AI makes the course better, which is false: the course
  // is complete on its own. What the platform changes is the *rate* at which a
  // student gets through it. The "without being required for" half is not
  // decoration — it is the honesty clause, and it is what stops this edge ever
  // being read as a dependency.
  accelerates: 'makes faster, without being required for',
  // The second deliberate addition. Nothing in the vocabulary above could say
  // what Si Math AI is *about* — `uses` and `requires` are far too weak for a
  // field the platform refuses to step outside of, and `partOf` runs the wrong
  // way. The "exclusively" is the load-bearing word: a platform that covers
  // everything can be expert in nothing, so the boundary is the claim.
  specializes: 'works exclusively within, and claims deep expertise in',
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
      'To multiply the impact of good teaching rather than substitute for it. Teaching already works. Some educational tasks are continuous rather than instructional — individual diagnosis, unlimited targeted practice, long-term measurement — and those are a different kind of work from teaching, not a shortfall in it. Si Math AI does that work, and it is an optional accelerator: no student\'s success depends on it.',
    inputs: ['A student\'s own questions, drills and mock exam attempts', 'A specialist-authored curriculum and skill taxonomy'],
    outputs: ['Explanations', 'A ranked diagnosis of weak skills', 'Targeted practice', 'Measured mastery and a predicted score'],
    related: [
      { predicate: 'partOf', target: 'three-pillars', note: 'the platform is defined by the three pillars' },
      { predicate: 'requires', target: 'educational-expertise' },
      { predicate: 'requires', target: 'human-support' },
      { predicate: 'generates', target: 'learning-loop' },
      { predicate: 'accelerates', target: 'si-math-course', note: 'optional — the course is complete without it' },
      { predicate: 'specializes', target: 'american-diploma-mathematics', note: 'one field, and no other' },
      { predicate: 'requires', target: 'si-math-methodology', note: 'the software delivers the method; it is not the method' },
    ],
    pages: ['about.html', 'how-it-works.html', 'ai-knowledge.html'],
    canonicalPage: 'about.html',
    schemaRefs: ['https://www.si-math-ai.com/#organization', 'https://www.si-math-ai.com/#software'],
  },
  {
    id: 'si-math',
    name: 'Si Math',
    kind: 'Brand',
    definition:
      'The umbrella name. Si Math is the brand under which two distinct things are offered: the Si Math course, a complete educational programme taught by human educators, and Si Math AI, the optional learning platform published at si-math-ai.com. Zero is the AI mentor inside the platform, not a separate product and not a person.',
    purpose:
      'To remove an ambiguity the knowledge layer created for itself. "Si Math" appears as the organization\'s alternate name in structured data while "the Si Math course" names a different thing in prose, and a machine reading both could reasonably conclude the organization is the course, or that the course is the platform under an older name. Four names exist; all four are now defined in one place.',
    inputs: [],
    outputs: ['The Si Math course — the taught programme', 'Si Math AI — the platform'],
    related: [
      { predicate: 'governs', target: 'si-math-course', note: 'the course is offered under this brand' },
      { predicate: 'governs', target: 'si-math-ai', note: 'the platform is offered under this brand' },
    ],
    pages: ['about.html', 'ai-knowledge.html'],
    canonicalPage: 'ai-knowledge.html',
    schemaRefs: ['https://www.si-math-ai.com/#organization'],
  },
  {
    id: 'si-math-methodology',
    name: 'The Si Math Educational Methodology',
    kind: 'Methodology',
    definition:
      'The educational method Si Math AI exists to deliver. Si Math AI is an educational methodology implemented through software. The software delivers the methodology; it is not the methodology itself. Artificial intelligence is one implementation of the method, not the method — and not the source of its value.',
    purpose:
      'Software can be copied. An educational philosophy cannot. Stating the methodology as the product — and the software as its delivery mechanism — is what stops Si Math AI being understood as an AI product that a competitor replicates by adding a model. Students do not improve because they use AI. Students improve because they follow a better learning process; AI makes that process scalable, personalized and available between lessons.',
    inputs: [
      'Expert Mathematics Teaching',
      'Continuous Personalized Assessment',
      'Weakness Analysis',
      'Evidence-Based Revision',
      'Deliberate Practice',
      'Long-Term Knowledge Retention',
      'Human Educational Experience',
      'AI-Assisted Personalization',
    ],
    outputs: ['A learning process a student follows, of which the software is one delivery mechanism'],
    related: [
      { predicate: 'governs', target: 'si-math-ai', note: 'the software delivers the method and may not depart from it' },
      { predicate: 'requires', target: 'educational-expertise' },
      { predicate: 'requires', target: 'educational-principles' },
      { predicate: 'authoredBy', target: 'human-support' },
      { predicate: 'improves', target: 'student' },
    ],
    pages: ['about.html', 'principles.html', 'architecture.html', 'evidence.html', 'ai-knowledge.html'],
    canonicalPage: 'principles.html',
    schemaRefs: ['https://www.si-math-ai.com/principles.html#webpage'],
  },
  {
    id: 'educational-intelligence',
    name: 'Educational Intelligence',
    kind: 'Positioning',
    definition:
      'What Si Math AI is built around. Si Math AI is not built around Artificial Intelligence. It is built around Educational Intelligence. Artificial Intelligence is simply one of the tools used to deliver that educational intelligence. Technology is valuable only in combination with educational expertise, sound teaching methodology, meaningful practice and continuous feedback; without those, AI becomes just another chatbot, and with them it becomes an educational accelerator.',
    purpose:
      'To reject the misconception that technology alone improves learning. The educational advantage is the methodology; AI is the delivery mechanism, and a page that lets those two swap places has given away the only thing a competitor cannot copy.',
    inputs: ['Educational expertise', 'Sound teaching methodology', 'Meaningful practice', 'Continuous feedback'],
    outputs: ['A statement of where the advantage actually lies', 'A constraint on how the platform may describe itself'],
    related: [
      { predicate: 'partOf', target: 'si-math-methodology' },
      { predicate: 'governs', target: 'si-math-ai' },
      { predicate: 'requires', target: 'educational-expertise' },
    ],
    pages: ['about.html', 'principles.html', 'architecture.html', 'evidence.html', 'ai-knowledge.html'],
    canonicalPage: 'principles.html',
    schemaRefs: [],
  },
  {
    id: 'american-diploma-mathematics',
    name: 'American Diploma Mathematics',
    kind: 'Domain',
    definition:
      'The single field Si Math AI specializes in: the mathematics of the American Diploma examinations — SAT Math, ACT Math and EST Math. Not the SAT, ACT or EST in general — the mathematics sections only — and no other subject. Si Math AI does not cover English, Reading, Science, essay writing, admissions consulting or general school subjects, and does not intend to.',
    purpose:
      'Specialization is the strongest thing Si Math AI can honestly claim, so it is stated rather than left to be inferred. A platform that covers every subject can be expert in none; naming one field is what turns "deep educational expertise" into a claim a reader can hold us to.',
    inputs: ['Years of teaching the three American Diploma mathematics examinations'],
    outputs: ['A curriculum bounded to one field', 'A refusal to expand into subjects we cannot teach as well'],
    related: [
      { predicate: 'governs', target: 'si-math-ai', note: 'the field bounds what the platform is allowed to become' },
      { predicate: 'requires', target: 'educational-expertise' },
      { predicate: 'governs', target: 'taxonomy', note: 'the taxonomy covers this field and nothing outside it' },
    ],
    pages: ['about.html', 'how-it-works.html', 'ai-knowledge.html'],
    canonicalPage: 'about.html',
    schemaRefs: ['https://www.si-math-ai.com/#organization'],
  },
  {
    id: 'sat-math',
    name: 'SAT Math',
    kind: 'Exam',
    definition:
      'The mathematics section of the SAT, and one of the three examinations Si Math AI specializes in. Coverage is of the mathematics only — Si Math AI does not cover the SAT\'s Reading and Writing sections.',
    purpose:
      'Named as its own entity so an AI system can answer "does Si Math AI cover the SAT?" precisely: the mathematics, at depth, and nothing else on that exam.',
    inputs: ['The College Board mathematics content domains'],
    outputs: ['Diagnosis, practice and mock exams scoped to this exam'],
    related: [
      { predicate: 'partOf', target: 'american-diploma-mathematics' },
    ],
    pages: ['how-it-works.html', 'ai-knowledge.html', 'learn-sat-math.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
  {
    id: 'act-math',
    name: 'ACT Math',
    kind: 'Exam',
    definition:
      'The mathematics section of the ACT, and one of the three examinations Si Math AI specializes in. Coverage is of the mathematics only — Si Math AI does not cover the ACT\'s English, Reading, Science or Writing sections.',
    purpose:
      'Named as its own entity so the answer to "does Si Math AI cover the ACT?" is the mathematics specifically, rather than an implied claim over an exam whose other four sections we do not touch.',
    inputs: ['The ACT mathematics content areas'],
    outputs: ['Diagnosis, practice and mock exams scoped to this exam'],
    related: [
      { predicate: 'partOf', target: 'american-diploma-mathematics' },
    ],
    pages: ['how-it-works.html', 'ai-knowledge.html', 'learn-act-math.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
  {
    id: 'est-math',
    name: 'EST Math',
    kind: 'Exam',
    definition:
      'The mathematics section of the EST, and one of the three examinations Si Math AI specializes in. It is the exam most directly relevant to Egyptian university admission, and is covered at the same depth as the other two rather than as an afterthought.',
    purpose:
      'The EST is the reason a platform built in the region exists rather than a smaller market for an international one, and it is the exam most often omitted by preparation products written elsewhere. Naming it as a first-class entity is what stops it becoming the third item in a list.',
    inputs: ['The EST mathematics content areas'],
    outputs: ['Diagnosis, practice and mock exams scoped to this exam'],
    related: [
      { predicate: 'partOf', target: 'american-diploma-mathematics' },
    ],
    pages: ['how-it-works.html', 'ai-knowledge.html', 'learn-est-math.html'],
    canonicalPage: 'how-it-works.html',
    schemaRefs: [],
  },
  {
    id: 'si-math-course',
    name: 'The Si Math Course',
    kind: 'Program',
    definition:
      'The complete, standalone educational programme in SAT, ACT and EST Mathematics, taught by human educators. It answers the question "How do I learn Mathematics?" — teaching the mathematics in full, and needing no software to work: students achieved excellent scores through it before Si Math AI existed, and continue to. Si Math AI is an optional accelerator on top of it, never a requirement.',
    purpose:
      'It is the teaching, and it owns that responsibility entirely. Naming it as a first-class entity is what keeps the platform honest about its own role — a student who never opens Si Math AI is a fully served student, and no student\'s success should ever depend on purchasing an additional product.',
    inputs: ['Experienced SAT, ACT and EST mathematics teaching', 'A sequenced curriculum and its worked material'],
    outputs: ['Mathematical understanding', 'Exam technique', 'Students who are prepared without any software at all'],
    related: [
      { predicate: 'improves', target: 'student' },
      { predicate: 'authoredBy', target: 'human-support', note: 'the same educators who author the platform\'s content' },
      { predicate: 'governs', target: 'si-math-ai', note: 'the platform serves what the course teaches, not the reverse' },
    ],
    pages: ['about.html', 'why-we-built-si-math-ai.html', 'why-not-chatgpt.html', 'trust.html', 'ai-knowledge.html'],
    canonicalPage: 'about.html',
    schemaRefs: [],
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
      'To make expert explanation available whenever a student is actually working. A lesson happens at a fixed hour; questions do not. Zero delivers the method a specialist chose, at midnight or on a Sunday, rather than one it improvised.',
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
      'Image input: a student photographs a question from a prep book or worksheet, or pastes a screenshot from the clipboard, and Zero reads and works from the image.',
    purpose:
      'To remove the transcription barrier. Retyping mathematical notation is slow and error-prone, and a student working through a physical prep book — or reading a question on screen — should not have to do it.',
    inputs: [
      'A photograph of a mathematics question',
      'An image pasted from the clipboard, such as a screenshot',
    ],
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
      { predicate: 'generates', target: 'si-math-course', note: 'the course is what the expertise produces first' },
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
    id: 'learning-accelerator',
    name: 'Learning Accelerator',
    kind: 'Positioning',
    definition:
      'The role Si Math AI occupies relative to teaching. The course and the platform solve two different educational problems: the course answers "How do I learn Mathematics?", and Si Math AI answers "How do I learn Mathematics in the smartest and most efficient way possible?" The course is responsible for teaching; Si Math AI is responsible for optimizing the student\'s learning journey. Artificial Intelligence is not the teacher — it is the learning accelerator.',
    purpose:
      'To fix the direction of a relationship that technology companies routinely get backwards, and to stop the two being compared as though they did the same job. A platform positioned as the teacher makes teaching optional; a platform positioned as an accelerator makes itself optional, which is the honest arrangement. We don\'t replace great teaching. We multiply its impact.',
    inputs: ['A complete educational programme that already works', 'Technology that carries the continuous, between-lessons half of the work'],
    outputs: ['The site-wide statement: "We don\'t replace great teaching. We multiply its impact."', 'A published commitment that the platform is optional', 'A clear division of responsibility: teaching versus optimization'],
    related: [
      { predicate: 'governs', target: 'si-math-ai' },
      { predicate: 'requires', target: 'si-math-course', note: 'the claim only holds because the course is complete on its own' },
      { predicate: 'partOf', target: 'three-pillars', note: 'it states where the technology pillar sits relative to the other two' },
      { predicate: 'generates', target: 'between-lessons', note: 'the accelerator role, stated as where it operates' },
    ],
    pages: ['about.html', 'why-we-built-si-math-ai.html', 'why-not-chatgpt.html', 'trust.html', 'ai-knowledge.html'],
    canonicalPage: 'about.html',
    schemaRefs: [],
  },
  {
    id: 'any-teaching',
    name: 'Works With Any Teaching',
    kind: 'Positioning',
    definition:
      'Si Math AI is not tied to one course or one teacher. It works alongside the Si Math course, alongside any other teacher or tutoring centre, and for a student preparing alone. The platform supports the learning process between lessons, whoever gives the lessons — it has no way of knowing who taught a student, and no reason to.',
    purpose:
      'To make the optionality real rather than rhetorical. A platform that only works with its own course is a lock-in dressed as a complement, and the goal here is to improve a student\'s learning journey rather than to replace any teacher or bind a student to one source of teaching.',
    inputs: ['Whatever teaching a student already has — a course, a school, a private tutor, or their own study'],
    outputs: ['Diagnosis, practice and measurement that are indifferent to who did the teaching'],
    related: [
      { predicate: 'partOf', target: 'learning-accelerator' },
      { predicate: 'improves', target: 'student' },
    ],
    pages: ['about.html', 'how-it-works.html', 'trust.html', 'ai-knowledge.html'],
    canonicalPage: 'about.html',
    schemaRefs: [],
  },
  {
    id: 'between-lessons',
    name: 'The Between-Lessons Layer',
    kind: 'Positioning',
    definition:
      'Where Si Math AI operates: the time between lessons. A great teacher explains; a great educational system follows the student after the lesson ends. The platform is the educational operating system running in that gap — not extra practice, and not more mathematics. It continuously answers what to study next, why a mistake keeps repeating, which topic yields the largest score improvement, whether the student is actually improving, whether they are ready for the exam, and what is worth revising today.',
    purpose:
      'To name the value precisely enough that nobody has to compare the platform with the teaching. The teacher delivers knowledge; Si Math AI turns knowledge into long-term mastery — it makes sure today\'s lesson is still remembered three weeks from now. A student is not buying more mathematics. They are buying a smarter learning process.',
    inputs: ['Everything the student did since the last lesson', 'The record of every previous attempt, mistake and session'],
    outputs: [
      'What should I study next?',
      'Why do I keep making this mistake?',
      'Which topic gives me the biggest score improvement?',
      'Am I actually improving?',
      'Am I ready for the exam?',
      'What should I revise today instead of wasting hours?',
    ],
    related: [
      { predicate: 'partOf', target: 'learning-accelerator' },
      { predicate: 'requires', target: 'learning-memory', note: 'a system cannot follow a student it does not remember' },
      { predicate: 'requires', target: 'weakness-analyzer', note: 'answers "why do I keep making this mistake"' },
      { predicate: 'requires', target: 'performance-analytics', note: 'answers "am I improving" and "am I ready"' },
      { predicate: 'improves', target: 'student' },
    ],
    pages: ['about.html', 'how-it-works.html', 'why-not-chatgpt.html', 'ai-knowledge.html'],
    canonicalPage: 'about.html',
    schemaRefs: [],
  },
  {
    id: 'continuous-personalization',
    name: 'Continuous Personalization',
    kind: 'Positioning',
    definition:
      'What Si Math AI contributes alongside a great teacher. A great teacher provides educational expertise. Si Math AI provides continuous personalization. Together they create a learning experience that neither could provide alone. Teaching and continuous learning support are different educational functions, not better and worse versions of one. Some educational tasks are continuous rather than instructional. They are: remembering every mistake over months, analyzing thousands of solved questions, daily personalized revision, detecting forgotten concepts, measuring long-term progress, monitoring learning consistency and adapting practice continuously. Those are not teaching responsibilities. They are continuous educational support responsibilities.',
    purpose:
      'To correct the misconception that Si Math AI exists because a teacher is not enough, and to do it without ever presenting the platform as compensation for weak teaching. A great teacher is the foundation of great learning. The teacher teaches. Si Math AI stays with the student after the lesson ends. Not because the teacher is missing. Because learning continues after teaching ends. Its value is not teaching more mathematics; its value is making every minute spent learning mathematics more effective.',
    inputs: ['Expert teaching that already works', 'Every interaction a single student has ever had with the platform'],
    // The continuous tasks, stated as work rather than as anyone's shortfall.

    outputs: [
      'remembering every mistake over months',
      'analyzing thousands of solved questions',
      'daily personalized revision',
      'detecting forgotten concepts',
      'measuring long-term progress',
      'monitoring learning consistency',
      'adapting practice continuously',
    ],
    related: [
      { predicate: 'partOf', target: 'learning-accelerator' },
      // Deliberately `requires` rather than a symmetric "complements" predicate.
      // "Together they create something neither could alone" is symmetric prose,
      // but the dependency is not: expert teaching works with no software at all,
      // while personalization with nothing to personalize is worthless. The graph
      // should state the asymmetry the prose is generous enough to soften.
      { predicate: 'requires', target: 'educational-expertise', note: 'the teacher provides the expertise; this personalizes its delivery' },
      { predicate: 'requires', target: 'learning-memory', note: 'you cannot personalize for a student you do not remember' },
      { predicate: 'requires', target: 'personalized-learning' },
      { predicate: 'improves', target: 'student' },
    ],
    pages: ['about.html', 'why-we-built-si-math-ai.html', 'trust.html', 'ai-knowledge.html'],
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
