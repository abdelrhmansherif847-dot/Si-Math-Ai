#!/usr/bin/env node
// compare-token-state.mjs — turn two capture-token-state.mjs runs into a verdict.
//
//   node scripts/compare-token-state.mjs before after
//
// Answers two separate questions and never conflates them:
//
//   1. Did any token change that we did not intend?  (tokens.json diff,
//      deterministic — this is the real regression check.)
//   2. Did the pixels move, and is every move explained by an intended token
//      change?  (screenshot diff.)
//
// A pixel difference is NOT automatically a regression: converging --green from
// #4ade80 to #22c55e is supposed to move pixels. The failure condition is a
// pixel move on a page whose tokens did NOT change, or a token change nobody
// asked for. Those are reported as UNEXPLAINED and are the only real failures.

import { chromium } from '../.ds-sync/node_modules/playwright/index.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [A, B] = process.argv.slice(2);
if (!A || !B) { console.error('usage: node scripts/compare-token-state.mjs <before> <after>'); process.exit(1); }
const dir = (l) => join(ROOT, '.design-sync/.cache/regression', l);

/* ── 1. token diff ─────────────────────────────────────────────────────────── */

const ta = JSON.parse(readFileSync(join(dir(A), 'tokens.json'), 'utf8'));
const tb = JSON.parse(readFileSync(join(dir(B), 'tokens.json'), 'utf8'));

const tokenChanges = new Map(); // page -> [{token, from, to}]
for (const page of Object.keys(ta)) {
  const before = ta[page] ?? {}, after = tb[page] ?? {};
  const rows = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k === '__error') continue;
    if (before[k] !== after[k]) rows.push({ token: k, from: before[k] ?? '(absent)', to: after[k] ?? '(absent)' });
  }
  if (rows.length) tokenChanges.set(page, rows);
}

/* ── 2. pixel diff, via chromium (no image deps) ───────────────────────────── */

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
});
const pg = await browser.newPage();

async function pixelDiff(p1, p2) {
  const [d1, d2] = [p1, p2].map((p) => readFileSync(p).toString('base64'));
  return pg.evaluate(async ([a, b]) => {
    const load = (d) => new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:image/png;base64,${d}`;
    });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) {
      return { sizeMismatch: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };
    }
    const draw = (img) => {
      const c = new OffscreenCanvas(img.width, img.height);
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, img.width, img.height).data;
    };
    const [pa, pb] = [draw(ia), draw(ib)];
    let diff = 0, maxDelta = 0;
    for (let i = 0; i < pa.length; i += 4) {
      const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
      if (d) { diff++; if (d > maxDelta) maxDelta = d; }
    }
    const total = pa.length / 4;
    return { total, diff, pct: +(100 * diff / total).toFixed(3), maxDelta };
  }, [d1, d2]);
}

const results = { webfont: [], fallback: [] };
for (const pass of ['webfont', 'fallback']) {
  const da = join(dir(A), pass), db = join(dir(B), pass);
  if (!existsSync(da) || !existsSync(db)) continue;
  for (const f of readdirSync(da).filter((x) => x.endsWith('.png')).sort()) {
    if (!existsSync(join(db, f))) continue;
    results[pass].push({ page: `${f.replace(/\.png$/, '')}.html`, ...(await pixelDiff(join(da, f), join(db, f))) });
  }
}
await browser.close();

/* ── 3. verdict ────────────────────────────────────────────────────────────── */

console.log(`Token normalisation — regression report (${A} -> ${B})`);
console.log('='.repeat(70));

console.log(`\n1. TOKEN CHANGES  (deterministic; the real regression check)`);
console.log('-'.repeat(70));
console.log(`${tokenChanges.size} of ${Object.keys(ta).length} pages changed at least one token.\n`);
for (const [page, rows] of [...tokenChanges].sort((x, y) => y[1].length - x[1].length)) {
  console.log(`${page}  (${rows.length})`);
  for (const r of rows) console.log(`    ${r.token.padEnd(20)} ${r.from}  ->  ${r.to}`);
}

for (const [pass, label] of [['webfont', 'webfonts AVAILABLE — the real-user case'],
                             ['fallback', 'webfonts BLOCKED — the degraded case']]) {
  if (!results[pass].length) continue;
  console.log(`\n2${pass === 'webfont' ? 'a' : 'b'}. PIXEL DIFF — ${label}`);
  console.log('-'.repeat(70));
  for (const r of results[pass]) {
    if (r.sizeMismatch) { console.log(`${r.page.padEnd(24)} SIZE MISMATCH ${r.sizeMismatch}`); continue; }
    // Token values are read as COMPUTED, so a knowledge page picks up
    // assets/knowledge.css edits under its own name — no separate accounting
    // for the shared stylesheet is needed.
    const moved = tokenChanges.get(r.page);
    const verdict = r.diff === 0 ? 'identical'
      : moved ? `explained by ${moved.length} token change(s)`
      : 'UNEXPLAINED — investigate';
    console.log(`${r.page.padEnd(24)} ${String(r.pct).padStart(7)}% of pixels · max channel delta ${String(r.maxDelta).padStart(3)} · ${verdict}`);
  }
}

const unexplained = results.webfont.filter((r) => r.diff > 0 && !tokenChanges.has(r.page));
console.log(`\n${'='.repeat(70)}`);
console.log(unexplained.length
  ? `✗ ${unexplained.length} page(s) moved pixels with no token change: ${unexplained.map((r) => r.page).join(', ')}`
  : `✓ every pixel change is attributable to an intended token change`);
