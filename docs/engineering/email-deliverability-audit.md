# Email deliverability and confirmation flow — audit

**Audited 2026-08-21**, non-destructively, against the live project
(`igvkyxkmjnkzscqgommj`), the Resend account that sends its mail, and the GoTrue
source the hosted service runs. **Nothing was changed.** No user was confirmed,
no identity deleted, no template applied.

Companion to `apple-signin-audit.md`. That one covers Apple; this one covers the
underlying defect Apple sign-in only routes around.

---

## 0. Root cause, in one paragraph

The confirmation email reaches iCloud and is never seen. It is authenticated
correctly, so it is not rejected — it is filed. Three properties of the message
cause that, and all three come from the fact that **the project is running
Supabase's stock default template, unmodified**: the only visible link points at
`supabase.co` while the From address is `si-math-ai.com`; the body is three lines
of bare HTML with no branding, no context and no sender identity; and Supabase's
mailer sends a single `text/html` part with no plain-text alternative. Separately,
the login flow turns a filtered email into a **hard lockout**, because
`signInWithPassword` refuses with `email_not_confirmed` and the only recovery
offered is a resend of the same unseen email — which rate-limits after two taps.

**The email problem is the root cause. Apple sign-in is a second door, not a
fix.** Password reset, email change, and every future notification travel the
same path.

## 1. The template and the link, exactly as sent

Pulled from Resend (message `37583228-…`, sent 2026-08-21T19:24:41Z):

```
From:    "Si Math Ai" <noreply@si-math-ai.com>
Subject: Confirm your email address
Body:    <h2>Confirm your email address</h2>
         <p>Follow the link below to confirm this email address and finish signing up.</p>
         <p><a href="https://igvkyxkmjnkzscqgommj.supabase.co/auth/v1/verify
            ?token=…&type=signup&redirect_to=https://www.si-math-ai.com/login.html">
            Confirm email address</a></p>
```

That body is **byte-for-byte Supabase's documented default**
(`mailer_templates_confirmation_content` in the Email Templates guide). No
customisation has ever been applied to this project's auth email.

- **Link domain:** `igvkyxkmjnkzscqgommj.supabase.co` — an opaque project ref.
- **From domain:** `si-math-ai.com`.
- **These do not match**, which is the single strongest structural signal the
  message has in common with phishing.

**Prefetch is ruled out.** Supabase confirms an account on a plain `GET` of that
URL, so a scanner following the link would have confirmed the student. All three
iCloud accounts still have `email_confirmed_at IS NULL`. Nothing ever fetched it.
The mail was filed, not consumed.

## 2. SPF, DKIM, DMARC

| Record | Status | Source |
|---|---|---|
| **DKIM** `resend._domainkey.si-math-ai.com` | ✅ verified | Resend API |
| **SPF** `send.si-math-ai.com TXT v=spf1 include:amazonses.com ~all` | ✅ verified | Resend API |
| **SPF MX** `send.si-math-ai.com → feedback-smtp.us-east-1.amazonses.com` | ✅ verified | Resend API |
| **DMARC** `_dmarc.si-math-ai.com` | ✅ **exists: `v=DMARC1; p=none;`** | Owner, from Namecheap, 2026-08-22 |

**Resolved 2026-08-22.** The owner read the live zone in Namecheap: the record
exists. All four records are correct, mail from `si-math-ai.com` is fully
authenticated and DMARC-aligned, and **no DNS change should be made** — a second
`_dmarc` TXT would make the policy ambiguous. This closes the authentication
hypothesis: authentication was already correct throughout the period in which all
three iCloud students failed to receive their confirmations. The remaining causes
are sender reputation and message content — see
`phase1-email-fix-runbook.md` §0a.

The original caveat is kept below because it explains why the check was deferred
to the owner rather than performed here.

**At audit time I could not check it.** Outbound DNS is blocked
from the audit environment — `dig`, and DNS-over-HTTPS to both Google and
Cloudflare, were all refused by the network proxy. Resend's API lists only the
three records it requires for verification, and DMARC is not one of them, so its
absence from that list is **not** evidence of absence in DNS.

Run this yourself before acting on §3:

```bash
dig +short TXT _dmarc.si-math-ai.com
```

- **Output empty** → no DMARC policy. Add the record in §3. Apple, Google and
  Microsoft all weight an unauthenticated-by-policy domain more harshly, and
  since 2024 both Google and Yahoo require DMARC for bulk senders.
- **Output starts `v=DMARC1`** → a policy exists; record the `p=` value and skip
  the DMARC line in §3.

## 3. Alignment, and the DNS to add

Alignment is **correct as configured**, and this is worth stating plainly because
it is the part people usually get wrong:

- The visible `From:` is `noreply@si-math-ai.com` → header domain `si-math-ai.com`.
- DKIM signs with `d=si-math-ai.com` (the selector lives at
  `resend._domainkey.si-math-ai.com`) → **DKIM aligns strictly.**
- The Return-Path is on `send.si-math-ai.com` → **SPF aligns in relaxed mode**
  (same organisational domain), which is DMARC's default.

