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

/** Public knowledge pages: the ones this gate owns end to end. */
const KNOWLEDGE_PAGES = [
  { file: 'about.html', canonical: `${SITE}/about.html` },
  { file: 'how-it-works.html', canonical: `${SITE}/how-it-works.html` },
  { file: 'founder-badge.html', canonical: `${SITE}/founder-badge.html` },
  { file: 'faq.html', canonical: `${SITE}/faq.html` },
];

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
const BANNED_SCHEMA_KEYS = ['aggregateRating', 'reviewCount', 'ratingValue'];

/* ── helpers ───────────────────────────────────────────────────────────── */

const stripTags = (html) => html
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
   2–4. SEO heads, canonicals and structured data
   ══════════════════════════════════════════════════════════════════════════ */
section('SEO head + structured data');

for (const { file, canonical } of [...KNOWLEDGE_PAGES, ...SEO_PAGES]) {
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
  ...MACHINE_FILES.filter(has).map((f) => [f, read(f)]),
];

for (const [label, text] of scanTargets) {
  for (const [pattern, why] of BANNED_ASSERTIONS) {
    const m = text.match(pattern);
    ok(`${label}: no ${why}`, !m, m ? `matched: "${m[0]}"` : '');
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
  for (const { canonical } of [...KNOWLEDGE_PAGES, ...SEO_PAGES]) {
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
