#!/usr/bin/env node
/**
 * build-faq.mjs — generates faq.html from docs/knowledge/faq-data.mjs.
 *
 * Why generate instead of hand-writing the page
 * ─────────────────────────────────────────────
 * faq.html has to carry the same 136 answers twice: once as visible HTML for
 * humans, and once inside a FAQPage JSON-LD block for search engines and AI
 * systems. Google's structured-data policy requires those two copies to match,
 * and our own knowledge-consistency rule requires it more strictly still — a
 * drifted answer in JSON-LD is a fact an AI system will repeat that the site
 * itself contradicts.
 *
 * Two hand-maintained copies always drift. So both are emitted from one array.
 *
 * Usage:
 *   node scripts/build-faq.mjs          # write faq.html
 *   node scripts/build-faq.mjs --check  # exit 1 if faq.html is out of date
 *
 * scripts/validate-knowledge-layer.mjs runs the --check form in CI, which is
 * what stops someone editing the generated page by hand and losing it on the
 * next build.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, TOTAL_QUESTIONS, FOUNDER_SLOTS_REMAINING } from '../docs/knowledge/faq-data.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const OUT = resolve(REPO, 'faq.html');

const SITE = 'https://www.si-math-ai.com';
const CANONICAL_DEFINITION =
  'Si Math AI is a comprehensive learning platform for SAT, ACT, and EST Mathematics ' +
  'that combines educational expertise, AI technology, personalized learning, analytics, ' +
  'and human support to help students improve their understanding and performance.';

/* ── helpers ────────────────────────────────────────────────────────────── */

/** Escape for use in an HTML text node or a double-quoted attribute. */
const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * Answers are authored as an HTML fragment, so they must NOT be escaped into
 * the page — but they must still be a valid JSON string inside the JSON-LD.
 * JSON.stringify handles the escaping; the only extra care needed is that a
 * literal "</script" inside a value would close the JSON-LD block early.
 */
const jsonForScriptTag = (value) =>
  JSON.stringify(value, null, 2).replace(/<\/(script)/gi, '<\\/$1');

/** Stable slug for anchor ids, so deep links survive re-ordering of answers. */
const slug = (s) => s.toLowerCase()
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60);

/* ── structured data ────────────────────────────────────────────────────── */

const faqEntities = CATEGORIES.flatMap((cat) =>
  cat.items.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
);

const graph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
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
    },
    {
      '@type': 'FAQPage',
      '@id': `${SITE}/faq.html#faqpage`,
      url: `${SITE}/faq.html`,
      name: 'Si Math AI — Frequently Asked Questions',
      description:
        `${TOTAL_QUESTIONS} answers about Si Math AI: what it is, how Zero and the ` +
        'Weakness Analyzer work, SAT / ACT / EST coverage, pricing and credits, the ' +
        'Founder Badge, and how the platform combines educational expertise with AI.',
      inLanguage: 'en',
      isPartOf: { '@id': `${SITE}/#organization` },
      mainEntity: faqEntities,
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${SITE}/faq.html#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'FAQ', item: `${SITE}/faq.html` },
      ],
    },
  ],
};

/* ── page body ──────────────────────────────────────────────────────────── */

const chips = CATEGORIES
  .map((c) => `      <button class="k-chip" type="button" data-cat="${esc(c.id)}" aria-pressed="false">${esc(c.title)}</button>`)
  .join('\n');

const groups = CATEGORIES.map((cat) => {
  const items = cat.items.map((item) => {
    const id = slug(item.q);
    return `      <details class="k-faq" id="q-${id}" data-cat="${esc(cat.id)}">
        <summary>${esc(item.q)}</summary>
        <div class="k-faq-a">${item.a}</div>
      </details>`;
  }).join('\n');

  return `    <div class="k-faq-group" id="${esc(cat.id)}" data-group="${esc(cat.id)}">
      <h2>${esc(cat.title)}</h2>
${items}
    </div>`;
}).join('\n\n');

const tocLinks = CATEGORIES
  .map((c) => `        <li><a href="#${esc(c.id)}">${esc(c.title)} <span style="color:var(--text-500)">(${c.items.length})</span></a></li>`)
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<!-- ═══════════════════════════════════════════════════════════════════════
     AUTO-GENERATED by scripts/build-faq.mjs from docs/knowledge/faq-data.mjs
     DO NOT EDIT THIS FILE BY HAND — your changes will be overwritten.
     Edit the data file, then run: node scripts/build-faq.mjs
     ═══════════════════════════════════════════════════════════════════════ -->
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover"/>
<meta name="theme-color" content="#050a14"/>
<meta name="color-scheme" content="dark"/>

