# Supabase Auth email templates — Si Math AI

**These files are LIVE in production as of 2026-08-22**, applied and verified one
key at a time. They remain the reviewed source: edit here, then re-apply with
`scripts/mailer-apply.sh`. Editing the Supabase dashboard directly puts production
out of step with this repository and leaves no diff to review. Keeping them in the repo is the only way the templates get code
review, a history, and a diff — the dashboard gives none of those.

Authored 2026-08-21 alongside `docs/engineering/email-deliverability-audit.md`,
which explains why the stock templates were getting filtered by iCloud.

## What each file is for

| File | Supabase template | Management API key |
|---|---|---|
| `confirmation.html` | Confirm sign up | `mailer_templates_confirmation_content` |
| `recovery.html` | Reset password | `mailer_templates_recovery_content` |

Subjects to set alongside them:

- `mailer_subjects_confirmation`: `Confirm your email to start studying - Si Math AI`
- `mailer_subjects_recovery`: `Reset your Si Math AI password`

## Two hard rules, both learned from production

Neither is a style preference. Each cost a production write to discover, and each
is enforced twice — in `scripts/mailer-apply.sh` at run time and in
`tests/mailer-config.test.mjs` in CI.

### 1. Every value must be pure ASCII

**This Management API path replaces non-ASCII characters.** Measured 2026-08-22: a
single-key apply of `mailer_subjects_confirmation` returned HTTP 200, and both the
PATCH response and an independent no-cache GET showed the em dash `U+2014`
(`e2 80 94`) stored as `U+FFFD` (`ef bf bd`) — the replacement character. A student
would have received a subject line reading `start studying <?> Si Math AI`.

So: **no literal typographic characters anywhere in a subject or a template.** Use
HTML entities in bodies — `&mdash;`, `&middot;`, `&nbsp;` all render correctly in
email and are themselves ASCII. Subjects have no entity escape, so a subject must
use plain ASCII punctuation: `-`, not `—`.

`mailer-apply.sh` refuses to send any value containing a byte above `0x7F`, and
prints its hex so the offending character is unambiguous.

### 2. Supabase stores these values with CRLF line endings

The server canonicalises `\n` to `\r\n`. Measured on the same day: a 3376-byte
template came back as 3423 bytes from both the PATCH response and a no-cache GET,
first difference at byte 154 — the template's first newline — and the template
contains exactly 47 LF characters. 3376 + 47 = 3423. The recovery template behaved
identically: 3396 + 47 = 3443.

**Content is not altered; only line-ending style is.** Verification therefore
compares with line endings normalised, while still reporting the raw byte counts
and hashes, so a genuine content change cannot hide behind "it's only CRLF". Do
not "fix" a CRLF difference by editing these files — it is the server's doing and
it is harmless.

## Rules these files follow, and why

1. **No images.** Every mail client blocks remote images by default, so an
   image-based header renders as a broken box on first open — which is itself a
   spam signal. The wordmark is text.
2. **No external CSS, no `<style>` block, no web fonts.** Inline attributes only.
   Gmail strips `<style>` in some contexts and Outlook ignores most of it.
3. **One link domain per message**, and the visible URL is printed in full
   underneath the button. A student who does not trust a button can read where it
   goes; a filter that compares anchor text to href finds them consistent.
4. **A real preheader.** The first text in the body is what iCloud and Gmail show
   in the message list. The stock template's preheader was the literal words
   "Confirm your email address", which reads as machine-generated.
5. **Degrades to good plain text.** Supabase's mailer sends `text/html` **only**
   — `mailmeclient.go` calls `SetBody("text/html", …)` and never
   `AddAlternative`, so there is no way to supply a `text/plain` part through
   Supabase at all. Resend derives one from the HTML. Structuring the HTML as
   short block-level paragraphs, with the URL present as text, is what makes that
   derived version readable rather than a wall of markup.
6. **`{{ .ConfirmationURL }}` is kept as-is** so behaviour is identical to today.
   Moving the link onto `si-math-ai.com` is a separate, larger change — see
   §5 of the deliverability audit — and must not be smuggled in with a copy edit.

## Two things deliberately NOT changed

**The authentication mechanism.** Both templates use `{{ .ConfirmationURL }}` exactly as the
current Supabase flow expects. No `TokenHash`, no `confirm.html`, no `verifyOtp`, no
custom-domain auth links. Same URL, same token, same redirect, same flow — which is what keeps
this step reversible and keeps the iCloud delivery test that follows it interpretable.

**The reset email's expiry wording.** It says "expires shortly" rather than a duration. The
real value is Supabase's `mailer_otp_exp`, and it is not reachable from a database connection:
the `auth` schema has no config table, and `auth.one_time_tokens` records creation time only —
GoTrue computes expiry at verify time and never stores it. Reading it requires the Management
API with an access token, or the dashboard under Authentication → Email. **Do not substitute a
guessed number.** If someone reads the real value, the line can be made exact.

## Editing these files

Use a real editor or a Python replacement, **not `sed`**. An earlier `sed` substitution here
contained `&mdash;`, and `&` is sed's metacharacter for the entire match: it duplicated a
paragraph, leaked confirmation copy into the reset email, and left a bare `mdash;` rendering as
text. The corruption was invisible in the diff and only surfaced when the visible text was
extracted and read back. After any edit, extract the text and check tag balance rather than
trusting the patch.

## Applying them

**Use the scripts. Do not hand-write a `curl`.**

An earlier version of this file recommended a single `curl` that PATCHed all four
keys at once and read nothing back. That is exactly the procedure that produced a
failure nobody could explain: HTTP 200, three of four keys apparently unchanged,
and the response body — the only evidence of what the server actually did —
discarded. Recovering from it took several diagnostic cycles.

```bash
export SUPABASE_ACCESS_TOKEN="…"   # https://supabase.com/dashboard/account/tokens

bash scripts/mailer-backup.sh                    # snapshot + 7 checks that it can restore
bash scripts/mailer-apply.sh --dry-run           # read-only: what would change
bash scripts/mailer-apply.sh --only <one-key>    # one key at a time, verified
bash scripts/mailer-apply.sh                     # or all four, still one PATCH each
```

The scripts enforce what a hand-written command cannot: a verified backup must
exist first; values must be ASCII; templates must still contain exactly two
`{{ .ConfirmationURL }}` and must not mention `TokenHash`, `verifyOtp` or
`confirm.html`; and **every write is verified against both the PATCH response body
and an independent no-cache GET**. HTTP 200 alone is not evidence that anything
was stored — that was established the hard way.

Rolling back is `scripts/mailer-restore.sh`. It is deliberately gated now that
production holds a verified rollout; see the header of that script.

**Keep Resend's open and click tracking OFF.** Both are off today. Click tracking
rewrites every href through Resend's domain, which breaks the one-link-domain
rule above and, per Supabase's own docs, can break auth links outright.
