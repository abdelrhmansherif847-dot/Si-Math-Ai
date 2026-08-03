#!/usr/bin/env node
/**
 * smoke-pages.mjs — load every root *.html in a real browser and fail on any
 * uncaught error or horizontal overflow.
 *
 * NOT part of `node tests/run-all.mjs`. That gate is deliberately
 * dependency-free — plain node, no package.json, no install step — and this
 * needs Playwright and a Chromium binary, so wiring it in would break CI on any
 * machine that does not have them. Run it by hand before shipping page changes:
 *
 *     npm i playwright && node scripts/smoke-pages.mjs
 *     node scripts/smoke-pages.mjs profile.html devices.html   # just these
 *
 * Exit 0 if every page is clean, 1 otherwise.
 *
 * ── Why it stubs Supabase ─────────────────────────────────────────────────
 * Every page builds its client from the jsdelivr bundle. If that script is
 * simply blocked, each page's inline <script> aborts at `createClient` — and
 * because function declarations hoist while `var` assignments do not, the page
 * is left in a half-initialised state where declared helpers exist but the
 * objects they read were never assigned. Errors found in that state are
 * artefacts, and worse, real errors LATER in the script are masked because the
 * script never reaches them.
 *
 * So the stub is installed before any page script runs, which lets each page
 * execute to completion against predictable data. This is what makes the check
 * meaningful: run against the pre-fix versions of profile.html and devices.html
 * it reports `ReferenceError: RANKS is not defined` and `ReferenceError:
 * planLabel is not defined` — the two crashes that left those pages stuck on a
 * loading spinner in production.
 *
 * External requests are blocked, so failed loads of KaTeX/fonts appear as
 * console errors. Those are expected here and are not counted as failures;
 * only uncaught page errors and layout overflow are.
 */
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const PORT = Number(process.env.SMOKE_PORT || 8911);
const BASE = `http://127.0.0.1:${PORT}`;
const MOBILE_WIDTH = 360;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('smoke-pages: playwright is not installed.\n  npm i playwright   (then re-run)');
  process.exit(2);
}

const only = process.argv.slice(2);
const pages = only.length
  ? only
  : readdirSync(REPO).filter((f) => f.endsWith('.html')).sort();

