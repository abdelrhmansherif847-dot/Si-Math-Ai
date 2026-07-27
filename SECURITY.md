# Si Math AI — Production Security Report

**Audit date:** 2026-07-27
**Scope:** full platform — frontend, Supabase (schema, RLS, grants, RPCs, storage,
auth), the `ai-tutor` Edge Function, Owner Dashboard, AI Tutor, OCR, Study Planner,
Weakness Analyzer, Focus Practice, Mock Exams, Credits, admin functionality, build
and deployment configuration.
**Branch:** `claude/enterprise-security-hardening-xdhqfi`
**Production project:** `igvkyxkmjnkzscqgommj`

---

## 1. Executive summary

The audit found **one critical, actively exploitable vulnerability** and eight
lower-severity issues. The critical finding has been fixed in production and
verified; the rest are fixed in code, staged for approval, or documented as
infrastructure work.

The headline finding is worth stating plainly, because it was not a subtle bug:

> Any student who had signed up could grant themselves platform administrator
> rights, unlimited AI credits, and a free perpetual subscription with a single
> line typed into the browser console. Administrator rights carry read access to
> every other student's personal data and the entire payment record set.

This was live. It is now closed, verified with a real privilege test against
production, and covered by a regression check.

Two things stood out as genuinely good, and they shaped how the rest of the work
was done. First, **RLS is enabled on all 41 tables** and the policy expressions
are, with one exception, correct and specific — the critical failure was in the
grant layer *beneath* RLS, not in the policies themselves. Second, the codebase
has real **output-escaping discipline**: 16 of 18 pages define and use an `esc()`
helper, and the Owner Dashboard correctly escapes cross-tenant data. Only one
unescaped sink existed in the entire frontend. This is a well-maintained
codebase, and the findings below are concentrated in the boundary layers
(grants, headers, request admission) rather than spread through the logic.

### Overall security score

| | Before | After |
|---|---|---|
| **Score** | **34 / 100** | **81 / 100** |
| Rating | Critical exposure | Production-ready with tracked follow-ups |

The "before" score is dominated by the critical finding — a platform where any
user can become an administrator has no meaningful access-control boundary, and
no amount of good practice elsewhere compensates. The "after" score is held
below 90 by three things outside this session's reach: bot protection is not yet
enabled, the CSP still requires `'unsafe-inline'`, and the CDN supply-chain pin
could not be applied from this environment (see SEC-07).

### Disposition at a glance

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| SEC-01 | **Critical** | Any user can self-grant admin, credits, subscription | ✅ **Fixed in production, verified** |
| SEC-02 | **High** | `session_id` not ownership-checked → cross-tenant read | ✅ Fixed in code (v88) |
| SEC-03 | **High** | No security headers or CSP on any route | ✅ Fixed (`vercel.json`) |
| SEC-04 | **High** | AI knowledge base world-writable → stored prompt injection | ⏸ Migration staged, needs approval |
| SEC-05 | Medium | Upload extension + Content-Type attacker-controlled | ✅ Fixed (`manual-payment.html`) |
| SEC-06 | Medium | Unescaped weakness data → self-XSS | ✅ Fixed (`dashboard.html`) |
| SEC-07 | Medium | Unpinned CDN dependency, no SRI | ⚠️ Tool shipped, **must be run** |
| SEC-08 | Low | Grant hygiene: anon RPC EXECUTE, TRUNCATE, stale tables | ⏸ Migration staged, needs approval |
| SEC-09 | Low | XP / streak columns client-writable | 📋 Documented, fix proposed |
| SEC-10 | Low | Leaked-password protection disabled | 📋 One dashboard toggle |

---

## 2. Findings

### SEC-01 — Privilege escalation and billing bypass via `profiles` — CRITICAL

**Status:** Fixed in production 2026-07-27, verified.
**CVSS 3.1:** 9.1 (`AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N`)
**OWASP:** A01:2021 Broken Access Control

**What was wrong.** `public.profiles` carried the policy:

```sql
"Users update own profile"  FOR ALL TO public
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id)
```

That policy is correct for what it does. The problem is what it *doesn't* do:
RLS is **row**-level. It answers "which rows may I write?" and never "which
columns may I write?". The row test passes for a student writing their own row,
so column authority fell through to table grants — and `anon` and
`authenticated` both held table-wide `UPDATE` and `INSERT`, covering every
column. No trigger intervened (`profiles` has only `set_updated_at`).

**The exploit**, runnable from the browser console of any signed-in student:

```js
await sb.from('profiles').update({
  is_admin: true, role: 'owner', credits_balance: 999999,
  plan_code: 'FOUNDER_ANNUAL', subscription_expires_at: '2099-01-01'
}).eq('id', MY_OWN_ID);
```

**Why it is critical.** `is_admin` is the gate on `auth_is_admin()`, which in
turn gates `admin_select_profiles`, `admin_select_payments`, `payment_requests`
read and update, and writes to `pricing_settings` and `plan_definitions`. One
student setting one boolean therefore obtains: every other student's name,
email, exam data and study history; the complete payment and revenue record;
and the ability to alter platform pricing. Independently, the credit and
subscription columns are direct theft of the paid product.

**The fix, and a trap worth recording.** The intuitive remedy is a column-level
revoke:

```sql
REVOKE UPDATE (is_admin, ...) ON public.profiles FROM authenticated;  -- NO-OP
```