<title>Si Math AI FAQ — ${TOTAL_QUESTIONS} Questions Answered</title>
<meta name="description" content="${esc(`${TOTAL_QUESTIONS} answers about Si Math AI: what it is, how Zero and the Weakness Analyzer work, SAT, ACT and EST coverage, Focus Practice, Mock Exams, pricing, credits and the Founder Badge.`)}"/>
<link rel="canonical" href="${SITE}/faq.html"/>
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1"/>
<meta name="author" content="Si Math AI"/>

<meta property="og:type" content="website"/>
<meta property="og:site_name" content="Si Math AI"/>
<meta property="og:locale" content="en_US"/>
<meta property="og:title" content="Si Math AI FAQ — ${TOTAL_QUESTIONS} Questions Answered"/>
<meta property="og:description" content="Everything about Si Math AI: Zero the AI mentor, the Weakness Analyzer, Focus Practice, Mock Exams, SAT / ACT / EST coverage, pricing and the Founder Badge."/>
<meta property="og:url" content="${SITE}/faq.html"/>
<meta property="og:image" content="${SITE}/assets/si-math-ai-logo.jpg"/>
<meta property="og:image:alt" content="Si Math AI logo"/>

<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="Si Math AI FAQ — ${TOTAL_QUESTIONS} Questions Answered"/>
<meta name="twitter:description" content="Everything about Si Math AI: Zero, the Weakness Analyzer, Mock Exams, SAT / ACT / EST coverage, pricing and the Founder Badge."/>
<meta name="twitter:image" content="${SITE}/assets/si-math-ai-logo.jpg"/>

<link rel="icon" href="assets/si-math-ai-logo.jpg"/>
<link rel="apple-touch-icon" href="assets/si-math-ai-logo.jpg"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="assets/knowledge.css"/>

<script type="application/ld+json">
${jsonForScriptTag(graph)}
</script>
</head>
<body>

<div class="backdrop"></div>
<div class="bg-grid"></div>

<a class="skip-link" href="#main">Skip to content</a>

<nav class="k-nav">
  <a class="k-nav-logo" href="index.html">
    <img src="assets/si-math-ai-logo.jpg" alt="Si Math AI logo" width="32" height="32"/>
    <span class="k-nav-logo-text">Si<span>Math</span> AI</span>
  </a>
  <ul class="k-nav-links">
    <li><a href="about.html">About</a></li>
    <li><a href="how-it-works.html">How It Works</a></li>
    <li><a href="founder-badge.html">Founder Badge</a></li>
    <li><a href="faq.html" aria-current="page">FAQ</a></li>
    <li><a href="pricing.html">Pricing</a></li>
  </ul>
  <a class="k-nav-cta" href="signup.html">Start Free</a>
</nav>

<main id="main" class="k-main">

<div class="k-wrap">
  <nav class="k-crumb" aria-label="Breadcrumb">
    <ol>
      <li><a href="index.html">Home</a></li>
      <li>FAQ</li>
    </ol>
  </nav>
</div>

<section class="k-section" style="padding-top:34px;padding-bottom:30px">
  <div class="k-wrap k-body">
    <span class="k-eyebrow">◆ Knowledge Center</span>
    <h1>Frequently Asked Questions</h1>
    <p class="k-lead" style="margin-top:18px">
      <strong>${esc(CANONICAL_DEFINITION)}</strong>
    </p>

    <div class="k-positioning">
      <p>Artificial Intelligence is <em>how</em> Si Math AI teaches.</p>
      <p>Educational expertise is <em>what</em> it teaches.</p>
      <p>Human experience is <em>why</em> it works.</p>
    </div>

    <p>
      ${TOTAL_QUESTIONS} questions answered across ${CATEGORIES.length} categories. Search
      below, filter by topic, or read straight through.
    </p>

    <div class="k-toc">
      <h2>Categories</h2>
      <ol>
${tocLinks}
      </ol>
    </div>
  </div>
</section>

<section class="k-section" style="padding-top:0;border-top:0">
  <div class="k-wrap">

    <div class="k-faq-controls">
      <label class="visually-hidden" for="faqSearch" style="position:absolute;left:-9999px">Search the FAQ</label>
      <input class="k-faq-search" id="faqSearch" type="search" placeholder="Search ${TOTAL_QUESTIONS} questions — try “weakness”, “EST”, “credits”, “Founder”…" autocomplete="off"/>
      <div class="k-chips" id="faqChips" role="group" aria-label="Filter by category">
        <button class="k-chip" type="button" data-cat="all" aria-pressed="true">All</button>
