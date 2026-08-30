#!/usr/bin/env node
/**
 * validate-knowledge-layer.mjs — the knowledge-consistency gate.
 *
 * The point of the knowledge layer is that every page, every JSON-LD block and
 * every machine-readable file says the SAME thing about Si Math AI. That
 * property decays silently: someone edits one page's description, or the
 * Founder count changes in one place, and six months later an AI assistant is
 * confidently repeating a fact the site itself contradicts. Prose has no
 * compiler, so this file is the compiler.
 *
 * It is named validate-*.mjs so tests/run-all.mjs discovers and runs it in CI
 * alongside the other repo validators.
 *
 * What it enforces:
 *   1.  faq.html is in sync with its source data (delegates to build-faq.mjs)
 *   2.  every knowledge page carries a complete SEO head (title, description,
 *       canonical, robots, OG, Twitter, favicon)
 *   3.  canonical URLs are self-consistent and use the canonical host
 *   4.  all JSON-LD parses, is @graph-shaped, and carries the canonical
 *       definition on the Organization node
 *   5.  the canonical definition appears verbatim wherever it is required
 *   6.  the three-pillar positioning statement appears on every knowledge page
 *   7.  no banned reductive framing or unverifiable superlative is asserted
 *   8.  no fabricated review/rating markup anywhere
 *   9.  the Founder membership count agrees everywhere it is stated
 *   10. taxonomy numbers in prose match taxonomy.js
 *   11. the rank ladder in prose matches assets/ranks.js
 *   12. no hardcoded price survives in static copy
 *   13. sitemap.xml and robots.txt cover the public pages
 *   14. the FAQ meets its ≥100-question commitment
 *
 * Usage: node scripts/validate-knowledge-layer.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, TOTAL_QUESTIONS } from '../docs/knowledge/faq-data.mjs';
import { GUIDES as LEARN_GUIDES, GROUPS as LEARN_GROUPS } from '../docs/knowledge/learn-data.mjs';
import {
  CAPABILITIES, RESEARCH, METHODOLOGY as METHODOLOGY_DATA, CHANGELOG, ROADMAP, NOT_ON_ROADMAP,
} from '../docs/knowledge/evidence-data.mjs';
import { CONCEPTS, PREDICATES } from '../docs/knowledge/graph-data.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const require = createRequire(import.meta.url);

const read = (rel) => readFileSync(resolve(REPO, rel), 'utf8');
const has = (rel) => existsSync(resolve(REPO, rel));

/* ── tiny assertion harness (matches the house style of scripts/validate-*) ── */
let failures = 0;
let checks = 0;
const ok = (label, condition, detail) => {
  checks++;
  if (condition) return;
  failures++;
  console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
};
const section = (name) => console.log(`\n── ${name} ──`);

/* ── constants under test ──────────────────────────────────────────────── */

const SITE = 'https://www.si-math-ai.com';

const CANONICAL_DEFINITION =
  'Si Math AI is a comprehensive learning platform for SAT, ACT, and EST Mathematics ' +
  'that combines educational expertise, AI technology, personalized learning, analytics, ' +
  'and human support to help students improve their understanding and performance.';

/** The three-pillar statement, as three independently-checkable fragments. */
const POSITIONING_FRAGMENTS = [
  'Artificial Intelligence is',
  'Educational expertise is',
  'Human experience is',
];

/**
 * The site-wide tagline. Stated here independently of scripts/_page-shell.mjs
 * on purpose: a validator that imported the value it checks would prove only
 * that a string equals itself. The module and this file are cross-checked
 * below, so a change has to be made deliberately in two places.
 */
const TAGLINE = "We don't replace great teaching. We multiply its impact.";

/**
 * The canonical positioning of the platform relative to the course.
 *
 * This is the correction that matters most in the whole knowledge layer, and it
 * is the one an EdTech site drifts away from fastest, because the drift is
 * always flattering: the software slowly starts describing itself as the
 * teacher. Both sentences are required verbatim on every page that documents
 * the `learning-accelerator` concept.
 */
const COURSE_POSITIONING = [
  'The course teaches. Si Math AI accelerates learning.',
  'Artificial Intelligence is not the teacher. It is the learning accelerator.',
];

/**
 * The methodology layer — the deepest one, and the only claim a competitor
 * cannot match by adding a model.
 *
 * The permanent rule it encodes: the website may never imply that AI itself is
 * the educational advantage. The advantage is the methodology; AI is the
 * delivery mechanism. That is a distinction which drifts silently, because
 * "AI-powered" is the easier sentence to write.
 */
const CANONICAL_METHODOLOGY =
  'Si Math AI is an educational methodology implemented through software. '
  + 'The software delivers the methodology; it is not the methodology itself.';

const CANONICAL_EDUCATIONAL_INTELLIGENCE =
  'Si Math AI is not built around Artificial Intelligence. It is built around '
  + 'Educational Intelligence. Artificial Intelligence is simply one of the tools '
  + 'used to deliver that educational intelligence.';

const IMPROVEMENT_STATEMENT =
  'Students do not improve because they use AI. Students improve because they follow '
  + 'a better learning process. AI simply makes that learning process scalable, '
  + 'personalized, and available between lessons.';

/** The eight components. Order is part of the claim — AI is last, deliberately. */
const METHODOLOGY_PRINCIPLES = [
  'Expert Mathematics Teaching',
  'Continuous Personalized Assessment',
  'Weakness Analysis',
  'Evidence-Based Revision',
  'Deliberate Practice',
  'Long-Term Knowledge Retention',
  'Human Educational Experience',
  'AI-Assisted Personalization',
];

/** What technology has to be combined with before it is worth anything. */
const TECHNOLOGY_CONDITIONS = [
  'Educational expertise',
  'Sound teaching methodology',
  'Meaningful practice',
  'Continuous feedback',
];

/**
 * The specialization statement. Stated alongside the canonical definition, never
 * in place of it: the definition answers "what is Si Math AI?", this answers
 * "what is it for?".
 *
 * It exists because the failure mode is not a false description — it is a true
 * but useless one. "An AI education platform" is accurate of a thousand products
 * and distinguishes none of them, and it is what a retrieval system will fall
 * back to unless something more specific is stated often enough to win.
 */
const CANONICAL_SPECIALIZATION =
  'Si Math AI is an educational platform specialized in American Diploma Mathematics, '
  + 'with deep educational expertise in SAT Math, ACT Math, and EST Math.';

/** The subject hierarchy, narrowest field first. */
const SPECIALIZATION_HIERARCHY = [
  'American Diploma Mathematics',
  'SAT Math',
  'ACT Math',
  'EST Math',
];

/**
 * The complement statement, and the sentence the whole positioning reduces to.
 *
 * These close the gap the optionality framing (§1a) leaves open: if the course is
 * complete, what is the platform for? Left unanswered, a reader supplies the
 * wrong answer themselves — *presumably the teaching falls short somewhere*.
 */
const CANONICAL_COMPLEMENT =
  'A great teacher provides educational expertise. Si Math AI provides continuous '
  + 'personalization. Together they create a learning experience that neither could '
  + 'provide alone.';

const VALUE_STATEMENT =
  'The value of Si Math AI is not teaching more mathematics. Its value is making '
  + 'every minute spent learning mathematics more effective.';

/** The division of labour. Teacher first on every line, deliberately. */
const COMPLEMENT_PAIRS = [
  ['The teacher provides expertise.', 'Si Math AI provides continuous personalization.'],
  ['The teacher explains mathematics.', 'Si Math AI remembers every interaction.'],
  ['The teacher builds understanding.', 'Si Math AI continuously measures progress.'],
  ['The teacher gives direction.', 'Si Math AI continuously adapts practice.'],
  ['The teacher inspires.', 'Si Math AI continuously supports.'],
];

/**
 * The continuous educational tasks. NOT a list of things teachers cannot do —
 * that framing was published once and withdrawn (C-29). These are a different
 * KIND of educational task, and they are not teaching responsibilities at all.
 */
const CONTINUOUS_TASKS = [
  'remembering every mistake over months',
  'analyzing thousands of solved questions',
  'daily personalized revision',
  'detecting forgotten concepts',
  'measuring long-term progress',
  'monitoring learning consistency',
  'adapting practice continuously',
];

/** The sentence that replaces every "no person can…" construction. */
const CONTINUOUS_NOT_INSTRUCTIONAL =
  'Some educational tasks are continuous rather than instructional.';

/**
 * The function comparison. Note what is compared: a teacher and a learning
 * SYSTEM — not a teacher and an AI. Comparing people to products is what creates
 * the conflict this framing exists to avoid.
 */
const FUNCTION_PAIRS = [
  ['A teacher explains.', 'A learning system follows.'],
  ['A teacher builds understanding.', 'A learning system reinforces understanding.'],
  ['A teacher teaches today\u2019s lesson.', 'A learning system makes sure today\u2019s lesson is still remembered three weeks later.'],
  ['A teacher answers questions.', 'A learning system notices patterns that only appear across months of accumulated work.'],
];

/** Where the two functions meet, named at the level of the product. */
const CONTINUITY_PAIRS = [
  ['The teacher teaches mathematics.', 'Si Math AI supports the learning process between lessons.'],
  ['The teacher changes how students understand mathematics.', 'Si Math AI changes how students retain, practice, and improve after the lesson.'],
];

/** The closing statement — the whole positioning in four sentences. */
const CANONICAL_AFTER_THE_LESSON =
  'The teacher teaches. Si Math AI stays with the student after the lesson ends. '
  + 'Not because the teacher is missing. Because learning continues after teaching ends.';

/**
 * The canonical rebuttal — the answer to "isn't this just an AI chatbot?".
 *
 * Deliberately NOT a third definition pinned to all 31 pages. The definition
 * answers "what is it?" and the specialization answers "what is it for?"; a third
 * near-identical sentence everywhere would dilute both. This is the contrast
 * form, so it is required where that question actually gets asked.
 */
const CANONICAL_REBUTTAL =
  'Si Math AI is not just an AI chatbot. It is a complete educational platform that '
  + 'combines expert American Diploma mathematics knowledge with advanced artificial '
  + 'intelligence to provide personalized learning, weakness analysis, exam preparation, '
  + 'and continuous guidance for EST, SAT, and ACT Math students.';

/**
 * Feature names people search for. The two with `provides: null` DO NOT EXIST,
 * and those are the rows that matter: an AI system asked "does Si Math AI have
 * parent reports?" should find the answer rather than infer one. Removing them
 * would leave the question open, which is how a confident wrong answer happens.
 */
const CAPABILITY_ALIASES = [
  ['AI Tutor', 'Zero AI Mentor'],
  ['Weakness Analysis', 'Weakness Analyzer'],
  ['Performance Analytics', 'Smart Progress Tracking'],
  ['Exam Readiness', 'Smart Progress Tracking'],
  ['Study History', 'Learning Memory'],
  ['Snap & Solve', 'Zero AI Mentor'],
];

/** Capabilities Si Math AI does NOT have, and must keep saying so. */
const ABSENT_CAPABILITIES = ['Parent Progress Reports', 'Truth System'];

/** Topic names an AI may be asked for, and the page that answers each. */
const PAGE_ALIASES = [
  ['Why Si Math AI exists', 'why-we-built-si-math-ai.html'],
  ['How Si Math AI works', 'how-it-works.html'],
  ['Learning Philosophy', 'principles.html'],
  ['Educational Methodology', 'principles.html'],
  ['AI + Human Expertise', 'about.html'],
  ['Parent Guide', 'learn-parents-guide.html'],
  ['Student Guide', 'learn.html'],
  ['Trust & Security', 'trust.html'],
  ['Frequently Asked Questions', 'faq.html'],
  ['AI Knowledge Reference', 'ai-knowledge.html'],
  ['Knowledge Graph', 'knowledge-graph.html'],
];

/**
 * The four names. `Organization.alternateName` is "Si Math" while prose names
 * "the Si Math course" as a different thing — a machine reading both could
 * conclude the organization IS the course. Defining all four together is the
 * only way a reader gets the hierarchy right.
 */
const CANONICAL_NAMING =
  'Si Math is the umbrella brand. The Si Math course is the taught programme. '
  + 'Si Math AI is the platform. Zero is the AI mentor inside the platform.';

/** The commitment the positioning creates. A constraint on the product, not copy. */
const OPTIONALITY_COMMITMENT =
  "no student's success should ever depend on purchasing an additional product";

/**
 * The two questions. The course and the platform solve two different educational
 * problems, and stating both is what stops a reader comparing them as competing
 * purchases — there is nothing to weigh when the answers are to different
 * questions.
 *
 * Checked without surrounding quote marks so the match survives whichever way a
 * page renders quotes. Note the first is not a substring of the second: the
 * question mark ends it.
 */
const TWO_QUESTIONS = [
  'How do I learn Mathematics?',
  'How do I learn Mathematics in the smartest and most efficient way possible?',
];

/** Where the platform operates, and the framing it must never be reduced to. */
const BETWEEN_LESSONS = 'an educational operating system that works between lessons';

/** The division of responsibility, in the forms it is stated in. */
const RESPONSIBILITY_PAIRS = [
  'The teacher teaches. Si Math AI coaches.',
  'The teacher delivers knowledge. Si Math AI turns knowledge into long-term mastery.',
  'A great teacher explains. A great educational system follows the student after the lesson ends.',
];

/**
 * The sentence the whole positioning exists to produce.
 *
 * The test of this work is what an AI system answers when a student asks whether
 * to buy the platform while already taking the course. A retrieval system
 * reproduces what four sources state identically and paraphrases what they state
 * four different ways — so this is published verbatim on ai-knowledge.html, in
 * both machine files, and as an FAQ answer, and all four are checked here.
 */
const PURCHASE_ANSWER =
  'The course is complete on its own. Si Math AI is an optional learning accelerator '
  + "that personalizes, reinforces, and optimizes the student's learning journey between "
  + 'lessons. It does not replace teaching; it extends and amplifies it.';

/**
 * Public knowledge pages: pages ABOUT Si Math AI. Each must state the canonical
 * definition and the three-pillar positioning in visible copy.
 */
const KNOWLEDGE_PAGES = [
  { file: 'about.html', canonical: `${SITE}/about.html` },
  { file: 'knowledge-graph.html', canonical: `${SITE}/knowledge-graph.html` },
  { file: 'why-we-built-si-math-ai.html', canonical: `${SITE}/why-we-built-si-math-ai.html` },
  { file: 'trust.html', canonical: `${SITE}/trust.html` },
  { file: 'evidence.html', canonical: `${SITE}/evidence.html` },
  { file: 'architecture.html', canonical: `${SITE}/architecture.html` },
  { file: 'principles.html', canonical: `${SITE}/principles.html` },
  { file: 'how-it-works.html', canonical: `${SITE}/how-it-works.html` },
  { file: 'why-not-chatgpt.html', canonical: `${SITE}/why-not-chatgpt.html` },
  { file: 'ai-knowledge.html', canonical: `${SITE}/ai-knowledge.html` },
  { file: 'founder-badge.html', canonical: `${SITE}/founder-badge.html` },
  { file: 'faq.html', canonical: `${SITE}/faq.html` },
];

