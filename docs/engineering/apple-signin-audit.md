# Sign in with Apple — auth audit and implementation plan

**Audited 2026-08-21** against the live project (`igvkyxkmjnkzscqgommj`), the
Resend account that sends its mail, and the repository at
`claude/apple-signin-auth-wysnha`. Every number below was measured, not recalled.

**Status: code merged, feature OFF, and NOT yet approved to enable.**
`auth-apple.js` ships with `ENABLED = false`; nothing a student sees has changed.
§5 is the configuration that must exist before the flag is flipped, and
§3 records a correction to this document's original account-linking claims —
read it before relying on anything the first version said.

---

## 1. How login and signup work today

No framework, no server, no build step — the same shape as the rest of the repo.
Each page builds its own `supabase-js` client (UMD from jsDelivr, SRI-pinned) and
calls Supabase Auth directly from the browser.

| Step | Where | Call |
|---|---|---|
| Sign up | `signup.html:419` | `auth.signUp({email, password, options:{data:{full_name}, emailRedirectTo:'https://www.si-math-ai.com/login.html'}})` |
| Profile row | DB trigger `on_auth_user_created` → `public.handle_new_user()` | `insert into profiles (id, email, full_name) … on conflict (id) do nothing` |
| Confirm | emailed link | `GET <project>.supabase.co/auth/v1/verify?token=…&type=signup&redirect_to=…/login.html` |
| Log in | `login.html:549` | `auth.signInWithPassword({email, password})` |
| Resend confirm | `login.html:556` | `auth.resend({type:'signup'})`, offered only after a `email_not_confirmed` failure |
| Reset | `login.html:625` → `reset-password.html` | `resetPasswordForEmail` → `onAuthStateChange('PASSWORD_RECOVERY')` → `updateUser({password})` |
| Route | `login.html:458` `routeAfterAuth()` | device fingerprint check, then `dashboard.html` if `onboarding_completed`, else `onboarding.html` |
| Sign out | `profile.html`, `settings.html` | `auth.signOut()` |

Sessions are `localStorage` with auto-refresh (supabase-js defaults), shared
across every page because every page builds a client against the same project.
`profiles.id` is the `auth.users.id`, and **every** user-linked table keys off
that same uuid: `question_records`, `mastery_records`, `weakness_reports`,
`weakness_signals`, `chat_sessions`, `session_questions`, `focus_plans`,
`focus_tasks`, `study_plans`, `exam_mistakes`, `user_devices`, credits.
One user id is the whole account. Fork the id and you fork everything.

## 2. What is actually wrong — measured, not guessed

**It is not OTP, not magic links, not redirects, not session handling, and not an
SMTP failure.** The platform sends no OTP or magic link at all; the only email in
the flow is the signup confirmation.

Custom SMTP is configured and healthy. `si-math-ai.com` is **verified** in Resend
with DKIM and SPF passing, sending as `"Si Math Ai" <noreply@si-math-ai.com>`.

The failing population is unambiguous:

| | |
|---|---|
| Users in `auth.users` | 28 |
| On an Apple domain (`icloud.com` / `me.com` / `mac.com`) | 3 |
| Of those, **confirmed** | **0** |
| Of those, **ever signed in** | **0** |
| Gmail users, confirmed | 22 of 25 |

**Every single Apple-domain user is locked out. Not one has ever reached the
product.** Three students, over two months.

The trace for the most recent one (auth logs + Resend, 2026-08-21):

```
19:22:35  POST /signup                 200   confirmation email queued
19:22:35  Resend → …@icloud.com              status: delivered
19:23:10  POST /token grant=password   400   email_not_confirmed
19:24:41  POST /signup (again)         200   second confirmation email
19:24:41  Resend → …@icloud.com              status: delivered
19:25:17  POST /token grant=password   400   email_not_confirmed
19:25:19  POST /resend                 429   over_email_send_rate_limit
19:25:22  POST /resend                 429   over_email_send_rate_limit
```

She signed up twice, tried to log in twice, and hammered the resend button until
Supabase rate-limited her. Three minutes, zero progress.

**Both emails were `delivered`** — iCloud's mail servers accepted them. And
`email_confirmed_at` is still null, which proves nobody and nothing ever opened
the link: Supabase confirms the account on a plain `GET` of that URL, so even a
mail scanner pre-fetching it would have confirmed her. The message reached Apple
and was never seen. That is inbox placement — Junk — not delivery.

