// Regression suite for supabase/functions/_shared/cors.ts — the shared origin
// policy used by admin-actions (and, once migrated, ai-tutor).
//
// Executes the REAL shipped module, with Deno.env stubbed, so a change to the
// deployed bytes is what passes or fails.
//
// The lookalike and wildcard assertions are not hypothetical. This module
// replaced a hardcoded `Access-Control-Allow-Origin: '*'` in admin-actions —
// the endpoint that approves payments and grants credits — where a wildcard
// let any website script the owner's session.
import { suite } from './_assert.mjs';
import { read, importTS } from './_source.mjs';

const t = suite('shared-cors');

const SRC = read('supabase/functions/_shared/cors.ts');

/** Import the real module with a stubbed Deno env.
 *  The export list is empty on purpose: cors.ts is already an ES module that
 *  exports these names itself, and importTS appends its own `export { ... }`
 *  block — naming them again is a duplicate export and the module fails to
 *  compile. */
function load(env) {
  return importTS(
    `globalThis.Deno = { env: { get: (k) => (${JSON.stringify(env)})[k] } };\n${SRC}`,
    [],
  );
}

// ── Enforced ────────────────────────────────────────────────────────────────
t.section('origin allow-list (ALLOWED_ORIGINS set)');

const strict = await load({ ALLOWED_ORIGINS: 'https://si-math-ai.com,https://www.si-math-ai.com' });

t.ok('enforcement engages when the var is set', strict.ORIGIN_ENFORCED);
t.ok('production origin allowed',   strict.isAllowedOrigin('https://si-math-ai.com'));
t.ok('www variant allowed',         strict.isAllowedOrigin('https://www.si-math-ai.com'));
t.ok('hostile origin rejected',    !strict.isAllowedOrigin('https://evil.example'));
t.ok('scheme downgrade rejected',  !strict.isAllowedOrigin('http://si-math-ai.com'));
t.ok('null origin rejected',       !strict.isAllowedOrigin('null'));

// Exact-match, not endsWith/contains. A suffix match would accept this.
t.ok('lookalike suffix rejected',  !strict.isAllowedOrigin('https://si-math-ai.com.evil.example'));
t.ok('prefix lookalike rejected',  !strict.isAllowedOrigin('https://evilsi-math-ai.com'));
// The domain that was configured by mistake, copied from a README placeholder.
t.ok('unrelated domain rejected',  !strict.isAllowedOrigin('https://simathai.com'));

t.is('allowed origin is echoed, never a wildcard',
  strict.corsHeaders('https://si-math-ai.com')['Access-Control-Allow-Origin'],
  'https://si-math-ai.com');
t.is('rejected origin gets no ACAO header at all',
  strict.corsHeaders('https://evil.example')['Access-Control-Allow-Origin'], undefined);
t.is('server-to-server (no Origin) gets no ACAO header',
  strict.corsHeaders('')['Access-Control-Allow-Origin'], undefined);
t.is('Vary: Origin is always set so caches cannot cross-serve',
  strict.corsHeaders('https://si-math-ai.com')['Vary'], 'Origin');
t.ok('wildcard is never emitted for any input',
  !['https://si-math-ai.com', 'https://evil.example', '', 'null', '*']
    .some(o => strict.corsHeaders(o)['Access-Control-Allow-Origin'] === '*'));

t.ok('isBlockedOrigin true for a hostile browser origin',  strict.isBlockedOrigin('https://evil.example'));
t.ok('isBlockedOrigin false for an allowed origin',       !strict.isBlockedOrigin('https://si-math-ai.com'));
t.ok('isBlockedOrigin false with no Origin (curl, smoke tests)', !strict.isBlockedOrigin(''));

// ── Fail-open default ───────────────────────────────────────────────────────
// Deliberate: these functions deploy by hand and the origin list lives in
// project config, so a fail-closed default would take the platform down for
// everyone on any deploy that forgot the secret.
t.section('unset ALLOWED_ORIGINS (deliberate fail-open)');

const open = await load({});
t.ok('enforcement is off',                     !open.ORIGIN_ENFORCED);
t.ok('any origin accepted rather than 403-ing', open.isAllowedOrigin('https://anything.example'));
t.ok('nothing is reported as blocked',         !open.isBlockedOrigin('https://anything.example'));
t.is('...and still never a bare wildcard',
  open.corsHeaders('https://anything.example')['Access-Control-Allow-Origin'],
  'https://anything.example');

// ── Call sites ──────────────────────────────────────────────────────────────
t.section('call sites');

const ADMIN = read('supabase/functions/admin-actions/index.ts');
const adminCode = ADMIN.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

t.ok('admin-actions imports the shared module',
  /import \{[^}]*corsHeaders[^}]*\} from "\.\.\/_shared\/cors\.ts"/.test(ADMIN));
t.ok('admin-actions no longer hardcodes a wildcard',
  !adminCode.includes("'Access-Control-Allow-Origin': '*'"));
t.ok('admin-actions rejects disallowed browser origins',
  adminCode.includes('isBlockedOrigin(origin)'));
t.ok('admin-actions still verifies the JWT',
  adminCode.includes('userClient.auth.getUser()'));
t.ok('admin-actions still gates on is_admin via the service client',
  /\.from\('profiles'\)[\s\S]{0,80}\.select\('is_admin'\)/.test(adminCode) &&
  adminCode.includes('!profile?.is_admin'));

// ai-tutor still carries its own inline copy. Assert it agrees with this
// module's contract so the two cannot drift apart unnoticed.
const TUTOR = read('supabase/functions/ai-tutor/index.ts');
const tutorCode = TUTOR.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
t.ok('ai-tutor uses exact-match origin comparison, same as the shared module',
  tutorCode.includes('ALLOWED_ORIGINS.includes(origin)'));
t.ok('ai-tutor emits no wildcard either',
  !tutorCode.includes("'Access-Control-Allow-Origin': '*'"));
t.ok('ai-tutor sets Vary: Origin', tutorCode.includes("'Vary': 'Origin'"));

t.done();