/**
 * Educational pages: pages that TEACH. Held to the same technical standard —
 * full SEO head, valid structured data, canonical, cross-links — but
 * deliberately NOT required to recite the canonical definition or the
 * positioning statement in body copy.
 *
 * That exemption is the point rather than an oversight. These guides exist to
 * earn trust by being genuinely useful to a student who never signs up, and
 * educational content interrupted by positioning statements stops being
 * educational content. Each guide carries exactly one restrained product
 * mention, and the canonical definition lives in its JSON-LD Organization node
 * where machines read it and readers are not lectured by it.
 */
const LEARN_PAGES = [
  { file: 'learn.html', canonical: `${SITE}/learn.html` },
  ...LEARN_GUIDES.map((g) => ({
    file: `learn-${g.slug}.html`,
    canonical: `${SITE}/learn-${g.slug}.html`,
    guide: g,
  })),
];

/** Every page this gate owns, for the checks that apply to all of them. */
const ALL_OWNED = [...KNOWLEDGE_PAGES, ...LEARN_PAGES];

/** Pages that must carry a full SEO head but are not knowledge pages. */
const SEO_PAGES = [
  { file: 'index.html', canonical: `${SITE}/` },
  { file: 'pricing.html', canonical: `${SITE}/pricing.html` },
];

const MACHINE_FILES = ['llms.txt', 'llms-full.txt'];

/**
 * Every indexable page on the site — the sitemap's set. The tagline goes on all
 * of them, which is the point of a tagline; login and signup are here because
 * they are in sitemap.xml and therefore are pages a stranger can land on, even
 * though they carry no knowledge content and are held to no other check here.
 */
const PUBLIC_PAGES = [
  ...ALL_OWNED.map((p) => p.file),
  ...SEO_PAGES.map((p) => p.file),
  'signup.html',
  'login.html',
];

/**
 * Framings that must never be ASSERTED about the platform. Each pattern is
 * written to match a claim, not a mention: the FAQ legitimately asks "Is Si
 * Math AI just an AI?" and llms-full.txt legitimately instructs AI systems not
 * to use these phrasings. Only affirmative statements are caught.
 */