**This does nothing, and does it silently.** PostgreSQL treats a table-level
`UPDATE` grant as covering all columns; a column-level `REVOKE` cannot carve a
hole out of it. This was applied first, reported `success`, and changed
absolutely nothing — `information_schema.column_privileges` still listed every
column as granted, because it expands the table-level grant per column. The
working form drops the table-wide privilege and re-grants an explicit
allow-list:

```sql
REVOKE UPDATE, INSERT ON public.profiles FROM anon, authenticated;
GRANT  UPDATE (full_name, email, exam_type, ... 26 columns) ON public.profiles TO authenticated;
GRANT  INSERT (id, full_name, email, ... 28 columns)        ON public.profiles TO authenticated;
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.profiles FROM anon, authenticated;
```

This is also **fail-closed for the future**: a column added to `profiles` later
is not client-writable until someone grants it deliberately.

**Why it did not break anything.** Every legitimate writer was traced before
applying. All privileged writes run as `SECURITY DEFINER` functions owned by
`postgres` (`approve_payment_request`, `change_user_role`, `consume_credits`,
`refund_ai_credit`, `handle_new_user`, …) or as `service_role` (the
`admin-actions` Edge Function, `ai-tutor`). Neither is affected by a revoke
against `anon`/`authenticated`. The Owner Dashboard never writes these columns
directly — it calls RPCs. Client writes touch only allow-listed columns.

**Verification performed against production:**

```
authenticated → UPDATE is_admin          ERROR 42501: permission denied  ✅
authenticated → UPDATE role/credits      ERROR 42501                     ✅
authenticated → UPDATE full_name, xp,
                current_streak, exam_date,
                upgrade_requested         succeeds                        ✅
service_role  → UPDATE is_admin          still permitted                 ✅
anon          → UPDATE/INSERT anything   no privilege at all             ✅
```

**Files:** `supabase/migrations/20260727_profiles_column_privilege_hardening.sql`

**Residual risk.** `xp`, `rank_name`, `current_streak`, `best_streak` remain
client-writable — see SEC-09. They carry no authorization or monetary value.

---

### SEC-02 — Cross-tenant read via unvalidated `session_id` — HIGH

**Status:** Fixed in code (ai-tutor v88). **Requires deploy.**
**OWASP:** A01:2021 Broken Access Control (IDOR)

The Edge Function took `session_id` from the request body and used it without
ever checking who owned it. Every query in the function runs on `sbAdmin` — the
**service-role** client, which bypasses RLS — so the database offered no
backstop.

Passing another student's `session_id` caused three things:

1. `chat_sessions.last_message_at` was written on a session the caller did not own.
2. `resolveQuestionReference()` read that session's `session_questions` rows and
   spliced the stored `question_text` / `summary` into the prompt — so **another
   student's question text could be echoed back in the answer**.
3. New `question_records` and `session_questions` rows were attached to the
   victim's thread.

Notably, the sibling lookups on `question_records` were *already* correctly
scoped with `.eq('user_id', user.id)`. Only the session path was missed.

**Fix** — ownership is now proven before the id is used anywhere:

```ts
const { data: ownedSession } = await sbAdmin.from('chat_sessions')
  .select('id').eq('id', resolvedSessionId).eq('user_id', user.id).maybeSingle();
if (!ownedSession) return safeError(403, 'forbidden_session', 'Session not found.', origin);
```

Filtering through `user_id` makes a foreign id indistinguishable from a
nonexistent one, which is the correct behaviour — it leaks nothing about
whether the session exists.

**Files:** `supabase/functions/ai-tutor/index.ts`

---

### SEC-03 — No security headers, no CSP — HIGH

**Status:** Fixed. **OWASP:** A05:2021 Security Misconfiguration

`vercel.json` set cache headers and nothing else. The platform shipped with no
CSP, no HSTS, no framing protection, no MIME-sniffing protection, and no
referrer policy. Every page holding a student session was framable (clickjacking
against the credit-purchase and account-deletion flows) and any XSS had
unrestricted exfiltration.

**Fix.** A full header set on every route. The CSP was derived by enumerating
what the app actually loads, not by guessing:

```
default-src 'self';
script-src  'self' 'unsafe-inline' https://cdn.jsdelivr.net;
style-src   'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
font-src    'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:;
img-src     'self' data: blob: https://igvkyxkmjnkzscqgommj.supabase.co;
connect-src 'self' https://igvkyxkmjnkzscqgommj.supabase.co wss://igvkyxkmjnkzscqgommj.supabase.co;
object-src 'none'; base-uri 'self'; form-action 'self';
frame-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests
```

