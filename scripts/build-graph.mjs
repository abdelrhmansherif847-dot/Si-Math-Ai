#!/usr/bin/env node
/**
 * build-graph.mjs — generates the Si Math AI Knowledge Graph from
 * docs/knowledge/graph-data.mjs.
 *
 * Emits:
 *   knowledge-graph.json   JSON-LD at a stable URL, for AI systems and crawlers
 *   knowledge-graph.html   the human- and crawler-readable registry
 *
 *   node scripts/build-graph.mjs          # write both
 *   node scripts/build-graph.mjs --check  # exit 1 if either is out of date
 *
 * The JSON file is the artefact that matters. It gives every concept a stable
 * URI, one definition, and explicit typed edges — so an AI system can retrieve
 * the platform's structure instead of inferring it from prose across twenty
 * pages. Every page links to it via <link rel="alternate">.
 *
 * scripts/validate-knowledge-layer.mjs runs the --check form in CI, and
 * additionally verifies that the glossary published in ai-knowledge.html
 * matches these definitions exactly — which is what makes this file the single
 * source of truth rather than merely another copy of one.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONCEPTS, PREDICATES } from '../docs/knowledge/graph-data.mjs';
import { SITE, CANONICAL_DEFINITION, nav, footer, headAssets, organizationNode } from './_page-shell.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const check = process.argv.includes('--check');

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const jsonForScriptTag = (v) =>
  JSON.stringify(v, null, 2).replace(/<\/(script)/gi, '<\\/$1');

/** Stable, dereferenceable identity for every concept. */
const uri = (id) => `${SITE}/knowledge-graph#${id}`;
const byId = new Map(CONCEPTS.map((c) => [c.id, c]));

/* ── the JSON-LD graph ──────────────────────────────────────────────────── */

/**
 * A small custom vocabulary alongside schema.org. Schema.org has no general
 * predicate for "this system feeds that one", and inventing meanings for
 * existing schema properties would be worse than declaring our own namespace
 * honestly. Concepts stay `DefinedTerm` so generic consumers still understand
 * them; the edges are additive.
 */
const CONTEXT = [
  'https://schema.org',
  {
    sma: `${SITE}/ns#`,
    purpose: 'sma:purpose',
    conceptKind: 'sma:conceptKind',
    input: 'sma:input',
    output: 'sma:output',
    canonicalPage: { '@id': 'sma:canonicalPage', '@type': '@id' },
    documentedOn: { '@id': 'sma:documentedOn', '@type': '@id' },
    structuredDataRef: { '@id': 'sma:structuredDataRef', '@type': '@id' },
    ...Object.fromEntries(
      Object.keys(PREDICATES).map((p) => [p, { '@id': `sma:${p}`, '@type': '@id' }]),
    ),
  },
];

function conceptNode(c) {
  const node = {
    '@type': 'DefinedTerm',
    '@id': uri(c.id),
    identifier: c.id,
    name: c.name,
    conceptKind: c.kind,
    description: c.definition,
    purpose: c.purpose,
    inDefinedTermSet: { '@id': `${SITE}/knowledge-graph#termset` },
    url: `${SITE}/knowledge-graph.html#${c.id}`,
    canonicalPage: `${SITE}/${c.canonicalPage}`,
    documentedOn: c.pages.map((p) => `${SITE}/${p}`),
  };
  if (c.inputs.length) node.input = c.inputs;
  if (c.outputs.length) node.output = c.outputs;
  if (c.schemaRefs.length) node.structuredDataRef = c.schemaRefs;

  // Typed edges, grouped by predicate so the JSON reads as a graph rather than
  // as a list of triples.
  for (const rel of c.related) {
    (node[rel.predicate] ||= []).push(uri(rel.target));
  }
  return node;
}

const graphJson = {
  '@context': CONTEXT,
  '@graph': [
    organizationNode(),
    {
      '@type': 'DefinedTermSet',
      '@id': `${SITE}/knowledge-graph#termset`,
      name: 'Si Math AI Knowledge Graph',
      description:
        'The official knowledge graph of Si Math AI: every important concept defined exactly once, with typed relationships between them. ' +
        CANONICAL_DEFINITION,
      url: `${SITE}/knowledge-graph.html`,
      inLanguage: 'en',
      publisher: { '@id': `${SITE}/#organization` },
      hasDefinedTerm: CONCEPTS.map((c) => ({ '@id': uri(c.id) })),
    },
    ...CONCEPTS.map(conceptNode),
  ],
};

/* ── the readable registry ──────────────────────────────────────────────── */