Two properties of the message make that likely, and both are ours:

1. **The visible link points at a different domain than the sender.** From is
   `si-math-ai.com`; the only link in the body is `igvkyxkmjnkzscqgommj.supabase.co`.
   Apple's filtering weighs that mismatch heavily.
2. **The body is three lines of bare HTML** — no text alternative worth the name,
   no branding, no `List-Unsubscribe`. It reads like a phishing template because
   structurally it is shaped like one.

And the flow turns a filtered email into a hard lockout: `signInWithPassword`
refuses with `email_not_confirmed` until the link is clicked, so the student has
one recovery path — an email they cannot find — and the resend button rate-limits
after two attempts.

**Apple sign-in fixes this by removing the email from the loop entirely.** It does
not fix the deliverability problem, which still affects password resets and any
future mail. §7 lists that separately, because it is a separate bug.

## 3. Identity linking — verified empirically, and one earlier claim corrected

**Superseded 2026-08-21 (same day).** The first version of this section reasoned
from Supabase's documentation. Documentation is not evidence, and the case that
matters most — Hide My Email — is not described in those docs at all. This
section now rests on the real GoTrue source and on tests run against a real
Postgres. Harness and re-run instructions:
`docs/engineering/gotrue-linking-harness/`.

### How it was verified

GoTrue is the service Supabase Auth runs. It is open source, so the linking
decision can be read and executed rather than believed. A throwaway local
Postgres was migrated with GoTrue's own schema, and its own account-linking suite
was run first (green) to prove the harness works. Five tests were then written
reproducing Si Math AI's exact account shape — an email/password user with an
`email` identity — and driving the real `createAccountFromExternalIdentity`.
Production was never contacted.

Both headline assertions were then deliberately inverted to confirm they could
fail (`verification-framework-audit.md`: a green check is only evidence if it
could have gone red). Both did.

The Apple-specific input is not invented either. `parseAppleIDToken`
(`internal/api/provider/oidc.go`) sets `Verified: true` for **every** Apple
email, private relays included — so `Verified: true` in the tests is exactly what
Apple's provider hands the linking code. That matters, because
`DetermineAccountLinking` only considers **verified** emails as linking
candidates; an unverified one always creates a new account.

### Results

| | Case | Decision | `auth.users.id` | Accounts after |
|---|---|---|---|---|
| **A** | Existing **confirmed** user → Apple, same email | `LinkAccount` | ✅ **preserved** | 1 |
| **B** | Existing **unconfirmed** user → Apple, same email | `LinkAccount` | ✅ **preserved** | 1 |
| **C** | Existing user → Apple, **Hide My Email** | `CreateAccount` | ❌ **new id** | **2** |
| **D** | New Apple user | `CreateAccount` | new (correct) | 1 |
| **E** | Returning Apple user (same `sub`) | `AccountExists` | ✅ preserved | 1 |

**A** additionally confirms the password survives: `encrypted_password` is
byte-identical before and after, and both identities (`apple`, `email`) remain.
Password login keeps working.

**B is the case for the three locked-out iCloud students, and it costs more than
the first version of this document said.** The `user_id` is preserved — so
credits, chat history, question records, weakness reports and focus plans are all
safe, which is the thing that matters. But because the account is unconfirmed,
`RemoveUnconfirmedIdentities` (`internal/models/user.go`) runs, and it is
destructive in three ways verified by test:

1. The `email` identity is **destroyed** — only `apple` remains.
2. `encrypted_password` is set to **NULL**. Not merely unusable: wiped.
3. `user_metadata` is **overwritten** with Apple's identity data, which carries no
   name. The student's `full_name` in `user_metadata` is lost.

The account is then auto-confirmed (`user.Confirm`).

Two consequences worth naming. First, `profiles.full_name` survives, because
`handle_new_user()` fires on INSERT into `auth.users` only and linking performs no
insert — so the name students actually see is unaffected. Second, and more
serious: **a case-B student becomes Apple-only.** Their sole route back to a
password is `resetPasswordForEmail` — an email to the same iCloud address that
does not currently reach them. If Apple's client secret then expires (§5, every 6
months), they are locked out with no working recovery. **That is a strong,
concrete argument for fixing email deliverability before enabling Apple**, not
after. See `email-deliverability-audit.md`.