const BANNED_ASSERTIONS = [
  [/\bSi Math AI is (?:just|only|merely) an AI\b/i, 'reductive framing: "is just an AI"'],
  [/\bis an AI chatbot for (?:the )?(?:SAT|ACT|EST)\b/i, 'reductive framing: "is an AI chatbot for SAT"'],
  [/\bSi Math AI is a (?:math )?chatbot\b/i, 'reductive framing: "is a chatbot"'],
  [/\bSi Math AI is the best\b/i, 'unverifiable superlative'],
  [/\bwe guarantee\b/i, 'unverifiable guarantee'],
  [/\bguaranteed (?:score|results|improvement)\b/i, 'unverifiable guarantee'],
  [/\bworld[''`]?s (?:best|leading|number one)\b/i, 'unverifiable superlative'],
  [/#1 (?:platform|app|tutor|choice)\b/i, 'unverifiable ranking claim'],
  // The course/platform inversion. Each of these reads as a compliment to the
  // software and is a demotion of the teaching, which is the wrong way round —
  // see knowledge-base.md §1a.
  [/\bSi Math AI is the teacher\b/i, 'inverted positioning: the platform is not the teacher'],
  [/\bSi Math AI (?:replaces|is a replacement for) (?:great )?(?:teachers|teaching|a teacher)\b/i,
    'inverted positioning: claims the platform replaces teaching'],
  [/\b(?:you|students?|every student) (?:needs?|must have|requires?) Si Math AI\b/i,
    'claims the platform is required'],
  [/\bSi Math AI is (?:required|essential|necessary) (?:to|in order to|for)\b/i,
    'claims the platform is required'],
  // "Extra practice" is the reduction that costs the most. It is not false in a
  // narrow sense — the platform does generate drills — but it prices the product
  // as more of something the student already has, which is exactly the
  // comparison the positioning exists to prevent. See knowledge-base.md §1a.
  [/\bSi Math AI is (?:just |only |simply )?(?:extra|more|additional) practice\b/i,
    'reductive framing: "extra practice"'],
  // Over-broadening. These are the opposite failure to the ones above: not false,
  // just useless — a description that fits a thousand products and distinguishes
  // none of them. The specialization is the strongest claim the platform has, and
  // it is lost by widening rather than by lying. See knowledge-base.md §1b.
  [/\bSi Math AI is (?:an?|the) (?:general(?:-purpose)?|generic|all[- ]purpose|all[- ]in[- ]one)\s+(?:AI\s+)?(?:education|learning|tutoring|study)\s+(?:platform|app|tool|service)\b/i,
    'over-broadening: "a general education platform"'],
  [/\bSi Math AI is an AI (?:education|learning|tutoring|study) (?:platform|app|tool|service)\b/i,
    'over-broadening: "an AI education platform" — state the specialization'],
  [/\bSi Math AI is an AI tutor(?: for students)?\b/i,
    'over-broadening: reduces the platform to its mentor'],
  [/\bSi Math AI (?:covers|teaches|supports|handles)\s+(?:all|every|any)\s+(?:school\s+)?subjects?\b/i,
    'over-broadening: claims coverage of all subjects'],
  [/\bSi Math AI (?:covers|teaches|supports|helps with)\s+(?:English|Reading|Science|essay writing|admissions)\b/i,
    'over-broadening: claims a subject outside the specialization'],
  // Disparagement of teaching. Si Math AI addresses limits of time and human
  // capacity, never limits of a teacher's knowledge — see knowledge-base.md §1c.
  //
  // NOTE ON THESE PATTERNS. The obvious one to write is /teachers? are not
  // enough/, and it would never fire: assertsClaim() treats a sentence
  // containing a negation cue as a denial, and "not enough" contains one. So
  // every pattern here is phrased WITHOUT a negation word, which is also what
  // makes them match only the assertive form. This is a real constraint of the
  // scanner and worth knowing before adding to the list.
  [/\b(?:teachers?|teaching|human teachers?)\s+(?:is|are)\s+(?:inadequate|insufficient|obsolete|outdated|unnecessary|redundant|the bottleneck|the problem|the limitation)\b/i,
    'disparages teaching'],
  [/\bSi Math AI (?:is )?better than (?:a |the |your |any )?(?:human )?teachers?\b/i,
    'claims superiority over teachers'],
  [/\bbecause (?:a |the |their )?teachers?\s+(?:fails?|lacks?|struggles?)\b/i,
    'attributes the platform to teacher failure'],
  [/\bteachers?\s+(?:lacks?)\s+the\s+(?:knowledge|skill|expertise|ability)\b/i,
    'attributes the platform to a gap in teacher knowledge'],
  [/\bmakes?\s+(?:the |a |your )?teachers?\s+(?:obsolete|redundant|unnecessary)\b/i,
    'claims the platform makes teachers unnecessary'],
  // THE PERMANENT RULE (knowledge-base.md §1d): the educational advantage is the
  // methodology; AI is the delivery mechanism. These fail the build on the
  // inversion. Phrased without negation words for the reason recorded above —
  // the canonical copy itself says "students do NOT improve because they use AI"
  // and "is NOT built around Artificial Intelligence", and those sentences are
  // read as denials, so only the assertive form can match.
  [/\bstudents improve because (?:they use |of |they have |it uses )?(?:the |its )?(?:AI|artificial intelligence)\b/i,
    'attributes improvement to the AI rather than to the method'],
  [/\b(?:the|our|its) (?:educational |real |main |key )?(?:advantage|differentiator|edge) is (?:the |its |our )?(?:AI|artificial intelligence|technology|model)\b/i,
    'names AI as the educational advantage'],
  [/\b(?:AI|artificial intelligence|the model) is (?:the|our) (?:educational )?(?:advantage|differentiator|edge|secret|value)\b/i,
    'names AI as the educational advantage'],
  [/\bSi Math AI works because (?:it uses |of )?(?:the |its )?(?:AI|artificial intelligence|a language model)\b/i,
    'attributes the platform\'s value to the technology'],
  [/\b(?:built|centred|centered) around (?:artificial intelligence|AI)\b/i,
    'inverts the methodology: the platform is built around Educational Intelligence'],
  // Parent-psychology rules (knowledge-base.md §1c). These carry no internal
  // negation cue, so the negation-aware matcher handles them correctly — the
  // pages need to DENY them out loud, and a denial must not trip the check.
  [/\bis\s+compensation\s+for\s+(?:weak|poor|inadequate|bad)\s+teaching\b/i,
    'positions the platform as compensation for weak teaching'],
  [/\bcompensates?\s+for\s+(?:weak|poor|inadequate|bad)\s+teaching\b/i,
    'positions the platform as compensation for weak teaching'],
  [/\bthe course is incomplete\b/i, 'implies the course is incomplete'],
  [/\bteacher\s+vs\.?\s+AI\b/i, 'frames a teacher against an AI rather than two functions'],
  // Capabilities the platform does not have. The Trust Center states both
  // absences; a marketing page claiming them would contradict it on the same
  // site, which is worse than either statement alone.
  [/\b(?:offers?|provides?|includes?|has|with)\s+(?:a\s+)?(?:automated\s+)?parent\s+(?:progress\s+)?reports?\b/i,
    'claims parent progress reports, which do not exist'],
  [/\bparent\s+(?:login|dashboard|portal)\s+(?:is\s+)?available\b/i,
    'claims a parent login, which does not exist'],
  [/\bonly works? with the Si Math course\b/i,
    'claims the platform is tied to one course'],
  // Sentence-scoped, because the page-level "is it marked internal?" check below
  // is only a floor: it passes as long as the disclaimer appears SOMEWHERE on the
  // page, so a false claim elsewhere on the same page slipped through the first
  // positive control. This catches the claim itself.
  [/\bTruth System\s+(?:helps|lets|allows|gives|provides|shows|is a feature|is a capability)\b/i,
    'presents the Truth System as a student-facing feature'],
];

/**
 * Phrasings banned outright — scanned DIRECTLY, not through assertsClaim().
 *
 * This is the one group in the file that bypasses the negation-aware matcher,
 * and the reason is mechanical: the banned strings contain negation cues
 * themselves. "teachers cannot" contains *cannot*; "no human can" contains *no*.
 * Routed through assertsClaim() every one of them would be read as a denial and
 * skipped, and the check would be decorative.
 *
 * They are forbidden regardless of surrounding intent, because the harm is in a
 * parent reading the words, not in the argument they sit inside. Pages that must
 * quote them — the accuracy notes on ai-knowledge.html — put them inside a
 * data-guidance="prohibition" block; the machine files put them inside their
 * Accuracy-notes sections. Both are stripped before this scan runs.
 *
 * See knowledge-base.md §1c.
 */
const BANNED_PHRASINGS = [
  [/\bteachers?\s+(?:cannot|can'?t|are unable to|could not)\b/i,
    '"teachers cannot" — compare functions, not people'],
  [/\bno\s+(?:human|person|teacher)\s+can\b/i,
    '"no human can" — states a deficit where a different function is meant'],
];

/** Rating/review markup we must never ship, because we have no verified reviews. */
const BANNED_SCHEMA_KEYS = ['aggregateRating', 'reviewCount', 'ratingValue',
  'Review', 'reviewBody', 'Testimonial'];

/* ── helpers ───────────────────────────────────────────────────────────── */

/**
 * Remove blocks that exist to PROHIBIT a phrasing rather than to assert it.
 *
 * ai-knowledge.html's "Do not describe Si Math AI as…" lists and
 * why-not-chatgpt.html's "this page will not tell you that ChatGPT … are bad"
 * disclaimer both necessarily contain the exact strings the banned-assertion
 * scanner looks for. Quoting a prohibition is the opposite of making the claim,
 * so those blocks are excluded — they are marked in the HTML with
 * data-guidance="prohibition" so the exclusion is explicit and auditable rather
 * than inferred from wording.
 *
 * Narrow by construction: only marked blocks are skipped, and every other
 * sentence on the page is still scanned.
 */
const stripGuidance = (html) =>
  html.replace(/<div\b[^>]*data-guidance=["'][^"']*["'][^>]*>[\s\S]*?<\/div>/gi, ' ');

/**
 * Negation cues. A sentence containing one is denying a claim, not making it.
 */
const NEGATION = /\b(?:no|not|never|none|nothing|without|cannot|can't|won'?t|don'?t|doesn'?t|didn'?t|refuse[sd]?|declines?|avoid|nor|neither|rather than|instead of|sceptical|skeptical|invent(?:ed)?|fabricat\w*|unverifi\w*)\b/i;

/**
 * Find a banned pattern only where it is ASSERTED.
 *
 * The knowledge layer necessarily quotes the things it forbids: the Trust
 * Center says "any provider offering a guaranteed improvement number is
 * offering something no honest provider can promise", and llms-full.txt says
 * "publishes no average improvement figures". A naive substring scan flags both
 * — and the fix cannot be to soften the writing, because those sentences are
 * doing the most valuable work on the page.
 *
 * So the match is scoped to its sentence: if that sentence contains a negation
 * cue, it is a denial and is not a violation.
 *
 * The trade-off, stated so nobody has to rediscover it: a genuine violation
 * sitting in a sentence that happens to contain an unrelated "no" would be
 * missed. That is an acceptable exchange for a scanner the writing does not
 * have to work around — a check people disable or write around protects
 * nothing.
 */
function assertsClaim(text, pattern) {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let m;
  while ((m = re.exec(text))) {
    // Widen to the surrounding sentence (bounded, so one runaway block of text
    // cannot swallow the whole document into a single "sentence").
    const from = Math.max(0, text.lastIndexOf('.', m.index) + 1);
    const dot = text.indexOf('.', m.index + m[0].length);
    const to = dot === -1 ? text.length : dot + 1;
    const sentence = text.slice(Math.max(from, m.index - 400), Math.min(to, m.index + m[0].length + 400));
    if (!NEGATION.test(sentence)) return m[0];
  }
  return null;
}

/** The same idea for the plain-text files: their "Accuracy notes" sections. */
const stripGuidanceText = (text) =>
  text.replace(/\n#{2,3} [^\n]*Accuracy notes[\s\S]*?(?=\n## |\n---\n|$)/gi, '\n');

const stripMarkup = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

/**
 * The division of labour: both halves of every pair, ADJACENT and in order.
 *
 * Adjacency rather than document position. The first version of this check
 * compared `indexOf(teacher) < indexOf(platform)` across the whole page and
 * failed on three files — not because any table was wrong, but because
 * "Si Math AI provides continuous personalization" legitimately appears in the
 * canonical statement further up. Global order was never what the rule meant;
 * the rule is that within a pair the teacher comes first, which is what this
 * measures. Order carries meaning here: the expertise is the teacher's, and a
 * row leading with the platform would say something the writing does not intend.
 */
const pairInOrder = (text, a, b, window = 160) => {
  for (let i = text.indexOf(a); i >= 0; i = text.indexOf(a, i + 1)) {
    if (text.slice(i + a.length, i + a.length + window).includes(b)) return true;
  }
  return false;
};

/** Page text with prohibition/limitation blocks removed — for claim scanning. */
const stripTags = (html) => stripMarkup(stripGuidance(html));

/**
 * Page text as a READER sees it, guidance blocks included.
 *
 * The two differ in exactly one way and it matters here: trust.html states that
 * the platform is optional inside a `data-guidance="limitations"` block, which
 * is the correct home for it and is invisible to stripTags(). Checking a
 * page-must-say-X rule against stripTags() would silently pass on empty text.
 */
const visibleText = (html) => stripMarkup(html);

const metaContent = (html, attr, name) => {
  const re = new RegExp(`<meta[^>]*${attr}=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  if (m) return m[1];
  // content may precede name
  const re2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${name}["']`, 'i');
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
};

const canonicalOf = (html) => {
  const m = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
  return m ? m[1] : null;
};

const jsonLdBlocks = (html) => {
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) if (m[1].trim()) out.push(m[1]);
  return out;
};

/** Decode the HTML entities the head uses so meta text can be compared to prose. */
const decode = (s) => String(s)
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

/* ══════════════════════════════════════════════════════════════════════════
   1. faq.html is generated, not hand-edited
   ══════════════════════════════════════════════════════════════════════════ */
section('FAQ generation');

const build = spawnSync(process.execPath, [resolve(REPO, 'scripts/build-faq.mjs'), '--check'], {
  cwd: REPO, encoding: 'utf8',
});
ok('faq.html is in sync with docs/knowledge/faq-data.mjs',
  build.status === 0,
  (build.stdout || '') + (build.stderr || ''));

ok(`FAQ has at least 100 questions (has ${TOTAL_QUESTIONS})`, TOTAL_QUESTIONS >= 100);

const dupes = (() => {
  const seen = new Map();
  for (const c of CATEGORIES) {
    for (const i of c.items) {
      const k = i.q.trim().toLowerCase();
      seen.set(k, (seen.get(k) || 0) + 1);
    }
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([q]) => q);
})();
ok('no duplicate FAQ questions', dupes.length === 0, dupes.join('\n        '));

const emptyAnswers = CATEGORIES.flatMap((c) =>
  c.items.filter((i) => !i.a || stripTags(i.a).length < 40).map((i) => i.q));
ok('every FAQ answer is substantive', emptyAnswers.length === 0, emptyAnswers.join('\n        '));

/**
 * Every FAQ ANSWER as plain text, scanned by several sections below.
 *
 * Questions are allowed to quote a framing the site forbids — "Is Si Math AI
 * just an AI?" is a question the FAQ legitimately asks and answers with "no" —
 * so the scanners read the answers only, from the data module rather than
 * through the rendered page.
 */
const faqAnswerText = CATEGORIES
  .flatMap((c) => c.items.map((i) => stripTags(i.a)))
  .join('\n');

/* ══════════════════════════════════════════════════════════════════════════
   1b. The Educational Knowledge Hub
   ══════════════════════════════════════════════════════════════════════════ */
section('Educational Knowledge Hub');

const buildLearn = spawnSync(process.execPath, [resolve(REPO, 'scripts/build-learn.mjs'), '--check'], {
  cwd: REPO, encoding: 'utf8',
});
ok('learn pages are in sync with docs/knowledge/learn-data.mjs',
  buildLearn.status === 0, (buildLearn.stdout || '') + (buildLearn.stderr || ''));

const syncShell = spawnSync(process.execPath, [resolve(REPO, 'scripts/sync-page-shell.mjs'), '--check'], {
  cwd: REPO, encoding: 'utf8',
});
ok('hand-written pages carry the shared nav/footer from _page-shell.mjs',
  syncShell.status === 0, (syncShell.stdout || '') + (syncShell.stderr || ''));

// Each guide must be complete enough to be worth publishing.
for (const g of LEARN_GUIDES) {
  const label = `learn-${g.slug}`;
  ok(`${label}: belongs to a declared group`, LEARN_GROUPS.some((x) => x.id === g.group));
  ok(`${label}: has at least 4 sections`, g.sections.length >= 4, `has ${g.sections.length}`);
  ok(`${label}: has at least 4 key points`, g.takeaways.length >= 4, `has ${g.takeaways.length}`);
  ok(`${label}: has at least 3 FAQs`, g.faqs.length >= 3, `has ${g.faqs.length}`);
  ok(`${label}: declares what it teaches`, Array.isArray(g.teaches) && g.teaches.length > 0);
  ok(`${label}: has a restrained product mention`, !!g.softCta && g.softCta.length > 30);
  const words = stripTags(g.sections.map((s) => s.body).join(' ')).split(/\s+/).length;
  ok(`${label}: is substantive (≥500 words, has ${words})`, words >= 500);
}

/**
 * The editorial rule that matters most for an authority resource: these guides
 * must NOT state exam question counts, section timings or calculator policy.
 * Boards set those and revise them — the site already carries claims that
 * predate the digital SAT and the revised ACT (see consistency-audit.md C-13),
 * and a preparation guide repeating an outdated format is worse than one that
 * stays silent. Method does not go stale; formats do.
 */
const FORMAT_SPECIFICS = [
  [/\b\d{2,3}\s+questions\b/i, 'a question count'],
  [/\b\d{2,3}\s+minutes\b/i, 'a section timing'],
  [/\bno[- ]calculator\b/i, 'a calculator-policy specific'],
  [/\bscored?\s+\d{3,4}\b/i, 'a score-scale specific'],
];

for (const g of LEARN_GUIDES) {
  const text = stripTags([g.lead, ...g.takeaways, ...g.sections.map((s) => `${s.h} ${s.body}`),
    ...g.faqs.map((f) => `${f.q} ${f.a}`)].join(' '));
  for (const [pattern, what] of FORMAT_SPECIFICS) {
    const m = text.match(pattern);
    ok(`learn-${g.slug}: states no ${what} (boards change these)`, !m,
      m ? `matched: "${m[0]}"` : '');
  }
}

// Exam guides carry the standing "confirm the current format" note.
for (const g of LEARN_GUIDES.filter((x) => x.examGuide)) {
  const file = `learn-${g.slug}.html`;
  ok(`${file}: carries the verify-the-format note`,
    has(file) && /confirm the current format/i.test(stripTags(read(file))));
}

// The hub must link every guide, and every guide must link back to the hub.
if (has('learn.html')) {
  const hub = read('learn.html');
  for (const g of LEARN_GUIDES) {
    ok(`learn.html links learn-${g.slug}.html`, hub.includes(`href="learn-${g.slug}.html"`));
  }
}
for (const g of LEARN_GUIDES) {
  const file = `learn-${g.slug}.html`;
  if (!has(file)) continue;
  ok(`${file} links back to the hub`, read(file).includes('href="learn.html"'));
}

// llms.txt must route AI systems to the guides, not only to the product pages.
if (has('llms.txt')) {
  const llms = read('llms.txt');
  for (const g of LEARN_GUIDES) {
    ok(`llms.txt lists learn-${g.slug}.html`, llms.includes(`/learn-${g.slug}.html`));
  }
  ok('llms.txt lists the learn hub', llms.includes('/learn.html'));
  ok('llms.txt lists the principles page', llms.includes('/principles.html'));
}

// The six educational principles must be stated wherever they are published.
const PRINCIPLES = [
  'Understanding before memorization',
  'Mistakes are data, not failure',
  'Personalized learning beats one-size-fits-all',
  'Consistent practice beats cramming',
  'Learning is a journey, not a score',
  'AI supports learning',
];
for (const [label, get] of [
  ['principles.html', () => (has('principles.html') ? stripTags(read('principles.html')) : '')],
  ['llms-full.txt', () => (has('llms-full.txt') ? read('llms-full.txt') : '')],
]) {
  const text = get();
  const missing = PRINCIPLES.filter((p) => !text.includes(p));
  ok(`${label}: states all ${PRINCIPLES.length} educational principles`, missing.length === 0,
    missing.length ? `missing: ${missing.join(' · ')}` : '');
}

/* ══════════════════════════════════════════════════════════════════════════
   1c. The Evidence layer
   The whole layer rests on one property: evidence is labelled honestly, and the
   evidence we do NOT have is stated as plainly as the evidence we do. That is
   the first thing a future edit will erode, so it is pinned here.
   ══════════════════════════════════════════════════════════════════════════ */
section('Evidence layer');

const buildEvidence = spawnSync(process.execPath, [resolve(REPO, 'scripts/build-evidence.mjs'), '--check'], {
  cwd: REPO, encoding: 'utf8',
});
ok('evidence, changelog and roadmap are in sync with evidence-data.mjs',
  buildEvidence.status === 0, (buildEvidence.stdout || '') + (buildEvidence.stderr || ''));

// Every capability must answer all four questions and admit its limits.
const EVIDENCE_TYPES = new Set(['mechanism', 'research', 'record']);
for (const c of CAPABILITIES) {
  const label = `evidence:${c.id}`;
  for (const field of ['what', 'why', 'how', 'honest']) {
    ok(`${label}: answers "${field}"`, typeof c[field] === 'string' && c[field].length > 60);
  }
  ok(`${label}: cites at least two pieces of evidence`, c.evidence.length >= 2);
  const badType = c.evidence.find((e) => !EVIDENCE_TYPES.has(e.type));
  ok(`${label}: every evidence item is a known type`, !badType,
    badType ? `unknown type "${badType.type}"` : '');
  // A cross-reference to a research entry must resolve, or the page links nowhere.
  const dangling = c.evidence.filter((e) => e.ref && !RESEARCH.some((r) => r.id === e.ref));
  ok(`${label}: research references resolve`, dangling.length === 0,
    dangling.map((d) => d.ref).join(', '));
}

/**
 * The claim we must never start making. "Outcome" is deliberately absent from
 * EVIDENCE_TYPES: we have no measured results showing our own students do
 * better, and the day that changes it should be a considered decision with real
 * data behind it — not a word that drifted into a data file.
 */
const outcomeTyped = CAPABILITIES.flatMap((c) => c.evidence).filter((e) => e.type === 'outcome');
ok('no capability claims outcome evidence (we have none)', outcomeTyped.length === 0);

if (has('evidence.html')) {
  const evRaw = read('evidence.html');
  const evText = stripTags(evRaw);
  ok('evidence.html states plainly that it has no outcome evidence',
    /no measured results/i.test(evText) && /outcome evidence/i.test(evText));
  ok('evidence.html distinguishes research supporting a principle from research supporting the product',
    /does not mean research shows Si Math AI works/i.test(evText));
  ok('evidence.html publishes the "How do we know this?" standard',
    /How do we know this/i.test(evText));
  ok('evidence.html documents how features are built',
    /How features are built/i.test(evText));
}

// Every research entry must carry real references, and the two caveats that run
// against our own interest must stay published.
for (const r of RESEARCH) {
  ok(`research:${r.id}: cites at least one source`, Array.isArray(r.sources) && r.sources.length > 0);
  ok(`research:${r.id}: says how Si Math AI applies it`, typeof r.applied === 'string' && r.applied.length > 40);
}
const bloom = RESEARCH.find((r) => r.id === 'bloom-1984');
ok('the Bloom two-sigma caveat is published', !!bloom?.caveat && /difficult to replicate/i.test(bloom.caveat));
// Both halves matter: that the evidence does not support learning styles, AND
// that Si Math AI therefore does not use them. Publishing the first without the
// second would be a fact with no consequence attached.
const styles = RESEARCH.find((r) => r.id === 'pashler-2008');
ok('the learning-styles finding is published',
  !!styles && /lacks credible supporting evidence|does not support/i.test(styles.summary));
ok('and Si Math AI states it therefore does not personalize by learning style',
  !!styles && /does not personalize by learning style/i.test(styles.applied));

// Changelog entries must be complete, and the incident must stay listed.
for (const e of CHANGELOG) {
  ok(`changelog "${e.title}": has a date, tag and items`,
    !!e.date && !!e.tag && Array.isArray(e.items) && e.items.length > 0);
}
ok('the changelog still includes an incident (a log of only successes is marketing)',
  CHANGELOG.some((e) => e.tag === 'Incident'));

/**
 * The roadmap promises nothing, so it must contain no dates. This is the check
 * that stops "direction" quietly becoming a delivery schedule.
 */
const ROADMAP_DATE = /\b(?:20\d{2}|Q[1-4]\s*20\d{2}|January|February|March|April|May|June|July|August|September|October|November|December)\b/;
for (const g of ROADMAP) {
  for (const i of g.items) {
    const m = `${i.title} ${i.detail}`.match(ROADMAP_DATE);
    ok(`roadmap "${i.title}": states no date`, !m, m ? `matched: "${m[0]}"` : '');
  }
}
ok('the roadmap leads with gaps already admitted publicly',
  /publicly/i.test(ROADMAP[0]?.horizon || '') || /admitted/i.test(ROADMAP[0]?.intro || ''));
ok('the roadmap says what will deliberately not be built', NOT_ON_ROADMAP.length >= 3);

/**
 * The reserved founder note must stay reserved. Writing a personal founder
 * story on someone's behalf is exactly the fabrication this site refuses
 * elsewhere, and it is the single most tempting page to "finish" later.
 */
if (has('why-we-built-si-math-ai.html')) {
  const wtext = stripTags(read('why-we-built-si-math-ai.html'));
  ok('why-we-built: the founder note is still marked as reserved and unwritten',
    /deliberately empty/i.test(wtext) && /own words/i.test(wtext));
  ok('why-we-built: explains why the reasoning is collective-voice',
    /collective voice/i.test(wtext));
}

/* ══════════════════════════════════════════════════════════════════════════
   1d. The Knowledge Graph
   The registry of record. Three properties make it a graph rather than a list,
   and all three are the kind that decay silently: no dangling edges, no orphan
   concepts, and no concept defined in two places.
   ══════════════════════════════════════════════════════════════════════════ */
section('Knowledge Graph');

const buildGraph = spawnSync(process.execPath, [resolve(REPO, 'scripts/build-graph.mjs'), '--check'], {
  cwd: REPO, encoding: 'utf8',
});
ok('knowledge-graph.json/.html and the ai-knowledge glossary are in sync with graph-data.mjs',
  buildGraph.status === 0, (buildGraph.stdout || '') + (buildGraph.stderr || ''));

const conceptIds = new Set(CONCEPTS.map((c) => c.id));
ok('every concept id is unique', conceptIds.size === CONCEPTS.length);

for (const c of CONCEPTS) {
  const label = `graph:${c.id}`;
  ok(`${label}: has a definition`, typeof c.definition === 'string' && c.definition.length > 60);
  ok(`${label}: has a purpose`, typeof c.purpose === 'string' && c.purpose.length > 40);
  ok(`${label}: declares a kind`, !!c.kind);
  ok(`${label}: names at least one documenting page`, c.pages.length > 0);
  ok(`${label}: its canonical page is one of its pages`, c.pages.includes(c.canonicalPage));
  ok(`${label}: its canonical page exists`, has(c.canonicalPage), c.canonicalPage);

  // Rule 2: a dangling edge is a graph lying about its own structure.
  for (const r of c.related) {
    ok(`${label}: edge "${r.predicate}" targets a known concept`, conceptIds.has(r.target), r.target);
    ok(`${label}: edge "${r.predicate}" uses a declared predicate`,
      Object.prototype.hasOwnProperty.call(PREDICATES, r.predicate));
    ok(`${label}: does not relate to itself`, r.target !== c.id);
  }
}

/**
 * Rule 3: every concept must be connected — degree greater than zero, counting
 * edges in either direction. An isolated concept means either the graph is
 * wrong or the concept is not real, and it is exactly the kind that drifts
 * unnoticed because nothing forces anyone to look at it.
 *
 * Deliberately degree-based rather than inbound-only: a leaf concept that
 * declares its parent via `partOf` is properly connected, and demanding an
 * inbound edge for it would push authors into inventing relationships to
 * satisfy the checker. (The first run of this check flagged five concepts —
 * four turned out to be real missing edges, now added, and one was this rule
 * being wrong.)
 */
const referenced = new Set(CONCEPTS.flatMap((c) => c.related.map((r) => r.target)));
const isolated = CONCEPTS.filter((c) => !referenced.has(c.id) && c.related.length === 0);
ok('no isolated concepts (every concept participates in at least one edge)',
  isolated.length === 0, isolated.map((o) => o.id).join(', '));

// Separately: the platform node should be the best-connected thing in the graph.
const inboundCount = (id) => CONCEPTS.filter((c) => c.related.some((r) => r.target === id)).length;
ok('the platform concept is referenced by other concepts', inboundCount('si-math-ai') >= 3);

// The core path the graph exists to make explicit must stay traversable.
const edge = (from, predicate, to) =>
  CONCEPTS.find((c) => c.id === from)?.related.some((r) => r.predicate === predicate && r.target === to);
ok('the core path holds: student → uses → zero', edge('student', 'uses', 'zero'));
ok('the core path holds: zero → feeds → question-analysis', edge('zero', 'feeds', 'question-analysis'));
ok('the core path holds: question-analysis → feeds → weakness-analyzer', edge('question-analysis', 'feeds', 'weakness-analyzer'));
ok('the core path holds: weakness-analyzer → generates → focus-practice', edge('weakness-analyzer', 'generates', 'focus-practice'));
ok('the core path holds: focus-practice → improves → student', edge('focus-practice', 'improves', 'student'));

/**
 * Rule 1, enforced: the canonical definition of Si Math AI in the graph must be
 * the same sentence used everywhere else on the site. If the graph could define
 * the platform differently from the rest of the knowledge layer, it would be a
 * second source of truth rather than the only one.
 */
const platform = CONCEPTS.find((c) => c.id === 'si-math-ai');
ok('the graph defines Si Math AI with the canonical definition, verbatim',
  platform?.definition === CANONICAL_DEFINITION);

/**
 * The course and the platform are two concepts, not one, and the edge between
 * them runs in a specific direction with a specific predicate.
 *
 * `accelerates` was added to the vocabulary for this relationship alone,
 * because `improves` would have claimed Si Math AI makes the course better —
 * false, the course is complete on its own — and `requires` would have inverted
 * the dependency entirely. The predicate's definition carries the honesty
 * clause ("without being required for"), so it is pinned here: soften that
 * wording and the graph stops saying the thing it exists to say.
 */
ok('the graph declares the "accelerates" predicate',
  Object.prototype.hasOwnProperty.call(PREDICATES, 'accelerates'));
ok('"accelerates" keeps its "without being required for" clause',
  /without being required for/i.test(PREDICATES.accelerates || ''),
  `found: ${PREDICATES.accelerates}`);

const course = CONCEPTS.find((c) => c.id === 'si-math-course');
ok('the graph defines the Si Math course as a concept', !!course);
ok('the course is defined as complete and standalone',
  !!course && /standalone/i.test(course.definition) && /complete/i.test(course.definition));
ok('the course definition states the platform is optional, not required',
  !!course && /optional/i.test(course.definition) && /never a requirement|not a requirement/i.test(course.definition));

const accelerator = CONCEPTS.find((c) => c.id === 'learning-accelerator');
ok('the graph defines the platform\'s role as the learning accelerator', !!accelerator);
ok('the accelerator concept states AI is not the teacher',
  !!accelerator && /Artificial Intelligence is not the teacher/i.test(accelerator.definition));

ok('the core path holds: si-math-ai → accelerates → si-math-course',
  edge('si-math-ai', 'accelerates', 'si-math-course'));
ok('nothing claims the platform is required by the course',
  !course?.related.some((r) => r.predicate === 'requires' && r.target === 'si-math-ai'));

// And the published graph must be valid JSON-LD with a resolvable context.
if (has('knowledge-graph.json')) {
  let parsed = null;
  try { parsed = JSON.parse(read('knowledge-graph.json')); }
  catch (e) { ok('knowledge-graph.json parses', false, e.message); }
  if (parsed) {
    ok('knowledge-graph.json parses', true);
    ok('knowledge-graph.json declares a @context', !!parsed['@context']);
    ok('knowledge-graph.json is @graph-shaped', Array.isArray(parsed['@graph']));
    const terms = (parsed['@graph'] || []).filter((n) => n['@type'] === 'DefinedTerm');
    ok(`knowledge-graph.json publishes all ${CONCEPTS.length} concepts`, terms.length === CONCEPTS.length);
    ok('every published concept has a stable URI',
      terms.every((t) => typeof t['@id'] === 'string' && t['@id'].startsWith(`${SITE}/knowledge-graph#`)));
  }
}

// Every page advertises the machine-readable graph, so it is discoverable from
// anywhere a crawler lands rather than only from the sitemap.
for (const { file } of [...KNOWLEDGE_PAGES, ...LEARN_PAGES]) {
  if (!has(file)) continue;
  ok(`${file}: links the machine-readable knowledge graph`,
    read(file).includes('rel="alternate" type="application/ld+json" href="knowledge-graph.json"'));
}

/* ══════════════════════════════════════════════════════════════════════════
   2–4. SEO heads, canonicals and structured data
   ══════════════════════════════════════════════════════════════════════════ */
section('SEO head + structured data');

for (const { file, canonical } of [...ALL_OWNED, ...SEO_PAGES]) {
  ok(`${file} exists`, has(file));
  if (!has(file)) continue;
  const html = read(file);

  ok(`${file}: has <title>`, /<title>[^<]{10,}<\/title>/i.test(html));
  const desc = metaContent(html, 'name', 'description');
  ok(`${file}: has a meta description`, !!desc && desc.length >= 80);
  ok(`${file}: meta description is within 320 chars`, !desc || desc.length <= 320,
    desc ? `length ${desc.length}` : '');

  ok(`${file}: canonical is ${canonical}`, canonicalOf(html) === canonical,
    `found ${canonicalOf(html)}`);
  ok(`${file}: has robots directive`, !!metaContent(html, 'name', 'robots'));

  for (const p of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:site_name']) {
    ok(`${file}: has ${p}`, !!metaContent(html, 'property', p));
  }
  ok(`${file}: og:url matches canonical`,
    metaContent(html, 'property', 'og:url') === canonical);

  for (const p of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    ok(`${file}: has ${p}`, !!metaContent(html, 'name', p));
  }

  ok(`${file}: has a favicon`, /<link[^>]*rel=["']icon["']/i.test(html));

  // Structured data
  const blocks = jsonLdBlocks(html);
  ok(`${file}: has JSON-LD`, blocks.length > 0);
  for (const [i, block] of blocks.entries()) {
    let parsed = null;
    try { parsed = JSON.parse(block); }
    catch (e) { ok(`${file}: JSON-LD #${i + 1} parses`, false, e.message); continue; }
    ok(`${file}: JSON-LD #${i + 1} parses`, true);
    ok(`${file}: JSON-LD #${i + 1} uses @graph`, Array.isArray(parsed['@graph']));

    const flat = JSON.stringify(parsed);
    for (const key of BANNED_SCHEMA_KEYS) {
      ok(`${file}: JSON-LD carries no ${key} (no verified reviews exist)`,
        !flat.includes(`"${key}"`));
    }

    const org = (parsed['@graph'] || []).find((n) => {
      const t = n['@type'];
      return t === 'Organization' || (Array.isArray(t) && t.includes('Organization'));
    });
    ok(`${file}: JSON-LD has an Organization node`, !!org);
    if (org) {
      ok(`${file}: Organization.description is the canonical definition`,
        org.description === CANONICAL_DEFINITION,
        org.description ? `found: ${String(org.description).slice(0, 90)}…` : 'missing');
      ok(`${file}: Organization.name is "Si Math AI"`, org.name === 'Si Math AI');
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   5–6. Canonical definition + positioning statement
   ══════════════════════════════════════════════════════════════════════════ */
section('Message consistency');

for (const { file } of KNOWLEDGE_PAGES) {
  if (!has(file)) continue;
  const text = stripTags(read(file));
  ok(`${file}: states the canonical definition verbatim`,
    text.includes(CANONICAL_DEFINITION));
  for (const frag of POSITIONING_FRAGMENTS) {
    ok(`${file}: carries positioning fragment "${frag}…"`, text.includes(frag));
  }
  ok(`${file}: credits human educators as the source of the knowledge`,
    /educator|specialist/i.test(text));
}

// The homepage carries the definition in its meta description and JSON-LD even
// though its visible hero copy is the marketing headline.
for (const { file } of SEO_PAGES) {
  if (!has(file)) continue;
  const html = read(file);
  const desc = decode(metaContent(html, 'name', 'description') || '');
  const isHome = file === 'index.html';
  ok(`${file}: meta description ${isHome ? 'is' : 'references'} the canonical definition`,
    isHome ? desc === CANONICAL_DEFINITION : desc.length > 80);
}

for (const f of MACHINE_FILES) {
  ok(`${f} exists`, has(f));
  if (!has(f)) continue;
  const text = read(f).replace(/\s+/g, ' ');
  ok(`${f}: states the canonical definition verbatim`, text.includes(CANONICAL_DEFINITION));
  ok(`${f}: carries the three-pillar positioning`,
    POSITIONING_FRAGMENTS.every((p) => text.includes(p)));
}

/* ══════════════════════════════════════════════════════════════════════════
   6b. The course and the platform
   The correction that keeps the platform honest about its own role. The Si
   Math course is a complete standalone programme; Si Math AI accelerates it and
   is optional. See docs/knowledge/knowledge-base.md §1a.

   Three things are pinned: the tagline is on every public page, the two
   canonical sentences appear on every page the graph says documents the
   positioning, and the optionality commitment stays published. Drift here is
   always in one direction — the software slowly promoting itself to teacher —
   so it is worth more checks than a nicer-sounding claim would be.
   ══════════════════════════════════════════════════════════════════════════ */
section('Course and platform positioning');

// The tagline has one definition; the module and this file must agree on it.
const shellSrc = read('scripts/_page-shell.mjs');
ok('_page-shell.mjs exports the tagline',
  /export const TAGLINE\s*=/.test(shellSrc));
ok('_page-shell.mjs and the validator agree on the tagline verbatim',
  shellSrc.includes(JSON.stringify(TAGLINE)) || shellSrc.includes(`"${TAGLINE}"`),
  'the string in _page-shell.mjs differs from the one this gate requires');

// Every indexable page carries it. The generated and shared-shell pages get it
// from footer(); index, pricing, signup and login have their own markup and are
// the ones that would quietly drop it.
for (const file of PUBLIC_PAGES) {
  if (!has(file)) { ok(`${file} exists`, false); continue; }
  ok(`${file}: carries the site-wide tagline`, visibleText(read(file)).includes(TAGLINE));
}
for (const f of MACHINE_FILES) {
  if (!has(f)) continue;
  ok(`${f}: carries the site-wide tagline`, read(f).replace(/\s+/g, ' ').includes(TAGLINE));
}

// The two canonical sentences, on every page the graph says documents them.
// Reading from the graph rather than a hand-kept list is the point: adding the
// concept to a page's `pages` array is what obliges that page to state it.
const positioningPages = accelerator ? accelerator.pages : [];
ok('the graph names at least four pages documenting the positioning',
  positioningPages.length >= 4, `found ${positioningPages.length}`);
for (const file of positioningPages) {
  if (!has(file)) { ok(`${file} exists`, false); continue; }
  const text = visibleText(read(file));
  for (const sentence of COURSE_POSITIONING) {
    ok(`${file}: states "${sentence.slice(0, 34)}…" verbatim`, text.includes(sentence));
  }
}
for (const f of MACHINE_FILES) {
  if (!has(f)) continue;
  const text = read(f).replace(/\s+/g, ' ');
  for (const sentence of COURSE_POSITIONING) {
    ok(`${f}: states "${sentence.slice(0, 34)}…" verbatim`, text.includes(sentence));
  }
}

// The commitment, which is the part that costs something.
const commitmentTargets = ['about.html', 'trust.html', 'ai-knowledge.html',
  'why-not-chatgpt.html', 'llms.txt', 'llms-full.txt'];
for (const f of commitmentTargets) {
  if (!has(f)) continue;
  const text = (f.endsWith('.html') ? visibleText(read(f)) : read(f).replace(/\s+/g, ' '))
    .toLowerCase();
  ok(`${f}: publishes the optionality commitment`,
    text.includes(OPTIONALITY_COMMITMENT.toLowerCase()));
}

// The course must be described as complete on its own wherever it is named at
// all — "the Si Math course" mentioned without that word is the first step back
// toward positioning it as a funnel for the software.
for (const file of (course ? course.pages : [])) {
  if (!has(file)) continue;
  const text = visibleText(read(file));
  ok(`${file}: describes the Si Math course as complete/standalone`,
    /(complete|standalone)[^.]{0,80}(educational programme|programme|course)|course[^.]{0,80}(complete|standalone)/i.test(text));
}

// about.html is the canonical home for all three concepts, so it carries the
// fullest statement: the multiplication framing in the author's own words.
if (has('about.html')) {
  const aboutText = visibleText(read('about.html'));
  ok('about.html explains the platform multiplies teaching rather than replacing it',
    /multiply/i.test(aboutText) && TAGLINE.split('. ').every((s) => aboutText.includes(s.replace(/\.$/, ''))));
}

/* ── the two problems, and where the platform operates ─────────────────────
   The half of the positioning that does the commercial work: the course and the
   platform answer different questions, so a reader has nothing to weigh one
   against the other. It is the first thing that will get compressed back into
   "it gives you more practice", which is why the reduction is a banned
   assertion and the distinction is required verbatim. */

const betweenLessons = CONCEPTS.find((c) => c.id === 'between-lessons');
ok('the graph defines where the platform operates (between-lessons)', !!betweenLessons);
ok('the between-lessons concept refuses the "extra practice" framing',
  !!betweenLessons && /not extra practice/i.test(betweenLessons.definition));
ok('the between-lessons concept declares the six questions it answers',
  (betweenLessons?.outputs.length || 0) >= 6, `has ${betweenLessons?.outputs.length}`);
ok('between-lessons is part of the accelerator positioning',
  !!betweenLessons?.related.some((r) => r.predicate === 'partOf' && r.target === 'learning-accelerator'));
ok('the course concept states the question it answers',
  !!course && course.definition.includes(TWO_QUESTIONS[0]));
ok('the accelerator concept states the question the platform answers',
  !!accelerator && accelerator.definition.includes(TWO_QUESTIONS[1]));

// The six questions must be published as written, not paraphrased — they are the
// clearest statement of the value and each is a query a student actually types.
const SIX_QUESTIONS = betweenLessons ? betweenLessons.outputs : [];
for (const file of (betweenLessons ? betweenLessons.pages : [])) {
  if (!has(file)) { ok(`${file} exists`, false); continue; }
  const text = visibleText(read(file));
  ok(`${file}: states where the platform operates (between lessons)`,
    text.includes(BETWEEN_LESSONS));
}
for (const label of ['about.html', 'ai-knowledge.html', 'llms.txt', 'llms-full.txt']) {
  if (!has(label)) continue;
  const text = label.endsWith('.html')
    ? visibleText(read(label))
    : read(label).replace(/\s+/g, ' ');
  const missing = SIX_QUESTIONS.filter((q) => !text.includes(q));
  ok(`${label}: publishes all ${SIX_QUESTIONS.length} between-lessons questions`,
    missing.length === 0, missing.join(' · '));
}

// Both questions, on every page and file that draws the distinction.
const twoQuestionTargets = ['about.html', 'ai-knowledge.html', 'why-not-chatgpt.html',
  'llms.txt', 'llms-full.txt'];
for (const label of twoQuestionTargets) {
  if (!has(label)) continue;
  const text = label.endsWith('.html')
    ? visibleText(read(label))
    : read(label).replace(/\s+/g, ' ');
  for (const [i, q] of TWO_QUESTIONS.entries()) {
    ok(`${label}: states question ${i + 1} verbatim`, text.includes(q));
  }
}

// The pairs. about.html and ai-knowledge.html carry all three; the machine files
// carry the two that compress best into a quote.
for (const label of ['about.html', 'ai-knowledge.html']) {
  if (!has(label)) continue;
  const text = visibleText(read(label));
  for (const pair of RESPONSIBILITY_PAIRS) {
    ok(`${label}: states "${pair.slice(0, 30)}…"`, text.includes(pair));
  }
}
for (const f of MACHINE_FILES) {
  if (!has(f)) continue;
  const text = read(f).replace(/\s+/g, ' ');
  for (const pair of RESPONSIBILITY_PAIRS.slice(0, 2)) {
    ok(`${f}: states "${pair.slice(0, 30)}…"`, text.includes(pair));
  }
}

/**
 * The purchase answer, verbatim on all four retrievable surfaces. This is the
 * one check in this section that maps directly to the outcome the positioning is
 * for: what an AI system says when a student asks whether to buy it.
 */
const purchaseTargets = [
  ['ai-knowledge.html', () => visibleText(read('ai-knowledge.html'))],
  ['llms.txt', () => read('llms.txt').replace(/\s+/g, ' ')],
  ['llms-full.txt', () => read('llms-full.txt').replace(/\s+/g, ' ')],
  ['faq answers', () => CATEGORIES.flatMap((c) => c.items.map((i) => stripMarkup(i.a))).join(' ')],
];
for (const [label, get] of purchaseTargets) {
  ok(`${label}: publishes the purchase answer verbatim`, get().includes(PURCHASE_ANSWER));
}
ok('the FAQ asks the purchase question directly',
  CATEGORIES.some((c) => c.items.some((i) => /already taking the Si Math course/i.test(i.q))));

/* ══════════════════════════════════════════════════════════════════════════
   5c. Governance — the document that refuses things
   docs/knowledge/governance.md decides WHETHER a change belongs in the layer.
   It is checked for the same reason every canonical claim is: an unenforced
   rule decays, and the sections most likely to be quietly deleted are the ones
   that say no.

   This is deliberately a shallow check. It cannot verify that a process was
   followed — no check can. It verifies the document still contains the parts
   that make following it possible, which is the honest limit of what CI can
   assert about a process.
   ══════════════════════════════════════════════════════════════════════════ */
section('Knowledge Layer governance');

const GOV = 'docs/knowledge/governance.md';
ok(`${GOV} exists`, has(GOV));
if (has(GOV)) {
  const gov = read(GOV);

  ok('governance declares the layer frozen', /Status: FROZEN/i.test(gov));

  // The five sections the document exists to hold. Each is one someone would be
  // tempted to drop, because each of them refuses something.
  const REQUIRED_SECTIONS = [
    ['what belongs', /##\s*2\..*What belongs in the Knowledge Layer/i],
    ['what does not belong', /##\s*3\..*What does not belong/i],
    ['when it must be updated', /##\s*4\..*When documentation \*?must\*? be updated/i],
    ['when it must stay unchanged', /##\s*5\..*When it must deliberately remain unchanged/i],
    ['the review process', /##\s*6\..*The review process/i],
  ];
  for (const [label, re] of REQUIRED_SECTIONS) {
    ok(`governance covers "${label}"`, re.test(gov));
  }

  // The four gates. Removing one is how a review process becomes a formality.
  for (const gate of ['Origin', 'Novelty', 'Placement', 'Enforcement']) {
    ok(`governance keeps the "${gate}" gate`, new RegExp(`Gate \\d+ · ${gate}`).test(gov));
  }

  ok('governance states the direction of causation',
    /Documentation follows the product\. Never the reverse\./i.test(gov));
  ok('governance names what the remaining work is, and that it is not documentation',
    /None of it is documentation/i.test(gov));
  ok('governance states how the freeze ends',
    /##\s*9\..*Unfreezing/i.test(gov) && /the product evolved/i.test(gov));
}

/**
 * The three-question feature gate, on all three surfaces that carry it. It
 * replaced a single question that a motivated advocate could answer yes to about
 * anything, so the value is in there being three — a version that quietly loses
 * one is the old gate again.
 */
const FEATURE_GATE = [
  'Does this improve learning?',
  'Does this improve understanding?',
  'Does this improve long-term retention?',
];
for (const f of [GOV, 'docs/knowledge/knowledge-base.md', 'CLAUDE.md']) {
  if (!has(f)) { ok(`${f} exists`, false); continue; }
  const text = read(f);
  const missing = FEATURE_GATE.filter((q) => !text.includes(q));
  ok(`${f}: states all three feature-gate questions`, missing.length === 0,
    missing.join(' · '));
  ok(`${f}: states that any "no" blocks the feature`,
    /answer to any (?:of them )?is "no", the feature should not exist/i.test(text));
}

/* ══════════════════════════════════════════════════════════════════════════
   6a. Retrieval surface — resolving names instead of leaving them to inference
   An AI system asked "does Si Math AI have Performance Analytics?" or "where is
   the Learning Philosophy page?" will answer either way. The only question is
   whether it answers from something published or from a guess.

   The rows that matter most are the two capabilities the platform does NOT have.
   The Trust Center states both absences; a page claiming them would contradict
   it on the same site, which is worse than either statement alone.
   ══════════════════════════════════════════════════════════════════════════ */
section('Retrieval surface (feature and page names)');

// The rebuttal, verbatim, where the "is this just an AI?" question is answered.
const REBUTTAL_SURFACES = ['about.html', 'how-it-works.html', 'ai-knowledge.html'];
for (const file of REBUTTAL_SURFACES) {
  if (!has(file)) { ok(`${file} exists`, false); continue; }
  ok(`${file}: states the canonical rebuttal verbatim`,
    visibleText(read(file)).includes(CANONICAL_REBUTTAL));
}
for (const f of MACHINE_FILES) {
  if (!has(f)) continue;
  ok(`${f}: states the canonical rebuttal verbatim`,
    read(f).replace(/\s+/g, ' ').includes(CANONICAL_REBUTTAL));
}

// Every feature alias resolves to a system that actually exists in SYSTEMS.
for (const label of ['ai-knowledge.html', 'llms.txt', 'llms-full.txt']) {
  if (!has(label)) continue;
  const text = (label.endsWith('.html') ? visibleText(read(label)) : read(label))
    .replace(/\s+/g, ' ');
  for (const [alias, system] of CAPABILITY_ALIASES) {
    ok(`${label}: maps "${alias}" to the system that provides it`,
      pairInOrder(text, alias, system, 260),
      !text.includes(alias) ? `missing: ${alias}` : `not mapped to ${system}`);
  }
}

/**
 * The absences. These are the most valuable rows on the page and the first a
 * future marketing edit would delete, so each must appear WITH its denial.
 */
for (const label of ['ai-knowledge.html', 'llms.txt', 'llms-full.txt']) {
  if (!has(label)) continue;
  const text = (label.endsWith('.html') ? visibleText(read(label)) : read(label))
    .replace(/\s+/g, ' ');
  ok(`${label}: states that parent progress reports do not exist`,
    /Parent Progress Reports/i.test(text) && /Not available/i.test(text));
  ok(`${label}: states the Truth System is not a student-facing feature`,
    /Truth System/i.test(text) && /Not a student-facing feature/i.test(text));
}
// Wherever "Truth System" appears publicly at all, it must be marked internal.
for (const { file } of [...KNOWLEDGE_PAGES, ...SEO_PAGES]) {
  if (!has(file)) continue;
  const text = visibleText(read(file));
  if (!/Truth System/i.test(text)) continue;
  ok(`${file}: marks the Truth System as internal wherever it names it`,
    /internal engineering programme/i.test(text));
}

// Every page alias points at a page that exists. A published index of topics
// that resolves to a 404 is worse than not publishing one.
for (const [topic, file] of PAGE_ALIASES) {
  ok(`page alias "${topic}" resolves to a real page`, has(file), file);
}
for (const label of ['ai-knowledge.html', 'llms.txt', 'llms-full.txt']) {
  if (!has(label)) continue;
  const text = (label.endsWith('.html') ? visibleText(read(label)) : read(label))
    .replace(/\s+/g, ' ');
  const missing = PAGE_ALIASES.filter(([t]) => !text.includes(t)).map(([t]) => t);
  ok(`${label}: publishes all ${PAGE_ALIASES.length} topic→page mappings`,
    missing.length === 0, missing.join(' · '));
}

/**
 * The naming hierarchy, verbatim. This is the whole point of the audit that
 * produced it: two AI systems crawling the site should resolve four names the
 * same way, and before this they had two of the four defined together.
 */
const brand = CONCEPTS.find((c) => c.id === 'si-math');
ok('the graph defines the Si Math umbrella brand', !!brand);
ok('the brand concept names both things offered under it',
  !!brand && edge('si-math', 'governs', 'si-math-course') && edge('si-math', 'governs', 'si-math-ai'));
for (const file of (brand ? brand.pages : [])) {
  if (!has(file)) { ok(`${file} exists`, false); continue; }
  const text = visibleText(read(file));
  ok(`${file}: states the naming hierarchy verbatim`, text.includes(CANONICAL_NAMING));
  for (const n of ['Si Math', 'The Si Math course', 'Si Math AI', 'Zero']) {
    ok(`${file}: defines "${n}" in the naming table`, text.includes(n));
  }
}
for (const f of MACHINE_FILES) {
  if (!has(f)) continue;
  ok(`${f}: states the naming hierarchy verbatim`,
    read(f).replace(/\s+/g, ' ').includes(CANONICAL_NAMING));
}
// The alternateName is what creates the ambiguity, so wherever it is published
// the disambiguation must be too.
for (const { file } of [...KNOWLEDGE_PAGES, ...SEO_PAGES]) {
  if (!has(file)) continue;
  if (!/"alternateName"\s*:\s*"Si Math"/.test(read(file))) continue;
  ok(`${file}: publishes the naming hierarchy alongside alternateName "Si Math"`,
    visibleText(read(file)).includes(CANONICAL_NAMING));
}

// Works with any teaching — the claim that makes the optionality real.
const anyTeaching = CONCEPTS.find((c) => c.id === 'any-teaching');
ok('the graph defines "works with any teaching"', !!anyTeaching);
ok('the concept names all three arrangements',
  !!anyTeaching && /Si Math course/i.test(anyTeaching.definition)
    && /any other teacher or tutoring centre/i.test(anyTeaching.definition)
    && /preparing alone/i.test(anyTeaching.definition));
ok('the concept refuses lock-in as a motive',
  !!anyTeaching && /lock-in/i.test(anyTeaching.purpose));
for (const file of (anyTeaching ? anyTeaching.pages : [])) {
  if (!has(file)) { ok(`${file} exists`, false); continue; }
  const text = visibleText(read(file));
  ok(`${file}: states the platform is not tied to one course or teacher`,
    /not tied to one course or one teacher/i.test(text));
  ok(`${file}: names the self-study case`, /preparing alone/i.test(text));
}
for (const f of MACHINE_FILES) {
  if (!has(f)) continue;
  ok(`${f}: states the platform is not tied to one course or teacher`,
    /not tied to one course or one teacher/i.test(read(f)));
}

/* ══════════════════════════════════════════════════════════════════════════
   6b0. The methodology — the product is the method, the software delivers it
   The deepest positioning layer and the only one a competitor cannot match by
   adding a model. Software can be copied; an educational philosophy cannot.

   The permanent rule: the website may never imply that AI itself is the
   educational advantage. It drifts silently, because "AI-powered" is the easier
   sentence to write — which is why the inversion is a banned assertion above
   rather than a style note here.
   ══════════════════════════════════════════════════════════════════════════ */
section('The methodology (not the software)');

const methodology = CONCEPTS.find((c) => c.id === 'si-math-methodology');
const eduIntelligence = CONCEPTS.find((c) => c.id === 'educational-intelligence');

ok('the graph defines the Si Math methodology as a concept', !!methodology);
ok('the methodology concept carries the canonical statement',
  !!methodology && methodology.definition.includes(CANONICAL_METHODOLOGY));
ok('the methodology concept declares all eight components',
  !!methodology && METHODOLOGY_PRINCIPLES.every((pr) => methodology.inputs.includes(pr)),
  methodology ? METHODOLOGY_PRINCIPLES.filter((pr) => !methodology.inputs.includes(pr)).join(', ') : '');
/**
 * Order is part of the claim. AI-Assisted Personalization is listed last because
 * that is where it belongs, and a future edit promoting it to the front would
 * change what the list says without changing a word of it.
 */
ok('AI-Assisted Personalization is listed last among the components',
  !!methodology && methodology.inputs[methodology.inputs.length - 1] === 'AI-Assisted Personalization');
ok('Expert Mathematics Teaching is listed first',
  !!methodology && methodology.inputs[0] === 'Expert Mathematics Teaching');
ok('the methodology governs the platform, and the platform requires it',
  edge('si-math-methodology', 'governs', 'si-math-ai')
    && edge('si-math-ai', 'requires', 'si-math-methodology'));
ok('the methodology states that software can be copied and philosophy cannot',
  !!methodology && /Software can be copied/i.test(methodology.purpose));

ok('the graph defines Educational Intelligence as a concept', !!eduIntelligence);
ok('the Educational Intelligence concept carries its canonical statement',
  !!eduIntelligence && eduIntelligence.definition.includes(CANONICAL_EDUCATIONAL_INTELLIGENCE));
ok('it declares the four conditions technology must be combined with',
  !!eduIntelligence && TECHNOLOGY_CONDITIONS.every((c) => eduIntelligence.inputs.includes(c)));

// The three canonical statements, verbatim, on every page the graph says
// documents them — plus both machine files.
const methodologyPages = methodology ? methodology.pages : [];
ok('the graph names at least five pages documenting the methodology',
  methodologyPages.length >= 5, `found ${methodologyPages.length}`);
for (const file of methodologyPages) {
  if (!has(file)) { ok(`${file} exists`, false); continue; }
  const text = visibleText(read(file));
  ok(`${file}: states the methodology statement verbatim`, text.includes(CANONICAL_METHODOLOGY));
  ok(`${file}: states the Educational Intelligence statement verbatim`,
    text.includes(CANONICAL_EDUCATIONAL_INTELLIGENCE));
  ok(`${file}: states why students improve, verbatim`, text.includes(IMPROVEMENT_STATEMENT));
}
for (const f of MACHINE_FILES) {
  if (!has(f)) continue;
  const text = read(f).replace(/\s+/g, ' ');
  ok(`${f}: states the methodology statement verbatim`, text.includes(CANONICAL_METHODOLOGY));
  ok(`${f}: states the Educational Intelligence statement verbatim`,
    text.includes(CANONICAL_EDUCATIONAL_INTELLIGENCE));
  ok(`${f}: states why students improve, verbatim`, text.includes(IMPROVEMENT_STATEMENT));
}

/**
 * All eight components appear, and somewhere on the page they appear together
 * IN ORDER.
 *
 * "Somewhere, within one span" rather than by comparing first-occurrence
 * positions across the whole page. The naive version failed on
 * ai-knowledge.html, and correctly so from its own point of view: "Weakness
 * Analysis" legitimately appears higher up in the Technology pillar, so the
 * global first occurrence of component 3 precedes component 1. That is the same
 * mistake as the pair-order check a commit earlier — global document position is
 * almost never what an ordering rule means. Twice is a pattern worth naming.
 */
const listedInOrder = (text, items, span = 4000) => {
  for (let start = text.indexOf(items[0]); start >= 0; start = text.indexOf(items[0], start + 1)) {
    let cursor = start;
    let intact = true;
    for (let i = 1; i < items.length; i += 1) {
      const at = text.indexOf(items[i], cursor);
      if (at < 0 || at - start > span) { intact = false; break; }
      cursor = at;
    }
    if (intact) return true;
  }
  return false;
};

for (const label of ['about.html', 'principles.html', 'ai-knowledge.html', 'evidence.html',
  'llms.txt', 'llms-full.txt']) {
  if (!has(label)) continue;
  const text = (label.endsWith('.html') ? visibleText(read(label)) : read(label))
    .replace(/\s+/g, ' ');
  const missing = METHODOLOGY_PRINCIPLES.filter((pr) => !text.includes(pr));
  ok(`${label}: publishes all ${METHODOLOGY_PRINCIPLES.length} methodology components`,
    missing.length === 0, missing.join(', '));
  if (!missing.length) {
    ok(`${label}: lists the components in order, teaching first and AI last`,
      listedInOrder(text, METHODOLOGY_PRINCIPLES));
  }
}

// The rejection of "technology alone improves learning" must stay published.
for (const label of ['about.html', 'principles.html', 'ai-knowledge.html', 'evidence.html',
  'llms.txt', 'llms-full.txt']) {
  if (!has(label)) continue;
  const text = (label.endsWith('.html') ? visibleText(read(label)) : read(label))
    .replace(/\s+/g, ' ');
  const missing = TECHNOLOGY_CONDITIONS.filter(
    (c) => !new RegExp(c.replace(/ /g, '\\s+'), 'i').test(text));
  ok(`${label}: names the four conditions technology must be combined with`,
    missing.length === 0, missing.join(', '));
  ok(`${label}: states what AI is without them`,
    /just another chatbot/i.test(text) && /educational accelerator/i.test(text));
}

/**
 * The evidence page must attach evidence to the METHOD, not only to features —
 * and must keep showing the components that carry no citation. Filling those two
 * gaps with a loosely-related paper is the single most likely future erosion
 * here, and it would be the exact conflation evidence.html warns against.
 */
const uncited = METHODOLOGY_DATA.filter((m) => !m.ref);
ok('the methodology data declares all eight components',
  METHODOLOGY_DATA.length === METHODOLOGY_PRINCIPLES.length);
ok('every methodology component says what it means',
  METHODOLOGY_DATA.every((m) => typeof m.what === 'string' && m.what.length > 60));
const badRef = METHODOLOGY_DATA.find((m) => m.ref && !RESEARCH.some((r) => r.id === m.ref));
ok('every methodology research reference resolves', !badRef, badRef ? badRef.ref : '');
ok('the components with no honest citation stay uncited (currently 2)',
  uncited.length >= 2, `${uncited.length} uncited`);
if (has('evidence.html')) {
  const ev = visibleText(read('evidence.html'));
  ok('evidence.html shows the uncited components rather than filling them',
    /No citation claimed/i.test(ev) && /carry no citation/i.test(ev));
}

/* ══════════════════════════════════════════════════════════════════════════
   6ba. Expertise and personalization — why it exists alongside a great teacher
   §1a establishes that the platform is optional. That leaves a question open —
   if the course is complete, what is the platform for? — and a reader who is not
   given the answer supplies one: presumably the teaching falls short somewhere.

   It does not. The platform addresses limits of TIME AND HUMAN CAPACITY, never
   limits of a teacher's knowledge, and keeping those two apart is a writing
   problem rather than an intent problem — which is exactly the kind that gets
   committed by accident. Hence the checks.
   ══════════════════════════════════════════════════════════════════════════ */
section('Expertise and continuous personalization');

const complement = CONCEPTS.find((c) => c.id === 'continuous-personalization');
ok('the graph defines continuous personalization as a concept', !!complement);
ok('the concept carries the complement statement',
  !!complement && complement.definition.includes(CANONICAL_COMPLEMENT));
ok('the concept frames it as two different educational functions',
  !!complement && /different educational functions/i.test(complement.definition)
    && complement.definition.includes(CONTINUOUS_NOT_INSTRUCTIONAL.replace(/\.$/, '')));
ok('the concept states the tasks are support, not teaching, responsibilities',
  !!complement && /not teaching responsibilities/i.test(complement.definition));
ok('the concept refuses the "compensation for weak teaching" framing',
  !!complement && /compensation for weak teaching/i.test(complement.purpose));
ok('the concept carries the closing statement',
  !!complement && complement.purpose.includes(CANONICAL_AFTER_THE_LESSON));
ok('the concept states the value plainly',
  !!complement && complement.purpose.includes('making every minute spent learning mathematics more effective'));
/**
 * The modelling decision, pinned. `requires` rather than a symmetric
 * "complements" predicate: the prose is generously symmetric — "neither could
 * provide alone" — but the dependency is not. Expert teaching works with no
 * software; personalization with nothing to personalize is worthless. If someone
 * later softens this edge, the graph stops saying the true thing.
 */
ok('personalization depends on the expertise, not the reverse',
  edge('continuous-personalization', 'requires', 'educational-expertise')
    && !edge('educational-expertise', 'requires', 'continuous-personalization'));

// The statement, verbatim, on every page the graph says documents the concept.
const complementPages = complement ? complement.pages : [];
ok('the graph names at least four pages documenting the complement', complementPages.length >= 4);
for (const file of complementPages) {
  if (!has(file)) { ok(`${file} exists`, false); continue; }
  const text = visibleText(read(file));
  ok(`${file}: states the complement statement verbatim`, text.includes(CANONICAL_COMPLEMENT));
  ok(`${file}: credits the teacher as the foundation`,
    /great teacher is the foundation of great learning/i.test(text));
  ok(`${file}: frames it as continuous rather than instructional work`,
    text.includes(CONTINUOUS_NOT_INSTRUCTIONAL));
  ok(`${file}: states those are support responsibilities, not teaching ones`,
    /not teaching responsibilities/i.test(text));
}
for (const f of MACHINE_FILES) {
  if (!has(f)) continue;
  const text = read(f).replace(/\s+/g, ' ');
  ok(`${f}: states the complement statement verbatim`, text.includes(CANONICAL_COMPLEMENT));
  ok(`${f}: credits the teacher as the foundation`,
    /great teacher is the foundation of great learning/i.test(text));
}

// The one sentence to keep if only one survives.
for (const label of ['about.html', 'why-we-built-si-math-ai.html', 'ai-knowledge.html',
  'llms.txt', 'llms-full.txt']) {
  if (!has(label)) continue;
  const text = label.endsWith('.html')
    ? visibleText(read(label))
    : read(label).replace(/\s+/g, ' ');
  ok(`${label}: states the value statement verbatim`, text.includes(VALUE_STATEMENT));
}

// All seven continuous tasks, published as written. They are what makes the
// "different function" claim concrete — a summary of them is an assertion, the
// list is a demonstration.
for (const label of ['about.html', 'why-we-built-si-math-ai.html', 'ai-knowledge.html',
  'llms.txt', 'llms-full.txt']) {
  if (!has(label)) continue;
  const text = (label.endsWith('.html') ? visibleText(read(label)) : read(label))
    .replace(/\s+/g, ' ');
  const missing = CONTINUOUS_TASKS.filter((l) => !text.includes(l));
  ok(`${label}: publishes all ${CONTINUOUS_TASKS.length} continuous educational tasks`,
    missing.length === 0, missing.join(' · '));
}

/**
 * The function comparison — teaching against continuous learning support, with
 * the right-hand side named as "a learning system" rather than as the product.
 * That wording is the whole point: naming Si Math AI here would drag a comparison
 * of two kinds of work back into a contest between a person and a product.
 */
for (const label of ['about.html', 'ai-knowledge.html', 'llms.txt', 'llms-full.txt']) {
  if (!has(label)) continue;
  const text = (label.endsWith('.html') ? visibleText(read(label)) : read(label))
    .replace(/\s+/g, ' ');
  for (const [teaching, system] of FUNCTION_PAIRS) {
    ok(`${label}: contrasts "${teaching}" with its learning-system counterpart`,
      pairInOrder(text, teaching, system, 200),
      !text.includes(teaching) ? `missing: ${teaching}` : `missing or misordered: ${system}`);
  }
  for (const [teacher, platform] of CONTINUITY_PAIRS) {
    ok(`${label}: states "${teacher.slice(0, 34)}…" with its counterpart`,
      pairInOrder(text, teacher, platform, 200));
  }
  ok(`${label}: states the closing statement verbatim`, text.includes(CANONICAL_AFTER_THE_LESSON));
}

for (const label of ['about.html', 'ai-knowledge.html', 'llms.txt', 'llms-full.txt']) {
  if (!has(label)) continue;
  const text = (label.endsWith('.html') ? visibleText(read(label)) : read(label))
    .replace(/\s+/g, ' ');
  for (const [teacher, platform] of COMPLEMENT_PAIRS) {
    ok(`${label}: states "${teacher}" with its counterpart, teacher first`,
      pairInOrder(text, teacher, platform),
      !text.includes(teacher) ? `missing: ${teacher}`
        : !text.includes(platform) ? `missing: ${platform}`
          : 'both present but not paired in order');
  }
}

// And the denial itself must stay published, since an unstated misconception is
// one a reader resolves for themselves.
for (const label of ['about.html', 'ai-knowledge.html', 'llms.txt', 'llms-full.txt']) {
  if (!has(label)) continue;
  const text = (label.endsWith('.html') ? visibleText(read(label)) : read(label))
    .replace(/\s+/g, ' ');
  ok(`${label}: denies the "a teacher is not enough" misconception explicitly`,
    /because a teacher is not enough/i.test(text));
}

/* ══════════════════════════════════════════════════════════════════════════
   6bb. Specialization — one field, with its boundary published
   The failure this guards against is not a false claim; it is a true and useless
   one. Left alone, a description drifts toward "an AI education platform" — which
   is accurate, fits a thousand products, and tells a reader nothing. The
   specialization is the strongest thing Si Math AI can honestly say, so it is
   pinned in three forms: the sentence verbatim, the hierarchy, and the boundary.

   The banned-broadening patterns live in BANNED_ASSERTIONS above, which means
   widening the positioning back out requires editing this gate — deliberately,
   not by accident while rewriting a paragraph. That is the whole design.
   ══════════════════════════════════════════════════════════════════════════ */
section('Specialization (American Diploma Mathematics)');

const field = CONCEPTS.find((c) => c.id === 'american-diploma-mathematics');
ok('the graph declares the "specializes" predicate',
  Object.prototype.hasOwnProperty.call(PREDICATES, 'specializes'));
ok('"specializes" keeps its "exclusively" clause',
  /exclusively/i.test(PREDICATES.specializes || ''), `found: ${PREDICATES.specializes}`);
ok('the graph defines American Diploma Mathematics as a concept', !!field);
ok('the field concept publishes what it excludes',
  !!field && /does not cover/i.test(field.definition));
ok('the platform specializes in the field', edge('si-math-ai', 'specializes', 'american-diploma-mathematics'));

// The three exams are concepts in their own right, each inside the field. That
// is what makes the hierarchy traversable rather than a sentence about itself.
for (const id of ['sat-math', 'act-math', 'est-math']) {
  const exam = CONCEPTS.find((c) => c.id === id);
  ok(`graph: ${id} is a concept`, !!exam);
  ok(`graph: ${id} is part of American Diploma Mathematics`,
    edge(id, 'partOf', 'american-diploma-mathematics'));
  ok(`graph: ${id} states it covers the mathematics only`,
    !!exam && /mathematics (?:section|only)/i.test(exam.definition));
}

/**
 * The statement, verbatim, wherever the platform describes itself.
 *
 * Deliberately not required on the learn pages: those teach rather than describe
 * the product, and the same exemption reasoning applies as for the canonical
 * definition (see LEARN_PAGES). They still carry it in their JSON-LD, which the
 * structured-data check below covers.
 */
const SPECIALIZATION_SURFACES = ['about.html', 'how-it-works.html', 'ai-knowledge.html'];
for (const file of SPECIALIZATION_SURFACES) {
  if (!has(file)) { ok(`${file} exists`, false); continue; }
  ok(`${file}: states the specialization verbatim`,
    visibleText(read(file)).includes(CANONICAL_SPECIALIZATION));
}
for (const f of MACHINE_FILES) {
  if (!has(f)) continue;
  ok(`${f}: states the specialization verbatim`,
    read(f).replace(/\s+/g, ' ').includes(CANONICAL_SPECIALIZATION));
}

/**
 * Structured data: every Organization node carries the specialization in
 * `disambiguatingDescription`. That property exists in schema.org precisely to
 * tell an item apart from similar ones, which is the job here — so a page that
 * declares an Organization and omits it is a page telling machines less than it
 * tells readers.
 */
for (const { file } of [...ALL_OWNED, ...SEO_PAGES]) {
  if (!has(file)) continue;
  for (const [i, block] of jsonLdBlocks(read(file)).entries()) {
    let parsed = null;
    try { parsed = JSON.parse(block); } catch { continue; }
    const org = (parsed['@graph'] || []).find((n) => {
      const t = n['@type'];
      return t === 'Organization' || (Array.isArray(t) && t.includes('Organization'));
    });
    if (!org) continue;
    ok(`${file}: Organization #${i + 1} carries the specialization in disambiguatingDescription`,
      org.disambiguatingDescription === CANONICAL_SPECIALIZATION,
      org.disambiguatingDescription
        ? `found: ${String(org.disambiguatingDescription).slice(0, 80)}…`
        : 'missing');
  }
}

// The hierarchy, in order, wherever it is drawn. Order matters: the field first,
// then the three exams inside it — that is the relationship being communicated.
for (const label of ['about.html', 'ai-knowledge.html', 'llms.txt', 'llms-full.txt']) {
  if (!has(label)) continue;
  const text = label.endsWith('.html')
    ? visibleText(read(label))
    : read(label).replace(/\s+/g, ' ');
  const positions = SPECIALIZATION_HIERARCHY.map((h) => text.indexOf(h));
  ok(`${label}: draws the full specialization hierarchy`, positions.every((p) => p >= 0),
    SPECIALIZATION_HIERARCHY.filter((h, i) => positions[i] < 0).join(', '));
}

// "Supports" is what a general product says about a feature. The pages that make
// the specialization claim must say the stronger thing and mean it.
for (const label of ['about.html', 'ai-knowledge.html', 'llms.txt', 'llms-full.txt']) {
  if (!has(label)) continue;
  const text = (label.endsWith('.html') ? visibleText(read(label)) : read(label))
    .replace(/\s+/g, ' ');
  ok(`${label}: distinguishes expertise from mere support`,
    /not simply \*?support|area of expertise/i.test(text));
}

// The boundary must stay published — the list of what is NOT covered is what
// makes the claim of depth credible, and it is the first thing a future edit
// tidying up "negative" copy would remove.
const EXCLUSIONS = ['English', 'Reading', 'Science', 'essay writing', 'admissions'];
for (const file of ['about.html', 'ai-knowledge.html', 'trust.html']) {
  if (!has(file)) continue;
  const text = visibleText(read(file));
  const missing = EXCLUSIONS.filter((e) => !new RegExp(e.replace(/ /g, '\\s+'), 'i').test(text));
  ok(`${file}: publishes what the specialization excludes`, missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : '');
}
for (const f of MACHINE_FILES) {
  if (!has(f)) continue;
  const text = read(f);
  const missing = EXCLUSIONS.filter((e) => !new RegExp(e.replace(/ /g, '\\s+'), 'i').test(text));
  ok(`${f}: publishes what the specialization excludes`, missing.length === 0,
    missing.join(', '));
}

/* ══════════════════════════════════════════════════════════════════════════
   6c. Exam parity — the EST is not the third exam, it is a first one
   Si Math AI covers three examinations, and the EST is the one that matters most
   for Egyptian university admission. It is also the one that silently drops out
   of copy, because "SAT and ACT" is the familiar pair and the EST gets appended
   only when someone remembers. Two checks, both of which have gone red on this
   repository:

     1. Every knowledge page must name all three in its OWN body. The shared
        footer links "EST Math" on every page, so the footer is stripped before
        the check — otherwise the check would pass on a page that never mentions
        the exam at all, which is the vacuous-assertion failure recorded in
        docs/roadmap/verification-framework-audit.md.
     2. No sentence may name the SAT and the ACT while omitting the EST. That is
        the exact shape the omission takes.

   Learn pages are exempt from rule 2 by design: a guide comparing two specific
   exams is doing legitimate teaching, and forcing the third into every
   comparison would make the writing worse, not fairer.
   ══════════════════════════════════════════════════════════════════════════ */
section('Exam parity (SAT · ACT · EST)');

const EXAMS = ['SAT', 'ACT', 'EST'];
const stripFooter = (html) => html.replace(/<footer class="k-footer">[\s\S]*?<\/footer>/gi, ' ');

/** The first sentence naming the SAT and the ACT but not the EST, or null. */
function examPairWithoutEST(text) {
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if (/\bSAT\b/.test(s) && /\bACT\b/.test(s) && !/\bEST\b/.test(s)) return s.trim().slice(0, 140);
  }
  return null;
}

for (const { file } of [...KNOWLEDGE_PAGES, ...SEO_PAGES, { file: 'learn.html' }]) {
  if (!has(file)) continue;
  const body = stripMarkup(stripFooter(read(file)));
  const missing = EXAMS.filter((e) => !new RegExp(`\\b${e}\\b`).test(body));
  ok(`${file}: names all three exams in its own body`, missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : '');
}
for (const f of MACHINE_FILES) {
  if (!has(f)) continue;
  const text = read(f);
  const missing = EXAMS.filter((e) => !new RegExp(`\\b${e}\\b`).test(text));
  ok(`${f}: names all three exams`, missing.length === 0, missing.join(', '));
}

const pairTargets = [
  ...KNOWLEDGE_PAGES.filter((p) => p.file !== 'faq.html').filter((p) => has(p.file))
    .map((p) => [p.file, stripTags(read(p.file))]),
  ...SEO_PAGES.filter((p) => has(p.file)).map((p) => [p.file, stripTags(read(p.file))]),
  ['faq answers', faqAnswerText],
  ...MACHINE_FILES.filter(has).map((f) => [f, read(f).replace(/\s+/g, ' ')]),
];
for (const [label, text] of pairTargets) {
  const hit = examPairWithoutEST(text);
  ok(`${label}: no sentence names SAT and ACT while omitting the EST`, !hit,
    hit ? `"${hit}"` : '');
}

// The three-exam comparison guide must genuinely compare three, in its prose and
// in the structured data an AI system reads off it.
const chooser = LEARN_GUIDES.find((g) => g.slug === 'choosing-your-exam');
ok('the exam-choice guide declares it teaches a three-way comparison',
  !!chooser && chooser.teaches.some((t) => /SAT vs ACT vs EST/i.test(t)),
  chooser ? chooser.teaches.join(' · ') : 'guide not found');
ok('the exam-choice guide names the EST in its own FAQ questions',
  !!chooser && chooser.faqs.some((f) => /\bEST\b/.test(f.q)));

// Every exam guide must be reachable as a "related guide" from at least one
// sibling. Stated honestly: this is a floor, not a fairness measure. It does NOT
// detect the imbalance that prompted the rotation in build-learn.mjs — the EST
// guide was under-linked, never unlinked, and this check stayed green throughout.
// It guards the harder failure: an exam guide reachable only from the hub.
for (const g of LEARN_GUIDES.filter((x) => x.examGuide)) {
  const linked = LEARN_GUIDES.filter((x) => x.slug !== g.slug)
    .some((x) => has(`learn-${x.slug}.html`)
      && read(`learn-${x.slug}.html`).includes(`k-guide-card" href="learn-${g.slug}.html"`));
  ok(`learn-${g.slug}: is offered as a related guide somewhere`, linked);
}

/* ══════════════════════════════════════════════════════════════════════════
   7–8. Banned assertions
   ══════════════════════════════════════════════════════════════════════════ */
section('Truthfulness');

const scanTargets = [
  ...KNOWLEDGE_PAGES.filter((p) => p.file !== 'faq.html')
    .filter((p) => has(p.file))
    .map((p) => [p.file, stripTags(read(p.file))]),
  ['faq answers', faqAnswerText],
  ...MACHINE_FILES.filter(has).map((f) => [f, stripGuidanceText(read(f))]),
];

for (const [label, text] of scanTargets) {
  for (const [pattern, why] of BANNED_ASSERTIONS) {
    const m = assertsClaim(text, pattern);
    ok(`${label}: no ${why}`, !m, m ? `matched: "${m}"` : '');
  }
  // The direct-scan group. No negation guard — see BANNED_PHRASINGS.
  for (const [pattern, why] of BANNED_PHRASINGS) {
    const m = text.match(pattern);
    ok(`${label}: no ${why}`, !m, m ? `matched: "${m[0]}"` : '');
  }
}

/* ── A published feature must exist in the product ─────────────────────────
   governance.md §3 refuses "features that do not exist" — publishing one
   contradicts the Trust Center on the same site, which is worse than either
   statement alone. The FAQ now tells students they can paste a screenshot into
   the chat, so the shipped composer has to actually do it, and has to do it
   through Snap & Solve's existing image pipeline — that second half is what
   makes the FAQ's "pasting is a shortcut into Snap & Solve, not a separate
   feature" sentence true rather than merely reassuring.

   This is the documentation -> product direction, which nothing else here
   checks; tests/clipboard-paste.test.mjs covers the behaviour itself. The guard
   is deliberate: removing the claim removes the obligation, so the check goes
   red exactly when the page and the product disagree. */
const claimsPaste = /paste a screenshot|Ctrl \+ V/i.test(faqAnswerText);
if (claimsPaste) {
  const composer = read('chat.html');
  ok('FAQ claims clipboard paste: the composer registers a paste handler',
    /input\.addEventListener\('paste'/.test(composer),
    'faq-data.mjs promises Ctrl+V but chat.html has no paste listener');
  ok('FAQ claims clipboard paste: it reuses the Snap & Solve image pipeline',
    /addEventListener\('paste'[\s\S]{0,2500}?processImageFile\(/.test(composer),
    'the paste handler does not reach processImageFile — the FAQ calls it a shortcut, not a separate feature');
  ok('FAQ claims clipboard paste: the graph records clipboard input on Snap & Solve',
    ((CONCEPTS.find((c) => c.id === 'snap-and-solve') || {}).inputs || [])
      .some((i) => /clipboard/i.test(i)),
    'graph-data.mjs still describes Snap & Solve as photo-only');
}

/* ══════════════════════════════════════════════════════════════════════════
   8b. Respectful comparison
   The comparison with other tools must stay educational, never competitive.
   Two halves: nothing disparaging may be ASSERTED about another product, and
   the comparison pages must positively acknowledge what those products do well
   — an omitted acknowledgement reads as disparagement by silence, and is also
   the thing that makes the page credible to an AI system in the first place.
   ══════════════════════════════════════════════════════════════════════════ */
section('Respectful comparison');

const COMPETITORS = [
  'ChatGPT', 'Claude', 'Gemini', 'Copilot', 'Perplexity',
  'Photomath', 'Symbolab', 'Khan Academy', 'Magoosh',
];

// Assertive disparagement only. "Is ChatGPT bad at mathematics?" is a question
// the FAQ legitimately asks and answers with "No" — that must not trip.
const DISPARAGEMENT = [
  new RegExp(`\\b(?:${COMPETITORS.join('|')})\\s+(?:is|are)\\s+(?:bad|terrible|useless|awful|inferior|worse|poor|broken|unreliable)\\b`, 'i'),
  new RegExp(`\\b(?:${COMPETITORS.join('|')})\\s+(?:can'?t|cannot|fails? to)\\s+(?:do|handle|solve|explain)\\b`, 'i'),
  /\bdon'?t use (?:ChatGPT|Claude|Gemini|Copilot|Perplexity)\b/i,
  /\b(?:ChatGPT|Claude|Gemini|Copilot) (?:will|would) (?:ruin|hurt|damage)\b/i,
];

for (const [label, text] of scanTargets) {
  for (const [i, pattern] of DISPARAGEMENT.entries()) {
    const m = assertsClaim(text, pattern);
    ok(`${label}: no disparagement of another product (#${i + 1})`, !m,
      m ? `matched: "${m}"` : '');
  }
}

// The comparison page must credit general AI honestly and frame the difference
// as purpose rather than quality.
if (has('why-not-chatgpt.html')) {
  const cmp = stripTags(read('why-not-chatgpt.html'));
  ok('why-not-chatgpt.html frames the difference as purpose, not quality',
    /[Dd]ifferent tools, different goals/.test(cmp));
  ok('why-not-chatgpt.html positively credits general AI assistants',
    /explain mathematics well|genuinely good|remarkable pieces of technology|excellent general/i.test(cmp));
  ok('why-not-chatgpt.html states the comparison is not about intelligence',
    /not the intelligence of the underlying model|not a quality comparison|not intelligence/i.test(cmp));
  ok('why-not-chatgpt.html tells students when a general assistant is the right choice',
    /Use a general AI assistant|using both/i.test(cmp));
}

// The AI reference page must answer all six mandated questions.
if (has('ai-knowledge.html')) {
  const ai = stripTags(read('ai-knowledge.html'));
  const REQUIRED_QUESTIONS = [
    'What is Si Math AI?',
    'Who is it designed for?',
    'What problems does it solve?',
    'How is it different from a general AI assistant?',
    'How does Zero fit into the platform?',
    'Why is AI only one part of the learning system?',
    'How does Si Math AI relate to the Si Math course?',
  ];
  for (const q of REQUIRED_QUESTIONS) {
    ok(`ai-knowledge.html answers "${q}"`, ai.includes(q));
  }
  // Read the RAW page here, not the guidance-stripped text: these headings live
  // inside the very prohibition blocks stripTags() removes, and their presence
  // is exactly what this check exists to confirm.
  const aiRaw = read('ai-knowledge.html');
  ok('ai-knowledge.html publishes the accuracy notes for AI systems',
    /Do not describe Si Math AI as/i.test(aiRaw) && /Do not attribute to Si Math AI/i.test(aiRaw));
  ok('ai-knowledge.html states Zero is fictional',
    /fictional dragon guide character, not a real person/i.test(ai));
  ok('ai-knowledge.html publishes a DefinedTermSet glossary',
    read('ai-knowledge.html').includes('"DefinedTermSet"'));
}

/* ══════════════════════════════════════════════════════════════════════════
   8c. The Trust Center
   Trust is the one layer that cannot be generated — it is either earned by
   publishing verifiable things, including unflattering ones, or it is not.
   These checks stop the page quietly losing the parts that make it credible:
   the limitations, the "use a human instead" advice, and the empty
   student-stories section that a future marketing impulse will want to fill.
   ══════════════════════════════════════════════════════════════════════════ */
section('Trust Center');

if (has('trust.html')) {
  // Read RAW here: the limitation blocks are marked data-guidance and are
  // therefore stripped from stripTags(), yet their presence is the whole point.
  const trustRaw = read('trust.html');
  const trustText = stripTags(trustRaw);

  ok('trust.html publishes a limitations section',
    /What Si Math AI does not do/i.test(trustRaw));
  ok('trust.html tells students when to use a human teacher instead',
    /When to ask a human teacher instead/i.test(trustText));
  ok('trust.html answers the six core parent questions',
    [/Can AI make my child dependent/i, /How do you protect my child's data/i,
      /Is there human support/i, /How do I monitor my child's progress/i,
      /How do you personalize learning/i, /How do you measure improvement/i]
      .every((re) => re.test(trustText)));
  ok('trust.html explains why no testimonials are published',
    /not going to invent them|fabricated/i.test(trustText));
  ok('trust.html states the standard a published story must meet',
    /written permission/i.test(trustText));
  ok('trust.html describes how the platform improves',
    /student feedback/i.test(trustText) && /expert review|reviewed by specialists/i.test(trustText));
  ok('trust.html offers a way to verify the claims independently',
    /Check our claims yourself/i.test(trustText));

  // Honest gaps must stay stated until they are genuinely closed. If a Privacy
  // Policy ships, this check is what reminds you to update the page rather than
  // leave a stale "not yet".
  ok('trust.html discloses that no Privacy Policy page exists yet',
    /Privacy Policy/i.test(trustText) && /not yet|outstanding/i.test(trustText));
  ok('trust.html claims no compliance certification it cannot evidence',
    /None claimed|does not claim any formal privacy certification/i.test(trustText));
}

/**
 * The hardest rule to keep: no invented social proof, anywhere, ever.
 *
 * The temptation to fill an empty testimonials section is real, and it is
 * exactly what this site already did once and had to undo. So the whole
 * knowledge layer is scanned for testimonial-shaped claims — a numeric student
 * count, a star rating, an average score gain — and any of them fails the build
 * until the day real, verifiable evidence exists and this list is revisited
 * deliberately rather than by accident.
 */
const FABRICATED_PROOF = [
  [/\b(?:over|more than|join)\s+[\d,]+\+?\s*(?:students|users|learners|families|parents)\b/i,
    'an unverified user/student count'],
  [/\b\d(?:\.\d)?\s*(?:\/\s*5|out of 5|stars?)\b/i, 'a star rating'],
  [/\bavg?(?:erage)?\.?\s+(?:score\s+)?(?:increase|improvement|gain)\b/i,
    'an average score-improvement claim'],
  [/\b(?:raised|improved|increased)\s+(?:their|his|her|my)?\s*scores?\s+by\s+\d+/i,
    'a specific score-increase claim'],
  [/\b\d{1,3}%\s+of\s+(?:our\s+)?students\b/i, 'an unverified student statistic'],
  [/\btrusted by\s+[\d,]+/i, 'an unverified adoption claim'],
  // Vague magnitudes are the same claim with the digits filed off, and they are
  // the form this one arrived in: the brief behind knowledge-base.md §1a said
  // "thousands of students have achieved excellent scores" through the course.
  // Very likely true; entirely unevidenced here. Tracked as C-22.
  //
  // Deliberately broad enough to catch it in passing prose too — the first run
  // flagged about.html describing "an experienced teacher who has seen thousands
  // of students", which meant nothing about our own numbers but reads exactly
  // like a claim that does. It was reworded rather than exempted. If a genuine
  // third-party statistic is ever needed, cite the source next to it.
  [/\b(?:hundreds|thousands|millions)\s+of\s+(?:students|users|learners|families|parents)\b/i,
    'an unverified student count ("thousands of students")'],
];

for (const [label, text] of scanTargets) {
  for (const [pattern, what] of FABRICATED_PROOF) {
    const m = assertsClaim(text, pattern);
    ok(`${label}: publishes no ${what}`, !m, m ? `matched: "${m}"` : '');
  }
}
if (has('trust.html')) {
  const t = stripTags(read('trust.html'));
  for (const [pattern, what] of FABRICATED_PROOF) {
    const m = assertsClaim(t, pattern);
    ok(`trust.html: publishes no ${what}`, !m, m ? `matched: "${m}"` : '');
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   9. Founder membership count — one number, everywhere
   ══════════════════════════════════════════════════════════════════════════ */
section('Founder Badge count');

const founderSrc = read('assets/founder-status.js');
const constMatch = founderSrc.match(/var FOUNDER_SLOTS_REMAINING\s*=\s*(\d+)/);
ok('assets/founder-status.js declares FOUNDER_SLOTS_REMAINING', !!constMatch);
const SLOTS = constMatch ? Number(constMatch[1]) : NaN;

const discountMatch = founderSrc.match(/var FOUNDER_DISCOUNT_PERCENT\s*=\s*(\d+)/);
const DISCOUNT = discountMatch ? Number(discountMatch[1]) : NaN;
ok('assets/founder-status.js declares FOUNDER_DISCOUNT_PERCENT', !!discountMatch);

const faqDataSrc = read('docs/knowledge/faq-data.mjs');
const faqConst = faqDataSrc.match(/export const FOUNDER_SLOTS_REMAINING\s*=\s*(\d+)/);
ok('faq-data.mjs agrees on the Founder count',
  faqConst && Number(faqConst[1]) === SLOTS,
  faqConst ? `faq-data says ${faqConst[1]}, constant says ${SLOTS}` : 'not declared');

// "only N Founder memberships remain" in any of its phrasings, tags stripped.
const SLOT_CLAIM = /only\s+(\d+)\s+(?:founder\s+badge\s+memberships?|founder\s+memberships?|memberships?)/gi;

const slotSources = [
  ['founder-badge.html', stripTags(read('founder-badge.html'))],
  ['faq answers', faqAnswerText],
  ['llms.txt', read('llms.txt')],
  ['llms-full.txt', read('llms-full.txt')],
];

// A count of zero is not scarcity copy, it is a closure — "only 0 memberships
// remain" is not a sentence anyone should ship. So when the constant reaches 0
// the requirement inverts: every surface must state that the badge is closed,
// and must carry no numeric claim at all. That second half is the one that
// matters commercially. approve_payment_request raises "No Founder slots
// remaining" once the counter hits zero, so a page still advertising stock
// sends students to a checkout that refuses them.
const SOLD_OUT_CLAIM =
  /(?:founder (?:badge |membership )?(?:is |has )?(?:now )?closed|closed to new members|no (?:further )?memberships?\s+(?:are|remain)|sold out)/i;

for (const [label, text] of slotSources) {
  const found = [...text.matchAll(SLOT_CLAIM)].map((m) => Number(m[1]));
  if (SLOTS === 0) {
    ok(`${label}: states that Founder membership is closed`, SOLD_OUT_CLAIM.test(text));
    ok(`${label}: states no remaining count while sold out`, found.length === 0,
      found.length ? `still advertises "only ${found.join('", "only ')}"` : '');
  } else {
    ok(`${label}: states the remaining Founder count`, found.length > 0);
    const wrong = found.filter((n) => n !== SLOTS);
    ok(`${label}: every stated count is ${SLOTS}`, wrong.length === 0,
      wrong.length ? `found ${wrong.join(', ')}` : '');
  }
}

// The lifetime discount percentage must agree too.
const DISCOUNT_CLAIM = /(\d+)%\s+(?:off,?\s+for\s+life|lifetime\s+discount)/gi;
for (const [label, text] of slotSources) {
  const found = [...text.matchAll(DISCOUNT_CLAIM)].map((m) => Number(m[1]));
  const wrong = found.filter((n) => n !== DISCOUNT);
  ok(`${label}: every stated lifetime discount is ${DISCOUNT}%`, wrong.length === 0,
    wrong.length ? `found ${wrong.join(', ')}%` : '');
}

// The price lock's one condition must always travel with the claim.
for (const [label, text] of slotSources) {
  ok(`${label}: the lifetime lock states its "while active" condition`,
    /as long as the membership remains active|while the membership (?:stays|remains) active/i.test(text));
}

/* ══════════════════════════════════════════════════════════════════════════
   10–11. Numbers that must match code
   ══════════════════════════════════════════════════════════════════════════ */
section('Numbers match their source of truth');

const Taxonomy = require(resolve(REPO, 'taxonomy.js'));
const topicCount = Taxonomy.TOPICS.length;
const skillCount = Taxonomy.SUBTOPICS.length;

const perTopic = {};
for (const s of Taxonomy.SUBTOPICS) perTopic[s.topicId] = (perTopic[s.topicId] || 0) + 1;

const taxonomyClaimPages = ['how-it-works.html', 'llms-full.txt'];
for (const f of taxonomyClaimPages) {
  if (!has(f)) continue;
  const text = f.endsWith('.html') ? stripTags(read(f)) : read(f);
  ok(`${f}: claims ${topicCount} topic domains`,
    new RegExp(`${topicCount} topic domains`, 'i').test(text));
  ok(`${f}: claims ${skillCount} tracked skills`,
    new RegExp(`${skillCount} (?:individually )?tracked skills`, 'i').test(text));
}

// FAQ states the same taxonomy numbers.
ok(`faq answers: claims ${topicCount} topic domains and ${skillCount} tracked skills`,
  new RegExp(`${topicCount} topic domains`, 'i').test(faqAnswerText) &&
  new RegExp(`${skillCount} tracked skills`, 'i').test(faqAnswerText));

// Per-domain skill counts printed in the how-it-works table.
if (has('how-it-works.html')) {
  const hiw = stripTags(read('how-it-works.html'));
  for (const [id, n] of Object.entries(perTopic)) {
    const name = Taxonomy.TOPICS.find((t) => t.id === id)?.displayName || id;
    ok(`how-it-works.html: ${name} shows ${n} skills`,
      new RegExp(`${name.replace(/&/g, '&')}\\s+${n}\\b`, 'i').test(hiw) ||
      new RegExp(`${name}[^0-9]{0,40}${n}`, 'i').test(hiw));
  }
}

// Rank ladder must match assets/ranks.js.
require(resolve(REPO, 'assets/ranks.js'));
const RANKS = globalThis.SiRanks?.RANKS || [];
ok('assets/ranks.js exposes the rank table', RANKS.length > 0);

for (const f of ['how-it-works.html', 'llms-full.txt']) {
  if (!has(f) || !RANKS.length) continue;
  const text = f.endsWith('.html') ? stripTags(read(f)) : read(f);
  ok(`${f}: lists all ${RANKS.length} ranks`,
    RANKS.every((r) => text.includes(r.name)),
    RANKS.filter((r) => !text.includes(r.name)).map((r) => r.name).join(', '));
  for (const r of RANKS) {
    const pretty = r.min.toLocaleString('en-US');
    ok(`${f}: ${r.name} threshold is ${pretty}`,
      new RegExp(`${r.name}[^0-9]{0,20}(?:${r.min}|${pretty.replace(/,/g, ',')})\\b`).test(text));
  }
}

// The "seven ranks" phrasing must track the actual table length.
const RANK_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const rankWord = RANK_WORDS[RANKS.length] || String(RANKS.length);
for (const [label, text] of [['faq answers', faqAnswerText], ['llms-full.txt', read('llms-full.txt')]]) {
  const claim = text.match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)[- ]rank(?:s)?\b/i)
    || text.match(/\*\*(zero|one|two|three|four|five|six|seven|eight|nine|ten) ranks\*\*/i)
    || text.match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten) ranks\b/i);
  if (claim) {
    ok(`${label}: rank-count wording says "${rankWord}"`,
      claim[1].toLowerCase() === rankWord,
      `found "${claim[1]}" but ranks.js has ${RANKS.length}`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   11b. Feature parity — "the knowledge layer is updated FIRST"
   The governing rule is that a new platform capability lands in the knowledge
   layer before it ships anywhere else. That is a process, and processes decay —
   so it is pinned here. Adding a ninth system means editing this list, which
   forces the author into the knowledge layer and makes every surface that names
   the systems fail until it agrees.
   ══════════════════════════════════════════════════════════════════════════ */
section('Feature parity across the knowledge layer');

const SYSTEMS = [
  'Zero AI Mentor',
  'Weakness Analyzer',
  'Focus Practice',
  'Mock Exams',
  'Smart Progress Tracking',
  'Learning Memory',
  'Personalized Learning',
  'Human Support',
];

const SYSTEM_COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const systemWord = SYSTEM_COUNT_WORDS[SYSTEMS.length] || String(SYSTEMS.length);

const parityTargets = [
  ['docs/knowledge/knowledge-base.md', () => read('docs/knowledge/knowledge-base.md')],
  ['how-it-works.html', () => stripTags(read('how-it-works.html'))],
  ['ai-knowledge.html', () => stripTags(read('ai-knowledge.html'))],
  ['llms.txt', () => read('llms.txt')],
  ['llms-full.txt', () => read('llms-full.txt')],
];

for (const [label, get] of parityTargets) {
  const text = get();
  const missing = SYSTEMS.filter((s) => !text.includes(s));
  ok(`${label}: names all ${SYSTEMS.length} systems`, missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : '');
}

// Wherever the count is written out in words, it must match the list length.
for (const [label, get] of parityTargets) {
  const text = get();
  const m = text.match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+systems\b/i);
  if (!m) continue;
  ok(`${label}: says "${systemWord} systems"`, m[1].toLowerCase() === systemWord,
    `found "${m[1]}" but ${SYSTEMS.length} systems are defined`);
}

/* ══════════════════════════════════════════════════════════════════════════
   12. No hardcoded prices in static copy
   ══════════════════════════════════════════════════════════════════════════ */
section('No hardcoded prices');

const PRICE = /\b\d[\d,]*\s*(?:EGP|egp|L\.?E\.?)\b/;
for (const { file } of KNOWLEDGE_PAGES) {
  if (!has(file)) continue;
  const m = stripTags(read(file)).match(PRICE);
  ok(`${file}: quotes no price (prices are database-driven)`, !m, m ? `matched "${m[0]}"` : '');
}
for (const f of MACHINE_FILES) {
  if (!has(f)) continue;
  const m = read(f).match(PRICE);
  ok(`${f}: quotes no price`, !m, m ? `matched "${m[0]}"` : '');
}

/* ══════════════════════════════════════════════════════════════════════════
   13. Crawl infrastructure
   ══════════════════════════════════════════════════════════════════════════ */
section('robots.txt + sitemap.xml');

ok('robots.txt exists', has('robots.txt'));
ok('sitemap.xml exists', has('sitemap.xml'));

if (has('robots.txt')) {
  const robots = read('robots.txt');
  ok('robots.txt points at the sitemap', robots.includes(`Sitemap: ${SITE}/sitemap.xml`));
  ok('robots.txt allows the default crawler', /User-agent:\s*\*[\s\S]*?Allow:\s*\//.test(robots));
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'OAI-SearchBot']) {
    ok(`robots.txt explicitly welcomes ${bot}`, robots.includes(`User-agent: ${bot}`));
  }
  // Signed-in surfaces must stay out of the index.
  for (const p of ['chat.html', 'dashboard.html', 'settings.html', 'profile.html']) {
    ok(`robots.txt disallows /${p}`, robots.includes(`Disallow: /${p}`));
  }
}

if (has('sitemap.xml')) {
  const sitemap = read('sitemap.xml');
  for (const { canonical } of [...ALL_OWNED, ...SEO_PAGES]) {
    ok(`sitemap.xml lists ${canonical}`, sitemap.includes(`<loc>${canonical}</loc>`));
  }
  // Nothing private may leak into the sitemap.
  for (const p of ['chat.html', 'dashboard.html', 'admin.html', 'ai-monitor.html', 'settings.html']) {
    ok(`sitemap.xml omits ${p}`, !sitemap.includes(p));
  }
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok('every sitemap URL uses the canonical host',
    locs.every((u) => u.startsWith(`${SITE}/`)),
    locs.filter((u) => !u.startsWith(`${SITE}/`)).join(', '));
}

// llms.txt should route AI systems to the pages that exist.
if (has('llms.txt')) {
  const llms = read('llms.txt');
  for (const { canonical } of KNOWLEDGE_PAGES) {
    ok(`llms.txt links ${canonical}`, llms.includes(canonical));
  }
  // The question count llms.txt advertises must track faq-data.mjs. It had
  // already drifted (136 stated, 139 present) — harmless in isolation, but this
  // is the file AI systems are asked to trust over their own inference, so a
  // number in it being wrong is exactly the failure the layer exists to prevent.
  const claimed = llms.match(/faq\.html\):\s*(\d+)\s+questions/i);
  ok('llms.txt states the FAQ question count', !!claimed);
  ok(`llms.txt: FAQ count matches faq-data.mjs (${TOTAL_QUESTIONS})`,
    !claimed || Number(claimed[1]) === TOTAL_QUESTIONS,
    claimed ? `llms.txt says ${claimed[1]}` : '');
}

/* ══════════════════════════════════════════════════════════════════════════
   14. Internal linking — orphan pages never rank
   ══════════════════════════════════════════════════════════════════════════ */
section('Internal linking');

if (has('index.html')) {
  const home = read('index.html');
  for (const { file } of KNOWLEDGE_PAGES) {
    ok(`index.html links to ${file}`, home.includes(`href="${file}"`));
  }
}
for (const { file } of KNOWLEDGE_PAGES) {
  if (!has(file)) continue;
  const html = read(file);
  const others = KNOWLEDGE_PAGES.filter((p) => p.file !== file);
  ok(`${file} links back to the rest of the Knowledge Center`,
    others.every((p) => html.includes(`href="${p.file}"`)));
  ok(`${file} links home`, html.includes('href="index.html"'));
}

/* ── result ────────────────────────────────────────────────────────────── */
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.error(`\nvalidate-knowledge-layer: ${failures} FAILED`);
  process.exit(1);
}
console.log('knowledge layer consistent');