Plus `Strict-Transport-Security` (2 years, `includeSubDomains`),
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy`
denying 24 features, and `Cross-Origin-Opener-Policy` / `-Resource-Policy`.

**Two decisions worth explaining.**

*No `'unsafe-eval'`.* Verified by search: the codebase contains zero `eval()`
and zero `new Function()`. KaTeX does not need eval. This is a free, strict win.

*`'unsafe-inline'` is retained, deliberately.* The site is 18 static HTML pages
with inline `<script>` blocks and **93 inline event handlers** (`onclick=`) plus
6 `javascript:` URLs. Nonces cannot be used — Vercel serves static files with no
per-request server to inject them. Hashes cannot cover inline event handlers at
all. Removing `'unsafe-inline'` therefore requires refactoring all 93 handlers
to `addEventListener`, across files including three frozen ones. That is a
genuine hardening step, but it is a substantial behavioural change and does not
belong in the same pass as a critical access-control fix.

**What the CSP still buys with `'unsafe-inline'` in place:** injected
`<script src="//evil.com">` is blocked; `object`/`embed` are blocked;
`base` tag hijacking is blocked; form exfiltration is blocked; framing is
blocked; and — most importantly — `connect-src` and `img-src` confine
exfiltration to origins we control, so an injected inline script has nowhere
to send stolen data.

`Permissions-Policy` sets `camera=(self)` rather than `()`: `chat.html` uses
`<input type="file" capture>` for OCR photo capture, and some browsers gate that
attribute on the camera policy. Denying it outright would have broken the
platform's primary input path.

**Files:** `vercel.json`

---

### SEC-04 — AI knowledge base is world-writable — HIGH

**Status:** ⏸ Migration written, **not applied** — needs approval (CLAUDE.md §3).
**OWASP:** A01:2021 Broken Access Control + LLM01 Prompt Injection

All three knowledge tables carry a single policy:

```
zero_knowledge_categories     FOR ALL  USING (true)
zero_knowledge_subcategories  FOR ALL  USING (true)
zero_knowledge_entries        FOR ALL  USING (true)
```

`FOR ALL USING (true)` with no `WITH CHECK` means INSERT, UPDATE and DELETE are
unrestricted. Any authenticated student can rewrite or delete the 138 knowledge
entries.

**Why this is worse than ordinary data tampering.** These rows are not inert.
`search_zero_knowledge()` retrieves them and `ai-tutor` splices the result into
Zero's **system prompt**. A student writing a crafted entry is writing
instructions that execute in *other students'* tutoring sessions — a stored
prompt injection with platform-wide reach, arriving through a trusted channel.
Two concrete outcomes: the tutor can be steered into emitting arbitrary content
to minors, or the knowledge base can simply be deleted, silently degrading
answer quality platform-wide.

**Fix (staged):** split the single `ALL` policy into public read + admin-only
write, and drop the table-wide write grants so the policy is not the sole gate —
the same two-gate lesson as SEC-01.

**Files:** `supabase/migrations/PENDING_20260727_sec04_knowledge_base_write_lockdown.sql`

> ⚠️ The `DROP POLICY` names in that file are placeholders. Run the listed
> `pg_policies` query and substitute the real names before applying.

---

### SEC-05 — Payment-proof upload: attacker-controlled type and path — MEDIUM

**Status:** Fixed. **OWASP:** A04:2021 Insecure Design

`accept="image/*"` is a file-picker hint and constrains nothing. The stored
object took both its extension and its Content-Type from caller-controlled
input:

```js
const ext = uploadedFile.name.split('.').pop() || 'jpg';   // attacker's filename
contentType: uploadedFile.type                              // attacker's MIME
```

A file named `proof.png/../../<other-user>/evil.html` yields the extension
`png/../../<other-user>/evil.html` — a path-traversal attempt against another
student's folder in the `payment-proofs` bucket. Independently, an HTML or SVG
payload uploaded with `text/html` is stored content that a reviewing
administrator later opens from a signed URL.

**Fix.** Both values now derive from a magic-byte sniff (JPEG/PNG/WEBP/HEIC
signatures) checked against an allow-list, with the declared type required to
agree. The filename is never consulted, which removes the traversal shape
entirely rather than trying to sanitise it.

**Files:** `manual-payment.html`

**Server-side follow-up required.** This is client-side validation, so it is
defence-in-depth only — a scripted upload bypasses it. See §5.

---

### SEC-06 — Unescaped weakness data → self-XSS — MEDIUM

**Status:** Fixed. **OWASP:** A03:2021 Injection

```js
var loc = weakness.subtopic ? weakness.topic + ' &rarr; ' + weakness.subtopic : weakness.topic;
weakBanner.innerHTML = 'Biggest Weakness: <b>' + loc + '</b>';
```

`weakness_reports` has RLS `FOR ALL USING (user_id = auth.uid())`, so a student
can write arbitrary strings into their own `topic`/`subtopic`. These are not
trusted taxonomy values.

Impact is limited to **self**-XSS: the audit checked whether this data crosses
tenants and found that `admin.html:1668` renders the same fields from *all*
users but correctly escapes them with `esc(k)`. Had it not, this would have been
critical — stored XSS executing in an owner session. Note the CSP does not
mitigate this class, because inline handlers still require `'unsafe-inline'`.

**Fix:** `esc()` on both parts, keeping `&rarr;` as a literal entity.
Additionally hardened `devices.html`'s `showAlert()`, a latent sink whose
callers all currently pass literals.

**Files:** `dashboard.html`, `devices.html`

---

### SEC-07 — Unpinned CDN dependency with no SRI — MEDIUM

**Status:** ⚠️ **Tool shipped — must be run. Not yet fixed.**
**OWASP:** A08:2021 Software and Data Integrity Failures

14 pages load:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

`@2` is a floating major-version range resolved at request time, with no
`integrity` attribute. Every page holding a session — **including `admin.html`,
which holds an owner session** — executes whatever that URL returns. A
compromised release, a hijacked npm account, or CDN cache poisoning becomes
immediate script execution in an authenticated context.

**Why this is not fixed in this commit.** A correct `integrity` value is a hash
of the exact bytes the CDN serves. It cannot be guessed or recalled. This
session's egress policy blocks `cdn.jsdelivr.net` (verified: proxy returns 403
to `CONNECT`), so the real hashes could not be computed — and shipping invented
hashes would make every browser refuse the script, taking the whole platform
down. Reporting the blocked host rather than routing around it is the documented
correct behaviour.

**What was shipped instead:** `scripts/pin-cdn-sri.sh`, which fetches each
asset, computes the SHA-384 digest, and rewrites the HTML in place. Run it from
any network that can reach jsdelivr:

```bash
./scripts/pin-cdn-sri.sh          # pin + apply
./scripts/pin-cdn-sri.sh --check  # CI gate: fails if anything drifts back
```

**Trade-off, stated plainly:** pinning stops automatic patch delivery, including
security patches to `supabase-js`. That is the intended trade — an unreviewed
automatic update executing in an authenticated page is the larger risk — but it
converts dependency updates into a deliberate, scheduled activity. Treat a pin
bump as a dependency update: read the changelog, bump, re-run, smoke-test.

One page uses `@supabase/supabase-js/+esm`; SRI does not apply to ESM imports,
so convert that to the UMD build.

---

### SEC-08 — Grant hygiene — LOW

**Status:** ⏸ Migration written, **not applied** — needs approval.

Three defence-in-depth items, none currently exploitable:

1. **`anon` holds EXECUTE on admin RPCs.** `admin_credits_overview()` and
   `admin_set_credit_cost()` are reachable unauthenticated. They are safe today
   because each checks `is_admin` via `auth.uid()`, which is NULL for anon. The
   objection is structural: an internal guard should be the second line of
   defence, not the only one.
2. **`anon`/`authenticated` hold TRUNCATE on essentially every table**, from
   Supabase's default `GRANT ALL`. **TRUNCATE is not subject to RLS** — no
   policy can stop it. It is unreachable through PostgREST today, but a single
   SQL-executing RPC added later turns it into instant total data loss.
3. **Migration-era tables still exposed:** `weakness_signals_bak_mig_b1_20260702`
   (476 rows) and `mig_b1_map` have RLS on but no policies — they return nothing
   by accident rather than by design.

**Files:** `supabase/migrations/PENDING_20260727_sec08_rpc_grant_hygiene.sql`

> **Correction made during this audit.** An earlier draft of this migration
> revoked `EXECUTE` on `consume_credits` from `authenticated`. That would have
> broken credit charging platform-wide: `credit-config.js` calls it directly
> from the browser. The function takes `p_user_id` as a parameter, which looks
> like a cross-tenant credit-drain primitive, but the current definition already
> carries the `AUTHZ-01` dual-authorization guard — a browser caller
> (`auth.uid()` present) may spend only their own credits, while service-role
> callers may act for any user. That is the correct design. The revoke was
> removed and replaced with an `anon`-only revoke.

---

### SEC-09 — Gamification columns client-writable — LOW

`xp`, `rank_name`, `current_streak`, `best_streak` remain writable by their
owner, because `chat.html`, `mock-exam.html` and `assets/streak.js` write them
directly from the browser (`profiles.update({ xp: candidate, ... })`). A student
can set their own XP and rank arbitrarily.

These were deliberately **excluded** from the SEC-01 revoke: they carry no
authorization or monetary value, and revoking them would have broken XP and
streak awards — an unacceptable side effect of a security fix.

**Proposed fix (not implemented):** move the award path into a `SECURITY
DEFINER` RPC that recomputes the value server-side, mirroring `award_focus_xp`,
which already does exactly this for Focus Practice. Then revoke the four
columns. This is a behavioural change to a frozen file (`mock-exam.html`) and
warrants its own change window.

---

### SEC-10 — Leaked-password protection disabled — LOW

Supabase Auth can check new passwords against HaveIBeenPwned. It is off.
Enable at **Dashboard → Authentication → Policies → Leaked password protection**.
One toggle, no code change, meaningful protection against credential stuffing
given the platform's audience.

---

## 3. What was audited and found sound

Recording the negative results matters — it is what makes the positive findings
meaningful.

- **SQL injection: none found.** Every database access goes through PostgREST
  (`supabase-js`) or parameterised `plpgsql`. There is no string-concatenated
  SQL anywhere, and no dynamic SQL outside the `DO` block in the staged SEC-08
  migration.
- **Secret management: clean.** No hardcoded API keys, tokens, passwords or
  credentials in the repository. `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
  are read from `Deno.env` only. The client key is `sb_publishable_…`, which is
  Supabase's publishable key and is designed to be public — it is not a
  service-role key, and it is correctly paired with RLS.