**C is the disaster case, and it is confirmed real.** Apple reports
`…@privaterelay.appleid.com`; nothing matches; a second `auth.users` row is
created. The original account is untouched and intact — nothing is deleted — but
the student is now signed in as someone else, with zero credits and no history.

### ⚠️ Correction: the guard prevents USE, not CREATION

The first version of this document called the relay guard "prevention". **That
was wrong, and the review that caught it was right.**

Test **F** in the harness measures the exact timing. The second user row is
written by `a.signupNewUser(tx, user)` inside the `CreateAccount` branch of
`createAccountFromExternalIdentity` — which runs **server-side, inside the
`GET /auth/v1/callback` request**, and is committed before GoTrue issues its
redirect back to `www.si-math-ai.com`. The browser regains control only after the
row exists. Counting rows at the earliest moment any client code could possibly
run gives **2**.

So, precisely:

- **The duplicate account is created. Always. No browser-side code can stop it.**
- What the guard does is stop that duplicate from becoming the account the student
  *uses* — before onboarding runs, before any credits are granted, and before any
  study data is written to the wrong `user_id`.
- The result is an empty orphan row in `auth.users` plus a `profiles` row from
  `handle_new_user()`. Harmless, but it is litter, and it will accumulate.

**Preventing creation is only possible server-side**, and only in two ways:

1. **`auth.linkIdentity()`** — the student is already signed in, so Apple attaches
   to the account they are in and email matching never applies. Hide My Email
   becomes harmless. This is the genuinely safe path, it belongs in
   `settings.html`, and it needs Manual Linking enabled in the dashboard.
2. **A `before-user-created` auth hook** — server-side, can reject the signup
   before the row is written. Heavier: it is a Postgres function or an HTTP
   endpoint invoked in the auth path, and getting it wrong blocks *all* signups.

Neither is built here. The client guard is what is built, it is worth having, and
it must be described for what it is: **damage limitation at the earliest point the
browser can act, not prevention.**

### What this change does about it

`auth-apple.js` detects a private-relay address on an account that has not
finished onboarding (`needsRelayLinkCheck`) and `login.html` stops there with an
interstitial:

- *"I'm new here — continue"* → proceeds normally.
- *"I already have an account"* → signs out and points them at the account they
  already have.

It deletes nothing and merges nothing. The orphan Apple user is left in place,
because deleting an `auth.users` row is irreversible and is not a decision this
code should make.

**A merge tool is deliberately not built.** Moving rows across `user_id`s touches
twelve tables and a credits ledger. If a fork ever does happen, the safe order is
`auth.identities` first (attach Apple to the real user, service-role only), then
delete the empty duplicate — never re-key student data.

### Current exposure

All 28 existing identities are `provider='email'`; there are **no Apple identities
yet**, so nothing is already forked. `auth.users` holds no duplicate emails, so
matching is unambiguous. The three iCloud students have `credits_balance` 0,
`onboarding_completed` false, and zero rows in `question_records`,
`mastery_records`, `weakness_reports`, `focus_plans`, `exam_mistakes` and
`chat_sessions` — nothing to lose today. That is luck, and it expires the moment
one of them starts studying.

## 4. What was implemented

| File | Change |
|---|---|
| `auth-apple.js` | **New.** UMD module, same idiom as `taxonomy.core.js`. Holds `ENABLED`, the redirect rule, `isPrivateRelayEmail`, `needsRelayLinkCheck`, OAuth error handling, and `mount()`. |
| `login.html` | Loads the module; mount point after the form; `.btn-apple` styling; relay interstitial; `routeAfterAuth` takes the user object and runs the guard; OAuth errors from the return URL are shown. |
| `signup.html` | Loads the module; mount point after the form; identical `.btn-apple` styling. Apple returns to `login.html`, which owns the device check and the guard. |
| `tests/apple-signin.test.mjs` | **New.** 36 assertions against the shipped module. |

Two constraints came out of the repo rather than preference:

- **`signInWithOAuth`, not Sign in with Apple JS.** `vercel.json` sets
  `frame-src 'none'`; Sign in with Apple JS renders Apple's consent screen in an
  iframe, so the CSP kills it. A top-level redirect is unrestricted.