const PRED_LABEL = {
  uses: 'uses', feeds: 'feeds', generates: 'generates', measures: 'measures',
  records: 'records', requires: 'requires', partOf: 'is part of',
  governs: 'governs', improves: 'improves', authoredBy: 'authored by',
  accelerates: 'accelerates',
};

/** Reverse edges, so each concept can show what points at it. */
const incoming = new Map(CONCEPTS.map((c) => [c.id, []]));
for (const c of CONCEPTS) {
  for (const rel of c.related) {
    incoming.get(rel.target)?.push({ from: c.id, predicate: rel.predicate });
  }
}

function conceptCard(c) {
  const rels = c.related.map((r) => {
    const t = byId.get(r.target);
    return `        <li><span class="k-ev-tag k-ev-mechanism">${esc(PRED_LABEL[r.predicate])}</span><span><a href="#${esc(r.target)}">${esc(t.name)}</a>${r.note ? ` — <em>${esc(r.note)}</em>` : ''}</span></li>`;
  }).join('\n');

  const back = incoming.get(c.id) || [];
  const backHtml = back.length
    ? `      <div class="k-qa"><span class="k-qa-q">Referenced by</span><p>${
        back.map((b) => `<a href="#${esc(b.from)}">${esc(byId.get(b.from).name)}</a> <span style="color:var(--text-500)">(${esc(PRED_LABEL[b.predicate])})</span>`).join(' · ')
      }</p></div>`
    : '';

  const io = (label, arr) => arr.length
    ? `      <div class="k-qa"><span class="k-qa-q">${label}</span><ul style="margin:0;padding-left:20px">${
        arr.map((x) => `<li style="font-size:15px;color:var(--text-300)">${esc(x)}</li>`).join('')
      }</ul></div>`
    : '';

  return `    <div class="k-cap" id="${esc(c.id)}">
      <div class="k-cap-head">
        <span class="k-cap-icon" aria-hidden="true">◆</span>
        <div>
          <h3>${esc(c.name)}</h3>
          <span class="k-guide-meta"><span class="k-guide-topic">${esc(c.kind)}</span> · <code style="font-family:var(--font-mono);font-size:12px">${esc(c.id)}</code></span>
        </div>
      </div>
      <div class="k-qa"><span class="k-qa-q">Definition</span><p>${esc(c.definition)}</p></div>
      <div class="k-qa"><span class="k-qa-q">Purpose</span><p>${esc(c.purpose)}</p></div>
${io('Inputs', c.inputs)}
${io('Outputs', c.outputs)}
      <span class="k-qa-q">Related concepts</span>
      <ul class="k-ev-list">
${rels}
      </ul>
${backHtml}
      <div class="k-qa" style="margin-top:14px"><span class="k-qa-q">Documented on</span><p>${
        c.pages.map((p) => `<a href="${esc(p)}">${esc(p)}</a>${p === c.canonicalPage ? ' <strong>(canonical)</strong>' : ''}`).join(' · ')
      }</p></div>
      ${c.schemaRefs.length ? `<div class="k-qa"><span class="k-qa-q">Structured data</span><p style="font-family:var(--font-mono);font-size:13px;color:var(--text-400)">${c.schemaRefs.map(esc).join('<br/>')}</p></div>` : ''}
    </div>`;
}

const cards = CONCEPTS.map(conceptCard).join('\n\n');

const index = CONCEPTS.map((c) =>
  `        <li><a href="#${esc(c.id)}">${esc(c.name)} <span style="color:var(--text-500)">· ${esc(c.kind)}</span></a></li>`).join('\n');

const predicateRows = Object.entries(PREDICATES)
  .map(([p, meaning]) => `          <tr><td><code style="font-family:var(--font-mono)">${esc(p)}</code></td><td>${esc(meaning)}</td></tr>`)
  .join('\n');

const graphHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<!-- ═══════════════════════════════════════════════════════════════════════
     AUTO-GENERATED by scripts/build-graph.mjs from docs/knowledge/graph-data.mjs
     DO NOT EDIT THIS FILE BY HAND — your changes will be overwritten.
     ═══════════════════════════════════════════════════════════════════════ -->
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover"/>
<meta name="theme-color" content="#050a14"/>
<meta name="color-scheme" content="dark"/>

<title>Knowledge Graph — Every Concept, Defined Once | Si Math AI</title>
<meta name="description" content="The official Si Math AI knowledge graph: ${CONCEPTS.length} concepts, each defined exactly once with its purpose, inputs, outputs and typed relationships to every other concept. Machine-readable JSON-LD at /knowledge-graph.json."/>
<link rel="canonical" href="${SITE}/knowledge-graph.html"/>
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1"/>
<meta name="author" content="Si Math AI"/>

