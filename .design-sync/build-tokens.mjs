#!/usr/bin/env node
// build-tokens.mjs — the off-script converter for Si Math AI.
//
// WHY THIS EXISTS INSTEAD OF package-build.mjs
// --------------------------------------------
// The /design-sync converter consumes a built JS package: a `dist/` entry plus
// its `.d.ts` tree, compiled into `_ds_bundle.js` exposing React components at
// `window.<globalName>.*`. This repo has none of that, deliberately — CLAUDE.md:
// "No package.json, no bundler, no build step". What it does have is a coherent
// CSS design language spread across 20 `:root` blocks and one shared stylesheet.
//
// So this is the skill's documented off-script path: produce the upload layout
// by whatever means the repo allows. The gates do not move — package-validate.mjs
// must still exit clean, and it has first-class support for this case
// ("n === 0 is legitimate for a tokens-only sync (componentCount 0)").
//
// WHAT IT DOES
// ------------
// 1. Reads the first `:root` block of every root *.html page and assets/knowledge.css.
// 2. Normalises notation (#fff -> #ffffff, rgba spacing, trailing-zero alphas) so
//    that cosmetic differences do not read as design disagreements.
// 3. Picks the MAJORITY value per token. 27 of 68 tokens disagree across pages;
//    majority is the only tiebreak that does not privilege whichever file was
//    read first. Ties and near-duplicates are handled explicitly below.
// 4. Emits the upload layout into ds-bundle/.
//
// Re-run it any time the site's tokens change; output is deterministic.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT = join(ROOT, 'ds-bundle');
const NAMESPACE = 'SiMathAI';

/* ── 1. collect ────────────────────────────────────────────────────────────── */

const sources = [
  ...readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort(),
  'assets/knowledge.css',
];

/** Expand #abc, collapse rgba() whitespace, strip trailing-zero alphas. */
const normalise = (v) => {
  let s = v.trim().replace(/\s+/g, ' ');
  s = s.replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, (_, r, g, b) => `#${r}${r}${g}${g}${b}${b}`);
  if (/^#[0-9a-f]{6}$/i.test(s)) s = s.toLowerCase();
  s = s.replace(/rgba?\(([^)]*)\)/gi, (_, inner) =>
    `rgba(${inner.split(',').map((p) => p.trim().replace(/^(\.\d*?)0+$/, '$1')).join(',')})`);
  return s;
};

/** The first `:root{…}` block in a file — the base, not a media-query override. */
function baseRoot(src) {
  const i = src.search(/:root\s*\{/);
  if (i < 0) return null;
  const start = src.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && !--depth) return src.slice(start + 1, j);
  }
  return null;
}

