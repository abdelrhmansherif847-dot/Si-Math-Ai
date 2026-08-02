/* evidence-data.mjs — the SINGLE AUTHORED SOURCE for the Evidence Center.
 *
 * evidence.html, changelog.html and roadmap.html are GENERATED from this file
 * by scripts/build-evidence.mjs. Never hand-edit those pages.
 *
 *   node scripts/build-evidence.mjs           # write all three
 *   node scripts/build-evidence.mjs --check   # fail if any is out of date
 *
 * ── EDITORIAL RULES ────────────────────────────────────────────────────────
 * The governing question for this whole layer is: **"How do we know this?"**
 * If a claim cannot answer it, the claim is not finished and does not ship.
 *
 *   1. EVIDENCE TYPES ARE LABELLED, NOT BLURRED. Every capability's evidence
 *      is tagged as one of:
 *        'mechanism'  — verifiable from the product itself: this is what the
 *                       software demonstrably does. The reader can check it.
 *        'research'   — an established finding in the educational literature
 *                       that supports the PRINCIPLE the feature applies.
 *        'record'     — a dated, documented artefact in this repository.
 *      What we do NOT have is 'outcome' evidence — measured results from Si
 *      Math AI's own students. Where that is the honest answer, say so.
 *
 *   2. RESEARCH SUPPORTS THE PRINCIPLE, NOT THE PRODUCT. Citing Roediger &
 *      Karpicke does not mean research shows Si Math AI works. It means
 *      retrieval practice works and Si Math AI applies it. Conflating those
 *      two is the most common dishonesty in edtech marketing and it is
 *      forbidden here.
 *
 *   3. NO FABRICATED CITATIONS. Author, year and title only, at a level of
 *      detail that can be stated accurately. No invented DOIs, no invented
 *      page numbers, and no effect sizes quoted from memory. Readers are told
 *      to look the work up rather than trust our summary of it.
 *
 *   4. INCLUDE THE INCONVENIENT FINDINGS. Where the literature qualifies or
 *      complicates a claim we benefit from — feedback that can harm
 *      performance, Bloom's two-sigma result being hard to replicate — say so.
 *      Citing only the supportive half of a literature is cherry-picking with
 *      footnotes.
 *
 *   5. CHANGELOG ENTRIES MUST BE VERIFIABLE. Every entry traces to a dated
 *      artefact in this repository — a migration filename, an incident record,
 *      an audit document. Nothing is backfilled from memory or invented to
 *      make the history look busier.
 *
 *   6. THE ROADMAP IS DIRECTION, NOT PROMISES. No dates, no commitments, and
 *      it must include the things we have publicly admitted are missing.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   1 · CAPABILITY EVIDENCE
   For each major capability: what it is, why it exists, how it works, and what
   evidence supports its value.
   ═══════════════════════════════════════════════════════════════════════════ */

