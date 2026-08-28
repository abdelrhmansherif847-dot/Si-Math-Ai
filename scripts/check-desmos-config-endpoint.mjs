#!/usr/bin/env node
// Is the calculator configured in a given deployment — and is the secret where
// it should be, which is nowhere the browser can find it without asking?
//
//   node scripts/check-desmos-config-endpoint.mjs <deployment-url>
//
// Add a session to also confirm the configuration is actually being served:
//
//   SI_SESSION_TOKEN=<supabase access token> \
//     node scripts/check-desmos-config-endpoint.mjs https://<preview>.vercel.app
//
// Get the token from a signed-in browser on that deployment: DevTools →
// Application → Local Storage → the sb-*-auth-token entry → access_token.
//
// WHAT IT NEVER DOES
// ------------------
// Print the key, its length, its prefix, or any substring of it. Every positive
// result is reported as presence, tier and version. The negative results — the
// ones that matter for exposure — are exact, because they are all about the key
// being ABSENT from somewhere.
//
// WHAT IT CANNOT TELL YOU
// -----------------------
// Whether Desmos renders. That is check-desmos-activation.cjs in deployed mode,
// and it needs a browser and a network that can reach www.desmos.com.
const url = (process.argv[2] || '').replace(/\/+$/, '');
if (!url || !/^https?:\/\//.test(url)) {
  console.error('usage: node scripts/check-desmos-config-endpoint.mjs <deployment-url>');
  console.error('   e.g. node scripts/check-desmos-config-endpoint.mjs https://si-math-ai-git-branch.vercel.app');
  process.exit(2);
}
const TOKEN = (process.env.SI_SESSION_TOKEN || '').trim();

const fails = [], pass = [], notes = [];
const ok = (n, c, d) => { (c ? pass : fails).push((c ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };

// A key-shaped literal in a served asset. Deliberately loose: this is looking
// for something that should not be there at all, so a false positive is cheap
// and a miss is not.
const KEYISH = /(apiKey|api_key)\s*[:=]\s*["'][^"']{8,}["']/;

async function get(path, headers) {
  const r = await fetch(url + path, { headers: headers || {}, redirect: 'follow' });
  return { status: r.status, body: await r.text(), type: r.headers.get('content-type') || '',
           cache: r.headers.get('cache-control') || '' };
}

try {
  // ── 1. anonymous: refused, and empty-handed ────────────────────────────────
  const anon = await get('/api/desmos-config');
  ok('the endpoint exists', anon.status !== 404, String(anon.status));
  ok('an anonymous request is refused', anon.status === 401, String(anon.status));
  ok('and its body carries no key', !KEYISH.test(anon.body) && !/"apiKey"\s*:\s*"[^"]/.test(anon.body));
  ok('it is marked uncacheable', /no-store/.test(anon.cache), anon.cache || '(none)');

  // ── 2. nothing the browser downloads unasked contains the key ─────────────
  const page = await get('/mock-exam.html');
  ok('the exam page loads', page.status === 200, String(page.status));
  const srcs = [...page.body.matchAll(/<script src="([^"]+)"/g)]
    .map(m => m[1]).filter(u => !/^https?:/.test(u));
  const leaks = [];
  if (KEYISH.test(page.body)) leaks.push('mock-exam.html');
  for (const src of srcs) {
    const a = await get(src.startsWith('/') ? src : '/' + src);
    if (a.status === 200 && KEYISH.test(a.body)) leaks.push(src);
  }
  ok(`no key in the page or its ${srcs.length} scripts`, leaks.length === 0, leaks.join(', '));
  ok('the page does not request the config on load',
     !/src="\/api\/desmos-config"/.test(page.body));

  // ── 3. with a session: is it actually configured here? ─────────────────────
  if (!TOKEN) {
    notes.push('No SI_SESSION_TOKEN, so this did not check whether a key is actually '
      + 'configured — only that nobody can get one without signing in. Re-run with a '
      + 'token to confirm the environment variable reached this deployment.');
  } else {
    const auth = await get('/api/desmos-config', { Authorization: 'Bearer ' + TOKEN });
    ok('a signed-in request is served', auth.status === 200, String(auth.status));
    let cfg = null;
    try { cfg = JSON.parse(auth.body).config; } catch { /* reported below */ }
    ok('it returns a configuration object', !!cfg, cfg ? '' : auth.body.slice(0, 120));
    if (cfg) {
      // Presence only. Never the value, never its length, never a prefix.
      const hasKey = typeof cfg.apiKey === 'string' && cfg.apiKey.trim().length > 0;
      ok('a key is configured in this environment', hasKey,
         hasKey ? '' : (cfg.apiKey === undefined ? 'no apiKey field' : 'empty'));
      ok('it is not a placeholder',
         typeof cfg.apiKey === 'string' && !/NOT-A-REAL-KEY|YOUR_KEY|<.*>/.test(cfg.apiKey));
      ok('the tier is commercial (API Terms §3.a for student-facing use)',
         cfg.tier === 'commercial', String(cfg.tier));
      ok('it is marked student-facing', cfg.studentFacing === true, String(cfg.studentFacing));
      notes.push(`configured: tier=${cfg.tier} studentFacing=${cfg.studentFacing} `
        + `apiVersion=${cfg.apiVersion || '(provider default)'} apiKey=present`);
    }
  }
} catch (e) {
  console.error(`check-desmos-config-endpoint: could not reach ${url}`);
  console.error('  ' + String((e && e.message) || e).split('\n')[0]);
  process.exit(2);
}

console.log([...pass, ...fails].join('\n'));
for (const n of notes) console.log('\nNOTE  ' + n);
if (fails.length) { console.log(`\n${fails.length} FAILED, ${pass.length} passed`); process.exit(1); }
console.log(`\nALL ${pass.length} CHECKS PASSED`);
