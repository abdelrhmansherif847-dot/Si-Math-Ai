# Phase 1 — fix email confirmation. Runbook.

**Nothing in this file has been executed.** It is the reviewed plan for the
manual steps, written so each one can be checked off and so a failure at any
point is diagnosable rather than mysterious.

Decision of record (2026-08-21): **Apple Sign In stays OFF until Phase 1 is
done and measured.** `auth-apple.js` keeps `ENABLED = false`. Authentication
behaviour is unchanged by everything below except step 3, which changes the
wording of one email and nothing else.

Why this order and not the other one: linking an **unconfirmed** account to Apple
wipes its password (`apple-signin-audit.md` §3, case B). That leaves the student
Apple-only, with password reset — over this same broken email channel — as their
only fallback. Shipping Apple first would make the locked-out students depend on
the thing that is broken.

---

## 0a. Diagnosis after the DNS check (updated 2026-08-22)

Step 1 eliminated the most likely cause, so the remaining ones are worth naming
honestly, in order of how much they probably contribute:

1. **The sending domain has almost no reputation.** `si-math-ai.com` was added to
   Resend on 2026-06-18 and has sent **10 emails in total**. iCloud is unusually
   strict with domains it has no history for, and 10 messages over two months is
   indistinguishable from a domain that has just started sending. There is no
   quick fix for this — it improves with consistent, wanted mail over time — and
   at this volume conventional "warming" is not really available.
2. **The link domain does not match the sender.** From is `si-math-ai.com`; the
   only link points at `igvkyxkmjnkzscqgommj.supabase.co`. This is the largest
   remaining *content* signal, and it is the one step 6 fixes.
3. **The message body is three lines of bare HTML** with no preheader, no sender
   identity, no context, and a single naked link — structurally very close to the
   shape of a phishing template. Step 3 fixes this.
4. **No `text/plain` part.** Supabase's mailer sends `text/html` only and cannot
   be configured otherwise (`mailmeclient.go`). Resend derives one; how good that
   derivation is depends on the HTML, which step 3 also addresses.
5. **Shared IP pool.** Resend sends via shared Amazon SES IPs, so the domain's own
   reputation carries more weight than it would on a dedicated IP.

**Set expectations accordingly: step 3 alone may not be enough.** It addresses
causes 2 (partly), 3 and 4, and it is cheap and reversible, which is why it goes
first. But if cause 1 dominates, the honest answer is that placement improves
gradually rather than at a stroke, and step 6 becomes the next lever.

## Step 1 — Read the three DNS records ✅ DONE 2026-08-22

**Checked in Namecheap. All four records are present and correct. No DNS change
is needed, and none should be made** — a second `_dmarc` TXT record would make
the policy ambiguous and receivers may then ignore DMARC entirely.

| Record | Host | Live value | |
|---|---|---|---|
| DMARC | `_dmarc` | `v=DMARC1; p=none;` | ✅ **exists** |
| DKIM | `resend._domainkey` | present | ✅ |
| SPF (TXT) | `send` | `v=spf1 include:amazonses.com ~all` | ✅ |
| SPF (MX) | `send`, priority 10 | Resend / Amazon SES feedback | ✅ |

**This closes the authentication hypothesis.** Mail from `si-math-ai.com` is
fully authenticated and DMARC-aligned, and it was already so while all three
iCloud students failed to receive their confirmations. Whatever is filing those
messages, it is not a missing DNS record. See §0a for where that leaves the
diagnosis.

The original instructions are kept below for the record.

<details>
<summary>Original step 1 instructions (superseded — do not act on these)</summary>

Run these four commands. They read; they change nothing.

```bash
dig +short TXT _dmarc.si-math-ai.com          # DMARC   — expected: UNKNOWN
dig +short TXT send.si-math-ai.com            # SPF     — expected: present
dig +short MX  send.si-math-ai.com            # SPF MX  — expected: present
dig +short TXT resend._domainkey.si-math-ai.com   # DKIM — expected: present
```

No `dig`? Use `nslookup -type=TXT _dmarc.si-math-ai.com`, or paste the hostname
into https://mxtoolbox.com/SuperTool.aspx.

### What each must contain

