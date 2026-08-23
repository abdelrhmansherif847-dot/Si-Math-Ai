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

## 0. Approved order (owner, 2026-08-22)

1. Review the branded template.
2. Back up the current Supabase mailer / template configuration.
3. Apply the approved template.
4. Test with **two fresh, independent** iCloud addresses.
5. Test confirmation placement and the full signup → confirmation → login flow.
6. Test password-reset delivery and flow.
7. Test Gmail for regressions.
8. **Only if** iCloud delivery still fails or lands in Junk, investigate the
   custom-domain `TokenHash → confirm.html → verifyOtp` flow.

Not now, under any of the above: no `TokenHash` implementation, no DNS change,
no Apple Sign In, no production change until step 1 is approved.

## 0a. Open hypotheses after the DNS check (updated 2026-08-22)

**None of the following is a finding. They are untested hypotheses**, listed so
the test in step 4 has something to discriminate between. They are deliberately
**not ranked** — there is no evidence yet that would justify an order, and an
invented one would get quoted back later as though it were measured.

Step 1 removed *one* candidate (a missing authentication record). What remains:

- **Sender reputation.** `si-math-ai.com` was added to Resend on 2026-06-18, and
  the Resend log returned **10 sends** when 25 were requested. A domain with
  little history is generally treated more cautiously by large receivers. What
  weight iCloud gives it here is **unknown** — this is an inference from low
  volume, not a measurement of Apple's behaviour, and Apple publishes no
  reputation signal we can read.
- **Link domain does not match the sender.** From is `si-math-ai.com`; the only
  link points at `igvkyxkmjnkzscqgommj.supabase.co`. Step 6 is what would fix it.
- **Message body structure.** Three lines of bare HTML, no preheader, no sender
  identity, no context, a single naked link. Step 3 addresses this.
- **No `text/plain` part.** Supabase's mailer sends `text/html` only and cannot be
  configured otherwise (`mailmeclient.go`); Resend derives one, and how good that
  derivation is depends on the HTML. Step 3 also addresses this.
- **Shared IP pool.** Resend sends via shared Amazon SES IPs. Whether this
  contributes at all is unknown.
- **Recipient-side filtering.** iCloud's Junk classification is partly
  per-recipient and learned. Three students is a very small sample, and their
  individual mailbox history is not observable to us.

**Consequence for expectations: step 3 may or may not be sufficient, and we
cannot say which in advance.** It is cheap, reversible, and addresses two of the
hypotheses outright — that is the argument for doing it first, not a prediction
that it will work. Step 4 is what turns any of this into evidence.

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

**What this does and does not establish.** It establishes that the domain's
authentication **configuration** looks correct, and that it was already in place
while the three iCloud students failed to receive their confirmations — so a
*missing record* is not the explanation.

It does **not** establish why iCloud filed those messages. Two limits are worth
being explicit about:

- Configured is not the same as passing. Nobody has read an
  `Authentication-Results` header from a message iCloud actually received. The
  records are right; whether every send authenticates cleanly in practice is
  untested.
- Ruling out one cause does not identify another. Everything in §0a is a
  **hypothesis**, and stays one until the iCloud test in step 4 produces
  evidence.

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

---

## Step 3a — Who runs the apply, and why not this session

**Approval received 2026-08-22. The apply could not be performed from the agent
session, and the reason is capability, not caution.**

| Needed | Available here |
|---|---|
| A Supabase **personal access token** | ❌ `SUPABASE_ACCESS_TOKEN` is unset; no `~/.supabase`; the `supabase` CLI is not installed |
| The Supabase **MCP** to change auth config | ❌ its surface is database, edge functions, branches, logs, docs and advisors — **no auth-config tool exists** |
| Network reach to `api.supabase.com` | ❌ blocked by the environment's egress proxy (`HTTP 403` on CONNECT) |
| Two fresh **iCloud mailboxes** | ❌ no mailbox access of any kind, and no way to click a link in someone's inbox or see whether it landed in Junk |

Three of those four are absolute. So Phase 1's apply and delivery tests are an
**owner-run** procedure. What this session could do instead is remove every piece
of judgement from it: the three scripts below are written, and were exercised end
to end against a mock Management API before being committed.

### The scripts

| Script | Does | Refuses to |
|---|---|---|
| `scripts/mailer-backup.sh` | Reads every live `mailer_*` key, writes `mailer-config-backup.json`, then runs seven checks proving the snapshot could restore | Overwrite an existing backup; succeed if any captured value is null |
| `scripts/mailer-apply.sh` | PATCHes exactly four keys — two templates, two subjects — then reads the config back and verifies all four match | Run without a verified backup; ship a template whose `{{ .ConfirmationURL }}` count is not 2, or that mentions `TokenHash`, `verifyOtp` or `confirm.html` |
| `scripts/mailer-restore.sh` | PATCHes every key from the backup and verifies the live template matches | Run without a backup, or report success if the live config still differs |

