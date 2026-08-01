// Helpers for testing code that lives inside shipped HTML pages and the Deno
// Edge Function.
//
// The suites deliberately extract and execute the REAL shipped source rather
// than re-implementing it. A test that paraphrases the code under test can pass
// while production is broken — that happened during this audit, when a
// hand-rolled stand-in for chat.html's XP retry loop produced a false failure.
// Everything here exists so a suite can reach the actual bytes that ship.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import vm from 'node:vm';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Read a repo-relative file. */
export const read = (rel) => readFileSync(resolve(REPO, rel), 'utf8');

/**
 * Slice source between two literal markers (end exclusive).
 * Throws loudly if either marker is missing — a silent empty slice would make
 * a suite pass vacuously, which is worse than a hard failure.
 */
export function slice(src, startNeedle, endNeedle, what = 'slice') {
  const a = src.indexOf(startNeedle);
  if (a < 0) throw new Error(`${what}: start marker not found: ${JSON.stringify(startNeedle)}`);
  const b = src.indexOf(endNeedle, a + startNeedle.length);
  if (b < 0) throw new Error(`${what}: end marker not found: ${JSON.stringify(endNeedle)}`);
  const out = src.slice(a, b);
  if (!out.trim()) throw new Error(`${what}: extracted an empty slice`);
  return out;
}

// A <script> element only holds JavaScript when its type is absent, empty, or a
// JavaScript MIME type. Every other type is a DATA BLOCK that the browser never
// executes — JSON-LD structured data, importmaps, HTML templates. Parsing one of
// those as JavaScript reports a syntax error for a file that is perfectly valid,
// which is exactly what happened when the knowledge layer added
// <script type="application/ld+json"> to five pages.
const JS_SCRIPT_TYPES = new Set([
  '',
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
  'text/jscript',
]);

/**
 * Every classic (non-module, non-src) inline <script> body in an HTML file.
 * Data blocks are skipped — see jsonLdBlocks() for validating those instead.
 */
export function inlineScripts(html) {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    const body = m[2];
    if (/\bsrc\s*=/i.test(attrs)) continue;                 // external: nothing inline to parse
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]*)/i) || ['', ''])[1].trim().toLowerCase();
    if (type === 'module') continue;                        // unchanged: modules were always skipped
    if (!JS_SCRIPT_TYPES.has(type)) continue;               // data block, not code
    if (body.trim()) out.push(body);
  }
  return out;
}

/**
 * Every <script type="application/ld+json"> body in an HTML file, as raw text.
 * These carry the site's Schema.org structured data; a block that does not parse
 * is invisible to every search engine and AI crawler that reads it, and fails
 * silently in the browser — so it needs its own check.
 */
export function jsonLdBlocks(html) {
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) if (m[1].trim()) out.push(m[1]);
  return out;
}

/** Parse-check a string as a classic script. Returns null on success, else the message. */
export function syntaxError(code, filename = 'inline') {
  try { new vm.Script(code, { filename }); return null; }
  catch (e) { return e.message; }
}

/**
 * Evaluate a browser-style snippet in a sandbox and return selected globals.
 * `globals` seeds the sandbox (e.g. a fake `document`).
 */
export function evalSnippet(code, globals = {}, exportNames = []) {
  const sandbox = { console, Intl, Date, Math, JSON, RegExp, String, Number,
                    Array, Object, Map, Set, ...globals };
  vm.createContext(sandbox);
  vm.runInContext(`${code}\n;globalThis.__exports = { ${exportNames.join(', ')} };`, sandbox);
  return sandbox.__exports;
}

/**
 * Write a TypeScript snippet to a temp file and import it. Node strips the
 * types (v22.6+), so the Edge Function's real helpers can be exercised with no
 * build step, no tsc dependency and no hand-written type-stripping.
 */
export async function importTS(tsSource, exportNames) {
  const dir = mkdtempSync(join(tmpdir(), 'simath-test-'));
  const file = join(dir, 'extract.ts');
  writeFileSync(file, `${tsSource}\nexport { ${exportNames.join(', ')} };\n`);
  return import(pathToFileURL(file).href);
}
