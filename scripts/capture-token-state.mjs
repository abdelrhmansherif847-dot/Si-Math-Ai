#!/usr/bin/env node
// capture-token-state.mjs — before/after evidence for a token normalisation.
//
//   node scripts/capture-token-state.mjs <label>
//
// Writes .design-sync/.cache/regression/<label>/ containing:
//   tokens.json      computed :root values for every page (deterministic)
//   webfont/*.png    screenshots with webfonts ALLOWED  — the real-user case
//   fallback/*.png   screenshots with webfonts BLOCKED  — the degraded case
//
// Pass `--root <dir>` to capture a different checkout (e.g. a worktree at the
// pre-change commit), so "before" is captured with the same code as "after".
//
// Determinism: Supabase and every other third party is blocked so pages settle
// into a consistent logged-out state; animations and carets are disabled.
//
// FONTS ARE SERVED LOCALLY, NOT FETCHED. The pages request Manrope/DM Sans/
// JetBrains Mono from the Google Fonts CDN, but this environment routes
// outbound HTTPS through a proxy that the browser does not use — so simply
// "allowing" those hosts silently yields a FAILED font load, making the
// webfont pass secretly identical to the fallback pass and measuring nothing.
// Instead the webfont pass intercepts the CDN request and fulfils it from the
// woff2 files already downloaded into ds-bundle/fonts/. That is both faithful
// (identical bytes to what the CDN serves) and fully offline-deterministic.
// The methodology self-check at the end asserts the two passes actually differ.
//
// Why two passes: normalising the font stacks changes ONLY the fallback chain.
// With the webfont present nothing should move at all (that is the regression
// check). With it absent the longer chain should visibly do its job (that is
// the evidence the change is worth making).

import { chromium } from '../.ds-sync/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = process.argv[2];
if (!LABEL) { console.error('usage: node scripts/capture-token-state.mjs <label> [--root <dir>]'); process.exit(1); }
const rootFlag = process.argv.indexOf('--root');
// Pages come from --root; output and the local font files always come from the
// main repo, so a bare worktree (no gitignored ds-bundle/) still captures.
const ROOT = rootFlag > 0 ? process.argv[rootFlag + 1].replace(/\/$/, '') : REPO;
const FONT_DIR = join(REPO, 'ds-bundle/fonts');
const OUT = join(REPO, '.design-sync/.cache/regression', LABEL);

// Pages worth a pixel comparison: every file the normalisation touches that a
// student can actually see, plus knowledge pages downstream of knowledge.css.
const SHOT = ['index.html', 'dashboard.html', 'ai-monitor.html', 'reset-password.html',
  'pricing.html', 'learn.html', 'login.html', 'faq.html', 'progress.html', 'chat.html'];

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain',
  '.xml': 'application/xml', '.svg': 'image/svg+xml' };

const srv = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  // /__fonts/<file> serves the locally-held woff2 the intercepted CDN CSS points at.
  const p = url.startsWith('/__fonts/') ? join(FONT_DIR, url.slice('/__fonts/'.length)) : join(ROOT, url);
  const base = url.startsWith('/__fonts/') ? FONT_DIR : ROOT;
  if (!existsSync(p) || !p.startsWith(base)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' }).end(readFileSync(p));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
});

const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
const KILL_MOTION = `*,*::before,*::after{animation:none!important;transition:none!important;
  caret-color:transparent!important;scroll-behavior:auto!important}`;

async function pass(allowFonts) {
  const dir = join(OUT, allowFonts ? 'webfont' : 'fallback');
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  // The webfont CSS, rebuilt to point at the local server. Same @font-face
  // rules and the same woff2 bytes the CDN would serve.
  const localFontCss = readFileSync(join(FONT_DIR, 'fonts.css'), 'utf8')
    .replace(/url\(([^)]+\.woff2)\)/g, (_, f) => `url(http://127.0.0.1:${port}/__fonts/${f})`);

  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://127.0.0.1:${port}`)) return route.continue();
    if (allowFonts && FONT_HOSTS.test(url)) {
      // Fulfil the stylesheet locally; the woff2 it references then loads from
      // our own server. Anything else on those hosts is not needed.
      if (/css2?\?/.test(url) || url.includes('/css')) {
        return route.fulfill({ status: 200, contentType: 'text/css', body: localFontCss });
      }
    }
    return route.abort();
  });
  const tokens = {};
  for (const f of pages) {
    const pg = await ctx.newPage();
    try {
      await pg.goto(`http://127.0.0.1:${port}/${f}`, { waitUntil: 'load', timeout: 20000 });
      await pg.addStyleTag({ content: KILL_MOTION });
      await pg.evaluate(() => document.fonts.ready).catch(() => {});
      // Only the token pass needs every page; screenshots are a curated subset.
      if (allowFonts) {
        tokens[f] = await pg.evaluate(() => {
          const cs = getComputedStyle(document.documentElement);
          const out = {};
          for (const sheet of [...document.styleSheets]) {
            let rules; try { rules = sheet.cssRules; } catch { continue; }
            for (const r of rules ?? []) {
              if (!r.style) continue;
              for (const p of r.style) if (p.startsWith('--')) out[p] = cs.getPropertyValue(p).trim();
            }
          }
          return out;
        });
      }
      if (SHOT.includes(f)) {
        await pg.screenshot({ path: join(dir, `${f.replace(/\.html$/, '')}.png`), fullPage: false });
      }
    } catch (e) {
      tokens[f] = { __error: String(e).split('\n')[0] };
    } finally { await pg.close(); }
  }
  await ctx.close();
  return tokens;
}

mkdirSync(OUT, { recursive: true });
const tokens = await pass(true);
await pass(false);
writeFileSync(join(OUT, 'tokens.json'), JSON.stringify(tokens, null, 2) + '\n');

const errs = Object.entries(tokens).filter(([, v]) => v.__error);
console.log(`captured "${LABEL}" from ${ROOT}: ${pages.length} pages, ${SHOT.length} screenshots x2 passes`);
console.log(errs.length ? `  ${errs.length} page(s) errored: ${errs.map(([f]) => f).join(', ')}` : '  no page errors');

// Methodology self-check. If the webfont and fallback passes are byte-identical
// the webfont never loaded, the two passes measure the same thing, and every
// conclusion drawn from them would be worthless. Fail loudly instead.
const identical = readdirSync(join(OUT, 'webfont')).filter((f) => f.endsWith('.png'))
  .filter((f) => readFileSync(join(OUT, 'webfont', f)).equals(readFileSync(join(OUT, 'fallback', f))));
if (identical.length === SHOT.length) {
  console.error(`\n✗ METHODOLOGY FAILURE: all ${identical.length} screenshots identical across passes —`);
  console.error(`  the webfont did not load, so the two passes measure the same thing.`);
  process.exitCode = 1;
} else {
  console.log(`  webfont vs fallback differ on ${SHOT.length - identical.length}/${SHOT.length} screenshots — passes are distinct`);
}
await browser.close();
srv.close();