`mailer-config-backup.json` is gitignored: it is account configuration, and the
only copy of the pre-change templates.

### Verified before commit

Run against a local mock of `/v1/projects/{ref}/config/auth`:

- apply without a backup → refused, nothing sent
- backup → 7/7 checks pass, 6 `mailer_*` keys captured
- backup a second time → refused rather than clobbering the first
- apply → 4/4 read-back verifications pass, subjects and both templates live
- restore → live config returns byte-for-byte to the stock default
- a template switched to `TokenHash` → refused (`0 ConfirmationURL occurrences, expected 2`)
- an empty template file → refused
- a bad token → clean `HTTP 401`, "Nothing was changed", live config untouched

### The three commands

```bash
export SUPABASE_ACCESS_TOKEN=...        # dashboard → Account → Access Tokens
bash scripts/mailer-backup.sh           # step 1 + 2: back up and verify
bash scripts/mailer-apply.sh            # step 3: apply the approved templates
# if anything looks wrong at any point:
bash scripts/mailer-restore.sh          # full rollback
```

### What this session can still do

`C. Message inspection` is reachable from here — the Resend MCP is connected. Once
the test sends exist, this session can read each message record, its delivery
status, and the actual derived plain-text body, and compare that against the
reconstruction rather than assuming it. Send the tests, then say so.

Record results per provider and per flow — iCloud #1, iCloud #2, Gmail ×
confirmation, password reset — and **inbox vs Junk for each**, since that is the
measurement Phase 1 exists to make. Sent is not the same as delivered, and
delivered is not the same as seen.


---

## Step 3b — First apply attempt FAILED and was rolled back (2026-08-22)

**Production is at the pre-change baseline. Nothing is half-applied.**

### What happened

The owner ran backup (verified), then apply. The PATCH returned **HTTP 200**, and
read-back verification then failed on three of the four keys:

| Key | Read-back |
|---|---|
| `mailer_templates_confirmation_content` | ❌ FAIL |
| `mailer_templates_recovery_content` | ❌ FAIL |
| `mailer_subjects_confirmation` | ❌ FAIL |
| `mailer_subjects_recovery` | ✅ PASS |

`mailer-restore.sh` then completed successfully; the live confirmation template
matches the backup. Owner-reported live state after rollback: confirmation
subject `Confirm your email address`, recovery subject `Reset your password`,
confirmation template 184 chars, recovery template 254 chars — consistent with
Supabase's documented stock defaults (181 and 249 plus inter-tag whitespace).

### Diagnosis: unknown, and the tooling is why

**The cause cannot be determined from the evidence that exists**, because the
first version of `mailer-apply.sh` deleted `/tmp/mailer-apply.json` immediately
after reading the status code. The response body — the one artifact that would
say what the API did — was destroyed by the script that needed it. That is the
defect fixed here.

One hypothesis was formed and **falsified before being reported**: that the
failures correlated with non-ASCII content. They do not. Measured:

| Key | Non-ASCII | Result |
|---|---|---|
| `mailer_templates_confirmation_content` | none — pure ASCII | FAIL |
| `mailer_templates_recovery_content` | none — pure ASCII | FAIL |
| `mailer_subjects_confirmation` | `U+2014` em dash | FAIL |
| `mailer_subjects_recovery` | none — pure ASCII | PASS |

Two pure-ASCII values failed, so encoding does not explain it. The templates use
`&mdash;` and `&middot;` entities rather than literal characters.

Hypotheses that remain consistent with the evidence, **unranked and untested**:

- The API accepted the request and silently stored only some keys (size limit,
  validation, or a partial write).
- The API stored the values but rewrote them (sanitising, escaping, whitespace).
- Something in the owner's local environment differed from the mock harness this
  session tested against — locale, `jq`, `curl`, or shell version.

Note the last one is live: the identical payload round-tripped correctly through
a mock in this session's environment, so the pipeline itself is not inherently
broken.

### What changed in the tooling

`scripts/mailer-apply.sh` was rewritten so the next attempt is conclusive:

1. **`--dry-run`** — a GET-only comparison of live against intended, per key.
   Zero writes. Run this first; it may answer the question without a PATCH.
2. **One key per PATCH, verified individually** (`--batch` keeps the old
   behaviour). A partial acceptance becomes attributable to a specific key.