| Record | Host / Name | Expected value | Verified |
|---|---|---|---|
| **DKIM** | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCjCk8If1kl760c70MrcakMY3uE4GC4pocuRZWsJB9H0CiEymPatNNswAM1Dr3LaTBqQC+YfgZHf0w0j1nlGQKQADtROv9XhC2Ebj0ZWW7nv++cmFcJHFMbevq2+ysU9oy6LAdor3X4R1L2DsKk5sQjqqrBSnfbat6zru7ycaXxWwIDAQAB` | ✅ Resend reports **verified** |
| **SPF (TXT)** | `send` | `v=spf1 include:amazonses.com ~all` | ✅ Resend reports **verified** |
| **SPF (MX)** | `send`, priority `10` | `feedback-smtp.us-east-1.amazonses.com` | ✅ Resend reports **verified** |
| **DMARC** | `_dmarc` | *see step 2* | ⚠️ **unknown — this is the one to check** |

DKIM and SPF are confirmed from Resend's own API, which reports the live DNS
state, so those two rows are trustworthy without re-checking. **DMARC is not in
that list because Resend does not require it for verification** — its absence
there is not evidence of absence in DNS. That is why step 1 exists.

### Where to look, per provider

First find out who serves the domain:

```bash
dig +short NS si-math-ai.com
```

| Nameservers look like | Provider | Where the records live |
|---|---|---|
| `ns1.vercel-dns.com` | **Vercel** | Dashboard → your project → **Settings → Domains** → `si-math-ai.com` → **DNS Records** |
| `*.ns.cloudflare.com` | **Cloudflare** | Dashboard → select `si-math-ai.com` → **DNS → Records** |
| `dns1.registrar-servers.com` | **Namecheap** | Domain List → Manage → **Advanced DNS** |
| `ns*.domaincontrol.com` | **GoDaddy** | My Products → DNS → **Manage Zones** |
| `ns-*.awsdns-*` | **Route 53** | Route 53 → Hosted zones → `si-math-ai.com` |

Two things that trip people up on every provider:

- **The `Name` field is relative.** Enter `_dmarc`, not
  `_dmarc.si-math-ai.com`. Typing the full name usually creates
  `_dmarc.si-math-ai.com.si-math-ai.com`, which silently does nothing.
  Cloudflare and Vercel both display the full name back to you after saving —
  check it reads `_dmarc.si-math-ai.com`.
- **On Cloudflare, TXT records are never proxied.** If an orange cloud appears,
  the record is in the wrong place.

Resend also shows the live state of the records it manages, at
**Resend → Domains → si-math-ai.com**. Use that as the cross-check for DKIM/SPF.

</details>

## Step 2 — Publish DMARC ❌ NOT NEEDED — a policy already exists

`_dmarc` already holds `v=DMARC1; p=none;`. **Do not add a second record.** RFC
7489 requires exactly one DMARC TXT record at `_dmarc`; two makes the policy
ambiguous and well-behaved receivers discard both, which would turn a working
setup into a broken one.

Whether to tighten `p=none` → `p=quarantine` later is a separate decision, and
not part of Phase 1. It would not help inbox placement for mail that already
passes DMARC — it only tells receivers what to do with mail that *fails*. Revisit
it once there is a `rua=` mailbox and a few weeks of reports.

<details>
<summary>Original step 2 instructions (superseded — do not act on these)</summary>

If `dig +short TXT _dmarc.si-math-ai.com` printed **nothing**, add:

```
Type:  TXT
Name:  _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@si-math-ai.com; fo=1; adkim=r; aspf=r
TTL:   3600
```

If it printed something starting `v=DMARC1`, a policy already exists — write down
the `p=` value and **skip this step**.

Notes that matter:

- **`p=none` changes no delivery behaviour.** It asks receivers to report, and
  nothing else. It is safe to publish today.
- **Do not start at `p=reject`.** If anything else sends as `si-math-ai.com` — a
  contact form, a help desk — reject will destroy its mail silently.
- **`rua=` needs a mailbox that receives.** `si-math-ai.com` has receiving
  disabled in Resend and no MX on the apex. Either point `rua` at an address you
  actually read, or drop the `rua=` term — the policy still works without it,
  you just get no reports.
- Alignment is already correct and needs no change: DKIM signs with
  `d=si-math-ai.com` (**strict** alignment) and the Return-Path is
  `send.si-math-ai.com` (**relaxed** alignment, DMARC's default). DMARC will pass
  on DKIM the moment a policy exists.
- Allow up to an hour for propagation. Re-run step 1 to confirm.

</details>

## Step 3 — Apply the branded template

Files for review: `docs/engineering/email-templates/`
(`confirmation.html`, `recovery.html`, `README.md`).

They keep `{{ .ConfirmationURL }}`, so the link, the mechanism and the flow are
**byte-for-byte what they are today**. Only the message around the link changes.

**Back up first** — the README has the command. Without the backup this step is
not reversible, because the dashboard keeps no history.

Approve the two files before anything is pasted.

## Step 4 — Test with a real iCloud mailbox

The measurement that decides whether steps 2–3 worked. **Use a fresh iCloud
address, not one of the three locked-out students.** Their accounts are evidence
of the current failure and must stay untouched until we have a working channel.

Prerequisites: a real `@icloud.com` address that has **never** been used on
si-math-ai.com, and access to its Junk folder on a device.

**Before you start**, empty the Junk folder and clear any existing rule for
`si-math-ai.com`, so the result is not contaminated by earlier filtering.

| # | Action | Record |
|---|---|---|
| 4.1 | Sign up at `https://www.si-math-ai.com/signup.html` with the test address | time, exact address |
| 4.2 | Wait 5 minutes. **Look in Inbox first, then Junk.** Do not search — searching finds mail that a student browsing their inbox never would | **Inbox / Junk / absent** |
| 4.3 | Check Resend → Emails for that send | `delivered` / `bounced` |
| 4.4 | Open the message on an **iPhone Mail** client, not only webmail — filtering differs | renders correctly? |
| 4.5 | Click the confirmation link | lands on `login.html` |
| 4.6 | `select email_confirmed_at from auth.users where email = '<test>'` | non-null |
| 4.7 | Log in with the password from 4.1 | reaches onboarding |
| 4.8 | Sign out, log in again | reaches dashboard |
| 4.9 | Trigger "Forgot password?" for the same address | Inbox / Junk / absent |
| 4.10 | Complete the reset and log in with the new password | succeeds |