- **The redirect URL is hardcoded to production**, exactly as `emailRedirectTo`
  already is. Deriving it from `window.location.origin` yields a different
  hostname on every Vercel preview, which Supabase rejects with
  `redirect_to is not allowed` — a broken login, from a student's seat.

No database migration. No change to `handle_new_user()`. No production data
touched.

## 5. Configuration required before `ENABLED = true`

Nothing below is done yet. All of it is outside the repository.

### Apple Developer (paid account required, $99/yr)

1. **Team ID** — 10 characters, top-right of the Apple Developer console.
2. **App ID** — e.g. `com.simathai.app`. Enable the *Sign in with Apple*
   capability. Leave the Server-to-Server notification endpoint **blank**;
   Supabase does not support it.
3. **Services ID** — e.g. `com.simathai.web`. This is the OAuth `client_id`.
4. **Website URLs on the Services ID** — these are Supabase's domain, not ours:
   - Domain: `igvkyxkmjnkzscqgommj.supabase.co`
   - Return URL: `https://igvkyxkmjnkzscqgommj.supabase.co/auth/v1/callback`
5. **Sign in with Apple for Email Communication** → register `si-math-ai.com` and
   the sender `noreply@si-math-ai.com`. Without this, mail to a Hide My Email
   relay is dropped by Apple.
6. **Signing key** (`.p8`) in Keys, with Sign in with Apple enabled. Store it
   somewhere durable — losing it means revoking and starting over.

### Supabase Dashboard

7. **Authentication → Providers → Apple**: enable, set *Client ID* to the
   Services ID, and *Secret Key* to the JWT generated from the `.p8`.
8. **Authentication → URL Configuration → Redirect URLs**: add
   `https://www.si-math-ai.com/login.html`. Add `http://localhost:*` only if the
   flow will be tested locally.
9. Confirm **Site URL** is `https://www.si-math-ai.com`.

### ⚠️ Recurring: the Apple secret expires

**Apple's client secret is a JWT valid for at most 6 months.** When it expires,
every Apple sign-in fails — including for students who by then have no password,
because linking removed their unconfirmed email identity. Put a calendar reminder
at **5 months** and keep the `.p8` retrievable. This is the single most likely way
this feature breaks in production, and it breaks silently.

### Production domain

10. No DNS change is needed for OAuth — Apple talks to `supabase.co`, and
    `www.si-math-ai.com` only receives the final redirect.
11. No `vercel.json` change is needed. `frame-src 'none'` is compatible with the
    redirect flow (and is the reason it must be the redirect flow).

### Then, and only then

12. Flip `ENABLED` to `true` in `auth-apple.js`, and update the assertion in
    `tests/apple-signin.test.mjs` §"Ships disabled" in the same commit.

## 6. Test plan for the flip

Repository-side checks pass now: `node tests/run-all.mjs` → **48/48 green**.
The rest cannot be executed until §5 exists, and must be run against production
before announcing the feature.

| Scenario | Expected |
|---|---|
| Existing confirmed user, Apple with **Share My Email**, same address | Same `user_id`. Dashboard shows their real credits and history. Password still works afterwards. |
| One of the three iCloud students, Apple, same address | Same `user_id`, straight into onboarding. Password identity removed — verify "Forgot password?" restores one. |
| Brand new student, Apple, Share My Email | New account, onboarding, no interstitial. |
| Brand new student, Apple, **Hide My Email** | Interstitial appears. "I'm new here" → onboarding. |
| Existing student, Apple, **Hide My Email** | Interstitial appears. "I already have an account" → signed out, guidance shown, original account untouched and still reachable by password. |
| Returning Apple user, second login | Same `user_id`. No interstitial. |
| Session persistence | Reload, and open `chat.html` / `dashboard.html` in a new tab — still signed in. |
| Logout → re-login | `signOut()` then Apple again → same `user_id`. |
| Cancel at Apple's screen | Back on `login.html` with a readable message, not a blank page. |
| Redirect URL | Lands on `https://www.si-math-ai.com/login.html`, never a preview host. |
| Password login untouched | Existing email/password login unchanged throughout. |

Verify identity linkage directly rather than by eye:

```sql
select u.id, u.email, i.provider, i.created_at
from auth.users u join auth.identities i on i.user_id = u.id
where u.email = '<test address>' order by i.created_at;
-- one user row, two identity rows = linked. Two user rows = forked.
```

## 7. Separate from this change — recorded, not done

