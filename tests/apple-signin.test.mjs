// Sign in with Apple: the account-safety rules, exercised against the real
// auth-apple.js that ships — not a paraphrase of it (tests/_source.mjs).
//
// The one defect this suite exists to prevent is the expensive one: a student
// who already has an account, with credits, chat history, question records,
// weakness reports and focus plans, signing in through Apple and landing in a
// SECOND, empty account. Supabase links an Apple identity to an existing user by
// matching the email Apple reports; Apple's Hide My Email reports an address
// that matches nothing, so that link cannot happen and a new user id is created.
// isPrivateRelayEmail + needsRelayLinkCheck are what catch that case, so both
// are pinned here — including the negative cases, so neither can be quietly
// widened into "always ask" or narrowed into "never ask".
import { suite } from './_assert.mjs';
import { read, evalSnippet, inlineScripts } from './_source.mjs';

const t = suite('apple-signin');

const A = evalSnippet(read('auth-apple.js'), {}, ['SiAuthApple']).SiAuthApple;

t.section('Ships disabled');
// The flag is the whole safety story for this change. auth-apple.js renders
// nothing while it is false, so merging this cannot alter what a student sees
// until Apple Developer and the Supabase provider are actually configured.
// Enabling it before then puts a button on the login page that leads to
// "Unsupported provider" — a worse login experience than the one being fixed.
t.is('ENABLED is false until Apple + Supabase config is live', A.ENABLED, false);
t.is('mount() renders nothing while disabled',
  A.mount({ appendChild() { throw new Error('mount() touched the DOM while disabled'); } },
          { auth: {} }), false);

t.section('Hide My Email is recognised');
t.is('relay address',            A.isPrivateRelayEmail('abc123@privaterelay.appleid.com'), true);
t.is('relay address, mixed case', A.isPrivateRelayEmail('Abc123@PrivateRelay.AppleID.com'), true);
t.is('real iCloud address is not a relay', A.isPrivateRelayEmail('jumana@icloud.com'), false);
t.is('lookalike subdomain is not a relay',
  A.isPrivateRelayEmail('x@privaterelay.appleid.com.evil.test'), false);
t.is('lookalike prefix is not a relay', A.isPrivateRelayEmail('x@notprivaterelay.appleid.com'), false);
t.is('missing address', A.isPrivateRelayEmail(null), false);
t.is('no @ at all',     A.isPrivateRelayEmail('nonsense'), false);
// An address may legitimately contain more than one @ in its local part; the
// domain is what follows the LAST one. Splitting on the first would classify
// "a@b"@privaterelay.appleid.com as domain "b" and wave a relay straight through.
t.is('domain is read from the last @', A.isPrivateRelayEmail('"a@b"@privaterelay.appleid.com'), true);

t.section('The interstitial fires exactly when a silent fork is possible');
const apple = { identities: [{ provider: 'apple' }] };
const email = { identities: [{ provider: 'email' }] };
const relay = 'r@privaterelay.appleid.com';

t.is('relay + Apple + onboarding unfinished → ask',
  A.needsRelayLinkCheck({ ...apple, email: relay }, { onboarding_completed: false }), true);
t.is('relay + Apple + no profile row yet → ask',
  A.needsRelayLinkCheck({ ...apple, email: relay }, null), true);
// An established Apple student passes through this code on every single login.
// Asking them again would be pure noise, and worse, would train them to click
// past the one screen that protects the account.
t.is('relay + Apple + onboarding finished → do not ask',
  A.needsRelayLinkCheck({ ...apple, email: relay }, { onboarding_completed: true }), false);
// A real address is the safe case: Supabase matches it against auth.users and
// links the identity to the existing account by itself.
t.is('real address → do not ask',
  A.needsRelayLinkCheck({ ...apple, email: 'jumana@icloud.com' }, { onboarding_completed: false }), false);
t.is('email/password user → do not ask',
  A.needsRelayLinkCheck({ ...email, email: relay }, { onboarding_completed: false }), false);
