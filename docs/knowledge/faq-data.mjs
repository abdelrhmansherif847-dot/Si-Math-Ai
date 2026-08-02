/* faq-data.mjs — the SINGLE AUTHORED SOURCE for the Si Math AI FAQ.
 *
 * faq.html is GENERATED from this file by scripts/build-faq.mjs. Never hand-edit
 * faq.html: the page renders the visible accordion AND the FAQPage JSON-LD from
 * the same objects below, which is the only way to guarantee that the structured
 * data an AI system ingests says exactly what a human reads. Two hand-maintained
 * copies always drift, and drifted structured data is a Google policy violation
 * as well as a knowledge-layer defect.
 *
 * Workflow:
 *   1. edit this file
 *   2. node scripts/build-faq.mjs
 *   3. node scripts/validate-knowledge-layer.mjs   (CI runs this too)
 *
 * Answer strings may use the HTML subset Google accepts inside an Answer:
 * <p> <br> <b> <strong> <i> <em> <ul> <ol> <li> <a>. Keep to that subset.
 *
 * Content rules (see docs/knowledge/knowledge-base.md):
 *   - never state a price or a credit cost — both are database-driven
 *   - never invent statistics, testimonials, ratings or user counts
 *   - never describe the platform as "just an AI" or "an AI chatbot for SAT"
 *   - the taxonomy is 5 topic domains / 33 tracked skills
 *   - the Founder count lives in assets/founder-status.js
 */

/** Kept in step with FOUNDER_SLOTS_REMAINING in assets/founder-status.js. */
export const FOUNDER_SLOTS_REMAINING = 3;