export const CAPABILITIES = [
  {
    id: 'zero',
    name: 'Zero AI Mentor',
    icon: '🐉',
    what: 'The tutoring layer. Zero works through a problem step by step, offers a different approach when the first does not land, reads photographed questions, and explains why the wrong answer choices are wrong.',
    why: 'Expert explanation is the scarcest resource in exam preparation. One teacher with thirty students cannot give each of them an unhurried, patient walk-through of the question they are stuck on tonight. Zero exists to remove the scheduling constraint on expert explanation — not to replace the expertise, which is authored by educators.',
    how: 'Zero delivers teaching methods, mistake diagnoses and exam strategies that human specialists authored and review. Every interaction also writes a diagnostic signal against a specific skill, which is what feeds the rest of the platform. A scope guard declines requests outside the platform\'s educational purpose.',
    evidence: [
      { type: 'mechanism', text: 'Explanations state why distractors are wrong, not only why the key is right — checkable in any session. Distractors on standardised exams are engineered around specific misconceptions, so naming the misconception is the teaching act.' },
      { type: 'research', ref: 'sweller-cooper-1985', text: 'The worked-example effect: for learners without strong prior knowledge, studying fully worked solutions is more efficient than problem-solving alone, because unguided search consumes the working memory that learning requires.' },
      { type: 'research', ref: 'hattie-timperley-2007', text: 'Feedback is among the most powerful influences on achievement — but its effect varies enormously with type. Feedback about the task and the process helps; feedback directed at the self does not. Zero is built to comment on the work, never on the student.' },
      { type: 'record', text: 'A scope guard is implemented in the ai-tutor Edge Function and pinned by a regression test (tests/scope-guardrail.test.mjs), so out-of-scope requests are declined and no diagnostic record is written for them.' },
    ],
    honest: 'We have no measured outcome data showing that students taught by Zero improve more than students taught another way. We are not going to imply otherwise. What we can show is that the mechanism follows established practice and that the content is specialist-authored.',
  },
  {
    id: 'weakness-analyzer',
    name: 'Weakness Analyzer',
    icon: '🔍',
    what: 'Converts every attempt into a diagnostic signal against a specific skill, then ranks weak skills by how much each is costing the student\'s score, with a severity band per skill.',
    why: 'Students are poor judges of their own weaknesses. The topics that feel hardest are frequently not the ones losing marks, and errors like sign-handling under time pressure are close to invisible from the inside. Without an outside view, study time goes to the wrong skills — which is the single most common reason preparation stalls.',
    how: 'Signals from chats, focus drills and mock exams resolve to one permanent skill identifier in a fixed taxonomy before storage, so "quadratics", "quadratic equations" and "solving by factoring" cannot fragment into three unrelated records. Ranking combines how heavily a skill is tested with how reliably the student loses it. A weakness clears only when later evidence confirms the fix held.',
    evidence: [
      { type: 'mechanism', text: 'The taxonomy is a fixed, versioned artefact in the codebase (5 topic domains, 33 skills, permanent identifiers). Every stored record carries the taxonomy version that produced it, so a curriculum revision cannot silently rewrite what an old diagnosis meant.' },
      { type: 'research', ref: 'kornell-bjork-2007', text: 'Learners\' judgments of their own learning are systematically miscalibrated — fluency during study is mistaken for durable knowledge. This is the direct empirical case for an external diagnosis rather than self-assessment.' },
      { type: 'research', ref: 'black-wiliam-1998', text: 'Formative assessment — using assessment to direct subsequent teaching rather than only to grade — is associated with substantial learning gains. The Weakness Analyzer is formative assessment applied continuously rather than at intervals.' },
      { type: 'record', text: 'Severity bands, recency weighting, trend, and question-level linkage were added in dated migrations on 2026-06-14; taxonomy v1 was applied across every consuming table in nine migrations from 2026-06-25 to 2026-06-28.' },
    ],
    honest: 'The ranking is a model, and models are wrong sometimes. A skill can be ranked as weak because of two unlucky attempts. This is why the platform re-tests rather than closing a weakness on a single correct answer — but it does mean an individual ranking should be read as evidence, not verdict.',
  },
  {
    id: 'focus-practice',
    name: 'Focus Practice',
    icon: '🎯',
    what: 'Generates targeted drill sets from the ranked weaknesses, in the order that recovers the most marks per hour, skipping skills already mastered.',
    why: 'A diagnosis with no action attached is just a more precise way of feeling bad about your preparation. Focus Practice is the step that converts diagnosis into work — and the step that stops students practising what is comfortable, which is the most common way study hours are wasted.',
    how: 'Reads the live weakness ranking and the time remaining before the exam date. Every drill attempt writes a new signal, so the practice that fixes a weakness is also the practice that proves it was fixed. The queue re-ranks as weaknesses clear.',
    evidence: [
      { type: 'mechanism', text: 'Practice is generated from the student\'s own diagnosis rather than a fixed chapter order — two students the same distance from the same exam receive different sets. Observable by comparing two accounts.' },
      { type: 'research', ref: 'dunlosky-2013', text: 'A large review of learning techniques rated practice testing and distributed practice as high-utility, and rereading and highlighting as low-utility. Focus Practice is practice testing, scheduled.' },
      { type: 'research', ref: 'rohrer-taylor-2007', text: 'Interleaved practice of mathematics problems produces worse performance during practice and better performance on later tests than blocked practice — because blocked practice never trains the hardest step, deciding which method applies.' },
      { type: 'research', ref: 'bjork-1994', text: 'Desirable difficulties: conditions that slow acquisition often improve retention and transfer. This is why effective practice feels worse than ineffective practice, and why a platform optimising for how productive a session feels would optimise the wrong thing.' },
      { type: 'record', text: 'Signal-aware focus plans, plan lifecycle and single-active-plan enforcement shipped in dated migrations on 2026-06-15 and 2026-06-16; XP for completed focus work on 2026-06-24.' },
    ],
    honest: 'Focus Practice can only target skills the taxonomy represents. A weakness that falls outside the 33 tracked skills will not be surfaced by it, and the taxonomy is deliberately conservative rather than exhaustive.',
  },
  {
    id: 'mock-exams',
    name: 'Mock Exams',
    icon: '📋',
    what: 'Full-length, correctly timed SAT, ACT and EST mathematics mocks with raw-to-scaled scoring and a per-section breakdown.',
    why: 'Practising questions and sitting an exam are different skills. Under real timing, students who know the mathematics still lose marks to pacing, fatigue, triage and the decision of when to abandon a question. A mock is the only way to measure that and the only way to practise it.',
    how: 'Real format and timing per exam, raw-to-scaled conversion so the result is expressed in the number that appears on a score report, mistakes retained for review, and every item fed back into the Weakness Analyzer.',
    evidence: [
      { type: 'mechanism', text: 'Mocks are full-length and timed rather than sampled, and results are converted to the scaled score rather than reported as a raw count — both directly observable.' },
      { type: 'research', ref: 'roediger-karpicke-2006', text: 'The testing effect: retrieving information from memory produces more durable learning than restudying it for the same time. A mock exam is retrieval practice at maximum scale, which is why it is a learning event and not only a measurement.' },
      { type: 'research', ref: 'ashcraft-kirk-2001', text: 'Mathematics anxiety consumes working memory, degrading performance independently of knowledge. Rehearsing real conditions is the mechanism by which test-day novelty — and the anxiety that comes with it — is reduced.' },
      { type: 'record', text: 'Exam session idempotency was added on 2026-06-16, so a network interruption cannot double-record or corrupt a submitted attempt.' },
    ],
    honest: 'Mock exams are our own construction, not retired official papers. They follow the published format and are specialist-reviewed, but a mock score is an estimate of exam performance rather than an exam result — and no third-party study validates our scaling.',
  },
  {
    id: 'progress-tracking',
    name: 'Smart Progress Tracking',
    icon: '📈',
    what: 'Mastery score per skill, trend lines over time, a predicted test-day score, daily streaks and a seven-rank XP ladder.',
    why: 'The most demotivating property of self-directed preparation is invisibility: you study for six weeks with no reliable way to know whether it worked. Measurement makes improvement legible — and stagnation legible early enough to change what you are doing.',
    how: 'Mastery is derived from actual attempts rather than questions completed. Trends are computed per topic domain. The predicted score updates as evidence accumulates. Streaks and ranks sit on top as motivational structure, never as a substitute for the mastery scores.',
    evidence: [
      { type: 'mechanism', text: 'Mastery is computed from attempt outcomes, not from activity volume — a student can complete many questions without mastery moving, which is exactly the signal a volume metric would hide.' },
      { type: 'record', text: 'The rank ladder exists in exactly one place in the client (assets/ranks.js), is mirrored by the SQL function rank_for_xp(), and a drift test (tests/constants-drift.test.mjs) fails the build if any copy diverges — so a student cannot see a different rank on different pages.' },
      { type: 'record', text: 'Streak columns and their recomputation shipped 2026-06-16; the streak logic is covered by its own regression suite (tests/streak.test.mjs) after an audit found it seeded today unconditionally.' },
      { type: 'research', ref: 'bloom-1984', text: 'Bloom\'s mastery-learning work argued that individual tutoring with formative feedback substantially outperforms conventional instruction. We cite it as the origin of the aspiration and note plainly that the headline two-sigma effect has proven difficult to replicate at that magnitude.' },
    ],
    honest: 'The predicted test-day score is an estimate produced by our model from platform performance. It is not an official score, not a guarantee, and it has not been validated against a large sample of real exam results — because we do not yet have one. Read the direction, not the digit.',
  },
  {
    id: 'learning-memory',
    name: 'Learning Memory',
    icon: '🧠',
    what: 'A persistent, searchable record of every question, session and mistake, carrying context between sessions.',
    why: 'Exam preparation is cumulative. A tutor whose memory resets between sessions cannot do the one thing a tutor is for — notice a pattern across time. Every other system on the platform depends on this one: without persistence there is no ranking, no trend, no predicted score and no plan.',
    how: 'Sessions are stored and re-openable, history is searchable, mistake records persist as structured data, and exam context carries forward.',
    evidence: [
      { type: 'mechanism', text: 'Open a session from three weeks ago and it is still there, with its explanation intact. This is the single clearest observable difference from a stateless assistant, and it takes one minute to verify.' },
      { type: 'research', ref: 'cepeda-2006', text: 'The spacing effect — distributed practice outperforms massed practice for the same total time — is one of the most robust findings in the study of memory. Acting on it requires knowing what a student studied and when, which requires persistence.' },
      { type: 'record', text: 'Question-record idempotency (2026-06-16) ensures a retried write cannot duplicate a student\'s history, which is what makes longitudinal counts trustworthy rather than approximately right.' },
    ],
    honest: 'Persistence is also a responsibility. This is student data, held to power that student\'s own diagnosis; it is protected by row-level security on every table and can be permanently deleted by the student. See the Trust Center for the full account.',
  },
  {
    id: 'personalized-learning',
    name: 'Personalized Learning',
    icon: '🧭',
    what: 'The adaptive layer: what a student practises, in what order, how a concept is explained, in which language, and for which exam — all derived from evidence about that student.',
    why: 'A generic plan is not a neutral default. It systematically wastes the time of every student it does not happen to fit, and it hides the specific gaps that are actually costing marks.',
    how: 'Selection and sequencing are driven by the live diagnosis and the time remaining before the exam. The curriculum itself is fixed and specialist-authored — the pedagogy is chosen per student, not improvised per student.',
    evidence: [
      { type: 'mechanism', text: 'The curriculum/selection split is the checkable part: the material a student receives comes from a specialist-authored body of content, and what changes per student is which of it they get and when. This is why the platform can answer "what is my child being taught?" with a stable answer.' },
      { type: 'research', ref: 'black-wiliam-1998', text: 'The formative-assessment literature is about adjusting instruction in response to evidence of learning. Personalization here means exactly that, and nothing more mystical.' },
      { type: 'research', ref: 'pashler-2008', text: 'We deliberately do NOT personalize by "learning style" — the evidence for matching instruction to visual/auditory/kinaesthetic preferences does not support the practice, despite its popularity. Adapting to a student\'s measured weaknesses is well supported; adapting to a self-reported style is not.' },
    ],
    honest: 'That last point is worth stating loudly because it costs us a marketing line. "Personalized to your learning style" is a claim many platforms make and the evidence does not support it. We personalize to diagnosed weakness, exam and language — things that can be measured.',
  },
  {
    id: 'human-support',
    name: 'Human Support',
    icon: '🤝',
    what: 'Educators and exam specialists author and review everything the platform teaches; people handle accounts and upgrades; specialists revise material based on how students perform.',
    why: 'Educational technology fails in two predictable directions: built by engineers without teachers it produces impressive software that does not reflect how learning works; built by teachers without engineers it produces sound pedagogy that cannot scale or measure itself.',
    how: 'Specialists define and maintain the skill taxonomy, author and review explanation methods and strategy content, and review student performance to revise material. Upgrade requests are reviewed and activated by a person with email confirmation within 24 hours.',
    evidence: [
      { type: 'mechanism', text: 'The taxonomy is a hand-authored, versioned artefact with permanent identifiers and a documented amendment process — the visible trace of specialist curriculum work rather than model output.' },
      { type: 'record', text: 'Payment approval is admin-gated and takes the credit amount server-side from the plan definition rather than from the client request — a human decision, implemented so it cannot be forged.' },
      { type: 'research', ref: 'hattie-timperley-2007', text: 'Feedback quality — not feedback quantity — determines effect. Deciding which explanation to give a student with a particular misconception is a teaching judgement, which is why specialists author the material rather than approving whatever a model produced.' },
    ],
    honest: 'Human support does not currently include on-demand live tutoring. If that is what a student needs, a private tutor alongside the platform is the right combination and we say so on the Trust Center.',
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   2 · RESEARCH FOUNDATIONS
   Established findings the platform builds on. We are not claiming to have
   discovered any of this — the point is the opposite.
   ═══════════════════════════════════════════════════════════════════════════ */

export const RESEARCH = [
  {
    id: 'cepeda-2006',
    finding: 'The spacing effect',
    summary: 'Practice distributed over time produces more durable retention than the same amount of practice massed together. Among the most replicated findings in the study of human memory, first documented in the nineteenth century and confirmed across a very large modern literature.',
    applied: 'Why Si Math AI is built around short regular sessions, why streaks exist, and why previously weak skills are revisited rather than assumed fixed.',
    sources: [
      'Ebbinghaus, H. (1885). Über das Gedächtnis (Memory: A Contribution to Experimental Psychology).',
      'Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. Psychological Bulletin.',
    ],
  },
  {
    id: 'roediger-karpicke-2006',
    finding: 'The testing effect (retrieval practice)',
    summary: 'Retrieving information from memory strengthens it more than restudying the same material for the same time. Reading a solution feels like learning and largely is not; attempting the problem first is what consolidates.',
    applied: 'Why the guides tell students to attempt before checking, why Focus Practice is drills rather than reading, and why mock exams are treated as learning events rather than only measurements.',
    sources: [
      'Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. Psychological Science.',
      'Karpicke, J. D., & Roediger, H. L. (2008). The critical importance of retrieval for learning. Science.',
    ],
  },
  {
    id: 'dunlosky-2013',
    finding: 'Not all study techniques are equal',
    summary: 'A large review assessed common study techniques for effectiveness. Practice testing and distributed practice were rated high utility. Rereading, highlighting and summarisation — the three most popular techniques among students — were rated low utility.',
    applied: 'The direct basis for the study-strategies guide, and for the platform not offering features that make ineffective study feel productive.',
    sources: [
      'Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students\' learning with effective learning techniques. Psychological Science in the Public Interest.',
    ],
  },
  {
    id: 'rohrer-taylor-2007',
    finding: 'Interleaving beats blocking in mathematics',
    summary: 'Mixing problem types within a practice session produces worse performance during practice and better performance on delayed tests than practising one type at a time. Blocked practice tells the student which method applies before they read the question — so it never trains the step that actually matters on an exam.',
    applied: 'Why Focus Practice mixes topics rather than grouping them, and why the guides recommend blocking only while first learning something new.',
    sources: [
      'Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. Instructional Science.',
    ],
  },
  {
    id: 'bjork-1994',
    finding: 'Desirable difficulties',
    summary: 'Conditions that make learning feel harder and slower during acquisition often improve long-term retention and transfer. A corollary that matters commercially: the study methods that feel most productive are frequently the least effective.',
    applied: 'Why the platform optimises for measured mastery rather than for how satisfying a session feels, and why the guides warn students that effective practice feels worse.',
    sources: [
      'Bjork, R. A. (1994). Memory and metamemory considerations in the training of human beings. In Metcognition: Knowing about Knowing.',
    ],
  },
  {
    id: 'hattie-timperley-2007',
    finding: 'Feedback works — but its type decides whether it helps',
    summary: 'Feedback is among the strongest influences on achievement, but effects vary widely and can be negative. Feedback about the task, the process and self-regulation tends to help; feedback directed at the self ("you are clever", "you are bad at this") tends not to, and can harm.',
    applied: 'Why Zero comments on the work and the method rather than on the student, and why the platform frames a mistake as information about a skill rather than as a verdict on a person.',
    sources: [
      'Hattie, J., & Timperley, H. (2007). The power of feedback. Review of Educational Research.',
      'Kluger, A. N., & DeNisi, A. (1996). The effects of feedback interventions on performance. Psychological Bulletin.',
    ],
    caveat: 'This is a literature that complicates as much as it supports. It is cited here because it constrains our design, not because it endorses our product.',
  },
  {
    id: 'ashcraft-kirk-2001',
    finding: 'Mathematics anxiety consumes working memory',
    summary: 'Anxiety occupies the same limited working-memory resources that multi-step mathematics requires. This is the mechanism behind a student who knows the material and still underperforms under pressure — the knowledge is intact; the capacity to deploy it is reduced.',
    applied: 'The basis for the exam-psychology guide, for treating rehearsal under real conditions as the primary intervention, and for the platform\'s position that pressure applied by parents tends to reduce performance rather than increase it.',
    sources: [
      'Ashcraft, M. H., & Kirk, E. P. (2001). The relationships among working memory, math anxiety, and performance. Journal of Experimental Psychology: General.',
      'Beilock, S. L., & Carr, T. H. (2005). When high-powered people fail: Working memory and "choking under pressure" in math. Psychological Science.',
    ],
  },
  {
    id: 'sweller-cooper-1985',
    finding: 'Cognitive load and the worked-example effect',
    summary: 'Working memory is narrowly limited. For learners without strong prior knowledge, studying worked examples is more efficient than unguided problem-solving, because search consumes the capacity that learning needs. The advantage reverses as expertise grows.',
    applied: 'Why explanations are worked step by step rather than compressed, why the guides tell students to write intermediate steps down rather than hold them mentally, and why the platform moves a student from worked explanation toward independent practice as mastery rises.',
    sources: [
      'Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. Cognitive Science.',
      'Sweller, J., & Cooper, G. A. (1985). The use of worked examples as a substitute for problem solving in learning algebra. Cognition and Instruction.',
    ],
  },
  {
    id: 'kornell-bjork-2007',
    finding: 'Students misjudge their own learning',
    summary: 'Learners\' judgments of what they have learned are systematically miscalibrated. Fluency during study — material feeling easy because it is in front of you — is routinely mistaken for durable knowledge, and students consequently stop studying material they have not yet learned.',
    applied: 'The empirical case for the Weakness Analyzer. If self-assessment were reliable, an external diagnosis would be unnecessary; it is not, so it is.',
    sources: [
      'Kornell, N., & Bjork, R. A. (2007). The promise and perils of self-regulated study. Psychonomic Bulletin & Review.',
    ],
  },
  {
    id: 'black-wiliam-1998',
    finding: 'Formative assessment improves learning',
    summary: 'Assessment used to direct what happens next — rather than only to grade what already happened — is associated with substantial gains, particularly for lower-attaining students.',
    applied: 'The whole diagnose → target → re-measure loop. The Weakness Analyzer is formative assessment running continuously instead of at intervals.',
    sources: [
      'Black, P., & Wiliam, D. (1998). Inside the black box: Raising standards through classroom assessment.',
      'Black, P., & Wiliam, D. (1998). Assessment and classroom learning. Assessment in Education.',
    ],
  },
  {
    id: 'bloom-1984',
    finding: 'Mastery learning and individual tutoring',
    summary: 'Bloom reported that students taught individually with mastery-learning methods substantially outperformed conventionally taught students, and framed the challenge of achieving comparable results at scale as an open problem.',
    applied: 'The origin of the platform\'s aspiration: deliver something closer to individual, diagnosis-driven instruction to students who cannot access a personal tutor.',
    sources: [
      'Bloom, B. S. (1984). The 2 sigma problem: The search for methods of group instruction as effective as one-to-one tutoring. Educational Researcher.',
    ],
    caveat: 'Stated honestly: the headline two-sigma magnitude has proven difficult to replicate, and later work suggests a smaller effect. We cite Bloom as the source of the question, not as evidence for our answer to it. Any platform quoting "two sigma" as a projected benefit of its product is overreaching.',
  },
  {
    id: 'pashler-2008',
    finding: 'Learning styles are not supported by the evidence',
    summary: 'The popular idea that instruction should be matched to a student\'s visual, auditory or kinaesthetic "learning style" lacks credible supporting evidence, despite its very wide adoption.',
    applied: 'Why Si Math AI does not personalize by learning style — a deliberate omission, not an oversight. We adapt to diagnosed weakness, exam and language, all of which are measurable.',
    sources: [
      'Pashler, H., McDaniel, M., Rohrer, D., & Bjork, R. (2008). Learning styles: Concepts and evidence. Psychological Science in the Public Interest.',
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   3 · CHANGELOG
   Every entry traces to a dated artefact in this repository. See rule 5.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The date this changelog was established. Nothing before it is backfilled. */
export const CHANGELOG_ESTABLISHED = '2026-08-01';

export const CHANGELOG = [
  {
    date: '2026-08-01',
    title: 'Knowledge, Trust and Evidence layers published',
    tag: 'Transparency',
    items: [
      'Knowledge Center: About, How It Works, Why Not Just ChatGPT?, a canonical reference for AI systems, the Founder Badge, and a 139-question FAQ.',
      'Educational Knowledge Hub: 12 free guides teaching exam-mathematics method, with no sign-up required.',
      'Our Educational Principles: the six positions the platform is built on, and how each changed the software.',
      'Trust Center: an explicit limitations list, guidance on when a human teacher is the better choice, and a deliberately empty student-stories section explaining why nothing was invented to fill it.',
      'Evidence Center, architecture transparency, this changelog and a public roadmap.',
      'A CI gate (scripts/validate-knowledge-layer.mjs) that fails the build on knowledge contradictions, fabricated social proof, or a claim drifting from its source of truth.',
    ],
  },
  {
    date: '2026-07-28 → 2026-08-01',
    title: 'AI Economics — cost and coverage analytics',
    tag: 'Platform',
    items: [
      'A service catalogue and model-call telemetry layer, so every AI operation is attributable to a cost.',
      'A cost engine and economics layer covering per-lesson economics, student consumption, credit summaries and service quality.',
      'Owner analytics delivered across milestones M1–M4.3, each with its own engineering review, release gate and closeout document.',
    ],
    note: 'Not a student-facing feature. It is here because sustainable unit economics is what allows the free tier to stay genuinely useful, and because the platform documents its internal work to the same standard as its public work.',
  },
  {
    date: '2026-07-30',
    title: 'AI failure observability',
    tag: 'Reliability',
    items: [
      'Structured recording of AI tutor failures, so a student-visible error becomes a diagnosable event rather than a support ticket.',
      'Telemetry access RPCs for the AI Monitor.',
      'Grant hardening applied to the new surfaces at the same time they shipped.',
    ],
  },
  {
    date: '2026-07-27',
    title: 'Security hardening',
    tag: 'Security',
    items: [
      'A full production security audit across the frontend, database, Edge Function, authentication and deployment configuration.',
      'Privilege-escalation and billing-bypass paths closed; the AI knowledge base locked against cross-user writes.',
      'Security headers and a Content Security Policy added; CDN dependencies pinned with subresource integrity.',
      'RPC grant hygiene tightened.',
    ],
    note: 'The audit report is maintained in the repository, including the findings that were rated low severity and the recommendations still outstanding.',
  },
  {
    date: '2026-07-21 → 2026-07-22',
    title: 'Operation-based credits and the Study Planner',
    tag: 'Platform',
    items: [
      'Credits moved from a flat per-message charge to per-operation pricing, so a student using cheap operations no longer subsidises one using expensive operations.',
      'A race condition in AI credit refunds fixed.',
      'Study Planner persistence.',
    ],
  },
  {
    date: '2026-06-25 → 2026-06-28',
    title: 'Taxonomy v1 — the diagnostic vocabulary',
    tag: 'Diagnosis',
    items: [
      'A fixed taxonomy of 5 topic domains and 33 skills with permanent identifiers, applied across question records, weakness signals, mastery records, weakness reports and focus tasks.',
      'Unmapped AI detections logged rather than silently accepted, so gaps in the taxonomy surface instead of corrupting the diagnosis.',
      'Every stored record now carries the taxonomy version that produced it.',
    ],
    note: 'Arguably the most consequential change on this list. Before it, the same weakness could be recorded under three different names and no pattern would ever be visible.',
  },
  {
    date: '2026-06-23',
    title: 'Incident — AI tutor unavailable (upstream quota exhaustion)',
    tag: 'Incident',
    items: [
      'The AI tutor could not generate responses due to exhausted upstream API quota. Resolved when billing was restored.',
      'An incident record was written and is kept in the repository.',
    ],
    note: 'Listed deliberately. A changelog containing only successes is a marketing document. This one is a record.',
  },
  {
    date: '2026-06-17',
    title: 'Adaptive Verification — Phase 0',
    tag: 'Diagnosis',
    items: [
      'Verification columns added to question records, the groundwork for distinguishing a confidently correct diagnosis from an uncertain one.',
    ],
  },
  {
    date: '2026-06-14 → 2026-06-16',
    title: 'Weakness Analyzer and Focus Practice mature',
    tag: 'Diagnosis',
    items: [
      'Severity bands, recency weighting and trend added to weakness reports; weakness signals linked to the specific question that produced them.',
      'Signal-aware focus plans with a proper lifecycle and single-active-plan enforcement.',
      'Idempotency for exam sessions and question records, so a retried write cannot duplicate or corrupt a student\'s history.',
      'Daily streak tracking.',
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   4 · ROADMAP — direction, not promises. No dates.
   ═══════════════════════════════════════════════════════════════════════════ */

export const ROADMAP = [
  {
    horizon: 'Commitments we have already made publicly',
    intro: 'These are gaps the Trust Center admits to. They are listed first because a roadmap that skips its own acknowledged omissions is a wish list.',
    items: [
      { title: 'A published Privacy Policy page', detail: 'The Trust Center states plainly that one does not exist yet. It should.' },
      { title: 'Terms of Service', detail: 'Expected of a platform taking payment from students; the footer links were removed rather than left pointing nowhere.' },
      { title: 'Verified student and parent stories', detail: 'Published only when they meet the standard set out in the Trust Center — named, permissioned, including what did not work, and not cherry-picked.' },
      { title: 'Parent visibility', detail: 'There is no parent login or automated report today. Any version of this has to respect that the student owns their preparation.' },
    ],
  },
  {
    horizon: 'Directions we are actively working on',
    intro: 'Work with real artefacts in the repository behind it, which is why it appears here rather than under "exploring".',
    items: [
      { title: 'Adaptive Verification', detail: 'Distinguishing a confidently correct diagnosis from an uncertain one, so the platform can say how sure it is rather than only what it concluded. Phase 0 is applied; the architecture is documented.' },
      { title: 'Deeper failure observability', detail: 'Continuing the work that turns a student-visible AI error into a diagnosable event, so reliability problems are found before they are reported.' },
      { title: 'Taxonomy depth', detail: 'The 33-skill taxonomy is deliberately conservative. Unmapped detections are already logged, which is how we learn where it is too coarse.' },
      { title: 'Sustainable unit economics', detail: 'The cost and coverage analytics exist so that the free tier can stay genuinely useful and prices can stay reasonable as the platform grows.' },
    ],
  },
  {
    horizon: 'Directions we are considering',
    intro: 'Genuinely undecided. Listed so the direction is visible, not so it can be counted on.',
    items: [
      { title: 'More Arabic and Franco depth', detail: 'Language support exists; there is more to do in making explanation quality equal across all three.' },
      { title: 'Wider exam coverage within mathematics', detail: 'Only where we can bring genuine specialist depth. Breadth without expertise would contradict the reason the platform works.' },
      { title: 'Support for schools and tutoring centres', detail: 'Used by them already, without tooling built for them.' },
      { title: 'Published outcome evidence', detail: 'The honest long-term goal of this Evidence Center: to be able to add an "outcome" evidence type alongside mechanism, research and record — with real data, properly collected.' },
    ],
  },
];

/** What we deliberately will not do — as informative as the roadmap itself. */
export const NOT_ON_ROADMAP = [
  { title: 'Other subjects', detail: 'Not until we can bring the same depth of genuine subject expertise. Breadth without expertise contradicts the reason this works.' },
  { title: 'An answer machine', detail: 'The scope guard is a design decision, not a limitation to be removed later.' },
  { title: 'Personalization by "learning style"', detail: 'The evidence does not support the practice. See the research foundations.' },
  { title: 'Score guarantees', detail: 'No honest provider can offer one, and we will not publish improvement averages we cannot verify.' },
];

/**
 * THE METHODOLOGY — the eight components of the Si Math educational method.
 *
 * These sit on evidence.html rather than only on principles.html for a specific
 * reason: the methodology is the claim, so it is the thing that needs evidence
 * attached. Each component names what it means and, where one exists, the
 * research entry above that supports the principle.
 *
 * `ref` obeys the same rule as everything else on that page: citing research
 * about a principle is NOT evidence that Si Math AI works. It is evidence that
 * the principle works, and a statement that we apply it. Two components carry no
 * `ref` at all — that is honest rather than an omission, because no citation
 * supports "our teachers are experienced" and pretending otherwise would be the
 * exact conflation evidence.html warns about.
 */
export const METHODOLOGY = [
  {
    name: 'Expert Mathematics Teaching',
    what: 'The curriculum, explanations, mistake catalogue and exam strategy are authored and reviewed by experienced SAT, ACT and EST mathematics educators. This is the foundation the other seven rest on.',
    ref: null,
  },
  {
    name: 'Continuous Personalized Assessment',
    what: 'Every attempt — in chat, a drill or a mock — is assessed against one canonical skill rather than left as undifferentiated activity, so assessment is continuous instead of episodic.',
    ref: 'black-wiliam-1998',
  },
  {
    name: 'Weakness Analysis',
    what: 'Assessment is aggregated into a ranked diagnosis: which specific skills are costing the most marks, with a severity band each. Students are poor judges of their own weaknesses, which is why this is external rather than self-reported.',
    ref: 'kornell-bjork-2007',
  },
  {
    name: 'Evidence-Based Revision',
    what: 'What a student revises is decided by their own recorded evidence, not by chapter order or by what feels uncomfortable.',
    ref: 'hattie-timperley-2007',
  },
  {
    name: 'Deliberate Practice',
    what: 'Practice is targeted at identified weaknesses and skips skills already mastered — effortful and specific rather than high-volume and comfortable.',
    ref: 'roediger-karpicke-2006',
  },
  {
    name: 'Long-Term Knowledge Retention',
    what: 'The method is built for what survives to test day, not for what a student can do in the lesson. Spacing and interleaving are the mechanism; Learning Memory is what makes them possible across months.',
    ref: 'cepeda-2006',
  },
  {
    name: 'Human Educational Experience',
    what: 'Judgements about what to teach and how to teach it stay with people. Specialists review how students actually perform and revise the material accordingly.',
    ref: null,
  },
  {
    name: 'AI-Assisted Personalization',
    what: 'Artificial intelligence delivers the seven components above to one student at a time, at any hour, in the language they think in. It is the delivery mechanism, listed last because that is where it belongs.',
    ref: 'bloom-1984',
  },
];

export const TOTAL_METHODOLOGY = METHODOLOGY.length;

export const TOTAL_CAPABILITIES = CAPABILITIES.length;
export const TOTAL_RESEARCH = RESEARCH.length;
