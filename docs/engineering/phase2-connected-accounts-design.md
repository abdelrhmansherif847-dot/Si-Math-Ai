# Phase 2 — Connected Accounts in Settings. Design, not implementation.

**Nothing is implemented.** This is the pre-implementation audit and proposal
requested before any code is written, and before Manual Linking is enabled on the
project. Manual Linking is **off** today and must stay off until this is approved.

Depends on Phase 1 being complete (`phase1-email-fix-runbook.md`).

---

## 1. Why this comes before the public Apple button

`auth.linkIdentity()` is the only path that is safe regardless of Hide My Email,
and this is verified rather than assumed —
`gotrue-linking-harness/`, cases **G** and **H**, run against real GoTrue and a
real Postgres, with both assertions inverted to confirm they could fail.

**Case G — a signed-in student links Apple with Hide My Email:**

| | Result |
|---|---|
| `auth.users.id` | ✅ **preserved** |
| Accounts after | **1** — no second account is created |
| Identities | `apple` added **alongside** `email` |
| Account email | unchanged — **not** replaced by the relay address |
| Password | ✅ **not wiped** (unlike case B, the unconfirmed-login path) |

The reason is in the source, not in the docs: `linkIdentityToUser`
(`internal/api/identity.go`) attaches the new identity to `getTargetUser(ctx)` —
the authenticated user — and **never consults the email for matching**. The email
is touched only when the target user has none at all, which applies to anonymous
users and not to ours. Hide My Email is therefore irrelevant on this path. That
is the whole point of Phase 2.

**Case H — the ordering constraint.** If a student has *already* forked through a
public login button, that Apple `sub` is bound to the orphan, and linking from
Settings is **refused** with `identity_already_exists`. Nothing is corrupted and
nothing is silently moved — but the student cannot self-serve their way out, and
an operator has to intervene.

**So Settings-linking must ship BEFORE the public button, not after.** Shipping
the button first creates the exact forks that make Settings-linking unusable for
the students who most need it.

## 2. Supabase requirements — report before enabling

| Requirement | Detail |
|---|---|
| **Manual Linking must be enabled** | Dashboard → Authentication → Providers. Self-hosted equivalent: `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true`. Default is **false** (`internal/conf/configuration.go`, `ManualLinkingEnabled`), and it is **off** on this project today |
| **Status** | Supabase documents this as **beta** |
| **Apple provider** | Must also be configured — Phase 3. `linkIdentity({provider:'apple'})` runs the same OAuth round trip, so it cannot work before Apple Developer config exists |
| **What enabling it exposes** | Two authenticated endpoints, `GET /user/identities/authorize` and `DELETE /user/identities/{id}`, gated by `requireManualLinkingEnabled` (`internal/api/middleware.go`). Both act only on the caller's own user |
| **Reversible?** | Yes. Turning it off returns `manual_linking_disabled` on both endpoints. **Identities already linked stay linked** |

**What enabling Manual Linking does NOT do:** it does not alter automatic linking,
does not touch existing users, does not run a migration, and does not change
anything for a student who never opens Settings. It adds two endpoints.

### `unlinkIdentity` — the sharp edge

Supabase requires a user to keep **at least one** identity; unlinking the last one
is refused. But consider a case-B student — one of the three iCloud students,
after they eventually link Apple. Their `email` identity was destroyed and their
password NULLed at link time, so `apple` is their *only* identity. For them,
"Disconnect" is either refused or, if it ever succeeded, would lock them out
permanently.

**Proposal: build Connect only. No Disconnect button in v1.** Unlinking is rare,
irreversible from the student's side, and dangerous for exactly the students this
project is trying to rescue. If it is ever needed, it should be a support action
with a human in the loop. This is a deliberate omission, not an oversight.

## 3. Where it belongs in the UI

### Current `settings.html` structure

Ten `.sec-label` + `.card` sections, in this order:

```
Account Settings   ← Full Name · Email Address · Password
Notifications
Learning Preferences
Goals & Reminders
Subscription
Buy Credit Pack
Privacy & Security
Data Management
Support
Account Actions    ← sign out, delete account
```

The **Account Settings** card is three `.set-row`s, each an icon
(`.set-ic`) + label and value (`.set-body` → `.set-t` / `.set-s`) + a control
(`.set-action`, either a `.btn-sm` or a `.status-pill`). The Password row is the
closest precedent: a label, a current-state line, and a button that reveals a
collapsed section (`#changePwSection`).

### Proposal: a fourth row in Account Settings

Not a new top-level section. Reasons:

1. **It is a credential, not a preference.** How you sign in belongs next to
   Email Address and Password, which is exactly where a student looks for it.
   A separate "Connected Accounts" section further down the page would be found
   by nobody who was not already looking.
2. **The `.set-row` pattern already expresses the two states needed** — a value
   line plus either a button (not connected) or a status pill (connected). The
   Email row already ships a `.status-pill on` for its read-only state.
3. **No new section means no new navigation, no reordering, and a smaller diff**
   on a page that also handles subscriptions and account deletion.

```
Account Settings
├── Full Name        Jumana                    [Edit]
├── Email Address    j…@icloud.com             (Read-only)
├── Password         Changed 3 days ago        [Change Password]
└── Apple ID         Not connected             [Connect]        ← new
                     ── or ──
    Apple ID         Connected                 (● Connected)
```

Copy, in the two states:

- Not connected — `.set-s`: *"Sign in with your Apple ID instead of a password."*
- Connected — `.set-s`: *"You can sign in with Apple."* and a `.status-pill on`.

The row renders **only when Apple is configured** — gated on the same
`SiAuthApple.ENABLED` flag that gates the login button, so Phase 2 and Phase 3
cannot get out of step, and a student never sees a Connect button that leads to
"Unsupported provider".

### Implementation sketch (not built)

- Read state with `auth.getUserIdentities()`; look for `provider === 'apple'`.
- Connect calls `auth.linkIdentity({ provider: 'apple', options: { redirectTo:
  SiAuthApple.redirectTarget('settings.html') } })` — a full-page redirect, same
  as the login flow, because `frame-src 'none'` in `vercel.json` rules out any
  popup or iframe approach.
- `https://www.si-math-ai.com/settings.html` must be added to the Supabase
  redirect allow list alongside `login.html`.
- On return, re-read identities and re-render the row. Surface failures through
  the existing `SiAuthApple.friendlyError`, with one addition:
  `identity_already_exists` needs its own message — *"This Apple ID is already
  connected to another Si Math AI account. Contact support and we'll sort it
  out."* (case H).
- No new dependency, no new page, no database change.

## 4. What this does not include

- **No account merging.** Nothing that moves rows between `user_id`s.
- **No Disconnect.** §2.
- **No deletion of orphan accounts.**
- **No change to the login page.** The public "Continue with Apple" button stays
  behind `ENABLED = false` until Phase 3.