<meta property="og:type" content="article"/>
<meta property="og:site_name" content="Si Math AI"/>
<meta property="og:locale" content="en_US"/>
<meta property="og:title" content="Knowledge Graph — Every Concept, Defined Once"/>
<meta property="og:description" content="${CONCEPTS.length} concepts, each defined exactly once, with typed relationships. Machine-readable JSON-LD for AI systems."/>
<meta property="og:url" content="${SITE}/knowledge-graph.html"/>
<meta property="og:image" content="${SITE}/assets/si-math-ai-logo.jpg"/>
<meta property="og:image:alt" content="Si Math AI logo"/>

<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="Knowledge Graph — Si Math AI"/>
<meta name="twitter:description" content="${CONCEPTS.length} concepts, each defined exactly once, with typed relationships between them."/>
<meta name="twitter:image" content="${SITE}/assets/si-math-ai-logo.jpg"/>

${headAssets()}

<script type="application/ld+json">
${jsonForScriptTag(graphJson)}
</script>
</head>
<body>

<div class="backdrop"></div>
<div class="bg-grid"></div>

<a class="skip-link" href="#main">Skip to content</a>

${nav('')}

<main id="main" class="k-main">

<div class="k-wrap">
  <nav class="k-crumb" aria-label="Breadcrumb">
    <ol>
      <li><a href="index.html">Home</a></li>
      <li>Knowledge Graph</li>
    </ol>
  </nav>
</div>

<section class="k-section" style="padding-top:34px">
  <div class="k-wrap k-body">
    <span class="k-eyebrow">◆ Knowledge Graph</span>
    <h1>Every concept, defined once</h1>
    <p class="k-lead" style="margin-top:20px">
      The registry of record. ${CONCEPTS.length} concepts, each with exactly one
      canonical definition, its purpose, what it consumes, what it produces, and
      typed relationships to everything around it.
    </p>
    <p>
      <strong>${esc(CANONICAL_DEFINITION)}</strong>
    </p>

    <div class="k-positioning">
      <p>Artificial Intelligence is <em>how</em> Si Math AI teaches.</p>
      <p>Educational expertise is <em>what</em> it teaches.</p>
      <p>Human experience is <em>why</em> it works.</p>
    </div>

    <div class="k-note">
      <p><strong>Machine-readable:</strong>
      <a href="knowledge-graph.json"><code style="font-family:var(--font-mono)">/knowledge-graph.json</code></a>
      — JSON-LD, every concept with a stable URI, every edge typed. Every page on
      this site links to it via <code style="font-family:var(--font-mono)">&lt;link rel="alternate"&gt;</code>.
      The goal is that an AI system can retrieve the platform's <em>structure</em>,
      not only read prose about it.</p>
    </div>

    <p>
      This page exists because of a failure mode that arrives with scale. By the
      time a site has twenty public pages, the same concept has been described on
      six of them. Each description is reasonable; collectively they drift — and an
      AI system asked "what is the Weakness Analyzer?" retrieves whichever page it
      happened to crawl. A graph fixes that at the root: one definition, one
      identifier, and relationships stated explicitly rather than left to be inferred.
    </p>
    <p>
      Pages describe concepts. <strong>This file defines them.</strong> If a page and
      this registry disagree, the registry is right and the page is a defect — and
      CI checks the glossary published on
      <a href="ai-knowledge.html">the AI reference page</a> against these definitions
      on every build.
    </p>

    <div class="k-toc">
      <h2>Concepts</h2>
      <ol>
${index}
      </ol>
    </div>
  </div>
</section>

<section class="k-section" id="predicates">
  <div class="k-wrap k-body">
    <span class="k-eyebrow">◆ Vocabulary</span>
    <h2>The relationship vocabulary</h2>
    <p style="margin-bottom:20px">
      Deliberately small. A large predicate vocabulary is harder to keep consistent
      than it is useful, so adding one is a considered act rather than a reflex.
      In the JSON-LD these are namespaced under
      <code style="font-family:var(--font-mono)">${esc(SITE)}/ns#</code> alongside
      schema.org, because inventing meanings for existing schema.org properties
      would be worse than declaring our own honestly.
    </p>
    <div class="k-table-scroll">
      <table class="k-table">
        <thead><tr><th scope="col">Predicate</th><th scope="col">Meaning</th></tr></thead>
        <tbody>