Record 4.2 and 4.9 verbatim. **Inbox vs Junk is the entire result of Phase 1**;
everything else is a regression check on the flow.

Repeat 4.1–4.2 with a **second, different** iCloud address before concluding.
One delivery proves very little — iCloud's filtering is per-recipient and
reputation builds over time.

## Step 5 — Success criteria

Phase 1 is **done** when all of these hold:

1. **`dig +short TXT _dmarc.si-math-ai.com` returns a `v=DMARC1` record.**
2. **The confirmation email lands in the iCloud Inbox — not Junk — for two
   different fresh iCloud addresses.**
3. The full flow works end to end: signup → email received → link clicked →
   `email_confirmed_at` set → login → onboarding → dashboard.
4. Password reset (4.9–4.10) reaches the Inbox and completes.
5. No regression for existing users: a Gmail signup and a Gmail password reset
   still work, and no already-confirmed student is affected.
6. Resend shows `delivered` with no bounces or complaints for the test sends.

Phase 1 has **failed, and step 6 begins**, if the mail still lands in Junk after
steps 2 and 3 have propagated.

## Step 6 — Only if step 5 fails: move auth links onto our domain

`{{ .TokenHash }}` → `confirm.html` on `www.si-math-ai.com` → `verifyOtp`.
Design in `email-deliverability-audit.md` §5. This makes the visible link domain
match the From domain, which is the largest remaining structural signal, and it
also removes the link-prefetch hazard permanently because `verifyOtp` is a POST.

It is a real behaviour change — a new page, `reset-password.html` reworked onto
the same mechanism, and a migration window while old-style links are still live
in people's inboxes. Own change, own review. **Do not fold it into step 3.**

## What Phase 1 does NOT do

- Does not confirm the three locked-out students. That is Phase 3, and only after
  we have a channel proven to work.
- Does not delete the orphan or unconfirmed accounts.
- Does not enable Apple, or change `ENABLED`.
- Does not touch `handle_new_user()`, migrations, or any student data.
