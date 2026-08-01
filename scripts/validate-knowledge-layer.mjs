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
import { CAPABILITIES, RESEARCH, CHANGELOG, ROADMAP, NOT_ON_ROADMAP } from '../docs/knowledge/evidence-data.mjs';

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
 * Public knowledge pages: pages ABOUT Si Math AI. Each must state the canonical
 * definition and the three-pillar positioning in visible copy.
 */
const KNOWLEDGE_PAGES = [
  { file: 'about.html', canonical: `${SITE}/about.html` },
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

const stripTags = (html) => stripGuidance(html)
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
   7–8. Banned assertions
   ══════════════════════════════════════════════════════════════════════════ */
section('Truthfulness');

// FAQ questions are allowed to quote a banned framing ("Is Si Math AI just an
// AI?"); the ANSWERS are what must never assert it. So the FAQ is scanned from
// its data module, answers only, rather than through the rendered page.
const faqAnswerText = CATEGORIES
  .flatMap((c) => c.items.map((i) => stripTags(i.a)))
  .join('\n');

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

for (const [label, text] of slotSources) {
  const found = [...text.matchAll(SLOT_CLAIM)].map((m) => Number(m[1]));
  ok(`${label}: states the remaining Founder count`, found.length > 0);
  const wrong = found.filter((n) => n !== SLOTS);
  ok(`${label}: every stated count is ${SLOTS}`, wrong.length === 0,
    wrong.length ? `found ${wrong.join(', ')}` : '');
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
