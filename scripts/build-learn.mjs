#!/usr/bin/env node
/**
 * build-learn.mjs — generates the Educational Knowledge Hub from
 * docs/knowledge/learn-data.mjs.
 *
 * Emits:
 *   learn.html            the hub index, grouped by theme
 *   learn-<slug>.html     one page per guide
 *
 * Usage:
 *   node scripts/build-learn.mjs          # write the hub and every guide
 *   node scripts/build-learn.mjs --check  # exit 1 if anything is out of date
 *
 * Why generate: twelve guides sharing a head, nav, breadcrumb, footer and
 * schema graph is twelve chances for one of them to drift out of the knowledge
 * layer. Generating them means a new guide is a data entry, and every guide is
 * guaranteed a complete SEO head, valid structured data, and cross-links —
 * which is what stops any of them becoming an orphan page.
 *
 * scripts/validate-knowledge-layer.mjs runs the --check form in CI.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS, GUIDES } from '../docs/knowledge/learn-data.mjs';
import { SITE, CANONICAL_DEFINITION, nav, footer, headAssets, organizationNode } from './_page-shell.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const check = process.argv.includes('--check');

/* ── helpers ────────────────────────────────────────────────────────────── */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const jsonForScriptTag = (v) =>
  JSON.stringify(v, null, 2).replace(/<\/(script)/gi, '<\\/$1');

const plain = (html) => String(html)
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const fileFor = (g) => `learn-${g.slug}.html`;
const urlFor = (g) => `${SITE}/${fileFor(g)}`;

/**
 * Reading time from the guide's own words. Derived rather than authored so it
 * cannot drift when a section is edited — a hand-written "9 min read" is one
 * more fact to keep true for no benefit.
 */
function readingMinutes(g) {
  const words = [g.lead, ...g.takeaways, ...g.sections.map((s) => `${s.h} ${s.body}`),
    ...g.faqs.map((f) => `${f.q} ${f.a}`)].map(plain).join(' ').split(/\s+/).length;
  return Math.max(3, Math.round(words / 200));
}

/**
 * Three sibling guides to surface at the foot of a page: same group first, then
 * out-of-group.
 *
 * The out-of-group pool is ROTATED by the guide's own position. Taking it in
 * declaration order meant every page needing filler took the same first two —
 * the SAT and ACT guides — so the site's internal linking ranked its own exams
 * by array index. Measured before and after: SAT/ACT/EST appeared as related
 * cards 6/6/4 times, now 5/5/4, and the two least-linked guides went from 1 to
 * 2. A modest correction, not a dramatic one; recorded honestly because the
 * temptation with a fairness fix is to describe it as bigger than it was.
 *
 * Rotation is deterministic (no randomness), which matters because these pages
 * are generated and CI fails on drift between the data and the output.
 */
function related(g) {
  const i = GUIDES.findIndex((x) => x.slug === g.slug);
  const sameGroup = GUIDES.filter((x) => x.group === g.group && x.slug !== g.slug);
  const others = GUIDES.filter((x) => x.group !== g.group);
  const at = others.length ? i % others.length : 0;
  const rotated = [...others.slice(at), ...others.slice(0, at)];
  return [...sameGroup, ...rotated].slice(0, 3);
}

/* ── a single guide page ────────────────────────────────────────────────── */

