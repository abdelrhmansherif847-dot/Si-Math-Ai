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

/** Every classic (non-module, non-src) inline <script> body in an HTML file. */
export function inlineScripts(html) {
  const re = /<script(?![^>]*\bsrc=)(?![^>]*type=["']module["'])[^>]*>([\s\S]*?)<\/script>/gi;
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