1. **iCloud deliverability.** Apple sign-in routes around it; it still breaks
   password resets for every Apple-domain student, and every future email.
   Worth doing: publish a **DMARC** record for `si-math-ai.com` (Resend requires
   only DKIM and SPF, and none was observed — verify before acting); host the
   confirmation link on `si-math-ai.com` so the link domain matches the sender;
   and give the template a real body and text alternative.
2. **The three locked-out students.** They can be released today, without waiting
   for Apple, by confirming their addresses server-side or re-sending through a
   channel they will see. **Not done — this is production data and needs explicit
   approval.**
3. **`linkIdentity()` in `settings.html`** — the one path that is safe regardless
   of Hide My Email, for students who already have an account.
4. **The resend rate limit** (`over_email_send_rate_limit` after two taps) is
   surfaced to the student as a generic failure. It should say how long to wait.

## 8. Rollout plan — awaiting approval

Sequenced so the email fix lands first. That order is not a preference: §3 showed
that linking an unconfirmed account **wipes its password**, leaving the student
Apple-only with password reset as their sole fallback — over the very email
channel that is currently broken. Enabling Apple first would make those students
dependent on a route we know does not work.

| # | Step | Reversible? | Touches students? |
|---|---|---|---|
| 1 | `dig +short TXT _dmarc.si-math-ai.com`; publish the `p=none` record if absent | yes | no |
| 2 | Back up current mailer config, apply the branded templates | yes, from the backup | mail wording only |
| 3 | **Send a real test to an iCloud address. Inbox or Junk?** | n/a | no |
| 4 | If still Junk: build `confirm.html` and move auth links onto our domain | yes | yes — own change, own review |
| 5 | Release the three locked-out students by whichever route step 3 proved | no | yes — **separate approval** |
| 6 | Apple Developer + Supabase provider config (§5) | yes | no — nothing is enabled yet |
| 7 | Enable Manual Linking; add `linkIdentity()` to `settings.html` | yes | adds an option only |
| 8 | Run the §6 test plan against production with a throwaway Apple ID | n/a | no |
| 9 | Flip `ENABLED = true`, update the flag assertion in the test suite, merge | **yes — see §9** | yes |
| 10 | Watch for 48h: new `auth.users` rows, `provider='apple'` identities, forks | n/a | no |

Step 7 before step 9 matters: `linkIdentity()` is the only path that is safe
regardless of Hide My Email, so existing students should have it available before
the login-page button invites them down the path that is not.

Query for step 10:

```sql
-- Forks: an Apple identity on a relay address next to an older account.
select u.id, u.email, u.created_at,
       (select string_agg(i.provider, ',') from auth.identities i where i.user_id = u.id) as providers
from auth.users u
where u.email like '%@privaterelay.appleid.com'
order by u.created_at desc;
```

## 9. Rollback plan

**The flag is the rollback.** Set `ENABLED = false` in `auth-apple.js` and merge:
Vercel redeploys the static site automatically, the button disappears, and
email/password login — which was never modified — carries on. No migration to
reverse, no data to restore. That is the whole reason the change was built this
way.

Per layer:

| Layer | To undo | Notes |
|---|---|---|
| Button / UI | `ENABLED = false`, merge | Live within a Vercel deploy |
| Supabase Apple provider | Disable in the dashboard | In-flight sign-ins fail with a readable message — `friendlyError` covers it |
| Email templates | Re-PATCH from `mailer-config-backup.json` | Take the backup *before* step 2 |
| DMARC `p=none` | Delete the TXT record | Publishes no policy; changes no delivery |
| Apple Developer config | Leave it | Inert while the provider is disabled |

**What rollback does NOT undo**, and must be understood before step 9:

- **Students already linked stay linked.** An Apple identity attached to an
  existing account is not removed by turning the button off. For case-A students
  that is harmless — their password still works. For **case-B students it is
  not**: their password was wiped at link time, so disabling Apple leaves them
  with password reset as their only way in. This is the second reason the email
  fix must land first.
- **Orphan accounts from Hide My Email stay.** They are empty and harmless.
  Deleting them is a manual, service-role, individually-approved operation.

If a fork is discovered: do **not** re-key student data. Attach the Apple identity
to the correct `auth.users` row in `auth.identities` (service-role), verify the
student can sign in and sees their real credits and history, and only then remove
the empty duplicate.