- **RLS coverage: complete.** Enabled on all 41 public tables.
- **Payment approval logic: sound.** `approve_payment_request()` is admin-gated,
  rejects non-`pending` requests (so no double-approval), and takes the credit
  amount from `plan_definitions.credits_granted` server-side — **not** from the
  client-submitted `amount_egp`. A student submitting a request with a forged
  amount gains nothing.
- **Output escaping: broadly correct.** 16 of 18 pages define and use `esc()`.
  The Owner Dashboard correctly escapes cross-tenant data. Only SEC-06 was
  unescaped.
- **`consume_credits` authorization: correct** (see the SEC-08 correction).
- **Dependency vulnerabilities: none.** There is no `package.json` and no npm
  dependency tree; the only third-party runtime code is the CDN assets in
  SEC-07. The Edge Function's imports are version-pinned
  (`std@0.177.0`, `supabase-js@2` via esm.sh).
- **`question_records` ownership:** already correctly scoped with
  `.eq('user_id', user.id)` on every lookup.

---

## 4. API security — `ai-tutor` v88

The Edge Function had authentication but no admission control: no rate limit, no
size cap, no content-type check, no method check, wildcard CORS, and a 500
handler that echoed `String(err)` — raw Postgres constraint and column names, and
Deno stack frames — to the caller.