So DMARC would **pass** on DKIM today. The gap is that no policy is published to
be evaluated against — assuming §2's check comes back empty.

**Add, at the DNS host for `si-math-ai.com`:**

```
Type:  TXT
Name:  _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@si-math-ai.com; fo=1; adkim=r; aspf=r
TTL:   3600
```

Start at `p=none`. It changes no delivery behaviour — it only asks receivers to
report. Read the aggregate reports for two weeks, confirm 100% of legitimate mail
passes, then move to `p=quarantine` and later `p=reject`. **Do not start at
`p=reject`:** if any other system sends as `si-math-ai.com` — a form handler, a
help-desk tool — you will silently destroy its mail.

`rua=` needs a mailbox that can receive. `si-math-ai.com` currently has **no MX
record** as far as Resend's config shows (receiving is disabled on the domain), so
either point `rua` at an address you actually read, or set up receiving first.

No other DNS change is needed. SPF and DKIM are already correct.

## 4. Resend

| | |
|---|---|
| Domain | `si-math-ai.com`, **verified**, added 2026-06-18 |
| Sending | enabled, region `us-east-1` |
| Open tracking | **off** ✅ |
| Click tracking | **off** ✅ |
| Receiving | disabled |
| Recent sends | 10 in the log; 9 `delivered`, 1 `bounced` (`roqa97523@gmail.com`, a typo address) |

Resend is configured and authenticating correctly. **Both tracking options must
stay off.** Click tracking rewrites every `href` through Resend's domain, which
would break the one-link-domain rule and, per Supabase's own documentation, can
break auth links outright.

Note what the `delivered` status means and does not mean: the receiving server
accepted the message. It says nothing about which folder it landed in. Both of the
iCloud confirmations read `delivered`, and neither was ever opened.

## 5. Hosting auth links on our own domain

**Supported, at no cost, and it is the highest-value fix available.** It does not
require Supabase's paid Custom Domains add-on.

Supabase exposes `{{ .TokenHash }}` in email templates precisely so the link can
point at your own site. The flow becomes:

1. Template links to `{{ .SiteURL }}/confirm.html?token_hash={{ .TokenHash }}&type=email`.
2. `confirm.html` — a new page on `www.si-math-ai.com` — reads the parameters and
   calls `supabase.auth.verifyOtp({ token_hash, type: 'email' })`.
3. On success it has a session and routes into onboarding, exactly like
   `login.html` does today.

What that buys:

- The visible link domain becomes `si-math-ai.com`, matching the From address.
  This is the single biggest structural change available to inbox placement.
- It removes the prefetch hazard permanently: `verifyOtp` is a `POST`, so a
  scanner following the link with `GET` cannot consume the token.
- The student lands on a branded page, not a Supabase redirect.

**This is a real behaviour change and is deliberately not implemented here.** It
needs `confirm.html` built, `reset-password.html` reworked onto the same
mechanism, the templates switched, and the whole thing tested — including the
window where old-style links are still in flight in people's inboxes. It belongs
in its own change, after §6 lands and is measured.

The paid Custom Domains add-on (`auth.si-math-ai.com` fronting the Supabase
endpoint) achieves a similar domain match, but costs money, still leaves the
prefetch hazard, and is strictly worse than the above.

## 6. The improved templates

Written, reviewed, **not applied**: `docs/engineering/email-templates/`
(`confirmation.html`, `recovery.html`, and a `README.md` covering the rules they
follow and how to apply and roll them back).

They keep `{{ .ConfirmationURL }}`, so **behaviour is unchanged** — same link,
same mechanism, same everything. Only the message around it changes: a real
preheader, the Si Math AI wordmark as text, a proper explanation of why the mail
arrived, a button, the full URL printed as readable text beneath it, and a
one-use/ignore-if-unexpected note.

**One correction to the brief.** A plain-text alternative cannot be supplied
through Supabase. GoTrue's mailer calls `SetBody("text/html", body)` and never
`AddAlternative`
(`internal/mailer/mailmeclient/mailmeclient.go`), so every auth email is a single
`text/html` part regardless of what we write. Resend derives a text version from
the HTML — that is the "Plain Text Content" visible in the Resend record. What we
*can* control is how well it derives: short block-level paragraphs, and the URL
present as literal text rather than only as an `href`. The templates are written
for that, and it is the reason the raw link is printed under the button.

## 7. What to do, in order

1. `dig +short TXT _dmarc.si-math-ai.com`. Add the record from §3 if empty.
2. Apply the §6 templates (back up the current config first — the README has the
   command).
3. Send a real test to an iCloud address and check whether it lands in Inbox or
   Junk. **This is the measurement that decides whether steps 1–2 worked.**
4. Only if it still lands in Junk, do §5 — the own-domain link.
5. Then release the three locked-out students, using whichever route step 3
   proved works. Not before: releasing them through a channel that is still
   broken teaches us nothing and burns the students' patience twice.

Steps 1–3 are reversible and touch no user data. Step 5 does touch production and
needs its own approval.