${predicateRows}
        </tbody>
      </table>
    </div>

    <h3 style="margin-top:26px">The core path</h3>
    <p>
      The relationship that matters most, traced through the graph:
    </p>
    <p class="k-flow-loop" style="border-radius:var(--r-md);line-height:2">
      <a href="#student">Student</a> → <em>uses</em> → <a href="#zero">Zero</a> →
      <em>feeds</em> → <a href="#question-analysis">Question Analysis</a> →
      <em>feeds</em> → <a href="#weakness-analyzer">Weakness Analyzer</a> →
      <em>generates</em> → <a href="#focus-practice">Focus Practice</a> →
      <em>improves</em> → <a href="#student">Student</a>
    </p>
  </div>
</section>

<section class="k-section" id="concepts">
  <div class="k-wrap k-body">
    <span class="k-eyebrow">◆ Registry</span>
    <h2>The concepts</h2>
    <p style="margin-bottom:24px">
      Each concept carries a permanent identifier. Identifiers appear in the public
      JSON-LD as fragment URIs, so renaming one would break any external reference —
      they do not change.
    </p>
${cards}

    <div class="k-btn-row">
      <a class="k-btn k-btn-primary" href="knowledge-graph.json">Machine-readable graph (JSON-LD)</a>
      <a class="k-btn k-btn-ghost" href="ai-knowledge.html">Reference for AI systems</a>
      <a class="k-btn k-btn-ghost" href="architecture.html">Architecture</a>
    </div>
  </div>
</section>

${footer()}

</main>
<script src="assets/founder-status.js" defer></script>
</body>
</html>
`;

/* ── the glossary on ai-knowledge.html, generated from the graph ────────── */

/**
 * ai-knowledge.html publishes a DefinedTermSet glossary for AI systems. It used
 * to hold its own copy of nine definitions — a second source of truth, and
 * therefore a guaranteed future contradiction.
 *
 * Now the array is generated from the graph, and each term's @id points at the
 * canonical graph node rather than at a private copy. That makes the glossary a
 * *reference* to the registry in the linked-data sense, which is exactly the
 * property the knowledge graph exists to provide.
 *
 * Only the hasDefinedTerm array is rewritten; the rest of the hand-written page
 * is untouched.
 */
const AI_KNOWLEDGE = 'ai-knowledge.html';
const GLOSSARY_RE = /("hasDefinedTerm": \[)[\s\S]*?(\n      \])/;

function glossaryArray() {
  const terms = CONCEPTS.map((c) => ({
    '@type': 'DefinedTerm',
    '@id': uri(c.id),
    name: c.name,
    description: c.definition,
    url: `${SITE}/knowledge-graph.html#${c.id}`,
  }));
  // Indent to sit inside the existing JSON-LD block on that page.
  return JSON.stringify(terms, null, 2)
    .split('\n')
    .slice(1, -1)                       // drop the array's own brackets
    .map((line) => `      ${line}`)
    .join('\n');
}

function aiKnowledgeWithGlossary() {
  const src = readFileSync(resolve(REPO, AI_KNOWLEDGE), 'utf8');
  if (!GLOSSARY_RE.test(src)) {
    throw new Error(`${AI_KNOWLEDGE}: could not locate the hasDefinedTerm array`);
  }
  return src.replace(GLOSSARY_RE, (_m, open, close) => `${open}\n${glossaryArray()}${close}`);
}

/* ── emit ───────────────────────────────────────────────────────────────── */

const outputs = [
  ['knowledge-graph.json', `${JSON.stringify(graphJson, null, 2)}\n`],
  ['knowledge-graph.html', graphHtml],
  [AI_KNOWLEDGE, aiKnowledgeWithGlossary()],
];

if (check) {
  const stale = outputs.filter(([file, body]) => {
    const p = resolve(REPO, file);
    return !existsSync(p) || readFileSync(p, 'utf8') !== body;
  }).map(([f]) => f);
  if (stale.length) {
    console.error(`FAIL  ${stale.length} knowledge-graph artefact(s) out of date with graph-data.mjs:`);
    for (const f of stale) console.error(`        ${f}`);
    console.error('      run: node scripts/build-graph.mjs');
    process.exit(1);
  }
  console.log(`PASS  knowledge-graph.json and knowledge-graph.html match graph-data.mjs (${CONCEPTS.length} concepts)`);
} else {
  for (const [file, body] of outputs) writeFileSync(resolve(REPO, file), body);
  const edges = CONCEPTS.reduce((n, c) => n + c.related.length, 0);
  console.log(`wrote knowledge-graph.json + knowledge-graph.html — ${CONCEPTS.length} concepts, ${edges} typed edges`);
}