v88 adds a gate ordered so the cheapest, most certain rejections come first, and
so nothing reaches OpenAI or the database until the caller has earned it:

| # | Check | Response |
|---|-------|----------|
| 1 | Preflight | `204` + CORS |
| 2 | Method is POST | `405` |
| 3 | Origin on allow-list | `403` |
| 4 | `Content-Type: application/json` | `415` |
| 5 | `Content-Length` ≤ 22 MB | `413` |
| 6 | Valid JWT | `401` |
| 7 | Rate limit (20/min, 200/hr per user) | `429` + `Retry-After` |
| 8 | Received bytes ≤ 22 MB, parses as a JSON object | `413` / `400` |
| 9 | Field shape and bounds | coerced |
| 10 | Session ownership (SEC-02) | `403` |

**Input handling.** Every caller-supplied field passes through explicit
coercion: strings are control-character-stripped and length-capped, all ids must
match a UUID pattern, `confidence` is clamped to 1–5. Unknown keys are never
read, so extra fields cannot be smuggled into any insert (mass assignment).

Two specific hardening choices are worth calling out:

- **`messages[].role` is constrained** to `user`/`assistant`/`system`, with
  anything else coerced to `user`. Previously the array was passed through
  as-is, letting a caller inject a forged `system` turn into the prompt.
- **Images must be inline `data:image/…;base64,` URLs.** Previously any string
  starting with `data:image/` passed. Accepting a remote URL here would have
  turned the vision call into a server-side request forgery primitive against
  internal endpoints.

**CORS enforcement is opt-in, and that is a deliberate trade.** With
`ALLOWED_ORIGINS` unset, the function keeps v87's permissive behaviour and logs
a warning; enforcement activates only once the variable is set. A fail-closed
default would mean anyone deploying v88 without first setting a Supabase secret
takes the tutor down for every student — precisely the outage class `DEPLOY.md`
exists to prevent, and this function is deployed by hand. The trade is
defensible because wildcard CORS *on this endpoint* is defence-in-depth rather
than a live exploit path: the only credential is a bearer JWT read from the
student's own `localStorage`, and a third-party page cannot read another
origin's `localStorage` to obtain one.

**→ `ALLOWED_ORIGINS` must be set for SEC-03's CORS hardening to do anything.
See `DEPLOY.md` §4.1.**

**Error responses** now return a stable machine code plus a correlation id;
the full exception, including the stack, stays in the logs behind that id.

**Regression coverage.** `tests/edge-security.test.mjs` slices the real shipped
security block out of `index.ts` and executes it — 52 assertions covering the
origin allow-list (including lookalike-suffix and scheme-downgrade rejection),
field coercion, UUID validation, the rate limiter, and handler wiring. Suite is
**17/17 green**.

---

## 5. Infrastructure recommendations

These are the deliverables that require account-level access and cannot be
committed to a repository.

### 5.1 WAF — Cloudflare (recommended over Cloud Armor here)

**Recommendation: Cloudflare WAF.** Cloud Armor is the stronger product when
the origin is GCP load-balanced, but this platform is static assets on Vercel
plus a Supabase-hosted Edge Function. Neither sits behind a GCLB, so adopting
Cloud Armor means first relocating the origin — a large architectural change
whose security benefit over Cloudflare is marginal for this workload.
Cloudflare sits in front of both by DNS with no re-architecture.

Deploy by pointing the apex and `www` at Cloudflare (proxied), then:

| Rule | Expression | Action |
|------|------------|--------|
| Admin surface lockdown | `http.request.uri.path in {"/admin.html" "/ai-monitor.html"}` and `not ip.src in $office_ips` | Block (or Access policy) |
| Auth brute force | `http.request.uri.path in {"/login.html" "/signup.html" "/reset-password.html"}` | Managed Challenge > 10/min/IP |
| Tutor abuse ceiling | `http.host eq "<ref>.supabase.co" and http.request.uri.path contains "/functions/v1/ai-tutor"` | Rate limit 30/min/IP |
| Payment submission | `http.request.uri.path eq "/manual-payment.html"` | Managed Challenge |
| Method restriction | `http.request.method in {"TRACE" "TRACK" "CONNECT"}` | Block |
| Body size | `http.request.body.size > 25000000` | Block |

Enable the **Cloudflare Managed Ruleset** and **OWASP Core Ruleset** at
paranoia level 1, raising to 2 after reviewing false positives for a week.

> Rate limiting at the WAF is keyed on IP, and the in-function limiter is keyed
> on user id. Both are needed: the WAF stops a distributed flood before it
> reaches Supabase and starts costing money; the in-function limiter stops one
> authenticated account abusing the tutor from many IPs.