3. **Every response body is preserved**, token-redacted, under
   `mailer-diagnostics/`.
4. **Byte-level diagnostics on failure**: intended vs live byte count and
   sha256, the first differing byte with 48 bytes of `cat -v` context, and —
   the decisive one — a **verdict** comparing the live value against the
   pre-apply backup:
   - `UNCHANGED` → the API returned 200 and did not store the key.
   - `TRANSFORMED` → the API stored something different from both old and new.
5. `API` is now overridable in all three scripts, so they can be exercised
   against a local mock before ever pointing at production.

Scope, protections and the four keys are unchanged. A bug was also fixed in the
diff logic itself: it matched `differ: byte N`, but GNU and BSD `cmp` both print
`differ: char N`, so it had never found an offset and reported every mismatch as
a truncation.

### Harness results

Against a local mock of `/v1/projects/{ref}/config/auth` with switchable
behaviour:

| Scenario | Expected | Result |
|---|---|---|
| Mock stores only 1 of 4 keys — **the production symptom** | 3 FAIL / 1 PASS, verdict `UNCHANGED` | ✅ reproduced, verdict correct |
| Mock rewrites the em dash | `TRANSFORMED`, diff at the exact byte | ✅ byte 38, shows `M-bM-^@M-^T` → `--` |
| Mock truncates at 200 bytes | `TRANSFORMED`, reported as prefix | ✅ |
| Honest mock | 4/4 PASS, then dry-run reports all `ALREADY SET` | ✅ |
| Rollback after apply | live returns to baseline | ✅ |
| No backup present | refused | ✅ |
| Template switched to `TokenHash` | refused, in apply **and** dry-run | ✅ |
| Bad token | clean HTTP 401, stops, backup untouched | ✅ |
| Token in any saved diagnostics file | none | ✅ |

### The next attempt

```bash
export SUPABASE_ACCESS_TOKEN=...
bash scripts/mailer-apply.sh --dry-run     # read-only; send me the output
```

**Do not run apply until the dry-run output has been reviewed.** It establishes
exactly what the API currently holds for all four keys, which is the baseline the
previous attempt never captured.


---

## Step 3c — Management API contract, checked against the published spec

Requested after the dry-run confirmed all four values are still byte-identical to
the pre-apply backup. **No production write was made for this investigation.**

### Source

Supabase publishes the Management API's OpenAPI document inside the `supabase/cli`
repository: `packages/api/src/generated/openapi.json` (read at commit `44112f6`).
That is generated from the live API, so it is the contract itself rather than
prose about it. `api.supabase.com` is unreachable from this environment, so the
spec in the repo is the closest available primary source.

### Findings — three candidate explanations are eliminated

| Question | Answer | Evidence |
|---|---|---|
| Is `PATCH /v1/projects/{ref}/config/auth` the right endpoint? | **Yes** | Only `GET` and `PATCH` are defined on that path; `operationId` is `v1-update-auth-service-config` |
| Are the four keys writable through it? | **Yes, all four** | All present in `UpdateAuthConfigBody` (234 properties), each `type: string, nullable: true` |
| Is there a length, pattern or format constraint we violated? | **No** | None of the four declares `maxLength`, `minLength`, `pattern` or `format` |
| Is a different payload shape expected? | **No** | Flat object of scalar keys; `required` is empty, so a partial body is valid |

So *wrong endpoint*, *field not writable*, and *malformed payload* are ruled out.
The request the script sent matches the published contract.

### The finding that changes how we test

**A `200` from this endpoint returns the complete `AuthConfigResponse` — 237
properties, including all four of our keys.** Confirmed both in the spec and in
Supabase's own recorded end-to-end fixture
(`apps/cli-e2e/fixtures/recorded/PATCH_.../default.response.json`), whose body
carries `mailer_templates_confirmation_content`, `mailer_subjects_confirmation`
and the rest.

The PATCH response is therefore the server's own statement of what it now holds.
**The first attempt deleted it.** That single line is why a `200` with no
persisted change could not be explained: the answer was in the file the script
threw away.

### Cause: still undetermined, and deliberately not guessed

The contract is satisfied and the request was well-formed, so the remaining
explanations concern behaviour, not shape. Unranked, with what would confirm each:

| Hypothesis | Confirmed by |
|---|---|
| The server accepted and did not store — silent validation or a partial write | PATCH response shows the **old** value |
| The write landed; the read-back was stale — caching, or config still propagating | PATCH response shows the **new** value while the GET shows the old |
| Something in the local environment differed from the harness | Byte-level diff in the diagnostics |