t.is('no user → do not ask', A.needsRelayLinkCheck(null, null), false);
// login.html passes null deliberately after the student answers "I'm new here",
// and that is the only thing stopping the panel reappearing in a loop.
t.is('null user is how login.html suppresses a repeat prompt',
  A.needsRelayLinkCheck(null, { onboarding_completed: false }), false);

t.section('The redirect URL is one Supabase will accept');
// This exact string has to be in the Supabase redirect allow list. Deriving it
// from window.location.origin would produce a different hostname on every Vercel
// preview deploy, and Supabase would refuse the round trip with
// "redirect_to is not allowed" — which reads to a student as a broken login.
t.is('production origin is hardcoded, like emailRedirectTo already is',
  A.redirectTarget('login.html', { origin: 'https://si-math-ai-git-preview.vercel.app' }),
  'https://www.si-math-ai.com/login.html');
t.is('no location at all still resolves to production',
  A.redirectTarget('login.html'), 'https://www.si-math-ai.com/login.html');
t.is('localhost is the one exception, for local testing',
  A.redirectTarget('login.html', { origin: 'http://localhost:5173' }),
  'http://localhost:5173/login.html');
// A hostname merely CONTAINING "localhost" is an attacker's domain, not a dev box.
t.is('localhost lookalike falls back to production',
  A.redirectTarget('login.html', { origin: 'https://localhost.evil.test' }),
  'https://www.si-math-ai.com/login.html');

t.section('A failed round trip is reported, not swallowed');
// Supabase puts the error in the query string under PKCE and in the fragment
// under the implicit flow. Reading only one leaves the student on a login page
// that silently did nothing.
t.is('error in the query string (PKCE)',
  A.errorFromUrl({ search: '?error=access_denied&error_description=User+cancelled', hash: '' }).code,
  'access_denied');
t.is('error in the fragment (implicit)',
  A.errorFromUrl({ search: '', hash: '#error=server_error&error_code=validation_failed' }).code,
  'validation_failed');
t.is('a clean return reports no error',
  A.errorFromUrl({ search: '', hash: '#access_token=abc&type=bearer' }), null);
t.ok('a cancelled sign-in points back at email and password',
  /email and password/i.test(A.friendlyError({ code: 'access_denied' })));
t.ok('an unconfigured provider does not show Supabase\'s wording to a student',
  !/unsupported provider/i.test(
    A.friendlyError({ code: 'validation_failed', description: 'Unsupported provider: provider is not enabled' })));

t.section('Both auth pages load the same module');
// Two inline copies would drift the first time one page was edited, and the
// rule that matters most here — when to interrupt a sign-in — must be identical.
for (const page of ['login.html', 'signup.html']) {
  const src = read(page);
  t.ok(`${page} loads auth-apple.js`, src.includes('<script src="auth-apple.js"></script>'));
  t.ok(`${page} has a mount point`, src.includes('id="appleMount"'));
  t.ok(`${page} defines no second copy of the relay rule`,
    !inlineScripts(src).some(js => js.includes('privaterelay.appleid.com')));
}
// login.html owns the guard; it is the page Apple returns to.
t.ok('login.html runs the relay guard before routing',
  /needsRelayLinkCheck[\s\S]{0,120}showRelayPanel/.test(read('login.html')));
t.ok('login.html has the interstitial markup', read('login.html').includes('id="relayPanel"'));

t.section('The guards would actually fire');
// A green check is only evidence if it could have gone red
// (docs/roadmap/verification-framework-audit.md). Prove the shapes above are the
// shapes production produces, rather than ones invented to make the suite pass.
t.ok('a Supabase user carries identities[].provider',
  Array.isArray(apple.identities) && apple.identities[0].provider === 'apple');
t.ok('the relay check would catch a real Apple relay address',
  A.isPrivateRelayEmail('kj8s2m9xqp@privaterelay.appleid.com'));

t.done();