**If Cloud Armor is required** (e.g. an existing GCP commitment): put a Global
External HTTPS Load Balancer in front of a Cloud Run or GCS origin, attach a
Cloud Armor policy with `preconfigured-waf rules` (`owasp-crs-v030301`), and use
`rate_based_ban` for the per-path limits above. Budget for the origin migration
as the main cost, not the WAF configuration.

### 5.2 DDoS protection

Vercel and Supabase both provide baseline network-layer (L3/L4) protection. The
gap is **L7 and cost-amplification**: the `ai-tutor` endpoint spends real money
per request, so an application-layer flood is a billing attack before it is an
availability attack. The June 2026 OpenAI quota-exhaustion incident
(`docs/incidents/2026-06-23-openai-quota-exhaustion.md`) is the precedent.

Layered posture, outermost first:

1. **Cloudflare** proxied DNS — absorbs L3/L4, provides "Under Attack" mode.
2. **WAF rate limits** (§5.1) — per-IP ceiling before requests reach Supabase.
3. **In-function limiter** (v88) — per-user ceiling, best-effort across isolates.
4. **Credits system** — the durable per-user economic ceiling, already enforced
   server-side by `consume_credits`. This is the real backstop against a
   *funded* attacker: they can only spend what they have bought.
5. **OpenAI spend cap** — a hard monthly limit on the OpenAI account, so no
   failure of layers 1–4 can produce an unbounded bill.

**Action:** set the OpenAI hard spend cap. It is the only control in this list
that is both trivially configurable and strictly bounds worst-case loss.

### 5.3 Bot protection

**Not yet implemented.** Supabase Auth has native CAPTCHA support, which is the
correct integration point — it enforces server-side inside the auth endpoint
rather than in client code that can be skipped.

1. Create a **Cloudflare Turnstile** site (preferred over reCAPTCHA: no Google
   data-sharing, better for an EU/EG audience, free at any volume).
2. Supabase Dashboard → Authentication → Settings → **Enable CAPTCHA
   protection**, provider Turnstile, paste the secret key.
3. Add the widget to `login.html`, `signup.html`, `reset-password.html` and pass
   the token:
   ```js
   await sb.auth.signInWithPassword({ email, password, options: { captchaToken } });
   ```

> Do steps 1–3 together. Enabling the dashboard toggle before the client sends a
> token makes **every login fail**. Deploy the client change first, verify the
> token is being sent, then flip the toggle.

Turnstile covers login, signup and password reset. `manual-payment.html` is the
remaining abuse-prone form and should be covered by the WAF challenge rule in
§5.1 rather than a second widget.

### 5.4 Rate limiting — target matrix

| Surface | Limit | Enforced where | Status |
|---------|-------|----------------|--------|
| AI chat / tutor | 20/min, 200/hr per user | Edge Function v88 | ✅ Live in code |
| AI chat (per IP) | 30/min | Cloudflare | ⏸ §5.1 |
| Login | 10/min per IP, then challenge | Cloudflare + Supabase Auth | ⏸ |
| Signup | 5/hr per IP | Cloudflare | ⏸ |
| Password reset | 3/hr per email | Supabase Auth (built-in) | ✅ Default |
| Email verification | 3/hr per email | Supabase Auth (built-in) | ✅ Default |
| OCR / image upload | Covered by the 22 MB cap + chat limit | Edge Function v88 | ✅ |
| Public APIs (PostgREST) | 100/min per IP | Cloudflare | ⏸ |
| Admin APIs | 300/min per IP + IP allow-list | Cloudflare | ⏸ |

### 5.5 Backups and disaster recovery

**Verify the current plan tier first** — daily backups with 7-day retention are
Pro-and-above; Free-tier projects have **no automatic backups at all**. This is
the single highest-value item to confirm, because every other control here
protects against compromise while this one protects against loss.

Target policy:

- **Daily automated backups**, 7-day retention minimum (Pro).
- **Point-in-time recovery (PITR)** — strongly recommended. Without it, recovery
  granularity is 24 hours; a destructive action at 09:00 loses a full day of
  student work. With PITR, recovery targets any second within the window.
- **Monthly off-platform export.** Backups living only in the provider that
  holds the primary is a single point of failure. `pg_dump` to encrypted
  object storage in a different account.

Recovery procedure (document, then rehearse):

1. Identify the target timestamp — for data corruption, the last known-good
   moment *before* the event.
2. Dashboard → Database → Backups → Restore, or PITR to the timestamp.
3. Supabase restores into a **new** project. Update `SUPABASE_URL` and keys in
   Vercel env and the Edge Function secrets.
4. Re-set Edge Function secrets — `OPENAI_API_KEY`, `ALLOWED_ORIGINS`.
5. Verify: row counts on `profiles`, `question_records`, `credit_transactions`;
   then a live smoke test per `DEPLOY.md` §6.

**Restore verification — the step that is always skipped.** Schedule a
quarterly restore drill into a scratch project. Confirm row counts, confirm a
student can sign in, confirm the tutor answers. An untested backup is a
hypothesis, not a recovery plan. Record the date and result of each drill.

**RPO/RTO targets:** RPO ≤ 1 hour with PITR (24 h without). RTO ≤ 4 hours,
dominated by the credential-rotation and DNS steps rather than the restore.