One caveat on the earlier rollback, worth recording because it affects how much
that success proves: `mailer-restore.sh` verified that the live confirmation
template matched the backup — but the confirmation template had never changed, so
that check would have passed whether or not the restore wrote anything. It is a
green check that could not have gone red (`verification-framework-audit.md`).
Production being at baseline is well established by the later dry-run; the
restore's own self-check simply is not the evidence for it.

### Tooling change

`scripts/mailer-apply.sh` now checks the **PATCH response body** for each key
immediately, in addition to the later GET, and reconciles the two:

- response shows the new value, GET does not → prints a note that this points at
  a stale read rather than a rejected write, and says to re-run `--dry-run` in a
  few minutes **before** rolling back, because the change may in fact be live.
- response shows the old value → the server returned 200 and did not store it.
  Definitive, and attributable to a single key because keys go one per request.

GETs now also send `Cache-Control: no-cache` and `Pragma: no-cache`, which removes
an intermediary cache as a variable at no cost.

Harness: a mock with a `silent_ignore` mode (response echoes the old state) is
correctly reported as `*** response says NOT stored` for every key; a `stale_read`
mode (response shows new, GET lags) is correctly reported as
`response confirms stored` plus the two-sources-disagree note. Both were exercised
before commit.

### Recommended next step — smallest possible experiment

Any further evidence requires one write; there is no read-only way to observe a
write. The cheapest is **one key, the trivially reversible one**:

```bash
export SUPABASE_ACCESS_TOKEN=...      # use a freshly rotated token
bash scripts/mailer-apply.sh --dry-run
```

and then, only with approval, a single-key apply of `mailer_subjects_recovery` —
a 30-byte ASCII string, the one key that demonstrably stored last time. The
response body will then say plainly whether the server stores what it is sent.
**Do not run the full four-key apply until that question is answered.**


---

## Step 3d — The single-key diagnostic experiment (approved, not yet run)

Purpose: settle one question that no amount of reading can settle — **does this
API store what it is sent?** Approved by the owner as a single-key experiment;
this session did not execute it.

### Why `mailer_subjects_recovery`

- 30 bytes, pure ASCII. Nothing exotic to blame.
- Trivially reversible from the backup.
- It is the one key that appeared to store during the failed four-key attempt,
  so if it now fails, that failure is new information; if it succeeds, the
  difference lies in the other keys or in the batched request.

### What the flag does

`--only <key>` narrows the run to a single key, validated against the four
approved keys — a typo or any other setting is refused rather than sent. It
refuses to combine with `--batch`. Everything else is unchanged: the backup is
still required, the `ConfirmationURL` and `TokenHash` guards still run, and
`mailer-restore.sh` still reverts.

Both observations are now reported **separately, every time**, pass or fail:

```
  --- mailer_subjects_recovery
      sent           : 30 bytes  sha256:…
      PATCH response : 30 bytes  sha256:…   MATCHES SENT
      no-cache GET   : 19 bytes  sha256:…   DIFFERS FROM SENT
      sent           = Reset your Si Math AI password
      PATCH response = Reset your Si Math AI password
      no-cache GET   = Reset your password
```

Values of 120 bytes or fewer print in full, because a hash is useless to read and
these are short.

### How to read the result

| PATCH response | no-cache GET | Meaning |
|---|---|---|
| matches sent | matches sent | The API stores what it is sent. The four-key failure was about the other keys or the batched request. |
| matches sent | differs | The write landed; the read is stale or the config is still propagating. **Do not roll back** — re-run `--dry-run` a few minutes later. |
| differs | differs | The API returned 200 and did not store it. A genuine server-side rejection, now attributable to one key. |

The verdict line reads the PATCH response before deciding its wording, so it can
no longer say "did not store this key" about a write that the server itself
confirmed.

### Harness results before commit

| Scenario | Expected | Result |
|---|---|---|
| `--only` with a key outside the four | refused, exit 2 | ✅ |
| `--only` combined with `--batch` | refused | ✅ |
| `--only … --dry-run` | read-only, reports the one key | ✅ |
| Honest server | one PATCH containing exactly one key — verified from the mock's request log | ✅ `[["mailer_subjects_recovery"]]` |
| Server silently not storing | both sources differ; verdict "did not store" | ✅ |
| Server stores but GET lags | response matches, GET differs; verdict "write landed, read is stale" | ✅ |
| Four-key run still works | 4 PASS, four single-key PATCHes | ✅ |
| Backup missing | refused | ✅ |
| Rollback | completes | ✅ |
| Token in diagnostics | none | ✅ |

### The commands

Pull first — the response-preserving code is only in `796aa86` and later. The old
copy deletes the evidence.

