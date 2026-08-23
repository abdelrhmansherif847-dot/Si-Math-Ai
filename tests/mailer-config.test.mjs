// Everything that gets sent to Supabase's auth-config API must be pure ASCII.
//
// This is not a style rule. It was measured in production on 2026-08-22: a
// single-key apply of `mailer_subjects_confirmation` returned HTTP 200, and both
// the PATCH response and an independent no-cache GET showed the em dash U+2014
// (e2 80 94) stored as U+FFFD (ef bf bd) — the replacement character. The write
// succeeded and the bytes did not survive it. A student would have received a
// subject line reading "start studying <?> Si Math AI".
//
// The em dash was caught because someone was reading a diff. The next one might
// not be, so the rule is enforced here as well as at run time in
// scripts/mailer-apply.sh. HTML entities are the ASCII-safe way to get typography
// into an email body: &mdash; and &middot; render correctly and are themselves
// ASCII.
import { spawnSync } from 'node:child_process';
import { suite } from './_assert.mjs';
import { REPO, read } from './_source.mjs';

const t = suite('mailer-config');

const TEMPLATES = [
  'docs/engineering/email-templates/confirmation.html',
  'docs/engineering/email-templates/recovery.html',
];
const APPLY = 'scripts/mailer-apply.sh';

/** Every non-ASCII character in a string, with its code point. */
const nonAscii = (s) =>
  [...new Set([...s].filter((c) => c.codePointAt(0) > 0x7f))]
    .map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);

t.section('Nothing sent to the API contains a byte the API will mangle');

for (const f of TEMPLATES) {
  t.is(`${f.split('/').pop()} is pure ASCII`, nonAscii(read(f)), []);
}

// The subjects are literals in the apply script rather than files, so they have
// to be extracted from it — and extracted from the real script, not restated,
// or this suite would pass while production shipped something else.
const applySrc = read(APPLY);
const subjects = [...applySrc.matchAll(/^(SUBJ_\w+)="([^"]*)"/gm)]
  .map(([, name, value]) => ({ name, value }));

t.is('both subject literals were found in the script', subjects.length, 2);
for (const { name, value } of subjects) {
  t.is(`${name} is pure ASCII`, nonAscii(value), []);
}
t.is('the confirmation subject uses an ASCII hyphen, not an em dash',
  subjects.find((s) => s.name === 'SUBJ_CONF')?.value,
  'Confirm your email to start studying - Si Math AI');

t.section('The run-time guard is present too');
// CI catches a bad commit; the run-time check catches a value edited locally and
// applied without committing. Both are wanted.
t.ok('mailer-apply.sh defines assert_ascii', /^assert_ascii\(\)/m.test(applySrc));
t.ok('assert_ascii is actually invoked over the keys in play',
  /for _k in "\$\{KEYS\[@\]\}"; do assert_ascii/.test(applySrc));
t.ok('the guard explains itself with the production evidence',
  /U\+FFFD|replacement character/.test(applySrc));

t.section('Template invariants that must not drift');
for (const f of TEMPLATES) {
  const src = read(f);
  const n = (src.match(/\{\{ \.ConfirmationURL \}\}/g) || []).length;
  t.is(`${f.split('/').pop()} keeps exactly 2 ConfirmationURL (auth flow unchanged)`, n, 2);
  t.ok(`${f.split('/').pop()} does not switch to another auth flow`,
    !/TokenHash|verifyOtp|confirm\.html/.test(src));
  // noreply@si-math-ai.com cannot receive: the domain has receiving disabled.
  t.ok(`${f.split('/').pop()} never invites a reply`,
    !/reply to this email/i.test(src));
}

t.section('The checks could go red');
// verification-framework-audit.md: a green check is only evidence if it could
// have failed. Prove each detector fires on the exact defect it was written for.
t.is('nonAscii() detects the em dash that production mangled',
  nonAscii('start studying — Si Math AI'), ['U+2014']);
t.is('nonAscii() detects the replacement character the server returned',
  nonAscii('start studying � Si Math AI'), ['U+FFFD']);
t.ok('the ConfirmationURL counter would notice a TokenHash swap',
  ((`<a href="{{ .TokenHash }}">`).match(/\{\{ \.ConfirmationURL \}\}/g) || []).length !== 2);
t.ok('the reply detector would fire on the wording that was removed',
  /reply to this email/i.test('Need help? Reply to this email.'));

t.section('The stored-value comparison distinguishes formatting from content');
// Supabase stores these values with CRLF line endings. Measured 2026-08-22: a
// 3376-byte template came back as 3423 bytes from both the PATCH response and an
// independent no-cache GET, first difference at byte 154 — the template's first
// newline — and 3423 - 3376 = 47, exactly its LF count. Every LF gained a CR.
//
// So byte-exact equality is the wrong success test: it can never pass, and
// treating it as failure would make the rollout impossible to complete. But a
// real content change must not hide behind "it's only line endings" either.
//
// This runs the shell script's OWN comparison functions via --self-test, with no
// token, no network and no files, rather than reimplementing them here — a
// reimplementation can agree with itself while production disagrees.
const selfTest = spawnSync('bash', ['scripts/mailer-apply.sh', '--self-test'], {
  cwd: REPO, encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: undefined },
});
t.is('mailer-apply.sh --self-test exits 0', selfTest.status, 0);
const out = (selfTest.stdout || '') + (selfTest.stderr || '');
t.ok('self-test needs no token and no network', !/SUPABASE_ACCESS_TOKEN is not set/.test(out));
for (const expected of [
  'identical values are EXACT',
  'LF -> CRLF is NORMALIZED, not a content change',
  'lone CR is normalized to LF',
  'a real word change is TRANSFORMED',
  'content change PLUS CRLF is still TRANSFORMED',
  'truncation is TRANSFORMED',
  'empty stored value is TRANSFORMED',
  'the em dash corruption is TRANSFORMED',
]) {
  t.ok(`self-test covers: ${expected}`, out.includes(`PASS  ${expected}`));
}
t.ok('self-test reports overall success', out.includes('self-test OK'));

// The verifier must actually USE the three verdicts, not merely define them.
const apply = read('scripts/mailer-apply.sh');
for (const verdict of ['MATCHES SENT EXACTLY',
                       'MATCHES AFTER LINE-ENDING NORMALIZATION',
                       'CONTENT TRANSFORMED']) {
  t.ok(`verdict wired in: ${verdict}`, apply.includes(verdict));
}
t.ok('a NORMALIZED result still prints the raw byte hashes for audit',
  /normalized     : sent sha256/.test(apply));
t.ok('only CONTENT TRANSFORMED fails the run',
  /content differs beyond line endings[\s\S]{0,200}fail=1/.test(apply));

t.section('The self-test could go red');
// Break the classifier in a copy and confirm --self-test notices. Without this,
// "self-test OK" proves only that the script printed those words.
import('node:fs').then(() => {});
const broken = apply.replace(
  "  elif [ \"$(norm_eol \"$1\")\" = \"$(norm_eol \"$2\")\" ]; then\n    echo NORMALIZED",
  "  elif false; then\n    echo NORMALIZED");
t.ok('the sabotage actually changed the script', broken !== apply);
const tmp = `${REPO}/.selftest-sabotage.sh`;
import('node:fs').then(({ writeFileSync, unlinkSync }) => {
  writeFileSync(tmp, broken);
  const r = spawnSync('bash', [tmp, '--self-test'], { cwd: REPO, encoding: 'utf8' });
  unlinkSync(tmp);
  t.ok('a broken classifier makes --self-test fail', r.status !== 0);
  t.done();
});
