#!/usr/bin/env node
/**
 * i2a-page-smoke.mjs — prove teacher-exams.html reads through I-2a's two staff
 * RPCs and never through a table.
 *
 * Drives the real shipped page in Chromium against a STUBBED supabase client
 * whose .from() THROWS. That is the proof no static grep can give: grep sees
 * the source, this sees the run. If any code path still reaches a table at
 * runtime the harness fails, whatever the source looks like.
 *
 * Both roles are driven, because a teacher and an ACTIVE assistant must be
 * identical here — the RPC gates are role-blind — and both a draft and a
 * published paper, because openExam() branches on status.
 *
 * NOT part of `node tests/run-all.mjs`. That gate is deliberately
 * dependency-free — plain node, no package.json, no install step — and this
 * needs Playwright and a Chromium binary, so wiring it in would break CI on any
 * machine that does not have them. It is committed because the evidence has to
 * outlive the session that produced it: I-2a was once blocked for exactly the
 * opposite, a dry-run result whose artifact nobody could re-run. Run it by hand
 * before shipping a change to this page:
 *
 *     node scripts/i2a-page-smoke.mjs            # screenshots to /tmp/i2a-shots
 *     node scripts/i2a-page-smoke.mjs /tmp/out   # somewhere else
 *
 * Exit 0 if every check passes, 1 otherwise.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

/* Resolve Playwright from wherever it is. A bare specifier only works if it
   sits in a node_modules above this file, and this repo deliberately has none;
   NODE_PATH does not help either, because ESM import() ignores it. So: try the
   bare specifier, then fall back to the global root, and say so plainly if
   neither works — a harness that cannot start must not look like one that ran. */
let chromium;
for (const spec of ['playwright', globalPlaywright()]) {
  if (!spec) continue;
  try { ({ chromium } = await import(spec)); break; } catch { /* try the next */ }
}
function globalPlaywright() {
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const entry = join(root, 'playwright', 'index.mjs');
    return existsSync(entry) ? pathToFileURL(entry).href : null;
  } catch { return null; }
}
if (!chromium) {
  console.error('i2a-page-smoke: playwright is not installed.\n'
    + '  npm i -g playwright   (a Chromium binary is required too)');
  process.exit(1);
}

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = process.argv[2] || '/tmp/i2a-shots';
mkdirSync(OUT, { recursive: true });
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml',
                '.ico':'image/x-icon', '.webp':'image/webp', '.jpg':'image/jpeg' };
