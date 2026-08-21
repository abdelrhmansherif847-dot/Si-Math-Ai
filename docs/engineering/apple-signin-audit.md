# Sign in with Apple — auth audit and implementation plan

**Audited 2026-08-21** against the live project (`igvkyxkmjnkzscqgommj`), the
Resend account that sends its mail, and the repository at
`claude/apple-signin-auth-wysnha`. Every number below was measured, not recalled.

**Status: code merged, feature OFF.** `auth-apple.js` ships with `ENABLED = false`.
Nothing a student sees has changed. §5 is the work that must happen before the
flag is flipped.

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

## 3. Identity linking — verified, not assumed

Supabase's rule ([Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)):

> Supabase Auth automatically links identities with the same email address to a
> single user. … when a new identity can be linked to an existing user, Supabase
> Auth will remove any other unconfirmed identities linked to an existing user.

Automatic linking depends on email uniqueness, and this project satisfies it —
checked directly: `select lower(email), count(*) … having count(*) > 1` returns
**zero rows**, so "allow same email" is off and matching is unambiguous. All 28
existing identities are `provider = 'email'`; there are **no** Apple identities
yet, so there is nothing already forked to repair.

What that means, case by case:

| Case | Result | Safe? |
|---|---|---|
| Existing **confirmed** user, Apple returns the same address | Apple identity attaches to the existing user. Same `user_id`. Password still works. | ✅ |
| Existing **unconfirmed** user (all 3 iCloud students), same address | Apple identity attaches to the existing user. Same `user_id`, same profile, all FKs intact. Their unconfirmed password identity is **removed** — they must use Apple, or "Forgot password?" to get a password back. | ✅ data-safe |
| Brand new student | New user. Nothing to preserve. | ✅ |
| Returning Apple user | Matches on the Apple identity. Same `user_id`. | ✅ |
| **Existing user picks "Hide My Email"** | Apple reports `…@privaterelay.appleid.com`. **Matches nothing. NEW `user_id`, new profile, second empty account.** | ❌ |

**So: safe automatic linking cannot be guaranteed, and the exception is exactly
the disaster case.** A student with credits, chat history, question records,
weakness data and focus plans taps one Apple toggle and lands in a blank account.
Nothing in Supabase prevents it, and no configuration switch turns it off.

For the three iCloud students specifically the risk is currently **zero either
way** — all three have `credits_balance` 0, `onboarding_completed` false, and 0
rows in `question_records`, `mastery_records`, `weakness_reports`, `focus_plans`,
`exam_mistakes` and `chat_sessions`. There is nothing yet to lose. That is luck,
and it expires the moment one of them starts studying.

### What this change does about it

**Prevention, not repair.** `auth-apple.js` detects a private-relay address on an
account that has not finished onboarding and stops before that account becomes
the one they use (`needsRelayLinkCheck`). `login.html` shows an interstitial:

- *"I'm new here — continue"* → proceeds normally.
- *"I already have an account"* → signs out and tells them to log in the way they
  already do, then use **Share My Email** next time.

It deletes nothing and merges nothing. The empty Apple user is left in place,
because deleting an `auth.users` row is irreversible and is not a decision this
code should make.

**A merge tool is deliberately not built.** Moving rows across `user_id`s touches
twelve tables and a credits ledger; it is worth writing only if a fork actually
happens, and the guard exists so it does not. If one ever does, the safe order is:
`auth.identities` first (attach Apple to the real user, service-role only), then
delete the empty duplicate — never re-key student data.

**The genuinely safe path for existing students is `auth.linkIdentity()`** — a
signed-in student attaches Apple to the account they are already in, so email
matching never enters into it, and Hide My Email is harmless. That belongs in
`settings.html`, needs Manual Linking enabled in the dashboard, and is proposed
in §7 rather than built here: it is a different page and a different decision.

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