function guidePage(g) {
  const url = urlFor(g);
  const minutes = readingMinutes(g);
  const group = GROUPS.find((x) => x.id === g.group);

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode(),
      {
        '@type': ['Article', 'LearningResource'],
        '@id': `${url}#article`,
        headline: g.title,
        name: g.title,
        description: g.metaDescription,
        url,
        inLanguage: 'en',
        isAccessibleForFree: true,
        learningResourceType: 'Study guide',
        educationalLevel: 'Secondary education / university entrance preparation',
        educationalUse: 'Test preparation',
        teaches: g.teaches,
        audience: {
          '@type': 'EducationalAudience',
          educationalRole: 'student',
          audienceType: 'American Diploma students preparing for SAT, ACT or EST Mathematics',
        },
        about: g.teaches,
        publisher: { '@id': `${SITE}/#organization` },
        author: { '@id': `${SITE}/#organization` },
        image: `${SITE}/assets/si-math-ai-logo.jpg`,
        isPartOf: { '@id': `${SITE}/learn.html#collection` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: g.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Learn', item: `${SITE}/learn.html` },
          { '@type': 'ListItem', position: 3, name: g.title, item: url },
        ],
      },
    ],
  };

  const takeaways = g.takeaways.map((t) => `        <li>${t}</li>`).join('\n');

  const sections = g.sections.map((s, i) => `
<section class="k-section"${i === 0 ? ' style="padding-top:0;border-top:0"' : ''}>
  <div class="k-wrap k-body">
    <h2>${esc(s.h)}</h2>
    ${s.body}
  </div>
</section>`).join('\n');

  const faqs = g.faqs.map((f) => `      <details class="k-faq">
        <summary>${esc(f.q)}</summary>
        <div class="k-faq-a">${f.a}</div>
      </details>`).join('\n');

  const rel = related(g).map((r) => `      <a class="k-guide-card" href="${fileFor(r)}">
        <span class="k-card-icon" aria-hidden="true">${r.icon}</span>
        <div class="k-guide-meta"><span class="k-guide-topic">${esc(r.topic)}</span></div>
        <h3>${esc(r.title)}</h3>
        <p>${esc(r.summary)}</p>
      </a>`).join('\n');

  // Exam-specific guides carry a standing accuracy note. Formats are set by the
  // boards and change; a guide that teaches method stays true, but a student
  // still needs to be told to confirm the details that do not.
  const verify = g.examGuide ? `
    <div class="k-verify">
      <p><strong>Before test day, confirm the current format.</strong> Question
      counts, section timings, calculator policy and scoring are set by the
      examination board and do change. This guide teaches method, which does not
      go out of date — but always check the specifics against the official source
      for your exam rather than relying on any third-party description,
      including ours.</p>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- ═══════════════════════════════════════════════════════════════════════
     AUTO-GENERATED by scripts/build-learn.mjs from docs/knowledge/learn-data.mjs
     DO NOT EDIT THIS FILE BY HAND — your changes will be overwritten.
     Edit the data file, then run: node scripts/build-learn.mjs
     ═══════════════════════════════════════════════════════════════════════ -->
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover"/>
<meta name="theme-color" content="#050a14"/>
<meta name="color-scheme" content="dark"/>

<title>${esc(g.metaTitle)}</title>
<meta name="description" content="${esc(g.metaDescription)}"/>
<link rel="canonical" href="${url}"/>
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1"/>
<meta name="author" content="Si Math AI"/>

<meta property="og:type" content="article"/>
<meta property="og:site_name" content="Si Math AI"/>
<meta property="og:locale" content="en_US"/>
<meta property="og:title" content="${esc(g.metaTitle)}"/>
<meta property="og:description" content="${esc(g.summary)}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="${SITE}/assets/si-math-ai-logo.jpg"/>
<meta property="og:image:alt" content="Si Math AI logo"/>

<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="${esc(g.metaTitle)}"/>
<meta name="twitter:description" content="${esc(g.summary)}"/>
<meta name="twitter:image" content="${SITE}/assets/si-math-ai-logo.jpg"/>

${headAssets()}

<script type="application/ld+json">
${jsonForScriptTag(graph)}
</script>
</head>
<body>

<div class="backdrop"></div>
<div class="bg-grid"></div>

<a class="skip-link" href="#main">Skip to content</a>

${nav('learn.html')}

<main id="main" class="k-main">

<div class="k-wrap">
  <nav class="k-crumb" aria-label="Breadcrumb">
    <ol>
      <li><a href="index.html">Home</a></li>
      <li><a href="learn.html">Learn</a></li>
      <li>${esc(g.title)}</li>
    </ol>
  </nav>
</div>

<section class="k-section" style="padding-top:30px;padding-bottom:22px">
  <div class="k-wrap k-body">
    <span class="k-eyebrow">◆ ${esc(group ? group.title : 'Guide')} · ${esc(g.topic)}</span>
    <h1>${esc(g.title)}</h1>
    <p class="k-guide-meta" style="margin-top:14px">
      <span>${minutes} min read</span> · <span>Free to read</span> · <span>No sign-up required</span>
    </p>
    <p class="k-lead" style="margin-top:18px">${esc(g.lead)}</p>
${verify}
    <div class="k-takeaways">
      <h2>Key points</h2>
      <ul>
${takeaways}
      </ul>
    </div>
  </div>
</section>
${sections}

<section class="k-section">
  <div class="k-wrap k-body">
    <h2>Frequently asked</h2>
${faqs}

    <div class="k-soft-cta">
      <p><strong>About Si Math AI —</strong> ${esc(g.softCta)}
      <a href="learn.html">More free guides</a> ·
      <a href="how-it-works.html">How the platform works</a></p>
    </div>
  </div>
</section>

<section class="k-section">
  <div class="k-wrap-wide">
    <div style="max-width:var(--maxw);margin:0 auto 22px">
      <h2>Keep reading</h2>
    </div>
    <div class="k-grid k-grid-3" style="max-width:1140px;margin:0 auto">
${rel}
    </div>
  </div>
</section>

${footer()}

</main>
<script src="assets/founder-status.js" defer></script>
</body>
</html>
`;
}