/* Installed via addInitScript, so it is in place before any page script runs. */
const STUB = () => {
  const FIXTURES = {
    profiles: [{
      id: 'u1', is_admin: true, role: 'owner', plan_code: 'FREE', xp: 120,
      full_name: 'Test Student', email: 'test@example.com', exam_type: 'SAT',
      current_streak: 3, best_streak: 7, onboarding_completed: true,
    }],
    user_devices: [{ id: 'd1', device_fingerprint: 'x', is_active: true }],
    weakness_reports: [{
      topic: 'Algebra', subtopic: 'Exponents', mastery_score: 42, priority_rank: 1,
      total_signals: 5, last_updated: '2026-08-01T00:00:00Z', improvement_score: 4,
    }],
    mastery_records: [{
      topic: 'Algebra', subtopic: 'Exponents', mastery_score: 72,
      questions_seen: 10, questions_correct: 7, last_updated: '2026-08-01T00:00:00Z',
    }],
    question_records: [{ topic: 'Algebra', is_correct: true, created_at: '2026-08-01T10:00:00Z' }],
    exam_practice_sessions: [{
      id: 'e1', exam_type: 'ACT_MATH', score: 30, correct_answers: 30,
      wrong_answers: 15, created_at: '2026-08-01T10:00:00Z',
    }],
    achievements: [{ achievement_key: 'first_question', earned_at: '2026-08-01T10:00:00Z' }],
    plan_definitions: [{
      plan_code: 'FREE', display_name: 'Free', kind: 'subscription', amount_egp: 0,
      credits_granted: 0, daily_limit: 15, active: true, sort_order: 1, visibility: 'public',
    }],
    credit_costs: [{ feature_name: 'AI_CHAT_MESSAGE', credit_cost: 5, active: true }],
  };
  const rows = (t) => FIXTURES[t] || [];
  const mk = (table) => {
    const res = { data: rows(table), error: null, count: rows(table).length };
    const q = {
      select: () => q, eq: () => q, is: () => q, neq: () => q, in: () => q, or: () => q,
      not: () => q, filter: () => q, contains: () => q, like: () => q, ilike: () => q,
      gte: () => q, lte: () => q, lt: () => q, gt: () => q,
      order: () => q, limit: () => q, range: () => q,
      insert: () => q, update: () => q, upsert: () => q, delete: () => q,
      single: () => Promise.resolve({ data: rows(table)[0] || {}, error: null }),
      maybeSingle: () => Promise.resolve({ data: rows(table)[0] || null, error: null }),
      then: (onOk, onErr) => Promise.resolve(res).then(onOk, onErr),
    };
    return q;
  };
  window.supabase = {
    createClient: () => ({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'u1', email: 'test@example.com' } }, error: null }),
        getSession: () => Promise.resolve({ data: { session: { access_token: 't', user: { id: 'u1' } } }, error: null }),
        signOut: () => Promise.resolve({}),
        signInWithPassword: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
        signUp: () => Promise.resolve({ data: { user: { id: 'u1', identities: [{}] } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        resend: () => Promise.resolve({ error: null }),
        updateUser: () => Promise.resolve({ error: null }),
      },
      from: mk,
      // can_register_device must say yes, or every guarded page redirects to
      // devices.html?blocked=1 and nothing under test is ever rendered.
      rpc: (fn) => Promise.resolve({ data: fn === 'can_register_device' ? true : null, error: null }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
      storage: { from: () => ({ upload: () => Promise.resolve({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    }),
  };
};

const server = spawn(process.execPath, ['-e', `
  const http = require('http'), fs = require('fs'), path = require('path');
  const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                  '.json':'application/json', '.txt':'text/plain', '.xml':'application/xml',
                  '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
  http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\\/+/, '') || 'index.html';
    const file = path.join(${JSON.stringify(REPO)}, rel);
    if (!file.startsWith(${JSON.stringify(REPO)})) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  }).listen(${PORT}, '127.0.0.1');
`], { stdio: 'ignore' });

const shutdown = () => { try { server.kill(); } catch {} };
process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(130); });
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const failures = [];

for (const pageFile of pages) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  await page.addInitScript(STUB);
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:')) return route.continue();
    return route.abort('connectionrefused');
  });
  page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0].slice(0, 200)));

  let hScroll = false;
  let gotoError = null;
  try {
    await page.goto(`${BASE}/${pageFile}`, { waitUntil: 'load', timeout: 25000 });
    await page.waitForTimeout(3000);
    await page.setViewportSize({ width: MOBILE_WIDTH, height: 740 });
    await page.waitForTimeout(900);
    hScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5,
    );
  } catch (e) {
    gotoError = String(e).split('\n')[0].slice(0, 200);
  }
  await ctx.close();

  const bad = pageErrors.length || hScroll || gotoError;
  if (bad) {
    failures.push({ page: pageFile, pageErrors, hScroll, gotoError });
    console.log(`  FAIL  ${pageFile}`);
    if (gotoError) console.log(`        load: ${gotoError}`);
    pageErrors.forEach((e) => console.log(`        ${e}`));
    if (hScroll) console.log(`        horizontal overflow at ${MOBILE_WIDTH}px`);
  } else {
    console.log(`  PASS  ${pageFile}`);
  }
}

await browser.close();
shutdown();

console.log(`\nsmoke-pages: ${pages.length - failures.length}/${pages.length} clean`
  + (failures.length ? ` — ${failures.length} FAILED` : ' — all pages clean'));
process.exit(failures.length ? 1 : 0);