### 5.6 Logging and monitoring

v88 emits structured, greppable events with no PII — user ids are truncated to
8 characters and no question text, email or token is ever logged:

`auth-failure` · `blocked-origin` · `rate-limited` · `body-too-large` ·
`session-ownership-denied` · `unhandled-error` (with correlation id) ·
`idempotency-hit` · `profile-fetch-failed`

Recommended alerts (Supabase log drains → your alerting destination):

| Condition | Severity | Why |
|-----------|----------|-----|
| `session-ownership-denied` > 0 | **High** | Nothing legitimate triggers this. Active IDOR probing. |
| `blocked-origin` sustained | Medium | Either an attack or a missing origin after a domain change. |
| `rate-limited` > 50/hr for one user | Medium | Scripted abuse or a runaway client retry loop. |
| `auth-failure` spike from one IP | Medium | Credential stuffing. |
| `unhandled-error` rate > 1% | High | Regression or exploitation attempt. |
| Any write to `profiles.is_admin` | **Critical** | Post-SEC-01 tripwire — should only ever be service-role. |

That last one is worth implementing as an audit trigger: `role_audit_log`
already exists for role changes, and extending the same pattern to `is_admin`
would make any recurrence of SEC-01 immediately visible rather than silent.

---

## 6. OWASP Top 10 (2021) coverage

| Risk | Assessment | Findings |
|------|-----------|----------|
| **A01 Broken Access Control** | Was the platform's weakest area — three findings including the critical one. Now the best-covered. | SEC-01 ✅, SEC-02 ✅, SEC-04 ⏸, SEC-08 ⏸ |
| **A02 Cryptographic Failures** | Sound. TLS everywhere, HSTS added, no custom crypto, no secrets in the repo, publishable key correctly separated from service-role. | SEC-03 ✅ |
| **A03 Injection** | No SQL injection: all access is via PostgREST or parameterised plpgsql. One XSS sink found and fixed. Prompt injection is the live concern. | SEC-06 ✅, SEC-04 ⏸ |
| **A04 Insecure Design** | Credits provide a sound economic abuse ceiling; payment approval is server-authoritative. Upload trust model was wrong. | SEC-05 ✅ |
| **A05 Security Misconfiguration** | Was severe — zero security headers. Now comprehensive. Grant hygiene outstanding. | SEC-03 ✅, SEC-08 ⏸, SEC-10 📋 |
| **A06 Vulnerable Components** | No npm dependency tree. Sole exposure is the unpinned CDN asset. | SEC-07 ⚠️ |
| **A07 Auth Failures** | Supabase Auth: bcrypt, JWT rotation, secure session handling — all sound. Gaps are bot protection and leaked-password checking. | SEC-10 📋, §5.3 ⏸ |
| **A08 Integrity Failures** | The unpinned, unhashed CDN script is the one real gap. | SEC-07 ⚠️ |
| **A09 Logging Failures** | Was minimal and leaked exception detail to clients. Now structured, PII-free, correlation-id'd. Alerting outstanding. | §4 ✅, §5.6 ⏸ |
| **A10 SSRF** | Closed: images must be inline base64, so the vision call cannot be pointed at an arbitrary URL. | §4 ✅ |

---

## 7. Authentication audit

Authentication is handled entirely by Supabase Auth (GoTrue), which is the right
call — no custom credential handling was written, and none should be.

| Control | Status | Note |
|---------|--------|------|
| Password hashing | ✅ | bcrypt, managed |
| JWT signing / validation | ✅ | Validated server-side via `auth.getUser()` |
| Session expiry | ✅ | 1 h access token default |
| Refresh token rotation | ✅ | Enabled by default |
| Password reset flow | ✅ | Token-based, expiring, rate-limited |
| Email verification | ✅ | Built-in |
| Token storage | ⚠️ | `localStorage` — readable by XSS. Standard for the Supabase browser SDK and the reason SEC-06 and the CSP matter. |
| Brute-force protection | ⚠️ | Supabase rate limits exist; add the WAF challenge (§5.1) |
| Leaked password check | ❌ | SEC-10 — one toggle |
| CAPTCHA on auth | ❌ | §5.3 |
| MFA | ❌ | Not enabled. Worth it for **admin accounts specifically** — see §8. |
| Account takeover surface | ✅ | Closed with SEC-01; `is_admin` is no longer client-writable |

`CSRF` is not applicable to the token flows: authentication is a bearer token in
an `Authorization` header, not an ambient cookie, so a cross-site request cannot
authenticate itself. The v88 `Content-Type` restriction additionally removes the
endpoint from the set reachable by simple-request forgery.

---

## 8. Remaining recommendations

Ordered by value per unit of effort.

1. **Run `scripts/pin-cdn-sri.sh`** (SEC-07). Highest unresolved risk. ~10 min.
2. **Set `ALLOWED_ORIGINS`** (`DEPLOY.md` §4.1). Without it, v88's CORS work is
   inert. ~5 min.
3. **Enable leaked-password protection** (SEC-10). One toggle.
4. **Set an OpenAI hard spend cap.** Bounds the worst case of any abuse.
5. **Approve and apply SEC-04.** Closes platform-wide stored prompt injection.
6. **Confirm the backup tier and enable PITR** (§5.5). Protects against the one
   failure mode nothing else here covers.