```bash
git pull origin claude/apple-signin-auth-wysnha
export SUPABASE_ACCESS_TOKEN=...        # freshly rotated; never paste it into chat

# 1. Read-only. Confirms exactly what will be targeted. No writes.
bash scripts/mailer-apply.sh --only mailer_subjects_recovery --dry-run

# 2. Only after reading the above: the single-key write.
bash scripts/mailer-apply.sh --only mailer_subjects_recovery

# 3. If needed:
bash scripts/mailer-restore.sh
```

Step 2 sends **one** PATCH containing **one** key. The other three approved keys
are not touched, and nothing else in the auth config is either.


---

## Step 3e — Single-key experiment RESULT, and what it does and does not prove

**Result (owner-run):** `--only mailer_subjects_recovery` succeeded. The PATCH
response and an independent no-cache GET both return the sent value.

### What is now established

- The endpoint works, the auth token has sufficient scope, and **this API does
  store a `mailer_*` value it is sent.** "Supabase rejects mailer fields" is dead.
- The tooling reports truthfully: two independent observations agreed, and the
  same instrument reported disagreement correctly in the harness.

### Current production state — a deliberate, live inconsistency

`mailer_subjects_recovery` is now `Reset your Si Math AI password`, while the
**recovery template body is still the stock default**. So a password-reset email
would carry the new subject over the old body. Kept on purpose: it is the
control state for the next comparison.

Two reasons this is acceptable rather than sloppy, both worth checking rather
than assuming: the mismatch is cosmetic, and the Resend log contains **no
password-reset email ever sent** for this project, so the odds of a student
meeting this state are low. It is still a live inconsistency and should not be
left indefinitely.

### The pattern in the failed batch — stated with its confound

Recovered from `c04c011`, the object sent in the failed attempt was, in order:

| # | Key | Stored? |
|---|---|---|
| 1 | `mailer_templates_confirmation_content` | ❌ |
| 2 | `mailer_templates_recovery_content` | ❌ |
| 3 | `mailer_subjects_confirmation` | ❌ |
| 4 | `mailer_subjects_recovery` | ✅ |

**The only key that stored was the last one in the object.** That is suggestive,
and it is exactly the kind of pattern worth being careful about, because two
explanations are **confounded** here — key 4 is simultaneously:

- the **last** key in the object, and
- the only **short, pure-ASCII subject** in the payload.

The other short subject, `mailer_subjects_confirmation`, differs from it in one
material way: it contains an em dash, `U+2014`. So "position/batching" and "the
value itself" both predict the observed outcome, and this experiment cannot
separate them. n = 1.

Recorded so a later reader does not mistake the pattern for a conclusion.

### The next experiment, and why it is the right one

**`--only mailer_subjects_confirmation`.** One key, 51 bytes, fully reversible,
and it breaks the confound: it is the same *kind* of field as the key that
already succeeded, at the same size scale, differing essentially in the em dash —
while also moving from position 3 to being the only key in the request.

| Result | What it means | Next |
|---|---|---|
| **PASS** | Subjects write fine on their own. Position/batching is implicated; the em dash is exonerated. | Test one template solo |
| **FAIL** | The value itself is rejected, independent of batching. The em dash is the prime suspect. | Retry the same key with an ASCII hyphen |

If it FAILS, the immediate follow-up is the identical subject with a plain
hyphen — `Confirm your email to start studying - Si Math AI` — which would settle
the em dash conclusively. That is a copy change and needs approval before it is
sent.

### After that: the template test

`--only mailer_templates_recovery_content` — a 3.4 KB field, the other dimension
the failed batch varied. Together the two experiments partition the space:

| Subject solo | Template solo | Conclusion |
|---|---|---|
| pass | pass | Both fine alone → **batching** was the cause |
| fail | pass | The confirmation subject's **value** was the cause |
| pass | fail | **Template fields** (size or HTML) were the cause |
| fail | fail | Two independent causes |

Whichever branch we land on, the four-key rollout is then either safe as one
batch, or is performed one key at a time — which the tooling already supports and
which costs nothing but four requests.

### Command for the next step (needs approval before step 2)

No code change is required; `--only` already validates against the four approved
keys.

```bash
git pull origin claude/apple-signin-auth-wysnha
export SUPABASE_ACCESS_TOKEN=...

# read-only
bash scripts/mailer-apply.sh --only mailer_subjects_confirmation --dry-run

# single-key write — only with explicit approval
bash scripts/mailer-apply.sh --only mailer_subjects_confirmation
```

**Do not roll back yet.** The current state is the control for the comparison,
and `mailer-restore.sh` reverts every captured key at once, which would discard
it.