const server = createServer((req, res) => {
  const p = join(REPO, normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''));
  if (!existsSync(p) || p.endsWith('/')) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const results = [];
const check = (l, ok, extra='') => { results.push({l,ok});
  console.log(`  ${ok?'PASS':'FAIL'}  ${l}${extra?'  — '+extra:''}`); };

const EX = '688b3dd3-c08e-4617-9a51-439e5ca6b102';
const WS = '66ab9465-5b5c-4f35-8753-4767bafb3060';

function stub(role) {
  return `
window.__calls = [];
window.__tableReads = [];
const EX='${EX}', WS='${WS}';
const paper = {
  exam_id: EX, workspace_id: WS, title: 'Algebra I', instructions: 'Show your work.',
  exam_code: 'AB12CD34', status: 'draft', duration_minutes: 45, calculator_allowed: true,
  opens_at: null, closes_at: null, created_at: '2026-09-01T10:00:00Z',
  published_at: null, closed_at: null, can_edit_content: true,
  stimuli: [{ id:'s1', kind:'figure', label:'Triangle', body:null, spec:null,
              media_ref:'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
              media_kind:'svg' }],
  questions: [{ id:'q1', ordinal:1, prompt:'What is 2+2?', question_format:'mcq',
                /* Four choices with id/text: exam_question_choices_ok accepts
                   only [A,B,C,D], [A,B,C,D,E] or [F,G,H,J,K], so a two-choice
                   MCQ is a state production cannot hold. */
                choices:[{id:'A',text:'3'},{id:'B',text:'4'},
                         {id:'C',text:'5'},{id:'D',text:'6'}],
                correct_answer:'B', explanation:'Add them.', stimulus_id:'s1' }]
};
const listRows = [
  { exam_id: EX, title:'Algebra I', exam_code:'AB12CD34', status:'draft',
    duration_minutes:45, calculator_allowed:true, opens_at:null, closes_at:null,
    created_at:'2026-09-01T10:00:00Z', published_at:null, closed_at:null,
    question_count:1, request_count:0, attempt_count:0, submitted_count:0 },
  { exam_id:'e2', title:'Geometry', exam_code:'ZZ99YY88', status:'published',
    duration_minutes:60, calculator_allowed:false, opens_at:null, closes_at:null,
    created_at:'2026-08-20T10:00:00Z', published_at:'2026-08-21T10:00:00Z', closed_at:null,
    question_count:5, request_count:2, attempt_count:1, submitted_count:1 }
];
window.supabase = { createClient: () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id:'u1' } } } }) },
  /* THE PROOF: any table read is a failure, not a silent empty list. */
  from(t) { window.__tableReads.push(t); throw new Error('table read reached: ' + t); },
  async rpc(name, args) {
    window.__calls.push(name);
    if (name === 'teacher_my_workspaces')
      return { data: [{ workspace_id: WS, name: 'Class A', staff_status: 'active',
                        staff_role: '${role}' }], error: null };
    if (name === 'teacher_exam_list')   return { data: listRows, error: null };
    if (name === 'teacher_exam_paper') {
      if (args.p_exam === 'e2') return { data: Object.assign({}, paper, {
        exam_id:'e2', title:'Geometry', status:'published', exam_code:'ZZ99YY88',
        can_edit_content:false, published_at:'2026-08-21T10:00:00Z' }), error: null };
      return { data: paper, error: null };
    }
    if (name === 'teacher_exam_requests') return { data: [], error: null };
    if (name === 'teacher_exam_results')  return { data: [], error: null };
    if (name === 'teacher_exam_save_stimulus') return { data: 's1', error: null };
    if (name === 'teacher_exam_delete_stimulus') return { data: null, error: null };
    if (name === 'teacher_exam_save_question')   return { data: 'q1', error: null };
    if (name === 'teacher_exam_delete_question') return { data: null, error: null };
    if (name === 'teacher_exam_reorder_questions') return { data: null, error: null };
    throw new Error('unstubbed rpc: ' + name);
  }
}) };`;
}

const browser = await chromium.launch();

for (const role of ['teacher', 'assistant']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(stub(role));
  await page.goto(BASE + '/teacher-exams.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const listShown = await page.isVisible('#listState');
  check(`[${role}] the list screen paints`, listShown);
  const tiles = await page.$$eval('[data-exam]', (n) => n.map((x) => x.getAttribute('data-exam')));
  check(`[${role}] both exams listed, keyed by exam_id`,
    tiles.length === 2 && tiles[0] === EX, tiles.join(','));

  await page.click(`[data-exam="${EX}"]`);
  await page.waitForTimeout(400);
  check(`[${role}] the exam screen paints`, await page.isVisible('#examState'));
  check(`[${role}] the header filled from the paper`,
    (await page.inputValue('#fTitle')) === 'Algebra I'
    && (await page.inputValue('#fInstr')) === 'Show your work.'
    && (await page.inputValue('#fDur')) === '45');
  check(`[${role}] the code shows`, (await page.textContent('#exCode')).trim() === 'AB12CD34');
  check(`[${role}] the figure rendered`, (await page.$$('#stimList .q')).length === 1);
  check(`[${role}] the question rendered`,
    (await page.textContent('#qList')).includes('What is 2+2?'));
  check(`[${role}] draft controls are enabled`,
    !(await page.isDisabled('#btnSaveMeta')) && await page.isVisible('#stimCard'));

  /* The five content flows must still show their message. */
  await page.click('[data-eq="q1"]'); await page.waitForTimeout(150);
  check(`[${role}] edit repopulates the answer key`,
    (await page.inputValue('#qAns')) === 'B' && (await page.inputValue('#qExpl')) === 'Add them.');
  await page.click('#btnSaveQ'); await page.waitForTimeout(400);
  check(`[${role}] "Question updated." survives the refresh`,
    (await page.textContent('#qMsg')).includes('Question updated'));

  await page.click('[data-es="s1"]'); await page.waitForTimeout(150);
  await page.click('#btnSaveStim'); await page.waitForTimeout(400);
  check(`[${role}] "Figure updated." survives the refresh`,
    (await page.textContent('#stimMsg')).includes('Figure updated'));

  /* The published path is a different branch of openExam(): the editing cards
     come off, the code card comes on, and loadRequests/loadResults run. It is
     now fed by the same paper call, so it has to be exercised too. */
  await page.click('#btnBack'); await page.waitForTimeout(300);
  await page.click('[data-exam="e2"]'); await page.waitForTimeout(400);
  check(`[${role}] a published paper opens`,
    (await page.textContent('#exStatus')).trim() === 'published');
  check(`[${role}] editing is off and the code card is on for a published paper`,
    await page.isDisabled('#btnSaveMeta')
    && !(await page.isVisible('#stimCard')) && await page.isVisible('#codeCard'));
  check(`[${role}] the published paper still renders its question`,
    (await page.textContent('#qList')).includes('What is 2+2?'));

  const reads = await page.evaluate(() => window.__tableReads);
  check(`[${role}] ZERO table reads at runtime`, reads.length === 0, reads.join(',') || 'none');
  const calls = await page.evaluate(() => window.__calls);
  check(`[${role}] both read RPCs were called`,
    calls.includes('teacher_exam_list') && calls.includes('teacher_exam_paper'));
  const html = await page.content();
  check(`[${role}] media_sha256 appears nowhere in the DOM`, !html.includes('media_sha256'));
  check(`[${role}] no page errors`, errs.length === 0, errs.join(' | '));

  if (role === 'teacher') {
    for (const w of [390, 820, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      check(`[${w}px] no horizontal overflow`, !overflow);
      await page.screenshot({ path: `${OUT}/exam-${w}.png`, fullPage: true });
    }
  }
  await ctx.close();
}
await browser.close(); server.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