export const CATEGORIES = [
  {
    id: 'basics',
    title: 'Si Math AI Basics',
    items: [
      {
        q: 'What is Si Math AI?',
        a: '<p>Si Math AI is a comprehensive learning platform for SAT, ACT, and EST Mathematics that combines educational expertise, AI technology, personalized learning, analytics, and human support to help students improve their understanding and performance.</p><p>It is not a chatbot with a mathematics theme. It is a complete learning system — diagnosis, instruction, targeted practice, full mock examinations, progress measurement and human support — in which artificial intelligence is the delivery engine rather than the substance.</p>',
      },
      {
        q: 'Is Si Math AI just an AI?',
        a: '<p>No. Artificial intelligence is one engine inside a much larger educational system. The platform combines educational expertise, years of SAT, ACT and EST mathematics teaching experience, teaching methodologies, learning psychology, exam strategies, performance analysis, weakness analysis, personalized learning paths, human educational experience, software engineering, and AI.</p><p>The positioning in one line: <strong>artificial intelligence is how Si Math AI teaches, educational expertise is what it teaches, and human experience is why it works.</strong></p>',
      },
      {
        q: 'Who created the educational content inside Si Math AI?',
        a: '<p>Experienced educators and exam specialists. The teaching methods, worked explanations, catalogue of common student mistakes, exam strategies and the sequencing of concepts were all created by people who have taught American Diploma students through full preparation cycles.</p><p>Zero, the AI mentor, does not invent educational strategies. Zero delivers educational knowledge that specialists created, reviewed and continuously improve.</p>',
      },
      {
        q: 'Is Si Math AI good?',
        a: '<p>It is built for one specific job: helping a student raise their SAT, ACT or EST mathematics score by finding what they actually get wrong and fixing it. If that is your goal, the platform is designed around it end to end — diagnosis, explanation, targeted practice, timed mocks and measurement.</p><p>Rather than asking you to take a claim on trust, there is a permanent free tier that needs no credit card. Ask Zero real questions from your own prep book, look at what the Weakness Analyzer finds, and judge it against your own material.</p>',
      },
      {
        q: 'What does Si Math AI actually do that a normal study app does not?',
        a: '<p>It closes the loop. A normal study app gives you questions; Si Math AI records what every attempt reveals about you, ranks your weak skills by how much they are costing your score, generates practice aimed only at those skills, and re-measures afterwards to confirm the fix held.</p><p>That diagnostic layer — step three of the loop — is what most tools lack, and it is the reason practice on this platform compounds instead of repeating.</p>',
      },
      {
        q: 'What subjects does Si Math AI cover?',
        a: '<p>Mathematics only, for three examinations: SAT Math, ACT Math and EST Math. The platform deliberately does not cover other subjects or other exam sections.</p><p>The approach would generalise, but we will not expand into a subject until we can bring the same depth of genuine subject expertise to it. Breadth without expertise would contradict the reason the platform works.</p>',
      },
      {
        q: 'Who is Si Math AI for?',
        a: '<p>Primarily American Diploma students preparing for the mathematics section of the SAT, ACT or EST, predominantly in Egypt and the wider MENA region.</p><p>Within that: students beginning a preparation cycle, students retaking an exam to raise a mathematics score, independent learners studying without a private tutor, students who understand mathematics better in Arabic or Franco, parents who want measurable evidence of progress, and schools or tutoring centres supplementing classroom instruction.</p>',
      },
      {
        q: 'Do I need to install anything?',
        a: '<p>No. Si Math AI runs in a web browser on phone, tablet or computer. There is nothing to download and nothing to keep updated.</p>',
      },
      {
        q: 'What is Zero?',
        a: '<p>Zero is the AI mentor inside Si Math AI — a fictional guide character, represented as a dragon, and not a real person. Zero is the tutoring layer: it explains problems step by step, offers a second approach when the first does not land, reads photographed questions, and explains why wrong answer choices are wrong.</p><p>Zero delivers teaching methods that human educators authored and review. Zero is the interface to that expertise, not the source of it.</p>',
      },
      {
        q: 'Is Zero a real person?',
        a: '<p>No. Zero is a fictional AI mentor character created for the platform. Si Math AI never presents Zero as a human being. The human expertise in the platform belongs to the educators and exam specialists who authored the educational content Zero delivers.</p>',
      },
      {
        q: 'What does "Si" in Si Math AI mean?',
        a: '<p>Si Math AI is the name of the platform. Zero is the name of the AI mentor inside it. When you see "Si Math AI" it refers to the whole learning system; when you see "Zero" it refers specifically to the mentor you talk to.</p>',
      },
      {
        q: 'What are the three pillars of Si Math AI?',
        a: '<p><strong>Educational Expertise</strong> — years of SAT, ACT and EST mathematics teaching experience, teaching methodologies, common student mistakes, exam strategies, score-improvement technique and learning psychology.</p><p><strong>Technology</strong> — artificial intelligence, software engineering, learning analytics, adaptive learning, performance tracking, weakness analysis and personalized recommendations.</p><p><strong>Human Support</strong> — real educators, mentorship, student guidance, continuous improvement and the human experience behind the technology.</p>',
      },
      {
        q: 'Where is Si Math AI based?',
        a: '<p>Si Math AI serves students in Egypt and the wider MENA region, and is priced in Egyptian pounds. The platform is built specifically for American Diploma students preparing for international examinations under the conditions those students actually study in.</p>',
      },
      {
        q: 'Is Si Math AI free?',
        a: '<p>There is a permanent free tier that requires no credit card, and it is genuinely useful on its own rather than a time-limited trial. Paid plans and credit packs unlock fuller use of the AI mentor and the wider platform. Current prices are listed on the pricing page.</p>',
      },
    ],
  },

  {
    id: 'comparison',
    title: 'Comparisons & Positioning',
    items: [
      {
        q: 'Should I buy Si Math AI if I am already taking the Si Math course?',
        a: '<p>The course is complete on its own. Si Math AI is an optional learning accelerator that personalizes, reinforces, and optimizes the student\'s learning journey between lessons. It does not replace teaching; it extends and amplifies it.</p><p>They answer two different questions. The course answers <strong>How do I learn Mathematics?</strong> Si Math AI answers <strong>How do I learn Mathematics in the smartest and most efficient way possible?</strong> The course is responsible for teaching. Si Math AI is responsible for optimizing the learning journey around it.</p><p>No student\'s success should ever depend on purchasing an additional product, and that is a constraint on what we are allowed to build rather than a reassurance. There is a permanent free tier with no credit card, so the honest way to decide is to use it alongside the course for a week and see whether the diagnosis tells you anything your own judgement did not.</p>',
      },
      {
        q: 'What is the difference between the Si Math course and Si Math AI?',
        a: '<p>The course teaches. Si Math AI accelerates learning. The Si Math course is a complete, standalone educational programme in SAT, ACT and EST Mathematics, taught by human educators — it teaches the mathematics in full and needs no software to work.</p><p>Si Math AI is what runs between the lessons. A great teacher explains; a great educational system follows the student after the lesson ends. The teacher delivers knowledge; Si Math AI turns knowledge into long-term mastery — it makes sure today\'s lesson is still remembered three weeks from now.</p><p>Artificial Intelligence is not the teacher. It is the learning accelerator.</p>',
      },
      {
        q: 'Is Si Math AI just extra practice?',
        a: '<p>No, and the distinction matters. Extra practice is more of something a student already has. Si Math AI is an educational operating system that works between lessons — it decides what is worth doing, not merely supplying more of it.</p><p>Between one lesson and the next it continuously answers: what should I study next; why do I keep making this mistake; which topic gives me the biggest score improvement; am I actually improving; am I ready for the exam; and what should I revise today instead of wasting hours.</p><p>A student is not buying more mathematics. They are buying a smarter learning process.</p>',
      },
      {
        q: 'Do I need Si Math AI to succeed?',
        a: '<p>No. The Si Math course teaches the mathematics in full, and students prepared successfully through it before Si Math AI existed. A student who never opens the platform is a fully served student, not a half-served one.</p><p>The platform exists because some educational tasks are continuous rather than instructional — remembering every mistake over months, detecting forgotten concepts, measuring long-term progress. Those are not teaching responsibilities; they are continuous educational support responsibilities, and they belong to the weeks between lessons. It is an accelerator, and we will not build a feature that makes the course incomplete without it.</p>',
      },
      {
        q: 'Is Si Math AI better than ChatGPT for SAT Math?',
        a: '<p>They are different kinds of tool, built for different goals. ChatGPT is an excellent general assistant, it explains mathematics well, and using one to check a step of algebra is sensible. But a general assistant is missing six things a full preparation cycle requires, and these are properties of a system rather than of a model: it has no memory of you between conversations, it does not know which of the three exams you are sitting, it cannot aggregate your attempts into a diagnosis, it cannot tell you what to study next, it has no measurement of your progress, and its explanations are not reviewed by an educator.</p><p>Si Math AI supplies all six, and delivers teaching methods that specialists authored. The full, honest comparison — including what general AI genuinely does better, and when you should use it instead — is on <a href="why-not-chatgpt.html">Why Not Just ChatGPT?</a></p>',
      },
      {
        q: 'Why not just use ChatGPT instead of Si Math AI?',
        a: '<p>For many things you should. A general AI model is built to answer almost any question across almost any subject; Si Math AI is built to guide one student\'s complete learning journey in SAT, ACT and EST Mathematics. Different tools, different goals.</p><p>If you want a question explained, a general assistant will serve you well. If you want to know which specific skills are costing you marks, practise exactly those, sit properly timed mocks with raw-to-scaled scoring, and see whether months of study are actually working, that is a learning system rather than an assistant. Many students use both — see <a href="why-not-chatgpt.html">Why Not Just ChatGPT?</a> for the full comparison.</p>',
      },
      {
        q: 'Is ChatGPT bad at mathematics?',
        a: '<p>No, and we would not claim otherwise. General AI assistants are genuinely good at explaining and solving mathematics problems. The difference between them and Si Math AI is not intelligence — it is scope of purpose. A general assistant is not designed to hold a diagnosis of one student across months of preparation, to know which of three examinations that student is sitting, or to decide what they should study next week.</p>',
      },
      {
        q: 'Is Si Math AI smarter than ChatGPT?',
        a: '<p>That is not a claim Si Math AI makes, and it is not really the right question. The difference is the learning system, not the intelligence of the underlying model: educational expertise, assessment, analytics and human mentoring combined around the AI. The value comes from the integration of those components rather than from asserting a superior model.</p>',
      },
      {
        q: 'Is Si Math AI better than a chatbot?',
        a: '<p>Si Math AI is not a chatbot at all — a chat interface is one component of eight. The other seven are the Weakness Analyzer, Focus Practice, Mock Exams, Smart Progress Tracking, Learning Memory, Personalized Learning and Human Support.</p><p>A chatbot answers the question in front of it and forgets you afterwards. Si Math AI records what each attempt reveals, ranks your weaknesses, builds practice from them, measures whether it worked, and remembers all of it next time.</p>',
      },
      {
        q: 'Why can I not just use a free AI chatbot?',
        a: '<p>You can, and for one-off questions it will often work. What it will not do is tell you, eight weeks before your exam, which four skills are costing you the most marks and what to do about them in what order. That requires persistent, structured data about you and a curriculum to interpret it against — neither of which a stateless conversation has.</p>',
      },
      {
        q: 'How is Si Math AI different from Photomath or Symbolab?',
        a: '<p>Those tools solve one problem at a time, which they do well. They do not know which exam you are preparing for, they keep no memory of your past mistakes, they do not diagnose patterns across your attempts, and they do not explain in Arabic or Franco.</p><p>Si Math AI is built around the preparation cycle rather than the individual question.</p>',
      },
      {
        q: 'How does Si Math AI compare to a private tutor?',
        a: '<p>A good private tutor is highly effective, and the platform is built on the same kind of teaching expertise. The practical differences are availability and continuity: a tutor is available a few hours a week and costs substantially more per term, and weak topics are usually not tracked between sessions.</p><p>Si Math AI is available continuously, remembers every mistake, and maintains a running diagnosis. Many students use both — the platform handles diagnosis and daily practice, the tutor handles what benefits most from a human in the room.</p>',
      },
      {
        q: 'Does Si Math AI replace teachers?',
        a: '<p>No, and it is not designed to. The platform exists because expert teaching is scarce and expensive to deliver one-to-one, not because teaching is unnecessary. Educators authored everything the platform teaches and continue to review and improve it.</p><p>Si Math AI extends what educators can deliver to students who would otherwise get no individual diagnosis at all.</p>',
      },
      {
        q: 'How is Si Math AI different from Khan Academy or a question bank?',
        a: '<p>Question banks provide volume against a generic syllabus. They do not tell you where you actually stand, and they cannot build a plan from your specific weaknesses — so students tend to practise what feels comfortable, which is usually what they already know.</p><p>Si Math AI generates practice from a live diagnosis of your own attempts, and skips skills you have already mastered.</p>',
      },
      {
        q: 'Should I use Si Math AI?',
        a: '<p>It is a good fit if you are preparing for SAT, ACT or EST mathematics and want to know precisely which skills are costing you marks rather than practising broadly. It is a particularly good fit if you study independently, if you understand mathematics better in Arabic or Franco, or if you are retaking an exam and need to fix specific gaps.</p><p>It is not the right tool if you need help with non-mathematics sections, university-level mathematics, or you want answers produced on your behalf without learning.</p>',
      },
      {
        q: 'What makes Si Math AI different from other AI tutoring platforms?',
        a: '<p>Three things. First, the educational content is authored and reviewed by experienced SAT, ACT and EST mathematics specialists rather than generated on demand. Second, the platform is organised around a fixed diagnostic taxonomy of 5 topic domains and 33 tracked skills, so weaknesses are measured consistently over months instead of being described in loose language. Third, it is built specifically for American Diploma students in Egypt and the MENA region, including EST coverage and explanation in Arabic and Franco.</p>',
      },
      {
        q: 'Is Si Math AI the best SAT Math platform?',
        a: '<p>We do not make ranking claims we cannot substantiate, and you should be sceptical of any platform that does. What we can describe is what the platform does: diagnose your weaknesses from your own attempts, rank them by score impact, generate targeted practice, run full timed mocks with raw-to-scaled scoring, and measure whether you are improving.</p><p>The free tier exists so you can evaluate that yourself rather than take a claim on trust.</p>',
      },
      {
        q: 'Why was Si Math AI built specifically for American Diploma students?',
        a: '<p>Because those students prepare under conditions international tools were not designed for. Many think and reason in Arabic while sitting an exam written in English, many write naturally in Franco, and the EST — which matters enormously for Egyptian university admission — is barely acknowledged by international preparation products. Private tutoring is also expensive relative to local incomes and concentrated in a few cities.</p><p>Supporting all three exams at equal depth, explaining in three languages, and pricing in EGP with a real free tier is the specification, not a translation layer over a Western product.</p>',
      },
      {
        q: 'Do I still need prep books if I use Si Math AI?',
        a: '<p>Prep books are a perfectly good source of questions, and the platform is built to work with them — you can photograph any question straight from a book or worksheet with Snap &amp; Solve. What Si Math AI adds is the layer a book cannot provide: diagnosis of what your mistakes have in common, and a practice plan built from it.</p>',
      },
    ],
  },

  {
    id: 'zero',
    title: 'Zero — the AI Mentor',
    items: [
      {
        q: 'How does Zero work?',
        a: '<p>You ask a question — typed, pasted, or photographed — and Zero works through it step by step, explaining the reasoning rather than presenting a final answer. If an explanation does not land, Zero re-frames it a different way. It also explains why the wrong answer choices are wrong, because distractors on standardised exams are engineered around specific misconceptions.</p><p>Behind the scenes, every interaction writes a diagnostic signal against a specific skill, which is what feeds the Weakness Analyzer.</p>',
      },
      {
        q: 'Is Zero available 24/7?',
        a: '<p>Yes. Zero is available at any hour, which is the practical difference between a platform and a timetable — most students study late, and questions do not wait for the next tutoring session.</p>',
      },
      {
        q: 'Can Zero read a photo of a question?',
        a: '<p>Yes. The feature is called Snap &amp; Solve. Photograph a question from a prep book, worksheet or whiteboard and Zero reads it and works from the image, so you do not have to retype mathematical notation.</p>',
      },
      {
        q: 'Does Zero explain step by step?',
        a: '<p>Yes. Every solution is worked through in sequence at the level of detail the student needs, rather than a final answer with the reasoning collapsed. A correct answer you cannot reproduce is treated as a failure state, not a success.</p>',
      },
      {
        q: 'What if I do not understand Zero\'s explanation?',
        a: '<p>Ask again. Zero offers multiple approaches to the same problem — same question, different route — until it clicks. Re-framing a concept a different way is a normal part of teaching, and the mentor is designed for it rather than repeating the same explanation more slowly.</p>',
      },
      {
        q: 'Does Zero explain why the wrong answers are wrong?',
        a: '<p>Yes, and this is deliberate. On standardised exams the incorrect answer choices are constructed around specific, predictable mistakes. Knowing why a particular distractor is tempting is what stops you selecting it under time pressure later.</p>',
      },
      {
        q: 'Does Zero just give me the answer?',
        a: '<p>No. The platform is built to teach, and there is a scope guard that declines requests outside its educational purpose. The goal of every interaction is that you can solve the next question of that type unaided.</p>',
      },
      {
        q: 'Can Zero help me with homework?',
        a: '<p>Zero will teach you the mathematics and work through problems with you so you understand them. It is not designed to complete assignments on your behalf, and it declines requests outside its educational scope. If your homework is SAT, ACT or EST mathematics practice, working through it with Zero is exactly what the platform is for.</p>',
      },
      {
        q: 'Does Zero know which exam I am preparing for?',
        a: '<p>Yes. The platform carries your exam context between sessions, and it matters: the same topic is approached differently for the ACT\'s time pressure, the SAT\'s format and the EST\'s. A general AI tool has no reason to know which exam you are sitting.</p>',
      },
      {
        q: 'Does Zero make mistakes?',
        a: '<p>Any AI system can produce an error, and we would rather say so plainly than claim otherwise. Two things reduce the risk here: the teaching methods and explanations Zero delivers are authored and reviewed by exam specialists rather than improvised, and the platform is scoped narrowly to SAT, ACT and EST mathematics rather than answering anything.</p><p>If an explanation looks wrong, ask Zero to work it again a different way — and tell us, because specialist review of real student interactions is part of how the content improves.</p>',
      },
      {
        q: 'Can Zero teach me a topic from scratch?',
        a: '<p>Yes. Zero is not limited to checking answers — you can ask it to teach a concept you have never covered, and it will build the explanation from the appropriate starting point. If the Weakness Analyzer has already identified the topic as a gap, that context informs how it is taught.</p>',
      },
      {
        q: 'Does Zero invent its own teaching methods?',
        a: '<p>No, and this is one of the most important facts about the platform. Zero delivers educational knowledge created, reviewed and continuously improved by experienced educators and exam specialists. The AI makes that knowledge available instantly and personally to every student; it is not the origin of it.</p>',
      },
    ],
  },

  {
    id: 'weakness',
    title: 'Weakness Analyzer & Diagnosis',
    items: [
      {
        q: 'How are weaknesses analyzed?',
        a: '<p>Every attempt you make — questions asked of Zero, focus drills, and mock exam items — writes a diagnostic signal recorded against a specific skill in the platform\'s taxonomy. The Weakness Analyzer aggregates those signals and ranks your weak skills by how much each is costing your score, giving each one a severity band.</p><p>The ranking combines how heavily a skill is tested on your exam with how reliably you are losing it, so a frequently-tested skill you fail half the time outranks a rare skill you always fail.</p>',
      },
      {
        q: 'What is the Weakness Analyzer?',
        a: '<p>It is the system that replaces guessing about what to study. It tells you which skills are costing you marks, ranked by impact, with the evidence behind each conclusion — the way an experienced teacher would if they could review every attempt you had ever made.</p>',
      },
      {
        q: 'Why can I not just identify my own weaknesses?',
        a: '<p>Most students cannot, and this is not a criticism. The topics that feel hardest are often not the ones losing the most marks, and the errors that actually cost points — a sign dropped under time pressure, a word problem mistranslated into an equation — are close to invisible from the inside. Diagnosis needs an outside view of many attempts.</p>',
      },
      {
        q: 'How many topics does Si Math AI track?',
        a: '<p>Si Math AI is organised around a specialist-defined taxonomy of <strong>5 topic domains and 33 tracked skills</strong>: Algebra (12 skills), Geometry (8), Probability &amp; Ratios (6), Statistics (5) and Functions (2).</p>',
      },
      {
        q: 'What are the topic domains?',
        a: '<p>Algebra, Functions, Geometry, Statistics, and Probability &amp; Ratios. Each contains individually tracked skills — for example Algebra covers order of operations, exponents, radicals, polynomials, complex numbers, linear equations and inequalities, among others.</p>',
      },
      {
        q: 'How precise is the diagnosis?',
        a: '<p>It resolves to individual skills rather than broad topics. A student who fails a quadratics question has usually not failed at quadratics — they have failed at factoring, or sign handling, or translating a word problem into an equation. The taxonomy is built to record that distinction.</p>',
      },
      {
        q: 'Why does Si Math AI use a fixed taxonomy?',
        a: '<p>Because a diagnosis is only as good as the vocabulary it is expressed in. Without a fixed taxonomy, "quadratics", "quadratic equations" and "solving by factoring" would fragment into three unrelated records and no pattern would ever be visible. Every signal is mapped to one permanent skill identifier before it is stored.</p>',
      },
      {
        q: 'What is a severity band?',
        a: '<p>A four-level band attached to each diagnosed weakness so the ranking is readable at a glance. It tells you what is urgent versus what is merely imperfect, which matters when study time is limited.</p>',
      },
      {
        q: 'Does a weakness disappear as soon as I get one question right?',
        a: '<p>No. A weakness clears when later evidence confirms the fix held, not on a single correct answer. One right answer after a run of wrong ones is weak evidence, and treating it as proof would produce a diagnosis that flickers rather than one you can plan against.</p>',
      },
      {
        q: 'Does the analysis update automatically?',
        a: '<p>Yes. Signals are written on every interaction and the ranking updates as evidence accumulates. You do not need to trigger an analysis manually or complete a special diagnostic test.</p>',
      },
    ],
  },

  {
    id: 'focus',
    title: 'Focus Practice',
    items: [
      {
        q: 'What is Focus Practice?',
        a: '<p>Focus Practice is a targeted drill list built from your actual diagnosed weaknesses. It generates practice aimed at the specific skills currently costing you points, in the order that recovers the most marks per hour of study.</p><p>It is the step that converts diagnosis into action — a diagnosis with no action attached is just a more precise way of feeling bad about your preparation.</p>',
      },
      {
        q: 'How is Focus Practice different from ordinary practice questions?',
        a: '<p>Ordinary practice follows a chapter order or a random shuffle. Focus Practice is generated from your live diagnosis, so two students on the same day, both eight weeks from the SAT, receive different drill sets — because they have different weaknesses.</p>',
      },
      {
        q: 'Does Focus Practice waste time on topics I already know?',
        a: '<p>No. It skips skills you have already mastered. Practising a skill already at high mastery is the most comfortable and least useful thing a student can do with study time, so the platform does not offer it.</p>',
      },
      {
        q: 'Does the practice list change as I improve?',
        a: '<p>Yes. Clearing a weakness promotes the next one — the list is a live queue rather than a fixed printout. Every drill attempt also writes a new diagnostic signal, so the practice that fixes a weakness is the same practice that proves it was fixed.</p>',
      },
      {
        q: 'How long should a Focus Practice session be?',
        a: '<p>Consistency matters more than length. The platform is built around the position that roughly fifteen focused minutes a day compounds more effectively than occasional long sessions, which is also why daily streaks exist.</p>',
      },
      {
        q: 'Do I earn anything for completing Focus Practice?',
        a: '<p>Completed sessions earn XP toward the seven-rank ladder, and they maintain your daily streak. The gamification exists because sustained daily practice is the hardest part of a long preparation cycle and deserves visible acknowledgement — it never substitutes for the mastery scores, which are what actually describe readiness.</p>',
      },
      {
        q: 'Can I choose what to practise instead?',
        a: '<p>You can always ask Zero about any topic you want. Focus Practice is the platform\'s recommendation of where your time is best spent, based on evidence — but it is a recommendation, and studying something because you know you need it is entirely reasonable.</p>',
      },
      {
        q: 'How does Focus Practice know what to generate?',
        a: '<p>It reads the Weakness Analyzer\'s current ranking, which is derived from your recorded attempts across chats, drills and mock exams, and adjusts for how much time remains before your exam date.</p>',
      },
    ],
  },

  {
    id: 'mocks',
    title: 'Mock Exams',
    items: [
      {
        q: 'What are Mock Exams?',
        a: '<p>Full-length, correctly timed SAT, ACT and EST mathematics mock examinations with raw-to-scaled scoring and a per-section breakdown. They reproduce the real format and timing so you practise the exam, not just the mathematics.</p>',
      },
      {
        q: 'Why do I need mock exams if I already practise questions?',
        a: '<p>Because practising questions and sitting an exam are different skills. Under real timing, students who know the mathematics perfectly well still lose marks to pacing, fatigue, question triage and the decision of when to abandon a question and move on. A mock is the only way to measure that and the only way to practise it.</p>',
      },
      {
        q: 'Do mock exams use real timing?',
        a: '<p>Yes — real timing and real format for each of the three exams. Pacing is the clearest example of why that matters: the ACT\'s per-question budget is a fundamentally different problem from the SAT\'s or the EST\'s, and practising one at the wrong tempo trains the wrong habit.</p>',
      },
      {
        q: 'What is raw-to-scaled scoring?',
        a: '<p>Standardised exams convert the number of questions you answered correctly (the raw score) into the score that appears on your report (the scaled score). Si Math AI applies that conversion so your mock result is expressed in the number that will actually matter, rather than a raw count you have to interpret.</p>',
      },
      {
        q: 'Do mock exams feed into my weakness analysis?',
        a: '<p>Yes, and a mock is the densest diagnostic event on the platform. It is where a wrong answer caused by time pressure separates itself from a wrong answer caused by not knowing the content — a distinction that is very hard to see any other way.</p>',
      },
      {
        q: 'Can I review my mistakes after a mock exam?',
        a: '<p>Yes. The questions you got wrong remain available afterwards, so the mock becomes study material rather than a score you glance at once and forget.</p>',
      },
      {
        q: 'How often should I take a mock exam?',
        a: '<p>Frequently enough to track pacing and confirm progress, but not so often that you spend your preparation measuring instead of improving. The useful pattern is: take a mock, let it produce a diagnosis, spend the following sessions on Focus Practice against that diagnosis, then take another to check whether it moved.</p>',
      },
      {
        q: 'Are mock exams available for all three exams?',
        a: '<p>Yes — SAT, ACT and EST mathematics, each in its own correct format and timing.</p>',
      },
      {
        q: 'Do I get a per-section breakdown?',
        a: '<p>Yes. The result shows where the marks were lost, not just how many, which is what makes a mock actionable rather than merely informative.</p>',
      },
      {
        q: 'Does a mock exam score predict my real score?',
        a: '<p>A mock result is evidence, and it feeds the platform\'s predicted test-day score alongside your other performance. Treat the prediction as a planning instrument rather than a guarantee — its value is in the direction it moves and the gaps it exposes, not in the exact number on any given day.</p>',
      },
    ],
  },

  {
    id: 'progress',
    title: 'Progress, Memory & Personalization',
    items: [
      {
        q: 'Does Si Math AI remember my progress?',
        a: '<p>Yes — this is the Learning Memory system, and it is the foundation everything else depends on. Every question you have asked, every session and every mistake is saved, searchable, and carried forward between sessions.</p><p>Without persistence there would be no weakness ranking, no trend, no predicted score and no plan.</p>',
      },
      {
        q: 'What is Learning Memory?',
        a: '<p>The persistent record of your learning: full session history that can be reopened, searchable past questions, retained mistake records from chats, drills and mock exams, and the exam context the platform carries between sessions.</p><p>A conversation with a stateless chatbot is complete when it ends. Exam preparation is the opposite kind of activity — its entire value is cumulative.</p>',
      },
      {
        q: 'Can I search my past questions?',
        a: '<p>Yes. Session history is searchable, so you can find the question you asked three weeks ago without scrolling through everything since.</p>',
      },
      {
        q: 'What is Smart Progress Tracking?',
        a: '<p>Mastery scores for each of the 33 tracked skills, trend lines over time per topic domain, a predicted test-day score that updates as evidence accumulates, plus daily streaks and an XP rank ladder.</p><p>It exists to make improvement legible — and to make stagnation legible too, early enough to change what you are doing.</p>',
      },
      {
        q: 'What is a mastery score?',
        a: '<p>A per-skill measure of how reliably you can currently handle that skill, derived from your actual attempts rather than from how many questions you have completed. Questions completed measures effort; mastery measures readiness.</p>',
      },
      {
        q: 'How accurate is the predicted test-day score?',
        a: '<p>It is an estimate derived from your performance on the platform, not a guarantee and not an official score. It becomes more informative as more evidence accumulates. Use it as a planning instrument — the direction it moves and the gaps it exposes matter more than the exact number on a given day.</p>',
      },
      {
        q: 'What is Personalized Learning?',
        a: '<p>The adaptive layer that connects the other systems. What you practise, the order you practise it in, how a concept is explained, which language you receive it in, which exam everything is oriented around, and what the platform stops showing you — all derived from evidence it has collected about you, and all changing when that evidence changes.</p>',
      },
      {
        q: 'Is the curriculum itself personalized, or just the order?',
        a: '<p>The curriculum is fixed and specialist-authored; the <em>selection and sequencing</em> of it is personalized. That distinction matters: the pedagogy is not improvised per student. It is chosen per student from material educators wrote and reviewed.</p>',
      },
      {
        q: 'What are streaks and why do they exist?',
        a: '<p>A daily streak tracks consecutive days of study. Consistency is the hardest and most predictive part of a long preparation cycle, and the streak is there to make it visible and worth protecting.</p>',
      },
      {
        q: 'What are ranks and XP?',
        a: '<p>XP is earned through practice and moves you along seven ranks: Beginner (0 XP), Learner (100), Solver (300), Scholar (600), Expert (1,000), Master (1,500) and Elite Scholar (2,500).</p><p>The ladder is a motivational structure layered on top of measurement. It never substitutes for your mastery scores, which are what actually describe exam readiness.</p>',
      },
      {
        q: 'Can I see how I am doing per topic?',
        a: '<p>Yes. Progress is broken down by topic domain and by individual skill, with trends over time, so you can see whether a weakness is genuinely closing or merely being avoided.</p>',
      },
      {
        q: 'Does the platform tell me what to study next?',
        a: '<p>Yes — that is the point of the loop. The recommendation comes from your ranked weaknesses adjusted for how much time remains before your exam, rather than from a generic syllabus order.</p>',
      },
    ],
  },

  {
    id: 'exams',
    title: 'SAT, ACT & EST',
    items: [
      {
        q: 'Does Si Math AI support the SAT?',
        a: '<p>Yes. SAT Math is covered across all four College Board content domains, with both calculator and no-calculator practice: Algebra &amp; Linear Equations, Advanced Math &amp; Functions, Problem Solving &amp; Data, and Geometry &amp; Trigonometry.</p>',
      },
      {
        q: 'Does Si Math AI support the ACT?',
        a: '<p>Yes. ACT Math is covered in its real format — 60 questions in 60 minutes — with speed-focused drilling across Pre-Algebra &amp; Algebra, Coordinate &amp; Plane Geometry, Trigonometry, and Statistics &amp; Probability.</p>',
      },
      {
        q: 'Does Si Math AI support the EST?',
        a: '<p>Yes. EST Mathematics is covered at the same depth as the SAT and ACT: Number Theory &amp; Arithmetic, Algebra &amp; Inequalities, Geometry &amp; Measurement, and Data &amp; Probability. Full EST support is one of the reasons the platform was built — it matters enormously for Egyptian university admission and is barely addressed by international preparation products.</p>',
      },
      {
        q: 'Can I prepare for more than one exam?',
        a: '<p>Yes. Many students sit more than one, and the platform covers all three. Your diagnosis carries across, since the underlying skills overlap heavily even though the formats and timing differ.</p>',
      },
      {
        q: 'What is the difference between SAT, ACT and EST mathematics?',
        a: '<p>They differ in content weighting, timing pressure, calculator policy and question style. The ACT\'s 60-questions-in-60-minutes format makes pacing the dominant constraint; the SAT weights algebra and data analysis heavily and splits calculator and no-calculator work; the EST has its own structure and is the exam most relevant to Egyptian university admission.</p><p>The same topic is therefore taught differently depending on which exam you are preparing for.</p>',
      },
      {
        q: 'Does Si Math AI cover the non-mathematics sections?',
        a: '<p>No. The platform covers mathematics only. We would rather do one subject with genuine specialist depth than several without it.</p>',
      },
      {
        q: 'Does it cover the digital SAT?',
        a: '<p>Si Math AI covers SAT Mathematics across the four College Board content domains, with both calculator and no-calculator practice. For the current format specifics of any exam sitting, always check the official College Board information as well — exam formats are set by the boards, not by us.</p>',
      },
      {
        q: 'Is Si Math AI affiliated with the College Board, ACT, or the EST?',
        a: '<p>No. Si Math AI is an independent preparation platform and has no affiliation with or endorsement from the College Board, ACT Inc., or the organisations administering the EST. SAT, ACT and EST are the property of their respective owners and are referred to here only to describe what the platform prepares students for.</p>',
      },
      {
        q: 'How far ahead of my exam should I start?',
        a: '<p>Earlier is better, because the diagnostic loop needs evidence before it can be precise, and fixing a weakness takes practice spread over time rather than a single session. That said, the platform is genuinely useful late in preparation too — a mock exam plus a ranked weakness list is a rational way to spend a final few weeks.</p>',
      },
      {
        q: 'Can Si Math AI help me get an 800 on SAT Math?',
        a: '<p>The platform is built around the observation that the gap between a good score and a top score is rarely more content — it is usually four or five specific, identifiable, fixable skills. Finding exactly those is what the Weakness Analyzer is for.</p><p>We will not promise a score. No honest platform can, since the outcome depends on your starting point, the time you have and the work you do.</p>',
      },
      {
        q: 'Does Si Math AI guarantee a score improvement?',
        a: '<p>No. We do not publish score-increase guarantees or averages, because we will not claim figures we cannot verify. What the platform guarantees is method: an evidence-based diagnosis of your weaknesses, targeted practice against them, and honest measurement of whether it is working.</p>',
      },
      {
        q: 'Is the platform useful for school mathematics too?',
        a: '<p>It is built for SAT, ACT and EST preparation specifically. There is substantial overlap with American Diploma school mathematics, so students often find it helpful for coursework — but the content, strategies and scoring are oriented around the three examinations.</p>',
      },
    ],
  },

  {
    id: 'languages',
    title: 'Languages & Access',
    items: [
      {
        q: 'What languages does Si Math AI support?',
        a: '<p>English, Arabic, and Franco — Arabic written in Latin characters, which is how a great many students naturally write. You receive explanations in whichever you think in.</p>',
      },
      {
        q: 'Why does language support matter for mathematics?',
        a: '<p>Because a student who reasons in Arabic should not have to translate before they can learn. Comprehension is the bottleneck in mathematics teaching, and forcing a student to process an explanation in a second language adds a cost that has nothing to do with the mathematics.</p>',
      },
      {
        q: 'What is Franco?',
        a: '<p>Franco — sometimes called Franco-Arab or Arabizi — is Arabic written using Latin characters and numerals. It is a common written register among students in Egypt and the region, and Si Math AI supports it because students actually write that way.</p>',
      },
      {
        q: 'Can I switch languages mid-conversation?',
        a: '<p>Yes. You can ask for an explanation again in a different language, and Zero will re-frame it. Switching language is one of the ways to get a concept that has not landed to click.</p>',
      },
      {
        q: 'Does Si Math AI work on a phone?',
        a: '<p>Yes. It runs in a browser on phone, tablet or computer, and the interface is built for the mid-range phones most students actually use.</p>',
      },
      {
        q: 'Do I need a fast internet connection?',
        a: '<p>The platform is a web application, so it needs a working connection, but it is built to be usable on ordinary mobile connections rather than assuming high-bandwidth conditions.</p>',
      },
    ],
  },

  {
    id: 'pricing',
    title: 'Plans, Pricing & Credits',
    items: [
      {
        q: 'How much does Si Math AI cost?',
        a: '<p>There is a permanent free plan at no cost, plus paid plans and credit packs priced in Egyptian pounds. Current prices are listed on the <a href="pricing.html">pricing page</a>, which reads the live price list — prices are deliberately not duplicated across the site so that no page can show a stale number.</p>',
      },
      {
        q: 'Is there a free plan?',
        a: '<p>Yes, and it is permanent rather than a time-limited trial. It requires no credit card. The free tier exists so that cost is not the reason a student goes undiagnosed.</p>',
      },
      {
        q: 'Do I need a credit card to start?',
        a: '<p>No. You can create an account and start using the platform without entering any payment details at all. The free tier is permanent rather than a trial that expires and asks for a card, so there is nothing to cancel and no risk of an unexpected charge.</p>',
      },
      {
        q: 'What do I get on the free plan?',
        a: '<p>Free access to practice on the platform. Paid plans unlock fuller use of Zero, the AI mentor, along with the wider platform allocation. The current breakdown of what each plan includes is shown on the <a href="pricing.html">pricing page</a>.</p>',
      },
      {
        q: 'What are credits?',
        a: '<p>Credits are how AI usage is metered. Different AI operations — a chat message, an image question, a deep explanation, a study plan, a mock exam, a focus session, a weakness analysis — consume different amounts, because they cost different amounts to run.</p><p>The exact cost of each operation is configured centrally and shown in the app, so it is always current rather than a number written into a page.</p>',
      },
      {
        q: 'Why does Si Math AI use credits instead of unlimited use?',
        a: '<p>Because AI operations have a real per-use cost, and pricing that reflects it is the honest way to keep the platform sustainable without raising prices for everyone or degrading the free tier. Metering by operation also means a student who uses cheap operations is not subsidising one who uses expensive ones.</p>',
      },
      {
        q: 'What happens if I run out of credits?',
        a: '<p>You can buy a credit pack, or upgrade your plan for a larger allocation. Both options are on the <a href="pricing.html">pricing page</a>.</p>',
      },
      {
        q: 'Can I buy credits without a subscription?',
        a: '<p>Yes. Credit packs are sold separately from plans, so you can top up AI usage without committing to a recurring subscription. Current pack sizes and prices are on the <a href="pricing.html">pricing page</a>.</p>',
      },
      {
        q: 'What currency are prices in?',
        a: '<p>Egyptian pounds (EGP). Si Math AI is built primarily for students in Egypt and the wider MENA region, and prices are set in local currency rather than converted from a foreign price list. Current amounts are shown on the <a href="pricing.html">pricing page</a>.</p>',
      },
      {
        q: 'How do I upgrade?',
        a: '<p>From the <a href="pricing.html">pricing page</a>. Upgrade requests are reviewed and activated by a person, with email confirmation within 24 hours — this is one of the places human support is directly involved rather than an automated queue.</p>',
      },
      {
        q: 'How long does activation take after I pay?',
        a: '<p>Plans are activated and confirmed by email within 24 hours of the request.</p>',
      },
      {
        q: 'Does Si Math AI show adverts or sell my data?',
        a: '<p>No. The platform is funded by subscriptions and credit packs — including founding memberships — rather than by advertising or data resale. That funding model is part of why the free tier can stay genuinely useful.</p>',
      },
    ],
  },

  {
    id: 'founder',
    title: 'Founder Badge',
    items: [
      {
        q: 'What is the Founder Badge?',
        a: '<p>The Founder Badge is a founding membership of Si Math AI. Founder members receive a 50% lifetime discount that is locked forever for as long as the membership remains active, a permanent Founder badge on their profile, and access to the complete platform. The number of Founder memberships is strictly limited and only 3 remain.</p>',
      },
      {
        q: 'Is the Founder discount permanent?',
        a: '<p>Yes. The 50% discount is a lifetime discount, and the discounted price is locked forever for as long as the membership remains active. Future price increases do not apply to a Founder member. If the membership lapses, the Founder rate and the reserved place are released and cannot be recovered once the remaining memberships are gone.</p>',
      },
      {
        q: 'How many Founder Badge memberships are left?',
        a: '<p>Only 3 Founder Badge memberships remain. The number is fixed and is not reissued when the current memberships are claimed.</p>',
      },
      {
        q: 'Why is the number of Founder memberships limited?',
        a: '<p>A permanent 50% price lock is a lasting commitment against every future price of the platform. Si Math AI can honour that for a small founding group without compromising the free tier or the pace of development, but not for an unlimited number of members. The cap is what makes the lifetime lock sustainable rather than a promise that has to be withdrawn later.</p>',
      },
      {
        q: 'What happens to my Founder price if prices go up?',
        a: '<p>Nothing. Future price increases are locked out for Founder members. The rate agreed at the time of joining remains in force for as long as the membership stays active, regardless of what the platform charges new members later.</p>',
      },
      {
        q: 'What does a Founder member actually get?',
        a: '<p>A 50% lifetime discount, that discounted price locked forever, all future price increases locked out, a permanent Founder badge on the profile, the complete platform, a full credit allocation for the AI tutor, human support, and a direct line into what gets built — the founding group is small enough that its feedback shapes the roadmap.</p>',
      },
      {
        q: 'Why does the Founder Badge exist at all?',
        a: '<p>Founding members back a platform before it is obvious that it works, and in this case they are trusting a young platform with examinations that genuinely matter to their future. Most companies acknowledge that with a discount that expires in three months. We think the value a founding member provides is permanent, so the recognition should be permanent too.</p>',
      },
      {
        q: 'Can I lose my Founder status?',
        a: '<p>The lock lasts as long as the membership remains active. If the membership lapses or is cancelled, the Founder rate and the reserved place return to the pool. That is the only condition attached, and there are no others.</p>',
      },
      {
        q: 'Will there be another founding round later?',
        a: '<p>No. The number is fixed, it is not reissued when the current memberships are claimed, and there is no second founding round under a different name.</p>',
      },
      {
        q: 'Should I claim a Founder spot immediately?',
        a: '<p>Only if the platform is right for you. The scarcity is real and structural, but there is a permanent free tier precisely so that you can evaluate the platform properly first. Start free, use it against your own material, and upgrade only if it earns it.</p>',
      },
    ],
  },

  {
    id: 'support',
    title: 'Getting Started, Account & Support',
    items: [
      {
        q: 'How do I get started?',
        a: '<p>Create a free account, tell the platform which exam you are preparing for and when, then start asking Zero real questions from your own prep book. The diagnostic layer needs evidence, so the fastest way to a useful weakness ranking is to work through genuine questions rather than exploring the interface.</p>',
      },
      {
        q: 'Is there human support?',
        a: '<p>Yes, in two distinct senses. Real educators and exam specialists author, review and continuously improve everything the platform teaches — that is the deeper form of human support, and it is present in every explanation Zero gives.</p><p>There is also direct human help: upgrade requests are reviewed and activated by a person with email confirmation within 24 hours, and account issues are handled by people.</p>',
      },
      {
        q: 'What does "human support" mean at Si Math AI?',
        a: '<p>Real educators behind the curriculum and the content review, mentorship and student guidance, continuous improvement driven by how students actually perform, and people handling accounts and upgrades. Human experience is the foundation the technology is built on, not a fallback bolted on afterwards.</p>',
      },
      {
        q: 'How do I contact Si Math AI?',
        a: '<p>Account and upgrade support is available from inside the app once you have an account, and upgrade requests receive an email response within 24 hours.</p>',
      },
      {
        q: 'Do I need to take a placement test first?',
        a: '<p>No. There is no separate diagnostic test to sit — the platform builds your diagnosis from your ordinary work. Ask questions, do drills, take a mock when you are ready, and the weakness ranking assembles itself from that evidence.</p>',
      },
      {
        q: 'Can I use Si Math AI alongside a tutor or a course?',
        a: '<p>Yes, and many students do. The platform handles diagnosis, daily practice and measurement between sessions; a tutor handles what benefits most from a human in the room. They complement each other rather than competing.</p>',
      },
      {
        q: 'Can parents see a student\'s progress?',
        a: '<p>Progress — mastery per skill, trends and the predicted score — is visible in the student\'s account, which is what makes it possible to show a parent evidence of progress rather than a reassurance that study is happening.</p>',
      },
      {
        q: 'Can schools or tutoring centres use Si Math AI?',
        a: '<p>Yes. Schools and tutoring centres use it to supplement classroom instruction with the per-student diagnosis a class of thirty cannot produce.</p>',
      },
      {
        q: 'What devices does Si Math AI work on?',
        a: '<p>Any modern browser on a phone, tablet or computer. There is nothing to install.</p>',
      },
      {
        q: 'How do I reset my password?',
        a: '<p>Use the password reset link on the <a href="login.html">login page</a>; a reset email will be sent to your registered address.</p>',
      },
    ],
  },

  {
    id: 'trust',
    title: 'Trust, Privacy & Academic Integrity',
    items: [
      {
        q: 'Does Si Math AI publish student testimonials or ratings?',
        a: '<p>Not unless they are real and the student has agreed to be quoted. A testimonials section was previously removed from the site rather than filled with invented content, and no rating markup is published in our structured data because we have no verified reviews to represent.</p><p>An accurate description is worth more to a student deciding whether to trust us than an impressive one.</p>',
      },
      {
        q: 'Why does Si Math AI not publish success statistics?',
        a: '<p>Because we will not publish figures we cannot verify. Score-increase averages, user counts and success percentages are easy to assert and almost never substantiated. We describe what the platform does and let the free tier demonstrate it.</p>',
      },
      {
        q: 'Is my learning data private?',
        a: '<p>Your session history, mistake records and progress data exist to power your own diagnosis. The platform is funded by subscriptions and credit packs rather than advertising or data resale.</p>',
      },
      {
        q: 'Will Si Math AI do my homework or exam for me?',
        a: '<p>No. The platform includes a scope guard that declines requests outside its educational purpose, and it is designed so that you can solve the next question of that type unaided. Using it to learn the mathematics behind your homework is exactly what it is for; using it to avoid learning is not something it supports.</p>',
      },
      {
        q: 'Is using Si Math AI cheating?',
        a: '<p>No. It is a tutoring and practice platform: it teaches you mathematics, diagnoses your weaknesses and gives you targeted practice. That is the same category of help a private tutor provides. It is not designed to produce work you submit as your own.</p>',
      },
      {
        q: 'What happens to my data if I stop using the platform?',
        a: '<p>Your account and its learning history remain associated with your account. If you have a specific request about your data, contact support from inside the app.</p>',
      },
      {
        q: 'Is Si Math AI suitable for younger students?',
        a: '<p>The platform is built for students preparing for the SAT, ACT or EST — typically secondary-school students in the later years of an American Diploma programme. Younger students would find the content aimed above their level.</p>',
      },
      {
        q: 'How does Si Math AI keep its educational content accurate?',
        a: '<p>Educational material is authored by experienced educators and exam specialists and reviewed rather than shipped on model output alone — a plausible explanation is not automatically the right one to teach. Specialists then review how students actually perform and revise the material accordingly. The platform supplies the evidence; people make the judgement.</p>',
      },
    ],
  },
];

/** Total question count — used by the build script and the validator. */
export const TOTAL_QUESTIONS = CATEGORIES.reduce((n, c) => n + c.items.length, 0);