7. **Deploy Cloudflare + WAF rules** (§5.1).
8. **Add Turnstile to auth pages** (§5.3), client change first.
9. **Approve and apply SEC-08.**
10. **Enable MFA for admin accounts.** With SEC-01 closed, a compromised admin
    password is now the shortest path to the same outcome that vulnerability
    offered. This is the natural successor control.
11. **Add an `is_admin` write tripwire** (§5.6) — makes any SEC-01 recurrence loud.
12. **Move XP/streak writes to an RPC** (SEC-09).
13. **Plan the `'unsafe-inline'` removal** (SEC-03): refactor 93 inline handlers
    to `addEventListener`, then drop it from `script-src`. Largest effort here,
    and it should be scheduled on its own.
14. **Server-side upload validation** (SEC-05): a storage trigger or an Edge
    Function that re-checks magic bytes, since client validation is bypassable.

---

## 9. Production readiness assessment

**Verdict: ready for production**, conditional on items 1–3 of §8, which
together take under half an hour.

The critical vulnerability is closed and verified. The platform's access-control
model is now sound at both layers that matter — policy *and* grant — and the
request boundary in front of the AI tutor is properly defended. What remains is
either configuration the repository cannot perform (WAF, CAPTCHA, backups,
toggles) or hardening that trades against availability and deserves its own
change window.

**What changed the risk profile most**, in order: closing SEC-01 (the platform
had no real authorization boundary while it was open); adding security headers
and a CSP; and closing the SEC-02 cross-tenant read.

**The most important thing to carry forward** is the lesson from SEC-01, because
it will recur: *RLS is not a complete access-control system.* It governs rows.
Column authority lives in `GRANT`, and Supabase's defaults grant everything.
Any table where users can write their own row needs both a policy and an
explicit column allow-list. The `profiles` grant is now fail-closed, so new
columns are safe by default — but the same audit is owed to every other
user-writable table.

---

## 10. Hardening checklist

**Applied to production**
- [x] `profiles` column-level write allow-list (SEC-01) — verified
- [x] `DELETE`/`TRUNCATE`/`TRIGGER`/`REFERENCES` revoked on `profiles`
- [x] `anon` write privileges on `profiles` removed entirely

**In code — ships on next deploy**
- [x] Session ownership validation (SEC-02)
- [x] CORS allow-list replacing wildcard (5 response paths)
- [x] POST-only, `Content-Type` and dual request-size enforcement
- [x] Per-user rate limiting with `Retry-After`
- [x] Field bounds, control-char stripping, UUID validation
- [x] `messages[].role` constrained; images restricted to inline base64 (SSRF)
- [x] Safe error envelope with correlation ids
- [x] CSP + 12 security headers (SEC-03)
- [x] Upload magic-byte validation (SEC-05)
- [x] XSS sink fixed + latent sink hardened (SEC-06)
- [x] 52-assertion security regression suite; 17/17 green

**Needs a decision or an account action**
- [ ] Run `scripts/pin-cdn-sri.sh` (SEC-07)
- [ ] Set `ALLOWED_ORIGINS`
- [ ] Enable leaked-password protection (SEC-10)
- [ ] OpenAI hard spend cap
- [ ] Approve SEC-04 migration
- [ ] Approve SEC-08 migration
- [ ] Confirm backup tier; enable PITR
- [ ] Cloudflare + WAF rules
- [ ] Turnstile on auth pages
- [ ] MFA for admin accounts
- [ ] `is_admin` write tripwire
- [ ] XP/streak writes via RPC (SEC-09)
- [ ] Schedule `'unsafe-inline'` removal
- [ ] Server-side upload validation

---

## 11. Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260727_profiles_column_privilege_hardening.sql` | **Applied.** SEC-01 |
| `supabase/migrations/PENDING_20260727_sec04_knowledge_base_write_lockdown.sql` | Staged. SEC-04 |
| `supabase/migrations/PENDING_20260727_sec08_rpc_grant_hygiene.sql` | Staged. SEC-08 |
| `supabase/functions/ai-tutor/index.ts` | v87 → v88 admission control, SEC-02 |
| `vercel.json` | SEC-03 headers + CSP |
| `manual-payment.html` | SEC-05 upload validation |
| `dashboard.html` | SEC-06 escaping |
| `devices.html` | Latent sink hardened |
| `scripts/pin-cdn-sri.sh` | **New.** SEC-07 tooling |
| `scripts/validate-ai-tutor-source.sh` | Size bound 190 → 210 KB for v88 |
| `tests/edge-security.test.mjs` | **New.** 52 assertions |
| `tests/run-all.mjs` | Registered the new suite |
| `DEPLOY.md` | §4.1 `ALLOWED_ORIGINS` |
| `SECURITY.md` | **New.** This report |

**Frozen files: unchanged.** `regenerate-reports.js`, `taxonomy.js`,
`exam-mistakes-logger.js`, `mock-exam.html`, `weakness.html` and `focus.html`
were audited under the security-fix unfreeze granted for this work. **No fix
was required in any of them** — `weakness.html` escapes topic labels correctly
via `esc()`/`escTopicLabel()` and its remaining interpolations are numeric or
drawn from closed sets; `mock-exam.html`'s only concatenated `innerHTML` is a
static string. The unfreeze went unused.