${chips}
      </div>
    </div>

    <p class="k-faq-count" id="faqCount">Showing all ${TOTAL_QUESTIONS} questions</p>

    <div id="faqList">
${groups}
    </div>

    <p class="k-faq-empty" id="faqEmpty" hidden>
      No questions match that search. Try a different word, or
      <a href="index.html">start free</a> and ask Zero directly.
    </p>

    <div class="k-btn-row">
      <a class="k-btn k-btn-primary" href="signup.html">Start free — no card needed</a>
      <a class="k-btn k-btn-ghost" href="how-it-works.html">How it works</a>
      <a class="k-btn k-btn-ghost" href="about.html">About Si Math AI</a>
    </div>
  </div>
</section>

<footer class="k-footer">
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
        <h3>Knowledge Center</h3>
        <ul>
          <li><a href="about.html">About Si Math AI</a></li>
          <li><a href="about.html#mission">Mission &amp; Vision</a></li>
          <li><a href="about.html#story">Our Story</a></li>
          <li><a href="about.html#team">Who Built It</a></li>
          <li><a href="how-it-works.html">How It Works</a></li>
          <li><a href="faq.html">FAQ</a></li>
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
    <div class="k-footer-bottom">
      <span>© 2026 Si Math AI. All rights reserved.</span>
      <span>SAT · ACT · EST Mathematics</span>
    </div>
  </div>
</footer>

</main>

<script>
/* FAQ search + category filter. Progressive enhancement only: with JavaScript
   disabled every question is already present and expandable, which is also what
   a crawler sees. */
(function () {
  'use strict';
  var search  = document.getElementById('faqSearch');
  var chips   = document.getElementById('faqChips');
  var count   = document.getElementById('faqCount');
  var empty   = document.getElementById('faqEmpty');
  var list    = document.getElementById('faqList');
  if (!search || !chips || !list) return;

  var items  = Array.prototype.slice.call(list.querySelectorAll('details.k-faq'));
  var groups = Array.prototype.slice.call(list.querySelectorAll('.k-faq-group'));
  var total  = items.length;
  var activeCat = 'all';

  // Pre-compute one lowercase haystack per question so typing stays cheap.
  var haystacks = items.map(function (el) {
    return (el.textContent || '').toLowerCase();
  });

  function apply() {
    var q = search.value.trim().toLowerCase();
    var shown = 0;

    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      var catOk = activeCat === 'all' || el.getAttribute('data-cat') === activeCat;
      var textOk = !q || haystacks[i].indexOf(q) !== -1;
      var visible = catOk && textOk;
      el.hidden = !visible;
      if (visible) shown++;
    }

    // Hide a category heading when every question under it is filtered out.
    for (var g = 0; g < groups.length; g++) {
      var any = groups[g].querySelector('details.k-faq:not([hidden])');
      groups[g].hidden = !any;
    }

    if (count) {
      count.textContent = shown === total
        ? 'Showing all ' + total + ' questions'
        : 'Showing ' + shown + ' of ' + total + ' questions';
    }
    if (empty) empty.hidden = shown !== 0;
  }

  search.addEventListener('input', apply);

  chips.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.k-chip') : null;
    if (!btn) return;
    activeCat = btn.getAttribute('data-cat') || 'all';
    var all = chips.querySelectorAll('.k-chip');
    for (var i = 0; i < all.length; i++) {
      all[i].setAttribute('aria-pressed', all[i] === btn ? 'true' : 'false');
    }
    apply();
  });

  // A deep link to #q-... should arrive with that answer already open.
  if (location.hash && location.hash.indexOf('#q-') === 0) {
    var target = document.getElementById(location.hash.slice(1));
    if (target && target.tagName === 'DETAILS') {
      target.open = true;
      target.scrollIntoView({ block: 'center' });
    }
  }
}());
</script>
<script src="assets/founder-status.js" defer></script>
</body>
</html>
`;

/* ── emit ───────────────────────────────────────────────────────────────── */

const check = process.argv.includes('--check');

if (check) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing counts as stale */ }
  if (current !== html) {
    console.error('FAIL  faq.html is out of date with docs/knowledge/faq-data.mjs');
    console.error('      run: node scripts/build-faq.mjs');
    process.exit(1);
  }
  console.log(`PASS  faq.html matches faq-data.mjs (${TOTAL_QUESTIONS} questions)`);
} else {
  writeFileSync(OUT, html);
  console.log(
    `wrote faq.html — ${TOTAL_QUESTIONS} questions in ${CATEGORIES.length} categories ` +
    `(Founder slots: ${FOUNDER_SLOTS_REMAINING})`,
  );
}
