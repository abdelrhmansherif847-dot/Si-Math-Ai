# Supabase Auth email templates — Si Math AI

**These files are NOT applied.** They are the reviewed source for what should be
pasted into Supabase → Authentication → Email Templates, or PATCHed via the
Management API. Nothing here changes production until someone does that
deliberately. Keeping them in the repo is the only way the templates get code
review, a history, and a diff — the dashboard gives none of those.

Authored 2026-08-21 alongside `docs/engineering/email-deliverability-audit.md`,
which explains why the stock templates were getting filtered by iCloud.

## What each file is for

| File | Supabase template | Management API key |
|---|---|---|
| `confirmation.html` | Confirm sign up | `mailer_templates_confirmation_content` |
| `recovery.html` | Reset password | `mailer_templates_recovery_content` |

Subjects to set alongside them:

- `mailer_subjects_confirmation`: `Confirm your email to start studying — Si Math AI`
- `mailer_subjects_recovery`: `Reset your Si Math AI password`

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

## Applying them

Paste into the dashboard, or:

```bash
export SUPABASE_ACCESS_TOKEN="…"   # https://supabase.com/dashboard/account/tokens
export PROJECT_REF="igvkyxkmjnkzscqgommj"
curl -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
        --arg c "$(cat confirmation.html)" \
        --arg r "$(cat recovery.html)" \
        '{mailer_templates_confirmation_content:$c,
          mailer_templates_recovery_content:$r,
          mailer_subjects_confirmation:"Confirm your email to start studying — Si Math AI",
          mailer_subjects_recovery:"Reset your Si Math AI password"}')"
```

Read the current values back before overwriting, so the change is reversible:

```bash
curl -sX GET "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | jq 'to_entries|map(select(.key|startswith("mailer_")))|from_entries' > mailer-config-backup.json
```

**Keep Resend's open and click tracking OFF.** Both are off today. Click tracking
rewrites every href through Resend's domain, which breaks the one-link-domain
rule above and, per Supabase's own docs, can break auth links outright.