/* ── the hub index ──────────────────────────────────────────────────────── */

function hubPage() {
  const url = `${SITE}/learn.html`;

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode(),
      {
        '@type': 'CollectionPage',
        '@id': `${url}#collection`,
        url,
        name: 'Learn — SAT, ACT & EST Mathematics Guides',
        description:
          'Free, in-depth guides to SAT, ACT and EST Mathematics preparation: exam-specific study guides, ' +
          'study method, common mistakes, time management, exam psychology, and guidance for parents. ' +
          'Written by Si Math AI, ' + CANONICAL_DEFINITION.charAt(0).toLowerCase() + CANONICAL_DEFINITION.slice(1),
        inLanguage: 'en',
        isPartOf: { '@id': `${SITE}/#organization` },
        publisher: { '@id': `${SITE}/#organization` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: GUIDES.length,
          itemListElement: GUIDES.map((g, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: g.title,
            url: urlFor(g),
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Learn', item: url },
        ],
      },
    ],
  };

  const groups = GROUPS.map((grp) => {
    const items = GUIDES.filter((g) => g.group === grp.id).map((g) => `      <a class="k-guide-card" href="${fileFor(g)}">
        <span class="k-card-icon" aria-hidden="true">${g.icon}</span>
        <div class="k-guide-meta">
          <span class="k-guide-topic">${esc(g.topic)}</span>
          <span>${readingMinutes(g)} min</span>
        </div>
        <h3>${esc(g.title)}</h3>
        <p>${esc(g.summary)}</p>
      </a>`).join('\n');

    return `    <div class="k-hub-group" id="${esc(grp.id)}">
      <h2>${esc(grp.title)}</h2>
      <p class="k-hub-sub">${esc(grp.sub)}</p>
      <div class="k-grid k-grid-3">
${items}
      </div>
    </div>`;
  }).join('\n\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- ═══════════════════════════════════════════════════════════════════════
     AUTO-GENERATED by scripts/build-learn.mjs from docs/knowledge/learn-data.mjs
     DO NOT EDIT THIS FILE BY HAND — your changes will be overwritten.
     ═══════════════════════════════════════════════════════════════════════ -->
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover"/>
<meta name="theme-color" content="#050a14"/>
<meta name="color-scheme" content="dark"/>

<title>Learn — Free SAT, ACT &amp; EST Math Guides | Si Math AI</title>
<meta name="description" content="Free, in-depth guides to SAT, ACT and EST Mathematics: exam preparation, study strategies, the most common mistakes, time management, calculator use, exam psychology, score improvement and a parent's guide."/>
<link rel="canonical" href="${url}"/>
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1"/>
<meta name="author" content="Si Math AI"/>

<meta property="og:type" content="website"/>
<meta property="og:site_name" content="Si Math AI"/>
<meta property="og:locale" content="en_US"/>
<meta property="og:title" content="Learn — Free SAT, ACT &amp; EST Math Guides"/>
<meta property="og:description" content="${GUIDES.length} free, in-depth guides to SAT, ACT and EST Mathematics preparation — no sign-up required."/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="${SITE}/assets/si-math-ai-logo.jpg"/>
<meta property="og:image:alt" content="Si Math AI logo"/>

<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="Learn — Free SAT, ACT &amp; EST Math Guides"/>
<meta name="twitter:description" content="${GUIDES.length} free, in-depth guides to SAT, ACT and EST Mathematics preparation — no sign-up required."/>
<meta name="twitter:image" content="${SITE}/assets/si-math-ai-logo.jpg"/>

${headAssets()}

<script type="application/ld+json">
${jsonForScriptTag(graph)}
</script>
</head>
<body>

<div class="backdrop"></div>
<div class="bg-grid"></div>

<a class="skip-link" href="#main">Skip to content</a>

${nav('learn.html')}

<main id="main" class="k-main">

<div class="k-wrap">
  <nav class="k-crumb" aria-label="Breadcrumb">
    <ol>
      <li><a href="index.html">Home</a></li>
      <li>Learn</li>
    </ol>
  </nav>
</div>

<section class="k-section" style="padding-top:34px;padding-bottom:26px">
  <div class="k-wrap k-body">
    <span class="k-eyebrow">◆ Educational Knowledge Hub</span>
    <h1>Learn</h1>
    <p class="k-lead" style="margin-top:18px">
      ${GUIDES.length} in-depth guides to SAT, ACT and EST Mathematics — how each exam works,
      how to study so that practice actually raises a score, the mistakes that cost
      most students marks, and how to perform on the day.
    </p>
    <p>
      <strong>Free to read, no sign-up, nothing withheld.</strong> These guides exist
      because the advice most students receive is generic, and because a student who
      never signs up should still leave better prepared. They teach method — which is
      where teaching experience actually shows, and which does not go out of date the
      way exam formats do.
    </p>
    <p>
      Written by Si Math AI, ${esc(CANONICAL_DEFINITION.charAt(0).toLowerCase() + CANONICAL_DEFINITION.slice(1))}
      Our <a href="principles.html">educational principles</a> explain the thinking
      behind how we teach.
    </p>
  </div>
</section>

<section class="k-section" style="padding-top:0;border-top:0">
  <div class="k-wrap-wide">
${groups}
  </div>
</section>

<section class="k-section">
  <div class="k-wrap k-body">
    <h2>Where to start</h2>
    <ul>
      <li><strong>Not sure which exam to take?</strong> Read <a href="learn-choosing-your-exam.html">SAT vs ACT vs EST</a> first — it takes two afternoons to decide properly.</li>
      <li><strong>Already preparing but stuck?</strong> <a href="learn-score-improvement.html">How to improve a math score</a> explains why plateaus happen and what to do about them.</li>
      <li><strong>Losing marks you should not lose?</strong> <a href="learn-common-mistakes.html">The most common mistakes</a> is the highest-return read on this page.</li>
      <li><strong>Studying a lot with little to show?</strong> <a href="learn-study-strategies.html">Study strategies</a> covers why some methods feel productive and are not.</li>
      <li><strong>A parent?</strong> Start with <a href="learn-parents-guide.html">the parent's guide</a>.</li>
    </ul>

    <div class="k-soft-cta">
      <p><strong>About Si Math AI —</strong> these guides describe a method:
      diagnose, target, practise, re-measure. The platform automates that loop for
      SAT, ACT and EST Mathematics, but the method works whether or not you use it.
      <a href="how-it-works.html">How the platform works</a> ·
      <a href="principles.html">Our educational principles</a></p>
    </div>
  </div>
</section>

${footer()}

</main>
<script src="assets/founder-status.js" defer></script>
</body>
</html>
`;
}

/* ── emit ───────────────────────────────────────────────────────────────── */

const outputs = [['learn.html', hubPage()], ...GUIDES.map((g) => [fileFor(g), guidePage(g)])];

if (check) {
  const stale = outputs.filter(([file, html]) => {
    const p = resolve(REPO, file);
    return !existsSync(p) || readFileSync(p, 'utf8') !== html;
  }).map(([file]) => file);

  if (stale.length) {
    console.error(`FAIL  ${stale.length} learn page(s) out of date with learn-data.mjs:`);
    for (const f of stale) console.error(`        ${f}`);
    console.error('      run: node scripts/build-learn.mjs');
    process.exit(1);
  }
  console.log(`PASS  learn hub + ${GUIDES.length} guides match learn-data.mjs`);
} else {
  for (const [file, html] of outputs) writeFileSync(resolve(REPO, file), html);
  console.log(`wrote learn.html + ${GUIDES.length} guides`);
  for (const g of GUIDES) console.log(`      ${fileFor(g).padEnd(34)} ${readingMinutes(g)} min`);
}