const tally = new Map(); // token -> Map(normalised value -> count)
for (const f of sources) {
  let src;
  try { src = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
  const block = baseRoot(src);
  if (!block) continue;
  for (const m of block.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
    const v = normalise(m[2]);
    if (!tally.has(m[1])) tally.set(m[1], new Map());
    const b = tally.get(m[1]);
    b.set(v, (b.get(v) ?? 0) + 1);
  }
}

const winner = (t) => [...tally.get(t)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
const uses = (t) => [...(tally.get(t)?.values() ?? [])].reduce((a, b) => a + b, 0);
const has = (t) => tally.has(t);

/* ── 2. resolve the judgement calls ────────────────────────────────────────── */

// Single-use near-duplicates of an existing token. Shipping them would hand the
// design agent two names for one decision, which is worse than shipping neither.
// Recorded in NOTES.md as drift for the site to clean up.
const EXCLUDE = new Set([
  '--border',        // #1a2640, one page — a near-miss of --border-soft #1a2540
  '--font-sans',     // one page — duplicates --font-body
  '--radius-card',   // 16px, one page — sits between --r-md 14 and --r-lg 20
]);

// Font stacks: the terse `'Manrope',sans-serif` form holds the majority, but the
// difference from knowledge.css's form is only the fallback chain, not intent.
// The fuller chain is strictly better for rendering and loses nothing, so it
// wins here on merit rather than on count.
const FONT_STACKS = {
  '--font-display': "'Manrope', system-ui, -apple-system, sans-serif",
  '--font-body': "'DM Sans', system-ui, -apple-system, sans-serif",
  '--font-mono': "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
};

// Responsive type + rhythm ladder, taken verbatim from index.html — the only
// surface in the repo that defines a complete one (base + three breakpoints).
const LADDER = [
  ['@media (min-width: 768px)', { '--section-y': '96px', '--container-x': '32px', '--fs-h1': '64px', '--fs-h2': '42px', '--fs-h3': '22px', '--fs-body': '16px', '--nav-h': '64px' }],
  ['@media (min-width: 1024px) and (max-width: 1439px)', { '--section-y': '100px', '--container-x': '40px', '--fs-h1': '72px', '--fs-h2': '46px' }],
  ['@media (min-width: 1440px)', { '--section-y': '120px', '--container-x': '48px', '--fs-h1': '82px', '--fs-h2': '52px' }],
];
const LADDER_TOKENS = new Set(['--section-y', '--container-x', '--fs-h1', '--fs-h2', '--fs-h3', '--fs-body', '--nav-h']);

// index.html's base values for the ladder tokens. Not a majority vote: most app
// pages never define a type scale at all, so the two files that do (index.html
// and knowledge.css) tie 1-1. index.html wins on completeness — it is the only
// one carrying --fs-small/--fs-micro and a three-step ladder.
const LADDER_BASE = { '--section-y': '56px', '--container-x': '18px', '--fs-h1': '38px', '--fs-h2': '26px', '--fs-h3': '19px', '--fs-body': '15px', '--nav-h': '56px' };

const GROUPS = [
  ['Surface', 'Page and card backgrounds, darkest to lightest.',
    ['--bg', '--bg-elev-1', '--bg-elev-2', '--bg-card', '--bg-card-hi', '--bg-glass']],
  ['Brand', 'Cyan is the single brand accent. The -bg-/-border- variants are the only approved translucent forms.',
    ['--cyan', '--cyan-2', '--cyan-3', '--cyan-bg-soft', '--cyan-bg-med', '--cyan-border', '--cyan-border-soft', '--cyan-glow']],
  ['Status', 'Semantic colours. Each ships a solid, a -soft fill and a -border.',
    ['--green', '--green-soft', '--green-border', '--amber', '--amber-soft', '--amber-border',
     '--red', '--red-soft', '--red-border', '--purple', '--purple-soft', '--purple-border',
     '--gold', '--gold-soft', '--gold-border']],
  ['Text', 'Solid colours only — the site deliberately avoids opacity-based whites.',
    ['--text-100', '--text-200', '--text-300', '--text-400', '--text-500']],
  ['Border', null, ['--border-soft', '--border-mid']],
  ['Radius', null, ['--r-sm', '--r-md', '--r-lg', '--r-xl', '--r-full']],
  ['Spacing', '4px base step.',
    ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-7', '--space-8', '--space-9', '--space-10']],
  ['Type', 'Families here; sizes live in the responsive ladder below.',
    ['--font-display', '--font-body', '--font-mono', '--fs-small', '--fs-micro']],
  ['Layout', 'App-shell width. --nav-h and the rhythm tokens are in the ladder below.',
    ['--side-w', '--maxw']],
];

/* ── 3. emit ───────────────────────────────────────────────────────────────── */

mkdirSync(join(OUT, 'tokens'), { recursive: true });
// package-validate.mjs walks components/ unconditionally in its render check.
// Creating it empty lets that check actually RUN and find zero previews — the
// truthful result. Passing --no-render-check instead would record "previews are
// NOT visually verified", which claims a gap where there is simply nothing to
// verify. Local-only: ds-bundle/ is gitignored, and an empty dir uploads nothing.
mkdirSync(join(OUT, 'components'), { recursive: true });

// The repo holds no font files — they are fetched once into ds-bundle/fonts/.
// Doing it here (rather than as a documented prerequisite) is what makes a fresh
// clone reproduce the whole bundle with one command; a prerequisite step gets
// missed, and the result validates anyway because a missing font is only a
// warning — so the bundle would silently ship with system fonts.
if (!existsSync(join(OUT, 'fonts', 'fonts.css'))) {
  console.error('fonts/ missing — fetching brand fonts (network required)…');
  try {
    execFileSync(process.execPath, [join(ROOT, '.design-sync/fetch-fonts.mjs')], { stdio: 'inherit' });
  } catch {
    console.error('! font fetch failed — bundle will build and validate, but with system fonts.');
    console.error('  Re-run `node .design-sync/fetch-fonts.mjs` with network before uploading.');
  }
}

const resolved = {};
let css = `/* Si Math AI — design tokens.
 *
 * Generated by .design-sync/build-tokens.mjs from the site's own :root blocks
 * (${sources.length} files scanned). Where pages disagreed, the majority value won.
 * Do not hand-edit: fix the site, then re-run the build.
 */

:root {
`;

for (const [name, note, tokens] of GROUPS) {
  const present = tokens.filter((t) => has(t) && !EXCLUDE.has(t));
  if (!present.length) continue;
  css += `\n  /* ${name}${note ? ` — ${note}` : ''} */\n`;
  for (const t of present) {
    const v = FONT_STACKS[t] ?? winner(t);
    resolved[t] = v;
    css += `  ${t}: ${v};\n`;
  }
}

css += `\n  /* Rhythm and type scale — mobile base; see the ladder below. */\n`;
for (const [t, v] of Object.entries(LADDER_BASE)) { resolved[t] = v; css += `  ${t}: ${v};\n`; }
css += '}\n';

for (const [cond, vals] of LADDER) {
  css += `\n${cond} {\n  :root {\n`;
  for (const [t, v] of Object.entries(vals)) css += `    ${t}: ${v};\n`;
  css += '  }\n}\n';
}
writeFileSync(join(OUT, 'tokens', 'tokens.css'), css);

writeFileSync(join(OUT, 'tokens', 'tokens.json'), JSON.stringify({
  namespace: NAMESPACE,
  generatedFrom: `${sources.length} source files`,
  tokens: resolved,
  responsive: Object.fromEntries(LADDER),
}, null, 2) + '\n');

// Component styles: the repo's one shared stylesheet, with its :root blocks
// removed so tokens.css is the single definition site.
const known = readFileSync(join(ROOT, 'assets', 'knowledge.css'), 'utf8');
let stripped = known, guard = 0;
while (guard++ < 50) {
  const i = stripped.search(/:root\s*\{/);
  if (i < 0) break;
  const start = stripped.indexOf('{', i);
  let depth = 0, end = -1;
  for (let j = start; j < stripped.length; j++) {
    if (stripped[j] === '{') depth++;
    else if (stripped[j] === '}' && !--depth) { end = j; break; }
  }
  if (end < 0) break;
  stripped = stripped.slice(0, i) + stripped.slice(end + 1);
}
// Media queries left empty by the strip.
stripped = stripped.replace(/@media[^{]*\{\s*\}/g, '').replace(/\n{3,}/g, '\n\n');
writeFileSync(join(OUT, '_ds_bundle.css'),
  `/* Si Math AI — shared component styles (assets/knowledge.css).\n` +
  ` * :root blocks stripped; tokens/tokens.css is the single token source.\n */\n\n` + stripped.trim() + '\n');

// styles.css — the ONLY entry rendered designs receive. Everything real must be
// reachable from its @import closure.
writeFileSync(join(OUT, 'styles.css'),
  `/* Si Math AI design system — styles entry point.\n` +
  ` * Rendered designs receive this file's transitive @import closure and nothing else.\n */\n` +
  // The `./` prefix on _ds_bundle.css is load-bearing: package-validate.mjs
  // matches that exact form to prove component CSS is inside the closure.
  `@import "./tokens/tokens.css";\n@import "./fonts/fonts.css";\n@import "./_ds_bundle.css";\n`);

// Tokens-only bundle: no components to export, but the app's self-check still
// parses the header, so it must be well-formed and the file syntax-valid.
const bundle = `/* @ds-bundle: ${JSON.stringify({
  namespace: NAMESPACE,
  components: [],
  sourceHashes: { 'tokens.css': createHash('sha256').update(css).digest('hex').slice(0, 12) },
  inlinedExternals: [],
  note: 'Tokens-only sync — Si Math AI ships no JS component library.',
}).replace(/\*\//g, '*\\/')} */
(function () {
  // Si Math AI has no compiled component library: the site is static HTML+CSS.
  // The namespace exists so the app's bundle probe finds a well-formed global.
  window.${NAMESPACE} = window.${NAMESPACE} || {};
})();
`;
writeFileSync(join(OUT, '_ds_bundle.js'), bundle);

writeFileSync(join(OUT, '.ds-build-meta.json'), JSON.stringify({
  shape: 'tokens-only', componentCount: 0, dtsStubbed: false,
  tokenCount: Object.keys(resolved).length, sources: sources.length,
}, null, 2) + '\n');

const styleSha = createHash('sha256')
  .update(readFileSync(join(OUT, 'styles.css')))
  .update(css)
  .update(readFileSync(join(OUT, '_ds_bundle.css')))
  .digest('hex');
writeFileSync(join(OUT, '_ds_sync.json'), JSON.stringify({
  shape: 'tokens-only',
  styleSha,
  renderHashes: {},
  sourceKeys: {},
  keyRecipe: 'tokens-only:v1',
  sourceHashes: { 'tokens.css': createHash('sha256').update(css).digest('hex').slice(0, 12) },
  bundleSha12: createHash('sha256').update(readFileSync(join(OUT, '_ds_bundle.js'))).digest('hex').slice(0, 12),
}, null, 2) + '\n');

/* ── 4. README ─────────────────────────────────────────────────────────────── */

const header = existsSync(join(ROOT, '.design-sync', 'conventions.md'))
  ? readFileSync(join(ROOT, '.design-sync', 'conventions.md'), 'utf8').trim() + '\n\n---\n\n'
  : '';

const rows = Object.entries(resolved).map(([t, v]) => `| \`${t}\` | \`${v}\` |`).join('\n');
writeFileSync(join(OUT, 'README.md'), `${header}# Si Math AI — design tokens

Generated by \`.design-sync/build-tokens.mjs\`. **Tokens and styles only** — Si Math
AI is a static HTML + CSS site and ships no JavaScript component library, so this
sync carries the design language and no components.

- \`styles.css\` — the entry point. Rendered designs get its \`@import\` closure only.
- \`tokens/tokens.css\` — ${Object.keys(resolved).length} tokens + a three-step responsive ladder.
- \`tokens/tokens.json\` — the same values, machine-readable.
- \`fonts/\` — Manrope, DM Sans and JetBrains Mono, self-hosted (latin + latin-ext).
- \`_ds_bundle.css\` — shared component styles from \`assets/knowledge.css\`.

## Tokens

| Token | Value |
|---|---|
${rows}

## Responsive ladder

${LADDER.map(([c, v]) => `\`${c}\`\n\n${Object.entries(v).map(([t, x]) => `- \`${t}\`: \`${x}\``).join('\n')}`).join('\n\n')}
`);

console.error(`✓ ${Object.keys(resolved).length} tokens from ${sources.length} sources → ${OUT}`);
